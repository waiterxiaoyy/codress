import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ApiClient, PetManifest } from "../src/main/core/api";
import { inspectSpriteSheet, installPetToCodex, uninstallPet } from "../src/main/pet-installer";

const temporaryDirectories: string[] = [];
const originalCodexHome = process.env.CODEX_HOME;

afterEach(async () => {
  if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = originalCodexHome;
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

function pngHeader(width: number, height: number): Buffer {
  const data = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(data);
  data.write("IHDR", 12, "ascii");
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  return data;
}

function webpVp8xHeader(width: number, height: number): Buffer {
  const data = Buffer.alloc(30);
  data.write("RIFF", 0, "ascii");
  data.writeUInt32LE(22, 4);
  data.write("WEBP", 8, "ascii");
  data.write("VP8X", 12, "ascii");
  data.writeUInt32LE(10, 16);
  data.writeUIntLE(width - 1, 24, 3);
  data.writeUIntLE(height - 1, 27, 3);
  return data;
}

function webpVp8lHeader(width: number, height: number): Buffer {
  const data = Buffer.alloc(25);
  data.write("RIFF", 0, "ascii");
  data.writeUInt32LE(17, 4);
  data.write("WEBP", 8, "ascii");
  data.write("VP8L", 12, "ascii");
  data.writeUInt32LE(5, 16);
  data[20] = 0x2f;
  data.writeUInt32LE((width - 1) + (height - 1) * (2 ** 14), 21);
  return data;
}

describe("inspectSpriteSheet", () => {
  it("recognizes a Codex v1 PNG atlas", () => {
    expect(inspectSpriteSheet(pngHeader(1536, 1872))).toEqual({
      format: "png",
      width: 1536,
      height: 1872,
      spriteVersionNumber: 1,
    });
  });

  it("recognizes a Codex v2 WebP atlas", () => {
    expect(inspectSpriteSheet(webpVp8xHeader(1536, 2288))).toEqual({
      format: "webp",
      width: 1536,
      height: 2288,
      spriteVersionNumber: 2,
    });
  });

  it("recognizes the lossless WebP encoding used by existing v1 pets", () => {
    expect(inspectSpriteSheet(webpVp8lHeader(1536, 1872))).toMatchObject({
      format: "webp",
      spriteVersionNumber: 1,
    });
  });

  it("rejects unsupported dimensions", () => {
    expect(() => inspectSpriteSheet(pngHeader(1536, 2000))).toThrow(
      "Codex v1 需要 1536×1872，v2 需要 1536×2288",
    );
  });

  it("rejects empty or malformed files", () => {
    expect(() => inspectSpriteSheet(Buffer.alloc(0))).toThrow("有效的 PNG 或 WebP");
  });

  it("installs a v1 atlas with matching metadata and resets selection on uninstall", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "codress-pet-install-"));
    const cacheRoot = path.join(root, "cache");
    const codexHome = path.join(root, "codex-home");
    temporaryDirectories.push(root);
    process.env.CODEX_HOME = codexHome;

    const bytes = webpVp8lHeader(1536, 1872);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const manifest: PetManifest = {
      slug: "legacy-pet",
      name: "Legacy Pet",
      targets: ["codex"],
      imageUrl: "https://example.test/preview.webp",
      spriteSheet: "https://example.test/spritesheet.webp",
      animation: "idle",
      hash,
      sizeBytes: bytes.length,
    };
    const api = {
      downloadPet: async () => ({
        url: manifest.spriteSheet!,
        hash,
        sizeBytes: bytes.length,
        manifest,
      }),
      downloadFile: async (_url: string, destination: string) => {
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, bytes);
      },
    } as unknown as ApiClient;

    await expect(installPetToCodex(api, cacheRoot, manifest.slug)).resolves.toEqual({ ok: true });
    const petJson = JSON.parse(await fs.readFile(path.join(codexHome, "pets", manifest.slug, "pet.json"), "utf8"));
    expect(petJson).toMatchObject({
      spriteVersionNumber: 1,
      spritesheetPath: "spritesheet.webp",
    });
    await expect(fs.readFile(path.join(codexHome, "config.toml"), "utf8")).resolves.toContain(
      'selected-avatar-id = "custom:legacy-pet"',
    );

    expect(uninstallPet(manifest.slug)).toEqual({ ok: true });
    const config = await fs.readFile(path.join(codexHome, "config.toml"), "utf8");
    expect(config).toContain('selected-avatar-id = "null-signal"');
    expect(config).not.toContain("custom:null-signal");
  });
});
