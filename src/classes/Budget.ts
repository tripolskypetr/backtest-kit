import { compose, memoize, queued, singleshot } from "functools-kit";
import { PersistBudgetAdapter, BudgetRecordKey } from "./Persist";
import { StrategyName } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { BudgetRejectedError } from "../error/BudgetRejectedError";
import swarm, { ExecutionContextService, MethodContextService } from "../lib";

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
   * the record exists. Default: 0.
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
   * Set when a later-inserted earlier row (another symbol with lagging clocks)
   * made this reserve exceed the free balance: `-free` after the row. The
   * budget never hides it (see the Budget class notes).
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

/** Initial value of a budget record, the counterpart of `initialValue` in `State` */
export interface IBudgetInitial {
  initialCapital: number;
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
 */
export type BudgetDispatch = (prev: IBudgetValue) => BudgetAction | null | Promise<BudgetAction | null>;

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
 * insertion in the middle reflects the new free balance on every later row.
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
    const action = await dispatch(FOLD_FN(this._value, when.getTime()));
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
    return { initialCapital: this.initialValue.initialCapital, journal: [] };
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
    const action = await dispatch(FOLD_FN(this._value, when.getTime()));
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
    await instance.waitForInit(isInitial);
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
    await instance.waitForInit(isInitial);
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
    await instance.waitForInit(isInitial);
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
    await instance.waitForInit(isInitial);
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

/** Adapter dto from a static context (initialCapital defaults to 0 for a record created by a static call) */
const TO_ADAPTER_DTO_FN = (context: IBudgetContext): TBudgetAdapterDto => ({
  strategyName: context.strategyName,
  exchangeName: context.exchangeName,
  frameName: context.frameName,
  backtest: context.backtest,
  name: context.name,
  initialValue: { initialCapital: context.initialCapital ?? 0 },
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
 * - nothing waits for another symbol, nothing is synchronized;
 * - an overdraft (two symbols took the same money because of lagging clocks)
 *   is recorded on the reserve row as `overdraft` and logged, never hidden —
 *   `getFree()` goes negative and later reserves are refused until releases
 *   bring it back.
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
 * try {
 *   await fund.reserve({ id, amount: cost });
 * } catch (error) {
 *   if (BudgetRejectedError.isBudgetRejectedError(error)) return null;
 *   throw error;
 * }
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
   * Refused (a `reject` row, then BudgetRejectedError) when `dto.amount` exceeds
   * the free balance as of `when`.
   * @param dto - Reserve id, amount and optional note
   * @param context - Record key, budget name, logical time and symbol
   * @returns Balance after the reserve
   * @throws BudgetRejectedError when the free balance is insufficient
   * @throws Error if Budget is not enabled, the amount is invalid or the id is already open
   */
  public static _reserve = async (dto: IBudgetReserveDto, context: IBudgetContext): Promise<IBudgetBalance> => {
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
      throw new BudgetRejectedError(
        `Budget "${context.name}": reserve "${dto.id}" of ${dto.amount} refused, free balance is ${row.available} at ${context.when.toISOString()}`,
      );
    }
    return await Budget._getBalance(context);
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
    await Budget._setValue((prev) => {
      const open = FIND_OPEN_RESERVE_FN(prev, dto.id);
      if (!open) {
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
   * Refused (a `reject` row, then BudgetRejectedError) when more than held as of `when`.
   * @param dto - Asset, units and optional note
   * @param context - Record key, budget name, logical time and symbol
   * @returns Balance after the withdrawal
   * @throws BudgetRejectedError when the held amount is insufficient
   * @throws Error if Budget is not enabled or the amount is invalid
   */
  public static _withdraw = async (dto: IBudgetWithdrawDto, context: IBudgetContext): Promise<IBudgetBalance> => {
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
      throw new BudgetRejectedError(
        `Budget "${context.name}": withdraw of ${dto.amount} ${dto.asset} refused, held ${row.available} at ${context.when.toISOString()}`,
      );
    }
    return await Budget._getBalance(context);
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
   * @returns Balance after the reserve
   * @throws BudgetRejectedError when the free balance is insufficient
   * @throws Error if no execution/method context
   */
  public reserve = async (dto: IBudgetReserveDto): Promise<IBudgetBalance> => {
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
   * @returns Balance after the withdrawal
   * @throws BudgetRejectedError when the held amount is insufficient
   * @throws Error if no execution/method context
   */
  public withdraw = async (dto: IBudgetWithdrawDto): Promise<IBudgetBalance> => {
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
