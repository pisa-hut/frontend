import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { usePisaEvents } from "../api/events";
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

const INITIAL_LIMIT = 5;
const PAGE_SIZE = 20;

export default function TaskRunsPanel({ taskId }: { taskId: number }) {
  const [runs, setRuns] = useState<TaskRunResponse[]>([]);
  const [executors, setExecutors] = useState<Map<number, ExecutorResponse>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [limit, setLimit] = useState(INITIAL_LIMIT);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [log, setLog] = useState<LogDrawerState | null>(null);

  const load = useCallback(() => {
    return api.listTaskRuns(taskId, limit).then((rows) => {
      setRuns(rows);
      setReachedEnd(rows.length < limit);
    });
  }, [taskId, limit]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // SSE: refetch this task's runs on row events for our taskId, and
  // append streamed log chunks to the open Drawer (if any).
  const refetchTimer = useRef<number | null>(null);
  const knownRunIds = useMemo(() => new Set(runs.map((r) => r.id)), [runs]);
  const openLogRunId = log?.run.id;
  usePisaEvents(
    useCallback(
      (ev) => {
        if (ev.kind === "log") {
          if (openLogRunId !== undefined && ev.task_run_id === openLogRunId) {
            setLog((prev) => {
              if (!prev || prev.run.id !== ev.task_run_id) return prev;
              // Drop chunks that arrive while the initial snapshot fetch is
              // still in flight — the fetch's result is authoritative for
              // everything up to that moment, and we don't want a double
              // copy when the fetch lands.
              if (prev.loading) return prev;
              return { ...prev, content: (prev.content ?? "") + ev.chunk };
            });
          }
          return;
        }
        const row = ev.row;
        const concerns =
          (row.table === "task" && row.id === taskId) ||
          (row.table === "task_run" && knownRunIds.has(row.id)) ||
          row.table === "task_run"; // insert of a new run we don't yet know about
        if (!concerns) return;
        if (refetchTimer.current !== null) return;
        refetchTimer.current = window.setTimeout(() => {
          refetchTimer.current = null;
          load();
        }, 250);
      },
      [taskId, knownRunIds, load, openLogRunId],
    ),
  );

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const older = await api.listTaskRuns(taskId, PAGE_SIZE, runs.length);
      if (older.length === 0) {
        setReachedEnd(true);
      } else {
        setRuns((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...older.filter((r) => !seen.has(r.id))];
        });
        setLimit(runs.length + older.length);
        if (older.length < PAGE_SIZE) setReachedEnd(true);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const loadAll = async () => {
    setLoadingMore(true);
    try {
      const all = await api.listTaskRuns(taskId, 10000);
      setRuns(all);
      setLimit(all.length);
      setReachedEnd(true);
    } finally {
      setLoadingMore(false);
    }
  };

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
    if (!log) return null;
    const exec = log.executor;
    const isLive = log.run.task_run_status === "running";
    return (
      <Space>
        <span>
          Attempt #{log.run.attempt} · {exec?.hostname ?? "executor"}
        </span>
        {isLive && (
          <Tag color="processing" icon={<SyncOutlined spin />} style={{ marginInline: 0 }}>
            live
          </Tag>
        )}
      </Space>
    );
  })();

  // Auto-scroll the log pane to the bottom whenever content grows — lets
  // users watch the tail without manually scrolling. `logPaneRef` is set
  // by the <pre> below; content length in the deps list is enough because
  // append mutates the string identity.
  const logPaneRef = useRef<HTMLPreElement | null>(null);
  useEffect(() => {
    const el = logPaneRef.current;
    if (!el) return;
    // If the user has scrolled up, don't yank them back down.
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [log?.content]);

  return (
    <div style={{ padding: "4px 8px" }}>
      {loading ? (
        <Typography.Text type="secondary">Loading…</Typography.Text>
      ) : runs.length === 0 ? (
        <Typography.Text type="secondary">No runs yet.</Typography.Text>
      ) : (
        <>
          <Timeline items={items} />
          {!reachedEnd && (
            <Space size="small" style={{ marginTop: 4, marginLeft: 6 }}>
              <Button
                size="small"
                type="link"
                loading={loadingMore}
                onClick={loadMore}
                style={{ padding: 0 }}
              >
                Show older attempts
              </Button>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                ·
              </Typography.Text>
              <Button
                size="small"
                type="link"
                loading={loadingMore}
                onClick={loadAll}
                style={{ padding: 0 }}
              >
                Show all
              </Button>
            </Space>
          )}
          {reachedEnd && runs.length > INITIAL_LIMIT && (
            <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>
              {runs.length} attempts — end of history
            </Typography.Text>
          )}
        </>
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
            ref={logPaneRef}
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
            <Empty
              description={
                log.run.task_run_status === "running"
                  ? "Waiting for the executor to stream its first chunk…"
                  : "No log captured for this run."
              }
            />
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
