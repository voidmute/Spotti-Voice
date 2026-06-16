"""Sync white-only.png brand asset and build app-icon.ico for Windows exes."""

from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image


def resolve_source_png(voice_pill_root: Path) -> Path:
    repo_root = voice_pill_root.parent
    candidates = [
        repo_root / "white-only.png",
        voice_pill_root / "assets" / "app-icon.png",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise SystemExit(
        "Missing icon source. Place white-only.png at repo root or voice-pill/assets/app-icon.png"
    )


def sync_brand_png(source: Path, voice_pill_root: Path) -> None:
    targets = [
        voice_pill_root / "assets" / "app-icon.png",
        voice_pill_root / "web" / "public" / "white-only.png",
        voice_pill_root / "web" / "public" / "favicon.png",
        voice_pill_root / "installer" / "web" / "public" / "white-only.png",
        voice_pill_root / "installer" / "web" / "public" / "favicon.png",
    ]
    for target in targets:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        print(f"Synced {target.relative_to(voice_pill_root)}")


def build_ico_image(source: Image.Image, size: int) -> Image.Image:
    """White logo on dark pad — reads clearly in Task Manager at 16–32px."""
    canvas = Image.new("RGBA", (size, size), (18, 18, 24, 255))
    working = source.copy()
    working.thumbnail((size, size), Image.Resampling.LANCZOS)
    offset = ((size - working.width) // 2, (size - working.height) // 2)
    canvas.paste(working, offset, working)
    return canvas


def main() -> None:
    voice_pill_root = Path(__file__).resolve().parents[1]
    source = resolve_source_png(voice_pill_root)
    sync_brand_png(source, voice_pill_root)

    base = Image.open(source).convert("RGBA")
    ico = voice_pill_root / "assets" / "app-icon.ico"
    sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    frames = [build_ico_image(base, s[0]) for s in sizes]
    frames[0].save(ico, format="ICO", sizes=sizes, append_images=frames[1:])
    print(f"Wrote {ico}")


if __name__ == "__main__":
    main()
