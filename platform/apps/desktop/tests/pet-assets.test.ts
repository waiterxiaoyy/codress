import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ApiClient, PetManifest } from "../src/main/core/api";
import { ensurePetAsset } from "../src/main/core/pet-assets";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("pet asset cache", () => {
  it("reuses one verified file for repeated desktop and install actions", async () => {
    const cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codress-pet-cache-"));
    temporaryDirectories.push(cacheRoot);
    const bytes = Buffer.from("shared-pet-asset");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const manifest: PetManifest = {
      slug: "snowball",
      name: "Snowball",
      targets: ["codex"],
      imageUrl: "https://example.test/preview.png",
      spriteSheet: "https://example.test/spritesheet.webp",
      animation: "idle",
      hash,
      sizeBytes: bytes.length,
    };
    let details = 0;
    let recordedDownloads = 0;
    let fileDownloads = 0;
    const api = {
      getPet: async () => { details += 1; return manifest; },
      downloadPet: async () => {
        recordedDownloads += 1;
        return { url: manifest.spriteSheet!, hash, sizeBytes: bytes.length, manifest };
      },
      downloadFile: async (_url: string, destination: string) => {
        fileDownloads += 1;
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, bytes);
      },
    } as unknown as ApiClient;

    const firstDesktop = await ensurePetAsset(api, cacheRoot, manifest.slug, false);
    const secondDesktop = await ensurePetAsset(api, cacheRoot, manifest.slug, false);
    const install = await ensurePetAsset(api, cacheRoot, manifest.slug, true);

    expect(await fs.readFile(firstDesktop.imagePath)).toEqual(bytes);
    expect(secondDesktop.imagePath).toBe(firstDesktop.imagePath);
    expect(install.imagePath).toBe(firstDesktop.imagePath);
    expect(details).toBe(1);
    expect(recordedDownloads).toBe(1);
    expect(fileDownloads).toBe(1);
  });
});
