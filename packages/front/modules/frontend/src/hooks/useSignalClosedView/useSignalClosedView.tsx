import {
  useActualState,
  useModalManager,
  useTabsModal,
  History,
  useActualRef,
  ActionIcon,
} from "react-declarative";
import { ArrowBack, Close, Download } from "@mui/icons-material";
import { createMemoryHistory } from "history";
import routes from "./routes";
import { CC_FULLSCREEN_SIZE_REQUEST } from "../../config/params";
import tabs from "./tabs";
import { Box, Stack } from "@mui/material";
import ioc from "../../lib";
import { SignalClosedNotification } from "backtest-kit";

const DEFAULT_PATH = "/signal_closed";

const history = createMemoryHistory();

const fetchData = async (id: string) => {

  const signalClosedData = await ioc.notificationViewService.getOne(id) as SignalClosedNotification;

  if (!signalClosedData) {
    throw new Error("Signal closed data not found");
  }

  if (signalClosedData.type !== "signal.closed") {
    throw new Error(`Invalid notification data type: expected 'signal.closed', got ${signalClosedData.type}`);
  }

  return {
    signal_closed: signalClosedData,
    candle_1m: await ioc.exchangeViewService.getPointCandles({
      currentTime: signalClosedData.timestamp,
      exchangeName: signalClosedData.exchangeName,
      interval: "1m",
      symbol: signalClosedData.symbol,
    }),
    candle_15m: await ioc.exchangeViewService.getPointCandles({
      currentTime: signalClosedData.timestamp,
      exchangeName: signalClosedData.exchangeName,
      interval: "15m",
      symbol: signalClosedData.symbol,
    }),
    candle_1h: await ioc.exchangeViewService.getPointCandles({
      currentTime: signalClosedData.timestamp,
      exchangeName: signalClosedData.exchangeName,
      interval: "1h",
      symbol: signalClosedData.symbol,
    }),
  };
};

const handleDownload = async (pathname: string, id: string) => {

  const { candle_15m, candle_1h, candle_1m, signal_closed } = await fetchData(id);

  if (pathname.includes("/signal_closed")) {
    const blob = new Blob([JSON.stringify(signal_closed, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `signal_closed_${signal_closed.signalId || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1m")) {
    const blob = new Blob([JSON.stringify(candle_1m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1m_${signal_closed.signalId || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_15m")) {
    const blob = new Blob([JSON.stringify(candle_15m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_15m_${signal_closed.signalId || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1h")) {
    const blob = new Blob([JSON.stringify(candle_1h, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1h_${signal_closed.signalId || "unknown"}.json`);
    return;
  }
};

export const useSignalClosedView = () => {

  const [id$, setId] = useActualState("");
  const ctx = useModalManager();
  const { push, pop } = ctx;

  const [pathname$, setPathname] = useActualRef(history.location.pathname);

  const handleTabChange = (id: string, history: History) => {
    if (id === "signal_closed") {
      history.replace(`/signal_closed`);
      setPathname(`/signal_closed`);
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
    title: "Signal Closed Details",
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
    mapInitialData: ([{ signal_closed, ...other }]) => ({
      main: signal_closed,
      signal_closed,
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
      id: "signal_closed_modal",
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

export default useSignalClosedView;
