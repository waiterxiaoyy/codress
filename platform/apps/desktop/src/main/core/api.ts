import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export interface SkinArt {
  safeArea?: "auto" | "left" | "right" | "center" | "none";
  taskMode?: "auto" | "ambient" | "banner" | "off";
  focusX?: number;
  focusY?: number;
}

export interface SkinManifest {
  slug: string;
  name: string;
  description?: string;
  category?: string;
  targets: string[];
  appearance?: string;
  art?: SkinArt | null;
  colors?: Record<string, string> | null;
  // 文案字段
  tagline?: string;
  quote?: string;
  statusText?: string;
  brandSubtitle?: string;
  projectPrefix?: string;
  projectLabel?: string;
  backgroundUrl: string;
  previewLightUrl?: string;
  previewDarkUrl?: string;
  downloads?: number;
  source?: "store" | "local";
  createdAt?: string;
  customization?: Record<string, string | number>;
}

export interface PetManifest {
  slug: string;
  name: string;
  description?: string;
  category?: string;
  targets: string[];
  imageUrl: string;
  animation: string;
  // Codex v2 sprite sheet 字段
  spriteSheet?: string;
  manifest?: {
    id: string;
    displayName: string;
    description?: string;
    spriteVersionNumber: number;
    spritesheetPath?: string;
  };
  stylePreset?: string;
  tags?: string;
  author?: string;
  downloads?: number;
  hash?: string;
  sizeBytes?: number;
}

export interface ListResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ClientRelease {
  id: number;
  platform: "win" | "mac";
  version: string;
  url: string;
  notes: string;
  mandatory: boolean;
  createdAt: string;
}

/** 云端商店 API 客户端(主进程用,渲染层经 IPC 间接访问)。 */
export class ApiClient {
  constructor(
    private readonly getBase: () => string,
    private readonly getToken: () => string | null
  ) {}

  private async request<T>(pathName: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined),
    };
    if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const resp = await fetch(`${this.getBase()}${pathName}`, { ...init, headers });
    const body = (await resp.json().catch(() => ({}))) as T & { error?: string };
    if (!resp.ok) throw new Error(body?.error ?? `HTTP ${resp.status}`);
    return body;
  }

  listSkins(params: { target?: string; category?: string; page?: number; pageSize?: number; q?: string }) {
    const search = new URLSearchParams();
    if (params.target) search.set("target", params.target);
    if (params.category) search.set("category", params.category);
    if (params.q) search.set("q", params.q);
    search.set("page", String(params.page ?? 1));
    search.set("pageSize", String(params.pageSize ?? 48));
    return this.request<ListResult<SkinManifest>>(`/api/v1/skins?${search}`);
  }

  getSkin(slug: string) {
    return this.request<SkinManifest>(`/api/v1/skins/${slug}`);
  }

  downloadSkin(slug: string, target?: string) {
    const suffix = target ? `?target=${target}` : "";
    return this.request<{ url: string; manifest: SkinManifest }>(
      `/api/v1/skins/${slug}/download${suffix}`,
      { method: "POST" }
    );
  }

  listPets(params: { target?: string; category?: string; page?: number; pageSize?: number; q?: string }) {
    const search = new URLSearchParams();
    if (params.target) search.set("target", params.target);
    if (params.category) search.set("category", params.category);
    if (params.q) search.set("q", params.q);
    search.set("page", String(params.page ?? 1));
    search.set("pageSize", String(params.pageSize ?? 24));
    return this.request<ListResult<PetManifest>>(`/api/v1/pets?${search}`);
  }

  getPet(slug: string) {
    return this.request<PetManifest>(`/api/v1/pets/${slug}`);
  }

  downloadPet(slug: string) {
    return this.request<{ url: string; hash?: string; sizeBytes?: number; manifest: PetManifest }>(`/api/v1/pets/${slug}/download`, {
      method: "POST",
    });
  }

  listCategories(type: "skin" | "pet") {
    return this.request<{ items: { slug: string; name: string }[] }>(
      `/api/v1/categories?type=${type}`
    );
  }

  adapterConfig(appId: string, platform: string) {
    return this.request<{ version: number; config: Record<string, unknown> | null; css: string }>(
      `/api/v1/adapters/${appId}?platform=${platform}`
    );
  }

  latestClient(platform: "win" | "mac") {
    return this.request<ClientRelease>(`/api/v1/client/latest?platform=${platform}`);
  }

  providers() {
    return this.request<{ github: boolean; google: boolean; dev: boolean }>(`/api/v1/auth/providers`);
  }

  devLogin(name: string) {
    return this.request<{ token: string; user: { name: string } }>(`/api/v1/auth/dev`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  me() {
    return this.request<{ name: string; email: string; provider: string }>(`/api/v1/me`);
  }

  myEvents() {
    return this.request<ListResult<Record<string, unknown>>>(`/api/v1/me/events?pageSize=50`);
  }

  recordEvent(event: { action: string; itemType: string; itemSlug?: string; target?: string }) {
    return this.request(`/api/v1/me/events`, { method: "POST", body: JSON.stringify(event) }).catch(
      () => undefined
    );
  }

  toggleFavorite(itemType: string, itemSlug: string) {
    return this.request<{ favorited: boolean }>(`/api/v1/me/favorites/toggle`, {
      method: "POST",
      body: JSON.stringify({ itemType, itemSlug }),
    });
  }

  listFavorites() {
    return this.request<{ items: { itemType: string; itemSlug: string }[] }>(`/api/v1/me/favorites`);
  }

  postTelemetry(event: {
    appId: string;
    skinSlug?: string;
    clientVersion: string;
    os: string;
    pass: boolean;
    message?: string;
  }) {
    return this.request(`/api/v1/telemetry/verify`, {
      method: "POST",
      body: JSON.stringify(event),
    }).catch(() => undefined);
  }

  /** 下载远程文件到本地路径。 */
  async downloadFile(url: string, dest: string): Promise<void> {
    const resp = await fetch(url);
    if (!resp.ok || !resp.body) throw new Error(`download failed: HTTP ${resp.status}`);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await pipeline(Readable.fromWeb(resp.body as never), createWriteStream(dest));
  }
}
