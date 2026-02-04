import { HtmlView, dayjs } from "react-declarative";
import {
  Avatar,
  Box,
  Chip,
  Divider,
  Paper,
  Stack,
  SxProps,
  Typography,
} from "@mui/material";
import React, { forwardRef } from "react";
import { NotificationModel } from "backtest-kit";
import {
  TrendingUp,
  TrendingDown,
  Close,
  Schedule,
  Cancel,
  ReportProblem,
  Error as ErrorIcon,
  NotificationImportant,
  SwapVert,
  Timeline,
  PlayArrow,
  Warning as WarningIcon,
} from "@mui/icons-material";

import ioc from "../../../../lib";
import sanitize from "../../../../config/sanitize";
import { t } from "../../../../i18n";

interface INotificationCardProps {
  className?: string;
  style?: React.CSSProperties;
  sx?: SxProps;
  item: NotificationModel;
}

const getNotificationColor = (item: NotificationModel): string => {
  switch (item.type) {
    case "signal.opened":
      return "#4CAF50";
    case "signal.closed":
      return "#2196F3";
    case "signal.scheduled":
      return "#FF9800";
    case "signal.cancelled":
      return "#9E9E9E";
    case "partial_profit.available":
    case "partial_profit.commit":
      return "#8BC34A";
    case "partial_loss.available":
    case "partial_loss.commit":
      return "#FF5722";
    case "breakeven.available":
    case "breakeven.commit":
      return "#00BCD4";
    case "activate_scheduled.commit":
      return "#4CAF50";
    case "trailing_stop.commit":
    case "trailing_take.commit":
      return "#673AB7";
    case "risk.rejection":
      return "#F44336";
    case "error.info":
    case "error.validation":
      return "#FF9800";
    case "error.critical":
      return "#D32F2F";
    default:
      return "#9E9E9E";
  }
};

const getNotificationIcon = (item: NotificationModel) => {
  const sx = { color: "white", fontSize: 28 };
  switch (item.type) {
    case "signal.opened":
      return <TrendingUp sx={sx} />;
    case "signal.closed":
      return <Close sx={sx} />;
    case "signal.scheduled":
      return <Schedule sx={sx} />;
    case "signal.cancelled":
      return <Cancel sx={sx} />;
    case "partial_profit.available":
    case "partial_profit.commit":
      return <TrendingUp sx={sx} />;
    case "partial_loss.available":
    case "partial_loss.commit":
      return <TrendingDown sx={sx} />;
    case "breakeven.available":
    case "breakeven.commit":
      return <SwapVert sx={sx} />;
    case "activate_scheduled.commit":
      return <PlayArrow sx={sx} />;
    case "trailing_stop.commit":
    case "trailing_take.commit":
      return <Timeline sx={sx} />;
    case "risk.rejection":
      return <ReportProblem sx={sx} />;
    case "error.info":
    case "error.validation":
      return <NotificationImportant sx={sx} />;
    case "error.critical":
      return <ErrorIcon sx={sx} />;
    default:
      return <WarningIcon sx={sx} />;
  }
};

const getNotificationTitle = (item: NotificationModel): string => {
  switch (item.type) {
    case "signal.opened":
      return `${t("Opened")} ${item.position.toUpperCase()} ${item.symbol}`;
    case "signal.closed":
      return `${t("Closed")} ${item.symbol} (${item.pnlPercentage > 0 ? "+" : ""}${item.pnlPercentage.toFixed(2)}%)`;
    case "signal.scheduled":
      return `${t("Scheduled")} ${item.position.toUpperCase()} ${item.symbol}`;
    case "signal.cancelled":
      return `${t("Cancelled")} ${item.symbol}`;
    case "partial_profit.available":
      return `${t("Partial profit")} ${item.level}% ${item.symbol}`;
    case "partial_profit.commit":
      return `${t("Profit fixed")} ${item.percentToClose}% ${item.symbol}`;
    case "partial_loss.available":
      return `${t("Partial loss")} ${item.level}% ${item.symbol}`;
    case "partial_loss.commit":
      return `${t("Loss fixed")} ${item.percentToClose}% ${item.symbol}`;
    case "breakeven.available":
      return `${t("Breakeven available")} ${item.symbol}`;
    case "breakeven.commit":
      return `${t("Breakeven set")} ${item.symbol}`;
    case "activate_scheduled.commit":
      return `${t("Activated")} ${item.position.toUpperCase()} ${item.symbol}`;
    case "trailing_stop.commit":
      return `${t("Trailing stop")} ${item.symbol}`;
    case "trailing_take.commit":
      return `${t("Trailing take")} ${item.symbol}`;
    case "risk.rejection":
      return `${t("Rejected")} ${item.position.toUpperCase()} ${item.symbol}`;
    case "error.info":
      return `${t("Error")}: ${item.message}`;
    case "error.validation":
      return `${t("Validation")}: ${item.message}`;
    case "error.critical":
      return `${t("Critical")}: ${item.message}`;
    default:
      return t("Unknown");
  }
};

