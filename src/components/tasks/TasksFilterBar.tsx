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

interface ChipRowProps<V extends string | number> {
  label: string;
  options: { label: string; value: V }[];
  counts: Map<V, number>;
  selected: V[];
  onToggle: (v: V) => void;
  onClear: () => void;
}

function CountedChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Tag.CheckableTag
      checked={active}
      onChange={onClick}
      style={{ padding: "2px 10px", fontSize: 12, marginInlineEnd: 0 }}
    >
      {label}
      <span
        style={{
          marginLeft: 6,
          opacity: 0.65,
          fontVariantNumeric: "tabular-nums",
          fontSize: 11,
        }}
      >
        {count}
      </span>
    </Tag.CheckableTag>
  );
}

function ChipRow<V extends string | number>({
  label,
  options,
  counts,
  selected,
  onToggle,
  onClear,
}: ChipRowProps<V>) {
  if (options.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <Typography.Text
        type="secondary"
        style={{ fontSize: 12, minWidth: 64, paddingTop: 4, textAlign: "right" }}
      >
        {label}
      </Typography.Text>
      <Space size={[6, 6]} wrap style={{ flex: 1, minWidth: 0 }}>
        {options.map((opt) => (
          <CountedChip
            key={String(opt.value)}
            label={opt.label}
            count={counts.get(opt.value) ?? 0}
            active={selected.includes(opt.value)}
            onClick={() => onToggle(opt.value)}
          />
        ))}
      </Space>
      {selected.length > 0 && (
        <Button
          size="small"
          type="link"
          onClick={onClear}
          style={{ padding: 0, height: "auto", lineHeight: "20px" }}
        >
          Clear
        </Button>
      )}
    </div>
  );
}

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

const toggle = <V,>(current: V[], v: V): V[] =>
  current.includes(v) ? current.filter((x) => x !== v) : [...current, v];

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

  const numericToggle = (key: string, current: number[]) => (v: number) => {
    setFilteredInfo(setKey(filteredInfo, key, toggle(current, v)));
  };
  const numericClear = (key: string) => () => {
    setFilteredInfo(setKey(filteredInfo, key, []));
  };
  const tagToggle = (v: string) => setTagFilter(toggle(tagFilter, v));

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
        options={avs.map((a) => ({ label: a.name, value: a.id }))}
        counts={countsByKey.av_id}
        selected={avSelected}
        onToggle={numericToggle("av_id", avSelected)}
        onClear={numericClear("av_id")}
      />
      <ChipRow
        label="Sims"
        options={simulators.map((s) => ({ label: s.name, value: s.id }))}
        counts={countsByKey.simulator_id}
        selected={simSelected}
        onToggle={numericToggle("simulator_id", simSelected)}
        onClear={numericClear("simulator_id")}
      />
      <ChipRow
        label="Samplers"
        options={samplers.map((s) => ({ label: s.name, value: s.id }))}
        counts={countsByKey.sampler_id}
        selected={samplerSelected}
        onToggle={numericToggle("sampler_id", samplerSelected)}
        onClear={numericClear("sampler_id")}
      />
      <ChipRow
        label="Monitors"
        options={monitors.map((m) => ({ label: m.name, value: m.id }))}
        counts={countsByKey.monitor_id}
        selected={monitorSelected}
        onToggle={numericToggle("monitor_id", monitorSelected)}
        onClear={numericClear("monitor_id")}
      />
      <ChipRow
        label="Tags"
        options={availableTags.map((t) => ({ label: t, value: t }))}
        counts={countsByKey.tag}
        selected={tagFilter}
        onToggle={tagToggle}
        onClear={() => setTagFilter([])}
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
