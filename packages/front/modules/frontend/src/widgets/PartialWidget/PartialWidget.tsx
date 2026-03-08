import { Box, Chip, Paper, SxProps, Typography } from "@mui/material";
import StatusModel from "../../model/Status.model";
import { makeStyles } from "../../styles";
import { AutoSizer, formatAmount } from "react-declarative";
import { Chart } from "react-chartjs-2";

const HEADER_HEIGHT = "35px";

const useStyles = makeStyles()((theme) => ({
    root: {
        position: "relative",
        height: "100%",
        width: "100%",
        background: "#eee",
        overflow: "hidden",
    },
    header: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: "8px",
        paddingRight: "4px",
        height: HEADER_HEIGHT,
    },
    text: {
        opacity: 0.5,
        padding: 0,
        margin: 0,
        height: HEADER_HEIGHT,
        display: "flex",
        alignItems: "center",
    },
    title: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
    },
    icon: {
        opacity: 0.5,
        transition: "opacity 500ms",
        "&:hover": {
            opacity: 1.0,
        },
    },
    container: {
        position: "absolute",
        top: HEADER_HEIGHT,
        left: 0,
        right: 0,
        bottom: 0,
        height: `calc(100% - ${HEADER_HEIGHT})`,
        width: "100%",
        background: "white",
        overflow: "hidden",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "stretch",
    },
    content: {
        display: "flex",
        flex: 1,
    },
}));

interface IPartialWidgetProps {
    className?: string;
    style?: React.CSSProperties;
    sx?: SxProps;
    data: StatusModel;
}

export const PartialWidget = ({
    className,
    style,
    sx,
    data,
}: IPartialWidgetProps) => {
    const { classes, cx } = useStyles();

    const renderInner = () => {
        if (!data.positionPartials.length) {
            return (
                <Box sx={{ p: 1, color: "text.secondary" }}>
                    <Typography variant="body2">No partial exits</Typography>
                </Box>
            );
        }

        const partialData = data.positionPartials.map((partial) => {
            const entriesAtClose = data.positionEntries.slice(0, partial.entryCountAtClose);
            const totalCost = entriesAtClose.reduce((s, e) => s + e.cost, 0);
            const totalCoins = entriesAtClose.reduce((s, e) => s + e.cost / e.price, 0);
            const effectiveEntry = totalCoins === 0 ? data.originalPriceOpen : totalCost / totalCoins;
            const pnlPct =
                data.position === "long"
                    ? ((partial.currentPrice - effectiveEntry) / effectiveEntry) * 100
                    : ((effectiveEntry - partial.currentPrice) / effectiveEntry) * 100;
            const closedDollar = (partial.percent / 100) * partial.costBasisAtClose;
            const pnlDollar = (pnlPct / 100) * partial.costBasisAtClose;
            return { partial, effectiveEntry, pnlPct, pnlDollar, closedDollar };
        });

        const totalPnlDollar = partialData.reduce((s, d) => s + d.pnlDollar, 0);
        const ppCount = data.positionPartials.filter((p) => p.type === "profit").length;
        const plCount = data.positionPartials.filter((p) => p.type === "loss").length;

        const labels = partialData.map(({ partial }, i) =>
            `#${i + 1} ${partial.type === "profit" ? "PP" : "PL"}`
        );

        const pnlColors = partialData.map(({ pnlPct }) =>
            pnlPct >= 0 ? "rgba(76, 175, 80, 1)" : "rgba(244, 67, 54, 1)"
        );

        const pnlChartData = {
            labels,
            datasets: [
                {
                    label: "P&L ($)",
                    data: partialData.map(({ pnlDollar }) => pnlDollar),
                    backgroundColor: pnlColors.map((c) => c.replace(", 1)", ", 0.5)")),
                    borderColor: pnlColors,
                    borderWidth: 1,
                },
            ],
        };

        const pnlChartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: false as const,
            layout: { padding: { top: 8, right: 8, bottom: 8, left: 8 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx: { dataIndex: number }) => {
                            const { pnlDollar, pnlPct } = partialData[ctx.dataIndex];
                            const sign = pnlDollar >= 0 ? "+" : "";
                            return `P&L: ${sign}${formatAmount(pnlDollar)}$ (${sign}${pnlPct.toFixed(2)}%)`;
                        },
                        afterBody: (items: { dataIndex: number }[]) => {
                            const idx = items[0].dataIndex;
                            const { partial, effectiveEntry, closedDollar } = partialData[idx];
                            return [
                                `Type: ${partial.type === "profit" ? "Partial Profit" : "Partial Loss"}`,
                                `Exit price: ${formatAmount(partial.currentPrice)}$`,
                                `Entry price: ${formatAmount(effectiveEntry)}$`,
                                `Closed: ${partial.percent}% (${formatAmount(closedDollar)}$)`,
                            ];
                        },
                    },
                },
            },
            scales: {
                y: {
                    type: "linear" as const,
                    title: { display: true, text: "P&L ($)" },
                },
            },
        };

        return (
            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    width: "100%",
                    height: "100%",
                }}
            >
                <Box sx={{ flex: 1, minHeight: 0 }}>
                    <AutoSizer>
                        {({ height, width }) => (
                            <div style={{ height, width }}>
                                <Chart type="bar" data={pnlChartData} options={pnlChartOptions} />
                            </div>
                        )}
                    </AutoSizer>
                </Box>
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                        px: 1,
                        py: 0.5,
                        borderTop: "1px solid",
                        borderColor: "divider",
                        flexShrink: 0,
                    }}
                >
                    <Typography variant="caption" color="text.secondary">
                        Total
                    </Typography>
                    <Typography
                        variant="body2"
                        fontWeight="medium"
                        sx={{ color: totalPnlDollar >= 0 ? "success.main" : "error.main" }}
                    >
                        {totalPnlDollar >= 0 ? "+" : ""}{formatAmount(totalPnlDollar)}$
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        PP
                    </Typography>
                    <Typography
                        variant="body2"
                        fontWeight="medium"
                        sx={{ color: "success.main" }}
                    >
                        {ppCount}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        PL
                    </Typography>
                    <Typography
                        variant="body2"
                        fontWeight="medium"
                        sx={{ color: "error.main" }}
                    >
                        {plCount}
                    </Typography>
                </Box>
            </Box>
        );
    };

    return (
        <Paper className={cx(classes.root, className)} style={style} sx={sx}>
            <div className={classes.header}>
                <div className={classes.title}>
                    <Typography className={classes.text} variant="body1">
                        Partial Exits
                    </Typography>
                    <Chip
                        size="small"
                        variant="outlined"
                        color="info"
                        label="PP/PL"
                    />
                </div>
            </div>
            <div className={classes.container}>
                <div className={classes.content}>{renderInner()}</div>
            </div>
        </Paper>
    );
};

export default PartialWidget;
