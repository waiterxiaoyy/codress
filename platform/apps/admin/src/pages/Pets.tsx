import { useCallback, useEffect, useState } from "react";
import {
  Button, Checkbox, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Upload, message,
} from "antd";
import { api, errorText } from "../api";

interface PetRow {
  id: number;
  slug: string;
  name: string;
  description: string;
  category: string;
  targets: string[];
  animation: string;
  status: string;
  downloads: number;
  imageUrl: string;
}

export default function Pets() {
  const [rows, setRows] = useState<PetRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<PetRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    const { data } = await api.get("/admin/pets", { params: { page, pageSize: 10 } });
    setRows(data.items);
    setTotal(data.total);
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    const values = await form.validateFields();
    try {
      if (creating) await api.post("/admin/pets", values);
      else if (editing) await api.put(`/admin/pets/${editing.id}`, values);
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
      <Space style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          onClick={() => {
            form.resetFields();
            form.setFieldsValue({ targets: ["codex"], animation: "bounce", sort: 0 });
            setCreating(true);
          }}
        >
          新建宠物
        </Button>
      </Space>
      <Table<PetRow>
        rowKey="id"
        size="middle"
        dataSource={rows}
        pagination={{ current: page, total, pageSize: 10, onChange: setPage }}
        columns={[
          {
            title: "形象", width: 80,
            render: (_, row) =>
              row.imageUrl ? (
                <img src={row.imageUrl} alt="" style={{ width: 48, height: 48, objectFit: "contain", border: "1px solid #eee" }} />
              ) : (
                <div className="thumb" style={{ width: 48, height: 48 }} />
              ),
          },
          { title: "Slug", dataIndex: "slug", className: "mono" },
          { title: "名称", dataIndex: "name" },
          { title: "动画", dataIndex: "animation", width: 90 },
          {
            title: "平台", dataIndex: "targets", width: 130,
            render: (targets: string[]) => (targets ?? []).join(" / "),
          },
          {
            title: "状态", dataIndex: "status", width: 90,
            render: (status: string) => (
              <span className={`status-pill ${status === "published" ? "" : "muted"}`}>
                {status === "published" ? "已上架" : status === "draft" ? "草稿" : "已下架"}
              </span>
            ),
          },
          { title: "下载", dataIndex: "downloads", width: 80 },
          {
            title: "操作", width: 330,
            render: (_, row) => (
              <Space size="small" wrap>
                <Button size="small" onClick={() => { form.setFieldsValue(row); setEditing(row); }}>编辑</Button>
                <Upload
                  showUploadList={false}
                  customRequest={async (options) => {
                    const fd = new FormData();
                    fd.append("image", options.file as Blob);
                    try {
                      await api.post(`/admin/pets/${row.id}/assets`, fd);
                      message.success("形象已上传");
                      options.onSuccess?.({});
                      load();
                    } catch (error) {
                      message.error(errorText(error));
                    }
                  }}
                >
                  <Button size="small">传形象</Button>
                </Upload>
                {row.status !== "published" ? (
                  <Button
                    size="small" type="primary"
                    onClick={async () => {
                      try {
                        await api.post(`/admin/pets/${row.id}/status`, { status: "published" });
                        message.success("已上架");
                        load();
                      } catch (error) { message.error(errorText(error)); }
                    }}
                  >
                    上架
                  </Button>
                ) : (
                  <Button
                    size="small"
                    onClick={async () => {
                      await api.post(`/admin/pets/${row.id}/status`, { status: "offline" });
                      load();
                    }}
                  >
                    下架
                  </Button>
                )}
                <Popconfirm
                  title="确认删除?"
                  onConfirm={async () => {
                    await api.delete(`/admin/pets/${row.id}`);
                    load();
                  }}
                >
                  <Button size="small" danger>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={creating ? "新建宠物" : `编辑:${editing?.name ?? ""}`}
        open={creating || !!editing}
        onOk={submit}
        onCancel={() => { setCreating(false); setEditing(null); }}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="slug" label="Slug"
            rules={[{ required: true, pattern: /^[a-z0-9][a-z0-9-]{0,79}$/, message: "小写字母/数字/连字符" }]}
          >
            <Input disabled={!creating} placeholder="pixel-cat" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="category" label="分类">
            <Input placeholder="pixel / animal" />
          </Form.Item>
          <Form.Item name="targets" label="适用平台" rules={[{ required: true }]}>
            <Checkbox.Group options={[{ label: "Codex", value: "codex" }, { label: "WorkBuddy", value: "workbuddy" }]} />
          </Form.Item>
          <Form.Item name="animation" label="动画">
            <Select
              options={[
                { value: "idle", label: "静止" },
                { value: "bounce", label: "跳动" },
                { value: "walk", label: "走动" },
              ]}
            />
          </Form.Item>
          <Form.Item name="sort" label="排序权重">
            <InputNumber style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
