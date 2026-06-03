import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  message,
  Row,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { ArrowLeftOutlined, EyeOutlined, ReloadOutlined } from "@ant-design/icons";
import PageHeader from "../components/PageHeader";
import { api } from "../api/client";
import { usePisaEvents } from "../api/events";
import type {
  AvResponse,
  ConcreteRunResponse,
  ConcreteRunStatus,
  ExecutorResponse,
  MonitorResponse,
  PlanResponse,
  SamplerResponse,
  SimulatorResponse,
  TaskResponse,
  TaskRunResponse,
} from "../api/types";
import { TASK_STATUS_TAG_COLOR, TASK_STATUS_LABEL } from "../constants/status";

const TaskRunsPanel = lazy(() => import("../components/TaskRunsPanel"));
const LogDrawer = lazy(() => import("../components/LogDrawer"));
const ScenarioDetailDrawer = lazy(() => import("../components/ScenarioDetailDrawer"));

const CONCRETE_STATUS_COLOR: Record<ConcreteRunStatus, string> = {
  finished: "success",
  failed: "error",
  aborted: "warning",
  skipped: "default",
};

function fmtMs(ms: number | null): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function compactJson(value: Record<string, unknown> | null): string {
  if (!value || Object.keys(value).length === 0) return "-";
  return JSON.stringify(value);
}

