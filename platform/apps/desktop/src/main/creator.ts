import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { safeStorage } from "electron";

export type CreatorKind = "theme" | "pet";

export interface CreatorAiConfigInput {
  protocol?: "openai" | "anthropic";
  label?: string;
  baseUrl: string;
  apiKey?: string;
  clearApiKey?: boolean;
  textModel: string;
  imageModel: string;
}

export interface CreatorAiConfigView {
  protocol: "openai" | "anthropic";
  label: string;
  baseUrl: string;
  textModel: string;
  imageModel: string;
  hasApiKey: boolean;
  maskedApiKey: string;
  secureStorageAvailable: boolean;
}

export interface CreatorDraft {
  id: string;
  kind: CreatorKind;
  name: string;
  brief: string;
  style: string;
  target: string;
  status: "draft" | "ready" | "generating" | "review" | "complete" | "failed";
  stage: number;
  createdAt: string;
  updatedAt: string;
}

interface StoredAiConfig {
  protocol: "openai" | "anthropic";
  label: string;
  authStyle: "bearer" | "x-api-key";
  baseUrl: string;
  textModel: string;
  imageModel: string;
  encryptedApiKey?: string;
}

const DEFAULT_AI: StoredAiConfig = {
  protocol: "openai",
  label: "手动配置",
  authStyle: "bearer",
  baseUrl: "https://api.openai.com/v1",
  textModel: "gpt-4.1-mini",
  imageModel: "gpt-image-1",
};

export interface DiscoveredProvider {
  id: string;
  family: "openai" | "anthropic";
  name: string;
  source: "cc-switch" | "codex" | "claude" | "environment";
  baseUrl: string;
  model: string;
  hasCredential: boolean;
  maskedCredential: string;
  importable: boolean;
  note: string;
}

interface DiscoveredSecret extends DiscoveredProvider {
  credential: string;
  authStyle: "bearer" | "x-api-key";
}

function cleanBaseUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" && !(/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/).test(url.origin)) {
    throw new Error("AI 服务地址必须使用 HTTPS；本机 localhost 可以使用 HTTP");
  }
  return url.toString().replace(/\/$/, "");
}

/** 用户创作资料只落在 userData；密钥由系统钥匙串能力加密，渲染层永不读回明文。 */
export class CreatorWorkspace {
  private readonly configFile: string;
  private readonly draftsFile: string;
  private config: StoredAiConfig = { ...DEFAULT_AI };
  private drafts: CreatorDraft[] = [];
  private discovered = new Map<string, DiscoveredSecret>();

