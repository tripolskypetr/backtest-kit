import { compose, memoize, queued, singleshot } from "functools-kit";
import { PersistBudgetAdapter, BudgetRecordKey } from "./Persist";
import { StrategyName } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { BudgetRejectedError } from "../error/BudgetRejectedError";
import { BudgetMissingError } from "../error/BudgetMissingError";
import swarm, { ExecutionContextService, MethodContextService } from "../lib";
import { budgetSubject } from "../config/emitters";
import { GLOBAL_CONFIG } from "../config/params";
import type { Columns } from "../lib/services/markdown/BudgetMarkdownService";

/**
 * Memo key of a budget record instance: the record key plus the budget name.
 * No signalId — the record is shared by every symbol of the strategy run.
 */
const CREATE_KEY_FN = (key: BudgetRecordKey, name: BudgetName) =>
  `${key.strategyName}:${key.exchangeName}:${key.frameName}:${key.backtest ? "backtest" : "live"}_${name}`;

/**
 * Logical name of a budget inside a strategy run, e.g. "fund" — the bucket of
 * the record, like `BucketName` for `State`. Two budgets of one run with
 * different names are two independent journals.
 */
export type BudgetName = string;

const BUDGET_LOCAL_INSTANCE_METHOD_NAME_GET = "BudgetLocalInstance.getState";
const BUDGET_LOCAL_INSTANCE_METHOD_NAME_SET = "BudgetLocalInstance.setState";

const BUDGET_PERSIST_INSTANCE_METHOD_NAME_WAIT_FOR_INIT = "BudgetPersistInstance.waitForInit";
const BUDGET_PERSIST_INSTANCE_METHOD_NAME_GET = "BudgetPersistInstance.getState";
const BUDGET_PERSIST_INSTANCE_METHOD_NAME_SET = "BudgetPersistInstance.setState";

const BUDGET_BACKTEST_ADAPTER_METHOD_NAME_DISPOSE = "BudgetBacktestAdapter.dispose";
const BUDGET_BACKTEST_ADAPTER_METHOD_NAME_GET = "BudgetBacktestAdapter.getState";
const BUDGET_BACKTEST_ADAPTER_METHOD_NAME_SET = "BudgetBacktestAdapter.setState";
const BUDGET_BACKTEST_ADAPTER_METHOD_NAME_USE_LOCAL = "BudgetBacktestAdapter.useLocal";
const BUDGET_BACKTEST_ADAPTER_METHOD_NAME_USE_PERSIST = "BudgetBacktestAdapter.usePersist";
const BUDGET_BACKTEST_ADAPTER_METHOD_NAME_USE_DUMMY = "BudgetBacktestAdapter.useDummy";
const BUDGET_BACKTEST_ADAPTER_METHOD_NAME_USE_BUDGET_ADAPTER = "BudgetBacktestAdapter.useBudgetAdapter";
const BUDGET_BACKTEST_ADAPTER_METHOD_NAME_CLEAR = "BudgetBacktestAdapter.clear";

const BUDGET_LIVE_ADAPTER_METHOD_NAME_DISPOSE = "BudgetLiveAdapter.dispose";
const BUDGET_LIVE_ADAPTER_METHOD_NAME_GET = "BudgetLiveAdapter.getState";
const BUDGET_LIVE_ADAPTER_METHOD_NAME_SET = "BudgetLiveAdapter.setState";
const BUDGET_LIVE_ADAPTER_METHOD_NAME_USE_LOCAL = "BudgetLiveAdapter.useLocal";
const BUDGET_LIVE_ADAPTER_METHOD_NAME_USE_PERSIST = "BudgetLiveAdapter.usePersist";
const BUDGET_LIVE_ADAPTER_METHOD_NAME_USE_DUMMY = "BudgetLiveAdapter.useDummy";
const BUDGET_LIVE_ADAPTER_METHOD_NAME_USE_BUDGET_ADAPTER = "BudgetLiveAdapter.useBudgetAdapter";
const BUDGET_LIVE_ADAPTER_METHOD_NAME_CLEAR = "BudgetLiveAdapter.clear";

const BUDGET_METHOD_NAME_ENABLE = "Budget.enable";
const BUDGET_METHOD_NAME_DISABLE = "Budget.disable";
const BUDGET_METHOD_NAME_STATIC_GET_NAMES = "Budget._getNames";
const BUDGET_METHOD_NAME_GET_DATA = "Budget.getData";
const BUDGET_METHOD_NAME_GET_REPORT = "Budget.getReport";
const BUDGET_METHOD_NAME_DUMP = "Budget.dump";
const BUDGET_METHOD_NAME_STATIC_GET_BALANCE = "Budget._getBalance";
const BUDGET_METHOD_NAME_STATIC_GET_FREE = "Budget._getFree";
const BUDGET_METHOD_NAME_STATIC_GET_HISTORY = "Budget._getHistory";
const BUDGET_METHOD_NAME_STATIC_RESERVE = "Budget._reserve";
const BUDGET_METHOD_NAME_STATIC_RELEASE = "Budget._release";
const BUDGET_METHOD_NAME_STATIC_DEPOSIT = "Budget._deposit";
const BUDGET_METHOD_NAME_STATIC_WITHDRAW = "Budget._withdraw";
const BUDGET_METHOD_NAME_GET_BALANCE = "Budget.getBalance";
const BUDGET_METHOD_NAME_GET_FREE = "Budget.getFree";
const BUDGET_METHOD_NAME_GET_HISTORY = "Budget.getHistory";
const BUDGET_METHOD_NAME_RESERVE = "Budget.reserve";
const BUDGET_METHOD_NAME_RELEASE = "Budget.release";
const BUDGET_METHOD_NAME_DEPOSIT = "Budget.deposit";
const BUDGET_METHOD_NAME_WITHDRAW = "Budget.withdraw";

/** Label of the quote-currency bucket in `reject` rows produced by `reserve` */
const CAPITAL_ASSET = "capital";

/**
 * Budgets constructed in this process, name → initial capital. Strategy code
 * creates them at module level (`const fund = new Budget({ name, initialCapital })`),
 * so this is the full set of budget names an observer (dashboard) can read.
 */
const BUDGET_NAMES = new Map<BudgetName, number>();

/**
 * Context of a static (context-free) budget call: the record key, the budget
 * name, the logical time of the action and the symbol that authored it.
 * Mirrors the dto of `State._getState` / `State._setState` with the record key
 * in place of `signalId`.
 */
export interface IBudgetContext {
  /** Strategy name of the run (part of the record key) */
  strategyName: StrategyName;
  /** Exchange name of the run (part of the record key) */
  exchangeName: ExchangeName;
  /** Frame name of the run (part of the record key; empty string in live mode) */
  frameName: FrameName;
  /** Backtest or live record (part of the record key) */
  backtest: boolean;
  /** Budget name — the bucket inside the record */
  name: BudgetName;
  /** Logical time of the read / the action's `timestamp` */
  when: Date;
  /** Symbol that authors the history row (null for a call without a symbol) */
  symbol?: string;
  /**
   * Initial capital of the record when this call is the first one to create it
   * (static callers outside the strategy module, e.g. listeners). Ignored once
   * the record exists. A call that would CREATE the record without it is
   * refused with BudgetMissingError: a record created with a guessed capital
   * could never be repaired by a later call.
   */
  initialCapital?: number;
}

/** Balance of a budget at a logical time: the fold of the journal up to `when` */
export interface IBudgetBalance {
  /** Budget name */
  name: BudgetName;
  /** Logical time the balance is taken at */
  when: Date;
  /** Capital: initialCapital plus every realized pnl of released reserves */
  capital: number;
  /** Sum of open reserves */
  deployed: number;
  /** capital − deployed (negative only after an overdraft, see IBudgetReserveRow) */
  free: number;
  /** Units held per asset (deposits − withdrawals) */
  assets: Record<string, number>;
}

/** `reserve`: move `amount` from free to deployed under the key `id` */
export interface IBudgetReserveDto {
  /** Reserve identifier (typically the signal id); must not be open already */
  id: string;
  /** Amount to reserve in quote currency (> 0) */
  amount: number;
  /** Optional human-readable note stored on the row */
  note?: string;
}

