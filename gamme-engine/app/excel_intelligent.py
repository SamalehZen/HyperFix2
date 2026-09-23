"""Excel intelligent en langage naturel : pivot dates en colonnes, variations,
tris, couleurs, resumes, double classement. Utilise par l'outil MCP
`gamme_excel_intelligent`.

Contrat d'honnetete : `build_excel` relit le .xlsx genere et PROUVE qu'il
respecte la demande (lignes uniques, dates en colonnes, couleurs au bon
endroit, calculs justes, tris respectes). Si une verification echoue,
`success` vaut False avec le detail — jamais de faux "termine".
"""
import copy
import json
import os
import re
from datetime import datetime

import pandas as pd
from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

from . import config
from . import db
from . import history_export

# Reutilise le dossier d'exports + URLs publiques existants.
EXPORTS_DIR = history_export.EXPORTS_DIR
PUBLIC_BASE = history_export.PUBLIC_BASE

MAX_ARTICLES = 2000  # au-dela : partiel + message honnete
LAST_PLAN_FILE = os.path.join(config.DATA_DIR, "last_excel_plan.json")

# indicateur demande -> (colonne article_history, libelle court, format nombre)
INDICATEURS = {
    "marge": ("marge_pct", "Marge", "0.00"),
    "stock": ("stock", "Stock", "#,##0"),
    "px_vente": ("px_vente", "Px vente", "#,##0"),
    "px_revient": ("px_revient", "Px revient", "#,##0"),
    "couv": ("couv", "Couv", "0.00"),
    "valeur_stock": ("valeur_stock_prmp", "Valeur stock", "#,##0"),
}

DROP_FILL = PatternFill("solid", fgColor="FFC7CE")
DROP_FONT = Font(color="9C0006")
UP_FILL = PatternFill("solid", fgColor="C6EFCE")
UP_FONT = Font(color="006100")
NEG_FILL = PatternFill("solid", fgColor="9C0006")
NEG_FONT = Font(color="FFFFFF")
HEADER_FILL = PatternFill("solid", fgColor="1F4E78")
HEADER_FONT = Font(color="FFFFFF", bold=True)

# Colonnes fixes (avant les dates) : jamais d'euros, montants FDJ.
FIXED_HEADERS = ["Code article", "Libellé", "Fournisseur", "Stock",
                 "Px revient", "Px vente", "Promo active", "Cause"]
N_FIX = len(FIXED_HEADERS)
COL_DATE0 = N_FIX + 1  # 1-indexed : premiere colonne date

_JOUR_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _jjmm(jour: str) -> str:
    return f"{jour[8:10]}/{jour[5:7]}"


def _pj(s):
    """Parse une date promo JJ/MM/AAAA (base) -> datetime.date ou None.
    Les chaines 'nan'/''/None (date_fin vide) = pas de fin."""
    if s is None:
        return None
    t = str(s).strip()
    if not t or t.lower() == "nan":
        return None
    try:
        return datetime.strptime(t, "%d/%m/%Y").date()
    except ValueError:
        return None


def _jour_to_date(jour: str):
    try:
        return datetime.strptime(jour, "%Y-%m-%d").date()
    except ValueError:
        return None


# ---------------------------------------------------------------- plans ----
def load_last_plan():
    try:
        with open(LAST_PLAN_FILE, encoding="utf-8") as f:
            plan = json.load(f)
            return plan if isinstance(plan, dict) else None
    except (OSError, ValueError):
        return None


def save_last_plan(plan: dict) -> None:
    try:
        os.makedirs(os.path.dirname(LAST_PLAN_FILE), exist_ok=True)
        with open(LAST_PLAN_FILE, "w", encoding="utf-8") as f:
            json.dump(plan, f, ensure_ascii=False)
    except OSError:
        pass


def resolve_plan(plan: dict, base: str = "zero") -> dict:
    """Fusionne avec le dernier plan si base='dernier' (memoire d'iteration :
    'refais-moi ca avec le stock' ne reprecise que l'indicateur)."""
    plan = dict(plan or {})
    if (base or "zero") == "dernier":
        last = load_last_plan() or {}
        merged = dict(last)
        merged.update(plan)
        plan = merged
    plan.setdefault("indicateur", "marge")
    plan.setdefault("selection", "baisses")
    plan.setdefault("seuil_baisse_pts", 5)
    plan.setdefault("date_debut", "")
    plan.setdefault("date_fin", "")
    plan.setdefault("double_classement", True)
    plan.setdefault("couleurs", True)
    plan.setdefault("resume", True)
    plan.setdefault("titre", "")
    plan.setdefault("inclure_dormants", True)
    plan.setdefault("inclure_ruptures", True)
    plan.setdefault("rupture_stock_max", 3)
    plan.setdefault("rupture_couv_max", 30)
    return plan


# --------------------------------------------------------------- donnees ----
def _jours_utilises(conn, rayon, date_debut, date_fin):
    rows = conn.execute(
        "SELECT DISTINCT jour FROM imports WHERE rayon = ? AND statut IN ('ok','baseline') ORDER BY jour",
        (rayon,),
    ).fetchall()
    jours = [r["jour"] for r in rows]
    if date_debut:
        jours = [j for j in jours if j >= date_debut]
    if date_fin:
        jours = [j for j in jours if j <= date_fin]
    return jours


