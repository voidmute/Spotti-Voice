"""Load .env into process env (key names only; never log values)."""

from __future__ import annotations

import os
import sys
from pathlib import Path


def _dedupe_paths(paths: list[Path]) -> list[Path]:
    seen: set[str] = set()
    out: list[Path] = []
    for raw in paths:
        if not raw:
            continue
        key = str(raw)
        if key in seen:
            continue
        seen.add(key)
        out.append(raw)
    return out


def _env_candidates() -> list[Path]:
    """Search paths for Spotti Voice / repo .env (frozen exe cannot use __file__ parents)."""
    paths: list[Path] = []

    explicit = os.environ.get("SPOTTI_VOICE_ENV_FILE", "").strip()
    if explicit:
        paths.append(Path(explicit))

    appdata = os.environ.get("APPDATA")
    appdata_env = Path(appdata) / "SpottiVoice" / ".env" if appdata else None

    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).resolve().parent
        paths.extend(
            [
                exe_dir.parent.parent / ".env",  # repo root when exe is voice-pill/dist/
                exe_dir.parent / ".env",  # voice-pill/.env
                exe_dir / ".env",  # dist/.env
            ]
        )
    else:
        paths.append(Path(__file__).resolve().parents[2] / ".env")

    if appdata_env is not None:
        paths.append(appdata_env)

    return _dedupe_paths(paths)


def load_project_dotenv() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return

    appdata = os.environ.get("APPDATA")
    appdata_env = Path(appdata) / "SpottiVoice" / ".env" if appdata else None

    for env_path in _env_candidates():
        if appdata_env is not None and env_path == appdata_env:
            continue
        if env_path.is_file():
            load_dotenv(env_path, override=False)

    if appdata_env is not None and appdata_env.is_file():
        load_dotenv(appdata_env, override=True)


def cloud_api_key_configured() -> bool:
    from voice_pill.engine.cloud_auth import cloud_stt_ready

    return cloud_stt_ready()
