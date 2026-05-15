import { useState } from "react";
import { Tabs, Button, Modal, Form, Input, Switch, Space, Table, Dropdown } from "antd";
import {
  PlusOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  MoreOutlined,
  FolderOpenOutlined,
} from "@ant-design/icons";
import type { FormInstance } from "antd";
import { getColumnSearchProps } from "../components/ColumnSearch";
import ConfigUpload from "../components/ConfigUpload";
import FileBrowser from "../components/FileBrowser";
import PageHeader from "../components/PageHeader";
import { api } from "../api/client";
import type {
  AvResponse,
  SimulatorResponse,
  SamplerResponse,
  MonitorResponse,
  MapResponse,
} from "../api/types";
import { useResourceTab } from "../hooks/useResourceTab";

// --- Shared columns for AV/Simulator (image + runtimes). Config upload is a
//     row-level action rendered by each tab so it can call `load()` on change.

const imageColumns = [
  {
    title: "Image",
    dataIndex: "image_path",
    key: "image_path",
    width: 200,
    ellipsis: true,
    render: (v: Record<string, unknown>) => JSON.stringify(v),
  },
  {
    title: "NV",
    dataIndex: "nv_runtime",
    key: "nv_runtime",
    width: 50,
    render: (v: boolean) => (v ? "Y" : ""),
  },
  {
    title: "CARLA",
    dataIndex: "carla_runtime",
    key: "carla_runtime",
    width: 55,
    render: (v: boolean) => (v ? "Y" : ""),
  },
  {
    title: "ROS",
    dataIndex: "ros_runtime",
    key: "ros_runtime",
    width: 50,
    render: (v: boolean) => (v ? "Y" : ""),
  },
];

interface ImageFormValues {
  name: string;
  image_path: string;
  nv_runtime: boolean;
  carla_runtime: boolean;
  ros_runtime: boolean;
}

interface ImagePayload {
  name: string;
  image_path: Record<string, unknown>;
  nv_runtime: boolean;
  carla_runtime: boolean;
  ros_runtime: boolean;
}

function ImageForm({
  saving,
  onFinish,
  form,
  editing,
}: {
  saving: boolean;
  onFinish: (v: ImageFormValues) => void;
  form: FormInstance;
  editing: boolean;
}) {
  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
      initialValues={{ nv_runtime: false, carla_runtime: false, ros_runtime: false }}
    >
      <Form.Item name="name" label="Name" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item
        name="image_path"
        label="Image Path (JSON)"
        rules={[
          { required: true },
          {
            validator: (_, v) => {
              try {
                JSON.parse(v);
                return Promise.resolve();
              } catch {
                return Promise.reject("Invalid JSON");
              }
            },
          },
        ]}
      >
        <Input.TextArea
          rows={2}
          placeholder='{"docker": "ghcr.io/..."}'
          style={{
            fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
            fontSize: 12,
          }}
        />
      </Form.Item>
      <Form.Item name="nv_runtime" label="NV Runtime" valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item name="carla_runtime" label="CARLA Runtime" valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item name="ros_runtime" label="ROS Runtime" valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" loading={saving} block>
          {editing ? "Save" : "Create"}
        </Button>
      </Form.Item>
    </Form>
  );
}

/** Standard "Edit / Delete" overflow menu used by every tab's row. */
function rowActions<T extends { id: number }>(
  record: T,
  openEdit: (r: T) => void,
  handleDelete: (id: number) => void,
) {
  return (
    <Dropdown
      menu={{
        items: [
          { key: "edit", icon: <EditOutlined />, label: "Edit", onClick: () => openEdit(record) },
          { type: "divider" as const },
          {
            key: "delete",
            icon: <DeleteOutlined />,
            label: "Delete",
            danger: true,
            onClick: () => handleDelete(record.id),
          },
        ],
      }}
      trigger={["click"]}
    >
      <Button size="small" icon={<MoreOutlined />} />
    </Dropdown>
  );
}

/** "Add X" + "Refresh" toolbar shown above each tab's table. */
function TabToolbar({
  entityName,
  onAdd,
  onReload,
}: {
  entityName: string;
  onAdd: () => void;
  onReload: () => void;
}) {
  return (
    <Space style={{ marginBottom: 12 }}>
      <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
        Add {entityName}
      </Button>
      <Button icon={<ReloadOutlined />} onClick={onReload}>
        Refresh
      </Button>
    </Space>
  );
}

// --- AVs ---

