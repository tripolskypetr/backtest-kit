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
import { ArrowBack, Close, Download, Print, Search } from "@mui/icons-material";
import { createMemoryHistory } from "history";
import routes from "./routes";
import { CC_FULLSCREEN_SIZE_REQUEST } from "../../config/params";
import tabs from "./tabs";
import { Box, Stack } from "@mui/material";
import ioc from "../../lib";
import CopyIcon from "./components/CopyIcon";
import { BreakevenAvailableNotification } from "backtest-kit";
import breakeven_available_fields from "../../assets/breakeven_available_fields";

const DEFAULT_PATH = "/breakeven_available";
const CACHE_TTL = 45_000;

const history = createMemoryHistory();

const fetchData = ttl(async (id: string) => {

  const breakevenAvailableData = await ioc.notificationViewService.getOne(id) as BreakevenAvailableNotification;

  if (!breakevenAvailableData) {
    throw new Error("Breakeven available data not found");
  }

  if (breakevenAvailableData.type !== "breakeven.available") {
    throw new Error(`Invalid notification data type: expected 'breakeven.available', got ${breakevenAvailableData.type}`);
  }

  return {
    breakeven_available: breakevenAvailableData,
    candle_1m: await ioc.exchangeViewService.getPointCandles({
      currentTime: breakevenAvailableData.timestamp,
      exchangeName: breakevenAvailableData.exchangeName,
      interval: "1m",
      symbol: breakevenAvailableData.symbol,
    }),
    candle_15m: await ioc.exchangeViewService.getPointCandles({
      currentTime: breakevenAvailableData.timestamp,
      exchangeName: breakevenAvailableData.exchangeName,
      interval: "15m",
      symbol: breakevenAvailableData.symbol,
    }),
    candle_1h: await ioc.exchangeViewService.getPointCandles({
      currentTime: breakevenAvailableData.timestamp,
      exchangeName: breakevenAvailableData.exchangeName,
      interval: "1h",
      symbol: breakevenAvailableData.symbol,
    }),
  };
}, {
  timeout: CACHE_TTL,
  key: ([id]) => `${id}`,
});

const handleDownload = async (pathname: string, id: string) => {

  const { candle_15m, candle_1h, candle_1m, breakeven_available } = await fetchData(id);

  if (pathname.includes("/breakeven_available")) {
    const blob = new Blob([JSON.stringify(breakeven_available, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `breakeven_available_${breakeven_available.signalId || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1m")) {
    const blob = new Blob([JSON.stringify(candle_1m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1m_${breakeven_available.signalId || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_15m")) {
    const blob = new Blob([JSON.stringify(candle_15m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_15m_${breakeven_available.signalId || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1h")) {
    const blob = new Blob([JSON.stringify(candle_1h, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1h_${breakeven_available.signalId || "unknown"}.json`);
    return;
  }
};

const handleCopy = async (pathname: string, id: string, onCopy: (content: string) => void) => {
  const { candle_15m, candle_1h, candle_1m, breakeven_available } = await fetchData(id);

  if (pathname.includes("/breakeven_available")) {
    onCopy(JSON.stringify(breakeven_available, null, 2));
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

export const useBreakevenAvailableView = () => {

  const [id$, setId] = useActualState("");
  const ctx = useModalManager();
  const { push, pop } = ctx;

  const [pathname$, setPathname] = useActualRef(history.location.pathname);

  const handleTabChange = (id: string, history: History) => {
    if (id === "breakeven_available") {
      history.replace(`/breakeven_available`);
      setPathname(`/breakeven_available`);
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
    title: "Breakeven Available Details",
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
              const { breakeven_available } = await fetchData(id$.current);
              if (!breakeven_available) {
                  return null;
              }
              return (
                  <ActionIcon
                      sx={{ mr: "10px" }}
                      onClick={() => ioc.markdownHelperService.printFields(
                          breakeven_available_fields,
                          breakeven_available,
                      )}
                  >
                      <Print />
                  </ActionIcon>
              );
          }}
        </Async>
        <Async>
          {async () => {
              const { breakeven_available } = await fetchData(id$.current);
              if (!breakeven_available?.signalId) {
                  return null;
              }
              return (
                  <ActionIcon
                      sx={{ mr: "10px" }}
                      onClick={() => {
                          ctx.clear();
                          ioc.routerService.push(
                              `/dump/${breakeven_available.signalId}`,
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
        <ActionIcon onClick={() => handleDownload(pathname$.current, id$.current)}>
          <Download />
        </ActionIcon>
        <ActionIcon onClick={onClose}>
          <Close />
        </ActionIcon>
      </Stack>
    ),
    fetchState: async () => await fetchData(id$.current),
    mapInitialData: ([{ breakeven_available, ...other }]) => ({
      main: breakeven_available,
      breakeven_available,
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
      id: "breakeven_available_modal",
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

export default useBreakevenAvailableView;