def _matrice(conn, rayon, jours, col_indicateur):
    """Long format : une ligne par (code, jour) avec l'indicateur + TOUTES les
    colonnes fixes (fournisseur, prix, promo, valeur, couv) pour le diagnostic.
    UNE seule requete (BETWEEN) + filtre sur les jours utilises."""
    q = (
        f"SELECT jour, code, libelle, {col_indicateur} AS val, stock, "
        "fournisseur, px_revient, px_vente, marge_pct, pv_promo, date_dbt, "
        "date_fin, valeur_stock_prmp, couv FROM article_history "
        "WHERE rayon = ? AND jour >= ? AND jour <= ? ORDER BY code, jour"
    )
    full = pd.read_sql_query(q, conn, params=[rayon, jours[0], jours[-1]])
    if len(full):
        full = full[full["jour"].isin(jours)].reset_index(drop=True)
        full["code"] = full["code"].astype("Int64")
    return full


def _cause_diagnostic(marge_last, pv_last, pr_last, promo_active, stock_last) -> str:
    """Verdict marge negative : DONNEE (prix manquants) > STRUCTURELLE
    (vente < revient) > PROMO (promo active) > INCOHERENTE (marge du fichier
    negative alors que vente >= revient). Vide si marge >= 0 ou inconnue."""
    prix_absents = (pr_last is None or pr_last <= 0) or (pv_last is None or pv_last <= 0)
    if stock_last > 0 and prix_absents:
        return "DONNEE"
    if marge_last is None or marge_last >= 0:
        return ""
    if prix_absents:
        return "DONNEE"
    if pv_last < pr_last:
        return "STRUCTURELLE"
    if promo_active:
        return "PROMO"
    return "INCOHERENTE"


def _metriques(full: pd.DataFrame, jours, indicateur, plan):
    """Par article : premiere/derniere valeurs, delta, stock fin, impact,
    colonnes fixes (dernier jour), promo active, cause, flags
    fantome/dormant/rupture. Vectorise + une passe serie."""
    if len(full) == 0:
        return []
    dernier = jours[-1]
    dJ = _jour_to_date(dernier)
    full = full.sort_values(["code", "jour"], kind="stable").reset_index(drop=True)
    agg = full.groupby("code", sort=False).agg(
        libelle=("libelle", "last"),
        first=("val", "first"),
        last=("val", "last"),
        nunique=("val", "nunique"),
        stock_last=("stock", "last"),
        px_first=("px_vente", "first"),
        px_last=("px_vente", "last"),
    )
    serie_map, fix_map = {}, {}
    for code, grp in full.groupby("code", sort=False):
        serie_map[int(code)] = [
            (j, None if pd.isna(v) else float(v))
            for j, v in zip(grp["jour"].tolist(), grp["val"].tolist())
        ]
        gJ = grp[grp["jour"] == dernier]
        src = gJ.iloc[-1] if len(gJ) else grp.iloc[-1]
        def _num(c):
            v = src[c]
            try:
                return None if pd.isna(v) else float(v)
            except (TypeError, ValueError):
                return None
        def _txt(c):
            v = src[c]
            return "" if pd.isna(v) else str(v).strip()
        pv_promo = _num("pv_promo")
        dbt, dfn = _pj(src["date_dbt"]), _pj(src["date_fin"])
        fix_map[int(code)] = {
            "fourn_last": _txt("fournisseur"),
            "pr_last": _num("px_revient"),
            "pv_last": _num("px_vente"),
            "marge_last": _num("marge_pct"),
            "promo_last": pv_promo,
            "promo_active": bool((pv_promo or 0) > 0 and dbt is not None and dJ is not None
                                 and dbt <= dJ and (dfn is None or dfn >= dJ)),
            "valstock_last": _num("valeur_stock_prmp") or 0.0,
            "couv_last": _num("couv"),
        }
    stock_max = float(plan.get("rupture_stock_max") or 0)
    couv_max = float(plan.get("rupture_couv_max") or 0)
    recs = []
    for code, row in agg.iterrows():
        if pd.isna(row["first"]):
            continue  # aucune valeur pour cet indicateur (comme avant)
        first, last = float(row["first"]), float(row["last"])
        stock_last = 0.0 if pd.isna(row["stock_last"]) else float(row["stock_last"])
        px_bouge = bool(pd.notna(row["px_first"]) and pd.notna(row["px_last"])
                        and row["px_first"] != row["px_last"])
        fx = fix_map[int(code)]
        # Perte argent (toujours POSITIVE = argent perdu) : points (ou FDJ)
        # perdus x stock PRESENT. Stock <= 0 -> 0 (pas de capital en jeu :
        # un article en negatif ou a zero ne bloque aucun argent).
        # Pour l'indicateur stock lui-meme : unites perdues.
        if indicateur == "stock":
            perte = -(last - first)
        else:
            perte = -(last - first) * max(stock_last, 0.0)
        cause = _cause_diagnostic(fx["marge_last"], fx["pv_last"], fx["pr_last"],
                                  fx["promo_active"], stock_last)
        prix_absents = cause == "DONNEE"
        recs.append({
            "code": int(code),
            "libelle": "" if pd.isna(row["libelle"]) else str(row["libelle"]),
            "first": first, "last": last,
            "delta": last - first,
            "stock_last": stock_last,
            "impact": perte,
            "px_bouge": px_bouge,
            "stable": bool(row["nunique"] == 1),
            "serie": serie_map[int(code)],
            **fx,
            "cause": cause,
            "fantome": bool(stock_last > 0 and prix_absents),
            "dormant": bool(fx["couv_last"] == 999 and stock_last > 0),
            "rupture": bool(0 < stock_last <= stock_max and (fx["couv_last"] or 0) < couv_max),
        })
    return recs


