/** User-facing Russian copy. Keep API field names out of visible strings. */

export const HOTKEY_PART_LABELS: Record<string, string> = {
  control: "Ctrl",
  ctrl: "Ctrl",
  shift: "Shift",
  alt: "Alt",
  space: "Пробел",
  meta: "Win",
  win: "Win",
};

export function formatHotkeyForDisplay(hotkey: string): string[] {
  return hotkey.split("+").map((part) => {
    const key = part.trim().toLowerCase();
    if (HOTKEY_PART_LABELS[key]) return HOTKEY_PART_LABELS[key];
    if (/^f\d+$/i.test(key)) return key.toUpperCase();
    if (key.length === 1) return key.toUpperCase();
    return part.trim().charAt(0).toUpperCase() + part.trim().slice(1);
  });
}

const MODIFIER_KEYS = new Set(["control", "shift", "alt", "meta", "os"]);

function primaryKeyFromEvent(event: KeyboardEvent): string | null {
  const rawKey = event.key?.trim();
  if (rawKey && !MODIFIER_KEYS.has(rawKey.toLowerCase())) {
    let key = rawKey.toLowerCase();
    if (key === " ") key = "space";
    else if (key === "arrowup") key = "up";
    else if (key === "arrowdown") key = "down";
    else if (key === "arrowleft") key = "left";
    else if (key === "arrowright") key = "right";
    return key;
  }

  const code = event.code?.trim();
  if (code && /^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (code && /^Digit\d$/.test(code)) return code.slice(5);
  if (code && /^F\d+$/.test(code)) return code.toLowerCase();

  return null;
}

function isFunctionKey(key: string): boolean {
  return /^f\d+$/i.test(key);
}

/** Build engine hotkey string from a keydown event, or null if invalid. */
export function hotkeyFromKeyboardEvent(event: KeyboardEvent): string | null {
  if (event.key === "Escape") return null;

  const key = primaryKeyFromEvent(event);
  if (!key) return null;

  const parts: string[] = [];
  if (event.ctrlKey) parts.push("control");
  if (event.shiftKey) parts.push("shift");
  if (event.altKey) parts.push("alt");
  if (event.metaKey) parts.push("meta");

  parts.push(key);

  // F1–F24 work alone; other keys need at least one modifier (avoid stray typing).
  if (!isFunctionKey(key) && parts.length < 2) return null;
  return parts.join("+");
}
