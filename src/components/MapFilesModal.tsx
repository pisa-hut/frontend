import { useEffect, useState } from "react";
import { Modal, Upload, Button, Table, message, Space, Popconfirm, Input, Typography, Tag } from "antd";
import { UploadOutlined, DownloadOutlined, DeleteOutlined, ReloadOutlined } from "@ant-design/icons";
import { api } from "../api/client";
import type { MapFileMeta } from "../api/types";

interface Props {
  mapId: number | null;
  mapName?: string;
  onClose: () => void;
}

export default function MapFilesModal({ mapId, mapName, onClose }: Props) {
  const open = mapId !== null;
  const [files, setFiles] = useState<MapFileMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadPrefix, setUploadPrefix] = useState("xodr/");

  const load = async () => {
    if (mapId === null) return;
    setLoading(true);
    try {
      setFiles(await api.listMapFiles(mapId));
    } catch (e) {
      message.error(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId]);

  const beforeUpload = async (file: File) => {
    if (mapId === null) return Upload.LIST_IGNORE;
    const rel = `${uploadPrefix}${file.name}`;
    try {
      await api.uploadMapFile(mapId, rel, file);
      message.success(`Uploaded ${rel}`);
      load();
    } catch (e) {
      message.error(String(e));
    }
    return Upload.LIST_IGNORE;
  };

  const handleDelete = async (rel: string) => {
    if (mapId === null) return;
    try {
      await api.deleteMapFile(mapId, rel);
      message.success("Deleted");
      load();
    } catch (e) {
      message.error(String(e));
    }
  };

  const columns = [
    {
      title: "Relative Path",
      dataIndex: "relative_path",
      key: "relative_path",
      render: (v: string) => <Typography.Text copyable>{v}</Typography.Text>,
    },
    {
      title: "Size",
      dataIndex: "size",
      key: "size",
      width: 100,
      render: (v: number) => `${(v / 1024).toFixed(1)} KB`,
    },
    {
      title: "SHA256",
      dataIndex: "content_sha256",
      key: "content_sha256",
      width: 110,
      render: (v: string) => <Tag style={{ fontFamily: "monospace" }}>{v.slice(0, 8)}…</Tag>,
    },
    {
      title: "",
      key: "actions",
      width: 140,
      render: (_: unknown, r: MapFileMeta) => (
        <Space size="small">
          <Button
            size="small"
            icon={<DownloadOutlined />}
            href={api.mapFileUrl(r.map_id, r.relative_path)}
            target="_blank"
            rel="noreferrer"
          />
          <Popconfirm title="Delete file?" onConfirm={() => handleDelete(r.relative_path)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Modal
      title={`Files — ${mapName ?? `map ${mapId}`}`}
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
    >
      <Space style={{ marginBottom: 12 }}>
        <Input
          addonBefore="Prefix"
          value={uploadPrefix}
          onChange={(e) => setUploadPrefix(e.target.value)}
          style={{ width: 240 }}
        />
        <Upload showUploadList={false} beforeUpload={beforeUpload} multiple>
          <Button icon={<UploadOutlined />}>Upload file(s)</Button>
        </Upload>
        <Button icon={<ReloadOutlined />} onClick={load}>
          Refresh
        </Button>
      </Space>
      <Table
        dataSource={files}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={false}
      />
    </Modal>
  );
}
