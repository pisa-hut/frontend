import { describe, it, expect } from "vitest";
import { matchesTaskFilter, type TaskFilterCriteria } from "../tasksFilter";
import type { TaskSummary } from "../../api/types";

function makeTask(over: Partial<TaskSummary> = {}): TaskSummary {
  return {
    id: 1,
    task_status: "invalid",
    av_id: 10,
    simulator_id: 20,
    sampler_id: 30,
    monitor_id: 40,
    plan_id: 100,
    archived: false,
    ...over,
  };
}

const planTagsMap = new Map<number, string[]>([
  [100, ["nightly", "0522v3-HetroD"]],
  [101, ["weekend"]],
]);
const planMap = new Map<number, string>([
  [100, "regression-A"],
  [101, "smoke-B"],
]);

describe("matchesTaskFilter", () => {
  it("matches when all criteria are empty", () => {
    expect(matchesTaskFilter(makeTask(), {}, planTagsMap, planMap)).toBe(true);
  });

  it("filters by status when provided", () => {
    const t = makeTask({ task_status: "running" });
    expect(matchesTaskFilter(t, { status: ["invalid"] }, planTagsMap, planMap)).toBe(false);
    expect(matchesTaskFilter(t, { status: ["running", "queued"] }, planTagsMap, planMap)).toBe(
      true,
    );
  });

  it("filters by each resource axis", () => {
    const t = makeTask();
    const cases: { f: TaskFilterCriteria; out: boolean }[] = [
      { f: { avIds: [10] }, out: true },
      { f: { avIds: [99] }, out: false },
      { f: { simIds: [20] }, out: true },
      { f: { simIds: [99] }, out: false },
      { f: { samplerIds: [30] }, out: true },
      { f: { samplerIds: [99] }, out: false },
      { f: { monitorIds: [40] }, out: true },
      { f: { monitorIds: [99] }, out: false },
    ];
    for (const { f, out } of cases) {
      expect(matchesTaskFilter(t, f, planTagsMap, planMap)).toBe(out);
    }
  });

  it("matches when any of the requested tags is on the task's plan", () => {
    const t = makeTask();
    expect(matchesTaskFilter(t, { tags: new Set(["nightly"]) }, planTagsMap, planMap)).toBe(true);
    expect(matchesTaskFilter(t, { tags: new Set(["does-not-exist"]) }, planTagsMap, planMap)).toBe(
      false,
    );
  });

  it("matches plan-name substring case-insensitively", () => {
    expect(matchesTaskFilter(makeTask(), { planSearch: "regression" }, planTagsMap, planMap)).toBe(
      true,
    );
    expect(matchesTaskFilter(makeTask(), { planSearch: "smoke" }, planTagsMap, planMap)).toBe(
      false,
    );
  });

  it("filters by id-set", () => {
    expect(
      matchesTaskFilter(makeTask({ id: 7 }), { ids: new Set([7, 9]) }, planTagsMap, planMap),
    ).toBe(true);
    expect(
      matchesTaskFilter(makeTask({ id: 7 }), { ids: new Set([1, 2]) }, planTagsMap, planMap),
    ).toBe(false);
  });

  it("treats empty arrays as 'no filter' rather than 'match nothing'", () => {
    const t = makeTask();
    expect(matchesTaskFilter(t, { status: [], avIds: [] }, planTagsMap, planMap)).toBe(true);
  });
});
