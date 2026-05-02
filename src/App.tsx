import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ConfigProvider, Spin, theme } from "antd";
import { ThemeProvider, useTheme } from "./components/ThemeContext";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";

// Lazy-load every non-home page so the dashboard's first-paint
// doesn't have to wait on the bundle for a page the user may never
// visit. Each page becomes its own chunk in the build output, served
// only when its route is navigated to.
const Tasks = lazy(() => import("./pages/Tasks"));
const Scenarios = lazy(() => import("./pages/Scenarios"));
const Plans = lazy(() => import("./pages/Plans"));
const Resources = lazy(() => import("./pages/Resources"));
const Executors = lazy(() => import("./pages/Executors"));
const Upload = lazy(() => import("./pages/Upload"));

function PageLoading() {
  return (
    <div style={{ display: "flex", justifyContent: "center", marginTop: 80 }}>
      <Spin size="large" />
    </div>
  );
}

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
            <Route
              path="/tasks"
              element={
                <Suspense fallback={<PageLoading />}>
                  <Tasks />
                </Suspense>
              }
            />
            <Route
              path="/scenarios"
              element={
                <Suspense fallback={<PageLoading />}>
                  <Scenarios />
                </Suspense>
              }
            />
            <Route
              path="/plans"
              element={
                <Suspense fallback={<PageLoading />}>
                  <Plans />
                </Suspense>
              }
            />
            <Route
              path="/resources"
              element={
                <Suspense fallback={<PageLoading />}>
                  <Resources />
                </Suspense>
              }
            />
            <Route
              path="/executors"
              element={
                <Suspense fallback={<PageLoading />}>
                  <Executors />
                </Suspense>
              }
            />
            <Route
              path="/upload"
              element={
                <Suspense fallback={<PageLoading />}>
                  <Upload />
                </Suspense>
              }
            />
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
