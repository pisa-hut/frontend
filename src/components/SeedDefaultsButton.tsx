import { useState } from "react";
import { Button, Modal, List, Tag, Typography, message } from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import { api } from "../api/client";

const SEED_AVS = [
  {
    name: "autoware",
    image_path: {
      apptainer: "/opt/pisa/sif/autoware.sif",
      docker: "tonychi/autoware-wrapper:latest",
    },
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
    nv_runtime: true,
    ros_runtime: false,
    carla_runtime: true,
  },
];

const SEED_SIMULATORS = [
  {
    name: "esmini",
    image_path: {
      apptainer: "/opt/pisa/sif/esmini.sif",
      docker: "tonychi/esmini-wrapper:latest",
    },
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
    nv_runtime: true,
    ros_runtime: false,
    carla_runtime: true,
  },
];

const SEED_MAPS = [{ name: "tyms" }, { name: "frankenburg" }, { name: "Town10HD_Opt" }];

const SEED_SAMPLERS = [
  { name: "grid", module_path: "simcore.sampler.grid_search_sampler:GridSearchSampler" },
];

type Status = "created" | "skipped" | "error";
interface Row {
  resource: string;
  name: string;
  status: Status;
  message?: string;
}

export default function SeedDefaultsButton({ onChange }: { onChange?: () => void }) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  const seed = async () => {
    setRunning(true);
    const log: Row[] = [];

    type Item = { name: string; [k: string]: unknown };
    async function seedKind<R extends { name: string }>(
      resource: string,
      items: Item[],
      list: () => Promise<R[]>,
      create: (item: Item) => Promise<unknown>,
    ) {
      try {
        const existingNames = new Set((await list()).map((r) => r.name));
        for (const item of items) {
          if (existingNames.has(item.name)) {
            log.push({ resource, name: item.name, status: "skipped" });
          } else {
            try {
              await create(item);
              log.push({ resource, name: item.name, status: "created" });
            } catch (e) {
              log.push({ resource, name: item.name, status: "error", message: String(e) });
            }
          }
        }
      } catch (e) {
        log.push({ resource, name: "*", status: "error", message: `Failed to list: ${e}` });
      }
      setRows([...log]);
    }

    await seedKind("AV", SEED_AVS, api.listAvs, (i) => api.createAv(i as never));
    await seedKind(
      "Simulator",
      SEED_SIMULATORS,
      api.listSimulators,
      (i) => api.createSimulator(i as never),
    );
    await seedKind("Map", SEED_MAPS, api.listMaps, (i) => api.createMap(i as never));
    await seedKind(
      "Sampler",
      SEED_SAMPLERS,
      api.listSamplers,
      (i) => api.createSampler(i as never),
    );

    setRunning(false);
    onChange?.();
  };

  const tag = (s: Status) =>
    s === "created" ? (
      <Tag color="success">CREATED</Tag>
    ) : s === "skipped" ? (
      <Tag color="warning">SKIPPED</Tag>
    ) : (
      <Tag color="error">ERROR</Tag>
    );

  const hasErrors = rows.some((r) => r.status === "error");

  return (
    <>
      <Button
        icon={<ThunderboltOutlined />}
        onClick={() => {
          setRows([]);
          setOpen(true);
        }}
      >
        Seed defaults
      </Button>
      <Modal
        title="Seed default AVs / Simulators / Maps / Sampler"
        open={open}
        onCancel={() => {
          if (!running) setOpen(false);
        }}
        footer={[
          <Button key="close" onClick={() => setOpen(false)} disabled={running}>
            Close
          </Button>,
          <Button
            key="run"
            type="primary"
            icon={<ThunderboltOutlined />}
            loading={running}
            onClick={() => {
              if (!running) {
                if (rows.length > 0 && !hasErrors) {
                  message
                    .info("Seed already ran; close and reopen to run again")
                    .then(() => {});
                  return;
                }
                seed();
              }
            }}
          >
            {rows.length === 0 ? "Run" : "Run again"}
          </Button>,
        ]}
        width={560}
      >
        <Typography.Paragraph type="secondary">
          Inserts rows with the canonical names if they don't already exist. Image paths
          and runtime flags are pre-filled with the standard values; configs and map
          files still need to be uploaded per row from the Resources tabs.
        </Typography.Paragraph>
        {rows.length === 0 ? (
          <Typography.Text type="secondary">Ready — click Run to start.</Typography.Text>
        ) : (
          <List
            size="small"
            dataSource={rows}
            renderItem={(r) => (
              <List.Item>
                {tag(r.status)} <Typography.Text strong>{r.resource}</Typography.Text>:{" "}
                {r.name}
                {r.message && (
                  <Typography.Text type="danger"> — {r.message}</Typography.Text>
                )}
              </List.Item>
            )}
          />
        )}
      </Modal>
    </>
  );
}
