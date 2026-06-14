from __future__ import annotations

import json
from pathlib import Path

from voice_pill.engine.settings_store import (
    DEFAULTS,
    LOCAL_STT_LANGUAGE,
    load_settings,
    save_settings,
)


def test_settings_defaults(tmp_path, monkeypatch):
    monkeypatch.setenv("APPDATA", str(tmp_path))
    monkeypatch.setattr(
        "voice_pill.engine.stt_cloud.cloud_stt_ready",
        lambda: False,
    )
    s = load_settings()
    assert s["sttMode"] == "local"
    assert s["language"] == LOCAL_STT_LANGUAGE
    assert s["injectMethod"] == "auto"
    assert s["schemaVersion"] == 1


def test_settings_defaults_cloud_when_key_ready(tmp_path, monkeypatch):
    monkeypatch.setenv("APPDATA", str(tmp_path))
    monkeypatch.setattr(
        "voice_pill.engine.stt_cloud.cloud_stt_ready",
        lambda: True,
    )
    s = load_settings()
    assert s["sttMode"] == "cloud"
    assert s["sttModePreference"] == "cloud"
    assert s["language"] == "auto"


def test_cloud_mode_keeps_selected_language(tmp_path, monkeypatch):
    monkeypatch.setenv("APPDATA", str(tmp_path))
    monkeypatch.setattr(
        "voice_pill.engine.stt_cloud.cloud_stt_ready",
        lambda: True,
    )
    save_settings({"sttMode": "cloud", "language": "en"})
    s = load_settings()
    assert s["sttMode"] == "cloud"
    assert s["language"] == "en"


def test_cloud_mode_keeps_auto_language(tmp_path, monkeypatch):
    monkeypatch.setenv("APPDATA", str(tmp_path))
    monkeypatch.setattr(
        "voice_pill.engine.stt_cloud.cloud_stt_ready",
        lambda: True,
    )
    save_settings({"sttMode": "cloud", "language": "auto"})
    s = load_settings()
    assert s["language"] == "auto"


def test_settings_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setenv("APPDATA", str(tmp_path))
    save_settings({"sttMode": "local", "pill": {"opacity": 0.5}})
    s = load_settings()
    assert s["sttMode"] == "local"
    assert s["pill"]["opacity"] == 0.5
    path = Path(tmp_path) / "SpottiVoice" / "settings.json"
    assert path.is_file()
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["sttMode"] == "local"


def test_local_mode_forces_russian_language(tmp_path, monkeypatch):
    monkeypatch.setenv("APPDATA", str(tmp_path))
    save_settings({"sttMode": "local", "language": "en"})
    s = load_settings()
    assert s["sttMode"] == "local"
    assert s["language"] == LOCAL_STT_LANGUAGE


def test_clipboard_inject_migrates_to_auto(tmp_path, monkeypatch):
    monkeypatch.setenv("APPDATA", str(tmp_path))
    save_settings({"injectMethod": "clipboard"})
    s = load_settings()
    assert s["injectMethod"] == "auto"


def test_settings_section_persists(tmp_path, monkeypatch):
    monkeypatch.setenv("APPDATA", str(tmp_path))
    save_settings({"settingsSection": "device"})
    s = load_settings()
    assert s["settingsSection"] == "device"


def test_settings_window_merge(tmp_path, monkeypatch):
    monkeypatch.setenv("APPDATA", str(tmp_path))
    save_settings({"settingsWindow": {"open": True, "x": 100, "y": 200}})
    s = load_settings()
    assert s["settingsWindow"]["open"] is True
    assert s["settingsWindow"]["x"] == 100
    assert s["settingsWindow"]["y"] == 200
    assert s["settingsWindow"]["width"] is None

    save_settings({"settingsWindow": {"width": 900, "height": 640}})
    s = load_settings()
    assert s["settingsWindow"]["open"] is True
    assert s["settingsWindow"]["width"] == 900
    assert s["settingsWindow"]["height"] == 640


def test_pill_position_merge(tmp_path, monkeypatch):
    monkeypatch.setenv("APPDATA", str(tmp_path))
    save_settings({"pill": {"x": 42, "y": 84}})
    s = load_settings()
    assert s["pill"]["x"] == 42
    assert s["pill"]["y"] == 84
    assert s["pill"]["opacity"] == DEFAULTS["pill"]["opacity"]
