import type { AdapterDefinition } from "./types";

/**
 * Claude 桌面端(bundle id: com.anthropic.claudedesktop)。
 * 注入运行时见 resources/runtime/claude/。
 *
 * Claude Desktop 是 Electron 应用,渲染进程使用 https:// URL 加载
 * (对齐 claude.ai 的 SPA 路由),CDP target URL 以 https://claude.ai 开头。
 */
export const claudeAdapter: AdapterDefinition = {
  id: "claude",
  name: "Claude",
  icon: "claude.png",
  defaultPort: 9383,
  // Claude Desktop 渲染进程 URL 以 https://claude.ai 开头;
  // 空数组也可行(只靠 DOM 探测),但加 prefix 能提前过滤无关 CDP 页面
  targetUrlPrefixes: ["https://claude.ai"],
  probeMarkers: {
    required: {
      // Claude Desktop 的核心 DOM 结构标记
      root: "[data-sidebar-state]",
      main: "main, [role='main']",
    },
  },
  payloadKind: "theme",
  runtimeKeys: {
    scopeClass: "claude-dream-skin",
    stateKey: "__CLAUDE_DREAM_SKIN_STATE__",
    disabledKey: "__CLAUDE_DREAM_SKIN_DISABLED__",
    styleId: "claude-dream-skin-style",
    chromeId: "claude-dream-skin-chrome",
  },
  placeholders: {
    css: "__CLAUDE_DREAM_SKIN_CSS_JSON__",
    art: "__CLAUDE_DREAM_SKIN_ART_JSON__",
    theme: "__CLAUDE_DREAM_SKIN_THEME_JSON__",
    version: "__CLAUDE_DREAM_SKIN_VERSION_JSON__",
    styleRevision: "__CLAUDE_DREAM_SKIN_STYLE_REVISION_JSON__",
    payloadRevision: "__CLAUDE_DREAM_SKIN_PAYLOAD_REVISION_JSON__",
  },
  launchArgs: (port) => [
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${port}`,
  ],
  win: {
    exeCandidates: [
      "%LOCALAPPDATA%\\AnthropicClaude\\claude.exe",
      "%LOCALAPPDATA%\\AnthropicClaude\\Claude.exe",
      "%LOCALAPPDATA%\\Programs\\Claude\\Claude.exe",
      "%LOCALAPPDATA%\\Programs\\claude-desktop\\Claude.exe",
      "%LOCALAPPDATA%\\Claude\\Claude.exe",
      "%LOCALAPPDATA%\\claude-desktop\\Claude.exe",
    ],
    processNames: ["Claude.exe", "claude.exe"],
    displayNamePattern: "claude",
    appx: { namePattern: "Claude", launchMode: "unsupported" },
  },
  mac: {
    bundleIds: ["com.anthropic.claudedesktop"],
    appCandidates: [
      "/Applications/Claude.app",
      "~/Applications/Claude.app",
    ],
  },
};
