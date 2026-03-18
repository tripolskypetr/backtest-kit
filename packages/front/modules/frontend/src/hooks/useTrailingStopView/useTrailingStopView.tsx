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
import { TrailingStopCommitNotification } from "backtest-kit";
import trailing_stop_fields from "../../assets/trailing_stop_fields";
import MenuIcon from "./components/MenuIcon";

const DEFAULT_PATH = "/trailing_stop";
const CACHE_TTL = 45_000;

const history = createMemoryHistory();

const fetchData = ttl(async (id: string) => {

  const trailingStopData = await ioc.notificationViewService.getOne(id) as TrailingStopCommitNotification;

  if (!trailingStopData) {
    throw new Error("Trailing stop data not found");
  }

  if (trailingStopData.type !== "trailing_stop.commit") {
    throw new Error(`Invalid notification data type: expected 'trailing_stop.commit', got ${trailingStopData.type}`);
  }

  return {
    trailing_stop: trailingStopData,
    candle_1m: await ioc.exchangeViewService.getPointCandles({
      currentTime: trailingStopData.timestamp,
      exchangeName: trailingStopData.exchangeName,
      interval: "1m",
      symbol: trailingStopData.symbol,
    }),
    candle_15m: await ioc.exchangeViewService.getPointCandles({
      currentTime: trailingStopData.timestamp,
      exchangeName: trailingStopData.exchangeName,
      interval: "15m",
      symbol: trailingStopData.symbol,
    }),
    candle_1h: await ioc.exchangeViewService.getPointCandles({
      currentTime: trailingStopData.timestamp,
      exchangeName: trailingStopData.exchangeName,
      interval: "1h",
      symbol: trailingStopData.symbol,
    }),
  };
}, {
  timeout: CACHE_TTL,
  key: ([id]) => `${id}`,
});

const handleDownloadJson = async (pathname: string, id: string) => {

  const { candle_15m, candle_1h, candle_1m, trailing_stop } = await fetchData(id);

  if (pathname.includes("/trailing_stop")) {
    const blob = new Blob([JSON.stringify(trailing_stop, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `trailing_stop_${trailing_stop.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1m")) {
    const blob = new Blob([JSON.stringify(candle_1m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1m_${trailing_stop.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_15m")) {
    const blob = new Blob([JSON.stringify(candle_15m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_15m_${trailing_stop.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1h")) {
    const blob = new Blob([JSON.stringify(candle_1h, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1h_${trailing_stop.id || "unknown"}.json`);
    return;
  }
};

const handleCopy = async (pathname: string, id: string, onCopy: (content: string) => void) => {
  const { candle_15m, candle_1h, candle_1m, trailing_stop } = await fetchData(id);

  if (pathname.includes("/trailing_stop")) {
    onCopy(JSON.stringify(trailing_stop, null, 2));
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

export const useTrailingStopView = () => {

  const [id$, setId] = useActualState("");
  const ctx = useModalManager();
  const { push, pop } = ctx;

  const [pathname$, setPathname] = useActualRef(history.location.pathname);

  const handleTabChange = (id: string, history: History) => {
    if (id === "trailing_stop") {
      history.replace(`/trailing_stop`);
      setPathname(`/trailing_stop`);
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
    title: "Trailing Stop Commit Details",
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
                const { trailing_stop } = await fetchData(id$.current);
                if (!trailing_stop) {
                    return null;
                }
                return (
                    <ActionIcon
                        sx={{ mr: "10px" }}
                        onClick={() => ioc.markdownHelperService.printFields(
                            trailing_stop_fields,
                            trailing_stop,
                        )}
                    >
                        <Print />
                    </ActionIcon>
                );
            }}
        </Async>
        <Async>
            {async () => {
                const { trailing_stop } = await fetchData(id$.current);
                if (!trailing_stop?.signalId) {
                    return null;
                }
                return (
                    <ActionIcon
                        sx={{ mr: "10px" }}
                        onClick={() => {
                            ctx.clear();
                            ioc.routerService.push(
                                `/dump/${trailing_stop.signalId}`,
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
              const { trailing_stop } = await fetchData(id$.current);
              if (trailing_stop) {
                  ioc.markdownHelperService.printFields(trailing_stop_fields, trailing_stop);
              }
          }}
        />
        <ActionIcon onClick={onClose}>
          <Close />
        </ActionIcon>
      </Stack>
    ),
    fetchState: async () => await fetchData(id$.current),
    mapInitialData: ([{ trailing_stop, ...other }]) => ({
      main: trailing_stop,
      trailing_stop,
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
      id: "trailing_stop_modal",
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

export default useTrailingStopView;
