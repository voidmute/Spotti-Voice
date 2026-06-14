import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("spottiSetup", {
  isSetupShell: true,
  getMeta: () => ipcRenderer.invoke("setup:get-meta"),
  getLogPath: () => ipcRenderer.invoke("setup:get-log-path"),
  pickInstallDir: () => ipcRenderer.invoke("setup:pick-install-dir"),
  install: (options) => ipcRenderer.invoke("setup:install", options),
  cancel: () => ipcRenderer.invoke("setup:cancel"),
  minimize: () => ipcRenderer.invoke("setup:window-minimize"),
  maximize: () => ipcRenderer.invoke("setup:window-toggle-maximize"),
  close: () => ipcRenderer.invoke("setup:window-close"),
  onProgress: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("setup:progress", listener);
    return () => ipcRenderer.removeListener("setup:progress", listener);
  },
});
