import * as React from "react";

import TableCell from "@mui/material/TableCell";
import { ICheckboxCellSlot, ListDefaultSlots } from "react-declarative";
import { makeStyles } from "../../styles";

const useStyles = makeStyles()({
  root: {
    position: "relative",
    width: 48,
    maxWidth: 48,
  },
});

export const MobileCheckboxBodyCell = (props: ICheckboxCellSlot) => {
  const { classes } = useStyles();
  return (
    <TableCell className={classes.root} padding="checkbox">
      <ListDefaultSlots.CheckboxCell {...props} />
    </TableCell>
  );
};

export default MobileCheckboxBodyCell;
