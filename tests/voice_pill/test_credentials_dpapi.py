"""DPAPI credential round-trip (Windows only)."""

from __future__ import annotations

import sys

import pytest

from voice_pill.engine.credentials import clear_credentials, load_credentials, save_credentials


@pytest.mark.skipif(sys.platform != "win32", reason="DPAPI is Windows-only")
def test_credentials_dpapi_round_trip(tmp_path, monkeypatch):
    appdata = tmp_path / "AppData" / "Roaming"
    monkeypatch.setenv("APPDATA", str(appdata))

    payload = {
        "access_token": "access-test",
        "refresh_token": "refresh-test",
        "expires_at": 9999999999.0,
        "user": {"username": "tester"},
    }
    save_credentials(payload)
    loaded = load_credentials()
    assert loaded is not None
    assert loaded["access_token"] == "access-test"
    assert loaded["user"]["username"] == "tester"

    clear_credentials()
    assert load_credentials() is None
