import { useEffect, useState, useCallback, useMemo } from "react";
import { Tabs, Button, Modal, Form, Input, Switch, message, Typography, Space, Popconfirm } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { api } from "../api/client";
import type { AvResponse, SimulatorResponse, SamplerResponse, MapResponse } from "../api/types";

ModuleRegistry.registerModules([AllCommunityModule]);

const boolFormatter = (p: { value: boolean }) => p.value ? "Yes" : "No";

function useResourceTab<T extends { id: number }>(listFn: () => Promise<T[]>) {
  const [data, setData] = useState<T[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const load = useCallback(() => { listFn().then(setData); }, [listFn]);
  useEffect(load, [load]);
  return { data, modalOpen, setModalOpen, editing, setEditing, load };
}

// --- AVs ---
function AvsTab() {
  const { data, modalOpen, setModalOpen, editing, setEditing, load } = useResourceTab(api.listAvs);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (r: AvResponse) => { setEditing(r); form.setFieldsValue({ ...r, image_path: JSON.stringify(r.image_path, null, 2) }); setModalOpen(true); };
  const handleSave = async (values: { name: string; image_path: string; config_path: string; nv_runtime: boolean; carla_runtime: boolean; ros_runtime: boolean }) => {
    setSaving(true);
    try {
      const payload = { ...values, image_path: JSON.parse(values.image_path) };
      if (editing) { await api.updateAv(editing.id, payload); message.success("Updated"); } else { await api.createAv(payload); message.success("Created"); }
      setModalOpen(false); form.resetFields(); setEditing(null); load();
    } catch (e) { message.error(String(e)); } finally { setSaving(false); }
  };
  const handleDelete = async (id: number) => { try { await api.deleteAv(id); message.success("Deleted"); load(); } catch (e) { message.error(String(e)); } };

  const ActionsRenderer = useCallback((params: ICellRendererParams<AvResponse>) => {
    const r = params.data!;
    return <Space><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /><Popconfirm title="Delete?" onConfirm={() => handleDelete(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space>;
  }, []);

  const cols = useMemo<ColDef<AvResponse>[]>(() => [
    { field: "id", width: 60 }, { field: "name", width: 120, filter: "agTextColumnFilter" },
    { field: "image_path", flex: 1, valueFormatter: (p) => JSON.stringify(p.value) },
    { field: "config_path", flex: 1 },
    { field: "nv_runtime", headerName: "NV", width: 60, valueFormatter: boolFormatter },
    { field: "carla_runtime", headerName: "CARLA", width: 70, valueFormatter: boolFormatter },
    { field: "ros_runtime", headerName: "ROS", width: 60, valueFormatter: boolFormatter },
    { headerName: "Actions", width: 100, sortable: false, filter: false, cellRenderer: ActionsRenderer },
  ], [ActionsRenderer]);

  return (
    <>
      <Space style={{ marginBottom: 16 }}><Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add AV</Button></Space>
      <div className="ag-theme-alpine" style={{ height: "calc(100vh - 280px)" }}><AgGridReact<AvResponse> rowData={data} columnDefs={cols} defaultColDef={{ sortable: true, resizable: true, filter: true }} getRowId={(p) => String(p.data.id)} pagination paginationPageSize={20} /></div>
      <Modal title={editing ? "Edit AV" : "Add AV"} open={modalOpen} onCancel={() => { setModalOpen(false); setEditing(null); }} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ nv_runtime: false, carla_runtime: false, ros_runtime: false }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="image_path" label="Image Path (JSON)" rules={[{ required: true }, { validator: (_, v) => { try { JSON.parse(v); return Promise.resolve(); } catch { return Promise.reject("Invalid JSON"); } } }]}><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="config_path" label="Config Path" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="nv_runtime" label="NV Runtime" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="carla_runtime" label="CARLA Runtime" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="ros_runtime" label="ROS Runtime" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={saving} block>{editing ? "Save" : "Create"}</Button></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// --- Simulators ---
function SimulatorsTab() {
  const { data, modalOpen, setModalOpen, editing, setEditing, load } = useResourceTab(api.listSimulators);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (r: SimulatorResponse) => { setEditing(r); form.setFieldsValue({ ...r, image_path: JSON.stringify(r.image_path, null, 2) }); setModalOpen(true); };
  const handleSave = async (values: { name: string; image_path: string; config_path: string; nv_runtime: boolean; carla_runtime: boolean; ros_runtime: boolean }) => {
    setSaving(true);
    try {
      const payload = { ...values, image_path: JSON.parse(values.image_path) };
      if (editing) { await api.updateSimulator(editing.id, payload); message.success("Updated"); } else { await api.createSimulator(payload); message.success("Created"); }
      setModalOpen(false); form.resetFields(); setEditing(null); load();
    } catch (e) { message.error(String(e)); } finally { setSaving(false); }
  };
  const handleDelete = async (id: number) => { try { await api.deleteSimulator(id); message.success("Deleted"); load(); } catch (e) { message.error(String(e)); } };

  const ActionsRenderer = useCallback((params: ICellRendererParams<SimulatorResponse>) => {
    const r = params.data!;
    return <Space><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /><Popconfirm title="Delete?" onConfirm={() => handleDelete(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space>;
  }, []);

  const cols = useMemo<ColDef<SimulatorResponse>[]>(() => [
    { field: "id", width: 60 }, { field: "name", width: 120, filter: "agTextColumnFilter" },
    { field: "image_path", flex: 1, valueFormatter: (p) => JSON.stringify(p.value) },
    { field: "config_path", flex: 1 },
    { field: "nv_runtime", headerName: "NV", width: 60, valueFormatter: boolFormatter },
    { field: "carla_runtime", headerName: "CARLA", width: 70, valueFormatter: boolFormatter },
    { field: "ros_runtime", headerName: "ROS", width: 60, valueFormatter: boolFormatter },
    { headerName: "Actions", width: 100, sortable: false, filter: false, cellRenderer: ActionsRenderer },
  ], [ActionsRenderer]);

  return (
    <>
      <Space style={{ marginBottom: 16 }}><Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Simulator</Button></Space>
      <div className="ag-theme-alpine" style={{ height: "calc(100vh - 280px)" }}><AgGridReact<SimulatorResponse> rowData={data} columnDefs={cols} defaultColDef={{ sortable: true, resizable: true, filter: true }} getRowId={(p) => String(p.data.id)} pagination paginationPageSize={20} /></div>
      <Modal title={editing ? "Edit Simulator" : "Add Simulator"} open={modalOpen} onCancel={() => { setModalOpen(false); setEditing(null); }} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ nv_runtime: false, carla_runtime: false, ros_runtime: false }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="image_path" label="Image Path (JSON)" rules={[{ required: true }, { validator: (_, v) => { try { JSON.parse(v); return Promise.resolve(); } catch { return Promise.reject("Invalid JSON"); } } }]}><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="config_path" label="Config Path" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="nv_runtime" label="NV Runtime" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="carla_runtime" label="CARLA Runtime" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="ros_runtime" label="ROS Runtime" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={saving} block>{editing ? "Save" : "Create"}</Button></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// --- Samplers ---
function SamplersTab() {
  const { data, modalOpen, setModalOpen, editing, setEditing, load } = useResourceTab(api.listSamplers);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (r: SamplerResponse) => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); };
  const handleSave = async (values: { name: string; module_path: string; config_path?: string }) => {
    setSaving(true);
    try {
      if (editing) { await api.updateSampler(editing.id, values); message.success("Updated"); } else { await api.createSampler(values); message.success("Created"); }
      setModalOpen(false); form.resetFields(); setEditing(null); load();
    } catch (e) { message.error(String(e)); } finally { setSaving(false); }
  };
  const handleDelete = async (id: number) => { try { await api.deleteSampler(id); message.success("Deleted"); load(); } catch (e) { message.error(String(e)); } };

  const ActionsRenderer = useCallback((params: ICellRendererParams<SamplerResponse>) => {
    const r = params.data!;
    return <Space><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /><Popconfirm title="Delete?" onConfirm={() => handleDelete(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space>;
  }, []);

  const cols = useMemo<ColDef<SamplerResponse>[]>(() => [
    { field: "id", width: 60 }, { field: "name", width: 120, filter: "agTextColumnFilter" },
    { field: "module_path", flex: 2, filter: "agTextColumnFilter" },
    { field: "config_path", flex: 1, valueFormatter: (p) => p.value ?? "-" },
    { headerName: "Actions", width: 100, sortable: false, filter: false, cellRenderer: ActionsRenderer },
  ], [ActionsRenderer]);

  return (
    <>
      <Space style={{ marginBottom: 16 }}><Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Sampler</Button></Space>
      <div className="ag-theme-alpine" style={{ height: "calc(100vh - 280px)" }}><AgGridReact<SamplerResponse> rowData={data} columnDefs={cols} defaultColDef={{ sortable: true, resizable: true, filter: true }} getRowId={(p) => String(p.data.id)} pagination paginationPageSize={20} /></div>
      <Modal title={editing ? "Edit Sampler" : "Add Sampler"} open={modalOpen} onCancel={() => { setModalOpen(false); setEditing(null); }} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="module_path" label="Module Path" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="config_path" label="Config Path"><Input /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={saving} block>{editing ? "Save" : "Create"}</Button></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// --- Maps ---
function MapsTab() {
  const { data, modalOpen, setModalOpen, editing, setEditing, load } = useResourceTab(api.listMaps);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (r: MapResponse) => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); };
  const handleSave = async (values: { name: string; xodr_path?: string; osm_path?: string }) => {
    setSaving(true);
    try {
      if (editing) { await api.updateMap(editing.id, values); message.success("Updated"); } else { await api.createMap(values); message.success("Created"); }
      setModalOpen(false); form.resetFields(); setEditing(null); load();
    } catch (e) { message.error(String(e)); } finally { setSaving(false); }
  };
  const handleDelete = async (id: number) => { try { await api.deleteMap(id); message.success("Deleted"); load(); } catch (e) { message.error(String(e)); } };

  const ActionsRenderer = useCallback((params: ICellRendererParams<MapResponse>) => {
    const r = params.data!;
    return <Space><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /><Popconfirm title="Delete?" onConfirm={() => handleDelete(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space>;
  }, []);

  const cols = useMemo<ColDef<MapResponse>[]>(() => [
    { field: "id", width: 60 }, { field: "name", width: 150, filter: "agTextColumnFilter" },
    { field: "xodr_path", headerName: "XODR Path", flex: 1, valueFormatter: (p) => p.value ?? "-" },
    { field: "osm_path", headerName: "OSM Path", flex: 1, valueFormatter: (p) => p.value ?? "-" },
    { headerName: "Actions", width: 100, sortable: false, filter: false, cellRenderer: ActionsRenderer },
  ], [ActionsRenderer]);

  return (
    <>
      <Space style={{ marginBottom: 16 }}><Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Map</Button></Space>
      <div className="ag-theme-alpine" style={{ height: "calc(100vh - 280px)" }}><AgGridReact<MapResponse> rowData={data} columnDefs={cols} defaultColDef={{ sortable: true, resizable: true, filter: true }} getRowId={(p) => String(p.data.id)} pagination paginationPageSize={20} /></div>
      <Modal title={editing ? "Edit Map" : "Add Map"} open={modalOpen} onCancel={() => { setModalOpen(false); setEditing(null); }} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="xodr_path" label="XODR Path"><Input /></Form.Item>
          <Form.Item name="osm_path" label="OSM Path"><Input /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={saving} block>{editing ? "Save" : "Create"}</Button></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export default function Resources() {
  return (
    <>
      <Typography.Title level={3}>Resources</Typography.Title>
      <Tabs items={[
        { key: "avs", label: "AVs", children: <AvsTab /> },
        { key: "simulators", label: "Simulators", children: <SimulatorsTab /> },
        { key: "samplers", label: "Samplers", children: <SamplersTab /> },
        { key: "maps", label: "Maps", children: <MapsTab /> },
      ]} />
    </>
  );
}
