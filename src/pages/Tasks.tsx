import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

// Field-level equality for the listTasks payload. The previous
// JSON.stringify implementation blew up to ~500ms blocking 'message'
// handlers under SSE pressure on multi-thousand-row tables. Comparing
// only the fields the UI actually reads keeps the check at a few ms.
function sameTaskList(a: TaskResponse[], b: TaskResponse[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.task_status !== y.task_status ||
      x.attempt_count !== y.attempt_count ||
      x.plan_id !== y.plan_id ||
      x.av_id !== y.av_id ||
      x.simulator_id !== y.simulator_id ||
      x.sampler_id !== y.sampler_id ||
      x.monitor_id !== y.monitor_id
    ) {
      return false;
    }
    const xr = x.task_run?.[0];
    const yr = y.task_run?.[0];
    if (xr === yr) continue;
    if (!xr || !yr) return false;
    if (
      xr.id !== yr.id ||
      xr.attempt !== yr.attempt ||
      xr.task_run_status !== yr.task_run_status ||
      xr.started_at !== yr.started_at ||
      xr.executor_id !== yr.executor_id
    ) {
      return false;
    }
  }
  return true;
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

  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [expandedRows, setExpandedRows] = useState<React.Key[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useLocalStorageState("tasks.pageSize", 20);
  // One-shot cleanup of localStorage keys for removed features so old
  // sessions don't leave orphaned data sitting around the browser.
  useEffect(() => {
    for (const k of [
      "tasks.pinned",
      "tasks.compactView",
      "tasks.showArchived",
    ]) {
      try {
        localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
    }
  }, []);
  const [loading, setLoading] = useState(true);
  const [quickFilter, setQuickFilterRaw] = useLocalStorageState<QuickFilter>(
    "tasks.quickFilter",
    defaultQuickFilter,
  );

  // Plan-tag filter — comma-separated ?tag= URL param hydrates from
  // dashboard donut deep-links.
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
  const [sortedInfo, setSortedInfo] = useLocalStorageState<{ key?: string; order?: SortOrder }>(
    "tasks.sortedInfo",
    { key: "last_run", order: "descend" },
  );
  const hasActiveFilters = useMemo(
    () =>
      tagFilter.length > 0 || Object.values(filteredInfo).some((v) => v != null && v.length > 0),
    [filteredInfo, tagFilter],
  );

  // Defer the heavy-consumer view of the filter state. Chip components
  // keep reading the live values so their checked state flips
  // instantly; the filteredTasks / filterCounts memos and the Table
  // read these deferred copies, letting React schedule heavy table
  // re-renders at lower priority.
  const deferredFilteredInfo = useDeferredValue(filteredInfo);
  const deferredTagFilter = useDeferredValue(tagFilter);

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

  // URL → state sync (chip + tag from URL after mount).
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

  // Force TaskRunsPanel remount on each expand so stale pagination
  // state doesn't leak into the next expand.
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

  // --- Data loading ---

  const load = () => {
    setLoading(true);
    api
      .listTasks()
      .then(setTasks)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const refetchTimer = useRef<number | null>(null);
  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current !== null) return;
    refetchTimer.current = window.setTimeout(() => {
      refetchTimer.current = null;
      api.listTasks().then((next) => {
        setTasks((prev) => (sameTaskList(prev, next) ? prev : next));
      });
    }, 250);
  }, []);
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
      if (refetchTimer.current !== null) {
        window.clearTimeout(refetchTimer.current);
        refetchTimer.current = null;
      }
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
  // Per-axis chip counts, computed in one pass.
  const filterCounts = useMemo(() => {
    const av = new Map<number, number>();
    const sim = new Map<number, number>();
    const sampler = new Map<number, number>();
    const monitor = new Map<number, number>();
    const tag = new Map<string, number>();
    for (const t of tasks) {
      av.set(t.av_id, (av.get(t.av_id) ?? 0) + 1);
      sim.set(t.simulator_id, (sim.get(t.simulator_id) ?? 0) + 1);
      sampler.set(t.sampler_id, (sampler.get(t.sampler_id) ?? 0) + 1);
      if (t.monitor_id != null) monitor.set(t.monitor_id, (monitor.get(t.monitor_id) ?? 0) + 1);
      const tags = planTagsMap.get(t.plan_id) ?? [];
      for (const tn of tags) tag.set(tn, (tag.get(tn) ?? 0) + 1);
    }
    return { av_id: av, simulator_id: sim, sampler_id: sampler, monitor_id: monitor, tag };
  }, [tasks, planTagsMap]);
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
    () => (logRun ? tasks.find((t) => t.id === logRun.task_id) : undefined),
    [logRun, tasks],
  );
  const logTaskLabel = useMemo(
    () => (logTask ? planMap.get(logTask.plan_id) : undefined),
    [logTask, planMap],
  );

  const filteredTasks = useMemo(() => {
    const colFilters = (t: TaskResponse) => {
      for (const [key, vals] of Object.entries(deferredFilteredInfo)) {
        if (!vals || vals.length === 0) continue;
        switch (key) {
          case "id": {
            const ids = new Set<number>();
            for (const tok of vals.flatMap((v) => String(v).split(","))) {
              const n = parseInt(tok.trim(), 10);
              if (Number.isFinite(n)) ids.add(n);
            }
            if (!ids.has(t.id)) return false;
            break;
          }
          case "plan_id": {
            const text = (planMap.get(t.plan_id) ?? "").toLowerCase();
            if (!vals.some((v) => text.includes(String(v).toLowerCase()))) return false;
            break;
          }
          case "av_id":
            if (!vals.includes(t.av_id)) return false;
            break;
          case "simulator_id":
            if (!vals.includes(t.simulator_id)) return false;
            break;
          case "sampler_id":
            if (!vals.includes(t.sampler_id)) return false;
            break;
          case "monitor_id":
            if (t.monitor_id == null || !vals.includes(t.monitor_id)) return false;
            break;
          case "task_status":
            if (!vals.includes(t.task_status)) return false;
            break;
          default:
            break;
        }
      }
      return true;
    };
    const tagSet = new Set(deferredTagFilter);
    const tagFilterFn = (t: TaskResponse) => {
      if (tagSet.size === 0) return true;
      const tags = planTagsMap.get(t.plan_id) ?? [];
      for (const tag of tags) if (tagSet.has(tag)) return true;
      return false;
    };
    return tasks.filter((t) => colFilters(t) && tagFilterFn(t));
  }, [tasks, deferredFilteredInfo, deferredTagFilter, planTagsMap, planMap]);

  // Apply user sort over the filtered set.
  const visibleMainTasks = useMemo(() => {
    const { key, order } = sortedInfo;
    const dir = !order ? 0 : order === "ascend" ? 1 : -1;
    if (!dir || !key) return filteredTasks;
    const cmp = (a: TaskResponse, b: TaskResponse): number => {
      switch (key) {
        case "id":
          return (a.id - b.id) * dir;
        case "attempt_count":
          return (a.attempt_count - b.attempt_count) * dir;
        case "last_run": {
          const ta = a.task_run?.[0]?.started_at ? new Date(a.task_run[0].started_at).getTime() : 0;
          const tb = b.task_run?.[0]?.started_at ? new Date(b.task_run[0].started_at).getTime() : 0;
          return (ta - tb) * dir;
        }
        default:
          return 0;
      }
    };
    return [...filteredTasks].sort(cmp);
  }, [filteredTasks, sortedInfo]);

  // --- Actions ---

  const handleRun = useCallback(async (id: number) => {
    try {
      await api.updateTask(id, { task_status: "queued" });
      message.success(`Task #${id} queued`);
      load();
    } catch (e) {
      message.error(String(e));
    }
  }, []);

  const handleStop = useCallback(async (id: number) => {
    try {
      await api.stopTask(id);
      message.success(`Task #${id} stopped`);
      load();
    } catch (e) {
      message.error(String(e));
    }
  }, []);

  const handleBulkRun = async () => {
    const ids = tasks
      .filter((t) => selectedRowKeys.includes(t.id) && RUNNABLE_STATUSES.includes(t.task_status))
      .map((t) => t.id);
    try {
      await api.batchRunTasks(ids);
      message.success(`Queued ${ids.length} tasks`);
    } catch (e) {
      message.error(String(e));
    }
    setSelectedRowKeys([]);
    load();
  };

  const handleBulkStop = async () => {
    const ids = tasks
      .filter((t) => selectedRowKeys.includes(t.id) && STOPPABLE_STATUSES.includes(t.task_status))
      .map((t) => t.id);
    try {
      await api.batchStopTasks(ids);
      message.success(`Stopped ${ids.length} tasks`);
    } catch (e) {
      message.error(String(e));
    }
    setSelectedRowKeys([]);
    load();
  };

  const handleBulkDelete = async () => {
    try {
      await api.batchDeleteTasks(selectedRowKeys as number[]);
      message.success(`Deleted ${selectedRowKeys.length} tasks`);
    } catch (e) {
      message.error(String(e));
    }
    setSelectedRowKeys([]);
    load();
  };

  // --- Columns ---

  const columns = useMemo(() => {
    const orderFor = (key: string): SortOrder | null =>
      sortedInfo.key === key ? (sortedInfo.order ?? null) : null;

    const parseIdSet = (value: unknown): Set<number> => {
      const out = new Set<number>();
      for (const tok of String(value ?? "").split(",")) {
        const n = parseInt(tok.trim(), 10);
        if (Number.isFinite(n)) out.add(n);
      }
      return out;
    };

    return [
      {
        title: "ID",
        dataIndex: "id",
        key: "id",
        width: 60,
        ellipsis: true,
        ...getColumnSearchProps<TaskResponse>("id"),
        filteredValue: deferredFilteredInfo.id ?? null,
        onFilter: (value: unknown, record: TaskResponse) => {
          const ids = parseIdSet(value);
          return ids.has(record.id);
        },
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
        onFilter: (value: unknown, record: TaskResponse) => {
          const text = planMap.get(record.plan_id) ?? "";
          return text.toLowerCase().includes(String(value).toLowerCase());
        },
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
        key: "last_run",
        width: 130,
        render: (_: unknown, r: TaskResponse) => {
          const t = r.task_run?.[0]?.started_at;
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
        sorter: true,
        sortOrder: orderFor("last_run"),
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
      tasks={tasks}
      visibleTasks={filteredTasks}
      selectedRowKeys={selectedRowKeys}
      setSelectedRowKeys={setSelectedRowKeys}
      onBulkRun={handleBulkRun}
      onBulkStop={handleBulkStop}
      onBulkDelete={handleBulkDelete}
    />
  );

  // --- Memoized Table props (stable refs so AntD skips row re-render
  //     when nothing relevant changed). ---
  const tableScroll = useMemo(() => ({ x: 1000 }), []);
  const tablePagination = useMemo(
    () => ({
      current: currentPage,
      pageSize,
      showSizeChanger: true,
      showTotal: (t: number) => `${t} tasks`,
      onChange: (p: number, s: number) => {
        setCurrentPage(p);
        setPageSize(s);
      },
    }),
    [currentPage, pageSize, setPageSize],
  );
  const tableRowSelection = useMemo(
    () => ({
      selectedRowKeys,
      onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
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
        setSortedInfo({
          key: sorter.columnKey ? String(sorter.columnKey) : undefined,
          order: sorter.order ?? undefined,
        });
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
        <Button icon={<ReloadOutlined />} onClick={load}>
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
          <TasksFilters tasks={tasks} quickFilter={quickFilter} onChange={setQuickFilter} />
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
        dataSource={visibleMainTasks}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={tableScroll}
        tableLayout="fixed"
        pagination={tablePagination}
        rowSelection={tableRowSelection}
        onChange={tableOnChange}
        expandable={tableExpandable}
      />

      <CreateTaskModal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        onCreated={load}
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
