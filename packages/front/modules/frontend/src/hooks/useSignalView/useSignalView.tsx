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

const DEFAULT_PATH = "/signal";

const history = createMemoryHistory();

const fetchData = async (id: string) => {
  return {
    signal: await ioc.storageViewService.findSignalById(id),
    candle_1m: await ioc.exchangeViewService.getCandles(id, "1m"),
    candle_15m: await ioc.exchangeViewService.getCandles(id, "15m"),
    candle_1h: await ioc.exchangeViewService.getCandles(id, "1h"),
  };
};

const handleDownload = async (pathname: string, id: string) => {
  const currentPath = pathname;

  let dataType: "signal" | "candle_1m" | "candle_15m" | "candle_1h" | null = null;
  let label = "";

  if (currentPath.includes("/signal")) {
    dataType = "signal";
    label = "Signal_Details";
  } else if (currentPath.includes("/candle_1m")) {
    dataType = "candle_1m";
    label = "Candles_1m";
  } else if (currentPath.includes("/candle_15m")) {
    dataType = "candle_15m";
    label = "Candles_15m";
  } else if (currentPath.includes("/candle_1h")) {
    dataType = "candle_1h";
    label = "Candles_1h";
  }

  if (!dataType) {
    return;
  }

};

export const useSignalView = () => {

  const [id$, setId] = useActualState("");
  const ctx = useModalManager();
  const { push, pop } = ctx;

  const [pathname$, setPathname] = useActualRef(history.location.pathname);

  const handleTabChange = (id: string, history: History) => {
    if (id === "signal") {
      history.replace(`/signal`);
      setPathname(`/signal`);
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
    title: "Signal details",
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
    mapInitialData: ([{ signal, ...other }]) => ({
      main: signal,
      signal,
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
      id: "signal_modal",
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

export default useSignalView;
