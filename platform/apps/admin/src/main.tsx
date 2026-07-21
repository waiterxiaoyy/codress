import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import App from "./App";
import "./global.css";

// 简约黑白:主色即墨色,去圆角花哨,全局无彩色。
const monochrome = {
  token: {
    colorPrimary: "#111111",
    colorInfo: "#111111",
    colorLink: "#111111",
    colorSuccess: "#111111",
    colorWarning: "#555555",
    colorError: "#000000",
    borderRadius: 2,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  },
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={monochrome}>
      <App />
    </ConfigProvider>
  </React.StrictMode>
);
