import fs from "fs/promises";

import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { inject } from "../../../lib/core/di";
import { NotificationModel } from "backtest-kit";
import { pickDocuments, singleshot } from "functools-kit";

const MOCK_PATH = "./mock/notifications.json";

const READ_NOTIFICATION_LIST_FN = singleshot(
  async (): Promise<NotificationModel[]> => {
    const data = await fs.readFile(MOCK_PATH, "utf-8");
    return JSON.parse(data);
  },
);

const DEFAULT_LIMIT = 25;
const DEFAULT_OFFSET = 0;

const CREATE_FILTER_LIST_FN = <T extends object = Record<string, string>>(
  filterData: T,
) =>
  Object.keys(filterData).map(
    (key) => (row) => new RegExp(filterData[key], "i").test(row[key]),
  );

export class NotificationMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public findByFilter = async <T extends object = Record<string, string>>(
    filterData: T,
    limit = DEFAULT_LIMIT,
    offset = DEFAULT_OFFSET,
  ) => {
    this.loggerService.log("notificationMockService findByFilter", {
      filterData,
      limit,
      offset,
    });
    const iter = pickDocuments<NotificationModel>(limit, offset);
    const filterList = CREATE_FILTER_LIST_FN<T>(filterData);
    for (const notification of await this.getList()) {
      let isOk = true;
      for (const filterFn of filterList) {
        isOk = isOk && filterFn(notification);
      }
      if (!isOk) {
        continue;
      }
      if (iter([notification]).done) {
        break;
      }
    }
    return iter().rows;
  };

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
