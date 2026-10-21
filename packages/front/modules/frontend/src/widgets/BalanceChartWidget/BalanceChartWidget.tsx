import { useMemo } from "react";

import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { SxProps } from "@mui/system";

import { makeStyles } from "../../styles";

import BalanceChart from "./components/BalanceChart";
import { IBalancePoint } from "../../model/Budget.model";
import { t } from "../../i18n";

const useStyles = makeStyles()({
  container: {
    position: "relative",
    margin: 0,
    padding: 0,
    overflow: "clip",
  },
  editor: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  empty: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.5,
  },
});

interface IBalanceChartWidgetProps {
  items: IBalancePoint[];
  sx: SxProps;
}

export const BalanceChartWidget = ({ items, sx }: IBalanceChartWidgetProps) => {
  const { classes } = useStyles();

  const points = useMemo(
    () => [...items].sort(({ timestamp: a }, { timestamp: b }) => a - b),
    [items],
  );

  return (
    <Paper className={classes.container} sx={sx}>
      {points.length ? (
        <div className={classes.editor}>
          <BalanceChart items={points} />
        </div>
      ) : (
        <div className={classes.empty}>
          <Typography variant="h6">{t("No data")}</Typography>
        </div>
      )}
    </Paper>
  );
};

export default BalanceChartWidget;
