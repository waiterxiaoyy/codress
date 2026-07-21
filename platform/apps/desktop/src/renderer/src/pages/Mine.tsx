import { useCallback, useEffect, useState } from "react";
import { bridge } from "../bridge";
import { useToast } from "../toast";

interface EventRow {
  id: number;
  action: string;
  itemType: string;
  itemSlug: string;
  target: string;
  createdAt: string;
}

const actionText: Record<string, string> = {
  download: "下载", apply: "应用", remove: "恢复默认",
  favorite: "收藏", unfavorite: "取消收藏", login: "登录",
};

export default function Mine() {
  const toast = useToast();
  const [userName, setUserName] = useState<string | null>(null);
  const [providers, setProviders] = useState<{ github: boolean; google: boolean; dev: boolean } | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [installed, setInstalled] = useState<{ slug: string; name: string; target: string }[]>([]);
  const [devName, setDevName] = useState("");

  const refresh = useCallback(async () => {
    const settings = await bridge.getSettings();
    setUserName(settings.userToken ? settings.userName : null);
    const [codexLib, workbuddyLib] = await Promise.all([
      bridge.libraryList("codex"),
      bridge.libraryList("workbuddy"),
    ]);
    setInstalled([...codexLib, ...workbuddyLib]);
    if (settings.userToken) {
      const mine = await bridge.myEvents().catch(() => ({ items: [] }));
      setEvents(mine.items as unknown as EventRow[]);
    } else {
      setEvents([]);
    }
    setProviders(await bridge.authProviders().catch(() => null));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const oauth = async (provider: string) => {
    try {
      toast("已打开浏览器,请完成授权…");
      const me = await bridge.loginOAuth(provider);
      toast(`欢迎,${me.name}`);
      refresh();
    } catch (error) {
      toast((error as Error).message, true);
    }
  };

  return (
    <div>
      <h1 className="page-title">我的</h1>
      {userName ? (
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 20 }}>
          <span>
            已登录:<b>{userName}</b>
            <span className="muted" style={{ marginLeft: 10, fontSize: 12 }}>
              登录只用于同步你的使用记录与收藏
            </span>
          </span>
          <button className="btn ghost" onClick={() => bridge.logout().then(refresh)}>
            退出登录
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: 20 }}>
          <div className="muted" style={{ marginBottom: 10 }}>
            登录后可同步使用记录与收藏(仅用于记录,不影响换肤功能)
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn" disabled={!providers?.github} onClick={() => oauth("github")}>
              使用 GitHub 登录
            </button>
            <button className="btn" disabled={!providers?.google} onClick={() => oauth("google")}>
              使用 Google 登录
            </button>
            {providers?.dev && (
              <span className="row">
                <input
                  style={{ border: "1px solid var(--line)", padding: "6px 10px", width: 140 }}
                  placeholder="开发者昵称"
                  value={devName}
                  onChange={(e) => setDevName(e.target.value)}
                />
                <button
                  className="btn ghost"
                  disabled={!devName.trim()}
                  onClick={async () => {
                    try {
                      const user = await bridge.loginDev(devName.trim());
                      toast(`欢迎,${user.name}`);
                      refresh();
                    } catch (error) {
                      toast((error as Error).message, true);
                    }
                  }}
                >
                  开发登录
                </button>
              </span>
            )}
          </div>
          {providers && !providers.github && !providers.google && (
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              服务端尚未配置 GitHub / Google OAuth(见 server/.env.example),当前可用开发登录联调。
            </div>
          )}
        </div>
      )}

      <hr className="divider" />
      <h2 style={{ fontSize: 16 }}>已下载的皮肤({installed.length})</h2>
      {installed.length === 0 ? (
        <div className="empty">还没有下载过皮肤</div>
      ) : (
        <div className="list">
          {installed.map((item) => (
            <div className="list-row" key={`${item.target}-${item.slug}`}>
              <span>
                {item.name} <span className="muted">({item.slug})</span>
              </span>
              <span className="row">
                <span className="muted" style={{ fontSize: 12 }}>{item.target}</span>
                <button
                  className="btn small"
                  onClick={() =>
                    bridge.applySkin(item.target, item.slug).then((r) => {
                      if (r.ok) toast("已应用");
                      else toast(r.message ?? "应用失败", true);
                    })
                  }
                >
                  应用
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {userName && (
        <>
          <hr className="divider" />
          <h2 style={{ fontSize: 16 }}>使用记录</h2>
          {events.length === 0 ? (
            <div className="empty">暂无记录</div>
          ) : (
            <div className="list">
              {events.map((event) => (
                <div className="list-row" key={event.id}>
                  <span>
                    {actionText[event.action] ?? event.action}
                    {event.itemSlug ? ` · ${event.itemSlug}` : ""}
                    {event.target ? <span className="muted"> @{event.target}</span> : null}
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
