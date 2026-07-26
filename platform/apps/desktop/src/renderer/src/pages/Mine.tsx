import { useCallback, useEffect, useRef, useState } from "react";
import { bridge, type AdapterStatus, type AgentLinkStatus, type AgentSourceId, type LibrarySkinItem, type PetItem, type Settings as SettingsData } from "../bridge";
import { ButtonLoadingLabel } from "../components/StoreControls";
import { useToast } from "../toast";
import claudeIcon from "../assets/ccswitch-claude.svg";
import codexAgentIcon from "../assets/ccswitch-codex.svg";
import geminiIcon from "../assets/ccswitch-gemini.svg";
import kimiIcon from "../assets/ccswitch-kimi.svg";
import codexIcon from "../assets/codex.png";
import workbuddyIcon from "../assets/workbuddy.png";
const APP_IDS = ["codex", "workbuddy"] as const;
type AppId = (typeof APP_IDS)[number];

const APP_ICONS: Record<AppId, string> = {
  codex: codexIcon,
  workbuddy: workbuddyIcon,
};

const AGENT_ICONS: Record<AgentSourceId, string> = {
  "claude-code": claudeIcon,
  codex: codexAgentIcon,
  "gemini-cli": geminiIcon,
  "kimi-code": kimiIcon,
};

const IS_WINDOWS = navigator.userAgent.includes("Windows");

function pathExample(id: AppId) {
  if (IS_WINDOWS) {
    return id === "codex"
      ? "例如 C:\\Users\\you\\AppData\\Local\\Programs\\Codex\\Codex.exe"
      : "例如 C:\\Users\\you\\AppData\\Local\\Programs\\WorkBuddy\\WorkBuddy.exe";
  }
  return id === "codex"
    ? "例如 /Applications/ChatGPT.app 或 /Applications/Codex.app"
    : "例如 /Applications/WorkBuddy.app";
}

const SOURCE_HELP: Record<AgentSourceId, string> = {
  "claude-code": "完整 hooks：工作中、等确认、失败、完成都可同步。",
  codex: "Codex CLI 官方 notify 只提供回合完成信号，宠物会在完成时庆祝。",
  "gemini-cli": "接入 Gemini CLI hooks，同步工作中、等确认与完成状态。",
  "kimi-code": "接入 Kimi Code lifecycle hooks；Windows 依赖 Git Bash 执行脚本。",
};

