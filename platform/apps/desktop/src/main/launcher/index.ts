import { exec, execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { AdapterDefinition } from "../adapters";
import { cdpReady } from "../engine/cdp";
import { discoverWinInstall, launchAppxWithArgs } from "./discover-win";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

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
      const bundle = adapter.mac.appCandidates[0]?.replace("/Applications/", "").replace(".app", "");
      const { stdout } = await execAsync(`pgrep -x ${JSON.stringify(bundle ?? adapter.name)} || true`);
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
    const appName = path.basename(adapter.mac.appCandidates[0] ?? "", ".app") || adapter.name;
    await execAsync(`osascript -e 'quit app "${appName}"' || true`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return;
  }
  for (const name of adapter.win.processNames) {
    await execAsync(`taskkill /IM "${name}" /T /F`).catch(() => undefined);
  }
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
  if (install.kind === "win-appx" && install.aumid) {
    const ok = await launchAppxWithArgs(install.aumid, args);
    if (ok) return;
    // 激活失败时兜底尝试直接 spawn(部分包对当前用户可执行)
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
