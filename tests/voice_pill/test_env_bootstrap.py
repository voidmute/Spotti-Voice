"""Repo .env discovery for frozen Spotti Voice.exe."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from voice_pill.engine import env_bootstrap as env_mod


def test_frozen_env_candidates_include_repo_root(tmp_path):
    exe = tmp_path / "voice-pill" / "dist" / "Spotti Voice.exe"
    exe.parent.mkdir(parents=True)
    exe.touch()
    repo_env = tmp_path / ".env"
    repo_env.write_text("SPOTTI_VOICE_API_BASE=https://spotti.family\n", encoding="utf-8")

    with (
        patch.object(env_mod.sys, "frozen", True, create=True),
        patch.object(env_mod.sys, "executable", str(exe), create=True),
        patch.dict("os.environ", {}, clear=False),
    ):
        candidates = env_mod._env_candidates()

    assert repo_env in candidates


def test_load_project_dotenv_reads_repo_root(tmp_path, monkeypatch):
    repo_env = tmp_path / ".env"
    repo_env.write_text("SPOTTI_VOICE_API_BASE=https://spotti.family\n", encoding="utf-8")
    monkeypatch.setenv("SPOTTI_VOICE_ENV_FILE", str(repo_env))

    env_mod.load_project_dotenv()
    assert __import__("os").environ.get("SPOTTI_VOICE_API_BASE") == "https://spotti.family"
