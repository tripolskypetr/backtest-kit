import { compose, singleshot } from "functools-kit";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { IStrategyPnL, StrategyName } from "../interfaces/Strategy.interface";
import { syncSubject } from "../config/emitters";
import bt from "../lib";

const BROKER_METHOD_NAME_COMMIT_SIGNAL_OPEN = "BrokerAdapter.commitSignalOpen";
const BROKER_METHOD_NAME_COMMIT_SIGNAL_CLOSE = "BrokerAdapter.commitSignalClose";
const BROKER_METHOD_NAME_COMMIT_PARTIAL_PROFIT = "BrokerAdapter.commitPartialProfit";
const BROKER_METHOD_NAME_COMMIT_PARTIAL_LOSS = "BrokerAdapter.commitPartialLoss";
const BROKER_METHOD_NAME_COMMIT_TRAILING_STOP = "BrokerAdapter.commitTrailingStop";
const BROKER_METHOD_NAME_COMMIT_TRAILING_TAKE = "BrokerAdapter.commitTrailingTake";
const BROKER_METHOD_NAME_COMMIT_BREAKEVEN = "BrokerAdapter.commitBreakeven";
const BROKER_METHOD_NAME_COMMIT_AVERAGE_BUY = "BrokerAdapter.commitAverageBuy";
const BROKER_METHOD_NAME_USE_BROKER_ADAPTER = "BrokerAdapter.useBrokerAdapter";
const BROKER_METHOD_NAME_ENABLE = "BrokerAdapter.enable";
const BROKER_METHOD_NAME_DISABLE = "BrokerAdapter.disable";

/**
 * Payload for the signal-open broker event.
 *
 * Emitted automatically via syncSubject when a new pending signal is activated.
 * Forwarded to the registered IBroker adapter via `onSignalOpenCommit`.
 *
 * @example
 * ```typescript
 * const payload: BrokerSignalOpenPayload = {
 *   symbol: "BTCUSDT",
 *   cost: 100,
 *   position: "long",
 *   priceOpen: 50000,
 *   priceTakeProfit: 55000,
 *   priceStopLoss: 48000,
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerSignalOpenPayload = {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Dollar cost of the position entry (CC_POSITION_ENTRY_COST) */
  cost: number;
  /** Position direction */
  position: "long" | "short";
  /** Activation price — the price at which the signal became active */
  priceOpen: number;
  /** Original take-profit price from the signal */
  priceTakeProfit: number;
  /** Original stop-loss price from the signal */
  priceStopLoss: number;
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

/**
 * Payload for the signal-close broker event.
 *
 * Emitted automatically via syncSubject when a pending signal is closed (SL/TP hit or manual close).
 * Forwarded to the registered IBroker adapter via `onSignalCloseCommit`.
 *
 * @example
 * ```typescript
 * const payload: BrokerSignalClosePayload = {
 *   symbol: "BTCUSDT",
 *   cost: 100,
 *   position: "long",
 *   currentPrice: 54000,
 *   priceTakeProfit: 55000,
 *   priceStopLoss: 48000,
 *   totalEntries: 2,
 *   totalPartials: 1,
 *   pnl: { profit: 80, loss: 0, volume: 100 },
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerSignalClosePayload = {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Total dollar cost basis of the position at close */
  cost: number;
  /** Position direction */
  position: "long" | "short";
  /** Market price at the moment of close */
  currentPrice: number;
  /** Original take-profit price from the signal */
  priceTakeProfit: number;
  /** Original stop-loss price from the signal */
  priceStopLoss: number;
  /** Total number of DCA entries (including initial open) */
  totalEntries: number;
  /** Total number of partial closes executed before final close */
  totalPartials: number;
  /** Realized PnL breakdown for the closed position */
  pnl: IStrategyPnL;
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

/**
 * Payload for a partial-profit close broker event.
 *
 * Forwarded to the registered IBroker adapter via `onPartialProfitCommit`.
 * Called explicitly after all validations pass, before `strategyCoreService.partialProfit()`.
 *
 * @example
 * ```typescript
 * const payload: BrokerPartialProfitPayload = {
 *   symbol: "BTCUSDT",
 *   percentToClose: 30,
 *   cost: 30,
 *   currentPrice: 52000,
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerPartialProfitPayload = {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Percentage of the position to close (0–100) */
  percentToClose: number;
  /** Dollar value of the portion being closed */
  cost: number;
  /** Current market price at which the partial close executes */
  currentPrice: number;
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

