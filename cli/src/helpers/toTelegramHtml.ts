import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";

import { JSDOM } from "jsdom";
import { typo } from "functools-kit";

const TELEGAM_MAX_SYMBOLS = 4090;
const TELEGRAM_SYMBOL_RESERVED = 96;

// Function to convert Markdown to Telegram-compatible HTML
export function toTelegramHtml(markdown: string): string {

  const maxChars = TELEGAM_MAX_SYMBOLS - TELEGRAM_SYMBOL_RESERVED;

  // Initialize markdown-it with options
  const md = new MarkdownIt({
    html: false,
    breaks: true,
    linkify: true,
    typographer: true,
  });

  // Prevent removing of \u00a0
  markdown = markdown.replaceAll(typo.nbsp, "&nbsp;")
  markdown = markdown.replaceAll(typo.bullet, "&bull;")

  // Render Markdown to HTML
  let telegramHtml = md.render(markdown);

  // Post-process with sanitize-html to ensure Telegram compatibility
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
      a: ["href"], // Allow href for links
    },
    transformTags: {
      // Transform headings to bold text
      h1: "b",
      h2: "b",
      h3: "b",
      h4: "b",
      h5: "b",
      h6: "b",
      // Transform strong to b
      strong: "b",
      // Transform em to i
      em: "i",
      // Remove p tags, replace with newlines
      p: () => "",
      // Emulate unordered lists with bullets
      ul: () => "",
      li: () => "- ",
      // Emulate ordered lists with numbers
      ol: () => "",
      // Remove hr, replace with text-based separator
      hr: () => "\n",
      // Remove br, replace with text-based separator
      br: () => "\n",
      // Remove divs
      div: () => "",
    },
  });

  {
    telegramHtml = telegramHtml.replaceAll(typo.bullet, "#").trim();
  }

  {
    telegramHtml = telegramHtml.replaceAll(typo.nbsp, "<br>\n").trim();
    telegramHtml = telegramHtml.replaceAll(/\n[\s\n]*\n/g, "\n").trim();
    telegramHtml = telegramHtml.replaceAll("<br>", "").trim();
  }

  // Check Telegram message length limit (4096 characters)
  if (telegramHtml.length > maxChars) {
    console.warn("HTML exceeds Telegram's 4096-character limit. Truncating...");
    telegramHtml = telegramHtml.substring(0, maxChars);
  }

  const telegramDom = new JSDOM(telegramHtml, {
    contentType: "text/html",
    resources: "usable",
    runScripts: "outside-only",
    pretendToBeVisual: false,
  });

  const document = telegramDom.window.document;

  const fragment = document.createDocumentFragment();
  const body = document.body;
  while (body.firstChild) {
    fragment.appendChild(body.firstChild);
  }

  const tempDiv = document.createElement("div");
  tempDiv.appendChild(fragment);

  return tempDiv.innerHTML;
}

export default toTelegramHtml;
