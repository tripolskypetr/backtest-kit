---
title: private/interfaces
group: private
---

# backtest-kit api reference

![schema](../../assets/uml.svg)

**Overview:**

Backtest-kit is a production-ready TypeScript framework for backtesting and live trading strategies with crash-safe state persistence, signal validation, and memory-optimized architecture. The framework follows clean architecture principles with dependency injection, separation of concerns, and type-safe discriminated unions.

**Core Concepts:**

* **Signal Lifecycle:** Type-safe state machine (idle → opened → active → closed) with discriminated unions
* **Execution Modes:** Backtest mode (historical data) and Live mode (real-time with crash recovery)
* **VWAP Pricing:** Volume Weighted Average Price from last 5 1-minute candles for all entry/exit decisions
* **Signal Validation:** Comprehensive validation ensures TP/SL logic, positive prices, and valid timestamps
* **Interval Throttling:** Prevents signal spam with configurable intervals (1m, 3m, 5m, 15m, 30m, 1h)
* **Crash-Safe Persistence:** Atomic file writes with automatic state recovery for live trading
* **Async Generators:** Memory-efficient streaming for backtest and live execution
* **Accurate PNL:** Calculation with fees (0.1%) and slippage (0.1%) for realistic simulations
* **Event System:** Signal emitters for backtest/live/global signals, errors, and completion events
* **Graceful Shutdown:** Live.background() waits for open positions to close before stopping
* **Pluggable Persistence:** Custom adapters for Redis, MongoDB, or any storage backend

**Architecture Layers:**

* **Client Layer:** Pure business logic without DI (ClientStrategy, ClientExchange, ClientFrame) using prototype methods for memory efficiency
* **Service Layer:** DI-based services organized by responsibility:
  * **Schema Services:** Registry pattern for configuration with shallow validation (StrategySchemaService, ExchangeSchemaService, FrameSchemaService)
  * **Validation Services:** Runtime existence validation with memoization (StrategyValidationService, ExchangeValidationService, FrameValidationService)
  * **Connection Services:** Memoized client instance creators (StrategyConnectionService, ExchangeConnectionService, FrameConnectionService)
  * **Global Services:** Context wrappers for public API (StrategyGlobalService, ExchangeGlobalService, FrameGlobalService)
  * **Logic Services:** Async generator orchestration (BacktestLogicPrivateService, LiveLogicPrivateService)
  * **Markdown Services:** Auto-generated reports with tick-based event log (BacktestMarkdownService, LiveMarkdownService)
* **Persistence Layer:** Crash-safe atomic file writes with PersistSignalAdaper, extensible via PersistBase
* **Event Layer:** Subject-based emitters (signalEmitter, errorEmitter, doneEmitter) with queued async processing

**Key Design Patterns:**

* **Discriminated Unions:** Type-safe state machines without optional fields
* **Async Generators:** Stream results without memory accumulation, enable early termination
* **Dependency Injection:** Custom DI container with Symbol-based tokens
* **Memoization:** Client instances cached by schema name using functools-kit
* **Context Propagation:** Nested contexts using di-scoped (ExecutionContext + MethodContext)
* **Registry Pattern:** Schema services use ToolRegistry for configuration management
* **Singleshot Initialization:** One-time operations with cached promise results
* **Persist-and-Restart:** Stateless process design with disk-based state recovery
* **Pluggable Adapters:** PersistBase as base class for custom storage backends
* **Queued Processing:** Sequential event handling with functools-kit queued wrapper

**Data Flow (Backtest):**

1. User calls Backtest.background(symbol, context) or Backtest.run(symbol, context)
2. Validation services check strategyName, exchangeName, frameName existence
3. BacktestLogicPrivateService.run(symbol) creates async generator with yield
4. MethodContextService.runInContext sets strategyName, exchangeName, frameName
5. Loop through timeframes, call StrategyGlobalService.tick()
6. ExecutionContextService.runInContext sets symbol, when, backtest=true
7. ClientStrategy.tick() checks VWAP against TP/SL conditions
8. If opened: fetch candles and call ClientStrategy.backtest(candles)
9. Yield closed result and skip timeframes until closeTimestamp
10. Emit signals via signalEmitter, signalBacktestEmitter
11. On completion emit doneEmitter with { backtest: true, symbol, strategyName, exchangeName }

**Data Flow (Live):**

1. User calls Live.background(symbol, context) or Live.run(symbol, context)
2. Validation services check strategyName, exchangeName existence
3. LiveLogicPrivateService.run(symbol) creates infinite async generator with while(true)
4. MethodContextService.runInContext sets schema names
5. Loop: create when = new Date(), call StrategyGlobalService.tick()
6. ClientStrategy.waitForInit() loads persisted signal state from PersistSignalAdaper
7. ClientStrategy.tick() with interval throttling and validation
8. setPendingSignal() persists state via PersistSignalAdaper.writeSignalData()
9. Yield opened and closed results, sleep(TICK_TTL) between ticks
10. Emit signals via signalEmitter, signalLiveEmitter
11. On stop() call: wait for lastValue?.action === 'closed' before breaking loop (graceful shutdown)
12. On completion emit doneEmitter with { backtest: false, symbol, strategyName, exchangeName }

**Event System:**

* **Signal Events:** listenSignal, listenSignalBacktest, listenSignalLive for tick results (idle/opened/active/closed)
* **Error Events:** listenError for background execution errors (Live.background, Backtest.background)
* **Completion Events:** listenDone, listenDoneOnce for background execution completion with DoneContract
* **Queued Processing:** All listeners use queued wrapper from functools-kit for sequential async execution
* **Filter Predicates:** Once listeners (listenSignalOnce, listenDoneOnce) accept filter function for conditional triggering

**Performance Optimizations:**

* Memoization of client instances by schema name
* Prototype methods (not arrow functions) for memory efficiency
* Fast backtest method skips individual ticks
* Timeframe skipping after signal closes
* VWAP caching per tick/candle
* Async generators stream without array accumulation
* Interval throttling prevents excessive signal generation
* Singleshot initialization runs exactly once per instance
* LiveMarkdownService bounded queue (MAX_EVENTS = 25) prevents memory leaks
* Smart idle event replacement (only replaces if no open/active signals after last idle)

**Use Cases:**

* Algorithmic trading with backtest validation and live deployment
* Strategy research and hypothesis testing on historical data
* Signal generation with ML models or technical indicators
* Portfolio management tracking multiple strategies across symbols
* Educational projects for learning trading system architecture
* Event-driven trading bots with real-time notifications (Telegram, Discord, email)
* Multi-exchange trading with pluggable exchange adapters

**Test Coverage:**

The framework includes comprehensive unit tests using worker-testbed (tape-based testing):

* **exchange.test.mjs:** Tests exchange helper functions (getCandles, getAveragePrice, getDate, getMode, formatPrice, formatQuantity) with mock candle data and VWAP calculations
* **event.test.mjs:** Tests Live.background() execution and event listener system (listenSignalLive, listenSignalLiveOnce, listenDone, listenDoneOnce) for async coordination
* **validation.test.mjs:** Tests signal validation logic (valid long/short positions, invalid TP/SL relationships, negative price detection, timestamp validation) using listenError for error handling
* **pnl.test.mjs:** Tests PNL calculation accuracy with realistic fees (0.1%) and slippage (0.1%) simulation
* **backtest.test.mjs:** Tests Backtest.run() and Backtest.background() with signal lifecycle verification (idle → opened → active → closed), listenDone events, early termination, and all close reasons (take_profit, stop_loss, time_expired)
* **callbacks.test.mjs:** Tests strategy lifecycle callbacks (onOpen, onClose, onTimeframe) with correct parameter passing, backtest flag verification, and signal object integrity
* **report.test.mjs:** Tests markdown report generation (Backtest.getReport, Live.getReport) with statistics validation (win rate, average PNL, total PNL, closed signals count) and table formatting

All tests follow consistent patterns:
* Unique exchange/strategy/frame names per test to prevent cross-contamination
* Mock candle generator (getMockCandles.mjs) with forward timestamp progression
* createAwaiter from functools-kit for async coordination
* Background execution with Backtest.background() and event-driven completion detection


# backtest-kit interfaces

## Interface WalkerStopContract

This interface describes the information sent when a walker is being stopped. 

It's used to signal that a specific trading strategy, running within a particular walker, needs to be halted. 

Think of it as a notification that something's being paused – it tells you which symbol is involved, which strategy needs to stop, and which walker is responsible for that strategy. 

This is especially useful when you're running several different strategies at once, allowing you to selectively stop just the ones you need to.


## Interface WalkerStatisticsModel

The WalkerStatisticsModel provides a way to easily work with the results of your backtesting runs. It's designed to give you a clear and organized view of how different strategies performed.

Essentially, it combines the standard backtest results with extra information for comparing strategies against each other.

The `strategyResults` property holds a list of all the results for each strategy you tested, allowing you to easily analyze and compare their performance.

## Interface WalkerContract

The WalkerContract represents updates on how a comparison of different trading strategies is progressing. It's like getting snapshots of the process as each strategy finishes its test.

Each time a strategy completes its backtest, this contract provides information about it, including the strategy’s name, the exchange and symbol it was tested on, and its performance statistics.

You’ll see details like the strategy's ranking, the value of the metric being optimized (like Sharpe Ratio), and how it compares to the best-performing strategy encountered so far. 

It also tells you how many strategies have been tested and the total number planned, so you can track the overall progress of the comparison. Essentially, it’s a progress report for your backtesting experiment.


## Interface WalkerCompleteContract

The WalkerCompleteContract represents the final notification you receive after a full comparison of trading strategies. It signals that all strategies have been tested and the results are ready. 

This contract bundles together a lot of information, including the name of the "walker" that ran the tests, the trading symbol being evaluated, and the exchange and timeframe used.

You'll also find details about the optimization metric, the total number of strategies considered, and, crucially, which strategy performed the best along with its best metric value and detailed statistics. It’s your one-stop source for understanding the outcome of a backtest comparison.

## Interface ValidationErrorNotification

This notification signals that a validation error occurred during your backtesting or trading strategy evaluation. 

It's triggered when the risk validation functions you've set up encounter a problem.

Each notification provides a unique identifier, a descriptive error message, and detailed information about the error, including its stack trace.

Importantly, the `backtest` property will always be false, indicating that this error arose from a live context rather than the backtest environment itself.


## Interface ValidateArgs

This interface, ValidateArgs, helps ensure that the names you use for things like exchanges, timeframes, strategies, and risk profiles are all correct within your backtesting setup. 

Think of it as a checklist for those names.

Each property – like ExchangeName, FrameName, StrategyName – expects an enumeration (enum) that holds the valid options. The backtest-kit will then verify that the names you’re using match the values defined in those enums. This helps prevent errors caused by typos or incorrect configuration. Essentially, it’s a safeguard to keep everything consistent and working properly.

## Interface TrailingTakeCommitNotification

This notification tells you when a trailing take profit order has been executed. It's like a confirmation that your strategy adjusted its take profit and then triggered a trade.

The `type` property confirms this is a trailing take commit notification. Each notification has a unique `id` and `timestamp` to track its occurrence. You can see if the trade happened in backtest mode (`backtest`) or live trading (`backtest: false`).

The notification provides all the essential details of the trade, including the `symbol` being traded, the name of the `strategyName` that generated the signal, and the `exchangeName` where the action took place. You’ll also find a unique `signalId` for that specific signal.

It includes information about how the take profit was adjusted (`percentShift`), the `currentPrice` at the time of execution, and the trade direction (`position`).  You can see the initial `priceOpen`, the adjusted `priceTakeProfit` and `priceStopLoss`, as well as their original values before any trailing adjustments. 

For positions built with dollar-cost averaging (DCA), you'll find the `totalEntries` and `totalPartials` representing the number of entries and partial closes.

Comprehensive Profit and Loss (PNL) data is provided (`pnl`, `pnlPercentage`, `pnlPriceOpen`, `pnlPriceClose`, `pnlCost`, `pnlEntries`). Timestamps for various stages of the trade lifecycle are also provided: `scheduledAt` (signal creation), `pendingAt` (when the position became active), and `createdAt` (when the notification was generated).

## Interface TrailingTakeCommit

This describes a "trailing take" event, which happens when a trailing stop-loss or take-profit order is triggered during a backtest. 

The `action` property simply identifies this as a trailing-take event.

The `percentShift` defines how much the take-profit price moves based on market movements.

You'll also find details about the current market price (`currentPrice`), the profit and loss (`pnl`) associated with the trade, and whether it's a long or short position.

Key pricing information is included too:  the original take-profit price set initially (`originalPriceTakeProfit`), the current take-profit price after adjustments (`priceTakeProfit`), and details about the stop-loss price as well. 

Timestamps (`scheduledAt` and `pendingAt`) mark when the signal and the position were created.

## Interface TrailingStopCommitNotification

This notification lets you know when a trailing stop order has been triggered and executed. It provides a wealth of information about the trade, including the unique identifier for the notification, the exact time it occurred, and whether it happened during a backtest or live trading.

You’ll find details about the specific trading symbol, the strategy that generated the signal, and the exchange where the trade took place. The notification also includes the original and adjusted stop-loss and take-profit prices, allowing you to see exactly how the trailing stop impacted the order.

It provides complete data around the position itself, including entry and exit prices, the total number of entries and partial closes, and crucially, the profit and loss associated with the trade. This includes the total capital invested and a breakdown of the profit/loss in USD. Lastly, the notification captures timestamps for signal creation and when the position became pending.

## Interface TrailingStopCommit

The TrailingStopCommit represents an event triggered when a trailing stop loss mechanism adjusts the stop price for a trade. It essentially communicates that the trailing stop has kicked in and modified the protective stop-loss level. 

This event contains detailed information about the adjustment, including the percentage shift used to calculate the new stop loss price. You’ll also find the current market price at the time of the adjustment, along with the current unrealized profit and loss (PNL) for the position.

