"""OAuth callback URL parsing."""

from __future__ import annotations

import pytest

from voice_pill.engine.cloud_auth import _parse_callback


def test_parse_spotti_voice_callback():
    code, state = _parse_callback("spotti-voice://auth/callback?code=abc&state=xyz")
    assert code == "abc"
    assert state == "xyz"


def test_parse_callback_missing_code():
    with pytest.raises(ValueError):
        _parse_callback("spotti-voice://auth/callback?state=only")
