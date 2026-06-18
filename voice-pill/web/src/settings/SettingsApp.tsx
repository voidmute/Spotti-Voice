import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Mic2, Loader2, AlertCircle, History, Keyboard } from "lucide-react";
import {
  fetchSettings,
  normalizeSettingsSection,
  resolveEngineBase,
  saveSettings,
  type SettingsSection,
  type VoiceSettings,
} from "../lib/engineApi";
import { MicPanel } from "./MicPanel";
import { HotkeyPanel } from "./HotkeyPanel";
import { HistoryPanel } from "./HistoryPanel";
import { ModeSwitch, type SttMode } from "./ModeSwitch";
import { SettingsTitleBar } from "./SettingsTitleBar";
import { CloudAuthGate, fetchCloudSignedIn } from "./CloudAuthGate";
import "./settings.css";

const LOCAL_STT_LANGUAGE = "ru";
const CLOUD_STT_LANGUAGE = "auto";
const INJECT_DEFAULTS = {
  injectMethod: "auto",
  appendTrailingSpace: true,
} as const;
const AUTO_SAVE_MS = 200;

const CORE_SECTIONS = new Set<SettingsSection>(["mic", "hotkey", "history"]);

function settingsPayload(settings: VoiceSettings) {
  return {
    sttMode: settings.sttMode,
    language: settings.sttMode === "local" ? LOCAL_STT_LANGUAGE : CLOUD_STT_LANGUAGE,
    hotkey: settings.hotkey,
    localModel: settings.localModel,
    inputDeviceIndex: settings.inputDeviceIndex,
    settingsSection: normalizeSettingsSection(settings.settingsSection),
    ...INJECT_DEFAULTS,
  };
}

function settingsFingerprint(settings: VoiceSettings) {
  return JSON.stringify(settingsPayload(settings));
}

type NavItem = {
  id: SettingsSection;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { id: "mic", icon: Mic2, label: "Микрофон" },
  { id: "hotkey", icon: Keyboard, label: "Горячая клавиша" },
  { id: "history", icon: History, label: "История" },
];

