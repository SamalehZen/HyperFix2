import json
import sqlite3
import threading
from contextlib import contextmanager

from . import config

_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rayon TEXT NOT NULL,
    jour TEXT NOT NULL,
    date_import TEXT NOT NULL,
    fichier_source TEXT NOT NULL,
    archive_path TEXT,
    hash_sha256 TEXT NOT NULL,
    nb_articles INTEGER NOT NULL,
    statut TEXT NOT NULL,
    message TEXT
);
CREATE TABLE IF NOT EXISTS article_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_id INTEGER NOT NULL,
    jour TEXT NOT NULL,
    rayon TEXT NOT NULL,
    code INTEGER NOT NULL,
    ean TEXT, libelle TEXT, fournisseur TEXT,
    px_achat_fac REAL, px_achat_tv REAL, px_revient REAL,
    tva REAL, quar REAL, assort REAL, marque TEXT, attribut TEXT,
    collection TEXT, px_vente REAL, pv_promo REAL,
    date_dbt TEXT, date_fin TEXT, marge_pct REAL, marge_promo_pct REAL,
    sa TEXT, sf TEXT, nb_uc_pcb REAL, mini_cde REAL, maxi REAL,
    incre REAL, mode_reappr TEXT, couv REAL, stock REAL,
    valeur_stock_prmp REAL, en_cours REAL,
    UNIQUE(import_id, code)
);
CREATE INDEX IF NOT EXISTS idx_article_history_code ON article_history(code, jour);
CREATE INDEX IF NOT EXISTS idx_article_history_import ON article_history(import_id);
CREATE TABLE IF NOT EXISTS negatifs_journaliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_id INTEGER NOT NULL,
    rayon TEXT NOT NULL,
    jour TEXT NOT NULL,
    code INTEGER NOT NULL,
    stock_j1 REAL, stock_j REAL NOT NULL,
    variation REAL,
    statut TEXT NOT NULL,
    jours_consecutifs INTEGER NOT NULL,
    premiere_apparition TEXT,
    nb_occurrences INTEGER NOT NULL,
    priorite TEXT NOT NULL,
    UNIQUE(import_id, code)
);
CREATE TABLE IF NOT EXISTS compensations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_id INTEGER NOT NULL,
    rayon TEXT NOT NULL,
    jour TEXT NOT NULL,
    code_negatif INTEGER NOT NULL,
    code_compensateur INTEGER,
    rang INTEGER,
    score REAL,
    confiance TEXT,
    justification TEXT,
    criteres_json TEXT,
    libelle_compensateur TEXT,
    px_revient_compensateur REAL,
    couv_compensateur REAL,
    stock_compensateur REAL,
    px_vente_compensateur REAL
);
CREATE TABLE IF NOT EXISTS anomalies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_id INTEGER NOT NULL,
    rayon TEXT NOT NULL,
    jour TEXT NOT NULL,
    code INTEGER,
    type TEXT NOT NULL,
    description TEXT,
    valeur_j1 REAL,
    valeur_j REAL
);
CREATE TABLE IF NOT EXISTS rapports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_id INTEGER NOT NULL,
    rayon TEXT NOT NULL,
    jour TEXT NOT NULL,
    chemin_md TEXT,
    chemin_html TEXT,
    chemin_story TEXT,
    resume_json TEXT,
    created_at TEXT
);
"""


def init_db():
    with lock_conn() as conn:
        conn.executescript(SCHEMA)
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(compensations)")}
        for name, ddl in (
            ("libelle_compensateur", "ALTER TABLE compensations ADD COLUMN libelle_compensateur TEXT"),
            ("px_revient_compensateur", "ALTER TABLE compensations ADD COLUMN px_revient_compensateur REAL"),
            ("couv_compensateur", "ALTER TABLE compensations ADD COLUMN couv_compensateur REAL"),
            ("stock_compensateur", "ALTER TABLE compensations ADD COLUMN stock_compensateur REAL"),
            ("px_vente_compensateur", "ALTER TABLE compensations ADD COLUMN px_vente_compensateur REAL"),
        ):
            if name not in cols:
                conn.execute(ddl)
        for table, cols_extra in (
            ("negatifs_journaliers", ("rayon",)),
            ("compensations", ("rayon",)),
            ("anomalies", ("rayon",)),
            ("rapports", ("rayon", "chemin_story")),
        ):
            existing = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}
            for col in cols_extra:
                if col == "rayon":
                    if "rayon" not in existing:
                        conn.execute(f"ALTER TABLE {table} ADD COLUMN rayon TEXT")
                        conn.execute(f"UPDATE {table} SET rayon = (SELECT r.rayon FROM imports r WHERE r.id = {table}.import_id)")
                elif col == "chemin_story":
                    if "chemin_story" not in existing:
                        conn.execute("ALTER TABLE rapports ADD COLUMN chemin_story TEXT")


@contextmanager
def lock_conn():
    with _lock:
        conn = sqlite3.connect(config.DB_PATH)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()


def create_import(conn, rayon, jour, fichier_source, hash_sha256, statut, message="", nb_articles=0, archive_path=None):
    cur = conn.execute(
        "INSERT INTO imports (rayon, jour, date_import, fichier_source, archive_path, hash_sha256, nb_articles, statut, message) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (rayon, jour, datetime_now(), fichier_source, archive_path, hash_sha256, nb_articles, statut, message),
    )
    return cur.lastrowid


def insert_snapshot(conn, import_id, rayon, jour, df):
    rows = []
    for d in df.to_dict("records"):
        rows.append((
            import_id, jour, rayon,
            d.get("Code"), clean_str(d.get("EAN")), clean_str(d.get("Libellé")), clean_str(d.get("Fournisseur")),
            num(d.get("Px achat fac")), num(d.get("Px achat tv")), num(d.get("Px revient")),
            num(d.get("TVA %")), num(d.get("Quar")), num(d.get("Assort.")), clean_str(d.get("Marque")), clean_str(d.get("Attribut")),
            clean_str(d.get("Collection")), num(d.get("Px vente")), num(d.get("PV promo")),
            fmt_date(d.get("Date Dbt")), fmt_date(d.get("Date fin")), num(d.get("Marge %")), num(d.get("Marge Promo %")),
            clean_str(d.get("SA")), clean_str(d.get("SF")), num(d.get("Nb UC/PCB")), num(d.get("Mini cde")),
            num(d.get("Maxi")), num(d.get("Incré")), clean_str(d.get("Mode réappr.")),
            num(d.get("Couv. ")), num(d.get("Stock")), num(d.get("Valeur stock   PRMP")), num(d.get("En cours")),
        ))
    conn.executemany(
        "INSERT OR REPLACE INTO article_history "
        "(import_id, jour, rayon, code, ean, libelle, fournisseur, px_achat_fac, px_achat_tv, px_revient, "
        "tva, quar, assort, marque, attribut, collection, px_vente, pv_promo, date_dbt, date_fin, "
        "marge_pct, marge_promo_pct, sa, sf, nb_uc_pcb, mini_cde, maxi, incre, mode_reappr, couv, "
        "stock, valeur_stock_prmp, en_cours) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        rows,
    )


def get_previous_import(conn, import_id):
    row = conn.execute("SELECT rayon, jour FROM imports WHERE id = ?", (import_id,)).fetchone()
    if row is None:
        return None
    # Comparaison J/J-1 : on ignore les autres imports du MÊME jour (un fichier
    # ré-importé dans la journée ne doit jamais servir de référence J-1).
    prev = conn.execute(
        "SELECT id FROM imports WHERE id < ? AND rayon = ? AND jour < ? AND statut IN ('ok','baseline') ORDER BY id DESC LIMIT 1",
        (import_id, row["rayon"], row["jour"]),
    ).fetchone()
    return prev["id"] if prev else None


def load_snapshot(conn, import_id):
    rows = conn.execute("SELECT * FROM article_history WHERE import_id = ?", (import_id,)).fetchall()
    return {r["code"]: dict(r) for r in rows}


def load_history_for_codes(conn, before_import_id, codes):
    if not codes:
        return {}
    rayon = conn.execute("SELECT rayon FROM imports WHERE id = ?", (before_import_id,)).fetchone()["rayon"]
    ph = ",".join("?" * len(codes))
    rows = conn.execute(
        f"SELECT code, jour, stock FROM article_history WHERE import_id < ? AND rayon = ? AND code IN ({ph}) ORDER BY import_id",
        (before_import_id, rayon, *codes),
    ).fetchall()
    out = {}
    for r in rows:
        out.setdefault(r["code"], []).append(r)
    return out


def record_negatif(conn, import_id, rayon, jour, code, stock_j1, stock_j, variation, statut, jours_consecutifs, premiere_apparition, nb_occurrences, priorite):
    conn.execute(
        "INSERT OR REPLACE INTO negatifs_journaliers "
        "(import_id, rayon, jour, code, stock_j1, stock_j, variation, statut, jours_consecutifs, premiere_apparition, nb_occurrences, priorite) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (import_id, rayon, jour, code, stock_j1, stock_j, variation, statut, jours_consecutifs, premiere_apparition, nb_occurrences, priorite),
    )


def record_compensations(conn, import_id, rayon, jour, code_negatif, results):
    for i, r in enumerate(results, start=1):
        conn.execute(
            "INSERT INTO compensations (import_id, rayon, jour, code_negatif, code_compensateur, rang, score, confiance, justification, criteres_json, libelle_compensateur, px_revient_compensateur, couv_compensateur, stock_compensateur, px_vente_compensateur) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (import_id, rayon, jour, code_negatif, r.get("code"), i, r.get("score"), r.get("confiance"), r.get("justification"),
             json.dumps(r.get("criteres", {}), ensure_ascii=False),
             r.get("libelle"), r.get("px_revient"), r.get("couv"), r.get("stock"), r.get("px_vente")),
        )


def record_anomalie(conn, import_id, rayon, jour, code, type_, description, v_j1, v_j):
    conn.execute(
        "INSERT INTO anomalies (import_id, rayon, jour, code, type, description, valeur_j1, valeur_j) VALUES (?,?,?,?,?,?,?,?)",
        (import_id, rayon, jour, code, type_, description, v_j1, v_j),
    )


def record_rapport(conn, import_id, rayon, jour, chemin_md, chemin_html, resume, chemin_story=None):
    conn.execute(
        "INSERT INTO rapports (import_id, rayon, jour, chemin_md, chemin_html, chemin_story, resume_json, created_at) VALUES (?,?,?,?,?,?,?,?)",
        (import_id, rayon, jour, chemin_md, chemin_html, chemin_story, json.dumps(resume, ensure_ascii=False), datetime_now()),
    )


def sha256_file(path):
    h = hashlib_sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def has_import_with_hash(conn, h):
    return conn.execute("SELECT 1 FROM imports WHERE hash_sha256 = ?", (h,)).fetchone() is not None


def datetime_now():
    from datetime import datetime
    return datetime.now().isoformat(timespec="seconds")


def hashlib_sha256():
    import hashlib
    return hashlib.sha256()


def num(v):
    if v is None:
        return None
    try:
        f = float(v)
        if f != f:
            return None
        return f
    except (TypeError, ValueError):
        return None


def clean_str(v):
    if v is None:
        return None
    if isinstance(v, float) and v != v:
        return None
    if isinstance(v, (int, float)):
        s = str(int(v)) if float(v).is_integer() else str(v)
    else:
        s = str(v).strip()
    return s or None


def fmt_date(v):
    if v is None:
        return None
    if isinstance(v, str):
        return v.strip() or None
    from datetime import datetime as _dt
    if isinstance(v, _dt):
        return v.strftime("%d/%m/%Y")
    return str(v)
