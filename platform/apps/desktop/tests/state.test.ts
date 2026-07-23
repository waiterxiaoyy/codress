import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsStore } from "../src/main/core/state";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("SettingsStore production endpoint", () => {
  it("ignores persisted and renderer-provided API endpoint overrides", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "codress-settings-"));
    tempDirs.push(dir);
    await writeFile(path.join(dir, "settings.json"), JSON.stringify({
      apiBase: "https://example.invalid",
      appPaths: {},
    }));

    const store = new SettingsStore(dir);
    expect((await store.load()).apiBase).toBe("https://codress.dev");
    expect((await store.patch({ apiBase: "https://other.invalid" })).apiBase).toBe("https://codress.dev");
  });
});
