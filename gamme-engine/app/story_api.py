"""API du story mode : payload enrichi pour la SPA React (dashboard shadcn).

Endpoints publics (même modèle de confiance que les rapports statiques) :
  GET /story-data/jours?rayon=...        → jours disponibles pour la navigation
  GET /story-data/{jour}?rayon=...       → payload complet du jour
"""
from datetime import datetime, timedelta

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from . import config
from . import db

router = APIRouter(prefix="/story-data", tags=["story"])


PRIO_ORDER = "CASE priorite WHEN 'critique' THEN 0 WHEN 'important' THEN 1 ELSE 2 END"


def _latest_import(conn, rayon, jour):
    row = conn.execute(
        "SELECT * FROM imports WHERE rayon = ? AND jour = ? AND statut IN ('ok','baseline') "
        "ORDER BY id DESC LIMIT 1",
        (rayon, jour),
    ).fetchone()
    return dict(row) if row else None


def _prev_import_id(conn, import_id, rayon):
    row = conn.execute(
        "SELECT MAX(id) AS id FROM imports WHERE id < ? AND rayon = ? AND statut IN ('ok','baseline')",
        (import_id, rayon),
    ).fetchone()
    return row["id"] if row else None


def _serie_jours(conn, rayon, jour):
    """Série quotidienne avec répartition par statut (pour le chart area)."""
    rows = conn.execute(
        "SELECT jour, statut, COUNT(*) AS n, "
        "SUM(CASE WHEN priorite = 'critique' THEN 1 ELSE 0 END) AS crit "
        "FROM negatifs_journaliers WHERE rayon = ? AND jour <= ? "
        "GROUP BY jour, statut ORDER BY jour",
        (rayon, jour),
    ).fetchall()
    serie = {}
    for r in rows:
        d = serie.setdefault(r["jour"], {"jour": r["jour"], "total": 0, "nouveaux": 0,
                                         "persistants": 0, "corriges": 0, "critiques": 0})
        if r["statut"] == "corrige":
            d["corriges"] += r["n"]
        else:
            d["total"] += r["n"]
            if r["statut"] == "nouveau":
                d["nouveaux"] += r["n"]
            else:
                d["persistants"] += r["n"]
        d["critiques"] += r["crit"] or 0
    return sorted(serie.values(), key=lambda d: d["jour"])


def _serie_anomalies(conn, rayon, jour):
    """Anomalies par jour et par type (pour le chart bar stacked)."""
    rows = conn.execute(
        "SELECT jour, type, COUNT(*) AS n FROM anomalies WHERE rayon = ? AND jour <= ? "
        "GROUP BY jour, type ORDER BY jour",
        (rayon, jour),
    ).fetchall()
    serie = {}
    types = []
    for r in rows:
        if r["type"] not in types:
            types.append(r["type"])
        d = serie.setdefault(r["jour"], {"jour": r["jour"]})
        d[r["type"]] = r["n"]
    return {"types": types, "jours": sorted(serie.values(), key=lambda d: d["jour"])}


def _hist_7j(conn, rayon, jour, codes):
    """Historique stock 7 jours pour les articles donnés (sparklines + drawer)."""
    if not codes:
        return {}
    ph = ",".join("?" * len(codes))
    jour_min = (datetime.strptime(jour, "%Y-%m-%d") - timedelta(days=6)).strftime("%Y-%m-%d")
    rows = conn.execute(
        f"SELECT code, jour, stock FROM article_history "
        f"WHERE rayon = ? AND jour BETWEEN ? AND ? AND code IN ({ph}) ORDER BY jour",
        [rayon, jour_min, jour, *codes],
    ).fetchall()
    out = {}
    for r in rows:
        out.setdefault(r["code"], []).append({"jour": r["jour"], "stock": r["stock"]})
    return out


