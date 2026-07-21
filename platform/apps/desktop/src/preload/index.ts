import { contextBridge, ipcRenderer } from "electron";

const api = {
  onStatusChanged(listener: () => void) {
    const wrapped = () => listener();
    ipcRenderer.on("codress:status-changed", wrapped);
    return () => ipcRenderer.removeListener("codress:status-changed", wrapped);
  },
  appStatus: () => ipcRenderer.invoke("app:status"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  patchSettings: (patch: Record<string, unknown>) => ipcRenderer.invoke("settings:patch", patch),

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
