import { lazy, Suspense, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert, Button } from "antd";
import { ArrowLeftOutlined, ReloadOutlined } from "@ant-design/icons";
import PageHeader from "../components/PageHeader";
import TaskDetailBody from "../components/tasks/TaskDetailBody";
import { useTaskDetail } from "../components/tasks/useTaskDetail";
import TaskActions from "../components/tasks/TaskActions";
import type { ExecutorResponse, TaskRunResponse } from "../api/types";

const LogDrawer = lazy(() => import("../components/LogDrawer"));

export default function TaskDetail() {
  const taskId = Number(useParams().taskId);
  const detail = useTaskDetail(taskId);
  const [logRun, setLogRun] = useState<TaskRunResponse | null>(null);
  const [logExecutor, setLogExecutor] = useState<ExecutorResponse | undefined>();

  if (!Number.isFinite(taskId)) {
    return <Alert type="error" message="Invalid task id" />;
  }

  return (
    <div>
      <PageHeader title={`Task #${taskId}`}>
        {detail.task && <TaskActions task={detail.task} onChanged={detail.reload} />}
        <Link to="/tasks">
          <Button icon={<ArrowLeftOutlined />}>Tasks</Button>
        </Link>
        <Button icon={<ReloadOutlined />} onClick={detail.reload} loading={detail.loading}>
          Refresh
        </Button>
      </PageHeader>

      {detail.task ? (
        <TaskDetailBody
          detail={detail}
          onOpenLog={(run, executor) => {
            setLogRun(run);
            setLogExecutor(executor);
          }}
        />
      ) : (
        <Alert
          type="warning"
          message={detail.loading ? "Loading task..." : `Task #${taskId} not found`}
        />
      )}

      <Suspense fallback={null}>
        <LogDrawer
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
    </div>
  );
}
