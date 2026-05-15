import { memo, useCallback, useMemo } from "react";
import { Space, Tag, Typography } from "antd";
import type { TaskStatus, TaskSummary } from "../../api/types";

export type QuickFilter = "all" | TaskStatus;

export const QUICK_FILTERS: { value: QuickFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "idle", label: "Idle" },
  { value: "running", label: "Running" },
  { value: "queued", label: "Queued" },
  { value: "completed", label: "Completed" },
  { value: "invalid", label: "Invalid" },
  { value: "aborted", label: "Aborted" },
];

const CHIP_STYLE = { padding: "2px 10px", fontSize: 12, marginInlineEnd: 0 };
const CHIP_COUNT_STYLE = {
  marginLeft: 6,
  opacity: 0.65,
  fontVariantNumeric: "tabular-nums" as const,
  fontSize: 11,
};
const ROW_STYLE = { display: "flex", alignItems: "flex-start", gap: 12 };
const LABEL_STYLE = {
  fontSize: 12,
  minWidth: 64,
  paddingTop: 4,
  textAlign: "right" as const,
};
const CHIPS_BOX_STYLE = { flex: 1, minWidth: 0 };

const StatusChip = memo(function StatusChip({
  value,
  label,
  count,
  active,
  onToggle,
}: {
  value: QuickFilter;
  label: string;
  count: number;
  active: boolean;
  onToggle: (v: QuickFilter) => void;
}) {
  return (
    <Tag.CheckableTag checked={active} onChange={() => onToggle(value)} style={CHIP_STYLE}>
      {label}
      <span style={CHIP_COUNT_STYLE}>{count}</span>
    </Tag.CheckableTag>
  );
});

interface Props {
  /** Lightweight summary list — counts come from this so they reflect
   *  the global task population, not just the current paginated page. */
  summaries: TaskSummary[];
  quickFilter: QuickFilter;
  onChange: (q: QuickFilter) => void;
}

export default function TasksFilters({ summaries, quickFilter, onChange }: Props) {
  // One pass for all status counts.
  const counts = useMemo(() => {
    let all = 0;
    const byStatus: Record<TaskStatus, number> = {
      idle: 0,
      queued: 0,
      running: 0,
      completed: 0,
      invalid: 0,
      aborted: 0,
    };
    for (const t of summaries) {
      all++;
      byStatus[t.task_status]++;
    }
    return { all, byStatus };
  }, [summaries]);

  const countFor = (q: QuickFilter): number => (q === "all" ? counts.all : counts.byStatus[q]);

  const handleToggle = useCallback((q: QuickFilter) => onChange(q), [onChange]);

  return (
    <div style={ROW_STYLE}>
      <Typography.Text type="secondary" style={LABEL_STYLE}>
        Status
      </Typography.Text>
      <Space size={[6, 6]} wrap style={CHIPS_BOX_STYLE}>
        {QUICK_FILTERS.map((q) => (
          <StatusChip
            key={q.value}
            value={q.value}
            label={q.label}
            count={countFor(q.value)}
            active={quickFilter === q.value}
            onToggle={handleToggle}
          />
        ))}
      </Space>
    </div>
  );
}
