import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("codressPet", {
  openMainWindow: () => ipcRenderer.send("pet-window:open-main"),
  dismiss: () => ipcRenderer.send("pet-window:dismiss"),
  startDrag: () => ipcRenderer.send("pet-window:drag-start"),
  moveDrag: () => ipcRenderer.send("pet-window:drag-move"),
  endDrag: () => ipcRenderer.send("pet-window:drag-end"),
});
