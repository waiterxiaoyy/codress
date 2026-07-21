import { useCallback, useEffect, useState } from "react";
import { Button, Form, Input, InputNumber, Modal, Select, Space, Table, message } from "antd";
import { api, errorText } from "../api";

interface AdapterRow {
  id: number;
  appId: string;
  platform: string;
  version: number;
  config: unknown;
  css: string;
  notes: string;
  status: string;
}

export default function Adapters() {
  const [rows, setRows] = useState<AdapterRow[]>([]);
  const [editing, setEditing] = useState<AdapterRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    const { data } = await api.get("/admin/adapters");
    setRows(data.items);
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    const values = await form.validateFields();
    let config: unknown = undefined;
    if (values.configText?.trim()) {
      try {
        config = JSON.parse(values.configText);
      } catch {
        message.error("config 不是合法 JSON");
        return;
      }
    }
    const payload = {
      appId: values.appId, platform: values.platform, version: values.version,
      config, css: values.css ?? "", notes: values.notes ?? "",
    };
    try {
      if (creating) await api.post("/admin/adapters", payload);
      else if (editing) await api.put(`/admin/adapters/${editing.id}`, payload);
      message.success("已保存");
      setCreating(false);
      setEditing(null);
      load();
    } catch (error) {
      message.error(errorText(error));
    }
  };

  return (
    <div>
      <div style={{ color: "#888", marginBottom: 12 }}>
        目标应用更新导致选择器失配时,在这里发布新版本适配配置,客户端会热拉取,无需发版。
      </div>
      <Space style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          onClick={() => {
            form.resetFields();
            form.setFieldsValue({ appId: "codex", platform: "all", version: 1 });
            setCreating(true);
          }}
        >
          新建适配配置
        </Button>
      </Space>
      <Table<AdapterRow>
        rowKey="id"
        size="middle"
        dataSource={rows}
        pagination={false}
        columns={[
          { title: "应用", dataIndex: "appId", width: 110 },
          { title: "平台", dataIndex: "platform", width: 80 },
          { title: "版本", dataIndex: "version", width: 80 },
          { title: "备注", dataIndex: "notes", ellipsis: true },
          {
            title: "状态", dataIndex: "status", width: 90,
            render: (s: string) => <span className={`status-pill ${s === "active" ? "" : "muted"}`}>{s === "active" ? "生效中" : "草稿"}</span>,
          },
          {
            title: "操作", width: 200,
            render: (_, row) => (
              <Space size="small">
                <Button
                  size="small"
                  onClick={() => {
                    form.setFieldsValue({
                      ...row,
                      configText: row.config ? JSON.stringify(row.config, null, 2) : "",
                    });
                    setEditing(row);
                  }}
                >
                  编辑
                </Button>
                <Button
                  size="small"
                  type={row.status === "active" ? "default" : "primary"}
                  onClick={async () => {
                    await api.post(`/admin/adapters/${row.id}/status`, {
                      status: row.status === "active" ? "draft" : "active",
                    });
                    load();
                  }}
                >
                  {row.status === "active" ? "转草稿" : "激活"}
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={creating ? "新建适配配置" : "编辑适配配置"}
        open={creating || !!editing}
        onOk={submit}
        onCancel={() => { setCreating(false); setEditing(null); }}
        width={680}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Space size="middle" style={{ display: "flex" }}>
            <Form.Item name="appId" label="应用" rules={[{ required: true }]} style={{ width: 160 }}>
              <Select disabled={!creating} options={[{ value: "codex" }, { value: "workbuddy" }]} />
            </Form.Item>
            <Form.Item name="platform" label="平台" style={{ width: 120 }}>
              <Select options={[{ value: "all" }, { value: "win" }, { value: "mac" }]} />
            </Form.Item>
            <Form.Item name="version" label="配置版本号" rules={[{ required: true }]} style={{ width: 140 }}>
              <InputNumber min={1} style={{ width: "100%" }} />
            </Form.Item>
          </Space>
          <Form.Item name="configText" label='config JSON(如 {"defaultPort":9341,"probeMarkers":{"shell":"main.main-surface"}})'>
            <Input.TextArea rows={6} className="mono" />
          </Form.Item>
          <Form.Item name="css" label="覆盖 CSS(可选,追加在基础皮肤 CSS 之后)">
            <Input.TextArea rows={6} className="mono" />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input placeholder="适配 Codex 1.9.x 类名变更" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
