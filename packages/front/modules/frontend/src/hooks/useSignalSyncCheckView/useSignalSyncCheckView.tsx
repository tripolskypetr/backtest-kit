import {
  useActualState,
  useModalManager,
  useTabsModal,
  History,
  useActualRef,
  ActionIcon,
  Async,
} from "react-declarative";
import { ttl } from "../../utils/ttl";
import { ArrowBack, Close, Print, Search } from "@mui/icons-material";
import { createMemoryHistory } from "history";
import routes from "./routes";
import { CC_FULLSCREEN_SIZE_REQUEST } from "../../config/params";
import tabs from "./tabs";
import { Box, Stack } from "@mui/material";
import ioc from "../../lib";
import CopyIcon from "./components/CopyIcon";
import { SignalSyncCheckNotification } from "backtest-kit";
import signal_sync_check_fields from "../../assets/signal_sync_check_fields";
import MenuIcon from "./components/MenuIcon";
import downloadMarkdown from "../../utils/downloadMarkdown";

const DEFAULT_PATH = "/signal_sync_check";
const CACHE_TTL = 45_000;

const history = createMemoryHistory();

const fetchData = ttl(async (id: string) => {

  const signalSyncCheckData = await ioc.notificationViewService.getOne(id) as SignalSyncCheckNotification;

  if (!signalSyncCheckData) {
    throw new Error("Signal sync check data not found");
  }

  if (signalSyncCheckData.type !== "signal_sync.check") {
    throw new Error(`Invalid notification data type: expected 'signal_sync.check', got ${signalSyncCheckData.type}`);
  }

  return {
    signal_sync_check: signalSyncCheckData,
    candle_1m: await ioc.exchangeViewService.getPointCandles({
      currentTime: signalSyncCheckData.timestamp,
      exchangeName: signalSyncCheckData.exchangeName,
      interval: "1m",
      symbol: signalSyncCheckData.symbol,
    }),
    candle_15m: await ioc.exchangeViewService.getPointCandles({
      currentTime: signalSyncCheckData.timestamp,
      exchangeName: signalSyncCheckData.exchangeName,
      interval: "15m",
      symbol: signalSyncCheckData.symbol,
    }),
    candle_1h: await ioc.exchangeViewService.getPointCandles({
      currentTime: signalSyncCheckData.timestamp,
      exchangeName: signalSyncCheckData.exchangeName,
      interval: "1h",
      symbol: signalSyncCheckData.symbol,
    }),
  };
}, {
  timeout: CACHE_TTL,
  key: ([id]) => `${id}`,
});

const handleDownloadJson = async (pathname: string, id: string) => {

  const { candle_15m, candle_1h, candle_1m, signal_sync_check } = await fetchData(id);

  if (pathname.includes("/signal_sync_check")) {
    const blob = new Blob([JSON.stringify(signal_sync_check, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `signal_sync_check_${signal_sync_check.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1m")) {
    const blob = new Blob([JSON.stringify(candle_1m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1m_${signal_sync_check.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_15m")) {
    const blob = new Blob([JSON.stringify(candle_15m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_15m_${signal_sync_check.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1h")) {
    const blob = new Blob([JSON.stringify(candle_1h, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1h_${signal_sync_check.id || "unknown"}.json`);
    return;
  }
};

const handleCopy = async (pathname: string, id: string, onCopy: (content: string) => void) => {
  const { candle_15m, candle_1h, candle_1m, signal_sync_check } = await fetchData(id);

  if (pathname.includes("/signal_sync_check")) {
    onCopy(JSON.stringify(signal_sync_check, null, 2));
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

const handleDownloadPdf = async (id: string) => {
  const { signal_sync_check } = await fetchData(id);
  if (signal_sync_check) {
    const content = ioc.markdownHelperService.buildMarkdownFromFields(signal_sync_check_fields, signal_sync_check);
    await downloadMarkdown(content);
  }
};

const handleDownloadMarkdown = async (id: string) => {
  const { signal_sync_check } = await fetchData(id);
  if (signal_sync_check) {
    const content = ioc.markdownHelperService.buildMarkdownFromFields(signal_sync_check_fields, signal_sync_check);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `signal_sync_check_${signal_sync_check.id || "unknown"}.md`);
  }
};

export const useSignalSyncCheckView = () => {

  const [id$, setId] = useActualState("");
  const ctx = useModalManager();
  const { push, pop } = ctx;

  const [pathname$, setPathname] = useActualRef(history.location.pathname);

  const handleTabChange = (id: string, history: History) => {
    if (id === "signal_sync_check") {
      history.replace(`/signal_sync_check`);
      setPathname(`/signal_sync_check`);
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
    title: "Signal Sync Check Details",
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
                const { signal_sync_check } = await fetchData(id$.current);
                if (!signal_sync_check) {
                    return null;
                }
                return (
                    <ActionIcon
                        sx={{ mr: "10px" }}
                        onClick={() => ioc.markdownHelperService.printFields(
                            signal_sync_check_fields,
                            signal_sync_check,
                        )}
                    >
                        <Print />
                    </ActionIcon>
                );
            }}
        </Async>
        <Async>
            {async () => {
                const { signal_sync_check } = await fetchData(id$.current);
                if (!signal_sync_check?.signalId) {
                    return null;
                }
                return (
                    <ActionIcon
                        sx={{ mr: "10px" }}
                        onClick={() => {
                            ctx.clear();
                            ioc.routerService.push(
                                `/dump/${signal_sync_check.signalId}`,
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
          onDownloadMarkdown={() => handleDownloadMarkdown(id$.current)}
          onDownloadPdf={() => handleDownloadPdf(id$.current)}
        />
        <ActionIcon onClick={onClose}>
          <Close />
        </ActionIcon>
      </Stack>
    ),
    fetchState: async () => await fetchData(id$.current),
    mapInitialData: ([{ signal_sync_check, ...other }]) => ({
      main: signal_sync_check,
      signal_sync_check,
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
      id: "signal_sync_check_modal",
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

export default useSignalSyncCheckView;
