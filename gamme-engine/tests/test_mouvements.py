"""Tests lot 1 — ingestion/validation des mouvements (jamais le flux gamme)."""
import os

import pytest

from app import config, db, mouvements

COLS = config.MOUVEMENT_REQUIRED_COLUMNS


def _row(**kw):
    base = {c: "" for c in COLS}
    base.update({
        "Code": "12982", "Libellé": "LAIT TEST", "Classification": "02-020-202-201",
        "Code mvt": "SM", "Libellé mvt": "Sortie marchandise",
        "Document d'origine": "0", "Qté UC": "5", "PRMP": "100",
        "Valeur": "500", "Sens": "-", "Qte. apres  mouvement.": "10",
        "Date mvt": "13/09/2026", "Heure mvt": "23:59:50",
        "Date création": "13/09/2026", "Heure création": "00:00:23",
    })
    base.update(kw)
    return base


def _write_xlsx(path, rows):
    import pandas as pd

    pd.DataFrame(rows, columns=COLS).to_excel(path, index=False)


def test_is_mouvement_filename():
    assert mouvements.is_mouvement_filename("Stock_DetailMouvement (93).xlsx")
    assert mouvements.is_mouvement_filename("/x/STOCK_detailmouvement 12.XLSX")
    assert not mouvements.is_mouvement_filename("Gamme_Commande - 2026-09-13 MATIN.xlsx")
    assert not mouvements.is_mouvement_filename("gamme.csv")


def test_colonnes_manquantes_refusent(tmp_path, fresh_db):
    p = str(tmp_path / "m.xlsx")
    _write_xlsx(p, [_row()])
    import pandas as pd

    df = pd.read_excel(p, dtype=str).drop(columns=["Sens"])
    df.to_excel(p, index=False)
    res = mouvements.run_mouvement_import(p, rayon="frais-surgele")
    assert not res["ok"] and "Colonnes" in res["erreur"]


def test_total_exclu_et_ligne_vide(fresh_db):
    import pandas as pd

    df = pd.DataFrame([_row(), _row(Code="", Libellé="TOTAL", **{"Valeur": "999"})], columns=COLS)
    lignes, meta = mouvements.validate_mouvements(df)
    assert lignes is not None and len(lignes) == 1
    assert any("sans Code" in w for w in meta["avertissements"])


def test_code_mvt_numerique_normalise(fresh_db):
    import pandas as pd

    df = pd.DataFrame([_row(**{"Code mvt": 15.0, "Libellé mvt": "Cession Cafet"})], columns=COLS)
    lignes, _ = mouvements.validate_mouvements(df)
    assert lignes[0]["code_mvt"] == "15"
    assert lignes[0]["type_normalise"] == "cession"


def test_signe_depuis_sens_rm(fresh_db):
    import pandas as pd

    df = pd.DataFrame([_row(Code="44761", **{"Code mvt": "RM", "Qté UC": "124"})], columns=COLS)
    lignes, _ = mouvements.validate_mouvements(df)
    assert lignes[0]["quantite_signee"] == -124.0


def test_type_inconnu_conserve_et_signale(fresh_db):
    import pandas as pd

    df = pd.DataFrame([_row(**{"Code mvt": "ZZ"})], columns=COLS)
    lignes, meta = mouvements.validate_mouvements(df)
    assert lignes[0]["type_normalise"] == "type_inconnu"
    assert any("inconnu" in w for w in meta["avertissements"])


def test_code_inutilise_conserve_et_alerte(fresh_db):
    import pandas as pd

    df = pd.DataFrame([_row(**{"Code mvt": "OF"})], columns=COLS)
    lignes, meta = mouvements.validate_mouvements(df)
    assert lignes[0]["type_normalise"] == "inutilise"
    assert any("inutilisé" in w for w in meta["avertissements"])


