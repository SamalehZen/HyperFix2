import json
import os

from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.server import AuthSettings, TransportSecuritySettings
from mcp.server.auth.middleware.auth_context import get_access_token

from . import auth
from . import config
from . import db
from . import labels
from . import pipeline

mcp = FastMCP(
    "gamme-engine",
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=False,
        allowed_hosts=["*"],
        allowed_origins=["*"],
    ),
    auth=AuthSettings(
        issuer_url=auth.ISSUER,
        resource_server_url=auth.GAMME_MCP_URL,
        required_scopes=None,
    ),
    token_verifier=auth.NaoTokenVerifier(),
    instructions=(
        "Assistant métier 'Gamme' : import des fichiers de gamme, stocks négatifs, "
        "anomalies, compensateurs et rapports quotidiens. Tous les outils prennent un "
        "rayon (ex: epicerie-salee). Pour un fichier déposé dans le chat, son chemin "
        "commence par /home/uploads/ (ou /app/storage/) : le transmettre tel quel."
    ),
)


def _resume_to_markdown(res):
    if not res.get("ok"):
        return f"❌ Échec de l'import : {res.get('erreur')}"
    r = res["resume"]
    if r.get("baseline"):
        return (
            f"✅ **Import de base enregistré** (rayon `{r.get('rayon')}`, {r.get('nb_articles')} articles).\n"
            f"Aucune comparaison possible (pas de J-1) : {r.get('nouveaux_negatifs')} articles sont en stock négatif dans le fichier de référence."
        )
    lines = [
        f"✅ **Import traité** — rayon `{r.get('rayon')}`, jour {r.get('jour')}, {r.get('nb_articles')} articles analysés.",
        "",
        f"🔴 Nouveaux négatifs : **{r.get('nouveaux_negatifs')}**",
        f"🟠 Persistants : **{r.get('persistants')}**",
        f"🟢 Corrigés : **{r.get('corriges')}**",
        f"⚠️ Anomalies : **{r.get('anomalies')}**",
        f"✅ Compensateurs trouvés : **{r.get('compensateurs_trouves')}** / sans résultat : **{r.get('sans_compensateur')}**",
    ]
    if r.get("non_analyses"):
        lines.append(f"ℹ️ Non analysés par le LLM (plafond) : {r.get('non_analyses')}")
    if r.get("llm_error"):
        lines.append(f"⚠️ Erreur LLM : {r.get('llm_error')}")
    return "\n".join(lines)


def _current_user() -> dict | None:
    """Gestionnaire authentifié (claims du token vérifié par FastMCP)."""
    at = get_access_token()
    if at is None:
        return None
    return {
        "email": (at.claims or {}).get("email") or "",
        "name": (at.claims or {}).get("name") or "",
        "rayons": (at.claims or {}).get("rayons") or [],
    }


def _check_rayon(rayon: str) -> str | None:
    """Renvoie un message d'erreur si le gestionnaire connecté n'a pas accès au rayon."""
    user = _current_user()
    if user is None:
        return "Authentification requise : votre compte n'est pas connecté au serveur de données."
    if rayon not in user["rayons"]:
        if not user["rayons"]:
            return (
                f"Accès refusé : aucun rayon n'est associé à votre compte "
                f"({user['email'] or 'email inconnu'}). Contactez l'administrateur pour "
                "vous rattacher à un rayon."
            )
        rayo = ", ".join(user["rayons"])
        return (
            f"Accès refusé : vous n'êtes pas gestionnaire du rayon `{rayon}`. "
            f"Vos rayons autorisés : {rayo}."
        )
    return None


def _guard_rayon(rayon: str):
    err = _check_rayon(rayon)
    if err:
        raise ValueError(err)


@mcp.tool()
def gamme_mon_rayon() -> str:
    """Rayons dont le gestionnaire connecté est autorisé (id + libellé). À appeler
    au premier besoin de données : ne jamais deviner ni utiliser un autre rayon."""
    user = _current_user()
    if user is None:
        return "Authentification requise : votre compte n'est pas connecté au serveur de données."
    if not user["rayons"]:
        return (
            f"Aucun rayon associé à votre compte ({user['email'] or 'email inconnu'}). "
            "Contactez l'administrateur pour vous rattacher à un rayon."
        )
    return json.dumps(
        [{"id": rid, "libelle": config.rayon_libelle(rid)} for rid in user["rayons"]],
        ensure_ascii=False,
        indent=2,
    )


@mcp.tool()
def gamme_rayons() -> str:
    """Liste des rayons configurés (id + libellé)."""
    return json.dumps(
        {rid: {"libelle": meta.get("libelle", rid)} for rid, meta in config.rayons().items()},
        ensure_ascii=False,
        indent=2,
    )


