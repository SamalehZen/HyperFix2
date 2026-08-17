from app import db


def test_hash_filtre_statut(fresh_db):
    with db.lock_conn() as conn:
        db.create_import(conn, "r", "2026-08-11", "f.csv", "hash-err", "erreur", message="x")
        assert db.has_import_with_hash(conn, "hash-err") is True
        assert db.has_import_with_hash(conn, "hash-err", statut_ok_only=True) is False
        info = db.import_statut_for_hash(conn, "hash-err", "r")
        assert info == (1, "erreur", False)

        db.create_import(conn, "r", "2026-08-11", "g.csv", "hash-ok", "ok")
        assert db.has_import_with_hash(conn, "hash-ok", statut_ok_only=True) is True
        info = db.import_statut_for_hash(conn, "hash-ok", "r")
        assert info[0] == 2 and info[1] == "ok" and info[2] is False

        db.set_import_statut(conn, 2, "erreur", "Import incomplet")
        info = db.import_statut_for_hash(conn, "hash-ok", "r")
        assert info[1] == "erreur"
        assert db.has_import_with_hash(conn, "hash-ok", statut_ok_only=True) is False


def test_import_statut_for_hash_filtre_rayon(fresh_db):
    with db.lock_conn() as conn:
        db.create_import(conn, "rayon-a", "2026-08-11", "f.csv", "hash-x", "ok")
        assert db.import_statut_for_hash(conn, "hash-x", "rayon-b") is None
        assert db.import_statut_for_hash(conn, "hash-x", "rayon-a") is not None


def test_indexes_rayon_jour(fresh_db):
    with db.lock_conn() as conn:
        for table in ("negatifs_journaliers", "compensations", "anomalies", "rapports"):
            names = {r["name"] for r in conn.execute(f"PRAGMA index_list({table})")}
            assert f"idx_{table}_rayon_jour" in names