export default function TaskDetail() {
  const taskId = Number(useParams().taskId);
  const [task, setTask] = useState<TaskResponse | null>(null);
  const [concretes, setConcretes] = useState<ConcreteRunResponse[]>([]);
  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [avs, setAvs] = useState<AvResponse[]>([]);
  const [simulators, setSimulators] = useState<SimulatorResponse[]>([]);
  const [samplers, setSamplers] = useState<SamplerResponse[]>([]);
  const [monitors, setMonitors] = useState<MonitorResponse[]>([]);
  const [logRun, setLogRun] = useState<TaskRunResponse | null>(null);
  const [logExecutor, setLogExecutor] = useState<ExecutorResponse | undefined>();
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!Number.isFinite(taskId)) return;
    setLoading(true);
    try {
      const [taskRow, concreteRows] = await Promise.all([
        api.getTask(taskId),
        api.listConcreteRunsForTask(taskId),
      ]);
      setTask(taskRow);
      setConcretes(concreteRows);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    Promise.all([
      api.listPlans(),
      api.listAvs(),
      api.listSimulators(),
      api.listSamplers(),
      api.listMonitors(),
    ])
      .then(([planRows, avRows, simRows, samplerRows, monitorRows]) => {
        setPlans(planRows);
        setAvs(avRows);
        setSimulators(simRows);
        setSamplers(samplerRows);
        setMonitors(monitorRows);
      })
      .catch((e) => message.error(String(e)));
  }, []);

  usePisaEvents(
    useCallback(
      (ev) => {
        if (ev.kind !== "row") return;
        if (["task", "task_run", "concrete_run"].includes(ev.row.table)) load();
      },
      [load],
    ),
    useMemo(
      () => ({ kinds: ["row"] as const, rowTables: ["task", "task_run", "concrete_run"] as const }),
      [],
    ),
  );

  const names = useMemo(() => {
    const byId = <T extends { id: number; name: string }>(rows: T[]) =>
      new Map(rows.map((r) => [r.id, r.name]));
    return {
      plans: byId(plans),
      avs: byId(avs),
      simulators: byId(simulators),
      samplers: byId(samplers),
      monitors: byId(monitors),
    };
  }, [plans, avs, simulators, samplers, monitors]);

  const currentPlan = useMemo(
    () => plans.find((p) => p.id === task?.plan_id) ?? null,
    [plans, task?.plan_id],
  );

  const counts = useMemo(() => {
    const out = { finished: 0, failed: 0, aborted: 0, skipped: 0 };
    for (const row of concretes) out[row.status] += 1;
    return out;
  }, [concretes]);

  const columns: ColumnsType<ConcreteRunResponse> = [
    {
      title: "Concrete",
      dataIndex: "concrete_key",
      width: 160,
      render: (v: string) => <Typography.Text code>{v}</Typography.Text>,
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 110,
      render: (v: ConcreteRunStatus) => <Tag color={CONCRETE_STATUS_COLOR[v]}>{v}</Tag>,
    },
    {
      title: "Outcome",
      dataIndex: "test_outcome",
      width: 110,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: "Reason",
      dataIndex: "reason",
      ellipsis: true,
      render: (v: string | null, r) => v || r.stop_condition || "-",
    },
    {
      title: "Params",
      dataIndex: "params",
      ellipsis: true,
      render: (v: Record<string, unknown> | null) => (
        <Typography.Text code ellipsis={{ tooltip: compactJson(v) }}>
          {compactJson(v)}
        </Typography.Text>
      ),
    },
    { title: "Sim Time", dataIndex: "final_sim_time_ms", width: 110, render: fmtMs },
    { title: "Wall Time", dataIndex: "wall_time_ms", width: 110, render: fmtMs },
    { title: "Steps", dataIndex: "total_steps", width: 90, render: (v: number | null) => v ?? "-" },
    {
      title: "Recorded",
      dataIndex: "created_at",
      width: 170,
      render: (v: string) => new Date(v).toLocaleString(),
    },
  ];

  if (!Number.isFinite(taskId)) {
    return <Alert type="error" message="Invalid task id" />;
  }

  return (
    <div>
      <PageHeader title={`Task #${taskId}`}>
        <Link to="/tasks">
          <Button icon={<ArrowLeftOutlined />}>Tasks</Button>
        </Link>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          Refresh
        </Button>
      </PageHeader>

      {task ? (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Card>
            <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="small">
              <Descriptions.Item label="Status">
                <Tag color={TASK_STATUS_TAG_COLOR[task.task_status]}>
                  {TASK_STATUS_LABEL[task.task_status]}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Plan">
                {names.plans.get(task.plan_id) ?? `#${task.plan_id}`}
              </Descriptions.Item>
              <Descriptions.Item label="Scenario">
                <Space size={8} wrap>
                  <Typography.Text>
                    {currentPlan ? `#${currentPlan.scenario_id}` : "-"}
                  </Typography.Text>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    disabled={!currentPlan}
                    onClick={() => setScenarioOpen(true)}
                  >
                    Preview
                  </Button>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="AV">
                {names.avs.get(task.av_id) ?? `#${task.av_id}`}
              </Descriptions.Item>
              <Descriptions.Item label="Simulator">
                {names.simulators.get(task.simulator_id) ?? `#${task.simulator_id}`}
              </Descriptions.Item>
              <Descriptions.Item label="Sampler">
                {names.samplers.get(task.sampler_id) ?? `#${task.sampler_id}`}
              </Descriptions.Item>
              <Descriptions.Item label="Monitor">
                {names.monitors.get(task.monitor_id) ?? `#${task.monitor_id}`}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Row gutter={[16, 16]}>
            {Object.entries(counts).map(([status, count]) => (
              <Col xs={12} md={6} key={status}>
                <Card size="small">
                  <Typography.Text type="secondary">{status}</Typography.Text>
                  <Typography.Title level={3} style={{ margin: 0 }}>
                    {count}
                  </Typography.Title>
                </Card>
              </Col>
            ))}
          </Row>

          <Card title="Attempts">
            <Suspense fallback={null}>
              <TaskRunsPanel
                taskId={taskId}
                onOpenLog={(run, executor) => {
                  setLogRun(run);
                  setLogExecutor(executor);
                }}
              />
            </Suspense>
          </Card>

          <Card title="Concrete Runs">
            <Table
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={concretes}
              size="small"
              scroll={{ x: 1100 }}
              pagination={{ pageSize: 25, showSizeChanger: true }}
            />
          </Card>
        </Space>
      ) : (
        <Alert type="warning" message={loading ? "Loading task..." : `Task #${taskId} not found`} />
      )}

      <Suspense fallback={null}>
        <LogDrawer
          run={logRun}
          executor={logExecutor}
          task={task ?? undefined}
          taskLabel={task ? (names.plans.get(task.plan_id) ?? `#${task.plan_id}`) : undefined}
          onClose={() => setLogRun(null)}
        />
        <ScenarioDetailDrawer
          open={scenarioOpen}
          scenarioId={currentPlan?.scenario_id ?? null}
          title={currentPlan ? `Scenario #${currentPlan.scenario_id}` : "Scenario"}
          onClose={() => setScenarioOpen(false)}
        />
      </Suspense>
    </div>
  );
}
