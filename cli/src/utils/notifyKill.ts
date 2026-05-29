import { singleshot } from "functools-kit";
import treeKill from "../helpers/treeKill";

export const kill = singleshot((code = -1) => {
  treeKill(process.pid, "SIGKILL", () => {
    process.exit(code);
  });
});

export const notifyKill = singleshot(() => {
  console.log("Press Ctrl+C again to force quit.");
  process.on("SIGINT", kill);
});

export default notifyKill;
