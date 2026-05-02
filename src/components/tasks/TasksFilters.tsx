import { Badge, Button } from "antd";
import type { TaskResponse, TaskStatus } from "../../api/types";

/** Quick-filter scope shown above the Tasks table.
 *
 *  - `all` — non-archived rows only
 *  - `triage` — invalid + non-archived (the actionable inbox)
 *  - `archived` — archived rows only
 *  - any `TaskStatus` — that status, non-archived
 */
export type QuickFilter = "all" | "triage" | "archived" | TaskStatus;

export const QUICK_FILTERS: { value: QuickFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "triage", label: "Triage" },
  { value: "running", label: "Running" },
  { value: "queued", label: "Queued" },
  { value: "completed", label: "Completed" },
  { value: "invalid", label: "Invalid" },
  { value: "aborted", label: "Aborted" },
  { value: "archived", label: "Archived" },
];

function countFor(value: QuickFilter, tasks: TaskResponse[]): number {
  switch (value) {
    case "all":
      return tasks.filter((t) => !t.archived).length;
    case "triage":
      return tasks.filter((t) => t.task_status === "invalid" && !t.archived).length;
    case "archived":
      return tasks.filter((t) => t.archived).length;
    default:
      return tasks.filter((t) => t.task_status === value && !t.archived).length;
  }
}

interface Props {
  tasks: TaskResponse[];
  quickFilter: QuickFilter;
  onChange: (q: QuickFilter) => void;
}

/** Quick-filter chip bar shown above the Tasks table. Counts are
 *  re-derived on every render so the user can see triage backlog at
 *  a glance, and the "active" chip styling makes the current scope
 *  obvious without reading the URL. */
export default function TasksFilters({ tasks, quickFilter, onChange }: Props) {
  return (
    <div style={{ marginBottom: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
      {QUICK_FILTERS.map((q) => {
        const count = countFor(q.value, tasks);
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
