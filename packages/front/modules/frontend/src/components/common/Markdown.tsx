import {
    Divider,
    DividerProps,
    Link,
    LinkProps,
    SxProps,
    Typography,
    TypographyProps,
} from "@mui/material";
import MuiMarkdown, { defaultOverrides } from "mui-markdown";
import { applyFixes } from "markdownlint";
import { lint } from "markdownlint/promise";
import { openBlank, useAsyncValue } from "react-declarative";
import ioc from "../../lib";

const CustomLink = (props: LinkProps) => (
    <Link
        {...props}
        onClick={(e) => {
            if (!props.href) {
                return;
            }
            e.preventDefault();
            openBlank(props.href);
        }}
    >
        {props.children}
    </Link>
);

const CustomHeader = (props: TypographyProps) => (
    <Typography {...props} color="#2196f3" variant="h5" sx={{ pt: 1, pb: 1 }}>
        {props.children}
    </Typography>
);

const CustomDivider = (props: DividerProps) => (
    <Divider {...props} sx={{ pt: 1, pb: 2 }} />
);

// Custom Strong component for bold text
const CustomStrong = (props: TypographyProps) => (
    <Typography component="span" fontWeight="bold" {...props}>
        {props.children}
    </Typography>
);

// Custom Paragraph component to preserve newlines and handle nested elements
const CustomParagraph = (props: TypographyProps) => {
    const { children } = props;

    if (typeof children === "string") {
        // Handle plain text with newlines
        const lines = children.split("\n").map((line, index, array) =>
            index < array.length - 1 ? (
                <span key={index}>
                    {line}
                    <br />
                </span>
            ) : (
                <span key={index}>{line}</span>
            )
        );
        return <Typography {...props}>{lines}</Typography>;
    }

    // Handle cases where children include JSX elements (e.g., <strong>)
    if (Array.isArray(children) || typeof children !== "string") {
        // Split children by newlines if they are strings, or preserve JSX elements
        const processChildren = (child: React.ReactNode, index: number): React.ReactNode => {
            if (typeof child === "string") {
                return child.split("\n").map((line, lineIndex, lineArray) =>
                    lineIndex < lineArray.length - 1 ? (
                        <span key={`${index}-${lineIndex}`}>
                            {line}
                            <br />
                        </span>
                    ) : (
                        <span key={`${index}-${lineIndex}`}>{line}</span>
                    )
                );
            }
            return <span key={index}>{child}</span>;
        };

        const processedChildren = Array.isArray(children)
            ? children.map(processChildren)
            : processChildren(children, 0);

        return <Typography {...props}>{processedChildren}</Typography>;
    }

    return <Typography {...props}>{children}</Typography>;
};

interface IMarkdownProps {
    content: string;
}

export const Markdown = ({ content }: IMarkdownProps) => {

    const [md] = useAsyncValue(async () => {
        try {
            const { content: errors } = await lint({ strings: { content } });
            if (!errors.length) {
                return content;
            }
            const value = applyFixes(content, errors);
            return value ? value : content;
        } catch (error) {
            console.log("Markdown lint failed", error);
            return content;
        }
    }, {
        onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
        onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
        deps: [content],
    });

    if (!md) {
        return null;
    }

    return (
        <MuiMarkdown
            overrides={{
                ...defaultOverrides,
                a: {
                    component: CustomLink,
                },
                h1: {
                    component: CustomHeader,
                },
                h2: {
                    component: CustomHeader,
                },
                h3: {
                    component: CustomHeader,
                },
                h4: {
                    component: CustomHeader,
                },
                h5: {
                    component: CustomHeader,
                },
                h6: {
                    component: CustomHeader,
                },
                hr: {
                    component: CustomDivider,
                },
                p: {
                    component: CustomParagraph,
                },
                strong: {
                    component: CustomStrong, // Add custom strong component
                },
            }}
        >
            {md}
        </MuiMarkdown>
    );
};

export default Markdown;
