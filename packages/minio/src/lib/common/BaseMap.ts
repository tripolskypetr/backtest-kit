import { factory } from "di-factory";
import { getRedis } from "../../config/redis";
import { inject } from "../core/di";
import LoggerService from "../services/base/LoggerService";
import TYPES from "../core/types";

const ITERATOR_BATCH_SIZE = 100;
const DEFAULT_TTL_EXPIRE_SECONDS = 5 * 60;

export const BaseMap = factory(
  class BaseMap {
    readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    constructor(
      readonly connectionKey: string,
      readonly ttlExpireSeconds: number = DEFAULT_TTL_EXPIRE_SECONDS
    ) {}

    _getItemKey(key: string): string {
      return `${this.connectionKey}:${key}`;
    }

    async set(key: string, value: unknown): Promise<void> {
      if (!key) throw new Error("Key cannot be empty");

      this.loggerService.info(`BaseMap set key=${key}`, { key, value });
      const redis = await getRedis();
      const itemKey = this._getItemKey(key);

      await redis.set(itemKey, value as string);

      if (this.ttlExpireSeconds !== -1) {
        await redis.expire(itemKey, this.ttlExpireSeconds);
      }
    }

    async get(key: string | null): Promise<unknown | null> {
      this.loggerService.info(`BaseMap get key=${key}`);
      if (key === null) {
        return null;
      }
      const redis = await getRedis();
      const value = await redis.get(this._getItemKey(key));
      return value ?? null;
    }

    async delete(key: string): Promise<void> {
      this.loggerService.info(`BaseMap delete key=${key}`);
      if (key === null) {
        return null;
      }
      const redis = await getRedis();
      await redis.del(this._getItemKey(key));
    }

    async has(key: string): Promise<boolean> {
      this.loggerService.info(`BaseMap has key=${key}`);
      if (key === null) {
        return false;
      }
      const redis = await getRedis();
      const exists = await redis.exists(this._getItemKey(key));
      return exists === 1;
    }

    async clear(): Promise<void> {
      this.loggerService.info(`BaseMap clear`);
      const redis = await getRedis();
      let cursor: string | number = 0;
      const pattern = `${this.connectionKey}:*`;

      while (true) {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", ITERATOR_BATCH_SIZE);
        cursor = nextCursor;

        if (keys?.length) {
          await redis.del(...keys);
        }

        if (cursor === "0" || cursor === 0) break;
      }
    }

    async toArray(): Promise<[string, unknown][]> {
      this.loggerService.info(`BaseMap toArray`);
      const redis = await getRedis();
      const result: [string, string][] = [];
      let cursor: string | number = 0;
      const pattern = `${this.connectionKey}:*`;

      while (true) {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", ITERATOR_BATCH_SIZE);
        cursor = nextCursor;

        if (keys?.length) {
          const values = await redis.mget(...keys);
          for (let i = 0; i < keys.length; i++) {
            if (typeof values[i] === "string") {
              const key = keys[i].substring(this.connectionKey.length + 1);
              result.push([key, values[i]!]);
            }
          }
        }

        if (cursor === "0" || cursor === 0) break;
      }

      return result;
    }

    async *iterate(): AsyncIterableIterator<readonly [string, unknown]> {
      this.loggerService.info(`BaseMap iterate`);
      const redis = await getRedis();
      let cursor: string | number = 0;
      const pattern = `${this.connectionKey}:*`;

      while (true) {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", ITERATOR_BATCH_SIZE);
        cursor = nextCursor;

        if (keys?.length) {
          const values = await redis.mget(...keys);
          for (let i = 0; i < keys.length; i++) {
            if (typeof values[i] === "string") {
              const key = keys[i].substring(this.connectionKey.length + 1);
              yield [key, values[i]!];
            }
          }
        }

        if (cursor === "0" || cursor === 0) break;
      }
    }

    async *keys(): AsyncIterableIterator<string> {
      this.loggerService.info(`BaseMap iterate keys`);
      const redis = await getRedis();
      let cursor: string | number = 0;
      const pattern = `${this.connectionKey}:*`;

      while (true) {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", ITERATOR_BATCH_SIZE);
        cursor = nextCursor;

        if (keys?.length) {
          for (const fullKey of keys) {
            const key = fullKey.substring(this.connectionKey.length + 1);
            yield key;
          }
        }

        if (cursor === "0" || cursor === 0) break;
      }
    }

    async *values(): AsyncIterableIterator<unknown> {
      this.loggerService.info(`BaseMap iterate values`);
      const redis = await getRedis();
      let cursor: string | number = 0;
      const pattern = `${this.connectionKey}:*`;

      while (true) {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", ITERATOR_BATCH_SIZE);
        cursor = nextCursor;

        if (keys?.length) {
          const values = await redis.mget(...keys);
          for (const value of values) {
            if (typeof value === "string") {
              yield value;
            }
          }
        }

        if (cursor === "0" || cursor === 0) break;
      }
    }

    async size(): Promise<number> {
      this.loggerService.info(`BaseMap size`);
      const redis = await getRedis();
      let cursor: string | number = 0;
      const pattern = `${this.connectionKey}:*`;
      let count = 0;

      while (true) {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", ITERATOR_BATCH_SIZE);
        cursor = nextCursor;
        count += keys.length;

        if (cursor === "0" || cursor === 0) break;
      }

      return count;
    }
  }
);

export type TBaseMap = InstanceType<ReturnType<typeof BaseMap>>;

export default BaseMap;
