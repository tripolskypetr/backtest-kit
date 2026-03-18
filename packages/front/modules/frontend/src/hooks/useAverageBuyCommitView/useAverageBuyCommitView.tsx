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
import CopyIcon from "../usePartialProfitCommitView/components/CopyIcon";
import { AverageBuyCommitNotification } from "backtest-kit";
import average_buy_commit_fields from "../../assets/average_buy_commit_fields";
import MenuIcon from "./components/MenuIcon";

const DEFAULT_PATH = "/average_buy_commit";
const CACHE_TTL = 45_000;

const history = createMemoryHistory();

const fetchData = ttl(async (id: string) => {

  const averageBuyCommitData = await ioc.notificationViewService.getOne(id) as AverageBuyCommitNotification;

  if (!averageBuyCommitData) {
    throw new Error("Average buy commit data not found");
  }

  if (averageBuyCommitData.type !== "average_buy.commit") {
    throw new Error(`Invalid notification data type: expected 'average_buy.commit', got ${averageBuyCommitData.type}`);
  }

  return {
    average_buy_commit: averageBuyCommitData,
    candle_1m: await ioc.exchangeViewService.getPointCandles({
      currentTime: averageBuyCommitData.timestamp,
      exchangeName: averageBuyCommitData.exchangeName,
      interval: "1m",
      symbol: averageBuyCommitData.symbol,
    }),
    candle_15m: await ioc.exchangeViewService.getPointCandles({
      currentTime: averageBuyCommitData.timestamp,
      exchangeName: averageBuyCommitData.exchangeName,
      interval: "15m",
      symbol: averageBuyCommitData.symbol,
    }),
    candle_1h: await ioc.exchangeViewService.getPointCandles({
      currentTime: averageBuyCommitData.timestamp,
      exchangeName: averageBuyCommitData.exchangeName,
      interval: "1h",
      symbol: averageBuyCommitData.symbol,
    }),
  };
}, {
  timeout: CACHE_TTL,
  key: ([id]) => `${id}`,
});

const handleDownloadJson = async (pathname: string, id: string) => {

  const { candle_15m, candle_1h, candle_1m, average_buy_commit } = await fetchData(id);

  if (pathname.includes("/average_buy_commit")) {
    const blob = new Blob([JSON.stringify(average_buy_commit, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `average_buy_commit_${average_buy_commit.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1m")) {
    const blob = new Blob([JSON.stringify(candle_1m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1m_${average_buy_commit.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_15m")) {
    const blob = new Blob([JSON.stringify(candle_15m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_15m_${average_buy_commit.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1h")) {
    const blob = new Blob([JSON.stringify(candle_1h, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1h_${average_buy_commit.id || "unknown"}.json`);
    return;
  }
};

const handleCopy = async (pathname: string, id: string, onCopy: (content: string) => void) => {
  const { candle_15m, candle_1h, candle_1m, average_buy_commit } = await fetchData(id);

  if (pathname.includes("/average_buy_commit")) {
    onCopy(JSON.stringify(average_buy_commit, null, 2));
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

export const useAverageBuyCommitView = () => {

  const [id$, setId] = useActualState("");
  const ctx = useModalManager();
  const { push, pop } = ctx;

  const [pathname$, setPathname] = useActualRef(history.location.pathname);

  const handleTabChange = (id: string, history: History) => {
    if (id === "average_buy_commit") {
      history.replace(`/average_buy_commit`);
      setPathname(`/average_buy_commit`);
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
    title: "Average Buy Details",
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
              const { average_buy_commit } = await fetchData(id$.current);
              if (!average_buy_commit) {
                  return null;
              }
              return (
                  <ActionIcon
                      sx={{ mr: "10px" }}
                      onClick={() => ioc.markdownHelperService.printFields(
                          average_buy_commit_fields,
                          average_buy_commit,
                      )}
                  >
                      <Print />
                  </ActionIcon>
              );
          }}
        </Async>
        <Async>
          {async () => {
              const { average_buy_commit } = await fetchData(id$.current);
              if (!average_buy_commit?.signalId) {
                  return null;
              }
              return (
                  <ActionIcon
                      sx={{ mr: "10px" }}
                      onClick={() => {
                          ctx.clear();
                          ioc.routerService.push(
                              `/dump/${average_buy_commit.signalId}`,
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
              const { average_buy_commit } = await fetchData(id$.current);
              if (average_buy_commit) {
                  ioc.markdownHelperService.printFields(average_buy_commit_fields, average_buy_commit);
              }
          }}
        />
        <ActionIcon onClick={onClose}>
          <Close />
        </ActionIcon>
      </Stack>
    ),
    fetchState: async () => await fetchData(id$.current),
    mapInitialData: ([{ average_buy_commit, ...other }]) => ({
      main: average_buy_commit,
      average_buy_commit,
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
      id: "average_buy_commit_modal",
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

export default useAverageBuyCommitView;
