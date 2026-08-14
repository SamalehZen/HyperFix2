import json
import os
import re
import shutil
from datetime import datetime

import pandas as pd

from . import config
from . import db
from . import report as report_mod
from . import compensation as comp_mod


def jour_today():
    return datetime.now().strftime("%Y-%m-%d")


def jour_from_filename(path):
    name = os.path.basename(path)
    m = re.search(r"(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})", name)
    if m:
        y, mo, d = (int(g) for g in m.groups())
    else:
        m = re.search(r"(\d{1,2})[-_.](\d{1,2})[-_.](\d{2,4})", name)
        if not m:
            return None
        d, mo, y = (int(g) for g in m.groups())
        if y < 100:
            y += 2000
    try:
        return datetime(y, mo, d).strftime("%Y-%m-%d")
    except ValueError:
        return None


def read_table(path):
    if path.lower().endswith(".csv"):
        for sep in (",", ";"):
            try:
                return pd.read_csv(path, sep=sep, dtype=str)
            except Exception:
                continue
        return pd.read_csv(path, sep=None, engine="python", dtype=str)
    xl = pd.ExcelFile(path)
    if config.SHEET_NAME not in xl.sheet_names:
        raise ValueError(f"Feuille '{config.SHEET_NAME}' introuvable. Feuilles présentes : {', '.join(xl.sheet_names)}")
    return pd.read_excel(path, sheet_name=config.SHEET_NAME, dtype=str)


def validate_file(path):
    try:
        df = read_table(path)
    except Exception as e:
        return None, f"Fichier illisible : {e}"
    missing = [c for c in config.REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        return None, f"Colonnes manquantes : {missing}"
    df = df[df["Code"].notna()]
    if df.empty:
        return None, "Aucun article avec un Code non vide"
    try:
        df["Code"] = df["Code"].astype(float).astype("int64")
    except Exception:
        return None, "La colonne Code contient des valeurs non numériques"
    dups = int(df["Code"].duplicated().sum())
    if dups:
        return None, f"{dups} codes en doublon"
    for col in df.columns:
        if df[col].dtype == object:
            df[col] = df[col].where(df[col].notna(), None)
    return df, None


def archive_file(path, jour, rayon):
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    ext = os.path.splitext(path)[1] or ".xlsx"
    dest_dir = config.rayon_imports_dir(rayon, jour)
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, f"{ts}_original{ext}")
    shutil.copy2(path, dest)
    h = db.sha256_file(path)
    return dest, h


def run_import(path, rayon=None, force_jour=None, baseline=False):
    path = config.map_nao_storage_path(path)
    rayon = rayon or config.rayon_from_path(path) or config.RAYON
    df, err = validate_file(path)
    h = db.sha256_file(path)
    if err:
        with db.lock_conn() as conn:
            db.create_import(conn, rayon, force_jour or jour_today(), os.path.basename(path), h, "erreur", message=err)
        return {"ok": False, "erreur": err, "rayon": rayon}

    jour = force_jour or jour_from_filename(path) or jour_today()
    archive_path, h = archive_file(path, jour, rayon)
    nb = int(len(df))

    with db.lock_conn() as conn:
        import_id = db.create_import(conn, rayon, jour, os.path.basename(path), h, "ok", nb_articles=nb, archive_path=archive_path)
        db.insert_snapshot(conn, import_id, rayon, jour, df)
        prev_id = db.get_previous_import(conn, import_id)
        if prev_id is None:
            resume = first_import_report(conn, import_id, rayon, jour, nb, archive_path)
        else:
            negatifs, anomalies, compared = full_analysis(conn, import_id, rayon, jour, df, prev_id, nb, archive_path)

    if prev_id is not None:
        resume = complete_analysis(import_id, rayon, jour, df, prev_id, nb, negatifs, anomalies, compared)

    rebuild_duckdb(df, rayon)
    return {"ok": True, "resume": resume, "rayon": rayon}


def first_import_report(conn, import_id, rayon, jour, nb, archive_path):
    negatifs = list_negatifs(conn, import_id)
    neg_ref = conn.execute(
        "SELECT code, libelle, stock FROM article_history WHERE import_id = ? AND stock < 0 ORDER BY stock",
        (import_id,),
    ).fetchall()
    neg_ref = [dict(r) for r in neg_ref]
    md_path, html_path, story_path = report_mod.write_report(conn, import_id, rayon, jour, nb, None, [], negatifs,
                                                             [], neg_ref, {}, [])
    resume = {
        "jour": jour, "nb_articles": nb, "baseline": True, "rayon": rayon,
        "nouveaux_negatifs": len(neg_ref), "persistants": 0, "corriges": 0, "anomalies": 0,
        "compensateurs_trouves": 0, "sans_compensateur": 0, "non_analyses": 0,
        "message": "Premier import : snapshot de base enregistré, aucune comparaison (pas de J-1). "
                   f"{len(neg_ref)} articles présents en stock négatif dans le fichier de référence.",
    }
    db.record_rapport(conn, import_id, rayon, jour, md_path, html_path, resume, chemin_story=story_path)
    return resume


