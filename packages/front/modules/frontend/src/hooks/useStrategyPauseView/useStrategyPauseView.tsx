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
import { ArrowBack, Close, Print } from "@mui/icons-material";
import { createMemoryHistory } from "history";
import routes from "./routes";
import { CC_FULLSCREEN_SIZE_REQUEST } from "../../config/params";
import tabs from "./tabs";
import { Box, Stack } from "@mui/material";
import ioc from "../../lib";
import CopyIcon from "./components/CopyIcon";
import { StrategyPauseNotification } from "backtest-kit";
import strategy_pause_fields from "../../assets/strategy_pause_fields";
import MenuIcon from "./components/MenuIcon";
import downloadMarkdown from "../../utils/downloadMarkdown";
import { t } from "../../i18n";

const DEFAULT_PATH = "/strategy_pause";
const CACHE_TTL = 45_000;

const history = createMemoryHistory();

const fetchData = ttl(async (id: string) => {

  const strategyPauseData = await ioc.notificationViewService.getOne(id) as StrategyPauseNotification;

  if (!strategyPauseData) {
    throw new Error("Strategy pause data not found");
  }

  if (strategyPauseData.type !== "strategy.pause") {
    throw new Error(`Invalid notification data type: expected 'strategy.pause', got ${strategyPauseData.type}`);
  }

  return {
    strategy_pause: strategyPauseData,
    candle_1m: await ioc.exchangeViewService.getPointCandles({
      currentTime: strategyPauseData.timestamp,
      exchangeName: strategyPauseData.exchangeName,
      interval: "1m",
      symbol: strategyPauseData.symbol,
    }),
    candle_15m: await ioc.exchangeViewService.getPointCandles({
      currentTime: strategyPauseData.timestamp,
      exchangeName: strategyPauseData.exchangeName,
      interval: "15m",
      symbol: strategyPauseData.symbol,
    }),
    candle_1h: await ioc.exchangeViewService.getPointCandles({
      currentTime: strategyPauseData.timestamp,
      exchangeName: strategyPauseData.exchangeName,
      interval: "1h",
      symbol: strategyPauseData.symbol,
    }),
  };
}, {
  timeout: CACHE_TTL,
  key: ([id]) => `${id}`,
});

const handleDownloadJson = async (pathname: string, id: string) => {

  const { candle_15m, candle_1h, candle_1m, strategy_pause } = await fetchData(id);

  if (pathname.includes("/strategy_pause")) {
    const blob = new Blob([JSON.stringify(strategy_pause, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `strategy_pause_${strategy_pause.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1m")) {
    const blob = new Blob([JSON.stringify(candle_1m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1m_${strategy_pause.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_15m")) {
    const blob = new Blob([JSON.stringify(candle_15m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_15m_${strategy_pause.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1h")) {
    const blob = new Blob([JSON.stringify(candle_1h, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1h_${strategy_pause.id || "unknown"}.json`);
    return;
  }
};

const handleCopy = async (pathname: string, id: string, onCopy: (content: string) => void) => {
  const { candle_15m, candle_1h, candle_1m, strategy_pause } = await fetchData(id);

  if (pathname.includes("/strategy_pause")) {
    onCopy(JSON.stringify(strategy_pause, null, 2));
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
  const { strategy_pause } = await fetchData(id);
  if (strategy_pause) {
    const content = ioc.markdownHelperService.buildMarkdownFromFields(strategy_pause_fields, strategy_pause);
    await downloadMarkdown(content);
  }
};

const handleDownloadMarkdown = async (id: string) => {
  const { strategy_pause } = await fetchData(id);
  if (strategy_pause) {
    const content = ioc.markdownHelperService.buildMarkdownFromFields(strategy_pause_fields, strategy_pause);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `strategy_pause_${strategy_pause.id || "unknown"}.md`);
  }
};

export const useStrategyPauseView = () => {

  const [id$, setId] = useActualState("");
  const ctx = useModalManager();
  const { push, pop } = ctx;

  const [pathname$, setPathname] = useActualRef(history.location.pathname);

  const handleTabChange = (id: string, history: History) => {
    if (id === "strategy_pause") {
      history.replace(`/strategy_pause`);
      setPathname(`/strategy_pause`);
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
    title: t("Strategy Pause Details"),
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
              const { strategy_pause } = await fetchData(id$.current);
              if (!strategy_pause) {
                  return null;
              }
              return (
                  <ActionIcon
                      sx={{ mr: "10px" }}
                      onClick={() => ioc.markdownHelperService.printFields(
                          strategy_pause_fields,
                          strategy_pause,
                      )}
                  >
                      <Print />
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
    mapInitialData: ([{ strategy_pause, ...other }]) => ({
      main: strategy_pause,
      strategy_pause,
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
      id: "strategy_pause_modal",
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

export default useStrategyPauseView;
