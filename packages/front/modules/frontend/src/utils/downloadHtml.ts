import html2pdf from "html2pdf.js";
import sanitize from "../config/sanitize";

declare global {
    interface HTMLDivElement {
        setHTML(...args: any): any;
    }
}

export async function downloadHtml(content: string) {
    if (!content) {
        return;
    }

    // Create a temporary container for the HTML
    const element = document.createElement("div");

    if ("Sanitizer" in window) {
        const sanitizer = new window.Sanitizer(sanitize);
        element.setHTML(content, { sanitizer });
        return element.innerHTML;
    } else {
        element.innerHTML = content;
        element.style.padding = "20px";
        element.style.fontFamily = "Arial, sans-serif";
    }

    // Configure html2pdf options
    const opt = {
        margin: 1,
        filename: "document.pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
    };

    // Generate PDF and get the jsPDF output as a Blob
    await html2pdf()
        .from(element)
        .set(opt)
        .output("blob")
        .then((blob) => {
            // Create a downloadable link
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "document.pdf";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        })
        .catch((err) => console.error("PDF generation failed:", err));
}

export default downloadHtml;
