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
