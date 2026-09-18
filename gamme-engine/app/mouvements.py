"""Mouvements journaliers (film du rayon) — lot 1 : ingestion + validation.

Flux gamme JAMAIS touché : module dédié, table `mouvement_imports` séparée,
routeur par nom de fichier (voir main.py / mcp_server.py).
"""
import json
import os
import re
import shutil
import sqlite3
import unicodedata
from datetime import datetime, timedelta

from . import config
from . import db

_TYPES_CACHE = None

# Paires ANNUL. -> code de base : sens attendu = opposé (garde croisée).
ANNUL_DE = {
    "11": "10", "16": "15", "21": "20", "26": "25", "31": "30", "36": "35",
    "41": "40", "46": "45", "51": "50", "56": "55", "61": "60", "66": "65",
}

_DATE_MVT_RE = re.compile(r"^(\d{2})/(\d{2})/(\d{4})$")


def load_types():
    """Mapping code -> {famille, sous_type, note} depuis types_mouvements.json."""
    global _TYPES_CACHE
    if _TYPES_CACHE is None:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "types_mouvements.json")
        with open(path, encoding="utf-8") as f:
            _TYPES_CACHE = {k: v for k, v in json.load(f).items() if isinstance(v, dict)}
    return _TYPES_CACHE


def is_mouvement_filename(path) -> bool:
    name = unicodedata.normalize(
        "NFKD", os.path.basename(path or "").lower()
    )
    name = "".join(c for c in name if not unicodedata.combining(c))
    name = re.sub(r"[\s_]+", "", name)
    return config.MOUVEMENT_FILE_HINT in name and name.endswith((".xlsx", ".xlsm"))


def normalize_code_mvt(value):
    """Toujours TEXTE : '15.0'/'15' -> '15', 'sm' -> 'SM'. None si vide."""
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, float) and value != value:
        return None
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return None
    try:
        return str(int(float(text)))
    except ValueError:
        return text.upper()


def parse_jour_mvt(value):
    """'13/09/2026' -> '2026-09-13'. None si vide/'nan'."""
    if value is None:
        return None
    if isinstance(value, float) and value != value:
        return None
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return None
    m = _DATE_MVT_RE.match(text)
    if not m:
        return "INVALIDE:" + text
    d, mo, y = (int(g) for g in m.groups())
    try:
        return datetime(y, mo, d).strftime("%Y-%m-%d")
    except ValueError:
        return "INVALIDE:" + text


def _norm_col(c):
    return re.sub(r"\.\d+$", "", str(c))


def read_mouvements(path):
    import pandas as pd

    try:
        xl = pd.ExcelFile(path)
    except Exception as e:
        raise ValueError(f"Fichier illisible : {e}")
    sheet = config.MOUVEMENT_SHEET if config.MOUVEMENT_SHEET in xl.sheet_names else xl.sheet_names[0]
    df = pd.read_excel(path, sheet_name=sheet, dtype=str)
    df.attrs["mouvement_sheet"] = sheet
    return df


