import { makeStyles } from '../../../styles';

export const useStyles = makeStyles()((theme) => ({
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

export default useStyles;
