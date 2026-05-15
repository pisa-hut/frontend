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
  setFilteredInfo: (next: Record<string, FilterValue | null>) => void;
  tagFilter: string[];
  setTagFilter: (next: string[]) => void;
  onClearAll: () => void;
  hasActiveFilters: boolean;
}

interface ChipRowProps<V extends string | number> {
  label: string;
  options: { label: string; value: V }[];
  selected: V[];
  onToggle: (v: V) => void;
  onClear: () => void;
}

function ChipRow<V extends string | number>({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: ChipRowProps<V>) {
  if (options.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
      <Typography.Text type="secondary" style={{ fontSize: 12, minWidth: 64, textAlign: "right" }}>
        {label}
      </Typography.Text>
      <Space size={[4, 4]} wrap style={{ flex: 1 }}>
        {options.map((opt) => (
          <Tag.CheckableTag
            key={String(opt.value)}
            checked={selected.includes(opt.value)}
            onChange={() => onToggle(opt.value)}
          >
            {opt.label}
          </Tag.CheckableTag>
        ))}
      </Space>
      {selected.length > 0 && (
        <Button size="small" type="link" onClick={onClear} style={{ padding: 0 }}>
          Clear
        </Button>
      )}
    </div>
  );
}

const updateKey = (
  filteredInfo: Record<string, FilterValue | null>,
  key: string,
  values: number[],
): Record<string, FilterValue | null> => {
  const next = { ...filteredInfo };
  if (values.length === 0) next[key] = null;
  else next[key] = values as unknown as FilterValue;
  return next;
};

const toggleNumeric = (current: number[], v: number): number[] =>
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
}: Props) {
  const avSelected = (filteredInfo.av_id ?? []) as number[];
  const simSelected = (filteredInfo.simulator_id ?? []) as number[];
  const samplerSelected = (filteredInfo.sampler_id ?? []) as number[];
  const monitorSelected = (filteredInfo.monitor_id ?? []) as number[];

  const onNumericToggle =
    (key: string, current: number[]) =>
    (v: number): void => {
      setFilteredInfo(updateKey(filteredInfo, key, toggleNumeric(current, v)));
    };
  const onNumericClear = (key: string) => (): void => {
    setFilteredInfo(updateKey(filteredInfo, key, []));
  };
  const onTagToggle = (v: string): void => {
    setTagFilter(tagFilter.includes(v) ? tagFilter.filter((t) => t !== v) : [...tagFilter, v]);
  };

  const anyChips =
    avs.length > 0 ||
    simulators.length > 0 ||
    samplers.length > 0 ||
    monitors.length > 0 ||
    availableTags.length > 0;
  if (!anyChips) return null;

  return (
    <Space direction="vertical" size={6} style={{ width: "100%" }}>
      <ChipRow
        label="AVs"
        options={avs.map((a) => ({ label: a.name, value: a.id }))}
        selected={avSelected}
        onToggle={onNumericToggle("av_id", avSelected)}
        onClear={onNumericClear("av_id")}
      />
      <ChipRow
        label="Sims"
        options={simulators.map((s) => ({ label: s.name, value: s.id }))}
        selected={simSelected}
        onToggle={onNumericToggle("simulator_id", simSelected)}
        onClear={onNumericClear("simulator_id")}
      />
      <ChipRow
        label="Samplers"
        options={samplers.map((s) => ({ label: s.name, value: s.id }))}
        selected={samplerSelected}
        onToggle={onNumericToggle("sampler_id", samplerSelected)}
        onClear={onNumericClear("sampler_id")}
      />
      <ChipRow
        label="Monitors"
        options={monitors.map((m) => ({ label: m.name, value: m.id }))}
        selected={monitorSelected}
        onToggle={onNumericToggle("monitor_id", monitorSelected)}
        onClear={onNumericClear("monitor_id")}
      />
      <ChipRow
        label="Tags"
        options={availableTags.map((t) => ({ label: t, value: t }))}
        selected={tagFilter}
        onToggle={onTagToggle}
        onClear={() => setTagFilter([])}
      />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button size="small" type="link" onClick={onClearAll} disabled={!hasActiveFilters}>
          Clear all filters
        </Button>
      </div>
    </Space>
  );
}
