"""Recalcule premiere_apparition / jours_consecutifs / nb_occurrences des
négatifs journaliers (corrigés inclus) d'un import, depuis article_history.

Corrige le bug pipeline historique : l'historique n'était chargé que pour les
articles négatifs du jour → les corrigés perdaient leur vraie première
apparition (affichée = jour de l'import).

Usage : python -m app.fix_premiere_apparition <import_id> [<import_id> ...]
Idempotent : recalcul complet à chaque exécution, sans duplication.
"""
import sqlite3
import sys

from app import config, db
from app.pipeline import consecutive_negatives, occurrences


def fix_import(import_id: int):
    with db.lock_conn() as conn:
        imp = conn.execute(
            "SELECT id, rayon, jour FROM imports WHERE id = ?", (import_id,)
        ).fetchone()
        if imp is None:
            print(f"[{import_id}] import introuvable — ignoré")
            return
        negs = [dict(r) for r in conn.execute(
            "SELECT code, stock_j, statut FROM negatifs_journaliers WHERE import_id = ?",
            (import_id,),
        ).fetchall()]

    if not negs:
        print(f"[{import_id}] {imp['rayon']} {imp['jour']} : aucun négatif — rien à faire")
        return

    codes = [n["code"] for n in negs]
    with db.lock_conn() as conn:
        hist_all = db.load_history_for_codes(conn, import_id, codes)

    fixed = 0
    with sqlite3.connect(config.DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        for n in negs:
            hist = hist_all.get(n["code"], [])
            hist_neg = [r for r in hist if r["stock"] is not None and r["stock"] < 0]
            cur_neg = n["stock_j"] is not None and n["stock_j"] < 0
            premiere = hist_neg[0]["jour"] if hist_neg else imp["jour"]
            jours_cons = consecutive_negatives(hist) + (1 if cur_neg else 0)
            nb_occ = occurrences(hist, cur_neg)
            row = conn.execute(
                "SELECT premiere_apparition, jours_consecutifs, nb_occurrences "
                "FROM negatifs_journaliers WHERE import_id = ? AND code = ?",
                (import_id, n["code"]),
            ).fetchone()
            changed = (row["premiere_apparition"] != premiere
                       or row["jours_consecutifs"] != jours_cons
                       or row["nb_occurrences"] != nb_occ)
            if changed:
                conn.execute(
                    "UPDATE negatifs_journaliers SET premiere_apparition = ?, "
                    "jours_consecutifs = ?, nb_occurrences = ? "
                    "WHERE import_id = ? AND code = ?",
                    (premiere, jours_cons, nb_occ, import_id, n["code"]),
                )
                fixed += 1
                print(f"   {n['code']} ({n['statut']}): 1re {row['premiere_apparition']}→{premiere} "
                      f"| j.nég {row['jours_consecutifs']}→{jours_cons} | occ {row['nb_occurrences']}→{nb_occ}")
        conn.commit()
    print(f"[{import_id}] {imp['rayon']} {imp['jour']} : {fixed}/{len(negs)} ligne(s) corrigée(s)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    for arg in sys.argv[1:]:
        fix_import(int(arg))
