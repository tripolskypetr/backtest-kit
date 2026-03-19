import fs from "fs/promises";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { singleshot } from "functools-kit";

const MOCK_PATH = "./mock/heat.json";

const READ_HEAT_FN = singleshot(
  async () => {
    const data = await fs.readFile(MOCK_PATH, "utf-8");
    return JSON.parse(data);
  },
);

export class HeatMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getStrategyHeat = async () => {
    this.loggerService.log("heatMockService getStrategyHeat");
    return await READ_HEAT_FN();
  };
}

export default HeatMockService;
