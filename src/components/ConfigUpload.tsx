import { useState } from "react";
import { Upload, Button, message, Space, Popconfirm } from "antd";
import { UploadOutlined, DownloadOutlined, DeleteOutlined } from "@ant-design/icons";
import { api } from "../api/client";
import type { ConfigEntity } from "../api/types";

interface Props {
  entity: ConfigEntity;
  id: number;
  hasConfig: boolean;
  onChange?: () => void;
}

/** Inline controls to upload / download / delete the single config yaml on a row. */
export default function ConfigUpload({ entity, id, hasConfig, onChange }: Props) {
  const [busy, setBusy] = useState(false);

  const beforeUpload = async (file: File) => {
    setBusy(true);
    try {
      await api.uploadConfig(entity, id, file);
      message.success(`Config uploaded`);
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

  return (
    <Space size="small">
      <Upload
        showUploadList={false}
        beforeUpload={beforeUpload}
        accept=".yaml,.yml,.json"
      >
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
          >
            Download
          </Button>
          <Popconfirm title="Delete config?" onConfirm={handleDelete}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </>
      )}
    </Space>
  );
}
