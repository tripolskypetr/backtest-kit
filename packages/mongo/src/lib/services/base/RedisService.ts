import { Redis } from "ioredis";
import {
  singleshot,
  sleep,
} from "functools-kit";
import { getRedis } from "../../../config/redis";
import { inject } from "../../core/di";
import LoggerService from "./LoggerService";
import TYPES from "../../core/types";

const CONNECTION_TIMEOUT = 15_000;
const TIMEOUT_SYMBOL = Symbol('timeout');

const waitForConnect = (redis: Redis, self: RedisService) => new Promise<void>((resolve) => {
  redis.on('ready', () => {
    self.loggerService.log("redisService ready");
    resolve();
  });
});

export class RedisService {

  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public waitForInit = singleshot(async () => {
    this.loggerService.log("redisService waitForInit");
    const redis = await getRedis();
    if (redis.status === 'ready') {
      return redis
    }
    const result = await Promise.race([
      waitForConnect(redis, this),
      sleep(CONNECTION_TIMEOUT).then(() => TIMEOUT_SYMBOL),
    ])
    if (result === TIMEOUT_SYMBOL) {
      this.waitForInit.clear();
      throw new Error("Redis connection timeout")
    }
    return redis;
  });

}

export default RedisService;
