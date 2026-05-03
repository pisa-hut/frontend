import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Tag, Button, Modal, message, Typography, Space, Checkbox, Table, Tooltip } from "antd";
import {
  ReloadOutlined,
  ThunderboltOutlined,
  CaretRightOutlined,
  StopOutlined,
  PushpinOutlined,
  SyncOutlined,
  FileTextOutlined,
  ClearOutlined,
  InboxOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import type { FilterValue, SortOrder } from "antd/es/table/interface";
import { getColumnSearchProps } from "../components/ColumnSearch";
import ConfirmIconButton from "../components/ConfirmIconButton";
import LogDrawer from "../components/LogDrawer";
import PageHeader from "../components/PageHeader";
import TaskRunsPanel from "../components/TaskRunsPanel";
import { useLocalStorageSet, useLocalStorageState } from "../hooks/useLocalStorageState";
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
  ExecutorResponse,
} from "../api/types";
import { RUNNABLE_TASK_STATUSES } from "../api/types";
import { TASK_STATUS_TAG_COLOR } from "../constants/status";
import TasksFilters, { QUICK_FILTERS, type QuickFilter } from "../components/tasks/TasksFilters";
import TasksSelectionBar from "../components/tasks/TasksSelectionBar";
import CreateTaskModal from "../components/tasks/CreateTaskModal";

// Everything that isn't currently queued or running is re-runnable.
// Shared with LogDrawer via api/types so a Run from a historical
// attempt can't bypass the same gate the row action uses.
const RUNNABLE_STATUSES = RUNNABLE_TASK_STATUSES;
const STOPPABLE_STATUSES: TaskStatus[] = ["queued", "running"];

