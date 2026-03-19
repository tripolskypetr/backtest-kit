import { Download, KeyboardArrowLeft, Refresh } from "@mui/icons-material";
import { Container } from "@mui/material";
import {
    Breadcrumbs2,
    Breadcrumbs2Type,
    IBreadcrumbs2Action,
    IBreadcrumbs2Option,
    IOutletProps,
    Subject,
    useSingleton,
} from "react-declarative";
import ioc from "../../../../lib";
import IconWrapper from "../../../../components/common/IconWrapper";
import PriceChartWidget from "../components/PriceChartWidget";

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

    return (
        <Container>
            <Breadcrumbs2
                items={options}
                actions={actions}
                payload={payload}
                onAction={handleAction}
            />
            <PriceChartWidget
                symbol={payload.symbol}
                interval={payload.interval}
                reloadSubject={reloadSubject}
                downloadSubject={downloadSubject}
                sx={{ height: "calc(100dvh - 100px)" }}
            />
        </Container>
    );
};

export default ThirdView;
