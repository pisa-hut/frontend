import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Tag,
  Button,
  Card,
  Dropdown,
  Empty,
  message,
  Modal,
  Typography,
  Space,
  Table,
  Tooltip,
} from "antd";
import type { MenuProps } from "antd";
import {
  ReloadOutlined,
  ThunderboltOutlined,
  CaretRightOutlined,
  StopOutlined,
  SyncOutlined,
  FileTextOutlined,
  ClearOutlined,
  ExclamationCircleOutlined,
  LinkOutlined,
  InboxOutlined,
  RollbackOutlined,
  MoreOutlined,
} from "@ant-design/icons";
import type { FilterValue, SortOrder } from "antd/es/table/interface";
import { getColumnSearchProps } from "../components/ColumnSearch";
import PageHeader from "../components/PageHeader";
import { matchesTaskFilter, type TaskFilterCriteria } from "./tasksFilter";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { useSessionStorageState } from "../hooks/useSessionStorageState";
import { api } from "../api/client";
import { useTaskStore, useTaskStoreSse, taskStore } from "../stores/taskStore";
import type {
  TaskResponse,
  TaskStatus,
  TaskRunResponse,
  PlanResponse,
  AvResponse,
  SimulatorResponse,
  SamplerResponse,
  MonitorResponse,
  ExecutorResponse,
} from "../api/types";
import { RUNNABLE_TASK_STATUSES } from "../api/types";
import { TASK_STATUS_TAG_COLOR, TASK_STATUS_LABEL, TASK_STATUS_HEX } from "../constants/status";
import TasksFilters, { QUICK_FILTERS, type QuickFilter } from "../components/tasks/TasksFilters";
import TasksFilterBar from "../components/tasks/TasksFilterBar";
import TasksSelectionBar from "../components/tasks/TasksSelectionBar";

// Heavy children rendered only after a user gesture (clicking a log
// icon, the Triage button, etc.) — keep them out of the eager Tasks
// chunk via React.lazy. `fallback={null}` because their visible
// behaviour is "open=false → invisible" anyway; nothing to wait for.
const LogDrawer = lazy(() => import("../components/LogDrawer"));
const TriageInvalidModal = lazy(() => import("../components/TriageInvalidModal"));
const CreateTaskModal = lazy(() => import("../components/tasks/CreateTaskModal"));

const RUNNABLE_STATUSES = RUNNABLE_TASK_STATUSES;
const STOPPABLE_STATUSES: TaskStatus[] = ["queued", "running"];

