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
export type ConcreteRunStatus = "finished" | "failed" | "aborted" | "skipped";
export type ConcreteTestOutcome = "success" | "fail" | "invalid" | "unknown";

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
  /** SLURM resource hint. Summed with the simulator's value when the
   *  scheduler sizes the per-task sbatch. 0 = "unset" (clamped to 1
   *  CPU minimum at submit time). */
  cpu_count: number;
  memory_gb: number;
  gpu_count: number;
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
  cpu_count: number;
  memory_gb: number;
  gpu_count: number;
}

export interface SamplerResponse {
  id: number;
  name: string;
  config_path?: string | null;
  config_sha256?: string | null;
}

export interface MonitorResponse {
  id: number;
  name: string;
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
  /** Denormalised "started_at of the latest task_run" — kept current
   *  by a Postgres trigger added in m20260516. NULL when the task has
   *  never run. Server-side sortable so PostgREST can do
   *  `?order=last_run_at.desc.nullslast`. */
  last_run_at: string | null;
  /** Soft-hide flag (server-side; not exposed in the UI any more). */
  archived: boolean;
  /** Boost lever for "Run next". 0 = normal, 100 = boosted; claim
   *  ordering puts higher priority first. Always set by the writer
   *  (Run resets to 0, Run-next sets to 100). */
  queue_priority: number;
  /** Time the row entered the `queued` state (or had its
   *  queue_priority bumped while queued). Maintained by a trigger in
   *  m20260604; nullable for tasks that have never been queued. Used
   *  as the FIFO tiebreaker in claim ordering. */
  queued_at: string | null;
  /** The most recent attempt; populated by listTasks via a nested select. */
  task_run?: TaskRunResponse[];
}

/** Lightweight projection of `task` for chip-count badges and
 *  "select-all-filtered" computation. Drops `task_run` and other
 *  heavy fields so the all-rows fetch is small even at 5000+ rows. */
export interface TaskSummary {
  id: number;
  task_status: TaskStatus;
  av_id: number;
  simulator_id: number;
  sampler_id: number;
  monitor_id: number;
  plan_id: number;
  archived: boolean;
}

export interface TasksPageQuery {
  page: number; // 1-indexed
  pageSize: number;
  sort: { key: "id" | "attempt_count" | "last_run_at"; order: "asc" | "desc" };
  status?: TaskStatus[];
  avIds?: number[];
  simIds?: number[];
  samplerIds?: number[];
  monitorIds?: number[];
  /** Plan-tag filter — OR semantics: any of these. */
  tags?: string[];
  /** Exact-id filter from the ID column dropdown. */
  ids?: number[];
  /** Plan-name substring search (ilike). */
  planSearch?: string;
  /** When true, the query omits the default `archived=false` filter so
   *  the page also returns archived tasks. Default false. */
  includeArchived?: boolean;
  /** Cancellation handle so a stale fetch doesn't clobber a fresh one. */
  signal?: AbortSignal;
}

export interface TasksPage {
  rows: TaskResponse[];
  /** Total matching rows server-side, regardless of page. */
  total: number;
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
  /** Cumulative count of concrete scenarios across this task (every
   *  attempt contributes). The latest task_run carries the latest
   *  cumulative; older rows snapshot whatever the cumulative was at
   *  the moment that attempt finalised. Optional on the type because
   *  some select-clauses (`listTaskRuns`) omit them to keep payload
   *  small. */
  finished_concrete_runs?: number;
  aborted_concrete_runs?: number;
  skipped_concrete_runs?: number;
}

export interface ConcreteRunResponse {
  id: number;
  task_id: number;
  task_run_id: number;
  concrete_key: string;
  status: ConcreteRunStatus;
  test_outcome: ConcreteTestOutcome;
  reason: string | null;
  stop_condition: string | null;
  params: Record<string, unknown> | null;
  final_sim_time_ms: number | null;
  wall_time_ms: number | null;
  total_steps: number | null;
  created_at: string;
}

export interface ExecutorResponse {
  id: number;
  slurm_job_id: number;
  slurm_node_list: string;
  hostname: string;
}
