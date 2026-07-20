# Codress

编辑器皮肤与桌面宠物市场。给 Cursor、VS Code、CodeBuddy 等 Electron 编辑器换个界面，让灵感常驻。

## 特性

- 数千套主题皮肤与桌面宠物
- 一键切换，不修改任何官方文件
- 纯本地运行，无需联网
- 随时恢复默认，不留痕迹
- 支持 Windows / macOS

## 本地预览

直接打开 `index.html` 即可预览，或使用任意静态服务器：

```bash
# 使用 Python
python3 -m http.server 8080

# 或使用 Node.js
npx serve .
```

## 部署

项目使用 Docker + Nginx 部署，配置文件：

- `nginx.conf` — Nginx 站点配置
- `docker-compose.yml` — Docker Compose 编排

```bash
docker compose up -d
```

## 项目结构

```
codress/
├── index.html          # 单页面（含中英文 i18n）
├── images/
│   ├── skins/          # 皮肤预览图
│   └── pets/           # 宠物预览图
├── nginx.conf          # Nginx 配置
├── docker-compose.yml  # Docker 编排
└── .gitignore
```

## License

MIT
