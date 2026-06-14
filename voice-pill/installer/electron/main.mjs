import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn } from "node:child_process";
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

const setupConfig = loadSetupIni();
const PAYLOAD_DIR = process.env.SPOTTI_SETUP_PAYLOAD_DIR || setupConfig?.payloadDir || "";
const STATE_FILE = process.env.SPOTTI_SETUP_STATE_FILE || setupConfig?.stateFile || "";
const DEFAULT_DIR =
  process.env.SPOTTI_SETUP_DEFAULT_DIR ||
  setupConfig?.defaultDir ||
  path.join(process.env.ProgramFiles || "C:\\Program Files", "Spotti Voice");
const APP_VERSION = process.env.SPOTTI_SETUP_VERSION || setupConfig?.version || "3.0.0";

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

function bootstrapErrorMessage(code) {
  switch (String(code || "").trim()) {
    case "11":
      return "Пакет установки повреждён (код 11). Скачайте Spotti Voice-Setup.exe заново.";
    case "12":
      return "Не удалось распаковать окно установки (код 12). Скачайте установщик снова или добавьте его в исключения антивируса.";
    default:
      return "";
  }
}

async function resolveSetupDiagnostics() {
  const bootstrap = bootstrapErrorMessage(setupConfig?.bootstrapError);
  if (bootstrap) {
    setupLog(`bootstrap error ${setupConfig?.bootstrapError}`);
    return { ok: false, error: bootstrap, logPath: SETUP_LOG };
  }
  if (!PAYLOAD_DIR) {
    return {
      ok: false,
      error: "Не найден пакет установки. Запустите Spotti Voice-Setup.exe снова.",
      logPath: SETUP_LOG,
    };
  }
  if (!(await pathExists(PAYLOAD_DIR))) {
    setupLog(`payload dir missing on disk: ${PAYLOAD_DIR}`);
    return {
      ok: false,
      error: "Пакет установки не найден на диске. Запустите Spotti Voice-Setup.exe снова.",
      logPath: SETUP_LOG,
    };
  }
  const mainExe = path.join(PAYLOAD_DIR, "Spotti Voice.exe");
  if (!(await pathExists(mainExe))) {
    return {
      ok: false,
      error: "В пакете нет Spotti Voice.exe (код 11). Скачайте установщик заново.",
      logPath: SETUP_LOG,
    };
  }
  const stats = await countPayloadFiles(PAYLOAD_DIR);
  return {
    ok: true,
    version: APP_VERSION,
    defaultDir: DEFAULT_DIR,
    fileCount: stats.total,
    payloadBytes: stats.bytes,
    logPath: SETUP_LOG,
  };
}

function isTrustedSender(event) {
  return event.senderFrame === event.sender.mainFrame;
}

function uiIndexPath() {
  const built = path.join(__dirname, "web", "dist", "index.html");
  if (fs.existsSync(built)) return built;
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

  await sleep(900);
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
  const mainExe = path.join(normalized, "Spotti Voice.exe");
  if (!(await pathExists(mainExe))) {
    throw new Error("После копирования не найден Spotti Voice.exe. Повторите установку.");
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

function createWindow() {
  const indexPath = uiIndexPath();
  if (!indexPath) {
    setupLog("setup UI index.html missing");
    showFallbackErrorPage(
      "Интерфейс установки не найден (код 2). Скачайте Spotti Voice-Setup.exe заново.",
      2,
    );
    return;
  }

  mainWindow = new BrowserWindow({
    width: 720,
    height: 640,
    minWidth: 560,
    minHeight: 520,
    backgroundColor: "#f4f2ee",
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    title: "Spotti Voice",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  void mainWindow.loadFile(indexPath);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function showFallbackErrorPage(message, exitCode) {
  const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Spotti Voice</title>
<style>
  *{box-sizing:border-box} body{margin:0;font-family:Segoe UI,system-ui,sans-serif;background:#f4f2ee;color:#121218}
  .wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{max-width:520px;width:100%;background:#fff;border:1px solid #e6e2da;border-radius:14px;padding:24px;box-shadow:0 8px 28px rgba(18,18,24,.08)}
  h1{margin:0 0 12px;font-size:1.25rem} p{margin:0 0 16px;line-height:1.5;color:#4a4a56;font-size:.95rem}
  button{padding:10px 16px;border-radius:8px;border:1px solid #121218;background:#121218;color:#fff;font:inherit;cursor:pointer}
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
  if (!PAYLOAD_DIR || !(await pathExists(PAYLOAD_DIR))) {
    throw new Error("Пакет установки не найден. Запустите Spotti Voice-Setup.exe заново.");
  }
  const options =
    rawOptions && typeof rawOptions === "object"
      ? rawOptions
      : { installDir: DEFAULT_DIR, desktopShortcut: true, startMenuShortcut: true, launchAfter: true };
  const installDir = typeof options.installDir === "string" ? options.installDir.trim() : "";
  if (!installDir) {
    throw new Error("install_dir_required");
  }

  installCancelled = false;
  sendProgress({ phase: "prepare", installDir });

  try {
    await prepareInstallTarget(installDir);
    await copyPayload({ sourceDir: PAYLOAD_DIR, targetDir: installDir });
    await writeInstallState(installDir, options);
    await verifyInstallHandoff(installDir);
    installFinished = true;
    sendProgress({ phase: "done", installDir });

    if (options.launchAfter) {
      const exe = path.join(installDir, "Spotti Voice.exe");
      if (await pathExists(exe)) {
        spawn(exe, [], { detached: true, stdio: "ignore" }).unref();
      }
    }

    setTimeout(() => app.quit(0), 1800);
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
      const busyFile = err && typeof err === "object" && err.busyFile ? String(err.busyFile) : "";
      const hint = busyFile ? `\n\nФайл: ${busyFile}` : "";
      throw new Error(
        `Файлы заняты другим процессом. Закройте Spotti Voice и повторите установку.${hint}`,
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

app.whenReady().then(() => {
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit(installFinished ? 0 : 1);
});