/**
 * Payload for a partial-loss close broker event.
 *
 * Forwarded to the registered IBroker adapter via `onPartialLossCommit`.
 * Called explicitly after all validations pass, before `strategyCoreService.partialLoss()`.
 *
 * @example
 * ```typescript
 * const payload: BrokerPartialLossPayload = {
 *   symbol: "BTCUSDT",
 *   percentToClose: 40,
 *   cost: 40,
 *   currentPrice: 48500,
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerPartialLossPayload = {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Percentage of the position to close (0–100) */
  percentToClose: number;
  /** Dollar value of the portion being closed */
  cost: number;
  /** Current market price at which the partial close executes */
  currentPrice: number;
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

/**
 * Payload for a trailing stop-loss update broker event.
 *
 * Forwarded to the registered IBroker adapter via `onTrailingStopCommit`.
 * Called explicitly after all validations pass, before `strategyCoreService.trailingStop()`.
 * `newStopLossPrice` is the absolute SL price computed from percentShift + original SL + effectivePriceOpen.
 *
 * @example
 * ```typescript
 * // LONG: entry=100, originalSL=90, percentShift=-5 → newSL=95
 * const payload: BrokerTrailingStopPayload = {
 *   symbol: "BTCUSDT",
 *   percentShift: -5,
 *   currentPrice: 102,
 *   newStopLossPrice: 95,
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerTrailingStopPayload = {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Percentage shift applied to the ORIGINAL SL distance (-100 to 100) */
  percentShift: number;
  /** Current market price used for intrusion validation */
  currentPrice: number;
  /** Absolute stop-loss price after applying percentShift */
  newStopLossPrice: number;
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

/**
 * Payload for a trailing take-profit update broker event.
 *
 * Forwarded to the registered IBroker adapter via `onTrailingTakeCommit`.
 * Called explicitly after all validations pass, before `strategyCoreService.trailingTake()`.
 * `newTakeProfitPrice` is the absolute TP price computed from percentShift + original TP + effectivePriceOpen.
 *
 * @example
 * ```typescript
 * // LONG: entry=100, originalTP=110, percentShift=-3 → newTP=107
 * const payload: BrokerTrailingTakePayload = {
 *   symbol: "BTCUSDT",
 *   percentShift: -3,
 *   currentPrice: 102,
 *   newTakeProfitPrice: 107,
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerTrailingTakePayload = {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Percentage shift applied to the ORIGINAL TP distance (-100 to 100) */
  percentShift: number;
  /** Current market price used for intrusion validation */
  currentPrice: number;
  /** Absolute take-profit price after applying percentShift */
  newTakeProfitPrice: number;
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

/**
 * Payload for a breakeven operation broker event.
 *
 * Forwarded to the registered IBroker adapter via `onBreakevenCommit`.
 * Called explicitly after all validations pass, before `strategyCoreService.breakeven()`.
 * `newStopLossPrice` equals `effectivePriceOpen` (entry price).
 * `newTakeProfitPrice` equals `_trailingPriceTakeProfit ?? priceTakeProfit` (TP is unchanged).
 *
 * @example
 * ```typescript
 * // LONG: entry=100, currentPrice=100.5, newSL=100 (entry), newTP=110 (unchanged)
 * const payload: BrokerBreakevenPayload = {
 *   symbol: "BTCUSDT",
 *   currentPrice: 100.5,
 *   newStopLossPrice: 100,
 *   newTakeProfitPrice: 110,
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerBreakevenPayload = {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Current market price at the moment breakeven is triggered */
  currentPrice: number;
  /** New stop-loss price = effectivePriceOpen (the position's effective entry price) */
  newStopLossPrice: number;
  /** Effective take-profit price = _trailingPriceTakeProfit ?? priceTakeProfit (unchanged by breakeven) */
  newTakeProfitPrice: number;
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

