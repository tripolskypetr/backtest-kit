import { Box, Chip, Paper, SxProps, Typography } from "@mui/material";
import StatusModel from "../../model/Status.model";
import { makeStyles } from "../../styles";
import { AutoSizer, formatAmount, PaperView } from "react-declarative";
import { Chart } from "react-chartjs-2";
import { t } from "../../i18n";

const HEADER_HEIGHT = "35px";

const useStyles = makeStyles()((theme) => ({
    root: {
        position: "relative",
        height: "100%",
        width: "100%",
        background: "#eee",
        overflow: "clip",
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
        overflow: "clip",
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
    outlinePaper: boolean;
    className?: string;
    style?: React.CSSProperties;
    sx?: SxProps;
    data: StatusModel;
}

export const PartialWidget = ({
    outlinePaper,
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
                    <Typography variant="body2">{t("No partial exits")}</Typography>
                </Box>
            );
        }

        // Порт computeEffectivePriceAtPartial из бэкенда (getEffectivePriceOpen.ts):
        // эффективная цена входа на момент partials[targetIndex] считается
        // итеративно — остаточный basis предыдущей частички по её effPrice
        // плюс DCA-входы, добавленные между частичками
        const computeEffectiveEntry = (targetIndex: number): number => {
            const entries = data.positionEntries;
            const partials = data.positionPartials;
            const p0 = partials[0];
            const coinsAtP0 = entries
                .slice(0, p0.entryCountAtClose)
                .reduce((s, e) => s + e.cost / e.price, 0);
            let effPrice =
                coinsAtP0 === 0
                    ? data.originalPriceOpen
                    : p0.costBasisAtClose / coinsAtP0;
            for (let j = 1; j <= targetIndex; j++) {
                const prev = partials[j - 1];
                const curr = partials[j];
                const remainingCB = prev.costBasisAtClose * (1 - prev.percent / 100);
                const oldCoins = effPrice === 0 ? 0 : remainingCB / effPrice;
                const newEntries = entries.slice(prev.entryCountAtClose, curr.entryCountAtClose);
                const newCoins = newEntries.reduce((s, e) => s + e.cost / e.price, 0);
                const newCost = newEntries.reduce((s, e) => s + e.cost, 0);
                const totalCoins = oldCoins + newCoins;
                effPrice = totalCoins === 0 ? effPrice : (remainingCB + newCost) / totalCoins;
            }
            return effPrice;
        };

        const partialData = data.positionPartials.map((partial, idx) => {
            const effectiveEntry = computeEffectiveEntry(idx);
            const pnlPct =
                data.position === "long"
                    ? ((partial.currentPrice - effectiveEntry) / effectiveEntry) * 100
                    : ((effectiveEntry - partial.currentPrice) / effectiveEntry) * 100;
            const closedDollar = (partial.percent / 100) * partial.costBasisAtClose;
            // PnL в долларах — от проданной части (closedDollar), не от всего basis
            const pnlDollar = (pnlPct / 100) * closedDollar;
            return { partial, effectiveEntry, pnlPct, pnlDollar, closedDollar };
        });

        const totalPnlDollar = partialData.reduce((s, d) => s + d.pnlDollar, 0);
        const ppCount = data.positionPartials.filter((p) => p.type === "profit").length;
        const plCount = data.positionPartials.filter((p) => p.type === "loss").length;

        const labels = partialData.map(({ partial }, i) =>
            `#${i + 1} ${partial.type === "profit" ? t("PP") : t("PL")}`
        );

        const pnlColors = partialData.map(({ pnlPct }) =>
            pnlPct >= 0 ? "rgba(76, 175, 80, 1)" : "rgba(244, 67, 54, 1)"
        );

        const pnlChartData = {
            labels,
            datasets: [
                {
                    label: t("P&L ($)"),
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
                            return `${t("P&L")}: ${sign}${formatAmount(pnlDollar)}${t("$")} (${sign}${pnlPct.toFixed(2)}%)`;
                        },
                        afterBody: (items: { dataIndex: number }[]) => {
                            const idx = items[0].dataIndex;
                            const { partial, effectiveEntry, closedDollar } = partialData[idx];
                            return [
                                `${t("Type")}: ${partial.type === "profit" ? t("Partial Profit") : t("Partial Loss")}`,
                                `${t("Exit price")}: ${formatAmount(partial.currentPrice)}${t("$")}`,
                                `${t("Entry price")}: ${formatAmount(effectiveEntry)}${t("$")}`,
                                `${t("Closed")}: ${partial.percent}% (${formatAmount(closedDollar)}${t("$")})`,
                            ];
                        },
                    },
                },
            },
            scales: {
                y: {
                    type: "linear" as const,
                    title: { display: true, text: t("P&L ($)") },
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
                        {t("Total")}
                    </Typography>
                    <Typography
                        variant="body2"
                        fontWeight="medium"
                        sx={{ color: totalPnlDollar >= 0 ? "success.main" : "error.main" }}
                    >
                        {totalPnlDollar >= 0 ? "+" : ""}{formatAmount(totalPnlDollar)}$
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {t("PP")}
                    </Typography>
                    <Typography
                        variant="body2"
                        fontWeight="medium"
                        sx={{ color: "success.main" }}
                    >
                        {ppCount}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {t("PL")}
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
        <PaperView outlinePaper={outlinePaper} className={cx(classes.root, className)} style={style} sx={sx}>
            <div className={classes.header}>
                <div className={classes.title}>
                    <Typography className={classes.text} variant="body1">
                        {t("Partial Exits")}
                    </Typography>
                    <Chip
                        size="small"
                        variant="outlined"
                        color="info"
                        label={t("PP/PL")}
                    />
                </div>
            </div>
            <div className={classes.container}>
                <div className={classes.content}>{renderInner()}</div>
            </div>
        </PaperView>
    );
};

export default PartialWidget;
