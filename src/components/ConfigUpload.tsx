import { useState } from "react";
import { Upload, Button, message, Space, Popconfirm, Modal, Input, Tag, Spin, Alert } from "antd";
import { UploadOutlined, DownloadOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { api } from "../api/client";
import type { ConfigEntity } from "../api/types";

interface Props {
  entity: ConfigEntity;
  id: number;
  hasConfig: boolean;
  onChange?: () => void;
}

/** Inline controls to upload / download / edit / delete the single config on a row. */
export default function ConfigUpload({ entity, id, hasConfig, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);

  const beforeUpload = async (file: File) => {
    setBusy(true);
    try {
      await api.uploadConfig(entity, id, file);
      message.success("Config uploaded");
      onChange?.();
    } catch (e) {
      message.error(String(e));
    } finally {
      setBusy(false);
    }
    return Upload.LIST_IGNORE;
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await api.deleteConfig(entity, id);
      message.success("Config deleted");
      onChange?.();
    } catch (e) {
      message.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const openEdit = async () => {
    setEditError("");
    setEditText("");
    setEditOpen(true);
    if (!hasConfig) return;
    setEditLoading(true);
    try {
      const res = await fetch(api.configUrl(entity, id));
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      setEditText(await res.text());
    } catch (e) {
      setEditError(String(e));
    } finally {
      setEditLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.uploadConfig(entity, id, new Blob([editText], { type: "text/yaml" }));
      message.success("Config saved");
      setEditOpen(false);
      onChange?.();
    } catch (e) {
      message.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Space size="small">
        <Button size="small" icon={<EditOutlined />} onClick={openEdit}>
          {hasConfig ? "Edit" : "Create"}
        </Button>
        <Upload showUploadList={false} beforeUpload={beforeUpload} accept=".yaml,.yml,.json">
          <Button size="small" icon={<UploadOutlined />} loading={busy}>
            {hasConfig ? "Replace" : "Upload"}
          </Button>
        </Upload>
        {hasConfig && (
          <>
            <Button
              size="small"
              icon={<DownloadOutlined />}
              href={api.configUrl(entity, id)}
              target="_blank"
              rel="noreferrer"
            />
            <Popconfirm title="Delete config?" onConfirm={handleDelete}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </>
        )}
      </Space>

      <Modal
        title={
          <Space>
            {hasConfig ? "Edit" : "Create"} config
            <Tag>{entity}</Tag>
            <Tag>#{id}</Tag>
          </Space>
        }
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="Save"
        width="80%"
        styles={{ body: { padding: 0 } }}
      >
        {editLoading ? (
          <div style={{ textAlign: "center", padding: 48 }}>
            <Spin />
          </div>
        ) : (
          <div style={{ padding: 16 }}>
            {editError && <Alert type="error" message={editError} style={{ marginBottom: 8 }} />}
            <Input.TextArea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              autoSize={{ minRows: 16, maxRows: 36 }}
              placeholder={
                hasConfig
                  ? "Loading existing config..."
                  : "Paste yaml content here, then click Save to create."
              }
              style={{
                fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
                fontSize: 12,
                lineHeight: 1.5,
              }}
            />
          </div>
        )}
      </Modal>
    </>
  );
}
