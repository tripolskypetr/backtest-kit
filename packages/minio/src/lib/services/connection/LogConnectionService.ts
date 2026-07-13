import BaseMap from "../../common/BaseMap";
import { getRedis } from "../../../config/redis";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../base/LoggerService";
import { alignToInterval } from "backtest-kit";

const REDIS_KEY = "log-items-connection";

const MS_PER_MINUTE = 60_000;

/** Minutes probed per pipeline round trip while walking backwards. */
const WALK_BATCH_SIZE = 1_000;

/** Sets up to this cardinality are fetched with a single SMEMBERS. */
const SMALL_SET_THRESHOLD = 1_000;

/** Page size for SSCAN over hot minute sets. */
const SSCAN_BATCH_SIZE = 1_000;

const TIMESTAMP_PAD = String(Number.MAX_SAFE_INTEGER).length;

const GET_MINUTE_KEY_FN = (connectionKey: string, minute: number) => {
    return `${connectionKey}:${String(minute).padStart(TIMESTAMP_PAD, "0")}`;
}

const GET_FLOOR_KEY_FN = (connectionKey: string) => {
    return `${connectionKey}:floor`;
}

export class LogConnectionService extends BaseMap(REDIS_KEY, -1) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public register = async (objectName: string): Promise<void> => {
    this.loggerService.log("logConnectionService register", { objectName });
    const redis = await getRedis();
    // One Redis SET per minute: SADD deduplicates repeated names, the floor
    // marker (first-ever minute) bounds the backwards walk in listNewest
    const minute = alignToInterval(new Date(), "1m").getTime();
    await redis
      .pipeline()
      .sadd(GET_MINUTE_KEY_FN(this.connectionKey, minute), objectName)
      .setnx(GET_FLOOR_KEY_FN(this.connectionKey), String(minute))
      .exec();
  };

  public listNewest = async (limit: number, prefix = ""): Promise<string[]> => {
    this.loggerService.log("logConnectionService listNewest", { limit, prefix });
    const redis = await getRedis();
    const floorRaw = await redis.get(GET_FLOOR_KEY_FN(this.connectionKey));
    if (!floorRaw) {
      return [];
    }
    const floor = Number(floorRaw);
    // We know the current time — walk backwards minute by minute with direct
    // key lookups (no SCAN over the keyspace), pipelined per WALK_BATCH_SIZE
    let minute = alignToInterval(new Date(), "1m").getTime();
    const seen = new Set<string>();
    const names: string[] = [];

    const collect = (members: string[]): boolean => {
      for (const name of members) {
        if (prefix && !name.startsWith(prefix)) {
          continue;
        }
        if (seen.has(name)) {
          continue;
        }
        seen.add(name);
        names.push(name);
        if (names.length >= limit) {
          return true;
        }
      }
      return false;
    };

    while (minute >= floor && names.length < limit) {
      const batch: number[] = [];
      while (batch.length < WALK_BATCH_SIZE && minute >= floor) {
        batch.push(minute);
        minute -= MS_PER_MINUTE;
      }
      // Cheap cardinality probe: empty minutes are skipped without
      // transferring a single member
      const cardPipeline = redis.pipeline();
      for (const ts of batch) {
        cardPipeline.scard(GET_MINUTE_KEY_FN(this.connectionKey, ts));
      }
      const cards = await cardPipeline.exec();
      if (!cards) {
        break;
      }
      // Pipeline results follow command order: minutes descend, newest first
      for (let i = 0; i < batch.length; i++) {
        const [error, card] = cards[i];
        if (error || !card) {
          continue;
        }
        const minuteKey = GET_MINUTE_KEY_FN(this.connectionKey, batch[i]);
        if ((card as number) <= SMALL_SET_THRESHOLD) {
          if (collect(await redis.smembers(minuteKey))) {
            return names;
          }
          continue;
        }
        // Hot minute (a fast backtest replay packs many records into one
        // wall-clock minute): page through SSCAN with early exit instead of
        // pulling the whole set in a single SMEMBERS
        let cursor: string | number = 0;
        while (true) {
          const [nextCursor, members] = await redis.sscan(minuteKey, cursor, "COUNT", SSCAN_BATCH_SIZE);
          cursor = nextCursor;
          if (collect(members)) {
            return names;
          }
          if (cursor === "0" || cursor === 0) {
            break;
          }
        }
      }
    }
    return names;
  };
}

export default LogConnectionService;
