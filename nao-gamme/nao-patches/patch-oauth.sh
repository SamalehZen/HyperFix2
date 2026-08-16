#!/bin/sh
# Patch idempotent du backend nao : ajoute l'audience du moteur gamme-engine
# aux audiences acceptées par le serveur OAuth (validAudiences), afin que nao
# puisse émettre des JWT par utilisateur pour gamme-engine (RFC 9728).
# À rejouer à chaque redémarrage (le conteneur est éphémère).

set -e
TARGET=/app/apps/backend/src/auth.ts
MARKER="GAMME_ENGINE_MCP_URL"

if grep -q "$MARKER" "$TARGET"; then
    echo "[patch] validAudiences déjà patché, rien à faire."
    exit 0
fi

if grep -q "validAudiences: \[env.BETTER_AUTH_URL, MCP_SERVER_URL\]" "$TARGET"; then
    sed -i 's|validAudiences: \[env.BETTER_AUTH_URL, MCP_SERVER_URL\]|validAudiences: [env.BETTER_AUTH_URL, MCP_SERVER_URL, process.env.GAMME_ENGINE_MCP_URL ?? "http://gamme_engine:8010/"]|' "$TARGET"
    echo "[patch] validAudiences patché (audience gamme-engine autorisée)."
else
    echo "[patch] ⚠ motif introuvable dans auth.ts — mise à jour de l'image nao ? Patch à adapter."
    exit 1
fi