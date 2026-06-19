import { app, BrowserWindow, dialog, ipcMain, nativeImage } from "electron";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
/** Real filesystem — Electron's patched fs treats .asar as virtual dirs and breaks copyFile. */
const ofs = require("original-fs");
const ofsp = ofs.promises;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_DATA = path.join(__dirname, ".user-data");
app.setPath("userData", USER_DATA);
app.setPath("cache", path.join(USER_DATA, "cache"));

function loadSetupIni() {
  const configPath = path.join(__dirname, "setup-config.ini");
  if (!fs.existsSync(configPath)) return null;
  const result = {};
  for (const line of fs.readFileSync(configPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (key) result[key] = val;
  }
  return Object.keys(result).length ? result : null;
}

const SETUP_LOG = path.join(process.env.TEMP || __dirname, "Spotti Voice-setup.log");

function setupLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.appendFileSync(SETUP_LOG, line, "utf8");
  } catch {
    /* ignore */
  }
}

/** Portable installer root — files sit beside SpottiVoice-Setup.exe. */
function installRootDir() {
  return path.dirname(process.execPath);
}

/** SFX / portable layout: payload.zip + state files live beside the setup exe. */
function resolveBundledPaths() {
  const extractRoot = installRootDir();
  return {
    payloadArchive: path.join(extractRoot, "payload.zip"),
    payloadDir: path.join(extractRoot, "payload"),
    stateFile: path.join(extractRoot, "install-state.json"),
    defaultDir: path.join(
      process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local"),
      "Spotti Voice",
    ),
  };
}

const bundledPaths = resolveBundledPaths();
const setupConfig = loadSetupIni();
const PAYLOAD_DIR =
  process.env.SPOTTI_SETUP_PAYLOAD_DIR || setupConfig?.payloadDir || bundledPaths.payloadDir;
const PAYLOAD_ARCHIVE =
  process.env.SPOTTI_SETUP_PAYLOAD_ARCHIVE ||
  setupConfig?.payloadArchive ||
  bundledPaths.payloadArchive;
const PAYLOAD_ARCHIVE_URL = setupConfig?.payloadArchiveUrl || "";
const PAYLOAD_ARCHIVE_SHA256 = setupConfig?.payloadArchiveSha256 || "";
const STATE_FILE =
  process.env.SPOTTI_SETUP_STATE_FILE || setupConfig?.stateFile || bundledPaths.stateFile;
const DEFAULT_DIR =
  process.env.SPOTTI_SETUP_DEFAULT_DIR || setupConfig?.defaultDir || bundledPaths.defaultDir;
const APP_VERSION = process.env.SPOTTI_SETUP_VERSION || setupConfig?.version || "3.0.0";

/** Branded UI shell — must stay in electron/dist beside icudtl.dat. */
function uiExePath(rootDir) {
  return path.join(
    rootDir,
    "electron",
    "node_modules",
    "electron",
    "dist",
    "Spotti Voice.exe",
  );
}

setupLog(`setup shell start cwd=${process.cwd()} payload=${PAYLOAD_DIR || "(empty)"}`);

/** @type {BrowserWindow | null} */
let mainWindow = null;
let installCancelled = false;
let installFinished = false;

function pluginStateDir() {
  if (STATE_FILE) return path.dirname(STATE_FILE);
  if (PAYLOAD_DIR) return path.dirname(PAYLOAD_DIR);
  return __dirname;
}

function resolvePayloadArchivePath() {
  if (PAYLOAD_ARCHIVE_URL) {
    return path.join(pluginStateDir(), "payload.zip");
  }
  return PAYLOAD_ARCHIVE;
}

function assertPortableRuntime() {
  const root = installRootDir();
  const required = ["icudtl.dat", "resources.pak"];
  const missing = required.filter((name) => !fs.existsSync(path.join(root, name)));
  if (missing.length === 0) return;

  setupLog(`runtime incomplete: missing ${missing.join(", ")} (root=${root})`);
  const detail = missing.join(", ");
  dialog.showErrorBox(
    "Spotti Voice — установка",
    `Не удалось запустить установщик (не хватает: ${detail}).\n\nПовторите установку или скачайте SpottiVoice-Setup.exe заново.`,
  );
  app.exit(11);
}

