import {
    useActualState,
    useModalManager,
    useTabsModal,
    History,
    useActualRef,
    ActionIcon,
    ttl,
} from "react-declarative";
import { ArrowBack, Close, Print } from "@mui/icons-material";
import { createMemoryHistory } from "history";
import routes from "./routes";
import { CC_FULLSCREEN_SIZE_REQUEST } from "../../config/params";
import tabs from "./tabs";
import { Box, Stack } from "@mui/material";
import ioc from "../../lib";
import downloadMarkdown from "../../utils/downloadMarkdown";
import CopyIcon from "./components/CopyIcon";
import MenuIcon from "./components/MenuIcon";

const CACHE_TTL = 45_000;

const history = createMemoryHistory();

const fetchData = ttl(
    async (id: string, type: "backtest" | "live") => {
        const list =
            type === "backtest"
                ? await ioc.backtestGlobalService.list()
                : await ioc.liveGlobalService.list();

        const item = list.find((entry) => entry.id === id);

        if (!item) {
            throw new Error(`Item not found: ${id}`);
        }

        const { symbol, strategyName, exchangeName, frameName } = item;

        const [
            backtest,
            live,
            breakeven,
            risk,
            partial,
            highest_profit,
            schedule,
            performance,
            sync,
            heat,
            strategy,
        ] = await Promise.all([
            type === "backtest"
                ? ioc.markdownViewService.getBacktestReport(
                      symbol,
                      strategyName,
                      exchangeName,
                      frameName,
                  )
                : Promise.resolve(""),
            type === "live"
                ? ioc.markdownViewService.getLiveReport(
                      symbol,
                      strategyName,
                      exchangeName,
                  )
                : Promise.resolve(""),
            ioc.markdownViewService.getBreakevenReport(
                symbol,
                strategyName,
                exchangeName,
                frameName,
                type === "backtest",
            ),
            ioc.markdownViewService.getRiskReport(
                symbol,
                strategyName,
                exchangeName,
                frameName,
                type === "backtest",
            ),
            ioc.markdownViewService.getPartialReport(
                symbol,
                strategyName,
                exchangeName,
                frameName,
                type === "backtest",
            ),
            ioc.markdownViewService.getHighestProfitReport(
                symbol,
                strategyName,
                exchangeName,
                frameName,
                type === "backtest",
            ),
            ioc.markdownViewService.getScheduleReport(
                symbol,
                strategyName,
                exchangeName,
                frameName,
                type === "backtest",
            ),
            ioc.markdownViewService.getPerformanceReport(
                symbol,
                strategyName,
                exchangeName,
                frameName,
                type === "backtest",
            ),
            ioc.markdownViewService.getSyncReport(
                symbol,
                strategyName,
                exchangeName,
                frameName,
                type === "backtest",
            ),
            ioc.markdownViewService.getHeatReport(
                strategyName,
                exchangeName,
                frameName,
                type === "backtest",
            ),
            ioc.markdownViewService.getStrategyReport(
                symbol,
                strategyName,
                exchangeName,
                frameName,
                type === "backtest",
            ),
        ]);

        return {
            type,
            backtest,
            live,
            breakeven,
            risk,
            partial,
            highest_profit,
            schedule,
            performance,
            sync,
            heat,
            strategy,
        };
    },
    {
        timeout: CACHE_TTL,
        key: ([id, type]) => `${id}_${type}`,
    },
);

