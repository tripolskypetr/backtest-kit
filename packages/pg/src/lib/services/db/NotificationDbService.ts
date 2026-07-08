import BaseCRUD from "../../common/BaseCRUD";
import { INotificationRow, NotificationModel } from "../../../schema/Notification.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import NotificationCacheService from "../cache/NotificationCacheService";
import { NotificationModel as NotificationPayload } from "backtest-kit";

const LIST_LIMIT = 200;

export class NotificationDbService extends BaseCRUD(NotificationModel) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly notificationCacheService = inject<NotificationCacheService>(TYPES.notificationCacheService);

  public upsert = async (
    backtest: boolean,
    notificationId: string,
    payload: NotificationPayload,
  ): Promise<void> => {
    this.loggerService.log("notificationDbService upsert", { backtest, notificationId });
    const repo = await this.repo<INotificationRow>();
    const { raw } = await repo
      .createQueryBuilder()
      .insert()
      .values({ backtest, notificationId, payload })
      .orUpdate(["payload"], ["backtest", "notificationId"])
      .returning("*")
      .execute();
    const result = raw[0] as INotificationRow;
    await this.notificationCacheService.setNotificationId(result);
  };

  public findByNotificationId = async (
    backtest: boolean,
    notificationId: string,
  ): Promise<INotificationRow | null> => {
    this.loggerService.log("notificationDbService findByNotificationId", { backtest, notificationId });
    const cachedId = await this.notificationCacheService.getNotificationId(backtest, notificationId);
    if (cachedId) {
      const cached = await super.findByFilter({ id: cachedId }) as INotificationRow | null;
      if (cached) {
        return cached;
      }
    }
    const result = await super.findByFilter({ backtest, notificationId }) as INotificationRow | null;
    if (result) {
      await this.notificationCacheService.setNotificationId(result);
    }
    return result;
  };

  public listByMode = async (backtest: boolean): Promise<INotificationRow[]> => {
    this.loggerService.log("notificationDbService listByMode", { backtest });
    return await super.findAll({ backtest }, LIST_LIMIT, { createDate: "DESC" }) as INotificationRow[];
  };
}

export default NotificationDbService;
