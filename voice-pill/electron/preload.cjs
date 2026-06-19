const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("spottiVoice", {
  isElectron: true,
  openSettings: () => ipcRenderer.invoke("voice:open-settings"),
  getEngineBase: () => ipcRenderer.invoke("voice:engine-base"),
  ptt: (pressed) => ipcRenderer.invoke("voice:ptt", pressed),
  setOverlaySize: (width, height) =>
    ipcRenderer.invoke("voice:overlay-size", { width, height }),
  minimizeWindow: () => ipcRenderer.invoke("voice:window-minimize"),
  closeWindow: () => ipcRenderer.invoke("voice:window-close"),
  setUiTheme: (theme) => ipcRenderer.invoke("voice:set-ui-theme", theme),
  reloadHotkey: () => ipcRenderer.invoke("voice:reload-hotkey"),
  setHotkeyCapture: (enabled) => ipcRenderer.invoke("voice:set-hotkey-capture", enabled),
      cloudSignIn: () => ipcRenderer.invoke("voice:cloud-sign-in"),
      cloudAuthBegin: () => ipcRenderer.invoke("voice:cloud-auth-begin"),
      cloudAuthFinish: (callbackUrl) => ipcRenderer.invoke("voice:cloud-auth-finish", callbackUrl),
      cloudSignOut: () => ipcRenderer.invoke("voice:cloud-sign-out"),
  cloudStatus: () => ipcRenderer.invoke("voice:cloud-status"),
  runUninstall: () => ipcRenderer.invoke("voice:run-uninstall"),
  onCloudAuthChanged: (handler) => {
    const listener = () => handler();
    ipcRenderer.on("voice:cloud-auth-changed", listener);
    return () => ipcRenderer.removeListener("voice:cloud-auth-changed", listener);
  },
  markOnboardingComplete: () => ipcRenderer.invoke("voice:onboarding-complete"),
  getOnboardingStatus: () => ipcRenderer.invoke("voice:onboarding-status"),
});
