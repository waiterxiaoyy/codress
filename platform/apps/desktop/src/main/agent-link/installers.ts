import fs from "node:fs";
import path from "node:path";
import { codressDir, geminiConfigDir, kimiCodeConfigDir, codexHomeDir } from "./paths";
import { commandExists } from "./commands";
import {
  claudeLinkFileState,
  ensureForwarderScripts,
  installClaudeHooks,
  shForwarderFile,
  uninstallClaudeHooks,
} from "./claude-installer";

/**
 * 多来源接入注册表。能力矩阵(2026-07 逆向确认):
 * - claude-code : hooks 全量(running/waiting/取消/失败/庆祝)
 * - gemini-cli  : hooks 与 Claude 同构(~/.gemini/settings.json,Before/After 命名)
 * - kimi-code   : hooks 事件几乎同 Claude(~/.kimi-code/config.toml 的 [[hooks]])
 * - codex       : 仅官方 notify(agent-turn-complete),只有"回合完成"信号
 */
export type AgentSourceId = "claude-code" | "gemini-cli" | "kimi-code" | "codex";

export interface AgentSourceStatus {
  id: AgentSourceId;
  name: string;
  detected: boolean;
  linked: boolean;
  /** 非空 = 部分支持,说明能力边界 */
  partial?: string;
}

const MARKER = "codress-agent-link";
const SCRIPT_MARKER = "claude-hook";

function codressBinDir(): string {
  return path.join(codressDir(), "bin");
}

/** 平台 shell 用的转发脚本(Claude/Gemini);Kimi 固定用 .sh(它在 Windows 也走 Git Bash)。 */
function platformForwarderFile(): string {
  return path.join(codressBinDir(), process.platform === "win32" ? "claude-hook.cmd" : "claude-hook.sh");
}

// ============ 通用 JSON hooks(Gemini 与 Claude 同构) ============

interface JsonHooksTarget {
  settingsFile: string;
  events: { event: string; matcher?: string }[];
  commandFor: (event: string) => string;
}

function readJsonSettings(file: string): { ok: true; root: Record<string, unknown>; existed: boolean } | { ok: false; message: string } {
  if (!fs.existsSync(file)) return { ok: true, root: {}, existed: false };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, message: `${file} 顶层不是对象,已中止(未做任何修改)` };
    }
    return { ok: true, root: parsed as Record<string, unknown>, existed: true };
  } catch {
    return { ok: false, message: `${file} 不是有效 JSON,已中止(未做任何修改),请手动修复后重试` };
  }
}

function backupFile(file: string): void {
  if (!fs.existsSync(file)) return;
  fs.copyFileSync(file, `${file}.codress-bak-${Date.now()}`);
  const dir = path.dirname(file);
  const prefix = `${path.basename(file)}.codress-bak-`;
  const backups = fs.readdirSync(dir).filter((name) => name.startsWith(prefix)).sort();
  for (const stale of backups.slice(0, Math.max(0, backups.length - 3))) {
    fs.rmSync(path.join(dir, stale), { force: true });
  }
}

