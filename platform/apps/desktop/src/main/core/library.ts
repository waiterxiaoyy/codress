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

const WORKBUDDY_DEFAULT_COLORS: Record<string, string> = {
  background: "#0b0b0d",
  panel: "#141417",
  panelAlt: "#1d1d21",
  accent: "#8a8f98",
  accentAlt: "#b0b4bc",
  secondary: "#7d8590",
  highlight: "#a3a8b0",
  text: "#f0f1f3",
  muted: "#9aa0a8",
  line: "rgba(138, 143, 152, .30)",
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

  /** 商店 manifest → codex 运行时 theme.json v1 */
  private codexTheme(manifest: SkinManifest, imageFile: string) {
    return {
      schemaVersion: 1,
      id: manifest.slug,
      name: manifest.name,
      brandSubtitle: "CODRESS",
      tagline: manifest.description ?? "",
      statusText: "CODRESS ONLINE",
      quote: "MAKE SOMETHING WONDERFUL",
      image: imageFile,
      appearance: manifest.appearance ?? "auto",
      ...(manifest.art ? { art: manifest.art } : {}),
      ...(manifest.colors ? { colors: manifest.colors } : {}),
    };
  }

  /** 商店 manifest → workbuddy catalog.json(单主题;auto 外观按暗色处理) */
  private workbuddyCatalog(manifest: SkinManifest, imageFile: string) {
    const appearance = manifest.appearance === "light" ? "light" : "dark";
    const colors = { ...WORKBUDDY_DEFAULT_COLORS, ...(manifest.colors ?? {}) };
    return {
      schemaVersion: 1,
      defaultThemeId: manifest.slug,
      themes: [
        {
          id: manifest.slug,
          name: manifest.name,
          emoji: "✦",
          description: manifest.description ?? "Codress 皮肤",
          appearance,
          effects: "stars",
          brandSubtitle: "CODRESS",
          tagline: manifest.description ?? "Make work feel lighter.",
          statusText: "CODRESS ONLINE",
          quote: "MAKE SOMETHING WONDERFUL",
          image: imageFile,
          colors,
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
