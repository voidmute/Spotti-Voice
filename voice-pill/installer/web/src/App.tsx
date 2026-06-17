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
  Sparkles,
  X,
} from "lucide-react";

type Step = "welcome" | "destination" | "installing" | "done" | "error";

const WIZARD_STEPS = [
  { id: "welcome" as const, icon: Sparkles, title: "Приветствие", hint: "О приложении" },
  { id: "destination" as const, icon: FolderOpen, title: "Папка", hint: "Куда установить" },
  { id: "installing" as const, icon: HardDriveDownload, title: "Установка", hint: "Копирование" },
];

function formatApproxMb(bytes: number) {
  if (bytes <= 0) return "несколько сотен МБ";
  const mb = bytes / (1024 * 1024);
  if (mb < 10) return `~${Math.max(1, Math.ceil(mb))} МБ`;
  return `~${Math.round(mb)} МБ`;
}

function humanProgressLabel(pct: number, currentFile?: string) {
  if (pct >= 95) return "Почти готово…";
  if (pct >= 70) return "Завершаем копирование…";
  if (pct >= 35) return "Копируем файлы…";
  if (pct > 0 && currentFile) {
    const base = currentFile.split(/[/\\]/).pop() || "";
    if (base.toLowerCase().endsWith(".exe")) return "Устанавливаем приложение…";
    return "Копируем файлы…";
  }
  return "Подготавливаем установку…";
}

function stepIndex(step: Step) {
  if (step === "welcome") return 0;
  if (step === "destination") return 1;
  if (step === "installing" || step === "done") return 2;
  return -1;
}

