# -*- mode: python ; coding: utf-8 -*-
# Build: build-engine.bat  ->  dist/Spotti Voice.exe

from pathlib import Path

block_cipher = None
voice_pill_root = Path(SPECPATH)
repo_root = voice_pill_root.parent

icon_path = voice_pill_root / "assets" / "app-icon.ico"

hiddenimports = [
    "uvicorn",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "fastapi",
    "starlette",
    "starlette.routing",
    "pydantic",
    "pydantic_core",
    "anyio",
    "httptools",
    "websockets",
    "watchfiles",
    "sounddevice",
    "keyboard",
    "audioop",
    "httpx",
    "httpcore",
    "dotenv",
    "win32clipboard",
    "pywintypes",
    "win32crypt",
    "uiautomation",
    "comtypes",
    "h11",
    "sniffio",
    "certifi",
    "idna",
]

excludes = [
    "torch",
    "torchvision",
    "torchaudio",
    "tensorflow",
    "sklearn",
    "scipy",
    "matplotlib",
    "gradio",
    "discord",
    "yt_dlp",
    "cv2",
    "numba",
    "sympy",
    "pandas",
    "spotti",
    "spotti_bot",
    "discord_bot",
    "tests",
    "pytest",
    "tkinter",
    "IPython",
    "jupyter",
    "notebook",
    "transformers",
    "diffusers",
    "librosa",
    "gevent",
    "onnxruntime",
    "sqlalchemy",
    "sklearn",
]

_BLOAT_MARKERS = (
    "torch",
    "tensorflow",
    "cudnn",
    "nvrtc",
    "cublas",
    "cufft",
    "curand",
    "cusolver",
    "cusparse",
    "transformers",
    "diffusers",
    "librosa",
    "sklearn",
    "pandas",
    "matplotlib",
    "opencv",
    "cv2",
    "numba",
    "llvmlite",
)


def _strip_bloat(items):
    out = []
    for item in items:
        name = (item[0] if isinstance(item, tuple) else str(item)).lower()
        if any(marker in name for marker in _BLOAT_MARKERS):
            continue
        out.append(item)
    return out


a = Analysis(
    [str(repo_root / "voice_pill" / "engine" / "__main__.py")],
    pathex=[str(repo_root)],
    binaries=[],
    datas=[],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

a.binaries = _strip_bloat(a.binaries)
a.datas = _strip_bloat(a.datas)
a.pure = _strip_bloat(a.pure)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="Spotti Voice",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    version=str(voice_pill_root / "assets" / "version_info.txt"),
    icon=str(icon_path) if icon_path.is_file() else None,
)
