const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("spottiTrayMenu", {
  showPill: () => ipcRenderer.invoke("voice:tray-show-pill"),
  openSetup: () => ipcRenderer.invoke("voice:tray-open-setup"),
  quit: () => ipcRenderer.invoke("voice:tray-quit"),
  dismiss: () => ipcRenderer.invoke("voice:tray-menu-dismiss"),
  reportSize: (width, height) =>
    ipcRenderer.invoke("voice:tray-menu-resize", { width, height }),
});
