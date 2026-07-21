import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { AdapterDefinition } from "../adapters";

const execFileAsync = promisify(execFile);

/**
 * Windows 安装自动发现:用户不需要关心装在哪。
 * 发现链(与 skin-skills 的做法一致,按可靠度排序):
 *   override → 常见目录 → MSIX/商店包(Get-AppxPackage)→ 运行中进程路径
 *   → 注册表卸载项 → 开始菜单快捷方式
 * MSIX 包(WindowsApps)不能直接 spawn,须记录 AUMID 走 ApplicationActivationManager 激活。
 */
export interface WinDiscovery {
  exePath: string;
  /** 存在即为 MSIX 包应用,启动用 AUMID 激活而非直接 spawn */
  aumid?: string;
  source: "override" | "candidate" | "appx" | "process" | "registry" | "start-menu";
}

const AUMID_PATTERN = /^[A-Za-z0-9._-]{1,128}![A-Za-z0-9._-]{1,64}$/;

/** 统一用 -EncodedCommand 执行,避免引号/中文路径的转义与编码问题。 */
export async function runPowerShell(script: string, timeoutMs = 12000): Promise<string | null> {
  const full = `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8\n${script}`;
  const encoded = Buffer.from(full, "utf16le").toString("base64");
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function psJson<T>(script: string, timeoutMs = 12000): Promise<T | null> {
  const raw = await runPowerShell(script, timeoutMs);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** ConvertTo-Json 对单元素不产出数组,这里统一包一层。 */
function asArray<T>(value: T | T[] | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/** 单引号 PS 字符串字面量(内部单引号翻倍即安全)。 */
function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function expandWinEnv(value: string): string {
  return value.replace(/%([^%]+)%/g, (_, name) => process.env[name] ?? `%${name}%`);
}

function matchesProcessName(exePath: string, processNames: string[]): boolean {
  const base = path.basename(exePath).toLowerCase();
  return processNames.some((name) => name.toLowerCase() === base);
}

// ---- 各发现渠道 ----

async function fromAppx(adapter: AdapterDefinition): Promise<WinDiscovery | null> {
  const appx = adapter.win.appx;
  if (!appx) return null;
  const info = await psJson<{ root: string; family: string; appId: string; exeRel: string }>(`
$ErrorActionPreference = 'Stop'
try {
  $p = Get-AppxPackage -Name ${psQuote(appx.namePattern)} |
    Sort-Object -Property { [version]$_.Version } -Descending | Select-Object -First 1
  if (-not $p -or -not $p.InstallLocation) { exit 0 }
  $m = Get-AppxPackageManifest -Package $p
  $apps = @($m.Package.Applications.Application)
  if ($apps.Count -eq 0) { exit 0 }
  [pscustomobject]@{
    root = "$($p.InstallLocation)"
    family = "$($p.PackageFamilyName)"
    appId = "$($apps[0].Id)"
    exeRel = "$($apps[0].Executable)"
  } | ConvertTo-Json -Compress
} catch { exit 0 }
`);
  if (!info?.root || !info.family || !info.appId || !info.exeRel) return null;
  const aumid = `${info.family}!${info.appId}`;
  if (!AUMID_PATTERN.test(aumid)) return null;
  const exePath = path.join(info.root, info.exeRel.replace(/\//g, "\\"));
  if (!existsSync(exePath)) return null;
  return { exePath, aumid, source: "appx" };
}

async function fromRunningProcess(adapter: AdapterDefinition): Promise<WinDiscovery | null> {
  // WQL 里字符串用双引号,整体作为 PS 单引号字面量传入
  const filter = adapter.win.processNames
    .map((n) => `Name="${n.replace(/["']/g, "")}"`)
    .join(" OR ");
  const paths = await psJson<string | string[]>(`
$hits = @(Get-CimInstance Win32_Process -Filter ${psQuote(filter)} -ErrorAction SilentlyContinue |
  Where-Object ExecutablePath | Select-Object -ExpandProperty ExecutablePath -Unique)
$hits | Select-Object -First 4 | ConvertTo-Json -Compress
`);
  for (const exePath of asArray(paths)) {
    if (!exePath || !existsSync(exePath)) continue;
    // WindowsApps 下的进程属于 MSIX 包,直接 spawn 会被拒;交给 appx 渠道(带 AUMID)处理
    if (/\\WindowsApps\\/i.test(exePath)) continue;
    if (matchesProcessName(exePath, adapter.win.processNames)) {
      return { exePath, source: "process" };
    }
  }
  return null;
}

interface RegistryEntry {
  DisplayName?: string;
  InstallLocation?: string;
  DisplayIcon?: string;
  UninstallString?: string;
}

/** DisplayIcon 形如 `C:\x\app.exe,0`,UninstallString 可能带引号与参数。 */
export function exeFromIconOrCommand(raw: string | undefined): string | null {
  if (!raw) return null;
  let value = raw.trim().replace(/,-?\d+$/, "");
  const quoted = value.match(/^"([^"]+)"/);
  if (quoted) value = quoted[1];
  value = value.trim();
  return /\.exe$/i.test(value) ? value : null;
}

async function fromRegistry(adapter: AdapterDefinition): Promise<WinDiscovery | null> {
  const entries = await psJson<RegistryEntry | RegistryEntry[]>(`
$roots = @(
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$hits = foreach ($r in $roots) {
  Get-ItemProperty -Path $r -ErrorAction SilentlyContinue |
    Where-Object { "$($_.DisplayName)" -match ${psQuote(adapter.win.displayNamePattern)} } |
    Select-Object DisplayName, InstallLocation, DisplayIcon, UninstallString
}
@($hits) | Select-Object -First 8 | ConvertTo-Json -Compress
`);
  for (const entry of asArray(entries)) {
    // 优先 DisplayIcon(通常直接指向主程序),其次 InstallLocation 拼进程名,最后卸载器同目录
    const iconExe = exeFromIconOrCommand(entry.DisplayIcon);
    if (iconExe && existsSync(iconExe) && matchesProcessName(iconExe, adapter.win.processNames)) {
      return { exePath: iconExe, source: "registry" };
    }
    const dirs: string[] = [];
    if (entry.InstallLocation) dirs.push(entry.InstallLocation);
    const uninstaller = exeFromIconOrCommand(entry.UninstallString);
    if (uninstaller) dirs.push(path.dirname(uninstaller));
    for (const dir of dirs) {
      for (const name of adapter.win.processNames) {
        for (const sub of ["", "app", "bin"]) {
          const candidate = path.join(dir, sub, name);
          if (existsSync(candidate)) return { exePath: candidate, source: "registry" };
        }
      }
    }
  }
  return null;
}

async function fromStartMenu(adapter: AdapterDefinition): Promise<WinDiscovery | null> {
  const targets = await psJson<string | string[]>(`
$dirs = @(
  (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'),
  (Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs')
)
$sh = New-Object -ComObject WScript.Shell
$hits = foreach ($d in $dirs) {
  Get-ChildItem -LiteralPath $d -Recurse -Filter *.lnk -ErrorAction SilentlyContinue |
    Where-Object { $_.BaseName -match ${psQuote(adapter.win.displayNamePattern)} } |
    ForEach-Object { try { $sh.CreateShortcut($_.FullName).TargetPath } catch { $null } }
}
@($hits) | Where-Object { $_ } | Select-Object -First 6 -Unique | ConvertTo-Json -Compress
`);
  for (const target of asArray(targets)) {
    if (target && existsSync(target) && matchesProcessName(target, adapter.win.processNames)) {
      if (/\\WindowsApps\\/i.test(target)) continue;
      return { exePath: target, source: "start-menu" };
    }
  }
  return null;
}

// ---- 缓存:statusAll 会被 UI 轮询,不能每次都扫注册表 ----

interface CacheEntry {
  value: WinDiscovery | null;
  at: number;
  override?: string;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<WinDiscovery | null>>();
const HIT_TTL_MS = 5 * 60 * 1000;
const MISS_TTL_MS = 30 * 1000;

export async function discoverWinInstall(
  adapter: AdapterDefinition,
  overridePath?: string
): Promise<WinDiscovery | null> {
  if (overridePath && existsSync(overridePath)) {
    return { exePath: overridePath, source: "override" };
  }
  const key = adapter.id;
  const cached = cache.get(key);
  if (cached && cached.override === overridePath) {
    const fresh = Date.now() - cached.at < (cached.value ? HIT_TTL_MS : MISS_TTL_MS);
    const stillThere = !cached.value || existsSync(cached.value.exePath);
    if (fresh && stillThere) return cached.value;
  }
  const running = inflight.get(key);
  if (running) return running;
  const task = (async () => {
    let found: WinDiscovery | null = null;
    for (const candidate of adapter.win.exeCandidates.map(expandWinEnv)) {
      if (existsSync(candidate)) {
        found = { exePath: candidate, source: "candidate" };
        break;
      }
    }
    if (!found) found = await fromAppx(adapter);
    if (!found) found = await fromRunningProcess(adapter);
    if (!found) found = await fromRegistry(adapter);
    if (!found) found = await fromStartMenu(adapter);
    cache.set(key, { value: found, at: Date.now(), override: overridePath });
    return found;
  })();
  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}

export function clearDiscoveryCache(): void {
  cache.clear();
}

/** MSIX 包应用带参启动:WindowsApps 的 exe 无法直接 spawn,走 COM 激活(与 skill 同款)。 */
export async function launchAppxWithArgs(aumid: string, args: string[]): Promise<boolean> {
  if (!AUMID_PATTERN.test(aumid)) return false;
  const argLine = args
    .map((a) => (/\s/.test(a) ? `"${a.replace(/"/g, "")}"` : a))
    .join(" ");
  const output = await runPowerShell(
    `
$ErrorActionPreference = 'Stop'
if (-not ('Codress.PackageLauncher' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace Codress {
  internal enum ActivateOptions : uint { None = 0 }
  [ComImport]
  [Guid("2e941141-7f97-4756-ba1d-9decde894a3d")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IApplicationActivationManager {
    [PreserveSig]
    int ActivateApplication(
      [MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
      [MarshalAs(UnmanagedType.LPWStr)] string arguments,
      ActivateOptions options,
      out uint processId);
  }
  [ComImport]
  [Guid("45ba127d-10a8-46ea-8ab7-56ea9078943c")]
  internal class ApplicationActivationManager {}
  public static class PackageLauncher {
    public static uint Launch(string appUserModelId, string arguments) {
      var manager = (IApplicationActivationManager)new ApplicationActivationManager();
      try {
        uint processId;
        int hr = manager.ActivateApplication(appUserModelId, arguments ?? string.Empty, ActivateOptions.None, out processId);
        Marshal.ThrowExceptionForHR(hr);
        return processId;
      } finally {
        if (Marshal.IsComObject(manager)) Marshal.FinalReleaseComObject(manager);
      }
    }
  }
}
'@
}
[Codress.PackageLauncher]::Launch(${psQuote(aumid)}, ${psQuote(argLine)})
`,
    20000
  );
  const pid = Number.parseInt(output ?? "", 10);
  return Number.isFinite(pid) && pid > 0;
}
