"""Spotti-hosted cloud STT proxy client (no OpenAI SDK in public builds)."""

from __future__ import annotations

import io
import logging
import wave

import httpx

from voice_pill.engine.cloud_auth import api_base, cloud_stt_ready, ensure_access_token
from voice_pill.engine.stt_language import normalize_requested_language
from voice_pill.engine.vad import TARGET_RATE

logger = logging.getLogger(__name__)


def _pcm_to_wav_bytes(pcm: bytes) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(TARGET_RATE)
        wf.writeframes(pcm)
    return buf.getvalue()


async def transcribe_pcm(pcm: bytes, *, language: str = "") -> str:
    if not pcm or len(pcm) < 8000:
        return ""

    if not cloud_stt_ready():
        raise RuntimeError("cloud_auth_required")

    requested = normalize_requested_language(language)
    wav_bytes = _pcm_to_wav_bytes(pcm)
    token = await ensure_access_token()

    files = {"file": ("utterance.wav", wav_bytes, "audio/wav")}
    data = {}
    if requested and requested != "auto":
        data["language"] = requested

    async def _post_stt(bearer: str) -> httpx.Response:
        async with httpx.AsyncClient(timeout=60.0) as client:
            return await client.post(
                f"{api_base()}/api/voice-app/stt",
                headers={"Authorization": f"Bearer {bearer}"},
                files=files,
                data=data or None,
            )

    try:
        resp = await _post_stt(token)
        if resp.status_code == 401:
            token = await ensure_access_token(force=True)
            resp = await _post_stt(token)
        if resp.status_code == 401:
            from voice_pill.engine.cloud_auth import sign_out

            sign_out()
            raise RuntimeError("cloud_auth_expired")
        if resp.status_code == 429:
            raise RuntimeError("cloud_rate_limited")
        if resp.status_code >= 400:
            logger.warning("Cloud STT HTTP %s", resp.status_code)
            raise RuntimeError("cloud_stt_failed")
        payload = resp.json()
    except httpx.RequestError as exc:
        raise RuntimeError("cloud_api_unreachable") from exc
    text = str(payload.get("text") or "").strip()
    if text:
        logger.debug("Cloud STT (%s): %s", requested, text[:80])
    return text
