import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SkinLibrary } from "../src/main/core/library";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("SkinLibrary local creator", () => {
  it("stores a generated image and its selected appearance and accent", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "codress-library-"));
    tempDirs.push(dir);
    const library = new SkinLibrary(dir);

    const installed = await library.importImageData(
      "codex",
      Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      {
        name: "My Local Theme",
        appearance: "dark",
        colors: {
          background: "#101112",
          panel: "#202122",
          text: "#f0f1f2",
          accent: "#445566",
        },
        customization: { zoom: 120, mask: 18 },
      },
    );

    const theme = JSON.parse(await readFile(path.join(installed.dir, "theme.json"), "utf8"));
    expect(theme).toMatchObject({
      id: installed.slug,
      name: "My Local Theme",
      image: "background.jpg",
      appearance: "dark",
      source: "local",
      colors: {
        background: "#101112",
        panel: "#202122",
        text: "#f0f1f2",
        accent: "#445566",
      },
      explicitColorKeys: expect.arrayContaining(["background", "panel", "text", "accent"]),
      customization: { zoom: 120, mask: 18 },
    });
    expect(await readFile(path.join(installed.dir, "background.jpg"))).toEqual(
      Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    );
  });
});
