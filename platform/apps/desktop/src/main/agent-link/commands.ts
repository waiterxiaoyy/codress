import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function addDir(dirs: string[], value: string | undefined) {
  if (value && !dirs.includes(value)) dirs.push(value);
}

function commandSearchDirs(): string[] {
  const dirs: string[] = [];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) addDir(dirs, dir);
  if (process.platform === "win32") {
    addDir(dirs, process.env.NVM_SYMLINK);
    addDir(dirs, process.env.PNPM_HOME);
    addDir(dirs, process.env.VOLTA_HOME ? path.join(process.env.VOLTA_HOME, "bin") : undefined);
    addDir(dirs, process.env.APPDATA ? path.join(process.env.APPDATA, "npm") : undefined);
    addDir(dirs, process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Programs", "nodejs") : undefined);
    addDir(dirs, process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "nodejs") : undefined);
    addDir(dirs, process.env["ProgramFiles(x86)"] ? path.join(process.env["ProgramFiles(x86)"], "nodejs") : undefined);
  } else {
    addDir(dirs, "/opt/homebrew/bin");
    addDir(dirs, "/usr/local/bin");
    addDir(dirs, path.join(os.homedir(), ".npm-global", "bin"));
    addDir(dirs, path.join(os.homedir(), ".local", "bin"));
    addDir(dirs, path.join(os.homedir(), ".bun", "bin"));
  }
  return dirs;
}

export function commandExists(binary: string, aliases: string[] = []): boolean {
  const baseNames = [binary, ...aliases];
  const names = process.platform === "win32"
    ? baseNames.flatMap((name) => [`${name}.exe`, `${name}.cmd`, `${name}.ps1`, name])
    : baseNames;
  for (const dir of commandSearchDirs()) {
    for (const name of names) {
      try {
        if (fs.existsSync(path.join(dir, name))) return true;
      } catch {
        // Ignore unreadable directories.
      }
    }
  }
  return false;
}
