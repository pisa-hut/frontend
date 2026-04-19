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
  MenuFoldOutlined,
  MenuUnfoldOutlined,
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
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        collapsedWidth={60}
        trigger={null}
        width={200}
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
            fontSize: collapsed ? 14 : 20,
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
        <div className="top-header">
          {/* Desktop: fold/unfold toggle */}
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            className="desktop-toggle"
            style={{ fontSize: 18, padding: "12px 16px" }}
          />
          {/* Mobile: hamburger */}
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setDrawerOpen(true)}
            className="mobile-toggle"
            style={{ fontSize: 18, padding: "12px 16px" }}
          />
        </div>
        <Content style={{ padding: "16px", overflow: "auto" }}>
          <Outlet />
        </Content>
      </Layout>

      <style>{`
        .top-header {
          display: flex;
          align-items: center;
          background: #fff;
          border-bottom: 1px solid #f0f0f0;
        }
        .mobile-toggle { display: none; }
        @media (max-width: 767px) {
          .desktop-sider { display: none !important; }
          .desktop-toggle { display: none !important; }
          .mobile-toggle { display: inline-flex !important; }
        }
        @media (min-width: 768px) {
          .mobile-toggle { display: none !important; }
        }
      `}</style>
    </Layout>
  );
}
