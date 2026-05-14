import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Form,
  Input,
  Modal,
  Progress,
  Row,
  Select,
  Statistic,
  Table,
  Typography,
  message,
} from "antd";
import { api } from "../../api/client";
import type {
  AvResponse,
  MonitorResponse,
  PlanResponse,
  SamplerResponse,
  SimulatorResponse,
  TaskResponse,
} from "../../api/types";

interface BulkProgress {
  total: number;
  done: number;
  errors: number;
}

interface BulkFormValues {
  av_ids: number[];
  simulator_ids: number[];
  sampler_ids: number[];
  /** Required since the manager m20260513 migration. Every other
   *  combo is multiplied by these monitor ids. */
  monitor_ids: number[];
  plan_ids?: number[];
  plan_filter?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called once after a successful (or partially successful) batch
   *  create so the parent page can refresh its task list. */
  onCreated: () => void;
  avs: AvResponse[];
  simulators: SimulatorResponse[];
  samplers: SamplerResponse[];
  monitors: MonitorResponse[];
  plans: PlanResponse[];
}

/** Bulk-create modal. The "single create" UX is the N=1 case of this
 *  modal — all the Selects are `mode="multiple"` so picking exactly
 *  one of each creates one task. The Cartesian product ofav x sim x
 *  sampler x plan is shown as a live preview count + a confirmation
 *  checkbox so the user can't accidentally launch 50k tasks.
 *
 *  Owns its own form state, preview state, progress state, and the
 *  confirm checkbox — the parent page only manages `open` and gets
 *  notified via `onCreated` to reload the task list. */