def _selectionner(recs, plan):
    sel = plan["selection"]
    seuil = float(plan.get("seuil_baisse_pts") or 0)
    if isinstance(sel, dict):
        if "codes" in sel:
            wanted = {int(x) for x in sel["codes"]}
            return [r for r in recs if r["code"] in wanted]
        if "mots" in sel:
            mots = [m.strip().upper() for m in re.split(r"[,;\s]+", sel["mots"] or "") if m.strip()]
            return [r for r in recs if any(m in (r["libelle"] or "").upper() for m in mots)]
        return []
    if sel == "baisses":
        return [r for r in recs if r["delta"] <= -abs(seuil)]
    if sel == "hausses":
        return [r for r in recs if r["delta"] >= abs(seuil)]
    if sel == "negatifs":
        return [r for r in recs if r["stock_last"] < 0]
    if sel == "changements_prix":
        return [r for r in recs if r["px_bouge"]]
    if sel == "sans_changement":
        return [r for r in recs if r["stable"]]
    return list(recs)  # "tous" uniquement (les chaines inconnues sont
    # refusees plus haut dans build_excel : jamais de repli silencieux).


def _fnum(v):
    """float() tolerant aux colonnes TEXTE de article_history : None, NaN,
    '' et chaines non numeriques -> None (ligne ignoree par les filtres)."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    try:
        if pd.isna(f):
            return None
    except (TypeError, ValueError):
        return None
    return f


def _filtre_marge_negative_stock_positif(full: pd.DataFrame):
    """Condition combinee au niveau LIGNE historique (code, jour) :
    marge_pct < 0 ET stock > 0 le MEME jour. Retourne (codes, stats) avec
    nb_articles (distincts), nb_journees (lignes qualif.), premiere/
    derniere occurrence, marge_min et stock_max observes."""
    qualifs = []  # (code, jour, marge, stock)
    for _, r in full.iterrows():
        marge = _fnum(r.get("marge_pct"))
        stock = _fnum(r.get("stock"))
        if marge is None or stock is None:
            continue
        if marge < 0 and stock > 0:
            try:
                code = int(r["code"])
            except (TypeError, ValueError):
                continue
            qualifs.append((code, str(r["jour"]), marge, stock))
    codes = sorted({c for c, _, _, _ in qualifs})
    if not qualifs:
        stats = {"nb_articles": 0, "nb_journees": 0, "premiere_occurrence": None,
                 "derniere_occurrence": None, "marge_min": None, "stock_max": None}
    else:
        stats = {"nb_articles": len(codes), "nb_journees": len(qualifs),
                 "premiere_occurrence": min(j for _, j, _, _ in qualifs),
                 "derniere_occurrence": max(j for _, j, _, _ in qualifs),
                 "marge_min": min(m for _, _, m, _ in qualifs),
                 "stock_max": max(s for _, _, _, s in qualifs)}
    return codes, stats


# --------------------------------------------------------------- classeur ----
def _style_matrice(ws, n_dates: int, couleurs: bool, rouges: set,
                   vertes: set, sombres: set):
    ws.freeze_panes = "I2"  # fige les 8 colonnes fixes
    ws.auto_filter.ref = ws.dimensions
    for cell in ws[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
    for col, w in zip("ABCDEFGH", (13, 42, 30, 10, 12, 12, 12, 13)):
        ws.column_dimensions[col].width = w
    for idx in range(COL_DATE0, COL_DATE0 + n_dates):
        ws.column_dimensions[get_column_letter(idx)].width = 13
    ws.column_dimensions[get_column_letter(COL_DATE0 + n_dates)].width = 12
    ws.column_dimensions[get_column_letter(COL_DATE0 + n_dates + 1)].width = 15
    if not couleurs:
        return
    for (r, c) in rouges:
        ws.cell(row=r, column=c).fill = DROP_FILL
        ws.cell(row=r, column=c).font = DROP_FONT
    for (r, c) in vertes:
        ws.cell(row=r, column=c).fill = UP_FILL
        ws.cell(row=r, column=c).font = UP_FONT
    for (r, c) in sombres:
        ws.cell(row=r, column=c).fill = NEG_FILL
        ws.cell(row=r, column=c).font = NEG_FONT


def _ecrire_matrice(wb, titre: str, lignes, jours, label_ind, num_format, couleurs: bool):
    ws = wb.create_sheet(titre)
    headers = list(FIXED_HEADERS)
    headers += [f"{label_ind} {_jjmm(j)}" for j in jours]
    headers += ["Δ pts", "Perte valeur"]
    ws.append(headers)
    rouges, vertes, sombres = set(), set(), set()
    for i, rec in enumerate(lignes):
        r = i + 2
        serie = dict(rec["serie"])
        row = [rec["code"], rec["libelle"], rec["fourn_last"],
               rec["stock_last"] or None,
               rec["pr_last"], rec["pv_last"],
               "oui" if rec["promo_active"] else "non",
               rec["cause"] or None]
        prev = None
        for k, j in enumerate(jours):
            v = serie.get(j)
            row.append(v)
            c = COL_DATE0 + k
            if v is not None and prev is not None:
                if v < prev:
                    rouges.add((r, c))
                elif v > prev:
                    vertes.add((r, c))
            if v is not None:
                prev = v
            if v is not None and v < 0 and label_ind in ("Marge", "Stock"):
                sombres.add((r, c))
        row += [rec["delta"], rec["impact"]]
        ws.append(row)
        for col_letter, fmt in (("D", "#,##0"), ("E", "#,##0"), ("F", "#,##0")):
            cell = ws.cell(row=r, column=ws[col_letter + "1"].column)
            if cell.value is not None:
                cell.number_format = fmt
        for k in range(len(jours)):
            cell = ws.cell(row=r, column=COL_DATE0 + k)
            if cell.value is not None:
                cell.number_format = num_format
        ws.cell(row=r, column=COL_DATE0 + len(jours)).number_format = "0.00"
        ws.cell(row=r, column=COL_DATE0 + len(jours) + 1).number_format = "#,##0"
    rouges -= sombres
    vertes -= sombres
    _style_matrice(ws, len(jours), couleurs, rouges, vertes, sombres)
    return {"rouges": rouges, "vertes": vertes, "sombres": sombres}


def _ecrire_simple(wb, titre: str, headers, rows, formats, widths):
    """Feuille sans dates (Dormants, A commander) : filtres + freeze + largeurs."""
    ws = wb.create_sheet(titre)
    ws.append(headers)
    for row in rows:
        ws.append(list(row))
    ws.freeze_panes = "C2"
    ws.auto_filter.ref = ws.dimensions
    for cell in ws[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
    for idx, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(idx)].width = w
    for r in range(2, ws.max_row + 1):
        for idx, fmt in enumerate(formats, 1):
            if fmt:
                cell = ws.cell(row=r, column=idx)
                if cell.value is not None:
                    cell.number_format = fmt


def _ecrire_resume(wb, ctx: dict):
    ws = wb.create_sheet("Résumé")
    causes_txt = ", ".join(f"{k} : {v}" for k, v in sorted(ctx["causes"].items())) or "aucune"
    lignes = [
        ("Période couverte", f"{ctx['jours'][0]} -> {ctx['jours'][-1]}"),
        ("Dates importées utilisées", ", ".join(ctx["jours"])),
        ("Indicateur", ctx["label_ind"]),
        ("Sélection", json.dumps(ctx["selection"], ensure_ascii=False)),
        ("Nombre d'articles (sélection)", ctx["nb_articles"]),
        ("Nombre de baisses", ctx["nb_baisses"]),
        ("Plus grosse chute", ctx["top_chute"]),
        ("Plus grosse perte valeur", ctx["top_perte"]),
        ("Dormants : capital bloqué (FDJ)", f"{ctx['dormants_nb']} articles = {ctx['dormants_capital']}"),
        ("Ruptures : à commander", ctx["ruptures_nb"]),
        ("Fantômes sans prix", ctx["fantomes_nb"]),
        ("Causes marges négatives (sélection)", causes_txt),
        ("Export partiel (plafond)", "OUI" if ctx["partiel"] else "NON"),
        ("Date de génération", datetime.now().strftime("%Y-%m-%d %H:%M")),
        ("Légende", "Rouge = baisse vs date précédente ; Vert = hausse ; Rouge foncé = valeur négative. "
                    "Cause : STRUCTURELLE = vente < revient ; INCOHERENTE = marge fichier < 0 alors que vente >= revient ; "
                    "PROMO = promo active ; DONNEE = prix manquants. Marge = marge du fichier (FDJ, jamais d'euros)."),
    ]
    ws.append(["Indicateur", "Valeur"])
    for k, v in lignes:
        ws.append([k, v])
    for cell in ws[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
    ws.column_dimensions["A"].width = 30
    ws.column_dimensions["B"].width = 70


# ---------------------------------------------------------- verification ----
def _rgb(cell) -> str:
    try:
        rgb = cell.fill.start_color.rgb
        return str(rgb)[-6:].upper() if rgb else ""
    except Exception:
        return ""


def _lignes_egales(vues, attendues) -> bool:
    if len(vues) != len(attendues):
        return False
    for a, b in zip(vues, attendues):
        if a is None and b is None:
            continue
        if a is None or b is None:
            return False
        if isinstance(a, (int, float)) and isinstance(b, (int, float)):
            if abs(float(a) - float(b)) > 0.01:
                return False
        elif str(a) != str(b):
            return False
    return True


def verifier_classeur(path: str, ctx: dict) -> list:
    """Relit le .xlsx et prouve le contrat. Retourne [{nom, ok, detail}]."""
    checks = []

    def check(nom, ok, detail=""):
        checks.append({"nom": nom, "ok": bool(ok), "detail": str(detail)})

    try:
        wb = load_workbook(path, data_only=True)
    except Exception as e:
        return [{"nom": "ouverture", "ok": False, "detail": str(e)}]
    check("ouverture", True, f"{len(wb.sheetnames)} onglets")
    for titre in ctx["titres_attendus"]:
        check(f"onglet {titre}", titre in wb.sheetnames)
    for titre, attendu in ctx["ordres"].items():
        if titre not in wb.sheetnames:
            continue
        ws = wb[titre]
        codes = [ws.cell(row=r, column=1).value for r in range(2, ws.max_row + 1)]
        codes = [int(x) for x in codes if x is not None]
        check(f"{titre}: lignes uniques", len(codes) == len(set(codes)) == len(attendu),
              f"{len(codes)} lignes")
        check(f"{titre}: tri respecte", codes == attendu,
              f"attendu {attendu[:3]}..." if codes != attendu else "ok")
        if titre in ctx.get("simples", {}):
            sp = ctx["simples"][titre]
            entetes = [ws.cell(row=1, column=c).value
                       for c in range(1, len(sp["headers"]) + 1)]
            check(f"{titre}: en-tetes", entetes == sp["headers"], "|".join(map(str, entetes)))
            premiere = [ws.cell(row=2, column=c).value
                        for c in range(1, len(sp["headers"]) + 1)]
            check(f"{titre}: premiere ligne", _lignes_egales(premiere, sp["premiere"]),
                  str(premiere[:3]))
        else:
            entetes = [ws.cell(row=1, column=c).value
                       for c in range(COL_DATE0, COL_DATE0 + len(ctx["jours"]))]
            check(f"{titre}: dates en colonnes chrono",
                  entetes == [f"{ctx['label_ind']} {_jjmm(j)}" for j in ctx["jours"]],
                  f"{len(entetes)} colonnes dates")
            fixes = [ws.cell(row=1, column=c).value for c in range(1, N_FIX + 1)]
            check(f"{titre}: colonnes fixes", fixes == FIXED_HEADERS, "|".join(map(str, fixes)))
    # Valeurs et couleurs : controle par feuille (les coordonnees se repetent
    # d'un onglet a l'autre) + comptage global. Feuilles simples ignorees.
    rouges_vues = vertes_vues = sombres_vues = 0
    rouges_att = vertes_att = sombres_att = 0
    ok_couleurs = True
    for titre in ctx["ordres"]:
        if titre not in wb.sheetnames or titre in ctx.get("simples", {}):
            continue
        ws = wb[titre]
        vues = sum(1 for r in range(2, ws.max_row + 1) for k in range(len(ctx["jours"]))
                   if _rgb(ws.cell(row=r, column=COL_DATE0 + k)) == "FFC7CE")
        att = len(ctx["rouges"].get(titre, set()))
        rouges_vues += vues
        rouges_att += att
        if vues != att:
            ok_couleurs = False
        sombres = sum(1 for r in range(2, ws.max_row + 1) for k in range(len(ctx["jours"]))
                      if _rgb(ws.cell(row=r, column=COL_DATE0 + k)) == "9C0006")
        satt = len(ctx.get("sombres", {}).get(titre, set()))
        sombres_vues += sombres
        sombres_att += satt
        if sombres != satt:
            ok_couleurs = False
        vertes_vues += sum(1 for r in range(2, ws.max_row + 1) for k in range(len(ctx["jours"]))
                           if _rgb(ws.cell(row=r, column=COL_DATE0 + k)) == "C6EFCE")
    check("cellules rouges = baisses detectees", ok_couleurs and (rouges_att + sombres_att) > 0,
          f"vues {rouges_vues}, attendues {rouges_att} (sombres {sombres_vues}/{sombres_att})")
    for code, jour, attendu in ctx["points"][:8]:
        titre = ctx["feuille_point"]
        ws = wb[titre]
        ligne = next((r for r in range(2, ws.max_row + 1)
                      if ws.cell(row=r, column=1).value == code), None)
        col = COL_DATE0 + ctx["jours"].index(jour)
        val = ws.cell(row=ligne, column=col).value if ligne else None
        ok = ligne is not None and val is not None and abs(float(val) - attendu) < 1e-6
        check(f"valeur {code}@{_jjmm(jour)}", ok, f"fichier={val} attendu={attendu}")
    if "Résumé" in wb.sheetnames:
        txt = " ".join(str(c.value) for row in wb["Résumé"].iter_rows() for c in row)
        check("resume present", "Période couverte" in txt and "Légende" in txt)
    else:
        check("resume present", not ctx["resume_demande"], "non demande")
    return checks


# ------------------------------------------------------------------ build ----
def _tobool(v):
    if v is None or v == "":
        return None
    if isinstance(v, bool):
        return v
    return str(v).strip().lower() in ("1", "true", "vrai", "oui", "yes", "y")


SELECTIONS = {"baisses", "hausses", "tous", "negatifs", "changements_prix",
              "sans_changement"}

# Clés de plan comprises par build_excel. Toute autre clé est soit rejetée
# (si elle ressemble à un filtre : l'intention serait perdue), soit listée
# dans res["cles_ignorees"] pour que l'agent VOIE ce qui n'a pas été appliqué.
CLES_PLAN = {"rayon", "indicateur", "selection", "seuil_baisse_pts",
             "date_debut", "date_fin", "double_classement", "couleurs",
             "resume", "titre", "inclure_dormants", "inclure_ruptures",
             "rupture_stock_max", "rupture_couv_max",
             "marge_negative", "stock_positif"}
CLES_FILTRE_SUSPECTES = {"filtres", "filtre", "filters", "filter",
                         "conditions", "condition", "where"}


def _normaliser_selection(plan: dict) -> dict:
    """Les flags marge_negative+stock_positif posés DIRECTEMENT dans plan_json
    (pas seulement en args plats) activent aussi le mode combiné, quand la
    sélection est absente ou vaut un défaut large (baisses/tous). Une sélection
    dict explicite ({codes}, {mots}, {marge_negative_stock_positif}) gagne
    toujours : elle n'est jamais écrasée ici."""
    sel = plan.get("selection")
    if _tobool(plan.get("marge_negative")) and _tobool(plan.get("stock_positif")):
        if sel is None or (isinstance(sel, str) and sel in ("baisses", "tous")):
            plan = {**plan, "selection": {"marge_negative_stock_positif": True}}
    return plan