The event clearly identifies the trade direction (long or short) and provides the original entry price, along with the initial and current take profit and stop loss prices. Timestamps are also included, marking when the signal was created and when the position was activated. This gives you a complete picture of how the trailing stop order influenced the trade’s management.

## Interface TickEvent

The `TickEvent` data structure provides a consistent way to represent all types of events happening within your trading system, regardless of what's actually happening – whether a trade is being opened, closed, scheduled, or cancelled. It bundles together all the relevant information about each event, such as the exact time it occurred, the type of action taken (like "closed" or "scheduled"), and details related to the trade itself. You’ll find things like the trading symbol, signal identifiers, prices, and profit/loss figures all conveniently organized within this single object.

Specific details like take profit and stop loss prices, the number of entries in a DCA strategy, and partial close executions are included when applicable. For closed trades, you'll also get information about the reason for closure and the duration the position was held. The structure also includes timestamps for scheduled events and when positions become active, making it ideal for comprehensive reporting and analysis of your backtesting results.

## Interface SyncStatisticsModel

This model helps you understand how often your trading signals are being synchronized. It gathers data about each synchronization event, giving you a complete record of what's happening. 

You'll find a list of every sync event, including all the specifics, within the `eventList`. It also provides the total number of synchronization events, as well as separate counts for when signals are opened and closed. This allows you to monitor the lifecycle of your signals and identify potential issues.

## Interface SyncEvent

This data structure holds all the key details about events occurring during a trading strategy's lifecycle, especially useful for creating clear, understandable reports. It records information like when the event happened (`timestamp`), which trading pair was involved (`symbol`), and the name of the strategy and exchange being used.

You'll find specifics about individual signals, like a unique ID (`signalId`) and the action taken (e.g., opening a position, closing it - `action`). It includes pricing data like the current market price, entry price (`priceOpen`), take profit and stop-loss levels (both original and adjusted), and even details about any DCA (Dollar Cost Averaging) strategy used.

For signals that have been closed, you can also find out why they were closed (`closeReason`).  Flags indicate whether the event originates from a backtest or live trading environment (`backtest`), and the creation timestamps (`createdAt`) are available for tracking.  The overall profit/loss (`pnl`) for the signal up to that point is also included.

## Interface StrategyStatisticsModel

The `StrategyStatisticsModel` holds detailed statistics about what your trading strategy is doing. Think of it as a record of all the actions your strategy takes.

It breaks down events into categories like buy orders, close orders, and adjustments using trailing stops or take profits.

You'll find a comprehensive list of all the individual strategy events recorded in the `eventList`.  Beyond that, it provides simple counts for different event types, like how many times your strategy canceled a scheduled order or took a partial profit. 

The `totalEvents` property gives you the overall number of strategy actions performed.

## Interface StrategyEvent

This data structure holds all the important details about events happening within your trading strategy, like when a trade was opened or closed, and why. It's designed to make it easy to generate reports and understand what your strategy is doing. 

Each event includes information like the exact time it occurred, the trading pair involved, the strategy's name, and the exchange used. You’ll also find details specific to the action taken, such as the signal ID, whether it's a backtest or live trade, and the direction of the trade (long or short).

For trades, it tracks key prices – the initial entry price, the take profit and stop loss levels, and how those prices might have been adjusted by trailing stops. If your strategy uses dollar-cost averaging (DCA), you’ll see the cumulative entry price and the total number of entries. It also records profitability metrics like P&L and the cost of the trade. Finally, it tracks timestamps related to scheduling and pending actions.

## Interface SignalSyncOpenNotification

This notification lets you know when a planned trading signal, like a limit order, has been triggered and a position has been opened. It provides a detailed snapshot of what happened at the moment the trade began.

You'll find key details like a unique identifier for the notification, the exact time it occurred, and whether it happened during a backtest or a live trading session. The notification includes information about the trading pair (e.g., BTCUSDT), the strategy responsible for the signal, and the exchange where the trade was executed.

It also breaks down the financial aspects of the trade with data on profit and loss, including the entry and exit prices used for calculations, the total cost of the position, and the amount of capital invested. You can also find details about the trade direction (long or short), the entry price, and any take profit or stop-loss levels that were in place. Finally, this notification offers insight into any averaging (DCA) or partial closing strategies that were applied.

## Interface SignalSyncCloseNotification

This notification lets you know when a pending trading signal has been closed – whether it hit a take profit or stop loss, expired, or was manually closed. It provides a wealth of information about the closed signal, including a unique identifier and a timestamp for when it happened. 

You'll see details about whether the trade occurred in a backtest or live environment, the trading pair involved, and the strategy and exchange that generated the signal. The notification also gives you precise price points like the entry price, take profit level, stop loss, and the current market price at the time of closure.

Furthermore, it provides a complete profit and loss breakdown, including percentages, costs, and entry/exit prices. It also includes technical details like the number of DCA entries and partial closes performed, along with timestamps for creation, pending, and scheduling. Finally, it explains *why* the signal was closed – for example, due to reaching a take profit, stop loss, or expiry.

## Interface SignalSyncBase

This interface describes the common information found in all signal synchronization events within the backtest-kit trading framework. Every signal event, whether generated during a backtest or in live trading, will include details such as the trading symbol (like BTCUSDT), the name of the strategy that created it, and the exchange where it originated.

You’ll also find information about the timeframe being used (only relevant during backtests), whether it's a backtest or live event, a unique identifier for the signal, its timestamp, and the full details of the public signal row at the moment the signal was generated. This shared structure makes it easy to process and understand signal events from different sources and modes.

## Interface SignalScheduledNotification

This notification lets you know when a trading signal is set to execute in the future. Think of it as a heads-up that an action will be taken later. Each notification has a unique ID and timestamp indicating when the signal was scheduled. 

You’ll see details about the trade itself, including the symbol being traded (like BTCUSDT), the strategy that generated the signal, and which exchange will handle the transaction. The notification also specifies the trade direction (long or short), entry price, take profit and stop loss levels.

Important details about the signal's origin are included, such as whether it's from a backtest or a live environment, the initial entry price, and details on any DCA averaging or partial closes that have occurred. There's also financial information associated with the signal, including the initial cost, unrealized P&L, and relevant price points used in the P&L calculation. Finally, the current market price and creation timestamp at the time the signal was scheduled are provided.

## Interface SignalOpenedNotification

This notification lets you know when a new trading position has been opened. It contains a wealth of information about the trade, including a unique identifier and a timestamp marking when the position went live. You'll find details like the trading symbol, the name of the strategy that generated the signal, and the exchange used.

The notification specifies whether the trade occurred during a backtest or in live mode, and it tells you the direction of the trade – whether it was a long (buy) or short (sell) position. Crucially, it provides the entry price, along with any take profit and stop-loss levels that were set.

Beyond the basics, it includes details about any averaging (DCA) that was used, including the number of entries, and information on partial closes. You’ll also see financial details like the cost of the position, its current profit/loss (both in USD and as a percentage), and the entry and exit prices used for PNL calculation. Finally, there's a field for an optional note to describe the reason behind the signal, and timestamps indicating when the signal was created and the position became pending.

## Interface SignalOpenContract

This event, `SignalOpenContract`, is triggered when a pre-planned order, a limit order signal, actually gets filled on the exchange. Think of it as confirmation that your intended trade is underway. 

It happens in two ways: during testing, it's triggered when the price hits your planned entry point (lower for a buy, higher for a sell); in live trading, it's triggered when the exchange confirms the order is filled.

This event provides comprehensive details about the trade, including the actual entry price, the current market price, and details about any take profit and stop loss orders that were set.

You'll find information about the overall profit and loss (PNL) so far, as well as the total cost of getting into the position.

The event also clarifies the trade direction (long or short), how many times the trade was averaged using DCA, and the timestamps associated with the signal’s creation and activation. This allows you to sync external systems, maintain a detailed audit trail, or log activity.

## Interface SignalData$1

This data structure holds information about a single completed trade, or "signal," within a backtest. It lets you see details like which trading strategy created the signal, a unique ID for that signal, and the symbol being traded (like BTC/USDT). You’ll also find out if the trade was a long or short position, how much profit or loss was made as a percentage, and why the trade was closed. Finally, timestamps mark exactly when the trade started and finished, allowing for a complete timeline of each signal’s lifecycle.


## Interface SignalCommitBase

This defines the foundational information shared across all signal commitment events within the backtest-kit framework. Each signal commit event includes details like the trading pair's symbol – for example, "BTCUSDT" – and the name of the strategy responsible for generating the signal. You'll also find the name of the exchange used, the timeframe being observed (empty in live mode, but relevant during backtesting), and whether the event originates from a backtest or live trading environment.

A unique identifier, timestamp, and details about the number of entries and partial closes associated with the signal are also provided. Crucially, it also records the original entry price, which remains consistent even if the position is later adjusted through DCA averaging. This base structure ensures consistency and provides key context for understanding signal commitment events.


## Interface SignalClosedNotification

This notification informs you when a trading position, triggered by a signal, has been closed, whether due to a take profit, stop loss, or manual closure. It provides a comprehensive set of details about the closed position, including a unique identifier and timestamp. You'll find key information like the trading symbol, the name of the strategy that generated the signal, and the direction of the trade (long or short).

The notification breaks down the specifics of the trade: entry and exit prices, original take profit and stop loss levels, details about any DCA averaging performed, and specifics about partial closes. You can also see how profitable the trade was, with both percentage and absolute profit/loss figures, alongside the effective prices used in that calculation.

Finally, the notification also includes timing data - when the signal was originally scheduled, when it went pending, and when the position was ultimately closed - along with optional notes to provide more context around the closure. This detail helps you understand how long the position was held and any particular circumstances that led to its closing.

## Interface SignalCloseContract

This event lets you know when a trading signal has been closed, whether it was due to hitting a take profit or stop loss, expiring, or a manual closure. It’s designed for systems that need to keep track of trades happening outside of the backtest-kit itself, like order management or accounting systems.

The event provides details about the closure, including the current market price, the profit and loss (PNL) of the trade, and whether it was a long or short position. You’ll also find the original and effective prices used for the take profit, stop loss, and initial entry, along with the timestamps related to the signal's creation and activation. 

Finally, the event reports how many times the position was averaged using DCA and how many partial closes were performed during its lifetime. This gives you a complete picture of the position's history.

## Interface SignalCancelledNotification

This notification tells you when a signal that was planned to be executed has been cancelled before it actually happened. It provides a lot of detail about the cancelled signal, helping you understand why it was stopped.

The notification includes identifying information like a unique ID, timestamp, and the names of the strategy and exchange involved. You'll also find details about the planned trade itself – whether it was a long or short position, the target take profit and stop loss prices, and the intended entry price.

Additional data like the number of entries planned (for strategies using dollar-cost averaging), information on any partial closes, and the reason for cancellation (like a timeout or user intervention) are included.  It also keeps track of the original prices and durations, and when the signal was initially scheduled and became pending.  Finally, it indicates whether the signal was part of a backtest or live trading.

## Interface Signal

The `Signal` object holds crucial information about a single trading position. It tracks the initial entry price, which is stored in the `priceOpen` property. 

You’ll also find a history of all entries made for this position, recorded in the `_entry` array. Each entry includes the price at which the trade was initiated, the cost associated with it, and the timestamp of the entry. 

Finally, the `_partial` array keeps track of any partial exits or adjustments made to the position, noting whether it was a profit or loss, the percentage and current price at the time, the cost basis and entry count at the time of the close, and the timestamp of the adjustment. 


## Interface Signal$2

This `Signal` object represents a trading signal and keeps track of important details about a position. 

It includes the opening price (`priceOpen`) when the position was initiated.

To monitor the position's history, it stores an array of entry events (`_entry`), containing information like price, cost, and timestamp for each entry.

Furthermore, it keeps a record of partial exits (`_partial`), noting the type of exit (profit or loss), the percentage gained or lost, the current price, the cost basis at the time of the partial exit, the number of shares at the time of the partial exit, and the timestamp.


## Interface Signal$1

This section details the `Signal` interface, a core component for tracking trade executions.

The `priceOpen` property tells you the initial price at which a position was established.

The `_entry` property is an array holding information about each entry point into a position, including the price, cost, and timestamp of that entry. 

Similarly, `_partial` keeps track of partial exits from a position, noting the reason (profit or loss), percentage, current price, cost basis, entry count, and time of each partial closure.

## Interface ScheduledEvent

The `ScheduledEvent` object holds all the essential information about a trading event—whether it was scheduled, opened, or cancelled—making it easy to generate reports and analyze performance. 

It includes details like the exact timestamp of the event, the action that occurred (opened, scheduled, or cancelled), and the symbol of the trading pair involved.  You'll find identifying information like the signal ID and position type, as well as any notes attached to the signal.

Crucially, it also contains pricing data such as the current market price, the intended entry price, take profit and stop-loss levels, and even the original pricing before any adjustments.  For strategies utilizing averaging or partial exits, the `totalEntries`, `totalPartials`, and `partialExecuted` fields provide further context. 

For cancelled events, you'll find the reason for cancellation and a unique cancellation ID if the cancellation was user-initiated. The timestamp when the position became active or was scheduled, and the duration of the event are also included depending on the event type. Finally, the object provides the unrealized profit and loss (PNL) at the time of the event.

## Interface ScheduleStatisticsModel

This model holds a collection of statistics about scheduled trading signals. It gives you a clear picture of how often signals are scheduled, how many actually get activated, and how many are cancelled.

You'll find a detailed list of every scheduled event, including its specifics. 

Beyond that, you get key counts like the total number of signals scheduled, opened, and cancelled.

The model also highlights the cancellation rate (showing how often signals are cancelled) and the activation rate (showing how often they are turned into active trades). 

Finally, it provides averages for how long cancelled and activated signals waited, giving you a better understanding of signal timing and performance.

## Interface SchedulePingContract

