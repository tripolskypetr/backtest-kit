import MarkdownIt from "markdown-it";
import { applyFixes } from "markdownlint";
import { lint } from "markdownlint/sync";
import sanitizeHtml from "sanitize-html";
import { toLintMarkdown } from "./toLintMarkdown";

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
