import {
    KeyboardArrowLeft,
    Refresh,
} from "@mui/icons-material";
import { Box, Container, Paper, Typography } from "@mui/material";
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
import FileTreeWidget from "../../../../widgets/FileTreeWidget";

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

const reloadSubject = new Subject<void>();

export const MainView = ({
    params,
}: IOutletProps) => {

    const [nodes, { loading, execute }] = useAsyncValue(
        async () => {
            return await ioc.explorerViewService.getFolderTree();
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
            <FileTreeWidget nodes={nodes} initialSearch={params.search} />
        );
    };

    return (
        <Container>
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
        </Container>
    );
};

export default MainView;
