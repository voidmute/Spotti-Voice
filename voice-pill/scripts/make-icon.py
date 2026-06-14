"""Convert assets/app-icon.png to assets/app-icon.ico for Windows exe branding."""

from __future__ import annotations

from pathlib import Path

from PIL import Image


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    png = root / "assets" / "app-icon.png"
    ico = root / "assets" / "app-icon.ico"
    if not png.is_file():
        raise SystemExit(f"Missing icon source: {png}")
    image = Image.open(png).convert("RGBA")
    sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    image.save(ico, format="ICO", sizes=sizes)
    print(f"Wrote {ico}")


if __name__ == "__main__":
    main()
