# Kit de survie — perte totale du VPS

> ⚠️ **Ne JAMAIS committer ce fichier rempli.** Remplis les secrets dans une
> COPIE stockée hors serveur (gestionnaire de mots de passe : Bitwarden,
> 1Password, KeePass). Ce fichier committé ne contient que des emplacements.

## 1. Secrets à recopier hors serveur (une fois, puis à chaque rotation)

| Secret | Où le trouver (sur le VPS) | Valeur recopiée |
|---|---|---|
| Clé B2 (`AWS_ACCESS_KEY_ID`) | `/opt/hyperfix-backup/.env` | `…` |
| Secret B2 (`AWS_SECRET_ACCESS_KEY`) | `/opt/hyperfix-backup/.env` | `…` |
| Dépôt restic (`RESTIC_REPOSITORY`, bucket `hyperfix-nao-backups`) | `/opt/hyperfix-backup/.env` | `…` |
| Mot de passe restic (`RESTIC_PASSWORD`) | `/opt/hyperfix-backup/.env` | `…` |
| Passphrase `.env` chiffré (si `secrets.env.enc` utilisé) | ta tête / gestionnaire | `…` |
| Compte GitHub + repo `SamalehZen/HyperFix2` | ton navigateur | OK / KO |

Sans ces 3 premières lignes, la sauvegarde B2 existe mais est **illisible**.

## 2. Ce qui survit hors VPS

- **Code** : GitHub `SamalehZen/HyperFix2`, branche `main`.
- **Données** : snapshot restic quotidien (03h30) sur B2 — perte max 24 h.
- **Domaine** : registrar (repointer le DNS vers la nouvelle IP).

## 3. Restauration sur machine neuve (ordre strict)

```bash
# 0. Prérequis : Ubuntu + docker + restic installés, DNS repointé.
# 1. Code
git clone https://github.com/SamalehZen/HyperFix2.git /opt/HyperFix2
cd /opt/HyperFix2/nao-gamme && cp .env.example .env   # + renseigner les secrets

# 2. Données depuis B2 (exporter les 4 vars du tableau §1 d'abord)
export AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=… RESTIC_REPOSITORY=… RESTIC_PASSWORD=…
restic snapshots --tag nao                            # choisir l'ID
mkdir -p /tmp/restore && restic restore <ID> --target /tmp/restore

# 3. Vérifier AVANT de toucher à la prod
python3 -c "import sqlite3; c=sqlite3.connect('/tmp/restore/<chemin>/historique.db'); print(c.execute('PRAGMA integrity_check').fetchone(), c.execute('SELECT COUNT(*) FROM article_history').fetchone())"
# attendu : ('ok',) + ~388 000 lignes

# 4. Démarrer l'infra puis injecter
docker compose up -d postgres                         # ajuste selon le service
docker exec -i nao_gamme_postgres psql -U nao -d nao < /tmp/restore/<chemin>/nao_pg.sql
mkdir -p /storage/gamme && cp /tmp/restore/<chemin>/historique.db /storage/gamme/historique.db
docker compose up -d
rm -rf /tmp/restore
```

## 4. Vérifications finales

- `curl /healthz` moteur → 200 ; dashboard `/story/dashboard/mix2` → 200.
- Dernier jour importé présent ; sidebar complète.
- Cron backup recréé (`30 3 * * * /opt/hyperfix-backup/backup.sh`).

## 5. À re-tester périodiquement

- Test mensuel de restauration (déjà automatisé le 1er à 05h00 : `restore-test.sh`).
- Ce kit : vérifier 1×/an que les secrets recopiés ouvrent toujours le dépôt
  (`restic snapshots` depuis une autre machine).
