import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import {
    Box,
    List,
    ListItemButton,
    ListItemText,
    Paper,
    darken,
    lighten,
    Typography,
    ListSubheader,
    ListItem,
    alpha,
    getContrastRatio,
    IconButton,
} from "@mui/material";
import {
    Async,
    formatAmount,
    ITabsOutletProps,
    useAsyncValue,
    useElementSize,
    useOnce,
    wordForm,
} from "react-declarative";
import React from "react";
import ioc from "../../../../lib";
import IconPhoto from "../../../../components/common/IconPhoto";
import { IStorageSignalRow } from "backtest-kit";
import actionSubject from "../config/actionSubject";

interface IListViewData {
    type: "backtest" | "live";
}

function isLightColor(hex: string) {
    // Compare contrast with black (#000000) and white (#FFFFFF)
    const contrastWithBlack = getContrastRatio(hex, "#000000");
    const contrastWithWhite = getContrastRatio(hex, "#FFFFFF");

    // If contrast with black is higher, the color is likely light
    return contrastWithBlack > contrastWithWhite;
}

const formatTimeElapsed = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString([], {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hourCycle: "h24",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
};

export const ListView = ({
    data: { type },
    setLoading,
}: ITabsOutletProps<IListViewData>) => {
    const { elementRef, size } = useElementSize<HTMLUListElement>({
        closest: ".MuiContainer-root",
        compute: (size) => {
            size.height -= 150;
            return size;
        },
    });

    const [signals, { loading, execute }] = useAsyncValue(
        async () => {
            if (type === "live") {
                return await ioc.storageViewService.listSignalLive();
            }
            return await ioc.storageViewService.listSignalBacktest();
        },
        {
            onLoadStart: () => setLoading(true),
            onLoadEnd: () => setLoading(false),
            deps: [type],
        },
    );

    useOnce(() =>
        actionSubject.subscribe((action) => {
            if (action === "update-now") {
                execute();
            }
        }),
    );

    const signalsBySymbol = React.useMemo(() => {
        if (!signals) return {};
        return signals.reduce(
            (acc, signal) => {
                if (!acc[signal.symbol]) {
                    acc[signal.symbol] = [];
                }
                acc[signal.symbol].push(signal);
                return acc;
            },
            {} as Record<string, IStorageSignalRow[]>,
        );
    }, [signals]);

    const renderGroup = (symbol: string) => {
        const items = signalsBySymbol[symbol] || [];

        if (!items.length) {
            return (
                <ListItem>
                    <ListItemText
                        sx={{
                            "& .MuiTypography-body2": {
                                maxWidth: "435px",
                            },
                        }}
                        primary="Нет сигналов"
                        secondary="Сигналы будут отображены здесь после появления"
                    />
                </ListItem>
            );
        }

        return (
            <>
                {items.map((item, idx) => (
                    <ListItemButton
                        sx={{
                            background: (theme) =>
                                idx % 2 === 1
                                    ? alpha(
                                          theme.palette.getContrastText(
                                              theme.palette.background.paper,
                                          ),
                                          0.02,
                                      )
                                    : undefined,
                        }}
                        onClick={() => ioc.layoutService.pickSignal(item.id)}
                        key={`item-${symbol}-${item.id}`}
                    >
                        <ListItemText
                            primary={
                                <Box
                                    sx={{
                                        display: "flex",
                                        gap: 2,
                                        flexWrap: "wrap",
                                        alignItems: "center",
                                    }}
                                >
                                    <Typography
                                        variant="body2"
                                        component="span"
                                        sx={{
                                            fontWeight: "bold",
                                            px: 1,
                                            py: 0.5,
                                            borderRadius: 1,
                                            background:
                                                item.position === "long"
                                                    ? "#1976D2"
                                                    : "#F57C00",
                                            color: "white",
                                        }}
                                    >
                                        {item.position === "long"
                                            ? "LONG"
                                            : "SHORT"}
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        component="span"
                                        sx={{ fontWeight: "medium" }}
                                    >
                                        <Box
                                            component="span"
                                            sx={{
                                                color: "text.secondary",
                                                mr: 0.5,
                                            }}
                                        >
                                            Entry:
                                        </Box>
                                        {formatAmount(item.priceOpen)}$
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        component="span"
                                        sx={{
                                            fontWeight: "medium",
                                            color: "success.main",
                                        }}
                                    >
                                        <Box
                                            component="span"
                                            sx={{
                                                color: "text.secondary",
                                                mr: 0.5,
                                            }}
                                        >
                                            TP:
                                        </Box>
                                        {formatAmount(item.priceTakeProfit)}$
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        component="span"
                                        sx={{
                                            fontWeight: "medium",
                                            color: "error.main",
                                        }}
                                    >
                                        <Box
                                            component="span"
                                            sx={{
                                                color: "text.secondary",
                                                mr: 0.5,
                                            }}
                                        >
                                            SL:
                                        </Box>
                                        {formatAmount(item.priceStopLoss)}$
                                    </Typography>
                                    {"pnl" in item && (
                                        <Typography
                                            variant="body2"
                                            component="span"
                                            sx={{
                                                fontWeight: "bold",
                                                px: 1,
                                                py: 0.5,
                                                borderRadius: 1,
                                                background:
                                                    item.pnl.pnlPercentage >= 0
                                                        ? alpha("#4caf50", 0.15)
                                                        : alpha("#f44336", 0.15),
                                                color:
                                                    item.pnl.pnlPercentage >= 0
                                                        ? "#2e7d32"
                                                        : "#c62828",
                                            }}
                                        >
                                            PNL: {item.pnl.pnlPercentage >= 0 ? "+" : ""}
                                            {item.pnl.pnlPercentage.toFixed(2)}%
                                        </Typography>
                                    )}
                                    <Typography
                                        variant="caption"
                                        component="span"
                                        sx={{
                                            px: 1,
                                            py: 0.25,
                                            borderRadius: 0.5,
                                            background:
                                                item.status === "opened"
                                                    ? alpha("#4caf50", 0.2)
                                                    : item.status ===
                                                        "scheduled"
                                                      ? alpha("#ff9800", 0.2)
                                                      : item.status === "closed"
                                                        ? alpha("#9e9e9e", 0.2)
                                                        : alpha("#f44336", 0.2),
                                            color:
                                                item.status === "opened"
                                                    ? "#2e7d32"
                                                    : item.status ===
                                                        "scheduled"
                                                      ? "#e65100"
                                                      : item.status === "closed"
                                                        ? "#616161"
                                                        : "#c62828",
                                        }}
                                    >
                                        {item.status}
                                    </Typography>
                                </Box>
                            }
                            secondary={
                                <Typography
                                    pt={0.5}
                                    variant="subtitle2"
                                    sx={{ opacity: 0.5 }}
                                >
                                    {formatTimeElapsed(
                                        item.createdAt || item.pendingAt,
                                    )}
                                </Typography>
                            }
                        />
                        <IconButton disableRipple>
                            <ArrowForwardIcon />
                        </IconButton>
                    </ListItemButton>
                ))}
            </>
        );
    };

    if (loading) {
        return null;
    }

    return (
        <List
            ref={elementRef}
            sx={{
                width: "100%",
                maxHeight: size.height,
                overflowX: "hidden",
                overflowY: "auto",
                scrollbarWidth: "thin",
                bgcolor: "background.paper",
                position: "relative",
                "& ul": { padding: 0 },
            }}
            subheader={<li />}
        >
            <Async deps={[signalsBySymbol]}>
                {async () => {
                    const symbolList = Object.keys(signalsBySymbol);
                    const symbolMap =
                        await ioc.symbolGlobalService.getSymbolMap();

                    if (!symbolList.length) {
                        return (
                            <ListItem>
                                <ListItemText
                                    primary="No signals yet"
                                    secondary={
                                        type === "live"
                                            ? "Live signals will be displayed here"
                                            : "Backtest signals will be displayed here"
                                    }
                                />
                            </ListItem>
                        );
                    }

                    return symbolList.map((symbol) => {
                        const color = symbolMap[symbol]?.color;
                        const count = signalsBySymbol[symbol]?.length || 0;
                        return (
                            <li key={`section-${symbol}`}>
                                <ul>
                                    <ListSubheader
                                        sx={{
                                            background: isLightColor(color)
                                                ? darken(color, 0.1)
                                                : lighten(color, 0.1),
                                            color: "white !important",
                                            zIndex: 9,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                position: "relative",
                                                paddingRight: "8px",
                                            }}
                                        >
                                            <IconPhoto symbol={symbol} />
                                        </Box>
                                        {symbolMap[symbol]?.displayName ||
                                            symbol}
                                        <Box flex={1} />
                                        <Typography
                                            variant="body2"
                                            sx={{ fontWeight: "medium" }}
                                        >
                                            {wordForm(count, { one: "Signal", two: "Signals", many: "Signals" })}
                                        </Typography>
                                    </ListSubheader>
                                    <Box
                                        sx={{
                                            marginTop: "16px",
                                            marginBottom: "16px",
                                        }}
                                    >
                                        {renderGroup(symbol)}
                                    </Box>
                                </ul>
                            </li>
                        );
                    });
                }}
            </Async>
        </List>
    );
};

export default ListView;
