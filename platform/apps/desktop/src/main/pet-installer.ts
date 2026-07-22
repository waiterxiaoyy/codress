import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import https from "node:https";
import http from "node:http";
import type { ApiClient } from "./core/api";

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
  slug: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    // 调用后端 download API，获取 spritesheet URL 和 manifest
    const detail = await api.downloadPet(slug);
    if (!detail.url) {
      return { ok: false, message: "该宠物没有 spritesheet，无法安装到 Codex" };
    }

    const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
    const petDir = path.join(codexHome, "pets", slug);
    fs.mkdirSync(petDir, { recursive: true });

    // 下载 spritesheet.webp
    const spritesheetPath = path.join(petDir, "spritesheet.webp");
    await downloadFile(detail.url, spritesheetPath);

    // 构建 pet.json (Codex v2 格式)
    const manifest = detail.manifest?.manifest || {
      id: slug,
      displayName: detail.manifest?.name || slug,
      description: detail.manifest?.description || "",
      spritesheetPath: "spritesheet.webp",
    };
    const petJson = {
      id: (manifest as Record<string, unknown>).id || slug,
      displayName: (manifest as Record<string, unknown>).displayName || detail.manifest?.name || slug,
      description: (manifest as Record<string, unknown>).description || detail.manifest?.description || "",
      spriteVersionNumber: 2,
      spritesheetPath: "spritesheet.webp",
    };

    const petJsonPath = path.join(petDir, "pet.json");
    fs.writeFileSync(petJsonPath, JSON.stringify(petJson, null, 2), "utf-8");

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

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const client = url.startsWith("https") ? https : http;
    client
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            fs.unlinkSync(dest);
            downloadFile(redirectUrl, dest).then(resolve).catch(reject);
            return;
          }
        }
        if (response.statusCode !== 200) {
          file.close();
          reject(new Error(`下载失败: HTTP ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}