function SidebarNav({
  value,
  items,
  onChange,
}: {
  value: SettingsSection;
  items: NavItem[];
  onChange: (section: SettingsSection) => void;
}) {
  return (
    <nav className="settings-nav" aria-label="Разделы настроек">
      {items.map((item) => {
        const Icon = item.icon;
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={`settings-nav__item${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
            tabIndex={-1}
            onClick={() => onChange(item.id)}
          >
            <span className="settings-nav__icon">
              <Icon size={17} strokeWidth={2.15} aria-hidden />
            </span>
            <span className="settings-nav__label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function SaveNotice({ message, kind }: { message: string; kind: "ok" | "err" | "" }) {
  if (!message || kind !== "err") return null;
  return (
    <div className="settings-notice-stack" aria-live="polite">
      <p className="settings-notice settings-notice--err" role="alert">
        <AlertCircle size={14} strokeWidth={2.25} aria-hidden />
        <span>{message}</span>
      </p>
    </div>
  );
}

export function SettingsApp() {
  const [base, setBase] = useState("http://127.0.0.1:9777");
  const [settings, setSettings] = useState<VoiceSettings | null>(null);
  const [section, setSection] = useState<SettingsSection>("mic");
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"ok" | "err" | "">("");
  const [engineOnline, setEngineOnline] = useState<boolean | null>(null);
  const [hotkeyCapturing, setHotkeyCapturing] = useState(false);
  const [authGateOpen, setAuthGateOpen] = useState(false);

  const hydratedRef = useRef(false);
  const lastSavedFingerprintRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authPromptedRef = useRef(false);

  const sttMode = settings?.sttMode ?? "local";
  const isCloud = sttMode === "cloud";

  const visibleNav = useMemo(() => NAV_ITEMS, []);

  useEffect(() => {
    void resolveEngineBase().then(setBase);
  }, []);

  useEffect(() => {
    if (!base) return;
    hydratedRef.current = false;
    lastSavedFingerprintRef.current = null;
    authPromptedRef.current = false;

    void fetchSettings(base)
      .then((s) => {
        const normalized: VoiceSettings = {
          ...(s.sttMode === "local"
            ? { ...s, language: LOCAL_STT_LANGUAGE }
            : { ...s, language: CLOUD_STT_LANGUAGE }),
          inputDeviceIndex:
            s.inputDeviceIndex === undefined || s.inputDeviceIndex === null
              ? null
              : Number(s.inputDeviceIndex),
          settingsSection: normalizeSettingsSection(s.settingsSection),
        };
        setSettings(normalized);
        setSection(normalized.settingsSection);
        setEngineOnline(true);
        setStatus("");
        setStatusKind("");
        lastSavedFingerprintRef.current = settingsFingerprint(normalized);
        hydratedRef.current = true;

        if (normalized.sttMode === "cloud") {
          void fetchCloudSignedIn(base).then((signedIn) => {
            if (!signedIn) setAuthGateOpen(true);
          });
        }
      })
      .catch(() => {
        setEngineOnline(false);
        setStatus("Spotti Voice не отвечает. Закройте приложение и откройте снова.");
        setStatusKind("err");
      });
  }, [base]);

  useEffect(() => {
    if (!settings || !base || engineOnline !== true || !hydratedRef.current) return;

    const fingerprint = settingsFingerprint(settings);
    if (fingerprint === lastSavedFingerprintRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const payload = settingsPayload(settings);
          let prevHotkey: string | undefined;
          if (lastSavedFingerprintRef.current) {
            try {
              prevHotkey = (JSON.parse(lastSavedFingerprintRef.current) as { hotkey?: string }).hotkey;
            } catch {
              prevHotkey = undefined;
            }
          }

          await saveSettings(base, payload);
          lastSavedFingerprintRef.current = fingerprint;

          if (payload.hotkey !== prevHotkey) {
            await window.spottiVoice?.reloadHotkey?.();
          }

          setStatus("");
          setStatusKind("");
        } catch {
          setStatus("Не удалось сохранить");
          setStatusKind("err");
        }
      })();
    }, AUTO_SAVE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [settings, base, engineOnline]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (hotkeyCapturing) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [hotkeyCapturing]);

  useEffect(() => {
    if (!CORE_SECTIONS.has(section)) {
      setSection("mic");
      if (settings) setSettings({ ...settings, settingsSection: "mic" });
    }
  }, [section, settings]);

  function onSectionChange(next: SettingsSection) {
    setSection(next);
    if (!settings) return;
    setSettings({ ...settings, settingsSection: next });
  }

  async function onModeChange(next: SttMode) {
    if (!settings) return;
    if (next === "cloud") {
      setSettings({ ...settings, sttMode: "cloud", language: CLOUD_STT_LANGUAGE, settingsSection: section });
      const signedIn = await fetchCloudSignedIn(base);
      if (!signedIn) setAuthGateOpen(true);
      return;
    }
    setAuthGateOpen(false);
    setSettings({
      ...settings,
      sttMode: "local",
      language: LOCAL_STT_LANGUAGE,
      settingsSection: section,
    });
  }

  function renderPanel() {
    if (!settings) return null;

    switch (section) {
      case "mic":
        return (
          <MicPanel
            base={base}
            sttMode={sttMode}
            inputDeviceIndex={settings.inputDeviceIndex}
            engineOnline={engineOnline === true}
            onMicChange={(inputDeviceIndex) => setSettings({ ...settings, inputDeviceIndex })}
          />
        );
      case "hotkey":
        return (
          <HotkeyPanel
            hotkey={settings.hotkey}
            engineOnline={engineOnline === true}
            onHotkeyChange={(hotkey) => setSettings({ ...settings, hotkey })}
            onCapturingChange={setHotkeyCapturing}
          />
        );
      case "history":
        return (
          <div className="settings-panel-view settings-panel-view--history">
            <header className="settings-panel-view__head">
              <div className="settings-panel-view__icon">
                <History size={22} strokeWidth={2} aria-hidden />
              </div>
              <div>
                <h2>История</h2>
                <p>Последние фразы - копирование, правка, удаление.</p>
              </div>
            </header>
            <HistoryPanel base={base} engineOnline={engineOnline === true} />
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className={`settings-app settings-app--v2 settings-app--figjam${authGateOpen ? " is-auth-gate" : ""}`}>
      <SettingsTitleBar
        modeSwitch={
          settings ? (
            <ModeSwitch value={sttMode} onChange={(mode) => void onModeChange(mode)} disabled={engineOnline !== true} />
          ) : null
        }
      />

      <div className="settings-body">
        <aside className="settings-sidebar">
          {settings ? (
            <SidebarNav value={section} items={visibleNav} onChange={onSectionChange} />
          ) : (
            <div className="settings-sidebar__placeholder" />
          )}
        </aside>

        <main className="settings-main">
          {!settings ? (
            <div className="settings-loading">
              <Loader2 className="settings-loading__spin" size={24} strokeWidth={2} />
              <span>{status || "Загрузка…"}</span>
            </div>
          ) : (
            <div className="settings-stage">{renderPanel()}</div>
          )}
        </main>
      </div>

      <CloudAuthGate
        open={authGateOpen && isCloud}
        onClose={() => setAuthGateOpen(false)}
        onSignedIn={() => {
          authPromptedRef.current = true;
        }}
      />

      {settings ? <SaveNotice message={status} kind={statusKind} /> : null}
    </div>
  );
}
