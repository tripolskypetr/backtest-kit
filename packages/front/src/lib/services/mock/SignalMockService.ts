import { IStorageSignalRow } from "backtest-kit";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

const MOCK_PATH = "./mock/db";

const READ_SIGNAL_STORAGE_FN = singleshot(async () => {
  const dbPath = join(process.cwd(), MOCK_PATH);
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

export class SignalMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getLastUpdateTimestamp = async (signalId: string) => {
    this.loggerService.log("signalMockService getLastUpdateTimestamp", {
      signalId,
    });
    const signalList = await READ_SIGNAL_STORAGE_FN();
    const signalMap = new Map(signalList.map((signal) => [signal.id, signal]));
    const signal = signalMap.get(signalId);
    if (!signal) {
      throw new Error(`SignalMockService getLastUpdateTimestamp signal not found signalId=${signalId}`);
    }
    return signal.updatedAt;
  };
}

export default SignalMockService;
