import { useCallback, useEffect, useMemo, useState } from "react";
import { bridge, type AdapterStatus, type SkinItem } from "../bridge";
import { useToast } from "../toast";
import codexIcon from "../assets/codex.png";
import workbuddyIcon from "../assets/workbuddy.png";

const TARGETS = [
  { id: "codex", label: "Codex", icon: codexIcon },
  { id: "workbuddy", label: "WorkBuddy", icon: workbuddyIcon },
];

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5l4 4" />
    </svg>
  );
}

function CdpBadge({ status }: { status: AdapterStatus | null }) {
  if (!status) return null;
  const ready = status.cdpReady;
  const label = !status.installed
    ? `${status.name} 未检测到`
    : ready
      ? `${status.name} 通道已就绪 · ${status.sessions} 窗口`
      : `${status.name} 已安装，待连接`;
  return (
    <span className={`cdp-badge ${ready ? "ready" : ""}`}>
      <span className={`status-dot ${ready ? "on" : ""}`} />
      {label}
    </span>
  );
}

function RestartModal({
  skinName,
  appName,
  onConfirm,
  onCancel,
}: {
  skinName: string;
  appName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">需要重启 {appName}</div>
        <div className="modal-body">
          「{skinName}」需要 {appName} 开启皮肤通道才能注入。<br />
          确认后 {appName} 将自动重启（未保存的输入可能丢失），重启后皮肤立即生效。
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel}>取消</button>
          <button className="btn primary" onClick={onConfirm}>重启并应用</button>
        </div>
      </div>
    </div>
  );
}

export default function Themes() {
  const toast = useToast();
  const [target, setTarget] = useState("codex");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<{ slug: string; name: string }[]>([]);
  const [skins, setSkins] = useState<SkinItem[]>([]);
  const [status, setStatus] = useState<AdapterStatus | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [search, setSearch] = useState("");
  const [restartPending, setRestartPending] = useState<{ slug: string; name: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [skinList, categoryList, appStatus, settings] = await Promise.all([
        bridge.storeSkins({ target, category: category || undefined }),
        bridge.storeCategories("skin"),
        bridge.appStatus(),
        bridge.getSettings(),
      ]);
      setSkins(skinList.items);
      setCategories(categoryList.items);
      setStatus(appStatus.find((s) => s.id === target) ?? null);
      setLoggedIn(Boolean(settings.userToken));
      if (settings.userToken) {
        const favs = await bridge.favorites().catch(() => ({ items: [] }));
        setFavorites(new Set(favs.items.filter((f) => f.itemType === "skin").map((f) => f.itemSlug)));
      }
    } catch (error) {
      toast(`商店加载失败:${(error as Error).message}`, true);
    }
  }, [target, category, toast]);

  useEffect(() => {
    refresh();
    return bridge.onStatusChanged(() => {
      bridge.appStatus().then((all) => setStatus(all.find((s) => s.id === target) ?? null));
    });
  }, [refresh, target]);

  const filteredSkins = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return skins;
    return skins.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.category ?? "").toLowerCase().includes(q)
    );
  }, [skins, search]);

  const apply = async (slug: string, allowRestart = false) => {
    setBusySlug(slug);
    try {
      const result = await bridge.applySkin(target, slug, allowRestart);
      if (result.ok) {
        toast(`已应用「${slug}」`);
      } else if (result.needsRestart) {
        const skin = skins.find((s) => s.slug === slug);
        setRestartPending({ slug, name: skin?.name ?? slug });
        setBusySlug(null);
        return;
      } else {
        toast(result.message ?? "应用失败", true);
      }
    } catch (error) {
      toast((error as Error).message, true);
    } finally {
      setBusySlug(null);
    }
  };

  const confirmRestart = async () => {
    if (!restartPending) return;
    const { slug } = restartPending;
    setRestartPending(null);
    setBusySlug(slug);
    try {
      const retry = await bridge.applySkin(target, slug, true);
      if (retry.ok) toast(`已应用「${slug}」`);
      else toast(retry.message ?? "应用失败", true);
    } catch (error) {
      toast((error as Error).message, true);
    } finally {
      setBusySlug(null);
    }
  };

  const toggleFav = async (slug: string) => {
    if (!loggedIn) { toast("收藏需要先在「我的」页登录", true); return; }
    const result = await bridge.toggleFavorite("skin", slug);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (result.favorited) next.add(slug);
      else next.delete(slug);
      return next;
    });
  };

  return (
    <div>
      {/* 顶部：标题 + badge */}
      <div className="page-header">
        <h1 className="page-title">主题商店</h1>
        <div className="row" style={{ gap: 8 }}>
          <CdpBadge status={status} />
          {status?.activeSkin && (
            <button className="btn small ghost" onClick={() => bridge.restoreSkin(target).then(() => toast("已恢复默认外观"))}>
              恢复默认
            </button>
          )}
        </div>
      </div>

      {/* 切换区域（独立） + 右侧工具栏（独立） */}
      <div className="switcher-row">
        {/* 左：图标切换器 */}
        <div className="app-switcher-track">
          {TARGETS.map((t) => (
            <button
              key={t.id}
              className={`app-icon-btn ${target === t.id ? "active" : ""}`}
              title={t.label}
              onClick={() => { setTarget(t.id); setCategory(""); setSearch(""); }}
            >
              <img src={t.icon} alt={t.label} draggable={false} />
            </button>
          ))}
        </div>

        {/* 右：搜索 + 分类 + 加号 */}
        <div className="toolbar-right">
          <div className="search-box">
            <SearchIcon />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索皮肤名称…"
            />
          </div>
          <select
            className="select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">全部分类</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
          <button
            className="app-icon-add-btn"
            title="本地图片做皮肤"
            onClick={() => bridge.importImage(target).then((r) => {
              if (r.ok) toast("本地图片已生成皮肤并应用");
              else if (r.message && r.message !== "已取消") toast(r.message, true);
            })}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>

      {/* 皮肤网格 */}
      {filteredSkins.length === 0 ? (
        <div className="empty">
          {search ? `没有找到「${search}」相关皮肤` : "该平台 / 分类下暂无皮肤，去管理端上架或换个分类看看"}
        </div>
      ) : (
        <div className="grid">
          {filteredSkins.map((skin) => (
            <div className="card" key={skin.slug}>
              <img className="cover" src={skin.previewLightUrl || skin.backgroundUrl} alt={skin.name} loading="lazy" />
              <div className="meta">
                <div className="name">{skin.name}</div>
                <div className="sub">
                  <span>{skin.category || "未分类"}</span>
                  <span>{skin.downloads ?? 0} 次使用</span>
                </div>
                <div className="actions">
                  <button
                    className="btn primary"
                    style={{ flex: 1 }}
                    disabled={busySlug === skin.slug}
                    onClick={() => apply(skin.slug)}
                  >
                    {status?.activeSkin === skin.slug ? "重新应用" : busySlug === skin.slug ? "应用中…" : "一键应用"}
                  </button>
                  <button className="btn ghost" onClick={() => toggleFav(skin.slug)}>
                    {favorites.has(skin.slug) ? "★" : "☆"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 重启确认弹窗 */}
      {restartPending && (
        <RestartModal
          skinName={restartPending.name}
          appName={status?.name ?? target}
          onConfirm={confirmRestart}
          onCancel={() => setRestartPending(null)}
        />
      )}
    </div>
  );
}
