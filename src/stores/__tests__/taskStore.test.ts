import { describe, it, expect } from "vitest";
import { createTaskStore } from "../taskStore";
import type { TaskResponse } from "../../api/types";

function row(id: number, extra: Partial<TaskResponse> = {}): TaskResponse {
  return {
    id,
    plan_id: 1,
    av_id: 1,
    simulator_id: 1,
    sampler_id: 1,
    monitor_id: 1,
    task_status: "idle",
    created_at: "2026-01-01T00:00:00Z",
    attempt_count: 0,
    last_run_at: null,
    archived: false,
    queue_priority: 0,
    queued_at: null,
    ...extra,
  };
}

/** Mutable fake dataset + api the store can be driven against. */
function makeClient(initial: TaskResponse[]) {
  const data = new Map(initial.map((r) => [r.id, r]));
  return {
    data,
    fetchTaskRowsChunk: async (offset: number, limit: number) => {
      const all = [...data.values()].sort((a, b) => b.id - a.id);
      return { rows: all.slice(offset, offset + limit), total: all.length };
    },
    fetchTaskRowsByIds: async (ids: number[]) =>
      ids.map((id) => data.get(id)).filter((r): r is TaskResponse => !!r),
    fetchTaskIdsForRuns: async () => [],
  };
}

describe("taskStore", () => {
  it("assembles the full set across chunks", async () => {
    const client = makeClient([row(5), row(4), row(3), row(2), row(1)]);
    const store = createTaskStore(client, 2); // forces 3 chunks (2,2,1)
    await store.ensureLoaded();
    expect(
      store
        .getRows()
        .map((r) => r.id)
        .sort((a, b) => a - b),
    ).toEqual([1, 2, 3, 4, 5]);
    expect(store.getState().status).toBe("ready");
    expect(store.getState().total).toBe(5);
  });

  it("ensureLoaded is idempotent (no duplicate load)", async () => {
    const client = makeClient([row(1), row(2)]);
    let chunkCalls = 0;
    const counting = {
      ...client,
      fetchTaskRowsChunk: async (o: number, l: number) => {
        chunkCalls++;
        return client.fetchTaskRowsChunk(o, l);
      },
    };
    const store = createTaskStore(counting, 50);
    await Promise.all([store.ensureLoaded(), store.ensureLoaded()]);
    await store.ensureLoaded();
    expect(chunkCalls).toBe(1);
  });

  it("patchTaskIds upserts changed rows", async () => {
    const client = makeClient([row(1, { task_status: "idle" })]);
    const store = createTaskStore(client, 50);
    await store.ensureLoaded();
    client.data.set(1, row(1, { task_status: "running" }));
    await store.patchTaskIds([1]);
    expect(store.getRows().find((r) => r.id === 1)?.task_status).toBe("running");
  });

  it("patchTaskIds removes ids that no longer exist (deleted)", async () => {
    const client = makeClient([row(1), row(2)]);
    const store = createTaskStore(client, 50);
    await store.ensureLoaded();
    client.data.delete(2);
    await store.patchTaskIds([2]);
    expect(store.getRows().map((r) => r.id)).toEqual([1]);
  });

  it("removeTasks drops rows immediately", async () => {
    const client = makeClient([row(1), row(2)]);
    const store = createTaskStore(client, 50);
    await store.ensureLoaded();
    store.removeTasks([1]);
    expect(store.getRows().map((r) => r.id)).toEqual([2]);
  });

  it("resync replaces the set, catching deletions", async () => {
    const client = makeClient([row(1), row(2), row(3)]);
    const store = createTaskStore(client, 50);
    await store.ensureLoaded();
    client.data.delete(2);
    client.data.set(4, row(4));
    await store.resync();
    expect(
      store
        .getRows()
        .map((r) => r.id)
        .sort((a, b) => a - b),
    ).toEqual([1, 3, 4]);
  });

  it("getRows returns a stable reference until a mutation", async () => {
    const client = makeClient([row(1)]);
    const store = createTaskStore(client, 50);
    await store.ensureLoaded();
    const snap = store.getRows();
    expect(store.getRows()).toBe(snap); // no change → same ref (safe for useSyncExternalStore)
  });
});
