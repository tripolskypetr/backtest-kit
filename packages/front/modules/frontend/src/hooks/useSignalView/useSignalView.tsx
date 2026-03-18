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
import { IStorageSignalRow } from "backtest-kit";
import signal_fields from "../../assets/signal_fields";

const DEFAULT_PATH = "/status";
const CACHE_TTL = 45_000;

const history = createMemoryHistory();

const fetchData = ttl(
    async (id: string) => {
        const signal = (await ioc.storageViewService.findSignalById(
            id,
        )) as IStorageSignalRow;

        const positionEntries = signal._entry ?? [];
        const positionPartials = signal._partial ?? [];

        const status = {
            ...signal,
            signalId: signal.id,
            pnlPercentage: signal.pnl.pnlPercentage,
            pnlCost: signal.pnl.pnlCost,
            pnlEntries: signal.pnl.pnlEntries,
            positionEntries,
            positionPartials,
        };

        return {
            signal,
            status,
            notification: await ioc.notificationViewService.findByFilter({
                signalId: id,
            }),
            candle_1m: await ioc.exchangeViewService.getSignalCandles(id, "1m"),
            candle_15m: await ioc.exchangeViewService.getSignalCandles(
                id,
                "15m",
            ),
            candle_1h: await ioc.exchangeViewService.getSignalCandles(id, "1h"),
        };
    },
    {
        timeout: CACHE_TTL,
        key: ([id]) => `${id}`,
    },
);

const handleDownload = async (pathname: string, id: string) => {
    const { candle_15m, candle_1h, candle_1m, signal, notification } =
        await fetchData(id);

    if (pathname.includes("/signal")) {
        const blob = new Blob([JSON.stringify(signal, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        ioc.layoutService.downloadFile(url, `signal_${signal.id}.json`);
        return;
    }

    if (pathname.includes("/status")) {
        const blob = new Blob([JSON.stringify(signal, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        ioc.layoutService.downloadFile(url, `status_${signal.id}.json`);
        return;
    }

    if (pathname.includes("/notification")) {
        const blob = new Blob([JSON.stringify(notification, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        ioc.layoutService.downloadFile(url, `notification_${signal.id}.json`);
        return;
    }

    if (pathname.includes("/candle_1m")) {
        const blob = new Blob([JSON.stringify(candle_1m, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        ioc.layoutService.downloadFile(url, `candles_1m_${signal.id}.json`);
        return;
    }

    if (pathname.includes("/candle_15m")) {
        const blob = new Blob([JSON.stringify(candle_15m, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        ioc.layoutService.downloadFile(url, `candles_15m_${signal.id}.json`);
        return;
    }

    if (pathname.includes("/candle_1h")) {
        const blob = new Blob([JSON.stringify(candle_1h, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        ioc.layoutService.downloadFile(url, `candles_1h_${signal.id}.json`);
        return;
    }
};

const handleCopy = async (
    pathname: string,
    id: string,
    onCopy: (content: string) => void,
) => {
    const { candle_15m, candle_1h, candle_1m, signal, status, notification } =
        await fetchData(id);

    if (pathname.includes("/status")) {
        onCopy(JSON.stringify(status, null, 2));
        return;
    }

    if (pathname.includes("/signal")) {
        onCopy(JSON.stringify(signal, null, 2));
        return;
    }

    if (pathname.includes("/notification")) {
        onCopy(JSON.stringify(notification, null, 2));
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

export const useSignalView = () => {
    const [id$, setId] = useActualState("");
    const ctx = useModalManager();
    const { push, pop } = ctx;

    const [pathname$, setPathname] = useActualRef(history.location.pathname);

    const handleTabChange = (id: string) => {
        if (id === "status") {
            history.replace(`/status`);
            setPathname(`/status`);
        }
        if (id === "signal") {
            history.replace(`/signal`);
            setPathname(`/signal`);
        }
        if (id === "notification") {
            history.replace(`/notification`);
            setPathname(`/notification`);
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
        title: "Signal Details",
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
                        const { signal } = await fetchData(id$.current);
                        if (!signal) {
                          return null;
                        }
                        return (
                            <ActionIcon
                                sx={{ mr: "10px" }}
                                onClick={() => ioc.markdownHelperService.printFields(
                                  signal_fields,
                                  signal,
                                )}
                            >
                                <Print />
                            </ActionIcon>
                        );
                    }}
                </Async>
                <Async>
                    {async () => {
                        const { signal } = await fetchData(id$.current);
                        if (!signal?.id) {
                            return null;
                        }
                        return (
                            <ActionIcon
                                sx={{ mr: "10px" }}
                                onClick={() => {
                                    ctx.clear();
                                    ioc.routerService.push(
                                        `/dump/${signal.id}`,
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
                        await handleCopy(
                            pathname$.current,
                            id$.current,
                            onCopy,
                        );
                    }}
                    sx={{ mr: "10px", mt: "2.5px" }}
                />
                <ActionIcon
                    onClick={() =>
                        handleDownload(pathname$.current, id$.current)
                    }
                >
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
