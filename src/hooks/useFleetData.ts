import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import { usePisaEvents } from "../api/events";
import type {
  TaskResponse,
  ExecutorResponse,
  AvResponse,
  SimulatorResponse,
  SamplerResponse,
  PlanResponse,
} from "../api/types";

/** Shared fleet data + realtime refresh, used by the Control page and the
 *  Plans page's status breakdown.
 *
 *  Loads the six core lists once, exposes the id→name maps consumers
 *  derive, and debounce-refetches the whole set whenever a task /
 *  task_run row changes on the SSE feed. Pages layer their own
 *  page-specific fetches on top via separate usePisaEvents subscriptions
 *  (Control's throughput + event ticker) — the underlying EventSource is
 *  shared, so extra subscriptions are cheap. */
export function useFleetData() {
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [executors, setExecutors] = useState<ExecutorResponse[]>([]);
  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [avs, setAvs] = useState<AvResponse[]>([]);
  const [simulators, setSimulators] = useState<SimulatorResponse[]>([]);
  const [samplers, setSamplers] = useState<SamplerResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    return Promise.all([
      api.listTasks(),
      api.listExecutors(),
      api.listPlans(),
      api.listAvs(),
      api.listSimulators(),
      api.listSamplers(),
    ]).then(([t, e, p, av, sim, sam]) => {
      setTasks(t);
      setExecutors(e);
      setPlans(p);
      setAvs(av);
      setSimulators(sim);
      setSamplers(sam);
    });
  }, []);

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [reload]);

  // Debounced refetch on any task / task_run row change.
  const refetchTimer = useRef<number | null>(null);
  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current !== null) return;
    refetchTimer.current = window.setTimeout(() => {
      refetchTimer.current = null;
      reload();
    }, 250);
  }, [reload]);

  usePisaEvents(
    useCallback(
      (ev) => {
        if (ev.kind === "row" && (ev.row.table === "task" || ev.row.table === "task_run")) {
          scheduleRefetch();
        }
      },
      [scheduleRefetch],
    ),
    useMemo(() => ({ kinds: ["row"] as const, rowTables: ["task", "task_run"] as const }), []),
  );

  useEffect(() => {
    return () => {
      if (refetchTimer.current !== null) {
        window.clearTimeout(refetchTimer.current);
        refetchTimer.current = null;
      }
    };
  }, []);

  const planMap = useMemo(() => new Map(plans.map((p) => [p.id, p.name])), [plans]);
  const avMap = useMemo(() => new Map(avs.map((a) => [a.id, a.name])), [avs]);
  const simMap = useMemo(() => new Map(simulators.map((s) => [s.id, s.name])), [simulators]);
  const samplerMap = useMemo(() => new Map(samplers.map((s) => [s.id, s.name])), [samplers]);
  const executorMap = useMemo(() => new Map(executors.map((e) => [e.id, e])), [executors]);

  return {
    tasks,
    executors,
    plans,
    avs,
    simulators,
    samplers,
    loading,
    reload,
    planMap,
    avMap,
    simMap,
    samplerMap,
    executorMap,
  };
}
