import { contextBridge, ipcRenderer } from "electron";

const api = {
  onStatusChanged(listener: () => void) {
    const wrapped = () => listener();
    ipcRenderer.on("codress:status-changed", wrapped);
    return () => ipcRenderer.removeListener("codress:status-changed", wrapped);
  },
  onLibraryChanged(listener: () => void) {
    const wrapped = () => listener();
    ipcRenderer.on("codress:library-changed", wrapped);
    return () => ipcRenderer.removeListener("codress:library-changed", wrapped);
  },
  onPreviewResult(listener: (result: { ok: boolean; message: string }) => void) {
    const wrapped = (_event: Electron.IpcRendererEvent, result: { ok: boolean; message: string }) => listener(result);
    ipcRenderer.on("codress:preview-result", wrapped);
    return () => ipcRenderer.removeListener("codress:preview-result", wrapped);
  },
  appStatus: () => ipcRenderer.invoke("app:status"),
  clientInfo: () => ipcRenderer.invoke("app:info"),
  latestClient: () => ipcRenderer.invoke("app:update:latest"),
  getUpdateState: () => ipcRenderer.invoke("app:update:state"),
  checkForUpdates: () => ipcRenderer.invoke("app:update:check"),
  installUpdate: () => ipcRenderer.invoke("app:update:install"),
  onUpdateState(listener: (state: unknown) => void) {
    const wrapped = (_event: Electron.IpcRendererEvent, state: unknown) => listener(state);
    ipcRenderer.on("codress:update-state", wrapped);
    return () => ipcRenderer.removeListener("codress:update-state", wrapped);
  },
  pickAppPath: (appId: string, currentPath?: string) => ipcRenderer.invoke("app:path:pick", appId, currentPath),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  patchSettings: (patch: Record<string, unknown>) => ipcRenderer.invoke("settings:patch", patch),
  getCreatorConfig: () => ipcRenderer.invoke("creator:config:get"),
  saveCreatorConfig: (input: Record<string, unknown>) => ipcRenderer.invoke("creator:config:save", input),
  testCreatorConfig: () => ipcRenderer.invoke("creator:config:test"),
  creatorModels: () => ipcRenderer.invoke("creator:config:models"),
  discoverCreatorProviders: () => ipcRenderer.invoke("creator:providers:discover"),
  importCreatorProvider: (id: string) => ipcRenderer.invoke("creator:providers:import", id),
  creatorDrafts: () => ipcRenderer.invoke("creator:drafts:list"),
  saveCreatorDraft: (input: Record<string, unknown>) => ipcRenderer.invoke("creator:drafts:save", input),
  deleteCreatorDraft: (id: string) => ipcRenderer.invoke("creator:drafts:delete", id),

  authProviders: () => ipcRenderer.invoke("auth:providers"),
  loginOAuth: (provider: string) => ipcRenderer.invoke("auth:oauth", provider),
  loginDev: (name: string) => ipcRenderer.invoke("auth:dev", name),
  logout: () => ipcRenderer.invoke("auth:logout"),
  me: () => ipcRenderer.invoke("auth:me"),
  myEvents: () => ipcRenderer.invoke("auth:events"),

  storeSkins: (params: Record<string, unknown>) => ipcRenderer.invoke("store:skins", params),
  storePets: (params: Record<string, unknown>) => ipcRenderer.invoke("store:pets", params),
  storeCategories: (type: string) => ipcRenderer.invoke("store:categories", type),
  favorites: () => ipcRenderer.invoke("store:favorites"),
  toggleFavorite: (itemType: string, itemSlug: string) =>
    ipcRenderer.invoke("store:toggleFavorite", itemType, itemSlug),

  libraryList: (target: string) => ipcRenderer.invoke("library:list", target),

  applySkin: (target: string, slug: string, allowRestart = false) =>
    ipcRenderer.invoke("skin:apply", target, slug, allowRestart),
  pauseSkin: (target: string) => ipcRenderer.invoke("skin:pause", target),
  resumeSkin: (target: string) => ipcRenderer.invoke("skin:resume", target),
  restoreSkin: (target: string) => ipcRenderer.invoke("skin:restore", target),
  importImage: (target: string) => ipcRenderer.invoke("skin:importImage", target),
  pickSkinImage: () => ipcRenderer.invoke("skin:pickImage"),
  createLocalSkin: (target: string, input: Record<string, unknown>) =>
    ipcRenderer.invoke("skin:createLocal", target, input),

  setPet: (slug: string | null) => ipcRenderer.invoke("pet:set", slug),
  installPetToCodex: (slug: string) => ipcRenderer.invoke("pet:install", slug),
  activatePetInCodex: (slug: string) => ipcRenderer.invoke("pet:activate", slug),
  uninstallPetFromCodex: (slug: string) => ipcRenderer.invoke("pet:uninstall", slug),
  getInstalledPets: () => ipcRenderer.invoke("pet:installed"),
  getActivePetInCodex: () => ipcRenderer.invoke("pet:active"),
  openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url),
};

export type CodressBridge = typeof api;
contextBridge.exposeInMainWorld("codress", api);
