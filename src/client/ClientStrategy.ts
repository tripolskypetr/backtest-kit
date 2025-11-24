import {
  errorData,
  getErrorMessage,
  randomString,
  singleshot,
  trycatch,
} from "functools-kit";
import {
  IStrategy,
  ISignalRow,
  IStrategyParams,
  IStrategyTickResult,
  IStrategyTickResultIdle,
  IStrategyTickResultOpened,
  IStrategyTickResultActive,
  IStrategyTickResultClosed,
  IStrategyBacktestResult,
  StrategyCloseReason,
  SignalInterval,
} from "../interfaces/Strategy.interface";
import toProfitLossDto from "../helpers/toProfitLossDto";
import { ICandleData } from "../interfaces/Exchange.interface";
import { PersistSignalAdaper } from "../classes/Persist";
import backtest from "../lib";
import { errorEmitter } from "../config/emitters";

const INTERVAL_MINUTES: Record<SignalInterval, number> = {
  "1m": 1,
  "3m": 3,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
};

const VALIDATE_SIGNAL_FN = (signal: ISignalRow): void => {
  const errors: string[] = [];

  // Валидация цен
  if (signal.priceOpen <= 0) {
    errors.push(`priceOpen must be positive, got ${signal.priceOpen}`);
  }
  if (signal.priceTakeProfit <= 0) {
    errors.push(
      `priceTakeProfit must be positive, got ${signal.priceTakeProfit}`
    );
  }
  if (signal.priceStopLoss <= 0) {
    errors.push(`priceStopLoss must be positive, got ${signal.priceStopLoss}`);
  }

  // Валидация для long позиции
  if (signal.position === "long") {
    if (signal.priceTakeProfit <= signal.priceOpen) {
      errors.push(
        `Long: priceTakeProfit (${signal.priceTakeProfit}) must be > priceOpen (${signal.priceOpen})`
      );
    }
    if (signal.priceStopLoss >= signal.priceOpen) {
      errors.push(
        `Long: priceStopLoss (${signal.priceStopLoss}) must be < priceOpen (${signal.priceOpen})`
      );
    }
  }

  // Валидация для short позиции
  if (signal.position === "short") {
    if (signal.priceTakeProfit >= signal.priceOpen) {
      errors.push(
        `Short: priceTakeProfit (${signal.priceTakeProfit}) must be < priceOpen (${signal.priceOpen})`
      );
    }
    if (signal.priceStopLoss <= signal.priceOpen) {
      errors.push(
        `Short: priceStopLoss (${signal.priceStopLoss}) must be > priceOpen (${signal.priceOpen})`
      );
    }
  }

  // Валидация временных параметров
  if (signal.minuteEstimatedTime <= 0) {
    errors.push(
      `minuteEstimatedTime must be positive, got ${signal.minuteEstimatedTime}`
    );
  }
  if (signal.timestamp <= 0) {
    errors.push(`timestamp must be positive, got ${signal.timestamp}`);
  }

  // Кидаем ошибку если есть проблемы
  if (errors.length > 0) {
    throw new Error(
      `Invalid signal for ${signal.position} position:\n${errors.join("\n")}`
    );
  }
};

const GET_SIGNAL_FN = trycatch(
  async (self: ClientStrategy): Promise<ISignalRow | null> => {
    if (self._isStopped) {
      return null;
    }
    const currentTime = self.params.execution.context.when.getTime();
    {
      const intervalMinutes = INTERVAL_MINUTES[self.params.interval];
      const intervalMs = intervalMinutes * 60 * 1000;

      // Проверяем что прошел нужный интервал с последнего getSignal
      if (
        self._lastSignalTimestamp !== null &&
        currentTime - self._lastSignalTimestamp < intervalMs
      ) {
        return null;
      }

      self._lastSignalTimestamp = currentTime;
    }
    const signal = await self.params.getSignal(
      self.params.execution.context.symbol
    );
    if (!signal) {
      return null;
    }
    const signalRow: ISignalRow = {
      id: randomString(),
      priceOpen: await self.params.exchange.getAveragePrice(
        self.params.execution.context.symbol,
      ),
      ...signal,
      symbol: self.params.execution.context.symbol,
      exchangeName: self.params.method.context.exchangeName,
      strategyName: self.params.method.context.strategyName,
      timestamp: currentTime,
    };

    // Валидируем сигнал перед возвратом
    VALIDATE_SIGNAL_FN(signalRow);

    return signalRow;
  },
  {
    defaultValue: null,
    fallback: (error) => {
      backtest.loggerService.warn("ClientStrategy exception thrown", {
        error: errorData(error),
        message: getErrorMessage(error),
      });
      errorEmitter.next(error);
    },
  }
);

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

