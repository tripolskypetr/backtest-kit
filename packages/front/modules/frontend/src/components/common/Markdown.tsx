import {
    Box,
    Divider,
    DividerProps,
    Link,
    LinkProps,
    Stack,
    Table,
    TableContainer,
    TableProps,
    Typography,
    TypographyProps,
} from "@mui/material";
import { Children, Fragment, isValidElement, ReactNode, useMemo } from "react";
import MuiMarkdown, { defaultOverrides } from "mui-markdown";
import { applyFixes } from "markdownlint";
import { lint } from "markdownlint/promise";
import { Grid, IGridColumn, PaperView, ScrollView, typo, useAsyncValue } from "react-declarative";
import ioc from "../../lib";

const CustomLink = (props: LinkProps) => (
    <Link
        {...props}
        onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!props.href) {
                return;
            }
            ioc.linkService.openLink(props.href);
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

// Custom Table component with a horizontally scrollable container
const CustomTable = ({ sx, ...props }: TableProps) => (
    <PaperView
        variant="outlined"
        sx={{
            width: "calc(100% - 32px)",
            marginRight: "32px",
            marginTop: "8px",
            marginBottom: "8px",
            height: "max(calc(100dvh - 450px), 250px)",
            "&:not(:hover)": {
                 "& *": {
                    scrollbarWidth: "none",
                },
            },
            "&:hover": {
                "& *": {
                    scrollbarWidth: "auto",
                },
            },
            ...sx
        }}
        >
        <ScrollView withScrollbar sx={{ height: "100%" }}>
            <Stack direction="column">
                <Table {...props}>
                    {props.children}
                </Table>
                <Box flex={1} />
            </Stack>
        </ScrollView>
    </PaperView>
);

interface IVirtualRow {
    id: string;
    [cellKey: string]: ReactNode;
}

// Recursively flattens a React node tree into plain text (for header labels)
const extractText = (node: ReactNode): string => {
    if (node == null || typeof node === "boolean") {
        return "";
    }
    if (typeof node === "string" || typeof node === "number") {
        return String(node);
    }
    if (Array.isArray(node)) {
        return node.map(extractText).join("");
    }
    if (isValidElement(node)) {
        return extractText((node.props as { children?: ReactNode }).children);
    }
    return "";
};

// Finds the first descendant element whose intrinsic tag matches `tag`
const findElementByTag = (node: ReactNode, tag: string): React.ReactElement | null => {
    let found: React.ReactElement | null = null;
    Children.forEach(node, (child) => {
        if (found || !isValidElement(child)) {
            return;
        }
        if (child.type === tag) {
            found = child;
            return;
        }
        found = findElementByTag((child.props as { children?: ReactNode }).children, tag);
    });
    return found;
};

// Collects all direct/nested descendant elements matching `tag` (e.g. all <tr>)
const collectElementsByTag = (node: ReactNode, tag: string): React.ReactElement[] => {
    const result: React.ReactElement[] = [];
    Children.forEach(node, (child) => {
        if (!isValidElement(child)) {
            return;
        }
        if (child.type === tag) {
            result.push(child);
            return;
        }
        result.push(...collectElementsByTag((child.props as { children?: ReactNode }).children, tag));
    });
    return result;
};

// Returns the direct cell elements (<th>/<td>) of a table row
const collectCells = (row: React.ReactElement): React.ReactElement[] => {
    const cells: React.ReactElement[] = [];
    Children.forEach((row.props as { children?: ReactNode }).children, (child) => {
        if (isValidElement(child) && (child.type === "th" || child.type === "td")) {
            cells.push(child);
        }
    });
    return cells;
};

const VirtualTable = ({ children }: TableProps) => {
    const { columns, data } = useMemo(() => {
        const thead = findElementByTag(children, "thead");
        const tbody = findElementByTag(children, "tbody");

        const headerRow = thead ? collectElementsByTag(thead, "tr")[0] : undefined;
        const headerCells = headerRow ? collectCells(headerRow) : [];

        const columns: IGridColumn<IVirtualRow>[] = headerCells.map((cell, index) => {
            const field = `cell_${index}` as const;
            return {
                field,
                label: extractText(cell) || typo.nbsp,
                minWidth: 120,
                // Passthrough: the cell may hold custom components (links, bold, etc.)
                format: (row) => <Fragment>{row[field]}</Fragment>,
            };
        });

        const bodyRows = tbody ? collectElementsByTag(tbody, "tr") : [];
        const data: IVirtualRow[] = bodyRows.map((row, rowIndex) => {
            const cells = collectCells(row);
            const entry: IVirtualRow = { id: `row_${rowIndex}` };
            cells.forEach((cell, cellIndex) => {
                entry[`cell_${cellIndex}`] = (cell.props as { children?: ReactNode }).children;
            });
            return entry;
        });

        return { columns, data };
    }, [children]);

    return (
        <PaperView
            variant="outlined"
            sx={{
                width: "calc(100% - 32px)",
                marginRight: "32px",
                marginTop: "8px",
                marginBottom: "8px",
                height: "max(calc(100dvh - 450px), 250px)",
                "&:not(:hover)": {
                    "& *": {
                        scrollbarWidth: "none",
                    },
                },
                "&:hover": {
                    "& *": {
                        scrollbarWidth: "auto",
                    },
                },
            }}
        >
            <Grid<IVirtualRow>
                sx={{ height: "100%", background: "transparent !important" }}
                transparentPaper
                data={data}
                columns={columns}
            />
        </PaperView>
    );
};

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
                table: {
                    component: VirtualTable,
                },
                thead: {
                    component: "thead",
                },
                tbody: {
                    component: "tbody",
                },
                tr: {
                    component: "tr",
                },
                th: {
                    component: "th",
                },
                td: {
                    component: "td",
                },
            }}
        >
            {md}
        </MuiMarkdown>
    );
};

export default Markdown;
