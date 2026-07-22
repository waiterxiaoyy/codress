import type { AdapterDefinition } from "./types";

/**
 * WorkBuddy 桌面端(catalog 模式:一次注入携带主题目录,切换靠页面内 switchTheme)。
 * 注入运行时见 resources/runtime/workbuddy/。
 *
 * target URL 规则（对齐 skill injector）：
 *   file://.../WorkBuddy.app/Contents/Resources/app.asar/renderer/index.html
 */
export const workbuddyAdapter: AdapterDefinition = {
  id: "workbuddy",
  name: "WorkBuddy",
  icon: "workbuddy.png",
  defaultPort: 9365,
  // 用 URL 前缀过滤，精准匹配 WorkBuddy 渲染进程（对齐 skill 的 isWorkBuddyRendererTarget）
  targetUrlPrefixes: ["file://"],
  probeMarkers: {
    required: {
      root: "#root",
      sidebar: ".conversation-list, .conversation-sidebar",
    },
    // 不依赖 title（WorkBuddy 在某些路由下 title 可能变化），改用 URL 过滤 + DOM 探针
  },
  payloadKind: "catalog",
  runtimeKeys: {
    scopeClass: "workbuddy-dream-skin",
    stateKey: "__WORKBUDDY_DREAM_SKIN_STATE__",
    disabledKey: "__WORKBUDDY_DREAM_SKIN_DISABLED__",
    styleId: "workbuddy-dream-skin-style",
    chromeId: "workbuddy-dream-skin-chrome",
  },
  placeholders: {
    css: "__WORKBUDDY_DREAM_SKIN_CSS_JSON__",
    catalog: "__WORKBUDDY_DREAM_SKIN_CATALOG_JSON__",
    version: "__WORKBUDDY_DREAM_SKIN_VERSION_JSON__",
  },
  launchArgs: (_port) => [
    // WorkBuddy 不认 --remote-debugging-port,此处只传 address;
    // 端口由 launchWithCdp 按 portEnvVar 注入环境变量(mac/win 通用)
    "--remote-debugging-address=127.0.0.1",
  ],
  portEnvVar: "WORKBUDDY_REMOTE_DEBUGGING_PORT",
  win: {
    exeCandidates: [
      "%LOCALAPPDATA%\\Programs\\WorkBuddy\\WorkBuddy.exe",
      "%LOCALAPPDATA%\\Programs\\workbuddy\\WorkBuddy.exe",
      "%ProgramFiles%\\WorkBuddy\\WorkBuddy.exe",
    ],
    processNames: ["WorkBuddy.exe"],
    displayNamePattern: "workbuddy",
  },
  mac: {
    bundleIds: ["com.tencent.workbuddy"],
    appCandidates: ["/Applications/WorkBuddy.app", "~/Applications/WorkBuddy.app"],
  },
};
