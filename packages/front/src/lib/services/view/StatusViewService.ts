import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import {
  Backtest,
  Exchange,
  Heat,
  IPublicSignalRow,
  lib,
  Live,
} from "backtest-kit";
import StatusMockService from "../mock/StatusMockService";
import SignalViewService from "./SignalViewService";
import { CC_ENABLE_MOCK } from "../../../config/params";

export class StatusViewService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly statusMockService = inject<StatusMockService>(
    TYPES.statusMockService,
  );
  private readonly signalViewService = inject<SignalViewService>(
    TYPES.signalViewService,
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
    const positionEntries = await Live.getPositionEntries(symbol, {
      strategyName,
      exchangeName,
    });
    if (!positionEntries) {
      return null;
    }
    const positionPartials = await Live.getPositionPartials(symbol, {
      strategyName,
      exchangeName,
    });
    if (!positionPartials) {
      return null;
    }
    const timestamp = await lib.timeMetaService.getTimestamp(
      pendingSignal.symbol,
      {
        strategyName: pendingSignal.strategyName,
        exchangeName: pendingSignal.exchangeName,
        frameName: pendingSignal.frameName,
      },
      false,
    );
    const updatedAt = await this.signalViewService.getLastUpdateTimestamp(
      pendingSignal.id,
    );
    return {
      signalId: pendingSignal.id,
      position: pendingSignal.position,
      symbol: pendingSignal.symbol,
      exchangeName: pendingSignal.exchangeName,
      strategyName: pendingSignal.strategyName,
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
      minuteEstimatedTime: pendingSignal.minuteEstimatedTime,
      timestamp,
      updatedAt,
      positionEntries,
      positionLevels,
      positionPartials,
    };
  };

  public getStatusInfo = async () => {
    this.loggerService.log("statusViewService getStatusInfo");

    if (CC_ENABLE_MOCK) {
      return this.statusMockService.getStatusInfo();
    }

    {
      const [backtestTarget = null] = await Backtest.list();
      if (backtestTarget) {
        const currentHeat = await Heat.getData({
          strategyName: backtestTarget.strategyName,
          exchangeName: backtestTarget.exchangeName,
          frameName: backtestTarget.frameName,
        });
        return {
          context: {
            strategyName: backtestTarget.strategyName,
            exchangeName: backtestTarget.exchangeName,
            frameName: backtestTarget.frameName,
          },
          portfolioTotalPnl: currentHeat.portfolioTotalPnl,
          portfolioSharpeRatio: currentHeat.portfolioSharpeRatio,
          portfolioTotalTrades: currentHeat.portfolioTotalTrades,
          symbols: currentHeat.symbols.map(({ symbol, totalPnl, winRate, profitFactor, maxDrawdown, expectancy, totalTrades }) => ({
            symbol,
            totalPnl,
            winRate,
            profitFactor,
            maxDrawdown,
            expectancy,
            totalTrades,
          })),
          backtest: true,
        };
      }
    }

    {
      const [liveTarget = null] = await Live.list();
      if (liveTarget) {
        const currentHeat = await Heat.getData({
          strategyName: liveTarget.strategyName,
          exchangeName: liveTarget.exchangeName,
          frameName: "",
        });
        return {
          context: {
            strategyName: liveTarget.strategyName,
            exchangeName: liveTarget.exchangeName,
            frameName: "",
          },
          portfolioTotalPnl: currentHeat.portfolioTotalPnl,
          portfolioSharpeRatio: currentHeat.portfolioSharpeRatio,
          portfolioTotalTrades: currentHeat.portfolioTotalTrades,
          symbols: currentHeat.symbols.map(({ symbol, totalPnl, winRate, profitFactor, maxDrawdown, expectancy, totalTrades }) => ({
            symbol,
            totalPnl,
            winRate,
            profitFactor,
            maxDrawdown,
            expectancy,
            totalTrades,
          })),
          backtest: false,
        };
      }
    }

    return null;
  };
}

export default StatusViewService;
