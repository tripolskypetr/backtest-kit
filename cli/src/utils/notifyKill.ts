import { singleshot, sleep } from "functools-kit";
import treeKill from "../helpers/treeKill";

const DRAIN_MAX_AWAIT = 250;

const drainStream = (stream: NodeJS.WriteStream): Promise<void> =>
  new Promise((resolve) => {
    if (stream.writableLength === 0) {
      stream.write("", () => resolve());
      return;
    }
    stream.once("drain", () => {
      stream.write("", () => resolve());
    });
  });

const flushStream = (stream: NodeJS.WriteStream): Promise<void> => {
  const handle = (stream as any)._handle;
  if (handle && typeof handle.setBlocking === "function") {
    handle.setBlocking(true);
    return new Promise((resolve) => stream.write("", () => resolve()));
  }
  return drainStream(stream);
};

export const kill = singleshot(async (code = -1) => {
  await Promise.race([
    Promise.all([
      flushStream(process.stdout),
      flushStream(process.stderr)
    ]),
    sleep(DRAIN_MAX_AWAIT),
  ]);
  treeKill(process.pid, "SIGKILL", () => {
    process.exit(code);
  });
});

export const notifyKill = singleshot(() => {
  console.log("Press Ctrl+C again to force quit.");
  process.on("SIGINT", () => kill());
});

export default notifyKill;
