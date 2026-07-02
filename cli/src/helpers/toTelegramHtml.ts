import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";

import { JSDOM } from "jsdom";
import { typo } from "functools-kit";

const TELEGRAM_MAX_SYMBOLS = 4090;
const TELEGRAM_SYMBOL_RESERVED = 96;

/** Void tags never get a closing counterpart when balancing truncated HTML. */
const VOID_TAGS = new Set(["br"]);

/**
 * Truncates Telegram HTML without breaking it: a blunt substring could cut a
 * tag or entity in half and leave unbalanced tags — Telegram then rejects the
 * WHOLE message ("can't parse entities"), so the notification would be lost
 * instead of shortened. Closing tags appended here fit into
 * TELEGRAM_SYMBOL_RESERVED headroom.
 */
const truncateTelegramHtml = (html: string, maxChars: number): string => {
  let result = html.substring(0, maxChars);
  // Don't cut a tag in half
  const lastOpen = result.lastIndexOf("<");
  if (lastOpen > result.lastIndexOf(">")) {
    result = result.substring(0, lastOpen);
  }
  // Don't cut an HTML entity in half
  result = result.replace(/&[a-zA-Z0-9#]*$/, "");
  // Close tags left open by the cut (input is sanitize-html output — well-formed)
  const stack: string[] = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?>/g;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(result))) {
    const [, slash, rawName] = match;
    const name = rawName.toLowerCase();
    if (VOID_TAGS.has(name)) {
      continue;
    }
    if (slash) {
      const index = stack.lastIndexOf(name);
      if (index !== -1) {
        stack.splice(index, 1);
      }
    } else {
      stack.push(name);
    }
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    result += `</${stack[i]}>`;
  }
  return result;
};

// Function to convert Markdown to Telegram-compatible HTML
export function toTelegramHtml(markdown: string): string {

  const maxChars = TELEGRAM_MAX_SYMBOLS - TELEGRAM_SYMBOL_RESERVED;

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

  // List markers must be injected as TEXT inside <li> before sanitizing:
  // sanitize-html transformTags cannot insert text (a transform returning a
  // string like "- " is silently ignored), so list items were losing their
  // bullets/numbers entirely. Ordered lists get 1./2./..., unordered get "-".
  telegramHtml = telegramHtml.replace(/<ol>([\s\S]*?)<\/ol>/g, (_, inner) => {
    let counter = 0;
    return `<ol>${inner.replace(/<li>/g, () => `<li>${++counter}. `)}</ol>`;
  });
  telegramHtml = telegramHtml.replace(/<li>(?!\d+\. )/g, "<li>- ");

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
      // ul/ol/li tags are dropped by allowedTags; their text markers are injected
      // BEFORE sanitizing (see above) — a string-returning transform can't do it
      ul: () => "",
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
    telegramHtml = truncateTelegramHtml(telegramHtml, maxChars);
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