const getNotificationTypeLabel = (item: NotificationModel): string => {
  switch (item.type) {
    case "signal.opened":
      return t("Signal Opened");
    case "signal.closed":
      return t("Signal Closed");
    case "signal.scheduled":
      return t("Signal Scheduled");
    case "signal.cancelled":
      return t("Signal Cancelled");
    case "partial_profit.available":
      return t("Partial Profit Available");
    case "partial_profit.commit":
      return t("Partial Profit Commit");
    case "partial_loss.available":
      return t("Partial Loss Available");
    case "partial_loss.commit":
      return t("Partial Loss Commit");
    case "breakeven.available":
      return t("Breakeven Available");
    case "breakeven.commit":
      return t("Breakeven Commit");
    case "activate_scheduled.commit":
      return t("Activated Scheduled");
    case "trailing_stop.commit":
      return t("Trailing Stop");
    case "trailing_take.commit":
      return t("Trailing Take");
    case "risk.rejection":
      return t("Risk Rejection");
    case "error.info":
      return t("Info Error");
    case "error.validation":
      return t("Validation Error");
    case "error.critical":
      return t("Critical Error");
    default:
      return t("Unknown");
  }
};

const handleNotificationClick = (item: NotificationModel) => {
  switch (item.type) {
    case "risk.rejection":
      ioc.layoutService.pickRisk(item.id);
      break;
    case "signal.opened":
      ioc.layoutService.pickSignalOpened(item.id);
      break;
    case "signal.closed":
      ioc.layoutService.pickSignalClosed(item.id);
      break;
    case "signal.scheduled":
      ioc.layoutService.pickSignalScheduled(item.id);
      break;
    case "signal.cancelled":
      ioc.layoutService.pickSignalCancelled(item.id);
      break;
    case "partial_profit.available":
      ioc.layoutService.pickPartialProfitAvailable(item.id);
      break;
    case "partial_profit.commit":
      ioc.layoutService.pickPartialProfitCommit(item.id);
      break;
    case "partial_loss.available":
      ioc.layoutService.pickPartialLossAvailable(item.id);
      break;
    case "partial_loss.commit":
      ioc.layoutService.pickPartialLossCommit(item.id);
      break;
    case "breakeven.available":
      ioc.layoutService.pickBreakevenAvailable(item.id);
      break;
    case "breakeven.commit":
      ioc.layoutService.pickBreakevenCommit(item.id);
      break;
    case "trailing_stop.commit":
      ioc.layoutService.pickTrailingStop(item.id);
      break;
    case "trailing_take.commit":
      ioc.layoutService.pickTrailingTake(item.id);
      break;
    case "activate_scheduled.commit":
      ioc.layoutService.pickActivateScheduled(item.id);
      break;
  }
};

const hasSymbol = (
  item: NotificationModel
): item is NotificationModel & { symbol: string } => {
  return "symbol" in item;
};

const hasPosition = (
  item: NotificationModel
): item is NotificationModel & { position: "long" | "short" } => {
  return "position" in item;
};

const hasPrices = (
  item: NotificationModel
): item is NotificationModel & {
  priceOpen: number;
  priceTakeProfit: number;
  priceStopLoss: number;
} => {
  return "priceOpen" in item && "priceTakeProfit" in item && "priceStopLoss" in item;
};

const hasTimestamp = (
  item: NotificationModel
): item is NotificationModel & { timestamp: number } => {
  return "timestamp" in item;
};

const hasPnl = (
  item: NotificationModel
): item is NotificationModel & { pnlPercentage: number } => {
  return "pnlPercentage" in item;
};

const hasLevel = (
  item: NotificationModel
): item is NotificationModel & { level: number } => {
  return "level" in item;
};

const hasPercentToClose = (
  item: NotificationModel
): item is NotificationModel & { percentToClose: number } => {
  return "percentToClose" in item;
};

const hasCurrentPrice = (
  item: NotificationModel
): item is NotificationModel & { currentPrice: number } => {
  return "currentPrice" in item;
};

const hasDuration = (
  item: NotificationModel
): item is NotificationModel & { duration: number } => {
  return "duration" in item;
};

const hasCloseReason = (
  item: NotificationModel
): item is NotificationModel & { closeReason: string } => {
  return "closeReason" in item;
};

const hasNote = (
  item: NotificationModel
): item is NotificationModel & { note: string } => {
  return "note" in item && !!item.note;
};

const hasMessage = (
  item: NotificationModel
): item is NotificationModel & { message: string } => {
  return "message" in item;
};

const hasRejectionNote = (
  item: NotificationModel
): item is NotificationModel & { rejectionNote: string } => {
  return "rejectionNote" in item;
};

