# Spotti Voice

Desktop speech-to-text overlay for Windows. Hold a hotkey, speak, and text is injected into the focused field.

## Install (end users)

1. Download **SpottiVoice-Setup.exe** from [GitHub Releases](https://github.com/voidmute/Spotti-Voice/releases).
2. Run the installer (no Python or Node required).
3. Open **Spotti Voice** from the Start menu.
4. For **Cloud** recognition: Settings → Облако → **Sign in with Discord** (Spotti account required).
5. For **Local** recognition: Settings → Локально → download the Whisper model on first use (~142 MB).

## Cloud vs local

| Mode | Network | Languages |
|------|---------|-----------|
| **Cloud** | Audio sent to Spotti-hosted STT proxy (TLS) | Many (auto or fixed) |
| **Local** | Offline after model download | Russian only |

Cloud mode does **not** use your OpenAI key. Authentication is Discord OAuth; tokens are stored encrypted with Windows DPAPI.

## Build from source (developers)

Requirements: Windows 10+, Python 3.11+, Node 18+, NSIS 3.x (for installer).

```bat
cd voice-pill
build-exe.bat
build-setup.bat
```

Output: `dist-setup\SpottiVoice-Setup.exe`

Dev run without installer:

```bat
cd voice-pill
run.bat
```

## Environment (dev only)

Copy `.env.example` to `voice-pill/.env`. Set `SPOTTI_VOICE_API_BASE` if testing against a staging API. Never commit `.env`.

## Security

- Engine listens on `127.0.0.1:9777` only.
- Electron uses `contextIsolation: true` and a narrow preload bridge.
- OAuth callback: `spotti-voice://auth/callback` (registered by installer).

## License

MIT — see [LICENSE](LICENSE).
