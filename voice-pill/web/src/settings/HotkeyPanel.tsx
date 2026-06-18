import { Fragment, useEffect, useRef, useState } from "react";
import { Keyboard } from "lucide-react";
import { formatHotkeyForDisplay, hotkeyFromKeyboardEvent } from "../lib/userCopy";

type HotkeyPanelProps = {
  hotkey: string;
  engineOnline: boolean;
  onHotkeyChange: (hotkey: string) => void;
  onCapturingChange?: (capturing: boolean) => void;
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

export function HotkeyPanel({
  hotkey,
  engineOnline,
  onHotkeyChange,
  onCapturingChange,
}: HotkeyPanelProps) {
  const [capturing, setCapturing] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onCapturingChange?.(capturing);
  }, [capturing, onCapturingChange]);

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

  return (
    <div className="settings-panel-view">
      <header className="settings-panel-view__head">
        <div className="settings-panel-view__icon">
          <Keyboard size={22} strokeWidth={2} aria-hidden />
        </div>
        <div>
          <h2>Горячая клавиша</h2>
          <p>Удерживайте сочетание, чтобы диктовать. F1-F12 - без Ctrl.</p>
        </div>
      </header>

      <div className="settings-card settings-card--center">
        <HotkeyDisplay hotkey={hotkey} />
        <div
          ref={captureRef}
          tabIndex={capturing ? 0 : -1}
          className={`settings-hotkey-capture${capturing ? " is-capturing" : ""}`}
        >
          {capturing ? (
            <p className="settings-hotkey-capture__prompt">Нажмите клавиши… Esc - отмена</p>
          ) : null}
          <button
            type="button"
            className="settings-btn settings-btn--primary settings-btn--compact"
            tabIndex={-1}
            onClick={() => setCapturing((value) => !value)}
            disabled={!engineOnline}
          >
            {capturing ? "Отмена" : "Изменить сочетание"}
          </button>
        </div>
      </div>
    </div>
  );
}
