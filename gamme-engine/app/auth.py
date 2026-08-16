"""Authentification des appels MCP/API : vérification des JWT émis par le
serveur d'autorisation nao (better-auth) via sa JWKS, résolution de l'identité
via /oauth2/userinfo, et contrôle d'accès par rayon (rayons.json)."""

import logging
import os
import threading
import time
from contextvars import ContextVar

import jwt
import requests
from jwt import PyJWKClient

from . import config

log = logging.getLogger("gamme-auth")

_UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
}

ISSUER = os.getenv("NAO_AUTH_ISSUER", "https://lololo.hypeer.cloud").rstrip("/")
GAMME_MCP_URL = os.getenv("GAMME_MCP_URL", "http://gamme_engine:8010/")
AUDIENCES = {
    ISSUER,
    f"{ISSUER}/mcp",
    GAMME_MCP_URL,
    GAMME_MCP_URL.rstrip("/"),
    f"{GAMME_MCP_URL.rstrip('/')}/mcp",
}

_jwks_client: PyJWKClient | None = None
_jwks_lock = threading.Lock()
_discovery: dict | None = None
_discovery_at = 0.0
_DISCOVERY_TTL = 300.0

_userinfo_cache: dict[str, tuple[float, dict]] = {}
_USERINFO_TTL = 60.0


def _discover() -> dict:
    """Métadonnées du serveur d'autorisation nao (issuer, jwks_uri, userinfo_endpoint)."""
    global _discovery, _discovery_at, _jwks_client
    now = time.time()
    if _discovery is not None and _discovery_at + _DISCOVERY_TTL > now:
        return _discovery
    try:
        resp = requests.get(f"{ISSUER}/.well-known/oauth-authorization-server", headers=_UA, timeout=10)
        resp.raise_for_status()
        meta = resp.json()
        if meta.get("issuer") and meta.get("jwks_uri"):
            _discovery = meta
            _discovery_at = now
            _jwks_client = None
            return meta
    except Exception as exc:  # noqa: BLE001
        log.warning("découverte OAuth échouée : %s", exc)
    if _discovery is not None:
        return _discovery
    return {"issuer": f"{ISSUER}/api/auth", "jwks_uri": f"{ISSUER}/api/auth/jwks"}


def _jwks() -> PyJWKClient:
    global _jwks_client
    meta = _discover()
    if _jwks_client is None:
        with _jwks_lock:
            if _jwks_client is None:
                _jwks_client = PyJWKClient(meta["jwks_uri"], cache_keys=True, headers=_UA)
    return _jwks_client


def verify_token(token: str) -> dict | None:
    """Valide le JWT (signature, émetteur, audience) et renvoie ses claims."""
    if not token:
        return None
    try:
        key = _jwks().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            key.key,
            algorithms=["EdDSA", "RS256"],
            issuer=_discover()["issuer"],
            audience=list(AUDIENCES),
            options={"require": ["exp", "iss", "aud", "sub"]},
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("JWT invalide : %s", exc)
        return None


def fetch_userinfo(token: str) -> dict | None:
    """Interroge l'endpoint userinfo de nao pour obtenir email/name/sub."""
    try:
        resp = requests.get(
            _discover()["userinfo_endpoint"],
            headers={"Authorization": f"Bearer {token}", **_UA},
            timeout=10,
        )
        if resp.status_code == 200:
            return resp.json()
        log.warning("userinfo HTTP %s", resp.status_code)
    except Exception as exc:  # noqa: BLE001
        log.warning("userinfo échec : %s", exc)
    return None


def resolve_user(token: str, claims: dict) -> dict | None:
    """Construit le profil utilisateur (email, sub, rayons autorisés)."""
    sub = claims.get("sub")
    if not sub:
        return None
    now = time.time()
    cached = _userinfo_cache.get(sub)
    if cached and cached[0] > now:
        info = cached[1]
    else:
        info = fetch_userinfo(token)
        if info is None:
            return None
        _userinfo_cache[sub] = (now + _USERINFO_TTL, info)
    email = (info.get("email") or "").strip().lower()
    return {
        "sub": sub,
        "email": email,
        "name": info.get("name") or "",
        "rayons": allowed_rayons_for(email),
    }


def allowed_rayons_for(email: str) -> list[str]:
    if not email:
        return []
    out = []
    for rid, meta in config.rayons().items():
        g = meta.get("gestionnaire") or ""
        emails = g if isinstance(g, list) else [g]
        if email in {str(e).strip().lower() for e in emails if str(e).strip()}:
            out.append(rid)
    return sorted(out)


class NaoTokenVerifier:
    """Vérifie les JWT émis par le serveur d'autorisation nao et résout le
    gestionnaire (email + rayons autorisés). Utilisé par FastMCP (token_verifier)."""

    async def verify_token(self, token: str):
        from mcp.server.auth.provider import AccessToken

        claims = verify_token(token)
        if not claims:
            return None
        user = resolve_user(token, claims)
        if not user:
            return None
        return AccessToken(
            token=token,
            client_id=user["email"] or user["sub"],
            scopes=["openid", "email", "profile"],
            subject=user["sub"],
            claims={
                "email": user["email"],
                "name": user["name"],
                "rayons": user["rayons"],
            },
        )