/** `release`: give the reserve `id` back to free and book its pnl on capital */
export interface IBudgetReleaseDto {
  /** Reserve identifier passed to `reserve` */
  id: string;
  /** Realized pnl of the position in quote currency (added to capital). Default: 0 */
  pnl?: number;
  /** Optional human-readable note stored on the row */
  note?: string;
}

/** `deposit`: add `amount` units of `asset` (dividends in shares, staking rewards) */
export interface IBudgetDepositDto {
  /** Asset label, e.g. "ETH" */
  asset: string;
  /** Units to add (> 0) */
  amount: number;
  /** Optional human-readable note stored on the row */
  note?: string;
}

/** `withdraw`: remove `amount` units of `asset`; more than held is rejected */
export interface IBudgetWithdrawDto {
  /** Asset label, e.g. "ETH" */
  asset: string;
  /** Units to remove (> 0) */
  amount: number;
  /** Optional human-readable note stored on the row */
  note?: string;
}

/** Balance part stored on every history row: the balance AFTER the row */
export type IBudgetRowBalance = Pick<IBudgetBalance, "capital" | "deployed" | "free" | "assets">;

/**
 * Fields shared by every journal row. strategyName, exchangeName, frameName and
 * backtest are the record key and are not repeated on rows.
 */
export interface IBudgetHistoryRowBase {
  /** Logical time of the action (`when` of the call that produced it) */
  timestamp: number;
  /** Symbol that authored the row, null when the call had no symbol */
  symbol: string | null;
  /** Insertion order — the last tie-break of the journal order (timestamp, symbol, seq) */
  seq: number;
  /** Balance after this row */
  balance: IBudgetRowBalance;
}

/** A reserve took `amount` from free */
export interface IBudgetReserveRow extends IBudgetHistoryRowBase {
  type: "reserve";
  id: string;
  amount: number;
  note?: string;
  /**
   * Set when a later-inserted earlier row (another symbol whose clock lagged
   * behind this one) made this reserve exceed the free balance: `-free` after
   * the row, as of the journal's CURRENT content. Cleared again when a later
   * insert brings the balance back (an earlier release that arrived after the
   * reserve it closes): by logical time such a shortfall never existed, the
   * rows merely arrived out of order, and keeping the mark would make the
   * journal depend on the arrival order (I3). What the shortfall DID cause
   * while it stood is on record for good: the `reject` rows of the reserves
   * refused in that window, and the warning logged at the recompute. The
   * budget never hides it (see the Budget class notes). Under
   * `CC_BACKTEST_LOCKSTEP` the clocks of parallel backtests stay within one
   * timeframe, replays included, so this only arises with the flag off or
   * with ties inside one timeframe.
   */
  overdraft?: number;
}

/** A reserve went back to free; `pnl` was booked on capital */
export interface IBudgetReleaseRow extends IBudgetHistoryRowBase {
  type: "release";
  id: string;
  amount: number;
  pnl: number;
  note?: string;
}

/** A `reserve` / `withdraw` was refused; the balance is unchanged */
export interface IBudgetRejectRow extends IBudgetHistoryRowBase {
  type: "reject";
  action: "reserve" | "withdraw";
  /** "capital" for reserve, the asset label for withdraw */
  asset: string;
  requested: number;
  available: number;
}

/** Units of `asset` added */
export interface IBudgetDepositRow extends IBudgetHistoryRowBase {
  type: "deposit";
  asset: string;
  amount: number;
  note?: string;
}

/** Units of `asset` removed */
export interface IBudgetWithdrawRow extends IBudgetHistoryRowBase {
  type: "withdraw";
  asset: string;
  amount: number;
  note?: string;
}

/** Journal row of a budget record, ordered by (timestamp, symbol, seq) */
export type IBudgetHistoryRow =
  | IBudgetReserveRow
  | IBudgetReleaseRow
  | IBudgetRejectRow
  | IBudgetDepositRow
  | IBudgetWithdrawRow;

/**
 * Value of a budget record: the initial capital and the ordered journal.
 * `getState(when)` returns the fold of it up to `when` (rows with
 * `timestamp <= when`), never the rows written by a symbol that is ahead.
 */
export interface IBudgetValue {
  initialCapital: number;
  journal: IBudgetHistoryRow[];
}

/**
 * Initial value of a budget record, the counterpart of `initialValue` in `State`.
 * `initialCapital` is undefined for a static call that did not bring one: the
 * instance then refuses to create the record (BudgetMissingError) and only
 * serves a record that already exists (persisted, or created by an earlier call).
 */
export interface IBudgetInitial {
  initialCapital?: number;
}

/**
 * An action to insert into the journal: a history row minus the fields the
 * instance computes (`timestamp`, `seq`, `balance`). Returned by a dispatch.
 */
export type BudgetAction =
  | Omit<IBudgetReserveRow, "timestamp" | "seq" | "balance" | "overdraft">
  | Omit<IBudgetReleaseRow, "timestamp" | "seq" | "balance">
  | Omit<IBudgetRejectRow, "timestamp" | "seq" | "balance">
  | Omit<IBudgetDepositRow, "timestamp" | "seq" | "balance">
  | Omit<IBudgetWithdrawRow, "timestamp" | "seq" | "balance">;

/**
 * Updater of `setState` — receives the fold of the journal up to `when` (what
 * the caller is allowed to see) and returns the action to insert at `when`, or
 * null for a no-op. Runs inside the instance's `queued` section, so the check
 * and the write are atomic within the process, like `setState(prev => ...)`.
 * The second argument is the WHOLE journal, rows past `when` included: it is
 * for diagnostics only (a release aimed at a reserve that lies in the caller's
 * future), never for the decision itself.
 */
export type BudgetDispatch = (prev: IBudgetValue, full: IBudgetValue) => BudgetAction | null | Promise<BudgetAction | null>;

/** The record does not exist and the call brought no capital to create it with */
const MISSING_ERROR_FN = (
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  backtest: boolean,
  name: BudgetName,
): BudgetMissingError =>
  new BudgetMissingError(
    `Budget "${name}" for ${strategyName}/${exchangeName}/${frameName || "-"} (${backtest ? "backtest" : "live"}) does not exist yet: pass initialCapital to the call that creates it`,
  );

/** Balance before any row */
const INITIAL_BALANCE_FN = (initialCapital: number): IBudgetRowBalance => ({
  capital: initialCapital,
  deployed: 0,
  free: initialCapital,
  assets: {},
});

/** Journal order: timestamp, then symbol, then insertion order (I3: deterministic) */
const COMPARE_ROW_FN = (a: IBudgetHistoryRow, b: IBudgetHistoryRow): number => {
  if (a.timestamp !== b.timestamp) {
    return a.timestamp - b.timestamp;
  }
  const symbolA = a.symbol ?? "";
  const symbolB = b.symbol ?? "";
  if (symbolA !== symbolB) {
    return symbolA < symbolB ? -1 : 1;
  }
  return a.seq - b.seq;
};

/**
 * Balance after `row` given the balance before it. The reserve row gets its
 * `overdraft` set (or cleared) here, so a re-computation of the tail after an
 * insertion in the middle reflects the new free balance on every later row:
 * the mark describes the journal as it is now, not the order its rows arrived in.
 */
const APPLY_ROW_FN = (prev: IBudgetRowBalance, row: IBudgetHistoryRow): IBudgetRowBalance => {
  const assets = { ...prev.assets };
  let capital = prev.capital;
  let deployed = prev.deployed;
  if (row.type === "reserve") {
    deployed += row.amount;
    const free = capital - deployed;
    if (free < 0) {
      row.overdraft = -free;
    } else {
      delete row.overdraft;
    }
    return { capital, deployed, free, assets };
  }
  if (row.type === "release") {
    deployed -= row.amount;
    capital += row.pnl;
    return { capital, deployed, free: capital - deployed, assets };
  }
  if (row.type === "deposit") {
    assets[row.asset] = (assets[row.asset] ?? 0) + row.amount;
    return { capital, deployed, free: capital - deployed, assets };
  }
  if (row.type === "withdraw") {
    assets[row.asset] = (assets[row.asset] ?? 0) - row.amount;
    return { capital, deployed, free: capital - deployed, assets };
  }
  return { capital, deployed, free: capital - deployed, assets };
};

