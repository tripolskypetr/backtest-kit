import {
    Center,
    CopyButton,
    LoaderView,
    PaperView,
    sleep,
    useAsyncValue,
    useChangeSubject,
    useDebounce,
    useSinglerunAction,
    VirtualView,
} from "react-declarative";
import { ExplorerFile, ExplorerNode } from "../../model/Explorer.model";
import { makeStyles } from "../../styles";
import ioc from "../../lib";
import {
    Article,
    Close,
    DataObject,
    Folder,
    Image,
    InsertDriveFile,
    KeyboardArrowLeft,
    Refresh,
} from "@mui/icons-material";
import {
    alpha,
    ButtonBase,
    IconButton,
    InputAdornment,
    InputBase,
    ListItem,
    ListItemAvatar,
    ListItemText,
    SxProps,
    Typography,
} from "@mui/material";
import { useState } from "react";
import { Search } from "@mui/icons-material";

interface IFileTreeWidgetProps {
    outlinePaper?: boolean;
    className?: string;
    style?: React.CSSProperties;
    sx?: SxProps;
    nodes: ExplorerNode[];
    initialSearch: string;
}

const SEARCH_DEBOUNCE = 2_500;
const CHUNK_SIZE = 10_000;

const MAX_ROWS = 25_000;

const HEADER_HEIGHT = "65px";

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

const useStyles = makeStyles()((theme) => ({
    root: {
        position: "relative",
        height: "100%",
        width: "100%",
        background: "#eee",
        overflow: "clip",
    },
    header: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: "8px",
        paddingRight: "4px",
        height: HEADER_HEIGHT,
    },
    input: {
        height: HEADER_HEIGHT,
        paddingRight: theme.spacing(2),
        paddingLeft: theme.spacing(1),
        width: "100%",
    },
    container: {
        position: "absolute",
        top: HEADER_HEIGHT,
        left: 0,
        right: 0,
        bottom: 0,
        height: `calc(100% - ${HEADER_HEIGHT})`,
        width: "100%",
        background: "white",
        overflow: "clip",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "stretch",
    },
    content: {
        display: "flex",
        flex: 1,
    },
    loader: {
        height: "100%",
        width: "100%",
    },
    accent: {
        background: alpha("#00c3ff", 0.05),
    },
}));

const listItems = async (search: string, nodes: ExplorerNode[]) => {
    const query = search.trim().toLowerCase();
    const result: ExplorerFile[] = [];
    let chunk = 0;
    for (const node of ioc.explorerHelperService.deepFlat(nodes)) {
        if (
            node.type === "file" &&
            (!query || node.path.toLowerCase().includes(query))
        ) {
            result.push(node);
        }
        if (++chunk % CHUNK_SIZE === 0) {
            await sleep(0);
        }
        if (result.length > MAX_ROWS) {
            break;
        }
    }
    return result;
};

export const FileTreeWidget = ({
    outlinePaper,
    className,
    style,
    sx,
    nodes,
    initialSearch = "",
}: IFileTreeWidgetProps) => {
    const { classes, cx } = useStyles();

    const [search, setSearch] = useState(initialSearch);

    const searchChanges = useChangeSubject(search);

    const [search$, { flush }] = useDebounce(search, SEARCH_DEBOUNCE);

    const [items, { loading }] = useAsyncValue(
        async () => {
            return await listItems(search$, nodes);
        },
        {
            onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
            onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
            deps: [search$, nodes],
        },
    );

    const { execute: doOpen } = useSinglerunAction(async (id: string) => {
        await ioc.layoutService.pickDumpContent(id);
    }, {
        onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
        onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
    });

    const handleOpen = async (id: string) => {
        await doOpen(id);
    };

    const handleClear = () => {
        searchChanges.once(async () => {
            await sleep(500);
            flush();
        });
        setSearch("");
    }

    const renderInner = () => {
        if (!items) {
            return <LoaderView className={classes.loader} />;
        }
        if (!items.length) {
            return (
                <Center
                    sx={{
                        height: "100%",
                        width: "100%",
                    }}
                >
                    <Typography variant="h6" sx={{ opacity: 0.5 }}>
                        Not found
                    </Typography>
                </Center>
            )
        }
        return (
            <VirtualView withScrollbar>
                {items.map((node, idx) => (
                    <ListItem
                        className={cx({
                            [classes.accent]: idx % 2 === 1,
                        })}
                        component={ButtonBase}
                        onClick={() => handleOpen(node.id)}
                        key={node.id}
                    >
                        <ListItemAvatar>{getFileIcon(node)}</ListItemAvatar>
                        <ListItemText
                            primary={node.label}
                            secondary={node.path}
                        />
                        <CopyButton
                            content={node.path}
                            label="Copy path"
                        />
                    </ListItem>
                ))}
            </VirtualView>
        );
    };

    return (
        <PaperView
            outlinePaper={outlinePaper}
            className={cx(classes.root, className)}
            style={style}
            sx={sx}
        >
            <div className={classes.header}>
                <InputBase
                    disabled={loading}
                    className={classes.input}
                    endAdornment={
                        <InputAdornment position="end">
                            <IconButton disabled={loading || !search} onClick={handleClear} edge="end">
                                {!!search ? <Close /> : <Search />}
                            </IconButton>
                        </InputAdornment>
                    }
                    placeholder="Search"
                    value={search}
                    onBlur={() => flush()}
                    onChange={({ target }) => setSearch(target.value)}
                    onKeyDown={({ key, currentTarget }) => key === "Enter" && currentTarget.blur()}
                />
            </div>
            <div className={classes.container}>
                <div className={classes.content}>{renderInner()}</div>
            </div>
        </PaperView>
    );
};

export default FileTreeWidget;
