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

This interface describes what happens when a "stop" signal is sent to a backtest-kit walker. Think of a walker as a process running a trading strategy – sometimes you need to halt that process. This `WalkerStopContract` carries information about *which* walker and strategy need to be stopped, and crucially, *which* walker instance the signal is intended for if you're running several walkers at once. It tells you the trading symbol involved, the name of the strategy to pause, and the specific walker's name so you can target the interruption precisely.


## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps you understand how different trading strategies performed during a backtest. It’s essentially a collection of results from various strategies, allowing for easy comparison. Think of it as a way to organize and view the outcomes of multiple trading approaches side-by-side.

Specifically, it provides an array of strategy results, giving you access to metrics and data for each individual strategy you tested. This data is crucial for evaluating and refining your trading strategies.


## Interface WalkerContract

The WalkerContract represents updates you receive as backtest-kit compares different trading strategies. Think of it as a progress report showing how each strategy performs relative to others.

Each report contains details like the name of the strategy that just finished testing, the exchange and symbol it was tested on, and the statistics gathered during that backtest.

You'll also see key information like the metric being optimized (like Sharpe Ratio) and its current value for that strategy.  The report also tracks the overall best-performing strategy encountered so far, alongside the number of strategies tested and the total number that remain. This allows you to monitor the optimization process and get a sense of how the strategies are ranking against each other.

## Interface WalkerCompleteContract

This interface represents the final notification you receive when a backtesting process, known as a 'walker', is complete. It holds all the important information about the test run, including the name of the walker, the trading symbol being analyzed, and the exchange and timeframe used. You’ll find details about the metric being optimized, the total number of strategies that were tested, and critically, which strategy performed the best. The notification also provides the best metric score achieved and a complete set of statistics for that top-performing strategy.

## Interface ValidationErrorNotification

This notification signals that something went wrong during validation, typically when risk checks are being performed. It's like a warning light indicating a problem that needs attention. Each notification has a unique ID to track it, and includes a detailed error object, complete with a stack trace to help pinpoint the issue. You'll also find a human-friendly message explaining the validation failure, making it easier to understand what went wrong. Importantly, these errors originate from the live context, not a backtest simulation.

## Interface ValidateArgs

This interface, `ValidateArgs`, provides a way to ensure the names you're using for different parts of your trading system are correct. Think of it as a checklist for your configurations. 

It defines properties like `ExchangeName`, `FrameName`, `StrategyName`, and more – each representing a key component of your backtesting setup.  Each of these properties expects an enum object, which contains the valid names for that particular component. 

By using this interface, you can easily make sure that the names you provide for exchanges, timeframes, strategies, and other elements match the system’s expectations, helping to avoid errors and ensuring everything runs smoothly. This is particularly useful when configuring and validating your trading backtests.


## Interface TrailingTakeCommitNotification

This notification provides detailed information when a trailing take profit order is executed. It’s essentially a record of what happened when your strategy decided to close a position using its trailing take profit feature. 

You'll find key details like a unique identifier, the exact time of the event, and whether it occurred during a backtest or live trading. It specifies the trading symbol, the name of the strategy that triggered the action, and the exchange used.

The notification also includes information about the original and adjusted take profit and stop-loss prices, along with the entry price and the direction of the trade (long or short). It also provides information about any DCA (dollar-cost averaging) that occurred, along with the total number of entries and partial closes. 

Finally, there’s a comprehensive breakdown of the profit and loss (PNL) associated with the trade, including percentages, prices used in the calculation, and the overall cost and invested capital. Timestamps related to signal creation and pending status are also included.

## Interface TrailingTakeCommit

This interface describes an event that occurs when a trailing take profit order is triggered within the backtest-kit framework. It essentially signifies that the take profit price has been adjusted based on the trailing logic and a trade is about to be executed.

The event provides detailed information about the adjustment, including the percentage shift applied, the current market price at the time, and the current unrealized profit and loss. You'll also find details about the original take profit and stop-loss prices before trailing adjustments, as well as the entry price. 

Knowing the trade direction (long or short), along with the timestamps of signal creation and position activation, allows for a complete understanding of the sequence of events leading to this trailing take profit. This information is valuable for analyzing and debugging trading strategies.

## Interface TrailingStopCommitNotification

This notification lets you know when a trailing stop order has been triggered and executed. It’s a detailed record of what happened, including a unique ID, the exact time it occurred, and whether it happened during a backtest or in live trading.

You’ll find key information about the trade, like the symbol being traded, the strategy that generated the signal, and the exchange used. It also provides all the pricing details, including the original entry price, take profit, and stop loss prices – as well as how those prices shifted due to trailing. 

The notification breaks down the specifics of the position, including its direction (long or short), and offers a comprehensive view of the profit and loss situation, with both absolute and percentage values, alongside relevant pricing data for the P&L calculations. Finally, timestamps are provided for various stages, from signal creation to when the position started and when the notification itself was created, offering a complete timeline of events.

## Interface TrailingStopCommit

This interface describes what happens when a trailing stop order is triggered in your backtest. It provides all the details about the adjustment, including the percentage shift used to move the stop loss. 

You'll find information about the current market price at the time of the adjustment, the unrealized profit and loss (pnl) of the position, and the direction of the trade (long or short). 

The interface also tracks the original and current take profit and stop loss prices, as well as the timestamps for when the signal was created and the position was activated. This allows you to understand the full sequence of events leading up to the trailing stop being executed.

## Interface TickEvent

The `TickEvent` provides a standardized way to represent different events happening during trading, making it easier to generate reports and analyze performance. It essentially bundles all the relevant information about a tick, no matter if it’s a new order, a completed trade, or a cancellation.

Each event has a timestamp indicating when it occurred and an `action` type that clarifies what happened – whether a position was opened, closed, scheduled, or simply idle.  For trades involving symbols, you’ll find details like the symbol itself, a unique signal ID, and the position type (like long or short).  Signals often have associated notes, too.

When a trade is active, you'll see data related to pricing, including the open price, take profit, and stop loss levels, and their original values before any adjustments. The `TickEvent` also tracks details about DCA averaging, showing the number of entries and partial closes. 

Profit and loss data, both unrealized and realized, is included, along with percentage progress towards take profit and stop loss. If a trade is closed or cancelled, specific reasons are recorded.  Finally, timing information like when a position became active or when a signal was scheduled is available.

## Interface SyncStatisticsModel

This model holds statistical information about how your trading signals are syncing. It essentially gives you a breakdown of the sync process. You'll find a list of all the individual sync events, along with the total number of syncs that have occurred.  It also tracks how many times signals were opened and closed during the sync process, providing insight into the activity surrounding your signals. Think of it as a report card for your signal synchronization.

## Interface SyncEvent

The `SyncEvent` object is designed to hold all the essential data about what's happening with a trading signal throughout its lifecycle, making it easy to generate reports, especially in markdown format. Think of it as a single package containing everything you need to understand a specific event related to a trade.

It includes details like when the event occurred (`timestamp`), which asset was being traded (`symbol`), the name of the strategy involved (`strategyName`), and the exchange used (`exchangeName`). You'll also find identifiers like `signalId` and information about the trade direction (`position`), entry price (`priceOpen`), and profit/loss targets (`priceTakeProfit`, `priceStopLoss`). 

It keeps track of how prices may have been adjusted (original vs. effective prices) and provides data around partial entries and exits.  The `scheduledAt` and `pendingAt` properties help track signal creation and activation times, while the `backtest` flag indicates if the event occurred during a backtesting simulation.  Finally, you can see how the trade is performing with the `pnl` object, and understand why a signal was closed with the `closeReason`.

## Interface StrategyStatisticsModel

This model neatly packages all the statistical information generated as your strategy runs. Think of it as a report card for your trading strategy.

It keeps track of various actions your strategy takes, like canceling scheduled orders, closing pending orders, taking partial profits or losses, and using trailing stops. 

You'll find counts for each of these event types, giving you a clear picture of how your strategy behaves. The `eventList` property holds a complete record of every event that occurred, along with all its details, which you can examine more closely. Finally, it includes the total number of events and a count of average-buy actions, useful if you're employing a dollar-cost averaging strategy.

## Interface StrategyEvent

This data structure bundles all the important information about what your trading strategy is doing. Think of it as a record of every action your strategy takes, whether it's opening a new position, adjusting a stop-loss, or closing a trade.

It includes details like the exact time of the action, the trading pair involved, the name of your strategy, and whether it's running in backtest or live mode. You’ll find data about the trade itself, such as the entry price, take profit levels, stop loss levels, and how many partial closes have been executed.

For strategies using dollar-cost averaging (DCA), you'll also see information about the cumulative entries and the averaged entry price. The record also includes the profit and loss (PNL) at the time of the action and other IDs to track scheduled or pending actions. It’s designed to make generating reports and understanding your strategy's behavior much easier.

## Interface SignalSyncOpenNotification

This notification tells you when a scheduled trade, like a limit order, has been executed and a position has been opened. It provides a wealth of information about that trade, including a unique identifier and the exact time it happened.

You’ll find details like the trading symbol (e.g., BTCUSDT), the name of the strategy that triggered the trade, and the exchange where it took place. Crucially, it gives you the entry price and any take profit or stop-loss prices that were active at the time of the trade.

It also includes profit and loss data, both in absolute USD values and as a percentage, plus details about any DCA averaging or partial closes that might have occurred. Finally, the notification specifies whether the trade occurred in backtest or live mode, and when it was originally scheduled and finally activated.

## Interface SignalSyncCloseNotification

This notification lets you know when a trading signal has been closed, whether it was due to hitting a take profit or stop loss, time expiring, or a manual closure. It provides a wealth of information about the closed signal, including a unique ID, the exact timestamp of the closure, and whether it occurred during a backtest or live trading.

You’ll find details about the trade itself, such as the symbol traded, the strategy that generated the signal, and the exchange used. Crucially, it includes the entry and exit prices, along with the profit and loss figures, both absolute and as a percentage.

The notification also covers specifics like the original take profit and stop loss prices, before any adjustments, along with details about any DCA averaging or partial closes performed. Finally, you'll see timestamps for when the signal was initially created and when the position was activated, and a description of the reason for the signal's closure.

## Interface SignalSyncBase

This interface defines the core information that all signal synchronization events share, regardless of whether they come from a backtest or a live trading environment. Every signal event will include details like the trading symbol (e.g., BTCUSDT), the name of the strategy that produced it, and the exchange it was executed on. 

You'll also find information about the timeframe used, whether the signal originates from a backtest, a unique identifier for the signal itself, and the precise timestamp of when it occurred. Crucially, each event provides the complete public signal data associated with that signal.

## Interface SignalScheduledNotification

This notification lets you know when a trading signal has been scheduled for future execution, whether it’s during a backtest or in live trading. It provides a wealth of information about the signal, including a unique ID, the exact time it was scheduled, and whether it's part of a backtest.

You'll find details about the trading strategy that generated the signal, the exchange it's targeted for, and the specific trade parameters like position direction (long or short), entry price, take profit, and stop loss levels. Importantly, you can see the original prices before any adjustments like trailing stops.

The notification also includes information related to DCA averaging and partial closes, if applicable. You’ll get cost and PnL data, including the entry and exit prices used in those calculations, as well as the current market price at the time the signal was scheduled and the timestamp of its creation. This data allows you to track the lifecycle of your signals and understand their performance.

## Interface SignalOpenedNotification

This notification tells you when a new trading position has been opened. It's a key piece of information for understanding what your trading strategies are doing.

Each notification has a unique ID and timestamp, and it clearly indicates whether the trade happened in backtest mode or in live trading. You'll find details about the trade itself, including the symbol being traded (like BTCUSDT), the name of the strategy that triggered it, and the exchange used. 

The notification provides specifics on the trade's direction (long or short), entry price, take profit, and stop-loss levels. It also includes original price values before any adjustments like trailing stops were applied. For strategies using dollar-cost averaging (DCA), you can see the total number of entries made. 