  constructor(userDataDir: string) {
    const root = path.join(userDataDir, "creator");
    this.configFile = path.join(root, "ai.json");
    this.draftsFile = path.join(root, "drafts.json");
  }

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await fs.readFile(this.configFile, "utf8")) as Partial<StoredAiConfig>;
      this.config = { ...DEFAULT_AI, ...raw };
    } catch {
      this.config = { ...DEFAULT_AI };
    }
    try {
      const raw = JSON.parse(await fs.readFile(this.draftsFile, "utf8"));
      this.drafts = Array.isArray(raw) ? raw : [];
    } catch {
      this.drafts = [];
    }
  }

  getConfig(): CreatorAiConfigView {
    const key = this.decryptKey();
    return {
      protocol: this.config.protocol,
      label: this.config.label,
      baseUrl: this.config.baseUrl,
      textModel: this.config.textModel,
      imageModel: this.config.imageModel,
      hasApiKey: Boolean(key),
      maskedApiKey: key ? `••••${key.slice(-4)}` : "",
      secureStorageAvailable: safeStorage.isEncryptionAvailable(),
    };
  }

  async saveConfig(input: CreatorAiConfigInput): Promise<CreatorAiConfigView> {
    const nextProtocol = input.protocol ?? this.config.protocol;
    const next: StoredAiConfig = {
      ...this.config,
      protocol: nextProtocol,
      label: input.label?.trim() || this.config.label,
      authStyle: input.protocol && input.protocol !== this.config.protocol
        ? (nextProtocol === "anthropic" ? "x-api-key" : "bearer")
        : this.config.authStyle,
      baseUrl: cleanBaseUrl(input.baseUrl),
      textModel: input.textModel.trim(),
      imageModel: input.imageModel.trim(),
    };
    if (!next.textModel || !next.imageModel) throw new Error("请填写文本模型和图片模型");
    if (input.clearApiKey) delete next.encryptedApiKey;
    if (input.apiKey?.trim()) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("当前系统无法安全保存密钥，请先启用系统钥匙串");
      }
      next.encryptedApiKey = safeStorage.encryptString(input.apiKey.trim()).toString("base64");
    }
    this.config = next;
    await this.writeJson(this.configFile, next);
    return this.getConfig();
  }

  async testConnection(): Promise<{ ok: boolean; message: string }>{
    const models = await this.listModels();
    return { ok: true, message: `连接成功，发现 ${models.length} 个模型` };
  }

  async listModels(): Promise<string[]> {
    const key = this.decryptKey();
    if (!key) throw new Error("请先保存 API Key");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const url = this.modelsUrl();
      const headers: Record<string, string> = this.config.authStyle === "x-api-key"
        ? { "x-api-key": key, "anthropic-version": "2023-06-01" }
        : { Authorization: `Bearer ${key}` };
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`模型列表请求失败（HTTP ${response.status}）`);
      }
      const body = await response.json() as { data?: Array<{ id?: string }>; models?: Array<{ id?: string; name?: string }> };
      const rows: Array<{ id?: string; name?: string }> = body.data ?? body.models ?? [];
      return [...new Set(rows.map((item) => item.id ?? item.name ?? "").filter(Boolean))].sort();
    } catch (error) {
      if ((error as Error).name === "AbortError") throw new Error("连接超时，请检查服务地址");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async discoverProviders(): Promise<DiscoveredProvider[]> {
    this.discovered.clear();
    const home = os.homedir();
    const ccSettings = await this.readJson(path.join(home, ".cc-switch", "settings.json"));
    const ccInstalled = Boolean(ccSettings);

    const codexHome = process.env.CODEX_HOME || path.join(home, ".codex");
    const codexText = await fs.readFile(path.join(codexHome, "config.toml"), "utf8").catch(() => "");
    const codex = this.parseCodexConfig(codexText);
    const codexAuth = await this.readJson(path.join(codexHome, "auth.json"));
    const codexKey = this.stringValue(codexAuth?.OPENAI_API_KEY) || this.envValue(codex.envKey) || this.envValue("OPENAI_API_KEY");
    const codexOfficialOauth = !codexKey && Boolean((codexAuth?.tokens as Record<string, unknown> | undefined)?.access_token);
    if (codexText || codexAuth) {
      this.addDiscovered({
        id: "codex-active",
        family: "openai",
        name: ccInstalled ? "CC Switch · 当前 Codex" : "Codex 当前配置",
        source: ccInstalled ? "cc-switch" : "codex",
        baseUrl: codex.baseUrl || "https://api.openai.com/v1",
        model: codex.model,
        credential: codexKey,
        authStyle: "bearer",
        note: codexOfficialOauth ? "当前是 ChatGPT/Codex OAuth 登录，访问令牌不会导入为 API Key" : "读取 Codex 当前生效配置",
      });
    }

    const claude = await this.readJson(path.join(home, ".claude", "settings.json"));
    const claudeEnv = (claude?.env && typeof claude.env === "object" ? claude.env : {}) as Record<string, unknown>;
    const claudeApiKey = this.stringValue(claudeEnv.ANTHROPIC_API_KEY) || this.envValue("ANTHROPIC_API_KEY");
    const claudeToken = this.stringValue(claudeEnv.ANTHROPIC_AUTH_TOKEN) || this.envValue("ANTHROPIC_AUTH_TOKEN");
    if (claude) {
      this.addDiscovered({
        id: "claude-active",
        family: "anthropic",
        name: ccInstalled ? "CC Switch · 当前 Claude" : "Claude 当前配置",
        source: ccInstalled ? "cc-switch" : "claude",
        baseUrl: this.stringValue(claudeEnv.ANTHROPIC_BASE_URL) || "https://api.anthropic.com",
        model: this.stringValue(claudeEnv.ANTHROPIC_MODEL) || this.stringValue(claude?.model),
        credential: claudeApiKey || claudeToken,
        authStyle: claudeApiKey ? "x-api-key" : "bearer",
        note: "读取 Claude settings.json 当前生效配置；主要用于文案和提示词",
      });
    }

    if (process.env.OPENAI_API_KEY && !codexKey) {
      this.addDiscovered({ id: "env-openai", family: "openai", name: "环境变量 · OpenAI", source: "environment", baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1", model: "", credential: process.env.OPENAI_API_KEY, authStyle: "bearer", note: "读取 Codress 进程继承的环境变量" });
    }
    if (process.env.ANTHROPIC_API_KEY && !claudeApiKey) {
      this.addDiscovered({ id: "env-anthropic", family: "anthropic", name: "环境变量 · Anthropic", source: "environment", baseUrl: process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com", model: "", credential: process.env.ANTHROPIC_API_KEY, authStyle: "x-api-key", note: "读取 Codress 进程继承的环境变量" });
    }
    return [...this.discovered.values()].map(({ credential: _credential, authStyle: _authStyle, ...item }) => item);
  }

  async importDiscovered(id: string): Promise<CreatorAiConfigView> {
    const item = this.discovered.get(id);
    if (!item) throw new Error("配置已变化，请重新扫描");
    if (!item.credential) throw new Error(item.note || "该配置没有可复用的 API Key");
    if (!safeStorage.isEncryptionAvailable()) throw new Error("当前系统无法安全保存密钥");
    this.config = {
      ...this.config,
      protocol: item.family,
      label: item.name,
      authStyle: item.authStyle,
      baseUrl: cleanBaseUrl(item.baseUrl),
      textModel: item.model || this.config.textModel,
      encryptedApiKey: safeStorage.encryptString(item.credential).toString("base64"),
    };
    await this.writeJson(this.configFile, this.config);
    return this.getConfig();
  }

  listDrafts(): CreatorDraft[] {
    return [...this.drafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveDraft(input: Partial<CreatorDraft> & Pick<CreatorDraft, "kind" | "name" | "brief">): Promise<CreatorDraft> {
    const now = new Date().toISOString();
    const current = input.id ? this.drafts.find((item) => item.id === input.id) : undefined;
    const draft: CreatorDraft = {
      id: current?.id ?? randomUUID(),
      kind: input.kind,
      name: input.name.trim(),
      brief: input.brief.trim(),
      style: input.style?.trim() ?? current?.style ?? "",
      target: input.target?.trim() ?? current?.target ?? (input.kind === "theme" ? "codex" : "codex"),
      status: input.status ?? current?.status ?? "draft",
      stage: Math.max(0, input.stage ?? current?.stage ?? 0),
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    if (!draft.name || !draft.brief) throw new Error("名称和创作描述不能为空");
    this.drafts = current
      ? this.drafts.map((item) => item.id === current.id ? draft : item)
      : [draft, ...this.drafts];
    await this.writeJson(this.draftsFile, this.drafts);
    return draft;
  }

  async deleteDraft(id: string): Promise<void> {
    this.drafts = this.drafts.filter((item) => item.id !== id);
    await this.writeJson(this.draftsFile, this.drafts);
  }

  private decryptKey(): string {
    if (!this.config.encryptedApiKey || !safeStorage.isEncryptionAvailable()) return "";
    try {
      return safeStorage.decryptString(Buffer.from(this.config.encryptedApiKey, "base64"));
    } catch {
      return "";
    }
  }

  private modelsUrl(): string {
    const base = this.config.baseUrl.replace(/\/$/, "");
    if (this.config.protocol === "anthropic" && !/\/v\d+$/i.test(base)) return `${base}/v1/models`;
    return `${base}/models`;
  }

  private async readJson(file: string): Promise<Record<string, unknown> | null> {
    try {
      const value = JSON.parse(await fs.readFile(file, "utf8"));
      return value && typeof value === "object" ? value : null;
    } catch {
      return null;
    }
  }

  private parseCodexConfig(text: string): { model: string; baseUrl: string; envKey: string } {
    let section = "";
    let model = "";
    let provider = "openai";
    let openaiBase = "";
    const providers = new Map<string, { baseUrl: string; envKey: string }>();
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      const heading = line.match(/^\[model_providers\.([^\]]+)\]$/);
      if (heading) { section = heading[1]; continue; }
      if (/^\[/.test(line)) { section = ""; continue; }
      const match = line.match(/^([A-Za-z0-9_-]+)\s*=\s*["']([^"']*)["']/);
      if (!match) continue;
      const [, key, value] = match;
      if (!section && key === "model") model = value;
      if (!section && key === "model_provider") provider = value;
      if (!section && key === "openai_base_url") openaiBase = value;
      if (section) {
        const entry = providers.get(section) ?? { baseUrl: "", envKey: "" };
        if (key === "base_url") entry.baseUrl = value;
        if (key === "env_key") entry.envKey = value;
        providers.set(section, entry);
      }
    }
    const selected = providers.get(provider);
    return { model, baseUrl: provider === "openai" ? openaiBase : selected?.baseUrl ?? "", envKey: selected?.envKey ?? "" };
  }

  private addDiscovered(input: Omit<DiscoveredSecret, "hasCredential" | "maskedCredential" | "importable">): void {
    const credential = input.credential.trim();
    this.discovered.set(input.id, {
      ...input,
      credential,
      hasCredential: Boolean(credential),
      maskedCredential: credential ? `••••${credential.slice(-4)}` : "",
      importable: Boolean(credential),
    });
  }

  private stringValue(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
  }

  private envValue(name: string): string {
    return name ? process.env[name]?.trim() ?? "" : "";
  }

  private async writeJson(file: string, value: unknown): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
  }
}
