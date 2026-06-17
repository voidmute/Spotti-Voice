from __future__ import annotations

from voice_pill.engine.transcript_history import (
    add_entry,
    delete_entry,
    list_entries,
    update_entry,
)


def test_transcript_history_crud(tmp_path, monkeypatch):
    monkeypatch.setenv("APPDATA", str(tmp_path))

    assert list_entries() == []

    first = add_entry("  hello world  ", stt_mode="cloud", injected=True)
    second = add_entry("second phrase", stt_mode="local", injected=False)

    entries = list_entries()
    assert len(entries) == 2
    assert entries[0]["id"] == second["id"]
    assert entries[0]["text"] == "second phrase"
    assert entries[1]["text"] == "hello world"
    assert entries[1]["sttMode"] == "cloud"
    assert entries[1]["injected"] is True

    updated = update_entry(first["id"], "edited text")
    assert updated is not None
    assert updated["text"] == "edited text"
    assert updated.get("updatedAt")

    assert delete_entry(second["id"]) is True
    assert delete_entry("missing-id") is False
    assert len(list_entries()) == 1
    assert list_entries()[0]["text"] == "edited text"
