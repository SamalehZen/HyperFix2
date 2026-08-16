# HyperFix — Agent Gamme Épicerie Salée

Plateforme complète d'analyse de la gamme pour l'épicerie salée : import quotidien
du fichier de gamme, détection des prix/marges négatifs, suivi des anomalies,
compensateurs, et dashboard interactif « story mode », le tout via un agent
conversationnel **nao**.

## Architecture

```
HyperFix/
├── nao/                     # Code source complet de l'agent nao (getnao)
│   ├── apps/                # Frontend (React) + backend (NestJS) + libs partagées
│   ├── cli/                 # CLI Python nao (config, sync contexte, tests)
│   ├── skills/              # Skills métier de l'agent
│   ├── helm/                # Chart Helm pour déploiement Kubernetes
│   └── docker-compose.yml   # Pile nao autonome
├── nao-gamme/               # Config métier nao + orchestration (docker-compose)
│   ├── docker-compose.yml   # Déploie tout le stack (nao + moteur + caddy)
│   ├── Caddyfile            # Reverse proxy (domaine, rapports, étiquettes)
│   ├── RULES.md             # Règles métier de l'agent
│   ├── nao_config.yaml      # Configuration du projet nao (LLM, DuckDB)
│   ├── .env.example         # Modèle de variables d'environnement
│   ├── agent/               # Spécifications MCP, prompts, skills
│   ├── docs/                # Documentations + rapports générés
│   └── storage/             # Données locales (exclues de git)
└── gamme-engine/            # Moteur MCP Python (analyse de la gamme)
    └── app/                 # API FastAPI + serveur MCP
```

> `nao/` est le code source de l'agent conversationnel ; `nao-gamme/` est la
> configuration métier qui lance nao via l'image `getnao/nao:latest` avec le
> moteur `gamme-engine` en MCP.

| Service | Image / Build | Rôle | Port |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | Base des conversations nao | interne |
| `nao` | `getnao/nao:latest` | Agent conversationnel | `5005` |
| `caddy` | `caddy:2-alpine` | Reverse proxy HTTPS + rapports | `80` / `443` |
| `gamme-engine` | build local (`../gamme-engine`) | Analyse gamme, API + MCP | `8010` |

## Prérequis

- **Docker** ≥ 24 et **Docker Compose** ≥ 2.20
  - Linux : `sudo apt install docker.io docker-compose-v2`
  - macOS/Windows : Docker Desktop
- Une clé API **OpenCode** (ou fournisseur LLM compatible)
- Un domaine (optionnel) pour l'accès public via Caddy

## Installation pas à pas

### 1. Récupérer le dépôt

```bash
git clone https://github.com/SamalehZen/HyperFix2.git
cd HyperFix2/nao-gamme
```

### 2. Créer le fichier `.env`

```bash
cp .env.example .env
nano .env
```

Renseignez au minimum :

| Variable | Description | Exemple |
|---|---|---|
| `OPENCODE_API_KEY` | Clé du fournisseur LLM (obligatoire) | `sk-...` |
| `OPENCODE_BASE_URL` | URL de l'API compatible OpenAI | `https://opencode.ai/zen/go/v1` |
| `BETTER_AUTH_SECRET` | Secret de session nao (générez-le) | `openssl rand -base64 32` |
| `POSTGRES_PASSWORD` | Mot de passe de la base (à changer) | — |
| `ENABLE_USER_SIGNUP` | `true` à la 1re création de comptes, puis `false` | `true` |

> ⚠️ Le `.env` contient des secrets : il est ignoré par git et n'est **jamais**
> poussé. Ne le commitez pas.

### 3. Lancer la pile

```bash
docker compose up -d --build
```

Docker construit `gamme-engine` (Python 3.12 + FastAPI + MCP), tire les images
`nao`, `postgres` et `caddy`, puis démarre les 4 services.

### 4. Vérifier que tout tourne

```bash
docker compose ps
```

Attendu : les 4 services `running` (postgres attendu `healthy`).

