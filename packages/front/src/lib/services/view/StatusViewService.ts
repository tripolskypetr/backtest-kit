import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { Exchange, IPublicSignalRow, Live } from "backtest-kit";
import StatusMockService from "../mock/StatusMockService";
import { CC_ENABLE_MOCK } from "../../../config/params";

export class StatusViewService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly statusMockService = inject<StatusMockService>(
    TYPES.statusMockService,
  );

  public getStatusList = async () => {
    this.loggerService.log("statusViewService getStatusList");
    if (CC_ENABLE_MOCK) {
      const liveList = await this.statusMockService.getStatusList();
      return liveList.filter(({ status }) => status === "pending");
    }
    return await Live.list();
  };

  public getStatusMap = async () => {
    this.loggerService.log("statusViewService getStatusMap");
    if (CC_ENABLE_MOCK) {
      return await this.statusMockService.getStatusMap();
    }
    const liveList = await Live.list();
    return liveList
      .filter(({ status }) => status === "pending")
      .reduce((acm, cur) => ({ ...acm, [cur.id]: cur }), {});
  };

  public getStatusOne = async (id: string) => {
    this.loggerService.log("statusViewService getStatusOne", {
      id,
    });
    if (CC_ENABLE_MOCK) {
      return await this.statusMockService.getStatusOne(id);
    }
    const liveList = await Live.list();
    const liveOne = liveList.find((live) => live.id === id);
    if (!liveOne) {
      throw new Error(`Live with id ${id} not found`);
    }
    const { symbol, strategyName, exchangeName } = liveOne;
    const currentPrice = await Exchange.getAveragePrice(symbol, {
      exchangeName,
    });
    const pendingSignal = <IPublicSignalRow>await Live.getPendingSignal(
      symbol,
      currentPrice,
      {
        strategyName,
        exchangeName,
      },
    );
    if (!pendingSignal) {
      return null;
    }
    const positionLevels = await Live.getPositionLevels(symbol, {
      strategyName,
      exchangeName,
    });
    if (!positionLevels) {
      return null;
    }
    const positionPartials = await Live.getPositionPartials(symbol, {
      strategyName,
      exchangeName,
    });
    if (!positionPartials) {
      return null;
    }
    return {
      signalId: pendingSignal.id,
      position: pendingSignal.position,
      totalEntries: pendingSignal.totalEntries,
      totalPartials: pendingSignal.totalPartials,
      originalPriceStopLoss: pendingSignal.originalPriceStopLoss,
      originalPriceTakeProfit: pendingSignal.originalPriceTakeProfit,
      originalPriceOpen: pendingSignal.originalPriceOpen,
      priceOpen: pendingSignal.priceOpen,
      priceTakeProfit: pendingSignal.priceTakeProfit,
      priceStopLoss: pendingSignal.priceStopLoss,
      pnlPercentage: pendingSignal.pnl.pnlPercentage,
      pnlCost: pendingSignal.pnl.pnlCost,
      pnlEntries: pendingSignal.pnl.pnlEntries,
      partialExecuted: pendingSignal.partialExecuted,
      pendingAt: pendingSignal.pendingAt,
      positionLevels,
      positionPartials,
    };
  };
}

export default StatusViewService;
