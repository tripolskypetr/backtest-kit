import { singleshot } from "functools-kit";
import ioc from "../lib";

export const waitForInit = singleshot(
  async () => {
    await Promise.all([
      ioc.postgresService.waitForInit(),
      ioc.redisService.waitForInit(),
    ]);
  }
);