You also get a snapshot of the trade's financial status at the time it was opened, including costs, profit and loss information (both absolute and as a percentage), and details about the capital invested.  Finally, a human-readable note can provide context for the signal, and timestamps show when the signal was scheduled, became pending, and when the data was created.

## Interface SignalOpenContract

This event lets you know when a pre-planned trade (a limit order) has actually been executed by the exchange. Think of it as confirmation that your order to buy or sell at a specific price was filled.

It’s useful for keeping external systems in sync with what's happening in the backtest or live trading environment.  For example, if you have a system that needs to track order confirmations, this event provides that information.

The data included with this event gives you a complete picture of the trade:  you'll see the entry price, the current market price when the trade started, the stop-loss and take-profit levels,  the total profit or loss so far, and details like the original order price before any adjustments and how many individual entries or partial closings were involved. The `scheduledAt` tells you when the initial signal was created, and `pendingAt` shows precisely when the position became active.

## Interface SignalData$1

This data structure holds all the important details about a single trade that has already finished, allowing you to analyze its performance.  Each entry represents a closed signal, telling you which strategy created it, a unique ID for tracking, and the symbol being traded. You'll also find information about whether the trade was a long or short position, the percentage profit or loss (PNL), why the trade was closed, and the exact times it was opened and closed.  It's like a detailed report card for each individual trade within your backtesting results.

## Interface SignalCommitBase

This interface defines the core information shared by all signal commitment events within the backtest-kit framework. Every signal commitment, whether from a backtest or live trading environment, will include details like the trading symbol (e.g., BTCUSDT), the name of the strategy that generated the signal, and the exchange it was executed on. 

You'll also find information specific to backtesting, such as the timeframe used and whether the event originates from a backtest simulation. Each signal receives a unique identifier (signalId), and a timestamp reflecting when it occurred. 

To understand the position’s history, the events also track the number of entries (totalEntries) and partial closures (totalPartials) made, alongside the original entry price, which isn't affected by subsequent DCA averaging.

## Interface SignalClosedNotification

This notification tells you when a trading position, generated by a strategy, has been closed, whether that's due to hitting a take profit or stop loss, or because the signal expired. It provides a wealth of detail about the trade, including when it started and ended, the prices involved, and the profit or loss realized. You'll find information about the strategy that created the signal, the exchange used, and whether the trade occurred in backtest or live mode. The notification breaks down the specifics of the trade’s execution, including details on any DCA averaging or partial closes, and provides a clear picture of the overall performance, including profit and loss in both percentage and absolute terms. It also contains timestamps marking key events like signal creation, pending status, and closure.

## Interface SignalCloseContract

This event lets you know when a trading signal has been closed, whether it was due to hitting a take profit or stop loss, time running out, or a manual close. It's designed to help external systems stay in sync with the backtest kit's trading activity.

You’ll find details about the closing price, the overall profit and loss (PNL) of the trade, and the direction of the trade (long or short). It also provides the original and final prices for entry, take profit, and stop loss, allowing you to track any adjustments made during the trade.

The event includes information about when the signal was created and when the position was activated, along with the reason for closure. Finally, it gives you the total number of entries and partial closes that occurred during the trade, which is helpful for understanding how DCA averaging and partial exits impacted the position.

## Interface SignalCancelledNotification

This notification lets you know when a scheduled trading signal was cancelled before it could be executed. It’s like a signal getting interrupted.

Each notification provides a lot of details about the cancelled signal, including a unique identifier and the timestamp of when it was cancelled. You’ll find information about the trading pair, the strategy that generated the signal, and the exchange involved.

The notification also includes specifics about the planned trade, such as the intended entry price, take profit, and stop loss levels, along with their original values before any adjustments.  You can see how many DCA entries were planned and if any partial closures were part of the strategy. Crucially, it explains *why* the signal was cancelled—whether it was due to a timeout, a price rejection, or a manual user cancellation. If a user cancelled the signal, a cancellation identifier is provided. Finally, it logs the time it took from the signal's creation to its cancellation, and other timestamps related to its lifecycle.

## Interface Signal

The `Signal` object holds information about a trade's execution. It primarily tracks the initial entry price, represented by `priceOpen`. 

You'll also find detailed records of entries (`_entry`), noting the price and cost associated with each. 

Furthermore, the `_partial` property contains a history of any partial exits taken during the trade, including the reason (profit or loss), the percentage of the position closed, the closing price, and the cost basis at the time of the close.  Each of these sections may also include a timestamp for debugging purposes.


## Interface Signal$2

This `Signal$2` object holds important information about a trading position. It keeps track of the initial entry price, which is useful for calculating profits and losses. 

The `_entry` property is a record of how the position was initially established, including the price paid, associated costs, and a timestamp for debugging purposes. 

Similarly, `_partial` stores details about any partial exits from the position, like the type of exit (profit or loss), the percentage of the position closed, the price at the time of the partial exit, the cost basis for the remaining position, and the number of shares/contracts at that point, along with a timestamp for debugging.

## Interface Signal$1

This section describes the `Signal$1` object, which is a key part of how backtest-kit tracks your trades. It holds important information about a specific trade that's been opened.

The `priceOpen` property simply records the price at which you initially entered the trade.

The `_entry` array keeps a history of entries made within the position, including the price, the total cost, and an optional timestamp for debugging.

Finally, `_partial` tracks any partial exits taken during the trade, noting the type (profit or loss), the percentage of the position closed, the current price, the cost basis at the time of the close, the number of shares/contracts at the time, and an optional timestamp.

## Interface ScheduledEvent

This interface holds all the details about trading events – when they were scheduled, opened, or cancelled. It's designed to give a complete picture for generating reports and analyzing performance.

Each event has a timestamp marking when it happened, and an action type indicating whether it was scheduled, opened, or cancelled. You'll find information about the specific trade, including the symbol, signal ID, position type, and any notes associated with it.

Crucially, it includes pricing information like the entry price, take profit, stop loss, and their original values before any adjustments. For strategies using DCA or partial closes, you’ll also find data about the number of entries and partial executions. Profit and loss (PNL) information is included at the time of the event.

For cancelled events, you’ll see the reason for cancellation and a unique ID if it was a user-initiated cancellation. Opened events include when the position became active, while all events have a scheduled timestamp. This provides a consolidated view of the entire trading lifecycle.

## Interface ScheduleStatisticsModel

The ScheduleStatisticsModel helps you understand how your scheduled trading signals are performing. It gives you a complete picture of what's happening with your scheduled signals, from when they're initially scheduled to when they're opened or cancelled. 

You can see a detailed list of every scheduled event, along with the total number of signals scheduled, activated, and cancelled. Key metrics like the cancellation rate and activation rate (expressed as percentages) provide insights into the efficiency of your scheduling process. It also tracks average wait times – how long cancelled signals remained scheduled, and how long it took for signals to be activated. This model lets you monitor and optimize your signal scheduling for better results.

## Interface SchedulePingContract

This contract defines what happens when backtest-kit checks on a scheduled signal while it's actively being monitored. Think of it as a regular heartbeat signal confirming the signal is still in play. You'll receive these pings every minute, and they’re specifically sent while the signal is active – not canceled or activated.

Each ping provides detailed information: the trading symbol involved ("BTCUSDT", for example), the name of the strategy doing the monitoring, the exchange being used, and the full data associated with that scheduled signal.  You also get a flag to tell you whether the ping originates from a backtest (using historical data) or live trading.  Finally, a timestamp is included so you know exactly when the ping occurred – either the real-time moment for live trading or the candle's timestamp during a backtest.

You can register callbacks to listen for these schedule ping events, allowing you to build custom monitoring or cancellation logic based on these regular updates. This lets you keep a close eye on your scheduled signals and react accordingly.

## Interface RiskStatisticsModel

This data model helps you understand how your risk management system is performing. It compiles information about risk rejection events, giving you a clear picture of what's happening.

You'll find a complete list of all rejected events, along with the total number of rejections that occurred. The data is also organized to show you how rejections are distributed, grouped both by the specific trading symbol involved and by the strategy that triggered the rejection. This allows you to pinpoint areas needing attention or adjustments.


## Interface RiskRejectionNotification

This notification alerts you when a trading signal gets blocked by your risk management rules. It's a way for the system to tell you why a potential trade didn't go through.

Each rejection notification has a unique ID and a timestamp, and lets you know if it happened during a backtest or in live trading. You’ll see details like the trading pair (e.g., BTCUSDT), the strategy that generated the signal, and the exchange involved. 

Crucially, it provides a human-readable explanation ("rejectionNote") for why the signal was rejected, and an optional unique rejection ID for further tracking.  The notification also includes information about your current positions, market prices at the time, the intended trade direction (long or short), and details about the proposed entry, take profit, and stop loss prices.  You'll also find information about signal details and the notification creation time.

## Interface RiskEvent

This data structure holds information about when a trading signal was blocked due to risk management rules. Think of it as a record of why a trade didn't happen. 

It includes details like the exact time the event occurred, the trading pair involved (symbol), the signal that was rejected, and the name of the strategy and exchange that generated it. You'll also find the current market price at the time of the rejection, how many positions were already open, and a unique ID for tracking purposes. A note explains *why* the signal was rejected, and it indicates whether this event occurred during a backtest or live trading.

## Interface RiskContract

This interface describes what happens when a trading signal is blocked because it violates risk rules. Think of it as a notification that something went wrong and a trade wasn't allowed.

It provides details about the rejected trade, including the symbol (like BTCUSDT), the specific signal that was attempted, and the strategy that requested it. You'll also find information about the timeframe used, the exchange involved, and the current market price at the time.

The system keeps track of how many positions are already open and provides a unique ID for each rejection, which helps in debugging. A human-readable note explains why the signal was rejected, and a timestamp indicates precisely when it occurred. Finally, it clarifies whether the rejection happened during a backtest or in live trading.

This information is useful for things like creating reports about risk violations or for developers who want to build custom responses to rejected signals.

## Interface ProgressWalkerContract

This interface defines how progress updates are reported during background tasks within the backtest-kit framework. When a Walker is running, it sends these updates to let you know how far along it is. Each update provides details like the name of the Walker, the exchange being used, the trading symbol, and the total number of strategies it needs to evaluate. You'll also get information on how many strategies have already been processed and what percentage of the work is complete, giving you a clear picture of the overall progress.

## Interface ProgressBacktestContract

This interface lets you monitor the progress of a backtest as it's running. Think of it as a status update showing how far along the backtest is. 

Each update includes details like the exchange and strategy being tested, the specific trading symbol involved, the total number of historical data points (frames) the backtest will analyze, and how many have already been processed.

You’ll also get a percentage representing the overall completion – a simple number from 0 to 100 – so you can see exactly where the backtest stands. This helps you understand how long it will take to finish and identify any potential issues.

## Interface PerformanceStatisticsModel

This model holds all the performance data collected during a backtest, organized by the trading strategy that generated it. You'll find the strategy's name listed here, along with the total number of performance events and the overall time it took to run the performance calculations. The core of the data lies in `metricStats`, which breaks down statistics by different performance metrics. Finally, `events` provides access to the complete, original performance data points recorded during the backtest, allowing for detailed inspection.


## Interface PerformanceContract

The `PerformanceContract` helps you understand how quickly your trading strategies are running. It’s like a detailed log of different actions within your backtest or live trading, recording how long each step takes. Each entry includes a timestamp, and importantly, the timestamp of the previous action to easily see how timings change over time.

You'll find information about what type of action was performed (like order placement or data retrieval), the name of the strategy and the exchange involved, the trading symbol being used, and whether the action occurred during a backtest or in live mode. This data lets you pinpoint slow operations and optimize your strategies for speed and efficiency. The frame name is available during backtest and absent during live trading.

## Interface PartialStatisticsModel

