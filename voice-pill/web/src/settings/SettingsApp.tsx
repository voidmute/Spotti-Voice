import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  Cloud,
  Mic2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  SlidersHorizontal,
} from "lucide-react";
import {
  fetchSettings,
  resolveEngineBase,
  saveSettings,
  type SettingsSection,
  type VoiceSettings,
} from "../lib/engineApi";
import { LanguagePicker } from "./LanguagePicker";
import { LanguageFlag } from "./LanguageFlag";
import { languageFlagCountry } from "./voiceLanguages";
import { CloudAuthPanel } from "./CloudAuthPanel";
import { DevicePanel } from "./DevicePanel";
import { SettingsTitleBar } from "./SettingsTitleBar";
import "./settings.css";

/** Local whisper.cpp build is Russian-only. */
const LOCAL_STT_LANGUAGE = "ru";

/** Best defaults for Windows - not exposed in setup. */
const INJECT_DEFAULTS = {
  injectMethod: "auto",
  appendTrailingSpace: true,
} as const;

const AUTO_SAVE_MS = 200;
const STATUS_CLEAR_MS = 2000;

function normalizeSettingsSection(
  value: unknown,
  sttMode: VoiceSettings["sttMode"],
): SettingsSection {
  if (value === "cloud" || value === "local" || value === "device") return value;
  return sttMode === "local" ? "local" : "cloud";
}

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

function SectionTabs({
  value,
  onChange,
}: {
  value: SettingsSection;
  onChange: (section: SettingsSection) => void;
}) {
  const tabs: {
    id: SettingsSection;
    icon: typeof Cloud;
    title: string;
    hint: string;
  }[] = [
    { id: "cloud", icon: Cloud, title: "Облако", hint: "Онлайн, много языков" },
    { id: "local", icon: HardDrive, title: "Локально", hint: "На устройстве, русский" },
    { id: "device", icon: SlidersHorizontal, title: "Настройки", hint: "Микрофон и клавиши" },
  ];

  return (
    <nav className="settings-tabs" role="tablist" aria-label="Разделы настроек">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`settings-tab-${tab.id}`}
            aria-selected={value === tab.id}
            aria-controls={`settings-panel-${tab.id}`}
            className={`settings-tab${value === tab.id ? " is-active" : ""}`}
            onClick={() => onChange(tab.id)}
          >
            <span className="settings-tab__icon" aria-hidden>
              <Icon size={18} strokeWidth={2.25} />
            </span>
            <span className="settings-tab__copy">
              <span className="settings-tab__title">{tab.title}</span>
              <span className="settings-tab__hint">{tab.hint}</span>
            </span>
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
    <div className="settings-local-card" aria-label="Локально: только русский">
      <span className="settings-local-card__badge">
        <LanguageFlag country={languageFlagCountry("ru") ?? "RU"} className="settings-lang-chip__flag" />
        <span>Русский</span>
      </span>
      <p className="settings-local-card__note">
        Локальный режим распознаёт речь только на русском. Для других языков выберите Облако.
      </p>
    </div>
  );
}

function PanelIntro({
  icon: Icon,
  title,
  description,
  compact,
}: {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <header className={`settings-panel__head${compact ? " settings-panel__head--compact" : ""}`}>
      <div className="settings-panel__title-row">
        <Icon size={20} strokeWidth={2.25} aria-hidden />
        <h2>{title}</h2>
      </div>
      <p className="settings-panel__desc">{description}</p>
    </header>
  );
}

export function SettingsApp() {
  const [base, setBase] = useState("http://127.0.0.1:9777");
  const [settings, setSettings] = useState<VoiceSettings | null>(null);
  const [section, setSection] = useState<SettingsSection>("cloud");
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"ok" | "err" | "">("");
  const [engineOnline, setEngineOnline] = useState<boolean | null>(null);

  const hydratedRef = useRef(false);
  const lastSavedFingerprintRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          settingsSection: normalizeSettingsSection(s.settingsSection, s.sttMode),
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
              prevHotkey = (JSON.parse(lastSavedFingerprintRef.current) as { hotkey?: string })
                .hotkey;
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

  function onSectionChange(next: SettingsSection) {
    setSection(next);
    if (!settings) return;
    if (next === "cloud") {
      setSettings({ ...settings, sttMode: "cloud", settingsSection: next });
    } else if (next === "local") {
      setSettings({
        ...settings,
        sttMode: "local",
        language: LOCAL_STT_LANGUAGE,
        settingsSection: next,
      });
    } else {
      setSettings({ ...settings, settingsSection: next });
    }
  }

  const isCloud = section === "cloud";
  const isLocal = section === "local";
  const isDevice = section === "device";

  return (
    <div className="settings-app">
      <SettingsTitleBar />

      <div className="settings-body">
        <aside className="settings-sidebar">
          <div className="settings-sidebar__brand">
            <div className="settings-sidebar__mark" aria-hidden>
              <img src="./white-only.png" alt="" />
            </div>
            <p className="settings-sidebar__tagline">
              Удерживайте клавишу и говорите. Текст появится в активном поле.
            </p>
          </div>
          {settings ? <SectionTabs value={section} onChange={onSectionChange} /> : null}
        </aside>

        <main className="settings-main">
          {!settings ? (
            <div className="settings-loading">
              <Loader2 className="settings-loading__spin" size={24} strokeWidth={2} />
              <span>{status || "Загрузка настроек…"}</span>
            </div>
          ) : (
            <div className="settings-shell">
              <div
                className={`settings-stage${isDevice || isCloud ? " settings-stage--scroll" : ""}`}
                role="tabpanel"
                id={
                  isCloud
                    ? "settings-panel-cloud"
                    : isLocal
                      ? "settings-panel-local"
                      : "settings-panel-device"
                }
                aria-labelledby={
                  isCloud
                    ? "settings-tab-cloud"
                    : isLocal
                      ? "settings-tab-local"
                      : "settings-tab-device"
                }
              >
                {isCloud ? (
                  <>
                    <CloudAuthPanel base={base} />
                    <PanelIntro
                      icon={Mic2}
                      title="Язык речи"
                      description="Автоопределение подбирает язык само. Или выберите один язык вручную."
                    />
                    <LanguagePicker
                      value={settings.language}
                      onChange={(language) => setSettings({ ...settings, language })}
                    />
                  </>
                ) : null}

                {isLocal ? (
                  <>
                    <PanelIntro
                      icon={HardDrive}
                      title="Локально"
                      description="Распознавание на вашем компьютере без отправки аудио в сеть."
                    />
                    <LocalLanguageLocked />
                  </>
                ) : null}

                {isDevice ? (
                  <>
                    <PanelIntro
                      icon={SlidersHorizontal}
                      title="Настройки"
                      description="Проверьте микрофон и назначьте горячую клавишу для записи."
                      compact
                    />
                    <DevicePanel
                      base={base}
                      hotkey={settings.hotkey}
                      inputDeviceIndex={settings.inputDeviceIndex}
                      engineOnline={engineOnline === true}
                      onHotkeyChange={(hotkey) => setSettings({ ...settings, hotkey })}
                      onMicChange={(inputDeviceIndex) =>
                        setSettings({ ...settings, inputDeviceIndex })
                      }
                    />
                  </>
                ) : null}
              </div>
            </div>
          )}
        </main>
      </div>

      {settings ? <SaveNotice message={status} kind={statusKind} /> : null}
    </div>
  );
}
