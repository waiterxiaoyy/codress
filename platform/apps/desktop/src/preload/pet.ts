import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("codressPet", {
  openMainWindow: () => ipcRenderer.send("pet-window:open-main"),
  dismiss: () => ipcRenderer.send("pet-window:dismiss"),
  startDrag: () => ipcRenderer.send("pet-window:drag-start"),
  moveDrag: () => ipcRenderer.send("pet-window:drag-move"),
  endDrag: () => ipcRenderer.send("pet-window:drag-end"),
  onAgentState: (callback: (state: unknown) => void) => {
    ipcRenderer.on("pet:agent-state", (_event, state) => callback(state));
  },
  onAgentTransient: (callback: (kind: unknown) => void) => {
    ipcRenderer.on("pet:agent-transient", (_event, kind) => callback(kind));
  },
});