/** Index of the first row with `timestamp > when` (binary search over the sorted journal) */
const UPPER_BOUND_FN = (journal: IBudgetHistoryRow[], when: number): number => {
  let lo = 0;
  let hi = journal.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (journal[mid].timestamp <= when) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
};

/** Fold of the journal up to `when` inclusive (a copy: callers never touch the live journal) */
const FOLD_FN = (value: IBudgetValue, when: number): IBudgetValue => ({
  initialCapital: value.initialCapital,
  journal: structuredClone(value.journal.slice(0, UPPER_BOUND_FN(value.journal, when))),
});

/** Balance at the end of a (folded) journal */
const BALANCE_OF_FN = (value: IBudgetValue): IBudgetRowBalance => {
  const last = value.journal[value.journal.length - 1];
  return last ? structuredClone(last.balance) : INITIAL_BALANCE_FN(value.initialCapital);
};

/**
 * Inserts `row` at its place by (timestamp, symbol, seq) and recomputes the
 * balance of it and of every row after it (I2: a row from the past never
 * overwrites, it shifts the balances of the rows that followed it).
 * Returns the overdrafts that appeared on rows after the insertion point so
 * the caller can log them.
 */
const INSERT_ROW_FN = (value: IBudgetValue, row: IBudgetHistoryRow): IBudgetReserveRow[] => {
  const journal = value.journal;
  let index = journal.length;
  while (index > 0 && COMPARE_ROW_FN(journal[index - 1], row) > 0) {
    index -= 1;
  }
  journal.splice(index, 0, row);
  const overdrafts: IBudgetReserveRow[] = [];
  for (let i = index; i < journal.length; i++) {
    const prev = i > 0 ? journal[i - 1].balance : INITIAL_BALANCE_FN(value.initialCapital);
    const current = journal[i];
    const hadOverdraft = current.type === "reserve" && current.overdraft !== undefined;
    current.balance = APPLY_ROW_FN(prev, current);
    if (current.type === "reserve" && current.overdraft !== undefined && !hadOverdraft && i > index) {
      overdrafts.push(current);
    }
  }
  return overdrafts;
};

/** Highest `seq` in a journal (restored from disk) so new rows keep the insertion order */
const MAX_SEQ_FN = (journal: IBudgetHistoryRow[]): number =>
  journal.reduce((max, row) => Math.max(max, row.seq), 0);

/**
 * Interface for budget instance implementations.
 * Defines the contract for local, persist, and dummy backends — the same four
 * methods as `IStateInstance`, with the record value being an ordered journal
 * instead of a single `(_value, _when)` pair:
 *
 * - `getState(when)` returns the fold of the journal up to `when` (I1: a read
 *   sees only the past, including rows written by symbols that are ahead only
 *   up to the reader's own time);
 * - `setState(dispatch, when)` inserts the action returned by `dispatch` at its
 *   `timestamp = when` and recomputes the balances after it (I2: a row from the
 *   past shifts later balances instead of overwriting them).
 */
export interface IBudgetInstance {
  /**
   * Initialize the budget instance.
   * @param initial - Whether this is the first initialization
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Read the fold of the journal up to `when` inclusive.
   * @param when - Logical timestamp at which the read is happening
   * @returns Initial capital and the visible rows (a copy)
   */
  getState(when: Date): Promise<IBudgetValue>;

  /**
   * Insert the action returned by `dispatch` at `when`.
   * The dispatch receives the fold up to `when`; the check it does and the
   * insertion are atomic within the process (`queued`).
   * @param dispatch - Updater returning the action to insert, or null for a no-op
   * @param when - Logical timestamp of the action
   * @returns The inserted row (a copy) or null when the dispatch returned null
   */
  setState(dispatch: BudgetDispatch, when: Date): Promise<IBudgetHistoryRow | null>;

  /**
   * Releases any resources held by this instance.
   */
  dispose(): Promise<void>;
}

/**
 * Constructor type for budget instance implementations.
 * Used for swapping backends via BudgetBacktestAdapter / BudgetLiveAdapter.
 */
export type TBudgetInstanceCtor = new (
  initialValue: IBudgetInitial,
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  backtest: boolean,
  name: BudgetName,
) => IBudgetInstance;

/**
 * Public surface of BudgetBacktestAdapter / BudgetLiveAdapter — IBudgetInstance minus waitForInit and dispose.
 * waitForInit and dispose are managed internally by the adapter.
 */
type TBudgetAdapter = {
  [key in Exclude<keyof IBudgetInstance, "waitForInit" | "dispose">]: any;
}

/**
 * In-process budget instance: the journal lives in process memory only.
 * Default backend of BudgetBacktestAdapter.
 *
 * Features:
 * - Sorted journal, binary search for the fold at `when`, tail recompute on insert
 * - `queued` writes: the dispatch's check and the insertion are atomic
 * - Scoped per (record key, name): one record for every symbol of the run
 */
export class BudgetLocalInstance implements IBudgetInstance {

  _value: IBudgetValue;
  _seq: number = 0;

  constructor(
    readonly initialValue: IBudgetInitial,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
    readonly frameName: FrameName,
    readonly backtest: boolean,
    readonly name: BudgetName,
  ) { }

  /**
   * Initializes an empty journal from initialValue - local budget needs no async setup.
   * @returns Promise that resolves immediately
   */
  public waitForInit = singleshot(async (_initial: boolean) => {
    if (this.initialValue.initialCapital === undefined) {
      throw MISSING_ERROR_FN(this.strategyName, this.exchangeName, this.frameName, this.backtest, this.name);
    }
    this._value = { initialCapital: this.initialValue.initialCapital, journal: [] };
    this._seq = 0;
  });

  /**
   * Read the fold of the in-memory journal up to `when`.
   * @param when - Logical timestamp at which the read is happening
   * @returns Initial capital and the visible rows (a copy)
   */
  public async getState(when: Date): Promise<IBudgetValue> {
    swarm.loggerService.debug(BUDGET_LOCAL_INSTANCE_METHOD_NAME_GET, {
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
      backtest: this.backtest,
      name: this.name,
    });
    return FOLD_FN(this._value, when.getTime());
  }

  /**
   * Insert the action returned by `dispatch` at `when` into the in-memory journal.
   * @param dispatch - Updater returning the action to insert, or null for a no-op
   * @param when - Logical timestamp of the action
   * @returns The inserted row (a copy) or null
   */
  private _setState = queued(async (dispatch: BudgetDispatch, when: Date): Promise<IBudgetHistoryRow | null> => {
    swarm.loggerService.debug(BUDGET_LOCAL_INSTANCE_METHOD_NAME_SET, {
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
      backtest: this.backtest,
      name: this.name,
    });
    const action = await dispatch(FOLD_FN(this._value, when.getTime()), { initialCapital: this._value.initialCapital, journal: this._value.journal.slice() });
    if (!action) {
      return null;
    }
    const row = <IBudgetHistoryRow>{
      ...action,
      timestamp: when.getTime(),
      seq: ++this._seq,
      balance: INITIAL_BALANCE_FN(this._value.initialCapital),
    };
    const overdrafts = INSERT_ROW_FN(this._value, row);
    WARN_OVERDRAFTS_FN(this, overdrafts);
    return structuredClone(row);
  });

  /**
   * Insert the action returned by `dispatch` at `when` (queued: the check in the dispatch and the insertion are atomic).
   * @param dispatch - Updater returning the action to insert, or null for a no-op
   * @param when - Logical timestamp of the action
   * @returns The inserted row (a copy) or null
   */
  public async setState(dispatch: BudgetDispatch, when: Date): Promise<IBudgetHistoryRow | null> {
    const row = await this._setState(dispatch, when);
    if (typeof row === "symbol") {
      return null;
    }
    if (row) {
      await EMIT_ROW_FN(this, row);
    }
    return row;
  }

