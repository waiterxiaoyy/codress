import { useCallback, useEffect, useState } from "react";
import {
  Button, Checkbox, Descriptions, Drawer, Form, Input, InputNumber, Modal,
  Popconfirm, Segmented, Select, Space, Table, Tag, Upload, message,
} from "antd";
import { CloudUploadOutlined, EyeOutlined } from "@ant-design/icons";
import SpriteSheetPreview, {
  PET_ANIMATIONS, type PetAnimationId,
} from "../components/SpriteSheetPreview";
import { api, errorText } from "../api";

interface PetManifest {
  id?: string;
  displayName?: string;
  description?: string;
  spriteVersionNumber?: number;
  spritesheetPath?: string;
}

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
  spriteSheet?: string;
  manifest?: PetManifest;
  stylePreset?: string;
  tags?: string;
  author?: string;
  sizeBytes?: number;
  hash?: string;
}

function formatBytes(bytes?: number) {
  if (!bytes) return "-";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function Pets() {
  const [rows, setRows] = useState<PetRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<PetRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<PetRow | null>(null);
  const [detailAnimation, setDetailAnimation] = useState<PetAnimationId>("idle");
  const [uploading, setUploading] = useState<string | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    const { data } = await api.get("/admin/pets", { params: { page, pageSize: 10 } });
    setRows(data.items);
    setTotal(data.total);
    setDetail((current) => current
      ? data.items.find((item: PetRow) => item.id === current.id) ?? current
      : null);
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

  const uploadAsset = (row: PetRow, field: "image" | "spritesheet") => ({
    showUploadList: false,
    accept: ".png,.jpg,.jpeg,.webp",
    customRequest: async (options: {
      file: unknown;
      onSuccess?: (body: unknown) => void;
      onError?: (error: Error) => void;
    }) => {
      const key = `${row.id}:${field}`;
      const fd = new FormData();
      fd.append(field, options.file as Blob);
      setUploading(key);
      try {
        await api.post(`/admin/pets/${row.id}/assets`, fd);
        message.success(field === "spritesheet" ? "动作精灵图已上传" : "封面形象已上传");
        options.onSuccess?.({});
        await load();
      } catch (error) {
        const text = errorText(error);
        message.error(text);
        options.onError?.(new Error(text));
      } finally {
        setUploading(null);
      }
    },
  });

  const openDetail = (row: PetRow) => {
    setDetailAnimation("idle");
    setDetail(row);
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          onClick={() => {
            form.resetFields();
            form.setFieldsValue({
              targets: ["codex"], animation: "idle", sort: 0,
              stylePreset: "pixel",
            });
            setCreating(true);
          }}
        >
          新建宠物
        </Button>
        <span style={{ color: "#777", fontSize: 12 }}>
          Codex v2 使用 8×11 精灵图；上传后可在详情中检查 9 种动作。
        </span>
      </Space>
      <Table<PetRow>
        rowKey="id"
        size="middle"
        dataSource={rows}
        pagination={{ current: page, total, pageSize: 10, onChange: setPage }}
        onRow={(row) => ({ onDoubleClick: () => openDetail(row) })}
        columns={[
          {
            title: "形象", width: 88,
            render: (_, row) => (
              <button
                type="button"
                aria-label={`查看 ${row.name} 动作`}
                onClick={() => openDetail(row)}
                style={{ padding: 0, border: 0, background: "transparent", cursor: "pointer" }}
              >
                <SpriteSheetPreview
                  spriteSheet={row.spriteSheet}
                  imageUrl={row.imageUrl}
                  name={row.name}
                  size={56}
                />
              </button>
            ),
          },
          {
            title: "宠物",
            render: (_, row) => (
              <div>
                <strong>{row.name}</strong>
                <div className="mono" style={{ color: "#888" }}>{row.slug}</div>
              </div>
            ),
          },
          {
            title: "资源", width: 120,
            render: (_, row) => (
              <Space direction="vertical" size={2}>
                <Tag color={row.spriteSheet ? "green" : "default"}>
                  {row.spriteSheet ? "动作图已上传" : "缺少动作图"}
                </Tag>
                <span style={{ color: "#888", fontSize: 11 }}>{formatBytes(row.sizeBytes)}</span>
              </Space>
            ),
          },
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
          { title: "下载", dataIndex: "downloads", width: 70 },
          {
            title: "操作", width: 390,
            render: (_, row) => (
              <Space size="small" wrap>
                <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(row)}>详情</Button>
                <Button size="small" onClick={() => { form.setFieldsValue(row); setEditing(row); }}>编辑</Button>
                <Upload {...uploadAsset(row, "image")}>
                  <Button size="small" loading={uploading === `${row.id}:image`}>传封面</Button>
                </Upload>
                <Upload {...uploadAsset(row, "spritesheet")}>
                  <Button
                    size="small"
                    icon={<CloudUploadOutlined />}
                    loading={uploading === `${row.id}:spritesheet`}
                  >
                    传动作图
                  </Button>
                </Upload>
                {row.status !== "published" ? (
                  <Button
                    size="small" type="primary" disabled={!row.spriteSheet && !row.imageUrl}
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
                  <Button size="small" onClick={async () => {
                    await api.post(`/admin/pets/${row.id}/status`, { status: "offline" });
                    load();
                  }}>
                    下架
                  </Button>
                )}
                <Popconfirm title="确认删除?" onConfirm={async () => {
                  await api.delete(`/admin/pets/${row.id}`);
                  load();
                }}>
                  <Button size="small" danger>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Drawer
        title={detail ? `${detail.name} · 动作详情` : "宠物详情"}
        open={!!detail}
        onClose={() => setDetail(null)}
        width={620}
      >
        {detail && (
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <div className="pet-detail-preview">
              <SpriteSheetPreview
                spriteSheet={detail.spriteSheet}
                imageUrl={detail.imageUrl}
                name={detail.name}
                animation={detailAnimation}
                size={240}
              />
            </div>
            <Segmented
              block
              value={detailAnimation}
              options={PET_ANIMATIONS.map((item) => ({ value: item.id, label: item.label }))}
              onChange={(value) => setDetailAnimation(value as PetAnimationId)}
            />
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="Slug">{detail.slug}</Descriptions.Item>
              <Descriptions.Item label="平台">{detail.targets?.join(" / ")}</Descriptions.Item>
              <Descriptions.Item label="精灵版本">
                {detail.manifest?.spriteVersionNumber ?? (detail.spriteSheet ? "待补 manifest" : "-")}
              </Descriptions.Item>
              <Descriptions.Item label="文件大小">{formatBytes(detail.sizeBytes)}</Descriptions.Item>
              <Descriptions.Item label="样式">{detail.stylePreset || "-"}</Descriptions.Item>
              <Descriptions.Item label="作者">{detail.author || "-"}</Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>{detail.description || "-"}</Descriptions.Item>
              <Descriptions.Item label="资源检查" span={2}>
                {detail.spriteSheet
                  ? "精灵图可读取；请逐项播放 9 种动作后再上架。"
                  : "缺少 spritesheet，仅能使用静态封面。"}
              </Descriptions.Item>
            </Descriptions>
            <Space>
              <Upload {...uploadAsset(detail, "image")}>
                <Button>替换封面</Button>
              </Upload>
              <Upload {...uploadAsset(detail, "spritesheet")}>
                <Button type="primary" icon={<CloudUploadOutlined />}>替换动作精灵图</Button>
              </Upload>
            </Space>
          </Space>
        )}
      </Drawer>

      <Modal
        title={creating ? "新建宠物" : `编辑：${editing?.name ?? ""}`}
        open={creating || !!editing}
        onOk={submit}
        onCancel={() => { setCreating(false); setEditing(null); }}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="slug" label="Slug"
            rules={[{ required: true, pattern: /^[a-z0-9][a-z0-9-]{0,79}$/, message: "小写字母/数字/连字符" }]}>
            <Input disabled={!creating} placeholder="pixel-cat" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="category" label="分类"><Input placeholder="pixel / animal" /></Form.Item>
          <Form.Item name="targets" label="适用平台" rules={[{ required: true }]}>
            <Checkbox.Group options={[{ label: "Codex", value: "codex" }, { label: "WorkBuddy", value: "workbuddy" }]} />
          </Form.Item>
          <Space size="middle" style={{ display: "flex" }} align="start">
            <Form.Item name="animation" label="旧版静态动画">
              <Select style={{ width: 150 }} options={[
                { value: "idle", label: "静止" },
                { value: "bounce", label: "跳动" },
                { value: "walk", label: "走动" },
              ]} />
            </Form.Item>
            <Form.Item name="stylePreset" label="视觉样式">
              <Select style={{ width: 160 }} options={[
                "pixel", "plush", "clay", "sticker", "flat-vector", "3d-toy", "auto",
              ].map((value) => ({ value, label: value }))} />
            </Form.Item>
            <Form.Item name="sort" label="排序权重"><InputNumber /></Form.Item>
          </Space>
          <Form.Item name="tags" label="标签"><Input placeholder="像素,动物,可爱" /></Form.Item>
          <Form.Item name="author" label="作者/来源"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