This model helps you keep track of how your trading strategy performs when it takes partial profits or losses. It breaks down the results into key pieces of information. 

You’ll find a complete list of all the profit and loss events, along with their details, within the `eventList` property. The `totalEvents` property tells you the overall number of events recorded.  To understand the balance, `totalProfit` shows you how many profitable events you’ve had, while `totalLoss` reveals the count of losing events.

## Interface PartialProfitContract

This describes events that happen when a trading strategy hits certain profit milestones, like 10%, 20%, or 30% profit. These events are useful for keeping track of how well your strategy is performing and for automating partial take-profit actions.

Each event tells you specifically which trading pair (like BTCUSDT), strategy, and exchange it relates to, along with the name of the frame it's running in.  You'll also get the original signal information, the current market price at the time of the milestone, and the exact profit level achieved. 

A flag indicates whether the event came from a backtest (using historical data) or live trading.  Finally, a timestamp provides precise timing information, reflecting when the profit level was detected, either in real-time or based on the candle data during a backtest.


## Interface PartialProfitCommitNotification

This notification lets you know when a partial profit has been taken during a trade. It provides a ton of detail about the trade that occurred, including a unique ID for the notification itself, the exact time it happened, and whether it's happening during a backtest or live trading.

You’ll see key information like the trading symbol, the strategy that triggered the action, and the exchange used. It also gives you the signal ID, the percentage of the position that was closed, and the current market price at the time.

The notification includes all the original and adjusted price points—entry, take profit, and stop loss—allowing you to understand how trailing stop mechanisms influenced the trade.  You’ll also find details about any DCA averaging that occurred (total entries), along with how many partial closes have been executed.  Crucially, it includes comprehensive P&L information, giving you the absolute profit/loss, percentage gain/loss, and the effective entry and exit prices considering slippage and fees.  Finally, timestamps related to signal creation and pending states are provided for full trade timeline context.

## Interface PartialProfitCommit

This interface describes a partial profit taking event within the backtest kit. It's triggered when a strategy decides to close a portion of a trade before reaching the full take profit target. The `action` property clearly identifies this as a "partial-profit" event.

You'll find key details about the trade itself included, like the `position` (long or short), the `priceOpen` where you entered the trade, and the current market `currentPrice`. The `priceTakeProfit` and `priceStopLoss` reflect any trailing adjustments that might have been applied to your original take profit and stop loss levels, while `originalPriceTakeProfit` and `originalPriceStopLoss` show the initial values. 

Crucially, the `percentToClose` indicates what percentage of the position the strategy is closing off, and `pnl` provides the unrealized profit and loss at the time the event occurred. Finally, `scheduledAt` and `pendingAt` timestamps give you a precise timeline of when this event was planned and when the position initially began.

## Interface PartialProfitAvailableNotification

This notification lets you know when a trading strategy has reached a pre-defined profit milestone, like 10%, 20%, or 30% gain. It's triggered during both backtesting and live trading.

The notification includes a lot of detailed information about the trade. You'll find the unique ID of the notification, the exact time it occurred, and whether it's a backtest or a live trade. It specifies the trading pair involved, the strategy's name, the exchange used, and the signal ID.

You can also see the profit level reached, the current market price, the initial entry price, and the trade direction (long or short). Importantly, it provides both the current take profit and stop loss prices, as well as their original values *before* any trailing adjustments were applied.

The notification also details the specifics of any DCA averaging used (number of entries), the number of partial profit closes already executed, and a comprehensive breakdown of the profit and loss, including the unrealized PNL, percentage profit/loss, and costs associated with the trade. Finally, it includes timestamps related to the signal’s creation and pending status, offering a full timeline of the trade's lifecycle.

## Interface PartialLossContract

The `PartialLossContract` helps you keep track of how your trading strategies are performing, specifically when they hit predefined loss levels like -10%, -20%, or -30%. It's like a notification system telling you when a strategy is experiencing a drawdown.

Each notification, or event, contains a lot of useful information. You'll find details like the trading pair involved (e.g., BTCUSDT), the name of the strategy that triggered it, and the exchange and frame it's running on. The `data` property provides access to the original signal information, while `currentPrice` indicates the market price at the time the loss level was reached.

The `level` property is key—it tells you exactly how much the strategy has lost (e.g., `level: 20` means a 20% loss). You'll also know if the event comes from a backtest using historical data or from live trading. Finally, a timestamp is included to precisely mark when this loss level was detected. This allows you to analyze and understand how your strategies react to market movements and potential risks.

## Interface PartialLossCommitNotification

This notification tells you when a partial closing of a position has happened, whether it's during a backtest or live trading. It gives you a unique ID and timestamp for the event, along with details about the trade, like the symbol being traded ("BTCUSDT"), the strategy that triggered it, and the exchange used.

You'll find important pricing information too, including the entry price, take profit, stop loss, and their original values before any trailing adjustments.  It also provides a breakdown of the position's history, showing the number of DCA entries and partial closes already executed.

The notification provides a snapshot of the strategy’s profit and loss (PNL) at the time of the partial close, including the cost and percentage, and all relevant pricing details used in that calculation.  Finally, it includes timestamps related to the signal’s creation and activation.

## Interface PartialLossCommit

This describes a partial loss event within the backtest kit. When a strategy initiates a partial loss, this object provides all the details about that action. 

It specifies that the action taken was a "partial-loss," and outlines the percentage of the position being closed. 

You'll also find information about the market price at the time of the action, the unrealized profit and loss (PNL), and the direction of the trade (long or short). 

It includes the original entry price, take profit, and stop loss prices, along with their potentially adjusted values due to trailing.  Finally, timestamps pinpoint when the signal was created and the position was activated, giving context to the trade's timing.

## Interface PartialLossAvailableNotification

This notification lets you know when a trading strategy hits a pre-defined loss level, like a 10% or 20% loss. It’s a signal that something’s gone wrong, or that the strategy is performing as expected.

The notification includes a unique identifier, the exact time the loss level was reached, and whether it’s happening in a backtest (simulated trading) or live trading. You’ll also find key details about the trade itself: the trading pair (e.g., BTCUSDT), the strategy’s name, the exchange used, a unique signal ID, and the specific loss level triggered.

Crucially, it provides price information like the entry price, current market price, and original stop-loss and take-profit levels, which are also adjusted for any trailing stops. The notification also includes insights into how the trade was built: the number of entries if it involves averaging, how many partial closes have already happened, and the current profit or loss situation, including unrealized PNL, PNL percentage, and the capital invested. Finally, timestamps related to signal creation and pending status offer a full timeline of the trade’s lifecycle.

## Interface PartialEvent

This interface, `PartialEvent`, bundles together all the key information about a profit or loss milestone during a trade. It's designed to help generate reports and analyze trading performance.  Each event will tell you when it happened (`timestamp`), whether it was a profit or loss (`action`), and details about the trade itself, like the symbol being traded, the strategy used, and the signal ID. 

You'll find information about where the trade is currently at—the market price (`currentPrice`), the entry price (`priceOpen`), and the take profit and stop loss levels (`priceTakeProfit`, `priceStopLoss`). It also includes the original prices set when the signal was first created (`originalPriceTakeProfit`, `originalPriceStopLoss`), and details about any dollar-cost averaging involved (like `totalEntries` and `originalPriceOpen`). 

Other helpful details included are the total partial closes executed (`totalPartials`), the amount of partials executed (`partialExecuted`), the current unrealized profit/loss (`pnl`), a human-readable explanation (`note`), and timestamps showing when the position became active and when the signal was created (`pendingAt`, `scheduledAt`). Finally, it indicates whether the trade occurred during a backtest or in live trading (`backtest`).

## Interface MetricStats

This object provides a detailed summary of how a particular performance metric behaved during a backtest. It collects key statistics like the total number of times the metric was recorded, the total time it took across all instances, and calculates averages, minimums, maximums, and standard deviations. You'll find percentile information like the 95th and 99th durations to understand outlier performance. Finally, it also tracks wait times between events related to the metric, giving insight into delays or gaps in processing.

## Interface Message

This describes a single message within a conversation. Think of it as one turn in a dialogue, whether it's a direction from the system, a question from the user, or an answer from the language model. Each message has a `role` which tells you who sent it – the system, the user, or the assistant – and `content` which is the actual text of that message. It's the fundamental building block for representing a chat history.

## Interface LiveStatisticsModel

This model gives you a detailed snapshot of how your live trading is performing. It tracks everything from the individual events like trade openings and closures to overall statistics like win rate and average profit. 

You’ll find a full history of events in the `eventList`, alongside the total number of events processed. Key performance indicators like the number of winning and losing trades are readily available, along with the win rate, which tells you the percentage of profitable trades.

The model also provides insights into profitability with metrics like average PNL (profit per trade), total PNL (cumulative profit), and standard deviation (a measure of volatility).  More advanced calculations, such as the Sharpe Ratio and annualized Sharpe Ratio, assess risk-adjusted returns. Finally, you can see the certainty ratio, revealing the ratio of average wins to average losses, and an estimation of expected yearly returns. Note that any calculation that might result in an undefined value (like dividing by zero) will show up as null.

## Interface InfoErrorNotification

This notification lets you know about issues that pop up during background processes, but aren't critical enough to stop everything. Think of it as a heads-up about something that needs attention. Each notification has a unique ID so you can track it, plus a human-friendly message explaining what happened.  You’ll also find the full details of the error, including a stack trace and extra information, all packaged up for you. Importantly, these errors originate from the live trading context, so a flag confirms that.


## Interface IWalkerStrategyResult

This interface holds the results you get back after running a trading strategy within backtest-kit. Each strategy you test will produce a result that includes its name, a collection of statistical data describing its performance (like profit/loss, Sharpe ratio, etc.), and a specific metric value that’s used to compare it against other strategies.  The `rank` property then tells you how well that strategy performed relative to the others – the highest-performing strategy gets a rank of 1. Essentially, it packages all the key information about a single strategy's backtest run into one convenient object.

## Interface IWalkerSchema

The IWalkerSchema lets you set up A/B tests comparing different trading strategies within backtest-kit. Think of it as a blueprint for running experiments.

You give it a unique name to identify the test, and can add a note for yourself to remember what the test is for. It tells the system which exchange and timeframe to use for all the strategies involved, ensuring a level playing field. 

You specify which strategies you want to compare—those strategies need to have been registered with the framework beforehand.  You can also choose the metric you want to optimize, like Sharpe Ratio, although it defaults to that if you don't specify one. Finally, you can include optional callbacks to react to specific events during the testing process.

## Interface IWalkerResults

This interface holds all the information gathered after running a backtest comparison, essentially the final report card for your strategies. It tells you which asset, or "symbol," was being tested, and which "exchange" was used to get that data. You'll also find the name of the specific "walker" – the process that runs the backtests – and the "frame," which defines the time period and data frequency used in the analysis. Think of it as a container for the high-level details of a completed backtest run.

## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you hook into the backtest process to observe what's happening and potentially react to events. Think of it as a way to get notifications about the different stages of running your strategy comparisons.

You can be notified when a specific strategy begins testing (`onStrategyStart`), when a strategy’s backtest finishes successfully (`onStrategyComplete`), or if an error occurs during a backtest (`onStrategyError`). Finally, `onComplete` gets called once all strategies are done, providing you with the final results. These callbacks provide valuable insights and control during your backtesting workflow.

## Interface ITrailingTakeCommitRow

This interface describes a single step in a trading plan – specifically, a trailing take commit action. Think of it as a command to adjust a stop-loss order based on price movement. 

It tells the system to perform a "trailing-take" action, which means adjusting a take-profit order to follow the current price. You'll specify how much the price should shift (percentShift) to trigger this adjustment, and the interface also stores the initial price when the trailing order was established (currentPrice). This data allows the system to accurately calculate and manage the trailing take-profit levels.

## Interface ITrailingStopCommitRow