const handleCopy = async (
    pathname: string,
    id: string,
    type: "backtest" | "live",
    onCopy: (content: string) => void,
) => {
    const list =
        type === "backtest"
            ? await ioc.backtestGlobalService.list()
            : await ioc.liveGlobalService.list();

    const item = list.find((entry) => entry.id === id);

    if (!item) {
        throw new Error(`Item not found: ${id}`);
    }

    const { symbol, strategyName, exchangeName, frameName } = item;
    const backtest = type === "backtest";

    if (pathname.includes("/markdown_report/backtest")) {
        onCopy(
            JSON.stringify(
                await ioc.markdownViewService.getBacktestData(
                    symbol,
                    strategyName,
                    exchangeName,
                    frameName,
                ),
                null,
                2,
            ),
        );
        return;
    }
    if (pathname.includes("/markdown_report/live")) {
        onCopy(
            JSON.stringify(
                await ioc.markdownViewService.getLiveData(
                    symbol,
                    strategyName,
                    exchangeName,
                ),
                null,
                2,
            ),
        );
        return;
    }
    if (pathname.includes("/markdown_report/breakeven")) {
        onCopy(
            JSON.stringify(
                await ioc.markdownViewService.getBreakevenData(
                    symbol,
                    strategyName,
                    exchangeName,
                    frameName,
                    backtest,
                ),
                null,
                2,
            ),
        );
        return;
    }
    if (pathname.includes("/markdown_report/risk")) {
        onCopy(
            JSON.stringify(
                await ioc.markdownViewService.getRiskData(
                    symbol,
                    strategyName,
                    exchangeName,
                    frameName,
                    backtest,
                ),
                null,
                2,
            ),
        );
        return;
    }
    if (pathname.includes("/markdown_report/partial")) {
        onCopy(
            JSON.stringify(
                await ioc.markdownViewService.getPartialData(
                    symbol,
                    strategyName,
                    exchangeName,
                    frameName,
                    backtest,
                ),
                null,
                2,
            ),
        );
        return;
    }
    if (pathname.includes("/markdown_report/highest_profit")) {
        onCopy(
            JSON.stringify(
                await ioc.markdownViewService.getHighestProfitData(
                    symbol,
                    strategyName,
                    exchangeName,
                    frameName,
                    backtest,
                ),
                null,
                2,
            ),
        );
        return;
    }
    if (pathname.includes("/markdown_report/schedule")) {
        onCopy(
            JSON.stringify(
                await ioc.markdownViewService.getScheduleData(
                    symbol,
                    strategyName,
                    exchangeName,
                    frameName,
                    backtest,
                ),
                null,
                2,
            ),
        );
        return;
    }
    if (pathname.includes("/markdown_report/performance")) {
        onCopy(
            JSON.stringify(
                await ioc.markdownViewService.getPerformanceData(
                    symbol,
                    strategyName,
                    exchangeName,
                    frameName,
                    backtest,
                ),
                null,
                2,
            ),
        );
        return;
    }
    if (pathname.includes("/markdown_report/sync")) {
        onCopy(
            JSON.stringify(
                await ioc.markdownViewService.getSyncData(
                    symbol,
                    strategyName,
                    exchangeName,
                    frameName,
                    backtest,
                ),
                null,
                2,
            ),
        );
        return;
    }
    if (pathname.includes("/markdown_report/heat")) {
        onCopy(
            JSON.stringify(
                await ioc.markdownViewService.getHeatData(
                    strategyName,
                    exchangeName,
                    frameName,
                    backtest,
                ),
                null,
                2,
            ),
        );
        return;
    }
    if (pathname.includes("/markdown_report/strategy")) {
        onCopy(
            JSON.stringify(
                await ioc.markdownViewService.getStrategyData(
                    symbol,
                    strategyName,
                    exchangeName,
                    frameName,
                    backtest,
                ),
                null,
                2,
            ),
        );
        return;
    }
};

