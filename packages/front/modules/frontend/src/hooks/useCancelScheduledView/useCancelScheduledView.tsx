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
import { ArrowBack, Close, Download, Search } from "@mui/icons-material";
import { createMemoryHistory } from "history";
import routes from "./routes";
import { CC_FULLSCREEN_SIZE_REQUEST } from "../../config/params";
import tabs from "./tabs";
import { Box, Stack } from "@mui/material";
import ioc from "../../lib";
import CopyIcon from "./components/CopyIcon";
import { CancelScheduledCommitNotification } from "backtest-kit";

const DEFAULT_PATH = "/cancel_scheduled_commit";
const CACHE_TTL = 45_000;

const history = createMemoryHistory();

const fetchData = ttl(async (id: string) => {

  const cancelScheduledData = await ioc.notificationViewService.getOne(id) as CancelScheduledCommitNotification;

  if (!cancelScheduledData) {
    throw new Error("Cancel scheduled data not found");
  }

  if (cancelScheduledData.type !== "cancel_scheduled.commit") {
    throw new Error(`Invalid notification data type: expected 'cancel_scheduled.commit', got ${cancelScheduledData.type}`);
  }

  return {
    cancel_scheduled_commit: cancelScheduledData,
    candle_1m: await ioc.exchangeViewService.getPointCandles({
      currentTime: cancelScheduledData.timestamp,
      exchangeName: cancelScheduledData.exchangeName,
      interval: "1m",
      symbol: cancelScheduledData.symbol,
    }),
    candle_15m: await ioc.exchangeViewService.getPointCandles({
      currentTime: cancelScheduledData.timestamp,
      exchangeName: cancelScheduledData.exchangeName,
      interval: "15m",
      symbol: cancelScheduledData.symbol,
    }),
    candle_1h: await ioc.exchangeViewService.getPointCandles({
      currentTime: cancelScheduledData.timestamp,
      exchangeName: cancelScheduledData.exchangeName,
      interval: "1h",
      symbol: cancelScheduledData.symbol,
    }),
  };
}, {
  timeout: CACHE_TTL,
  key: ([id]) => `${id}`,
});

const handleDownload = async (pathname: string, id: string) => {

  const { candle_15m, candle_1h, candle_1m, cancel_scheduled_commit } = await fetchData(id);

  if (pathname.includes("/cancel_scheduled_commit")) {
    const blob = new Blob([JSON.stringify(cancel_scheduled_commit, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `cancel_scheduled_commit_${cancel_scheduled_commit.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1m")) {
    const blob = new Blob([JSON.stringify(candle_1m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1m_${cancel_scheduled_commit.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_15m")) {
    const blob = new Blob([JSON.stringify(candle_15m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_15m_${cancel_scheduled_commit.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1h")) {
    const blob = new Blob([JSON.stringify(candle_1h, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1h_${cancel_scheduled_commit.id || "unknown"}.json`);
    return;
  }
};

const handleCopy = async (pathname: string, id: string, onCopy: (content: string) => void) => {
  const { candle_15m, candle_1h, candle_1m, cancel_scheduled_commit } = await fetchData(id);

  if (pathname.includes("/cancel_scheduled_commit")) {
    onCopy(JSON.stringify(cancel_scheduled_commit, null, 2));
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

export const useCancelScheduledView = () => {

  const [id$, setId] = useActualState("");
  const ctx = useModalManager();
  const { push, pop } = ctx;

  const [pathname$, setPathname] = useActualRef(history.location.pathname);

  const handleTabChange = (id: string, history: History) => {
    if (id === "cancel_scheduled_commit") {
      history.replace(`/cancel_scheduled_commit`);
      setPathname(`/cancel_scheduled_commit`);
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
    title: "Cancel Scheduled Details",
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
              const { cancel_scheduled_commit } = await fetchData(id$.current);
              if (!cancel_scheduled_commit?.signalId) {
                  return null;
              }
              return (
                  <ActionIcon
                      sx={{ mr: "10px" }}
                      onClick={() => {
                          ctx.clear();
                          ioc.routerService.push(
                              `/dump/${cancel_scheduled_commit.signalId}`,
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
    mapInitialData: ([{ cancel_scheduled_commit, ...other }]) => ({
      main: cancel_scheduled_commit,
      cancel_scheduled_commit,
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
      id: "cancel_scheduled_modal",
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

export default useCancelScheduledView;
