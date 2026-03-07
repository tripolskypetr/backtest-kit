import fs from "fs/promises";
import { IPublicSignalRow } from "backtest-kit";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { singleshot } from "functools-kit";

const MOCK_PATH = "./mock/status.json";

const READ_STATUS_LIST_FN = singleshot(
  async (): Promise<IPublicSignalRow[]> => {
    const data = await fs.readFile(MOCK_PATH, "utf-8");
    return JSON.parse(data);
  },
);

export class StatusMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getStatusList = async () => {
    this.loggerService.log("statusMockService getStatusList");
    const list = await READ_STATUS_LIST_FN();
    return list.map(({ id, symbol, strategyName, exchangeName }) => ({
      id,
      symbol,
      strategyName,
      exchangeName,
      status: "pending" as const,
    }));
  };

  public getStatusMap = async () => {
    this.loggerService.log("statusMockService getStatusMap");
    const list = await this.getStatusList();
    return list.reduce((acm, cur) => ({ ...acm, [cur.id]: cur }), {});
  };

  public getStatusOne = async (id: string) => {
    this.loggerService.log("statusMockService getStatusOne", { id });
    const list = await READ_STATUS_LIST_FN();
    const signal = list.find((s) => s.id === id);
    if (!signal) {
      return null;
    }
    const positionLevels = (signal._entry ?? []).map((e) => e.price);
    const positionPartials = signal._partial ?? [];
    return {
      position: signal.position,
      totalEntries: signal.totalEntries,
      totalPartials: signal.totalPartials,
      originalPriceStopLoss: signal.originalPriceStopLoss,
      originalPriceTakeProfit: signal.originalPriceTakeProfit,
      originalPriceOpen: signal.originalPriceOpen,
      priceOpen: signal.priceOpen,
      priceTakeProfit: signal.priceTakeProfit,
      priceStopLoss: signal.priceStopLoss,
      pnlPercentage: signal.pnl.pnlPercentage,
      pnlCost: signal.pnl.pnlCost,
      pnlEntries: signal.pnl.pnlEntries,
      partialExecuted: signal.partialExecuted,
      positionLevels,
      positionPartials,
    };
  };
}

export default StatusMockService;
