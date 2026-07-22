import { useEffect, useMemo, useState } from "react";
import { bridge, type CreatorAiConfig, type CreatorDraft, type DiscoveredProvider } from "../bridge";
import { useToast } from "../toast";
import { UnifiedSelect, type SelectOption } from "../components/UnifiedSelect";
import claudeIcon from "../assets/ccswitch-claude.svg";
import codexIcon from "../assets/ccswitch-codex.svg";

type CreatorKind = "theme" | "pet";

const WORKFLOWS: Record<CreatorKind, { title: string; detail: string }[]> = {
  theme: [
    { title: "创作描述", detail: "确定氛围、主体、留白和目标应用" },
    { title: "首张预览", detail: "生成 16:9 纯背景，不在图片内绘制 UI" },
    { title: "细节调整", detail: "重绘、上传替换，并在 Codex / WorkBuddy 中预览" },
    { title: "安装与投稿", detail: "生成主题元数据；本地安装或提交商店审核" },
  ],
  pet: [
    { title: "创作描述", detail: "角色设定、风格、轮廓与身份特征" },
    { title: "角色定稿", detail: "先锁定唯一主形象，后续动作都以它为准" },
    { title: "动作生成", detail: "生成并检查 9 个标准动作和连续帧" },
    { title: "方向补全", detail: "补齐 16 个注视方向并检查角度连续性" },
    { title: "校验与打包", detail: "组装 1536×2288 图集，输出 v2 安装包" },
  ],
};

const STATUS_LABEL: Record<CreatorDraft["status"], string> = {
  draft: "草稿",
  ready: "准备生成",
  generating: "生成中",
  review: "待检查",
  complete: "已完成",
  failed: "需要处理",
};