function writeFileAtomic(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.codress-tmp-${process.pid}`;
  fs.writeFileSync(temporary, content, "utf-8");
  fs.renameSync(temporary, file);
}

function isOurJsonHook(hook: unknown): boolean {
  if (!hook || typeof hook !== "object") return false;
  const command = (hook as { command?: unknown }).command;
  if (typeof command !== "string" || !command.includes(SCRIPT_MARKER)) return false;
  return command.includes(".codress") || command.includes(codressBinDir());
}

function stripOurJsonEntries(hooks: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [event, value] of Object.entries(hooks)) {
    if (!Array.isArray(value)) {
      next[event] = value;
      continue;
    }
    const kept = value
      .map((entry) => {
        if (!entry || typeof entry !== "object") return entry;
        const inner = (entry as { hooks?: unknown }).hooks;
        if (!Array.isArray(inner)) return entry;
        const rest = inner.filter((hook) => !isOurJsonHook(hook));
        if (rest.length === inner.length) return entry;
        if (rest.length === 0) return null;
        return { ...(entry as Record<string, unknown>), hooks: rest };
      })
      .filter((entry) => entry !== null);
    if (kept.length > 0) next[event] = kept;
  }
  return next;
}

function jsonHooksLinked(settingsFile: string): boolean {
  const settings = readJsonSettings(settingsFile);
  if (!settings.ok) return false;
  const hooks = settings.root.hooks;
  if (!hooks || typeof hooks !== "object") return false;
  for (const value of Object.values(hooks as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      const inner = entry && typeof entry === "object" ? (entry as { hooks?: unknown }).hooks : null;
      if (Array.isArray(inner) && inner.some((hook) => isOurJsonHook(hook))) return true;
    }
  }
  return false;
}

function installJsonHooks(target: JsonHooksTarget): { ok: boolean; message?: string } {
  try {
    const settings = readJsonSettings(target.settingsFile);
    if (!settings.ok) return { ok: false, message: settings.message };
    ensureForwarderScripts();
    backupFile(target.settingsFile);
    const hooks = stripOurJsonEntries(
      settings.root.hooks && typeof settings.root.hooks === "object" && !Array.isArray(settings.root.hooks)
        ? { ...(settings.root.hooks as Record<string, unknown>) }
        : {},
    );
    for (const { event, matcher } of target.events) {
      const existing = Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : [];
      existing.push({
        ...(matcher ? { matcher } : {}),
        hooks: [{ type: "command", command: target.commandFor(event), timeout: 3 }],
      });
      hooks[event] = existing;
    }
    writeFileAtomic(target.settingsFile, `${JSON.stringify({ ...settings.root, hooks }, null, 2)}\n`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

function uninstallJsonHooks(settingsFile: string): { ok: boolean; message?: string } {
  try {
    const settings = readJsonSettings(settingsFile);
    if (!settings.ok) return { ok: false, message: settings.message };
    if (settings.existed) {
      backupFile(settingsFile);
      const hooks = stripOurJsonEntries(
        settings.root.hooks && typeof settings.root.hooks === "object" && !Array.isArray(settings.root.hooks)
          ? { ...(settings.root.hooks as Record<string, unknown>) }
          : {},
      );
      const next = { ...settings.root };
      if (Object.keys(hooks).length > 0) next.hooks = hooks;
      else delete next.hooks;
      writeFileAtomic(settingsFile, `${JSON.stringify(next, null, 2)}\n`);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

// ============ 通用 TOML 标记块(Kimi [[hooks]] / Codex notify) ============

const TOML_BEGIN = `# ${MARKER} begin`;
const TOML_END = `# ${MARKER} end`;

function tomlBlockLinked(file: string): boolean {
  try {
    return fs.existsSync(file) && fs.readFileSync(file, "utf-8").includes(TOML_BEGIN);
  } catch {
    return false;
  }
}

function removeTomlMarkedContent(content: string): string {
  const lines = content.split(/\r?\n/);
  const kept: string[] = [];
  let inBlock = false;
  for (const line of lines) {
    if (line.trim() === TOML_BEGIN) {
      inBlock = true;
      continue;
    }
    if (line.trim() === TOML_END) {
      inBlock = false;
      continue;
    }
    // 单行标记(Codex notify)也一并清理
    if (!inBlock && !line.includes(`# ${MARKER}`)) kept.push(line);
  }
  return kept.join("\n");
}

function appendTomlBlock(file: string, blockLines: string[]): void {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
  backupFile(file);
  let content = removeTomlMarkedContent(existing);
  if (content.length > 0 && !content.endsWith("\n")) content += "\n";
  content += `\n${TOML_BEGIN}\n${blockLines.join("\n")}\n${TOML_END}\n`;
  writeFileAtomic(file, content);
}

function removeTomlBlock(file: string): void {
  if (!fs.existsSync(file)) return;
  backupFile(file);
  const cleaned = removeTomlMarkedContent(fs.readFileSync(file, "utf-8")).replace(/\n{3,}$/g, "\n");
  writeFileAtomic(file, cleaned.endsWith("\n") || cleaned.length === 0 ? cleaned : `${cleaned}\n`);
}

// ============ 各来源适配器 ============

/** Gemini CLI:hooks 与 Claude 同构,事件用 Before/After 命名,聚合器负责归一化。 */
const GEMINI_EVENTS = ["SessionStart", "BeforeAgent", "BeforeTool", "AfterTool", "AfterAgent", "Notification", "SessionEnd"];

function geminiSettingsFile(): string {
  return path.join(geminiConfigDir(), "settings.json");
}

/** Kimi Code:~/.kimi-code/config.toml 的 [[hooks]] 数组表,command 是 shell 字符串。 */
const KIMI_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "PermissionResult",
  "Notification",
  "Stop",
  "StopFailure",
  "SessionEnd",
];

