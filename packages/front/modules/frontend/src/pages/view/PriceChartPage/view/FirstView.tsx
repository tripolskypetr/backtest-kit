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
    Typography,
} from "@mui/material";
import {
    Breadcrumbs2,
    Breadcrumbs2Type,
    Center,
    FieldType,
    IBreadcrumbs2Action,
    IBreadcrumbs2Option,
    One,
    TypedField,
    typo,
    useAsyncValue,
    useReloadTrigger,
} from "react-declarative";
import { makeStyles } from "../../../../styles";
import { KeyboardArrowLeft, Refresh } from "@mui/icons-material";
import ioc from "../../../../lib";
import IconPhoto from "../../../../components/common/IconPhoto";
import IconWrapper from "../../../../components/common/IconWrapper";

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
    symbol: string;
    label: string;
    color: string;
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
];

const actions: IBreadcrumbs2Action[] = [
    {
        action: "update-now",
        label: "Refresh",
        icon: () => <IconWrapper icon={Refresh} color="#4caf50" />,
    },
];

const createButton = (
    symbol: string,
    label: string,
    color: string,
): TypedField => ({
    type: FieldType.Component,
    desktopColumns: "6",
    tabletColumns: "6",
    phoneColumns: "12",
    fieldRightMargin: "1",
    fieldBottomMargin: "1",
    element: () => (
        <Button
            component={ButtonBase}
            onClick={() => {
                ioc.routerService.push(`/price_chart/${symbol.toLowerCase()}`);
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
      fields: routes.map(({ symbol, label, color }) =>
        createButton(symbol, label, color)
      ),
    },
  ],
});

const createFields = async (): Promise<TypedField[]> => {
    const [symbolList, symbolMap] = await Promise.all([
        ioc.symbolGlobalService.getSymbolList(),
        ioc.symbolGlobalService.getSymbolMap(),
    ]);

    // Группируем символы по priority
    const priorityGroups: Record<number, IRoute[]> = {};

    symbolList.forEach((symbol, idx) => {
        const symbolData = symbolMap[symbol];
        const index = idx + 1;
        const priority = symbolData?.priority || index;

        if (!priorityGroups[priority]) {
            priorityGroups[priority] = [];
        }

        priorityGroups[priority].push({
            symbol,
            label: symbolData?.displayName || symbol,
            color: symbolData?.color || "#ccc",
            to: `/coin/${symbol.toLowerCase()}`,
        });
    });

    const sortedPriorities = Object.entries(priorityGroups)
        .map(([priority, routes]) => ({ priority: parseInt(priority), routes }))
        .sort(
            (
                { priority: a_p, routes: { length: a_l } },
                { priority: b_p, routes: { length: b_l } },
            ) => b_l - a_l || b_p - a_p,
        );

    const tabletLeftColumn: TypedField[] = [];
    const tabletRightColumn: TypedField[] = [];
    const wideColumn: TypedField[] = [];

    sortedPriorities.forEach(({ routes, priority }, idx) => {
        const group = createGroup(`Priority ${priority}`, routes);

        if (idx % 2 === 0) {
            tabletLeftColumn.push(group);
        }

        if (idx % 2 === 1) {
            tabletRightColumn.push(group);
        }

        wideColumn.push(group);
    });

    if (!wideColumn.length) {
        return [];
    }

    const fields: TypedField[] = [
        {
            type: FieldType.Group,
            columns: "6",
            className: "tabletLeftColumn",
            phoneHidden: true,
            desktopHidden: true,
            fields: tabletLeftColumn,
        },
        {
            type: FieldType.Group,
            columns: "6",
            className: "tabletRightColumn",
            phoneHidden: true,
            desktopHidden: true,
            fields: tabletRightColumn,
        },
        {
            type: FieldType.Group,
            columns: "12",
            className: "wideColumn",
            tabletHidden: true,
            fields: wideColumn,
        },
    ];

    return fields;
};

export const FirstView = () => {
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
                        No symbols found
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

export default FirstView;