function AvsTab() {
  const tab = useResourceTab<AvResponse, ImagePayload>({
    listFn: api.listAvs,
    createFn: api.createAv,
    updateFn: api.updateAv,
    deleteFn: api.deleteAv,
    getInitialValues: (r) => ({ ...r, image_path: JSON.stringify(r.image_path, null, 2) }),
    transformPayload: (v) => ({
      ...(v as unknown as ImageFormValues),
      image_path: JSON.parse((v as unknown as ImageFormValues).image_path),
    }),
  });

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 50 },
    { title: "Name", dataIndex: "name", key: "name", width: 120, ...getColumnSearchProps("name") },
    ...imageColumns,
    {
      title: "Config",
      key: "config",
      width: 240,
      render: (_: unknown, r: AvResponse) => (
        <ConfigUpload entity="av" id={r.id} hasConfig={!!r.config_sha256} onChange={tab.load} />
      ),
    },
    {
      title: "",
      key: "actions",
      width: 50,
      render: (_: unknown, r: AvResponse) => rowActions(r, tab.openEdit, tab.handleDelete),
    },
  ];

  return (
    <>
      <TabToolbar entityName="AV" onAdd={tab.openCreate} onReload={tab.load} />
      <Table
        dataSource={tab.data}
        columns={columns}
        rowKey="id"
        loading={tab.loading}
        size="small"
        scroll={{ x: "max-content" }}
      />
      <Modal
        title={tab.editing ? "Edit AV" : "Add AV"}
        open={tab.modalOpen}
        onCancel={tab.closeModal}
        footer={null}
      >
        <ImageForm
          form={tab.form}
          saving={tab.saving}
          onFinish={(v) => tab.handleSave(v as unknown as Record<string, unknown>)}
          editing={!!tab.editing}
        />
      </Modal>
    </>
  );
}

// --- Simulators (same shape as AVs) ---

function SimulatorsTab() {
  const tab = useResourceTab<SimulatorResponse, ImagePayload>({
    listFn: api.listSimulators,
    createFn: api.createSimulator,
    updateFn: api.updateSimulator,
    deleteFn: api.deleteSimulator,
    getInitialValues: (r) => ({ ...r, image_path: JSON.stringify(r.image_path, null, 2) }),
    transformPayload: (v) => ({
      ...(v as unknown as ImageFormValues),
      image_path: JSON.parse((v as unknown as ImageFormValues).image_path),
    }),
  });

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 50 },
    { title: "Name", dataIndex: "name", key: "name", width: 120, ...getColumnSearchProps("name") },
    ...imageColumns,
    {
      title: "Config",
      key: "config",
      width: 240,
      render: (_: unknown, r: SimulatorResponse) => (
        <ConfigUpload
          entity="simulator"
          id={r.id}
          hasConfig={!!r.config_sha256}
          onChange={tab.load}
        />
      ),
    },
    {
      title: "",
      key: "actions",
      width: 50,
      render: (_: unknown, r: SimulatorResponse) => rowActions(r, tab.openEdit, tab.handleDelete),
    },
  ];

  return (
    <>
      <TabToolbar entityName="Simulator" onAdd={tab.openCreate} onReload={tab.load} />
      <Table
        dataSource={tab.data}
        columns={columns}
        rowKey="id"
        loading={tab.loading}
        size="small"
        scroll={{ x: "max-content" }}
      />
      <Modal
        title={tab.editing ? "Edit Simulator" : "Add Simulator"}
        open={tab.modalOpen}
        onCancel={tab.closeModal}
        footer={null}
      >
        <ImageForm
          form={tab.form}
          saving={tab.saving}
          onFinish={(v) => tab.handleSave(v as unknown as Record<string, unknown>)}
          editing={!!tab.editing}
        />
      </Modal>
    </>
  );
}

// --- Samplers ---