@mcp.tool()
def gamme_import_file(path: str, rayon: str) -> str:
    """Importe un fichier de gamme (.xlsx, .xlsm, .csv). path = chemin du fichier
    (si l'utilisateur l'a déposé dans le chat, le chemin commence par /home/uploads/
    ou /app/storage/). rayon = identifiant du rayon (ex: epicerie-salee). Les données
    sont enregistrées et le rapport est consultable dans le dashboard story mode."""
    _guard_rayon(rayon)
    if rayon not in config.rayon_ids():
        return f"Rayon inconnu : {rayon}. Rayons disponibles : {', '.join(config.rayon_ids())}"
    local = config.map_nao_storage_path(path)
    if not os.path.exists(local):
        return f"Fichier introuvable : {path}"
    res = pipeline.run_import(local, rayon=rayon)
    out = _resume_to_markdown(res)
    if res.get("ok"):
        jour = res["resume"].get("jour")
        out += (
            f"\n\n🎬 **Story mode (dashboard interactif)** : `/story/?jour={jour}&rayon={rayon}`"
            f" — URL publique : `https://<domaine>/story/?jour={jour}&rayon={rayon}`"
        )
    return out


@mcp.tool()
def gamme_etiquettes(path: str, copies: int = 1, taille: str = "standard") -> str:
    """Génère un PDF d'étiquettes prêtes à imprimer à partir d'un fichier déposé dans
    le chat (.xlsx, .xlsm ou .csv) contenant au moins 3 colonnes : Code (code article),
    EAN (code-barres EAN-13) et Libellé. Chaque étiquette affiche : libellé en haut,
    code-barres EAN-13 scannable avec barres de garde étendues et son numéro EAN lisible
    segmenté dessous, code article en bas.
    path = chemin du fichier (/home/uploads/...). copies = nombre d'étiquettes par article
    (1 par défaut, max 10). taille = 'standard' (par défaut) ou 'grand' (code-barres plus
    imposant). Renvoie le lien de téléchargement du PDF."""
    if copies < 1:
        copies = 1
    local = config.map_nao_storage_path(path)
    if not os.path.exists(local):
        return f"Fichier introuvable : {path}"
    try:
        res = labels.generate_labels_pdf(local, copies=copies, taille=taille)
    except Exception as e:
        return f"❌ Échec de la génération des étiquettes : {e}"
    lines = [
        f"✅ **PDF d'étiquettes généré** ({taille}) : {res['nb_etiquettes']} étiquettes "
        f"({res['nb_articles']} articles × {copies} exemplaire(s)).",
        "",
        f"🖨️ Téléchargement : {res['url']}",
        f"📁 Fichier : {res['pdf_path']}",
    ]
    if res["corriges"]:
        lines.append(f"⚠️ EAN à clé de contrôle corrigée : {res['corriges']}")
    if res["ignores"]:
        lines.append(f"❌ EAN ignorés (invalides) : {len(res['ignores'])}")
        for ig in res["ignores"][:10]:
            lines.append(f"   - {ig['code']} — {ig['libelle']} (EAN : {ig['ean']})")
    return "\n".join(lines)


@mcp.tool()
def gamme_rapports(rayon: str, limit: int = 5) -> str:
    """Derniers rapports générés pour un rayon, avec leurs indicateurs clés."""
    _guard_rayon(rayon)
    with db.lock_conn() as conn:
        rows = conn.execute(
            "SELECT jour, resume_json FROM rapports WHERE rayon = ? ORDER BY id DESC LIMIT ?",
            (rayon, limit),
        ).fetchall()
    out = []
    for r in rows:
        rj = json.loads(r["resume_json"] or "{}")
        out.append({
            "jour": r["jour"],
            "baseline": bool(rj.get("baseline")),
            "nb_articles": rj.get("nb_articles"),
            "nouveaux": rj.get("nouveaux_negatifs"),
            "persistants": rj.get("persistants"),
            "corriges": rj.get("corriges"),
            "anomalies": rj.get("anomalies"),
            "compensateurs_trouves": rj.get("compensateurs_trouves"),
            "sans_compensateur": rj.get("sans_compensateur"),
        })
    if not out:
        return (
            f"Aucun rapport pour le rayon `{rayon}` pour le moment. "
            "Le premier rapport sera généré au premier import d'un fichier de gamme."
        )
    return json.dumps(out, ensure_ascii=False, indent=2)


