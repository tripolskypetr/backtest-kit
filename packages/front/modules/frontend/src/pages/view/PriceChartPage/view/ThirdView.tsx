import { Download, KeyboardArrowLeft, Refresh } from "@mui/icons-material";
import { Container } from "@mui/material";
import {
    Breadcrumbs2,
    Breadcrumbs2Type,
    IBreadcrumbs2Action,
    IBreadcrumbs2Option,
    IOutletProps,
    Subject,
    useActualCallback,
    useAsyncValue,
    useOnce,
    useSingleton,
} from "react-declarative";
import ioc from "../../../../lib";
import IconWrapper from "../../../../components/common/IconWrapper";
import PriceChartWidget from "../components/PriceChartWidget";
import { useMemo } from "react";

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

export const ThirdView = ({ params }: IOutletProps) => {
    const payload = useSingleton(() => ({
        symbol: String(params.symbol).toUpperCase(),
        interval: params.interval,
    }));

    const [pendingSignal, { loading, execute }] = useAsyncValue(async () => {
        const symbol = String(params.symbol).toUpperCase();
        return await ioc.signalViewService.getPendingSignal(symbol);
    }, {
        onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
        onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
        deps: [params.symbol],
    })

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

    const handleOpen = useActualCallback(async () => {

    })

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
        )
    }

    return (
        <Container>
            <Breadcrumbs2
                items={options}
                actions={actions}
                payload={payload}
                onAction={handleAction}
            />
            {renderInner()}
        </Container>
    );
};

export default ThirdView;
