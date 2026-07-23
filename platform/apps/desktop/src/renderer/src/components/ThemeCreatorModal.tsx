import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { LocalSkinImage, LocalSkinInput } from "../bridge";
import { ButtonLoadingLabel } from "./StoreControls";

type Appearance = LocalSkinInput["appearance"];

const PALETTES = [
  {
    id: "graphite",
    label: "石墨",
    appearance: "dark",
    colors: { background: "#111318", panel: "#191c22", text: "#edf0f1", accent: "#8298a3" },
  },
  {
    id: "midnight",
    label: "深海",
    appearance: "dark",
    colors: { background: "#080d18", panel: "#111a2b", text: "#f0f4ff", accent: "#719cff" },
  },
  {
    id: "paper",
    label: "纸白",
    appearance: "light",
    colors: { background: "#f3f5f6", panel: "#fafbfb", text: "#22272a", accent: "#54707e" },
  },
] as const;

interface ThemeCreatorModalProps {
  image: LocalSkinImage;
  targetName: string;
  onClose: () => void;
  onSave: (input: LocalSkinInput) => Promise<void>;
}

function RangeControl({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="theme-creator-range">
      <span><strong>{label}</strong><output>{value}{suffix}</output></span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

async function renderThemeImage(
  source: string,
  options: {
    focusX: number;
    focusY: number;
    zoom: number;
    rotation: number;
    blur: number;
    mask: number;
  },
): Promise<string> {
  const image = new Image();
  image.src = source;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("无法处理这张图片"));
  });

  const width = 1920;
  const height = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前环境无法生成皮肤预览");

  const rotationPadding = Math.abs(options.rotation) / 100;
  const blurPadding = options.blur / 300;
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
    * (options.zoom / 100 + rotationPadding + blurPadding);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const x = (width - drawWidth) * (options.focusX / 100);
  const y = (height - drawHeight) * (options.focusY / 100);

  context.save();
  context.translate(width / 2, height / 2);
  context.rotate(options.rotation * Math.PI / 180);
  context.translate(-width / 2, -height / 2);
  context.filter = options.blur ? `blur(${options.blur * 2}px)` : "none";
  context.drawImage(image, x, y, drawWidth, drawHeight);
  context.restore();

  if (options.mask > 0) {
    context.fillStyle = `rgba(0, 0, 0, ${options.mask / 100})`;
    context.fillRect(0, 0, width, height);
  }
  return canvas.toDataURL("image/jpeg", 0.9);
}

