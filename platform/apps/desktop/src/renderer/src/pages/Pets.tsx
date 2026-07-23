import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bridge, type PetItem } from "../bridge";
import { useToast } from "../toast";
import { ButtonLoadingLabel, CategorySelect, RefreshButton, StoreSkeleton } from "../components/StoreControls";
import { usePageVisibility } from "../components/PageVisibility";
import { warmImageUrls } from "../storePreload";

/** 更多操作菜单（三竖点） */
function PetMoreMenu({ slug, name, onUninstall }: { slug: string; name: string; onUninstall: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="pet-more-wrap" ref={ref}>
      <button className="btn ghost pet-more-btn" onClick={() => setOpen(!open)} title="更多操作">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="pet-more-menu">
          <button
            className="pet-more-item danger"
            onClick={() => { setOpen(false); onUninstall(); }}
          >
            卸载
          </button>
        </div>
      )}
    </div>
  );
}

const ANIMATIONS = [
  { id: "idle", label: "待机", row: 0, frames: 6 },
  { id: "running-right", label: "向右跑", row: 1, frames: 8 },
  { id: "running-left", label: "向左跑", row: 2, frames: 8 },
  { id: "waving", label: "挥手", row: 3, frames: 4 },
  { id: "jumping", label: "跳跃", row: 4, frames: 5 },
  { id: "failed", label: "失败", row: 5, frames: 8 },
  { id: "waiting", label: "等待", row: 6, frames: 6 },
  { id: "running", label: "奔跑", row: 7, frames: 6 },
  { id: "review", label: "检查", row: 8, frames: 6 },
] as const;

type AnimationId = (typeof ANIMATIONS)[number]["id"];

const PET_PAGE_SIZE = 24;
const PET_CACHE_TTL = 5 * 60 * 1000;
const PET_CACHE_LIMIT = 20;

interface PetListCacheEntry {
  items: PetItem[];
  total: number;
  page: number;
  updatedAt: number;
}

const petListCache = new Map<string, PetListCacheEntry>();
const knownPetTags = new Set<string>();
const petViewCache = { category: "", search: "", installFilter: "" };
let petPreloadPromise: Promise<void> | null = null;

function petCacheKey(category: string, search: string) {
  return `${category}:${search.trim().toLowerCase()}`;
}

function rememberPetCache(key: string, entry: PetListCacheEntry) {
  petListCache.delete(key);
  petListCache.set(key, entry);
  while (petListCache.size > PET_CACHE_LIMIT) {
    const oldest = petListCache.keys().next().value;
    if (oldest) petListCache.delete(oldest);
    else break;
  }
}

function collectPetTags(items: PetItem[]) {
  for (const pet of items) {
    if (pet.category) knownPetTags.add(pet.category);
    for (const tag of (pet.tags ?? "").split(",")) {
      if (tag.trim()) knownPetTags.add(tag.trim());
    }
  }
}

export function preloadPetStore(): Promise<void> {
  const key = petCacheKey(petViewCache.category, petViewCache.search);
  const cached = petListCache.get(key);
  if (cached && Date.now() - cached.updatedAt < PET_CACHE_TTL) {
    warmImageUrls(cached.items.map((item) => item.spriteSheet ?? item.imageUrl), 4);
    return Promise.resolve();
  }
  if (petPreloadPromise) return petPreloadPromise;

  petPreloadPromise = bridge.storePets({
    target: "codex",
    page: 1,
    pageSize: PET_PAGE_SIZE,
  }).then((result) => {
    const entry = {
      items: result.items,
      total: result.total,
      page: 1,
      updatedAt: Date.now(),
    };
    collectPetTags(entry.items);
    rememberPetCache(key, entry);
    warmImageUrls(entry.items.map((item) => item.spriteSheet ?? item.imageUrl), 4);
  }).finally(() => {
    petPreloadPromise = null;
  });
  return petPreloadPromise;
}

function DesktopPetIcon({ active }: { active: boolean }) {
  return active ? (
    <svg className="btn-inline-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 3.5h12a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 16 14.5H4A1.5 1.5 0 0 1 2.5 13V5A1.5 1.5 0 0 1 4 3.5Z" />
      <path d="m7.5 9 2.5 2.5L12.5 9M7 17h6" />
    </svg>
  ) : (
    <svg className="btn-inline-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 3.5h12a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 16 14.5H4A1.5 1.5 0 0 1 2.5 13V5A1.5 1.5 0 0 1 4 3.5Z" />
      <path d="M7 17h6M10 11V6.5m0 0L7.8 8.7M10 6.5l2.2 2.2" />
    </svg>
  );
}

