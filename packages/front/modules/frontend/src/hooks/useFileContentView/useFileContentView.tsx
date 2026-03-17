import {
    useActualState,
    useModalManager,
    useTabsModal,
    History,
    useActualRef,
    ActionIcon,
} from "react-declarative";
import { Close } from "@mui/icons-material";
import { createMemoryHistory } from "history";
import routes from "./routes";
import { CC_FULLSCREEN_SIZE_REQUEST } from "../../config/params";
import tabs from "./tabs";
import ioc from "../../lib";

const history = createMemoryHistory();

const fetchData = async (id: string) => {
    const file = await ioc.explorerViewService.getFileInfo(id);
    const content = await ioc.explorerViewService.getFileContent(file.path);
    return { content, mimeType: file.mimeType };
};

export const useFileContentView = () => {
    const [id$, setId] = useActualState("");
    const ctx = useModalManager();
    const { push, pop } = ctx;

    const [pathname$, setPathname] = useActualRef(history.location.pathname);

    const handleTabChange = (id: string, history: History) => {
        const path = `/file_content/${id}`;
        history.replace(path);
        setPathname(path);
    };

    const { pickData, render } = useTabsModal({
        tabs,
        withStaticAction: true,
        onTabChange: handleTabChange,
        animation: "none",
        title: "File Content",
        sizeRequest: CC_FULLSCREEN_SIZE_REQUEST,
        history,
        routes,
        AfterTitle: ({ onClose }) => (
            <ActionIcon onClick={onClose}>
                <Close />
            </ActionIcon>
        ),
        fetchState: async () => await fetchData(id$.current),
        mapInitialData: ([{ content, mimeType }]) => ({
            content,
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

    return (id: string) => {
        push({
            id: "file_content_modal",
            render,
            onInit: () => {
                const initialPath = "/file_content/content";
                history.push(initialPath);
                setPathname(initialPath);
            },
            onMount: () => {
                setId(id);
                pickData();
            },
        });
    };
};

export default useFileContentView;
