import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tag, Button, Card, message, Typography, Space, Table, Tooltip } from "antd";
import {
  ReloadOutlined,
  ThunderboltOutlined,
  CaretRightOutlined,
  StopOutlined,
  SyncOutlined,
  FileTextOutlined,
  ClearOutlined,
} from "@ant-design/icons";
import type { FilterValue, SortOrder } from "antd/es/table/interface";
import { getColumnSearchProps } from "../components/ColumnSearch";
import ConfirmIconButton from "../components/ConfirmIconButton";
import LogDrawer from "../components/LogDrawer";
import PageHeader from "../components/PageHeader";
import TaskRunsPanel from "../components/TaskRunsPanel";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { api } from "../api/client";
import { usePisaEvents } from "../api/events";
import type {
  TaskResponse,
  TaskStatus,
  TaskRunResponse,
  TaskSummary,
  TasksPageQuery,
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
import CreateTaskModal from "../components/tasks/CreateTaskModal";

const RUNNABLE_STATUSES = RUNNABLE_TASK_STATUSES;
const STOPPABLE_STATUSES: TaskStatus[] = ["queued", "running"];

type SortKey = TasksPageQuery["sort"]["key"];
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

  // Server-paginated rows for the Table; full-row TaskResponse with task_run.
  const [pageRows, setPageRows] = useState<TaskResponse[]>([]);
  const [pageTotal, setPageTotal] = useState(0);
  // Loading overlay only shows on the very first fetch. Subsequent
  // refetches keep the previous page visible until the new one
  // arrives — flips of the spinner overlay on every SSE event were
  // their own forced-reflow source.
  const [initialLoad, setInitialLoad] = useState(true);
  // Lightweight all-rows summary for chip counts and "select-all-filtered".
  const [summaries, setSummaries] = useState<TaskSummary[]>([]);

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [expandedRows, setExpandedRows] = useState<React.Key[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useLocalStorageState("tasks.pageSize", 20);
  const [quickFilter, setQuickFilterRaw] = useLocalStorageState<QuickFilter>(
    "tasks.quickFilter",
    defaultQuickFilter,
  );

  // One-shot localStorage cleanup of orphaned keys for removed features.
  useEffect(() => {
    for (const k of ["tasks.pinned", "tasks.compactView", "tasks.showArchived"]) {
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
  const [tagFilter, setTagFilterRaw] = useLocalStorageState<string[]>(
    "tasks.tagFilter",
    defaultTagFilter,
  );

  const [filteredInfo, setFilteredInfo] = useLocalStorageState<Record<string, FilterValue | null>>(
    "tasks.filteredInfo",
    { task_status: defaultStatusFilter ?? null },
  );
  // Sort is restricted to server-sortable columns (id, attempt_count,
  // last_run_at). The latter is the denormalised column added in
  // manager m20260516 — kept fresh by a trigger on task_run.
  const [sortedInfo, setSortedInfo] = useLocalStorageState<{ key?: SortKey; order?: SortOrder }>(
    "tasks.sortedInfo",
    { key: "last_run_at", order: "descend" },
  );
  const hasActiveFilters = useMemo(
    () =>
      tagFilter.length > 0 || Object.values(filteredInfo).some((v) => v != null && v.length > 0),
    [filteredInfo, tagFilter],
  );

  // Defer chip-input state for any expensive client work that still
  // reads from filteredInfo/tagFilter (the column dropdown highlights
  // and sortable column header). The query that drives the server
  // fetch reads the LIVE state so no extra paint happens between the
  // chip flip and the new page rendering.
  const deferredFilteredInfo = useDeferredValue(filteredInfo);

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredInfo, tagFilter, quickFilter]);

  const clearFilters = useCallback(() => {
    setFilteredInfo({});
    setQuickFilterRaw("all");
    setTagFilterRaw([]);
    setSearchParams({});
  }, [setFilteredInfo, setQuickFilterRaw, setTagFilterRaw, setSearchParams]);

  const setTagFilter = useCallback(
    (next: string[]) => {
      setTagFilterRaw(next);
      setSearchParams((prev) => {
        const out = new URLSearchParams(prev);
        out.delete("tag");
        if (next.length > 0) out.set("tag", next.join(","));
        return out;
      });
    },
    [setTagFilterRaw, setSearchParams],
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

  const prevExpandedRef = useRef<Set<number>>(new Set());
  const [expansionCounts, setExpansionCounts] = useState<Map<number, number>>(new Map());
  const handleExpandedChange = useCallback((keys: React.Key[]) => {
    const next = new Set(keys.map(Number));
    const added: number[] = [];
    for (const k of next) {
      if (!prevExpandedRef.current.has(k)) added.push(k);
    }
    prevExpandedRef.current = next;
    if (added.length > 0) {
      setExpansionCounts((counts) => {
        const out = new Map(counts);
        for (const k of added) out.set(k, (out.get(k) ?? 0) + 1);
        return out;
      });
    }
    setExpandedRows(keys);
  }, []);

  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [avs, setAvs] = useState<AvResponse[]>([]);
  const [simulators, setSimulators] = useState<SimulatorResponse[]>([]);
  const [samplers, setSamplers] = useState<SamplerResponse[]>([]);
  const [monitors, setMonitors] = useState<MonitorResponse[]>([]);

  // --- Build the server-side query from chip + sort + page state. ---

  const query: TasksPageQuery = useMemo(() => {
    const status = (filteredInfo.task_status as string[] | undefined)?.filter(Boolean) as
      | TaskStatus[]
      | undefined;
    const avIds = (filteredInfo.av_id as (number | string)[] | undefined)?.map(Number);
    const simIds = (filteredInfo.simulator_id as (number | string)[] | undefined)?.map(Number);
    const samplerIds = (filteredInfo.sampler_id as (number | string)[] | undefined)?.map(Number);
    const monitorIds = (filteredInfo.monitor_id as (number | string)[] | undefined)?.map(Number);
    let ids: number[] | undefined;
    const idVals = filteredInfo.id as (string | number)[] | undefined;
    if (idVals?.length) {
      const set = new Set<number>();
      for (const v of idVals) for (const n of parseIdSet(v)) set.add(n);
      ids = [...set];
    }
    const planSearch = (filteredInfo.plan_id as string[] | undefined)?.[0]?.toString() || undefined;
    const sortKey: SortKey = isSortKey(sortedInfo.key) ? sortedInfo.key : "id";
    const sortOrder = sortedInfo.order === "ascend" ? "asc" : "desc";
    return {
      page: currentPage,
      pageSize,
      sort: { key: sortKey, order: sortOrder },
      status,
      avIds,
      simIds,
      samplerIds,
      monitorIds,
      tags: tagFilter.length > 0 ? tagFilter : undefined,
      ids,
      planSearch,
    };
  }, [filteredInfo, sortedInfo, currentPage, pageSize, tagFilter]);

  // --- Data loading ---

  const summariesPromiseRef = useRef<Promise<unknown> | null>(null);
  const loadSummaries = useCallback(() => {
    if (summariesPromiseRef.current) return summariesPromiseRef.current;
    const p = api
      .listTaskSummaries()
      .then((rows) => setSummaries(rows))
      .finally(() => {
        summariesPromiseRef.current = null;
      });
    summariesPromiseRef.current = p;
    return p;
  }, []);

  // Fetch the current page whenever the query changes. AbortController
  // cancels in-flight fetches when the user clicks chips quickly so a
  // stale slow response can't overwrite the latest.
  const pageAbortRef = useRef<AbortController | null>(null);
  const loadPage = useCallback(async () => {
    pageAbortRef.current?.abort();
    const ctl = new AbortController();
    pageAbortRef.current = ctl;
    try {
      const { rows, total } = await api.listTasksPage({ ...query, signal: ctl.signal });
      setPageRows(rows);
      setPageTotal(total);
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return;
      message.error(String(e));
    } finally {
      if (pageAbortRef.current === ctl) {
        setInitialLoad(false);
      }
    }
  }, [query]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);
  useEffect(() => {
    loadSummaries();
  }, [loadSummaries]);

  // SSE-driven refetch is split across two cadences:
  //   - page refetch every 750ms — keeps Last Run / Status / Attempts
  //     for the 20 visible rows current enough to feel "live".
  //   - summaries refetch every 5s — chip count badges drift slowly
  //     so a few seconds of staleness isn't user-visible.
  // 250ms (the previous value) under heavy task_run SSE pressure was
  // firing 4 refetches/sec, each re-rendering the Table.
  const pageRefetchTimer = useRef<number | null>(null);
  const summariesRefetchTimer = useRef<number | null>(null);
  const scheduleRefetch = useCallback(() => {
    if (pageRefetchTimer.current === null) {
      pageRefetchTimer.current = window.setTimeout(() => {
        pageRefetchTimer.current = null;
        loadPage();
      }, 750);
    }
    if (summariesRefetchTimer.current === null) {
      summariesRefetchTimer.current = window.setTimeout(() => {
        summariesRefetchTimer.current = null;
        loadSummaries();
      }, 5000);
    }
  }, [loadPage, loadSummaries]);
  usePisaEvents(
    useCallback(
      (ev) => {
        if (ev.kind !== "row") return;
        if (ev.row.table === "task" || ev.row.table === "task_run") scheduleRefetch();
      },
      [scheduleRefetch],
    ),
  );
  useEffect(() => {
    return () => {
      if (pageRefetchTimer.current !== null) {
        window.clearTimeout(pageRefetchTimer.current);
        pageRefetchTimer.current = null;
      }
      if (summariesRefetchTimer.current !== null) {
        window.clearTimeout(summariesRefetchTimer.current);
        summariesRefetchTimer.current = null;
      }
      pageAbortRef.current?.abort();
    };
  }, []);

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
  // Per-axis chip counts from the lightweight summary in one pass.
  const filterCounts = useMemo(() => {
    const av = new Map<number, number>();
    const sim = new Map<number, number>();
    const sampler = new Map<number, number>();
    const monitor = new Map<number, number>();
    const tag = new Map<string, number>();
    for (const t of summaries) {
      av.set(t.av_id, (av.get(t.av_id) ?? 0) + 1);
      sim.set(t.simulator_id, (sim.get(t.simulator_id) ?? 0) + 1);
      sampler.set(t.sampler_id, (sampler.get(t.sampler_id) ?? 0) + 1);
      if (t.monitor_id != null) monitor.set(t.monitor_id, (monitor.get(t.monitor_id) ?? 0) + 1);
      const tags = planTagsMap.get(t.plan_id) ?? [];
      for (const tn of tags) tag.set(tn, (tag.get(tn) ?? 0) + 1);
    }
    return { av_id: av, simulator_id: sim, sampler_id: sampler, monitor_id: monitor, tag };
  }, [summaries, planTagsMap]);
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

  const logTask = useMemo(
    () => (logRun ? pageRows.find((t) => t.id === logRun.task_id) : undefined),
    [logRun, pageRows],
  );
  const logTaskLabel = useMemo(
    () => (logTask ? planMap.get(logTask.plan_id) : undefined),
    [logTask, planMap],
  );

  // For the selection bar's runnable/stoppable counts and "select all
  // filtered" computation, we need a status lookup that spans pages.
  // Summaries cover every task; build a quick id→status map.
  const statusById = useMemo(() => {
    const m = new Map<number, TaskStatus>();
    for (const s of summaries) m.set(s.id, s.task_status);
    return m;
  }, [summaries]);

  // IDs that match the current chip filter set, derived from
  // summaries (so it's the FULL filtered set, not just current page).
  const filteredSummaryIds = useMemo(() => {
    const idSet = query.ids ? new Set(query.ids) : null;
    const tagSet = query.tags ? new Set(query.tags) : null;
    const out: number[] = [];
    for (const t of summaries) {
      if (query.status && !query.status.includes(t.task_status)) continue;
      if (query.avIds && !query.avIds.includes(t.av_id)) continue;
      if (query.simIds && !query.simIds.includes(t.simulator_id)) continue;
      if (query.samplerIds && !query.samplerIds.includes(t.sampler_id)) continue;
      if (query.monitorIds && !query.monitorIds.includes(t.monitor_id)) continue;
      if (idSet && !idSet.has(t.id)) continue;
      if (tagSet) {
        const tags = planTagsMap.get(t.plan_id) ?? [];
        if (!tags.some((x) => tagSet.has(x))) continue;
      }
      if (query.planSearch) {
        const name = (planMap.get(t.plan_id) ?? "").toLowerCase();
        if (!name.includes(query.planSearch.toLowerCase())) continue;
      }
      out.push(t.id);
    }
    return out;
  }, [summaries, query, planTagsMap, planMap]);

  // --- Actions ---

  const handleRun = useCallback(
    async (id: number) => {
      try {
        await api.updateTask(id, { task_status: "queued" });
        message.success(`Task #${id} queued`);
        loadPage();
        loadSummaries();
      } catch (e) {
        message.error(String(e));
      }
    },
    [loadPage, loadSummaries],
  );

  const handleStop = useCallback(
    async (id: number) => {
      try {
        await api.stopTask(id);
        message.success(`Task #${id} stopped`);
        loadPage();
        loadSummaries();
      } catch (e) {
        message.error(String(e));
      }
    },
    [loadPage, loadSummaries],
  );

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
    loadPage();
    loadSummaries();
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
    loadPage();
    loadSummaries();
  };

  const handleBulkDelete = async () => {
    try {
      await api.batchDeleteTasks(selectedRowKeys as number[]);
      message.success(`Deleted ${selectedRowKeys.length} tasks`);
    } catch (e) {
      message.error(String(e));
    }
    setSelectedRowKeys([]);
    loadPage();
    loadSummaries();
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
        width: 60,
        ellipsis: true,
        sorter: true,
        sortOrder: orderFor("id"),
        ...getColumnSearchProps<TaskResponse>("id"),
        filteredValue: deferredFilteredInfo.id ?? null,
      },
      {
        title: "Plan",
        dataIndex: "plan_id",
        key: "plan_id",
        width: 250,
        ellipsis: true,
        render: (id: number) => planMap.get(id) ?? `#${id}`,
        ...getColumnSearchProps<TaskResponse>("plan_id", (r) => planMap.get(r.plan_id) ?? ""),
        filteredValue: deferredFilteredInfo.plan_id ?? null,
      },
      {
        title: "Setup",
        key: "setup",
        width: 220,
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
        width: 110,
        render: (status: TaskStatus) => (
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
            style={{ fontWeight: 500 }}
          >
            {TASK_STATUS_LABEL[status]}
          </Tag>
        ),
      },
      {
        title: "Attempts",
        dataIndex: "attempt_count",
        key: "attempt_count",
        width: 70,
        sorter: true,
        sortOrder: orderFor("attempt_count"),
      },
      {
        title: "Last Run",
        key: "last_run_at",
        dataIndex: "last_run_at",
        width: 130,
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
            <Tooltip title={`${d.toISOString()} · ${rel}`}>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{shortLabel}</span>
            </Tooltip>
          );
        },
      },
      {
        title: "",
        key: "actions",
        width: 90,
        render: (_: unknown, record: TaskResponse) => {
          const canRun = RUNNABLE_STATUSES.includes(record.task_status);
          const canStop = STOPPABLE_STATUSES.includes(record.task_status);
          const latestRun = record.task_run?.[0];
          return (
            <Space size={2} onClick={(e) => e.stopPropagation()}>
              <Tooltip title={latestRun ? `Log · attempt #${latestRun.attempt}` : "No run yet"}>
                <Button
                  size="small"
                  icon={<FileTextOutlined />}
                  disabled={!latestRun}
                  onClick={() => latestRun && openLog(latestRun)}
                />
              </Tooltip>
              {canStop ? (
                <ConfirmIconButton
                  size="small"
                  icon={<StopOutlined />}
                  tooltip="Stop"
                  confirmTitle="Stop?"
                  onConfirm={() => handleStop(record.id)}
                />
              ) : (
                <ConfirmIconButton
                  size="small"
                  type="primary"
                  icon={<CaretRightOutlined />}
                  disabled={!canRun}
                  tooltip={canRun ? "Run" : "Not runnable in this state"}
                  confirmTitle="Run?"
                  onConfirm={() => handleRun(record.id)}
                />
              )}
            </Space>
          );
        },
      },
    ];
  }, [
    deferredFilteredInfo,
    sortedInfo,
    avMap,
    simMap,
    samplerMap,
    planMap,
    openLog,
    handleRun,
    handleStop,
  ]);

  const selectionBar = (
    <TasksSelectionBar
      statusById={statusById}
      visibleIds={filteredSummaryIds}
      selectedRowKeys={selectedRowKeys}
      setSelectedRowKeys={setSelectedRowKeys}
      onBulkRun={handleBulkRun}
      onBulkStop={handleBulkStop}
      onBulkDelete={handleBulkDelete}
    />
  );

  // --- Memoized Table props ---
  // No tableScroll — `scroll={{x:N}}` + tableLayout=fixed forces AntD
  // to mount a hidden shadow table for column-width measurement on
  // every render (each measure cost ~77ms forced reflow). With
  // pagination the visible row count is tiny and the page is wide
  // enough for the columns to fit without horizontal scroll.
  const tablePagination = useMemo(
    () => ({
      current: currentPage,
      pageSize,
      total: pageTotal,
      showSizeChanger: true,
      showTotal: (t: number) => `${t} tasks`,
      onChange: (p: number, s: number) => {
        setCurrentPage(p);
        setPageSize(s);
      },
    }),
    [currentPage, pageSize, pageTotal, setPageSize],
  );
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
      setFilteredInfo((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(filters)) next[key] = filters[key] ?? null;
        return next;
      });
      if (!Array.isArray(sorter)) {
        const k = sorter.columnKey ? String(sorter.columnKey) : undefined;
        if (isSortKey(k) && sorter.order != null) {
          setSortedInfo({ key: k, order: sorter.order });
        } else {
          // user cleared the sort — fall back to the default rather
          // than letting AntD send us undefined (which would mean "no
          // order=" on the next query).
          setSortedInfo({ key: "last_run_at", order: "descend" });
        }
      }
    },
    [setFilteredInfo, setSortedInfo],
  );
  const tableExpandable = useMemo(
    () => ({
      expandedRowRender: (r: TaskResponse) => (
        <div style={{ width: "100%", maxWidth: "100%", minWidth: 0, overflow: "hidden" }}>
          <TaskRunsPanel
            key={`${r.id}-${expansionCounts.get(r.id) ?? 0}`}
            taskId={r.id}
            onOpenLog={openLog}
          />
        </div>
      ),
      expandedRowKeys: expandedRows,
      showExpandColumn: false,
      expandRowByClick: true,
      onExpandedRowsChange: (keys: readonly React.Key[]) =>
        handleExpandedChange(keys as React.Key[]),
    }),
    [expandedRows, expansionCounts, openLog, handleExpandedChange],
  );

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
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            loadPage();
            loadSummaries();
          }}
        >
          Refresh
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
          <TasksFilters summaries={summaries} quickFilter={quickFilter} onChange={setQuickFilter} />
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

      <Table
        dataSource={pageRows}
        columns={columns}
        rowKey="id"
        loading={initialLoad}
        size="small"
        pagination={tablePagination}
        rowSelection={tableRowSelection}
        onChange={tableOnChange}
        expandable={tableExpandable}
      />

      <CreateTaskModal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        onCreated={() => {
          loadPage();
          loadSummaries();
        }}
        avs={avs}
        simulators={simulators}
        samplers={samplers}
        monitors={monitors}
        plans={plans}
      />

      <LogDrawer
        run={logRun}
        task={logTask}
        taskLabel={logTaskLabel}
        executor={logExecutor}
        onClose={() => setLogRun(null)}
      />
    </>
  );
}
