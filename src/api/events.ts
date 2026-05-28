import { useEffect, useMemo } from "react";

const MANAGER_URL = import.meta.env.VITE_MANAGER_URL ?? "/manager";

export type PisaEvent =
  | {
      kind: "row";
      row: {
        table: "task" | "task_run";
        op: "insert" | "update" | "delete";
        id: number;
      };
    }
  | {
      kind: "log";
      task_run_id: number;
      chunk: string;
      /** UTF-8 byte offset of `task_run.log` *after* this chunk was
       *  appended. Used by LogDrawer to dedupe chunks that overlap with
       *  its initial snapshot fetch. */
      end_offset: number;
    };

/** Narrow the fan-out at the dispatcher so listeners don't get woken
 *  for events they immediately discard. With many parallel task_runs
 *  the log stream is hot (multiple chunks/sec) and even cheap filter
 *  checks across every listener add up — better to short-circuit here. */
export interface EventFilter {
  /** Only invoke the callback for these event kinds. */
  kinds?: ReadonlyArray<PisaEvent["kind"]>;
  /** For `log` events, only invoke when `task_run_id` matches. */
  taskRunIds?: ReadonlyArray<number>;
  /** For `row` events, only invoke when `row.table` matches. */
  rowTables?: ReadonlyArray<"task" | "task_run">;
}

interface Subscription {
  fn: (e: PisaEvent) => void;
  filter: EventFilter | undefined;
}

// Single shared EventSource across the whole app. Every hook registers
// its own listener; only the first mounted hook actually opens the
// underlying connection.
let source: EventSource | null = null;
let refCount = 0;
const subscriptions = new Set<Subscription>();

function matches(filter: EventFilter | undefined, ev: PisaEvent): boolean {
  if (!filter) return true;
  if (filter.kinds && !filter.kinds.includes(ev.kind)) return false;
  if (ev.kind === "log" && filter.taskRunIds && !filter.taskRunIds.includes(ev.task_run_id)) {
    return false;
  }
  if (ev.kind === "row" && filter.rowTables && !filter.rowTables.includes(ev.row.table)) {
    return false;
  }
  return true;
}

function ensureSource() {
  if (source) return;
  source = new EventSource(`${MANAGER_URL}/events`);
  source.addEventListener("pisa", (ev) => {
    let payload: PisaEvent;
    try {
      payload = JSON.parse((ev as MessageEvent).data);
    } catch {
      return; // malformed event — drop
    }
    for (const sub of subscriptions) {
      if (matches(sub.filter, payload)) sub.fn(payload);
    }
  });
  source.addEventListener("error", () => {
    // Browser retries on its own per the SSE spec; nothing to do.
  });
}

function releaseSource() {
  if (refCount > 0) return;
  source?.close();
  source = null;
}

/** Subscribe to realtime events from the manager. Call inside a
 *  component; the listener is removed on unmount. Pass `filter` to
 *  narrow the events your callback wakes for — by far the biggest
 *  perf knob when many task_runs are streaming logs in parallel. */
export function usePisaEvents(onEvent: (e: PisaEvent) => void, filter?: EventFilter) {
  // Stabilise the filter object so unchanged content doesn't churn the
  // subscription. The filter is small enough that JSON.stringify is
  // cheaper than asking every caller to manage useMemo themselves.
  const filterKey = useMemo(() => (filter ? JSON.stringify(filter) : ""), [filter]);
  useEffect(() => {
    ensureSource();
    refCount++;
    const sub: Subscription = {
      fn: onEvent,
      filter: filterKey ? (JSON.parse(filterKey) as EventFilter) : undefined,
    };
    subscriptions.add(sub);
    return () => {
      subscriptions.delete(sub);
      refCount--;
      if (refCount === 0) releaseSource();
    };
  }, [onEvent, filterKey]);
}
