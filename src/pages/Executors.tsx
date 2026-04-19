import { useEffect, useState } from "react";
import { Button, Typography, Space, Input } from "antd";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { api } from "../api/client";
import type { ExecutorResponse } from "../api/types";
import ResizableTable from "../components/ResizableTable";

export default function Executors() {
  const [data, setData] = useState<ExecutorResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = () => {
    setLoading(true);
    api.listExecutors().then(setData).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = search
    ? data.filter((e) => {
        const q = search.toLowerCase();
        return (
          e.hostname.toLowerCase().includes(q) ||
          e.slurm_node_list.toLowerCase().includes(q) ||
          String(e.slurm_job_id).includes(q) ||
          String(e.id).includes(q)
        );
      })
    : data;

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60, sorter: (a: ExecutorResponse, b: ExecutorResponse) => a.id - b.id },
    { title: "Hostname", dataIndex: "hostname", key: "hostname", width: 200, ellipsis: true },
    { title: "SLURM Job ID", dataIndex: "slurm_job_id", key: "slurm_job_id", width: 120, sorter: (a: ExecutorResponse, b: ExecutorResponse) => a.slurm_job_id - b.slurm_job_id },
    { title: "Array ID", dataIndex: "slurm_array_id", key: "slurm_array_id", width: 100 },
    { title: "Node List", dataIndex: "slurm_node_list", key: "slurm_node_list", width: 200, ellipsis: true },
  ];

  return (
    <>
      <Typography.Title level={3}>Executors</Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="Search by hostname, job ID, node list..."
          prefix={<SearchOutlined />}
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 300 }}
        />
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </Space>
      <ResizableTable
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showTotal: (total) => `${total} executors` }}
      />
    </>
  );
}
