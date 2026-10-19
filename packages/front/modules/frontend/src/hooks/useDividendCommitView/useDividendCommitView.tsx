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
import CopyIcon from "../usePartialProfitCommitView/components/CopyIcon";
import { DividendAddCommitNotification, DividendRemoveCommitNotification } from "backtest-kit";

/** One modal serves both accrual events: recorded and removed */
type DividendCommitNotification = DividendAddCommitNotification | DividendRemoveCommitNotification;
import dividend_commit_fields from "../../assets/dividend_commit_fields";
import MenuIcon from "./components/MenuIcon";
import downloadMarkdown from "../../utils/downloadMarkdown";
import { t } from "../../i18n";

const DEFAULT_PATH = "/dividend_commit";
const CACHE_TTL = 45_000;

const history = createMemoryHistory();

const fetchData = ttl(async (id: string) => {

  const dividendCommitData = await ioc.notificationViewService.getOne(id) as DividendCommitNotification;

  if (!dividendCommitData) {
    throw new Error("Dividend commit data not found");
  }

  if (dividendCommitData.type !== "dividend_add.commit" && dividendCommitData.type !== "dividend_remove.commit") {
    throw new Error(`Invalid notification data type: expected 'dividend_add.commit' | 'dividend_remove.commit', got ${dividendCommitData.type}`);
  }

  return {
    dividend_commit: dividendCommitData,
    candle_1m: await ioc.exchangeViewService.getPointCandles({
      currentTime: dividendCommitData.timestamp,
      exchangeName: dividendCommitData.exchangeName,
      interval: "1m",
      symbol: dividendCommitData.symbol,
    }),
    candle_15m: await ioc.exchangeViewService.getPointCandles({
      currentTime: dividendCommitData.timestamp,
      exchangeName: dividendCommitData.exchangeName,
      interval: "15m",
      symbol: dividendCommitData.symbol,
    }),
    candle_1h: await ioc.exchangeViewService.getPointCandles({
      currentTime: dividendCommitData.timestamp,
      exchangeName: dividendCommitData.exchangeName,
      interval: "1h",
      symbol: dividendCommitData.symbol,
    }),
  };
}, {
  timeout: CACHE_TTL,
  key: ([id]) => `${id}`,
});

const handleDownloadJson = async (pathname: string, id: string) => {

  const { candle_15m, candle_1h, candle_1m, dividend_commit } = await fetchData(id);

  if (pathname.includes("/dividend_commit")) {
    const blob = new Blob([JSON.stringify(dividend_commit, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `dividend_commit_${dividend_commit.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1m")) {
    const blob = new Blob([JSON.stringify(candle_1m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1m_${dividend_commit.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_15m")) {
    const blob = new Blob([JSON.stringify(candle_15m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_15m_${dividend_commit.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1h")) {
    const blob = new Blob([JSON.stringify(candle_1h, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1h_${dividend_commit.id || "unknown"}.json`);
    return;
  }
};

const handleCopy = async (pathname: string, id: string, onCopy: (content: string) => void) => {
  const { candle_15m, candle_1h, candle_1m, dividend_commit } = await fetchData(id);

  if (pathname.includes("/dividend_commit")) {
    onCopy(JSON.stringify(dividend_commit, null, 2));
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
  const { dividend_commit } = await fetchData(id);
  if (dividend_commit) {
    const content = ioc.markdownHelperService.buildMarkdownFromFields(dividend_commit_fields, dividend_commit);
    await downloadMarkdown(content);
  }
};

const handleDownloadMarkdown = async (id: string) => {
  const { dividend_commit } = await fetchData(id);
  if (dividend_commit) {
    const content = ioc.markdownHelperService.buildMarkdownFromFields(dividend_commit_fields, dividend_commit);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `dividend_commit_${dividend_commit.id || "unknown"}.md`);
  }
};

export const useDividendCommitView = () => {

  const [id$, setId] = useActualState("");
  const ctx = useModalManager();
  const { push, pop } = ctx;

  const [pathname$, setPathname] = useActualRef(history.location.pathname);

  const handleTabChange = (id: string, history: History) => {
    if (id === "dividend_commit") {
      history.replace(`/dividend_commit`);
      setPathname(`/dividend_commit`);
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
    title: t("Dividend Details"),
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
              const { dividend_commit } = await fetchData(id$.current);
              if (!dividend_commit) {
                  return null;
              }
              return (
                  <ActionIcon
                      sx={{ display: { xs: "none", sm: "flex" }, mr: "10px" }}
                      onClick={() => ioc.markdownHelperService.printFields(
                          dividend_commit_fields,
                          dividend_commit,
                      )}
                  >
                      <Print />
                  </ActionIcon>
              );
          }}
        </Async>
        <Async>
          {async () => {
              const { dividend_commit } = await fetchData(id$.current);
              if (!dividend_commit?.signalId) {
                  return null;
              }
              return (
                  <ActionIcon
                      sx={{ display: { xs: "none", sm: "flex" }, mr: "10px" }}
                      onClick={() => {
                          ctx.clear();
                          ioc.routerService.push(
                              `/dump/${dividend_commit.signalId}`,
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
          sx={{ display: { xs: "none", sm: "flex" }, mr: "10px", mt: "2.5px" }}
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
    mapInitialData: ([{ dividend_commit, ...other }]) => ({
      main: dividend_commit,
      dividend_commit,
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
      id: "dividend_commit_modal",
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

export default useDividendCommitView;
