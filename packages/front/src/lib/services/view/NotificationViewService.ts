import { Notification } from "backtest-kit";
import { singleshot } from "functools-kit";

import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { inject } from "../../../lib/core/di";

export class NotificationViewService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getData = async () => {
    this.loggerService.log("notificationViewService getData");
    return await Notification.getData();
  };

  protected init = singleshot(async () => {
    this.loggerService.log("notificationViewService init");
    Notification.enable();
  });
}

export default NotificationViewService;
