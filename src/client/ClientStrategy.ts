import { randomString } from "functools-kit";
import {
  IStrategy,
  ISignalRow,
  ISignalDto,
  IStrategyParams,
  IStrategyPnL,
  IStrategyTickResult,
  IStrategyBacktestResult,
  StrategyCloseReason,
} from "../interfaces/Strategy.interface";
import toProfitLossDto from "../helpers/toProfitLossDto";
import { ICandleData } from "../interfaces/Exchange.interface";

const GET_SIGNAL_FN = async (self: ClientStrategy) => {
  const signal = await self.params.getSignal(
    self.params.execution.context.symbol
  );
  if (!signal) {
    return null;
  }
  return {
    ...signal,
    id: randomString(),
  };
};

const GET_AVG_PRICE_FN = (candles: ICandleData[]): number => {
  const sumPriceVolume = candles.reduce((acc, c) => {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    return acc + typicalPrice * c.volume;
  }, 0);

  const totalVolume = candles.reduce((acc, c) => acc + c.volume, 0);

  return totalVolume === 0
    ? candles.reduce((acc, c) => acc + c.close, 0) / candles.length
    : sumPriceVolume / totalVolume;
};

export class ClientStrategy implements IStrategy {
  _pendingSignal: ISignalRow | null = null;

  constructor(readonly params: IStrategyParams) {}

  public tick = async (): Promise<IStrategyTickResult> => {
    this.params.logger.debug("ClientStrategy tick");

    if (!this._pendingSignal) {
      this._pendingSignal = await GET_SIGNAL_FN(this);

      if (this._pendingSignal) {
        if (this.params.callbacks?.onOpen) {
          this.params.callbacks.onOpen(
            this.params.execution.context.backtest,
            this.params.execution.context.symbol,
            this._pendingSignal
          );
        }

        return {
          action: "opened",
          signal: this._pendingSignal,
        };
      }

      return {
        action: "idle",
        signal: null,
      };
    }

    const when = this.params.execution.context.when;
    const signal = this._pendingSignal;

    // Получаем среднюю цену
    const averagePrice = await this.params.exchange.getAveragePrice(
      this.params.execution.context.symbol
    );

    this.params.logger.debug("ClientStrategy tick check", {
      symbol: this.params.execution.context.symbol,
      averagePrice,
      signalId: signal.id,
      position: signal.position,
    });

    let shouldClose = false;
    let closeReason: StrategyCloseReason | undefined;

    // Проверяем истечение времени
    const signalEndTime =
      signal.timestamp + signal.minuteEstimatedTime * 60 * 1000;
    if (when.getTime() >= signalEndTime) {
      shouldClose = true;
      closeReason = "time_expired";
    }

    // Проверяем достижение TP/SL для long позиции
    if (signal.position === "long") {
      if (averagePrice >= signal.priceTakeProfit) {
        shouldClose = true;
        closeReason = "take_profit";
      } else if (averagePrice <= signal.priceStopLoss) {
        shouldClose = true;
        closeReason = "stop_loss";
      }
    }

    // Проверяем достижение TP/SL для short позиции
    if (signal.position === "short") {
      if (averagePrice <= signal.priceTakeProfit) {
        shouldClose = true;
        closeReason = "take_profit";
      } else if (averagePrice >= signal.priceStopLoss) {
        shouldClose = true;
        closeReason = "stop_loss";
      }
    }

    // Закрываем сигнал если выполнены условия
    if (shouldClose) {
      const pnl = toProfitLossDto(signal, averagePrice);

      this.params.logger.debug("ClientStrategy closing", {
        symbol: this.params.execution.context.symbol,
        signalId: signal.id,
        reason: closeReason,
        priceClose: averagePrice,
        pnlPercentage: pnl.pnlPercentage,
      });

      if (this.params.callbacks?.onClose) {
        this.params.callbacks.onClose(
          this.params.execution.context.backtest,
          this.params.execution.context.symbol,
          averagePrice,
          signal
        );
      }

      this._pendingSignal = null;

      return {
        action: "closed",
        signal: signal,
        currentPrice: averagePrice,
        closeReason: closeReason,
        pnl: pnl,
      };
    }

    return {
      action: "active",
      signal: signal,
      currentPrice: averagePrice,
    };
  };

  public backtest = async (
    candles: ICandleData[]
  ): Promise<IStrategyBacktestResult> => {
    const signal = this._pendingSignal;

    if (!signal) {
      throw new Error("ClientStrategy backtest: no pending signal");
    }

    this.params.logger.debug("ClientStrategy backtest", {
      symbol: this.params.execution.context.symbol,
      signalId: signal.id,
      candlesCount: candles.length,
    });

    // Проверяем каждую свечу на достижение TP/SL
    // Начинаем с индекса 4 (пятая свеча), чтобы было минимум 5 свечей для VWAP
    for (let i = 4; i < candles.length; i++) {
      // Вычисляем VWAP из последних 5 свечей для текущего момента
      const recentCandles = candles.slice(i - 4, i + 1);
      const averagePrice = GET_AVG_PRICE_FN(recentCandles);

      let shouldClose = false;
      let closeReason: StrategyCloseReason | undefined;

      // Проверяем достижение TP/SL для long позиции
      if (signal.position === "long") {
        if (averagePrice >= signal.priceTakeProfit) {
          shouldClose = true;
          closeReason = "take_profit";
        } else if (averagePrice <= signal.priceStopLoss) {
          shouldClose = true;
          closeReason = "stop_loss";
        }
      }

      // Проверяем достижение TP/SL для short позиции
      if (signal.position === "short") {
        if (averagePrice <= signal.priceTakeProfit) {
          shouldClose = true;
          closeReason = "take_profit";
        } else if (averagePrice >= signal.priceStopLoss) {
          shouldClose = true;
          closeReason = "stop_loss";
        }
      }

      // Если достигнут TP/SL, закрываем сигнал
      if (shouldClose) {
        const pnl = toProfitLossDto(signal, averagePrice);

        this.params.logger.debug("ClientStrategy backtest closing", {
          symbol: this.params.execution.context.symbol,
          signalId: signal.id,
          reason: closeReason,
          priceClose: averagePrice,
          pnlPercentage: pnl.pnlPercentage,
        });

        if (this.params.callbacks?.onClose) {
          this.params.callbacks.onClose(
            this.params.execution.context.backtest,
            this.params.execution.context.symbol,
            averagePrice,
            signal
          );
        }

        this._pendingSignal = null;

        return {
          action: "closed",
          signal: signal,
          currentPrice: averagePrice,
          closeReason: closeReason,
          pnl: pnl,
        };
      }
    }

    // Если TP/SL не достигнут за период, вычисляем VWAP из последних 5 свечей
    const lastFiveCandles = candles.slice(-5);
    const lastPrice = GET_AVG_PRICE_FN(lastFiveCandles);

    const pnl = toProfitLossDto(signal, lastPrice);

    this.params.logger.debug("ClientStrategy backtest time_expired", {
      symbol: this.params.execution.context.symbol,
      signalId: signal.id,
      priceClose: lastPrice,
      pnlPercentage: pnl.pnlPercentage,
    });

    if (this.params.callbacks?.onClose) {
      this.params.callbacks.onClose(
        this.params.execution.context.backtest,
        this.params.execution.context.symbol,
        lastPrice,
        signal
      );
    }

    this._pendingSignal = null;

    return {
      action: "closed",
      signal: signal,
      currentPrice: lastPrice,
      closeReason: "time_expired",
      pnl: pnl,
    };
  };
}

export default ClientStrategy;
