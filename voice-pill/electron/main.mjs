import {
  app,
  BrowserWindow,
  Tray,
  nativeImage,
  ipcMain,
  globalShortcut,
  screen,
  dialog,
} from "electron";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { startWinGlobalPttPoll } from "./winGlobalPtt.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

/** Dev: .user-data beside electron when writable. Installed Program Files: %APPDATA%\\SpottiVoice\\ui. */
function resolveUserDataDir() {
  const portable = path.join(__dirname, ".user-data");
  try {
    fs.mkdirSync(portable, { recursive: true });
    const probe = path.join(portable, ".write-probe");
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return portable;
  } catch {
    const appData =
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "SpottiVoice", "ui");
  }
}

const USER_DATA = resolveUserDataDir();
fs.mkdirSync(USER_DATA, { recursive: true });
app.setPath("userData", USER_DATA);
app.setPath("cache", path.join(USER_DATA, "cache"));
if (typeof app.setName === "function") {
  app.setName("Spotti Voice");
}

const uninstallMode = process.argv.some((entry) => entry === "--uninstall");

const gotSingleInstanceLock = uninstallMode || app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

/** Reduce DWM compositing glitches on fully-transparent HWND fringe pixels. */
if (process.platform === "win32") {
  app.commandLine.appendSwitch(
    "disable-features",
    "CalculateNativeWinOcclusion",
  );
  app.setAppUserModelId("Spotti.Voice");
}

function oauthCallbackFromArgv(argv) {
  if (!Array.isArray(argv)) return null;
  return (
    argv.find(
      (entry) =>
        typeof entry === "string" && entry.toLowerCase().startsWith("spotti-voice://"),
    ) ?? null
  );
}

const LOCAL_OAUTH_HOST = "127.0.0.1";
const LOCAL_OAUTH_PORT = 9780;
const LOCAL_OAUTH_PATH = "/auth/callback";
/** @type {import("node:http").Server | null} */
let activeOAuthServer = null;

function stopOAuthCallbackServer() {
  if (!activeOAuthServer) return;
  try {
    activeOAuthServer.close();
  } catch {
    /* ignore */
  }
  activeOAuthServer = null;
}

function startOAuthCallbackServer(timeoutMs = 300000) {
  stopOAuthCallbackServer();
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const pathOnly = (req.url ?? "").split("?")[0];
      if (pathOnly !== LOCAL_OAUTH_PATH) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      const callbackUrl = `http://${LOCAL_OAUTH_HOST}:${LOCAL_OAUTH_PORT}${req.url}`;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Spotti Voice</title></head><body style="font-family:system-ui,sans-serif;padding:2rem;text-align:center"><p>Вход выполнен. Закройте вкладку и вернитесь в Spotti Voice.</p></body></html>',
      );
      clearTimeout(timer);
      stopOAuthCallbackServer();
      resolve(callbackUrl);
    });

    const timer = setTimeout(() => {
      stopOAuthCallbackServer();
      reject(new Error("oauth_timeout"));
    }, timeoutMs);

    server.on("error", (err) => {
      clearTimeout(timer);
      stopOAuthCallbackServer();
      reject(err);
    });

    server.listen(LOCAL_OAUTH_PORT, LOCAL_OAUTH_HOST, () => {
      activeOAuthServer = server;
    });
  });
}