export default function App() {
  const [step, setStep] = useState<Step>("welcome");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState("0.1.0.0");
  const [payloadBytes, setPayloadBytes] = useState(0);
  const [installDir, setInstallDir] = useState("");
  const [desktopShortcut, setDesktopShortcut] = useState(true);
  const [startMenuShortcut, setStartMenuShortcut] = useState(true);
  const [launchAfter, setLaunchAfter] = useState(true);
  const [progressPct, setProgressPct] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [logPath, setLogPath] = useState("");

  const setup = window.spottiSetup;
  const activeIdx = stepIndex(step);
  const approxSize = useMemo(() => formatApproxMb(payloadBytes), [payloadBytes]);

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

  const showError = (message: string) => {
    setError(message);
    setStep("error");
  };

  useEffect(() => {
    if (!setup) {
      showError("Запустите установщик Spotti Voice.");
      setLoading(false);
      return;
    }

    let detach = () => {};
    void Promise.all([setup.getMeta(), setup.getLogPath().catch(() => "")])
      .then(([meta, log]) => {
        if (log) setLogPath(log);
        if (!meta.ok) {
          showError(meta.error || "Не удалось подготовить установку.");
          return;
        }
        setVersion(meta.version || "0.1.0.0");
        setInstallDir(meta.defaultDir || "");
        setPayloadBytes(meta.payloadBytes || 0);
        if (meta.logPath) setLogPath(meta.logPath);
      })
      .catch((e) => {
        showError(e instanceof Error ? e.message : "Ошибка установки");
      })
      .finally(() => setLoading(false));

    detach = setup.onProgress((payload) => {
      if (payload.phase === "copy" && payload.total) {
        const pct = Math.min(100, Math.round(((payload.copied || 0) / payload.total) * 100));
        setProgressPct(pct);
        setProgressLabel(humanProgressLabel(pct, payload.currentFile));
      } else if (payload.phase === "download") {
        const pct = typeof payload.pct === "number" ? payload.pct : 0;
        setProgressPct(pct);
        setProgressLabel(
          typeof payload.label === "string" ? payload.label : "Загружаем файлы…",
        );
      } else if (payload.phase === "prepare") {
        setProgressLabel(
          typeof payload.label === "string" ? payload.label : "Подготавливаем установку…",
        );
      } else if (payload.phase === "done") {
        setProgressPct(100);
        setProgressLabel("Готово");
        setStep("done");
      }
    });

    return () => detach();
  }, [setup]);

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

  const stageClass = `setup-stage-content${!loading ? " is-visible" : ""}`;

  return (
    <div className="setup-app">
      <header className="settings-titlebar">
        <div className="settings-titlebar__brand">
          <img className="settings-titlebar__logo" src="./white-only.png" alt="" />
          <div className="settings-titlebar__titles">
            <span className="settings-titlebar__name">Spotti Voice</span>
            <span className="settings-titlebar__subtitle">Установка · v{version}</span>
          </div>
        </div>
        {setup ? (
          <div className="settings-titlebar__controls">
            <button type="button" className="settings-win-btn" aria-label="Свернуть" onClick={() => void setup.minimize()}>
              <Minus size={18} strokeWidth={2.25} />
            </button>
            <button
              type="button"
              className="settings-win-btn settings-win-btn--close"
              aria-label="Закрыть"
              onClick={() => void setup.close()}
            >
              <X size={18} strokeWidth={2.25} />
            </button>
          </div>
        ) : null}
      </header>

      <div className="settings-body">
        <aside className="settings-sidebar" aria-hidden={step === "error"}>
          <div className="settings-sidebar__brand">
            <div className="settings-sidebar__mark setup-hero-mark">
              <img src="./white-only.png" alt="" />
            </div>
          </div>

          <nav className="settings-tabs" aria-label="Шаги установки">
            {WIZARD_STEPS.map((item, idx) => {
              const Icon = item.icon;
              const isActive = activeIdx === idx;
              const isDone = activeIdx > idx || step === "done";
              return (
                <div
                  key={item.id}
                  className={`settings-tab${isActive ? " is-active" : ""}${isDone ? " is-done" : ""}`}
                  aria-current={isActive ? "step" : undefined}
                >
                  <span className="settings-tab__icon" aria-hidden>
                    {isDone && !isActive ? <CheckCircle2 size={18} strokeWidth={2.25} /> : <Icon size={18} strokeWidth={2.25} />}
                  </span>
                  <span className="settings-tab__copy">
                    <span className="settings-tab__title">{item.title}</span>
                    <span className="settings-tab__hint">{item.hint}</span>
                  </span>
                </div>
              );
            })}
          </nav>
        </aside>

        <main className="settings-main">
          <div className="settings-stage">
            {loading ? (
              <div className="settings-loading">
                <Loader2 className="spin" size={20} aria-hidden />
                Загрузка…
              </div>
            ) : null}

            {!loading && step !== "error" ? <p className="setup-step-label">{stepLabel}</p> : null}

            {!loading && step === "error" ? (
              <div className={stageClass}>
                <div className="setup-error-panel">
                  <AlertCircle size={22} aria-hidden />
                  <div>
                    <div className="settings-panel__head">
                      <h2>Ошибка установки</h2>
                      <p className="settings-panel__desc">{error || "Неизвестная ошибка."}</p>
                    </div>
                    {logPath ? (
                      <p className="setup-meta setup-meta--log">
                        Журнал установки сохранён на этом компьютере.
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="setup-actions">
                  <button type="button" className="settings-btn settings-btn--primary" onClick={() => void setup?.close()}>
                    Закрыть
                  </button>
                </div>
              </div>
            ) : null}

            {!loading && step === "welcome" ? (
              <div className={stageClass}>
                <div className="setup-welcome-hero">
                  <img className="setup-welcome-hero__logo" src="./white-only.png" alt="" />
                  <div>
                    <h2 className="setup-welcome-hero__title">Spotti Voice</h2>
                    <p className="setup-welcome-hero__subtitle">
                      Установите Spotti Voice на этот компьютер.
                    </p>
                  </div>
                </div>
                <div className="setup-meta setup-meta--friendly">
                  <span>Версия {version}</span>
                  <span>Размер установки: {approxSize}</span>
                </div>
                <div className="setup-actions">
                  <button type="button" className="settings-btn settings-btn--ghost" onClick={() => void setup?.cancel()}>
                    Отмена
                  </button>
                  <button type="button" className="settings-btn settings-btn--primary" onClick={() => setStep("destination")}>
                    Далее
                    <ChevronRight size={16} aria-hidden />
                  </button>
                </div>
              </div>
            ) : null}

            {!loading && step === "destination" ? (
              <div className={stageClass}>
                <div className="settings-panel__head">
                  <h2>Куда установить</h2>
                  <p className="settings-panel__desc">
                    Выберите папку для Spotti Voice. По умолчанию — в вашем профиле, без прав администратора.
                  </p>
                </div>
                <div className="setup-field">
                  <label htmlFor="install-dir">Папка установки</label>
                  <div className="setup-path-row">
                    <input
                      id="install-dir"
                      value={installDir}
                      onChange={(e) => setInstallDir(e.target.value)}
                      spellCheck={false}
                    />
                    <button type="button" className="settings-btn settings-btn--ghost" onClick={() => void pickDir()}>
                      <FolderOpen size={16} aria-hidden />
                      Изменить папку
                    </button>
                  </div>
                  <p className="setup-field-hint">Понадобится около {approxSize} свободного места на диске.</p>
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
                  <button type="button" className="settings-btn settings-btn--ghost" onClick={() => setStep("welcome")}>
                    Назад
                  </button>
                  <button
                    type="button"
                    className="settings-btn settings-btn--primary"
                    disabled={!installDir.trim()}
                    onClick={() => void runInstall()}
                  >
                    <HardDriveDownload size={16} aria-hidden />
                    Установить
                  </button>
                </div>
              </div>
            ) : null}

            {!loading && step === "installing" ? (
              <div className={stageClass}>
                <div className="settings-panel__head">
                  <h2>Установка…</h2>
                  <p className="settings-panel__desc">Не закрывайте окно, пока копируются файлы.</p>
                </div>
                <div className="settings-mic-meter setup-progress">
                  <div className="settings-mic-meter__track">
                    <div className="settings-mic-meter__fill" style={{ width: `${progressPct}%` }} />
                  </div>
                  <p className="settings-mic-meter__label">{progressLabel}</p>
                </div>
              </div>
            ) : null}

            {!loading && step === "done" ? (
              <div className={stageClass}>
                <div className="setup-banner setup-banner--success">
                  <CheckCircle2 size={18} aria-hidden />
                  Spotti Voice установлен
                </div>
                <div className="settings-panel__head">
                  <h2>Готово</h2>
                  <p className="settings-panel__desc">
                    Приложение установлено. {launchAfter ? "Сейчас откроется Spotti Voice." : "Запустите его из меню «Пуск»."}
                  </p>
                </div>
                <div className="setup-meta">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <Shield size={14} aria-hidden />
                    Удаление: Параметры → Приложения → Spotti Voice
                  </span>
                </div>
                <div className="setup-actions">
                  <button type="button" className="settings-btn settings-btn--primary" onClick={() => void setup?.close()}>
                    Закрыть
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
