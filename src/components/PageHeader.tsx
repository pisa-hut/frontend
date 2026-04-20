import { Typography, Space } from "antd";

export default function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
      flexWrap: "wrap",
      gap: 8,
    }}>
      <Typography.Title level={3} style={{ margin: 0 }}>{title}</Typography.Title>
      {children && <Space size="small" wrap>{children}</Space>}
    </div>
  );
}
