import type { TaskStatus, TaskRunStatus } from "../api/types";

/** AntD `<Tag color="...">` string for each task status — the
 *  semantic colour names ("warning", "success", "error", etc.) so
 *  AntD theme switches drive the actual hex.
 *
 *  Centralised here because the same map had grown copies in
 *  `pages/Tasks.tsx`, `components/LogDrawer.tsx`, and (implicitly)
 *  `components/TaskRunsPanel.tsx`. Single source of truth keeps the
 *  three views in sync the next time we add or rename a status. */
export const TASK_STATUS_TAG_COLOR: Record<TaskStatus, string> = {
  idle: "default",
  queued: "warning",
  running: "processing",
  completed: "success",
  invalid: "error",
  aborted: "default",
};

/** Hex colour for places that need a raw value (Statistic prefix
 *  icons, dashboard tiles). AntD's named colours don't apply to
 *  inline `<Statistic valueStyle={{color: ...}}>` so we keep an
 *  explicit hex map alongside. */
export const TASK_STATUS_HEX: Record<TaskStatus, string> = {
  idle: "#8c8c8c",
  queued: "#faad14",
  running: "#1890ff",
  completed: "#52c41a",
  invalid: "#ff4d4f",
  aborted: "#ff7875",
};

/** Title-case label for any UI surface that displays the status as
 *  prose ("Idle", "Queued") rather than the raw enum string. */
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  idle: "Idle",
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  invalid: "Invalid",
  aborted: "Aborted",
};

/** Same idea for `task_run_status` (the per-attempt outcome). The
 *  enum is narrower — `task_run` never lands as `idle/queued/invalid`. */
export const TASK_RUN_STATUS_TAG_COLOR: Record<TaskRunStatus, string> = {
  running: "processing",
  completed: "success",
  failed: "error",
  aborted: "default",
};
