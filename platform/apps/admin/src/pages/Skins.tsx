import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, Button, Checkbox, Col, Collapse, Form, Input, InputNumber,
  Modal, Popconfirm, Row, Segmented, Select, Space, Table, Tag, Tooltip, Upload, message,
} from "antd";
import {
  BulbOutlined, CloudUploadOutlined, CopyOutlined,
  DesktopOutlined, RocketOutlined,
} from "@ant-design/icons";
import { api, errorText } from "../api";

/* ─── 类型 ─── */
interface ArtConfig {
  safeArea?: "auto" | "left" | "right" | "center" | "none";
  taskMode?: "auto" | "ambient" | "banner" | "off";
  focusX?: number;
  focusY?: number;
}
interface SkinRow {
  id: number; slug: string; name: string; description: string;
  author: string; category: string; targets: string[];
  appearance: string; status: string; downloads: number; sort: number;
  backgroundUrl: string; previewLightUrl: string; previewDarkUrl?: string;
  art?: ArtConfig; colors?: Record<string, string>;
  tagline?: string; quote?: string; statusText?: string;
  brandSubtitle?: string; projectPrefix?: string; projectLabel?: string;
}
interface CategoryRow { slug: string; name: string }

/* ─── 颜色字段列表 ─── */
const COLOR_KEYS = ["background", "panel", "panelAlt", "accent", "accentAlt",
  "secondary", "highlight", "text", "muted", "line"];

/* ─── 颜色预览 swatch ─── */
function Swatch({ color }: { color?: string }) {
  if (!color) return null;
  return (
    <span
      style={{
        display: "inline-block", width: 14, height: 14,
        borderRadius: 3, background: color,
        border: "1px solid rgba(0,0,0,.15)", verticalAlign: "middle",
        marginRight: 6,
      }}
    />
  );
}

