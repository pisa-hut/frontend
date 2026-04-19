import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ConfigProvider } from "antd";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Tasks from "./pages/Tasks";
import Scenarios from "./pages/Scenarios";
import Plans from "./pages/Plans";
import Resources from "./pages/Resources";
import Executors from "./pages/Executors";
import Init from "./pages/Init";
import Upload from "./pages/Upload";

export default function App() {
  return (
    <ConfigProvider>
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
