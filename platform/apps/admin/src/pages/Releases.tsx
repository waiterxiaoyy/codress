import { useCallback, useEffect, useState } from "react";
import { Button, Checkbox, Form, Input, Modal, Popconfirm, Select, Space, Table, message } from "antd";
import { api, errorText } from "../api";

interface ReleaseRow {
  id: number;
  platform: string;
  version: string;
  url: string;
  notes: string;
  mandatory: boolean;
  createdAt: string;
}

export default function Releases() {
  const [rows, setRows] = useState<ReleaseRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    const { data } = await api.get("/admin/releases");
    setRows(data.items);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={() => { form.resetFields(); form.setFieldsValue({ platform: "win" }); setCreating(true); }}>
          发布新版本
        </Button>
      </Space>
      <Table<ReleaseRow>
        rowKey="id"
        size="middle"
        dataSource={rows}
        pagination={false}
        columns={[
          { title: "平台", dataIndex: "platform", width: 90, render: (p) => (p === "win" ? "Windows" : "macOS") },
          { title: "版本", dataIndex: "version", width: 110, className: "mono" },
          { title: "下载地址", dataIndex: "url", ellipsis: true, className: "mono" },
          { title: "强制更新", dataIndex: "mandatory", width: 100, render: (m: boolean) => (m ? "是" : "否") },
          {
            title: "操作", width: 100,
            render: (_, row) => (
              <Popconfirm title="确认删除?" onConfirm={async () => { await api.delete(`/admin/releases/${row.id}`); load(); }}>
                <Button size="small" danger>删除</Button>
              </Popconfirm>
            ),
          },
        ]}
      />
      <Modal
        title="发布客户端版本"
        open={creating}
        onCancel={() => setCreating(false)}
        onOk={async () => {
          const values = await form.validateFields();
          try {
            await api.post("/admin/releases", { ...values, mandatory: !!values.mandatory });
            message.success("已发布");
            setCreating(false);
            load();
          } catch (error) {
            message.error(errorText(error));
          }
        }}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="platform" label="平台" rules={[{ required: true }]}>
            <Select options={[{ value: "win", label: "Windows" }, { value: "mac", label: "macOS" }]} />
          </Form.Item>
          <Form.Item name="version" label="版本号" rules={[{ required: true }]}>
            <Input placeholder="0.1.0" />
          </Form.Item>
          <Form.Item name="url" label="安装包下载地址" rules={[{ required: true }]}>
            <Input placeholder="https://dl.codress.cc/Codress-0.1.0.exe" />
          </Form.Item>
          <Form.Item name="notes" label="更新说明">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="mandatory" valuePropName="checked">
            <Checkbox>强制更新</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
