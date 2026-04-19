import { useEffect, useState, useMemo, useCallback } from "react";
import { Button, Modal, Form, Input, Select, message, Typography, Space, Popconfirm } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { api } from "../api/client";
import type { ScenarioResponse, ScenarioFormat } from "../api/types";

ModuleRegistry.registerModules([AllCommunityModule]);

const formatOptions: { label: string; value: ScenarioFormat }[] = [
  { label: "OpenSCENARIO 1.x", value: "open_scenario1" },
  { label: "OpenSCENARIO 2.x", value: "open_scenario2" },
  { label: "CARLA Leaderboard Route", value: "carla_lb_route" },
];

export default function Scenarios() {
  const [data, setData] = useState<ScenarioResponse[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ScenarioResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(() => { api.listScenarios().then(setData); }, []);
  useEffect(load, [load]);

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (r: ScenarioResponse) => {
    setEditing(r);
    form.setFieldsValue({ ...r, goal_config: JSON.stringify(r.goal_config, null, 2) });
    setModalOpen(true);
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

  const ActionsRenderer = useCallback((params: ICellRendererParams<ScenarioResponse>) => {
    const r = params.data!;
    return (
      <Space>
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        <Popconfirm title="Delete?" onConfirm={() => handleDelete(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
      </Space>
    );
  }, []);

  const columnDefs = useMemo<ColDef<ScenarioResponse>[]>(() => [
    { field: "id", width: 70, filter: "agNumberColumnFilter" },
    { field: "title", flex: 2, filter: "agTextColumnFilter" },
    { field: "scenario_format", headerName: "Format", width: 140, filter: "agSetColumnFilter" },
    { field: "scenario_path", headerName: "Path", flex: 1, filter: "agTextColumnFilter" },
    { field: "goal_config", headerName: "Goal Config", flex: 1, valueFormatter: (p) => JSON.stringify(p.value) },
    { headerName: "Actions", width: 100, sortable: false, filter: false, cellRenderer: ActionsRenderer },
  ], [ActionsRenderer]);

  return (
    <>
      <Typography.Title level={3}>Scenarios</Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Create Scenario</Button>
      </Space>
      <div className="ag-theme-alpine" style={{ width: "100%", height: "calc(100vh - 200px)" }}>
        <AgGridReact<ScenarioResponse>
          rowData={data} columnDefs={columnDefs}
          defaultColDef={{ sortable: true, resizable: true, filter: true }}
          getRowId={(p) => String(p.data.id)} pagination paginationPageSize={50}
        />
      </div>
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
    </>
  );
}
