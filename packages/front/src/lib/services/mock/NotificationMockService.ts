import fs from "fs/promises";

import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { inject } from "../../../lib/core/di";
import { NotificationModel } from "backtest-kit";
import { singleshot } from "functools-kit";

const MOCK_PATH = "./mock/notifications.json";

const READ_NOTIFICATION_LIST_FN = singleshot(
  async (): Promise<NotificationModel[]> => {
    const data = await fs.readFile(MOCK_PATH, "utf-8");
    return JSON.parse(data);
  },
);

export class NotificationMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getList = async () => {
    this.loggerService.log("notificationMockService getList");
    return await READ_NOTIFICATION_LIST_FN();
  };

  public getOne = async (id: string) => {
    this.loggerService.log("notificationMockService getOne");
    const notificationList = await this.getList();
    return notificationList.find((item) => item.id === id) ?? null;
  };
}

export default NotificationMockService;
