import { lazy, Suspense, useState } from "react";
import { Button, Card, Col, Descriptions, Row, Space, Tag, Typography } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import type { ExecutorResponse, TaskRunResponse } from "../../api/types";
import { TASK_STATUS_LABEL, TASK_STATUS_TAG_COLOR } from "../../constants/status";
import type { TaskDetailData } from "./useTaskDetail";

const TaskRunsPanel = lazy(() => import("../TaskRunsPanel"));
const ScenarioDetailDrawer = lazy(() => import("../ScenarioDetailDrawer"));
const ConcreteRunsTable = lazy(() => import("./ConcreteRunsTable"));

/** Presentational detail body: setup descriptions, concrete-count cards,
 *  the attempts list, and the (server-paginated) concrete-runs table. The
 *  action buttons and the log view are owned by the parent surface. */
export default function TaskDetailBody({
  detail,
  onOpenLog,
}: {
  detail: TaskDetailData;
  onOpenLog: (run: TaskRunResponse, executor?: ExecutorResponse) => void;
}) {
  const { task, names, currentPlan, counts } = detail;
  const [scenarioOpen, setScenarioOpen] = useState(false);

  if (!task) return null;

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card>
        <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="small">
          <Descriptions.Item label="Status">
            <Tag color={TASK_STATUS_TAG_COLOR[task.task_status]}>
              {TASK_STATUS_LABEL[task.task_status]}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Plan">
            {names.plans.get(task.plan_id) ?? `#${task.plan_id}`}
          </Descriptions.Item>
          <Descriptions.Item label="Plan Tags">
            {(currentPlan?.tags ?? []).length === 0 ? (
              <Typography.Text type="secondary">untagged</Typography.Text>
            ) : (
              <Space size={4} wrap>
                {(currentPlan?.tags ?? []).map((tag) => (
                  <Tag key={tag} style={{ marginInlineEnd: 0 }}>
                    {tag}
                  </Tag>
                ))}
              </Space>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Scenario">
            <Space size={8} wrap>
              <Typography.Text>{currentPlan ? `#${currentPlan.scenario_id}` : "-"}</Typography.Text>
              <Button
                size="small"
                icon={<EyeOutlined />}
                disabled={!currentPlan}
                onClick={() => setScenarioOpen(true)}
              >
                Preview
              </Button>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="AV">{names.avs.get(task.av_id) ?? `#${task.av_id}`}</Descriptions.Item>
          <Descriptions.Item label="Simulator">
            {names.simulators.get(task.simulator_id) ?? `#${task.simulator_id}`}
          </Descriptions.Item>
          <Descriptions.Item label="Sampler">
            {names.samplers.get(task.sampler_id) ?? `#${task.sampler_id}`}
          </Descriptions.Item>
          <Descriptions.Item label="Monitor">
            {names.monitors.get(task.monitor_id) ?? `#${task.monitor_id}`}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={[16, 16]}>
        {Object.entries(counts).map(([status, count]) => (
          <Col xs={12} md={6} key={status}>
            <Card size="small">
              <Typography.Text type="secondary">{status}</Typography.Text>
              <Typography.Title level={3} style={{ margin: 0 }}>
                {count}
              </Typography.Title>
            </Card>
          </Col>
        ))}
      </Row>

      <Card title="Attempts" styles={{ body: { padding: 0 } }}>
        <Suspense fallback={null}>
          <TaskRunsPanel taskId={task.id} onOpenLog={onOpenLog} />
        </Suspense>
      </Card>

      <Card title="Concrete Runs">
        <Suspense fallback={null}>
          <ConcreteRunsTable taskId={task.id} />
        </Suspense>
      </Card>

      <Suspense fallback={null}>
        <ScenarioDetailDrawer
          open={scenarioOpen}
          scenarioId={currentPlan?.scenario_id ?? null}
          title={currentPlan ? `Scenario #${currentPlan.scenario_id}` : "Scenario"}
          onClose={() => setScenarioOpen(false)}
        />
      </Suspense>
    </Space>
  );
}