def list_negatifs(conn, import_id):
    rows = conn.execute(
        "SELECT * FROM negatifs_journaliers WHERE import_id = ? AND statut != 'corrige' ORDER BY priorite DESC, code",
        (import_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def full_analysis(conn, import_id, rayon, jour, df, prev_id, nb, archive_path):
    cur = db.load_snapshot(conn, import_id)
    prev = db.load_snapshot(conn, prev_id)

    compared = []
    for code, r in cur.items():
        p = prev.get(code)
        stock_j = r["stock"]
        stock_j1 = p["stock"] if p else None
        variation = None
        if stock_j is not None and stock_j1 is not None:
            variation = round(stock_j - stock_j1, 3)
        compared.append({
            "code": code, "row_j": r, "row_j1": p,
            "stock_j": stock_j, "stock_j1": stock_j1, "variation": variation,
        })

    negative_codes = [c["code"] for c in compared if c["stock_j"] is not None and c["stock_j"] < 0]
    history = db.load_history_for_codes(conn, import_id, negative_codes)

    negatifs = []
    for c in compared:
        stock_j1, stock_j = c["stock_j1"], c["stock_j"]
        if stock_j is None:
            continue
        statut, priorite = None, None
        if stock_j < 0:
            if stock_j1 is None or stock_j1 >= 0:
                statut, priorite = "nouveau", priorite_nouveau(c)
            else:
                if stock_j < stock_j1:
                    statut, priorite = "persistant_aggrave", "critique"
                elif stock_j > stock_j1:
                    statut, priorite = "persistant_ameliore", "surveiller"
                else:
                    statut, priorite = "persistant_stable", "important"
        elif stock_j1 is not None and stock_j1 < 0:
            statut, priorite = "corrige", "corrige"
        if statut is None:
            continue
        hist = history.get(c["code"], [])
        jours_cons = consecutive_negatives(hist) + (1 if stock_j < 0 else 0)
        hist_neg = [r for r in hist if r["stock"] is not None and r["stock"] < 0]
        premiere = hist_neg[0]["jour"] if hist_neg else jour
        nb_occ = occurrences(hist, stock_j < 0)
        db.record_negatif(conn, import_id, rayon, jour, c["code"], stock_j1, stock_j, c["variation"],
                          statut, jours_cons, premiere, nb_occ, priorite)
        if statut != "corrige":
            negatifs.append({
                "code": c["code"], "libelle": c["row_j"]["libelle"],
                "stock_j1": stock_j1, "stock_j": stock_j, "variation": c["variation"],
                "px_revient": c["row_j"]["px_revient"], "px_vente": c["row_j"]["px_vente"],
                "couv": c["row_j"]["couv"], "statut": statut, "priorite": priorite,
                "jours_consecutifs": jours_cons, "premiere_apparition": premiere,
                "nb_occurrences": nb_occ,
            })

    anomalies = detect_anomalies(conn, import_id, rayon, jour, compared)

    prio_order = {"critique": 0, "important": 1, "surveiller": 2}
    negatifs.sort(key=lambda n: (prio_order.get(n["priorite"], 3), n["statut"] != "nouveau", n["code"]))
    llm_scope = negatifs[:config.MAX_LLM_ARTICLES]
    llm_scope_codes = {n["code"] for n in llm_scope}
    for n in negatifs:
        n["llm_analyse"] = n["code"] in llm_scope_codes

    return negatifs, anomalies, compared


def complete_analysis(import_id, rayon, jour, df, prev_id, nb, negatifs, anomalies, compared):
    llm_scope = [n for n in negatifs if n["llm_analyse"]]
    compensations = {}
    llm_error = None
    if llm_scope:
        try:
            compensations = comp_mod.compensate(df, sorted(n["code"] for n in llm_scope),
                                                [n["libelle"] for n in llm_scope])
        except Exception as e:
            llm_error = str(e)

    with db.lock_conn() as conn:
        for code, results in compensations.items():
            db.record_compensations(conn, import_id, rayon, jour, code, results)

    for n in negatifs:
        res = compensations.get(n["code"], [])
        n["compensateurs"] = res
        n["aucun"] = not res
        if res:
            best = res[0]
            n["compensateur_code"] = best.get("code")
            n["compensateur_libelle"] = best.get("libelle")
            n["compensateur_px_revient"] = best.get("px_revient")
            n["compensateur_couv"] = best.get("couv")
            n["confiance"] = best.get("confiance")
            n["justification"] = best.get("justification")
        else:
            n["confiance"] = "aucun"
            n["justification"] = "Aucun compensateur trouvé"

    with db.lock_conn() as conn:
        md_path, html_path, story_path = report_mod.write_report(
            conn, import_id, rayon, jour, nb, prev_id, negatifs, list_negatifs(conn, import_id),
            anomalies, compared, {"llm_error": llm_error}, compensations,
        )
        resume = {
            "jour": jour, "nb_articles": nb, "baseline": False, "rayon": rayon,
            "nouveaux_negatifs": len([n for n in negatifs if n["statut"] == "nouveau"]),
            "persistants": len([n for n in negatifs if n["statut"].startswith("persistant")]),
            "corriges": len([n for n in compared if n["stock_j1"] is not None and n["stock_j1"] < 0 and (n["stock_j"] or 0) >= 0]),
            "anomalies": len(anomalies),
            "compensateurs_trouves": len([n for n in negatifs if n["llm_analyse"] and any(c.get("code") for c in n["compensateurs"])]),
            "sans_compensateur": len([n for n in negatifs if n["llm_analyse"] and not any(c.get("code") for c in n["compensateurs"])]),
            "non_analyses": len([n for n in negatifs if not n["llm_analyse"]]),
            "critiques": len([n for n in negatifs if n["priorite"] == "critique"]),
            "importants": len([n for n in negatifs if n["priorite"] == "important"]),
            "llm_error": llm_error,
        }
        db.record_rapport(conn, import_id, rayon, jour, md_path, html_path, resume, chemin_story=story_path)
    return resume


def priorite_nouveau(c):
    variation = c["variation"]
    stock_j = c["stock_j"]
    if variation is not None and variation <= -10 or (stock_j is not None and stock_j <= -10):
        return "critique"
    return "important"


def consecutive_negatives(hist):
    count = 0
    for r in reversed(hist):
        if r["stock"] is not None and r["stock"] < 0:
            count += 1
        else:
            break
    return count


def occurrences(hist, current_negative):
    evts = 0
    prev_neg = False
    for r in hist:
        neg = r["stock"] is not None and r["stock"] < 0
        if neg and not prev_neg:
            evts += 1
        prev_neg = neg
    if current_negative and not prev_neg:
        evts += 1
    return evts


def detect_anomalies(conn, import_id, rayon, jour, compared):
    anomalies = []
    for c in compared:
        stock_j, stock_j1, variation = c["stock_j"], c["stock_j1"], c["variation"]
        neg = stock_j is not None and stock_j < 0
        if not neg and variation is not None:
            if variation <= -config.CHUTE_SEUIL:
                desc = f"Chute forte du stock ({stock_j1} → {stock_j})"
                anomalies.append((c["code"], "chute_forte", desc, stock_j1, stock_j))
            elif variation >= config.HAUSSE_SEUIL:
                desc = f"Hausse forte du stock ({stock_j1} → {stock_j})"
                anomalies.append((c["code"], "hausse_forte", desc, stock_j1, stock_j))
        r = c["row_j"]
        marge = r["marge_pct"]
        if marge is not None and marge < 0:
            desc = f"Marge négative ({marge}%)"
            anomalies.append((c["code"], "marge_negative", desc, None, marge))
        pv = r["px_vente"]
        pv_promo = r["pv_promo"]
        if pv is not None and pv_promo is not None and pv_promo < pv:
            desc = f"Prix promo ({pv_promo}) inférieur au prix de vente ({pv})"
            anomalies.append((c["code"], "promo_active", desc, pv, pv_promo))
    seen = set()
    for code, type_, desc, v1, vj in anomalies:
        key = (code, type_)
        if key in seen:
            continue
        seen.add(key)
        db.record_anomalie(conn, import_id, rayon, jour, code, type_, desc, v1, vj)
    return [{"code": c, "type": t, "description": d, "valeur_j1": v1, "valeur_j": vj} for c, t, d, v1, vj in anomalies]


def rebuild_duckdb(df, rayon=None):
    import duckdb

    path = os.path.join(config.NAO_PROJECT_DIR, "gamme.duckdb")
    tmp = path + ".tmp"
    if os.path.exists(tmp):
        os.remove(tmp)
    con = duckdb.connect(tmp)
    con.register("t", df)
    con.execute("CREATE TABLE gamme_commande AS SELECT *, ? AS rayon FROM t", [rayon or config.RAYON])
    con.close()
    os.replace(tmp, path)
    return path
