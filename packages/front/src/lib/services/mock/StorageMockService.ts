import { IStorageSignalRow } from "backtest-kit";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

const MOCK_PATH = "./mock/db";

const READ_BACKTEST_STORAGE_FN = singleshot(async () => {
  const dbPath = join(__dirname, MOCK_PATH);
  const files = await readdir(dbPath);

  const signals: IStorageSignalRow[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) {
      continue;
    }
    const filePath = join(dbPath, file);
    signals.push(JSON.parse(await readFile(filePath, "utf-8")));
  }

  return signals;
});

export class StorageMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public findSignalById = async (signalId: string) => {
    this.loggerService.log("storageMockService findSignalById", {
      signalId,
    });
    const signalList = await READ_BACKTEST_STORAGE_FN();
    const signalMap = new Map(signalList.map((signal) => [signal.id, signal]));
    const signalValue = signalMap.get(signalId);
    return signalValue ?? null;
  };

  public listSignalLive = async (): Promise<IStorageSignalRow[]> => {
    this.loggerService.log("storageMockService listSignalLive");
    return Promise.resolve([]);
  };

  public listSignalBacktest = async (): Promise<IStorageSignalRow[]> => {
    this.loggerService.log("storageMockService listSignalBacktest");
    return await READ_BACKTEST_STORAGE_FN();
  };
}

export default StorageMockService;
