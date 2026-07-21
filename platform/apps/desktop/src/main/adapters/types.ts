export type TargetAppId = "codex" | "workbuddy";

/** DOM 探测标记:确认连接到的 CDP 页面确实是目标应用的渲染进程 */
export interface ProbeMarkers {
  /** 主结构选择器,全部命中才认为匹配 */
  required: Record<string, string>;
  /** 额外要求的 document.title(可选) */
  title?: string;
}

/** 注入运行时在页面里使用的键位,与 resources/runtime/<id>/renderer-inject.js 保持一致 */
export interface RuntimeKeys {
  scopeClass: string;
  stateKey: string;
  disabledKey: string;
  styleId: string;
  chromeId: string;
}

/** renderer-inject.js 模板中的占位符(存在才替换) */
export interface PayloadPlaceholders {
  css: string;
  art?: string;
  theme?: string;
  catalog?: string;
  version?: string;
  styleRevision?: string;
  payloadRevision?: string;
}

export interface AdapterDefinition {
  id: TargetAppId;
  name: string;
  /** 目标应用图标(放在 resources 目录,通过 app-asset://<icon> 访问) */
  icon?: string;
  defaultPort: number;
  /** CDP 目标 URL 允许的前缀;空数组 = 不按 URL 过滤(只靠 DOM 探测) */
  targetUrlPrefixes: string[];
  probeMarkers: ProbeMarkers;
  /** theme: 单主题模板(Codex);catalog: 多主题目录模板(WorkBuddy) */
  payloadKind: "theme" | "catalog";
  runtimeKeys: RuntimeKeys;
  placeholders: PayloadPlaceholders;
  launchArgs(port: number): string[];
  win: {
    /** 快速路径:常见安装位置(支持 %ENV% 展开);找不到再走自动发现 */
    exeCandidates: string[];
    /** 可能的进程名(不同渠道安装的进程名可能不同,如 Codex 商店版是 ChatGPT.exe) */
    processNames: string[];
    /** 注册表卸载项 / 开始菜单快捷方式的 DisplayName 匹配(不区分大小写的正则源) */
    displayNamePattern: string;
    /** MSIX / 商店包:按包名前缀发现,启动走 AUMID 激活 */
    appx?: { namePattern: string };
  };
  mac: { bundleIds: string[]; appCandidates: string[] };
}
