export type ThemeMode = "auto" | "light" | "dark";

const THEME_KEY = "codress.theme.mode";
const THEME_EVENT = "codress:theme-changed";

export function getThemeMode(): ThemeMode {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === "light" || saved === "dark" ? saved : "auto";
}

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  return mode === "auto"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    : mode;
}

export function applyTheme(mode = getThemeMode()): void {
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

export function setThemeMode(mode: ThemeMode): void {
  localStorage.setItem(THEME_KEY, mode);
  applyTheme(mode);
  window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_EVENT, { detail: mode }));
}

export function watchTheme(listener?: (mode: ThemeMode) => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    if (getThemeMode() === "auto") applyTheme("auto");
  };
  const onThemeChange = (event: Event) => {
    const mode = (event as CustomEvent<ThemeMode>).detail ?? getThemeMode();
    listener?.(mode);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY) return;
    applyTheme(getThemeMode());
    listener?.(getThemeMode());
  };
  media.addEventListener("change", onSystemChange);
  window.addEventListener(THEME_EVENT, onThemeChange);
  window.addEventListener("storage", onStorage);
  return () => {
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener(THEME_EVENT, onThemeChange);
    window.removeEventListener("storage", onStorage);
  };
}
