import { useCallback, useLayoutEffect, useRef } from "react";
import { SxProps } from "@mui/material";

import Box from "@mui/material/Box";

import type * as Ace from "../../types/ace@1.4.12";

interface ICodeEditorProps {
    className?: string;
    style?: React.CSSProperties;
    sx?: SxProps;
    code: string;
    mimeType: string;
}

declare global {
    const ace: typeof Ace;
}

type AceElement = any;

const getMode = (mimeType: string) => {
    if (mimeType === "application/json") {
        return "ace/mode/json";
    }
    if (mimeType === "text/markdown") {
        return "ace/mode/markdown";
    }
    return "ace/mode/javascript";
};

export const CodeEditor = ({
    className,
    style,
    sx,
    code,
    mimeType,
}: ICodeEditorProps) => {
    const disposeRef = useRef<Function>();

    const handleRef = useCallback((element: AceElement) => {
        disposeRef.current && disposeRef.current();

        if (!element) {
            return;
        }

        const editor = ace.edit(element);

        {
            editor.setTheme("ace/theme/chrome");
            editor.session.setMode(getMode(mimeType));
            editor.getSession().setUseWorker(false);
        }

        disposeRef.current = () => editor.destroy();
    }, []);

    useLayoutEffect(
        () => () => {
            disposeRef.current && disposeRef.current();
        },
        [],
    );

    return (
        <Box
            component="pre"
            className={className}
            style={style}
            sx={sx}
            ref={handleRef}
        >
            {code}
        </Box>
    );
};

export default CodeEditor;
