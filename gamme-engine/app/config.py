import json
import os

BASE_URL = os.getenv("OPENCODE_BASE_URL", "https://opencode.ai/zen/v1")
API_KEY = os.getenv("OPENCODE_API_KEY", "")
MODEL = os.getenv("GAMME_LLM_MODEL", "deepseek-v4-flash-free")

# Modèle dédié à la tool `gamme_libeller` (nettoyage de libellés). Si non défini,
# il retombe sur le modèle par défaut (compensateurs). Permet de dissocier le
# quota/provider sans toucher au code (via .env).
LIBELLER_BASE_URL = os.getenv("LIBELLER_BASE_URL", BASE_URL)
LIBELLER_API_KEY = os.getenv("LIBELLER_API_KEY", API_KEY)
LIBELLER_MODEL = os.getenv("LIBELLER_MODEL", MODEL)
DATA_DIR = os.getenv("GAMME_DATA_DIR", "/storage/gamme")
NAO_PROJECT_DIR = os.getenv("NAO_PROJECT_DIR", "/root/nao-gamme")
NAO_DB_PATH = os.path.join(NAO_PROJECT_DIR, "gamme.duckdb")
RAYON = os.getenv("GAMME_RAYON", "epicerie-salee")

DEPOT_DIR = os.path.join(DATA_DIR, "depot")
IMPORTS_DIR = os.path.join(DATA_DIR, "imports")
RAPPORTS_DIR = os.path.join(DATA_DIR, "rapports")
DB_PATH = os.path.join(DATA_DIR, "historique.db")
BACKUP_DIR = os.getenv("GAMME_BACKUP_DIR", os.path.join(DATA_DIR, "backups"))
BACKUP_RETENTION_DAYS = int(os.getenv("GAMME_BACKUP_RETENTION_DAYS", "30"))

ALERT_CHATS_FILE = os.path.join(DATA_DIR, "alert_chats.json")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

NAO_STORAGE_PREFIX = "/app/storage"
NAO_HOME_PREFIX = "/home/"
UPLOADS_DIR = os.getenv("GAMME_UPLOADS_DIR", os.path.join(DATA_DIR, "uploads"))

RAYONS_FILE = os.path.join(DATA_DIR, "rayons.json")

DASHBOARD_PATH = os.getenv("GAMME_DASHBOARD_PATH", "/story/dashboard/mix2")

SHEET_NAME = "Gamme_Commande"
REQUIRED_COLUMNS = [
    "Code", "EAN", "Libellé", "Fournisseur", "Px achat fac", "Px achat tv",
    "Px revient", "TVA %", "Quar", "Assort.", "Marque", "Attribut",
    "Collection", "Px vente", "PV promo", "Date Dbt", "Date fin", "Marge %",
    "Marge Promo %", "SA", "SF", "Nb UC/PCB", "Mini cde", "Maxi", "Incré",
    "Mode réappr.", "Couv. ", "Stock", "Valeur stock   PRMP", "En cours",
]

POLL_SECONDS = int(os.getenv("GAMME_POLL_SECONDS", "60"))
TOP_CANDIDATES = int(os.getenv("GAMME_TOP_CANDIDATES", "25"))
MAX_LLM_ARTICLES = int(os.getenv("GAMME_MAX_LLM_ARTICLES", "40"))
FALLBACK_SCORE_SEUIL = float(os.getenv("GAMME_FALLBACK_SCORE_SEUIL", "30"))
CHUTE_SEUIL = int(os.getenv("GAMME_CHUTE_SEUIL", "200"))
HAUSSE_SEUIL = int(os.getenv("GAMME_HAUSSE_SEUIL", "200"))


def load_rayons():
    default = {"epicerie-salee": {"libelle": "Épicerie salée", "gestionnaire": ""}}
    if os.path.exists(RAYONS_FILE):
        try:
            data = json.load(open(RAYONS_FILE, encoding="utf-8"))
            if isinstance(data, dict) and data:
                return data
        except Exception:
            pass
    return default


def rayons():
    return load_rayons()


def rayon_ids():
    return sorted(load_rayons().keys())


def rayon_libelle(rayon):
    return load_rayons().get(rayon, {}).get("libelle", rayon)


def rayon_depot(rayon):
    return os.path.join(DEPOT_DIR, rayon)


def rayon_depot_erreurs(rayon):
    return os.path.join(rayon_depot(rayon), "erreurs")


def rayon_imports_dir(rayon, jour):
    return os.path.join(IMPORTS_DIR, rayon, *jour.split("-"))


def rayon_rapports_dir(rayon, jour):
    return os.path.join(RAPPORTS_DIR, rayon, *jour.split("-"))


def rayon_from_path(path):
    for rid in rayon_ids():
        prefix = rayon_depot(rid) + os.sep
        if path.startswith(prefix):
            return rid
    return None


def map_nao_storage_path(path):
    if path.startswith(NAO_STORAGE_PREFIX):
        return os.path.join(UPLOADS_DIR, path[len(NAO_STORAGE_PREFIX):].lstrip("/"))
    if path.startswith(NAO_HOME_PREFIX):
        rel = path[len(NAO_HOME_PREFIX):].lstrip("/")
        candidates = []
        for root, _dirs, files in os.walk(UPLOADS_DIR):
            for f in files:
                fp = os.path.join(root, f)
                if fp.endswith(rel):
                    candidates.append(fp)
        if candidates:
            return max(candidates, key=os.path.getmtime)
    return path
