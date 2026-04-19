import { useEffect, useState } from "react";
import { Button, Modal, Form, Input, Select, message, Typography, Space } from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import ResizableTable from "../components/ResizableTable";
import { api } from "../api/client";
import type { ScenarioResponse, ScenarioFormat } from "../api/types";

const formatOptions: { label: string; value: ScenarioFormat }[] = [
  { label: "OpenSCENARIO 1.x", value: "open_scenario1" },
  { label: "OpenSCENARIO 2.x", value: "open_scenario2" },
  { label: "CARLA Leaderboard Route", value: "carla_lb_route" },
];

export default function Scenarios() {
  const [data, setData] = useState<ScenarioResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    api.listScenarios().then(setData).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleCreate = async (values: {
    format: ScenarioFormat;
    title?: string;
    scenario_path: string;
    goal_config: string;
  }) => {
    setCreating(true);
    try {
      const goalConfig = JSON.parse(values.goal_config);
      await api.createScenario({
        format: values.format,
        title: values.title || null,
        scenario_path: values.scenario_path,
        goal_config: goalConfig,
      });
      message.success("Scenario created");
      setModalOpen(false);
      form.resetFields();
      load();
    } catch (e) {
      message.error(String(e));
    } finally {
      setCreating(false);
    }
  };

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60 },
    { title: "Title", dataIndex: "title", key: "title", width: 250, ellipsis: true, render: (v: string | null) => v ?? "-" },
    { title: "Format", dataIndex: "format", key: "format", width: 120 },
    { title: "Scenario Path", dataIndex: "scenario_path", key: "scenario_path", width: 200, ellipsis: true },
    {
      title: "Goal Config",
      dataIndex: "goal_config",
      key: "goal_config",
      width: 200,
      ellipsis: true,
      render: (v: unknown) => JSON.stringify(v),
    },
  ];

  return (
    <>
      <Typography.Title level={3}>Scenarios</Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Create Scenario
        </Button>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </Space>
      <ResizableTable dataSource={data} columns={columns} rowKey="id" loading={loading} />

      <Modal title="Create Scenario" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="format" label="Format" rules={[{ required: true }]}>
            <Select options={formatOptions} />
          </Form.Item>
          <Form.Item name="title" label="Title">
            <Input />
          </Form.Item>
          <Form.Item name="scenario_path" label="Scenario Path" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="goal_config"
            label="Goal Config (JSON)"
            rules={[
              { required: true },
              {
                validator: (_, value) => {
                  try { JSON.parse(value); return Promise.resolve(); }
                  catch { return Promise.reject("Invalid JSON"); }
                },
              },
            ]}
          >
            <Input.TextArea rows={4} placeholder='{"key": "value"}' />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={creating} block>Create</Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
