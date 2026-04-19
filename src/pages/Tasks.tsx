import { useEffect, useState, useMemo, useCallback, useRef } from "react";
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
  Table,
} from "antd";
import { PlusOutlined, ReloadOutlined, ThunderboltOutlined, CaretRightOutlined, DeleteOutlined } from "@ant-design/icons";
import { Popconfirm } from "antd";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, type ColDef, type ICellRendererParams, type GridReadyEvent, type RowClickedEvent } from "ag-grid-community";
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
} from "../api/types";

ModuleRegistry.registerModules([AllCommunityModule]);

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => api.listTaskRuns(taskId).then(setRuns).finally(() => setLoading(false));
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [taskId]);

  if (loading) return <Typography.Text type="secondary">Loading runs...</Typography.Text>;
  if (runs.length === 0) return <Typography.Text type="secondary">No runs yet</Typography.Text>;

  return (
    <div style={{ padding: "0 8px" }}>
      {runs.map((run) => (
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
              #{run.executor_id}
            </Col>
            {run.error_message && (
              <Col span={24}>
                <Typography.Text type="danger">
                  {run.error_message}
                </Typography.Text>
              </Col>
            )}
          </Row>
        </Card>
      ))}
    </div>
  );
}

export default function Tasks() {
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [avs, setAvs] = useState<AvResponse[]>([]);
  const [simulators, setSimulators] = useState<SimulatorResponse[]>([]);
  const [samplers, setSamplers] = useState<SamplerResponse[]>([]);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  const [bulkForm] = Form.useForm();
  const gridRef = useRef<AgGridReact>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  const [bulkProgress, setBulkProgress] = useState<{
    total: number;
    done: number;
    errors: number;
  } | null>(null);

  const load = useCallback(() => {
    api.listTasks().then(setTasks);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

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

  useEffect(() => { fetchResources(); }, []);

  const planMap = useMemo(() => new Map(plans.map((p) => [p.id, p.name])), [plans]);
  const avMap = useMemo(() => new Map(avs.map((a) => [a.id, a.name])), [avs]);
  const simMap = useMemo(() => new Map(simulators.map((s) => [s.id, s.name])), [simulators]);
  const samplerMap = useMemo(() => new Map(samplers.map((s) => [s.id, s.name])), [samplers]);

  const handleRun = useCallback(async (taskId: number) => {
    try {
      await api.updateTask(taskId, { task_status: "pending" });
      message.success(`Task #${taskId} queued`);
      load();
    } catch (e) { message.error(String(e)); }
  }, [load]);

  const handleDelete = useCallback(async (taskId: number) => {
    try {
      await api.deleteTask(taskId);
      message.success(`Task #${taskId} deleted`);
      load();
    } catch (e) { message.error(String(e)); }
  }, [load]);

  const StatusRenderer = useCallback((params: ICellRendererParams) => {
    const status = params.value as TaskStatus;
    return <Tag color={statusColors[status]}>{status?.toUpperCase()}</Tag>;
  }, []);

  const ActionsRenderer = useCallback((params: ICellRendererParams<TaskResponse>) => {
    const record = params.data!;
    const canRun = ["created", "failed", "invalid", "completed"].includes(record.task_status);
    return (
      <Space>
        <Popconfirm title="Queue for execution?" onConfirm={() => handleRun(record.id)} disabled={!canRun}>
          <Button size="small" type="primary" icon={<CaretRightOutlined />} disabled={!canRun}>Run</Button>
        </Popconfirm>
        <Popconfirm title="Delete?" onConfirm={() => handleDelete(record.id)}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    );
  }, [handleRun, handleDelete]);

  const columnDefs = useMemo<ColDef<TaskResponse>[]>(() => [
    { field: "id", headerName: "ID", width: 70, filter: "agNumberColumnFilter", sort: "desc" },
    { field: "plan_id", headerName: "Plan", flex: 2, filter: "agTextColumnFilter",
      valueGetter: (p) => planMap.get(p.data?.plan_id ?? 0) ?? `#${p.data?.plan_id}` },
    { field: "av_id", headerName: "AV", width: 110, filter: "agTextColumnFilter",
      valueGetter: (p) => avMap.get(p.data?.av_id ?? 0) ?? `#${p.data?.av_id}` },
    { field: "simulator_id", headerName: "Simulator", width: 110, filter: "agTextColumnFilter",
      valueGetter: (p) => simMap.get(p.data?.simulator_id ?? 0) ?? `#${p.data?.simulator_id}` },
    { field: "sampler_id", headerName: "Sampler", width: 90, filter: "agTextColumnFilter",
      valueGetter: (p) => samplerMap.get(p.data?.sampler_id ?? 0) ?? `#${p.data?.sampler_id}` },
    { field: "task_status", headerName: "Status", width: 110, filter: "agSetColumnFilter",
      cellRenderer: StatusRenderer },
    { field: "retry_count", headerName: "Retries", width: 80, filter: "agNumberColumnFilter" },
    { field: "created_at", headerName: "Created", width: 170, filter: "agDateColumnFilter",
      valueFormatter: (p) => p.value ? new Date(p.value).toLocaleString() : "" },
    { headerName: "Last Run", width: 170, filter: "agDateColumnFilter",
      valueGetter: (p) => p.data?.task_run?.[0]?.started_at ?? null,
      valueFormatter: (p) => p.value ? new Date(p.value).toLocaleString() : "-" },
    { headerName: "Actions", width: 160, sortable: false, filter: false, resizable: false,
      cellRenderer: ActionsRenderer },
  ], [planMap, avMap, simMap, samplerMap, StatusRenderer, ActionsRenderer]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
  }), []);

  const onRowClicked = useCallback((event: RowClickedEvent<TaskResponse>) => {
    const id = event.data?.id;
    if (id != null) setSelectedTaskId((prev) => (prev === id ? null : id));
  }, []);

  const onGridReady = useCallback((params: GridReadyEvent) => {
    params.api.sizeColumnsToFit();
  }, []);

  // --- Bulk create logic ---
  const openModal = () => { fetchResources().then(() => setModalOpen(true)); };
  const openBulkModal = () => {
    fetchResources().then(() => {
      setConfirmed(false); setFilteredPlans([]); setPreviewCount(0);
      setBulkModalOpen(true);
    });
  };

  const handleCreate = async (values: { plan_id: number; av_id: number; simulator_id: number; sampler_id: number }) => {
    setCreating(true);
    try {
      await api.createTask({ ...values, task_status: "created" });
      message.success("Task created"); setModalOpen(false); form.resetFields(); load();
    } catch (e) { message.error(String(e)); } finally { setCreating(false); }
  };

  const handleBulkCreate = async (values: {
    av_ids: number[]; simulator_ids: number[]; sampler_ids: number[];
    plan_ids: number[]; plan_filter?: string;
  }) => {
    const selectedPlans = values.plan_ids?.length ? values.plan_ids
      : plans.filter((p) => values.plan_filter ? p.name.toLowerCase().includes(values.plan_filter.toLowerCase()) : true).map((p) => p.id);
    const combos: { plan_id: number; av_id: number; simulator_id: number; sampler_id: number }[] = [];
    for (const av_id of values.av_ids)
      for (const simulator_id of values.simulator_ids)
        for (const sampler_id of values.sampler_ids)
          for (const plan_id of selectedPlans)
            combos.push({ plan_id, av_id, simulator_id, sampler_id });
    if (combos.length === 0) { message.warning("No combinations"); return; }
    setCreating(true); setBulkProgress({ total: combos.length, done: 0, errors: 0 });
    let done = 0, errors = 0;
    for (const combo of combos) {
      try { await api.createTask({ ...combo, task_status: "created" }); } catch { errors++; }
      done++; setBulkProgress({ total: combos.length, done, errors });
    }
    setCreating(false);
    message.success(`Created ${done - errors}/${combos.length} tasks`);
    setBulkModalOpen(false); bulkForm.resetFields(); setBulkProgress(null); load();
  };

  const [confirmed, setConfirmed] = useState(false);
  const [previewCount, setPreviewCount] = useState(0);
  const [filteredPlans, setFilteredPlans] = useState<PlanResponse[]>([]);
  const computeFilteredPlans = (): PlanResponse[] => {
    const v = bulkForm.getFieldsValue();
    if (v.plan_ids?.length) return plans.filter((p) => v.plan_ids.includes(p.id));
    if (v.plan_filter) return plans.filter((p) => p.name.toLowerCase().includes(v.plan_filter.toLowerCase()));
    return plans;
  };
  const updatePreview = () => {
    const v = bulkForm.getFieldsValue();
    const matched = computeFilteredPlans();
    setFilteredPlans(matched);
    setPreviewCount((v.av_ids?.length || 0) * (v.simulator_ids?.length || 0) * (v.sampler_ids?.length || 0) * matched.length);
    setConfirmed(false);
  };

  return (
    <>
      <Typography.Title level={3}>Tasks</Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openModal}>Create Task</Button>
        <Button type="primary" icon={<ThunderboltOutlined />} onClick={openBulkModal}>Bulk Create</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </Space>

      <div className="ag-theme-alpine" style={{ width: "100%", height: selectedTaskId ? "calc(50vh - 100px)" : "calc(100vh - 200px)" }}>
        <AgGridReact<TaskResponse>
          ref={gridRef}
          rowData={tasks}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          getRowId={(params) => String(params.data.id)}
          pagination
          paginationPageSize={50}
          animateRows={false}
          onGridReady={onGridReady}
          onRowClicked={onRowClicked}
          rowSelection="single"
         
        />
      </div>
      {selectedTaskId && (
        <Card
          title={`Task #${selectedTaskId} — Runs`}
          size="small"
          style={{ marginTop: 8 }}
          extra={<Button size="small" onClick={() => setSelectedTaskId(null)}>Close</Button>}
        >
          <TaskRunsPanel taskId={selectedTaskId} />
        </Card>
      )}

      {/* Single task modal */}
      <Modal title="Create Task" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="plan_id" label="Plan" rules={[{ required: true }]}>
            <Select options={plans.map((p) => ({ label: `${p.name} (#${p.id})`, value: p.id }))} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="av_id" label="AV" rules={[{ required: true }]}>
            <Select options={avs.map((a) => ({ label: `${a.name} (#${a.id})`, value: a.id }))} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="simulator_id" label="Simulator" rules={[{ required: true }]}>
            <Select options={simulators.map((s) => ({ label: `${s.name} (#${s.id})`, value: s.id }))} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="sampler_id" label="Sampler" rules={[{ required: true }]}>
            <Select options={samplers.map((s) => ({ label: `${s.name} (#${s.id})`, value: s.id }))} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={creating} block>Create</Button></Form.Item>
        </Form>
      </Modal>

      {/* Bulk create modal */}
      <Modal title="Bulk Create Tasks" open={bulkModalOpen} onCancel={() => { if (!creating) { setBulkModalOpen(false); setBulkProgress(null); } }} footer={null} width={640}>
        <Typography.Paragraph type="secondary">Creates tasks for every combination of selected AVs, Simulators, Samplers, and Plans.</Typography.Paragraph>
        <Form form={bulkForm} layout="vertical" onFinish={handleBulkCreate} onValuesChange={updatePreview}>
          <Form.Item name="av_ids" label="AVs" rules={[{ required: true, message: "Select at least one AV" }]}>
            <Select mode="multiple" options={avs.map((a) => ({ label: a.name, value: a.id }))} placeholder="Select AVs" />
          </Form.Item>
          <Form.Item name="simulator_ids" label="Simulators" rules={[{ required: true, message: "Select at least one Simulator" }]}>
            <Select mode="multiple" options={simulators.map((s) => ({ label: s.name, value: s.id }))} placeholder="Select Simulators" />
          </Form.Item>
          <Form.Item name="sampler_ids" label="Samplers" rules={[{ required: true, message: "Select at least one Sampler" }]}>
            <Select mode="multiple" options={samplers.map((s) => ({ label: s.name, value: s.id }))} placeholder="Select Samplers" />
          </Form.Item>
          <Form.Item name="plan_filter" label="Plan name filter (optional)">
            <Input placeholder="e.g. tyms, route, HetroD" allowClear />
          </Form.Item>
          <Form.Item name="plan_ids" label="Plans (leave empty to use all matching plans)">
            <Select mode="multiple" options={plans.map((p) => ({ label: `${p.name} (#${p.id})`, value: p.id }))} showSearch optionFilterProp="label" placeholder="All plans (or filter above)" maxTagCount={5} />
          </Form.Item>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}><Card size="small"><Statistic title="Matched plans" value={filteredPlans.length} /></Card></Col>
            <Col span={8}><Card size="small"><Statistic title="Total plans" value={plans.length} /></Card></Col>
            <Col span={8}><Card size="small"><Statistic title="Tasks to create" value={previewCount} /></Card></Col>
          </Row>
          {filteredPlans.length > 0 && (
            <Table dataSource={filteredPlans} columns={[
              { title: "ID", dataIndex: "id", key: "id", width: 60 },
              { title: "Plan Name", dataIndex: "name", key: "name", ellipsis: true },
              { title: "Map", dataIndex: "map_id", key: "map_id", width: 60 },
              { title: "Scenario", dataIndex: "scenario_id", key: "scenario_id", width: 80 },
            ]} rowKey="id" size="small" pagination={{ pageSize: 5, size: "small" }} style={{ marginBottom: 16 }} />
          )}
          {bulkProgress && (
            <div style={{ marginBottom: 16 }}>
              <Progress percent={Math.round((bulkProgress.done / bulkProgress.total) * 100)} status={bulkProgress.errors > 0 ? "exception" : "active"} />
              <Typography.Text>{bulkProgress.done}/{bulkProgress.total} created{bulkProgress.errors > 0 && <Typography.Text type="danger"> ({bulkProgress.errors} errors)</Typography.Text>}</Typography.Text>
            </div>
          )}
          {previewCount > 5000 && <Alert type="warning" message={`This will create ${previewCount.toLocaleString()} tasks.`} style={{ marginBottom: 16 }} />}
          <Form.Item style={{ marginBottom: 8 }}>
            <Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={previewCount === 0}>
              I confirm creating {previewCount.toLocaleString()} tasks
            </Checkbox>
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={creating} block disabled={previewCount === 0 || !confirmed}>
              Create {previewCount.toLocaleString()} Tasks
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
