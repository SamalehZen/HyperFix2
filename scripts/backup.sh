#!/usr/bin/env bash
# ============================================================
# backup.sh — Génère le paquet de migration HyperFix (ancien VPS)
# Usage :  ./backup.sh [dossier_destination]
#          (défaut : /root/migration/mig-YYYY-MM-DD)
#
# Crée : project-data.tar.gz, gamme-storage.tar.gz, nao.dump,
#        caddy_data.tar.gz, caddy_config.tar.gz, secrets.env.enc,
#        checksums.sha256
# ============================================================
set -euo pipefail

DEST="${1:-/root/migration/mig-$(date +%F)}"
mkdir -p "$DEST"
cd "$DEST"

echo "[backup] Destination : $DEST"

echo "[1/7] Project nao-gamme (config, secrets, duckdb, storage, docs)…"
tar czf project-data.tar.gz -C /opt/HyperFix2 nao-gamme

echo "[2/7] Données moteur /storage/gamme…"
tar czf gamme-storage.tar.gz -C /storage gamme

echo "[3/7] Base PostgreSQL (nao)…"
docker exec nao_gamme_postgres pg_dump -U nao -d nao -Fc > nao.dump

echo "[4/7] Certificats Caddy (volumes nao-gamme_caddy_*)…"
docker run --rm -v nao-gamme_caddy_data:/d -v "$DEST":/b alpine tar czf /b/caddy_data.tar.gz -C /d .
docker run --rm -v nao-gamme_caddy_config:/c -v "$DEST":/b alpine tar czf /b/caddy_config.tar.gz -C /c .

echo "[5/7] Copie chiffrée du .env (secrets.env.enc)…"
if [ -f /opt/HyperFix2/nao-gamme/.env ]; then
  read -rsp "Passphrase pour chiffrer le .env (à garder !) : " PASS
  echo
  openssl enc -aes-256-cbc -pbkdf2 -salt -pass pass:"$PASS" \
    -in /opt/HyperFix2/nao-gamme/.env -out secrets.env.enc
else
  echo "  ! .env absent, ignoré"
fi

echo "[6/7] Checksums…"
sha256sum *.tar.gz *.dump *.enc > checksums.sha256

echo "[7/7] Vérification intégrité…"
sha256sum -c checksums.sha256 > /dev/null && echo "  sha256 OK"
for f in project-data gamme-storage caddy_data caddy_config; do
  tar -tzf "$f.tar.gz" > /dev/null && echo "  $f.tar.gz OK"
done
docker cp nao.dump nao_gamme_postgres:/tmp/nao.dump
docker exec nao_gamme_postgres sh -c 'pg_restore --list /tmp/nao.dump >/dev/null && rm /tmp/nao.dump' \
  && echo "  nao.dump OK"

echo
echo "[backup] Terminé ✓  →  $DEST"
ls -lh "$DEST"