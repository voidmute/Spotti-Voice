/**
 * Global PTT on Windows via GetAsyncKeyState polling.
 * Works when pill/settings are not focused (unlike renderer key handlers).
 */

const VK = {
  back: 0x08,
  tab: 0x09,
  return: 0x0d,
  escape: 0x1b,
  space: 0x20,
  left: 0x25,
  up: 0x26,
  right: 0x27,
  down: 0x28,
  shift: 0x10,
  control: 0x11,
  menu: 0x12,
  lshift: 0xa0,
  rshift: 0xa1,
  lcontrol: 0xa2,
  rcontrol: 0xa3,
  lmenu: 0xa4,
  rmenu: 0xa5,
  lwin: 0x5b,
  rwin: 0x5c,
};

const NAMED_KEYS = {
  backspace: VK.back,
  tab: VK.tab,
  enter: VK.return,
  return: VK.return,
  escape: VK.escape,
  esc: VK.escape,
  space: VK.space,
  left: VK.left,
  up: VK.up,
  right: VK.right,
  down: VK.down,
};

const MODIFIER_GROUPS = {
  shift: [VK.lshift, VK.rshift, VK.shift],
  control: [VK.lcontrol, VK.rcontrol, VK.control],
  ctrl: [VK.lcontrol, VK.rcontrol, VK.control],
  alt: [VK.lmenu, VK.rmenu, VK.menu],
  menu: [VK.lmenu, VK.rmenu, VK.menu],
  meta: [VK.lwin, VK.rwin],
  win: [VK.lwin, VK.rwin],
  windows: [VK.lwin, VK.rwin],
};

function vkForKeyPart(part) {
  const key = part.trim().toLowerCase();
  if (!key) return null;
  if (NAMED_KEYS[key] !== undefined) return NAMED_KEYS[key];
  if (/^f(\d+)$/.test(key)) {
    const n = Number(key.slice(1));
    if (n >= 1 && n <= 24) return 0x6f + n;
  }
  if (key.length === 1) return key.toUpperCase().charCodeAt(0);
  return null;
}

/**
 * @param {string} hotkey e.g. "f4", "control+shift+space"
 * @returns {{ modifiers: number[][], keyVk: number | null } | null}
 */
export function parseHotkey(hotkey) {
  const parts = hotkey
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (!parts.length) return null;

  /** @type {number[][]} */
  const modifiers = [];
  let keyVk = null;

  for (const part of parts) {
    const modGroup = MODIFIER_GROUPS[part];
    if (modGroup) {
      modifiers.push(modGroup);
      continue;
    }
    const vk = vkForKeyPart(part);
    if (vk === null) return null;
    if (keyVk !== null) return null;
    keyVk = vk;
  }

  if (keyVk === null) return null;
  return { modifiers, keyVk };
}

/**
 * @param {(vk: number) => number} getAsyncKeyState
 * @param {number} vk
 */
function isVkDown(getAsyncKeyState, vk) {
  return (getAsyncKeyState(vk) & 0x8000) !== 0;
}

/**
 * @param {(vk: number) => number} getAsyncKeyState
 * @param {number[][]} modifierGroups
 */
function modifiersDown(getAsyncKeyState, modifierGroups) {
  return modifierGroups.every((group) =>
    group.some((vk) => isVkDown(getAsyncKeyState, vk)),
  );
}

/**
 * @param {{
 *   getAsyncKeyState: (vk: number) => number,
 *   hotkey: string,
 *   pttMode?: "hold" | "toggle",
 *   onPress: () => void,
 *   onRelease: () => void,
 *   intervalMs?: number,
 * }} options
 */
export function startWinGlobalPttPoll(options) {
  const {
    getAsyncKeyState,
    hotkey,
    pttMode = "hold",
    onPress,
    onRelease,
    intervalMs = 12,
  } = options;

  const parsed = parseHotkey(hotkey);
  if (!parsed) {
    return { ok: false, stop: () => {} };
  }

  let comboDown = false;
  let toggleActive = false;

  const tick = () => {
    const modsOk = modifiersDown(getAsyncKeyState, parsed.modifiers);
    const keyOk = isVkDown(getAsyncKeyState, parsed.keyVk);
    const down = modsOk && keyOk;

    if (pttMode === "toggle") {
      if (down && !comboDown) {
        if (toggleActive) {
          toggleActive = false;
          onRelease();
        } else {
          toggleActive = true;
          onPress();
        }
      }
      comboDown = down;
      return;
    }

    if (down && !comboDown) {
      comboDown = true;
      onPress();
    } else if (!down && comboDown) {
      comboDown = false;
      onRelease();
    }
  };

  const timer = setInterval(tick, intervalMs);
  return {
    ok: true,
    stop: () => {
      clearInterval(timer);
      if (pttMode === "hold" && comboDown) {
        comboDown = false;
        onRelease();
      } else if (pttMode === "toggle" && toggleActive) {
        toggleActive = false;
        onRelease();
      }
    },
  };
}
