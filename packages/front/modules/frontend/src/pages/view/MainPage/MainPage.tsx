import {
    Box,
    Breadcrumbs,
    Button,
    ButtonBase,
    Chip,
    Container,
    darken,
    Divider,
    getContrastRatio,
    IconButton,
    lighten,
    Link,
    Paper,
    Stack,
    Typography,
} from "@mui/material";
import {
    Async,
    Breadcrumbs2,
    Breadcrumbs2Type,
    Center,
    dayjs,
    FieldType,
    formatAmount,
    IBreadcrumbs2Action,
    IBreadcrumbs2Option,
    IOutletProps,
    LoaderView,
    One,
    sleep,
    trycatch,
    TypedField,
    typo,
    useReloadTrigger,
    useSubject,
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
    Replay,
    CloudSync,
} from "@mui/icons-material";
import { useMemo } from "react";
import ioc from "../../../lib";
import IconWrapper from "../../../components/common/IconWrapper";
import { reloadSubject } from "../../../config/emitters";
import StatusInfo from "../../../components/StatusInfo";
import downloadMarkdown from "../../../utils/downloadMarkdown";
import str from "../../../utils/str";
import getPriceScale from "../../../utils/getPriceScale";
import Tooltip from "../../../components/common/Tooltip";
import NavigationView from "./components/NavigationView";
import { t } from "../../../i18n";

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
    type: Breadcrumbs2Type.Component,
    element: NavigationView,
  },
];

const actions: IBreadcrumbs2Action[] = [
    {
        action: "download-json",
        label: t("Download Heatmap JSON"),
        icon: () => <IconWrapper icon={DataObject} color="#4caf50" />,
    },
    {
        action: "download-markdown",
        label: t("Download Heatmap Markdown"),
        icon: () => <IconWrapper icon={Description} color="#4caf50" />,
    },
    {
        action: "download-pdf",
        label: t("Download Heatmap PDF"),
        icon: () => <IconWrapper icon={PictureAsPdf} color="#4caf50" />,
    },
    {
        divider: true,
    },
    {
        action: "update-now",
        label: t("Refresh"),
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
        label: t("Portfolio Overview"),
        description: str.newline(
            t("Closed trading signals grouped by symbol for Backtest and Live modes"),
            t("Each card shows position type, entry price, TP/SL levels, PNL amount and percent"),
            t("Displays DCA entry count and partial close count where applicable"),
            t("Supports JSON export and manual refresh of the signal list"),
        ),
        to: `/overview`,
        color: "#0033AD",
        icon: AccountBalanceWalletTwoTone,
    },
    {
        label: t("PNL Performance"),
        description: str.newline(
            t("KPI dashboard with aggregated trading performance metrics per symbol"),
            t("Shows daily trade counts, success rates, resolved/rejected breakdowns"),
            t("Revenue analytics across today, yesterday, 7-day and 31-day windows"),
            t("Toggle between Backtest and Live modes; supports JSON export"),
        ),
        to: `/dashboard`,
        color: "#E6007A",
        icon: InsertChartTwoTone,
    },
    {
        label: t("System Logs"),
        description: str.newline(
            t("Virtualized feed of runtime log entries with type badges: Debug, Info, Warn, Log"),
            t("Each entry shows topic, timestamp and raw JSON arguments in monospace"),
            t("Filter by keyword or regex via search prompt"),
            t("Supports full log export as JSON file"),
        ),
        to: `/logs`,
        color: "#58BF00",
        icon: TerminalTwoTone,
    },
];

const live_routes: IRoute[] = [
    {
        label: t("Notifications"),
        description: str.newline(
            t("Event feed for all trading signals: opens, closes, schedules, errors"),
            t("Color-coded cards with symbol, position, PNL, entry/exit/TP/SL prices"),
            t("Infinite-scroll pagination; click any card to open a detailed modal"),
            t("Supports manual refresh to pull the latest activity"),
        ),
        to: `/notifications`,
        color: "#F7931A",
        icon: CircleNotificationsTwoTone,
    },
    {
        label: t("Pending Status"),
        description: str.newline(
            t("Live view of active trading signals grouped by strategy"),
            t("Grid of strategy buttons; click to inspect individual signal state"),
            t("Detail view shows entry, exit, effective price, DCA and partial counts"),
            t("Supports per-signal JSON export and manual refresh"),
        ),
        to: `/status`,
        color: "#6F42C1",
        icon: PlayCircleFilledWhiteTwoTone,
    },
    {
        label: t("Dump Explorer"),
        description: str.newline(
            t("Tree-structured file browser for backtest output and artifact files"),
            t("Icons indicate file type: image, JSON, plain text or generic"),
            t("Click any file to open a full-screen preview modal"),
            t("Supports keyword search and manual refresh of the file tree"),
        ),
        to: `/dump`,
        color: "#0090FF",
        icon: FilePresentTwoTone,
    },
];

const other_routes: IRoute[] = [
    {
        label: t("Markdown Reports"),
        description: str.newline(
            t("Strategy performance reports rendered from markdown for Backtest and Live runs"),
            t("Grid of strategy buttons grouped by type and sorted by signal volume"),
            t("Download reports as markdown, PDF or raw JSON"),
            t("Supports manual refresh to regenerate report content"),
        ),
        to: `/report`,
        color: "#009688",
        icon: AdfScannerTwoTone,
    },
    {
        label: t("Price Charts"),
        description: str.newline(
            t("Interactive candlestick charts powered by TradingView Lightweight Charts"),
            t("Navigate by symbol then interval (1m, 15m, 1h) to view price history"),
            t("Overlays active signal lines: entry, take profit (green) and stop loss (red)"),
            t("Supports chart image export and signal detail inspection"),
        ),
        to: `/price_chart`,
        color: "#1565C0",
        icon: CandlestickChartTwoTone,
    },
    {
        label: t("Heatmap"),
        description: str.newline(
            t("Color-coded performance heatmap across all tracked symbols"),
            t("Cells show win rate, profit factor, Sharpe ratio and other key metrics"),
            t("Download heatmap as JSON, markdown report or PDF"),
            t("Supports manual refresh to recalculate aggregated statistics"),
        ),
        to: `/heat`,
        color: "#8D6E63",
        icon: LeaderboardTwoTone,
    },
];

const fields: TypedField[] = [
    createGroup(t("Application"), application_routes),
    createGroup(t("Live"), live_routes),
    createGroup(t("Other"), other_routes),
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
    ioc.layoutService.downloadFile(url, `heat_${Date.now()}.json`);
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