// Mirrors the filter-bar's CHIP_STYLE so per-row tag chips and the
// top-bar tag filter chips share dimensions. Display-only (no toggle).
const ROW_TAG_STYLE = {
  padding: "2px 10px",
  fontSize: 12,
  marginInlineEnd: 0,
  maxWidth: 148,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

type SortKey = "id" | "attempt_count" | "last_run_at";
const VALID_SORT_KEYS: SortKey[] = ["id", "attempt_count", "last_run_at"];

function isSortKey(s: string | undefined): s is SortKey {
  return s != null && (VALID_SORT_KEYS as string[]).includes(s);
}

function parseIdSet(value: unknown): Set<number> {
  const out = new Set<number>();
  for (const tok of String(value ?? "").split(",")) {
    const n = parseInt(tok.trim(), 10);
    if (Number.isFinite(n)) out.add(n);
  }
  return out;
}

export default function Tasks() {
  // One themed confirm modal shared by every row's action buttons, instead
  // of a per-row <Popconfirm> (those Trigger-based mounts dominate the
  // table's re-render cost). `modal` is stable across renders.
  const [modal, modalCtx] = Modal.useModal();
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultStatusFilter = useMemo(() => {
    const s = searchParams.get("status");
    return s ? [s] : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const defaultQuickFilter: QuickFilter = useMemo(() => {
    const s = searchParams.get("status");
    if (s && QUICK_FILTERS.some((q) => q.value === s)) return s as QuickFilter;
    return "all";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // `?id=123` or `?id=123,456` scopes the table to specific task ids.
  // Drives the same `filteredInfo.id` chip the column search produces,
  // so the existing server query path works untouched. Empty string in
  // the URL is treated as "no id filter".
  const defaultIdFilter = useMemo(() => {
    const raw = searchParams.get("id");
    return raw ? [raw] : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The full task set lives in a client-side store, loaded once (chunked)
  // and kept live via SSE row events. The table filters/sorts/scrolls
  // entirely in-memory, so a chip toggle or sort does zero network and
  // re-renders only the virtualized window.
  const { rows: storeRows, state: storeState } = useTaskStore();
  useTaskStoreSse();

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  // Filter state lives in sessionStorage so it survives in-tab
  // refreshes during an investigation but resets when the tab/browser
  // closes — yesterday's filter ghosts no longer reappear on the
  // morning's Tasks page. UI preferences (pageSize, sortedInfo) stay
  // in localStorage.
  const [quickFilter, setQuickFilterRaw] = useSessionStorageState<QuickFilter>(
    "tasks.quickFilter",
    defaultQuickFilter,
  );

  // One-shot localStorage cleanup of orphaned keys for removed
  // features plus the filter keys that moved to sessionStorage —
  // otherwise migrating users would silently carry forward yesterday's
  // filter state, which is exactly what the move was meant to fix.
  useEffect(() => {
    for (const k of [
      "tasks.pinned",
      "tasks.compactView",
      "tasks.showArchived",
      "tasks.quickFilter",
      "tasks.tagFilter",
      "tasks.filteredInfo",
    ]) {
      try {
        localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const defaultTagFilter = useMemo(() => {
    const all = searchParams.getAll("tag");
    if (all.length > 1) return all;
    const single = all[0];
    return single ? single.split(",").filter(Boolean) : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [tagFilter, setTagFilterRaw] = useSessionStorageState<string[]>(
    "tasks.tagFilter",
    defaultTagFilter,
  );
  // On first visit to a tab, we pre-select every available tag so the
  // table starts filtered to "tagged tasks only" (the new default). The
  // initialised flag persists in sessionStorage so a user who explicitly
  // clears the filter doesn't get it re-filled on the next in-tab refresh.
  const [tagFilterInitialised, setTagFilterInitialised] = useSessionStorageState<boolean>(
    "tasks.tagFilterInitialised",
    defaultTagFilter.length > 0,
  );

  const [filteredInfo, setFilteredInfo] = useSessionStorageState<
    Record<string, FilterValue | null>
  >("tasks.filteredInfo", {
    task_status: defaultStatusFilter ?? null,
    ...(defaultIdFilter ? { id: defaultIdFilter as FilterValue } : {}),
  });
  // Sort is restricted to server-sortable columns (id, attempt_count,
  // last_run_at). The latter is the denormalised column added in
  // manager m20260516 — kept fresh by a trigger on task_run.
  const [sortedInfo, setSortedInfo] = useLocalStorageState<{ key?: SortKey; order?: SortOrder }>(
    "tasks.sortedInfo",
    { key: "last_run_at", order: "descend" },
  );

  // "Show archived" toggle. Default off — the queries filter
  // `archived=eq.false` server-side so soft-archived rows stay out of
  // the way until the user opts in. SessionStorage so the choice
  // sticks across in-tab navigation but resets next session, same as
  // the other filter knobs.
  const defaultIncludeArchived = useMemo(() => {
    return searchParams.get("archived") === "1";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [includeArchived, setIncludeArchivedRaw] = useSessionStorageState<boolean>(
    "tasks.includeArchived",
    defaultIncludeArchived,
  );
  const setIncludeArchived = useCallback(
    (next: boolean) => {
      setIncludeArchivedRaw(next);
      setSearchParams((prev) => {
        const out = new URLSearchParams(prev);
        if (next) out.set("archived", "1");
        else out.delete("archived");
        return out;
      });
    },
    [setIncludeArchivedRaw, setSearchParams],
  );
  const hasActiveFilters = useMemo(
    () =>
      tagFilter.length > 0 || Object.values(filteredInfo).some((v) => v != null && v.length > 0),
    [filteredInfo, tagFilter],
  );

  const clearFilters = useCallback(() => {
    setFilteredInfo({});
    setQuickFilterRaw("all");
    setTagFilterRaw([]);
    setTagFilterInitialised(true);
    setSearchParams({});
  }, [
    setFilteredInfo,
    setQuickFilterRaw,
    setTagFilterRaw,
    setTagFilterInitialised,
    setSearchParams,
  ]);

  const setTagFilter = useCallback(
    (next: string[]) => {
      setTagFilterRaw(next);
      setTagFilterInitialised(true);
      setSearchParams((prev) => {
        const out = new URLSearchParams(prev);
        out.delete("tag");
        if (next.length > 0) out.set("tag", next.join(","));
        return out;
      });
    },
    [setTagFilterRaw, setTagFilterInitialised, setSearchParams],
  );

  const setQuickFilter = useCallback(
    (q: QuickFilter) => {
      setQuickFilterRaw(q);
      setFilteredInfo(() => ({
        task_status: q === "all" ? null : ([q] as FilterValue),
      }));
      if (q === "all") setSearchParams({});
      else setSearchParams({ status: q });
    },
    [setQuickFilterRaw, setFilteredInfo, setSearchParams],
  );

  // URL → state sync after mount.
  useEffect(() => {
    const s = searchParams.get("status");
    if (s && QUICK_FILTERS.some((q) => q.value === s) && s !== quickFilter) {
      setQuickFilter(s as QuickFilter);
    }
    const tagAll = searchParams.getAll("tag");
    const tagsFromUrl =
      tagAll.length > 1 ? tagAll : tagAll[0] ? tagAll[0].split(",").filter(Boolean) : [];
    if (tagsFromUrl.length > 0 && tagsFromUrl.join(",") !== tagFilter.join(",")) {
      setTagFilterRaw(tagsFromUrl);
      setTagFilterInitialised(true);
    }
    // `?id=` overrides any cached filteredInfo.id from localStorage so a
    // shared link always lands on the linked task, regardless of what
    // the recipient's table state was.
    const idRaw = searchParams.get("id");
    if (idRaw != null) {
      const cellValue = idRaw.trim();
      const cached = (filteredInfo.id as (string | number)[] | undefined) ?? [];
      if (cellValue && (cached.length !== 1 || String(cached[0]) !== cellValue)) {
        setFilteredInfo((prev) => ({ ...prev, id: [cellValue] as FilterValue }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Log drawer
  const [logRun, setLogRun] = useState<TaskRunResponse | null>(null);
  const [logExecutorOverride, setLogExecutorOverride] = useState<ExecutorResponse | undefined>();
  const [executorsById, setExecutorsById] = useState<Map<number, ExecutorResponse>>(new Map());
  const logExecutor = useMemo(() => {
    if (logExecutorOverride) return logExecutorOverride;
    if (!logRun) return undefined;
    return executorsById.get(logRun.executor_id);
  }, [executorsById, logExecutorOverride, logRun]);

  const openLog = useCallback((run: TaskRunResponse, executor?: ExecutorResponse) => {
    setLogRun(run);
    setLogExecutorOverride(executor);
  }, []);

  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [triageOpen, setTriageOpen] = useState(false);

  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [avs, setAvs] = useState<AvResponse[]>([]);
  const [simulators, setSimulators] = useState<SimulatorResponse[]>([]);
  const [samplers, setSamplers] = useState<SamplerResponse[]>([]);
  const [monitors, setMonitors] = useState<MonitorResponse[]>([]);

  const fetchResources = () =>
    Promise.all([
      api.listPlans(),
      api.listAvs(),
      api.listSimulators(),
      api.listSamplers(),
      api.listMonitors(),
    ]).then(([p, a, s, sa, mo]) => {
      setPlans(p);
      setAvs(a);
      setSimulators(s);
      setSamplers(sa);
      setMonitors(mo);
    });

  useEffect(() => {
    fetchResources();
  }, []);

  useEffect(() => {
    api.listExecutors().then((all) => {
      setExecutorsById(new Map(all.map((e) => [e.id, e])));
    });
  }, []);

  const planMap = useMemo(() => new Map(plans.map((p) => [p.id, p.name])), [plans]);
  const planTagsMap = useMemo(() => new Map(plans.map((p) => [p.id, p.tags ?? []])), [plans]);

  // --- Client-side view derived from the in-memory store ---

  // Active filter as a TaskFilterCriteria (shared by the table view, the
  // chip counts, and select-all). Built from the same filteredInfo +
  // tagFilter that the chips/column-search drive.
  const criteria: TaskFilterCriteria = useMemo(() => {
    const status = (filteredInfo.task_status as string[] | undefined)?.filter(Boolean) as
      | TaskStatus[]
      | undefined;
    let ids: Set<number> | undefined;
    const idVals = filteredInfo.id as (string | number)[] | undefined;
    if (idVals?.length) {
      ids = new Set<number>();
      for (const v of idVals) for (const n of parseIdSet(v)) ids.add(n);
    }
    return {
      status,
      avIds: (filteredInfo.av_id as (number | string)[] | undefined)?.map(Number),
      simIds: (filteredInfo.simulator_id as (number | string)[] | undefined)?.map(Number),
      samplerIds: (filteredInfo.sampler_id as (number | string)[] | undefined)?.map(Number),
      monitorIds: (filteredInfo.monitor_id as (number | string)[] | undefined)?.map(Number),
      ids,
      tags: tagFilter.length > 0 ? new Set(tagFilter) : undefined,
      planSearch:
        (filteredInfo.plan_id as string[] | undefined)?.[0]?.toString().toLowerCase() || undefined,
    };
  }, [filteredInfo, tagFilter]);

  // Archived rows are hidden unless "Show archived" is on. Applied once
  // here so chip counts, select-all, and the table share one base set.
  const baseRows = useMemo(
    () => (includeArchived ? storeRows : storeRows.filter((r) => !r.archived)),
    [storeRows, includeArchived],
  );

  // The visible rows: filtered + sorted entirely in memory, so a chip
  // toggle or sort recomputes this and the virtual Table re-renders only
  // its window — no network.
  const viewRows = useMemo(() => {
    const filtered = baseRows.filter((t) => matchesTaskFilter(t, criteria, planTagsMap, planMap));
    const key: SortKey = isSortKey(sortedInfo.key) ? sortedInfo.key : "last_run_at";
    const dir = sortedInfo.order === "ascend" ? 1 : -1;
    const cmp = (a: TaskResponse, b: TaskResponse): number => {
      if (key === "id") return (a.id - b.id) * dir;
      if (key === "attempt_count") return (a.attempt_count - b.attempt_count) * dir || a.id - b.id;
      // last_run_at: nulls always sort last regardless of direction.
      const av = a.last_run_at;
      const bv = b.last_run_at;
      if (av == null && bv == null) return b.id - a.id;
      if (av == null) return 1;
      if (bv == null) return -1;
      const d = av < bv ? -1 : av > bv ? 1 : 0;
      return d * dir || b.id - a.id;
    };
    return [...filtered].sort(cmp);
  }, [baseRows, criteria, sortedInfo, planTagsMap, planMap]);

  // Invalid task ids inside the active page filter. Reuses the table's
  // own filter predicate but pins task_status to "invalid", so the
  // Triage button counts and seeds itself with exactly the invalid
  // slice the user is currently looking at — not the global pile.
  // Status filter is ignored on purpose: a user looking at "All" or
  // "Running" plus a tag still wants to triage that tag's invalids
  // without flipping the status chip first.
  const filteredInvalidTaskIds = useMemo(() => {
    const idVals = filteredInfo.id as (string | number)[] | undefined;
    let idSet: Set<number> | undefined;
    if (idVals?.length) {
      idSet = new Set<number>();
      for (const v of idVals) for (const n of parseIdSet(v)) idSet.add(n);
    }
    const f: TaskFilterCriteria = {
      status: ["invalid"],
      avIds: (filteredInfo.av_id as (number | string)[] | undefined)?.map(Number),
      simIds: (filteredInfo.simulator_id as (number | string)[] | undefined)?.map(Number),
      samplerIds: (filteredInfo.sampler_id as (number | string)[] | undefined)?.map(Number),
      monitorIds: (filteredInfo.monitor_id as (number | string)[] | undefined)?.map(Number),
      ids: idSet,
      tags: tagFilter.length > 0 ? new Set(tagFilter) : undefined,
      planSearch:
        (filteredInfo.plan_id as string[] | undefined)?.[0]?.toString().toLowerCase() || undefined,
    };
    return baseRows.filter((t) => matchesTaskFilter(t, f, planTagsMap, planMap)).map((t) => t.id);
  }, [baseRows, filteredInfo, tagFilter, planTagsMap, planMap]);

  // Short human description of the active scope, fed to the Triage
  // modal title so the user can see WHY the count differs from the
  // global invalid total. Empty string when no relevant filter active.
  const triageScopeLabel = useMemo(() => {
    const bits: string[] = [];
    if (tagFilter.length > 0)
      bits.push(`tag${tagFilter.length > 1 ? "s" : ""}: ${tagFilter.join(", ")}`);
    const avIds = filteredInfo.av_id as (number | string)[] | undefined;
    if (avIds?.length) bits.push(`${avIds.length} AV`);
    const simIds = filteredInfo.simulator_id as (number | string)[] | undefined;
    if (simIds?.length) bits.push(`${simIds.length} Sim`);
    const samplerIds = filteredInfo.sampler_id as (number | string)[] | undefined;
    if (samplerIds?.length) bits.push(`${samplerIds.length} Sampler`);
    const monitorIds = filteredInfo.monitor_id as (number | string)[] | undefined;
    if (monitorIds?.length) bits.push(`${monitorIds.length} Monitor`);
    const planSearch = (filteredInfo.plan_id as string[] | undefined)?.[0];
    if (planSearch) bits.push(`plan: "${planSearch}"`);
    const idVals = filteredInfo.id as (string | number)[] | undefined;
    if (idVals?.length) bits.push(`id: ${idVals.join(", ")}`);
    return bits.join(" · ");
  }, [tagFilter, filteredInfo]);

  // Summaries scoped to the active tag filter. The status chips and
  // the av/sim/sampler/monitor axis counts read from this so the
  // displayed numbers match what the table is actually showing after
  // the tag filter is applied server-side. Tag chips themselves stay
  // on the unscoped `baseRows` so other tags remain navigable.
  const tagScopedSummaries = useMemo(() => {
    if (tagFilter.length === 0) return baseRows;
    const want = new Set(tagFilter);
    return baseRows.filter((t) => {
      const tags = planTagsMap.get(t.plan_id) ?? [];
      return tags.some((x) => want.has(x));
    });
  }, [baseRows, tagFilter, planTagsMap]);

  // Per-axis chip counts. AV/Sim/Sampler/Monitor counts come from the
  // tag-scoped slice so the chip number tracks the table. Tag counts
  // come from the unscoped summaries so picking tag A doesn't blank
  // out the count next to tag B.
  const filterCounts = useMemo(() => {
    const av = new Map<number, number>();
    const sim = new Map<number, number>();
    const sampler = new Map<number, number>();
    const monitor = new Map<number, number>();
    const tag = new Map<string, number>();
    for (const t of tagScopedSummaries) {
      av.set(t.av_id, (av.get(t.av_id) ?? 0) + 1);
      sim.set(t.simulator_id, (sim.get(t.simulator_id) ?? 0) + 1);
      sampler.set(t.sampler_id, (sampler.get(t.sampler_id) ?? 0) + 1);
      if (t.monitor_id != null) monitor.set(t.monitor_id, (monitor.get(t.monitor_id) ?? 0) + 1);
    }
    for (const t of baseRows) {
      const tags = planTagsMap.get(t.plan_id) ?? [];
      for (const tn of tags) tag.set(tn, (tag.get(tn) ?? 0) + 1);
    }
    return { av_id: av, simulator_id: sim, sampler_id: sampler, monitor_id: monitor, tag };
  }, [baseRows, tagScopedSummaries, planTagsMap]);
  const tagCounts = useMemo(
    () =>
      [...filterCounts.tag.entries()].sort((a, b) =>
        b[1] - a[1] !== 0 ? b[1] - a[1] : a[0].localeCompare(b[0]),
      ),
    [filterCounts.tag],
  );
  const availableTagNames = useMemo(() => tagCounts.map(([t]) => t), [tagCounts]);
  const avMap = useMemo(() => new Map(avs.map((a) => [a.id, a.name])), [avs]);
  const simMap = useMemo(() => new Map(simulators.map((s) => [s.id, s.name])), [simulators]);
  const samplerMap = useMemo(() => new Map(samplers.map((s) => [s.id, s.name])), [samplers]);

  // Default-all-tags: once the plan/tag list has loaded for the first
  // time, pre-select every tag so the table starts scoped to "tagged
  // tasks only". Skipped when the URL or sessionStorage already
  // provided a selection (`tagFilterInitialised`).
  useEffect(() => {
    if (tagFilterInitialised) return;
    if (availableTagNames.length === 0) return;
    setTagFilterRaw(availableTagNames);
    setTagFilterInitialised(true);
  }, [tagFilterInitialised, availableTagNames, setTagFilterRaw, setTagFilterInitialised]);

  const logTask = useMemo(
    () => (logRun ? storeRows.find((t) => t.id === logRun.task_id) : undefined),
    [logRun, storeRows],
  );
  const logTaskLabel = useMemo(
    () => (logTask ? planMap.get(logTask.plan_id) : undefined),
    [logTask, planMap],
  );

  // For the selection bar's runnable/stoppable counts and "select all
  // filtered" computation, we need a status lookup that spans every row.
  const statusById = useMemo(() => {
    const m = new Map<number, TaskStatus>();
    for (const s of baseRows) m.set(s.id, s.task_status);
    return m;
  }, [baseRows]);

  const archivedById = useMemo(() => {
    const m = new Map<number, boolean>();
    for (const s of baseRows) m.set(s.id, s.archived);
    return m;
  }, [baseRows]);

  // IDs matching the current chip filter set (the FULL filtered set, not
  // just the visible window) — drives "select all filtered".
  const filteredSummaryIds = useMemo(
    () =>
      baseRows.filter((t) => matchesTaskFilter(t, criteria, planTagsMap, planMap)).map((t) => t.id),
    [baseRows, criteria, planTagsMap, planMap],
  );

  // --- Actions ---

  const handleRun = useCallback(
    async (id: number) => {
      try {
        // Priority is derived from the plan's tag ranking by the DB; the
        // frontend only flips status to queued (the trigger stamps queued_at).
        await api.updateTask(id, { task_status: "queued" });
        message.success(`Task #${id} queued`);
        taskStore.patchTaskIds([id]);
      } catch (e) {
        message.error(String(e));
      }
    },
    [],
  );

  const handleStop = useCallback(async (id: number) => {
    try {
      await api.stopTask(id);
      message.success(`Task #${id} stopped`);
      taskStore.patchTaskIds([id]);
    } catch (e) {
      message.error(String(e));
    }
  }, []);

  const handleArchive = useCallback(async (id: number, archived: boolean) => {
    try {
      if (archived) {
        await api.unarchiveTask(id);
        message.success(`Task #${id} unarchived`);
      } else {
        await api.archiveTask(id);
        message.success(`Task #${id} archived`);
      }
      taskStore.patchTaskIds([id]);
    } catch (e) {
      message.error(String(e));
    }
  }, []);

  // The task detail route is now the canonical share target. Same
  // origin works in dev, staging, and prod without configuration.
  // Falls back to a manual prompt if Clipboard is blocked.
  const copyTaskLink = useCallback((id: number) => {
    const url = `${window.location.origin}/tasks/${id}`;
    const done = () => message.success(`Link to task #${id} copied`);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done, () => window.prompt("Copy this link:", url));
    } else {
      window.prompt("Copy this link:", url);
    }
  }, []);

  const handleBulkRun = async () => {
    const ids = (selectedRowKeys as number[]).filter((id) =>
      RUNNABLE_STATUSES.includes(statusById.get(id) ?? "idle"),
    );
    try {
      await api.batchRunTasks(ids);
      message.success(`Queued ${ids.length} tasks`);
    } catch (e) {
      message.error(String(e));
    }
    setSelectedRowKeys([]);
    taskStore.patchTaskIds(ids);
  };

  const handleBulkStop = async () => {
    const ids = (selectedRowKeys as number[]).filter((id) => {
      const st = statusById.get(id);
      return st != null && STOPPABLE_STATUSES.includes(st);
    });
    try {
      await api.batchStopTasks(ids);
      message.success(`Stopped ${ids.length} tasks`);
    } catch (e) {
      message.error(String(e));
    }
    setSelectedRowKeys([]);
    taskStore.patchTaskIds(ids);
  };

  const handleBulkDelete = async () => {
    const ids = selectedRowKeys as number[];
    try {
      await api.batchDeleteTasks(ids);
      message.success(`Deleted ${ids.length} tasks`);
    } catch (e) {
      message.error(String(e));
    }
    setSelectedRowKeys([]);
    taskStore.removeTasks(ids);
  };

  const handleBulkArchive = async () => {
    const ids = selectedRowKeys as number[];
    try {
      await api.batchArchiveTasks(ids);
      message.success(`Archived ${ids.length} task(s)`);
    } catch (e) {
      message.error(String(e));
    }
    setSelectedRowKeys([]);
    taskStore.patchTaskIds(ids);
  };

  const handleBulkUnarchive = async () => {
    const ids = selectedRowKeys as number[];
    try {
      await api.batchUnarchiveTasks(ids);
      message.success(`Unarchived ${ids.length} task(s)`);
    } catch (e) {
      message.error(String(e));
    }
    setSelectedRowKeys([]);
    taskStore.patchTaskIds(ids);
  };

  // --- Columns ---

  const columns = useMemo(() => {
    const orderFor = (key: string): SortOrder | null =>
      sortedInfo.key === key ? (sortedInfo.order ?? null) : null;

    return [
      {
        title: "ID",
        dataIndex: "id",
        key: "id",
        width: 84,
        ellipsis: true,
        sorter: true,
        sortOrder: orderFor("id"),
        render: (id: number) => (
          <Link
            to={`/tasks/${id}`}
            title="Open task details"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            #{id}
          </Link>
        ),
        ...getColumnSearchProps<TaskResponse>("id"),
        filteredValue: (filteredInfo.id as FilterValue) ?? null,
      },
      {
        title: "Plan",
        dataIndex: "plan_id",
        key: "plan_id",
        width: 218,
        ellipsis: true,
        render: (id: number) => {
          const name = planMap.get(id) ?? `#${id}`;
          return <Typography.Text ellipsis>{name}</Typography.Text>;
        },
        ...getColumnSearchProps<TaskResponse>("plan_id", (r) => planMap.get(r.plan_id) ?? ""),
        filteredValue: (filteredInfo.plan_id as FilterValue) ?? null,
      },
      {
        title: "Tags",
        key: "plan_tags",
        width: 160,
        render: (_: unknown, r: TaskResponse) => {
          const tags = planTagsMap.get(r.plan_id) ?? [];
          if (tags.length === 0) {
            return (
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                untagged
              </Typography.Text>
            );
          }
          // Single line, clipped at the cell — virtual rows need a
          // uniform height, so tags must never wrap onto a second line.
          return (
            <div style={{ display: "flex", gap: 4, overflow: "hidden" }}>
              {tags.map((tag) => (
                <Tag key={tag} style={ROW_TAG_STYLE} title={tag}>
                  {tag}
                </Tag>
              ))}
            </div>
          );
        },
      },
      {
        title: "Setup",
        key: "setup",
        width: 170,
        ellipsis: true,
        render: (_: unknown, r: TaskResponse) => (
          <Typography.Text style={{ fontSize: 12 }} ellipsis>
            {avMap.get(r.av_id) ?? `#${r.av_id}`}
            <Typography.Text type="secondary"> · </Typography.Text>
            {simMap.get(r.simulator_id) ?? `#${r.simulator_id}`}
            <Typography.Text type="secondary"> · </Typography.Text>
            {samplerMap.get(r.sampler_id) ?? `#${r.sampler_id}`}
          </Typography.Text>
        ),
      },
      {
        title: "Status",
        dataIndex: "task_status",
        key: "task_status",
        width: 124,
        render: (status: TaskStatus, r: TaskResponse) => (
          <Space size={4} wrap>
            <Tag
              color={TASK_STATUS_TAG_COLOR[status]}
              icon={
                status === "running" ? (
                  <SyncOutlined spin />
                ) : (
                  <span
                    aria-hidden
                    style={{
                      display: "inline-block",
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      background: TASK_STATUS_HEX[status],
                      marginRight: 6,
                      verticalAlign: "middle",
                    }}
                  />
                )
              }
              style={{ fontWeight: 500, marginInlineEnd: 0 }}
            >
              {TASK_STATUS_LABEL[status]}
            </Tag>
            {r.archived && (
              <Tag color="default" style={{ marginInlineEnd: 0, fontSize: 11 }}>
                archived
              </Tag>
            )}
          </Space>
        ),
      },
      {
        title: "Attempts",
        dataIndex: "attempt_count",
        key: "attempt_count",
        width: 116,
        sorter: true,
        sortOrder: orderFor("attempt_count"),
        render: (n: number, r: TaskResponse) => {
          if (!n) return <Typography.Text type="secondary">0</Typography.Text>;
          // Attempt history lives on the detail page now (the table is
          // virtualized, so no inline expansion).
          return (
            <Link
              to={`/tasks/${r.id}`}
              title="View attempt history"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {n}
            </Link>
          );
        },
      },
      {
        title: (
          <Tooltip title="Cumulative concrete-scenario counts: finished / aborted / skipped">
            <span>Concretes</span>
          </Tooltip>
        ),
        key: "concrete_counts",
        width: 100,
        render: (_: unknown, r: TaskResponse) => {
          const run = r.task_run?.[0];
          if (!run) return <Typography.Text type="secondary">—</Typography.Text>;
          const f = run.finished_concrete_runs ?? 0;
          const a = run.aborted_concrete_runs ?? 0;
          const s = run.skipped_concrete_runs ?? 0;
          if (f === 0 && a === 0 && s === 0) {
            return <Typography.Text type="secondary">0 / 0 / 0</Typography.Text>;
          }
          return (
            <span
              title={`${f} finished · ${a} aborted · ${s} skipped`}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              <Typography.Text style={{ color: "var(--ant-color-success)" }}>{f}</Typography.Text>
              <Typography.Text type="secondary"> / </Typography.Text>
              <Typography.Text style={{ color: "var(--ant-color-warning)" }}>{a}</Typography.Text>
              <Typography.Text type="secondary"> / </Typography.Text>
              <Typography.Text type="secondary">{s}</Typography.Text>
            </span>
          );
        },
      },
      {
        title: "Last Run",
        key: "last_run_at",
        dataIndex: "last_run_at",
        width: 124,
        sorter: true,
        sortOrder: orderFor("last_run_at"),
        render: (_: unknown, r: TaskResponse) => {
          const t = r.last_run_at ?? r.task_run?.[0]?.started_at;
          if (!t) return <Typography.Text type="secondary">—</Typography.Text>;
          const d = new Date(t);
          const pad = (n: number) => String(n).padStart(2, "0");
          const shortLabel = `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
          const ms = Date.now() - d.getTime();
          const rel = (() => {
            const s = Math.floor(ms / 1000);
            if (s < 60) return `${s}s ago`;
            const m = Math.floor(s / 60);
            if (m < 60) return `${m}m ago`;
            const h = Math.floor(m / 60);
            if (h < 48) return `${h}h ago`;
            return `${Math.floor(h / 24)}d ago`;
          })();
          return (
            <span title={`${d.toISOString()} · ${rel}`} style={{ fontVariantNumeric: "tabular-nums" }}>
              {shortLabel}
            </span>
          );
        },
      },
      {
        title: "",
        key: "actions",
        width: 56,
        align: "center" as const,
        render: (_: unknown, record: TaskResponse) => {
          const canRun = RUNNABLE_STATUSES.includes(record.task_status);
          const canStop = STOPPABLE_STATUSES.includes(record.task_status);
          const latestRun = record.task_run?.[0];
          // Collapsed into a single lazy dropdown: the overlay (and its
          // Menu) only mounts when opened, so 20 rows don't each build
          // four antd Buttons on every table re-render. Confirmations go
          // through the page-level shared modal.
          const items: MenuProps["items"] = [
            {
              key: "link",
              icon: <LinkOutlined />,
              label: "Copy shareable link",
              onClick: () => copyTaskLink(record.id),
            },
            {
              key: "log",
              icon: <FileTextOutlined />,
              label: latestRun ? `Log · attempt #${latestRun.attempt}` : "No run yet",
              disabled: !latestRun,
              onClick: () => latestRun && openLog(latestRun),
            },
            { type: "divider" },
            canStop
              ? {
                  key: "stop",
                  icon: <StopOutlined />,
                  label: "Stop",
                  danger: true,
                  onClick: () => modal.confirm({ title: "Stop?", onOk: () => handleStop(record.id) }),
                }
              : {
                  key: "run",
                  icon: <CaretRightOutlined />,
                  label: "Run",
                  disabled: !canRun,
                  onClick: () => modal.confirm({ title: "Run?", onOk: () => handleRun(record.id) }),
                },
            {
              key: "archive",
              icon: record.archived ? <RollbackOutlined /> : <InboxOutlined />,
              label: record.archived ? "Unarchive" : "Archive (soft-hide)",
              onClick: () =>
                modal.confirm({
                  title: record.archived ? "Unarchive?" : "Archive?",
                  onOk: () => handleArchive(record.id, record.archived),
                }),
            },
          ];
          return (
            <Dropdown menu={{ items }} trigger={["click"]} placement="bottomRight">
              <Button
                size="small"
                icon={<MoreOutlined />}
                title="Actions"
                onClick={(e) => e.stopPropagation()}
              />
            </Dropdown>
          );
        },
      },
    ];
    // Scope to the two filter axes the columns actually read (the id /
    // plan_id column-search highlights), so av/sim/sampler/monitor/tag
    // chip toggles don't rebuild this array.
  }, [
    filteredInfo.id,
    filteredInfo.plan_id,
    sortedInfo,
    avMap,
    simMap,
    samplerMap,
    planMap,
    planTagsMap,
    openLog,
    handleRun,
    handleStop,
    handleArchive,
    copyTaskLink,
    modal,
  ]);

  const selectionBar = (
    <TasksSelectionBar
      statusById={statusById}
      visibleIds={filteredSummaryIds}
      archivedById={archivedById}
      selectedRowKeys={selectedRowKeys}
      setSelectedRowKeys={setSelectedRowKeys}
      onBulkRun={handleBulkRun}
      onBulkStop={handleBulkStop}
      onBulkDelete={handleBulkDelete}
      onBulkArchive={handleBulkArchive}
      onBulkUnarchive={handleBulkUnarchive}
    />
  );

  // --- Memoized Table props ---
  const tableRowSelection = useMemo(
    () => ({
      selectedRowKeys,
      onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
      preserveSelectedRowKeys: true,
    }),
    [selectedRowKeys],
  );
  const tableOnChange = useCallback(
    (
      _p: unknown,
      filters: Record<string, FilterValue | null>,
      sorter:
        | { columnKey?: React.Key; order?: SortOrder }
        | { columnKey?: React.Key; order?: SortOrder }[],
    ) => {
      // AntD fires onChange for every table state change (sort + the
      // id/plan_id column-search filters). Return `prev` (same ref) when
      // nothing actually changed so we don't churn filteredInfo.
      setFilteredInfo((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const key of Object.keys(filters)) {
          const newVal = filters[key] ?? null;
          const prevVal = prev[key] ?? null;
          if (JSON.stringify(prevVal) !== JSON.stringify(newVal)) {
            next[key] = newVal;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      if (!Array.isArray(sorter)) {
        const k = sorter.columnKey ? String(sorter.columnKey) : undefined;
        const nextKey: SortKey = isSortKey(k) && sorter.order != null ? k : "last_run_at";
        const nextOrder: SortOrder =
          isSortKey(k) && sorter.order != null ? sorter.order : "descend";
        setSortedInfo((prev) =>
          prev.key === nextKey && prev.order === nextOrder
            ? prev
            : { key: nextKey, order: nextOrder },
        );
      }
    },
    [setFilteredInfo, setSortedInfo],
  );
  // Fixed body height drives the virtualized window (antd `virtual`
  // needs a numeric scroll.y). Track the viewport so the table fills the
  // page below the header/filter bar.
  const [tableBodyHeight, setTableBodyHeight] = useState(560);
  useEffect(() => {
    const update = () => setTableBodyHeight(Math.max(320, window.innerHeight - 320));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <>
      <PageHeader title="Tasks">
        <Button
          icon={<ClearOutlined />}
          onClick={clearFilters}
          disabled={!hasActiveFilters && quickFilter === "all"}
        >
          Clear Filters
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => taskStore.resync()}>
          Refresh
        </Button>
        <Tooltip
          title={
            includeArchived
              ? "Hide archived tasks from the list"
              : "Include soft-archived tasks in the list"
          }
        >
          <Button
            icon={<InboxOutlined />}
            onClick={() => setIncludeArchived(!includeArchived)}
            type={includeArchived ? "primary" : "default"}
          >
            {includeArchived ? "Hide archived" : "Show archived"}
          </Button>
        </Tooltip>
        <Button
          icon={<ExclamationCircleOutlined />}
          onClick={() => setTriageOpen(true)}
          disabled={filteredInvalidTaskIds.length === 0}
        >
          Triage invalid
          {filteredInvalidTaskIds.length > 0 ? ` (${filteredInvalidTaskIds.length})` : ""}
        </Button>
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          onClick={() => {
            fetchResources().then(() => setBulkModalOpen(true));
          }}
        >
          Create
        </Button>
      </PageHeader>

      <Card size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: "8px 12px" } }}>
        <Space direction="vertical" size={6} style={{ width: "100%" }}>
          <TasksFilters
            summaries={tagScopedSummaries}
            quickFilter={quickFilter}
            onChange={setQuickFilter}
          />
          <TasksFilterBar
            avs={avs}
            simulators={simulators}
            samplers={samplers}
            monitors={monitors}
            availableTags={availableTagNames}
            filteredInfo={filteredInfo}
            setFilteredInfo={setFilteredInfo}
            tagFilter={tagFilter}
            setTagFilter={setTagFilter}
            onClearAll={clearFilters}
            hasActiveFilters={hasActiveFilters}
            countsByKey={filterCounts}
          />
        </Space>
      </Card>

      {selectionBar}
      {modalCtx}

      <Table
        virtual
        scroll={{ x: 1184, y: tableBodyHeight }}
        dataSource={viewRows}
        columns={columns}
        rowKey="id"
        loading={storeState.status === "loading" && storeRows.length === 0}
        size="small"
        pagination={false}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                storeState.status === "loading"
                  ? "Loading tasks…"
                  : hasActiveFilters
                    ? "No tasks match the current filters"
                    : "No tasks yet"
              }
            />
          ),
        }}
        rowSelection={tableRowSelection}
        onChange={tableOnChange}
        footer={() => (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {viewRows.length.toLocaleString()} shown
            {viewRows.length !== baseRows.length ? ` of ${baseRows.length.toLocaleString()}` : ""}
            {storeState.status === "loading"
              ? ` · loading ${storeState.loaded.toLocaleString()}/${storeState.total.toLocaleString()}…`
              : ""}
            {storeState.status === "error" ? " · load failed" : ""}
          </Typography.Text>
        )}
      />

      <Suspense fallback={null}>
        <CreateTaskModal
          open={bulkModalOpen}
          onClose={() => setBulkModalOpen(false)}
          onCreated={() => taskStore.resync()}
          avs={avs}
          simulators={simulators}
          samplers={samplers}
          monitors={monitors}
          plans={plans}
        />

        <TriageInvalidModal
          open={triageOpen}
          onClose={() => setTriageOpen(false)}
          taskIds={filteredInvalidTaskIds}
          scopeLabel={triageScopeLabel || undefined}
          onChanged={() => taskStore.resync()}
        />

        <LogDrawer
          run={logRun}
          task={logTask}
          taskLabel={logTaskLabel}
          executor={logExecutor}
          onClose={() => setLogRun(null)}
        />
      </Suspense>
    </>
  );
}
