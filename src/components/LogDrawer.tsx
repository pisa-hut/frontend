import { useCallback, useEffect, useMemo, useRef } from "react";
import { Drawer, Space, Button, Tag, Typography, Spin, Empty, Popconfirm, message } from "antd";
import {
  CaretRightOutlined,
  CopyOutlined,
  DownloadOutlined,
  InboxOutlined,
  StopOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { api } from "../api/client";
import type { TaskResponse, TaskRunResponse, ExecutorResponse } from "../api/types";
import { RUNNABLE_TASK_STATUSES } from "../api/types";
import { TASK_STATUS_TAG_COLOR } from "../constants/status";
import { useLogStream } from "../hooks/useLogStream";

interface Props {
  run: TaskRunResponse | null;
  /** Parent task — used so the header shows task identity (#id, status,
   *  plan label) right when the drawer slides in, not after the user
   *  scrolls through the log trying to figure out where they are. */
  task?: TaskResponse;
  /** Human-readable label for the task (typically the plan name). */
  taskLabel?: string;
  executor?: ExecutorResponse;
  onClose: () => void;
}

/** Full-height right-side drawer that shows the captured log of one
 *  task_run. Loads the DB snapshot on open, then subscribes to live
 *  SSE `log` events for chunk appends while the run is still running.
 *
 *  Triage actions live in the header: Stop (live), Run (re-queue),
 *  Archive (dismiss invalid). All three close the drawer on success so
 *  the user can flow straight to the next task without manually
 *  closing + re-clicking. */
export default function LogDrawer({ run, task, taskLabel, executor, onClose }: Props) {
  const paneRef = useRef<HTMLPreElement | null>(null);
  const { content, loading, error } = useLogStream(run?.id ?? null);

  // Always stick to the tail — each content update (initial snapshot and
  // every live SSE chunk) scrolls to the bottom so the user sees the
  // newest output without having to follow along manually.
  useEffect(() => {
    const el = paneRef.current;
    if (!el || content == null) return;
    el.scrollTop = el.scrollHeight;
  }, [content]);

  const isLive = run?.task_run_status === "running";
  // Re-running a finished attempt re-queues the parent task. Two gates
  // (Codex review #3): the viewed run must be terminal AND the task's
  // *current* status must be one we're allowed to re-Run from. Without
  // the second gate, opening an old completed/failed attempt on a task
  // that's currently queued or running would let the user re-queue an
  // already-active task and risk duplicate dispatch.
  const runIsTerminal =
    run != null &&
    (run.task_run_status === "completed" ||
      run.task_run_status === "failed" ||
      run.task_run_status === "aborted");
  const canRun = runIsTerminal && task != null && RUNNABLE_TASK_STATUSES.includes(task.task_status);
  // Mirror the per-row Archive trigger: only meaningful for invalid
  // tasks the user hasn't already triaged.
  const canArchive = task != null && task.task_status === "invalid" && !task.archived;

  const doStop = useCallback(() => {
    if (!run) return;
    api
      .stopTask(run.task_id)
      .then(() => {
        message.success(`Task #${run.task_id} stopped`);
        onClose();
      })
      .catch((e) => message.error(String(e)));
  }, [run, onClose]);

  const doRun = useCallback(() => {
    if (!run) return;
    api
      .updateTask(run.task_id, { task_status: "queued" })
      .then(() => {
        message.success(`Task #${run.task_id} queued`);
        onClose();
      })
      .catch((e) => message.error(String(e)));
  }, [run, onClose]);

  const doArchive = useCallback(() => {
    if (!task) return;
    api
      .archiveTask(task.id)
      .then(() => {
        message.success(`Task #${task.id} archived`);
        onClose();
      })
      .catch((e) => message.error(String(e)));
  }, [task, onClose]);

  // Title is computed eagerly so it's visible the instant the drawer
  // animates in — no waiting for the log fetch to populate context.
  const title = useMemo(() => {
    if (!run) return null;
    return (
      <Space size={6} wrap>
        {task && (
          <>
            <Typography.Text strong>Task #{task.id}</Typography.Text>
            <Tag color={TASK_STATUS_TAG_COLOR[task.task_status]} style={{ marginInline: 0 }}>
              {task.task_status}
            </Tag>
            {task.archived && (
              <Tag color="default" style={{ marginInline: 0 }}>
                archived
              </Tag>
            )}
          </>
        )}
        {taskLabel && (
          <Typography.Text type="secondary" ellipsis style={{ maxWidth: 240 }}>
            {taskLabel}
          </Typography.Text>
        )}
        <Typography.Text type="secondary">·</Typography.Text>
        <Typography.Text>
          Attempt #{run.attempt} · {executor?.hostname ?? "executor"}
        </Typography.Text>
        {isLive && (
          <Tag color="processing" icon={<SyncOutlined spin />} style={{ marginInline: 0 }}>
            live
          </Tag>
        )}
      </Space>
    );
  }, [run, task, taskLabel, executor, isLive]);

  return (
    <Drawer
      title={title}
      placement="right"
      width={760}
      open={run !== null}
      onClose={onClose}
      styles={{ body: { padding: 0, display: "flex", flexDirection: "column" } }}
      extra={
        run ? (
          <Space>
            {isLive && (
              <Popconfirm title="Stop this task?" onConfirm={doStop}>
                <Button size="small" danger icon={<StopOutlined />}>
                  Stop
                </Button>
              </Popconfirm>
            )}
            {canRun && (
              <Popconfirm title="Re-run this task?" onConfirm={doRun}>
                <Button size="small" type="primary" icon={<CaretRightOutlined />}>
                  Run
                </Button>
              </Popconfirm>
            )}
            {canArchive && (
              <Popconfirm title="Archive this invalid task?" onConfirm={doArchive}>
                <Button size="small" icon={<InboxOutlined />}>
                  Archive
                </Button>
              </Popconfirm>
            )}
            {content && !loading && (
              <>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {(content.length / 1024).toFixed(1)} KB
                </Typography.Text>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    navigator.clipboard.writeText(content);
                    message.success("Copied");
                  }}
                />
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={() => {
                    const blob = new Blob([content], { type: "text/plain" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `task-run-${run.id}.log`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                />
              </>
            )}
          </Space>
        ) : null
      }
    >
      {loading ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Spin />
        </div>
      ) : error ? (
        <div style={{ padding: 24 }}>
          <Empty description={`Failed to load log: ${error}`} />
        </div>
      ) : content ? (
        <pre
          ref={paneRef}
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
            fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
          }}
        >
          {content}
        </pre>
      ) : run ? (
        <div style={{ padding: 24 }}>
          <Empty
            description={
              isLive
                ? "Waiting for the executor to stream its first chunk…"
                : "No log captured for this run."
            }
          />
        </div>
      ) : null}
    </Drawer>
  );
}
