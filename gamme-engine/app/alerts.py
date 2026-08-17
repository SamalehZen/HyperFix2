import json
import os
import urllib.request

from . import config


def load_chat_ids():
    """Liste des chat_ids Telegram à alerter (fichier /storage/gamme/alert_chats.json)."""
    if os.path.exists(config.ALERT_CHATS_FILE):
        try:
            data = json.load(open(config.ALERT_CHATS_FILE, encoding="utf-8"))
            if isinstance(data, list):
                return [str(x) for x in data]
        except Exception:
            pass
    return []


def send_telegram(text):
    token = config.TELEGRAM_BOT_TOKEN
    chat_ids = load_chat_ids()
    if not token or not chat_ids:
        print(f"[alertes] (token/chat_ids absents, ignoré) {text}")
        return
    for cid in chat_ids:
        try:
            payload = json.dumps({"chat_id": cid, "text": text}).encode("utf-8")
            req = urllib.request.Request(
                f"https://api.telegram.org/bot{token}/sendMessage",
                data=payload,
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                resp.read()
            print(f"[alertes] ✓ message envoyé à {cid}")
        except Exception as e:
            print(f"[alertes] ✗ envoi vers {cid} impossible: {e}")
