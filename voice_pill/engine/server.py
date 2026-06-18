"""Spotti Voice FastAPI engine."""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from voice_pill.engine.audio_session import AudioSession
from voice_pill.engine.audio_devices import list_input_devices
from voice_pill.engine.env_bootstrap import load_project_dotenv
from voice_pill.engine.inject import (
    capture_current_inject_target,
    capture_inject_target,
    get_last_inject_summary,
    inject_text,
)
from voice_pill.engine import ptt_hotkey
from voice_pill.engine.settings_store import LOCAL_STT_LANGUAGE, load_settings, save_settings
from voice_pill.engine.transcript_history import (
    add_entry as history_add,
    delete_entry as history_delete,
    list_entries as history_list,
    update_entry as history_update,
)
from voice_pill.engine.stt_cloud import cloud_stt_ready, transcribe_pcm as cloud_transcribe
from voice_pill.engine.stt_language import LanguageMismatchError
from voice_pill.engine.stt_local import local_stt_ready, transcribe_pcm as local_transcribe
from voice_pill.engine.whisper_paths import whisper_status

load_project_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voice_pill.engine")

_ws_clients: set[WebSocket] = set()
_audio: AudioSession | None = None
_audio_init_task: asyncio.Task[None] | None = None
_state = "idle"


class SettingsPatch(BaseModel):
    sttMode: str | None = None
    language: str | None = None
    pttMode: str | None = None
    hotkey: str | None = None
    cloudModel: str | None = None
    localModel: str | None = None
    injectMethod: str | None = None
    appendTrailingSpace: bool | None = None
    listenActive: bool | None = None
    inputDeviceIndex: int | None = Field(default=None)
    settingsSection: str | None = None
    settingsWindow: dict[str, Any] | None = None
    pill: dict[str, Any] | None = None
    enginePort: int | None = None


class PttBody(BaseModel):
    pressed: bool
    targetHwnd: int | None = None
    focusHwnd: int | None = None


class PttHotkeyFallbackBody(BaseModel):
    enabled: bool = True
    hotkey: str | None = None
    pttMode: str | None = None


class MicMonitorBody(BaseModel):
    enabled: bool
    inputDeviceIndex: int | None = Field(default=None)


async def _broadcast(event: dict[str, Any]) -> None:
    dead: list[WebSocket] = []
    payload = json.dumps(event)
    for ws in list(_ws_clients):
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _ws_clients.discard(ws)


async def _set_state(state: str) -> None:
    global _state
    _state = state
    await _broadcast({"type": "state", "state": state})


async def _on_level(level: float) -> None:
    await _broadcast({"type": "level", "level": level})


async def _broadcast_error(message: str, *, code: str | None = None) -> None:
    payload: dict[str, Any] = {"type": "error", "message": message}
    if code:
        payload["code"] = code
    await _broadcast(payload)
    await _set_state("error")


async def _on_utterance(pcm: bytes) -> None:
    settings = load_settings()
    mode = settings.get("sttMode", "cloud")
    lang = settings.get("language", "auto")
    if mode == "local":
        lang = LOCAL_STT_LANGUAGE
    try:
        if mode == "local":
            text = await asyncio.to_thread(
                local_transcribe,
                pcm,
                model=str(settings.get("localModel", "base")),
                language=lang,
            )
        else:
            if not cloud_stt_ready():
                await _broadcast_error(
                    "Войдите в облако: Настройки → Облако → Войти через Discord.",
                    code="cloud_auth_required",
                )
                return
            text = await cloud_transcribe(pcm, language=lang)
    except LanguageMismatchError:
        await _broadcast_error("Incorrect Language", code="incorrect_language")
        return
    except Exception as exc:
        logger.warning("STT failed: %s", exc)
        msg = str(exc)
        if (
            "cloud_auth" in msg
            or "auth_required" in msg
            or "auth_expired" in msg
            or "401" in msg
            or "Unauthorized" in msg
        ):
            await _broadcast_error(
                "Сессия облака истекла. Войдите снова в Настройках.",
                code="cloud_auth_required",
            )
            return
        if "rate_limit" in msg or "429" in msg:
            await _broadcast_error(
                "Слишком много запросов. Подождите минуту.",
                code="cloud_rate_limited",
            )
            return
        if "unreachable" in msg.lower() or "connect" in msg.lower():
            await _broadcast_error(
                "Нет связи с сервером Spotti. Проверьте интернет.",
                code="cloud_api_unreachable",
            )
            return
        if "whisper.cpp" in msg.lower() or "не установлен" in msg.lower():
            await _broadcast_error(
                "Локальное распознавание ещё не готово. Откройте Настройки - Локально и дождитесь загрузки whisper.cpp.",
                code="local_stt_missing",
            )
            return
        if mode == "cloud":
            await _broadcast_error(
                "Облачное распознавание недоступно. Проверьте вход и сеть.",
                code="cloud_api_failed",
            )
            return
        await _broadcast_error("Не удалось распознать речь", code="stt_failed")
        return

    if not text:
        await _broadcast_error("Речь не распознана", code="stt_empty")
        return

    logger.info("ptt_cycle stt_ok len=%s preview=%r", len(text), text[:48])

    if settings.get("appendTrailingSpace", True) and not text.endswith(" "):
        text = f"{text} "

    ok = await asyncio.to_thread(
        inject_text,
        text,
        method=str(settings.get("injectMethod", "auto")),
    )
    try:
        entry = await asyncio.to_thread(
            history_add,
            text,
            stt_mode=str(mode),
            injected=ok,
        )
        await _broadcast({"type": "history", "entry": entry})
    except ValueError:
        pass
    await _broadcast({"type": "final", "text": text, "injected": ok})
    if not ok:
        await _broadcast_error("Не удалось вставить текст", code="inject_failed")


