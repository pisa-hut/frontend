import { Space, Tag, Typography } from "antd";
import type { TaskResponse, TaskStatus } from "../../api/types";

/** Quick-filter scope shown above the Tasks table.
 *
 *  - `all` — every chip-matching row (archived included only when
 *    the page-level "Show archived" toggle is on; otherwise excluded)
 *  - `triage` — invalid (chip's archived behaviour follows the toggle
 *    above; defaults to non-archived only)
 *  - `archived` — archived rows only (the chip itself IS the toggle)
 *  - any `TaskStatus` — that status (archived behaviour follows the toggle)
 */
export type QuickFilter = "all" | "triage" | "archived" | TaskStatus;

export const QUICK_FILTERS: { value: QuickFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "triage", label: "Triage" },
  { value: "idle", label: "Idle" },
  { value: "running", label: "Running" },
  { value: "queued", label: "Queued" },
  { value: "completed", label: "Completed" },
  { value: "invalid", label: "Invalid" },
  { value: "aborted", label: "Aborted" },
  { value: "archived", label: "Archived" },
];

function countFor(value: QuickFilter, tasks: TaskResponse[], includeArchived: boolean): number {
  const passesArchive = (t: TaskResponse) => includeArchived || !t.archived;
  switch (value) {
    case "all":
      return tasks.filter(passesArchive).length;
    case "triage":
      return tasks.filter((t) => t.task_status === "invalid" && passesArchive(t)).length;
    case "archived":
      return tasks.filter((t) => t.archived).length;
    default:
      return tasks.filter((t) => t.task_status === value && passesArchive(t)).length;
  }
}

interface Props {
  tasks: TaskResponse[];
  quickFilter: QuickFilter;
  onChange: (q: QuickFilter) => void;
  /** Whether the page-level "Show archived" toggle is on. Counts must
   *  agree with the actual rendered row count. */
  includeArchived: boolean;
}

export default function TasksFilters({ tasks, quickFilter, onChange, includeArchived }: Props) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <Typography.Text
        type="secondary"
        style={{ fontSize: 12, minWidth: 64, paddingTop: 4, textAlign: "right" }}
      >
        Status
      </Typography.Text>
      <Space size={[6, 6]} wrap style={{ flex: 1, minWidth: 0 }}>
        {QUICK_FILTERS.map((q) => {
          const count = countFor(q.value, tasks, includeArchived);
          const active = quickFilter === q.value;
          return (
            <Tag.CheckableTag
              key={q.value}
              checked={active}
              onChange={() => onChange(q.value)}
              style={{ padding: "2px 10px", fontSize: 12, marginInlineEnd: 0 }}
            >
              {q.label}
              <span
                style={{
                  marginLeft: 6,
                  opacity: 0.65,
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 11,
                }}
              >
                {count}
              </span>
            </Tag.CheckableTag>
          );
        })}
      </Space>
    </div>
  );
}
