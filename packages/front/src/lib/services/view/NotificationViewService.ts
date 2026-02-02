import { Notification } from "backtest-kit";
import { singleshot } from "functools-kit";

import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { inject } from "../../../lib/core/di";
import NotificationMockService from "../mock/NotificationMockService";
import { CC_ENABLE_MOCK } from "../../../config/params";

export class NotificationViewService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly notificationMockService = inject<NotificationMockService>(TYPES.notificationMockService);

  public getList = async () => {
    this.loggerService.log("notificationViewService getList");
    if (CC_ENABLE_MOCK) {
      return await this.notificationMockService.getList();
    }
    return await Notification.getData();
  };

  public getOne = async (id: string) => {
    this.loggerService.log("notificationViewService getOne", {
      id,
    });
    if (CC_ENABLE_MOCK) {
      return await this.notificationMockService.getOne(id);
    }
    const notificationList = await Notification.getData();
    return notificationList.find((item) => item.id === id) ?? null;
  };

  protected init = singleshot(async () => {
    this.loggerService.log("notificationViewService init");
    if (CC_ENABLE_MOCK) {
      return;
    }
    Notification.enable();
  });
}

export default NotificationViewService;
