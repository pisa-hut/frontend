import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Tag, Button, Modal, Form, Select, message, Typography, Space,
  Progress, Alert, Statistic, Card, Row, Col, Input, Checkbox, Table, Popconfirm, Tooltip,
} from "antd";
import {
  PlusOutlined, ReloadOutlined, ThunderboltOutlined,
  CaretRightOutlined, DeleteOutlined, StopOutlined, PushpinOutlined, SyncOutlined,
  FileTextOutlined, ClearOutlined,
} from "@ant-design/icons";
import type { FilterValue } from "antd/es/table/interface";
import { getColumnSearchProps } from "../components/ColumnSearch";
import LogDrawer from "../components/LogDrawer";
import PageHeader from "../components/PageHeader";
import TaskRunsPanel from "../components/TaskRunsPanel";
import { api } from "../api/client";
import { usePisaEvents } from "../api/events";
import type {
  TaskResponse, TaskStatus, TaskRunResponse, PlanResponse,
  AvResponse, SimulatorResponse, SamplerResponse, ExecutorResponse,
} from "../api/types";

const statusColors: Record<TaskStatus, string> = {
  idle: "default",
  queued: "warning",
  running: "processing",
  completed: "success",
  invalid: "error",
  aborted: "default",
};

// Everything that isn't currently queued or running is re-runnable.
const RUNNABLE_STATUSES: TaskStatus[] = ["idle", "completed", "invalid", "aborted"];
const STOPPABLE_STATUSES: TaskStatus[] = ["queued", "running"];

