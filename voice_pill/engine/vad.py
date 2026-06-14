"""Utterance segmentation from 16 kHz mono PCM (RMS thresholds)."""

from __future__ import annotations

import audioop

TARGET_RATE = 16000
MIN_PCM_BYTES = 8000
SILENCE_RMS = 250
MIN_SPEECH_RMS = 700
MIN_LOUD_FRAMES = 2
FINAL_FLUSH_RMS = 200
FRAME_MS = 25
LEVEL_NOISE_FLOOR = 20
LEVEL_SCALE = 700.0


def pcm_chunk_level(chunk: bytes) -> float:
    """Normalize RMS of a single PCM chunk to 0..1 for live metering."""
    if not chunk:
        return 0.0
    rms = audioop.rms(chunk, 2)
    adjusted = max(0, rms - LEVEL_NOISE_FLOOR)
    return min(1.0, adjusted / LEVEL_SCALE)


def pcm_stats(pcm: bytes) -> tuple[int, int]:
    frame_bytes = int(TARGET_RATE * 2 * (FRAME_MS / 1000.0))
    if frame_bytes <= 0 or len(pcm) < frame_bytes:
        return 0, 0
    loud_frames = 0
    peak_rms = 0
    for offset in range(0, len(pcm) - frame_bytes + 1, frame_bytes):
        rms = audioop.rms(pcm[offset : offset + frame_bytes], 2)
        peak_rms = max(peak_rms, rms)
        if rms >= SILENCE_RMS:
            loud_frames += 1
    return peak_rms, loud_frames


def pcm_has_speech(pcm: bytes, *, final_flush: bool = False) -> bool:
    if len(pcm) < MIN_PCM_BYTES:
        return False
    peak_rms, loud_frames = pcm_stats(pcm)
    if final_flush:
        return peak_rms >= FINAL_FLUSH_RMS
    return peak_rms >= MIN_SPEECH_RMS and loud_frames >= MIN_LOUD_FRAMES


class UtteranceBuffer:
    """Accumulate PCM while speech active; flush after silence tail."""

    def __init__(self, *, silence_ms: float = 420.0) -> None:
        self._buffer = bytearray()
        self._silent_ms = 0.0
        self._speech_seen = False
        self._silence_ms = silence_ms

    def reset(self) -> None:
        self._buffer.clear()
        self._silent_ms = 0.0
        self._speech_seen = False

    def feed(self, chunk: bytes) -> bytes | None:
        if not chunk:
            return None
        chunk_ms = (len(chunk) / (TARGET_RATE * 2)) * 1000.0
        rms = audioop.rms(chunk, 2)
        if rms >= SILENCE_RMS:
            self._speech_seen = True
            self._silent_ms = 0.0
            self._buffer.extend(chunk)
            return None
        if self._speech_seen:
            self._buffer.extend(chunk)
            self._silent_ms += chunk_ms
            if self._silent_ms >= self._silence_ms:
                utterance = bytes(self._buffer)
                self.reset()
                if pcm_has_speech(utterance, final_flush=True):
                    return utterance
        return None

    def flush(self) -> bytes | None:
        if not self._buffer:
            return None
        utterance = bytes(self._buffer)
        self.reset()
        if pcm_has_speech(utterance, final_flush=True):
            return utterance
        return None

    def flush_ptt(self) -> tuple[bytes | None, str]:
        """PTT release: return buffered PCM when long enough (skip strict speech gate)."""
        if not self._buffer:
            return None, "ptt_flush_empty"
        utterance = bytes(self._buffer)
        nbytes = len(utterance)
        peak_rms, loud_frames = pcm_stats(utterance)
        self.reset()
        if nbytes < MIN_PCM_BYTES:
            import logging

            logging.getLogger(__name__).info(
                "ptt_flush_discard short bytes=%s peak_rms=%s loud_frames=%s",
                nbytes,
                peak_rms,
                loud_frames,
            )
            return None, "ptt_flush_short"
        import logging

        logging.getLogger(__name__).info(
            "ptt_flush_ok bytes=%s peak_rms=%s loud_frames=%s",
            nbytes,
            peak_rms,
            loud_frames,
        )
        return utterance, "ptt_flush_ok"

    @property
    def level(self) -> float:
        if not self._buffer:
            return 0.0
        tail = bytes(self._buffer[-int(TARGET_RATE * 2 * 0.05) :])
        if not tail:
            return 0.0
        rms = audioop.rms(tail, 2)
        return min(1.0, rms / 4000.0)