  /** Releases resources held by this instance. */
  public async dispose(): Promise<void> {
    swarm.loggerService.debug(BUDGET_BACKTEST_ADAPTER_METHOD_NAME_DISPOSE, {
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
      backtest: this.backtest,
      name: this.name,
    });
  }
}

/**
 * No-op budget instance that discards all writes.
 * Reads return the initial capital with an empty journal, so `getFree()` is
 * always the initial capital and every `reserve` succeeds without being kept.
 */
export class BudgetDummyInstance implements IBudgetInstance {
  constructor(
    readonly initialValue: IBudgetInitial,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
    readonly frameName: FrameName,
    readonly backtest: boolean,
    readonly name: BudgetName,
  ) { }

  /**
   * No-op initialization.
   * @returns Promise that resolves immediately
   */
  public waitForInit = singleshot(async (_initial: boolean) => {
    void 0;
  });

  /**
   * No-op read - always the initial capital with an empty journal.
   * @returns Initial value
   */
  public async getState(_when: Date): Promise<IBudgetValue> {
    return { initialCapital: this.initialValue.initialCapital ?? 0, journal: [] };
  }

  /**
   * No-op write - discards the action.
   * @returns null
   */
  public async setState(_dispatch: BudgetDispatch, _when: Date): Promise<IBudgetHistoryRow | null> {
    return null;
  }

  /** No-op. */
  public async dispose(): Promise<void> {
    void 0;
  }
}

/**
 * File-system backed budget instance.
 * The whole record (initial capital + journal) is persisted atomically to disk
 * via PersistBudgetAdapter after every write and restored from disk on
 * waitForInit, so a live run resumes with its reserves and assets intact.
 * Default backend of BudgetLiveAdapter.
 */
export class BudgetPersistInstance implements IBudgetInstance {

  _value: IBudgetValue;
  _seq: number = 0;

  constructor(
    readonly initialValue: IBudgetInitial,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
    readonly frameName: FrameName,
    readonly backtest: boolean,
    readonly name: BudgetName,
  ) { }

  /** Record key of this instance for PersistBudgetAdapter */
  private get key(): BudgetRecordKey {
    return {
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
      backtest: this.backtest,
    };
  }

  /**
   * Initialize persistence storage and restore the journal from disk.
   * @param initial - Whether this is the first initialization
   */
  public waitForInit = singleshot(async (initial: boolean) => {
    swarm.loggerService.debug(BUDGET_PERSIST_INSTANCE_METHOD_NAME_WAIT_FOR_INIT, {
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
      backtest: this.backtest,
      name: this.name,
      initial,
    });
    await PersistBudgetAdapter.waitForInit(this.key, this.name, initial);
    const data = await PersistBudgetAdapter.readBudgetData(this.key, this.name);
    if (data) {
      this._value = <IBudgetValue>data.data;
      this._seq = MAX_SEQ_FN(this._value.journal);
      return;
    }
    if (this.initialValue.initialCapital === undefined) {
      throw MISSING_ERROR_FN(this.strategyName, this.exchangeName, this.frameName, this.backtest, this.name);
    }
    this._value = { initialCapital: this.initialValue.initialCapital, journal: [] };
    this._seq = 0;
  });

  /**
   * Read the fold of the persisted journal up to `when`.
   * @param when - Logical timestamp at which the read is happening
   * @returns Initial capital and the visible rows (a copy)
   */
  public async getState(when: Date): Promise<IBudgetValue> {
    swarm.loggerService.debug(BUDGET_PERSIST_INSTANCE_METHOD_NAME_GET, {
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
      backtest: this.backtest,
      name: this.name,
    });
    return FOLD_FN(this._value, when.getTime());
  }

  /**
   * Insert the action returned by `dispatch` at `when` and persist the whole record atomically.
   * @param dispatch - Updater returning the action to insert, or null for a no-op
   * @param when - Logical timestamp of the action
   * @returns The inserted row (a copy) or null
   */
  private _setState = queued(async (dispatch: BudgetDispatch, when: Date): Promise<IBudgetHistoryRow | null> => {
    swarm.loggerService.debug(BUDGET_PERSIST_INSTANCE_METHOD_NAME_SET, {
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
      backtest: this.backtest,
      name: this.name,
    });
    const action = await dispatch(FOLD_FN(this._value, when.getTime()), { initialCapital: this._value.initialCapital, journal: this._value.journal.slice() });
    if (!action) {
      return null;
    }
    const row = <IBudgetHistoryRow>{
      ...action,
      timestamp: when.getTime(),
      seq: ++this._seq,
      balance: INITIAL_BALANCE_FN(this._value.initialCapital),
    };
    const overdrafts = INSERT_ROW_FN(this._value, row);
    WARN_OVERDRAFTS_FN(this, overdrafts);
    await PersistBudgetAdapter.writeBudgetData(
      { id: this.name, data: this._value, when: when.getTime() },
      this.key,
      this.name,
      when,
    );
    return structuredClone(row);
  });

  /**
   * Insert the action returned by `dispatch` at `when` (queued: the check in the dispatch and the insertion are atomic).
   * @param dispatch - Updater returning the action to insert, or null for a no-op
   * @param when - Logical timestamp of the action
   * @returns The inserted row (a copy) or null
   */
  public async setState(dispatch: BudgetDispatch, when: Date): Promise<IBudgetHistoryRow | null> {
    const row = await this._setState(dispatch, when);
    if (typeof row === "symbol") {
      return null;
    }
    if (row) {
      await EMIT_ROW_FN(this, row);
    }
    return row;
  }

  /** Releases resources held by this instance. */
  public async dispose(): Promise<void> {
    swarm.loggerService.debug(BUDGET_LIVE_ADAPTER_METHOD_NAME_DISPOSE, {
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
      backtest: this.backtest,
      name: this.name,
    });
    await PersistBudgetAdapter.dispose(this.key, this.name);
  }
}

/** Every inserted row goes to `budgetSubject` (budget.jsonl, the budget markdown report, `listenBudget`) */
const EMIT_ROW_FN = async (
  self: BudgetLocalInstance | BudgetPersistInstance,
  row: IBudgetHistoryRow,
): Promise<void> => {
  await budgetSubject.next({
    strategyName: self.strategyName,
    exchangeName: self.exchangeName,
    frameName: self.frameName,
    backtest: self.backtest,
    name: self.name,
    symbol: row.symbol,
    timestamp: row.timestamp,
    when: new Date(row.timestamp),
    row: structuredClone(row),
  });
};

/** I6: an overdraft is never hidden — every row that got one is logged */
const WARN_OVERDRAFTS_FN = (
  self: BudgetLocalInstance | BudgetPersistInstance,
  overdrafts: IBudgetReserveRow[],
): void => {
  for (const row of overdrafts) {
    swarm.loggerService.warn("Budget overdraft: an earlier row inserted later made this reserve exceed the free balance", {
      strategyName: self.strategyName,
      exchangeName: self.exchangeName,
      frameName: self.frameName,
      backtest: self.backtest,
      name: self.name,
      id: row.id,
      symbol: row.symbol,
      timestamp: row.timestamp,
      amount: row.amount,
      overdraft: row.overdraft,
    });
  }
};

/** Dto of the adapter methods: the record key, the budget name, the initial value and the logical time */
type TBudgetAdapterDto = BudgetRecordKey & {
  name: BudgetName;
  initialValue: IBudgetInitial;
  when: Date;
};

/**
 * Backtest budget adapter with pluggable storage backend.
 *
 * Features:
 * - Adapter pattern for swappable budget instance implementations
 * - Default backend: BudgetLocalInstance (in-memory, no disk persistence)
 * - Alternative backends: BudgetPersistInstance, BudgetDummyInstance
 * - Convenience methods: useLocal(), usePersist(), useDummy(), useBudgetAdapter()
 * - Memoized instances per (record key, name) pair; the record lives until clear()
 *   (no per-signal disposal: it is not bound to a signal)
 */
export class BudgetBacktestAdapter implements TBudgetAdapter {
  private BudgetFactory: TBudgetInstanceCtor = BudgetLocalInstance;

