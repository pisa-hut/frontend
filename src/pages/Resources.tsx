import { useEffect, useState, useCallback } from "react";
import {
  Tabs,
  Button,
  Modal,
  Form,
  Input,
  Switch,
  message,
  Typography,
  Space,
  Popconfirm,
} from "antd";
import { PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import ResizableTable from "../components/ResizableTable";
import { getColumnSearchProps } from "../components/ColumnSearch";
import { api } from "../api/client";
import type {
  AvResponse,
  SimulatorResponse,
  SamplerResponse,
  MapResponse,
} from "../api/types";

function useResourceTab<T extends { id: number }>(listFn: () => Promise<T[]>) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const load = useCallback(() => {
    setLoading(true);
    listFn().then(setData).finally(() => setLoading(false));
  }, [listFn]);
  useEffect(load, [load]);
  return { data, loading, modalOpen, setModalOpen, editing, setEditing, load };
}

// --- AVs ---

function AvsTab() {
  const { data, loading, modalOpen, setModalOpen, editing, setEditing, load } =
    useResourceTab(api.listAvs);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (r: AvResponse) => {
    setEditing(r);
    form.setFieldsValue({ ...r, image_path: JSON.stringify(r.image_path, null, 2) });
    setModalOpen(true);
  };

  const handleSave = async (values: { name: string; image_path: string; config_path: string; nv_runtime: boolean; carla_runtime: boolean; ros_runtime: boolean }) => {
    setSaving(true);
    try {
      const payload = { ...values, image_path: JSON.parse(values.image_path) };
      if (editing) { await api.updateAv(editing.id, payload); message.success("AV updated"); }
      else { await api.createAv(payload); message.success("AV created"); }
      setModalOpen(false); form.resetFields(); setEditing(null); load();
    } catch (e) { message.error(String(e)); } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try { await api.deleteAv(id); message.success("AV deleted"); load(); } catch (e) { message.error(String(e)); }
  };

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 50 },
    { title: "Name", dataIndex: "name", key: "name", width: 120, ellipsis: true, ...getColumnSearchProps<{ name: string }>("name") },
    { title: "Image Path", dataIndex: "image_path", key: "image_path", width: 200, ellipsis: true, render: (v: Record<string, unknown>) => JSON.stringify(v) },
    { title: "Config Path", dataIndex: "config_path", key: "config_path", width: 180, ellipsis: true },
    { title: "NV", dataIndex: "nv_runtime", key: "nv_runtime", width: 50, render: (v: boolean) => v ? "Yes" : "No" },
    { title: "CARLA", dataIndex: "carla_runtime", key: "carla_runtime", width: 60, render: (v: boolean) => v ? "Yes" : "No" },
    { title: "ROS", dataIndex: "ros_runtime", key: "ros_runtime", width: 50, render: (v: boolean) => v ? "Yes" : "No" },
    { title: "Actions", key: "actions", width: 90, render: (_: unknown, r: AvResponse) => (
      <Space>
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        <Popconfirm title="Delete?" onConfirm={() => handleDelete(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
      </Space>
    )},
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add AV</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </Space>
      <ResizableTable<AvResponse> dataSource={data} columns={columns} rowKey="id" loading={loading} />
      <Modal title={editing ? "Edit AV" : "Add AV"} open={modalOpen} onCancel={() => { setModalOpen(false); setEditing(null); }} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ nv_runtime: false, carla_runtime: false, ros_runtime: false }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="image_path" label="Image Path (JSON)" rules={[{ required: true }, { validator: (_, v) => { try { JSON.parse(v); return Promise.resolve(); } catch { return Promise.reject("Invalid JSON"); } } }]}>
            <Input.TextArea rows={2} placeholder='{"docker": "ghcr.io/..."}' />
          </Form.Item>
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
  const { data, loading, modalOpen, setModalOpen, editing, setEditing, load } =
    useResourceTab(api.listSimulators);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (r: SimulatorResponse) => {
    setEditing(r);
    form.setFieldsValue({ ...r, image_path: JSON.stringify(r.image_path, null, 2) });
    setModalOpen(true);
  };

  const handleSave = async (values: { name: string; image_path: string; config_path: string; nv_runtime: boolean; carla_runtime: boolean; ros_runtime: boolean }) => {
    setSaving(true);
    try {
      const payload = { ...values, image_path: JSON.parse(values.image_path) };
      if (editing) { await api.updateSimulator(editing.id, payload); message.success("Simulator updated"); }
      else { await api.createSimulator(payload); message.success("Simulator created"); }
      setModalOpen(false); form.resetFields(); setEditing(null); load();
    } catch (e) { message.error(String(e)); } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try { await api.deleteSimulator(id); message.success("Simulator deleted"); load(); } catch (e) { message.error(String(e)); }
  };

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 50 },
    { title: "Name", dataIndex: "name", key: "name", width: 120, ellipsis: true, ...getColumnSearchProps<{ name: string }>("name") },
    { title: "Image Path", dataIndex: "image_path", key: "image_path", width: 200, ellipsis: true, render: (v: Record<string, unknown>) => JSON.stringify(v) },
    { title: "Config Path", dataIndex: "config_path", key: "config_path", width: 180, ellipsis: true },
    { title: "NV", dataIndex: "nv_runtime", key: "nv_runtime", width: 50, render: (v: boolean) => v ? "Yes" : "No" },
    { title: "CARLA", dataIndex: "carla_runtime", key: "carla_runtime", width: 60, render: (v: boolean) => v ? "Yes" : "No" },
    { title: "ROS", dataIndex: "ros_runtime", key: "ros_runtime", width: 50, render: (v: boolean) => v ? "Yes" : "No" },
    { title: "Actions", key: "actions", width: 90, render: (_: unknown, r: SimulatorResponse) => (
      <Space>
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        <Popconfirm title="Delete?" onConfirm={() => handleDelete(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
      </Space>
    )},
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Simulator</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </Space>
      <ResizableTable<SimulatorResponse> dataSource={data} columns={columns} rowKey="id" loading={loading} />
      <Modal title={editing ? "Edit Simulator" : "Add Simulator"} open={modalOpen} onCancel={() => { setModalOpen(false); setEditing(null); }} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ nv_runtime: false, carla_runtime: false, ros_runtime: false }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="image_path" label="Image Path (JSON)" rules={[{ required: true }, { validator: (_, v) => { try { JSON.parse(v); return Promise.resolve(); } catch { return Promise.reject("Invalid JSON"); } } }]}>
            <Input.TextArea rows={2} placeholder='{"docker": "ghcr.io/..."}' />
          </Form.Item>
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
  const { data, loading, modalOpen, setModalOpen, editing, setEditing, load } =
    useResourceTab(api.listSamplers);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (r: SamplerResponse) => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); };

  const handleSave = async (values: { name: string; module_path: string; config_path?: string }) => {
    setSaving(true);
    try {
      if (editing) { await api.updateSampler(editing.id, values); message.success("Sampler updated"); }
      else { await api.createSampler(values); message.success("Sampler created"); }
      setModalOpen(false); form.resetFields(); setEditing(null); load();
    } catch (e) { message.error(String(e)); } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try { await api.deleteSampler(id); message.success("Sampler deleted"); load(); } catch (e) { message.error(String(e)); }
  };

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 50 },
    { title: "Name", dataIndex: "name", key: "name", width: 120, ellipsis: true, ...getColumnSearchProps<{ name: string }>("name") },
    { title: "Module Path", dataIndex: "module_path", key: "module_path", width: 300, ellipsis: true },
    { title: "Config Path", dataIndex: "config_path", key: "config_path", width: 200, render: (v: string | null) => v ?? "-" },
    { title: "Actions", key: "actions", width: 90, render: (_: unknown, r: SamplerResponse) => (
      <Space>
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        <Popconfirm title="Delete?" onConfirm={() => handleDelete(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
      </Space>
    )},
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Sampler</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </Space>
      <ResizableTable<SamplerResponse> dataSource={data} columns={columns} rowKey="id" loading={loading} />
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
  const { data, loading, modalOpen, setModalOpen, editing, setEditing, load } =
    useResourceTab(api.listMaps);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (r: MapResponse) => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); };

  const handleSave = async (values: { name: string; xodr_path?: string; osm_path?: string }) => {
    setSaving(true);
    try {
      if (editing) { await api.updateMap(editing.id, values); message.success("Map updated"); }
      else { await api.createMap(values); message.success("Map created"); }
      setModalOpen(false); form.resetFields(); setEditing(null); load();
    } catch (e) { message.error(String(e)); } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try { await api.deleteMap(id); message.success("Map deleted"); load(); } catch (e) { message.error(String(e)); }
  };

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 50 },
    { title: "Name", dataIndex: "name", key: "name", width: 150, ellipsis: true, ...getColumnSearchProps<{ name: string }>("name") },
    { title: "XODR Path", dataIndex: "xodr_path", key: "xodr_path", width: 200, ellipsis: true, render: (v: string | null) => v ?? "-" },
    { title: "OSM Path", dataIndex: "osm_path", key: "osm_path", width: 200, ellipsis: true, render: (v: string | null) => v ?? "-" },
    { title: "Actions", key: "actions", width: 90, render: (_: unknown, r: MapResponse) => (
      <Space>
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        <Popconfirm title="Delete?" onConfirm={() => handleDelete(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
      </Space>
    )},
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Map</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </Space>
      <ResizableTable<MapResponse> dataSource={data} columns={columns} rowKey="id" loading={loading} />
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
      <Typography.Title level={3} style={{ marginBottom: 12 }}>Resources</Typography.Title>
      <Tabs
        items={[
          { key: "avs", label: "AVs", children: <AvsTab /> },
          { key: "simulators", label: "Simulators", children: <SimulatorsTab /> },
          { key: "samplers", label: "Samplers", children: <SamplersTab /> },
          { key: "maps", label: "Maps", children: <MapsTab /> },
        ]}
      />
    </>
  );
}
