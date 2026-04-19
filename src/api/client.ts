import type {
  AvResponse,
  CreateAvRequest,
  SimulatorResponse,
  CreateSimulatorRequest,
  SamplerResponse,
  CreateSamplerRequest,
  MapResponse,
  CreateMapRequest,
  ScenarioResponse,
  CreateScenarioRequest,
  PlanResponse,
  CreatePlanRequest,
  TaskResponse,
  CreateTaskRequest,
  ExecutorResponse,
} from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/manager";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  // AVs
  listAvs: () => request<AvResponse[]>("/av"),
  createAv: (data: CreateAvRequest) =>
    request<AvResponse>("/av", { method: "POST", body: JSON.stringify(data) }),

  // Simulators
  listSimulators: () => request<SimulatorResponse[]>("/simulator"),
  createSimulator: (data: CreateSimulatorRequest) =>
    request<SimulatorResponse>("/simulator", { method: "POST", body: JSON.stringify(data) }),

  // Samplers
  listSamplers: () => request<SamplerResponse[]>("/sampler"),
  createSampler: (data: CreateSamplerRequest) =>
    request<SamplerResponse>("/sampler", { method: "POST", body: JSON.stringify(data) }),

  // Maps
  listMaps: () => request<MapResponse[]>("/map"),
  createMap: (data: CreateMapRequest) =>
    request<MapResponse>("/map", { method: "POST", body: JSON.stringify(data) }),

  // Scenarios
  listScenarios: () => request<ScenarioResponse[]>("/scenario"),
  createScenario: (data: CreateScenarioRequest) =>
    request<ScenarioResponse>("/scenario", { method: "POST", body: JSON.stringify(data) }),

  // Plans
  listPlans: () => request<PlanResponse[]>("/plan"),
  createPlan: (data: CreatePlanRequest) =>
    request<PlanResponse>("/plan", { method: "POST", body: JSON.stringify(data) }),

  // Tasks
  listTasks: () => request<TaskResponse[]>("/task"),
  createTask: (data: CreateTaskRequest) =>
    request<TaskResponse>("/task", { method: "POST", body: JSON.stringify(data) }),

  // Executors
  listExecutors: () => request<ExecutorResponse[]>("/executor"),
};
