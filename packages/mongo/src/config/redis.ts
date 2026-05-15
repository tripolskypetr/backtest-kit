import { singleshot } from "functools-kit";
import { Redis } from "ioredis";
import { getConfig } from "./params";

export const getRedis = singleshot(() => {

  const GLOBAL_CONFIG = getConfig();

  const redis = new Redis({
    host: GLOBAL_CONFIG.CC_REDIS_HOST,
    port: GLOBAL_CONFIG.CC_REDIS_PORT,
    username: GLOBAL_CONFIG.CC_REDIS_USER,
    password: GLOBAL_CONFIG.CC_REDIS_PASSWORD,
  });

  setInterval(async () => {
    await redis.ping();
  }, 30000);

  process.on("SIGINT", async () => {
    await redis.disconnect(false);
  });

  return redis;
});
