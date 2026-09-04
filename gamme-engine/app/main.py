import json
import os
import shutil
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse, FileResponse

from . import alerts
from . import auth
from . import backup
from . import config
from . import db
from . import pipeline
from . import mcp_server
from . import story_api


@asynccontextmanager
async def _lifespan(app):
    db.init_db()
    threading.Thread(target=bootstrap_baseline, daemon=True).start()
    threading.Thread(target=watcher_loop, daemon=True).start()
    threading.Thread(target=labels_cleanup_loop, daemon=True).start()
    backup.start_backup_thread()
    mgr = getattr(mcp_server.mcp, "_session_manager", None)
    if mgr is not None:
        async with mgr.run():
            yield
    else:
        yield


app = FastAPI(title="HyperFix", version="2.1.0", lifespan=_lifespan)


def _extract_bearer(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return None


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """L'authentification du point de montage /mcp est gérée par FastMCP
    (token_verifier + RFC 9728). Ici : protection des /api/* par JWT nao."""
    path = request.url.path
    if (
        path == "/healthz"
        or path.startswith("/.well-known/")
        or path == "/mcp"
        or path.startswith("/story")
        or request.method == "OPTIONS"
    ):
        return await call_next(request)
    token = _extract_bearer(request)
    claims = auth.verify_token(token) if token else None
    if claims is None:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    if auth.resolve_user(token, claims) is None:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    return await call_next(request)


@app.get("/healthz")
def healthz():
    return JSONResponse({"ok": True})


PROCESSING = set()
BOOTSTRAP_LOCK = threading.Lock()


def bootstrap_baseline():
    with BOOTSTRAP_LOCK:
        with db.lock_conn() as conn:
            count = conn.execute("SELECT COUNT(*) AS n FROM imports").fetchone()["n"]
        if count > 0:
            return
        baseline = os.path.join(config.NAO_PROJECT_DIR, "gamme_epicerie_salee.xlsx")
        if not os.path.exists(baseline):
            return
        h = db.sha256_file(baseline)
        with db.lock_conn() as conn:
            if db.has_import_with_hash(conn, h, statut_ok_only=True):
                return
        jour = datetime.fromtimestamp(os.path.getmtime(baseline)).strftime("%Y-%m-%d")
        try:
            res = pipeline.run_import(baseline, rayon="epicerie-salee", force_jour=jour, baseline=True)
            print(f"[bootstrap] Baseline enregistrée ({jour}): {res.get('resume')}")
        except Exception as e:
            print(f"[bootstrap] Échec baseline: {e}")


def _move_to_erreurs(path, rayon, filename, reason):
    dest_dir = config.rayon_depot_erreurs(rayon)
    os.makedirs(dest_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = os.path.join(dest_dir, f"{ts}_{filename}")
    try:
        shutil.move(path, dest)
        print(f"[watcher] → {filename} déplacé vers erreurs/ ({reason})")
        return dest
    except Exception as e:
        print(f"[watcher] ✗ déplacement vers erreurs/ impossible: {e}")
        return None


def process_file(path, rayon):
    filename = os.path.basename(path)
    h = db.sha256_file(path)
    with db.lock_conn() as conn:
        info = db.import_statut_for_hash(conn, h, rayon)
        if info is not None:
            import_id, statut, has_rapport = info
            if statut == "erreur":
                # Fichier déjà refusé : ne plus le re-tenter ni le supprimer.
                _move_to_erreurs(path, rayon, filename, "déjà refusé (hash connu en erreur)")
                return
            if statut in ("ok", "baseline") and has_rapport:
                os.remove(path)
                print(f"[watcher] {filename} déjà importé, retiré du dépôt.")
                return
            # statut ok/baseline SANS rapport = import interrompu : run_import
            # le marque 'erreur' puis le re-traite normalement.
    if path in PROCESSING:
        return
    PROCESSING.add(path)
    try:
        res = pipeline.run_import(path, rayon=rayon)
        if res.get("ok"):
            print(f"[watcher] ✓ Import réussi {filename}: {json.dumps(res['resume'], ensure_ascii=False)}")
            os.remove(path)
        else:
            err = res.get("erreur") or "raison inconnue"
            print(f"[watcher] ✗ Import refusé {filename}: {err}")
            _move_to_erreurs(path, rayon, filename, err)
            alerts.send_telegram(
                f"❌ Import refusé ({rayon}) — {filename}\nRaison : {err}\n"
                f"Fichier déplacé vers depot/{rayon}/erreurs/ (vérifiable via /status ou le chat)."
            )
    except Exception as e:
        print(f"[watcher] ✗ Erreur {filename}: {e}")
        _move_to_erreurs(path, rayon, filename, str(e))
        alerts.send_telegram(f"❌ Erreur inattendue ({rayon}) — {filename} : {e}")
    finally:
        PROCESSING.discard(path)


def watcher_loop():
    while True:
        try:
            for rayon in config.rayon_ids():
                depot = config.rayon_depot(rayon)
                os.makedirs(depot, exist_ok=True)
                for f in sorted(os.listdir(depot)):
                    p = os.path.join(depot, f)
                    if os.path.isfile(p) and f.lower().endswith((".xlsx", ".xlsm", ".csv")):
                        with BOOTSTRAP_LOCK:
                            process_file(p, rayon)
        except Exception as e:
            print(f"[watcher] Erreur de scan: {e}")
        time.sleep(config.POLL_SECONDS)


def labels_cleanup_loop():
    labels_dir = os.path.join(config.NAO_PROJECT_DIR, "docs", "etiquettes")
    while True:
        try:
            os.makedirs(labels_dir, exist_ok=True)
            now = time.time()
            purged = 0
            for f in os.listdir(labels_dir):
                p = os.path.join(labels_dir, f)
                if os.path.isfile(p) and f.startswith("etiquettes_") and f.endswith(".pdf"):
                    if now - os.path.getmtime(p) > 24 * 3600:
                        os.remove(p)
                        purged += 1
            if purged:
                print(f"[etiquettes] purgé {purged} PDF de plus de 24h")
        except Exception as e:
            print(f"[etiquettes] Erreur de purge: {e}")
        time.sleep(3600)


@app.get("/api/status")
def status(rayon: str = None):
    with db.lock_conn() as conn:
        q = "SELECT id, rayon, jour, date_import, fichier_source, nb_articles, statut, message FROM imports"
        args = []
        if rayon:
            q += " WHERE rayon = ?"
            args.append(rayon)
        q += " ORDER BY id DESC LIMIT 10"
        imports = conn.execute(q, args).fetchall()
    return JSONResponse({"ok": True, "depot": config.DEPOT_DIR, "rayons": config.rayons(),
                         "imports": [dict(r) for r in imports]})


@app.get("/api/rayons")
def rayons():
    return JSONResponse({"ok": True, "rayons": config.rayons()})


@app.post("/api/upload")
def upload(file: UploadFile = File(...), rayon: str = Form(config.RAYON)):
    if rayon not in config.rayon_ids():
        return JSONResponse({"ok": False, "erreur": f"Rayon inconnu: {rayon}"}, status_code=400)
    name = os.path.basename(file.filename or "fichier.xlsx")
    if not name.lower().endswith((".xlsx", ".xlsm", ".csv")):
        return JSONResponse({"ok": False, "erreur": "Format non supporté (.xlsx, .xlsm, .csv)"}, status_code=400)
    depot = config.rayon_depot(rayon)
    os.makedirs(depot, exist_ok=True)
    dest = os.path.join(depot, f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{name}")
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    print(f"[api] Upload reçu: {name} → dépôt {rayon}")
    return JSONResponse({"ok": True, "message": f"Fichier déposé pour le rayon {rayon}", "depot": dest})


@app.post("/api/import")
def trigger_import(path: str, rayon: str = config.RAYON):
    if rayon not in config.rayon_ids():
        return JSONResponse({"ok": False, "erreur": f"Rayon inconnu: {rayon}"}, status_code=400)
    if not os.path.exists(config.map_nao_storage_path(path)):
        return JSONResponse({"ok": False, "erreur": f"Fichier introuvable: {path}"}, status_code=404)
    res = pipeline.run_import(path, rayon=rayon)
    return JSONResponse(res)


@app.get("/api/article/{code}/historique")
def article_history(code: int, rayon: str = config.RAYON):
    with db.lock_conn() as conn:
        rows = conn.execute(
            "SELECT h.jour, h.stock, h.px_revient, h.px_vente, h.couv, h.marge_pct "
            "FROM article_history h JOIN imports i ON i.id = h.import_id "
            "WHERE h.code = ? AND i.rayon = ? ORDER BY h.jour",
            (code, rayon),
        ).fetchall()
        neg = conn.execute(
            "SELECT jour, statut, priorite, jours_consecutifs, nb_occurrences, premiere_apparition "
            "FROM negatifs_journaliers WHERE code = ? AND rayon = ? ORDER BY jour DESC LIMIT 30",
            (code, rayon),
        ).fetchall()
    return JSONResponse({"historique": [dict(r) for r in rows], "negatifs": [dict(r) for r in neg]})


@app.get("/api/article/{code}/compensations")
def article_compensations(code: int, rayon: str = config.RAYON):
    with db.lock_conn() as conn:
        rows = conn.execute(
            "SELECT jour, code_compensateur, rang, score, confiance, justification, libelle_compensateur, px_revient_compensateur, couv_compensateur "
            "FROM compensations WHERE code_negatif = ? AND rayon = ? ORDER BY jour DESC, rang",
            (code, rayon),
        ).fetchall()
    return JSONResponse([dict(r) for r in rows])


def main():
    import uvicorn

    db.init_db()
    uvicorn.run(app, host="0.0.0.0", port=8010)


app.include_router(story_api.router)

_STORY_DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "story-ui", "dist")
if os.path.isdir(_STORY_DIST):
    from fastapi.staticfiles import StaticFiles

    app.mount("/story", StaticFiles(directory=_STORY_DIST, html=True), name="story")
    print(f"[story] SPA story mode montée sur /story ({_STORY_DIST})")
else:
    print("[story] story-ui/dist absent — SPA non montée (lancer le build npm)")

# Serveur MCP monté EN DERNIER (routes /api, /story-data et /story définies avant ;
# l'app MCP sert /mcp et /.well-known/oauth-protected-resource en racine virtuelle)
_streamable = mcp_server.streamable_app()
if _streamable is not None:
    app.mount("/", _streamable)
    print("[mcp] Serveur MCP monté (streamable-http)")

if __name__ == "__main__":
    main()
