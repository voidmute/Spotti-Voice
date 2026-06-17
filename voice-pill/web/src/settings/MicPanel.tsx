import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Radio } from "lucide-react";
import {
  fetchAudioDevices,
  setMicMonitor,
  subscribeEngineEvents,
  type AudioInputDevice,
  type EngineEvent,
} from "../lib/engineApi";

type MicPanelProps = {
  base: string;
  inputDeviceIndex: number | null;
  engineOnline: boolean;
  onMicChange: (deviceIndex: number | null) => void;
};

function MicLevelMeter({ level }: { level: number }) {
  const pct = Math.min(100, Math.round(level * 100));
  return (
    <div className="settings-meter" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="settings-meter__track">
        <div className="settings-meter__fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="settings-meter__label">{pct > 4 ? "Слышно" : "Тихо"}</span>
    </div>
  );
}

export function MicPanel({ base, inputDeviceIndex, engineOnline, onMicChange }: MicPanelProps) {
  const [monitoring, setMonitoring] = useState(false);
  const [monitorError, setMonitorError] = useState("");
  const [displayLevel, setDisplayLevel] = useState(0);
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [devicesError, setDevicesError] = useState("");
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
        levelTargetRef.current = Math.max(0, Math.min(1, event.level));
      }
    });
    return unsubscribe;
  }, [base, engineOnline]);

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
  }, [base, monitoring, inputDeviceIndex]);

  const toggleMonitor = useCallback(async () => {
    if (!engineOnline) return;
    const next = !monitoring;
    setMonitorError("");
    try {
      const res = await setMicMonitor(base, next, next ? inputDeviceIndex : null);
      if (res.ok) {
        setMonitoring(next);
        if (!next) levelTargetRef.current = 0;
      } else {
        setMonitoring(false);
        levelTargetRef.current = 0;
        setMonitorError(
          res.error === "device_open_failed"
            ? "Не удалось открыть микрофон. Выберите другое устройство."
            : "Микрофон недоступен. Перезапустите Spotti Voice.",
        );
      }
    } catch {
      setMonitoring(false);
      levelTargetRef.current = 0;
      setMonitorError("Не удалось включить проверку микрофона.");
    }
  }, [base, engineOnline, monitoring, inputDeviceIndex]);

  const selectedValue =
    inputDeviceIndex === null || inputDeviceIndex === undefined ? "" : String(inputDeviceIndex);

  return (
    <div className="settings-panel-view">
      <header className="settings-panel-view__head">
        <div className="settings-panel-view__icon">
          <Mic size={22} strokeWidth={2} aria-hidden />
        </div>
        <div>
          <h2>Микрофон</h2>
          <p>Устройство ввода и проверка уровня сигнала.</p>
        </div>
      </header>

      <div className="settings-card">
        <label className="settings-field">
          <span className="settings-field__label">Устройство</span>
          <select
            className="settings-select"
            value={selectedValue}
            disabled={!engineOnline || devices.length === 0}
            tabIndex={-1}
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
        {devicesError ? <p className="settings-hint settings-hint--err">{devicesError}</p> : null}
        <MicLevelMeter level={displayLevel} />
        {monitorError ? <p className="settings-hint settings-hint--err">{monitorError}</p> : null}
        <button
          type="button"
          className={`settings-btn settings-btn--secondary${monitoring ? " is-active" : ""}`}
          tabIndex={-1}
          onClick={() => void toggleMonitor()}
          disabled={!engineOnline}
        >
          <Radio size={16} strokeWidth={2.25} aria-hidden />
          {monitoring ? "Остановить" : "Проверить микрофон"}
        </button>
      </div>
    </div>
  );
}
