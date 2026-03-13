import React from "react";
import { SxProps } from "@mui/material";
import { DataObject, Description, PictureAsPdf } from "@mui/icons-material";
import { ActionMenu, IOption, useActualCallback } from "react-declarative";
import IconWrapper from "../../../../components/common/IconWrapper";

interface IMenuIconProps {
    disabled?: boolean;
    className?: string;
    style?: React.CSSProperties;
    sx?: SxProps<any>;
    onDownloadJson: () => void | Promise<void>;
    onDownloadMarkdown: () => void | Promise<void>;
    onDownloadPdf: () => void | Promise<void>;
}

const options: IOption[] = [
    {
        action: "json",
        label: "Download JSON",
        icon: () => <IconWrapper icon={DataObject} color="#4caf50" />,
    },
    {
        action: "markdown",
        label: "Download Markdown",
        icon: () => <IconWrapper icon={Description} color="#4caf50" />,
    },
    {
        action: "pdf",
        label: "Download PDF",
        icon: () => <IconWrapper icon={PictureAsPdf} color="#4caf50" />,
    },
];

export const MenuIcon = ({
    disabled,
    className,
    style,
    sx,
    onDownloadJson,
    onDownloadMarkdown,
    onDownloadPdf,
}: IMenuIconProps) => {
    const handleAction = useActualCallback(async (action: string) => {
        if (action === "json") await onDownloadJson();
        else if (action === "markdown") await onDownloadMarkdown();
        else if (action === "pdf") await onDownloadPdf();
    });

    return (
        <ActionMenu
            transparent
            keepMounted
            className={className}
            style={style}
            sx={sx}
            disabled={disabled}
            options={options}
            onAction={handleAction}
        />
    );
};

export default MenuIcon;
