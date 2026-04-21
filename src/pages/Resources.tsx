import { useEffect, useState, useCallback } from "react";
import { Tabs, Button, Modal, Form, Input, Switch, message, Space, Table, Dropdown } from "antd";
import { PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, MoreOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { getColumnSearchProps } from "../components/ColumnSearch";
import ConfigUpload from "../components/ConfigUpload";
import MapFilesModal from "../components/MapFilesModal";
import PageHeader from "../components/PageHeader";
import { api } from "../api/client";
import type { AvResponse, SimulatorResponse, SamplerResponse, MapResponse } from "../api/types";

// --- Generic resource hook ---

function useResource<T extends { id: number }>(listFn: () => Promise<T[]>) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const load = useCallback(() => { setLoading(true); listFn().then(setData).finally(() => setLoading(false)); }, [listFn]);
  useEffect(load, [load]);
  return { data, loading, modalOpen, setModalOpen, editing, setEditing, load };
}

// --- Shared columns for AV/Simulator (image + runtimes). Config upload is a
//     row-level action rendered by each tab so it can call `load()` on change.

const imageColumns = [
  { title: "Image", dataIndex: "image_path", key: "image_path", width: 200, ellipsis: true, render: (v: Record<string, unknown>) => JSON.stringify(v) },
  { title: "NV", dataIndex: "nv_runtime", key: "nv_runtime", width: 50, render: (v: boolean) => v ? "Y" : "" },
  { title: "CARLA", dataIndex: "carla_runtime", key: "carla_runtime", width: 55, render: (v: boolean) => v ? "Y" : "" },
  { title: "ROS", dataIndex: "ros_runtime", key: "ros_runtime", width: 50, render: (v: boolean) => v ? "Y" : "" },
];

function ImageForm({ saving, onFinish, form, editing }: { saving: boolean; onFinish: (v: any) => void; form: any; editing: boolean }) {
  return (
    <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ nv_runtime: false, carla_runtime: false, ros_runtime: false }}>
      <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="image_path" label="Image Path (JSON)" rules={[{ required: true },
        { validator: (_, v) => { try { JSON.parse(v); return Promise.resolve(); } catch { return Promise.reject("Invalid JSON"); } } }]}>
        <Input.TextArea rows={2} placeholder='{"docker": "ghcr.io/..."}' style={{ fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace", fontSize: 12 }} />
      </Form.Item>
      <Form.Item name="nv_runtime" label="NV Runtime" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item name="carla_runtime" label="CARLA Runtime" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item name="ros_runtime" label="ROS Runtime" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" loading={saving} block>{editing ? "Save" : "Create"}</Button>
      </Form.Item>
    </Form>
  );
}

// --- AVs ---

function AvsTab() {
  const { data, loading, modalOpen, setModalOpen, editing, setEditing, load } = useResource(api.listAvs);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (r: AvResponse) => { setEditing(r); form.setFieldsValue({ ...r, image_path: JSON.stringify(r.image_path, null, 2) }); setModalOpen(true); };

  const handleSave = async (values: any) => {
    setSaving(true);
    try {
      const payload = { ...values, image_path: JSON.parse(values.image_path) };
      if (editing) { await api.updateAv(editing.id, payload); message.success("Updated"); }
      else { await api.createAv(payload); message.success("Created"); }
      setModalOpen(false); form.resetFields(); setEditing(null); load();
    } catch (e) { message.error(String(e)); } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => { try { await api.deleteAv(id); message.success("Deleted"); load(); } catch (e) { message.error(String(e)); } };

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 50 },
    { title: "Name", dataIndex: "name", key: "name", width: 120, ...getColumnSearchProps("name") },
    ...imageColumns,
    { title: "Config", key: "config", width: 240, render: (_: unknown, r: AvResponse) => (
      <ConfigUpload entity="av" id={r.id} hasConfig={!!r.config_sha256} onChange={load} />
    )},
    { title: "", key: "actions", width: 50, render: (_: unknown, r: AvResponse) => (
      <Dropdown menu={{ items: [
        { key: "edit", icon: <EditOutlined />, label: "Edit", onClick: () => openEdit(r) },
        { type: "divider" as const },
        { key: "delete", icon: <DeleteOutlined />, label: "Delete", danger: true, onClick: () => handleDelete(r.id) },
      ]}} trigger={["click"]}>
        <Button size="small" icon={<MoreOutlined />} />
      </Dropdown>
    )},
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add AV</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </Space>
      <Table dataSource={data} columns={columns} rowKey="id" loading={loading} size="small" scroll={{ x: "max-content" }} />
      <Modal title={editing ? "Edit AV" : "Add AV"} open={modalOpen} onCancel={() => { setModalOpen(false); setEditing(null); }} footer={null}>
        <ImageForm form={form} saving={saving} onFinish={handleSave} editing={!!editing} />
      </Modal>
    </>
  );
}

