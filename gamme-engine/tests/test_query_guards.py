"""Garde-fous fiabilité : littéraux, bypass main.*, troncature annoncée."""

import json

from app import query


def test_strip_literals_ignores_quoted_keywords():
    # LIKE '%IMPORT%' ne doit PAS déclencher FORBIDDEN (faux refus).
    cleaned = query._strip_literals("SELECT * FROM t WHERE x LIKE '%IMPORT%'")
    assert not query.FORBIDDEN.search(cleaned)
    # ... mais une vraie menace passe toujours.
    assert query.FORBIDDEN.search(query._strip_literals("SELECT * FROM t; DROP TABLE x"))
    assert query.FORBIDDEN.search(query._strip_literals("SELECT ATTACH('a')"))


def test_strip_literals_escaped_quotes():
    cleaned = query._strip_literals("SELECT 'l''import' FROM t")
    assert "import" not in cleaned.lower()


def test_main_bypass_pattern():
    assert query.MAIN_SCHEMA_BYPASS.search("SELECT * FROM main.article_history")
    assert query.MAIN_SCHEMA_BYPASS.search("select * from MAIN  .  article_history")
    assert not query.MAIN_SCHEMA_BYPASS.search("SELECT * FROM article_history")
