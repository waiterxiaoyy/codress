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

export interface SkinItem {
  slug: string;
  name: string;
  description?: string;
  category?: string;
  targets: string[];
  backgroundUrl: string;
  previewLightUrl?: string;
  downloads?: number;
}

export interface PetItem {
  slug: string;
  name: string;
  description?: string;
  targets: string[];
  imageUrl: string;
  animation: string;
  spriteSheet?: string;   // spritesheet.webp URL (Codex v2)
  manifest?: PetManifest; // pet.json content
  stylePreset?: string;
  tags?: string;
  author?: string;
  downloads?: number;
}

export interface PetManifest {
  id: string;
  displayName: string;
  description?: string;
  spriteVersionNumber: number;
  spritesheetPath?: string;
}

export interface Settings {
  apiBase: string;
  userToken: string | null;
  userName: string | null;
  activePet: string | null;
  activeSkins: Record<string, string | null>;
  appPaths: Record<string, string>;
  ports: Record<string, number>;
}

export interface ApplyOutcome {
  ok: boolean;
  needsRestart?: boolean;
  message?: string;
  verifyPass?: boolean;
}

export interface CodressBridge {
  onStatusChanged(listener: () => void): () => void;
  appStatus(): Promise<AdapterStatus[]>;
  getSettings(): Promise<Settings>;
  patchSettings(patch: Partial<Settings>): Promise<Settings>;
  authProviders(): Promise<{ github: boolean; google: boolean; dev: boolean }>;
  loginOAuth(provider: string): Promise<{ name: string }>;
  loginDev(name: string): Promise<{ name: string }>;
  logout(): Promise<Settings>;
  me(): Promise<{ name: string; email: string; provider: string }>;
  myEvents(): Promise<{ items: Record<string, unknown>[] }>;
  storeSkins(params: Record<string, unknown>): Promise<{ items: SkinItem[]; total: number }>;
  storePets(params: Record<string, unknown>): Promise<{ items: PetItem[]; total: number }>;
  storeCategories(type: string): Promise<{ items: { slug: string; name: string }[] }>;
  favorites(): Promise<{ items: { itemType: string; itemSlug: string }[] }>;
  toggleFavorite(itemType: string, itemSlug: string): Promise<{ favorited: boolean }>;
  libraryList(target: string): Promise<{ slug: string; name: string; target: string }[]>;
  applySkin(target: string, slug: string, allowRestart?: boolean): Promise<ApplyOutcome>;
  pauseSkin(target: string): Promise<void>;
  resumeSkin(target: string): Promise<void>;
  restoreSkin(target: string): Promise<void>;
  importImage(target: string): Promise<ApplyOutcome>;
  setPet(slug: string | null): Promise<void>;
  installPetToCodex(slug: string): Promise<{ ok: boolean; message?: string }>;
  activatePetInCodex(slug: string): Promise<{ ok: boolean; message?: string }>;
  uninstallPetFromCodex(slug: string): Promise<{ ok: boolean; message?: string }>;
  getInstalledPets(): Promise<string[]>;
  getActivePetInCodex(): Promise<string | null>;
  openExternal(url: string): Promise<void>;
}

const noop = () => () => {};
const noopAsync = () => Promise.resolve({} as never);
const API_BASE = "http://127.0.0.1:8080";

async function apiFetch<T>(path: string): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`);
  return resp.json();
}

const fallbackBridge: CodressBridge = {
  onStatusChanged: noop,
  appStatus: () => Promise.resolve([]),
  getSettings: () => Promise.resolve({
    apiBase: API_BASE,
    userToken: null, userName: null, activePet: null,
    activeSkins: {}, appPaths: {}, ports: {},
  }),
  patchSettings: noopAsync,
  authProviders: () => Promise.resolve({ github: false, google: false, dev: true }),
  loginOAuth: noopAsync,
  loginDev: noopAsync,
  logout: noopAsync,
  me: noopAsync,
  myEvents: () => Promise.resolve({ items: [] }),
  storeSkins: (params: Record<string, unknown>) => {
    const search = new URLSearchParams();
    if (params.target) search.set("target", String(params.target));
    if (params.category) search.set("category", String(params.category));
    search.set("page", String(params.page ?? 1));
    search.set("pageSize", "48");
    return apiFetch(`/api/v1/skins?${search}`);
  },
  storePets: (params: Record<string, unknown>) => {
    const search = new URLSearchParams();
    if (params.target) search.set("target", String(params.target));
    search.set("page", String(params.page ?? 1));
    search.set("pageSize", "48");
    return apiFetch(`/api/v1/pets?${search}`);
  },
  storeCategories: (type: string) => apiFetch(`/api/v1/categories?type=${type}`),
  favorites: () => Promise.resolve({ items: [] }),
  toggleFavorite: () => Promise.resolve({ favorited: false }),
  libraryList: () => Promise.resolve([]),
  applySkin: () => Promise.resolve({ ok: false, message: "非 Electron 环境，请在桌面客户端操作" }),
  pauseSkin: noopAsync,
  resumeSkin: noopAsync,
  restoreSkin: noopAsync,
  importImage: () => Promise.resolve({ ok: false, message: "非 Electron 环境" }),
  setPet: noopAsync,
  installPetToCodex: () => Promise.resolve({ ok: false, message: "非 Electron 环境" }),
  activatePetInCodex: () => Promise.resolve({ ok: false, message: "非 Electron 环境" }),
  uninstallPetFromCodex: () => Promise.resolve({ ok: false, message: "非 Electron 环境" }),
  getInstalledPets: () => Promise.resolve([]),
  getActivePetInCodex: () => Promise.resolve(null),
  openExternal: noopAsync,
};

const electronBridge = (window as unknown as { codress?: CodressBridge }).codress;

export const bridge: CodressBridge = electronBridge
  ? new Proxy(electronBridge, {
      get(target, prop, receiver) {
        if (prop in target) return Reflect.get(target, prop, receiver);
        // 旧 preload 缺失新方法时，fallback 到本地实现
        if (prop in fallbackBridge) return (fallbackBridge as Record<string, unknown>)[prop as string];
        return undefined;
      },
    })
  : fallbackBridge;
