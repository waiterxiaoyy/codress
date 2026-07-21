import { useCallback, useEffect, useState } from "react";
import { bridge, type PetItem } from "../bridge";
import { useToast } from "../toast";

export default function Pets() {
  const toast = useToast();
  const [pets, setPets] = useState<PetItem[]>([]);
  const [activePet, setActivePet] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, settings] = await Promise.all([
        bridge.storePets({ target: "codex" }),
        bridge.getSettings(),
      ]);
      setPets(list.items);
      setActivePet(settings.activePet);
    } catch (error) {
      toast(`宠物列表加载失败:${(error as Error).message}`, true);
    }
  }, [toast]);

  useEffect(() => {
    refresh();
    return bridge.onStatusChanged(refresh);
  }, [refresh]);

  const enable = async (slug: string) => {
    setBusy(slug);
    try {
      await bridge.setPet(slug);
      toast("宠物已上桌");
    } catch (error) {
      toast((error as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <h1 className="page-title">桌面宠物</h1>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <span className="muted">与主题相互独立:透明悬浮窗常驻桌面,可拖动,不打扰输入。</span>
        {activePet && (
          <button className="btn ghost" onClick={() => bridge.setPet(null).then(() => toast("宠物已收起"))}>
            收起宠物
          </button>
        )}
      </div>
      {pets.length === 0 ? (
        <div className="empty">暂无已上架宠物,先在管理端上架(或运行服务端 seed)</div>
      ) : (
        <div className="grid">
          {pets.map((pet) => (
            <div className="card" key={pet.slug}>
              <img className="cover pet" src={pet.imageUrl} alt={pet.name} loading="lazy" />
              <div className="meta">
                <div className="name">{pet.name}</div>
                <div className="sub">
                  <span>{pet.animation === "bounce" ? "跳动" : pet.animation === "walk" ? "走动" : "静止"}</span>
                  <span>{pet.downloads ?? 0} 次使用</span>
                </div>
                <div className="actions">
                  <button
                    className={`btn ${activePet === pet.slug ? "" : "primary"}`}
                    disabled={busy === pet.slug}
                    onClick={() => (activePet === pet.slug ? bridge.setPet(null).then(refresh) : enable(pet.slug))}
                  >
                    {activePet === pet.slug ? "收起" : busy === pet.slug ? "召唤中…" : "上桌"}
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
