import type { AdapterDefinition, TargetAppId } from "./types";
import { codexAdapter } from "./codex";
import { workbuddyAdapter } from "./workbuddy";
import { claudeAdapter } from "./claude";

export const adapters: Record<TargetAppId, AdapterDefinition> = {
  codex: codexAdapter,
  workbuddy: workbuddyAdapter,
  claude: claudeAdapter,
};

export function adapterFor(id: string): AdapterDefinition {
  const adapter = adapters[id as TargetAppId];
  if (!adapter) throw new Error(`Unknown target app: ${id}`);
  return adapter;
}

export * from "./types";
