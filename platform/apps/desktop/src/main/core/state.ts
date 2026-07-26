import { promises as fs } from "node:fs";
import path from "node:path";

export interface AgentLinkSettings {
  /** 联动总开关:关闭后桥照收事件但不驱动宠物 */
  enabled: boolean;
  /** 兼容字段:Claude Code 首发时的记录,新代码同时写 sources */
  claudeCode: {
    linked: boolean;
    linkedAt: string | null;
  };
  /** 各来源接入记录(claude-code / gemini-cli / kimi-code / codex) */
  sources: Partial<Record<string, { linked: boolean; linkedAt: string | null }>>;
}

export interface Settings {
  apiBase: string;
  userToken: string | null;
  userName: string | null;
  activePet: string | null;
  activeSkins: Partial<Record<string, string | null>>;
  appPaths: Partial<Record<string, string>>;
  ports: Partial<Record<string, number>>;
  agentLink: AgentLinkSettings;
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
  agentLink: { enabled: true, claudeCode: { linked: false, linkedAt: null }, sources: {} },
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
      const raw = JSON.parse(await fs.readFile(this.file, "utf8")) as Partial<Settings>;
      this.data = {
        ...DEFAULTS,
        ...raw,
        agentLink: {
          ...DEFAULTS.agentLink,
          ...(raw.agentLink ?? {}),
          claudeCode: { ...DEFAULTS.agentLink.claudeCode, ...(raw.agentLink?.claudeCode ?? {}) },
          sources: { ...(raw.agentLink?.sources ?? {}) },
        },
      };
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
      agentLink: {
        ...this.data.agentLink,
        ...(safeUpdate.agentLink ?? {}),
        claudeCode: { ...this.data.agentLink.claudeCode, ...(safeUpdate.agentLink?.claudeCode ?? {}) },
        sources: { ...this.data.agentLink.sources, ...(safeUpdate.agentLink?.sources ?? {}) },
      },
    };
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(this.data, null, 2), "utf8");
    return this.data;
  }
}
