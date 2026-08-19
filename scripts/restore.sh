#!/usr/bin/env bash
# ============================================================
# restore.sh — Restaure la stack HyperFix sur le NOUVEAU VPS
# Usage :  ./restore.sh /chemin/vers/le/paquet-de-migration
#
# Prérequis : docker + compose plugin + git installés.
# Le paquet est généré par backup.sh sur l'ancien VPS.
# ============================================================
set -euo pipefail

PKG="${1:?Usage: restore.sh /chemin/vers/paquet}"
[ -d "$PKG" ] || { echo "Erreur : $PKG n'existe pas"; exit 1; }

REPO="${2:-/opt/HyperFix2}"
REPO_URL="https://github.com/SamalehZen/HyperFix2.git"

echo "=== 1/8 Récupération du code (GitHub) ==="
mkdir -p "$REPO"
if [ -d "$REPO/.git" ]; then
  echo "  Repo déjà présent, pull…"
  git -C "$REPO" pull --ff-only || true
else
  git clone "$REPO_URL" "$REPO"
fi

echo "=== 2/8 Restauration des données projet (nao-gamme) ==="
tar xzf "$PKG/project-data.tar.gz" -C "$REPO"

echo "=== 3/8 Restauration des données moteur (/storage/gamme) ==="
mkdir -p /storage
tar xzf "$PKG/gamme-storage.tar.gz" -C /storage

echo "=== 4/8 Restauration base PostgreSQL ==="
cd "$REPO/nao-gamme"
docker compose up -d postgres
for i in $(seq 1 30); do
  if docker exec nao_gamme_postgres pg_isready -U nao -q; then break; fi
  echo "  attente postgres ($i/30)…"; sleep 2
done
docker cp "$PKG/nao.dump" nao_gamme_postgres:/tmp/nao.dump
docker exec nao_gamme_postgres sh -c 'pg_restore -U nao -d nao -c --if-exists /tmp/nao.dump'
docker exec nao_gamme_postgres rm /tmp/nao.dump
echo "  Postgres restauré ✓"

echo "=== 5/8 Restauration des certificats Caddy ==="
docker volume create nao-gamme_caddy_data >/dev/null || true
docker volume create nao-gamme_caddy_config >/dev/null || true
docker run --rm -v nao-gamme_caddy_data:/d -v "$PKG":/b alpine tar xzf /b/caddy_data.tar.gz -C /d
docker run --rm -v nao-gamme_caddy_config:/c -v "$PKG":/b alpine tar xzf /b/caddy_config.tar.gz -C /c

echo "=== 6/8 Permissions (UID 1000) ==="
chown -R 1000:1000 "$REPO/nao-gamme" /storage/gamme

echo "=== 7/8 Démarrage complet ==="
docker compose up -d --build

echo "=== 8/8 Vérifications ==="
sleep 10
curl -sf -o /dev/null https://lololo.hypeer.cloud/healthz && echo "  healthz OK" || echo "  healthz ECHEC (DNS pas encore basculé ?)"
curl -sf -o /dev/null https://lololo.hypeer.cloud/story/dashboard/mix2 && echo "  dashboard OK" || echo "  dashboard ECHEC"

echo
echo "[restore] Terminé. Pensez à :"
echo "  1. Pointer le DNS lololo.hypeer.cloud vers cette machine"
echo "  2. ./scripts/verify-migration.sh"
echo "  3. Le .env a été restauré depuis le paquet ; vérifiez-le : $REPO/nao-gamme/.env"