function bootstrapErrorMessage(code) {
  switch (String(code || "").trim()) {
    case "11":
      return "Установщик повреждён. Скачайте SpottiVoice-Setup.exe заново с официального релиза.";
    case "12":
      return "Не удалось открыть окно установки. Скачайте установщик снова или добавьте его в исключения антивируса.";
    default:
      return "";
  }
}

function readPayloadManifest() {
  const manifestPath = path.join(__dirname, "payload-manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    let raw = fs.readFileSync(manifestPath, "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    const parsed = JSON.parse(raw);
    return {
      version: typeof parsed.version === "string" ? parsed.version : APP_VERSION,
      fileCount: Number(parsed.fileCount) || 0,
      payloadBytes: Number(parsed.payloadBytes) || 0,
    };
  } catch (err) {
    setupLog(`manifest parse failed: ${err}`);
    return null;
  }
}

async function extractPayloadArchive(archivePath, destDir) {
  await ofsp.mkdir(destDir, { recursive: true });
  const ps = [
    "$ErrorActionPreference = 'Stop'",
    `Expand-Archive -LiteralPath ${quotePsPath(archivePath)} -DestinationPath ${quotePsPath(destDir)} -Force`,
  ].join("; ");
  await new Promise((resolve, reject) => {
    const child = spawn(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { windowsHide: true, stdio: "ignore" },
    );
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("extract_failed"));
    });
    child.on("error", reject);
  });
}

async function downloadPayloadArchive(url, destPath, expectedSha256) {
  setupLog(`downloading payload from ${url}`);
  sendProgress({ phase: "download", pct: 0, label: "Загружаем приложение…" });
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Не удалось загрузить приложение с сервера. Проверьте интернет.");
  }
  const total = Number(res.headers.get("content-length")) || 0;
  const hash = crypto.createHash("sha256");
  const tmp = `${destPath}.partial`;
  await ofsp.mkdir(path.dirname(destPath), { recursive: true });
  const file = ofs.createWriteStream(tmp);
  let received = 0;
  try {
    if (!res.body) {
      throw new Error("download_failed");
    }
    for await (const chunk of res.body) {
      if (installCancelled) {
        throw new Error("cancelled");
      }
      const buf = Buffer.from(chunk);
      hash.update(buf);
      received += buf.length;
      await new Promise((resolve, reject) => {
        file.write(buf, (err) => (err ? reject(err) : resolve()));
      });
      if (total > 0) {
        const pct = Math.min(100, Math.round((received / total) * 100));
        sendProgress({ phase: "download", pct, label: `Загружаем приложение… ${pct}%` });
      }
    }
  } finally {
    await new Promise((resolve) => file.end(resolve));
  }
  const digest = hash.digest("hex");
  if (expectedSha256 && digest.toLowerCase() !== expectedSha256.toLowerCase()) {
    await ofsp.unlink(tmp).catch(() => {});
    throw new Error("Файл приложения повреждён. Повторите установку позже.");
  }
  if (await pathExists(destPath)) {
    await ofsp.unlink(destPath);
  }
  await ofsp.rename(tmp, destPath);
  sendProgress({ phase: "download", pct: 100, label: "Загрузка завершена" });
}

async function ensurePayloadArchiveReady(archivePath) {
  if (await pathExists(archivePath)) {
    return archivePath;
  }
  if (PAYLOAD_ARCHIVE_URL) {
    await downloadPayloadArchive(PAYLOAD_ARCHIVE_URL, archivePath, PAYLOAD_ARCHIVE_SHA256);
    return archivePath;
  }
  return archivePath;
}

async function ensurePayloadExtracted() {
  const dest = PAYLOAD_DIR || path.join(path.dirname(resolvePayloadArchivePath() || __dirname), "payload");
  const mainExe = uiExePath(dest);
  if ((await pathExists(mainExe))) {
    return dest;
  }
  const archivePath = resolvePayloadArchivePath();
  await ensurePayloadArchiveReady(archivePath);
  if (!archivePath || !(await pathExists(archivePath))) {
    throw new Error("Пакет приложения не найден. Проверьте интернет и запустите установщик снова.");
  }
  setupLog(`extracting payload archive -> ${dest}`);
  sendProgress({ phase: "prepare", label: "Подготавливаем файлы…" });
  await extractPayloadArchive(archivePath, dest);
  if (!(await pathExists(mainExe))) {
    throw new Error("Не удалось распаковать приложение. Повторите установку.");
  }
  return dest;
}

