import { singleshot } from "functools-kit";

export const notifyShutdown = singleshot(async () => {
  console.log("Graceful shutdown initiated.");
})

export default notifyShutdown;
