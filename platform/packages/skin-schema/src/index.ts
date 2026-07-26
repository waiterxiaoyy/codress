import { z } from "zod";

/** 支持的目标应用 */
export const TargetApp = z.enum(["codex", "workbuddy"]);
export type TargetApp = z.infer<typeof TargetApp>;

export const Appearance = z.enum(["auto", "light", "dark"]);

/** 构图参数(与 Dream Skin 运行时 theme.json v1 的 art 字段对齐) */
export const ArtConfig = z.object({
  focusX: z.number().min(0).max(1).optional(),
  focusY: z.number().min(0).max(1).optional(),
  safeArea: z.enum(["auto", "left", "right", "center", "none"]).optional(),
  taskMode: z.enum(["auto", "ambient", "banner", "off"]).optional(),
});
export type ArtConfig = z.infer<typeof ArtConfig>;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const cssColor = z.string().regex(/^(#[0-9a-fA-F]{6}|rgba?\([0-9., %]+\))$/);

/** 显式配色(不给则由运行时自适应推导) */
export const SkinColors = z
  .object({
    background: hexColor,
    panel: hexColor,
    panelAlt: hexColor,
    accent: hexColor,
    accentAlt: hexColor,
    secondary: hexColor,
    highlight: hexColor,
    text: hexColor,
    muted: hexColor,
    line: cssColor,
  })
  .partial();
export type SkinColors = z.infer<typeof SkinColors>;

/** 商店皮肤 manifest(服务端下发) */
export const SkinManifest = z.object({
  schemaVersion: z.literal(2),
  slug: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  description: z.string().max(400).optional(),
  author: z.string().max(80).optional(),
  category: z.string().max(80).optional(),
  targets: z.array(TargetApp).min(1),
  appearance: Appearance.default("auto"),
  art: ArtConfig.optional(),
  colors: SkinColors.optional(),
  backgroundUrl: z.string(),
  previewLightUrl: z.string().optional(),
  previewDarkUrl: z.string().optional(),
  hash: z.string().optional(),
  sizeBytes: z.number().optional(),
});
export type SkinManifest = z.infer<typeof SkinManifest>;

/** 桌面宠物 manifest */
export const PetManifest = z.object({
  schemaVersion: z.literal(1),
  slug: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  description: z.string().max(400).optional(),
  category: z.string().max(80).optional(),
  targets: z.array(TargetApp).min(1),
  imageUrl: z.string(),
  animation: z.enum(["idle", "bounce", "walk"]).default("idle"),
});
export type PetManifest = z.infer<typeof PetManifest>;

/** 注入运行时 theme.json v1(Dream Skin 兼容格式,客户端本地落盘用) */
export const RuntimeThemeV1 = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  name: z.string(),
  brandSubtitle: z.string().optional(),
  tagline: z.string().optional(),
  statusText: z.string().optional(),
  quote: z.string().optional(),
  image: z.string(),
  appearance: Appearance.optional(),
  art: ArtConfig.optional(),
  colors: SkinColors.optional(),
});
export type RuntimeThemeV1 = z.infer<typeof RuntimeThemeV1>;

/** 服务端可热下发的 adapter 配置 */
export const AdapterRemoteConfig = z.object({
  appId: TargetApp,
  version: z.number().int(),
  platform: z.enum(["all", "win", "mac"]).default("all"),
  config: z.object({
    defaultPort: z.number().int().min(1024).max(65535).optional(),
    targetUrlPrefixes: z.array(z.string()).optional(),
    probeMarkers: z.record(z.string()).optional(),
  }),
  css: z.string().optional(),
});
export type AdapterRemoteConfig = z.infer<typeof AdapterRemoteConfig>;

/** manifest v2 → 运行时 theme.json v1 转换 */
export function manifestToRuntimeTheme(m: SkinManifest, imageFileName: string): RuntimeThemeV1 {
  return {
    schemaVersion: 1,
    id: m.slug,
    name: m.name,
    tagline: m.description ?? "",
    statusText: "CODRESS ONLINE",
    quote: "MAKE SOMETHING WONDERFUL",
    image: imageFileName,
    appearance: m.appearance ?? "auto",
    ...(m.art ? { art: m.art } : {}),
    ...(m.colors ? { colors: m.colors } : {}),
  };
}