async function finishOAuthCallback(url) {
  try {
    const res = await fetch(`${ENGINE_BASE}/api/cloud/auth/finish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_url: url }),
    });
    if (!res.ok) {
      console.error("OAuth finish HTTP", res.status);
      return false;
    }
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send("voice:cloud-auth-changed");
    }
    return true;
  } catch (err) {
    console.error("OAuth finish failed", err);
    return false;
  }
}

async function warmCloudSession() {
  try {
    await fetch(`${ENGINE_BASE}/api/cloud/auth/warm`, { method: "POST" });
  } catch {
    /* engine may still be starting */
  }
}

function isOAuthCallbackUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "spotti-voice:" && parsed.hostname === "auth") return true;
    if (
      (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") &&
      parsed.port === "9780" &&
      parsed.pathname === "/auth/callback"
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** @type {BrowserWindow | null} */
let oauthLoginWindow = null;

function closeOAuthLoginWindow() {
  if (!oauthLoginWindow || oauthLoginWindow.isDestroyed()) {
    oauthLoginWindow = null;
    return;
  }
  oauthLoginWindow.close();
  oauthLoginWindow = null;
}

/**
 * Discord OAuth inside the app (not system browser).
 * Intercepts loopback / custom-scheme redirect and returns callback URL.
 */
function openOAuthLoginWindow(authorizeUrl, parentWin) {
  closeOAuthLoginWindow();
  return new Promise((resolve, reject) => {
    const parent =
      parentWin && !parentWin.isDestroyed()
        ? parentWin
        : settingsWindow && !settingsWindow.isDestroyed()
          ? settingsWindow
          : null;

    const win = new BrowserWindow({
      width: 500,
      height: 760,
      parent: parent ?? undefined,
      modal: Boolean(parent),
      show: false,
      autoHideMenuBar: true,
      title: "Вход через Discord - Spotti",
      backgroundColor: "#f4f2ee",
      icon: getAppIcons().window,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    oauthLoginWindow = win;

    let settled = false;
    const finish = (callbackUrl) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      closeOAuthLoginWindow();
      resolve(callbackUrl);
    };
    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      closeOAuthLoginWindow();
      reject(err);
    };

    const timer = setTimeout(() => fail(new Error("oauth_timeout")), 300000);

    const onNavigate = (event, url) => {
      if (!isOAuthCallbackUrl(url)) return;
      event.preventDefault();
      finish(url);
    };

    win.webContents.on("will-redirect", onNavigate);
    win.webContents.on("will-navigate", onNavigate);

    win.on("closed", () => {
      oauthLoginWindow = null;
      if (!settled) fail(new Error("oauth_cancelled"));
    });

    win.once("ready-to-show", () => {
      if (!win.isDestroyed()) win.show();
    });

    win.loadURL(authorizeUrl).catch((err) => fail(err));
  });
}

async function beginCloudAuth() {
  try {
    const health = await waitForEngine(32);
    if (!health) {
      return { ok: false, error: "engine_offline" };
    }

    const res = await fetch(`${ENGINE_BASE}/api/cloud/auth/begin`, { method: "POST" });
    if (!res.ok) {
      let detail = "begin_failed";
      try {
        const body = await res.json();
        if (body?.detail) {
          detail = typeof body.detail === "string" ? body.detail : String(body.detail);
        }
      } catch {
        /* ignore */
      }
      return { ok: false, error: detail };
    }
    const data = await res.json();
    const url = data?.authorize_url;
    if (!url || typeof url !== "string") {
      return { ok: false, error: "oauth_start_failed" };
    }
    return { ok: true, authorizeUrl: url };
  } catch (err) {
    console.error("cloud auth begin failed", err);
    return { ok: false, error: "engine_offline" };
  }
}

async function startCloudSignIn() {
  return beginCloudAuth();
}

/** Windows needs execPath + electron app dir or URL becomes argv[1] app path. */
function registerSpottiVoiceProtocol() {
  if (process.platform !== "win32") {
    app.setAsDefaultProtocolClient("spotti-voice");
    return;
  }
  const electronAppDir = path.resolve(__dirname);
  app.setAsDefaultProtocolClient("spotti-voice", process.execPath, [
    electronAppDir,
  ]);
}

registerSpottiVoiceProtocol();

const ENGINE_PORT = 9777;
const ENGINE_BASE = `http://127.0.0.1:${ENGINE_PORT}`;
/**
 * Win32 HRGN clip — removes rectangular HWND corners (DWM white fringe).
 * Default on win32. Set USE_OVERLAY_SET_SHAPE=false for CSS border-radius only
 * (smoother edges, may show white corner bleed on transparent HWND).
 */
const USE_OVERLAY_SET_SHAPE =
  process.platform === "win32"
    ? process.env.USE_OVERLAY_SET_SHAPE !== "false"
    : process.env.USE_OVERLAY_SET_SHAPE === "true";
const PTT_FALLBACK_ACCELERATORS = [
  "Control+Shift+Space",
  "Control+Alt+V",
  "Control+Shift+V",
];

/** @type {BrowserWindow | null} */
let overlayWindow = null;
/** @type {BrowserWindow | null} */
let settingsWindow = null;
/** @type {BrowserWindow | null} */
let uninstallWindow = null;
/** @type {Tray | null} */
let tray = null;
/** @type {BrowserWindow | null} */
let trayMenuWindow = null;
let currentUiTheme = "light";
/** @type {{ tray: Electron.NativeImage; window: Electron.NativeImage; path: string } | null} */
let appIcons = null;

const TRAY_MENU_WIDTH = 220;
/** Fallback until renderer reports measured menu height. */
const TRAY_MENU_HEIGHT = 188;
const TRAY_MENU_CORNER_RADIUS = 12;
const VK_RBUTTON = 0x02;
/** @type {((vk: number) => number) | null} */
let getAsyncKeyState = null;
/** @type {ReturnType<typeof setInterval> | null} */
let trayMenuReleasePoll = null;
/** @type {import("node:child_process").ChildProcess | null} */
let engineProc = null;
let engineShuttingDown = false;
/** @type {ReturnType<typeof setInterval> | null} */
let engineWatchdogTimer = null;
/** @type {(() => number) | null} */
let getForegroundWindow = null;
/** @type {(() => number) | null} */
let getGuiThreadFocusHwnd = null;
let pttHeld = false;
/** @type {string | null} */
let registeredPttAccelerator = null;
/** @type {{ stop: () => void } | null} */
let winGlobalPttPoll = null;

const SETTINGS_SAVE_DEBOUNCE_MS = 400;
/** @type {ReturnType<typeof setTimeout> | null} */
let pillPositionSaveTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let settingsWindowSaveTimer = null;

async function fetchEngineSettings() {
  try {
    const res = await fetch(`${ENGINE_BASE}/api/settings`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function patchEngineSettings(patch) {
  try {
    const res = await fetch(`${ENGINE_BASE}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function clampOverlayPosition(x, y, width, height) {
  const display = screen.getDisplayNearestPoint({ x, y });
  const area = display.workArea;
  const clampedX = Math.max(area.x, Math.min(x, area.x + area.width - width));
  const clampedY = Math.max(area.y, Math.min(y, area.y + area.height - height));
  return { x: Math.round(clampedX), y: Math.round(clampedY) };
}

function schedulePillPositionSave(x, y) {
  if (pillPositionSaveTimer) clearTimeout(pillPositionSaveTimer);
  pillPositionSaveTimer = setTimeout(() => {
    pillPositionSaveTimer = null;
    void patchEngineSettings({ pill: { x: Math.round(x), y: Math.round(y) } });
  }, SETTINGS_SAVE_DEBOUNCE_MS);
}

function persistSettingsWindowState(open) {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    if (!open) {
      void patchEngineSettings({ settingsWindow: { open: false } });
    }
    return;
  }
  const bounds = settingsWindow.getBounds();
  void patchEngineSettings({
    settingsWindow: {
      open,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    },
  });
}

function scheduleSettingsWindowSave(open) {
  if (settingsWindowSaveTimer) clearTimeout(settingsWindowSaveTimer);
  settingsWindowSaveTimer = setTimeout(() => {
    settingsWindowSaveTimer = null;
    persistSettingsWindowState(open);
  }, SETTINGS_SAVE_DEBOUNCE_MS);
}

function isTrustedSender(event) {
  return event.senderFrame === event.sender.mainFrame;
}

function settingsHotkeyToAccelerator(hotkey) {
  return hotkey
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("+");
}

async function waitForEngine(maxAttempts = 40) {
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      const res = await fetch(`${ENGINE_BASE}/api/health`);
      if (res.ok) return await res.json();
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

/** Mic stream init is deferred after /api/health — wait before enabling PTT. */
async function waitForEngineAudio(maxAttempts = 40) {
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      const res = await fetch(`${ENGINE_BASE}/api/health`);
      if (res.ok) {
        const health = await res.json();
        if (health?.audio) return health;
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

const ENGINE_EXE_NAMES = ["Spotti Voice Engine.exe", "SpottiVoice.exe"];

function engineExeSearchDirs() {
  const execDir = path.dirname(process.execPath);
  /** UI exe lives in electron/dist — walk up to app electron folder, then install/repo root. */
  const uiExeAppRoot = path.normalize(
    path.join(execDir, "..", "..", "..", ".."),
  );
  /** @type {string[]} */
  const dirs = [
    ROOT,
    path.join(ROOT, "dist"),
    path.join(__dirname, ".."),
    path.join(__dirname, "..", "dist"),
    path.join(execDir, "dist"),
    path.join(execDir, "..", "dist"),
    uiExeAppRoot,
    path.join(uiExeAppRoot, "dist"),
  ];
  if (process.resourcesPath) {
    dirs.push(
      path.join(process.resourcesPath, "dist"),
      path.join(process.resourcesPath, "engine"),
      process.resourcesPath,
    );
  }
  return [...new Set(dirs.map((d) => path.normalize(d)))];
}

function resolveEngineExePath() {
  for (const dir of engineExeSearchDirs()) {
    for (const name of ENGINE_EXE_NAMES) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function getEngineLogPath() {
  const appData =
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const logDir = path.join(appData, "SpottiVoice");
  fs.mkdirSync(logDir, { recursive: true });
  return path.join(logDir, "engine.log");
}

/** Repo root .env (Spotti Bot/.env) — engine reads via SPOTTI_VOICE_ENV_FILE. */
function repoRootEnvPath() {
  return path.normalize(path.join(ROOT, "..", ".env"));
}

function notifyEngineMissing(searchedDirs) {
  const hint =
    "Run voice-pill\\build-engine.bat, then restart Spotti Voice.";
  const detail = searchedDirs.length
    ? `Searched:\n${searchedDirs.map((d) => `  ${d}`).join("\n")}`
    : hint;
  console.error(`Spotti Voice Engine.exe not found. ${hint}\n${detail}`);
  dialog.showErrorBox(
    "Spotti Voice — engine missing",
    `Spotti Voice Engine.exe was not found.\n\n${hint}\n\n${detail}`,
  );
  if (tray && typeof tray.displayBalloon === "function") {
    tray.displayBalloon({
      title: "Spotti Voice",
      content: `Engine exe missing. ${hint}`,
    });
  }
}

function spawnEngineProcess(command, args, options) {
  const logPath = getEngineLogPath();
  const stamp = new Date().toISOString();
  fs.appendFileSync(logPath, `\n--- ${stamp} spawn ${command} ---\n`);
  const logFd = fs.openSync(logPath, "a");
  engineProc = spawn(command, args, {
    ...options,
    env: {
      ...process.env,
      ...options.env,
      SPOTTI_VOICE_ELECTRON: "1",
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8",
      ...(fs.existsSync(repoRootEnvPath())
        ? { SPOTTI_VOICE_ENV_FILE: repoRootEnvPath() }
        : {}),
    },
    stdio: ["ignore", "ignore", logFd],
  });
  engineProc.on("exit", (code, signal) => {
    fs.appendFileSync(
      logPath,
      `--- exit code=${code ?? "null"} signal=${signal ?? "null"} ---\n`,
    );
    try {
      fs.closeSync(logFd);
    } catch {
      // already closed
    }
    engineProc = null;
    if (!engineShuttingDown) {
      setTimeout(() => spawnEngine(), 1500);
    }
  });
  engineProc.on("error", (err) => {
    fs.appendFileSync(logPath, `--- spawn error: ${err.message} ---\n`);
  });
}

async function isEngineReachable() {
  try {
    const res = await fetch(`${ENGINE_BASE}/api/health`, {
      signal: AbortSignal.timeout(2500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function startEngineWatchdog() {
  if (engineWatchdogTimer) return;
  engineWatchdogTimer = setInterval(async () => {
    if (engineShuttingDown) return;
    const health = await waitForEngine(1);
    if (!health && !engineProc) {
      spawnEngine();
    }
  }, 8000);
}

function spawnEngine() {
  if (engineProc) return;
  void isEngineReachable().then((alreadyUp) => {
    if (alreadyUp) {
      console.info("Engine already listening on", ENGINE_BASE);
      return;
    }
    spawnEngineNow();
  });
}

function spawnEngineNow() {
  if (engineProc) return;
  const bundled = resolveEngineExePath();
  if (bundled) {
    console.info(`Starting engine: ${bundled}`);
    spawnEngineProcess(bundled, [], {
      cwd: path.dirname(bundled),
      windowsHide: true,
    });
    return;
  }

  const allowPythonFallback =
    process.env.SPOTTI_VOICE_DEV === "1" || process.platform !== "win32";
  if (!allowPythonFallback) {
    notifyEngineMissing(engineExeSearchDirs());
    return;
  }

  console.warn(
    "Spotti Voice Engine.exe not found — SPOTTI_VOICE_DEV=1 python fallback.",
  );
  const repoRoot = path.join(ROOT, "..");
  const py = process.platform === "win32" ? "python" : "python3";
  spawnEngineProcess(py, ["-m", "voice_pill.engine.server"], {
    cwd: repoRoot,
    windowsHide: true,
  });
}

function resolveAppIconPath() {
  const candidates = [
    path.join(ROOT, "assets", "app-icon.png"),
    path.join(ROOT, "web", "dist", "white-only.png"),
    path.join(ROOT, "web", "public", "white-only.png"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function buildTrayIcon(source) {
  if (source.isEmpty()) return source;

  const { width: w, height: h } = source.getSize();
  if (w < 8 || h < 8) return source;

  // Zoom rabbit into tray slot — source PNG has heavy margin so icon reads tiny.
  const inset = Math.round(Math.min(w, h) * 0.28);
  const cropW = Math.max(1, w - inset * 2);
  const cropH = Math.max(1, h - inset * 2);
  const cropped = source.crop({
    x: inset,
    y: inset,
    width: cropW,
    height: cropH,
  });

  const traySize = process.platform === "win32" ? 256 : 22;
  return cropped.resize({ width: traySize, height: traySize, quality: "best" });
}

function loadAppIcons() {
  const iconPath = resolveAppIconPath();
  if (!iconPath) {
    const fallback = nativeImage.createFromDataURL(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    );
    return { tray: fallback, window: fallback, path: "" };
  }

  const source = nativeImage.createFromPath(iconPath);
  if (source.isEmpty()) {
    const fallback = nativeImage.createFromDataURL(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    );
    return { tray: fallback, window: fallback, path: iconPath };
  }

  const windowSize = 512;
  return {
    tray: buildTrayIcon(source),
    window: source.resize({ width: windowSize, height: windowSize, quality: "best" }),
    path: iconPath,
  };
}

function getAppIcons() {
  if (!appIcons) {
    appIcons = loadAppIcons();
  }
  return appIcons;
}

function distPage(name) {
  const built = path.join(ROOT, "web", "dist", name);
  if (fs.existsSync(built)) {
    return pathToFileURL(built).href;
  }
  return null;
}

function overlayUrl() {
  return distPage("overlay.html") ?? "http://127.0.0.1:5174/overlay.html";
}

function settingsUrl() {
  const href = distPage("index.html");
  if (!href) return "http://127.0.0.1:5174/";
  let bust = "";
  try {
    const versionFile = path.join(ROOT, "install-version.txt");
    if (fs.existsSync(versionFile)) {
      const v = fs.readFileSync(versionFile, "utf8").trim();
      if (v) bust = `?v=${encodeURIComponent(v)}`;
    }
  } catch {
    /* ignore */
  }
  return `${href}${bust}`;
}

function uninstallUrl() {
  const href = distPage("uninstall.html");
  if (!href) return "http://127.0.0.1:5174/uninstall.html";
  return href;
}

function resolveFetchWhisperScript() {
  const candidates = [
    path.join(ROOT, "scripts", "fetch-whisper.ps1"),
    path.join(__dirname, "..", "scripts", "fetch-whisper.ps1"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function ensureWhisperCppInstalled() {
  if (process.platform !== "win32" || uninstallMode) return;
  const script = resolveFetchWhisperScript();
  if (!script) return;
  try {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", script],
      { detached: true, stdio: "ignore", windowsHide: true },
    );
    child.unref();
  } catch (err) {
    console.warn("whisper.cpp bootstrap failed", err);
  }
}

function attachLoadDiagnostics(win, label) {
  win.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error(`[${label}] did-fail-load`, code, description, url);
  });
  win.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) console.error(`[${label}]`, message);
  });
}

function pinOverlayOnTop(win) {
  if (!win || win.isDestroyed()) return;
  const level = process.platform === "win32" ? "screen-saver" : "floating";
  win.setAlwaysOnTop(true, level);
}

function applyOverlayWindowChrome(win) {
  if (!win || win.isDestroyed()) return;
  win.setBackgroundColor("#00000000");
  if (process.platform === "win32" && typeof win.setBackgroundMaterial === "function") {
    try {
      win.setBackgroundMaterial("none");
    } catch {
      // older Windows builds may reject material changes
    }
  }
}

/**
 * Continuous-y left inset for rounded-rect (float, no rounding).
 * yCoord is vertical position from top (0..h); used for subpixel sampling.
 * @param {number} yCoord
 * @param {number} r corner radius
 * @param {number} h rect height
 * @returns {number}
 */
function roundedRectLeftEdgeAtY(yCoord, r, h) {
  if (yCoord >= r && yCoord <= h - r) return 0;
  if (yCoord < r) {
    const dy = r - yCoord;
    const disc = r * r - dy * dy;
    if (disc <= 0) return 0;
    return r - Math.sqrt(disc);
  }
  const dy = yCoord - (h - r);
  const disc = r * r - dy * dy;
  if (disc <= 0) return 0;
  return r - Math.sqrt(disc);
}

/**
 * Per-scanline pill HRGN with vertical subpixel sampling for smoother cap curves.
 * Averages left-edge samples within each row, then rounds (vs binary ceil).
 * @param {number} width
 * @param {number} height
 * @param {number} [radius]
 * @param {number} [samples] vertical subsamples per scanline (4–8 typical)
 * @returns {{ x: number, y: number, width: number, height: number }[]}
 */
function roundedRectShapeSupersampled(width, height, radius, samples = 4) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const r = Math.min(
    Math.max(0, Math.round(radius ?? h / 2)),
    Math.floor(w / 2),
    Math.floor(h / 2),
  );
  const n = Math.max(1, Math.round(samples));

  if (r <= 0) {
    return [{ x: 0, y: 0, width: w, height: h }];
  }

  /** @type {{ x: number, y: number, width: number, height: number }[]} */
  const rects = [];
  for (let y = 0; y < h; y += 1) {
    let leftSum = 0;
    for (let s = 0; s < n; s += 1) {
      const yCoord = y + (s + 0.5) / n;
      leftSum += roundedRectLeftEdgeAtY(yCoord, r, h);
    }
    const xLeft = Math.round(leftSum / n);
    const span = Math.max(0, w - 2 * xLeft);
    if (span > 0) {
      rects.push({ x: xLeft, y, width: span, height: 1 });
    }
  }

  return rects.length > 0 ? rects : [{ x: 0, y: 0, width: w, height: h }];
}

/**
 * Per-scanline pill HRGN — one rect per row for smooth curves (no band-merge aliasing).
 * Radius defaults to height/2 (capsule); clamped to w/2 and h/2.
 * @param {number} width
 * @param {number} height
 * @param {number} [radius]
 * @returns {{ x: number, y: number, width: number, height: number }[]}
 */
function roundedRectShape(width, height, radius) {
  return roundedRectShapeSupersampled(width, height, radius, 16);
}

/**
 * Pill HRGN inset inside HWND client — 1px halo band clipped so DWM fringe never shows.
 * @param {number} width client width
 * @param {number} height client height
 * @param {number} [inset]
 */
function pillShapeInset(width, height, inset = 1) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const insetPx = Math.max(0, Math.round(inset));
  const innerW = w - insetPx * 2;
  const innerH = h - insetPx * 2;
  if (innerW < 1 || innerH < 1 || insetPx === 0) {
    return roundedRectShape(w, h, h / 2);
  }
  const r = innerH / 2;
  return roundedRectShape(innerW, innerH, r).map((rect) => ({
    x: rect.x + insetPx,
    y: rect.y + insetPx,
    width: rect.width,
    height: rect.height,
  }));
}

function overlayDisplayScale(win) {
  if (!win || win.isDestroyed()) return 1;
  try {
    const display = screen.getDisplayMatching(win.getBounds());
    return display.scaleFactor || 1;
  } catch {
    return 1;
  }
}

/** Snap DIP size to physical pixel grid for crisp HWND clip + CSS alignment. */
function snapOverlayDimension(value, scale) {
  const n = Math.max(1, Number(value) || 1);
  if (scale <= 1) return Math.round(n);
  return Math.round(Math.round(n * scale) / scale);
}

function overlayWindowShape(width, height) {
  return pillShapeInset(width, height, 0);
}

const OVERLAY_PILL_HEIGHT = 48;
/** Pill content width from first layout — error state must not widen the HWND. */
let overlayPillWidth = 0;
const OVERLAY_PILL_MIN_WIDTH = 143;
const OVERLAY_PILL_MAX_WIDTH = 168;

function applyOverlayWindowShape(win, width, height, _options = {}) {
  if (!win || win.isDestroyed()) return;
  const scale = overlayDisplayScale(win);
  const w = snapOverlayDimension(width, scale);
  const h = snapOverlayDimension(height, scale);
  applyOverlayWindowChrome(win);
  if (!USE_OVERLAY_SET_SHAPE || typeof win.setShape !== "function") return;
  try {
    // One stadium for full HWND — error strip lives inside the expanded pill, not a separate bubble.
    win.setShape(overlayWindowShape(w, h));
  } catch (err) {
    console.warn("[overlay] setShape failed", err);
  }
}

function scheduleOverlayWindowShape(win, width, height, options = {}) {
  if (!win || win.isDestroyed()) return;
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  setTimeout(() => {
    if (win && !win.isDestroyed()) {
      applyOverlayWindowShape(win, w, h, options);
    }
  }, 0);
}

function resizeOverlayToContent(width, height) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return false;
  const scale = overlayDisplayScale(overlayWindow);
  const rawW = Math.max(1, Math.ceil(width));
  const rawH = Math.max(1, Math.ceil(height));
  if (
    rawH <= OVERLAY_PILL_HEIGHT + 1 &&
    rawW >= OVERLAY_PILL_MIN_WIDTH &&
    rawW <= OVERLAY_PILL_MAX_WIDTH
  ) {
    overlayPillWidth = rawW;
  }
  const w = snapOverlayDimension(
    overlayPillWidth > 0
      ? overlayPillWidth
      : Math.max(OVERLAY_PILL_MIN_WIDTH, Math.min(rawW, OVERLAY_PILL_MAX_WIDTH)),
    scale,
  );
  // Ceil so HWND is never smaller than painted pill — avoids 0-alpha fringe at corners.
  const h = snapOverlayDimension(rawH, scale);
  const [contentW, contentH] = overlayWindow.getContentSize();
  if (Math.abs(contentW - w) <= 1 && Math.abs(contentH - h) <= 1) {
    applyOverlayWindowShape(overlayWindow, w, h);
    return true;
  }
  const bounds = overlayWindow.getBounds();
  const centerX = bounds.x + bounds.width / 2;
  const newX = snapOverlayDimension(centerX - w / 2, scale);
  const bottom = bounds.y + bounds.height;
  const newY = snapOverlayDimension(bottom - h, scale);
  overlayWindow.setBounds({
    x: newX,
    y: newY,
    width: w,
    height: h,
  });
  applyOverlayWindowChrome(overlayWindow);
  applyOverlayWindowShape(overlayWindow, w, h);
  scheduleOverlayWindowShape(overlayWindow, w, h);
  return true;
}

function showOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    void createOverlay().then(() => showOverlay());
    return;
  }
  pinOverlayOnTop(overlayWindow);
  overlayWindow.show();
  void patchEngineSettings({ pill: { visible: true } });
}

function hideTrayMenu() {
  if (!trayMenuWindow || trayMenuWindow.isDestroyed()) return;
  trayMenuWindow.hide();
}

async function initTrayMouseReleaseDetection() {
  if (process.platform !== "win32") return;
  try {
    const koffi = (await import("koffi")).default;
    const user32 = koffi.load("user32.dll");
    getAsyncKeyState = user32.func("short __stdcall GetAsyncKeyState(int vKey)");
    getForegroundWindow = user32.func("uintptr __stdcall GetForegroundWindow()");

    const RECT = koffi.struct("RECT", {
      left: "int32",
      top: "int32",
      right: "int32",
      bottom: "int32",
    });
    const GUITHREADINFO = koffi.struct("GUITHREADINFO", {
      cbSize: "uint32",
      flags: "uint32",
      hwndActive: "uintptr",
      hwndFocus: "uintptr",
      hwndCapture: "uintptr",
      hwndMenuOwner: "uintptr",
      hwndMoveSize: "uintptr",
      hwndCaret: "uintptr",
      rcCaret: RECT,
    });
    const GetGUIThreadInfo = user32.func(
      "bool __stdcall GetGUIThreadInfo(uint32 idThread, GUITHREADINFO *pgui)",
    );
    getGuiThreadFocusHwnd = () => {
      const info = {
        cbSize: koffi.sizeof(GUITHREADINFO),
        flags: 0,
        hwndActive: 0,
        hwndFocus: 0,
        hwndCapture: 0,
        hwndMenuOwner: 0,
        hwndMoveSize: 0,
        hwndCaret: 0,
        rcCaret: { left: 0, top: 0, right: 0, bottom: 0 },
      };
      if (!GetGUIThreadInfo(0, info)) return 0;
      return Number(info.hwndFocus) || 0;
    };
  } catch (error) {
    console.warn("Tray right-click release detection disabled:", error);
  }
}

function isRightMouseButtonDown() {
  if (!getAsyncKeyState) return false;
  return (getAsyncKeyState(VK_RBUTTON) & 0x8000) !== 0;
}

function clearTrayMenuReleaseWait() {
  if (trayMenuReleasePoll === null) return;
  clearInterval(trayMenuReleasePoll);
  trayMenuReleasePoll = null;
}

/** Windows tray fires right-click on press — wait for button up before opening menu. */
function showTrayMenuOnRightClickRelease() {
  clearTrayMenuReleaseWait();

  if (process.platform !== "win32" || !getAsyncKeyState) {
    showTrayMenu();
    return;
  }

  trayMenuReleasePoll = setInterval(() => {
    if (!isRightMouseButtonDown()) {
      clearTrayMenuReleaseWait();
      showTrayMenu();
    }
  }, 16);
}

function applyTrayMenuWindowShape(win, width, height) {
  if (!win || win.isDestroyed()) return;
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  applyOverlayWindowChrome(win);
  if (typeof win.setShape !== "function") return;
  try {
    const r = Math.min(TRAY_MENU_CORNER_RADIUS, Math.floor(w / 2), Math.floor(h / 2));
    win.setShape(roundedRectShape(w, h, r));
  } catch (err) {
    console.warn("[tray-menu] setShape failed", err);
  }
}

function pushTrayMenuTheme(theme) {
  if (!trayMenuWindow || trayMenuWindow.isDestroyed()) return;
  const dark = theme === "dark";
  const logo = dark ? "white-only.png" : "brand-mark.png";
  void trayMenuWindow.webContents
    .executeJavaScript(
      `(() => {
        document.documentElement.setAttribute("data-theme", ${JSON.stringify(theme)});
        const img = document.querySelector(".menu-header img");
        if (img) img.src = "../web/dist/${logo}";
      })();`,
      true,
    )
    .catch(() => {});
}

function applyUiTheme(theme) {
  if (theme !== "light" && theme !== "dark") return;
  currentUiTheme = theme;
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.setBackgroundColor(theme === "dark" ? "#0c0c0d" : "#f4f2ee");
  }
  pushTrayMenuTheme(theme);
}

function playTrayMenuEntrance(win) {
  if (!win || win.isDestroyed()) return;
  void win.webContents
    .executeJavaScript(
      `(() => {
        const menu = document.querySelector(".menu");
        if (!menu) return;
        menu.classList.remove("is-shown");
        void menu.offsetWidth;
        menu.classList.add("is-shown");
      })();`,
      true,
    )
    .catch(() => {});
}

function positionTrayMenuWindow() {
  if (!trayMenuWindow || trayMenuWindow.isDestroyed() || !tray) return;

  const trayBounds = tray.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: trayBounds.x + Math.floor(trayBounds.width / 2),
    y: trayBounds.y + Math.floor(trayBounds.height / 2),
  });
  const { workArea } = display;
  const bounds = trayMenuWindow.getBounds();
  const menuW = bounds.width || TRAY_MENU_WIDTH;
  const menuH = bounds.height || TRAY_MENU_HEIGHT;

  let x =
    trayBounds.x +
    Math.floor(trayBounds.width / 2) -
    Math.floor(menuW / 2);
  let y = trayBounds.y - menuH - 8;

  if (y < workArea.y) {
    y = trayBounds.y + trayBounds.height + 8;
  }

  x = Math.max(
    workArea.x + 8,
    Math.min(x, workArea.x + workArea.width - menuW - 8),
  );
  y = Math.max(
    workArea.y + 8,
    Math.min(y, workArea.y + workArea.height - menuH - 8),
  );

  trayMenuWindow.setBounds({
    x: Math.round(x),
    y: Math.round(y),
    width: menuW,
    height: menuH,
  });
}

function resizeTrayMenuToContent(width, height) {
  if (!trayMenuWindow || trayMenuWindow.isDestroyed()) return;
  const w = Math.min(320, Math.max(180, Math.round(width)));
  const h = Math.min(420, Math.max(120, Math.round(height)));
  trayMenuWindow.setBounds({
    ...trayMenuWindow.getBounds(),
    width: w,
    height: h,
  });
  applyTrayMenuWindowShape(trayMenuWindow, w, h);
  positionTrayMenuWindow();
  pinOverlayOnTop(trayMenuWindow);
  if (!trayMenuWindow.isVisible()) {
    playTrayMenuEntrance(trayMenuWindow);
    trayMenuWindow.show();
    trayMenuWindow.focus();
    pinOverlayOnTop(trayMenuWindow);
  }
}

function revealTrayMenu() {
  if (!trayMenuWindow || trayMenuWindow.isDestroyed()) return;
  positionTrayMenuWindow();
  const [w, h] = trayMenuWindow.getContentSize();
  applyTrayMenuWindowShape(trayMenuWindow, w, h);
  pinOverlayOnTop(trayMenuWindow);
  pushTrayMenuTheme(currentUiTheme);
  playTrayMenuEntrance(trayMenuWindow);
  trayMenuWindow.show();
  trayMenuWindow.focus();
  pinOverlayOnTop(trayMenuWindow);
}

function showTrayMenu() {
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
    revealTrayMenu();
    return;
  }
  trayMenuWindow = new BrowserWindow({
    width: TRAY_MENU_WIDTH,
    height: TRAY_MENU_HEIGHT,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    hasShadow: false,
    paintWhenInitiallyHidden: true,
    ...(process.platform === "win32" ? { thickFrame: false, roundedCorners: false } : {}),
    type: process.platform === "win32" ? "toolbar" : "popup",
    webPreferences: {
      preload: path.join(__dirname, "tray-menu-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundColor: "#00000000",
    },
  });

  applyOverlayWindowChrome(trayMenuWindow);

  attachLoadDiagnostics(trayMenuWindow, "tray-menu");
  trayMenuWindow.loadFile(path.join(__dirname, "tray-menu.html"));
  trayMenuWindow.once("ready-to-show", () => {
    positionTrayMenuWindow();
    const [w, h] = trayMenuWindow?.getContentSize() ?? [TRAY_MENU_WIDTH, TRAY_MENU_HEIGHT];
    applyTrayMenuWindowShape(trayMenuWindow, w, h);
    pushTrayMenuTheme(currentUiTheme);
  });
  trayMenuWindow.on("show", () => pinOverlayOnTop(trayMenuWindow));
  trayMenuWindow.on("focus", () => pinOverlayOnTop(trayMenuWindow));
  trayMenuWindow.on("blur", () => hideTrayMenu());
  trayMenuWindow.on("closed", () => {
    trayMenuWindow = null;
  });
}

async function createOverlay(engineSettings = null) {
  const settings = engineSettings ?? (await fetchEngineSettings());
  const pill = settings?.pill ?? {};
  const { width: workW } = screen.getPrimaryDisplay().workAreaSize;
  const pillWidth = 143;
  const pillHeight = 48;
  overlayPillWidth = pillWidth;
  let x =
    typeof pill.x === "number"
      ? Math.round(pill.x)
      : Math.floor(workW / 2 - pillWidth / 2);
  let y = typeof pill.y === "number" ? Math.round(pill.y) : 24;
  ({ x, y } = clampOverlayPosition(x, y, pillWidth, pillHeight));
  const showOnReady = pill.visible !== false;
  const icons = getAppIcons();
  overlayWindow = new BrowserWindow({
    width: pillWidth,
    height: pillHeight,
    icon: icons.window,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    title: "",
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    roundedCorners: false,
    show: false,
    paintWhenInitiallyHidden: true,
    ...(process.platform === "win32" ? { thickFrame: false } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundColor: "#00000000",
      zoomFactor: 1,
    },
  });
  overlayWindow.setFocusable(false);
  pinOverlayOnTop(overlayWindow);
  overlayWindow.setIgnoreMouseEvents(false);
  applyOverlayWindowChrome(overlayWindow);
  applyOverlayWindowShape(overlayWindow, pillWidth, pillHeight);
  attachLoadDiagnostics(overlayWindow, "overlay");
  overlayWindow.setTitle("");
  overlayWindow.webContents.on("page-title-updated", (_event, title) => {
    if (title && overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setTitle("");
    }
  });
  overlayWindow.webContents.setZoomFactor(1);
  overlayWindow.loadURL(overlayUrl());
  overlayWindow.once("ready-to-show", () => {
    pinOverlayOnTop(overlayWindow);
    applyOverlayWindowChrome(overlayWindow);
    overlayWindow?.setTitle("");
    const [cw, ch] = overlayWindow?.getContentSize() ?? [pillWidth, pillHeight];
    scheduleOverlayWindowShape(overlayWindow, cw, ch);
    if (showOnReady) {
      overlayWindow?.show();
    }
  });
  overlayWindow.on("moved", () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    const bounds = overlayWindow.getBounds();
    schedulePillPositionSave(bounds.x, bounds.y);
  });
  overlayWindow.on("resize", () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    const [cw, ch] = overlayWindow.getContentSize();
    scheduleOverlayWindowShape(overlayWindow, cw, ch);
  });
  overlayWindow.on("blur", () => pinOverlayOnTop(overlayWindow));
  overlayWindow.on("show", () => {
    pinOverlayOnTop(overlayWindow);
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    const [cw, ch] = overlayWindow.getContentSize();
    scheduleOverlayWindowShape(overlayWindow, cw, ch);
  });
  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
}

const SETTINGS_CONTENT_WIDTH = 980;
const SETTINGS_CONTENT_HEIGHT = 600;
const SETTINGS_MIN_CONTENT_HEIGHT = 480;

/** Keep setup content un-clipped after monitor / DPI changes. */
function ensureSettingsWindowLayout(win = settingsWindow) {
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.setZoomFactor(1);
  } catch {
    /* ignore */
  }
  const [cw, ch] = win.getContentSize();
  const targetW = Math.max(cw, SETTINGS_CONTENT_WIDTH);
  const targetH = Math.max(ch, SETTINGS_CONTENT_HEIGHT);
  if (cw < targetW || ch < targetH) {
    win.setContentSize(targetW, targetH);
  }
}

async function createSettings(engineSettings = null) {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  const settings = engineSettings ?? (await fetchEngineSettings());
  const sw = settings?.settingsWindow ?? {};
  const icons = getAppIcons();
  const winWidth =
    typeof sw.width === "number" && sw.width >= 700 ? Math.round(sw.width) : SETTINGS_CONTENT_WIDTH;
  const winHeight =
    typeof sw.height === "number" && sw.height >= SETTINGS_MIN_CONTENT_HEIGHT
      ? Math.round(sw.height)
      : SETTINGS_CONTENT_HEIGHT;
  const winOptions = {
    width: winWidth,
    height: winHeight,
    minWidth: 700,
    minHeight: SETTINGS_MIN_CONTENT_HEIGHT,
    useContentSize: true,
    frame: false,
    backgroundColor: "#f4f2ee",
    autoHideMenuBar: true,
    title: "Настройки Spotti Voice",
    icon: icons.window,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  };
  if (typeof sw.x === "number" && typeof sw.y === "number") {
    winOptions.x = Math.round(sw.x);
    winOptions.y = Math.round(sw.y);
  }
  settingsWindow = new BrowserWindow(winOptions);
  attachLoadDiagnostics(settingsWindow, "settings");
  settingsWindow.loadURL(settingsUrl());
  settingsWindow.once("ready-to-show", () => {
    if (!settingsWindow || settingsWindow.isDestroyed()) return;
    if (!icons.window.isEmpty()) {
      settingsWindow.setIcon(icons.window);
    }
    ensureSettingsWindowLayout(settingsWindow);
    void settingsWindow.webContents.session.clearCache();
    settingsWindow.show();
    scheduleSettingsWindowSave(true);
  });
  settingsWindow.on("move", () => {
    ensureSettingsWindowLayout(settingsWindow);
    scheduleSettingsWindowSave(true);
  });
  settingsWindow.on("resize", () => {
    scheduleSettingsWindowSave(true);
  });
  settingsWindow.on("close", () => {
    persistSettingsWindowState(false);
  });
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

async function createUninstallWindow() {
  if (uninstallWindow) {
    uninstallWindow.focus();
    return;
  }
  const icons = getAppIcons();
  uninstallWindow = new BrowserWindow({
    width: SETTINGS_CONTENT_WIDTH,
    height: 480,
    minWidth: 560,
    minHeight: 420,
    useContentSize: true,
    frame: false,
    backgroundColor: "#f4f2ee",
    autoHideMenuBar: true,
    title: "Удаление Spotti Voice",
    icon: icons.window,
    show: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  attachLoadDiagnostics(uninstallWindow, "uninstall");
  uninstallWindow.loadURL(uninstallUrl());
  uninstallWindow.once("ready-to-show", () => {
    if (!uninstallWindow || uninstallWindow.isDestroyed()) return;
    if (!icons.window.isEmpty()) {
      uninstallWindow.setIcon(icons.window);
    }
    uninstallWindow.show();
  });
  uninstallWindow.on("closed", () => {
    uninstallWindow = null;
  });
}

function nativeWindowHwnd(win) {
  if (!win || win.isDestroyed()) return 0;
  try {
    const handle = win.getNativeWindowHandle();
    if (!handle || handle.length === 0) return 0;
    return handle.length >= 8
      ? Number(handle.readBigUInt64LE(0))
      : Number(handle.readUInt32LE(0));
  } catch {
    return 0;
  }
}

function ownWindowHwnds() {
  /** @type {number[]} */
  const hwnds = [];
  for (const win of [overlayWindow, settingsWindow, uninstallWindow, trayMenuWindow]) {
    const hwnd = nativeWindowHwnd(win);
    if (hwnd > 0) hwnds.push(hwnd);
  }
  return hwnds;
}

/** Foreground + keyboard-focus HWND for injection — skip Spotti windows. */
function captureInjectTargets() {
  if (!getForegroundWindow) return { targetHwnd: null, focusHwnd: null };
  const targetHwnd = Number(getForegroundWindow());
  if (targetHwnd <= 0) return { targetHwnd: null, focusHwnd: null };
  if (ownWindowHwnds().includes(targetHwnd)) {
    return { targetHwnd: null, focusHwnd: null };
  }
  let focusHwnd = getGuiThreadFocusHwnd ? getGuiThreadFocusHwnd() : 0;
  if (focusHwnd > 0 && ownWindowHwnds().includes(focusHwnd)) {
    focusHwnd = 0;
  }
  return {
    targetHwnd,
    focusHwnd: focusHwnd > 0 ? focusHwnd : null,
  };
}

/** @deprecated use captureInjectTargets */
function captureInjectTargetHwnd() {
  return captureInjectTargets().targetHwnd;
}

async function postPtt(pressed, captured = null) {
  const body = { pressed };
  if (pressed) {
    const { targetHwnd, focusHwnd } =
      captured && typeof captured === "object"
        ? captured
        : captureInjectTargets();
    if (typeof targetHwnd === "number" && targetHwnd > 0) {
      body.targetHwnd = targetHwnd;
    }
    if (typeof focusHwnd === "number" && focusHwnd > 0) {
      body.focusHwnd = focusHwnd;
    }
  }
  try {
    await fetch(`${ENGINE_BASE}/api/ptt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // engine offline
  }
}

async function fetchPttSettings() {
  try {
    const res = await fetch(`${ENGINE_BASE}/api/settings`);
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.hotkey !== "string" || !data.hotkey.trim()) return null;
    const pttMode = data.pttMode === "toggle" ? "toggle" : "hold";
    return {
      raw: data.hotkey.trim().toLowerCase(),
      accelerator: settingsHotkeyToAccelerator(data.hotkey),
      pttMode,
    };
  } catch {
    return null;
  }
}

async function fetchSettingsHotkey() {
  const settings = await fetchPttSettings();
  if (!settings) return null;
  return { raw: settings.raw, accelerator: settings.accelerator };
}

async function setEnginePttFallback(enabled, hotkey, pttMode = "hold") {
  try {
    const res = await fetch(`${ENGINE_BASE}/api/ptt-hotkey/fallback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, hotkey, pttMode }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.active);
  } catch {
    return false;
  }
}

async function enableEnginePttFallback(hotkey, pttMode = "hold") {
  const active = await setEnginePttFallback(true, hotkey, pttMode);
  if (active) {
    console.info(`Engine PTT hotkey active (${hotkey}, ${pttMode})`);
  }
  return active;
}

async function disableEnginePttFallback() {
  await setEnginePttFallback(false, "", "hold");
}

function stopWinGlobalPttPoll() {
  if (winGlobalPttPoll) {
    winGlobalPttPoll.stop();
    winGlobalPttPoll = null;
  }
  pttHeld = false;
}

function startWinGlobalPtt(hotkey, pttMode) {
  stopWinGlobalPttPoll();
  if (!getAsyncKeyState) return false;

  const poll = startWinGlobalPttPoll({
    getAsyncKeyState,
    hotkey,
    pttMode,
    onPress: () => {
      if (pttHeld) return;
      pttHeld = true;
      void postPtt(true, captureInjectTargets());
    },
    onRelease: () => {
      if (!pttHeld) return;
      pttHeld = false;
      void postPtt(false);
    },
  });

  if (!poll.ok) return false;
  winGlobalPttPoll = poll;
  console.info(`Global PTT poll active (${hotkey}, ${pttMode})`);
  return true;
}

function notifyPttFailure(tried) {
  console.warn(`PTT shortcut registration failed for: ${tried.join(", ")}`);
  if (!tray) return;
  const balloon = {
    title: "Spotti Voice",
    content:
      "Горячая клавиша недоступна. Закройте другие экземпляры Spotti Voice, освободите сочетание или откройте Настройки в трее. Запасной режим движка может работать.",
  };
  if (typeof tray.displayBalloon === "function") {
    tray.displayBalloon(balloon);
  } else {
    tray.setToolTip(`${balloon.title}: ${balloon.content}`);
  }
}

function unregisterPttShortcut() {
  stopWinGlobalPttPoll();
  if (!registeredPttAccelerator) return;
  globalShortcut.unregister(registeredPttAccelerator);
  registeredPttAccelerator = null;
}

function tryRegisterPttAccelerator(accelerator) {
  if (registeredPttAccelerator === accelerator) {
    return true;
  }
  unregisterPttShortcut();
  const ok = globalShortcut.register(accelerator, () => {
    if (!pttHeld) {
      pttHeld = true;
      void postPtt(true, captureInjectTargets());
    } else {
      pttHeld = false;
      void postPtt(false);
    }
  });
  if (ok) {
    registeredPttAccelerator = accelerator;
    console.info(`PTT shortcut registered: ${accelerator}`);
  }
  return ok;
}

async function registerPttShortcut() {
  const pttSettings = await fetchPttSettings();
  const hotkey = pttSettings?.raw ?? "control+shift+space";
  const pttMode = pttSettings?.pttMode ?? "hold";

  unregisterPttShortcut();
  await disableEnginePttFallback();

  if (process.platform === "win32") {
    if (!getAsyncKeyState) {
      await initTrayMouseReleaseDetection();
    }
    if (startWinGlobalPtt(hotkey, pttMode)) {
      return;
    }
    const engineOk = await enableEnginePttFallback(hotkey, pttMode);
    if (engineOk) return;
  }

  if (pttMode === "hold") {
    notifyPttFailure([hotkey]);
    return;
  }

  const candidates = [
    ...new Set(
      [pttSettings?.accelerator, ...PTT_FALLBACK_ACCELERATORS].filter(Boolean),
    ),
  ];

  for (const accelerator of candidates) {
    if (tryRegisterPttAccelerator(accelerator)) return;
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  for (const accelerator of candidates) {
    if (tryRegisterPttAccelerator(accelerator)) return;
  }

  notifyPttFailure(candidates);
  if (process.platform === "win32") {
    await enableEnginePttFallback(hotkey, pttMode);
  }
}

function buildTray() {
  const icons = getAppIcons();
  tray = new Tray(icons.tray);
  tray.setToolTip("Spotti Voice");
  tray.on("click", () => {
    hideTrayMenu();
    void createSettings();
  });
  tray.on("right-click", () => {
    showTrayMenuOnRightClickRelease();
  });
}

ipcMain.handle("voice:engine-base", (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  return ENGINE_BASE;
});

function chromeWindowFromEvent(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) {
    throw new Error("Untrusted chrome window");
  }
  if (win !== settingsWindow && win !== uninstallWindow) {
    throw new Error("Untrusted chrome window");
  }
  return win;
}

function settingsWindowFromEvent(event) {
  const win = chromeWindowFromEvent(event);
  if (win !== settingsWindow) {
    throw new Error("Untrusted settings window");
  }
  return win;
}

ipcMain.handle("voice:window-minimize", (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  chromeWindowFromEvent(event).minimize();
  return true;
});

ipcMain.handle("voice:window-close", (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  chromeWindowFromEvent(event).close();
  return true;
});

ipcMain.handle("voice:set-ui-theme", (event, theme) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  if (theme !== "light" && theme !== "dark") throw new Error("Invalid UI theme");
  applyUiTheme(theme);
  return true;
});

ipcMain.handle("voice:open-settings", (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  void createSettings();
  return true;
});

ipcMain.handle("voice:tray-show-pill", (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  hideTrayMenu();
  showOverlay();
  return true;
});

ipcMain.handle("voice:tray-open-setup", (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  hideTrayMenu();
  void createSettings();
  return true;
});

ipcMain.handle("voice:tray-quit", (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  hideTrayMenu();
  app.quit();
  return true;
});

ipcMain.handle("voice:tray-menu-resize", (event, size) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  if (
    !size ||
    typeof size.width !== "number" ||
    typeof size.height !== "number" ||
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height)
  ) {
    throw new Error("Invalid tray menu size");
  }
  resizeTrayMenuToContent(size.width, size.height);
  return true;
});

ipcMain.handle("voice:tray-menu-dismiss", (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  hideTrayMenu();
  return true;
});

ipcMain.handle("voice:reload-hotkey", async (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  await registerPttShortcut();
  return true;
});

ipcMain.handle("voice:set-hotkey-capture", async (event, enabled) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  if (typeof enabled !== "boolean") throw new Error("Invalid hotkey capture payload");
  if (enabled) {
    unregisterPttShortcut();
    try {
      await fetch(`${ENGINE_BASE}/api/hotkey-capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
    } catch {
      // engine offline
    }
    return true;
  }
  await registerPttShortcut();
  return true;
});

ipcMain.handle("voice:ptt", async (event, pressed) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  if (typeof pressed !== "boolean") throw new Error("Invalid PTT payload");
  await postPtt(pressed);
  return true;
});

ipcMain.handle("voice:cloud-sign-in", async (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  return startCloudSignIn();
});

ipcMain.handle("voice:cloud-auth-begin", async (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  return beginCloudAuth();
});

ipcMain.handle("voice:cloud-auth-finish", async (event, callbackUrl) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  if (!callbackUrl || typeof callbackUrl !== "string") {
    return { ok: false, error: "invalid_callback" };
  }
  const finished = await finishOAuthCallback(callbackUrl);
  if (finished && settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send("voice:cloud-auth-changed");
  }
  return { ok: Boolean(finished), error: finished ? undefined : "oauth_finish_failed" };
});

ipcMain.handle("voice:cloud-sign-out", async (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  await fetch(`${ENGINE_BASE}/api/cloud/auth/signout`, { method: "POST" });
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send("voice:cloud-auth-changed");
  }
  return true;
});

ipcMain.handle("voice:cloud-status", async (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  try {
    const res = await fetch(`${ENGINE_BASE}/api/cloud/status`);
    if (!res.ok) return { ready: false, signedIn: false, userLabel: null, userId: null, avatarUrl: null };
    return await res.json();
  } catch {
    return { ready: false, signedIn: false, userLabel: null, userId: null, avatarUrl: null };
  }
});

ipcMain.handle("voice:run-uninstall", async (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  if (event.sender !== uninstallWindow?.webContents) {
    throw new Error("Untrusted uninstall window");
  }
  const installDir = path.join(__dirname, "..");
  const ps1 = path.join(installDir, "Uninstall.ps1");
  if (!fs.existsSync(ps1)) {
    return { ok: false, error: "missing_script" };
  }
  spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-WindowStyle",
      "Hidden",
      "-File",
      ps1,
      "-AfterPid",
      String(process.pid),
    ],
    { detached: true, stdio: "ignore", windowsHide: true },
  ).unref();
  setTimeout(() => app.quit(), 500);
  return { ok: true };
});

