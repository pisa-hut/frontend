import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Empty, message, Select, Space, Spin, Tag, Typography } from "antd";
import { ArrowLeftOutlined, CopyOutlined, DownloadOutlined, SyncOutlined } from "@ant-design/icons";
import { api } from "../api/client";
import type { ExecutorResponse, TaskResponse, TaskRunResponse } from "../api/types";
import { TASK_STATUS_TAG_COLOR } from "../constants/status";
import { useLogStream } from "../hooks/useLogStream";

export interface LogViewProps {
  run: TaskRunResponse | null;
  task?: TaskResponse;
  taskLabel?: string;
  executor?: ExecutorResponse;
  /** Back/close. Shown as a ← in the header when provided. */
  onClose: () => void;
}

/** Self-contained, read-only log viewer for one task_run: a header bar
 *  (identity + attempt switcher + copy/download) over a tail-following
 *  log pane. Fills its parent's height. Used inline inside the task
 *  detail drawer (no nested drawer) and wrapped by LogDrawer on the
 *  /tasks/:id page. */
export default function LogView({ run, task, taskLabel, executor, onClose }: LogViewProps) {
  const paneRef = useRef<HTMLPreElement | null>(null);
  const [selectedRun, setSelectedRun] = useState<TaskRunResponse | null>(run);
  const [runs, setRuns] = useState<TaskRunResponse[]>([]);
  const [executors, setExecutors] = useState<Map<number, ExecutorResponse>>(new Map());

  useEffect(() => {
    setSelectedRun(run);
    if (!run) {
      setRuns([]);
      return;
    }
    setRuns([run]);
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

  if (!run) return null;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          padding: "10px 12px",
          borderBottom: "1px solid var(--ant-color-border-secondary)",
        }}
      >
        <Button type="text" size="small" icon={<ArrowLeftOutlined />} onClick={onClose} title="Back" />
        {task && (
          <>
            <Typography.Text strong>Task #{task.id}</Typography.Text>
            <Tag color={TASK_STATUS_TAG_COLOR[task.task_status]} style={{ marginInline: 0 }}>
              {task.task_status}
            </Tag>
          </>
        )}
        {taskLabel && (
          <Typography.Text type="secondary" ellipsis style={{ maxWidth: 200 }}>
            {taskLabel}
          </Typography.Text>
        )}
        {exec && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            · {exec.hostname} · job {exec.slurm_job_id}
          </Typography.Text>
        )}
        {isLive && (
          <Tag color="processing" icon={<SyncOutlined spin />} style={{ marginInline: 0 }}>
            live
          </Tag>
        )}
        <Space size={8} style={{ marginLeft: "auto" }}>
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
      </div>

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
            minHeight: 0,
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
      ) : (
        <div style={{ padding: 24 }}>
          <Empty
            description={
              isLive
                ? "Waiting for the executor to stream its first chunk…"
                : "No log captured for this run."
            }
          />
        </div>
      )}
    </div>
  );
}
