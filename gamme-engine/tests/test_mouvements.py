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
    assert r1["ok"] and r1["resume"]["jours_importes"] == ["2026-09-13"]
    r2 = mouvements.run_mouvement_import(p1, rayon="frais-surgele")
    assert r2["ok"] and r2["resume"].get("deja_importe") is True
    p2 = str(tmp_path / "m2.xlsx")
    _write_xlsx(p2, [_row(**{"Qté UC": "6"})])  # même jour, contenu différent
    r3 = mouvements.run_mouvement_import(p2, rayon="frais-surgele")
    assert r3["ok"] and r3["resume"]["jours_deja"] == ["2026-09-13"]


def test_split_multi_dates(tmp_path, fresh_db):
    p = str(tmp_path / "m.xlsx")
    _write_xlsx(p, [
        _row(Code="1", **{"Date mvt": "10/09/2026"}),
        _row(Code="2", **{"Date mvt": "08/09/2026"}),
        _row(Code="3", **{"Date mvt": "09/09/2026"}),
    ])
    res = mouvements.run_mouvement_import(p, rayon="frais-surgele")
    assert res["ok"]
    assert res["resume"]["jours"] == ["2026-09-08", "2026-09-09", "2026-09-10"]
    assert res["resume"]["jours_importes"] == ["2026-09-08", "2026-09-09", "2026-09-10"]
    assert res["resume"]["nb_mouvements"] == 3
    with db.lock_conn() as conn:
        n = conn.execute("SELECT COUNT(*) FROM mouvement_imports WHERE rayon = 'frais-surgele'").fetchone()[0]
    assert n == 3
    # Redépôt exact : tout est déjà importé, zéro doublon.
    res2 = mouvements.run_mouvement_import(p, rayon="frais-surgele")
    assert res2["ok"] and res2["resume"].get("deja_importe") is True
    with db.lock_conn() as conn:
        n2 = conn.execute("SELECT COUNT(*) FROM mouvements WHERE rayon = 'frais-surgele'").fetchone()[0]
    assert n2 == 3


def test_split_chevauchement_partiel(tmp_path, fresh_db):
    p1 = str(tmp_path / "m1.xlsx")
    _write_xlsx(p1, [_row(Code="1", **{"Date mvt": "08/09/2026"})])
    assert mouvements.run_mouvement_import(p1, rayon="frais-surgele")["ok"]
    p2 = str(tmp_path / "m2.xlsx")
    _write_xlsx(p2, [
        _row(Code="1", **{"Date mvt": "08/09/2026", "Qté UC": "9"}),
        _row(Code="2", **{"Date mvt": "09/09/2026"}),
    ])
    res = mouvements.run_mouvement_import(p2, rayon="frais-surgele")
    assert res["ok"]
    assert res["resume"]["jours_deja"] == ["2026-09-08"]
    assert res["resume"]["jours_importes"] == ["2026-09-09"]


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
    det = resume["details"]["2026-09-13"]
    assert resume["nb_mouvements"] == 379
    assert det["nb_articles"] == 356
    assert det["familles"].get("vente") == 342
    assert det["familles"].get("type_inconnu", 0) == 0
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
    assert res["resume"]["details"]["2026-09-13"]["reconciliation"]["statut"] == "reconcilié"
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
    assert res["resume"]["details"]["2026-09-13"]["reconciliation"]["nb_ecarts"] == 1
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
    assert res["resume"]["details"]["2026-09-13"]["reconciliation"]["statut"] == "mouvements_sans_gamme"


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
    ind = res["resume"]["details"]["2026-09-13"]["indicateurs"]
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
    assert res["resume"]["details"]["2026-09-13"]["indicateurs"]["ca"] == 400.0


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
            {"code": 11, "stock": 10, "couv": 30, "px_revient": 100},   # vendu 01/06, trou après → partiel (borne 13/09)
            {"code": 12, "stock": 10, "couv": 30, "px_revient": 100},   # actif
            {"code": 13, "stock": 5, "couv": 999, "px_revient": 50},    # estimé
            {"code": 14, "stock": 7, "couv": 30, "px_revient": 50},     # partiel (jamais vendu)
            {"code": 15, "stock": 9, "couv": 999, "px_revient": 50},    # partiel + faux dormant
            {"code": 16, "stock": 0, "couv": 999, "px_revient": 50},    # exclu (stock nul)
        ])
        ind = mouvements.indicateurs_jour(conn, "frais-surgele", "2026-09-13")
    d = ind["dormants"]
    assert d["fenetre"] == {"debut": "2026-09-13", "longueur": 1}
    assert d["nb_prouves"] == 0 and d["nb_estimes"] == 1
    assert d["capital_prouve"] == 0.0
    assert len(d["faux_dormants"]) == 1 and d["faux_dormants"][0]["code"] == 15
    assert d["dormants_caches"] == []


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
    ind = res["resume"]["details"]["2026-09-13"]["indicateurs"]
    assert ind["prix_delta"][0]["code"] == 21 and ind["prix_delta"][0]["delta"] == 40.0
    assert ind["demarque"]["perime"] == {"qte": 3.0, "valeur": 90.0}
    assert ind["demarque"]["casse_rayon"] == {"qte": 2.0, "valeur": 40.0}


