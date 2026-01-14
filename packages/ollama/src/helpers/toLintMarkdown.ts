import { lint } from "markdownlint/promise";
import { applyFixes } from "markdownlint";

export const toLintMarkdown = async (content: string) => {
  if (!content) {
    return "";
  }
  const { content: errors } = await lint({ strings: { content } });
  if (!errors.length) {
    return content;
  }
  const value = applyFixes(content, errors);
  return value ? value : content;
};
