import { Affix, Button, Popconfirm, Space, Typography } from "antd";
import {
  CaretRightOutlined,
  DeleteOutlined,
  InboxOutlined,
  StopOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import type { TaskResponse, TaskStatus } from "../../api/types";
import { RUNNABLE_TASK_STATUSES } from "../../api/types";

const STOPPABLE_STATUSES: TaskStatus[] = ["queued", "running"];

interface Props {
  /** All tasks (used to compute counts of selected items by status). */
  tasks: TaskResponse[];
  /** Tasks visible after the current quick-filter + column filters
   *  apply. Used by "Select all N filtered" so the user can act on a
   *  scope spanning multiple pages without paginating through them. */
  visibleTasks: TaskResponse[];
  selectedRowKeys: React.Key[];
  setSelectedRowKeys: (keys: React.Key[]) => void;
  onBulkRun: () => void;
  onBulkStop: () => void;
  onBulkArchive: () => void;
  onBulkUnarchive: () => void;
  onBulkDelete: () => void;
}

/** Affix-pinned bottom bar that appears when at least one task is
 *  selected. Shows the selection count, "Select all filtered" /
 *  "Deselect all" toggle, and bulk-action buttons (Run / Stop /
 *  Archive / Unarchive / Delete) gated by which actions are valid
 *  for the currently selected statuses.
 *
 *  Returns `null` when nothing is selected — the bar's existence is
 *  itself part of the visual feedback for "you're in selection mode".
 */
export default function TasksSelectionBar({
  tasks,
  visibleTasks,
  selectedRowKeys,
  setSelectedRowKeys,
  onBulkRun,
  onBulkStop,
  onBulkArchive,
  onBulkUnarchive,
  onBulkDelete,
}: Props) {
  if (selectedRowKeys.length === 0) return null;

  const selected = tasks.filter((t) => selectedRowKeys.includes(t.id));
  const visibleIds = visibleTasks.map((t) => t.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedRowKeys.includes(id));
  const runnableCount = selected.filter((t) =>
    RUNNABLE_TASK_STATUSES.includes(t.task_status),
  ).length;
  const stoppableCount = selected.filter((t) => STOPPABLE_STATUSES.includes(t.task_status)).length;
  const archivableCount = selected.filter((t) => !t.archived).length;
  const unarchivableCount = selected.filter((t) => t.archived).length;

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
          {!allVisibleSelected ? (
            <Button
              size="small"
              type="link"
              style={{ padding: 0 }}
              onClick={() => setSelectedRowKeys(visibleIds)}
            >
              Select all {visibleIds.length} filtered
            </Button>
          ) : (
            <Button
              size="small"
              type="link"
              style={{ padding: 0 }}
              onClick={() => setSelectedRowKeys([])}
            >
              Deselect all
            </Button>
          )}
        </Space>
        <Space>
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
          {archivableCount > 0 && (
            <Popconfirm title={`Archive ${archivableCount}?`} onConfirm={onBulkArchive}>
              <Button size="small" icon={<InboxOutlined />}>
                Archive {archivableCount}
              </Button>
            </Popconfirm>
          )}
          {unarchivableCount > 0 && (
            <Popconfirm title={`Unarchive ${unarchivableCount}?`} onConfirm={onBulkUnarchive}>
              <Button size="small" icon={<UndoOutlined />}>
                Unarchive {unarchivableCount}
              </Button>
            </Popconfirm>
          )}
          <Popconfirm title={`Delete ${selectedRowKeys.length}?`} onConfirm={onBulkDelete}>
            <Button size="small" danger icon={<DeleteOutlined />}>
              Delete {selectedRowKeys.length}
            </Button>
          </Popconfirm>
          <Button size="small" onClick={() => setSelectedRowKeys([])}>
            Clear
          </Button>
        </Space>
      </div>
    </Affix>
  );
}