export default function Tasks() {
  const [searchParams] = useSearchParams();
  const defaultStatusFilter = useMemo(() => {
    const s = searchParams.get("status");
    return s ? [s] : undefined;
  }, []);

  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(new Set());
  const [expandedRows, setExpandedRows] = useState<React.Key[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);

  // Controlled filter state so one "Clear Filters" button can reset every
  // column at once (including the URL-driven default status filter).
  const [filteredInfo, setFilteredInfo] = useState<Record<string, FilterValue | null>>(
    () => ({ task_status: defaultStatusFilter ?? null }),
  );
  const hasActiveFilters = useMemo(
    () => Object.values(filteredInfo).some((v) => v != null && v.length > 0),
    [filteredInfo],
  );
  const clearFilters = useCallback(() => setFilteredInfo({}), []);

  // Log drawer: owned at the page level so both the row action button and
  // the timeline in TaskRunsPanel can open it, sharing one drawer.
  const [logRun, setLogRun] = useState<TaskRunResponse | null>(null);
  const [logExecutor, setLogExecutor] = useState<ExecutorResponse | undefined>();
  const [executorsById, setExecutorsById] = useState<Map<number, ExecutorResponse>>(new Map());

  const openLog = useCallback((run: TaskRunResponse, executor?: ExecutorResponse) => {
    setLogRun(run);
    setLogExecutor(executor ?? executorsById.get(run.executor_id));
  }, [executorsById]);

  // Increment a per-task counter on every expand so we can key the
  // TaskRunsPanel by it, forcing a real remount each time. Without this
  // AntD can preserve the panel's React instance across collapse+expand,
  // which lets stale state (e.g. a limit grown by "Show older") leak
  // into the next expand. We diff against a ref instead of nesting one
  // setState inside another's updater — that nested pattern is
  // unreliable under React 18's double-invocation.
  const prevExpandedRef = useRef<Set<number>>(new Set());
  const [expansionCounts, setExpansionCounts] = useState<Map<number, number>>(new Map());
  const handleExpandedChange = useCallback((keys: React.Key[]) => {
    const next = new Set(keys.map(Number));
    const added: number[] = [];
    for (const k of next) {
      if (!prevExpandedRef.current.has(k)) added.push(k);
    }
    prevExpandedRef.current = next;
    if (added.length > 0) {
      setExpansionCounts((counts) => {
        const out = new Map(counts);
        for (const k of added) out.set(k, (out.get(k) ?? 0) + 1);
        return out;
      });
    }
    setExpandedRows(keys);
  }, []);

  const [modalOpen, setModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  const [bulkForm] = Form.useForm();

  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [avs, setAvs] = useState<AvResponse[]>([]);
  const [simulators, setSimulators] = useState<SimulatorResponse[]>([]);
  const [samplers, setSamplers] = useState<SamplerResponse[]>([]);

  const [bulkProgress, setBulkProgress] = useState<{ total: number; done: number; errors: number } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [previewCount, setPreviewCount] = useState(0);
  const [filteredPlans, setFilteredPlans] = useState<PlanResponse[]>([]);

  // --- Data loading ---

  const load = () => {
    setLoading(true);
    api.listTasks().then(setTasks).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Realtime updates: coalesce bursty inserts/updates into a single refetch
  // per frame. SSE is always on — the Refresh button stays as a manual
  // re-fetch for the rare case where the stream silently went away.
  const refetchTimer = useRef<number | null>(null);
  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current !== null) return;
    refetchTimer.current = window.setTimeout(() => {
      refetchTimer.current = null;
      api.listTasks().then(setTasks);
    }, 250);
  }, []);
  usePisaEvents(useCallback((ev) => {
    if (ev.kind !== "row") return;
    if (ev.row.table === "task" || ev.row.table === "task_run") scheduleRefetch();
  }, [scheduleRefetch]));

  const fetchResources = () =>
    Promise.all([api.listPlans(), api.listAvs(), api.listSimulators(), api.listSamplers()])
      .then(([p, a, s, sa]) => { setPlans(p); setAvs(a); setSimulators(s); setSamplers(sa); });

  useEffect(() => { fetchResources(); }, []);

  // One-shot executor cache for the log drawer title (hostname).
  useEffect(() => {
    api.listExecutors().then((all) => {
      setExecutorsById(new Map(all.map((e) => [e.id, e])));
    });
  }, []);

  const planMap = useMemo(() => new Map(plans.map((p) => [p.id, p.name])), [plans]);
  const avMap = useMemo(() => new Map(avs.map((a) => [a.id, a.name])), [avs]);
  const simMap = useMemo(() => new Map(simulators.map((s) => [s.id, s.name])), [simulators]);
  const samplerMap = useMemo(() => new Map(samplers.map((s) => [s.id, s.name])), [samplers]);

  // --- Actions ---

  const handleRun = async (id: number) => {
    try { await api.updateTask(id, { task_status: "queued" }); message.success(`Task #${id} queued`); load(); }
    catch (e) { message.error(String(e)); }
  };

  const handleStop = async (id: number) => {
    try { await api.stopTask(id); message.success(`Task #${id} stopped`); load(); }
    catch (e) { message.error(String(e)); }
  };

  const handleBulkRun = async () => {
    const ids = tasks.filter((t) => selectedRowKeys.includes(t.id) && RUNNABLE_STATUSES.includes(t.task_status)).map((t) => t.id);
    try { await api.batchRunTasks(ids); message.success(`Queued ${ids.length} tasks`); }
    catch (e) { message.error(String(e)); }
    setSelectedRowKeys([]); load();
  };

  const handleBulkStop = async () => {
    const ids = tasks.filter((t) => selectedRowKeys.includes(t.id) && STOPPABLE_STATUSES.includes(t.task_status)).map((t) => t.id);
    try { await api.batchStopTasks(ids); message.success(`Stopped ${ids.length} tasks`); }
    catch (e) { message.error(String(e)); }
    setSelectedRowKeys([]); load();
  };

  const handleBulkDelete = async () => {
    try { await api.batchDeleteTasks(selectedRowKeys as number[]); message.success(`Deleted ${selectedRowKeys.length} tasks`); }
    catch (e) { message.error(String(e)); }
    setSelectedRowKeys([]); load();
  };

  // --- Create ---

  const handleCreate = async (values: { plan_id: number; av_id: number; simulator_id: number; sampler_id: number }) => {
    setCreating(true);
    try {
      await api.createTask({ ...values, task_status: "idle" });
      message.success("Task created"); setModalOpen(false); form.resetFields(); load();
    } catch (e) { message.error(String(e)); } finally { setCreating(false); }
  };

  // --- Bulk create ---

  const handleBulkCreate = async (values: { av_ids: number[]; simulator_ids: number[]; sampler_ids: number[]; plan_ids: number[]; plan_filter?: string }) => {
    const selectedPlans = values.plan_ids?.length ? values.plan_ids
      : plans.filter((p) => values.plan_filter ? p.name.toLowerCase().includes(values.plan_filter.toLowerCase()) : true).map((p) => p.id);
    const combos: Partial<TaskResponse>[] = [];
    for (const av_id of values.av_ids)
      for (const simulator_id of values.simulator_ids)
        for (const sampler_id of values.sampler_ids)
          for (const plan_id of selectedPlans)
            combos.push({ plan_id, av_id, simulator_id, sampler_id, task_status: "idle" });
    if (!combos.length) { message.warning("No combinations"); return; }
    setCreating(true); setBulkProgress({ total: combos.length, done: 0, errors: 0 });
    try {
      const { done, errors } = await api.batchCreateTasks(combos, (d, e, t) =>
        setBulkProgress({ total: t, done: d, errors: e }),
      );
      if (errors === 0) {
        message.success(`Created ${done} tasks`);
      } else {
        message.warning(`Created ${done}, ${errors} failed`);
      }
    } catch (e) {
      message.error(String(e));
    } finally {
      setCreating(false);
      setBulkModalOpen(false); bulkForm.resetFields(); setBulkProgress(null); load();
    }
  };

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

  // --- Columns ---

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60, ellipsis: true,
      sorter: (a: TaskResponse, b: TaskResponse) => a.id - b.id },
    { title: "Plan", dataIndex: "plan_id", key: "plan_id", width: 250, ellipsis: true,
      render: (id: number) => planMap.get(id) ?? `#${id}`,
      filteredValue: filteredInfo.plan_id ?? null,
      ...getColumnSearchProps<TaskResponse>("plan_id", (r) => planMap.get(r.plan_id) ?? "") },
    { title: "AV", dataIndex: "av_id", key: "av_id", width: 100, ellipsis: true,
      render: (id: number) => avMap.get(id) ?? `#${id}`,
      filters: avs.map((a) => ({ text: a.name, value: a.id })),
      filteredValue: filteredInfo.av_id ?? null,
      onFilter: (value: unknown, record: TaskResponse) => record.av_id === value },
    { title: "Simulator", dataIndex: "simulator_id", key: "simulator_id", width: 100, ellipsis: true,
      render: (id: number) => simMap.get(id) ?? `#${id}`,
      filters: simulators.map((s) => ({ text: s.name, value: s.id })),
      filteredValue: filteredInfo.simulator_id ?? null,
      onFilter: (value: unknown, record: TaskResponse) => record.simulator_id === value },
    { title: "Sampler", dataIndex: "sampler_id", key: "sampler_id", width: 80, ellipsis: true,
      render: (id: number) => samplerMap.get(id) ?? `#${id}`,
      filters: samplers.map((s) => ({ text: s.name, value: s.id })),
      filteredValue: filteredInfo.sampler_id ?? null,
      onFilter: (value: unknown, record: TaskResponse) => record.sampler_id === value },
    { title: "Status", dataIndex: "task_status", key: "task_status", width: 110,
      filters: (["idle", "queued", "running", "completed", "invalid", "aborted"] as TaskStatus[]).map((s) => ({ text: s, value: s })),
      filteredValue: filteredInfo.task_status ?? null,
      onFilter: (value: unknown, record: TaskResponse) => record.task_status === value,
      render: (status: TaskStatus) => (
        <Tag color={statusColors[status]} icon={status === "running" ? <SyncOutlined spin /> : undefined}>
          {status.toUpperCase()}
        </Tag>
      ) },
    { title: "Attempts", dataIndex: "attempt_count", key: "attempt_count", width: 70,
      sorter: (a: TaskResponse, b: TaskResponse) => a.attempt_count - b.attempt_count },
    { title: "Last Run", key: "last_run", width: 170,
      render: (_: unknown, r: TaskResponse) => { const t = r.task_run?.[0]?.started_at; return t ? new Date(t).toLocaleString() : "-"; },
      sorter: (a: TaskResponse, b: TaskResponse) => (a.task_run?.[0]?.started_at ? new Date(a.task_run[0].started_at).getTime() : 0) - (b.task_run?.[0]?.started_at ? new Date(b.task_run[0].started_at).getTime() : 0),
      defaultSortOrder: "descend" as const },
    { title: "", key: "actions", width: 116, fixed: "right" as const, render: (_: unknown, record: TaskResponse) => {
      const canRun = RUNNABLE_STATUSES.includes(record.task_status);
      const canStop = STOPPABLE_STATUSES.includes(record.task_status);
      const isPinned = pinnedIds.has(record.id);
      const latestRun = record.task_run?.[0];
      // Swallow row-level clicks so any action button (log / pin / run /
      // stop / its Popconfirm popup) doesn't also trigger the row's
      // expandRowByClick handler.
      return (
        <Space size={2} onClick={(e) => e.stopPropagation()}>
          <Tooltip title={latestRun ? `Log · attempt #${latestRun.attempt}` : "No run yet"}>
            <Button
              size="small"
              icon={<FileTextOutlined />}
              disabled={!latestRun}
              onClick={() => latestRun && openLog(latestRun)}
            />
          </Tooltip>
          <Tooltip title={isPinned ? "Unpin" : "Pin"}>
            <Button
              size="small"
              type={isPinned ? "primary" : "default"}
              icon={<PushpinOutlined />}
              onClick={() => {
                setPinnedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(record.id)) next.delete(record.id);
                  else next.add(record.id);
                  return next;
                });
              }}
            />
          </Tooltip>
          {canStop ? (
            <Popconfirm title="Stop?" onConfirm={() => handleStop(record.id)}>
              <Tooltip title="Stop">
                <Button size="small" icon={<StopOutlined />} />
              </Tooltip>
            </Popconfirm>
          ) : (
            <Popconfirm title="Run?" onConfirm={() => handleRun(record.id)} disabled={!canRun}>
              <Tooltip title={canRun ? "Run" : "Not runnable in this state"}>
                <Button size="small" type="primary" icon={<CaretRightOutlined />} disabled={!canRun} />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      );
    }},
  ];

  // --- Selection bar ---

  const selectionBar = selectedRowKeys.length > 0 && (() => {
    const selected = tasks.filter((t) => selectedRowKeys.includes(t.id));
    const allSelected = selectedRowKeys.length === tasks.length;
    const runnableCount = selected.filter((t) => RUNNABLE_STATUSES.includes(t.task_status)).length;
    const stoppableCount = selected.filter((t) => STOPPABLE_STATUSES.includes(t.task_status)).length;
    return (
      <Alert type="info" showIcon={false} style={{ marginBottom: 8, padding: "6px 12px" }} message={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <Space>
            <Typography.Text strong>{selectedRowKeys.length} selected</Typography.Text>
            {!allSelected ? (
              <Button size="small" type="link" style={{ padding: 0 }} onClick={() => setSelectedRowKeys(tasks.map((t) => t.id))}>Select all {tasks.length}</Button>
            ) : (
              <Button size="small" type="link" style={{ padding: 0 }} onClick={() => setSelectedRowKeys([])}>Deselect all</Button>
            )}
          </Space>
          <Space>
            {runnableCount > 0 && <Popconfirm title={`Run ${runnableCount}?`} onConfirm={handleBulkRun}><Button size="small" type="primary" icon={<CaretRightOutlined />}>Run {runnableCount}</Button></Popconfirm>}
            {stoppableCount > 0 && <Popconfirm title={`Stop ${stoppableCount}?`} onConfirm={handleBulkStop}><Button size="small" icon={<StopOutlined />}>Stop {stoppableCount}</Button></Popconfirm>}
            <Popconfirm title={`Delete ${selectedRowKeys.length}?`} onConfirm={handleBulkDelete}><Button size="small" danger icon={<DeleteOutlined />}>Delete {selectedRowKeys.length}</Button></Popconfirm>
            <Button size="small" onClick={() => setSelectedRowKeys([])}>Clear</Button>
          </Space>
        </div>
      } />
    );
  })();

  return (
    <>
      <PageHeader title="Tasks">
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { fetchResources().then(() => setModalOpen(true)); }}>Create</Button>
        <Button icon={<ThunderboltOutlined />} onClick={() => { fetchResources().then(() => { setConfirmed(false); setFilteredPlans([]); setPreviewCount(0); setBulkModalOpen(true); }); }}>Bulk Create</Button>
        <Button icon={<ClearOutlined />} onClick={clearFilters} disabled={!hasActiveFilters}>Clear Filters</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </PageHeader>

      {selectionBar}

      {pinnedIds.size > 0 && (
        <Table
          dataSource={tasks.filter((t) => pinnedIds.has(t.id))}
          columns={columns}
          rowKey="id"
          size="small"
          scroll={{ x: "max-content" }}
          pagination={false}
          rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys) }}
          onChange={(_p, filters) => setFilteredInfo(filters)}
          expandable={{
            expandedRowRender: (r: TaskResponse) => (
              <TaskRunsPanel
                key={`${r.id}-${expansionCounts.get(r.id) ?? 0}`}
                taskId={r.id}
                onOpenLog={openLog}
              />
            ),
            expandedRowKeys: expandedRows,
            showExpandColumn: false,
            expandRowByClick: true,
            onExpandedRowsChange: (keys) => handleExpandedChange(keys as React.Key[]),
          }}
          style={{ marginBottom: 8 }}
        />
      )}

      <Table
        dataSource={tasks.filter((t) => !pinnedIds.has(t.id))}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: "max-content" }}
        pagination={{ current: currentPage, pageSize, showSizeChanger: true, showTotal: (t) => `${t} tasks`, onChange: (p, s) => { setCurrentPage(p); setPageSize(s); } }}
        rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys) }}
        onChange={(_p, filters) => setFilteredInfo(filters)}
        expandable={{
          expandedRowRender: (r: TaskResponse) => (
            <TaskRunsPanel
              key={`${r.id}-${expansionCounts.get(r.id) ?? 0}`}
              taskId={r.id}
              onOpenLog={openLog}
            />
          ),
          expandedRowKeys: expandedRows,
          showExpandColumn: false,
          expandRowByClick: true,
          onExpandedRowsChange: (keys) => handleExpandedChange(keys as React.Key[]),
        }}
      />

      {/* Single create */}
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

      {/* Bulk create */}
      <Modal title="Bulk Create Tasks" open={bulkModalOpen} onCancel={() => { if (!creating) { setBulkModalOpen(false); setBulkProgress(null); } }} footer={null} width={640}>
        <Typography.Paragraph type="secondary">Creates tasks for every combination of selected AVs, Simulators, Samplers, and Plans.</Typography.Paragraph>
        <Form form={bulkForm} layout="vertical" onFinish={handleBulkCreate} onValuesChange={updatePreview}>
          <Form.Item name="av_ids" label="AVs" rules={[{ required: true }]}>
            <Select mode="multiple" options={avs.map((a) => ({ label: a.name, value: a.id }))} placeholder="Select AVs" />
          </Form.Item>
          <Form.Item name="simulator_ids" label="Simulators" rules={[{ required: true }]}>
            <Select mode="multiple" options={simulators.map((s) => ({ label: s.name, value: s.id }))} placeholder="Select Simulators" />
          </Form.Item>
          <Form.Item name="sampler_ids" label="Samplers" rules={[{ required: true }]}>
            <Select mode="multiple" options={samplers.map((s) => ({ label: s.name, value: s.id }))} placeholder="Select Samplers" />
          </Form.Item>
          <Form.Item name="plan_filter" label="Plan name filter">
            <Input placeholder="e.g. tyms, route" allowClear />
          </Form.Item>
          <Form.Item name="plan_ids" label="Plans (leave empty for all matching)">
            <Select mode="multiple" options={plans.map((p) => ({ label: `${p.name} (#${p.id})`, value: p.id }))} showSearch optionFilterProp="label" placeholder="All plans" maxTagCount={5} />
          </Form.Item>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}><Card size="small"><Statistic title="Matched" value={filteredPlans.length} /></Card></Col>
            <Col span={8}><Card size="small"><Statistic title="Total plans" value={plans.length} /></Card></Col>
            <Col span={8}><Card size="small"><Statistic title="Tasks" value={previewCount} /></Card></Col>
          </Row>
          {filteredPlans.length > 0 && (
            <Table dataSource={filteredPlans} columns={[
              { title: "ID", dataIndex: "id", key: "id", width: 60 },
              { title: "Name", dataIndex: "name", key: "name", ellipsis: true },
              { title: "Map", dataIndex: "map_id", key: "map_id", width: 60 },
            ]} rowKey="id" size="small" pagination={{ pageSize: 5, size: "small" }} style={{ marginBottom: 16 }} />
          )}
          {bulkProgress && (
            <div style={{ marginBottom: 16 }}>
              <Progress percent={Math.round((bulkProgress.done / bulkProgress.total) * 100)} status={bulkProgress.errors > 0 ? "exception" : "active"} />
              <Typography.Text>{bulkProgress.done}/{bulkProgress.total}{bulkProgress.errors > 0 && <Typography.Text type="danger"> ({bulkProgress.errors} errors)</Typography.Text>}</Typography.Text>
            </div>
          )}
          {previewCount > 5000 && <Alert type="warning" message={`This will create ${previewCount.toLocaleString()} tasks.`} style={{ marginBottom: 16 }} />}
          <Form.Item style={{ marginBottom: 8 }}>
            <Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={!previewCount}>
              I confirm creating {previewCount.toLocaleString()} tasks
            </Checkbox>
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={creating} block disabled={!previewCount || !confirmed}>
              Create {previewCount.toLocaleString()} Tasks
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      <LogDrawer
        run={logRun}
        executor={logExecutor}
        onClose={() => setLogRun(null)}
      />
    </>
  );
}
