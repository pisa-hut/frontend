import { useEffect, useState } from "react";
import {
  Table,
  Tag,
  Button,
  Modal,
  Form,
  Select,
  message,
  Typography,
  Space,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { api } from "../api/client";
import type {
  TaskResponse,
  TaskStatus,
  PlanResponse,
  AvResponse,
  SimulatorResponse,
  SamplerResponse,
} from "../api/types";

const statusColors: Record<TaskStatus, string> = {
  created: "default",
  pending: "warning",
  running: "processing",
  completed: "success",
  failed: "error",
  invalid: "default",
};

export default function Tasks() {
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [avs, setAvs] = useState<AvResponse[]>([]);
  const [simulators, setSimulators] = useState<SimulatorResponse[]>([]);
  const [samplers, setSamplers] = useState<SamplerResponse[]>([]);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    api.listTasks().then(setTasks).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openModal = () => {
    Promise.all([
      api.listPlans(),
      api.listAvs(),
      api.listSimulators(),
      api.listSamplers(),
    ]).then(([p, a, s, sa]) => {
      setPlans(p);
      setAvs(a);
      setSimulators(s);
      setSamplers(sa);
      setModalOpen(true);
    });
  };

  const handleCreate = async (values: {
    plan_id: number;
    av_id: number;
    simulator_id: number;
    sampler_id: number;
  }) => {
    setCreating(true);
    try {
      await api.createTask(values);
      message.success("Task created");
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
    { title: "ID", dataIndex: "id", key: "id", sorter: (a: TaskResponse, b: TaskResponse) => a.id - b.id },
    { title: "Plan", dataIndex: "plan_id", key: "plan_id" },
    { title: "AV", dataIndex: "av_id", key: "av_id" },
    { title: "Simulator", dataIndex: "simulator_id", key: "simulator_id" },
    { title: "Sampler", dataIndex: "sampler_id", key: "sampler_id" },
    {
      title: "Status",
      dataIndex: "task_status",
      key: "task_status",
      filters: (["created", "pending", "running", "completed", "failed", "invalid"] as TaskStatus[]).map(
        (s) => ({ text: s, value: s })
      ),
      onFilter: (value: unknown, record: TaskResponse) => record.task_status === value,
      render: (status: TaskStatus) => (
        <Tag color={statusColors[status]}>{status.toUpperCase()}</Tag>
      ),
    },
    { title: "Retries", dataIndex: "retry_count", key: "retry_count" },
    {
      title: "Created",
      dataIndex: "created_at",
      key: "created_at",
      render: (v: string) => new Date(v).toLocaleString(),
      sorter: (a: TaskResponse, b: TaskResponse) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    },
  ];

  return (
    <>
      <Typography.Title level={3}>Tasks</Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openModal}>
          Create Task
        </Button>
        <Button icon={<ReloadOutlined />} onClick={load}>
          Refresh
        </Button>
      </Space>
      <Table
        dataSource={tasks}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
      />

      <Modal
        title="Create Task"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="plan_id" label="Plan" rules={[{ required: true }]}>
            <Select
              options={plans.map((p) => ({ label: `${p.name} (#${p.id})`, value: p.id }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="av_id" label="AV" rules={[{ required: true }]}>
            <Select
              options={avs.map((a) => ({ label: `${a.name} (#${a.id})`, value: a.id }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="simulator_id" label="Simulator" rules={[{ required: true }]}>
            <Select
              options={simulators.map((s) => ({ label: `${s.name} (#${s.id})`, value: s.id }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="sampler_id" label="Sampler" rules={[{ required: true }]}>
            <Select
              options={samplers.map((s) => ({ label: `${s.name} (#${s.id})`, value: s.id }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={creating} block>
              Create
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
