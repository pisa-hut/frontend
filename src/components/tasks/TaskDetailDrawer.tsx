import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Drawer } from "antd";
import { ExportOutlined } from "@ant-design/icons";
import TaskDetailBody from "./TaskDetailBody";
import { useTaskDetail } from "./useTaskDetail";
import TaskActions from "./TaskActions";
import type { ExecutorResponse, TaskRunResponse } from "../../api/types";

const LogView = lazy(() => import("../LogView"));

function TaskDetailDrawerInner({ taskId, onChanged }: { taskId: number; onChanged?: () => void }) {
  const detail = useTaskDetail(taskId);
  const [logRun, setLogRun] = useState<TaskRunResponse | null>(null);
  const [logExecutor, setLogExecutor] = useState<ExecutorResponse | undefined>();

  // Log opens as an inline swap-view (back button) rather than a second
  // drawer over this one.
  if (logRun) {
    return (
      <Suspense fallback={null}>
        <LogView
          run={logRun}
          executor={logExecutor}
          task={detail.task ?? undefined}
          taskLabel={
            detail.task
              ? (detail.names.plans.get(detail.task.plan_id) ?? `#${detail.task.plan_id}`)
              : undefined
          }
          onClose={() => setLogRun(null)}
        />
      </Suspense>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 24 }}>
      {detail.task ? (
        <>
          {/* The single home for Run/Stop/Archive on the detail surface
              (the per-row table ⋯ menu was removed). */}
          <div style={{ marginBottom: 16 }}>
            <TaskActions
              task={detail.task}
              onChanged={() => {
                detail.reload();
                onChanged?.();
              }}
            />
          </div>
          <TaskDetailBody
            detail={detail}
            onOpenLog={(run, executor) => {
              setLogRun(run);
              setLogExecutor(executor);
            }}
          />
        </>
      ) : (
        <Alert
          type={detail.loading ? "info" : "warning"}
          message={detail.loading ? "Loading task…" : `Task #${taskId} not found`}
        />
      )}
    </div>
  );
}

/** In-table task detail: clicking a row slides this in instead of a
 *  full-page navigation. Renders the same body + actions as the
 *  /tasks/:id page (linked via "Open page"); the log opens inline. */
export default function TaskDetailDrawer({
  taskId,
  onClose,
  onChanged,
}: {
  taskId: number | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  return (
    <Drawer
      title={taskId != null ? `Task #${taskId}` : ""}
      placement="right"
      width="min(960px, 94vw)"
      open={taskId != null}
      onClose={onClose}
      destroyOnHidden
      styles={{ body: { padding: 0, display: "flex", flexDirection: "column" } }}
      extra={
        taskId != null ? (
          <Link to={`/tasks/${taskId}`}>
            <Button icon={<ExportOutlined />}>Open page</Button>
          </Link>
        ) : null
      }
    >
      {taskId != null && (
        <TaskDetailDrawerInner key={taskId} taskId={taskId} onChanged={onChanged} />
      )}
    </Drawer>
  );
}
