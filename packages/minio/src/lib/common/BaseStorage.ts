import { factory } from "di-factory";
import { createAwaiter } from "functools-kit";
import { Readable } from "stream";

import { inject } from "../core/di";
import LoggerService from "../services/base/LoggerService";
import MinioService from "../services/base/MinioService";
import TYPES from "../core/types";

const NOT_FOUND_CODES = ["NoSuchKey", "NotFound"];

const DELETE_BATCH_SIZE = 1_000;

const isNotFound = (error: unknown): boolean =>
  NOT_FOUND_CODES.includes((error as { code?: string })?.code ?? "");

export const BaseStorage = factory(
  class BaseStorage {
    readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    readonly minioService = inject<MinioService>(TYPES.minioService);

    /**
     * Physical MinIO bucket: the first path segment of BUCKET_NAME.
     * S3 bucket names cannot contain slashes, so "backtest-kit/candle-items"
     * means bucket "backtest-kit" with root key prefix "candle-items/".
     */
    readonly bucketName: string;

    /** Root key prefix inside the bucket ("" when BUCKET_NAME has no parent folder). */
    readonly rootPrefix: string;

    constructor(public readonly BUCKET_NAME: string) {
      const [bucketName, ...folders] = BUCKET_NAME.split("/");
      this.bucketName = bucketName;
      this.rootPrefix = folders.length ? `${folders.join("/")}/` : "";
    }

    async set(key: string, value: unknown): Promise<void> {
      if (!key) throw new Error("Key cannot be empty");

      this.loggerService.info(`BaseStorage set key=${key}`, { key, value });
      const minioClient = await this.minioService.getClient(this.bucketName);
      const buffer = Buffer.from(JSON.stringify(value), "utf-8");

      await minioClient.putObject(this.bucketName, this.rootPrefix + key, buffer, buffer.length, {
        "Content-Type": "application/json",
      });
    }

    async get<T = unknown>(key: string | null): Promise<T | null> {
      this.loggerService.info(`BaseStorage get key=${key}`);
      if (key === null) {
        return null;
      }
      const minioClient = await this.minioService.getClient(this.bucketName);

      let dataStream: Readable;
      try {
        dataStream = await minioClient.getObject(this.bucketName, this.rootPrefix + key);
      } catch (error) {
        if (isNotFound(error)) {
          return null;
        }
        throw error;
      }

      const [awaiter, { resolve, reject }] = createAwaiter<Buffer>();
      {
        const chunks: Uint8Array[] = [];
        dataStream.on("data", (chunk: Uint8Array) => {
          chunks.push(chunk);
        });
        dataStream.on("end", () => {
          resolve(Buffer.concat(chunks));
        });
        dataStream.on("error", (error: Error) => {
          reject(error);
        });
      }
      const buffer = await awaiter;

      return JSON.parse(buffer.toString("utf-8")) as T;
    }

    async has(key: string): Promise<boolean> {
      this.loggerService.info(`BaseStorage has key=${key}`);
      if (key === null) {
        return false;
      }
      const minioClient = await this.minioService.getClient(this.bucketName);
      try {
        await minioClient.statObject(this.bucketName, this.rootPrefix + key);
        return true;
      } catch (error) {
        if (isNotFound(error)) {
          return false;
        }
        throw error;
      }
    }

    async delete(key: string): Promise<void> {
      this.loggerService.info(`BaseStorage delete key=${key}`);
      if (key === null) {
        return;
      }
      const minioClient = await this.minioService.getClient(this.bucketName);
      await minioClient.removeObject(this.bucketName, this.rootPrefix + key);
    }

    async clear(prefix = ""): Promise<void> {
      this.loggerService.info(`BaseStorage clear prefix=${prefix}`);
      const minioClient = await this.minioService.getClient(this.bucketName);
      // Stream the listing and delete in batches: memory stays O(batch), not O(bucket)
      let batch: string[] = [];
      for await (const key of this.keys(prefix)) {
        batch.push(this.rootPrefix + key);
        if (batch.length >= DELETE_BATCH_SIZE) {
          await minioClient.removeObjects(this.bucketName, batch);
          batch = [];
        }
      }
      if (batch.length) {
        await minioClient.removeObjects(this.bucketName, batch);
      }
    }

    async *keys(prefix = "", limit?: number): AsyncIterableIterator<string> {
      this.loggerService.info(`BaseStorage iterate keys prefix=${prefix} limit=${limit}`);
      const minioClient = await this.minioService.getClient(this.bucketName);
      const objectStream = minioClient.listObjectsV2(this.bucketName, this.rootPrefix + prefix, true);
      let count = 0;
      for await (const item of objectStream) {
        if (!item.name) {
          continue;
        }
        yield item.name.slice(this.rootPrefix.length);
        count += 1;
        if (limit !== undefined && count >= limit) {
          return;
        }
      }
    }

    async *values(prefix = "", limit?: number): AsyncIterableIterator<unknown> {
      this.loggerService.info(`BaseStorage iterate values prefix=${prefix} limit=${limit}`);
      for await (const key of this.keys(prefix, limit)) {
        const value = await this.get(key);
        if (value !== null) {
          yield value;
        }
      }
    }

    async *iterate(prefix = "", limit?: number): AsyncIterableIterator<readonly [string, unknown]> {
      this.loggerService.info(`BaseStorage iterate prefix=${prefix} limit=${limit}`);
      for await (const key of this.keys(prefix, limit)) {
        const value = await this.get(key);
        if (value !== null) {
          yield [key, value];
        }
      }
    }

    async toArray(prefix = ""): Promise<[string, unknown][]> {
      this.loggerService.info(`BaseStorage toArray prefix=${prefix}`);
      const result: [string, unknown][] = [];
      for await (const [key, value] of this.iterate(prefix)) {
        result.push([key, value]);
      }
      return result;
    }

    async size(prefix = ""): Promise<number> {
      this.loggerService.info(`BaseStorage size prefix=${prefix}`);
      let count = 0;
      for await (const _ of this.keys(prefix)) {
        count += 1;
      }
      return count;
    }
  }
);

export type TBaseStorage = InstanceType<ReturnType<typeof BaseStorage>>;

export default BaseStorage;
