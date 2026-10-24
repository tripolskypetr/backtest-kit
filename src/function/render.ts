import { readFile } from "fs/promises";
import { memoize, singleshot } from "functools-kit";
import { createRequire } from "module";
import backtest from "../lib";

const METHOD_NAME_RENDER_TEMPLATE = "function.render.renderMustache";

/**
 * CommonJS `require` bound to this module. The library ships as ESM and CJS;
 * in the ESM build the global `require` does not exist, so the CJS loader of
 * the optional `mustache` dependency is built explicitly from `import.meta.url`
 * (rollup rewrites it to `__filename` in the CJS output).
 */
const require = createRequire(import.meta.url);

/**
 * Loads `mustache` through CommonJS. Resolves to the module (`{ render }`) or
 * to `null` when the package is not installed.
 */
const REQUIRE_MUSTACHE_FACTORY = async () => {
  try {
    return require("mustache");
  } catch {
    return null;
  }
};

/**
 * Loads `mustache` through a dynamic `import()`. The package's ESM entry
 * (`mustache.mjs`) has a default export only, so the namespace carries no
 * `render`: the default is unwrapped. Resolves to `null` when the package is
 * not installed.
 */
const ESM_MUSTACHE_FACTORY = async () => {
    try {
        const module = await import("mustache");
        return module.default ?? module;
    } catch {
        return null;
    }
};

/**
 * Resolves the `mustache` module once per process: CommonJS first, then ESM.
 * `mustache` is an optional dependency, so a missing package is reported with
 * an install hint instead of a resolution error; the singleshot is cleared on
 * failure so a later call retries after the package has been installed.
 *
 * @throws {Error} When `mustache` cannot be loaded by either loader
 */
const getMustache = singleshot(async () => {
    let mustache = null;
    if (mustache = await REQUIRE_MUSTACHE_FACTORY()) {
        return mustache
    }
    if (mustache = await ESM_MUSTACHE_FACTORY()) {
        return mustache;
    }
    getMustache.clear();
    throw new Error("Mustache module not found. Please install it using 'npm install mustache' or 'yarn add mustache'.");
});

/**
 * Reads a template file once per path and keeps its content for the lifetime of
 * the process: a template edited on disk is picked up only after a restart.
 * A failed read is not cached (the memo is cleared and the error rethrown), so
 * the next call reads the file again.
 */
const getTemplate = memoize(
  ([path]) => `${path}`,
  async (path: string) => {
    try {
      return await readFile(path, "utf-8");
    } catch (error) {
      getTemplate.clear();
      throw error;
    }
  },
);

/**
 * Renders a Mustache template file with the given view.
 *
 * The template is read from `path` (relative to the current working directory
 * or absolute) and cached per path; `mustache` itself is an optional
 * dependency resolved on the first call. Rendering uses Mustache defaults:
 * `{{name}}` HTML-escapes the value (`&`, `<`, `>`, `"`, `'`), `{{{name}}}`
 * inserts it verbatim. Templates that produce plain text or markdown (an LLM
 * prompt, a report) should use the triple form for free-text values.
 *
 * @param path - Path of the template file
 * @param view - Values the template refers to (default: `{}`)
 * @returns Promise resolving to the rendered string
 * @throws {Error} When `mustache` is not installed, or when the template file cannot be read
 *
 * @example
 * ```typescript
 * import { renderMustache } from "backtest-kit";
 *
 * // ./prompts/signal.mustache: "Analyze {{symbol}} at {{{price}}} USD"
 * const prompt = await renderMustache("./prompts/signal.mustache", {
 *   symbol: "BTCUSDT",
 *   price: 50_000,
 * });
 * ```
 */
export async function renderMustache(path: string, view: any = {}) {
  backtest.loggerService.log(METHOD_NAME_RENDER_TEMPLATE, {
    path,
    view,
  });
  const mustache = await getMustache();
  const template = await getTemplate(path);
  return mustache.render(template, view);
};
