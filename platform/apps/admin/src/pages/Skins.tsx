import { useCallback, useEffect, useState } from "react";
import {
  Button, Checkbox, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Upload, message,
} from "antd";
import { api, errorText } from "../api";

interface SkinRow {
  id: number;
  slug: string;
  name: string;
  description: string;
  author: string;
  category: string;
  targets: string[];
  appearance: string;
  status: string;
  downloads: number;
  sort: number;
  backgroundUrl: string;
  previewLightUrl: string;
}

interface CategoryRow { slug: string; name: string }

export default function Skins() {
  const [rows, setRows] = useState<SkinRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [editing, setEditing] = useState<SkinRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [assetsFor, setAssetsFor] = useState<SkinRow | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    const { data } = await api.get("/admin/skins", { params: { page, pageSize: 10, q: query } });
    setRows(data.items);
    setTotal(data.total);
  }, [page, query]);

  useEffect(() => {
    load();
    api.get("/admin/categories", { params: { type: "skin" } }).then((r) => setCategories(r.data.items));
  }, [load]);

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ targets: ["codex"], appearance: "auto", sort: 0 });
    setCreating(true);
  };

  const openEdit = (row: SkinRow) => {
    form.setFieldsValue(row);
    setEditing(row);
  };

  const submit = async () => {
    const values = await form.validateFields();
    try {
      if (creating) await api.post("/admin/skins", values);
      else if (editing) await api.put(`/admin/skins/${editing.id}`, values);
      message.success("已保存");
      setCreating(false);
      setEditing(null);
      load();
    } catch (error) {
      message.error(errorText(error));
    }
  };

  const setStatus = async (row: SkinRow, status: string) => {
    try {
      await api.post(`/admin/skins/${row.id}/status`, { status });
      message.success(status === "published" ? "已上架" : "已下架");
      load();
    } catch (error) {
      message.error(errorText(error));
    }
  };

  const uploadProps = (field: string) => ({
    showUploadList: false,
    customRequest: async (options: { file: unknown; onSuccess?: (body: unknown) => void; onError?: (e: Error) => void }) => {
      const fd = new FormData();
      fd.append(field, options.file as Blob);
      try {
        await api.post(`/admin/skins/${assetsFor!.id}/assets`, fd);
        message.success(`${field} 上传成功`);
        options.onSuccess?.({});
        load();
      } catch (error) {
        message.error(errorText(error));
        options.onError?.(new Error(errorText(error)));
      }
    },
  });

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="搜索名称 / slug"
          allowClear
          onSearch={(v) => { setPage(1); setQuery(v); }}
          style={{ width: 260 }}
        />
        <Button type="primary" onClick={openCreate}>新建皮肤</Button>
      </Space>
      <Table<SkinRow>
        rowKey="id"
        size="middle"
        dataSource={rows}
        pagination={{ current: page, total, pageSize: 10, onChange: setPage }}
        columns={[
          {
            title: "预览", width: 96,
            render: (_, row) =>
              row.backgroundUrl ? <img className="thumb" src={row.backgroundUrl} alt="" /> : <div className="thumb" />,
          },
          { title: "Slug", dataIndex: "slug", className: "mono" },
          { title: "名称", dataIndex: "name" },
          { title: "分类", dataIndex: "category", width: 100 },
          {
            title: "平台", dataIndex: "targets", width: 150,
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
            title: "操作", width: 300,
            render: (_, row) => (
              <Space size="small" wrap>
                <Button size="small" onClick={() => openEdit(row)}>编辑</Button>
                <Button size="small" onClick={() => setAssetsFor(row)}>素材</Button>
                {row.status !== "published" ? (
                  <Button size="small" type="primary" onClick={() => setStatus(row, "published")}>上架</Button>
                ) : (
                  <Button size="small" onClick={() => setStatus(row, "offline")}>下架</Button>
                )}
                <Popconfirm
                  title="确认删除该皮肤及其素材?"
                  onConfirm={async () => {
                    await api.delete(`/admin/skins/${row.id}`);
                    message.success("已删除");
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
        title={creating ? "新建皮肤" : `编辑:${editing?.name ?? ""}`}
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
            <Input disabled={!creating} placeholder="night-city" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="author" label="作者">
            <Input />
          </Form.Item>
          <Form.Item name="category" label="分类">
            <Select
              allowClear
              options={categories.map((c) => ({ value: c.slug, label: `${c.name} (${c.slug})` }))}
            />
          </Form.Item>
          <Form.Item name="targets" label="适用平台" rules={[{ required: true }]}>
            <Checkbox.Group options={[{ label: "Codex", value: "codex" }, { label: "WorkBuddy", value: "workbuddy" }]} />
          </Form.Item>
          <Form.Item name="appearance" label="外观">
            <Select
              options={[
                { value: "auto", label: "自动(跟随应用)" },
                { value: "light", label: "浅色" },
                { value: "dark", label: "暗色" },
              ]}
            />
          </Form.Item>
          <Form.Item name="sort" label="排序权重">
            <InputNumber style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`素材:${assetsFor?.name ?? ""}`}
        open={!!assetsFor}
        footer={null}
        onCancel={() => setAssetsFor(null)}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <div>
            <div style={{ marginBottom: 8, color: "#888" }}>
              背景图(必需,2560×1440 · 16:9 · 无 UI 纯壁纸,≤16MB)
            </div>
            <Upload {...uploadProps("background")}>
              <Button>上传背景图</Button>
            </Upload>
          </div>
          <div>
            <div style={{ marginBottom: 8, color: "#888" }}>浅色预览图(可选)</div>
            <Upload {...uploadProps("previewLight")}>
              <Button>上传浅色预览</Button>
            </Upload>
          </div>
          <div>
            <div style={{ marginBottom: 8, color: "#888" }}>暗色预览图(可选)</div>
            <Upload {...uploadProps("previewDark")}>
              <Button>上传暗色预览</Button>
            </Upload>
          </div>
        </Space>
      </Modal>
    </div>
  );
}
