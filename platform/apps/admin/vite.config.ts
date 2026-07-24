import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  return {
    // 生产环境部署在 https://codress.dev/admin/，开发环境仍使用根路径。
    base: mode === "production" ? "/admin/" : "/",
    plugins: [react()],
    server: {
      port: 5174,
      proxy: {
        "/api": "http://127.0.0.1:8080",
        "/static": "http://127.0.0.1:8080",
      },
    },
  };
});
