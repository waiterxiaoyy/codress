import { describe, expect, it } from "vitest";
import { buildLaunchEnv } from "../src/main/launcher";
import { codexAdapter } from "../src/main/adapters/codex";
import { workbuddyAdapter } from "../src/main/adapters/workbuddy";

describe("buildLaunchEnv", () => {
  const base = {
    PATH: "C:\\Windows",
    ELECTRON_RUN_AS_NODE: "1",
    ELECTRON_RENDERER_URL: "http://localhost:5173",
    VITE_DEV_SERVER_URL: "http://localhost:5173",
    NODE_ENV: "development",
  };

  it("为声明 portEnvVar 的适配器注入调试端口(WorkBuddy 不认命令行端口参数)", () => {
    const env = buildLaunchEnv(workbuddyAdapter, 9365, base);
    expect(env.WORKBUDDY_REMOTE_DEBUGGING_PORT).toBe("9365");
  });

  it("命令行传端口的适配器不注入端口变量", () => {
    const env = buildLaunchEnv(codexAdapter, 9341, base);
    expect(env.WORKBUDDY_REMOTE_DEBUGGING_PORT).toBeUndefined();
  });

  it("清理会干扰目标应用的 Codress dev 变量,保留其余环境", () => {
    const env = buildLaunchEnv(workbuddyAdapter, 9365, base);
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(env.ELECTRON_RENDERER_URL).toBeUndefined();
    expect(env.VITE_DEV_SERVER_URL).toBeUndefined();
    expect(env.NODE_ENV).toBeUndefined();
    expect(env.PATH).toBe("C:\\Windows");
  });

  it("不修改传入的 base 环境对象", () => {
    const snapshot = { ...base };
    buildLaunchEnv(workbuddyAdapter, 9365, base);
    expect(base).toEqual(snapshot);
  });
});
