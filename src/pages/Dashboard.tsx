import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
} from "antd";
import { SyncOutlined, StopOutlined } from "@ant-design/icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import StatusTiles from "../components/StatusTiles";
import { useFleetData } from "../hooks/useFleetData";
import { useSessionStorageState } from "../hooks/useSessionStorageState";
import { usePisaEvents } from "../api/events";
import type { TaskStatus } from "../api/types";
import { TASK_STATUS_HEX, TASK_STATUS_LABEL } from "../constants/status";

interface AbortedStats {
  total: number;
  last24h: number;
}

async function fetchAbortedStats(): Promise<AbortedStats> {
  const POSTGREST = import.meta.env.VITE_POSTGREST_URL ?? "/postgrest";
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const fetchCount = async (url: string): Promise<number> => {
    const res = await fetch(url, {
      method: "HEAD",
      headers: {
        Accept: "application/json",
        Prefer: "count=exact",
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch aborted stats: ${res.status} ${res.statusText}`);
    }

    const contentRange = res.headers.get("Content-Range");
    const match = contentRange?.match(/\/(\d+)$/);

    if (!match) {
      throw new Error("Failed to fetch aborted stats: missing or invalid Content-Range header");
    }

    return Number.parseInt(match[1], 10);
  };

  const [total, last24h] = await Promise.all([
    fetchCount(`${POSTGREST}/task_run?task_run_status=eq.aborted`),
    fetchCount(
      `${POSTGREST}/task_run?task_run_status=eq.aborted&finished_at=gte.${encodeURIComponent(cutoff)}`,
    ),
  ]);

  return { total, last24h };
}

const STATUS_ORDER: TaskStatus[] = ["completed", "running", "queued", "idle", "invalid", "aborted"];

/** Colour key shown in the `extra` slot of the donut breakdown cards. */
function StatusLegend() {
  return (
    <Space size={12} wrap>
      {STATUS_ORDER.map((s) => (
        <Space key={s} size={4}>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: 2,
              background: TASK_STATUS_HEX[s],
            }}
          />
          <Typography.Text style={{ fontSize: 11 }} type="secondary">
            {TASK_STATUS_LABEL[s]}
          </Typography.Text>
        </Space>
      ))}
    </Space>
  );
}

/** Inline SVG donut. Segments are drawn in `STATUS_ORDER` so the
 *  same colour always sits in the same position around the ring,
 *  making it easy to compare two donuts side-by-side. */
function StatusDonut({
  counts,
  size = 84,
  strokeWidth = 12,
}: {
  counts: Record<TaskStatus, number>;
  size?: number;
  strokeWidth?: number;
}) {
  const total = STATUS_ORDER.reduce((acc, s) => acc + counts[s], 0);
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Background ring so a near-empty donut still has shape.
          Uses an AntD theme variable so the gray flips for dark mode. */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--ant-color-fill-tertiary, #f0f0f0)"
        strokeWidth={strokeWidth}
      />
      {total > 0 &&
        STATUS_ORDER.map((s) => {
          const v = counts[s];
          if (v === 0) return null;
          const len = (v / total) * c;
          const seg = (
            <circle
              key={s}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={TASK_STATUS_HEX[s]}
              strokeWidth={strokeWidth}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-acc}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          acc += len;
          return seg;
        })}
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontSize: 14, fontWeight: 600, fill: "var(--ant-color-text, #262626)" }}
      >
        {total}
      </text>
    </svg>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Core fleet data + realtime core refetch is shared with Control.
  const { tasks, plans, executors, loading, avMap, simMap, samplerMap } = useFleetData();
  const [aborted, setAborted] = useState<AbortedStats>({ total: 0, last24h: 0 });

  // Aborted-run stats are Dashboard-specific. They only move on task_run
  // changes, so load on mount and debounce-refresh on those SSE rows.
  const refreshAborted = useCallback(() => {
    fetchAbortedStats()
      .then(setAborted)
      .catch(() => {
        /* transient; next event retries */
      });
  }, []);
  useEffect(() => {
    refreshAborted();
  }, [refreshAborted]);
  const abortedTimer = useRef<number | null>(null);
  const scheduleAborted = useCallback(() => {
    if (abortedTimer.current !== null) return;
    abortedTimer.current = window.setTimeout(() => {
      abortedTimer.current = null;
      refreshAborted();
    }, 400);
  }, [refreshAborted]);
  usePisaEvents(
    useCallback(
      (ev) => {
        if (ev.kind === "row" && ev.row.table === "task_run") scheduleAborted();
      },
      [scheduleAborted],
    ),
    useMemo(() => ({ kinds: ["row"] as const, rowTables: ["task_run"] as const }), []),
  );
  useEffect(() => {
    return () => {
      if (abortedTimer.current !== null) window.clearTimeout(abortedTimer.current);
    };
  }, []);

  // Tag filter scopes the top section (status cards, totals, setup
  // breakdown) to tasks whose plan carries at least one selected tag.
  const defaultTagFilter = useMemo(() => {
    const all = searchParams.getAll("tag");
    if (all.length > 1) return all;
    const single = all[0];
    return single ? single.split(",").filter(Boolean) : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [tagFilter, setTagFilterRaw] = useSessionStorageState<string[]>(
    "dashboard.tagFilter",
    defaultTagFilter,
  );
  const [tagFilterInitialised, setTagFilterInitialised] = useSessionStorageState<boolean>(
    "dashboard.tagFilterInitialised",
    defaultTagFilter.length > 0,
  );
  // One-shot cleanup of the old localStorage key.
  useEffect(() => {
    try {
      localStorage.removeItem("dashboard.tagFilter");
    } catch {
      /* ignore */
    }
  }, []);
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
  const toggleTag = useCallback(
    (tag: string) => {
      setTagFilter(
        tagFilter.includes(tag) ? tagFilter.filter((t) => t !== tag) : [...tagFilter, tag],
      );
    },
    [tagFilter, setTagFilter],
  );

  // Idle-prefetch the Tasks chunk: most operators click through within a
  // few seconds, so warm the route's code before they do.
  useEffect(() => {
    const prefetch = () => {
      void import("./Tasks");
    };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(prefetch);
      return () => window.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(prefetch, 0);
    return () => window.clearTimeout(id);
  }, []);

  // `planTagsMap` is reused by the bottom per-tag breakdown.
  const planTagsMap = useMemo(() => new Map(plans.map((p) => [p.id, p.tags ?? []])), [plans]);

  // Top-section scope: tasks whose plan carries any selected tag.
  const filteredTasks = useMemo(() => {
    if (tagFilter.length === 0) return tasks;
    const want = new Set(tagFilter);
    return tasks.filter((t) => {
      const tags = planTagsMap.get(t.plan_id) ?? [];
      return tags.some((x) => want.has(x));
    });
  }, [tasks, tagFilter, planTagsMap]);

  const counts: Record<TaskStatus, number> = useMemo(() => {
    const c: Record<TaskStatus, number> = {
      idle: 0,
      queued: 0,
      running: 0,
      completed: 0,
      invalid: 0,
      aborted: 0,
    };
    for (const t of filteredTasks) c[t.task_status]++;
    return c;
  }, [filteredTasks]);

  // Stuck = running for over 2h, often a SLURM job that never reached the
  // executor. Respects the tag filter.
  const stuckCount = useMemo(() => {
    const cutoff = Date.now() - 2 * 3600 * 1000;
    return filteredTasks.filter((t) => {
      if (t.task_status !== "running") return false;
      const startedAt = t.task_run?.[0]?.started_at;
      if (!startedAt) return false;
      return new Date(startedAt).getTime() < cutoff;
    }).length;
  }, [filteredTasks]);

  // Distinct executors serving a running task right now (scoped). Drives
  // the compact "live" pointer into Control.
  const busyExecutorCount = useMemo(() => {
    const ids = new Set<number>();
    for (const t of filteredTasks) {
      if (t.task_status !== "running") continue;
      const exId = t.task_run?.[0]?.executor_id;
      if (exId != null) ids.add(exId);
    }
    return ids.size;
  }, [filteredTasks]);

  // Group tasks by AV/Sim/Sampler combo and tally by status.
  const SETUP_DONUT_LIMIT = 8;
  const setupGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        avId: number;
        simId: number;
        samplerId: number;
        counts: Record<TaskStatus, number>;
        total: number;
      }
    >();
    for (const t of filteredTasks) {
      const key = `${t.av_id}-${t.simulator_id}-${t.sampler_id}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          avId: t.av_id,
          simId: t.simulator_id,
          samplerId: t.sampler_id,
          counts: { idle: 0, queued: 0, running: 0, completed: 0, invalid: 0, aborted: 0 },
          total: 0,
        };
        map.set(key, g);
      }
      g.counts[t.task_status]++;
      g.total++;
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [filteredTasks]);
  const visibleSetupGroups = setupGroups.slice(0, SETUP_DONUT_LIMIT);
  const hiddenSetupCount = Math.max(0, setupGroups.length - SETUP_DONUT_LIMIT);

  // tag → (setup combo → counts). Uses the full task set (unscoped
  // overview) so experiments can be compared.
  type SetupBucket = {
    key: string;
    avId: number;
    simId: number;
    samplerId: number;
    counts: Record<TaskStatus, number>;
    total: number;
  };
  const tagGroups = useMemo(() => {
    const byTag = new Map<string, Map<string, SetupBucket>>();
    for (const t of tasks) {
      const tags = planTagsMap.get(t.plan_id) ?? [];
      const tagsForBucket = tags.length > 0 ? tags : ["(untagged)"];
      for (const tag of tagsForBucket) {
        let setups = byTag.get(tag);
        if (!setups) {
          setups = new Map();
          byTag.set(tag, setups);
        }
        const setupKey = `${t.av_id}-${t.simulator_id}-${t.sampler_id}`;
        let bucket = setups.get(setupKey);
        if (!bucket) {
          bucket = {
            key: setupKey,
            avId: t.av_id,
            simId: t.simulator_id,
            samplerId: t.sampler_id,
            counts: { idle: 0, queued: 0, running: 0, completed: 0, invalid: 0, aborted: 0 },
            total: 0,
          };
          setups.set(setupKey, bucket);
        }
        bucket.counts[t.task_status]++;
        bucket.total++;
      }
    }
    return [...byTag.entries()]
      .map(([tag, setups]) => {
        const buckets = [...setups.values()].sort((a, b) => b.total - a.total);
        const total = buckets.reduce((sum, b) => sum + b.total, 0);
        return { tag, buckets, total };
      })
      .sort((a, b) => {
        if (a.tag === "(untagged)" && b.tag !== "(untagged)") return 1;
        if (b.tag === "(untagged)" && a.tag !== "(untagged)") return -1;
        return b.total - a.total;
      });
  }, [tasks, planTagsMap]);

  // All distinct tag names in use across plans, sorted by popularity.
  const allTags = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of plans) for (const t of p.tags ?? []) c.set(t, (c.get(t) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [plans]);

  // Pre-select every tag on first load so the dashboard starts scoped to
  // "tagged plans only". Skipped when the URL or sessionStorage already
  // provided a selection.
  useEffect(() => {
    if (tagFilterInitialised) return;
    if (allTags.length === 0) return;
    setTagFilterRaw(allTags);
    setTagFilterInitialised(true);
  }, [tagFilterInitialised, allTags, setTagFilterRaw, setTagFilterInitialised]);

  if (loading)
    return (
      <Spin size="large" style={{ display: "flex", justifyContent: "center", marginTop: 80 }} />
    );

  const scopeQuery = (extra: string) => {
    const params = new URLSearchParams();
    for (const [k, v] of extra ? new URLSearchParams(extra).entries() : []) params.set(k, v);
    if (tagFilter.length > 0) params.set("tag", tagFilter.join(","));
    return params.toString();
  };

  return (
    <>
      <PageHeader title="Dashboard" />

      {allTags.length > 0 && (
        <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: "10px 12px" } }}>
          <Space size={[6, 6]} wrap>
            <Typography.Text type="secondary" style={{ fontSize: 12, marginRight: 4 }}>
              Scope:
            </Typography.Text>
            <Tag
              color={tagFilter.length === 0 ? "blue" : "default"}
              style={{ cursor: "pointer", userSelect: "none" }}
              onClick={() => setTagFilter([])}
            >
              All
            </Tag>
            {allTags.map((tag) => {
              const active = tagFilter.includes(tag);
              return (
                <Tag
                  key={tag}
                  color={active ? "blue" : "default"}
                  style={{ cursor: "pointer", userSelect: "none" }}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </Tag>
              );
            })}
          </Space>
        </Card>
      )}

      {stuckCount > 0 && (
        <Alert
          style={{ marginBottom: 12 }}
          type="info"
          showIcon
          message={
            <Space>
              <Typography.Text strong>
                {stuckCount} task{stuckCount === 1 ? "" : "s"}
              </Typography.Text>
              <Typography.Text>running for &gt; 2h — possibly stuck.</Typography.Text>
            </Space>
          }
          action={
            <Button size="small" onClick={() => navigate(`/tasks?${scopeQuery("status=running")}`)}>
              Show
            </Button>
          }
        />
      )}

      <StatusTiles
        counts={counts}
        onSelect={(status) => navigate(`/tasks?${scopeQuery(`status=${status}`)}`)}
      />

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} md={8}>
          <Card size="small" styles={{ body: { padding: "12px 16px" } }}>
            <Statistic
              title={tagFilter.length > 0 ? `Total Tasks (${tagFilter.join(", ")})` : "Total Tasks"}
              value={filteredTasks.length}
              suffix={
                tagFilter.length > 0 ? (
                  <Typography.Text type="secondary" style={{ fontSize: 13, marginLeft: 8 }}>
                    / {tasks.length} total
                  </Typography.Text>
                ) : null
              }
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small" styles={{ body: { padding: "12px 16px" } }}>
            <Statistic
              title={
                <span>
                  <StopOutlined style={{ marginRight: 4 }} />
                  Aborted runs (last 24 h)
                  <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>
                    · all tags
                  </Typography.Text>
                </span>
              }
              value={aborted.last24h}
              suffix={
                <Typography.Text type="secondary" style={{ fontSize: 13, marginLeft: 8 }}>
                  / {aborted.total} total
                </Typography.Text>
              }
              valueStyle={{ color: aborted.last24h > 0 ? "#ff7875" : undefined, fontSize: 22 }}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          {/* Live activity lives on Control now — this is just a pointer. */}
          <Card
            size="small"
            hoverable
            onClick={() => navigate("/control")}
            style={{ cursor: "pointer", height: "100%" }}
            styles={{ body: { padding: "12px 16px" } }}
          >
            <Space direction="vertical" size={2} style={{ width: "100%" }}>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                <SyncOutlined
                  spin={counts.running > 0}
                  style={{ color: TASK_STATUS_HEX.running, marginRight: 6 }}
                />
                Live activity
              </Typography.Text>
              <Space size={8} align="baseline" wrap>
                <Typography.Text strong style={{ fontSize: 22, color: TASK_STATUS_HEX.running }}>
                  {counts.running}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  running on {busyExecutorCount}/{executors.length} executors
                </Typography.Text>
              </Space>
              <Typography.Link style={{ fontSize: 12 }}>Open Mission Control →</Typography.Link>
            </Space>
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        style={{ marginTop: 12 }}
        title={
          <Space size={8}>
            <Typography.Text strong>Setup status breakdown</Typography.Text>
            <Tag>{setupGroups.length} setups</Tag>
          </Space>
        }
        extra={<StatusLegend />}
      >
        {visibleSetupGroups.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tasks in any setup yet" />
        ) : (
          <Row gutter={[12, 16]}>
            {visibleSetupGroups.map((g) => {
              const av = avMap.get(g.avId) ?? `#${g.avId}`;
              const sim = simMap.get(g.simId) ?? `#${g.simId}`;
              const sampler = samplerMap.get(g.samplerId) ?? `#${g.samplerId}`;
              return (
                <Col key={g.key} xs={12} sm={8} md={6} lg={3}>
                  <Space
                    direction="vertical"
                    size={4}
                    style={{ width: "100%", textAlign: "center", cursor: "pointer" }}
                    onClick={() =>
                      navigate(
                        `/tasks?av_id=${g.avId}&simulator_id=${g.simId}&sampler_id=${g.samplerId}`,
                      )
                    }
                  >
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <StatusDonut counts={g.counts} />
                    </div>
                    <Typography.Text
                      strong
                      style={{ fontSize: 12, display: "block" }}
                      ellipsis={{ tooltip: `${av} · ${sim} · ${sampler}` }}
                    >
                      {av}
                    </Typography.Text>
                    <Typography.Text
                      type="secondary"
                      style={{ fontSize: 11, display: "block" }}
                      ellipsis={{ tooltip: `${sim} · ${sampler}` }}
                    >
                      {sim} · {sampler}
                    </Typography.Text>
                  </Space>
                </Col>
              );
            })}
            {hiddenSetupCount > 0 && (
              <Col xs={24}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  + {hiddenSetupCount} more setup{hiddenSetupCount === 1 ? "" : "s"} not shown
                  (sorted by task count desc).
                </Typography.Text>
              </Col>
            )}
          </Row>
        )}
      </Card>

      <Card
        size="small"
        style={{ marginTop: 12 }}
        title={
          <Space size={8}>
            <Typography.Text strong>Status by plan group</Typography.Text>
            <Tag>
              {tagGroups.length} group{tagGroups.length === 1 ? "" : "s"}
            </Tag>
          </Space>
        }
        extra={<StatusLegend />}
      >
        {tagGroups.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No plan tags yet — set them on the Plans page or at upload."
          />
        ) : (
          <Space direction="vertical" size={20} style={{ width: "100%" }}>
            {tagGroups.map((group) => {
              const visibleBuckets = group.buckets.slice(0, SETUP_DONUT_LIMIT);
              const hiddenBuckets = Math.max(0, group.buckets.length - SETUP_DONUT_LIMIT);
              return (
                <div key={group.tag}>
                  <Space size={8} style={{ marginBottom: 12 }}>
                    {group.tag === "(untagged)" ? (
                      <Tag color="default">{group.tag}</Tag>
                    ) : (
                      <Tag
                        color="blue"
                        style={{ cursor: "pointer" }}
                        onClick={() => navigate(`/tasks?tag=${encodeURIComponent(group.tag)}`)}
                      >
                        {group.tag}
                      </Tag>
                    )}
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {group.total} task{group.total === 1 ? "" : "s"} · {group.buckets.length}{" "}
                      setup{group.buckets.length === 1 ? "" : "s"}
                    </Typography.Text>
                  </Space>
                  <Row gutter={[12, 16]}>
                    {visibleBuckets.map((b) => {
                      const av = avMap.get(b.avId) ?? `#${b.avId}`;
                      const sim = simMap.get(b.simId) ?? `#${b.simId}`;
                      const sampler = samplerMap.get(b.samplerId) ?? `#${b.samplerId}`;
                      const params = new URLSearchParams({
                        av_id: String(b.avId),
                        simulator_id: String(b.simId),
                        sampler_id: String(b.samplerId),
                      });
                      if (group.tag !== "(untagged)") params.set("tag", group.tag);
                      return (
                        <Col key={`${group.tag}-${b.key}`} xs={12} sm={8} md={6} lg={3}>
                          <Space
                            direction="vertical"
                            size={4}
                            style={{ width: "100%", textAlign: "center", cursor: "pointer" }}
                            onClick={() => navigate(`/tasks?${params.toString()}`)}
                          >
                            <div style={{ display: "flex", justifyContent: "center" }}>
                              <StatusDonut counts={b.counts} />
                            </div>
                            <Typography.Text
                              strong
                              style={{ fontSize: 12, display: "block" }}
                              ellipsis={{ tooltip: `${av} · ${sim} · ${sampler}` }}
                            >
                              {av}
                            </Typography.Text>
                            <Typography.Text
                              type="secondary"
                              style={{ fontSize: 11, display: "block" }}
                              ellipsis={{ tooltip: `${sim} · ${sampler}` }}
                            >
                              {sim} · {sampler}
                            </Typography.Text>
                          </Space>
                        </Col>
                      );
                    })}
                    {hiddenBuckets > 0 && (
                      <Col xs={24}>
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          + {hiddenBuckets} more setup{hiddenBuckets === 1 ? "" : "s"} in this
                          group.
                        </Typography.Text>
                      </Col>
                    )}
                  </Row>
                </div>
              );
            })}
          </Space>
        )}
      </Card>
    </>
  );
}