def validate_mouvements(df):
    """Retourne (df_clean, meta). meta = {erreurs, avertissements, compteurs}.
    Les lignes sans Code (dont TOTAL) sont exclues ; les lignes sans date
    sont rejetées proprement ; les types inconnus/inutilisés sont CONSERVÉS
    et signalés (jamais de traitement silencieux)."""
    erreurs, warnings = [], []
    cols = [_norm_col(c) for c in df.columns]
    if cols != config.MOUVEMENT_REQUIRED_COLUMNS:
        manq = [c for c in config.MOUVEMENT_REQUIRED_COLUMNS if c not in cols]
        surpl = [c for c in cols if c not in config.MOUVEMENT_REQUIRED_COLUMNS]
        return None, {
            "erreurs": [f"Colonnes inattendues (manquantes={manq}, en trop={surpl})"],
            "avertissements": [], "compteurs": {},
        }
    df.columns = config.MOUVEMENT_REQUIRED_COLUMNS
    # 'PRMP' figure 2 fois (positions 7 et 15) : accès scalaire impossible en
    # doublon — on lève l'ambiguïté en positionnel + contrôle d'écart honnête.
    cols = list(df.columns)
    cols[15] = "PRMP_doublon"
    df.columns = cols

    types = load_types()
    nb_vides = 0
    nb_sans_date = 0
    lignes = []
    for _, r in df.iterrows():
        prmp = db.num(r["PRMP"])
        prmp2 = db.num(r["PRMP_doublon"])
        if prmp is not None and prmp2 is not None and round(prmp, 3) != round(prmp2, 3):
            warnings.append(f"PRMP doublé incohérent (article {str(r['Code']).strip()})")
        code_txt = str(r["Code"]).strip() if r["Code"] is not None and str(r["Code"]).strip().lower() != "nan" else ""
        if not code_txt:
            nb_vides += 1
            continue
        try:
            code = int(float(code_txt))
        except ValueError:
            erreurs.append(f"Code non entier : {code_txt!r}")
            continue
        cm = normalize_code_mvt(r["Code mvt"])
        if not cm:
            erreurs.append(f"Code mvt vide (article {code})")
            continue
        sens = str(r["Sens"]).strip() if r["Sens"] is not None else ""
        if sens not in ("+", "-"):
            erreurs.append(f"Sens invalide {sens!r} (article {code}, mvt {cm}) — attendu + ou -")
            continue
        try:
            qte = float(str(r["Qté UC"]).strip())
        except (ValueError, AttributeError):
            erreurs.append(f"Qté UC illisible {r['Qté UC']!r} (article {code}, mvt {cm})")
            continue
        jour = parse_jour_mvt(r["Date mvt"])
        if jour is None:
            nb_sans_date += 1
            continue
        if jour.startswith("INVALIDE:"):
            erreurs.append(f"Date mvt inattendue {r['Date mvt']!r} (article {code})")
            continue
        t = types.get(cm)
        if t is None:
            warnings.append(f"Type inconnu {cm!r} (article {code}) — conservé, à classer")
            famille, sous_type = "type_inconnu", None
        else:
            famille, sous_type = t["famille"], t.get("sous_type")
            if famille == "inutilise":
                warnings.append(f"Code réputé inutilisé {cm!r} apparu (article {code})")
        lignes.append({
            "code": code, "libelle": db.clean_str(r["Libellé"]),
            "classification": db.clean_str(r["Classification"]),
            "code_mvt": cm, "libelle_mvt": db.clean_str(r["Libellé mvt"]),
            "type_normalise": famille, "sous_type": sous_type,
            "document": db.clean_str(r["Document d'origine"]),
            "quantite": qte, "sens": sens,
            "quantite_signee": qte if sens == "+" else -qte,
            "prmp": db.num(r["PRMP"]), "valeur_fichier": db.num(r["Valeur"]),
            "stock_apres": db.num(r["Qte. apres  mouvement."]),
            "jour": jour,
            "heure_mvt": db.clean_str(r["Heure mvt"]),
            "heure_creation": db.clean_str(r["Heure création"]),
            "dernier_pr": db.num(r["Dernier PR"]), "dernier_pamp": db.num(r["Dernier PAMP"]),
            "dernier_pa": db.num(r["Dernier PA"]),
            "stock_physique": db.num(r["Q Phys.  Stock"]),
            "date_dernier_comptage": db.clean_str(r["Date der. compt."]),
            "qte_dernier_comptage": db.num(r["Q der.  compt."]),
            "date_dernier_inv": db.clean_str(r["Date der. inv. compt."]),
            "qte_dernier_inv": db.num(r["Q der. inv.  compt."]),
            "date_derniere_entree": db.clean_str(r["Date der. entrée"]),
            "date_derniere_sortie": db.clean_str(r["Date der. sortie"]),
        })
    if erreurs:
        return None, {"erreurs": erreurs[:8], "avertissements": warnings[:8], "compteurs": {}}

    # Garde croisée ANNUL. : sens attendu = opposé du code de base (warning).
    sens_par_code = {}
    for l in lignes:
        sens_par_code.setdefault(l["code_mvt"], set()).add(l["sens"])
    for annul, base in ANNUL_DE.items():
        if annul in sens_par_code and base in sens_par_code:
            if sens_par_code[annul] == sens_par_code[base]:
                warnings.append(
                    f"Sens suspect : {annul} (ANNUL.) a le même sens que {base} "
                    f"({sorted(sens_par_code[base])}) — opposé attendu"
                )

    # Tri chronologique (le fichier n'est pas trié) pour chaîner stock_apres.
    lignes.sort(key=lambda l: (l["jour"], l["heure_mvt"] or ""))
    if nb_vides:
        warnings.append(f"{nb_vides} ligne(s) sans Code ignorée(s) (dont TOTAL)")
    if nb_sans_date:
        warnings.append(f"{nb_sans_date} ligne(s) sans date rejetée(s)")
    jours = sorted({l["jour"] for l in lignes})
    meta = {
        "erreurs": [], "avertissements": warnings,
        "compteurs": {
            "nb_lignes": len(lignes), "nb_articles": len({l["code"] for l in lignes}),
            "jours": jours, "nb_vides": nb_vides, "nb_sans_date": nb_sans_date,
        },
    }
    return lignes, meta


