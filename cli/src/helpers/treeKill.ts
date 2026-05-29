import { spawn, exec } from "child_process";

type Callback = (error?: Error) => void;

function killPid(pid: number, signal?: string | number): void {
  try {
    process.kill(pid, signal);
  } catch (err: any) {
    if (err.code !== "ESRCH") throw err;
  }
}

function killAll(
  tree: Record<number, number[]>,
  signal: string | number | undefined,
  callback?: Callback
): void {
  const killed: Record<number, boolean> = {};
  try {
    for (const pid of Object.keys(tree).map(Number)) {
      for (const child of tree[pid]) {
        if (!killed[child]) {
          killPid(child, signal);
          killed[child] = true;
        }
      }
      if (!killed[pid]) {
        killPid(pid, signal);
        killed[pid] = true;
      }
    }
  } catch (err: any) {
    if (callback) return callback(err);
    throw err;
  }
  callback?.();
}

function buildProcessTree(
  parentPid: number,
  tree: Record<number, number[]>,
  pidsToProcess: Record<number, number>,
  spawnList: (pid: number) => ReturnType<typeof spawn>,
  cb: () => void
): void {
  const ps = spawnList(parentPid);
  let allData = "";

  ps.stdout!.on("data", (data: Buffer) => {
    allData += data.toString("ascii");
  });

  ps.on("close", (code: number) => {
    delete pidsToProcess[parentPid];

    if (code !== 0) {
      if (Object.keys(pidsToProcess).length === 0) cb();
      return;
    }

    const matches = allData.match(/\d+/g);
    if (matches) {
      for (const pidStr of matches) {
        const pid = parseInt(pidStr, 10);
        tree[parentPid].push(pid);
        tree[pid] = [];
        pidsToProcess[pid] = 1;
        buildProcessTree(pid, tree, pidsToProcess, spawnList, cb);
      }
    }
  });
}

export function treeKill(pid: number, callback?: Callback): void;
export function treeKill(pid: number, signal?: string | number, callback?: Callback): void;
export function treeKill(
  pid: number,
  signalOrCallback?: string | number | Callback,
  callback?: Callback
): void {
  let signal: string | number | undefined;

  if (typeof signalOrCallback === "function") {
    callback = signalOrCallback;
    signal = undefined;
  } else {
    signal = signalOrCallback;
  }

  pid = parseInt(pid as any, 10);
  if (Number.isNaN(pid)) {
    const err = new Error("pid must be a number");
    if (callback) return callback(err);
    throw err;
  }

  const tree: Record<number, number[]> = { [pid]: [] };
  const pidsToProcess: Record<number, number> = { [pid]: 1 };

  switch (process.platform) {
    case "win32":
      exec(`taskkill /pid ${pid} /T /F`, (err) => callback?.(err ?? undefined));
      break;

    case "darwin":
      buildProcessTree(
        pid,
        tree,
        pidsToProcess,
        (parentPid) => spawn("pgrep", ["-P", String(parentPid)]),
        () => killAll(tree, signal, callback)
      );
      break;

    default: // Linux
      buildProcessTree(
        pid,
        tree,
        pidsToProcess,
        (parentPid) => spawn("ps", ["-o", "pid", "--no-headers", "--ppid", String(parentPid)]),
        () => killAll(tree, signal, callback)
      );
      break;
  }
}

export default treeKill;