  private getInstance = memoize(
    ([key, name]) => CREATE_KEY_FN(key, name),
    (key: BudgetRecordKey, name: BudgetName, initialValue: IBudgetInitial): IBudgetInstance =>
      Reflect.construct(this.BudgetFactory, [initialValue, key.strategyName, key.exchangeName, key.frameName, key.backtest, name]),
  );

  /**
   * Read the fold of the journal up to `dto.when`.
   * @param dto - Record key, budget name, initial value and logical time
   * @returns Initial capital and the visible rows
   */
  public getState = async (dto: TBudgetAdapterDto): Promise<IBudgetValue> => {
    swarm.loggerService.debug(BUDGET_BACKTEST_ADAPTER_METHOD_NAME_GET, {
      strategyName: dto.strategyName,
      exchangeName: dto.exchangeName,
      frameName: dto.frameName,
      name: dto.name,
    });
    const key = CREATE_KEY_FN(dto, dto.name);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto, dto.name, dto.initialValue);
    try {
      await instance.waitForInit(isInitial);
    } catch (error) {
      // a creation refused (BudgetMissingError) or failed must not pin a broken instance:
      // the next call that brings initialCapital creates the record properly
      if (isInitial) {
        this.getInstance.clear(key);
      }
      throw error;
    }
    return await instance.getState(dto.when);
  };

  /**
   * Insert the action returned by `dispatch` at `dto.when`.
   * @param dispatch - Updater returning the action to insert, or null for a no-op
   * @param dto - Record key, budget name, initial value and logical time
   * @returns The inserted row or null
   */
  public setState = async (dispatch: BudgetDispatch, dto: TBudgetAdapterDto): Promise<IBudgetHistoryRow | null> => {
    swarm.loggerService.debug(BUDGET_BACKTEST_ADAPTER_METHOD_NAME_SET, {
      strategyName: dto.strategyName,
      exchangeName: dto.exchangeName,
      frameName: dto.frameName,
      name: dto.name,
    });
    const key = CREATE_KEY_FN(dto, dto.name);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto, dto.name, dto.initialValue);
    try {
      await instance.waitForInit(isInitial);
    } catch (error) {
      // a creation refused (BudgetMissingError) or failed must not pin a broken instance:
      // the next call that brings initialCapital creates the record properly
      if (isInitial) {
        this.getInstance.clear(key);
      }
      throw error;
    }
    return await instance.setState(dispatch, dto.when);
  };

  /**
   * Switches to in-memory adapter (default).
   * All data lives in process memory only.
   */
  public useLocal = (): void => {
    swarm.loggerService.info(BUDGET_BACKTEST_ADAPTER_METHOD_NAME_USE_LOCAL);
    this.BudgetFactory = BudgetLocalInstance;
  };

  /**
   * Switches to file-system backed adapter.
   * Data is persisted to disk via PersistBudgetAdapter.
   */
  public usePersist = (): void => {
    swarm.loggerService.info(BUDGET_BACKTEST_ADAPTER_METHOD_NAME_USE_PERSIST);
    this.BudgetFactory = BudgetPersistInstance;
  };

  /**
   * Switches to dummy adapter that discards all writes.
   */
  public useDummy = (): void => {
    swarm.loggerService.info(BUDGET_BACKTEST_ADAPTER_METHOD_NAME_USE_DUMMY);
    this.BudgetFactory = BudgetDummyInstance;
  };

  /**
   * Switches to a custom budget adapter implementation.
   * @param Ctor - Constructor for the custom budget instance
   */
  public useBudgetAdapter = (Ctor: TBudgetInstanceCtor): void => {
    swarm.loggerService.info(BUDGET_BACKTEST_ADAPTER_METHOD_NAME_USE_BUDGET_ADAPTER);
    this.BudgetFactory = Ctor;
  };

  /**
   * Clears the memoized instance cache.
   * Call this before a new run (or when process.cwd() changes between strategy
   * iterations) so new instances start from a fresh journal / the updated base path.
   */
  public clear = (): void => {
    swarm.loggerService.info(BUDGET_BACKTEST_ADAPTER_METHOD_NAME_CLEAR);
    this.getInstance.clear();
  };
}

/**
 * Live trading budget adapter with pluggable storage backend.
 *
 * Features:
 * - Adapter pattern for swappable budget instance implementations
 * - Default backend: BudgetPersistInstance (file-system backed, survives restarts)
 * - Alternative backends: BudgetLocalInstance, BudgetDummyInstance
 * - Convenience methods: useLocal(), usePersist(), useDummy(), useBudgetAdapter()
 * - Memoized instances per (record key, name) pair; the record lives until clear()
 */
export class BudgetLiveAdapter implements TBudgetAdapter {
  private BudgetFactory: TBudgetInstanceCtor = BudgetPersistInstance;

  private getInstance = memoize(
    ([key, name]) => CREATE_KEY_FN(key, name),
    (key: BudgetRecordKey, name: BudgetName, initialValue: IBudgetInitial): IBudgetInstance =>
      Reflect.construct(this.BudgetFactory, [initialValue, key.strategyName, key.exchangeName, key.frameName, key.backtest, name]),
  );

  /**
   * Read the fold of the journal up to `dto.when`.
   * @param dto - Record key, budget name, initial value and logical time
   * @returns Initial capital and the visible rows
   */
  public getState = async (dto: TBudgetAdapterDto): Promise<IBudgetValue> => {
    swarm.loggerService.debug(BUDGET_LIVE_ADAPTER_METHOD_NAME_GET, {
      strategyName: dto.strategyName,
      exchangeName: dto.exchangeName,
      frameName: dto.frameName,
      name: dto.name,
    });
    const key = CREATE_KEY_FN(dto, dto.name);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto, dto.name, dto.initialValue);
    try {
      await instance.waitForInit(isInitial);
    } catch (error) {
      // a creation refused (BudgetMissingError) or failed must not pin a broken instance:
      // the next call that brings initialCapital creates the record properly
      if (isInitial) {
        this.getInstance.clear(key);
      }
      throw error;
    }
    return await instance.getState(dto.when);
  };

  /**
   * Insert the action returned by `dispatch` at `dto.when`.
   * @param dispatch - Updater returning the action to insert, or null for a no-op
   * @param dto - Record key, budget name, initial value and logical time
   * @returns The inserted row or null
   */
  public setState = async (dispatch: BudgetDispatch, dto: TBudgetAdapterDto): Promise<IBudgetHistoryRow | null> => {
    swarm.loggerService.debug(BUDGET_LIVE_ADAPTER_METHOD_NAME_SET, {
      strategyName: dto.strategyName,
      exchangeName: dto.exchangeName,
      frameName: dto.frameName,
      name: dto.name,
    });
    const key = CREATE_KEY_FN(dto, dto.name);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto, dto.name, dto.initialValue);
    try {
      await instance.waitForInit(isInitial);
    } catch (error) {
      // a creation refused (BudgetMissingError) or failed must not pin a broken instance:
      // the next call that brings initialCapital creates the record properly
      if (isInitial) {
        this.getInstance.clear(key);
      }
      throw error;
    }
    return await instance.setState(dispatch, dto.when);
  };

  /**
   * Switches to in-memory adapter.
   * All data lives in process memory only.
   */
  public useLocal = (): void => {
    swarm.loggerService.info(BUDGET_LIVE_ADAPTER_METHOD_NAME_USE_LOCAL);
    this.BudgetFactory = BudgetLocalInstance;
  };

  /**
   * Switches to file-system backed adapter (default).
   * Data is persisted to disk via PersistBudgetAdapter.
   */
  public usePersist = (): void => {
    swarm.loggerService.info(BUDGET_LIVE_ADAPTER_METHOD_NAME_USE_PERSIST);
    this.BudgetFactory = BudgetPersistInstance;
  };

  /**
   * Switches to dummy adapter that discards all writes.
   */
  public useDummy = (): void => {
    swarm.loggerService.info(BUDGET_LIVE_ADAPTER_METHOD_NAME_USE_DUMMY);
    this.BudgetFactory = BudgetDummyInstance;
  };

  /**
   * Switches to a custom budget adapter implementation.
   * @param Ctor - Constructor for the custom budget instance
   */
  public useBudgetAdapter = (Ctor: TBudgetInstanceCtor): void => {
    swarm.loggerService.info(BUDGET_LIVE_ADAPTER_METHOD_NAME_USE_BUDGET_ADAPTER);
    this.BudgetFactory = Ctor;
  };

  /**
   * Clears the memoized instance cache.
   * Call this when process.cwd() changes between strategy iterations
   * so new instances are created with the updated base path.
   */
  public clear = (): void => {
    swarm.loggerService.info(BUDGET_LIVE_ADAPTER_METHOD_NAME_CLEAR);
    this.getInstance.clear();
  };
}

