from __future__ import annotations

import pytest

from voice_pill.engine.stt_language import (
    LanguageMismatchError,
    whisper_language_matches,
)


def test_whisper_language_matches_iso_and_name():
    assert whisper_language_matches("english", "en")
    assert whisper_language_matches("en", "en")
    assert whisper_language_matches("spanish", "es")
    assert whisper_language_matches("italian", "it")


def test_whisper_language_mismatch():
    assert not whisper_language_matches("russian", "en")
    assert not whisper_language_matches("spanish", "it")


def test_auto_always_matches():
    assert whisper_language_matches("russian", "auto")
    assert whisper_language_matches(None, "auto")


def test_language_mismatch_error_message():
    err = LanguageMismatchError("Incorrect Language")
    assert str(err) == "Incorrect Language"
