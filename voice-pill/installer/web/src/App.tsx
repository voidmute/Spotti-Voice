import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FolderOpen,
  HardDriveDownload,
  Loader2,
  Minus,
  Shield,
  Square,
  X,
} from "lucide-react";
import { SetupMark } from "./components/SetupMark";

type Step = "welcome" | "destination" | "installing" | "done" | "error";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function App() {
  const [step, setStep] = useState<Step>("welcome");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState("3.0.0");
  const [fileCount, setFileCount] = useState(0);
  const [payloadBytes, setPayloadBytes] = useState(0);
  const [installDir, setInstallDir] = useState("");
  const [desktopShortcut, setDesktopShortcut] = useState(true);
  const [startMenuShortcut, setStartMenuShortcut] = useState(true);
  const [launchAfter, setLaunchAfter] = useState(true);
  const [progressPct, setProgressPct] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [logPath, setLogPath] = useState("");

  const setup = window.spottiSetup;

  const showError = (message: string) => {
    setError(message);
    setStep("error");
  };

  useEffect(() => {
    if (!setup) {
      showError("Запустите SpottiVoice-Setup.exe");
      setLoading(false);
      return;
    }

    let detach = () => {};
    void Promise.all([setup.getMeta(), setup.getLogPath().catch(() => "")]).then(([meta, log]) => {
      if (log) setLogPath(log);
      if (!meta.ok) {
        showError(meta.error || "Не удалось прочитать пакет установки");
        return;
      }
      setVersion(meta.version || "3.0.0");
      setInstallDir(meta.defaultDir || "");
      setFileCount(meta.fileCount || 0);
      setPayloadBytes(meta.payloadBytes || 0);
      if (meta.logPath) setLogPath(meta.logPath);
    }).catch((e) => {
      showError(e instanceof Error ? e.message : "Ошибка установки");
    }).finally(() => setLoading(false));

    detach = setup.onProgress((payload) => {
      if (payload.phase === "copy" && payload.total) {
        const pct = Math.min(100, Math.round(((payload.copied || 0) / payload.total) * 100));
        setProgressPct(pct);
        setProgressLabel(payload.currentFile || "Копирование файлов…");
      } else if (payload.phase === "prepare") {
        setProgressLabel("Подготовка…");
      } else if (payload.phase === "done") {
        setProgressPct(100);
        setProgressLabel("Готово");
        setStep("done");
      }
    });

    return () => detach();
  }, [setup]);

  const stepLabel = useMemo(() => {
    switch (step) {
      case "welcome":
        return "Шаг 1 из 3";
      case "destination":
        return "Шаг 2 из 3";
      case "installing":
        return "Шаг 3 из 3";
      case "done":
        return "Готово";
      default:
        return "";
    }
  }, [step]);

  const runInstall = async () => {
    if (!setup || !installDir.trim()) return;
    setError("");
    setStep("installing");
    setProgressPct(0);
    setProgressLabel("Запуск…");
    try {
      const result = await setup.install({
        installDir: installDir.trim(),
        desktopShortcut,
        startMenuShortcut,
        launchAfter,
      });
      if (result.cancelled) {
        setStep("destination");
        return;
      }
      setStep("done");
    } catch (e) {
      showError(e instanceof Error ? e.message : "Установка не удалась");
    }
  };

  const pickDir = async () => {
    if (!setup) return;
    const picked = await setup.pickInstallDir();
    if (!picked.cancelled && picked.path) {
      setInstallDir(picked.path);
    }
  };

  return (
    <div className="setup-page">
      <header className="setup-chrome">
        <div className="setup-chrome-drag">
          <SetupMark size={28} />
          <div>
            <div className="setup-chrome-title">Spotti Voice</div>
            <div className="setup-chrome-sub">Установка · v{version}</div>
          </div>
        </div>
        {setup ? (
          <div className="setup-chrome-controls">
            <button type="button" className="setup-win-btn" aria-label="Свернуть" onClick={() => void setup.minimize()}>
              <Minus size={16} />
            </button>
            <button type="button" className="setup-win-btn" aria-label="Развернуть" onClick={() => void setup.maximize()}>
              <Square size={14} />
            </button>
            <button type="button" className="setup-win-btn setup-win-btn--close" aria-label="Закрыть" onClick={() => void setup.close()}>
              <X size={16} />
            </button>
          </div>
        ) : null}
      </header>

      <main className="setup-main">
        <div className="setup-card">
          {loading ? (
            <p className="setup-lead icon-row">
              <Loader2 className="spin" size={18} aria-hidden />
              Загрузка…
            </p>
          ) : null}

          {!loading && step !== "error" ? <p className="setup-step-label">{stepLabel}</p> : null}

          {error && step !== "error" ? <div className="setup-error">{error}</div> : null}

          {!loading && step === "error" ? (
            <>
              <div className="setup-error-panel">
                <AlertCircle size={22} aria-hidden />
                <div>
                  <h1 className="setup-title setup-title--compact">Ошибка установки</h1>
                  <p className="setup-lead setup-lead--error">{error || "Неизвестная ошибка."}</p>
                  {logPath ? (
                    <p className="setup-meta setup-meta--log">
                      Подробности: <span>{logPath}</span>
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="setup-actions">
                <button type="button" className="setup-btn setup-btn-primary" onClick={() => void setup?.close()}>
                  Закрыть
                </button>
              </div>
            </>
          ) : null}

          {!loading && step === "welcome" ? (
            <>
              <h1 className="setup-title">Установка Spotti Voice</h1>
              <p className="setup-lead">
                PC-check для GTA5RP и RAGE.MP. Сканирование клиента и отчёт для сервера.
              </p>
              <div className="setup-meta">
                <span>Версия: {version}</span>
                <span>Файлов в пакете: {fileCount}</span>
                <span>Размер: {formatBytes(payloadBytes)}</span>
              </div>
              <div className="setup-actions">
                <button type="button" className="setup-btn" onClick={() => void setup?.cancel()}>
                  Отмена
                </button>
                <button type="button" className="setup-btn setup-btn-primary" onClick={() => setStep("destination")}>
                  Далее
                  <ChevronRight size={16} aria-hidden />
                </button>
              </div>
            </>
          ) : null}

          {!loading && step === "destination" ? (
            <>
              <h1 className="setup-title">Куда установить</h1>
              <p className="setup-lead">Выберите папку. Для сканирования нужны права администратора — рекомендуем Program Files.</p>
              <div className="setup-field">
                <label htmlFor="install-dir">Папка установки</label>
                <div className="setup-path-row">
                  <input
                    id="install-dir"
                    value={installDir}
                    onChange={(e) => setInstallDir(e.target.value)}
                    spellCheck={false}
                  />
                  <button type="button" className="setup-btn" onClick={() => void pickDir()}>
                    <FolderOpen size={16} aria-hidden />
                    Обзор
                  </button>
                </div>
              </div>
              <div className="setup-options">
                <label className="setup-option">
                  <input type="checkbox" checked={desktopShortcut} onChange={(e) => setDesktopShortcut(e.target.checked)} />
                  Ярлык на рабочем столе
                </label>
                <label className="setup-option">
                  <input type="checkbox" checked={startMenuShortcut} onChange={(e) => setStartMenuShortcut(e.target.checked)} />
                  Ярлык в меню «Пуск»
                </label>
                <label className="setup-option">
                  <input type="checkbox" checked={launchAfter} onChange={(e) => setLaunchAfter(e.target.checked)} />
                  Запустить Spotti Voice после установки
                </label>
              </div>
              <div className="setup-actions">
                <button type="button" className="setup-btn" onClick={() => setStep("welcome")}>
                  Назад
                </button>
                <button
                  type="button"
                  className="setup-btn setup-btn-primary"
                  disabled={!installDir.trim()}
                  onClick={() => void runInstall()}
                >
                  <HardDriveDownload size={16} aria-hidden />
                  Установить
                </button>
              </div>
            </>
          ) : null}

          {!loading && step === "installing" ? (
            <>
              <h1 className="setup-title">Установка…</h1>
              <p className="setup-lead">Копируем файлы в выбранную папку. Не закрывайте окно.</p>
              <div className="setup-progress">
                <div className="setup-progress-track">
                  <div className="setup-progress-fill" style={{ width: `${progressPct}%` }} />
                </div>
                <p className="setup-progress-meta">{progressLabel}</p>
              </div>
            </>
          ) : null}

          {!loading && step === "done" ? (
            <>
              <div className="setup-success icon-row">
                <CheckCircle2 size={18} aria-hidden />
                Spotti Voice установлен
              </div>
              <h1 className="setup-title">Готово</h1>
              <p className="setup-lead">
                Приложение установлено в <strong>{installDir}</strong>. Окно закроется автоматически.
              </p>
              <div className="setup-meta">
                <span className="icon-row">
                  <Shield size={14} aria-hidden />
                  Удаление: Параметры → Приложения → Spotti Voice
                </span>
              </div>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