def _cles_suspectes(plan: dict) -> list:
    """Clés inconnues qui ressemblent à un filtre : intention probablement
    perdue -> refus honnête plutôt que export faux."""
    out = []
    for k in plan:
        if k in CLES_PLAN:
            continue
        kl = str(k).lower()
        if kl in CLES_FILTRE_SUSPECTES or kl.startswith(("filtr", "filter")):
            out.append(k)
    return out


def plan_from_args(args: dict) -> dict:
    """Fusionne des arguments PLATS (façon LLM qui improvise : rayon_id, type,
    format, pivot...) en plan canonique. Clés inconnues IGNOREES (jamais
    d'erreur pour un argument surprise). Les clés déjà présentes dans le plan
    ne sont jamais écrasées (appelant : appliquer sur plan_json d'abord)."""
    args = args or {}
    plan = {}

    def first(*keys):
        for k in keys:
            v = args.get(k)
            if v is not None and v != "":
                return v
        return None

    rayon = first("rayon", "rayon_id", "rayonId")
    if rayon is not None:
        plan["rayon"] = rayon
    indicateur = first("indicateur")
    if indicateur is None:
        for k in ("type", "type_export"):
            v = args.get(k)
            if isinstance(v, str) and v.strip().lower() in INDICATEURS:
                indicateur = v
                break
    if indicateur is not None:
        plan["indicateur"] = indicateur
    selection = first("selection")
    if selection is None:
        v = args.get("type_export")
        if isinstance(v, str) and v.strip().lower() in SELECTIONS:
            selection = v
    if selection is None:
        mots = first("mots_cles", "mots_cle", "mots")
        if mots is not None:
            selection = {"mots": mots}
    if selection is None:
        codes = first("codes")
        if codes is not None:
            selection = {"codes": codes if isinstance(codes, list) else
                         [x.strip() for x in str(codes).split(",") if x.strip()]}
    if selection is not None:
        plan["selection"] = selection
    if _tobool(args.get("marge_negative")) and _tobool(args.get("stock_positif")):
        # Filtre combine historique : marge<0 ET stock>0 le MEME jour.
        # (Les autres cles filtres.* restent ignorees : jamais silencieux ici.)
        plan["selection"] = {"marge_negative_stock_positif": True}
    seuil = first("seuil_baisse_pts", "seuil")
    if seuil is not None:
        try:
            plan["seuil_baisse_pts"] = float(seuil)
        except (TypeError, ValueError):
            pass
    for k in ("date_debut", "date_fin", "titre"):
        v = first(k)
        if v is not None:
            plan[k] = v
    for k in ("double_classement", "couleurs", "resume",
              "inclure_dormants", "inclure_ruptures"):
        v = _tobool(first(k))
        if v is not None:
            plan[k] = v
    for k in ("rupture_stock_max", "rupture_couv_max"):
        v = first(k)
        if v is not None:
            try:
                plan[k] = float(v)
            except (TypeError, ValueError):
                pass
    return plan


