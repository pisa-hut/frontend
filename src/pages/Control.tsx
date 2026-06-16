import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFleetData } from "../hooks/useFleetData";
import { usePisaEvents } from "../api/events";
import type { ExecutorResponse, TaskStatus } from "../api/types";
import { pickDeckMode, type DeckMode } from "./controlMode";

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

const HISTORY_BINS = 24;

interface ThroughputHistory {
  bins: number[];
  anchor: number;
  perHour: number;
  perDay: number;
}

/** Finished concretes over the last 24 h, bucketed into 24 hourly bins
 *  (bin 0 = oldest, bin 23 = current partial hour). Pulls just the
 *  `created_at` of each finished concrete and buckets client-side — no
 *  server-side time aggregation needed. From the same rows it also derives
 *  the exact rolling `perHour` (last 60 min) and `perDay` (last 24 h) rates,
 *  and `anchor` (window start) so the x-axis can render wall-clock hours. */
async function fetchThroughputHistory(): Promise<ThroughputHistory> {
  const now = Date.now();
  const start = now - HISTORY_BINS * 3600 * 1000;
  const hourStart = now - 3600 * 1000;
  const cutoff = new Date(start).toISOString();
  // Order newest-first and cap the row set: at absurd volumes the cap only
  // trims the oldest hours, keeping the recent bins and /hr figure exact.
  const url =
    `${POSTGREST}/concrete_run?status=eq.finished` +
    `&created_at=gte.${encodeURIComponent(cutoff)}` +
    `&select=created_at&order=created_at.desc&limit=200000`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`throughput history fetch failed: ${res.status}`);
  const rows: { created_at: string }[] = await res.json();
  const bins = new Array<number>(HISTORY_BINS).fill(0);
  let perHour = 0;
  let perDay = 0;
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    if (t < start || t > now) continue;
    bins[Math.min(HISTORY_BINS - 1, Math.floor((t - start) / 3600000))] += 1;
    perDay += 1;
    if (t >= hourStart) perHour += 1;
  }
  return { bins, anchor: start, perHour, perDay };
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

/** A single active run, flattened for card rendering. */
interface RunRow {
  taskId: number;
  runId: number;
  attempt: number;
  plan: string;
  av: string;
  sim: string;
  sampler: string;
  executor: ExecutorResponse | undefined;
  job: number | null;
  startedAt: string;
  finished: number;
  aborted: number;
  skipped: number;
  /** Sampler total when known; null for open-ended samplers. */
  expected: number | null;
}

/** A terminal task for the "recently finished" rail. */
interface FinishedRow {
  taskId: number;
  status: TaskStatus;
  finishedAt: string | null;
  plan: string;
  av: string;
  sim: string;
  sampler: string;
}

