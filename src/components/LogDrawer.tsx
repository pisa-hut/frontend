import { useCallback, useEffect, useRef, useState } from "react";
import { Drawer, Space, Button, Tag, Typography, Spin, Empty, message } from "antd";
import {
  CopyOutlined,
  DownloadOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { api } from "../api/client";
import { usePisaEvents } from "../api/events";
import type { TaskRunResponse, ExecutorResponse } from "../api/types";

interface Props {
  run: TaskRunResponse | null;
  executor?: ExecutorResponse;
  onClose: () => void;
}

/** Full-height right-side drawer that shows the captured log of one
 *  task_run. Loads the DB snapshot on open, then subscribes to live
 *  SSE `log` events for chunk appends while the run is still running. */
export default function LogDrawer({ run, executor, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const paneRef = useRef<HTMLPreElement | null>(null);
  // Tracks whether we've already done the "jump to bottom on first paint"
  // for the current run; reset when the run changes. Without this, long
  // logs stay scrolled at the top on open because the nearBottom check
  // (below) only auto-scrolls when the user is already near the bottom.
  const didInitialScroll = useRef(false);

  useEffect(() => {
    if (!run) {
      setContent(null);
      setError(undefined);
      return;
    }
    didInitialScroll.current = false;
    setLoading(true);
    setContent(null);
    setError(undefined);
    api
      .getTaskRunLog(run.id)
      .then((c) => setContent(c))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [run?.id]);

  usePisaEvents(
    useCallback(
      (ev) => {
        if (!run) return;
        if (ev.kind !== "log") return;
        if (ev.task_run_id !== run.id) return;
        // Drop chunks that arrive while the initial snapshot fetch is in
        // flight — the fetch is authoritative up to that moment.
        if (loading) return;
        setContent((prev) => (prev ?? "") + ev.chunk);
      },
      [run?.id, loading],
    ),
  );

  // On first paint for a given run, jump straight to the bottom — users
  // almost always want to see the most recent output. On subsequent
  // updates (live chunks), only follow along if they haven't scrolled up.
  useEffect(() => {
    const el = paneRef.current;
    if (!el || content == null) return;
    if (!didInitialScroll.current) {
      el.scrollTop = el.scrollHeight;
      didInitialScroll.current = true;
      return;
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [content]);

  const isLive = run?.task_run_status === "running";
  const title = run ? (
    <Space>
      <span>
        Attempt #{run.attempt} · {executor?.hostname ?? "executor"}
      </span>
      {isLive && (
        <Tag color="processing" icon={<SyncOutlined spin />} style={{ marginInline: 0 }}>
          live
        </Tag>
      )}
    </Space>
  ) : (
    null
  );

  return (
    <Drawer
      title={title}
      placement="right"
      width={720}
      open={run !== null}
      onClose={onClose}
      styles={{ body: { padding: 0, display: "flex", flexDirection: "column" } }}
      extra={
        content && !loading ? (
          <Space>
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
            >
              Copy
            </Button>
            <Button
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => {
                const blob = new Blob([content], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `task-run-${run?.id}.log`;
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
            fontFamily:
              "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
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
