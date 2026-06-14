"""Runtime fixes for PyInstaller windowed (no console) builds."""

from __future__ import annotations

import os
import sys


def ensure_stdio() -> None:
    """Uvicorn logging calls sys.stdout.isatty(); runw.exe leaves stdout/stderr as None."""
    devnull = open(os.devnull, "w", encoding="utf-8", errors="replace")
    if sys.stdout is None:
        sys.stdout = devnull  # type: ignore[assignment]
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w", encoding="utf-8", errors="replace")  # type: ignore[assignment]
