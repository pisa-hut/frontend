import { memo, useMemo } from "react";
import { Button, Space, Tag, Typography } from "antd";

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
export default ChipRow;
export { CHIP_STYLE };
