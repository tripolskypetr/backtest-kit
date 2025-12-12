import {
  IPartialState,
  PartialLevel,
  IPartialParams,
  IPartialData,
  IPartial,
} from "../interfaces/Partial.interface";
import { ISignalRow } from "../interfaces/Strategy.interface";
import { PersistPartialAdapter } from "../classes/Persist";
import { singleshot } from "functools-kit";

/**
 * Symbol marker indicating that partial state needs initialization.
 * Used as sentinel value for _states before waitForInit() is called.
 */
const NEED_FETCH = Symbol("need_fetch");

/**
 * Array of profit level milestones to track (10%, 20%, ..., 100%).
 * Each level is checked during profit() method to emit events for newly reached levels.
 */
const PROFIT_LEVELS: PartialLevel[] = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

/**
 * Array of loss level milestones to track (-10%, -20%, ..., -100%).
 * Each level is checked during loss() method to emit events for newly reached levels.
 */
const LOSS_LEVELS: PartialLevel[] = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

/**
 * Internal profit handler function for ClientPartial.
 *
 * Checks which profit levels have been reached and emits events for new levels only.
 * Uses Set-based deduplication to prevent duplicate events.
 *
 * @param symbol - Trading pair symbol
 * @param data - Signal row data
 * @param currentPrice - Current market price
 * @param revenuePercent - Current profit percentage (positive value)
 * @param backtest - True if backtest mode
 * @param when - Event timestamp
 * @param self - ClientPartial instance reference
 */
const HANDLE_PROFIT_FN = async (
  symbol: string,
  data: ISignalRow,
  currentPrice: number,
  revenuePercent: number,
  backtest: boolean,
  when: Date,
  self: ClientPartial
) => {
  if (self._states === NEED_FETCH) {
    throw new Error(
      "ClientPartial not initialized. Call waitForInit() before using."
    );
  }

  let state = self._states.get(data.id);
  if (!state) {
    state = {
      profitLevels: new Set(),
      lossLevels: new Set(),
    };
    self._states.set(data.id, state);
  }

  let shouldPersist = false;

  for (const level of PROFIT_LEVELS) {
    if (revenuePercent >= level && !state.profitLevels.has(level)) {
      state.profitLevels.add(level);
      shouldPersist = true;

      self.params.logger.debug("ClientPartial profit level reached", {
        symbol,
        signalId: data.id,
        level,
        revenuePercent,
        backtest,
      });

      await self.params.onProfit(
        symbol,
        data.strategyName,
        data.exchangeName,
        data,
        currentPrice,
        level,
        backtest,
        when.getTime()
      );
    }
  }

  if (shouldPersist) {
    await self._persistState(symbol, backtest);
  }
};

/**
 * Internal loss handler function for ClientPartial.
 *
 * Checks which loss levels have been reached and emits events for new levels only.
 * Uses Set-based deduplication to prevent duplicate events.
 * Converts negative lossPercent to absolute value for level comparison.
 *
 * @param symbol - Trading pair symbol
 * @param data - Signal row data
 * @param currentPrice - Current market price
 * @param lossPercent - Current loss percentage (negative value)
 * @param backtest - True if backtest mode
 * @param when - Event timestamp
 * @param self - ClientPartial instance reference
 */
const HANDLE_LOSS_FN = async (
  symbol: string,
  data: ISignalRow,
  currentPrice: number,
  lossPercent: number,
  backtest: boolean,
  when: Date,
  self: ClientPartial
) => {
  if (self._states === NEED_FETCH) {
    throw new Error(
      "ClientPartial not initialized. Call waitForInit() before using."
    );
  }

  let state = self._states.get(data.id);
  if (!state) {
    state = {
      profitLevels: new Set(),
      lossLevels: new Set(),
    };
    self._states.set(data.id, state);
  }

  const absLoss = Math.abs(lossPercent);
  let shouldPersist = false;

  for (const level of LOSS_LEVELS) {
    if (absLoss >= level && !state.lossLevels.has(level)) {
      state.lossLevels.add(level);
      shouldPersist = true;

      self.params.logger.debug("ClientPartial loss level reached", {
        symbol,
        signalId: data.id,
        level,
        lossPercent,
        backtest,
      });

      await self.params.onLoss(
        symbol,
        data.strategyName,
        data.exchangeName,
        data,
        currentPrice,
        level,
        backtest,
        when.getTime()
      );
    }
  }

  if (shouldPersist) {
    await self._persistState(symbol, backtest);
  }
};

/**
 * Internal initialization function for ClientPartial.
 *
 * Loads persisted partial state from disk and restores in-memory Maps.
 * Converts serialized arrays back to Sets for O(1) lookups.
 *
 * @param symbol - Trading pair symbol
 * @param self - ClientPartial instance reference
 */
