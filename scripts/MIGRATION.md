# Migration HyperFix — Guide complet (ancien VPS → nouveau VPS)

> Projet : **SamalehZen/HyperFix2** (public sur GitHub)
> Domaine : `lololo.hypeer.cloud` (DNS via Cloudflare)
> Date de préparation : 2026-08-19
> Statut : paquet de migration déjà généré et testé (`/root/migration/mig-2026-08-19`)

---

## 1. Architecture actuelle (à migrer)

| Élément | Détail |
|---|---|
| Conteneurs (compose `nao-gamme`) | `nao_gamme_postgres`, `nao_gamme`, `nao_gamme_caddy`, `gamme_engine`, `dashboard_preview` |
| Code source | `/opt/HyperFix2` (git, poussé sur GitHub) |
| Config + secrets | `/opt/HyperFix2/nao-gamme/.env` (**non versionné**) |
| Base gamme (DuckDB) | `/opt/HyperFix2/nao-gamme/gamme.duckdb` |
| Uploads/exports nao | `/opt/HyperFix2/nao-gamme/storage/` |
| Documents générés | `/opt/HyperFix2/nao-gamme/docs/` (rapports, etiquettes, images) |
| Données moteur | `/storage/gamme/` (historique.db SQLite, depot, imports, rapports, backups) |
| Base conversations nao (Postgres) | volume docker `nao-gamme_nao_gamme_postgres_data` |
| Certificats TLS Caddy | volumes `nao-gamme_caddy_data`, `nao-gamme_caddy_config` |
| Backups auto | `/storage/gamme/backups/YYYY-MM-DD` (chaque jour à 03h00, rétention N jours) |

**Aucune adresse IP en dur** : tout passe par le domaine + `extra_hosts: host-gateway` → seule la bascule DNS suffit.

---

## 2. Ce qui est prêt aujourd'hui

- Paquet complet : `/root/migration/mig-2026-08-19/` (≈ 50 Mo)
  - `project-data.tar.gz` — nao-gamme (config, `.env`, duckdb, storage, docs)
  - `gamme-storage.tar.gz` — /storage/gamme
  - `nao.dump` — PostgreSQL (pg_dump custom)
  - `caddy_data.tar.gz` + `caddy_config.tar.gz` — certificats TLS
  - `secrets.env.enc` — `.env` chiffré AES-256 (passphrase à conserver)
  - `checksums.sha256` — contrôle d'intégrité
- **Tout a été testé** : sha256 ✓, archives lisibles ✓, dump restaurable (55 tables) ✓, déchiffrement `.env` ✓.
- Scripts versionnés dans le repo : `scripts/backup.sh`, `scripts/restore.sh`, `scripts/verify-migration.sh`.

---

## 3. Procédure le jour J

### Phase 0 — Avant la bascule (24-48 h)
1. Provisionner le nouveau VPS (Ubuntu 22.04/24.04, ≥ 2 Go RAM, ≥ 20 Go disque).
2. Installer : `apt update && apt install -y docker.io docker-compose-v2 git`
3. Activer Docker : `systemctl enable --now docker`
4. **Baisser le TTL du record DNS** `lololo.hypeer.cloud` (ex. 60 s) pour une propagation rapide.

### Phase 1 — Paquet frais de dernière minute (sur l'ANCIEN VPS)
```bash
/opt/HyperFix2/scripts/backup.sh /root/migration/mig-$(date +%F)
```
Transférer le paquet vers le nouveau VPS : `scp -r /root/migration/mig-* user@<nouvelle-ip>:/tmp/`

### Phase 2 — Restauration (sur le NOUVEAU VPS)
```bash
./scripts/restore.sh /tmp/mig-YYYY-MM-DD
```
Le script : clone GitHub → restaure les données → Postgres → certificats → permissions (UID 1000) → `docker compose up -d --build` → premières vérifs.

### Phase 3 — Bascule DNS + validation
1. Cloudflare : record A `lololo.hypeer.cloud` → **nouvelle IP**.
2. Vérifier : `dig lololo.hypeer.cloud` (nouvelle IP) puis `./scripts/verify-migration.sh`
3. Points à contrôler manuellement : login nao, import de fichiers, alerte Telegram (webhook défini par domaine → OK automatiquement), certificat TLS (certs restaurés, aucune ré-émission).

### Phase 4 — Fin de vie
- Garder l'ancien VPS **48 h** en parallèle (rollback possible en re-pointant le DNS).
- Après validation complète : supprimer l'ancien VPS.

---

## 4. Téléchargement sur l'iPad (copie de sécurité hors VPS)

- Si besoin de récupérer le paquet sur un iPad : méthode **SFTP via Termius** (connexion directe port 22, reprise possible) ou lien temporaire HTTPS protégé par mot de passe via Caddy (à retirer immédiatement après téléchargement).
- Le paquet ≈ 50 Mo : confortable pour un iPad.

---

## 5. Sécurité et points de vigilance

- **Ne jamais committer `.env`** (gitignoré ✓). `secrets.env.enc` = copie chiffrée de secours ; la passphrase doit être conservée en lieu sûr.
- **Clone public** : le repo est public → `git clone` sans secret. Pour le push, utiliser un credential helper ou l'URL avec token, jamais un token en clair dans l'historique du shell.
- **Permissions** : `chown -R 1000:1000 nao-gamme /storage/gamme` obligatoire (sinon erreurs d'écriture des imports/uploads).
- **Changement de domaine** : si le domaine change, il faudra modifier Caddyfile, `.env` (BETTER_AUTH_URL, GAMME_MCP_URL), `extra_hosts` et reconfigurer Telegram/OAuth.
- **Rollback** : re-pointer le DNS vers l'ancien VPS suffit tant qu'il est encore actif (rien n'est détruit avant la validation).

---

## 6. Références

- Dépôt : https://github.com/SamalehZen/HyperFix2
- Compose : `nao-gamme/docker-compose.yml` — Caddy : `nao-gamme/Caddyfile`
- Backups auto : `gamme-engine/app/backup.py` (03h00)
- Checklist de validation : `scripts/verify-migration.sh`