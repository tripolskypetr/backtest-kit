import { Notification, NotificationModel } from "backtest-kit";
import { pickDocuments, singleshot } from "functools-kit";

import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { inject } from "../../../lib/core/di";
import NotificationMockService from "../mock/NotificationMockService";
import { CC_ENABLE_MOCK } from "../../../config/params";

const DEFAULT_LIMIT = 25;
const DEFAULT_OFFSET = 0;

const CREATE_FILTER_LIST_FN = <T extends object = Record<string, string>>(
  filterData: T,
) =>
  Object.keys(filterData).map(
    (key) => (row) => new RegExp(filterData[key], "i").test(row[key]),
  );

export class NotificationViewService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly notificationMockService = inject<NotificationMockService>(
    TYPES.notificationMockService,
  );

  public findByFilter = async <T extends object = Record<string, string>>(
    filterData: T,
    limit = DEFAULT_LIMIT,
    offset = DEFAULT_OFFSET,
  ) => {
    this.loggerService.log("notificationViewService findByFilter", {
      filterData,
      limit,
      offset,
    });
    if (CC_ENABLE_MOCK) {
      return await this.notificationMockService.findByFilter(
        filterData,
        limit,
        offset,
      );
    }
    if (!Notification.enable.hasValue()) {
      console.warn("@backtest-kit/ui notificationViewService findByFilter notifications not enabled");
      return [];
    }
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
    this.loggerService.log("notificationViewService getList");
    if (CC_ENABLE_MOCK) {
      return await this.notificationMockService.getList();
    }
    if (!Notification.enable.hasValue()) {
      console.warn("@backtest-kit/ui notificationViewService getList notifications not enabled");
      return [];
    }
    const notificationList: NotificationModel[] = [];
    for (const notification of await Notification.getData(false)) {
      notificationList.push(notification);
    }
    for (const notification of await Notification.getData(true)) {
      notificationList.push(notification);
    }
    notificationList.sort((a, b) => {
      const aHasTime = 'createdAt' in a;
      const bHasTime = 'createdAt' in b;
      if (!aHasTime && bHasTime) {
        return -1;
      }
      if (aHasTime && !bHasTime) {
        return 1;
      }
      const aTime = aHasTime ? a.createdAt : 0;
      const bTime = bHasTime ? b.createdAt : 0;
      return bTime - aTime;
    });
    return notificationList;
  };

  public getOne = async (id: string) => {
    this.loggerService.log("notificationViewService getOne", {
      id,
    });
    if (CC_ENABLE_MOCK) {
      return await this.notificationMockService.getOne(id);
    }
    if (!Notification.enable.hasValue()) {
      console.warn("@backtest-kit/ui notificationViewService getOne notifications not enabled");
      return null;
    }
    const notificationList = await this.getList();
    return notificationList.find((item) => item.id === id) ?? null;
  };
}

export default NotificationViewService;
