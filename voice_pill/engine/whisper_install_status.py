"""Read whisper.cpp install progress and trigger fetch-whisper.ps1."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

from voice_pill.engine.whisper_paths import is_whisper_ready, preferred_whisper_install_dir

_INSTALL_PROC: subprocess.Popen[Any] | None = None


def _status_path() -> Path:
    appdata = os.environ.get("APPDATA")
    root = Path(appdata) / "SpottiVoice" if appdata else Path.home() / ".spottivoice"
    return root / "whisper-install-status.json"


def _resolve_fetch_script() -> Path | None:
    candidates: list[Path] = []
    if getattr(sys, "frozen", False):
        candidates.append(Path(sys.executable).resolve().parent / "scripts" / "fetch-whisper.ps1")
    here = Path(__file__).resolve()
    candidates.append(here.parents[2] / "voice-pill" / "scripts" / "fetch-whisper.ps1")
    candidates.append(here.parents[2] / "voice-pill" / "dist" / "scripts" / "fetch-whisper.ps1")
    for path in candidates:
        if path.is_file():
            return path
    return None


def _read_status_file() -> dict[str, Any] | None:
    path = _status_path()
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def get_install_status() -> dict[str, Any]:
    if is_whisper_ready():
        return {
            "ready": True,
            "phase": "ready",
            "percent": 100,
            "message": "whisper.cpp готов",
            "installDir": str(preferred_whisper_install_dir()),
        }

    file_status = _read_status_file()
    if file_status:
        phase = str(file_status.get("phase") or "installing")
        percent = int(file_status.get("percent") or 0)
        message = str(file_status.get("message") or "Установка whisper.cpp…")
        return {
            "ready": False,
            "phase": phase,
            "percent": max(0, min(100, percent)),
            "message": message,
            "installDir": str(preferred_whisper_install_dir()),
        }

    global _INSTALL_PROC
    installing = _INSTALL_PROC is not None and _INSTALL_PROC.poll() is None
    if installing:
        return {
            "ready": False,
            "phase": "installing",
            "percent": 8,
            "message": "Запуск установки whisper.cpp…",
            "installDir": str(preferred_whisper_install_dir()),
        }

    return {
        "ready": False,
        "phase": "idle",
        "percent": 0,
        "message": "whisper.cpp не установлен",
        "installDir": str(preferred_whisper_install_dir()),
    }


def start_install() -> bool:
    global _INSTALL_PROC
    if is_whisper_ready():
        return True
    if _INSTALL_PROC is not None and _INSTALL_PROC.poll() is None:
        return True

    script = _resolve_fetch_script()
    if script is None:
        return False

    status_path = _status_path()
    status_path.parent.mkdir(parents=True, exist_ok=True)
    status_path.write_text(
        json.dumps(
            {
                "phase": "starting",
                "percent": 2,
                "message": "Подготовка загрузки whisper.cpp…",
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    if sys.platform != "win32":
        return False

    _INSTALL_PROC = subprocess.Popen(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-WindowStyle",
            "Hidden",
            "-File",
            str(script),
        ],
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    return True
