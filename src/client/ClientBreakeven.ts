import {
  IBreakevenState,
  IBreakevenData,
  IBreakevenParams,
  IBreakeven,
} from "../interfaces/Breakeven.interface";
import { IPublicSignalRow, ISignalRow, StrategyName } from "../interfaces/Strategy.interface";
import { PersistBreakevenAdapter } from "../classes/Persist";
import { singleshot } from "functools-kit";
import { GLOBAL_CONFIG } from "../config/params";

/**
 * Symbol marker indicating that breakeven state needs initialization.
 * Used as sentinel value for _states before waitForInit() is called.
 */
const NEED_FETCH = Symbol("need_fetch");

/**
 * Internal breakeven check handler function for ClientBreakeven.
 *
 * Checks if breakeven conditions are met and emits event if triggered.
 * Uses state-based deduplication to ensure event is emitted only once per signal.
 *
 * Threshold calculation:
 * - breakevenThreshold = (CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) * 2
 * - For LONG: threshold reached when price >= entry * (1 + threshold%)
 * - For SHORT: threshold reached when price <= entry * (1 - threshold%)
 *
 * @param symbol - Trading pair symbol
 * @param data - Signal row data
 * @param currentPrice - Current market price
 * @param backtest - True if backtest mode
 * @param when - Event timestamp
 * @param self - ClientBreakeven instance reference
 */
const HANDLE_BREAKEVEN_FN = async (
  symbol: string,
  data: IPublicSignalRow,
  currentPrice: number,
  backtest: boolean,
  when: Date,
  self: ClientBreakeven
) => {
  if (self._states === NEED_FETCH) {
    throw new Error(
      "ClientBreakeven not initialized. Call waitForInit() before using."
    );
  }

  if (data.id !== self.params.signalId) {
    throw new Error(
      `Signal ID mismatch: expected ${self.params.signalId}, got ${data.id}`
    );
  }

  let state = self._states.get(data.id);
  if (!state) {
    state = {
      reached: false,
    };
    self._states.set(data.id, state);
  }

  // Skip if breakeven already reached
  if (state.reached) {
    self.params.logger.debug("ClientBreakeven check: already reached", {
      symbol,
      signalId: data.id,
    });
    return;
  }

  // Calculate breakeven threshold based on slippage and fees
  const breakevenThresholdPercent =
    (GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE + GLOBAL_CONFIG.CC_PERCENT_FEE) * 2 + GLOBAL_CONFIG.CC_BREAKEVEN_THRESHOLD;

  // Check if threshold reached
  let thresholdPrice: number;
  let isThresholdReached: boolean;

  if (data.position === "long") {
    // LONG: threshold reached when price goes UP by breakevenThresholdPercent from entry
    thresholdPrice = data.priceOpen * (1 + breakevenThresholdPercent / 100);
    isThresholdReached = currentPrice >= thresholdPrice;
  } else {
    // SHORT: threshold reached when price goes DOWN by breakevenThresholdPercent from entry
    thresholdPrice = data.priceOpen * (1 - breakevenThresholdPercent / 100);
    isThresholdReached = currentPrice <= thresholdPrice;
  }

  if (!isThresholdReached) {
    self.params.logger.debug("ClientBreakeven check: threshold not reached", {
      symbol,
      signalId: data.id,
      position: data.position,
      priceOpen: data.priceOpen,
      currentPrice,
      thresholdPrice,
      breakevenThresholdPercent,
    });
    return;
  }

  // Mark as reached
  state.reached = true;

  self.params.logger.info("ClientBreakeven reached", {
    symbol,
    signalId: data.id,
    position: data.position,
    priceOpen: data.priceOpen,
    currentPrice,
    thresholdPrice,
    breakevenThresholdPercent,
    backtest,
  });

  // Emit event
  await self.params.onBreakeven(
    symbol,
    data.strategyName,
    data.exchangeName,
    data.frameName,
    data,
    currentPrice,
    backtest,
    when.getTime()
  );

  // Persist state
  await self._persistState(symbol, data.strategyName);
};

/**
 * Internal initialization function for ClientBreakeven.
 *
 * Loads persisted breakeven state from disk and restores in-memory Maps.
 *
 * ONLY runs in LIVE mode (backtest=false). In backtest mode, state is not persisted.
 *
 * @param symbol - Trading pair symbol
 * @param strategyName - Strategy identifier
 * @param self - ClientBreakeven instance reference
 */
