import {
    Breadcrumbs2,
    Breadcrumbs2Type,
    IBreadcrumbs2Action,
    IBreadcrumbs2Option,
    LoaderView,
    One,
    useAsyncAction,
    useAsyncValue,
    useOnce,
} from "react-declarative";
import { Container } from "@mui/material";
import { DataObject, KeyboardArrowLeft, Refresh } from "@mui/icons-material";

import {
    clearBudgetCache,
    fetchBalanceMeasure,
    fetchBudgetHistory,
} from "../api/api";
import IconWrapper from "../../../../components/common/IconWrapper";
import { reloadSubject } from "../../../../config/emitters";
import balance_fields from "../../../../assets/balance_fields";
import ioc from "../../../../lib";
import { t } from "../../../../i18n";

const options: IBreadcrumbs2Option[] = [
    {
        type: Breadcrumbs2Type.Link,
        action: "back-action",
        label: <KeyboardArrowLeft sx={{ display: "block" }} />,
    },
    {
        type: Breadcrumbs2Type.Link,
        action: "back-action",
        label: t("Dashboard"),
    },
    {
        type: Breadcrumbs2Type.Link,
        action: "heat-action",
        label: t("Heatmap"),
    },
    {
        type: Breadcrumbs2Type.Link,
        action: "heat-action",
        compute: (payload) =>
            `${t("Balance")} ${String(payload).toUpperCase()}`,
    },
    {
        type: Breadcrumbs2Type.Button,
        icon: Refresh,
        action: "update-now",
        label: t("Refresh"),
    },
];

const actions: IBreadcrumbs2Action[] = [
    {
        action: "download-json",
        label: t("Download JSON"),
        icon: () => <IconWrapper icon={DataObject} color="#4caf50" />,
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

export const BalanceView = () => {
    const [data, { loading, execute }] = useAsyncValue(
        async () => await fetchBalanceMeasure(),
        {
            onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
            onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
        },
    );

    const { execute: handleDownload } = useAsyncAction(
        async () => {
            const history = await fetchBudgetHistory();
            const blob = new Blob([JSON.stringify(history, null, 2)], {
                type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            ioc.layoutService.downloadFile(
                url,
                `budget_${data?.mode ?? "unknown"}_${Date.now()}.json`,
            );
        },
        {
            onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
            onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
        },
    );

    useOnce(() => reloadSubject.subscribe(execute));

    const handleAction = async (action: string) => {
        if (action === "back-action") {
            ioc.routerService.push("/");
        }
        if (action === "heat-action") {
            ioc.routerService.replace("/heat");
        }
        if (action === "update-now") {
            clearBudgetCache();
            await reloadSubject.next();
        }
        if (action === "download-json") {
            await handleDownload();
        }
    };

    const renderInner = () => {
        if (!data || loading) {
            return <LoaderView sx={{ height: "calc(100dvh - 165px)" }} />;
        }
        return (
            <One
                handler={data}
                payload={() => ({
                    handleUpdate() {
                        reloadSubject.next();
                    },
                    mode: data.mode,
                })}
                fields={balance_fields}
            />
        );
    };

    return (
        <Container>
            <Breadcrumbs2
                items={options}
                actions={actions}
                payload={data?.mode ?? ""}
                onAction={handleAction}
            />
            {renderInner()}
        </Container>
    );
};

export default BalanceView;
