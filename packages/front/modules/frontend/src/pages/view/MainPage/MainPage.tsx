import {
    Box,
    ButtonBase,
    Chip,
    Container,
    lighten,
    Paper,
    Stack,
} from "@mui/material";
import {
    Breadcrumbs2,
    Breadcrumbs2Type,
    Center,
    FieldType,
    IBreadcrumbs2Action,
    IBreadcrumbs2Option,
    IOutletProps,
    One,
    TypedField,
    typo,
} from "react-declarative";
import { makeStyles } from "../../../styles";
import { KeyboardArrowLeft, Quickreply, Refresh } from "@mui/icons-material";
import { useMemo } from "react";
import ioc from "../../../lib";
import IconWrapper from "../../../components/common/IconWrapper";

const GROUP_HEADER = "trade-gpt__groupHeader";
const GROUP_ROOT = "trade-gpt__groupRoot";

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

const createButton = (to: string, label: React.ReactNode): TypedField => ({
    type: FieldType.Component,
    desktopColumns: "6",
    tabletColumns: "12",
    phoneColumns: "12",
    fieldRightMargin: "1",
    fieldBottomMargin: "1",
    element: () => (
        <Paper
            component={ButtonBase}
            onClick={() => {
                ioc.routerService.push(to);
            }}
            sx={{
                width: "100%",
                color: "white",
                fontWeight: "bold",
                fontSize: "18px",
                height: "75px",
                minHeight: "125px",
                textWrap: "wrap",
                padding: "16px",
                "&:hover": {
                    background: (theme) =>
                        lighten(theme.palette.primary.main, 0.23),
                },
                background: (theme) => theme.palette.primary.main,
                transition: "background 500ms",
            }}
        >
            {label}
        </Paper>
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
            fields: routes.map(({ label, to }) => createButton(to, label)),
        },
    ],
});

interface IMainPage {
    symbol: string;
}

export const MainPage = ({ symbol }: IMainPage) => {
    const { classes } = useStyles();

    const candle_routes = useMemo(
        (): IRoute[] => [
            {
                label: "Свечи 1 минута",
                to: `/coin/${symbol}/1m`,
            },
            {
                label: "Свечи 15 минут",
                to: `/coin/${symbol}/15m`,
            },
            {
                label: "Свечи 1 час",
                to: `/coin/${symbol}/1h`,
            },
        ],
        [symbol],
    );

    const fields = useMemo(
        (): TypedField[] => [createGroup("График", candle_routes)],
        [candle_routes],
    );

    const handleAction = async (action: string) => {};

    return (
        <Container>
            <Breadcrumbs2
                items={options}
                actions={actions}
                payload={symbol}
                onAction={handleAction}
            />
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
