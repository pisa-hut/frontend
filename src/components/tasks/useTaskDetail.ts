import { useCallback, useEffect, useMemo, useState } from "react";
import { message } from "antd";
import { api } from "../../api/client";
import { usePisaEvents } from "../../api/events";
import type {
  AvResponse,
  ConcreteRunStatus,
  MonitorResponse,
  PlanResponse,
  SamplerResponse,
  SimulatorResponse,
  TaskResponse,
} from "../../api/types";

export interface TaskDetailData {
  task: TaskResponse | null;
  loading: boolean;
  reload: () => void;
  names: {
    plans: Map<number, string>;
    avs: Map<number, string>;
    simulators: Map<number, string>;
    samplers: Map<number, string>;
    monitors: Map<number, string>;
  };
  currentPlan: PlanResponse | null;
  counts: { finished: number; failed: number; aborted: number; skipped: number };
}

/** Loads everything one task's detail surface needs (task row, concrete
 *  runs, resource-name maps) and keeps it live via SSE. Shared by the
 *  /tasks/:id page and the in-table detail drawer. */
export function useTaskDetail(taskId: number): TaskDetailData {
  const [task, setTask] = useState<TaskResponse | null>(null);
  const [statuses, setStatuses] = useState<ConcreteRunStatus[]>([]);
  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [avs, setAvs] = useState<AvResponse[]>([]);
  const [simulators, setSimulators] = useState<SimulatorResponse[]>([]);
  const [samplers, setSamplers] = useState<SamplerResponse[]>([]);
  const [monitors, setMonitors] = useState<MonitorResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!Number.isFinite(taskId)) return;
    setLoading(true);
    try {
      const [taskRow, statusRows] = await Promise.all([
        api.getTask(taskId),
        api.listConcreteRunStatuses(taskId),
      ]);
      setTask(taskRow);
      setStatuses(statusRows.map((r) => r.status));
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    setTask(null);
    setStatuses([]);
    reload();
  }, [reload]);

  useEffect(() => {
    Promise.all([
      api.listPlans(),
      api.listAvs(),
      api.listSimulators(),
      api.listSamplers(),
      api.listMonitors(),
    ])
      .then(([p, a, s, sa, mo]) => {
        setPlans(p);
        setAvs(a);
        setSimulators(s);
        setSamplers(sa);
        setMonitors(mo);
      })
      .catch((e) => message.error(String(e)));
  }, []);

  usePisaEvents(
    useCallback(
      (ev) => {
        if (ev.kind !== "row") return;
        if (ev.row.table === "task" && ev.row.id !== taskId) return;
        if (["task", "task_run", "concrete_run"].includes(ev.row.table)) reload();
      },
      [reload, taskId],
    ),
    useMemo(
      () => ({ kinds: ["row"] as const, rowTables: ["task", "task_run", "concrete_run"] as const }),
      [],
    ),
  );

  const names = useMemo(() => {
    const byId = <T extends { id: number; name: string }>(rows: T[]) =>
      new Map(rows.map((r) => [r.id, r.name]));
    return {
      plans: byId(plans),
      avs: byId(avs),
      simulators: byId(simulators),
      samplers: byId(samplers),
      monitors: byId(monitors),
    };
  }, [plans, avs, simulators, samplers, monitors]);

  const currentPlan = useMemo(
    () => plans.find((p) => p.id === task?.plan_id) ?? null,
    [plans, task?.plan_id],
  );

  const counts = useMemo(() => {
    const out = { finished: 0, failed: 0, aborted: 0, skipped: 0 };
    for (const s of statuses) out[s] += 1;
    return out;
  }, [statuses]);

  return { task, loading, reload, names, currentPlan, counts };
}
