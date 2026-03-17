import {
    Article,
    DataObject,
    Folder,
    Image,
    InsertDriveFile,
    KeyboardArrowLeft,
    Refresh,
} from "@mui/icons-material";
import { Box, ButtonBase, Paper, Stack, Typography } from "@mui/material";
import {
    ActionButton,
    Breadcrumbs2,
    Breadcrumbs2Type,
    Center,
    IBreadcrumbs2Action,
    IBreadcrumbs2Option,
    PaperView,
    RECORD_NEVER_VALUE,
    RecordView,
    ScrollView,
    Subject,
    useActualState,
    useActualValue,
    useAsyncValue,
    useOnce,
    useReloadTrigger,
} from "react-declarative";
import { set } from "lodash";
import { useMemo } from "react";
import ioc from "../../../../lib";
import IconWrapper from "../../../../components/common/IconWrapper";
import {
    ExplorerData,
    ExplorerFile,
    ExplorerMap,
    ExplorerNode,
    ExplorerRecord,
} from "../../../../model/Explorer.model";
import { Background } from "../../../../components/common/Background";

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
        label: "Dump Explorer",
    },
];

const actions: IBreadcrumbs2Action[] = [
    {
        action: "update-now",
        label: "Refresh",
        icon: () => <IconWrapper icon={Refresh} color="#4caf50" />,
    },
];

const getFileIcon = (node: ExplorerFile) => {
    if (node.mimeType.startsWith("image/")) {
        return <Image sx={{ color: "#f57c00", fontSize: 20 }} />;
    }
    if (node.mimeType === "application/json") {
        return <DataObject sx={{ color: "#7b1fa2", fontSize: 20 }} />;
    }
    if (node.mimeType.startsWith("text/")) {
        return <Article sx={{ color: "#1976d2", fontSize: 20 }} />;
    }
    return <InsertDriveFile sx={{ color: "#546e7a", fontSize: 20 }} />;
};

const reloadSubject = new Subject<void>();

export const MainView = () => {

    const [search$, setSearch] = useActualState("");

    const [data, { loading, execute }] = useAsyncValue(
        async () => {
            return await ioc.explorerViewService.getFolderTree();
        },
        {
            onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
            onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
        },
    );

    useOnce(() => reloadSubject.subscribe(execute));

    const data$ = useActualValue<ExplorerData>(data!);

    const handleAction = (action: string) => {
        if (action === "back-action") {
            ioc.routerService.push("/");
        }
        if (action === "update-now") {
            ioc.explorerViewService.clear();
            reloadSubject.next();
        }
    };

    const handleOpen = (id: string) => {
        ioc.layoutService.pickDumpContent(id);
    };

    const renderInner = () => {
        if (loading || !data) {
            return (
                <Center>
                    <Typography variant="h6" sx={{ opacity: 0.5 }}>
                        Loading...
                    </Typography>
                </Center>
            );
        }

        return (
            <RecordView
                component={Paper}
                withExpandRoot
                search={search$.current}
                onSearchChanged={(search) => setSearch(search)}
                sx={{
                    background: (theme) => theme.palette.background.default,
                    minHeight: "calc(100vh - 160px)",
                    p: 1,
                }}
                formatSearch={(key) => {
                    const node = data$.current.map[key];
                    if (!node) {
                        return "";
                    }
                    return `${node.label}`;
                }}
                formatKey={(key) => {
                    const node = data$.current.map[key];
                    if (!node) {
                        return null;
                    }
                    return (
                        <Stack direction="row" alignItems="center" gap={1}>
                            {node.type === "directory" && (
                                <Folder
                                    sx={{ color: "#1976d2", fontSize: 20 }}
                                />
                            )}
                            <Typography>{node ? node.label : key}</Typography>
                            <Box sx={{ flex: 1 }} />
                        </Stack>
                    );
                }}
                EmptyItem={() => <span>No files</span>}
                CustomItem={({ itemKey, index, withDarkParent }) => {
                    const node = data$.current.map[itemKey];
                    if (!node) {
                        return null;
                    }
                    if (node.type !== "file") {
                        return null;
                    }
                    const fill = withDarkParent ? "#fff6" : "#ccc6";
                    return (
                        <ButtonBase
                            sx={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "stretch",
                                direction: "row",
                                background: index % 2 === 0 ? "transparent" : fill,
                                gap: 1,
                                p: 1,
                                mt: index === 0 ? 1 : 0,
                            }}
                            onClick={() => handleOpen(itemKey)}
                        >
                            {getFileIcon(node)}
                            <Box
                                sx={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "stretch",
                                    justifyContent: "stretch",
                                    "& > *": {
                                        width: "100%",
                                        textAlign: "start",
                                    },
                                }}
                            >
                                <Typography variant="body2">
                                    {node.label}
                                </Typography>
                                <Typography
                                    variant="caption"
                                    sx={{ opacity: 0.5 }}
                                >
                                    {node.mimeType}
                                </Typography>
                            </Box>
                            <Box sx={{ flex: 1 }} />
                            <ActionButton sx={{ mr: 2, pointerEvents: "none" }} variant="text">
                                Open
                            </ActionButton>
                        </ButtonBase>
                    );
                }}
                data={data.record}
                keyWidth={3}
                valueWidth={9}
            />
        );
    };

    return (
        <>
            <Breadcrumbs2
                items={options}
                actions={actions}
                onAction={handleAction}
            />
            <ScrollView withScrollbar hideOverflowX sx={{ height: "calc(100vh - 150px)" }}>
                <Box pr={2} pl={2}>
                    {renderInner()}
                </Box>
            </ScrollView>
            <Background />
        </>
    );
};

export default MainView;
