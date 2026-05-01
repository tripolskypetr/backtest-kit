import {
    TypedField,
    FieldType,
    useAsyncValue,
    Breadcrumbs2Type,
    IBreadcrumbs2Option,
    Breadcrumbs2,
    IBreadcrumbs2Action,
    LoaderView,
    One,
    ScrollView,
    useOnce,
} from "react-declarative";

import { Container } from "@mui/material";
import { DataObject, Description, KeyboardArrowLeft, PictureAsPdf, PictureAsPdfOutlined, Refresh } from "@mui/icons-material";
import { IHeatmapRow } from "backtest-kit";
import IconWrapper from "../../../../components/common/IconWrapper";
import { reloadSubject } from "../../../../config/emitters";
import HeatCard from "../components/HeatCard";
import ioc from "../../../../lib";
import downloadMarkdown from "../../../../utils/downloadMarkdown";

const options: IBreadcrumbs2Option[] = [
    {
        type: Breadcrumbs2Type.Link,
        action: "back-action",
        label: <KeyboardArrowLeft sx={{ display: "block" }} />,
    },
    {
        type: Breadcrumbs2Type.Link,
        action: "back-action",
        label: "Dashboard",
    },
    {
        type: Breadcrumbs2Type.Link,
        action: "back-action",
        label: "Heatmap",
    },
    {
        type: Breadcrumbs2Type.Button,
        action: "download-pdf",
        label: "Download PDF",
        icon: PictureAsPdfOutlined,
    },
];

const actions: IBreadcrumbs2Action[] = [
    {
        action: "download-json",
        label: "Download JSON",
        icon: () => <IconWrapper icon={DataObject} color="#4caf50" />,
    },
    {
        action: "download-markdown",
        label: "Download Markdown",
        icon: () => <IconWrapper icon={Description} color="#4caf50" />,
    },
    {
        action: "download-pdf",
        label: "Download PDF",
        icon: () => <IconWrapper icon={PictureAsPdf} color="#4caf50" />,
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

const createFields = (rows: IHeatmapRow[]): TypedField[] => {
    if (!rows.length) {
        return [
            {
                type: FieldType.Typography,
                typoVariant: "h6",
                placeholder: "No data",
                sx: { textAlign: "center", opacity: 0.5, mt: 4 },
            },
        ];
    }

    const fields = rows.map((row): TypedField => ({
        type: FieldType.Group,
        desktopColumns: "4",
        tabletColumns: "6",
        phoneColumns: "12",
        fieldRightMargin: "1",
        fieldBottomMargin: "1",
        child: {
            type: FieldType.Component,
            element: () => <HeatCard row={row} />,
        },
    }));

    if (fields.length > 2) {
        return fields;
    }

    return [
        {
            type: FieldType.Center,
            sx: (theme) => ({
                [theme.breakpoints.up("lg")]: {
                    '@media (min-height: 900px)': {
                        height: "calc(100dvh - 165px)",
                        "& > *": {
                            transform: "translateY(-56px)",
                        }
                    },
                },
            }),
            fields,
        },
    ];
};

const handleDownloadMarkdown = async () => {
    const content = await ioc.heatViewService.getStrategyHeatReport();
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `heat_${Date.now()}.md`);
};

const handleDownloadPdf = async () => {
    const content = await ioc.heatViewService.getStrategyHeatReport();
    await downloadMarkdown(content);
};

const handleDownloadJson = async () => {
    const data = await ioc.heatViewService.getStrategyHeatData();
    const content = JSON.stringify(data, null, 2);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `heat_${Date.now()}.md`);
}

export const MainView = () => {
    const [fields, { loading, execute }] = useAsyncValue(
        async () => {
            const heat = await ioc.heatViewService.getStrategyHeatData();
            return createFields(heat.symbols);
        },
        {
            onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
            onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
        }
    );

    useOnce(() => reloadSubject.subscribe(execute));

    const handleAction = async (action: string) => {
        if (action === "back-action") {
            ioc.routerService.push("/");
        }
        if (action === "update-now") {
            await reloadSubject.next();
        }
        if (action === "download-markdown") {
            await handleDownloadMarkdown();
        }
        if (action === "download-pdf") {
            await handleDownloadPdf();
        }
        if (action === "download-json") {
            await handleDownloadJson();
        }
    };

    const renderInner = () => {
        if (!fields || loading) {
            return <LoaderView sx={{ height: "calc(100dvh - 165px)" }} />;
        }
        return (
            <ScrollView withScrollbar sx={{ height: "calc(100dvh - 165px)" }} hideOverflowX>
                <One fields={fields} />
            </ScrollView>
        );
    };

    return (
        <Container>
            <Breadcrumbs2 items={options} actions={actions} onAction={handleAction} />
            {renderInner()}
        </Container>
    );
};

export default MainView;