export default function Creator() {
  const toast = useToast();
  const [kind, setKind] = useState<CreatorKind>("theme");
  const [drafts, setDrafts] = useState<CreatorDraft[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [style, setStyle] = useState("");
  const [target, setTarget] = useState("codex");
  const [saving, setSaving] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [config, setConfig] = useState<CreatorAiConfig>();
  const [protocol, setProtocol] = useState<"openai" | "anthropic">("openai");
  const [providers, setProviders] = useState<DiscoveredProvider[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [textModel, setTextModel] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [configBusy, setConfigBusy] = useState(false);

  const refresh = async () => {
    const [nextConfig, nextDrafts, nextProviders] = await Promise.all([
      bridge.getCreatorConfig(),
      bridge.creatorDrafts(),
      bridge.discoverCreatorProviders(),
    ]);
    setConfig(nextConfig);
    setDrafts(nextDrafts);
    setProviders(nextProviders);
    setProtocol(nextConfig.protocol);
    setBaseUrl(nextConfig.baseUrl);
    setTextModel(nextConfig.textModel);
    setImageModel(nextConfig.imageModel);
  };

  useEffect(() => { refresh().catch((error) => toast((error as Error).message, true)); }, []);

  const workflow = WORKFLOWS[kind];
  const activeDraft = useMemo(() => drafts.find((draft) => draft.id === activeId), [activeId, drafts]);
  const modelOptions = useMemo<SelectOption[]>(() => {
    return [...models.map((model) => ({ value: model, label: model, description: "接口返回" })), { value: "__manual__", label: "手工输入其他模型…" }];
  }, [models]);
  const targetOptions = useMemo<SelectOption[]>(() => [
    { value: "codex", label: "Codex" },
    ...(kind === "theme" ? [{ value: "workbuddy", label: "WorkBuddy" }] : []),
  ], [kind]);

  const reset = (nextKind = kind) => {
    setKind(nextKind);
    setActiveId(undefined);
    setName("");
    setBrief("");
    setStyle("");
    setTarget("codex");
  };

  const openDraft = (draft: CreatorDraft) => {
    setKind(draft.kind);
    setActiveId(draft.id);
    setName(draft.name);
    setBrief(draft.brief);
    setStyle(draft.style);
    setTarget(draft.target);
  };

  const saveDraft = async (ready = false) => {
    if (!name.trim() || !brief.trim()) {
      toast("请先填写名称和创作描述", true);
      return;
    }
    if (ready && !config?.hasApiKey) {
      setConfigOpen(true);
      toast("开始生成前，请先配置 AI 服务", true);
      return;
    }
    setSaving(true);
    try {
      const saved = await bridge.saveCreatorDraft({
        id: activeId,
        kind,
        name,
        brief,
        style,
        target,
        status: ready ? "ready" : activeDraft?.status ?? "draft",
        stage: activeDraft?.stage ?? 0,
      });
      setActiveId(saved.id);
      await refresh();
      toast(ready ? "方案已就绪，等待生成执行器" : "草稿已保存");
    } catch (error) {
      toast((error as Error).message || "保存失败", true);
    } finally {
      setSaving(false);
    }
  };

  const removeDraft = async (draft: CreatorDraft) => {
    if (!window.confirm(`删除草稿“${draft.name}”？`)) return;
    await bridge.deleteCreatorDraft(draft.id);
    if (draft.id === activeId) reset(kind);
    await refresh();
    toast("草稿已删除");
  };

  const saveConfig = async () => {
    setConfigBusy(true);
    try {
      const next = await bridge.saveCreatorConfig({ protocol, label: "手动配置", baseUrl, apiKey: apiKey || undefined, textModel, imageModel });
      setConfig(next);
      setApiKey("");
      toast("AI 服务配置已安全保存");
    } catch (error) {
      toast((error as Error).message || "保存失败", true);
    } finally {
      setConfigBusy(false);
    }
  };

  const scanProviders = async () => {
    setScanning(true);
    try {
      setProviders(await bridge.discoverCreatorProviders());
      toast("已重新扫描本机配置");
    } catch (error) {
      toast((error as Error).message || "扫描失败", true);
    } finally {
      setScanning(false);
    }
  };

  const importProvider = async (provider: DiscoveredProvider) => {
    setConfigBusy(true);
    try {
      const next = await bridge.importCreatorProvider(provider.id);
      setConfig(next);
      setProtocol(next.protocol);
      setBaseUrl(next.baseUrl);
      setTextModel(next.textModel);
      setImageModel(next.imageModel);
      setApiKey("");
      setModels([]);
      toast(`已导入 ${provider.name}`);
    } catch (error) {
      toast((error as Error).message || "无法导入该配置", true);
    } finally {
      setConfigBusy(false);
    }
  };

  const loadModels = async () => {
    setConfigBusy(true);
    try {
      if (apiKey) await saveConfig();
      const items = await bridge.creatorModels();
      setModels(items);
      toast(items.length ? `已拉取 ${items.length} 个模型` : "接口可访问，但没有返回模型");
    } catch (error) {
      toast(`${(error as Error).message || "模型拉取失败"}；仍可手工填写模型`, true);
    } finally {
      setConfigBusy(false);
    }
  };

  const testConfig = async () => {
    setConfigBusy(true);
    try {
      if (apiKey) await saveConfig();
      const result = await bridge.testCreatorConfig();
      toast(result.message);
    } catch (error) {
      toast((error as Error).message || "连接失败", true);
    } finally {
      setConfigBusy(false);
    }
  };

  return (
    <div className="creator-page">
      <header className="page-header creator-header">
        <div>
          <h1 className="page-title">创作工作台</h1>
          <p>从一个想法开始，生成、检查并安装自己的主题或宠物。</p>
        </div>
        <button className={`btn ${config?.hasApiKey ? "ghost" : "primary"}`} onClick={() => setConfigOpen((value) => !value)}>
          <span className={`status-dot ${config?.hasApiKey ? "on" : ""}`} />
          {config?.hasApiKey ? `AI 已配置 ${config.maskedApiKey}` : "配置 AI 服务"}
        </button>
      </header>

      {configOpen && (
        <section className="creator-config-card">
          <div className="creator-section-title">
            <div><strong>AI 服务</strong><span>优先复用本机已有配置，也支持手工配置；密钥仅加密保存在本机。</span></div>
            <button className="btn ghost small" onClick={() => setConfigOpen(false)}>收起</button>
          </div>
          {!config?.secureStorageAvailable && (
            <div className="creator-warning">系统钥匙串当前不可用，因此不会以明文保存 API Key。</div>
          )}
          <div className="creator-discovery-head">
            <div><strong>检测到的配置</strong><span>只读取当前生效项，不修改 CC Switch、Codex 或 Claude 文件。</span></div>
            <button className="btn ghost small" disabled={scanning} onClick={scanProviders}>{scanning ? "扫描中…" : "重新扫描"}</button>
          </div>
          <div className="creator-provider-list">
            {providers.length === 0 && <div className="creator-provider-empty">未检测到可用配置，可在下方手工填写。</div>}
            {providers.map((provider) => (
              <div className="creator-provider-row" key={provider.id}>
                <span className={`creator-provider-logo ${provider.family}`}><img src={provider.family === "openai" ? codexIcon : claudeIcon} alt="" /></span>
                <div><strong>{provider.name}</strong><small>{provider.family === "openai" ? "OpenAI / Codex" : "Anthropic / Claude"} · {provider.baseUrl || "默认地址"}</small><small>{provider.note}</small></div>
                <span className="creator-provider-key">{provider.hasCredential ? provider.maskedCredential : "无 API Key"}</span>
                <button className="btn small" disabled={!provider.importable || configBusy} onClick={() => importProvider(provider)}>{provider.importable ? "使用" : "不可导入"}</button>
              </div>
            ))}
          </div>
          <div className="creator-manual-title"><span>手工配置</span></div>
          <div className="creator-protocol-switch">
            <button className={protocol === "openai" ? "active" : ""} onClick={() => setProtocol("openai")}>OpenAI 兼容</button>
            <button className={protocol === "anthropic" ? "active" : ""} onClick={() => setProtocol("anthropic")}>Anthropic 兼容</button>
          </div>
          <div className="creator-config-grid">
            <label><span>接口地址</span><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" /></label>
            <label><span>API Key</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={config?.hasApiKey ? `已保存 ${config.maskedApiKey}，留空则不修改` : "sk-..."} /></label>
            <label><span>文本模型{models.length > 0 ? `（${models.length} 个可选）` : ""}</span>{models.length > 0 ? <UnifiedSelect value={textModel} options={modelOptions} ariaLabel="选择文本模型" onChange={(value) => value === "__manual__" ? setModels([]) : setTextModel(value)} /> : <input value={textModel} onChange={(event) => setTextModel(event.target.value)} placeholder="输入模型名称，或先获取模型列表" />}</label>
            <label><span>图片模型{models.length > 0 ? `（${models.length} 个可选）` : ""}</span>{models.length > 0 ? <UnifiedSelect value={imageModel} options={modelOptions} ariaLabel="选择图片模型" disabled={protocol === "anthropic"} onChange={(value) => value === "__manual__" ? setModels([]) : setImageModel(value)} /> : <input value={imageModel} onChange={(event) => setImageModel(event.target.value)} disabled={protocol === "anthropic"} placeholder={protocol === "anthropic" ? "Anthropic 配置仅用于文本阶段" : "输入模型名称，或先获取模型列表"} />}</label>
          </div>
          {models.length > 0 && textModel && !models.includes(textModel) && <div className="creator-model-notice">当前文本模型 <code>{textModel}</code> 是本地配置值，未在本次模型列表中返回。</div>}
          {protocol === "openai" && models.length > 0 && imageModel && !models.includes(imageModel) && <div className="creator-model-notice">当前图片模型 <code>{imageModel}</code> 是本地预设或手工值，未在本次模型列表中返回；使用前需要单独验证图片生成接口。</div>}
          {protocol === "anthropic" && <div className="creator-warning">Claude/Anthropic 配置可以负责需求整理和提示词，但宠物与主题仍需另配支持图片生成的 OpenAI 兼容服务。</div>}
          <div className="row creator-config-actions">
            <button className="btn primary" disabled={configBusy} onClick={saveConfig}>{configBusy ? "处理中…" : "保存配置"}</button>
            <button className="btn ghost" disabled={configBusy || (!config?.hasApiKey && !apiKey)} onClick={loadModels}>获取模型列表</button>
            <button className="btn ghost" disabled={configBusy || (!config?.hasApiKey && !apiKey)} onClick={testConfig}>测试连接</button>
          </div>
        </section>
      )}

      <div className="creator-layout">
        <aside className="creator-drafts">
          <div className="creator-section-title">
            <div><strong>我的草稿</strong><span>{drafts.length} 个项目</span></div>
            <button className="creator-add" title="新建项目" onClick={() => reset(kind)}>＋</button>
          </div>
          <div className="creator-draft-list">
            {drafts.length === 0 && <div className="creator-draft-empty">还没有草稿<br />从右侧创建第一个作品</div>}
            {drafts.map((draft) => (
              <button key={draft.id} className={`creator-draft ${draft.id === activeId ? "active" : ""}`} onClick={() => openDraft(draft)}>
                <span className="creator-draft-icon">{draft.kind === "theme" ? "▧" : "◇"}</span>
                <span className="creator-draft-copy"><strong>{draft.name}</strong><small>{draft.kind === "theme" ? "主题" : "宠物"} · {STATUS_LABEL[draft.status]}</small></span>
                <span className="creator-draft-delete" role="button" title="删除" onClick={(event) => { event.stopPropagation(); removeDraft(draft); }}>×</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="creator-editor">
          <div className="creator-kind-switch">
            <button className={kind === "theme" ? "active" : ""} onClick={() => reset("theme")}><span>▧</span><strong>创建主题</strong><small>16:9 背景与主题元数据</small></button>
            <button className={kind === "pet" ? "active" : ""} onClick={() => reset("pet")}><span>◇</span><strong>创建宠物</strong><small>v2 动画图集与安装包</small></button>
          </div>

          <section className="creator-form-card">
            <div className="creator-section-title"><div><strong>{activeId ? "编辑创作方案" : "新建创作方案"}</strong><span>先写清楚角色或画面，再进入生成阶段。</span></div></div>
            <div className="creator-form-grid">
              <label><span>作品名称</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "theme" ? "例如：雨夜书房" : "例如：红尾雪团"} /></label>
              <label><span>目标应用</span><UnifiedSelect value={target} options={targetOptions} ariaLabel="选择目标应用" onChange={setTarget} /></label>
              <label className="wide"><span>创作描述</span><textarea rows={5} value={brief} onChange={(event) => setBrief(event.target.value)} placeholder={kind === "theme" ? "描述场景、色调、主体位置和希望留给界面的空间…" : "描述角色物种、配色、服装、性格和必须保持不变的身份特征…"} /></label>
              <label className="wide"><span>风格与限制（可选）</span><input value={style} onChange={(event) => setStyle(event.target.value)} placeholder={kind === "theme" ? "例如：低饱和、无文字、中央留白" : "例如：像素风、清晰轮廓、透明背景"} /></label>
            </div>
            <div className="creator-form-actions">
              <span>{kind === "pet" ? "生成时会逐动作排队，可关闭窗口后继续。" : "主题会先生成预览，确认后再安装。"}</span>
              <div className="row"><button className="btn ghost" disabled={saving} onClick={() => saveDraft(false)}>保存草稿</button><button className="btn primary" disabled={saving} onClick={() => saveDraft(true)}>保存并准备生成</button></div>
            </div>
          </section>

          <section className="creator-workflow-card">
            <div className="creator-section-title"><div><strong>生成流程</strong><span>{kind === "pet" ? "长任务，按阶段保存结果并允许重试单个动作。" : "先预览后安装，不直接发布到商店。"}</span></div></div>
            <div className="creator-workflow">
              {workflow.map((step, index) => (
                <div className={`creator-step ${index <= (activeDraft?.stage ?? 0) ? "current" : ""}`} key={step.title}>
                  <span>{index + 1}</span><div><strong>{step.title}</strong><small>{step.detail}</small></div>
                </div>
              ))}
            </div>
            {kind === "pet" && <div className="creator-spec">v2 规范：8×11 网格 · 1536×2288 · 192×208/帧 · 9 个标准动作 · 16 个注视方向</div>}
          </section>
        </main>
      </div>
    </div>
  );
}
