import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

export async function runPythonStrategy(
  scriptPath: string,
  candles: unknown[]
): Promise<any> {
  const wasmPath = join(process.cwd(), "assets", "python.wasm");
  const wasmtime = join(process.env.HOME!, ".wasmtime", "bin", "wasmtime");

  const id = randomUUID();
  const tmp = tmpdir();
  const tmpScript = join(tmp, `strategy-${id}.py`);

  writeFileSync(tmpScript, readFileSync(scriptPath));

  return new Promise((resolve, reject) => {
    const proc = spawn(wasmtime, [
      "--dir", `${tmp}::/tmp`,
      wasmPath,
      "--",
      `/tmp/strategy-${id}.py`,
    ], { stdio: ["pipe", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));

    proc.on("close", (code) => {
      unlinkSync(tmpScript);
      if (code !== 0) return reject(new Error(`Python failed:\n${stderr}`));
      try { resolve(JSON.parse(stdout)); }
      catch { reject(new Error(`Bad JSON: ${stdout}`)); }
    });

    proc.stdin.write(JSON.stringify(candles));
    proc.stdin.end();
  });
}