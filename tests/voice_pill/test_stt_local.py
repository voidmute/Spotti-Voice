"""Local whisper.cpp subprocess must decode UTF-8 stdout (Russian Windows cp1251 default breaks Cyrillic)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from voice_pill.engine.stt_local import transcribe_pcm


def test_whisper_stdout_decoded_as_utf8():
    phrase = "в виде сяду вовсе."
    stdout = phrase.encode("utf-8")

    proc = MagicMock()
    proc.returncode = 0
    proc.stdout = phrase
    proc.stderr = ""

    with (
        patch("voice_pill.engine.stt_local.whisper_cli_path", return_value=__import__("pathlib").Path("whisper.exe")),
        patch("voice_pill.engine.stt_local.model_path", return_value=__import__("pathlib").Path("model.bin")),
        patch("voice_pill.engine.stt_local.subprocess.run", return_value=proc) as run_mock,
        patch("voice_pill.engine.stt_local.wave.open"),
        patch("voice_pill.engine.stt_local.Path.unlink", create=True),
    ):
        text = transcribe_pcm(b"\x00" * 16000)

    assert text == phrase
    kwargs = run_mock.call_args.kwargs
    assert kwargs.get("encoding") == "utf-8"
    assert kwargs.get("errors") == "replace"
