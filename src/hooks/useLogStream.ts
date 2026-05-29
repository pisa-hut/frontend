import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import { usePisaEvents } from "../api/events";

interface LogStreamState {
  content: string | null;
  loading: boolean;
  error: string | undefined;
}

/** Lossless snapshot ↔ SSE handoff for a task_run's captured log.
 *
 *  Loads the DB snapshot for the given `runId`, then keeps the local
 *  string in sync with live `log` SSE events. The hard problem is the
 *  race between the snapshot fetch and chunks the executor emits in
 *  the meantime — we don't want to silently drop them, and we don't
 *  want to double-print bytes already covered by the snapshot.
 *
 *  Strategy:
 *  - `cursorRef` tracks the UTF-8 byte offset of the currently-shown
 *    log content. After the snapshot lands it equals
 *    `byteLength(snapshot)`; after each appended SSE chunk it advances
 *    to that chunk's `end_offset`.
 *  - `bufferRef` collects SSE chunks that arrive while the snapshot
 *    is in flight. When the snapshot resolves we drop any chunk whose
 *    `end_offset` is already covered by the snapshot, trim the prefix
 *    of any partially-overlapping chunk, then append the rest.
 *  - `pendingRef` accumulates chunks that arrived *after* the snapshot
 *    is in place but haven't been flushed to React yet. A rAF-scheduled
 *    flush merges them in one string append and one setState — keeps
 *    a chatty live run from triggering a re-render per chunk and the
 *    log string from being rebuilt O(n²) times.
 *
 *  Pass `null` for `runId` (e.g. drawer closed) to reset state and
 *  unsubscribe from new events.
 */
export function useLogStream(runId: number | null): LogStreamState {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const cursorRef = useRef<number>(0);
  const bufferRef = useRef<Array<{ chunk: string; end_offset: number }>>([]);
  // Pending text + scheduled flush, used to coalesce bursts of chunks.
  const pendingRef = useRef<string>("");
  const flushHandleRef = useRef<number | null>(null);
  // Loading lives in a ref too so the SSE callback identity doesn't
  // change when the snapshot fetch flips it; otherwise every drawer
  // open re-subscribes twice (true → false).
  const loadingRef = useRef<boolean>(false);
  const utf8 = useMemo(() => new TextEncoder(), []);

  const scheduleFlush = useCallback(() => {
    if (flushHandleRef.current !== null) return;
    flushHandleRef.current = window.requestAnimationFrame(() => {
      flushHandleRef.current = null;
      const text = pendingRef.current;
      if (!text) return;
      pendingRef.current = "";
      setContent((prev) => (prev ?? "") + text);
    });
  }, []);

  useEffect(() => {
    if (runId == null) {
      setContent(null);
      setError(undefined);
      pendingRef.current = "";
      if (flushHandleRef.current !== null) {
        window.cancelAnimationFrame(flushHandleRef.current);
        flushHandleRef.current = null;
      }
      return;
    }
    setLoading(true);
    loadingRef.current = true;
    setContent(null);
    setError(undefined);
    cursorRef.current = 0;
    bufferRef.current = [];
    pendingRef.current = "";
    api
      .getTaskRunLog(runId)
      .then((snapshot) => {
        const snap = snapshot ?? "";
        cursorRef.current = utf8.encode(snap).length;
        // Drain anything that arrived during the fetch. Each chunk's
        // start_offset = end_offset - byteLength(chunk).
        let merged = snap;
        for (const ev of bufferRef.current) {
          const chunkBytes = utf8.encode(ev.chunk).length;
          const startOffset = ev.end_offset - chunkBytes;
          if (ev.end_offset <= cursorRef.current) {
            continue; // entirely covered by snapshot
          }
          if (startOffset >= cursorRef.current) {
            merged += ev.chunk;
          } else {
            // Straddling: the first (cursor - start) bytes are already
            // in the snapshot. Trim the prefix on a UTF-8 byte boundary.
            const skipBytes = cursorRef.current - startOffset;
            const tail = utf8.encode(ev.chunk).slice(skipBytes);
            merged += new TextDecoder("utf-8").decode(tail);
          }
          cursorRef.current = ev.end_offset;
        }
        bufferRef.current = [];
        setContent(merged);
      })
      .catch((e) => setError(String(e)))
      .finally(() => {
        setLoading(false);
        loadingRef.current = false;
      });
    // Cancel any pending flush on unmount / runId change.
    return () => {
      if (flushHandleRef.current !== null) {
        window.cancelAnimationFrame(flushHandleRef.current);
        flushHandleRef.current = null;
      }
    };
  }, [runId, utf8]);

  // SSE filter: only log events for this run. Cuts the per-event work
  // for the drawer down to "nothing" when other tasks are noisy.
  const filter = useMemo(
    () => (runId == null ? undefined : { kinds: ["log"] as const, taskRunIds: [runId] }),
    [runId],
  );
  usePisaEvents(
    useCallback(
      (ev) => {
        if (ev.kind !== "log") return; // dispatcher already guarantees this; defensive
        if (loadingRef.current) {
          // Snapshot still in flight — buffer. We'll dedupe by offset
          // when the fetch resolves.
          bufferRef.current.push({ chunk: ev.chunk, end_offset: ev.end_offset });
          return;
        }
        // Same dedupe rule as the post-snapshot drain.
        if (ev.end_offset <= cursorRef.current) return;
        const chunkBytes = utf8.encode(ev.chunk).length;
        const startOffset = ev.end_offset - chunkBytes;
        let toAppend = ev.chunk;
        if (startOffset < cursorRef.current) {
          const skipBytes = cursorRef.current - startOffset;
          toAppend = new TextDecoder("utf-8").decode(utf8.encode(ev.chunk).slice(skipBytes));
        }
        cursorRef.current = ev.end_offset;
        // Coalesce into the pending buffer and flush on next rAF. A
        // burst of 50 chunks/sec collapses to ~60 setState calls/sec
        // max, regardless of arrival rate.
        pendingRef.current += toAppend;
        scheduleFlush();
      },
      [utf8, scheduleFlush],
    ),
    filter,
  );

  return { content, loading, error };
}
