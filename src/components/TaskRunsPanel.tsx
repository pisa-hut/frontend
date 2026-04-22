import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Typography,
  Space,
  Button,
  Timeline,
  Tag,
  message,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  StopOutlined,
  ExclamationCircleOutlined,
  CopyOutlined,
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

const INITIAL_LIMIT = 5;
const PAGE_SIZE = 20;

interface Props {
  taskId: number;
  /** Parent holds the log drawer so it can be opened from the task row's
   *  action button too, not just from inside this panel. */
  onOpenLog: (run: TaskRunResponse, executor?: ExecutorResponse) => void;
}

export default function TaskRunsPanel({ taskId, onOpenLog }: Props) {
  const [runs, setRuns] = useState<TaskRunResponse[]>([]);
  const [executors, setExecutors] = useState<Map<number, ExecutorResponse>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [limit, setLimit] = useState(INITIAL_LIMIT);

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

  // SSE: refetch on row changes for this task/its runs. (Log chunks are
  // handled by LogDrawer — we don't care about them here.)
  const refetchTimer = useRef<number | null>(null);
  const knownRunIds = useMemo(() => new Set(runs.map((r) => r.id)), [runs]);
  usePisaEvents(
    useCallback(
      (ev) => {
        if (ev.kind !== "row") return;
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
      [taskId, knownRunIds, load],
    ),
  );

  useEffect(() => {
    const needed = [...new Set(runs.map((r) => r.executor_id))].filter((id) => !executors.has(id));
    if (needed.length === 0) return;
    api.listExecutors().then((all) => setExecutors(new Map(all.map((e) => [e.id, e]))));
  }, [runs]);

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

  const items = useMemo(
    () =>
      runs.map((run) => {
        const exec = executors.get(run.executor_id);
        const dur = formatDuration(run.started_at, run.finished_at);

        // Whole row is a click target that opens the log drawer.
        // Metadata is one flex line that wraps gracefully; the row has
        // a consistent hover background so it reads as a link.
        return {
          key: run.id,
          dot: statusIcon(run.task_run_status),
          color: "transparent",
          children: (
            <div
              onClick={() => onOpenLog(run, exec)}
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
                padding: "2px 8px",
                marginLeft: -8,
                cursor: "pointer",
                borderRadius: 4,
                userSelect: "none",
                transition: "background 120ms",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background =
                  "var(--ant-color-bg-text-hover, rgba(0,0,0,0.04))";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "transparent";
              }}
            >
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
              {run.error_message && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    flex: "1 1 auto",
                    minWidth: 0,
                  }}
                >
                  <Typography.Text
                    type="danger"
                    ellipsis={{ tooltip: run.error_message }}
                    style={{ fontSize: 12, flex: 1, minWidth: 0 }}
                  >
                    {run.error_message}
                  </Typography.Text>
                  <Button
                    size="small"
                    type="text"
                    icon={<CopyOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(run.error_message ?? "");
                      message.success("Copied");
                    }}
                  />
                </div>
              )}
            </div>
          ),
        };
      }),
    [runs, executors, onOpenLog],
  );

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
    </div>
  );
}
