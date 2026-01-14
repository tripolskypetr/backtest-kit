import { lint } from "markdownlint/promise";
import { applyFixes } from "markdownlint";

/**
 * Lints and auto-fixes markdown content using markdownlint rules.
 *
 * Validates markdown syntax and applies automatic fixes for common issues
 * like inconsistent list markers, trailing spaces, and heading styles.
 * Returns the original content if no errors found or fixes cannot be applied.
 *
 * @param content - Raw markdown content to lint
 * @returns Promise resolving to linted markdown content
 *
 * @example
 * ```typescript
 * const markdown = "# Title\n\n\n## Subtitle"; // Multiple blank lines
 * const linted = await toLintMarkdown(markdown);
 * // Returns: "# Title\n\n## Subtitle" (extra blank line removed)
 * ```
 */
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