async function resolveSetupDiagnostics() {
  const bootstrap = bootstrapErrorMessage(setupConfig?.bootstrapError);
  if (bootstrap) {
    setupLog(`bootstrap error ${setupConfig?.bootstrapError}`);
    return { ok: false, error: bootstrap, logPath: SETUP_LOG };
  }

  const manifest = readPayloadManifest();
  const version = manifest?.version || APP_VERSION;
  const fileCount = manifest?.fileCount ?? 0;
  const payloadBytes = manifest?.payloadBytes ?? 0;

  if (PAYLOAD_ARCHIVE_URL) {
    return {
      ok: true,
      version,
      defaultDir: DEFAULT_DIR,
      fileCount,
      payloadBytes,
    };
  }

  const archivePath = resolvePayloadArchivePath();
  if (archivePath && !(await pathExists(archivePath))) {
    setupLog(`payload archive missing: ${archivePath}`);
    return {
      ok: false,
      error: "Пакет приложения не найден. Запустите установщик Spotti Voice снова.",
      logPath: SETUP_LOG,
    };
  }

  if (!PAYLOAD_ARCHIVE) {
    if (!PAYLOAD_DIR) {
      return {
        ok: false,
        error: "Не найден пакет установки. Запустите установщик Spotti Voice снова.",
        logPath: SETUP_LOG,
      };
    }
    if (!(await pathExists(PAYLOAD_DIR))) {
      setupLog(`payload dir missing on disk: ${PAYLOAD_DIR}`);
      return {
        ok: false,
        error: "Пакет установки не найден. Запустите установщик Spotti Voice снова.",
        logPath: SETUP_LOG,
      };
    }
  }

  return {
    ok: true,
    version,
    defaultDir: DEFAULT_DIR,
    fileCount,
    payloadBytes,
  };
}

function isTrustedSender(event) {
  return event.senderFrame === event.sender.mainFrame;
}

function resolveSetupIcon() {
  const candidates = [
    path.join(__dirname, "assets", "app-icon.png"),
    path.join(installRootDir(), "assets", "app-icon.png"),
    path.join(__dirname, "web", "dist", "white-only.png"),
    path.join(installRootDir(), "web", "dist", "white-only.png"),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const image = nativeImage.createFromPath(candidate);
    if (!image.isEmpty()) return image;
  }
  return null;
}

function uiIndexPath() {
  const candidates = [__dirname, installRootDir()];
  for (const root of candidates) {
    const built = path.join(root, "web", "dist", "index.html");
    if (fs.existsSync(built)) return built;
  }
  return null;
}

function sendProgress(payload) {
  mainWindow?.webContents.send("setup:progress", payload);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function quotePsPath(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Stop app processes that lock files under installDir. Never kills setup Electron (lives under TEMP). */
async function prepareInstallTarget(installDir) {
  if (process.platform !== "win32") return;

  const kill = (args) =>
    new Promise((resolve) => {
      const child = spawn("taskkill", args, { windowsHide: true, stdio: "ignore" });
      child.on("close", () => resolve());
      child.on("error", () => resolve());
    });

  setupLog(`prepare install target: ${installDir}`);
  await kill(["/F", "/IM", "Spotti Voice.exe", "/T"]);
  await kill(["/F", "/IM", "Spotti Voice Engine.exe", "/T"]);

  const ps = [
    "$dir = " + quotePsPath(installDir),
    "Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" -ErrorAction SilentlyContinue |",
    "  Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($dir, 'OrdinalIgnoreCase') } |",
    "  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
  ].join(" ");
  await new Promise((resolve) => {
    const child = spawn(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { windowsHide: true, stdio: "ignore" },
    );
    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });

  await sleep(400);
}

async function copyFileWithRetry(src, dest, relPath) {
  const maxAttempts = 10;
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await ofsp.copyFile(src, dest);
      return;
    } catch (err) {
      lastErr = err;
      const code = err && typeof err === "object" ? err.code : "";
      if (code !== "EBUSY" && code !== "EPERM" && code !== "EACCES") {
        throw err;
      }
      setupLog(`copy retry ${attempt}/${maxAttempts} ${relPath} (${code})`);
      await sleep(350 + attempt * 150);
    }
  }
  const busy = lastErr && typeof lastErr === "object" ? lastErr : new Error("EBUSY");
  busy.busyFile = relPath;
  throw busy;
}

