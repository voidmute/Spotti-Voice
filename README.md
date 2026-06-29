<div align="center">
    <img width="200" src="./assets/spottivoice.png" alt="Спотти — голосовой помощник"/>
    <h1>Spotti Voice</h1>
    <p>
        <strong>Говори — текст в любом окне</strong><br/>
        Push-to-talk для Windows
    </p>
    <sub>При первом запуске Спотти проведёт короткое обучение на русском</sub>
</div>

<div align="center">
    <a href="https://github.com/voidmute/Spotti-Voice/releases/latest"><img src="https://img.shields.io/badge/Скачать-SpottiVoice--Setup.exe-5865F2?style=for-the-badge&logo=windows&logoColor=white" alt="Download"/></a>
    <a href="https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21"><img src="https://img.shields.io/badge/версия-v0.1.0.21-22c55e?style=for-the-badge" alt="Version"/></a>
    <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/Changelog-история%20релизов-fab387?style=for-the-badge" alt="Changelog"/></a>
    <br/>
    <a href="https://github.com/voidmute/Spotti-Voice/actions/workflows/ci.yml"><img src="https://img.shields.io/badge/CI-GitHub%20Actions-1C2325?style=for-the-badge&logo=githubactions&logoColor=white" alt="CI"/></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-eba0ac?style=for-the-badge" alt="MIT"/></a>
    <a href="SECURITY.md"><img src="https://img.shields.io/badge/Security-политика-f5c2e7?style=for-the-badge" alt="Security"/></a>
    <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/Contributing-гайд-cba6f7?style=for-the-badge" alt="Contributing"/></a>
    <br/>
    <a href="https://spottibot.duckdns.org"><img src="https://img.shields.io/badge/Cloud-Spotti%20Servers-5865F2?style=for-the-badge" alt="Spotti Servers"/></a>
</div>

---

## 🎙️ Что это

**Spotti Voice** — десктопный голосовой ввод для Windows. Зажми горячую клавишу, говори — распознанный текст вставляется в активное поле (Discord, браузер, IDE, блокнот).

| | |
|---|---|
| **Overlay** | Капсула над треем — статус записи |
| **Tray** | Быстрый доступ к настройкам и выходу |
| **Onboarding** | Один раз при первом старте — RPG-чат с пиксельным Спотти |
| **Установщик** | Один файл `SpottiVoice-Setup.exe` (~0.5 MB), остальное с сервера |

```javascript
const SpottiVoice = {
    platform: "Windows 10+",
    hotkey: { default: "Ctrl + Shift + Пробел", mode: "toggle PTT" },
    modes: {
        local: { network: "offline", language: "русский", engine: "whisper.cpp" },
        cloud: { network: "TLS", auth: "Discord OAuth", stt: "Spotti Servers" },
    },
    stack: {
        shell: ["Electron", "React", "anime.js"],
        engine: ["Python", "FastAPI", "sounddevice"],
        installer: ["NSIS thin bootstrap", "Electron setup wizard"],
    },
    security: {
        engineBind: "127.0.0.1:9777",
        electron: "contextIsolation + narrow preload",
        tokens: "Windows DPAPI",
    },
};
```

## ⚡ Режимы

| Режим | Сеть | Языки | Вход |
|-------|------|--------|------|
| **Локально** | Офлайн после модели (~142 MB) | Русский | Не нужен |
| **Облако** | TLS на Spotti Servers | Много (auto) | Discord |

```mermaid
flowchart LR
  subgraph pc [Ваш ПК]
    Pill[Pill overlay]
    Engine[Python engine :9777]
    Tray[Tray + Settings]
  end
  subgraph cloud [Spotti Servers]
    OAuth[Discord OAuth]
    STT[STT proxy]
  end
  Pill --> Engine
  Tray --> Engine
  Engine -->|Облако| OAuth
  Engine -->|audio| STT
  Engine -->|inject| Focus[Focused app]
```

---

## 📥 Установка

<details open>
<summary><h3>🚀 Быстрый старт (пользователи)</h3></summary>