export default function Mine() {
  const toast = useToast();
  const [installed, setInstalled] = useState<LibrarySkinItem[]>([]);
  const [localPets, setLocalPets] = useState<{ slug: string; name: string; installed: boolean; onDesktop: boolean }[]>([]);
  const [activeCodexPet, setActiveCodexPet] = useState<string | null>(null);
  const [link, setLink] = useState<AgentLinkStatus | null>(null);
  const [linkBusy, setLinkBusy] = useState<AgentSourceId | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [statuses, setStatuses] = useState<AdapterStatus[]>([]);
  const [pathDrafts, setPathDrafts] = useState<Record<string, string>>({});
  const [savingPath, setSavingPath] = useState<string | null>(null);
  const dirtyPaths = useRef(new Set<string>());

  const refreshSkins = useCallback(async () => {
    const [codexLib, workbuddyLib] = await Promise.all([
      bridge.libraryList("codex"),
      bridge.libraryList("workbuddy"),
    ]);
    setInstalled([...codexLib, ...workbuddyLib]);
  }, []);

  const refreshTargetApps = useCallback(async () => {
    const [nextSettings, nextStatuses] = await Promise.all([bridge.getSettings(), bridge.appStatus()]);
    setSettings(nextSettings);
    setStatuses(nextStatuses);
    setPathDrafts((current) => {
      const next = { ...current };
      for (const id of APP_IDS) {
        if (dirtyPaths.current.has(id)) continue;
        const detected = nextStatuses.find((status) => status.id === id)?.installPath ?? "";
        next[id] = detected || nextSettings.appPaths[id] || "";
      }
      return next;
    });
  }, []);

  /** 只同步本机宠物状态(上桌/安装),宠物名沿用已有数据,不重新请求远程商店列表。 */
  const refreshLocalPets = useCallback(async (petNames?: Map<string, string>) => {
    const settings = await bridge.getSettings();
    const [installedPetSlugs, codexPet] = await Promise.all([
      bridge.getInstalledPets(),
      bridge.getActivePetInCodex(),
    ]);
    const petSlugs = new Set(installedPetSlugs);
    if (settings.activePet) petSlugs.add(settings.activePet);
    setLocalPets((previous) => {
      const names = petNames ?? new Map(previous.map((pet) => [pet.slug, pet.name]));
      return Array.from(petSlugs).map((slug) => ({
        slug,
        name: names.get(slug) ?? slug,
        installed: installedPetSlugs.includes(slug),
        onDesktop: settings.activePet === slug,
      }));
    });
    setActiveCodexPet(codexPet);
  }, []);

  const refresh = useCallback(async () => {
    const petStore = await bridge.storePets({ target: "codex" }).catch(() => ({ items: [] as PetItem[], total: 0 }));
    const petNames = new Map(petStore.items.map((pet) => [pet.slug, pet.name]));
    await refreshLocalPets(petNames);
  }, [refreshLocalPets]);

  useEffect(() => {
    void Promise.all([refreshSkins(), refresh(), refreshTargetApps()]);
  }, [refresh, refreshSkins, refreshTargetApps]);

  useEffect(() => bridge.onLibraryChanged(refreshSkins), [refreshSkins]);
  // 宠物在其他入口(宠物窗口右键下桌、托盘、宠物商店页)变化时同步本页状态
  useEffect(() => bridge.onStatusChanged(refreshLocalPets), [refreshLocalPets]);
  useEffect(() => bridge.onStatusChanged(refreshTargetApps), [refreshTargetApps]);

  const refreshLink = useCallback(async () => {
    setLink(await bridge.agentLinkStatus().catch(() => null));
  }, []);
  // 联动状态轻量轮询:页面打开期间每 5s 刷新"最近事件/计数"
  useEffect(() => {
    void refreshLink();
    const timer = window.setInterval(() => void refreshLink(), 5000);
    return () => window.clearInterval(timer);
  }, [refreshLink]);

  const onLinkSource = async (id: AgentSourceId, name: string) => {
    setLinkBusy(id);
    try {
      const result = await bridge.linkAgentSource(id);
      if (result.ok) toast(`已接入 ${name}；已开着的会话需重启后生效`);
      else toast(result.message ?? "接入失败", true);
    } finally {
      setLinkBusy(null);
      void refreshLink();
    }
  };

  const onUnlinkSource = async (id: AgentSourceId, name: string) => {
    setLinkBusy(id);
    try {
      const result = await bridge.unlinkAgentSource(id);
      if (result.ok) toast(`已断开 ${name} 联动`);
      else toast(result.message ?? "断开失败", true);
    } finally {
      setLinkBusy(null);
      void refreshLink();
    }
  };

  const savePath = async (id: AppId) => {
    if (!settings) return;
    setSavingPath(id);
    try {
      const updated = await bridge.patchSettings({
        appPaths: { ...settings.appPaths, [id]: (pathDrafts[id] ?? "").trim() },
      });
      dirtyPaths.current.delete(id);
      setSettings(updated);
      await refreshTargetApps();
      toast("应用路径已保存");
    } finally {
      setSavingPath(null);
    }
  };

  const pickPath = async (id: AppId) => {
    const selected = await bridge.pickAppPath(id, pathDrafts[id]);
    if (!selected) return;
    dirtyPaths.current.add(id);
    setPathDrafts((current) => ({ ...current, [id]: selected }));
  };

  const creations = installed.filter((item) => item.source === "local");
  const cachedSkins = installed.filter((item) => item.source !== "local");
  const skinList = (items: LibrarySkinItem[], emptyText: string) => items.length === 0 ? (
    <div className="empty">{emptyText}</div>
  ) : (
    <div className="list">
      {items.map((item) => {
        const createdAt = item.createdAt ? new Date(item.createdAt) : null;
        const createdLabel = createdAt && Number.isFinite(createdAt.getTime())
          ? createdAt.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
          : "";
        return (
          <div className="list-row library-skin-row" key={`${item.target}-${item.slug}`}>
            <span className="library-skin-copy">
              <span>
                <strong>{item.name}</strong>
                {item.source === "local" && <em>我的创作</em>}
              </span>
              <small>
                {item.target}
                {item.appearance ? ` · ${item.appearance === "auto" ? "跟随系统" : item.appearance === "light" ? "浅色" : "深色"}` : ""}
                {item.customization ? " · 自定义构图与配色" : ""}
                {createdLabel ? ` · ${createdLabel}` : ""}
              </small>
            </span>
            <button
              className="btn small"
              onClick={() =>
                bridge.applySkin(item.target, item.slug).then((result) => {
                  if (result.ok) toast("已应用");
                  else toast(result.message ?? "应用失败", true);
                })
              }
            >
              应用
            </button>
          </div>
        );
      })}
    </div>
  );

  return (
    <div>
      <h1 className="page-title">我的</h1>
      <div className="muted" style={{ marginTop: 6, marginBottom: 20, fontSize: 12 }}>
        管理缓存在本机的皮肤和宠物，无需登录。
      </div>

      <div className="settings-section-heading">
        <div>
          <h2>目标应用</h2>
          <p>自动识别 Codex / WorkBuddy 的安装位置，也可以手动指定本机路径。</p>
        </div>
        <button className="btn ghost small" onClick={refreshTargetApps}>重新检测</button>
      </div>

      <div className="target-app-list">
        {APP_IDS.map((id) => {
          const status = statuses.find((item) => item.id === id);
          if (!status || !settings) return null;
          const configured = Boolean(settings.appPaths[id] && settings.appPaths[id] === pathDrafts[id]);
          return (
            <section className="target-app-card" key={id}>
              <div className="target-app-summary">
                <img className="target-app-icon" src={APP_ICONS[id]} alt="" />
                <div className="target-app-identity">
                  <div className="target-app-name-row">
                    <strong>{status.name}</strong>
                    <span className={`target-app-state ${status.installed ? "installed" : ""}`}>
                      {status.installed ? "已识别" : "未识别"}
                    </span>
                  </div>
                  <span className="target-app-connection">
                    <span className={`status-dot ${status.cdpReady ? "on" : ""}`} />
                    {status.cdpReady
                      ? `端口 ${status.port} 已连接 · ${status.sessions} 个窗口`
                      : status.installed
                        ? `端口 ${status.port} 待连接，应用皮肤时自动开启`
                        : `端口 ${status.port} 未连接`}
                  </span>
                </div>
              </div>

              <div className="target-path-area">
                <div className="target-path-label">
                  <span>{IS_WINDOWS ? "可执行文件路径" : "应用路径"}</span>
                  <span>{configured ? "手动指定" : status.installed ? "自动检测" : "等待设置"}</span>
                </div>
                <div className="target-path-controls">
                  <input
                    value={pathDrafts[id] ?? ""}
                    placeholder={pathExample(id)}
                    spellCheck={false}
                    onChange={(event) => {
                      dirtyPaths.current.add(id);
                      setPathDrafts((current) => ({ ...current, [id]: event.target.value }));
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void savePath(id);
                    }}
                  />
                  <button className="btn ghost" onClick={() => pickPath(id)}>选择</button>
                  <button
                    className="btn primary"
                    disabled={savingPath === id}
                    onClick={() => savePath(id)}
                  >
                    {savingPath === id ? <ButtonLoadingLabel>保存中…</ButtonLoadingLabel> : "保存"}
                  </button>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <div className="muted settings-note">
        皮肤通过本机回环 CDP 注入，只在你的电脑内通信；不会修改目标应用安装目录，恢复默认即可完全还原。
      </div>

      <hr className="divider" />
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>我的创作（{creations.length}）</h2>
      <div className="muted" style={{ marginBottom: 10, fontSize: 12 }}>
        通过本地创作区保存的作品，原图和调节参数只保存在这台电脑。
      </div>
      {skinList(creations, "还没有本地创作，去主题页点击“＋”开始制作")}

      <h2 style={{ fontSize: 16, marginTop: 22, marginBottom: 4 }}>已缓存皮肤（{cachedSkins.length}）</h2>
      <div className="muted" style={{ marginBottom: 10, fontSize: 12 }}>
        从商店应用后保存在本机的皮肤，可以快速重新应用。
      </div>
      {skinList(cachedSkins, "还没有缓存过商店皮肤")}

      <hr className="divider" />
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>本地宠物（{localPets.length}）</h2>
      <div className="muted" style={{ marginBottom: 10, fontSize: 12 }}>
        显示已安装到 Codex 的宠物，以及当前正在桌面运行的宠物。
      </div>
      {localPets.length === 0 ? (
        <div className="empty">还没有安装或上桌过宠物</div>
      ) : (
        <div className="list">
          {localPets.map((pet) => (
            <div className="list-row" key={pet.slug}>
              <span>
                {pet.name} <span className="muted">({pet.slug})</span>
              </span>
              <span className="row">
                {pet.installed && (
                  <span className="muted" style={{ fontSize: 11 }}>Codex 已安装</span>
                )}
                {pet.onDesktop && (
                  <span className="muted" style={{ fontSize: 11 }}>桌面运行中</span>
                )}
                {pet.installed && (
                  <button
                    className="btn small"
                    disabled={activeCodexPet === pet.slug}
                    onClick={async () => {
                      const result = await bridge.activatePetInCodex(pet.slug);
                      if (result.ok) {
                        setActiveCodexPet(pet.slug);
                        toast("已设为 Codex 当前宠物");
                      } else toast(result.message ?? "启用失败", true);
                    }}
                  >
                    {activeCodexPet === pet.slug ? "已启用" : "在 Codex 启用"}
                  </button>
                )}
                <button
                  className="btn small ghost"
                  onClick={async () => {
                    await bridge.setPet(pet.onDesktop ? null : pet.slug);
                    toast(pet.onDesktop ? "宠物已收起" : "宠物已上桌");
                    void refreshLocalPets();
                  }}
                >
                  {pet.onDesktop ? "收起" : "上桌"}
                </button>
                {pet.installed && (
                  <button
                    className="btn small ghost"
                    onClick={async () => {
                      const result = await bridge.uninstallPetFromCodex(pet.slug);
                      if (result.ok) {
                        toast("已从 Codex 卸载");
                        void refreshLocalPets();
                      } else toast(result.message ?? "卸载失败", true);
                    }}
                  >
                    卸载
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      <hr className="divider" />
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>编码助手联动</h2>
      <div className="muted" style={{ marginBottom: 10, fontSize: 12 }}>
        让桌面宠物实时反映编码 Agent 的状态：干活小跑、等确认举手、完成庆祝。全程本机通信，不上传任何代码或对话内容。
      </div>
      <div className="list">
        {(link?.sources ?? []).map((source) => {
          const busy = linkBusy === source.id;
          const recent = link?.lastEventAt
            ? new Date(link.lastEventAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
            : "";
          const detail = !source.detected
            ? `未检测到 ${source.name}，仍可预先接入`
            : source.linked
              ? source.running > 0 || source.waiting > 0
                ? [
                    source.running > 0 ? `${source.running} 工作中` : "",
                    source.waiting > 0 ? `${source.waiting} 等确认` : "",
                  ].filter(Boolean).join(" · ")
                : recent
                  ? `已联通 · 最近事件 ${recent}`
                  : "已接入 · 等待首个事件"
              : "已检测到，未接入";
          return (
            <div className="list-row agent-source-row" key={source.id}>
              <span className="agent-source-main">
                <span className="agent-source-icon">
                  <img src={AGENT_ICONS[source.id]} alt="" />
                </span>
                <span className="agent-source-copy">
                  <strong>{source.name}</strong>
                  <span className="muted">{detail}</span>
                  <span className="muted">{source.partial || SOURCE_HELP[source.id]}</span>
                </span>
              </span>
              <span className="row">
                {source.linked ? (
                  <button className="btn small ghost" disabled={Boolean(linkBusy)} onClick={() => onUnlinkSource(source.id, source.name)}>
                    {busy ? <ButtonLoadingLabel>断开中…</ButtonLoadingLabel> : "断开联动"}
                  </button>
                ) : (
                  <button className="btn small" disabled={Boolean(linkBusy)} onClick={() => onLinkSource(source.id, source.name)}>
                    {busy ? <ButtonLoadingLabel>接入中…</ButtonLoadingLabel> : "一键接入"}
                  </button>
                )}
              </span>
            </div>
          );
        })}
        {!link && (
          <div className="list-row">
            <span>
              <strong>检测中…</strong>
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>正在读取本机编码助手安装状态</div>
            </span>
          </div>
        )}
      </div>
      {link && link.sources.some((source) => !source.linked) && (
        <div className="muted" style={{ marginTop: 8, fontSize: 11 }}>
          接入会写入各 CLI 的用户级配置并在 ~/.codress 放置本机转发脚本；断开会移除 Codress 标记的配置，保留用户自己的 hooks。
        </div>
      )}

    </div>
  );
}
