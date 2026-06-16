"""PTT inject target HWND must not be overwritten after Electron capture."""

from __future__ import annotations

import asyncio
import sys
from unittest.mock import AsyncMock

import pytest

from voice_pill.engine import inject as inject_mod

pytestmark = pytest.mark.skipif(sys.platform != "win32", reason="Windows inject APIs only")
from voice_pill.engine.audio_session import AudioSession
from voice_pill.engine.inject import capture_inject_target


def test_capture_inject_target_stores_explicit_hwnd():
    capture_inject_target(0x12345)
    assert inject_mod._inject_target_hwnd == 0x12345
    capture_inject_target(0xABCD0, 0xEF01)
    assert inject_mod._inject_target_hwnd == 0xABCD0
    assert inject_mod._inject_focus_hwnd == 0xEF01


def test_set_ptt_preserves_prior_inject_target():
    capture_inject_target(0xDEADBEEF)

    async def run() -> None:
        session = AudioSession(
            on_level=AsyncMock(),
            on_state=AsyncMock(),
            on_utterance=AsyncMock(),
        )
        session.set_ptt(True)
        assert inject_mod._inject_target_hwnd == 0xDEADBEEF

    asyncio.run(run())
