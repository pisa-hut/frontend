import { Card, Col, Row, Statistic } from "antd";
import {
  CheckCircleOutlined,
  SyncOutlined,
  ClockCircleOutlined,
  PlusCircleOutlined,
  WarningOutlined,
  StopOutlined,
} from "@ant-design/icons";
import type { TaskStatus } from "../api/types";
import { TASK_STATUS_HEX, TASK_STATUS_LABEL } from "../constants/status";

const statusIcon: Record<TaskStatus, React.ReactNode> = {
  idle: <PlusCircleOutlined />,
  queued: <ClockCircleOutlined />,
  running: <SyncOutlined spin />,
  completed: <CheckCircleOutlined />,
  invalid: <WarningOutlined />,
  aborted: <StopOutlined />,
};

const DEFAULT_ORDER: TaskStatus[] = [
  "idle",
  "queued",
  "running",
  "completed",
  "invalid",
  "aborted",
];

/** The six task-status count tiles shared by Dashboard and Control.
 *  Clicking a tile calls `onSelect` with that status — each page builds
 *  its own destination (Dashboard folds in its tag scope, Control links
 *  straight to the filtered Tasks view). */
export default function StatusTiles({
  counts,
  order = DEFAULT_ORDER,
  onSelect,
}: {
  counts: Record<TaskStatus, number>;
  order?: TaskStatus[];
  onSelect?: (status: TaskStatus) => void;
}) {
  return (
    <Row gutter={[12, 12]}>
      {order.map((status) => (
        <Col xs={8} sm={8} md={4} key={status}>
          <Card
            hoverable={!!onSelect}
            size="small"
            onClick={onSelect ? () => onSelect(status) : undefined}
            style={{ textAlign: "center", cursor: onSelect ? "pointer" : "default" }}
            styles={{ body: { padding: "12px 8px" } }}
          >
            <Statistic
              title={TASK_STATUS_LABEL[status]}
              value={counts[status]}
              prefix={statusIcon[status]}
              valueStyle={{
                color: TASK_STATUS_HEX[status],
                fontSize: 24,
                fontVariantNumeric: "tabular-nums",
              }}
            />
          </Card>
        </Col>
      ))}
    </Row>
  );
}
