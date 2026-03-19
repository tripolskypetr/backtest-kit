import { Alert, Box, Collapse, IconButton, Typography } from "@mui/material";
import { useState } from "react";
import { makeStyles } from "../styles";
import { ExpandMore, ExpandLess, Download } from "@mui/icons-material";
import Markdown from "./common/Markdown";
import toPlainString from "../helpers/toPlainString";
import downloadMarkdown from "../utils/downloadMarkdown";
import StatusInfoModel from "../model/StatusInfo.model";

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
    downloadButton: {
        cursor: "pointer !important",
    },
}));

const fmt = (v: number | null, suffix = "%") =>
    v === null ? "—" : `${v.toFixed(2)}${suffix}`;

const t = (key: string) =>
    window.Translate ? window.Translate.translateText(key) : key;

const toMarkdown = (data: StatusInfoModel): string => {
    const { context, portfolioTotalPnl, portfolioSharpeRatio, portfolioTotalTrades, symbols, backtest } = data;

    const mode = backtest ? t("Backtest") : t("Live");
    const frame = context.frameName ? ` / ${context.frameName}` : "";

    const lines: string[] = [
        `## ${mode}: ${context.strategyName} / ${context.exchangeName}${frame}`,
        "",
        `**${t("Total PNL")}:** ${fmt(portfolioTotalPnl)}  `,
        `**Sharpe Ratio:** ${fmt(portfolioSharpeRatio, "")}  `,
        `**${t("Total trades")}:** ${portfolioTotalTrades}`,
        "",
    ];

    for (const s of symbols) {
        lines.push(
            `### ${s.symbol}`,
            "",
            `**PNL:** ${fmt(s.totalPnl)}  `,
            `**Win Rate:** ${fmt(s.winRate)}  `,
            `**Profit Factor:** ${fmt(s.profitFactor, "")}  `,
            `**Max Drawdown:** ${fmt(s.maxDrawdown)}  `,
            `**Expectancy:** ${fmt(s.expectancy)}  `,
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

    const renderAction = () => (
        <>
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
                    {data.backtest ? "Backtest" : "Live"}: {data.context.strategyName}
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