function SamplersTab() {
  const tab = useResourceTab<SamplerResponse>({
    listFn: api.listSamplers,
    createFn: api.createSampler,
    updateFn: api.updateSampler,
    deleteFn: api.deleteSampler,
  });

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 50 },
    { title: "Name", dataIndex: "name", key: "name", width: 120, ...getColumnSearchProps("name") },
    { title: "Module", dataIndex: "module_path", key: "module_path", ellipsis: true },
    {
      title: "Config",
      key: "config",
      width: 240,
      render: (_: unknown, r: SamplerResponse) => (
        <ConfigUpload
          entity="sampler"
          id={r.id}
          hasConfig={!!r.config_sha256}
          onChange={tab.load}
        />
      ),
    },
    {
      title: "",
      key: "actions",
      width: 50,
      render: (_: unknown, r: SamplerResponse) => rowActions(r, tab.openEdit, tab.handleDelete),
    },
  ];

  return (
    <>
      <TabToolbar entityName="Sampler" onAdd={tab.openCreate} onReload={tab.load} />
      <Table
        dataSource={tab.data}
        columns={columns}
        rowKey="id"
        loading={tab.loading}
        size="small"
        scroll={{ x: "max-content" }}
      />
      <Modal
        title={tab.editing ? "Edit Sampler" : "Add Sampler"}
        open={tab.modalOpen}
        onCancel={tab.closeModal}
        footer={null}
      >
        <Form form={tab.form} layout="vertical" onFinish={tab.handleSave}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="module_path" label="Module Path" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={tab.saving} block>
              {tab.editing ? "Save" : "Create"}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// --- Monitors (per-task condition tree: timeout, custom monitors). Same
//     shape as Samplers — name + module_path + nullable config bytes. The
//     monitor_id on a task is optional; null means executor falls back
//     to its bundled default.

function MonitorsTab() {
  const tab = useResourceTab<MonitorResponse>({
    listFn: api.listMonitors,
    createFn: api.createMonitor,
    updateFn: api.updateMonitor,
    deleteFn: api.deleteMonitor,
  });

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 50 },
    { title: "Name", dataIndex: "name", key: "name", width: 120, ...getColumnSearchProps("name") },
    { title: "Module", dataIndex: "module_path", key: "module_path", ellipsis: true },
    {
      title: "Config",
      key: "config",
      width: 240,
      render: (_: unknown, r: MonitorResponse) => (
        <ConfigUpload
          entity="monitor"
          id={r.id}
          hasConfig={!!r.config_sha256}
          onChange={tab.load}
        />
      ),
    },
    {
      title: "",
      key: "actions",
      width: 50,
      render: (_: unknown, r: MonitorResponse) => rowActions(r, tab.openEdit, tab.handleDelete),
    },
  ];

  return (
    <>
      <TabToolbar entityName="Monitor" onAdd={tab.openCreate} onReload={tab.load} />
      <Table
        dataSource={tab.data}
        columns={columns}
        rowKey="id"
        loading={tab.loading}
        size="small"
        scroll={{ x: "max-content" }}
      />
      <Modal
        title={tab.editing ? "Edit Monitor" : "Add Monitor"}
        open={tab.modalOpen}
        onCancel={tab.closeModal}
        footer={null}
      >
        <Form form={tab.form} layout="vertical" onFinish={tab.handleSave}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="module_path"
            label="Module Path"
            rules={[{ required: true }]}
            initialValue="simcore.monitor.base:Monitor"
          >
            <Input />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={tab.saving} block>
              {tab.editing ? "Save" : "Create"}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// --- Maps ---

function MapsTab() {
  const tab = useResourceTab<MapResponse>({
    listFn: api.listMaps,
    createFn: api.createMap,
    updateFn: api.updateMap,
    deleteFn: api.deleteMap,
  });
  const [filesFor, setFilesFor] = useState<MapResponse | null>(null);

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 50 },
    { title: "Name", dataIndex: "name", key: "name", ...getColumnSearchProps("name") },
    {
      title: "Files",
      key: "files",
      width: 120,
      render: (_: unknown, r: MapResponse) => (
        <Button size="small" icon={<FolderOpenOutlined />} onClick={() => setFilesFor(r)}>
          Open
        </Button>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 50,
      render: (_: unknown, r: MapResponse) => rowActions(r, tab.openEdit, tab.handleDelete),
    },
  ];

  return (
    <>
      <TabToolbar entityName="Map" onAdd={tab.openCreate} onReload={tab.load} />
      <Table
        dataSource={tab.data}
        columns={columns}
        rowKey="id"
        loading={tab.loading}
        size="small"
        scroll={{ x: "max-content" }}
      />
      <Modal
        title={tab.editing ? "Edit Map" : "Add Map"}
        open={tab.modalOpen}
        onCancel={tab.closeModal}
        footer={null}
      >
        <Form form={tab.form} layout="vertical" onFinish={tab.handleSave}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={tab.saving} block>
              {tab.editing ? "Save" : "Create"}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
      <FileBrowser
        open={filesFor !== null}
        title={filesFor ? `Files — ${filesFor.name}` : ""}
        onClose={() => setFilesFor(null)}
        listFiles={() => (filesFor ? api.listMapFiles(filesFor.id) : Promise.resolve([]))}
        fileUrl={(rel) => (filesFor ? api.mapFileUrl(filesFor.id, rel) : "")}
        uploadFile={filesFor ? (rel, data) => api.uploadMapFile(filesFor.id, rel, data) : undefined}
        deleteFile={filesFor ? (rel) => api.deleteMapFile(filesFor.id, rel) : undefined}
        defaultUploadPrefix="xodr/"
      />
    </>
  );
}

export default function Resources() {
  return (
    <>
      <PageHeader
        title="Resources"
        subtitle="The building blocks of a task — AVs, Simulators, Samplers, Monitors, and Maps."
      />
      <Tabs
        items={[
          { key: "avs", label: "AVs", children: <AvsTab /> },
          { key: "simulators", label: "Simulators", children: <SimulatorsTab /> },
          { key: "samplers", label: "Samplers", children: <SamplersTab /> },
          { key: "monitors", label: "Monitors", children: <MonitorsTab /> },
          { key: "maps", label: "Maps", children: <MapsTab /> },
        ]}
      />
    </>
  );
}
