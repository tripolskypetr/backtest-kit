import {
  IStrategy,
  ISignalData,
  IStrategyParams,
  IStrategyPnL,
  IStrategyTickResult,
  StrategyCloseReason,
} from "../interfaces/Strategy.interface";

const PERCENT_SLIPPAGE = 0.1;
const PERCENT_FEE = 0.1;

const GET_PNL_FN = (signal: ISignalData, priceClose: number): IStrategyPnL => {
  const priceOpen = signal.priceOpen;

  let priceOpenWithSlippage: number;
  let priceCloseWithSlippage: number;

  if (signal.position === "long") {
    // LONG: покупаем дороже, продаем дешевле
    priceOpenWithSlippage = priceOpen * (1 + PERCENT_SLIPPAGE / 100);
    priceCloseWithSlippage = priceClose * (1 - PERCENT_SLIPPAGE / 100);
  } else {
    // SHORT: продаем дешевле, покупаем дороже
    priceOpenWithSlippage = priceOpen * (1 - PERCENT_SLIPPAGE / 100);
    priceCloseWithSlippage = priceClose * (1 + PERCENT_SLIPPAGE / 100);
  }

  // Применяем комиссию дважды (при открытии и закрытии)
  const totalFee = PERCENT_FEE * 2;

  let pnlPercentage: number;

  if (signal.position === "long") {
    // LONG: прибыль при росте цены
    pnlPercentage =
      ((priceCloseWithSlippage - priceOpenWithSlippage) /
        priceOpenWithSlippage) *
      100;
  } else {
    // SHORT: прибыль при падении цены
    pnlPercentage =
      ((priceOpenWithSlippage - priceCloseWithSlippage) /
        priceOpenWithSlippage) *
      100;
  }

  // Вычитаем комиссии
  pnlPercentage -= totalFee;

  return {
    pnlPercentage,
    priceOpen,
    priceClose,
  };
};

export class ClientStrategy implements IStrategy {
  _pendingSignal: ISignalData | null = null;

  constructor(readonly params: IStrategyParams) {}

  public tick = async (): Promise<IStrategyTickResult> => {
    this.params.logger.debug("ClientStrategy tick");

    if (!this._pendingSignal) {
      this._pendingSignal = await this.params.getSignal(
        this.params.execution.context.symbol
      );

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
      const pnl = GET_PNL_FN(signal, averagePrice);

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
}

export default ClientStrategy;
