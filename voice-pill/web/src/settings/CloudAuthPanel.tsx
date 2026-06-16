import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, LogOut } from "lucide-react";

type CloudStatus = {
  ready: boolean;
  signedIn: boolean;
  userLabel: string | null;
};

type CloudSignInResult = { ok: boolean; error?: string };

function cloudAuthErrorMessage(code: string): string {
  switch (code) {
    case "api_unreachable":
      return "Сервер Spotti недоступен. Проверьте интернет и повторите.";
    case "api_error":
      return "Сервер Spotti вернул ошибку. Повторите через минуту.";
    case "engine_offline":
      return "Движок Spotti Voice не отвечает. Перезапустите приложение.";
    case "oauth_start_failed":
    case "begin_failed":
      return "Не удалось открыть страницу Discord. Повторите позже.";
    case "oauth_timeout":
      return "Время ожидания входа истекло. Закройте вкладку Discord и попробуйте снова.";
    case "oauth_finish_failed":
      return "Discord вернул код, но сессию сохранить не удалось. Повторите вход.";
    case "oauth_listener_failed":
    case "invalid_redirect_uri":
      return "Не удалось запустить локальный приём OAuth. Перезапустите Spotti Voice.";
    default:
      return "Не удалось начать вход. Повторите позже.";
  }
}

async function fetchCloudStatus(base: string): Promise<CloudStatus> {
  if (window.spottiVoice?.cloudStatus) {
    return window.spottiVoice.cloudStatus();
  }
  const res = await fetch(`${base}/api/cloud/status`);
  if (!res.ok) return { ready: false, signedIn: false, userLabel: null };
  return res.json();
}

function DiscordMark() {
  return (
    <svg
      className="settings-cloud-auth__discord-mark"
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037 12.3 12.3 0 0 0-.608 1.25 18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
      />
    </svg>
  );
}

export function CloudAuthPanel({ base }: { base: string }) {
  const [status, setStatus] = useState<CloudStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [awaitingBrowser, setAwaitingBrowser] = useState(false);

  async function refresh() {
    try {
      const next = await fetchCloudStatus(base);
      setStatus(next);
      if (next.signedIn) {
        setAwaitingBrowser(false);
        setError("");
      }
    } catch {
      setStatus({ ready: false, signedIn: false, userLabel: null });
    }
  }

  useEffect(() => {
    void refresh();
    const detach = window.spottiVoice?.onCloudAuthChanged?.(() => {
      void refresh();
    });
    return () => {
      detach?.();
    };
  }, [base]);

  async function onSignIn() {
    setBusy(true);
    setError("");
    try {
      if (window.spottiVoice?.cloudSignIn) {
        const result = (await window.spottiVoice.cloudSignIn()) as CloudSignInResult;
        if (!result?.ok) {
          setError(cloudAuthErrorMessage(result?.error || "begin_failed"));
          return;
        }
        await refresh();
        return;
      }
      const begin = await fetch(`${base}/api/cloud/auth/begin`, { method: "POST" });
      if (!begin.ok) {
        let detail = "begin_failed";
        try {
          const body = await begin.json();
          if (body?.detail) detail = String(body.detail);
        } catch {
          /* ignore */
        }
        setError(cloudAuthErrorMessage(detail));
        return;
      }
      const data = await begin.json();
      window.open(data.authorize_url, "_blank", "noopener,noreferrer");
      setAwaitingBrowser(true);
    } catch {
      setError(cloudAuthErrorMessage("engine_offline"));
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    setBusy(true);
    setError("");
    setAwaitingBrowser(false);
    try {
      if (window.spottiVoice?.cloudSignOut) {
        await window.spottiVoice.cloudSignOut();
      } else {
        await fetch(`${base}/api/cloud/auth/signout`, { method: "POST" });
      }
      await refresh();
    } catch {
      setError("Не удалось выйти.");
    } finally {
      setBusy(false);
    }
  }

  const signedIn = status?.signedIn;
  const ready = status?.ready;

  return (
    <section className="settings-cloud-auth" aria-label="Вход в облако Spotti">
      <div className="settings-cloud-auth__head">
        <p className="settings-cloud-auth__eyebrow">Облачное распознавание</p>
        <h3 className="settings-cloud-auth__title">Аккаунт Spotti</h3>
        {signedIn ? (
          <p className="settings-cloud-auth__meta settings-cloud-auth__meta--ok">
            <CheckCircle2 size={15} strokeWidth={2.25} aria-hidden />
            <span>
              {status?.userLabel ? `Вошли как ${status.userLabel}` : "Вход выполнен"}
              {ready ? " · облако готово" : " · обновите сессию"}
            </span>
          </p>
        ) : (
          <p className="settings-cloud-auth__meta">
            Войдите через Discord — API-ключ не нужен. После входа откроется браузер для
            подтверждения.
          </p>
        )}
      </div>

      <div className="settings-cloud-auth__actions">
        {signedIn ? (
          <button
            type="button"
            className="settings-cloud-auth__btn settings-cloud-auth__btn--ghost"
            onClick={() => void onSignOut()}
            disabled={busy}
          >
            {busy ? <Loader2 className="settings-loading__spin" size={16} /> : <LogOut size={16} />}
            <span>Выйти</span>
          </button>
        ) : (
          <button
            type="button"
            className="settings-cloud-auth__btn settings-cloud-auth__btn--discord"
            onClick={() => void onSignIn()}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="settings-loading__spin" size={18} />
            ) : (
              <DiscordMark />
            )}
            <span>Войти через Discord</span>
          </button>
        )}
      </div>

      {awaitingBrowser && !signedIn && !error ? (
        <p className="settings-cloud-auth__hint" role="status">
          Завершите вход в браузере. Окно настроек обновится автоматически.
        </p>
      ) : null}

      {error ? (
        <p className="settings-cloud-auth__alert" role="alert">
          <AlertCircle size={15} strokeWidth={2.25} aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}
    </section>
  );
}
