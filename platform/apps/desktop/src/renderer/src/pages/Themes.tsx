import { useCallback, useEffect, useRef, useState } from "react";
import {
  bridge,
  type AdapterStatus,
  type LocalSkinImage,
  type LocalSkinInput,
  type SkinItem,
} from "../bridge";
import { useToast } from "../toast";
import codexIcon from "../assets/codex.png";
import workbuddyIcon from "../assets/workbuddy.png";
import { CategorySelect, RefreshButton, StoreSkeleton } from "../components/StoreControls";
import { ThemeCreatorModal } from "../components/ThemeCreatorModal";
import { warmImageUrls } from "../storePreload";

const TARGETS = [
  { id: "codex", label: "Codex", icon: codexIcon },
  { id: "workbuddy", label: "WorkBuddy", icon: workbuddyIcon },
];

const THEME_PAGE_SIZE = 24;
const THEME_CACHE_TTL = 5 * 60 * 1000;
const THEME_CACHE_LIMIT = 20;

interface ThemeListCacheEntry {
  items: SkinItem[];
  total: number;
  page: number;
  updatedAt: number;
}

const themeListCache = new Map<string, ThemeListCacheEntry>();
const themeViewCache = {
  target: "codex",
  category: "",
  search: "",
  scrollTop: 0,
};
let themePreloadPromise: Promise<void> | null = null;

function themeCacheKey(target: string, category: string, search: string) {
  return `${target}:${category}:${search.trim().toLowerCase()}`;
}

function setThemeCache(key: string, entry: ThemeListCacheEntry) {
  themeListCache.delete(key);
  themeListCache.set(key, entry);
  while (themeListCache.size > THEME_CACHE_LIMIT) {
    const oldestKey = themeListCache.keys().next().value;
    if (oldestKey) themeListCache.delete(oldestKey);
    else break;
  }
}

