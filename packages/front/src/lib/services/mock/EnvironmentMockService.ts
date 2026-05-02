import fs from "fs/promises";
import { TYPES } from "../../../lib/core/types";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { singleshot } from "functools-kit";

const MOCK_DATA_PATH = "./mock/environment.json";

const READ_ENVIRONMENT_DATA_FN = singleshot(
  async () => {
    const data = await fs.readFile(MOCK_DATA_PATH, "utf-8");
    return JSON.parse(data);
  },
);

export class EnvironmentMockService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    public getEnvironmentData = async () => {
        this.loggerService.log("environmentMockService getEnvironmentData");
        return await READ_ENVIRONMENT_DATA_FN();
    }
}

export default EnvironmentMockService;
