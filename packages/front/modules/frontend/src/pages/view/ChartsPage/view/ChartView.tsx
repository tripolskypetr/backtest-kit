import { Box, Container } from "@mui/material";
import {
    Breadcrumbs2,
    Breadcrumbs2Type,
    IBreadcrumbs2Action,
    IBreadcrumbs2Option,
    IOutletProps,
    Subject,
    useOnce,
} from "react-declarative";
import { KeyboardArrowLeft, Refresh } from "@mui/icons-material";
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
        compute: (payload) => String(payload).toUpperCase(),
    },
];

const actions: IBreadcrumbs2Action[] = [
    {
        action: "update-now",
        label: "Refresh",
        icon: () => <IconWrapper icon={Refresh} color="#4caf50" />,
    },
];

const reloadSubject = new Subject<void>();

export const ChartView = ({ params }: IOutletProps) => {
    const symbol = String(params.symbol).toUpperCase();

    const handleAction = async (action: string) => {
        if (action === "back-action") {
            ioc.routerService.push("/price_chart");
        }
        if (action === "update-now") {
            await reloadSubject.next();
        }
    };

    return (
        <Container>
            <Breadcrumbs2
                items={options}
                actions={actions}
                payload={symbol}
                onAction={handleAction}
            />
            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    pb: 3,
                }}
            >
                <PriceChartWidget
                    symbol={symbol}
                    interval="1m"
                    reloadSubject={reloadSubject}
                    sx={{ height: "calc(33dvh - 40px)", minHeight: "250px" }}
                />
                <PriceChartWidget
                    symbol={symbol}
                    interval="15m"
                    reloadSubject={reloadSubject}
                    sx={{ height: "calc(33dvh - 40px)", minHeight: "250px" }}
                />
                <PriceChartWidget
                    symbol={symbol}
                    interval="1h"
                    reloadSubject={reloadSubject}
                    sx={{ height: "calc(33dvh - 40px)", minHeight: "250px" }}
                />
            </Box>
        </Container>
    );
};

export default ChartView;