const WAIT_FOR_INIT_FN = async (symbol: string, strategyName: StrategyName, self: ClientBreakeven) => {
  self.params.logger.debug("ClientBreakeven waitForInit", {
    symbol,
    strategyName,
    backtest: self.params.backtest
  });

  if (self._states !== NEED_FETCH) {
    throw new Error(
      "ClientBreakeven WAIT_FOR_INIT_FN should be called once!"
    );
  }

  self._states = new Map();

  // Skip persistence in backtest mode
  if (self.params.backtest) {
    self.params.logger.debug("ClientBreakeven waitForInit: skipping persist read in backtest mode");
    return;
  }

  const breakevenData = await PersistBreakevenAdapter.readBreakevenData(symbol, strategyName);

  for (const [signalId, data] of Object.entries(breakevenData)) {
    const state: IBreakevenState = {
      reached: data.reached,
    };
    self._states.set(signalId, state);
  }

  self.params.logger.info("ClientBreakeven restored state", {
    symbol,
    strategyName,
    signalCount: Object.keys(breakevenData).length,
  });
};

/**
 * Client implementation for breakeven tracking.
 *
 * Features:
 * - Tracks when a signal's stop-loss is moved to breakeven (entry price)
 * - Deduplicates events using state per signal ID (reached: boolean)
 * - Persists state to disk for crash recovery in live mode
 * - Emits events via onBreakeven callback when threshold is reached
 *
 * Architecture:
 * - Created per signal ID by BreakevenConnectionService (memoized)
 * - State stored in Map<signalId, IBreakevenState> with reached flag
 * - Persistence handled by PersistBreakevenAdapter (atomic file writes)
 *
 * Lifecycle:
 * 1. Construction: Initialize empty Map
 * 2. waitForInit(): Load persisted state from disk
 * 3. check(): Verify threshold, emit event, persist changes
 * 4. clear(): Remove signal state, persist, clean up memoized instance
 *
 * @example
 * ```typescript
 * import { ClientBreakeven } from "./client/ClientBreakeven";
 *
 * const breakeven = new ClientBreakeven({
 *   logger: loggerService,
 *   onBreakeven: async (symbol, data, price, backtest, timestamp) => {
 *     console.log(`Signal ${data.id} reached breakeven at ${price}`);
 *     // Emit to breakevenSubject
 *   }
 * });
 *
 * // Initialize from persisted state
 * await breakeven.waitForInit("BTCUSDT");
 *
 * // During signal monitoring in ClientStrategy
 * const signal = { id: "abc123", priceOpen: 100, position: "long", ... };
 *
 * // Price rises to 100.3 (threshold=0.4%, not reached yet)
 * await breakeven.check("BTCUSDT", signal, 100.3, false, new Date());
 * // No event emitted
 *
 * // Price rises to 100.5 (threshold reached!)
 * await breakeven.check("BTCUSDT", signal, 100.5, false, new Date());
 * // Emits onBreakeven callback
 *
 * // Price rises to 101 (already reached)
 * await breakeven.check("BTCUSDT", signal, 101, false, new Date());
 * // No event emitted (already reached)
 *
 * // Signal closes
 * await breakeven.clear("BTCUSDT", signal, 101);
 * // State removed, changes persisted
 * ```
 */
export class ClientBreakeven implements IBreakeven {
  /**
   * Map of signal IDs to breakeven state.
   * Uses NEED_FETCH sentinel before initialization.
   *
   * Each state contains:
   * - reached: Whether breakeven has been reached for this signal
   */
  _states: Map<string, IBreakevenState> | typeof NEED_FETCH = NEED_FETCH;

  /**
   * Creates new ClientBreakeven instance.
   *
   * @param params - Breakeven parameters (logger, onBreakeven callback)
   */
  constructor(readonly params: IBreakevenParams) {}

  /**
   * Initializes breakeven state by loading from disk.
   *
   * Uses singleshot pattern to ensure initialization happens exactly once per symbol:strategyName.
   * Reads persisted state from PersistBreakevenAdapter and restores to _states Map.
   *
   * Must be called before check()/clear() methods.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @returns Promise that resolves when initialization is complete
   *
   * @example
   * ```typescript
   * const breakeven = new ClientBreakeven(params);
   * await breakeven.waitForInit("BTCUSDT", "my-strategy"); // Load persisted state (live mode)
   * // Now check() can be called
   * ```
   */
  public waitForInit = singleshot(
    async (symbol: string, strategyName: StrategyName) => await WAIT_FOR_INIT_FN(symbol, strategyName, this)
  );