// --- Simulators (same structure as AVs) ---

function SimulatorsTab() {
  const { data, loading, modalOpen, setModalOpen, editing, setEditing, load } = useResource(api.listSimulators);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (r: SimulatorResponse) => { setEditing(r); form.setFieldsValue({ ...r, image_path: JSON.stringify(r.image_path, null, 2) }); setModalOpen(true); };

  const handleSave = async (values: any) => {
    setSaving(true);
    try {
      const payload = { ...values, image_path: JSON.parse(values.image_path) };
      if (editing) { await api.updateSimulator(editing.id, payload); message.success("Updated"); }
      else { await api.createSimulator(payload); message.success("Created"); }
      setModalOpen(false); form.resetFields(); setEditing(null); load();
    } catch (e) { message.error(String(e)); } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => { try { await api.deleteSimulator(id); message.success("Deleted"); load(); } catch (e) { message.error(String(e)); } };

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 50 },
    { title: "Name", dataIndex: "name", key: "name", width: 120, ...getColumnSearchProps("name") },
    ...imageColumns,
    { title: "Config", key: "config", width: 240, render: (_: unknown, r: SimulatorResponse) => (
      <ConfigUpload entity="simulator" id={r.id} hasConfig={!!r.config_sha256} onChange={load} />
    )},
    { title: "", key: "actions", width: 50, render: (_: unknown, r: SimulatorResponse) => (
      <Dropdown menu={{ items: [
        { key: "edit", icon: <EditOutlined />, label: "Edit", onClick: () => openEdit(r) },
        { type: "divider" as const },
        { key: "delete", icon: <DeleteOutlined />, label: "Delete", danger: true, onClick: () => handleDelete(r.id) },
      ]}} trigger={["click"]}>
        <Button size="small" icon={<MoreOutlined />} />
      </Dropdown>
    )},
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Simulator</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </Space>
      <Table dataSource={data} columns={columns} rowKey="id" loading={loading} size="small" scroll={{ x: "max-content" }} />
      <Modal title={editing ? "Edit Simulator" : "Add Simulator"} open={modalOpen} onCancel={() => { setModalOpen(false); setEditing(null); }} footer={null}>
        <ImageForm form={form} saving={saving} onFinish={handleSave} editing={!!editing} />
      </Modal>
    </>
  );
}

// --- Samplers ---

