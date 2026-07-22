import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { loginViaBrowser } from "./auth";
import type { AppContext } from "./context";
import type { DesktopUpdater } from "./updater";
import { installPetToCodex, getInstalledPetSlugs, activatePet, uninstallPet, getActivePet } from "./pet-installer";

/** 渲染层唯一入口:全部走 invoke,主进程持有一切状态与密钥。 */
export function registerIpc(ctx: AppContext, getWindow: () => BrowserWindow | null, updater: DesktopUpdater) {
  const broadcast = () => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send("codress:status-changed");
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
    return ctx.applyLocalImage(target, picked.filePaths[0], "");
  });

  ipcMain.handle("pet:set", (_e, slug: string | null) => ctx.setPet(slug));
  ipcMain.handle("pet:install", (_e, slug: string) => installPetToCodex(ctx.api, slug));
  ipcMain.handle("pet:activate", (_e, slug: string) => activatePet(slug));
  ipcMain.handle("pet:uninstall", (_e, slug: string) => uninstallPet(slug));
  ipcMain.handle("pet:installed", () => getInstalledPetSlugs());
  ipcMain.handle("pet:active", () => getActivePet());
  ipcMain.handle("shell:openExternal", (_e, url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url);
    return undefined;
  });
}
