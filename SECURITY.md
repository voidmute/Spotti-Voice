# Security — Spotti Voice

## Threat model (summary)

Spotti Voice runs on the user's Windows machine with access to the focused window for text injection. Cloud mode sends short audio clips to the Spotti-hosted STT proxy over TLS after Discord OAuth.

## Local boundaries

| Surface | Binding | Notes |
|---------|---------|--------|
| STT engine HTTP API | `127.0.0.1:9777` | Not exposed to LAN |
| Electron OAuth callback (dev) | `127.0.0.1:9780` | Dev Electron only |
| Custom protocol (installed app) | `spotti-voice://auth/callback` | Registered by installer |

## Electron hardening

- `nodeIntegration: false`
- `contextIsolation: true`
- Preload exposes narrow IPC only (no raw `ipcRenderer` channels)

## Credentials

- OAuth tokens stored under `%APPDATA%\SpottiVoice\` encrypted with **Windows DPAPI**.
- No OpenAI or Anthropic keys in the client for cloud mode.

## What we do not guarantee

- Protection against malware already running on the PC (keyloggers, clipboard sniffers).
- AV false positives on PyInstaller/Electron builds — see [RELEASE.md](voice-pill/RELEASE.md) for signing notes.

## Reporting

Do not file public GitHub issues for unpatched auth bypass or RCE. Contact the maintainer through GitHub private security advisories if enabled, or a trusted channel you already use for Spotti.

## Server side

OAuth token issuance and STT proxy are implemented in the private [Spotti](https://github.com/voidmute/Spotti) API (`spotti/api/routes/voice_app.py`). Server vulnerabilities should be reported against that deployment, not only this client repo.
