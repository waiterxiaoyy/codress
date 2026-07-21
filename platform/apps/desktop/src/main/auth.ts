import http from "node:http";
import { shell } from "electron";

/**
 * 桌面端 OAuth:本机起一个一次性回环 HTTP 监听 → 系统浏览器完成
 * GitHub/Google 授权 → 服务端把 JWT 重定向回 127.0.0.1:<port>/auth/callback。
 */
export function loginViaBrowser(apiBase: string, provider: string, timeoutMs = 180000): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/auth/callback") {
        res.writeHead(404).end();
        return;
      }
      const token = url.searchParams.get("token");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#fff;color:#111;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><div style="font-size:20px;font-weight:700">CODRESS</div><div style="margin-top:8px;color:#666">${
          token ? "登录成功,请回到 Codress 客户端" : "登录失败,请重试"
        }</div></div>`
      );
      cleanup();
      if (token) resolve(token);
      else reject(new Error("callback missing token"));
    });
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("登录超时(3 分钟未完成授权)"));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      server.close();
    };
    server.on("error", (error) => {
      cleanup();
      reject(error);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        cleanup();
        reject(new Error("loopback listener failed"));
        return;
      }
      const loginUrl = `${apiBase}/api/v1/auth/oauth/${provider}/login?port=${address.port}`;
      shell.openExternal(loginUrl).catch((error) => {
        cleanup();
        reject(error);
      });
    });
  });
}
