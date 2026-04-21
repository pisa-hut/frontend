import { useEffect, useState } from "react";
import { Typography, Tag, Card, Space, Row, Col, Button, Spin, message } from "antd";
import { FileTextOutlined, CopyOutlined, DownloadOutlined } from "@ant-design/icons";
import { api } from "../api/client";
import type { TaskRunResponse, TaskRunStatus, ExecutorResponse } from "../api/types";

const runStatusColors: Record<TaskRunStatus, string> = {
  running: "processing",
  completed: "success",
  failed: "error",
  aborted: "default",
};

interface LogState {
  loading: boolean;
  content: string | null;
  error?: string;
}

export default function TaskRunsPanel({ taskId, autoRefresh }: { taskId: number; autoRefresh: boolean }) {
  const [runs, setRuns] = useState<TaskRunResponse[]>([]);
  const [executors, setExecutors] = useState<Map<number, ExecutorResponse>>(new Map());
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<Record<number, LogState>>({});

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

  const loadLog = async (runId: number) => {
    setLogs((m) => ({ ...m, [runId]: { loading: true, content: null } }));
    try {
      const content = await api.getTaskRunLog(runId);
      setLogs((m) => ({ ...m, [runId]: { loading: false, content } }));
    } catch (e) {
      setLogs((m) => ({ ...m, [runId]: { loading: false, content: null, error: String(e) } }));
    }
  };

  const closeLog = (runId: number) => {
    setLogs((m) => {
      const n = { ...m };
      delete n[runId];
      return n;
    });
  };

  if (loading) return <Typography.Text type="secondary">Loading...</Typography.Text>;
  if (runs.length === 0) return <Typography.Text type="secondary">No runs yet</Typography.Text>;

  return (
    <div style={{ padding: "0 8px" }}>
      {runs.map((run) => {
        const exec = executors.get(run.executor_id);
        const logState = logs[run.id];
        return (
          <Card
            key={run.id}
            size="small"
            style={{ marginBottom: 8 }}
            title={
              <Space>
                <span>Attempt #{run.attempt}</span>
                <Tag color={runStatusColors[run.task_run_status]}>{run.task_run_status.toUpperCase()}</Tag>
              </Space>
            }
            extra={
              logState ? (
                <Button size="small" onClick={() => closeLog(run.id)}>Hide log</Button>
              ) : (
                <Button size="small" icon={<FileTextOutlined />} onClick={() => loadLog(run.id)}>
                  View log
                </Button>
              )
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
              {logState && (
                <Col span={24}>
                  {logState.loading ? (
                    <div style={{ textAlign: "center", padding: 16 }}>
                      <Spin />
                    </div>
                  ) : logState.error ? (
                    <Typography.Text type="danger">Failed to load log: {logState.error}</Typography.Text>
                  ) : logState.content ? (
                    <div>
                      <Space style={{ marginBottom: 4 }} size="small">
                        <Button
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => {
                            navigator.clipboard.writeText(logState.content ?? "");
                            message.success("Copied");
                          }}
                        >
                          Copy
                        </Button>
                        <Button
                          size="small"
                          icon={<DownloadOutlined />}
                          onClick={() => {
                            const blob = new Blob([logState.content ?? ""], { type: "text/plain" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `task-run-${run.id}.log`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                        >
                          Download
                        </Button>
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          {(logState.content.length / 1024).toFixed(1)} KB
                        </Typography.Text>
                      </Space>
                      <pre
                        style={{
                          margin: 0,
                          padding: 12,
                          maxHeight: 400,
                          overflow: "auto",
                          background: "var(--ant-color-bg-layout, #111)",
                          color: "var(--ant-color-text, #ddd)",
                          fontSize: 11,
                          lineHeight: 1.4,
                          fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
                          borderRadius: 4,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                        }}
                      >
                        {logState.content}
                      </pre>
                    </div>
                  ) : (
                    <Typography.Text type="secondary">No log captured for this run.</Typography.Text>
                  )}
                </Col>
              )}
            </Row>
          </Card>
        );
      })}
    </div>
  );
}
