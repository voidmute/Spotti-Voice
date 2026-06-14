import struct

from voice_pill.engine.vad import (
    LEVEL_NOISE_FLOOR,
    LEVEL_SCALE,
    MIN_PCM_BYTES,
    pcm_chunk_level,
    pcm_has_speech,
    pcm_stats,
)


def test_pcm_stats_empty():
    assert pcm_stats(b"") == (0, 0)


def test_pcm_has_speech_rejects_short():
    assert pcm_has_speech(b"\x00" * (MIN_PCM_BYTES - 1)) is False


def _mono_pcm(amplitude: int, samples: int = 800) -> bytes:
    return struct.pack(f"<{samples}h", *([amplitude] * samples))


def test_pcm_chunk_level_empty():
    assert pcm_chunk_level(b"") == 0.0


def test_pcm_chunk_level_silence():
    assert pcm_chunk_level(b"\x00" * 1600) == 0.0


def test_pcm_chunk_level_quiet_below_noise_floor():
    assert pcm_chunk_level(_mono_pcm(LEVEL_NOISE_FLOOR - 1)) == 0.0


def test_pcm_chunk_level_normalized_and_clamped():
    rms = 1500
    expected = min(1.0, (rms - LEVEL_NOISE_FLOOR) / LEVEL_SCALE)
    assert pcm_chunk_level(_mono_pcm(rms)) == expected
    assert pcm_chunk_level(_mono_pcm(5000)) == 1.0


def test_flush_ptt_returns_pcm_when_buffer_long_enough():
    from voice_pill.engine.vad import UtteranceBuffer

    buf = UtteranceBuffer()
    buf._buffer.extend(b"\x00" * MIN_PCM_BYTES)
    pcm, reason = buf.flush_ptt()
    assert reason == "ptt_flush_ok"
    assert pcm is not None
    assert len(pcm) >= MIN_PCM_BYTES


def test_flush_ptt_empty_buffer():
    from voice_pill.engine.vad import UtteranceBuffer

    buf = UtteranceBuffer()
    pcm, reason = buf.flush_ptt()
    assert pcm is None
    assert reason == "ptt_flush_empty"