function kimiConfigFile(): string {
  return path.join(kimiCodeConfigDir(), "config.toml");
}

function kimiHookBlock(): string[] {
  // Kimi 两个平台都用 Git Bash 执行,统一 sh 脚本 + 正斜杠路径
  const script = shForwarderFile().replace(/\\/g, "/");
  const lines: string[] = [];
  for (const event of KIMI_EVENTS) {
    lines.push(
      "[[hooks]]",
      `event = ${JSON.stringify(event)}`,
      `command = ${JSON.stringify(`sh "${script}" ${event} kimi-code`)}`,
      "timeout = 3",
      "",
    );
  }
  lines.pop();
  return lines;
}

function codexConfigFile(): string {
  return path.join(codexHomeDir(), "config.toml");
}

function codexNotifyScriptFile(): string {
  return path.join(codressBinDir(), process.platform === "win32" ? "codex-notify.cmd" : "codex-notify.sh");
}

/** Codex notify 把事件 JSON 作为 argv 传入(不是 stdin),需要单独的转发脚本。 */
function ensureCodexNotifyScript(): void {
  fs.mkdirSync(codressBinDir(), { recursive: true });
  const portFile = path.join(codressDir(), "bridge.port");
  const tokenFile = path.join(codressDir(), "bridge.token");
  const url = "/v1/agent-events?event=agent-turn-complete&src=codex&sid=codex";
  if (process.platform === "win32") {
    const lines = [
      "@echo off",
      "rem Codress agent-link notify - forward Codex turn-complete to the local bridge.",
      `if not exist "${portFile}" exit /b 0`,
      `if not exist "${tokenFile}" exit /b 0`,
      `set /p CODRESS_PORT=<"${portFile}"`,
      `set /p CODRESS_TOKEN=<"${tokenFile}"`,
      `curl -s --max-time 1 -X POST "http://127.0.0.1:%CODRESS_PORT%${url}" -H "X-Codress-Token: %CODRESS_TOKEN%" -H "Content-Type: application/json" --data-binary "%~1" >nul 2>&1`,
      "exit /b 0",
      "",
    ];
    fs.writeFileSync(codexNotifyScriptFile(), lines.join("\r\n"), "utf-8");
    return;
  }
  const script = [
    "#!/bin/sh",
    "# Codress agent-link notify - forward Codex turn-complete to the local bridge.",
    `P="${portFile}"; T="${tokenFile}"`,
    '[ -f "$P" ] && [ -f "$T" ] || exit 0',
    `curl -s --max-time 1 -X POST "http://127.0.0.1:$(cat "$P")${url}" -H "X-Codress-Token: $(cat "$T")" -H "Content-Type: application/json" --data-binary "\${1:-}" >/dev/null 2>&1`,
    "exit 0",
    "",
  ].join("\n");
  fs.writeFileSync(codexNotifyScriptFile(), script, { encoding: "utf-8", mode: 0o755 });
}

function codexNotifyLine(): string {
  const argv = process.platform === "win32"
    ? ["cmd", "/c", codexNotifyScriptFile()]
    : [codexNotifyScriptFile()];
  return `notify = [${argv.map((item) => JSON.stringify(item)).join(", ")}] # ${MARKER}`;
}

