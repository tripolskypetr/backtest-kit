import React, { useCallback } from 'react';
import {
    Box,
    Collapse,
    IconButton,
    InputBase,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Paper,
    Typography,
} from '@mui/material';
import {
    Article,
    ChevronRight,
    Close,
    Code,
    DataObject,
    Folder,
    FolderOpen,
    Image,
    InsertDriveFile,
    Search,
    TextSnippet,
} from '@mui/icons-material';
import { makeStyles } from '../../styles';
import { FileNode } from './model/fileTree';
import { useFileSearch } from './hooks/useFileSearch';

/* ─── props ──────────────────────────────────────────────────────────────── */

interface FileTreeProps {
    nodes: FileNode[];
    onFileOpen?: (id: string) => void;
    initialExpanded?: string[];
    search?: string;
    onSearchChanged?: (search: string) => void;
}

/* ─── styles ─────────────────────────────────────────────────────────────── */

const useStyles = makeStyles()((theme) => ({
    root: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
    },
    toolbar: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 10px',
        borderBottom: `0.5px solid ${theme.palette.divider}`,
        flexShrink: 0,
    },
    title: {
        fontSize: 13,
        fontWeight: 500,
    },
    badge: {
        fontSize: 11,
        background: theme.palette.action.hover,
        border: `0.5px solid ${theme.palette.divider}`,
        borderRadius: 10,
        padding: '2px 8px',
        color: theme.palette.text.secondary,
    },
    searchRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '5px 8px',
        borderBottom: `0.5px solid ${theme.palette.divider}`,
        flexShrink: 0,
    },
    searchIcon: {
        color: theme.palette.action.active,
        fontSize: 18,
        flexShrink: 0,
    },
    searchInput: {
        flex: 1,
        fontSize: 13,
    },
    treeRoot: {
        flex: 1,
        overflowY: 'auto',
        padding: 0,
    },
    emptyState: {
        padding: '24px',
        textAlign: 'center',
        color: theme.palette.text.disabled,
        fontSize: 13,
    },
    itemIcon: {
        minWidth: 52,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
    },
    chevron: {
        fontSize: 18,
        color: theme.palette.action.active,
        transition: 'transform 0.15s ease',
        flexShrink: 0,
    },
    chevronOpen: {
        transform: 'rotate(90deg)',
    },
    chevronHidden: {
        visibility: 'hidden',
    },
    highlightMark: {
        background: '#FAC775',
        color: '#412402',
        borderRadius: 2,
        padding: '0 1px',
        fontStyle: 'normal',
    },
    nestedList: {
        padding: 0,
    },
}));

/* ─── helpers ────────────────────────────────────────────────────────────── */

function getFileIcon(ext?: string): React.ReactElement {
    switch (ext) {
        case 'tsx':
        case 'ts':
        case 'js':
        case 'jsx':
            return <Code fontSize="small" color="primary" />;
        case 'json':
            return <DataObject fontSize="small" color="secondary" />;
        case 'md':
            return <Article fontSize="small" color="action" />;
        case 'css':
        case 'scss':
        case 'html':
            return <TextSnippet fontSize="small" color="action" />;
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'svg':
        case 'gif':
        case 'ico':
            return <Image fontSize="small" color="action" />;
        default:
            return <InsertDriveFile fontSize="small" color="action" />;
    }
}

function highlightLabel(text: string, query: string, markClass: string): React.ReactNode {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
        <>
            {text.slice(0, idx)}
            <mark className={markClass}>{text.slice(idx, idx + query.length)}</mark>
            {text.slice(idx + query.length)}
        </>
    );
}

type Classes = ReturnType<typeof useStyles>['classes'];
type Cx = ReturnType<typeof useStyles>['cx'];

