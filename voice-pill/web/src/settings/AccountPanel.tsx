import { User } from "lucide-react";
import { CloudAuthPanel } from "./CloudAuthPanel";
import type { SttMode } from "./ModeSwitch";

type AccountPanelProps = {
  base: string;
  sttMode: SttMode;
  onRequestSignIn: () => void;
};

export function AccountPanel({ base, sttMode, onRequestSignIn }: AccountPanelProps) {
  return (
    <div className="settings-panel-view">
      <header className="settings-panel-view__head">
        <div className="settings-panel-view__icon">
          <User size={22} strokeWidth={2} aria-hidden />
        </div>
        <div>
          <h2>Аккаунт</h2>
          <p>Discord для облачного распознавания. Язык определяется автоматически.</p>
        </div>
      </header>

      {sttMode === "cloud" ? (
        <CloudAuthPanel base={base} onInAppSignIn={onRequestSignIn} />
      ) : (
        <div className="settings-card settings-account-local-hint">
          <p className="settings-hint">
            Локальный режим не требует входа. Переключитесь на <strong>Облако</strong> вверху, чтобы
            войти через Discord.
          </p>
          <button type="button" className="settings-btn settings-btn--secondary" tabIndex={-1} onClick={onRequestSignIn}>
            Перейти к входу
          </button>
        </div>
      )}
    </div>
  );
}
