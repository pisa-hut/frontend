import type { TaskStatus, TaskSummary } from "../api/types";

/** The set of filter axes the Tasks page exposes via its chip + tag UI,
 *  evaluated client-side against the `summaries` slice. Empty / undefined
 *  values mean "don't filter on this axis." `status` accepts a single
 *  value too (the triage scope pins it to `["invalid"]`).
 *
 *  Kept separate from `TasksPageQuery` (which carries paging + sort)
 *  because two distinct call sites — the visible-id memo and the
 *  triage-scope memo — share only the predicate-shaped subset. Folding
 *  them through one function is how a future axis (e.g. a fifth
 *  resource) avoids drifting between the two. */
export interface TaskFilterCriteria {
  status?: TaskStatus[];
  avIds?: number[];
  simIds?: number[];
  samplerIds?: number[];
  monitorIds?: number[];
  ids?: Set<number>;
  tags?: Set<string>;
  /** Lowercase substring match against the plan name. */
  planSearch?: string;
}

export function matchesTaskFilter(
  t: TaskSummary,
  f: TaskFilterCriteria,
  planTagsMap: Map<number, string[]>,
  planMap: Map<number, string>,
): boolean {
  if (f.status?.length && !f.status.includes(t.task_status)) return false;
  if (f.avIds?.length && !f.avIds.includes(t.av_id)) return false;
  if (f.simIds?.length && !f.simIds.includes(t.simulator_id)) return false;
  if (f.samplerIds?.length && !f.samplerIds.includes(t.sampler_id)) return false;
  if (f.monitorIds?.length && !f.monitorIds.includes(t.monitor_id)) return false;
  if (f.ids && !f.ids.has(t.id)) return false;
  if (f.tags) {
    const tags = planTagsMap.get(t.plan_id) ?? [];
    if (!tags.some((x) => f.tags!.has(x))) return false;
  }
  if (f.planSearch) {
    const name = (planMap.get(t.plan_id) ?? "").toLowerCase();
    if (!name.includes(f.planSearch)) return false;
  }
  return true;
}
