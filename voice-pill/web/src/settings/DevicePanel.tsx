import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Mic, Radio } from "lucide-react";
import {
  fetchAudioDevices,
  fetchMicLevel,
  injectTest,
  setMicMonitor,
  subscribeEngineEvents,
  type AudioInputDevice,
  type EngineEvent,
} from "../lib/engineApi";
import { formatHotkeyForDisplay, hotkeyFromKeyboardEvent } from "../lib/userCopy";

type DevicePanelProps = {
  base: string;
  hotkey: string;
  inputDeviceIndex: number | null;
  engineOnline: boolean;
  onHotkeyChange: (hotkey: string) => void;
  onMicChange: (deviceIndex: number | null) => void;
};

function HotkeyDisplay({ hotkey }: { hotkey: string }) {
  const keys = formatHotkeyForDisplay(hotkey);
  const label = keys.join(" + ");
  return (
    <div className="settings-hotkey-keys" aria-label={`Горячая клавиша: ${label}`}>
      {keys.map((key, index) => (
        <Fragment key={`${key}-${index}`}>
          {index > 0 ? <span className="settings-hotkey-keys__sep" aria-hidden>+</span> : null}
          <kbd>{key}</kbd>
        </Fragment>
      ))}
    </div>
  );
}

function MicLevelMeter({ level }: { level: number }) {
  const pct = Math.min(100, Math.round(level * 100));
  return (
    <div className="settings-mic-meter" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="settings-mic-meter__track">
        <div className="settings-mic-meter__fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="settings-mic-meter__label">{pct > 4 ? "Слышно" : "Тихо"}</span>
    </div>
  );
}

