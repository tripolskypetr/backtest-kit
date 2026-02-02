import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";

export const toPlainString = (content: string): string => {
    const md = new MarkdownIt({
        html: false,
        breaks: true,
        linkify: true,
        typographer: true,
    });

    let telegramHtml = md.render(content);

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
