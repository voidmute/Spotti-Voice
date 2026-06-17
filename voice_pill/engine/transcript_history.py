"""Persist recent speech transcripts for the settings history panel."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from voice_pill.engine.settings_store import settings_path

MAX_ENTRIES = 200


def _history_path() -> Path:
    return settings_path().parent / "transcript_history.json"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_raw() -> list[dict[str, Any]]:
    path = _history_path()
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(data, list):
        return []
    return [e for e in data if isinstance(e, dict) and e.get("id") and e.get("text")]


def _save_raw(entries: list[dict[str, Any]]) -> None:
    path = _history_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(entries[:MAX_ENTRIES], indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def list_entries() -> list[dict[str, Any]]:
    entries = _load_raw()
    entries.sort(key=lambda e: str(e.get("createdAt", "")), reverse=True)
    return entries


def add_entry(text: str, *, stt_mode: str, injected: bool) -> dict[str, Any]:
    cleaned = text.strip()
    if not cleaned:
        raise ValueError("empty transcript")
    entry = {
        "id": str(uuid.uuid4()),
        "text": cleaned,
        "createdAt": _now_iso(),
        "sttMode": stt_mode if stt_mode in ("cloud", "local") else "local",
        "injected": bool(injected),
    }
    entries = _load_raw()
    entries.insert(0, entry)
    _save_raw(entries)
    return entry


def update_entry(entry_id: str, text: str) -> dict[str, Any] | None:
    cleaned = text.strip()
    if not cleaned:
        return None
    entries = _load_raw()
    for item in entries:
        if item.get("id") == entry_id:
            item["text"] = cleaned
            item["updatedAt"] = _now_iso()
            _save_raw(entries)
            return item
    return None


def delete_entry(entry_id: str) -> bool:
    entries = _load_raw()
    next_entries = [e for e in entries if e.get("id") != entry_id]
    if len(next_entries) == len(entries):
        return False
    _save_raw(next_entries)
    return True


def clear_entries() -> None:
    _save_raw([])
