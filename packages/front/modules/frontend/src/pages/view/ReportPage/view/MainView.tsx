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
    Typography,
} from "@mui/material";
import {
    Breadcrumbs2,
    Breadcrumbs2Type,
    Center,
    FieldType,
    IBreadcrumbs2Option,
    One,
    TypedField,
    typo,
    openBlank,
    useAsyncValue,
    useReloadTrigger,
    IBreadcrumbs2Action,
} from "react-declarative";
import { makeStyles } from "../../../../styles";
import { KeyboardArrowLeft, Refresh } from "@mui/icons-material";
import ioc from "../../../../lib";
import IconPhoto from "../../../../components/common/IconPhoto";
import IconWrapper from "../../../../components/common/IconWrapper";
import useMarkdownReportView from "../../../../hooks/useMarkdownReportView";

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
    symbol: string;
    color: string;
    id: string;
    type: "backtest" | "live";
}

function isLightColor(hex: string) {
    const contrastWithBlack = getContrastRatio(hex, "#000000");
    const contrastWithWhite = getContrastRatio(hex, "#FFFFFF");
    return contrastWithBlack > contrastWithWhite;
}

const options: IBreadcrumbs2Option[] = [
    {
        type: Breadcrumbs2Type.Link,
        action: "back-action",
        label: <KeyboardArrowLeft sx={{ display: "block" }} />,
    },
    {
        type: Breadcrumbs2Type.Link,
        action: "back-action",
        label: "Main",
    },
    {
        type: Breadcrumbs2Type.Link,
        action: "back-action",
        label: "Markdown",
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
    id: string,
    type: "backtest" | "live",
    symbol: string,
    label: React.ReactNode,
    color: string,
): TypedField => ({
    type: FieldType.Component,
    desktopColumns: "6",
    tabletColumns: "6",
    phoneColumns: "12",
    fieldRightMargin: "1",
    fieldBottomMargin: "1",
    element: ({ payload }) => (
        <Button
            component={ButtonBase}
            onClick={() => {
                payload.handleOpen(id, type);
            }}
            sx={{
                width: "100%",
                background: color,
                color: "white",
                fontWeight: "bold",
                fontSize: "14px",
                height: "75px",
                minHeight: "75px",
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
            startIcon={<IconPhoto className={ICON_ROOT} symbol={symbol} />}
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
    tabletColumns: "12",
    desktopColumns: "3",
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
                        size="small"
                        color="info"
                        label={`${typo.bullet} ${label}`}
                        sx={{
                            mb: 1,
                            pr: 0.5,
                            fontSize: "14px",
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
            fields: routes.map(({ symbol, label, id, type, color }) =>
                createButton(id, type, symbol, label, color),
            ),
        },
    ],
});

const createFields = async (): Promise<TypedField[]> => {
    const [symbolMap, backtestList, liveList] = await Promise.all([
        ioc.symbolGlobalService.getSymbolMap(),
        ioc.backtestGlobalService.list(),
        ioc.liveGlobalService.list(),
    ]);

    const backtestGroups: Record<string, IRoute[]> = {};
    const liveGroups: Record<string, IRoute[]> = {};

    backtestList.forEach((item) => {
        const symbolData = symbolMap[item.symbol];
        const strategy = item.strategyName;
        if (!backtestGroups[strategy]) {
            backtestGroups[strategy] = [];
        }
        backtestGroups[strategy].push({
            symbol: item.symbol,
            label: symbolData?.displayName || item.symbol,
            color: symbolData?.color || "#ccc",
            type: "backtest",
            id: item.id,
        });
    });

    liveList.forEach((item) => {
        const symbolData = symbolMap[item.symbol];
        const strategy = item.strategyName;
        if (!liveGroups[strategy]) {
            liveGroups[strategy] = [];
        }
        liveGroups[strategy].push({
            symbol: item.symbol,
            label: symbolData?.displayName || item.symbol,
            color: symbolData?.color || "#ccc",
            id: item.id,
            type: "live",
        });
    });

    const backtestFields = Object.entries(backtestGroups)
        .sort(([, a], [, b]) => b.length - a.length)
        .map(([strategy, routes]) => createGroup(strategy, routes));

    const liveFields = Object.entries(liveGroups)
        .sort(([, a], [, b]) => b.length - a.length)
        .map(([strategy, routes]) => createGroup(strategy, routes));

    if (!liveFields.length && !backtestFields.length) {
        return [];
    }

    return [
        {
            type: FieldType.Fragment,
            isVisible: () => !!backtestFields.length,
            fields: [
                {
                    type: FieldType.Line,
                    title: "Backtest",
                },
                {
                    type: FieldType.Group,
                    columns: "12",
                    fields: backtestFields,
                },
            ],
        },
        {
            type: FieldType.Fragment,
            isVisible: () => !!liveFields.length,
            fields: [
                {
                    type: FieldType.Line,
                    title: "Live",
                },
                {
                    type: FieldType.Group,
                    columns: "12",
                    fields: liveFields,
                },
            ],
        },
    ];
};

export const MainView = () => {
    const { classes } = useStyles();

    const { reloadTrigger, doReload } = useReloadTrigger();

    const [fields, { loading }] = useAsyncValue(
        async () => {
            return await createFields();
        },
        {
            onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
            onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
            deps: [reloadTrigger],
        },
    );

    const handleAction = (action: string) => {
        if (action === "back-action") {
            ioc.routerService.push("/");
        }
        if (action === "update-now") {
            doReload();
        }
    };

    const openMarkdownReport = useMarkdownReportView();

    const handleOpen = (id: string, type: "backtest" | "live") => {
        openMarkdownReport(id, type);
    };

    const renderInner = () => {
        if (loading || !fields) {
            return (
                <Center>
                    <Typography variant="h6" sx={{ opacity: 0.5 }}>
                        Loading...
                    </Typography>
                </Center>
            );
        }

        if (!fields.length) {
            return (
                <Center>
                    <Typography variant="h6" sx={{ opacity: 0.5 }}>
                        No pending signals
                    </Typography>
                </Center>
            );
        }

        return (
            <>
                <One
                    key={reloadTrigger}
                    className={classes.root}
                    fields={fields}
                    payload={() => ({
                        handleOpen,
                    })}
                />
                <Box paddingBottom="24px" />
            </>
        );
    };

    return (
        <Container>
            <Breadcrumbs2
                items={options}
                actions={actions}
                onAction={handleAction}
            />
            {renderInner()}
        </Container>
    );
};

export default MainView;
