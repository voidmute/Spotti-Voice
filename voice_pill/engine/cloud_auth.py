"""Spotti-hosted cloud STT + Discord OAuth session (no OpenAI key in client)."""

from __future__ import annotations

import asyncio
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

DEFAULT_API_BASE = "https://spottibot.duckdns.org"
_EXPIRY_SKEW_SEC = 60
_REFRESH_LOCK = asyncio.Lock()
_REFRESH_TRANSIENT_RETRIES = 2
_REFRESH_TRANSIENT_BACKOFF_SEC = 0.75
_BEGIN_TRANSIENT_RETRIES = 2
_BEGIN_TRANSIENT_BACKOFF_SEC = 0.85


def _http_client(**kwargs: Any) -> httpx.AsyncClient:
    """TLS verify via certifi (PyInstaller bundles certifi in spec)."""
    try:
        import certifi

        verify = certifi.where()
    except ImportError:
        verify = True
    timeout = kwargs.pop("timeout", httpx.Timeout(45.0, connect=20.0))
    return httpx.AsyncClient(timeout=timeout, verify=verify, **kwargs)

_PENDING_VERIFIER: Optional[str] = None
_PENDING_STATE: Optional[str] = None
_DEFAULT_REDIRECT_URI = "spotti-voice://auth/callback"
_LOCALHOST_REDIRECT_URI = "http://127.0.0.1:9780/auth/callback"


def oauth_redirect_uri() -> str:
    """Desktop Electron uses loopback callback; custom scheme remains fallback."""
    override = os.environ.get("SPOTTI_VOICE_OAUTH_REDIRECT", "").strip()
    if override:
        return override
    if os.environ.get("SPOTTI_VOICE_ELECTRON") == "1":
        return _LOCALHOST_REDIRECT_URI
    return _DEFAULT_REDIRECT_URI


def api_base() -> str:
    return os.environ.get("SPOTTI_VOICE_API_BASE", DEFAULT_API_BASE).rstrip("/")


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


def _access_fresh(creds: dict[str, Any]) -> bool:
    access = str(creds.get("access_token") or "").strip()
    expires_at = float(creds.get("expires_at") or 0)
    return bool(access and expires_at and time.time() < expires_at - _EXPIRY_SKEW_SEC)


def cloud_session() -> Optional[dict[str, Any]]:
    return load_credentials()


def cloud_stt_ready() -> bool:
    creds = load_credentials()
    if not creds or not creds.get("access_token"):
        return False
    if _access_fresh(creds):
        return True
    return bool(creds.get("refresh_token"))


async def _refresh_tokens(creds: dict[str, Any]) -> dict[str, Any]:
    refresh = str(creds.get("refresh_token") or "").strip()
    if not refresh:
        raise RuntimeError("cloud_auth_expired")

    last_error: Exception | None = None
    for attempt in range(_REFRESH_TRANSIENT_RETRIES + 1):
        try:
            async with _http_client() as client:
                resp = await client.post(
                    f"{api_base()}/api/voice-app/auth/refresh",
                    json={"refresh_token": refresh},
                )
                resp.raise_for_status()
                data = resp.json()
            return _store_token_response(data, prior=creds)
        except httpx.HTTPStatusError as exc:
            last_error = exc
            status = exc.response.status_code
            if status in (401, 403):
                logger.info("Cloud refresh rejected (%s)", status)
                raise RuntimeError("cloud_auth_expired") from exc
            if status >= 500 and attempt < _REFRESH_TRANSIENT_RETRIES:
                await asyncio.sleep(_REFRESH_TRANSIENT_BACKOFF_SEC * (attempt + 1))
                continue
            raise RuntimeError("cloud_api_failed") from exc
        except httpx.RequestError as exc:
            last_error = exc
            if attempt < _REFRESH_TRANSIENT_RETRIES:
                await asyncio.sleep(_REFRESH_TRANSIENT_BACKOFF_SEC * (attempt + 1))
                continue
            raise RuntimeError("cloud_api_unreachable") from exc

    if last_error:
        raise RuntimeError("cloud_api_failed") from last_error
    raise RuntimeError("cloud_api_failed")


def _store_token_response(
    data: dict[str, Any],
    *,
    prior: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    prior = prior or load_credentials() or {}
    expires_in = int(data.get("expires_in") or 900)
    access = str(data.get("access_token") or "").strip()
    refresh = str(data.get("refresh_token") or prior.get("refresh_token") or "").strip()
    if not access:
        raise RuntimeError("auth_failed")
    payload = {
        "access_token": access,
        "refresh_token": refresh,
        "expires_at": time.time() + expires_in,
        "user": data.get("user") or prior.get("user") or {},
    }
    save_credentials(payload)
    return payload


async def ensure_access_token(*, force: bool = False) -> str:
    async with _REFRESH_LOCK:
        creds = load_credentials() or {}
        if not force and _access_fresh(creds):
            return str(creds.get("access_token") or "").strip()
        refreshed = await _refresh_tokens(creds)
        token = str(refreshed.get("access_token") or "").strip()
        if not token:
            raise RuntimeError("auth_failed")
        return token


async def warm_cloud_session() -> bool:
    """Refresh stored cloud tokens when access is missing or near expiry."""
    creds = load_credentials()
    if not creds or not creds.get("refresh_token"):
        return False
    if _access_fresh(creds):
        return True
    try:
        await ensure_access_token(force=True)
        return True
    except RuntimeError as exc:
        code = str(exc)
        if code == "cloud_auth_expired":
            logger.info("Cloud session warm-up: refresh token invalid or expired")
        else:
            logger.warning("Cloud session warm-up failed: %s", code)
        return False


async def begin_oauth() -> dict[str, str]:
    global _PENDING_VERIFIER, _PENDING_STATE
    verifier = _pkce_verifier()
    _PENDING_VERIFIER = verifier
    redirect = oauth_redirect_uri()
    params = {
        "code_verifier": verifier,
        "redirect_uri": redirect,
    }
    last_error: Exception | None = None
    for attempt in range(_BEGIN_TRANSIENT_RETRIES + 1):
        try:
            async with _http_client() as client:
                resp = await client.get(f"{api_base()}/api/voice-app/auth/start", params=params)
                resp.raise_for_status()
                data = resp.json()
            break
        except httpx.HTTPStatusError as exc:
            logger.warning("voice-app auth/start HTTP %s", exc.response.status_code)
            raise RuntimeError("api_error") from exc
        except httpx.RequestError as exc:
            last_error = exc
            if attempt < _BEGIN_TRANSIENT_RETRIES:
                await asyncio.sleep(_BEGIN_TRANSIENT_BACKOFF_SEC * (attempt + 1))
                continue
            logger.warning("voice-app auth/start unreachable: %s", type(exc).__name__)
            raise RuntimeError("api_unreachable") from exc
    else:
        if last_error:
            raise RuntimeError("api_unreachable") from last_error
        raise RuntimeError("api_unreachable")
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
    async with _http_client() as client:
        resp = await client.post(
            f"{api_base()}/api/voice-app/auth/token",
            json={
                "code": code,
                "state": state,
                "code_verifier": verifier,
                "redirect_uri": oauth_redirect_uri(),
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
