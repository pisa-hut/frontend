import { useState } from "react";
import { Card, Button, Typography, Space, Alert, List, Tag, Divider } from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import { api } from "../api/client";
import type { AvResponse, SimulatorResponse, MapResponse, SamplerResponse } from "../api/types";

const SEED_AVS: Omit<AvResponse, "id">[] = [
  {
    name: "autoware",
    image_path: {
      apptainer: "/opt/pisa/sif/autoware.sif",
      docker: "tonychi/autoware-wrapper:latest",
    },
    config_path: "config/av/autoware.yaml",
    nv_runtime: false,
    ros_runtime: true,
    carla_runtime: false,
  },
  {
    name: "carla-agent",
    image_path: {
      apptainer: "/opt/pisa/sif/carla-agent.sif",
      docker: "tonychi/carla-agent-wrapper:latest",
    },
    config_path: "config/av/carla-agent.yaml",
    nv_runtime: false,
    ros_runtime: false,
    carla_runtime: true,
  },
];

const SEED_SIMULATORS: Omit<SimulatorResponse, "id">[] = [
  {
    name: "esmini",
    image_path: {
      apptainer: "/opt/pisa/sif/esmini.sif",
      docker: "tonychi/esmini-wrapper:latest",
    },
    config_path: "config/sim/esmini.yaml",
    nv_runtime: false,
    ros_runtime: false,
    carla_runtime: false,
  },
  {
    name: "carla",
    image_path: {
      apptainer: "/opt/pisa/sif/carla.sif",
      docker: "tonychi/carla-wrapper:latest",
    },
    config_path: "config/sim/carla.yaml",
    nv_runtime: false,
    ros_runtime: false,
    carla_runtime: true,
  },
];

const SEED_MAPS: Omit<MapResponse, "id">[] = [
  { name: "tyms", xodr_path: "map/tyms/xodr/", osm_path: "map/tyms/osm/" },
  { name: "frankenburg", xodr_path: "map/frankenburg/xodr/", osm_path: "map/frankenburg/osm/" },
  { name: "Town10HD_Opt", xodr_path: "map/Town10HD_Opt/xodr/", osm_path: "map/Town10HD_Opt/osm/" },
];

const SEED_SAMPLERS: Omit<SamplerResponse, "id">[] = [
  { name: "grid", module_path: "simcore.sampler.grid_search_sampler:GridSearchSampler", config_path: null },
];

interface SeedResult {
  resource: string;
  name: string;
  status: "created" | "skipped" | "error";
  message?: string;
}

export default function Init() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SeedResult[]>([]);

  const seed = async () => {
    setLoading(true);
    setResults([]);
    const log: SeedResult[] = [];

    const seedResource = async <T extends { name: string }, R extends { name: string }>(
      resourceName: string,
      items: T[],
      listFn: () => Promise<R[]>,
      createFn: (item: T) => Promise<R>,
    ) => {
      try {
        const existing = await listFn();
        const existingNames = new Set(existing.map((e) => e.name));

        for (const item of items) {
          if (existingNames.has(item.name)) {
            log.push({ resource: resourceName, name: item.name, status: "skipped" });
          } else {
            try {
              await createFn(item);
              log.push({ resource: resourceName, name: item.name, status: "created" });
            } catch (e) {
              log.push({ resource: resourceName, name: item.name, status: "error", message: String(e) });
            }
          }
        }
      } catch (e) {
        log.push({ resource: resourceName, name: "*", status: "error", message: `Failed to list: ${e}` });
      }
    };

    await seedResource("AV", SEED_AVS, api.listAvs, api.createAv);
    await seedResource("Simulator", SEED_SIMULATORS, api.listSimulators, api.createSimulator);
    await seedResource("Map", SEED_MAPS, api.listMaps, api.createMap);
    await seedResource("Sampler", SEED_SAMPLERS, api.listSamplers, api.createSampler);

    setResults(log);
    setLoading(false);
  };

  const statusTag = (status: SeedResult["status"]) => {
    switch (status) {
      case "created": return <Tag color="success">CREATED</Tag>;
      case "skipped": return <Tag color="warning">SKIPPED</Tag>;
      case "error": return <Tag color="error">ERROR</Tag>;
    }
  };

  return (
    <>
      <Typography.Title level={3}>Initialize Database</Typography.Title>
      <Typography.Paragraph type="secondary">
        Seed the database with default AVs, Simulators, Maps, and Samplers.
        Existing entries (matched by name) will be skipped.
      </Typography.Paragraph>

      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Card title="Seed Data Preview" size="small">
          <Typography.Text strong>AVs:</Typography.Text> {SEED_AVS.map((a) => a.name).join(", ")}
          <Divider style={{ margin: "8px 0" }} />
          <Typography.Text strong>Simulators:</Typography.Text> {SEED_SIMULATORS.map((s) => s.name).join(", ")}
          <Divider style={{ margin: "8px 0" }} />
          <Typography.Text strong>Maps:</Typography.Text> {SEED_MAPS.map((m) => m.name).join(", ")}
          <Divider style={{ margin: "8px 0" }} />
          <Typography.Text strong>Samplers:</Typography.Text> {SEED_SAMPLERS.map((s) => s.name).join(", ")}
        </Card>

        <Button
          type="primary"
          size="large"
          icon={<ThunderboltOutlined />}
          loading={loading}
          onClick={seed}
        >
          Seed Database
        </Button>

        {results.length > 0 && (
          <Card title="Results">
            {results.some((r) => r.status === "error") && (
              <Alert
                type="error"
                message="Some items failed to seed"
                style={{ marginBottom: 16 }}
              />
            )}
            <List
              size="small"
              dataSource={results}
              renderItem={(item) => (
                <List.Item>
                  {statusTag(item.status)}{" "}
                  <Typography.Text strong>{item.resource}</Typography.Text>:{" "}
                  {item.name}
                  {item.message && (
                    <Typography.Text type="danger"> - {item.message}</Typography.Text>
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