def test_indicateurs_sans_gamme_prix_manquants(tmp_path, fresh_db):
    # Jour sans gamme : ventes existantes mais CA INCONNU (pas 0).
    p = str(tmp_path / "m.xlsx")
    _write_xlsx(p, [_row(**{"Qté UC": "5"})])
    res = mouvements.run_mouvement_import(p, rayon="frais-surgele")
    assert res["ok"]
    ind = res["resume"]["details"]["2026-09-13"]["indicateurs"]
    assert ind["prix_manquants"] is True
    assert ind["ca"] is None and ind["marge_encaissee"] is None
    assert ind["ventes_sans_prix"] == 1


def _mvt_row(iid, jour, rayon, code, code_mvt="SM", sens="-", qte=1.0, heure="12:00:00"):
    return (iid, jour, rayon, code, f"ART {code}", "02-001", code_mvt, "lib",
            {"SM": "vente"}.get(code_mvt, "inventaire"), None, "0",
            qte, sens, qte if sens == "+" else -qte, 100.0, 100.0 * qte, None,
            heure, "", None, None, None, None, None, None, None, None, None, None,
            "f.xlsx", "h")


def _jours_consecutifs(conn, rayon, premier, n, code_vendu=None, trous=()):
    """Importe n jours consécutifs (insert direct, sans Excel)."""
    from datetime import date, timedelta
    from app import db as _db

    d0 = date.fromisoformat(premier)
    for i in range(n):
        j = (d0 + timedelta(days=i)).isoformat()
        if j in trous:
            continue
        iid = _db.create_mouvement_import(conn, rayon, j, "f.xlsx", f"h{j}", "ok", nb_mouvements=1)
        rows = []
        if code_vendu is not None and i == 0:
            rows.append(_mvt_row(iid, j, rayon, code_vendu))
        _db.insert_mouvements(conn, iid, rayon, j, rows or
                              [_mvt_row(iid, j, rayon, 999999, "EI", "+", 0.0)])


def test_dormant_prouve_fenetre_complete(fresh_db):
    # Cas X-2024 : jamais vu sur 91 jours consécutifs → prouvé avec borne.
    with db.lock_conn() as conn:
        _jours_consecutifs(conn, "frais-surgele", "2026-06-15", 91, code_vendu=98)
        _gamme_full(conn, "frais-surgele", "2026-09-13", [
            {"code": 97, "stock": 4, "couv": 30, "px_revient": 25},   # jamais vu → prouvé
            {"code": 98, "stock": 2, "couv": 30, "px_revient": 10},   # vendu jour 1 (gap 90) → prouvé
        ])
        ind = mouvements.indicateurs_jour(conn, "frais-surgele", "2026-09-13")
    d = ind["dormants"]
    assert d["fenetre"] == {"debut": "2026-06-15", "longueur": 91}
    assert d["nb_prouves"] == 2
    x = [t for t in d["top_prouves"] if t["code"] == 97][0]
    assert x["borne_preuve"] == "2026-06-15" and x["dernier_vente"] is None
    assert d["capital_prouve"] == 120.0


