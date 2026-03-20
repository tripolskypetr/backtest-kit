import { makeStyles } from "../../../styles";

import { ActionButton } from "react-declarative";

import Paper from "@mui/material/Paper";

import {
  OneTyped,
  FieldType,
  TypedField,
  formatAmount,
  wordForm,
} from "react-declarative";
import IconPhoto from "./IconPhoto";
import { ConfirmModel } from "../model/Confirm.model";
import { IconButton, Typography } from "@mui/material";
import { Info } from "@mui/icons-material";
import useCandleView from "../../../view/useCandleView";

type Data = {
    takeProfitPrice: number;
    stopLossPrice: number;
    currentPrice: number;
    comment: string;
    info: string;
    date: string;
    estimatedMinutes: number;
}

interface ICurrencyProps extends ConfirmModel {
  symbol: string;
  onConfirm: (
    symbol: string,
    displayName: string,
    data: Data
  ) => void;
  onReject: (
    symbol: string,
    displayName: string,
    data: Data
  ) => void;
}

const useStyles = makeStyles()((theme) => ({
  root: {
    position: "relative",
    background: "#0001",
    overflow: "hidden",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    height: "48px",
    width: "calc(100% - 16px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginLeft: "8px",
    marginRight: "8px",
  },
  container: {
    marginTop: "48px",
    width: "100%",
    background: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    display: "flex",
    width: "100%",
    padding: theme.spacing(1),
    paddingBottom: theme.spacing(2),
    gap: 10,
    flexDirection: "column",
  },
  avatar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "128px",
    minWidth: "128px",
  },
  accept: {
    color: "white",
  },
  decline: {},
}));

const fields: TypedField[] = [
  {
    type: FieldType.Text,
    name: "position",
    title: "Позиция",
    compute: (obj) => {
      const isLong = obj.position === "long";
      return isLong ? "🔵 LONG (прибыль при росте)" : "🟠 SHORT (прибыль при падении)";
    },
    readonly: true,
  },
  {
    type: FieldType.Text,
    name: "currentPrice",
    hidden: true,
    title: "Цена на момент сигнала",
    compute: (obj) =>
      obj.currentPrice ? `${formatAmount(obj.currentPrice)}$` : "N/A",
    readonly: true,
  },
  {
    type: FieldType.Text,
    columns: "6",
    name: "takeProfitPrice",
    title: "Take Profit",
    compute: (obj) =>
      obj.takeProfitPrice ? `${formatAmount(obj.takeProfitPrice)}$` : "N/A",
    readonly: true,
  },
  {
    type: FieldType.Text,
    columns: "6",
    name: "stopLossPrice",
    title: "Stop Loss",
    compute: (obj) =>
      obj.stopLossPrice ? `${formatAmount(obj.stopLossPrice)}$` : "N/A",
    readonly: true,
  },
  {
    type: FieldType.Text,
    name: "estimatedMinutes",
    title: "ETA до TP",
    compute: (obj) =>
      obj.estimatedMinutes
        ? `~${wordForm(obj.estimatedMinutes, { one: "минута", two: "минуты", many: "минут" })}`
        : "N/A",
    readonly: true,
  },
  {
    type: FieldType.Text,
    fieldBottomMargin: "0",
    name: "comment",
    readonly: true,
    inputRows: 3,
    compute: (obj) => (obj.comment ? `${obj.comment}` : "N/A"),
  },
];

export const Currency = ({
  symbol,
  displayName,
  onConfirm,
  onReject,
  ...data
}: ICurrencyProps) => {
  const { classes } = useStyles();

  const pickData = useCandleView();

  return (
    <Paper className={classes.root}>
      <div className={classes.header}>
        <Typography
          variant="h6"
          sx={{
            opacity: 0.8,
          }}
        >
          {displayName || symbol}
        </Typography>
        <IconButton onClick={() => pickData(symbol)} size="small">
          <Info />
        </IconButton>
      </div>
      <div className={classes.container}>
        <div className={classes.content}>
          <div className={classes.avatar}>
            <IconPhoto symbol={symbol} />
          </div>
          <OneTyped handler={() => data} fields={fields} sx={{ mb: 2 }} />
          <ActionButton
            className={classes.accept}
            onClick={async () => await onConfirm(symbol, displayName, data)}
            variant="contained"
            color="success"
          >
            Купить
          </ActionButton>
          <ActionButton
            className={classes.decline}
            onClick={async () => await onReject(symbol, displayName, data)}
            variant="outlined"
            color="error"
          >
            Отмена
          </ActionButton>
        </div>
      </div>
    </Paper>
  );
};

export default Currency;