async function pathExists(target) {
  try {
    await ofsp.access(target);
    return true;
  } catch {
    return false;
  }
}

function dismissInstallerSiblings(installDir) {
  if (process.platform !== "win32") return;

  const inlinePs = [
    "Start-Sleep -Milliseconds 300",
    "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ForEach-Object {",
    "  $id = [int]$_.ProcessId",
    "  $name = [string]$_.Name",
    "  $cmd = [string]$_.CommandLine",
    "  if ($name -ieq 'SpottiVoice-Setup.exe') { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue; return }",
    "  if ($name -ieq 'wscript.exe' -and $cmd -match 'run-bootstrap-hidden|bootstrap-splash-launch') { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue; return }",
    "  if ($name -ieq 'powershell.exe' -and $cmd -match 'thin-bootstrap\\.ps1|bootstrap-splash\\.ps1|dismiss-installer-processes\\.ps1') { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue; return }",
    "}",
    "& taskkill.exe /F /IM SpottiVoice-Setup.exe 2>$null | Out-Null",
    "Remove-Item -LiteralPath (Join-Path $env:TEMP 'SpottiVoice\\stub\\SpottiVoice-Setup.exe') -Force -ErrorAction SilentlyContinue",
  ].join(" ");

  spawn(
    "powershell.exe",
    ["-NoProfile", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-Command", inlinePs],
    { detached: true, stdio: "ignore", windowsHide: true },
  ).unref();

  const script = path.join(installDir, "scripts", "dismiss-installer-processes.ps1");
  if (fs.existsSync(script)) {
    spawn(
      "powershell.exe",
      ["-NoProfile", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", script],
      { detached: true, stdio: "ignore", windowsHide: true },
    ).unref();
  }
}

async function countPayloadFiles(root) {
  let total = 0;
  let bytes = 0;
  async function walk(dir) {
    const entries = await ofsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        total += 1;
        const stat = await ofsp.stat(full);
        bytes += stat.size;
      }
    }
  }
  if (await pathExists(root)) {
    await walk(root);
  }
  return { total, bytes };
}

async function copyPayload({ sourceDir, targetDir }) {
  let copied = 0;
  let copiedBytes = 0;
  const { total, bytes } = await countPayloadFiles(sourceDir);
  /** @type {{ relPath: string; src: string; dest: string }[]} */
  const deferredExes = [];

  async function copyOne(relPath, src, dest) {
    await ofsp.mkdir(path.dirname(dest), { recursive: true });
    await copyFileWithRetry(src, dest, relPath);
    const stat = await ofsp.stat(src);
    copied += 1;
    copiedBytes += stat.size;
    sendProgress({
      phase: "copy",
      copied,
      total,
      copiedBytes,
      totalBytes: bytes,
      currentFile: relPath,
    });
  }

  async function walk(rel = "") {
    const current = path.join(sourceDir, rel);
    const entries = await ofsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (installCancelled) {
        throw new Error("cancelled");
      }
      const relPath = rel ? path.join(rel, entry.name) : entry.name;
      const src = path.join(sourceDir, relPath);
      const dest = path.join(targetDir, relPath);
      if (entry.isDirectory()) {
        await ofsp.mkdir(dest, { recursive: true });
        await walk(relPath);
      } else if (entry.isFile()) {
        if (entry.name.toLowerCase().endsWith(".exe")) {
          deferredExes.push({ relPath, src, dest });
        } else {
          await copyOne(relPath, src, dest);
        }
      }
    }
  }

  await ofsp.mkdir(targetDir, { recursive: true });
  await walk();
  for (const item of deferredExes) {
    if (installCancelled) {
      throw new Error("cancelled");
    }
    await copyOne(item.relPath, item.src, item.dest);
  }
  return { copied, bytes: copiedBytes };
}