def test_dormant_trou_restart(fresh_db):
    # Trou au milieu : la fenêtre redémarre, pas de preuve sur le trou.
    with db.lock_conn() as conn:
        _jours_consecutifs(conn, "frais-surgele", "2026-06-15", 91, trous=("2026-07-30",))
        _gamme_full(conn, "frais-surgele", "2026-09-13", [
            {"code": 97, "stock": 4, "couv": 30, "px_revient": 25},
        ])
        ind = mouvements.indicateurs_jour(conn, "frais-surgele", "2026-09-13")
    d = ind["dormants"]
    assert d["fenetre"] == {"debut": "2026-07-31", "longueur": 45}
    assert d["nb_prouves"] == 0 and d["nb_estimes"] == 0


def test_nouvel_article_informatif(fresh_db):
    with db.lock_conn() as conn:
        _gamme_jour(conn, "frais-surgele", "2026-09-13", {101: 10})
        iid14 = _gamme_jour(conn, "frais-surgele", "2026-09-14", {101: 10, 202: 5})
        ecarts, _ = mouvements.reconcile_jour(conn, "frais-surgele", "2026-09-13")
    assert ecarts == []
    with db.lock_conn() as conn:
        anoms = conn.execute(
            "SELECT code, type FROM anomalies WHERE import_id = ?", (iid14,)).fetchall()
    assert [(a["code"], a["type"]) for a in anoms] == [(202, "nouvel_article")]


def test_chevauchement_snapshot(fresh_db):
    import pandas as pd

    df = pd.DataFrame([
        _row(Code="301", **{"Code mvt": "RM", "Qté UC": "2", "Heure mvt": "09:35:00"}),
        _row(Code="302", **{"Qté UC": "2", "Heure mvt": "14:00:00"}),
    ], columns=COLS)
    lignes, _ = mouvements.validate_mouvements(df)
    assert len(lignes) == 2
    with db.lock_conn() as conn:
        _gamme_jour(conn, "frais-surgele", "2026-09-13", {301: 10, 302: 10})
        _gamme_jour(conn, "frais-surgele", "2026-09-14", {301: 10, 302: 10})
        iid = db.create_mouvement_import(conn, "frais-surgele", "2026-09-13", "f.xlsx",
                                         "hchev", "ok", nb_mouvements=2)
        for l in lignes:
            db.insert_mouvements(conn, iid, "frais-surgele", "2026-09-13",
                                 [tuple([iid, "2026-09-13", "frais-surgele", l["code"], None, None,
                                         l["code_mvt"], None, l["type_normalise"], None, None,
                                         l["quantite"], l["sens"], l["quantite_signee"], None, None, None,
                                         l["heure_mvt"], None, None, None, None, None, None, None,
                                         None, None, None, None, "f.xlsx", "hchev"])])
        ecarts, _ = mouvements.reconcile_jour(conn, "frais-surgele", "2026-09-13")
    par_code = {e["code"]: e for e in ecarts}
    assert par_code[301]["chevauchement_snapshot"] is True
    assert par_code[302]["chevauchement_snapshot"] is False


def test_chaine_apres_incoherente_warning(fresh_db):
    import pandas as pd

    df = pd.DataFrame([
        _row(**{"Heure mvt": "09:00:00", "Qte. apres  mouvement.": "14"}),
        _row(**{"Qté UC": "3", "Heure mvt": "14:00:00", "Qte. apres  mouvement.": "5"}),
    ], columns=COLS)
    lignes, meta = mouvements.validate_mouvements(df)
    assert lignes is not None
    assert any("Chaîne Qte.après incohérente" in w for w in meta["avertissements"])
