import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Table,
  Button,
  Space,
  Typography,
  Tag,
  message,
  Popconfirm,
  Empty,
  Spin,
  Tooltip,
} from "antd";
import {
  CaretRightOutlined,
  InboxOutlined,
  ReloadOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "../api/client";
import type { TaskResponse } from "../api/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Task ids to triage. The parent (Tasks page) computes this from
   *  the active page filter so the modal honours the same scope the
   *  table is showing — typically the set of invalid tasks inside the
   *  selected tag / setup / etc. Empty array → modal renders an empty
   *  state and reports "nothing to triage". */
  taskIds: number[];
  /** Optional human-readable description of the active scope shown in
   *  the modal title (e.g. "tag: 0522v3-HetroD"). Omitted when no
   *  filter is active. */
  scopeLabel?: string;
  /** Called after a successful re-run / archive so the parent can
   *  refresh its list. */
  onChanged?: () => void;
  /** Hook so a parent (Tasks page) can open one of the linked task ids
   *  in the log drawer when the user wants to inspect a sample. */
  onOpenSampleLog?: (taskId: number) => void;
}

interface ErrorGroup {
  /** Stable client-side id used as the table rowKey. */
  key: string;
  /** Normalised signature used for grouping (also the full text we show). */
  signature: string;
  /** Tasks whose latest task_run shares this signature. */
  tasks: TaskResponse[];
}

const NO_RUN_SIGNATURE = "(task with no runs yet — likely a stuck invalid)";
const NO_MESSAGE_SIGNATURE = "(no error_message captured on the last attempt)";

/** Collapse a task_run.error_message into a coarse signature so similar
 *  failures cluster together. The raw messages often differ only in
 *  task-specific bits — file paths, request ids, timestamps, port
 *  numbers — and the user is triaging by *cause*, not by instance.
 *
 *  Rules: strip CR/LF and excess whitespace, mask common variability
 *  (numbers, hex blobs, quoted paths, gRPC fields), and cap at 240
 *  chars so the longest grouping bucket fits in the table cell. */
function signatureOf(msg: string | null | undefined): string {
  if (!msg) return NO_MESSAGE_SIGNATURE;
  let s = msg.replace(/\s+/g, " ").trim();
  if (!s) return NO_MESSAGE_SIGNATURE;
  // Mask numbers (ports, ids, byte counts, durations) — common sources
  // of false fragmentation across otherwise identical messages.
  s = s.replace(/\b\d+(?:\.\d+)?\b/g, "<num>");
  // Mask hex blobs (gRPC trace ids, UUIDs).
  s = s.replace(/\b[a-f0-9]{8,}\b/gi, "<hex>");
  // Mask absolute paths.
  s = s.replace(/\/[\w./\-_]+/g, "<path>");
  return s.length > 240 ? s.slice(0, 240) + "…" : s;
}

