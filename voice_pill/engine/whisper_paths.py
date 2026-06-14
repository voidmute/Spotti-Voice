"""Resolve whisper.cpp install dir (dev tree or %APPDATA%/SpottiVoice/whisper)."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

LOCAL_WHISPER_MODEL = "base"


def _search_dirs() -> list[Path]:
    dirs: list[Path] = []
    appdata = os.environ.get("APPDATA")
    if appdata:
        dirs.append(Path(appdata) / "SpottiVoice" / "whisper")
    if getattr(sys, "frozen", False):
        dirs.append(Path(sys.executable).resolve().parent / "whisper")
    dirs.append(
        Path(__file__).resolve().parents[2] / "voice-pill" / "vendor" / "whisper"
    )
    seen: set[Path] = set()
    unique: list[Path] = []
    for d in dirs:
        try:
            key = d.resolve()
        except OSError:
            key = d
        if key in seen:
            continue
        seen.add(key)
        unique.append(d)
    return unique


def whisper_dir() -> Path | None:
    for d in _search_dirs():
        if (d / "whisper-cli.exe").is_file():
            return d
    return None


def whisper_cli_path() -> Path | None:
    root = whisper_dir()
    if root is None:
        return None
    cli = root / "whisper-cli.exe"
    return cli if cli.is_file() else None


def model_path(model: str = LOCAL_WHISPER_MODEL) -> Path | None:
    root = whisper_dir()
    if root is None:
        return None
    candidate = root / f"ggml-{model}.bin"
    return candidate if candidate.is_file() else None


def is_whisper_ready(model: str = LOCAL_WHISPER_MODEL) -> bool:
    return whisper_cli_path() is not None and model_path(model) is not None


def whisper_status(model: str = LOCAL_WHISPER_MODEL) -> dict[str, Any]:
    root = whisper_dir()
    cli = whisper_cli_path()
    mpath = model_path(model)
    return {
        "ready": cli is not None and mpath is not None,
        "dir": str(root) if root else None,
        "cli": str(cli) if cli else None,
        "model": str(mpath) if mpath else None,
        "language": "ru",
    }


def preferred_whisper_install_dir() -> Path:
    appdata = os.environ.get("APPDATA")
    if appdata:
        return Path(appdata) / "SpottiVoice" / "whisper"
    return Path(__file__).resolve().parents[2] / "voice-pill" / "vendor" / "whisper"
