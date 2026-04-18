/**
 * Standalone script that copies packages/*.md files with added frontmatter
 * to ./docs/packages directory.
 */

import { glob } from "glob";
import { mkdir, readFile, writeFile, rm } from "fs/promises";
import { existsSync } from "fs";
import { str } from "functools-kit";
import { join } from "path";

const OUTPUT_DIR = "./docs/packages";
const CLI_OUTPUT_DIR = "./docs/cli";
const BEGIN_OUTPUT_DIR = "./docs/begin";

const files = await glob("./packages/**/readme.md", { nodir: true, ignore: "**/node_modules/**" });
const cliFiles = await glob("./cli/README.md", { nodir: true });
const beginFiles = await glob("./example/docs/*.md", { nodir: true });

if (existsSync(OUTPUT_DIR)) {
    await rm(OUTPUT_DIR, { recursive: true });
}
await mkdir(OUTPUT_DIR, { recursive: true });

if (existsSync(CLI_OUTPUT_DIR)) {
    await rm(CLI_OUTPUT_DIR, { recursive: true });
}
await mkdir(CLI_OUTPUT_DIR, { recursive: true });

if (existsSync(BEGIN_OUTPUT_DIR)) {
    await rm(BEGIN_OUTPUT_DIR, { recursive: true });
}
await mkdir(BEGIN_OUTPUT_DIR, { recursive: true });

await Promise.all(files.map(async (filePath) => {
    const content = await readFile(filePath, "utf-8");

    // Extract package name from path
    const parts = filePath.replace(/\\/g, "/").split("/");
    const packagesIdx = parts.indexOf("packages");
    const packageName = parts[packagesIdx + 1] || "unknown";

    // Create output filename
    const outputName = filePath
        .replace(/\\/g, "/")
        .replace("./packages/", "")
        .replace(/\//g, "_")
        .replace(/readme\.md$/i, `${packageName}.md`);

    const outputPath = join(OUTPUT_DIR, outputName);

    // Add frontmatter if not present
    const hasFrontmatter = content.trimStart().startsWith("---");
    const newContent = hasFrontmatter
        ? content
        : str.newline(
            `---`,
            `title: packages/${packageName}/readme`,
            `group: packages/${packageName}`,
            `---`,
            ``,
            content
        );

    await writeFile(outputPath, newContent, "utf-8");
}));

await Promise.all(cliFiles.map(async (filePath) => {
    const content = await readFile(filePath, "utf-8");

    const outputPath = join(CLI_OUTPUT_DIR, "cli.md");

    const hasFrontmatter = content.trimStart().startsWith("---");
    const newContent = hasFrontmatter
        ? content
        : str.newline(
            `---`,
            `title: cli/readme`,
            `group: cli`,
            `---`,
            ``,
            content
        );

    await writeFile(outputPath, newContent, "utf-8");
}));

// begin/00-readme — example project README
{
    const readmeContent = await readFile("./example/README.md", "utf-8");
    const hasFrontmatter = readmeContent.trimStart().startsWith("---");
    const newContent = hasFrontmatter
        ? readmeContent
        : str.newline(
            `---`,
            `title: begin/00_readme`,
            `group: begin`,
            `---`,
            ``,
            readmeContent
        );
    await writeFile(join(BEGIN_OUTPUT_DIR, "00-readme.md"), newContent, "utf-8");
}

// begin/NN-slug — copied from example/docs/*.md (source files, already have frontmatter)
await Promise.all(beginFiles.map(async (filePath) => {
    const content = await readFile(filePath, "utf-8");
    const fileName = filePath.replace(/\\/g, "/").split("/").pop();
    await writeFile(join(BEGIN_OUTPUT_DIR, fileName), content, "utf-8");
}));

console.log(`[typedoc-packages-docs] Prepared ${files.length} package docs in ${OUTPUT_DIR}`);
