import { useEffect, useMemo, useState } from "react";
import {
  Typography,
  Space,
  Button,
  Timeline,
  Tag,
  Drawer,
  Spin,
  message,
  Empty,
  Tooltip,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  StopOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  CopyOutlined,
  DownloadOutlined,
  DownOutlined,
  RightOutlined,
} from "@ant-design/icons";
import type React from "react";
import { api } from "../api/client";
import type { TaskRunResponse, TaskRunStatus, ExecutorResponse } from "../api/types";

function statusIcon(status: TaskRunStatus): React.ReactNode {
  switch (status) {
    case "running":
      return <SyncOutlined spin style={{ color: "#1677ff" }} />;
    case "completed":
      return <CheckCircleOutlined style={{ color: "#52c41a" }} />;
    case "failed":
      return <CloseCircleOutlined style={{ color: "#ff4d4f" }} />;
    case "aborted":
      return <StopOutlined style={{ color: "#8c8c8c" }} />;
    default:
      return <ExclamationCircleOutlined style={{ color: "#d9d9d9" }} />;
  }
}

function formatDuration(startedAt: string | null, finishedAt: string | null): string | null {
  if (!startedAt) return null;
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const s = (end - new Date(startedAt).getTime()) / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const sec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (sec < 60) return `${Math.round(sec)}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

interface LogDrawerState {
  run: TaskRunResponse;
  executor?: ExecutorResponse;
  loading: boolean;
  content: string | null;
  error?: string;
}

export default function TaskRunsPanel({ taskId, autoRefresh }: { taskId: number; autoRefresh: boolean }) {
  const [runs, setRuns] = useState<TaskRunResponse[]>([]);
  const [executors, setExecutors] = useState<Map<number, ExecutorResponse>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [log, setLog] = useState<LogDrawerState | null>(null);

  useEffect(() => {
    const load = () => api.listTaskRuns(taskId).then(setRuns).finally(() => setLoading(false));
    load();
    if (!autoRefresh) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [taskId, autoRefresh]);

  useEffect(() => {
    const needed = [...new Set(runs.map((r) => r.executor_id))].filter((id) => !executors.has(id));
    if (needed.length === 0) return;
    api.listExecutors().then((all) => setExecutors(new Map(all.map((e) => [e.id, e]))));
  }, [runs]);

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openLog = async (run: TaskRunResponse) => {
    const exec = executors.get(run.executor_id);
    setLog({ run, executor: exec, loading: true, content: null });
    try {
      const content = await api.getTaskRunLog(run.id);
      setLog({ run, executor: exec, loading: false, content });
    } catch (e) {
      setLog({ run, executor: exec, loading: false, content: null, error: String(e) });
    }
  };

  const items = useMemo(
    () =>
      runs.map((run) => {
        const exec = executors.get(run.executor_id);
        const isExpanded = expanded.has(run.id);
        const dur = formatDuration(run.started_at, run.finished_at);

        const summary = (
          <div
            onClick={() => toggle(run.id)}
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            {isExpanded ? (
              <DownOutlined style={{ fontSize: 10, color: "#8c8c8c" }} />
            ) : (
              <RightOutlined style={{ fontSize: 10, color: "#8c8c8c" }} />
            )}
            <Typography.Text strong>Attempt #{run.attempt}</Typography.Text>
            <Tag
              color={
                run.task_run_status === "completed"
                  ? "success"
                  : run.task_run_status === "failed"
                    ? "error"
                    : run.task_run_status === "running"
                      ? "processing"
                      : "default"
              }
              style={{ marginInline: 0 }}
            >
              {run.task_run_status}
            </Tag>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {timeAgo(run.started_at)}
              {dur ? ` · ${dur}` : ""}
              {exec ? ` · ${exec.hostname}` : ""}
            </Typography.Text>
            {run.error_message && !isExpanded && (
              <Typography.Text
                type="danger"
                ellipsis={{ tooltip: run.error_message }}
                style={{ fontSize: 12, maxWidth: 360 }}
              >
                {run.error_message}
              </Typography.Text>
            )}
            <span style={{ flex: 1 }} />
            <Button
              size="small"
              icon={<FileTextOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                openLog(run);
              }}
            >
              Log
            </Button>
          </div>
        );

        const details = isExpanded ? (
          <div style={{ marginTop: 6, paddingLeft: 20, fontSize: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 8, rowGap: 2 }}>
              <Typography.Text type="secondary">Started:</Typography.Text>
              <span>{run.started_at ? new Date(run.started_at).toLocaleString() : "—"}</span>
              <Typography.Text type="secondary">Finished:</Typography.Text>
              <span>{run.finished_at ? new Date(run.finished_at).toLocaleString() : "—"}</span>
              {exec && (
                <>
                  <Typography.Text type="secondary">Executor:</Typography.Text>
                  <span>
                    {exec.hostname}{" "}
                    <Typography.Text type="secondary">
                      (job {exec.slurm_job_id}, node {exec.slurm_node_list})
                    </Typography.Text>
                  </span>
                </>
              )}
            </div>
            {run.error_message && (
              <div style={{ marginTop: 6 }}>
                <Space align="start" size="small" style={{ width: "100%" }}>
                  <Typography.Text type="danger" style={{ flex: 1, whiteSpace: "pre-wrap" }}>
                    {run.error_message}
                  </Typography.Text>
                  <Tooltip title="Copy error">
                    <Button
                      size="small"
                      type="text"
                      icon={<CopyOutlined />}
                      onClick={() => {
                        navigator.clipboard.writeText(run.error_message ?? "");
                        message.success("Copied");
                      }}
                    />
                  </Tooltip>
                </Space>
              </div>
            )}
          </div>
        ) : null;

        return {
          key: run.id,
          dot: statusIcon(run.task_run_status),
          color: "transparent",
          children: (
            <div>
              {summary}
              {details}
            </div>
          ),
        };
      }),
    [runs, executors, expanded],
  );

  const drawerTitle = (() => {
    if (!log) return "";
    const exec = log.executor;
    return `Attempt #${log.run.attempt} · ${exec?.hostname ?? "executor"}`;
  })();

  return (
    <div style={{ padding: "4px 8px" }}>
      {loading ? (
        <Typography.Text type="secondary">Loading…</Typography.Text>
      ) : runs.length === 0 ? (
        <Typography.Text type="secondary">No runs yet.</Typography.Text>
      ) : (
        <Timeline items={items} />
      )}

      <Drawer
        title={drawerTitle}
        placement="right"
        width={720}
        open={log !== null}
        onClose={() => setLog(null)}
        bodyStyle={{ padding: 0, display: "flex", flexDirection: "column" }}
        extra={
          log?.content && !log.loading ? (
            <Space>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {(log.content.length / 1024).toFixed(1)} KB
              </Typography.Text>
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => {
                  navigator.clipboard.writeText(log.content ?? "");
                  message.success("Copied");
                }}
              >
                Copy
              </Button>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => {
                  const blob = new Blob([log.content ?? ""], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `task-run-${log.run.id}.log`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download
              </Button>
            </Space>
          ) : null
        }
      >
        {log?.loading ? (
          <div style={{ textAlign: "center", padding: 48 }}>
            <Spin />
          </div>
        ) : log?.error ? (
          <div style={{ padding: 24 }}>
            <Empty description={`Failed to load log: ${log.error}`} />
          </div>
        ) : log?.content ? (
          <pre
            style={{
              flex: 1,
              margin: 0,
              padding: 16,
              overflow: "auto",
              background: "#0f0f10",
              color: "#e5e5e5",
              fontSize: 11,
              lineHeight: 1.45,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              fontFamily:
                "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
            }}
          >
            {log.content}
          </pre>
        ) : log ? (
          <div style={{ padding: 24 }}>
            <Empty description="No log captured for this run." />
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