def build_story_data(conn, rayon, jour):
    """Construit le payload complet du story mode pour un rayon/jour."""
    imp = _latest_import(conn, rayon, jour)
    if imp is None:
        return None
    import_id = imp["id"]
    prev_id = _prev_import_id(conn, import_id, rayon)

    nb_negatifs = [dict(r) for r in conn.execute(
        f"SELECT n.*, h.libelle, h.px_revient, h.px_vente, h.couv "
        f"FROM negatifs_journaliers n "
        f"LEFT JOIN article_history h ON h.import_id = n.import_id AND h.code = n.code "
        f"WHERE n.import_id = ? ORDER BY {PRIO_ORDER}, n.code",
        (import_id,),
    ).fetchall()]

    comps = [dict(r) for r in conn.execute(
        "SELECT * FROM compensations WHERE import_id = ? ORDER BY code_negatif, rang",
        (import_id,),
    ).fetchall()]
    comp_map = {}
    for c in comps:
        comp_map.setdefault(c["code_negatif"], []).append(c)

    anomalies = [dict(r) for r in conn.execute(
        "SELECT code, type, description, valeur_j1, valeur_j FROM anomalies "
        "WHERE import_id = ? ORDER BY id",
        (import_id,),
    ).fetchall()]

    actifs = [n for n in nb_negatifs if n["statut"] != "corrige"]
    hist = _hist_7j(conn, rayon, jour, [n["code"] for n in nb_negatifs])

    negatifs = []
    for n in actifs:
        cs = comp_map.get(n["code"], [])
        negatifs.append({
            "code": n["code"],
            "libelle": n.get("libelle"),
            "stock_j1": n["stock_j1"],
            "stock_j": n["stock_j"],
            "variation": n["variation"],
            "px_revient": n["px_revient"],
            "px_vente": n["px_vente"],
            "couv": n["couv"],
            "statut": n["statut"],
            "priorite": n["priorite"],
            "jours_consecutifs": n["jours_consecutifs"],
            "premiere_apparition": n["premiere_apparition"],
            "nb_occurrences": n["nb_occurrences"],
            "compensateurs": [{
                "code": c["code_compensateur"],
                "libelle": c["libelle_compensateur"],
                "confiance": c["confiance"],
                "justification": c["justification"],
                "px_revient": c["px_revient_compensateur"],
                "px_vente": c["px_vente_compensateur"],
                "stock": c["stock_compensateur"],
                "couv": c["couv_compensateur"],
            } for c in cs],
            "compensateur": cs[0]["libelle_compensateur"] if cs else None,
            "confiance": cs[0]["confiance"] if cs else "aucun",
            "justification": cs[0]["justification"] if cs else "Aucun compensateur trouvé",
            "hist7": hist.get(n["code"], []),
        })

    corriges = [{
        "code": n["code"], "libelle": n.get("libelle"),
        "stock_j1": n["stock_j1"], "stock_j": n["stock_j"],
        "variation": n["variation"], "statut": "corrige", "priorite": "corrige",
        "px_revient": n["px_revient"], "px_vente": n["px_vente"], "couv": n["couv"],
        "jours_consecutifs": n["jours_consecutifs"],
        "premiere_apparition": n["premiere_apparition"],
        "nb_occurrences": n["nb_occurrences"],
        "compensateur": None, "confiance": "aucun",
        "justification": "Stock redevenu positif", "hist7": hist.get(n["code"], []),
    } for n in nb_negatifs if n["statut"] == "corrige"]

    top_neg = sorted(actifs, key=lambda n: (n["stock_j"] or 0) * (n["px_revient"] or 0))[:10]
    top_neg_data = [{
        "code": n["code"], "libelle": (n.get("libelle") or "")[:40],
        "stock": n["stock_j"],
        "valeur": -((n["stock_j"] or 0) * (n["px_revient"] or 0)),
    } for n in top_neg]

    types_anom = {}
    for a in anomalies:
        types_anom[a["type"]] = types_anom.get(a["type"], 0) + 1

    nb_import = conn.execute(
        "SELECT COUNT(*) AS n FROM imports WHERE rayon = ? AND id <= ? AND statut IN ('ok','baseline')",
        (rayon, import_id),
    ).fetchone()["n"]

    resume = {
        "jour": jour,
        "nb_articles": imp["nb_articles"],
        "rayon": rayon,
        "libelle_rayon": config.rayon_libelle(rayon),
        "nouveaux": len([n for n in actifs if n["statut"] == "nouveau"]),
        "persistants": len([n for n in actifs if n["statut"].startswith("persistant")]),
        "corriges": len(corriges),
        "anomalies": len(anomalies),
        "avec_compensateur": len([n for n in negatifs if n["compensateur"]]),
        "sans_compensateur": len([n for n in negatifs if not n["compensateur"]]),
        "critiques": len([n for n in actifs if n["priorite"] == "critique"]),
        "importants": len([n for n in actifs if n["priorite"] == "important"]),
        "nb_import": nb_import,
        "baseline": prev_id is None,
    }

    return {
        "ok": True,
        "resume": resume,
        "top_neg": top_neg_data,
        "types_anom": types_anom,
        "anomalies": anomalies,
        "serie_jours": _serie_jours(conn, rayon, jour),
        "serie_anomalies": _serie_anomalies(conn, rayon, jour),
        "negatifs": negatifs,
        "corriges": corriges,
    }