async function writeInstallState(installDir, options) {
  const pluginDir = pluginStateDir();
  const normalized = installDir.replace(/\r?\n/g, "").trim();
  const installDirFile = path.join(pluginDir, "install-dir.txt");
  const flagsFile = path.join(pluginDir, "install-flags.json");
  const desktopFlag = path.join(pluginDir, "desktop-shortcut.flag");

  fs.writeFileSync(installDirFile, `${normalized}\r\n`, "utf8");
  if (!fs.existsSync(installDirFile)) {
    throw new Error("Не удалось сохранить папку установки для завершения.");
  }

  if (options.desktopShortcut) {
    fs.writeFileSync(desktopFlag, "", "utf8");
  } else if (fs.existsSync(desktopFlag)) {
    fs.unlinkSync(desktopFlag);
  }

  fs.writeFileSync(
    flagsFile,
    JSON.stringify(
      {
        desktopShortcut: Boolean(options.desktopShortcut),
        startMenuShortcut: options.startMenuShortcut !== false,
        launchAfter: Boolean(options.launchAfter),
      },
      null,
      2,
    ),
    "utf8",
  );

  const statePayload = {
    installDir: normalized,
    desktopShortcut: Boolean(options.desktopShortcut),
    startMenuShortcut: options.startMenuShortcut !== false,
    launchAfter: Boolean(options.launchAfter),
    version: APP_VERSION,
  };
  const statePath = STATE_FILE || path.join(pluginDir, "install-state.json");
  fs.writeFileSync(statePath, JSON.stringify(statePayload, null, 2), "utf8");
  setupLog(`install handoff: ${installDirFile} -> ${normalized}`);
}

async function verifyInstallHandoff(installDir) {
  const normalized = installDir.replace(/\r?\n/g, "").trim();
  const mainExe = uiExePath(normalized);
  if (!(await pathExists(mainExe))) {
    throw new Error("После копирования не найдено приложение. Повторите установку.");
  }
  const installDirFile = path.join(pluginStateDir(), "install-dir.txt");
  if (!fs.existsSync(installDirFile)) {
    throw new Error("Не удалось передать папку установки. Повторите установку.");
  }
  const written = fs.readFileSync(installDirFile, "utf8").trim();
  if (written !== normalized) {
    throw new Error("Сбой записи папки установки. Повторите установку.");
  }
}

async function finalizeInstall(installDir) {
  if (process.platform !== "win32") return;

  const finalizeScript = path.join(__dirname, "scripts", "finalize-install.ps1");
  if (!(await pathExists(finalizeScript))) {
    setupLog(`finalize-install.ps1 not found at ${finalizeScript} — skipping shortcuts/registry`);
    return;
  }

  setupLog(`finalizing install via ${finalizeScript}`);
  sendProgress({ phase: "finalize", label: "Завершаем установку…" });

  await new Promise((resolve, reject) => {
    let stderr = "";
    const child = spawn(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        finalizeScript,
        "-InstallDir",
        installDir,
        "-PluginStateDir",
        pluginStateDir(),
        "-Version",
        APP_VERSION,
      ],
      { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
    );
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else {
        if (stderr.trim()) setupLog(`finalize stderr: ${stderr.trim()}`);
        reject(new Error(`finalize_failed_${code}`));
      }
    });
    child.on("error", reject);
  });
}

