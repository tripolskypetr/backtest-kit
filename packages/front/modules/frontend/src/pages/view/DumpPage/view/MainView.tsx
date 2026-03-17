import {
    Article,
    DataObject,
    Folder,
    Image,
    InsertDriveFile,
    Refresh,
} from "@mui/icons-material";
import { Box, Stack, Typography } from "@mui/material";
import {
    Breadcrumbs2,
    Breadcrumbs2Type,
    Center,
    IBreadcrumbs2Action,
    IBreadcrumbs2Option,
    RECORD_NEVER_VALUE,
    RecordView,
    ScrollView,
    useAsyncValue,
    useReloadTrigger,
} from "react-declarative";
import { set } from "lodash";
import { useMemo } from "react";
import ioc from "../../../../lib";
import IconWrapper from "../../../../components/common/IconWrapper";
import { ExplorerFile, ExplorerNodeDict } from "../../../../model/Explorer.model";

interface IRecord {
    [key: string]: IRecord | string | null;
}

const options: IBreadcrumbs2Option[] = [
    {
        type: Breadcrumbs2Type.Link,
        action: "back-action",
        label: "Main",
    },
    {
        type: Breadcrumbs2Type.Link,
        action: "back-action",
        label: "File Explorer",
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

const buildRecord = (nodes: Record<string, ExplorerNodeDict>): IRecord => {
    const record: IRecord = {};
    for (const node of Object.values(nodes)) {
        if (node.type === "directory") {
            record[node.path] = buildRecord(node.nodes);
        } else {
            record[node.path] = node.path;
        }
    }
    if (!Object.keys(record).length) {
        set(record, RECORD_NEVER_VALUE, null);
    }
    return record;
};

const buildNodeMap = (
    nodes: Record<string, ExplorerNodeDict>,
    acc: Map<string, ExplorerNodeDict>,
) => {
    for (const node of Object.values(nodes)) {
        acc.set(node.path, node);
        if (node.type === "directory") {
            buildNodeMap(node.nodes, acc);
        }
    }
};

export const MainView = () => {
    const { reloadTrigger, doReload } = useReloadTrigger();

    const [tree, { loading }] = useAsyncValue(
        async () => await ioc.explorerViewService.getTree(),
        {
            onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
            onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
            deps: [reloadTrigger],
        },
    );

    const handleAction = (action: string) => {
        if (action === "back-action") {
            ioc.routerService.push("/");
        }
        if (action === "update-now") {
            doReload();
        }
    };

    const { recordData, nodeMap } = useMemo(() => {
        if (!tree) {
            return { recordData: {}, nodeMap: new Map<string, ExplorerNodeDict>() };
        }
        const topRecord: IRecord = {};
        const nodeMap = new Map<string, ExplorerNodeDict>();
        for (const node of tree) {
            if (node.type === "directory") {
                topRecord[node.path] = buildRecord(node.nodes);
                buildNodeMap(node.nodes, nodeMap);
            } else {
                topRecord[node.path] = node.path;
            }
            nodeMap.set(node.path, node);
        }
        if (!Object.keys(topRecord).length) {
            set(topRecord, RECORD_NEVER_VALUE, null);
        }
        return { recordData: topRecord, nodeMap };
    }, [tree]);

    const renderInner = () => {
        if (loading || !tree) {
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
                key={reloadTrigger}
                withExpandAll
                sx={{
                    background: (theme) => theme.palette.background.default,
                    minHeight: "300px",
                }}
                data={recordData}
                formatKey={(key) => {
                    const node = nodeMap.get(key);
                    return (
                        <Stack direction="row" alignItems="center" gap={1}>
                            {node?.type === "directory" && (
                                <Folder sx={{ color: "#1976d2", fontSize: 20 }} />
                            )}
                            <Typography>
                                {node ? node.label : key}
                            </Typography>
                            <Box sx={{ flex: 1 }} />
                        </Stack>
                    );
                }}
                keyWidth={3}
                valueWidth={9}
                EmptyItem={() => <span>No files</span>}
                CustomItem={({ itemKey }) => {
                    const node = nodeMap.get(itemKey);
                    return (
                        <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
                            {node?.type === "file" && getFileIcon(node)}
                            <Stack>
                                <Typography variant="body2">
                                    {node ? node.label : itemKey}
                                </Typography>
                                {node && (
                                    <Typography
                                        variant="caption"
                                        sx={{ opacity: 0.5 }}
                                    >
                                        {node.path}
                                    </Typography>
                                )}
                            </Stack>
                            <Box sx={{ flex: 1 }} />
                        </Stack>
                    );
                }}
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
            <ScrollView
                hideOverflowX
                sx={{ height: "calc(100vh - 140px)" }}
            >
                {renderInner()}
            </ScrollView>
        </>
    );
};

export default MainView;
