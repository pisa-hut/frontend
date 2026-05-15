import { Button, Card, Select, Space, Typography } from "antd";
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
}: Props) {
  const avValue = (filteredInfo.av_id ?? []) as number[];
  const simValue = (filteredInfo.simulator_id ?? []) as number[];
  const samplerValue = (filteredInfo.sampler_id ?? []) as number[];
  const monitorValue = (filteredInfo.monitor_id ?? []) as number[];

  const labelStyle = { width: 70, fontSize: 12, color: "var(--ant-color-text-secondary)" };
  const selectStyle = { flex: 1, minWidth: 200 };

  return (
    <Card size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: "8px 12px" } }}>
      <Space direction="vertical" size={6} style={{ width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Typography.Text style={labelStyle}>AVs</Typography.Text>
          <Select
            mode="multiple"
            allowClear
            placeholder="All AVs"
            value={avValue}
            onChange={(v) => setFilteredInfo(setKey(filteredInfo, "av_id", v))}
            options={avs.map((a) => ({ label: a.name, value: a.id }))}
            maxTagCount="responsive"
            style={selectStyle}
            size="small"
          />
          <Typography.Text style={{ ...labelStyle, width: 70 }}>Sims</Typography.Text>
          <Select
            mode="multiple"
            allowClear
            placeholder="All simulators"
            value={simValue}
            onChange={(v) => setFilteredInfo(setKey(filteredInfo, "simulator_id", v))}
            options={simulators.map((s) => ({ label: s.name, value: s.id }))}
            maxTagCount="responsive"
            style={selectStyle}
            size="small"
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Typography.Text style={labelStyle}>Samplers</Typography.Text>
          <Select
            mode="multiple"
            allowClear
            placeholder="All samplers"
            value={samplerValue}
            onChange={(v) => setFilteredInfo(setKey(filteredInfo, "sampler_id", v))}
            options={samplers.map((s) => ({ label: s.name, value: s.id }))}
            maxTagCount="responsive"
            style={selectStyle}
            size="small"
          />
          <Typography.Text style={labelStyle}>Monitors</Typography.Text>
          <Select
            mode="multiple"
            allowClear
            placeholder="All monitors"
            value={monitorValue}
            onChange={(v) => setFilteredInfo(setKey(filteredInfo, "monitor_id", v))}
            options={monitors.map((m) => ({ label: m.name, value: m.id }))}
            maxTagCount="responsive"
            style={selectStyle}
            size="small"
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Typography.Text style={labelStyle}>Tags</Typography.Text>
          <Select
            mode="multiple"
            allowClear
            showSearch
            placeholder="All tags"
            value={tagFilter}
            onChange={setTagFilter}
            options={availableTags.map((t) => ({ label: t, value: t }))}
            maxTagCount="responsive"
            style={selectStyle}
            size="small"
            optionFilterProp="label"
          />
          <Button
            size="small"
            type="link"
            onClick={onClearAll}
            disabled={!hasActiveFilters}
            style={{ marginLeft: "auto" }}
          >
            Clear all filters
          </Button>
        </div>
      </Space>
    </Card>
  );
}
