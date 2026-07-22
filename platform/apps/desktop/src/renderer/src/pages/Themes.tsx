import { useCallback, useEffect, useRef, useState } from "react";
import { bridge, type AdapterStatus, type SkinItem } from "../bridge";
import { useToast } from "../toast";
import codexIcon from "../assets/codex.png";
import workbuddyIcon from "../assets/workbuddy.png";
import { CategorySelect, RefreshButton, StoreSkeleton } from "../components/StoreControls";

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
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [search, setSearch] = useState(themeViewCache.search);
  const [debouncedSearch, setDebouncedSearch] = useState(themeViewCache.search);
  const [restartPending, setRestartPending] = useState<{ slug: string; name: string } | null>(null);
  const [loading, setLoading] = useState(!initialCache);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

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
    Promise.all([bridge.storeCategories("skin"), bridge.getSettings()])
      .then(async ([categoryList, settings]) => {
        setCategories(categoryList.items);
        setLoggedIn(Boolean(settings.userToken));
        if (settings.userToken) {
          const favs = await bridge.favorites().catch(() => ({ items: [] }));
          setFavorites(new Set(favs.items.filter((item) => item.itemType === "skin").map((item) => item.itemSlug)));
        }
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
    const scrollRoot = rootRef.current?.closest(".content");
    if (!sentinel || !scrollRoot || !hasMore || loading || loadingMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { root: scrollRoot, rootMargin: "240px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loading, loadingMore]);

  useEffect(() => {
    const scrollRoot = rootRef.current?.closest(".content");
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
    const scrollRoot = rootRef.current?.closest(".content");
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
                  <button className="btn ghost" onClick={() => toggleFav(skin.slug)}>
                    {favorites.has(skin.slug) ? "★" : "☆"}
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
    </div>
  );
}
