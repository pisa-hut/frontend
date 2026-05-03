import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Space,
  Statistic,
  Spin,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  CheckCircleOutlined,
  SyncOutlined,
  ClockCircleOutlined,
  PlusCircleOutlined,
  WarningOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { api } from "../api/client";
import { usePisaEvents } from "../api/events";
import type {
  TaskResponse,
  TaskStatus,
  ExecutorResponse,
  AvResponse,
  SimulatorResponse,
  SamplerResponse,
  PlanResponse,
} from "../api/types";
import { TASK_STATUS_HEX, TASK_STATUS_LABEL } from "../constants/status";

// Hex colour and label come from the shared constants; the icon is a
// React node so it stays here (constants are plain TS).
const statusIcon: Record<TaskStatus, React.ReactNode> = {
  idle: <PlusCircleOutlined />,
  queued: <ClockCircleOutlined />,
  running: <SyncOutlined spin />,
  completed: <CheckCircleOutlined />,
  invalid: <WarningOutlined />,
  aborted: <StopOutlined />,
};

interface AbortedStats {
  total: number;
  last24h: number;
}

async function fetchAbortedStats(): Promise<AbortedStats> {
  const POSTGREST = import.meta.env.VITE_POSTGREST_URL ?? "/postgrest";
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const fetchCount = async (url: string): Promise<number> => {
    const res = await fetch(url, {
      method: "HEAD",
      headers: {
        Accept: "application/json",
        Prefer: "count=exact",
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch aborted stats: ${res.status} ${res.statusText}`);
    }

    const contentRange = res.headers.get("Content-Range");
    const match = contentRange?.match(/\/(\d+)$/);

    if (!match) {
      throw new Error("Failed to fetch aborted stats: missing or invalid Content-Range header");
    }

    return Number.parseInt(match[1], 10);
  };

  const [total, last24h] = await Promise.all([
    fetchCount(`${POSTGREST}/task_run?task_run_status=eq.aborted`),
    fetchCount(
      `${POSTGREST}/task_run?task_run_status=eq.aborted&finished_at=gte.${encodeURIComponent(cutoff)}`,
    ),
  ]);

  return {
    total,
    last24h,
  };
}

function formatRuntime(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  if (ms < 0) return "-";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

const STATUS_ORDER: TaskStatus[] = ["completed", "running", "queued", "idle", "invalid", "aborted"];

/** Inline SVG donut. Segments are drawn in `STATUS_ORDER` so the
 *  same colour always sits in the same position around the ring,
 *  making it easy to compare two donuts side-by-side. */
function StatusDonut({
  counts,
  size = 84,
  strokeWidth = 12,
}: {
  counts: Record<TaskStatus, number>;
  size?: number;
  strokeWidth?: number;
}) {
  const total = STATUS_ORDER.reduce((acc, s) => acc + counts[s], 0);
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Background ring so a near-empty donut still has shape. */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#f0f0f0"
        strokeWidth={strokeWidth}
      />
      {total > 0 &&
        STATUS_ORDER.map((s) => {
          const v = counts[s];
          if (v === 0) return null;
          const len = (v / total) * c;
          const seg = (
            <circle
              key={s}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={TASK_STATUS_HEX[s]}
              strokeWidth={strokeWidth}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-acc}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          acc += len;
          return seg;
        })}
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontSize: 14, fontWeight: 600, fill: "#262626" }}
      >
        {total}
      </text>
    </svg>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [aborted, setAborted] = useState<AbortedStats>({ total: 0, last24h: 0 });
  const [executors, setExecutors] = useState<ExecutorResponse[]>([]);
  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [avs, setAvs] = useState<AvResponse[]>([]);
  const [simulators, setSimulators] = useState<SimulatorResponse[]>([]);
  const [samplers, setSamplers] = useState<SamplerResponse[]>([]);
  const [loading, setLoading] = useState(true);
  // Tick once a minute so the "Runtime" column ages without needing
  // a full refetch. (Cheap — only the running-tasks table re-renders.)
  const [, setNow] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setNow((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const load = useCallback(() => {
    return Promise.all([
      api.listTasks(),
      fetchAbortedStats(),
      api.listExecutors(),
      api.listPlans(),
      api.listAvs(),
      api.listSimulators(),
      api.listSamplers(),
    ]).then(([t, a, e, p, av, sim, sam]) => {
      setTasks(t);
      setAborted(a);
      setExecutors(e);
      setPlans(p);
      setAvs(av);
      setSimulators(sim);
      setSamplers(sam);
    });
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // SSE: debounced refetch on any task / task_run change.
  const refetchTimer = useRef<number | null>(null);
  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current !== null) return;
    refetchTimer.current = window.setTimeout(() => {
      refetchTimer.current = null;
      load();
    }, 250);
  }, [load]);
  usePisaEvents(
    useCallback(
      (ev) => {
        if (ev.kind !== "row") return;
        if (ev.row.table === "task" || ev.row.table === "task_run") {
          scheduleRefetch();
        }
      },
      [scheduleRefetch],
    ),
  );
  useEffect(() => {
    return () => {
      if (refetchTimer.current !== null) {
        window.clearTimeout(refetchTimer.current);
        refetchTimer.current = null;
      }
    };
  }, []);

  // ALL hooks must be called before any early return, or React detects
  // a hook-count mismatch the first time `loading` flips false. The
  // earlier version put useMemo *after* the loading guard and broke
  // the page on first SSE refresh.
  const counts: Record<TaskStatus, number> = useMemo(() => {
    const c: Record<TaskStatus, number> = {
      idle: 0,
      queued: 0,
      running: 0,
      completed: 0,
      invalid: 0,
      aborted: 0,
    };
    for (const t of tasks) c[t.task_status]++;
    return c;
  }, [tasks]);

  // "Needs your attention" surface: pulls users into the right view
  // instead of leaving them to count tiles. Triage = invalid+!archived
  // (matches the chip on the Tasks page). Stuck = currently running
  // for over 2h, often a SLURM job that never reached the executor.
  const triageCount = useMemo(
    () => tasks.filter((t) => t.task_status === "invalid" && !t.archived).length,
    [tasks],
  );
  const stuckCount = useMemo(() => {
    const cutoff = Date.now() - 2 * 3600 * 1000;
    return tasks.filter((t) => {
      if (t.task_status !== "running") return false;
      const startedAt = t.task_run?.[0]?.started_at;
      if (!startedAt) return false;
      return new Date(startedAt).getTime() < cutoff;
    }).length;
  }, [tasks]);

  const planMap = useMemo(() => new Map(plans.map((p) => [p.id, p.name])), [plans]);
  const avMap = useMemo(() => new Map(avs.map((a) => [a.id, a.name])), [avs]);
  const simMap = useMemo(() => new Map(simulators.map((s) => [s.id, s.name])), [simulators]);
  const samplerMap = useMemo(() => new Map(samplers.map((s) => [s.id, s.name])), [samplers]);
  const executorMap = useMemo(() => new Map(executors.map((e) => [e.id, e])), [executors]);

  // The "Currently running" panel: every task with status=running
  // joined to its latest task_run for executor + start time. Sorted
  // longest-running first because that's the row most likely to be
  // stuck and most worth glancing at.
  const runningRows = useMemo(() => {
    return tasks
      .filter((t) => t.task_status === "running" && t.task_run?.[0])
      .map((t) => {
        const run = t.task_run![0];
        return {
          taskId: t.id,
          runId: run.id,
          attempt: run.attempt,
          plan: planMap.get(t.plan_id) ?? `#${t.plan_id}`,
          av: avMap.get(t.av_id) ?? `#${t.av_id}`,
          sim: simMap.get(t.simulator_id) ?? `#${t.simulator_id}`,
          sampler: samplerMap.get(t.sampler_id) ?? `#${t.sampler_id}`,
          executor: executorMap.get(run.executor_id),
          startedAt: run.started_at ?? "",
        };
      })
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
  }, [tasks, planMap, avMap, simMap, samplerMap, executorMap]);

  // Distinct executors actually serving a running task right now —
  // gives a quick "how many machines are busy" glance without
  // needing to count rows above.
  const busyExecutorCount = useMemo(
    () => new Set(runningRows.map((r) => r.executor?.id).filter((id) => id != null)).size,
    [runningRows],
  );

  // Group tasks by AV/Sim/Sampler combo and tally by status. Donut
  // grid below renders the top SETUP_DONUT_LIMIT busiest combos so
  // the dashboard surface stays bounded; remainder is summarised in
  // a "+ N more" footer.
  const SETUP_DONUT_LIMIT = 8;
  const setupGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        avId: number;
        simId: number;
        samplerId: number;
        counts: Record<TaskStatus, number>;
        total: number;
      }
    >();
    for (const t of tasks) {
      if (t.archived) continue;
      const key = `${t.av_id}-${t.simulator_id}-${t.sampler_id}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          avId: t.av_id,
          simId: t.simulator_id,
          samplerId: t.sampler_id,
          counts: { idle: 0, queued: 0, running: 0, completed: 0, invalid: 0, aborted: 0 },
          total: 0,
        };
        map.set(key, g);
      }
      g.counts[t.task_status]++;
      g.total++;
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [tasks]);
  const visibleSetupGroups = setupGroups.slice(0, SETUP_DONUT_LIMIT);
  const hiddenSetupCount = Math.max(0, setupGroups.length - SETUP_DONUT_LIMIT);

  if (loading)
    return (
      <Spin size="large" style={{ display: "flex", justifyContent: "center", marginTop: 80 }} />
    );

  return (
    <>
      <PageHeader title="Dashboard" />

      {(triageCount > 0 || stuckCount > 0) && (
        <Space direction="vertical" size={8} style={{ width: "100%", marginBottom: 12 }}>
          {triageCount > 0 && (
            <Alert
              type="warning"
              showIcon
              message={
                <Space>
                  <Typography.Text strong>
                    {triageCount} invalid task{triageCount === 1 ? "" : "s"}
                  </Typography.Text>
                  <Typography.Text>
                    waiting for triage — fix the root cause and re-Run, or Archive.
                  </Typography.Text>
                </Space>
              }
              action={
                <Button size="small" type="primary" onClick={() => navigate("/tasks?triage=1")}>
                  Triage now
                </Button>
              }
            />
          )}
          {stuckCount > 0 && (
            <Alert
              type="info"
              showIcon
              message={
                <Space>
                  <Typography.Text strong>
                    {stuckCount} task{stuckCount === 1 ? "" : "s"}
                  </Typography.Text>
                  <Typography.Text>running for &gt; 2h — possibly stuck.</Typography.Text>
                </Space>
              }
              action={
                <Button size="small" onClick={() => navigate("/tasks?status=running")}>
                  Show
                </Button>
              }
            />
          )}
        </Space>
      )}

      <Row gutter={[12, 12]}>
        {(Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((status) => (
          <Col xs={8} sm={8} md={4} key={status}>
            <Card
              hoverable
              size="small"
              onClick={() => navigate(`/tasks?status=${status}`)}
              style={{ cursor: "pointer", textAlign: "center" }}
              styles={{ body: { padding: "12px 8px" } }}
            >
              <Statistic
                title={TASK_STATUS_LABEL[status]}
                value={counts[status]}
                prefix={statusIcon[status]}
                valueStyle={{ color: TASK_STATUS_HEX[status], fontSize: 24 }}
              />
            </Card>
          </Col>
        ))}
      </Row>
      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} md={12}>
          <Card size="small" styles={{ body: { padding: "12px 16px" } }}>
            <Statistic title="Total Tasks" value={tasks.length} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card size="small" styles={{ body: { padding: "12px 16px" } }}>
            <Statistic
              title={
                <span>
                  <StopOutlined style={{ marginRight: 4 }} />
                  Aborted runs (last 24 h)
                </span>
              }
              value={aborted.last24h}
              suffix={
                <Typography.Text type="secondary" style={{ fontSize: 13, marginLeft: 8 }}>
                  / {aborted.total} total
                </Typography.Text>
              }
              valueStyle={{ color: aborted.last24h > 0 ? "#ff7875" : undefined, fontSize: 22 }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        style={{ marginTop: 12 }}
        title={
          <Space size={8}>
            <SyncOutlined
              spin={runningRows.length > 0}
              style={{ color: TASK_STATUS_HEX.running }}
            />
            <Typography.Text strong>Currently Running</Typography.Text>
            <Tag color="blue">{runningRows.length} tasks</Tag>
            <Tag>
              {busyExecutorCount} busy executors / {executors.length} total
            </Tag>
          </Space>
        }
        extra={
          <Button size="small" type="link" onClick={() => navigate("/tasks?status=running")}>
            Open in Tasks →
          </Button>
        }
        styles={{ body: { padding: runningRows.length === 0 ? 24 : 0 } }}
      >
        {runningRows.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing running right now" />
        ) : (
          <Table
            size="small"
            dataSource={runningRows}
            rowKey="runId"
            pagination={false}
            scroll={{ x: "max-content" }}
            className="dashboard-running-table"
            onRow={(r) => ({
              style: { cursor: "pointer" },
              onClick: () => navigate(`/tasks?status=running#task-${r.taskId}`),
            })}
            columns={[
              {
                title: "Task",
                key: "task",
                width: 160,
                render: (_, r) => (
                  <Typography.Text style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                    #{r.taskId}
                    {r.attempt > 1 && (
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        {" "}
                        · attempt {r.attempt}
                      </Typography.Text>
                    )}
                  </Typography.Text>
                ),
              },
              {
                title: "Plan",
                key: "plan",
                width: 180,
                ellipsis: true,
                render: (_, r) => (
                  <Typography.Text style={{ fontSize: 12 }} ellipsis>
                    {r.plan}
                  </Typography.Text>
                ),
              },
              {
                title: "Setup",
                key: "setup",
                width: 220,
                ellipsis: true,
                render: (_, r) => (
                  <Typography.Text style={{ fontSize: 12 }} ellipsis>
                    {r.av}
                    <Typography.Text type="secondary"> · </Typography.Text>
                    {r.sim}
                    <Typography.Text type="secondary"> · </Typography.Text>
                    {r.sampler}
                  </Typography.Text>
                ),
              },
              {
                title: "Executor",
                key: "executor",
                width: 200,
                ellipsis: true,
                render: (_, r) =>
                  r.executor ? (
                    <Typography.Text style={{ fontSize: 12 }} ellipsis>
                      {r.executor.hostname}
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        {" "}
                        · job {r.executor.slurm_job_id}
                      </Typography.Text>
                    </Typography.Text>
                  ) : (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      —
                    </Typography.Text>
                  ),
              },
              {
                title: "Runtime",
                key: "runtime",
                width: 100,
                render: (_, r) => (
                  <Typography.Text style={{ fontSize: 12 }}>
                    {r.startedAt ? formatRuntime(r.startedAt) : "-"}
                  </Typography.Text>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Card
        size="small"
        style={{ marginTop: 12 }}
        title={
          <Space size={8}>
            <Typography.Text strong>Setup status breakdown</Typography.Text>
            <Tag>{setupGroups.length} setups</Tag>
          </Space>
        }
        extra={
          <Space size={12} wrap>
            {STATUS_ORDER.map((s) => (
              <Space key={s} size={4}>
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: TASK_STATUS_HEX[s],
                  }}
                />
                <Typography.Text style={{ fontSize: 11 }} type="secondary">
                  {TASK_STATUS_LABEL[s]}
                </Typography.Text>
              </Space>
            ))}
          </Space>
        }
      >
        {visibleSetupGroups.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tasks in any setup yet" />
        ) : (
          <Row gutter={[12, 16]}>
            {visibleSetupGroups.map((g) => {
              const av = avMap.get(g.avId) ?? `#${g.avId}`;
              const sim = simMap.get(g.simId) ?? `#${g.simId}`;
              const sampler = samplerMap.get(g.samplerId) ?? `#${g.samplerId}`;
              return (
                <Col key={g.key} xs={12} sm={8} md={6} lg={3}>
                  <Space
                    direction="vertical"
                    size={4}
                    style={{ width: "100%", textAlign: "center", cursor: "pointer" }}
                    onClick={() =>
                      navigate(
                        `/tasks?av_id=${g.avId}&simulator_id=${g.simId}&sampler_id=${g.samplerId}`,
                      )
                    }
                  >
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <StatusDonut counts={g.counts} />
                    </div>
                    <Typography.Text
                      strong
                      style={{ fontSize: 12, display: "block" }}
                      ellipsis={{ tooltip: `${av} · ${sim} · ${sampler}` }}
                    >
                      {av}
                    </Typography.Text>
                    <Typography.Text
                      type="secondary"
                      style={{ fontSize: 11, display: "block" }}
                      ellipsis={{ tooltip: `${sim} · ${sampler}` }}
                    >
                      {sim} · {sampler}
                    </Typography.Text>
                  </Space>
                </Col>
              );
            })}
            {hiddenSetupCount > 0 && (
              <Col xs={24}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  + {hiddenSetupCount} more setup{hiddenSetupCount === 1 ? "" : "s"} not shown
                  (sorted by task count desc).
                </Typography.Text>
              </Col>
            )}
          </Row>
        )}
      </Card>
    </>
  );
}
