"""Spotti-hosted cloud STT + Discord OAuth session (no OpenAI key in client)."""

from __future__ import annotations

import base64
import hashlib
import logging
import os
import secrets
import time
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse

import httpx

from voice_pill.engine.credentials import clear_credentials, load_credentials, save_credentials

logger = logging.getLogger(__name__)

_PENDING_VERIFIER: Optional[str] = None
_PENDING_STATE: Optional[str] = None
_REDIRECT_URI = "spotti-voice://auth/callback"


def api_base() -> str:
    return os.environ.get("SPOTTI_VOICE_API_BASE", "https://spotti.family").rstrip("/")


def _pkce_verifier() -> str:
    return secrets.token_urlsafe(64)[:96]


def _pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _parse_callback(url: str) -> tuple[str, str]:
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("spotti-voice", "http", "https"):
        raise ValueError("invalid_callback_scheme")
    query = parse_qs(parsed.query)
    code = (query.get("code") or [""])[0]
    state = (query.get("state") or [""])[0]
    if not code or not state:
        raise ValueError("missing_code_or_state")
    return code, state


def cloud_session() -> Optional[dict[str, Any]]:
    return load_credentials()


def cloud_stt_ready() -> bool:
    creds = load_credentials()
    if not creds or not creds.get("access_token"):
        return False
    expires_at = float(creds.get("expires_at") or 0)
    if expires_at and time.time() < expires_at - 30:
        return True
    return bool(creds.get("refresh_token"))


async def _refresh_tokens(creds: dict[str, Any]) -> dict[str, Any]:
    refresh = str(creds.get("refresh_token") or "")
    if not refresh:
        raise RuntimeError("refresh_missing")
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{api_base()}/api/voice-app/auth/refresh",
            json={"refresh_token": refresh},
        )
        resp.raise_for_status()
        data = resp.json()
    return _store_token_response(data)


def _store_token_response(data: dict[str, Any]) -> dict[str, Any]:
    expires_in = int(data.get("expires_in") or 900)
    payload = {
        "access_token": data.get("access_token"),
        "refresh_token": data.get("refresh_token"),
        "expires_at": time.time() + expires_in,
        "user": data.get("user") or {},
    }
    save_credentials(payload)
    return payload


async def ensure_access_token() -> str:
    creds = load_credentials() or {}
    access = str(creds.get("access_token") or "")
    expires_at = float(creds.get("expires_at") or 0)
    if access and expires_at and time.time() < expires_at - 30:
        return access
    refreshed = await _refresh_tokens(creds)
    token = str(refreshed.get("access_token") or "")
    if not token:
        raise RuntimeError("auth_failed")
    return token


async def begin_oauth() -> dict[str, str]:
    global _PENDING_VERIFIER, _PENDING_STATE
    verifier = _pkce_verifier()
    _PENDING_VERIFIER = verifier
    params = {
        "code_verifier": verifier,
        "redirect_uri": _REDIRECT_URI,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{api_base()}/api/voice-app/auth/start", params=params)
        resp.raise_for_status()
        data = resp.json()
    _PENDING_STATE = str(data.get("state") or "")
    url = str(data.get("authorize_url") or "")
    if not url or not _PENDING_STATE:
        raise RuntimeError("oauth_start_failed")
    return {"authorize_url": url, "state": _PENDING_STATE}


async def complete_oauth(callback_url: str) -> dict[str, Any]:
    global _PENDING_VERIFIER, _PENDING_STATE
    verifier = _PENDING_VERIFIER
    if not verifier:
        raise RuntimeError("oauth_not_started")
    code, state = _parse_callback(callback_url)
    if _PENDING_STATE and state != _PENDING_STATE:
        raise RuntimeError("oauth_state_mismatch")
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{api_base()}/api/voice-app/auth/token",
            json={
                "code": code,
                "state": state,
                "code_verifier": verifier,
                "redirect_uri": _REDIRECT_URI,
            },
        )
        resp.raise_for_status()
        data = resp.json()
    _PENDING_VERIFIER = None
    _PENDING_STATE = None
    return _store_token_response(data)


def sign_out() -> None:
    global _PENDING_VERIFIER, _PENDING_STATE
    _PENDING_VERIFIER = None
    _PENDING_STATE = None
    clear_credentials()


def cloud_user_label() -> Optional[str]:
    creds = load_credentials()
    if not creds:
        return None
    user = creds.get("user") if isinstance(creds.get("user"), dict) else {}
    name = user.get("global_name") or user.get("username")
    return str(name) if name else None
