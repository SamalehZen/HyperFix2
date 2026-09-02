import json
import re
import os
import threading

from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.server import AuthSettings, TransportSecuritySettings
from mcp.server.auth.middleware.auth_context import get_access_token

from . import auth
from . import config
from . import cyrus_prompt
from . import db
from . import hierarchy
from . import labels
from . import libeller_prompt
from . import llm
from . import normalize
from . import pipeline
from . import query

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


# Verrous d'import par rayon : un seul pipeline à la fois, jamais de double
# traitement quand l'agent retente pendant qu'un import tourne.
_import_locks = {}
_import_locks_guard = threading.Lock()


def _import_lock(rayon: str) -> threading.Lock:
    with _import_locks_guard:
        if rayon not in _import_locks:
            _import_locks[rayon] = threading.Lock()
        return _import_locks[rayon]


def _import_en_cours(rayon: str) -> bool:
    return _import_lock(rayon).locked()


@mcp.tool()
def gamme_import_file(path: str, rayon: str) -> str:
    """Importe un fichier de gamme (.xlsx, .xlsm, .csv). path = chemin du fichier
    (si l'utilisateur l'a déposé dans le chat, le chemin commence par /home/uploads/
    ou /app/storage/). rayon = identifiant du rayon (ex: frais-surgele).
    FONCTIONNEMENT ASYNCHRONE : l'import complet (comparaison J/J-1, compensateurs
    LLM) prend 2 à 5 minutes. L'outil répond donc immédiatement :
    - {"statut": "demarre"} → l'import tourne en arrière-plan. NE JAMAIS rappeler
      l'outil pour le même fichier (dédoublonnage par hash). Attendre ~60 s puis
      vérifier avec gamme_imports (statut ok/erreur) et gamme_rapports (résumé),
      puis présenter le récap + lien story.
    - {"statut": "deja_importe"} → fichier déjà traité, le résumé est renvoyé
      directement.
    - {"statut": "refuse"} → fichier invalide, raison dans "erreur".
    - {"statut": "occupe"} → un autre import est en cours pour ce rayon ; attendre
      puis vérifier avec gamme_imports."""
    _guard_rayon(rayon)
    if rayon not in config.rayon_ids():
        return json.dumps(
            {"statut": "refuse", "erreur": f"Rayon inconnu : {rayon}. Rayons disponibles : {', '.join(config.rayon_ids())}"},
            ensure_ascii=False,
        )
    local = config.map_nao_storage_path(path)
    if not os.path.exists(local):
        return json.dumps(
            {"statut": "refuse", "erreur": f"Fichier introuvable : {path}"},
            ensure_ascii=False,
        )

    # Dédoublonnage rapide par hash : un fichier déjà traité renvoie son résumé
    # immédiatement, sans relancer le pipeline.
    h = db.sha256_file(local)
    with db.lock_conn() as conn:
        info = db.import_statut_for_hash(conn, h, rayon)
        if info is not None:
            import_id, statut, has_rapport = info
            if statut == "erreur":
                msg_row = conn.execute(
                    "SELECT message FROM imports WHERE id = ?", (import_id,)
                ).fetchone()
                return json.dumps(
                    {"statut": "refuse", "erreur": f"Fichier déjà refusé lors d'un passage précédent : {msg_row['message'] or 'raison inconnue'}"},
                    ensure_ascii=False,
                )
            if statut in ("ok", "baseline") and has_rapport:
                rap = conn.execute(
                    "SELECT jour, resume_json FROM rapports WHERE import_id = ?", (import_id,)
                ).fetchone()
                resume = json.loads(rap["resume_json"]) if rap else {}
                out = _resume_to_markdown({"ok": True, "resume": resume, "rayon": rayon})
                jour = resume.get("jour")
                if jour:
                    out += (
                        f"\n\n🎬 **Dashboard gamme** : `{config.DASHBOARD_PATH}?jour={jour}&rayon={rayon}`"
                    )
                out = f"(Fichier déjà importé — résumé enregistré.)\n\n{out}"
                return json.dumps(
                    {"statut": "deja_importe", "jour": resume.get("jour"), "resume_markdown": out},
                    ensure_ascii=False,
                )

    if _import_en_cours(rayon):
        return json.dumps(
            {"statut": "occupe", "message": "Un import est déjà en cours pour ce rayon. Attends ~60 s puis vérifie avec gamme_imports."},
            ensure_ascii=False,
        )

    def _run():
        with _import_lock(rayon):
            try:
                pipeline.run_import(local, rayon=rayon)
            except Exception as e:  # le statut 'erreur' est posé par le pipeline
                try:
                    with db.lock_conn() as conn:
                        db.create_import(
                            conn, rayon, pipeline.jour_today(), os.path.basename(local),
                            db.sha256_file(local), "erreur", message=str(e),
                        )
                except Exception:
                    pass

    threading.Thread(target=_run, daemon=True).start()
    return json.dumps(
        {
            "statut": "demarre",
            "message": "Import lancé en arrière-plan (2 à 5 minutes : comparaison J/J-1 + compensateurs). "
            "NE PAS rappeler cet outil pour le même fichier. Dans ~60 s : gamme_imports pour le statut, "
            "puis gamme_rapports pour le résumé, et présente le récap + lien story mode.",
        },
        ensure_ascii=False,
    )


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
    """Stocks négatifs du dernier import d'un rayon, enrichis : chaque négatif
    porte son libelle, fournisseur, marque, px_revient, px_vente et valeur_prmp
    (capital bloqué = |stock_j × px_revient|, FDJ). statut optionnel :
    nouveau | persistant_aggrave | persistant_stable | persistant_ameliore
    (les corrigés ne sont jamais renvoyés). Le total du jour = TOUS les
    négatifs renvoyés (nouveaux + persistants), jamais les seuls nouveaux."""
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
        q = (
            "SELECT n.*, h.libelle, h.fournisseur, h.marque, h.px_revient, h.px_vente, h.couv "
            "FROM negatifs_journaliers n "
            "LEFT JOIN article_history h ON h.import_id = n.import_id AND h.code = n.code "
            "WHERE n.import_id = ? AND n.statut != 'corrige'"
        )
        args = [import_id]
        if statut:
            q += " AND n.statut = ?"
            args.append(statut)
        q += " ORDER BY n.priorite DESC, n.code"
        negs = [dict(r) for r in conn.execute(q, args).fetchall()]
        comps = [dict(r) for r in conn.execute(
            "SELECT * FROM compensations WHERE import_id = ? ORDER BY code_negatif, rang", (import_id,)).fetchall()]
    comp_map = {}
    for c in comps:
        comp_map.setdefault(c["code_negatif"], []).append(c)
    out = []
    for n in negs:
        cs = comp_map.get(n["code"], [])
        px_rev = n.get("px_revient") or 0
        valeur_prmp = round(abs((n["stock_j"] or 0) * px_rev), 2)
        out.append({
            "code": n["code"], "libelle": n.get("libelle"), "fournisseur": n.get("fournisseur"),
            "marque": n.get("marque"),
            "statut": n["statut"], "priorite": n["priorite"],
            "stock_j1": n["stock_j1"], "stock_j": n["stock_j"], "variation": n["variation"],
            "jours_consecutifs": n["jours_consecutifs"],
            "premiere_apparition": n["premiere_apparition"],
            "px_revient": px_rev, "px_vente": n.get("px_vente"), "couv": n.get("couv"),
            "valeur_prmp": valeur_prmp,
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
def gamme_image_article(code: int, rayon: str) -> str:
    """Photo réelle d'un article depuis son code barre (EAN) : télécharge l'image
    depuis Open Food Facts et la publie sous https://lololo.hypeer.cloud/images/...
    pour l'afficher dans le chat (via execute_sql + display_chart product_image)."""
    import requests

    _guard_rayon(rayon)
    with db.lock_conn() as conn:
        row = conn.execute(
            "SELECT ean, libelle FROM article_history WHERE code = ? AND rayon = ? "
            "AND ean IS NOT NULL AND ean != '' ORDER BY jour DESC LIMIT 1",
            (code, rayon),
        ).fetchone()
    if row is None or row["ean"] is None:
        return json.dumps(
            {"success": False, "erreur": f"Aucun EAN trouvé pour le code {code} (rayon `{rayon}`)."},
            ensure_ascii=False,
        )
    ean = str(row["ean"]).strip()
    libelle = row["libelle"] or ""
    headers = {"User-Agent": "HyperFix-Gamme/1.0 (contact: gamme@hyperfix.local)"}

    def _download(url: str) -> tuple[bytes, str] | None:
        try:
            resp = requests.get(url, headers=headers, timeout=30)
            resp.raise_for_status()
            ctype = resp.headers.get("Content-Type") or ""
            if not ctype.startswith("image/"):
                return None
            ext = ".png" if ctype.startswith("image/png") else ".jpg"
            return resp.content, ext
        except Exception:
            return None

    try:
        img_url = None
        try:
            resp = requests.get(
                f"https://world.openfoodfacts.org/api/v2/product/{ean}.json",
                params={"fields": "image_front_url,image_url,product_name"},
                headers=headers,
                timeout=20,
            )
            product = (resp.json().get("product") or {}) if resp.ok else {}
            img_url = product.get("image_front_url") or product.get("image_url")
            nom = product.get("product_name") or libelle
        except Exception:
            nom = libelle

        if not img_url:
            try:
                from ddgs import DDGS

                for query in (ean, libelle):
                    results = DDGS().images(query, max_results=3)
                    if results:
                        img_url = results[0].get("image")
                        break
            except Exception:
                img_url = None

        if not img_url:
            return json.dumps(
                {"success": False, "erreur": f"Pas de photo trouvée pour le EAN {ean} (Open Food Facts + recherche web)."},
                ensure_ascii=False,
            )

        downloaded = _download(img_url)
        if downloaded is None:
            return json.dumps(
                {"success": False, "erreur": f"Photo introuvable/téléchargement impossible ({ean})."},
                ensure_ascii=False,
            )
        content, ext = downloaded
        out_dir = os.path.join(config.NAO_PROJECT_DIR, "docs", "images")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"{ean}{ext}")
        with open(out_path, "wb") as f:
            f.write(content)
        return json.dumps(
            {
                "success": True,
                "code": code,
                "ean": ean,
                "libelle": nom,
                "image_url": f"https://lololo.hypeer.cloud/images/{ean}{ext}",
                "note": (
                    "Pour afficher la photo dans le chat, fais maintenant execute_sql avec "
                    "SELECT '<image_url>' AS image_url, '<libelle>' AS caption puis "
                    "display_chart avec chart_type product_image et le query_id renvoyé."
                ),
            },
            ensure_ascii=False,
            indent=2,
        )
    except Exception as e:
        return json.dumps(
            {"success": False, "erreur": f"Erreur lors de la récupération de la photo : {e}"},
            ensure_ascii=False,
        )


@mcp.tool()
def gamme_query(sql: str, rayon: str) -> str:
    """SQL en lecture seule sur la base gamme (table gamme_commande, synchronisée au
    dernier import). Uniquement SELECT/WITH — toute opération d'écriture est refusée.
    rayon = identifiant du rayon (obligatoire, vérifié côté serveur).
    IMPORTANT : la table `gamme_commande` est DÉJÀ FILTRÉE sur le rayon du gestionnaire
    — écris du SQL naturel, sans ajouter `rayon` aux colonnes SELECT ni au WHERE
    (facultatif). POUR RECHERCHER UN ARTICLE PAR NOM : utilise `gamme_recherche_articles`
    (recherche élargie FR/EN + racine courte + multi-passes), PAS ce tool. Si tu fais
    du SQL ILIKE ici, élargis avec une racine courte (%filou% plutôt que %petit filou%)
    et plusieurs mots-clés en OR, sans filtrer par stock dans le WHERE.
    Pièges : les colonnes ont des espaces → guillemets doubles (« "Px achat fac" ») ;
    les valeurs numériques sont stockées en texte → caster pour calculer
    (CAST("Marge %" AS DOUBLE)) ; les prix sont en francs djiboutiens (FDJ) — ne jamais
    diviser ; `SA`/`SF` sont des codes lettrés.
    Exemple : SELECT "Code", "Libellé", "Marge %" FROM gamme_commande
    WHERE "Marge %" <> '' ORDER BY CAST("Marge %" AS DOUBLE) DESC LIMIT 5."""
    _guard_rayon(rayon)
    return query.run_query(sql, rayon)


# Petite table FR → EN pour élargir la recherche aux libellés anglais
# (les libellés peuvent être rédigés en français OU en anglais selon le fournisseur).
_FR_EN = {
    "oeuf": "egg", "oeufs": "eggs", "lait": "milk", "beurre": "butter",
    "glace": "ice", "poulet": "chicken", "yaourt": "yogurt", "yaourts": "yogurts",
    "fromage": "cheese", "jambon": "ham", "pain": "bread", "eau": "water",
    "jus": "juice", "chocolat": "chocolate", "surgel": "frozen", "surgeles": "frozen",
    "pizza": "pizza", "frite": "fries", "frites": "fries", "poisson": "fish",
    "crevette": "shrimp", "crevettes": "shrimp", "saumon": "salmon", "thon": "tuna",
    "legume": "vegetable", "legumes": "vegetables", "fruit": "fruit", "fruits": "fruits",
    "yaourts a boire": "drinking yogurt", "dessert": "dessert",
}

# Marques / familles connues pour l'élargissement de la recherche (passes supplémentaires).
_FAMILLES = {
    "filou": ["yoplai", "danonino", "danino", "petit filou", "p'tit filou", "petits filous"],
    "yoplai": ["danone", "danonino", "danino", "petit filou", "p'tit filou", "petits filous"],
    "danonino": ["danino", "yoplai", "petit filou", "p'tit filou"],
    "yaourt": ["yogurt", "dessert", "creme", "creme dessert"],
    "oeuf": ["egg", "oeufs"],
}


def _norm_termes(terme):
    """Découpe un terme libre en mots-clés normalisés (accent + casse), puis
    racines courtes (stem_fr) pour couvrir pluriels/singuliers et variantes."""
    mots = normalize.normalize(terme)  # tokens nettoyés, stopwords retirés
    stems = []
    for m in mots:
        s = normalize.stem_fr(m)
        if len(s) >= 3 and s not in stems:
            stems.append(s)
    return stems


def _escape_like(v):
    return v.replace("'", "''")


@mcp.tool()
def gamme_recherche_articles(terme: str, rayon: str, stock_min: int = None) -> str:
    """Recherche élargie et multi-passes d'articles par libellé dans gamme_commande.

    Utilise CE OUTIL pour TOUTE recherche d'article par nom (pas du SQL libre
    restrictif). Comportement :
    - mots-clés multiples en français ET anglais (ex. « petit filou » cherche
      aussi %filou%, %filous%, %yoplai%, %danonino%, %yogurt%, %egg%...)
    - racine courte (%filou% plutôt que %petit filou%) pour couvrir les libellés
      hétérogènes de la même famille ;
    - élargissement automatique : si peu de résultats, relance avec marques /
      familles / catégories, sans jamais limiter la première passe au stock ;
    - tri par stock décroissant, filtre stock_min appliqué APRÈS l'élargissement.

    Paramètres :
    - terme : nom du produit recherché (ex. « petit filou », « yaourt », « oeuf »)
    - rayon : identifiant du rayon (obligatoire, vérifié côté serveur)
    - stock_min : (optionnel) ne renvoyer que les articles avec Stock >= stock_min
    Retour : JSON {success, colonnes, lignes} trié par Stock décroissant, LIMIT 20.
    """
    _guard_rayon(rayon)
    stems = _norm_termes(terme)
    if not stems:
        return json.dumps({"success": False, "erreur": "Terme de recherche vide"}, ensure_ascii=False)

    # Passes : 1) mots-clés OR  → 2) racine principale seule  → 3) familles/marques
    passes = [stems]
    principale = min(stems, key=len)
    passes.append([principale])
    familles = []
    for s in stems:
        familles.extend(_FAMILLES.get(s, []))
        fr_en = _FR_EN.get(s) or _FR_EN.get(terme.strip().lower())
        if fr_en:
            familles.extend([fr_en] if isinstance(fr_en, str) else fr_en)
    if familles:
        passes.append(list(dict.fromkeys(familles)))

    seen_rows = {}
    for mots in passes:
        clauses = []
        for m in mots:
            m2 = _escape_like(m)
            clauses.append(f'"Libellé" ILIKE \'%{m2}%\'')
        where = " OR ".join(clauses)
        stock_filter = ""
        if stock_min is not None:
            stock_filter = f' AND CAST("Stock" AS DOUBLE) >= {int(stock_min)}'
        sql = (
            'SELECT "Code", "Libellé", "Stock", "Px revient", "Px vente", "Marge %", "Couv. " '
            f"FROM gamme_commande WHERE ({where}){stock_filter} "
            'ORDER BY CAST("Stock" AS DOUBLE) DESC LIMIT 20'
        )
        raw = query.run_query(sql, rayon)
        try:
            data = json.loads(raw)
        except Exception:
            data = None
        if data and data.get("success"):
            for row in data.get("rows", []):
                code = row[0]
                if code not in seen_rows:
                    seen_rows[code] = row
        if len(seen_rows) >= 5:
            break

    if not seen_rows:
        return json.dumps({"success": False, "erreur": f"Aucun article trouvé pour « {terme} »"},
                          ensure_ascii=False)
    rows = list(seen_rows.values())[:20]
    return json.dumps({
        "success": True,
        "colonnes": ["Code", "Libellé", "Stock", "Px revient", "Px vente", "Marge %", "Couv. "],
        "lignes": rows,
        "rowCount": len(rows),
    }, ensure_ascii=False, indent=2)


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


@mcp.tool()
def gamme_history_query(jour: str, rayon: str, sql: str) -> str:
    """SQL en lecture seule sur l'HISTORIQUE quotidien de la gamme (table
    article_history) : les données détaillées d'un jour passé. Uniquement
    SELECT/WITH — toute écriture est refusée.
    jour = date au format YYYY-MM-DD correspondant à un import existant ;
    rayon = identifiant du rayon (obligatoire).
    La table `article_history` est DÉJÀ FILTRÉE sur le jour et le rayon : écris
    du SQL naturel, sans ajouter `jour` ni `rayon` au SELECT ni au WHERE.
    Colonnes : code, ean, libelle, fournisseur, marque, attribut, collection,
    stock, valeur_stock_prmp, px_vente, pv_promo, date_dbt, date_fin,
    px_revient, marge_pct, marge_promo_pct, px_achat_fac, px_achat_tv, tva,
    couv, quar, assort, sa, sf, nb_uc_pcb, mini_cde, maxi, incre, mode_reappr,
    en_cours.
    Exemples :
      SELECT code, libelle, stock FROM article_history WHERE stock = 0 ORDER BY valeur_stock_prmp DESC
      SELECT code, libelle, stock, valeur_stock_prmp FROM article_history ORDER BY stock DESC LIMIT 5
      -- promos actives au 20/08/2026 (dates stockées JJ/MM/AAAA → substr pour comparer) :
      SELECT code, libelle, pv_promo, marge_pct, marge_promo_pct FROM article_history
        WHERE pv_promo <> '' AND substr(date_dbt,7,4)||substr(date_dbt,4,2)||substr(date_dbt,1,2) <= '20260820'
          AND substr(date_fin,7,4)||substr(date_fin,4,2)||substr(date_fin,1,2) >= '20260820'
    Pièges : valeurs numériques stockées en texte → CAST(x AS DOUBLE) pour calculer ;
    prix en francs djiboutiens (FDJ) — ne jamais diviser ; SA/SF sont des codes lettrés ;
    date_dbt/date_fin au format JJ/MM/AAAA → réordonner avec substr pour comparer (voir exemple)."""
    _guard_rayon(rayon)
    return query.run_history_query(sql, rayon, jour)


@mcp.tool()
def gamme_serie(rayon: str, jusqu_a: str = "") -> str:
    """Série quotidienne complète du rayon : TOUTES les journées importées en un
    seul appel. Pour toute question d'évolution (graphique, tendance, comparaison
    de jours) — ne pas itérer sur gamme_history_query.
    jusqu_a = date de fin optionnelle (YYYY-MM-DD, défaut : dernier import).
    Renvoie par jour : negatifs (nb actifs), nouveaux, persistants, corriges,
    critiques, prmp_negatif (capital bloqué par le stock négatif, FDJ),
    prmp_corrige (déficit récupéré, FDJ), anomalies_par_type
    ({marge_negative, promo_active, chute_forte, hausse_forte}), en_stock,
    stock_bas (couv <= 7 j), dormants (couv = 999 & stock > 0),
    corriges_sous_7j (% des épisodes corrigés en <= 7 jours, glissant 90 j).
    Exemples :
      {"jour": "2026-08-18", "negatifs": 12, "nouveaux": 3, "persistants": 9,
       "corriges": 4, "critiques": 2, "prmp_negatif": 41445.0, "prmp_corrige": 0.0,
       "anomalies_par_type": {"marge_negative": 5, "chute_forte": 1},
       "en_stock": 3600, "stock_bas": 128, "dormants": 138, "corriges_sous_7j": 72}
    Pour le détail article par article d'un jour : gamme_history_query."""
    _guard_rayon(rayon)
    with db.lock_conn() as conn:
        row = conn.execute(
            "SELECT MAX(jour) AS j FROM imports WHERE rayon = ? AND statut = 'ok'", (rayon,)
        ).fetchone()
        dernier = row["j"]
        if not dernier:
            return json.dumps(
                {"success": False, "erreur": "Aucun import pour ce rayon. Dépose le fichier de gamme du jour dans le chat."},
                ensure_ascii=False,
            )
        fin = jusqu_a if re.match(r"^\d{4}-\d{2}-\d{2}$", jusqu_a or "") else dernier

        counts = conn.execute(
            "SELECT jour, statut, COUNT(*) AS n, "
            "SUM(CASE WHEN priorite = 'critique' THEN 1 ELSE 0 END) AS crit "
            "FROM negatifs_journaliers WHERE rayon = ? AND jour <= ? "
            "GROUP BY jour, statut ORDER BY jour",
            (rayon, fin),
        ).fetchall()
        prmps = conn.execute(
            "SELECT n.jour, n.statut, n.stock_j, n.stock_j1, h.px_revient "
            "FROM negatifs_journaliers n "
            "LEFT JOIN article_history h ON h.import_id = n.import_id AND h.code = n.code "
            "WHERE n.rayon = ? AND n.jour <= ? ORDER BY n.jour",
            (rayon, fin),
        ).fetchall()
        anomalies = conn.execute(
            "SELECT jour, type, COUNT(*) AS n FROM anomalies "
            "WHERE rayon = ? AND jour <= ? GROUP BY jour, type ORDER BY jour",
            (rayon, fin),
        ).fetchall()
        sante = conn.execute(
            "SELECT jour, "
            "SUM(CASE WHEN stock > 0 THEN 1 ELSE 0 END) AS en_stock, "
            "SUM(CASE WHEN stock > 0 AND couv IS NOT NULL AND couv <= 7 THEN 1 ELSE 0 END) AS stock_bas, "
            "SUM(CASE WHEN stock > 0 AND couv = 999 THEN 1 ELSE 0 END) AS dormants, "
            "SUM(CASE WHEN stock < 0 THEN 1 ELSE 0 END) AS nb_negatifs "
            "FROM article_history WHERE rayon = ? AND jour <= ? GROUP BY jour ORDER BY jour",
            (rayon, fin),
        ).fetchall()
        corrections = conn.execute(
            "SELECT jour, jours_consecutifs FROM negatifs_journaliers "
            "WHERE rayon = ? AND statut = 'corrige' ORDER BY jour",
            (rayon,),
        ).fetchall()

        # corriges_sous_7j : fenêtre glissante de 90 jours (comme /stats).
        from datetime import date, timedelta

        def _corr_pct(jour: str):
            limite = (date.fromisoformat(jour) - timedelta(days=90)).strftime("%Y-%m-%d")
            recent = [c for c in corrections if jour >= c["jour"] >= limite]
            if not recent:
                return None
            return round(
                100 * sum(1 for c in recent if (c["jours_consecutifs"] or 0) <= 7) / len(recent)
            )

        serie = {}
        for r in counts:
            d = serie.setdefault(r["jour"], {
                "jour": r["jour"], "negatifs": 0, "nouveaux": 0,
                "persistants": 0, "corriges": 0, "critiques": 0,
                "prmp_negatif": 0.0, "prmp_corrige": 0.0,
                "anomalies_par_type": {}, "anomalies_total": 0,
                "en_stock": None, "stock_bas": None, "dormants": None,
                "corriges_sous_7j": None,
            })
            if r["statut"] == "corrige":
                d["corriges"] += r["n"]
            else:
                d["negatifs"] += r["n"]
                if r["statut"] == "nouveau":
                    d["nouveaux"] += r["n"]
                else:
                    d["persistants"] += r["n"]
            d["critiques"] += r["crit"] or 0
        for r in prmps:
            d = serie.setdefault(r["jour"], {
                "jour": r["jour"], "negatifs": 0, "nouveaux": 0,
                "persistants": 0, "corriges": 0, "critiques": 0,
                "prmp_negatif": 0.0, "prmp_corrige": 0.0,
                "anomalies_par_type": {}, "anomalies_total": 0,
                "en_stock": None, "stock_bas": None, "dormants": None,
                "corriges_sous_7j": None,
            })
            px = r["px_revient"] or 0
            if r["statut"] == "corrige":
                d["prmp_corrige"] += max(0, -(r["stock_j1"] or 0)) * px
            else:
                d["prmp_negatif"] += abs((r["stock_j"] or 0) * px)
        for r in anomalies:
            d = serie.setdefault(r["jour"], {
                "jour": r["jour"], "negatifs": 0, "nouveaux": 0,
                "persistants": 0, "corriges": 0, "critiques": 0,
                "prmp_negatif": 0.0, "prmp_corrige": 0.0,
                "anomalies_par_type": {}, "anomalies_total": 0,
                "en_stock": None, "stock_bas": None, "dormants": None,
                "corriges_sous_7j": None,
            })
            d["anomalies_par_type"][r["type"]] = r["n"]
            d["anomalies_total"] += r["n"]
        for r in sante:
            d = serie.setdefault(r["jour"], {
                "jour": r["jour"], "negatifs": 0, "nouveaux": 0,
                "persistants": 0, "corriges": 0, "critiques": 0,
                "prmp_negatif": 0.0, "prmp_corrige": 0.0,
                "anomalies_par_type": {}, "anomalies_total": 0,
                "en_stock": None, "stock_bas": None, "dormants": None,
                "corriges_sous_7j": None,
            })
            d["en_stock"] = r["en_stock"]
            d["stock_bas"] = r["stock_bas"]
            d["dormants"] = r["dormants"]

        out = sorted(serie.values(), key=lambda d: d["jour"])
        for d in out:
            d["prmp_negatif"] = round(d["prmp_negatif"], 2)
            d["prmp_corrige"] = round(d["prmp_corrige"], 2)
            d["corriges_sous_7j"] = _corr_pct(d["jour"])

    return json.dumps(
        {"success": True, "rayon": rayon, "nb_jours": len(out), "serie": out},
        ensure_ascii=False,
    )


@mcp.tool()
def gamme_imports(rayon: str, limit: int = 10) -> str:
    """Historique des imports d'un rayon, du plus récent au plus ancien : jour,
    fichier_source, statut (ok | baseline | erreur) et message d'erreur éventuel.
    Répond à « pourquoi mon fichier d'hier a été refusé ? » : un import en
    erreur porte la raison dans `message`. limit = nombre d'imports à renvoyer."""
    _guard_rayon(rayon)
    with db.lock_conn() as conn:
        rows = [dict(r) for r in conn.execute(
            "SELECT id, jour, fichier_source, statut, message, date_import "
            "FROM imports WHERE rayon = ? ORDER BY id DESC LIMIT ?",
            (rayon, max(1, min(limit, 50))),
        ).fetchall()]
    if not rows:
        return json.dumps(
            {"success": False, "erreur": f"Aucun import pour le rayon `{rayon}`."},
            ensure_ascii=False,
        )
    return json.dumps(
        {"success": True, "rayon": rayon, "imports": rows},
        ensure_ascii=False,
    )


@mcp.tool()
def gamme_libeller(labels: str) -> str:
    """Nettoie et standardise une liste de libellés de produits bruts (Data Cleaning).

    QUAND L'UTILISER AUTOMATIQUEMENT (sans demander confirmation) : dès que
    l'utilisateur fournit une ou plusieurs descriptions de produits brutes et
    exprime — même implicitement — le besoin de les corriger/nettoyer/normaliser/
    standardiser/reformater/remettre en ordre, ou fournit juste une liste de
    libellés bruts. Exemples de déclencheurs : « corrige ces libellés », « nettoie
    ces produits », « voici une liste de libellés à standardiser », « remets en
    ordre ces descriptions », ou simplement le COLLAGE d'une liste de libellés.
    Un libellé est considéré « brut » s'il contient des incohérences typiques :
    casse mélangée, accents (é è à), points d'abréviation, barres obliques,
    quantités en fin ou au début, fournisseur/marque mélangés à la description.
    Passer TOUS les libellés fournis, un par ligne.

    APPLIQUE UNE MÉTHODOLOGIE en 5 étapes : nettoyage des caractères,
    extraction fournisseur / marque / quantité / description, recomposition
    (ordre FOURNISSEUR MARQUE DESCRIPTION QUANTITÉ), réorganisation logique et
    formatage final. Détecte le fournisseur (enseigne ou marque, ex. CRF →
    CARREFOUR) et renvoie un tableau Markdown à 3 colonnes :
    « Libellé Original | Libellé Corrigé | Fournisseur détecté », suivi d'une
    synthèse de la répartition des fournisseurs.

    Paramètre :
    - labels : chaîne de caractères, UN libellé par ligne (séparés par \\n).
    Utilise un modèle LLM dédié (LIBELLER_* dans .env) si configuré, sinon le
    modèle par défaut de gamme-engine."""
    lignes = [l.strip() for l in (labels or "").splitlines() if l.strip()]
    if not lignes:
        return json.dumps(
            {"success": False, "erreur": "Aucun libellé fourni (labels vide)"},
            ensure_ascii=False,
        )
    payload = "\n".join(lignes)
    try:
        content = llm.chat_completion(
            [
                {"role": "system", "content": libeller_prompt.LIBELLER_PROMPT},
                {"role": "user", "content": payload},
            ],
            temperature=0.1,
            max_tokens=4096,
            model=config.LIBELLER_MODEL,
            base_url=config.LIBELLER_BASE_URL,
            api_key=config.LIBELLER_API_KEY,
        )
    except Exception as e:
        return json.dumps(
            {"success": False, "erreur": f"Erreur LLM nettoyage libellés : {e}"},
            ensure_ascii=False,
        )
    if not content.strip():
        return json.dumps(
            {"success": False, "erreur": "Réponse LLM vide"},
            ensure_ascii=False,
        )
    return content


@mcp.tool()
def gamme_structure_articles(libelles: str = None, fichier: str = None) -> str:
    """Classe une liste d'articles dans la hiérarchie officielle du magasin
    (secteur → rayon → famille → sous-famille).

    ACCÈS DIRECT : dès que l'utilisateur fournit des libellés d'articles et
    demande de les classer/structurer/ranger dans la hiérarchie (ou colle une
    liste brute avec ou sans format), utilise cet outil automatiquement.

    Entrée : soit `libelles` (chaîne, un libellé par ligne), soit `fichier`
    (chemin d'un fichier .xlsx ou .csv déposé dans le chat — la colonne
    « Libellé » est lue automatiquement).

    Sortie : tableau structuré 9 colonnes (Libellé, Numéro secteur, Nom
    secteur, Numéro rayon, Nom rayon, Numéro famille, Nom famille, Code
    sous-famille, Nom sous-famille) + récapitulatif. Chaque classification
    est validée contre la hiérarchie officielle (codes inventés = rejet +
    retry). L'interface du chat permet de télécharger le résultat en CSV/Excel.
    """
    import pandas as pd

    # 1. Lire les libellés
    libelle_list = []
    if fichier:
        fp = config.map_nao_storage_path(fichier)
        if not os.path.exists(fp):
            return json.dumps(
                {"success": False, "erreur": f"Fichier introuvable : {fichier}"},
                ensure_ascii=False,
            )
        try:
            if fp.lower().endswith(".csv"):
                df = pd.read_csv(fp, encoding="utf-8-sig")
            else:
                df = pd.read_excel(fp, engine="openpyxl")
        except Exception as e:
            return json.dumps(
                {"success": False, "erreur": f"Erreur lecture fichier : {e}"},
                ensure_ascii=False,
            )
        # Chercher la colonne "Libellé" (ou première colonne texte)
        col = None
        for c in ["Libellé", "Libelle", "libellé", "libelle", "ARTICLE", "article", "Description", "description"]:
            if c in df.columns:
                col = c
                break
        if col is None:
            col = df.columns[0]
        libelle_list = df[col].dropna().astype(str).str.strip().tolist()
    elif libelles:
        libelle_list = [l.strip() for l in libelles.strip().splitlines() if l.strip()]
    else:
        return json.dumps(
            {"success": False, "erreur": "Fournis soit `libelles` (texte) soit `fichier` (chemin xlsx/csv)"},
            ensure_ascii=False,
        )

    if not libelle_list:
        return json.dumps(
            {"success": False, "erreur": "Aucun libellé trouvé dans l'entrée"},
            ensure_ascii=False,
        )

    h = hierarchy.get_hierarchy()
    prompt = cyrus_prompt.build_cyrus_prompt()
    max_lot = config.CLASSIF_MAX_LOT
    lots = [libelle_list[i:i + max_lot] for i in range(0, len(libelle_list), max_lot)]

    all_rows = []
    for idx, lot in enumerate(lots):
        payload = "\n".join(lot)
        tentative = 0
        lot_rows = None
        seen_libelles = set()
        retry_codes = []
        while tentative < 3:
            user_msg = payload
            if retry_codes:
                secteurs = set(r.get("secteur") for r in retry_codes if r.get("secteur"))
                sous_arbres = []
                for sc in secteurs:
                    sous_arbres.append(h.sous_arbre_secteur(sc))
                user_msg = (
                    "Certaines classifications précédentes étaient invalides. "
                    "Voici la liste des secteurs avec leurs sous-arbres valides :\n"
                    + "\n".join(sous_arbres)
                    + "\n\nÀ classer (uniquement les lignes invalides) :\n"
                    + "\n".join(r.get("libelle", "") for r in retry_codes)
                )
            try:
                content = llm.chat_completion(
                    [{"role": "system", "content": prompt}, {"role": "user", "content": user_msg}],
                    temperature=0.0,
                    max_tokens=4096,
                    model=config.CLASSIF_MODEL,
                    base_url=config.CLASSIF_BASE_URL,
                    api_key=config.CLASSIF_API_KEY,
                )
            except Exception as e:
                if lot_rows is None:
                    return json.dumps(
                        {"success": False, "erreur": f"Erreur LLM lot {idx}: {e}"},
                        ensure_ascii=False,
                    )
                break
            parsed = llm.parse_json(content)
            articles = (parsed or {}).get("articles", []) if isinstance(parsed, dict) else []
            if not articles:
                break
            valid_rows = []
            invalid = []
            for art in articles:
                lib = art.get("libelle", "")
                if not lib or lib in seen_libelles:
                    continue
                sect = art.get("secteur")
                ray = art.get("rayon")
                fam = art.get("famille")
                sf = art.get("sous_famille")
                cls = art.get("classe", True)
                seen_libelles.add(lib)
                if cls and sect and ray and fam and h.valider(sect, ray, fam, sf):
                    valid_rows.append(h.to_row(lib, sect, ray, fam, sf, True))
                elif cls and sect and ray and fam:
                    invalid.append(art)
                else:
                    valid_rows.append(h.to_row(lib, None, None, None, None, False))
            if lot_rows is None:
                lot_rows = valid_rows
            else:
                lot_rows.extend(valid_rows)
            if not invalid:
                break
            retry_codes = invalid
            tentative += 1
        # Les invalides restants après retry → NON CLASSÉ
        for art in retry_codes:
            lib = art.get("libelle", "?")
            if lib not in seen_libelles:
                seen_libelles.add(lib)
                lot_rows.append(h.to_row(lib, None, None, None, None, False))
        if lot_rows:
            all_rows.extend(lot_rows)

    recap = h.recap(all_rows)
    return json.dumps(
        {"success": True, "columns": h.columns(), "rows": all_rows, "recap": recap},
        ensure_ascii=False,
        indent=2,
    )
