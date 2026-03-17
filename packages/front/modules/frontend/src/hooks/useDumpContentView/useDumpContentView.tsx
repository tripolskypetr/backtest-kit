import {
    useActualState,
    useModalManager,
    useTabsModal,
    History,
    useActualRef,
    ActionIcon,
    Async,
    useSinglerunAction,
} from "react-declarative";
import { ArrowBack, Close, Download, Print } from "@mui/icons-material";
import { createMemoryHistory } from "history";
import { Box, Stack } from "@mui/material";
import routes from "./routes";
import { CC_FULLSCREEN_SIZE_REQUEST } from "../../config/params";
import tabs from "./tabs";
import ioc from "../../lib";
import CopyIcon from "./components/CopyIcon";
import downloadMarkdown from "../../utils/downloadMarkdown";

const history = createMemoryHistory();

const fetchData = async (id: string) => {
    const file = await ioc.explorerViewService.getFileInfo(id);
    const content = await ioc.explorerViewService.getFileContent(file.path);
    return { content, mimeType: file.mimeType, label: file.label };
};

const handleDownload = async (id: string) => {
    const { content, label } = await fetchData(id);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, label);
};

const handleCopy = async (id: string, onCopy: (content: string) => void) => {
    const { content } = await fetchData(id);
    onCopy(content);
};

export const useDumpContentView = () => {
    const [id$, setId] = useActualState("");
    const ctx = useModalManager();
    const { push, pop } = ctx;

    const [pathname$, setPathname] = useActualRef(history.location.pathname);

    const handleTabChange = (id: string, history: History) => {
        const path = `/file_content/${id}`;
        history.replace(path);
        setPathname(path);
    };

    const handlePrint = async () => {
        const { content, mimeType } = await fetchData(id$.current);
        if (mimeType === "text/markdown") {
            await downloadMarkdown(content);
        }
    };

    const { pickData, render } = useTabsModal({
        tabs,
        withStaticAction: true,
        onTabChange: handleTabChange,
        animation: "none",
        title: "Dump Content",
        sizeRequest: CC_FULLSCREEN_SIZE_REQUEST,
        history,
        routes,
        BeforeTitle: ({ onClose }) => {
            const { total } = useModalManager();
            return (
                <Box
                    sx={{
                        mr: 1,
                        display: total === 1 ? "none" : "flex",
                    }}
                >
                    <ActionIcon onClick={onClose}>
                        <ArrowBack />
                    </ActionIcon>
                </Box>
            );
        },
        AfterTitle: ({ onClose }) => (
            <Stack direction="row" gap={1}>
                <Async>
                    {async () => {
                        const { mimeType } =
                            await ioc.explorerViewService.getFileInfo(
                                id$.current,
                            );
                        if (mimeType !== "text/markdown") {
                            return null;
                        }
                        return (
                            <ActionIcon
                                sx={{ mr: "10px" }}
                                onClick={() => handlePrint()}
                            >
                                <Print />
                            </ActionIcon>
                        );
                    }}
                </Async>
                <CopyIcon
                    onClick={async (_, onCopy) => {
                        await handleCopy(id$.current, onCopy);
                    }}
                    sx={{ mr: "10px", mt: "2.5px" }}
                />
                <ActionIcon onClick={() => handleDownload(id$.current)}>
                    <Download />
                </ActionIcon>
                <ActionIcon onClick={onClose}>
                    <Close />
                </ActionIcon>
            </Stack>
        ),
        fetchState: async () => await fetchData(id$.current),
        mapInitialData: ([{ content, mimeType }]) => ({
            content: {
                content,
                mimeType,
            },
            markdown: content,
            mimeType,
        }),
        mapPayload: ([{ mimeType }]) => ({ mimeType }),
        onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
        onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
        onClose: () => {
            pop();
        },
    });

    const { execute: handleOpen } = useSinglerunAction(async (id: string) => {
        const { mimeType } = await ioc.explorerViewService.getFileInfo(id);
        push({
            id: "file_content_modal",
            render,
            onInit: () => {
                const initialPath =
                    mimeType === "text/markdown"
                        ? "/file_content/markdown"
                        : "/file_content/content";
                history.push(initialPath);
                setPathname(initialPath);
            },
            onMount: () => {
                setId(id);
                pickData();
            },
        });
    }, {
        onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
        onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
    });

    return handleOpen;
};

export default useDumpContentView;