def test_ligne_sans_date_rejetee(fresh_db):
    import pandas as pd

    df = pd.DataFrame([_row(), _row(Code="1", **{"Date mvt": ""})], columns=COLS)
    lignes, meta = mouvements.validate_mouvements(df)
    assert len(lignes) == 1
    assert any("sans date" in w for w in meta["avertissements"])


def test_sens_invalide_refuse(tmp_path, fresh_db):
    p = str(tmp_path / "m.xlsx")
    _write_xlsx(p, [_row(Sens="x")])
    res = mouvements.run_mouvement_import(p, rayon="frais-surgele")
    assert not res["ok"] and "Sens invalide" in res["erreur"]


def test_doublon_jour_et_hash(tmp_path, fresh_db):
    p1 = str(tmp_path / "m1.xlsx")
    _write_xlsx(p1, [_row()])
    r1 = mouvements.run_mouvement_import(p1, rayon="frais-surgele")
    assert r1["ok"] and r1["resume"]["nb_mouvements"] == 1
    r2 = mouvements.run_mouvement_import(p1, rayon="frais-surgele")
    assert r2["ok"] and r2["resume"].get("deja_importe") is True
    p2 = str(tmp_path / "m2.xlsx")
    _write_xlsx(p2, [_row(**{"Qté UC": "6"})])  # même jour, contenu différent
    r3 = mouvements.run_mouvement_import(p2, rayon="frais-surgele")
    assert not r3["ok"] and "déjà importée" in r3["erreur"]


def test_fichier_multi_dates_refuse(tmp_path, fresh_db):
    p = str(tmp_path / "m.xlsx")
    _write_xlsx(p, [_row(), _row(Code="2", **{"Date mvt": "14/09/2026"})])
    res = mouvements.run_mouvement_import(p, rayon="frais-surgele")
    assert not res["ok"] and "multi-dates" in res["erreur"]


def test_annul_sens_suspect_warning(fresh_db):
    import pandas as pd

    df = pd.DataFrame([
        _row(Code="1", **{"Code mvt": "10"}),
        _row(Code="1", **{"Code mvt": "11"}),
    ], columns=COLS)
    _, meta = mouvements.validate_mouvements(df)
    assert any("ANNUL" in w for w in meta["avertissements"])


MVT_REEL = os.getenv("MVT_REEL_PATH", "")


@pytest.mark.skipif(not MVT_REEL or not os.path.exists(MVT_REEL), reason="fichier réel 13/09 non monté")
def test_import_reel_13_09(tmp_path, fresh_db):
    import shutil

    p = str(tmp_path / "reel.xlsx")
    shutil.copy(MVT_REEL, p)
    res = mouvements.run_mouvement_import(p, rayon="frais-surgele")
    assert res["ok"], res.get("erreur")
    resume = res["resume"]
    assert resume["jour"] == "2026-09-13"
    assert resume["nb_mouvements"] == 379
    assert resume["nb_articles"] == 356
    assert resume["familles"].get("vente") == 342
    assert resume["familles"].get("type_inconnu", 0) == 0
    with db.lock_conn() as conn:
        row = conn.execute(
            "SELECT quantite, sens, valeur_fichier FROM mouvements "
            "WHERE jour = '2026-09-13' AND code = 15218 AND code_mvt = 'SM'"
        ).fetchone()
    assert row is not None
    assert row["quantite"] == 18.0 and row["sens"] == "-"
    assert abs(row["valeur_fichier"] - 19353.29) < 0.01


def _gamme_jour(conn, rayon, jour, stocks):
    from app import db as _db

    iid = _db.create_import(conn, rayon, jour, f"gamme-{jour}.xlsx", f"h{jour}", "ok", nb_articles=len(stocks))
    for code, stock in stocks.items():
        conn.execute(
            "INSERT INTO article_history (import_id, jour, rayon, code, stock) VALUES (?,?,?,?,?)",
            (iid, jour, rayon, code, stock),
        )
    return iid


