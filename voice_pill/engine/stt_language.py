"""STT language codes and mismatch checks for Spotti Voice."""

from __future__ import annotations

# ISO 639-1 codes in settings UI -> Whisper verbose_json `language` field names.
LANG_TO_WHISPER: dict[str, str] = {
    "en": "english",
    "ru": "russian",
    "es": "spanish",
    "it": "italian",
    "uk": "ukrainian",
    "de": "german",
    "fr": "french",
    "pt": "portuguese",
    "pl": "polish",
    "tr": "turkish",
    "zh": "chinese",
    "ja": "japanese",
    "ko": "korean",
}

WHISPER_TO_LANG: dict[str, str] = {name: code for code, name in LANG_TO_WHISPER.items()}


class LanguageMismatchError(Exception):
    """Raised when spoken language does not match the user-selected language."""


def normalize_requested_language(language: str | None) -> str:
    lang = (language or "auto").strip().lower()
    if not lang:
        return "auto"
    return lang


def whisper_language_matches(detected: str | None, expected_code: str) -> bool:
    """Return True if Whisper-detected language matches the user-selected ISO code."""
    expected = normalize_requested_language(expected_code)
    if expected == "auto":
        return True

    raw = (detected or "").strip().lower()
    if not raw:
        return True

    if raw == expected:
        return True

    expected_name = LANG_TO_WHISPER.get(expected)
    if expected_name and raw == expected_name:
        return True

    mapped = WHISPER_TO_LANG.get(raw)
    if mapped and mapped == expected:
        return True

    return False
