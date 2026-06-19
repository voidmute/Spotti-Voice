import { type ReactNode } from "react";
import { Minus, X } from "lucide-react";
import { ThemeToggle, type UiTheme } from "./ThemeToggle";

type SettingsTitleBarProps = {
  theme: UiTheme;
  onThemeChange: (theme: UiTheme) => void;
  modeSwitch?: ReactNode;
};

export function SettingsTitleBar({ theme, onThemeChange, modeSwitch }: SettingsTitleBarProps) {
  const logoSrc = theme === "dark" ? "./white-only.png" : "./brand-mark.png";

  return (
    <header className="settings-titlebar">
      <div className="settings-titlebar__brand">
        <img className="settings-titlebar__logo" src={logoSrc} alt="" />
        <div className="settings-titlebar__titles">
          <span className="settings-titlebar__name">Spotti Voice</span>
          <span className="settings-titlebar__subtitle">Настройки</span>
        </div>
      </div>

      <div className="settings-titlebar__center">{modeSwitch}</div>

      <div className="settings-titlebar__controls">
        <ThemeToggle value={theme} onChange={onThemeChange} />
        <button
          type="button"
          className="settings-win-btn"
          aria-label="Свернуть"
          tabIndex={-1}
          onClick={() => void window.spottiVoice?.minimizeWindow?.()}
        >
          <Minus size={18} strokeWidth={2.25} />
        </button>
        <button
          type="button"
          className="settings-win-btn settings-win-btn--close"
          aria-label="Закрыть"
          tabIndex={-1}
          onClick={() => void window.spottiVoice?.closeWindow?.()}
        >
          <X size={18} strokeWidth={2.25} />
        </button>
      </div>
    </header>
  );
}
