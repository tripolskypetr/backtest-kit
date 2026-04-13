import {
    KeyboardArrowLeft,
    Refresh,
} from "@mui/icons-material";
import { Box, Paper, Typography } from "@mui/material";
import {
    Breadcrumbs2,
    Breadcrumbs2Type,
    Center,
    IBreadcrumbs2Action,
    IBreadcrumbs2Option,
    IOutletProps,
    ScrollView,
    Subject,
    useActualState,
    useAsyncValue,
    useOnce,
} from "react-declarative";
import ioc from "../../../../lib";
import IconWrapper from "../../../../components/common/IconWrapper";
import {
    ExplorerNode,
} from "../../../../model/Explorer.model";
import { Background } from "../../../../components/common/Background";
import { FileTree } from "../../../../widgets/FileTreeWidget/FileTree";
import { FileNode } from "../../../../widgets/FileTreeWidget/model/fileTree";

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

function getExt(label: string): string | undefined {
    const dot = label.lastIndexOf(".");
    return dot !== -1 ? label.slice(dot + 1) : undefined;
}

function toFileNode(node: ExplorerNode): FileNode {
    if (node.type === "directory") {
        return {
            id: node.id,
            name: node.label,
            folder: true,
            children: node.nodes.map(toFileNode),
        };
    }
    return {
        id: node.id,
        name: node.label,
        ext: getExt(node.label),
    };
}

const reloadSubject = new Subject<void>();

export const MainView = ({
    params,
}: IOutletProps) => {

    const [search$, setSearch] = useActualState(params.search);

    const [nodes, { loading, execute }] = useAsyncValue(
        async () => {
            const { map } = await ioc.explorerViewService.getFolderTree();
            const roots = Object.values(map).filter(
                (n) => n.type === "directory" && !Object.values(map).some(
                    (m) => m.type === "directory" && m.nodes.some((c) => c.id === n.id)
                )
            );
            if (roots.length) {
                return roots.map(toFileNode);
            }
            return Object.values(map).map(toFileNode);
        },
        {
            onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
            onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
        },
    );

    useOnce(() => reloadSubject.subscribe(execute));

    const handleAction = (action: string) => {
        if (action === "back-action") {
            ioc.routerService.push("/");
        }
        if (action === "update-now") {
            ioc.explorerViewService.clear();
            reloadSubject.next();
        }
    };

    const renderInner = () => {
        if (loading || !nodes) {
            return (
                <Center>
                    <Typography variant="h6" sx={{ opacity: 0.5 }}>
                        Loading...
                    </Typography>
                </Center>
            );
        }

        return (
            <Paper sx={{ height: "calc(100vh - 180px)" }}>
                <FileTree
                    nodes={nodes}
                    search={search$.current}
                    onSearchChanged={(search) => setSearch(search)}
                    onFileOpen={(id) => ioc.layoutService.pickDumpContent(id)}
                />
            </Paper>
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
