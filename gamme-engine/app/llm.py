import json

import requests

from . import config

# deepseek-v4-flash est un modèle raisonneur : sans ce paramètre, le budget
# max_tokens est consommé par le raisonnement interne et la réponse finale
# arrive vide (finish_reason=length, content=""). On désactive donc le
# raisonnement pour les appels machine (compensateurs) : ~1 100 tokens au lieu
# de ~21 000, réponse complète garantie (testé 16/08/2026).
# Le chat nao n'utilise PAS ce module (config nao_config.yaml séparée).
_THINKING_DISABLED = {"thinking": {"type": "disabled"}}

# B.AI / GLM-5.3-Flash : le paramètre thinking est rejeté (HTTP 400, le modèle
# raisonne toujours ; seuls low/high/max sont acceptés). On ne l'envoie que
# pour les modèles deepseek qui le supportent.
_DISABLES_THINKING = config.MODEL.startswith("deepseek")


def _attempts_for_model(model, max_tokens):
    if model.startswith("deepseek"):
        return [
            {**_THINKING_DISABLED, "max_tokens": max_tokens},
            {**_THINKING_DISABLED, "max_tokens": max_tokens * 2},
            {"max_tokens": max_tokens * 2},
        ]
    return [
        {"max_tokens": max_tokens},
        {"max_tokens": max_tokens * 2},
    ]


def _attempts(max_tokens):
    if _DISABLES_THINKING:
        return [
            {**_THINKING_DISABLED, "max_tokens": max_tokens},
            {**_THINKING_DISABLED, "max_tokens": max_tokens * 2},
            {"max_tokens": max_tokens * 2},
        ]
    return [
        {"max_tokens": max_tokens},
        {"max_tokens": max_tokens * 2},
    ]


def chat_completion(messages, temperature=0.1, max_tokens=8192, model=None,
                    base_url=None, api_key=None):
    """Appel chat/completions avec raisonnement désactivé + garde-fous :
    - réponse vide/coupée (finish_reason=length) → 1 retry à budget doublé ;
    - API qui rejette le paramètre thinking (HTTP 400, modèle futur) → retry sans.
    Lève Exception si toutes les tentatives échouent.
    Paramètres optionnels (model/base_url/api_key) : permettent d'appeler un
    provider/modèle différent du défaut (ex. LIBELLER_* pour gamme_libeller)."""
    url = f"{(base_url or config.BASE_URL).rstrip('/')}/chat/completions"
    model = model or config.MODEL
    headers = {
        "Authorization": f"Bearer {api_key or config.API_KEY}",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64 x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
    }
    attempts = _attempts_for_model(model, max_tokens)
    last_error = None
    for opts in attempts:
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            **opts,
        }
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=300)
        except requests.RequestException as e:
            last_error = f"réseau: {e}"
            continue
        if resp.status_code == 400 and "thinking" in opts:
            last_error = f"HTTP 400 (paramètre thinking rejeté): {resp.text[:200]}"
            continue
        resp.raise_for_status()
        data = resp.json()
        choice = (data.get("choices") or [{}])[0]
        content = (choice.get("message") or {}).get("content") or ""
        if content.strip():
            return content
        last_error = (
            f"réponse vide (finish_reason={choice.get('finish_reason')}, "
            f"tokens={data.get('usage', {}).get('completion_tokens')})"
        )
    raise RuntimeError(f"LLM: aucune réponse exploitable — {last_error}")


def parse_json(text):
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            return None
    return None
