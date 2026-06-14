from __future__ import annotations

from voice_pill.engine.whisper_paths import (
    LOCAL_WHISPER_MODEL,
    is_whisper_ready,
    model_path,
    whisper_cli_path,
)


def test_whisper_not_ready_without_files(tmp_path, monkeypatch):
    monkeypatch.setenv("APPDATA", str(tmp_path))
    assert is_whisper_ready() is False
    assert whisper_cli_path() is None
    assert model_path(LOCAL_WHISPER_MODEL) is None


def test_whisper_ready_when_cli_and_model_exist(tmp_path, monkeypatch):
    monkeypatch.setenv("APPDATA", str(tmp_path))
    voice_dir = tmp_path / "SpottiVoice" / "whisper"
    voice_dir.mkdir(parents=True)
    (voice_dir / "whisper-cli.exe").write_bytes(b"")
    (voice_dir / "ggml-base.bin").write_bytes(b"model")

    assert is_whisper_ready() is True
    assert whisper_cli_path() == voice_dir / "whisper-cli.exe"
    assert model_path("base") == voice_dir / "ggml-base.bin"
