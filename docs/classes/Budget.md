---
title: docs/class/Budget
group: docs
---

# Budget

Shared balance of a strategy run — one record for every symbol of the run,
kept as a journal of actions and read at the caller's logical time.

Works like `State`: an instance in the strategy module, no schemas, every
instance method resolves the mode, the logical time and the symbol itself
from `backtest.executionContextService` / `backtest.methodContextService`.
Unlike `State`, the record is NOT bound to a signal: its key is
`(strategyName, exchangeName, frameName, backtest)` plus the budget `name`,
so every symbol of the run reads and writes the same journal, and no signal
lookup happens (the methods work from `getSignal` as well as from callbacks).

Invariants:
- a read at `when` sees only rows with `timestamp &lt;= when` (a symbol that is
  ahead in logical time does not leak its future into a lagging one);
- an action is inserted at its `timestamp`, never overwriting what came
  after; the balances after it are recomputed;
- the journal order is `(timestamp, symbol, seq)` — the same run yields the
  same journal whatever order Node interleaved the symbols in;
- the budget itself never waits for another symbol and holds no lock of its
  own; the clocks of parallel backtests are kept together by the engine's
  `CC_BACKTEST_LOCKSTEP` (`Lockstep` in `BacktestLogicPrivateService.run`):
  every timeframe iteration runs under a process-wide FIFO mutex, and a
  candle replay hands it off at every timeframe boundary, so the symbols
  are at most one timeframe apart even while one of them replays a long
  position; with the flag off (the test config) the symbols drift freely;
- an overdraft (two symbols took the same money because one clock lagged
  behind the other) is recorded on the reserve row as `overdraft` and
  logged, never hidden — `getFree()` goes negative and later reserves are
  refused until releases bring it back.

Every inserted row is emitted on `budgetSubject`: `Report.enable()` writes it
to `./dump/report/budget.jsonl`, `Markdown.enable()` accumulates it for the
`# Budget Report:` markdown (`Budget.getData` / `getReport` / `dump`, keyed by
the record key and the budget name), and `listenBudget` hands it to user code.

Requires an explicit `Budget.enable()` call before use, like `State.enable()`.

## Constructor

```ts
constructor(params: { name: string; initialCapital: number; });
```

## Properties

### params

```ts
params: any
```

### _getNames

```ts
_getNames: () => string[]
```

Names of the budgets constructed in this process, in construction order.

### enable

```ts
enable: (() => (...args: any[]) => any) & ISingleshotClearable<() => (...args: any[]) => any>
```

Enables budget storage. Uses singleshot so that `disable()` and `clear()`
behave like `State`'s; there are no event subscriptions — the record is not
bound to a signal and is not cleaned up on its close.

### disable

```ts
disable: () => void
```

Disables budget storage.
Safe to call multiple times.

### _getValue

```ts
_getValue: any
```

Fold of the record up to `context.when`, routed to BudgetBacktest / BudgetLive by `context.backtest`

### _setValue

```ts
_setValue: any
```

Insert an action at `context.when`, routed to BudgetBacktest / BudgetLive by `context.backtest`

### getData

```ts
getData: (context: { strategyName: string; exchangeName: string; frameName: string; name: string; }, backtest?: boolean) => Promise<BudgetStatisticsModel>
```

Rows of the budget markdown report (`BudgetMarkdownService`) accumulated
for a record: every row inserted since `Markdown.enable()`, newest first,
capped by `CC_MAX_BUDGET_MARKDOWN_ROWS`. The record key is taken as given
(no schema validation): a budget needs no schema of its own.

### getReport

```ts
getReport: (context: { strategyName: string; exchangeName: string; frameName: string; name: string; }, backtest?: boolean, columns?: Columns$c[]) => Promise<string>
```

Markdown report of the budget journal rows accumulated for a record
(`# Budget Report: {strategyName}:{name}`).

### dump

```ts
dump: (context: { strategyName: string; exchangeName: string; frameName: string; name: string; }, backtest?: boolean, path?: string, columns?: Columns$c[]) => Promise<void>
```

Generates the markdown report and saves it to disk via `MarkdownWriter`.

### _getBalance

```ts
_getBalance: (context: IBudgetContext) => Promise<IBudgetBalance>
```

Context-free balance at `context.when`.

### _getFree

```ts
_getFree: (context: IBudgetContext) => Promise<number>
```

Context-free free balance (capital − deployed) at `context.when`.

### _getHistory

```ts
_getHistory: (context: IBudgetContext) => Promise<IBudgetHistoryRow[]>
```

Context-free journal up to `context.when`, ascending.

### _reserve

```ts
_reserve: (dto: IBudgetReserveDto, context: IBudgetContext) => Promise<IBudgetBalance>
```

Context-free reserve: free → deployed under `dto.id` at `context.when`.
Refused (a `reject` row, then BudgetRejectedError) when `dto.amount` exceeds
the free balance as of `when`.

### _release

```ts
_release: (dto: IBudgetReleaseDto, context: IBudgetContext) => Promise<IBudgetBalance>
```

Context-free release: deployed → free for `dto.id`, `dto.pnl` booked on capital.
A second release of the same id (or of an id never reserved) is a no-op.

### _deposit

```ts
_deposit: (dto: IBudgetDepositDto, context: IBudgetContext) => Promise<IBudgetBalance>
```

Context-free deposit of `dto.amount` units of `dto.asset` at `context.when`.

### _withdraw

```ts
_withdraw: (dto: IBudgetWithdrawDto, context: IBudgetContext) => Promise<IBudgetBalance>
```

Context-free withdrawal of `dto.amount` units of `dto.asset` at `context.when`.
Refused (a `reject` row, then BudgetRejectedError) when more than held as of `when`.

### getContext

```ts
getContext: any
```

Context of the instance methods: record key, logical time and symbol from the execution / method context

### getBalance

```ts
getBalance: () => Promise<IBudgetBalance>
```

Balance at the logical time of the current execution context.

### getFree

```ts
getFree: () => Promise<number>
```

Free balance (capital − deployed) at the logical time of the current execution context.

### getHistory

```ts
getHistory: () => Promise<IBudgetHistoryRow[]>
```

Journal up to the logical time of the current execution context, ascending.

### reserve

```ts
reserve: (dto: IBudgetReserveDto) => Promise<IBudgetBalance>
```

Reserve: free → deployed under `dto.id` at the current logical time.

### release

```ts
release: (dto: IBudgetReleaseDto) => Promise<IBudgetBalance>
```

Release: deployed → free for `dto.id`, `dto.pnl` booked on capital, at the current logical time.

### deposit

```ts
deposit: (dto: IBudgetDepositDto) => Promise<IBudgetBalance>
```

Deposit `dto.amount` units of `dto.asset` at the current logical time.

### withdraw

```ts
withdraw: (dto: IBudgetWithdrawDto) => Promise<IBudgetBalance>
```

Withdraw `dto.amount` units of `dto.asset` at the current logical time.
