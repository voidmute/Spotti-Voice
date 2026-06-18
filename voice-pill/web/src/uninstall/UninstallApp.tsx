import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Minus, Trash2, X } from "lucide-react";

export function UninstallApp() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function onUninstall() {
    setBusy(true);
    setError("");
    try {
      const result = await window.spottiVoice?.runUninstall?.();
      if (result?.ok) {
        setDone(true);
        return;
      }
      setError("Не удалось удалить приложение. Повторите или удалите папку вручную.");
      setBusy(false);
    } catch {
      setError("Не удалось удалить приложение.");
      setBusy(false);
    }
  }

  return (
    <div className="settings-app settings-app--v2 settings-app--figjam">
      <header className="settings-titlebar">
        <div className="settings-titlebar__drag" aria-hidden />
        <div className="settings-titlebar__brand">
          <img className="settings-titlebar__logo" src="./app-icon.png" alt="" />
          <div className="settings-titlebar__titles">
            <span className="settings-titlebar__name">Spotti Voice</span>
            <span className="settings-titlebar__subtitle">Удаление</span>
          </div>
        </div>
        <div className="settings-titlebar__center" />
        <div className="settings-titlebar__controls">
          <button
            type="button"
            className="settings-win-btn"
            aria-label="Свернуть"
            onClick={() => void window.spottiVoice?.minimizeWindow?.()}
          >
            <Minus size={18} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            className="settings-win-btn settings-win-btn--close"
            aria-label="Закрыть"
            onClick={() => void window.spottiVoice?.closeWindow?.()}
          >
            <X size={18} strokeWidth={2.25} />
          </button>
        </div>
      </header>

      <div className="settings-body settings-body--uninstall">
        <main className="settings-main settings-main--uninstall">
          <div className="settings-stage">
            {done ? (
              <div className="settings-panel-view">
                <header className="settings-panel-view__head">
                  <div className="settings-panel-view__icon">
                    <CheckCircle2 size={22} strokeWidth={2} aria-hidden />
                  </div>
                  <div>
                    <h2>Удалено</h2>
                    <p>Spotti Voice удалён с этого компьютера. Окно закроется автоматически.</p>
                  </div>
                </header>
              </div>
            ) : (
              <div className="settings-panel-view">
                <header className="settings-panel-view__head">
                  <div className="settings-panel-view__icon settings-panel-view__icon--danger">
                    <Trash2 size={22} strokeWidth={2} aria-hidden />
                  </div>
                  <div>
                    <h2>Удалить Spotti Voice?</h2>
                    <p>
                      Будут удалены приложение, ярлыки и настройки. Голосовые модели whisper.cpp в
                      %APPDATA%\SpottiVoice останутся — удалите вручную при необходимости.
                    </p>
                  </div>
                </header>

                {error ? (
                  <p className="settings-cloud-auth__alert" role="alert">
                    <AlertCircle size={15} strokeWidth={2.25} aria-hidden />
                    <span>{error}</span>
                  </p>
                ) : null}

                <div className="setup-actions">
                  <button
                    type="button"
                    className="settings-btn settings-btn--ghost"
                    disabled={busy}
                    onClick={() => void window.spottiVoice?.closeWindow?.()}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="settings-btn settings-btn--danger"
                    disabled={busy}
                    onClick={() => void onUninstall()}
                  >
                    {busy ? (
                      <Loader2 className="settings-loading__spin" size={16} />
                    ) : (
                      <Trash2 size={16} aria-hidden />
                    )}
                    <span>Удалить</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
