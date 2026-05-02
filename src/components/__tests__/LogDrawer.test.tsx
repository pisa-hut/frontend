import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import LogDrawer from "../LogDrawer";
import type { TaskResponse, TaskRunResponse } from "../../api/types";

// Mock the api client — getTaskRunLog is the only one the drawer
// hits on mount; the SSE feed is exercised separately.
vi.mock("../../api/client", () => ({
  api: {
    getTaskRunLog: vi.fn().mockResolvedValue("(no log captured)"),
    stopTask: vi.fn().mockResolvedValue(undefined),
    runTask: vi.fn().mockResolvedValue(undefined),
    archiveTask: vi.fn().mockResolvedValue(undefined),
  },
}));

// SSE hook: stub to a no-op (still calls the registered callback path
// but never emits). Real SSE behavior is integration-tested elsewhere.
vi.mock("../../api/events", () => ({
  usePisaEvents: vi.fn(),
}));

const sampleTask: TaskResponse = {
  id: 42,
  plan_id: 1,
  av_id: 1,
  simulator_id: 1,
  sampler_id: 1,
  task_status: "completed",
  created_at: "2026-05-01T00:00:00Z",
  attempt_count: 2,
  archived: false,
};

const sampleRun: TaskRunResponse = {
  id: 7,
  task_id: 42,
  executor_id: 3,
  attempt: 2,
  run_time_env: {},
  task_run_status: "completed",
  started_at: "2026-05-01T00:01:00Z",
  finished_at: "2026-05-01T00:02:00Z",
  error_message: null,
};

describe("LogDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing visible when `run` is null", () => {
    render(<LogDrawer run={null} onClose={() => {}} />);
    // antd Drawer with open=false unmounts (or hides) the body — the
    // task identity header should not be in the document.
    expect(screen.queryByText(/Task #/)).not.toBeInTheDocument();
  });

  it("renders task identity header when given a task + run", async () => {
    render(<LogDrawer run={sampleRun} task={sampleTask} taskLabel="my-plan" onClose={() => {}} />);

    expect(await screen.findByText("Task #42")).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(screen.getByText("my-plan")).toBeInTheDocument();
    expect(screen.getByText(/Attempt #2/)).toBeInTheDocument();
  });
});