/** 精灵图预览组件 - 在 canvas 中播放 spritesheet 动画 */
function SpritePreview({ pet, animation = "idle", detail = false }: { pet: PetItem; animation?: AnimationId; detail?: boolean }) {
  const pageActive = usePageVisibility();
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [nearViewport, setNearViewport] = useState(detail);
  const [documentVisible, setDocumentVisible] = useState(() => document.visibilityState === "visible");
  const [imageReady, setImageReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }
    const root = frame.closest(".page-keepalive");
    const observer = new IntersectionObserver(
      ([entry]) => setNearViewport(entry.isIntersecting),
      { root, rootMargin: "240px 0px" },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const updateVisibility = () => setDocumentVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    setLoading(true);
    setFailed(false);
    setImageReady(false);
    imageRef.current = null;
    if (!pet.spriteSheet || !nearViewport) return;

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setLoading(false);
      setImageReady(true);
    };
    img.onerror = () => {
      setLoading(false);
      setFailed(true);
    };
    // canvas 图片不支持原生 lazy loading，仅在进入视口附近后设置 URL。
    img.src = pet.spriteSheet;

    return () => {
      img.onload = null;
      img.onerror = null;
      if (imageRef.current === img) imageRef.current = null;
    };
  }, [nearViewport, pet.spriteSheet]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !imageReady) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const CELL_W = 192;
    const CELL_H = 208;
    const SCALE = detail ? 1 : 0.6;
    const selectedAnimation = ANIMATIONS.find((item) => item.id === animation) ?? ANIMATIONS[0];
    const { row, frames } = selectedAnimation;
    let frame = 0;
    let animationFrame = 0;
    let lastTick = 0;

    canvas.width = CELL_W * SCALE;
    canvas.height = CELL_H * SCALE;
    canvas.style.imageRendering = "pixelated";

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        img,
        frame * CELL_W, row * CELL_H, CELL_W, CELL_H,
        0, 0, CELL_W * SCALE, CELL_H * SCALE,
      );
    };
    draw();

    if (!pageActive || !nearViewport || !documentVisible) return;
    const tick = (now: number) => {
      if (now - lastTick >= 1000 / 8) {
        lastTick = now;
        frame = (frame + 1) % frames;
        draw();
      }
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [animation, detail, documentVisible, imageReady, nearViewport, pageActive]);

  if (!pet.spriteSheet) {
    // Legacy 单图模式
    return (
      <div ref={frameRef} className={`pet-preview-frame ${detail ? "detail" : ""}`}>
        {loading && <PetPreviewLoading />}
        <img
          className={`cover pet pet-preview-media ${loading ? "loading" : "loaded"}`}
          src={pet.imageUrl}
          alt={pet.name}
          loading="lazy"
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setFailed(true); }}
        />
        {failed && <span className="pet-preview-error">预览加载失败</span>}
      </div>
    );
  }

  return (
    <div ref={frameRef} className={`pet-preview-frame ${detail ? "detail" : ""}`}>
      {loading && <PetPreviewLoading />}
      <canvas
        ref={canvasRef}
        className={`cover pet sprite-canvas pet-preview-media ${loading ? "loading" : "loaded"}`}
      />
      {failed && <span className="pet-preview-error">预览加载失败</span>}
    </div>
  );
}

function PetPreviewLoading() {
  return (
    <div className="pet-preview-loading" role="status" aria-label="宠物预览加载中">
      <span className="pet-preview-spinner" />
      <span>加载中</span>
    </div>
  );
}