export function DevicePanel({
  base,
  hotkey,
  inputDeviceIndex,
  engineOnline,
  onHotkeyChange,
  onMicChange,
}: DevicePanelProps) {
  const [monitoring, setMonitoring] = useState(false);
  const [monitorError, setMonitorError] = useState("");
  const [displayLevel, setDisplayLevel] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [devicesError, setDevicesError] = useState("");
  const [injectTestMsg, setInjectTestMsg] = useState("");
  const [injectTesting, setInjectTesting] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);
  const prevDeviceRef = useRef<number | null>(inputDeviceIndex);
  const monitoringRef = useRef(false);
  const levelTargetRef = useRef(0);

  useEffect(() => {
    monitoringRef.current = monitoring;
    if (!monitoring) {
      levelTargetRef.current = 0;
      setDisplayLevel(0);
    }
  }, [monitoring]);

  useEffect(() => {
    let frame = 0;
    const smooth = () => {
      const target = levelTargetRef.current;
      setDisplayLevel((prev) => {
        const alpha = target > prev ? 0.55 : 0.28;
        const next = prev + (target - prev) * alpha;
        return Math.abs(next - target) < 0.004 ? target : next;
      });
      frame = requestAnimationFrame(smooth);
    };
    frame = requestAnimationFrame(smooth);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!engineOnline) return undefined;
    const unsubscribe = subscribeEngineEvents(base, (event: EngineEvent) => {
      if (event.type === "level" && monitoringRef.current) {
        const next = Math.max(0, Math.min(1, event.level));
        levelTargetRef.current = next;
      }
    });
    return unsubscribe;
  }, [base, engineOnline]);

  useEffect(() => {
    if (!monitoring || !engineOnline) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetchMicLevel(base);
        if (cancelled || !monitoringRef.current || !res.ok) return;
        const next = Math.max(0, Math.min(1, res.level));
        levelTargetRef.current = next;
      } catch {
        // polling fallback — ignore transient errors
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 80);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [base, engineOnline, monitoring]);

  useEffect(() => {
    if (!engineOnline) return;
    void fetchAudioDevices(base)
      .then((res) => {
        setDevices(res.devices);
        setDevicesError("");
      })
      .catch(() => setDevicesError("Не удалось загрузить список микрофонов"));
  }, [base, engineOnline]);

  useEffect(() => {
    return () => {
      if (monitoring) void setMicMonitor(base, false).catch(() => undefined);
    };
  }, [base, monitoring]);

  useEffect(() => {
    if (prevDeviceRef.current === inputDeviceIndex) return;
    prevDeviceRef.current = inputDeviceIndex;
    if (!monitoring) return;
    void setMicMonitor(base, false)
      .catch(() => undefined)
      .finally(() => {
        setMonitoring(false);
        levelTargetRef.current = 0;
      });
  }, [base, engineOnline, monitoring, inputDeviceIndex]);

  const runInjectTest = useCallback(async () => {
    if (!engineOnline || injectTesting) return;
    setInjectTestMsg("");
    setInjectTesting(true);
    try {
      const res = await injectTest(base);
      if (res.ok) {
        const strategy = res.lastInject?.strategy ?? "ok";
        setInjectTestMsg(`Вставлено (${strategy}). Проверьте активное поле.`);
      } else {
        setInjectTestMsg("Не удалось вставить. Кликните в поле ввода и повторите.");
      }
    } catch {
      setInjectTestMsg("Тест вставки недоступен — движок офлайн.");
    } finally {
      setInjectTesting(false);
    }
  }, [base, engineOnline, injectTesting]);

  const toggleMonitor = useCallback(async () => {
    if (!engineOnline) return;
    const next = !monitoring;
    setMonitorError("");
    try {
      const res = await setMicMonitor(base, next, next ? inputDeviceIndex : null);
      if (res.ok) {
        setMonitoring(next);
        if (!next) {
          levelTargetRef.current = 0;
        }
      } else if (res.error === "device_open_failed") {
        setMonitoring(false);
        levelTargetRef.current = 0;
        setMonitorError("Не удалось открыть этот микрофон. Выберите другой или «Системный по умолчанию».");
      } else {
        setMonitoring(false);
        levelTargetRef.current = 0;
        setMonitorError("Микрофон недоступен. Перезапустите Spotti Voice.");
      }
    } catch {
      setMonitoring(false);
      levelTargetRef.current = 0;
      setMonitorError("Не удалось включить проверку микрофона.");
    }
  }, [base, engineOnline, monitoring, inputDeviceIndex]);

  useEffect(() => {
    if (!capturing) return undefined;

    void window.spottiVoice?.setHotkeyCapture?.(true);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setCapturing(false);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const combo = hotkeyFromKeyboardEvent(event);
      if (combo) {
        onHotkeyChange(combo);
        setCapturing(false);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    captureRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      void window.spottiVoice?.setHotkeyCapture?.(false);
    };
  }, [capturing, onHotkeyChange]);

  const selectedValue =
    inputDeviceIndex === null || inputDeviceIndex === undefined ? "" : String(inputDeviceIndex);

  return (
    <div className="settings-device">
      <section className="settings-device__block">
        <div className="settings-device__block-head">
          <Mic size={18} strokeWidth={2.25} aria-hidden />
          <div>
            <h3>Микрофон</h3>
            <p>Выберите устройство и проверьте уровень сигнала.</p>
          </div>
        </div>

        <label className="settings-mic-select-wrap">
          <span className="settings-mic-select__label">Устройство ввода</span>
          <select
            className="settings-mic-select"
            value={selectedValue}
            disabled={!engineOnline || devices.length === 0}
            onChange={(event) => {
              const value = event.target.value;
              onMicChange(value === "" ? null : Number(value));
            }}
          >
            <option value="">Системный по умолчанию</option>
            {devices.map((device) => (
              <option key={device.index} value={device.index}>
                {device.name}
                {device.isDefault ? " · по умолчанию" : ""}
              </option>
            ))}
          </select>
        </label>
        {devicesError ? <p className="settings-device__hint settings-device__hint--err">{devicesError}</p> : null}

        <MicLevelMeter level={displayLevel} />
        {monitorError ? <p className="settings-device__hint settings-device__hint--err">{monitorError}</p> : null}
        <button
          type="button"
          className={`settings-btn settings-btn--secondary${monitoring ? " is-active" : ""}`}
          onClick={() => void toggleMonitor()}
          disabled={!engineOnline}
        >
          <Radio size={16} strokeWidth={2.25} aria-hidden />
          {monitoring ? "Остановить проверку" : "Проверить микрофон"}
        </button>
      </section>

      <section className="settings-device__block">
        <div className="settings-device__block-head">
          <Keyboard size={18} strokeWidth={2.25} aria-hidden />
          <div>
            <h3>Вставка в поле</h3>
            <p>Кликните в Notepad или другое поле, затем проверьте вставку без голоса.</p>
          </div>
        </div>
        <button
          type="button"
          className="settings-btn settings-btn--secondary"
          onClick={() => void runInjectTest()}
          disabled={!engineOnline || injectTesting}
        >
          {injectTesting ? "Вставка…" : "Тест вставки"}
        </button>
        {injectTestMsg ? (
          <p
            className={`settings-device__hint${injectTestMsg.startsWith("Вставлено") ? "" : " settings-device__hint--err"}`}
          >
            {injectTestMsg}
          </p>
        ) : null}
      </section>

      <section className="settings-device__block">
        <div className="settings-device__block-head">
          <Keyboard size={18} strokeWidth={2.25} aria-hidden />
          <div>
            <h3>Горячая клавиша</h3>
            <p>Удерживайте сочетание, чтобы говорить. F1–F12 можно без Ctrl. Esc — отмена.</p>
          </div>
        </div>
        <HotkeyDisplay hotkey={hotkey} />
        <div
          ref={captureRef}
          tabIndex={capturing ? 0 : -1}
          className={`settings-hotkey-capture${capturing ? " is-capturing" : ""}`}
        >
          {capturing ? (
            <p className="settings-hotkey-capture__prompt">Нажмите клавишу или сочетание. F4, Ctrl+Shift+V… Esc — отмена.</p>
          ) : null}
          <button
            type="button"
            className="settings-btn settings-btn--ghost"
            onClick={() => setCapturing((value) => !value)}
            disabled={!engineOnline}
          >
            {capturing ? "Отмена" : "Изменить сочетание"}
          </button>
        </div>
      </section>
    </div>
  );
}