export default function Control() {
  const navigate = useNavigate();
  // Core fleet data + realtime core refetch (shared via useFleetData).
  const { tasks, loading, planMap, avMap, simMap, samplerMap, executorMap } = useFleetData();
  const [history, setHistory] = useState<ThroughputHistory>(() => ({
    bins: new Array<number>(HISTORY_BINS).fill(0),
    anchor: Date.now() - HISTORY_BINS * 3600 * 1000,
    perHour: 0,
    perDay: 0,
  }));
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
    fetchThroughputHistory()
      .then(setHistory)
      .catch(() => {
        /* transient; next tick retries */
      });
  }, []);
  useEffect(() => {
    refreshThroughput();
    const id = window.setInterval(refreshThroughput, 60_000);
    return () => window.clearInterval(id);
  }, [refreshThroughput]);

  // A finish burst can fire many concrete_run inserts in quick succession;
  // the history refetch pulls the whole 24h window, so coalesce them into a
  // single trailing refresh rather than one heavy GET per insert.
  const throughputDebounce = useRef<number | undefined>(undefined);
  const scheduleThroughputRefresh = useCallback(() => {
    if (throughputDebounce.current != null) return;
    throughputDebounce.current = window.setTimeout(() => {
      throughputDebounce.current = undefined;
      refreshThroughput();
    }, 5000);
  }, [refreshThroughput]);
  useEffect(() => () => window.clearTimeout(throughputDebounce.current), []);

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
            scheduleThroughputRefresh();
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
      [pushTicker, scheduleThroughputRefresh],
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
          job: executorMap.get(run.executor_id)?.slurm_job_id ?? null,
          startedAt: run.started_at ?? "",
          finished: run.finished_concrete_runs ?? 0,
          aborted: run.aborted_concrete_runs ?? 0,
          skipped: run.skipped_concrete_runs ?? 0,
          expected: run.expected_concrete_runs ?? null,
        };
      });
  }, [tasks, planMap, avMap, simMap, samplerMap, executorMap]);

  // Group active runs by the host executing them. A single host can run
  // many executors at once — each is its own SLURM job (one task each), so
  // the job id lives per-run on the card, not once per host group.
  const hostGroups = useMemo(() => {
    const m = new Map<string, { host: string; runs: RunRow[] }>();
    for (const r of runningRows) {
      const host = r.executor?.hostname ?? "unassigned";
      let g = m.get(host);
      if (!g) {
        g = { host, runs: [] };
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

  const deckMode = pickDeckMode(runningRows.length);

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
    <div className={`pisa-deck pisa-deck--${deckMode}`}>
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

      {/* ── pulse strip ─────────────────────────────────────── */}
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
      </section>

      {/* ── throughput history ──────────────────────────────── */}
      <ThroughputGraph
        bins={history.bins}
        anchor={history.anchor}
        perHour={history.perHour}
        perDay={history.perDay}
      />

      {/* ── main grid (adaptive) ────────────────────────────── *
       * quiet: no live work, so the rail panels are promoted to fill the
       * deck two-up. Otherwise the live-workers panel + side rail, with
       * LiveWorkers picking hero (one job) vs one width-filling grid.    */}
      {deckMode === "quiet" ? (
        <div className="deck-grid deck-grid--quiet">
          <div className="deck-quiet-strip">
            <span className="deck-quiet__scope" />
            <span className="deck-quiet__txt">ALL QUIET · NO ACTIVE WORKERS</span>
          </div>
          <FinishedPanel
            rows={finishedRows}
            preview={FINISHED_PREVIEW}
            now={now}
            navigate={navigate}
          />
          <EventStreamPanel ticker={ticker} />
        </div>
      ) : (
        <div className="deck-grid">
          <section className="deck-panel deck-panel--main">
            <PanelHead
              title="LIVE WORKERS"
              accent="#38bdf8"
              right={
                <span className="panel-count" style={{ "--c": "#38bdf8" } as React.CSSProperties}>
                  {hostGroups.length > 1 ? `${hostGroups.length} HOSTS · ` : ""}
                  {runningRows.length} RUNNING
                </span>
              }
            />
            <LiveWorkers
              mode={deckMode}
              runs={hostGroups.flatMap((g) => g.runs)}
              now={now}
              navigate={navigate}
            />
          </section>
          <aside className="deck-rail">
            <FinishedPanel
              rows={finishedRows}
              preview={FINISHED_PREVIEW}
              now={now}
              navigate={navigate}
            />
            <EventStreamPanel ticker={ticker} />
          </aside>
        </div>
      )}
    </div>
  );
}

/** Live-workers body: a hero card for a single job, otherwise one
 *  width-filling grid of run cards. Runs arrive host-adjacent (sorted by
 *  host upstream) and carry their host on the card, so no per-host grouping
 *  is needed — that grouping left ragged gaps on wide screens. */
function LiveWorkers({
  mode,
  runs,
  now,
  navigate,
}: {
  mode: DeckMode;
  runs: RunRow[];
  now: number;
  navigate: (to: string) => void;
}) {
  if (mode === "focus" && runs[0]) {
    return <HeroRun r={runs[0]} now={now} navigate={navigate} />;
  }

  return (
    <div className="run-grid">
      {runs.map((r, i) => (
        <RunCard key={r.runId} r={r} i={i} now={now} navigate={navigate} />
      ))}
    </div>
  );
}

/** Segment widths for a run's progress bar. When the sampler reported a
 *  finite total, segments fill toward it (the unfilled remainder is the
 *  empty bar track → a real 0→100% bar). When the total is unknown
 *  (open-ended sampler), fall back to composition: segments normalized to
 *  the concretes done so far, so the bar still grows live. */
function barSegments(r: RunRow): {
  finished: string;
  aborted: string;
  skipped: string;
  idle: boolean;
} {
  const done = r.finished + r.aborted + r.skipped;
  const denom = r.expected != null && r.expected > 0 ? r.expected : done;
  const seg = (v: number) => (denom > 0 ? `${Math.min(100, (v / denom) * 100)}%` : "0%");
  return {
    finished: seg(r.finished),
    aborted: seg(r.aborted),
    skipped: seg(r.skipped),
    idle: done === 0,
  };
}

function barTitle(r: RunRow): string {
  const base = `${r.finished} finished · ${r.aborted} aborted · ${r.skipped} skipped`;
  return r.expected != null && r.expected > 0 ? `${base} · of ${r.expected}` : base;
}

/** Catmull-Rom → cubic-bezier path through the points for a smooth trace. */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return pts.length ? `M ${pts[0][0]} ${pts[0][1]}` : "";
  const r = (n: number) => Math.round(n * 100) / 100;
  let d = `M ${r(pts[0][0])} ${r(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${r(c1x)} ${r(c1y)} ${r(c2x)} ${r(c2y)} ${r(p2[0])} ${r(p2[1])}`;
  }
  return d;
}

