import { useMemo } from "react";
import { Card, Col, Empty, Row, Space, Tag, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import type { TaskResponse, TaskStatus } from "../api/types";
import { StatusDonut, StatusLegend } from "./StatusDonut";

const DONUT_LIMIT = 8;

type SetupBucket = {
  key: string;
  avId: number;
  simId: number;
  samplerId: number;
  counts: Record<TaskStatus, number>;
  total: number;
};

/** Per-tag completion breakdown: groups every task by its plan's tag(s),
 *  then by AV·Sim·Sampler setup, and renders a status donut per setup.
 *  Lives on the Plans page (tags are managed here). */
export default function PlanStatusBreakdown({
  tasks,
  planTagsMap,
  avMap,
  simMap,
  samplerMap,
}: {
  tasks: TaskResponse[];
  planTagsMap: Map<number, string[]>;
  avMap: Map<number, string>;
  simMap: Map<number, string>;
  samplerMap: Map<number, string>;
}) {
  const navigate = useNavigate();

  const tagGroups = useMemo(() => {
    const byTag = new Map<string, Map<string, SetupBucket>>();
    for (const t of tasks) {
      const tags = planTagsMap.get(t.plan_id) ?? [];
      const tagsForBucket = tags.length > 0 ? tags : ["(untagged)"];
      for (const tag of tagsForBucket) {
        let setups = byTag.get(tag);
        if (!setups) {
          setups = new Map();
          byTag.set(tag, setups);
        }
        const setupKey = `${t.av_id}-${t.simulator_id}-${t.sampler_id}`;
        let bucket = setups.get(setupKey);
        if (!bucket) {
          bucket = {
            key: setupKey,
            avId: t.av_id,
            simId: t.simulator_id,
            samplerId: t.sampler_id,
            counts: { idle: 0, queued: 0, running: 0, completed: 0, invalid: 0, aborted: 0 },
            total: 0,
          };
          setups.set(setupKey, bucket);
        }
        bucket.counts[t.task_status]++;
        bucket.total++;
      }
    }
    return [...byTag.entries()]
      .map(([tag, setups]) => {
        const buckets = [...setups.values()].sort((a, b) => b.total - a.total);
        const total = buckets.reduce((sum, b) => sum + b.total, 0);
        return { tag, buckets, total };
      })
      .sort((a, b) => {
        if (a.tag === "(untagged)" && b.tag !== "(untagged)") return 1;
        if (b.tag === "(untagged)" && a.tag !== "(untagged)") return -1;
        return b.total - a.total;
      });
  }, [tasks, planTagsMap]);

  return (
    <Card
      size="small"
      style={{ marginTop: 12 }}
      title={
        <Space size={8}>
          <Typography.Text strong>Status by plan group</Typography.Text>
          <Tag>
            {tagGroups.length} group{tagGroups.length === 1 ? "" : "s"}
          </Tag>
        </Space>
      }
      extra={<StatusLegend />}
    >
      {tagGroups.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No plan tags yet — set them above or at upload."
        />
      ) : (
        <Space direction="vertical" size={20} style={{ width: "100%" }}>
          {tagGroups.map((group) => {
            const visibleBuckets = group.buckets.slice(0, DONUT_LIMIT);
            const hiddenBuckets = Math.max(0, group.buckets.length - DONUT_LIMIT);
            return (
              <div key={group.tag}>
                <Space size={8} style={{ marginBottom: 12 }}>
                  {group.tag === "(untagged)" ? (
                    <Tag color="default">{group.tag}</Tag>
                  ) : (
                    <Tag
                      color="blue"
                      style={{ cursor: "pointer" }}
                      onClick={() => navigate(`/tasks?tag=${encodeURIComponent(group.tag)}`)}
                    >
                      {group.tag}
                    </Tag>
                  )}
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {group.total} task{group.total === 1 ? "" : "s"} · {group.buckets.length} setup
                    {group.buckets.length === 1 ? "" : "s"}
                  </Typography.Text>
                </Space>
                <Row gutter={[12, 16]}>
                  {visibleBuckets.map((b) => {
                    const av = avMap.get(b.avId) ?? `#${b.avId}`;
                    const sim = simMap.get(b.simId) ?? `#${b.simId}`;
                    const sampler = samplerMap.get(b.samplerId) ?? `#${b.samplerId}`;
                    const params = new URLSearchParams({
                      av_id: String(b.avId),
                      simulator_id: String(b.simId),
                      sampler_id: String(b.samplerId),
                    });
                    if (group.tag !== "(untagged)") params.set("tag", group.tag);
                    return (
                      <Col key={`${group.tag}-${b.key}`} xs={12} sm={8} md={6} lg={3}>
                        <Space
                          direction="vertical"
                          size={4}
                          style={{ width: "100%", textAlign: "center", cursor: "pointer" }}
                          onClick={() => navigate(`/tasks?${params.toString()}`)}
                        >
                          <div style={{ display: "flex", justifyContent: "center" }}>
                            <StatusDonut counts={b.counts} />
                          </div>
                          <Typography.Text
                            strong
                            style={{ fontSize: 12, display: "block" }}
                            ellipsis={{ tooltip: `${av} · ${sim} · ${sampler}` }}
                          >
                            {av}
                          </Typography.Text>
                          <Typography.Text
                            type="secondary"
                            style={{ fontSize: 11, display: "block" }}
                            ellipsis={{ tooltip: `${sim} · ${sampler}` }}
                          >
                            {sim} · {sampler}
                          </Typography.Text>
                        </Space>
                      </Col>
                    );
                  })}
                  {hiddenBuckets > 0 && (
                    <Col xs={24}>
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        + {hiddenBuckets} more setup{hiddenBuckets === 1 ? "" : "s"} in this group.
                      </Typography.Text>
                    </Col>
                  )}
                </Row>
              </div>
            );
          })}
        </Space>
      )}
    </Card>
  );
}
