import fs from "fs/promises";

import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { inject } from "../../../lib/core/di";
import { ILogEntry } from "backtest-kit";
import { pickDocuments, singleshot } from "functools-kit";

const MOCK_PATH = "./mock/logs.json";

const READ_LOG_LIST_FN = singleshot(
  async (): Promise<ILogEntry[]> => {
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

export class LogMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public findByFilter = async <T extends object = Record<string, string>>(
    filterData: T,
    limit = DEFAULT_LIMIT,
    offset = DEFAULT_OFFSET,
  ) => {
    this.loggerService.log("logMockService findByFilter", {
      filterData,
      limit,
      offset,
    });
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
    this.loggerService.log("logMockService getList");
    const logList: ILogEntry[] = [];
    for (const entry of await READ_LOG_LIST_FN()) {
      logList.push(entry);
    }
    logList.sort((a, b) => b.timestamp - a.timestamp);
    return logList;
  };

  public getOne = async (id: string) => {
    this.loggerService.log("logMockService getOne");
    const logList = await this.getList();
    return logList.find((item) => item.id === id) ?? null;
  };
}

export default LogMockService;
