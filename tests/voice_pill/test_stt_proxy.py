"""Mocked cloud STT proxy client."""

from __future__ import annotations

import io
import wave
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from voice_pill.engine.stt_cloud import transcribe_pcm
from voice_pill.engine.vad import TARGET_RATE


def _tiny_pcm() -> bytes:
    return b"\x00\x01" * 5000


@pytest.mark.asyncio
async def test_transcribe_pcm_proxy_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"text": "привет"}

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with (
        patch("voice_pill.engine.stt_cloud.cloud_stt_ready", return_value=True),
        patch("voice_pill.engine.stt_cloud.ensure_access_token", new=AsyncMock(return_value="tok")),
        patch("voice_pill.engine.stt_cloud.httpx.AsyncClient", return_value=mock_client),
    ):
        text = await transcribe_pcm(_tiny_pcm(), language="ru")

    assert text == "привет"
    mock_client.post.assert_awaited_once()
    call_kwargs = mock_client.post.await_args.kwargs
    assert call_kwargs["headers"]["Authorization"] == "Bearer tok"


@pytest.mark.asyncio
async def test_transcribe_pcm_requires_auth():
    with patch("voice_pill.engine.stt_cloud.cloud_stt_ready", return_value=False):
        with pytest.raises(RuntimeError, match="cloud_auth"):
            await transcribe_pcm(_tiny_pcm())
