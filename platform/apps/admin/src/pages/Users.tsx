import { useCallback, useEffect, useState } from "react";
import { Button, Drawer, Input, Space, Table } from "antd";
import { api } from "../api";

interface UserRow {
  id: number;
  provider: string;
  name: string;
  email: string;
  lastLoginAt: string;
  createdAt: string;
}

interface EventRow {
  id: number;
  action: string;
  itemType: string;
  itemSlug: string;
  target: string;
  createdAt: string;
}

const actionText: Record<string, string> = {
  download: "下载", apply: "应用", remove: "移除",
  favorite: "收藏", unfavorite: "取消收藏", login: "登录",
};

export default function Users() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState<UserRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);

  const load = useCallback(async () => {
    const { data } = await api.get("/admin/users", { params: { page, pageSize: 15, q: query } });
    setRows(data.items);
    setTotal(data.total);
  }, [page, query]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="搜索用户名 / 邮箱"
          allowClear
          onSearch={(v) => { setPage(1); setQuery(v); }}
          style={{ width: 260 }}
        />
      </Space>
      <Table<UserRow>
        rowKey="id"
        size="middle"
        dataSource={rows}
        pagination={{ current: page, total, pageSize: 15, onChange: setPage }}
        columns={[
          { title: "ID", dataIndex: "id", width: 70 },
          { title: "来源", dataIndex: "provider", width: 90 },
          { title: "昵称", dataIndex: "name" },
          { title: "邮箱", dataIndex: "email" },
          { title: "最近登录", dataIndex: "lastLoginAt", width: 180, render: (v) => new Date(v).toLocaleString() },
          {
            title: "操作", width: 110,
            render: (_, row) => (
              <Button
                size="small"
                onClick={async () => {
                  setViewing(row);
                  const { data } = await api.get(`/admin/users/${row.id}/events`, { params: { pageSize: 50 } });
                  setEvents(data.items);
                }}
              >
                行为记录
              </Button>
            ),
          },
        ]}
      />
      <Drawer
        title={`行为记录:${viewing?.name ?? ""}`}
        open={!!viewing}
        onClose={() => setViewing(null)}
        width={520}
      >
        <Table<EventRow>
          rowKey="id"
          size="small"
          dataSource={events}
          pagination={false}
          columns={[
            { title: "行为", dataIndex: "action", width: 90, render: (a) => actionText[a] ?? a },
            { title: "对象", render: (_, e) => `${e.itemType}:${e.itemSlug}${e.target ? ` @${e.target}` : ""}` },
            { title: "时间", dataIndex: "createdAt", width: 170, render: (v) => new Date(v).toLocaleString() },
          ]}
        />
      </Drawer>
    </div>
  );
}
