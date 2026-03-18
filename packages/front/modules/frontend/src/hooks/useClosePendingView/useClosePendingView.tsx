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
import { ClosePendingCommitNotification } from "backtest-kit";
import close_pending_commit_fields from "../../assets/close_pending_commit_fields";

const DEFAULT_PATH = "/close_pending_commit";
const CACHE_TTL = 45_000;

const history = createMemoryHistory();

const fetchData = ttl(async (id: string) => {

  const closePendingData = await ioc.notificationViewService.getOne(id) as ClosePendingCommitNotification;

  if (!closePendingData) {
    throw new Error("Close pending data not found");
  }

  if (closePendingData.type !== "close_pending.commit") {
    throw new Error(`Invalid notification data type: expected 'close_pending.commit', got ${closePendingData.type}`);
  }

  return {
    close_pending_commit: closePendingData,
    candle_1m: await ioc.exchangeViewService.getPointCandles({
      currentTime: closePendingData.timestamp,
      exchangeName: closePendingData.exchangeName,
      interval: "1m",
      symbol: closePendingData.symbol,
    }),
    candle_15m: await ioc.exchangeViewService.getPointCandles({
      currentTime: closePendingData.timestamp,
      exchangeName: closePendingData.exchangeName,
      interval: "15m",
      symbol: closePendingData.symbol,
    }),
    candle_1h: await ioc.exchangeViewService.getPointCandles({
      currentTime: closePendingData.timestamp,
      exchangeName: closePendingData.exchangeName,
      interval: "1h",
      symbol: closePendingData.symbol,
    }),
  };
}, {
  timeout: CACHE_TTL,
  key: ([id]) => `${id}`,
});

const handleDownload = async (pathname: string, id: string) => {

  const { candle_15m, candle_1h, candle_1m, close_pending_commit } = await fetchData(id);

  if (pathname.includes("/close_pending_commit")) {
    const blob = new Blob([JSON.stringify(close_pending_commit, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `close_pending_commit_${close_pending_commit.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1m")) {
    const blob = new Blob([JSON.stringify(candle_1m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1m_${close_pending_commit.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_15m")) {
    const blob = new Blob([JSON.stringify(candle_15m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_15m_${close_pending_commit.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1h")) {
    const blob = new Blob([JSON.stringify(candle_1h, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1h_${close_pending_commit.id || "unknown"}.json`);
    return;
  }
};

const handleCopy = async (pathname: string, id: string, onCopy: (content: string) => void) => {
  const { candle_15m, candle_1h, candle_1m, close_pending_commit } = await fetchData(id);

  if (pathname.includes("/close_pending_commit")) {
    onCopy(JSON.stringify(close_pending_commit, null, 2));
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

export const useClosePendingView = () => {

  const [id$, setId] = useActualState("");
  const ctx = useModalManager();
  const { push, pop } = ctx;

  const [pathname$, setPathname] = useActualRef(history.location.pathname);

  const handleTabChange = (id: string, history: History) => {
    if (id === "close_pending_commit") {
      history.replace(`/close_pending_commit`);
      setPathname(`/close_pending_commit`);
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
    title: "Close Pending Details",
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
              const { close_pending_commit } = await fetchData(id$.current);
              if (!close_pending_commit) {
                  return null;
              }
              return (
                  <ActionIcon
                      sx={{ mr: "10px" }}
                      onClick={() => ioc.markdownHelperService.printFields(
                          close_pending_commit_fields,
                          close_pending_commit,
                      )}
                  >
                      <Print />
                  </ActionIcon>
              );
          }}
        </Async>
        <Async>
          {async () => {
              const { close_pending_commit } = await fetchData(id$.current);
              if (!close_pending_commit?.signalId) {
                  return null;
              }
              return (
                  <ActionIcon
                      sx={{ mr: "10px" }}
                      onClick={() => {
                          ctx.clear();
                          ioc.routerService.push(
                              `/dump/${close_pending_commit.signalId}`,
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
    mapInitialData: ([{ close_pending_commit, ...other }]) => ({
      main: close_pending_commit,
      close_pending_commit,
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
      id: "close_pending_modal",
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

export default useClosePendingView;