def _lignes_fantomes(conn, rayon, jours):
    """Articles avec stock mais SANS prix au dernier jour (invisibles aux
    analyses marge : marge incalculable). Retourne des recs compatibles
    matrice (serie vide, delta None, impact = capital aveugle)."""
    dernier = jours[-1]
    dJ = _jour_to_date(dernier)
    rows = conn.execute(
        "SELECT code, libelle, fournisseur, stock, px_revient, px_vente, "
        "marge_pct, pv_promo, date_dbt, date_fin, valeur_stock_prmp, couv "
        "FROM article_history WHERE rayon = ? AND jour = ? AND stock > 0 AND "
        "((px_revient IS NULL OR px_revient <= 0) OR (px_vente IS NULL OR px_vente <= 0)) "
        "ORDER BY code",
        (rayon, dernier),
    ).fetchall()
    recs = []
    for r in rows:
        def _num(v):
            try:
                return None if v is None else float(v)
            except (TypeError, ValueError):
                return None
        stock = _num(r["stock"]) or 0.0
        pv_promo = _num(r["pv_promo"])
        dbt, dfn = _pj(r["date_dbt"]), _pj(r["date_fin"])
        valstock = _num(r["valeur_stock_prmp"]) or 0.0
        recs.append({
            "code": int(r["code"]), "libelle": str(r["libelle"] or ""),
            "first": None, "last": None, "delta": None,
            "stock_last": stock, "impact": valstock,
            "px_bouge": False, "stable": True,
            "serie": [(j, None) for j in jours],
            "fourn_last": str(r["fournisseur"] or "").strip(),
            "pr_last": _num(r["px_revient"]), "pv_last": _num(r["px_vente"]),
            "marge_last": _num(r["marge_pct"]),
            "promo_last": pv_promo,
            "promo_active": bool((pv_promo or 0) > 0 and dbt is not None and dJ is not None
                                 and dbt <= dJ and (dfn is None or dfn >= dJ)),
            "valstock_last": valstock, "couv_last": _num(r["couv"]),
            "cause": "DONNEE", "fantome": True, "dormant": False, "rupture": False,
        })
    return sorted(recs, key=lambda r: -r["valstock_last"])


