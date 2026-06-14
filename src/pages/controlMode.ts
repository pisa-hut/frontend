export type DeckMode = "quiet" | "focus" | "grid";

/** Adaptive layout tier from the running-job count.
 *  quiet: nothing live. focus: one job → hero card. grid: everything else →
 *  one width-filling grid of run cards (host shown per card, not grouped). */
export function pickDeckMode(running: number): DeckMode {
  if (running === 0) return "quiet";
  if (running === 1) return "focus";
  return "grid";
}
