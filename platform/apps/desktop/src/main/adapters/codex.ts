import type { AdapterDefinition } from "./types";

/**
 * Codex 桌面端(bundle id: com.openai.codex)。
 * 注入运行时见 resources/runtime/codex/。
 */
export const codexAdapter: AdapterDefinition = {
  id: "codex",
  name: "Codex",
  defaultPort: 9341,
  targetUrlPrefixes: ["app://"],
  probeMarkers: {
    required: {
      shell: "main.main-surface",
      sidebar: "aside.app-shell-left-panel",
    },
  },
  payloadKind: "theme",
  runtimeKeys: {
    scopeClass: "codex-dream-skin",
    stateKey: "__CODEX_DREAM_SKIN_STATE__",
    disabledKey: "__CODEX_DREAM_SKIN_DISABLED__",
    styleId: "codex-dream-skin-style",
    chromeId: "codex-dream-skin-chrome",
  },
  placeholders: {
    css: "__DREAM_SKIN_CSS_JSON__",
    art: "__DREAM_SKIN_ART_JSON__",
    theme: "__DREAM_SKIN_THEME_JSON__",
    version: "__DREAM_SKIN_VERSION_JSON__",
    styleRevision: "__DREAM_SKIN_STYLE_REVISION_JSON__",
    payloadRevision: "__DREAM_SKIN_PAYLOAD_REVISION_JSON__",
  },
  launchArgs: (port) => [
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${port}`,
  ],
  win: {
    exeCandidates: [
      "%LOCALAPPDATA%\\Programs\\Codex\\Codex.exe",
      "%LOCALAPPDATA%\\Programs\\ChatGPT\\ChatGPT.exe",
      "%LOCALAPPDATA%\\Codex\\Codex.exe",
    ],
    processName: "Codex.exe",
  },
  mac: {
    bundleIds: ["com.openai.codex"],
    appCandidates: [
      "/Applications/ChatGPT.app",
      "/Applications/Codex.app",
      "~/Applications/ChatGPT.app",
      "~/Applications/Codex.app",
    ],
  },
};
