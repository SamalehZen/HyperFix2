# HyperFix2 — Récapitulatif des changements (mémo)

Date : 14/08/2026 — Serveur : Ubuntu 24.04, Docker 29.7.2 / Compose v5.4.0
Domaine : https://lololo.hypeer.cloud (derrière Cloudflare — les requêtes non-navigateur sont bloquées : tous les scripts/test utilisent un User-Agent navigateur).

---

## 1. Déploiement

- Projet copié dans `/opt/HyperFix2/nao-gamme`, données dans `/opt/HyperFix2/nao-gamme/storage` et `/storage/gamme`.
- 4 services (docker compose) :
  - `nao_gamme` : getnao/nao:latest (port 5005, backend bun depuis `src/`)
  - `gamme_engine` : moteur MCP FastAPI/FastMCP (port 8010, image locale `nao-gamme-gamme-engine`)
  - `nao_gamme_postgres` : base (healthcheck OK)
  - `nao_gamme_caddy` : HTTPS Let's Encrypt + proxy
- `.env` (secrets) : `POSTGRES_USER=nao`, `SERVER_PORT=5005`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=https://lololo.hypeer.cloud/`, providers LLM `OPENCODE_*` (Go), `OPENCODE_ZEN_*` (Zen), `B_AI_*`, `SEEKAI_*`, `GAMME_LLM_MODEL=muse-spark-1.3-contributor-free` (moteur sur Zen, conversations sur B.AI `glm-5.3-flash`), `GAMME_MAX_LLM_ARTICLES=40`.
- `chown -R 1000:1000 /opt/HyperFix2/nao-gamme` (droit d'écriture MCP pour l'utilisateur nao, uid 1000).

## 2. Corrections antérieures

- **« Invalid origin » à l'inscription** : `BETTER_AUTH_URL` était `http://localhost:5005/` → corrigé en `https://lololo.hypeer.cloud/`.
- **« Configure a model »** : dans `nao_config.yaml`, `api_key: {{ env('OPENCODE_API_KEY') }}` sans guillemets était parsé comme un objet YAML et faisait rejeter tout le bloc `llm` → guillemets ajoutés : `api_key: "{{ env('OPENCODE_API_KEY') }}"`.

## 3. Isolation stricte serveur (objectif : chaque gestionnaire ne voit que son rayon)

### 3.1 Principe
Gamme-engine est un **resource server RFC 9728** : nao (better-auth) émet un **JWT EdDSA par utilisateur**, gamme-engine le vérifie (JWKS), résout l'email (userinfo) puis applique le contrôle d'accès par rayon (rayons.json) dans chaque outil.

### 3.2 Côté nao (patch au démarrage)
- Fichier : `/opt/HyperFix2/nao-gamme/nao-patches/patch-oauth.sh`
- Monté en lecture seule dans le conteneur (`./nao-patches:/app/patches:ro`), exécuté par l'entrypoint override dans `docker-compose.yml`.
- Action : ajoute `process.env.GAMME_ENGINE_MCP_URL ?? "http://gamme_engine:8010/"` à `validAudiences` de `/app/apps/backend/src/auth.ts:226`.
- **Idempotent** : vérifie si le marqueur est déjà présent avant de patcher (le conteneur est éphémère, le patch est réappliqué à chaque redémarrage).
- `GAMME_ENGINE_MCP_URL: http://gamme_engine:8010/` dans l'environnement du service nao.
- **Attention** : la correspondance est EXACTE (Set.has) au token endpoint — le trailing slash compte. Même valeur dans `AUDIENCES` côté gamme-engine.

### 3.3 Côté gamme-engine
- `app/auth.py` :
  - `ISSUER` (env `NAO_AUTH_ISSUER` = BETTER_AUTH_URL), `GAMME_MCP_URL` (env, défaut `http://gamme_engine:8010/`), `AUDIENCES` (accepte avec/sans slash + `/mcp`).
  - Découverte OAuth automatique (`.well-known/oauth-authorization-server`), JWKS via `PyJWKClient(uri, cache_keys=True, headers=_UA)` (PyJWT 2.13 : pas de `requests_session`, utiliser `headers`), algorithmes `["EdDSA", "RS256"]` (nao signe en EdDSA !).
  - `resolve_user(token, claims)` : userinfo (cache 60 s) → email → `allowed_rayons_for()` (rayons.json).
  - `NaoTokenVerifier.verify_token()` : implémente le `TokenVerifier` FastMCP, renvoie un `AccessToken` avec `claims={email, name, rayons}`.
- `app/mcp_server.py` :
  - `FastMCP(..., auth=AuthSettings(issuer_url=auth.ISSUER, resource_server_url=auth.GAMME_MCP_URL), token_verifier=NaoTokenVerifier())` → FastMCP gère l'auth sur tout `/mcp` (401 sans token, PRM auto sur `/.well-known/oauth-protected-resource`).
  - `_current_user()` lit `get_access_token()` (mcp.server.auth.middleware.auth_context) — **c'est la propagation fiable** (le contextvar FastAPI/middleware ne traverse PAS les tasks FastMCP).
  - `_check_rayon(rayon)` appliqué sur tous les outils données (import, rapports, négatifs, article, anomalies) ; outil `gamme_mon_rayon` pour lister ses rayons.
