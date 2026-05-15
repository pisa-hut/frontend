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
      {/* Background ring so a near-empty donut still has shape.
          Uses an AntD theme variable so the gray flips for dark mode. */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--ant-color-fill-tertiary, #f0f0f0)"
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
        style={{ fontSize: 14, fontWeight: 600, fill: "var(--ant-color-text, #262626)" }}
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

  // Stuck = currently running for over 2h, often a SLURM job that
  // never reached the executor.
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

  // For the "Status by plan group" card: tag → (setup combo →
  // counts). Tags live on plans, so we resolve each task's tags
  // via plan_id. Tasks whose plan has no tags bucket as "(untagged)".
  // Same SETUP_DONUT_LIMIT rule per tag so a single noisy tag
  // can't blow up the page height.
  const planTagsMap = useMemo(() => new Map(plans.map((p) => [p.id, p.tags ?? []])), [plans]);
  type SetupBucket = {
    key: string;
    avId: number;
    simId: number;
    samplerId: number;
    counts: Record<TaskStatus, number>;
    total: number;
  };
  const tagGroups = useMemo(() => {
    const byTag = new Map<string, Map<string, SetupBucket>>();
    for (const t of tasks) {
      const tags = planTagsMap.get(t.plan_id) ?? [];
      const tagsForBucket = tags.length > 0 ? tags : ["(untagged)"];
      for (const tag of tagsForBucket) {
        let setups = byTag.get(tag);
        if (!setups) {
          setups = new Map();
          byTag.set(tag, setups);
        }
        const setupKey = `${t.av_id}-${t.simulator_id}-${t.sampler_id}`;
        let bucket = setups.get(setupKey);
        if (!bucket) {
          bucket = {
            key: setupKey,
            avId: t.av_id,
            simId: t.simulator_id,
            samplerId: t.sampler_id,
            counts: { idle: 0, queued: 0, running: 0, completed: 0, invalid: 0, aborted: 0 },
            total: 0,
          };
          setups.set(setupKey, bucket);
        }
        bucket.counts[t.task_status]++;
        bucket.total++;
      }
    }
    // Sort tags by total task count desc; (untagged) sinks to the
    // bottom regardless so it doesn't dominate the visual hierarchy.
    return [...byTag.entries()]
      .map(([tag, setups]) => {
        const buckets = [...setups.values()].sort((a, b) => b.total - a.total);
        const total = buckets.reduce((sum, b) => sum + b.total, 0);
        return { tag, buckets, total };
      })
      .sort((a, b) => {
        if (a.tag === "(untagged)" && b.tag !== "(untagged)") return 1;
        if (b.tag === "(untagged)" && a.tag !== "(untagged)") return -1;
        return b.total - a.total;
      });
  }, [tasks, planTagsMap]);

  if (loading)
    return (
      <Spin size="large" style={{ display: "flex", justifyContent: "center", marginTop: 80 }} />
    );

  return (
    <>
      <PageHeader title="Dashboard" />

      {stuckCount > 0 && (
        <Alert
          style={{ marginBottom: 12 }}
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

      <Card
        size="small"
        style={{ marginTop: 12 }}
        title={
          <Space size={8}>
            <Typography.Text strong>Status by plan group</Typography.Text>
            <Tag>
              {tagGroups.length} group{tagGroups.length === 1 ? "" : "s"}
            </Tag>
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
        {tagGroups.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No plan tags yet — set them on the Plans page or at upload."
          />
        ) : (
          <Space direction="vertical" size={20} style={{ width: "100%" }}>
            {tagGroups.map((group) => {
              const visibleBuckets = group.buckets.slice(0, SETUP_DONUT_LIMIT);
              const hiddenBuckets = Math.max(0, group.buckets.length - SETUP_DONUT_LIMIT);
              return (
                <div key={group.tag}>
                  <Space size={8} style={{ marginBottom: 12 }}>
                    {group.tag === "(untagged)" ? (
                      <Tag color="default">{group.tag}</Tag>
                    ) : (
                      <Tag
                        color="blue"
                        style={{ cursor: "pointer" }}
                        onClick={() => navigate(`/tasks?tag=${encodeURIComponent(group.tag)}`)}
                      >
                        {group.tag}
                      </Tag>
                    )}
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {group.total} task{group.total === 1 ? "" : "s"} · {group.buckets.length}{" "}
                      setup{group.buckets.length === 1 ? "" : "s"}
                    </Typography.Text>
                  </Space>
                  <Row gutter={[12, 16]}>
                    {visibleBuckets.map((b) => {
                      const av = avMap.get(b.avId) ?? `#${b.avId}`;
                      const sim = simMap.get(b.simId) ?? `#${b.simId}`;
                      const sampler = samplerMap.get(b.samplerId) ?? `#${b.samplerId}`;
                      // Donut click drills into Tasks pre-filtered to
                      // this tag AND the chosen setup combo so the
                      // breakdown stays meaningful at the destination.
                      const params = new URLSearchParams({
                        av_id: String(b.avId),
                        simulator_id: String(b.simId),
                        sampler_id: String(b.samplerId),
                      });
                      if (group.tag !== "(untagged)") params.set("tag", group.tag);
                      return (
                        <Col key={`${group.tag}-${b.key}`} xs={12} sm={8} md={6} lg={3}>
                          <Space
                            direction="vertical"
                            size={4}
                            style={{ width: "100%", textAlign: "center", cursor: "pointer" }}
                            onClick={() => navigate(`/tasks?${params.toString()}`)}
                          >
                            <div style={{ display: "flex", justifyContent: "center" }}>
                              <StatusDonut counts={b.counts} />
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
                    {hiddenBuckets > 0 && (
                      <Col xs={24}>
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          + {hiddenBuckets} more setup{hiddenBuckets === 1 ? "" : "s"} in this
                          group.
                        </Typography.Text>
                      </Col>
                    )}
                  </Row>
                </div>
              );
            })}
          </Space>
        )}
      </Card>

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
    </>
  );
}