export function preloadThemeStore(): Promise<void> {
  const key = themeCacheKey(themeViewCache.target, themeViewCache.category, themeViewCache.search);
  const cached = themeListCache.get(key);
  if (cached && Date.now() - cached.updatedAt < THEME_CACHE_TTL) {
    warmImageUrls(cached.items.map((item) => item.previewLightUrl ?? item.backgroundUrl));
    return Promise.resolve();
  }
  if (themePreloadPromise) return themePreloadPromise;

  themePreloadPromise = bridge.storeSkins({
    target: themeViewCache.target,
    page: 1,
    pageSize: THEME_PAGE_SIZE,
  }).then((result) => {
    setThemeCache(key, {
      items: result.items,
      total: result.total,
      page: 1,
      updatedAt: Date.now(),
    });
    warmImageUrls(result.items.map((item) => item.previewLightUrl ?? item.backgroundUrl));
  }).finally(() => {
    themePreloadPromise = null;
  });
  return themePreloadPromise;
}

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
  const rootRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const requestSequence = useRef(0);
  const [target, setTarget] = useState(themeViewCache.target);
  const [category, setCategory] = useState(themeViewCache.category);
  const [categories, setCategories] = useState<{ slug: string; name: string }[]>([]);
  const initialCache = themeListCache.get(themeCacheKey(themeViewCache.target, themeViewCache.category, themeViewCache.search));
  const [skins, setSkins] = useState<SkinItem[]>(initialCache?.items ?? []);
  const [total, setTotal] = useState(initialCache?.total ?? 0);
  const [page, setPage] = useState(initialCache?.page ?? 0);
  const [status, setStatus] = useState<AdapterStatus | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [search, setSearch] = useState(themeViewCache.search);
  const [debouncedSearch, setDebouncedSearch] = useState(themeViewCache.search);
  const [restartPending, setRestartPending] = useState<{ slug: string; name: string } | null>(null);
  const [loading, setLoading] = useState(!initialCache);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [creatorImage, setCreatorImage] = useState<LocalSkinImage | null>(null);

  const queryKey = themeCacheKey(target, category, debouncedSearch);
  const activeQueryKey = useRef(queryKey);
  activeQueryKey.current = queryKey;
  const hasMore = skins.length < total;

  const loadFirstPage = useCallback(async (force = false) => {
    const sequence = ++requestSequence.current;
    setRefreshing(force);
    setLoadingMore(false);
    const cached = themeListCache.get(queryKey);
    if (cached) {
      setSkins(cached.items);
      setTotal(cached.total);
      setPage(cached.page);
      setLoading(false);
      if (!force && Date.now() - cached.updatedAt < THEME_CACHE_TTL) return;
    } else {
      setSkins([]);
      setTotal(0);
      setPage(0);
      setLoading(true);
    }

    try {
      const result = await bridge.storeSkins({
        target,
        category: category || undefined,
        q: debouncedSearch.trim() || undefined,
        page: 1,
        pageSize: THEME_PAGE_SIZE,
      });
      if (sequence !== requestSequence.current) return;
      const entry = { items: result.items, total: result.total, page: 1, updatedAt: Date.now() };
      setThemeCache(queryKey, entry);
      setSkins(entry.items);
      setTotal(entry.total);
      setPage(1);
    } catch (error) {
      if (!cached || force) toast(`商店加载失败:${(error as Error).message}`, true);
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [category, debouncedSearch, queryKey, target, toast]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const result = await bridge.storeSkins({
        target,
        category: category || undefined,
        q: debouncedSearch.trim() || undefined,
        page: nextPage,
        pageSize: THEME_PAGE_SIZE,
      });
      if (activeQueryKey.current !== queryKey) return;
      setSkins((previous) => {
        const known = new Set(previous.map((item) => item.slug));
        const merged = [...previous, ...result.items.filter((item) => !known.has(item.slug))];
        setThemeCache(queryKey, {
          items: merged,
          total: result.total,
          page: nextPage,
          updatedAt: Date.now(),
        });
        return merged;
      });
      setTotal(result.total);
      setPage(nextPage);
    } catch (error) {
      toast(`更多主题加载失败:${(error as Error).message}`, true);
    } finally {
      setLoadingMore(false);
    }
  }, [category, debouncedSearch, hasMore, loading, loadingMore, page, queryKey, target, toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    themeViewCache.target = target;
    themeViewCache.category = category;
    themeViewCache.search = search;
  }, [category, search, target]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  useEffect(() => {
    bridge.storeCategories("skin")
      .then((categoryList) => {
        setCategories(categoryList.items);
      })
      .catch((error) => toast(`商店信息加载失败:${(error as Error).message}`, true));
  }, [toast]);

  useEffect(() => {
    const updateStatus = () => {
      bridge.appStatus().then((all) => setStatus(all.find((item) => item.id === target) ?? null));
    };
    updateStatus();
    return bridge.onStatusChanged(updateStatus);
  }, [target]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const scrollRoot = rootRef.current?.closest(".page-keepalive");
    if (!sentinel || !scrollRoot || !hasMore || loading || loadingMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { root: scrollRoot, rootMargin: "240px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loading, loadingMore]);

  useEffect(() => {
    const scrollRoot = rootRef.current?.closest(".page-keepalive");
    if (!scrollRoot) return;
    const frame = requestAnimationFrame(() => { scrollRoot.scrollTop = themeViewCache.scrollTop; });
    const rememberScroll = () => { themeViewCache.scrollTop = scrollRoot.scrollTop; };
    scrollRoot.addEventListener("scroll", rememberScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      themeViewCache.scrollTop = scrollRoot.scrollTop;
      scrollRoot.removeEventListener("scroll", rememberScroll);
    };
  }, []);

  const resetScroll = () => {
    themeViewCache.scrollTop = 0;
    const scrollRoot = rootRef.current?.closest(".page-keepalive");
    if (scrollRoot) scrollRoot.scrollTop = 0;
  };

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

  const beginLocalCreation = async () => {
    if (pickingImage) return;
    setPickingImage(true);
    try {
      const picked = await bridge.pickSkinImage();
      if (picked) setCreatorImage(picked);
    } catch (error) {
      const message = (error as Error).message;
      toast(
        message.includes("No handler registered")
          ? "Codress 主进程已更新，请完全退出客户端后重新打开"
          : message,
        true,
      );
    } finally {
      setPickingImage(false);
    }
  };

  const saveLocalSkin = async (input: LocalSkinInput) => {
    try {
      const result = await bridge.createLocalSkin(target, input);
      setCreatorImage(null);
      if (result.ok) {
        toast(`已保存并应用「${result.name}」`);
      } else if (result.needsRestart) {
        setRestartPending({ slug: result.slug, name: result.name });
        toast(`「${result.name}」已保存到我的皮肤`);
      } else {
        toast(`皮肤已保存，但应用失败：${result.message ?? "请稍后重试"}`, true);
      }
    } catch (error) {
      toast((error as Error).message, true);
    }
  };

  return (
    <div ref={rootRef}>
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
              onClick={() => {
                resetScroll();
                setTarget(t.id);
                setCategory("");
                setSearch("");
                setDebouncedSearch("");
              }}
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
              onChange={(e) => { resetScroll(); setSearch(e.target.value); }}
              placeholder="搜索皮肤名称…"
            />
          </div>
          <CategorySelect
            value={category}
            onChange={(value) => { resetScroll(); setCategory(value); }}
            options={categories.map((item) => ({ value: item.slug, label: item.name }))}
          />
          <RefreshButton loading={loading || refreshing} onClick={() => loadFirstPage(true)} />
          <button
            className={`app-icon-add-btn ${pickingImage ? "busy" : ""}`}
            title="用本地图片创作皮肤"
            disabled={pickingImage}
            onClick={beginLocalCreation}
          >
            {pickingImage ? (
              <span className="store-load-spinner" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* 皮肤网格 */}
      {loading ? (
        <StoreSkeleton />
      ) : skins.length === 0 ? (
        <div className="empty">
          {search ? `没有找到「${search}」相关皮肤` : "该平台 / 分类下暂无皮肤，去管理端上架或换个分类看看"}
        </div>
      ) : (
        <div className="grid">
          {skins.map((skin) => (
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
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && skins.length > 0 && (
        <div className="store-load-more" ref={sentinelRef}>
          {loadingMore ? (
            <span><span className="store-load-spinner" />正在加载更多主题…</span>
          ) : hasMore ? (
            <button className="btn ghost" onClick={loadMore}>加载更多</button>
          ) : (
            <span>已加载全部 {total} 个主题</span>
          )}
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

      {creatorImage && (
        <ThemeCreatorModal
          image={creatorImage}
          targetName={TARGETS.find((item) => item.id === target)?.label ?? target}
          onClose={() => setCreatorImage(null)}
          onSave={saveLocalSkin}
        />
      )}
    </div>
  );
}
