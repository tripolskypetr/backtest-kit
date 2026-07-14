import { ILogRow } from "../../../schema/Log.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import LogConnectionService from "../connection/LogConnectionService";
import { ILogEntry } from "backtest-kit";
import BaseStorage from "../../common/BaseStorage";

const LIST_LIMIT = 200;

/**
 * Cap of the in-process index of already persisted keys. The library re-sends
 * the whole accumulated entry list on every write, so without this index each
 * write costs one stat per entry. FIFO eviction keeps memory bounded while
 * covering a window far larger than the library's own list cap.
 */
const PERSISTED_KEYS_LIMIT = 10_000;

const TIMESTAMP_PAD = String(Number.MAX_SAFE_INTEGER).length;

const GET_STORAGE_KEY_FN = (entryId: string, when: Date) => {
    const inverted = String(Number.MAX_SAFE_INTEGER - when.getTime()).padStart(TIMESTAMP_PAD, "0");
    return `${inverted}_${entryId}`;
}

export class LogDataService extends BaseStorage("backtest-kit/log-items") {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly logConnectionService = inject<LogConnectionService>(TYPES.logConnectionService);

  private _persistedKeys = new Set<string>();

  private _rememberKey(key: string): void {
    if (this._persistedKeys.size >= PERSISTED_KEYS_LIMIT) {
      const oldest = this._persistedKeys.values().next().value!;
      this._persistedKeys.delete(oldest);
    }
    this._persistedKeys.add(key);
  }

  public upsert = async (entryId: string, payload: ILogEntry): Promise<void> => {
    this.loggerService.log("logDataService upsert", { entryId });
    const key = GET_STORAGE_KEY_FN(entryId, new Date(payload.priority));
    if (this._persistedKeys.has(key)) {
      return;
    }
    if (await this.has(key)) {
      this._rememberKey(key);
      return;
    }
    const now = new Date();
    const row: ILogRow = {
      id: key,
      entryId,
      payload,
      createDate: now,
      updatedDate: now,
    };
    // MinIO first (source of truth), Redis index second: a crash in between
    // leaves the object readable by key but invisible to listAll — never a phantom
    await this.set(key, row);
    await this.logConnectionService.register(key);
    this._rememberKey(key);
  };

  public findByEntryId = async (entryId: string, when: Date): Promise<ILogRow | null> => {
    this.loggerService.log("logDataService findByEntryId", { entryId, when });
    return await this.get<ILogRow>(GET_STORAGE_KEY_FN(entryId, when));
  };

  public listAll = async (): Promise<ILogRow[]> => {
    this.loggerService.log("logDataService listAll");
    const rows: ILogRow[] = [];
    const names = await this.logConnectionService.listNewest(LIST_LIMIT);
    if (names.length) {
      for (const name of names) {
        const row = await this.get<ILogRow>(name);
        if (row) {
          rows.push(row);
        }
      }
    } else {
      // Cold index (flushed Redis): object keys embed an inverted timestamp,
      // so plain lexicographic listing is already newest-first — read the
      // newest window and warm the index back up
      for await (const value of this.values("", LIST_LIMIT)) {
        const row = value as ILogRow;
        rows.push(row);
        await this.logConnectionService.register(row.id);
        if (rows.length >= LIST_LIMIT) {
          break;
        }
      }
    }
    rows.sort((a, b) => new Date(b.createDate).getTime() - new Date(a.createDate).getTime());
    return rows.slice(0, LIST_LIMIT);
  };
}

export default LogDataService;
