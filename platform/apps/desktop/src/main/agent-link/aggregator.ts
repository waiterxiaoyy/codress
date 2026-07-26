import { EventEmitter } from "node:events";
import path from "node:path";

export type AgentPersistentState = "idle" | "running" | "waiting";
export type AgentTransient = "greet" | "failed" | "celebrate";

/** 桥上报的瘦身事件:只有状态语义,不携带任何 prompt/工具内容。 */
export interface AgentEvent {
  src: string;
  sessionId: string;
  event: string;
  cwd?: string;
  isError?: boolean;
  /** Notification 事件的结构化类型(如 idle_prompt),用于区分闲置提醒与权限等待 */
  notificationType?: string;
}

export interface AgentSnapshot {
  state: AgentPersistentState;
  running: number;
  waiting: number;
  total: number;
  label: string;
  bubble: string | null;
  lastEventAt: number | null;
}

interface SessionRecord {
  src: string;
  state: AgentPersistentState;
  lastSeen: number;
  waitingSince: number;
  project: string;
}

/** running 靠 Pre/PostToolUse 心跳续期,超时说明会话被杀或 hook 丢失。 */
const RUNNING_HEARTBEAT_MS = 120_000;
/**
 * waiting 期间通常没有后续事件,需要长 TTL;取消路径由 PermissionDenied 即时解除,
 * 这里只兜"终端被直接杀掉"的幽灵会话,10 分钟足够。
 */
const WAITING_KEEP_MS = 10 * 60_000;
const SESSION_KEEP_MS = 5 * 60_000;
const SWEEP_INTERVAL_MS = 15_000;

/** 来源展示名(名牌/气泡用) */
const DISPLAY_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  "gemini-cli": "Gemini CLI",
  "kimi-code": "Kimi Code",
  codex: "Codex",
};

/**
 * 各家事件名归一化到 Claude 语义:Gemini 用 Before/After 命名,
 * Codex notify 只有 agent-turn-complete,Kimi 的 PermissionResult 兼作取消信号
 * (允许时下一个工具事件毫秒级切回 running,空档不可见)。
 */
const EVENT_ALIASES: Record<string, string> = {
  BeforeAgent: "UserPromptSubmit",
  BeforeModel: "PreToolUse",
  BeforeTool: "PreToolUse",
  BeforeToolSelection: "PreToolUse",
  AfterModel: "PostToolUse",
  AfterTool: "PostToolUse",
  AfterAgent: "Stop",
  "agent-turn-complete": "Stop",
  PermissionResult: "PermissionDenied",
};

/**
 * 多会话/多来源状态聚合:宠物只有一个身体,动画取聚合后的最高优先级状态,
 * 明细(计数/项目名)进名牌与气泡。waiting 压过 running:有会话在等用户,
 * 比"别的会话还在跑"更值得被看见。
 */
export class AgentStateAggregator extends EventEmitter {
  private sessions = new Map<string, SessionRecord>();
  private sweeper: NodeJS.Timeout | null = null;
  private lastSnapshotKey = "";
  private lastEventAt: number | null = null;

  start() {
    if (this.sweeper) return;
    this.sweeper = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweeper.unref();
  }

  stop() {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
  }

  reset() {
    this.sessions.clear();
    this.lastEventAt = null;
    this.publish();
  }

