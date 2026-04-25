import { useCallback, useEffect, useState } from "react";
import { Card, Col, Row, Statistic, Spin, Typography } from "antd";
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

  if (loading) return <Spin size="large" style={{ display: "flex", justifyContent: "center", marginTop: 80 }} />;

  const counts: Record<TaskStatus, number> = {
    idle: 0, queued: 0, running: 0, completed: 0, invalid: 0, aborted: 0,
  };
  for (const t of tasks) counts[t.task_status]++;

  return (
    <>
      <PageHeader title="Dashboard" />
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