ipcMain.handle("voice:overlay-size", (event, size) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
  if (
    !size ||
    typeof size.width !== "number" ||
    typeof size.height !== "number" ||
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height)
  ) {
    throw new Error("Invalid overlay size");
  }
  return resizeOverlayToContent(size.width, size.height);
});

app.on("second-instance", (_event, argv) => {
  const callbackUrl = oauthCallbackFromArgv(argv);
  if (callbackUrl) void finishOAuthCallback(callbackUrl);
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    pinOverlayOnTop(overlayWindow);
    overlayWindow.show();
  }
});

app.whenReady().then(async () => {
  registerSpottiVoiceProtocol();
  getAppIcons();

  if (uninstallMode) {
    await createUninstallWindow();
    return;
  }

  const bootCallback = oauthCallbackFromArgv(process.argv);
  if (bootCallback) void finishOAuthCallback(bootCallback);
  ensureWhisperCppInstalled();
  await initTrayMouseReleaseDetection();
  const existing = await waitForEngine(8);
  if (!existing) {
    spawnEngine();
    const health = await waitForEngine(80);
    if (!health) {
      console.error("Spotti Voice engine did not start");
    }
  }
  void warmCloudSession();
  startEngineWatchdog();
  const engineSettings = await fetchEngineSettings();
  await createOverlay(engineSettings);
  buildTray();
  if (engineSettings?.settingsWindow?.open) {
    await createSettings(engineSettings);
  }
  const audioReady = await waitForEngineAudio();
  if (!audioReady) {
    console.warn("Spotti Voice mic not ready — PTT may fail until audio starts");
  }
  await registerPttShortcut();
  screen.on("display-metrics-changed", () => {
    ensureSettingsWindowLayout();
  });
});

app.on("will-quit", () => {
  engineShuttingDown = true;
  if (engineWatchdogTimer) {
    clearInterval(engineWatchdogTimer);
    engineWatchdogTimer = null;
  }
  clearTrayMenuReleaseWait();
  unregisterPttShortcut();
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    const bounds = overlayWindow.getBounds();
    void patchEngineSettings({
      pill: { x: bounds.x, y: bounds.y, visible: overlayWindow.isVisible() },
    });
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    persistSettingsWindowState(true);
  }
  if (engineProc) {
    engineProc.kill();
    engineProc = null;
  }
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});
