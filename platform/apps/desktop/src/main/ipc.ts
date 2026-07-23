import { BrowserWindow, dialog, ipcMain, nativeImage, screen, shell } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { loginViaBrowser } from "./auth";
import type { AppContext } from "./context";
import type { DesktopUpdater } from "./updater";
import { installPetToCodex, getInstalledPetSlugs, activatePet, uninstallPet, getActivePet } from "./pet-installer";

/** 渲染层唯一入口:全部走 invoke,主进程持有一切状态与密钥。 */
export function registerIpc(
  ctx: AppContext,
  getWindow: () => BrowserWindow | null,
  updater: DesktopUpdater,
  showMainWindow: () => void,
) {
  const broadcast = () => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send("codress:status-changed");
  };
  const broadcastLibrary = () => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send("codress:library-changed");
  };
  ctx.on("status", broadcast);

  ipcMain.handle("app:status", () => ctx.statusAll());
  ipcMain.handle("app:info", () => ({
    version: ctx.clientVersion,
    platform: process.platform === "darwin" ? "mac" : process.platform === "win32" ? "win" : "other",
  }));
  ipcMain.handle("app:update:latest", async () => {
    const platform = process.platform === "darwin" ? "mac" : process.platform === "win32" ? "win" : null;
    if (!platform) return null;
    try {
      return await ctx.api.latestClient(platform);
    } catch (error) {
      if ((error as Error).message.includes("no release yet")) return null;
      throw error;
    }
  });
  ipcMain.handle("app:update:state", () => updater.getState());
  ipcMain.handle("app:update:check", () => updater.check());
  ipcMain.handle("app:update:install", () => updater.updateNow());
  ipcMain.handle("app:path:pick", async (_e, appId: string, currentPath?: string) => {
    if (appId !== "codex" && appId !== "workbuddy") return null;
    const win = getWindow();
    const picked = await dialog.showOpenDialog(win!, {
      title: process.platform === "darwin" ? "选择应用" : "选择应用可执行文件",
      defaultPath: currentPath?.trim() || ctx.settings.get().appPaths[appId] || undefined,
      filters: process.platform === "win32"
        ? [{ name: "应用程序", extensions: ["exe"] }]
        : [{ name: "macOS 应用", extensions: ["app"] }],
      properties: ["openFile"],
    });
    return picked.canceled ? null : picked.filePaths[0] ?? null;
  });
  ipcMain.handle("settings:get", () => ctx.settings.get());
  ipcMain.handle("settings:patch", (_e, patch) => ctx.settings.patch(patch));

  ipcMain.handle("creator:config:get", () => ctx.creator.getConfig());
  ipcMain.handle("creator:config:save", (_e, input) => ctx.creator.saveConfig(input));
  ipcMain.handle("creator:config:test", () => ctx.creator.testConnection());
  ipcMain.handle("creator:config:models", () => ctx.creator.listModels());
  ipcMain.handle("creator:providers:discover", () => ctx.creator.discoverProviders());
  ipcMain.handle("creator:providers:import", (_e, id: string) => ctx.creator.importDiscovered(id));
  ipcMain.handle("creator:drafts:list", () => ctx.creator.listDrafts());
  ipcMain.handle("creator:drafts:save", (_e, input) => ctx.creator.saveDraft(input));
  ipcMain.handle("creator:drafts:delete", (_e, id: string) => ctx.creator.deleteDraft(id));

  ipcMain.handle("auth:providers", () => ctx.api.providers());
  ipcMain.handle("auth:oauth", async (_e, provider: string) => {
    const token = await loginViaBrowser(ctx.settings.get().apiBase, provider);
    await ctx.settings.patch({ userToken: token });
    const me = await ctx.api.me();
    await ctx.settings.patch({ userName: me.name });
    return me;
  });
  ipcMain.handle("auth:dev", async (_e, name: string) => {
    const result = await ctx.api.devLogin(name);
    await ctx.settings.patch({ userToken: result.token, userName: result.user.name });
    return result.user;
  });
  ipcMain.handle("auth:logout", () => ctx.settings.patch({ userToken: null, userName: null }));
  ipcMain.handle("auth:me", () => ctx.api.me());
  ipcMain.handle("auth:events", () => ctx.api.myEvents());

  ipcMain.handle("store:skins", (_e, params) => ctx.api.listSkins(params ?? {}));
  ipcMain.handle("store:pets", (_e, params) => ctx.api.listPets(params ?? {}));
  ipcMain.handle("store:categories", (_e, type) => ctx.api.listCategories(type));
  ipcMain.handle("store:favorites", () => ctx.api.listFavorites());
  ipcMain.handle("store:toggleFavorite", (_e, itemType: string, itemSlug: string) =>
    ctx.api.toggleFavorite(itemType, itemSlug)
  );

  ipcMain.handle("library:list", (_e, target: string) => ctx.library.listInstalled(target));

  ipcMain.handle("skin:apply", (_e, target: string, slug: string, allowRestart: boolean) =>
    ctx.applySkin(target, slug, { allowRestart: Boolean(allowRestart) })
  );
  ipcMain.handle("skin:pause", (_e, target: string) => ctx.pauseSkin(target));
  ipcMain.handle("skin:resume", (_e, target: string) => ctx.resumeSkin(target));
  ipcMain.handle("skin:restore", (_e, target: string) => ctx.restoreSkin(target));
  ipcMain.handle("skin:importImage", async (_e, target: string) => {
    const win = getWindow();
    const picked = await dialog.showOpenDialog(win!, {
      title: "选择一张 16:9 纯背景图",
      filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp"] }],
      properties: ["openFile"],
    });
    if (picked.canceled || !picked.filePaths[0]) return { ok: false, message: "已取消" };
    const result = await ctx.applyLocalImage(target, picked.filePaths[0], "");
    broadcastLibrary();
    return result;
  });
  ipcMain.handle("skin:pickImage", async () => {
    const win = getWindow();
    const picked = await dialog.showOpenDialog(win!, {
      title: "选择皮肤背景图",
      filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp"] }],
      properties: ["openFile"],
    });
    if (picked.canceled || !picked.filePaths[0]) return null;
    const filePath = picked.filePaths[0];
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size < 1 || stat.size > 16 * 1024 * 1024) {
      throw new Error("图片必须小于 16 MB");
    }
    const extension = path.extname(filePath).toLowerCase();
    const mime = extension === ".png"
      ? "image/png"
      : extension === ".webp"
        ? "image/webp"
        : "image/jpeg";
    const [bytes, image] = await Promise.all([
      fs.readFile(filePath),
      Promise.resolve(nativeImage.createFromPath(filePath)),
    ]);
    const size = image.getSize();
    if (image.isEmpty() || size.width < 1 || size.height < 1) {
      throw new Error("无法读取这张图片");
    }
    return {
      dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
      name: path.basename(filePath, extension),
      width: size.width,
      height: size.height,
      sizeBytes: stat.size,
    };
  });
  ipcMain.handle("skin:createLocal", async (_e, target: string, input: unknown) => {
    if (target !== "codex" && target !== "workbuddy") throw new Error("不支持的目标应用");
    if (!input || typeof input !== "object") throw new Error("皮肤参数无效");
    const value = input as Record<string, unknown>;
    const match = typeof value.imageDataUrl === "string"
      ? value.imageDataUrl.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/)
      : null;
    if (!match) throw new Error("生成的皮肤图片格式无效");
    const imageData = Buffer.from(match[1], "base64");
    if (imageData.length < 1 || imageData.length > 16 * 1024 * 1024) {
      throw new Error("生成的皮肤图片必须小于 16 MB");
    }
    const name = typeof value.name === "string" ? value.name.trim().slice(0, 80) : "";
    const appearance = value.appearance === "light" || value.appearance === "dark"
      ? value.appearance
      : "auto";
    const rawColors = value.colors && typeof value.colors === "object"
      ? value.colors as Record<string, unknown>
      : {};
    const color = (key: string, fallback: string) =>
      typeof rawColors[key] === "string" && /^#[0-9a-fA-F]{6}$/.test(rawColors[key] as string)
        ? rawColors[key] as string
        : fallback;
    const rawCustomization = value.customization && typeof value.customization === "object"
      ? value.customization as Record<string, unknown>
      : {};
    const customization = Object.fromEntries(
      Object.entries(rawCustomization)
        .filter(([, item]) => typeof item === "string" || (typeof item === "number" && Number.isFinite(item)))
        .slice(0, 20),
    ) as Record<string, string | number>;
    const result = await ctx.createLocalSkin(target, imageData, {
      name: name || "我的皮肤",
      appearance,
      colors: {
        background: color("background", "#111318"),
        panel: color("panel", "#191c22"),
        text: color("text", "#edf0f1"),
        accent: color("accent", "#8298a3"),
      },
      customization,
    });
    broadcastLibrary();
    return result;
  });

  ipcMain.handle("pet:set", (_e, slug: string | null) => ctx.setPet(slug));
  ipcMain.handle("pet:install", (_e, slug: string) => installPetToCodex(ctx.api, ctx.library.petsDir(), slug));
  ipcMain.handle("pet:activate", (_e, slug: string) => activatePet(slug));
  ipcMain.handle("pet:uninstall", (_e, slug: string) => uninstallPet(slug));
  ipcMain.handle("pet:installed", () => getInstalledPetSlugs());
  ipcMain.handle("pet:active", () => getActivePet());
  const petDragStates = new Map<number, { cursorX: number; cursorY: number; windowX: number; windowY: number }>();
  ipcMain.on("pet-window:open-main", (event) => {
    if (ctx.pets.ownsWebContents(event.sender)) showMainWindow();
  });
  ipcMain.on("pet-window:drag-start", (event) => {
    if (!ctx.pets.ownsWebContents(event.sender)) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const cursor = screen.getCursorScreenPoint();
    const [windowX, windowY] = win.getPosition();
    petDragStates.set(event.sender.id, { cursorX: cursor.x, cursorY: cursor.y, windowX, windowY });
  });
  ipcMain.on("pet-window:drag-move", (event) => {
    const state = petDragStates.get(event.sender.id);
    if (!state || !ctx.pets.ownsWebContents(event.sender)) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const cursor = screen.getCursorScreenPoint();
    win.setPosition(
      state.windowX + cursor.x - state.cursorX,
      state.windowY + cursor.y - state.cursorY,
    );
  });
  ipcMain.on("pet-window:drag-end", (event) => {
    petDragStates.delete(event.sender.id);
  });
  ipcMain.handle("shell:openExternal", (_e, url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url);
    return undefined;
  });
}
