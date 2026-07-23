import type { Input, WebContents } from "electron";

function isZoomShortcut(input: Input) {
  if (!input.control && !input.meta) return false;
  return ["+", "-", "=", "0", "Add", "Subtract"].includes(input.key);
}

export function installWindowGuards(webContents: WebContents, allowDevTools: boolean) {
  webContents.setZoomFactor(1);
  void webContents.setVisualZoomLevelLimits(1, 1);
  webContents.on("zoom-changed", (event) => {
    event.preventDefault();
    webContents.setZoomLevel(0);
  });
  webContents.on("before-input-event", (event, input) => {
    if (isZoomShortcut(input)) {
      event.preventDefault();
      webContents.setZoomLevel(0);
      return;
    }
    if (input.type === "keyDown" && input.key === "F12") {
      event.preventDefault();
      if (allowDevTools) webContents.toggleDevTools();
    }
  });
}
