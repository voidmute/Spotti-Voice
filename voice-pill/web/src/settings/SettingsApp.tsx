import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  Mic2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  History,
  Keyboard,
  MousePointerClick,
  Cloud,
  Languages,
} from "lucide-react";
import {
  fetchSettings,
  normalizeSettingsSection,
  resolveEngineBase,
  saveSettings,
  type SettingsSection,
  type VoiceSettings,
} from "../lib/engineApi";
import { LanguagePicker } from "./LanguagePicker";
import { LanguageFlag } from "./LanguageFlag";
import { languageFlagCountry } from "./voiceLanguages";
import { CloudAuthPanel } from "./CloudAuthPanel";
import { MicPanel } from "./MicPanel";
import { HotkeyPanel } from "./HotkeyPanel";
import { InjectPanel } from "./InjectPanel";
import { HistoryPanel } from "./HistoryPanel";
import { ModeSwitch, type SttMode } from "./ModeSwitch";
import { SettingsTitleBar } from "./SettingsTitleBar";
import "./settings.css";

const LOCAL_STT_LANGUAGE = "ru";
const INJECT_DEFAULTS = {
  injectMethod: "auto",
  appendTrailingSpace: true,
} as const;
const AUTO_SAVE_MS = 200;
const STATUS_CLEAR_MS = 2000;

function settingsPayload(settings: VoiceSettings) {
  return {
    sttMode: settings.sttMode,
    language: settings.sttMode === "local" ? LOCAL_STT_LANGUAGE : settings.language,
    hotkey: settings.hotkey,
    localModel: settings.localModel,
    inputDeviceIndex: settings.inputDeviceIndex,
    settingsSection: settings.settingsSection,
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
  cloudOnly?: boolean;
  localOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { id: "mic", icon: Mic2, label: "Микрофон" },
  { id: "hotkey", icon: Keyboard, label: "Горячая клавиша" },
  { id: "inject", icon: MousePointerClick, label: "Вставка" },
  { id: "cloud", icon: Cloud, label: "Discord", cloudOnly: true },
  { id: "language", icon: Languages, label: "Язык", cloudOnly: true },
  { id: "local", icon: HardDrive, label: "Локально", localOnly: true },
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
  if (!message || !kind) return null;
  const Icon = kind === "ok" ? CheckCircle2 : AlertCircle;
  return (
    <div className="settings-notice-stack" aria-live="polite">
      <p className={`settings-notice settings-notice--${kind}`} role="status">
        <Icon size={14} strokeWidth={2.25} aria-hidden />
        <span>{message}</span>
      </p>
    </div>
  );
}

function LocalLanguageLocked() {
  return (
    <div className="settings-local-hero">
      <span className="settings-local-hero__badge">
        <LanguageFlag country={languageFlagCountry("ru") ?? "RU"} className="settings-lang-chip__flag" />
        <span>Русский</span>
      </span>
      <p className="settings-local-hero__note">
        Локальный режим распознаёт только русский. Для других языков переключитесь на Облако.
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

  const hydratedRef = useRef(false);
  const lastSavedFingerprintRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sttMode = settings?.sttMode ?? "local";
  const isCloud = sttMode === "cloud";

  const visibleNav = useMemo(
    () =>
      NAV_ITEMS.filter((item) => {
        if (item.cloudOnly && !isCloud) return false;
        if (item.localOnly && isCloud) return false;
        return true;
      }),
    [isCloud],
  );

  useEffect(() => {
    void resolveEngineBase().then(setBase);
  }, []);

  useEffect(() => {
    if (!base) return;
    hydratedRef.current = false;
    lastSavedFingerprintRef.current = null;

    void fetchSettings(base)
      .then((s) => {
        const normalized: VoiceSettings = {
          ...(s.sttMode === "local" ? { ...s, language: LOCAL_STT_LANGUAGE } : s),
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

          setStatus("Сохранено");
          setStatusKind("ok");

          if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
          statusTimerRef.current = setTimeout(() => {
            setStatus("");
            setStatusKind("");
          }, STATUS_CLEAR_MS);
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
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
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
    if (!visibleNav.some((item) => item.id === section)) {
      const fallback = visibleNav[0]?.id ?? "mic";
      setSection(fallback);
      if (settings) setSettings({ ...settings, settingsSection: fallback });
    }
  }, [visibleNav, section, settings]);

  function onSectionChange(next: SettingsSection) {
    setSection(next);
    if (!settings) return;
    setSettings({ ...settings, settingsSection: next });
  }

  function onModeChange(next: SttMode) {
    if (!settings) return;
    if (next === "cloud") {
      setSettings({ ...settings, sttMode: "cloud", settingsSection: section });
    } else {
      setSettings({
        ...settings,
        sttMode: "local",
        language: LOCAL_STT_LANGUAGE,
        settingsSection: section,
      });
    }
  }

  function renderPanel() {
    if (!settings) return null;

    switch (section) {
      case "mic":
        return (
          <MicPanel
            base={base}
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
      case "inject":
        return <InjectPanel base={base} engineOnline={engineOnline === true} />;
      case "cloud":
        return (
          <div className="settings-panel-view">
            <header className="settings-panel-view__head">
              <div className="settings-panel-view__icon">
                <Cloud size={22} strokeWidth={2} aria-hidden />
              </div>
              <div>
                <h2>Облако и Discord</h2>
                <p>Вход через Discord для распознавания на сервере Spotti.</p>
              </div>
            </header>
            <div className="settings-card">
              <CloudAuthPanel base={base} />
            </div>
          </div>
        );
      case "language":
        return (
          <div className="settings-panel-view">
            <header className="settings-panel-view__head">
              <div className="settings-panel-view__icon">
                <Languages size={22} strokeWidth={2} aria-hidden />
              </div>
              <div>
                <h2>Язык речи</h2>
                <p>Автоопределение или фиксированный язык для облака.</p>
              </div>
            </header>
            <div className="settings-card">
              <LanguagePicker
                value={settings.language}
                onChange={(language) => setSettings({ ...settings, language })}
              />
            </div>
          </div>
        );
      case "local":
        return (
          <div className="settings-panel-view">
            <header className="settings-panel-view__head">
              <div className="settings-panel-view__icon">
                <HardDrive size={22} strokeWidth={2} aria-hidden />
              </div>
              <div>
                <h2>Локальный режим</h2>
                <p>Распознавание на компьютере без отправки аудио в сеть.</p>
              </div>
            </header>
            <LocalLanguageLocked />
          </div>
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
                <p>Последние фразы — копирование, правка, удаление.</p>
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
    <div className="settings-app settings-app--v2 settings-app--figjam">
      <SettingsTitleBar
        modeSwitch={
          settings ? (
            <ModeSwitch value={sttMode} onChange={onModeChange} disabled={engineOnline !== true} />
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

      {settings ? <SaveNotice message={status} kind={statusKind} /> : null}
    </div>
  );
}
