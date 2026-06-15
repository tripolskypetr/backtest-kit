import { Breadcrumbs2, Breadcrumbs2Type, IBreadcrumbs2Action, IBreadcrumbs2Option, IOutletProps, RecordView, useAsyncValue, useOnce } from "react-declarative";
import IconWrapper from "../../../../components/common/IconWrapper";
import { Download, KeyboardArrowLeft, Refresh } from "@mui/icons-material";
import { get } from "lodash";
import ioc from "../../../../lib";
import { Box, Container, Paper } from "@mui/material";
import { reloadSubject } from "../../../../config/emitters";
import { Background } from "../../../../components/common/Background";
import OperationLabel from "../components/OperationLabel";

const getLabel = (key: string) => {
  if (key === "pnl") {
    return "P&L";
  }
  return key;
};

type Payload = {
    symbol: string;
    strategyName: string;
    exchangeName: string;
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
        label: "Status",
    },
    {
        type: Breadcrumbs2Type.Link,
        action: "back-action",
        compute: (payload) => payload ? `${String(payload.symbol).toUpperCase()} (${payload.strategyName})` : "Live",
    },
    {
        type: Breadcrumbs2Type.Link,
        action: "back-action",
        label: "Control",
    },
];

const actions: IBreadcrumbs2Action[] = [
    {
        action: "download-action",
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


export const ControlView = ({ params }: IOutletProps) => {

    const [payload] = useAsyncValue(
        async () => {
            const statusMap = await ioc.statusViewService.getStatusMap();
            return get(statusMap, params.id, null) as unknown as Payload;
        },
        {
            onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
            onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
            deps: [params.id],
        },
    )

    const [data, { loading, execute }] = useAsyncValue(
        async () => {
            if (!payload) {
                return null;
            }
            return await ioc.controlViewService.getStrategyStatus(
                payload.symbol,
                {
                    strategyName: payload.strategyName,
                    exchangeName: payload.exchangeName,
                }
            );
        }, 
        {
            onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
            onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
            deps: [payload],
        }
    )

    useOnce(reloadSubject.subscribe(execute));

    const handleAction = async (action: string) => {
        if (action === "back-action") {
            ioc.routerService.push(`/status/${params.id}`);
        }
        if (action === "update-now") {
            await reloadSubject.next();
        }
    }

    const renderInner = () => {
        if (!data) {
            return null;
        }
        if (loading) {
            return null;
        }
        return (
            <RecordView
                component={Paper}
                sx={{ p: 1, minHeight: "calc(100dvh - 175px)" }}
                payload={payload}
                formatSearch={getLabel}
                AfterSearch={OperationLabel}
                data={data}
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
            <Box sx={{ paddingBottom: "24px" }} />
            <Background />
        </Container>
    );

}

export default ControlView;
