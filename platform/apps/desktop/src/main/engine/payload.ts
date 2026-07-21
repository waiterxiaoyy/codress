import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AdapterDefinition } from "../adapters";

export const SKIN_VERSION = "1.0.0-codress";
export const MAX_ART_BYTES = 16 * 1024 * 1024;

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export interface RuntimeAssets {
  css: string;
  template: string;
}

export async function loadRuntimeAssets(runtimeDir: string, extraCss = ""): Promise<RuntimeAssets> {
  const [css, template] = await Promise.all([
    fs.readFile(path.join(runtimeDir, "dream-skin.css"), "utf8"),
    fs.readFile(path.join(runtimeDir, "renderer-inject.js"), "utf8"),
  ]);
  // 远程适配器 CSS 追加在基础皮肤之后,可热修复目标应用更新导致的选择器失配。
  return { css: extraCss ? `${css}\n/* codress adapter override */\n${extraCss}` : css, template };
}

async function readArtDataUrl(imagePath: string): Promise<{ dataUrl: string; bytes: number }> {
  const extension = path.extname(imagePath).toLowerCase();
  const mime = IMAGE_MIME[extension];
  if (!mime) throw new Error(`unsupported theme image format: ${extension || "missing"}`);
  const stat = await fs.stat(imagePath);
  if (!stat.isFile() || stat.size < 1 || stat.size > MAX_ART_BYTES) {
    throw new Error(`theme image must be a non-empty file no larger than ${MAX_ART_BYTES} bytes`);
  }
  const art = await fs.readFile(imagePath);
  return { dataUrl: `data:${mime};base64,${art.toString("base64")}`, bytes: art.length };
}

