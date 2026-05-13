import type {
  AvResponse,
  SimulatorResponse,
  SamplerResponse,
  MonitorResponse,
  MapResponse,
  ScenarioResponse,
  PlanResponse,
  TaskResponse,
  TaskRunResponse,
  ExecutorResponse,
  MapFileMeta,
  ScenarioFileMeta,
  ConfigEntity,
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

const BATCH_CHUNK_SIZE = 200;

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function pgBatchUpdate<T>(table: string, ids: number[], data: Partial<T>): Promise<void> {
  if (ids.length === 0) return;
  for (const batch of chunk(ids, BATCH_CHUNK_SIZE)) {
    const res = await fetch(`${POSTGREST_URL}/${table}?id=in.(${batch.join(",")})`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  }
}

async function pgBatchDelete(table: string, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  for (const batch of chunk(ids, BATCH_CHUNK_SIZE)) {
    const res = await fetch(`${POSTGREST_URL}/${table}?id=in.(${batch.join(",")})`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  }
}

/** Bulk-insert rows via PostgREST array body. Sends up to `chunkSize` rows
 * per request and calls `onProgress` after each chunk so callers can render
 * progress during long runs. Uses Prefer: return=minimal to skip sending
 * the full inserted rows back over the wire. */
async function pgBatchCreate<T>(
  table: string,
  rows: Partial<T>[],
  onProgress?: (done: number, errors: number, total: number) => void,
  chunkSize = 500,
): Promise<{ done: number; errors: number }> {
  let done = 0;
  let errors = 0;
  if (rows.length === 0) return { done, errors };
  for (const batch of chunk(rows, chunkSize)) {
    try {
      const res = await fetch(`${POSTGREST_URL}/${table}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(batch),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      done += batch.length;
    } catch (e) {
      errors += batch.length;
      console.error(`pgBatchCreate(${table}) chunk failed`, e);
    }
    onProgress?.(done, errors, rows.length);
  }
  return { done, errors };
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

async function managerGetJson<T>(path: string): Promise<T> {
  const res = await fetch(`${MANAGER_URL}${path}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function managerPutBytes(path: string, body: Blob | ArrayBuffer | Uint8Array): Promise<void> {
  const res = await fetch(`${MANAGER_URL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: body as BodyInit,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

async function managerDelete(path: string): Promise<void> {
  const res = await fetch(`${MANAGER_URL}${path}`, { method: "DELETE" });
  // 404 is NOT silently OK — file paths are caller-supplied and an
  // encoding bug would let "I deleted X" report success while
  // hitting a different URL than the one that actually exists.
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

function managerFileUrl(path: string): string {
  return `${MANAGER_URL}${path}`;
}

/** Encode a `relative_path` such as `xodr/foo bar.xodr` or
 *  `weird/file?name#1.xosc` for safe interpolation into a manager URL.
 *  Each segment is encoded with encodeURIComponent so reserved chars
 *  (`#`, `?`, `%`, ` `, `+`, etc.) round-trip to the byte-identical
 *  string the server stored in `relative_path`. The path separator
 *  stays unencoded. Empty/.. segments would already have been rejected
 *  on upload by manager's reject_traversal — defensively skip them. */
function encodeRelPath(relPath: string): string {
  return relPath
    .split("/")
    .filter((seg) => seg !== "" && seg !== "." && seg !== "..")
    .map(encodeURIComponent)
    .join("/");
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
  createSimulator: (data: Partial<SimulatorResponse>) =>
    pgCreate<SimulatorResponse>("simulator", data),
  updateSimulator: (id: number, data: Partial<SimulatorResponse>) =>
    pgUpdate<SimulatorResponse>("simulator", id, data),
  deleteSimulator: (id: number) => pgDelete("simulator", id),

  // Samplers
  listSamplers: () => pgList<SamplerResponse>("sampler"),
  createSampler: (data: Partial<SamplerResponse>) => pgCreate<SamplerResponse>("sampler", data),
  updateSampler: (id: number, data: Partial<SamplerResponse>) =>
    pgUpdate<SamplerResponse>("sampler", id, data),
  deleteSampler: (id: number) => pgDelete("sampler", id),

  // Monitors — per-task condition tree (timeout / custom monitors).
  // Optional on a task; null = executor falls back to its bundled default.
  listMonitors: () => pgList<MonitorResponse>("monitor"),
  createMonitor: (data: Partial<MonitorResponse>) => pgCreate<MonitorResponse>("monitor", data),
  updateMonitor: (id: number, data: Partial<MonitorResponse>) =>
    pgUpdate<MonitorResponse>("monitor", id, data),
  deleteMonitor: (id: number) => pgDelete("monitor", id),

  // Maps
  listMaps: () => pgList<MapResponse>("map"),
  createMap: (data: Partial<MapResponse>) => pgCreate<MapResponse>("map", data),
  updateMap: (id: number, data: Partial<MapResponse>) => pgUpdate<MapResponse>("map", id, data),
  deleteMap: (id: number) => pgDelete("map", id),

  // Scenarios
  listScenarios: () => pgList<ScenarioResponse>("scenario"),
  createScenario: (data: Partial<ScenarioResponse>) => pgCreate<ScenarioResponse>("scenario", data),
  updateScenario: (id: number, data: Partial<ScenarioResponse>) =>
    pgUpdate<ScenarioResponse>("scenario", id, data),
  deleteScenario: (id: number) => pgDelete("scenario", id),

  // Plans
  listPlans: () => pgList<PlanResponse>("plan"),
  createPlan: (data: Partial<PlanResponse>) => pgCreate<PlanResponse>("plan", data),
  updatePlan: (id: number, data: Partial<PlanResponse>) => pgUpdate<PlanResponse>("plan", id, data),
  deletePlan: (id: number) => pgDelete("plan", id),

  // Tasks
  // Latest task_run fields are embedded so the row-level Log button can
  // open the drawer without another round-trip. `log` is intentionally
  // excluded — it's pulled lazily by the drawer via getTaskRunLog().
  listTasks: () =>
    pgList<TaskResponse>(
      "task?select=*,task_run(id,task_id,executor_id,attempt,task_run_status,started_at,finished_at,error_message)&task_run.order=attempt.desc&task_run.limit=1&order=id.desc",
    ),
  createTask: (data: Partial<TaskResponse>) => pgCreate<TaskResponse>("task", data),
  updateTask: (id: number, data: Partial<TaskResponse>) => pgUpdate<TaskResponse>("task", id, data),
  stopTask: async (id: number) => {
    // Abort any running task_runs first
    const res = await fetch(
      `${POSTGREST_URL}/task_run?task_id=eq.${id}&task_run_status=eq.running`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_run_status: "aborted",
          finished_at: new Date().toISOString(),
          error_message: "Stopped from web UI",
        }),
      },
    );
    if (!res.ok) throw new Error(`Failed to abort task runs: ${res.status}: ${await res.text()}`);
    await pgUpdate<TaskResponse>("task", id, { task_status: "aborted" });
  },
  // Soft-hide / unhide. Triage flow for `invalid` tasks the user has
  // decided aren't theirs to fix: archive=true keeps the row + history
  // but drops it from the default Tasks view.
  archiveTask: (id: number) => pgUpdate<TaskResponse>("task", id, { archived: true }),
  unarchiveTask: (id: number) => pgUpdate<TaskResponse>("task", id, { archived: false }),
  deleteTask: async (id: number) => {
    await pgDeleteWhere(`task_run?task_id=eq.${id}`);
    await pgDelete("task", id);
  },
  batchCreateTasks: (
    rows: Partial<TaskResponse>[],
    onProgress?: (done: number, errors: number, total: number) => void,
  ) => pgBatchCreate<TaskResponse>("task", rows, onProgress),
  batchRunTasks: (ids: number[]) =>
    pgBatchUpdate<TaskResponse>("task", ids, { task_status: "queued" }),
  batchStopTasks: async (ids: number[]) => {
    if (ids.length === 0) return;
    const abortData = {
      task_run_status: "aborted",
      finished_at: new Date().toISOString(),
      error_message: "Stopped from web UI",
    };
    for (const batch of chunk(ids, BATCH_CHUNK_SIZE)) {
      const res = await fetch(
        `${POSTGREST_URL}/task_run?task_id=in.(${batch.join(",")})&task_run_status=eq.running`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(abortData),
        },
      );
      if (!res.ok) throw new Error(`Failed to abort task runs: ${res.status}: ${await res.text()}`);
    }
    await pgBatchUpdate<TaskResponse>("task", ids, { task_status: "aborted" });
  },
  batchArchiveTasks: (ids: number[]) =>
    pgBatchUpdate<TaskResponse>("task", ids, { archived: true }),
  batchUnarchiveTasks: (ids: number[]) =>
    pgBatchUpdate<TaskResponse>("task", ids, { archived: false }),
  batchDeleteTasks: async (ids: number[]) => {
    if (ids.length === 0) return;
    for (const batch of chunk(ids, BATCH_CHUNK_SIZE)) {
      await pgDeleteWhere(`task_run?task_id=in.(${batch.join(",")})`);
    }
    await pgBatchDelete("task", ids);
  },

  // Task Runs — listing intentionally excludes the `log` column so expanding
  // a task row doesn't pull down hundreds of KB of captured output.
  listTaskRuns: (taskId: number, limit = 5, offset = 0) =>
    pgList<TaskRunResponse>(
      `task_run?task_id=eq.${taskId}&order=attempt.desc&limit=${limit}&offset=${offset}&select=id,task_id,executor_id,attempt,run_time_env,task_run_status,started_at,finished_at,error_message`,
    ),
  getTaskRunLog: async (runId: number): Promise<string | null> => {
    const rows = await pgList<{ log: string | null }>(`task_run?id=eq.${runId}&select=log`);
    return rows[0]?.log ?? null;
  },

  // Executors
  listExecutors: () => pgList<ExecutorResponse>("executor"),

  // --- Business logic via Manager API ---

  taskClaim: (data: { executor_id: number; [k: string]: unknown }) =>
    managerPost("/task/claim", data),
  taskFailed: (data: { task_id: number; reason?: string }) => managerPost("/task/failed", data),
  taskInvalid: (data: { task_id: number; reason?: string }) => managerPost("/task/invalid", data),
  taskSucceeded: (data: { task_id: number }) => managerPost("/task/succeeded", data),

  // --- Byte-level file access via Manager API ---

  listMapFiles: (mapId: number) => managerGetJson<MapFileMeta[]>(`/map/${mapId}/file`),
  mapFileUrl: (mapId: number, relPath: string) =>
    managerFileUrl(`/map/${mapId}/file/${encodeRelPath(relPath)}`),
  uploadMapFile: (mapId: number, relPath: string, content: Blob) =>
    managerPutBytes(`/map/${mapId}/file/${encodeRelPath(relPath)}`, content),
  deleteMapFile: (mapId: number, relPath: string) =>
    managerDelete(`/map/${mapId}/file/${encodeRelPath(relPath)}`),

  listScenarioFiles: (scenarioId: number) =>
    managerGetJson<ScenarioFileMeta[]>(`/scenario/${scenarioId}/file`),
  scenarioFileUrl: (scenarioId: number, relPath: string) =>
    managerFileUrl(`/scenario/${scenarioId}/file/${encodeRelPath(relPath)}`),
  uploadScenarioFile: (scenarioId: number, relPath: string, content: Blob) =>
    managerPutBytes(`/scenario/${scenarioId}/file/${encodeRelPath(relPath)}`, content),
  deleteScenarioFile: (scenarioId: number, relPath: string) =>
    managerDelete(`/scenario/${scenarioId}/file/${encodeRelPath(relPath)}`),

  configUrl: (entity: ConfigEntity, id: number) => managerFileUrl(`/${entity}/${id}/config`),
  uploadConfig: (entity: ConfigEntity, id: number, content: Blob) =>
    managerPutBytes(`/${entity}/${id}/config`, content),
  deleteConfig: (entity: ConfigEntity, id: number) => managerDelete(`/${entity}/${id}/config`),
};
