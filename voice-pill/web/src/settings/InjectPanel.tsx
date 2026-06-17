import { useCallback, useState } from "react";
import { MousePointerClick } from "lucide-react";
import { injectTest } from "../lib/engineApi";

type InjectPanelProps = {
  base: string;
  engineOnline: boolean;
};

export function InjectPanel({ base, engineOnline }: InjectPanelProps) {
  const [injectTestMsg, setInjectTestMsg] = useState("");
  const [injectTesting, setInjectTesting] = useState(false);

  const runInjectTest = useCallback(async () => {
    if (!engineOnline || injectTesting) return;
    setInjectTestMsg("");
    setInjectTesting(true);
    try {
      const res = await injectTest(base);
      if (res.ok) {
        const strategy = res.lastInject?.strategy ?? "ok";
        setInjectTestMsg(`Вставлено (${strategy}). Проверьте активное поле.`);
      } else {
        setInjectTestMsg("Не удалось вставить. Кликните в поле ввода и повторите.");
      }
    } catch {
      setInjectTestMsg("Тест вставки недоступен — движок офлайн.");
    } finally {
      setInjectTesting(false);
    }
  }, [base, engineOnline, injectTesting]);

  return (
    <div className="settings-panel-view">
      <header className="settings-panel-view__head">
        <div className="settings-panel-view__icon">
          <MousePointerClick size={22} strokeWidth={2} aria-hidden />
        </div>
        <div>
          <h2>Вставка в поле</h2>
          <p>Проверьте, что текст попадает в активное окно без голоса.</p>
        </div>
      </header>

      <div className="settings-card settings-card--center">
        <p className="settings-card__lead">
          Откройте Notepad или другое поле ввода, кликните в него и нажмите кнопку ниже.
        </p>
        <button
          type="button"
          className="settings-btn settings-btn--primary settings-btn--compact"
          tabIndex={-1}
          onClick={() => void runInjectTest()}
          disabled={!engineOnline || injectTesting}
        >
          {injectTesting ? "Вставка…" : "Тест вставки"}
        </button>
        {injectTestMsg ? (
          <p
            className={`settings-hint${injectTestMsg.startsWith("Вставлено") ? " settings-hint--ok" : " settings-hint--err"}`}
          >
            {injectTestMsg}
          </p>
        ) : null}
      </div>
    </div>
  );
}
