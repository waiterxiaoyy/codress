import { promises as fs } from "node:fs";
import path from "node:path";

export interface Settings {
  apiBase: string;
  userToken: string | null;
  userName: string | null;
  activePet: string | null;
  activeSkins: Partial<Record<string, string | null>>;
  appPaths: Partial<Record<string, string>>;
  ports: Partial<Record<string, number>>;
}

const DEVELOPMENT = process.env.NODE_ENV === "development";
const DEFAULTS: Settings = {
  apiBase: DEVELOPMENT ? "http://127.0.0.1:8080" : "https://codress.dev",
  userToken: null,
  userName: null,
  activePet: null,
  activeSkins: {},
  appPaths: {},
  ports: {},
};

/** userData 下的 settings.json,单文件持久化。 */
export class SettingsStore {
  private file: string;
  private data: Settings = { ...DEFAULTS };

  constructor(userDataDir: string) {
    this.file = path.join(userDataDir, "settings.json");
  }

  async load(): Promise<Settings> {
    try {
      const raw = JSON.parse(await fs.readFile(this.file, "utf8"));
      this.data = { ...DEFAULTS, ...raw };
      if (!DEVELOPMENT) this.data.apiBase = DEFAULTS.apiBase;
    } catch {
      this.data = { ...DEFAULTS };
    }
    return this.data;
  }

  get(): Settings {
    return this.data;
  }

  async patch(update: Partial<Settings>): Promise<Settings> {
    const safeUpdate = DEVELOPMENT ? update : { ...update, apiBase: DEFAULTS.apiBase };
    this.data = {
      ...this.data,
      ...safeUpdate,
      activeSkins: { ...this.data.activeSkins, ...(safeUpdate.activeSkins ?? {}) },
      appPaths: { ...this.data.appPaths, ...(safeUpdate.appPaths ?? {}) },
      ports: { ...this.data.ports, ...(safeUpdate.ports ?? {}) },
    };
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(this.data, null, 2), "utf8");
    return this.data;
  }
}
