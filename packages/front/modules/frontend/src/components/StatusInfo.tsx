import { Alert, Box, Collapse, IconButton, Typography } from "@mui/material";
import { useState } from "react";
import { makeStyles } from "../styles";
import { ExpandMore, ExpandLess, Download } from "@mui/icons-material";
import Markdown from "./common/Markdown";
import toPlainString from "../helpers/toPlainString";
import downloadMarkdown from "../utils/downloadMarkdown";
import StatusInfoModel from "../model/StatusInfo.model";
import ContentCopy from "@mui/icons-material/ContentCopy";
import { copyToClipboard } from "react-declarative";
import ioc from "../lib";
import { t } from "../i18n";

const useStyles = makeStyles()((theme) => ({
    root: {
        marginTop: theme.spacing(1),
        marginBottom: theme.spacing(2),
        marginLeft: theme.spacing(2),
        marginRight: theme.spacing(3),
        background: "white",
        transition: "opacity 500ms",
        "&:hover": {
            opacity: 1.0,
        },
        opacity: 0.35,
        cursor: "pointer",
    },
    open: {
        opacity: 1.0,
    },
    expandButton: {
        cursor: "pointer !important",
        marginLeft: theme.spacing(1),
    },
    copyButton: {
        cursor: "pointer !important",
        marginRight: theme.spacing(1),
    },
    downloadButton: {
        cursor: "pointer !important",
    },
}));

const fmt = (v: number | null, suffix = "%") =>
    v == null || Number.isNaN(v) ? "—" : `${v.toFixed(2)}${suffix}`;

const fmtMin = (v: number | null) =>
    v == null || Number.isNaN(v) ? "—" : `${v.toFixed(1)} ${t("min")}`;

const t = (key: string) =>
    window.Translate ? window.Translate.translateText(key) : key;

const toMarkdown = (data: StatusInfoModel): string => {
    const {
        context,
        portfolioTotalPnl,
        portfolioSharpeRatio,
        portfolioTotalTrades,
        portfolioStdDev,
        portfolioSortinoRatio,
        portfolioCalmarRatio,
        portfolioRecoveryFactor,
        portfolioExpectancy,
        portfolioAvgPeakPnl,
        portfolioAvgFallPnl,
        portfolioPeakProfitPnl,
        portfolioMaxDrawdownPnl,
        portfolioAvgDuration,
        portfolioMedianPnl,
        portfolioAvgConsecutiveWinPnl,
        portfolioAvgConsecutiveLossPnl,
        portfolioAvgWinDuration,
        portfolioAvgLossDuration,
        portfolioAnnualizedSharpeRatio,
        portfolioCertaintyRatio,
        portfolioExpectedYearlyReturns,
        portfolioTradesPerYear,
        symbols,
        backtest,
    } = data;

    const mode = backtest ? t("Backtest") : t("Live");
    const frame = context.frameName ? ` / ${context.frameName}` : "";

    const lines: string[] = [
        `## ${mode}: ${context.strategyName} / ${context.exchangeName}${frame}`,
        "",
        `**${t("Total PNL")}:** ${fmt(portfolioTotalPnl)}  `,
        `**${t("Sharpe Ratio")}:** ${fmt(portfolioSharpeRatio, "")}  `,
        `**${t("Annualized Sharpe")}:** ${fmt(portfolioAnnualizedSharpeRatio, "")}  `,
        `**${t("Certainty Ratio")}:** ${fmt(portfolioCertaintyRatio, "")}  `,
        `**${t("Expected Yearly Returns")}:** ${fmt(portfolioExpectedYearlyReturns)}  `,
        `**${t("Trades Per Year")}:** ${portfolioTradesPerYear !== null ? portfolioTradesPerYear.toFixed(1) : "—"}  `,
        `**${t("Total trades")}:** ${portfolioTotalTrades}  `,
        `**${t("Standard Deviation Per Trade")}:** ${fmt(portfolioStdDev)}  `,
        `**${t("Sortino Ratio")}:** ${fmt(portfolioSortinoRatio, "")}  `,
        `**${t("Calmar Ratio")}:** ${fmt(portfolioCalmarRatio, "")}  `,
        `**${t("Recovery Factor Per Equity Drawdown")}:** ${fmt(portfolioRecoveryFactor, "")}  `,
        `**${t("Expectancy")}:** ${fmt(portfolioExpectancy)}  `,
        `**${t("Median PNL")}:** ${fmt(portfolioMedianPnl)}  `,
        `**${t("Avg Peak PNL")}:** ${fmt(portfolioAvgPeakPnl)}  `,
        `**${t("Avg Drawdown PNL")}:** ${fmt(portfolioAvgFallPnl)}  `,
        `**${t("Peak Profit PNL")}:** ${fmt(portfolioPeakProfitPnl)}  `,
        `**${t("Max Drawdown PNL")}:** ${fmt(portfolioMaxDrawdownPnl)}  `,
        `**${t("Avg Duration")}:** ${fmtMin(portfolioAvgDuration)}  `,
        `**${t("Avg Win Duration")}:** ${fmtMin(portfolioAvgWinDuration)}  `,
        `**${t("Avg Loss Duration")}:** ${fmtMin(portfolioAvgLossDuration)}  `,
        `**${t("Avg Consecutive Win PNL")}:** ${fmt(portfolioAvgConsecutiveWinPnl)}  `,
        `**${t("Avg Consecutive Loss PNL")}:** ${fmt(portfolioAvgConsecutiveLossPnl)}`,
        "",
    ];

    for (const s of symbols) {
        lines.push(
            `### ${s.symbol}`,
            "",
            `**${t("PNL")}:** ${fmt(s.totalPnl)}  `,
            `**${t("Avg PNL")}:** ${fmt(s.avgPnl)}  `,
            `**${t("Median PNL")}:** ${fmt(s.medianPnl)}  `,
            `**${t("Win Rate")}:** ${fmt(s.winRate)}  `,
            `**${t("Profit Factor")}:** ${fmt(s.profitFactor, "")}  `,
            `**${t("Max Drawdown")}:** ${fmt(s.maxDrawdown)}  `,
            `**${t("Expectancy")}:** ${fmt(s.expectancy)}  `,
            `**${t("Sharpe Ratio")}:** ${fmt(s.sharpeRatio, "")}  `,
            `**${t("Annualized Sharpe")}:** ${fmt(s.annualizedSharpeRatio, "")}  `,
            `**${t("Certainty Ratio")}:** ${fmt(s.certaintyRatio, "")}  `,
            `**${t("Expected Yearly Returns")}:** ${fmt(s.expectedYearlyReturns)}  `,
            `**${t("Trades Per Year")}:** ${s.tradesPerYear !== null ? s.tradesPerYear.toFixed(1) : "—"}  `,
            `**${t("Sortino Ratio")}:** ${fmt(s.sortinoRatio, "")}  `,
            `**${t("Calmar Ratio")}:** ${fmt(s.calmarRatio, "")}  `,
            `**${t("Recovery Factor Per Equity Drawdown")}:** ${fmt(s.recoveryFactor, "")}  `,
            `**${t("Standard Deviation")}:** ${fmt(s.stdDev)}  `,
            `**${t("Avg Win")}:** ${fmt(s.avgWin)}  `,
            `**${t("Avg Loss")}:** ${fmt(s.avgLoss)}  `,
            `**${t("Max Win Streak")}:** ${s.maxWinStreak}  `,
            `**${t("Max Loss Streak")}:** ${s.maxLossStreak}  `,
            `**${t("Avg Peak PNL")}:** ${fmt(s.avgPeakPnl)}  `,
            `**${t("Avg Drawdown PNL")}:** ${fmt(s.avgFallPnl)}  `,
            `**${t("Peak Profit PNL")}:** ${fmt(s.peakProfitPnl)}  `,
            `**${t("Max Drawdown PNL")}:** ${fmt(s.maxDrawdownPnl)}  `,
            `**${t("Avg Duration")}:** ${fmtMin(s.avgDuration)}  `,
            `**${t("Avg Win Duration")}:** ${fmtMin(s.avgWinDuration)}  `,
            `**${t("Avg Loss Duration")}:** ${fmtMin(s.avgLossDuration)}  `,
            `**${t("Avg Consecutive Win PNL")}:** ${fmt(s.avgConsecutiveWinPnl)}  `,
            `**${t("Avg Consecutive Loss PNL")}:** ${fmt(s.avgConsecutiveLossPnl)}  `,
            `**${t("Trades")}:** ${s.totalTrades}`,
            "",
        );
    }

    return lines.join("\n");
};

