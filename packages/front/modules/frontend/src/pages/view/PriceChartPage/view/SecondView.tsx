import {
    Box,
    Button,
    ButtonBase,
    Chip,
    Container,
    darken,
    getContrastRatio,
    lighten,
    Stack,
} from "@mui/material";
import {
    Breadcrumbs2,
    Breadcrumbs2Type,
    FieldType,
    IBreadcrumbs2Option,
    IOutletProps,
    One,
    TypedField,
    typo,
} from "react-declarative";
import { makeStyles } from "../../../../styles";
import {
    KeyboardArrowLeft,
    Looks3TwoTone,
    LooksOneTwoTone,
    LooksTwoTwoTone,
} from "@mui/icons-material";
import { useMemo } from "react";
import ioc from "../../../../lib";

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
        label: "Price Chart",
    },
    {
        type: Breadcrumbs2Type.Link,
        action: "back-action",
        compute: (symbol) => String(symbol).toUpperCase(),
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
    sx: { p: 2 },
    desktopColumns: "6",
    tabletColumns: "6",
    phoneColumns: "12",
    fields: [
        {
            type: FieldType.Component,
            className: GROUP_HEADER,
            style: { transition: "opacity 500ms", opacity: 0.5 },
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

export const SecondView = ({ params }: IOutletProps) => {
    const { classes } = useStyles();
    const symbol = params.symbol;

    const candle_routes = useMemo(
        (): IRoute[] => [
            {
                label: "1 minute",
                to: `/price_chart/${symbol}/1m`,
                color: "#2979ff",
                icon: LooksOneTwoTone,
            },
            {
                label: "15 minutes",
                to: `/price_chart/${symbol}/15m`,
                color: "#f3a43a",
                icon: LooksTwoTwoTone,
            },
            {
                label: "1 hour",
                to: `/price_chart/${symbol}/1h`,
                color: "#d500f9",
                icon: Looks3TwoTone,
            },
        ],
        [symbol],
    );

    const fields = useMemo(
        (): TypedField[] => [createGroup("Chart", candle_routes)],
        [candle_routes],
    );

    const handleAction = (action: string) => {
        if (action === "back-action") {
            ioc.routerService.push("/price_chart");
        }
    };

    return (
        <Container>
            <Breadcrumbs2
                items={options}
                payload={symbol}
                onAction={handleAction}
            />
            <One className={classes.root} fields={fields} />
            <Box paddingBottom="24px" />
        </Container>
    );
};

export default SecondView;
