import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bridge, type PetItem } from "../bridge";
import { useToast } from "../toast";

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

const ANIMATION_ROWS = [
  "idle", "running-right", "running-left", "waving",
  "jumping", "failed", "waiting", "running", "review",
];

/** 精灵图预览组件 - 在 canvas 中播放 spritesheet 动画 */
function SpritePreview({ pet }: { pet: PetItem }) {
  const canvasRef = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas || !pet.spriteSheet) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = pet.spriteSheet;

      let frame = 0;
      let animId = 0;
      const CELL_W = 192;
      const CELL_H = 208;
      const COLS = 8;
      const SCALE = 0.6; // 缩小显示

      canvas.width = CELL_W * SCALE;
      canvas.height = CELL_H * SCALE;
      canvas.style.imageRendering = "pixelated";

      const fps = 8;
      let lastTick = 0;
      // 默认播放 idle (row 0, 6 frames)
      const row = 0;
      const frames = 6;

      const tick = (now: number) => {
        if (now - lastTick >= 1000 / fps) {
          lastTick = now;
          frame = (frame + 1) % frames;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(
            img,
            frame * CELL_W, row * CELL_H, CELL_W, CELL_H,
            0, 0, CELL_W * SCALE, CELL_H * SCALE,
          );
        }
        animId = requestAnimationFrame(tick);
      };

      img.onload = () => {
        animId = requestAnimationFrame(tick);
      };

      return () => cancelAnimationFrame(animId);
    },
    [pet.spriteSheet],
  );

  if (!pet.spriteSheet) {
    // Legacy 单图模式
    return <img className="cover pet" src={pet.imageUrl} alt={pet.name} loading="lazy" />;
  }

  return <canvas ref={canvasRef} className="cover pet sprite-canvas" />;
}

export default function Pets() {
  const toast = useToast();
  const [pets, setPets] = useState<PetItem[]>([]);
  const [activePet, setActivePet] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [installing, setInstalling] = useState<string | null>(null);
  const [installedSlugs, setInstalledSlugs] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const [list, settings, installed] = await Promise.all([
        bridge.storePets({ target: "codex" }),
        bridge.getSettings(),
        bridge.getInstalledPets(),
      ]);
      setPets(list.items);
      setActivePet(settings.activePet);
      setInstalledSlugs(new Set(installed));
    } catch (error) {
      toast(`宠物列表加载失败:${(error as Error).message}`, true);
    }
  }, [toast]);

  useEffect(() => {
    refresh();
    return bridge.onStatusChanged(refresh);
  }, [refresh]);

  // 获取所有 tags 去重做分类
  const allTags = useMemo(() => {
    const set = new Set<string>();
    pets.forEach((p) => {
      if (p.tags) p.tags.split(",").forEach((t) => set.add(t.trim()));
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [pets]);

  const filteredPets = useMemo(() => {
    let result = pets;
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description ?? "").toLowerCase().includes(q) ||
          (p.tags ?? "").toLowerCase().includes(q),
      );
    }
    if (category) {
      result = result.filter(
        (p) =>
          p.category === category ||
          (p.tags ?? "").split(",").map((t) => t.trim()).includes(category),
      );
    }
    return result;
  }, [pets, search, category]);

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

  return (
    <div>
      {/* 顶部 */}
      <div className="page-header">
        <h1 className="page-title">宠物商店</h1>
        {activePet && (
          <button
            className="btn ghost"
            onClick={() => bridge.setPet(null).then(() => { toast("宠物已收起"); setActivePet(null); })}
          >
            收起桌面宠物
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
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">全部分类</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 宠物网格 */}
      {filteredPets.length === 0 ? (
        <div className="empty">
          {search ? `没有找到「${search}」相关宠物` : "暂无已上架宠物，去管理端上架或运行 seed"}
        </div>
      ) : (
        <div className="grid">
          {filteredPets.map((pet) => (
            <div className="card pet-card" key={pet.slug}>
              <SpritePreview pet={pet} />
              <div className="meta">
                <div className="name">
                  {pet.name}
                  {pet.manifest?.spriteVersionNumber === 2 && (
                    <span className="pet-badge v2">v2</span>
                  )}
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
                {/* 动画状态标签 */}
                {pet.spriteSheet && (
                  <div className="pet-states">
                    {ANIMATION_ROWS.slice(0, 5).map((s) => (
                      <span key={s} className="pet-state-tag">{s}</span>
                    ))}
                    <span className="pet-state-tag">+{ANIMATION_ROWS.length - 5}</span>
                  </div>
                )}
                <div className="actions">
                  {/* 安装 / 已安装 */}
                  {pet.spriteSheet && (
                    <button
                      className={`btn ${installedSlugs.has(pet.slug) ? "ghost installed-btn" : "primary"}`}
                      style={{ flex: 1 }}
                      disabled={installing === pet.slug || installedSlugs.has(pet.slug)}
                      onClick={() => installToCodex(pet)}
                    >
                      {installedSlugs.has(pet.slug)
                        ? "✓ 已安装"
                        : installing === pet.slug
                          ? "安装中…"
                          : "安装到 Codex"}
                    </button>
                  )}
                  {/* 上桌 / 收起 */}
                  <button
                    className={`btn ${activePet === pet.slug ? "" : "ghost"}`}
                    onClick={() =>
                      activePet === pet.slug
                        ? bridge.setPet(null).then(() => { setActivePet(null); refresh(); })
                        : enableDesktopPet(pet.slug)
                    }
                    disabled={busy === pet.slug}
                    title={activePet === pet.slug ? "从桌面收起" : "悬浮在桌面上"}
                  >
                    {activePet === pet.slug ? "↓ 收起" : "🖥 上桌"}
                  </button>
                  {/* 更多（卸载等） */}
                  {installedSlugs.has(pet.slug) && (
                    <PetMoreMenu slug={pet.slug} name={pet.name} onUninstall={async () => {
                      const r = await bridge.uninstallPetFromCodex(pet.slug);
                      if (r.ok) {
                        setInstalledSlugs((prev) => { const s = new Set(prev); s.delete(pet.slug); return s; });
                        toast(`已卸载「${pet.name}」`);
                      } else toast(r.message ?? "卸载失败", true);
                    }} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
