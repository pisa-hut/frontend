import { useEffect, useState } from "react";
import { Typography, Tag, Card, Space, Row, Col } from "antd";
import { api } from "../api/client";
import type { TaskRunResponse, TaskRunStatus, ExecutorResponse } from "../api/types";

const runStatusColors: Record<TaskRunStatus, string> = {
  running: "processing",
  completed: "success",
  failed: "error",
  aborted: "default",
};

export default function TaskRunsPanel({ taskId, autoRefresh }: { taskId: number; autoRefresh: boolean }) {
  const [runs, setRuns] = useState<TaskRunResponse[]>([]);
  const [executors, setExecutors] = useState<Map<number, ExecutorResponse>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => api.listTaskRuns(taskId).then(setRuns).finally(() => setLoading(false));
    load();
    if (!autoRefresh) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [taskId, autoRefresh]);

  useEffect(() => {
    const ids = [...new Set(runs.map((r) => r.executor_id))];
    if (ids.length === 0 || ids.every((id) => executors.has(id))) return;
    api.listExecutors().then((all) => setExecutors(new Map(all.map((e) => [e.id, e]))));
  }, [runs]);

  if (loading) return <Typography.Text type="secondary">Loading...</Typography.Text>;
  if (runs.length === 0) return <Typography.Text type="secondary">No runs yet</Typography.Text>;

  return (
    <div style={{ padding: "0 8px" }}>
      {runs.map((run) => {
        const exec = executors.get(run.executor_id);
        return (
          <Card key={run.id} size="small" style={{ marginBottom: 8 }} title={
            <Space>
              <span>Attempt #{run.attempt}</span>
              <Tag color={runStatusColors[run.task_run_status]}>{run.task_run_status.toUpperCase()}</Tag>
            </Space>
          }>
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
                {exec ? `${exec.hostname} (job ${exec.slurm_job_id})` : `#${run.executor_id}`}
              </Col>
              {exec && (
                <Col span={12}>
                  <Typography.Text type="secondary">Node: </Typography.Text>
                  {exec.slurm_node_list}
                </Col>
              )}
              {run.error_message && (
                <Col span={24}>
                  <Typography.Text type="danger">{run.error_message}</Typography.Text>
                </Col>
              )}
            </Row>
          </Card>
        );
      })}
    </div>
  );
}
