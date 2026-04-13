import {
    Collapse,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
} from '@mui/material';
import {
    ChevronRight,
    Folder,
    FolderOpen,
} from '@mui/icons-material';
import { IFileNode } from '../model/IFileNode.model';
import useStyles from '../hooks/useStyles';
import { getFileIcon } from '../utils/getFileIcon';
import { highlightLabel } from '../utils/highlightLabel';

interface ITreeNodeProps {
    node: IFileNode;
    depth: number;
    expanded: string[];
    selected: string | null;
    query: string;
    onToggle: (id: string) => void;
    onSelect: (id: string, isFile: boolean) => void;
}

export const TreeNode = ({ node, depth, expanded, selected, query, onToggle, onSelect }: ITreeNodeProps) => {
    const { classes, cx } = useStyles();

    if (node.folder) {
        const isOpen = expanded.includes(node.id);
        return (
            <>
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
                        <ListItemText primary={highlightLabel(node.name, query, classes.highlightMark)} />
                    </ListItemButton>
                </ListItem>
                <Collapse in={isOpen}>
                    <List className={classes.nestedList} disablePadding>
                        {(node.children ?? []).map((child) => (
                            <TreeNode
                                key={child.id}
                                node={child}
                                depth={depth + 1}
                                expanded={expanded}
                                selected={selected}
                                query={query}
                                onToggle={onToggle}
                                onSelect={onSelect}
                            />
                        ))}
                    </List>
                </Collapse>
            </>
        );
    }

    return (
        <ListItem dense disablePadding>
            <ListItemButton
                sx={{ pl: depth * 2 + 1 }}
                selected={selected === node.id}
                onClick={() => onSelect(node.id, true)}
            >
                <ListItemIcon className={classes.itemIcon}>
                    <ChevronRight className={cx(classes.chevron, classes.chevronHidden)} />
                    {getFileIcon(node.ext)}
                </ListItemIcon>
                <ListItemText primary={highlightLabel(node.name, query, classes.highlightMark)} />
            </ListItemButton>
        </ListItem>
    );
};

export default TreeNode;