  ingest(event: AgentEvent) {
    const now = Date.now();
    this.lastEventAt = now;
    const key = `${event.src}:${event.sessionId}`;
    const project = event.cwd ? path.basename(event.cwd) : "";
    let record = this.sessions.get(key);
    if (!record) {
      record = { src: event.src, state: "idle", lastSeen: now, waitingSince: 0, project };
      this.sessions.set(key, record);
    }
    record.lastSeen = now;
    if (project) record.project = project;

    switch (EVENT_ALIASES[event.event] ?? event.event) {
      case "SessionStart":
        record.state = "idle";
        this.emit("transient", "greet" satisfies AgentTransient);
        break;
      case "UserPromptSubmit":
      case "PreToolUse":
        record.state = "running";
        break;
      case "PostToolUse":
        record.state = "running";
        if (event.isError) this.emit("transient", "failed" satisfies AgentTransient);
        break;
      case "PostToolUseFailure":
        record.state = "running";
        this.emit("transient", "failed" satisfies AgentTransient);
        break;
      case "PermissionRequest":
        record.state = "waiting";
        record.waitingSince = now;
        break;
      case "PermissionDenied":
        // 用户拒绝/取消:等待立即解除。回合若继续,下一个工具事件毫秒级切回 running
        record.state = "idle";
        break;
      case "Notification":
        if (event.notificationType === "idle_prompt") {
          // "Claude is waiting for your input" = 没有活跃回合。
          // 这是 Esc 中断 running 后唯一的官方信号(中断不触发 Stop),用它归位;
          // waiting(权限弹窗仍挂着)不受闲置提醒影响。
          if (record.state === "running") record.state = "idle";
        } else {
          record.state = "waiting";
          record.waitingSince = now;
        }
        break;
      case "Stop": {
        record.state = "idle";
        // 庆祝只属于收尾:还有别的会话在跑/在等时不庆祝
        let othersActive = false;
        for (const session of this.sessions.values()) {
          if (session !== record && session.state !== "idle") othersActive = true;
        }
        if (!othersActive) this.emit("transient", "celebrate" satisfies AgentTransient);
        break;
      }
      case "StopFailure":
        // 回合以失败收场(Kimi):安静归位 + 失败表情,不庆祝
        record.state = "idle";
        this.emit("transient", "failed" satisfies AgentTransient);
        break;
      case "SessionEnd":
        this.sessions.delete(key);
        break;
      default:
        // 未知/新增事件只当作心跳,不改变状态
        break;
    }
    this.publish();
  }

  snapshot(): AgentSnapshot {
    let running = 0;
    let waiting = 0;
    let waitingProject = "";
    let oldestWaitingSince = Number.POSITIVE_INFINITY;
    const activeSourceNames = new Set<string>();
    for (const session of this.sessions.values()) {
      if (session.state !== "idle") activeSourceNames.add(DISPLAY_NAMES[session.src] ?? session.src);
      if (session.state === "running") running += 1;
      if (session.state === "waiting") {
        waiting += 1;
        // 气泡文案选主:等得最久的会话优先展示
        if (session.waitingSince < oldestWaitingSince) {
          oldestWaitingSince = session.waitingSince;
          waitingProject = session.project;
        }
      }
    }
    const parts: string[] = [];
    if (running > 0) parts.push(`${running} 工作中`);
    if (waiting > 0) parts.push(`${waiting} 等确认`);
    return {
      state: waiting > 0 ? "waiting" : running > 0 ? "running" : "idle",
      running,
      waiting,
      total: this.sessions.size,
      label: parts.length > 0 ? `${[...activeSourceNames].join(" / ")} · ${parts.join(" · ")}` : "",
      bubble: waiting > 1
        ? `${waiting} 个会话在等你`
        : waiting === 1
          ? `${waitingProject || "Claude"} 在等你`
          : null,
      lastEventAt: this.lastEventAt,
    };
  }

  /** 每来源的运行/等待计数(接入卡片 UI 用)。 */
  sourceCounts(): Record<string, { running: number; waiting: number }> {
    const out: Record<string, { running: number; waiting: number }> = {};
    for (const session of this.sessions.values()) {
      const slot = (out[session.src] ??= { running: 0, waiting: 0 });
      if (session.state === "running") slot.running += 1;
      if (session.state === "waiting") slot.waiting += 1;
    }
    return out;
  }

  private sweep() {
    const now = Date.now();
    let dirty = false;
    for (const [key, session] of this.sessions) {
      if (session.state === "running" && now - session.lastSeen > RUNNING_HEARTBEAT_MS) {
        session.state = "idle";
        dirty = true;
      }
      const keepMs = session.state === "waiting" ? WAITING_KEEP_MS : SESSION_KEEP_MS;
      if (now - session.lastSeen > keepMs) {
        this.sessions.delete(key);
        dirty = true;
      }
    }
    if (dirty) this.publish();
  }

  private publish() {
    const snapshot = this.snapshot();
    const key = `${snapshot.state}|${snapshot.running}|${snapshot.waiting}|${snapshot.label}|${snapshot.bubble ?? ""}`;
    if (key === this.lastSnapshotKey) return;
    this.lastSnapshotKey = key;
    this.emit("snapshot", snapshot);
  }
}
