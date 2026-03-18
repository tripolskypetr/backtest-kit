import {
  useActualState,
  useModalManager,
  useTabsModal,
  History,
  useActualRef,
  ActionIcon,
  ttl,
  Async,
} from "react-declarative";
import { ArrowBack, Close, Print, Search } from "@mui/icons-material";
import { createMemoryHistory } from "history";
import routes from "./routes";
import { CC_FULLSCREEN_SIZE_REQUEST } from "../../config/params";
import tabs from "./tabs";
import { Box, Stack } from "@mui/material";
import ioc from "../../lib";
import CopyIcon from "./components/CopyIcon";
import { SignalCancelledNotification } from "backtest-kit";
import signal_cancelled_fields from "../../assets/signal_cancelled_fields";
import MenuIcon from "./components/MenuIcon";

const DEFAULT_PATH = "/signal_cancelled";
const CACHE_TTL = 45_000;

const history = createMemoryHistory();

const fetchData = ttl(async (id: string) => {

  const signalCancelledData = await ioc.notificationViewService.getOne(id) as SignalCancelledNotification;

  if (!signalCancelledData) {
    throw new Error("Signal cancelled data not found");
  }

  if (signalCancelledData.type !== "signal.cancelled") {
    throw new Error(`Invalid notification data type: expected 'signal.cancelled', got ${signalCancelledData.type}`);
  }

  return {
    signal_cancelled: signalCancelledData,
    candle_1m: await ioc.exchangeViewService.getPointCandles({
      currentTime: signalCancelledData.timestamp,
      exchangeName: signalCancelledData.exchangeName,
      interval: "1m",
      symbol: signalCancelledData.symbol,
    }),
    candle_15m: await ioc.exchangeViewService.getPointCandles({
      currentTime: signalCancelledData.timestamp,
      exchangeName: signalCancelledData.exchangeName,
      interval: "15m",
      symbol: signalCancelledData.symbol,
    }),
    candle_1h: await ioc.exchangeViewService.getPointCandles({
      currentTime: signalCancelledData.timestamp,
      exchangeName: signalCancelledData.exchangeName,
      interval: "1h",
      symbol: signalCancelledData.symbol,
    }),
  };
}, {
  timeout: CACHE_TTL,
  key: ([id]) => `${id}`,
});

const handleDownloadJson = async (pathname: string, id: string) => {

  const { candle_15m, candle_1h, candle_1m, signal_cancelled } = await fetchData(id);

  if (pathname.includes("/signal_cancelled")) {
    const blob = new Blob([JSON.stringify(signal_cancelled, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `signal_cancelled_${signal_cancelled.signalId || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1m")) {
    const blob = new Blob([JSON.stringify(candle_1m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1m_${signal_cancelled.signalId || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_15m")) {
    const blob = new Blob([JSON.stringify(candle_15m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_15m_${signal_cancelled.signalId || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1h")) {
    const blob = new Blob([JSON.stringify(candle_1h, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1h_${signal_cancelled.signalId || "unknown"}.json`);
    return;
  }
};

const handleCopy = async (pathname: string, id: string, onCopy: (content: string) => void) => {
  const { candle_15m, candle_1h, candle_1m, signal_cancelled } = await fetchData(id);

  if (pathname.includes("/signal_cancelled")) {
    onCopy(JSON.stringify(signal_cancelled, null, 2));
    return;
  }

  if (pathname.includes("/candle_1m")) {
    onCopy(JSON.stringify(candle_1m, null, 2));
    return;
  }

  if (pathname.includes("/candle_15m")) {
    onCopy(JSON.stringify(candle_15m, null, 2));
    return;
  }

  if (pathname.includes("/candle_1h")) {
    onCopy(JSON.stringify(candle_1h, null, 2));
    return;
  }
};

export const useSignalCancelledView = () => {

  const [id$, setId] = useActualState("");
  const ctx = useModalManager();
  const { push, pop } = ctx;

  const [pathname$, setPathname] = useActualRef(history.location.pathname);

  const handleTabChange = (id: string, history: History) => {
    if (id === "signal_cancelled") {
      history.replace(`/signal_cancelled`);
      setPathname(`/signal_cancelled`);
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
    title: "Signal Cancelled Details",
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
        <Async>
            {async () => {
                const { signal_cancelled } = await fetchData(id$.current);
                if (!signal_cancelled) {
                    return null;
                }
                return (
                    <ActionIcon
                        sx={{ mr: "10px" }}
                        onClick={() => ioc.markdownHelperService.printFields(
                            signal_cancelled_fields,
                            signal_cancelled,
                        )}
                    >
                        <Print />
                    </ActionIcon>
                );
            }}
        </Async>
        <Async>
            {async () => {
                const { signal_cancelled } = await fetchData(id$.current);
                if (!signal_cancelled?.signalId) {
                    return null;
                }
                return (
                    <ActionIcon
                        sx={{ mr: "10px" }}
                        onClick={() => {
                            ctx.clear();
                            ioc.routerService.push(
                                `/dump/${signal_cancelled.signalId}`,
                            );
                        }}
                    >
                        <Search />
                    </ActionIcon>
                );
            }}
        </Async>
        <CopyIcon
          onClick={async (_, onCopy) => {
            await handleCopy(pathname$.current, id$.current, onCopy)
          }}
          sx={{ mr: "10px", mt: "2.5px" }}
        />
        <MenuIcon
          sx={{ mr: "10px", mt: "0.5px" }}
          onDownloadJson={() => handleDownloadJson(pathname$.current, id$.current)}
          onDownloadPdf={async () => {
              const { signal_cancelled } = await fetchData(id$.current);
              if (signal_cancelled) {
                  ioc.markdownHelperService.printFields(signal_cancelled_fields, signal_cancelled);
              }
          }}
        />
        <ActionIcon onClick={onClose}>
          <Close />
        </ActionIcon>
      </Stack>
    ),
    fetchState: async () => await fetchData(id$.current),
    mapInitialData: ([{ signal_cancelled, ...other }]) => ({
      main: signal_cancelled,
      signal_cancelled,
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
      id: "signal_cancelled_modal",
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

export default useSignalCancelledView;
