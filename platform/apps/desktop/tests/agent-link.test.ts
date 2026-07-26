import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentStateAggregator, type AgentEvent, type AgentTransient } from "../src/main/agent-link/aggregator";
import { AgentLinkBridge } from "../src/main/agent-link/bridge";
import { claudeLinkFileState, installClaudeHooks } from "../src/main/agent-link/claude-installer";
import { agentSourceStates, installAgentSource, uninstallAgentSource } from "../src/main/agent-link/installers";

const temporaryDirectories: string[] = [];
const originalCodressHome = process.env.CODRESS_HOME;
const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
const originalGeminiDir = process.env.CODRESS_GEMINI_DIR;
const originalKimiDir = process.env.CODRESS_KIMI_DIR;
const originalCodexHome = process.env.CODEX_HOME;
const originalNvmSymlink = process.env.NVM_SYMLINK;
const originalPath = process.env.PATH;

afterEach(async () => {
  if (originalCodressHome === undefined) delete process.env.CODRESS_HOME;
  else process.env.CODRESS_HOME = originalCodressHome;
  if (originalClaudeConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
  if (originalGeminiDir === undefined) delete process.env.CODRESS_GEMINI_DIR;
  else process.env.CODRESS_GEMINI_DIR = originalGeminiDir;
  if (originalKimiDir === undefined) delete process.env.CODRESS_KIMI_DIR;
  else process.env.CODRESS_KIMI_DIR = originalKimiDir;
  if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = originalCodexHome;
  if (originalNvmSymlink === undefined) delete process.env.NVM_SYMLINK;
  else process.env.NVM_SYMLINK = originalNvmSymlink;
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

async function makeRoot(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(root);
  return root;
}

function event(overrides: Partial<AgentEvent>): AgentEvent {
  return { src: "claude-code", sessionId: "s1", event: "UserPromptSubmit", ...overrides };
}

describe("AgentStateAggregator", () => {
  it("puts waiting above running and builds bubble/label from session details", () => {
    const aggregator = new AgentStateAggregator();
    aggregator.ingest(event({ sessionId: "a", cwd: "/work/codress" }));
    expect(aggregator.snapshot()).toMatchObject({ state: "running", running: 1, waiting: 0, bubble: null });

    aggregator.ingest(event({ sessionId: "b", event: "Notification", cwd: "/work/server" }));
    expect(aggregator.snapshot()).toMatchObject({
      state: "waiting",
      running: 1,
      waiting: 1,
      bubble: "server 在等你",
      label: "Claude Code · 1 工作中 · 1 等确认",
    });

    aggregator.ingest(event({ sessionId: "a", event: "Notification", cwd: "/work/codress" }));
    expect(aggregator.snapshot().bubble).toBe("2 个会话在等你");
  });

  it("celebrates only when the last active session stops", () => {
    const aggregator = new AgentStateAggregator();
    const transients: AgentTransient[] = [];
    aggregator.on("transient", (kind: AgentTransient) => transients.push(kind));

    aggregator.ingest(event({ sessionId: "a" }));
    aggregator.ingest(event({ sessionId: "b" }));
    aggregator.ingest(event({ sessionId: "b", event: "Stop" }));
    expect(transients).not.toContain("celebrate");
    expect(aggregator.snapshot().state).toBe("running");

    aggregator.ingest(event({ sessionId: "a", event: "Stop" }));
    expect(transients).toContain("celebrate");
    expect(aggregator.snapshot().state).toBe("idle");
  });

  it("emits greet/failed transients and drops ended sessions", () => {
    const aggregator = new AgentStateAggregator();
    const transients: AgentTransient[] = [];
    aggregator.on("transient", (kind: AgentTransient) => transients.push(kind));

    aggregator.ingest(event({ event: "SessionStart" }));
    expect(transients).toContain("greet");

    aggregator.ingest(event({ event: "PostToolUse", isError: true }));
    expect(transients).toContain("failed");

    transients.length = 0;
    aggregator.ingest(event({ event: "PostToolUseFailure" }));
    expect(transients).toContain("failed");
    expect(aggregator.snapshot().state).toBe("running");

    aggregator.ingest(event({ event: "SessionEnd" }));
    expect(aggregator.snapshot()).toMatchObject({ state: "idle", total: 0, label: "" });
  });

  it("resets waiting when the user denies or cancels a permission prompt", () => {
    const aggregator = new AgentStateAggregator();
    aggregator.ingest(event({ event: "PermissionRequest", cwd: "/work/demo" }));
    expect(aggregator.snapshot()).toMatchObject({ state: "waiting", waiting: 1, bubble: "demo 在等你" });

    aggregator.ingest(event({ event: "PermissionDenied" }));
    expect(aggregator.snapshot()).toMatchObject({ state: "idle", waiting: 0, bubble: null });
  });

  it("uses idle_prompt to recover an interrupted turn without touching pending permissions", () => {
    const aggregator = new AgentStateAggregator();
    // Esc 中断 running:没有 Stop,靠 idle_prompt 闲置提醒归位
    aggregator.ingest(event({ sessionId: "a", event: "UserPromptSubmit" }));
    aggregator.ingest(event({ sessionId: "a", event: "Notification", notificationType: "idle_prompt" }));
    expect(aggregator.snapshot().state).toBe("idle");

    // 权限弹窗仍挂着的会话不被闲置提醒打断
    aggregator.ingest(event({ sessionId: "b", event: "PermissionRequest" }));
    aggregator.ingest(event({ sessionId: "b", event: "Notification", notificationType: "idle_prompt" }));
    expect(aggregator.snapshot().state).toBe("waiting");
  });
});

describe("AgentLinkBridge", () => {
  it("writes port/token files, rejects bad tokens, and strips events to state fields", async () => {
    const root = await makeRoot("codress-agent-bridge-");
    process.env.CODRESS_HOME = path.join(root, "codress");
    const received: AgentEvent[] = [];
    const bridge = new AgentLinkBridge((agentEvent) => received.push(agentEvent));
    await bridge.start();
    try {
      const port = Number(await fs.readFile(path.join(process.env.CODRESS_HOME, "bridge.port"), "utf8"));
      const token = await fs.readFile(path.join(process.env.CODRESS_HOME, "bridge.token"), "utf8");
      const url = `http://127.0.0.1:${port}/v1/agent-events?event=UserPromptSubmit&src=claude-code`;
      const body = JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        session_id: "s1",
        cwd: "/work/demo",
        tool_input: { secret: "must-not-survive" },
      });

      const rejected = await fetch(url, { method: "POST", headers: { "X-Codress-Token": "wrong" }, body });
      expect(rejected.status).toBe(403);

      const accepted = await fetch(url, { method: "POST", headers: { "X-Codress-Token": token }, body });
      expect(accepted.status).toBe(204);
      await vi.waitFor(() => expect(received).toHaveLength(1));
      // 只有状态字段:tool_input 等 payload 内容在桥内就地丢弃
      expect(received[0]).toEqual({
        src: "claude-code",
        sessionId: "s1",
        event: "UserPromptSubmit",
        cwd: "/work/demo",
        isError: false,
      });
    } finally {
      await bridge.stop();
    }
    await expect(fs.access(path.join(process.env.CODRESS_HOME, "bridge.port"))).rejects.toThrow();
  });
});

describe("claude hooks installer", () => {
  async function setupConfigDirs(): Promise<{ claudeSettings: string }> {
    const root = await makeRoot("codress-claude-link-");
    process.env.CODRESS_HOME = path.join(root, "codress");
    process.env.CLAUDE_CONFIG_DIR = path.join(root, "claude");
    return { claudeSettings: path.join(root, "claude", "settings.json") };
  }

  it("installs the 10 hook events into a fresh config dir", async () => {
    const { claudeSettings } = await setupConfigDirs();
    expect(installClaudeHooks()).toEqual({ ok: true });
    const parsed = JSON.parse(await fs.readFile(claudeSettings, "utf8"));
    expect(Object.keys(parsed.hooks)).toEqual([
      "SessionStart",
      "UserPromptSubmit",
      "PreToolUse",
      "PostToolUse",
      "PostToolUseFailure",
      "PermissionRequest",
      "PermissionDenied",
      "Notification",
      "Stop",
      "SessionEnd",
    ]);
    expect(parsed.hooks.PreToolUse[0].matcher).toBe("*");
    expect(parsed.hooks.Stop[0].matcher).toBeUndefined();
    expect(parsed.hooks.Stop[0].hooks[0]).toMatchObject({ type: "command", timeout: 3 });
    expect(parsed.hooks.Stop[0].hooks[0].command).toContain("claude-hook");
  });

  it("merges additively, stays idempotent, and uninstalls without touching user hooks", async () => {
    const { claudeSettings } = await setupConfigDirs();
    await fs.mkdir(path.dirname(claudeSettings), { recursive: true });
    await fs.writeFile(claudeSettings, JSON.stringify({
      model: "opus",
      hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo user-hook" }] }] },
    }));

    expect(installClaudeHooks()).toEqual({ ok: true });
    expect(installClaudeHooks()).toEqual({ ok: true }); // 重复接入不叠加
    const merged = JSON.parse(await fs.readFile(claudeSettings, "utf8"));
    expect(merged.model).toBe("opus");
    expect(merged.hooks.PreToolUse).toHaveLength(2);
    expect(claudeLinkFileState()).toMatchObject({ claudeDetected: true, linked: true, scriptPresent: true });

    expect(uninstallAgentSource("claude-code")).toEqual({ ok: true });
    const after = JSON.parse(await fs.readFile(claudeSettings, "utf8"));
    expect(after.model).toBe("opus");
    expect(after.hooks.PreToolUse).toHaveLength(1);
    expect(after.hooks.PreToolUse[0].hooks[0].command).toBe("echo user-hook");
    expect(after.hooks.Stop).toBeUndefined();
    expect(claudeLinkFileState()).toMatchObject({ linked: false, scriptPresent: false });
  });

  it("aborts without touching an invalid settings.json", async () => {
    const { claudeSettings } = await setupConfigDirs();
    await fs.mkdir(path.dirname(claudeSettings), { recursive: true });
    await fs.writeFile(claudeSettings, "{ not json");
    const result = installClaudeHooks();
    expect(result.ok).toBe(false);
    expect(result.message).toContain("settings.json");
    await expect(fs.readFile(claudeSettings, "utf8")).resolves.toBe("{ not json");
  });

  it("detects Claude Code from npm shim dirs that are missing from PATH", async () => {
    const root = await makeRoot("codress-claude-detect-");
    const npmBin = path.join(root, "nodejs");
    await fs.mkdir(npmBin, { recursive: true });
    await fs.writeFile(path.join(npmBin, "claude.cmd"), "@echo off\r\n");
    process.env.CLAUDE_CONFIG_DIR = path.join(root, "missing-claude-config");
    process.env.NVM_SYMLINK = npmBin;
    process.env.PATH = "";

    expect(claudeLinkFileState()).toMatchObject({ claudeDetected: true, linked: false });
  });

  it("installs and removes Gemini, Kimi and Codex sources without touching user entries", async () => {
    const root = await makeRoot("codress-multi-link-");
    process.env.CODRESS_HOME = path.join(root, "codress");
    process.env.CLAUDE_CONFIG_DIR = path.join(root, "claude");
    process.env.CODRESS_GEMINI_DIR = path.join(root, "gemini");
    process.env.CODRESS_KIMI_DIR = path.join(root, "kimi");
    process.env.CODEX_HOME = path.join(root, "codex");

    const geminiSettings = path.join(process.env.CODRESS_GEMINI_DIR, "settings.json");
    await fs.mkdir(path.dirname(geminiSettings), { recursive: true });
    await fs.writeFile(geminiSettings, JSON.stringify({
      theme: "dark",
      hooks: { BeforeTool: [{ hooks: [{ type: "command", command: "echo user-gemini" }] }] },
    }));

    expect(installAgentSource("gemini-cli")).toEqual({ ok: true });
    expect(installAgentSource("kimi-code")).toEqual({ ok: true });
    expect(installAgentSource("codex")).toEqual({ ok: true });

    const gemini = JSON.parse(await fs.readFile(geminiSettings, "utf8"));
    expect(gemini.theme).toBe("dark");
    expect(gemini.hooks.BeforeTool).toHaveLength(2);
    expect(gemini.hooks.BeforeTool[1].hooks[0].command).toContain("gemini-cli");
    const kimiConfig = await fs.readFile(path.join(process.env.CODRESS_KIMI_DIR, "config.toml"), "utf8");
    expect(kimiConfig).toContain("[[hooks]]");
    expect(kimiConfig).toContain("kimi-code");
    const codexConfig = await fs.readFile(path.join(process.env.CODEX_HOME, "config.toml"), "utf8");
    expect(codexConfig).toContain("notify =");
    expect(codexConfig).toContain("codress-agent-link");
    expect(agentSourceStates().filter((source) => source.linked).map((source) => source.id)).toEqual([
      "gemini-cli",
      "kimi-code",
      "codex",
    ]);

    expect(uninstallAgentSource("gemini-cli")).toEqual({ ok: true });
    const geminiAfter = JSON.parse(await fs.readFile(geminiSettings, "utf8"));
    expect(geminiAfter.hooks.BeforeTool).toHaveLength(1);
    expect(geminiAfter.hooks.BeforeTool[0].hooks[0].command).toBe("echo user-gemini");

    expect(uninstallAgentSource("kimi-code")).toEqual({ ok: true });
    await expect(fs.readFile(path.join(process.env.CODRESS_KIMI_DIR, "config.toml"), "utf8")).resolves.not.toContain("codress-agent-link");
    expect(uninstallAgentSource("codex")).toEqual({ ok: true });
    await expect(fs.readFile(path.join(process.env.CODEX_HOME, "config.toml"), "utf8")).resolves.not.toContain("notify =");
  });
});
