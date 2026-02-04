import {
  useActualState,
  useModalManager,
  useTabsModal,
  History,
  useActualRef,
  ActionIcon,
  ttl,
} from "react-declarative";
import { ArrowBack, Close, Download } from "@mui/icons-material";
import { createMemoryHistory } from "history";
import routes from "./routes";
import { CC_FULLSCREEN_SIZE_REQUEST } from "../../config/params";
import tabs from "./tabs";
import { Box, Stack } from "@mui/material";
import ioc from "../../lib";
import { PartialLossCommitNotification } from "backtest-kit";

const DEFAULT_PATH = "/partial_loss_commit";
const CACHE_TTL = 45_000;

const history = createMemoryHistory();

const fetchData = ttl(async (id: string) => {

  const partialLossCommitData = await ioc.notificationViewService.getOne(id) as PartialLossCommitNotification;

  if (!partialLossCommitData) {
    throw new Error("Partial loss commit data not found");
  }

  if (partialLossCommitData.type !== "partial_loss.commit") {
    throw new Error(`Invalid notification data type: expected 'partial_loss.commit', got ${partialLossCommitData.type}`);
  }

  return {
    partial_loss_commit: partialLossCommitData,
    candle_1m: await ioc.exchangeViewService.getPointCandles({
      currentTime: partialLossCommitData.timestamp,
      exchangeName: partialLossCommitData.exchangeName,
      interval: "1m",
      symbol: partialLossCommitData.symbol,
    }),
    candle_15m: await ioc.exchangeViewService.getPointCandles({
      currentTime: partialLossCommitData.timestamp,
      exchangeName: partialLossCommitData.exchangeName,
      interval: "15m",
      symbol: partialLossCommitData.symbol,
    }),
    candle_1h: await ioc.exchangeViewService.getPointCandles({
      currentTime: partialLossCommitData.timestamp,
      exchangeName: partialLossCommitData.exchangeName,
      interval: "1h",
      symbol: partialLossCommitData.symbol,
    }),
  };
}, {
  timeout: CACHE_TTL,
  key: ([id]) => `${id}`,
});

const handleDownload = async (pathname: string, id: string) => {

  const { candle_15m, candle_1h, candle_1m, partial_loss_commit } = await fetchData(id);

  if (pathname.includes("/partial_loss_commit")) {
    const blob = new Blob([JSON.stringify(partial_loss_commit, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `partial_loss_commit_${partial_loss_commit.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1m")) {
    const blob = new Blob([JSON.stringify(candle_1m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1m_${partial_loss_commit.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_15m")) {
    const blob = new Blob([JSON.stringify(candle_15m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_15m_${partial_loss_commit.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1h")) {
    const blob = new Blob([JSON.stringify(candle_1h, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1h_${partial_loss_commit.id || "unknown"}.json`);
    return;
  }
};

export const usePartialLossCommitView = () => {

  const [id$, setId] = useActualState("");
  const ctx = useModalManager();
  const { push, pop } = ctx;

  const [pathname$, setPathname] = useActualRef(history.location.pathname);

  const handleTabChange = (id: string, history: History) => {
    if (id === "partial_loss_commit") {
      history.replace(`/partial_loss_commit`);
      setPathname(`/partial_loss_commit`);
    }
    if (id === "candle_1m") {
      history.replace(`/candle_1m`);
      setPathname(`/candle_1m`);
    }
    if (id === "candle_15m") {
      history.replace(`/candle_15m`);
      setPathname(`/candle_15m`);
    }
    if (id === "candle_1h") {
      history.replace(`/candle_1h`);
      setPathname(`/candle_1h`);
    }
  };

  const { pickData, render } = useTabsModal({
    tabs,
    withStaticAction: true,
    onTabChange: handleTabChange,
    animation: "none",
    title: "Partial Loss Commit Details",
    sizeRequest: CC_FULLSCREEN_SIZE_REQUEST,
    history,
    routes,
    BeforeTitle: ({ onClose }) => {
      const { total } = useModalManager();
      return (
        <Box
          sx={{
            mr: 1,
            display: total === 1 ? "none" : "flex",
          }}
        >
          <ActionIcon onClick={onClose}>
            <ArrowBack />
          </ActionIcon>
        </Box>
      );
    },
    AfterTitle: ({ onClose }) => (
      <Stack direction="row" gap={1}>
        <ActionIcon onClick={() => handleDownload(pathname$.current, id$.current)}>
          <Download />
        </ActionIcon>
        <ActionIcon onClick={onClose}>
          <Close />
        </ActionIcon>
      </Stack>
    ),
    fetchState: async () => await fetchData(id$.current),
    mapInitialData: ([{ partial_loss_commit, ...other }]) => ({
      main: partial_loss_commit,
      partial_loss_commit,
      ...other,
    }),
    mapPayload: ([{ candle_1m = [], candle_15m = [], candle_1h = [] }]) => {
      return {
        candle_1m,
        candle_15m,
        candle_1h,
      };
    },
    onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
    onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
    onClose: () => {
      pop();
    },
  });

  return (id: string, route = DEFAULT_PATH) => {
    push({
      id: "partial_loss_commit_modal",
      render,
      onInit: () => {
        history.push(route);
        setPathname(route);
      },
      onMount: () => {
        setId(id);
        pickData();
      },
    });
  };
};

export default usePartialLossCommitView;
