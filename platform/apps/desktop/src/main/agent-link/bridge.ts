import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AgentEvent } from "./aggregator";
import { codressDir } from "./paths";

const MAX_BODY_BYTES = 1024 * 1024;
const TOKEN_HEADER = "x-codress-token";

/**
 * 本地事件桥:hook 脚本把 Claude Code 的 hook JSON POST 到这里。
 * - 只绑定 127.0.0.1,端口随机分配,写入 ~/.codress/bridge.port|token 供脚本读取
 *   (端口每次启动重写,settings.json 里的 hooks 永不过期)
 * - 自定义头校验 token:浏览器跨域发不出自定义头,天然阻断网页对 localhost 的探测
 * - 隐私铁律:收到的 payload 只提取状态字段后立即丢弃,不落盘不转发
 */
export class AgentLinkBridge {
  private server: http.Server | null = null;
  private token: Buffer = Buffer.alloc(0);
  port: number | null = null;

  constructor(private readonly onEvent: (event: AgentEvent) => void) {}

  get running(): boolean {
    return this.server !== null;
  }

  private configDir(): string {
    return codressDir();
  }

  async start(): Promise<void> {
    if (this.server) return;
    this.token = Buffer.from(randomBytes(24).toString("hex"), "utf8");
    const server = http.createServer((request, response) => this.handle(request, response));
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address !== "object") {
      server.close();
      throw new Error("agent-link 端口分配失败");
    }
    this.server = server;
    this.port = address.port;
    await fs.mkdir(this.configDir(), { recursive: true });
    await fs.writeFile(path.join(this.configDir(), "bridge.port"), String(this.port), "utf8");
    await fs.writeFile(path.join(this.configDir(), "bridge.token"), this.token.toString("utf8"), {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = null;
    this.port = null;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // 删掉端口文件避免残留脚本 POST 到未来别的进程;token 一并清理
    await fs.rm(path.join(this.configDir(), "bridge.port"), { force: true }).catch(() => undefined);
    await fs.rm(path.join(this.configDir(), "bridge.token"), { force: true }).catch(() => undefined);
  }

  private authorized(request: http.IncomingMessage): boolean {
    const header = request.headers[TOKEN_HEADER];
    if (typeof header !== "string" || this.token.length === 0) return false;
    const provided = Buffer.from(header, "utf8");
    if (provided.length !== this.token.length) return false;
    return timingSafeEqual(provided, this.token);
  }

  private handle(request: http.IncomingMessage, response: http.ServerResponse) {
    if (request.method !== "POST" || !request.url || !request.url.startsWith("/v1/agent-events")) {
      response.statusCode = 404;
      response.end();
      return;
    }
    if (!this.authorized(request)) {
      response.statusCode = 403;
      response.end();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let aborted = false;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        response.statusCode = 413;
        response.end();
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (aborted) return;
      // 先应答再解析:hook 侧 curl --max-time 1,绝不让解析拖住 Claude Code
      response.statusCode = 204;
      response.end();
      this.dispatch(request.url!, Buffer.concat(chunks));
    });
    request.on("error", () => undefined);
  }

  private dispatch(url: string, body: Buffer) {
    try {
      const query = new URL(url, "http://127.0.0.1").searchParams;
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
      } catch {
        // body 缺失/损坏时仍按 query 的事件名处理
      }
      const eventName = typeof payload.hook_event_name === "string" && payload.hook_event_name
        ? payload.hook_event_name
        : typeof payload.type === "string" && payload.type
          ? payload.type
          : query.get("event") ?? "";
      // 会话标识按来源能力降级:标准 hooks 有 session_id,Codex notify 是 thread-id,
      // payload 不可解析时(Windows argv 传参)退回 query sid / 单一伪会话
      const sessionId = typeof payload.session_id === "string" && payload.session_id
        ? payload.session_id
        : typeof payload["thread-id"] === "string" && payload["thread-id"]
          ? (payload["thread-id"] as string)
          : query.get("sid") || "default";
      if (!eventName) return;
      const toolResponse = payload.tool_response;
      const isError = Boolean(
        toolResponse
        && typeof toolResponse === "object"
        && ((toolResponse as { is_error?: unknown }).is_error === true
          || (toolResponse as { success?: unknown }).success === false),
      );
      this.onEvent({
        src: query.get("src") || "claude-code",
        sessionId,
        event: eventName,
        cwd: typeof payload.cwd === "string" ? payload.cwd : undefined,
        isError,
        notificationType: typeof payload.notificationType === "string" ? payload.notificationType : undefined,
      });
      // payload(可能含 tool_input 代码片段)就地丢弃,不留任何副本
    } catch {
      // 单个事件解析失败直接忽略,桥保持存活
    }
  }
}
