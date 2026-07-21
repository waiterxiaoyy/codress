import WebSocket from "ws";
import type { AdapterDefinition } from "../adapters";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const CDP_ID_PATTERN = /^[A-Za-z0-9._-]{1,200}$/;

export interface CdpTargetInfo {
  id: string;
  type: string;
  url: string;
  title?: string;
  webSocketDebuggerUrl?: string;
}

/** 只接受"回环地址 + /devtools/page/<id>"形状的调试 WebSocket URL,防止被劫持到别处。 */
export function validateDebuggerUrl(target: CdpTargetInfo, port: number): string {
  if (!target.webSocketDebuggerUrl) throw new Error("target has no webSocketDebuggerUrl");
  const url = new URL(target.webSocketDebuggerUrl);
  const pathOk = /^\/devtools\/page\/[A-Za-z0-9._-]{1,200}$/.test(url.pathname);
  if (
    url.protocol !== "ws:" || !LOOPBACK_HOSTS.has(url.hostname) || Number(url.port) !== port ||
    url.username || url.password || url.search || url.hash || !pathOk
  ) {
    throw new Error("rejected a CDP WebSocket URL outside the allowed loopback page endpoint shape");
  }
  return url.href;
}

export function isValidPageTarget(
  target: CdpTargetInfo,
  port: number,
  urlPrefixes: string[]
): boolean {
  if (target?.type !== "page" || typeof target.id !== "string" || !CDP_ID_PATTERN.test(target.id)) {
    return false;
  }
  if (urlPrefixes.length > 0 && !urlPrefixes.some((prefix) => target.url?.startsWith(prefix))) {
    return false;
  }
  try {
    const href = validateDebuggerUrl(target, port);
    return new URL(href).pathname === `/devtools/page/${target.id}`;
  } catch {
    return false;
  }
}

export async function listPageTargets(port: number, urlPrefixes: string[]): Promise<CdpTargetInfo[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/json/list`, {
      redirect: "error",
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const targets = (await resp.json()) as CdpTargetInfo[];
    if (!Array.isArray(targets)) throw new Error("CDP target list was not an array");
    return targets.filter((t) => isValidPageTarget(t, port, urlPrefixes));
  } finally {
    clearTimeout(timer);
  }
}

export async function cdpReady(port: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/json/version`, {
      redirect: "error",
      signal: controller.signal,
    });
    return resp.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

interface Waiter {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class CdpSession {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, Waiter>();
  closed = false;

  constructor(target: CdpTargetInfo, port: number) {
    this.ws = new WebSocket(validateDebuggerUrl(target, port));
  }

  async open(): Promise<this> {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        try { this.ws.close(); } catch { /* noop */ }
        reject(new Error("CDP WebSocket open timed out"));
      }, 5000);
      this.ws.once("open", () => { clearTimeout(timeout); resolve(); });
      this.ws.once("error", () => { clearTimeout(timeout); reject(new Error("CDP WebSocket open failed")); });
    });
    this.ws.on("message", (data) => this.onMessage(String(data)));
    this.ws.on("error", () => this.close());
    this.ws.on("close", () => {
      this.closed = true;
      for (const waiter of this.pending.values()) {
        clearTimeout(waiter.timeout);
        waiter.reject(new Error("CDP socket closed"));
      }
      this.pending.clear();
    });
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    return this;
  }

  private onMessage(raw: string) {
    let message: { id?: number; error?: { message: string; code: number }; result?: unknown };
    try {
      message = JSON.parse(raw);
    } catch {
      this.close();
      return;
    }
    if (!message || typeof message !== "object") {
      this.close();
      return;
    }
    if (message.id) {
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      clearTimeout(waiter.timeout);
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`${message.error.message} (${message.error.code})`));
      else waiter.resolve(message.result);
    }
  }

  send(method: string, params: Record<string, unknown> = {}, timeoutMs = 10000): Promise<any> {
    if (this.closed) return Promise.reject(new Error("CDP session is closed"));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error as Error);
      }
    });
  }

  async evaluate<T = unknown>(expression: string, timeoutMs = 10000): Promise<T> {
    const result = await this.send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true, userGesture: false },
      timeoutMs
    );
    if (result?.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`renderer evaluation failed: ${detail}`);
    }
    return result?.result?.value as T;
  }

  close() {
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error("CDP session closed"));
    }
    this.pending.clear();
    if (!this.closed) {
      try { this.ws.close(); } catch { /* noop */ }
    }
    this.closed = true;
  }
}

export interface ProbeResult {
  title: string;
  href: string;
  markers: Record<string, boolean>;
  matched: boolean;
}

/** 用 adapter 的 DOM 标记确认这是目标应用的页面。 */
export function probeExpression(adapter: AdapterDefinition): string {
  const entries = Object.entries(adapter.probeMarkers.required)
    .map(([key, selector]) => `${JSON.stringify(key)}: Boolean(document.querySelector(${JSON.stringify(selector)}))`)
    .join(",");
  const titleCheck = adapter.probeMarkers.title
    ? `document.title === ${JSON.stringify(adapter.probeMarkers.title)} && `
    : "";
  // WorkBuddy 额外校验 URL：必须是 app.asar/renderer/index.html
  const urlCheck = adapter.id === "workbuddy"
    ? `/\\/app\\.asar\\/renderer\\/index\\.html$/i.test(location.pathname) && `
    : "";
  return `(() => {
    const markers = {${entries}};
    return {
      title: document.title,
      href: location.href,
      markers,
      matched: ${urlCheck}${titleCheck}Object.values(markers).every(Boolean),
    };
  })()`;
}

export async function probeSession(session: CdpSession, adapter: AdapterDefinition): Promise<ProbeResult | null> {
  try {
    return await session.evaluate<ProbeResult>(probeExpression(adapter));
  } catch {
    return null;
  }
}

export async function waitForProbe(
  session: CdpSession,
  adapter: AdapterDefinition,
  timeoutMs = 4000
): Promise<ProbeResult | null> {
  const deadline = Date.now() + timeoutMs;
  let last: ProbeResult | null = null;
  while (Date.now() < deadline) {
    last = await probeSession(session, adapter);
    if (last?.matched) return last;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return last;
}
