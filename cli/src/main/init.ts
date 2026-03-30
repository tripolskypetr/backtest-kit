import { copyFile, mkdir, readdir, readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import Mustache from "mustache";
import { getArgs } from "../helpers/getArgs";
import getEntry from "../helpers/getEntry";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MUSTACHE_EXT = ".mustache";

async function isDirEmpty(dirPath: string): Promise<boolean> {
  try {
    const files = await readdir(dirPath);
    return files.length === 0;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return true;
    }
    throw error;
  }
}

async function copyDir(
  srcDir: string,
  destDir: string,
  data: Record<string, string>,
): Promise<void> {
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, join(destDir, entry.name), data);
      continue;
    }
    if (entry.name.endsWith(MUSTACHE_EXT)) {
      const destName = entry.name.slice(0, -MUSTACHE_EXT.length);
      const destPath = join(destDir, destName);
      const template = await readFile(srcPath, "utf-8");
      const rendered = Mustache.render(template, data);
      await writeFile(destPath, rendered, "utf-8");
      console.log(`  -> ${destPath}`);
    } else {
      const destPath = join(destDir, entry.name);
      await copyFile(srcPath, destPath);
      console.log(`  -> ${destPath}`);
    }
  }
}

function runScript(scriptPath: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const node = process.execPath;
    const child = spawn(node, [scriptPath], { cwd, stdio: "inherit" });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Script exited with code ${code}`));
        return;
      }
      resolve();
    });
    child.on("error", reject);
  });
}

export const main = async () => {
  if (!getEntry(import.meta.url)) {
    return;
  }

  const { values } = getArgs();

  if (!values.init) {
    return;
  }

  const projectName = <string>values.output || "backtest-kit-project";
  const projectPath = join(process.cwd(), projectName);
  const templatePath = join(__dirname, "../../template/project");

  const isEmpty = await isDirEmpty(projectPath);
  if (!isEmpty) {
    console.error(`Directory "${projectName}" already exists and is not empty.`);
    process.exit(1);
  }

  console.log(`Creating project in ${projectPath}`);
  await copyDir(templatePath, projectPath, { PROJECT_NAME: projectName });

  console.log(`Fetching docs...`);
  await runScript(join(projectPath, "scripts/fetch_docs.mjs"), projectPath);

  console.log(`Done! Project created at ${projectPath}`);
};

main();
