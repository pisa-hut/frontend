import type {
  AvResponse,
  SimulatorResponse,
  SamplerResponse,
  MapResponse,
  ScenarioResponse,
  PlanResponse,
  TaskResponse,
  TaskRunResponse,
  ExecutorResponse,
} from "./types";

const POSTGREST_URL = import.meta.env.VITE_POSTGREST_URL ?? "/postgrest";
const MANAGER_URL = import.meta.env.VITE_MANAGER_URL ?? "/manager";

// PostgREST helpers

async function pgList<T>(table: string): Promise<T[]> {
  const res = await fetch(`${POSTGREST_URL}/${table}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function pgCreate<T>(table: string, data: Partial<T>): Promise<T> {
  const res = await fetch(`${POSTGREST_URL}/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return rows[0];
}

async function pgUpdate<T>(table: string, id: number, data: Partial<T>): Promise<T> {
  const res = await fetch(`${POSTGREST_URL}/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return rows[0];
}

async function pgDelete(table: string, id: number): Promise<void> {
  const res = await fetch(`${POSTGREST_URL}/${table}?id=eq.${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

async function pgDeleteWhere(tableAndFilter: string): Promise<void> {
  const res = await fetch(`${POSTGREST_URL}/${tableAndFilter}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

// Manager API helpers (business logic only)

async function managerPost<T>(path: string, data?: unknown): Promise<T> {
  const res = await fetch(`${MANAGER_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export const api = {
  // --- CRUD via PostgREST ---

  // AVs
  listAvs: () => pgList<AvResponse>("av"),
  createAv: (data: Partial<AvResponse>) => pgCreate<AvResponse>("av", data),
  updateAv: (id: number, data: Partial<AvResponse>) => pgUpdate<AvResponse>("av", id, data),
  deleteAv: (id: number) => pgDelete("av", id),

  // Simulators
  listSimulators: () => pgList<SimulatorResponse>("simulator"),
  createSimulator: (data: Partial<SimulatorResponse>) => pgCreate<SimulatorResponse>("simulator", data),
  updateSimulator: (id: number, data: Partial<SimulatorResponse>) => pgUpdate<SimulatorResponse>("simulator", id, data),
  deleteSimulator: (id: number) => pgDelete("simulator", id),

  // Samplers
  listSamplers: () => pgList<SamplerResponse>("sampler"),
  createSampler: (data: Partial<SamplerResponse>) => pgCreate<SamplerResponse>("sampler", data),
  updateSampler: (id: number, data: Partial<SamplerResponse>) => pgUpdate<SamplerResponse>("sampler", id, data),
  deleteSampler: (id: number) => pgDelete("sampler", id),

  // Maps
  listMaps: () => pgList<MapResponse>("map"),
  createMap: (data: Partial<MapResponse>) => pgCreate<MapResponse>("map", data),
  updateMap: (id: number, data: Partial<MapResponse>) => pgUpdate<MapResponse>("map", id, data),
  deleteMap: (id: number) => pgDelete("map", id),

  // Scenarios
  listScenarios: () => pgList<ScenarioResponse>("scenario"),
  createScenario: (data: Partial<ScenarioResponse>) => pgCreate<ScenarioResponse>("scenario", data),
  updateScenario: (id: number, data: Partial<ScenarioResponse>) => pgUpdate<ScenarioResponse>("scenario", id, data),
  deleteScenario: (id: number) => pgDelete("scenario", id),

  // Plans
  listPlans: () => pgList<PlanResponse>("plan"),
  createPlan: (data: Partial<PlanResponse>) => pgCreate<PlanResponse>("plan", data),
  updatePlan: (id: number, data: Partial<PlanResponse>) => pgUpdate<PlanResponse>("plan", id, data),
  deletePlan: (id: number) => pgDelete("plan", id),

  // Tasks
  listTasks: () => pgList<TaskResponse>("task?select=*,task_run(started_at)&task_run.order=attempt.desc&task_run.limit=1&order=id.desc"),
  createTask: (data: Partial<TaskResponse>) => pgCreate<TaskResponse>("task", data),
  updateTask: (id: number, data: Partial<TaskResponse>) => pgUpdate<TaskResponse>("task", id, data),
  stopTask: async (id: number) => {
    // Abort any running task_runs first
    const res = await fetch(`${POSTGREST_URL}/task_run?task_id=eq.${id}&task_run_status=eq.running`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_run_status: "aborted", finished_at: new Date().toISOString(), error_message: "Stopped from web UI" }),
    });
    if (!res.ok) throw new Error(`Failed to abort task runs: ${res.status}: ${await res.text()}`);
    await pgUpdate<TaskResponse>("task", id, { task_status: "created" });
  },
  deleteTask: async (id: number) => {
    await pgDeleteWhere(`task_run?task_id=eq.${id}`);
    await pgDelete("task", id);
  },

  // Task Runs
  listTaskRuns: (taskId: number) =>
    pgList<TaskRunResponse>(`task_run?task_id=eq.${taskId}&order=attempt.desc&limit=5`),

  // Executors
  listExecutors: () => pgList<ExecutorResponse>("executor"),

  // --- Business logic via Manager API ---

  taskClaim: (data: { executor_id: number; [k: string]: unknown }) =>
    managerPost("/task/claim", data),
  taskFailed: (data: { task_id: number; reason?: string }) =>
    managerPost("/task/failed", data),
  taskInvalid: (data: { task_id: number; reason?: string }) =>
    managerPost("/task/invalid", data),
  taskSucceeded: (data: { task_id: number }) =>
    managerPost("/task/succeeded", data),
};
