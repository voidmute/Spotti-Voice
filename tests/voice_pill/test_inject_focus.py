"""Focus HWND capture and inject cascade order."""

from __future__ import annotations

from unittest.mock import patch

from voice_pill.engine import inject as inject_mod
from voice_pill.engine.inject import capture_inject_target, inject_text


def test_capture_inject_target_stores_focus_hwnd():
    inject_mod._inject_target_hwnd = None
    inject_mod._inject_focus_hwnd = None
    capture_inject_target(0x1000, 0x2000)
    assert inject_mod._inject_target_hwnd == 0x1000
    assert inject_mod._inject_focus_hwnd == 0x2000


def test_inject_auto_stops_after_text_lands():
    calls: list[str] = []

    landed = {"v": False}

    def fake_strategy(text: str, hwnd: int, strategy: str) -> bool:
        calls.append(strategy)
        if strategy == "uia":
            landed["v"] = True
        return True

    def fake_done(*_a, **_k) -> bool:
        return landed["v"]

    with (
        patch.object(inject_mod, "_resolve_focus_hwnd", return_value=0xABCD),
        patch.object(inject_mod, "_inject_with_strategy", side_effect=fake_strategy),
        patch.object(inject_mod, "_inject_done", side_effect=fake_done),
        patch.object(inject_mod, "_snapshot_field", return_value=""),
        patch.object(inject_mod, "_uia_focused_control", return_value=None),
        patch.object(inject_mod, "_gentle_focus_target", return_value=True),
        patch.object(inject_mod, "_foreground_hwnd", return_value=0x1000),
    ):
        ok = inject_text("6-7. ", method="auto")

    assert ok is True
    assert calls == ["uia"]


def test_inject_auto_stops_after_first_strategy_runs_even_if_unverified():
    calls: list[str] = []

    def fake_strategy(text: str, hwnd: int, strategy: str) -> bool:
        calls.append(strategy)
        return strategy == "uia"

    with (
        patch.object(inject_mod, "_resolve_focus_hwnd", return_value=0xABCD),
        patch.object(inject_mod, "_inject_with_strategy", side_effect=fake_strategy),
        patch.object(inject_mod, "_inject_done", return_value=False),
        patch.object(inject_mod, "_snapshot_field", return_value=""),
        patch.object(inject_mod, "_uia_focused_control", return_value=None),
        patch.object(inject_mod, "_gentle_focus_target", return_value=True),
        patch.object(inject_mod, "_foreground_hwnd", return_value=0x1000),
    ):
        ok = inject_text("58. ", method="auto")

    assert ok is True
    assert calls == ["uia"]


def test_inject_auto_fails_when_no_strategy_runs():
    calls: list[str] = []

    def fake_strategy(text: str, hwnd: int, strategy: str) -> bool:
        calls.append(strategy)
        return False

    with (
        patch.object(inject_mod, "_resolve_focus_hwnd", return_value=0xABCD),
        patch.object(inject_mod, "_inject_with_strategy", side_effect=fake_strategy),
        patch.object(inject_mod, "_inject_done", return_value=False),
        patch.object(inject_mod, "_snapshot_field", return_value=""),
        patch.object(inject_mod, "_uia_focused_control", return_value=None),
        patch.object(inject_mod, "_gentle_focus_target", return_value=True),
        patch.object(inject_mod, "_foreground_hwnd", return_value=0x1000),
    ):
        ok = inject_text("hello", method="auto")

    assert ok is False
    assert calls == ["uia", "wm_paste", "sendinput", "clipboard"]


def test_flush_ptt_returns_pcm_when_buffer_long_enough():
    from voice_pill.engine.vad import MIN_PCM_BYTES, UtteranceBuffer

    buf = UtteranceBuffer()
    buf._buffer.extend(b"\x00" * MIN_PCM_BYTES)
    pcm, reason = buf.flush_ptt()
    assert reason == "ptt_flush_ok"
    assert pcm is not None
    assert len(pcm) >= MIN_PCM_BYTES
