import { useEffect, useState } from "react";
import {
  Tag,
  Button,
  Modal,
  Form,
  Select,
  message,
  Typography,
  Space,
  Progress,
  Alert,
  Statistic,
  Card,
  Row,
  Col,
  Input,
  Checkbox,
} from "antd";
import { PlusOutlined, ReloadOutlined, ThunderboltOutlined, CaretRightOutlined, DeleteOutlined, StopOutlined } from "@ant-design/icons";
import { Popconfirm } from "antd";
import ResizableTable from "../components/ResizableTable";
import { getColumnSearchProps } from "../components/ColumnSearch";
import { api } from "../api/client";
import type {
  TaskResponse,
  TaskStatus,
  PlanResponse,
  AvResponse,
  SimulatorResponse,
  SamplerResponse,
  TaskRunResponse,
  TaskRunStatus,
  ExecutorResponse,
} from "../api/types";

const statusColors: Record<TaskStatus, string> = {
  created: "default",
  pending: "warning",
  running: "processing",
  completed: "success",
  failed: "error",
  invalid: "default",
};

const runStatusColors: Record<TaskRunStatus, string> = {
  running: "processing",
  completed: "success",
  failed: "error",
  aborted: "default",
};

function TaskRunsPanel({ taskId }: { taskId: number }) {
  const [runs, setRuns] = useState<TaskRunResponse[]>([]);
  const [executors, setExecutors] = useState<Map<number, ExecutorResponse>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => api.listTaskRuns(taskId).then(setRuns).finally(() => setLoading(false));
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [taskId]);

  useEffect(() => {
    const ids = [...new Set(runs.map((r) => r.executor_id))];
    const missing = ids.filter((id) => !executors.has(id));
    if (missing.length === 0) return;
    api.listExecutors().then((all) => {
      const map = new Map(all.map((e) => [e.id, e]));
      setExecutors(map);
    });
  }, [runs]);

  if (loading) return <Typography.Text type="secondary">Loading runs...</Typography.Text>;
  if (runs.length === 0) return <Typography.Text type="secondary">No runs yet</Typography.Text>;

  return (
    <div style={{ padding: "0 8px" }}>
      {runs.map((run) => {
        const exec = executors.get(run.executor_id);
        return (
          <Card
            key={run.id}
            size="small"
            style={{ marginBottom: 8 }}
            title={
              <Space>
                <span>Attempt #{run.attempt}</span>
                <Tag color={runStatusColors[run.task_run_status]}>
                  {run.task_run_status.toUpperCase()}
                </Tag>
              </Space>
            }
          >
            <Row gutter={[16, 4]}>
              <Col span={12}>
                <Typography.Text type="secondary">Started: </Typography.Text>
                {run.started_at ? new Date(run.started_at).toLocaleString() : "-"}
              </Col>
              <Col span={12}>
                <Typography.Text type="secondary">Finished: </Typography.Text>
                {run.finished_at ? new Date(run.finished_at).toLocaleString() : "-"}
              </Col>
              {run.finished_at && run.started_at && (
                <Col span={12}>
                  <Typography.Text type="secondary">Duration: </Typography.Text>
                  {((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000).toFixed(1)}s
                </Col>
              )}
              <Col span={12}>
                <Typography.Text type="secondary">Executor: </Typography.Text>
                <a href={`/executors?search=${run.executor_id}`}>
                  {exec ? `${exec.hostname} (job ${exec.slurm_job_id})` : `#${run.executor_id}`}
                </a>
              </Col>
              {exec && (
                <Col span={12}>
                  <Typography.Text type="secondary">Node: </Typography.Text>
                  {exec.slurm_node_list}
                </Col>
              )}
              {run.error_message && (
                <Col span={24}>
                  <Typography.Text type="danger">
                    {run.error_message}
                  </Typography.Text>
                </Col>
              )}
            </Row>
          </Card>
        );
      })}
    </div>
  );
}