function hexLuminance(value?: string) {
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return null;
  const channels = [1, 3, 5].map((index) => {
    const channel = parseInt(value.slice(index, index + 2), 16) / 255;
    return channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}

function contrastRatio(foreground?: string, background?: string) {
  const fg = hexLuminance(foreground);
  const bg = hexLuminance(background);
  if (fg == null || bg == null) return null;
  return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
}

function SkinWorkspacePreview({ skin, imageUrl }: { skin: SkinRow; imageUrl?: string }) {
  const colors = skin.colors ?? {};
  const contrast = contrastRatio(colors.text, colors.panel);
  return (
    <Space direction="vertical" size="small" style={{ width: "100%" }}>
      <div
        className="admin-preview-panel"
        style={{
          "--preview-text": colors.text || "#f4f6f8",
          "--preview-panel": colors.panel || "#151922",
          "--preview-accent": colors.accent || "#778da0",
          "--preview-selected-text": colors.text || "#fff",
        } as React.CSSProperties}
      >
        {imageUrl && (
          <img
            src={imageUrl}
            alt={`${skin.name} 工作区预览`}
            style={{
              objectPosition: `${(skin.art?.focusX ?? .5) * 100}% ${(skin.art?.focusY ?? .5) * 100}%`,
            }}
          />
        )}
        <div className="admin-preview-mask" />
        <div className="admin-preview-shell">
          <aside className="admin-preview-sidebar">
            <div className="admin-preview-brand">CODRESS</div>
            <div className="admin-preview-nav">生成主题图片</div>
            <div className="admin-preview-nav selected">皮肤调试</div>
            <div className="admin-preview-nav">宠物管理</div>
          </aside>
          <section className="admin-preview-content">
            <div style={{ fontSize: 20, fontWeight: 700 }}>{skin.name}</div>
            <div className="admin-preview-muted">{skin.tagline || "真实客户端语义层预览"}</div>
            <div className="admin-preview-card">
              <strong>环境信息</strong>
              <p className="admin-preview-muted">检查正文、弱文字、边框和选中态是否清晰。</p>
              <div className="admin-preview-nav selected">当前选中项目</div>
            </div>
          </section>
        </div>
      </div>
      {contrast != null && (
        <Alert
          type={contrast >= 4.5 ? "success" : "warning"}
          showIcon
          message={`正文 / 面板对比度 ${contrast.toFixed(2)}:1${contrast >= 4.5 ? "，通过" : "，建议至少 4.5:1"}`}
        />
      )}
    </Space>
  );
}

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

  /* AI 生成状态 */
  const [aiVisible, setAiVisible] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiMeta, setAiMeta] = useState<Record<string, unknown> | null>(null);
  const [imgPromptLoading, setImgPromptLoading] = useState(false);
  const [imgPrompt, setImgPrompt] = useState("");
  const [applyLoading, setApplyLoading] = useState<number | null>(null);
  const [assetPreviewMode, setAssetPreviewMode] = useState<"background" | "light" | "dark">("background");
  const imgPromptRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    const { data } = await api.get("/admin/skins", { params: { page, pageSize: 10, q: query } });
    setRows(data.items);
    setTotal(data.total);
  }, [page, query]);

  useEffect(() => {
    load();
    api.get("/admin/categories", { params: { type: "skin" } }).then((r) => setCategories(r.data.items));
  }, [load]);

  /* ─── 表单工具 ─── */
  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      targets: ["codex"], appearance: "auto", sort: 0,
      brandSubtitle: "CODRESS",
      projectPrefix: "选择项目 · ", projectLabel: "◉  选择项目",
      quote: "MAKE SOMETHING WONDERFUL",
      art: { safeArea: "left", taskMode: "ambient" },
    });
    setCreating(true);
  };

  const openEdit = (row: SkinRow) => {
    form.setFieldsValue({
      ...row,
      art: row.art ?? { safeArea: "left", taskMode: "ambient" },
      "art.safeArea": row.art?.safeArea ?? "left",
      "art.taskMode": row.art?.taskMode ?? "ambient",
      "art.focusX": row.art?.focusX,
      "art.focusY": row.art?.focusY,
      ...(row.colors ? Object.fromEntries(COLOR_KEYS.map((k) => [`color_${k}`, row.colors?.[k] ?? ""])) : {}),
    });
    setEditing(row);
  };

  const collectFormValues = (values: Record<string, unknown>) => {
    const art: ArtConfig = {
      safeArea: values["art.safeArea"] as ArtConfig["safeArea"] || "left",
      taskMode: values["art.taskMode"] as ArtConfig["taskMode"] || "ambient",
    };
    if (values["art.focusX"] != null) art.focusX = Number(values["art.focusX"]);
    if (values["art.focusY"] != null) art.focusY = Number(values["art.focusY"]);
    const colors: Record<string, string> = {};
    for (const k of COLOR_KEYS) {
      const v = values[`color_${k}`] as string;
      if (v?.trim()) colors[k] = v.trim();
    }
    return {
      ...values,
      art,
      colors: Object.keys(colors).length ? colors : undefined,
    };
  };

  const submit = async () => {
    const raw = await form.validateFields();
    const values = collectFormValues(raw as Record<string, unknown>);
    try {
      if (creating) await api.post("/admin/skins", values);
      else if (editing) await api.put(`/admin/skins/${editing.id}`, values);
      message.success("已保存");
      setCreating(false); setEditing(null); load();
    } catch (error) { message.error(errorText(error)); }
  };

  const setStatus = async (row: SkinRow, status: string) => {
    try {
      await api.post(`/admin/skins/${row.id}/status`, { status });
      message.success(status === "published" ? "已上架" : "已下架");
      load();
    } catch (error) { message.error(errorText(error)); }
  };

  /* ─── AI 生成 ─── */
  const runAiGenerate = async () => {
    if (!aiPrompt.trim()) { message.warning("请输入皮肤描述"); return; }
    setAiLoading(true); setAiMeta(null); setImgPrompt("");
    try {
      const { data } = await api.post("/admin/skins/ai-generate", { prompt: aiPrompt });
      setAiMeta(data.meta);
    } catch (error) { message.error(errorText(error)); }
    finally { setAiLoading(false); }
  };

  const runImgPrompt = async () => {
    if (!aiMeta) return;
    setImgPromptLoading(true);
    try {
      const { data } = await api.post("/admin/skins/ai-image-prompt", { meta: aiMeta });
      setImgPrompt(data.prompt);
    } catch (error) { message.error(errorText(error)); }
    finally { setImgPromptLoading(false); }
  };

  const applyAiMeta = () => {
    if (!aiMeta) return;
    const m = aiMeta as Record<string, unknown>;
    const art = (m.art ?? {}) as ArtConfig;
    const colors = (m.colors ?? {}) as Record<string, string>;
    form.setFieldsValue({
      slug: m.slug, name: m.name, tagline: m.tagline,
      quote: m.quote, statusText: m.statusText,
      brandSubtitle: m.brandSubtitle || "CODRESS",
      appearance: m.appearance || "auto",
      targets: ["codex"],
      "art.safeArea": art.safeArea || "left",
      "art.taskMode": art.taskMode || "ambient",
      "art.focusX": art.focusX,
      "art.focusY": art.focusY,
      ...Object.fromEntries(COLOR_KEYS.map((k) => [`color_${k}`, colors[k] ?? ""])),
    });
    setAiVisible(false);
    setCreating(true);
    message.success("已填入表单，上传背景图后即可保存上架");
  };

  /* ─── 本地调试应用 ─── */
  const applyLocal = async (row: SkinRow) => {
    setApplyLoading(row.id);
    try {
      if (!row.backgroundUrl) throw new Error("请先上传背景图");
      const target = row.targets.includes("codex") ? "codex" : row.targets[0];
      const { data } = await api.post("/admin/preview-sessions", { skinId: row.id, target });
      const apiBase = import.meta.env.DEV ? "http://127.0.0.1:8080" : window.location.origin;
      const deepLink = `codress://preview?ticket=${encodeURIComponent(data.ticket)}&api=${encodeURIComponent(apiBase)}`;
      window.location.href = deepLink;
      await navigator.clipboard.writeText(deepLink).catch(() => undefined);
      message.success("已发送到 Codress 客户端；调试链接同时复制到剪贴板");
    } catch (error) {
      message.error(errorText(error));
    } finally {
      setApplyLoading(null);
    }
  };

  /* ─── 上传 ─── */
  const uploadProps = (field: string) => ({
    showUploadList: false,
    accept: ".png,.jpg,.jpeg,.webp",
    customRequest: async (options: { file: unknown; onSuccess?: (b: unknown) => void; onError?: (e: Error) => void }) => {
      const fd = new FormData();
      fd.append(field, options.file as Blob);
      try {
        const file = options.file as File;
        if (file.size > 16 * 1024 * 1024) throw new Error("图片不能超过 16 MB");
        const { data } = await api.post(`/admin/skins/${assetsFor!.id}/assets`, fd);
        message.success(`${field} 上传成功`); options.onSuccess?.({});
        setAssetsFor((current) => current ? { ...current, ...data } : current);
        load();
      } catch (error) {
        message.error(errorText(error)); options.onError?.(new Error(errorText(error)));
      }
    },
  });

  /* ─── 表单通用字段 ─── */
  const renderForm = () => (
    <Form form={form} layout="vertical">
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item name="slug" label="Slug"
            rules={[{ required: true, pattern: /^[a-z0-9][a-z0-9-]{0,79}$/, message: "小写字母/数字/连字符" }]}>
            <Input disabled={!creating} placeholder="night-city" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="tagline" label="Tagline（一句描述）">
        <Input placeholder="把喜欢的画面变成可交互的 Codex 工作台。" />
      </Form.Item>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item name="quote" label="格言 Quote">
            <Input placeholder="MAKE SOMETHING WONDERFUL" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="statusText" label="状态文字 StatusText">
            <Input placeholder="CODRESS ONLINE" />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col span={8}>
          <Form.Item name="category" label="分类">
            <Select allowClear options={categories.map((c) => ({ value: c.slug, label: `${c.name}` }))} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="appearance" label="外观">
            <Select options={[
              { value: "auto", label: "自动" },
              { value: "light", label: "浅色" },
              { value: "dark", label: "暗色" },
            ]} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="targets" label="适用平台" rules={[{ required: true }]}>
            <Checkbox.Group options={[{ label: "Codex", value: "codex" }, { label: "WorkBuddy", value: "workbuddy" }]} />
          </Form.Item>
        </Col>
      </Row>

      {/* Art 布局 */}
      <Collapse ghost style={{ marginBottom: 12 }} items={[{
        key: "art", label: "背景布局（Art）",
        children: (
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="art.safeArea" label="主体人物位置 safeArea">
                <Select options={[
                  { value: "left", label: "左侧（left）" },
                  { value: "right", label: "右侧（right）" },
                  { value: "center", label: "居中（center）" },
                  { value: "none", label: "无（none）" },
                  { value: "auto", label: "自动（auto）" },
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="art.taskMode" label="任务页背景 taskMode">
                <Select options={[
                  { value: "ambient", label: "环境氛围（ambient）" },
                  { value: "banner", label: "顶部横幅（banner）" },
                  { value: "off", label: "关闭（off）" },
                  { value: "auto", label: "自动（auto）" },
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="art.focusX" label="焦点 X（0~1）">
                <InputNumber min={0} max={1} step={0.05} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="art.focusY" label="焦点 Y（0~1）">
                <InputNumber min={0} max={1} step={0.05} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
        ),
      }]} />

      {/* 配色 */}
      <Collapse ghost items={[{
        key: "colors", label: "配色方案（Colors）",
        children: (
          <Row gutter={[8, 0]}>
            {COLOR_KEYS.map((k) => (
              <Col span={12} key={k}>
                <Form.Item name={`color_${k}`} label={k} style={{ marginBottom: 8 }}>
                  <Input placeholder={k === "line" ? "rgba(200,165,90,.28)" : "#1a1a2e"} />
                </Form.Item>
              </Col>
            ))}
          </Row>
        ),
      }]} />

      <Row gutter={12}>
        <Col span={8}>
          <Form.Item name="brandSubtitle" label="品牌副标题">
            <Input placeholder="CODRESS" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="author" label="作者">
            <Input />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="sort" label="排序权重">
            <InputNumber style={{ width: "100%" }} />
          </Form.Item>
        </Col>
      </Row>
    </Form>
  );

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search placeholder="搜索名称 / slug" allowClear
          onSearch={(v) => { setPage(1); setQuery(v); }} style={{ width: 260 }} />
        <Button type="primary" onClick={openCreate}>新建皮肤</Button>
        <Button icon={<BulbOutlined />} onClick={() => setAiVisible(true)}>AI 生成</Button>
      </Space>

      <Table<SkinRow>
        rowKey="id" size="middle" dataSource={rows}
        pagination={{ current: page, total, pageSize: 10, onChange: setPage }}
        columns={[
          {
            title: "预览", width: 80,
            render: (_, row) => row.backgroundUrl
              ? <img className="thumb" src={row.backgroundUrl} alt="" />
              : <div className="thumb" />,
          },
          { title: "名称", dataIndex: "name",
            render: (name: string, row) => (
              <div>
                <div style={{ fontWeight: 600 }}>{name}</div>
                <div style={{ fontSize: 11, color: "#aaa" }}>{row.slug}</div>
                {row.tagline && <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{row.tagline}</div>}
              </div>
            ),
          },
          { title: "配色", width: 120,
            render: (_, row) => row.colors ? (
              <Space size={2} wrap>
                {["background", "accent", "text"].map((k) => (
                  <Tooltip key={k} title={`${k}: ${row.colors?.[k]}`}>
                    <Swatch color={row.colors?.[k]} />
                  </Tooltip>
                ))}
              </Space>
            ) : <span style={{ color: "#ccc" }}>-</span>,
          },
          { title: "Art", width: 120,
            render: (_, row) => row.art ? (
              <div style={{ fontSize: 11 }}>
                <div>{row.art.safeArea ?? "-"}</div>
                <div>{row.art.taskMode ?? "-"}</div>
              </div>
            ) : <span style={{ color: "#ccc" }}>-</span>,
          },
          { title: "状态", dataIndex: "status", width: 80,
            render: (s: string) => (
              <Tag color={s === "published" ? "green" : s === "draft" ? "default" : "red"}>
                {s === "published" ? "已上架" : s === "draft" ? "草稿" : "下架"}
              </Tag>
            ),
          },
          { title: "下载", dataIndex: "downloads", width: 70 },
          {
            title: "操作", width: 280,
            render: (_, row) => (
              <Space size="small" wrap>
                <Button size="small" onClick={() => openEdit(row)}>编辑</Button>
                <Button size="small" icon={<CloudUploadOutlined />} onClick={() => setAssetsFor(row)}>素材</Button>
                <Tooltip title="复制 slug / 在桌面客户端应用预览">
                  <Button
                    size="small" icon={<DesktopOutlined />}
                    loading={applyLoading === row.id}
                    onClick={() => applyLocal(row)}
                  >
                    调试
                  </Button>
                </Tooltip>
                {row.status !== "published" ? (
                  <Button size="small" type="primary" onClick={() => setStatus(row, "published")}>上架</Button>
                ) : (
                  <Button size="small" onClick={() => setStatus(row, "offline")}>下架</Button>
                )}
                <Popconfirm title="确认删除该皮肤?" onConfirm={async () => {
                  await api.delete(`/admin/skins/${row.id}`); message.success("已删除"); load();
                }}>
                  <Button size="small" danger>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      {/* 新建/编辑弹窗 */}
      <Modal
        title={creating ? "新建皮肤" : `编辑：${editing?.name ?? ""}`}
        open={creating || !!editing} width={720}
        onOk={submit} onCancel={() => { setCreating(false); setEditing(null); }}
        destroyOnClose okText="保存"
      >
        {renderForm()}
      </Modal>

      {/* 素材上传 */}
      <Modal title={`皮肤工作台：${assetsFor?.name ?? ""}`} open={!!assetsFor}
        width={980} footer={null} onCancel={() => setAssetsFor(null)} destroyOnClose>
        {assetsFor && <Row gutter={20}>
          <Col span={16}>
            <Segmented
              block
              value={assetPreviewMode}
              options={[
                { value: "background", label: "真实背景" },
                { value: "light", label: "浅色预览" },
                { value: "dark", label: "暗色预览" },
              ]}
              onChange={(value) => setAssetPreviewMode(value as typeof assetPreviewMode)}
              style={{ marginBottom: 12 }}
            />
            <SkinWorkspacePreview
              skin={assetsFor}
              imageUrl={assetPreviewMode === "light"
                ? assetsFor.previewLightUrl || assetsFor.backgroundUrl
                : assetPreviewMode === "dark"
                  ? assetsFor.previewDarkUrl || assetsFor.backgroundUrl
                  : assetsFor.backgroundUrl}
            />
          </Col>
          <Col span={8}>
            <Space direction="vertical" style={{ width: "100%" }} size="large">
              <Alert
                type="info"
                showIcon
                message="建议使用 16:9、2560×1440 的纯壁纸，主体避开菜单与正文区域。"
              />
              <div>
                <strong>背景图（必需）</strong>
                <div style={{ margin: "4px 0 10px", color: "#888", fontSize: 12 }}>≤16 MB，发布与客户端调试的原图</div>
                <Upload {...uploadProps("background")}>
                  <Button icon={<CloudUploadOutlined />} block>上传 / 替换背景图</Button>
                </Upload>
              </div>
              <div>
                <strong>商店预览图（可选）</strong>
                <div style={{ margin: "4px 0 10px", color: "#888", fontSize: 12 }}>不上传时自动回退到背景图</div>
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Upload {...uploadProps("previewLight")}><Button block>上传浅色预览</Button></Upload>
                  <Upload {...uploadProps("previewDark")}><Button block>上传暗色预览</Button></Upload>
                </Space>
              </div>
              <Button
                type="primary"
                icon={<DesktopOutlined />}
                loading={applyLoading === assetsFor.id}
                disabled={!assetsFor.backgroundUrl}
                onClick={() => applyLocal(assetsFor)}
                block
              >
                在客户端临时调试
              </Button>
              <div style={{ color: "#888", fontSize: 12 }}>
                调试票据两分钟内有效且只能使用一次；客户端不会获得管理员权限。
              </div>
            </Space>
          </Col>
        </Row>}
      </Modal>

      {/* AI 生成面板 */}
      <Modal
        title={<Space><BulbOutlined /> AI 生成皮肤</Space>}
        open={aiVisible} width={680}
        footer={aiMeta ? (
          <Space>
            <Button onClick={() => setAiMeta(null)}>重新生成</Button>
            <Button icon={<CopyOutlined />} loading={imgPromptLoading} onClick={runImgPrompt}>
              生成生图提示词
            </Button>
            <Button type="primary" icon={<RocketOutlined />} onClick={applyAiMeta}>
              填入表单
            </Button>
          </Space>
        ) : null}
        onCancel={() => { setAiVisible(false); setAiMeta(null); setImgPrompt(""); }}
        destroyOnClose
      >
        {!aiMeta ? (
          <div>
            <div style={{ marginBottom: 12, color: "#666", fontSize: 13 }}>
              描述你想要的皮肤风格，AI 会自动生成完整的配色方案和布局参数。
            </div>
            <Input.TextArea
              rows={4}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="例如：赛博朋克风格，紫色霓虹夜景，主体人物在左侧，暗色主题，配色以深紫和霓虹蓝为主"
              onPressEnter={(e) => { if (e.ctrlKey || e.metaKey) runAiGenerate(); }}
            />
            <div style={{ marginTop: 8, color: "#999", fontSize: 12 }}>Ctrl+Enter 快速生成</div>
            <Button
              type="primary" icon={<BulbOutlined />} loading={aiLoading}
              style={{ marginTop: 12 }} onClick={runAiGenerate} block
            >
              生成皮肤元数据
            </Button>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 8, fontWeight: 600 }}>生成结果预览：</div>
            <pre style={{
              background: "#f6f6f6", borderRadius: 6, padding: 12,
              fontSize: 12, maxHeight: 300, overflow: "auto",
            }}>
              {JSON.stringify(aiMeta, null, 2)}
            </pre>
            {imgPrompt && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>生图提示词：</div>
                <Input.TextArea
                  ref={imgPromptRef as React.RefObject<HTMLTextAreaElement>}
                  rows={4} readOnly value={imgPrompt}
                  style={{ fontSize: 12 }}
                />
                <Button
                  size="small" icon={<CopyOutlined />} style={{ marginTop: 6 }}
                  onClick={() => { navigator.clipboard.writeText(imgPrompt); message.success("已复制"); }}
                >
                  复制提示词
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
