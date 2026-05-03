import { Badge, Button } from "antd";
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
  // The Archived chip is itself the archived filter — `includeArchived`
  // doesn't apply. Every other chip honours it so the badge count
  // matches the row count rendered in the table.
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
  /** Whether the page-level "Show archived" toggle is on. The chip
   *  badge counts must agree with the actual rendered row count, so
   *  every non-`Archived` chip's count includes archived rows when
   *  this is true. */
  includeArchived: boolean;
}

/** Quick-filter chip bar shown above the Tasks table. Counts are
 *  re-derived on every render so the user can see triage backlog at
 *  a glance, and the "active" chip styling makes the current scope
 *  obvious without reading the URL. */
export default function TasksFilters({ tasks, quickFilter, onChange, includeArchived }: Props) {
  return (
    <div style={{ marginBottom: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
      {QUICK_FILTERS.map((q) => {
        const count = countFor(q.value, tasks, includeArchived);
        const active = quickFilter === q.value;
        return (
          <Button
            key={q.value}
            size="small"
            type={active ? "primary" : "default"}
            onClick={() => onChange(q.value)}
          >
            {q.label}
            <Badge
              count={count}
              showZero
              color={active ? "#fff" : undefined}
              style={{
                marginLeft: 6,
                backgroundColor: active ? "rgba(255,255,255,0.18)" : undefined,
                color: active ? "#fff" : undefined,
              }}
            />
          </Button>
        );
      })}
    </div>
  );
}
