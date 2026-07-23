import path from "node:path";
import { BrowserWindow, Menu, app, protocol } from "electron";
import { AppContext } from "./context";
import { registerIpc } from "./ipc";
import { createTray } from "./tray";
import { PetManager, petPageLocator } from "./pets";
import { DesktopUpdater } from "./updater";
import { installWindowGuards } from "./window-guards";

// 确保 Codress 自身不受 WorkBuddy 调试端口环境变量影响
delete process.env.WORKBUDDY_REMOTE_DEBUGGING_PORT;

// Keep development state and the single-instance lock separate from an installed build.
if (!app.isPackaged) {
  app.setPath("userData", `${app.getPath("userData")}-dev`);
}

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
      devTools: !app.isPackaged,
    },
  });
  installWindowGuards(mainWindow.webContents, !app.isPackaged);
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
    if (app.isPackaged) Menu.setApplicationMenu(null);

    // 暴露 resources 目录给渲染进程:app-asset://<file> → resources/<file>
    protocol.registerFileProtocol("app-asset", (request, cb) => {
      const url = new URL(request.url);
      // app-asset://codex.png 会把文件名解析为 hostname；
      // app-asset:///codex.png 则位于 pathname。两种形式都兼容。
      const file = path.basename(url.pathname) || path.basename(url.hostname);
      cb({ path: path.join(resourcesRoot, file) });
    });

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
    const updater = new DesktopUpdater(
      () => mainWindow,
      async () => {
        if (!ctx) return;
        const closing = ctx;
        ctx = null;
        await closing.shutdown().catch(() => undefined);
      },
    );
    registerIpc(ctx, () => mainWindow, updater, createMainWindow);
    createMainWindow();
    createTray(ctx, resourcesRoot, createMainWindow);
    updater.start();

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
