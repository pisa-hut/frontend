import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Tag, Button, Modal, Form, Select, message, Typography, Space,
  Progress, Alert, Statistic, Card, Row, Col, Input, Checkbox, Table, Popconfirm, Tooltip,
  Affix, Badge,
} from "antd";
import {
  ReloadOutlined, ThunderboltOutlined,
  CaretRightOutlined, DeleteOutlined, StopOutlined, PushpinOutlined, SyncOutlined,
  FileTextOutlined, ClearOutlined, InboxOutlined, UndoOutlined,
} from "@ant-design/icons";
import type { FilterValue } from "antd/es/table/interface";
import { getColumnSearchProps } from "../components/ColumnSearch";
import ConfirmIconButton from "../components/ConfirmIconButton";
import LogDrawer from "../components/LogDrawer";
import PageHeader from "../components/PageHeader";
import TaskRunsPanel from "../components/TaskRunsPanel";
import { useLocalStorageSet, useLocalStorageState } from "../hooks/useLocalStorageState";
import { api } from "../api/client";
import { usePisaEvents } from "../api/events";
import type {
  TaskResponse, TaskStatus, TaskRunResponse, PlanResponse,
  AvResponse, SimulatorResponse, SamplerResponse, ExecutorResponse,
} from "../api/types";
import { RUNNABLE_TASK_STATUSES } from "../api/types";

const statusColors: Record<TaskStatus, string> = {
  idle: "default",
  queued: "warning",
  running: "processing",
  completed: "success",
  invalid: "error",
  aborted: "default",
};

// Everything that isn't currently queued or running is re-runnable.
// Shared with LogDrawer via api/types so a Run from a historical
// attempt can't bypass the same gate the row action uses.
const RUNNABLE_STATUSES = RUNNABLE_TASK_STATUSES;
const STOPPABLE_STATUSES: TaskStatus[] = ["queued", "running"];

