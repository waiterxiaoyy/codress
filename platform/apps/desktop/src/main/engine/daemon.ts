import { EventEmitter } from "node:events";
import type { AdapterDefinition } from "../adapters";
import {
  CdpSession,
  listPageTargets,
  probeSession,
  waitForProbe,
} from "./cdp";
import type { BuiltPayload } from "./payload";
import { earlyPayloadFor, removeExpression } from "./payload";
import { verifyExpression, verifyRemovedExpression, type VerifyResult } from "./verify";

interface SessionRecord {
  session: CdpSession;
  earlyScriptIds: Set<string>;
  appliedRevision: string | null;
}

export type DaemonState = "stopped" | "running" | "paused";

/**
 * 每个目标应用一个守护:轮询 CDP 目标 → 新窗口自动注入(含早注入)→
 * 换肤 = setPayload 热更新所有会话 → 暂停/恢复 → 停止时摘干净。
 */
export class AppDaemon extends EventEmitter {
  readonly adapter: AdapterDefinition;
  port: number;
  private payload: BuiltPayload | null = null;
  private sessions = new Map<string, SessionRecord>();
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  state: DaemonState = "stopped";
  lastVerify: VerifyResult | null = null;

  constructor(adapter: AdapterDefinition, port: number) {
    super();
    this.adapter = adapter;
    this.port = port;
  }

  get sessionCount() {
    return this.sessions.size;
  }

  get currentRevision() {
    return this.payload?.revision ?? null;
  }

  start(payload: BuiltPayload) {
    this.payload = payload;
    this.state = "running";
    if (!this.timer) {
      this.timer = setInterval(() => void this.poll(), 900);
      void this.poll();
    }
    this.emit("status");
  }

  /** 一键切换的核心:替换 payload 并热更新所有已连接会话。 */
  async setPayload(payload: BuiltPayload): Promise<VerifyResult | null> {
    this.payload = payload;
    this.state = "running";
    let verify: VerifyResult | null = null;
    for (const [id, record] of this.sessions) {
      try {
        await this.installEarly(record, payload);
        await record.session.evaluate(payload.payload, 15000);
        record.appliedRevision = payload.revision;
        verify = await this.verifySession(record);
      } catch (error) {
        this.emit("log", `apply failed on ${id}: ${(error as Error).message}`);
        this.dropSession(id);
      }
    }
    this.emit("status");
    return verify;
  }

  async pause() {
    this.state = "paused";
    for (const [id, record] of this.sessions) {
      try {
        await this.clearEarly(record);
        await record.session.evaluate(removeExpression(this.adapter), 8000);
        await record.session.evaluate<boolean>(verifyRemovedExpression(this.adapter), 5000);
        record.appliedRevision = null;
      } catch (error) {
        this.emit("log", `pause failed on ${id}: ${(error as Error).message}`);
      }
    }
    this.emit("status");
  }

  async resume(): Promise<VerifyResult | null> {
    if (!this.payload) return null;
    this.state = "running";
    return this.setPayload(this.payload);
  }

  async stop({ removeSkin = true } = {}) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const [, record] of this.sessions) {
      try {
        await this.clearEarly(record);
        if (removeSkin && !record.session.closed) {
          await record.session.evaluate(removeExpression(this.adapter), 5000);
        }
      } catch { /* best effort */ }
      record.session.close();
    }
    this.sessions.clear();
    this.state = "stopped";
    this.emit("status");
  }

  private dropSession(id: string) {
    const record = this.sessions.get(id);
    if (record) {
      record.session.close();
      this.sessions.delete(id);
    }
  }

  private async installEarly(record: SessionRecord, payload: BuiltPayload) {
    await this.clearEarly(record);
    try {
      const result = await record.session.send("Page.addScriptToEvaluateOnNewDocument", {
        source: earlyPayloadFor(payload.payload, payload.revision, this.adapter),
      });
      if (result?.identifier) record.earlyScriptIds.add(String(result.identifier));
    } catch (error) {
      this.emit("log", `early injection unavailable: ${(error as Error).message}`);
    }
  }

  private async clearEarly(record: SessionRecord) {
    for (const identifier of [...record.earlyScriptIds]) {
      try {
        await record.session.send("Page.removeScriptToEvaluateOnNewDocument", { identifier }, 4000);
      } catch { /* best effort */ }
      record.earlyScriptIds.delete(identifier);
    }
  }

  private async verifySession(record: SessionRecord): Promise<VerifyResult | null> {
    const deadline = Date.now() + 8000;
    let last: VerifyResult | null = null;
    while (Date.now() < deadline) {
      try {
        last = await record.session.evaluate<VerifyResult>(verifyExpression(this.adapter), 6000);
      } catch {
        return null;
      }
      if (last?.pass) break;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    this.lastVerify = last;
    this.emit("verify", last);
    return last;
  }

  private async poll() {
    if (this.polling || this.state === "stopped") return;
    this.polling = true;
    try {
      let targets;
      try {
        targets = await listPageTargets(this.port, this.adapter.targetUrlPrefixes);
      } catch {
        // CDP 不可达:目标应用没开或没带调试端口,清空会话等待
        if (this.sessions.size) {
          for (const [, record] of this.sessions) record.session.close();
          this.sessions.clear();
          this.emit("status");
        }
        return;
      }
      const activeIds = new Set(targets.map((t) => t.id));
      for (const [id, record] of this.sessions) {
        if (!activeIds.has(id) || record.session.closed) {
          this.dropSession(id);
          this.emit("status");
        }
      }
      for (const target of targets) {
        if (this.sessions.has(target.id)) continue;
        let session: CdpSession | null = null;
        try {
          session = await new CdpSession(target, this.port).open();
          const probe = await probeSession(session, this.adapter);
          const confirmed = probe?.matched
            ? probe
            : await waitForProbe(session, this.adapter, 3000);
          if (!confirmed?.matched) {
            session.close();
            continue;
          }
          const record: SessionRecord = { session, earlyScriptIds: new Set(), appliedRevision: null };
          this.sessions.set(target.id, record);
          if (this.state === "running" && this.payload) {
            await this.installEarly(record, this.payload);
            await session.evaluate(this.payload.payload, 15000);
            record.appliedRevision = this.payload.revision;
            await this.verifySession(record);
            this.emit("log", `injected target ${target.id}`);
          }
          this.emit("status");
        } catch (error) {
          session?.close();
          this.sessions.delete(target.id);
          this.emit("log", `inject failed for ${target.id}: ${(error as Error).message}`);
        }
      }
    } finally {
      this.polling = false;
    }
  }
}
