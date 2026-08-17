import os
import shutil
import sqlite3
import threading
import time
from datetime import datetime, timedelta

from . import config


def run_backup():
    """Copie les données critiques vers BACKUP_DIR/<YYYY-MM-DD>/.
    La base SQLite est copiée via l'API sqlite3.backup() (copie cohérente
    même si un import est en cours). Applique la rétention N jours."""
    stamp = datetime.now().strftime("%Y-%m-%d")
    dest_dir = os.path.join(config.BACKUP_DIR, stamp)
    os.makedirs(dest_dir, exist_ok=True)

    count = 0

    if os.path.exists(config.DB_PATH):
        dest_db = os.path.join(dest_dir, "historique.db")
        src = sqlite3.connect(config.DB_PATH)
        try:
            dst = sqlite3.connect(dest_db)
            try:
                src.backup(dst)
                count += 1
            finally:
                dst.close()
        finally:
            src.close()

    for label, src in (
        ("rayons.json", config.RAYONS_FILE),
        ("gamme.duckdb", os.path.join(config.NAO_PROJECT_DIR, "gamme.duckdb")),
        ("images", os.path.join(config.NAO_PROJECT_DIR, "docs", "images")),
    ):
        if not os.path.exists(src):
            continue
        dst = os.path.join(dest_dir, label)
        try:
            if os.path.isdir(src):
                shutil.copytree(src, dst, dirs_exist_ok=True)
            else:
                shutil.copy2(src, dst)
            count += 1
        except Exception as e:
            print(f"[backup] ✗ {label}: {e}")

    purged = 0
    for name in sorted(os.listdir(config.BACKUP_DIR)):
        p = os.path.join(config.BACKUP_DIR, name)
        if not os.path.isdir(p):
            continue
        try:
            age = (datetime.now() - datetime.strptime(name, "%Y-%m-%d")).days
        except ValueError:
            continue
        if age > config.BACKUP_RETENTION_DAYS:
            shutil.rmtree(p, ignore_errors=True)
            purged += 1

    print(f"[backup] ✓ {count} élément(s) copié(s) vers {dest_dir} (purge: {purged})")
    return dest_dir


def backup_loop():
    """Première exécution à 03h00 locale, puis toutes les 24 h."""
    while True:
        now = datetime.now()
        target = now.replace(hour=3, minute=0, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        time.sleep(max(60, (target - now).total_seconds()))
        try:
            run_backup()
        except Exception as e:
            print(f"[backup] ✗ Erreur: {e}")


def start_backup_thread():
    t = threading.Thread(target=backup_loop, daemon=True)
    t.start()
    return t
