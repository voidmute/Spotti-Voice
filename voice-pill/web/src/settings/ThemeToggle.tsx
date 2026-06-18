import { Moon, Sun } from "lucide-react";

export type UiTheme = "light" | "dark";

const STORAGE_KEY = "spotti-ui-theme";

export function readStoredTheme(): UiTheme {
  if (typeof localStorage === "undefined") return "light";
  return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
}

export function persistTheme(theme: UiTheme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function ThemeToggle({
  value,
  onChange,
}: {
  value: UiTheme;
  onChange: (theme: UiTheme) => void;
}) {
  const dark = value === "dark";

  return (
    <div className="settings-theme-toggle" role="group" aria-label="Тема интерфейса">
      <span className="settings-theme-toggle__label">Тема</span>
      <button
        type="button"
        className={`settings-theme-toggle__btn${!dark ? " is-active" : ""}`}
        aria-pressed={!dark}
        tabIndex={-1}
        onClick={() => onChange("light")}
      >
        <Sun size={15} strokeWidth={2.25} aria-hidden />
        <span>Светлая</span>
      </button>
      <button
        type="button"
        className={`settings-theme-toggle__btn${dark ? " is-active" : ""}`}
        aria-pressed={dark}
        tabIndex={-1}
        onClick={() => onChange("dark")}
      >
        <Moon size={15} strokeWidth={2.25} aria-hidden />
        <span>Тёмная</span>
      </button>
    </div>
  );
}
