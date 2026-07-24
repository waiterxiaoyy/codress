import { EventEmitter } from "node:events";
import path from "node:path";
import { promises as fs } from "node:fs";
import { adapters, adapterFor, type AdapterDefinition } from "./adapters";
import { AppDaemon } from "./engine/daemon";
import {
  buildCatalogPayload,
  buildThemePayload,
  loadRuntimeAssets,
  type BuiltPayload,
} from "./engine/payload";
import { cdpReady } from "./engine/cdp";
import { discoverInstall, ensureAppWithCdp } from "./launcher";
import { ApiClient, type SkinManifest } from "./core/api";
import { SkinLibrary } from "./core/library";
import { SettingsStore } from "./core/state";
import { PetManager } from "./pets";
import { CreatorWorkspace } from "./creator";
import { ensurePetAsset } from "./core/pet-assets";

export interface ApplyOutcome {
  ok: boolean;
  needsRestart?: boolean;
  message?: string;
  verifyPass?: boolean;
}

export interface AdapterStatus {
  id: string;
  name: string;
  icon?: string;
  installed: boolean;
  installPath: string | null;
  port: number;
  cdpReady: boolean;
  daemonState: string;
  sessions: number;
  activeSkin: string | null;
}

/** 主进程业务中枢:设置 / 商店 / 皮肤库 / 注入守护 / 宠物。 */
export class AppContext extends EventEmitter {
  readonly settings: SettingsStore;
  readonly api: ApiClient;
  readonly library: SkinLibrary;
  readonly pets: PetManager;
  readonly creator: CreatorWorkspace;
  readonly clientVersion: string;
  private readonly runtimeRoot: string;
  private daemons = new Map<string, AppDaemon>();
  private remoteAdapterCache = new Map<string, { css: string; defaultPort?: number }>();

  constructor(options: {
    userDataDir: string;
    runtimeRoot: string;
    clientVersion: string;
    pets: PetManager;
  }) {
    super();
    this.settings = new SettingsStore(options.userDataDir);
    this.library = new SkinLibrary(path.join(options.userDataDir, "library"));
    this.pets = options.pets;
    this.creator = new CreatorWorkspace(options.userDataDir);
    this.runtimeRoot = options.runtimeRoot;
    this.clientVersion = options.clientVersion;
    this.api = new ApiClient(
      () => this.settings.get().apiBase,
      () => this.settings.get().userToken
    );
  }

  async init() {
    await Promise.all([this.settings.load(), this.creator.load()]);
  }

  portFor(adapter: AdapterDefinition): number {
    return this.settings.get().ports[adapter.id] ?? adapter.defaultPort;
  }

  daemonFor(adapter: AdapterDefinition): AppDaemon {
    let daemon = this.daemons.get(adapter.id);
    if (!daemon) {
      daemon = new AppDaemon(adapter, this.portFor(adapter));
      daemon.on("status", () => this.emit("status"));
      daemon.on("log", (line: string) => this.emit("log", `[${adapter.id}] ${line}`));
      this.daemons.set(adapter.id, daemon);
    }
    daemon.port = this.portFor(adapter);
    return daemon;
  }

  /** 服务端热下发的适配器覆盖(选择器 CSS 修补),拿不到就用内置。 */
  private async remoteAdapter(adapter: AdapterDefinition) {
    const cached = this.remoteAdapterCache.get(adapter.id);
    if (cached) return cached;
    try {
      const platform = process.platform === "darwin" ? "mac" : "win";
      const remote = await this.api.adapterConfig(adapter.id, platform);
      const entry = {
        css: remote.css ?? "",
        defaultPort: (remote.config as { defaultPort?: number } | null)?.defaultPort,
      };
      this.remoteAdapterCache.set(adapter.id, entry);
      return entry;
    } catch {
      const entry = { css: "" };
      this.remoteAdapterCache.set(adapter.id, entry);
      return entry;
    }
  }

  private runtimeDir(adapter: AdapterDefinition): string {
    return path.join(this.runtimeRoot, "runtime", adapter.id);
  }

  private async buildPayload(adapter: AdapterDefinition, themeDir: string): Promise<BuiltPayload> {
    const remote = await this.remoteAdapter(adapter);
    const assets = await loadRuntimeAssets(this.runtimeDir(adapter), remote.css);
    return adapter.payloadKind === "catalog"
      ? buildCatalogPayload(adapter, assets, themeDir)
      : buildThemePayload(adapter, assets, themeDir);
  }

  async statusAll(): Promise<AdapterStatus[]> {
    const out: AdapterStatus[] = [];
    for (const adapter of Object.values(adapters)) {
      const install = await discoverInstall(adapter, this.settings.get().appPaths[adapter.id]);
      const port = this.portFor(adapter);
      const daemon = this.daemons.get(adapter.id);
      out.push({
        id: adapter.id,
        name: adapter.name,
        icon: adapter.icon,
        installed: Boolean(install),
        installPath: install?.path ?? null,
        port,
        cdpReady: await cdpReady(port),
        daemonState: daemon?.state ?? "stopped",
        sessions: daemon?.sessionCount ?? 0,
        activeSkin: this.settings.get().activeSkins[adapter.id] ?? null,
      });
    }
    return out;
  }