/**
 * Payload for a DCA average-buy entry broker event.
 *
 * Forwarded to the registered IBroker adapter via `onAverageBuyCommit`.
 * Called explicitly after all validations pass, before `strategyCoreService.averageBuy()`.
 * `currentPrice` is the market price at which the new DCA entry is added.
 *
 * @example
 * ```typescript
 * const payload: BrokerAverageBuyPayload = {
 *   symbol: "BTCUSDT",
 *   currentPrice: 42000,
 *   cost: 100,
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerAverageBuyPayload = {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Market price at which the DCA entry is placed */
  currentPrice: number;
  /** Dollar amount of the new DCA entry (default: CC_POSITION_ENTRY_COST) */
  cost: number;
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

export interface IBroker {
  waitForInit(): Promise<void>;

  onSignalCloseCommit(payload: BrokerSignalClosePayload): Promise<void>;

  onSignalOpenCommit(payload: BrokerSignalOpenPayload): Promise<void>;

  onPartialProfitCommit(payload: BrokerPartialProfitPayload): Promise<void>;

  onPartialLossCommit(payload: BrokerPartialLossPayload): Promise<void>;

  onTrailingStopCommit(payload: BrokerTrailingStopPayload): Promise<void>;

  onTrailingTakeCommit(payload: BrokerTrailingTakePayload): Promise<void>;

  onBreakevenCommit(payload: BrokerBreakevenPayload): Promise<void>;

  onAverageBuyCommit(payload: BrokerAverageBuyPayload): Promise<void>;
}

export type TBrokerCtor = new () => Partial<IBroker>;

export class BrokerProxy implements IBroker {
  constructor(readonly _instance: Partial<IBroker>) {}
  public waitForInit = singleshot(async (): Promise<void> => {
    if (this._instance.waitForInit) {
      await this._instance.waitForInit();
    }
  });
  public async onSignalOpenCommit(
    payload: BrokerSignalOpenPayload,
  ): Promise<void> {
    if (this._instance.onSignalOpenCommit) {
      await this._instance.onSignalOpenCommit(payload);
    }
  }
  public async onSignalCloseCommit(
    payload: BrokerSignalClosePayload,
  ): Promise<void> {
    if (this._instance.onSignalCloseCommit) {
      await this._instance.onSignalCloseCommit(payload);
    }
  }
  public async onPartialProfitCommit(
    payload: BrokerPartialProfitPayload,
  ): Promise<void> {
    if (this._instance.onPartialProfitCommit) {
      await this._instance.onPartialProfitCommit(payload);
    }
  }
  public async onPartialLossCommit(
    payload: BrokerPartialLossPayload,
  ): Promise<void> {
    if (this._instance.onPartialLossCommit) {
      await this._instance.onPartialLossCommit(payload);
    }
  }
  public async onTrailingStopCommit(
    payload: BrokerTrailingStopPayload,
  ): Promise<void> {
    if (this._instance.onTrailingStopCommit) {
      await this._instance.onTrailingStopCommit(payload);
    }
  }
  public async onTrailingTakeCommit(
    payload: BrokerTrailingTakePayload,
  ): Promise<void> {
    if (this._instance.onTrailingTakeCommit) {
      await this._instance.onTrailingTakeCommit(payload);
    }
  }
  public async onBreakevenCommit(
    payload: BrokerBreakevenPayload,
  ): Promise<void> {
    if (this._instance.onBreakevenCommit) {
      await this._instance.onBreakevenCommit(payload);
    }
  }
  public async onAverageBuyCommit(
    payload: BrokerAverageBuyPayload,
  ): Promise<void> {
    if (this._instance.onAverageBuyCommit) {
      await this._instance.onAverageBuyCommit(payload);
    }
  }
}

/**
 * Facade for broker integration — intercepts all commit* operations before DI-core mutations.
 *
 * Acts as a transaction control point: if any commit* method throws, the DI-core mutation
 * is never reached and the state remains unchanged.
 *
 * In backtest mode all commit* calls are silently skipped (payload.backtest === true).
 * In live mode the call is forwarded to the registered IBroker adapter via BrokerProxy.
 *
 * signal-open and signal-close events are routed automatically via syncSubject subscription
 * (activated on `enable()`). All other commit* methods are called explicitly from
 * Live.ts / Backtest.ts / strategy.ts before the corresponding strategyCoreService call.
 *
 * @example
 * ```typescript
 * import { Broker } from "backtest-kit";
 *
 * // Register a custom broker adapter
 * Broker.useBrokerAdapter(MyBrokerAdapter);
 *
 * // Activate syncSubject subscription (signal-open / signal-close routing)
 * const dispose = Broker.enable();
 *
 * // ... run strategy ...
 *
 * // Deactivate when done
 * Broker.disable();
 * ```
 */