/** Oscilloscope-style 24 h throughput trace. Pure SVG, matches the deck's
 *  phosphor aesthetic; redraws (re-keyed) whenever the bins change. */
function ThroughputGraph({
  bins,
  anchor,
  perHour,
  perDay,
}: {
  bins: number[];
  anchor: number;
  perHour: number;
  perDay: number;
}) {
  const W = 240;
  const H = 92;
  const PT = 8;
  const PB = 6;
  const n = bins.length;
  const hasData = perDay > 0;
  const maxBin = bins.reduce((a, b) => Math.max(a, b), 0);
  const scale = Math.max(1, maxBin);
  const step = W / (n - 1);
  const y = (v: number) => H - PB - (v / scale) * (H - PT - PB);
  const pts = bins.map((v, i) => [i * step, y(v)] as [number, number]);
  const line = smoothPath(pts);
  const area = hasData ? `${line} L ${W} ${H} L 0 ${H} Z` : "";
  const last = pts[n - 1];

  const hourLabel = (binIndex: number) => {
    const d = new Date(anchor + binIndex * 3600000);
    return `${String(d.getHours()).padStart(2, "0")}h`;
  };

  return (
    <section className="deck-graph">
      <span
        className="pulse-tile__corner pulse-tile__corner--tl"
        style={{ "--c": "#57e389" } as React.CSSProperties}
      />
      <span
        className="pulse-tile__corner pulse-tile__corner--br"
        style={{ "--c": "#57e389" } as React.CSSProperties}
      />
      <header className="deck-graph__head">
        <div>
          <div className="deck-graph__title">THROUGHPUT</div>
          <div className="deck-graph__sub">finished concretes · trailing 24h</div>
        </div>
        <div className="deck-graph__stats mono">
          <div className="deck-graph__stat" style={{ color: "#57e389" }}>
            <b>{perHour}</b>
            <span>/hr</span>
          </div>
          <div className="deck-graph__stat" style={{ color: "#38bdf8" }}>
            <b>{perDay}</b>
            <span>/day</span>
          </div>
        </div>
      </header>
      <div className="deck-graph__plot">
        <svg
          className="deck-graph__svg"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Throughput over the last 24 hours: ${perHour} per hour, ${perDay} per day`}
        >
          <defs>
            <linearGradient id="deckThruFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#57e389" stopOpacity="0.34" />
              <stop offset="100%" stopColor="#57e389" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} className="deck-graph__grid" x1="0" x2={W} y1={H * f} y2={H * f} />
          ))}
          {[6, 12, 18].map((i) => (
            <line key={i} className="deck-graph__grid" x1={i * step} x2={i * step} y1="0" y2={H} />
          ))}
          {hasData ? (
            <>
              <path className="deck-graph__area" d={area} fill="url(#deckThruFill)" />
              <path className="deck-graph__line" d={line} pathLength={1} />
              <circle className="deck-graph__now" cx={last[0]} cy={last[1]} r="2.8" />
            </>
          ) : (
            <line
              className="deck-graph__flat"
              x1="0"
              x2={W}
              y1={H - PB}
              y2={H - PB}
              pathLength={1}
            />
          )}
        </svg>
        {!hasData && <div className="deck-graph__idle mono">AWAITING SIGNAL</div>}
      </div>
      <div className="deck-graph__xlabels mono">
        <span>{hourLabel(0)}</span>
        <span>{hourLabel(6)}</span>
        <span>{hourLabel(12)}</span>
        <span>{hourLabel(18)}</span>
        <span className="deck-graph__now-lbl">NOW</span>
      </div>
    </section>
  );
}

function RunCard({
  r,
  i,
  now,
  navigate,
}: {
  r: RunRow;
  i: number;
  now: number;
  navigate: (to: string) => void;
}) {
  const seg = barSegments(r);
  return (
    <article
      className="run-card"
      style={{ animationDelay: `${i * 60}ms` }}
      onClick={() => navigate(`/tasks/${r.taskId}`)}
    >
      <header className="run-card__head">
        <span className="run-card__id mono">
          TASK·{r.taskId}
          {r.attempt > 1 && <em className="run-card__attempt"> a{r.attempt}</em>}
          {r.job != null && <em className="run-card__job"> J{r.job}</em>}
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
      <div className="run-card__host mono">
        <span className="run-card__host-dot" />
        {r.executor?.hostname ?? "unassigned"}
      </div>
      <div className="run-card__bar" title={barTitle(r)}>
        <span style={{ width: seg.finished, background: "#57e389" }} />
        <span style={{ width: seg.aborted, background: "#f5b544" }} />
        <span style={{ width: seg.skipped, background: "#3a4754" }} />
        {seg.idle && <span className="run-card__bar-idle" />}
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
}

/** The single active run, blown up to fill the main column in focus mode. */
function HeroRun({ r, now, navigate }: { r: RunRow; now: number; navigate: (to: string) => void }) {
  const seg = barSegments(r);
  return (
    <article className="hero-run" onClick={() => navigate(`/tasks/${r.taskId}`)}>
      <div className="hero-run__main">
        <header className="hero-run__head">
          <span className="hero-run__id mono">
            TASK·{r.taskId}
            {r.attempt > 1 && <em className="run-card__attempt"> a{r.attempt}</em>}
          </span>
          <span className="run-card__live">
            <span className="run-card__live-dot" />
            LIVE
          </span>
        </header>
        <div className="hero-run__plan" title={r.plan}>
          {r.plan}
        </div>
        <div className="hero-run__chain">
          <span>{r.av}</span>
          <i>›</i>
          <span>{r.sim}</span>
          <i>›</i>
          <span>{r.sampler}</span>
        </div>
        <div className="hero-run__meta mono">
          <span className="hero-run__host">{r.executor?.hostname ?? "unassigned"}</span>
          {r.job != null && <span className="hero-run__job">J{r.job}</span>}
        </div>
        <div className="hero-run__bar" title={barTitle(r)}>
          <span style={{ width: seg.finished, background: "#57e389" }} />
          <span style={{ width: seg.aborted, background: "#f5b544" }} />
          <span style={{ width: seg.skipped, background: "#3a4754" }} />
          {seg.idle && <span className="run-card__bar-idle" />}
        </div>
        <div className="hero-run__legend mono">
          <span style={{ color: "#57e389" }}>{r.finished} finished</span>
          <span style={{ color: "#f5b544" }}>{r.aborted} aborted</span>
          <span style={{ color: "#6f8194" }}>{r.skipped} skipped</span>
        </div>
      </div>
      <div className="hero-run__clock">
        <span className="hero-run__clock-label mono">RUNTIME</span>
        <span className="hero-run__clock-val mono">
          {r.startedAt ? fmtRuntime(r.startedAt, now) : "--:--:--"}
        </span>
      </div>
    </article>
  );
}

function FinishedPanel({
  rows,
  preview,
  now,
  navigate,
}: {
  rows: FinishedRow[];
  preview: number;
  now: number;
  navigate: (to: string) => void;
}) {
  return (
    <section className="deck-panel">
      <PanelHead
        title="RECENTLY FINISHED"
        accent="#57e389"
        right={
          <span className="panel-count" style={{ "--c": "#57e389" } as React.CSSProperties}>
            {rows.length} DONE
          </span>
        }
      />
      {rows.length === 0 ? (
        <div className="deck-quiet deck-quiet--sm">
          <span className="deck-quiet__txt">NOTHING FINISHED YET</span>
        </div>
      ) : (
        <div className="queue">
          {rows.slice(0, preview).map((q) => (
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
          {rows.length > preview && (
            <div className="queue-more" onClick={() => navigate("/tasks")}>
              + {rows.length - preview} more →
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function EventStreamPanel({ ticker }: { ticker: TickerEntry[] }) {
  return (
    <section className="deck-panel deck-panel--ticker">
      <PanelHead title="EVENT STREAM" accent="#f5b544" right={<span className="ticker-pip" />} />
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
.deck-pulse { position: relative; z-index: 2; display: grid; gap: 10px; margin-bottom: 16px; grid-template-columns: repeat(6, 1fr); }
@media (max-width: 1100px) {
  .deck-pulse { grid-template-columns: repeat(auto-fit, minmax(108px, 1fr)); }
  .pulse-tile { min-height: 70px; }
}
@media (max-width: 520px) { .deck-pulse { gap: 8px; } }

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
@keyframes deck-rise { to { opacity: 1; transform: translateY(0); } }

/* ── throughput history graph ── */
.deck-graph {
  position: relative; z-index: 2; margin-bottom: 16px; overflow: hidden;
  background: linear-gradient(180deg, var(--panel-2), var(--panel));
  border: 1px solid var(--line); padding: 13px 16px 11px;
  opacity: 0; transform: translateY(8px);
  animation: deck-rise 0.5s cubic-bezier(0.2,0.8,0.2,1) 0.12s forwards;
}
.deck-graph .pulse-tile__corner { position: absolute; width: 11px; height: 11px; }
.deck-graph__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
.deck-graph__title { font-size: 12px; font-weight: 700; letter-spacing: 4px; color: #eaf4ff; }
.deck-graph__sub { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: var(--dim); margin-top: 4px; }
.deck-graph__stats { display: flex; gap: 22px; }
.deck-graph__stat { display: flex; flex-direction: column; align-items: flex-end; }
.deck-graph__stat b { font-size: 22px; font-weight: 600; line-height: 1; text-shadow: 0 0 14px currentColor; }
.deck-graph__stat span { font-size: 9px; letter-spacing: 1.5px; color: var(--faint); text-transform: uppercase; margin-top: 4px; }
.deck-graph__plot { position: relative; }
.deck-graph__svg { display: block; width: 100%; height: 132px; }
@media (max-width: 767px) { .deck-graph__svg { height: 108px; } }
.deck-graph__grid { stroke: var(--line-soft); stroke-width: 1; vector-effect: non-scaling-stroke; }
.deck-graph__area { animation: deck-graph-fill 0.9s ease-out 0.2s both; }
.deck-graph__line {
  fill: none; stroke: #57e389; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
  vector-effect: non-scaling-stroke; filter: drop-shadow(0 0 3px rgba(87,227,137,0.65));
  stroke-dasharray: 1; stroke-dashoffset: 1; animation: deck-trace 1.2s cubic-bezier(0.4,0,0.1,1) 0.1s forwards;
}
.deck-graph__now { fill: #57e389; filter: drop-shadow(0 0 6px #57e389); animation: deck-pulse 1.5s ease-in-out 1s infinite; }
.deck-graph__flat { stroke: var(--faint); stroke-width: 1.5; stroke-dasharray: 3 4; vector-effect: non-scaling-stroke; }
.deck-graph__idle { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; letter-spacing: 4px; color: var(--faint); animation: deck-flick 1.8s ease-in-out infinite; }
.deck-graph__xlabels { display: flex; justify-content: space-between; margin-top: 6px; font-size: 9px; letter-spacing: 1px; color: var(--faint); }
.deck-graph__now-lbl { color: #57e389; }
@keyframes deck-trace { to { stroke-dashoffset: 0; } }
@keyframes deck-graph-fill { from { opacity: 0; } to { opacity: 1; } }

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

/* ── running cards ── */
/* auto-fit (not auto-fill) collapses empty tracks so the cards stretch to
   fill the row instead of leaving ragged gaps on wide screens. */
.run-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
.run-card {
  position: relative; overflow: hidden; cursor: pointer;
  background: linear-gradient(165deg, rgba(56,189,248,0.06), rgba(8,14,20,0.4));
  border: 1px solid rgba(56,189,248,0.22); padding: 12px 13px 11px;
  opacity: 0; transform: translateY(10px); animation: deck-rise 0.55s cubic-bezier(0.2,0.8,0.2,1) forwards;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
}
.run-card:hover { border-color: #38bdf8; box-shadow: 0 0 0 1px rgba(56,189,248,0.5), 0 8px 26px rgba(0,0,0,0.5); transform: translateY(-3px); }
@keyframes deck-flow { from { background-position: 200% 0; } to { background-position: -200% 0; } }
@keyframes deck-march { to { background-position: 12px 0; } }
.run-card__head { display: flex; align-items: center; justify-content: space-between; }
.run-card__id { font-size: 13px; color: #eaf4ff; letter-spacing: 1px; }
.run-card__attempt { color: #f5b544; font-style: normal; font-size: 11px; }
.run-card__job { color: var(--dim); font-style: normal; font-size: 11px; }
.run-card__live { display: flex; align-items: center; gap: 5px; font-size: 9px; letter-spacing: 2px; color: #38bdf8; font-family: 'IBM Plex Mono', monospace; }
.run-card__live-dot { width: 6px; height: 6px; border-radius: 50%; background: #38bdf8; box-shadow: 0 0 8px #38bdf8; animation: deck-pulse 1.2s ease-in-out infinite; }
.run-card__plan { margin: 9px 0 3px; font-size: 14px; font-weight: 600; color: #dbe7f3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.run-card__chain { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11px; color: var(--dim); letter-spacing: 0.5px; }
.run-card__chain i { color: var(--faint); font-style: normal; }
.run-card__host { display: flex; align-items: center; gap: 6px; margin-top: 7px; font-size: 11px; color: var(--dim); letter-spacing: 0.3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.run-card__host-dot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: #57e389; box-shadow: 0 0 7px #57e389; animation: deck-pulse 1.6s ease-in-out infinite; }
.run-card__bar { position: relative; display: flex; height: 5px; margin: 11px 0 10px; background: rgba(255,255,255,0.04); overflow: hidden; }
.run-card__bar span { position: relative; display: block; height: 100%; overflow: hidden; transition: width 0.5s ease; }
.run-card__bar span::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.45) 50%, transparent 100%); background-size: 200% 100%; animation: deck-flow 1.4s linear infinite; pointer-events: none; }
.run-card__bar-idle { position: absolute; inset: 0; width: 100% !important; background: repeating-linear-gradient(90deg, rgba(120,160,200,0.16) 0 6px, transparent 6px 12px); animation: deck-march 0.7s linear infinite; }
.run-card__bar-idle::after { display: none; }
.run-card__foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.run-card__counts { font-size: 11px; color: var(--dim); }
.run-card__time { font-size: 15px; color: #57e389; letter-spacing: 1px; text-shadow: 0 0 12px rgba(87,227,137,0.4); }

/* ── adaptive: quiet (no live work) ── */
/* promote the rail's two panels into a balanced two-up that fills the deck */
.deck-grid--quiet { grid-template-columns: 1fr 1fr; }
@media (max-width: 1100px) { .deck-grid--quiet { grid-template-columns: 1fr; } }
.deck-quiet-strip { grid-column: 1 / -1; display: flex; align-items: center; gap: 14px; padding: 11px 15px; background: linear-gradient(180deg, var(--panel-2), var(--panel)); border: 1px solid var(--line); }
.deck-quiet-strip .deck-quiet__scope { width: 30px; height: 30px; }
.deck-quiet-strip .deck-quiet__txt { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 3px; color: var(--dim); }

/* ── adaptive: focus (one job → hero card) ── */
.hero-run {
  position: relative; overflow: hidden; cursor: pointer;
  display: flex; gap: 22px; align-items: stretch;
  background: linear-gradient(165deg, rgba(56,189,248,0.08), rgba(8,14,20,0.4));
  border: 1px solid rgba(56,189,248,0.28); padding: 20px 22px;
  opacity: 0; transform: translateY(10px); animation: deck-rise 0.55s cubic-bezier(0.2,0.8,0.2,1) forwards;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
}
.hero-run:hover { border-color: #38bdf8; box-shadow: 0 0 0 1px rgba(56,189,248,0.5), 0 10px 30px rgba(0,0,0,0.5); transform: translateY(-3px); }
.hero-run__main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.hero-run__head { display: flex; align-items: center; justify-content: space-between; }
.hero-run__id { font-size: 18px; color: #eaf4ff; letter-spacing: 1px; }
.hero-run__plan { margin: 12px 0 4px; font-size: 22px; font-weight: 700; color: #eaf4ff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hero-run__chain { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; color: var(--dim); letter-spacing: 0.5px; }
.hero-run__chain i { color: var(--faint); font-style: normal; }
.hero-run__meta { display: flex; gap: 14px; margin-top: 8px; font-size: 11px; color: var(--dim); letter-spacing: 0.5px; }
.hero-run__job { color: var(--faint); }
.hero-run__bar { position: relative; display: flex; height: 8px; margin: 16px 0 9px; background: rgba(255,255,255,0.04); overflow: hidden; }
.hero-run__bar span { position: relative; display: block; height: 100%; overflow: hidden; transition: width 0.5s ease; }
.hero-run__bar span::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.45) 50%, transparent 100%); background-size: 200% 100%; animation: deck-flow 1.4s linear infinite; pointer-events: none; }
.hero-run__bar .run-card__bar-idle::after { display: none; }
.hero-run__legend { display: flex; gap: 16px; margin-top: auto; font-size: 11px; }
.hero-run__clock { display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 6px; min-width: 180px; padding-left: 22px; border-left: 1px solid var(--line); }
.hero-run__clock-label { font-size: 10px; letter-spacing: 3px; color: var(--dim); }
.hero-run__clock-val { font-size: 40px; color: #57e389; letter-spacing: 2px; line-height: 1; text-shadow: 0 0 18px rgba(87,227,137,0.45); }
@media (max-width: 767px) {
  .hero-run { flex-direction: column; gap: 16px; }
  .hero-run__clock { align-items: flex-start; min-width: 0; padding-left: 0; padding-top: 14px; border-left: none; border-top: 1px solid var(--line); }
  .hero-run__clock-val { font-size: 32px; }
}

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
