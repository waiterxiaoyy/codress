import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import type { ApiClient, PetManifest } from "./api";

interface PetAssetDescriptor {
  url: string;
  hash?: string;
  sizeBytes?: number;
  manifest: PetManifest;
}

interface PetAssetMetadata {
  version: string;
  fileName: string;
  hash: string;
  sizeBytes: number;
  manifest: PetManifest;
  checkedAt: number;
}

export interface CachedPetAsset {
  imagePath: string;
  hash: string;
  manifest: PetManifest;
}

const pendingAssets = new Map<string, Promise<CachedPetAsset>>();

function safeExtension(url: string, spriteSheet: boolean): string {
  const extension = path.extname(url.split("?")[0]).toLowerCase();
  if ([".webp", ".png", ".gif", ".jpg", ".jpeg"].includes(extension)) return extension;
  return spriteSheet ? ".webp" : ".png";
}

async function fileExists(file: string): Promise<boolean> {
  try {
    return (await fs.stat(file)).size > 0;
  } catch {
    return false;
  }
}

async function hashFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const input = createReadStream(file);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("error", reject);
    input.on("end", resolve);
  });
  return hash.digest("hex");
}

async function readMetadata(file: string): Promise<PetAssetMetadata | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as PetAssetMetadata;
  } catch {
    return null;
  }
}

async function writeMetadata(file: string, metadata: PetAssetMetadata): Promise<void> {
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, JSON.stringify(metadata, null, 2), "utf8");
  await fs.rm(file, { force: true });
  await fs.rename(temporary, file);
}

async function readCachedAsset(cacheRoot: string, slug: string, maxAge: number): Promise<CachedPetAsset | null> {
  const assetDir = path.join(cacheRoot, slug);
  const metadata = await readMetadata(path.join(assetDir, "asset.json"));
  if (!metadata || Date.now() - (metadata.checkedAt || 0) > maxAge) return null;
  const imagePath = path.join(assetDir, metadata.fileName);
  if (!await fileExists(imagePath)) return null;
  return { imagePath, hash: metadata.hash, manifest: metadata.manifest };
}

async function ensureDescriptorAsset(
  api: ApiClient,
  cacheRoot: string,
  slug: string,
  descriptor: PetAssetDescriptor,
): Promise<CachedPetAsset> {
  if (!descriptor.url) throw new Error("该宠物没有可用的图片资源");
  const version = descriptor.hash || descriptor.url;
  const cacheKey = `${cacheRoot}:${slug}:${version}`;
  const existing = pendingAssets.get(cacheKey);
  if (existing) return existing;

  const operation = (async () => {
    const assetDir = path.join(cacheRoot, slug);
    const metadataPath = path.join(assetDir, "asset.json");
    const spriteSheet = Boolean(descriptor.manifest.spriteSheet);
    const extension = safeExtension(descriptor.url, spriteSheet);
    const fileName = `asset${extension}`;
    const assetPath = path.join(assetDir, fileName);
    await fs.mkdir(assetDir, { recursive: true });

    const metadata = await readMetadata(metadataPath);
    if (metadata?.version === version && await fileExists(path.join(assetDir, metadata.fileName))) {
      await writeMetadata(metadataPath, { ...metadata, manifest: descriptor.manifest, checkedAt: Date.now() });
      return {
        imagePath: path.join(assetDir, metadata.fileName),
        hash: metadata.hash,
        manifest: descriptor.manifest,
      };
    }

    // 兼容旧版本保存的 library/pets/<slug>.<ext>，hash 一致时直接迁移，不再下载。
    const legacyPath = path.join(cacheRoot, `${slug}${extension}`);
    if (await fileExists(legacyPath)) {
      const legacyHash = descriptor.hash ? await hashFile(legacyPath) : "";
      const legacySize = (await fs.stat(legacyPath)).size;
      const matches = descriptor.hash
        ? legacyHash === descriptor.hash
        : !descriptor.sizeBytes || legacySize === descriptor.sizeBytes;
      if (matches) {
        await fs.rm(assetPath, { force: true });
        await fs.rename(legacyPath, assetPath);
        const nextMetadata: PetAssetMetadata = {
          version,
          fileName,
          hash: descriptor.hash || legacyHash,
          sizeBytes: legacySize,
          manifest: descriptor.manifest,
          checkedAt: Date.now(),
        };
        await writeMetadata(metadataPath, nextMetadata);
        return { imagePath: assetPath, hash: nextMetadata.hash, manifest: descriptor.manifest };
      }
    }

    const temporaryPath = path.join(assetDir, `${fileName}.download-${process.pid}-${Date.now()}`);
    try {
      await api.downloadFile(descriptor.url, temporaryPath);
      const stat = await fs.stat(temporaryPath);
      if (stat.size <= 0) throw new Error("宠物资源下载为空");
      const downloadedHash = descriptor.hash ? await hashFile(temporaryPath) : "";
      if (descriptor.hash && downloadedHash !== descriptor.hash) {
        throw new Error("宠物资源校验失败，请重新下载");
      }
      await fs.rm(assetPath, { force: true });
      await fs.rename(temporaryPath, assetPath);
      if (metadata?.fileName && metadata.fileName !== fileName) {
        await fs.rm(path.join(assetDir, metadata.fileName), { force: true });
      }
      const nextMetadata: PetAssetMetadata = {
        version,
        fileName,
        hash: descriptor.hash || downloadedHash,
        sizeBytes: stat.size,
        manifest: descriptor.manifest,
        checkedAt: Date.now(),
      };
      await writeMetadata(metadataPath, nextMetadata);
      return { imagePath: assetPath, hash: nextMetadata.hash, manifest: descriptor.manifest };
    } catch (error) {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  })();

  pendingAssets.set(cacheKey, operation);
  try {
    return await operation;
  } finally {
    pendingAssets.delete(cacheKey);
  }
}

/**
 * 获取宠物资源并落入共享缓存。安装会经过 download endpoint 记录一次下载，
 * 上桌只读取公开详情，避免每次切换都增加下载量。
 */
export async function ensurePetAsset(
  api: ApiClient,
  cacheRoot: string,
  slug: string,
  recordDownload: boolean,
): Promise<CachedPetAsset> {
  if (!recordDownload) {
    const cached = await readCachedAsset(cacheRoot, slug, 5 * 60 * 1000);
    if (cached) return cached;
  }
  if (recordDownload) {
    const detail = await api.downloadPet(slug);
    return ensureDescriptorAsset(api, cacheRoot, slug, detail);
  }
  const manifest = await api.getPet(slug);
  return ensureDescriptorAsset(api, cacheRoot, slug, {
    url: manifest.spriteSheet || manifest.imageUrl,
    hash: manifest.hash,
    sizeBytes: manifest.sizeBytes,
    manifest,
  });
}
