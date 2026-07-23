<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./images/codress-banner-dark.png">
    <img src="./images/codress-banner.png" alt="Codress" width="380">
  </picture>
</p>

<p align="center">
  <strong>给 AI 工作台换个界面，让灵感常驻。</strong><br>
  为 Codex 与 WorkBuddy 提供一键换肤、桌面宠物和本地资产管理。
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <strong>简体中文</strong>
</p>

<p align="center">
  <a href="https://codress.dev">官网</a> ·
  <a href="https://github.com/waiterxiaoyy/codress/releases">下载</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#本地开发">本地开发</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-111111" alt="macOS and Windows">
  <img src="https://img.shields.io/badge/Electron-33-111111" alt="Electron 33">
  <img src="https://img.shields.io/badge/Node-%E2%89%A520-111111" alt="Node 20 or newer">
  <img src="https://img.shields.io/badge/Go-1.24+-111111" alt="Go 1.24 or newer">
</p>

---

## Codress 是什么？

Codress 是一个面向 Electron AI 工作台的桌面外观工具。它通过本机 Chrome DevTools Protocol（CDP）应用主题，不替换目标应用文件，也不修改官方安装包；不喜欢当前效果时，可以随时恢复默认。

商店浏览和资源下载需要网络连接。主题应用、切换、恢复以及本地资产管理在用户电脑上完成。

## 当前功能

| 模块 | 能力 |
| --- | --- |
| 主题商店 | 浏览、搜索和分类筛选 Codex / WorkBuddy 主题 |
| 一键应用 | 自动检测目标应用，必要时确认重启并开启本机皮肤通道 |
| 本地皮肤创作 | 保存前调整构图与图片效果，并配置 Codex / WorkBuddy 共用的背景、面板、文字和强调色 |
| 恢复默认 | 移除注入样式，恢复目标应用原始外观 |
| 桌面宠物 | 浏览、安装、启用 Codex v2 宠物，或作为桌面悬浮宠物运行 |
| 我的 | 管理本机缓存的皮肤、已安装宠物和正在运行的桌面宠物 |
| 外观设置 | 浅色、深色、跟随系统；自动响应系统主题变化 |
| 自动更新 | 检查 GitHub Release，下载完成后重启安装 |
| 管理端 | 管理皮肤、宠物、分类、适配器配置、客户端版本和运行数据 |

本地皮肤创作无需账号，原图不会上传。账号同步、远程收藏、社区发布和账号型创作工作台目前仍未开放。

## 支持范围

| 目标应用 | 主题 | 宠物 | 平台 |
| --- | --- | --- | --- |
| Codex | 支持 | 支持 Codex v2 / 桌面悬浮 | macOS / Windows |
| WorkBuddy | 支持 | 暂未开放 | macOS / Windows |

## 快速开始

### 安装

从 [GitHub Releases](https://github.com/waiterxiaoyy/codress/releases) 下载与你的平台匹配的安装包：

| 平台 | 文件 |
| --- | --- |
| macOS Apple Silicon | `Codress-<version>-mac-arm64.dmg` |
| macOS Intel | `Codress-<version>-mac-x64.dmg` |
| Windows x64 | `Codress-<version>-win-x64.exe` |

正式 macOS 包需要签名与公证。自行构建的未签名包可能触发 Gatekeeper 提示。

### 应用第一个主题

1. 打开 Codress，进入“主题”。
2. 选择 Codex 或 WorkBuddy。
3. 浏览主题或通过搜索、分类缩小范围。
4. 点击“一键应用”。
5. 如果目标应用尚未开启皮肤通道，确认一次重启即可。

要还原原始界面，点击主题页右上角的“恢复默认”。

### 使用宠物

1. 进入“宠物”，选择一个作品。
2. 安装到 Codex，或点击“上桌”作为独立悬浮宠物。
3. 已安装和正在运行的宠物可以在“我的”中统一管理。

## 工作原理

```text
Codress Desktop
├── HTTPS ────────────────> Codress API
│                          主题、宠物、分类、版本信息
│
├── 127.0.0.1 CDP ───────> Codex / WorkBuddy
│                          应用或移除受控的 CSS/运行时
│
└── Local Library ───────> 用户数据目录
                           设置、主题缓存、宠物与本地资产
```

关键边界：

- CDP 仅连接本机回环地址。
- WebSocket 目标经过形状和进程校验。
- 商店主题是图片和元数据，不携带任意可执行代码。
- 注入运行时随 Codress 客户端发布，不从主题包动态执行。
- 不修改目标应用安装目录和签名文件。

## 项目结构

```text
codress/
├── index.html                         # 官网落地页
├── images/                            # 官网、README 与品牌资源
├── docs/                              # 架构与 UI 合同
└── platform/
    ├── apps/
    │   ├── desktop/                   # Electron 桌面客户端
    │   │   ├── src/main/              # CDP、启动器、宠物、更新与 IPC
    │   │   └── src/renderer/          # React 桌面界面
    │   └── admin/                     # React + Ant Design 管理端
    ├── packages/skin-schema/          # 共享主题数据合同
    ├── server/                        # Go API
    └── deploy/                        # MySQL、种子数据与部署配置
```

## 本地开发

前置环境：

- Node.js 20+
- pnpm
- Go 1.24+
- Docker，或可用的 MySQL 8

安装前端依赖：

```bash
cd platform
pnpm install
```

启动桌面端：

```bash
pnpm dev:desktop
```

启动 API 与数据库：

```bash
cd deploy
docker compose up -d mysql

cd ../server
go run ./cmd/api
```

启动管理端：

```bash
cd platform
pnpm dev:admin
```

管理端默认在 `http://127.0.0.1:5174`，开发服务器会把 `/api` 和 `/static` 代理到本机 API。生产部署前必须修改 `.env` 中的 JWT 密钥和管理员密码。

## 构建与测试

```bash
cd platform

# 类型检查与构建
pnpm build:desktop
pnpm build:admin

# 桌面端测试
pnpm --filter @codress/desktop test

# macOS / Windows 安装包
pnpm pack:mac
pnpm pack:win
```

```bash
cd platform/server
go test ./...
```

## 发布桌面客户端

1. 修改 `platform/apps/desktop/package.json` 的版本号。
2. 提交代码并推送同版本标签，例如 `v1.0.1`。
3. GitHub Actions 会分别构建 macOS 和 Windows 安装包。
4. 两个平台都成功后，Release 才会从草稿转为正式发布。

macOS 发布需要配置签名、公证相关 Secrets；Windows 可选配置代码签名证书。

## 路线图

- 增加更多本地构图和真实界面预览预设
- 恢复账号同步和远程收藏
- 开放用户创作与商店投稿
- 扩展更多 Electron AI 工作台适配器
