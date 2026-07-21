import type { AdapterDefinition } from "./types";

/**
 * WorkBuddy 桌面端(catalog 模式:一次注入携带主题目录,切换靠页面内 switchTheme)。
 * 注入运行时见 resources/runtime/workbuddy/。
 */
export const workbuddyAdapter: AdapterDefinition = {
  id: "workbuddy",
  name: "WorkBuddy",
  defaultPort: 9345,
  targetUrlPrefixes: [],
  probeMarkers: {
    required: {
      root: "#root",
      sidebar: ".conversation-list, .conversation-sidebar",
    },
    title: "WorkBuddy",
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
  launchArgs: (port) => [
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${port}`,
  ],
  win: {
    exeCandidates: [
      "%LOCALAPPDATA%\\Programs\\WorkBuddy\\WorkBuddy.exe",
      "%LOCALAPPDATA%\\Programs\\workbuddy\\WorkBuddy.exe",
    ],
    processName: "WorkBuddy.exe",
  },
  mac: {
    bundleIds: ["com.tencent.workbuddy"],
    appCandidates: ["/Applications/WorkBuddy.app", "~/Applications/WorkBuddy.app"],
  },
};