This interface represents a single action request queued for a trailing stop order. Think of it as a record of a change you want to make to a trailing stop, like adjusting its percentage shift or referencing the price it was set at. 

It essentially tells the system "perform a trailing stop adjustment" and provides the necessary details for that adjustment. The `action` property confirms this is a trailing stop-related request, `percentShift` specifies the percentage change to apply, and `currentPrice` gives context to the trailing stop's origin. 


## Interface IStrategyTickResultWaiting

This interface represents a tick result indicating a scheduled trading signal is currently waiting for the price to reach its entry point. It’s what you'll see repeatedly as the system monitors a signal you've set up. 

The `action` property simply confirms that the signal is in a "waiting" state. You'll also get information about the signal itself (`signal`), the current price being monitored (`currentPrice`), and details about the strategy, exchange, time frame, and trading pair involved (like `strategyName`, `exchangeName`, `frameName`, and `symbol`). 

Because the trade hasn’t actually happened yet, the progress towards take profit and stop loss (`percentTp`, `percentSl`) will always be zero. The `pnl` property shows an unrealized profit and loss calculation based on the current price, but this is theoretical until the trade is executed. A flag `backtest` tells you if this is happening in a simulated backtest or in live trading. Finally, `createdAt` provides a timestamp, helping you track the timing of events.

## Interface IStrategyTickResultScheduled

This interface describes what happens when your trading strategy generates a signal that's set to activate when the price hits a specific level. It's a notification that a signal has been scheduled and is patiently waiting for the price to reach the entry point you defined. 

The information included tells you exactly what strategy, exchange, timeframe, and symbol the signal relates to. You'll also find the price at the moment the signal was scheduled, whether it's a backtest or live trade, and a timestamp marking when this event occurred. This detailed data helps you monitor and understand your strategy’s behavior as it waits for those crucial price movements.

## Interface IStrategyTickResultOpened

This interface describes what happens when a new trading signal is generated and successfully created within the backtest-kit system. It's a notification that a signal has been born, validated, and saved.

You'll see key details included, like the name of the strategy that generated the signal, which exchange and timeframe it relates to, and the symbol being traded. The current price at the time the signal was opened is also provided.

Essentially, `IStrategyTickResultOpened` provides a record of a newly created signal, helping you understand exactly when and how a signal came into existence during either a backtest or live trading session. It includes a timestamp to indicate when the signal was created.

## Interface IStrategyTickResultIdle

This interface describes what happens when a trading strategy isn't actively signaling a trade – it's in an "idle" state. Think of it as a record showing the conditions when the strategy is waiting for a new trading opportunity. It captures essential details about this idle period, including the strategy's name, the exchange and timeframe being used, the trading pair, the current price, and whether it's a backtest or live trade. Importantly, the "signal" property is null, indicating there's no active trade instruction at that moment. It also includes a timestamp to precisely mark when this idle state occurred.

## Interface IStrategyTickResultClosed

This interface describes the data you receive when a trading signal is closed, providing a detailed snapshot of what happened. It includes all the necessary information to understand why the signal closed, the final price used for calculations, and the resulting profit or loss. You'll find details like the closing reason – whether it was a time expiry, a take-profit or stop-loss event, or a manual close – alongside timestamps for when the signal closed and when the result was created. 

The data also provides context, noting the strategy and exchange used, the timeframe, and whether the trade occurred during a backtest or in live trading.  If the signal was manually closed, a unique close ID is provided.  Critically, you get a complete `IPublicSignalRow` object representing the original signal parameters and a `IStrategyPnL` object breaking down the profit/loss calculation including fees and slippage.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a scheduled trading signal is cancelled – for example, if it doesn't trigger or hits a stop-loss before a trade can be opened. It provides a lot of information about *why* the signal was cancelled, like the reason for the cancellation.

You'll find details about the cancelled signal itself, including the price at the time of cancellation and a timestamp indicating precisely when it happened. It also keeps track of things like the strategy name, the exchange being used, and whether the event occurred during a backtest.

A unique ID is included if the cancellation was initiated by a user request to cancel a signal. Finally, there’s a timestamp noting when the cancellation record itself was created.

## Interface IStrategyTickResultActive

This interface represents a tick result in the backtest-kit framework, specifically when a signal is actively being monitored. It's used when the system is waiting for a take profit (TP), stop loss (SL), or time expiration event to occur.

The `action` property clearly identifies this as an "active" state. You'll find the details of the signal being monitored in the `signal` property, along with the `currentPrice` used for monitoring.

Important contextual information like the `strategyName`, `exchangeName`, `frameName`, and `symbol` are also included, allowing you to track the origin of the tick.

Progress towards TP and SL are indicated by `percentTp` and `percentSl`, respectively.  The `pnl` property provides the unrealized profit and loss for the active position, taking into account fees, slippage, and potential partial closes.  Knowing if the data is from a `backtest` or `live` environment is handled by the `backtest` boolean, and the `createdAt` timestamp marks precisely when the tick was generated.

## Interface IStrategySchema

This interface describes how you define a trading strategy within the backtest-kit framework. Think of it as the blueprint for how a strategy generates trading signals. 

Each strategy needs a unique name, and you can add a note for yourself to explain what it does.  The `interval` property lets you control how often the strategy attempts to generate a signal, preventing it from overwhelming the system.

The heart of the strategy is the `getSignal` function. This function is responsible for analyzing data and deciding whether to enter or exit a trade, and it returns a signal object if a trade is warranted, otherwise, nothing. You can even create signals that wait for a specific price to be reached.

You can also provide optional callbacks to be notified when a strategy opens or closes a position. Risk management is supported through `riskName` and `riskList` properties, letting you associate the strategy with specific risk profiles. Finally, `actions` allow you to attach identifiers to the strategy, useful for organization and tracking.

## Interface IStrategyResult

This interface, `IStrategyResult`, helps you organize and display the outcomes of your trading strategies. Think of it as a container for a single strategy's performance report. It holds the strategy’s name, a detailed set of statistics like profit/loss and drawdown, and a key metric value used to compare strategies against each other. This allows for clear comparison and ranking of different trading approaches within your backtesting framework. The metric value can be missing if the strategy's results were somehow invalid.

## Interface IStrategyPnL

This interface, `IStrategyPnL`, neatly packages up the results of a trading strategy's performance. It provides a clear picture of your profit and loss, taking into account realistic factors like trading fees and slippage. 

You'll find the profit/loss expressed as a percentage, making it easy to quickly compare different strategies. The interface also includes the entry and exit prices, but these are adjusted to reflect the impact of those fees and slippage. Finally, you can see the actual dollar amounts representing your profit/loss and the total capital invested.

## Interface IStrategyCallbacks

This interface lets you hook into key moments in your trading strategy's lifecycle. Think of it as a way to be notified and react to what’s happening with your signals.

You'll get notified on every tick of the market with `onTick`. Specific events like opening a signal (`onOpen`), actively monitoring a position (`onActive`), or being in a state where no signals are active (`onIdle`) all trigger corresponding callbacks. 

When a signal is closed, you'll receive a notification via `onClose`, and similar callbacks exist for scheduled signals (`onSchedule`, `onCancel`), allowing you to tailor your logic for delayed entries or cancellations.

There are also callbacks for when things get interesting—partial profits (`onPartialProfit`), partial losses (`onPartialLoss`), and reaching breakeven (`onBreakeven`). You can even track scheduled and active signals with `onSchedulePing` and `onActivePing` respectively, allowing for minute-by-minute checks and adjustments. Finally, `onWrite` is useful for persisting signal data during testing.

## Interface IStrategy

The `IStrategy` interface outlines the core methods any trading strategy built with this framework needs to implement. Think of it as the blueprint for how a strategy interacts with the system.

The `tick` method is the heart of the strategy – it's what runs on each market update, checking for signals and managing stop-loss/take-profit levels.  `getPendingSignal` and `getScheduledSignal` are internal helpers for monitoring existing orders and planned entries.

You can also ask the strategy questions: `getBreakeven` checks if you've covered transaction costs, and `getStopped` confirms if the strategy is still running. Several functions calculate details about your position, such as how much you've closed (`getTotalPercentClosed` and `getTotalCostClosed`), your average entry price (`getPositionAveragePrice`), and your profit/loss (`getPositionPnlPercent` and `getPositionPnlCost`).

For testing, there’s `backtest`, which lets you run the strategy on historical data. The `stopStrategy`, `cancelScheduled`, `activateScheduled`, and `closePending` methods provide ways to control a strategy's behavior.  You can also manually adjust the strategy using `partialProfit`, `trailingStop`, and `trailingTake`, after validating with their respective `validate...` functions.  Finally, `breakeven` automatically moves the stop-loss to the entry price under certain conditions, and `averageBuy` allows for adding more positions in a DCA style.  `hasPendingSignal` is a simple check for order existance and `dispose` cleans up resources when a strategy is no longer needed.

## Interface IStorageUtils

This interface outlines the core functions any storage system needs to have when working with backtest-kit. Think of it as a contract – any storage solution you use (like a database or file system) must provide these methods. It defines how the framework communicates events like signals being opened, closed, scheduled, or cancelled. You can also use it to retrieve individual signals by their unique ID or get a complete list of all stored signals. Essentially, this interface provides a standardized way to manage and access signal data within the backtesting process.

## Interface IStorageSignalRowScheduled

This interface defines a signal row specifically marked as "scheduled." It's a simple way to track signals that are planned for future execution. The core of this interface is the `status` property, which will always be set to "scheduled" to clearly indicate the signal's current state. This allows you to easily filter and manage signals based on their scheduling status within your backtesting system.

## Interface IStorageSignalRowOpened

This interface represents a signal that has been opened, meaning a trade has been initiated based on that signal. It's a simple record, confirming that the signal's status is currently "opened." Think of it as a confirmation that a trade is active, driven by this particular signal. This helps track the lifecycle of a signal within your trading system.

## Interface IStorageSignalRowClosed

This interface represents a signal that has been closed, meaning a trade associated with it has finished. 
It’s used to store information about signals that have a recorded profit and loss (PNL). 
Specifically, it includes a `status` property confirming the signal is "closed" and a `pnl` property containing the details of the profit or loss incurred during that trade. 
You'll find this useful when analyzing past performance and understanding the financial outcome of your trading signals.


## Interface IStorageSignalRowCancelled

This interface, `IStorageSignalRowCancelled`, represents a signal row that has been marked as cancelled. It's a simple way to track when a trading signal is no longer active or valid. 

The only piece of information it holds is the `status` property, which is always set to the string "cancelled" – indicating that the signal has been cancelled. This is a core element in backtest-kit for managing signal lifecycles within your trading strategies.

## Interface IStorageSignalRowBase

This interface, `IStorageSignalRowBase`, acts as a foundation for storing signal data, ensuring consistency across different signal statuses. It’s designed to hold the essential information needed to accurately record when a signal was created and last updated.  Each signal record will have a `createdAt` timestamp, reflecting when the signal was initially generated, and an `updatedAt` timestamp to track any subsequent modifications. A `priority` field is also included, dictating the order in which signals are processed – it’s essentially a timestamp to ensure correct sequencing, using the current time for both live and historical backtesting.

## Interface ISizingSchemaKelly

This defines how to size your trades using the Kelly Criterion, a strategy aiming to maximize long-term growth.  When implementing this, you’ll specify that the sizing method is "kelly-criterion."  The `kellyMultiplier` property controls how aggressively you apply the Kelly formula; a lower number, like the default 0.25, is a more conservative approach (often called "quarter Kelly"), while higher numbers risk greater volatility. This setting essentially scales down the Kelly Criterion's calculated bet size to manage risk.

## Interface ISizingSchemaFixedPercentage

This schema defines a trading strategy where the size of each trade is determined by a fixed percentage of your available capital. It's a straightforward approach, ensuring consistent risk exposure with each trade. 