def jour_from_mouvements(lignes):
    jours = sorted({l["jour"] for l in lignes})
    return jours[0] if len(jours) == 1 else None


def archive_mouvement(path, jour, rayon):
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    ext = os.path.splitext(path)[1] or ".xlsx"
    dest_dir = config.rayon_imports_dir(rayon, jour)
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, f"{ts}_mouvement_original{ext}")
    shutil.copy2(path, dest)
    return dest, db.sha256_file(path)


def run_mouvement_import(path, rayon=None):
    """Ingestion seule (lot 1). Réconciliation = phase B (reconcile_jour)."""
    from . import pipeline as _pl  # import local : évite tout cycle au boot

    path = config.map_nao_storage_path(path)
    rayon = rayon or config.rayon_from_path(path) or config.RAYON
    try:
        df = read_mouvements(path)
    except ValueError as e:
        h = db.sha256_file(path)
        with db.lock_conn() as conn:
            if db.mouvement_import_by_hash(conn, h, rayon) is None:
                db.create_mouvement_import(conn, rayon, _pl.jour_today(),
                                           os.path.basename(path), h, "erreur", message=str(e))
        return {"ok": False, "erreur": str(e), "rayon": rayon}
    lignes, meta = validate_mouvements(df)
    h = db.sha256_file(path)
    if lignes is None:
        err = "; ".join(meta["erreurs"])
        with db.lock_conn() as conn:
            if db.mouvement_import_by_hash(conn, h, rayon) is None:
                db.create_mouvement_import(conn, rayon, _pl.jour_today(),
                                           os.path.basename(path), h, "erreur", message=err)
        return {"ok": False, "erreur": err, "rayon": rayon}

    with db.lock_conn() as conn:
        info = db.mouvement_import_by_hash(conn, h, rayon)
        if info is not None:
            iid, statut, resume_json = info
            if statut == "erreur":
                return {"ok": False, "erreur": "Fichier déjà refusé lors d'un passage précédent", "rayon": rayon}
            if statut == "ok" and resume_json:
                resume = json.loads(resume_json)
                resume["deja_importe"] = True
                return {"ok": True, "resume": resume, "rayon": rayon}

    jour = jour_from_mouvements(lignes)
    if jour is None:
        jours = sorted({l["jour"] for l in lignes})
        with db.lock_conn() as conn:
            db.create_mouvement_import(conn, rayon, jours[0] if jours else _pl.jour_today(),
                                       os.path.basename(path), h, "erreur",
                                       message=f"Fichier multi-dates non supporté : {jours}")
        return {"ok": False, "erreur": f"Fichier multi-dates non supporté : {jours}", "rayon": rayon}

    archive_path, h = archive_mouvement(path, jour, rayon)
    import_id = None
    try:
        with db.lock_conn() as conn:
            import_id = db.create_mouvement_import(
                conn, rayon, jour, os.path.basename(path), h, "ok",
                nb_mouvements=len(lignes), archive_path=archive_path)
            rows = [(
                import_id, jour, rayon, l["code"], l["libelle"], l["classification"],
                l["code_mvt"], l["libelle_mvt"], l["type_normalise"], l["sous_type"],
                l["document"], l["quantite"], l["sens"], l["quantite_signee"],
                l["prmp"], l["valeur_fichier"], l["stock_apres"], l["heure_mvt"],
                l["heure_creation"], l["dernier_pr"], l["dernier_pamp"], l["dernier_pa"],
                l["stock_physique"], l["date_dernier_comptage"], l["qte_dernier_comptage"],
                l["date_dernier_inv"], l["qte_dernier_inv"], l["date_derniere_entree"],
                l["date_derniere_sortie"], os.path.basename(path), h,
            ) for l in lignes]
            db.insert_mouvements(conn, import_id, rayon, jour, rows)
    except sqlite3.IntegrityError:
        with db.lock_conn() as conn:
            exist = conn.execute(
                "SELECT statut FROM mouvement_imports WHERE rayon = ? AND jour = ?",
                (rayon, jour),
            ).fetchone()
        statut_exist = exist["statut"] if exist else "?"
        return {"ok": False,
                "erreur": f"Journée {jour} déjà importée pour ce rayon (statut existant : {statut_exist})",
                "rayon": rayon}
    except Exception as e:
        if import_id is not None:
            with db.lock_conn() as conn:
                db.set_mouvement_import_statut(conn, import_id, "erreur", f"Import interrompu : {e}")
        return {"ok": False, "erreur": f"Import interrompu : {e}", "rayon": rayon}

    compteur_familles = {}
    for l in lignes:
        compteur_familles[l["type_normalise"]] = compteur_familles.get(l["type_normalise"], 0) + 1
    resume = {
        "jour": jour, "rayon": rayon, "nb_mouvements": len(lignes),
        "nb_articles": len({l["code"] for l in lignes}),
        "familles": compteur_familles,
        "avertissements": meta["avertissements"],
        "message": f"Mouvements du {jour} importés : {len(lignes)} lignes, "
                   f"{len({l['code'] for l in lignes})} articles.",
    }
    with db.lock_conn() as conn:
        db.set_mouvement_import_statut(conn, import_id, "ok", resume["message"], resume=resume)
    # Phase B — réconciliation. Jamais bloquante : un échec n'invalide pas
    # l'ingestion (signalé honnêtement dans le résumé).
    try:
        with db.lock_conn() as conn:
            _, couverture = reconcile_jour(conn, rayon, jour)
        resume["reconciliation"] = couverture
        with db.lock_conn() as conn:
            db.set_mouvement_import_statut(conn, import_id, "ok", resume["message"], resume=resume)
    except Exception as e:
        resume["reconciliation"] = {"statut": f"non calculée : {e}"}
    # Phase C — indicateurs (même discipline : jamais bloquants).
    try:
        with db.lock_conn() as conn:
            resume["indicateurs"] = indicateurs_jour(conn, rayon, jour)
        with db.lock_conn() as conn:
            db.set_mouvement_import_statut(conn, import_id, "ok", resume["message"], resume=resume)
    except Exception as e:
        resume["indicateurs"] = {"statut": f"non calculés : {e}"}
    return {"ok": True, "resume": resume, "rayon": rayon}