This interface describes a recurring event that occurs while a scheduled trading signal is actively being monitored. Think of it as a heartbeat signal confirming the signal is still valid.

It provides information like the trading pair (symbol), the name of the strategy using the signal, and the exchange where the signal is being tracked.

You'll also get the full details of the signal itself (like entry price, take profit, and stop loss) and the current market price at the time of the ping. 

A flag indicates whether the ping is happening during a backtest (historical data) or live trading.

Finally, a timestamp indicates when the ping event occurred, reflecting either the live ping time or the candle timestamp during a backtest. This allows you to build custom logic, like automatically cancelling a signal if the market price drifts too far from the initial entry price.

## Interface RiskStatisticsModel

This model holds statistical information about risk events, helping you understand how often your risk controls are triggered. 

It contains a list of all the individual risk events, along with the total number of rejections that occurred. You can also see a breakdown of rejections categorized by the symbol they relate to and by the strategy involved. This allows for focused analysis and optimization of your risk management processes.

## Interface RiskRejectionNotification

This notification alerts you when a trading signal has been blocked by the risk management system. It tells you that a signal couldn't be executed. 

The `type` property clearly identifies this as a risk rejection notification.

Each notification has a unique `id` and a `timestamp` indicating when the rejection occurred.  The `backtest` flag tells you if this rejection happened during a simulated backtest or in a live trading environment.

You’ll find details about the trade itself, including the `symbol` (like BTCUSDT), the `strategyName` that generated the signal, and the `exchangeName` involved. The `rejectionNote` provides a human-readable explanation for why the signal was rejected.

Further information like `rejectionId`, `activePositionCount`, `currentPrice`, and `signalId` can help in debugging and analyzing these rejections. You also get details on the intended trade direction (`position`), entry price (`priceOpen`), take profit (`priceTakeProfit`), stop loss (`priceStopLoss`), and expected duration (`minuteEstimatedTime`).  Finally, a `signalNote` allows for optional human-readable notes about the signal. The `createdAt` field specifies when the notification was created.

## Interface RiskEvent

The `RiskEvent` data structure holds information when a trading signal is blocked due to risk management rules. It's designed to give you details about why a signal didn't execute, helping you understand and refine your risk controls.

Each `RiskEvent` includes the exact time the event occurred, the trading symbol involved, and the specifics of the signal that was rejected. You'll also find the name of the strategy and exchange that generated the signal, as well as the timeframe it was based on.

The current market price at the time of rejection and the number of existing open positions are also recorded. A unique ID helps track specific rejections and a note explains the reason for the rejection. Finally, a flag indicates whether the event happened during a backtest or live trading.

## Interface RiskContract

The RiskContract represents a signal that was blocked because it violated risk management rules. It's a way to keep track of when your trading strategies try to make a move but are stopped by the risk system.

This contract includes details like the trading pair (symbol), the specific signal that was rejected, the strategy that generated it, and the timeframe it was intended for. You'll also find the exchange involved, the price at the time of rejection, and how many other positions were already open.

A unique ID and a human-readable explanation are provided to help you understand *why* the signal was rejected, and a timestamp tells you precisely when it happened.  Finally, it indicates whether the rejection occurred during a backtest or in live trading. Services like report generators and your own custom monitoring systems can utilize this information.

## Interface ProgressWalkerContract

The `ProgressWalkerContract` helps you keep tabs on how a background process is going. It's used when a walker—which is essentially a series of tests or strategies—is running, giving you updates on its progress. 

You'll see events sent based on this contract that tell you things like the walker's name, the exchange being used, and the frame involved. 

Most importantly, it tells you how many strategies there are in total, how many have been processed, and the overall percentage of completion. This allows you to monitor the walker’s execution and understand how much longer it will take to finish.

## Interface ProgressBacktestContract

This interface provides updates on the backtest’s progress as it runs. You’ll receive these updates when you start a backtest using `backtest.background()`. 

Each update tells you the name of the exchange and the strategy being used, along with the trading symbol for the test.  You’ll also see the total number of historical data points (frames) the backtest will analyze and how many it has already processed.  Finally, a percentage value indicates how far along the backtest is, ranging from 0% to 100%.


## Interface PerformanceStatisticsModel

This model holds performance statistics, giving you a consolidated view of how a trading strategy performed. 

It includes the strategy's name for easy identification, and the total number of performance events tracked. 

You'll also find the total execution time, which helps understand the processing overhead.

The `metricStats` property organizes statistics by metric type, allowing for targeted analysis.

Finally, the `events` array contains all the individual performance records, providing the raw data for detailed investigation.

## Interface PerformanceContract

The PerformanceContract helps you understand how quickly and efficiently different parts of your trading system are running. Think of it as a way to profile your code, pinpointing where delays or slowdowns might be occurring. Each PerformanceContract event represents a specific action, like order placement or data retrieval, and it records when that action started and finished.

This contract includes details like the timestamp, a record of the previous event's timestamp (if applicable), and the type of operation being measured. You'll also find information about the strategy, exchange, and symbol involved, as well as whether the event occurred during a backtest or a live trading session. It lets you analyze performance for particular strategies and symbols across different exchanges.

## Interface PartialStatisticsModel

This model holds statistical information related to partial profit and loss events during a trading backtest. It essentially helps you track how often and how much your strategy profits or loses at specific milestones. 

The `eventList` property gives you access to all the individual profit and loss events, complete with details about each one. 

You’ll also find a total count of all events, the total number of profitable events, and the total number of losing events, giving you a high-level view of performance. These properties are useful for analyzing patterns and refining your trading strategy.

## Interface PartialProfitContract

The `PartialProfitContract` is a notification about a trading strategy hitting a predefined profit milestone during its execution. Think of it as a signal that a strategy has achieved, for example, a 10% or 20% profit on its initial investment.

These notifications are triggered by the trading framework to keep track of how a strategy is performing and when it's achieving partial profit targets. You’ll see details about the trading pair, the strategy’s name, which exchange and frame it’s operating within, and the original signal data. The notification also includes the current market price and the specific profit level achieved, along with whether the event occurred during a backtest (historical data) or live trading.

Crucially, a single signal can trigger multiple profit level events in rapid succession if the market price moves significantly, and these events are designed to be unique and prevent duplicates. Different parts of the system use these notifications—some to build reports, others to trigger specific actions based on pre-set rules.

## Interface PartialProfitCommitNotification

This notification is triggered whenever a partial profit-taking action happens, whether it's during a backtest or a live trade. It provides a wealth of information about the event.

You'll find a unique identifier for this specific notification, along with the exact time it occurred. The notification also tells you whether it happened during a backtest or in a live trading environment, and details the symbol being traded, the strategy that generated the signal, and the exchange used.

A key piece of information is the `signalId`, which uniquely identifies the original trading signal. The notification details how much of the position was closed (as a percentage), and the current market price at the time of execution.

You'll also get access to important price data like the entry price, take profit price, stop loss price (both original and adjusted for trailing), and the original entry price if DCA averaging was used. Information about the number of DCA entries and partial closes executed is included as well.

For performance tracking, the notification includes detailed Profit & Loss (PNL) information, including absolute and percentage profit/loss, entry and exit prices used in the PNL calculation, total invested capital, and the cost associated with the trade. Lastly, timestamps related to signal scheduling and position activation round out the comprehensive details provided by this notification.

## Interface PartialProfitCommit

This interface represents a partial profit event that occurs during a backtest. It tells you that a portion of a position (either a long or short trade) is being closed to secure some profits. The `action` property confirms this is a partial profit event.

You’ll find details about how much of the position is being closed using `percentToClose`, expressed as a percentage. The event also includes important pricing information like the `currentPrice`, the entry `priceOpen`, the `priceTakeProfit` and `priceStopLoss` (which might be adjusted after trailing), and their original values before any trailing.

Furthermore, the `pnl` property provides the unrealized profit and loss at the time the partial profit was triggered, while `scheduledAt` and `pendingAt` track the timing of the signal and the position’s activation, respectively.

## Interface PartialProfitAvailableNotification

This notification signals that a trading strategy has reached a predefined profit milestone, like 10%, 20%, or 30% gain. It provides detailed information about the trade that triggered this event, including the symbol being traded (e.g., BTCUSDT), the strategy used, and the exchange where the trade occurred. You'll find a unique identifier for the notification itself, as well as timestamps for when the profit level was hit and when the signal was initially created.

The notification also includes key price points: the entry price, the current price at the time of the milestone, and the original take profit and stop loss prices before any adjustments like trailing. If the trade involves averaging entries (DCA), you can see how many entries were made.  You can track the unrealized profit and loss (both absolute and as a percentage), along with the total capital invested and the effective prices used for the PNL calculation. It also specifies whether this notification originated from a backtest or a live trading environment.

## Interface PartialLossContract

The PartialLossContract represents notifications when a trading strategy hits a predefined loss level, like a 10%, 20%, or 30% drawdown. These notifications are triggered by the partial loss subject and help you monitor how your strategies are performing.

Each notification includes details like the trading symbol, the strategy's name, the exchange and frame used, and the raw signal data. You'll also find the current market price when the loss level was reached and the specific level of loss (e.g., 20% means a -20% loss).

The notification also tells you whether it originated from a backtest (historical data) or live trading, along with a timestamp reflecting when the loss was detected. This contract is used by systems generating reports and by users who want to be alerted when a strategy experiences these loss milestones. Importantly, these events are only sent once per level for each strategy.

## Interface PartialLossCommitNotification

This notification is triggered whenever a partial loss of a position is executed, whether it's during a backtest or live trading. It provides a wealth of detail about the trade that just happened, allowing you to understand exactly what occurred. You'll find information like a unique identifier for the notification, the precise time it occurred, and whether it happened in backtest or live mode.

The notification includes specifics about the trading symbol, the strategy that generated the signal, and the exchange where the trade took place. You’ll also see details like the signal's unique ID, the percentage of the position closed, the current market price, and the direction of the trade (long or short).

For each position, the notification tracks the original entry price, take profit, and stop-loss levels, as well as any adjustments made due to trailing. Crucially, it reports the profit and loss (PNL) associated with the trade, including the entry and exit prices and total investment. Finally, timestamps related to signal creation and pending status offer a complete timeline of events leading up to the partial loss.

## Interface PartialLossCommit

This data structure represents a partial loss event within the trading strategy. It's used when a strategy decides to close only a portion of an existing position, instead of the entire thing.

You'll find details here about *why* the partial loss is happening, including the percentage of the position being closed and the current market price at the time.

The structure also contains key pricing information: the entry price, the original and adjusted take profit and stop-loss prices, allowing you to reconstruct the trade's history. 

Crucially, it tracks the unrealized profit and loss (PNL) at the moment of the partial loss, and the direction of the trade (long or short). Finally, timestamps indicate when the signal was created and when the position initially went live.

## Interface PartialLossAvailableNotification

This notification informs you when a trading strategy hits a pre-defined loss milestone, like a 10% or 20% drawdown. It's a way to track how your strategy is performing and potentially adjust your risk management. The notification includes details such as a unique ID, the exact time the loss level was reached, and whether it's occurring in a backtest or live trading environment.

You'll find information about the trading pair involved (e.g., BTCUSDT), the strategy's name, and the exchange it’s running on. The notification also provides key price data, including the entry price, current market price, take profit, and stop-loss levels—both the original values and those adjusted for trailing.

It offers insight into the trade’s history, like the number of DCA entries, partial closes executed, and important financial metrics such as P&L, P&L percentage, and the effective entry and exit prices used for P&L calculation. Finally, timestamps for when the signal was created, pending, and when the notification itself was generated are also provided for comprehensive tracking.

## Interface PartialEvent

This data structure holds all the essential information about profit and loss milestones during a trade. Each event represents a point where a profit or loss level was hit, providing details like the exact time it happened, whether it was a profit or loss event, and the trading pair involved.

You'll find information about the strategy and signal that triggered the trade, including an ID and the type of position taken. It also includes crucial price points like the entry price, take profit, and stop loss, both as originally set and as they might have been adjusted.

For trades using DCA (Dollar Cost Averaging), you’ll see details about the number of entries made and the original entry price before averaging. There's also information about any partial closes executed, the total executed percentage and the current unrealized profit and loss. A human-readable note can provide context about the trade, alongside timestamps marking when the position became active and when the signal was initially created. A flag indicates if the trade is part of a backtest simulation or a live trade.

## Interface MetricStats

This object bundles together a set of statistics related to a particular performance metric. It helps you understand the overall behavior of that metric during a backtest.

You'll find the `metricType` indicating what the statistics represent (like 'trade_execution_time').  It also keeps track of how many data points were collected (`count`).

Key performance indicators like average duration, minimum and maximum values, and standard deviation are all included. Percentiles, such as the 95th and 99th, offer insights into outlier behavior.

Finally, it also provides information on wait times between events, useful for understanding latency and responsiveness within the trading process.

## Interface MessageModel

This describes what a single message looks like in a conversation with a large language model. Each message contains information about who sent it – whether it’s a system instruction, your input, the model’s response, or the result of a tool being used.

The core of a message is its content, which is the text you see. It also includes a `role` which specifies what type of message it is.

Sometimes, models will provide extra detail in a `reasoning_content` field, especially when using specific providers. 

If the model calls a tool, you’ll find information about that in the `tool_calls` section. 

If the message includes images, they are available via the `images` property as either base64 strings, raw byte arrays, or Blob objects.

Finally, for messages directly related to a tool call, the `tool_call_id` will link the message back to the original tool request.


## Interface LiveStatisticsModel

This model gives you a detailed look at how your live trading is performing. It compiles data from every event, including idle periods, trade openings, active trades, and closures.

You'll find the raw event details in the `eventList`, alongside a count of all events, just the closed ones, and a breakdown of wins and losses.

