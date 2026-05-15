import { Typography, Space } from "antd";

export default function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: subtitle ? "flex-start" : "center",
        marginBottom: 16,
        flexWrap: "wrap",
        gap: 8,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <Typography.Title level={3} style={{ margin: 0, lineHeight: 1.2 }}>
          {title}
        </Typography.Title>
        {subtitle && (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {subtitle}
          </Typography.Text>
        )}
      </div>
      {children && (
        <Space size="small" wrap>
          {children}
        </Space>
      )}
    </div>
  );
}
