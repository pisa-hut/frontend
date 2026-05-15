import { memo, useCallback, useMemo } from "react";
import { Button, Space, Tag, Typography } from "antd";
import type { FilterValue } from "antd/es/table/interface";
import type {
  AvResponse,
  MonitorResponse,
  SamplerResponse,
  SimulatorResponse,
} from "../../api/types";

interface Props {
  avs: AvResponse[];
  simulators: SimulatorResponse[];
  samplers: SamplerResponse[];
  monitors: MonitorResponse[];
  availableTags: string[];
  filteredInfo: Record<string, FilterValue | null>;
  setFilteredInfo: (
    next:
      | Record<string, FilterValue | null>
      | ((prev: Record<string, FilterValue | null>) => Record<string, FilterValue | null>),
  ) => void;
  tagFilter: string[];
  setTagFilter: (next: string[]) => void;
  onClearAll: () => void;
  hasActiveFilters: boolean;
  /** Per-axis row counts within the current scope, keyed by option value. */
  countsByKey: {
    av_id: Map<number, number>;
    simulator_id: Map<number, number>;
    sampler_id: Map<number, number>;
    monitor_id: Map<number, number>;
    tag: Map<string, number>;
  };
}

// Hoisted style objects: AntD's CheckableTag re-injects CSS-in-JS
// rules when its style prop identity changes. Inline objects per
// render forced an injection per chip per click — plenty enough to
// explain a 100ms+ click handler when the chip count is high.
const CHIP_STYLE = { padding: "2px 10px", fontSize: 12, marginInlineEnd: 0 };
const CHIP_COUNT_STYLE = {
  marginLeft: 6,
  opacity: 0.65,
  fontVariantNumeric: "tabular-nums" as const,
  fontSize: 11,
};

const CountedChip = memo(function CountedChip<V extends string | number>({
  value,
  label,
  count,
  active,
  onToggle,
}: {
  value: V;
  label: string;
  count: number;
  active: boolean;
  onToggle: (v: V) => void;
}) {
  return (
    <Tag.CheckableTag checked={active} onChange={() => onToggle(value)} style={CHIP_STYLE}>
      {label}
      <span style={CHIP_COUNT_STYLE}>{count}</span>
    </Tag.CheckableTag>
  );
}) as <V extends string | number>(p: {
  value: V;
  label: string;
  count: number;
  active: boolean;
  onToggle: (v: V) => void;
}) => React.ReactElement;

interface ChipRowProps<V extends string | number> {
  label: string;
  options: { label: string; value: V }[];
  counts: Map<V, number>;
  selected: V[];
  onToggle: (v: V) => void;
  onClear: () => void;
}

const ROW_STYLE = { display: "flex", alignItems: "flex-start", gap: 12 } as const;
const ROW_LABEL_STYLE = {
  fontSize: 12,
  minWidth: 64,
  paddingTop: 4,
  textAlign: "right" as const,
};
const ROW_CHIPS_STYLE = { flex: 1, minWidth: 0 };
const ROW_CLEAR_STYLE = { padding: 0, height: "auto", lineHeight: "20px" };

function ChipRowImpl<V extends string | number>({
  label,
  options,
  counts,
  selected,
  onToggle,
  onClear,
}: ChipRowProps<V>) {
  // Membership check is O(1) instead of O(N) per chip — matters when
  // the row holds 100+ tag chips.
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  if (options.length === 0) return null;
  return (
    <div style={ROW_STYLE}>
      <Typography.Text type="secondary" style={ROW_LABEL_STYLE}>
        {label}
      </Typography.Text>
      <Space size={[6, 6]} wrap style={ROW_CHIPS_STYLE}>
        {options.map((opt) => (
          <CountedChip
            key={String(opt.value)}
            value={opt.value}
            label={opt.label}
            count={counts.get(opt.value) ?? 0}
            active={selectedSet.has(opt.value)}
            onToggle={onToggle}
          />
        ))}
      </Space>
      {selected.length > 0 && (
        <Button size="small" type="link" onClick={onClear} style={ROW_CLEAR_STYLE}>
          Clear
        </Button>
      )}
    </div>
  );
}

const ChipRow = memo(ChipRowImpl) as typeof ChipRowImpl;

const setKey = (
  filteredInfo: Record<string, FilterValue | null>,
  key: string,
  values: number[],
): Record<string, FilterValue | null> => {
  const next = { ...filteredInfo };
  if (values.length === 0) next[key] = null;
  else next[key] = values as unknown as FilterValue;
  return next;
};

