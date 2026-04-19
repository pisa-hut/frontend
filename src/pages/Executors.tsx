import { useEffect, useState } from "react";
import { Table, Button, Typography, Space } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { api } from "../api/client";
import type { ExecutorResponse } from "../api/types";

export default function Executors() {
  const [data, setData] = useState<ExecutorResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.listExecutors().then(setData).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const columns = [
    { title: "ID", dataIndex: "id", key: "id" },
    { title: "Hostname", dataIndex: "hostname", key: "hostname" },
    { title: "SLURM Job ID", dataIndex: "job_id", key: "job_id" },
    { title: "Array ID", dataIndex: "array_id", key: "array_id" },
    { title: "Node List", dataIndex: "node_list", key: "node_list" },
  ];

  return (
    <>
      <Typography.Title level={3}>Executors</Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </Space>
      <Table dataSource={data} columns={columns} rowKey="id" loading={loading} />
    </>
  );
}
