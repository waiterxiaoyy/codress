import { describe, expect, it } from "vitest";
import { isValidPageTarget, probeExpression, validateDebuggerUrl } from "../src/main/engine/cdp";
import { codexAdapter } from "../src/main/adapters/codex";
import { workbuddyAdapter } from "../src/main/adapters/workbuddy";

const goodTarget = {
  id: "ABC123",
  type: "page",
  url: "app://host/index.html",
  webSocketDebuggerUrl: "ws://127.0.0.1:9341/devtools/page/ABC123",
};

describe("validateDebuggerUrl", () => {
  it("accepts a loopback page endpoint", () => {
    expect(validateDebuggerUrl(goodTarget, 9341)).toBe(
      "ws://127.0.0.1:9341/devtools/page/ABC123"
    );
  });
  it("rejects non-loopback hosts", () => {
    expect(() =>
      validateDebuggerUrl(
        { ...goodTarget, webSocketDebuggerUrl: "ws://192.168.1.5:9341/devtools/page/ABC123" },
        9341
      )
    ).toThrow();
  });
  it("rejects wrong ports and paths", () => {
    expect(() =>
      validateDebuggerUrl(
        { ...goodTarget, webSocketDebuggerUrl: "ws://127.0.0.1:9999/devtools/page/ABC123" },
        9341
      )
    ).toThrow();
    expect(() =>
      validateDebuggerUrl(
        { ...goodTarget, webSocketDebuggerUrl: "ws://127.0.0.1:9341/devtools/browser/x" },
        9341
      )
    ).toThrow();
  });
});

describe("isValidPageTarget", () => {
  it("accepts codex app:// pages", () => {
    expect(isValidPageTarget(goodTarget, 9341, codexAdapter.targetUrlPrefixes)).toBe(true);
  });
  it("rejects http pages for codex", () => {
    expect(
      isValidPageTarget(
        { ...goodTarget, url: "https://example.com" },
        9341,
        codexAdapter.targetUrlPrefixes
      )
    ).toBe(false);
  });
  it("rejects id/websocket mismatch", () => {
    expect(
      isValidPageTarget(
        { ...goodTarget, id: "OTHER" },
        9341,
        codexAdapter.targetUrlPrefixes
      )
    ).toBe(false);
  });
  it("workbuddy accepts any url (DOM probe decides)", () => {
    expect(
      isValidPageTarget(
        { ...goodTarget, url: "file:///app/index.html" },
        9341,
        workbuddyAdapter.targetUrlPrefixes
      )
    ).toBe(true);
  });
});

describe("probeExpression", () => {
  it("embeds all required markers", () => {
    const expr = probeExpression(codexAdapter);
    expect(expr).toContain("main.main-surface");
    expect(expr).toContain("aside.app-shell-left-panel");
  });
  it("adds title check when adapter requires it", () => {
    const expr = probeExpression(workbuddyAdapter);
    expect(expr).toContain('"WorkBuddy"');
  });
});
