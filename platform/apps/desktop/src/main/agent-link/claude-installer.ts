import fs from "node:fs";
import path from "node:path";
import { claudeConfigDir, codressDir } from "./paths";
import { commandExists } from "./commands";

/**
 * Claude Code hooks 安装器(角色对标 pet-installer 的"装进 Codex"):
 * 向用户级 ~/.claude/settings.json 合并 10 条 hooks,把会话状态转发给本地桥。
 *
 * 铁律:
 * - 解析失败中止,绝不覆盖用户文件
 * - 写前备份(保留最近 3 份),tmp+rename 原子写
 * - 只 append 我方条目;卸载按 command 含 ".codress"+"claude-hook" 标记过滤
 * - hook 脚本任何情况 exit 0,Codress 没开也绝不拖慢 Claude Code
 */

const HOOK_SCRIPT_MARKER = "claude-hook";
const HOOK_TIMEOUT_SECONDS = 3;
const BACKUP_KEEP = 3;

/**
 * matcher 只对 Pre/PostToolUse 有意义;其余事件用无 matcher 组(匹配全部)。
 * PermissionRequest/PermissionDenied/PostToolUseFailure 是取消与失败的关键信号:
 * 用户在权限弹窗拒绝/取消时只有 PermissionDenied 会触发(Esc 中断不触发 Stop)。
 */
const HOOK_EVENTS: { event: string; matcher?: string }[] = [
  { event: "SessionStart" },
  { event: "UserPromptSubmit" },
  { event: "PreToolUse", matcher: "*" },
  { event: "PostToolUse", matcher: "*" },
  { event: "PostToolUseFailure" },
  { event: "PermissionRequest" },
  { event: "PermissionDenied" },
  { event: "Notification" },
  { event: "Stop" },
  { event: "SessionEnd" },
];

export interface ClaudeLinkFileState {
  claudeDetected: boolean;
  linked: boolean;
  scriptPresent: boolean;
}

function claudeDir(): string {
  return claudeConfigDir();
}

function claudeSettingsFile(): string {
  return path.join(claudeDir(), "settings.json");
}

function codressBinDir(): string {
  return path.join(codressDir(), "bin");
}

function hookScriptFile(): string {
  return path.join(codressBinDir(), process.platform === "win32" ? "claude-hook.cmd" : "claude-hook.sh");
}

/** Kimi 在两个平台都用 Git Bash 跑 hooks,统一走 .sh 版本。 */
export function shForwarderFile(): string {
  return path.join(codressBinDir(), "claude-hook.sh");
}

function isOurHook(hook: unknown): boolean {
  if (!hook || typeof hook !== "object") return false;
  const command = (hook as { command?: unknown }).command;
  if (typeof command !== "string" || !command.includes(HOOK_SCRIPT_MARKER)) return false;
  // 生产路径含 .codress;CODRESS_HOME 重定向(测试)时按当前脚本目录识别
  return command.includes(".codress") || command.includes(codressBinDir());
}

/** 从 hooks 配置里剥掉我方条目(条目内混入用户 hook 时只删我方那一条)。 */
function stripOurEntries(hooks: Record<string, unknown>): Record<string, unknown> {
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
        const rest = inner.filter((hook) => !isOurHook(hook));
        if (rest.length === inner.length) return entry;
        if (rest.length === 0) return null;
        return { ...(entry as Record<string, unknown>), hooks: rest };
      })
      .filter((entry) => entry !== null);
    if (kept.length > 0) next[event] = kept;
  }
  return next;
}

function hasOurEntries(hooks: unknown): boolean {
  if (!hooks || typeof hooks !== "object") return false;
  for (const value of Object.values(hooks as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      const inner = entry && typeof entry === "object" ? (entry as { hooks?: unknown }).hooks : null;
      if (Array.isArray(inner) && inner.some((hook) => isOurHook(hook))) return true;
    }
  }
  return false;
}

function readSettings(): { ok: true; root: Record<string, unknown>; existed: boolean } | { ok: false; message: string } {
  const file = claudeSettingsFile();
  if (!fs.existsSync(file)) return { ok: true, root: {}, existed: false };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, message: "~/.claude/settings.json 顶层不是对象,已中止(未做任何修改),请手动检查" };
    }
    return { ok: true, root: parsed as Record<string, unknown>, existed: true };
  } catch {
    return { ok: false, message: "~/.claude/settings.json 不是有效 JSON,已中止(未做任何修改),请手动修复后重试" };
  }
}

function backupSettings(): void {
  const file = claudeSettingsFile();
  if (!fs.existsSync(file)) return;
  fs.copyFileSync(file, `${file}.codress-bak-${Date.now()}`);
  const dir = path.dirname(file);
  const backups = fs.readdirSync(dir)
    .filter((name) => name.startsWith("settings.json.codress-bak-"))
    .sort();
  for (const stale of backups.slice(0, Math.max(0, backups.length - BACKUP_KEEP))) {
    fs.rmSync(path.join(dir, stale), { force: true });
  }
}

