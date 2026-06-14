import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { resolveEngineBase } from "../lib/engineApi";

type EngineState = "idle" | "listening" | "processing" | "error";

const PILL_HEIGHT = 48;
const ERROR_DISMISS_MS = 8000;
const ERROR_BUBBLE_FALLBACK = 88;

const STATE_LABEL: Record<EngineState, string> = {
  idle: "Готов",
  listening: "Слушаю",
  processing: "Обработка",
  error: "Ошибка",
};

/** Symmetric heights from center — tallest in middle, steps down outward. */
const WAVE_CENTER_WEIGHTS = [0.42, 0.62, 0.82, 1, 0.82, 0.62, 0.42];
/** Matches --wave-zone-h in overlay.css */
const WAVE_MAX_HEIGHT = 28;

const PILL_FILL: Record<EngineState, string> = {
  idle: "#121212",
  listening: "#121212",
  processing: "#141414",
  error: "#1a1214",
};

type PillSvgBackdropProps = {
  width: number;
  fill: string;
};

/** Matte 1px white ring — fills only, no stroke (avoids corner fringe). */
function PillSvgBackdrop({ width, fill }: PillSvgBackdropProps) {
  const w = Math.max(1, width);
  const h = PILL_HEIGHT;
  const r = h / 2;
  const ring = 1;

  return (
    <svg
      className="pill-frame"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <rect width={w} height={h} rx={r} ry={r} fill={fill} />
      <rect
        x={ring}
        y={ring}
        width={w - ring * 2}
        height={h - ring * 2}
        rx={r - ring}
        ry={r - ring}
        fill="#ffffff"
      />
      <rect
        x={ring * 2}
        y={ring * 2}
        width={w - ring * 4}
        height={h - ring * 4}
        rx={r - ring * 2}
        ry={r - ring * 2}
        fill={fill}
      />
    </svg>
  );
}

type WaveBarProps = {
  state: EngineState;
  level: number;
  reduced: boolean;
};

/** Per-bar spectrum spread — outer bars dip slightly like a real meter. */
const WAVE_BAND_BIAS = [0.78, 0.88, 0.94, 1, 0.94, 0.88, 0.78];

function clampLevel(level: number): number {
  return Math.max(0, Math.min(1, level));
}

function waveBarHeight(
  index: number,
  weight: number,
  state: EngineState,
  level: number,
  reduced: boolean,
): number {
  if (reduced) {
    return Math.max(3, Math.round(WAVE_MAX_HEIGHT * weight * 0.45));
  }

  if (state === "listening") {
    const band = WAVE_BAND_BIAS[index] ?? 1;
    const shaped = Math.pow(clampLevel(level), 0.75);
    const amplitude = 0.32 + shaped * 0.92 * band;
    const scale = weight * amplitude;
    return Math.max(3, Math.round(WAVE_MAX_HEIGHT * Math.min(1.12, scale)));
  }

  if (state === "processing") {
    const scale = weight * (0.52 + (Math.abs(index - 3) % 2) * 0.14);
    return Math.max(3, Math.round(WAVE_MAX_HEIGHT * scale));
  }

  const scale = weight * 0.38;
  return Math.max(3, Math.round(WAVE_MAX_HEIGHT * scale));
}

