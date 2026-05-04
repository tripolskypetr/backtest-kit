import fs from "fs/promises";
import { TYPES } from "../../../lib/core/types";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { singleshot } from "functools-kit";

const MOCK_DATA_PATH = "./mock/setup.json";

const READ_SETUP_DATA_FN = singleshot(
  async () => {
    const data = await fs.readFile(MOCK_DATA_PATH, "utf-8");
    return JSON.parse(data);
  },
);

export class SetupMockService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    public getSetupData = async () => {
        this.loggerService.log("setupMockService getSetupData");
        return await READ_SETUP_DATA_FN();
    }
}

export default SetupMockService;
