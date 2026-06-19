import { useRef } from "react";
import { Moon, Sun } from "lucide-react";
import { animateThemeToggle } from "./motion";

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
  const btnRef = useRef<HTMLButtonElement>(null);
  const dark = value === "dark";

  function toggle() {
    const next = dark ? "light" : "dark";
    animateThemeToggle(btnRef.current);
    onChange(next);
  }

  return (
    <button
      ref={btnRef}
      type="button"
      className="settings-theme-icon-btn"
      aria-label={dark ? "Светлая тема" : "Тёмная тема"}
      aria-pressed={dark}
      tabIndex={-1}
      onClick={toggle}
    >
      {dark ? <Sun size={17} strokeWidth={2.25} aria-hidden /> : <Moon size={17} strokeWidth={2.25} aria-hidden />}
    </button>
  );
}
