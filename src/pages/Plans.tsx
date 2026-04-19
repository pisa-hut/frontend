import { useEffect, useState } from "react";
import { Button, Modal, Form, Select, Input, message, Typography, Space } from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import ResizableTable from "../components/ResizableTable";
import { api } from "../api/client";
import type { PlanResponse, MapResponse, ScenarioResponse } from "../api/types";

export default function Plans() {
  const [data, setData] = useState<PlanResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [maps, setMaps] = useState<MapResponse[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioResponse[]>([]);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    api.listPlans().then(setData).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openModal = () => {
    Promise.all([api.listMaps(), api.listScenarios()]).then(([m, s]) => {
      setMaps(m);
      setScenarios(s);
      setModalOpen(true);
    });
  };

  const handleCreate = async (values: { name: string; map_id: number; scenario_id: number }) => {
    setCreating(true);
    try {
      await api.createPlan(values);
      message.success("Plan created");
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
    { title: "Name", dataIndex: "name", key: "name", width: 300, ellipsis: true },
    { title: "Map ID", dataIndex: "map_id", key: "map_id", width: 80 },
    { title: "Scenario ID", dataIndex: "scenario_id", key: "scenario_id", width: 100 },
  ];

  return (
    <>
      <Typography.Title level={3}>Plans</Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openModal}>Create Plan</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </Space>
      <ResizableTable dataSource={data} columns={columns} rowKey="id" loading={loading} />

      <Modal title="Create Plan" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="map_id" label="Map" rules={[{ required: true }]}>
            <Select
              options={maps.map((m) => ({ label: `${m.name} (#${m.id})`, value: m.id }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="scenario_id" label="Scenario" rules={[{ required: true }]}>
            <Select
              options={scenarios.map((s) => ({
                label: `${s.title ?? s.scenario_path} (#${s.id})`,
                value: s.id,
              }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={creating} block>Create</Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
