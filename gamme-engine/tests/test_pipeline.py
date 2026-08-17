import pytest

from app import config, db, pipeline


def write_csv(path, df):
    df.to_csv(path, sep=";", index=False)


def test_validate_file_missing_columns(tmp_path):
    p = tmp_path / "mauvais.csv"
    p.write_text("Code;Libellé\n1;Pain\n", encoding="utf-8")
    df, err = pipeline.validate_file(str(p))
    assert df is None
    assert "Colonnes manquantes" in err


def test_validate_file_duplicate_codes(tmp_path, make_df):
    df = make_df([{"Code": 1, "Libellé": "A"}, {"Code": 1, "Libellé": "B"}])
    p = tmp_path / "dup.csv"
    write_csv(p, df)
    out, err = pipeline.validate_file(str(p))
    assert out is None
    assert "doublon" in err


def test_validate_file_non_numeric_codes(tmp_path, make_df):
    df = make_df([{"Code": "ABC", "Libellé": "A"}])
    p = tmp_path / "nonnum.csv"
    write_csv(p, df)
    out, err = pipeline.validate_file(str(p))
    assert out is None
    assert "non numériques" in err


def test_validate_file_ok(tmp_path, make_df):
    df = make_df([
        {"Code": 1, "Libellé": "Pain", "Stock": 5},
        {"Code": 2, "Libellé": "Lait", "Stock": -2},
    ])
    p = tmp_path / "ok.csv"
    write_csv(p, df)
    out, err = pipeline.validate_file(str(p))
    assert err is None
    assert len(out) == 2


def _insert_import(conn, rayon, jour, fichier, h):
    return db.create_import(conn, rayon, jour, fichier, h, "ok", nb_articles=0)


def test_full_analysis_classification(fresh_db, make_df):
    j1, j = "2026-08-10", "2026-08-11"
    df_j1 = make_df([
        {"Code": 1, "Libellé": "A", "Stock": 5},
        {"Code": 2, "Libellé": "B", "Stock": -3},
        {"Code": 3, "Libellé": "C", "Stock": 0},
        {"Code": 4, "Libellé": "D", "Stock": 10},
        {"Code": 5, "Libellé": "E", "Stock": -2},
    ])
    df_j = make_df([
        {"Code": 1, "Libellé": "A", "Stock": -4},
        {"Code": 2, "Libellé": "B", "Stock": -8},
        {"Code": 3, "Libellé": "C", "Stock": -2, "Px vente": 2.0, "PV promo": 1.0},
        {"Code": 4, "Libellé": "D", "Stock": 10, "Marge %": -5.0},
        {"Code": 5, "Libellé": "E", "Stock": 3},
    ])
    with db.lock_conn() as conn:
        prev_id = _insert_import(conn, "test", j1, "f1.csv", "h1")
        db.insert_snapshot(conn, prev_id, "test", j1, df_j1)
        import_id = _insert_import(conn, "test", j, "f2.csv", "h2")
        db.insert_snapshot(conn, import_id, "test", j, df_j)
        negatifs, anomalies, compared = pipeline.full_analysis(
            conn, import_id, "test", j, df_j, prev_id, 5, "arch")

    by_code = {n["code"]: n for n in negatifs}
    assert by_code[1]["statut"] == "nouveau"
    assert by_code[1]["priorite"] == "important"
    assert by_code[2]["statut"] == "persistant_aggrave"
    assert by_code[2]["priorite"] == "critique"
    assert by_code[2]["jours_consecutifs"] == 2
    assert by_code[2]["premiere_apparition"] == j1
    assert by_code[3]["statut"] == "nouveau"
    assert 5 not in by_code  # corrigé : absent de la liste des négatifs
    corriges = [c for c in compared if c["code"] == 5]
    assert corriges and corriges[0]["stock_j"] == 3 and corriges[0]["stock_j1"] == -2

    anom_types = {a["type"] for a in anomalies}
    assert "marge_negative" in anom_types
    assert "promo_active" in anom_types


def test_detect_anomalies_fortes_variations(fresh_db, make_df):
    j1, j = "2026-08-10", "2026-08-11"
    df_j1 = make_df([{"Code": 1, "Libellé": "X", "Stock": 300}, {"Code": 2, "Libellé": "Y", "Stock": 10}])
    df_j = make_df([{"Code": 1, "Libellé": "X", "Stock": 50}, {"Code": 2, "Libellé": "Y", "Stock": 400}])
    with db.lock_conn() as conn:
        prev_id = _insert_import(conn, "test", j1, "f1.csv", "h1")
        db.insert_snapshot(conn, prev_id, "test", j1, df_j1)
        import_id = _insert_import(conn, "test", j, "f2.csv", "h2")
        db.insert_snapshot(conn, import_id, "test", j, df_j)
        negatifs, anomalies, compared = pipeline.full_analysis(
            conn, import_id, "test", j, df_j, prev_id, 2, "arch")
    anom_types = {a["type"] for a in anomalies}
    assert "chute_forte" in anom_types
    assert "hausse_forte" in anom_types


def test_priorite_nouveau_critique():
    assert pipeline.priorite_nouveau({"variation": -11, "stock_j": -1}) == "critique"
    assert pipeline.priorite_nouveau({"variation": -3, "stock_j": -12}) == "critique"
    assert pipeline.priorite_nouveau({"variation": -3, "stock_j": -2}) == "important"


def test_consecutive_negatives():
    hist = [
        {"stock": 5}, {"stock": -2}, {"stock": -6}, {"stock": 0}, {"stock": -1},
    ]
    assert pipeline.consecutive_negatives(hist) == 1


def test_occurrences():
    hist = [
        {"stock": -5}, {"stock": -2}, {"stock": 0}, {"stock": 4}, {"stock": -1},
    ]
    assert pipeline.occurrences(hist, current_negative=True) == 2
    assert pipeline.occurrences(hist, current_negative=False) == 2
