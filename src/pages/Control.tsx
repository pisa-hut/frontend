import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFleetData } from "../hooks/useFleetData";
import { usePisaEvents } from "../api/events";
import type { TaskStatus } from "../api/types";

/* ------------------------------------------------------------------ *
 * Mission Control — the flagship "ground-control deck".
 *
 * This is the bespoke, fancier surface: a dark phosphor canvas with
 * radial glow, HUD corner brackets, sweeping scan lines and big glowing
 * readouts. It deliberately diverges from the plain-AntD pages — it's
 * the one screen meant to feel like a console.
 *
 * Content is the corrected model, though: workers are grouped by host
 * (executors are ephemeral, one task each — no persistent fleet grid),
 * and throughput is a real rate (finished concretes per hour / per day),
 * not a cumulative total. Core data + realtime refetch come from the
 * shared useFleetData hook; fonts are self-hosted (loaded in main.tsx).
 * ------------------------------------------------------------------ */

/** Phosphor-signal palette keyed to PISA's task_status — brighter and
 *  more saturated than the app tags so it glows against near-black. */
const PHOSPHOR: Record<TaskStatus, string> = {
  idle: "#5c6b7a",
  queued: "#f5b544",
  running: "#38bdf8",
  completed: "#57e389",
  invalid: "#ff5d6c",
  aborted: "#c77dff",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  idle: "IDLE",
  queued: "QUEUED",
  running: "RUNNING",
  completed: "COMPLETE",
  invalid: "INVALID",
  aborted: "ABORTED",
};

const PULSE_ORDER: TaskStatus[] = ["running", "queued", "completed", "idle", "invalid", "aborted"];

const TERMINAL_STATUSES: TaskStatus[] = ["completed", "invalid", "aborted"];

const POSTGREST = import.meta.env.VITE_POSTGREST_URL ?? "/postgrest";

interface Throughput {
  perHour: number;
  perDay: number;
}

/** Real throughput: count of concrete runs that FINISHED inside a rolling
 *  window, via PostgREST's exact-count header. perHour = last 60 min,
 *  perDay = last 24 h — counts already divided by their period. */
async function fetchThroughput(): Promise<Throughput> {
  const hourCutoff = new Date(Date.now() - 3600 * 1000).toISOString();
  const dayCutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const count = async (url: string): Promise<number> => {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { Accept: "application/json", Prefer: "count=exact" },
    });
    if (!res.ok) throw new Error(`throughput fetch failed: ${res.status}`);
    const m = res.headers.get("Content-Range")?.match(/\/(\d+)$/);
    return m ? Number.parseInt(m[1], 10) : 0;
  };

  const base = `${POSTGREST}/concrete_run?status=eq.finished`;
  const [perHour, perDay] = await Promise.all([
    count(`${base}&created_at=gte.${encodeURIComponent(hourCutoff)}`),
    count(`${base}&created_at=gte.${encodeURIComponent(dayCutoff)}`),
  ]);
  return { perHour, perDay };
}

