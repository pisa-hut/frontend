import { useCallback, useState } from "react";

/** useState that mirrors itself to sessionStorage under `key`.
 *
 *  Mirror of useLocalStorageState but scoped to the current tab/session
 *  — survives in-tab refreshes and intra-app navigation, but not a tab
 *  or browser close. Use for state that should "stick" while the user
 *  is actively investigating, without leaking yesterday's filters back
 *  in tomorrow morning.
 *
 *  Same caveats as the localStorage variant: JSON-serialised, no
 *  cross-tab broadcast.
 */
export function useSessionStorageState<T>(
  key: string,
  initial: T,
  options: { serialize?: (v: T) => string; deserialize?: (s: string) => T } = {},
): [T, (v: T | ((prev: T) => T)) => void] {
  const ser = options.serialize ?? JSON.stringify;
  const de = options.deserialize ?? (JSON.parse as (s: string) => T);

  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw == null) return initial;
      return de(raw);
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setState((prev) => {
        const value = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          window.sessionStorage.setItem(key, ser(value));
        } catch {
          // Quota exceeded or storage disabled.
        }
        return value;
      });
    },
    [key, ser],
  );

  return [state, set];
}
