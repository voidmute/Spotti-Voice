export type OnboardingStep = {
  id: string;
  speaker: string;
  image: string;
  lines: string[];
};

export const ONBOARDING_STORAGE_KEY = "spotti-voice-onboarding-v1";

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    speaker: "Спотти",
    image: "./onboarding/spotti-onboarding-welcome.png",
    lines: [
      "Привет! Я Спотти — голосовой помощник Spotti Voice.",
      "Помогаю надиктовывать текст в любое окно: чаты, документы, код, заметки.",
      "Сейчас за минуту покажу, как всё устроено.",
    ],
  },
  {
    id: "hotkey",
    speaker: "Спотти",
    image: "./onboarding/spotti-onboarding-hotkey.png",
    lines: [
      "Главное — горячая клавиша. По умолчанию: Ctrl + Пробел.",
      "Зажми её, говори, отпусти — я распознаю речь и вставлю текст туда, где мигает курсор.",
      "Комбинацию можно сменить в разделе «Горячая клавиша».",
    ],
  },
  {
    id: "mic",
    speaker: "Спотти",
    image: "./onboarding/spotti-onboarding-mic.png",
    lines: [
      "Выбери микрофон в разделе «Микрофон» и проверь уровень сигнала.",
      "Говори чётко, без шёпота — так распознавание будет точнее.",
      "Если шумно — подвинь микрофон ближе или снизь громкость фона.",
    ],
  },
  {
    id: "modes",
    speaker: "Спотти",
    image: "./onboarding/spotti-onboarding-modes.png",
    lines: [
      "Два режима в переключателе сверху.",
      "Локальный — всё на твоём ПК, работает офлайн после установки модели.",
      "Облако — выше точность, нужен вход через Discord в разделе «Аккаунт».",
    ],
  },
  {
    id: "overlay",
    speaker: "Спотти",
    image: "./onboarding/spotti-onboarding-mic.png",
    lines: [
      "В трее живёт капсула — показывает, когда идёт запись.",
      "Клик по капсуле открывает эти настройки.",
      "Иконка в трее: запуск, выход, смена темы.",
    ],
  },
  {
    id: "history",
    speaker: "Спотти",
    image: "./onboarding/spotti-onboarding-modes.png",
    lines: [
      "В «Истории» — последние фразы: скопировать или удалить.",
      "Удобно, если нужно вернуть то, что уже вставилось.",
      "История хранится локально на этом компьютере.",
    ],
  },
  {
    id: "ready",
    speaker: "Спотти",
    image: "./onboarding/spotti-onboarding-ready.png",
    lines: [
      "Готово! Зажми горячую клавишу и попробуй прямо сейчас.",
      "Если что-то пойдёт не так — открой настройки из трея.",
      "Удачной диктовки!",
    ],
  },
];

export function isOnboardingComplete(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboardingComplete(): void {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** First app start only — disk marker from main process is authoritative. */
export async function shouldShowOnboarding(): Promise<boolean> {
  if (isOnboardingComplete()) return false;
  try {
    const status = await window.spottiVoice?.getOnboardingStatus?.();
    if (status?.complete) {
      markOnboardingComplete();
      return false;
    }
  } catch {
    /* ignore */
  }
  return true;
}
