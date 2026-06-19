# Changelog — Spotti Voice

Все версии по порядку (новые сверху). Скачивание: [Releases](https://github.com/voidmute/Spotti-Voice/releases).

---

## v0.1.0.19

- После завершения установки **Spotti Voice Installer** больше не остаётся в диспетчере задач
- Bootstrap принудительно завершает `SpottiVoice-Setup.exe`, wscript и splash
- Мастер установки вызывает очистку bootstrap-процессов при любом успешном завершении

## v0.1.0.18

- Исправлено смещение белой дуги спиннера при вращении (Canvas + Viewbox)
- Убрана вспышка окна PowerShell — запуск splash через скрытый wscript
- `-NoLogo` для скрытого bootstrap PowerShell

## v0.1.0.17

- UAC: установщик и мастер setup снова запрашивают права администратора
- Спиннер: возврат к WPF (прозрачное кольцо по центру экрана)
- Setup exe: явный `asInvoker` / `requireAdministrator` в манифесте

## v0.1.0.16

- Спиннер: прозрачное WinForms-окно без рамки, double-buffer (без дрожания)
- Терминология: VPS → Server в документации и скриптах

## v0.1.0.15

- Спиннер: WinForms вместо HTA (мигающий курсор вместо анимации)
- Скрытие консольного caret в bootstrap
- Temp-relaunch только из папки Downloads (меньше лишних запусков)

## v0.1.0.14

- Замена HTA на WPF-спиннер (HTA показывал мигающий текстовый курсор)
- Splash сразу при старте bootstrap, не после загрузки manifest
- Установщик `asInvoker`; relaunch из temp только для Downloads

## v0.1.0.13

- Видимый mshta-спиннер (раньше window style 0 — только мигающий caret)
- Splash в начале bootstrap, не после fetch manifest

## v0.1.0.12

- Завершение installer/bootstrap-процессов при старте приложения
- Relaunch stub из `%TEMP%` (обход блокировки файла в Downloads)
- Хук опциональной подписи Authenticode (`sign-release.ps1`)
- Документация SmartScreen

## v0.1.0.11

- HTA + CSS `@keyframes` спиннер (вместо WPF ghost rings)
- `SINGLEINSTANCE` — один splash

## v0.1.0.10

- Очистка splash при старте/ошибке/выходе
- Автоудаление старых `installer-cache` версий
- Purge кэша текущей версии после успешной установки

## v0.1.0.9

- Анимированный loader при bootstrap
- `dismiss-installer-processes` — убийство зависших installer-процессов
- Синхронизация темы: settings ↔ tray ↔ встроенный браузер
- Полировка UI: titlebar drag, переходы страниц, theme toggle

## v0.1.0.8

- Тихий borderless loader при установке
- Titlebar / режим окна настроек
- anime.js для микро-анимаций
- Подгонка OAuth webview

## v0.1.0.7

- Borderless WPF loader
- Порядок вкладок настроек
- Тёмная тема
- OAuth webview fit

## v0.1.0.6

> **Deprecated** — используйте v0.1.0.7+

- Вкладка Account
- Тёмная тема, tray fix
- Borderless loader

## v0.1.0.5

- OAuth внутри окна приложения
- Упрощённая навигация settings
- Плоский UI
- Исправления STT

## v0.1.0.4

- Cloud UI
- Прогресс загрузки Whisper
- Tray в стиле FigJam
- Brand mark assets

## v0.1.0.3

- Перетаскиваемый topbar
- FigJam installer wizard
- Графический uninstall
- Автозагрузка Whisper model

## v0.1.0.2

- FigJam settings UI
- In-app OAuth
- Исправление persistence auth

## v0.1.0.1

- Stamp installer cache (SHA256 runtime)
- Settings UI v2
- Wizard UI polish

## v0.1.0.0

- Первый публичный thin-bootstrap установщик
- Pill overlay, tray, local + cloud STT
- Thin `SpottiVoice-Setup.exe` + assets на Server
