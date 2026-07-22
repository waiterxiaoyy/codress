import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ApiClient } from "./core/api";
import { ensurePetAsset } from "./core/pet-assets";

export interface SpriteSheetInfo {
  format: "png" | "webp";
  width: number;
  height: number;
  spriteVersionNumber: 1 | 2;
}

function pngDimensions(data: Buffer): { format: "png"; width: number; height: number } | null {
  if (
    data.length < 24
    || data[0] !== 0x89
    || data.subarray(1, 4).toString("ascii") !== "PNG"
    || data[4] !== 0x0d
    || data[5] !== 0x0a
    || data[6] !== 0x1a
    || data[7] !== 0x0a
    || data.subarray(12, 16).toString("ascii") !== "IHDR"
  ) {
    return null;
  }
  return {
    format: "png",
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

function webpDimensions(data: Buffer): { format: "webp"; width: number; height: number } | null {
  if (
    data.length < 20
    || data.subarray(0, 4).toString("ascii") !== "RIFF"
    || data.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    return null;
  }

  let offset = 12;
  while (offset + 8 <= data.length) {
    const chunkType = data.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = data.readUInt32LE(offset + 4);
    const chunkOffset = offset + 8;
    if (chunkOffset + chunkSize > data.length) return null;

    if (chunkType === "VP8X" && chunkSize >= 10) {
      return {
        format: "webp",
        width: data.readUIntLE(chunkOffset + 4, 3) + 1,
        height: data.readUIntLE(chunkOffset + 7, 3) + 1,
      };
    }
    if (chunkType === "VP8L" && chunkSize >= 5 && data[chunkOffset] === 0x2f) {
      const bits = data.readUInt32LE(chunkOffset + 1);
      const mask = 2 ** 14;
      return {
        format: "webp",
        width: bits % mask + 1,
        height: Math.floor(bits / mask) % mask + 1,
      };
    }
    if (
      chunkType === "VP8 "
      && chunkSize >= 10
      && data[chunkOffset + 3] === 0x9d
      && data[chunkOffset + 4] === 0x01
      && data[chunkOffset + 5] === 0x2a
    ) {
      return {
        format: "webp",
        width: data.readUInt16LE(chunkOffset + 6) & 0x3fff,
        height: data.readUInt16LE(chunkOffset + 8) & 0x3fff,
      };
    }

    offset = chunkOffset + chunkSize + (chunkSize % 2);
  }
  return null;
}

/** Match Codex's supported custom-pet atlas contracts instead of trusting remote metadata. */
export function inspectSpriteSheet(data: Buffer): SpriteSheetInfo {
  const dimensions = pngDimensions(data) ?? webpDimensions(data);
  if (!dimensions) {
    throw new Error("宠物图集必须是有效的 PNG 或 WebP 文件");
  }

  const spriteVersionNumber = dimensions.width === 1536 && dimensions.height === 1872
    ? 1
    : dimensions.width === 1536 && dimensions.height === 2288
      ? 2
      : null;
  if (!spriteVersionNumber) {
    throw new Error(
      `宠物图集尺寸 ${dimensions.width}×${dimensions.height} 不受支持；`
      + "Codex v1 需要 1536×1872，v2 需要 1536×2288",
    );
  }
  return { ...dimensions, spriteVersionNumber };
}

/**
 * 下载宠物的 spritesheet.webp 并写入 ~/.codex/pets/<slug>/pet.json，
 * 安装后用户在 Codex 中使用 /pet 命令即可激活。
 *
 * 兼容 Codex 自定义宠物 v1/v2 格式，版本由图集真实尺寸决定:
 * ~/.codex/pets/<slug>/
 *   ├── pet.json          { id, displayName, description, spriteVersionNumber, spritesheetPath }
 *   └── spritesheet.*     v1: 1536x1872; v2: 1536x2288
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
    const spriteSheet = inspectSpriteSheet(fs.readFileSync(asset.imagePath));

    const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
    const petDir = path.join(codexHome, "pets", slug);
    fs.mkdirSync(petDir, { recursive: true });

    // 资源已经在共享缓存中，安装只需复制，不再二次下载。
    const spritesheetFileName = `spritesheet.${spriteSheet.format}`;
    const spritesheetPath = path.join(petDir, spritesheetFileName);
    const temporarySpritesheet = path.join(petDir, `.spritesheet-${process.pid}.tmp`);
    fs.copyFileSync(asset.imagePath, temporarySpritesheet);
    fs.rmSync(spritesheetPath, { force: true });
    fs.renameSync(temporarySpritesheet, spritesheetPath);
    for (const staleFileName of ["spritesheet.png", "spritesheet.webp"]) {
      if (staleFileName !== spritesheetFileName) {
        fs.rmSync(path.join(petDir, staleFileName), { force: true });
      }
    }

    // 根据已校验的真实尺寸构建匹配的 Codex v1/v2 元数据。
    const manifest = asset.manifest.manifest || {
      id: slug,
      displayName: asset.manifest.name || slug,
      description: asset.manifest.description || "",
    };
    const petJson = {
      id: (manifest as Record<string, unknown>).id || slug,
      displayName: (manifest as Record<string, unknown>).displayName || asset.manifest.name || slug,
      description: (manifest as Record<string, unknown>).description || asset.manifest.description || "",
      spriteVersionNumber: spriteSheet.spriteVersionNumber,
      spritesheetPath: spritesheetFileName,
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
function activatePetInCodex(codexHome: string, petId: string | null): void {
  const configPath = path.join(codexHome, "config.toml");
  const avatarId = petId ? `custom:${petId}` : "null-signal";
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
      activatePetInCodex(codexHome, null);
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
