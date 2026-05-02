import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmIconButton from "../ConfirmIconButton";

describe("ConfirmIconButton", () => {
  it("opens the popconfirm on click and fires onConfirm when 'OK' is pressed", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmIconButton tooltip="hover hint" confirmTitle="Are you sure?" onConfirm={onConfirm}>
        Stop
      </ConfirmIconButton>,
    );

    // Trigger the popconfirm
    await user.click(screen.getByRole("button", { name: /stop/i }));

    // The confirm prompt is now mounted in a portal
    expect(await screen.findByText("Are you sure?")).toBeInTheDocument();

    // Click OK — antd renders this as the second button inside the popconfirm
    await user.click(screen.getByRole("button", { name: /ok/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("does not fire onConfirm when 'Cancel' is pressed", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmIconButton tooltip="hover hint" confirmTitle="Are you sure?" onConfirm={onConfirm}>
        Stop
      </ConfirmIconButton>,
    );

    await user.click(screen.getByRole("button", { name: /stop/i }));
    await screen.findByText("Are you sure?");
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("does not open the popconfirm when the button is disabled", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmIconButton
        tooltip="hover hint"
        confirmTitle="Are you sure?"
        onConfirm={onConfirm}
        disabled
      >
        Stop
      </ConfirmIconButton>,
    );

    await user.click(screen.getByRole("button", { name: /stop/i }));

    // No prompt should appear; assert the title text is absent.
    expect(screen.queryByText("Are you sure?")).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
