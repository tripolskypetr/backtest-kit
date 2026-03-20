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
import { KeyboardArrowLeft, Refresh } from "@mui/icons-material";
import { IHeatmapRow } from "backtest-kit";
import IconWrapper from "../../../../components/common/IconWrapper";
import { reloadSubject } from "../../../../config/emitters";
import HeatCard from "../components/HeatCard";
import ioc from "../../../../lib";

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
];

const actions: IBreadcrumbs2Action[] = [
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
                    height: "calc(100dvh - 165px)",
                    "& > *": {
                        transform: "translateY(-56px)",
                    }
                },
            }),
            fields,
        },
    ];
};

export const MainView = () => {
    const [fields, { loading, execute }] = useAsyncValue(
        async () => {
            const heat = await ioc.heatViewService.getStrategyHeat();
            return createFields(heat.symbols);
        },
        {
            onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
            onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
        }
    );

    useOnce(() => reloadSubject.subscribe(execute));

    const handleAction = (action: string) => {
        if (action === "back-action") {
            ioc.routerService.push("/");
        }
        if (action === "update-now") {
            reloadSubject.next();
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