  /** 确保皮肤已在本地:没有则从商店下载落盘。 */
  private async ensureInstalled(target: string, slug: string): Promise<string> {
    const themeDir = this.library.themeDirFor(target, slug);
    const metaFile = target === "workbuddy" ? "catalog.json" : "theme.json";
    try {
      await fs.access(path.join(themeDir, metaFile));
      return themeDir;
    } catch {
      /* 需要下载 */
    }
    const download = await this.api.downloadSkin(slug, target);
    const manifest = download.manifest as SkinManifest;
    const imagePath = this.library.imageDownloadPath(target, slug, download.url);
    await this.api.downloadFile(download.url, imagePath);
    await this.library.install(target, manifest, imagePath);
    return themeDir;
  }

  /** 一键应用皮肤(完整链路:下载→启动→注入→验证→记录)。 */
  async applySkin(target: string, slug: string, { allowRestart = false } = {}): Promise<ApplyOutcome> {
    const adapter = adapterFor(target);
    const themeDir = await this.ensureInstalled(target, slug);
    const ensure = await ensureAppWithCdp(
      adapter,
      this.portFor(adapter),
      this.settings.get().appPaths[adapter.id],
      { allowRestart }
    );
    if (!ensure.ok) {
      return {
        ok: false,
        needsRestart: ensure.reason === "needs-restart",
        message: ensure.message,
      };
    }
    const payload = await this.buildPayload(adapter, themeDir);
    const daemon = this.daemonFor(adapter);
    if (daemon.state === "stopped") daemon.start(payload);
    const verify = await daemon.setPayload(payload);
    const pass = Boolean(verify?.pass);
    await this.settings.patch({ activeSkins: { [adapter.id]: slug } });
    void this.api.recordEvent({ action: "apply", itemType: "skin", itemSlug: slug, target });
    void this.api.postTelemetry({
      appId: adapter.id,
      skinSlug: slug,
      clientVersion: this.clientVersion,
      os: process.platform === "darwin" ? "mac" : "win",
      pass,
      message: pass ? "" : "verify failed after apply",
    });
    this.emit("status");
    return { ok: pass, verifyPass: pass, message: pass ? undefined : "注入完成但显示校验未通过" };
  }

  async applyLocalImage(target: string, imagePath: string, name: string): Promise<ApplyOutcome> {
    const installed = await this.library.importImage(target, imagePath, name);
    return this.applySkin(target, installed.slug, { allowRestart: false });
  }

  async createLocalSkin(
    target: string,
    imageData: Buffer,
    options: {
      name: string;
      appearance: "auto" | "light" | "dark";
      colors: { background: string; panel: string; text: string; accent: string };
      customization: Record<string, string | number>;
    },
  ): Promise<ApplyOutcome & { slug: string; name: string }> {
    const installed = await this.library.importImageData(target, imageData, options);
    const outcome = await this.applySkin(target, installed.slug, { allowRestart: false });
    return { ...outcome, slug: installed.slug, name: installed.name };
  }

  async applyPreviewSkin(target: string, snapshot: SkinManifest): Promise<ApplyOutcome> {
    if (target !== "codex" && target !== "workbuddy") {
      throw new Error("调试票据包含不支持的目标应用");
    }
    const response = await fetch(snapshot.backgroundUrl);
    if (!response.ok) throw new Error(`预览背景下载失败：HTTP ${response.status}`);
    const imageData = Buffer.from(await response.arrayBuffer());
    if (imageData.length < 1 || imageData.length > 16 * 1024 * 1024) {
      throw new Error("预览背景必须小于 16 MB");
    }
    const installed = await this.library.importPreviewData(target, imageData, snapshot);
    const outcome = await this.applySkin(target, installed.slug, { allowRestart: false });
    this.emit("library");
    return outcome;
  }

  async pauseSkin(target: string) {
    const daemon = this.daemons.get(target);
    if (daemon) await daemon.pause();
    this.emit("status");
  }

  async resumeSkin(target: string) {
    const daemon = this.daemons.get(target);
    if (daemon) await daemon.resume();
    this.emit("status");
  }

  /** 恢复默认外观:移除注入并停守护。 */
  async restoreSkin(target: string) {
    const daemon = this.daemons.get(target);
    if (daemon) await daemon.stop({ removeSkin: true });
    await this.settings.patch({ activeSkins: { [target]: null } });
    void this.api.recordEvent({ action: "remove", itemType: "skin", target });
    this.emit("status");
  }

  /** 宠物与主题平行:独立悬浮窗,不依赖任何注入。 */
  async setPet(slug: string | null): Promise<void> {
    if (!slug) {
      await this.settings.patch({ activePet: null });
      this.pets.hide();
      this.emit("status");
      return;
    }
    const asset = await ensurePetAsset(this.api, this.library.petsDir(), slug, false);
    const previousPet = this.settings.get().activePet;
    await this.settings.patch({ activePet: slug });
    try {
      await this.pets.show({
        slug,
        name: asset.manifest.name,
        animation: asset.manifest.animation ?? "idle",
        imagePath: asset.imagePath,
        assetVersion: asset.hash,
      });
    } catch (error) {
      await this.settings.patch({ activePet: previousPet }).catch(() => undefined);
      throw error;
    }
    void this.api.recordEvent({ action: "apply", itemType: "pet", itemSlug: slug, target: "codex" });
    this.emit("status");
  }

  async shutdown() {
    for (const daemon of this.daemons.values()) {
      await daemon.stop({ removeSkin: false }).catch(() => undefined);
    }
    this.pets.shutdown();
  }
}
