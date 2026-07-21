import type { AdapterDefinition } from "../adapters";

export interface VerifyResult {
  installed: boolean;
  stylePresent: boolean;
  chromePresent: boolean;
  chromePointerEvents: string | null;
  markersVisible: Record<string, boolean>;
  overflowX: boolean;
  pass: boolean;
}

/**
 * 通用注入验证:皮肤 class/style 在位、装饰层不可交互、
 * 原生结构仍可见、无横向溢出 —— 不通过就不算应用成功。
 */
export function verifyExpression(adapter: AdapterDefinition): string {
  const k = adapter.runtimeKeys;
  const markers = JSON.stringify(adapter.probeMarkers.required);
  return `(() => {
    const visible = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const markers = ${markers};
    const markersVisible = {};
    for (const [key, selector] of Object.entries(markers)) markersVisible[key] = visible(selector);
    const chrome = document.getElementById(${JSON.stringify(k.chromeId)});
    const result = {
      installed: document.documentElement.classList.contains(${JSON.stringify(k.scopeClass)}),
      stylePresent: Boolean(document.getElementById(${JSON.stringify(k.styleId)})),
      chromePresent: Boolean(chrome),
      chromePointerEvents: chrome ? getComputedStyle(chrome).pointerEvents : null,
      markersVisible,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
    result.pass = result.installed && result.stylePresent &&
      (!result.chromePresent || result.chromePointerEvents === 'none') &&
      Object.values(markersVisible).every(Boolean) && !result.overflowX;
    return result;
  })()`;
}

export function verifyRemovedExpression(adapter: AdapterDefinition): string {
  const k = adapter.runtimeKeys;
  return `(() =>
    !document.documentElement.classList.contains(${JSON.stringify(k.scopeClass)}) &&
    !document.getElementById(${JSON.stringify(k.styleId)}) &&
    !document.getElementById(${JSON.stringify(k.chromeId)})
  )()`;
}
