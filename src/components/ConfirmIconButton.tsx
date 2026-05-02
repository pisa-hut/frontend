import { useState } from "react";
import { Button, Popconfirm, Tooltip } from "antd";
import type { ButtonProps } from "antd";
import type React from "react";

interface Props extends Omit<ButtonProps, "onClick"> {
  /** Hover hint shown on the trigger. */
  tooltip: React.ReactNode;
  /** Confirmation prompt that opens on click. */
  confirmTitle: React.ReactNode;
  onConfirm: () => void;
}

/** Icon button that pairs a hover-tooltip with a click-popconfirm.
 *
 *  AntD's default behavior leaves the tooltip visible while the
 *  popconfirm is open, so the two popovers visually collide right next
 *  to the trigger. This component synchronises the tooltip's `open`
 *  prop with the popconfirm's open state — tooltip hides for as long as
 *  the popconfirm shows, then returns to its default hover behavior.
 */
export default function ConfirmIconButton({ tooltip, confirmTitle, onConfirm, ...btn }: Props) {
  const [popOpen, setPopOpen] = useState(false);
  return (
    <Popconfirm
      title={confirmTitle}
      onConfirm={onConfirm}
      onOpenChange={setPopOpen}
      disabled={btn.disabled}
    >
      <Tooltip title={tooltip} open={popOpen ? false : undefined}>
        <Button {...btn} />
      </Tooltip>
    </Popconfirm>
  );
}
