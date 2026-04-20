import { useEffect, useState } from "react";
import { Button, Modal, Form, Select, Input, message, Space, Popconfirm, Table } from "antd";
import { PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { getColumnSearchProps } from "../components/ColumnSearch";
import PageHeader from "../components/PageHeader";
import { api } from "../api/client";
import type { PlanResponse, MapResponse, ScenarioResponse } from "../api/types";

export default function Plans() {
  const [data, setData] = useState<PlanResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlanResponse | null>(null);
  const [maps, setMaps] = useState<MapResponse[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioResponse[]>([]);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = () => { setLoading(true); api.listPlans().then(setData).finally(() => setLoading(false)); };
  useEffect(load, []);

  const fetchDeps = () => Promise.all([api.listMaps(), api.listScenarios()]).then(([m, s]) => { setMaps(m); setScenarios(s); });
  const openCreate = () => { setEditing(null); form.resetFields(); fetchDeps().then(() => setModalOpen(true)); };
  const openEdit = (r: PlanResponse) => { setEditing(r); form.setFieldsValue(r); fetchDeps().then(() => setModalOpen(true)); };

  const handleSave = async (values: { name: string; map_id: number; scenario_id: number }) => {
    setSaving(true);
    try {
      if (editing) { await api.updatePlan(editing.id, values); message.success("Updated"); }
      else { await api.createPlan(values); message.success("Created"); }
      setModalOpen(false); form.resetFields(); setEditing(null); load();
    } catch (e) { message.error(String(e)); } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try { await api.deletePlan(id); message.success("Deleted"); load(); } catch (e) { message.error(String(e)); }
  };

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60, ...getColumnSearchProps<PlanResponse>("id") },
    { title: "Name", dataIndex: "name", key: "name", ellipsis: true, ...getColumnSearchProps<PlanResponse>("name") },
    { title: "Map", dataIndex: "map_id", key: "map_id", width: 80, ...getColumnSearchProps<PlanResponse>("map_id") },
    { title: "Scenario", dataIndex: "scenario_id", key: "scenario_id", width: 100, ...getColumnSearchProps<PlanResponse>("scenario_id") },
    { title: "Actions", key: "actions", width: 90, render: (_: unknown, r: PlanResponse) => (
      <Space>
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        <Popconfirm title="Delete?" onConfirm={() => handleDelete(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
      </Space>
    )},
  ];

  return (
    <>
      <PageHeader title="Plans">
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Create</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </PageHeader>
      <Table dataSource={data} columns={columns} rowKey="id" loading={loading} size="small" scroll={{ x: "max-content" }} />
      <Modal title={editing ? "Edit Plan" : "Create Plan"} open={modalOpen} onCancel={() => { setModalOpen(false); setEditing(null); }} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="map_id" label="Map" rules={[{ required: true }]}>
            <Select options={maps.map((m) => ({ label: `${m.name} (#${m.id})`, value: m.id }))} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="scenario_id" label="Scenario" rules={[{ required: true }]}>
            <Select options={scenarios.map((s) => ({ label: `${s.title ?? s.scenario_path} (#${s.id})`, value: s.id }))} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={saving} block>{editing ? "Save" : "Create"}</Button></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
