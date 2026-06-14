"""Local whisper.cpp STT — Russian only (-l ru)."""

from __future__ import annotations

import logging
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

from voice_pill.engine.vad import TARGET_RATE
from voice_pill.engine.whisper_paths import (
    LOCAL_WHISPER_MODEL,
    is_whisper_ready,
    model_path,
    preferred_whisper_install_dir,
    whisper_cli_path,
)

logger = logging.getLogger(__name__)

WHISPER_NOT_INSTALLED = (
    "whisper.cpp не установлен. Запустите voice-pill\\scripts\\fetch-whisper.ps1 "
    f"или перезапустите run.bat (установка в {preferred_whisper_install_dir()})"
)


def transcribe_pcm(
    pcm: bytes,
    *,
    model: str = LOCAL_WHISPER_MODEL,
    language: str = "ru",
) -> str:
    cli = whisper_cli_path()
    mpath = model_path(model)
    if cli is None or mpath is None:
        raise RuntimeError(WHISPER_NOT_INSTALLED)
    if not pcm or len(pcm) < 8000:
        return ""

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = Path(tmp.name)
    try:
        with wave.open(str(wav_path), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(TARGET_RATE)
            wf.writeframes(pcm)

        lang = (language or "ru").strip().lower()
        if lang == "auto":
            lang = "ru"

        args = [
            str(cli),
            "-m",
            str(mpath),
            "-f",
            str(wav_path),
            "--no-timestamps",
            "-np",
            "-l",
            lang,
        ]
        run_kwargs: dict = {
            "args": args,
            "capture_output": True,
            "text": True,
            "encoding": "utf-8",
            "errors": "replace",
            "timeout": 120,
            "check": False,
            "cwd": str(cli.parent),
        }
        if sys.platform == "win32":
            run_kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW  # type: ignore[attr-defined]
            si = subprocess.STARTUPINFO()
            si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            si.wShowWindow = subprocess.SW_HIDE  # type: ignore[attr-defined]
            run_kwargs["startupinfo"] = si
        proc = subprocess.run(**run_kwargs)
        if proc.returncode != 0:
            logger.warning(
                "whisper.cpp failed (code %s): %s",
                proc.returncode,
                (proc.stderr or proc.stdout or "")[:300],
            )
            return ""
        text = (proc.stdout or "").strip()
        if not text and proc.stderr:
            # Some builds log transcript to stderr
            for line in proc.stderr.splitlines():
                line = line.strip()
                if line and not line.startswith("["):
                    text = line
                    break
        return text
    finally:
        try:
            wav_path.unlink(missing_ok=True)
        except OSError:
            pass


def local_stt_ready(model: str = LOCAL_WHISPER_MODEL) -> bool:
    return is_whisper_ready(model)
