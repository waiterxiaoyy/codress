# Codress Platform

编辑器皮肤与桌面宠物平台 monorepo:**桌面客户端(Windows / macOS)+ 管理端 + Go API + MySQL**。

给 Codex / WorkBuddy 一键换肤:本机回环 CDP 注入,不修改任何官方文件,随时恢复默认。宠物与主题平行,是独立的透明悬浮窗。

```
platform/
├── apps/
│   ├── desktop/        # Electron 客户端(黑白极简 UI;可打包 win .exe / mac .dmg)
│   │   ├── src/main/
│   │   │   ├── engine/     # CDP 注入引擎(会话/payload/守护/验证)
│   │   │   ├── adapters/   # 目标应用适配器:codex(theme 模式)/ workbuddy(catalog 模式)
│   │   │   ├── launcher/   # 应用发现 + 带调试端口启动(win/mac)
│   │   │   └── core/       # 设置持久化 / 皮肤库 / 商店 API 客户端
│   │   ├── resources/runtime/  # 注入运行时(dream-skin.css + renderer-inject.js)
│   │   └── tests/          # 引擎单测(vitest)
│   └── admin/          # 管理端(React + Vite + antd 黑白主题)
├── packages/skin-schema/   # 皮肤 manifest 的 zod schema(共享)
├── server/             # Go API(Gin + GORM;MySQL 生产 / SQLite 测试)
└── deploy/             # docker-compose(MySQL)+ seed 演示素材
```

## 快速开始

前置:Go 1.24+、Node 20+、pnpm、Docker(或本机 MySQL 8)。

```bash
# 1. 数据库
cd deploy && docker compose up -d mysql

# 2. API(默认 :8080,首启自动建表 + 初始管理员 admin/codress123)
#    compose 的 MySQL 映射在宿主机 3307(容器内 3306),本机直连时:
#    DB_DSN=root:codress@tcp(127.0.0.1:3307)/codress?charset=utf8mb4&parseTime=True&loc=Local
cd ../server
go run ./cmd/api

# 3.(可选)导入演示皮肤/宠物
go run ./cmd/seed -assets ../deploy/seed

# 4. 管理端(:5174,代理 /api → :8080)
cd ../ && pnpm install
pnpm dev:admin

# 5. 桌面客户端
pnpm dev:desktop
```

打包客户端:`pnpm pack:win`(NSIS .exe)/ `pnpm pack:mac`(.dmg,需在 macOS 上执行)。
轻量化措施:asar + maximum 压缩、无重复运行时(注入引擎复用主进程 Node)、皮肤按需下载。

## 功能对照

| 需求 | 实现位置 |
|---|---|
| 一键换肤(Codex / WorkBuddy) | 客户端「主题」页 → `AppContext.applySkin`:下载→带端口启动→注入→验证→记录 |
| 平台切换 / 分类 | 主题页 Codex/WorkBuddy tab + 分类 chips;数据来自 `/api/v1/categories` |
| 宠物(与主题平行) | 客户端「宠物」页;`PetManager` 透明置顶悬浮窗,拖动/收起,不依赖注入 |
| 用户体系(记录为主) | GitHub / Google OAuth(桌面回环回调)+ 开发登录;记录 download/apply/favorite/login |
| 管理端 | 皮肤/宠物 CRUD 上下架、分类、适配器热修复、客户端版本、用户记录、遥测、看板 |
| 适配器热修复 | 管理端「适配器」发布 config/CSS → 客户端注入前热拉取,目标应用更新不用发版 |
| 恢复默认 | 客户端 / 托盘「恢复默认外观」→ 移除注入并验证已干净 |

## 安全边界

- CDP 只绑 `127.0.0.1`,WebSocket URL 白名单校验 + DOM 探测双重确认目标
- 皮肤是**数据**(图 + 配色 + 文案),不含可执行代码;注入 JS/CSS 只随客户端版本走
- 不修改目标应用安装目录 / 签名;`恢复默认` 完全还原
- 管理端 JWT(admin 角色)与用户 JWT(user 角色)隔离;上传类型/大小白名单

## 测试

```bash
# Go:auth 单测 + 全链路 E2E(内存 SQLite,覆盖管理/公开/用户/宠物/适配器/遥测)
cd server && go test ./...

# 客户端引擎:payload 构建、CDP 目标校验、注入/移除表达式
pnpm --filter @codress/desktop test

# 管理端 / 客户端构建
pnpm build:admin && pnpm build:desktop
```

生产环境注意:改 `JWT_SECRET` 与管理员密码;配置 OAuth 后设 `DEV_LOGIN=0`;
`PUBLIC_BASE_URL` 填对外域名(影响资源下载与 OAuth 回调)。
