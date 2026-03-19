import {
    Close,
    Download,
    KeyboardArrowLeft,
    Refresh,
} from "@mui/icons-material";
import { Button, Container, IconButton, Stack } from "@mui/material";
import {
    ActionButton,
    Breadcrumbs2,
    Breadcrumbs2Type,
    FieldType,
    formatAmount,
    IBreadcrumbs2Action,
    IBreadcrumbs2Option,
    IOutletProps,
    Subject,
    TypedField,
    useActionModal,
    useActualCallback,
    useActualRef,
    useAsyncValue,
    useOnce,
    useSingleton,
} from "react-declarative";
import ioc from "../../../../lib";
import IconWrapper from "../../../../components/common/IconWrapper";
import PriceChartWidget from "../components/PriceChartWidget";
import { useMemo } from "react";
import { IPublicSignalRow } from "backtest-kit";

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
        compute: ({ symbol }) => String(symbol).toUpperCase(),
    },
    {
        type: Breadcrumbs2Type.Link,
        action: "back-action",
        compute: ({ interval }) => String(interval).toUpperCase(),
    },
];

const actions: IBreadcrumbs2Action[] = [
    {
        action: "download-now",
        label: "Download",
        icon: () => <IconWrapper icon={Download} color="#4caf50" />,
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

const reloadSubject = new Subject<void>();

const downloadSubject = new Subject<void>();

const signal_fields: TypedField[] = [
    {
        type: FieldType.Text,
        outlined: false,
        desktopColumns: "12",
        tabletColumns: "12",
        phoneColumns: "12",
        name: "symbol",
        title: "Symbol",
        readonly: true,
        compute: (obj) => obj.symbol || "N/A",
    },
    {
        type: FieldType.Text,
        outlined: false,
        desktopColumns: "12",
        tabletColumns: "12",
        phoneColumns: "12",
        name: "position",
        title: "Position",
        readonly: true,
        compute: (obj) =>
            obj.position === "long"
                ? "🔵 LONG (profit on rise)"
                : "🟠 SHORT (profit on fall)",
    },
    {
        type: FieldType.Text,
        outlined: false,
        desktopColumns: "12",
        tabletColumns: "12",
        phoneColumns: "12",
        name: "priceOpen",
        title: "Entry",
        readonly: true,
        compute: (obj) =>
            obj.priceOpen ? `${formatAmount(obj.priceOpen)}$` : "N/A",
    },
    {
        type: FieldType.Text,
        outlined: false,
        desktopColumns: "12",
        tabletColumns: "12",
        phoneColumns: "12",
        name: "originalPriceOpen",
        title: "Original Entry",
        readonly: true,
        isVisible: (obj) =>
            obj.originalPriceOpen != null &&
            obj.originalPriceOpen !== obj.priceOpen,
        compute: (obj) =>
            obj.originalPriceOpen
                ? `${formatAmount(obj.originalPriceOpen)}$`
                : "N/A",
    },
    {
        type: FieldType.Text,
        outlined: false,
        desktopColumns: "12",
        tabletColumns: "12",
        phoneColumns: "12",
        name: "priceTakeProfit",
        title: "Take Profit",
        readonly: true,
        compute: (obj) =>
            obj.priceTakeProfit
                ? `${formatAmount(obj.priceTakeProfit)}$`
                : "N/A",
    },
    {
        type: FieldType.Text,
        outlined: false,
        desktopColumns: "12",
        tabletColumns: "12",
        phoneColumns: "12",
        name: "originalPriceTakeProfit",
        title: "Original Take Profit",
        readonly: true,
        isVisible: (obj) =>
            obj.originalPriceTakeProfit != null &&
            obj.originalPriceTakeProfit !== obj.priceTakeProfit,
        compute: (obj) =>
            obj.originalPriceTakeProfit
                ? `${formatAmount(obj.originalPriceTakeProfit)}$`
                : "N/A",
    },
    {
        type: FieldType.Text,
        outlined: false,
        desktopColumns: "12",
        tabletColumns: "12",
        phoneColumns: "12",
        name: "priceStopLoss",
        title: "Stop Loss",
        readonly: true,
        compute: (obj) =>
            obj.priceStopLoss ? `${formatAmount(obj.priceStopLoss)}$` : "N/A",
    },
    {
        type: FieldType.Text,
        outlined: false,
        desktopColumns: "12",
        tabletColumns: "12",
        phoneColumns: "12",
        name: "originalPriceStopLoss",
        title: "Original Stop Loss",
        readonly: true,
        isVisible: (obj) =>
            obj.originalPriceStopLoss != null &&
            obj.originalPriceStopLoss !== obj.priceStopLoss,
        compute: (obj) =>
            obj.originalPriceStopLoss
                ? `${formatAmount(obj.originalPriceStopLoss)}$`
                : "N/A",
    },
    {
        type: FieldType.Text,
        outlined: false,
        desktopColumns: "12",
        tabletColumns: "12",
        phoneColumns: "12",
        name: "totalEntries",
        title: "Total Entries",
        readonly: true,
        isVisible: (obj) => obj.totalEntries != null && obj.totalEntries > 1,
        compute: (obj) => String(obj.totalEntries),
    },
    {
        type: FieldType.Text,
        outlined: false,
        desktopColumns: "12",
        tabletColumns: "12",
        phoneColumns: "12",
        name: "totalPartials",
        title: "Total Closes",
        readonly: true,
        isVisible: (obj) => obj.totalPartials != null && obj.totalPartials > 0,
        compute: (obj) => String(obj.totalPartials),
    },
    {
        type: FieldType.Component,
        sx: { mt: 2 },
        element: ({ payload }) => (
            <Button variant="outlined" onClick={payload.handleClose}>
                Back
            </Button>
        ),
    },
];

export const ThirdView = ({ params }: IOutletProps) => {
    const payload = useSingleton(() => ({
        symbol: String(params.symbol).toUpperCase(),
        interval: params.interval,
    }));

    const [pendingSignal, { loading, execute }] = useAsyncValue(
        async () => {
            const symbol = String(params.symbol).toUpperCase();
            return await ioc.signalViewService.getPendingSignal(symbol);
        },
        {
            onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
            onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
            deps: [params.symbol],
        },
    );

    useOnce(() => reloadSubject.subscribe(execute));

    const handleAction = async (action: string) => {
        if (action === "back-action") {
            ioc.routerService.push(`/price_chart/${params.symbol}`);
        }
        if (action === "update-now") {
            await reloadSubject.next();
        }
        if (action === "download-now") {
            await downloadSubject.next();
        }
    };

    const priceTakeProfit = useMemo(() => {
        if (pendingSignal) {
            return pendingSignal.priceTakeProfit;
        }
        return 0;
    }, [pendingSignal]);

    const priceStopLoss = useMemo(() => {
        if (pendingSignal) {
            return pendingSignal.priceStopLoss;
        }
        return 0;
    }, [pendingSignal]);

    const priceOpen = useMemo(() => {
        if (pendingSignal) {
            return pendingSignal.priceOpen;
        }
        return 0;
    }, [pendingSignal]);

    const position = useMemo(() => {
        if (pendingSignal) {
            return pendingSignal.position;
        }
        return null;
    }, [pendingSignal]);

    const [pendingSignal$, setPendingSignal$] =
        useActualRef<IPublicSignalRow | null>(null);

    const { pickData, setOpen, render } = useActionModal({
        title: "Info",
        AfterTitle: ({ onClose }) => (
            <Stack direction="row" gap={2}>
                <ActionButton
                    onClick={() =>
                        ioc.layoutService.pickSignal(pendingSignal$.current!.id)
                    }
                    variant="outlined"
                >
                    Show Details
                </ActionButton>
                <IconButton size="small" onClick={onClose}>
                    <Close />
                </IconButton>
            </Stack>
        ),
        payload: () => ({
            handleClose() {
                setOpen(false);
            },
        }),
        fields: signal_fields,
        handler: () => pendingSignal$.current,
        withActionButton: false,
    });

    const handleOpen = useActualCallback(async () => {
        if (!pendingSignal) {
            return;
        }
        setPendingSignal$(pendingSignal);
        pickData(pendingSignal.id);
    });

    const renderInner = () => {
        if (loading) {
            return null;
        }
        return (
            <PriceChartWidget
                symbol={payload.symbol}
                interval={payload.interval}
                disableInfo={!pendingSignal}
                reloadSubject={reloadSubject}
                downloadSubject={downloadSubject}
                onInfoClick={handleOpen}
                position={position}
                priceOpen={priceOpen}
                priceStopLoss={priceStopLoss}
                priceTakeProfit={priceTakeProfit}
                sx={{ height: "calc(100dvh - 165px)" }}
            />
        );
    };

    return (
        <Container>
            <Breadcrumbs2
                items={options}
                actions={actions}
                payload={payload}
                onAction={handleAction}
            />
            {renderInner()}
            {render()}
        </Container>
    );
};

export default ThirdView;
