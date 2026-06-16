# Spotti Voice — release checklist

[![CI](https://img.shields.io/github/actions/workflow/status/voidmute/Spotti-Voice/ci.yml?branch=main&label=CI)](https://github.com/voidmute/Spotti-Voice/actions/workflows/ci.yml)

## Build

```bat
cd voice-pill
build-exe.bat
build-setup.bat
```

Artifact: `voice-pill/dist-setup/SpottiVoice-Setup.exe`

Compute SHA256:

```powershell
Get-FileHash "voice-pill\dist-setup\SpottiVoice-Setup.exe" -Algorithm SHA256
```

## GitHub Release (public `Spotti-Voice` repo)

1. Export tree: `.\scripts\migrate\export-voice-public.ps1 -OutDir ..\Spotti-Voice`
2. Attach `SpottiVoice-Setup.exe` + `SHA256SUMS.txt`
3. Tag matches `voice-pill/installer/VERSION`

## Manual smoke (fresh VM)

- [ ] Install `SpottiVoice-Setup.exe` — wizard completes, shortcuts created
- [ ] Pill overlay visible; settings open from tray
- [ ] Local STT: download model → PTT → text injects to Notepad
- [ ] Cloud: Settings → Discord sign-in → PTT → transcript (VPS logs user id, no key in client)
- [ ] Engine binds `127.0.0.1:9777` only
- [ ] Uninstall removes Start Menu; optional `%APPDATA%\SpottiVoice` cleanup
- [ ] `spotti-voice://auth/callback` completes OAuth when app running

## VPS (private monorepo)

Deploy code only:

```powershell
.\scripts\deploy\sync-bot-to-vps.ps1
```

Env key names (user sets manually on VPS):

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
