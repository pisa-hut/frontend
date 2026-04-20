import { useEffect, useState } from "react";
import { Button, Modal, Form, Input, Select, message, Space, Popconfirm, Table, Spin } from "antd";
import { PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from "@ant-design/icons";
import { getColumnSearchProps } from "../components/ColumnSearch";
import PageHeader from "../components/PageHeader";
import { api } from "../api/client";
import type { ScenarioResponse, ScenarioFormat } from "../api/types";

const MANAGER_URL = import.meta.env.VITE_MANAGER_URL ?? "/manager";

const formatOptions: { label: string; value: ScenarioFormat }[] = [
  { label: "OpenSCENARIO 1.x", value: "open_scenario1" },
  { label: "OpenSCENARIO 2.x", value: "open_scenario2" },
  { label: "CARLA Leaderboard Route", value: "carla_lb_route" },
];

export default function Scenarios() {
  const [data, setData] = useState<ScenarioResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ScenarioResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewContent, setPreviewContent] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = () => { setLoading(true); api.listScenarios().then(setData).finally(() => setLoading(false)); };
  useEffect(load, []);

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (r: ScenarioResponse) => {
    setEditing(r);
    form.setFieldsValue({ ...r, goal_config: JSON.stringify(r.goal_config, null, 2) });
    setModalOpen(true);
  };

  const openPreview = async (r: ScenarioResponse) => {
    const name = r.title ?? r.scenario_path.split("/").pop() ?? "unknown";
    setPreviewTitle(name);
    setPreviewContent("");
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      const filePath = `${r.scenario_path}/${name}.xosc`;
      const res = await fetch(`${MANAGER_URL}/scenario/file?path=${encodeURIComponent(filePath)}`);
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      setPreviewContent(await res.text());
    } catch (e) {
      setPreviewContent(`Error loading file: ${e}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSave = async (values: { scenario_format: ScenarioFormat; title?: string; scenario_path: string; goal_config: string }) => {
    setSaving(true);
    try {
      const payload = { ...values, goal_config: JSON.parse(values.goal_config), title: values.title || null };
      if (editing) { await api.updateScenario(editing.id, payload); message.success("Updated"); }
      else { await api.createScenario(payload); message.success("Created"); }
      setModalOpen(false); form.resetFields(); setEditing(null); load();
    } catch (e) { message.error(String(e)); } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try { await api.deleteScenario(id); message.success("Deleted"); load(); } catch (e) { message.error(String(e)); }
  };

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60, ...getColumnSearchProps<ScenarioResponse>("id") },
    { title: "Title", dataIndex: "title", key: "title", ellipsis: true, render: (v: string | null) => v ?? "-",
      ...getColumnSearchProps<ScenarioResponse>("title") },
    { title: "Format", dataIndex: "scenario_format", key: "scenario_format", width: 140,
      filters: formatOptions.map((f) => ({ text: f.label, value: f.value })),
      onFilter: (value: unknown, r: ScenarioResponse) => r.scenario_format === value },
    { title: "Path", dataIndex: "scenario_path", key: "scenario_path", width: 200, ellipsis: true,
      ...getColumnSearchProps<ScenarioResponse>("scenario_path") },
    { title: "", key: "actions", width: 100, render: (_: unknown, r: ScenarioResponse) => (
      <Space size={2}>
        <Button size="small" icon={<EyeOutlined />} onClick={() => openPreview(r)} />
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        <Popconfirm title="Delete?" onConfirm={() => handleDelete(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
      </Space>
    )},
  ];

  return (
    <>
      <PageHeader title="Scenarios">
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Create</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </PageHeader>
      <Table dataSource={data} columns={columns} rowKey="id" loading={loading} size="small" scroll={{ x: "max-content" }} />

      {/* Edit/Create modal */}
      <Modal title={editing ? "Edit Scenario" : "Create Scenario"} open={modalOpen} onCancel={() => { setModalOpen(false); setEditing(null); }} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="scenario_format" label="Format" rules={[{ required: true }]}><Select options={formatOptions} /></Form.Item>
          <Form.Item name="title" label="Title"><Input /></Form.Item>
          <Form.Item name="scenario_path" label="Scenario Path" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="goal_config" label="Goal Config (JSON)" rules={[{ required: true },
            { validator: (_, v) => { try { JSON.parse(v); return Promise.resolve(); } catch { return Promise.reject("Invalid JSON"); } } }]}>
            <Input.TextArea rows={4} placeholder='{"key": "value"}' />
          </Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={saving} block>{editing ? "Save" : "Create"}</Button></Form.Item>
        </Form>
      </Modal>

      {/* XOSC Preview modal */}
      <Modal
        title={`${previewTitle}.xosc`}
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width="80%"
        styles={{ body: { maxHeight: "70vh", overflow: "auto", padding: 0 } }}
      >
        {previewLoading ? (
          <div style={{ textAlign: "center", padding: 48 }}><Spin size="large" /></div>
        ) : (
          <pre style={{
            margin: 0,
            padding: 16,
            fontSize: 12,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
            background: "var(--ant-color-bg-layout, #f5f5f5)",
            borderRadius: 4,
          }}>
            {previewContent}
          </pre>
        )}
      </Modal>
    </>
  );
}