```bash
curl -s http://127.0.0.1:8010/api/status   # moteur gamme
curl -s http://127.0.0.1:5005/             # interface nao
```

### 5. Créer le premier compte

1. Ouvrez **http://localhost:5005** (ou votre domaine).
2. Créez le compte gestionnaire (signup actif si `ENABLE_USER_SIGNUP=true`).
3. Passez `ENABLE_USER_SIGNUP=false` puis `docker compose up -d` pour verrouiller.

### 6. Configurer le domaine (optionnel, production)

Éditez `Caddyfile` et remplacez `lololo.hypeer.cloud` par votre domaine :

```
lololo.hypeer.cloud {
    handle /rapports/*   { ... }
    handle /etiquettes/* { ... }
    handle { reverse_proxy nao:5005 }
}
```

Caddy obtient automatiquement le certificat HTTPS. Pensez à pointer le DNS de
votre domaine vers le serveur.

## Utilisation

### Importer un fichier de gamme

Le moteur surveille `/storage/gamme/depot` (sur l'hôte). Deux façons de déposer
un fichier (`.xlsx`, `.xlsm`, `.csv`) :

**A. Via l'agent nao** (recommandé) : déposez le fichier dans le chat nao ;
l'agent appelle `gamme_import_file` du serveur MCP et vous présente le résumé.

**B. Via le script** :

```bash
cd nao-gamme
./import_gamme.sh /chemin/vers/gamme_du_jour.xlsx
```

Le moteur enchaîne alors : archivage → snapshot → comparaison J/J-1 →
classification → anomalies → compensateurs LLM → dashboard story mode.

### Le livrable généré à chaque import

**Story mode** — dashboard interactif (SPA React + shadcn/ui, servie par
gamme-engine, données live) :
`https://<domaine>/story/?jour=<jour>&rayon=<rayon>`

### API du moteur (gamme-engine)

| Endpoint | Description |
|---|---|
| `GET /api/status` | État du moteur et des imports |
| `GET /story/` | SPA story mode (dashboard shadcn/ui) |
| `GET /story-data/jours?rayon=` | Jours disponibles (navigation story mode) |
| `GET /story-data/YYYY-MM-DD?rayon=` | Données complètes du story mode |
| MCP (port 8010) | Outils `gamme_import_file`, `gamme_rapports`, `gamme_negatifs`, `gamme_anomalies`, `gamme_etiquettes`, `gamme_rayons`… |

## Commandes utiles

```bash
docker compose logs -f nao          # logs de l'agent
docker compose logs -f gamme-engine # logs du moteur
docker compose restart gamme-engine # redémarrer le moteur
docker compose down                 # arrêter (les données sont conservées)
docker compose down -v              # arrêter ET supprimer les volumes (⚠️)
```

## Dépannage

| Problème | Solution |
|---|---|
| `postgres` n'est pas `healthy` | Vérifiez `POSTGRES_USER/PASSWORD/DB` cohérents dans `.env` |
| Le moteur répond sur le port 8010 mais pas nao | `docker compose logs gamme-engine`, vérifiez `OPENCODE_API_KEY` |
| L'import rejette le fichier | Colonnes manquantes ou codes en doublon — l'agent explique l'erreur |
| Caddy : certificat non obtenu | Le DNS doit pointer vers le serveur avant le 1er démarrage |
| Rapport vide / moteur injoignable | `curl http://127.0.0.1:8010/api/status` puis `docker compose restart gamme-engine` |

## Sécurité

- Les secrets (`.env`, clés API) sont exclus du dépôt git (`.gitignore`).
- La clé LLM est injectée au runtime via `{{ env('OPENCODE_API_KEY') }}` dans
  `nao_config.yaml` — aucun secret en clair dans le code.
- Les services internes (nao :5005, moteur :8010) n'écoutent que sur
  `127.0.0.1` ; seul Caddy (80/443) est exposé publiquement.
- Pensez à **révoquer toute clé qui aurait déjà été commitée** par le passé.