function installCodexNotify(): { ok: boolean; message?: string } {
  try {
    ensureForwarderScripts();
    ensureCodexNotifyScript();
    const file = codexConfigFile();
    const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
    const cleaned = removeTomlMarkedContent(existing);
    const conflict = cleaned.split(/\r?\n/).find((line) => /^\s*notify\s*=/.test(line));
    if (conflict) {
      return { ok: false, message: "Codex config.toml 已有自定义 notify 配置,为避免覆盖请先手动处理" };
    }
    backupFile(file);
    // notify 是 TOML 根键,必须插在第一个 [table] 之前 → 直接放文件最顶部
    let content = `${codexNotifyLine()}\n${cleaned}`;
    if (!content.endsWith("\n")) content += "\n";
    writeFileAtomic(file, content);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

function uninstallCodexNotify(): { ok: boolean; message?: string } {
  try {
    removeTomlBlock(codexConfigFile());
    fs.rmSync(codexNotifyScriptFile(), { force: true });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

// ============ 注册表 ============

export function agentSourceStates(): AgentSourceStatus[] {
  const claude = claudeLinkFileState();
  return [
    {
      id: "claude-code",
      name: "Claude Code",
      detected: claude.claudeDetected,
      linked: claude.linked,
    },
    {
      id: "gemini-cli",
      name: "Gemini CLI",
      detected: fs.existsSync(geminiConfigDir()) || commandExists("gemini"),
      linked: jsonHooksLinked(geminiSettingsFile()),
    },
    {
      id: "kimi-code",
      name: "Kimi Code",
      detected: fs.existsSync(kimiCodeConfigDir()) || commandExists("kimi", ["kimi-code"]),
      linked: tomlBlockLinked(kimiConfigFile()),
    },
    {
      id: "codex",
      name: "Codex",
      detected: fs.existsSync(codexHomeDir()) || commandExists("codex"),
      linked: tomlBlockLinked(codexConfigFile()) || (fs.existsSync(codexConfigFile()) && fs.readFileSync(codexConfigFile(), "utf-8").includes(MARKER)),
      partial: "官方仅提供 notify 完成信号,宠物只演回合完成庆祝",
    },
  ];
}

export function installAgentSource(id: AgentSourceId): { ok: boolean; message?: string } {
  switch (id) {
    case "claude-code":
      return installClaudeHooks();
    case "gemini-cli":
      return installJsonHooks({
        settingsFile: geminiSettingsFile(),
        events: GEMINI_EVENTS.map((event) => ({ event })),
        commandFor: (event) => `"${platformForwarderFile()}" ${event} gemini-cli`,
      });
    case "kimi-code":
      try {
        ensureForwarderScripts();
        appendTomlBlock(kimiConfigFile(), kimiHookBlock());
        return { ok: true };
      } catch (error) {
        return { ok: false, message: (error as Error).message };
      }
    case "codex":
      return installCodexNotify();
  }
}

export function uninstallAgentSource(id: AgentSourceId): { ok: boolean; message?: string } {
  let result: { ok: boolean; message?: string };
  switch (id) {
    case "claude-code":
      result = uninstallClaudeHooks();
      break;
    case "gemini-cli":
      result = uninstallJsonHooks(geminiSettingsFile());
      break;
    case "kimi-code":
      try {
        removeTomlBlock(kimiConfigFile());
        result = { ok: true };
      } catch (error) {
        result = { ok: false, message: (error as Error).message };
      }
      break;
    case "codex":
      result = uninstallCodexNotify();
      break;
  }
  if (result.ok) cleanupForwarderScriptsIfUnused();
  return result;
}

/** 转发脚本被多来源共享,只有最后一个来源断开后才删。 */
function cleanupForwarderScriptsIfUnused(): void {
  try {
    if (agentSourceStates().some((source) => source.linked)) return;
    for (const name of ["claude-hook.cmd", "claude-hook.sh", "codex-notify.cmd", "codex-notify.sh"]) {
      fs.rmSync(path.join(codressBinDir(), name), { force: true });
    }
  } catch {
    /* 清理失败不影响断开结果 */
  }
}
