import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { api } from "../../api/client";
import { usePisaEvents } from "../../api/events";
import type { ConcreteRunResponse, ConcreteRunStatus } from "../../api/types";

const PAGE_SIZE = 25;

const CONCRETE_STATUS_COLOR: Record<ConcreteRunStatus, string> = {
  finished: "success",
  failed: "error",
  aborted: "warning",
  skipped: "default",
};

function fmtMs(ms: number | null): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function compactJson(value: Record<string, unknown> | null): string {
  if (!value || Object.keys(value).length === 0) return "-";
  return JSON.stringify(value);
}

const COLUMNS: ColumnsType<ConcreteRunResponse> = [
  {
    title: "Concrete",
    dataIndex: "concrete_key",
    width: 160,
    render: (v: string) => <Typography.Text code>{v}</Typography.Text>,
  },
  {
    title: "Status",
    dataIndex: "status",
    width: 110,
    render: (v: ConcreteRunStatus) => <Tag color={CONCRETE_STATUS_COLOR[v]}>{v}</Tag>,
  },
  {
    title: "Outcome",
    dataIndex: "test_outcome",
    width: 110,
    render: (v: string) => <Tag>{v}</Tag>,
  },
  {
    title: "Reason",
    dataIndex: "reason",
    ellipsis: true,
    render: (v: string | null, r) => v || r.stop_condition || "-",
  },
  {
    title: "Params",
    dataIndex: "params",
    ellipsis: true,
    render: (v: Record<string, unknown> | null) => (
      <Typography.Text code ellipsis={{ tooltip: compactJson(v) }}>
        {compactJson(v)}
      </Typography.Text>
    ),
  },
  { title: "Sim Time", dataIndex: "final_sim_time_ms", width: 110, render: fmtMs },
  { title: "Wall Time", dataIndex: "wall_time_ms", width: 110, render: fmtMs },
  { title: "Steps", dataIndex: "total_steps", width: 90, render: (v: number | null) => v ?? "-" },
  {
    title: "Recorded",
    dataIndex: "created_at",
    width: 170,
    render: (v: string) => new Date(v).toLocaleString(),
  },
];

/** Server-paginated concrete-runs table for a task. Loads one page at a
 *  time (a task can have thousands), and refreshes the current page on a
 *  debounced SSE signal so a running task fills in live without spamming
 *  the API on every concrete_run event. */
export default function ConcreteRunsTable({ taskId }: { taskId: number }) {
  const [rows, setRows] = useState<ConcreteRunResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    (p: number, ps: number) => {
      setLoading(true);
      api
        .listConcreteRunsPage(taskId, ps, (p - 1) * ps)
        .then(({ rows: r, total: t }) => {
          setRows(r);
          setTotal(t);
        })
        .finally(() => setLoading(false));
    },
    [taskId],
  );

  // Reset to page 1 and load whenever the task changes.
  useEffect(() => {
    setPage(1);
    load(1, PAGE_SIZE);
  }, [taskId, load]);

  // Live refresh of the current page, debounced — concrete_run events
  // don't carry a task id, so collapse bursts into one reload.
  const pageRef = useRef({ page, pageSize });
  useEffect(() => {
    pageRef.current = { page, pageSize };
  }, [page, pageSize]);
  const timer = useRef<number | null>(null);
  usePisaEvents(
    useCallback(() => {
      if (timer.current !== null) return;
      timer.current = window.setTimeout(() => {
        timer.current = null;
        load(pageRef.current.page, pageRef.current.pageSize);
      }, 1500);
    }, [load]),
    useMemo(() => ({ kinds: ["row"] as const, rowTables: ["concrete_run"] as const }), []),
  );
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  return (
    <Table
      rowKey="id"
      loading={loading}
      columns={COLUMNS}
      dataSource={rows}
      size="small"
      scroll={{ x: 1100 }}
      pagination={{
        current: page,
        pageSize,
        total,
        showSizeChanger: true,
        showTotal: (t) => `${t.toLocaleString()} concrete runs`,
        onChange: (p, ps) => {
          setPage(p);
          setPageSize(ps);
          load(p, ps);
        },
      }}
    />
  );
}