def test_reconciliation_exacte(tmp_path, fresh_db):
    p = str(tmp_path / "m.xlsx")
    _write_xlsx(p, [_row(Code="101", **{"Qté UC": "7"})])
    with db.lock_conn() as conn:
        _gamme_jour(conn, "frais-surgele", "2026-09-13", {101: 100})
        _gamme_jour(conn, "frais-surgele", "2026-09-14", {101: 93})
    res = mouvements.run_mouvement_import(p, rayon="frais-surgele")
    assert res["ok"]
    assert res["resume"]["reconciliation"]["statut"] == "reconcilié"
    with db.lock_conn() as conn:
        anoms = conn.execute("SELECT * FROM anomalies WHERE type = 'ecart_mouvement'").fetchall()
    assert len(anoms) == 0


def test_reconciliation_ecart_signale(tmp_path, fresh_db):
    p = str(tmp_path / "m.xlsx")
    _write_xlsx(p, [_row(Code="101", **{"Qté UC": "7"})])
    with db.lock_conn() as conn:
        _gamme_jour(conn, "frais-surgele", "2026-09-13", {101: 100})
        iid14 = _gamme_jour(conn, "frais-surgele", "2026-09-14", {101: 80})  # 93 attendu
    res = mouvements.run_mouvement_import(p, rayon="frais-surgele")
    assert res["ok"]
    assert res["resume"]["reconciliation"]["nb_ecarts"] == 1
    with db.lock_conn() as conn:
        anoms = conn.execute(
            "SELECT code, description FROM anomalies WHERE type = 'ecart_mouvement' AND import_id = ?",
            (iid14,)).fetchall()
    assert len(anoms) == 1 and anoms[0]["code"] == 101
    assert "-13" in anoms[0]["description"]


def test_reconciliation_sans_gamme(tmp_path, fresh_db):
    p = str(tmp_path / "m.xlsx")
    _write_xlsx(p, [_row()])
    res = mouvements.run_mouvement_import(p, rayon="frais-surgele")
    assert res["ok"]
    assert res["resume"]["reconciliation"]["statut"] == "mouvements_sans_gamme"


def _gamme_full(conn, rayon, jour, articles):
    from app import db as _db

    iid = _db.create_import(conn, rayon, jour, f"gamme-{jour}.xlsx", f"h{jour}", "ok",
                            nb_articles=len(articles))
    for a in articles:
        conn.execute(
            "INSERT INTO article_history (import_id, jour, rayon, code, libelle, stock, couv, "
            "px_vente, pv_promo, date_dbt, date_fin, px_revient) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (iid, jour, rayon, a["code"], a.get("libelle"), a.get("stock", 0),
             a.get("couv"), a.get("px_vente"), a.get("pv_promo"), a.get("date_dbt"),
             a.get("date_fin"), a.get("px_revient")),
        )
    return iid


def test_ca_promo_exact(tmp_path, fresh_db):
    p = str(tmp_path / "m.xlsx")
    _write_xlsx(p, [_row(Code="15218", **{"Qté UC": "18"})])
    with db.lock_conn() as conn:
        _gamme_full(conn, "frais-surgele", "2026-09-13", [{
            "code": 15218, "stock": 3559, "px_vente": 1850, "pv_promo": 1600,
            "date_dbt": "10/09/2026", "date_fin": "15/09/2026", "px_revient": 1075.183}])
    res = mouvements.run_mouvement_import(p, rayon="frais-surgele")
    ind = res["resume"]["indicateurs"]
    assert ind["ca"] == 28800.0
    assert abs(ind["marge_encaissee"] - 9446.71) < 0.02


