import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Row, Space, Statistic, Spin, Typography } from "antd";
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
import type { TaskResponse, TaskStatus } from "../api/types";

const statusConfig: Record<TaskStatus, { color: string; icon: React.ReactNode; label: string }> = {
  idle: { color: "#8c8c8c", icon: <PlusCircleOutlined />, label: "Idle" },
  queued: { color: "#faad14", icon: <ClockCircleOutlined />, label: "Queued" },
  running: { color: "#1890ff", icon: <SyncOutlined spin />, label: "Running" },
  completed: { color: "#52c41a", icon: <CheckCircleOutlined />, label: "Completed" },
  invalid: { color: "#ff4d4f", icon: <WarningOutlined />, label: "Invalid" },
  aborted: { color: "#ff7875", icon: <StopOutlined />, label: "Aborted" },
};

interface AbortedStats {
  total: number;
  last24h: number;
}

async function fetchAbortedStats(): Promise<AbortedStats> {
  const POSTGREST = import.meta.env.VITE_POSTGREST_URL ?? "/postgrest";
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [total, recent] = await Promise.all([
    fetch(`${POSTGREST}/task_run?task_run_status=eq.aborted&select=id`, {
      headers: { Accept: "application/json" },
    }).then((r) => r.json()),
    fetch(
      `${POSTGREST}/task_run?task_run_status=eq.aborted&finished_at=gte.${encodeURIComponent(cutoff)}&select=id`,
      { headers: { Accept: "application/json" } },
    ).then((r) => r.json()),
  ]);
  return {
    total: Array.isArray(total) ? total.length : 0,
    last24h: Array.isArray(recent) ? recent.length : 0,
  };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [aborted, setAborted] = useState<AbortedStats>({ total: 0, last24h: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    return Promise.all([api.listTasks(), fetchAbortedStats()]).then(([t, a]) => {
      setTasks(t);
      setAborted(a);
    });
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // SSE: debounced refetch on any task / task_run change.
  usePisaEvents(
    useCallback(
      (ev) => {
        if (ev.kind !== "row") return;
        if (ev.row.table === "task" || ev.row.table === "task_run") {
          load();
        }
      },
      [load],
    ),
  );

  // ALL hooks must be called before any early return, or React detects
  // a hook-count mismatch the first time `loading` flips false. The
  // earlier version put useMemo *after* the loading guard and broke
  // the page on first SSE refresh.
  const counts: Record<TaskStatus, number> = useMemo(() => {
    const c: Record<TaskStatus, number> = {
      idle: 0, queued: 0, running: 0, completed: 0, invalid: 0, aborted: 0,
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

  if (loading) return <Spin size="large" style={{ display: "flex", justifyContent: "center", marginTop: 80 }} />;

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
                  <Typography.Text strong>{triageCount} invalid task{triageCount === 1 ? "" : "s"}</Typography.Text>
                  <Typography.Text>waiting for triage — fix the root cause and re-Run, or Archive.</Typography.Text>
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
                  <Typography.Text strong>{stuckCount} task{stuckCount === 1 ? "" : "s"}</Typography.Text>
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
        {(Object.entries(statusConfig) as [TaskStatus, (typeof statusConfig)[TaskStatus]][]).map(([status, cfg]) => (
          <Col xs={8} sm={8} md={4} key={status}>
            <Card
              hoverable
              size="small"
              onClick={() => navigate(`/tasks?status=${status}`)}
              style={{ cursor: "pointer", textAlign: "center" }}
              styles={{ body: { padding: "12px 8px" } }}
            >
              <Statistic
                title={cfg.label}
                value={counts[status]}
                prefix={cfg.icon}
                valueStyle={{ color: cfg.color, fontSize: 24 }}
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
    </>
  );
}
