import { useState } from "react";
import {
  Typography,
  Upload as AntUpload,
  Button,
  Select,
  Card,
  List,
  Tag,
  Space,
  message,
  Alert,
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

export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<ScenarioFormat>("open_scenario1");
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResponse | null>(null);

  const handleUpload = async () => {
    if (!file) {
      message.warning("Please select a zip file first");
      return;
    }

    setUploading(true);
    setResults(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("format", format);

    try {
      const res = await fetch(`${BASE_URL}/scenario/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }
      const data: UploadResponse = await res.json();
      setResults(data);
      const created = data.results.filter((r) => r.status === "created").length;
      message.success(`Uploaded ${created}/${data.total} scenarios`);
    } catch (e) {
      message.error(String(e));
    } finally {
      setUploading(false);
    }
  };

  const statusTag = (status: string) => {
    switch (status) {
      case "created":
        return <Tag color="success">CREATED</Tag>;
      case "skipped":
        return <Tag color="warning">SKIPPED</Tag>;
      case "error":
        return <Tag color="error">ERROR</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  return (
    <>
      <PageHeader title="Upload Scenarios" />
      <Typography.Paragraph type="secondary">
        Upload a zip containing scenario folders, each with <code>spec.yaml</code> and <code>.xosc</code> files.
      </Typography.Paragraph>

      <Space direction="vertical" size="middle" style={{ width: "100%", maxWidth: 600 }}>
        <Card size="small">
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <div>
              <Typography.Text strong>Scenario Format</Typography.Text>
              <Select
                value={format}
                onChange={setFormat}
                options={formatOptions}
                style={{ width: "100%", marginTop: 4 }}
              />
            </div>

            <Dragger
              accept=".zip"
              maxCount={1}
              beforeUpload={(f) => {
                setFile(f);
                return false;
              }}
              onRemove={() => setFile(null)}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">
                Click or drag a zip file to this area
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

        {results && (
          <Card title={`Results (${results.total} scenarios)`}>
            {results.results.some((r) => r.status === "error") && (
              <Alert
                type="error"
                message="Some scenarios failed"
                style={{ marginBottom: 16 }}
              />
            )}
            <List
              size="small"
              dataSource={results.results}
              renderItem={(item) => (
                <List.Item>
                  {statusTag(item.status)}{" "}
                  <Typography.Text strong>{item.name}</Typography.Text>
                  {item.message && (
                    <Typography.Text type="danger">
                      {" "}
                      — {item.message}
                    </Typography.Text>
                  )}
                </List.Item>
              )}
            />
          </Card>
        )}
      </Space>
    </>
  );
}