Key performance indicators like win rate, average PNL, and total PNL are provided as percentages, but these may be unavailable if the calculation isn’t stable.  Volatility is measured with standard deviation and the Sharpe Ratio, both of which you’ll want to keep an eye on. The Certainty Ratio and expected yearly returns offer further insight into potential profitability.  Essentially, this model provides a wealth of information to assess and refine your trading strategy.

## Interface InfoErrorNotification

This interface handles notifications about errors that occur during background tasks, but aren't critical enough to stop everything. Think of it as a heads-up about something that needs attention. 

Each notification has a unique identifier, a clear error message for humans to understand, and details about the error itself, including a stack trace. 

The `type` property always identifies this as an "error.info" notification, and crucially, the `backtest` property is always false – meaning these errors are coming from the live trading environment, not a simulated backtest.


## Interface IWalkerStrategyResult

This interface, `IWalkerStrategyResult`, represents the outcome of running a single trading strategy within a comparison test.  It packages together key information about the strategy's performance.

You'll find the strategy's name listed, along with detailed statistics calculated during the backtest—things like total return, Sharpe ratio, and maximum drawdown.  A specific metric value is also included, used to evaluate and compare strategies against each other. Finally, it assigns a rank, with '1' denoting the best-performing strategy overall.

## Interface IWalkerSchema

The IWalkerSchema helps you set up A/B tests to compare different trading strategies against each other. 

It acts like a blueprint for how the backtest-kit should run these comparisons.

You define a unique name for each test setup using `walkerName`, and can add a note for documentation purposes.  

The schema specifies which exchange and timeframe to use for all strategies involved in the test and lists the names of the strategies you want to compare.  

You choose a metric, like Sharpe Ratio, to guide the optimization process.  

Finally, you can include custom code to respond to various stages of the backtest using callbacks.


## Interface IWalkerResults

The `IWalkerResults` interface holds all the information collected when a trading strategy is tested and compared. It provides details about the specific asset being evaluated, like the `symbol` (e.g., "BTCUSDT"). You'll also find the `exchangeName` used for the tests, the `walkerName` which identifies the testing process itself, and the `frameName` denoting the timeframe used for analysis (like "1h" for one-hour candles). Essentially, it's a container for the overall context of a backtesting run.

## Interface IWalkerCallbacks

These callbacks let you tap into the backtest process as it runs. You can use them to track the progress, log important events, or even react to specific outcomes.

For instance, `onStrategyStart` will notify you when a new strategy is beginning its tests. 

When a strategy finishes its run, `onStrategyComplete` will tell you, along with performance stats and a key metric. 

If something goes wrong during a strategy's tests, `onStrategyError` will alert you to the problem. 

Finally, `onComplete` signals that all the strategies you've set up have been tested and provides you with a summary of the overall results.

## Interface ITrailingTakeCommitRow

This interface describes a single instruction for a trailing take commit order. Think of it as a step in a sequence to adjust your trading strategy.

It tells the system to execute a "trailing-take" action. 

The `percentShift` value determines how much the price needs to move before the order is adjusted - it's a percentage.

Finally, `currentPrice` holds the price level at which the trailing mechanism was initially triggered, providing a reference point for calculations.

## Interface ITrailingStopCommitRow

This describes a record representing a pending change to a trailing stop order. Think of it as a message queued up for execution related to a trailing stop strategy. 

It includes the type of action being performed, which is specifically a "trailing-stop" adjustment. The record also contains the percentage shift being applied to the stop price, and the price at which the trailing stop was initially established. This information is necessary to correctly modify the trailing stop order.

## Interface IStrategyTickResultWaiting

The `IStrategyTickResultWaiting` represents a specific situation during automated trading: a signal has been scheduled, but it's currently paused, awaiting a price movement to trigger it. This result is provided repeatedly while the system is actively watching for the right price conditions.

It contains a wealth of information to help track what's happening: the name of the strategy and exchange involved, the trading symbol, the timeframe being used, the price currently being monitored, and the signal that's waiting.

You’ll also find details regarding potential profit and loss (though this is theoretical at this stage) and whether the system is running in backtest or live mode. A timestamp indicates when this waiting status was recorded, which helps with precise timing analysis. Importantly, the progress towards the take profit and stop loss is always zero while in this 'waiting' state.

## Interface IStrategyTickResultScheduled

This interface describes a specific kind of event that happens during a backtest or live trading session. It signifies that a trading signal has been generated and is currently "scheduled" – meaning it's waiting for the price to reach a pre-defined entry point. 

You'll see this result when your strategy's `getSignal` function provides a signal that includes a specified price. 

The event provides a wealth of information to help you understand what happened, including the strategy and exchange involved, the trading symbol, the current price when the signal was created, and whether the event originated from a backtest or a live execution. This record also holds the signal itself, along with a timestamp to precisely track the event’s occurrence.

## Interface IStrategyTickResultOpened

This interface describes what happens when a new trading signal is created within the backtest-kit framework. It’s like a notification that a signal has been successfully generated and is now ready to be acted upon.

You'll find information here about the signal itself, including its generated ID.  It also provides details about where and how this signal originated, such as the strategy name, the exchange used, and the timeframe involved. 

Crucially, it tells you the current price at the time the signal was created, and whether this event occurred during a backtest or a live trading scenario. This allows you to track the signal's lifecycle and understand its context.

Here's a breakdown of the included data:

*   **Action:** Always "opened," confirming the creation of a signal.
*   **Signal:**  The complete details of the newly created signal.
*   **Strategy Name:** The name of the strategy that generated the signal.
*   **Exchange Name:**  The name of the exchange where the signal applies.
*   **Frame Name:** The time frame (like "1m" or "5m") used for the signal.
*   **Symbol:** The trading pair (e.g., "BTCUSDT").
*   **Current Price:** The VWAP price at the moment the signal was opened.
*   **Backtest:** Indicates whether this signal event happened during a backtest.
*   **Created At:** A timestamp marking when the signal event was created.

## Interface IStrategyTickResultIdle

This interface describes what happens when a trading strategy isn't actively signaling anything – it's in an idle state. Think of it as a record indicating a period of inactivity for a specific strategy.

It contains key information about the context of that idle period, including the strategy's name, the exchange it’s connected to, the timeframe being used, and the trading symbol involved.  You'll also find the current price at that moment, whether the system is in backtest or live mode, and a timestamp indicating when the idle state was recorded. Essentially, it provides a snapshot of the market conditions when the strategy wasn't taking action.


## Interface IStrategyTickResultClosed

This interface describes the result you get when a trading signal is closed, providing a wealth of information about what happened. It tells you exactly why the signal was closed – whether it was due to time expiring, hitting a profit or loss target, or a manual closure.

You'll find details like the closing price, the exact timestamp of the closure, and a breakdown of the profit and loss, including any fees and slippage. 

The interface also includes the signal's original parameters, along with metadata for tracking, such as the strategy's name, the exchange used, the timeframe of the chart, and the trading pair. 

Finally, it indicates whether the event occurred during a backtest or in live trading and includes a unique identifier if the closure was initiated manually. This complete picture allows you to thoroughly analyze and understand the performance of your trading strategies.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a trading signal that was previously scheduled gets cancelled before a trade can be executed. It's a way for the system to let you know that a planned signal didn't trigger, perhaps because it hit a stop-loss condition or simply wasn't activated yet. 

The data included in this cancellation event gives you detailed context. You'll find information such as the signal that was cancelled, the price at the time of cancellation, and the exact timestamp when it occurred.  Tracking the strategy and exchange names along with the trading symbol and timeframe helps you identify exactly where the cancellation happened. A flag indicates whether this cancellation happened during a backtest or a live trading session. 

You can also see why the signal was cancelled and, if you manually cancelled the signal using a specific ID, that ID will be included. Finally, you have a timestamp of when this cancellation event itself was generated, linked to the candle time or the execution context.

## Interface IStrategyTickResultActive

This interface describes the result when a trading strategy is actively monitoring a signal, waiting for a take profit (TP), stop loss (SL), or time expiration. It provides information about the ongoing situation, like the signal being tracked, the current price being monitored, and the strategy and exchange involved. 

You’ll find details on the trading symbol, time frame, and the progress towards both the take profit and stop loss targets, expressed as percentages. The interface also includes the unrealized profit and loss (PNL) for the position, factoring in fees and slippage. 

It indicates whether the data comes from a backtest or live trading environment. Crucially, it tracks timestamps to help manage and advance the backtesting process, allowing for consistent and reliable backtest runs.

## Interface IStrategySchema

This schema describes how a trading strategy is defined and registered within the backtest-kit framework. Each strategy gets a unique name for identification.

You can also add a note to document the strategy's purpose or functionality.

The `interval` property controls how frequently the strategy generates trading signals, preventing it from overwhelming the system.

The core of the strategy lies in the `getSignal` function, which takes a symbol and timestamp and returns a trading signal.  This function can either generate a signal immediately or schedule it based on a desired entry price.

Optionally, you can define lifecycle callbacks, like `onOpen` and `onClose`, to execute code at specific points in the strategy's operation.

Risk profiles, identified by a name or a list of names, can be linked to strategies for more sophisticated risk management.

Finally, strategies can be associated with specific actions, allowing for more granular control over their behavior.

## Interface IStrategyResult

The `IStrategyResult` represents a single result from running a trading strategy backtest. Think of it as a row in a comparison table showing how a strategy performed. 

Each result holds the strategy's name, a comprehensive set of statistics detailing its performance, and the value of the metric used to rank it. It also keeps track of when the first and last signals occurred for that strategy, which is helpful for understanding the timeline of events. If a strategy didn't generate any signals, these timestamps will be null.


## Interface IStrategyPnL

This interface, `IStrategyPnL`, represents the result of a profit and loss calculation for a trading strategy. It breaks down how much you've gained or lost, taking into account the impact of fees and slippage – that tiny difference between the expected price and the actual price you get.  You’ll find the profit/loss expressed as a percentage, along with the entry and exit prices adjusted for those fees and slippage.  The interface also provides the absolute dollar amount of the profit or loss, and the total capital invested. This allows for a clear and detailed understanding of a strategy's financial performance.


## Interface IStrategyCallbacks

This interface defines a set of optional callbacks that your trading strategy can use to respond to different signal lifecycle events. Think of them as notifications your strategy receives as a signal progresses – opening, becoming active, going idle, closing, or being scheduled for later.

Each callback function provides specific information about the signal, such as the symbol being traded, relevant data associated with it, and the current price. 

Here's a breakdown of what each callback handles:

*   `onTick`: Gets called with every price update, giving you a constant stream of data.
*   `onOpen`: Notifies you when a new signal is successfully opened.
*   `onActive`: Alerts you when the strategy starts actively monitoring a signal.
*   `onIdle`: Informs you when no signals are actively being monitored.
*   `onClose`:  Lets you know when a signal is closed, along with the closing price.
*   `onSchedule`: Triggers when a scheduled signal is created, indicating a delayed entry.
*   `onCancel`: Occurs when a scheduled signal is canceled before a position is opened.
*   `onWrite`:  Provides a notification when signal data is saved, primarily for testing purposes.
*   `onPartialProfit`:  Informs you when a signal has made some profit but hasn’t yet reached its take-profit target.
*   `onPartialLoss`: Notifies you when a signal is experiencing a loss but hasn’t triggered its stop-loss.
*   `onBreakeven`: Alerts you when a signal reaches a breakeven point, where your potential loss is limited to your initial investment.
*   `onSchedulePing`: A periodic ping for scheduled signals, allowing for custom checks like cancellation logic.
*   `onActivePing`: A periodic ping for active pending signals, enabling dynamic adjustments or monitoring.

By implementing these callbacks, you can tailor your strategy's behavior based on the signal's current state and potentially react in real-time to changing market conditions.

## Interface IStrategy

The `IStrategy` interface defines the core methods a trading strategy needs to execute. It's the blueprint for how a client strategy operates.

The `tick` method is the heart of the strategy - it's called for each price update, checking for signals and managing TP/SL conditions.

Retrieving signals is handled by `getPendingSignal` (for active positions) and `getScheduledSignal` (for signals waiting to activate).

The framework provides ways to check important thresholds: `getBreakeven` determines if the price has moved far enough to cover costs, and `getStopped` checks if the strategy is paused.

You can also track the position’s health using methods like `getTotalPercentClosed` and `getTotalCostClosed`, which reflect how much of the position has been closed.  `getPositionEffectivePrice` and related methods give insight into DCA-averaged entry costs and potential profits.

`backtest` is a quick way to test the strategy against historical data, while the `stopStrategy`, `cancelScheduled`, `activateScheduled`, `closePending`, and `partial` methods allow for controlled actions like pausing, canceling, or manually closing positions.

Finally, several validation methods (`validatePartialProfit`, `validateBreakeven`, etc.) provide a way to check if actions are safe to execute *before* running them, useful for user interfaces and confirmation dialogs. `dispose` ensures resources are released when the strategy is no longer needed.

## Interface IStorageUtils

This interface, `IStorageUtils`, defines the basic functions that any storage adapter used by the backtest-kit framework must provide. Think of it as the contract for how the framework interacts with your data storage.

It outlines methods for reacting to different signal events – when a position is opened, closed, scheduled, or cancelled. It also allows you to retrieve signals by their unique ID or list all signals that are currently stored.

The framework uses these utility methods to keep track of signal activity, specifically managing update timestamps for signals that are actively opened or scheduled through methods like `handleActivePing` and `handleSchedulePing`. Essentially, it ensures your storage remains synchronized with the ongoing trading process.

## Interface IStorageSignalRowScheduled

This interface represents a signal that's been scheduled for future execution. 

It's very straightforward: a signal with this interface has a `status` of "scheduled," indicating it's waiting to be triggered at a later time. Think of it as a signal that's been put on a calendar to be acted upon.


## Interface IStorageSignalRowOpened

This interface describes a signal that has been opened, essentially meaning a trade has been initiated based on that signal.  It's a simple record containing only a `status` property. The `status` is always set to "opened," indicating that this particular signal represents an active, open trade. Think of it as confirmation that a trading action has occurred based on the signal's instructions.