const WAIT_FOR_INIT_FN = async (self: ClientStrategy) => {
  self.params.logger.debug("ClientStrategy waitForInit");
  if (self.params.execution.context.backtest) {
    return;
  }
  const pendingSignal = await PersistSignalAdaper.readSignalData(
    self.params.strategyName,
    self.params.execution.context.symbol
  );
  if (!pendingSignal) {
    return;
  }
  if (pendingSignal.exchangeName !== self.params.method.context.exchangeName) {
    return;
  }
  if (pendingSignal.strategyName !== self.params.method.context.strategyName) {
    return;
  }
  self._pendingSignal = pendingSignal;
};

/**
 * Client implementation for trading strategy lifecycle management.
 *
 * Features:
 * - Signal generation with interval throttling
 * - Automatic signal validation (prices, TP/SL logic, timestamps)
 * - Crash-safe persistence in live mode
 * - VWAP-based TP/SL monitoring
 * - Fast backtest with candle array processing
 *
 * All methods use prototype functions for memory efficiency.
 *
 * @example
 * ```typescript
 * const strategy = new ClientStrategy({
 *   strategyName: "my-strategy",
 *   interval: "5m",
 *   getSignal: async (symbol) => ({ ... }),
 *   execution: executionService,
 *   exchange: exchangeService,
 *   logger: loggerService,
 * });
 *
 * await strategy.waitForInit(); // Load persisted state
 * const result = await strategy.tick(); // Monitor signal
 * ```
 */
export class ClientStrategy implements IStrategy {
  _isStopped = false;
  _pendingSignal: ISignalRow | null = null;
  _lastSignalTimestamp: number | null = null;

  constructor(readonly params: IStrategyParams) {}

  /**
   * Initializes strategy state by loading persisted signal from disk.
   *
   * Uses singleshot pattern to ensure initialization happens exactly once.
   * In backtest mode: skips persistence, no state to load
   * In live mode: reads last signal state from disk
   *
   * @returns Promise that resolves when initialization is complete
   */
  public waitForInit = singleshot(async () => await WAIT_FOR_INIT_FN(this));

  /**
   * Updates pending signal and persists to disk in live mode.
   *
   * Centralized method for all signal state changes.
   * Uses atomic file writes to prevent corruption.
   *
   * @param pendingSignal - New signal state (null to clear)
   * @returns Promise that resolves when update is complete
   */
  public async setPendingSignal(pendingSignal: ISignalRow | null) {
    this.params.logger.debug("ClientStrategy setPendingSignal", {
      pendingSignal,
    });
    this._pendingSignal = pendingSignal;
    if (this.params.execution.context.backtest) {
      return;
    }
    await PersistSignalAdaper.writeSignalData(
      this._pendingSignal,
      this.params.strategyName,
      this.params.execution.context.symbol
    );
  }

