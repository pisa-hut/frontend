import { useEffect, useState } from "react";
import { Button, Typography, Space } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { api } from "../api/client";
import type { ExecutorResponse } from "../api/types";
import ResizableTable from "../components/ResizableTable";
import { getColumnSearchProps } from "../components/ColumnSearch";

export default function Executors() {
  const [data, setData] = useState<ExecutorResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.listExecutors().then(setData).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60, sorter: (a: ExecutorResponse, b: ExecutorResponse) => a.id - b.id, ...getColumnSearchProps<ExecutorResponse>("id") },
    { title: "Hostname", dataIndex: "hostname", key: "hostname", width: 200, ellipsis: true, ...getColumnSearchProps<ExecutorResponse>("hostname") },
    { title: "SLURM Job ID", dataIndex: "slurm_job_id", key: "slurm_job_id", width: 120, sorter: (a: ExecutorResponse, b: ExecutorResponse) => a.slurm_job_id - b.slurm_job_id, ...getColumnSearchProps<ExecutorResponse>("slurm_job_id") },
    { title: "Array ID", dataIndex: "slurm_array_id", key: "slurm_array_id", width: 100, ...getColumnSearchProps<ExecutorResponse>("slurm_array_id") },
    { title: "Node List", dataIndex: "slurm_node_list", key: "slurm_node_list", width: 200, ellipsis: true, ...getColumnSearchProps<ExecutorResponse>("slurm_node_list") },
  ];

  return (
    <>
      <Typography.Title level={3}>Executors</Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </Space>
      <ResizableTable
        dataSource={data}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showTotal: (total) => `${total} executors` }}
      />
    </>
  );
}
