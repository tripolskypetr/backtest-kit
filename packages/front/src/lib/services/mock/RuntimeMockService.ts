import fs from "fs/promises";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import { IRuntimeInfo } from "tradeforge";

const MOCK_DATA_PATH = "./mock/runtime.json";

const READ_RUNTIME_INFO_FN = singleshot(
  async () => {
    const data = await fs.readFile(MOCK_DATA_PATH, "utf-8");
    return JSON.parse(data);
  },
);

export class RuntimeMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getRuntimeInfo = async (): Promise<IRuntimeInfo> => {
    this.loggerService.log("runtimeMockService getRuntimeInfo");
    return await READ_RUNTIME_INFO_FN();
  };
}

export default RuntimeMockService;
