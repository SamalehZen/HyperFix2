#!/bin/sh
# Patch idempotent du backend nao : ajoute l'audience du moteur gamme-engine
# aux audiences acceptées par le serveur OAuth (validAudiences), afin que nao
# puisse émettre des JWT par utilisateur pour gamme-engine (RFC 9728).
# À rejouer à chaque redémarrage (le conteneur est éphémère).

set -e
TARGET=/app/apps/backend/src/auth.ts
MARKER="GAMME_ENGINE_MCP_URL"

if grep -q "$MARKER" "$TARGET"; then
    echo "[patch] validAudiences déjà patché."
else
    if grep -q "validAudiences: \[env.BETTER_AUTH_URL, MCP_SERVER_URL\]" "$TARGET"; then
        sed -i 's|validAudiences: \[env.BETTER_AUTH_URL, MCP_SERVER_URL\]|validAudiences: [env.BETTER_AUTH_URL, MCP_SERVER_URL, process.env.GAMME_ENGINE_MCP_URL ?? "http://gamme_engine:8010/"]|' "$TARGET"
        echo "[patch] validAudiences patché (audience gamme-engine autorisée)."
    else
        echo "[patch] ⚠ motif introuvable dans auth.ts — mise à jour de l'image nao ? Patch à adapter."
        exit 1
    fi
fi

# Patch display_chart: rend x_axis_type optionnel avec défaut 'category' (évite Failed: Display Chart quand LLM oublie)
CHART_TARGET=/app/apps/shared/src/tools/display-chart.ts
if grep -q "x_axis_type: XAxisTypeEnum.nullable().optional().default('category')" "$CHART_TARGET"; then
    echo "[patch] display_chart déjà patché."
else
    if grep -q "x_axis_type: XAxisTypeEnum.nullable().describe" "$CHART_TARGET"; then
        sed -i "s/x_axis_type: XAxisTypeEnum.nullable().describe(/x_axis_type: XAxisTypeEnum.nullable().optional().default('category').describe(/g" "$CHART_TARGET"
        echo "[patch] display_chart patché (x_axis_type défaut category)."
    else
        echo "[patch] ⚠ motif x_axis_type introuvable — patch display_chart ignoré."
    fi
fi

# Patch truncation: muse-spark via Zen Console (Responses API) n'accepte que
# truncation 'disabled' (pas 'auto' envoyé par défaut par nao) → sinon
# "invalid_request_error: truncation value auto is not supported".
TRUNC_TARGET=/app/apps/backend/src/agents/providers.ts
if grep -q "truncation: 'disabled'" "$TRUNC_TARGET"; then
    echo "[patch] truncation déjà patché."
else
    if grep -q "truncation: 'auto'" "$TRUNC_TARGET"; then
        sed -i "s/truncation: 'auto'/truncation: 'disabled'/g" "$TRUNC_TARGET"
        echo "[patch] truncation patché (auto → disabled pour Muse)."
    else
        echo "[patch] ⚠ motif truncation introuvable — patch ignoré."
    fi
fi

# Patch white-label: branding (logo/nom du chat) actif sans licence Entreprise.
# Sans ça, getActiveBranding() renvoie null en mode OSS et le logo HyperFix
# en base est ignoré (sidebar + onglet gardent le logo Nao).
BRAND_TARGET=/app/apps/backend/src/services/branding.service.ts
if grep -q "Patch HyperFix : white-label actif sans licence" "$BRAND_TARGET"; then
    echo "[patch] white-label déjà patché."
else
    if grep -q "return hasFeature(WHITE_LABEL_FEATURE);" "$BRAND_TARGET"; then
        sed -i "s/return hasFeature(WHITE_LABEL_FEATURE);/return true; \/\/ Patch HyperFix : white-label actif sans licence/" "$BRAND_TARGET"
        echo "[patch] white-label patché (logo HyperFix actif sans licence)."
    else
        echo "[patch] ⚠ motif whiteLabel introuvable — patch ignoré."
    fi
fi

# Patch reasoning_effort: les sous-agents (titre/mémoire) envoient 'none' mais
# glm-5.3-flash (B.AI) n'accepte que low|medium|high|xhigh|max → erreurs de retry
# qui retardent chaque réponse de 5-10s. On remplace 'none' par 'low'.
REASONING_TARGET=/app/apps/backend/src/agents/providers.ts
if grep -q "options.reasoningEffort = 'low';" "$REASONING_TARGET"; then
    echo "[patch] reasoning_effort déjà patché."
else
    if grep -q "options.reasoningEffort = 'none';" "$REASONING_TARGET"; then
        sed -i "s/options.reasoningEffort = 'none';/options.reasoningEffort = 'low';/" "$REASONING_TARGET"
        echo "[patch] reasoning_effort patché (none → low pour openaiCompatible)."
    else
        echo "[patch] ⚠ motif reasoningEffort introuvable — patch ignoré."
    fi
fi

# Patch PWA chat : manifest + icones HyperFix pour le bouton Chrome
# "Ajouter sur l'écran d'accueil" (sinon l'ancien logo Nao est proposé).
PWA_DIST=/app/apps/frontend/dist
PWA_INDEX="$PWA_DIST/index.html"
if grep -q 'rel="manifest" href="/manifest.webmanifest"' "$PWA_INDEX" 2>/dev/null; then
    echo "[patch] pwa-chat déjà patché."
else
    if [ -f "$PWA_INDEX" ] && grep -q '<link rel="icon" href="/favicon.ico" />' "$PWA_INDEX"; then
        cp /app/patches/assets/hyper-chat-logo.png "$PWA_DIST/hyper-chat-logo.png"
        cp /app/patches/assets/hyper-chat-icon.png "$PWA_DIST/hyper-chat-icon.png"
        cp /app/patches/assets/manifest.webmanifest "$PWA_DIST/manifest.webmanifest"
        sed -i 's|<link rel="icon" href="/favicon.ico" />|<link rel="icon" href="/favicon.ico" />\n\t\t<link rel="manifest" href="/manifest.webmanifest" />|' "$PWA_INDEX"
        sed -i 's|<link rel="apple-touch-icon" href="/appicon.png" />|<link rel="apple-touch-icon" href="/hyper-chat-icon.png" />|' "$PWA_INDEX"
        echo "[patch] pwa-chat patché (manifest + icones HyperFix)."
    else
        echo "[patch] ⚠ motif pwa-chat introuvable — patch ignoré."
    fi
fi