## Interface IStorageSignalRowClosed

This interface represents a trading signal that has been closed and finalized. It holds information specifically related to signals that have reached a conclusion and generated a profit or loss.

Think of it as a record of a completed trade.

It includes two key pieces of data: the `status` is always "closed," confirming the signal is finished, and `pnl`, which details the profit and loss realized from that closed signal. This is where you'd find the actual financial outcome of the trade.


## Interface IStorageSignalRowCancelled

This interface represents a signal row that has been cancelled. 

It's really straightforward: it just confirms that the signal's status is "cancelled."  You'll use this when you need to track signals that were initially created but later had their execution or processing stopped. Essentially, it's a marker to indicate the signal is no longer active.

## Interface IStorageSignalRowBase

This interface defines the fundamental structure for storing signal data, ensuring consistency across different signal statuses. It includes essential information like the `createdAt` timestamp, reflecting when the signal was initially generated.  There's also an `updatedAt` timestamp to track any subsequent modifications.  Finally, the `priority` field helps manage the order in which signals are processed, particularly useful when dealing with multiple signals; it’s automatically set to the current time for both live and backtesting environments.


## Interface ISizingSchemaKelly

This schema defines a sizing method based on the Kelly Criterion, a formula for optimal bet sizing. 

It allows you to specify how aggressively you want to apply the Kelly Criterion by setting the `kellyMultiplier`. 

A lower multiplier, like the default of 0.25, represents a "quarter Kelly" approach, which is a more conservative strategy that limits potential losses. You can increase this multiplier to bet more of your capital on each trade, but be aware that it also increases the risk of significant drawdown.

## Interface ISizingSchemaFixedPercentage

This schema defines a simple trading sizing strategy where each trade size is based on a fixed percentage of your available capital.  It's straightforward to implement and allows you to control risk by setting a specific risk percentage for each trade. The `method` property identifies this as a "fixed-percentage" sizing approach, and the `riskPercentage` property dictates what percentage of your capital will be risked on each individual trade – for example, a `riskPercentage` of 2 would risk 2% of your total capital per trade.

## Interface ISizingSchemaBase

This interface defines the basic structure for sizing configurations within the backtest-kit framework. Each sizing configuration needs a unique identifier, or sizingName, to distinguish it from others. 

You can also add a note to provide additional context or documentation for developers. 

To manage risk, sizing schemas also specify limits: a maximum percentage of your account that can be used for a position (maxPositionPercentage), and minimum and maximum absolute position sizes (minPositionSize, maxPositionSize). 

Finally, there's a place to plug in optional callbacks, allowing you to trigger specific actions during different stages of the sizing process.

## Interface ISizingSchemaATR

This schema defines how to size trades based on the Average True Range (ATR). 

It's used to determine the amount of capital to risk on each trade, calculated relative to your overall portfolio.

The `method` property simply confirms that this is an ATR-based sizing approach. 

You'll specify a `riskPercentage` to indicate what portion of your capital (as a percentage) you’re comfortable risking on a single trade. 

Finally, the `atrMultiplier` controls how the ATR value is used to set the stop-loss distance, directly influencing the size of your position.

## Interface ISizingParamsKelly

This interface defines the parameters needed for sizing trades using the Kelly Criterion within the backtest-kit framework. It primarily focuses on providing a way to log debugging information. 

The `logger` property is crucial; it's an instance of an `ILogger` that lets you output diagnostic messages during the sizing process, which can be invaluable for understanding and refining your trading strategy. Essentially, you'll use this to keep track of how the Kelly Criterion is calculating bet sizes.


## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed to control how much of your capital is used for each trade when using a fixed percentage sizing strategy. It's designed to be used when setting up your trading system.

The `logger` property is crucial for debugging and monitoring your backtest. It allows you to see what's happening behind the scenes and helps identify any issues.


## Interface ISizingParamsATR

This interface defines how to configure your trading strategy's position sizing when using an ATR (Average True Range) based approach. It's mainly concerned with logging information for debugging and monitoring your strategy's behavior. Specifically, you'll provide a logger object that allows the backtest kit to record useful messages and warnings as your strategy runs, which is incredibly helpful when troubleshooting.


## Interface ISizingCallbacks

The `ISizingCallbacks` interface provides a way to hook into the sizing process within the backtest-kit framework.  Specifically, the `onCalculate` callback function lets you observe and potentially react to the calculation of how much of an asset to buy or sell. You can use this to record the size being determined, or to ensure it aligns with your expectations. It receives the calculated quantity and some parameters related to the sizing process as input.

## Interface ISizingCalculateParamsKelly

This defines the information needed to calculate your bet sizing using the Kelly Criterion. 

Essentially, to use this, you'll need to provide your win rate, which is a number representing the probability of winning (expressed as a decimal between 0 and 1).  You’ll also need the average ratio of your wins to your losses – this helps determine how much you gain on each winning trade compared to how much you lose on each losing one. These inputs work together to help determine an optimal bet size.


## Interface ISizingCalculateParamsFixedPercentage

This interface defines the parameters needed to calculate trade sizing using a fixed percentage approach. It's straightforward: you’ll specify the sizing method as "fixed-percentage" and provide a `priceStopLoss` value. Think of `priceStopLoss` as the price level where you'll trigger a stop-loss order to manage risk. This tells the sizing calculation how to adjust the trade size based on that stop-loss level.

## Interface ISizingCalculateParamsBase

This interface defines the core information needed to calculate position sizes for any trading strategy. It includes the trading symbol, like "BTCUSDT," representing the asset being traded.  You'll also find the current account balance, which is crucial for determining how much capital is available for trading.  Finally, it provides the expected entry price for a trade, which influences the sizing calculation. Essentially, it's a foundational set of data shared across various sizing strategies within the backtest-kit framework.


## Interface ISizingCalculateParamsATR

This interface defines the settings you'll use when determining position sizes based on the Average True Range (ATR) indicator.  Essentially, it tells the backtest kit to use an ATR-based sizing approach.  The `atr` property holds the actual ATR value that will be factored into the sizing calculation. This number represents the volatility you’re considering when deciding how much capital to allocate to a trade.

## Interface ISizing

The `ISizing` interface defines how a strategy determines the size of each trade. It's responsible for figuring out how much to buy or sell, based on factors like your risk tolerance and the current market conditions.

The core of this interface is the `calculate` function. This function takes a set of parameters detailing the situation and returns a promise that resolves to the calculated position size – essentially the quantity of assets to trade. Think of it as the engine that translates your risk management rules into actual trade sizes.

## Interface ISignalRow

This interface, `ISignalRow`, represents a complete trading signal within the backtest-kit framework. It's the standardized data structure used after a signal has been validated and is ready for execution. Each signal gets a unique identifier (`id`) and carries detailed information, including the cost of the trade (`cost`), the entry price (`priceOpen`), and the expected duration (`minuteEstimatedTime`).

The signal also includes metadata like the exchange, strategy, and frame identifiers (`exchangeName`, `strategyName`, `frameName`), as well as timestamps marking when it was scheduled and pending (`scheduledAt`, `pendingAt`).  You'll find the trading symbol (`symbol`), and an internal flag indicating if the signal was scheduled (`_isScheduled`).

For more complex strategies, the `_partial` array tracks partial profit or loss closes, allowing for granular P&L calculations.  Trailing stop-loss and take-profit prices (`_trailingPriceStopLoss`, `_trailingPriceTakeProfit`) provide dynamic adjustments.  If you're using Dollar Cost Averaging, the `_entry` array holds a record of entry prices. The `_peak` property maintains track of the highest profit point achieved during the trade. Finally, `timestamp` captures the moment of creation for auditing purposes.


## Interface ISignalDto

This interface, `ISignalDto`, represents the data structure used to convey trading signals. When you request a signal, this is the format you'll receive it in.

It contains all the necessary information to execute a trade: the direction of the trade (long or short), a description of why the signal was generated, the entry price, target take profit price, and stop-loss price.

The signal also includes an expected duration, specifying how long the position should remain open before automatically closing, though this can be set indefinitely.

Finally, it includes the cost of entering the position, which has a default value if not explicitly provided. An automatically generated ID is assigned to each signal.

## Interface IScheduledSignalRow

The `IScheduledSignalRow` represents a signal that's waiting for a specific price level to be reached before a trade can be executed. Think of it as a signal on hold. 

It inherits properties from a standard signal, but with an added delay—the trade won't happen until the price hits a predetermined `priceOpen`. 

Once the price reaches that `priceOpen` level, it’s transformed into a regular, active signal. 

Initially, the `pendingAt` time will reflect when the signal was scheduled, but will be updated to the actual time the signal went pending. The key here is the `priceOpen`—it’s the price the market needs to hit before the signal is triggered.


## Interface IScheduledSignalCancelRow

This interface represents a scheduled trading signal, but with an added feature: the ability to cancel it. Specifically, it builds upon the existing scheduled signal data and includes a unique identifier, `cancelId`, to mark signals that were canceled by the user. Think of it as a way to track and manage when you decide to override a pre-planned signal. If a signal isn't canceled by the user, this `cancelId` property won't be present.


## Interface IRiskValidationPayload

This object holds the information needed to evaluate risk. It builds upon the basic risk check arguments and adds details about your portfolio's current state.

Specifically, it includes the `currentSignal` you're considering, representing the signal that's driving a potential trade. You'll also find the `activePositionCount`, which tells you how many positions are already open. 

Finally, the `activePositions` array provides a complete list of all those active positions, giving you a comprehensive view of your current holdings to factor into your risk assessment.

## Interface IRiskValidationFn

This defines a function used to check if a trading action is safe and permissible. Think of it as a gatekeeper for your trades. If the function approves the trade, it does nothing. However, if it finds a problem – maybe the risk is too high, or a rule is being broken – it either signals the rejection by returning a special result object or throws an error that’s then translated into that same rejection object. This allows for consistent error handling across different validation checks.

## Interface IRiskValidation

This interface helps you define how to check if your trading risks are acceptable. Think of it as setting up rules to ensure your trading strategy stays within safe boundaries.  You specify a function, `validate`, which will perform the actual risk assessment – it takes the risk parameters as input. You can also add a descriptive `note` to explain what the validation is intended to do, making it easier for others (or yourself later on!) to understand the purpose of the check. Essentially, this lets you create reusable, documented risk validation checks.

## Interface IRiskSignalRow

This interface, IRiskSignalRow, helps manage risk during trading. It builds upon the basic Signal Dto by adding key price information. 

Specifically, it includes the entry price of a trade (`priceOpen`), the initially set stop-loss price (`originalPriceStopLoss`), and the initially set take-profit price (`originalPriceTakeProfit`). 

This data is crucial for validating risks associated with a trade, allowing the system to refer back to the original parameters used when the trade was signaled.


## Interface IRiskSchema

This defines a blueprint for setting up risk controls at the portfolio level. Think of it as a way to create custom checks to ensure your trading strategies stay within defined boundaries.

Each risk profile, identified by a unique `riskName`, can have a descriptive `note` for developers. 

You can also specify optional `callbacks` to respond to certain events, like when a trade is rejected or allowed.

The core of the risk profile lies in the `validations` array.  This is where you define the actual rules and logic that will be applied to your portfolio, ensuring it behaves as intended. You can add multiple validations.


## Interface IRiskRejectionResult

This interface represents the result when a risk check fails. It provides information to help you understand why the check didn't pass. Each rejection has a unique ID, which is useful for tracking and referencing specific issues.  A descriptive note explains the reason for the rejection in plain language, making it easier to diagnose and fix the problem.

## Interface IRiskParams

The `IRiskParams` object defines the configuration for managing risk within the trading system. It essentially bundles together the settings needed to control how risk is assessed and handled.

You'll specify the name of the exchange you're working with, like "binance," to tailor risk checks appropriately.

A logger is included for tracking and debugging risk-related events.

You indicate whether the system is running in a backtesting environment, which affects how risk calculations are performed.

Finally, you can provide a callback function – `onRejected` – that gets called when a trading signal is blocked because it exceeds defined risk limits. This allows for custom handling of rejected signals before they're officially recorded.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, holds all the information needed to perform a risk check before a trading signal is executed. Think of it as a set of validation checks—before a trade happens, this interface provides the details about the trade being considered. It includes essential information like the trading symbol ("BTCUSDT"), the pending signal itself, the name of the strategy initiating the trade, and the exchange being used. You'll also find the risk name associated with the trade, the timeframe being considered, the current price, and a timestamp for reference. Essentially, it bundles all the context needed to determine if opening a position is safe and aligns with established risk management rules.

## Interface IRiskCallbacks

The `IRiskCallbacks` interface lets you define functions that are triggered during the risk assessment process of your trading strategy. 

You can specify an `onRejected` function, which gets called whenever a trading signal is blocked because it would violate your defined risk limits.  Conversely, the `onAllowed` function is executed when a signal successfully passes all risk checks and is approved for potential execution. Both functions receive details about the symbol being assessed and the arguments used in the risk check. These callbacks give you the flexibility to monitor and react to risk events within your backtesting environment.

## Interface IRiskActivePosition

This interface describes a trading position that's being actively managed and tracked by the risk management system. It holds all the key details about a position, like which strategy created it, which exchange it's on, and what trading pair is involved (e.g., BTCUSDT). 

You'll find information about whether the position is a long or short, and critical pricing details including the entry price, stop-loss, and take-profit levels. 

It also keeps track of how long the position is expected to last, and the exact time the position was initially opened. Essentially, it's a snapshot of a live trading position’s current status.

## Interface IRisk

The `IRisk` interface helps manage and control the risks associated with your trading strategies. It's a core component for ensuring your trades align with predefined risk parameters.

Essentially, before a signal is executed, the `checkSignal` function verifies that it falls within acceptable risk boundaries.

When a new trade is initiated, `addSignal` registers the details of the position, keeping track of things like entry price, stop-loss, and take-profit levels. 

