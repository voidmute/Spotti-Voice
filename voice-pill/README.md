# Spotti Voice

Desktop STT overlay for Windows. Floating pill + tray Setup. Talk anywhere your cursor is focused.

## Requirements

- Windows 10/11
- Python 3.11+ (repo venv)
- Node.js 20+
- Microphone
- **Облако** mode: Spotti account (Discord sign-in in Settings). No OpenAI key in the client. Optional dev override: `SPOTTI_VOICE_API_BASE` in `voice-pill/.env` (see `scripts/migrate/spotti-voice-public/env.example`).

## Local STT (default)

Default mode is **local Russian** via whisper.cpp. First `.\run.bat` downloads:

- `whisper-cli.exe` → `%APPDATA%\SpottiVoice\whisper\`
- `ggml-base.bin` model (multilingual, forced `-l ru`)

Manual install:

```powershell
cd voice-pill
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\fetch-whisper.ps1
```

## Install

```powershell
cd "voice-pill"
pip install -r requirements.txt
cd web
npm install
npm run build
cd ..\electron
npm install
```

## Run

From `voice-pill/` (PowerShell must use `.\` prefix):

```powershell
cd voice-pill
.\run.bat
```

`run.bat` builds the web UI if needed, starts Electron, and Electron starts the STT engine (single process, no duplicate spawn).

### Branded engine exe (ESET / antivirus shows Spotti Voice, not Python)

```powershell
cd voice-pill
.\build-engine.bat
```

Produces `voice-pill/dist/Spotti Voice.exe` with app icon and Windows version metadata. Electron prefers this exe over `python -m voice_pill.engine.server`. Re-run `.\run.bat` after building.

### Full desktop bundle + installer (zero dev deps for end users)

```powershell
cd voice-pill
.\build-exe.bat
.\build-setup.bat
```

Output: `dist-setup\SpottiVoice-Setup.exe`. See [RELEASE.md](RELEASE.md) for smoke checklist and GitHub release steps.

Public repo export: `..\scripts\migrate\export-voice-public.ps1` from monorepo root.

Tray → **Setup** opens settings. **Left-click** tray icon opens Setup. **Right-click** tray opens the custom menu (**Show pill**, **Setup**, **Quit**).

### Before re-run

Quit Spotti Voice from the tray (**Quit**) before starting again. A second instance causes cache lock errors (`Unable to move the cache`, access denied `0x5`) and can block push-to-talk registration.

If the tray icon is gone but errors persist, end stale `electron.exe` processes tied to `voice-pill\electron` (Task Manager) and run `.\run.bat` again.

Or manually:

```powershell
cd voice-pill\web
npm run build
cd ..\electron
npm start
```

Engine only (debug):

```powershell
python -m voice_pill.engine.server
```

## Use

1. Focus any text field (Discord, browser, IDE).
2. Press **Ctrl+Shift+Space** once to start listening, again to stop and inject (toggle PTT in M1). Default hotkey is shown in Tray → **Setup**.
3. Tray → **Setup** for mode, language, injection method, and hotkey hint.
4. **Test inject** writes `Spotti Voice test ` into the focused field.

If Electron cannot register the global shortcut (another app holds it, or a zombie instance is running), Spotti Voice falls back to an engine-side hotkey on Windows. Check the terminal for `Engine PTT hotkey fallback enabled`.

### Overlay shape (Windows)

The floating pill uses Electron `setShape` (HRGN clip) by default on Windows so DWM does not paint white in the rectangular HWND corners outside the capsule. Edges may look slightly pixelated — that is normal.

Set `USE_OVERLAY_SET_SHAPE=false` before launch only if you prefer smoother CSS `border-radius` edges and can accept white corner bleed on the transparent window.

## Modes

| Mode | Backend |
|------|---------|
| Local (default) | whisper.cpp, Russian only (`-l ru`) |
| Cloud | Spotti VPS STT proxy + Discord sign-in (no user API key) |

Local files live in `%APPDATA%\SpottiVoice\whisper\`. `run.bat` installs them automatically.

## Tests

```powershell
pytest tests/voice_pill/ -q
```