async def _init_audio_background(
    loop: asyncio.AbstractEventLoop,
    device_index: int | None,
) -> None:
    global _audio
    _audio = AudioSession(
        on_level=_on_level,
        on_state=_set_state,
        on_utterance=_on_utterance,
        device_index=device_index,
    )
    try:
        await _audio.start(loop, device_index=device_index)
    except Exception as exc:
        logger.error("Audio init failed: %s", exc)
        _audio = None


async def _deferred_engine_startup(device_index: int | None) -> None:
    """Run mic + engine PTT after HTTP server is listening (never block lifespan yield)."""
    await asyncio.sleep(0)
    loop = asyncio.get_running_loop()
    await _init_audio_background(loop, device_index)
    await asyncio.to_thread(_start_engine_ptt_hotkey)


async def _wait_for_audio(*, timeout: float = 10.0) -> bool:
    """Block until deferred mic init finishes (first PTT often races this)."""
    global _audio, _audio_init_task
    if _audio is not None:
        return True
    if _audio_init_task is None:
        return False
    try:
        await asyncio.wait_for(asyncio.shield(_audio_init_task), timeout=timeout)
    except asyncio.TimeoutError:
        logger.warning("Audio init timed out after %.1fs", timeout)
        return False
    except asyncio.CancelledError:
        return False
    return _audio is not None


async def _warm_cloud_on_start() -> None:
    await asyncio.sleep(0)
    settings = load_settings()
    if settings.get("sttMode", "cloud") != "cloud":
        return
    from voice_pill.engine.cloud_auth import warm_cloud_session

    await warm_cloud_session()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _audio, _audio_init_task
    settings = load_settings()
    device_index = settings.get("inputDeviceIndex")
    if device_index is not None:
        try:
            device_index = int(device_index)
        except (TypeError, ValueError):
            device_index = None
    _audio_init_task = asyncio.create_task(
        _deferred_engine_startup(device_index),
    )
    asyncio.create_task(_warm_cloud_on_start())
    yield
    ptt_hotkey.stop_fallback()
    if _audio_init_task is not None and not _audio_init_task.done():
        _audio_init_task.cancel()
        try:
            await _audio_init_task
        except asyncio.CancelledError:
            pass
    _audio_init_task = None
    if _audio is not None:
        await _audio.stop()


def _start_engine_ptt_hotkey() -> None:
    import os
    import sys

    if sys.platform != "win32":
        return
    if os.environ.get("SPOTTI_VOICE_ELECTRON") == "1":
        logger.info("Engine PTT hotkey skipped (Electron handles global PTT)")
        return
    settings = load_settings()
    hotkey = str(settings.get("hotkey", "control+shift+space"))
    ptt_mode = str(settings.get("pttMode", "hold"))
    if ptt_mode not in ("hold", "toggle"):
        ptt_mode = "hold"

    def on_toggle(pressed: bool) -> None:
        if _audio is not None:
            _audio.set_ptt(pressed)

    ok = ptt_hotkey.start_fallback(on_toggle, hotkey, ptt_mode=ptt_mode)
    if not ok:
        logger.warning("Engine PTT hotkey not registered (%s)", hotkey)


