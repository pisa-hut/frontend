import { Space, Typography } from "antd";
import type { TaskStatus } from "../api/types";
import { TASK_STATUS_HEX, TASK_STATUS_LABEL } from "../constants/status";

const STATUS_ORDER: TaskStatus[] = [
  "completed",
  "running",
  "queued",
  "idle",
  "invalid",
  "aborted",
];

/** Colour key shown alongside the donut breakdowns. */
export function StatusLegend() {
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
export function StatusDonut({
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