def test_ca_hors_promo_prix_vente(tmp_path, fresh_db):
    p = str(tmp_path / "m.xlsx")
    _write_xlsx(p, [_row(**{"Qté UC": "2"})])
    with db.lock_conn() as conn:
        _gamme_full(conn, "frais-surgele", "2026-09-13", [{
            "code": 12982, "stock": 100, "px_vente": 200, "pv_promo": 150,
            "date_dbt": "10/09/2026", "date_fin": "11/09/2026", "px_revient": 100}])
    res = mouvements.run_mouvement_import(p, rayon="frais-surgele")
    assert res["resume"]["indicateurs"]["ca"] == 400.0


def test_dormants_niveaux(tmp_path, fresh_db):
    def _imp(jour, rows):
        q = str(tmp_path / f"m{jour.replace('/', '-')}.xlsx")
        _write_xlsx(q, rows)
        r = mouvements.run_mouvement_import(q, rayon="frais-surgele")
        assert r["ok"], r.get("erreur")
    _imp("01/06/2026", [
        _row(Code="11", **{"Date mvt": "01/06/2026"}),   # vendu il y a 104 j
        _row(Code="12", **{"Date mvt": "01/06/2026"}),
        _row(Code="16", **{"Date mvt": "01/06/2026"}),
    ])
    _imp("03/09/2026", [_row(Code="15", **{"Date mvt": "03/09/2026"})])  # vendu il y a 10 j
    _imp("13/09/2026", [
        _row(Code="12", **{"Date mvt": "13/09/2026"}),                       # actif
        _row(Code="11", **{"Code mvt": "EI", "Date mvt": "13/09/2026"}),     # inventaire ne réveille pas
        _row(Code="13", **{"Code mvt": "EI", "Date mvt": "13/09/2026"}),     # jamais vendu
    ])
    with db.lock_conn() as conn:
        _gamme_full(conn, "frais-surgele", "2026-09-13", [
            {"code": 11, "stock": 10, "couv": 30, "px_revient": 100},   # prouvé + caché
            {"code": 12, "stock": 10, "couv": 30, "px_revient": 100},   # actif
            {"code": 13, "stock": 5, "couv": 999, "px_revient": 50},    # estimé
            {"code": 14, "stock": 7, "couv": 30, "px_revient": 50},     # partiel (jamais vendu)
            {"code": 15, "stock": 9, "couv": 999, "px_revient": 50},    # faux dormant
            {"code": 16, "stock": 0, "couv": 999, "px_revient": 50},    # exclu (stock nul)
        ])
        ind = mouvements.indicateurs_jour(conn, "frais-surgele", "2026-09-13")
    d = ind["dormants"]
    assert d["nb_prouves"] == 1 and d["top_prouves"][0]["code"] == 11
    assert d["nb_estimes"] == 1
    assert len(d["faux_dormants"]) == 1 and d["faux_dormants"][0]["code"] == 15
    assert len(d["dormants_caches"]) == 1 and d["dormants_caches"][0]["code"] == 11
    assert d["capital_prouve"] == 1000.0


def test_prix_delta_et_demarque(tmp_path, fresh_db):
    p = str(tmp_path / "m.xlsx")
    _write_xlsx(p, [
        _row(Code="21", **{"Dernier PR": "900", "PRMP": "860"}),
        _row(Code="22", **{"Code mvt": "10", "Qté UC": "3", "Valeur": "90"}),
        _row(Code="23", **{"Code mvt": "60", "Qté UC": "2", "Valeur": "40"}),
    ])
    with db.lock_conn() as conn:
        _gamme_full(conn, "frais-surgele", "2026-09-13", [{"code": 21, "stock": 5}])
    res = mouvements.run_mouvement_import(p, rayon="frais-surgele")
    ind = res["resume"]["indicateurs"]
    assert ind["prix_delta"][0]["code"] == 21 and ind["prix_delta"][0]["delta"] == 40.0
    assert ind["demarque"]["perime"] == {"qte": 3.0, "valeur": 90.0}
    assert ind["demarque"]["casse_rayon"] == {"qte": 2.0, "valeur": 40.0}
