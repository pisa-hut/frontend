import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Drawer, Empty, message, Select, Space, Spin, Tag, Typography } from "antd";
import { CopyOutlined, DownloadOutlined, SyncOutlined } from "@ant-design/icons";
import { api } from "../api/client";
import type { ExecutorResponse, TaskResponse, TaskRunResponse } from "../api/types";
import { TASK_STATUS_TAG_COLOR } from "../constants/status";
import { useLogStream } from "../hooks/useLogStream";

interface Props {
  /** The run to open the drawer on (also the open trigger). The drawer
   *  then lets the user switch between this task's other attempts. */
  run: TaskRunResponse | null;
  /** Parent task — shown in the header so the user knows which task. */
  task?: TaskResponse;
  /** Human-readable label for the task (typically the plan name). */
  taskLabel?: string;
  /** Executor for the initial `run` (others are resolved on load). */
  executor?: ExecutorResponse;
  onClose: () => void;
}

/** Read-only, full-height log viewer for one task_run. Loads the DB
 *  snapshot on open, subscribes to live SSE chunk appends while the run
 *  is running, and offers an attempt switcher to jump between this
 *  task's runs without leaving the drawer. Task mutations (Run/Stop)
 *  live with the other actions on the detail surface, not here. */
export default function LogDrawer({ run, task, taskLabel, executor, onClose }: Props) {
  const paneRef = useRef<HTMLPreElement | null>(null);
  const [selectedRun, setSelectedRun] = useState<TaskRunResponse | null>(run);
  const [runs, setRuns] = useState<TaskRunResponse[]>([]);
  const [executors, setExecutors] = useState<Map<number, ExecutorResponse>>(new Map());

  // On open (or when opened on a different run) reset the selection and
  // load this task's other attempts for the switcher.
  useEffect(() => {
    setSelectedRun(run);
    if (!run) {
      setRuns([]);
      return;
    }
    setRuns([run]); // seed so the switcher isn't empty while loading
    api
      .listTaskRuns(run.task_id, 10000)
      .then((rows) => setRuns(rows.length ? rows : [run]))
      .catch(() => setRuns([run]));
    api
      .listExecutors()
      .then((all) => setExecutors(new Map(all.map((e) => [e.id, e]))))
      .catch(() => {});
  }, [run]);

  const { content, loading, error } = useLogStream(selectedRun?.id ?? null);

  // Stick to the tail on every content update (snapshot + live chunks).
  useEffect(() => {
    const el = paneRef.current;
    if (!el || content == null) return;
    el.scrollTop = el.scrollHeight;
  }, [content]);

  const isLive = selectedRun?.task_run_status === "running";
  const exec = selectedRun
    ? (executors.get(selectedRun.executor_id) ??
      (selectedRun.id === run?.id ? executor : undefined))
    : undefined;

  const attemptOptions = useMemo(
    () =>
      [...runs]
        .sort((a, b) => b.attempt - a.attempt)
        .map((r) => ({ value: r.id, label: `Attempt #${r.attempt} · ${r.task_run_status}` })),
    [runs],
  );

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
          </>
        )}
        {taskLabel && (
          <Typography.Text type="secondary" ellipsis style={{ maxWidth: 240 }}>
            {taskLabel}
          </Typography.Text>
        )}
        {exec && (
          <Typography.Text type="secondary">
            · {exec.hostname} · job {exec.slurm_job_id}
          </Typography.Text>
        )}
        {isLive && (
          <Tag color="processing" icon={<SyncOutlined spin />} style={{ marginInline: 0 }}>
            live
          </Tag>
        )}
      </Space>
    );
  }, [run, task, taskLabel, exec, isLive]);

  return (
    <Drawer
      title={title}
      placement="right"
      width="min(1200px, 90vw)"
      open={run !== null}
      onClose={onClose}
      styles={{ body: { padding: 0, display: "flex", flexDirection: "column" } }}
      extra={
        run ? (
          <Space>
            <Select
              size="small"
              value={selectedRun?.id}
              options={attemptOptions}
              onChange={(id) => setSelectedRun(runs.find((r) => r.id === id) ?? null)}
              style={{ minWidth: 190 }}
              popupMatchSelectWidth={false}
            />
            {content && !loading && (
              <>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {(content.length / 1024).toFixed(1)} KB
                </Typography.Text>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  title="Copy log"
                  onClick={() => {
                    navigator.clipboard.writeText(content);
                    message.success("Copied");
                  }}
                />
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  title="Download log"
                  onClick={() => {
                    const blob = new Blob([content], { type: "text/plain" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `task-run-${selectedRun?.id ?? run.id}.log`;
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
            whiteSpace: "pre",
            fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
          }}
        >
          {content}
        </pre>
      ) : selectedRun ? (
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
