# HyperFix — Améliorations à corriger (liste de travail)

> **Statut** : liste de travail — à traiter ultérieurement, pas maintenant.
> **Date de création** : 2026-08-28
> **Périmètre** : HyperFix2 (nao-gamme, gamme-engine, dashboard-preview)

Cette liste regroupe les améliorations / corrections identifiées lors de l'audit
du projet, classées par priorité. Chaque élément peut être coché quand il est
réalisé.

---

## 🔴 Critique

- [ ] **Tourner tous les secrets exposés**
  - `.env` contient en clair : clés API LLM (OPENCODE_API_KEY, OPENCODE_ZEN_API_KEY, SEEKAI_API_KEY), TELEGRAM_BOT_TOKEN, POSTGRES_PASSWORD, BETTER_AUTH_SECRET.
  - **Action** : révoquer/régénérer chaque clé, stocker via Docker secrets / vault, retirer toute clé éventuellement commitée dans l'historique git.

- [x] **Protéger les dossiers publics `/rapports/*` et `/etiquettes/*`** (résolu 2026-09-04)
  - Caddy servait `file_server browse` sans authentification.
  - **Fait** : `basicauth sam` sur `/rapports/*`, `/etiquettes/*`, `/images/*`, `/story-data/*` et `/story*` (voir `nao-gamme/docs/securite.md`).

- [x] **Remplacer ou sécuriser le `dashboard-preview`** (résolu 2026-09-04)
  - Servi publiquement sur `/story*`.
  - **Fait** : `/story*` derrière `basicauth sam` (dashboard mix2 conservé, plus de données mock).

---

## 🟡 Moyen

- [ ] **Centraliser la configuration du provider LLM (une seule source de vérité)**
  - Dérive actuelle entre `nao_config.yaml` (B.AI `glm-5.3-flash` par défaut depuis 09/2026, avant SeekAI), `.env` (GAMME_LLM_MODEL, URL Zen) et `docker-compose.yml`.
  - **Action** : documenter/valider la cohérence, ou automatiser la synchro.

- [ ] **Rendre le patch OAuth robuste** (`nao-patches/patch-oauth.sh`)
  - Utilise `sed` sur le source backend (`auth.ts`) : si l'image `getnao/nao:latest` change le motif, le conteneur ne démarre plus (`exit 1`).
  - **Action** : regex tolérante + fallback, ou config par variable d'environnement, ou journaliser l'échec sans bloquer le boot.

- [ ] **Corriger `import_gamme.sh`**
  - `PROJET=/root/nao-gamme` est obsolète (le projet est dans `/opt/HyperFix2/nao-gamme`).
  - Le dépôt n'est pas aligné sur les sous-dossiers par rayon (`depot/frais-surgele`, `depot/epicerie-salee/...`).
  - **Action** : chemin corrigé + dépôt par rayon + vérification que le fichier a bien été pris en compte (au lieu d'un simple timeout).

- [ ] **Revoir les `extra_hosts` (`lololo.hypeer.cloud:host-gateway`)**
  - Le domaine public pointe vers l'hôte Docker dans les conteneurs : risque de pivot si un conteneur est compromis.
  - **Action** : limiter les accès, séparer le trafic interne, réseau dédié.

- [ ] **Configurer le mode WAL de SQLite + revoir la concurrence**
  - Lock global sur SQLite, pas de WAL : goulot d'étranglement potentiel (watcher + MCP + story_api).
  - **Action** : activer `journal_mode=WAL`, évaluer un vrai pool de connexions.

- [ ] **Ajouter des limites de ressources aux conteneurs**
  - Aucun service n'a de `mem_limit` / `cpus` dans `docker-compose.yml`.
  - **Action** : définir des limites réalistes pour nao, gamme-engine, caddy, postgres.

- [ ] **Supprimer le compte de test documenté**
  - `test.gestionnaire@example.com` / `Test1234!` cité dans `RAPPEL_CHANGEMENTS.md` : backdoor potentielle si encore actif.
  - **Action** : désactiver/supprimer le compte, retirer les identifiants des docs.

- [x] **Restreindre l'exposition des endpoints story/publics** (résolu 2026-09-04)
  - `/story-data/*` et `/story*` étaient accessibles sans auth (stocks, prix, négatifs).
  - **Fait** : `basicauth sam` sur les deux. Reste ouvert (normal) : `/healthz`.

---

## 🟢 Faible

- [ ] **Compléter la suite de tests** (gamme-engine)
  - Seulement ~9 tests pytest (pipeline, db, compensation) : pas de test d'intégration complet.
  - **Action** : ajouter un test d'import complet → vérification DB → story-data, + tests de la config nao.

- [ ] **Mettre en place une CI (GitHub Actions)**
  - Aucun pipeline visible : lint, tests, validation `docker-compose config` n'existent pas.
  - **Action** : workflow minimal (pytest + build images + validation compose).

- [ ] **Ajouter un `system.md`** (prompts nao)
  - Les règles métier de `RULES.md` ne s'appliquent qu'à Telegram ; le web/Slack/Teams n'ont que les défauts.
  - **Action** : créer un prompt système global ou au moins pour le web.

- [ ] **Nettoyer les données de test dans `storage/`**
  - Fichiers `BonCommande_*.pdf`, `Classeur*.xlsx`, `lllllll*` accumulés dans l'arborescence uploads.
  - **Action** : archiver/supprimer les fichiers de test obsolètes.

- [ ] **Corriger le cache JWKS / rotation de clés** (`auth.py`)
  - `PyJWKClient(cache_keys=True)` : un ancien token peut être accepté après rotation de clé.
  - **Action** : borner le TTL du cache, prévoir une invalidation.

- [ ] **Durcir `map_nao_storage_path`** (`config.py`)
  - Résolution par `os.walk` + `endswith(rel)` : risque de path traversal si entrée malveillante (`..`).
  - **Action** : normaliser/valider les chemins, interdire `..` et les liens symboliques.

- [ ] **Backups hors-site / chiffrés** (`backup.py`)
  - Backups stockés dans le même volume que les données, sans chiffrement ni vérification d'intégrité.
  - **Action** : copie hors-serveur (S3/bucket), chiffrement, contrôle d'intégrité.

- [ ] **Ajouter un `README.md` à `nao-gamme/` + rafraîchir `RAPPEL_CHANGEMENTS.md`**
  - L'état des providers a changé depuis le 14/08 ; le README racine suffit mal au niveau métier.
  - **Action** : README dédié + mise à jour des « points de vigilance ».

- [ ] **Système de migration formel** (schéma DB)
  - Les schémas SQLite évoluent via `ALTER TABLE` ad-hoc dans `init_db()`.
  - **Action** : adopter un outil de migration (ex. Alembic) ou documenter les migrations.

---

## ⚠️ À ne pas oublier (immédiat)

- [x] **Récap story V2 automatique** (résolu 2026-09-04)
  - **Fait** : skill `recap-rayon` réécrit — chaque récap donne un story avec graphiques (pont `VALUES`, 3 sections min, plan commando 48h) + dialogue « créer un story » au même standard + explication sous chaque graphique.
