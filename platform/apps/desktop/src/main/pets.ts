import path from "node:path";
import { app, BrowserWindow, screen, type WebContents } from "electron";
import { installWindowGuards } from "./window-guards";

export interface ActivePet {
  slug: string;
  name: string;
  animation: string;
  imagePath: string;
  assetVersion?: string;
}

/**
 * 桌面宠物 = 透明置顶小窗(与皮肤注入完全平行的能力)。
 * 可拖动;不抢焦点;从托盘或客户端关闭。
 */
export class PetManager {
  private window: BrowserWindow | null = null;
  private loadedPetKey: string | null = null;
  current: ActivePet | null = null;

  constructor(private readonly petPageUrl: () => { file?: string; url?: string }) {}

  async show(pet: ActivePet) {
    this.current = pet;
    if (!this.window || this.window.isDestroyed()) {
      // 使用鼠标所在屏幕，解决多显示器宠物"消失"问题
      const cursorPoint = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(cursorPoint);
      const workArea = display.workArea;
      this.window = new BrowserWindow({
        width: 180,
        height: 200,
        x: workArea.x + workArea.width - 220,
        y: workArea.y + workArea.height - 240,
        transparent: true,
        frame: false,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: false,
        focusable: false,
        webPreferences: {
          preload: path.join(__dirname, "../preload/pet.js"),
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: false, // 允许 file:// 加载本地图片
          devTools: !app.isPackaged,
        },
      });
      installWindowGuards(this.window.webContents, false);
      this.window.setAlwaysOnTop(true, "screen-saver");
      this.window.on("closed", () => {
        this.window = null;
        this.loadedPetKey = null;
      });
    }
    const petKey = `${pet.slug}:${pet.imagePath}:${pet.animation}:${pet.assetVersion ?? ""}`;
    const query = {
      image: pet.imagePath,
      name: pet.name,
      animation: pet.animation,
    };
    const target = this.petPageUrl();
    if (this.loadedPetKey !== petKey) {
      if (target.url) {
        const url = new URL(target.url);
        for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
        await this.window.loadURL(url.toString());
      } else if (target.file) {
        await this.window.loadFile(target.file, { query });
      }
      this.loadedPetKey = petKey;
    }
    this.window.showInactive();
  }

  hide() {
    this.current = null;
    if (this.window && !this.window.isDestroyed()) this.window.hide();
  }

  ownsWebContents(webContents: WebContents) {
    return Boolean(this.window && !this.window.isDestroyed() && this.window.webContents === webContents);
  }

  shutdown() {
    this.current = null;
    this.loadedPetKey = null;
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
  }
}

export function petPageLocator(rendererDist: string, devServerUrl?: string) {
  return () => {
    if (devServerUrl) {
      // dev 模式：从项目根目录定位 src/renderer/pet.html
      const appRoot = app.getAppPath();
      return { file: path.join(appRoot, "src", "renderer", "pet.html") };
    }
    return { file: path.join(rendererDist, "pet.html") };
  };
}
