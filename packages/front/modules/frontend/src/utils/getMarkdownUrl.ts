import html2pdf from "html2pdf.js";
import { applyFixes } from "markdownlint";
import { lint } from "markdownlint/promise";
import { marked } from "marked";
import { ioc } from "../lib";

export async function getMarkdownUrl(content: string) {
    if (!content) {
        return;
    }

    const getMarkdown = async () => {
        const { content: errors } = await lint({ strings: { content } });
        if (!errors.length) {
            return content;
        }
        return applyFixes(content, errors);
    };

    const markdown = await getMarkdown();
    const blob = new Blob([markdown], { type: 'text/markdown' });

    const url = URL.createObjectURL(blob);
    const un = ioc.routerService.listen(() => {
        URL.revokeObjectURL(url);
        un();
    })
    return url;
}

export default getMarkdownUrl;
