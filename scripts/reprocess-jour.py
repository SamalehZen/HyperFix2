#!/usr/bin/env python3
"""Purge l'import d'un jour puis le re-traite avec le pipeline (code actuel).
Usage (depuis l'hôte) :
    docker exec -i gamme_engine python3 - < scripts/reprocess-jour.py --jour 2026-08-19
    docker exec -i gamme_engine python3 - < scripts/reprocess-jour.py --jour 2026-08-20
Le fichier source est relu depuis l'archive (imports/<rayon>/<jour>/) — aucun
redépot nécessaire. Ordre conseillé : jours les plus anciens en premier."""
import argparse
import json
import sys

sys.path.insert(0, "/app")

import app.config as config
import app.db as db
import app.pipeline as pipeline

def purge(conn, rayon, jour):
    imp = conn.execute(
        "SELECT id, fichier_source, archive_path, statut, nb_articles "
        "FROM imports WHERE rayon = ? AND jour = ? AND statut = 'ok' ORDER BY id DESC LIMIT 1",
        (rayon, jour),
    ).fetchone()
    if imp is None:
        print(f"Aucun import 'ok' pour {rayon} le {jour}.")
        return None
    if not imp["archive_path"]:
        print(f"Import {imp['id']} ({jour}) sans archive — re-run impossible.")
        return None
    iid = imp["id"]
    for table in ("anomalies", "compensations", "negatifs_journaliers", "rapports", "article_history"):
        n = conn.execute(f"SELECT COUNT(*) FROM {table} WHERE import_id = ?", (iid,)).fetchone()[0]
        conn.execute(f"DELETE FROM {table} WHERE import_id = ?", (iid,))
        print(f"  purgé {table}: {n} lignes")
    conn.execute("DELETE FROM imports WHERE id = ?", (iid,))
    print(f"  purgé imports: {imp['id']} ({imp['fichier_source']})")
    conn.commit()
    return imp

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jour", required=True, help="Jour à re-traiter (YYYY-MM-DD)")
    ap.add_argument("--rayon", default=config.RAYON)
    args = ap.parse_args()

    with db.lock_conn() as conn:
        imp = purge(conn, args.rayon, args.jour)
    if imp is None:
        sys.exit(1)

    res = pipeline.run_import(imp["archive_path"], rayon=args.rayon, force_jour=args.jour)
    if not res.get("ok"):
        print(f"✗ Re-import échoué : {res.get('erreur')}")
        sys.exit(1)
    print(f"✓ Re-import réussi ({args.jour}) : {json.dumps(res.get('resume'), ensure_ascii=False)}")

main()