export default function TriageInvalidModal({
  open,
  onClose,
  taskIds,
  scopeLabel,
  onChanged,
  onOpenSampleLog,
}: Props) {
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = async () => {
    if (taskIds.length === 0) {
      setTasks([]);
      return;
    }
    setLoading(true);
    try {
      setTasks(await api.listTasksByIdsWithLatestRun(taskIds));
    } catch (e) {
      message.error(`Failed to load invalid tasks: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  // Reload when the modal opens or the scope changes while it's open
  // (e.g. the user changes a filter chip without closing the modal).
  // `taskIds.join(',')` stabilises the dep so a freshly-built array
  // with identical content doesn't refetch.
  const idsKey = taskIds.join(",");
  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idsKey]);

  const groups = useMemo<ErrorGroup[]>(() => {
    const map = new Map<string, ErrorGroup>();
    for (const t of tasks) {
      const latest = t.task_run?.[0];
      const sig = latest ? signatureOf(latest.error_message) : NO_RUN_SIGNATURE;
      let g = map.get(sig);
      if (!g) {
        g = { key: sig, signature: sig, tasks: [] };
        map.set(sig, g);
      }
      g.tasks.push(t);
    }
    return [...map.values()].sort((a, b) => b.tasks.length - a.tasks.length);
  }, [tasks]);

  const runGroup = async (g: ErrorGroup) => {
    setBusyKey(g.key);
    try {
      await api.batchRunTasks(g.tasks.map((t) => t.id));
      message.success(`Re-queued ${g.tasks.length} task(s)`);
      onChanged?.();
      load();
    } catch (e) {
      message.error(`Re-queue failed: ${e}`);
    } finally {
      setBusyKey(null);
    }
  };

  const archiveGroup = async (g: ErrorGroup) => {
    setBusyKey(g.key);
    try {
      await api.batchArchiveTasks(g.tasks.map((t) => t.id));
      message.success(`Archived ${g.tasks.length} task(s)`);
      onChanged?.();
      load();
    } catch (e) {
      message.error(`Archive failed: ${e}`);
    } finally {
      setBusyKey(null);
    }
  };

  const columns: ColumnsType<ErrorGroup> = [
    {
      title: "Latest error",
      dataIndex: "signature",
      key: "signature",
      render: (sig: string) => (
        <Tooltip
          title={<pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap" }}>{sig}</pre>}
          placement="topLeft"
        >
          <Typography.Text
            style={{
              fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
              fontSize: 12,
            }}
            ellipsis={{ tooltip: false }}
          >
            {sig}
          </Typography.Text>
        </Tooltip>
      ),
    },
    {
      title: "Tasks",
      key: "count",
      width: 90,
      align: "right",
      defaultSortOrder: "descend",
      sorter: (a, b) => a.tasks.length - b.tasks.length,
      render: (_: unknown, g) => (
        <Typography.Text style={{ fontVariantNumeric: "tabular-nums" }}>
          {g.tasks.length}
        </Typography.Text>
      ),
    },
    {
      title: "Samples",
      key: "samples",
      width: 200,
      render: (_: unknown, g) => {
        const sample = g.tasks.slice(0, 4);
        return (
          <Space size={4} wrap>
            {sample.map((t) => (
              <Tag
                key={t.id}
                style={{ cursor: onOpenSampleLog ? "pointer" : undefined, marginInline: 0 }}
                icon={<FileTextOutlined />}
                onClick={() => onOpenSampleLog?.(t.id)}
              >
                #{t.id}
              </Tag>
            ))}
            {g.tasks.length > sample.length && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                +{g.tasks.length - sample.length}
              </Typography.Text>
            )}
          </Space>
        );
      },
    },
    {
      title: "",
      key: "actions",
      width: 230,
      render: (_: unknown, g) => (
        <Space size={4}>
          <Popconfirm
            title={`Re-queue ${g.tasks.length} task(s)?`}
            description="They'll start from scratch when an executor picks them up."
            okText="Re-run all"
            onConfirm={() => runGroup(g)}
          >
            <Button
              size="small"
              type="primary"
              icon={<CaretRightOutlined />}
              loading={busyKey === g.key}
            >
              Re-run all
            </Button>
          </Popconfirm>
          <Popconfirm
            title={`Archive ${g.tasks.length} task(s)?`}
            description="They'll be hidden from the default Tasks view but kept in the database."
            okText="Archive all"
            okButtonProps={{ danger: true }}
            onConfirm={() => archiveGroup(g)}
          >
            <Button size="small" icon={<InboxOutlined />} loading={busyKey === g.key}>
              Archive all
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const total = tasks.length;
  const distinctSignatures = groups.length;

  return (
    <Modal
      title={
        <Space size={6} wrap>
          <Typography.Text strong>Triage invalid tasks</Typography.Text>
          {scopeLabel && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              · scoped to {scopeLabel}
            </Typography.Text>
          )}
          {!loading && total > 0 && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              · {total} task(s) across {distinctSignatures} error group(s)
            </Typography.Text>
          )}
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={1100}
      footer={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            Refresh
          </Button>
          <Button type="primary" onClick={onClose}>
            Done
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        Tasks that gave up after {""}
        <Typography.Text code>USELESS_STREAK_LIMIT</Typography.Text> consecutive useless runs,
        grouped by their latest run's error signature. Re-run a whole group if it looks transient,
        archive it if it doesn't.
      </Typography.Paragraph>
      {loading ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : groups.length === 0 ? (
        <Empty description="No invalid tasks — nothing to triage." />
      ) : (
        <Table
          dataSource={groups}
          columns={columns}
          rowKey="key"
          size="small"
          pagination={{ pageSize: 15, size: "small", showSizeChanger: false }}
        />
      )}
    </Modal>
  );
}
