export type TaskStatus =
  | "idle"       // not queued; brand-new or user hasn't re-Run
  | "queued"     // waiting for an executor
  | "running"    // exactly one task_run is active
  | "completed"  // finished successfully
  | "exhausted"  // 10 consecutive useless task_runs — permanent fail
  | "invalid"    // scenario/config rejected — don't retry
  | "aborted";   // user Stop or scancel — needs manual Run to resume
export type TaskRunStatus =
  | "running"
  | "completed"
  | "failed"    // transient per-run crash (retryable)
  | "aborted"   // cancelled mid-run
  | "invalid";  // rejected by executor on bad config
export type ScenarioFormat = "open_scenario1" | "open_scenario2" | "carla_lb_route";

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

export type ConfigEntity = "av" | "simulator" | "sampler";

export interface PlanResponse {
  id: number;
  name: string;
  map_id: number;
  scenario_id: number;
}

export interface TaskResponse {
  id: number;
  plan_id: number;
  av_id: number;
  simulator_id: number;
  sampler_id: number;
  task_status: TaskStatus;
  created_at: string;
  attempt_count: number;
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
  slurm_array_id: number;
  slurm_node_list: string;
  hostname: string;
}
