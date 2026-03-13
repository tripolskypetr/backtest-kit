import { SxProps } from "@mui/material";
import { DataObject, Description, PictureAsPdf } from "@mui/icons-material";
import { ActionMenu, IOption, useActualCallback } from "react-declarative";

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
        icon: DataObject,
    },
    {
        action: "markdown",
        label: "Download Markdown",
        icon: Description,
    },
    {
        action: "pdf",
        label: "Download PDF",
        icon: PictureAsPdf,
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