export default function Tasks() {
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [expandedRows, setExpandedRows] = useState<React.Key[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [avs, setAvs] = useState<AvResponse[]>([]);
  const [simulators, setSimulators] = useState<SimulatorResponse[]>([]);
  const [samplers, setSamplers] = useState<SamplerResponse[]>([]);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  const [bulkForm] = Form.useForm();

  // Bulk creation progress
  const [bulkProgress, setBulkProgress] = useState<{
    total: number;
    done: number;
    errors: number;
  } | null>(null);

  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = () => {
    setLoading(true);
    api.listTasks().then(setTasks).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    if (!autoRefresh) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const fetchResources = () =>
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
    });

  const openModal = () => {
    fetchResources().then(() => setModalOpen(true));
  };

  const openBulkModal = () => {
    fetchResources().then(() => {
      setConfirmed(false);
      setFilteredPlans([]);
      setPreviewCount(0);
      setBulkModalOpen(true);
    });
  };

  const handleRun = async (taskId: number) => {
    try {
      await api.updateTask(taskId, { task_status: "pending" });
      message.success(`Task #${taskId} queued for execution`);
      load();
    } catch (e) {
      message.error(String(e));
    }
  };

  const handleStop = async (taskId: number) => {
    try {
      await api.updateTask(taskId, { task_status: "created" });
      message.success(`Task #${taskId} stopped`);
      load();
    } catch (e) {
      message.error(String(e));
    }
  };

  const handleDelete = async (taskId: number) => {
    try {
      await api.deleteTask(taskId);
      message.success(`Task #${taskId} deleted`);
      load();
    } catch (e) {
      message.error(String(e));
    }
  };

  const handleCreate = async (values: {
    plan_id: number;
    av_id: number;
    simulator_id: number;
    sampler_id: number;
  }) => {
    setCreating(true);
    try {
      await api.createTask({ ...values, task_status: "created" });
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

  const handleBulkCreate = async (values: {
    av_ids: number[];
    simulator_ids: number[];
    sampler_ids: number[];
    plan_ids: number[];
    plan_filter?: string;
  }) => {
    const selectedPlans = values.plan_ids?.length
      ? values.plan_ids
      : plans
          .filter((p) =>
            values.plan_filter
              ? p.name.toLowerCase().includes(values.plan_filter.toLowerCase())
              : true
          )
          .map((p) => p.id);

    const combos: { plan_id: number; av_id: number; simulator_id: number; sampler_id: number }[] = [];
    for (const av_id of values.av_ids) {
      for (const simulator_id of values.simulator_ids) {
        for (const sampler_id of values.sampler_ids) {
          for (const plan_id of selectedPlans) {
            combos.push({ plan_id, av_id, simulator_id, sampler_id });
          }
        }
      }
    }

    if (combos.length === 0) {
      message.warning("No task combinations to create");
      return;
    }

    setCreating(true);
    setBulkProgress({ total: combos.length, done: 0, errors: 0 });

    let done = 0;
    let errors = 0;

    for (const combo of combos) {
      try {
        await api.createTask({ ...combo, task_status: "created" });
      } catch {
        errors++;
      }
      done++;
      setBulkProgress({ total: combos.length, done, errors });
    }

    setCreating(false);
    message.success(`Created ${done - errors}/${combos.length} tasks (${errors} errors)`);
    setBulkModalOpen(false);
    bulkForm.resetFields();
    setBulkProgress(null);
    load();
  };

  const [confirmed, setConfirmed] = useState(false);
  const [previewCount, setPreviewCount] = useState(0);
  const [filteredPlans, setFilteredPlans] = useState<PlanResponse[]>([]);

  const computeFilteredPlans = (): PlanResponse[] => {
    const values = bulkForm.getFieldsValue();
    if (values.plan_ids?.length) {
      return plans.filter((p) => values.plan_ids.includes(p.id));
    }
    if (values.plan_filter) {
      return plans.filter((p) =>
        p.name.toLowerCase().includes(values.plan_filter.toLowerCase())
      );
    }
    return plans;
  };

  const updatePreview = () => {
    const values = bulkForm.getFieldsValue();
    const avCount = values.av_ids?.length || 0;
    const simCount = values.simulator_ids?.length || 0;
    const samplerCount = values.sampler_ids?.length || 0;
    const matched = computeFilteredPlans();
    setFilteredPlans(matched);
    setPreviewCount(avCount * simCount * samplerCount * matched.length);
    setConfirmed(false);
  };

  // Load resources on mount for name resolution in the table
  useEffect(() => {
    fetchResources();
  }, []);

  const planName = (id: number) => plans.find((p) => p.id === id)?.name ?? `#${id}`;
  const avName = (id: number) => avs.find((a) => a.id === id)?.name ?? `#${id}`;
  const simName = (id: number) => simulators.find((s) => s.id === id)?.name ?? `#${id}`;
  const samplerName = (id: number) => samplers.find((s) => s.id === id)?.name ?? `#${id}`;

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60, sorter: (a: TaskResponse, b: TaskResponse) => a.id - b.id,
      ...getColumnSearchProps<TaskResponse>("id") },
    { title: "Plan", dataIndex: "plan_id", key: "plan_id", width: 250, ellipsis: true, render: (id: number) => planName(id),
      ...getColumnSearchProps<TaskResponse>("plan_id", (r) => planName(r.plan_id)) },
    { title: "AV", dataIndex: "av_id", key: "av_id", width: 100, ellipsis: true, render: (id: number) => avName(id),
      filters: avs.map((a) => ({ text: a.name, value: a.id })),
      onFilter: (value: unknown, record: TaskResponse) => record.av_id === value },
    { title: "Simulator", dataIndex: "simulator_id", key: "simulator_id", width: 100, ellipsis: true, render: (id: number) => simName(id),
      filters: simulators.map((s) => ({ text: s.name, value: s.id })),
      onFilter: (value: unknown, record: TaskResponse) => record.simulator_id === value },
    { title: "Sampler", dataIndex: "sampler_id", key: "sampler_id", width: 80, ellipsis: true, render: (id: number) => samplerName(id),
      filters: samplers.map((s) => ({ text: s.name, value: s.id })),
      onFilter: (value: unknown, record: TaskResponse) => record.sampler_id === value },
    {
      title: "Status",
      dataIndex: "task_status",
      key: "task_status",
      width: 100,
      filters: (["created", "pending", "running", "completed", "failed", "invalid"] as TaskStatus[]).map(
        (s) => ({ text: s, value: s })
      ),
      onFilter: (value: unknown, record: TaskResponse) => record.task_status === value,
      render: (status: TaskStatus) => (
        <Tag color={statusColors[status]}>{status.toUpperCase()}</Tag>
      ),
    },
    { title: "Retries", dataIndex: "retry_count", key: "retry_count", width: 60, sorter: (a: TaskResponse, b: TaskResponse) => a.retry_count - b.retry_count },
    {
      title: "Created",
      dataIndex: "created_at",
      key: "created_at",
      width: 170,
      render: (v: string) => new Date(v).toLocaleString(),
      sorter: (a: TaskResponse, b: TaskResponse) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    },
    {
      title: "Last Run",
      key: "last_run",
      width: 170,
      render: (_: unknown, record: TaskResponse) => {
        const lastRun = record.task_run?.[0]?.started_at;
        return lastRun ? new Date(lastRun).toLocaleString() : "-";
      },
      sorter: (a: TaskResponse, b: TaskResponse) => {
        const aTime = a.task_run?.[0]?.started_at ? new Date(a.task_run[0].started_at).getTime() : 0;
        const bTime = b.task_run?.[0]?.started_at ? new Date(b.task_run[0].started_at).getTime() : 0;
        return aTime - bTime;
      },
      defaultSortOrder: "descend" as const,
    },
    {
      title: "Actions",
      key: "actions",
      width: 150,
      render: (_: unknown, record: TaskResponse) => {
        const canRun = ["created", "failed", "invalid", "completed"].includes(record.task_status);
        const canStop = ["pending", "running"].includes(record.task_status);
        return (
          <Space>
            {canStop ? (
              <Popconfirm
                title="Stop this task?"
                description="Status will be set back to created"
                onConfirm={() => handleStop(record.id)}
              >
                <Button size="small" icon={<StopOutlined />}>Stop</Button>
              </Popconfirm>
            ) : (
              <Popconfirm
                title="Queue this task for execution?"
                description="Status will be set to pending"
                onConfirm={() => handleRun(record.id)}
                disabled={!canRun}
              >
                <Button size="small" type="primary" icon={<CaretRightOutlined />} disabled={!canRun}>Run</Button>
              </Popconfirm>
            )}
            <Popconfirm title="Delete?" onConfirm={() => handleDelete(record.id)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <>
      <Typography.Title level={3}>Tasks</Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openModal}>
          Create Task
        </Button>
        <Button type="primary" icon={<ThunderboltOutlined />} onClick={openBulkModal}>
          Bulk Create
        </Button>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
        <Checkbox checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)}>Auto-refresh</Checkbox>
      </Space>
      <ResizableTable
        dataSource={tasks}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          showSizeChanger: true,
          showTotal: (total) => `${total} tasks`,
          onChange: (page, size) => { setCurrentPage(page); setPageSize(size); },
        }}
        expandable={{
          expandedRowRender: (record: TaskResponse) => (
            <TaskRunsPanel taskId={record.id} />
          ),
          expandedRowKeys: expandedRows,
          onExpandedRowsChange: (keys) => setExpandedRows(keys as React.Key[]),
        }}
      />

      {/* Single task modal */}
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

      {/* Bulk create modal */}
      <Modal
        title="Bulk Create Tasks"
        open={bulkModalOpen}
        onCancel={() => {
          if (!creating) {
            setBulkModalOpen(false);
            setBulkProgress(null);
          }
        }}
        footer={null}
        width={640}
      >
        <Typography.Paragraph type="secondary">
          Creates tasks for every combination of selected AVs, Simulators, Samplers, and Plans.
        </Typography.Paragraph>

        <Form
          form={bulkForm}
          layout="vertical"
          onFinish={handleBulkCreate}
          onValuesChange={updatePreview}
        >
          <Form.Item name="av_ids" label="AVs" rules={[{ required: true, message: "Select at least one AV" }]}>
            <Select
              mode="multiple"
              options={avs.map((a) => ({ label: a.name, value: a.id }))}
              placeholder="Select AVs"
            />
          </Form.Item>
          <Form.Item name="simulator_ids" label="Simulators" rules={[{ required: true, message: "Select at least one Simulator" }]}>
            <Select
              mode="multiple"
              options={simulators.map((s) => ({ label: s.name, value: s.id }))}
              placeholder="Select Simulators"
            />
          </Form.Item>
          <Form.Item name="sampler_ids" label="Samplers" rules={[{ required: true, message: "Select at least one Sampler" }]}>
            <Select
              mode="multiple"
              options={samplers.map((s) => ({ label: s.name, value: s.id }))}
              placeholder="Select Samplers"
            />
          </Form.Item>
          <Form.Item name="plan_filter" label="Plan name filter (optional)">
            <Input placeholder="e.g. tyms, route, HetroD" allowClear />
          </Form.Item>
          <Form.Item name="plan_ids" label="Plans (leave empty to use all matching plans)">
            <Select
              mode="multiple"
              options={plans.map((p) => ({ label: `${p.name} (#${p.id})`, value: p.id }))}
              showSearch
              optionFilterProp="label"
              placeholder="All plans (or filter above)"
              maxTagCount={5}
            />
          </Form.Item>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Card size="small">
                <Statistic title="Matched plans" value={filteredPlans.length} />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic title="Total plans" value={plans.length} />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic title="Tasks to create" value={previewCount} />
              </Card>
            </Col>
          </Row>

          {filteredPlans.length > 0 && (
            <ResizableTable
              dataSource={filteredPlans}
              columns={[
                { title: "ID", dataIndex: "id", key: "id", width: 60 },
                { title: "Plan Name", dataIndex: "name", key: "name", width: 300, ellipsis: true },
                { title: "Map", dataIndex: "map_id", key: "map_id", width: 60 },
                { title: "Scenario", dataIndex: "scenario_id", key: "scenario_id", width: 80 },
              ]}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 5, size: "small" }}
              style={{ marginBottom: 16 }}
            />
          )}

          {bulkProgress && (
            <div style={{ marginBottom: 16 }}>
              <Progress
                percent={Math.round((bulkProgress.done / bulkProgress.total) * 100)}
                status={bulkProgress.errors > 0 ? "exception" : "active"}
              />
              <Typography.Text>
                {bulkProgress.done}/{bulkProgress.total} created
                {bulkProgress.errors > 0 && (
                  <Typography.Text type="danger"> ({bulkProgress.errors} errors)</Typography.Text>
                )}
              </Typography.Text>
            </div>
          )}

          {previewCount > 5000 && (
            <Alert
              type="warning"
              message={`This will create ${previewCount.toLocaleString()} tasks.`}
              style={{ marginBottom: 16 }}
            />
          )}

          <Form.Item style={{ marginBottom: 8 }}>
            <Checkbox
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={previewCount === 0}
            >
              I confirm creating {previewCount.toLocaleString()} tasks
            </Checkbox>
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={creating}
              block
              disabled={previewCount === 0 || !confirmed}
            >
              Create {previewCount.toLocaleString()} Tasks
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
