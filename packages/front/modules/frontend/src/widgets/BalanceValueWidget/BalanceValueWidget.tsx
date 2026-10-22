import { memo, useMemo } from "react";
import classNames from "clsx";

import { Paper, Typography } from "@mui/material";
import { formatAmount } from "react-declarative";

import { makeStyles } from "../../styles";
import roundNumber from "../../utils/roundNumber";
import { t } from "../../i18n";

export enum BalanceBackgroundColor {
  Red = "#DD4049",
  Orange = "#F3A43A",
  Green = "#2EA96F",
  Blue = "#2979ff",
  Violet = "#d500f9",
}

export enum BalanceBackgroundMode {
  Semi = "semi",
  Solid = "solid",
  Unset = "unset",
}

export interface IBalanceValueWidgetProps {
  className?: string;
  style?: React.CSSProperties;
  backgroundMode?: BalanceBackgroundMode;
  backgroundColor?: BalanceBackgroundColor;
  headerLabel?: React.ReactNode;
  footerLabel?: React.ReactNode;
  roundDigits?: number;
  valueUnit?: string;
  onClick?: () => void;
  value: number;
  caption?: string;
}

const useStyles = makeStyles()((theme) => ({
  root: {
    overflow: "clip",
    height: "100%",
    width: "100%",
    display: "flex",
    alignItems: "stretch",
    justifyContent: "stretch",
    flexDirection: "column",
  },
  click: {
    cursor: "pointer",
  },
  header: {
    minHeight: "36px",
    display: "flex",
    alignItems: "center",
    whiteSpace: "nowrap",
    fontWeight: 700,
    fontSize: "18px",
    gap: "8px",
    overflow: "clip",
    padding: "10px",
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  content: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
  },
  value: {
    display: "flex",
    alignItems: "baseline",
    flexDirection: "row",
    gap: "2.5px",
    "& > *": { fontWeight: "bold" },
    "& > :first-of-type": {
      fontSize: "22px",
    },
    "& > :last-of-type": { fontSize: "16px", opacity: 0.85 },
  },
  captionRoot: {
    position: "relative",
    width: "100%",
    height: "0px",
  },
  captionContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    // The card sits in a flex chain of One (min-width: auto all the way down), so a
    // nowrap footer would widen the whole card past its column. inline-size containment
    // keeps the footer out of the card's intrinsic width: the card takes the column,
    // the label gets clipped with an ellipsis.
    contain: "inline-size",
    minHeight: "32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "stretch",
    whiteSpace: "nowrap",
    gap: "8px",
    overflow: "clip",
    padding: "10px",
    borderTop: `1px solid ${theme.palette.divider}`,
    "& > *": { flex: 1 },
  },
  footerLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  solidText: {
    color: "#fff",
    "& svg": { fill: "#fff" },
  },
  themeText: {
    color: theme.palette.text.primary,
    "& svg": { fill: theme.palette.text.primary },
  },
}));

export const BalanceValueWidget = memo(
  ({
    className,
    style,
    backgroundMode = BalanceBackgroundMode.Solid,
    backgroundColor = BalanceBackgroundColor.Blue,
    headerLabel,
    footerLabel,
    roundDigits = 2,
    valueUnit = t("Unit"),
    onClick,
    value,
    caption,
  }: IBalanceValueWidgetProps) => {
    const { classes } = useStyles();

    const isSolid = backgroundMode === BalanceBackgroundMode.Solid;
    const isSemi = backgroundMode === BalanceBackgroundMode.Semi;

    const headerStyle = useMemo(
      () => ({
        ...((isSolid || isSemi) && { backgroundColor }),
      }),
      [backgroundColor, isSolid, isSemi],
    );

    const bodyStyle = useMemo(
      () => ({
        ...(isSolid && { backgroundColor }),
      }),
      [backgroundColor, isSolid],
    );

    return (
      <Paper
        className={classNames(className, classes.root, {
          [classes.click]: !!onClick,
        })}
        onClick={onClick}
        style={style}
      >
        <div
          className={classNames(classes.header, {
            [classes.solidText]: isSolid || isSemi,
            [classes.themeText]: !isSolid && !isSemi,
          })}
          style={headerStyle}
        >
          {headerLabel}
        </div>
        <div className={classes.content} style={bodyStyle}>
          <div
            className={classNames(classes.value, {
              [classes.solidText]: isSolid,
              [classes.themeText]: !isSolid,
            })}
          >
            <Typography fontWeight="bold">
              {formatAmount(roundNumber(value, roundDigits))}
            </Typography>
            <Typography>{valueUnit}</Typography>
          </div>
          {!!caption && (
            <div className={classes.captionRoot}>
              <div className={classes.captionContainer}>
                <Typography
                  variant="caption"
                  sx={{
                    opacity: 0.5,
                    fontSize: 12,
                    textAlign: "center",
                    padding: "0 8px",
                  }}
                >
                  {caption}
                </Typography>
              </div>
            </div>
          )}
        </div>
        {!!footerLabel && (
          <div
            className={classNames(classes.footer, {
              [classes.solidText]: isSolid,
              [classes.themeText]: !isSolid,
            })}
            style={bodyStyle}
          >
            <span className={classes.footerLabel} title={typeof footerLabel === "string" ? footerLabel : undefined}>
              {footerLabel}
            </span>
          </div>
        )}
      </Paper>
    );
  },
);

export default BalanceValueWidget;