const WAIT_FOR_INIT_FN = async (symbol: string, self: ClientPartial) => {
  self.params.logger.debug("ClientPartial waitForInit", { symbol });

  if (self._states === NEED_FETCH) {
    throw new Error(
      "ClientPartial not initialized. Call waitForInit() before using."
    );
  }

  const partialData = await PersistPartialAdapter.readPartialData(symbol);

  for (const [signalId, data] of Object.entries(partialData)) {
    const state: IPartialState = {
      profitLevels: new Set(data.profitLevels),
      lossLevels: new Set(data.lossLevels),
    };
    self._states.set(signalId, state);
  }

  self.params.logger.info("ClientPartial restored state", {
    symbol,
    signalCount: Object.keys(partialData).length,
  });
};

/**
 * Client implementation for partial profit/loss level tracking.
 *
 * Features:
 * - Tracks profit and loss level milestones (10%, 20%, 30%, etc) per signal
 * - Deduplicates events using Set-based state per signal ID
 * - Persists state to disk for crash recovery in live mode
 * - Emits events via onProfit/onLoss callbacks for each newly reached level
 *
 * Architecture:
 * - Created per signal ID by PartialConnectionService (memoized)
 * - State stored in Map<signalId, IPartialState> with Set<PartialLevel>
 * - Persistence handled by PersistPartialAdapter (atomic file writes)
 *
 * Lifecycle:
 * 1. Construction: Initialize empty Map
 * 2. waitForInit(): Load persisted state from disk
 * 3. profit()/loss(): Check levels, emit events, persist changes
 * 4. clear(): Remove signal state, persist, clean up memoized instance
 *
 * @example
 * ```typescript
 * import { ClientPartial } from "./client/ClientPartial";
 *
 * const partial = new ClientPartial({
 *   logger: loggerService,
 *   onProfit: async (symbol, data, price, level, backtest, timestamp) => {
 *     console.log(`Signal ${data.id} reached ${level}% profit at ${price}`);
 *     // Emit to partialProfitSubject
 *   },
 *   onLoss: async (symbol, data, price, level, backtest, timestamp) => {
 *     console.log(`Signal ${data.id} reached -${level}% loss at ${price}`);
 *     // Emit to partialLossSubject
 *   }
 * });
 *
 * // Initialize from persisted state
 * await partial.waitForInit("BTCUSDT");
 *
 * // During signal monitoring in ClientStrategy
 * const signal = { id: "abc123", priceOpen: 50000, position: "long", ... };
 *
 * // Price rises to $55000 (10% profit)
 * await partial.profit("BTCUSDT", signal, 55000, 10.0, false, new Date());
 * // Emits onProfit callback for 10% level
 *
 * // Price rises to $61000 (22% profit)
 * await partial.profit("BTCUSDT", signal, 61000, 22.0, false, new Date());
 * // Emits onProfit for 20% level only (10% already emitted)
 *
 * // Signal closes
 * await partial.clear("BTCUSDT", signal, 61000);
 * // State removed, changes persisted
 * ```
 */
export class ClientPartial implements IPartial {
  /**
   * Map of signal IDs to partial profit/loss state.
   * Uses NEED_FETCH sentinel before initialization.
   *
   * Each state contains:
   * - profitLevels: Set of reached profit levels (10, 20, 30, etc)
   * - lossLevels: Set of reached loss levels (10, 20, 30, etc)
   */
  _states: Map<string, IPartialState> | typeof NEED_FETCH = NEED_FETCH;

  /**
   * Creates new ClientPartial instance.
   *
   * @param params - Partial parameters (logger, onProfit, onLoss callbacks)
   */
  constructor(readonly params: IPartialParams) {
    this._states = new Map();
  }

  /**
   * Initializes partial state by loading from disk.
   *
   * Uses singleshot pattern to ensure initialization happens exactly once per symbol.
   * Reads persisted state from PersistPartialAdapter and restores to _states Map.
   *
   * Must be called before profit()/loss()/clear() methods.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise that resolves when initialization is complete
   *
   * @example
   * ```typescript
   * const partial = new ClientPartial(params);
   * await partial.waitForInit("BTCUSDT"); // Load persisted state
   * // Now profit()/loss() can be called
   * ```
   */
  public waitForInit = singleshot(
    async (symbol: string) => await WAIT_FOR_INIT_FN(symbol, this)
  );

  /**
   * Persists current partial state to disk.
   *
   * Converts in-memory Maps and Sets to JSON-serializable format:
   * - Map<signalId, IPartialState> → Record<signalId, IPartialData>
   * - Set<PartialLevel> → PartialLevel[]
   *
   * Called automatically after profit/loss level changes or clear().
   * Uses atomic file writes via PersistPartialAdapter.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise that resolves when persistence is complete
   */
  public async _persistState(symbol: string, backtest: boolean): Promise<void> {
    if (backtest) {
      return;
    }
    this.params.logger.debug("ClientPartial persistState", { symbol });
    if (this._states === NEED_FETCH) {
      throw new Error(
        "ClientPartial not initialized. Call waitForInit() before using."
      );
    }
    const partialData: Record<string, IPartialData> = {};
    for (const [signalId, state] of this._states.entries()) {
      partialData[signalId] = {
        profitLevels: Array.from(state.profitLevels),
        lossLevels: Array.from(state.lossLevels),
      };
    }
    await PersistPartialAdapter.writePartialData(partialData, symbol);
  }