def _jour_suivant(jour):
    y, mo, d = (int(x) for x in jour.split("-"))
    return (datetime(y, mo, d) + timedelta(days=1)).strftime("%Y-%m-%d")


def _parse_dbt(dbt):
    if not dbt or str(dbt).strip().lower() in ("", "nan"):
        return None
    try:
        d, mo, y = (int(x) for x in str(dbt).strip().split("/"))
        return datetime(y, mo, d).date().isoformat()
    except (ValueError, AttributeError):
        return None


def _prix_applicable(g, jour):
    """Prix applicable (promo si dates actives, sinon vente). None si inconnu."""
    pv, pp = g.get("px_vente"), g.get("pv_promo")
    if (pp or 0) > 0:
        dbt, dfn = _parse_dbt(g.get("date_dbt")), _parse_dbt(g.get("date_fin"))
        if dbt and dbt <= jour and (dfn is None or dfn >= jour):
            return pp, True
    return (pv if (pv or 0) > 0 else None), False


def indicateurs_jour(conn, rayon, jour):
    """Phase C — CA, marge, rotation, démarque, prix achat, promo, dormants.

    Lecture seule (+ aucun write) : les chiffres sont renvoyés pour le résumé.
    Hypothèse actée : en période promo, tout part au prix promo."""
    gamme = db.get_gamme_stock_map(conn, db.get_gamme_import_for_jour(conn, rayon, jour) or -1)
    rows = conn.execute(
        "SELECT * FROM mouvements WHERE rayon = ? AND jour = ?", (rayon, jour)).fetchall()

    ca = cout = ca_promo = 0.0
    top_ventes, sans_prix = [], 0
    démarque = {}
    livraisons = {"qte": 0.0, "valeur": 0.0}
    prix_delta = []
    for r in rows:
        r = dict(r)
        fam = r["type_normalise"]
        g = gamme.get(r["code"], {})
        if r["dernier_pr"] and r["prmp"] and round(r["dernier_pr"], 3) != round(r["prmp"], 3):
            prix_delta.append({"code": r["code"], "libelle": r["libelle"],
                               "dernier_pr": r["dernier_pr"], "prmp": r["prmp"],
                               "delta": round(r["dernier_pr"] - r["prmp"], 3)})
        if fam == "vente":
            pap, en_promo = _prix_applicable(g, jour)
            pr = g.get("px_revient") or r["prmp"] or 0
            if pap is None:
                sans_prix += 1
                continue
            ligne_ca = r["quantite"] * pap
            ca += ligne_ca
            cout += r["quantite"] * pr
            if en_promo:
                ca_promo += ligne_ca
            top_ventes.append({"code": r["code"], "libelle": r["libelle"],
                               "qte": r["quantite"], "ca": round(ligne_ca, 2),
                               "promo": en_promo})
        elif fam == "demarque":
            st = r["sous_type"] or "autre"
            d = démarque.setdefault(st, {"qte": 0.0, "valeur": 0.0})
            d["qte"] += r["quantite"]
            d["valeur"] += round(r["valeur_fichier"] or 0, 2)
        elif fam == "livraison":
            livraisons["qte"] += r["quantite"]
            livraisons["valeur"] += round(r["valeur_fichier"] or 0, 2)
    top_ventes.sort(key=lambda x: x["qte"], reverse=True)
    for t in top_ventes:
        st = (gamme.get(t["code"], {}).get("stock") or 0)
        t["rotation_jour"] = round(t["qte"] / st, 4) if st > 0 else None
    prix_delta.sort(key=lambda x: abs(x["delta"]), reverse=True)

    dormants = _dormants(conn, rayon, jour, gamme)
    return {
        "ca": round(ca, 2), "cout": round(cout, 2),
        "marge_encaissee": round(ca - cout, 2),
        "marge_pct": round(100 * (ca - cout) / ca, 2) if ca else None,
        "ca_promo": round(ca_promo, 2), "ventes_sans_prix": sans_prix,
        "top_ventes": top_ventes[:10], "nb_articles_vendus": len(top_ventes),
        "demarque": démarque, "livraisons": livraisons,
        "prix_delta": prix_delta[:20], "dormants": dormants,
    }


