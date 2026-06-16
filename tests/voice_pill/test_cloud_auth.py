"""OAuth callback URL parsing and token refresh."""

from __future__ import annotations

import time
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from voice_pill.engine import cloud_auth
from voice_pill.engine.cloud_auth import _parse_callback, ensure_access_token, warm_cloud_session


def test_parse_spotti_voice_callback():
    code, state = _parse_callback("spotti-voice://auth/callback?code=abc&state=xyz")
    assert code == "abc"
    assert state == "xyz"


def test_parse_localhost_callback():
    code, state = _parse_callback(
        "http://127.0.0.1:9780/auth/callback?code=abc&state=xyz"
    )
    assert code == "abc"
    assert state == "xyz"


def test_oauth_redirect_uri_prefers_localhost_in_electron(monkeypatch):
    monkeypatch.setenv("SPOTTI_VOICE_ELECTRON", "1")
    monkeypatch.delenv("SPOTTI_VOICE_OAUTH_REDIRECT", raising=False)
    assert cloud_auth.oauth_redirect_uri() == "http://127.0.0.1:9780/auth/callback"


def test_parse_callback_missing_code():
    with pytest.raises(ValueError):
        _parse_callback("spotti-voice://auth/callback?state=only")


@pytest.mark.asyncio
async def test_ensure_access_token_uses_fresh_cached_token():
    creds = {
        "access_token": "cached",
        "refresh_token": "refresh",
        "expires_at": time.time() + 3600,
    }
    with (
        patch("voice_pill.engine.cloud_auth.load_credentials", return_value=creds),
        patch("voice_pill.engine.cloud_auth._refresh_tokens", new=AsyncMock()) as refresh,
    ):
        token = await ensure_access_token()
    assert token == "cached"
    refresh.assert_not_awaited()


@pytest.mark.asyncio
async def test_ensure_access_token_force_refresh_when_stale():
    creds = {
        "access_token": "stale",
        "refresh_token": "refresh",
        "expires_at": time.time() + 3600,
    }
    refresh = AsyncMock(return_value={"access_token": "new", "refresh_token": "refresh"})
    with (
        patch("voice_pill.engine.cloud_auth.load_credentials", return_value=creds),
        patch("voice_pill.engine.cloud_auth._refresh_tokens", refresh),
    ):
        token = await ensure_access_token(force=True)
    assert token == "new"
    refresh.assert_awaited_once()


@pytest.mark.asyncio
async def test_refresh_retries_transient_5xx():
    creds = {"refresh_token": "rtok"}
    ok = MagicMock()
    ok.status_code = 200
    ok.json.return_value = {
        "access_token": "atok",
        "refresh_token": "rtok2",
        "expires_in": 900,
        "user": {},
    }
    fail = MagicMock()
    fail.status_code = 503
    fail.raise_for_status.side_effect = httpx.HTTPStatusError(
        "503", request=MagicMock(), response=fail
    )

    client = AsyncMock()
    client.post = AsyncMock(side_effect=[fail, ok])
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)

    with (
        patch("voice_pill.engine.cloud_auth.load_credentials", return_value=creds),
        patch("voice_pill.engine.cloud_auth.httpx.AsyncClient", return_value=client),
        patch("voice_pill.engine.cloud_auth.save_credentials") as save,
        patch("voice_pill.engine.cloud_auth.asyncio.sleep", new=AsyncMock()),
    ):
        out = await cloud_auth._refresh_tokens(creds)
    assert out["access_token"] == "atok"
    assert client.post.await_count == 2
    save.assert_called_once()


@pytest.mark.asyncio
async def test_warm_cloud_session_skips_when_access_fresh():
    creds = {
        "access_token": "cached",
        "refresh_token": "refresh",
        "expires_at": time.time() + 3600,
    }
    with (
        patch("voice_pill.engine.cloud_auth.load_credentials", return_value=creds),
        patch("voice_pill.engine.cloud_auth.ensure_access_token", new=AsyncMock()) as ensure,
    ):
        ok = await warm_cloud_session()
    assert ok is True
    ensure.assert_not_awaited()

