import { useCallback, useLayoutEffect, useRef } from "react";
import { SxProps } from "@mui/material";

import type * as Ace from "../../types/ace@1.4.12";
import { compose, useSubject } from "react-declarative";

interface ICodeEditorProps {
    className?: string;
    style?: React.CSSProperties;
    sx?: SxProps;
    code: string;
    mimeType: string;
    height: number;
    width: number;
}

declare global {
    const ace: typeof Ace;
}

type AceElement = any;

const getMode = (_mimeType: string) => {
    /*
    if (_mimeType === "application/json") {
        return "ace/mode/json";
    }
    if (_mimeType === "text/markdown") {
        return "ace/mode/markdown";
    }
    */
    return "ace/mode/javascript";
};

export const CodeEditor = ({
    className,
    style,
    code,
    height,
    width,
    mimeType,
}: ICodeEditorProps) => {
    const disposeRef = useRef<Function>();

    const resizeSubject = useSubject<void>();

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

        const unResize = resizeSubject.subscribe(() => {
            editor.resize(true);
        });

        disposeRef.current = compose(
            () => editor.destroy(),
            () => unResize(),
        );
    }, []);

    useLayoutEffect(
        () => () => {
            disposeRef.current && disposeRef.current();
        },
        [],
    );

    useLayoutEffect(() => {
        resizeSubject.next();
    }, [height, width]);

    return (
        <pre className={className} style={style} ref={handleRef}>
            {code}
        </pre>
    );
};

export default CodeEditor;
