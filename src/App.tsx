import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ConfigProvider, Spin, theme } from "antd";
import { ThemeProvider } from "./components/ThemeContext";
import AppLayout from "./components/AppLayout";
import Control from "./pages/Control";

// Lazy-load every non-home page so Control's first-paint doesn't have
// to wait on the bundle for a page the user may never visit. Each page
// becomes its own chunk in the build output, served only when its
// route is navigated to.
const Tasks = lazy(() => import("./pages/Tasks"));
const TaskDetail = lazy(() => import("./pages/TaskDetail"));
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

// Console design language. PISA is a dark-only ground-control deck: a
// near-black slate canvas, a single cyan-phosphor accent, square-ish
// radii, hairline cool borders, and a characterful display font
// (Chakra Petch) paired with IBM Plex Mono for IDs/numerics. These
// tokens flow through every AntD surface, so the whole app inherits the
// look — the page-level markup barely changes. The HUD chrome (corner
// brackets, scanlines, glow) lives in index.css, keyed off AntD classes.
const ACCENT = "#38bdf8";
const DISPLAY_FONT =
  '"Chakra Petch", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

function AppInner() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: ACCENT,
          colorInfo: ACCENT,
          colorBgBase: "#070b11",
          colorBgLayout: "#070b11",
          colorBgContainer: "#0c131c",
          colorBgElevated: "#0f1822",
          colorBorder: "rgba(120,160,200,0.18)",
          colorBorderSecondary: "rgba(120,160,200,0.10)",
          colorText: "#c8d6e5",
          colorTextSecondary: "#7d8fa1",
          borderRadius: 4,
          fontFamily: DISPLAY_FONT,
          fontSize: 14,
        },
        components: {
          Layout: {
            siderBg: "#070b11",
            headerBg: "#0c131c",
            bodyBg: "#070b11",
          },
          Menu: {
            darkItemBg: "#070b11",
            darkItemSelectedBg: "rgba(56,189,248,0.16)",
            darkItemSelectedColor: ACCENT,
            darkItemHoverBg: "rgba(120,160,200,0.08)",
          },
          Card: { borderRadiusLG: 4 },
          Table: { headerBg: "#101a25", borderColor: "rgba(120,160,200,0.12)" },
          Tag: { borderRadiusSM: 3 },
          Button: { borderRadius: 4, controlHeight: 32 },
          Modal: { borderRadiusLG: 6, contentBg: "#0c131c", headerBg: "#0c131c" },
          Statistic: { contentFontSize: 24 },
        },
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Control />} />
            {/* Control is the home page now; keep the old path bookmarkable. */}
            <Route path="/control" element={<Navigate to="/" replace />} />
            <Route
              path="/tasks"
              element={
                <Suspense fallback={<PageLoading />}>
                  <Tasks />
                </Suspense>
              }
            />
            <Route
              path="/tasks/:taskId"
              element={
                <Suspense fallback={<PageLoading />}>
                  <TaskDetail />
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
