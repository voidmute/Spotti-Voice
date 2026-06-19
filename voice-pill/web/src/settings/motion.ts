import { useEffect, type RefObject } from "react";
import { animate, stagger } from "animejs";

const EASE = "outCubic";

export function useSettingsShellMotion(
  appRef: RefObject<HTMLElement | null>,
  ready: boolean,
) {
  useEffect(() => {
    if (!ready || !appRef.current) return;
    animate(appRef.current, {
      opacity: [0, 1],
      translateY: [10, 0],
      duration: 420,
      ease: EASE,
    });
    const navItems = appRef.current.querySelectorAll(".settings-nav__item");
    if (navItems.length) {
      animate(navItems, {
        opacity: [0, 1],
        translateX: [-8, 0],
        duration: 360,
        delay: stagger(45, { start: 80 }),
        ease: EASE,
      });
    }
  }, [appRef, ready]);
}

export function useSettingsPanelMotion(
  stageRef: RefObject<HTMLElement | null>,
  section: string,
) {
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const panel = el.querySelector(".settings-panel-view, .settings-panel-view--history");
    if (!panel) return;
    animate(panel, {
      opacity: [0, 1],
      translateY: [14, 0],
      duration: 380,
      ease: EASE,
    });
  }, [stageRef, section]);
}

export function animateCloudGate(card: HTMLElement | null, open: boolean) {
  if (!card) return;
  if (open) {
    animate(card, {
      opacity: [0, 1],
      scale: [0.96, 1],
      duration: 360,
      ease: EASE,
    });
  }
}

export function animateThemeToggle(btn: HTMLElement | null) {
  if (!btn) return;
  animate(btn, {
    rotate: [0, 18, 0],
    scale: [1, 0.92, 1],
    duration: 420,
    ease: "outElastic(1, .7)",
  });
}
