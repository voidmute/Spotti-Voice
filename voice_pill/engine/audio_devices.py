"""List and normalize PortAudio input devices for Spotti Voice."""

from __future__ import annotations

import re
import sys
from typing import Any

from voice_pill.engine.vad import TARGET_RATE

# Virtual / loopback / mapper endpoints — not real mics for STT.
_EXCLUDE_NAME_PATTERNS = (
    r"steam streaming",
    r"oculusvad",
    r"переназначение",
    r"primary sound capture",
    r"первичн",
    r"wave speaker",
    r"wave microphone",
    r"stereo mix",
    r"стерео микшер",
    r"line in",
    r"лин\.?\s*вход",
    r"what u hear",
    r"cable output",
    r"virtual",
    r"mapper -",
)

_WINDOWS_PREFERRED_HOSTAPIS = ("Windows WASAPI",)


def _normalize_label(name: str) -> str:
    cleaned = name.strip().lower()
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"\s*·\s*по умолчанию\s*$", "", cleaned)
    return cleaned


def _should_exclude(name: str) -> bool:
    lowered = name.lower()
    return any(re.search(pattern, lowered) for pattern in _EXCLUDE_NAME_PATTERNS)


def _looks_like_microphone(name: str) -> bool:
    lowered = name.lower()
    if _should_exclude(lowered):
        return False
    hints = (
        "microphone",
        "микрофон",
        "mic ",
        "headset",
        "headphone",
        "webcam",
        "quadcast",
        "yeti",
        "audio",
    )
    return any(hint in lowered for hint in hints)


def filter_input_devices(devices: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse Windows duplicates and drop virtual loopback endpoints."""
    pool = list(devices)

    if sys.platform == "win32":
        wasapi = [d for d in pool if d.get("hostapi") in _WINDOWS_PREFERRED_HOSTAPIS]
        if wasapi:
            pool = wasapi

    pool = [d for d in pool if _looks_like_microphone(str(d.get("name", "")))]

    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for device in pool:
        label = _normalize_label(str(device.get("name", "")))
        if not label or label in seen:
            continue
        seen.add(label)
        deduped.append(device)

    deduped.sort(key=lambda d: (not d.get("isDefault"), str(d.get("name", "")).lower()))
    return deduped


def list_input_devices() -> list[dict[str, Any]]:
    try:
        import sounddevice as sd  # type: ignore[import-untyped]
    except ImportError:
        return []

    try:
        devices = sd.query_devices()
        hostapis = sd.query_hostapis()
        default_input = sd.default.device[0]
    except Exception:
        return []

    inputs: list[dict[str, Any]] = []
    for index, device in enumerate(devices):
        if int(device.get("max_input_channels", 0)) <= 0:
            continue
        hostapi_index = int(device.get("hostapi", 0))
        hostapi_name = str(hostapis[hostapi_index].get("name", ""))
        inputs.append(
            {
                "index": index,
                "name": str(device.get("name", f"Device {index}")),
                "hostapi": hostapi_name,
                "isDefault": index == default_input,
            }
        )
    return filter_input_devices(inputs)


def _samplerate_candidates(device_index: int | None) -> list[int]:
    """Build ordered sample-rate fallbacks for a capture device."""
    candidates: list[int] = []

    def add(rate: int | float | None) -> None:
        if rate is None:
            return
        value = int(rate)
        if value > 0 and value not in candidates:
            candidates.append(value)

    add(TARGET_RATE)
    try:
        import sounddevice as sd  # type: ignore[import-untyped]

        if device_index is not None:
            info = sd.query_devices(device_index, "input")
            add(info.get("default_samplerate"))
        else:
            default_in = sd.default.device[0]
            if default_in is not None and int(default_in) >= 0:
                info = sd.query_devices(int(default_in), "input")
                add(info.get("default_samplerate"))
    except Exception:
        pass
    return candidates or [TARGET_RATE]


def resolve_capture_samplerate(device_index: int | None) -> int:
    """Pick a PortAudio sample rate that opens reliably (WASAPI often needs native rate)."""
    try:
        import sounddevice as sd  # type: ignore[import-untyped]
    except ImportError:
        return TARGET_RATE

    for rate in _samplerate_candidates(device_index):
        try:
            sd.check_input_settings(
                device=device_index,
                channels=1,
                dtype="int16",
                samplerate=rate,
            )
            return rate
        except Exception:
            continue
    return _samplerate_candidates(device_index)[-1]
