export type TaskStatus = "created" | "pending" | "running" | "completed" | "failed" | "invalid";
export type TaskRunStatus = "running" | "completed" | "failed" | "aborted";
export type ScenarioFormat = "open_scenario1" | "open_scenario2" | "carla_lb_route";

export interface AvResponse {
  id: number;
  name: string;
  image_path: Record<string, unknown>;
  config_path: string;
  nv_runtime: boolean;
  carla_runtime: boolean;
  ros_runtime: boolean;
}

export interface SimulatorResponse {
  id: number;
  name: string;
  image_path: Record<string, unknown>;
  config_path: string;
  nv_runtime: boolean;
  carla_runtime: boolean;
  ros_runtime: boolean;
}

export interface SamplerResponse {
  id: number;
  name: string;
  config_path: string | null;
  module_path: string;
}

export interface MapResponse {
  id: number;
  name: string;
  xodr_path: string | null;
  osm_path: string | null;
}

export interface ScenarioResponse {
  id: number;
  scenario_format: ScenarioFormat;
  title: string | null;
  scenario_path: string;
  goal_config: unknown;
}

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
  retry_count: number;
}

export interface ExecutorResponse {
  id: number;
  slurm_job_id: number;
  slurm_array_id: number;
  slurm_node_list: string;
  hostname: string;
}
