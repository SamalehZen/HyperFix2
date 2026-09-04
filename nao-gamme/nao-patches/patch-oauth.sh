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