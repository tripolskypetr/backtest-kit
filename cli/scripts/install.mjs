import pkg from "./package.json" with { type: 'json' };
import { spawn } from "child_process";

function runNpmInstall(cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(npm, [`install`, `-g`, `@tradeforge/cli@${pkg.version}`, `--verbose`], { cwd, stdio: "inherit", shell: true });
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

await runNpmInstall();
