import { useCallback, useLayoutEffect, useRef } from "react";
import { SxProps } from "@mui/material";

import type * as Ace from "../../types/ace@1.4.12";
import { compose, singleshot, useSubject } from "react-declarative";
import ioc from "../../lib";
import { t } from "../../i18n";

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

const initAce = singleshot(() => {
    const url = new URL(location.href, location.origin);
    url.pathname = "/3rdparty/ace_1.4.12";
    ace.config.set("basePath", url.toString());
});

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

        initAce();

        const editor = ace.edit(element);

        {
            editor.setTheme("ace/theme/chrome");
            editor.session.setMode(getMode(mimeType));
            editor.getSession().setUseWorker(false);
        }

        const highlight = (phrase: string) => {
            if (!phrase) return;

            const content = editor.getValue();
            const idx = content.indexOf(phrase);
            if (idx === -1) return;

            const row = content.slice(0, idx).split("\n").length - 1;

            editor.gotoLine(row + 1, 0, true);
            editor.selection.selectLineEnd();
        };

        editor.commands.addCommand({
            name: "find",
            bindKey: { win: "Ctrl-F", mac: "Command-F" },
            exec: async () => {
                const search = await ioc.layoutService.prompt(t("Find text"));
                search && highlight(search);
            },
        });

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
