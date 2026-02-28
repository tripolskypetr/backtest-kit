import { Log, ILogEntry } from "backtest-kit";
import { pickDocuments, singleshot } from "functools-kit";

import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { inject } from "../../../lib/core/di";
import LogMockService from "../mock/LogMockService";
import { CC_ENABLE_MOCK } from "../../../config/params";

const DEFAULT_LIMIT = 25;
const DEFAULT_OFFSET = 0;

const CREATE_FILTER_LIST_FN = <T extends object = Record<string, string>>(
  filterData: T,
) =>
  Object.keys(filterData).map(
    (key) => (row) => new RegExp(filterData[key], "i").test(row[key]),
  );

export class LogViewService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly logMockService = inject<LogMockService>(
    TYPES.logMockService,
  );

  public findByFilter = async <T extends object = Record<string, string>>(
    filterData: T,
    limit = DEFAULT_LIMIT,
    offset = DEFAULT_OFFSET,
  ) => {
    this.loggerService.log("logViewService findByFilter", {
      filterData,
      limit,
      offset,
    });
    if (CC_ENABLE_MOCK) {
      return await this.logMockService.findByFilter(filterData, limit, offset);
    }
    const iter = pickDocuments<ILogEntry>(limit, offset);
    const filterList = CREATE_FILTER_LIST_FN<T>(filterData);
    for (const entry of await this.getList()) {
      let isOk = true;
      for (const filterFn of filterList) {
        isOk = isOk && filterFn(entry);
      }
      if (!isOk) {
        continue;
      }
      if (iter([entry]).done) {
        break;
      }
    }
    return iter().rows;
  };

  public getList = async () => {
    this.loggerService.log("logViewService getList");
    if (CC_ENABLE_MOCK) {
      return await this.logMockService.getList();
    }
    const logList: ILogEntry[] = await Log.getList();
    logList.sort((a, b) => b.timestamp - a.timestamp);
    return logList;
  };

  public getOne = async (id: string) => {
    this.loggerService.log("logViewService getOne", { id });
    if (CC_ENABLE_MOCK) {
      return await this.logMockService.getOne(id);
    }
    const logList = await this.getList();
    return logList.find((item) => item.id === id) ?? null;
  };

  protected init = singleshot(async () => {
    this.loggerService.log("logViewService init");
  });
}

export default LogViewService;
