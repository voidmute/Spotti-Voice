"""Microphone capture + PTT session for Spotti Voice."""

from __future__ import annotations

import asyncio
import audioop
import logging
import queue
import threading
from typing import Awaitable, Callable

from voice_pill.engine.audio_devices import resolve_capture_samplerate
from voice_pill.engine.vad import TARGET_RATE, UtteranceBuffer, pcm_chunk_level

logger = logging.getLogger(__name__)

LevelCallback = Callable[[float], Awaitable[None]]
StateCallback = Callable[[str], Awaitable[None]]


class AudioSession:
    def __init__(
        self,
        *,
        on_level: LevelCallback,
        on_state: StateCallback,
        on_utterance: Callable[[bytes], Awaitable[None]],
        device_index: int | None = None,
    ) -> None:
        self._on_level = on_level
        self._on_state = on_state
        self._on_utterance = on_utterance
        self._device_index = device_index
        self._capture_rate = TARGET_RATE
        self._ratecv_state: tuple[int, int] | None = None
        self._ptt_active = False
        self._monitor_active = False
        self._last_level = 0.0
        self._buffer = UtteranceBuffer()
        self._stream = None
        self._q: queue.Queue[bytes] = queue.Queue()
        self._worker: threading.Thread | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._running = False

    @property
    def ptt_active(self) -> bool:
        return self._ptt_active

    @property
    def device_index(self) -> int | None:
        return self._device_index

    @property
    def monitor_active(self) -> bool:
        return self._monitor_active

    @property
    def last_level(self) -> float:
        return self._last_level

    @property
    def running(self) -> bool:
        return self._running and self._stream is not None

    async def start(
        self,
        loop: asyncio.AbstractEventLoop,
        *,
        device_index: int | None = None,
    ) -> None:
        if device_index is not None or not self._running:
            self._device_index = device_index
        if self._running:
            return
        self._loop = loop
        await asyncio.to_thread(self._open_stream)
        await self._on_state("idle")

    async def stop(self) -> None:
        self._running = False
        if self._stream is not None:
            self._stream.stop()
            self._stream.close()
            self._stream = None
        if self._worker is not None:
            self._worker.join(timeout=1.0)
            self._worker = None
        while not self._q.empty():
            try:
                self._q.get_nowait()
            except queue.Empty:
                break

    async def set_input_device(self, device_index: int | None) -> None:
        if device_index == self._device_index and self._running:
            return
        if not self._running or self._loop is None:
            self._device_index = device_index
            return

        was_monitor = self._monitor_active
        was_ptt = self._ptt_active
        prev_index = self._device_index
        self._device_index = device_index
        await self.stop()
        self._monitor_active = was_monitor
        self._ptt_active = was_ptt
        try:
            await asyncio.to_thread(self._open_stream)
        except Exception as exc:
            logger.warning("Mic device switch failed (%s), reverting", exc)
            self._device_index = prev_index
            await asyncio.to_thread(self._open_stream)
            raise RuntimeError("Microphone unavailable") from exc

    def _open_stream(self) -> None:
        if self._loop is None:
            raise RuntimeError("AudioSession loop not set")

        try:
            import sounddevice as sd  # type: ignore[import-untyped]
        except ImportError as exc:
            raise RuntimeError("sounddevice not installed") from exc

        self._capture_rate = resolve_capture_samplerate(self._device_index)
        self._ratecv_state = None
        logger.info(
            "Opening mic device=%s samplerate=%s",
            self._device_index,
            self._capture_rate,
        )

        def callback(indata, _frames, _time, status) -> None:
            if status:
                logger.debug("sounddevice status: %s", status)
            try:
                chunk = indata.tobytes()
            except AttributeError:
                chunk = bytes(indata)
            if chunk:
                self._q.put(chunk)

        stream_kwargs: dict[str, object] = {
            "samplerate": self._capture_rate,
            "channels": 1,
            "dtype": "int16",
            "blocksize": int(self._capture_rate * 0.04),
            "latency": "low",
            "callback": callback,
        }
        if self._device_index is not None:
            stream_kwargs["device"] = self._device_index

        self._stream = sd.InputStream(**stream_kwargs)
        self._stream.start()
        self._running = True
        self._worker = threading.Thread(target=self._consume_loop, daemon=True)
        self._worker.start()

    def _normalize_chunk(self, chunk: bytes) -> bytes:
        if self._capture_rate == TARGET_RATE:
            return chunk
        chunk, self._ratecv_state = audioop.ratecv(
            chunk,
            2,
            1,
            self._capture_rate,
            TARGET_RATE,
            self._ratecv_state,
        )
        return chunk

    def set_monitor(self, enabled: bool) -> None:
        self._monitor_active = enabled
        if not enabled:
            self._last_level = 0.0
            self._emit_level(0.0)

    def set_ptt(self, pressed: bool) -> None:
        if pressed and not self._ptt_active:
            self._ptt_active = True
            self._buffer.reset()
            self._emit_state("listening")
        elif not pressed and self._ptt_active:
            self._ptt_active = False
            self._emit_level(0.0)
            utterance, reason = self._buffer.flush_ptt()
            logger.info("ptt_release %s bytes=%s", reason, len(utterance) if utterance else 0)
            if utterance and self._loop:
                asyncio.run_coroutine_threadsafe(
                    self._handle_utterance(utterance), self._loop
                )
            else:
                self._emit_state("idle")

    def _consume_loop(self) -> None:
        while self._running:
            try:
                chunk = self._q.get(timeout=0.1)
            except queue.Empty:
                continue
            pcm = self._normalize_chunk(chunk)
            if not self._ptt_active:
                if self._monitor_active:
                    self._emit_level(pcm_chunk_level(pcm))
                continue
            self._buffer.feed(pcm, hold=True)
            self._emit_level(pcm_chunk_level(pcm))

    async def _handle_utterance(self, pcm: bytes) -> None:
        await self._on_state("processing")
        try:
            await self._on_utterance(pcm)
        finally:
            if not self._ptt_active:
                await self._on_state("idle")

    def _emit_level(self, level: float) -> None:
        self._last_level = float(level)
        if self._loop:
            asyncio.run_coroutine_threadsafe(self._on_level(level), self._loop)

    def _emit_state(self, state: str) -> None:
        if self._loop:
            asyncio.run_coroutine_threadsafe(self._on_state(state), self._loop)
