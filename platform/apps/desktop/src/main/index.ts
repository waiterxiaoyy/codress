import path from "node:path";
import { BrowserWindow, app } from "electron";
import { AppContext } from "./context";
import { registerIpc } from "./ipc";
import { createTray } from "./tray";
import { PetManager, petPageLocator } from "./pets";

let mainWindow: BrowserWindow | null = null;
let ctx: AppContext | null = null;

const resourcesRoot = app.isPackaged
  ? path.join(process.resourcesPath, "resources")
  : path.join(app.getAppPath(), "resources");

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    title: "Codress",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) mainWindow.loadURL(devUrl);
  else mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const singleLock = app.requestSingleInstanceLock();
if (!singleLock) {
  app.quit();
} else {
  app.on("second-instance", () => createMainWindow());

  app.whenReady().then(async () => {
    const pets = new PetManager(
      petPageLocator(
        path.join(__dirname, "../renderer"),
        process.env.ELECTRON_RENDERER_URL
      )
    );
    ctx = new AppContext({
      userDataDir: app.getPath("userData"),
      runtimeRoot: resourcesRoot,
      clientVersion: app.getVersion(),
      pets,
    });
    await ctx.init();
    registerIpc(ctx, () => mainWindow);
    createMainWindow();
    createTray(ctx, resourcesRoot, createMainWindow);

    app.on("activate", () => createMainWindow());
  });

  app.on("window-all-closed", () => {
    // 常驻托盘:关窗不退出(皮肤守护与宠物继续),从托盘退出。
    if (process.platform === "darwin") return;
  });

  app.on("before-quit", async (event) => {
    if (ctx) {
      event.preventDefault();
      const closing = ctx;
      ctx = null;
      await closing.shutdown().catch(() => undefined);
      app.exit(0);
    }
  });
}
