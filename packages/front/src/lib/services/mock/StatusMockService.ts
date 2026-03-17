import fs from "fs/promises";
import { IPublicSignalRow } from "backtest-kit";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import SignalMockService from "./SignalMockService";

const MOCK_PATH = "./mock/status.json";

const READ_STATUS_LIST_FN = singleshot(
  async () => {
    const data = await fs.readFile(MOCK_PATH, "utf-8");
    return JSON.parse(data);
  },
);

export class StatusMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly signalMockService = inject<SignalMockService>(TYPES.signalMockService);

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
    const status = list.find((s) => s.id === id);
    if (!status) {
      return null;
    }
    const updatedAt = await this.signalMockService.getLastUpdateTimestamp(status.signalId);
    const positionEntries = status._entry ?? [];
    const positionLevels = positionEntries.map((e) => e.price);
    const positionPartials = status._partial ?? [];
    return {
      signalId: status.signalId,
      position: status.position,
      symbol: status.symbol,
      exchangeName: status.exchangeName,
      strategyName: status.strategyName,
      totalEntries: status.totalEntries,
      totalPartials: status.totalPartials,
      originalPriceStopLoss: status.originalPriceStopLoss,
      originalPriceTakeProfit: status.originalPriceTakeProfit,
      originalPriceOpen: status.originalPriceOpen,
      priceOpen: status.priceOpen,
      priceTakeProfit: status.priceTakeProfit,
      priceStopLoss: status.priceStopLoss,
      pnlPercentage: status.pnl.pnlPercentage,
      pnlCost: status.pnl.pnlCost,
      pnlEntries: status.pnl.pnlEntries,
      partialExecuted: status.partialExecuted,
      minuteEstimatedTime: status.minuteEstimatedTime,
      pendingAt: status.pendingAt,
      timestamp: status.timestamp,
      updatedAt,
      positionLevels,
      positionEntries,
      positionPartials,
    };
  };
}

export default StatusMockService;