The `method` property simply identifies this as a "fixed-percentage" sizing strategy. The `riskPercentage` property, expressed as a number between 0 and 100, dictates that percentage; for example, a `riskPercentage` of 10 means each trade will risk 10% of your capital. This helps you manage risk in a simple and predictable manner.

## Interface ISizingSchemaBase

This interface, `ISizingSchemaBase`, provides a foundation for defining how much of your trading account to allocate to each trade. Think of it as a blueprint for sizing strategies. It ensures each sizing configuration has a unique name and allows for optional notes to explain its purpose.  You can set limits on position size using percentages of your account balance, as well as minimum and maximum absolute sizes.  Finally, it allows for optional callbacks – functions that can be triggered at certain points in the sizing process.

## Interface ISizingSchemaATR

This schema defines how to size your trades based on the Average True Range (ATR), a volatility indicator. 

It ensures your trades are sized proportionally to the market's volatility.

You’ll specify a `riskPercentage` – the portion of your capital you’re comfortable risking on each trade, typically a small percentage like 1% or 2%. 

The `atrMultiplier` controls how the ATR value is used to determine the stop-loss distance, so a higher value will result in wider stops and potentially larger position sizes when volatility is high. Essentially, it helps adjust your trade size dynamically with market fluctuations.

## Interface ISizingParamsKelly

This interface defines the settings you’ll use when deciding how much to trade using the Kelly Criterion approach. It’s primarily used when setting up your trading strategy's sizing logic. You'll provide a logger object, which allows your strategy to output debugging information to help you understand how it’s making decisions. Think of the logger as a way to peek inside the strategy’s calculations.

## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed for determining how much of your capital to use for each trade when using a fixed percentage sizing strategy. It's primarily used when setting up a trading system.

Essentially, you'll provide a `logger` here—a tool that helps you track and debug what your backtest or live trading system is doing. This logger allows you to see how sizing decisions are being made.


## Interface ISizingParamsATR

This interface defines how to configure the size of trades when using an ATR-based sizing strategy. It's all about how much of your capital you'll commit to each trade. 

The `logger` property lets you hook up a logging service to track what's happening – useful for debugging and understanding how your sizing is working. Think of it as a way to monitor the decisions the sizing mechanism is making.

## Interface ISizingCallbacks

This section describes functions that let you tap into the sizing process within backtest-kit. Specifically, `onCalculate` allows you to observe and potentially adjust the size of a trade right after it's been determined. Think of it as a chance to check if the calculated size makes sense, or to record information about the sizing decision. You can use this to log the calculated quantity or perform validation checks to ensure it aligns with your strategy's rules.

## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate position sizes using the Kelly Criterion. It lets you specify how the sizing is done – in this case, using the Kelly Criterion method. You’ll also provide the win rate, expressed as a number between 0 and 1, and the average win-loss ratio to guide the sizing calculation. Essentially, it helps determine how much to invest based on the expected profitability of a trading strategy.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the information needed to calculate the size of a trade using a fixed percentage approach. Essentially, it tells the backtest kit how much of your capital to allocate based on a predetermined percentage tied to a specific stop-loss price.  You'll specify the sizing method as "fixed-percentage" and provide the price level at which your stop-loss order will be placed. This combination determines the trade size automatically.

## Interface ISizingCalculateParamsBase

This interface defines the basic information needed when figuring out how much to trade. It includes the symbol of the asset you're trading, like "BTCUSDT". You'll also need your current account balance, so the system knows how much money you have available. Finally, it specifies the price at which you're planning to enter the trade. This forms the foundation for all sizing calculations within the backtest-kit framework.

## Interface ISizingCalculateParamsATR

This interface defines the settings used when determining trade size based on the Average True Range (ATR). If you're using an ATR-based sizing strategy, you'll provide values conforming to this structure. It requires specifying that the sizing method is "atr-based" and then providing the current ATR value as a number. This ATR value is used to calculate the appropriate position size.

## Interface ISizing

The `ISizing` interface is all about figuring out how much of an asset your trading strategy should buy or sell. It's a key part of the backtest-kit framework, working behind the scenes to determine your position sizes. The core of this interface is the `calculate` function, which takes a set of parameters related to risk and returns the calculated position size as a number. Essentially, it's the engine that translates your risk preferences into concrete trading amounts.


## Interface ISignalRow

This interface, `ISignalRow`, represents a complete trading signal within the backtest-kit framework. Think of it as the finalized version of a signal after it’s been validated and prepared for execution. It holds all the crucial details needed to manage a trade, from its initial creation to potential partial closures.

Each signal gets a unique identifier (`id`) for tracking purposes.  You'll find information about the trade’s cost (`cost`), the price at which the position was opened (`priceOpen`), and identifiers for the exchange, strategy, and timeframe used (`exchangeName`, `strategyName`, `frameName`).  Timestamps (`scheduledAt`, `pendingAt`, `timestamp`) provide a record of when the signal was created, when it became active, and when it was initially processed.

The `symbol` field tells you what trading pair is involved (like "BTCUSDT"). A flag, `_isScheduled`, indicates if the signal was initially created as a scheduled order.

For more complex trades, the `_partial` array tracks any partial profits or losses taken during the position's life. This is important for calculating overall profit and loss.  Related computed values (`_tpClosed`, `_slClosed`, `_totalClosed`) simplify these calculations.

If a trailing stop-loss or take-profit is used, the `_trailingPriceStopLoss` and `_trailingPriceTakeProfit` properties store those dynamically adjusted prices, overriding the original target prices. This allows for more flexible profit and loss management.

Finally, `_entry` holds the history of any dollar-cost averaging (DCA) purchases, providing a detailed record of the entry prices.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, the kind you'd get when requesting a signal from the backtest-kit framework. Think of it as a structured way to communicate a trade idea. 

It includes essential details like the trade direction (long or short), a description of why you're taking the trade, the entry price, and where to set your take profit and stop loss orders. The framework automatically assigns a unique ID to each signal.

You'll also specify how long you anticipate the trade to last and the cost associated with entering the position. The cost can be customized, or it will default to a system-wide setting. It's designed to be validated and automatically prepared for use within the backtesting system.

## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, describes a signal that's waiting for a specific price to be reached before a trade is executed. Think of it as a signal that's put on hold – it's not acted upon immediately. 

It builds upon the basic `ISignalRow` and includes extra information about when the signal should become active.  Specifically, it waits for the market price to reach a target `priceOpen`.

Once the price hits that target, this `IScheduledSignalRow` transforms into a standard pending signal and the trading framework takes over.  A key element is tracking the time the signal was scheduled (`scheduledAt`) and how long it actually waited before activation, which is initially the same as the scheduled time but gets updated later. 

The `priceOpen` property defines the price level that must be reached for the signal to activate.


## Interface IScheduledSignalCancelRow

This interface represents a scheduled trading signal that might have been canceled by a user. It builds upon the standard scheduled signal information, adding a `cancelId` property.  This `cancelId` is specifically used to track signals that were canceled by the user, allowing you to identify and potentially manage those cancellations separately. If a signal wasn't canceled by the user, this property simply won't be present.

## Interface IRiskValidationPayload

This data structure holds all the information needed when you're checking if a trade makes sense from a risk perspective. It builds upon the basic trade details and adds in a broader picture of your portfolio.

You'll find the signal that triggered the potential trade, represented by `currentSignal`.  It includes details like the price at which the signal appeared.

It also provides information about your existing holdings, including the total number of open positions (`activePositionCount`) and a detailed list of those positions (`activePositions`). This lets you assess the impact of a new trade on your overall risk exposure.

## Interface IRiskValidationFn

This defines the structure for functions that check if a trade meets certain risk criteria. Think of it as a gatekeeper for your trades – it ensures they align with your pre-defined rules. If the function approves the trade, it simply does nothing or returns nothing. However, if it finds a problem, it either throws an error or provides a detailed explanation of why the trade is being rejected using a specific result object. This allows for clear communication about why a trade didn’t proceed.

## Interface IRiskValidation

This interface helps you define how to check if your trading risks are acceptable. Think of it as setting up rules to ensure your strategies don’t take on too much risk. 

It has two main parts: a `validate` function, which is the actual logic that performs the risk check; and a `note`, which is a helpful description to explain what the validation is doing and why. You can use the `note` to make it clear to others (or your future self!) what the validation is intended to achieve.

## Interface IRiskSignalRow

This interface, `IRiskSignalRow`, helps manage risk during trading by providing key price information. It builds upon the `ISignalDto` and adds details like the entry price (`priceOpen`) and the initially set stop-loss and take-profit prices (`originalPriceStopLoss`, `originalPriceTakeProfit`). These original values are particularly useful for validating risk parameters and ensuring positions are managed responsibly. Think of it as a record containing the crucial price points used when a trade was first initiated.

## Interface IRiskSchema

This defines a blueprint for creating and managing risk profiles within the backtest-kit framework. Think of it as a way to set up custom rules that govern how your portfolio behaves, preventing potentially harmful trades.

Each risk profile has a unique name to identify it, and you can add notes to explain its purpose.

You can also specify callbacks to be triggered at different points in the process, such as when a trade is initially rejected or when it’s ultimately allowed. 

The heart of the risk profile is the validations array, which holds the specific checks that will be performed before a trade executes. These validations can be functions or pre-defined objects, allowing you to tailor the risk controls to your exact needs.

## Interface IRiskRejectionResult

This interface, `IRiskRejectionResult`, helps you understand why a trading strategy’s risk validation failed. When your backtest encounters a problem during risk checks, this result object is provided to give you details. It includes a unique `id` to easily track the specific rejection and a `note`—a plain English explanation of what went wrong, making it simpler to debug and fix the issue.


## Interface IRiskParams

This interface, `IRiskParams`, is like a set of instructions for setting up the risk management part of the trading system. It tells the system where to send trade information (exchangeName), how to log any issues (logger), and whether it’s running a test or real trades (backtest).  

You can also provide a callback function, `onRejected`, to be notified when a trade is blocked due to risk rules. This function gives you details about the trade that was rejected and allows you to handle the rejection or send information elsewhere. Think of it as a way to get alerted when the system says "no" to a trade because of risk constraints.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, holds all the information needed to decide whether a new trade should be allowed. Think of it as a safety check performed before a trading signal is actually executed. It gathers details like the trading pair (`symbol`), the signal itself (`currentSignal`), and information about the strategy requesting the trade – things like its name (`strategyName`), which exchange it's using (`exchangeName`), the assigned risk profile (`riskName`), and the timeframe it's operating on (`frameName`). You also get the current price (`currentPrice`) and timestamp (`timestamp`) for context. Essentially, it's a bundle of necessary data for risk management to determine if a trade is permissible.

## Interface IRiskCallbacks

This interface defines optional functions you can use to get notified about risk-related events during your trading simulations.  You can provide `onRejected` to be informed when a trade signal is blocked because it exceeds defined risk limits, giving you a chance to react to those situations. Similarly, `onAllowed` lets you know when a signal successfully passes all risk checks and is considered safe to proceed with. These callbacks help you monitor and understand the impact of your risk management rules on your trading strategies.

## Interface IRiskActivePosition

This interface describes an active trade position, the kind of thing `ClientRisk` keeps track of to give you a broader view of your trading activities across different strategies. Each position has a name associated with the strategy that created it, as well as the exchange and frame it operates on. You’ll find the symbol being traded, whether it's a long or short position, and the key prices used to manage the trade: the entry price, stop-loss, and take-profit levels. 

Additionally, you'll see the estimated holding time and a timestamp marking when the position was initially opened. This information allows you to analyze positions holistically and understand how they interact within your overall trading system.

## Interface IRisk

This interface, `IRisk`, is all about keeping your trading strategy safe and within defined limits. It helps you monitor and control potential risks.

The `checkSignal` function is your gatekeeper - it examines incoming trading signals to make sure they align with your pre-set risk parameters. 