Conversely, `removeSignal` is used to clean up the record when a position is closed, signifying the trade is complete and its associated risks are no longer active.


## Interface IReportTarget

This interface lets you fine-tune what kind of information gets recorded during your trading backtests. Think of it as a set of switches to control the details you want to see.

You can choose to log events related to strategy execution, risk management, breakeven points, partial order closures, heatmap data, walker iterations, performance, scheduling, live trading data, backtest signal closures, signal synchronization, or even milestones related to highest profit. 

Each property (like `strategy`, `risk`, `live`) represents a specific category of event logging, and setting it to `true` enables that particular type of data collection. By customizing these settings, you can focus on the areas most important to your analysis and keep the log files manageable.

## Interface IReportDumpOptions

This interface helps you configure how backtest results are saved and organized. It lets you specify important details like the trading symbol (e.g., BTCUSDT), the name of the strategy used, the exchange involved, the timeframe of the data (like 1 minute or 1 hour), a unique identifier for the signal generated, and the name of the walker used for optimization. By providing these values, you ensure that your reports are properly labeled and easily searchable, allowing for better analysis of your trading performance. Essentially, it’s a set of tags to keep your backtest data well-organized.


## Interface IPublicSignalRow

The `IPublicSignalRow` interface provides a way to see the original stop-loss and take-profit prices when you're working with trading signals. It builds on the standard signal information to also show you the initial values you set for those parameters, even if they've been adjusted by trailing stops or other modifications. This is really useful for transparency – you can see exactly what your original plan was alongside the current, adjusted levels.

It also gives you access to several other key details about the signal, including the cost of entering the position, how much of the position has been closed through partial trades, and the number of entries and partials made.

You’ll find information like the original entry price, which isn't affected by averaging, and the unrealized profit and loss (PNL) calculated at the time the signal was generated. Basically, it's a complete snapshot of the signal's status and history, designed to be shared publicly.

## Interface IPublicCandleData

This interface defines the structure for a single candlestick, representing a snapshot of price action over a specific time interval. Each candlestick contains essential data points, including the exact time the candle began (timestamp), the price when the candle opened (open), the highest price reached during that time (high), the lowest price observed (low), the price at which the candle closed (close), and the total trading volume for that period. Think of it as a complete record of what happened in the market during a particular moment.

## Interface IPositionSizeKellyParams

This interface defines the parameters needed to calculate position sizes using the Kelly Criterion. It focuses on the core values required for the calculation, excluding the specific method used. You'll need to provide the win rate, which represents the percentage of winning trades, and the win/loss ratio, which describes the average profit compared to the average loss for each trade. These values are crucial for determining an optimal bet size based on historical trading performance.

## Interface IPositionSizeFixedPercentageParams

This defines the settings needed to calculate your position size when using a fixed percentage sizing strategy. 

It primarily focuses on setting a stop-loss price. 

The `priceStopLoss` property simply specifies the price at which your stop-loss order will be triggered.

## Interface IPositionSizeATRParams

This interface defines the parameters needed when calculating position size using the Average True Range (ATR) method. It primarily focuses on the current ATR value, which acts as an indicator of market volatility.  Essentially, this tells the system how much the market has been fluctuating recently. You'll use this value to determine how much capital to allocate to a trade based on ATR.

## Interface IPositionOverlapLadder

This configuration defines a zone of tolerance used to detect overlapping positions during dollar-cost averaging (DCA) strategies. Think of it as setting boundaries around each DCA level – these boundaries determine whether a new position is considered to overlap with a previous one. 

The `upperPercent` property sets the upper limit of this zone as a percentage; anything above this value, relative to a DCA level, will be flagged as an overlap.  Similarly, `lowerPercent` defines the lower limit, so positions below this value relative to a DCA level are also considered overlaps. Both percentages are expressed as values from 0 to 100.


## Interface IPersistBase

This interface outlines the fundamental operations needed for any system that wants to store and retrieve data, like a database or a file system. 

It focuses on the basic actions of getting, checking for, and saving data entities.

The `waitForInit` method handles the initial setup, making sure everything is ready when needed. `readValue` retrieves a specific data item, while `hasValue` quickly checks if an item exists. `writeValue` saves a data item, ensuring the write is reliable. Finally, `keys` provides a way to list all the data items, which is useful for verifying data integrity and iterating through everything. Any custom storage solution can implement this interface to seamlessly integrate with the backtest-kit framework.

## Interface IPartialProfitCommitRow

This object represents a specific instruction to take partial profits on a trade. 

Think of it as a single step in a plan to gradually close out a position.

It tells the system to close a certain percentage of the current position.

The `action` property confirms this is a partial profit instruction.  `percentToClose` specifies what proportion of the position to close, and `currentPrice` records the price at which this partial profit was actually taken.

## Interface IPartialLossCommitRow

This interface describes a request to partially close a trading position. 

Think of it as a message in a queue that says, "Hey, we need to close a portion of this trade."

It contains three key pieces of information: the action being performed ("partial-loss"), the percentage of the position to close, and the price at which that partial closure happened. 

Essentially, it's a record of a small step taken to adjust a position.

## Interface IPartialData

IPartialData represents a snapshot of trading data that can be easily saved and loaded, even if it’s not the complete picture. It’s designed to work with a system that stores data incrementally, allowing you to pick up where you left off.

Think of it as a simplified version of your full trading state.

Specifically, it holds information about the profit and loss levels that have been hit during a trade. These levels are stored as arrays instead of sets, making them compatible with common data formats like JSON for saving and retrieving. This data is crucial for resuming a trading session or analyzing past performance.


## Interface IPartial

This interface, `IPartial`, helps manage and track profit and loss milestones for trading signals. It's used by components like `ClientPartial` and `PartialConnectionService`.

The `profit` method is used when a trading signal generates a profit. It determines if specific profit levels (like 10%, 20%, 30%) have been reached and triggers relevant events to notify about those achievements.

Similarly, the `loss` method handles situations where a trading signal incurs a loss. It identifies and reports when loss levels are hit (10%, 20%, 30%, etc.).

Finally, the `clear` method is invoked when a trading signal finishes – whether it hits a take profit, stop loss, or expires. It cleans up the tracking data, ensures changes are saved, and frees up resources.

## Interface IParseArgsResult

The `IParseArgsResult` interface represents the outcome when you process command-line arguments for your trading application. It essentially combines the original input arguments with flags that dictate the trading environment. Specifically, it tells you whether the application should run in backtest mode, using historical data to simulate past performance; paper trading mode, which simulates real-time trading but with virtual funds; or live trading mode, involving actual trades with real money. This information allows your application to adjust its behavior based on the chosen environment.

## Interface IParseArgsParams

This interface describes the information needed to run a trading strategy from the command line. Think of it as a blueprint for how to set up your backtesting session.

It specifies the essential details like which cryptocurrency pair you're trading (symbol, like BTCUSDT), which strategy you want to run, which exchange you're connected to (like Binance), and the timeframe for the data being used (like 15-minute candles). Providing these values allows the system to automatically configure the backtest.


## Interface IOrderBookData

This interface defines the structure of order book data, which represents the current state of buy and sell orders for a particular trading pair.  Each order book contains a `symbol` identifying the trading pair, like "BTCUSDT".  You'll also find lists of `bids`, representing orders to buy the asset, and `asks`, representing orders to sell. Each bid and ask is structured with its price and quantity, allowing you to understand the market depth and potential price movements.

## Interface INotificationUtils

This interface, `INotificationUtils`, defines the core set of actions that any system for sending notifications – like emails, alerts, or logging – must be able to do within the backtest-kit framework. Think of it as a contract ensuring all notification methods behave consistently.

The framework will call specific functions within this interface to inform the notification system about important events happening during a backtest. These events include signals being opened or closed, partial profit or loss opportunities arising, strategy commitments like setting trailing stops, synchronization of signals, risk rejections, and various error conditions.

You can retrieve all stored notifications through the `getData` method, and when the backtest is complete or no longer needed, `dispose` allows you to clear out any lingering notifications. This framework lets you plug in different notification methods without altering the core backtesting logic.

## Interface IMethodContext

The `IMethodContext` interface acts as a central hub for information during backtesting, carrying critical details about the trading environment. It holds the names of the strategy, exchange, and frame being used – essentially, it tells the backtest kit *which* components to use for a particular trading simulation. Think of it as a little package of context automatically passed around to ensure everything works together correctly. This context is particularly useful for routing operations to the right strategy, exchange, or frame instances. The `frameName` is empty when operating in live mode, distinguishing it from the historical data replay of backtesting.

## Interface IMemoryInstance

The `IMemoryInstance` interface outlines how different memory storage systems – whether they're local, persistent, or just for testing – should function within the backtest-kit framework.

It provides a set of methods to interact with memory data. You can use `waitForInit` to make sure the memory is ready to use. 

`writeMemory` lets you store data, and it's useful to provide a description for what you're saving.  `readMemory` retrieves a specific piece of data. 

If you need to find something, `searchMemory` uses a powerful search algorithm (BM25) to rank results. `listMemory` shows you all the data currently stored. 

To clean up, `removeMemory` deletes a single entry, and `dispose` releases any resources that the memory instance is using.

## Interface IMarkdownTarget

This interface lets you fine-tune which reports are generated by the backtest-kit framework. It's like choosing which data points you want to see for a more detailed look at your trading strategy.

You can control the reporting for things like strategy signals (entry and exit), risk rejections, when stop losses adjust, partial profit-taking, portfolio performance heatmaps, and comparisons between different strategies. 

It also allows you to track signals waiting to be triggered, live trading events, and detailed backtest results including the full history of trades. Lastly, you can even get reports about the lifecycle of signals and track milestones related to the highest profit achieved.


## Interface IMarkdownDumpOptions

This interface lets you specify exactly where and what data to include when generating markdown reports. Think of it as a detailed guide for the report generation process. You can use the `path` property to define the directory where the markdown files should be saved, relative to your project's root. The `file` property determines the name of the generated file.

To further refine the content, you can pinpoint specific trading pairs with the `symbol` field, focus on a particular strategy using `strategyName`, or target a specific exchange with `exchangeName`. Finally, `frameName` identifies the timeframe (like 1m, 5m, 1h) and `signalId` provides a unique identifier for a signal to include in the report.

## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework communicate about what's happening. It provides ways to record messages about important events, from when things start up to when they finish, and everything in between. You can use it to track actions like agents running, sessions connecting, data being stored, or policies being checked.

Different levels of logging are available to control how much detail is captured. The `log` method is for general important events. `debug` is for very detailed information used mostly during development to understand exactly what's happening step by step.  `info` provides updates on successful operations. And `warn` flags potential issues that don't stop the system but should be investigated. This logging helps with troubleshooting, monitoring the system's performance, and keeping a record of what occurred.

## Interface ILogEntry

This interface, `ILogEntry`, represents a single entry in your trading backtest's log history. Each log entry has a unique identifier and a level, like "log," "debug," "info," or "warn," to categorize the message's importance. 

It also includes a timestamp, both as a Unix millisecond value and a more readable date string, making it easier to track when the event occurred. 

For more context, log entries can optionally include details about the method or execution environment where the log originated, using `methodContext` and `executionContext`.  You can also pass additional arguments along with the log message using the `args` array. Essentially, it packages all the necessary information for a complete and traceable log record.

## Interface ILog

The `ILog` interface helps you keep track of what’s happening during your trading tests. It's like having a record of all the important events and messages generated by your backtest.

The `getList` method is your key to reviewing this record—it retrieves all the log entries that have been saved, allowing you to examine them sequentially. This can be invaluable for debugging, analyzing performance, or simply understanding the flow of your strategy.

## Interface IHeatmapRow

This interface represents a row of data for a portfolio heatmap, showing performance statistics for a specific trading pair like BTCUSDT. It bundles together key metrics calculated across all strategies used for that particular symbol.

You'll find information about the overall profit or loss, how risk-adjusted the returns are (the Sharpe Ratio), and the largest potential loss experienced (maximum drawdown).

It also details trading activity – the total number of trades, the breakdown of wins and losses, and the resulting win rate. Furthermore, you can see the average profit and loss per trade, and the variability of those results.

Finally, it provides insights into winning and losing streaks, and a measure of expected return based on trade outcomes (expectancy). This row provides a comprehensive overview of a symbol's trading performance.


## Interface IFrameSchema

The IFrameSchema defines a specific time period and frequency for generating data points during a backtest. Think of it as setting the stage for your trading simulation - when it begins, when it ends, and how often data is recorded. 

Each schema has a unique name to identify it, and you can add a note for your own reference. 

The `interval` property determines how frequently timestamps are created (e.g., every minute, every hour, daily). `startDate` and `endDate` pinpoint the start and end dates of the backtest period, respectively, encompassing all data points generated within that timeframe. You can also provide optional lifecycle callbacks to customize the behavior of the frame.

## Interface IFrameParams

The `IFramesParams` interface defines the information needed when setting up a frame within the backtest-kit trading framework. Think of it as the configuration object you pass to create a frame. It builds upon the `IFramesSchema` interface and crucially includes a `logger` – this is how the framework communicates debugging information and lets you see what's happening inside the frame. This logger is essential for understanding and troubleshooting your trading logic.

## Interface IFrameCallbacks

This allows you to react to when a timeframe (the sequence of dates your strategy will trade on) is created. 

It's a way to check if the dates used for backtesting are what you expect, or to log them for debugging.

The `onTimeframe` function receives the generated dates, the start and end dates of the timeframe, and the interval (like daily, weekly) that was used to create them. You can use it to confirm everything looks correct before your strategy starts trading.


## Interface IFrame

The `IFrames` interface is a core component of the backtest-kit, responsible for creating the timeline your trading strategies will operate on. Think of it as the engine that determines when your strategy will execute based on the timeframe you've selected. 

