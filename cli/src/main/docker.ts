import { copyFile, mkdir, readdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { getArgs } from "../helpers/getArgs";
import getEntry from "../helpers/getEntry";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

async function copyDir(srcDir: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, join(destDir, entry.name));
      continue;
    }
    if (entry.name === ".gitkeep") {
      continue;
    }
    const destPath = join(destDir, entry.name);
    await copyFile(srcPath, destPath);
    console.log(`  -> ${destPath}`);
  }
}

function runNpmInstall(cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(npm, ["install"], { cwd, stdio: "inherit", shell: true });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`npm install exited with code ${code}`));
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

  if (!values.docker) {
    return;
  }

  const projectName = <string>values.output || "backtest-kit-docker";
  const projectPath = join(process.cwd(), projectName);
  const templatePath = join(__dirname, "../docker");

  const isEmpty = await isDirEmpty(projectPath);
  if (!isEmpty) {
    console.error(`Directory "${projectName}" already exists and is not empty.`);
    process.exit(1);
  }

  console.log(`Creating Docker workspace in ${projectPath}`);
  await copyDir(templatePath, projectPath);

  console.log(`Installing env...`);
  await copyFile(join(projectPath, ".env.example"), join(projectPath, ".env"));
  console.log(`  -> ${join(projectPath, ".env")}`);

  console.log(`Installing dependencies...`);
  await runNpmInstall(projectPath);

  console.log(`Done! Docker workspace created at ${projectPath}`);
  console.log(`Next steps:`);
  console.log(`  cd ${projectName}`);
  console.log(`  MODE=live SYMBOL=TRXUSDT UI=1 docker compose up -d`);
  console.log(`  docker compose logs -f`);
  process.exit(0);
};

main();