@mcp.tool()
def gamme_negatifs(rayon: str, statut: str = "") -> str:
    """Stocks négatifs du dernier import d'un rayon. statut optionnel :
    nouveau | persistant | persistant_aggrave | persistant_stable | persistant_ameliore."""
    _guard_rayon(rayon)
    with db.lock_conn() as conn:
        row = conn.execute(
            "SELECT MAX(id) AS id FROM imports WHERE rayon = ? AND statut = 'ok'", (rayon,)
        ).fetchone()
        if row["id"] is None:
            return (
                f"Aucun import pour le rayon `{rayon}` pour le moment. "
                "Dépose le fichier de gamme du jour (.xlsx, .xlsm ou .csv) dans le chat "
                "et je l'importerai automatiquement."
            )
        import_id = row["id"]
        q = "SELECT * FROM negatifs_journaliers WHERE import_id = ? AND statut != 'corrige'"
        args = [import_id]
        if statut:
            q += " AND statut = ?"
            args.append(statut)
        q += " ORDER BY priorite DESC, code"
        negs = [dict(r) for r in conn.execute(q, args).fetchall()]
        comps = [dict(r) for r in conn.execute(
            "SELECT * FROM compensations WHERE import_id = ? ORDER BY code_negatif, rang", (import_id,)).fetchall()]
    comp_map = {}
    for c in comps:
        comp_map.setdefault(c["code_negatif"], []).append(c)
    out = []
    for n in negs:
        cs = comp_map.get(n["code"], [])
        out.append({
            "code": n["code"], "statut": n["statut"], "priorite": n["priorite"],
            "stock_j1": n["stock_j1"], "stock_j": n["stock_j"], "variation": n["variation"],
            "jours_consecutifs": n["jours_consecutifs"],
            "premiere_apparition": n["premiere_apparition"],
            "compensateurs": [{"code": c["code_compensateur"], "libelle": c["libelle_compensateur"],
                               "confiance": c["confiance"], "justification": c["justification"],
                               "px_revient": c["px_revient_compensateur"], "couv": c["couv_compensateur"]}
                              for c in cs],
        })
    return json.dumps(out, ensure_ascii=False, indent=2)


@mcp.tool()
def gamme_article(code: int, rayon: str) -> str:
    """Historique complet d'un article (stock, prix, couverture) + passages en
    stock négatif + compensateurs proposés."""
    _guard_rayon(rayon)
    with db.lock_conn() as conn:
        hist = [dict(r) for r in conn.execute(
            "SELECT h.jour, h.stock, h.px_revient, h.px_vente, h.couv, h.marge_pct, h.libelle "
            "FROM article_history h JOIN imports i ON i.id = h.import_id "
            "WHERE h.code = ? AND i.rayon = ? ORDER BY h.jour", (code, rayon)).fetchall()]
        neg = [dict(r) for r in conn.execute(
            "SELECT jour, statut, priorite, jours_consecutifs, nb_occurrences, premiere_apparition "
            "FROM negatifs_journaliers WHERE code = ? AND rayon = ? ORDER BY jour DESC", (code, rayon)).fetchall()]
        comp = [dict(r) for r in conn.execute(
            "SELECT jour, code_compensateur, rang, score, confiance, justification, libelle_compensateur, "
            "px_revient_compensateur, couv_compensateur FROM compensations "
            "WHERE code_negatif = ? AND rayon = ? ORDER BY jour DESC, rang", (code, rayon)).fetchall()]
    return json.dumps({"historique": hist, "negatifs": neg, "compensations": comp},
                      ensure_ascii=False, indent=2)


@mcp.tool()
def gamme_anomalies(rayon: str, limit: int = 50) -> str:
    """Anomalies du dernier import (marges négatives, chutes/hausses de stock, promos)."""
    _guard_rayon(rayon)
    with db.lock_conn() as conn:
        row = conn.execute(
            "SELECT MAX(id) AS id FROM imports WHERE rayon = ? AND statut = 'ok'", (rayon,)
        ).fetchone()
        if row["id"] is None:
            return (
                f"Aucun import pour le rayon `{rayon}` pour le moment. "
                "Dépose le fichier de gamme du jour (.xlsx, .xlsm ou .csv) dans le chat "
                "et je l'importerai automatiquement."
            )
        rows = [dict(r) for r in conn.execute(
            "SELECT code, type, description, valeur_j1, valeur_j FROM anomalies "
            "WHERE import_id = ? ORDER BY id LIMIT ?", (row["id"], limit)).fetchall()]
    return json.dumps(rows, ensure_ascii=False, indent=2)


def streamable_app():
    try:
        return mcp.streamable_http_app()
    except AttributeError:
        return None