function fmtRuntime(startedAt: string, now: number): string {
  const ms = now - new Date(startedAt).getTime();
  if (ms < 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function fmtClock(now: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = new Date(now);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtAgo(ts: string, now: number): string {
  const ms = now - new Date(ts).getTime();
  if (ms < 0) return "now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type TickerTone = "task" | "run" | "concrete" | "log";

interface TickerEntry {
  key: number;
  at: number;
  tone: TickerTone;
  tag: string;
  text: string;
}

const TONE_COLOR: Record<TickerTone, string> = {
  task: "#38bdf8",
  run: "#57e389",
  concrete: "#f5b544",
  log: "#6b7d8f",
};

export default function Control() {
  const navigate = useNavigate();
  // Core fleet data + realtime core refetch are shared with the Dashboard.
  const { tasks, loading, planMap, avMap, simMap, samplerMap, executorMap } = useFleetData();
  const [throughput, setThroughput] = useState<Throughput>({ perHour: 0, perDay: 0 });
  const [now, setNow] = useState(() => Date.now());

  // 1 s heartbeat so the clock and runtime counters visibly tick.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Throughput is page-specific. The rolling window slides continuously,
  // so finishes age out even with no new events — refresh on mount, on a
  // 60 s cadence, and on SSE concrete_run inserts (below).
  const refreshThroughput = useCallback(() => {
    fetchThroughput()
      .then(setThroughput)
      .catch(() => {
        /* transient; next tick retries */
      });
  }, []);
  useEffect(() => {
    refreshThroughput();
    const id = window.setInterval(refreshThroughput, 60_000);
    return () => window.clearInterval(id);
  }, [refreshThroughput]);

  // Live event ticker.
  const [ticker, setTicker] = useState<TickerEntry[]>([]);
  const tickerKey = useRef(0);
  const pushTicker = useCallback((tone: TickerTone, tag: string, text: string) => {
    setTicker((prev) => {
      const entry: TickerEntry = { key: tickerKey.current++, at: Date.now(), tone, tag, text };
      return [entry, ...prev].slice(0, 28);
    });
  }, []);

  // SSE row/log events reference task_run ids, which mean nothing to an
  // operator. Map each (latest) run id back to its task id so the ticker
  // can always speak in the familiar TASK·N terms. Held in a ref so the
  // event callback stays stable instead of re-subscribing on every refresh.
  const runIdToTaskId = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of tasks) {
      const run = t.task_run?.[0];
      if (run) m.set(run.id, t.id);
    }
    return m;
  }, [tasks]);
  const runMapRef = useRef(runIdToTaskId);
  useEffect(() => {
    runMapRef.current = runIdToTaskId;
  }, [runIdToTaskId]);

  usePisaEvents(
    useCallback(
      (ev) => {
        // Core refetch is handled by useFleetData; here we only feed the
        // ticker and refresh throughput on new concretes.
        if (ev.kind === "row") {
          if (ev.row.table === "task") {
            pushTicker("task", `TASK·${ev.row.id}`, `task ${ev.row.op}`);
          } else if (ev.row.table === "task_run") {
            const taskId = runMapRef.current.get(ev.row.id);
            pushTicker("run", taskId ? `TASK·${taskId}` : `RUN·${ev.row.id}`, `run ${ev.row.op}`);
          } else if (ev.row.table === "concrete_run" && ev.row.op === "insert") {
            pushTicker("concrete", "CONCRETE", "concrete recorded");
            refreshThroughput();
          }
        } else if (ev.kind === "log") {
          const line = ev.chunk.replace(/\s+/g, " ").trim();
          if (line) {
            const taskId = runMapRef.current.get(ev.task_run_id);
            pushTicker(
              "log",
              taskId ? `TASK·${taskId}` : `RUN·${ev.task_run_id}`,
              line.length > 90 ? line.slice(0, 90) + "…" : line,
            );
          }
        }
      },
      [pushTicker, refreshThroughput],
    ),
  );

  // ---- derived state (maps come from useFleetData) ----
  const counts = useMemo(() => {
    const c: Record<TaskStatus, number> = {
      idle: 0,
      queued: 0,
      running: 0,
      completed: 0,
      invalid: 0,
      aborted: 0,
    };
    for (const t of tasks) c[t.task_status]++;
    return c;
  }, [tasks]);

  const runningRows = useMemo(() => {
    return tasks
      .filter((t) => t.task_status === "running" && t.task_run?.[0])
      .map((t) => {
        const run = t.task_run![0];
        return {
          taskId: t.id,
          runId: run.id,
          attempt: run.attempt,
          plan: planMap.get(t.plan_id) ?? `plan #${t.plan_id}`,
          av: avMap.get(t.av_id) ?? `av #${t.av_id}`,
          sim: simMap.get(t.simulator_id) ?? `sim #${t.simulator_id}`,
          sampler: samplerMap.get(t.sampler_id) ?? `smp #${t.sampler_id}`,
          executor: executorMap.get(run.executor_id),
          startedAt: run.started_at ?? "",
          finished: run.finished_concrete_runs ?? 0,
          aborted: run.aborted_concrete_runs ?? 0,
          skipped: run.skipped_concrete_runs ?? 0,
        };
      });
  }, [tasks, planMap, avMap, simMap, samplerMap, executorMap]);

  type RunRow = (typeof runningRows)[number];

  // Group active runs by the host executing them.
  const hostGroups = useMemo(() => {
    const m = new Map<string, { host: string; job: number | null; runs: RunRow[] }>();
    for (const r of runningRows) {
      const host = r.executor?.hostname ?? "unassigned";
      let g = m.get(host);
      if (!g) {
        g = { host, job: r.executor?.slurm_job_id ?? null, runs: [] };
        m.set(host, g);
      }
      g.runs.push(r);
    }
    for (const g of m.values()) {
      g.runs.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
    }
    return [...m.values()].sort((a, b) => a.host.localeCompare(b.host));
  }, [runningRows]);

  // "Recently Finished" — terminal tasks, most-recently-finished first.
  // Sort by the latest run's finished_at (falling back to last_run_at).
  const FINISHED_PREVIEW = 7;
  const finishedRows = useMemo(() => {
    return tasks
      .filter((t) => TERMINAL_STATUSES.includes(t.task_status))
      .map((t) => {
        const run = t.task_run?.[0];
        return {
          taskId: t.id,
          status: t.task_status,
          finishedAt: run?.finished_at ?? t.last_run_at,
          plan: planMap.get(t.plan_id) ?? `plan #${t.plan_id}`,
          av: avMap.get(t.av_id) ?? `av #${t.av_id}`,
          sim: simMap.get(t.simulator_id) ?? `sim #${t.simulator_id}`,
          sampler: samplerMap.get(t.sampler_id) ?? `smp #${t.sampler_id}`,
        };
      })
      .sort((a, b) => {
        const at = a.finishedAt ? new Date(a.finishedAt).getTime() : 0;
        const bt = b.finishedAt ? new Date(b.finishedAt).getTime() : 0;
        return bt - at;
      });
  }, [tasks, planMap, avMap, simMap, samplerMap]);

  if (loading) {
    return (
      <div className="pisa-deck pisa-deck--boot">
        <style>{DECK_CSS}</style>
        <div className="deck-boot">
          <span className="deck-boot__ring" />
          <span className="deck-boot__txt">ESTABLISHING UPLINK…</span>
        </div>
      </div>
    );
  }

  const tzOffset = -new Date().getTimezoneOffset() / 60;

  return (
    <div className="pisa-deck">
      <style>{DECK_CSS}</style>

      {/* ── header ──────────────────────────────────────────── */}
      <header className="deck-head">
        <div className="deck-head__id">
          <span className="deck-head__mark">◢◣</span>
          <div>
            <div className="deck-head__title">MISSION CONTROL</div>
            <div className="deck-head__sub">PISA · simulation fleet telemetry</div>
          </div>
        </div>
        <div className="deck-head__meta">
          <div className="deck-uplink">
            <span className="deck-uplink__dot" />
            UPLINK ACTIVE
          </div>
          <div className="deck-clock">
            <span className="mono">{fmtClock(now)}</span>
            <span className="deck-clock__z">
              UTC{tzOffset >= 0 ? "+" : ""}
              {tzOffset}
            </span>
          </div>
        </div>
      </header>

      {/* ── pulse strip + throughput rates ──────────────────── */}
      <section className="deck-pulse">
        {PULSE_ORDER.map((s, i) => (
          <button
            key={s}
            className="pulse-tile"
            style={{ "--c": PHOSPHOR[s], animationDelay: `${i * 55}ms` } as React.CSSProperties}
            onClick={() => navigate(`/tasks?status=${s}`)}
          >
            <span className="pulse-tile__corner pulse-tile__corner--tl" />
            <span className="pulse-tile__corner pulse-tile__corner--br" />
            <span className="pulse-tile__label">{STATUS_LABEL[s]}</span>
            <span className="pulse-tile__val mono">{counts[s]}</span>
            {s === "running" && counts.running > 0 && <span className="pulse-tile__live" />}
          </button>
        ))}
        <div
          className="pulse-tile pulse-tile--wide"
          style={
            {
              "--c": "#57e389",
              animationDelay: `${PULSE_ORDER.length * 55}ms`,
            } as React.CSSProperties
          }
        >
          <span className="pulse-tile__corner pulse-tile__corner--tl" />
          <span className="pulse-tile__corner pulse-tile__corner--br" />
          <span className="pulse-tile__label">CONCRETE THROUGHPUT</span>
          <div className="thru">
            <span className="thru__seg" style={{ color: "#57e389" }}>
              <b className="mono">{throughput.perHour}</b> /hr
            </span>
            <span className="thru__seg" style={{ color: "#38bdf8" }}>
              <b className="mono">{throughput.perDay}</b> /day
            </span>
            <span className="thru__note">finished · last 60m / 24h</span>
          </div>
        </div>
      </section>

      {/* ── main grid: live workers | side rail ─────────────── */}
      <div className="deck-grid">
        <section className="deck-panel deck-panel--main">
          <PanelHead
            title="LIVE WORKERS"
            accent="#38bdf8"
            right={
              <span className="panel-count" style={{ "--c": "#38bdf8" } as React.CSSProperties}>
                {hostGroups.length} HOSTS · {runningRows.length} RUNNING
              </span>
            }
          />
          {hostGroups.length === 0 ? (
            <div className="deck-quiet">
              <span className="deck-quiet__scope" />
              <span className="deck-quiet__txt">ALL QUIET · NO ACTIVE WORKERS</span>
            </div>
          ) : (
            <div className="host-stack">
              {hostGroups.map((g) => (
                <div className="host-group" key={g.host}>
                  <div className="host-head">
                    <span className="host-head__dot" />
                    <span className="host-head__name mono">{g.host}</span>
                    {g.job != null && <span className="host-head__job mono">J{g.job}</span>}
                    <span className="host-head__count">
                      {g.runs.length} run{g.runs.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="run-grid">
                    {g.runs.map((r, i) => {
                      const total = r.finished + r.aborted + r.skipped;
                      const seg = (v: number) => (total > 0 ? `${(v / total) * 100}%` : "0%");
                      return (
                        <article
                          key={r.runId}
                          className="run-card"
                          style={{ animationDelay: `${i * 60}ms` }}
                          onClick={() => navigate(`/tasks/${r.taskId}`)}
                        >
                          <span className="run-card__sweep" />
                          <header className="run-card__head">
                            <span className="run-card__id mono">
                              TASK·{r.taskId}
                              {r.attempt > 1 && (
                                <em className="run-card__attempt"> a{r.attempt}</em>
                              )}
                            </span>
                            <span className="run-card__live">
                              <span className="run-card__live-dot" />
                              LIVE
                            </span>
                          </header>
                          <div className="run-card__plan" title={r.plan}>
                            {r.plan}
                          </div>
                          <div className="run-card__chain">
                            <span>{r.av}</span>
                            <i>›</i>
                            <span>{r.sim}</span>
                            <i>›</i>
                            <span>{r.sampler}</span>
                          </div>
                          <div
                            className="run-card__bar"
                            title={`${r.finished} finished · ${r.aborted} aborted · ${r.skipped} skipped`}
                          >
                            <span style={{ width: seg(r.finished), background: "#57e389" }} />
                            <span style={{ width: seg(r.aborted), background: "#f5b544" }} />
                            <span style={{ width: seg(r.skipped), background: "#3a4754" }} />
                            {total === 0 && <span className="run-card__bar-idle" />}
                          </div>
                          <footer className="run-card__foot">
                            <span className="run-card__counts mono">
                              {r.finished}f · {r.aborted}a · {r.skipped}s
                            </span>
                            <span className="run-card__time mono">
                              {r.startedAt ? fmtRuntime(r.startedAt, now) : "--:--:--"}
                            </span>
                          </footer>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="deck-rail">
          <section className="deck-panel">
            <PanelHead
              title="RECENTLY FINISHED"
              accent="#57e389"
              right={
                <span className="panel-count" style={{ "--c": "#57e389" } as React.CSSProperties}>
                  {finishedRows.length} DONE
                </span>
              }
            />
            {finishedRows.length === 0 ? (
              <div className="deck-quiet deck-quiet--sm">
                <span className="deck-quiet__txt">NOTHING FINISHED YET</span>
              </div>
            ) : (
              <div className="queue">
                {finishedRows.slice(0, FINISHED_PREVIEW).map((q) => (
                  <div
                    className="queue-row"
                    key={q.taskId}
                    onClick={() => navigate(`/tasks/${q.taskId}`)}
                  >
                    <div className="queue-row__top">
                      <span className="queue-row__id mono">TASK·{q.taskId}</span>
                      <span
                        className="queue-row__status mono"
                        style={{ color: PHOSPHOR[q.status], borderColor: PHOSPHOR[q.status] }}
                      >
                        {STATUS_LABEL[q.status]}
                      </span>
                    </div>
                    <div className="queue-row__plan" title={q.plan}>
                      {q.plan}
                    </div>
                    <div className="queue-row__chain">
                      {q.av} · {q.sim} · {q.sampler}
                      {q.finishedAt && (
                        <span className="queue-row__ago"> · {fmtAgo(q.finishedAt, now)}</span>
                      )}
                    </div>
                  </div>
                ))}
                {finishedRows.length > FINISHED_PREVIEW && (
                  <div className="queue-more" onClick={() => navigate("/tasks")}>
                    + {finishedRows.length - FINISHED_PREVIEW} more →
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="deck-panel deck-panel--ticker">
            <PanelHead
              title="EVENT STREAM"
              accent="#f5b544"
              right={<span className="ticker-pip" />}
            />
            <div className="ticker">
              {ticker.length === 0 ? (
                <div className="ticker__wait mono">awaiting fleet activity…</div>
              ) : (
                ticker.map((t) => (
                  <div key={t.key} className="ticker__row">
                    <span className="ticker__time mono">{fmtClock(t.at)}</span>
                    <span
                      className="ticker__tag mono"
                      style={{ color: TONE_COLOR[t.tone], borderColor: TONE_COLOR[t.tone] }}
                    >
                      {t.tag}
                    </span>
                    <span className="ticker__text">{t.text}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function PanelHead({
  title,
  accent,
  right,
}: {
  title: string;
  accent: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="panel-head" style={{ "--accent": accent } as React.CSSProperties}>
      <span className="panel-head__bar" />
      <span className="panel-head__title">{title}</span>
      <span className="panel-head__rule" />
      {right}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Scoped deck styling. Fonts (Chakra Petch / IBM Plex Mono) are loaded
 * globally in main.tsx, so there is no font @import here. The deck
 * breaks out of the AntD content padding to run edge-to-edge.
 * ------------------------------------------------------------------ */
const DECK_CSS = `
.pisa-deck {
  --panel: #0c131c;
  --panel-2: #0f1822;
  --line: rgba(120,160,200,0.14);
  --line-soft: rgba(120,160,200,0.08);
  --txt: #c4d3e2;
  --dim: #6f8194;
  --faint: #44525f;

  position: relative;
  margin: -16px;
  min-height: calc(100vh - 16px);
  padding: 22px 24px 32px;
  background:
    radial-gradient(1200px 600px at 78% -8%, rgba(56,189,248,0.12), transparent 60%),
    radial-gradient(900px 500px at 8% 110%, rgba(87,227,137,0.07), transparent 55%),
    #070b11;
  color: var(--txt);
  font-family: 'Chakra Petch', sans-serif;
  overflow: hidden;
}
@media (max-width: 767px) { .pisa-deck { padding: 16px 12px 24px; } }

.pisa-deck .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }

/* ── boot ── */
.pisa-deck--boot { display: flex; align-items: center; justify-content: center; }
.deck-boot { display: flex; flex-direction: column; align-items: center; gap: 18px; }
.deck-boot__ring {
  width: 46px; height: 46px; border-radius: 50%;
  border: 2px solid rgba(56,189,248,0.2); border-top-color: #38bdf8;
  animation: deck-spin 0.8s linear infinite;
}
.deck-boot__txt { font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 4px; color: var(--dim); animation: deck-flick 1.4s ease-in-out infinite; }
@keyframes deck-spin { to { transform: rotate(360deg); } }
@keyframes deck-flick { 0%,100% { opacity: 0.35; } 50% { opacity: 1; } }

/* ── header ── */
.deck-head {
  position: relative; z-index: 2;
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
  padding-bottom: 18px; margin-bottom: 18px; border-bottom: 1px solid var(--line);
}
.deck-head__id { display: flex; align-items: center; gap: 14px; }
.deck-head__mark { color: #38bdf8; font-size: 20px; text-shadow: 0 0 14px rgba(56,189,248,0.6); }
.deck-head__title { font-size: 22px; font-weight: 700; letter-spacing: 5px; color: #eaf4ff; line-height: 1; }
.deck-head__sub { font-size: 11px; letter-spacing: 2.5px; text-transform: uppercase; color: var(--dim); margin-top: 5px; }
.deck-head__meta { display: flex; align-items: center; gap: 18px; }
.deck-uplink { display: flex; align-items: center; gap: 8px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 2px; color: #57e389; }
.deck-uplink__dot { width: 8px; height: 8px; border-radius: 50%; background: #57e389; box-shadow: 0 0 10px #57e389; animation: deck-pulse 1.6s ease-in-out infinite; }
@keyframes deck-pulse { 0%,100% { opacity: 1; transform: scale(1);} 50% { opacity: 0.4; transform: scale(0.8);} }
.deck-clock { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.1; }
.deck-clock .mono { font-size: 20px; color: #eaf4ff; letter-spacing: 1px; }
.deck-clock__z { font-size: 9px; letter-spacing: 2px; color: var(--faint); font-family: 'IBM Plex Mono', monospace; }

/* ── pulse strip ── */
.deck-pulse { position: relative; z-index: 2; display: grid; gap: 10px; margin-bottom: 16px; grid-template-columns: repeat(6, 1fr) 1.8fr; }
@media (max-width: 1100px) { .deck-pulse { grid-template-columns: repeat(3, 1fr); } .pulse-tile--wide { grid-column: span 3; } }
@media (max-width: 560px) { .deck-pulse { grid-template-columns: repeat(2, 1fr); } .pulse-tile--wide { grid-column: span 2; } }

.pulse-tile {
  position: relative; appearance: none; cursor: pointer; text-align: left;
  background: linear-gradient(160deg, var(--panel-2), var(--panel));
  border: 1px solid var(--line); padding: 13px 14px 12px; min-height: 78px;
  display: flex; flex-direction: column; justify-content: space-between; color: var(--txt);
  opacity: 0; transform: translateY(8px); animation: deck-rise 0.5s cubic-bezier(0.2,0.8,0.2,1) forwards;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
}
.pulse-tile:hover { border-color: var(--c); box-shadow: 0 0 0 1px var(--c), 0 6px 22px rgba(0,0,0,0.45); transform: translateY(-2px); }
.pulse-tile__corner { position: absolute; width: 9px; height: 9px; border: 1px solid var(--c); opacity: 0.7; }
.pulse-tile__corner--tl { top: -1px; left: -1px; border-right: none; border-bottom: none; }
.pulse-tile__corner--br { bottom: -1px; right: -1px; border-left: none; border-top: none; }
.pulse-tile__label { font-size: 10px; letter-spacing: 2px; color: var(--dim); text-transform: uppercase; }
.pulse-tile__val { font-size: 30px; font-weight: 600; color: var(--c); line-height: 1; text-shadow: 0 0 18px color-mix(in srgb, var(--c) 45%, transparent); }
.pulse-tile__live { position: absolute; top: 12px; right: 12px; width: 7px; height: 7px; border-radius: 50%; background: var(--c); box-shadow: 0 0 10px var(--c); animation: deck-pulse 1.2s ease-in-out infinite; }
.pulse-tile--wide { cursor: default; }
.pulse-tile--wide:hover { transform: translateY(0); box-shadow: none; border-color: var(--line); }
.thru { display: flex; gap: 18px; align-items: baseline; flex-wrap: wrap; }
.thru__seg { font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: var(--dim); }
.thru__seg b { font-size: 26px; font-weight: 600; margin-right: 4px; text-shadow: 0 0 16px currentColor; }
.thru__note { font-size: 10px; letter-spacing: 1px; color: var(--faint); text-transform: uppercase; }
@keyframes deck-rise { to { opacity: 1; transform: translateY(0); } }

/* ── main grid ── */
.deck-grid { position: relative; z-index: 2; display: grid; grid-template-columns: 1fr 360px; gap: 16px; align-items: start; }
@media (max-width: 1100px) { .deck-grid { grid-template-columns: 1fr; } }

.deck-panel { position: relative; background: linear-gradient(180deg, var(--panel-2), var(--panel)); border: 1px solid var(--line); padding: 14px 15px 16px; }
.deck-panel::before, .deck-panel::after { content: ''; position: absolute; width: 14px; height: 14px; pointer-events: none; border-color: rgba(120,160,200,0.4); }
.deck-panel::before { top: -1px; left: -1px; border-top: 1px solid; border-left: 1px solid; }
.deck-panel::after { bottom: -1px; right: -1px; border-bottom: 1px solid; border-right: 1px solid; }

.panel-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.panel-head__bar { width: 3px; height: 14px; background: var(--accent); box-shadow: 0 0 10px var(--accent); }
.panel-head__title { font-size: 12px; font-weight: 600; letter-spacing: 3px; color: #dbe7f3; }
.panel-head__rule { flex: 1; height: 1px; background: linear-gradient(90deg, var(--line), transparent); }
.panel-count { font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: 2px; color: var(--c); border: 1px solid color-mix(in srgb, var(--c) 45%, transparent); padding: 2px 7px; }

/* ── host groups ── */
.host-stack { display: flex; flex-direction: column; gap: 18px; }
.host-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--line-soft); }
.host-head__dot { width: 7px; height: 7px; border-radius: 50%; background: #57e389; box-shadow: 0 0 9px #57e389; animation: deck-pulse 1.6s ease-in-out infinite; }
.host-head__name { font-size: 13px; color: #eaf4ff; letter-spacing: 0.5px; }
.host-head__job { font-size: 11px; color: var(--dim); }
.host-head__count { margin-left: auto; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: var(--faint); }

/* ── running cards ── */
.run-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(238px, 1fr)); gap: 12px; }
.run-card {
  position: relative; overflow: hidden; cursor: pointer;
  background: linear-gradient(165deg, rgba(56,189,248,0.06), rgba(8,14,20,0.4));
  border: 1px solid rgba(56,189,248,0.22); padding: 12px 13px 11px;
  opacity: 0; transform: translateY(10px); animation: deck-rise 0.55s cubic-bezier(0.2,0.8,0.2,1) forwards;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
}
.run-card:hover { border-color: #38bdf8; box-shadow: 0 0 0 1px rgba(56,189,248,0.5), 0 8px 26px rgba(0,0,0,0.5); transform: translateY(-3px); }
.run-card__sweep { position: absolute; top: 0; left: -40%; width: 40%; height: 100%; background: linear-gradient(90deg, transparent, rgba(56,189,248,0.10), transparent); animation: deck-sweep 3.4s linear infinite; pointer-events: none; }
@keyframes deck-sweep { 0% { left: -45%; } 100% { left: 105%; } }
.run-card__head { display: flex; align-items: center; justify-content: space-between; }
.run-card__id { font-size: 13px; color: #eaf4ff; letter-spacing: 1px; }
.run-card__attempt { color: #f5b544; font-style: normal; font-size: 11px; }
.run-card__live { display: flex; align-items: center; gap: 5px; font-size: 9px; letter-spacing: 2px; color: #38bdf8; font-family: 'IBM Plex Mono', monospace; }
.run-card__live-dot { width: 6px; height: 6px; border-radius: 50%; background: #38bdf8; box-shadow: 0 0 8px #38bdf8; animation: deck-pulse 1.2s ease-in-out infinite; }
.run-card__plan { margin: 9px 0 3px; font-size: 14px; font-weight: 600; color: #dbe7f3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.run-card__chain { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11px; color: var(--dim); letter-spacing: 0.5px; }
.run-card__chain i { color: var(--faint); font-style: normal; }
.run-card__bar { position: relative; display: flex; height: 5px; margin: 11px 0 10px; background: rgba(255,255,255,0.04); overflow: hidden; }
.run-card__bar span { display: block; height: 100%; transition: width 0.5s ease; }
.run-card__bar-idle { position: absolute; inset: 0; width: 100% !important; background: repeating-linear-gradient(90deg, rgba(120,160,200,0.16) 0 6px, transparent 6px 12px); }
.run-card__foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.run-card__counts { font-size: 11px; color: var(--dim); }
.run-card__time { font-size: 15px; color: #57e389; letter-spacing: 1px; text-shadow: 0 0 12px rgba(87,227,137,0.4); }

/* ── quiet / empty ── */
.deck-quiet { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 54px 0; }
.deck-quiet--sm { padding: 26px 0; }
.deck-quiet__scope { width: 64px; height: 64px; border-radius: 50%; border: 1px solid rgba(120,160,200,0.2); position: relative; }
.deck-quiet__scope::before { content: ''; position: absolute; inset: -1px; border-radius: 50%; background: conic-gradient(from 0deg, rgba(87,227,137,0.5), transparent 32%); animation: deck-spin 3.5s linear infinite; -webkit-mask: radial-gradient(transparent 60%, #000 61%); mask: radial-gradient(transparent 60%, #000 61%); }
.deck-quiet__txt { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 3px; color: var(--dim); }

/* ── side rail ── */
.deck-rail { display: flex; flex-direction: column; gap: 16px; }

/* ── recently finished ── */
.queue { display: flex; flex-direction: column; gap: 1px; }
.queue-row { cursor: pointer; padding: 8px 4px; border-bottom: 1px solid var(--line-soft); transition: background 0.15s; }
.queue-row:hover { background: rgba(120,160,200,0.05); }
.queue-row__top { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.queue-row__id { font-size: 12px; color: var(--txt); }
.queue-row__status { font-size: 9px; letter-spacing: 1px; border: 1px solid; padding: 0 4px; white-space: nowrap; }
.queue-row__plan { font-size: 13px; color: #dbe7f3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 2px 0 1px; }
.queue-row__chain { font-size: 11px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.queue-row__ago { color: var(--faint); }
.queue-more { cursor: pointer; padding: 8px 4px 2px; font-size: 11px; color: var(--dim); }
.queue-more:hover { color: #38bdf8; }

/* ── ticker ── */
.deck-panel--ticker { min-height: 200px; }
.ticker-pip { width: 7px; height: 7px; border-radius: 50%; background: #f5b544; box-shadow: 0 0 9px #f5b544; animation: deck-pulse 1.4s ease-in-out infinite; }
.ticker { max-height: 320px; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; }
.ticker__wait { font-size: 11px; color: var(--faint); letter-spacing: 1px; padding: 8px 2px; }
.ticker__row { display: grid; grid-template-columns: auto auto 1fr; gap: 8px; align-items: baseline; padding: 4px 2px; border-bottom: 1px solid var(--line-soft); animation: ticker-in 0.35s ease; }
@keyframes ticker-in { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
.ticker__time { font-size: 10px; color: var(--faint); }
.ticker__tag { font-size: 9px; letter-spacing: 1px; border: 1px solid; padding: 0 4px; white-space: nowrap; }
.ticker__text { font-size: 11px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;
