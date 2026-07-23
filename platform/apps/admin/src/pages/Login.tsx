import { Button, Card, Form, Input, message } from "antd";
import { useNavigate } from "react-router-dom";
import { api, errorText } from "../api";
import codressBanner from "../assets/codress-banner.png";

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
        <div className="admin-login-brand">
          <img src={codressBanner} alt="Codress" />
          <span>皮肤与桌面宠物 · 管理中心</span>
        </div>
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
