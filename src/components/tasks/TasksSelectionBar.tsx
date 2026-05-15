import { Affix, Button, Popconfirm, Space, Typography } from "antd";
import { CaretRightOutlined, DeleteOutlined, StopOutlined } from "@ant-design/icons";
import type { TaskStatus } from "../../api/types";
import { RUNNABLE_TASK_STATUSES } from "../../api/types";

const STOPPABLE_STATUSES: TaskStatus[] = ["queued", "running"];

interface Props {
  /** id → status lookup over the full filtered set. The selection
   *  bar uses it to compute Run/Stop counts even when selected rows
   *  span pages the table isn't currently rendering. */
  statusById: Map<number, TaskStatus>;
  /** IDs that match the current chip filter set (across all pages),
   *  used by "Select all N filtered". */
  visibleIds: number[];
  selectedRowKeys: React.Key[];
  setSelectedRowKeys: (keys: React.Key[]) => void;
  onBulkRun: () => void;
  onBulkStop: () => void;
  onBulkDelete: () => void;
}

export default function TasksSelectionBar({
  statusById,
  visibleIds,
  selectedRowKeys,
  setSelectedRowKeys,
  onBulkRun,
  onBulkStop,
  onBulkDelete,
}: Props) {
  if (selectedRowKeys.length === 0) return null;

  const selectedSet = new Set(selectedRowKeys.map(Number));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
  let runnableCount = 0;
  let stoppableCount = 0;
  for (const id of selectedSet) {
    const st = statusById.get(id);
    if (st == null) continue;
    if (RUNNABLE_TASK_STATUSES.includes(st)) runnableCount++;
    if (STOPPABLE_STATUSES.includes(st)) stoppableCount++;
  }

  return (
    <Affix
      offsetBottom={12}
      style={{ position: "fixed", left: 16, right: 16, bottom: 12, zIndex: 50 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          padding: "10px 14px",
          borderRadius: 10,
          background: "var(--ant-color-bg-elevated, rgba(255,255,255,0.97))",
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          border: "1px solid var(--ant-color-border-secondary, rgba(0,0,0,0.08))",
          backdropFilter: "blur(6px)",
        }}
      >
        <Space size={10}>
          <Typography.Text strong>{selectedRowKeys.length} selected</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {!allVisibleSelected ? `of ${visibleIds.length} filtered` : `(all filtered selected)`}
          </Typography.Text>
          {!allVisibleSelected ? (
            <Button
              size="small"
              type="link"
              style={{ padding: 0 }}
              onClick={() => setSelectedRowKeys(visibleIds)}
            >
              Select all
            </Button>
          ) : (
            <Button
              size="small"
              type="link"
              style={{ padding: 0 }}
              onClick={() => setSelectedRowKeys([])}
            >
              Deselect
            </Button>
          )}
        </Space>
        <Space size={6}>
          {runnableCount > 0 && (
            <Popconfirm title={`Run ${runnableCount}?`} onConfirm={onBulkRun}>
              <Button size="small" type="primary" icon={<CaretRightOutlined />}>
                Run {runnableCount}
              </Button>
            </Popconfirm>
          )}
          {stoppableCount > 0 && (
            <Popconfirm title={`Stop ${stoppableCount}?`} onConfirm={onBulkStop}>
              <Button size="small" icon={<StopOutlined />}>
                Stop {stoppableCount}
              </Button>
            </Popconfirm>
          )}
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: 1,
              height: 20,
              background: "var(--ant-color-border-secondary, rgba(0,0,0,0.08))",
              margin: "0 2px",
            }}
          />
          <Popconfirm title={`Delete ${selectedRowKeys.length}?`} onConfirm={onBulkDelete}>
            <Button size="small" danger icon={<DeleteOutlined />}>
              Delete {selectedRowKeys.length}
            </Button>
          </Popconfirm>
        </Space>
      </div>
    </Affix>
  );
}
