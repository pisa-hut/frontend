import { useEffect, useState } from "react";
import { Button, Table } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { getColumnSearchProps } from "../components/ColumnSearch";
import PageHeader from "../components/PageHeader";
import { api } from "../api/client";
import type { ExecutorResponse } from "../api/types";

export default function Executors() {
  const [data, setData] = useState<ExecutorResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => { setLoading(true); api.listExecutors().then(setData).finally(() => setLoading(false)); };
  useEffect(load, []);

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60, sorter: (a: ExecutorResponse, b: ExecutorResponse) => a.id - b.id, ...getColumnSearchProps<ExecutorResponse>("id") },
    { title: "Hostname", dataIndex: "hostname", key: "hostname", ellipsis: true, ...getColumnSearchProps<ExecutorResponse>("hostname") },
    { title: "Job ID", dataIndex: "slurm_job_id", key: "slurm_job_id", width: 100, sorter: (a: ExecutorResponse, b: ExecutorResponse) => a.slurm_job_id - b.slurm_job_id, ...getColumnSearchProps<ExecutorResponse>("slurm_job_id") },
    { title: "Array", dataIndex: "slurm_array_id", key: "slurm_array_id", width: 80 },
    { title: "Nodes", dataIndex: "slurm_node_list", key: "slurm_node_list", ellipsis: true, ...getColumnSearchProps<ExecutorResponse>("slurm_node_list") },
  ];

  return (
    <>
      <PageHeader title="Executors">
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </PageHeader>
      <Table dataSource={data} columns={columns} rowKey="id" loading={loading} size="small" scroll={{ x: "max-content" }}
        pagination={{ pageSize: 20, showTotal: (t) => `${t} executors` }} />
    </>
  );
}