`addSignal` is used to record when a new position is opened, tracking its details like entry price, stop-loss, take-profit levels, and estimated holding time.

Finally, `removeSignal` allows you to clear a record of a position once it's closed, keeping your risk tracking accurate and up-to-date.


## Interface IReportTarget

This interface lets you fine-tune what data gets logged during your backtesting process. Think of it as a checklist for different types of events you want to track. You can selectively enable logging for things like strategy actions, risk rejections, breakeven points, partial closes, and even performance metrics. It's designed to help you focus on the specific areas you’re investigating and keep your logs manageable. By toggling these boolean flags, you control exactly what information is included in your JSONL event logs.

## Interface IReportDumpOptions

This interface, `IReportDumpOptions`, helps you organize and filter the data generated during backtesting. Think of it as a set of labels you apply to your backtest results. It lets you specify things like the trading pair being used (e.g., BTCUSDT), the name of the strategy, the exchange involved, the timeframe of the data, and even a unique identifier for the signal that triggered a trade. By providing these details, you can easily sort, search, and analyze your backtest reports later on. It's particularly useful when you're running multiple strategies or backtests simultaneously and need a way to keep everything straight.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, is designed to provide a clear view of a trading signal's key details, especially regarding stop-loss and take-profit levels. It builds upon a base signal row to expose the original stop-loss and take-profit prices that were initially set. Even if your trading strategy uses trailing stop-loss or take-profit adjustments, these original values remain visible, allowing for better transparency and understanding of how the signal was initially configured.

Think of it as a snapshot of the signal's parameters at its creation, preserved for informational purposes.

Here's a breakdown of what you'll find in this interface:

*   **Cost:** The initial cost of getting into the position.
*   **originalPriceStopLoss:** The initial stop-loss price you set.
*   **originalPriceTakeProfit:** The initial take-profit price you set.
*   **partialExecuted:** A percentage representing how much of the position has been closed through partial trades.
*   **totalEntries:** The number of times you've added to the position (useful for understanding dollar-cost averaging).
*   **totalPartials:** The number of times you've taken partial profits or losses.
*   **originalPriceOpen:** The original entry price, unaffected by any averaging that may have occurred.
*   **pnl:** The unrealized profit or loss on the position at the time the signal was generated.

## Interface IPublicCandleData

This interface, `IPublicCandleData`, represents a single candlestick, a common way to visualize price movements over time.  Each candlestick contains information about a specific period. 

You'll find the exact time the candle started recorded as a timestamp in milliseconds. It also includes the opening price, the highest price reached, the lowest price touched, the closing price, and the trading volume for that time frame. Essentially, it's a snapshot of price activity.

## Interface IPositionSizeKellyParams

The `IPositionSizeKellyParams` interface defines the settings you’ll use when calculating your position size based on the Kelly Criterion. It’s all about balancing risk and reward. You’ll provide two key pieces of information: your win rate, which represents the percentage of trades you expect to be profitable, and your average win/loss ratio, which tells us how much you typically win compared to how much you lose on each trade. These values will help the framework determine an appropriate bet size to maximize long-term growth.

## Interface IPositionSizeFixedPercentageParams

This interface defines the parameters needed for a trading strategy that uses a fixed percentage of your capital for each trade, and includes a stop-loss price. Specifically, you'll use this to tell the backtest system what price you want to set as the stop-loss for your trades. It's a simple way to manage risk by automatically adjusting your position size based on a percentage and a defined stop-loss level.

## Interface IPositionSizeATRParams

This interface defines the settings needed for calculating position size based on the Average True Range (ATR). 

It's used when you want to determine how much of an asset to trade, using the ATR to gauge volatility.

The `atr` property simply represents the current ATR value that's being used in the calculation.


## Interface IPersistBase

This interface lays out the basic building blocks for how your custom storage systems interact with backtest-kit. Think of it as a contract – if you build a way to store data (like in a database or a file), you need to implement these methods.

The `waitForInit` method is a one-time setup that initializes things and makes sure everything is in order when your storage system starts. `readValue` is how you retrieve data, and `hasValue` is a quick check to see if something exists. You’ll use `writeValue` to save data, ensuring a safe and reliable process. Finally, `keys` provides a way to get a list of all the items you have stored, sorted in a predictable order, which is helpful for managing and verifying your data.


## Interface IPartialProfitCommitRow

This interface describes a single instruction for taking a partial profit in your backtest. Think of it as one step in a plan to gradually close out a position. It tells the backtest system exactly how much of the position to close—defined by the `percentToClose` property—and at what price the action was performed, recorded in `currentPrice`. The `action` property is a key identifier, always set to "partial-profit," ensuring the system recognizes this as a profit-taking instruction.

## Interface IPartialLossCommitRow

This interface represents a single instruction to partially close a position within the backtest. Think of it as a row in a queue telling the system to sell a certain percentage of your holdings. 

It includes details like confirming that it's a "partial-loss" action, the percentage of the position you want to close (e.g., 50% to sell half), and the price at which that partial sale was executed. This information is crucial for accurately reconstructing the trading process during a backtest.

## Interface IPartialData

This interface, `IPartialData`, is designed to help save and load data related to a trading signal. Think of it as a snapshot of important information, specifically the profit and loss levels that have been hit.  Because some data structures can't be directly saved, it transforms sets of profit and loss levels into simple arrays. This allows the data to be stored and later reconstructed when the system starts up again, turning the saved arrays back into the complete picture. It's essentially a streamlined way to keep track of progress for each trading signal.

## Interface IPartial

The `IPartial` interface helps keep track of how well or poorly trading signals are performing. It focuses on recognizing key milestones, like when a signal hits 10%, 20%, or 30% profit or loss.

When a signal is doing well (making money), the `profit` method is used to check if it’s hit any of those milestones and to announce them. The same goes for the `loss` method when a signal is losing money, marking those loss percentages.

Finally, when a signal finishes – whether it’s hit a target price, a stop-loss, or its time has expired – the `clear` method cleans up the tracking data, removes it from memory, and saves the changes. This ensures the system is ready for the next signal.

## Interface IParseArgsResult

The `IParseArgsResult` interface describes what you get back when you use the `parseArgs` function to process command-line arguments. It essentially combines your initial arguments with flags that determine the trading environment. You'll see properties indicating whether the system should run in backtest mode, which simulates trading using historical data, paper trading mode, which mimics real trading with live data, or live trading mode, which involves actual trading with real funds. This helps control how your trading strategies are executed.

## Interface IParseArgsParams

This interface describes the information needed to run a trading strategy from the command line. Think of it as a blueprint for how to tell the backtest-kit what to do. It specifies essential details like which cryptocurrency pair you want to trade ("BTCUSDT" for example), the name of the strategy you’ll be using, which exchange you're connecting to ("binance" or "bybit"), and the timeframe for analyzing price data ("1h" for one-hour candles). Essentially, it provides the defaults to kickstart the backtesting process.


## Interface IOrderBookData

This interface defines the structure of order book data you'll receive. It represents a snapshot of the bids and asks available for a specific trading pair.  The `symbol` property tells you which trading pair the data applies to.  The `bids` property is an array of buy orders, and `asks` is an array of sell orders, each containing details about the price and quantity available. Essentially, it's the raw information about what buyers and sellers are offering.

## Interface INotificationUtils

This interface defines how different components can report events and errors related to a trading strategy's backtesting process. Think of it as a central hub for communication; various parts of the backtest kit can use these methods to send updates about what's happening, such as when a trade is opened or closed, or when a partial profit target is reached. You can also use these methods to report errors or validation failures. The `getData` method allows you to retrieve a list of all notifications that have been generated, and `clear` lets you reset the notification history. Essentially, it provides a standard way for the backtest kit to keep you informed and troubleshoot any issues.


## Interface IMethodContext

The `IMethodContext` interface helps your backtesting code know which specific configurations to use. Think of it as a little messenger, carrying information about the strategy, exchange, and frame you're currently working with. It contains the names of these configurations, allowing the system to automatically load the right pieces for your backtest without you having to manually specify them everywhere. If you're running a live simulation, the frame name will be empty, indicating that.

## Interface IMarkdownTarget

This interface lets you fine-tune which reports are generated by the backtest-kit framework, giving you control over the level of detail in your analysis. Think of it as a way to pick and choose which aspects of your trading strategy you want to closely examine. You can enable reports for things like strategy signals, risk rejections, breakeven points, partial fills, portfolio heatmaps, strategy comparisons, performance bottlenecks, scheduled signals, live trading events, or even a comprehensive backtest report with full trade history.  By toggling these boolean properties, you can focus on the areas most important to understanding and optimizing your trading system.

## Interface IMarkdownDumpOptions

This interface, `IMarkdownDumpOptions`, helps you organize and filter data when generating reports or documentation. Think of it as a container for details like where a file should be saved, what it should be named, and what specific trading information it relates to. You'll find properties here like the trading symbol (e.g., BTCUSDT), the name of the strategy used, the exchange involved, and the timeframe being analyzed.  It's useful for pinpointing exactly which data a particular report represents and ensuring it's stored in the correct location. The path specifies where to save the output, and the file property sets the filename.

## Interface ILogger

The `ILogger` interface provides a way for different parts of the backtest-kit framework to record information about what's happening. Think of it as a central place to keep track of events, from general activity to detailed debugging information.

You can use the `log` method to record important events like agent execution or data updates. If you need to see really detailed information for troubleshooting, the `debug` method is your friend, capturing things like the intermediate steps of a tool call. `info` messages are for higher-level updates and confirmations, like successful policy validations. Finally, `warn` messages highlight potential issues that don't stop things from working, but should be investigated. 


## Interface ILogEntry

This interface describes a single log entry within the backtest-kit framework. Each log entry has a unique identifier and a level, categorized as "log," "debug," "info," or "warn," allowing for different levels of detail. 

A priority value, based on the current time, helps manage log storage and rotation. 

The `createdAt` and `timestamp` properties offer timestamps for improved user experience and accurate tracking. 

Optionally, `methodContext` and `executionContext` properties provide deeper insight into where the log originated and the environment in which it was generated.  Finally, a `topic` identifies the specific area of code generating the log, and `args` holds any additional data passed along with it.

## Interface ILog

The `ILog` interface provides a way to keep track of what's happening during your backtesting sessions and review it later. It’s like having a detailed record of all the decisions and events that occurred.

The `getList` method is your window into this record; it allows you to retrieve all the logged entries as a list, so you can examine them to understand the sequence of trades and other actions. Think of it as downloading the complete history of your backtest.


## Interface IHeatmapRow

This interface represents a row in the portfolio heatmap, providing a snapshot of performance for a specific trading pair, like BTCUSDT. It gathers key statistics from all strategies applied to that pair, giving you a clear picture of its overall health.

You’ll find metrics like total profit and loss percentage, a Sharpe Ratio to assess risk-adjusted returns, and the maximum drawdown, which shows the biggest potential loss.  The data also includes the total number of trades, the breakdown of winning and losing trades, and the win rate.

Further insights are provided through average profit and loss per trade, standard deviation, profit factor, and average win/loss amounts. You can also examine streaks of wins and losses and calculate expectancy which reflects the average profit/loss expected per trade.  Essentially, this interface condenses a lot of trading information into a single, easy-to-understand package for each symbol.

## Interface IFrameSchema

This interface, `IFrameschema`, helps you define and register specific periods of time for your backtesting simulations. Think of it as setting up the boundaries of your test – when it starts, when it ends, and how frequently data points are generated within that timeframe. Each frame has a unique name for easy identification, and you can add a note for your own reference.

You specify the interval (like daily, weekly, or minute-by-minute) and the exact start and end dates for the backtest period.  It’s also possible to attach optional lifecycle callbacks to a frame, allowing you to perform actions at certain points during the backtesting process. Essentially, `IFrameschema` is all about precisely controlling the temporal aspects of your backtest.

## Interface IFrameParams

