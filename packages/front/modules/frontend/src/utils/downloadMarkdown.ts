import html2pdf from "html2pdf.js";
import { applyFixes } from "markdownlint";
import { lint } from "markdownlint/promise";
import { marked } from "marked";
import { ioc } from "../lib";

export async function downloadMarkdown(content: string) {
    if (!content) {
        console.warn("No content provided for PDF export");
        return;
    }

    const getMarkdown = async () => {
        try {
            const { content: errors } = await lint({ strings: { content } });
            if (!errors.length) {
                return content;
            }
            const fixedContent = applyFixes(content, errors);
            return fixedContent || content;
        } catch (error) {
            console.error("Markdown linting failed:", error);
            return content;
        }
    };

    const markdown = await getMarkdown();

    // Configure marked to preserve single newlines
    marked.setOptions({
        breaks: true, // Treat single newlines as <br />
        gfm: true, // Enable GitHub Flavored Markdown
    });

    // Convert Markdown to HTML
    let htmlContent: string;
    try {
        htmlContent = await marked.parse(markdown);
    } catch (error) {
        console.error("Markdown parsing failed:", error);
        return;
    }

    // Create a temporary container for the HTML
    const element = document.createElement("div");
    element.innerHTML = htmlContent;

    // Apply consistent styling to match the Markdown component
    element.style.padding = "20px";
    element.style.fontFamily = "Arial, sans-serif";
    element.style.fontSize = "12pt";
    element.style.lineHeight = "1.5";

    // Style headers to match CustomHeader
    const headers = element.querySelectorAll("h1, h2, h3, h4, h5, h6");
    headers.forEach((header: HTMLDivElement) => {
        header.style.color = "#2196f3"; // Match CustomHeader color
        header.style.fontSize = "1.5em"; // Approximate h5 variant
        header.style.paddingTop = "8px";
        header.style.paddingBottom = "8px";
    });

    // Style bold text to match CustomStrong
    const strongs = element.querySelectorAll("strong");
    strongs.forEach((strong) => {
        strong.style.fontWeight = "bold";
        strong.style.display = "inline"; // Ensure inline display
    });

    // Style paragraphs to ensure consistent spacing
    const paragraphs = element.querySelectorAll("p");
    paragraphs.forEach((p) => {
        p.style.marginBottom = "12px";
    });

    // Style horizontal rules to match CustomDivider
    const hrs = element.querySelectorAll("hr");
    hrs.forEach((hr) => {
        hr.style.marginTop = "8px";
        hr.style.marginBottom = "16px";
        hr.style.border = "0";
        hr.style.borderTop = "1px solid #e0e0e0";
    });

    // Configure html2pdf options
    const opt = {
        margin: [0.5, 0.5, 0.5, 0.5], // Consistent margins
        filename: "document.pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
    };

    // Generate PDF and get the jsPDF output as a Blob
    try {
        await html2pdf()
            .from(element)
            .set(opt)
            .output("blob")
            .then((blob) => {
                const url = URL.createObjectURL(blob);
                
                const un = ioc.routerService.listen(() => {
                    URL.revokeObjectURL(url);
                    un();
                });

                ioc.layoutService.downloadFile(url, "document.pdf");
            });
    } catch (err) {
        console.error("PDF generation failed:", err);
    }
}

export default downloadMarkdown;