The `getTimeframe` function is the key method you'll interact with; it takes a trading symbol (like "BTCUSDT") and a frame name (like "1h" for hourly) and returns a promise that resolves to an array of dates. These dates represent the points in time your backtest will consider, essentially outlining the historical data your strategy will be tested against. It’s used to generate timestamps at intervals defined within the backtest configuration.


## Interface IExecutionContext

The `IExecutionContext` interface holds crucial information needed during strategy execution and interactions with exchanges. Think of it as a package of runtime details that's passed around to provide context.

It includes the trading symbol, like "BTCUSDT," so your code knows what asset is being traded. 

The `when` property represents the current timestamp—essentially, the point in time for the operation being performed. 

Finally, the `backtest` flag tells your strategy whether it's running a simulation (backtest) or a live trade.


## Interface IExchangeSchema

This schema defines how backtest-kit connects to and retrieves data from different cryptocurrency exchanges. It's essentially a blueprint for telling the framework where to find and how to interpret data like candles, order books, and trades. 

Each exchange needs a unique identifier, and you can add a note for your own reference.

The core function, `getCandles`, is responsible for fetching historical price data – you provide the trading pair, timeframe, starting date, and number of candles needed. 

The `formatQuantity` and `formatPrice` properties let you customize how trade sizes and prices are displayed, ensuring they match the exchange's specific rules, although default precision is used if these are omitted.

The framework can also optionally pull in order book data and aggregated trades, using the `getOrderBook` and `getAggregatedTrades` functions, respectively. If these aren't provided, attempting to use them will result in an error.

Finally, you can include callbacks, like `onCandleData`, to trigger specific actions when candle data is received.

## Interface IExchangeParams

This interface, `IExchangeParams`, defines the essential configuration needed when setting up an exchange connection within the backtest-kit framework. Think of it as a blueprint for how your backtest kit interacts with a particular cryptocurrency exchange.

You'll need to provide a logger to help with debugging and monitoring your backtesting process.

It also requires an execution context to manage crucial data like the trading symbol, timestamp, and whether the test is a backtest.

The most important part is that you *must* implement several functions:

*   `getCandles`: Retrieves historical price data (candles) for a specific trading pair.
*   `formatQuantity`: Converts quantity values into the format expected by the exchange.
*   `formatPrice`: Formats price values according to the exchange's rules.
*   `getOrderBook`: Gets the current order book depth for a trading pair.
*   `getAggregatedTrades`:  Fetches aggregated trade data for a particular pair.

These functions handle fetching data and ensuring it's in the proper format for the exchange you're connecting to. The framework provides default implementations that can be used if the exchange’s API matches.

## Interface IExchangeCallbacks

The `IExchangeCallbacks` interface provides a way for your backtest or trading system to react to incoming data from an exchange. Think of it as a set of optional listeners that you can set up to be notified about specific events.

The most important of these is `onCandleData`, which allows you to receive updates whenever new candlestick data arrives for a particular trading symbol and timeframe. This is how your system knows about the price history it needs to analyze or trade on.  You can use this callback to process the data immediately, store it, or trigger other actions within your strategy. The data will include the symbol, the timeframe (like 1 minute, 1 hour, or 1 day), the starting time of the data, the number of candles received, and an array containing the actual candle data.


## Interface IExchange

The `IExchange` interface defines how the backtest-kit interacts with a specific cryptocurrency exchange. It provides essential tools for retrieving market data and preparing orders.

You can use it to fetch historical candle data, allowing you to analyze past price movements.  It also enables retrieving future candles, which is useful for backtesting strategies that anticipate upcoming events.

The framework helps you handle the nuances of each exchange by formatting trade quantities and prices to match the exchange’s specific requirements.  It can also calculate the VWAP (Volume Weighted Average Price) based on recent trading activity.

You can also pull order book information and aggregated trade data to gain a comprehensive view of market activity. 

Finally, a highly flexible method lets you retrieve raw candle data with precise control over the date range and number of candles, ensuring accurate and unbiased backtesting. This method intelligently handles date and limit parameters to avoid looking into the future.

## Interface IEntity

This interface, `IEntity`, serves as the foundation for anything that gets saved or loaded from a database or persistent storage within the backtest-kit framework. Think of it as a common starting point – any object designed to be persistently stored needs to implement this interface. Essentially, it ensures that all your data objects have a consistent structure, making them easier to manage and work with. It's a blueprint for consistent data persistence.

## Interface IDumpInstance

The `IDumpInstance` interface defines how to save data during a backtesting process. Think of it as a standardized way to record different types of information for later analysis or debugging.

You can use it to save complete conversations (message histories), simple key-value pairs, tabular data, raw text, error messages, and even complex JSON objects. 

Each save operation is tied to a specific identifier (`dumpId`) and a description, making it easier to understand what was captured. 

Finally, the `dispose` method is there to clean up any resources the dump instance might be using when you're finished with it. Essentially, it provides a consistent way to log various data points related to your trading simulations.

## Interface IDumpContext

The IDumpContext helps keep track of where a piece of data came from during a backtest. Think of it as a way to label and organize your data. 

Each context has a signal ID, which identifies the specific trade it relates to, and a bucket name, which groups related data together, often by the strategy or agent that generated it. A unique ID distinguishes each individual dump entry, and a descriptive label makes it easy to understand what the data represents – this description is even used for searching and display. Essentially, it provides the necessary information to understand and locate a particular piece of data within the backtest process.

## Interface ICommitRowBase

The `ICommitRowBase` interface serves as the foundation for events that represent queued commitments, allowing for delayed execution until the environment is ready. It includes essential information about each event, specifically the `symbol` which identifies the trading pair involved, and a `backtest` flag indicating whether the operation occurred within a backtesting scenario. Think of it as a basic building block for tracking transactions and ensuring they are processed correctly within the trading framework.

## Interface ICheckCandlesParams

This interface defines the information needed to check if your saved candle data is consistent. You’ll specify the trading symbol (like BTCUSDT), the exchange you're using, the time interval of the candles (like 1 minute or 4 hours), and the start and end dates you want to examine. 

It also lets you tell the system where to find the candle data files, which defaults to a folder named "dump/data/candle" but can be customized with the `baseDir` property. Think of this as a way to make sure your historical data is accurate and complete before you start testing a trading strategy.

## Interface ICandleData

This interface defines the structure of a single candlestick, representing a specific time interval in trading data. Each candle contains key information like the timestamp of when the candle began, the opening price, the highest and lowest prices reached during that time, the closing price, and the total trading volume. Think of it as a snapshot of price action and activity for a defined period – it's essential for analyzing price movements and for backtesting trading strategies. The timestamp helps pinpoint exactly when the data applies.

## Interface ICacheCandlesParams

This interface defines the information needed to pre-load historical candle data for backtesting. Think of it as a set of instructions for downloading past price charts.

You'll specify the trading pair (like BTCUSDT), the exchange providing the data, the timeframe of the candles (like 1-minute or 4-hour), and the specific start and end dates you want to retrieve. This helps speed up the backtesting process by ensuring all the necessary historical data is readily available.

## Interface IBroker

The `IBroker` interface defines how the backtest-kit framework connects to a live trading platform like an exchange or broker. Think of it as the bridge between the simulated trading environment and the real market.

It outlines a set of methods that your custom adapter needs to implement, these methods are called just before the trading framework updates its internal state. This ensures a safety net: if something goes wrong during order execution, the framework's state remains consistent.

Crucially, when running in backtest mode, these calls are skipped entirely, preventing any interaction with a live trading system.

The methods cover various trading actions:

*   `waitForInit`: This method is called initially to establish the connection to the broker, load credentials, and perform any necessary setup.
*   `onSignalCloseCommit`: Handles the closure of a trading signal (e.g., a take-profit or stop-loss being triggered).
*   `onSignalOpenCommit`: Deals with the confirmation of a new position being opened.
*   `onPartialProfitCommit` and `onPartialLossCommit`: Manage partial profit and loss closures respectively.
*   `onTrailingStopCommit` and `onTrailingTakeCommit`: Handle updates related to trailing stop and trailing take-profit orders.
*   `onBreakevenCommit`:  Manages updates to breakeven stops.
*   `onAverageBuyCommit`: Specifically for handling average-buy (DCA) entries.

## Interface IBreakevenData

This interface defines the data used to store and retrieve breakeven information. It represents a simplified version of the more complex breakeven state, primarily for saving and loading data.  The `reached` property simply indicates whether the breakeven point has been achieved for a specific signal. Think of it as a 'yes/no' flag that gets saved and restored, later rebuilt into a complete breakeven state. This allows the system to remember the breakeven status even across sessions.

## Interface IBreakevenCommitRow

This interface represents a commitment related to breakeven points in your trading strategy. It's essentially a message indicating a breakeven level was established.

The `action` property always specifies "breakeven," confirming the type of action taken. 

The `currentPrice` tells you the price at the moment this breakeven commitment was made, providing context for calculations and analysis.

## Interface IBreakeven

This interface helps manage a system that automatically adjusts stop-loss orders to breakeven when a trading signal becomes profitable enough to cover transaction costs. 

It keeps track of when a signal has reached a point where its stop-loss can be moved to the initial entry price, essentially protecting profits.

The `check` method determines if this breakeven condition has been met, considering factors like the current price, transaction fees, and whether the system is in backtest mode. It then triggers an event and saves the status.

The `clear` method resets the breakeven state when the signal is finished, whether it hits a take-profit, stop-loss, or expiration time limit. This cleans up data and ensures a fresh start for the next trading opportunity.

## Interface IBidData

The `IBidData` interface represents a single bid or ask price point found within an order book.  Each instance provides two key pieces of information: the price at which the bid or ask exists, and the quantity of assets available at that price. Both price and quantity are provided as strings, reflecting their representation in the underlying order book data.  This allows you to easily access and interpret individual levels within the market's depth.


## Interface IAverageBuyCommitRow

This interface represents a single step in a recurring average-buy (DCA) strategy. It tracks a specific purchase within the DCA process.

You'll see this data structure when your backtest kit framework executes an average-buy action.

The `action` property confirms that this is an average-buy commit. `currentPrice` tells you the price paid for this particular buy. `cost` represents the USD value of that buy.  Finally, `totalEntries` reflects the cumulative number of buys made as part of this DCA strategy up to this point.

## Interface IAggregatedTradeData

This interface defines a single trade event, capturing the essential details needed for analyzing market activity and running backtests. Each trade is identified by a unique ID and includes the price at which it took place, the quantity of assets exchanged, and the precise time of the transaction. A key piece of information is whether the buyer acted as the market maker, which helps determine the direction of the trade within the larger market. This data point provides a foundation for understanding trade flow and testing trading strategies.

## Interface IActivateScheduledCommitRow

This interface represents a queued action to activate a scheduled commit within the backtest-kit framework. It essentially signifies that a previously planned or scheduled event needs to be triggered. 

The `action` property clearly identifies this as an 'activate-scheduled' action. Each activation request is tied to a specific `signalId`, representing the data stream or signal that's being acted upon.  Optionally, an `activateId` can be provided to track user-initiated activations, useful for debugging or specific workflows.

## Interface IActionSchema

The `IActionSchema` lets you extend the functionality of your trading strategies with custom actions. Think of them as hooks that trigger specific behaviors – like sending notifications, logging events, or updating external systems – whenever certain events happen within your strategy.

You register these actions using `addActionSchema`. Each action is uniquely identified and can include a helpful note for documentation.

The core of an action is its handler, which is essentially a piece of code that gets executed whenever the action is triggered.  You can also define callbacks to control when your action runs, allowing for lifecycle management or responding to specific events. 

These actions are created fresh for each strategy run, giving you a dedicated space to integrate your strategy with external tools and processes. You can attach several of these actions to a single strategy to cover various needs.

## Interface IActionParams

The `IActionParams` interface defines the data given to an action when it's created, bringing together how the action is designed and what's happening while it runs. It includes a way to log messages for troubleshooting and understanding how the action performs. You'll also find information about which strategy and timeframe the action is a part of.  Finally, it indicates whether the action is being run as part of a historical backtest or in live trading.

## Interface IActionCallbacks

This interface, `IActionCallbacks`, provides a way to hook into the lifecycle and events of your trading actions within the backtest-kit framework. Think of it as a set of customizable events that allow you to manage resources, log activity, and react to specific trading situations.

You can use `onInit` to set things up when an action starts, like connecting to a database or loading data.  Conversely, `onDispose` lets you clean up when the action is finished – closing connections or saving state.

Several `onSignal...` callbacks provide insight into the trading process.  You'll get notifications for every tick (`onSignal`), only in live mode (`onSignalLive`), or only during backtesting (`onSignalBacktest`).

Beyond the regular signal, there are callbacks for breakeven events (`onBreakevenAvailable`), partial profit/loss triggers (`onPartialProfitAvailable`, `onPartialLossAvailable`), and ping monitoring (`onPingScheduled`, `onPingActive`).  These provide extra levels of control and insight.

Finally, `onRiskRejection` alerts you when a signal is blocked by risk management.  `onSignalSync` is a special callback that allows you to directly influence the framework's attempt to open or close a position using a limit order. Rejecting this action will trigger a retry on the next tick, offering a way to fine-tune order placement.

## Interface IAction

This interface acts as a central hub for managing events related to your trading strategies, allowing you to connect your trading logic to the backtest-kit framework. Think of it as a way to receive notifications about what's happening in your strategy – whether it's generating signals, hitting profit or loss targets, or encountering issues.

You can use this to hook into things like:

*   Dispatching actions in Redux or Zustand
*   Logging events for auditing purposes
*   Sending data to real-time monitoring dashboards
*   Collecting data for performance analysis

The `signal` method is the most common, handling signals from both live and backtest modes. There are also separate methods for handling signals specifically from live (`signalLive`) or backtest (`signalBacktest`) environments. You'll also receive events for breakeven points, partial profit/loss levels, scheduled ping updates, risk rejections, synchronization attempts (using `signalSync`), and finally, a `dispose` method to clean up when you're finished. The `dispose` method is important to ensure resources aren’t left dangling when your handler is no longer needed.

