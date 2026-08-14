import json
import os
import shutil
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse, FileResponse

from . import config
from . import db
from . import pipeline
from . import mcp_server


@asynccontextmanager
async def _lifespan(app):
    mgr = getattr(mcp_server.mcp, "_session_manager", None)
    if mgr is not None:
        async with mgr.run():
            yield
    else:
        yield


app = FastAPI(title="gamme-engine", version="2.0.0", lifespan=_lifespan)

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
            if db.has_import_with_hash(conn, h):
                return
        jour = datetime.fromtimestamp(os.path.getmtime(baseline)).strftime("%Y-%m-%d")
        try:
            res = pipeline.run_import(baseline, rayon="epicerie-salee", force_jour=jour, baseline=True)
            print(f"[bootstrap] Baseline enregistrée ({jour}): {res.get('resume')}")
        except Exception as e:
            print(f"[bootstrap] Échec baseline: {e}")


def process_file(path, rayon):
    filename = os.path.basename(path)
    h = db.sha256_file(path)
    with db.lock_conn() as conn:
        if db.has_import_with_hash(conn, h):
            os.remove(path)
            print(f"[watcher] {filename} déjà importé, retiré du dépôt.")
            return
    if path in PROCESSING:
        return
    PROCESSING.add(path)
    try:
        res = pipeline.run_import(path, rayon=rayon)
        if res.get("ok"):
            print(f"[watcher] ✓ Import réussi {filename}: {json.dumps(res['resume'], ensure_ascii=False)}")
            os.remove(path)
        else:
            print(f"[watcher] ✗ Import refusé {filename}: {res.get('erreur')}")
    except Exception as e:
        print(f"[watcher] ✗ Erreur {filename}: {e}")
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


@app.on_event("startup")
def startup():
    db.init_db()
    threading.Thread(target=bootstrap_baseline, daemon=True).start()
    threading.Thread(target=watcher_loop, daemon=True).start()


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


@app.get("/api/rapport/{jour}")
def get_rapport(jour: str, rayon: str = config.RAYON, mode: str = "classique"):
    out_dir = config.rayon_rapports_dir(rayon, jour)
    fname = "rapport_story.html" if mode == "story" else "rapport.html"
    p = os.path.join(out_dir, fname)
    if not os.path.exists(p):
        return JSONResponse({"ok": False, "erreur": "Rapport introuvable pour ce jour"}, status_code=404)
    return FileResponse(p)


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


_streamable = mcp_server.streamable_app()
if _streamable is not None:
    app.mount("/", _streamable)
    print("[mcp] Serveur MCP monté (streamable-http)")

if __name__ == "__main__":
    main()