export default function TasksFilterBar({
  avs,
  simulators,
  samplers,
  monitors,
  availableTags,
  filteredInfo,
  setFilteredInfo,
  tagFilter,
  setTagFilter,
  onClearAll,
  hasActiveFilters,
  countsByKey,
}: Props) {
  const avSelected = (filteredInfo.av_id ?? []) as number[];
  const simSelected = (filteredInfo.simulator_id ?? []) as number[];
  const samplerSelected = (filteredInfo.sampler_id ?? []) as number[];
  const monitorSelected = (filteredInfo.monitor_id ?? []) as number[];

  // Stable per-axis toggle handlers. The functional setState lets us
  // not depend on the live filteredInfo, so the callback identity
  // doesn't change every chip click — memoized chips skip re-render.
  const toggleAv = useCallback(
    (v: number) =>
      setFilteredInfo((prev) => {
        const cur = (prev.av_id ?? []) as number[];
        const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
        return setKey(prev, "av_id", next);
      }),
    [setFilteredInfo],
  );
  const toggleSim = useCallback(
    (v: number) =>
      setFilteredInfo((prev) => {
        const cur = (prev.simulator_id ?? []) as number[];
        const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
        return setKey(prev, "simulator_id", next);
      }),
    [setFilteredInfo],
  );
  const toggleSampler = useCallback(
    (v: number) =>
      setFilteredInfo((prev) => {
        const cur = (prev.sampler_id ?? []) as number[];
        const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
        return setKey(prev, "sampler_id", next);
      }),
    [setFilteredInfo],
  );
  const toggleMonitor = useCallback(
    (v: number) =>
      setFilteredInfo((prev) => {
        const cur = (prev.monitor_id ?? []) as number[];
        const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
        return setKey(prev, "monitor_id", next);
      }),
    [setFilteredInfo],
  );
  const toggleTag = useCallback(
    (v: string) => {
      setTagFilter(tagFilter.includes(v) ? tagFilter.filter((x) => x !== v) : [...tagFilter, v]);
    },
    [setTagFilter, tagFilter],
  );

  const clearAv = useCallback(
    () => setFilteredInfo((prev) => setKey(prev, "av_id", [])),
    [setFilteredInfo],
  );
  const clearSim = useCallback(
    () => setFilteredInfo((prev) => setKey(prev, "simulator_id", [])),
    [setFilteredInfo],
  );
  const clearSampler = useCallback(
    () => setFilteredInfo((prev) => setKey(prev, "sampler_id", [])),
    [setFilteredInfo],
  );
  const clearMonitor = useCallback(
    () => setFilteredInfo((prev) => setKey(prev, "monitor_id", [])),
    [setFilteredInfo],
  );
  const clearTag = useCallback(() => setTagFilter([]), [setTagFilter]);

  // Stable option arrays: depend only on the upstream resource list,
  // so the option object identities are referentially stable across
  // chip-click renders. CountedChip's React.memo can then skip
  // re-render on every chip whose label/count/active didn't change.
  const avOptions = useMemo(() => avs.map((a) => ({ label: a.name, value: a.id })), [avs]);
  const simOptions = useMemo(
    () => simulators.map((s) => ({ label: s.name, value: s.id })),
    [simulators],
  );
  const samplerOptions = useMemo(
    () => samplers.map((s) => ({ label: s.name, value: s.id })),
    [samplers],
  );
  const monitorOptions = useMemo(
    () => monitors.map((m) => ({ label: m.name, value: m.id })),
    [monitors],
  );
  const tagOptions = useMemo(
    () => availableTags.map((t) => ({ label: t, value: t })),
    [availableTags],
  );

  const anyChips =
    avs.length > 0 ||
    simulators.length > 0 ||
    samplers.length > 0 ||
    monitors.length > 0 ||
    availableTags.length > 0;
  if (!anyChips) return null;

  return (
    <Space direction="vertical" size={8} style={{ width: "100%" }}>
      <ChipRow
        label="AVs"
        options={avOptions}
        counts={countsByKey.av_id}
        selected={avSelected}
        onToggle={toggleAv}
        onClear={clearAv}
      />
      <ChipRow
        label="Sims"
        options={simOptions}
        counts={countsByKey.simulator_id}
        selected={simSelected}
        onToggle={toggleSim}
        onClear={clearSim}
      />
      <ChipRow
        label="Samplers"
        options={samplerOptions}
        counts={countsByKey.sampler_id}
        selected={samplerSelected}
        onToggle={toggleSampler}
        onClear={clearSampler}
      />
      <ChipRow
        label="Monitors"
        options={monitorOptions}
        counts={countsByKey.monitor_id}
        selected={monitorSelected}
        onToggle={toggleMonitor}
        onClear={clearMonitor}
      />
      <ChipRow
        label="Tags"
        options={tagOptions}
        counts={countsByKey.tag}
        selected={tagFilter}
        onToggle={toggleTag}
        onClear={clearTag}
      />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          size="small"
          type="link"
          onClick={onClearAll}
          disabled={!hasActiveFilters}
          style={{ padding: 0, height: "auto", lineHeight: "20px" }}
        >
          Clear all filters
        </Button>
      </div>
    </Space>
  );
}