function assertInsideDir(dir: string, candidate: string, label: string) {
  const relative = path.relative(dir, candidate);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside its theme directory`);
  }
}

export interface BuiltPayload {
  payload: string;
  revision: string;
  themeId: string;
  themeName: string;
}

function replaceholders(
  template: string,
  replacements: Array<[string | undefined, string]>
): string {
  let out = template;
  for (const [token, value] of replacements) {
    if (token && out.includes(token)) out = out.split(token).join(value);
  }
  return out;
}

/** Codex 模式:theme.json(schema v1)+ 单张背景图 → 自包含注入表达式。 */
export async function buildThemePayload(
  adapter: AdapterDefinition,
  assets: RuntimeAssets,
  themeDir: string
): Promise<BuiltPayload> {
  const configPath = path.join(themeDir, "theme.json");
  const raw = JSON.parse(await fs.readFile(configPath, "utf8"));
  if (raw?.schemaVersion !== 1 || typeof raw.image !== "string" || !raw.image) {
    throw new Error(`${configPath} has an unsupported schema or image field`);
  }
  if (path.basename(raw.image) !== raw.image) {
    throw new Error("theme image must stay inside its theme directory");
  }
  const imagePath = path.join(themeDir, raw.image);
  assertInsideDir(themeDir, imagePath, "theme image");
  const art = await readArtDataUrl(imagePath);

  const styleRevision = createHash("sha256").update(assets.css).digest("hex").slice(0, 20);
  const revision = createHash("sha256")
    .update(SKIN_VERSION)
    .update(assets.css)
    .update(assets.template)
    .update(JSON.stringify(raw))
    .update(art.dataUrl.slice(-64))
    .digest("hex")
    .slice(0, 20);

  const payload = replaceholders(assets.template, [
    [adapter.placeholders.css, JSON.stringify(assets.css)],
    [adapter.placeholders.art, JSON.stringify(art.dataUrl)],
    [adapter.placeholders.theme, JSON.stringify(raw)],
    [adapter.placeholders.version, JSON.stringify(SKIN_VERSION)],
    [adapter.placeholders.styleRevision, JSON.stringify(styleRevision)],
    [adapter.placeholders.payloadRevision, JSON.stringify(revision)],
  ]);
  return { payload, revision, themeId: String(raw.id ?? "custom"), themeName: String(raw.name ?? "Codress") };
}

/** WorkBuddy 模式:catalog.json + 若干图片 → 目录式注入(页面内可切换)。 */
export async function buildCatalogPayload(
  adapter: AdapterDefinition,
  assets: RuntimeAssets,
  catalogDir: string
): Promise<BuiltPayload> {
  const catalogPath = path.join(catalogDir, "catalog.json");
  const rawCatalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  if (rawCatalog?.schemaVersion !== 1 || !Array.isArray(rawCatalog.themes) || !rawCatalog.themes.length) {
    throw new Error(`${catalogPath} has an unsupported schema or empty theme list`);
  }
  const themes: Record<string, unknown>[] = [];
  for (const rawTheme of rawCatalog.themes) {
    if (typeof rawTheme?.image !== "string" || path.basename(rawTheme.image) !== rawTheme.image) {
      throw new Error("catalog theme image must be a bare filename");
    }
    const imagePath = path.join(catalogDir, rawTheme.image);
    assertInsideDir(catalogDir, imagePath, "catalog image");
    const art = await readArtDataUrl(imagePath);
    themes.push({ ...rawTheme, artDataUrl: art.dataUrl });
  }
  const ids = new Set(themes.map((t) => t.id));
  const catalog = {
    schemaVersion: 1,
    defaultThemeId: ids.has(rawCatalog.defaultThemeId) ? rawCatalog.defaultThemeId : themes[0].id,
    themes,
  };
  const revision = createHash("sha256")
    .update(SKIN_VERSION)
    .update(assets.css)
    .update(JSON.stringify(rawCatalog))
    .digest("hex")
    .slice(0, 20);
  const payload = replaceholders(assets.template, [
    [adapter.placeholders.css, JSON.stringify(assets.css)],
    [adapter.placeholders.catalog, JSON.stringify(catalog)],
    [adapter.placeholders.version, JSON.stringify(SKIN_VERSION)],
  ]);
  return {
    payload,
    revision,
    themeId: String(catalog.defaultThemeId),
    themeName: String((themes[0] as { name?: string }).name ?? "Codress"),
  };
}

/**
 * 早注入脚本:注册到 Page.addScriptToEvaluateOnNewDocument,
 * 页面刷新/导航时等 shell DOM 一出现立即上妆,避免闪一下原生样式。
 */
export function earlyPayloadFor(
  payload: string,
  revision: string,
  adapter: AdapterDefinition
): string {
  const markerSelectors = Object.values(adapter.probeMarkers.required);
  const generationKey = `__CODRESS_EARLY_${adapter.id.toUpperCase()}__`;
  return `(() => {
    const generationKey = ${JSON.stringify(generationKey)};
    const generation = ${JSON.stringify(revision)};
    window[generationKey] = generation;
    let observer = null;
    let timeout = null;
    const stop = () => {
      observer?.disconnect();
      observer = null;
      if (timeout) clearTimeout(timeout);
      timeout = null;
    };
    const ready = () => ${JSON.stringify(markerSelectors)}.every((s) => document.querySelector(s));
    const install = () => {
      if (window[generationKey] !== generation) { stop(); return true; }
      if (!document.documentElement || !ready()) return false;
      stop();
      ${payload};
      return true;
    };
    if (install()) return;
    if (typeof MutationObserver === "function" && document.documentElement) {
      observer = new MutationObserver(install);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    timeout = setTimeout(stop, 15000);
  })()`;
}

/** 移除注入(优先调用运行时自带 cleanup,失败则手动摘干净)。 */
export function removeExpression(adapter: AdapterDefinition): string {
  const k = adapter.runtimeKeys;
  return `(() => {
    window[${JSON.stringify(k.disabledKey)}] = true;
    const state = window[${JSON.stringify(k.stateKey)}];
    if (state?.cleanup) { try { return state.cleanup(); } catch {} }
    document.documentElement?.classList.remove(${JSON.stringify(k.scopeClass)});
    document.getElementById(${JSON.stringify(k.styleId)})?.remove();
    document.getElementById(${JSON.stringify(k.chromeId)})?.remove();
    delete window[${JSON.stringify(k.stateKey)}];
    return true;
  })()`;
}