def _dormants(conn, rayon, jour, gamme):
    """Dormants prouvés (§6bis) : réveil SM uniquement, stock nul exclu,
    niveaux estime/partiel/prouve. Jour sans fichier ≠ 0 vente (couverture)."""
    seuil = config.DORMANT_JOURS
    j0 = datetime.strptime(jour, "%Y-%m-%d").date()
    jours_data = [r["jour"] for r in conn.execute(
        "SELECT DISTINCT jour FROM mouvements WHERE rayon = ? AND jour <= ? ORDER BY jour",
        (rayon, jour)).fetchall()]
    nb_jours_data = len(jours_data)
    dernier_sm = {}
    for r in conn.execute(
            "SELECT code, MAX(jour) AS d FROM mouvements "
            "WHERE rayon = ? AND jour <= ? AND type_normalise = 'vente' GROUP BY code",
            (rayon, jour)).fetchall():
        dernier_sm[r["code"]] = r["d"]
    prouves, partiels, estimes, faux, caches = [], [], [], [], []
    for code, g in gamme.items():
        stock = g.get("stock") or 0
        if stock <= 0:
            continue
        d = dernier_sm.get(code)
        cap = round(stock * (g.get("px_revient") or 0), 2)
        item = {"code": code, "libelle": g.get("libelle"), "stock": stock,
                "capital": cap, "dernier_vente": d}
        if d is None:
            if (g.get("couv") or 0) == 999:
                item["niveau"] = "estime"
                estimes.append(item)
            else:
                item["niveau"] = "partiel"
                item["jours_sans_vente"] = nb_jours_data
                partiels.append(item)
            continue
        gap = (j0 - datetime.strptime(d, "%Y-%m-%d").date()).days
        item["jours_sans_vente"] = gap
        if gap >= seuil:
            item["niveau"] = "prouve"
            prouves.append(item)
            if (g.get("couv") or 0) != 999:
                caches.append(item)
        elif gap > 0:
            item["niveau"] = "partiel"
            partiels.append(item)
            if (g.get("couv") or 0) == 999:
                faux.append(item)
    keycap = lambda x: x["capital"]
    prouves.sort(key=keycap, reverse=True)
    return {
        "seuil_jours": seuil, "jours_donnees": nb_jours_data,
        "nb_prouves": len(prouves), "nb_partiels": len(partiels),
        "nb_estimes": len(estimes),
        "capital_prouve": round(sum(x["capital"] for x in prouves), 2),
        "top_prouves": prouves[:50],
        "faux_dormants": sorted(faux, key=keycap, reverse=True)[:50],
        "dormants_caches": sorted(caches, key=keycap, reverse=True)[:50],
    }