1. Скачайте **`SpottiVoice-Setup.exe`** из [Releases](https://github.com/voidmute/Spotti-Voice/releases/latest).
2. Запустите установщик — мастер скачает приложение с сервера.
3. При **первом запуске** откроются настройки и обучение со Спотти (один раз).
4. **Облако:** переключатель вверху → **Аккаунт** → **Войти через Discord**.
5. **Локально:** при первом PTT скачается модель whisper.

| Шаг | Действие |
|-----|----------|
| Запись | **Ctrl+Shift+Пробел** (по умолчанию) — toggle PTT |
| Настройки | Иконка в трее → **Setup** |
| Горячая клавиша | Настройки → **Горячая клавиша** |

[![Download](https://img.shields.io/badge/⬇_SpottiVoice--Setup.exe-v0.1.0.21-5865F2?style=flat-square)](https://github.com/voidmute/Spotti-Voice/releases/download/v0.1.0.21/SpottiVoice-Setup.exe)

</details>

<details>
<summary><h3>🛠 Сборка из исходников</h3></summary>

**Требования:** Windows 10+, Python 3.11+, Node 20+, NSIS 3.x.

```bat
cd voice-pill
build-exe.bat
build-setup.bat
```

| Скрипт | Результат |
|--------|-----------|
| `build-exe.bat` | Portable payload в `dist/` |
| `build-setup.bat` | `dist-setup/SpottiVoice-Setup.exe` |

Разработка без установщика:

```bat
cd voice-pill
run.bat
```

Подробнее: [voice-pill/README.md](voice-pill/README.md) · [voice-pill/RELEASE.md](voice-pill/RELEASE.md)

</details>

<details>
<summary><h3>🔐 Безопасность</h3></summary>

- Движок слушает только **`127.0.0.1:9777`**
- Electron: **`contextIsolation: true`**, узкий preload-мост
- OAuth: `spotti-voice://auth/callback` (регистрирует установщик)

> [!CAUTION]
> Не коммитьте `.env`. См. [SECURITY.md](SECURITY.md)

</details>

<details>
<summary><h3>🧪 CI и тесты</h3></summary>

На каждый push/PR в `main`:

- Secret scan
- `pytest tests/voice_pill/`
- Сборка web UI

См. [`.github/workflows/ci.yml`](.github/workflows/ci.yml)

```powershell
pytest tests/voice_pill/ -q
```

</details>

---

## 🏗 Архитектура

```mermaid
sequenceDiagram
  participant User
  participant Electron
  participant Engine as voice_pill engine
  participant Server as Spotti API
  User->>Electron: PTT hotkey
  Electron->>Engine: HTTP localhost:9777
  alt Cloud mode
    Engine->>Server: STT + Bearer token
  else Local mode
    Engine->>Engine: whisper.cpp
  end
  Engine->>User: inject text
```

## 🔗 Связь с Spotti

| Репозиторий | Роль |
|-------------|------|
| **[Spotti-Voice](https://github.com/voidmute/Spotti-Voice)** (этот) | Публичный клиент + установщик |
| **[Spotti](https://github.com/voidmute/Spotti)** (приватный) | Сервер OAuth/STT, монорепо |

Экспорт из монорепо:

```powershell
.\scripts\migrate\export-voice-public.ps1 -OutDir ..\Spotti-Voice
```

---

<div align="center">

### 📊 Репозиторий

[![Spotti-Voice repo card](https://github-readme-stats.vercel.app/api/pin/?username=voidmute&repo=Spotti-Voice&theme=transparent&hide_border=true&title_color=5865F2)](https://github.com/voidmute/Spotti-Voice)

[![GitHub stars](https://img.shields.io/github/stars/voidmute/Spotti-Voice?style=social)](https://github.com/voidmute/Spotti-Voice/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/voidmute/Spotti-Voice?style=social)](https://github.com/voidmute/Spotti-Voice/network/members)
[![GitHub release](https://img.shields.io/github/v/release/voidmute/Spotti-Voice?label=latest&style=social)](https://github.com/voidmute/Spotti-Voice/releases)

<br/>

**[Скачать v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)** · [Changelog](CHANGELOG.md) · [Issues](https://github.com/voidmute/Spotti-Voice/issues)

<br/>

[MIT](LICENSE) · Spotti Voice © [voidmute](https://github.com/voidmute)

</div>
