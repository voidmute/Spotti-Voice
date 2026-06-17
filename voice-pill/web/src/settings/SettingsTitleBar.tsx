import { type ReactNode } from "react";
import { Minus, X } from "lucide-react";

type SettingsTitleBarProps = {
  modeSwitch?: ReactNode;
};

export function SettingsTitleBar({ modeSwitch }: SettingsTitleBarProps) {
  return (
    <header className="settings-titlebar" data-tauri-drag-region>
      <div className="settings-titlebar__brand">
        <img className="settings-titlebar__logo" src="./white-only.png" alt="" />
        <div className="settings-titlebar__titles">
          <span className="settings-titlebar__name">Spotti Voice</span>
        </div>
      </div>

      <div className="settings-titlebar__center">{modeSwitch}</div>

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
  );
}
