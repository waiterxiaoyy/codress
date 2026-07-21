import { useCallback, useEffect, useState } from "react";
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, message } from "antd";
import { api, errorText } from "../api";

interface CategoryRow { id: number; type: string; slug: string; name: string; sort: number }

export default function Categories() {
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    const { data } = await api.get("/admin/categories");
    setRows(data.items);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={() => { form.resetFields(); form.setFieldsValue({ type: "skin", sort: 0 }); setCreating(true); }}>
          新建分类
        </Button>
      </Space>
      <Table<CategoryRow>
        rowKey="id"
        size="middle"
        dataSource={rows}
        pagination={false}
        columns={[
          { title: "类型", dataIndex: "type", width: 100, render: (t) => (t === "skin" ? "皮肤" : "宠物") },
          { title: "Slug", dataIndex: "slug", className: "mono" },
          { title: "名称", dataIndex: "name" },
          { title: "排序", dataIndex: "sort", width: 80 },
          {
            title: "操作", width: 120,
            render: (_, row) => (
              <Popconfirm title="确认删除?" onConfirm={async () => { await api.delete(`/admin/categories/${row.id}`); load(); }}>
                <Button size="small" danger>删除</Button>
              </Popconfirm>
            ),
          },
        ]}
      />
      <Modal
        title="新建分类"
        open={creating}
        onCancel={() => setCreating(false)}
        onOk={async () => {
          const values = await form.validateFields();
          try {
            await api.post("/admin/categories", values);
            message.success("已创建");
            setCreating(false);
            load();
          } catch (error) {
            message.error(errorText(error));
          }
        }}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="type" label="类型" rules={[{ required: true }]}>
            <Select options={[{ value: "skin", label: "皮肤" }, { value: "pet", label: "宠物" }]} />
          </Form.Item>
          <Form.Item name="slug" label="Slug" rules={[{ required: true, pattern: /^[a-z0-9][a-z0-9-]{0,63}$/ }]}>
            <Input placeholder="scifi" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="科幻" />
          </Form.Item>
          <Form.Item name="sort" label="排序">
            <InputNumber style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
