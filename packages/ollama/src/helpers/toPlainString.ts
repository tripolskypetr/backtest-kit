import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";
import { toLintMarkdown } from "./toLintMarkdown";

/**
 * Converts markdown content to plain text with Telegram-compatible HTML formatting.
 *
 * Processes markdown through three stages:
 * 1. Lints and fixes markdown using markdownlint
 * 2. Renders markdown to HTML using markdown-it
 * 3. Sanitizes HTML to Telegram-compatible subset
 *
 * Supported tags: b, i, a, code, pre, s, u, tg-spoiler, blockquote, br
 * Transforms: headings removed, lists to bullets, multiple newlines collapsed
 *
 * @param content - Raw markdown content
 * @returns Promise resolving to sanitized plain text with HTML formatting
 *
 * @example
 * ```typescript
 * const markdown = "# Title\n**Bold** and *italic*\n- Item 1\n- Item 2";
 * const plain = await toPlainString(markdown);
 * // Returns: "Bold and italic\n• Item 1\n• Item 2"
 * ```
 */
export const toPlainString = async (content: string): Promise<string> => {

    if (!content) {
        return "";
    }

    const markdown = await toLintMarkdown(content);

    const md = new MarkdownIt({
        html: false,
        breaks: true,
        linkify: true,
        typographer: true,
    });

    let telegramHtml = md.render(markdown);

    telegramHtml = sanitizeHtml(telegramHtml, {
        allowedTags: [
            "b",
            "i",
            "a",
            "code",
            "pre",
            "s",
            "u",
            "tg-spoiler",
            "blockquote",
            "br",
        ],
        allowedAttributes: {
            a: ["href"],
        },
        transformTags: {
            h1: "",
            h2: "",
            h3: "",
            h4: "",
            h5: "",
            h6: "",
            a: "",
            strong: "",
            em: "",
            p: () => "",
            ul: () => "",
            li: () => "• ",
            ol: () => "",
            hr: () => "\n",
            br: () => "\n",
            div: () => "",
        },
    });

    return telegramHtml.replaceAll(/\n[\s\n]*\n/g, "\n").trim();
};

export default toPlainString;
