"""Windows DPAPI credential blob for Spotti Voice cloud tokens."""

from __future__ import annotations

import base64
import json
import os
import sys
from pathlib import Path
from typing import Any, Optional


def _credentials_path() -> Path:
    appdata = os.environ.get("APPDATA")
    if not appdata:
        raise RuntimeError("APPDATA is not set")
    root = Path(appdata) / "SpottiVoice"
    root.mkdir(parents=True, exist_ok=True)
    return root / "credentials.json"


def _dpapi_protect(data: bytes) -> bytes:
    if sys.platform != "win32":
        raise RuntimeError("DPAPI is only available on Windows")
    import win32crypt

    return win32crypt.CryptProtectData(data, None, None, None, None, 0)


def _dpapi_unprotect(data: bytes) -> bytes:
    if sys.platform != "win32":
        raise RuntimeError("DPAPI is only available on Windows")
    import win32crypt

    return win32crypt.CryptUnprotectData(data, None, None, None, 0)[1]


def load_credentials() -> Optional[dict[str, Any]]:
    path = _credentials_path()
    if not path.is_file():
        return None
    try:
        wrapper = json.loads(path.read_text(encoding="utf-8"))
        blob_b64 = wrapper.get("encrypted")
        if not isinstance(blob_b64, str) or not blob_b64:
            return None
        raw = _dpapi_unprotect(base64.b64decode(blob_b64))
        payload = json.loads(raw.decode("utf-8"))
        return payload if isinstance(payload, dict) else None
    except Exception:
        return None


def save_credentials(payload: dict[str, Any]) -> None:
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    protected = _dpapi_protect(raw)
    wrapper = {"version": 1, "encrypted": base64.b64encode(protected).decode("ascii")}
    path = _credentials_path()
    path.write_text(json.dumps(wrapper), encoding="utf-8")


def clear_credentials() -> None:
    path = _credentials_path()
    if path.is_file():
        path.unlink()