function WaveBars({ state, level, reduced }: WaveBarProps) {
  return (
    <div className={`wave ${state === "idle" ? "idle" : ""}`} aria-hidden>
      {WAVE_CENTER_WEIGHTS.map((weight, i) => {
        const barHeight = waveBarHeight(i, weight, state, level, reduced);
        return (
          <span
            key={i}
            style={{
              height: barHeight,
              animationDelay:
                state === "processing" && !reduced ? `${Math.abs(i - 3) * 0.06}s` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

type PillContentProps = {
  state: EngineState;
  level: number;
  reduced: boolean;
};

function PillContent({ state, level, reduced }: PillContentProps) {
  return (
    <>
      <img className="pill-logo" src="./white-only.png" alt="" aria-hidden />
      <div className="pill-divider" aria-hidden />
      <div className="pill-wave-wrap">
        <WaveBars state={state} level={level} reduced={reduced} />
      </div>
    </>
  );
}

type PillFaceProps = {
  state: EngineState;
  level: number;
  reduced: boolean;
  label: string;
  width: number;
};

function PillFace({ state, level, reduced, label, width }: PillFaceProps) {
  return (
    <div className={`pill ${state}`} aria-label={`Spotti Voice ${label}`}>
      <PillSvgBackdrop width={width} fill={PILL_FILL[state]} />
      <div className="pill-inner">
        <PillContent state={state} level={level} reduced={reduced} />
      </div>
    </div>
  );
}

type ErrorBubbleProps = {
  message: string;
  onDismiss: () => void;
};

function ErrorBubble({ message, onDismiss }: ErrorBubbleProps) {
  return (
    <button
      type="button"
      className="pill-error-bubble"
      onClick={() => {
        void window.spottiVoice?.openSettings?.();
        onDismiss();
      }}
      aria-live="polite"
    >
      <span className="pill-error-bubble__text">{message}</span>
      <span className="pill-error-bubble__arrow" aria-hidden />
    </button>
  );
}

export function PillOverlay() {
  const shellRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const errorStackRef = useRef<HTMLDivElement>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<EngineState>("idle");
  const [displayLevel, setDisplayLevel] = useState(0);
  const levelTargetRef = useRef(0);
  const [connected, setConnected] = useState(false);
  const [pillWidth, setPillWidth] = useState(143);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const syncOverlaySize = useCallback(() => {
    const shell = shellRef.current;
    const probe = probeRef.current;
    const errorStack = errorStackRef.current;
    const setOverlaySize = window.spottiVoice?.setOverlaySize;
    if (!shell || !probe || !setOverlaySize) return;

    const pillRect = probe.getBoundingClientRect();
    const errorRect = errorStack?.getBoundingClientRect();
    const width = Math.ceil(
      Math.max(pillRect.width, errorRect?.width ?? 0, 143),
    );
    const bubbleHeight = errorMessage
      ? Math.ceil(errorRect?.height || ERROR_BUBBLE_FALLBACK)
      : 0;
    const height = Math.ceil(PILL_HEIGHT + bubbleHeight);
    if (width < 1 || height < PILL_HEIGHT) return;

    setPillWidth(Math.ceil(pillRect.width) || width);
    void setOverlaySize(width, height);
  }, [errorMessage]);

  const clearErrorTimer = useCallback(() => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
  }, []);

  const dismissError = useCallback(() => {
    clearErrorTimer();
    setErrorMessage(null);
  }, [clearErrorTimer]);

  const showApiError = useCallback(
    (message: string) => {
      clearErrorTimer();
      const setOverlaySize = window.spottiVoice?.setOverlaySize;
      if (setOverlaySize) {
        void setOverlaySize(
          Math.max(pillWidth, 143),
          PILL_HEIGHT + ERROR_BUBBLE_FALLBACK,
        );
      }
      setErrorMessage(message);
      errorTimerRef.current = setTimeout(() => {
        setErrorMessage(null);
        errorTimerRef.current = null;
      }, ERROR_DISMISS_MS);
    },
    [clearErrorTimer, pillWidth],
  );

  useLayoutEffect(() => {
    const shell = shellRef.current;
    const probe = probeRef.current;
    const errorStack = errorStackRef.current;
    if (!shell || !probe) return;

    syncOverlaySize();
    const observer = new ResizeObserver(() => {
      syncOverlaySize();
    });
    observer.observe(shell);
    observer.observe(probe);
    if (errorStack) observer.observe(errorStack);
    return () => observer.disconnect();
  }, [errorMessage, syncOverlaySize]);

  useLayoutEffect(() => {
    if (!errorMessage) return;
    const id = requestAnimationFrame(() => {
      syncOverlaySize();
      requestAnimationFrame(syncOverlaySize);
    });
    return () => cancelAnimationFrame(id);
  }, [errorMessage, syncOverlaySize]);

  useEffect(() => {
    let frame = 0;
    const smooth = () => {
      const target = levelTargetRef.current;
      setDisplayLevel((prev) => {
        const alpha = target > prev ? 0.55 : 0.28;
        const next = prev + (target - prev) * alpha;
        return Math.abs(next - target) < 0.004 ? target : next;
      });
      frame = requestAnimationFrame(smooth);
    };
    frame = requestAnimationFrame(smooth);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (state !== "listening") {
      levelTargetRef.current = 0;
      setDisplayLevel(0);
    }
  }, [state]);

  useEffect(() => {
    return () => clearErrorTimer();
  }, [clearErrorTimer]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let hasConnected = false;

    function connect(base: string) {
      const wsUrl = base.replace(/^http/, "ws") + "/ws/events";
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        hasConnected = true;
        setConnected(true);
        dismissError();
      };
      ws.onclose = () => {
        setConnected(false);
        if (hasConnected) {
          setState("error");
          showApiError("Нет связи с движком Spotti Voice");
        }
        reconnectTimer = setTimeout(() => {
          void resolveEngineBase().then(connect);
        }, 2000);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          if (msg.type === "state" && typeof msg.state === "string") {
            const next = msg.state as EngineState;
            setState(next);
            if (next === "listening") {
              dismissError();
            }
          }
          if (msg.type === "level" && typeof msg.level === "number") {
            const next = Math.max(0, Math.min(1, msg.level));
            levelTargetRef.current = next;
          }
          if (msg.type === "error" && typeof msg.message === "string") {
            setState("error");
            showApiError(msg.message);
          }
        } catch {
          // ignore malformed events
        }
      };
    }

    void resolveEngineBase().then(connect);

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [dismissError, showApiError]);

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const label = connected ? STATE_LABEL[state] : "Нет связи";

  return (
    <div className="overlay-shell" ref={shellRef}>
      <div className="pill-width-probe" ref={probeRef} aria-hidden>
        <div className="pill-inner pill-inner--probe">
          <PillContent state={state} level={displayLevel} reduced={reduced} />
        </div>
      </div>
      {errorMessage ? (
        <div className="pill-error-stack" ref={errorStackRef}>
          <ErrorBubble message={errorMessage} onDismiss={dismissError} />
        </div>
      ) : null}
      <div className="pill-slot">
        <PillFace
          state={state}
          level={displayLevel}
          reduced={reduced}
          label={label}
          width={pillWidth}
        />
      </div>
    </div>
  );
}
