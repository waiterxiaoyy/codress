import { exec, execFile, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { AdapterDefinition } from "../adapters";
import { cdpReady } from "../engine/cdp";
import { discoverWinInstall, launchAppxWithArgs } from "./discover-win";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/** 从 Info.plist 读取 CFBundleExecutable，获取 .app 内真实二进制名称。 */
function getBundleExecutable(appPath: string): string {
  try {
    const plist = readFileSync(path.join(appPath, "Contents", "Info.plist"), "utf8");
    const match = plist.match(/<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/);
    if (match?.[1]) return match[1].trim();
  } catch { /* ignore */ }
  // fallback: 取 MacOS 目录第一个文件
  try {
    const macosDir = path.join(appPath, "Contents", "MacOS");
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const files = readdirSync(macosDir).filter((f: string) => !f.startsWith("."));
    if (files.length > 0) return files[0];
  } catch { /* ignore */ }
  return path.basename(appPath, ".app");
}

export interface AppInstall {
  kind: "win-exe" | "win-appx" | "mac-app";
  path: string;
  /** MSIX 包应用的激活 ID(WindowsApps 下的 exe 不能直接 spawn) */
  aumid?: string;
  /** 命中的发现渠道(override/candidate/appx/process/registry/start-menu) */
  source?: string;
}

function expandHome(value: string): string {
  return value.startsWith("~") ? path.join(os.homedir(), value.slice(1)) : value;
}

/**
 * 查找目标应用安装位置:用户设置优先;Windows 走全自动发现链
 * (常见目录 → MSIX 包 → 运行中进程 → 注册表卸载项 → 开始菜单快捷方式),
 * 用户不需要关心装在哪。
 */
export async function discoverInstall(
  adapter: AdapterDefinition,
  overridePath?: string
): Promise<AppInstall | null> {
  if (process.platform === "darwin") {
    if (overridePath && existsSync(overridePath)) {
      return { kind: "mac-app", path: overridePath, source: "override" };
    }
    for (const candidate of adapter.mac.appCandidates.map(expandHome)) {
      if (existsSync(candidate)) return { kind: "mac-app", path: candidate, source: "candidate" };
    }
    return null;
  }
  const found = await discoverWinInstall(adapter, overridePath);
  if (!found) return null;
  return {
    kind: found.aumid ? "win-appx" : "win-exe",
    path: found.exePath,
    aumid: found.aumid,
    source: found.source,
  };
}

export async function isProcessRunning(adapter: AdapterDefinition): Promise<boolean> {
  try {
    if (process.platform === "darwin") {
      // 优先用 bundle ID 检测（更准确）
      for (const bundleId of adapter.mac.bundleIds ?? []) {
        const { stdout } = await execAsync(
          `lsappinfo list 2>/dev/null | grep -c ${JSON.stringify(bundleId)} || true`
        );
        if (parseInt(stdout.trim(), 10) > 0) return true;
      }
      // 降级：用 .app 名称检测进程
      const appName = adapter.mac.appCandidates[0]
        ?.replace(/^.*\//, "").replace(/\.app$/, "") ?? adapter.name;
      const { stdout } = await execAsync(
        `pgrep -fi ${JSON.stringify(appName)} | head -1 || true`
      );
      return stdout.trim().length > 0;
    }
    for (const name of adapter.win.processNames) {
      const { stdout } = await execAsync(`tasklist /FI "IMAGENAME eq ${name}" /NH`);
      if (stdout.toLowerCase().includes(name.toLowerCase())) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** 关闭目标应用(用于"重启并启用皮肤",需用户在 UI 明确确认后才调用)。 */
export async function stopApp(adapter: AdapterDefinition): Promise<void> {
  if (process.platform === "darwin") {
    const appName = adapter.mac.appCandidates[0]
      ?.replace(/^.*\//, "").replace(/\.app$/, "") ?? adapter.name;
    // 先用 osascript 优雅退出，失败则 pkill
    await execAsync(`osascript -e 'quit app "${appName}"' 2>/dev/null || pkill -f "${appName}" || true`);
    // 等待进程真正消失，最多 10 秒
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const still = await isProcessRunning(adapter);
      if (!still) break;
    }
    // 兜底：强制 kill
    await execAsync(`pkill -9 -f "${appName}" 2>/dev/null || true`);
    await new Promise((resolve) => setTimeout(resolve, 600));
    return;
  }
  for (const name of adapter.win.processNames) {
    await execAsync(`taskkill /IM "${name}" /T /F`).catch(() => undefined);
  }
  await new Promise((resolve) => setTimeout(resolve, 800));
}

/**
 * 构造启动目标应用的环境变量(mac/win 通用):
 * - 清理 Codress/electron-vite 的 dev 变量(ELECTRON_*、VITE_DEV_SERVER_URL、NODE_ENV),
 *   避免从 Codress 里 spawn 出的 Electron 应用被干扰;
 * - adapter 声明了 portEnvVar 时注入调试端口(如 WorkBuddy 只认环境变量不认命令行参数)。
 */
export function buildLaunchEnv(
  adapter: AdapterDefinition,
  port: number,
  base: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const env = { ...base };
  delete env.VITE_DEV_SERVER_URL;
  delete env.NODE_ENV;
  for (const key of Object.keys(env)) {
    if (key.startsWith("ELECTRON_")) delete env[key];
  }
  if (adapter.portEnvVar) env[adapter.portEnvVar] = String(port);
  return env;
}

/** 带 CDP 调试端口启动目标应用。 */
export async function launchWithCdp(
  adapter: AdapterDefinition,
  install: AppInstall,
  port: number
): Promise<void> {
  const args = adapter.launchArgs(port);
  const env = buildLaunchEnv(adapter, port);
  if (install.kind === "mac-app") {
    // 通过 Info.plist 获取真实二进制名,直接 spawn + 环境变量注入,
    // 避免 open 与 Codress dev Electron 冲突
    const execName = getBundleExecutable(install.path);
    const binaryPath = path.join(install.path, "Contents", "MacOS", execName);
    try {
      const child = spawn(binaryPath, args, { detached: true, stdio: "ignore", env });
      child.unref();
    } catch {
      // 兜底:依赖 portEnvVar 的应用走 launchctl setenv + open;其余直接 open -a
      if (adapter.portEnvVar) {
        await execFileAsync("/bin/launchctl", ["setenv", adapter.portEnvVar, String(port)]).catch(() => undefined);
        const bundleId = adapter.mac.bundleIds?.[0];
        if (bundleId) {
          await execFileAsync("/usr/bin/open", ["-b", bundleId, "--args", ...args]).catch(() => undefined);
        } else {
          await execFileAsync("/usr/bin/open", ["-a", install.path, "--args", ...args]).catch(() => undefined);
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await execFileAsync("/bin/launchctl", ["unsetenv", adapter.portEnvVar]).catch(() => undefined);
      } else {
        await execFileAsync("open", ["-a", install.path, "--args", ...args]).catch(() => undefined);
      }
    }
    return;
  }
  if (install.kind === "win-appx" && install.aumid) {
    // 注意:COM 激活无法注入环境变量,依赖 portEnvVar 的目标(WorkBuddy)没有商店版,
    // 实际不会走到这里;真出现时会因 CDP 超时报错,提示用户改用独立安装版
    const ok = await launchAppxWithArgs(install.aumid, args);
    if (ok) return;
  }
  const child = spawn(install.path, args, { detached: true, stdio: "ignore", env });
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
  const install = await discoverInstall(adapter, overridePath);
  if (!install) {
    return {
      ok: false,
      reason: "not-installed",
      message: `${adapter.name} 未找到(已尝试自动检测常见目录、商店包、注册表与开始菜单),可在设置中手动指定路径`,
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
