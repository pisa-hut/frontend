import { useEffect, useRef, useState } from "react";
import { Drawer, Tabs, Button, Spin, Empty, Space, Typography, message } from "antd";
import { DownloadOutlined, CopyOutlined } from "@ant-design/icons";
import { api } from "../api/client";
import { FileBrowserBody } from "./FileBrowser";

interface Props {
  open: boolean;
  onClose: () => void;
  scenarioId: number | null;
  title: string;
}

interface XoscFile {
  path: string;
  content: string;
}

const RENDERER_URL = "/renderer";

export default function ScenarioDetailDrawer({ open, onClose, scenarioId, title }: Props) {
  const [tab, setTab] = useState("xosc");

  // XOSC tab state
  const [xoscLoading, setXoscLoading] = useState(false);
  const [xoscError, setXoscError] = useState("");
  const [xoscFiles, setXoscFiles] = useState<XoscFile[]>([]);
  const [xoscActive, setXoscActive] = useState<string>("");

  // Video tab state
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  // Track the object URL we created so we can revoke it without racing with React state.
  const videoUrlRef = useRef<string>("");

  const xoscLoadedFor = useRef<number | null>(null);
  const videoLoadedFor = useRef<number | null>(null);

  const revokeVideo = () => {
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = "";
    }
  };

  const loadXosc = async (id: number) => {
    xoscLoadedFor.current = id;
    setXoscLoading(true);
    setXoscError("");
    setXoscFiles([]);
    setXoscActive("");
    try {
      const files = await api.listScenarioFiles(id);
      const xosc = files.filter((f) => f.relative_path.endsWith(".xosc"));
      if (!xosc.length) throw new Error("No .xosc file in this scenario");
      xosc.sort((a, b) => {
        const aParam = a.relative_path.endsWith("_param.xosc");
        const bParam = b.relative_path.endsWith("_param.xosc");
        if (aParam !== bParam) return aParam ? 1 : -1;
        return a.relative_path.localeCompare(b.relative_path);
      });
      const loaded = await Promise.all(
        xosc.map(async (f) => {
          const res = await fetch(api.scenarioFileUrl(id, f.relative_path));
          if (!res.ok) throw new Error(`${f.relative_path}: ${res.status} ${await res.text()}`);
          return { path: f.relative_path, content: await res.text() };
        }),
      );
      // Drop the result if the user switched scenarios mid-fetch.
      if (xoscLoadedFor.current !== id) return;
      setXoscFiles(loaded);
      setXoscActive(loaded[0]?.path ?? "");
    } catch (e) {
      if (xoscLoadedFor.current === id) setXoscError(String(e));
    } finally {
      if (xoscLoadedFor.current === id) setXoscLoading(false);
    }
  };

  const loadVideo = async (id: number) => {
    videoLoadedFor.current = id;
    revokeVideo();
    setVideoUrl("");
    setVideoError("");
    setVideoLoading(true);
    try {
      const res = await fetch(`${RENDERER_URL}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario_id: id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }
      const blob = await res.blob();
      if (videoLoadedFor.current !== id) return;
      const url = URL.createObjectURL(blob);
      videoUrlRef.current = url;
      setVideoUrl(url);
    } catch (e) {
      if (videoLoadedFor.current === id) setVideoError(String(e));
    } finally {
      if (videoLoadedFor.current === id) setVideoLoading(false);
    }
  };

  // Reset everything when the drawer closes or the scenario changes.
  useEffect(() => {
    if (!open || scenarioId == null) {
      revokeVideo();
      setVideoUrl("");
      setVideoError("");
      setXoscFiles([]);
      setXoscError("");
      setXoscActive("");
      xoscLoadedFor.current = null;
      videoLoadedFor.current = null;
      setTab("xosc");
    }
  }, [open, scenarioId]);

  useEffect(() => {
    if (!open || scenarioId == null) return;
    if (tab === "xosc" && xoscLoadedFor.current !== scenarioId) {
      loadXosc(scenarioId);
    } else if (tab === "video" && videoLoadedFor.current !== scenarioId) {
      loadVideo(scenarioId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scenarioId, tab]);

  const currentXosc = xoscFiles.find((f) => f.path === xoscActive);

  return (
    <Drawer
      title={title}
      open={open}
      onClose={onClose}
      width="80%"
      destroyOnClose
      styles={{ body: { padding: 0 } }}
    >
      <Tabs
        activeKey={tab}
        onChange={setTab}
        tabBarStyle={{ padding: "0 16px", marginBottom: 0 }}
        items={[
          {
            key: "xosc",
            label: "XOSC",
            children: (
              <div style={{ padding: 16 }}>
                {xoscLoading ? (
                  <div style={{ textAlign: "center", padding: 48 }}>
                    <Spin size="large" />
                  </div>
                ) : xoscError ? (
                  <Empty description={xoscError} />
                ) : xoscFiles.length === 0 ? (
                  <Empty description="No xosc files" />
                ) : (
                  <>
                    <Tabs
                      activeKey={xoscActive}
                      onChange={setXoscActive}
                      items={xoscFiles.map((f) => ({
                        key: f.path,
                        label: f.path,
                        children: (
                          <pre
                            style={{
                              margin: 0,
                              padding: 12,
                              fontSize: 12,
                              lineHeight: 1.5,
                              maxHeight: "65vh",
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
                    {currentXosc && (
                      <Space style={{ marginTop: 8 }}>
                        <Button
                          icon={<CopyOutlined />}
                          onClick={() => {
                            navigator.clipboard.writeText(currentXosc.content);
                            message.success("Copied");
                          }}
                        >
                          Copy
                        </Button>
                        <Button
                          type="primary"
                          icon={<DownloadOutlined />}
                          onClick={() => {
                            const blob = new Blob([currentXosc.content], { type: "text/xml" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = currentXosc.path.split("/").pop() ?? currentXosc.path;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                        >
                          Download
                        </Button>
                      </Space>
                    )}
                  </>
                )}
              </div>
            ),
          },
          {
            key: "files",
            label: "Files",
            children: (
              <div style={{ padding: 16 }}>
                {scenarioId == null ? null : (
                  <FileBrowserBody
                    listFiles={() => api.listScenarioFiles(scenarioId)}
                    fileUrl={(rel) => api.scenarioFileUrl(scenarioId, rel)}
                    uploadFile={(rel, data) => api.uploadScenarioFile(scenarioId, rel, data)}
                    deleteFile={(rel) => api.deleteScenarioFile(scenarioId, rel)}
                    reloadToken={`${scenarioId}-${tab === "files"}`}
                  />
                )}
              </div>
            ),
          },
          {
            key: "video",
            label: "Video",
            children: (
              <div style={{ padding: 16, textAlign: "center", minHeight: 200 }}>
                {videoLoading ? (
                  <div>
                    <Spin size="large" />
                    <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
                      Rendering scenario… this may take a minute.
                    </Typography.Paragraph>
                  </div>
                ) : videoError ? (
                  <Empty description={videoError} />
                ) : videoUrl ? (
                  <>
                    <video
                      src={videoUrl}
                      controls
                      autoPlay
                      style={{ width: "100%", maxHeight: "65vh", background: "#000" }}
                    />
                    <Space style={{ marginTop: 8 }}>
                      <Button
                        type="primary"
                        icon={<DownloadOutlined />}
                        onClick={() => {
                          const a = document.createElement("a");
                          a.href = videoUrl;
                          a.download = `${title || "scenario"}.mp4`;
                          a.click();
                        }}
                      >
                        Download
                      </Button>
                    </Space>
                  </>
                ) : null}
              </div>
            ),
          },
        ]}
      />
    </Drawer>
  );
}
