import { useEffect, useState } from "react";
import { Modal, Table, Button, Input, Popconfirm, Space, Typography, Tag, message } from "antd";
import { DeleteOutlined, EditOutlined, ReloadOutlined } from "@ant-design/icons";
import { api } from "../api/client";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after a successful rename or remove so the parent can
   *  refresh its plan list (the per-row chips need to re-sync). */
  onChanged?: () => void;
}

interface TagRow {
  name: string;
  count: number;
}

export default function TagManagerModal({ open, onClose, onChanged }: Props) {
  const [rows, setRows] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await api.listPlanTagCounts());
    } catch (e) {
      message.error(`Failed to load tags: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const handleRemove = async (name: string) => {
    try {
      const res = await api.removePlanTag(name);
      message.success(`Removed "${name}" from ${res.plans_updated} plan(s)`);
      load();
      onChanged?.();
    } catch (e) {
      message.error(`Failed to remove: ${e}`);
    }
  };

  const startRename = (name: string) => {
    setRenameTarget(name);
    setRenameValue(name);
  };

  const submitRename = async () => {
    if (!renameTarget) return;
    const next = renameValue.trim();
    if (!next) {
      message.error("New name can't be empty");
      return;
    }
    if (next === renameTarget) {
      setRenameTarget(null);
      return;
    }
    setRenaming(true);
    try {
      const res = await api.renamePlanTag(renameTarget, next);
      message.success(`Renamed "${renameTarget}" → "${next}" on ${res.plans_updated} plan(s)`);
      setRenameTarget(null);
      load();
      onChanged?.();
    } catch (e) {
      message.error(`Failed to rename: ${e}`);
    } finally {
      setRenaming(false);
    }
  };

  const columns = [
    {
      title: "Tag",
      dataIndex: "name",
      key: "name",
      render: (v: string) => <Tag style={{ fontFamily: "monospace" }}>{v}</Tag>,
      sorter: (a: TagRow, b: TagRow) => a.name.localeCompare(b.name),
    },
    {
      title: "Plans",
      dataIndex: "count",
      key: "count",
      width: 120,
      align: "right" as const,
      defaultSortOrder: "descend" as const,
      sorter: (a: TagRow, b: TagRow) => a.count - b.count,
      render: (n: number) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{n}</span>,
    },
    {
      title: "",
      key: "actions",
      width: 220,
      render: (_: unknown, r: TagRow) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => startRename(r.name)}>
            Rename
          </Button>
          <Popconfirm
            title={`Remove "${r.name}" from all ${r.count} plan(s)?`}
            description="The tag will be stripped from every plan. Plans themselves are kept."
            okText="Remove"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleRemove(r.name)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              Remove
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Modal
        title="Manage Plan Tags"
        open={open}
        onCancel={onClose}
        footer={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
              Refresh
            </Button>
            <Button type="primary" onClick={onClose}>
              Done
            </Button>
          </Space>
        }
        width={720}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          Tags live inline on each plan. Rename or remove them across every plan that uses them in a
          single operation.
        </Typography.Paragraph>
        <Table
          dataSource={rows}
          columns={columns}
          rowKey="name"
          loading={loading}
          size="small"
          pagination={{ pageSize: 10, size: "small", showSizeChanger: false }}
        />
      </Modal>

      <Modal
        title={renameTarget ? `Rename "${renameTarget}"` : ""}
        open={renameTarget !== null}
        onCancel={() => setRenameTarget(null)}
        onOk={submitRename}
        confirmLoading={renaming}
        okText="Rename"
        destroyOnClose
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={submitRename}
          placeholder="New tag name"
          autoFocus
        />
        <Typography.Paragraph
          type="secondary"
          style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}
        >
          If a plan already has both the old and new tag, the duplicate is collapsed.
        </Typography.Paragraph>
      </Modal>
    </>
  );
}
