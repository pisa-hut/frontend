import { useEffect } from "react";

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
    };

// Single shared EventSource across the whole app. Every hook registers
// its own listener; only the first mounted hook actually opens the
// underlying connection.
let source: EventSource | null = null;
let refCount = 0;
const listeners = new Set<(e: PisaEvent) => void>();

function ensureSource() {
  if (source) return;
  source = new EventSource(`${MANAGER_URL}/events`);
  source.addEventListener("pisa", (ev) => {
    try {
      const payload: PisaEvent = JSON.parse((ev as MessageEvent).data);
      listeners.forEach((fn) => fn(payload));
    } catch {
      // malformed event — ignore
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
 *  component; the listener is removed on unmount. */
export function usePisaEvents(onEvent: (e: PisaEvent) => void) {
  useEffect(() => {
    ensureSource();
    refCount++;
    listeners.add(onEvent);
    return () => {
      listeners.delete(onEvent);
      refCount--;
      if (refCount === 0) releaseSource();
    };
  }, [onEvent]);
}
