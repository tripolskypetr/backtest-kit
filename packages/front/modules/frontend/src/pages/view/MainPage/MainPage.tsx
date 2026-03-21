import {
    Box,
    Button,
    ButtonBase,
    Chip,
    Container,
    darken,
    getContrastRatio,
    lighten,
    Paper,
    Stack,
} from "@mui/material";
import {
    Async,
    Breadcrumbs2,
    Breadcrumbs2Type,
    Center,
    FieldType,
    IBreadcrumbs2Action,
    IBreadcrumbs2Option,
    IOutletProps,
    LoaderView,
    One,
    sleep,
    TypedField,
    typo,
} from "react-declarative";
import { makeStyles } from "../../../styles";
import {
    AccountBalanceWalletTwoTone,
    AdfScannerTwoTone,
    CandlestickChartTwoTone,
    CircleNotificationsTwoTone,
    Dashboard,
    FilePresentTwoTone,
    LeaderboardTwoTone,
    InsertChartTwoTone,
    KeyboardArrowLeft,
    NotificationsActive,
    PlayCircle,
    PlayCircleFilledWhiteTwoTone,
    PlayCircleOutline,
    Quickreply,
    Refresh,
    ShoppingCartCheckout,
    TerminalTwoTone,
    DataObject,
    Description,
    PictureAsPdf,
} from "@mui/icons-material";
import { useMemo } from "react";
import ioc from "../../../lib";
import IconWrapper from "../../../components/common/IconWrapper";
import { reloadSubject } from "../../../config/emitters";
import StatusInfo from "../../../components/StatusInfo";
import downloadMarkdown from "../../../utils/downloadMarkdown";
import str from "../../../utils/src";
import Tooltip from "../../../components/common/Tooltip";

const GROUP_HEADER = "backtest-kit__groupHeader";
const GROUP_ROOT = "backtest-kit__groupRoot";

const ICON_ROOT = "backtest-kit__symbolImage";

const useStyles = makeStyles()({
    root: {
        [`& .${GROUP_ROOT}:hover .${GROUP_HEADER}`]: {
            opacity: "1 !important",
        },
    },
});

interface IRoute {
    label: string;
    description: string;
    to: string;
    color: string;
    icon: React.ComponentType<any>;
}

function isLightColor(hex: string) {
    // Compare contrast with black (#000000) and white (#FFFFFF)
    const contrastWithBlack = getContrastRatio(hex, "#000000");
    const contrastWithWhite = getContrastRatio(hex, "#FFFFFF");

    // If contrast with black is higher, the color is likely light
    return contrastWithBlack > contrastWithWhite;
}

const options: IBreadcrumbs2Option[] = [
    {
        type: Breadcrumbs2Type.Link,
        action: "back-action",
        label: "Main",
    },
    {
        type: Breadcrumbs2Type.Link,
        action: "back-action",
        label: "Navigation",
    },
];

const actions: IBreadcrumbs2Action[] = [
    {
        action: "download-json",
        label: "Download Heatmap JSON",
        icon: () => <IconWrapper icon={DataObject} color="#4caf50" />,
    },
    {
        action: "download-markdown",
        label: "Download Heatmap Markdown",
        icon: () => <IconWrapper icon={Description} color="#4caf50" />,
    },
    {
        action: "download-pdf",
        label: "Download Heatmap PDF",
        icon: () => <IconWrapper icon={PictureAsPdf} color="#4caf50" />,
    },
    {
        divider: true,
    },
    {
        action: "update-now",
        label: "Refresh",
        icon: () => <IconWrapper icon={Refresh} color="#4caf50" />,
    },
];