- `app/main.py` :
  - Middleware : passe `/mcp`, `/.well-known/*`, `/healthz`, OPTIONS ; exige un JWT nao valide sur `/api/*`.
  - Route PRM manuelle supprimée (gérée par FastMCP). `/healthz` ajouté.
- `requirements.txt` : `PyJWT[crypto]>=2.8`, `cryptography>=42.0`.
- `docker-compose.yml` (gamme-engine) : env `NAO_AUTH_ISSUER: ${BETTER_AUTH_URL}`.
- `/storage/gamme/rayons.json` : `{"epicerie-salee": {"libelle": "Épicerie salée", "gestionnaire": "test.gestionnaire@example.com"}}` — relu à chaque appel, dynamique.
- `RULES.md` : règles agent (gamme_mon_rayon d'abord, aucun outil sur les salutations, refus serveur si rayon inconnu).

### 3.4 Flux OAuth (reproduit par `/tmp/opencode/oauth_flow.py`)
1. Sign-in nao → token de session (Bearer, localStorage, pas de cookie).
2. PRM : `GET http://gamme_engine:8010/.well-known/oauth-protected-resource` → resource + authorization_servers.
3. DCR : `POST .../api/auth/oauth2/register` (client public, PKCE).
4. `authorize` (param `resource` = resource du PRM) → `{"redirect":true,"url":"/consent?..."}`.
5. `POST /api/auth/oauth2/consent` body JSON `{"accept":true,"oauth_query":"?"+query}` → `{"redirect":true,"url":"...callback?code=..."}`.
6. `POST /api/auth/oauth2/token` en **application/x-www-form-urlencoded** (pas JSON !) avec `resource` → **JWT** `aud=["http://gamme_engine:8010/", ".../oauth2/userinfo"]`.

### 3.5 Résultats des tests (E2E)
- initialize sans token → 401 `invalid_token` (avec WWW-Authenticate RFC 9728).
- initialize + tools avec JWT → 200.
- `gamme_mon_rayon` → `["epicerie-salee"]` (compte de test).
- `gamme_negatifs(epicerie-salee)` → autorisé ; `gamme_negatifs(bazar)` → « Accès refusé : vous n'êtes pas gestionnaire du rayon `bazar`... ».
- Inscription : `ENABLE_USER_SIGNUP=false` dans `.env` → `EMAIL_PASSWORD_SIGN_UP_DISABLED` ; connexion des comptes existants OK.

## 4. Comptes et accès

- Compte de test (seul compte utilisable pour l'instant) : `test.gestionnaire@example.com` — associé à epicerie-salee. Mot de passe retiré de cette doc (voir AMELIORATIONS.md : compte à désactiver/supprimer).
- Pour ajouter un gestionnaire : 1) créer le compte (mettre `ENABLE_USER_SIGNUP=true` dans `.env`, `docker compose up -d --force-recreate nao`, créer le compte, remettre `false`) ; 2) ajouter son email dans `/storage/gamme/rayons.json`.

## 5. Opérations courantes

```bash
cd /opt/HyperFix2/nao-gamme
docker compose up -d                                   # applique le patch nao (idempotent)
docker compose up -d --force-recreate nao              # redémarre nao (patch + env)
docker compose build gamme-engine && docker compose up -d gamme-engine   # après modif du moteur
docker logs -f nao_gamme / gamme_engine                # logs
```

- Test rapide : `python3 /tmp/opencode/oauth_flow.py` puis `python3 /tmp/opencode/mcp_test.py` (token JWT frais dans `/tmp/opencode/token.txt`).

## 6. Points de vigilance

- **Mise à jour de l'image nao** : le patch `patch-oauth.sh` échoue si le motif `validAudiences: [env.BETTER_AUTH_URL, MCP_SERVER_URL]` n'existe plus dans `auth.ts` → adapter le sed.
- **Cloudflare** : tout appel HTTP depuis les conteneurs/scripts vers https://lololo.hypeer.cloud doit avoir un User-Agent navigateur, sinon 403.
- **Session nao** : le token de session est stocké en localStorage (pas de cookie) — les scripts de test passent par le header `Authorization: Bearer <token>`.
- **En cas de problème de connexion MCP côté nao** : nao met en cache le flag OAuth (`_oauth[gamme-engine]`) ; un `docker compose up -d --force-recreate nao` force la re-découverte.
- Le client MCP dans `agent/mcps/mcp.json` ne doit pas avoir de header d'auth statique (le flux OAuth se fait automatiquement).
- **Mot de passe Caddy** : `/rapports`, `/etiquettes`, `/images`, `/story-data` et `/story` derrière `basicauth` (voir `docs/securite.md`).
- **Récap story V2** : chaque récap du jour génère un story avec graphiques (skill `recap-rayon`) ; dashboard mix2 : `/story/dashboard/mix2?jour=&rayon=` (protégé).
- **LLM actuels (09/2026)** : conversations B.AI `glm-5.3-flash`, moteur Zen `muse-spark-1.3-contributor-free` (gratuit, `/responses`) ; `hy3-free` n'existe plus.