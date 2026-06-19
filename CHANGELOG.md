<div align="center">

# Changelog

**Spotti Voice** — история релизов установщика и приложения.

[![Latest](https://img.shields.io/badge/latest-v0.1.0.21-22c55e?style=flat-square)](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)
[![Releases](https://img.shields.io/badge/all%20releases-22-5865F2?style=flat-square)](https://github.com/voidmute/Spotti-Voice/releases)

[Скачать v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21) · [Releases](https://github.com/voidmute/Spotti-Voice/releases)

</div>

---

> **Актуальная версия:** [v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)  
> Все версии ниже **deprecated** — не используйте для новых установок.

| Версия | Статус | Кратко |
|--------|--------|--------|
| [v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21) | **Current** | Onboarding при первом запуске |
| v0.1.0.20 – v0.1.0.0 | Deprecated | Старые сборки bootstrap / UI |

<details>
<summary><strong>Почему теги v0.1.0.08 / v0.1.0.09 вместо v0.1.0.8 / v0.1.0.9?</strong></summary>

GitHub сортирует теги **как строки**, не как числа (`v0.1.0.9` &gt; `v0.1.0.18`). Релизы с патчем 0–9 переименованы в zero-padded теги (`v0.1.0.08`, `v0.1.0.09`, …), чтобы список шёл 21 → 20 → … → 10 → 09 → 08. Актуальная версия — по бейджу **Latest**.

</details>

---

## v0.1.0.21 · Current

[![Download](https://img.shields.io/badge/SpottiVoice--Setup.exe-download-5865F2?style=flat-square)](https://github.com/voidmute/Spotti-Voice/releases/download/v0.1.0.21/SpottiVoice-Setup.exe)

- **Onboarding** при первом запуске: пиксельный персонаж Спотти + RPG-чат на русском
- Обучение показывается один раз; настройки открываются автоматически только до завершения тура
- Маркер `onboarding-complete` на диске — повторно не предлагается

---

## v0.1.0.20 · Deprecated

> Не скачивайте — используйте [v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)

- **Spotti Voice Installer** (NSIS stub) закрывается после успешной установки — больше не висит в диспетчере задач
- Bootstrap: сначала завершает stub, purge кэша — detached (не блокирует выход)
- Setup wizard: inline cleanup + повтор через 2.5 с; NSIS safety-net kill после bootstrap

---

## v0.1.0.19 · Deprecated

> Не скачивайте — используйте [v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)

- После завершения установки **Spotti Voice Installer** больше не остаётся в диспетчере задач
- Bootstrap принудительно завершает `SpottiVoice-Setup.exe`, wscript и splash
- Мастер установки вызывает очистку bootstrap-процессов при любом успешном завершении

---

## v0.1.0.18 · Deprecated

> Не скачивайте — используйте [v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)

- Исправлено смещение белой дуги спиннера при вращении (Canvas + Viewbox)
- Убрана вспышка окна PowerShell — запуск splash через скрытый wscript
- `-NoLogo` для скрытого bootstrap PowerShell

---

## v0.1.0.17 · Deprecated

> Не скачивайте — используйте [v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)

- UAC: установщик и мастер setup снова запрашивают права администратора
- Спиннер: возврат к WPF (прозрачное кольцо по центру экрана)
- Setup exe: явный `asInvoker` / `requireAdministrator` в манифесте

---

## v0.1.0.16 · Deprecated

> Не скачивайте — используйте [v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)

- Спиннер: прозрачное WinForms-окно без рамки, double-buffer (без дрожания)
- Терминология: VPS → Server в документации и скриптах

---

## v0.1.0.15 · Deprecated

> Не скачивайте — используйте [v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)

- Спиннер: WinForms вместо HTA (мигающий курсор вместо анимации)
- Скрытие консольного caret в bootstrap
- Temp-relaunch только из папки Downloads (меньше лишних запусков)

---

## v0.1.0.14 · Deprecated

> Не скачивайте — используйте [v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)

- Замена HTA на WPF-спиннер (HTA показывал мигающий текстовый курсор)
- Splash сразу при старте bootstrap, не после загрузки manifest
- Установщик `asInvoker`; relaunch из temp только для Downloads

---

## v0.1.0.13 · Deprecated

> Не скачивайте — используйте [v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)

- Видимый mshta-спиннер (раньше window style 0 — только мигающий caret)
- Splash в начале bootstrap, не после fetch manifest

---

## v0.1.0.12 · Deprecated

> Не скачивайте — используйте [v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)

- Завершение installer/bootstrap-процессов при старте приложения
- Relaunch stub из `%TEMP%` (обход блокировки файла в Downloads)
- Хук опциональной подписи Authenticode (`sign-release.ps1`)
- Документация SmartScreen

---

## v0.1.0.11 · Deprecated

> Не скачивайте — используйте [v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)

- HTA + CSS `@keyframes` спиннер (вместо WPF ghost rings)
- `SINGLEINSTANCE` — один splash

---

## v0.1.0.10 · Deprecated

> Не скачивайте — используйте [v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)

- Очистка splash при старте/ошибке/выходе
- Автоудаление старых `installer-cache` версий
- Purge кэша текущей версии после успешной установки

---

## v0.1.0.9 · Deprecated

> Не скачивайте — используйте [v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)

- Анимированный loader при bootstrap
- `dismiss-installer-processes` — убийство зависших installer-процессов
- Синхронизация темы: settings ↔ tray ↔ встроенный браузер
- Полировка UI: titlebar drag, переходы страниц, theme toggle

---

## v0.1.0.8 · Deprecated

> Не скачивайте — используйте [v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)

- Тихий borderless loader при установке
- Titlebar / режим окна настроек
- anime.js для микро-анимаций
- Подгонка OAuth webview

---

## v0.1.0.7 · Deprecated

> Не скачивайте — используйте [v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)

- Borderless WPF loader
- Порядок вкладок настроек
- Тёмная тема
- OAuth webview fit

---

## v0.1.0.6 · Deprecated

> Не скачивайте — используйте [v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)

- Вкладка Account
- Тёмная тема, tray fix
- Borderless loader

---

## v0.1.0.5 · Deprecated

> Не скачивайте — используйте [v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)

- OAuth внутри окна приложения
- Упрощённая навигация settings
- Плоский UI
- Исправления STT

---

## v0.1.0.4 · Deprecated

> Не скачивайте — используйте [v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)

- Cloud UI
- Прогресс загрузки Whisper
- Tray в стиле FigJam
- Brand mark assets

---

## v0.1.0.3 · Deprecated

> Не скачивайте — используйте [v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)

- Перетаскиваемый topbar
- FigJam installer wizard
- Графический uninstall
- Автозагрузка Whisper model

---

## v0.1.0.2 · Deprecated

> Не скачивайте — используйте [v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)

- FigJam settings UI
- In-app OAuth
- Исправление persistence auth

---

## v0.1.0.1 · Deprecated

> Не скачивайте — используйте [v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)

- Stamp installer cache (SHA256 runtime)
- Settings UI v2
- Wizard UI polish

---

## v0.1.0.0 · Deprecated

> Не скачивайте — используйте [v0.1.0.21](https://github.com/voidmute/Spotti-Voice/releases/tag/v0.1.0.21)

- Первый публичный thin-bootstrap установщик
- Pill overlay, tray, local + cloud STT
- Thin `SpottiVoice-Setup.exe` + assets на Server
