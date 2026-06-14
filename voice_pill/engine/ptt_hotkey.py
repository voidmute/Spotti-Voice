"""Engine-side PTT hotkey (hold or toggle) when Electron globalShortcut is unavailable."""

from __future__ import annotations

import logging
import threading
from typing import Callable

from voice_pill.engine.inject import capture_inject_target

logger = logging.getLogger(__name__)

_listener: PttHotkeyListener | None = None
_lock = threading.Lock()


def _normalize_hotkey(hotkey: str) -> str:
    parts = [p.strip().lower() for p in hotkey.split("+") if p.strip()]
    mapped: list[str] = []
    for part in parts:
        if part == "control":
            mapped.append("ctrl")
        elif part == "meta":
            mapped.append("windows")
        else:
            mapped.append(part)
    return "+".join(mapped)


class PttHotkeyListener:
    def __init__(
        self,
        on_toggle: Callable[[bool], None],
        hotkey: str,
        *,
        ptt_mode: str = "hold",
    ) -> None:
        self._on_toggle = on_toggle
        self._hotkey = _normalize_hotkey(hotkey)
        self._ptt_mode = ptt_mode if ptt_mode in ("hold", "toggle") else "hold"
        self._held = False
        self._started = False
        self._hooks: list[object] = []

    def _press(self) -> None:
        if self._held:
            return
        self._held = True
        capture_inject_target()
        try:
            self._on_toggle(True)
        except Exception as exc:
            logger.warning("PTT press callback failed: %s", exc)

    def _release(self) -> None:
        if not self._held:
            return
        self._held = False
        try:
            self._on_toggle(False)
        except Exception as exc:
            logger.warning("PTT release callback failed: %s", exc)

    def _toggle(self) -> None:
        if self._held:
            self._release()
        else:
            self._press()

    def start(self) -> bool:
        try:
            import keyboard  # type: ignore[import-untyped]
        except ImportError:
            logger.warning("keyboard package not installed; engine PTT unavailable")
            return False

        try:
            if self._ptt_mode == "toggle":
                hook = keyboard.add_hotkey(
                    self._hotkey,
                    self._toggle,
                    suppress=False,
                    trigger_on_release=False,
                )
                self._hooks.append(hook)
                logger.info("Engine PTT toggle hotkey active: %s", self._hotkey)
            else:
                press_hook = keyboard.add_hotkey(
                    self._hotkey,
                    self._press,
                    suppress=False,
                    trigger_on_release=False,
                )
                release_hook = keyboard.add_hotkey(
                    self._hotkey,
                    self._release,
                    suppress=False,
                    trigger_on_release=True,
                )
                self._hooks.extend([press_hook, release_hook])
                logger.info("Engine PTT hold hotkey active: %s", self._hotkey)
            self._started = True
            return True
        except Exception as exc:
            logger.warning("Engine PTT hotkey registration failed: %s", exc)
            self.stop()
            return False

    def stop(self) -> None:
        if not self._started and not self._hooks:
            return
        try:
            import keyboard  # type: ignore[import-untyped]

            for hook in self._hooks:
                try:
                    keyboard.remove_hotkey(hook)
                except Exception:
                    pass
            keyboard.unhook_all_hotkeys()
        except Exception:
            pass
        self._hooks.clear()
        self._started = False
        self._held = False


def start_fallback(
    on_toggle: Callable[[bool], None],
    hotkey: str,
    *,
    ptt_mode: str = "hold",
) -> bool:
    global _listener
    with _lock:
        stop_fallback()
        _listener = PttHotkeyListener(on_toggle, hotkey, ptt_mode=ptt_mode)
        return _listener.start()


def stop_fallback() -> None:
    global _listener
    with _lock:
        if _listener is not None:
            _listener.stop()
            _listener = None


def fallback_active() -> bool:
    with _lock:
        return _listener is not None and _listener._started
