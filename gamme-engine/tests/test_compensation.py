from app import compensation as comp_mod, config, db, pipeline


def test_heuristique_trouve_candidat_similaire(make_df):
    df = make_df([
        {"Code": 1, "Libellé": "Emmental râpé 200g", "Px revient": 5.0, "Px vente": 7.0, "Stock": -5, "Couv. ": 1},
        {"Code": 2, "Libellé": "Emmental râpé 250g", "Px revient": 5.5, "Px vente": 8.0, "Stock": 10, "Couv. ": 5},
        {"Code": 3, "Libellé": "Jus d'orange 1L", "Px revient": 2.0, "Px vente": 3.0, "Stock": 20, "Couv. ": 9},
    ])
    cand = comp_mod.compensateur_heuristique(df, 1)
    assert cand is not None
    assert cand["code"] == 2
    assert cand["confiance"] == "faible"
    assert "heuristique" in cand["justification"]


def test_heuristique_sous_seuil(make_df, monkeypatch):
    monkeypatch.setattr(config, "FALLBACK_SCORE_SEUIL", 90)
    df = make_df([
        {"Code": 1, "Libellé": "Pain de mie 500g", "Px revient": 1.0, "Px vente": 2.0, "Stock": -5, "Couv. ": 1},
        {"Code": 2, "Libellé": "Eau minérale 1L", "Px revient": 0.5, "Px vente": 1.0, "Stock": 50, "Couv. ": 9},
    ])
    assert comp_mod.compensateur_heuristique(df, 1) is None


def test_compensate_llm_en_panne(make_df, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("quota épuisé")

    monkeypatch.setattr(comp_mod.llm, "chat_completion", boom)
    df = make_df([
        {"Code": 1, "Libellé": "Pain de mie 500g", "Px revient": 1.0, "Px vente": 2.0, "Stock": -5, "Couv. ": 1},
        {"Code": 2, "Libellé": "Pain de mie 400g", "Px revient": 0.9, "Px vente": 1.8, "Stock": 5, "Couv. ": 5},
        {"Code": 3, "Libellé": "Eau minérale 1L", "Px revient": 0.5, "Px vente": 1.0, "Stock": 50, "Couv. ": 9},
    ])
    results, errors, failed_codes = comp_mod.compensate(df, [1])
    assert failed_codes == {1}
    assert results[1] == []
    assert errors


def test_complete_analysis_fallback_en_base(fresh_db, make_df, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("LLM down")

    monkeypatch.setattr(pipeline.comp_mod, "compensate", boom)
    df = make_df([
        {"Code": 1, "Libellé": "Emmental râpé 200g", "Px revient": 5.0, "Px vente": 7.0, "Stock": -5, "Couv. ": 1},
        {"Code": 2, "Libellé": "Emmental râpé 250g", "Px revient": 5.5, "Px vente": 8.0, "Stock": 10, "Couv. ": 5},
    ])
    negatifs = [{
        "code": 1, "libelle": "Emmental râpé 200g", "stock_j1": 2, "stock_j": -5,
        "variation": -7, "px_revient": 5.0, "px_vente": 7.0, "couv": 1,
        "statut": "nouveau", "priorite": "important", "jours_consecutifs": 1,
        "premiere_apparition": "2026-08-11", "nb_occurrences": 1, "llm_analyse": True,
    }]
    with db.lock_conn() as conn:
        import_id = db.create_import(conn, "test", "2026-08-11", "f.csv", "h", "ok")

    resume = pipeline.complete_analysis(import_id, "test", "2026-08-11", df, None, 2,
                                        negatifs, [], [])

    assert resume["llm_error"]
    assert resume["fallback_heuristique"] == 1
    assert negatifs[0]["confiance"] == "faible"
    assert negatifs[0]["compensateur_code"] == 2
    with db.lock_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM compensations WHERE import_id = ?", (import_id,)
        ).fetchall()
    assert len(rows) == 1
    assert rows[0]["confiance"] == "faible"
    assert rows[0]["code_compensateur"] == 2
