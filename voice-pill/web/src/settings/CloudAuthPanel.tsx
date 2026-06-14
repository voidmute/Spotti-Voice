import { useEffect, useState } from "react";
import { Loader2, LogIn, LogOut, User } from "lucide-react";

type CloudStatus = {
  ready: boolean;
  signedIn: boolean;
  userLabel: string | null;
};

async function fetchCloudStatus(base: string): Promise<CloudStatus> {
  if (window.spottiVoice?.cloudStatus) {
    return window.spottiVoice.cloudStatus();
  }
  const res = await fetch(`${base}/api/cloud/status`);
  if (!res.ok) return { ready: false, signedIn: false, userLabel: null };
  return res.json();
}

export function CloudAuthPanel({ base }: { base: string }) {
  const [status, setStatus] = useState<CloudStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const next = await fetchCloudStatus(base);
      setStatus(next);
      setError("");
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
        await window.spottiVoice.cloudSignIn();
      } else {
        const begin = await fetch(`${base}/api/cloud/auth/begin`, { method: "POST" });
        if (!begin.ok) throw new Error("begin_failed");
        const data = await begin.json();
        window.open(data.authorize_url, "_blank", "noopener,noreferrer");
      }
    } catch {
      setError("Не удалось начать вход. Повторите позже.");
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    setBusy(true);
    setError("");
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
      <div className="settings-cloud-auth__row">
        <span className="settings-cloud-auth__icon" aria-hidden>
          <User size={18} strokeWidth={2.25} />
        </span>
        <div className="settings-cloud-auth__copy">
          <p className="settings-cloud-auth__title">Аккаунт Spotti</p>
          {signedIn ? (
            <p className="settings-cloud-auth__meta">
              {status?.userLabel ? `Вошли как ${status.userLabel}` : "Вход выполнен"}
              {ready ? " · облако готово" : " · обновите сессию"}
            </p>
          ) : (
            <p className="settings-cloud-auth__meta">
              Войдите через Discord для облачного распознавания. API-ключ не нужен.
            </p>
          )}
        </div>
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
            className="settings-cloud-auth__btn"
            onClick={() => void onSignIn()}
            disabled={busy}
          >
            {busy ? <Loader2 className="settings-loading__spin" size={16} /> : <LogIn size={16} />}
            <span>Войти через Discord</span>
          </button>
        )}
      </div>
      {error ? <p className="settings-cloud-auth__error">{error}</p> : null}
    </section>
  );
}
