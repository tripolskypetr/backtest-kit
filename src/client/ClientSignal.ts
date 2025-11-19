import {
  ISignal,
  ISignalData,
  ISignalParams,
  ISignalPnL,
  ISignalTickResult,
  SignalCloseReason,
} from "../interfaces/Signal.interface";

const PERCENT_SLIPPAGE = 0.1;
const PERCENT_FEE = 0.1;

const GET_PNL_FN = (signal: ISignalData, priceClose: number): ISignalPnL => {
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

export class ClientSignal implements ISignal {
  _pendingSignal: ISignalData | null = null;

  constructor(readonly params: ISignalParams) {}

  public tick = async (symbol: string): Promise<ISignalTickResult> => {
    this.params.logger.debug("ClientSignal tick", {
      symbol,
    });

    if (!this._pendingSignal) {
      this._pendingSignal = await this.params.getSignal(this.params.symbol);

      if (this._pendingSignal) {
        if (this.params.callbacks?.onOpen) {
          this.params.callbacks.onOpen(
            this.params.execution.context.backtest,
            symbol,
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
    const averagePrice = await this.params.candle.getAveragePrice(symbol);

    this.params.logger.debug("ClientSignal tick check", {
      symbol,
      averagePrice,
      signalId: signal.id,
      position: signal.position,
    });

    let shouldClose = false;
    let closeReason: SignalCloseReason | undefined;

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

      this.params.logger.debug("ClientSignal closing", {
        symbol,
        signalId: signal.id,
        reason: closeReason,
        priceClose: averagePrice,
        pnlPercentage: pnl.pnlPercentage,
      });

      if (this.params.callbacks?.onClose) {
        this.params.callbacks.onClose(
          this.params.execution.context.backtest,
          symbol,
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

export default ClientSignal;
