/**
 * Converts markdown content to plain text with minimal formatting
 * @param content - Markdown string to convert
 * @returns Plain text representation
 */
export const toPlainString = (content: string): string => {
    if (!content) {
        return "";
    }

    let text = content;

    // Remove code blocks
    text = text.replace(/```[\s\S]*?```/g, "");
    text = text.replace(/`([^`]+)`/g, "$1");

    // Remove images
    text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");

    // Convert links to text only (keep link text, remove URL)
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

    // Remove headers (convert to plain text)
    text = text.replace(/^#{1,6}\s+(.+)$/gm, "$1");

    // Remove bold and italic markers
    text = text.replace(/\*\*\*(.+?)\*\*\*/g, "$1");
    text = text.replace(/\*\*(.+?)\*\*/g, "$1");
    text = text.replace(/\*(.+?)\*/g, "$1");
    // Underscore emphasis requires word boundaries (CommonMark: intraword
    // underscores are literal) — otherwise snake_case identifiers get mangled
    text = text.replace(/(?<![\w])___([^_]+)___(?![\w])/g, "$1");
    text = text.replace(/(?<![\w])__([^_]+)__(?![\w])/g, "$1");
    text = text.replace(/(?<![\w])_([^_]+)_(?![\w])/g, "$1");

    // Remove strikethrough
    text = text.replace(/~~(.+?)~~/g, "$1");

    // Convert lists to plain text with bullets
    text = text.replace(/^\s*[-*+]\s+/gm, "• ");
    text = text.replace(/^\s*\d+\.\s+/gm, "• ");

    // Remove blockquotes
    text = text.replace(/^\s*>\s+/gm, "");

    // Remove horizontal rules
    text = text.replace(/^(\*{3,}|-{3,}|_{3,})$/gm, "");

    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, "");

    // Remove excessive whitespace and normalize line breaks
    text = text.replace(/\n[\s\n]*\n/g, "\n");
    text = text.replace(/[ \t]+/g, " ");

    // Remove all newline characters
    text = text.replace(/\n/g, " ");

    // Remove excessive spaces after newline removal
    text = text.replace(/\s+/g, " ");

    return text.trim();
};

export default toPlainString;