@router.get("/stats/{jour}")
def story_stats(jour: str, rayon: str = config.RAYON):
    """Statistiques complémentaires du jour (valeurs PRMP, santé du stock,
    % de corrections sous 7 jours) — public, même modèle que story-data."""
    if rayon not in config.rayon_ids():
        return JSONResponse({"ok": False, "erreur": f"Rayon inconnu : {rayon}"}, status_code=404)
    with db.lock_conn() as conn:
        imp = _latest_import(conn, rayon, jour)
        if imp is None:
            return JSONResponse(
                {"ok": False, "erreur": f"Aucun import pour {rayon} le {jour}"}, status_code=404
            )
        import_id = imp["id"]

        totals = conn.execute(
            "SELECT "
            "COUNT(*) AS nb_articles, "
            "COALESCE(SUM(valeur_stock_prmp), 0) AS valeur_stock_prmp "
            "FROM article_history WHERE import_id = ?",
            (import_id,),
        ).fetchone()

        negs = conn.execute(
            "SELECT n.statut, n.stock_j, h.px_revient FROM negatifs_journaliers n "
            "LEFT JOIN article_history h ON h.import_id = n.import_id AND h.code = n.code "
            "WHERE n.import_id = ?",
            (import_id,),
        ).fetchall()
        prmp_passe_negatif = 0.0
        prmp_corrige = 0.0
        for n in negs:
            valeur = abs((n["stock_j"] or 0) * (n["px_revient"] or 0))
            if n["statut"] == "corrige":
                prmp_corrige += valeur
            elif n["statut"] == "nouveau":
                prmp_passe_negatif += valeur

        stock = conn.execute(
            "SELECT stock, couv FROM article_history WHERE import_id = ?",
            (import_id,),
        ).fetchall()
        en_stock = sum(1 for r in stock if (r["stock"] or 0) > 0)
        stock_bas = sum(
            1 for r in stock
            if (r["stock"] or 0) > 0 and (r["couv"] or 0) <= 7
        )
        dormants = sum(1 for r in stock if (r["stock"] or 0) > 0 and (r["couv"] or 0) == 999)
        negatifs = sum(1 for r in stock if (r["stock"] or 0) < 0)

        # % des épisodes corrigés en 7 jours ou moins (derniers 90 jours).
        corrections = conn.execute(
            "SELECT jours_consecutifs FROM negatifs_journaliers "
            "WHERE rayon = ? AND statut = 'corrige' AND jour >= ?",
            (rayon, (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")),
        ).fetchall()
        if corrections:
            corriges_sous_7j = round(
                100 * sum(1 for c in corrections if (c["jours_consecutifs"] or 0) <= 7)
                / len(corrections)
            )
        else:
            corriges_sous_7j = None

    return JSONResponse({
        "ok": True,
        "rayon": rayon,
        "jour": jour,
        "nb_articles": totals["nb_articles"],
        "valeur_stock_prmp": totals["valeur_stock_prmp"],
        "prmp_passe_negatif": round(prmp_passe_negatif, 2),
        "prmp_corrige": round(prmp_corrige, 2),
        "en_stock": en_stock,
        "stock_bas": stock_bas,
        "dormants": dormants,
        "negatifs": negatifs,
        "corriges_sous_7j": corriges_sous_7j,
    })


@router.get("/jours")
def jours(rayon: str = config.RAYON):
    """Jours disponibles (imports OK) pour la navigation de la sidebar."""
    if rayon not in config.rayon_ids():
        return JSONResponse({"ok": False, "erreur": f"Rayon inconnu : {rayon}"}, status_code=404)
    with db.lock_conn() as conn:
        rows = conn.execute(
            "SELECT jour, COUNT(*) AS n FROM negatifs_journaliers WHERE rayon = ? "
            "GROUP BY jour ORDER BY jour DESC LIMIT 60",
            (rayon,),
        ).fetchall()
        if not rows:
            rows = conn.execute(
                "SELECT DISTINCT jour, 0 AS n FROM imports WHERE rayon = ? AND statut IN ('ok','baseline') "
                "ORDER BY jour DESC LIMIT 60",
                (rayon,),
            ).fetchall()
    return JSONResponse({
        "ok": True,
        "rayon": rayon,
        "libelle_rayon": config.rayon_libelle(rayon),
        "jours": [{"jour": r["jour"], "negatifs": r["n"]} for r in rows],
    })


@router.get("/{jour}")
def story_jour(jour: str, rayon: str = config.RAYON):
    """Payload complet du story mode pour un jour donné."""
    if rayon not in config.rayon_ids():
        return JSONResponse({"ok": False, "erreur": f"Rayon inconnu : {rayon}"}, status_code=404)
    with db.lock_conn() as conn:
        data = build_story_data(conn, rayon, jour)
    if data is None:
        return JSONResponse(
            {"ok": False, "erreur": f"Aucun import pour {rayon} le {jour}"}, status_code=404
        )
    return JSONResponse(data)
