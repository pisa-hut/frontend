import { useState, useCallback, useMemo } from "react";
import { Table } from "antd";
import type { TableProps } from "antd";
import { Resizable } from "react-resizable";
import "react-resizable/css/styles.css";

const isTouchDevice =
  typeof window !== "undefined" &&
  ("ontouchstart" in window || navigator.maxTouchPoints > 0);

function ResizableTitle(
  props: React.HTMLAttributes<HTMLTableCellElement> & {
    onResize?: (e: React.SyntheticEvent, data: { size: { width: number } }) => void;
    width?: number;
  }
) {
  const { onResize, width, ...restProps } = props;
  if (!width || !onResize) {
    return <th {...restProps} />;
  }
  return (
    <Resizable
      width={width}
      height={0}
      handle={
        <span
          className="react-resizable-handle"
          style={{ position: "absolute", right: -5, bottom: 0, top: 0, cursor: "col-resize", width: 10 }}
          onClick={(e) => e.stopPropagation()}
        />
      }
      onResize={onResize}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      <th {...restProps} />
    </Resizable>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ResizableTable<T extends Record<string, any>>(
  props: TableProps<T>
) {
  const { columns: inputColumns, ...rest } = props;

  const [colWidths, setColWidths] = useState<number[]>(() =>
    (inputColumns ?? []).map((col) => (col as { width?: number }).width ?? 150)
  );

  const handleResize = useCallback(
    (index: number) =>
      (_: unknown, { size }: { size: { width: number } }) => {
        setColWidths((prev) => {
          const next = [...prev];
          next[index] = size.width;
          return next;
        });
      },
    []
  );

  const columns = useMemo(
    () =>
      (inputColumns ?? []).map((col, index) => ({
        ...col,
        width: colWidths[index],
        ...(isTouchDevice
          ? {}
          : {
              onHeaderCell: () => ({
                width: colWidths[index],
                onResize: handleResize(index),
              }),
            }),
      })),
    [inputColumns, colWidths, handleResize]
  );

  return (
    <Table<T>
      {...rest}
      columns={columns}
      tableLayout="fixed"
      scroll={{ x: "max-content" }}
      size="small"
      {...(isTouchDevice
        ? {}
        : {
            components: {
              header: { cell: ResizableTitle },
            },
          })}
    />
  );
}
