import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ApiClient } from "./core/api";
import { ensurePetAsset } from "./core/pet-assets";

/**
 * 下载宠物的 spritesheet.webp 并写入 ~/.codex/pets/<slug>/pet.json，
 * 安装后用户在 Codex 中使用 /pet 命令即可激活。
 *
 * 符合 Codex hatch-pet skill 的 v2 格式:
 * ~/.codex/pets/<slug>/
 *   ├── pet.json          { id, displayName, description, spriteVersionNumber: 2, spritesheetPath }
 *   └── spritesheet.webp  8x11 atlas (1536x2288)
 */
export async function installPetToCodex(
  api: ApiClient,
  cacheRoot: string,
  slug: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const asset = await ensurePetAsset(api, cacheRoot, slug, true);
    if (!asset.manifest.spriteSheet) {
      return { ok: false, message: "该宠物没有 spritesheet，无法安装到 Codex" };
    }

    const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
    const petDir = path.join(codexHome, "pets", slug);
    fs.mkdirSync(petDir, { recursive: true });

    // 资源已经在共享缓存中，安装只需复制，不再二次下载。
    const spritesheetPath = path.join(petDir, "spritesheet.webp");
    const temporarySpritesheet = path.join(petDir, `.spritesheet-${process.pid}.tmp`);
    fs.copyFileSync(asset.imagePath, temporarySpritesheet);
    fs.rmSync(spritesheetPath, { force: true });
    fs.renameSync(temporarySpritesheet, spritesheetPath);

    // 构建 pet.json (Codex v2 格式)
    const manifest = asset.manifest.manifest || {
      id: slug,
      displayName: asset.manifest.name || slug,
      description: asset.manifest.description || "",
      spritesheetPath: "spritesheet.webp",
    };
    const petJson = {
      id: (manifest as Record<string, unknown>).id || slug,
      displayName: (manifest as Record<string, unknown>).displayName || asset.manifest.name || slug,
      description: (manifest as Record<string, unknown>).description || asset.manifest.description || "",
      spriteVersionNumber: 2,
      spritesheetPath: "spritesheet.webp",
    };

    const petJsonPath = path.join(petDir, "pet.json");
    fs.writeFileSync(petJsonPath, JSON.stringify(petJson, null, 2), "utf-8");
    fs.writeFileSync(path.join(petDir, ".codress-asset.json"), JSON.stringify({ hash: asset.hash }, null, 2), "utf-8");

    // 自动激活：修改 Codex config.toml 中的 selected-avatar-id
    activatePetInCodex(codexHome, slug);

    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

/**
 * 修改 ~/.codex/config.toml 中 [desktop] selected-avatar-id 为指定宠物
 * 这样 Codex 重启后自动使用该宠物
 */
function activatePetInCodex(codexHome: string, petId: string): void {
  const configPath = path.join(codexHome, "config.toml");
  const avatarId = `custom:${petId}`;
  try {
    let content = "";
    if (fs.existsSync(configPath)) {
      content = fs.readFileSync(configPath, "utf-8");
    }
    // 替换或插入 selected-avatar-id
    if (content.includes("selected-avatar-id")) {
      content = content.replace(
        /selected-avatar-id\s*=\s*"[^"]*"/,
        `selected-avatar-id = "${avatarId}"`,
      );
    } else if (content.includes("[desktop]")) {
      content = content.replace(
        "[desktop]",
        `[desktop]\nselected-avatar-id = "${avatarId}"`,
      );
    } else {
      content += `\n[desktop]\nselected-avatar-id = "${avatarId}"\n`;
    }
    fs.writeFileSync(configPath, content, "utf-8");
  } catch {
    // 非关键操作，失败不影响安装结果
  }
}

/**
 * 扫描 ~/.codex/pets/ 目录，返回已安装的宠物 slug 列表
 */
export function getInstalledPetSlugs(): string[] {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const petsDir = path.join(codexHome, "pets");
  try {
    const entries = fs.readdirSync(petsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .filter((e) => {
        // 必须有 pet.json 才算已安装
        const petJson = path.join(petsDir, e.name, "pet.json");
        return fs.existsSync(petJson);
      })
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * 激活指定宠物（修改 config.toml 中的 selected-avatar-id）
 */
export function activatePet(slug: string): { ok: boolean; message?: string } {
  try {
    const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
    activatePetInCodex(codexHome, slug);
    return { ok: true };
  } catch {
    return { ok: false, message: "激活失败" };
  }
}

/**
 * 卸载宠物（删除 ~/.codex/pets/<slug>/ 目录）
 */
export function uninstallPet(slug: string): { ok: boolean; message?: string } {
  try {
    const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
    const petDir = path.join(codexHome, "pets", slug);
    if (!fs.existsSync(petDir)) {
      return { ok: false, message: "宠物未安装" };
    }
    // 删除目录
    fs.rmSync(petDir, { recursive: true, force: true });
    // 如果当前激活的是这个宠物，清除选择
    const active = getActivePet();
    if (active === slug) {
      activatePetInCodex(codexHome, "null-signal");
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

/**
 * 获取当前 Codex 中激活的宠物 slug
 */
export function getActivePet(): string | null {
  try {
    const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
    const configPath = path.join(codexHome, "config.toml");
    if (!fs.existsSync(configPath)) return null;
    const content = fs.readFileSync(configPath, "utf-8");
    const match = content.match(/selected-avatar-id\s*=\s*"([^"]*)"/);
    if (!match) return null;
    const value = match[1];
    // 格式: "custom:<slug>" 或 "null-signal"(无选择) 或内置 id
    if (value === "null-signal") return null;
    if (value.startsWith("custom:")) return value.slice(7);
    return value;
  } catch {
    return null;
  }
}
