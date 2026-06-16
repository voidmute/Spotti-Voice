# Contributing to Spotti Voice

## Setup

```bat
cd voice-pill
pip install -r requirements.txt
cd web && npm install && npm run build
cd ..\electron && npm install
run.bat
```

## Tests

```bat
pytest tests/voice_pill/ -q
```

CI runs the same on Ubuntu (DPAPI test skips off Windows).

## Pull requests

- One logical change per PR (fix, feature, or docs).
- No `.env`, binaries in `dist/`, or `node_modules/`.
- Update [README.md](README.md) if user-facing behavior changes.
- Installer changes: bump [voice-pill/installer/VERSION](voice-pill/installer/VERSION) when shipping a release.

## Security

See [SECURITY.md](SECURITY.md). Report sensitive issues privately — do not open public issues with exploit details.

## Upstream

This repo is exported from the [Spotti](https://github.com/voidmute/Spotti) monorepo. Large API/server changes belong there first; client-only changes can land here directly.