export class BrokerAdapter {
  private _brokerInstance: BrokerProxy | null = null;

  /**
   * Forwards a signal-open event to the registered broker adapter.
   *
   * Called automatically via syncSubject when `enable()` is active.
   * Skipped silently in backtest mode or when no adapter is registered.
   *
   * @param payload - Signal open details: symbol, cost, position, prices, context, backtest flag
   *
   * @example
   * ```typescript
   * await Broker.commitSignalOpen({
   *   symbol: "BTCUSDT",
   *   cost: 100,
   *   position: "long",
   *   priceOpen: 50000,
   *   priceTakeProfit: 55000,
   *   priceStopLoss: 48000,
   *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
   *   backtest: false,
   * });
   * ```
   */
  public commitSignalOpen = async (payload: BrokerSignalOpenPayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_SIGNAL_OPEN, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    await this._brokerInstance?.onSignalOpenCommit(payload);
  };

  /**
   * Forwards a signal-close event to the registered broker adapter.
   *
   * Called automatically via syncSubject when `enable()` is active.
   * Skipped silently in backtest mode or when no adapter is registered.
   *
   * @param payload - Signal close details: symbol, cost, position, currentPrice, pnl, context, backtest flag
   *
   * @example
   * ```typescript
   * await Broker.commitSignalClose({
   *   symbol: "BTCUSDT",
   *   cost: 100,
   *   position: "long",
   *   currentPrice: 54000,
   *   priceTakeProfit: 55000,
   *   priceStopLoss: 48000,
   *   totalEntries: 2,
   *   totalPartials: 1,
   *   pnl: { profit: 80, loss: 0, volume: 100 },
   *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
   *   backtest: false,
   * });
   * ```
   */
  public commitSignalClose = async (payload: BrokerSignalClosePayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_SIGNAL_CLOSE, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    await this._brokerInstance?.onSignalCloseCommit(payload);
  };

  /**
   * Intercepts a partial-profit close before DI-core mutation.
   *
   * Called explicitly from Live.ts / Backtest.ts / strategy.ts after all validations pass,
   * but before `strategyCoreService.partialProfit()`. If this method throws, the DI mutation
   * is skipped and state remains unchanged.
   *
   * Skipped silently in backtest mode or when no adapter is registered.
   *
   * @param payload - Partial profit details: symbol, percentToClose, cost (dollar value), currentPrice, context, backtest flag
   *
   * @example
   * ```typescript
   * await Broker.commitPartialProfit({
   *   symbol: "BTCUSDT",
   *   percentToClose: 30,
   *   cost: 30,
   *   currentPrice: 52000,
   *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
   *   backtest: false,
   * });
   * ```
   */
  public commitPartialProfit = async (payload: BrokerPartialProfitPayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_PARTIAL_PROFIT, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    await this._brokerInstance?.onPartialProfitCommit(payload);
  };

  /**
   * Intercepts a partial-loss close before DI-core mutation.
   *
   * Called explicitly from Live.ts / Backtest.ts / strategy.ts after all validations pass,
   * but before `strategyCoreService.partialLoss()`. If this method throws, the DI mutation
   * is skipped and state remains unchanged.
   *
   * Skipped silently in backtest mode or when no adapter is registered.
   *
   * @param payload - Partial loss details: symbol, percentToClose, cost (dollar value), currentPrice, context, backtest flag
   *
   * @example
   * ```typescript
   * await Broker.commitPartialLoss({
   *   symbol: "BTCUSDT",
   *   percentToClose: 40,
   *   cost: 40,
   *   currentPrice: 48500,
   *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
   *   backtest: false,
   * });
   * ```
   */
  public commitPartialLoss = async (payload: BrokerPartialLossPayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_PARTIAL_LOSS, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    await this._brokerInstance?.onPartialLossCommit(payload);
  };

