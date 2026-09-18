"""Export multi-jours d'article_history vers CSV/XLSX telechargeable.

Utilise par l'outil MCP `gamme_history_export` : contrairement a
`gamme_history_query` (1 seul jour, 500 lignes max), cet export parcourt TOUS
les jours importes du rayon en une seule demande et produit un vrai fichier.
"""
import os
import re
from datetime import datetime

import pandas as pd

from . import config
from . import db

EXPORTS_DIR = os.path.join(config.NAO_PROJECT_DIR, "docs", "exports")
PUBLIC_BASE = "https://gestion.hypeer.cloud/exports"

MAX_LIGNES = 50000

# (colonne article_history, en-tete fichier) — ordre impose.
COLONNES = [
    ("jour", "Jour"),
    ("code", "Code article"),
    ("libelle", "Libelle"),
    ("stock", "Stock"),
    ("px_vente", "Prix vente FDJ"),
    ("px_revient", "Prix revient FDJ"),
    ("marge_pct", "Marge %"),
    ("couv", "Couverture"),
]
NUMERIQUES = {"stock", "px_vente", "px_revient", "marge_pct", "couv"}

_JOUR_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _slug(s: str) -> str:
    s = (s or "").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "articles"


def _like_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _mots(mots_cles: str) -> list:
    mots = [m.strip().upper() for m in re.split(r"[,;\s]+", mots_cles or "") if m.strip()]
    if not mots:
        raise ValueError("mots_cles vide : fournis au moins un mot (ex. 'OEUF,EGG').")
    return mots


def export_history(rayon: str, mots_cles: str, date_debut: str = "",
                   date_fin: str = "", format: str = "xlsx") -> dict:
    """Exporte l'historique multi-jours des articles dont le libelle matche.

    Retourne un dict : success, jours_utilises, nb_articles, nb_lignes,
    partiel, fichier, url (+ erreur si echec).
    """
    fmt = (format or "xlsx").lower()
    if fmt not in ("xlsx", "csv"):
        return {"success": False, "erreur": f"Format '{format}' invalide : 'xlsx' ou 'csv'."}
    for label, v in (("date_debut", date_debut), ("date_fin", date_fin)):
        if v and not _JOUR_RE.match(v):
            return {"success": False, "erreur": f"{label} invalide : {v!r}. Format attendu : YYYY-MM-DD."}
    try:
        mots = _mots(mots_cles)
    except ValueError as e:
        return {"success": False, "erreur": str(e)}

    with db.lock_conn() as conn:
        rows = conn.execute(
            "SELECT DISTINCT jour FROM imports WHERE rayon = ? AND statut IN ('ok','baseline') ORDER BY jour",
            (rayon,),
        ).fetchall()
        jours = [r["jour"] for r in rows]
        if date_debut:
            jours = [j for j in jours if j >= date_debut]
        if date_fin:
            jours = [j for j in jours if j <= date_fin]
        if not jours:
            return {"success": False,
                    "erreur": f"Aucun import pour le rayon `{rayon}` sur la periode demandee."}

        clauses = " OR ".join("UPPER(libelle) LIKE '%' || ? || '%' ESCAPE '\\'" for _ in mots)
        params_mots = [_like_escape(m) for m in mots]
        frames = []
        for jour in jours:
            q = ("SELECT jour, code, libelle, stock, px_vente, px_revient, marge_pct, couv "
                 "FROM article_history WHERE rayon = ? AND jour = ? AND (" + clauses + ") "
                 "ORDER BY code")
            df = pd.read_sql_query(q, conn, params=[rayon, jour, *params_mots])
            frames.append(df)

    full = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(
        columns=[c for c, _ in COLONNES])
    full = full.sort_values(["jour", "code"], kind="stable").reset_index(drop=True)

    nb_articles = int(full["code"].nunique()) if len(full) else 0
    nb_total = int(len(full))
    partiel = nb_total > MAX_LIGNES
    if partiel:
        full = full.iloc[:MAX_LIGNES].copy()

    for col in NUMERIQUES:
        full[col] = pd.to_numeric(full[col], errors="coerce")
    full["code"] = full["code"].astype("Int64").astype(str)
    for col in ("jour", "libelle"):
        full[col] = full[col].where(full[col].notna(), None)
    full = full.rename(columns=dict(COLONNES))

    os.makedirs(EXPORTS_DIR, exist_ok=True)
    slug = _slug(",".join(mots))
    debut = date_debut or jours[0]
    fin = date_fin or jours[-1]
    name = f"historique-{slug}-{rayon}-{debut}_{fin}.{fmt}"
    # Nom de fichier sur : lettres, chiffres, tirets, underscores, points.
    name = re.sub(r"[^A-Za-z0-9_.\-]", "-", name)
    out_path = os.path.join(EXPORTS_DIR, name)

    if fmt == "csv":
        full.to_csv(out_path, index=False, encoding="utf-8-sig")
    else:
        with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
            full.to_excel(writer, sheet_name="Historique", index=False)
            ws = writer.sheets["Historique"]
            ws.auto_filter.ref = ws.dimensions
            ws.freeze_panes = "A2"
            widths = {"Jour": 12, "Code article": 13, "Libelle": 42, "Stock": 10,
                      "Prix vente FDJ": 15, "Prix revient FDJ": 16, "Marge %": 10, "Couverture": 11}
            for idx, col in enumerate(full.columns, 1):
                ws.column_dimensions[ws.cell(row=1, column=idx).column_letter].width = widths.get(col, 14)
            fmt_prix, fmt_marge = "#,##0.00", "0.00"
            for idx, col in enumerate(full.columns, 1):
                if col in ("Prix vente FDJ", "Prix revient FDJ", "Marge %"):
                    number_format = fmt_prix if col != "Marge %" else fmt_marge
                    for row in range(2, len(full) + 2):
                        cell = ws.cell(row=row, column=idx)
                        if cell.value is not None:
                            cell.number_format = number_format
            resume = pd.DataFrame([
                ("Periode couverte", f"{jours[0]} -> {jours[-1]}"),
                ("Dates importees utilisees", ", ".join(jours)),
                ("Nombre d'articles distincts", nb_articles),
                ("Nombre total de lignes", nb_total),
                ("Export partiel (plafond)", "OUI" if partiel else "NON"),
                ("Date de generation", datetime.now().strftime("%Y-%m-%d %H:%M")),
            ], columns=["Indicateur", "Valeur"])
            resume.to_excel(writer, sheet_name="Resume", index=False)
            ws2 = writer.sheets["Resume"]
            ws2.column_dimensions["A"].width = 30
            ws2.column_dimensions["B"].width = 60

    return {
        "success": True,
        "rayon": rayon,
        "mots_cles": mots,
        "jours_utilises": jours,
        "nb_jours": len(jours),
        "nb_articles": nb_articles,
        "nb_lignes": int(len(full)),
        "nb_lignes_total": nb_total,
        "partiel": partiel,
        "fichier": out_path,
        "url": f"{PUBLIC_BASE}/{name}",
    }