The `IFrameParams` interface defines the information needed to set up a core processing unit within the backtest-kit framework. Think of it as the blueprint for creating a self-contained environment where your trading strategies can be tested. 

It builds upon `IFrameSchema`, which provides the basic structure, and adds a `logger` property. This logger allows the system to record diagnostic information during the backtesting process, helping you understand what's happening and debug any issues. It's essentially a way to keep an eye on the inner workings of your backtest.

## Interface IFrameCallbacks

The `IFrameCallbacks` interface lets you hook into important moments in the backtest process, specifically when timeframes are created. You can use the `onTimeframe` function to receive details about the generated timeframes, including the start and end dates, and the interval used. This is handy if you want to keep a record of these timeframes, or even double-check that they’ve been created correctly.


## Interface IFrame

The `IFrame` interface is a key component that helps backtest-kit generate the timeline of data it uses for testing trading strategies. Think of it as the system responsible for creating the calendar of dates that your backtest will run against. Specifically, `getTimeframe` is the method you'd use to request a list of timestamps for a particular trading symbol and timeframe – for example, you could ask for all the daily timestamps for Bitcoin.  These timestamps are calculated based on the interval you've set up for your backtest, ensuring a consistent spacing between each data point.

## Interface IExecutionContext

The `IExecutionContext` provides the necessary information for your trading strategies and exchanges to function correctly. Think of it as a container holding key details about the current moment in time during a trade. It tells your strategy what trading pair it's working with (like "BTCUSDT"), precisely when the action is happening (the timestamp), and crucially, whether it's a simulation (backtest) or a live trade. This context is automatically passed around by the framework, so you don't have to manually manage it – it's always available when you need it for tasks like fetching historical data or handling price updates.

## Interface IExchangeSchema

This interface, `IExchangeSchema`, is how you tell backtest-kit where to get your trading data and how to handle the specifics of a particular exchange. It's essentially a blueprint for connecting to an exchange’s data.

You’ll provide a unique identifier for the exchange through `exchangeName`.  `note` allows you to add some extra documentation or notes for yourself.

The most important part is `getCandles`, which defines how the framework retrieves historical price data – you'll need to provide a function that fetches candles for a given symbol, time interval, and date range.  `formatQuantity` and `formatPrice` are useful for making sure order sizes and prices are formatted correctly according to the exchange's rules; otherwise, default formatting similar to Bitcoin on Binance is used.

There are also optional functions for fetching order book data (`getOrderBook`) and aggregated trade data (`getAggregatedTrades`), and you can attach optional lifecycle callbacks with `callbacks`.

## Interface IExchangeParams

This interface defines the essential configuration needed to connect your backtest-kit strategy to an exchange. Think of it as the blueprint for how your strategy interacts with a data source and simulates trading. 

It requires you to provide functions for retrieving historical candle data, formatting trade quantities and prices to match the exchange's rules, fetching order book information, and getting aggregated trade data.  Each function is crucial for accurately simulating trading conditions and ensuring your backtest results are realistic.  You'll also provide a logger for debugging and an execution context which contains information like the trading symbol and timestamp. Remember that most methods within this interface have default implementations but must be supplied to ensure proper initialization.

## Interface IExchangeCallbacks

This interface lets you define functions that your backtest kit application can use to react to incoming data from an exchange. Specifically, `onCandleData` is triggered whenever the system pulls candlestick data—think of it as getting batches of historical price information. You can use this callback to perform actions like logging the data, validating it, or even triggering custom calculations based on the new candle information. The function receives details like the trading symbol, the time interval of the candles (e.g., 1 minute, 1 hour), the start date for the data, how many candles were requested, and the actual candle data itself. Providing a promise-returning function for `onCandleData` allows for asynchronous operations within your callback.

## Interface IExchange

The `IExchange` interface defines how backtest-kit interacts with different cryptocurrency exchanges. It gives you access to historical and future price data, allowing you to recreate trading scenarios. You can request candle data, which are snapshots of price movements over specific time intervals, to analyze past performance or anticipate future trends. 

The interface also provides functions for formatting trade quantities and prices to match the exchange's requirements. It can calculate the VWAP (Volume Weighted Average Price), a common indicator used by traders.  

You can retrieve order book data to understand the current market depth and aggregated trade data to see recent trading activity. Finally, `getRawCandles` offers a powerful way to fetch candles with custom date ranges and limits, ensuring you stay within the constraints of the backtesting environment and avoid looking into the future.

## Interface IEntity

This interface, `IEntity`, serves as the foundation for all data objects that are saved and retrieved within the backtest-kit framework. Think of it as a common starting point, guaranteeing that every persistent object has a unique identifier. It ensures a consistent structure for managing data throughout the backtesting process, providing a reliable base for more specialized entity types.

## Interface ICommitRowBase

This interface, `ICommitRowBase`, acts as a foundation for events related to committing data, often used to ensure things happen at the right time during trading processes. It’s designed to hold basic information about each commit. 

Every commit event will have a `symbol` property, which simply tells you what trading pair the commit pertains to – like "BTC-USDT". You’ll also find a `backtest` property; this boolean value indicates whether the commit occurred during a backtesting simulation rather than a live trade.

## Interface ICheckCandlesParams

This interface defines the information needed to check if the timestamps of your saved candle data are correct. It's used when you want to ensure your historical data is consistent and reliable. 

You'll provide details like the trading symbol (like "BTCUSDT"), the exchange you're using, the time interval of the candles (like "1m" for one-minute candles), and the date range you want to check.  Finally, you specify the location where your candle data is stored on your system; if you don't specify it, the framework assumes a default location.

## Interface ICandleData

This interface represents a single candlestick, the basic building block for analyzing price data. Each candlestick holds information about a specific time interval, giving you the open, high, low, and close prices, along with the volume traded during that time. The `timestamp` tells you precisely when that candle's period began, measured in milliseconds since the Unix epoch. Think of it as a snapshot of price action and trading activity over a given timeframe – perfect for building and testing trading strategies.

## Interface ICacheCandlesParams

This interface defines the information needed to pre-load historical price data, also known as candles, into a persistent storage system.  Think of it as a blueprint for requesting a specific chunk of past trading data.  You'll specify the trading pair (like BTCUSDT), the exchange providing the data, the timeframe of the candles (e.g., 1-minute, 4-hour), and the start and end dates you want to cover.  This pre-loading step speeds up backtesting because the data is readily available instead of needing to be downloaded repeatedly during the backtest process.

## Interface IBroker

The `IBroker` interface defines the communication layer between your trading strategies and the underlying broker. It's essentially how your strategies tell the broker what actions to take, like opening positions, closing trades, or adjusting stop-loss orders.

The `waitForInit` method is a crucial starting point - it ensures everything is properly set up and ready to go before your trading logic begins.

You'll use the `onSignalOpenCommit`, `onSignalCloseCommit`, `onPartialProfitCommit`, `onPartialLossCommit`, `onTrailingStopCommit`, `onTrailingTakeCommit`, `onBreakevenCommit`, and `onAverageBuyCommit` methods to send instructions to the broker for different trade management events. Each of these functions receives a payload containing the specific details of the action required, allowing for precise control over your trading operations. Think of them as dedicated channels for instructing the broker to execute your intended trading maneuvers.

## Interface IBreakevenData

This interface, `IBreakevenData`, is all about saving and loading breakeven information for your trading strategies. Think of it as a simplified snapshot of your breakeven state – specifically, whether or not the breakeven point has been hit. It's designed to be easily stored, for example, in a database or file, and later restored to a full trading system. The `reached` property simply indicates if the breakeven target has been achieved.

## Interface IBreakevenCommitRow

This interface represents a record of a breakeven commitment that's been queued up within the backtest. It essentially tracks a situation where a trade's breakeven point has been adjusted. 

The `action` property always indicates that this record specifically relates to a "breakeven" adjustment. The `currentPrice` property stores the price level at which the breakeven point was last set – this is the price that matters when calculating the new breakeven. Think of it as a snapshot of the price at the time of the breakeven modification.

## Interface IBreakeven

This interface handles tracking when a trading signal's stop-loss order should be adjusted to the entry price, essentially reaching a breakeven point. It's used by systems that manage trading strategies and connections.

The `check` method determines if breakeven conditions are met, considering things like whether breakeven has already been reached, if the price has moved enough to cover trading fees, and if the stop-loss can realistically be moved to the entry price. When all those requirements are satisfied, it marks breakeven as achieved and notifies related systems.

The `clear` method resets the breakeven tracking when a signal’s trade is finished – whether it hits a take profit, stop loss, or expiration time. This ensures the tracking is cleaned up and any temporary data is released.

## Interface IBidData

This interface, `IBidData`, represents a single bid or ask found within an order book. It's essentially a snapshot of a specific price level and how much of an asset is being offered or wanted at that price. Each `IBidData` object tells you the `price` at which someone is willing to buy or sell, and the `quantity` of the asset available at that price – both of which are provided as strings. You'll encounter this data structure when working with order book information within the backtest-kit framework.


## Interface IAverageBuyCommitRow

This interface describes a single step in a queued average-buy, or DCA, process. Each entry represents a purchase at a specific price and cost.  The `action` property identifies it as an average-buy action.  `currentPrice` tells you the price the purchase was made at, while `cost` indicates how much that purchase cost in US dollars. Finally, `totalEntries` keeps track of the total number of purchases made in the DCA strategy up to that point.

## Interface IAggregatedTradeData

IAggregatedTradeData holds information about a single trade, providing key details for analyzing trading activity and building backtests. Each trade record includes a unique identifier, the price at which it happened, the quantity exchanged, and the exact time of the trade. Importantly, it also tells you whether the buyer or seller initiated the trade as the market maker, giving you clues about the trade's direction and the order flow. This data allows you to understand trading patterns and evaluate strategies more effectively.


## Interface IActivateScheduledCommitRow

This interface represents a message placed in a queue to trigger the activation of a scheduled commit. It's used internally to tell the system to start the process of activating a previously planned commit. 

The `action` property always indicates that this is an "activate-scheduled" operation.  Each message includes a `signalId`, which identifies the specific signal that is being activated. An `activateId` is sometimes provided, allowing users to directly initiate an activation if needed.

## Interface IActionSchema

This defines the blueprint for custom actions you can add to your backtesting strategies. Think of actions as hooks that allow you to inject your own logic into the trading process. They let you do things like manage state, log events, send notifications, or track analytics – essentially, anything you need to extend the strategy's functionality.

Each action is given a unique name for identification. You can also add a note to explain what the action does.

The core of an action is its handler, which is a constructor that gets called for each strategy run. It provides access to all the events happening during the backtest. 

Finally, you can optionally define callbacks to control when the action is initialized and how it interacts with the strategy's lifecycle. These callbacks give you fine-grained control over how and when your custom logic executes.

## Interface IActionParams

The `IActionParams` interface holds all the information an action needs to function correctly within the backtest-kit framework. Think of it as a package of essential details passed to your actions when they're executed. 

It bundles together things like a logger to help you track what's happening, the name of the strategy and timeframe the action belongs to, and even whether the action is running as part of a backtest. This includes details like which exchange is being used and if the execution is happening in a backtesting environment. Having these details readily available simplifies action development and ensures consistency across different execution environments.

## Interface IActionCallbacks

This interface provides a way to hook into different stages of an action handler's lifecycle and receive notifications about various events. Think of it as a set of customizable event listeners that allow you to extend the framework's behavior.

You can use the `onInit` callback to perform setup tasks like connecting to a database or loading saved data when a new action handler is created. Conversely, `onDispose` is for cleanup – closing connections, saving data, and releasing resources when the handler is no longer needed.

Several `onSignal...` callbacks keep you informed about market activity: `onSignal` provides general signal information, while `onSignalLive` and `onSignalBacktest` are specific to live trading and backtesting modes respectively. There are also callbacks for tracking breakeven points (`onBreakevenAvailable`), partial profits/losses (`onPartialProfitAvailable`, `onPartialLossAvailable`), and monitoring pending signals (`onPingScheduled`, `onPingActive`).