def _slug(plan, rayon) -> str:
    base = plan.get("titre") or f"{json.dumps(plan.get('selection'), ensure_ascii=False)}-{plan.get('indicateur')}"
    s = re.sub(r"[^a-z0-9]+", "-", str(base).lower()).strip("-") or "analyse"
    return f"excel-{s[:40]}-{rayon}"


def build_excel(plan: dict, base: str = "zero") -> dict:
    plan = resolve_plan(plan, base)
    rayon = config.resolve_rayon(plan.get("rayon") or "")
    if rayon is None:
        valides = ", ".join(f"`{r}`" for r in config.rayon_ids())
        return {"success": False,
                "erreur": f"Rayon inconnu : {plan.get('rayon')!r} (rayons : {valides})."}
    plan = {**plan, "rayon": rayon}
    plan = _normaliser_selection(plan)
    _suspectes = _cles_suspectes(plan)
    if _suspectes:
        return {"success": False,
                "erreur": f"Clé(s) de filtrage non prise(s) en charge : "
                          f"{', '.join(sorted(map(str, _suspectes)))}. Le moteur "
                          f"refuse plutôt que d'ignorer silencieusement. Utilisez "
                          f"selection parmi {', '.join(sorted(SELECTIONS))} ou "
                          f"{{'codes': [...]}}, {{'mots': '...'}} ou "
                          f"{{'marge_negative_stock_positif': True}}."}
    cles_ignorees = sorted(str(k) for k in plan if k not in CLES_PLAN)
    indicateur = plan.get("indicateur") or "marge"
    if indicateur not in INDICATEURS:
        return {"success": False,
                "erreur": f"Indicateur inconnu : {indicateur!r} (marge, stock, px_vente, px_revient, couv, valeur_stock)."}
    col_ind, label_ind, num_format = INDICATEURS[indicateur]
    _sel = plan.get("selection")
    if isinstance(_sel, str) and _sel not in SELECTIONS:
        return {"success": False,
                "erreur": f"Sélection inconnue : {_sel!r} (chaînes valides : "
                          f"{', '.join(sorted(SELECTIONS))} ; dict valides : "
                          "{{'codes': [...]}, {'mots': '...'}, "
                          "{'marge_negative_stock_positif': True})."}
    for label, v in (("date_debut", plan.get("date_debut") or ""),
                     ("date_fin", plan.get("date_fin") or "")):
        if v and not _JOUR_RE.match(v):
            return {"success": False, "erreur": f"{label} invalide : {v!r} (YYYY-MM-DD)."}

    with db.lock_conn() as conn:
        jours = _jours_utilises(conn, rayon, plan["date_debut"], plan["date_fin"])
        if not jours:
            return {"success": False,
                    "erreur": f"Aucun import pour `{rayon}` sur la période demandée."}
        full = _matrice(conn, rayon, jours, col_ind)
        fant_q = _lignes_fantomes(conn, rayon, jours)
    if len(full) == 0:
        return {"success": False, "erreur": "Aucune donnée pour cet indicateur sur la période."}

    recs_all = _metriques(full, jours, indicateur, plan)
    filtre_negpos = None
    if isinstance(plan.get("selection"), dict) and plan["selection"].get("marge_negative_stock_positif"):
        # Filtre combine au niveau ligne (code, jour) : marge<0 ET stock>0
        # le MEME jour. Les agregats par article (_metriques/_selectionner)
        # ne peuvent pas l'exprimer (premier/dernier jour uniquement).
        _codes_negpos, filtre_negpos = _filtre_marge_negative_stock_positif(full)
        _vus_negpos = set(_codes_negpos)
        lignes = [r for r in recs_all if r["code"] in _vus_negpos]
    else:
        lignes = _selectionner(recs_all, plan)
    if not lignes:
        return {"success": False, "erreur": (
            "Aucun article ne correspond à la sélection "
            f"({json.dumps(plan.get('selection'), ensure_ascii=False)}). "
            "Essayez un seuil plus bas ou la sélection 'tous'.")}
    large = not isinstance(plan.get("selection"), dict)
    # PRIORITE : tri AVANT coupe. Chaque feuille garde SON top MAX_ARTICLES
    # par SON tri (les tops mondiaux survivent quel que soit leur code).
    # "Prios argent" : plus grosse PERTE d'abord (perte TOUJOURS positive =
    # argent perdu ; si que des hausses, plus gros gain d'abord).
    par_perte_full = sorted(lignes, key=lambda r: r["impact"],
                            reverse=any(r["delta"] < 0 for r in lignes))
    par_chute_full = sorted(lignes, key=lambda r: r["delta"])
    # Fantomes (requete dediee : sans prix donc invisibles a la matrice),
    # en tete de "Prix a corriger" — sauf selection ciblee (codes/mots).
    fantomes = list(fant_q) if large else []
    vus = {r["code"] for r in fantomes}
    prix_rows_full = list(fantomes) + [r for r in par_chute_full if r["code"] not in vus]
    dormants_full = sorted([r for r in recs_all if r["dormant"]],
                           key=lambda r: -r["valstock_last"]) \
        if (large and plan.get("inclure_dormants")) else []
    ruptures_full = sorted([r for r in recs_all if r["rupture"]],
                           key=lambda r: ((r["couv_last"] or 0), r["stock_last"])) \
        if (large and plan.get("inclure_ruptures")) else []

    def _coupe(rows):
        return rows[:MAX_ARTICLES], len(rows), len(rows) > MAX_ARTICLES

    from openpyxl import Workbook
    wb = Workbook()
    wb.remove(wb.active)
    ctx = {"jours": jours, "label_ind": label_ind, "titres_attendus": [],
           "ordres": {}, "rouges": {}, "sombres": {}, "points": [], "feuille_point": "",
           "simples": {},
           "selection": plan["selection"], "resume_demande": bool(plan.get("resume"))}
    feuilles = {}
    partiel = False

    def _pose_matrice(titre, rows_full):
        nonlocal partiel
        rows, total, cut = _coupe(rows_full)
        partiel = partiel or cut
        st = _ecrire_matrice(wb, titre, rows, jours, label_ind, num_format,
                             bool(plan.get("couleurs")))
        ctx["titres_attendus"].append(titre)
        ctx["ordres"][titre] = [r["code"] for r in rows]
        ctx["rouges"][titre] = st["rouges"]
        ctx["sombres"][titre] = st["sombres"]
        feuilles[titre] = {"lignes": len(rows), "total": total}
        return rows

    if plan.get("double_classement"):
        lignes_perte = _pose_matrice("Prios argent", par_perte_full)
        _pose_matrice("Prix à corriger", prix_rows_full)
        ctx["feuille_point"] = "Prios argent"
    else:
        lignes_perte = _pose_matrice("Analyse", par_chute_full)
        ctx["feuille_point"] = "Analyse"

    if dormants_full:
        rows, total, cut = _coupe(dormants_full)
        partiel = partiel or cut
        _ecrire_simple(
            wb, "Dormants",
            ["Code article", "Libellé", "Fournisseur", "Stock", "Valeur stock", "Couv"],
            [[r["code"], r["libelle"], r["fourn_last"], r["stock_last"] or None,
              r["valstock_last"] or None, r["couv_last"]] for r in rows],
            [None, None, None, "#,##0", "#,##0", "0.00"],
            (13, 42, 30, 10, 15, 10))
        ctx["titres_attendus"].append("Dormants")
        ctx["ordres"]["Dormants"] = [r["code"] for r in rows]
        ctx["simples"]["Dormants"] = {
            "headers": ["Code article", "Libellé", "Fournisseur", "Stock", "Valeur stock", "Couv"],
            "premiere": [rows[0]["code"], rows[0]["libelle"], rows[0]["fourn_last"],
                         rows[0]["stock_last"] or None, rows[0]["valstock_last"] or None,
                         rows[0]["couv_last"]]}
        feuilles["Dormants"] = {"lignes": len(rows), "total": total}

    if ruptures_full:
        rows, total, cut = _coupe(ruptures_full)
        partiel = partiel or cut
        _ecrire_simple(
            wb, "A commander",
            ["Code article", "Libellé", "Fournisseur", "Stock", "Couv"],
            [[r["code"], r["libelle"], r["fourn_last"], r["stock_last"] or None,
              r["couv_last"]] for r in rows],
            [None, None, None, "#,##0", "0.00"],
            (13, 42, 30, 10, 10))
        ctx["titres_attendus"].append("A commander")
        ctx["ordres"]["A commander"] = [r["code"] for r in rows]
        ctx["simples"]["A commander"] = {
            "headers": ["Code article", "Libellé", "Fournisseur", "Stock", "Couv"],
            "premiere": [rows[0]["code"], rows[0]["libelle"], rows[0]["fourn_last"],
                         rows[0]["stock_last"] or None, rows[0]["couv_last"]]}
        feuilles["A commander"] = {"lignes": len(rows), "total": total}

    # Points de controle : premiere/derniere dates de quelques articles.
    for rec in lignes_perte[:5]:
        serie = dict(rec["serie"])
        for j in (jours[0], jours[-1]):
            if serie.get(j) is not None:
                ctx["points"].append((rec["code"], j, serie[j]))

    top_chute = par_chute_full[0]
    top_perte = lignes_perte[0]  # premiere ligne de "Prios argent" (= top)
    causes = {}
    for r in lignes:
        if r["cause"]:
            causes[r["cause"]] = causes.get(r["cause"], 0) + 1
    ctx.update({
        "nb_articles": len(lignes_perte),
        "nb_baisses": sum(1 for r in lignes if r["delta"] < 0),
        "top_chute": f"{top_chute['code']} {top_chute['libelle']} ({top_chute['delta']:.2f} pts)",
        "top_perte": f"{top_perte['code']} {top_perte['libelle']} ({top_perte['impact']:.0f})",
        "partiel": partiel,
        "causes": causes,
        "filtre_negpos": filtre_negpos,
        "dormants_nb": len(dormants_full),
        "dormants_capital": round(sum(r["valstock_last"] for r in dormants_full)),
        "ruptures_nb": len(ruptures_full),
        "fantomes_nb": len(fantomes),
    })
    if plan.get("resume"):
        _ecrire_resume(wb, ctx)
        ctx["titres_attendus"].append("Résumé")

    os.makedirs(EXPORTS_DIR, exist_ok=True)
    name = f"{_slug(plan, rayon)}-{jours[0]}_{jours[-1]}.xlsx"
    name = re.sub(r"[^A-Za-z0-9_.\-]", "-", name)
    out_path = os.path.join(EXPORTS_DIR, name)
    wb.save(out_path)

    verifications = verifier_classeur(out_path, ctx)
    echecs = [v for v in verifications if not v["ok"]]
    ok = not echecs
    if ok:
        save_last_plan({**plan, "rayon": rayon})
    else:
        try:
            os.remove(out_path)
        except OSError:
            pass
    res = {
        "success": ok,
        "rayon": rayon,
        "plan": plan,
        "jours_utilises": jours,
        "nb_jours": len(jours),
        "nb_articles": len(lignes_perte),
        "nb_articles_total": len(lignes),
        "partiel": partiel,
        "feuilles": feuilles,
        "top_chute": ctx["top_chute"],
        "top_perte": ctx["top_perte"],
        "dormants": {"nb": ctx["dormants_nb"], "capital": ctx["dormants_capital"]},
        "ruptures_nb": ctx["ruptures_nb"],
        "fantomes_nb": ctx["fantomes_nb"],
        "causes": ctx["causes"],
        "filtre": filtre_negpos,
        "cles_ignorees": cles_ignorees,
        "fichier": out_path if ok else "",
        "url": f"{PUBLIC_BASE}/{name}" if ok else "",
        "verifications": verifications,
    }
    if echecs:
        res["erreur"] = ("Fichier NON conforme (" +
                         "; ".join(f"{v['nom']}: {v['detail']}" for v in echecs) +
                         "). Fichier supprimé, rien n'a été livré.")
    return res