const createButton = (
    to: string,
    label: React.ReactNode,
    description: string,
    color: string,
    Icon: React.ComponentType<any>,
): TypedField => ({
    type: FieldType.Component,
    desktopColumns: "6",
    tabletColumns: "12",
    phoneColumns: "12",
    fieldRightMargin: "1",
    fieldBottomMargin: "1",
    element: () => (
        <Tooltip description={description}>
            <Button
                component={ButtonBase}
                onClick={() => {
                    ioc.routerService.push(to);
                }}
                sx={{
                    width: "100%",
                    background: color,
                    color: "white",
                    fontWeight: "bold",
                    fontSize: "18px",
                    height: "75px",
                    minHeight: "125px",
                    textWrap: "wrap",
                    padding: "16px",
                    [`& .${ICON_ROOT}`]: {
                        transition: "filter 500ms",
                    },
                    "&:hover": {
                        background: () =>
                            isLightColor(color)
                                ? darken(color, 0.33)
                                : lighten(color, 0.33),
                        [`& .${ICON_ROOT}`]: {
                            transition: "filter 500ms",
                            filter: isLightColor(color)
                                ? "brightness(0.7) contrast(1.2)"
                                : "brightness(1.3) contrast(0.5)",
                        },
                    },
                    transition: "background 500ms",
                }}
                startIcon={<Icon className={ICON_ROOT} />}
            >
                {label}
            </Button>
        </Tooltip>
    ),
});

const createGroup = (label: string, routes: IRoute[]): TypedField => ({
    type: FieldType.Group,
    className: GROUP_ROOT,
    sx: {
        p: 2,
    },
    desktopColumns: "6",
    tabletColumns: "6",
    phoneColumns: "12",
    fields: [
        {
            type: FieldType.Component,
            className: GROUP_HEADER,
            style: {
                transition: "opacity 500ms",
                opacity: 0.5,
            },
            element: () => (
                <Stack direction="row">
                    <Chip
                        variant="outlined"
                        size="medium"
                        color="info"
                        label={`${typo.bullet} ${label}`}
                        sx={{
                            mb: 1,
                            pr: 0.5,
                            fontSize: "16px",
                            background: "white",
                            cursor: "not-allowed",
                        }}
                    />
                    <Box flex={1} />
                </Stack>
            ),
        },
        {
            type: FieldType.Group,
            fields: routes.map(({ label, description, to, color, icon }) =>
                createButton(to, label, description, color, icon),
            ),
        },
    ],
});

const application_routes: IRoute[] = [
    {
        label: "Portfolio Overview",
        description: str.newline(
            "Closed trading signals grouped by symbol for Backtest and Live modes",
            "Each card shows position type, entry price, TP/SL levels, PNL amount and percent",
            "Displays DCA entry count and partial close count where applicable",
            "Supports JSON export and manual refresh of the signal list",
        ),
        to: `/overview`,
        color: "#0033AD",
        icon: AccountBalanceWalletTwoTone,
    },
    {
        label: "PNL Performance",
        description: str.newline(
            "KPI dashboard with aggregated trading performance metrics per symbol",
            "Shows daily trade counts, success rates, resolved/rejected breakdowns",
            "Revenue analytics across today, yesterday, 7-day and 31-day windows",
            "Toggle between Backtest and Live modes; supports JSON export",
        ),
        to: `/dashboard`,
        color: "#E6007A",
        icon: InsertChartTwoTone,
    },
    {
        label: "System Logs",
        description: str.newline(
            "Virtualized feed of runtime log entries with type badges: Debug, Info, Warn, Log",
            "Each entry shows topic, timestamp and raw JSON arguments in monospace",
            "Filter by keyword or regex via search prompt",
            "Supports full log export as JSON file",
        ),
        to: `/logs`,
        color: "#58BF00",
        icon: TerminalTwoTone,
    },
];