export function ThemeCreatorModal({
  image,
  targetName,
  onClose,
  onSave,
}: ThemeCreatorModalProps) {
  const [name, setName] = useState(image.name);
  const [appearance, setAppearance] = useState<Appearance>("dark");
  const [background, setBackground] = useState("#111318");
  const [panel, setPanel] = useState("#191c22");
  const [text, setText] = useState("#edf0f1");
  const [accent, setAccent] = useState("#8298a3");
  const [focusX, setFocusX] = useState(50);
  const [focusY, setFocusY] = useState(50);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [blur, setBlur] = useState(0);
  const [mask, setMask] = useState(18);
  const [saving, setSaving] = useState(false);

  const ratio = image.width / image.height;
  const ratioReady = Math.abs(ratio - 16 / 9) < 0.12;
  const resolutionReady = image.width >= 1920 && image.height >= 1080;
  const previewScale = (zoom + Math.abs(rotation)) / 100;
  const sizeLabel = image.sizeBytes >= 1024 * 1024
    ? `${(image.sizeBytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(image.sizeBytes / 1024)} KB`;
  const qualityText = useMemo(() => {
    if (ratioReady && resolutionReady) return "尺寸与比例都很适合";
    if (!resolutionReady) return "可以使用，建议换更高分辨率图片";
    return "可以使用，需通过定位裁切为 16:9";
  }, [ratioReady, resolutionReady]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const imageDataUrl = await renderThemeImage(image.dataUrl, {
        focusX,
        focusY,
        zoom,
        rotation,
        blur,
        mask,
      });
      await onSave({
        name: name.trim(),
        imageDataUrl,
        appearance,
        colors: { background, panel, text, accent },
        customization: {
          focusX,
          focusY,
          zoom,
          rotation,
          blur,
          mask,
        },
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay theme-creator-overlay" onClick={() => !saving && onClose()}>
      <div
        className="theme-creator-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-creator-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="theme-creator-header">
          <div>
            <span className="theme-creator-kicker">本地创作 · {targetName}</span>
            <h2 id="theme-creator-title">调整你的皮肤</h2>
            <p>所有调整先在这里预览，保存后才会写入“我的皮肤”并尝试应用。</p>
          </div>
          <button className="theme-creator-close" onClick={onClose} disabled={saving} aria-label="关闭">×</button>
        </header>

        <div className="theme-creator-body">
          <section className="theme-creator-preview-column">
            <div
              className="theme-creator-preview"
              style={{
                "--creator-bg": background,
                "--creator-panel": panel,
                "--creator-text": text,
                "--creator-accent": accent,
              } as CSSProperties}
            >
              <img
                src={image.dataUrl}
                alt=""
                style={{
                  objectPosition: `${focusX}% ${focusY}%`,
                  transform: `scale(${previewScale}) rotate(${rotation}deg)`,
                  filter: blur ? `blur(${blur}px)` : undefined,
                }}
              />
              <div className="theme-creator-mask" style={{ opacity: mask / 100 }} />
              <div className="theme-creator-mock-sidebar">
                <i /><i /><i /><i />
              </div>
              <div className="theme-creator-mock-content">
                <span />
                <strong />
                <div><i /><i /></div>
              </div>
              <span className="theme-creator-preview-tag">16:9 实际裁切预览</span>
            </div>

            <div className="theme-creator-specs">
              <div>
                <strong>推荐图片规格</strong>
                <p>1920×1080 或更高 · 16:9 · JPG/PNG/WebP · 小于 16 MB</p>
              </div>
              <div className={`theme-creator-quality ${ratioReady && resolutionReady ? "ready" : ""}`}>
                <span>{image.width}×{image.height}</span>
                <span>{sizeLabel}</span>
                <strong>{qualityText}</strong>
              </div>
              <ul>
                <li>人物或视觉主体建议放在右侧，左侧留出约 35% 的干净区域。</li>
                <li>使用横向、视觉中心明确的图片，避免把文字贴在边缘。</li>
                <li>深色图通常更容易保证编辑器文字与控件的可读性。</li>
              </ul>
            </div>
          </section>

          <section className="theme-creator-controls">
            <label className="theme-creator-name">
              <span>皮肤名称</span>
              <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
            </label>

            <div className="theme-creator-control-group">
              <div className="theme-creator-control-title">
                <strong>画面构图</strong>
                <button
                  type="button"
                  onClick={() => {
                    setFocusX(50);
                    setFocusY(50);
                    setZoom(100);
                    setRotation(0);
                  }}
                >
                  重置
                </button>
              </div>
              <RangeControl label="横向位置" value={focusX} min={0} max={100} suffix="%" onChange={setFocusX} />
              <RangeControl label="纵向位置" value={focusY} min={0} max={100} suffix="%" onChange={setFocusY} />
              <RangeControl label="画面缩放" value={zoom} min={100} max={180} suffix="%" onChange={setZoom} />
              <RangeControl label="轻微旋转" value={rotation} min={-5} max={5} suffix="°" onChange={setRotation} />
            </div>

            <div className="theme-creator-control-group">
              <div className="theme-creator-control-title"><strong>可读性</strong></div>
              <RangeControl label="背景模糊" value={blur} min={0} max={12} suffix="px" onChange={setBlur} />
              <RangeControl label="深色遮罩" value={mask} min={0} max={60} suffix="%" onChange={setMask} />
            </div>

            <div className="theme-creator-control-group">
              <div className="theme-creator-control-title">
                <strong>通用界面样式</strong>
                <span>Codex / WorkBuddy 共用</span>
              </div>
              <div className="theme-creator-palettes">
                {PALETTES.map((palette) => (
                  <button
                    key={palette.id}
                    type="button"
                    onClick={() => {
                      setAppearance(palette.appearance);
                      setBackground(palette.colors.background);
                      setPanel(palette.colors.panel);
                      setText(palette.colors.text);
                      setAccent(palette.colors.accent);
                    }}
                  >
                    <i style={{ background: palette.colors.background }}>
                      <b style={{ background: palette.colors.panel }} />
                      <em style={{ background: palette.colors.accent }} />
                    </i>
                    {palette.label}
                  </button>
                ))}
              </div>
              <div className="theme-creator-appearance" aria-label="界面明暗模式">
                {([
                  ["auto", "跟随系统"],
                  ["light", "浅色"],
                  ["dark", "深色"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={appearance === value ? "active" : ""}
                    onClick={() => setAppearance(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="theme-creator-colors">
                {([
                  ["背景", background, setBackground],
                  ["面板", panel, setPanel],
                  ["文字", text, setText],
                  ["强调", accent, setAccent],
                ] as const).map(([label, value, setter]) => (
                  <label key={label}>
                    <input type="color" value={value} onChange={(event) => setter(event.target.value)} />
                    <span>{label}</span>
                    <code>{value.toUpperCase()}</code>
                  </label>
                ))}
              </div>
            </div>
          </section>
        </div>

        <footer className="theme-creator-actions">
          <span>生成 1920×1080 本地皮肤，不会上传原图</span>
          <div>
            <button className="btn ghost" onClick={onClose} disabled={saving}>取消</button>
            <button className="btn primary" onClick={save} disabled={saving || !name.trim()}>
              {saving ? <ButtonLoadingLabel>生成并应用中…</ButtonLoadingLabel> : "保存并应用"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
