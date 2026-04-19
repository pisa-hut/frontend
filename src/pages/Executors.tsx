import { useEffect, useState, useMemo, useCallback } from "react";
import { Typography } from "antd";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, type ColDef } from "ag-grid-community";
import { api } from "../api/client";
import type { ExecutorResponse } from "../api/types";

ModuleRegistry.registerModules([AllCommunityModule]);

export default function Executors() {
  const [data, setData] = useState<ExecutorResponse[]>([]);

  const load = useCallback(() => { api.listExecutors().then(setData); }, []);
  useEffect(load, [load]);

  const columnDefs = useMemo<ColDef<ExecutorResponse>[]>(() => [
    { field: "id", width: 70, filter: "agNumberColumnFilter" },
    { field: "hostname", flex: 1, filter: "agTextColumnFilter" },
    { field: "slurm_job_id", headerName: "SLURM Job ID", width: 130, filter: "agNumberColumnFilter" },
    { field: "slurm_array_id", headerName: "Array ID", width: 100, filter: "agNumberColumnFilter" },
    { field: "slurm_node_list", headerName: "Node List", flex: 1, filter: "agTextColumnFilter" },
  ], []);

  return (
    <>
      <Typography.Title level={3}>Executors</Typography.Title>
      <div className="ag-theme-alpine" style={{ width: "100%", height: "calc(100vh - 200px)" }}>
        <AgGridReact<ExecutorResponse>
          rowData={data} columnDefs={columnDefs}
          defaultColDef={{ sortable: true, resizable: true, filter: true }}
          getRowId={(p) => String(p.data.id)} pagination paginationPageSize={50}
          quickFilterText=""
        />
      </div>
    </>
  );
}
