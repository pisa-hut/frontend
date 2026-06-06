import { Drawer } from "antd";
import LogView, { type LogViewProps } from "./LogView";

/** Page-level wrapper: shows LogView in a right-side drawer. On the
 *  /tasks/:id page this is a single drawer (not nested). Inside the
 *  in-table task detail drawer we render LogView inline instead, to
 *  avoid a drawer-in-drawer. */
export default function LogDrawer(props: LogViewProps) {
  return (
    <Drawer
      placement="right"
      width="min(1200px, 90vw)"
      open={props.run !== null}
      onClose={props.onClose}
      closable={false}
      styles={{ header: { display: "none" }, body: { padding: 0 } }}
    >
      <LogView {...props} />
    </Drawer>
  );
}
