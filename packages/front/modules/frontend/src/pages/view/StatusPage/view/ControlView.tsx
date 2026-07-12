import { Breadcrumbs2, Breadcrumbs2Type, IBreadcrumbs2Action, IBreadcrumbs2Option, IOutletProps, RecordView, useActualCallback, useActualValue, useAsyncValue, useOnce } from "react-declarative";
import IconWrapper from "../../../../components/common/IconWrapper";
import { Download, KeyboardArrowLeft, Refresh } from "@mui/icons-material";
import { get } from "lodash";
import ioc from "../../../../lib";
import { Box, Container, Paper } from "@mui/material";
import { reloadSubject } from "../../../../config/emitters";
import { Background } from "../../../../components/common/Background";
import OperationLabel from "../components/OperationLabel";
import useOpenPendingModal from "../hooks/useOpenPendingModal";
import useAverageBuyModal from "../hooks/useAverageBuyModal";
import useClosePendingModal from "../hooks/useClosePendingModal";
import useBreakevenModal from "../hooks/useBreakevenModal";
import {
    commitAverageBuyEmitter,
    commitBreakevenEmitter,
    commitClosePendingEmitter,
    commitOpenPendingEmitter,
} from "../config/emitters";
import { t } from "../../../../i18n";

const getLabel = (key: string) => {
  if (key === "pnl") {
    return t("P&L");
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
        label: t("Main"),
    },
    {
        type: Breadcrumbs2Type.Link,
        action: "back-action",
        label: t("Status"),
    },
    {
        type: Breadcrumbs2Type.Link,
        action: "back-action",
        compute: (payload) => payload ? `${String(payload.symbol).toUpperCase()} (${payload.strategyName})` : t("Live"),
    },
    {
        type: Breadcrumbs2Type.Link,
        action: "back-action",
        label: t("Manual Control"),
    },
    {
        type: Breadcrumbs2Type.Button,
        action: "update-now",
        label: t("Refresh"),
        icon: Refresh,
    },
];

const actions: IBreadcrumbs2Action[] = [
    {
        action: "download-action",
        label: t("Download"),
        icon: () => <IconWrapper icon={Download} color="#4caf50" />,
    },
    {
        divider: true,
    },
    {
        action: "update-now",
        label: t("Refresh"),
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

    const payload$ = useActualValue(payload);

    const {
        pickData: handleOpenPending,
        render: renderOpenPending
    } = useOpenPendingModal({
        payload: {
            getContext: () => payload$.current!,
            reloadSubject,
        }
    });

    const {
        pickData: handleAverageBuy,
        render: renderAverageBuy
    } = useAverageBuyModal({
        payload: {
            getContext: () => payload$.current!,
            reloadSubject,
        }
    });

    const {
        pickData: handleClosePending,
        render: renderClosePending
    } = useClosePendingModal({
        payload: {
            getContext: () => payload$.current!,
            reloadSubject,
        }
    });

    const {
        pickData: handleBreakeven,
        render: renderBreakeven
    } = useBreakevenModal({
        payload: {
            getContext: () => payload$.current!,
            reloadSubject,
        }
    });

    useOnce(() => reloadSubject.subscribe(execute));

    useOnce(() => commitOpenPendingEmitter.subscribe(handleOpenPending));
    useOnce(() => commitAverageBuyEmitter.subscribe(handleAverageBuy));
    useOnce(() => commitClosePendingEmitter.subscribe(handleClosePending));
    useOnce(() => commitBreakevenEmitter.subscribe(handleBreakeven));

    const handleDownload = useActualCallback(async () => {
        if (!data) {
            return;
        }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        ioc.layoutService.downloadFile(url, `manual_control_${Date.now()}.json`);
    })


    const handleAction = async (action: string) => {
        if (action === "back-action") {
            ioc.routerService.push(`/status/${params.id}`);
        }
        if (action === "download-action") {
            handleDownload();
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
                withExpandAll
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
            {renderOpenPending()}
            {renderAverageBuy()}
            {renderClosePending()}
            {renderBreakeven()}
        </Container>
    );

}

export default ControlView;
