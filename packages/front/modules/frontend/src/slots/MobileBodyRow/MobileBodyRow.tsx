import * as React from "react";
import { useMemo, useState } from "react";

import { alpha } from "@mui/material";

import TableRow from "@mui/material/TableRow";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";

import {
  ColumnType,
  IBodyRowSlot,
  SelectionMode,
  useListIntersectionConnect,
  useListProps,
  useListReload,
  useListSelectionState,
} from "react-declarative";
import clsx from "clsx";
import CheckboxBodyCell from "./MobileCheckboxBodyCell";
import CommonBodyCell, { CONTENT_CELL } from "./MobileCommonCell";
import makeStyles from "../../styles/makeStyles";

const useStyles = makeStyles()((theme) => ({
  root: {
    "&:nth-of-type(2n)": {
      background: alpha(
        theme.palette.getContrastText(theme.palette.background.paper),
        0.04,
      ),
    },
    "& > .MuiTableCell-root": {
      borderBottom: `1px solid ${theme.palette.divider}`,
    },
    overflow: "hidden",
  },
  row: {
    "& .MuiTableCell-root": {
      padding: "6px",
      overflow: "hidden",
    },
    marginBottom: 16,
  },
  noBorder: {
    "& .MuiTableCell-root": {
      borderBottom: "0 !important",
    },
  },
  disabled: {
    pointerEvents: "none",
    opacity: 0.5,
  },
  hideIfEmpty: {
    [`&:has(.${CONTENT_CELL} > :empty)`]: {
      display: "none",
    },
    [`&:has(.${CONTENT_CELL}:empty)`]: {
      display: "none",
    },
  },
}));

export const MobileBodyRow = ({
  row,
  mode,
  disabled,
  columns,
  fullWidth,
}: IBodyRowSlot) => {

  const connect = useListIntersectionConnect<HTMLTableRowElement>(row.id);

  const [menuOpened, setMenuOpened] = useState(false);
  const { classes } = useStyles();

  const props = useListProps();
  const reload = useListReload();

  const { selection, setSelection } = useListSelectionState();

  const { onRowClick, onRowAction, rowColor = () => "inherit" } = props;

  const handleClick = () => {
    if (!menuOpened) {
      if (
        props.withSelectOnRowClick &&
        props.selectionMode !== SelectionMode.None
      ) {
        if (props.selectionMode === SelectionMode.Single) {
          if (selection.has(row.id) && selection.size === 1) {
            selection.delete(row.id);
          } else {
            selection.clear();
            selection.add(row.id);
          }
        } else {
          selection.has(row.id)
            ? selection.delete(row.id)
            : selection.add(row.id);
        }
        setSelection(selection);
      } else {
        onRowClick && onRowClick(row, reload);
      }
    }
  };

  const handleMenuToggle = (opened: boolean) => {
    setMenuOpened(opened);
  };

  const handleAction = (action: string) => {
    onRowAction && onRowAction(action, row, reload);
  };

  const [firstCol, actionCol, cols] = useMemo(() => {
    const createRenderColumn =
      (
        colSpan: number,
        prefix: string,
        withLabel: boolean,
        disableGutters: boolean,
      ) =>
      (column: any, idx: number) => (
        <CommonBodyCell
          column={column}
          disabled={disabled}
          row={row}
          key={`${prefix}-${idx}`}
          className={clsx({
            [classes.hideIfEmpty]:
              column.type !== ColumnType.Component && props.withHideIfEmpty,
          })}
          idx={idx}
          mode={mode}
          colSpan={colSpan}
          fullWidth={fullWidth}
          onAction={handleAction}
          withLabel={withLabel}
          disableGutters={disableGutters}
          onMenuToggle={handleMenuToggle}
        />
      );

    const commonCols = columns.filter(({ type }) => type !== ColumnType.Action);

    const [actionCol = null] = columns
      .filter(({ type }) => type === ColumnType.Action)
      .map(createRenderColumn(1, "action", false, true));

    const firstCol = commonCols
      .slice(0, 1)
      .map(createRenderColumn(1, "first", true, true))
      .pop();

    const primaryCol = commonCols
      .filter(({ primary }) => primary)
      .map(createRenderColumn(1, "primary", true, true))
      .pop();

    const cols = (primaryCol ? commonCols : commonCols.slice(1)).map(
      createRenderColumn(actionCol ? 3 : 2, "col", true, false),
    );

    return [primaryCol || firstCol, actionCol, cols];
    //eslint-disable-next-line
  }, [fullWidth]);

  const maxWidth = useMemo(() => Math.max(fullWidth - 35, 0), [fullWidth]);

  return (
    <TableRow
      ref={connect}
      data-testId={row.id}
      className={classes.root}
      selected={selection.has(row.id)}
      sx={{
        maxWidth,
      }}
      onClick={handleClick}
    >
      <TableCell
        padding="none"
        sx={{
          background: rowColor(row) as any,
          maxWidth,
        }}
      >
        <Table
          className={clsx(classes.row, {
            [classes.disabled]: disabled,
          })}
        >
          <TableBody>
            <TableRow>
              <CheckboxBodyCell disabled={disabled} row={row} />
              {firstCol}
              {actionCol}
            </TableRow>
            {cols.map((col, idx) => (
              <TableRow
                className={clsx(idx === cols.length - 1 && classes.noBorder)}
                key={idx}
              >
                {col}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCell>
    </TableRow>
  );
};

export default MobileBodyRow;