  /**
   * Persists current breakeven state to disk.
   *
   * Converts in-memory Maps to JSON-serializable format:
   * - Map<signalId, IBreakevenState> → Record<signalId, IBreakevenData>
   *
   * Called automatically after breakeven reached or clear().
   * Uses atomic file writes via PersistBreakevenAdapter.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @returns Promise that resolves when persistence is complete
   */
  public async _persistState(symbol: string, strategyName: StrategyName): Promise<void> {
    if (this.params.backtest) {
      return;
    }
    this.params.logger.debug("ClientBreakeven persistState", { symbol, strategyName });
    if (this._states === NEED_FETCH) {
      throw new Error(
        "ClientBreakeven not initialized. Call waitForInit() before using."
      );
    }
    const breakevenData: Record<string, IBreakevenData> = {};
    for (const [signalId, state] of this._states.entries()) {
      breakevenData[signalId] = {
        reached: state.reached,
      };
    }
    await PersistBreakevenAdapter.writeBreakevenData(breakevenData, symbol, strategyName);
  }

  /**
   * Checks if breakeven should be triggered and emits event if conditions met.
   *
   * Called by ClientStrategy during signal monitoring.
   * Checks if:
   * 1. Breakeven not already reached
   * 2. Price has moved far enough to cover transaction costs
   * 3. Threshold calculation based on CC_PERCENT_SLIPPAGE and CC_PERCENT_FEE
   *
   * If all conditions met:
   * 1. Marks reached flag as true
   * 2. Logs info message
   * 3. Calls params.onBreakeven callback (emits to breakevenSubject)
   *
   * After event processed, persists state to disk if breakeven was reached.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param data - Signal row data
   * @param currentPrice - Current market price
   * @param backtest - True if backtest mode, false if live mode
   * @param when - Event timestamp (current time for live, candle time for backtest)
   * @returns Promise that resolves when breakeven check is complete
   *
   * @example
   * ```typescript
   * // LONG: entry=100, slippage=0.1%, fee=0.1%, threshold=0.4%
   * // Price at 100.5 - threshold reached!
   * await breakeven.check("BTCUSDT", signal, 100.5, false, new Date());
   * // Emits event, state persisted
   * ```
   */
  public async check(
    symbol: string,
    data: IPublicSignalRow,
    currentPrice: number,
    backtest: boolean,
    when: Date
  ) {
    this.params.logger.debug("ClientBreakeven check", {
      symbol,
      signalId: data.id,
      currentPrice,
      backtest,
      when,
    });
    return await HANDLE_BREAKEVEN_FN(
      symbol,
      data,
      currentPrice,
      backtest,
      when,
      this
    );
  }

  /**
   * Clears breakeven state for a signal when it closes.
   *
   * Called by ClientStrategy when signal completes (TP/SL/time_expired).
   * Removes signal's state from _states Map and persists changes to disk.
   *
   * After clear() completes:
   * - Signal state removed from memory (_states.delete)
   * - Changes persisted to disk (PersistBreakevenAdapter.writeBreakevenData)
   * - Memoized ClientBreakeven instance cleared in BreakevenConnectionService
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param data - Signal row data
   * @param priceClose - Final closing price
   * @param backtest - True if backtest mode, false if live mode
   * @returns Promise that resolves when clear is complete
   * @throws Error if ClientBreakeven not initialized (waitForInit not called)
   *
   * @example
   * ```typescript
   * // Signal closes at take profit
   * await breakeven.clear("BTCUSDT", signal, 101, false);
   * // State removed: _states.delete(signal.id)
   * // Persisted: ./dump/data/breakeven/BTCUSDT/state.json updated
   * // Cleanup: BreakevenConnectionService.getBreakeven.clear(signal.id)
   * ```
   */
  public async clear(
    symbol: string,
    data: ISignalRow,
    priceClose: number,
    backtest: boolean
  ) {
    this.params.logger.log("ClientBreakeven clear", {
      symbol,
      data,
      priceClose,
      backtest,
    });
    if (this._states === NEED_FETCH) {
      throw new Error(
        "ClientBreakeven not initialized. Call waitForInit() before using."
      );
    }
    if (data.id !== this.params.signalId) {
      throw new Error(
        `Signal ID mismatch: expected ${this.params.signalId}, got ${data.id}`
      );
    }
    this._states.delete(data.id);
    await this._persistState(symbol, data.strategyName);
  }
}

export default ClientBreakeven;
