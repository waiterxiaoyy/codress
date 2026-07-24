# Codress 主题皮肤首批 20 张

这批素材用于验证 Codex 与 WorkBuddy 的主题风格。全部图片由内置图片生成能力逐张生成，随后统一处理为：

- 背景图：JPG，2560 × 1440，16:9
- 商店预览：JPG，640 × 360
- 单文件小于服务端 16 MB 上限
- 无文字、无 Logo、无 UI 截图、无水印
- 动漫人物均为原创形象，不指定或模仿现有 IP

![20 张主题总览](contact-sheet.jpg)

总览按文件名字母序排列；单图请直接查看 `backgrounds/`。

## 当前主题做法识别

1. 商店主题是“图片 + 元数据”，不携带 CSS 或脚本。管理端先创建草稿，再上传 `background`、`previewLight`、`previewDark`，最后上架。
2. 公共 manifest 是 v2；客户端落盘时，Codex 转为 `theme.json`，WorkBuddy 转为单主题 `catalog.json`。
3. Codex 运行时实际使用 `safeArea`、`focusX`、`focusY`、`taskMode`。`safeArea: left` 的真实含义是“左侧为低信息/文字安全区”，主体通常应在右侧，默认焦点约为 `0.72`。
4. 管理端目前把 `safeArea` 标成“主体人物位置”，AI 提示词也按人物侧解释；这与 Codex 运行时及自动图像分析的语义相反。本批元数据按运行时真实语义填写。
5. WorkBuddy 打包时会透传 `art`，但当前注入层不读取焦点配置，背景固定 `right center / cover`。所以这 10 张 WorkBuddy 图全部把人物或主景放在右侧，并为左侧欢迎页内容保留约 55% 的低信息区域。
6. WorkBuddy 当前颜色运行时支持的字段多于管理端暴露的 10 个公共颜色字段。本批只使用管理端现有字段，并统一采用暗色 UI 覆盖，避免亮色背景与默认深色 surface 混用。
7. 桌面商店卡片当前优先读取 `previewLightUrl`，没有根据外观选择 `previewDarkUrl`。因此 `asset-map.json` 把所有 640 × 360 缩略图都映射到 `previewLight`；这是当前实现下最稳定的做法。

## 管理端上架

相关文件：

- `admin-create-payloads.json`：20 条可直接提交给 `POST /api/admin/skins` 的草稿元数据
- `asset-map.json`：每个 slug 对应的背景图和 `previewLight` 缩略图
- `backgrounds/`：后台 `background` 上传文件
- `previews/`：后台 `previewLight` 上传文件

单条上架顺序：

1. 从 `admin-create-payloads.json` 找到对应对象，在管理端新建皮肤并填写同名字段。
2. 保存草稿后，在“素材”里上传 `asset-map.json` 指定的 `background`。
3. 把同一项的 `previewLight` 上传为商店缩略图；`previewDark` 可暂不传。
4. 分别在 Codex 或 WorkBuddy 本机应用检查，再点击上架。

若后续增加批量导入接口，`admin-create-payloads.json` 可原样作为 create payload 列表，`asset-map.json` 用于 multipart 上传映射。

## 20 张风格与样式调整