export const NotificationCard = forwardRef(
  (
    { item, className, style, sx }: INotificationCardProps,
    ref: React.Ref<HTMLDivElement>,
  ) => {
    const color = getNotificationColor(item);
    const timestamp = hasTimestamp(item) ? item.timestamp : Date.now();

    return (
      <div className={className} style={style} ref={ref}>
        <Paper
          variant="outlined"
          onClick={() => handleNotificationClick(item)}
          sx={{
            transition: "box-shadow 0.2s ease",
            cursor: "pointer",
            display: "flex",
            alignItems: "stretch",
            justifyContent: "stretch",
            "&:hover": {
              boxShadow: 4,
            },
            ...sx,
          }}
        >
          <Box sx={{
            flex: 1,
            position: "relative", overflow: "hidden", height: "100%", width: "100%", borderRadius: "12px"
          }}>
            <Stack direction="row" spacing={2} sx={{ p: 2 }}>
              <Avatar
                sx={{
                  width: 56,
                  height: 56,
                  background: color,
                }}
              >
                {getNotificationIcon(item)}
              </Avatar>

              <Stack flex={1} spacing={1}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="flex-start"
                >
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {getNotificationTitle(item)}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ whiteSpace: "nowrap", ml: 2 }}
                  >
                    {dayjs(timestamp).format("HH:mm DD/MM/YYYY")}
                  </Typography>
                </Stack>

                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Chip
                    size="small"
                    label={getNotificationTypeLabel(item)}
                    sx={{
                      background: color,
                      color: "white",
                      fontWeight: 500,
                    }}
                  />
                  {hasSymbol(item) && (
                    <Chip size="small" label={item.symbol} variant="outlined" />
                  )}
                  {hasPosition(item) && (
                    <Chip
                      size="small"
                      label={item.position.toUpperCase()}
                      variant="outlined"
                      color={item.position === "long" ? "success" : "error"}
                    />
                  )}
                  {hasPnl(item) && (
                    <Chip
                      size="small"
                      label={`PnL: ${item.pnlPercentage > 0 ? "+" : ""}${item.pnlPercentage.toFixed(2)}%`}
                      color={item.pnlPercentage >= 0 ? "success" : "error"}
                      variant="outlined"
                    />
                  )}
                  {hasLevel(item) && (
                    <Chip
                      size="small"
                      label={`${t("Level")}: ${item.level}%`}
                      variant="outlined"
                    />
                  )}
                  {hasPercentToClose(item) && (
                    <Chip
                      size="small"
                      label={`${t("Close")}: ${item.percentToClose}%`}
                      variant="outlined"
                    />
                  )}
                  {hasDuration(item) && (
                    <Chip
                      size="small"
                      label={`${t("Duration")}: ${item.duration} ${t("min")}`}
                      variant="outlined"
                    />
                  )}
                  {hasCloseReason(item) && (
                    <Chip
                      size="small"
                      label={item.closeReason}
                      variant="outlined"
                      color="info"
                    />
                  )}
                </Stack>

                {hasPrices(item) && (
                  <>
                    <Divider sx={{ my: 1 }} />
                    <Stack direction="row" spacing={3} flexWrap="wrap">
                      <Typography variant="body2">
                        <Typography component="span" color="text.secondary">
                          {t("Entry")}:{" "}
                        </Typography>
                        {item.priceOpen}
                      </Typography>
                      {hasCurrentPrice(item) && (
                        <Typography variant="body2">
                          <Typography component="span" color="text.secondary">
                            {t("Current")}:{" "}
                          </Typography>
                          {item.currentPrice}
                        </Typography>
                      )}
                      <Typography variant="body2">
                        <Typography component="span" color="text.secondary">
                          {t("Take Profit")}:{" "}
                        </Typography>
                        {item.priceTakeProfit}
                      </Typography>
                      <Typography variant="body2">
                        <Typography component="span" color="text.secondary">
                          {t("Stop Loss")}:{" "}
                        </Typography>
                        {item.priceStopLoss}
                      </Typography>
                    </Stack>
                  </>
                )}
              </Stack>
            </Stack>

            {hasNote(item) && (
              <Box sx={{ px: 2, pb: 2 }}>
                <Divider sx={{ mb: 1.5 }} />
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    whiteSpace: "pre-wrap",
                    wordWrap: "break-word",
                  }}
                >
                  <HtmlView
                    style={{ textWrap: "wrap" }}
                    config={sanitize}
                    handler={() => item.note!}
                  />
                </Box>
              </Box>
            )}

            {hasRejectionNote(item) && (
              <Box sx={{ px: 2, pb: 2 }}>
                <Divider sx={{ mb: 1.5 }} />
                <Typography variant="body2" color="error">
                  {item.rejectionNote}
                </Typography>
              </Box>
            )}

            {hasMessage(item) && !hasNote(item) && (
              <Box sx={{ px: 2, pb: 2 }}>
                <Divider sx={{ mb: 1.5 }} />
                <Typography variant="body2" color="text.secondary">
                  {item.message}
                </Typography>
              </Box>
            )}

            <Box
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                bottom: 0,
                width: 6,
                zIndex: 1,
                background: color,
              }}
            />
          </Box>

        </Paper>
      </div>
    );
  },
);

export default NotificationCard;