  /**
   * Performs a single tick of strategy execution.
   *
   * Flow:
   * 1. If no pending signal: call getSignal with throttling and validation
   * 2. If signal opened: trigger onOpen callback, persist state
   * 3. If pending signal exists: check VWAP against TP/SL
   * 4. If TP/SL/time reached: close signal, trigger onClose, persist state
   *
   * @returns Promise resolving to discriminated union result:
   * - idle: No signal generated
   * - opened: New signal just created
   * - active: Signal monitoring in progress
   * - closed: Signal completed with PNL
   *
   * @example
   * ```typescript
   * const result = await strategy.tick();
   * if (result.action === "closed") {
   *   console.log(`PNL: ${result.pnl.pnlPercentage}%`);
   * }
   * ```
   */
  public async tick(): Promise<IStrategyTickResult> {
    this.params.logger.debug("ClientStrategy tick");

    if (!this._pendingSignal) {
      const pendingSignal = await GET_SIGNAL_FN(this);
      await this.setPendingSignal(pendingSignal);

      if (this._pendingSignal) {
        if (this.params.callbacks?.onOpen) {
          this.params.callbacks.onOpen(
            this.params.execution.context.symbol,
            this._pendingSignal,
            this._pendingSignal.priceOpen,
            this.params.execution.context.backtest
          );
        }

        const result: IStrategyTickResultOpened = {
          action: "opened",
          signal: this._pendingSignal,
          strategyName: this.params.method.context.strategyName,
          exchangeName: this.params.method.context.exchangeName,
          symbol: this.params.execution.context.symbol,
          currentPrice: this._pendingSignal.priceOpen,
        };

        if (this.params.callbacks?.onTick) {
          this.params.callbacks.onTick(
            this.params.execution.context.symbol,
            result,
            this.params.execution.context.backtest
          );
        }

        return result;
      }

      const currentPrice = await this.params.exchange.getAveragePrice(
        this.params.execution.context.symbol
      );

      if (this.params.callbacks?.onIdle) {
        this.params.callbacks.onIdle(
          this.params.execution.context.symbol,
          currentPrice,
          this.params.execution.context.backtest
        );
      }

      const result: IStrategyTickResultIdle = {
        action: "idle",
        signal: null,
        strategyName: this.params.method.context.strategyName,
        exchangeName: this.params.method.context.exchangeName,
        symbol: this.params.execution.context.symbol,
        currentPrice,
      };

      if (this.params.callbacks?.onTick) {
        this.params.callbacks.onTick(
          this.params.execution.context.symbol,
          result,
          this.params.execution.context.backtest
        );
      }

      return result;
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
      const closeTimestamp = this.params.execution.context.when.getTime();

      // Предупреждение о закрытии сигнала в убыток
      if (closeReason === "stop_loss") {
        this.params.logger.warn(
          `ClientStrategy tick: Signal closed with loss (stop_loss), PNL: ${pnl.pnlPercentage.toFixed(
            2
          )}%`
        );
      }

      // Предупреждение о закрытии сигнала в убыток
      if (closeReason === "time_expired" && pnl.pnlPercentage < 0) {
        this.params.logger.warn(
          `ClientStrategy tick: Signal closed with loss (time_expired), PNL: ${pnl.pnlPercentage.toFixed(
            2
          )}%`
        );
      }

      this.params.logger.debug("ClientStrategy closing", {
        symbol: this.params.execution.context.symbol,
        signalId: signal.id,
        reason: closeReason,
        priceClose: averagePrice,
        closeTimestamp,
        pnlPercentage: pnl.pnlPercentage,
      });

      if (this.params.callbacks?.onClose) {
        this.params.callbacks.onClose(
          this.params.execution.context.symbol,
          signal,
          averagePrice,
          this.params.execution.context.backtest
        );
      }

      await this.setPendingSignal(null);

      const result: IStrategyTickResultClosed = {
        action: "closed",
        signal: signal,
        currentPrice: averagePrice,
        closeReason: closeReason,
        closeTimestamp: closeTimestamp,
        pnl: pnl,
        strategyName: this.params.method.context.strategyName,
        exchangeName: this.params.method.context.exchangeName,
        symbol: this.params.execution.context.symbol,
      };

      if (this.params.callbacks?.onTick) {
        this.params.callbacks.onTick(
          this.params.execution.context.symbol,
          result,
          this.params.execution.context.backtest
        );
      }

      return result;
    }

    if (this.params.callbacks?.onActive) {
      this.params.callbacks.onActive(
        this.params.execution.context.symbol,
        signal,
        averagePrice,
        this.params.execution.context.backtest
      );
    }

    const result: IStrategyTickResultActive = {
      action: "active",
      signal: signal,
      currentPrice: averagePrice,
      strategyName: this.params.method.context.strategyName,
      exchangeName: this.params.method.context.exchangeName,
      symbol: this.params.execution.context.symbol,
    };

    if (this.params.callbacks?.onTick) {
      this.params.callbacks.onTick(
        this.params.execution.context.symbol,
        result,
        this.params.execution.context.backtest
      );
    }

    return result;
  }

