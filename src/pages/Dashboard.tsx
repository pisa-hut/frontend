import { useEffect, useState } from "react";
import { Card, Col, Row, Statistic, Spin } from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  ClockCircleOutlined,
  PlusCircleOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { api } from "../api/client";
import type { TaskResponse, TaskStatus } from "../api/types";

const statusConfig: Record<TaskStatus, { color: string; icon: React.ReactNode; label: string }> = {
  created: { color: "#8c8c8c", icon: <PlusCircleOutlined />, label: "Created" },
  pending: { color: "#faad14", icon: <ClockCircleOutlined />, label: "Pending" },
  running: { color: "#1890ff", icon: <SyncOutlined spin />, label: "Running" },
  completed: { color: "#52c41a", icon: <CheckCircleOutlined />, label: "Completed" },
  failed: { color: "#ff4d4f", icon: <CloseCircleOutlined />, label: "Failed" },
  invalid: { color: "#d9d9d9", icon: <WarningOutlined />, label: "Invalid" },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => api.listTasks().then(setTasks).finally(() => setLoading(false));
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <Spin size="large" style={{ display: "flex", justifyContent: "center", marginTop: 80 }} />;

  const counts: Record<TaskStatus, number> = { created: 0, pending: 0, running: 0, completed: 0, failed: 0, invalid: 0 };
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
      <Card size="small" style={{ marginTop: 12 }} styles={{ body: { padding: "12px 16px" } }}>
        <Statistic title="Total Tasks" value={tasks.length} />
      </Card>
    </>
  );
}