def reconcile_jour(conn, rayon, jour):
    """Phase B — équation stock[J] + Σ(signées[J]) = stock[J+1].

    Retourne (lignes_ecart, couverture). Les écarts sont enregistrés en
    `anomalies` (type ecart_mouvement) rattachées à l'import gamme J+1 si
    présent. Ne touche JAMAIS aux tables gamme (lecture seule + anomalies).
    """
    imp_j = db.get_gamme_import_for_jour(conn, rayon, jour)
    jour_suiv = _jour_suivant(jour)
    imp_j1 = db.get_gamme_import_for_jour(conn, rayon, jour_suiv)
    couverture = {
        "jour": jour, "gamme_j": imp_j is not None, "gamme_j1": imp_j1 is not None,
    }
    if imp_j is None or imp_j1 is None:
        couverture["statut"] = "mouvements_sans_gamme" if imp_j is None and imp_j1 is None else (
            "gamme_j_manquante" if imp_j is None else "gamme_j1_manquante")
        return [], couverture
    stock_j = {r["code"]: (r["stock"] or 0) for r in
               conn.execute("SELECT code, stock FROM article_history WHERE import_id = ?", (imp_j,)).fetchall()}
    stock_j1 = {r["code"]: (r["stock"] or 0) for r in
                conn.execute("SELECT code, stock FROM article_history WHERE import_id = ?", (imp_j1,)).fetchall()}
    net = {}
    for r in conn.execute(
            "SELECT code, quantite_signee FROM mouvements WHERE rayon = ? AND jour = ?",
            (rayon, jour)).fetchall():
        net[r["code"]] = net.get(r["code"], 0) + (r["quantite_signee"] or 0)
    ecarts = []
    for code in set(stock_j) | set(stock_j1) | set(net):
        attendu = (stock_j.get(code) or 0) + net.get(code, 0)
        constate = stock_j1.get(code)
        if constate is None:
            continue  # article sorti de la gamme : pas un écart mouvements
        ecart = round((constate or 0) - attendu, 3)
        if ecart:
            lib = conn.execute(
                "SELECT libelle FROM article_history WHERE import_id = ? AND code = ?",
                (imp_j1, code)).fetchone()
            ecarts.append({
                "code": code, "libelle": (lib["libelle"] if lib else None),
                "stock_j": stock_j.get(code, 0), "net_mouvements": round(net.get(code, 0), 3),
                "attendu": round(attendu, 3), "constate": constate, "ecart": ecart,
            })
    ecarts.sort(key=lambda e: abs(e["ecart"]), reverse=True)
    for e in ecarts:
        db.record_anomalie(conn, imp_j1, rayon, jour_suiv, e["code"], "ecart_mouvement",
                           f"Écart inexpliqué {e['ecart']} ({jour} : {e['stock_j']} + ({e['net_mouvements']}) = {e['attendu']} attendu, {e['constate']} constaté)",
                           e["attendu"], e["constate"])
    couverture["statut"] = "reconcilié" if not ecarts else f"{len(ecarts)} écart(s)"
    couverture["nb_ecarts"] = len(ecarts)
    return ecarts, couverture
