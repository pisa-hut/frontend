import { Layout, Menu } from "antd";
import {
  DashboardOutlined,
  UnorderedListOutlined,
  FileTextOutlined,
  ProjectOutlined,
  AppstoreOutlined,
  ClusterOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Outlet, useNavigate, useLocation } from "react-router-dom";

const { Sider, Content } = Layout;

const menuItems = [
  { key: "/", icon: <DashboardOutlined />, label: "Dashboard" },
  { key: "/tasks", icon: <UnorderedListOutlined />, label: "Tasks" },
  { key: "/scenarios", icon: <FileTextOutlined />, label: "Scenarios" },
  { key: "/plans", icon: <ProjectOutlined />, label: "Plans" },
  { key: "/resources", icon: <AppstoreOutlined />, label: "Resources" },
  { key: "/executors", icon: <ClusterOutlined />, label: "Executors" },
  { key: "/init", icon: <ThunderboltOutlined />, label: "Init" },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const selectedKey =
    menuItems
      .filter((item) => item.key !== "/")
      .find((item) => location.pathname.startsWith(item.key))?.key ??
    "/";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider breakpoint="lg" collapsedWidth="80">
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
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
