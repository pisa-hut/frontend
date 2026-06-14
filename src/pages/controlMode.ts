export type DeckMode = "quiet" | "focus" | "spread" | "fleet";

/** Adaptive layout tier from running-job count and host-group count.
 *  quiet: nothing live. focus: one job → hero card. spread: a handful on a
 *  single host → roomy grid. fleet: many, or distributed → dense host grid.
 *  Multi-host always lands on fleet — host grouping is the point once
 *  work is spread across machines. */
export function pickDeckMode(running: number, hosts: number): DeckMode {
  if (running === 0) return "quiet";
  if (running === 1) return "focus";
  if (hosts === 1 && running <= 4) return "spread";
  return "fleet";
}
