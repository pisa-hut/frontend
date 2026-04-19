import { useEffect, useState, useMemo, useCallback } from "react";
import { Button, Modal, Form, Select, Input, message, Typography, Space, Popconfirm } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { api } from "../api/client";
import type { PlanResponse, MapResponse, ScenarioResponse } from "../api/types";

ModuleRegistry.registerModules([AllCommunityModule]);

export default function Plans() {
  const [data, setData] = useState<PlanResponse[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlanResponse | null>(null);
  const [maps, setMaps] = useState<MapResponse[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioResponse[]>([]);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(() => { api.listPlans().then(setData); }, []);
  useEffect(load, [load]);

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

  const ActionsRenderer = useCallback((params: ICellRendererParams<PlanResponse>) => {
    const r = params.data!;
    return (
      <Space>
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        <Popconfirm title="Delete?" onConfirm={() => handleDelete(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
      </Space>
    );
  }, []);

  const columnDefs = useMemo<ColDef<PlanResponse>[]>(() => [
    { field: "id", width: 70, filter: "agNumberColumnFilter" },
    { field: "name", flex: 2, filter: "agTextColumnFilter" },
    { field: "map_id", headerName: "Map ID", width: 90, filter: "agNumberColumnFilter" },
    { field: "scenario_id", headerName: "Scenario ID", width: 110, filter: "agNumberColumnFilter" },
    { headerName: "Actions", width: 100, sortable: false, filter: false, cellRenderer: ActionsRenderer },
  ], [ActionsRenderer]);

  return (
    <>
      <Typography.Title level={3}>Plans</Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Create Plan</Button>
      </Space>
      <div style={{ width: "100%", height: "calc(100vh - 200px)" }}>
        <AgGridReact<PlanResponse>
          rowData={data} columnDefs={columnDefs}
          defaultColDef={{ sortable: true, resizable: true, filter: true }}
          getRowId={(p) => String(p.data.id)} pagination paginationPageSize={50} theme="legacy"
        />
      </div>
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