  /**
   * Processes profit state and emits events for newly reached profit levels.
   *
   * Called by ClientStrategy during signal monitoring when revenuePercent > 0.
   * Iterates through PROFIT_LEVELS (10%, 20%, 30%, etc) and checks which
   * levels have been reached but not yet emitted (Set-based deduplication).
   *
   * For each new level:
   * 1. Adds level to state.profitLevels Set
   * 2. Logs debug message
   * 3. Calls params.onProfit callback (emits to partialProfitSubject)
   *
   * After all levels processed, persists state to disk if any new levels were found.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param data - Signal row data
   * @param currentPrice - Current market price
   * @param revenuePercent - Current profit percentage (positive value)
   * @param backtest - True if backtest mode, false if live mode
   * @param when - Event timestamp (current time for live, candle time for backtest)
   * @returns Promise that resolves when profit processing is complete
   *
   * @example
   * ```typescript
   * // Signal at $50000, price rises to $61000 (22% profit)
   * await partial.profit("BTCUSDT", signal, 61000, 22.0, false, new Date());
   * // Emits events for 10% and 20% levels (if not already emitted)
   * // State persisted to disk
   * ```
   */
  public async profit(
    symbol: string,
    data: ISignalRow,
    currentPrice: number,
    revenuePercent: number,
    backtest: boolean,
    when: Date
  ) {
    this.params.logger.debug("ClientPartial profit", {
      symbol,
      signalId: data.id,
      currentPrice,
      revenuePercent,
      backtest,
      when,
    });
    return await HANDLE_PROFIT_FN(
      symbol,
      data,
      currentPrice,
      revenuePercent,
      backtest,
      when,
      this
    );
  }

  /**
   * Processes loss state and emits events for newly reached loss levels.
   *
   * Called by ClientStrategy during signal monitoring when revenuePercent < 0.
   * Converts negative lossPercent to absolute value and iterates through
   * LOSS_LEVELS (10%, 20%, 30%, etc) to check which levels have been reached
   * but not yet emitted (Set-based deduplication).
   *
   * For each new level:
   * 1. Adds level to state.lossLevels Set
   * 2. Logs debug message
   * 3. Calls params.onLoss callback (emits to partialLossSubject)
   *
   * After all levels processed, persists state to disk if any new levels were found.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param data - Signal row data
   * @param currentPrice - Current market price
   * @param lossPercent - Current loss percentage (negative value)
   * @param backtest - True if backtest mode, false if live mode
   * @param when - Event timestamp (current time for live, candle time for backtest)
   * @returns Promise that resolves when loss processing is complete
   *
   * @example
   * ```typescript
   * // Signal at $50000, price drops to $39000 (-22% loss)
   * await partial.loss("BTCUSDT", signal, 39000, -22.0, false, new Date());
   * // Emits events for 10% and 20% loss levels (if not already emitted)
   * // State persisted to disk
   * ```
   */
  public async loss(
    symbol: string,
    data: ISignalRow,
    currentPrice: number,
    lossPercent: number,
    backtest: boolean,
    when: Date
  ) {
    this.params.logger.debug("ClientPartial loss", {
      symbol,
      signalId: data.id,
      currentPrice,
      lossPercent,
      backtest,
      when,
    });
    return await HANDLE_LOSS_FN(
      symbol,
      data,
      currentPrice,
      lossPercent,
      backtest,
      when,
      this
    );
  }

  /**
   * Clears partial profit/loss state for a signal when it closes.
   *
   * Called by ClientStrategy when signal completes (TP/SL/time_expired).
   * Removes signal's state from _states Map and persists changes to disk.
   *
   * After clear() completes:
   * - Signal state removed from memory (_states.delete)
   * - Changes persisted to disk (PersistPartialAdapter.writePartialData)
   * - Memoized ClientPartial instance cleared in PartialConnectionService
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param data - Signal row data
   * @param priceClose - Final closing price
   * @returns Promise that resolves when clear is complete
   * @throws Error if ClientPartial not initialized (waitForInit not called)
   *
   * @example
   * ```typescript
   * // Signal closes at take profit
   * await partial.clear("BTCUSDT", signal, 52000);
   * // State removed: _states.delete(signal.id)
   * // Persisted: ./dump/data/partial/BTCUSDT/levels.json updated
   * // Cleanup: PartialConnectionService.getPartial.clear(signal.id)
   * ```
   */
  public async clear(
    symbol: string,
    data: ISignalRow,
    priceClose: number,
    backtest: boolean
  ) {
    this.params.logger.log("ClientPartial clear", {
      symbol,
      data,
      priceClose,
      backtest,
    });
    if (this._states === NEED_FETCH) {
      throw new Error(
        "ClientPartial not initialized. Call waitForInit() before using."
      );
    }
    this._states.delete(data.id);
    await this._persistState(symbol, backtest);
  }
}

export default ClientPartial;
