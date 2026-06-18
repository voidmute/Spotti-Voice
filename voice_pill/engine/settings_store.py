"""Persist Spotti Voice settings under %APPDATA%/SpottiVoice/."""

from __future__ import annotations

import json
import os
from copy import deepcopy
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
LOCAL_STT_LANGUAGE = "ru"

DEFAULTS: dict[str, Any] = {
    "schemaVersion": SCHEMA_VERSION,
    "sttMode": "local",
    "sttModePreference": None,
    "language": "auto",
    "pttMode": "hold",
    "hotkey": "control+shift+space",
    "cloudModel": "",
    "localModel": "base",
    "injectMethod": "auto",
    "appendTrailingSpace": True,
    "listenActive": False,
    "inputDeviceIndex": None,
    "settingsSection": "mic",
    "settingsWindow": {
        "open": False,
        "x": None,
        "y": None,
        "width": None,
        "height": None,
    },
    "pill": {"x": None, "y": None, "opacity": 0.92, "visible": True},
    "enginePort": 9777,
}


def _config_dir() -> Path:
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    path = Path(base) / "SpottiVoice"
    path.mkdir(parents=True, exist_ok=True)
    return path


def settings_path() -> Path:
    return _config_dir() / "settings.json"


_SETTINGS_SECTIONS = frozenset(
    {"mic", "hotkey", "inject", "cloud", "language", "local", "history"}
)
_LEGACY_SECTIONS = {
    "settings": "mic",
    "config": "mic",
    "device": "mic",
    "inject": "mic",
}


def _normalize_settings_section(section: Any) -> str:
    raw = str(section or "").strip().lower()
    if raw in _LEGACY_SECTIONS:
        return _LEGACY_SECTIONS[raw]
    if raw in _SETTINGS_SECTIONS:
        return raw
    return "mic"


def _apply_stt_rules(settings: dict[str, Any]) -> dict[str, Any]:
    if settings.get("sttMode") == "local":
        settings["language"] = LOCAL_STT_LANGUAGE
    elif settings.get("language") in (None, ""):
        settings["language"] = "auto"
    settings["settingsSection"] = _normalize_settings_section(settings.get("settingsSection"))
    return settings


def _default_stt_mode() -> str:
    from voice_pill.engine.stt_cloud import cloud_stt_ready

    return "cloud" if cloud_stt_ready() else "local"


def _apply_cloud_preference(settings: dict[str, Any]) -> dict[str, Any]:
    pref = settings.get("sttModePreference")
    if pref not in ("cloud", "local"):
        pref = _default_stt_mode()
    settings["sttModePreference"] = pref
    settings["sttMode"] = pref
    return settings


def _migrate_stt_mode(settings: dict[str, Any]) -> dict[str, Any]:
    """Keep cloud when preferred; restore cloud when API key becomes available."""
    from voice_pill.engine.stt_cloud import cloud_stt_ready

    if settings.get("sttModePreference") is None:
        if cloud_stt_ready() and settings.get("sttMode") != "local":
            settings["sttModePreference"] = "cloud"
        else:
            settings["sttModePreference"] = settings.get("sttMode") or _default_stt_mode()

    return _apply_cloud_preference(settings)


def _migrate_inject_method(settings: dict[str, Any]) -> dict[str, Any]:
    if settings.get("injectMethod") == "clipboard":
        settings["injectMethod"] = "auto"
    return settings


def load_settings() -> dict[str, Any]:
    path = settings_path()
    if not path.is_file():
        merged = deepcopy(DEFAULTS)
        merged = _apply_cloud_preference(merged)
        return _apply_stt_rules(merged)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return deepcopy(DEFAULTS)
    merged = deepcopy(DEFAULTS)
    if isinstance(data, dict):
        merged.update(data)
        if isinstance(data.get("pill"), dict):
            merged["pill"] = {**DEFAULTS["pill"], **data["pill"]}
        if isinstance(data.get("settingsWindow"), dict):
            merged["settingsWindow"] = {
                **DEFAULTS["settingsWindow"],
                **data["settingsWindow"],
            }
    merged["schemaVersion"] = SCHEMA_VERSION
    prev_mode = merged.get("sttMode")
    prev_pref = merged.get("sttModePreference")
    prev_inject = merged.get("injectMethod")
    merged = _migrate_stt_mode(merged)
    merged = _migrate_inject_method(merged)
    result = _apply_stt_rules(merged)
    if (
        prev_mode != result.get("sttMode")
        or prev_pref != result.get("sttModePreference")
        or prev_inject != result.get("injectMethod")
    ):
        try:
            path.write_text(
                json.dumps(result, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
        except OSError:
            pass
    return result


def save_settings(patch: dict[str, Any]) -> dict[str, Any]:
    current = load_settings()
    for key, value in patch.items():
        if key == "pill" and isinstance(value, dict):
            current["pill"] = {**current.get("pill", {}), **value}
        elif key == "settingsWindow" and isinstance(value, dict):
            current["settingsWindow"] = {
                **current.get("settingsWindow", DEFAULTS["settingsWindow"]),
                **value,
            }
        else:
            current[key] = value
    if "sttMode" in patch and patch["sttMode"] in ("cloud", "local"):
        current["sttModePreference"] = patch["sttMode"]
    current["schemaVersion"] = SCHEMA_VERSION
    current = _apply_stt_rules(current)
    settings_path().write_text(
        json.dumps(current, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return current