/** Balance of a folded journal as the public IBudgetBalance */
const TO_BALANCE_FN = (value: IBudgetValue, name: BudgetName, when: Date): IBudgetBalance => ({
  name,
  when,
  ...BALANCE_OF_FN(value),
});

/** Adapter dto from a static context: no capital unless the call brought one, a creation without it is refused by the instance */
const TO_ADAPTER_DTO_FN = (context: IBudgetContext): TBudgetAdapterDto => ({
  strategyName: context.strategyName,
  exchangeName: context.exchangeName,
  frameName: context.frameName,
  backtest: context.backtest,
  name: context.name,
  initialValue: { initialCapital: context.initialCapital },
  when: context.when,
});

/** The open reserve with this id in a folded journal (null when never reserved or already released) */
const FIND_OPEN_RESERVE_FN = (value: IBudgetValue, id: string): IBudgetReserveRow | null => {
  let open: IBudgetReserveRow | null = null;
  for (const row of value.journal) {
    if (row.type === "reserve" && row.id === id) {
      open = row;
    }
    if (row.type === "release" && row.id === id) {
      open = null;
    }
  }
  return open;
};

/** Positive finite amount guard shared by the four actions */
const ASSERT_AMOUNT_FN = (method: string, amount: number): void => {
  if (typeof amount !== "number" || !isFinite(amount) || amount <= 0) {
    throw new Error(`${method}: amount must be a positive finite number, got ${amount}`);
  }
};

/**
 * Shared balance of a strategy run — one record for every symbol of the run,
 * kept as a journal of actions and read at the caller's logical time.
 *
 * Works like `State`: an instance in the strategy module, no schemas, every
 * instance method resolves the mode, the logical time and the symbol itself
 * from `backtest.executionContextService` / `backtest.methodContextService`.
 * Unlike `State`, the record is NOT bound to a signal: its key is
 * `(strategyName, exchangeName, frameName, backtest)` plus the budget `name`,
 * so every symbol of the run reads and writes the same journal, and no signal
 * lookup happens (the methods work from `getSignal` as well as from callbacks).
 *
 * Invariants:
 * - a read at `when` sees only rows with `timestamp <= when` (a symbol that is
 *   ahead in logical time does not leak its future into a lagging one);
 * - an action is inserted at its `timestamp`, never overwriting what came
 *   after; the balances after it are recomputed;
 * - the journal order is `(timestamp, symbol, seq)` — the same run yields the
 *   same journal whatever order Node interleaved the symbols in;
 * - the budget itself never waits for another symbol and holds no lock of its
 *   own; the clocks of parallel backtests are kept together by the engine's
 *   `CC_BACKTEST_LOCKSTEP` (`Lockstep` in `BacktestLogicPrivateService.run`):
 *   every timeframe iteration runs under a process-wide FIFO mutex, and a
 *   candle replay hands it off at every timeframe boundary, so the symbols
 *   are at most one timeframe apart even while one of them replays a long
 *   position; with the flag off (the test config) the symbols drift freely;
 * - an overdraft (two symbols took the same money because one clock lagged
 *   behind the other) is recorded on the reserve row as `overdraft` and
 *   logged, never hidden — `getFree()` goes negative and later reserves are
 *   refused until releases bring it back.
 *
 * Every inserted row is emitted on `budgetSubject`: `Report.enable()` writes it
 * to `./dump/report/budget.jsonl`, `Markdown.enable()` accumulates it for the
 * `# Budget Report:` markdown (`Budget.getData` / `getReport` / `dump`, keyed by
 * the record key and the budget name), and `listenBudget` hands it to user code.
 *
 * Requires an explicit `Budget.enable()` call before use, like `State.enable()`.
 *
 * @example
 * ```typescript
 * Budget.enable();
 * const fund = new Budget({ name: "fund", initialCapital: 10_000_000 });
 *
 * // inside getSignal / any lifecycle callback:
 * const free = await fund.getFree();
 * if (!(await fund.reserve({ id, amount: cost }))) {
 *   return null; // refused: not enough free capital at this logical time (a `reject` row is on record)
 * }
 * // with CC_BUDGET_THROW_ON_REJECT the refusal is a BudgetRejectedError instead of `false`
 *
 * // outside the execution context (a listener): the context travels as the last argument
 * listenSignalBacktestClosed(({ data, pnl, timestamp }) =>
 *   Budget._release({ id: data.id, pnl: pnl.pnlCost }, { ...keyOf(data), name: "fund", when: new Date(timestamp), symbol: data.symbol }));
 * ```
 */
export class Budget {

  constructor(private readonly params: { name: BudgetName; initialCapital: number }) {
    BUDGET_NAMES.set(params.name, params.initialCapital);
  }

  /**
   * Names of the budgets constructed in this process, in construction order.
   * @returns Budget names
   */
  public static _getNames = (): BudgetName[] => {
    swarm.loggerService.debug(BUDGET_METHOD_NAME_STATIC_GET_NAMES);
    return Array.from(BUDGET_NAMES.keys());
  };

  /**
   * Enables budget storage. Uses singleshot so that `disable()` and `clear()`
   * behave like `State`'s; there are no event subscriptions — the record is not
   * bound to a signal and is not cleaned up on its close.
   *
   * @returns Cleanup function
   */
  public static enable = singleshot(() => {
    swarm.loggerService.info(BUDGET_METHOD_NAME_ENABLE);
    return compose(
      () => Budget.enable.clear(),
    );
  });

  /**
   * Disables budget storage.
   * Safe to call multiple times.
   */
  public static disable = () => {
    swarm.loggerService.info(BUDGET_METHOD_NAME_DISABLE);
    if (Budget.enable.hasValue()) {
      const lastSubscription = Budget.enable();
      lastSubscription();
    }
  };

  /** Fold of the record up to `context.when`, routed to BudgetBacktest / BudgetLive by `context.backtest` */
  private static _getValue = async (context: IBudgetContext): Promise<IBudgetValue> => {
    if (!Budget.enable.hasValue()) {
      throw new Error("Budget is not enabled. Call Budget.enable() first.");
    }
    const dto = TO_ADAPTER_DTO_FN(context);
    if (context.backtest) {
      return await BudgetBacktest.getState(dto);
    }
    return await BudgetLive.getState(dto);
  };

  /** Insert an action at `context.when`, routed to BudgetBacktest / BudgetLive by `context.backtest` */
  private static _setValue = async (dispatch: BudgetDispatch, context: IBudgetContext): Promise<IBudgetHistoryRow | null> => {
    if (!Budget.enable.hasValue()) {
      throw new Error("Budget is not enabled. Call Budget.enable() first.");
    }
    const dto = TO_ADAPTER_DTO_FN(context);
    if (context.backtest) {
      return await BudgetBacktest.setState(dispatch, dto);
    }
    return await BudgetLive.setState(dispatch, dto);
  };

