import { promises as fs } from "node:fs";
import path from "node:path";
import type { SkinManifest } from "./api";

export interface InstalledSkin {
  slug: string;
  name: string;
  target: string;
  dir: string;
  imageFile: string;
}

// WorkBuddy 完整默认配色（对齐 skill 的 stellar-office 默认主题）
const WORKBUDDY_DEFAULT_COLORS: Record<string, string> = {
  background: "#070a16",
  panel: "#0e1530",
  panelAlt: "#182248",
  surface: "rgba(14, 21, 48, .92)",
  surfaceAlt: "rgba(24, 34, 72, .88)",
  sidebar: "rgba(7, 10, 22, .95)",
  control: "rgba(10, 15, 34, .95)",
  accent: "#8b7cff",
  accentAlt: "#d478ff",
  secondary: "#44d8ff",
  highlight: "#ff6bb5",
  text: "#f3f5ff",
  muted: "#adb5d4",
  sidebarText: "#f3f5ff",
  sidebarMuted: "#919bc3",
  heroText: "#ffffff",
  heroMuted: "#b9c2e1",
  veil: "rgba(4, 7, 18, .86)",
  veilSoft: "rgba(13, 15, 37, .42)",
  line: "rgba(139, 124, 255, .30)",
};

function imageFileNameFromUrl(url: string): string {
  const clean = url.split("?")[0];
  const ext = path.extname(clean).toLowerCase() || ".jpg";
  return `background${ext}`;
}

/**
 * 本地皮肤库:library/<target>/<slug>/ 下落一份注入运行时能直接消费的主题目录。
 * - codex  → theme.json(Dream Skin schema v1)+ 背景图
 * - workbuddy → catalog.json(单主题目录)+ 背景图
 */
export class SkinLibrary {
  constructor(private readonly rootDir: string) {}

  themeDirFor(target: string, slug: string): string {
    return path.join(this.rootDir, target, slug);
  }

  petsDir(): string {
    return path.join(this.rootDir, "pets");
  }

  async listInstalled(target: string): Promise<InstalledSkin[]> {
    const dir = path.join(this.rootDir, target);
    let entries: string[] = [];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return [];
    }
    const installed: InstalledSkin[] = [];
    for (const slug of entries) {
      const themeDir = path.join(dir, slug);
      try {
        const metaFile = target === "workbuddy" ? "catalog.json" : "theme.json";
        const raw = JSON.parse(await fs.readFile(path.join(themeDir, metaFile), "utf8"));
        const name =
          target === "workbuddy" ? raw.themes?.[0]?.name ?? slug : raw.name ?? slug;
        const imageFile =
          target === "workbuddy" ? raw.themes?.[0]?.image ?? "" : raw.image ?? "";
        installed.push({ slug, name, target, dir: themeDir, imageFile });
      } catch {
        /* 跳过损坏目录 */
      }
    }
    return installed;
  }

  /** 商店 manifest → codex 运行时 theme.json v1（完整对齐 skill 规则） */
  private codexTheme(manifest: SkinManifest, imageFile: string) {
    const art = manifest.art ?? {};
    // safeArea 自动推断：没指定时默认 left
    const safeArea = art.safeArea && art.safeArea !== "auto" ? art.safeArea : "left";
    // taskMode 自动推断：没指定时默认 ambient
    const taskMode = art.taskMode && art.taskMode !== "auto" ? art.taskMode : "ambient";

    const theme: Record<string, unknown> = {
      schemaVersion: 1,
      id: manifest.slug,
      name: manifest.name,
      brandSubtitle: manifest.brandSubtitle || "CODRESS",
      tagline: manifest.tagline || manifest.description || "把喜欢的画面变成可交互的 Codex 工作台。",
      projectPrefix: manifest.projectPrefix || "选择项目 · ",
      projectLabel: manifest.projectLabel || "◉  选择项目",
      statusText: manifest.statusText || "CODRESS ONLINE",
      quote: manifest.quote || "MAKE SOMETHING WONDERFUL",
      image: imageFile,
      appearance: manifest.appearance ?? "auto",
      art: {
        safeArea,
        taskMode,
        ...(art.focusX != null ? { focusX: art.focusX } : {}),
        ...(art.focusY != null ? { focusY: art.focusY } : {}),
      },
    };

    if (manifest.colors && Object.keys(manifest.colors).length > 0) {
      theme.colors = manifest.colors;
    }

    return theme;
  }

  /** 商店 manifest → workbuddy catalog.json（单主题，完整对齐 skill 规则） */
  private workbuddyCatalog(manifest: SkinManifest, imageFile: string) {
    // skill 里 appearance 支持 light/dark，auto 默认按 dark 处理
    const appearance = manifest.appearance === "light" ? "light" : "dark";
    // 完整合并颜色（manifest.colors 优先覆盖默认值）
    const colors = { ...WORKBUDDY_DEFAULT_COLORS, ...(manifest.colors ?? {}) };
    const art = manifest.art ?? {};

    return {
      schemaVersion: 1,
      defaultThemeId: manifest.slug,
      themes: [
        {
          id: manifest.slug,
          name: manifest.name,
          emoji: "✦",
          description: manifest.tagline || manifest.description || "Codress 皮肤",
          appearance,
          effects: "stars",
          tagline: manifest.tagline || manifest.description || "Make work feel lighter.",
          statusText: manifest.statusText || "CODRESS ONLINE",
          quote: manifest.quote || "MAKE WORK FEEL LIGHTER",
          image: imageFile,
          colors,
          // art 字段透传（WorkBuddy inject 可选用）
          ...(Object.keys(art).length > 0 ? {
            art: {
              safeArea: art.safeArea && art.safeArea !== "auto" ? art.safeArea : "left",
              taskMode: art.taskMode && art.taskMode !== "auto" ? art.taskMode : "ambient",
              ...(art.focusX != null ? { focusX: art.focusX } : {}),
              ...(art.focusY != null ? { focusY: art.focusY } : {}),
            },
          } : {}),
        },
      ],
    };
  }

  /** 落盘一套皮肤(背景图已由调用方下载到 imageSourcePath)。 */
  async install(
    target: string,
    manifest: SkinManifest,
    imageSourcePath: string
  ): Promise<InstalledSkin> {
    const dir = this.themeDirFor(target, manifest.slug);
    await fs.mkdir(dir, { recursive: true });
    const imageFile = `background${path.extname(imageSourcePath).toLowerCase() || ".jpg"}`;
    await fs.copyFile(imageSourcePath, path.join(dir, imageFile));
    if (target === "workbuddy") {
      await fs.writeFile(
        path.join(dir, "catalog.json"),
        JSON.stringify(this.workbuddyCatalog(manifest, imageFile), null, 2)
      );
    } else {
      await fs.writeFile(
        path.join(dir, "theme.json"),
        JSON.stringify(this.codexTheme(manifest, imageFile), null, 2)
      );
    }
    return { slug: manifest.slug, name: manifest.name, target, dir, imageFile };
  }

  /** 任意本地图片 → 一套皮肤(自适应配色交给注入运行时)。 */
  async importImage(target: string, imagePath: string, name: string): Promise<InstalledSkin> {
    const slug = `local-${Date.now().toString(36)}`;
    const manifest: SkinManifest = {
      slug,
      name: name || path.basename(imagePath, path.extname(imagePath)),
      targets: [target],
      appearance: "auto",
      backgroundUrl: "",
    };
    return this.install(target, manifest, imagePath);
  }

  imageDownloadPath(target: string, slug: string, url: string): string {
    return path.join(this.themeDirFor(target, slug), imageFileNameFromUrl(url));
  }
}