  /**
   * Intercepts a trailing stop-loss update before DI-core mutation.
   *
   * Called explicitly after all validations pass, but before `strategyCoreService.trailingStop()`.
   * `newStopLossPrice` is the absolute price computed from percentShift + original SL + effectivePriceOpen.
   *
   * Skipped silently in backtest mode or when no adapter is registered.
   *
   * @param payload - Trailing stop details: symbol, percentShift, currentPrice, newStopLossPrice, context, backtest flag
   *
   * @example
   * ```typescript
   * // LONG: entry=100, originalSL=90, percentShift=-5 → newSL=95
   * await Broker.commitTrailingStop({
   *   symbol: "BTCUSDT",
   *   percentShift: -5,
   *   currentPrice: 102,
   *   newStopLossPrice: 95,
   *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
   *   backtest: false,
   * });
   * ```
   */
  public commitTrailingStop = async (payload: BrokerTrailingStopPayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_TRAILING_STOP, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    await this._brokerInstance?.onTrailingStopCommit(payload);
  };

  /**
   * Intercepts a trailing take-profit update before DI-core mutation.
   *
   * Called explicitly after all validations pass, but before `strategyCoreService.trailingTake()`.
   * `newTakeProfitPrice` is the absolute price computed from percentShift + original TP + effectivePriceOpen.
   *
   * Skipped silently in backtest mode or when no adapter is registered.
   *
   * @param payload - Trailing take details: symbol, percentShift, currentPrice, newTakeProfitPrice, context, backtest flag
   *
   * @example
   * ```typescript
   * // LONG: entry=100, originalTP=110, percentShift=-3 → newTP=107
   * await Broker.commitTrailingTake({
   *   symbol: "BTCUSDT",
   *   percentShift: -3,
   *   currentPrice: 102,
   *   newTakeProfitPrice: 107,
   *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
   *   backtest: false,
   * });
   * ```
   */
  public commitTrailingTake = async (payload: BrokerTrailingTakePayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_TRAILING_TAKE, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    await this._brokerInstance?.onTrailingTakeCommit(payload);
  };

  /**
   * Intercepts a breakeven operation before DI-core mutation.
   *
   * Called explicitly after all validations pass, but before `strategyCoreService.breakeven()`.
   * `newStopLossPrice` equals effectivePriceOpen (entry price).
   * `newTakeProfitPrice` equals `_trailingPriceTakeProfit ?? priceTakeProfit` (TP is unchanged by breakeven).
   *
   * Skipped silently in backtest mode or when no adapter is registered.
   *
   * @param payload - Breakeven details: symbol, currentPrice, newStopLossPrice, newTakeProfitPrice, context, backtest flag
   *
   * @example
   * ```typescript
   * // LONG: entry=100, currentPrice=100.5, newSL=100 (entry), newTP=110 (unchanged)
   * await Broker.commitBreakeven({
   *   symbol: "BTCUSDT",
   *   currentPrice: 100.5,
   *   newStopLossPrice: 100,
   *   newTakeProfitPrice: 110,
   *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
   *   backtest: false,
   * });
   * ```
   */
  public commitBreakeven = async (payload: BrokerBreakevenPayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_BREAKEVEN, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    await this._brokerInstance?.onBreakevenCommit(payload);
  };

  /**
   * Intercepts a DCA average-buy entry before DI-core mutation.
   *
   * Called explicitly after all validations pass, but before `strategyCoreService.averageBuy()`.
   * `currentPrice` is the market price at which the new DCA entry is added.
   * `cost` is the dollar amount of the new entry (default: CC_POSITION_ENTRY_COST).
   *
   * Skipped silently in backtest mode or when no adapter is registered.
   *
   * @param payload - Average buy details: symbol, currentPrice, cost, context, backtest flag
   *
   * @example
   * ```typescript
   * // Add DCA entry at current market price
   * await Broker.commitAverageBuy({
   *   symbol: "BTCUSDT",
   *   currentPrice: 42000,
   *   cost: 100,
   *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
   *   backtest: false,
   * });
   * ```
   */
  public commitAverageBuy = async (payload: BrokerAverageBuyPayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_AVERAGE_BUY, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    await this._brokerInstance?.onAverageBuyCommit(payload);
  };

