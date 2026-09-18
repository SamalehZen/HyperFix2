"""Garde anti-régression boot : un SyntaxError ici a déjà cassé le moteur
(main.py:116) sans être vu par les tests (main jamais importé)."""


def test_boot_imports():
    import app.main  # noqa: F401
    import app.mcp_server  # noqa: F401
    import app.pipeline  # noqa: F401

    assert hasattr(app.main, "app")
    assert hasattr(app.main, "process_mouvement_file")
