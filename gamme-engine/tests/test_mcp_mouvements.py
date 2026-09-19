"""Tests Lot 1 outil chat — 3 outils MCP mouvements (garde mockée)."""
import json
import os

import pytest

from app import config, db
from app import mcp_server


@pytest.fixture()
def authed(monkeypatch):
    monkeypatch.setattr(
        mcp_server, "_current_user",
        lambda: {"email": "test@gestion", "rayons": ["frais-surgele"]})
    os.makedirs(os.path.dirname(config.RAYONS_FILE), exist_ok=True)
    with open(config.RAYONS_FILE, "w", encoding="utf-8") as f:
        json.dump({"frais-surgele": {"libelle": "Frais surgelé"}}, f, ensure_ascii=False)


def _mouvement_jour(conn, rayon, jour, resume):
    return db.create_mouvement_import(conn, rayon, jour, "f.xlsx", f"h{jour}", "ok",
                                      nb_mouvements=1, resume=resume)


def _resume_min(ca=1000.0, marge=300.0):
    return {"jour": "x", "rayon": "frais-surgele", "nb_mouvements": 5, "nb_articles": 5,
            "familles": {"vente": 5}, "avertissements": [],
            "reconciliation": {"statut": "reconcilié", "nb_ecarts": 0},
            "indicateurs": {"ca": ca, "marge_encaissee": marge, "marge_pct": 30.0,
                            "ca_promo": 0, "ventes_sans_prix": 0, "top_ventes": [],
                            "nb_articles_vendus": 5, "demarque": {},
                            "livraisons": {"qte": 0, "valeur": 0}, "prix_delta": [],
                            "dormants": {"nb_prouves": 0, "nb_partiels": 0, "nb_estimes": 0,
                                         "capital_prouve": 0, "top_prouves": [],
                                         "faux_dormants": [], "dormants_caches": []}}}


def _out(s):
    return json.loads(s)


def test_garde_sans_auth(fresh_db):
    with pytest.raises(ValueError):
        mcp_server.gamme_mouvements("frais-surgele")


def test_outil_jour_ok(authed, fresh_db):
    with db.lock_conn() as conn:
        _mouvement_jour(conn, "frais-surgele", "2026-09-10", _resume_min())
    out = _out(mcp_server.gamme_mouvements("frais-surgele", "2026-09-10"))
    assert out["success"] is True and out["jour"] == "2026-09-10"
    assert "1 000" in out["resume_markdown"] or "1000" in out["resume_markdown"]
    assert "FDJ" in out["resume_markdown"]


def test_outil_jour_defaut_dernier(authed, fresh_db):
    with db.lock_conn() as conn:
        _mouvement_jour(conn, "frais-surgele", "2026-09-09", _resume_min())
        _mouvement_jour(conn, "frais-surgele", "2026-09-10", _resume_min())
    out = _out(mcp_server.gamme_mouvements("frais-surgele"))
    assert out["success"] is True and out["jour"] == "2026-09-10"


def test_outil_jour_404_honnete(authed, fresh_db):
    out = _out(mcp_server.gamme_mouvements("frais-surgele", "2026-09-10"))
    assert out["success"] is False and "Pas de mouvements" in out["erreur"]


def test_outil_serie_trous(authed, fresh_db):
    with db.lock_conn() as conn:
        _mouvement_jour(conn, "frais-surgele", "2026-09-08", _resume_min(ca=500.0, marge=100.0))
        _mouvement_jour(conn, "frais-surgele", "2026-09-10", _resume_min(ca=1000.0, marge=300.0))
    out = _out(mcp_server.gamme_mouvements_serie("frais-surgele"))
    assert out["success"] is True and out["nb_jours"] == 2
    assert out["trous"] == ["2026-09-09"]
    assert out["ca_total"] == 1500.0
    assert "Trous" in out["resume_markdown"]


def test_outil_jour_prix_manquants(authed, fresh_db):
    with db.lock_conn() as conn:
        r = _resume_min()
        r["indicateurs"]["ca"] = None
        r["indicateurs"]["marge_encaissee"] = None
        r["indicateurs"]["ventes_sans_prix"] = 5
        r["indicateurs"]["prix_manquants"] = True
        _mouvement_jour(conn, "frais-surgele", "2026-09-10", r)
    out = _out(mcp_server.gamme_mouvements("frais-surgele", "2026-09-10"))
    assert out["success"] is True
    assert "non chiffrables" in out["resume_markdown"]
    out2 = _out(mcp_server.gamme_mouvements_serie("frais-surgele"))
    assert out2["success"] is True and out2["serie"][0]["ca"] is None


def test_outil_article(authed, fresh_db):
    with db.lock_conn() as conn:
        iid = db.create_mouvement_import(conn, "frais-surgele", "2026-09-10", "f.xlsx",
                                         "h10", "ok", nb_mouvements=2)
        for qte in (3.0, 2.0):
            conn.execute(
                "INSERT INTO mouvements (import_id, jour, rayon, code, code_mvt, type_normalise, "
                "quantite, sens, quantite_signee, fichier_source, hash_sha256) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (iid, "2026-09-10", "frais-surgele", 501, "SM", "vente",
                 qte, "-", -qte, "f.xlsx", "h10"))
        giid = db.create_import(conn, "frais-surgele", "2026-09-10", "g.xlsx", "hg", "ok", nb_articles=1)
        conn.execute(
            "INSERT INTO article_history (import_id, jour, rayon, code, libelle, stock, couv, "
            "px_vente, px_revient) VALUES (?,?,?,?,?,?,?,?,?)",
            (giid, "2026-09-10", "frais-surgele", 501, "ART", 20, 30, 200, 100))
    out = _out(mcp_server.gamme_mouvements_article("frais-surgele", 501))
    assert out["success"] is True
    assert len(out["ventes_par_jour"]) == 1 and out["ventes_par_jour"][0]["qte_nette"] == -5.0
    assert out["statut_dormant"] == "actif"
    assert out["snapshot"]["stock"] == 20
    out2 = _out(mcp_server.gamme_mouvements_article("frais-surgele", 999999))
    assert out2["success"] is False
