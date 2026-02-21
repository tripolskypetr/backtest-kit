import { singleshot } from "functools-kit";

export const notifyShutdown = singleshot(async () => {
  console.log("Graceful shutdown initiated. Press Ctrl+C again to force quit.");
})

export default notifyShutdown;