// Quick-filter chips. `triage` is a virtual scope: invalid + !archived.
// Anything else either picks a single task_status or "all" (no filter).
type QuickFilter = "all" | "triage" | "archived" | TaskStatus;
const QUICK_FILTERS: { value: QuickFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "triage", label: "Triage" },
  { value: "running", label: "Running" },
  { value: "queued", label: "Queued" },
  { value: "completed", label: "Completed" },
  { value: "invalid", label: "Invalid" },
  { value: "aborted", label: "Aborted" },
  { value: "archived", label: "Archived" },
];

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
  // Triaged-away tasks are hidden unless the user opts in via either the
  // showArchived toggle (legacy single-axis control) or the Archived
  // chip below. Both write the same flag so they stay coherent.
  const [showArchived, setShowArchived] = useLocalStorageState("tasks.showArchived", false);
  // Compact view collapses AV / Sim / Sampler into one Setup column.
  const [compactView, setCompactView] = useLocalStorageState("tasks.compactView", true);
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
  const hasActiveFilters = useMemo(
    () => Object.values(filteredInfo).some((v) => v != null && v.length > 0),
    [filteredInfo],
  );
  const clearFilters = useCallback(() => {
    setFilteredInfo({});
    setQuickFilterRaw("all");
    setSearchParams({});
  }, [setFilteredInfo, setQuickFilterRaw, setSearchParams]);

  // Apply a chip click: rewrites task_status filter + showArchived flag
  // + URL so the view, the column dropdown, and the bookmark are all
  // coherent. Other column filters (AV, plan, etc.) are preserved.
  const setQuickFilter = useCallback((q: QuickFilter) => {
    setQuickFilterRaw(q);
    setFilteredInfo((prev) => {
      const next = { ...prev };
      if (q === "all") {
        next.task_status = null;
      } else if (q === "triage") {
        next.task_status = ["invalid"];
      } else if (q === "archived") {
        next.task_status = null;
      } else {
        next.task_status = [q];
      }
      return next;
    });
    setShowArchived(q === "archived");
    // URL: ?triage=1 for the triage scope, ?status=<x> for a single
    // status, nothing for "all". Bookmark-friendly.
    if (q === "triage") setSearchParams({ triage: "1" });
    else if (q === "all" || q === "archived") setSearchParams({});
    else setSearchParams({ status: q });
  }, [setQuickFilterRaw, setFilteredInfo, setShowArchived, setSearchParams]);

  // Log drawer: owned at the page level so both the row action button and
  // the timeline in TaskRunsPanel can open it, sharing one drawer.
  const [logRun, setLogRun] = useState<TaskRunResponse | null>(null);
  const [logExecutor, setLogExecutor] = useState<ExecutorResponse | undefined>();
  const [executorsById, setExecutorsById] = useState<Map<number, ExecutorResponse>>(new Map());
  // Drawer takes (run, task, label) — task and label are derived from
  // current state so they refresh after SSE updates (e.g. task_status
  // flipping from invalid → archived without closing the drawer).

  const openLog = useCallback((run: TaskRunResponse, executor?: ExecutorResponse) => {
    setLogRun(run);
    setLogExecutor(executor ?? executorsById.get(run.executor_id));
  }, [executorsById]);

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
  const [creating, setCreating] = useState(false);
  const [bulkForm] = Form.useForm();

  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [avs, setAvs] = useState<AvResponse[]>([]);
  const [simulators, setSimulators] = useState<SimulatorResponse[]>([]);
  const [samplers, setSamplers] = useState<SamplerResponse[]>([]);

  const [bulkProgress, setBulkProgress] = useState<{ total: number; done: number; errors: number } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [previewCount, setPreviewCount] = useState(0);
  const [filteredPlans, setFilteredPlans] = useState<PlanResponse[]>([]);

  // --- Data loading ---

  const load = () => {
    setLoading(true);
    api.listTasks().then(setTasks).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

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
  usePisaEvents(useCallback((ev) => {
    if (ev.kind !== "row") return;
    if (ev.row.table === "task" || ev.row.table === "task_run") scheduleRefetch();
  }, [scheduleRefetch]));

  const fetchResources = () =>
    Promise.all([api.listPlans(), api.listAvs(), api.listSimulators(), api.listSamplers()])
      .then(([p, a, s, sa]) => { setPlans(p); setAvs(a); setSimulators(s); setSamplers(sa); });

  useEffect(() => { fetchResources(); }, []);

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

  // Visible main-table list under all current filters. Used by the
  // keyboard handler to walk j/k. Pinned rows live in their own table
  // and are intentionally excluded from cursor navigation.
  const visibleMainTasks = useMemo(() => {
    const archivedFilter = (t: TaskResponse) => showArchived || !t.archived;
    const colFilters = (t: TaskResponse) => {
      for (const [key, vals] of Object.entries(filteredInfo)) {
        if (!vals || vals.length === 0) continue;
        const v = (t as unknown as Record<string, unknown>)[key];
        if (!vals.includes(v as never)) return false;
      }
      return true;
    };
    return tasks.filter((t) => !pinnedIds.has(t.id) && archivedFilter(t) && colFilters(t));
  }, [tasks, pinnedIds, showArchived, filteredInfo]);

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
          handleExpandedChange(isOpen ? expandedRows.filter((k) => k !== id) : [...expandedRows, id]);
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
                <li><kbd>j</kbd> / <kbd>↓</kbd>  — next row</li>
                <li><kbd>k</kbd> / <kbd>↑</kbd>  — previous row</li>
                <li><kbd>Space</kbd> — expand / collapse current row</li>
                <li><kbd>Enter</kbd> — open log for current row's latest attempt</li>
                <li><kbd>?</kbd> — this cheat sheet</li>
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
    try { await api.updateTask(id, { task_status: "queued" }); message.success(`Task #${id} queued`); load(); }
    catch (e) { message.error(String(e)); }
  };

  const handleStop = async (id: number) => {
    try { await api.stopTask(id); message.success(`Task #${id} stopped`); load(); }
    catch (e) { message.error(String(e)); }
  };

  // Triage action for `invalid` tasks. Archives instead of mutating
  // task_status — keeps the state machine pure and the row + history
  // intact. The default Tasks view hides archived rows; the toggle in
  // the header reveals them.
  const handleArchive = async (id: number) => {
    try { await api.archiveTask(id); message.success(`Task #${id} archived`); load(); }
    catch (e) { message.error(String(e)); }
  };
  const handleUnarchive = async (id: number) => {
    try { await api.unarchiveTask(id); message.success(`Task #${id} unarchived`); load(); }
    catch (e) { message.error(String(e)); }
  };

  const handleBulkRun = async () => {
    const ids = tasks.filter((t) => selectedRowKeys.includes(t.id) && RUNNABLE_STATUSES.includes(t.task_status)).map((t) => t.id);
    try { await api.batchRunTasks(ids); message.success(`Queued ${ids.length} tasks`); }
    catch (e) { message.error(String(e)); }
    setSelectedRowKeys([]); load();
  };

  const handleBulkStop = async () => {
    const ids = tasks.filter((t) => selectedRowKeys.includes(t.id) && STOPPABLE_STATUSES.includes(t.task_status)).map((t) => t.id);
    try { await api.batchStopTasks(ids); message.success(`Stopped ${ids.length} tasks`); }
    catch (e) { message.error(String(e)); }
    setSelectedRowKeys([]); load();
  };

  const handleBulkArchive = async () => {
    const ids = tasks.filter((t) => selectedRowKeys.includes(t.id) && !t.archived).map((t) => t.id);
    try { await api.batchArchiveTasks(ids); message.success(`Archived ${ids.length} tasks`); }
    catch (e) { message.error(String(e)); }
    setSelectedRowKeys([]); load();
  };

  const handleBulkDelete = async () => {
    try { await api.batchDeleteTasks(selectedRowKeys as number[]); message.success(`Deleted ${selectedRowKeys.length} tasks`); }
    catch (e) { message.error(String(e)); }
    setSelectedRowKeys([]); load();
  };

  // --- Create ---
  // (Single-task create is the N=1 case of bulk create; no separate
  //  handler. Bulk modal renders Selects in `mode="multiple"` so the
  //  user can pick exactly one of each AV/Sim/Sampler/Plan.)

  // --- Bulk create ---

  const handleBulkCreate = async (values: { av_ids: number[]; simulator_ids: number[]; sampler_ids: number[]; plan_ids: number[]; plan_filter?: string }) => {
    const selectedPlans = values.plan_ids?.length ? values.plan_ids
      : plans.filter((p) => values.plan_filter ? p.name.toLowerCase().includes(values.plan_filter.toLowerCase()) : true).map((p) => p.id);
    const combos: Partial<TaskResponse>[] = [];
    for (const av_id of values.av_ids)
      for (const simulator_id of values.simulator_ids)
        for (const sampler_id of values.sampler_ids)
          for (const plan_id of selectedPlans)
            combos.push({ plan_id, av_id, simulator_id, sampler_id, task_status: "idle" });
    if (!combos.length) { message.warning("No combinations"); return; }
    setCreating(true); setBulkProgress({ total: combos.length, done: 0, errors: 0 });
    try {
      const { done, errors } = await api.batchCreateTasks(combos, (d, e, t) =>
        setBulkProgress({ total: t, done: d, errors: e }),
      );
      if (errors === 0) {
        message.success(`Created ${done} tasks`);
      } else {
        message.warning(`Created ${done}, ${errors} failed`);
      }
    } catch (e) {
      message.error(String(e));
    } finally {
      setCreating(false);
      setBulkModalOpen(false); bulkForm.resetFields(); setBulkProgress(null); load();
    }
  };

  const computeFilteredPlans = (): PlanResponse[] => {
    const v = bulkForm.getFieldsValue();
    if (v.plan_ids?.length) return plans.filter((p) => v.plan_ids.includes(p.id));
    if (v.plan_filter) return plans.filter((p) => p.name.toLowerCase().includes(v.plan_filter.toLowerCase()));
    return plans;
  };

  const updatePreview = () => {
    const v = bulkForm.getFieldsValue();
    const matched = computeFilteredPlans();
    setFilteredPlans(matched);
    setPreviewCount((v.av_ids?.length || 0) * (v.simulator_ids?.length || 0) * (v.sampler_ids?.length || 0) * matched.length);
    setConfirmed(false);
  };

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

  const expandedColumns = [
    { title: "AV", dataIndex: "av_id", key: "av_id", width: 100, ellipsis: true,
      render: (id: number) => avMap.get(id) ?? `#${id}`,
      filters: avs.map((a) => ({ text: a.name, value: a.id })),
      filteredValue: filteredInfo.av_id ?? null,
      onFilter: (value: unknown, record: TaskResponse) => record.av_id === value },
    { title: "Simulator", dataIndex: "simulator_id", key: "simulator_id", width: 100, ellipsis: true,
      render: (id: number) => simMap.get(id) ?? `#${id}`,
      filters: simulators.map((s) => ({ text: s.name, value: s.id })),
      filteredValue: filteredInfo.simulator_id ?? null,
      onFilter: (value: unknown, record: TaskResponse) => record.simulator_id === value },
    { title: "Sampler", dataIndex: "sampler_id", key: "sampler_id", width: 80, ellipsis: true,
      render: (id: number) => samplerMap.get(id) ?? `#${id}`,
      filters: samplers.map((s) => ({ text: s.name, value: s.id })),
      filteredValue: filteredInfo.sampler_id ?? null,
      onFilter: (value: unknown, record: TaskResponse) => record.sampler_id === value },
  ];

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60, ellipsis: true,
      sorter: (a: TaskResponse, b: TaskResponse) => a.id - b.id },
    { title: "Plan", dataIndex: "plan_id", key: "plan_id", width: 250, ellipsis: true,
      render: (id: number) => planMap.get(id) ?? `#${id}`,
      filteredValue: filteredInfo.plan_id ?? null,
      ...getColumnSearchProps<TaskResponse>("plan_id", (r) => planMap.get(r.plan_id) ?? "") },
    ...(compactView ? [setupColumn] : expandedColumns),
    { title: "Status", dataIndex: "task_status", key: "task_status", width: 110,
      filters: (["idle", "queued", "running", "completed", "invalid", "aborted"] as TaskStatus[]).map((s) => ({ text: s, value: s })),
      filteredValue: filteredInfo.task_status ?? null,
      onFilter: (value: unknown, record: TaskResponse) => record.task_status === value,
      render: (status: TaskStatus) => (
        <Tag color={statusColors[status]} icon={status === "running" ? <SyncOutlined spin /> : undefined}>
          {status.toUpperCase()}
        </Tag>
      ) },
    { title: "Attempts", dataIndex: "attempt_count", key: "attempt_count", width: 70,
      sorter: (a: TaskResponse, b: TaskResponse) => a.attempt_count - b.attempt_count },
    { title: "Last Run", key: "last_run", width: 170,
      render: (_: unknown, r: TaskResponse) => { const t = r.task_run?.[0]?.started_at; return t ? new Date(t).toLocaleString() : "-"; },
      sorter: (a: TaskResponse, b: TaskResponse) => (a.task_run?.[0]?.started_at ? new Date(a.task_run[0].started_at).getTime() : 0) - (b.task_run?.[0]?.started_at ? new Date(b.task_run[0].started_at).getTime() : 0),
      defaultSortOrder: "descend" as const },
    { title: "", key: "actions", width: 144, fixed: "right" as const, render: (_: unknown, record: TaskResponse) => {
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
              <Button size="small" icon={<UndoOutlined />} onClick={() => handleUnarchive(record.id)} />
            </Tooltip>
          )}
        </Space>
      );
    }},
  ];

  // --- Selection bar ---

  // Selection bar floats at the bottom of the viewport via Affix so the
  // user can scroll the table without losing track of what they've
  // selected. Renders nothing when nothing is selected.
  const selectionBar = selectedRowKeys.length > 0 && (() => {
    const selected = tasks.filter((t) => selectedRowKeys.includes(t.id));
    const allSelected = selectedRowKeys.length === tasks.length;
    const runnableCount = selected.filter((t) => RUNNABLE_STATUSES.includes(t.task_status)).length;
    const stoppableCount = selected.filter((t) => STOPPABLE_STATUSES.includes(t.task_status)).length;
    const archivableCount = selected.filter((t) => !t.archived).length;
    return (
      <Affix offsetBottom={12} style={{ position: "fixed", left: 16, right: 16, bottom: 12, zIndex: 50 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
            padding: "8px 14px",
            borderRadius: 8,
            background: "var(--ant-color-bg-elevated, rgba(255,255,255,0.97))",
            boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
            border: "1px solid var(--ant-color-border-secondary, rgba(0,0,0,0.08))",
            backdropFilter: "blur(6px)",
          }}
        >
          <Space>
            <Typography.Text strong>{selectedRowKeys.length} selected</Typography.Text>
            {!allSelected ? (
              <Button size="small" type="link" style={{ padding: 0 }} onClick={() => setSelectedRowKeys(tasks.map((t) => t.id))}>Select all {tasks.length}</Button>
            ) : (
              <Button size="small" type="link" style={{ padding: 0 }} onClick={() => setSelectedRowKeys([])}>Deselect all</Button>
            )}
          </Space>
          <Space>
            {runnableCount > 0 && <Popconfirm title={`Run ${runnableCount}?`} onConfirm={handleBulkRun}><Button size="small" type="primary" icon={<CaretRightOutlined />}>Run {runnableCount}</Button></Popconfirm>}
            {stoppableCount > 0 && <Popconfirm title={`Stop ${stoppableCount}?`} onConfirm={handleBulkStop}><Button size="small" icon={<StopOutlined />}>Stop {stoppableCount}</Button></Popconfirm>}
            {archivableCount > 0 && <Popconfirm title={`Archive ${archivableCount}?`} onConfirm={handleBulkArchive}><Button size="small" icon={<InboxOutlined />}>Archive {archivableCount}</Button></Popconfirm>}
            <Popconfirm title={`Delete ${selectedRowKeys.length}?`} onConfirm={handleBulkDelete}><Button size="small" danger icon={<DeleteOutlined />}>Delete {selectedRowKeys.length}</Button></Popconfirm>
            <Button size="small" onClick={() => setSelectedRowKeys([])}>Clear</Button>
          </Space>
        </div>
      </Affix>
    );
  })();

  return (
    <>
      <PageHeader title="Tasks">
        <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => { fetchResources().then(() => { setConfirmed(false); setFilteredPlans([]); setPreviewCount(0); setBulkModalOpen(true); }); }}>Create</Button>
        <Button icon={<ClearOutlined />} onClick={clearFilters} disabled={!hasActiveFilters && quickFilter === "all"}>Clear Filters</Button>
        <Checkbox checked={compactView} onChange={(e) => setCompactView(e.target.checked)} style={{ marginLeft: 4 }}>
          Compact
        </Checkbox>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </PageHeader>

      {/* Quick-filter chips: replace the dropdown discovery problem.
          Counts are live (re-derived on every render) so the user can
          see triage backlog at a glance. */}
      <div style={{ marginBottom: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
        {QUICK_FILTERS.map((q) => {
          const count =
            q.value === "all"
              ? tasks.filter((t) => !t.archived).length
              : q.value === "triage"
                ? tasks.filter((t) => t.task_status === "invalid" && !t.archived).length
                : q.value === "archived"
                  ? tasks.filter((t) => t.archived).length
                  : tasks.filter((t) => t.task_status === q.value && !t.archived).length;
          const active = quickFilter === q.value;
          return (
            <Button
              key={q.value}
              size="small"
              type={active ? "primary" : "default"}
              onClick={() => setQuickFilter(q.value)}
            >
              {q.label}
              <Badge
                count={count}
                showZero
                color={active ? "#fff" : undefined}
                style={{
                  marginLeft: 6,
                  backgroundColor: active ? "rgba(255,255,255,0.18)" : undefined,
                  color: active ? "#fff" : undefined,
                }}
              />
            </Button>
          );
        })}
      </div>

      {selectionBar}

      {pinnedIds.size > 0 && (
        <Table
          dataSource={tasks.filter((t) => pinnedIds.has(t.id) && (showArchived || !t.archived))}
          columns={columns}
          rowKey="id"
          size="small"
          scroll={{ x: "max-content" }}
          pagination={false}
          rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys) }}
          onChange={(_p, filters) => setFilteredInfo(filters)}
          expandable={{
            expandedRowRender: (r: TaskResponse) => (
              <TaskRunsPanel
                key={`${r.id}-${expansionCounts.get(r.id) ?? 0}`}
                taskId={r.id}
                onOpenLog={openLog}
              />
            ),
            expandedRowKeys: expandedRows,
            showExpandColumn: false,
            expandRowByClick: true,
            onExpandedRowsChange: (keys) => handleExpandedChange(keys as React.Key[]),
          }}
          style={{ marginBottom: 8 }}
        />
      )}

      <Table
        dataSource={tasks.filter((t) => !pinnedIds.has(t.id) && (showArchived || !t.archived))}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: "max-content" }}
        pagination={{ current: currentPage, pageSize, showSizeChanger: true, showTotal: (t) => `${t} tasks`, onChange: (p, s) => { setCurrentPage(p); setPageSize(s); } }}
        rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys) }}
        onChange={(_p, filters) => setFilteredInfo(filters)}
        rowClassName={(r) => r.id === cursorId ? "tasks-row-cursor" : ""}
        onRow={(r) => ({
          style: r.archived ? { opacity: 0.55 } : undefined,
          onMouseDown: () => setCursorId(r.id),
        })}
        expandable={{
          expandedRowRender: (r: TaskResponse) => (
            <TaskRunsPanel
              key={`${r.id}-${expansionCounts.get(r.id) ?? 0}`}
              taskId={r.id}
              onOpenLog={openLog}
            />
          ),
          expandedRowKeys: expandedRows,
          showExpandColumn: false,
          expandRowByClick: true,
          onExpandedRowsChange: (keys) => handleExpandedChange(keys as React.Key[]),
        }}
      />

      {/* Single Create + Bulk Create are one and the same — Bulk just
          handles the N=1 case naturally. The standalone Create modal +
          handleCreate path were dropped to remove the "two ways to do
          one job" problem. */}
      {/* Bulk create */}
      <Modal title="Bulk Create Tasks" open={bulkModalOpen} onCancel={() => { if (!creating) { setBulkModalOpen(false); setBulkProgress(null); } }} footer={null} width={640}>
        <Typography.Paragraph type="secondary">Creates tasks for every combination of selected AVs, Simulators, Samplers, and Plans.</Typography.Paragraph>
        <Form form={bulkForm} layout="vertical" onFinish={handleBulkCreate} onValuesChange={updatePreview}>
          <Form.Item name="av_ids" label="AVs" rules={[{ required: true }]}>
            <Select mode="multiple" options={avs.map((a) => ({ label: a.name, value: a.id }))} placeholder="Select AVs" />
          </Form.Item>
          <Form.Item name="simulator_ids" label="Simulators" rules={[{ required: true }]}>
            <Select mode="multiple" options={simulators.map((s) => ({ label: s.name, value: s.id }))} placeholder="Select Simulators" />
          </Form.Item>
          <Form.Item name="sampler_ids" label="Samplers" rules={[{ required: true }]}>
            <Select mode="multiple" options={samplers.map((s) => ({ label: s.name, value: s.id }))} placeholder="Select Samplers" />
          </Form.Item>
          <Form.Item name="plan_filter" label="Plan name filter">
            <Input placeholder="e.g. tyms, route" allowClear />
          </Form.Item>
          <Form.Item name="plan_ids" label="Plans (leave empty for all matching)">
            <Select mode="multiple" options={plans.map((p) => ({ label: `${p.name} (#${p.id})`, value: p.id }))} showSearch optionFilterProp="label" placeholder="All plans" maxTagCount={5} />
          </Form.Item>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}><Card size="small"><Statistic title="Matched" value={filteredPlans.length} /></Card></Col>
            <Col span={8}><Card size="small"><Statistic title="Total plans" value={plans.length} /></Card></Col>
            <Col span={8}><Card size="small"><Statistic title="Tasks" value={previewCount} /></Card></Col>
          </Row>
          {filteredPlans.length > 0 && (
            <Table dataSource={filteredPlans} columns={[
              { title: "ID", dataIndex: "id", key: "id", width: 60 },
              { title: "Name", dataIndex: "name", key: "name", ellipsis: true },
              { title: "Map", dataIndex: "map_id", key: "map_id", width: 60 },
            ]} rowKey="id" size="small" pagination={{ pageSize: 5, size: "small" }} style={{ marginBottom: 16 }} />
          )}
          {bulkProgress && (
            <div style={{ marginBottom: 16 }}>
              <Progress percent={Math.round((bulkProgress.done / bulkProgress.total) * 100)} status={bulkProgress.errors > 0 ? "exception" : "active"} />
              <Typography.Text>{bulkProgress.done}/{bulkProgress.total}{bulkProgress.errors > 0 && <Typography.Text type="danger"> ({bulkProgress.errors} errors)</Typography.Text>}</Typography.Text>
            </div>
          )}
          {previewCount > 5000 && <Alert type="warning" message={`This will create ${previewCount.toLocaleString()} tasks.`} style={{ marginBottom: 16 }} />}
          <Form.Item style={{ marginBottom: 8 }}>
            <Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={!previewCount}>
              I confirm creating {previewCount.toLocaleString()} tasks
            </Checkbox>
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={creating} block disabled={!previewCount || !confirmed}>
              Create {previewCount.toLocaleString()} Tasks
            </Button>
          </Form.Item>
        </Form>
      </Modal>

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
      `}</style>
    </>
  );
}
