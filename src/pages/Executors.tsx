import { useEffect, useState } from "react";
import { Button, Typography, Space } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { api } from "../api/client";
import type { ExecutorResponse } from "../api/types";
import ResizableTable from "../components/ResizableTable";

export default function Executors() {
  const [data, setData] = useState<ExecutorResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.listExecutors().then(setData).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60 },
    { title: "Hostname", dataIndex: "hostname", key: "hostname", width: 200, ellipsis: true },
    { title: "SLURM Job ID", dataIndex: "slurm_job_id", key: "slurm_job_id", width: 120 },
    { title: "Array ID", dataIndex: "slurm_array_id", key: "slurm_array_id", width: 100 },
    { title: "Node List", dataIndex: "slurm_node_list", key: "slurm_node_list", width: 200, ellipsis: true },
  ];

  return (
    <>
      <Typography.Title level={3}>Executors</Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </Space>
      <ResizableTable dataSource={data} columns={columns} rowKey="id" loading={loading} />
    </>
  );
}
