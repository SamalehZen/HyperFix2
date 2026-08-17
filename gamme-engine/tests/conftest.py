import os
import tempfile

# Isoler les données des tests AVANT l'import des modules app.
_tmp = tempfile.mkdtemp(prefix="gamme_tests_")
os.environ["GAMME_DATA_DIR"] = _tmp
os.environ["NAO_PROJECT_DIR"] = _tmp

import pytest  # noqa: E402

from app import config, db  # noqa: E402


@pytest.fixture()
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "historique.db"))
    db.init_db()
    return db


@pytest.fixture()
def make_df():
    def _make(rows):
        import pandas as pd

        df = pd.DataFrame(rows)
        for c in config.REQUIRED_COLUMNS:
            if c not in df.columns:
                df[c] = None
        return df

    return _make
