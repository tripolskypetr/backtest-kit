import { singleshot } from "functools-kit";
import ioc from "../lib";

export const waitForInit = singleshot(
  async () => {
    await ioc.redisService.waitForInit();
  }
);
