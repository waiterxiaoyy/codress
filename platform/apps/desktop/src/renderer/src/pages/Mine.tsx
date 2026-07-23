import { useCallback, useEffect, useState } from "react";
import { bridge, type LibrarySkinItem, type PetItem } from "../bridge";
import { useToast } from "../toast";

export default function Mine() {
  const toast = useToast();
  const [installed, setInstalled] = useState<LibrarySkinItem[]>([]);
  const [localPets, setLocalPets] = useState<{ slug: string; name: string; installed: boolean; onDesktop: boolean }[]>([]);
  const [activeCodexPet, setActiveCodexPet] = useState<string | null>(null);

  const refreshSkins = useCallback(async () => {
    const [codexLib, workbuddyLib] = await Promise.all([
      bridge.libraryList("codex"),
      bridge.libraryList("workbuddy"),
    ]);
    setInstalled([...codexLib, ...workbuddyLib]);
  }, []);

  const refresh = useCallback(async () => {
    const settings = await bridge.getSettings();
    const [installedPetSlugs, petStore, codexPet] = await Promise.all([
      bridge.getInstalledPets(),
      bridge.storePets({ target: "codex" }).catch(() => ({ items: [], total: 0 })),
      bridge.getActivePetInCodex(),
    ]);
    const petNames = new Map((petStore.items as PetItem[]).map((pet) => [pet.slug, pet.name]));
    const petSlugs = new Set(installedPetSlugs);
    if (settings.activePet) petSlugs.add(settings.activePet);
    setLocalPets(Array.from(petSlugs).map((slug) => ({
      slug,
      name: petNames.get(slug) ?? slug,
      installed: installedPetSlugs.includes(slug),
      onDesktop: settings.activePet === slug,
    })));
    setActiveCodexPet(codexPet);
  }, []);

  useEffect(() => {
    void Promise.all([refreshSkins(), refresh()]);
  }, [refresh, refreshSkins]);

  useEffect(() => bridge.onLibraryChanged(refreshSkins), [refreshSkins]);

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
                    refresh();
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
                        refresh();
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

    </div>
  );
}
