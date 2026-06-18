import { useEffect, useState } from "react";
import { CheckCircle2, Download, HardDrive, Loader2 } from "lucide-react";
import { LanguageFlag } from "./LanguageFlag";
import { languageFlagCountry } from "./voiceLanguages";

type WhisperInstallStatus = {
  ready: boolean;
  phase: string;
  percent: number;
  message: string;
  installDir?: string | null;
};

async function fetchWhisperStatus(base: string): Promise<WhisperInstallStatus> {
  const res = await fetch(`${base}/api/whisper/install-status`);
  if (!res.ok) {
    return {
      ready: false,
      phase: "idle",
      percent: 0,
      message: "Не удалось проверить whisper.cpp",
    };
  }
  return res.json();
}

async function startWhisperInstall(base: string): Promise<void> {
  await fetch(`${base}/api/whisper/install`, { method: "POST" });
}

export function LocalWhisperPanel({ base }: { base: string }) {
  const [status, setStatus] = useState<WhisperInstallStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const next = await fetchWhisperStatus(base);
        if (cancelled) return;
        setStatus(next);
        if (!next.ready) {
          if (next.phase === "idle") {
            void startWhisperInstall(base).catch(() => undefined);
          }
          timer = setTimeout(tick, 1200);
        }
      } catch {
        if (!cancelled) {
          timer = setTimeout(tick, 2000);
        }
      }
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [base]);

  const ready = status?.ready;
  const installing = status && !status.ready && status.phase !== "idle";
  const percent = Math.max(0, Math.min(100, status?.percent ?? 0));

  return (
    <div className="settings-local-stack">
      <div className="settings-local-hero">
        <span className="settings-local-hero__badge">
          <LanguageFlag
            country={languageFlagCountry("ru") ?? "RU"}
            className="settings-lang-chip__flag"
          />
          <span>Русский</span>
        </span>
        <p className="settings-local-hero__note">
          Локальный режим распознаёт только русский. Для других языков переключитесь на Облако.
        </p>
      </div>

      <section className="settings-whisper-card" aria-label="whisper.cpp">
        <div className="settings-whisper-card__head">
          <span className="settings-whisper-card__icon" aria-hidden>
            {ready ? (
              <CheckCircle2 size={18} strokeWidth={2.25} />
            ) : installing ? (
              <Loader2 className="settings-loading__spin" size={18} strokeWidth={2.25} />
            ) : (
              <HardDrive size={18} strokeWidth={2.25} />
            )}
          </span>
          <div>
            <h3 className="settings-whisper-card__title">whisper.cpp</h3>
            <p className="settings-whisper-card__meta">
              {ready
                ? "Локальное распознавание готово."
                : status?.message || "Проверка whisper.cpp…"}
            </p>
          </div>
        </div>

        {!ready ? (
          <div className="settings-whisper-card__progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="settings-whisper-card__progress-track">
              <div
                className={`settings-whisper-card__progress-fill${installing ? " is-active" : ""}`}
                style={{ width: `${Math.max(installing ? 8 : 4, percent)}%` }}
              />
            </div>
            <p className="settings-whisper-card__progress-label">
              <Download size={14} strokeWidth={2.25} aria-hidden />
              <span>{installing ? `${percent}%` : "Ожидание загрузки…"}</span>
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
