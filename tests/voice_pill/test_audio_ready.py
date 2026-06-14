"""Deferred audio init — first PTT must wait, not drop."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from voice_pill.engine import server as server_mod


def test_wait_for_audio_returns_true_when_session_ready():
    server_mod._audio = object()
    server_mod._audio_init_task = None

    async def run() -> None:
        ok = await server_mod._wait_for_audio(timeout=0.1)
        assert ok is True

    asyncio.run(run())


def test_wait_for_audio_waits_for_init_task():
    server_mod._audio = None
    done = asyncio.Event()

    async def fake_startup() -> None:
        await done.wait()
        server_mod._audio = object()

    loop = asyncio.new_event_loop()
    try:
        server_mod._audio_init_task = loop.create_task(fake_startup())

        async def run() -> None:
            waiter = asyncio.create_task(server_mod._wait_for_audio(timeout=1.0))
            await asyncio.sleep(0.05)
            assert not waiter.done()
            done.set()
            assert await waiter is True

        loop.run_until_complete(run())
    finally:
        server_mod._audio_init_task = None
        server_mod._audio = None
        loop.close()


def test_ptt_waits_for_audio_before_set_ptt():
    server_mod._audio = None
    mock_audio = MagicMock()

    async def fake_wait(**_kwargs) -> bool:
        server_mod._audio = mock_audio
        return True

    with (
        patch.object(server_mod, "_wait_for_audio", side_effect=fake_wait),
        patch.object(server_mod, "capture_inject_target") as capture,
    ):

        async def run() -> None:
            result = await server_mod.ptt(server_mod.PttBody(pressed=True, targetHwnd=0x100))

        asyncio.run(run())

    capture.assert_called_once()
    mock_audio.set_ptt.assert_called_once_with(True)