function writeSettingsAtomic(root: Record<string, unknown>): void {
  const file = claudeSettingsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.codress-tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(root, null, 2)}\n`, "utf-8");
  fs.renameSync(temporary, file);
}

/**
 * 写转发脚本(两个平台都写 .cmd + .sh:Claude/Gemini 走平台 shell,
 * Kimi 在 Windows 也用 Git Bash,固定走 .sh)。
 * 端口/令牌文件路径直接烘焙进脚本;第二个参数是来源 id,缺省由桥补 claude-code。
 * 找不到配置文件立即 exit 0(Codress 被卸载后残留 hooks 也零噪音)。
 */
export function ensureForwarderScripts(): void {
  fs.mkdirSync(codressBinDir(), { recursive: true });
  const portFile = path.join(codressDir(), "bridge.port");
  const tokenFile = path.join(codressDir(), "bridge.token");
  // .cmd 必须 CRLF、无 BOM;宿主 shell 按 cmd.exe 设计(见设计文档 §2 验证点)
  const cmdLines = [
    "@echo off",
    "rem Codress agent-link hook - forward coding-agent hook JSON to the local bridge.",
    `if not exist "${portFile}" exit /b 0`,
    `if not exist "${tokenFile}" exit /b 0`,
    `set /p CODRESS_PORT=<"${portFile}"`,
    `set /p CODRESS_TOKEN=<"${tokenFile}"`,
    'curl -s --max-time 1 -X POST "http://127.0.0.1:%CODRESS_PORT%/v1/agent-events?event=%1&src=%2" -H "X-Codress-Token: %CODRESS_TOKEN%" -H "Content-Type: application/json" --data-binary @- >nul 2>&1',
    "exit /b 0",
    "",
  ];
  fs.writeFileSync(path.join(codressBinDir(), "claude-hook.cmd"), cmdLines.join("\r\n"), "utf-8");
  const shLines = [
    "#!/bin/sh",
    "# Codress agent-link hook - forward coding-agent hook JSON to the local bridge.",
    `P="${portFile.replace(/\\/g, "/")}"; T="${tokenFile.replace(/\\/g, "/")}"`,
    '[ -f "$P" ] && [ -f "$T" ] || exit 0',
    'curl -s --max-time 1 -X POST "http://127.0.0.1:$(cat "$P")/v1/agent-events?event=$1&src=$2" -H "X-Codress-Token: $(cat "$T")" -H "Content-Type: application/json" --data-binary @- >/dev/null 2>&1',
    "exit 0",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(codressBinDir(), "claude-hook.sh"), shLines, { encoding: "utf-8", mode: 0o755 });
}

function hookCommand(event: string): string {
  return `"${hookScriptFile()}" ${event} claude-code`;
}

export function claudeLinkFileState(): ClaudeLinkFileState {
  const settings = readSettings();
  return {
    claudeDetected: fs.existsSync(claudeDir()) || commandExists("claude", ["claude-code"]),
    linked: settings.ok ? hasOurEntries(settings.root.hooks) : false,
    scriptPresent: fs.existsSync(hookScriptFile()),
  };
}

export function installClaudeHooks(): { ok: boolean; message?: string } {
  try {
    const settings = readSettings();
    if (!settings.ok) return { ok: false, message: settings.message };
    ensureForwarderScripts();
    backupSettings();

    const hooks = stripOurEntries(
      settings.root.hooks && typeof settings.root.hooks === "object" && !Array.isArray(settings.root.hooks)
        ? { ...(settings.root.hooks as Record<string, unknown>) }
        : {},
    );
    for (const { event, matcher } of HOOK_EVENTS) {
      const existing = Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : [];
      existing.push({
        ...(matcher ? { matcher } : {}),
        hooks: [{ type: "command", command: hookCommand(event), timeout: HOOK_TIMEOUT_SECONDS }],
      });
      hooks[event] = existing;
    }
    writeSettingsAtomic({ ...settings.root, hooks });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export function uninstallClaudeHooks(): { ok: boolean; message?: string } {
  try {
    const settings = readSettings();
    if (!settings.ok) return { ok: false, message: settings.message };
    if (settings.existed) {
      backupSettings();
      const hooks = stripOurEntries(
        settings.root.hooks && typeof settings.root.hooks === "object" && !Array.isArray(settings.root.hooks)
          ? { ...(settings.root.hooks as Record<string, unknown>) }
          : {},
      );
      const next = { ...settings.root };
      if (Object.keys(hooks).length > 0) next.hooks = hooks;
      else delete next.hooks;
      writeSettingsAtomic(next);
    }
    // 转发脚本被多来源共享,删除交给 installers 注册表在"最后一个来源断开"时统一处理
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
