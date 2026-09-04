# ⚠️ ARCHIVÉ (2026-09-04) — procédure obsolète, ne plus suivre

> `hy3-free` n'existe plus côté Zen (retiré du catalogue). État actuel :
> conversations sur B.AI (`glm-5.3-flash` par défaut), moteur sur Zen
> (`muse-spark-1.3-contributor-free`, gratuit, via `/responses`).
> Document conservé pour mémoire uniquement.

# Revenir à DeepSeek V4 Flash (provider Go) après réinitialisation du quota

> À exécuter quand le quota hebdomadaire OpenCode **Go** est revenu
> (erreur `GoUsageLimitError` disparue — en général ~4 à 6 h après l'atteinte du quota).

## Étape 0 — Vérifier que le quota Go est revenu

```bash
curl -s -m 30 -X POST "https://opencode.ai/zen/go/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <OPENCODE_API_KEY du .env>" \
  -d '{"model":"deepseek-v4-flash","messages":[{"role":"user","content":"dis OK"}],"max_tokens":10}'
```

- `HTTP 200` → le quota est revenu, on continue.
- `GoUsageLimitError` (403) → attendre encore.

## Étape 1 — nao_config.yaml : remettre Go en 1ʳᵉ position (défaut)

1. Dans `/opt/HyperFix2/nao-gamme/nao_config.yaml`, bloc `llm.providers` :
   - **Couper** le bloc `openaiCompatible/opencode-zen` (actuellement en 1ʳᵉ position)
   - **Remettre en 1ʳᵉ position** le bloc `openaiCompatible/opencode` (Go)
   - **Recoller** le bloc zen en 2ᵉ position (gardé comme secours gratuit)
2. Résultat attendu :
   ```yaml
   llm:
     providers:
     - provider: openaiCompatible/opencode      # ← Go, DÉFAUT des conversations
       api_key: "{{ env('OPENCODE_API_KEY') }}"
       base_url: https://opencode.ai/zen/go/v1
       models:
       - id: deepseek-v4-flash                  # default: true → redevient le modèle par défaut
         default: true
       - id: deepseek-v4-pro
         default: false
       - id: kimi-k3
         default: false
     - provider: openaiCompatible/opencode-zen  # ← Zen, secours (hy3-free gratuit)
       api_key: "{{ env('OPENCODE_ZEN_API_KEY') }}"
       base_url: "{{ env('OPENCODE_ZEN_BASE_URL') }}"
       models:
       - id: hy3-free
         default: true
       - id: deepseek-v4-flash
         default: false
       - id: deepseek-v4-pro
         default: false
   ```
   → `providers[0]` = Go, `enabledModels[0]` = `deepseek-v4-flash` : les nouvelles
   conversations utilisent **deepseek-v4-flash via Go**.

## Étape 2 — docker-compose.yml : gamme-engine revient sur Go

Dans le service `gamme-engine`, remplacer :

```yaml
OPENCODE_BASE_URL: ${OPENCODE_ZEN_BASE_URL}
OPENCODE_API_KEY: ${OPENCODE_ZEN_API_KEY}
```

par :

```yaml
OPENCODE_BASE_URL: ${OPENCODE_BASE_URL}
OPENCODE_API_KEY: ${OPENCODE_API_KEY}
```

Le service `nao` ne change pas (il a déjà les deux jeux de variables).

## Étape 3 — .env : GAMME_LLM_MODEL

Dans `/opt/HyperFix2/nao-gamme/.env` :

```ini
GAMME_LLM_MODEL=deepseek-v4-flash
```

(ne rien toucher aux clés `OPENCODE_*`).

## Étape 4 — Bot Telegram (optionnel)

Par défaut le bot garde zen/hy3-free (stable). Pour le repasser sur Go :

```bash
docker exec nao_gamme_postgres psql -U nao -d nao -c "UPDATE project SET
telegram_settings = jsonb_build_object(
  'telegramBotToken','<TOKEN du .env>',
  'telegramLlmProvider','openaiCompatible/opencode',
  'telegramLlmModelId','deepseek-v4-flash')
WHERE id='021c7575-4b14-4eea-a329-2db8377529b0';"
```

## Étape 5 — Redéploiement

```bash
cd /opt/HyperFix2/nao-gamme
docker compose up -d --force-recreate nao gamme-engine
```

## Étape 6 — Vérifications

```bash
# env gamme-engine → base go
docker exec gamme_engine sh -c 'echo $OPENCODE_BASE_URL; echo $GAMME_LLM_MODEL'
# sortie attendue :
#   https://opencode.ai/zen/go/v1
#   deepseek-v4-flash

# config nao parse bien (2 providers, Go en premier)
docker exec nao_gamme sh -c 'cd /app/apps/backend && bun -e "
import { readProjectConfigLlm } from \"./src/utils/nao-config-llm.ts\";
const llm = readProjectConfigLlm(\"/app/project\", {});
console.log(llm.providers.map((p: any) => p.provider + \" -> \" + p.enabledModels[0]).join(\"\\n\"));"'

# dashboards
curl -s -o /dev/null -w "story: %{http_code}\n" http://127.0.0.1:8010/story/
curl -s -o /dev/null -w "nao: %{http_code}\n" http://127.0.0.1:5005/
```

Puis envoyer un message dans le chat nao (web) et au bot Telegram.

## Étape 7 — Commit (optionnel, selon ta volonté)

```bash
cd /opt/HyperFix2
git add nao-gamme/nao_config.yaml nao-gamme/docker-compose.yml nao-gamme/.env.example
git -c user.name="SamalehZen" -c user.email="SamalehZen@users.noreply.github.com" commit -m "Retour au provider Go (deepseek-v4-flash) par défaut"
git push "https://x-access-token:<TOKEN_PAT>@github.com/SamalehZen/HyperFix2.git" main
```

> ⚠️ Jamais committer `.env` ni les secrets.

## Annuler (revenir au zen en défaut)

Refaire l'étape 1 dans l'autre sens (zen en 1ʳᵉ position), l'étape 2
(`${OPENCODE_ZEN_*}` pour gamme-engine), l'étape 3 (`GAMME_LLM_MODEL=hy3-free`)
et recréer les conteneurs.

## État actuel de référence (16/08/2026)

| Élément | Valeur (zen actif) | Retour Go |
|---|---|---|
| Provider par défaut nao | `openaiCompatible/opencode-zen` | `openaiCompatible/opencode` |
| Modèle par défaut | `hy3-free` | `deepseek-v4-flash` |
| gamme-engine base | `https://opencode.ai/zen/v1` | `https://opencode.ai/zen/go/v1` |
| gamme-engine modèle | `hy3-free` | `deepseek-v4-flash` |
| Telegram | zen / `hy3-free` | go / `deepseek-v4-flash` (optionnel) |