interface IStatusInfoProps {
    data: StatusInfoModel;
}

export const StatusInfo = ({ data }: IStatusInfoProps) => {
    const { classes, cx } = useStyles();

    const [expanded, setExpanded] = useState(false);

    const content = toMarkdown(data);

    const handleExpandClick = () => {
        setExpanded(!expanded);
    };

    const handleDownloadPdf = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await downloadMarkdown(content);
    };

    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (await copyToClipboard(content)) {
            ioc.alertService.notify(t("Copied!"));
        }
    }

    const renderAction = () => (
        <>
            <IconButton
                className={classes.copyButton}
                onClick={handleCopy}
                size="small"
            >
                <ContentCopy />
            </IconButton>
            <IconButton
                className={classes.downloadButton}
                onClick={handleDownloadPdf}
                size="small"
            >
                <Download />
            </IconButton>
            <IconButton
                className={classes.expandButton}
                onClick={handleExpandClick}
                size="small"
            >
                {expanded ? <ExpandLess /> : <ExpandMore />}
            </IconButton>
        </>
    );

    return (
        <Alert
            className={cx(classes.root, {
                [classes.open]: expanded,
            })}
            action={renderAction()}
            onClick={handleExpandClick}
            variant="outlined"
            severity="info"
        >
            <Typography
                minHeight="100%"
                display="flex"
                flexDirection="column"
                alignItems="flex-start"
                justifyContent="flex-start"
                width="100%"
            >
                <Typography
                    variant="body2"
                    sx={{
                        opacity: expanded ? 0.5 : 1.0,
                        transition: "opacity 500ms",
                    }}
                    minHeight="100%"
                    display="flex"
                    flexDirection="column"
                    alignItems="flex-start"
                    justifyContent="center"
                >
                    {data.backtest ? t("Backtest") : t("Live")}: {data.context.strategyName}
                </Typography>

                <Collapse in={expanded} timeout="auto" unmountOnExit>
                    <Box paddingBottom="16px" />
                    <Markdown content={content} />
                    <Box paddingBottom="32px" />
                </Collapse>
                {!expanded && (
                    <Typography variant="caption" sx={{ opacity: 0.7, mt: 1 }}>
                        {toPlainString(content).slice(0, 150)}...
                    </Typography>
                )}
            </Typography>
        </Alert>
    );
};

export default StatusInfo;