export default function Pets() {
  const toast = useToast();
  const rootRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const requestSequence = useRef(0);
  const initialCache = petListCache.get(petCacheKey(petViewCache.category, petViewCache.search));
  const [pets, setPets] = useState<PetItem[]>(initialCache?.items ?? []);
  const [total, setTotal] = useState(initialCache?.total ?? 0);
  const [page, setPage] = useState(initialCache?.page ?? 0);
  const [activePet, setActivePet] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState(petViewCache.search);
  const [debouncedSearch, setDebouncedSearch] = useState(petViewCache.search);
  const [category, setCategory] = useState(petViewCache.category);
  const [installFilter, setInstallFilter] = useState(petViewCache.installFilter);
  const [tagVersion, setTagVersion] = useState(0);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installedSlugs, setInstalledSlugs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(!initialCache);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [previewAnimation, setPreviewAnimation] = useState<AnimationId>("idle");

  const queryKey = petCacheKey(category, debouncedSearch);
  const activeQueryKey = useRef(queryKey);
  activeQueryKey.current = queryKey;
  const hasMore = pets.length < total;

  const refreshLocalState = useCallback(async () => {
    try {
      const [settings, installed] = await Promise.all([bridge.getSettings(), bridge.getInstalledPets()]);
      setActivePet(settings.activePet);
      setInstalledSlugs(new Set(installed));
    } catch (error) {
      toast(`宠物状态读取失败:${(error as Error).message}`, true);
    }
  }, [toast]);

  const loadFirstPage = useCallback(async (force = false) => {
    const sequence = ++requestSequence.current;
    const cached = petListCache.get(queryKey);
    setRefreshing(force);
    setLoadingMore(false);
    if (cached) {
      setPets(cached.items);
      setTotal(cached.total);
      setPage(cached.page);
      setLoading(false);
      if (!force && Date.now() - cached.updatedAt < PET_CACHE_TTL) return;
    } else {
      setPets([]);
      setTotal(0);
      setPage(0);
      setLoading(true);
    }
    try {
      const result = await bridge.storePets({
        target: "codex",
        category: category || undefined,
        q: debouncedSearch.trim() || undefined,
        page: 1,
        pageSize: PET_PAGE_SIZE,
      });
      if (sequence !== requestSequence.current) return;
      const entry = { items: result.items, total: result.total, page: 1, updatedAt: Date.now() };
      collectPetTags(entry.items);
      setTagVersion((value) => value + 1);
      rememberPetCache(queryKey, entry);
      setPets(entry.items);
      setTotal(entry.total);
      setPage(1);
    } catch (error) {
      if (!cached || force) toast(`宠物列表加载失败:${(error as Error).message}`, true);
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [category, debouncedSearch, queryKey, toast]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const result = await bridge.storePets({
        target: "codex",
        category: category || undefined,
        q: debouncedSearch.trim() || undefined,
        page: nextPage,
        pageSize: PET_PAGE_SIZE,
      });
      if (activeQueryKey.current !== queryKey) return;
      const known = new Set(pets.map((item) => item.slug));
      const merged = [...pets, ...result.items.filter((item) => !known.has(item.slug))];
      collectPetTags(merged);
      setTagVersion((value) => value + 1);
      rememberPetCache(queryKey, { items: merged, total: result.total, page: nextPage, updatedAt: Date.now() });
      setPets(merged);
      setTotal(result.total);
      setPage(nextPage);
    } catch (error) {
      toast(`更多宠物加载失败:${(error as Error).message}`, true);
    } finally {
      setLoadingMore(false);
    }
  }, [category, debouncedSearch, hasMore, loading, loadingMore, page, pets, queryKey, toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    petViewCache.category = category;
    petViewCache.search = search;
    petViewCache.installFilter = installFilter;
  }, [category, installFilter, search]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  useEffect(() => {
    refreshLocalState();
    // 应用状态变化只同步本机状态，不能连带重新请求远程商店列表。
    return bridge.onStatusChanged(refreshLocalState);
  }, [refreshLocalState]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const scrollRoot = rootRef.current?.closest(".page-keepalive");
    if (!sentinel || !scrollRoot || !hasMore || loading || loadingMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { root: scrollRoot, rootMargin: "320px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loading, loadingMore]);

  // 获取所有 tags 去重做分类
  const allTags = useMemo(() => Array.from(knownPetTags).sort(), [tagVersion]);

  const filteredPets = useMemo(() => {
    let result = pets;
    if (installFilter === "installed") {
      result = result.filter((pet) => installedSlugs.has(pet.slug));
    } else if (installFilter === "uninstalled") {
      result = result.filter((pet) => !installedSlugs.has(pet.slug));
    }
    return result;
  }, [pets, installFilter, installedSlugs]);

  const selectedPet = useMemo(
    () => pets.find((pet) => pet.slug === selectedSlug) ?? null,
    [pets, selectedSlug],
  );

  const openDetail = (pet: PetItem) => {
    setSelectedSlug(pet.slug);
    setPreviewAnimation("idle");
  };

  const installToCodex = async (pet: PetItem) => {
    setInstalling(pet.slug);
    try {
      const result = await bridge.installPetToCodex(pet.slug);
      if (result.ok) {
        setInstalledSlugs((prev) => new Set([...prev, pet.slug]));
        toast(`「${pet.name}」已安装，去 Codex Settings → Appearance → Pets 中切换`);
      } else {
        toast(result.message ?? "安装失败", true);
      }
    } catch (error) {
      toast((error as Error).message, true);
    } finally {
      setInstalling(null);
    }
  };

  const enableDesktopPet = async (slug: string) => {
    setBusy(slug);
    try {
      await bridge.setPet(slug);
      toast("宠物已上桌");
      setActivePet(slug);
    } catch (error) {
      toast((error as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  const hideDesktopPet = async (slug: string) => {
    setBusy(slug);
    try {
      await bridge.setPet(null);
      setActivePet(null);
      toast("宠物已收起");
    } catch (error) {
      toast((error as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  const toggleDesktopPet = async (pet: PetItem) => {
    if (activePet === pet.slug) {
      await hideDesktopPet(pet.slug);
      return;
    }
    await enableDesktopPet(pet.slug);
  };

  const uninstallPet = async (pet: PetItem) => {
    const result = await bridge.uninstallPetFromCodex(pet.slug);
    if (result.ok) {
      setInstalledSlugs((prev) => {
        const next = new Set(prev);
        next.delete(pet.slug);
        return next;
      });
      toast(`已卸载「${pet.name}」`);
    } else {
      toast(result.message ?? "卸载失败", true);
    }
  };

  if (selectedPet) {
    const tags = [selectedPet.stylePreset, ...(selectedPet.tags ?? "").split(",")]
      .map((tag) => tag?.trim())
      .filter((tag, index, list): tag is string => Boolean(tag && tag !== "auto") && list.indexOf(tag) === index);
    const currentAnimation = ANIMATIONS.find((item) => item.id === previewAnimation)!;

    return (
      <div className="pet-detail-page">
        <button className="pet-detail-back" onClick={() => setSelectedSlug(null)}>
          <span aria-hidden="true">←</span> 返回宠物商店
        </button>
        <div className="pet-detail-layout">
          <div className="pet-detail-visual">
            <SpritePreview pet={selectedPet} animation={previewAnimation} detail />
            {tags.length > 0 && (
              <div className="pet-detail-tags">
                {tags.map((tag) => <span className="pet-state-tag" key={tag}>{tag}</span>)}
              </div>
            )}
          </div>

          <div className="pet-detail-content">
            <div className="pet-detail-heading">
              <div>
                <h1>{selectedPet.name}</h1>
                {selectedPet.author && <div className="pet-detail-author">by {selectedPet.author}</div>}
              </div>
              <span className="pet-detail-downloads">{selectedPet.downloads ?? 0} 次安装</span>
            </div>
            {selectedPet.description && <p className="pet-detail-description">{selectedPet.description}</p>}

            <div className="pet-detail-facts">
              <span>格式 <strong>Codex v2</strong></span>
              <span>动作 <strong>{ANIMATIONS.length} 种</strong></span>
              <span>注视方向 <strong>16 个</strong></span>
            </div>

            <div className="pet-detail-actions">
              <button
                className={`btn ${installedSlugs.has(selectedPet.slug) ? "ghost installed-btn" : "primary"}`}
                disabled={installing === selectedPet.slug || installedSlugs.has(selectedPet.slug)}
                onClick={() => installToCodex(selectedPet)}
              >
                {installedSlugs.has(selectedPet.slug)
                  ? "✓ 已安装到 Codex"
                  : installing === selectedPet.slug
                    ? <ButtonLoadingLabel>安装中…</ButtonLoadingLabel>
                    : "安装到 Codex"}
              </button>
              <button
                className={`btn ${activePet === selectedPet.slug ? "" : "ghost"}`}
                onClick={() => toggleDesktopPet(selectedPet)}
                disabled={busy !== null}
              >
                {busy === selectedPet.slug ? (
                  <ButtonLoadingLabel>{activePet === selectedPet.slug ? "收起中…" : "上桌中…"}</ButtonLoadingLabel>
                ) : (
                  <><DesktopPetIcon active={activePet === selectedPet.slug} />{activePet === selectedPet.slug ? "收起桌面宠物" : "上桌"}</>
                )}
              </button>
              {installedSlugs.has(selectedPet.slug) && (
                <PetMoreMenu
                  slug={selectedPet.slug}
                  name={selectedPet.name}
                  onUninstall={() => uninstallPet(selectedPet)}
                />
              )}
            </div>

            <section className="pet-moves-panel">
              <div className="pet-moves-header">
                <strong>动作预览</strong>
                <span>{currentAnimation.label}</span>
              </div>
              <div className="pet-moves-grid">
                {ANIMATIONS.map((animation) => (
                  <button
                    key={animation.id}
                    className={previewAnimation === animation.id ? "active" : ""}
                    onClick={() => setPreviewAnimation(animation.id)}
                  >
                    {animation.label}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef}>
      {/* 顶部 */}
      <div className="page-header">
        <h1 className="page-title">宠物商店</h1>
        {activePet && (
          <button
            className="btn ghost"
            disabled={busy !== null}
            onClick={() => hideDesktopPet(activePet)}
          >
            {busy === activePet ? <ButtonLoadingLabel>收起中…</ButtonLoadingLabel> : "收起桌面宠物"}
          </button>
        )}
      </div>

      {/* 说明 */}
      <p className="muted" style={{ marginBottom: 16, fontSize: 13 }}>
        Codex v2 宠物支持 9 种动画状态 + 16 方向注视，安装后在 Codex 中使用 <code>/pet</code> 命令激活。
        也可「上桌」作为桌面悬浮宠物使用。
      </p>

      {/* 搜索 + 分类筛选 */}
      <div className="switcher-row">
        <div className="toolbar-right" style={{ width: "100%" }}>
          <div className="search-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M16.5 16.5l4 4" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索宠物名称…"
            />
          </div>
          <CategorySelect
            value={category}
            onChange={setCategory}
            options={allTags.map((tag) => ({ value: tag, label: tag }))}
          />
          <CategorySelect
            value={installFilter}
            onChange={setInstallFilter}
            allLabel="全部状态"
            options={[
              { value: "uninstalled", label: "未安装" },
              { value: "installed", label: "已安装" },
            ]}
          />
          <RefreshButton
            loading={loading || refreshing}
            onClick={() => Promise.all([loadFirstPage(true), refreshLocalState()]).then(() => undefined)}
          />
        </div>
      </div>

      {/* 宠物网格 */}
      {loading ? (
        <StoreSkeleton pet />
      ) : filteredPets.length === 0 ? (
        <div className="empty">
          {search
            ? `没有找到「${search}」相关宠物`
            : category || installFilter
              ? "当前筛选条件下没有宠物"
              : "暂无已上架宠物，去管理端上架或运行 seed"}
        </div>
      ) : (
        <div className="grid">
          {filteredPets.map((pet) => (
            <div
              className="card pet-card"
              key={pet.slug}
              role="button"
              tabIndex={0}
              onClick={() => openDetail(pet)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") openDetail(pet);
              }}
            >
              <SpritePreview pet={pet} />
              <div className="meta">
                <div className="name">
                  {pet.name}
                  {pet.stylePreset && pet.stylePreset !== "auto" && (
                    <span className="pet-badge style">{pet.stylePreset}</span>
                  )}
                </div>
                {pet.description && (
                  <div className="sub" title={pet.description}>
                    {pet.description.slice(0, 60)}
                  </div>
                )}
                <div className="sub">
                  {pet.author && <span>by {pet.author}</span>}
                  <span>{pet.downloads ?? 0} 次安装</span>
                </div>
                <div className="actions" onClick={(event) => event.stopPropagation()}>
                  {/* 安装 / 已安装 */}
                  {pet.spriteSheet && (
                    <button
                      className={`btn ${installedSlugs.has(pet.slug) ? "ghost installed-btn" : "primary"}`}
                      style={{ flex: 1 }}
                      disabled={installing !== null || installedSlugs.has(pet.slug)}
                      onClick={() => installToCodex(pet)}
                    >
                      {installedSlugs.has(pet.slug)
                        ? "✓ 已安装"
                        : installing === pet.slug
                          ? <ButtonLoadingLabel>安装中…</ButtonLoadingLabel>
                          : "安装到 Codex"}
                    </button>
                  )}
                  {/* 上桌 / 收起 */}
                  <button
                    className={`btn ${activePet === pet.slug ? "" : "ghost"}`}
                    onClick={() => toggleDesktopPet(pet)}
                    disabled={busy !== null}
                    title={activePet === pet.slug ? "从桌面收起" : "悬浮在桌面上"}
                  >
                    {busy === pet.slug ? (
                      <ButtonLoadingLabel>{activePet === pet.slug ? "收起中…" : "上桌中…"}</ButtonLoadingLabel>
                    ) : (
                      <><DesktopPetIcon active={activePet === pet.slug} />{activePet === pet.slug ? "收起" : "上桌"}</>
                    )}
                  </button>
                  {/* 更多（卸载等） */}
                  {installedSlugs.has(pet.slug) && (
                    <PetMoreMenu slug={pet.slug} name={pet.name} onUninstall={() => uninstallPet(pet)} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && hasMore && (
        <div className={`store-load-more ${loadingMore ? "" : "silent"}`} ref={sentinelRef}>
          {loadingMore && <span><i className="store-load-spinner" />正在加载更多宠物…</span>}
        </div>
      )}
    </div>
  );
}
