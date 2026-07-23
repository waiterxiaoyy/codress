<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./images/codress-banner-dark.png">
    <img src="./images/codress-banner.png" alt="Codress" width="380">
  </picture>
</p>

<p align="center">
  <strong>Refresh your AI workspace. Keep inspiration close.</strong><br>
  One-click themes, desktop pets, and local asset management for Codex and WorkBuddy.
</p>

<p align="center">
  <strong>English</strong> ·
  <a href="./README_zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://codress.dev">Website</a> ·
  <a href="https://github.com/waiterxiaoyy/codress/releases">Download</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#local-development">Development</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-111111" alt="macOS and Windows">
  <img src="https://img.shields.io/badge/Electron-33-111111" alt="Electron 33">
  <img src="https://img.shields.io/badge/Node-%E2%89%A520-111111" alt="Node 20 or newer">
  <img src="https://img.shields.io/badge/Go-1.24+-111111" alt="Go 1.24 or newer">
</p>

---

## What is Codress?

Codress is a desktop appearance tool for Electron-based AI workspaces. It applies themes through a local Chrome DevTools Protocol (CDP) connection without replacing application files or modifying official installation packages. You can restore the original appearance at any time.

Browsing the store and downloading assets requires a network connection. Applying, switching, restoring, and managing downloaded assets happens on the user's computer.

## Features

| Module | Capability |
| --- | --- |
| Theme Store | Browse, search, and filter themes for Codex and WorkBuddy |
| One-click Apply | Detect the target app and enable its local theming channel when needed |
| Local Theme Creator | Preview and adjust composition, image treatment, appearance, and a shared background/panel/text/accent palette before saving |
| Restore Default | Remove injected styles and return to the original appearance |
| Desktop Pets | Browse, install, and enable Codex v2 pets or run them as floating desktop companions |
| My Library | Manage cached themes, installed pets, and running desktop pets |
| Appearance | Light, dark, and system modes with automatic system-theme updates |
| Auto Update | Check GitHub Releases, download updates, and restart to install |
| Admin Console | Manage themes, pets, categories, adapters, client versions, and operational data |

The local theme creator works without an account and keeps artwork on the user's computer. Account sync, remote favorites, community publishing, and the account-backed creator workbench remain hidden until those workflows are ready.

## Support Matrix

| Target | Themes | Pets | Platform |
| --- | --- | --- | --- |
| Codex | Supported | Codex v2 and floating desktop pets | macOS / Windows |
| WorkBuddy | Supported | Not available yet | macOS / Windows |

## Quick Start

### Install

Download the package for your platform from [GitHub Releases](https://github.com/waiterxiaoyy/codress/releases):

| Platform | Package |
| --- | --- |
| macOS Apple Silicon | `Codress-<version>-mac-arm64.dmg` |
| macOS Intel | `Codress-<version>-mac-x64.dmg` |
| Windows x64 | `Codress-<version>-win-x64.exe` |

Official macOS packages require signing and notarization. Locally built unsigned packages may trigger a Gatekeeper warning.

### Apply Your First Theme

1. Open Codress and go to **Themes**.
2. Select Codex or WorkBuddy.
3. Browse themes or narrow the list with search and categories.
4. Click **Apply**.
5. If the target app's local theming channel is not enabled, confirm one restart.

Use **Restore Default** in the top-right corner of the Themes page to return to the original interface.

### Use a Pet

1. Open **Pets** and select a pet.
2. Install it into Codex or run it as an independent floating desktop pet.
3. Manage installed and running pets from **My Library**.

## How It Works

```text
Codress Desktop
├── HTTPS ────────────────> Codress API
│                          themes, pets, categories, versions
│
├── 127.0.0.1 CDP ───────> Codex / WorkBuddy
│                          apply or remove controlled CSS/runtime
│
└── Local Library ───────> user data directory
                           settings, theme cache, pets, local assets
```

Security boundaries:

- CDP connections are limited to loopback addresses.
- WebSocket targets are checked against expected shapes and processes.
- Store themes contain images and metadata, not arbitrary executable code.
- The injection runtime ships with the Codress client and is not dynamically loaded from theme packages.
- Codress does not modify target application directories or signed application files.

## Repository Structure

```text
codress/
├── index.html                         # website landing page
├── images/                            # website, README, and brand assets
├── docs/                              # architecture and UI contracts
└── platform/
    ├── apps/
    │   ├── desktop/                   # Electron desktop client
    │   │   ├── src/main/              # CDP, launcher, pets, updater, IPC
    │   │   └── src/renderer/          # React desktop UI
    │   └── admin/                     # React + Ant Design admin console
    ├── packages/skin-schema/          # shared theme data contract
    ├── server/                        # Go API
    └── deploy/                        # MySQL, seed data, deployment config
```

## Local Development

Requirements:

- Node.js 20+
- pnpm
- Go 1.24+
- Docker or an available MySQL 8 instance

Install frontend dependencies:

```bash
cd platform
pnpm install
```

Start the desktop client:

```bash
pnpm dev:desktop
```

Start the API and database:

```bash
cd deploy
docker compose up -d mysql

cd ../server
go run ./cmd/api
```

Start the admin console:

```bash
cd platform
pnpm dev:admin
```

The admin development server runs at `http://127.0.0.1:5174` and proxies `/api` and `/static` to the local API. Replace the JWT secret and administrator password in `.env` before production deployment.

## Build and Test

```bash
cd platform

# Type-check and build
pnpm build:desktop
pnpm build:admin

# Desktop tests
pnpm --filter @codress/desktop test

# macOS / Windows installers
pnpm pack:mac
pnpm pack:win
```

```bash
cd platform/server
go test ./...
```

## Desktop Release

1. Update the version in `platform/apps/desktop/package.json`.
2. Commit the change and push a matching tag such as `v1.0.1`.
3. GitHub Actions builds the macOS and Windows installers.
4. The draft Release is published only after both platform builds succeed.

macOS releases require signing and notarization secrets. Windows code signing is optional.

## Roadmap

- Add more local composition and interface-preview presets
- Restore account sync and remote favorites
- Open community creation and store submissions
- Add adapters for more Electron AI workspaces
