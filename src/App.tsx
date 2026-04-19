import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ConfigProvider, theme } from "antd";
import { ThemeProvider, useTheme } from "./components/ThemeContext";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Tasks from "./pages/Tasks";
import Scenarios from "./pages/Scenarios";
import Plans from "./pages/Plans";
import Resources from "./pages/Resources";
import Executors from "./pages/Executors";
import Init from "./pages/Init";
import Upload from "./pages/Upload";

function AppInner() {
  const { mode } = useTheme();
  return (
    <ConfigProvider
      theme={{
        algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/scenarios" element={<Scenarios />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/executors" element={<Executors />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/init" element={<Init />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
