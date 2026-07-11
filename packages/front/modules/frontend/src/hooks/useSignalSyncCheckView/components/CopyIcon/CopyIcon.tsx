import * as React from "react";
import { SxProps } from "@mui/material";

import { ActionIcon, copyToClipboard, createAwaiter } from "react-declarative";
import ContentCopy from "@mui/icons-material/ContentCopy";
import ioc from "../../../../lib";

interface ICopyIconProps {
    disabled?: boolean;
    className?: string;
    style?: React.CSSProperties;
    sx?: SxProps<any>;
    onClick: (
        e: React.MouseEvent<HTMLButtonElement>,
        doCopy: (content: string | number) => void,
    ) => void | Promise<void>;
    color?:
        | "inherit"
        | "primary"
        | "secondary"
        | "success"
        | "error"
        | "info"
        | "warning";
}

const doCopy = async (content: React.ReactNode) => {
    let isOk = false;
    isOk = isOk || typeof content === "string";
    isOk = isOk || typeof content === "number";
    isOk = isOk || typeof content === "boolean";
    isOk = isOk || content === undefined;
    isOk = isOk || content === null;
    if (!isOk) {
        return;
    }
    await copyToClipboard(String(content));
};

export const CopyIcon = ({
    disabled,
    className,
    style,
    sx,
    onClick,
    color,
}: ICopyIconProps) => {
    return (
        <ActionIcon
            className={className}
            style={style}
            sx={sx}
            disabled={disabled}
            color={color}
            size={36}
            onClick={async (e) => {
                const [awaiter, { resolve }] = createAwaiter<string | number>();
                {
                    e.preventDefault();
                    e.stopPropagation();
                }
                await onClick(e, (content) => resolve(content));
                const content = await awaiter;
                {
                    await doCopy(content);
                }
                ioc.alertService.notify("Copied!");
            }}
        >
            <ContentCopy />
        </ActionIcon>
    );
};

export default CopyIcon;
