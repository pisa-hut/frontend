import { useEffect, useState } from "react";
import { Card, Col, Row, Statistic, Spin, Typography } from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  ClockCircleOutlined,
  PlusCircleOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { api } from "../api/client";
import type { TaskResponse, TaskStatus } from "../api/types";

const statusConfig: Record<
  TaskStatus,
  { color: string; icon: React.ReactNode; label: string }
> = {
  created: { color: "#8c8c8c", icon: <PlusCircleOutlined />, label: "Created" },
  pending: { color: "#faad14", icon: <ClockCircleOutlined />, label: "Pending" },
  running: { color: "#1890ff", icon: <SyncOutlined spin />, label: "Running" },
  completed: { color: "#52c41a", icon: <CheckCircleOutlined />, label: "Completed" },
  failed: { color: "#ff4d4f", icon: <CloseCircleOutlined />, label: "Failed" },
  invalid: { color: "#d9d9d9", icon: <WarningOutlined />, label: "Invalid" },
};

export default function Dashboard() {
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => api.listTasks().then(setTasks).finally(() => setLoading(false));
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <Spin size="large" />;

  const counts: Record<TaskStatus, number> = {
    created: 0, pending: 0, running: 0, completed: 0, failed: 0, invalid: 0,
  };
  for (const t of tasks) {
    counts[t.task_status]++;
  }

  return (
    <>
      <Typography.Title level={3}>Dashboard</Typography.Title>
      <Row gutter={[16, 16]}>
        {(Object.entries(statusConfig) as [TaskStatus, typeof statusConfig[TaskStatus]][]).map(
          ([status, cfg]) => (
            <Col xs={12} sm={8} md={4} key={status}>
              <Card>
                <Statistic
                  title={cfg.label}
                  value={counts[status]}
                  prefix={cfg.icon}
                  valueStyle={{ color: cfg.color }}
                />
              </Card>
            </Col>
          )
        )}
      </Row>
      <Row style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card>
            <Statistic title="Total Tasks" value={tasks.length} />
          </Card>
        </Col>
      </Row>
    </>
  );
}
