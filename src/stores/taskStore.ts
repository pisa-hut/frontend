import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { api } from "../api/client";
import type { TaskResponse } from "../api/types";
import { usePisaEvents } from "../api/events";

export type TaskStoreStatus = "idle" | "loading" | "ready" | "error";

export interface TaskStoreState {
  status: TaskStoreStatus;
  /** Rows loaded so far (grows as chunks arrive on first load). */
  loaded: number;
  /** Total rows server-side (from Content-Range on the first chunk). */
  total: number;
  error?: string;
}

/** The slice of the api client the store depends on — injectable for tests. */
export interface TaskStoreApi {
  fetchTaskRowsChunk: (
    offset: number,
    limit: number,
    signal?: AbortSignal,
  ) => Promise<{ rows: TaskResponse[]; total: number }>;
  fetchTaskRowsByIds: (ids: number[]) => Promise<TaskResponse[]>;
  fetchTaskIdsForRuns: (runIds: number[]) => Promise<number[]>;
}

const DEFAULT_CHUNK = 2000;

/**
 * In-memory store of the entire task set, keyed by id. Loaded once
 * (chunked) and kept live by patching from SSE row events, so the Tasks
 * table can filter / sort / scroll entirely client-side with no
 * per-interaction network. A singleton (`taskStore`) backs the app;
 * `createTaskStore` exists so tests can inject a fake api.
 */
export function createTaskStore(client: TaskStoreApi, chunkSize = DEFAULT_CHUNK) {
  const rows = new Map<number, TaskResponse>();
  let rowsSnap: TaskResponse[] = [];
  let state: TaskStoreState = { status: "idle", loaded: 0, total: 0 };
  const listeners = new Set<() => void>();
  let loadPromise: Promise<void> | null = null;

  const notify = () => {
    for (const l of listeners) l();
  };
  const commitRows = () => {
    rowsSnap = Array.from(rows.values());
    notify();
  };
  const setState = (patch: Partial<TaskStoreState>) => {
    state = { ...state, ...patch };
    notify();
  };

  function upsert(list: TaskResponse[]) {
    for (const r of list) rows.set(r.id, r);
  }
  function removeIds(ids: number[]): boolean {
    let changed = false;
    for (const id of ids) changed = rows.delete(id) || changed;
    return changed;
  }

  async function runInitialLoad() {
    setState({ status: "loading", loaded: 0, total: 0, error: undefined });
    let offset = 0;
    let total = 0;
    try {
      for (;;) {
        const res = await client.fetchTaskRowsChunk(offset, chunkSize);
        total = res.total;
        upsert(res.rows); // additive: first load grows the set, paints progressively
        offset += res.rows.length;
        commitRows();
        const done = res.rows.length < chunkSize || offset >= total;
        setState({ status: done ? "ready" : "loading", loaded: rows.size, total });
        if (done) break;
      }
    } catch (e) {
      setState({ status: "error", error: String(e) });
      throw e;
    }
  }

  return {
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    getRows: () => rowsSnap,
    getState: () => state,

    /** Start the one-time chunked load if it hasn't run; idempotent. */
    ensureLoaded(): Promise<void> {
      if (state.status === "ready") return Promise.resolve();
      if (loadPromise) return loadPromise;
      loadPromise = runInitialLoad().finally(() => {
        loadPromise = null;
      });
      return loadPromise;
    },

    /** Full reload into a fresh set, then swap — catches deletions that
     *  incremental patching can miss (used after an SSE reconnect). */
    async resync(): Promise<void> {
      const fresh = new Map<number, TaskResponse>();
      let offset = 0;
      let total = 0;
      for (;;) {
        const res = await client.fetchTaskRowsChunk(offset, chunkSize);
        total = res.total;
        for (const r of res.rows) fresh.set(r.id, r);
        offset += res.rows.length;
        if (res.rows.length < chunkSize || offset >= total) break;
      }
      rows.clear();
      for (const [k, v] of fresh) rows.set(k, v);
      commitRows();
      setState({ status: "ready", loaded: rows.size, total });
    },

    /** Refetch the given task ids and upsert; ids that come back empty
     *  are treated as deleted and removed. */
    async patchTaskIds(ids: number[]): Promise<void> {
      if (ids.length === 0) return;
      const fetched = await client.fetchTaskRowsByIds(ids);
      upsert(fetched);
      const got = new Set(fetched.map((r) => r.id));
      removeIds(ids.filter((id) => !got.has(id)));
      commitRows();
    },

    /** Resolve run ids → task ids, then patch those tasks. */
    async patchRunIds(runIds: number[]): Promise<void> {
      if (runIds.length === 0) return;
      const taskIds = await client.fetchTaskIdsForRuns(runIds);
      await this.patchTaskIds(taskIds);
    },

    /** Remove tasks immediately (SSE task delete needs no fetch). */
    removeTasks(ids: number[]) {
      if (removeIds(ids)) commitRows();
    },
  };
}

export type TaskStore = ReturnType<typeof createTaskStore>;

export const taskStore: TaskStore = createTaskStore({
  fetchTaskRowsChunk: api.fetchTaskRowsChunk,
  fetchTaskRowsByIds: api.fetchTaskRowsByIds,
  fetchTaskIdsForRuns: api.fetchTaskIdsForRuns,
});

/** Subscribe a component to the store; kicks off the load on first mount. */
export function useTaskStore(store: TaskStore = taskStore) {
  const rows = useSyncExternalStore(store.subscribe, store.getRows);
  const state = useSyncExternalStore(store.subscribe, store.getState);
  useEffect(() => {
    store.ensureLoaded().catch(() => {
      /* surfaced via state.status === "error" */
    });
  }, [store]);
  return { rows, state };
}

const PATCH_DEBOUNCE_MS = 300;

// Stable filter for the SSE subscription (module constant → identity
// never changes across renders).
const SSE_ROW_FILTER = { kinds: ["row"] as const, rowTables: ["task", "task_run"] as const };

/**
 * Keep the store live from SSE. Row events carry only {table, op, id}, so
 * we batch dirty ids over a short window and refetch them in one request.
 * task_run ids are resolved to their parent task ids first.
 */
export function useTaskStoreSse(store: TaskStore = taskStore) {
  const dirtyTasks = useRef(new Set<number>());
  const dirtyRuns = useRef(new Set<number>());
  const timer = useRef<number | null>(null);

  const flush = useCallback(() => {
    timer.current = null;
    const taskIds = [...dirtyTasks.current];
    const runIds = [...dirtyRuns.current];
    dirtyTasks.current.clear();
    dirtyRuns.current.clear();
    if (taskIds.length) store.patchTaskIds(taskIds).catch(() => {});
    if (runIds.length) store.patchRunIds(runIds).catch(() => {});
  }, [store]);

  const schedule = useCallback(() => {
    if (timer.current === null) {
      timer.current = window.setTimeout(flush, PATCH_DEBOUNCE_MS);
    }
  }, [flush]);

  usePisaEvents(
    useCallback(
      (ev) => {
        if (ev.kind !== "row") return;
        if (ev.row.table === "task") {
          if (ev.row.op === "delete") {
            store.removeTasks([ev.row.id]);
            return;
          }
          dirtyTasks.current.add(ev.row.id);
          schedule();
        } else if (ev.row.table === "task_run") {
          dirtyRuns.current.add(ev.row.id);
          schedule();
        }
      },
      [store, schedule],
    ),
    SSE_ROW_FILTER,
  );

  useEffect(() => {
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, []);
}
