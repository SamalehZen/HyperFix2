#!/usr/bin/env bash
# ============================================================
# verify-migration.sh — Validation complète post-bascule DNS
# Usage : ./verify-migration.sh
# ============================================================
set -uo pipefail

URL="${1:-https://lololo.hypeer.cloud}"
FAIL=0

check() {
  local label="$1"; local expected="$2"; local got="$3"
  if [ "$got" = "$expected" ]; then
    echo "  PASS  $label"
  else
    echo "  FAIL  $label (attendu: $expected, obtenu: $got)"
    FAIL=1
  fi
}

echo "=== DNS ==="
IP=$(dig +short "$URL" | head -1 | sed 's|^https\?://||')
echo "  $URL -> ${IP:-INCONNUE}"
[ -n "$IP" ] || FAIL=1

echo "=== TLS / certificat ==="
curl -sf -o /dev/null "$URL" && echo "  PASS  HTTPS/TLS" || { echo "  FAIL  HTTPS/TLS"; FAIL=1; }

echo "=== Endpoints applicatifs ==="
check "healthz" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$URL/healthz")"
check "dashboard mix2" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$URL/story/dashboard/mix2")"
check "story-data" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$URL/story-data/2026-08-19?rayon=frais-surgele")"
check "mcp (attendu 401 sans JWT)" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$URL/mcp")"
check "rapports" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$URL/rapports/")"
check "root nao" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$URL/")"

echo "=== Conteneurs ==="
docker ps --format '  {{.Names}} | {{.Status}}' | grep -E 'gamme_engine|dashboard_preview|nao_gamme_caddy|nao_gamme$|nao_gamme_postgres' \
  || { echo "  FAIL  conteneurs absents"; FAIL=1; }

echo "=== Données ==="
DUCK=$(docker exec gamme_engine sh -c 'ls -la /app/nao-project/gamme.duckdb 2>/dev/null' || true)
[ -n "$DUCK" ] && echo "  PASS  gamme.duckdb présent" || { echo "  FAIL  gamme.duckdb absent"; FAIL=1; }

if [ "$FAIL" = "0" ]; then
  echo; echo "Migration VALIDÉE ✓"
else
  echo; echo "Des vérifications ont échoué — revoir les points ci-dessus."; exit 1
fi