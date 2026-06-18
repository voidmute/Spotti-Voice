import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, X } from "lucide-react";

type CloudStatus = {
  signedIn: boolean;
  userLabel?: string | null;
};

function isOAuthCallbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "spotti-voice:" && parsed.hostname === "auth") return true;
    if (
      (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") &&
      parsed.port === "9780" &&
      parsed.pathname === "/auth/callback"
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function DiscordMark() {
  return (
    <svg className="cloud-gate__discord" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037 12.3 12.3 0 0 0-.608 1.25 18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
      />
    </svg>
  );
}

export function CloudAuthGate({
  open,
  onClose,
  onSignedIn,
}: {
  open: boolean;
  onClose: () => void;
  onSignedIn: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null);
  const webviewRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      setAuthorizeUrl(null);
      setError("");
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    const wv = webviewRef.current as (HTMLElement & {
      setZoomFactor?: (factor: number) => void;
      insertCSS?: (css: string) => void;
    }) | null;
    if (!wv || !authorizeUrl) return undefined;

    const onNavigate = (event: Event & { url?: string; preventDefault?: () => void }) => {
      const url = event.url;
      if (!url || !isOAuthCallbackUrl(url)) return;
      event.preventDefault?.();
      void finishOAuth(url);
    };

    const onDomReady = () => {
      try {
        wv.setZoomFactor?.(1);
        wv.insertCSS?.("html,body{margin:0!important;padding:0!important;overflow:hidden!important;width:100%!important;height:100%!important;}");
      } catch {
        /* ignore */
      }
    };

    wv.addEventListener("will-navigate", onNavigate as EventListener);
    wv.addEventListener("did-navigate", onNavigate as EventListener);
    wv.addEventListener("did-navigate-in-page", onNavigate as EventListener);
    wv.addEventListener("dom-ready", onDomReady as EventListener);

    return () => {
      wv.removeEventListener("will-navigate", onNavigate as EventListener);
      wv.removeEventListener("did-navigate", onNavigate as EventListener);
      wv.removeEventListener("did-navigate-in-page", onNavigate as EventListener);
      wv.removeEventListener("dom-ready", onDomReady as EventListener);
    };
  }, [authorizeUrl]);

  async function finishOAuth(callbackUrl: string) {
    setBusy(true);
    setError("");
    try {
      const result = await window.spottiVoice?.cloudAuthFinish?.(callbackUrl);
      if (!result?.ok) {
        setError("Не удалось завершить вход. Повторите.");
        setAuthorizeUrl(null);
        return;
      }
      onSignedIn();
      onClose();
    } catch {
      setError("Не удалось завершить вход.");
      setAuthorizeUrl(null);
    } finally {
      setBusy(false);
    }
  }

  async function onStartSignIn() {
    setBusy(true);
    setError("");
    try {
      const result = await window.spottiVoice?.cloudAuthBegin?.();
      if (!result?.ok || !result.authorizeUrl) {
        setError("Не удалось открыть вход Discord. Повторите.");
        return;
      }
      setAuthorizeUrl(result.authorizeUrl);
    } catch {
      setError("Движок Spotti Voice не отвечает.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="cloud-gate" role="dialog" aria-modal="true" aria-labelledby="cloud-gate-title">
      <button type="button" className="cloud-gate__backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className={`cloud-gate__card${authorizeUrl ? " cloud-gate__card--oauth" : ""}`}>
        <button type="button" className="cloud-gate__close" aria-label="Закрыть" onClick={onClose}>
          <X size={18} strokeWidth={2.25} />
        </button>

        {!authorizeUrl ? (
          <>
            <p className="cloud-gate__eyebrow">Облако Spotti</p>
            <h2 id="cloud-gate-title" className="cloud-gate__title">
              Вход через Discord
            </h2>
            <p className="cloud-gate__desc">
              Для облачного распознавания войдите в аккаунт Discord. Язык определяется автоматически.
            </p>
            <button
              type="button"
              className="settings-btn settings-btn--discord cloud-gate__signin"
              disabled={busy}
              onClick={() => void onStartSignIn()}
            >
              {busy ? <Loader2 className="settings-loading__spin" size={18} /> : <DiscordMark />}
              <span>Войти через Discord</span>
            </button>
          </>
        ) : (
          <>
            <p className="cloud-gate__eyebrow">Облако Spotti</p>
            <h2 className="cloud-gate__title">Завершите вход</h2>
            <div className="cloud-gate__webview-wrap">
              <webview
                ref={webviewRef}
                className="cloud-gate__webview"
                src={authorizeUrl}
                partition="persist:spotti-oauth"
              />
            </div>
          </>
        )}

        {error ? (
          <p className="cloud-gate__error" role="alert">
            <AlertCircle size={15} strokeWidth={2.25} aria-hidden />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

export async function fetchCloudSignedIn(base: string): Promise<boolean> {
  try {
    if (window.spottiVoice?.cloudStatus) {
      const status = (await window.spottiVoice.cloudStatus()) as CloudStatus;
      return Boolean(status.signedIn);
    }
    const res = await fetch(`${base}/api/cloud/status`);
    if (!res.ok) return false;
    const data = (await res.json()) as CloudStatus;
    return Boolean(data.signedIn);
  } catch {
    return false;
  }
}