app = FastAPI(title="Spotti Voice Engine", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class CloudCallbackBody(BaseModel):
    callback_url: str = Field(min_length=8)


@app.get("/api/cloud/status")
async def cloud_status() -> dict[str, Any]:
    from voice_pill.engine.cloud_auth import (
        cloud_session,
        cloud_stt_ready,
        cloud_user_profile,
        warm_cloud_session,
    )

    creds = cloud_session()
    signed_in = bool(creds and creds.get("refresh_token"))
    if signed_in:
        await warm_cloud_session()

    still = cloud_session()
    profile = cloud_user_profile() or {}
    return {
        "ready": cloud_stt_ready(),
        "signedIn": bool(still and still.get("refresh_token")),
        "userLabel": profile.get("userLabel"),
        "userId": profile.get("userId"),
        "avatarUrl": profile.get("avatarUrl"),
    }


@app.post("/api/cloud/auth/warm")
async def cloud_auth_warm() -> dict[str, bool]:
    from voice_pill.engine.cloud_auth import warm_cloud_session

    return {"ok": await warm_cloud_session()}


@app.post("/api/cloud/auth/begin")
async def cloud_auth_begin() -> dict[str, str]:
    from voice_pill.engine.cloud_auth import begin_oauth

    try:
        return await begin_oauth()
    except RuntimeError as exc:
        detail = str(exc) or "oauth_start_failed"
        raise HTTPException(status_code=502, detail=detail) from exc


@app.post("/api/cloud/auth/finish")
async def cloud_auth_finish(body: CloudCallbackBody) -> dict[str, Any]:
    from voice_pill.engine.cloud_auth import complete_oauth

    creds = await complete_oauth(body.callback_url)
    return {"ok": True, "user": creds.get("user")}


@app.post("/api/cloud/auth/signout")
def cloud_auth_signout() -> dict[str, bool]:
    from voice_pill.engine.cloud_auth import sign_out

    sign_out()
    return {"ok": True}


@app.get("/api/whisper/install-status")
def whisper_install_status_route() -> dict[str, Any]:
    from voice_pill.engine.whisper_install_status import get_install_status

    return get_install_status()


@app.post("/api/whisper/install")
def whisper_install_start_route() -> dict[str, Any]:
    from voice_pill.engine.whisper_install_status import start_install

    ok = start_install()
    if not ok:
        raise HTTPException(status_code=500, detail="whisper_install_failed")
    return {"ok": True}


@app.get("/api/health")
def health() -> dict[str, Any]:
    settings = load_settings()
    return {
        "ok": True,
        "state": _state,
        "audio": _audio is not None and _audio.running,
        "sttMode": settings.get("sttMode"),
        "language": settings.get("language"),
        "whisper": whisper_status(),
        "localSttReady": local_stt_ready(),
        "cloudSttReady": cloud_stt_ready(),
        "lastInject": get_last_inject_summary(),
        "version": "0.1.0",
    }


@app.get("/api/settings")
def get_settings() -> dict[str, Any]:
    return load_settings()


@app.get("/api/audio-devices")
def audio_devices() -> dict[str, Any]:
    settings = load_settings()
    selected = settings.get("inputDeviceIndex")
    if selected is not None:
        try:
            selected = int(selected)
        except (TypeError, ValueError):
            selected = None
    return {
        "devices": list_input_devices(),
        "selected": selected,
    }


class HistoryPatch(BaseModel):
    text: str


@app.get("/api/history")
def get_history() -> dict[str, Any]:
    return {"entries": history_list()}


@app.put("/api/history/{entry_id}")
def put_history(entry_id: str, body: HistoryPatch) -> dict[str, Any]:
    updated = history_update(entry_id, body.text)
    if not updated:
        raise HTTPException(status_code=404, detail="not_found")
    return updated


@app.delete("/api/history/{entry_id}")
def delete_history(entry_id: str) -> dict[str, bool]:
    ok = history_delete(entry_id)
    if not ok:
        raise HTTPException(status_code=404, detail="not_found")
    return {"ok": True}


@app.put("/api/settings")
async def put_settings(patch: SettingsPatch) -> dict[str, Any]:
    data = patch.model_dump(exclude_unset=True)
    prev = load_settings()
    saved = save_settings(data)
    if _audio is not None and "inputDeviceIndex" in data:
        new_index = saved.get("inputDeviceIndex")
        if new_index is not None:
            try:
                new_index = int(new_index)
            except (TypeError, ValueError):
                new_index = None
        prev_index = prev.get("inputDeviceIndex")
        if prev_index is not None:
            try:
                prev_index = int(prev_index)
            except (TypeError, ValueError):
                prev_index = None
        if new_index != prev_index:
            try:
                await _audio.set_input_device(new_index)
            except Exception as exc:
                logger.warning("Mic device switch failed: %s", exc)
    return saved


@app.post("/api/ptt")
async def ptt(body: PttBody) -> dict[str, bool]:
    if body.pressed:
        capture_inject_target(body.targetHwnd, body.focusHwnd)
        logger.info(
            "ptt_press target=%#x focus=%#x",
            body.targetHwnd or 0,
            body.focusHwnd or 0,
        )
    if not await _wait_for_audio():
        logger.warning("PTT ignored — audio session not ready")
        return {"ok": False}
    _audio.set_ptt(body.pressed)
    return {"ok": True}


@app.post("/api/ptt-hotkey/fallback")
async def ptt_hotkey_fallback(body: PttHotkeyFallbackBody) -> dict[str, Any]:
    if not body.enabled:
        ptt_hotkey.stop_fallback()
        return {"ok": True, "active": False}

    settings = load_settings()
    hotkey = body.hotkey or str(settings.get("hotkey", "control+shift+space"))
    ptt_mode = body.pttMode or str(settings.get("pttMode", "hold"))
    if ptt_mode not in ("hold", "toggle"):
        ptt_mode = "hold"

    def on_toggle(pressed: bool) -> None:
        if _audio is not None:
            _audio.set_ptt(pressed)

    ok = await asyncio.to_thread(
        ptt_hotkey.start_fallback, on_toggle, hotkey, ptt_mode=ptt_mode
    )
    return {"ok": ok, "active": ok}


@app.post("/api/mic-monitor")
async def mic_monitor(body: MicMonitorBody) -> dict[str, Any]:
    if _audio is None:
        return {"ok": False, "error": "no_audio"}
    if body.enabled:
        device_index = body.inputDeviceIndex
        if device_index is None:
            device_index = load_settings().get("inputDeviceIndex")
        if device_index is not None:
            try:
                device_index = int(device_index)
            except (TypeError, ValueError):
                device_index = None
        if device_index != _audio.device_index:
            try:
                await _audio.set_input_device(device_index)
            except Exception as exc:
                logger.warning("Mic monitor device switch failed: %s", exc)
                return {"ok": False, "error": "device_open_failed"}
    _audio.set_monitor(body.enabled)
    return {"ok": _audio.running, "capture": _audio.running}


@app.get("/api/mic-level")
def mic_level() -> dict[str, float | bool]:
    if _audio is None:
        return {"ok": False, "level": 0.0, "monitoring": False}
    return {
        "ok": True,
        "level": _audio.last_level,
        "monitoring": _audio.monitor_active,
    }


class HotkeyCaptureBody(BaseModel):
    enabled: bool


@app.post("/api/hotkey-capture")
async def hotkey_capture(body: HotkeyCaptureBody) -> dict[str, bool]:
    if body.enabled:
        ptt_hotkey.stop_fallback()
    return {"ok": True}


@app.post("/api/inject-test")
async def inject_test() -> dict[str, Any]:
    captured = await asyncio.to_thread(capture_current_inject_target)
    settings = load_settings()
    ok = await asyncio.to_thread(
        inject_text,
        "Spotti Voice test ",
        method=str(settings.get("injectMethod", "auto")),
    )
    return {"ok": ok, **captured, "lastInject": get_last_inject_summary()}


@app.websocket("/ws/events")
async def ws_events(ws: WebSocket) -> None:
    await ws.accept()
    _ws_clients.add(ws)
    await ws.send_text(json.dumps({"type": "state", "state": _state}))
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        _ws_clients.discard(ws)


def _configure_frozen_logging() -> None:
    import sys

    if not getattr(sys, "frozen", False):
        return
    import os
    from pathlib import Path

    appdata = os.environ.get("APPDATA")
    if not appdata:
        return
    log_dir = Path(appdata) / "SpottiVoice"
    log_dir.mkdir(parents=True, exist_ok=True)
    handler = logging.FileHandler(log_dir / "engine.log", encoding="utf-8")
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"),
    )
    logging.getLogger().addHandler(handler)
    logger.info("Spotti Voice engine starting (frozen exe)")


def main() -> None:
    import uvicorn

    from voice_pill.engine.runtime import ensure_stdio

    ensure_stdio()
    _configure_frozen_logging()
    port = int(load_settings().get("enginePort", 9777))
    logger.info("Listening on 127.0.0.1:%s", port)
    try:
        # Pass app object — string import path breaks under PyInstaller.
        uvicorn.run(
            app,
            host="127.0.0.1",
            port=port,
            log_level="info",
            reload=False,
            access_log=False,
        )
    except Exception:
        logger.exception("Engine failed to start")
        raise


if __name__ == "__main__":
    main()
