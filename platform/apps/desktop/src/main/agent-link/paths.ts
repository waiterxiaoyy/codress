import os from "node:os";
import path from "node:path";

/** CODRESS_HOME 仅供测试重定向 ~/.codress;正常运行走用户主目录。 */
export function codressDir(): string {
  return process.env.CODRESS_HOME || path.join(os.homedir(), ".codress");
}

/** 与 Claude Code 官方一致:CLAUDE_CONFIG_DIR 可重定向其配置目录。 */
export function claudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
}

/** Gemini CLI 配置目录(~/.gemini);CODRESS_GEMINI_DIR 仅供测试重定向。 */
export function geminiConfigDir(): string {
  return process.env.CODRESS_GEMINI_DIR || path.join(os.homedir(), ".gemini");
}

/** Kimi Code CLI 配置目录(~/.kimi-code);CODRESS_KIMI_DIR 仅供测试重定向。 */
export function kimiCodeConfigDir(): string {
  return process.env.CODRESS_KIMI_DIR || path.join(os.homedir(), ".kimi-code");
}

/** 与 Codex 官方一致:CODEX_HOME 可重定向其配置目录(pet-installer 同款约定)。 */
export function codexHomeDir(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}
