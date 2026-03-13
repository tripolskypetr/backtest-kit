import * as React from "react";
import { SxProps, Menu, MenuItem, ListItemIcon, ListItemText } from "@mui/material";
import { MoreVert, DataObject, Description, PictureAsPdf } from "@mui/icons-material";
import { ActionIcon } from "react-declarative";

interface IMenuIconProps {
    disabled?: boolean;
    className?: string;
    style?: React.CSSProperties;
    sx?: SxProps<any>;
    onDownloadJson: () => void | Promise<void>;
    onDownloadMarkdown: () => void | Promise<void>;
    onDownloadPdf: () => void | Promise<void>;
}

export const MenuIcon = ({
    disabled,
    className,
    style,
    sx,
    onDownloadJson,
    onDownloadMarkdown,
    onDownloadPdf,
}: IMenuIconProps) => {
    const [anchorEl, setAnchorEl] = React.useState<HTMLButtonElement | null>(null);

    const handleOpen = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setAnchorEl(e.currentTarget);
    };

    const handleClose = () => setAnchorEl(null);

    return (
        <>
            <ActionIcon
                className={className}
                style={style}
                sx={sx}
                disabled={disabled}
                size={36}
                onClick={handleOpen}
            >
                <MoreVert />
            </ActionIcon>
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleClose}
            >
                <MenuItem
                    onClick={async () => {
                        handleClose();
                        await onDownloadJson();
                    }}
                >
                    <ListItemIcon><DataObject fontSize="small" /></ListItemIcon>
                    <ListItemText>Download JSON</ListItemText>
                </MenuItem>
                <MenuItem
                    onClick={async () => {
                        handleClose();
                        await onDownloadMarkdown();
                    }}
                >
                    <ListItemIcon><Description fontSize="small" /></ListItemIcon>
                    <ListItemText>Download Markdown</ListItemText>
                </MenuItem>
                <MenuItem
                    onClick={async () => {
                        handleClose();
                        await onDownloadPdf();
                    }}
                >
                    <ListItemIcon><PictureAsPdf fontSize="small" /></ListItemIcon>
                    <ListItemText>Download PDF</ListItemText>
                </MenuItem>
            </Menu>
        </>
    );
};

export default MenuIcon;