export default function CreateTaskModal({
  open,
  onClose,
  onCreated,
  avs,
  simulators,
  samplers,
  monitors,
  plans,
}: Props) {
  const [form] = Form.useForm();
  const [creating, setCreating] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [previewCount, setPreviewCount] = useState(0);
  const [filteredPlans, setFilteredPlans] = useState<PlanResponse[]>([]);
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null);

  const computeFilteredPlans = (): PlanResponse[] => {
    const v = form.getFieldsValue() as BulkFormValues;
    if (v.plan_ids?.length) return plans.filter((p) => v.plan_ids!.includes(p.id));
    if (v.plan_filter) {
      const f = v.plan_filter.toLowerCase();
      return plans.filter((p) => p.name.toLowerCase().includes(f));
    }
    return plans;
  };

  const updatePreview = () => {
    const v = form.getFieldsValue() as BulkFormValues;
    const matched = computeFilteredPlans();
    setFilteredPlans(matched);
    setPreviewCount(
      (v.av_ids?.length || 0) *
        (v.simulator_ids?.length || 0) *
        (v.sampler_ids?.length || 0) *
        (v.monitor_ids?.length || 0) *
        matched.length,
    );
    setConfirmed(false);
  };

  const handleClose = () => {
    if (creating) return;
    onClose();
    setBulkProgress(null);
  };

  const handleSubmit = async (values: BulkFormValues) => {
    const selectedPlans = values.plan_ids?.length
      ? values.plan_ids
      : plans
          .filter((p) =>
            values.plan_filter
              ? p.name.toLowerCase().includes(values.plan_filter.toLowerCase())
              : true,
          )
          .map((p) => p.id);
    const combos: Partial<TaskResponse>[] = [];
    for (const av_id of values.av_ids) {
      for (const simulator_id of values.simulator_ids) {
        for (const sampler_id of values.sampler_ids) {
          for (const monitor_id of values.monitor_ids) {
            for (const plan_id of selectedPlans) {
              combos.push({
                plan_id,
                av_id,
                simulator_id,
                sampler_id,
                monitor_id,
                task_status: "idle",
              });
            }
          }
        }
      }
    }
    if (!combos.length) {
      message.warning("No combinations");
      return;
    }
    setCreating(true);
    setBulkProgress({ total: combos.length, done: 0, errors: 0 });
    try {
      const { done, errors } = await api.batchCreateTasks(combos, (d, e, t) =>
        setBulkProgress({ total: t, done: d, errors: e }),
      );
      if (errors === 0) {
        message.success(`Created ${done} tasks`);
      } else {
        message.warning(`Created ${done}, ${errors} failed`);
      }
    } catch (e) {
      message.error(String(e));
    } finally {
      setCreating(false);
      onClose();
      form.resetFields();
      setBulkProgress(null);
      onCreated();
    }
  };

  return (
    <Modal title="Bulk Create Tasks" open={open} onCancel={handleClose} footer={null} width={640}>
      <Typography.Paragraph type="secondary">
        Creates tasks for every combination of selected AVs, Simulators, Samplers, and Plans.
      </Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={handleSubmit} onValuesChange={updatePreview}>
        <Form.Item name="av_ids" label="AVs" rules={[{ required: true }]}>
          <Select
            mode="multiple"
            options={avs.map((a) => ({ label: a.name, value: a.id }))}
            placeholder="Select AVs"
          />
        </Form.Item>
        <Form.Item name="simulator_ids" label="Simulators" rules={[{ required: true }]}>
          <Select
            mode="multiple"
            options={simulators.map((s) => ({ label: s.name, value: s.id }))}
            placeholder="Select Simulators"
          />
        </Form.Item>
        <Form.Item name="sampler_ids" label="Samplers" rules={[{ required: true }]}>
          <Select
            mode="multiple"
            options={samplers.map((s) => ({ label: s.name, value: s.id }))}
            placeholder="Select Samplers"
          />
        </Form.Item>
        <Form.Item name="monitor_ids" label="Monitors" rules={[{ required: true }]}>
          <Select
            mode="multiple"
            options={monitors.map((m) => ({ label: m.name, value: m.id }))}
            placeholder="Select Monitors"
          />
        </Form.Item>
        <Form.Item name="plan_filter" label="Plan name filter">
          <Input placeholder="e.g. tyms, route" allowClear />
        </Form.Item>
        <Form.Item name="plan_ids" label="Plans (leave empty for all matching)">
          <Select
            mode="multiple"
            options={plans.map((p) => ({ label: `${p.name} (#${p.id})`, value: p.id }))}
            showSearch
            optionFilterProp="label"
            placeholder="All plans"
            maxTagCount={5}
          />
        </Form.Item>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Card size="small">
              <Statistic title="Matched" value={filteredPlans.length} />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small">
              <Statistic title="Total plans" value={plans.length} />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small">
              <Statistic title="Tasks" value={previewCount} />
            </Card>
          </Col>
        </Row>
        {filteredPlans.length > 0 && (
          <Table
            dataSource={filteredPlans}
            columns={[
              { title: "ID", dataIndex: "id", key: "id", width: 60 },
              { title: "Name", dataIndex: "name", key: "name", ellipsis: true },
              { title: "Map", dataIndex: "map_id", key: "map_id", width: 60 },
            ]}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 5, size: "small" }}
            style={{ marginBottom: 16 }}
          />
        )}
        {bulkProgress && (
          <div style={{ marginBottom: 16 }}>
            <Progress
              percent={Math.round((bulkProgress.done / bulkProgress.total) * 100)}
              status={bulkProgress.errors > 0 ? "exception" : "active"}
            />
            <Typography.Text>
              {bulkProgress.done}/{bulkProgress.total}
              {bulkProgress.errors > 0 && (
                <Typography.Text type="danger"> ({bulkProgress.errors} errors)</Typography.Text>
              )}
            </Typography.Text>
          </div>
        )}
        {previewCount > 5000 && (
          <Alert
            type="warning"
            message={`This will create ${previewCount.toLocaleString()} tasks.`}
            style={{ marginBottom: 16 }}
          />
        )}
        <Form.Item style={{ marginBottom: 8 }}>
          <Checkbox
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={!previewCount}
          >
            I confirm creating {previewCount.toLocaleString()} tasks
          </Checkbox>
        </Form.Item>
        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={creating}
            block
            disabled={!previewCount || !confirmed}
          >
            Create {previewCount.toLocaleString()} Tasks
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
}
