import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Sparkles, X } from "lucide-react";
import { animate } from "animejs";
import {
  markOnboardingComplete,
  ONBOARDING_STEPS,
  type OnboardingStep,
} from "./onboardingSteps";
import "./onboarding.css";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useTypewriter(text: string, active: boolean, speedMs = 22) {
  const [visible, setVisible] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!active) {
      setVisible("");
      return undefined;
    }
    if (prefersReducedMotion()) {
      setVisible(text);
      return undefined;
    }

    setVisible("");
    let i = 0;
    const tick = () => {
      i += 1;
      setVisible(text.slice(0, i));
      if (i < text.length) {
        timerRef.current = setTimeout(tick, speedMs);
      }
    };
    timerRef.current = setTimeout(tick, speedMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [text, active, speedMs]);

  const done = visible.length >= text.length;
  return { visible, done };
}

export function OnboardingOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);
  const [exiting, setExiting] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const charRef = useRef<HTMLImageElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const step: OnboardingStep = ONBOARDING_STEPS[stepIndex];
  const line = step.lines[lineIndex] ?? "";
  const isLastStep = stepIndex >= ONBOARDING_STEPS.length - 1;
  const isLastLine = lineIndex >= step.lines.length - 1;
  const { visible, done } = useTypewriter(line, open && !exiting);

  const finish = useCallback(() => {
    markOnboardingComplete();
    void window.spottiVoice?.markOnboardingComplete?.();
    onClose();
  }, [onClose]);

  const skip = useCallback(() => {
    setExiting(true);
    finish();
  }, [finish]);

  const goNext = useCallback(() => {
    if (!done) {
      return;
    }
    if (!isLastLine) {
      setLineIndex((v) => v + 1);
      return;
    }
    if (!isLastStep) {
      setStepIndex((v) => v + 1);
      setLineIndex(0);
      return;
    }
    setExiting(true);
    finish();
  }, [done, finish, isLastLine, isLastStep]);

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      setLineIndex(0);
      setExiting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !rootRef.current) return;
    if (prefersReducedMotion()) return;

    animate(rootRef.current, {
      opacity: [0, 1],
      duration: 380,
      ease: "outQuart",
    });
    if (stageRef.current) {
      animate(stageRef.current, {
        opacity: [0, 1],
        translateY: [28, 0],
        scale: [0.96, 1],
        duration: 520,
        ease: "outQuart",
      });
    }
  }, [open]);

  useEffect(() => {
    if (!open || !charRef.current || prefersReducedMotion()) return;
    animate(charRef.current, {
      translateY: [8, -6, 0],
      duration: 680,
      ease: "outElastic(1, .7)",
    });
  }, [open, stepIndex]);

  useEffect(() => {
    if (!open || !chatRef.current || prefersReducedMotion()) return;
    animate(chatRef.current, {
      opacity: [0, 1],
      translateY: [12, 0],
      duration: 360,
      ease: "outCubic",
    });
  }, [open, stepIndex, lineIndex]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        skip();
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, goNext, skip]);

  if (!open) return null;

  const progress = ((stepIndex + (lineIndex + 1) / step.lines.length) / ONBOARDING_STEPS.length) * 100;
  const nextLabel = isLastStep && isLastLine ? "Начать" : "Далее";

  return (
    <div ref={rootRef} className="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <button type="button" className="onboarding__backdrop" aria-label="Пропустить обучение" onClick={skip} />

      <div ref={stageRef} className="onboarding__stage">
        <button type="button" className="onboarding__skip" onClick={skip}>
          <X size={16} strokeWidth={2.25} aria-hidden />
          Пропустить
        </button>

        <div className="onboarding__scene">
          <div className="onboarding__character-wrap">
            <div className="onboarding__character-shadow" aria-hidden />
            <img
              ref={charRef}
              key={step.id}
              className="onboarding__character"
              src={step.image}
              alt=""
              draggable={false}
            />
          </div>

          <div ref={chatRef} className="onboarding__chat">
            <div className="onboarding__chat-chrome" aria-hidden>
              <span />
              <span />
              <span />
            </div>

            <header className="onboarding__chat-head">
              <span className="onboarding__chat-badge">
                <Sparkles size={12} strokeWidth={2.4} aria-hidden />
                Обучение
              </span>
              <p className="onboarding__chat-speaker">{step.speaker}</p>
            </header>

            <p id="onboarding-title" className="onboarding__chat-text">
              {visible}
              {!done ? <span className="onboarding__cursor" aria-hidden /> : null}
            </p>

            <div className="onboarding__chat-meta">
              <span>
                Шаг {stepIndex + 1} из {ONBOARDING_STEPS.length}
              </span>
              <span>
                {lineIndex + 1}/{step.lines.length}
              </span>
            </div>

            <div className="onboarding__actions">
              <button
                type="button"
                className="settings-btn settings-btn--primary onboarding__next"
                onClick={goNext}
                disabled={!done}
              >
                {nextLabel}
                <ChevronRight size={16} strokeWidth={2.4} aria-hidden />
              </button>
            </div>
          </div>
        </div>

        <div className="onboarding__progress" aria-hidden>
          <div className="onboarding__progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}
