import { useEffect, useState } from "react";
import { Table } from "antd";
import { api } from "../api";

interface TelemetryRow {
  id: number;
  appId: string;
  appVersion: string;
  skinSlug: string;
  clientVersion: string;
  os: string;
  pass: boolean;
  message: string;
  createdAt: string;
}

export default function Telemetry() {
  const [rows, setRows] = useState<TelemetryRow[]>([]);
  useEffect(() => {
    api.get("/admin/telemetry").then((r) => setRows(r.data.items));
  }, []);
  return (
    <div>
      <div style={{ color: "#888", marginBottom: 12 }}>
        客户端每次注入校验的匿名上报。目标应用更新后若通过率骤降,应尽快在「适配器」发布热修复配置。
      </div>
      <Table<TelemetryRow>
        rowKey="id"
        size="small"
        dataSource={rows}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: "应用", dataIndex: "appId", width: 100 },
          { title: "应用版本", dataIndex: "appVersion", width: 100, className: "mono" },
          { title: "皮肤", dataIndex: "skinSlug", className: "mono" },
          { title: "系统", dataIndex: "os", width: 70 },
          { title: "客户端", dataIndex: "clientVersion", width: 90, className: "mono" },
          {
            title: "结果", dataIndex: "pass", width: 90,
            render: (pass: boolean) => (
              <span className={`status-pill ${pass ? "" : "muted"}`}>{pass ? "通过" : "失败"}</span>
            ),
          },
          { title: "信息", dataIndex: "message", ellipsis: true },
          { title: "时间", dataIndex: "createdAt", width: 170, render: (v) => new Date(v).toLocaleString() },
        ]}
      />
    </div>
  );
}
