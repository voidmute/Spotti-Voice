from voice_pill.engine.inject import inject_text


def test_inject_rejects_empty():
    assert inject_text("") is False
    assert inject_text("   ") is False
