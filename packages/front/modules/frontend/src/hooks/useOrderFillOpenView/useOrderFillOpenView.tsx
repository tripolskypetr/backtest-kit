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
import { OrderFillOpenNotification } from "backtest-kit";
import order_fill_open_fields from "../../assets/order_fill_open_fields";
import MenuIcon from "./components/MenuIcon";
import downloadMarkdown from "../../utils/downloadMarkdown";
import { t } from "../../i18n";

const DEFAULT_PATH = "/order_fill_open";
const CACHE_TTL = 45_000;

const history = createMemoryHistory();

const fetchData = ttl(async (id: string) => {

  const orderFillOpenData = await ioc.notificationViewService.getOne(id) as OrderFillOpenNotification;

  if (!orderFillOpenData) {
    throw new Error("Order fill open data not found");
  }

  if (orderFillOpenData.type !== "order_fill.open") {
    throw new Error(`Invalid notification data type: expected 'order_fill.open', got ${orderFillOpenData.type}`);
  }

  return {
    order_fill_open: orderFillOpenData,
    candle_1m: await ioc.exchangeViewService.getPointCandles({
      currentTime: orderFillOpenData.timestamp,
      exchangeName: orderFillOpenData.exchangeName,
      interval: "1m",
      symbol: orderFillOpenData.symbol,
    }),
    candle_15m: await ioc.exchangeViewService.getPointCandles({
      currentTime: orderFillOpenData.timestamp,
      exchangeName: orderFillOpenData.exchangeName,
      interval: "15m",
      symbol: orderFillOpenData.symbol,
    }),
    candle_1h: await ioc.exchangeViewService.getPointCandles({
      currentTime: orderFillOpenData.timestamp,
      exchangeName: orderFillOpenData.exchangeName,
      interval: "1h",
      symbol: orderFillOpenData.symbol,
    }),
  };
}, {
  timeout: CACHE_TTL,
  key: ([id]) => `${id}`,
});

const handleDownloadJson = async (pathname: string, id: string) => {

  const { candle_15m, candle_1h, candle_1m, order_fill_open } = await fetchData(id);

  if (pathname.includes("/order_fill_open")) {
    const blob = new Blob([JSON.stringify(order_fill_open, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `order_fill_open_${order_fill_open.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1m")) {
    const blob = new Blob([JSON.stringify(candle_1m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1m_${order_fill_open.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_15m")) {
    const blob = new Blob([JSON.stringify(candle_15m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_15m_${order_fill_open.id || "unknown"}.json`);
    return;
  }

  if (pathname.includes("/candle_1h")) {
    const blob = new Blob([JSON.stringify(candle_1h, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `candles_1h_${order_fill_open.id || "unknown"}.json`);
    return;
  }
};

const handleCopy = async (pathname: string, id: string, onCopy: (content: string) => void) => {
  const { candle_15m, candle_1h, candle_1m, order_fill_open } = await fetchData(id);

  if (pathname.includes("/order_fill_open")) {
    onCopy(JSON.stringify(order_fill_open, null, 2));
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
  const { order_fill_open } = await fetchData(id);
  if (order_fill_open) {
    const content = ioc.markdownHelperService.buildMarkdownFromFields(order_fill_open_fields, order_fill_open);
    await downloadMarkdown(content);
  }
};

const handleDownloadMarkdown = async (id: string) => {
  const { order_fill_open } = await fetchData(id);
  if (order_fill_open) {
    const content = ioc.markdownHelperService.buildMarkdownFromFields(order_fill_open_fields, order_fill_open);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `order_fill_open_${order_fill_open.id || "unknown"}.md`);
  }
};

export const useOrderFillOpenView = () => {

  const [id$, setId] = useActualState("");
  const ctx = useModalManager();
  const { push, pop } = ctx;

  const [pathname$, setPathname] = useActualRef(history.location.pathname);

  const handleTabChange = (id: string, history: History) => {
    if (id === "order_fill_open") {
      history.replace(`/order_fill_open`);
      setPathname(`/order_fill_open`);
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
    title: t("Order Open Fill Details"),
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
                const { order_fill_open } = await fetchData(id$.current);
                if (!order_fill_open) {
                    return null;
                }
                return (
                    <ActionIcon
                        sx={{ mr: "10px" }}
                        onClick={() => ioc.markdownHelperService.printFields(
                            order_fill_open_fields,
                            order_fill_open,
                        )}
                    >
                        <Print />
                    </ActionIcon>
                );
            }}
        </Async>
        <Async>
            {async () => {
                const { order_fill_open } = await fetchData(id$.current);
                if (!order_fill_open?.signalId) {
                    return null;
                }
                return (
                    <ActionIcon
                        sx={{ mr: "10px" }}
                        onClick={() => {
                            ctx.clear();
                            ioc.routerService.push(
                                `/dump/${order_fill_open.signalId}`,
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
    mapInitialData: ([{ order_fill_open, ...other }]) => ({
      main: order_fill_open,
      order_fill_open,
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
      id: "order_fill_open_modal",
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

export default useOrderFillOpenView;
