"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  closeApp: () => electron.ipcRenderer.invoke("close-app"),
  closeWindow: () => electron.ipcRenderer.invoke("close-window"),
  onMainProcessMessage: (callback) => {
    electron.ipcRenderer.on("main-process-message", (_event, message) => {
      callback(message);
    });
  }
});