export const useMarkdownReportView = () => {
    const [id$, setId] = useActualState("");
    const [type$, setType] = useActualState<"backtest" | "live">("backtest");
    const ctx = useModalManager();
    const { push, pop } = ctx;

    const [pathname$, setPathname] = useActualRef(history.location.pathname);

    const handleTabChange = (id: string, history: History) => {
        const path = `/markdown_report/${id}`;
        history.replace(path);
        setPathname(path);
    };

    const handlePrint = async () => {
        const data = await fetchData(id$.current, type$.current);
        const tab = pathname$.current.replace(
            "/markdown_report/",
            "",
        ) as keyof typeof data;
        const content = data[tab];
        if (typeof content === "string") {
            await downloadMarkdown(content);
        }
    };

    const handleDownloadMarkdown = async () => {
        const data = await fetchData(id$.current, type$.current);
        const tab = pathname$.current.replace(
            "/markdown_report/",
            "",
        ) as keyof typeof data;
        const content = data[tab];
        if (typeof content === "string") {
            const blob = new Blob([content], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            ioc.layoutService.downloadFile(url, `${tab}_${type$.current}_${Date.now()}.md`);
        }
    };

    const handleDownloadJson = async () => {
        const list =
            type$.current === "backtest"
                ? await ioc.backtestGlobalService.list()
                : await ioc.liveGlobalService.list();

        const item = list.find((entry) => entry.id === id$.current);

        if (!item) {
            throw new Error(`Item not found: ${id$.current}`);
        }

        const { symbol, strategyName, exchangeName, frameName } = item;
        const tab = pathname$.current.replace("/markdown_report/", "");
        const backtest = type$.current === "backtest";

        let jsonData: unknown;
        if (tab === "backtest") {
            jsonData = await ioc.markdownViewService.getBacktestData(symbol, strategyName, exchangeName, frameName);
        } else if (tab === "live") {
            jsonData = await ioc.markdownViewService.getLiveData(symbol, strategyName, exchangeName);
        } else if (tab === "breakeven") {
            jsonData = await ioc.markdownViewService.getBreakevenData(symbol, strategyName, exchangeName, frameName, backtest);
        } else if (tab === "risk") {
            jsonData = await ioc.markdownViewService.getRiskData(symbol, strategyName, exchangeName, frameName, backtest);
        } else if (tab === "partial") {
            jsonData = await ioc.markdownViewService.getPartialData(symbol, strategyName, exchangeName, frameName, backtest);
        } else if (tab === "highest_profit") {
            jsonData = await ioc.markdownViewService.getHighestProfitData(symbol, strategyName, exchangeName, frameName, backtest);
        } else if (tab === "schedule") {
            jsonData = await ioc.markdownViewService.getScheduleData(symbol, strategyName, exchangeName, frameName, backtest);
        } else if (tab === "performance") {
            jsonData = await ioc.markdownViewService.getPerformanceData(symbol, strategyName, exchangeName, frameName, backtest);
        } else if (tab === "sync") {
            jsonData = await ioc.markdownViewService.getSyncData(symbol, strategyName, exchangeName, frameName, backtest);
        } else if (tab === "heat") {
            jsonData = await ioc.markdownViewService.getHeatData(strategyName, exchangeName, frameName, backtest);
        } else if (tab === "strategy") {
            jsonData = await ioc.markdownViewService.getStrategyData(symbol, strategyName, exchangeName, frameName, backtest);
        }

        if (jsonData !== undefined) {
            const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            ioc.layoutService.downloadFile(url, `${tab}_${type$.current}_${Date.now()}.json`);
        }
    };

    const { pickData, render } = useTabsModal({
        tabs,
        withStaticAction: true,
        onTabChange: handleTabChange,
        animation: "none",
        title: "Markdown Report",
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
                <ActionIcon
                    sx={{ mr: "10px" }}
                    onClick={() => handlePrint()}
                >
                    <Print />
                </ActionIcon>
                <CopyIcon
                    onClick={async (_, onCopy) => {
                        await handleCopy(
                            pathname$.current,
                            id$.current,
                            type$.current,
                            onCopy,
                        );
                    }}
                    sx={{ mr: "10px", mt: "2.5px" }}
                />
                <MenuIcon
                    sx={{ mr: "10px", mt: "0.5px" }}
                    onDownloadJson={handleDownloadJson}
                    onDownloadMarkdown={handleDownloadMarkdown}
                    onDownloadPdf={handlePrint}
                />
                <ActionIcon onClick={onClose}>
                    <Close />
                </ActionIcon>
            </Stack>
        ),
        fetchState: async () => await fetchData(id$.current, type$.current),
        mapInitialData: ([
            {
                type,
                backtest,
                live,
                breakeven,
                risk,
                partial,
                highest_profit,
                schedule,
                performance,
                sync,
                heat,
                strategy,
            },
        ]) => ({
            backtest,
            live,
            breakeven,
            risk,
            partial,
            highest_profit,
            schedule,
            performance,
            sync,
            heat,
            strategy,
            type,
        }),
        mapPayload: ([{ type }]) => ({ type }),
        onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
        onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
        onClose: () => {
            pop();
        },
    });

    return (id: string, type: "backtest" | "live") => {
        push({
            id: "markdown_report_modal",
            render,
            onInit: () => {
                const initialPath =
                    type === "live"
                        ? "/markdown_report/live"
                        : "/markdown_report/backtest";
                history.push(initialPath);
                setPathname(initialPath);
            },
            onMount: () => {
                setId(id);
                setType(type);
                pickData();
            },
        });
    };
};

export default useMarkdownReportView;