const live_routes: IRoute[] = [
    {
        label: "Notifications",
        description: str.newline(
            "Event feed for all trading signals: opens, closes, schedules, errors",
            "Color-coded cards with symbol, position, PNL, entry/exit/TP/SL prices",
            "Infinite-scroll pagination; click any card to open a detailed modal",
            "Supports manual refresh to pull the latest activity",
        ),
        to: `/notifications`,
        color: "#F7931A",
        icon: CircleNotificationsTwoTone,
    },
    {
        label: "Pending Status",
        description: str.newline(
            "Live view of active trading signals grouped by strategy",
            "Grid of strategy buttons; click to inspect individual signal state",
            "Detail view shows entry, exit, effective price, DCA and partial counts",
            "Supports per-signal JSON export and manual refresh",
        ),
        to: `/status`,
        color: "#6F42C1",
        icon: PlayCircleFilledWhiteTwoTone,
    },
    {
        label: "Dump Explorer",
        description: str.newline(
            "Tree-structured file browser for backtest output and artifact files",
            "Icons indicate file type: image, JSON, plain text or generic",
            "Click any file to open a full-screen preview modal",
            "Supports keyword search and manual refresh of the file tree",
        ),
        to: `/dump`,
        color: "#0090FF",
        icon: FilePresentTwoTone,
    },
];

const other_routes: IRoute[] = [
    {
        label: "Markdown Reports",
        description: str.newline(
            "Strategy performance reports rendered from markdown for Backtest and Live runs",
            "Grid of strategy buttons grouped by type and sorted by signal volume",
            "Download reports as markdown, PDF or raw JSON",
            "Supports manual refresh to regenerate report content",
        ),
        to: `/report`,
        color: "#009688",
        icon: AdfScannerTwoTone,
    },
    {
        label: "Price Charts",
        description: str.newline(
            "Interactive candlestick charts powered by TradingView Lightweight Charts",
            "Navigate by symbol then interval (1m, 15m, 1h) to view price history",
            "Overlays active signal lines: entry, take profit (green) and stop loss (red)",
            "Supports chart image export and signal detail inspection",
        ),
        to: `/price_chart`,
        color: "#1565C0",
        icon: CandlestickChartTwoTone,
    },
    {
        label: "Heatmap",
        description: str.newline(
            "Color-coded performance heatmap across all tracked symbols",
            "Cells show win rate, profit factor, Sharpe ratio and other key metrics",
            "Download heatmap as JSON, markdown report or PDF",
            "Supports manual refresh to recalculate aggregated statistics",
        ),
        to: `/heat`,
        color: "#8D6E63",
        icon: LeaderboardTwoTone,
    },
];

const fields: TypedField[] = [
    createGroup("Application", application_routes),
    createGroup("Live", live_routes),
    createGroup("Other", other_routes),
];

const StatusLoader = () => <LoaderView sx={{ width: "100%", height: "75px" }} />


const handleDownloadMarkdown = async () => {
    const content = await ioc.heatViewService.getStrategyHeatReport();
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `heat_${Date.now()}.md`);
};

const handleDownloadPdf = async () => {
    const content = await ioc.heatViewService.getStrategyHeatReport();
    await downloadMarkdown(content);
};

const handleDownloadJson = async () => {
    const data = await ioc.heatViewService.getStrategyHeatData();
    const content = JSON.stringify(data, null, 2);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `heat_${Date.now()}.md`);
};

const handleUpdate = async () => {
    ioc.statusViewService.getStatusInfo.clear();
    reloadSubject.next();
};

export const MainPage = () => {
    const { classes } = useStyles();

    const handleAction = async (action: string) => {
        if (action === "update-now") {
            await handleUpdate();
        }
        if (action === "download-markdown") {
            await handleDownloadMarkdown();
        }
        if (action === "download-pdf") {
            await handleDownloadPdf();
        }
        if (action === "download-json") {
            await handleDownloadJson();
        }
    };

    return (
        <Container>
            <Breadcrumbs2
                items={options}
                actions={actions}
                onAction={handleAction}
            />
            <Async Loader={StatusLoader} reloadSubject={reloadSubject}>
                {async () => {
                    const statusInfo = await ioc.statusViewService.getStatusInfo();
                    if (!statusInfo) {
                        return null;
                    }
                    return <StatusInfo data={statusInfo} />
                }}
            </Async>
            <One
                className={classes.root}
                fields={fields}
                payload={() => ({
                    history,
                })}
            />
            <Box paddingBottom="24px" />
        </Container>
    );
};

export default MainPage;
