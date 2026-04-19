import { useEffect, useState, useCallback } from "react";
import {
  Tabs,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Switch,
  message,
  Typography,
  Space,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { api } from "../api/client";
import type {
  AvResponse,
  SimulatorResponse,
  SamplerResponse,
  MapResponse,
} from "../api/types";

function useResourceTab<T extends { id: number }>(
  listFn: () => Promise<T[]>
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const load = useCallback(() => {
    setLoading(true);
    listFn().then(setData).finally(() => setLoading(false));
  }, [listFn]);
  useEffect(load, [load]);
  return { data, loading, modalOpen, setModalOpen, load };
}

function AvsTab() {
  const { data, loading, modalOpen, setModalOpen, load } =
    useResourceTab(api.listAvs);
  const [form] = Form.useForm();
  const [creating, setCreating] = useState(false);

  const handleCreate = async (values: {
    name: string;
    image_path: string;
    config_path: string;
    nv_runtime: boolean;
    carla_runtime: boolean;
    ros_runtime: boolean;
  }) => {
    setCreating(true);
    try {
      const imagePath = JSON.parse(values.image_path);
      await api.createAv({
        ...values,
        image_path: imagePath,
      });
      message.success("AV created");
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
    { title: "ID", dataIndex: "id", key: "id" },
    { title: "Name", dataIndex: "name", key: "name" },
    {
      title: "Image Path",
      dataIndex: "image_path",
      key: "image_path",
      ellipsis: true,
      render: (v: Record<string, unknown>) => JSON.stringify(v),
    },
    { title: "Config Path", dataIndex: "config_path", key: "config_path", ellipsis: true },
    { title: "NV", dataIndex: "nv_runtime", key: "nv_runtime", render: (v: boolean) => v ? "Yes" : "No" },
    { title: "CARLA", dataIndex: "carla_runtime", key: "carla_runtime", render: (v: boolean) => v ? "Yes" : "No" },
    { title: "ROS", dataIndex: "ros_runtime", key: "ros_runtime", render: (v: boolean) => v ? "Yes" : "No" },
  ];

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>Add AV</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </Space>
      <Table<AvResponse> dataSource={data} columns={columns} rowKey="id" loading={loading} />
      <Modal title="Add AV" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleCreate}
          initialValues={{ nv_runtime: false, carla_runtime: false, ros_runtime: false }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="image_path" label="Image Path (JSON)" rules={[{ required: true },
            { validator: (_, v) => { try { JSON.parse(v); return Promise.resolve(); } catch { return Promise.reject("Invalid JSON"); } } }]}>
            <Input.TextArea rows={2} placeholder='{"docker": "ghcr.io/..."}' />
          </Form.Item>
          <Form.Item name="config_path" label="Config Path" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="nv_runtime" label="NV Runtime" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="carla_runtime" label="CARLA Runtime" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="ros_runtime" label="ROS Runtime" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={creating} block>Create</Button></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function SimulatorsTab() {
  const { data, loading, modalOpen, setModalOpen, load } =
    useResourceTab(api.listSimulators);
  const [form] = Form.useForm();
  const [creating, setCreating] = useState(false);

  const handleCreate = async (values: {
    name: string;
    image_path: string;
    config_path: string;
    nv_runtime: boolean;
    carla_runtime: boolean;
    ros_runtime: boolean;
  }) => {
    setCreating(true);
    try {
      const imagePath = JSON.parse(values.image_path);
      await api.createSimulator({ ...values, image_path: imagePath });
      message.success("Simulator created");
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
    { title: "ID", dataIndex: "id", key: "id" },
    { title: "Name", dataIndex: "name", key: "name" },
    { title: "Image Path", dataIndex: "image_path", key: "image_path", ellipsis: true, render: (v: Record<string, unknown>) => JSON.stringify(v) },
    { title: "Config Path", dataIndex: "config_path", key: "config_path", ellipsis: true },
    { title: "NV", dataIndex: "nv_runtime", key: "nv_runtime", render: (v: boolean) => v ? "Yes" : "No" },
    { title: "CARLA", dataIndex: "carla_runtime", key: "carla_runtime", render: (v: boolean) => v ? "Yes" : "No" },
    { title: "ROS", dataIndex: "ros_runtime", key: "ros_runtime", render: (v: boolean) => v ? "Yes" : "No" },
  ];

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>Add Simulator</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </Space>
      <Table<SimulatorResponse> dataSource={data} columns={columns} rowKey="id" loading={loading} />
      <Modal title="Add Simulator" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleCreate}
          initialValues={{ nv_runtime: false, carla_runtime: false, ros_runtime: false }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="image_path" label="Image Path (JSON)" rules={[{ required: true },
            { validator: (_, v) => { try { JSON.parse(v); return Promise.resolve(); } catch { return Promise.reject("Invalid JSON"); } } }]}>
            <Input.TextArea rows={2} placeholder='{"docker": "ghcr.io/..."}' />
          </Form.Item>
          <Form.Item name="config_path" label="Config Path" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="nv_runtime" label="NV Runtime" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="carla_runtime" label="CARLA Runtime" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="ros_runtime" label="ROS Runtime" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={creating} block>Create</Button></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function SamplersTab() {
  const { data, loading, modalOpen, setModalOpen, load } =
    useResourceTab(api.listSamplers);
  const [form] = Form.useForm();
  const [creating, setCreating] = useState(false);

  const handleCreate = async (values: { name: string; module_path: string; config_path?: string }) => {
    setCreating(true);
    try {
      await api.createSampler(values);
      message.success("Sampler created");
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
    { title: "ID", dataIndex: "id", key: "id" },
    { title: "Name", dataIndex: "name", key: "name" },
    { title: "Module Path", dataIndex: "module_path", key: "module_path", ellipsis: true },
    { title: "Config Path", dataIndex: "config_path", key: "config_path", render: (v: string | null) => v ?? "-" },
  ];

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>Add Sampler</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </Space>
      <Table<SamplerResponse> dataSource={data} columns={columns} rowKey="id" loading={loading} />
      <Modal title="Add Sampler" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="module_path" label="Module Path" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="config_path" label="Config Path"><Input /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={creating} block>Create</Button></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function MapsTab() {
  const { data, loading, modalOpen, setModalOpen, load } =
    useResourceTab(api.listMaps);
  const [form] = Form.useForm();
  const [creating, setCreating] = useState(false);

  const handleCreate = async (values: { name: string; xodr_path?: string; osm_path?: string }) => {
    setCreating(true);
    try {
      await api.createMap(values);
      message.success("Map created");
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
    { title: "ID", dataIndex: "id", key: "id" },
    { title: "Name", dataIndex: "name", key: "name" },
    { title: "XODR Path", dataIndex: "xodr_path", key: "xodr_path", render: (v: string | null) => v ?? "-" },
    { title: "OSM Path", dataIndex: "osm_path", key: "osm_path", render: (v: string | null) => v ?? "-" },
  ];

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>Add Map</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </Space>
      <Table<MapResponse> dataSource={data} columns={columns} rowKey="id" loading={loading} />
      <Modal title="Add Map" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="xodr_path" label="XODR Path"><Input /></Form.Item>
          <Form.Item name="osm_path" label="OSM Path"><Input /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={creating} block>Create</Button></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export default function Resources() {
  return (
    <>
      <Typography.Title level={3}>Resources</Typography.Title>
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
