import { useEffect, useState } from "react";
import { Modal, Button, Space, Typography, Tag, List, message, Divider } from "antd";
import { UpOutlined, DownOutlined, PlusOutlined, MinusOutlined } from "@ant-design/icons";
import { api } from "../api/client";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function TagPriorityModal({ open, onClose }: Props) {
  const [ranked, setRanked] = useState<string[]>([]);
  const [unranked, setUnranked] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [ranking, counts] = await Promise.all([api.getTagPriority(), api.listPlanTagCounts()]);
      const order = ranking.map((r) => r.tag);
      const allTags = new Set(counts.map((c) => c.name));
      const rankedSet = new Set(order);
      setRanked(order);
      setUnranked([...allTags].filter((t) => !rankedSet.has(t)).sort());
    } catch (e) {
      message.error(`Failed to load tag priority: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const move = (i: number, dir: -1 | 1) => {
    setRanked((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const promote = (tag: string) => {
    setUnranked((prev) => prev.filter((t) => t !== tag));
    setRanked((prev) => [...prev, tag]);
  };

  const demote = (tag: string) => {
    setRanked((prev) => prev.filter((t) => t !== tag));
    setUnranked((prev) => [...prev, tag].sort());
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.setTagPriority(ranked);
      message.success(`Saved ranking (${res.count} tag(s))`);
      onClose();
    } catch (e) {
      message.error(`Failed to save: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Tag Priority"
      open={open}
      onCancel={onClose}
      onOk={save}
      okText="Save ranking"
      confirmLoading={saving}
      okButtonProps={{ disabled: loading }}
      width={640}
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        Tasks are scheduled by their plan's highest-ranked tag. Order tags below (top = highest
        priority). Tasks whose plan has no ranked tag run last.
      </Typography.Paragraph>

      <Typography.Text strong>Ranked</Typography.Text>
      <List
        size="small"
        loading={loading}
        bordered
        dataSource={ranked}
        locale={{ emptyText: "No ranked tags yet" }}
        style={{ marginTop: 8 }}
        renderItem={(tag, i) => (
          <List.Item
            actions={[
              <Button
                key="up"
                size="small"
                icon={<UpOutlined />}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              />,
              <Button
                key="down"
                size="small"
                icon={<DownOutlined />}
                disabled={i === ranked.length - 1}
                onClick={() => move(i, 1)}
              />,
              <Button
                key="remove"
                size="small"
                icon={<MinusOutlined />}
                onClick={() => demote(tag)}
              />,
            ]}
          >
            <Space>
              <span style={{ fontVariantNumeric: "tabular-nums", color: "#999" }}>{i + 1}.</span>
              <Tag style={{ fontFamily: "monospace" }}>{tag}</Tag>
            </Space>
          </List.Item>
        )}
      />

      <Divider style={{ margin: "16px 0 8px" }} />

      <Typography.Text strong>Unranked</Typography.Text>
      <List
        size="small"
        loading={loading}
        bordered
        dataSource={unranked}
        locale={{ emptyText: "All in-use tags are ranked" }}
        style={{ marginTop: 8 }}
        renderItem={(tag) => (
          <List.Item
            actions={[
              <Button key="add" size="small" icon={<PlusOutlined />} onClick={() => promote(tag)}>
                Rank
              </Button>,
            ]}
          >
            <Tag style={{ fontFamily: "monospace" }}>{tag}</Tag>
          </List.Item>
        )}
      />
    </Modal>
  );
}
