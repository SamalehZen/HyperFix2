import json
import re
import uuid

import duckdb

from . import config

MAX_ROWS = 500

# Opérations non autorisées : écritures, DDL, fichiers, maintenance.
FORBIDDEN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|MERGE|UPSERT|ATTACH|DETACH|COPY|PRAGMA|CREATE|DROP|ALTER|"
    r"TRUNCATE|EXPORT|IMPORT|CALL|INSTALL|LOAD|SET|RESET|CHECKPOINT|VACUUM|"
    r"read_xlsx|read_parquet|read_csv|duckdb_scan|duckdb_tables|pragma_database_list)\b",
    re.IGNORECASE,
)

READ_ONLY_START = re.compile(r"^\s*(SELECT|WITH)\b", re.IGNORECASE)

# Valeurs non sérialisables (dates DuckDB, Decimal...) -> str
def _clean(v):
    if v is None:
        return None
    if isinstance(v, (str, int, float, bool)):
        return v
    return str(v)


def run_query(sql: str, rayon: str) -> str:
    """Exécute une requête SELECT en lecture seule sur gamme.duckdb, filtrée par rayon.

    La table `gamme_commande` est exposée via une vue pré-filtrée sur le rayon du
    gestionnaire : le SQL de l'agent s'exécute tel quel, sans colonne rayon requise.
    La base physique est attachée sous un alias aléatoire (par appel) : aucune
    requête ne peut référencer directement la table complète.

    Retourne un JSON : {"success": true, "columns": [...], "rows": [...], "rowCount": N}
    ou {"success": false, "erreur": "..."}.
    """
    sql = sql.strip().rstrip(";").strip()
    if not sql:
        return json.dumps({"success": False, "erreur": "Requête vide."}, ensure_ascii=False)
    if not READ_ONLY_START.match(sql):
        return json.dumps(
            {"success": False, "erreur": "Seules les requêtes SELECT/WITH en lecture seule sont autorisées."},
            ensure_ascii=False,
        )
    if FORBIDDEN.search(sql):
        return json.dumps(
            {"success": False, "erreur": "Requête refusée : opérations d'écriture, DDL ou fonctions de fichiers interdites."},
            ensure_ascii=False,
        )
    if rayon not in config.rayon_ids():
        return json.dumps(
            {"success": False, "erreur": f"Rayon inconnu : {rayon}. Rayons disponibles : {', '.join(config.rayon_ids())}"},
            ensure_ascii=False,
        )

    # Alias aléatoire par appel : la base complète n'est jamais référençable.
    alias = "g_" + uuid.uuid4().hex[:12]
    # Échappement simple : rayon = id contrôlé de rayons.json (vocabulaire serveur).
    rayon_sql = rayon.replace("'", "''")

    try:
        con = duckdb.connect()
        try:
            con.execute(f"ATTACH '{config.NAO_DB_PATH}' AS {alias} (READ_ONLY)")
            con.execute(
                f"CREATE OR REPLACE VIEW gamme_commande AS "
                f"SELECT * FROM {alias}.gamme_commande WHERE rayon = '{rayon_sql}'"
            )
            wrapped = f"SELECT * FROM (\n{sql}\n) AS _gamme_query LIMIT {MAX_ROWS}"
            rows = con.execute(wrapped).fetchall()
            cols = [d[0] for d in con.description] if con.description else []
        finally:
            con.close()
    except duckdb.Error as e:
        return json.dumps(
            {"success": False, "erreur": f"Erreur SQL : {e}"},
            ensure_ascii=False,
        )
    except Exception as e:
        return json.dumps(
            {"success": False, "erreur": f"Erreur inattendue : {e}"},
            ensure_ascii=False,
        )

    data = [[_clean(v) for v in row] for row in rows]
    return json.dumps(
        {"success": True, "columns": cols, "rows": data, "rowCount": len(data)},
        ensure_ascii=False,
    )

def run_history_query(sql: str, rayon: str, jour: str) -> str:
    """Exécute une requête SELECT en lecture seule sur article_history (SQLite),
    restreinte à un jour et un rayon.

    L'agent écrit du SQL naturel sur la table `article_history` sans ajouter
    `jour` ni `rayon` : une vue temporaire pré-filtrée est créée pour chaque
    appel. Retourne le même format JSON que run_query.
    """
    import sqlite3

    sql = sql.strip().rstrip(";").strip()
    if not sql:
        return json.dumps({"success": False, "erreur": "Requête vide."}, ensure_ascii=False)
    if not READ_ONLY_START.match(sql):
        return json.dumps(
            {"success": False, "erreur": "Seules les requêtes SELECT/WITH en lecture seule sont autorisées."},
            ensure_ascii=False,
        )
    if FORBIDDEN.search(sql):
        return json.dumps(
            {"success": False, "erreur": "Requête refusée : opérations d'écriture, DDL ou fonctions de fichiers interdites."},
            ensure_ascii=False,
        )
    if rayon not in config.rayon_ids():
        return json.dumps(
            {"success": False, "erreur": f"Rayon inconnu : {rayon}. Rayons disponibles : {', '.join(config.rayon_ids())}"},
            ensure_ascii=False,
        )
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", jour or ""):
        return json.dumps(
            {"success": False, "erreur": f"Jour invalide : {jour!r}. Format attendu : YYYY-MM-DD."},
            ensure_ascii=False,
        )

    rayon_sql = rayon.replace("'", "''")
    jour_sql = jour.replace("'", "''")

    try:
        con = sqlite3.connect(f"file:{config.DB_PATH}?mode=ro", uri=True)
        try:
            exists = con.execute(
                "SELECT 1 FROM imports WHERE rayon = ? AND jour = ? LIMIT 1", (rayon, jour)
            ).fetchone()
            if not exists:
                jours = [r[0] for r in con.execute(
                    "SELECT DISTINCT jour FROM article_history WHERE rayon = ? ORDER BY jour", (rayon,)
                ).fetchall()]
                return json.dumps(
                    {"success": False,
                     "erreur": f"Aucun import pour le {jour}. Jours disponibles : {', '.join(jours)}"},
                    ensure_ascii=False,
                )
            con.execute(
                f"CREATE TEMP VIEW article_history AS "
                f"SELECT * FROM main.article_history WHERE jour = '{jour_sql}' AND rayon = '{rayon_sql}'"
            )
            wrapped = f"SELECT * FROM (\n{sql}\n) AS _history_query LIMIT {MAX_ROWS}"
            cols = [d[0] for d in con.execute(wrapped).description]
            rows = con.execute(wrapped).fetchall()
        finally:
            con.close()
    except sqlite3.Error as e:
        return json.dumps(
            {"success": False, "erreur": f"Erreur SQL : {e}"},
            ensure_ascii=False,
        )
    except Exception as e:
        return json.dumps(
            {"success": False, "erreur": f"Erreur inattendue : {e}"},
            ensure_ascii=False,
        )

    rows = [[_clean(v) for v in r] for r in rows]
    return json.dumps(
        {"success": True, "jour": jour, "columns": cols, "rows": rows, "rowCount": len(rows)},
        ensure_ascii=False,
    )

