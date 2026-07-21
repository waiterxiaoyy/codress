import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCatalogPayload,
  buildThemePayload,
  earlyPayloadFor,
  removeExpression,
  type RuntimeAssets,
} from "../src/main/engine/payload";
import { verifyExpression } from "../src/main/engine/verify";
import { codexAdapter } from "../src/main/adapters/codex";
import { workbuddyAdapter } from "../src/main/adapters/workbuddy";

// 1x1 透明 PNG
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const codexAssets: RuntimeAssets = {
  css: ".codex-dream-skin { color: red }",
  template:
    "((css, art, theme) => ({ css, art, theme, v: __DREAM_SKIN_VERSION_JSON__ }))(" +
    "__DREAM_SKIN_CSS_JSON__, __DREAM_SKIN_ART_JSON__, __DREAM_SKIN_THEME_JSON__)",
};

async function makeCodexTheme(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "codress-theme-"));
  await writeFile(path.join(dir, "background.png"), TINY_PNG);
  await writeFile(
    path.join(dir, "theme.json"),
    JSON.stringify({ schemaVersion: 1, id: "test", name: "测试", image: "background.png" })
  );
  return dir;
}

describe("buildThemePayload (codex)", () => {
  it("replaces every placeholder and yields a stable revision", async () => {
    const dir = await makeCodexTheme();
    const first = await buildThemePayload(codexAdapter, codexAssets, dir);
    const second = await buildThemePayload(codexAdapter, codexAssets, dir);
    expect(first.payload).not.toContain("__DREAM_SKIN_CSS_JSON__");
    expect(first.payload).not.toContain("__DREAM_SKIN_ART_JSON__");
    expect(first.payload).not.toContain("__DREAM_SKIN_THEME_JSON__");
    expect(first.payload).toContain("data:image/png;base64,");
    expect(first.revision).toBe(second.revision);
    expect(first.themeId).toBe("test");
    // payload 是合法 JS 表达式
    expect(() => new Function(`return ${first.payload}`)).not.toThrow();
  });

  it("rejects image path escape", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "codress-bad-"));
    await writeFile(
      path.join(dir, "theme.json"),
      JSON.stringify({ schemaVersion: 1, id: "x", name: "x", image: "../evil.png" })
    );
    await expect(buildThemePayload(codexAdapter, codexAssets, dir)).rejects.toThrow();
  });
});

describe("buildCatalogPayload (workbuddy)", () => {
  it("inlines every theme image as artDataUrl", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "codress-catalog-"));
    await writeFile(path.join(dir, "a.png"), TINY_PNG);
    await writeFile(
      path.join(dir, "catalog.json"),
      JSON.stringify({
        schemaVersion: 1,
        defaultThemeId: "a",
        themes: [{ id: "a", name: "A", image: "a.png", appearance: "dark" }],
      })
    );
    const assets: RuntimeAssets = {
      css: "body{}",
      template:
        "((css, catalog) => catalog)(__WORKBUDDY_DREAM_SKIN_CSS_JSON__, __WORKBUDDY_DREAM_SKIN_CATALOG_JSON__)",
    };
    const built = await buildCatalogPayload(workbuddyAdapter, assets, dir);
    expect(built.payload).toContain("artDataUrl");
    expect(built.payload).toContain("data:image/png;base64,");
    expect(built.themeId).toBe("a");
  });
});

describe("expressions", () => {
  it("early payload waits for adapter markers", async () => {
    const dir = await makeCodexTheme();
    const built = await buildThemePayload(codexAdapter, codexAssets, dir);
    const early = earlyPayloadFor(built.payload, built.revision, codexAdapter);
    expect(early).toContain("main.main-surface");
    expect(early).toContain(built.revision);
  });
  it("remove/verify expressions target adapter runtime keys", () => {
    expect(removeExpression(codexAdapter)).toContain("__CODEX_DREAM_SKIN_STATE__");
    expect(removeExpression(workbuddyAdapter)).toContain("__WORKBUDDY_DREAM_SKIN_STATE__");
    expect(verifyExpression(codexAdapter)).toContain("codex-dream-skin-style");
    expect(verifyExpression(workbuddyAdapter)).toContain("workbuddy-dream-skin-style");
  });
});
