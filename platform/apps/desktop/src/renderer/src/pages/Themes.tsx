import { useCallback, useEffect, useState } from "react";
import { bridge, type AdapterStatus, type SkinItem } from "../bridge";
import { useToast } from "../toast";

const TARGETS = [
  { id: "codex", label: "Codex" },
  { id: "workbuddy", label: "WorkBuddy" },
];

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

  const apply = async (slug: string, allowRestart = false) => {
    setBusySlug(slug);
    try {
      const result = await bridge.applySkin(target, slug, allowRestart);
      if (result.ok) {
        toast(`已应用「${slug}」`);
      } else if (result.needsRestart) {
        const confirmed = window.confirm(`${result.message}\n\n现在重启并应用吗?`);
        if (confirmed) {
          const retry = await bridge.applySkin(target, slug, true);
          if (retry.ok) toast(`已应用「${slug}」`);
          else toast(retry.message ?? "应用失败", true);
        }
      } else {
        toast(result.message ?? "应用失败", true);
      }
    } catch (error) {
      toast((error as Error).message, true);
    } finally {
      setBusySlug(null);
    }
  };

  const toggleFav = async (slug: string) => {
    if (!loggedIn) {
      toast("收藏需要先在「我的」页登录", true);
      return;
    }
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
      <h1 className="page-title">主题商店</h1>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div className="tabs">
          {TARGETS.map((t) => (
            <button
              key={t.id}
              className={`tab ${target === t.id ? "active" : ""}`}
              onClick={() => { setTarget(t.id); setCategory(""); }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="row muted" style={{ fontSize: 12 }}>
          <span>
            <span className={`status-dot ${status?.cdpReady ? "on" : ""}`} />
            {status?.installed
              ? status.cdpReady
                ? `${status.name} 皮肤通道已就绪(${status.sessions} 窗口)`
                : `${status.name} 未连接`
              : `${status?.name ?? ""} 未检测到安装`}
          </span>
          <button className="btn small ghost" onClick={() => bridge.importImage(target).then((r) => {
            if (r.ok) toast("本地图片已生成皮肤并应用");
            else if (r.message && r.message !== "已取消") toast(r.message, true);
          })}>
            + 本地图片做皮肤
          </button>
          {status?.activeSkin && (
            <button className="btn small ghost" onClick={() => bridge.restoreSkin(target).then(() => toast("已恢复默认外观"))}>
              恢复默认
            </button>
          )}
        </div>
      </div>

      <div className="chips">
        <span className={`chip ${category === "" ? "active" : ""}`} onClick={() => setCategory("")}>
          全部
        </span>
        {categories.map((c) => (
          <span
            key={c.slug}
            className={`chip ${category === c.slug ? "active" : ""}`}
            onClick={() => setCategory(c.slug)}
          >
            {c.name}
          </span>
        ))}
      </div>

      {skins.length === 0 ? (
        <div className="empty">该平台 / 分类下暂无皮肤,去管理端上架或换个分类看看</div>
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
                    disabled={busySlug === skin.slug}
                    onClick={() => apply(skin.slug)}
                  >
                    {status?.activeSkin === skin.slug ? "重新应用" : busySlug === skin.slug ? "应用中…" : "一键应用"}
                  </button>
                  <button className="btn ghost" onClick={() => toggleFav(skin.slug)}>
                    {favorites.has(skin.slug) ? "已收藏" : "收藏"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
