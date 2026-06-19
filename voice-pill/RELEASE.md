# Spotti Voice — release checklist

[![CI](https://github.com/voidmute/Spotti-Voice/actions/workflows/ci.yml/badge.svg)](https://github.com/voidmute/Spotti-Voice/actions/workflows/ci.yml)

## Build

```bat
cd voice-pill
build-exe.bat
build-setup.bat
```

Artifact: `voice-pill/dist-setup/SpottiVoice-Setup.exe` (thin bootstrap, under 20 MB)

Heavy assets ship separately to Server:

- `dist-setup/manifest.json`
- `dist-setup/setup-runtime.zip` (setup wizard + Electron runtime)
- `dist-setup/payload.zip` (app files)

Upload to Server after build:

```powershell
.\scripts\deploy\sync-voice-installer-assets.ps1
```

Public URL base: `https://spottibot.duckdns.org/downloads/voice/{version}/`

Legacy single-file installer (optional, ~400 MB):

```bat
cd voice-pill
build-setup.bat -BundleLegacy
```

Produces `dist-setup\SpottiVoice-Setup-legacy.exe`.

Compute SHA256:

```powershell
Get-FileHash "voice-pill\dist-setup\SpottiVoice-Setup.exe" -Algorithm SHA256
```

Also written to `dist-setup/SpottiVoice-Setup.sha256` by `build-setup.bat`.

## GitHub Release (public `Spotti-Voice` repo)

1. Export tree: `.\scripts\migrate\export-voice-public.ps1 -OutDir ..\Spotti-Voice`
2. Upload Server assets: `.\scripts\deploy\sync-voice-installer-assets.ps1`
3. Attach **`SpottiVoice-Setup.exe`** + **`SpottiVoice-Setup.sha256`**
4. Tag matches `voice-pill/installer/VERSION`

Users download the small exe; bootstrap fetches setup UI + app payload from Server.

## Windows SmartScreen

Unsigned or new builds trigger SmartScreen. **Permanent fix:** EV code signing certificate + `sign-release.ps1`.

Optional signing before `build-setup.bat`:

```powershell
$env:SPOTTI_CODESIGN_PFX = "C:\path\to\codesign.pfx"
$env:SPOTTI_CODESIGN_PASSWORD = "pfx-password"
```

Until signed: **Подробнее** → **Выполнить в любом случае** (More info → Run anyway).  
Unblock download: file **Properties** → **Unblock** if shown.

## Manual smoke (fresh VM)

- [ ] Run `SpottiVoice-Setup.exe` (single file) — wizard completes, shortcuts created
- [ ] Pill overlay visible; settings open from tray
- [ ] Local STT: download model → PTT → text injects to Notepad
- [ ] Cloud: Settings → Discord sign-in → PTT → transcript (Server logs user id, no key in client)
- [ ] Engine binds `127.0.0.1:9777` only
- [ ] Uninstall removes Start Menu; optional `%APPDATA%\SpottiVoice` cleanup
- [ ] `spotti-voice://auth/callback` completes OAuth when app running

## Server (private monorepo)

Deploy code only:

```powershell
.\scripts\deploy\sync-bot-to-vps.ps1
```

Env key names (user sets manually on Server):

- `VOICE_APP_ALLOWED_USER_IDS` — optional extra allowlist; if unset, any member of your Discord server may sign in
- `VOICE_APP_OAUTH_REDIRECT_URI` — default `spotti-voice://auth/callback`
- Discord OAuth redirect must include that URI in Discord Developer Portal

Verify routes (redacted):

```bash
curl -sS "https://spottibot.duckdns.org/api/health"
```

## Export public repo

```powershell
.\scripts\migrate\export-voice-public.ps1
```

Never ships: `spotti/`, `.env`, deploy scripts, checker artifacts.