  /**
   * Fast backtests a pending signal using historical candle data.
   *
   * Iterates through candles checking VWAP against TP/SL on each timeframe.
   * Starts from index 4 (needs 5 candles for VWAP calculation).
   * Always returns closed result (either TP/SL or time_expired).
   *
   * @param candles - Array of candles covering signal's minuteEstimatedTime
   * @returns Promise resolving to closed signal result with PNL
   * @throws Error if no pending signal or not in backtest mode
   *
   * @example
   * ```typescript
   * // After signal opened in backtest
   * const candles = await exchange.getNextCandles("BTCUSDT", "1m", signal.minuteEstimatedTime);
   * const result = await strategy.backtest(candles);
   * console.log(result.closeReason); // "take_profit" | "stop_loss" | "time_expired"
   * ```
   */
  public async backtest(
    candles: ICandleData[]
  ): Promise<IStrategyBacktestResult> {
    this.params.logger.debug("ClientStrategy backtest", {
      symbol: this.params.execution.context.symbol,
      candlesCount: candles.length,
    });

    const signal = this._pendingSignal;

    if (!signal) {
      throw new Error("ClientStrategy backtest: no pending signal");
    }

    if (!this.params.execution.context.backtest) {
      throw new Error("ClientStrategy backtest: running in live context");
    }

    // Предупреждение если недостаточно свечей для VWAP
    if (candles.length < 5) {
      this.params.logger.warn(
        `ClientStrategy backtest: Expected at least 5 candles for VWAP, got ${candles.length}`
      );
    }

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
        const closeTimestamp =
          recentCandles[recentCandles.length - 1].timestamp;

        this.params.logger.debug("ClientStrategy backtest closing", {
          symbol: this.params.execution.context.symbol,
          signalId: signal.id,
          reason: closeReason,
          priceClose: averagePrice,
          closeTimestamp,
          pnlPercentage: pnl.pnlPercentage,
        });

        // Предупреждение при убытке от stop_loss
        if (closeReason === "stop_loss") {
          this.params.logger.warn(
            `ClientStrategy backtest: Signal closed with loss (stop_loss), PNL: ${pnl.pnlPercentage.toFixed(
              2
            )}%`
          );
        }

        if (this.params.callbacks?.onClose) {
          this.params.callbacks.onClose(
            this.params.execution.context.symbol,
            signal,
            averagePrice,
            this.params.execution.context.backtest
          );
        }

        await this.setPendingSignal(null);

        const result: IStrategyTickResultClosed = {
          action: "closed",
          signal: signal,
          currentPrice: averagePrice,
          closeReason: closeReason,
          closeTimestamp: closeTimestamp,
          pnl: pnl,
          strategyName: this.params.method.context.strategyName,
          exchangeName: this.params.method.context.exchangeName,
          symbol: this.params.execution.context.symbol,
        };

        if (this.params.callbacks?.onTick) {
          this.params.callbacks.onTick(
            this.params.execution.context.symbol,
            result,
            this.params.execution.context.backtest
          );
        }

        return result;
      }
    }

    // Если TP/SL не достигнут за период, вычисляем VWAP из последних 5 свечей
    const lastFiveCandles = candles.slice(-5);
    const lastPrice = GET_AVG_PRICE_FN(lastFiveCandles);
    const closeTimestamp =
      lastFiveCandles[lastFiveCandles.length - 1].timestamp;

    const pnl = toProfitLossDto(signal, lastPrice);

    this.params.logger.debug("ClientStrategy backtest time_expired", {
      symbol: this.params.execution.context.symbol,
      signalId: signal.id,
      priceClose: lastPrice,
      closeTimestamp,
      pnlPercentage: pnl.pnlPercentage,
    });

    // Предупреждение при убытке от time_expired
    if (pnl.pnlPercentage < 0) {
      this.params.logger.warn(
        `ClientStrategy backtest: Signal closed with loss (time_expired), PNL: ${pnl.pnlPercentage.toFixed(
          2
        )}%`
      );
    }

    if (this.params.callbacks?.onClose) {
      this.params.callbacks.onClose(
        this.params.execution.context.symbol,
        signal,
        lastPrice,
        this.params.execution.context.backtest
      );
    }

    await this.setPendingSignal(null);

    const result: IStrategyTickResultClosed = {
      action: "closed",
      signal: signal,
      currentPrice: lastPrice,
      closeReason: "time_expired",
      closeTimestamp: closeTimestamp,
      pnl: pnl,
      strategyName: this.params.method.context.strategyName,
      exchangeName: this.params.method.context.exchangeName,
      symbol: this.params.execution.context.symbol,
    };

    if (this.params.callbacks?.onTick) {
      this.params.callbacks.onTick(
        this.params.execution.context.symbol,
        result,
        this.params.execution.context.backtest
      );
    }

    return result;
  }

  /**
   * Stops the strategy from generating new signals.
   *
   * Sets internal flag to prevent getSignal from being called.
   * Does NOT close active pending signals - they continue monitoring until TP/SL/time_expired.
   *
   * Use case: Graceful shutdown in live trading without forcing position closure.
   *
   * @returns Promise that resolves immediately when stop flag is set
   *
   * @example
   * ```typescript
   * // In Live.background() cancellation
   * await strategy.stop();
   * // Existing signal will continue until natural close
   * ```
   */
  public stop(): Promise<void> {
    this.params.logger.debug("ClientStrategy stop", {
      hasPendingSignal: this._pendingSignal !== null,
    });

    this._isStopped = true;

    return Promise.resolve();
  }
}

export default ClientStrategy;
