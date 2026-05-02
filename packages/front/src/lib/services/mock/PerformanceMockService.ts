import fs from "fs/promises";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { singleshot } from "functools-kit";

const MOCK_DATA_PATH = "./mock/performance.json";
const MOCK_REPORT_PATH = "./mock/performance-report.md";

const READ_PERFORMANCE_DATA_FN = singleshot(
  async () => {
    const data = await fs.readFile(MOCK_DATA_PATH, "utf-8");
    return JSON.parse(data);
  },
);

const READ_PERFORMANCE_REPORT_FN = singleshot(
  async () => {
    return await fs.readFile(MOCK_REPORT_PATH, "utf-8");
  },
);

export class PerformanceMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getPerformanceData = async () => {
    this.loggerService.log("performanceMockService getPerformanceData");
    return await READ_PERFORMANCE_DATA_FN();
  };

  public getPerformanceReport = async () => {
    this.loggerService.log("performanceMockService getPerformanceReport");
    return await READ_PERFORMANCE_REPORT_FN();
  };
}

export default PerformanceMockService;