  /**
   * Registers a broker adapter instance or constructor to receive commit* callbacks.
   *
   * Must be called before `enable()`. Accepts either a class constructor (called with `new`)
   * or an already-instantiated object implementing `Partial<IBroker>`.
   *
   * @param broker - IBroker constructor or instance
   *
   * @example
   * ```typescript
   * import { Broker } from "backtest-kit";
   *
   * // Register via constructor
   * Broker.useBrokerAdapter(MyBrokerAdapter);
   *
   * // Register via instance
   * Broker.useBrokerAdapter(new MyBrokerAdapter());
   * ```
   */
  public useBrokerAdapter = (broker: TBrokerCtor | Partial<IBroker>) => {
    bt.loggerService.info(BROKER_METHOD_NAME_USE_BROKER_ADAPTER, {});
    if (typeof broker === "function") {
      const instance = Reflect.construct(broker, []);
      this._brokerInstance = new BrokerProxy(instance);
      return;
    }
    this._brokerInstance = new BrokerProxy(broker);
  };

  /**
   * Activates the broker: subscribes to syncSubject for signal-open / signal-close routing.
   *
   * Must be called after `useBrokerAdapter()`. Returns a dispose function that unsubscribes
   * from syncSubject (equivalent to calling `disable()`).
   *
   * Calling `enable()` without a registered adapter throws immediately.
   * Calling `enable()` more than once is idempotent (singleshot guard).
   *
   * @returns Dispose function — call it to deactivate the broker subscription
   *
   * @example
   * ```typescript
   * import { Broker } from "backtest-kit";
   *
   * Broker.useBrokerAdapter(MyBrokerAdapter);
   * const dispose = Broker.enable();
   *
   * // ... run backtest or live session ...
   *
   * dispose(); // or Broker.disable()
   * ```
   */
  public enable = singleshot(() => {
    bt.loggerService.info(BROKER_METHOD_NAME_ENABLE, {});
    if (!this._brokerInstance) {
      this.enable.clear();
      throw new Error("No broker instance provided. Call Broker.useBrokerAdapter first.");
    }

    const unSignalOpen = syncSubject.subscribe(async (event) => {
      if (event.action !== "signal-open") {
        return;
      }
      await this.commitSignalOpen({
        position: event.signal.position,
        cost: event.signal.cost,
        symbol: event.symbol,
        priceTakeProfit: event.signal.priceTakeProfit,
        priceStopLoss: event.signal.priceStopLoss,
        priceOpen: event.signal.priceOpen,
        context: {
          strategyName: event.strategyName,
          exchangeName: event.exchangeName,
          frameName: event.frameName,
        },
        backtest: event.backtest,
      });
    });

    const unSignalClose = syncSubject.subscribe(async (event) => {
      if (event.action !== "signal-close") {
        return;
      }
      await this.commitSignalClose({
        position: event.signal.position,
        currentPrice: event.currentPrice,
        cost: event.signal.cost,
        symbol: event.symbol,
        pnl: event.pnl,
        totalEntries: event.totalEntries,
        totalPartials: event.totalPartials,
        priceStopLoss: event.signal.priceStopLoss,
        priceTakeProfit: event.signal.priceTakeProfit,
        context: {
          strategyName: event.strategyName,
          exchangeName: event.exchangeName,
          frameName: event.frameName,
        },
        backtest: event.backtest,
      });
    });

    const disposeFn = compose(
      () => unSignalOpen(),
      () => unSignalClose(),
    );

    return () => {
      this.enable.clear();
      disposeFn();
    };
  });

  /**
   * Deactivates the broker: unsubscribes from syncSubject and resets the singleshot guard.
   *
   * Idempotent — safe to call even if `enable()` was never called.
   * After `disable()`, `enable()` can be called again to reactivate.
   *
   * @example
   * ```typescript
   * import { Broker } from "backtest-kit";
   *
   * Broker.useBrokerAdapter(MyBrokerAdapter);
   * Broker.enable();
   *
   * // Stop receiving events
   * Broker.disable();
   * ```
   */
  public disable = () => {
    bt.loggerService.info(BROKER_METHOD_NAME_DISABLE, {});
    if (this.enable.hasValue()) {
      const lastSubscription = this.enable();
      lastSubscription();
    }
  };
}

/**
 * Global singleton instance of BrokerAdapter.
 * Provides static-like access to all broker commit methods and lifecycle controls.
 *
 * @example
 * ```typescript
 * import { Broker } from "backtest-kit";
 *
 * Broker.useBrokerAdapter(MyBrokerAdapter);
 * const dispose = Broker.enable();
 * ```
 */
export const Broker = new BrokerAdapter();
