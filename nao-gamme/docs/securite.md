# Sécurité HyperFix2 — inventaire (2026-09-04)

## Lieux protégés par mot de passe (`basicauth` Caddy, voir `../Caddyfile`)

| Chemin | Contenu |
|---|---|
| `https://lololo.hypeer.cloud/rapports` | Rapports générés |
| `https://lololo.hypeer.cloud/etiquettes` | PDF d'étiquettes EAN-13 |
| `https://lololo.hypeer.cloud/images` | Photos articles |
| `https://lololo.hypeer.cloud/story-data` | Données du story (négatifs, PRMP, anomalies) |
| `https://lololo.hypeer.cloud/story` | Dashboard mix2 |

Identifiant et mot de passe : demandés au gestionnaire (jamais écrits ici ni
dans git — seul le hash bcrypt est dans le `Caddyfile`).

## Autres protections

- **Chat nao** (`/`) : compte obligatoire, inscriptions fermées
  (`ENABLE_USER_SIGNUP=false`).
- **Moteur `/api/*`** : JWT nao obligatoire (sinon `401`).
- **Outils MCP** : JWT + contrôle du rayon côté serveur.

## Secrets (`.env`, jamais commité — voir `.env.example`)

`POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `OPENCODE_API_KEY`,
`OPENCODE_ZEN_API_KEY`, `B_AI_API_KEY`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`.

## Reste public (normal)

- `/healthz` (sonde santé), métadonnées `/.well-known/*`.
- `popo.hypeer.cloud`, `momo.hypeer.cloud` (autres projets).

## Changer le mot de passe Caddy

1. Générer le hash : `caddy hash-password` (mot de passe via stdin).
2. Remplacer user + hash dans les blocs `basicauth` du `Caddyfile`.
3. `docker exec nao_gamme_caddy caddy reload --config /etc/caddy/Caddyfile`.
4. Tester : `401` sans login, `200` avec login sur chaque chemin.