Finally, `onRiskRejection` alerts you when a signal is blocked by risk management, and `onSignalSync` gives you a chance to control the framework's actions when using limit orders – returning `false` will reject the order and trigger a retry.

## Interface IAction

This interface, `IAction`, is your central point for connecting custom logic to the backtest-kit framework. Think of it as a way to tap into the core events happening during strategy execution, whether it’s a backtest or live trading.

It provides a series of methods, each responding to a specific type of event, such as when a signal is generated, a breakeven level is hit, or a partial profit/loss is triggered. You can use these methods to build things like custom dashboards, logging systems, or even tie your strategy’s actions into a state management library like Redux or Zustand.

There are separate methods for signals occurring in live versus backtest modes, giving you fine-grained control.  The `dispose` method is crucial; it's your opportunity to clean up any resources you've used within your custom handlers, ensuring a clean shutdown.  Be especially mindful of the `signalSync` method - any errors thrown here will directly propagate and might require retries, so handle them carefully.

## Interface HeatmapStatisticsModel

This structure organizes the overall performance metrics for your portfolio's heatmap. It gives you a snapshot of how all your investments are doing together.

You'll find a list of individual symbol statistics within the `symbols` array, allowing you to drill down into the performance of each asset. Alongside that, you get key portfolio-level figures like the total number of symbols held (`totalSymbols`), the overall profit/loss (`portfolioTotalPnl`), the risk-adjusted return measured by Sharpe Ratio (`portfolioSharpeRatio`), and the total number of trades executed (`portfolioTotalTrades`). This provides a complete view of your portfolio's trading activity and profitability.


## Interface DoneContract

This interface signals when a background task finishes, whether it's a backtest or a live trading session. When a background process completes – like a backtest run or a live execution – this `DoneContract` object is provided with key information. You'll find details like the exchange used, the name of the trading strategy, and whether it was a backtest or live execution. It also includes the trading symbol involved, such as "BTCUSDT". This lets you track and react to the completion of your automated trading processes.

## Interface CriticalErrorNotification

This notification signals a really serious problem within the backtest-kit framework – something has gone wrong that needs to shut down the process. Each critical error notification has a unique ID to help track it down. You'll also get a clear, human-readable message explaining what happened, along with details about the error itself including a stack trace and any extra information. It's important to note that these errors always originate from the live environment and never during the backtesting process itself.

## Interface ColumnModel

This interface, `ColumnModel`, is all about how to display data in a table. Think of it as a blueprint for defining a single column – it tells the backtest-kit framework exactly what data to show and how to present it. 

Each column needs a unique identifier, which we call `key`. There’s also a user-friendly `label` that will appear as the column header in the table.

The real magic happens with the `format` property. This is a function you provide that takes the raw data and transforms it into a string ready for display. You can use this to control how numbers, dates, or any other data type looks.

Finally, `isVisible` gives you the ability to conditionally show or hide a column based on certain conditions, making your tables dynamic and focused.

## Interface ClosePendingCommit

This event signals that a previously submitted signal for a trade has been closed. 

It's useful for tracking and auditing trade closures within your backtesting strategy.

The `action` property confirms this is a "close-pending" event.  You can optionally provide a `closeId` to give a more descriptive reason for the closure, which can be helpful for analysis. Finally, the `pnl` property provides the profit and loss information calculated at the time the trade was closed.

## Interface CancelScheduledCommit

This interface lets you cancel a previously scheduled signal event, which is helpful when you need to adjust or retract an action that was planned for a later time. To use it, you specify that the action is a "cancel-scheduled" event. You can optionally include a `cancelId` to provide a reason for the cancellation, which can be useful for tracking and debugging. Finally, you also include the unrealized Profit & Loss (PNL) at the time the event was scheduled, giving context to the cancellation.

## Interface BreakevenStatisticsModel

This model helps you understand how often your trading strategy hits breakeven points. It collects data from every time your strategy reaches a breakeven state, giving you a detailed list of those events. You’ll find a count of the total number of times breakeven was achieved, and a comprehensive list outlining each individual breakeven event with all its related information. This information is valuable for analyzing your strategy's performance and identifying potential areas for improvement related to breakeven behavior.

## Interface BreakevenEvent

The BreakevenEvent provides a consistent record of when a trading signal has reached its breakeven point. It bundles together all the key details you'd need to understand this event, making it easier to generate reports and analyze performance.  You'll find information like the exact timestamp, the trading symbol involved, the name of the strategy used, and the unique identifier of the signal. 

It also includes critical pricing data: the entry price where the trade began, the take profit and stop loss levels (both as they are now and as they were initially set), and the current market price at the moment breakeven was achieved.  If a dollar-cost averaging (DCA) strategy was used, the total number of entries and the original entry price before averaging are also included.

Furthermore, the event details the number of partial closes executed, the total percentage executed, the unrealized profit and loss (PNL) at breakeven, a human-readable note explaining the signal's reasoning, and timestamps indicating when the position became active and when the signal was originally created. Finally, a flag identifies whether the trade occurred during a backtest or in live trading conditions.

## Interface BreakevenContract

This interface represents a breakeven event within the trading framework. It's triggered when a signal's stop-loss is moved back to the original entry price, signifying a reduction in risk. Think of it as a notification that the trade has become cost-neutral.

Each breakeven event contains details like the trading symbol, the strategy's name, the exchange being used, and the timeframe it occurred in. You’ll also find the original signal data, the current price at the time of the event, whether it came from a backtest or live trade, and a timestamp for precise tracking. This information is valuable for monitoring strategy performance and generating reports. The system ensures these events are only recorded once per signal to avoid duplicates.

## Interface BreakevenCommitNotification

This notification is triggered whenever a strategy reaches a breakeven point and takes action. It provides a detailed snapshot of the trade at that moment, which is useful for analyzing strategy performance and understanding how trades are being managed. The notification includes key information like the trade's symbol, the strategy that generated the signal, and the exchange where it executed.

You'll find details about the entry and exit prices, stop-loss and take-profit levels (both original and adjusted), and the number of entries and partial closes involved, especially important if the strategy uses averaging or partial exits.  It also contains comprehensive profit and loss data, including percentages and absolute values, and timestamps detailing the signal's lifecycle – from initial creation to its pending and eventual execution. This allows you to track the entire trade history and evaluate its impact.

## Interface BreakevenCommit

The BreakevenCommit represents an event triggered when a backtest strategy adjusts a trade to breakeven. It signals that the strategy is essentially resetting the trade's profit target and stop-loss to the current market price. 

This event contains crucial details about the trade at the time of the adjustment, including the current market price, the strategy's profit and loss, and whether the trade is a long (buy) or short (sell) position. You'll also find the original entry price, the take profit and stop loss prices before any trailing adjustments, and timestamps indicating when the signal was created and the position was activated. Having all this information helps you understand exactly when and why the strategy chose to move the trade to breakeven.

## Interface BreakevenAvailableNotification

This notification signals that your trade's stop-loss can now be adjusted to the entry price, effectively reaching breakeven. It's a helpful indicator that your trade has moved favorably.

The notification includes a unique identifier, the timestamp of when this event occurred, and whether it's from a backtest or live trading environment. You'll find details specific to the trade, like the trading pair (e.g., BTCUSDT), the strategy that generated the signal, and the exchange it’s on. 

It also provides key pricing information: the current market price, the original entry price, and any adjusted take profit and stop-loss prices.  You can see the total number of DCA entries and partial closes that have been executed.

The notification also offers insights into your trade's performance, including profit and loss data in both absolute and percentage terms, along with timestamps related to the signal's lifecycle. This comprehensive data gives you a clear picture of your position and its progress.

## Interface BacktestStatisticsModel

This model gives you a complete picture of how your trading strategy performed during a backtest. It holds all the important statistical information, like the number of trades won and lost, and the total profit or loss generated.

You'll find detailed data on each individual trade within the `signalList`, which includes things like price movements and profit/loss values.

Several key metrics are provided to assess performance, including win rate, average profit per trade, and overall cumulative profit.  You'll also see volatility measures like standard deviation and the Sharpe Ratio, which helps to understand risk-adjusted returns.  The certainty ratio indicates how much better your winning trades were compared to your losing ones, and expected yearly returns provides an annualized view of your strategy’s potential. If any calculation results in an unsafe value like infinity, the corresponding property will be null.

## Interface AverageBuyCommitNotification

This notification lets you know when a new averaging (DCA) buy order has been executed as part of a larger strategy. It's triggered whenever a position's averaging entry point is adjusted.

The notification includes a unique identifier, a timestamp indicating when the buy occurred, and whether it happened during a backtest or live trading. You'll find details about the trade itself, such as the trading pair symbol, the strategy that generated the signal, and the exchange used.

It also provides key pricing information like the execution price, the cost of the buy, and the resulting effective entry price after the averaging adjustment. You can track how many total averaging entries have been made and any partial closes that might have occurred. 

Furthermore, the notification gives you a snapshot of the position’s key parameters – original entry price, take profit, and stop loss levels – alongside profit and loss data, including PNL in USD and as a percentage. Finally, it provides timestamps for when the signal was initially created and when the position became active, giving you a complete picture of the DCA process.

## Interface AverageBuyCommit

This event signals a new addition to a position using a dollar-cost averaging (DCA) strategy. It’s triggered whenever your strategy buys more of an asset to lower the average entry price. You'll find details like the price at which the new buy occurred, the total cost of that buy, and how it impacts your overall average entry price.

The event also includes information about your unrealized profit and loss, the trade's direction (long or short), and the original entry price you initially used when first opening the position. You'll also see the current take profit and stop loss levels, along with their original values before any trailing adjustments were made. Finally, it contains timestamps indicating when the signal was generated and when the position was activated.

## Interface ActivePingContract

The ActivePingContract represents updates you receive while a trading signal is still active and being monitored. It’s like a heartbeat signal letting you know the signal hasn't been closed yet.  You can subscribe to these updates to build custom logic, such as adjusting risk parameters or dynamically managing your strategies. 

Each ping includes key details like the trading symbol (e.g., BTCUSDT), the name of the strategy using it, and the exchange it's on. You also get the full signal data, containing all the information about the signal itself, like entry price and stop-loss levels. A flag indicates whether the ping originated from a backtest (historical data) or live trading. Finally, a timestamp shows precisely when the ping occurred, reflecting either the current time in live mode or the candle timestamp during a backtest.

## Interface ActivateScheduledCommitNotification

This notification lets you know when a scheduled trading signal has been activated, meaning a trade has begun. It's triggered when a user manually starts a signal without waiting for the price to reach a specific level. 

The notification provides a wealth of information about the trade, including a unique identifier, the exact time it was activated, and whether it's happening in a backtest or live environment. You’ll also find details like the trading pair, the strategy that generated the signal, and the exchange it's running on.

It details the specifics of the trade itself - the direction (long or short), the entry price, take profit and stop-loss levels, and the number of DCA entries or partial closes. Crucially, it includes P&L information, letting you track the performance of the trade from the very beginning, plus the original prices set when the signal was initially created. You can also see when the signal was originally scheduled and when it transitioned to a pending state. Finally, it gives you the current market price and the notification creation timestamp.

## Interface ActivateScheduledCommit

This interface describes the data needed to activate a trading signal that was previously scheduled. Think of it as the system confirming and executing a pre-planned trade. It includes important details like the current market price, the entry price for the trade (priceOpen), and the initial take profit and stop loss prices, as well as the original values before any adjustments were made. You'll also find information about the trade’s direction (long or short), when the signal was initially created (scheduledAt), and when the position is now being activated (pendingAt).  An optional `activateId` allows you to tag the activation with a user-provided identifier for tracking or reference. Finally, the system provides the current Profit and Loss (PNL) at the moment of activation.