| # | 平台 | Slug / 名称 | 风格 | 样式调整说明 |
|---:|---|---|---|---|
| 01 | Codex | `codex-sakura-signal` / Sakura Signal | 樱花未来都市、清新动漫 | 主体在右 1/3，左侧压暗并减少花瓣密度；用粉色作强调色、青色作辅助色，适合暗色 Codex 面板。 |
| 02 | Codex | `codex-neon-torii-protocol` / Neon Torii Protocol | 机械神社、暗黑科幻 | 左侧保留靛黑雾面区，紫色只用于焦点和选中态；降低霓虹泛光，避免文字区发花。 |
| 03 | Codex | `codex-rainbyte-alley` / Rainbyte Alley | 雨夜赛博街巷 | 左侧墙面与雨幕形成天然安全区；青色用于交互，暖橙只作局部对比，面板保持低饱和。 |
| 04 | Codex | `codex-astral-compiler` / Astral Compiler | 星象幻想、天文魔法 | 本图主体在左，因此设 `safeArea: right`；右侧星空降密度，用金色点亮少量状态信息。 |
| 05 | Codex | `codex-alpine-memory-line` / Alpine Memory Line | 山地列车、手绘风景 | 使用浅色外观；左侧蓝色雾化山谷承担文字区，列车和雪峰固定在右侧焦点。 |
| 06 | Codex | `codex-cloud-orchard` / Cloud Orchard | 云海果园、治愈动画背景 | 浅色奶油面板搭配橄榄绿；左侧保留云海留白，但避免纯白以维持文字对比。 |
| 07 | Codex | `codex-snowfox-commit` / Snowfox Commit | 雪夜神社、狐灵幻想 | 雪景整体压入蓝调，避免大面积高亮；朱红只作为强调色，人物与白狐集中右侧。 |
| 08 | Codex | `codex-abyssal-library` / Abyssal Library | 深海档案馆、奇幻探索 | 左侧深水渐变作为稳定安全区；青绿交互色配金色提示色，控制气泡和游鱼密度。 |
| 09 | Codex | `codex-sea-breeze-notebook` / Sea Breeze Notebook | 海边书房、夏日动漫 | 左侧海面统一为蓝色低信息区，采用浅色 shell；桌面与人物留在右侧，避免遮挡输入区。 |
| 10 | Codex | `codex-moonlit-archive-cathedral` / Moonlit Archive Cathedral | 哥特档案馆、暗色幻想 | 左侧以炭黑雾面承载内容，右侧建筑保留细节；紫灰强调色降低宗教感和视觉攻击性。 |
| 11 | WorkBuddy | `workbuddy-pastel-team-morning` / Pastel Team Morning | 粉彩创意办公室 | WorkBuddy 仍用暗色 surface，背景本身保持明亮；左侧墙面留白 55%，人物和便签板靠右。 |
| 12 | WorkBuddy | `workbuddy-stellar-standup` / Stellar Standup | 轨道协作、未来商务动漫 | 左侧深空为内容区，人物与环形星球右置；紫色为主交互色、青色承担焦点边框。 |
| 13 | WorkBuddy | `workbuddy-pixel-sprint-98` / Pixel Sprint 98 | 32-bit 像素复古工作室 | 保留清晰像素块但输出高分辨率；左侧雨窗低信息，琥珀灯光只集中在右侧工作区。 |
| 14 | WorkBuddy | `workbuddy-cloud-pavilion-sync` / Cloud Pavilion Sync | 国风仙侠、水墨协作 | 水墨群山和云海放左，人物与模型放右；管理 UI 使用深青色覆盖，避免亮背景下控件失焦。 |
| 15 | WorkBuddy | `workbuddy-island-focus-mode` / Island Focus Mode | 热带远程办公、旅行动漫 | 左侧海天留白，树叶不跨入内容区；青绿色 UI 与珊瑚色提示形成温和对比。 |
| 16 | WorkBuddy | `workbuddy-drizzle-cafe-standup` / Drizzle Café Standup | 雨窗咖啡馆、都市日常 | 左侧雨窗天然适合卡片覆盖；人物右置，暖棕强调色与蓝灰背景保持工作感而非约会感。 |
| 17 | WorkBuddy | `workbuddy-aurora-basecamp` / Aurora Basecamp | 极光科考、冒险动漫 | 左侧极光和夜空承载标题，右侧室内人物保留暖色；绿色强调色与琥珀提示色区分状态。 |
| 18 | WorkBuddy | `workbuddy-neon-rhythm-lab` / Neon Rhythm Lab | 音乐制作、霓虹动漫 | 洋红色渐变被限制在左侧低频背景，人物和设备右置；面板保持深紫，避免高饱和刺眼。 |
| 19 | WorkBuddy | `workbuddy-greenhouse-after-rain` / Greenhouse After Rain | 雨后温室、植物研究 | 左侧深绿玻璃减少叶片细节，右侧人物和样本桌承载故事；黄铜色只用于状态亮点。 |
| 20 | WorkBuddy | `workbuddy-lantern-launch` / Lantern Launch | 灯会发布、团队庆祝动漫 | 左侧红蓝夜空保留大面积干净渐变，团队靠右；控制灯笼数量和红色饱和度，适合长时间使用。 |

## 建议的验收顺序

先选以下 6 张做第一轮真实应用，能最快看出运行时差异：

1. Codex 暗色人物：Sakura Signal
2. Codex 反向安全区：Astral Compiler
3. Codex 浅色风景：Alpine Memory Line
4. WorkBuddy 明亮背景：Pastel Team Morning
5. WorkBuddy 暗色人物：Stellar Standup
6. WorkBuddy 特殊媒介：Pixel Sprint 98

重点检查欢迎页、任务页、左侧栏、输入框和超宽窗口下的 `cover` 裁切。WorkBuddy 如果要支持人物在左或真正浅色主题，需要先让注入层读取 `art.focusX/focusY`，并把完整 WorkBuddy surface/veil 颜色合同开放到管理端。
