export const ENGINE_BASE =
  typeof window !== "undefined" && window.spottiVoice
    ? "" // proxied in dev; resolved at runtime
    : "http://127.0.0.1:9777";

export async function resolveEngineBase(): Promise<string> {
  if (window.spottiVoice?.getEngineBase) {
    return window.spottiVoice.getEngineBase();
  }
  return "http://127.0.0.1:9777";
}

export type SettingsSection =
  | "mic"
  | "hotkey"
  | "account"
  | "inject"
  | "cloud"
  | "language"
  | "local"
  | "history";

const SETTINGS_SECTIONS = new Set<SettingsSection>([
  "mic",
  "hotkey",
  "account",
  "inject",
  "cloud",
  "language",
  "local",
  "history",
]);

export function normalizeSettingsSection(value: unknown): SettingsSection {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "settings" || raw === "device" || raw === "config" || raw === "inject") return "mic";
  if (raw === "cloud") return "account";
  if (raw === "language" || raw === "local") return "mic";
  if (SETTINGS_SECTIONS.has(raw as SettingsSection)) return raw as SettingsSection;
  return "mic";
}

export type TranscriptEntry = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
  sttMode: "cloud" | "local";
  injected: boolean;
};

export type VoiceSettings = {
  sttMode: "local" | "cloud";
  language: string;
  injectMethod: string;
  appendTrailingSpace: boolean;
  hotkey: string;
  localModel: string;
  inputDeviceIndex: number | null;
  settingsSection: SettingsSection;
};

export type AudioInputDevice = {
  index: number;
  name: string;
  hostapi: string;
  isDefault: boolean;
};

export async function fetchSettings(base: string): Promise<VoiceSettings> {
  const res = await fetch(`${base}/api/settings`);
  if (!res.ok) throw new Error("Settings unavailable");
  const data = (await res.json()) as VoiceSettings & {
    inputDeviceIndex?: number | null;
    settingsSection?: string;
  };
  const section = normalizeSettingsSection(data.settingsSection);
  return {
    ...data,
    settingsSection: section,
    inputDeviceIndex:
      data.inputDeviceIndex === undefined || data.inputDeviceIndex === null
        ? null
        : Number(data.inputDeviceIndex),
  };
}

export async function fetchAudioDevices(base: string) {
  const res = await fetch(`${base}/api/audio-devices`);
  if (!res.ok) throw new Error("Audio devices unavailable");
  return res.json() as Promise<{ devices: AudioInputDevice[]; selected: number | null }>;
}

export async function saveSettings(base: string, patch: Partial<VoiceSettings>) {
  const res = await fetch(`${base}/api/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Save failed");
  return res.json();
}

export async function setMicMonitor(
  base: string,
  enabled: boolean,
  inputDeviceIndex?: number | null,
) {
  const res = await fetch(`${base}/api/mic-monitor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      enabled,
      inputDeviceIndex: inputDeviceIndex ?? null,
    }),
  });
  if (!res.ok) throw new Error("Mic monitor failed");
  return res.json() as Promise<{ ok: boolean; error?: string; capture?: boolean }>;
}

export async function fetchMicLevel(base: string) {
  const res = await fetch(`${base}/api/mic-level`);
  if (!res.ok) throw new Error("Mic level unavailable");
  return res.json() as Promise<{ ok: boolean; level: number; monitoring: boolean }>;
}

export type EngineEvent =
  | { type: "state"; state: string }
  | { type: "level"; level: number }
  | { type: "error"; message: string; code?: string }
  | { type: "final"; text: string; injected: boolean }
  | { type: "history"; entry: TranscriptEntry };

export async function fetchHistory(base: string): Promise<TranscriptEntry[]> {
  const res = await fetch(`${base}/api/history`);
  if (!res.ok) throw new Error("History unavailable");
  const data = (await res.json()) as { entries?: TranscriptEntry[] };
  return Array.isArray(data.entries) ? data.entries : [];
}

export async function updateHistoryEntry(
  base: string,
  id: string,
  text: string,
): Promise<TranscriptEntry> {
  const res = await fetch(`${base}/api/history/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("History update failed");
  return res.json() as Promise<TranscriptEntry>;
}

export async function deleteHistoryEntry(base: string, id: string): Promise<void> {
  const res = await fetch(`${base}/api/history/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("History delete failed");
}

export function subscribeEngineEvents(
  base: string,
  onEvent: (event: EngineEvent) => void,
): () => void {
  const wsBase = base.replace(/^http/i, (m) => (m.toLowerCase() === "https" ? "wss" : "ws"));
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  function connect() {
    if (closed) return;
    ws = new WebSocket(`${wsBase}/ws/events`);
    ws.onmessage = (message) => {
      try {
        const data = JSON.parse(message.data as string) as EngineEvent;
        onEvent(data);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      if (closed) return;
      reconnectTimer = setTimeout(connect, 1500);
    };
    ws.onerror = () => {
      ws?.close();
    };
  }

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
  };
}

export async function injectTest(base: string): Promise<{
  ok: boolean;
  targetHwnd?: number;
  focusHwnd?: number;
  lastInject?: { ok?: boolean; strategy?: string };
}> {
  const res = await fetch(`${base}/api/inject-test`, { method: "POST" });
  return res.json();
}

declare global {
  interface Window {
    spottiVoice?: {
      isElectron: boolean;
      openSettings: () => Promise<boolean>;
      getEngineBase: () => Promise<string>;
      ptt: (pressed: boolean) => Promise<boolean>;
      setOverlaySize?: (width: number, height: number) => Promise<boolean>;
      minimizeWindow?: () => Promise<boolean>;
      closeWindow?: () => Promise<boolean>;
      reloadHotkey?: () => Promise<boolean>;
      setHotkeyCapture?: (enabled: boolean) => Promise<boolean>;
      cloudSignIn?: () => Promise<{ ok: boolean; error?: string }>;
      cloudAuthBegin?: () => Promise<{ ok: boolean; authorizeUrl?: string; error?: string }>;
      cloudAuthFinish?: (callbackUrl: string) => Promise<{ ok: boolean; error?: string }>;
      cloudSignOut?: () => Promise<boolean>;
      cloudStatus?: () => Promise<{
        ready: boolean;
        signedIn: boolean;
        userLabel: string | null;
        userId?: string | null;
        avatarUrl?: string | null;
      }>;
      onCloudAuthChanged?: (handler: () => void) => () => void;
      runUninstall?: () => Promise<{ ok: boolean; error?: string }>;
    };
  }
}
