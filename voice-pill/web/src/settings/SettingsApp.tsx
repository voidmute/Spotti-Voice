import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  Mic2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  SlidersHorizontal,
  History,
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

function normalizeSettingsSection(value: unknown): SettingsSection {
  if (value === "history") return "history";
  return "settings";
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

function SidebarNav({
  value,
  onChange,
}: {
  value: SettingsSection;
  onChange: (section: SettingsSection) => void;
}) {
  const items: {
    id: SettingsSection;
    icon: ComponentType<{ size?: number; strokeWidth?: number }>;
    title: string;
  }[] = [
    { id: "settings", icon: SlidersHorizontal, title: "Настройки" },
    { id: "history", icon: History, title: "История" },
  ];

  return (
    <nav className="settings-rail" aria-label="Разделы">
      {items.map((item) => {
        const Icon = item.icon;
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={`settings-rail__item${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(item.id)}
          >
            <Icon size={18} strokeWidth={2.25} aria-hidden />
            <span>{item.title}</span>
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

function PanelHead({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  title: string;
  description: string;
}) {
  return (
    <header className="settings-panel__head">
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
  const [section, setSection] = useState<SettingsSection>("settings");
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
    setSettings({ ...settings, settingsSection: next });
  }

  function onModeChange(next: SttMode) {
    if (!settings) return;
    if (next === "cloud") {
      setSettings({
        ...settings,
        sttMode: "cloud",
        settingsSection: section,
      });
    } else {
      setSettings({
        ...settings,
        sttMode: "local",
        language: LOCAL_STT_LANGUAGE,
        settingsSection: section,
      });
    }
  }

  const sttMode = settings?.sttMode ?? "local";
  const isCloud = sttMode === "cloud";
  const isSettings = section === "settings";
  const isHistory = section === "history";

  return (
    <div className="settings-app">
      <SettingsTitleBar
        modeSwitch={
          settings ? (
            <ModeSwitch
              value={sttMode}
              onChange={onModeChange}
              disabled={engineOnline !== true}
            />
          ) : null
        }
      />

      <div className="settings-body">
        <aside className="settings-sidebar">
          {settings ? (
            <SidebarNav value={section} onChange={onSectionChange} />
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
            <div className="settings-shell">
              <div className="settings-stage settings-stage--scroll">
                {isHistory ? (
                  <>
                    <PanelHead
                      icon={History}
                      title="История"
                      description="Фразы, которые вы продиктовали. Можно править, копировать или удалить."
                    />
                    <HistoryPanel base={base} engineOnline={engineOnline === true} />
                  </>
                ) : isSettings ? (
                  <>
                    <PanelHead
                      icon={SlidersHorizontal}
                      title="Настройки"
                      description="Микрофон и горячая клавиша для записи."
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

                {isSettings && isCloud ? (
                  <section className="settings-mode-block" aria-label="Облачный режим">
                    <CloudAuthPanel base={base} />
                    <PanelHead
                      icon={Mic2}
                      title="Язык речи"
                      description="Автоопределение или один язык вручную."
                    />
                    <LanguagePicker
                      value={settings.language}
                      onChange={(language) => setSettings({ ...settings, language })}
                    />
                  </section>
                ) : null}

                {isSettings && !isCloud ? (
                  <section className="settings-mode-block" aria-label="Локальный режим">
                    <PanelHead
                      icon={HardDrive}
                      title="Локальный режим"
                      description="Распознавание на компьютере без отправки аудио в сеть."
                    />
                    <LocalLanguageLocked />
                  </section>
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
