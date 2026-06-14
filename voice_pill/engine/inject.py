"""Inject transcribed text into the foreground Windows control."""

from __future__ import annotations

import logging
import sys
import time
from typing import Any

logger = logging.getLogger(__name__)

_inject_target_hwnd: int | None = None
_inject_focus_hwnd: int | None = None
_last_inject_summary: dict[str, Any] = {}


def get_last_inject_summary() -> dict[str, Any]:
    return dict(_last_inject_summary)


def _record_inject_summary(**fields: Any) -> None:
    global _last_inject_summary
    _last_inject_summary = {**fields, "ts": time.time()}


if sys.platform == "win32":
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32

    INPUT_KEYBOARD = 1
    KEYEVENTF_UNICODE = 0x0004
    KEYEVENTF_KEYUP = 0x0002
    VK_CONTROL = 0x11
    VK_V = 0x56
    WM_PASTE = 0x0302
    ASFW_ANY = ctypes.c_uint(-1).value

    ULONG_PTR = ctypes.c_ulonglong if ctypes.sizeof(ctypes.c_void_p) == 8 else ctypes.c_ulong

    class RECT(ctypes.Structure):
        _fields_ = [
            ("left", wintypes.LONG),
            ("top", wintypes.LONG),
            ("right", wintypes.LONG),
            ("bottom", wintypes.LONG),
        ]

    class GUITHREADINFO(ctypes.Structure):
        _fields_ = [
            ("cbSize", wintypes.DWORD),
            ("flags", wintypes.DWORD),
            ("hwndActive", wintypes.HWND),
            ("hwndFocus", wintypes.HWND),
            ("hwndCapture", wintypes.HWND),
            ("hwndMenuOwner", wintypes.HWND),
            ("hwndMoveSize", wintypes.HWND),
            ("hwndCaret", wintypes.HWND),
            ("rcCaret", RECT),
        ]

    class KEYBDINPUT(ctypes.Structure):
        _fields_ = [
            ("wVk", wintypes.WORD),
            ("wScan", wintypes.WORD),
            ("dwFlags", wintypes.DWORD),
            ("time", wintypes.DWORD),
            ("dwExtraInfo", ULONG_PTR),
        ]

    class INPUT_UNION(ctypes.Union):
        _fields_ = [("ki", KEYBDINPUT)]

    class INPUT(ctypes.Structure):
        _fields_ = [("type", wintypes.DWORD), ("u", INPUT_UNION)]

    def _foreground_hwnd() -> int:
        return int(user32.GetForegroundWindow() or 0)

    def _read_gui_thread_info() -> GUITHREADINFO:
        gui = GUITHREADINFO()
        gui.cbSize = ctypes.sizeof(GUITHREADINFO)
        if not user32.GetGUIThreadInfo(0, ctypes.byref(gui)):
            return gui
        return gui

    def _read_gui_focus_hwnd() -> int:
        gui = _read_gui_thread_info()
        caret = int(gui.hwndCaret or 0)
        if caret > 0:
            return caret
        return int(gui.hwndFocus or 0)

    def _uia_focused_control():
        try:
            import uiautomation as auto
        except ImportError:
            return None
        try:
            with auto.UIAutomationInitializerInThread():
                return auto.GetFocusedControl()
        except Exception as exc:
            logger.debug("UIA GetFocusedControl failed: %s", exc)
            return None

    def _uia_control_value(control) -> str:
        if not control:
            return ""
        try:
            vp = control.GetValuePattern()
            if vp and vp.IsValuePatternAvailable():
                return str(vp.Value or "")
        except Exception:
            pass
        try:
            name = control.Name or ""
            if name:
                return str(name)
        except Exception:
            pass
        return ""

    def _snapshot_field(control, hwnd: int = 0) -> str:
        if control is not None:
            val = _uia_control_value(control)
            if val:
                return val
        if hwnd > 0:
            return _uia_read_value(hwnd)
        focused = _uia_focused_control()
        if focused is not None:
            return _uia_control_value(focused)
        return ""

    def _inject_done(text: str, before: str, control, hwnd: int = 0) -> bool:
        if _text_landed(text, control=control, hwnd=hwnd):
            return True
        current = _snapshot_field(control, hwnd)
        needle = text.rstrip()
        if not needle or current == before:
            return False
        return needle in current or current.rstrip().endswith(needle)

    def _uia_set_on_control(text: str, control) -> bool:
        if not control:
            return False
        needle = text.rstrip()
        if not needle:
            return False
        before = _uia_control_value(control)
        try:
            vp = control.GetValuePattern()
            if vp and vp.IsValuePatternAvailable():
                vp.SetValue(text)
                time.sleep(0.06)
                if _text_landed(text, control=control):
                    return True
                after = _uia_control_value(control)
                if after != before:
                    return True
        except Exception as exc:
            logger.debug("UIA SetValue failed: %s", exc)
        if _text_landed(text, control=control):
            return True
        try:
            vp = control.GetValuePattern()
            if vp and vp.IsValuePatternAvailable():
                return False
        except Exception:
            pass
        try:
            control.SendKeys(text)
            time.sleep(0.06)
            return _text_landed(text, control=control)
        except Exception as exc:
            logger.debug("UIA SendKeys failed: %s", exc)
        return False

    def _text_landed(text: str, *, control=None, hwnd: int = 0) -> bool:
        needle = text[: min(32, len(text))].rstrip()
        if not needle:
            return False
        if control is not None:
            val = _uia_control_value(control)
            if needle in val or val.rstrip().endswith(needle):
                return True
        if hwnd > 0:
            val = _uia_read_value(hwnd)
            if needle in val or val.rstrip().endswith(needle):
                return True
        focused = _uia_focused_control()
        if focused is not None:
            val = _uia_control_value(focused)
            if needle in val or val.rstrip().endswith(needle):
                return True
        return False

    def capture_inject_target(
        hwnd: int | None = None,
        focus_hwnd: int | None = None,
    ) -> None:
        """Remember top-level + keyboard-focus HWND for next injection."""
        global _inject_target_hwnd, _inject_focus_hwnd
        if hwnd and hwnd > 0:
            _inject_target_hwnd = int(hwnd)
        elif hwnd is None:
            fg = _foreground_hwnd()
            if fg > 0:
                _inject_target_hwnd = fg
        if focus_hwnd and focus_hwnd > 0:
            _inject_focus_hwnd = int(focus_hwnd)
        else:
            fresh = _read_gui_focus_hwnd()
            if fresh > 0:
                _inject_focus_hwnd = fresh
        logger.info(
            "inject_capture target=%#x focus=%#x",
            _inject_target_hwnd or 0,
            _inject_focus_hwnd or 0,
        )

    def capture_current_inject_target() -> dict[str, int]:
        """Snapshot foreground + focus (inject-test / engine PTT fallback)."""
        capture_inject_target()
        return {
            "targetHwnd": int(_inject_target_hwnd or 0),
            "focusHwnd": int(_inject_focus_hwnd or 0),
        }

    def _resolve_focus_hwnd() -> int:
        fresh = _read_gui_focus_hwnd()
        focused = _uia_focused_control()
        if focused is not None:
            try:
                native = int(focused.NativeWindowHandle or 0)
                if native > 0:
                    return native
            except Exception:
                pass
        if fresh > 0:
            return fresh
        if _inject_focus_hwnd and _inject_focus_hwnd > 0:
            return _inject_focus_hwnd
        if _inject_target_hwnd and _inject_target_hwnd > 0:
            return _inject_target_hwnd
        return _foreground_hwnd()

    def _gentle_focus_target(hwnd: int) -> bool:
        if hwnd <= 0:
            return False
        if _foreground_hwnd() == hwnd:
            return True
        try:
            user32.AllowSetForegroundWindow(ASFW_ANY)
        except Exception:
            pass
        ok = bool(user32.SetForegroundWindow(hwnd))
        time.sleep(0.02)
        return ok or _foreground_hwnd() == hwnd

    def _set_focus_on_hwnd(hwnd: int) -> bool:
        if hwnd <= 0:
            return False
        cur_thread = kernel32.GetCurrentThreadId()
        target_thread = user32.GetWindowThreadProcessId(hwnd, None)
        attached = False
        try:
            if target_thread and target_thread != cur_thread:
                attached = bool(
                    user32.AttachThreadInput(cur_thread, target_thread, True)
                )
            user32.SetFocus(hwnd)
            time.sleep(0.02)
            return True
        except Exception:
            return False
        finally:
            if attached and target_thread:
                user32.AttachThreadInput(cur_thread, target_thread, False)

    def _send_unicode_char(ch: str) -> None:
        code = ord(ch)
        inputs = (INPUT * 2)()
        for i, flags in enumerate((KEYEVENTF_UNICODE, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP)):
            inputs[i].type = INPUT_KEYBOARD
            inputs[i].u.ki = KEYBDINPUT(0, code, flags, 0, 0)
        sent = user32.SendInput(2, ctypes.byref(inputs), ctypes.sizeof(INPUT))
        if sent != 2:
            raise OSError(f"SendInput sent {sent}/2")

    def _send_ctrl_v() -> None:
        seq = [
            (VK_CONTROL, 0),
            (VK_V, 0),
            (VK_V, KEYEVENTF_KEYUP),
            (VK_CONTROL, KEYEVENTF_KEYUP),
        ]
        for vk, flags in seq:
            inp = INPUT()
            inp.type = INPUT_KEYBOARD
            inp.u.ki = KEYBDINPUT(vk, 0, flags, 0, 0)
            user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))

    def _clipboard_set(text: str) -> str | None:
        try:
            import win32clipboard  # type: ignore[import-untyped]

            prev = None
            win32clipboard.OpenClipboard()
            try:
                if win32clipboard.IsClipboardFormatAvailable(win32clipboard.CF_UNICODETEXT):
                    prev = win32clipboard.GetClipboardData(win32clipboard.CF_UNICODETEXT)
                win32clipboard.EmptyClipboard()
                win32clipboard.SetClipboardText(text, win32clipboard.CF_UNICODETEXT)
            finally:
                win32clipboard.CloseClipboard()
            return prev if isinstance(prev, str) else None
        except ImportError:
            return _clipboard_set_ctypes(text)

    def _clipboard_set_ctypes(text: str) -> str | None:
        CF_UNICODETEXT = 13
        GMEM_MOVEABLE = 0x0002
        if not user32.OpenClipboard(0):
            return None
        prev = None
        try:
            handle = user32.GetClipboardData(CF_UNICODETEXT)
            if handle:
                ptr = kernel32.GlobalLock(handle)
                prev = ctypes.wstring_at(ptr)
                kernel32.GlobalUnlock(handle)
            user32.EmptyClipboard()
            encoded = (text + "\0").encode("utf-16-le")
            h_global = kernel32.GlobalAlloc(GMEM_MOVEABLE, len(encoded))
            ptr = kernel32.GlobalLock(h_global)
            ctypes.memmove(ptr, encoded, len(encoded))
            kernel32.GlobalUnlock(h_global)
            user32.SetClipboardData(CF_UNICODETEXT, h_global)
        finally:
            user32.CloseClipboard()
        return prev if isinstance(prev, str) else None

    def _clipboard_restore(prev: str | None) -> None:
        if prev is None:
            return
        _clipboard_set(prev)

    def _uia_read_value(hwnd: int) -> str:
        try:
            import uiautomation as auto
        except ImportError:
            return ""
        try:
            control = auto.ControlFromHandle(hwnd)
            if not control:
                return ""
            node = control
            for _ in range(8):
                if not node:
                    break
                try:
                    vp = node.GetValuePattern()
                except Exception:
                    vp = None
                if vp and vp.IsValuePatternAvailable():
                    return str(vp.Value or "")
                node = node.GetParentControl()
        except Exception:
            pass
        return ""

    def _inject_uia(text: str, hwnd: int) -> bool:
        control = _uia_focused_control()
        before = _snapshot_field(control, hwnd)
        if control is not None:
            _uia_set_on_control(text, control)
            return _inject_done(text, before, control, hwnd)
        if _inject_done(text, before, None, hwnd):
            return True
        try:
            import uiautomation as auto
        except ImportError:
            return False
        try:
            with auto.UIAutomationInitializerInThread():
                root = auto.ControlFromHandle(hwnd) if hwnd else None
                if not root:
                    return False
                edit = root.EditControl(searchDepth=12, foundIndex=1)
                if not edit.Exists(0, 0):
                    return False
                edit_before = _snapshot_field(edit, hwnd)
                _uia_set_on_control(text, edit)
                return _inject_done(text, edit_before, edit, hwnd)
        except Exception as exc:
            logger.info("UIA inject failed hwnd=%#x: %s", hwnd, exc)
        return False

    def _inject_wm_paste(text: str, hwnd: int) -> bool:
        prev = _clipboard_set(text)
        try:
            _set_focus_on_hwnd(hwnd)
            time.sleep(0.04)
            user32.SendMessageW(hwnd, WM_PASTE, 0, 0)
            time.sleep(0.04)
            return True
        except Exception as exc:
            logger.debug("WM_PASTE inject failed: %s", exc)
            return False
        finally:
            _clipboard_restore(prev)

    def _inject_sendinput(text: str, hwnd: int) -> bool:
        try:
            _set_focus_on_hwnd(hwnd)
            for ch in text:
                _send_unicode_char(ch)
            return True
        except OSError as exc:
            logger.debug("SendInput inject failed: %s", exc)
            return False

    def _inject_clipboard(text: str, hwnd: int) -> bool:
        prev = _clipboard_set(text)
        try:
            _set_focus_on_hwnd(hwnd)
            time.sleep(0.06)
            _send_ctrl_v()
            time.sleep(0.06)
            return True
        except OSError as exc:
            logger.debug("Clipboard inject failed: %s", exc)
            return False
        finally:
            _clipboard_restore(prev)

    def _verify_inject(text: str, hwnd: int, strategy: str) -> bool:
        landed = _text_landed(text, hwnd=hwnd)
        if landed:
            return True
        logger.info("inject_verify_fail strategy=%s hwnd=%#x", strategy, hwnd)
        return False

    def _inject_with_strategy(text: str, hwnd: int, strategy: str) -> bool:
        if strategy == "uia":
            return _inject_uia(text, hwnd)
        if strategy == "wm_paste":
            return _inject_wm_paste(text, hwnd)
        if strategy == "sendinput":
            return _inject_sendinput(text, hwnd)
        if strategy == "clipboard":
            return _inject_clipboard(text, hwnd)
        return False

    _CASCADE_ORDER = ("uia", "wm_paste", "sendinput", "clipboard")

