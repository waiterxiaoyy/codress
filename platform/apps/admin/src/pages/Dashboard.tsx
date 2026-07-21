import { useEffect, useState } from "react";
import { Card, Col, Row, Statistic, Table } from "antd";
import { api } from "../api";

interface Overview {
  skins: { total: number; published: number; downloads: number };
  pets: { total: number; published: number; downloads: number };
  users: { total: number };
  telemetry: { total7d: number; pass7d: number; passRate7d: number };
  topSkins: { slug: string; name: string; downloads: number }[];
}

export default function Dashboard() {
  const [data, setData] = useState<Overview | null>(null);
  useEffect(() => {
    api.get("/admin/stats/overview").then((r) => setData(r.data));
  }, []);
  if (!data) return null;
  return (
    <div>
      <Row gutter={16}>
        <Col span={6}>
          <Card variant="outlined">
            <Statistic title="已上架皮肤" value={data.skins.published} suffix={`/ ${data.skins.total}`} />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="outlined">
            <Statistic title="已上架宠物" value={data.pets.published} suffix={`/ ${data.pets.total}`} />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="outlined">
            <Statistic title="用户数" value={data.users.total} />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="outlined">
            <Statistic
              title="7 日注入通过率"
              value={(data.telemetry.passRate7d * 100).toFixed(1)}
              suffix={`% (${data.telemetry.pass7d}/${data.telemetry.total7d})`}
            />
          </Card>
        </Col>
      </Row>
      <Card title="下载 Top 皮肤" variant="outlined" style={{ marginTop: 16 }}>
        <Table
          rowKey="slug"
          size="small"
          pagination={false}
          dataSource={data.topSkins}
          columns={[
            { title: "Slug", dataIndex: "slug" },
            { title: "名称", dataIndex: "name" },
            { title: "下载量", dataIndex: "downloads", width: 120 },
          ]}
        />
      </Card>
    </div>
  );
}
