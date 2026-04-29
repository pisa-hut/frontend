import { useEffect, useState } from "react";
import {
  Modal,
  Table,
  Button,
  Space,
  Upload,
  Popconfirm,
  message,
  Typography,
  Tag,
  Input,
  Spin,
  Row,
  Col,
  Empty,
} from "antd";
import {
  UploadOutlined,
  DownloadOutlined,
  DeleteOutlined,
  ReloadOutlined,
  EyeOutlined,
  CopyOutlined,
} from "@ant-design/icons";

export interface FileEntry {
  relative_path: string;
  size: number;
  content_sha256: string;
}

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  listFiles: () => Promise<FileEntry[]>;
  fileUrl: (rel: string) => string;
  uploadFile?: (rel: string, data: Blob) => Promise<void>;
  deleteFile?: (rel: string) => Promise<void>;
  defaultUploadPrefix?: string;
  uploadAccept?: string;
}

// Extensions that render as text. Anything else is treated as binary — we
// offer a download button instead of loading bytes into the preview pane.
const TEXT_EXT = new Set([
  "xosc",
  "yaml",
  "yml",
  "xml",
  "json",
  "txt",
  "md",
  "osm",
  "xodr",
  "log",
  "csv",
  "cfg",
  "conf",
]);

// 2 MB cap on inline text preview — avoids blocking the browser on huge files.
const PREVIEW_MAX = 2 * 1024 * 1024;

function isTextPath(p: string): boolean {
  const m = p.match(/\.([^.]+)$/);
  return !!m && TEXT_EXT.has(m[1].toLowerCase());
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function FileBrowser({
  open,
  title,
  onClose,
  listFiles,
  fileUrl,
  uploadFile,
  deleteFile,
  defaultUploadPrefix = "",
  uploadAccept,
}: Props) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [listing, setListing] = useState(false);
  const [selected, setSelected] = useState<FileEntry | null>(null);
  const [previewText, setPreviewText] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [uploadPrefix, setUploadPrefix] = useState(defaultUploadPrefix);

  const load = async () => {
    setListing(true);
    try {
      const next = await listFiles();
      setFiles(next.slice().sort((a, b) => a.relative_path.localeCompare(b.relative_path)));
    } catch (e) {
      message.error(String(e));
    } finally {
      setListing(false);
    }
  };

  useEffect(() => {
    if (open) {
      setSelected(null);
      setPreviewText("");
      setPreviewError("");
      setUploadPrefix(defaultUploadPrefix);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openPreview = async (f: FileEntry) => {
    setSelected(f);
    setPreviewText("");
    setPreviewError("");
    if (!isTextPath(f.relative_path)) return;
    if (f.size > PREVIEW_MAX) {
      setPreviewError(`File is ${formatSize(f.size)} — too large to preview inline. Use Download.`);
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await fetch(fileUrl(f.relative_path));
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      setPreviewText(await res.text());
    } catch (e) {
      setPreviewError(String(e));
    } finally {
      setPreviewLoading(false);
    }
  };

  const beforeUpload = async (f: File) => {
    if (!uploadFile) return Upload.LIST_IGNORE;
    const rel = `${uploadPrefix}${f.name}`;
    try {
      await uploadFile(rel, f);
      message.success(`Uploaded ${rel}`);
      load();
    } catch (e) {
      message.error(String(e));
    }
    return Upload.LIST_IGNORE;
  };

  const handleDelete = async (rel: string) => {
    if (!deleteFile) return;
    try {
      await deleteFile(rel);
      message.success("Deleted");
      if (selected?.relative_path === rel) setSelected(null);
      load();
    } catch (e) {
      message.error(String(e));
    }
  };

  const columns = [
    {
      title: "Path",
      dataIndex: "relative_path",
      key: "relative_path",
      ellipsis: true,
      render: (v: string) => <span style={{ fontFamily: "monospace" }}>{v}</span>,
    },
    {
      title: "Size",
      dataIndex: "size",
      key: "size",
      width: 90,
      render: (v: number) => formatSize(v),
    },
    {
      title: "",
      key: "actions",
      width: 110,
      render: (_: unknown, r: FileEntry) => (
        <Space size={4} onClick={(e) => e.stopPropagation()}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => openPreview(r)} />
          <Button
            size="small"
            icon={<DownloadOutlined />}
            href={fileUrl(r.relative_path)}
            target="_blank"
            rel="noreferrer"
          />
          {deleteFile && (
            <Popconfirm title={`Delete ${r.relative_path}?`} onConfirm={() => handleDelete(r.relative_path)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const isText = selected ? isTextPath(selected.relative_path) : false;

  return (
    <Modal title={title} open={open} onCancel={onClose} footer={null} width="90%">
      <Space style={{ marginBottom: 12 }} wrap>
        <Button icon={<ReloadOutlined />} onClick={load} loading={listing}>
          Refresh
        </Button>
        {uploadFile && (
          <>
            <Input
              addonBefore="Prefix"
              value={uploadPrefix}
              onChange={(e) => setUploadPrefix(e.target.value)}
              style={{ width: 220 }}
              placeholder="optional/subdir/"
            />
            <Upload showUploadList={false} beforeUpload={beforeUpload} multiple accept={uploadAccept}>
              <Button icon={<UploadOutlined />} type="primary">
                Upload file(s)
              </Button>
            </Upload>
          </>
        )}
      </Space>
      <Row gutter={12}>
        <Col xs={24} lg={selected ? 10 : 24}>
          <Table
            dataSource={files}
            columns={columns}
            rowKey="relative_path"
            loading={listing}
            size="small"
            pagination={{ pageSize: 20, size: "small" }}
            onRow={(r) => ({
              onClick: () => openPreview(r),
              style: {
                cursor: "pointer",
                background:
                  selected?.relative_path === r.relative_path
                    ? "var(--ant-color-primary-bg, #e6f4ff)"
                    : undefined,
              },
            })}
          />
        </Col>
        {selected && (
          <Col xs={24} lg={14}>
            <div
              style={{
                border: "1px solid var(--ant-color-border, #d9d9d9)",
                borderRadius: 4,
                padding: 12,
                background: "var(--ant-color-bg-layout, #fafafa)",
              }}
            >
              <Space style={{ marginBottom: 8 }} wrap>
                <Typography.Text strong style={{ fontFamily: "monospace" }}>
                  {selected.relative_path}
                </Typography.Text>
                <Tag style={{ fontFamily: "monospace" }}>
                  {selected.content_sha256.slice(0, 12)}…
                </Tag>
                <Tag>{formatSize(selected.size)}</Tag>
                {previewText && (
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => {
                      navigator.clipboard.writeText(previewText);
                      message.success("Copied");
                    }}
                  >
                    Copy
                  </Button>
                )}
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  href={fileUrl(selected.relative_path)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download
                </Button>
              </Space>
              {previewLoading ? (
                <div style={{ textAlign: "center", padding: 48 }}>
                  <Spin />
                </div>
              ) : previewError ? (
                <Empty description={previewError} />
              ) : isText && previewText ? (
                <pre
                  style={{
                    margin: 0,
                    padding: 12,
                    maxHeight: "60vh",
                    overflow: "auto",
                    background: "var(--ant-color-bg-container, #fff)",
                    border: "1px solid var(--ant-color-border-secondary, #f0f0f0)",
                    borderRadius: 4,
                    fontSize: 12,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
                  }}
                >
                  {previewText}
                </pre>
              ) : (
                <Empty description="Binary file — use Download" />
              )}
            </div>
          </Col>
        )}
      </Row>
    </Modal>
  );
}