export default function Tasks() {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultStatusFilter = useMemo(() => {
    const s = searchParams.get("status");
    return s ? [s] : undefined;
  }, []);
  // The url ?triage=1 shortcut wins over ?status=
  const defaultQuickFilter: QuickFilter = useMemo(() => {
    if (searchParams.get("triage") === "1") return "triage";
    const s = searchParams.get("status");
    if (s && QUICK_FILTERS.some((q) => q.value === s)) return s as QuickFilter;
    return "all";
  }, []);

  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  // View state persisted per browser via localStorage so filters,
  // pinned rows, page size and the compact/archive toggles survive
  // a refresh. Selection itself stays ephemeral on purpose.
  const [pinnedIds, setPinnedIds] = useLocalStorageSet("tasks.pinned");
  const [expandedRows, setExpandedRows] = useState<React.Key[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useLocalStorageState("tasks.pageSize", 20);
  const [loading, setLoading] = useState(true);
  // Compact view collapses AV / Sim / Sampler into one Setup column.
  const [compactView, setCompactView] = useLocalStorageState("tasks.compactView", true);
  // Orthogonal include-archived toggle. The Archived chip is still
  // the way to see ONLY archived rows; this toggle is for "give me
  // everything, archived included" without leaving the current chip.
  // Defaults off so the dashboard / triage flow stays uncluttered.
  const [showArchived, setShowArchived] = useLocalStorageState("tasks.showArchived", false);
  // Three axes:
  //   1. quickFilter — chip selection. "archived" chip shows ONLY
  //      archived rows by default; every other chip's archived
  //      behaviour is governed by `showArchived` above.
  //   2. showArchived — orthogonal toggle that lets the user keep
  //      their current chip and add archived rows on top. Off by
  //      default so the dashboard / triage flow stays uncluttered.
  //   3. pinnedIds — explicit user override. Pinned rows always
  //      render regardless of chip / toggle / column filters. (See
  //      visibleMainTasks.) "Always shows only X" claims about chips
  //      / toggles are therefore approximately true; pinned can leak
  //      one or two rows of any status into any view.
  const [quickFilter, setQuickFilterRaw] = useLocalStorageState<QuickFilter>(
    "tasks.quickFilter",
    defaultQuickFilter,
  );

  // Controlled filter state so one "Clear Filters" button can reset every
  // column at once (including the URL-driven default status filter).
  const [filteredInfo, setFilteredInfo] = useLocalStorageState<Record<string, FilterValue | null>>(
    "tasks.filteredInfo",
    { task_status: defaultStatusFilter ?? null },
  );
  // Mirror the table's sort so j/k keyboard nav walks rows in the order
  // the user actually sees them. Default matches the column's
  // defaultSortOrder for "Last Run" descend so first-render is in sync.
  const [sortedInfo, setSortedInfo] = useLocalStorageState<{ key?: string; order?: SortOrder }>(
    "tasks.sortedInfo",
    { key: "last_run", order: "descend" },
  );
  const hasActiveFilters = useMemo(
    () => Object.values(filteredInfo).some((v) => v != null && v.length > 0),
    [filteredInfo],
  );
  const clearFilters = useCallback(() => {
    setFilteredInfo({});
    setQuickFilterRaw("all");
    setSearchParams({});
  }, [setFilteredInfo, setQuickFilterRaw, setSearchParams]);

  // Apply a chip click: rewrites task_status filter + URL so the view,
  // the column dropdown, and the bookmark are all coherent. Archived
  // visibility combines quickFilter ("archived" chip = archived only)
  // with the orthogonal showArchived toggle in visibleMainTasks.
  const setQuickFilter = useCallback(
    (q: QuickFilter) => {
      setQuickFilterRaw(q);
      setFilteredInfo((prev) => {
        const next = { ...prev };
        if (q === "all" || q === "archived") {
          next.task_status = null;
        } else if (q === "triage") {
          next.task_status = ["invalid"];
        } else {
          next.task_status = [q];
        }
        return next;
      });
      // URL: ?triage=1 for the triage scope, ?status=<x> for a single
      // status, ?archived=1 for the Archived chip, nothing for "all".
      if (q === "triage") setSearchParams({ triage: "1" });
      else if (q === "archived") setSearchParams({ archived: "1" });
      else if (q === "all") setSearchParams({});
      else setSearchParams({ status: q });
    },
    [setQuickFilterRaw, setFilteredInfo, setSearchParams],
  );

  // URL → state sync. The localStorage hook overrides the initial
  // useMemo on mount (because it reads its persisted value), so a
  // dashboard link like /tasks?triage=1 was getting clobbered. This
  // effect re-applies whenever the URL params change after mount.
  useEffect(() => {
    let next: QuickFilter | null = null;
    if (searchParams.get("triage") === "1") next = "triage";
    else if (searchParams.get("archived") === "1") next = "archived";
    else {
      const s = searchParams.get("status");
      if (s && QUICK_FILTERS.some((q) => q.value === s)) next = s as QuickFilter;
    }
    if (next != null && next !== quickFilter) setQuickFilter(next);
    // Intentionally only re-fire on URL changes; don't chase quickFilter
    // changes back into the effect (they're outbound from setQuickFilter).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Log drawer: owned at the page level so both the row action button and
  // the timeline in TaskRunsPanel can open it, sharing one drawer.
  const [logRun, setLogRun] = useState<TaskRunResponse | null>(null);
  const [logExecutorOverride, setLogExecutorOverride] = useState<ExecutorResponse | undefined>();
  const [executorsById, setExecutorsById] = useState<Map<number, ExecutorResponse>>(new Map());
  // Drawer takes (run, task, label) — task and label are derived from
  // current state so they refresh after SSE updates (e.g. task_status
  // flipping from invalid → archived without closing the drawer).
  // logExecutor is derived so the drawer title updates once the executor
  // cache arrives even if openLog was called before executorsById loaded.
  const logExecutor = useMemo(() => {
    if (logExecutorOverride) return logExecutorOverride;
    if (!logRun) return undefined;
    return executorsById.get(logRun.executor_id);
  }, [executorsById, logExecutorOverride, logRun]);

  const openLog = useCallback((run: TaskRunResponse, executor?: ExecutorResponse) => {
    setLogRun(run);
    setLogExecutorOverride(executor);
  }, []);

  // Increment a per-task counter on every expand so we can key the
  // TaskRunsPanel by it, forcing a real remount each time. Without this
  // AntD can preserve the panel's React instance across collapse+expand,
  // which lets stale state (e.g. a limit grown by "Show older") leak
  // into the next expand. We diff against a ref instead of nesting one
  // setState inside another's updater — that nested pattern is
  // unreliable under React 18's double-invocation.
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

  // Resource lists used by the bulk-create modal. Page owns them so a
  // refresh button (or a future SSE update) can re-populate without
  // re-mounting the modal.
  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [avs, setAvs] = useState<AvResponse[]>([]);
  const [simulators, setSimulators] = useState<SimulatorResponse[]>([]);
  const [samplers, setSamplers] = useState<SamplerResponse[]>([]);

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

  // Realtime updates: coalesce bursty inserts/updates into a single refetch
  // per frame. SSE is always on — the Refresh button stays as a manual
  // re-fetch for the rare case where the stream silently went away.
  const refetchTimer = useRef<number | null>(null);
  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current !== null) return;
    refetchTimer.current = window.setTimeout(() => {
      refetchTimer.current = null;
      api.listTasks().then(setTasks);
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
    Promise.all([api.listPlans(), api.listAvs(), api.listSimulators(), api.listSamplers()]).then(
      ([p, a, s, sa]) => {
        setPlans(p);
        setAvs(a);
        setSimulators(s);
        setSamplers(sa);
      },
    );

  useEffect(() => {
    fetchResources();
  }, []);

  // One-shot executor cache for the log drawer title (hostname).
  useEffect(() => {
    api.listExecutors().then((all) => {
      setExecutorsById(new Map(all.map((e) => [e.id, e])));
    });
  }, []);

  const planMap = useMemo(() => new Map(plans.map((p) => [p.id, p.name])), [plans]);
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

  // Single dataSource for the only Table on the page — pinned rows
  // float to the top within whatever sort the user picked. Earlier
  // versions used two separate <Table> instances and AntD sized each
  // one independently, so the pinned table's columns never aligned
  // with the main table's. One table = guaranteed alignment.
  // Rows that match the active chip + archived toggle + column filters
  // *strictly*. This is what "filtered scope" means for the selection
  // bar's "Select all N filtered" and bulk actions — pinned rows
  // outside the active filter must NOT be swept into a bulk delete.
  const filteredTasks = useMemo(() => {
    const archivedFilter = (t: TaskResponse) => {
      if (quickFilter === "archived") return t.archived;
      if (showArchived) return true;
      return !t.archived;
    };
    const colFilters = (t: TaskResponse) => {
      for (const [key, vals] of Object.entries(filteredInfo)) {
        if (!vals || vals.length === 0) continue;
        const v = (t as unknown as Record<string, unknown>)[key];
        const valueText = v == null ? "" : String(v).toLowerCase();
        const matches = vals.some((filterVal) => {
          if (filterVal === v) return true;
          if (filterVal == null) return false;
          return valueText.includes(String(filterVal).toLowerCase());
        });
        if (!matches) return false;
      }
      return true;
    };
    return tasks.filter((t) => archivedFilter(t) && colFilters(t));
  }, [tasks, quickFilter, showArchived, filteredInfo]);

  // Rows actually rendered by the table = filtered scope ∪ pinned rows.
  // Pinned rows always render regardless of chip / archived toggle /
  // column filters. The per-column `onFilter` handlers also bypass on
  // pinned (see columns below) so AntD's table layer doesn't strip
  // pinned rows back out after the data lands.
  //
  // Chip badge counts in TasksFilters stay status-based on purpose; the
  // small "rendered > chip count" divergence is accepted in exchange
  // for pinned rows being unconditionally visible.
  const visibleMainTasks = useMemo(() => {
    const pinnedExtras = tasks.filter((t) => pinnedIds.has(t.id) && !filteredTasks.includes(t));
    const merged = [...filteredTasks, ...pinnedExtras];
    const { key, order } = sortedInfo;
    const dir = !order ? 0 : order === "ascend" ? 1 : -1;
    const cmp = (a: TaskResponse, b: TaskResponse): number => {
      if (!dir || !key) return 0;
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
    return merged.sort((a, b) => {
      // Pinned always wins. Within each pinned/non-pinned group apply
      // the user's sort.
      const ap = pinnedIds.has(a.id);
      const bp = pinnedIds.has(b.id);
      if (ap !== bp) return ap ? -1 : 1;
      return cmp(a, b);
    });
  }, [tasks, filteredTasks, pinnedIds, sortedInfo]);

  const [cursorId, setCursorId] = useState<number | null>(null);
  // Bring the cursor row into view when it changes.
  useEffect(() => {
    if (cursorId == null) return;
    const node = document.querySelector(`tr[data-row-key="${cursorId}"]`);
    if (node) (node as HTMLElement).scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [cursorId]);

  // Keyboard nav. Skip when the user is typing into an input/textarea
  // or interacting with an open Modal/Popconfirm/Drawer.
  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      // Don't hijack while AntD popovers/modals are open.
      if (document.querySelector(".ant-modal-mask, .ant-popover-open")) return true;
      return false;
    };
    const onKey = (ev: KeyboardEvent) => {
      if (isTypingTarget(ev.target)) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const list = visibleMainTasks;
      if (list.length === 0) return;
      const curIdx = cursorId == null ? -1 : list.findIndex((t) => t.id === cursorId);
      switch (ev.key) {
        case "j":
        case "ArrowDown": {
          ev.preventDefault();
          const next = list[Math.min(list.length - 1, curIdx + 1)] ?? list[0];
          setCursorId(next.id);
          break;
        }
        case "k":
        case "ArrowUp": {
          ev.preventDefault();
          const next = list[Math.max(0, curIdx - 1)] ?? list[0];
          setCursorId(next.id);
          break;
        }
        case " ":
        case "Spacebar": {
          if (curIdx < 0) return;
          ev.preventDefault();
          const id = list[curIdx].id;
          const isOpen = expandedRows.includes(id);
          handleExpandedChange(
            isOpen ? expandedRows.filter((k) => k !== id) : [...expandedRows, id],
          );
          break;
        }
        case "Enter": {
          if (curIdx < 0) return;
          ev.preventDefault();
          const t = list[curIdx];
          const latest = t.task_run?.[0];
          if (latest) openLog(latest);
          break;
        }
        case "?": {
          ev.preventDefault();
          Modal.info({
            title: "Keyboard shortcuts",
            content: (
              <ul style={{ paddingLeft: 16 }}>
                <li>
                  <kbd>j</kbd> / <kbd>↓</kbd> — next row
                </li>
                <li>
                  <kbd>k</kbd> / <kbd>↑</kbd> — previous row
                </li>
                <li>
                  <kbd>Space</kbd> — expand / collapse current row
                </li>
                <li>
                  <kbd>Enter</kbd> — open log for current row's latest attempt
                </li>
                <li>
                  <kbd>?</kbd> — this cheat sheet
                </li>
              </ul>
            ),
            okText: "Close",
          });
          break;
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visibleMainTasks, cursorId, expandedRows, handleExpandedChange, openLog]);

  // --- Actions ---

  const handleRun = async (id: number) => {
    try {
      await api.updateTask(id, { task_status: "queued" });
      message.success(`Task #${id} queued`);
      load();
    } catch (e) {
      message.error(String(e));
    }
  };

  const handleStop = async (id: number) => {
    try {
      await api.stopTask(id);
      message.success(`Task #${id} stopped`);
      load();
    } catch (e) {
      message.error(String(e));
    }
  };

  // Triage action for `invalid` tasks. Archives instead of mutating
  // task_status — keeps the state machine pure and the row + history
  // intact. The default Tasks view hides archived rows; the quick-
  // filter chips, including the "Archived" chip, reveal them.
  const handleArchive = async (id: number) => {
    try {
      await api.archiveTask(id);
      message.success(`Task #${id} archived`);
      load();
    } catch (e) {
      message.error(String(e));
    }
  };
  const handleUnarchive = async (id: number) => {
    try {
      await api.unarchiveTask(id);
      message.success(`Task #${id} unarchived`);
      load();
    } catch (e) {
      message.error(String(e));
    }
  };

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

  const handleBulkArchive = async () => {
    const ids = tasks.filter((t) => selectedRowKeys.includes(t.id) && !t.archived).map((t) => t.id);
    try {
      await api.batchArchiveTasks(ids);
      message.success(`Archived ${ids.length} tasks`);
    } catch (e) {
      message.error(String(e));
    }
    setSelectedRowKeys([]);
    load();
  };

  const handleBulkUnarchive = async () => {
    const ids = tasks.filter((t) => selectedRowKeys.includes(t.id) && t.archived).map((t) => t.id);
    try {
      await api.batchUnarchiveTasks(ids);
      message.success(`Unarchived ${ids.length} tasks`);
      // Only clear selection + reload on success so a failure leaves
      // the user able to retry on the same selection (vs. silently
      // wiping the rows they were trying to act on).
      setSelectedRowKeys([]);
      load();
    } catch (e) {
      message.error(String(e));
    }
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

  // Single-task create is the N=1 case of the bulk modal — the same
  // Selects in `mode="multiple"` cover both. The form, preview state,
  // and progress state live inside CreateTaskModal.

  // --- Columns ---

  const setupColumn = {
    title: "Setup",
    key: "setup",
    width: 220,
    ellipsis: true,
    // Setup column packs AV / Sim / Sampler. The compact toggle keeps
    // the three filter dropdowns reachable via a single Popover; for
    // most rows the user just glances at "av · sim · sampler".
    render: (_: unknown, r: TaskResponse) => (
      <Typography.Text style={{ fontSize: 12 }} ellipsis>
        {avMap.get(r.av_id) ?? `#${r.av_id}`}
        <Typography.Text type="secondary"> · </Typography.Text>
        {simMap.get(r.simulator_id) ?? `#${r.simulator_id}`}
        <Typography.Text type="secondary"> · </Typography.Text>
        {samplerMap.get(r.sampler_id) ?? `#${r.sampler_id}`}
      </Typography.Text>
    ),
  };

  // Per-column onFilter wrapper: if the row is pinned, it bypasses
  // every column filter so AntD's internal filter pass doesn't strip
  // pinned rows back out of the table dataSource computed above.
  const pinnedBypass =
    <T extends TaskResponse>(real: (value: unknown, record: T) => boolean) =>
    (value: unknown, record: T): boolean =>
      pinnedIds.has(record.id) || real(value, record);

  const expandedColumns = [
    {
      title: "AV",
      dataIndex: "av_id",
      key: "av_id",
      width: 100,
      ellipsis: true,
      render: (id: number) => avMap.get(id) ?? `#${id}`,
      filters: avs.map((a) => ({ text: a.name, value: a.id })),
      filteredValue: filteredInfo.av_id ?? null,
      onFilter: pinnedBypass<TaskResponse>((value, record) => record.av_id === value),
    },
    {
      title: "Simulator",
      dataIndex: "simulator_id",
      key: "simulator_id",
      width: 100,
      ellipsis: true,
      render: (id: number) => simMap.get(id) ?? `#${id}`,
      filters: simulators.map((s) => ({ text: s.name, value: s.id })),
      filteredValue: filteredInfo.simulator_id ?? null,
      onFilter: pinnedBypass<TaskResponse>((value, record) => record.simulator_id === value),
    },
    {
      title: "Sampler",
      dataIndex: "sampler_id",
      key: "sampler_id",
      width: 80,
      ellipsis: true,
      render: (id: number) => samplerMap.get(id) ?? `#${id}`,
      filters: samplers.map((s) => ({ text: s.name, value: s.id })),
      filteredValue: filteredInfo.sampler_id ?? null,
      onFilter: pinnedBypass<TaskResponse>((value, record) => record.sampler_id === value),
    },
  ];

  // Sort is fully controlled — visibleMainTasks pre-sorts (with pinned
  // first within each sort key), so each column reports `sortOrder`
  // matching sortedInfo and sets `sorter: true` so the header clicks
  // through ordered cycles without AntD trying to re-sort the data
  // itself. Without this AntD applies the column's own comparator on
  // top of my pre-sort and the on-screen order diverged from the
  // keyboard nav order.
  const orderFor = (key: string): SortOrder | null =>
    sortedInfo.key === key ? (sortedInfo.order ?? null) : null;

  const columns = [
    {
      title: "ID",
      dataIndex: "id",
      key: "id",
      width: 60,
      ellipsis: true,
      sorter: true,
      sortOrder: orderFor("id"),
    },
    {
      title: "Plan",
      dataIndex: "plan_id",
      key: "plan_id",
      width: 250,
      ellipsis: true,
      render: (id: number) => planMap.get(id) ?? `#${id}`,
      ...getColumnSearchProps<TaskResponse>("plan_id", (r) => planMap.get(r.plan_id) ?? ""),
      filteredValue: filteredInfo.plan_id ?? null,
      onFilter: pinnedBypass<TaskResponse>((value, record) => {
        const text = planMap.get(record.plan_id) ?? "";
        return text.toLowerCase().includes(String(value).toLowerCase());
      }),
    },
    ...(compactView ? [setupColumn] : expandedColumns),
    {
      title: "Status",
      dataIndex: "task_status",
      key: "task_status",
      width: 110,
      filters: (
        ["idle", "queued", "running", "completed", "invalid", "aborted"] as TaskStatus[]
      ).map((s) => ({ text: s, value: s })),
      filteredValue: filteredInfo.task_status ?? null,
      onFilter: pinnedBypass<TaskResponse>((value, record) => record.task_status === value),
      render: (status: TaskStatus) => (
        <Tag
          color={TASK_STATUS_TAG_COLOR[status]}
          icon={status === "running" ? <SyncOutlined spin /> : undefined}
        >
          {status.toUpperCase()}
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
      width: 170,
      render: (_: unknown, r: TaskResponse) => {
        const t = r.task_run?.[0]?.started_at;
        return t ? new Date(t).toLocaleString() : "-";
      },
      sorter: true,
      sortOrder: orderFor("last_run"),
    },
    {
      title: "",
      key: "actions",
      width: 144,
      render: (_: unknown, record: TaskResponse) => {
        const canRun = RUNNABLE_STATUSES.includes(record.task_status);
        const canStop = STOPPABLE_STATUSES.includes(record.task_status);
        // Archive button is only the triage outcome for invalid tasks; if a row
        // is already archived (visible only with the toggle on), offer Unarchive.
        const canArchive = record.task_status === "invalid" && !record.archived;
        const isPinned = pinnedIds.has(record.id);
        const latestRun = record.task_run?.[0];
        // Swallow row-level clicks so any action button (log / pin / run /
        // stop / its Popconfirm popup) doesn't also trigger the row's
        // expandRowByClick handler.
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
            <Tooltip title={isPinned ? "Unpin" : "Pin"}>
              <Button
                size="small"
                type={isPinned ? "primary" : "default"}
                icon={<PushpinOutlined />}
                onClick={() => {
                  setPinnedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(record.id)) next.delete(record.id);
                    else next.add(record.id);
                    return next;
                  });
                }}
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
            {canArchive && (
              <ConfirmIconButton
                size="small"
                icon={<InboxOutlined />}
                tooltip="Not our problem — archive (hides from default view)"
                confirmTitle="Archive this invalid task?"
                onConfirm={() => handleArchive(record.id)}
              />
            )}
            {record.archived && (
              <Tooltip title="Unarchive (return to default view)">
                <Button
                  size="small"
                  icon={<UndoOutlined />}
                  onClick={() => handleUnarchive(record.id)}
                />
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];

  const selectionBar = (
    <TasksSelectionBar
      tasks={tasks}
      visibleTasks={filteredTasks}
      selectedRowKeys={selectedRowKeys}
      setSelectedRowKeys={setSelectedRowKeys}
      onBulkRun={handleBulkRun}
      onBulkStop={handleBulkStop}
      onBulkArchive={handleBulkArchive}
      onBulkUnarchive={handleBulkUnarchive}
      onBulkDelete={handleBulkDelete}
    />
  );

  return (
    <>
      <PageHeader title="Tasks">
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          onClick={() => {
            fetchResources().then(() => setBulkModalOpen(true));
          }}
        >
          Create
        </Button>
        <Button
          icon={<ClearOutlined />}
          onClick={clearFilters}
          disabled={!hasActiveFilters && quickFilter === "all"}
        >
          Clear Filters
        </Button>
        <Checkbox
          checked={compactView}
          onChange={(e) => setCompactView(e.target.checked)}
          style={{ marginLeft: 4 }}
        >
          Compact
        </Checkbox>
        <Tooltip title="Include archived rows alongside non-archived ones in the current view. (Pinned rows are always shown regardless of this toggle or the chip selection.)">
          <Checkbox
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            style={{ marginLeft: 4 }}
          >
            Show archived
          </Checkbox>
        </Tooltip>
        <Button icon={<ReloadOutlined />} onClick={load}>
          Refresh
        </Button>
      </PageHeader>

      <TasksFilters
        tasks={tasks}
        quickFilter={quickFilter}
        onChange={setQuickFilter}
        includeArchived={showArchived}
      />

      {selectionBar}

      <Table
        dataSource={visibleMainTasks}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        // Fixed column widths from the column defs — keeps row widths
        // stable across pinned/non-pinned rows, expanded rows, and
        // SSE refreshes. scroll.x matches the actual column sum so
        // there's no blank space to the right of the action column.
        // (Selection col ≈ 32 + cols total: 1024 compact / 1084
        // expanded.)
        scroll={{ x: compactView ? 1060 : 1120 }}
        tableLayout="fixed"
        pagination={{
          current: currentPage,
          pageSize,
          showSizeChanger: true,
          showTotal: (t) => `${t} tasks`,
          onChange: (p, s) => {
            setCurrentPage(p);
            setPageSize(s);
          },
        }}
        rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys) }}
        onChange={(_p, filters, sorter) => {
          setFilteredInfo(filters);
          if (!Array.isArray(sorter)) {
            setSortedInfo({
              key: sorter.columnKey ? String(sorter.columnKey) : undefined,
              order: sorter.order ?? undefined,
            });
          }
        }}
        rowClassName={(r) => {
          const cls: string[] = [];
          if (pinnedIds.has(r.id)) cls.push("tasks-row-pinned");
          if (r.id === cursorId) cls.push("tasks-row-cursor");
          return cls.join(" ");
        }}
        onRow={(r) => ({
          style: r.archived ? { opacity: 0.55 } : undefined,
          onMouseDown: () => setCursorId(r.id),
        })}
        expandable={{
          expandedRowRender: (r: TaskResponse) => (
            // Wrap the panel with a width cap so a long-error attempt
            // row can't widen the expanded TD beyond the data columns.
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
          onExpandedRowsChange: (keys) => handleExpandedChange(keys as React.Key[]),
        }}
      />

      <CreateTaskModal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        onCreated={load}
        avs={avs}
        simulators={simulators}
        samplers={samplers}
        plans={plans}
      />

      <LogDrawer
        run={logRun}
        task={logTask}
        taskLabel={logTaskLabel}
        executor={logExecutor}
        onClose={() => setLogRun(null)}
      />

      <style>{`
        .tasks-row-cursor > td {
          background: var(--ant-color-primary-bg, #e6f4ff) !important;
          box-shadow: inset 2px 0 0 var(--ant-color-primary, #1677ff);
        }
        .tasks-row-pinned > td {
          background: var(--ant-color-warning-bg, #fffbe6);
        }
        /* Mark the boundary between pinned and non-pinned rows so users
           see "stuff above the line is sticky-of-interest" without
           needing two separate tables. */
        .tasks-row-pinned + tr:not(.tasks-row-pinned):not(.ant-table-expanded-row) > td {
          border-top: 2px solid var(--ant-color-warning-border, #ffe58f);
        }
      `}</style>
    </>
  );
}