function createWindow() {
  const indexPath = uiIndexPath();
  if (!indexPath) {
    setupLog("setup UI index.html missing");
    showFallbackErrorPage(
      "Интерфейс установки не найден. Скачайте установщик Spotti Voice заново.",
      2,
    );
    return;
  }

  const setupIcon = resolveSetupIcon();

  mainWindow = new BrowserWindow({
    width: 880,
    height: 640,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: "#f4f2ee",
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    title: "Spotti Voice — установка",
    icon: setupIcon ?? undefined,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
  });

  void mainWindow.loadFile(indexPath);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function showFallbackErrorPage(message, exitCode) {
  const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Spotti Voice</title>
<style>
  *{box-sizing:border-box} body{margin:0;font-family:"Segoe UI Variable",Segoe UI,system-ui,sans-serif;background:#12121a;color:oklch(0.94 0.008 278)}
  .wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{max-width:520px;width:100%;background:linear-gradient(165deg,oklch(0.19 0.02 278),oklch(0.155 0.016 278));border:1px solid oklch(0.98 0.01 278 / 0.13);border-radius:18px;padding:24px;box-shadow:0 16px 40px oklch(0.06 0.02 278 / 0.55)}
  h1{margin:0 0 12px;font-size:1.25rem} p{margin:0 0 16px;line-height:1.5;color:oklch(0.68 0.02 278);font-size:.95rem}
  button{padding:10px 18px;border-radius:12px;border:none;background:linear-gradient(135deg,oklch(0.68 0.21 276),oklch(0.52 0.18 290));color:#fff;font:inherit;font-weight:700;cursor:pointer}
</style></head><body><div class="wrap"><div class="card"><h1>Ошибка установки</h1><p>${message.replace(/</g, "&lt;")}</p>
<button type="button" onclick="window.close()">Закрыть</button></div></div></body></html>`;
  mainWindow = new BrowserWindow({
    width: 560,
    height: 420,
    backgroundColor: "#f4f2ee",
    autoHideMenuBar: true,
    title: "Spotti Voice",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  void mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  mainWindow.on("closed", () => {
    mainWindow = null;
    app.quit(exitCode);
  });
}

ipcMain.handle("setup:get-meta", async (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  return resolveSetupDiagnostics();
});

ipcMain.handle("setup:get-log-path", async (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  return SETUP_LOG;
});

ipcMain.handle("setup:pick-install-dir", async (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: "Папка установки Spotti Voice",
    defaultPath: DEFAULT_DIR,
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) {
    return { cancelled: true, path: null };
  }
  return { cancelled: false, path: result.filePaths[0] };
});

ipcMain.handle("setup:install", async (event, rawOptions) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  const payloadRoot = await ensurePayloadExtracted();
  const options =
    rawOptions && typeof rawOptions === "object"
      ? rawOptions
      : { installDir: DEFAULT_DIR, desktopShortcut: true, startMenuShortcut: true, launchAfter: true };
  const installDir = typeof options.installDir === "string" ? options.installDir.trim() : "";
  if (!installDir) {
    throw new Error("Укажите папку установки.");
  }

  installCancelled = false;
  sendProgress({ phase: "prepare", installDir });

  try {
    await prepareInstallTarget(installDir);
    await copyPayload({ sourceDir: payloadRoot, targetDir: installDir });
    await writeInstallState(installDir, options);
    await verifyInstallHandoff(installDir);
    await finalizeInstall(installDir);
    installFinished = true;
    sendProgress({ phase: "done", installDir });

    if (options.launchAfter) {
      const exe = uiExePath(installDir);
      const electronDir = path.join(installDir, "electron");
      if (await pathExists(exe)) {
        spawn(exe, [electronDir], { detached: true, stdio: "ignore" }).unref();
      }
    }

    dismissInstallerSiblings(installDir);

    setTimeout(() => {
      dismissInstallerSiblings(installDir);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close();
      }
      app.quit(0);
    }, 500);

    setTimeout(() => {
      dismissInstallerSiblings(installDir);
    }, 2500);
    return { ok: true, installDir };
  } catch (err) {
    if (String(err?.message || err) === "cancelled") {
      app.quit(1);
      return { ok: false, cancelled: true };
    }
    const code = err && typeof err === "object" ? err.code : "";
    if (code === "EACCES" || code === "EPERM") {
      throw new Error(
        "Нет прав на запись в выбранную папку. Выберите другую папку или запустите от имени администратора.",
      );
    }
    if (code === "ENOSPC") {
      throw new Error("Недостаточно места на диске для установки.");
    }
    if (code === "EBUSY") {
      throw new Error(
        "Файлы заняты другим процессом. Закройте Spotti Voice и повторите установку.",
      );
    }
    if (String(err?.message || err).startsWith("finalize_failed_")) {
      throw new Error(
        "Не удалось завершить установку (ярлыки и реестр). Повторите установку.",
      );
    }
    throw err;
  }
});

ipcMain.handle("setup:cancel", async (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  installCancelled = true;
  app.quit(1);
  return true;
});

ipcMain.handle("setup:window-minimize", (event) => {
  if (!isTrustedSender(event) || !mainWindow) return false;
  mainWindow.minimize();
  return true;
});

ipcMain.handle("setup:window-toggle-maximize", (event) => {
  if (!isTrustedSender(event) || !mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  return mainWindow.isMaximized();
});

ipcMain.handle("setup:window-close", (event) => {
  if (!isTrustedSender(event) || !mainWindow) return false;
  if (!installFinished) installCancelled = true;
  mainWindow.close();
  app.quit(installFinished ? 0 : 1);
  return true;
});

assertPortableRuntime();

app.whenReady().then(() => {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.spotti.voice.setup");
  }
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit(installFinished ? 0 : 1);
});