else:

    def capture_inject_target(
        hwnd: int | None = None,
        focus_hwnd: int | None = None,
    ) -> None:
        return

    def capture_current_inject_target() -> dict[str, int]:
        return {"targetHwnd": 0, "focusHwnd": 0}

    def _resolve_focus_hwnd() -> int:
        return 0

    def _inject_with_strategy(text: str, hwnd: int, strategy: str) -> bool:
        return False

    _CASCADE_ORDER = ()


def inject_text(text: str, *, method: str = "auto") -> bool:
    if not text or not text.strip():
        return False
    if sys.platform != "win32":
        logger.warning("Text injection only supported on Windows")
        return False

    focus_hwnd = _resolve_focus_hwnd()
    target_hwnd = _inject_target_hwnd or 0
    fg = _foreground_hwnd()

    if target_hwnd and fg != target_hwnd and focus_hwnd != fg:
        parent = focus_hwnd
        while parent:
            if parent == target_hwnd:
                break
            parent = int(user32.GetParent(parent) or 0) if sys.platform == "win32" else 0
        else:
            _gentle_focus_target(target_hwnd)

    strategies: tuple[str, ...]
    if method == "auto":
        strategies = _CASCADE_ORDER
    else:
        strategies = (method,)

    ok = False
    winning = "none"
    focused_control = _uia_focused_control()
    before_snapshot = _snapshot_field(focused_control, focus_hwnd)

    def _done() -> bool:
        return _inject_done(text, before_snapshot, focused_control, focus_hwnd)

    if _done():
        ok = True
        winning = "already_landed"
    else:
        for strategy in strategies:
            if _done():
                ok = True
                winning = winning if winning != "none" else strategy
                break
            ran = _inject_with_strategy(text, focus_hwnd, strategy)
            if not ran:
                logger.info("inject_try %s ran=False hwnd=%#x", strategy, focus_hwnd)
                continue
            if _done():
                ok = True
                winning = strategy
                break
            # One strategy per utterance — avoid double paste when UIA cannot read field.
            ok = True
            winning = strategy
            logger.info("inject_try %s unverified hwnd=%#x", strategy, focus_hwnd)
            break

    logger.info(
        "inject=%s ok=%s target=%#x focus=%#x len=%s",
        winning,
        ok,
        target_hwnd,
        focus_hwnd,
        len(text),
    )
    _record_inject_summary(
        ok=ok,
        strategy=winning,
        method=method,
        targetHwnd=target_hwnd,
        focusHwnd=focus_hwnd,
        textLen=len(text),
    )
    return ok
