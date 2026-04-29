import { useEffect, useState } from "react";
import { Button, Modal, Form, Input, Select, message, Space, Table, Spin, Popconfirm, Card, Row, Col, Typography, Tabs, Empty } from "antd";
import { PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, EyeOutlined, PlayCircleOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { getColumnSearchProps } from "../components/ColumnSearch";
import FileBrowser from "../components/FileBrowser";
import PageHeader from "../components/PageHeader";
import { api } from "../api/client";
import type { ScenarioResponse, ScenarioFormat } from "../api/types";

const formatOptions: { label: string; value: ScenarioFormat }[] = [
  { label: "OpenSCENARIO 1.x", value: "open_scenario1" },
  { label: "OpenSCENARIO 2.x", value: "open_scenario2" },
  { label: "CARLA Leaderboard Route", value: "carla_lb_route" },
];

export default function Scenarios() {
  const [data, setData] = useState<ScenarioResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ScenarioResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form] = Form.useForm();

  // XOSC preview state — loads every *.xosc in the scenario and shows each
  // as its own tab (typically main `<name>.xosc` with the storyboard, plus
  // an optional `<name>_param.xosc`).
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewFiles, setPreviewFiles] = useState<{ path: string; content: string }[]>([]);
  const [previewActive, setPreviewActive] = useState<string>("");

  // All-files browser state
  const [filesFor, setFilesFor] = useState<ScenarioResponse | null>(null);

  // Video preview state
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState("");

  const load = () => { setLoading(true); api.listScenarios().then(setData).finally(() => setLoading(false)); };
  useEffect(load, []);

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (r: ScenarioResponse) => {
    setEditing(r);
    form.setFieldsValue(r);
    setModalOpen(true);
  };

  const openPreview = async (r: ScenarioResponse) => {
    const fallbackName = r.title ?? `scenario-${r.id}`;
    setPreviewTitle(fallbackName);
    setPreviewFiles([]);
    setPreviewActive("");
    setPreviewError("");
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      const files = await api.listScenarioFiles(r.id);
      const xoscFiles = files.filter((f) => f.relative_path.endsWith(".xosc"));
      if (!xoscFiles.length) throw new Error("No .xosc file in this scenario");
      // Stable ordering: main (non-_param) first, then _param variants, then rest alpha.
      xoscFiles.sort((a, b) => {
        const aParam = a.relative_path.endsWith("_param.xosc");
        const bParam = b.relative_path.endsWith("_param.xosc");
        if (aParam !== bParam) return aParam ? 1 : -1;
        return a.relative_path.localeCompare(b.relative_path);
      });
      const loaded = await Promise.all(
        xoscFiles.map(async (f) => {
          const res = await fetch(api.scenarioFileUrl(r.id, f.relative_path));
          if (!res.ok) throw new Error(`${f.relative_path}: ${res.status} ${await res.text()}`);
          return { path: f.relative_path, content: await res.text() };
        }),
      );
      setPreviewFiles(loaded);
      setPreviewActive(loaded[0]?.path ?? "");
      setPreviewTitle(r.title ?? loaded[0]?.path.replace(/\.xosc$/, "") ?? fallbackName);
    } catch (e) {
      setPreviewError(String(e));
    } finally {
      setPreviewLoading(false);
    }
  };

  const RENDERER_URL = "/renderer";

  const openVideo = async (r: ScenarioResponse) => {
    const name = r.title ?? `scenario-${r.id}`;
    setVideoTitle(name);
    setVideoUrl("");
    setVideoError("");
    setVideoLoading(true);
    setVideoOpen(true);
    try {
      const res = await fetch(`${RENDERER_URL}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario_id: r.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }
      const blob = await res.blob();
      setVideoUrl(URL.createObjectURL(blob));
    } catch (e) {
      setVideoError(String(e));
    } finally {
      setVideoLoading(false);
    }
  };

  const handleSave = async (values: { scenario_format: ScenarioFormat; title?: string }) => {
    setSaving(true);
    try {
      const payload = { ...values, title: values.title || null };
      if (editing) { await api.updateScenario(editing.id, payload); message.success("Updated"); }
      else { await api.createScenario(payload); message.success("Created"); }
      setModalOpen(false); form.resetFields(); setEditing(null); load();
    } catch (e) { message.error(String(e)); } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try { await api.deleteScenario(id); message.success("Deleted"); load(); } catch (e) { message.error(String(e)); }
  };

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60, ...getColumnSearchProps<ScenarioResponse>("id") },
    { title: "Title", dataIndex: "title", key: "title", ellipsis: true, render: (v: string | null) => v ?? "-",
      ...getColumnSearchProps<ScenarioResponse>("title") },
    { title: "Format", dataIndex: "scenario_format", key: "scenario_format", width: 140,
      filters: formatOptions.map((f) => ({ text: f.label, value: f.value })),
      onFilter: (value: unknown, r: ScenarioResponse) => r.scenario_format === value },
  ];

  return (
    <>
      <PageHeader title="Scenarios">
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Create</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </PageHeader>
      <Row gutter={12}>
        <Col xs={24} lg={selectedId ? 14 : 24}>
          <Table
            dataSource={data} columns={columns} rowKey="id" loading={loading} size="small" scroll={{ x: "max-content" }}
            onRow={(r) => ({
              onClick: () => setSelectedId((prev) => (prev === r.id ? null : r.id)),
              style: { cursor: "pointer", background: selectedId === r.id ? "var(--ant-color-primary-bg, #e6f4ff)" : undefined },
            })}
          />
        </Col>
        {selectedId && (() => {
          const r = data.find((s) => s.id === selectedId);
          if (!r) return null;
          return (
            <Col xs={24} lg={10}>
              <Card size="small"
                title={<Typography.Text ellipsis style={{ maxWidth: 250 }}>{r.title ?? `scenario-${r.id}`}</Typography.Text>}
                extra={<Button size="small" type="text" onClick={() => setSelectedId(null)}>x</Button>}
              >
                <div style={{ marginBottom: 12, fontSize: 13 }}>
                  <div><Typography.Text type="secondary">Format: </Typography.Text>{r.scenario_format}</div>
                  {r.scenario_path ? (
                    <div style={{ marginTop: 4 }}>
                      <Typography.Text type="secondary">Path: </Typography.Text>
                      <Typography.Text copyable={{ text: r.scenario_path }}>{r.scenario_path}</Typography.Text>
                    </div>
                  ) : null}
                </div>
                <Space wrap size="small">
                  <Button size="small" icon={<EyeOutlined />} onClick={() => openPreview(r)}>XOSC</Button>
                  <Button size="small" icon={<FolderOpenOutlined />} onClick={() => setFilesFor(r)}>Files</Button>
                  <Button size="small" icon={<PlayCircleOutlined />} onClick={() => openVideo(r)}>Video</Button>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button>
                  <Popconfirm title="Delete?" onConfirm={() => handleDelete(r.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />}>Delete</Button>
                  </Popconfirm>
                </Space>
              </Card>
            </Col>
          );
        })()}
      </Row>

      {/* Edit/Create modal */}
      <Modal title={editing ? "Edit Scenario" : "Create Scenario"} open={modalOpen} onCancel={() => { setModalOpen(false); setEditing(null); }} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="scenario_format" label="Format" rules={[{ required: true }]}><Select options={formatOptions} /></Form.Item>
          <Form.Item name="title" label="Title"><Input /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={saving} block>{editing ? "Save" : "Create"}</Button></Form.Item>
        </Form>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
          Ego destination and target speed live in the scenario's <code>spec.yaml</code> file — use the <b>Files</b> button to edit it.
        </Typography.Paragraph>
      </Modal>

      {/* XOSC Preview modal — one tab per *.xosc file in the scenario */}
      <Modal
        title={previewTitle}
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        width="80%"
        styles={{ body: { padding: 0 } }}
        footer={(() => {
          const current = previewFiles.find((f) => f.path === previewActive);
          if (!current || previewLoading) return null;
          return (
            <Space>
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(current.content);
                  message.success("Copied");
                }}
              >
                Copy
              </Button>
              <Button
                type="primary"
                onClick={() => {
                  const blob = new Blob([current.content], { type: "text/xml" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = current.path.split("/").pop() ?? current.path;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download
              </Button>
            </Space>
          );
        })()}
      >
        {previewLoading ? (
          <div style={{ textAlign: "center", padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : previewError ? (
          <div style={{ padding: 24 }}>
            <Empty description={previewError} />
          </div>
        ) : previewFiles.length === 0 ? (
          <div style={{ padding: 24 }}>
            <Empty description="No xosc files" />
          </div>
        ) : (
          <Tabs
            activeKey={previewActive}
            onChange={setPreviewActive}
            tabBarStyle={{ padding: "0 16px", marginBottom: 0 }}
            items={previewFiles.map((f) => ({
              key: f.path,
              label: f.path,
              children: (
                <pre
                  style={{
                    margin: 0,
                    padding: 16,
                    fontSize: 12,
                    lineHeight: 1.5,
                    maxHeight: "70vh",
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    fontFamily:
                      "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
                    background: "var(--ant-color-bg-layout, #f5f5f5)",
                  }}
                >
                  {f.content}
                </pre>
              ),
            }))}
          />
        )}
      </Modal>

      {/* All-files browser */}
      <FileBrowser
        open={filesFor !== null}
        title={filesFor ? `Files — ${filesFor.title ?? `scenario ${filesFor.id}`}` : ""}
        onClose={() => setFilesFor(null)}
        listFiles={() => (filesFor ? api.listScenarioFiles(filesFor.id) : Promise.resolve([]))}
        fileUrl={(rel) => (filesFor ? api.scenarioFileUrl(filesFor.id, rel) : "")}
        uploadFile={filesFor ? (rel, data) => api.uploadScenarioFile(filesFor.id, rel, data) : undefined}
        deleteFile={filesFor ? (rel) => api.deleteScenarioFile(filesFor.id, rel) : undefined}
      />

      {/* Video Preview modal */}
      <Modal
        title={`${videoTitle} — Video Preview`}
        open={videoOpen}
        onCancel={() => { setVideoOpen(false); if (videoUrl) URL.revokeObjectURL(videoUrl); }}
        footer={videoUrl && !videoLoading ? (
          <Button type="primary" onClick={() => {
            const a = document.createElement("a");
            a.href = videoUrl;
            a.download = `${videoTitle}.mp4`;
            a.click();
          }}>Download</Button>
        ) : null}
        width="80%"
        styles={{ body: { padding: videoLoading || videoError ? 48 : 0, textAlign: "center" } }}
      >
        {videoLoading ? (
          <div>
            <Spin size="large" />
            <p style={{ marginTop: 16, color: "#999" }}>Rendering scenario... this may take a minute</p>
          </div>
        ) : videoError ? (
          <div style={{ color: "#ff4d4f" }}>{videoError}</div>
        ) : videoUrl ? (
          <video
            src={videoUrl}
            controls
            autoPlay
            style={{ width: "100%", maxHeight: "70vh", background: "#000" }}
          />
        ) : null}
      </Modal>
    </>
  );
}
