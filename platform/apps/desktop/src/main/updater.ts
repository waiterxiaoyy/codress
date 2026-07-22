import { app, type BrowserWindow } from "electron";
import { autoUpdater, type ProgressInfo, type UpdateInfo } from "electron-updater";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "not-available"
  | "error";

export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  version?: string;
  notes?: string;
  progress?: number;
  error?: string;
}

function releaseNotes(info: UpdateInfo) {
  if (typeof info.releaseNotes === "string") return info.releaseNotes;
  if (Array.isArray(info.releaseNotes)) {
    return info.releaseNotes.map((item) => item.note).filter(Boolean).join("\n\n");
  }
  return "";
}

/**
 * 更新的单一状态源。下载、校验和替换应用全部留在主进程；渲染层只展示状态并发起操作。
 */
export class DesktopUpdater {
  private state: UpdateState = { status: "idle", currentVersion: app.getVersion() };
  private started = false;

  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    private readonly beforeInstall: () => Promise<void>,
  ) {}

  start() {
    if (this.started) return;
    this.started = true;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on("checking-for-update", () => this.patch({ status: "checking", error: undefined }));
    autoUpdater.on("update-available", (info) => this.patch({
      status: "available",
      version: info.version,
      notes: releaseNotes(info),
      progress: 0,
      error: undefined,
    }));
    autoUpdater.on("update-not-available", (info) => this.patch({
      status: "not-available",
      version: info.version,
      notes: releaseNotes(info),
      progress: undefined,
      error: undefined,
    }));
    autoUpdater.on("download-progress", (progress: ProgressInfo) => this.patch({
      status: "downloading",
      progress: Math.max(0, Math.min(100, progress.percent)),
    }));
    autoUpdater.on("update-downloaded", (info) => this.patch({
      status: "downloaded",
      version: info.version,
      notes: releaseNotes(info),
      progress: 100,
      error: undefined,
    }));
    autoUpdater.on("error", (error) => this.patch({
      status: "error",
      error: error.message || "更新失败，请稍后重试",
    }));

    // 自动更新只在安装后的正式包中运行，开发模式不会访问发布源。
    if (app.isPackaged) {
      setTimeout(() => this.check().catch(() => undefined), 1800);
      setInterval(() => this.check().catch(() => undefined), 4 * 60 * 60 * 1000);
    }
  }

  getState() {
    return this.state;
  }

  async check() {
    if (!app.isPackaged) {
      this.patch({ status: "error", error: "开发模式不检查客户端更新，请安装正式包后测试" });
      return this.state;
    }
    if (this.state.status === "checking" || this.state.status === "downloading") return this.state;
    this.patch({ status: "checking", error: undefined });
    await autoUpdater.checkForUpdates();
    return this.state;
  }

  async updateNow() {
    if (!app.isPackaged) throw new Error("开发模式不能安装客户端更新");
    if (this.state.status === "downloaded") return this.install();
    if (this.state.status !== "available") {
      await this.check();
      const refreshed = this.getState();
      if (refreshed.status !== "available") return refreshed;
    }
    this.patch({ status: "downloading", progress: 0, error: undefined });
    await autoUpdater.downloadUpdate();
    return this.install();
  }

  private async install() {
    if (this.state.status !== "downloaded") return this.state;
    await this.beforeInstall();
    autoUpdater.quitAndInstall(false, true);
    return this.state;
  }

  private patch(patch: Partial<UpdateState>) {
    this.state = { ...this.state, ...patch };
    const window = this.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send("codress:update-state", this.state);
  }
}
