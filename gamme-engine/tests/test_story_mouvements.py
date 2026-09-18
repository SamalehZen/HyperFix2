"""Tests Phase D backend — endpoint /story-data/mouvements/{jour}."""
import json

from app import config, db
from app import story_api


def _rayons():
    import os

    os.makedirs(os.path.dirname(config.RAYONS_FILE), exist_ok=True)
    with open(config.RAYONS_FILE, "w", encoding="utf-8") as f:
        json.dump({"frais-surgele": {"libelle": "Frais surgelé"}}, f, ensure_ascii=False)


def _mouvement_jour(conn, rayon, jour, resume):
    return db.create_mouvement_import(conn, rayon, jour, "f.xlsx", f"h{jour}", "ok",
                                      nb_mouvements=1, resume=resume)


def _resume_min(ca=1000.0, marge=300.0, nb=5):
    return {"jour": "x", "rayon": "frais-surgele", "nb_mouvements": nb, "nb_articles": nb,
            "familles": {"vente": nb}, "avertissements": [],
            "indicateurs": {"ca": ca, "marge_encaissee": marge, "nb_articles_vendus": nb,
                            "top_ventes": [], "demarque": {}, "livraisons": {"qte": 0, "valeur": 0},
                            "prix_delta": [], "dormants": {}}}


def _body(resp):
    assert resp.status_code in (200, 404)
    return json.loads(resp.body.decode("utf-8"))


def test_endpoint_404_sans_mouvements(fresh_db):
    _rayons()
    out = _body(story_api.story_mouvements("2026-09-10", "frais-surgele"))
    assert out["ok"] is False


def test_endpoint_jours_mouvements(fresh_db):
    _rayons()
    with db.lock_conn() as conn:
        _mouvement_jour(conn, "frais-surgele", "2026-09-09", _resume_min())
        _mouvement_jour(conn, "frais-surgele", "2026-09-10", _resume_min())
    resp = story_api.story_mouvements_jours("frais-surgele")
    out = json.loads(resp.body.decode("utf-8"))
    assert out["ok"] is True
    assert [j["jour"] for j in out["jours"]] == ["2026-09-10", "2026-09-09"]


def test_endpoint_rayon_inconnu(fresh_db):
    _rayons()
    out = _body(story_api.story_mouvements("2026-09-10", "inconnu"))
    assert out["ok"] is False


def test_endpoint_jour_prev_serie(fresh_db):
    _rayons()
    with db.lock_conn() as conn:
        _mouvement_jour(conn, "frais-surgele", "2026-09-09", _resume_min(ca=900.0, marge=200.0))
        _mouvement_jour(conn, "frais-surgele", "2026-09-10", _resume_min(ca=1000.0, marge=300.0))
    out = _body(story_api.story_mouvements("2026-09-10", "frais-surgele"))
    assert out["ok"] is True
    assert out["resume"]["indicateurs"]["ca"] == 1000.0
    assert out["prev_jour"] == "2026-09-09"
    assert out["prev_resume"]["indicateurs"]["ca"] == 900.0
    assert [p["jour"] for p in out["serie"]] == ["2026-09-09", "2026-09-10"]
    assert out["alertes"] == []
    assert out["familles"] == {}
    assert out["ecarts"] == []


def test_endpoint_alertes(fresh_db):
    _rayons()
    with db.lock_conn() as conn:
        iid = db.create_import(conn, "frais-surgele", "2026-09-11", "g.xlsx", "hg", "ok", nb_articles=1)
        conn.execute(
            "INSERT INTO article_history (import_id, jour, rayon, code, libelle, stock, px_revient) "
            "VALUES (?,?,?,?,?,?,?)", (iid, "2026-09-11", "frais-surgele", 77, "ART", 10, 500.0))
        conn.execute(
            "INSERT INTO anomalies (import_id, rayon, jour, code, type, description, valeur_j1, valeur_j) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (iid, "frais-surgele", "2026-09-11", 77, "ecart_mouvement",
             "Écart inexpliqué 60.0 (2026-09-10 : 10 + (0) = 10 attendu, 70 constaté)", 10, 70))
        conn.execute(
            "INSERT INTO mouvements (import_id, jour, rayon, code, code_mvt, type_normalise, "
            "quantite, sens, quantite_signee, valeur_fichier, fichier_source, hash_sha256) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (1, "2026-09-10", "frais-surgele", 15, "15", "cession", 10, "-", -10.0, 25000.0,
             "f.xlsx", "h"))
        r = _resume_min()
        r["indicateurs"]["demarque"] = {"perime": {"qte": 4.0, "valeur": 120.0}}
        r["indicateurs"]["prix_delta"] = [{"code": 21, "dernier_pr": 900, "prmp": 860, "delta": 40.0}]
        _mouvement_jour(conn, "frais-surgele", "2026-09-10", r)
    out = _body(story_api.story_mouvements("2026-09-10", "frais-surgele"))
    assert out["ok"] is True
    titres = [(a["niveau"], a["titre"]) for a in out["alertes"]]
    assert ("attention", "Périmés du jour") in titres
    assert ("attention", "Cessions élevées") in titres
    assert ("critique", "Écart article 77") in titres
    assert any(t == "Prix achat en hausse : 21" for _, t in titres)
