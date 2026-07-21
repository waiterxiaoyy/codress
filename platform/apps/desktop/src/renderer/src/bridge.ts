export interface AdapterStatus {
  id: string;
  name: string;
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
  downloads?: number;
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
  openExternal(url: string): Promise<void>;
}

export const bridge: CodressBridge = (window as unknown as { codress: CodressBridge }).codress;
