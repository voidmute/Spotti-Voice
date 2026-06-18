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


def _clean_whisper_text(raw: str) -> str:
    lines: list[str] = []
    for line in (raw or "").splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("[") and "-->" in line:
            _, _, tail = line.partition("]")
            line = tail.strip()
        if not line or line.startswith("whisper_") or line.startswith("main:"):
            continue
        lines.append(line)
    return " ".join(lines).strip()


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

        out_base = wav_path.with_suffix("")
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
            "-otxt",
            "-of",
            str(out_base),
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
        text = _clean_whisper_text(proc.stdout or "")
        if not text:
            txt_path = out_base.with_suffix(".txt")
            if txt_path.is_file():
                text = _clean_whisper_text(txt_path.read_text(encoding="utf-8", errors="replace"))
        if not text and proc.stderr:
            text = _clean_whisper_text(proc.stderr)
        return text
    finally:
        try:
            wav_path.unlink(missing_ok=True)
            out_base.with_suffix(".txt").unlink(missing_ok=True)
        except OSError:
            pass


def local_stt_ready(model: str = LOCAL_WHISPER_MODEL) -> bool:
    return is_whisper_ready(model)
