import { useState } from "react";
import {
  Typography,
  Upload as AntUpload,
  Button,
  Select,
  Card,
  Tag,
  Space,
  message,
  Row,
  Col,
  Statistic,
  Table,
} from "antd";
import { UploadOutlined, InboxOutlined } from "@ant-design/icons";
import PageHeader from "../components/PageHeader";
import type { ScenarioFormat } from "../api/types";

const { Dragger } = AntUpload;

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/manager";

interface ScenarioUploadResult {
  name: string;
  status: string;
  message?: string;
}

interface UploadResponse {
  total: number;
  results: ScenarioUploadResult[];
}

const formatOptions: { label: string; value: ScenarioFormat }[] = [
  { label: "OpenSCENARIO 1.x", value: "open_scenario1" },
  { label: "OpenSCENARIO 2.x", value: "open_scenario2" },
  { label: "CARLA Leaderboard Route", value: "carla_lb_route" },
];

const statusTag = (status: string) => {
  const colors: Record<string, string> = { created: "success", skipped: "warning", error: "error" };
  return <Tag color={colors[status] ?? "default"}>{status.toUpperCase()}</Tag>;
};

export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<ScenarioFormat>("open_scenario1");
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResponse | null>(null);

  const handleUpload = async () => {
    if (!file) { message.warning("Select a zip file first"); return; }
    setUploading(true);
    setResults(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("format", format);
    try {
      const res = await fetch(`${BASE_URL}/scenario/upload`, { method: "POST", body: formData });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const data: UploadResponse = await res.json();
      setResults(data);
      const created = data.results.filter((r) => r.status === "created").length;
      message.success(`Uploaded ${created}/${data.total} scenarios`);
    } catch (e) { message.error(String(e)); }
    finally { setUploading(false); }
  };

  const created = results?.results.filter((r) => r.status === "created").length ?? 0;
  const skipped = results?.results.filter((r) => r.status === "skipped").length ?? 0;
  const errors = results?.results.filter((r) => r.status === "error").length ?? 0;

  return (
    <>
      <PageHeader title="Upload Scenarios" />

      <Row gutter={[24, 24]}>
        {/* Left: upload form */}
        <Col xs={24} lg={10}>
          <Card>
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <div>
                <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>Scenario Format</Typography.Text>
                <Select value={format} onChange={setFormat} options={formatOptions} style={{ width: "100%" }} />
              </div>

              <Dragger
                accept=".zip"
                maxCount={1}
                beforeUpload={(f) => { setFile(f); return false; }}
                onRemove={() => setFile(null)}
                style={{ padding: "24px 0" }}
              >
                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                <p className="ant-upload-text">Click or drag a zip file here</p>
                <p className="ant-upload-hint" style={{ color: "#999", fontSize: 12 }}>
                  Each folder: spec.yaml + .xosc files
                </p>
              </Dragger>

              <Button
                type="primary"
                icon={<UploadOutlined />}
                size="large"
                loading={uploading}
                onClick={handleUpload}
                disabled={!file}
                block
              >
                Upload & Process
              </Button>
            </Space>
          </Card>
        </Col>

        {/* Right: results */}
        <Col xs={24} lg={14}>
          {results ? (
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <Row gutter={[12, 12]}>
                <Col span={8}>
                  <Card size="small" styles={{ body: { textAlign: "center" } }}>
                    <Statistic title="Created" value={created} valueStyle={{ color: "#52c41a" }} />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small" styles={{ body: { textAlign: "center" } }}>
                    <Statistic title="Skipped" value={skipped} valueStyle={{ color: "#faad14" }} />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small" styles={{ body: { textAlign: "center" } }}>
                    <Statistic title="Errors" value={errors} valueStyle={{ color: errors > 0 ? "#ff4d4f" : undefined }} />
                  </Card>
                </Col>
              </Row>

              <Table
                dataSource={results.results}
                rowKey="name"
                size="small"
                scroll={{ x: "max-content" }}
                pagination={{ pageSize: 20, showTotal: (t) => `${t} scenarios` }}
                columns={[
                  { title: "Status", dataIndex: "status", key: "status", width: 90,
                    render: statusTag,
                    filters: [{ text: "Created", value: "created" }, { text: "Skipped", value: "skipped" }, { text: "Error", value: "error" }],
                    onFilter: (v, r) => r.status === v },
                  { title: "Scenario", dataIndex: "name", key: "name", ellipsis: true },
                  { title: "Message", dataIndex: "message", key: "message", ellipsis: true,
                    render: (v: string | undefined) => v ? <Typography.Text type="danger">{v}</Typography.Text> : "-" },
                ]}
              />
            </Space>
          ) : (
            <Card style={{ textAlign: "center", padding: "48px 0", color: "#999" }}>
              <InboxOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }} />
              <Typography.Paragraph type="secondary">
                Upload results will appear here
              </Typography.Paragraph>
            </Card>
          )}
        </Col>
      </Row>
    </>
  );
}
