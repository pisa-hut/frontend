import { Button, Modal, Space, message } from "antd";
import {
  CaretRightOutlined,
  InboxOutlined,
  LinkOutlined,
  RollbackOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { api } from "../../api/client";
import { RUNNABLE_TASK_STATUSES } from "../../api/types";
import type { TaskResponse, TaskStatus } from "../../api/types";

const STOPPABLE_STATUSES: TaskStatus[] = ["queued", "running"];

/**
 * Contextual action buttons for a single task — the one home for
 * Run / Stop / Archive / Copy-link. Rendered in both the task detail
 * page header and the task detail drawer so the action set is identical
 * everywhere (the per-row table ⋯ menu was removed in favour of this).
 */
export default function TaskActions({
  task,
  onChanged,
  size,
}: {
  task: TaskResponse;
  /** Called after a successful mutation so the caller can refresh/close. */
  onChanged?: () => void;
  size?: "small" | "middle";
}) {
  const [modal, modalCtx] = Modal.useModal();

  const done = (msg: string) => {
    message.success(msg);
    onChanged?.();
  };
  const fail = (e: unknown) => message.error(String(e));

  const run = () =>
    modal.confirm({
      title: `Run task #${task.id}?`,
      okText: "Run",
      onOk: () =>
        api
          .updateTask(task.id, { task_status: "queued" })
          .then(() => done(`Task #${task.id} queued`))
          .catch(fail),
    });
  const stop = () =>
    modal.confirm({
      title: `Stop task #${task.id}?`,
      okText: "Stop",
      okButtonProps: { danger: true },
      onOk: () =>
        api
          .stopTask(task.id)
          .then(() => done(`Task #${task.id} stopped`))
          .catch(fail),
    });
  const archive = () =>
    modal.confirm({
      title: task.archived ? `Unarchive task #${task.id}?` : `Archive task #${task.id}?`,
      okText: task.archived ? "Unarchive" : "Archive",
      onOk: () =>
        (task.archived ? api.unarchiveTask(task.id) : api.archiveTask(task.id))
          .then(() =>
            done(task.archived ? `Task #${task.id} unarchived` : `Task #${task.id} archived`),
          )
          .catch(fail),
    });
  const copyLink = () => {
    const url = `${window.location.origin}/tasks/${task.id}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(
        () => message.success("Link copied"),
        () => window.prompt("Copy this link:", url),
      );
    } else {
      window.prompt("Copy this link:", url);
    }
  };

  const canRun = RUNNABLE_TASK_STATUSES.includes(task.task_status);
  const canStop = STOPPABLE_STATUSES.includes(task.task_status);

  return (
    <Space size={8}>
      {modalCtx}
      {canStop ? (
        <Button size={size} danger icon={<StopOutlined />} onClick={stop}>
          Stop
        </Button>
      ) : (
        <Button
          size={size}
          type="primary"
          icon={<CaretRightOutlined />}
          disabled={!canRun}
          onClick={run}
        >
          Run
        </Button>
      )}
      <Button
        size={size}
        icon={task.archived ? <RollbackOutlined /> : <InboxOutlined />}
        onClick={archive}
      >
        {task.archived ? "Unarchive" : "Archive"}
      </Button>
      <Button size={size} icon={<LinkOutlined />} onClick={copyLink}>
        Copy link
      </Button>
    </Space>
  );
}
