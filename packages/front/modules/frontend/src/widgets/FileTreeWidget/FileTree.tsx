import { useCallback } from 'react';
import {
    Box,
    IconButton,
    InputBase,
    List,
    Paper,
    Typography,
} from '@mui/material';
import {
    Close,
    Search,
} from '@mui/icons-material';
import { IFileNode } from './model/IFileNode.model';
import { useFileSearch } from './hooks/useFileSearch';
import { useStyles } from './hooks/useStyles';
import { TreeNode } from './components/TreeNode';

interface IFileTreeProps {
    nodes: IFileNode[];
    onFileOpen?: (id: string) => void;
    initialExpanded?: string[];
    search?: string;
    onSearchChanged?: (search: string) => void;
}

export const FileTree = ({ nodes, onFileOpen, initialExpanded = [], search, onSearchChanged }: IFileTreeProps) => {
    const { classes } = useStyles();
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
                    {filtered.map((node) => (
                        <TreeNode
                            key={node.id}
                            node={node}
                            depth={0}
                            expanded={expanded}
                            selected={selected}
                            query={query}
                            onToggle={handleToggle}
                            onSelect={handleSelect}
                        />
                    ))}
                </List>
            )}
        </Paper>
    );
};

export default FileTree;
