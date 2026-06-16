from __future__ import annotations

from voice_pill.engine.audio_devices import (
    _samplerate_candidates,
    filter_input_devices,
    resolve_capture_samplerate,
)


def test_filter_dedupes_and_drops_virtual_devices():
    raw = [
        {"index": 0, "name": "Microphone (HyperX QuadCast)", "hostapi": "Windows WASAPI", "isDefault": True},
        {"index": 1, "name": "Microphone (HyperX QuadCast)", "hostapi": "Windows DirectSound", "isDefault": False},
        {"index": 2, "name": "Микрофон (Steam Streaming Microphone)", "hostapi": "Windows WASAPI", "isDefault": False},
        {"index": 3, "name": "Переназначение звуковых устр. - Input", "hostapi": "Windows WASAPI", "isDefault": False},
        {"index": 4, "name": "Микрофон (G435 Wireless Gaming Headset)", "hostapi": "Windows WASAPI", "isDefault": False},
        {"index": 5, "name": "Стерео микшер (Realtek HD Audio Stereo input)", "hostapi": "Windows WASAPI", "isDefault": False},
    ]

    filtered = filter_input_devices(raw)

    names = [d["name"] for d in filtered]
    assert names == [
        "Microphone (HyperX QuadCast)",
        "Микрофон (G435 Wireless Gaming Headset)",
    ]
    assert filtered[0]["isDefault"] is True


def test_resolve_capture_samplerate_falls_back_to_device_native():
    try:
        import sounddevice as sd  # type: ignore[import-untyped]
    except (ImportError, OSError):
        return

    try:
        default_in = sd.default.device[0]
        if default_in is None or int(default_in) < 0:
            return
        device_index = int(default_in)
    except Exception:
        return

    candidates = _samplerate_candidates(device_index)
    assert 16000 in candidates
    resolved = resolve_capture_samplerate(device_index)
    assert resolved in candidates
    assert resolved >= 16000
