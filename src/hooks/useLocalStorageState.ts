import { useCallback, useState } from "react";

/** useState that mirrors itself to localStorage under `key`.
 *
 *  Drop-in replacement: same `[value, setter]` shape. The setter
 *  accepts either a value or an updater function, like useState.
 *  On first render, hydrates from storage if present and parseable;
 *  otherwise falls back to `initial`.
 *
 *  Tradeoffs:
 *  - JSON-serialised, so Map / Set / Date won't survive a round-trip.
 *    Wrap with a (de)serialiser pair for those — see the second
 *    overload signature.
 *  - Cross-tab sync is intentionally NOT implemented: the table view
 *    state we persist (filters, page size, pinned IDs) is per-tab
 *    by user expectation. Use plain useState if you need broadcast.
 */
export function useLocalStorageState<T>(
  key: string,
  initial: T,
  options: { serialize?: (v: T) => string; deserialize?: (s: string) => T } = {},
): [T, (v: T | ((prev: T) => T)) => void] {
  const ser = options.serialize ?? JSON.stringify;
  const de = options.deserialize ?? (JSON.parse as (s: string) => T);

  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) return initial;
      return de(raw);
    } catch {
      // Corrupt entry — fall back and overwrite on next set.
      return initial;
    }
  });

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setState((prev) => {
        const value = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(key, ser(value));
        } catch {
          // Quota exceeded or storage disabled — silently drop the
          // persistence side-effect; in-memory state still updates.
        }
        return value;
      });
    },
    [key, ser],
  );

  return [state, set];
}
