import { useState } from "react";
import { Layout, Menu, Drawer, Button, Tooltip } from "antd";
import {
  DashboardOutlined,
  UnorderedListOutlined,
  FileTextOutlined,
  ProjectOutlined,
  AppstoreOutlined,
  ClusterOutlined,
  CloudUploadOutlined,
  MenuOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SunOutlined,
  MoonOutlined,
} from "@ant-design/icons";
import { useTheme } from "./ThemeContext";
import { Outlet, useNavigate, useLocation } from "react-router-dom";

const mainItems = [
  { key: "/", icon: <DashboardOutlined />, label: "Dashboard" },
  { key: "/tasks", icon: <UnorderedListOutlined />, label: "Tasks" },
  { key: "/scenarios", icon: <FileTextOutlined />, label: "Scenarios" },
  { key: "/plans", icon: <ProjectOutlined />, label: "Plans" },
  { key: "/resources", icon: <AppstoreOutlined />, label: "Resources" },
  { key: "/executors", icon: <ClusterOutlined />, label: "Executors" },
];

const utilItems = [{ key: "/upload", icon: <CloudUploadOutlined />, label: "Upload" }];

const allItems = [...mainItems, ...utilItems];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { mode, toggle: toggleTheme } = useTheme();

  const isDark = mode === "dark";

  const selectedKey =
    allItems
      .filter((item) => item.key !== "/")
      .find((item) => location.pathname.startsWith(item.key))?.key ?? "/";

  const handleNav = (key: string) => {
    navigate(key);
    setDrawerOpen(false);
  };

  const menuContent = (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[selectedKey]}
      items={[...mainItems, { type: "divider" as const }, ...utilItems]}
      onClick={({ key }) => handleNav(key)}
      style={{ border: "none" }}
    />
  );

  const logo = (
    <div
      style={{
        height: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: collapsed ? "center" : "flex-start",
        padding: collapsed ? 0 : "0 24px",
        color: "#fff",
        fontWeight: 800,
        fontSize: collapsed ? 18 : 22,
        letterSpacing: collapsed ? 0 : 2,
        userSelect: "none",
      }}
    >
      {collapsed ? "P" : "PISA"}
    </div>
  );

  const siderFooter = (
    <div
      style={{
        padding: collapsed ? "12px 0" : "12px 16px",
        borderTop: "1px solid rgba(255,255,255,0.1)",
        display: "flex",
        flexDirection: collapsed ? "column" : "row",
        alignItems: "center",
        gap: 8,
        justifyContent: collapsed ? "center" : "space-between",
      }}
    >
      <Tooltip title={isDark ? "Light mode" : "Dark mode"} placement="right">
        <Button
          type="text"
          icon={isDark ? <SunOutlined /> : <MoonOutlined />}
          onClick={toggleTheme}
          style={{ color: "rgba(255,255,255,0.65)" }}
        />
      </Tooltip>
      {!collapsed && (
        <Tooltip title="Collapse sidebar" placement="right">
          <Button
            type="text"
            icon={<MenuFoldOutlined />}
            onClick={() => setCollapsed(true)}
            style={{ color: "rgba(255,255,255,0.65)" }}
          />
        </Tooltip>
      )}
      {collapsed && (
        <Tooltip title="Expand sidebar" placement="right">
          <Button
            type="text"
            icon={<MenuUnfoldOutlined />}
            onClick={() => setCollapsed(false)}
            style={{ color: "rgba(255,255,255,0.65)" }}
          />
        </Tooltip>
      )}
    </div>
  );

  return (
    <Layout style={{ minHeight: "100vh" }}>
      {/* Desktop sidebar */}
      <Layout.Sider
        collapsible
        collapsed={collapsed}
        collapsedWidth={56}
        trigger={null}
        width={200}
        className="desktop-sider"
        style={{
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
          height: "100vh",
          position: "sticky",
          top: 0,
        }}
      >
        {logo}
        <div style={{ flex: 1, overflow: "auto" }}>{menuContent}</div>
        {siderFooter}
      </Layout.Sider>

      {/* Mobile drawer */}
      <Drawer
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={240}
        styles={{
          body: {
            padding: 0,
            background: "#001529",
            display: "flex",
            flexDirection: "column",
            height: "100%",
          },
        }}
      >
        <div
          style={{
            height: 56,
            display: "flex",
            alignItems: "center",
            padding: "0 24px",
            color: "#fff",
            fontWeight: 800,
            fontSize: 22,
            letterSpacing: 2,
          }}
        >
          PISA
        </div>
        <div style={{ flex: 1 }}>{menuContent}</div>
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <Button
            type="text"
            icon={isDark ? <SunOutlined /> : <MoonOutlined />}
            onClick={toggleTheme}
            style={{ color: "rgba(255,255,255,0.65)" }}
          >
            {isDark ? "Light" : "Dark"}
          </Button>
        </div>
      </Drawer>

      <Layout>
        {/* Mobile-only top bar */}
        <div className="mobile-bar">
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setDrawerOpen(true)}
            style={{ fontSize: 18 }}
          />
          <span style={{ fontWeight: 700, fontSize: 16 }}>PISA</span>
          <Button
            type="text"
            icon={isDark ? <SunOutlined /> : <MoonOutlined />}
            onClick={toggleTheme}
            style={{ fontSize: 16 }}
          />
        </div>
        <Layout.Content
          style={{
            padding: 16,
            overflow: "auto",
            background: isDark ? "#141414" : "#f5f5f5",
            minHeight: "calc(100vh - 48px)",
          }}
        >
          <Outlet />
        </Layout.Content>
      </Layout>

      <style>{`
        .mobile-bar {
          display: none;
          align-items: center;
          justify-content: space-between;
          padding: 0 4px;
          height: 48px;
          background: ${isDark ? "#1f1f1f" : "#fff"};
          border-bottom: 1px solid ${isDark ? "#303030" : "#f0f0f0"};
        }
        @media (max-width: 767px) {
          .desktop-sider { display: none !important; }
          .mobile-bar { display: flex; }
        }
      `}</style>
    </Layout>
  );
}
