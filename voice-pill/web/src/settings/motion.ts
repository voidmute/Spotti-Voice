import { useEffect, useRef, type RefObject } from "react";
import { animate, stagger } from "animejs";

const EASE_OUT = "outCubic";
const EASE_SPRING = "outElastic(1, .62)";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useSettingsShellMotion(
  appRef: RefObject<HTMLElement | null>,
  ready: boolean,
) {
  useEffect(() => {
    if (!ready || !appRef.current) return;
    if (prefersReducedMotion()) {
      appRef.current.style.opacity = "1";
      return;
    }
    animate(appRef.current, {
      opacity: [0, 1],
      translateY: [12, 0],
      scale: [0.992, 1],
      duration: 520,
      ease: "outQuart",
    });
    const navItems = appRef.current.querySelectorAll(".settings-nav__item");
    if (navItems.length) {
      animate(navItems, {
        opacity: [0, 1],
        translateX: [-10, 0],
        duration: 400,
        delay: stagger(55, { start: 100 }),
        ease: EASE_OUT,
      });
    }
  }, [appRef, ready]);
}

export function useSettingsPanelMotion(
  stageRef: RefObject<HTMLElement | null>,
  section: string,
  sectionOrder: readonly string[],
) {
  const prevSectionRef = useRef(section);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const panel = el.querySelector(".settings-panel-view, .settings-panel-view--history");
    if (!panel) return;

    const prevIdx = sectionOrder.indexOf(prevSectionRef.current);
    const nextIdx = sectionOrder.indexOf(section);
    const direction = nextIdx >= prevIdx ? 1 : -1;
    prevSectionRef.current = section;

    if (prefersReducedMotion()) return;

    animate(panel, {
      opacity: [0, 1],
      translateX: [direction * 28, 0],
      translateY: [10, 0],
      scale: [0.985, 1],
      filter: ["blur(6px)", "blur(0px)"],
      duration: 460,
      ease: "outQuart",
    });

    const blocks = panel.querySelectorAll(
      ".settings-panel__head, .settings-card, .settings-whisper-card, .history-row, .settings-cloud-auth, .settings-account-local-hint",
    );
    if (blocks.length) {
      animate(blocks, {
        opacity: [0, 1],
        translateY: [14, 0],
        duration: 420,
        delay: stagger(40, { start: 70 }),
        ease: EASE_OUT,
      });
    }
  }, [stageRef, section, sectionOrder]);
}

export function animateCloudGate(card: HTMLElement | null, open: boolean) {
  if (!card || !open || prefersReducedMotion()) return;
  animate(card, {
    opacity: [0, 1],
    scale: [0.94, 1],
    translateY: [16, 0],
    duration: 420,
    ease: "outQuart",
  });
}

export function animateThemeToggle(btn: HTMLElement | null) {
  if (!btn || prefersReducedMotion()) return;
  animate(btn, {
    rotate: [0, -14, 0],
    scale: [1, 0.88, 1.04, 1],
    duration: 560,
    ease: EASE_SPRING,
  });
  const icons = btn.querySelector(".settings-theme-icon-btn__icons");
  if (icons) {
    animate(icons, {
      rotate: [0, 180],
      scale: [1, 0.82, 1],
      duration: 520,
      ease: EASE_SPRING,
    });
  }
}
