import MarkdownIt from "markdown-it";
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

    // List markers must be injected as TEXT inside <li> before sanitizing:
    // sanitize-html transformTags cannot insert text (a transform returning
    // "• " is silently ignored), so list items were losing their bullets.
    telegramHtml = telegramHtml.replace(/<ol>([\s\S]*?)<\/ol>/g, (_, inner) => {
        let counter = 0;
        return `<ol>${inner.replace(/<li>/g, () => `<li>${++counter}. `)}</ol>`;
    });
    telegramHtml = telegramHtml.replace(/<li>(?!\d+\. )/g, "<li>• ");

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
            // ul/ol/li tags are dropped by allowedTags; their text markers are
            // injected BEFORE sanitizing (see above)
            ul: () => "",
            ol: () => "",
            hr: () => "\n",
            br: () => "\n",
            div: () => "",
        },
    });

    return telegramHtml.replaceAll(/\n[\s\n]*\n/g, "\n").trim();
};

export default toPlainString;
