import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { resolveEngineBase } from "../lib/engineApi";

type EngineState = "idle" | "listening" | "processing" | "error";

const PILL_HEIGHT = 48;
const ERROR_DISMISS_MS = 8000;
const PILL_MIN_WIDTH = 143;
const PILL_MAX_WIDTH = 168;

function compactErrorMessage(message: string): string {
  const trimmed = message.trim();
  if (trimmed.includes("Облачное распознавание")) {
    return "Облако недоступно";
  }
  if (trimmed.includes("Нет связи с движком")) {
    return "Нет связи с движком";
  }
  if (trimmed.length > 36) {
    return `${trimmed.slice(0, 35)}…`;
  }
  return trimmed;
}

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
  error: "#121212",
};

type MatteRingFrameProps = {
  width: number;
  height: number;
  fill: string;
  className?: string;
  shape?: "stadium" | "rounded";
};

/** Matte 1px white ring — stadium matches the main pill capsule. */
function MatteRingFrame({
  width,
  height,
  fill,
  className,
  shape = "stadium",
}: MatteRingFrameProps) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const r = shape === "stadium" ? h / 2 : Math.min(h / 2, 14);
  const ring = 1;

  return (
    <svg
      className={className}
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
        rx={Math.max(0, r - ring)}
        ry={Math.max(0, r - ring)}
        fill="#ffffff"
      />
      <rect
        x={ring * 2}
        y={ring * 2}
        width={w - ring * 4}
        height={h - ring * 4}
        rx={Math.max(0, r - ring * 2)}
        ry={Math.max(0, r - ring * 2)}
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

type ErrorPhase = "enter" | "exit";

type PillFaceProps = {
  state: EngineState;
  level: number;
  reduced: boolean;
  label: string;
  width: number;
  errorMessage?: string | null;
  errorPhase?: ErrorPhase;
  onErrorDismiss?: () => void;
  onErrorExitComplete?: () => void;
};

function PillFace({
  state,
  level,
  reduced,
  label,
  width,
  errorMessage,
  errorPhase = "enter",
  onErrorDismiss,
  onErrorExitComplete,
}: PillFaceProps) {
  const hasError = Boolean(errorMessage);

  return (
    <div
      className={`pill ${state}${hasError ? " pill--has-error" : ""}`}
      style={{ height: PILL_HEIGHT, width }}
      aria-label={`Spotti Voice ${label}`}
    >
      <MatteRingFrame
        className="pill-frame"
        width={width}
        height={PILL_HEIGHT}
        fill={PILL_FILL[state]}
        shape="stadium"
      />
      <div className="pill-inner pill-inner--controls">
        {hasError && errorMessage ? (
          <>
            <img className="pill-logo" src="./white-only.png" alt="" aria-hidden />
            <button
              type="button"
              className={`pill-error-inline pill-error-inline--${errorPhase}`}
              title={errorMessage}
              onClick={() => {
                void window.spottiVoice?.openSettings?.();
                onErrorDismiss?.();
              }}
              onAnimationEnd={(event) => {
                if (
                  errorPhase === "exit" &&
                  event.animationName === "pill-error-out" &&
                  event.target === event.currentTarget
                ) {
                  onErrorExitComplete?.();
                }
              }}
              aria-live="polite"
            >
              {compactErrorMessage(errorMessage)}
            </button>
          </>
        ) : (
          <PillContent state={state} level={level} reduced={reduced} />
        )}
      </div>
    </div>
  );
}

export function PillOverlay() {
  const shellRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pillWidthRef = useRef(PILL_MIN_WIDTH);
  const canonicalWidthRef = useRef(0);
  const lastOverlaySizeRef = useRef({ w: 0, h: PILL_HEIGHT });
  const connectedRef = useRef(false);
  const [state, setState] = useState<EngineState>("idle");
  const [displayLevel, setDisplayLevel] = useState(0);
  const levelTargetRef = useRef(0);
  const [connected, setConnected] = useState(false);
  const [pillWidth, setPillWidth] = useState(PILL_MIN_WIDTH);
  const [errorBubble, setErrorBubble] = useState<{
    message: string;
    phase: ErrorPhase;
  } | null>(null);

  pillWidthRef.current = pillWidth;
  connectedRef.current = connected;

  const syncOverlaySize = useCallback(() => {
    const probe = probeRef.current;
    const setOverlaySize = window.spottiVoice?.setOverlaySize;
    if (!probe || !setOverlaySize) return;

    const measured = Math.min(
      PILL_MAX_WIDTH,
      Math.max(PILL_MIN_WIDTH, Math.ceil(probe.getBoundingClientRect().width)),
    );
    if (canonicalWidthRef.current <= 0) {
      canonicalWidthRef.current = measured;
    } else if (!errorBubble) {
      canonicalWidthRef.current = measured;
    }
    const width = canonicalWidthRef.current;
    const height = PILL_HEIGHT;
    const last = lastOverlaySizeRef.current;
    if (last.w === width && last.h === height) return;
    lastOverlaySizeRef.current = { w: width, h: height };

    if (pillWidthRef.current !== width) {
      pillWidthRef.current = width;
      setPillWidth(width);
    }
    void setOverlaySize(width, height);
  }, [errorBubble]);

  const clearErrorTimer = useCallback(() => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
  }, []);

  const finalizeErrorExit = useCallback(() => {
    clearErrorTimer();
    setErrorBubble(null);
  }, [clearErrorTimer]);

  const beginErrorExit = useCallback(() => {
    setErrorBubble((prev) => (prev ? { ...prev, phase: "exit" } : null));
  }, []);

  const dismissError = useCallback(() => {
    if (!errorBubble || errorBubble.phase === "exit") return;
    clearErrorTimer();
    beginErrorExit();
  }, [beginErrorExit, clearErrorTimer, errorBubble]);

  const showApiError = useCallback(
    (message: string) => {
      clearErrorTimer();
      setErrorBubble((prev) => {
        if (prev?.phase === "enter" && prev.message === message) {
          return prev;
        }
        return { message, phase: "enter" };
      });
      lastOverlaySizeRef.current = { w: 0, h: PILL_HEIGHT };
      const setOverlaySize = window.spottiVoice?.setOverlaySize;
      if (setOverlaySize) {
        void setOverlaySize(
          Math.max(canonicalWidthRef.current || pillWidthRef.current, PILL_MIN_WIDTH),
          PILL_HEIGHT,
        );
      }
      errorTimerRef.current = setTimeout(() => {
        errorTimerRef.current = null;
        beginErrorExit();
      }, ERROR_DISMISS_MS);
    },
    [beginErrorExit, clearErrorTimer],
  );

  const showApiErrorRef = useRef(showApiError);
  const dismissErrorRef = useRef(dismissError);
  showApiErrorRef.current = showApiError;
  dismissErrorRef.current = dismissError;

  useLayoutEffect(() => {
    const probe = probeRef.current;
    if (!probe) return;

    syncOverlaySize();
    let raf = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(syncOverlaySize);
    });
    observer.observe(probe);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [syncOverlaySize]);

  useLayoutEffect(() => {
    syncOverlaySize();
  }, [errorBubble, syncOverlaySize]);

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
    let disconnectErrorTimer: ReturnType<typeof setTimeout> | null = null;
    let healthPollTimer: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const ENGINE_DISCONNECT_ERROR = "Нет связи с движком Spotti Voice";

    function clearDisconnectErrorTimer() {
      if (disconnectErrorTimer) {
        clearTimeout(disconnectErrorTimer);
        disconnectErrorTimer = null;
      }
    }

    function scheduleDisconnectError() {
      clearDisconnectErrorTimer();
      disconnectErrorTimer = setTimeout(() => {
        disconnectErrorTimer = null;
        if (closed || connectedRef.current) return;
        setState("error");
        showApiErrorRef.current(ENGINE_DISCONNECT_ERROR);
      }, 1800);
    }

    async function waitForEngineHealth(base: string, attempts = 24): Promise<boolean> {
      for (let i = 0; i < attempts && !closed; i += 1) {
        try {
          const res = await fetch(`${base}/api/health`, { cache: "no-store" });
          if (res.ok) return true;
        } catch {
          // retry
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      return false;
    }

    function connect(base: string) {
      if (closed) return;
      if (ws) {
        ws.onopen = null;
        ws.onclose = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.close();
        ws = null;
      }

      const wsUrl = base.replace(/^http/, "ws") + "/ws/events";
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        clearDisconnectErrorTimer();
        setConnected(true);
        connectedRef.current = true;
        setState((prev) => (prev === "error" ? "idle" : prev));
        dismissErrorRef.current();
      };

      ws.onclose = () => {
        setConnected(false);
        connectedRef.current = false;
        if (closed) return;
        scheduleDisconnectError();
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          void resolveEngineBase().then(async (nextBase) => {
            if (closed) return;
            await waitForEngineHealth(nextBase, 8);
            if (!closed) connect(nextBase);
          });
        }, 2000);
      };

      ws.onerror = () => {
        ws?.close();
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          if (msg.type === "state" && typeof msg.state === "string") {
            const next = msg.state as EngineState;
            setState(next);
            if (next === "listening") {
              dismissErrorRef.current();
            }
          }
          if (msg.type === "level" && typeof msg.level === "number") {
            const next = Math.max(0, Math.min(1, msg.level));
            levelTargetRef.current = next;
          }
          if (msg.type === "error" && typeof msg.message === "string") {
            setState("error");
            showApiErrorRef.current(msg.message);
          }
        } catch {
          // ignore malformed events
        }
      };
    }

    void resolveEngineBase().then(async (base) => {
      const ready = await waitForEngineHealth(base, 80);
      if (closed) return;
      if (ready) {
        connect(base);
        return;
      }
      scheduleDisconnectError();
      healthPollTimer = setInterval(async () => {
        if (closed || connectedRef.current) {
          if (healthPollTimer) clearInterval(healthPollTimer);
          healthPollTimer = null;
          return;
        }
        if (await waitForEngineHealth(base, 4)) {
          if (healthPollTimer) clearInterval(healthPollTimer);
          healthPollTimer = null;
          connect(base);
        }
      }, 2000);
    });

    return () => {
      closed = true;
      if (healthPollTimer) clearInterval(healthPollTimer);
      clearDisconnectErrorTimer();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onopen = null;
        ws.onclose = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.close();
      }
    };
  }, []);

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const label = connected ? STATE_LABEL[state] : "Нет связи";

  return (
    <div
      className="overlay-shell"
      ref={shellRef}
      style={{ width: pillWidth }}
    >
      <div className="pill-width-probe" ref={probeRef} aria-hidden>
        <div className="pill-inner pill-inner--probe">
          <PillContent state={state} level={displayLevel} reduced={reduced} />
        </div>
      </div>
      <div className="pill-slot" style={{ height: PILL_HEIGHT, width: pillWidth }}>
        <PillFace
          state={state}
          level={displayLevel}
          reduced={reduced}
          label={label}
          width={pillWidth}
          errorMessage={errorBubble?.message ?? null}
          errorPhase={errorBubble?.phase}
          onErrorDismiss={dismissError}
          onErrorExitComplete={finalizeErrorExit}
        />
      </div>
    </div>
  );
}
