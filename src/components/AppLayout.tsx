import { useState } from "react";
import { Layout, Menu, Drawer, Button } from "antd";
import {
  DashboardOutlined,
  RadarChartOutlined,
  UnorderedListOutlined,
  FileTextOutlined,
  ProjectOutlined,
  AppstoreOutlined,
  ClusterOutlined,
  CloudUploadOutlined,
  MenuOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from "@ant-design/icons";
import { Outlet, useNavigate, useLocation } from "react-router-dom";

const mainItems = [
  { key: "/", icon: <DashboardOutlined />, label: "Dashboard" },
  { key: "/control", icon: <RadarChartOutlined />, label: "Control" },
  { key: "/tasks", icon: <UnorderedListOutlined />, label: "Tasks" },
  { key: "/scenarios", icon: <FileTextOutlined />, label: "Scenarios" },
  { key: "/plans", icon: <ProjectOutlined />, label: "Plans" },
  { key: "/resources", icon: <AppstoreOutlined />, label: "Resources" },
  { key: "/executors", icon: <ClusterOutlined />, label: "Executors" },
];

const utilItems = [{ key: "/upload", icon: <CloudUploadOutlined />, label: "Upload" }];

const allItems = [...mainItems, ...utilItems];

// Console chrome shared by the desktop sider and the mobile drawer.
const SIDER_BG = "#070b11";
const LOGO_ACCENT = "#38bdf8";

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

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
      style={{ border: "none", background: "transparent" }}
    />
  );

  const logo = (
    <div
      style={{
        height: 56,
        display: "flex",
        alignItems: "center",
        gap: 8,
        justifyContent: collapsed ? "center" : "flex-start",
        padding: collapsed ? 0 : "0 20px",
        userSelect: "none",
        borderBottom: "1px solid rgba(120,160,200,0.12)",
      }}
    >
      <span style={{ color: LOGO_ACCENT, fontSize: collapsed ? 16 : 18, lineHeight: 1 }}>◢◣</span>
      {!collapsed && (
        <span
          style={{
            color: "#eaf4ff",
            fontWeight: 700,
            fontSize: 20,
            letterSpacing: 4,
          }}
        >
          PISA
        </span>
      )}
    </div>
  );

  const siderFooter = (
    <div
      style={{
        padding: collapsed ? "10px 0" : "10px 16px",
        borderTop: "1px solid rgba(120,160,200,0.12)",
        display: "flex",
        flexDirection: "column",
        alignItems: collapsed ? "center" : "stretch",
        gap: 6,
      }}
    >
      {!collapsed && (
        <span
          style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 10,
            letterSpacing: 2,
            color: "rgba(125,143,161,0.7)",
          }}
        >
          ::DECK ONLINE::
        </span>
      )}
      <Button
        type="text"
        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        onClick={() => setCollapsed((c) => !c)}
        style={{ color: "rgba(200,214,229,0.65)", alignSelf: collapsed ? "center" : "flex-end" }}
      />
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
          background: SIDER_BG,
          borderRight: "1px solid rgba(120,160,200,0.12)",
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
            background: SIDER_BG,
            display: "flex",
            flexDirection: "column",
            height: "100%",
          },
        }}
      >
        {logo}
        <div style={{ flex: 1 }}>{menuContent}</div>
      </Drawer>

      <Layout style={{ background: "#070b11" }}>
        {/* Mobile-only top bar */}
        <div className="mobile-bar">
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setDrawerOpen(true)}
            style={{ fontSize: 18, color: "#c8d6e5" }}
          />
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: 3, color: "#eaf4ff" }}>
            PISA
          </span>
          <span style={{ width: 32 }} />
        </div>
        <Layout.Content
          style={{
            padding: 16,
            overflow: "auto",
            background: "#070b11",
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
          background: #0c131c;
          border-bottom: 1px solid rgba(120,160,200,0.12);
        }
        @media (max-width: 767px) {
          .desktop-sider { display: none !important; }
          .mobile-bar { display: flex; }
        }
      `}</style>
    </Layout>
  );
}
