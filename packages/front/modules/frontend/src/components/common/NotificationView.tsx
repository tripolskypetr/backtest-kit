import {
  ActionIcon,
  Async,
  HtmlView,
  LoaderView,
  Subject,
  VirtualView,
} from "react-declarative";
import {
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  ListSubheader,
  Stack,
  Tab,
  Tooltip,
  alpha,
} from "@mui/material";

import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import IconButton from "@mui/material/IconButton";
import Popover from "@mui/material/Popover";
import { useState } from "react";
import Typography from "@mui/material/Typography";
import WarningIcon from "@mui/icons-material/Warning";
import clsx from "clsx";
import dayjs from "dayjs";

import TabList from "@mui/lab/TabList";
import TabContext from "@mui/lab/TabContext";
import {
  ManageSearch,
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
} from "@mui/icons-material";
import sanitize from "../../config/sanitize";
import { makeStyles } from "../../styles";

import NotificationIcon from "@mui/icons-material/Notifications";
import ioc from "../../lib";
import { NotificationModel } from "backtest-kit";
import { t } from "../../i18n";
import { get } from "lodash";

const reloadSubject = new Subject<void>();

const Loader = () => (
  <LoaderView
    sx={{
      width: 350,
      height: "calc(100% - 96px)",
    }}
  />
);

const useStyles = makeStyles()((theme) => ({
  list: {
    pt: 1,
    pb: 1,
    "& > *": {
      paddingTop: 0,
      paddingBottom: 0,
      "& > *": {
        paddingTop: 0,
        paddingBottom: 0,
      },
    },
  },
  listItemAccient: {
    background: alpha(
      theme.palette.getContrastText(theme.palette.background.paper),
      0.018
    ),
  },
}));

const getNotificationColor = (item: NotificationModel): string | undefined => {
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
      return undefined;
  }
};

const getNotificationIcon = (item: NotificationModel) => {
  const sx = { color: "white", mt: "-1px" };
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
      return <WarningIcon sx={{ ...sx, mt: "-2px" }} />;
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
      return `${t("Unknown")} ${get(item, "type")}`;
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

export const NotificationView = () => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>();
  const { classes } = useStyles();

  const [loading, setLoading] = useState(0);
  const [tab, setTab] = useState<"all" | "signals">("all");

  let open = false;

  return (
    <>
      <ActionIcon
        onClick={async ({ currentTarget }) => {
          reloadSubject.next();
          setAnchorEl(currentTarget);
        }}
        onLoadStart={() => setLoading((loading) => loading + 1)}
        onLoadEnd={() => setLoading((loading) => loading - 1)}
        color="inherit"
        sx={{
          ml: {
            xs: 1,
            md: 2,
          },
          mr: {
            xs: 1,
            sm: 2,
          },
        }}
      >
        <Tooltip title={t("Notifications")}>
          <NotificationIcon
            sx={{ color: "white !important", opacity: loading ? 0.8 : 1.0 }}
          />
        </Tooltip>
      </ActionIcon>
      <Popover
        open={!!anchorEl}
        anchorEl={anchorEl}
        hidden={open}
        onClose={() => {
          setAnchorEl(null);
          setTab("all");
        }}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
      >
        <TabContext value={tab}>
          <List
            sx={{
              width: 350,
              height: 448,
            }}
            subheader={
              <Stack direction="row" justifyContent="space-between">
                <ListSubheader
                  component={Typography}
                  sx={{ fontWeight: "bold" }}
                >
                  {tab === "all" ? t("All") : t("Signals")}
                </ListSubheader>
                <TabList
                  onChange={(_, tab) => setTab(tab)}
                  sx={{
                    "& .MuiTabs-indicator": {
                      background: "#3F51B5 !important",
                    },
                  }}
                  color="secondary"
                  variant="standard"
                >
                  <Tab icon={<ManageSearch />} value="all" />
                  <Tab icon={<TrendingUp />} value="signals" />
                </TabList>
              </Stack>
            }
          >
            {tab === "all" && (
              <Async Loader={Loader}>
                {async () => {
                  const items = await ioc.notificationViewService.getList();
                  return (
                    <VirtualView
                      className={classes.list}
                      sx={{
                        width: 350,
                        height: "calc(100% - 48px)",
                      }}
                    >
                      {items.map((item, idx) => (
                        <ListItem
                          className={clsx({
                            [classes.listItemAccient]: idx % 2 === 0,
                          })}
                          key={item.id}
                          disableGutters
                        >
                          <ListItemButton
                            onClick={() => {
                              handleNotificationClick(item);
                              setAnchorEl(null);
                            }}
                          >
                            <ListItemAvatar>
                              <Avatar
                                sx={{
                                  background: getNotificationColor(item),
                                }}
                              >
                                {getNotificationIcon(item)}
                              </Avatar>
                            </ListItemAvatar>
                            <ListItemText
                              primary={
                                <HtmlView
                                  config={sanitize}
                                  handler={() => getNotificationTitle(item)}
                                />
                              }
                              secondary={"timestamp" in item ? dayjs(item.timestamp).format(
                                "HH:mm DD/MM/YYYY"
                              ) : "N/A"}
                            />
                            <IconButton disableRipple>
                              <ArrowForwardIcon />
                            </IconButton>
                          </ListItemButton>
                        </ListItem>
                      ))}
                    </VirtualView>
                  );
                }}
              </Async>
            )}
            {tab === "signals" && (
              <Async Loader={Loader}>
                {async () => {
                  const rawItems = await ioc.notificationViewService.getList();
                  const items = rawItems.filter((item) =>
                    item.type.startsWith("signal.")
                  );
                  return (
                    <VirtualView
                      className={classes.list}
                      sx={{
                        width: 350,
                        height: "calc(100% - 48px)",
                      }}
                    >
                      {items.map((item, idx) => (
                        <ListItem
                          className={clsx({
                            [classes.listItemAccient]: idx % 2 === 0,
                          })}
                          key={item.id}
                          disableGutters
                        >
                          <ListItemButton
                            onClick={() => {
                              handleNotificationClick(item);
                              setAnchorEl(null);
                            }}
                          >
                            <ListItemAvatar>
                              <Avatar
                                sx={{
                                  background: getNotificationColor(item),
                                }}
                              >
                                {getNotificationIcon(item)}
                              </Avatar>
                            </ListItemAvatar>
                            <ListItemText
                              primary={
                                <HtmlView
                                  config={sanitize}
                                  handler={() => getNotificationTitle(item)}
                                />
                              }
                              secondary={"timestamp" in item ? dayjs(item.timestamp).format(
                                "HH:mm DD/MM/YYYY"
                              ) : "N/A"}
                            />
                            <IconButton disableRipple>
                              <ArrowForwardIcon />
                            </IconButton>
                          </ListItemButton>
                        </ListItem>
                      ))}
                    </VirtualView>
                  );
                }}
              </Async>
            )}
          </List>
        </TabContext>
      </Popover>
    </>
  );
};

export default NotificationView;