## Interface HighestProfitStatisticsModel

This model holds information about the highest profit events seen during a trading simulation. It keeps track of every event that resulted in a high profit, listing them in order from most recent to oldest. You can access the complete list of these profitable events through the `eventList` property, which gives you a detailed look at what happened. The `totalEvents` property simply tells you how many profitable events were recorded.

## Interface HighestProfitEvent

This data represents the single, most profitable moment captured for a specific trade. It contains details like the exact time (timestamp) when this peak profit occurred, what asset was being traded (symbol), and which trading strategy was in use. You'll also find the unique identifier of the signal that triggered the trade, whether the position was a long or short, and the unrealized profit and loss (PNL) at that point. The record also includes the price at which the highest profit was achieved, alongside the initial entry price, take profit price, and stop-loss levels. Finally, it indicates if this event occurred during a backtesting simulation.

## Interface HighestProfitContract

The `HighestProfitContract` provides details whenever a trading strategy reaches a new peak profit level. It’s like a notification telling you, “Hey, this position is doing really well!” The notification includes key information such as the trading symbol (like "BTC/USDT"), the current price, and the precise time of the profit milestone.

You'll also see what strategy, exchange, and timeframe were involved, along with the signal that triggered the trade. Critically, the `backtest` flag tells you whether this is happening in a simulated environment or a real-time trading scenario, so you can react differently depending on the context. This allows for custom actions like setting trailing stops or taking partial profits as the position thrives.

## Interface HeatmapStatisticsModel

This structure holds the key statistics needed to visualize and understand the overall performance of your portfolio. It breaks down the aggregated results for each symbol you're tracking, giving you a complete picture of your trading activity. You'll find the number of symbols in your portfolio, the total profit and loss across all of them, and important metrics like the Sharpe Ratio, which assesses risk-adjusted returns.  The `symbols` property contains a detailed list of statistics for each individual symbol. Finally, the `totalTrades` property shows the total number of trades executed across the entire portfolio.

## Interface DoneContract

This interface defines what information you receive when a background process, either a backtest or a live trading session, finishes. It provides details about the completed execution, including the exchange used, the name of the strategy that ran, and whether it was a backtest or live execution. You'll find the trading symbol involved, like "BTCUSDT," is also included in this notification, allowing you to easily identify which asset was traded.  Essentially, it's a notification package to confirm and provide context for a completed trading run.

## Interface CriticalErrorNotification

This notification signals a serious problem that needs immediate attention, likely requiring the process to stop. It’s designed to help you identify and fix critical issues within your trading system. Each notification has a unique ID and includes a detailed error message to explain what went wrong. You'll also find a complete stack trace and extra information about the error itself, making debugging much easier. Importantly, these notifications always indicate that the error occurred outside of a backtesting environment – they are from a live context.

## Interface ColumnModel

This section describes how to define the structure of columns when generating tables, like those used for displaying backtest results. Think of it as a blueprint for what each column will look like and how its data will be presented. You'll specify a unique identifier for each column, a user-friendly label for the header, and a function that transforms the underlying data into a readable string.  You can also control whether a column is shown or hidden based on a condition. Essentially, it lets you tailor the table's appearance to best convey the information.

## Interface ClosePendingCommitNotification

This notification signals that a pending trade signal has been closed before it ever fully activated. It's important for understanding why a signal didn’t result in an open position. The notification includes a unique identifier and timestamp to track it, alongside details like whether it occurred during a backtest or live trading, the symbol involved (e.g., BTCUSDT), and the strategy and exchange responsible for the signal.

You'll also find specific information about the signal itself, like its unique ID and the reason for closure.  It provides a comprehensive financial picture of the closed signal, including profit/loss, entry and exit prices adjusted for fees and slippage, and the total capital invested. Finally, there's a timestamp indicating when the notification itself was created.

## Interface ClosePendingCommit

This interface defines how to finalize a pending signal event, essentially marking it as complete. It's used when you want to record the details of closing out a trade that was initially flagged as pending. The `action` property simply identifies this as a "close-pending" action. You can optionally provide a `closeId` to help categorize or track why the pending signal was closed, for example, if it was due to a specific condition or manual intervention. Finally, the `pnl` property contains the profit and loss information calculated at the time the pending signal was closed, allowing you to assess its performance.

## Interface CancelScheduledCommitNotification

This notification appears when a scheduled trade signal is canceled before it actually executes. It provides details about the cancellation, acting like a confirmation that something planned didn't go through.

Each notification has a unique identifier and a timestamp indicating when the cancellation was processed. You’ll also find information about whether the cancellation occurred during a backtest or live trading environment.

The notification includes specifics about the trade itself: the trading pair (like BTCUSDT), the strategy that generated the signal, and the exchange involved. A unique signal ID and a cancellation ID (if provided) are also present for tracking purposes.

Beyond the basics, the notification includes details about the potential trade's structure, like the number of entries planned (for dollar-cost averaging) and the presence of partial closes. It also delivers performance information, including profit and loss figures, calculated entry and exit prices, and costs associated with the trade. Finally, a timestamp indicates when the notification was initially created.

## Interface CancelScheduledCommit

This interface lets you signal that a previously scheduled event needs to be canceled. It's useful when you need to halt a planned action, perhaps because market conditions have changed or a new decision has been made. To use it, you'll specify that the "action" is "cancel-scheduled," and you can include a "cancelId" to provide a way to track or understand why the cancellation happened – this is optional. Finally, you provide the "pnl" representing the unrealized profit and loss at the point when the cancellation is requested.

## Interface BreakevenStatisticsModel

This model holds information about breakeven events, which are points where a trade's losses are recouped. You can think of it as a record of how often a trade has reached a breakeven point. It keeps track of every individual breakeven event, along with all its details, in the `eventList` property. The `totalEvents` property simply tells you how many breakeven events have occurred in total.

## Interface BreakevenEvent

This data structure holds all the important details whenever a trade hits its breakeven point during a backtest or live trading. It includes the exact time of the event, the trading pair involved, the name of the strategy used, and a unique identifier for the signal that triggered the trade. You'll find information on whether it's a long or short position, the current market price, the initial entry price, and the defined take profit and stop-loss levels.

It also tracks original price levels set during signal creation, the number of dollar-cost averaging entries if applicable, details about partial closes, and a human-friendly note explaining the reason behind the signal. You'll find timestamps related to when the position became active and when the signal was initially created, as well as an indicator showing whether the trade occurred during a backtest. Finally, it contains unrealized profit and loss data at the moment breakeven was reached.

## Interface BreakevenContract

This interface defines what happens when a trading signal's stop-loss automatically moves back to the entry price – a significant event indicating risk has been managed. It’s like a checkpoint showing a strategy is performing well and protecting its downside.

Each breakeven event is unique to a single signal and won't happen again, keeping things tidy. This event provides a wealth of information, including the specific trading pair involved (symbol), the name of the strategy generating the signal, the exchange and frame being used, and full details of the original signal.  It also records the current market price at the time of the breakeven, and whether this occurred during a backtest or live trading session. Finally, a timestamp marks precisely when this event occurred – either the live tick time or the candle time during a backtest. Different services, like report generation or user notifications, can react to these events to keep track of strategy performance.

## Interface BreakevenCommitNotification

This notification signifies that a breakeven point has been reached and a trade has been adjusted to that level. It’s like a checkpoint in your trading, indicating the strategy has hit a pre-defined profit target related to the initial investment.

The notification provides a wealth of details about the trade, including a unique identifier, when it happened, and whether it occurred in a backtest or live trading environment. You’ll see the symbol being traded, the strategy that generated the signal, and the exchange involved.

It includes key price points like the initial entry price, take profit, and stop loss levels – both their original values and how they've potentially changed with trailing stops. Importantly, it also shares information on any DCA (Dollar Cost Averaging) involved, showing how many entries were made.

The notification also gives you a snapshot of the trade's performance, including profit and loss figures in both absolute and percentage terms, and details regarding slippage and fees. Finally, it provides timestamps for various stages of the trade lifecycle, from initial scheduling to the current breakeven commit.

## Interface BreakevenCommit

The `BreakevenCommit` represents an event triggered when a trading strategy adjusts to a breakeven point. It essentially signals that the strategy is resetting stop-loss to the entry price to protect profits. 

This event includes key details about the trade at the moment of adjustment, such as the current market price, the unrealized profit and loss (pnl), and whether the position is long or short. You’ll find the original entry price, the take profit and stop loss prices – both as they were initially set and as they stand after any trailing adjustments. 

Finally, timestamps for when the breakeven signal was generated and the position was activated provide important context for understanding the trading sequence. These details help reconstruct the trade's lifecycle and analyze the effectiveness of the breakeven strategy.

## Interface BreakevenAvailableNotification

This notification alerts you when a trading signal's stop-loss can be adjusted to match your entry price, essentially breaking even. It provides detailed information about the event, including a unique identifier, the exact time it occurred, and whether it's happening in backtest or live mode.

You'll find specifics about the trading pair (like BTCUSDT), the strategy that generated the signal, and the exchange used. The notification also includes the current market price, your original entry price, and the current state of your take profit and stop-loss levels.

For strategies employing dollar-cost averaging (DCA), you'll also see details about the number of entries and partial closes. A comprehensive P&L breakdown is also included, showing the unrealized profit/loss, profit percentage, and the invested capital. Finally, the notification captures timestamps related to the signal's creation and pending status.

## Interface BacktestStatisticsModel

This model holds a wealth of information about how your trading strategy performed during a backtest. You'll find a list of every trade that was closed, including prices, profit and loss, and timestamps.

It also provides key summary statistics like the total number of trades, how many were winners and losers.

From there, you can see the win rate, which tells you the percentage of profitable trades. Average and total profit and loss figures give you an overall view of performance.

Several metrics help assess risk, including standard deviation (a measure of volatility) and the Sharpe Ratio, which factors in risk to gauge the return. Annualized versions of these ratios put the performance in yearly terms.  Finally, certainty ratio and expected yearly returns give you additional insights. 

Keep in mind that some of these values might be null if the calculations couldn’t be reliably completed.

## Interface AverageBuyCommitNotification

This notification signals that a new averaging (DCA) purchase has been made as part of a larger trading strategy. It’s triggered whenever an average-buy entry is added to an existing position. The notification contains a wealth of information about this event, including a unique identifier, the exact time it occurred, and whether it's happening in a backtest or live environment.

You'll find details about the trade itself – the symbol being traded, the strategy that generated the signal, the exchange used, and the price at which the averaging purchase happened. Crucially, the notification also provides information about the cumulative effect of the averaging process, like the effective entry price and the total number of averaging entries made so far.

For detailed performance tracking, the notification also includes P&L data – both in absolute USD and as a percentage – alongside the entry and exit prices used in those calculations, as well as information on slippage and fees. It also provides insight into the timing of the signal generation and order execution, including timestamps for when the signal was created, pending, and when the averaging commit happened.

## Interface AverageBuyCommit

This event, called `AverageBuyCommit`, signals when a new buy or sell order is placed as part of a dollar-cost averaging (DCA) strategy for an existing position. It’s triggered when the strategy decides to add another averaging entry to the mix.

The event provides a wealth of information about this averaging action, including the price at which the new order was executed (`currentPrice`), the cost of that order (`cost`), and how the average entry price changes as a result (`effectivePriceOpen`).

You'll also find details on the original entry price (`priceOpen`), the current take profit and stop loss levels (both effective and original, before any trailing adjustments), and timestamps marking when the signal was generated (`scheduledAt`) and the position was activated (`pendingAt`).  The event also includes the current profit and loss (`pnl`) of the position. Finally, it specifies whether the position is long (buying) or short (selling).

## Interface ActivePingContract

The ActivePingContract helps you keep track of active pending signals, providing updates every minute while they are still open. 

It sends information about each ping, including the trading symbol, the strategy name, and the exchange involved. 

You’ll get the complete data for the pending signal, like its ID, position details, and price levels, along with the current market price at the time of the ping.

A flag indicates whether the ping is from a backtest (historical data) or a live trading environment.

Finally, you'll receive the exact timestamp when the ping occurred, which is the time of the ping in live mode and the candle timestamp during backtest mode. This allows you to build custom logic to manage your signals and react to changes in market conditions.

## Interface ActivateScheduledCommitNotification

This notification lets you know when a scheduled trading signal has been activated, meaning a trade is about to be placed. It's triggered when a user manually initiates a trade based on a previously scheduled signal, bypassing the standard price check.

The notification contains a wealth of information about the trade about to happen, including a unique identifier for the notification itself, the exact time the activation was committed, and whether it's happening in backtest or live mode. You'll also find details like the trading pair, the strategy that generated the signal, and the specific exchange involved.

Key details about the trade itself are present, such as the direction (long or short), entry price, take profit and stop loss levels (both original and adjusted), and information about any averaging or partial closing strategies used.

It also provides insights into the potential profitability with comprehensive P&L data including percentage, entry and exit prices (adjusted for fees), and total investment. Finally, you'll find timestamps related to signal creation and pending status, along with the current market price at the time of activation and when the notification was created.

## Interface ActivateScheduledCommit

This interface describes the data needed when a previously scheduled trading signal is put into action. It essentially tells the system that a trade should now be executed based on a plan that was set up earlier. 

The `action` property confirms this is an activation event.  You can also include an `activateId` to help track why the activation happened, if needed.

The message also provides crucial details about the trade itself – the current market price, the entry price (`priceOpen`), and the take profit and stop-loss levels (both their effective, adjusted values and their original, pre-adjustment amounts).

Furthermore, it includes information about the trade's direction (`position`), the signal's creation time (`scheduledAt`), and the time the position is being activated (`pendingAt`), as well as a snapshot of the strategy's profit and loss (`pnl`) at that specific moment. This comprehensive data allows for accurate tracking and analysis of the trading process.
