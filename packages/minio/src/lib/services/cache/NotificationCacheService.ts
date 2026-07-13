import BaseMap from "../../common/BaseMap";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../base/LoggerService";
import { INotificationRow } from "../../../schema/Notification.schema";

const REDIS_KEY = "notification_cache";

export class NotificationCacheService extends BaseMap(REDIS_KEY, -1) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _cacheKey(backtest: boolean, notificationId: string): string {
    return `${backtest ? "backtest" : "live"}:${notificationId}`;
  }

  public async hasNotificationId(backtest: boolean, notificationId: string): Promise<boolean> {
    this.loggerService.log("notificationCacheService hasNotificationId", { backtest, notificationId });
    return await this.has(this._cacheKey(backtest, notificationId));
  }

  public async getNotificationId(backtest: boolean, notificationId: string): Promise<string | null> {
    this.loggerService.log("notificationCacheService getNotificationId", { backtest, notificationId });
    const id = <string>await super.get(this._cacheKey(backtest, notificationId));
    return id ?? null;
  }

  public async setNotificationId(row: INotificationRow): Promise<string> {
    this.loggerService.log("notificationCacheService setNotificationId", {
      backtest: row.backtest,
      notificationId: row.notificationId,
    });
    await super.set(this._cacheKey(row.backtest, row.notificationId), row.id);
    return row.id;
  }
}

export default NotificationCacheService;
