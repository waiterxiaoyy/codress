import { exec, execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { AdapterDefinition } from "../adapters";
import { cdpReady } from "../engine/cdp";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export interface AppInstall {
  kind: "win-exe" | "mac-app";
  path: string;
}

function expandWinEnv(value: string): string {
  return value.replace(/%([^%]+)%/g, (_, name) => process.env[name] ?? `%${name}%`);
}

function expandHome(value: string): string {
  return value.startsWith("~") ? path.join(os.homedir(), value.slice(1)) : value;
}

/** 查找目标应用安装位置:用户设置优先,其次内置候选路径。 */
export function discoverInstall(adapter: AdapterDefinition, overridePath?: string): AppInstall | null {
  if (overridePath && existsSync(overridePath)) {
    return { kind: process.platform === "darwin" ? "mac-app" : "win-exe", path: overridePath };
  }
  if (process.platform === "darwin") {
    for (const candidate of adapter.mac.appCandidates.map(expandHome)) {
      if (existsSync(candidate)) return { kind: "mac-app", path: candidate };
    }
    return null;
  }
  for (const candidate of adapter.win.exeCandidates.map(expandWinEnv)) {
    if (existsSync(candidate)) return { kind: "win-exe", path: candidate };
  }
  return null;
}

export async function isProcessRunning(adapter: AdapterDefinition): Promise<boolean> {
  try {
    if (process.platform === "darwin") {
      const bundle = adapter.mac.appCandidates[0]?.replace("/Applications/", "").replace(".app", "");
      const { stdout } = await execAsync(`pgrep -x ${JSON.stringify(bundle ?? adapter.name)} || true`);
      return stdout.trim().length > 0;
    }
    const { stdout } = await execAsync(
      `tasklist /FI "IMAGENAME eq ${adapter.win.processName}" /NH`
    );
    return stdout.toLowerCase().includes(adapter.win.processName.toLowerCase());
  } catch {
    return false;
  }
}

/** 关闭目标应用(用于"重启并启用皮肤",需用户在 UI 明确确认后才调用)。 */
export async function stopApp(adapter: AdapterDefinition): Promise<void> {
  if (process.platform === "darwin") {
    const appName = path.basename(adapter.mac.appCandidates[0] ?? "", ".app") || adapter.name;
    await execAsync(`osascript -e 'quit app "${appName}"' || true`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return;
  }
  await execAsync(`taskkill /IM "${adapter.win.processName}" /T /F`).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 800));
}

/** 带 CDP 调试端口启动目标应用。 */
export async function launchWithCdp(
  adapter: AdapterDefinition,
  install: AppInstall,
  port: number
): Promise<void> {
  const args = adapter.launchArgs(port);
  if (install.kind === "mac-app") {
    await execFileAsync("open", ["-na", install.path, "--args", ...args]).catch(async () => {
      const binaryDir = path.join(install.path, "Contents", "MacOS");
      const child = spawn(path.join(binaryDir, path.basename(install.path, ".app")), args, {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
    });
    return;
  }
  const child = spawn(install.path, args, { detached: true, stdio: "ignore" });
  child.unref();
}

export async function waitForCdp(port: number, timeoutMs = 45000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdpReady(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

export type EnsureResult =
  | { ok: true; port: number }
  | { ok: false; reason: "not-installed" | "needs-restart" | "cdp-timeout"; message: string };

/**
 * 确保目标应用带 CDP 运行:
 * 已带端口 → 直接用;未运行 → 代理启动;运行但无端口 → 需要用户确认重启。
 */
export async function ensureAppWithCdp(
  adapter: AdapterDefinition,
  port: number,
  overridePath: string | undefined,
  { allowRestart = false } = {}
): Promise<EnsureResult> {
  if (await cdpReady(port)) return { ok: true, port };
  const install = discoverInstall(adapter, overridePath);
  if (!install) {
    return {
      ok: false,
      reason: "not-installed",
      message: `${adapter.name} 未找到,请先安装,或在设置中手动指定路径`,
    };
  }
  if (await isProcessRunning(adapter)) {
    if (!allowRestart) {
      return {
        ok: false,
        reason: "needs-restart",
        message: `${adapter.name} 正在运行但未开启皮肤通道,需要重启一次(未保存的输入可能丢失)`,
      };
    }
    await stopApp(adapter);
  }
  await launchWithCdp(adapter, install, port);
  if (!(await waitForCdp(port))) {
    return {
      ok: false,
      reason: "cdp-timeout",
      message: `${adapter.name} 未在 45 秒内开放本机回环调试端口 ${port}`,
    };
  }
  return { ok: true, port };
}
