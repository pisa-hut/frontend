import { useState } from "react";
import { Layout, Menu, Drawer, Button } from "antd";
import {
  DashboardOutlined,
  UnorderedListOutlined,
  FileTextOutlined,
  ProjectOutlined,
  AppstoreOutlined,
  ClusterOutlined,
  ThunderboltOutlined,
  CloudUploadOutlined,
  MenuOutlined,
} from "@ant-design/icons";
import { Outlet, useNavigate, useLocation } from "react-router-dom";

const { Content } = Layout;

const menuItems = [
  { key: "/", icon: <DashboardOutlined />, label: "Dashboard" },
  { key: "/tasks", icon: <UnorderedListOutlined />, label: "Tasks" },
  { key: "/scenarios", icon: <FileTextOutlined />, label: "Scenarios" },
  { key: "/plans", icon: <ProjectOutlined />, label: "Plans" },
  { key: "/resources", icon: <AppstoreOutlined />, label: "Resources" },
  { key: "/executors", icon: <ClusterOutlined />, label: "Executors" },
  { key: "/upload", icon: <CloudUploadOutlined />, label: "Upload" },
  { key: "/init", icon: <ThunderboltOutlined />, label: "Init" },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const selectedKey =
    menuItems
      .filter((item) => item.key !== "/")
      .find((item) => location.pathname.startsWith(item.key))?.key ??
    "/";

  const handleNav = (key: string) => {
    navigate(key);
    setDrawerOpen(false);
  };

  const siderMenu = (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[selectedKey]}
      items={menuItems}
      onClick={({ key }) => handleNav(key)}
    />
  );

  return (
    <Layout style={{ minHeight: "100vh" }}>
      {/* Desktop sidebar */}
      <Layout.Sider
        breakpoint="md"
        collapsedWidth={60}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{ display: "var(--sider-display, block)" }}
        className="desktop-sider"
      >
        <div
          style={{
            height: 48,
            margin: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 700,
            fontSize: collapsed ? 16 : 20,
          }}
        >
          {collapsed ? "P" : "PISA"}
        </div>
        {siderMenu}
      </Layout.Sider>

      {/* Mobile drawer */}
      <Drawer
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={220}
        styles={{ body: { padding: 0, background: "#001529" } }}
        className="mobile-drawer"
      >
        <div
          style={{
            height: 48,
            margin: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 700,
            fontSize: 20,
          }}
        >
          PISA
        </div>
        {siderMenu}
      </Drawer>

      <Layout>
        {/* Mobile header with hamburger */}
        <div className="mobile-header">
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setDrawerOpen(true)}
            style={{ fontSize: 18, padding: "12px 16px" }}
          />
          <span style={{ fontWeight: 700, fontSize: 18 }}>PISA</span>
        </div>
        <Content style={{ padding: "16px", overflow: "auto" }}>
          <Outlet />
        </Content>
      </Layout>

      <style>{`
        .mobile-header {
          display: none;
          align-items: center;
          gap: 8px;
          background: #fff;
          border-bottom: 1px solid #f0f0f0;
        }
        @media (max-width: 767px) {
          .desktop-sider {
            display: none !important;
          }
          .mobile-header {
            display: flex;
          }
        }
        @media (min-width: 768px) {
          .mobile-drawer .ant-drawer-mask,
          .mobile-drawer .ant-drawer-content-wrapper {
            display: none;
          }
        }
      `}</style>
    </Layout>
  );
}