function SamplersTab() {
  const { data, loading, modalOpen, setModalOpen, editing, setEditing, load } = useResource(api.listSamplers);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (r: SamplerResponse) => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); };

  const handleSave = async (values: { name: string; module_path: string; config_path?: string }) => {
    setSaving(true);
    try {
      if (editing) { await api.updateSampler(editing.id, values); message.success("Updated"); }
      else { await api.createSampler(values); message.success("Created"); }
      setModalOpen(false); form.resetFields(); setEditing(null); load();
    } catch (e) { message.error(String(e)); } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => { try { await api.deleteSampler(id); message.success("Deleted"); load(); } catch (e) { message.error(String(e)); } };

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 50 },
    { title: "Name", dataIndex: "name", key: "name", width: 120, ...getColumnSearchProps("name") },
    { title: "Module", dataIndex: "module_path", key: "module_path", ellipsis: true },
    { title: "Config", key: "config", width: 240, render: (_: unknown, r: SamplerResponse) => (
      <ConfigUpload entity="sampler" id={r.id} hasConfig={!!r.config_sha256} onChange={load} />
    )},
    { title: "", key: "actions", width: 50, render: (_: unknown, r: SamplerResponse) => (
      <Dropdown menu={{ items: [
        { key: "edit", icon: <EditOutlined />, label: "Edit", onClick: () => openEdit(r) },
        { type: "divider" as const },
        { key: "delete", icon: <DeleteOutlined />, label: "Delete", danger: true, onClick: () => handleDelete(r.id) },
      ]}} trigger={["click"]}>
        <Button size="small" icon={<MoreOutlined />} />
      </Dropdown>
    )},
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Sampler</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </Space>
      <Table dataSource={data} columns={columns} rowKey="id" loading={loading} size="small" scroll={{ x: "max-content" }} />
      <Modal title={editing ? "Edit Sampler" : "Add Sampler"} open={modalOpen} onCancel={() => { setModalOpen(false); setEditing(null); }} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="module_path" label="Module Path" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={saving} block>{editing ? "Save" : "Create"}</Button></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// --- Maps ---

function MapsTab() {
  const { data, loading, modalOpen, setModalOpen, editing, setEditing, load } = useResource(api.listMaps);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [filesFor, setFilesFor] = useState<MapResponse | null>(null);

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (r: MapResponse) => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); };

  const handleSave = async (values: { name: string }) => {
    setSaving(true);
    try {
      if (editing) { await api.updateMap(editing.id, values); message.success("Updated"); }
      else { await api.createMap(values); message.success("Created"); }
      setModalOpen(false); form.resetFields(); setEditing(null); load();
    } catch (e) { message.error(String(e)); } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => { try { await api.deleteMap(id); message.success("Deleted"); load(); } catch (e) { message.error(String(e)); } };

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 50 },
    { title: "Name", dataIndex: "name", key: "name", ...getColumnSearchProps("name") },
    { title: "Files", key: "files", width: 120, render: (_: unknown, r: MapResponse) => (
      <Button size="small" icon={<FolderOpenOutlined />} onClick={() => setFilesFor(r)}>Open</Button>
    )},
    { title: "", key: "actions", width: 50, render: (_: unknown, r: MapResponse) => (
      <Dropdown menu={{ items: [
        { key: "edit", icon: <EditOutlined />, label: "Edit", onClick: () => openEdit(r) },
        { type: "divider" as const },
        { key: "delete", icon: <DeleteOutlined />, label: "Delete", danger: true, onClick: () => handleDelete(r.id) },
      ]}} trigger={["click"]}>
        <Button size="small" icon={<MoreOutlined />} />
      </Dropdown>
    )},
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Map</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </Space>
      <Table dataSource={data} columns={columns} rowKey="id" loading={loading} size="small" scroll={{ x: "max-content" }} />
      <Modal title={editing ? "Edit Map" : "Add Map"} open={modalOpen} onCancel={() => { setModalOpen(false); setEditing(null); }} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={saving} block>{editing ? "Save" : "Create"}</Button></Form.Item>
        </Form>
      </Modal>
      <MapFilesModal
        mapId={filesFor?.id ?? null}
        mapName={filesFor?.name}
        onClose={() => setFilesFor(null)}
      />
    </>
  );
}

export default function Resources() {
  return (
    <>
      <PageHeader title="Resources" />
      <Tabs items={[
        { key: "avs", label: "AVs", children: <AvsTab /> },
        { key: "simulators", label: "Simulators", children: <SimulatorsTab /> },
        { key: "samplers", label: "Samplers", children: <SamplersTab /> },
        { key: "maps", label: "Maps", children: <MapsTab /> },
      ]} />
    </>
  );
}
