"""Backfill des compensateurs LLM pour des imports existants (sans ré-importer).

Usage : python backfill_compensations.py <import_id> [<import_id> ...]
- lit l'archive réelle de l'import ;
- recalcule les compensateurs des négatifs actifs (code corrigé : thinking disabled) ;
- remplace les lignes de la table compensations de cet import ;
- met à jour rapports.resume_json (compensateurs_trouves / sans / llm_error).
Idempotent : peut être relancé (remplacement, pas duplication).
"""
import json
import sqlite3
import sys

from app import compensation as comp_mod
from app import config, db, pipeline

MAX_LLM = config.MAX_LLM_ARTICLES


def backfill(import_id: int):
    with db.lock_conn() as conn:
        imp = conn.execute(
            "SELECT id, rayon, jour, archive_path, statut FROM imports WHERE id = ?",
            (import_id,),
        ).fetchone()
        if imp is None:
            print(f"[{import_id}] import introuvable — ignoré")
            return
        if imp["statut"] not in ("ok", "baseline"):
            print(f"[{import_id}] statut {imp['statut']} — ignoré")
            return
        negs = [dict(r) for r in conn.execute(
            f"SELECT n.code, n.statut, n.priorite FROM negatifs_journaliers n "
            f"WHERE n.import_id = ? AND n.statut != 'corrige' "
            f"ORDER BY {db.PRIORITY_ORDER if hasattr(db, 'PRIORITY_ORDER') else 'CASE n.priorite WHEN \'critique\' THEN 0 WHEN \'important\' THEN 1 ELSE 2 END'}, n.code",
            (import_id,),
        ).fetchall()]

    if not negs:
        print(f"[{import_id}] {imp['rayon']} {imp['jour']} : aucun négatif actif — rien à faire")
        return

    df, err = pipeline.validate_file(imp["archive_path"])
    if df is None:
        print(f"[{import_id}] archive illisible ({err}) — ignoré")
        return

    scope = negs[:MAX_LLM]
    codes = [n["code"] for n in scope]
    print(f"[{import_id}] {imp['rayon']} {imp['jour']} : {len(negs)} négatifs, "
          f"{len(codes)} analysés par le LLM (plafond {MAX_LLM})…")

    compensations, errors = comp_mod.compensate(df, sorted(codes))

    with sqlite3.connect(config.DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute("DELETE FROM compensations WHERE import_id = ?", (import_id,))
        for code, results in compensations.items():
            db.record_compensations(conn, import_id, imp["rayon"], imp["jour"], code, results)

        trouves = sum(1 for c in compensations.values() if any(x.get("code") for x in c))
        sans = sum(1 for c in compensations.values() if not any(x.get("code") for x in c))
        llm_error = (
            f"{len(errors)} lot(s) LLM sans réponse exploitable — " + " | ".join(errors[:3])
            if errors else None
        )
        r = conn.execute(
            "SELECT resume_json FROM rapports WHERE import_id = ?", (import_id,)
        ).fetchone()
        if r is not None:
            resume = json.loads(r["resume_json"] or "{}")
            resume.update({
                "compensateurs_trouves": trouves,
                "sans_compensateur": sans,
                "non_analyses": max(len(negs) - len(codes), 0),
                "llm_error": llm_error,
            })
            conn.execute(
                "UPDATE rapports SET resume_json = ? WHERE import_id = ?",
                (json.dumps(resume, ensure_ascii=False), import_id),
            )
        conn.commit()

    print(f"[{import_id}] OK : {trouves} compensés, {sans} sans, llm_error={llm_error}")
    for code in sorted(compensations):
        comps = compensations[code]
        best = comps[0] if comps else None
        if best and best.get("code"):
            print(f"   {code} → {best['code']} {str(best.get('libelle'))[:40]} ({best.get('confiance')}) +{len(comps)-1} autres")
        else:
            raison = (best or {}).get("justification") or "aucun"
            print(f"   {code} → AUCUN ({raison})")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    for arg in sys.argv[1:]:
        backfill(int(arg))
