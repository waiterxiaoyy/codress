import { Layout, Menu, Button } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

const items = [
  { key: "/", label: "看板" },
  { key: "/skins", label: "皮肤" },
  { key: "/pets", label: "宠物" },
  { key: "/categories", label: "分类" },
  { key: "/adapters", label: "适配器" },
  { key: "/releases", label: "客户端版本" },
  { key: "/users", label: "用户记录" },
  { key: "/telemetry", label: "遥测" },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <Layout style={{ minHeight: "100vh", background: "#fff" }}>
      <Layout.Sider theme="light" width={180} style={{ borderRight: "1px solid #eee" }}>
        <div style={{ padding: "20px 24px", fontWeight: 700, fontSize: 18, letterSpacing: 1 }}>
          CODRESS
        </div>
        <Menu
          mode="inline"
          style={{ borderInlineEnd: "none" }}
          selectedKeys={[location.pathname]}
          items={items}
          onClick={({ key }) => navigate(key)}
        />
      </Layout.Sider>
      <Layout style={{ background: "#fff" }}>
        <Layout.Header
          style={{
            background: "#fff",
            borderBottom: "1px solid #eee",
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            paddingInline: 24,
          }}
        >
          <Button
            size="small"
            onClick={() => {
              localStorage.removeItem("codress.admin.token");
              navigate("/login");
            }}
          >
            退出登录
          </Button>
        </Layout.Header>
        <Layout.Content style={{ padding: 24 }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
