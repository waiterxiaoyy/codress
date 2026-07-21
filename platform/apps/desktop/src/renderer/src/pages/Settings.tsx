import { useCallback, useEffect, useState } from "react";
import { bridge, type AdapterStatus, type Settings as SettingsData } from "../bridge";
import { useToast } from "../toast";

export default function Settings() {
  const toast = useToast();
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [statuses, setStatuses] = useState<AdapterStatus[]>([]);
  const [apiBase, setApiBase] = useState("");

  const refresh = useCallback(async () => {
    const [s, st] = await Promise.all([bridge.getSettings(), bridge.appStatus()]);
    setSettings(s);
    setApiBase(s.apiBase);
    setStatuses(st);
  }, []);

  useEffect(() => {
    refresh();
    return bridge.onStatusChanged(refresh);
  }, [refresh]);

  if (!settings) return null;

  return (
    <div>
      <h1 className="page-title">设置</h1>

      <div className="field">
        <label>服务端地址(皮肤商店 API)</label>
        <div className="row">
          <input value={apiBase} onChange={(e) => setApiBase(e.target.value)} />
          <button
            className="btn"
            onClick={() =>
              bridge.patchSettings({ apiBase: apiBase.replace(/\/$/, "") }).then(() => toast("已保存"))
            }
          >
            保存
          </button>
        </div>
      </div>

      <hr className="divider" />
      <h2 style={{ fontSize: 16 }}>目标应用</h2>
      <div className="list" style={{ maxWidth: 720 }}>
        {statuses.map((status) => (
          <div className="list-row" key={status.id}>
            <span>
              <b>{status.name}</b>
              <span className="muted" style={{ marginLeft: 10, fontSize: 12 }}>
                {status.installed ? status.installPath : "未检测到,可手动指定可执行文件路径"}
              </span>
            </span>
            <span className="row">
              <span className="muted" style={{ fontSize: 12 }}>
                <span className={`status-dot ${status.cdpReady ? "on" : ""}`} />
                {status.cdpReady ? `端口 ${status.port} 已连接` : `端口 ${status.port}`}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                {status.daemonState === "running"
                  ? `注入中(${status.sessions})`
                  : status.daemonState === "paused"
                    ? "已暂停"
                    : "未注入"}
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="muted" style={{ marginTop: 8, fontSize: 12, maxWidth: 720 }}>
        说明:皮肤通过本机回环 CDP 注入,只在你的电脑内通信;不修改目标应用安装目录,恢复默认即可完全还原。
        如果目标应用正在运行但未开启皮肤通道,应用皮肤时会请求你确认重启一次。
      </div>

      <hr className="divider" />
      <h2 style={{ fontSize: 16 }}>手动指定应用路径</h2>
      {(["codex", "workbuddy"] as const).map((id) => (
        <div className="field" key={id}>
          <label>{id === "codex" ? "Codex" : "WorkBuddy"} 可执行文件 / .app 路径</label>
          <input
            defaultValue={settings.appPaths[id] ?? ""}
            placeholder={id === "codex" ? "例如 C:\\Users\\you\\AppData\\Local\\Programs\\Codex\\Codex.exe" : ""}
            onBlur={(e) =>
              bridge
                .patchSettings({ appPaths: { ...settings.appPaths, [id]: e.target.value.trim() } })
                .then(() => toast("路径已保存"))
            }
          />
        </div>
      ))}
    </div>
  );
}
