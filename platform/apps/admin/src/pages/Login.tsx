import { Button, Card, Form, Input, message } from "antd";
import { useNavigate } from "react-router-dom";
import { api, errorText } from "../api";

export default function Login() {
  const navigate = useNavigate();
  const onFinish = async (values: { username: string; password: string }) => {
    try {
      const { data } = await api.post("/admin/auth/login", values);
      localStorage.setItem("codress.admin.token", data.token);
      navigate("/");
    } catch (error) {
      message.error(errorText(error));
    }
  };
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#fafafa",
      }}
    >
      <Card style={{ width: 360, border: "1px solid #e5e5e5" }} styles={{ body: { padding: 32 } }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>CODRESS</div>
        <div style={{ color: "#888", marginBottom: 24 }}>皮肤与桌面宠物 · 管理端</div>
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
            <Input placeholder="admin" autoFocus />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true }]}>
            <Input.Password placeholder="••••••••" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}