function renderNode(
    node: FileNode,
    depth: number,
    expanded: string[],
    selected: string | null,
    query: string,
    classes: Classes,
    cx: Cx,
    onToggle: (id: string) => void,
    onSelect: (id: string, isFile: boolean) => void,
): React.ReactNode {
    if (node.folder) {
        const isOpen = expanded.includes(node.id);
        return (
            <React.Fragment key={node.id}>
                <ListItem dense disablePadding>
                    <ListItemButton
                        sx={{ pl: depth * 2 + 1 }}
                        onClick={() => { onToggle(node.id); onSelect(node.id, false); }}
                    >
                        <ListItemIcon className={classes.itemIcon}>
                            <ChevronRight className={cx(classes.chevron, isOpen && classes.chevronOpen)} />
                            {isOpen
                                ? <FolderOpen fontSize="small" color="primary" />
                                : <Folder fontSize="small" color="action" />
                            }
                        </ListItemIcon>
                        <ListItemText
                            primary={highlightLabel(node.name, query, classes.highlightMark)}
                        />
                    </ListItemButton>
                </ListItem>
                <Collapse in={isOpen}>
                    <List className={classes.nestedList} disablePadding>
                        {(node.children ?? []).map((child) =>
                            renderNode(child, depth + 1, expanded, selected, query, classes, cx, onToggle, onSelect)
                        )}
                    </List>
                </Collapse>
            </React.Fragment>
        );
    }
    return (
        <ListItem key={node.id} dense disablePadding>
            <ListItemButton
                sx={{ pl: depth * 2 + 1 }}
                selected={selected === node.id}
                onClick={() => onSelect(node.id, true)}
            >
                <ListItemIcon className={classes.itemIcon}>
                    <ChevronRight className={cx(classes.chevron, classes.chevronHidden)} />
                    {getFileIcon(node.ext)}
                </ListItemIcon>
                <ListItemText
                    primary={highlightLabel(node.name, query, classes.highlightMark)}
                />
            </ListItemButton>
        </ListItem>
    );
}

/* ─── component ──────────────────────────────────────────────────────────── */

export function FileTree({ nodes, onFileOpen, initialExpanded = [], search, onSearchChanged }: FileTreeProps) {
    const { classes, cx } = useStyles();
    const {
        query, setQuery,
        selected, setSelected,
        expanded, setExpanded,
        filtered, totalFiles, visibleFiles,
    } = useFileSearch(nodes, initialExpanded, search);

    const handleQueryChange = useCallback((value: string) => {
        setQuery(value);
        onSearchChanged?.(value);
    }, [setQuery, onSearchChanged]);

    const handleToggle = useCallback((id: string) => {
        if (query) return;
        setExpanded(
            expanded.includes(id)
                ? expanded.filter((x) => x !== id)
                : [...expanded, id],
        );
    }, [expanded, query, setExpanded]);

    const handleSelect = useCallback((id: string, isFile: boolean) => {
        setSelected(id);
        if (isFile && onFileOpen) {
            onFileOpen(id);
        }
    }, [setSelected, onFileOpen]);

    return (
        <Paper className={classes.root}>
            <Box className={classes.toolbar}>
                <Typography className={classes.title}>File Explorer</Typography>
                <Typography className={classes.badge}>
                    {query ? `${visibleFiles} / ${totalFiles}` : totalFiles} files
                </Typography>
            </Box>

            <Box className={classes.searchRow}>
                <Search className={classes.searchIcon} />
                <InputBase
                    className={classes.searchInput}
                    placeholder="Search files…"
                    value={query}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    autoComplete="off"
                />
                {query && (
                    <IconButton size="small" onClick={() => handleQueryChange('')} aria-label="Clear">
                        <Close fontSize="small" />
                    </IconButton>
                )}
            </Box>

            {filtered.length === 0 ? (
                <Box className={classes.emptyState}>
                    No files matching &ldquo;{query}&rdquo;
                </Box>
            ) : (
                <List className={classes.treeRoot} disablePadding>
                    {filtered.map((node) =>
                        renderNode(node, 0, expanded, selected, query, classes, cx, handleToggle, handleSelect)
                    )}
                </List>
            )}
        </Paper>
    );
}

export default FileTree;
