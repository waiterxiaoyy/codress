<p align="center">
  <img src="https://codress.dev/logo.png" alt="Codress" width="120" />
</p>

<h1 align="center">Codress</h1>

<p align="center">
  <b>One-click skin switching for AI code editors. No hacks, no patches, fully reversible.</b>
</p>

<p align="center">
  <a href="https://codress.dev">Official Website</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#features">Features</a> ·
  <a href="#faq">FAQ</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue" alt="platform" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license" />
  <img src="https://img.shields.io/badge/electron-33-purple" alt="electron" />
</p>

---

**English** | [中文](#中文文档)

## What is Codress?

Codress is a desktop app that lets you **instantly reskin** Electron-based AI code editors — including **Codex**, **WorkBuddy**, and more coming soon — without modifying any official files.

It works by injecting a custom CSS theme through Chrome DevTools Protocol (CDP), so everything is:

- ✅ **Non-invasive** — no files are patched or replaced
- ✅ **Reversible** — restore to default with one click
- ✅ **Safe** — runs entirely locally, no data leaves your machine

## Features

| Module | Description |
|--------|-------------|
| **Theme Store** | Browse & apply thousands of community themes with live preview |
| **One-click Apply** | Select a skin → click "Apply" → done. The editor restyles instantly |
| **Multi-app Support** | Switch between Codex, WorkBuddy (and more) from a single panel |
| **Desktop Pets** | Animated companions that live on your desktop while you code |
| **Auto-restart** | If CDP isn't enabled, Codress can restart the target app for you |
| **Favorites & Search** | Star your favorites, filter by category, search by name |
| **Local Import** | Use any local image as a background skin |
| **Admin Panel** | Manage skins, AI-generate metadata, control publish status |

## Supported Editors

| Editor | Status | Platform |
|--------|--------|----------|
| Codex (by OpenAI) | ✅ Supported | macOS / Windows |
| WorkBuddy | ✅ Supported | macOS / Windows |
| More editors | 🚧 Coming soon | — |

## Quick Start

### 1. Download

Get the latest release from [codress.dev](https://codress.dev) or the [Releases](https://github.com/user/codress/releases) page.

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `Codress-x.x.x-arm64.dmg` |
| macOS (Intel) | `Codress-x.x.x-x64.dmg` |
| Windows | `Codress-x.x.x-setup.exe` |

### 2. Install & Launch

1. Open the downloaded `.dmg` / `.exe` and drag Codress to Applications (macOS) or follow the installer (Windows).
2. Launch **Codress**.

### 3. Apply Your First Skin

1. In the **Theme Store** tab, pick an editor (Codex / WorkBuddy) from the icon switcher.
2. Browse skins or search by name.
3. Click **"一键应用"** (One-click Apply).
4. If the target editor doesn't have CDP enabled, Codress will prompt you to restart it — confirm and the skin applies automatically.

### 4. Restore Default

Click the **"恢复默认"** button at the top-right of the Theme Store to revert to the original appearance.

## How It Works

```
┌─────────────┐         CDP (WebSocket)         ┌──────────────────┐
│   Codress   │ ──────────────────────────────▶  │  Target Editor   │
│  (Desktop)  │   inject CSS / remove CSS        │  (Codex / WB)    │
└─────────────┘                                  └──────────────────┘
       │
       │ HTTP
       ▼
┌─────────────┐
│   Server    │  skin catalog, user accounts, favorites
│   (Go/Gin)  │
└─────────────┘
```

1. Codress detects installed editors and launches them with remote debugging enabled.
2. It connects via CDP and injects the selected skin's CSS into every open window.
3. When you switch or restore, it simply replaces or removes the injected stylesheet.

**No binary patching. No file replacement. No root/admin privileges needed.**

## FAQ

**Q: Will this break my editor or void its license?**
A: No. Codress only injects CSS through the standard Chrome DevTools Protocol. No editor files are modified.

**Q: Do I need an account?**
A: No. You can browse and apply skins without logging in. An account is only needed for favorites and cloud sync.

**Q: Can I create my own skin?**
A: Yes! Use the admin panel to upload a background image, set color variables, and publish to your local store. AI-assisted metadata generation is also available.

**Q: What if the editor updates?**
A: Since Codress doesn't modify any files, editor updates won't conflict. Just re-apply your skin after updating.

**Q: Is it safe?**
A: Codress runs entirely locally. The only network requests are to fetch the skin catalog from your configured server. No telemetry, no tracking.

## Development

```bash
# Install dependencies
pnpm install

# Run desktop client in dev mode
pnpm dev:desktop

# Build for macOS
pnpm pack:mac

# Run the backend server
cd server && go run cmd/main.go
```

## Project Structure

```
codress/
├── platform/
│   ├── apps/
│   │   ├── desktop/          # Electron desktop client
│   │   │   ├── src/main/     # Main process (adapters, CDP, launcher)
│   │   │   └── src/renderer/ # React UI (Theme Store, Pets, Settings)
│   │   └── admin/            # Admin panel (skin management)
│   ├── server/               # Go backend (Gin + GORM + MySQL)
│   └── deploy/               # Deployment configs & seed data
├── index.html                # Landing page
├── nginx.conf                # Nginx config
└── docker-compose.yml        # Docker orchestration
```

## License

[MIT](./LICENSE)

---

<a name="中文文档"></a>

# 中文文档

<p align="center">
  <b>给 AI 代码编辑器一键换肤。无侵入，无补丁，完全可逆。</b>
</p>

<p align="center">
  <a href="https://codress.dev">官方网站</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#功能特性">功能特性</a> ·
  <a href="#常见问题">常见问题</a>
</p>

---

## Codress 是什么？

Codress 是一款桌面应用，让你能够**一键切换** Electron 架构的 AI 代码编辑器的皮肤 —— 目前支持 **Codex**、**WorkBuddy**，更多编辑器陆续接入中。

它通过 Chrome DevTools Protocol (CDP) 注入自定义 CSS 主题，因此：

- ✅ **无侵入** —— 不修改任何官方文件
- ✅ **可逆** —— 一键恢复默认外观
- ✅ **安全** —— 纯本地运行，数据不外传

## 功能特性

| 模块 | 说明 |
|------|------|
| **主题商店** | 浏览并应用海量社区主题，实时预览 |
| **一键应用** | 选择皮肤 → 点击"一键应用" → 即刻生效 |
| **多应用支持** | 在同一面板中切换 Codex、WorkBuddy 等多款编辑器 |
| **桌面宠物** | 可爱的动画伙伴，陪你一起写代码 |
| **自动重启** | 若目标编辑器未开启 CDP，Codress 自动帮你重启 |
| **收藏与搜索** | 收藏喜欢的皮肤，按分类筛选，按名称搜索 |
| **本地图片导入** | 使用任意本地图片作为背景皮肤 |
| **管理后台** | 管理皮肤、AI 生成元数据、控制上下架 |

## 支持的编辑器

| 编辑器 | 状态 | 平台 |
|--------|------|------|
| Codex (OpenAI) | ✅ 已支持 | macOS / Windows |
| WorkBuddy | ✅ 已支持 | macOS / Windows |
| 更多编辑器 | 🚧 即将支持 | — |

## 快速开始

### 1. 下载

前往 [codress.dev](https://codress.dev) 或 [Releases](https://github.com/user/codress/releases) 页面下载最新版本。

| 平台 | 文件 |
|------|------|
| macOS (Apple Silicon) | `Codress-x.x.x-arm64.dmg` |
| macOS (Intel) | `Codress-x.x.x-x64.dmg` |
| Windows | `Codress-x.x.x-setup.exe` |

### 2. 安装并启动

1. macOS：打开 `.dmg`，将 Codress 拖入"应用程序"文件夹。Windows：运行安装程序。
2. 启动 **Codress**。

### 3. 应用第一个皮肤

1. 在 **主题商店** 页面，通过图标切换器选择目标编辑器（Codex / WorkBuddy）。
2. 浏览皮肤或搜索名称。
3. 点击 **"一键应用"**。
4. 如果目标编辑器未开启 CDP 通道，Codress 会提示重启 —— 确认后皮肤自动生效。

### 4. 恢复默认

点击主题商店右上角的 **"恢复默认"** 按钮即可还原原始外观。

## 工作原理

```
┌─────────────┐         CDP (WebSocket)         ┌──────────────────┐
│   Codress   │ ──────────────────────────────▶  │   目标编辑器      │
│  (桌面端)    │   注入 CSS / 移除 CSS           │  (Codex / WB)    │
└─────────────┘                                  └──────────────────┘
       │
       │ HTTP
       ▼
┌─────────────┐
│   Server    │  皮肤目录、用户账号、收藏管理
│   (Go/Gin)  │
└─────────────┘
```

1. Codress 检测已安装的编辑器，并以远程调试模式启动它们。
2. 通过 CDP 连接后，将选定皮肤的 CSS 注入到每个打开的窗口中。
3. 切换或恢复时，简单地替换或移除注入的样式表。

**不修改二进制文件。不替换任何文件。不需要管理员权限。**

## 常见问题

**Q: 会不会损坏编辑器或影响许可证？**
A: 不会。Codress 仅通过标准的 Chrome DevTools Protocol 注入 CSS，不修改任何编辑器文件。

**Q: 需要注册账号吗？**
A: 不需要。无需登录即可浏览和应用皮肤。账号仅用于收藏和云同步功能。

**Q: 可以自己创建皮肤吗？**
A: 可以！使用管理后台上传背景图、设置颜色变量即可发布。还支持 AI 辅助生成皮肤元数据。

**Q: 编辑器更新后怎么办？**
A: 由于 Codress 不修改任何文件，编辑器更新不会产生冲突。更新后重新应用皮肤即可。

**Q: 安全吗？**
A: Codress 完全本地运行。唯一的网络请求是从你配置的服务器获取皮肤目录。无遥测、无追踪。

## 开发指南

```bash
# 安装依赖
pnpm install

# 开发模式运行桌面端
pnpm dev:desktop

# 打包 macOS
pnpm pack:mac

# 运行后端服务
cd server && go run cmd/main.go
```

## 项目结构

```
codress/
├── platform/
│   ├── apps/
│   │   ├── desktop/          # Electron 桌面客户端
│   │   │   ├── src/main/     # 主进程（适配器、CDP、启动器）
│   │   │   └── src/renderer/ # React UI（主题商店、宠物、设置）
│   │   └── admin/            # 管理后台（皮肤管理）
│   ├── server/               # Go 后端（Gin + GORM + MySQL）
│   └── deploy/               # 部署配置与种子数据
├── index.html                # 官网落地页
├── nginx.conf                # Nginx 配置
└── docker-compose.yml        # Docker 编排
```

## 开源协议

[MIT](./LICENSE)
