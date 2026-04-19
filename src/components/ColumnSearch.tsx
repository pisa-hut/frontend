import { Input, Button, Space } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import type { FilterDropdownProps } from "antd/es/table/interface";
import type { InputRef } from "antd";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getColumnSearchProps<T = any>(
  dataIndex: string,
  renderText?: (record: T) => string
) {
  let searchInput: InputRef | null = null;

  return {
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: FilterDropdownProps) => (
      <div style={{ padding: 8 }}>
        <Input
          ref={(node) => { searchInput = node; }}
          placeholder={`Search ${dataIndex}`}
          value={selectedKeys[0]}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => confirm()}
          style={{ marginBottom: 8, display: "block" }}
        />
        <Space>
          <Button type="primary" onClick={() => confirm()} icon={<SearchOutlined />} size="small" style={{ width: 90 }}>
            Search
          </Button>
          <Button onClick={() => { clearFilters?.(); confirm(); }} size="small" style={{ width: 90 }}>
            Reset
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered: boolean) => (
      <SearchOutlined style={{ color: filtered ? "#1890ff" : undefined }} />
    ),
    onFilter: (value: unknown, record: T) => {
      const text = renderText
        ? renderText(record)
        : String((record as Record<string, unknown>)[dataIndex] ?? "");
      return text.toLowerCase().includes(String(value).toLowerCase());
    },
    onFilterDropdownOpenChange: (visible: boolean) => {
      if (visible) setTimeout(() => searchInput?.select(), 100);
    },
  };
}
