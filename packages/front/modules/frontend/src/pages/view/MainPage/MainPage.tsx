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
} from "@mui/icons-material";
import { useMemo } from "react";
import ioc from "../../../lib";
import IconWrapper from "../../../components/common/IconWrapper";
import { reloadSubject } from "../../../config/emitters";
import StatusInfo from "../../../components/StatusInfo";

const GROUP_HEADER = "trade-gpt__groupHeader";
const GROUP_ROOT = "trade-gpt__groupRoot";

const ICON_ROOT = "trade-gpt__symbolImage";

const useStyles = makeStyles()({
    root: {
        [`& .${GROUP_ROOT}:hover .${GROUP_HEADER}`]: {
            opacity: "1 !important",
        },
    },
});

interface IRoute {
    label: string;
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
        action: "update-now",
        label: "Refresh",
        icon: () => <IconWrapper icon={Refresh} color="#4caf50" />,
    },
];

const createButton = (
    to: string,
    label: React.ReactNode,
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
            fields: routes.map(({ label, to, color, icon }) =>
                createButton(to, label, color, icon),
            ),
        },
    ],
});

const application_routes: IRoute[] = [
    {
        label: "Portfolio Overview",
        to: `/overview`,
        color: "#0033AD",
        icon: AccountBalanceWalletTwoTone,
    },
    {
        label: "PNL Performance",
        to: `/dashboard`,
        color: "#E6007A",
        icon: InsertChartTwoTone,
    },
    {
        label: "System Logs",
        to: `/logs`,
        color: "#58BF00",
        icon: TerminalTwoTone,
    },
];

const live_routes: IRoute[] = [
    {
        label: "Notifications",
        to: `/notifications`,
        color: "#F7931A",
        icon: CircleNotificationsTwoTone,
    },
    {
        label: "Pending Status",
        to: `/status`,
        color: "#6F42C1",
        icon: PlayCircleFilledWhiteTwoTone,
    },
    {
        label: "Dump Explorer",
        to: `/dump`,
        color: "#0090FF",
        icon: FilePresentTwoTone,
    },
];

const other_routes: IRoute[] = [
    {
        label: "Markdown Reports",
        to: `/report`,
        color: "#009688",
        icon: AdfScannerTwoTone,
    },
    {
        label: "Price Charts",
        to: `/price_chart`,
        color: "#1565C0",
        icon: CandlestickChartTwoTone,
    },
];

const fields: TypedField[] = [
    createGroup("Application", application_routes),
    createGroup("Live", live_routes),
    createGroup("Other", other_routes),
];

const StatusLoader = () => <LoaderView sx={{ width: "100%", height: "75px" }} />

export const MainPage = () => {
    const { classes } = useStyles();

    const handleAction = async (action: string) => {
        if (action === "notification-action") {
            ioc.routerService.push("/notifications");
        }
        if (action === "status-action") {
            ioc.routerService.push("/status");
        }
        if (action === "update-now") {
            ioc.statusViewService.getStatusInfo.clear();
            reloadSubject.next();
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
