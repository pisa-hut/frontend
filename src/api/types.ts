export type TaskStatus =
  | "idle" // not queued; brand-new or user hasn't re-Run
  | "queued" // waiting for an executor
  | "running" // exactly one task_run is active
  | "completed" // finished successfully
  | "invalid" // permanent fail: USELESS_STREAK_LIMIT consecutive runs finished zero concretes
  | "aborted"; // user Stop or scancel — needs manual Run to resume
// task_run_status is "did engine.exec() return cleanly?" — orthogonal
// to concrete_scenarios_executed, which tracks how much useful work the
// run produced. A run can legitimately be `failed` with concrete > 0.
export type TaskRunStatus =
  | "running"
  | "completed" // exec() returned without raising
  | "failed" // exec() raised
  | "aborted"; // cancelled (SIGTERM / scancel / user Stop)
export type ScenarioFormat = "open_scenario1" | "open_scenario2" | "carla_lb_route";

/** Task states the user can re-Run from. Anything not in this set is
 *  either already in flight (queued/running) or, well, idle/aborted/etc.
 *  Used by the Tasks page action column AND the LogDrawer's Run button —
 *  the drawer needs the same gate so opening an old completed attempt
 *  on a task that's currently running can't re-queue it under itself. */
export const RUNNABLE_TASK_STATUSES: readonly TaskStatus[] = [
  "idle",
  "completed",
  "invalid",
  "aborted",
] as const;

export interface AvResponse {
  id: number;
  name: string;
  image_path: Record<string, unknown>;
  config_path?: string | null;
  nv_runtime: boolean;
  carla_runtime: boolean;
  ros_runtime: boolean;
  config_sha256?: string | null;
}

export interface SimulatorResponse {
  id: number;
  name: string;
  image_path: Record<string, unknown>;
  config_path?: string | null;
  nv_runtime: boolean;
  carla_runtime: boolean;
  ros_runtime: boolean;
  config_sha256?: string | null;
}

export interface SamplerResponse {
  id: number;
  name: string;
  config_path?: string | null;
  module_path: string;
  config_sha256?: string | null;
}

export interface MonitorResponse {
  id: number;
  name: string;
  module_path: string;
  config_sha256?: string | null;
}

export interface MapResponse {
  id: number;
  name: string;
  xodr_path?: string | null;
  osm_path?: string | null;
}

export interface ScenarioResponse {
  id: number;
  scenario_format: ScenarioFormat;
  title: string | null;
  scenario_path?: string;
}

export interface MapFileMeta {
  id: number;
  map_id: number;
  relative_path: string;
  content_sha256: string;
  size: number;
}

export interface ScenarioFileMeta {
  id: number;
  scenario_id: number;
  relative_path: string;
  content_sha256: string;
  size: number;
}

export type ConfigEntity = "av" | "simulator" | "sampler" | "monitor";

export interface PlanResponse {
  id: number;
  name: string;
  map_id: number;
  scenario_id: number;
  /** Free-form labels for grouping. Empty array when none set.
   *  Drives the tag filter in the bulk-create-task modal. */
  tags: string[];
}

export interface TaskResponse {
  id: number;
  plan_id: number;
  av_id: number;
  simulator_id: number;
  sampler_id: number;
  /** Required FK to the per-task monitor (timeout / condition tree).
   *  Every task pins exactly one monitor since the manager m20260513
   *  migration; the executor no longer carries a fallback default. */
  monitor_id: number;
  task_status: TaskStatus;
  created_at: string;
  attempt_count: number;
  /** Soft-hide flag, orthogonal to task_status. Triage of an `invalid`
   *  task that the user decided isn't theirs to fix flips this to true
   *  so the row drops out of the default Tasks view. */
  archived: boolean;
  /** The most recent attempt; populated by listTasks via a nested select. */
  task_run?: TaskRunResponse[];
}

export interface TaskRunResponse {
  id: number;
  task_id: number;
  executor_id: number;
  attempt: number;
  run_time_env: unknown;
  task_run_status: TaskRunStatus;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  // Not fetched by listTaskRuns to keep payload small — use api.getTaskRunLog(id).
  log?: string | null;
}

export interface ExecutorResponse {
  id: number;
  slurm_job_id: number;
  slurm_node_list: string;
  hostname: string;
}
