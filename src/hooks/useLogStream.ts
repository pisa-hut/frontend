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
  const utf8 = useMemo(() => new TextEncoder(), []);

  useEffect(() => {
    if (runId == null) {
      setContent(null);
      setError(undefined);
      return;
    }
    setLoading(true);
    setContent(null);
    setError(undefined);
    cursorRef.current = 0;
    bufferRef.current = [];
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
      .finally(() => setLoading(false));
  }, [runId, utf8]);

  usePisaEvents(
    useCallback(
      (ev) => {
        if (runId == null) return;
        if (ev.kind !== "log") return;
        if (ev.task_run_id !== runId) return;
        if (loading) {
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
        setContent((prev) => (prev ?? "") + toAppend);
      },
      [runId, loading, utf8],
    ),
  );

  return { content, loading, error };
}
