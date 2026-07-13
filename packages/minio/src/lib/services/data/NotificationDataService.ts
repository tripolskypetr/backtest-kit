import { INotificationRow } from "../../../schema/Notification.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import NotificationConnectionService from "../connection/NotificationConnectionService";
import { NotificationModel as NotificationPayload } from "backtest-kit";
import BaseStorage from "../../common/BaseStorage";

const LIST_LIMIT = 200;

/**
 * Cap of the in-process index of already persisted keys. The library re-sends
 * the whole accumulated notification list on every write, so without this
 * index each write costs one stat per notification. FIFO eviction keeps
 * memory bounded while covering a window far larger than the library's cap.
 */
const PERSISTED_KEYS_LIMIT = 10_000;

const TIMESTAMP_PAD = String(Number.MAX_SAFE_INTEGER).length;

const GET_STORAGE_KEY_FN = (backtest: boolean, notificationId: string, when: Date) => {
    const inverted = String(Number.MAX_SAFE_INTEGER - when.getTime()).padStart(TIMESTAMP_PAD, "0");
    return `${backtest}/${inverted}_${notificationId}`;
}

export class NotificationDataService extends BaseStorage("backtest-kit/notification-items") {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly notificationConnectionService = inject<NotificationConnectionService>(TYPES.notificationConnectionService);

  private _persistedKeys = new Set<string>();

  private _rememberKey(key: string): void {
    if (this._persistedKeys.size >= PERSISTED_KEYS_LIMIT) {
      const oldest = this._persistedKeys.values().next().value!;
      this._persistedKeys.delete(oldest);
    }
    this._persistedKeys.add(key);
  }

  public upsert = async (
    backtest: boolean,
    notificationId: string,
    payload: NotificationPayload,
  ): Promise<void> => {
    this.loggerService.log("notificationDataService upsert", { backtest, notificationId });
    // Key timestamp comes from the notification itself (stable across rewrites
    // of the accumulated list). Only error.* types lack createdAt, and those
    // never reach persistence.
    const createdAt = "createdAt" in payload ? payload.createdAt : Date.now();
    const key = GET_STORAGE_KEY_FN(backtest, notificationId, new Date(createdAt));
    // Notifications are immutable events: same id + same timestamp means the
    // same content, so an existing object never needs a rewrite.
    if (this._persistedKeys.has(key)) {
      return;
    }
    if (await this.has(key)) {
      this._rememberKey(key);
      return;
    }
    const now = new Date();
    const row: INotificationRow = {
      id: key,
      backtest,
      notificationId,
      payload,
      createDate: now,
      updatedDate: now,
    };
    // MinIO first (source of truth), Redis index second: a crash in between
    // leaves the object readable by key but invisible to listByMode — never a phantom
    await this.set(key, row);
    await this.notificationConnectionService.register(key);
    this._rememberKey(key);
  };

  public findByNotificationId = async (
    backtest: boolean,
    notificationId: string,
    when: Date,
  ): Promise<INotificationRow | null> => {
    this.loggerService.log("notificationDataService findByNotificationId", { backtest, notificationId, when });
    return await this.get<INotificationRow>(GET_STORAGE_KEY_FN(backtest, notificationId, when));
  };

  public listByMode = async (backtest: boolean): Promise<INotificationRow[]> => {
    this.loggerService.log("notificationDataService listByMode", { backtest });
    const rows: INotificationRow[] = [];
    const names = await this.notificationConnectionService.listNewest(LIST_LIMIT, `${backtest}/`);
    if (names.length) {
      for (const name of names) {
        const row = await this.get<INotificationRow>(name);
        if (row) {
          rows.push(row);
        }
      }
    } else {
      // Cold index (flushed Redis): object keys embed an inverted timestamp,
      // so plain lexicographic listing is already newest-first — read the
      // newest window and warm the index back up
      for await (const value of this.values(`${backtest}/`, LIST_LIMIT)) {
        const row = value as INotificationRow;
        rows.push(row);
        await this.notificationConnectionService.register(row.id);
        if (rows.length >= LIST_LIMIT) {
          break;
        }
      }
    }
    rows.sort((a, b) => new Date(b.createDate).getTime() - new Date(a.createDate).getTime());
    return rows.slice(0, LIST_LIMIT);
  };
}

export default NotificationDataService;