  /**
   * Rows of the budget markdown report (`BudgetMarkdownService`) accumulated
   * for a record: every row inserted since `Markdown.enable()`, newest first,
   * capped by `CC_MAX_BUDGET_MARKDOWN_ROWS`. The record key is taken as given
   * (no schema validation): a budget needs no schema of its own.
   *
   * @param context - Record key (strategy, exchange, frame) and the budget name
   * @param backtest - Whether to query the backtest record (default: false)
   * @returns Promise resolving to BudgetStatisticsModel
   */
  public static getData = async (
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; name: BudgetName },
    backtest = false,
  ) => {
    swarm.loggerService.info(BUDGET_METHOD_NAME_GET_DATA, { context, backtest });
    return await swarm.budgetMarkdownService.getData(context.strategyName, context.exchangeName, context.frameName, backtest, context.name);
  };

  /**
   * Markdown report of the budget journal rows accumulated for a record
   * (`# Budget Report: {strategyName}:{name}`).
   *
   * @param context - Record key (strategy, exchange, frame) and the budget name
   * @param backtest - Whether to query the backtest record (default: false)
   * @param columns - Optional column configuration (default: COLUMN_CONFIG.budget_columns)
   * @returns Promise resolving to the markdown string
   */
  public static getReport = async (
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; name: BudgetName },
    backtest = false,
    columns?: Columns[],
  ): Promise<string> => {
    swarm.loggerService.info(BUDGET_METHOD_NAME_GET_REPORT, { context, backtest });
    return await swarm.budgetMarkdownService.getReport(context.strategyName, context.exchangeName, context.frameName, backtest, context.name, columns);
  };

  /**
   * Generates the markdown report and saves it to disk via `MarkdownWriter`.
   *
   * @param context - Record key (strategy, exchange, frame) and the budget name
   * @param backtest - Whether to query the backtest record (default: false)
   * @param path - Output directory path (default: "./dump/budget")
   * @param columns - Optional column configuration (default: COLUMN_CONFIG.budget_columns)
   */
  public static dump = async (
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; name: BudgetName },
    backtest = false,
    path?: string,
    columns?: Columns[],
  ): Promise<void> => {
    swarm.loggerService.info(BUDGET_METHOD_NAME_DUMP, { context, backtest, path });
    await swarm.budgetMarkdownService.dump(context.strategyName, context.exchangeName, context.frameName, backtest, context.name, path, columns);
  };

  /**
   * Context-free balance at `context.when`.
   * @param context - Record key, budget name, logical time and symbol
   * @returns Capital, deployed, free and assets as of `when`
   * @throws Error if Budget is not enabled
   */
  public static _getBalance = async (context: IBudgetContext): Promise<IBudgetBalance> => {
    swarm.loggerService.debug(BUDGET_METHOD_NAME_STATIC_GET_BALANCE, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      backtest: context.backtest,
      name: context.name,
    });
    const value = await Budget._getValue(context);
    return TO_BALANCE_FN(value, context.name, context.when);
  };

  /**
   * Context-free free balance (capital − deployed) at `context.when`.
   * @param context - Record key, budget name, logical time and symbol
   * @returns Free balance (negative only after an overdraft)
   * @throws Error if Budget is not enabled
   */
  public static _getFree = async (context: IBudgetContext): Promise<number> => {
    swarm.loggerService.debug(BUDGET_METHOD_NAME_STATIC_GET_FREE, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      backtest: context.backtest,
      name: context.name,
    });
    const value = await Budget._getValue(context);
    return BALANCE_OF_FN(value).free;
  };

  /**
   * Context-free journal up to `context.when`, ascending.
   * @param context - Record key, budget name, logical time and symbol
   * @returns Visible rows (a copy)
   * @throws Error if Budget is not enabled
   */
  public static _getHistory = async (context: IBudgetContext): Promise<IBudgetHistoryRow[]> => {
    swarm.loggerService.debug(BUDGET_METHOD_NAME_STATIC_GET_HISTORY, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      backtest: context.backtest,
      name: context.name,
    });
    const value = await Budget._getValue(context);
    return value.journal;
  };

  /**
   * Context-free reserve: free → deployed under `dto.id` at `context.when`.
   * Refused when `dto.amount` exceeds the free balance as of `when`: a `reject`
   * row is written and the call returns `false`, or throws BudgetRejectedError
   * when `CC_BUDGET_THROW_ON_REJECT` is on.
   * @param dto - Reserve id, amount and optional note
   * @param context - Record key, budget name, logical time and symbol
   * @returns `true` when the reserve was taken, `false` when it was refused
   * @throws BudgetRejectedError when refused and `CC_BUDGET_THROW_ON_REJECT` is on
   * @throws Error if Budget is not enabled, the amount is invalid or the id is already open
   */
  public static _reserve = async (dto: IBudgetReserveDto, context: IBudgetContext): Promise<boolean> => {
    swarm.loggerService.debug(BUDGET_METHOD_NAME_STATIC_RESERVE, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      backtest: context.backtest,
      name: context.name,
      id: dto.id,
      amount: dto.amount,
    });
    ASSERT_AMOUNT_FN(BUDGET_METHOD_NAME_STATIC_RESERVE, dto.amount);
    if (typeof dto.id !== "string" || !dto.id) {
      throw new Error(`${BUDGET_METHOD_NAME_STATIC_RESERVE}: id must be a non-empty string, got ${String(dto.id)}`);
    }
    const symbol = context.symbol ?? null;
    const row = await Budget._setValue((prev) => {
      if (FIND_OPEN_RESERVE_FN(prev, dto.id)) {
        throw new Error(`${BUDGET_METHOD_NAME_STATIC_RESERVE}: reserve id "${dto.id}" is already open in budget "${context.name}"`);
      }
      const { free } = BALANCE_OF_FN(prev);
      if (dto.amount > free) {
        return { type: "reject", action: "reserve", asset: CAPITAL_ASSET, requested: dto.amount, available: free, symbol };
      }
      return { type: "reserve", id: dto.id, amount: dto.amount, ...(dto.note !== undefined && { note: dto.note }), symbol };
    }, context);
    if (row && row.type === "reject") {
      if (GLOBAL_CONFIG.CC_BUDGET_THROW_ON_REJECT) {
        throw new BudgetRejectedError(
          `Budget "${context.name}": reserve "${dto.id}" of ${dto.amount} refused, free balance is ${row.available} at ${context.when.toISOString()}`,
        );
      }
      return false;
    }
    return true;
  };

  /**
   * Context-free release: deployed → free for `dto.id`, `dto.pnl` booked on capital.
   * A second release of the same id (or of an id never reserved) is a no-op.
   * @param dto - Reserve id, optional realized pnl and note
   * @param context - Record key, budget name, logical time and symbol
   * @returns Balance after the release
   * @throws Error if Budget is not enabled
   */
  public static _release = async (dto: IBudgetReleaseDto, context: IBudgetContext): Promise<IBudgetBalance> => {
    swarm.loggerService.debug(BUDGET_METHOD_NAME_STATIC_RELEASE, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      backtest: context.backtest,
      name: context.name,
      id: dto.id,
      pnl: dto.pnl,
    });
    const pnl = dto.pnl ?? 0;
    if (typeof pnl !== "number" || !isFinite(pnl)) {
      throw new Error(`${BUDGET_METHOD_NAME_STATIC_RELEASE}: pnl must be a finite number, got ${pnl}`);
    }
    const symbol = context.symbol ?? null;
    await Budget._setValue((prev, full) => {
      const open = FIND_OPEN_RESERVE_FN(prev, dto.id);
      if (!open) {
        // the reserve exists but lies past the caller's when: a listener with a wrong
        // timestamp would otherwise leave the money deployed forever without a trace
        const ahead = full.journal.find((row) => row.type === "reserve" && row.id === dto.id && row.timestamp > context.when.getTime());
        if (ahead) {
          const message = `Budget "${context.name}": release of "${dto.id}" at ${context.when.toISOString()} ignored, its reserve lies ahead at ${new Date(ahead.timestamp).toISOString()}; check the caller's timestamp`;
          swarm.loggerService.warn(message, {
            strategyName: context.strategyName,
            exchangeName: context.exchangeName,
            frameName: context.frameName,
            backtest: context.backtest,
            name: context.name,
            id: dto.id,
            when: context.when.getTime(),
            reserveTimestamp: ahead.timestamp,
          });
          console.warn(message);
        }
        return null;
      }
      return { type: "release", id: dto.id, amount: open.amount, pnl, ...(dto.note !== undefined && { note: dto.note }), symbol };
    }, context);
    return await Budget._getBalance(context);
  };

  /**
   * Context-free deposit of `dto.amount` units of `dto.asset` at `context.when`.
   * @param dto - Asset, units and optional note
   * @param context - Record key, budget name, logical time and symbol
   * @returns Balance after the deposit
   * @throws Error if Budget is not enabled or the amount is invalid
   */
  public static _deposit = async (dto: IBudgetDepositDto, context: IBudgetContext): Promise<IBudgetBalance> => {
    swarm.loggerService.debug(BUDGET_METHOD_NAME_STATIC_DEPOSIT, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      backtest: context.backtest,
      name: context.name,
      asset: dto.asset,
      amount: dto.amount,
    });
    ASSERT_AMOUNT_FN(BUDGET_METHOD_NAME_STATIC_DEPOSIT, dto.amount);
    const symbol = context.symbol ?? null;
    await Budget._setValue(() => (
      { type: "deposit", asset: dto.asset, amount: dto.amount, ...(dto.note !== undefined && { note: dto.note }), symbol }
    ), context);
    return await Budget._getBalance(context);
  };

  /**
   * Context-free withdrawal of `dto.amount` units of `dto.asset` at `context.when`.
   * Refused when more than held as of `when`: a `reject` row is written and the
   * call returns `false`, or throws BudgetRejectedError when
   * `CC_BUDGET_THROW_ON_REJECT` is on.
   * @param dto - Asset, units and optional note
   * @param context - Record key, budget name, logical time and symbol
   * @returns `true` when the units were withdrawn, `false` when refused
   * @throws BudgetRejectedError when refused and `CC_BUDGET_THROW_ON_REJECT` is on
   * @throws Error if Budget is not enabled or the amount is invalid
   */
  public static _withdraw = async (dto: IBudgetWithdrawDto, context: IBudgetContext): Promise<boolean> => {
    swarm.loggerService.debug(BUDGET_METHOD_NAME_STATIC_WITHDRAW, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      backtest: context.backtest,
      name: context.name,
      asset: dto.asset,
      amount: dto.amount,
    });
    ASSERT_AMOUNT_FN(BUDGET_METHOD_NAME_STATIC_WITHDRAW, dto.amount);
    const symbol = context.symbol ?? null;
    const row = await Budget._setValue((prev) => {
      const held = BALANCE_OF_FN(prev).assets[dto.asset] ?? 0;
      if (dto.amount > held) {
        return { type: "reject", action: "withdraw", asset: dto.asset, requested: dto.amount, available: held, symbol };
      }
      return { type: "withdraw", asset: dto.asset, amount: dto.amount, ...(dto.note !== undefined && { note: dto.note }), symbol };
    }, context);
    if (row && row.type === "reject") {
      if (GLOBAL_CONFIG.CC_BUDGET_THROW_ON_REJECT) {
        throw new BudgetRejectedError(
          `Budget "${context.name}": withdraw of ${dto.amount} ${dto.asset} refused, held ${row.available} at ${context.when.toISOString()}`,
        );
      }
      return false;
    }
    return true;
  };

  /** Context of the instance methods: record key, logical time and symbol from the execution / method context */
  private getContext = (method: string): IBudgetContext => {
    if (!ExecutionContextService.hasContext()) {
      throw new Error(`${method} requires an execution context`);
    }
    if (!MethodContextService.hasContext()) {
      throw new Error(`${method} requires a method context`);
    }
    const { backtest, when, symbol } =
      swarm.executionContextService.context;
    const { exchangeName, frameName, strategyName } =
      swarm.methodContextService.context;
    return {
      strategyName,
      exchangeName,
      frameName,
      backtest,
      name: this.params.name,
      initialCapital: this.params.initialCapital,
      when,
      symbol,
    };
  };

  /**
   * Balance at the logical time of the current execution context.
   * @returns Capital, deployed, free and assets as of `when`
   * @throws Error if no execution/method context
   */
  public getBalance = async (): Promise<IBudgetBalance> => {
    swarm.loggerService.info(BUDGET_METHOD_NAME_GET_BALANCE, { name: this.params.name });
    return await Budget._getBalance(this.getContext(BUDGET_METHOD_NAME_GET_BALANCE));
  };

  /**
   * Free balance (capital − deployed) at the logical time of the current execution context.
   * @returns Free balance (negative only after an overdraft)
   * @throws Error if no execution/method context
   */
  public getFree = async (): Promise<number> => {
    swarm.loggerService.info(BUDGET_METHOD_NAME_GET_FREE, { name: this.params.name });
    return await Budget._getFree(this.getContext(BUDGET_METHOD_NAME_GET_FREE));
  };

  /**
   * Journal up to the logical time of the current execution context, ascending.
   * @returns Visible rows (a copy)
   * @throws Error if no execution/method context
   */
  public getHistory = async (): Promise<IBudgetHistoryRow[]> => {
    swarm.loggerService.info(BUDGET_METHOD_NAME_GET_HISTORY, { name: this.params.name });
    return await Budget._getHistory(this.getContext(BUDGET_METHOD_NAME_GET_HISTORY));
  };

  /**
   * Reserve: free → deployed under `dto.id` at the current logical time.
   * @param dto - Reserve id, amount and optional note
   * @returns `true` when taken, `false` when refused (a `reject` row is on record)
   * @throws BudgetRejectedError when refused and `CC_BUDGET_THROW_ON_REJECT` is on
   * @throws Error if no execution/method context
   */
  public reserve = async (dto: IBudgetReserveDto): Promise<boolean> => {
    swarm.loggerService.info(BUDGET_METHOD_NAME_RESERVE, { name: this.params.name, id: dto.id, amount: dto.amount });
    return await Budget._reserve(dto, this.getContext(BUDGET_METHOD_NAME_RESERVE));
  };

  /**
   * Release: deployed → free for `dto.id`, `dto.pnl` booked on capital, at the current logical time.
   * @param dto - Reserve id, optional realized pnl and note
   * @returns Balance after the release
   * @throws Error if no execution/method context
   */
  public release = async (dto: IBudgetReleaseDto): Promise<IBudgetBalance> => {
    swarm.loggerService.info(BUDGET_METHOD_NAME_RELEASE, { name: this.params.name, id: dto.id, pnl: dto.pnl });
    return await Budget._release(dto, this.getContext(BUDGET_METHOD_NAME_RELEASE));
  };

  /**
   * Deposit `dto.amount` units of `dto.asset` at the current logical time.
   * @param dto - Asset, units and optional note
   * @returns Balance after the deposit
   * @throws Error if no execution/method context
   */
  public deposit = async (dto: IBudgetDepositDto): Promise<IBudgetBalance> => {
    swarm.loggerService.info(BUDGET_METHOD_NAME_DEPOSIT, { name: this.params.name, asset: dto.asset, amount: dto.amount });
    return await Budget._deposit(dto, this.getContext(BUDGET_METHOD_NAME_DEPOSIT));
  };

  /**
   * Withdraw `dto.amount` units of `dto.asset` at the current logical time.
   * @param dto - Asset, units and optional note
   * @returns `true` when withdrawn, `false` when refused (a `reject` row is on record)
   * @throws BudgetRejectedError when refused and `CC_BUDGET_THROW_ON_REJECT` is on
   * @throws Error if no execution/method context
   */
  public withdraw = async (dto: IBudgetWithdrawDto): Promise<boolean> => {
    swarm.loggerService.info(BUDGET_METHOD_NAME_WITHDRAW, { name: this.params.name, asset: dto.asset, amount: dto.amount });
    return await Budget._withdraw(dto, this.getContext(BUDGET_METHOD_NAME_WITHDRAW));
  };
}

/**
 * Global singleton instance of BudgetLiveAdapter.
 * Provides live trading budget storage with pluggable backends.
 */
export const BudgetLive = new BudgetLiveAdapter();

/**
 * Global singleton instance of BudgetBacktestAdapter.
 * Provides backtest budget storage with pluggable backends.
 */
export const BudgetBacktest = new BudgetBacktestAdapter();
