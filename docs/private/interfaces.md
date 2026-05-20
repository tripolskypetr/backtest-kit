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

This interface describes the notifications you receive when a walker needs to be stopped. It's used when you want to pause or halt a trading strategy that's currently running.

The notification includes important details like the trading symbol involved (e.g., BTCUSDT), the specific name of the strategy you're stopping, and the name of the walker that initiated the stop.

This is particularly useful if you’re running several walkers, each with different strategies, on the same trading symbol and need to selectively halt specific ones. It lets you target precisely which trading activity should be paused.


## Interface WalkerStatisticsModel

The WalkerStatisticsModel provides a way to easily understand and work with the results of your backtesting simulations. It combines the standard Walker results with extra information that lets you compare different strategies against each other. Essentially, it’s a collection of results for each strategy you tested, allowing for easy analysis and comparison of their performance. You'll find an array of strategy results, each containing details about a specific strategy's performance during the backtest.

## Interface WalkerContract

The WalkerContract represents updates as your backtesting process runs, specifically when a strategy finishes being tested. It provides information about the strategy’s performance and its place in the current rankings.

You'll get these updates as each strategy completes, including details like the walker's name, the exchange and frame involved, the symbol being traded, and the name of the strategy itself. 

The contract also gives you important statistics about the backtest, including a value for the metric being optimized, the best metric value seen so far, the name of the best performing strategy, and the overall progress of the testing – how many strategies have been tested and the total number to be tested. If a strategy's performance isn't valid, you'll get a null metric value.

## Interface WalkerCompleteContract

This object signifies the conclusion of a backtesting process within the backtest-kit framework. It's generated once all the different trading strategies have been run and evaluated. 

It bundles together a comprehensive set of information, letting you see the overall results of the backtest. 

You'll find details about the specific walker (the testing process), the trading symbol being tested, the exchange and timeframe used.

Crucially, it tells you which metric was used to judge the strategies, how many strategies were tested in total, and identifies the single best-performing strategy. 

Alongside this, it provides the actual metric value achieved by the top strategy and provides detailed statistics about that strategy's performance.

## Interface ValidationErrorNotification

This notification signals that a validation error occurred during the backtesting process. 

It’s triggered when risk validation functions encounter problems, essentially telling you something went wrong with your rules or constraints. 

Each notification has a unique ID for tracking and a descriptive message to help pinpoint the issue. 

You'll also find details about the error itself, including a stack trace, making debugging easier. 

The `backtest` property will always be false because these errors originate from the live trading context, not directly from the backtest simulation.


## Interface ValidateArgs

This interface, `ValidateArgs`, helps ensure that the names you're using for different parts of your backtesting setup are correct. Think of it as a way to double-check things like your exchange names, timeframes, strategies, risk profiles, and the ways you're handling actions, sizing trades, and parameter sweeps. 

Each property in the interface represents a specific category—ExchangeName, FrameName, StrategyName, and so on—and expects a type `T` that will be validated against a list of allowed values. Essentially, it's a safeguard to prevent errors caused by typos or incorrect names when setting up your backtests. It makes sure you're referring to the proper entities within the backtest-kit framework.

## Interface TrailingTakeCommitNotification

This notification signals that a trailing take profit order has been executed. It provides a wealth of information about the trade, including a unique identifier, when it happened, and whether it occurred during a backtest or live trading.

You’ll find details about the trading pair, the strategy involved, and the exchange where the trade took place, along with a unique signal ID. It also includes details about the price shifts, current market price, and the trade direction (long or short).

The notification also contains critical data points like the original and adjusted take profit and stop-loss prices, entry price, and details about any DCA averaging or partial closes. 

Beyond just the trade mechanics, you'll receive a complete picture of the position's performance with metrics like total profit and loss (P&L), peak profit, maximum drawdown, and entry/exit prices, all calculated with considerations for slippage and fees. There are also details around the signal’s creation and pending times, plus an optional note to explain the reason behind the signal.

## Interface TrailingTakeCommit

This interface describes an event that occurs when a trailing take profit order is triggered. It provides detailed information about the trade and the adjustments made to the take profit and stop loss levels. You'll find key details like the current market price, the direction of the trade (long or short), and the original take profit and stop loss prices set when the position was initially opened.

The event also includes performance metrics for the position, such as realized profit and loss (PNL), the peak profit achieved, and the maximum drawdown experienced.

The `priceTakeProfit` and `priceStopLoss` properties reflect the updated values after any trailing adjustments have been applied.  Finally, timestamps related to when the signal was created and the position was activated are also provided for tracking purposes.

## Interface TrailingStopCommitNotification

This notification tells you when a trailing stop order has been triggered and executed. It provides a wealth of detail about the trade, including whether it happened during a backtest or live trading, the trading pair involved, and the strategy that generated the signal. You'll find information about the original and adjusted stop-loss and take-profit prices, as well as details about any averaging or partial closing of the position.

The notification also includes comprehensive profit and loss (PNL) data, showing peak profit, maximum drawdown, and key prices related to those metrics.  You'll see figures like total invested capital, costs, and percentages, helping you understand the trade's overall performance. Finally, it includes timestamps related to signal creation and execution, alongside an optional note offering further context for the trade.

## Interface TrailingStopCommit

This describes a trailing stop event, which occurs when a trailing stop-loss order is triggered during a trade. It details the specific circumstances surrounding that event.

The `action` property simply identifies this as a trailing stop event. The `percentShift` tells you how much the stop-loss price was adjusted based on the trailing strategy.

You'll also find key price information including the `currentPrice` at the time of the adjustment, and the `priceOpen` at which the position was initially entered.

Crucially, it provides data on the trade's performance: the `pnl` (profit and loss), `peakProfit` achieved, and `maxDrawdown` experienced.

The `position` indicates whether it’s a long (buy) or short (sell) trade, while `priceTakeProfit` and `priceStopLoss` show the current, adjusted prices for taking profits and limiting losses. The original prices, `originalPriceTakeProfit` and `originalPriceStopLoss`, are also available to see what the prices were before any trailing adjustments.

Finally, timestamps—`scheduledAt` and `pendingAt`—provide a record of when the signal was created and when the position activated.

## Interface TickEvent

This interface, `TickEvent`, provides a standardized way to represent all types of events occurring during trading activity. It acts as a central container for all relevant data related to a tick, regardless of whether it's a scheduled order, an opened or closed position, or a cancellation. The `timestamp` property records precisely when the event occurred, while the `action` property clearly identifies the type of event that transpired.

The `symbol` indicates the trading pair involved, and for signals, properties like `signalId`, `position`, and `note` provide further context. Pricing information is included via `currentPrice` and, for specific actions like opening or closing, related prices like `priceOpen`, `priceTakeProfit`, and `priceStopLoss`.

DCA (Dollar-Cost Averaging) strategies are supported through the `totalEntries` and `totalPartials` properties. Additionally, information about unrealized and realized profit/loss (`pnlCost`, `pnl`), progress towards take profit/stop loss (`percentTp`, `percentSl`), and reasons for closure or cancellation (`closeReason`, `cancelReason`) are all readily available within this single object. Historical performance data like peak and fall PNL is also included for closed positions. The `pendingAt` and `scheduledAt` fields denote the exact moments when a position became active or a signal was initially created.

## Interface SyncStatisticsModel

This model gives you a clear picture of what's happening with your signal synchronization events. It collects data about those events and organizes them for easy understanding.

You'll find a detailed list of every sync event that occurred, letting you examine them individually.

The model also provides overall summaries: the total number of sync events, how many times signals were opened, and how many times they were closed. This helps you monitor the flow of your signals and identify any potential issues.


## Interface SyncEvent

This data structure holds all the key details about what happened during a trading signal’s lifecycle, making it easy to create clear reports. It combines information like when the event occurred (timestamp), the trading pair (symbol), the strategy used, and even the exchange involved.

You'll find information about the signal itself, including its unique ID and the action taken (like opening or closing a position). Crucially, it contains the entry price, take profit levels, stop loss levels, and how these prices may have been adjusted.

The `SyncEvent` also tracks the overall performance of a trade, providing the total profit and loss (pnl), peak profit, and maximum drawdown. It includes details about any DCA averaging that took place and whether this is a backtest event. Finally, the `createdAt` field stores the time when the event was logged.

## Interface StrategyStatisticsModel

This model holds the statistical data collected during a backtest run, giving you insights into how your strategy behaved. It essentially summarizes the actions your strategy took. 

You'll find a detailed list of every event the strategy generated, along with the total count of all events.

Specific counts are provided for various order types: cancellations, pending closures, partial profits and losses, trailing stop adjustments, trailing take adjustments, breakeven orders, scheduled activations, and average buy (DCA) orders. This allows for a granular view of your strategy’s activity.

## Interface StrategyEvent

This `StrategyEvent` provides a standardized way to track what's happening during your trading strategy's execution, whether you're backtesting or live trading. It bundles together all the key details of a strategy action, making it easy to generate reports and understand the sequence of events.

Each event includes things like the exact time it occurred, the trading pair involved, the strategy's name, and the exchange being used. It also captures the signal that triggered the action, the type of action taken (like buying, selling, or modifying a stop-loss), and the current market price at that moment.

For actions involving profit taking or loss cutting, you'll find details on the percentage used. Events can also hold information about scheduled actions, like IDs for canceling or closing positions, along with creation timestamps.

Backtesting mode is indicated and the trade direction (long or short) is noted. Importantly, it holds information about entry prices, take profit and stop-loss levels, and original values before trailing adjustments.

For strategies using dollar-cost averaging (DCA), you'll see details like the effective average entry price and the number of entries made. The P&L at the moment of the action, along with any associated costs and optional notes, are also included for a complete picture of the trade.

## Interface SignalSyncOpenNotification

This notification tells you when a scheduled order (like a limit order) has been activated and a position has been opened. It provides a wealth of detail about the trade, including when it happened, the trading pair involved, and whether it was triggered in backtest or live mode. You'll find information about the signal itself, like its unique ID and creation timestamp, as well as crucial performance metrics like profit/loss, peak profit, and maximum drawdown, giving you a comprehensive view of the position’s early performance. The notification also details the original and adjusted prices for entry, stop-loss, and take-profit, alongside the number of entries and partials executed. Finally, you can access a free-text note explaining the reason behind the signal if one was provided.

## Interface SignalSyncCloseNotification

This notification tells you when a trading signal has been closed, whether it's from a backtest or live trading. It provides a wealth of information about the closed position, including the unique identifier of the signal, the time it was closed, and if it was part of a backtest.

You'll find details on the trading activity, like the strategy used, the exchange, and the trading pair. It also offers a complete picture of the position's performance, including profit and loss (both absolute and percentage), peak profit, and maximum drawdown figures, along with the prices and entry counts associated with each.

The notification outlines the specifics of the trade, such as the trade direction (long or short), entry and exit prices, and the original take profit and stop loss levels before any adjustments. It also captures information related to any DCA averaging or partial closes that occurred. Finally, timestamps mark when the signal was created and when the position was activated and closed, and a reason explains *why* the signal closed.

## Interface SignalSyncBase

This interface defines the common information found in all signal synchronization events within the backtest-kit framework. Think of it as the foundation for how signals are communicated and tracked.

It includes details like the trading symbol (e.g., BTCUSDT), the name of the strategy that generated the signal, and the exchange where the trade is taking place.  You'll also find whether the event is part of a backtest or live trading scenario, a unique ID for the signal itself, and a timestamp marking when the signal occurred.  Finally, it provides access to the complete details of the public signal data at the time of the event.

## Interface SignalScheduledNotification

This notification tells you when a trading signal has been planned for future execution. It’s like a heads-up that a trade is about to happen, but not right now. You’ll get this notification when a strategy decides to place a trade at a specific time in the future.

The notification includes a lot of details about the upcoming trade. You’ll see the unique identifier for this scheduled signal, the exact time it's been set to execute, and whether it's part of a backtest or a live trade. It also specifies the trading pair (like BTCUSDT), which strategy created the signal, and the exchange where the trade will happen.

You’ll find details about the trade itself: its direction (long or short), the intended entry price, profit target, and stop-loss levels. It also includes information on how the signal was crafted, like original prices before trailing stop adjustments.

Beyond just the trade specifics, the notification provides performance metrics like potential profit and loss (both in USD and percentage), peak profit achieved, and maximum drawdown experienced. You’ll even see data like the total capital invested and the number of entries made. Finally, it tells you *when* the signal was scheduled and the current market price at that time, along with an optional note to explain the reasoning behind the signal.

## Interface SignalOpenedNotification

This notification tells you when a new trade has been opened. It's fired whenever a position is initiated, whether it’s part of a backtest or a live trading scenario.

The notification includes a lot of detailed information about the trade, such as a unique ID, the exact time it was opened, and whether it's a long or short position. You’ll also find the entry price, take profit and stop-loss levels, as well as details about any averaging or partial closing strategies used.

It also provides crucial performance metrics about the trade, including profit/loss, peak profit achieved, and the maximum drawdown experienced – along with the prices and costs associated with those points.  A human-readable note can also be included to provide context behind the trade. Finally, timestamps related to signal creation, pending, and creation of this notification are all recorded.

## Interface SignalOpenContract

This event signals that a trading signal has been activated, meaning a limit order you set has been filled by the exchange. Think of it as confirmation that your order went through.

It's particularly useful for synchronizing with external systems that manage orders, or for keeping a detailed record of your trading activity. 

The event provides a wealth of information about the trade, including the price at which the order was filled, the current market price, and performance metrics like profit and loss, peak profit, and maximum drawdown. You'll also find details about the original order parameters, like take profit and stop loss prices, as well as the timestamp when the signal was initially created and when it was activated. The event also describes if any DCA averaging or partial closes were performed.



Essentially, it’s a comprehensive snapshot of a newly opened position.

## Interface SignalInfoNotification

This notification type signals that a trading strategy has broadcasted a custom informational message related to an active trade. Think of it as a way for strategies to provide extra context or details about a position beyond just the basic trade information.

Each notification includes details such as when it happened, the trading symbol involved, the strategy responsible, and the exchange used. You'll find key data points about the trade itself – the entry price, take profit levels, stop loss levels, and the trade direction (long or short).

Beyond the core trade details, you get a comprehensive financial snapshot including profit/loss calculations (both absolute and percentage), peak profit metrics (price, cost, percentage), and drawdown metrics (price, cost, percentage) – all tracked throughout the position's lifetime.  It also provides details about any DCA averaging or partial closures that have occurred.  Finally, a user-defined note allows strategies to communicate custom messages to users. There are also fields for tracking scheduling and creation timestamps, which can be helpful for debugging or integration purposes.

## Interface SignalInfoContract

This component helps strategies send out custom information during trading. Think of it as a way to log specific events, send notifications, or add extra details about a trade.

When a strategy wants to broadcast something—like a debug message or a custom signal—it uses this system. The `signalNotifySubject` then pushes out an event containing all the important information.

The event includes details like the trading pair (symbol), the name of the strategy that generated it, the exchange and frame it's running on, and the full signal data.  You’ll also find the current market price, a note you can add to the event, and an optional ID to link it to external systems. A flag indicates whether the event came from a backtest (historical data) or live trading. Finally, a timestamp helps track exactly when the event occurred.


## Interface SignalData$1

This data structure holds the details of a completed trading signal, perfect for analyzing performance. Each signal is linked to a specific strategy and has a unique identifier. You’ll find the symbol being traded, whether the position was long or short, and the percentage profit or loss (PNL) achieved. Knowing why the signal closed and the precise timestamps of when it opened and closed provides crucial context for evaluating its effectiveness. It’s essentially a snapshot of a single trade's journey.


## Interface SignalCommitBase

This defines the fundamental information shared by all signal commitment events within the backtest-kit framework. Every signal event, whether generated during a backtest or in a live trading environment, will include details like the trading pair's symbol, the name of the strategy that produced it, and the exchange used. You’ll also find information about the timeframe involved (only relevant in backtesting), a flag to indicate whether it's a backtest event, and a unique identifier for the signal itself.

Furthermore, the data includes the timestamp related to when the signal was generated, a count of DCA entries and partial closes, the original entry price before any averaging, the signal's data at the time, and an optional note field for adding a custom description or explanation of the signal. These properties provide a comprehensive overview of the signal’s context and execution.

## Interface SignalClosedNotification

This notification tells you when a trading position has been closed, whether it was a stop-loss or take-profit trigger, or some other reason. It provides a wealth of information about the trade, including a unique identifier, the timestamp of the close, and whether it occurred during backtesting or live trading. You’ll find details about the symbol, the strategy that initiated the trade, and key prices like the entry and exit points, as well as original and adjusted stop-loss/take-profit levels.

The notification also outlines the trading history, giving you the number of entries used in the strategy and any partial closes that occurred. Performance metrics are included, such as profit/loss, peak profit, and maximum drawdown, all presented as both percentages and in absolute dollar values.  You'll also receive specific price and entry data used to calculate the PnL, along with timings of when the position became pending and when the signal itself was created. Finally, a note field allows for any specific reason for the closure to be provided.

## Interface SignalCloseContract

This event, `SignalCloseContract`, is triggered whenever a trading signal is closed, whether it's due to hitting a profit target, a stop-loss, time expiration, or manual intervention. It's designed for external systems that need to keep track of trades, like order management platforms or audit logs.

The event provides detailed information about the closed position, including the current market price, the overall profit and loss (PNL), the highest profit achieved, the maximum drawdown experienced, and whether the trade was a long (buy) or short (sell) position. You’ll also find the original and effective prices for entry, take profit, and stop loss, allowing you to understand how trailing stops or dollar-cost averaging (DCA) might have adjusted those levels.

It also includes information about when the signal was initially created and when the position was activated, along with the reason for the close. Lastly, it reports the number of initial entries and partial closes that occurred during the position's life, providing a complete picture of the trade's history.

## Interface SignalCancelledNotification

This notification type indicates that a signal that was scheduled for execution was cancelled before it could be activated. It provides detailed information about the cancelled signal, helping you understand why it didn't execute. 

You’ll find key details like the unique identifier of the signal, the trading symbol it related to, and the strategy that generated it. The notification also includes specifics about the intended trade, such as the planned entry price, take profit, and stop-loss levels, and crucially, *why* the signal was cancelled, whether it was due to a timeout, price rejection, or a manual cancellation. 

Additional information like the signal's creation timestamp, pending time, and any notes associated with it are also included to give a complete picture of the cancelled event. The presence of properties like `originalPriceTakeProfit` and `totalEntries` highlights that this notification also covers signals utilizing DCA (dollar-cost averaging) strategies.

## Interface Signal

This `Signal` object keeps track of a single trading position's details as it evolves. 

It contains the opening price of the trade (`priceOpen`), allowing you to reference the initial entry point.

The `_entry` array stores a history of when the position was initially entered, including the price, associated costs, and the timestamp.

You'll also find the `_partial` array which records any partial profit or loss adjustments made during the position's lifetime, noting the type of adjustment (profit or loss), percentage change, current price, cost basis at the time of the adjustment, the number of shares held, and the timestamp.


## Interface Signal$2

This `Signal` object represents a trading signal within the backtest-kit framework. It holds key information about a trade, primarily focused on the entry details.

The `priceOpen` property stores the price at which the position was initially opened.

Internally, the `_entry` array keeps track of the specifics of each entry made within a signal, including the entry price, transaction cost, and timestamp. 

Similarly, `_partial` records any partial exits from the position, specifying whether they were profit or loss events, the percentage of the position exited, the price at the time of exit, the cost basis at the time of closure, the number of shares/contracts at the time of closure, and the timestamp.

## Interface Signal$1

This `Signal` object represents a trading signal and holds crucial information about a position. It includes the `priceOpen`, which is the price at which the position was initially entered.

The `_entry` property is an array storing details of each entry made into the position, recording the price, cost, and timestamp of each entry.

Similarly, `_partial` is an array keeping track of partial exits from the position, noting the exit type (profit or loss), the percentage of the position exited, the current price, the cost basis at the time of the exit, the number of shares/contracts exited, and the corresponding timestamp.

## Interface ScheduledEvent

This data structure, `ScheduledEvent`, gathers all the key information about trading events – when they were scheduled, opened, or cancelled. It’s designed to provide a complete picture for generating reports and understanding how your trading strategy performed.

Each event is identified by a timestamp, and categorized by its action type (opened, scheduled, or cancelled). You'll find details like the trading symbol, a unique signal ID, and the position type involved.

The structure also includes pricing details like the entry price, take profit, and stop loss levels, both as initially set and as they were modified. For strategies that use DCA (dollar-cost averaging), it tracks the number of entries and partial closes.

If a signal is cancelled, you’ll find reasons for the cancellation (like timeout, price rejection, or user action) and a cancellation ID for user-initiated cancellations. The duration of the event and the time when the position became active are also recorded. Finally, it includes current market price and unrealized P&L at the time of the event.

## Interface ScheduleStatisticsModel

This model gives you a snapshot of how your scheduled signals are performing. It collects data on all the events – when signals are scheduled, activated, or cancelled – providing key insights into their lifecycle.

You can see the complete history of scheduled events through the `eventList` property. The model also offers totals: the overall number of events, signals that were scheduled, signals that were activated, and signals that were cancelled.

Beyond the totals, it highlights important performance indicators. The `cancellationRate` tells you how frequently scheduled signals are being cancelled, while `activationRate` shows how often they’re leading to trades. Finally, it provides averages for how long signals waited before cancellation (`avgWaitTime`) and activation (`avgActivationTime`), helping you identify potential delays or inefficiencies in your scheduling process.

## Interface SchedulePingContract

This interface represents a regular update you receive while a trading signal is actively being monitored. It’s designed to help you keep track of what's happening with your signals and build custom checks.

Each update contains important details like the trading pair (symbol), the name of the trading strategy involved, and the exchange being used. You also get the full details of the signal itself, including its original price, take profit, and stop loss levels.

A key piece of information is the `currentPrice`, which lets you implement custom logic – for instance, automatically canceling a signal if the price moves too far from where it started. The `backtest` flag tells you if the ping comes from a historical simulation or a live trading scenario. Finally, a timestamp indicates when the ping occurred, reflecting either the live ping time or the candle timestamp during backtesting.

You can subscribe to these updates using `listenSchedulePing()` or `listenSchedulePingOnce()`.

## Interface RiskStatisticsModel

This model holds statistics about risk events, helping you understand and monitor your risk management processes. 

It contains a detailed list of all risk rejection events, giving you access to the specifics of each instance.

You'll also find a count of the total number of risk rejections, allowing you to quickly grasp the overall scale of these events.

The data is further organized to show how rejections are distributed across different trading symbols and strategies, revealing potential areas of focus for improvement.


## Interface RiskRejectionNotification

This notification informs you when a trading signal was blocked by your risk management rules. It provides details about the rejected signal, including a unique identifier and the timestamp of when it happened. You'll find information about whether this rejection occurred during a backtest or live trading, which exchange was involved, and the name of the strategy that generated the signal.

The notification also explains why the signal was rejected with a human-readable note and an optional specific rejection ID for tracking. It offers insights into your trading situation at the time, like the number of active positions, the current market price, and the trade direction (long or short). 

If a signal was pending, its unique ID is included, along with the proposed entry price, take profit target, and stop-loss levels. Furthermore, it contains an optional note describing the signal and the creation timestamp of the notification itself.

## Interface RiskEvent

The `RiskEvent` data structure holds information about situations where trading signals were blocked due to risk management rules. It's essentially a record of a signal that couldn't be executed.

Each `RiskEvent` includes details such as the exact time the event occurred, the trading pair involved (symbol), and the specifics of the signal that was rejected.  You’ll also find the name of the strategy and exchange, the time frame used, and the current market price.

To aid in debugging and analysis, the event contains the number of open positions at the time of rejection, a unique identifier for the rejection itself, and a description of why the signal was rejected. A flag indicates whether the event originated from a backtest simulation or a live trading environment.


## Interface RiskContract

The RiskContract provides information about signals that were blocked due to risk validation. It's a record of when the trading system decided a signal shouldn't be executed because it exceeded predefined risk limits.

You can think of it as a log of near misses – signals that *would* have resulted in a trade, but were stopped by the risk management system.

Each RiskContract contains details about the rejected signal, including which trading pair (symbol) it involved, the specifics of the proposed trade (price, position size, etc.), and which strategy requested the trade.

You’ll also find information like the current market price at the time of rejection, the number of existing positions, and a unique ID for tracking this specific event. A human-readable explanation of *why* the signal was rejected is also included. Finally, it indicates whether the rejection happened during a backtest or a live trading session.

These records are used for generating reports and allow users to monitor risk management in action – seeing exactly when and why signals are being rejected.

## Interface ProgressWalkerContract

This contract describes the updates you'll receive as a background task, like processing trading strategies, runs its course. 

It tells you which walker is running, what exchange and frame it's using, and what symbol it's focused on.

You'll also get the total number of strategies being processed, how many have already been handled, and a percentage indicating how far along the process is. This allows you to monitor the progress of longer operations.

## Interface ProgressBacktestContract

This contract provides a way to monitor the progress of a backtest as it runs. It's used when you're running a backtest in the background and want to know how far along it is. You'll receive updates containing the exchange name, the strategy being tested, the trading symbol, the total number of data points (frames) the backtest will use, and how many frames have already been processed.  The progress is reported as a percentage, ranging from 0.0 (beginning) to 1.0 (complete). This lets you track the backtest's status and estimate its remaining duration.


## Interface PerformanceStatisticsModel

This model holds performance data collected from a trading strategy, giving you a complete picture of how it performed. 

It includes the name of the strategy being evaluated.

You'll also find the total number of performance events and the overall time it took to run these performance checks.

The `metricStats` property organizes performance data by the type of metric being tracked, allowing for a more detailed analysis.

Finally, the `events` array contains all the raw performance data points, providing the most granular level of information.

## Interface PerformanceContract

The PerformanceContract helps you keep track of how your trading strategies are performing. It's like a detailed log of what's happening during execution, letting you see how long different parts of the process take.

Each entry in this log, called a "contract," records things like when an event happened, when the previous event occurred (if there was one), and what type of action was being performed.

You'll also find information about which strategy, exchange, and trading symbol were involved, as well as whether the activity occurred during a backtest or live trading. These details enable you to pinpoint areas that might be slow or inefficient, and improve overall performance.

## Interface PartialStatisticsModel

This data model holds information about partial profit and loss events during a trading backtest. It essentially summarizes the results of milestones reached during trading.

You'll find a detailed list of all the events that occurred, including specifics for each one. 

It also provides the total count of all events, the number of profitable trades, and the number of losing trades, giving you a quick overview of the performance.

## Interface PartialProfitContract

The `PartialProfitContract` represents a notification that a trading strategy has reached a predefined profit level, like 10%, 20%, or 30% gain. It's a way to keep track of how a strategy is performing and to potentially trigger actions based on those milestones.

This notification includes key details like the trading symbol, the name of the strategy being used, the exchange and frame involved, and the complete data associated with the original signal. You’ll also find the current price when the level was hit, the specific profit level achieved, and whether the event originated from a backtest or live trading.

The timestamp indicates precisely when this profit level was recognized – either the time of the tick during live trading or the timestamp of the historical candle in a backtest.  The system ensures each level is only reported once for a given signal, even if prices fluctuate rapidly. Services like the PartialMarkdownService use this information to generate performance reports, and you can use it with callbacks to monitor your strategy's progress.

## Interface PartialProfitCommitNotification

This notification tells you when a partial profit has been taken on a trade. It provides a wealth of information about the trade, including its unique identifier, the time it occurred, and whether it happened during a backtest or live trading.

You'll find details like the trading pair (e.g., BTCUSDT), the strategy that triggered the action, and the exchange where the trade took place. Crucially, it includes data related to the position itself – whether it was a long or short trade – and the entry price.

The notification also offers a comprehensive snapshot of the position’s performance, including peak profit, maximum drawdown, and the profit/loss in both percentage and absolute dollar terms.  You can also see the original prices and any adjustments made due to trailing stop-loss or take-profit orders.  Finally, there's a field for an optional note, which can provide a human-readable explanation for why the partial profit was taken.


## Interface PartialProfitCommit

This event signifies a partial profit-taking action within a trading strategy. It details the specifics of how much of the position is being closed, represented as a percentage. Crucially, the event includes information about the current market price at the time the action occurred, as well as a comprehensive performance snapshot of the position.

You'll find data related to the overall profit and loss (pnl), the highest profit achieved (peakProfit), and the largest drawdown experienced by the position. It also provides details about the original and adjusted take profit and stop loss levels, along with the entry price.

Timestamp information is included to track when the signal was created (scheduledAt) and when the position was initially activated (pendingAt). This allows for precise analysis and auditing of the strategy's actions and performance.

## Interface PartialProfitAvailableNotification

This notification signals that your trading strategy has reached a predefined profit milestone, like 10%, 20%, or 30% gain. It’s a way to track your progress and understand how your strategy is performing. The notification includes details like a unique ID, a timestamp, and whether it originated from a backtest or live trade. You'll also find information about the trading pair, the strategy used, and the exchange involved, along with specifics about the trade, such as the entry price, take profit, stop loss levels, and total number of entries and partial closes.

It also provides key performance indicators (KPIs) like total profit and loss (PNL), peak profit, maximum drawdown, and associated prices and percentages – giving a comprehensive snapshot of the position's health. A 'note' field is also available for a custom explanation of the signal, and several timestamps detail the signal's creation and execution timeline.

## Interface PartialLossContract

The PartialLossContract represents events when a trading strategy hits a predefined loss level, like -10%, -20%, or -30% drawdown. It's a way to keep track of how much a strategy is losing and when those loss milestones are reached.

These events are triggered once for each loss level per trading signal, and you might receive multiple events in a single update if the price moves significantly.

The information included in the event tells you *what* symbol, strategy, and exchange it relates to, along with the current price, the specific loss level reached (e.g., -20%), and whether it’s a backtest or live trade. You also get the original signal data and the timestamp of when the loss level was detected. Think of it as a detailed log of a strategy’s progress, particularly when things aren’t going as planned.

## Interface PartialLossCommitNotification

This notification tells you when a portion of a trading position has been closed. It's like a detailed report card for a partial exit from a trade.

Each notification has a unique ID and timestamp, and it tells you if it’s from a live trade or a backtest. You'll see the trading pair involved (like BTCUSDT), the name of the strategy that triggered the action, and the exchange where it happened.

It includes a wealth of information about the trade, such as the original entry price, take profit and stop-loss levels, how much of the position was closed (as a percentage), and the current market price at the time of the partial closure.

You'll also find performance metrics like total profit/loss, peak profit achieved, maximum drawdown experienced, and various price levels associated with these key events.  Details regarding DCA entries and partial closes are available.

Finally, the notification includes an optional note field for a human-readable explanation of the trade's reasoning, and creation timestamps for signal scheduling and position activation.

## Interface PartialLossCommit

This describes a partial loss event that occurred during a trading strategy’s execution. It represents a situation where only a portion of an existing position is closed, rather than the entire position.

The `action` property confirms this is a partial loss.  You'll also find details about the percentage of the position that was closed (`percentToClose`). 

The event includes key price data like the `currentPrice` at the time of the action, as well as the overall profit and loss (`pnl`) of the position being closed.  Performance metrics like `peakProfit` and `maxDrawdown`, reflecting the position's historical performance, are also provided. 

The `position` property clarifies whether it was a long or short trade. You can see the original entry price (`priceOpen`), intended take profit (`priceTakeProfit`, `originalPriceTakeProfit`), and stop loss levels (`priceStopLoss`, `originalPriceStopLoss`). Finally, timestamps (`scheduledAt`, `pendingAt`) indicate when the signal was generated and when the position was initially activated.


## Interface PartialLossAvailableNotification

This notification signals that a trading strategy has hit a predefined loss level, like a 10% or 20% drawdown. It's a heads-up that the position isn't performing as expected, and it provides a wealth of information to understand what's happening. 

Each notification has a unique ID and timestamp, and indicates whether it occurred during a backtest or live trading. You’ll find details like the trading pair (e.g., BTCUSDT), the strategy involved, and the specific loss level that triggered the notification.

The notification includes critical price points: the entry price, current market price, and original stop-loss and take-profit levels, along with how they’ve been adjusted.  It also breaks down the position’s performance, including total capital invested, realized profit/loss, peak profit achieved, and maximum drawdown experienced.  This includes metrics like percentage gain/loss and USD values, alongside the number of entries and partial closes executed. Finally, an optional note field provides context for the signal’s trigger.

## Interface PartialEvent

The `PartialEvent` object is designed to hold all the important details about profit and loss milestones during a trade. Think of it as a snapshot of what happened at key points during a trade, like when a profit or loss level was hit.

It includes things like the exact time of the event, whether it was a profit or a loss, and the specific trading pair involved. You'll also find details about the strategy used, the signal that triggered the trade, and the current market price.

Crucially, it stores information about the entry price, take profit and stop loss levels, both as originally set and as they might have changed.

If you're using a dollar-cost averaging (DCA) strategy, you'll see data about the number of entries made and the overall entry price. You’ll also see information about partial closes if used.

Finally, it includes technical information like the unrealized profit and loss (PNL), a human-readable note explaining the signal, when the position became active, and a flag indicating whether the trade is a backtest or a live trade.


## Interface MetricStats

This object bundles together statistics related to a particular performance metric. It tells you how many times a specific metric was recorded and provides a range of descriptive statistics about it. You'll find the average, minimum, maximum, and standard deviation of the duration, helping you understand the typical performance and any potential outliers.

It also includes information about wait times – the minimum, maximum, and average time between events.

Here's a breakdown of what's included:

*   **metricType:** Identifies the specific metric these statistics represent.
*   **count:** How many measurements were taken for this metric.
*   **totalDuration:** The sum of all the duration values.
*   **avgDuration:** The average duration.
*   **minDuration:** The shortest duration recorded.
*   **maxDuration:** The longest duration recorded.
*   **stdDev:** A measure of how spread out the durations are.
*   **median:** The middle duration value when all values are sorted.
*   **p95 & p99:** Percentiles showing the durations below which 95% and 99% of measurements fall.
*   **avgWaitTime, minWaitTime, maxWaitTime:** Statistics about the time between occurrences of events related to this metric.

## Interface MessageModel

This describes a message within a conversation with a large language model. Think of it as a single turn in the chat.

Each message has a `role` which tells you who sent it - whether it's an instruction from the system, something the user typed, a response from the assistant, or a result from a tool the assistant used.

The core of the message is its `content`, which is the actual text. Sometimes, assistant messages might only contain tool calls and will have an empty content.

There's also a `reasoning_content` field that some providers offer, to show the assistant's thought process.

If the assistant used any tools, those are listed in the `tool_calls` section.  You might also find images attached to a message, which can be in different formats like Blob, raw bytes, or base64 strings.

Finally, if the message is a response to a specific tool call, there's a `tool_call_id` to identify which call it's related to.

## Interface MaxDrawdownStatisticsModel

This model holds information about maximum drawdown events encountered during a trading backtest. 

It keeps track of each drawdown event in a list, called `eventList`, which contains details of when the drawdown occurred and its magnitude, with the most recent events appearing first.  Additionally, the `totalEvents` property simply tells you how many drawdown events were recorded overall. Think of it as a way to summarize and understand the risk profile of a trading strategy based on its drawdown history.

## Interface MaxDrawdownEvent

This data structure represents a single instance where a maximum drawdown occurred for a specific trade. It contains information about when the drawdown happened (timestamp), which trading pair was involved (symbol), the strategy and signal used, and whether the trade was a long or short position. 

You’ll also find details about the position's overall profit and loss (pnl), the highest profit it reached (peakProfit), and the actual amount of the drawdown itself (maxDrawdown). The current price at which the drawdown occurred, along with the entry price, take profit level, and stop loss level, are also included. Finally, it indicates if the event happened during a backtesting simulation.

## Interface MaxDrawdownContract

The MaxDrawdownContract provides information when a new maximum drawdown occurs for a trading position. It lets you know the symbol being traded, the current price at the time of the drawdown, and when the event happened. You also get details like the strategy name, exchange, and timeframe used. 

The included signal data gives you insight into the specific trade that triggered the drawdown. A key piece of information is whether this drawdown event came from a backtest or live trading.

This information is valuable for keeping an eye on risk and managing your positions effectively, allowing you to react to changes in market conditions.

## Interface LiveStatisticsModel

The LiveStatisticsModel provides a detailed view of your live trading performance, offering a wide range of metrics to analyze how your strategies are doing. It tracks every event from idle periods to closed trades, giving you a complete history.

You can access the raw event data through the eventList, and get a total count of all events, and specifically closed signals. Key performance indicators like the number of winning and losing trades are readily available.

Beyond simple counts, it calculates essential profitability metrics, including win rate, average PNL per trade, and total cumulative PNL. Risk metrics like standard deviation and Sharpe Ratio are also included, allowing you to assess the risk-adjusted returns of your trading. 

Additionally, it calculates more specialized ratios like Certainty Ratio, Sortino Ratio, and Calmar Ratio, along with expected yearly returns and drawdown related indicators, to offer a more comprehensive understanding of your trading strategy's strengths and weaknesses. Note that any metric resulting in an unsafe value (like division by zero) will be represented as null.

## Interface InfoErrorNotification

This notification type signals that something went wrong during a background task, but it's a recoverable issue. It's designed to alert you to problems that don't necessarily stop the entire process. 

Each notification has a unique identifier so you can track specific issues. There's also a human-readable message to help you quickly understand what happened.

The notification includes detailed information about the error, like the stack trace and any relevant metadata. Importantly, these notifications always indicate that the error occurred outside of a backtesting scenario.

## Interface IdlePingContract

This interface defines what information is shared when a trading strategy is in an idle state, meaning it's not actively responding to signals. 

It's like a heartbeat signal that lets you know when a strategy isn't making any trades.

The event includes details like the trading pair (symbol), the name of the strategy that’s idle, the exchange it’s running on, and whether it’s a backtest or live trade. 

You'll also find the current market price and a timestamp to mark exactly when the idle ping occurred, which is the real-time moment during live trading or the candle's timestamp during backtesting.

This information allows you to track the lifecycle and behavior of your trading strategies when they aren’t actively engaged in trading. You can set up listeners to react to these idle ping events.

## Interface IWarmCandlesParams

This interface defines the settings you provide to pre-load historical candle data for your backtests. Think of it as a way to prepare your data beforehand to speed up the testing process. You specify the trading pair you're interested in, which exchange provides the data, the timeframe for the candles (like 1-minute or 4-hour), and the start and end dates for the historical data you want to retrieve. These parameters ensure you have the necessary data readily available when your backtest begins.

## Interface IWalkerStrategyResult

This interface describes the outcome of running a single trading strategy within a backtest comparison. It holds key information about the strategy itself, like its name, alongside detailed statistics generated during the backtest. You'll find performance metrics, represented as a numerical value used to rank strategies against each other. Finally, it provides a rank indicating the strategy's relative performance compared to the other strategies being evaluated – a lower rank signifies a better result.

## Interface IWalkerSchema

The IWalkerSchema defines how to set up comparisons between different trading strategies, essentially creating an A/B testing environment. 

You’ll use it to register a specific testing setup, giving it a unique name (walkerName) and a helpful note for yourself.

It specifies the exchange and timeframe (frameName) to use for backtesting all the strategies involved in the comparison.

The core of the schema is the strategies array, which lists the names of the strategies you want to test against each other – these strategies need to be registered beforehand.

You can also choose which metric (like "sharpeRatio") you want to optimize for during the backtest, and optionally provide custom callbacks for different stages of the process.

## Interface IWalkerResults

The `IWalkerResults` object holds all the information gathered after a complete backtesting run, essentially summarizing the results of comparing different trading strategies. It tells you which financial instrument (symbol) was being analyzed, which exchange was used for the data, the specific name of the backtesting method (walker) that was employed, and the timeframe used in the analysis. Think of it as a record of the entire backtesting process, providing context for the generated results.

## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you hook into the backtest process for more control and insight. It’s a way to get notified about what's happening as the system runs tests on different strategies.

You'll receive a notification (`onStrategyStart`) when a new strategy and symbol pairing begins its testing phase. 
Once a strategy's backtest finishes (`onStrategyComplete`), you'll be called with performance statistics and a key metric. 
If a strategy encounters a problem during its backtest (`onStrategyError`), you’ll be alerted to the error.
Finally, when all strategies across all symbols have finished running, `onComplete` will provide the complete results. 


## Interface ITrailingTakeCommitRow

This interface represents a queued action for a trailing take commit, which is a type of order adjustment in automated trading. It essentially tells the system to execute a trailing take action.

The `action` property clearly identifies this as a "trailing-take" action.

The `percentShift` defines how much the price needs to shift before the take action is triggered – think of it as the percentage buffer.

Finally, `currentPrice` remembers the price level where the trailing was initially established, providing context for calculations.

## Interface ITrailingStopCommitRow

This interface represents a queued action for a trailing stop order. It’s essentially a record of what needs to happen related to a trailing stop. 

You’ll find three key pieces of information here: the type of action being performed ("trailing-stop"), the percentage shift that’s been applied, and the price at which the trailing stop was initially established. Think of it as a snapshot of the parameters for a trailing stop adjustment.

## Interface IStrategyTickResultWaiting

This interface describes a special type of tick result you’ll encounter when a trading signal is scheduled and waiting for the right price to trigger it. It’s not the initial signal creation, but what happens as the system monitors for activation.

The `action` property clearly indicates the “waiting” state.

You’ll also find key details like the signal itself, the current price being monitored, the strategy and exchange names, the timeframe, and the symbol being traded.

Since the signal hasn't been activated yet, both the take profit and stop loss progress will be at 0%.

You can see the theoretical, unrealized profit and loss (PNL) for this potential trade, along with whether the trade is part of a backtest or a live execution. Finally, a timestamp indicates when this waiting tick result was generated.

## Interface IStrategyTickResultScheduled

This interface describes a specific type of event within the backtest-kit framework, representing a scheduled trading signal. It happens when a strategy decides to wait for a particular price level to be reached before executing a trade.

Essentially, it's a notification that a signal has been generated and is "on hold," patiently awaiting the market to move to the desired entry point.

The information included provides a detailed snapshot of the situation: you'll see the strategy’s name, the exchange involved, the timeframe being used, the symbol being traded, the current price, whether it’s a backtest or live trade, and when the event occurred. It's like having a record of precisely when and why a strategy decided to pause before taking action.


## Interface IStrategyTickResultOpened

This data represents a new trading signal being created, marking a significant event in your automated trading process. It provides details about the signal's creation, letting you track what happened and why.

You’ll find information like the strategy and exchange involved, along with the specific timeframe and symbol being traded. The `currentPrice` tells you the price at the moment the signal became active.

Crucially, this record also indicates whether it originated from a backtest (simulated trading) or a live trading environment. A timestamp tells exactly when this event occurred. This information is valuable for debugging, analysis, and understanding the behavior of your trading strategies.

## Interface IStrategyTickResultIdle

This interface represents a tick result when a trading strategy is in an idle state, meaning no active trading signal is present. It provides details about the context of this idle state, including the strategy's name, the exchange it's connected to, the timeframe being used, and the trading symbol. You'll find information like the current price at the time, whether the data is from a backtest or live trading, and a timestamp indicating when the event occurred. Essentially, it's a record showing that the strategy isn't currently taking action, but captures the conditions during that period for analysis and monitoring.


## Interface IStrategyTickResultClosed

This interface represents the outcome when a trading signal is closed, providing a comprehensive view of what happened. 

It includes key details like the closing price, the reason for closure (whether it was due to a time limit, profit target, stop-loss, or a manual close), and the exact time of closure.

You'll also find a breakdown of the profit and loss, including fees and slippage, along with the name of the strategy, exchange, and time frame used for the trade. 

For backtesting scenarios, it indicates whether the event occurred in backtest mode, and for user-initiated closes, it provides a unique close ID. Finally, it captures when the result was created relative to the candle or execution.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a planned trading signal is canceled before a trade actually happens. This could be because the signal never triggered or because it was stopped short of creating a position.

It provides details about the canceled signal, the price at the time of cancellation, and when it occurred. You'll also find information like the strategy and exchange involved, the timeframe used, and whether the event occurred during a backtest or live trading session.

Crucially, it includes a reason for the cancellation, and an optional ID if the cancellation was initiated by a user-requested stop.  Finally, it records when the tick result itself was created, tying it to either the candle timeframe during backtesting or the real-time execution context during live trading.

## Interface IStrategyTickResultActive

This interface describes a tick result when a strategy is actively monitoring a signal, awaiting either a take profit, stop loss, or time expiration. It contains essential information for tracking the active position's status.

You'll find details about the signal being monitored, the current VWAP price used for evaluation, and identifying information like the strategy, exchange, time frame, and trading symbol involved. The `action` property confirms this is an "active" state.

Progress towards take profit and stop loss are indicated as percentages. Real-time profit and loss (PNL) is included, factoring in fees, slippage, and partial closes. The result also specifies if it originates from a backtest or live trading environment, along with timestamps to track when events occurred and when the last candle was processed.

## Interface IStrategySchema

The IStrategySchema defines how a trading strategy is set up and registered within the backtest-kit framework. It’s essentially a blueprint describing how the strategy generates trading signals.

Each strategy needs a unique name to identify it. You can also add a note to explain what the strategy does, useful for developers.

The `interval` property controls how often the strategy is checked – the default is every minute.

The core of the strategy is the `getSignal` function; this is where the actual trading logic lives. It uses the current price to decide whether to generate a signal and, if so, what kind of signal it is. The function can be configured to wait for a specific price level or execute immediately.

You can also provide optional callbacks to track important lifecycle events like when a trade opens or closes.

For more complex risk management, you can specify a `riskName` or even multiple `riskList` identifiers.

Finally, `actions` let you connect the strategy to specific actions within your trading system.

## Interface IStrategyResult

This interface, `IStrategyResult`, represents a single result when comparing different trading strategies during a backtest. It bundles together key information needed to evaluate and rank strategies.

Each result includes the strategy's name so you know which strategy it represents.  It also contains detailed statistics about the backtest itself, giving you a comprehensive view of how the strategy performed. A crucial element is the metric value, which reflects how well the strategy achieved its optimization goal—though this may be missing if the strategy had issues. Finally, timestamps marking the start and end of trading activity for the strategy are provided, helping understand the strategy's active period during the backtest.

## Interface IStrategyPnL

This interface describes the profit and loss results of a trading strategy. 

It details how much you've gained or lost, both as a percentage and in actual dollar amounts.

The `priceOpen` and `priceClose` values show you the actual prices used for entry and exit, factoring in typical costs like trading fees and slippage (the difference between the expected price and the execution price).

You'll see the `pnlPercentage` to understand your overall return, `pnlCost` representing the dollar amount of profit or loss, and `pnlEntries` which represents the total money put into the trades.


## Interface IStrategyCallbacks

This interface lets you define specific actions to be triggered at various points in a trading strategy’s lifecycle. Think of it as a way to hook into key events like when a new signal is opened, becomes active, or is closed. You can set up notifications or perform custom logic whenever a signal enters an idle state, gets scheduled, or is cancelled.

Here’s a breakdown of what each callback does:

*   `onTick`: Runs every time a new price tick comes in, providing the latest result.
*   `onOpen`: Triggers when a new signal is successfully validated and opened.
*   `onActive`: Fires when a signal is actively being monitored.
*   `onIdle`: Occurs when no active signals are present.
*   `onClose`: Called when a signal is closed, providing the final closing price.
*   `onSchedule`: Executed when a scheduled signal is created, allowing for delayed entries.
*   `onCancel`: Happens when a scheduled signal is cancelled before a position is opened.
*   `onWrite`: Called when signal data is saved for testing purposes.
*   `onPartialProfit`: Signals that a position is profitable but has not yet hit the target profit.
*   `onPartialLoss`: Notifies you when a position is experiencing a loss but hasn't triggered the stop-loss.
*   `onBreakeven`: Indicates the position has reached a breakeven point, often accompanied by a shift in the stop-loss.
*   `onSchedulePing`:  Provides a way to check on scheduled signals regularly, even outside of the strategy’s normal interval.
*   `onActivePing`: Allows you to monitor active signals periodically and dynamically adjust settings if needed.

These callbacks offer a flexible way to customize your backtesting and live trading strategies.

## Interface IStrategy

The `IStrategy` interface outlines the core functions a trading strategy needs to perform. It's essentially the blueprint for how a strategy interacts with the trading system.

Here's a breakdown of what each function does:

*   **`tick(symbol, strategyName)`**: This is the primary function called on each price update ("tick"). It evaluates the market, checks for signals, and adjusts stop-loss orders.
*   **`getPendingSignal(symbol, currentPrice)`**:  Looks for an existing trade order. If none exists, it returns nothing. It's used to monitor for potential profit targets or stop losses.
*   **`getScheduledSignal(symbol, currentPrice)`**:  Similar to `getPendingSignal`, but specifically for signals that are planned for future execution.
*   **`getBreakeven(symbol, currentPrice)`**: Checks if the current market price has moved enough to cover trading costs, allowing a break-even point to be set.
*   **`getStopped()`**:  Indicates whether the strategy has been paused or stopped.
*   **`getTotalPercentClosed(symbol)`**: Calculates how much of the trade has already been closed, taking into account partial exits.
*   **`getTotalCostClosed(symbol)`**: Shows how much of the initial investment has been recovered through partial exits.
*   **`getPositionEffectivePrice(symbol)`**: Determines the average entry price of a trade, considering any subsequent additions (DCA).
*   **`getPositionInvestedCount(symbol)`**: Keeps track of how many times the position has been adjusted (DCA entries).
*   **`getPositionInvestedCost(symbol)`**:  Calculates the total cost of the entire position, including any DCA additions.
*   **`getPositionPnlPercent(symbol, currentPrice)`**: Calculates the percentage profit or loss based on the current price.
*   **`getPositionPnlCost(symbol, currentPrice)`**: Calculates the profit or loss in currency terms.
*   **`getPositionEntries(symbol, timestamp)`**: Provides a history of all the prices and costs at which the position was entered.
*   **`getPositionPartials(symbol)`**: Tracks any partial exits that have been executed.
*   **`backtest(symbol, strategyName, candles, frameEndTime)`**: Simulates the strategy on historical data to evaluate its performance.
*   **`stopStrategy(symbol, backtest)`**:  Pauses the strategy from generating new trade signals without closing existing positions.
*   **`cancelScheduled(symbol, backtest, payload)`**:  Cancels a scheduled trade without stopping the overall strategy.
*   **`activateScheduled(symbol, backtest, payload)`**: Forces a scheduled trade to execute immediately.
*   **`closePending(symbol, backtest, payload)`**:  Closes an existing trade without impacting other signals.
*   **`partialProfit(symbol, percentToClose, currentPrice, backtest, timestamp)`**:  Closes a portion of the trade at the current profit level.
*   **`validatePartialProfit(symbol, percentToClose, currentPrice)`**: Checks if a partial profit exit is possible.
*   **`partialLoss(symbol, percentToClose, currentPrice, backtest, timestamp)`**: Closes a portion of the trade at the current loss level.
*   **`validatePartialLoss(symbol, percentToClose, currentPrice)`**: Checks if a partial loss exit is possible.
*   **`trailingStop(symbol, percentShift, currentPrice, backtest)`**: Adjusts the stop-loss level to protect profits as the price moves favorably.
*   **`validateTrailingStop(symbol, percentShift, currentPrice)`**: Checks if a trailing stop adjustment is valid.
*   **`trailingTake(symbol, percentShift, currentPrice, backtest)`**:  Adjusts the take-profit level to maximize gains as the price moves favorably.
*   **`validateTrailingTake(symbol, percentShift, currentPrice)`**: Checks if a trailing take-profit adjustment is valid.
*   **`breakeven(symbol, currentPrice, backtest)`**:  Moves the stop-loss to the entry price to guarantee minimal profit.
*   **`validateBreakeven(symbol, currentPrice)`**: Checks if a break-even adjustment is possible.
*   **`averageBuy(symbol, currentPrice, backtest, timestamp, cost)`**: Adds more of the same asset to an existing trade.
*   **`validateAverageBuy(symbol, currentPrice)`**: Checks if a DCA purchase is valid.
*   **`hasPendingSignal(symbol)`**: Determines whether a trade is currently active.
*   **`hasScheduledSignal(symbol)`**: Checks for a pending scheduled trade.
*   **`dispose()`**: Cleans up any resources used by the strategy.

Essentially, `IStrategy` defines the essential methods to manage a trading strategy from signal generation to risk management and position adjustments.

## Interface IStorageUtils

This interface defines the core functionality needed for any storage adapter used within the backtest-kit framework. Think of it as the blueprint for how your storage system interacts with the trading simulation.

It provides methods for reacting to different signal events like when a position is opened, closed, scheduled, or cancelled.

You'll also find methods to retrieve signals—both by a specific ID and as a full list.

Finally, there are methods to handle special ping events related to active and scheduled signals, ensuring data is kept up-to-date during the backtest. These ping events keep track of the signals' status and update the "updatedAt" timestamp.


## Interface IStorageSignalRowScheduled

This interface defines a signal's status when it's scheduled, indicating it's ready for future execution.  The `status` property is explicitly set to "scheduled" for such signals. It provides a clear way to identify signals that have been planned but haven’t yet been processed.

## Interface IStorageSignalRowOpened

This interface represents a signal that has been opened, indicating a trade is active. It's a simple structure confirming the signal's current state. The core piece of information is the `status` property, which will always be set to "opened" for these types of signals. Essentially, it's a marker that a signal has been acted upon and a position has been taken.

## Interface IStorageSignalRowClosed

This interface represents a signal that has been closed, meaning a trade has been executed and the position settled. 

It includes information specific to closed signals, most importantly, the profit and loss (PNL) data associated with that trade.  

The `status` property confirms the signal is in a 'closed' state. The `pnl` property holds the detailed performance information for that closed position.


## Interface IStorageSignalRowCancelled

This interface represents a signal that has been cancelled. 

It's a way to track when a signal is no longer valid or should not be acted upon.

The `status` property simply confirms that the signal's status is "cancelled".


## Interface IStorageSignalRowBase

This interface, `IStorageSignalRowBase`, defines the fundamental structure for how signals are stored, regardless of their specific status. It ensures that every signal record includes key details like when it was initially created (`createdAt`) and last updated (`updatedAt`), using timestamps derived from the strategy's results.  A `priority` field is also included, allowing storage adapters to order signals in a specific way—typically using the current time to ensure new signals are processed first. Think of this as the common blueprint for all signal storage records.

## Interface IStateParams

`IStateParams` helps you define how your trading signals are organized and what their starting values are. Think of it as setting up the containers and initial contents for your signal data. You specify a `bucketName`, which acts like a folder name to keep related signals grouped together – like "trade" or "metrics."  You also set the `initialValue`, which determines what value a signal will have if there’s no saved data to use. This ensures your signals start with a known state.

## Interface IStateInstance

The `IStateInstance` interface provides a way to manage data specific to each trade, like peak unrealized profit or how long a position has been open. This is particularly useful for strategies that use AI to make decisions and need to track performance over time.

Think of it as a record-keeping system that evolves alongside a trade.

It allows you to track metrics over the lifetime of a position, like the peak unrealized profit, and the time since the trade was entered.  There's a mechanism to ensure that you aren't looking into the future – you can only access data up to the current point in time.

The `waitForInit` method sets things up when the state is first created. `getState` lets you read the current data, but prevents peeking into the future. `setState` allows you to update that data; older data points are overwritten by newer ones, which is useful for restarting backtests without issues.  Finally, `dispose` cleans up any resources the state instance is using when it’s no longer needed.

## Interface ISizingSchemaKelly

This schema defines a sizing strategy based on the Kelly Criterion, a formula used to determine optimal bet sizes. 

It essentially tells the backtest-kit framework that you want to size your trades using the Kelly Criterion approach. 

The `kellyMultiplier` property controls how aggressively you apply the Kelly Criterion; a smaller value like 0.25 (the default) represents a more conservative "quarter Kelly" approach, limiting potential losses. A higher multiplier increases bet sizes but also increases risk.

## Interface ISizingSchemaFixedPercentage

This schema defines a trading sizing strategy that uses a fixed percentage of your capital for each trade. Essentially, you specify a percentage (like 1%, 2%, or 5%) that you're willing to risk on every trade you take. 

The `method` property confirms that you're using a fixed-percentage sizing approach. The `riskPercentage` property is the key setting - it's the number that dictates what percentage of your account balance will be at risk for each individual trade. Remember that this value should be between 0 and 100 to represent a valid percentage.

## Interface ISizingSchemaBase

This interface defines the basic structure for sizing strategies within the backtest-kit framework. Each sizing strategy will have a unique identifier, allowing you to easily distinguish between different sizing configurations.

You can also add a note to provide context or documentation for the sizing strategy. 

To control risk, you can set limits on the maximum position size as a percentage of your account.  Furthermore, you can also specify minimum and maximum absolute position sizes. 

Finally, this base schema allows for optional callback functions to be defined, which can be used to react to specific events in the sizing process.

## Interface ISizingSchemaATR

This defines how your trading strategy determines the size of each trade based on the Average True Range (ATR). 

Essentially, you’ll specify that you're using an "atr-based" sizing method. Then, you'll set a `riskPercentage`, which is the portion of your account you're willing to risk on a single trade, expressed as a number from 0 to 100. 

Finally, the `atrMultiplier` tells the system how to use the ATR value to calculate the appropriate stop-loss distance for your position – a higher multiplier means a wider stop.

## Interface ISizingParamsKelly

This interface defines the parameters needed for sizing trades using the Kelly Criterion within the backtest-kit framework. 

It primarily focuses on providing a way to log information during the sizing process, allowing you to debug and understand how trade sizes are being calculated.

Specifically, you'll need to supply an `ILogger` service, which will be used to record any relevant messages or details about the sizing calculations. This helps you monitor and troubleshoot the sizing behavior of your trading strategies.

## Interface ISizingParamsFixedPercentage

This interface represents the data used during a backtest, containing key information about each historical period.

It includes properties like `timestamp` to mark when the data point occurred, `open`, `high`, `low`, and `close` to define the price range during that time, and `volume` to indicate the trading activity. Think of it as a single candlestick's worth of data used to evaluate a trading strategy.

## Interface ISizingParamsATR

This interface defines the parameters needed for determining position sizes based on the Average True Range (ATR). 

It includes a `logger` property, which allows you to easily track what's happening during the sizing process and helps with debugging. Think of it as a way to get helpful messages about how your sizing strategy is behaving.

## Interface ISizingCallbacks

The `ISizingCallbacks` interface provides a way to hook into the sizing process within the backtest-kit framework. You can use it to monitor and potentially influence how position sizes are determined.

Specifically, the `onCalculate` function is called immediately after the framework computes a trade size. This allows you to track the calculated size, perhaps for debugging purposes or to ensure it falls within acceptable limits. It's a chance to log the values involved or perform any validation steps.


## Interface ISizingCalculateParamsKelly

This defines the information needed to calculate your trade size using the Kelly Criterion. 

Essentially, you'll provide details about your trading strategy’s performance. 

You need to specify that you’re using the "kelly-criterion" method.

Then, you’ll need to provide the win rate of your strategy – this is the percentage of times your trades are profitable.

Finally, you need to tell the system the average win/loss ratio, representing how much you gain on winning trades compared to how much you lose on losing ones.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the parameters needed to calculate trade sizes using a fixed percentage approach. It requires you to specify the method as "fixed-percentage" to indicate you're using this sizing strategy.  You'll also need to provide a `priceStopLoss` value, which represents the price at which a stop-loss order will be triggered. This value is crucial for risk management when using this sizing method.

## Interface ISizingCalculateParamsBase

This interface defines the fundamental information needed for calculating trade sizes. It includes the symbol of the trading pair you're working with, like "BTCUSDT," as well as your current account balance and the anticipated price at which you plan to enter the trade.  Think of it as the core data set used to determine how much of an asset you can realistically buy or sell.

## Interface ISizingCalculateParamsATR

This interface defines the settings used when calculating trade sizes based on the Average True Range (ATR). 

When using an ATR-based sizing approach, you'll provide this information to the sizing function. 

Specifically, you'll need to indicate that you're using the "atr-based" method and also supply the current ATR value, which represents market volatility. This ATR value is a crucial input for determining appropriate position sizes.

## Interface ISizing

The `ISizing` interface is a core part of how backtest-kit determines how much of an asset to trade. It's used behind the scenes during strategy execution.

The `calculate` property is the heart of this interface: it’s a function that receives information about your trading setup and returns the recommended position size, usually a number representing how many shares or contracts to buy or sell. This calculation is based on factors like your risk tolerance and the current market conditions.

## Interface ISignalRow

This describes the structure of a signal within the backtest-kit framework. Each signal is represented by an `ISignalRow` object, and it contains a wealth of information about a trading opportunity.  It starts with a unique ID, cost of the trade, and entry price, along with details about when the signal was scheduled and when the position became active.

The signal also includes key identifiers: the exchange, strategy, and frame used for execution. It tracks the symbol being traded and whether the signal was pre-scheduled.

Beyond the basics, the signal holds performance data.  It keeps a history of any partial profit or loss closings, enabling detailed profit and loss calculations.  It also supports trailing stop-loss and take-profit mechanisms, dynamically adjusting those levels based on the strategy.

The `_entry` property records a history of DCA entries to determine the effective entry price. Finally, the signal captures the highest profitable price (`_peak`) and lowest losing price (`_fall`) seen during the trade's lifecycle, along with their timestamps. A timestamp field is available for tracking when the signal was originally created.

## Interface ISignalIntervalDto

This data transfer object, or DTO, helps manage signals, especially when you need to retrieve several signals at once. Think of it as a way to group signals together and have them released at a specific interval. The `id` property is simply a unique identifier for each signal – a random string that ensures each signal can be distinguished from others.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, acting as a data container for all the crucial details needed to initiate a trade. It includes an optional ID, which will be automatically assigned if you don’t provide one. You’ll specify the trade direction, whether it's a "long" (buy) or "short" (sell) position, along with a descriptive note explaining the reasoning behind the signal.

The signal also defines the entry price, the target price for taking profit, and the price at which to trigger a stop-loss to manage risk. You’ll set an estimated duration for the trade in minutes; use `Infinity` if you want the trade to remain open until a take profit or stop loss is hit. Finally, a cost parameter specifies the entry cost for the trade, defaulting to a system-wide setting.

## Interface ISessionInstance

The `ISessionInstance` interface provides a way to store and retrieve data specific to each combination of symbol, strategy, exchange, and timeframe during backtesting. Think of it as a temporary workspace for each run, allowing you to hold information like intermediate calculations, cached AI results, or other data needed by your trading strategy.

It allows you to initialize the session, write new data along with a timestamp, and retrieve data associated with a specific timestamp.  Importantly, when you request data, it won't return anything from the future, preventing potential look-ahead biases. When the backtest is complete, you can also use it to release any resources the session might be holding. This framework ensures that each strategy gets its own isolated data container, contributing to cleaner and more reliable backtesting.

## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, describes a signal that isn't acted on immediately. It represents a signal that's waiting for a specific price to be reached before an order is placed. Think of it as a signal with a built-in price condition.

It builds upon the basic `ISignalRow` structure, adding the concept of a 'priceOpen' – the price level the market needs to reach before the signal becomes active.

Once the market price hits this 'priceOpen', the signal transforms into a standard, pending signal, ready to be executed.

The `priceOpen` property simply holds the target price that needs to be reached.


## Interface IScheduledSignalCancelRow

This interface represents a scheduled trading signal that can be canceled by the user. It builds upon the standard scheduled signal data by adding information specifically related to cancellations. If a user cancels a signal, this interface includes a `cancelId` to uniquely identify the cancellation and a `cancelNote` to store any explanation provided by the user. These fields only appear when a cancellation is associated with the signal.

## Interface IRunContext

The `IRunContext` acts as a central hub, providing all the information a function needs when it's being run within the backtest-kit framework. Think of it as a combined package deal – it bundles together details about *where* the function is running (exchange, strategy, frame) with information about the *when* and *what* (symbol, timestamp, whether it's a backtest).  This consolidated context simplifies things by allowing functions to access everything they need in one go. The framework automatically separates and distributes the different parts of this context to the appropriate services for efficient processing.

## Interface IRiskValidationPayload

This data structure holds the information needed for risk validation checks. It builds upon the `IRiskCheckArgs` and incorporates details about the current trading signal being evaluated, providing access to things like the signal's price. You'll also find the number of open positions and a list of those active positions, all of which are useful for making informed risk management decisions. Essentially, it gives you a snapshot of the portfolio's state at the time of the validation process.

## Interface IRiskValidationFn

This defines the structure for functions that check if a trading decision is safe to make. Think of it as a gatekeeper for your trades. If the function thinks everything is okay, it simply allows the trade to proceed – it returns nothing. However, if something seems wrong, like a potential violation of a risk rule, it either returns a specific rejection reason or throws an error, both of which are handled to provide clear feedback about why the trade was blocked.

## Interface IRiskValidation

This section describes how to set up checks to make sure your risk calculations are behaving as expected. You define these checks using a `validate` function, which is the core of the process; it's the code that actually performs the validation. Optionally, you can add a `note` to explain what the validation is intended to do, making it easier to understand the logic behind the check. This note acts as documentation for your validation process.

## Interface IRiskSignalRow

This interface, `IRiskSignalRow`, is designed to hold key information related to a trading signal, specifically for risk management purposes. Think of it as a detailed version of a regular trading signal, adding extra data important for checking and managing potential risks. It includes the entry price of the trade (`priceOpen`), the initially set stop-loss price (`originalPriceStopLoss`), and the original take-profit price (`originalPriceTakeProfit`). This lets the system accurately evaluate the risk associated with a trade based on the original parameters.

## Interface IRiskSchema

The IRiskSchema lets you define and register custom risk controls for your portfolio. Think of it as a way to create personalized rules that ensure your trading strategy stays within acceptable boundaries. Each risk schema has a unique name, and you can add notes to describe it.

You can also set up callbacks to trigger specific actions, such as rejecting a trade or allowing it to proceed, at different stages. Most importantly, the validations property is where you define the actual risk checks—these are functions or objects that evaluate your portfolio's state and determine whether a trade should be allowed.

## Interface IRiskRejectionResult

This interface describes the result when a risk validation check fails. It provides information to help you understand why the validation didn't pass. Each rejection has a unique ID so you can track it, and a clear note explaining the reason for the rejection in easy-to-understand language. This allows for easier debugging and correction of the underlying issue.

## Interface IRiskParams

The `IRiskParams` object is how you set up the environment for managing risk in your trading system. Think of it as a set of configurations that tell the risk management system how to behave.

It includes essential information like the name of the exchange you're using (like "binance") and a way to log important debugging messages. 

You’ll also provide a time service to make sure your calculations are accurate and don't accidentally look into the future.

A crucial setting specifies whether you're running in backtest (historical data) or live trading mode.

Finally, you can define a custom callback function `onRejected` that gets triggered whenever a trading signal is blocked due to risk constraints. This allows you to react to those rejections and send out notifications or perform other actions.

## Interface IRiskCheckOptions

This option helps manage situations where multiple parts of your trading system are trying to adjust positions at the same time. Specifically, `reserve` is a boolean setting. If you set it to `true`, it acts like a temporary marker when the system checks for risk. This ensures that other processes see the updated position size *before* a final trade is made, preventing potential conflicts and making things more predictable.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, holds all the information needed to decide whether a trading signal should be allowed to proceed. Think of it as a gatekeeper, checking if the conditions are right *before* a trade is actually placed.

It bundles together important data like the trading pair being considered (the `symbol`), the pending signal itself (`currentSignal`), and details about the strategy and the environment it’s running in.

You'll find details here like the strategy's name, the exchange being used, a specific risk identifier, the timeframe being analyzed, the current price, and a timestamp to note when this check is happening.  Essentially, it's a snapshot of the situation to help ensure responsible trading.

## Interface IRiskCallbacks

This interface lets you define functions that your backtesting system can call when certain risk-related events occur. Think of it as a way to be notified about what's happening with your risk management. Specifically, `onRejected` is triggered whenever a trading signal is blocked because it violates your risk rules – this is useful for logging or further analysis.  Conversely, `onAllowed` gets called when a signal clears all the risk checks and is approved for execution, allowing you to confirm the signal passed your safety nets. You don’t need to implement this interface if you don’t need the extra notification of these events.

## Interface IRiskActivePosition

This interface describes an active trading position that a strategy holds, and it's used to track positions across different strategies for a broader risk assessment. Each position has a name, identifying which strategy created it, and where it’s being traded (exchange and frame). 

You'll find details about the asset being traded (the symbol, like BTCUSDT), whether it's a long or short position, and important price levels – the entry price, stop loss, and take profit. 

Finally, there's timing information, including an estimated duration for the position and the exact timestamp of when it was initiated. This provides a complete picture of a single, active trade.

## Interface IRisk

The `IRisk` interface is responsible for managing the risk involved in trading signals and keeping track of positions. It’s a core component for ensuring that trading activities stay within defined safety limits.

The `checkSignal` method determines if a trading signal is permissible, given current risk parameters. A more robust version, `checkSignalAndReserve`, combines this check with a system for temporarily "reserving" a spot for a new position; this prevents multiple strategies from inadvertently exceeding limits when working concurrently.  Essentially, it guarantees that a position isn't claimed by another strategy while the first is setting things up.

When a signal is successfully checked and reserved, you *must* either fully execute it by adding the position information with `addSignal`, or cancel it by removing the reservation with `removeSignal`.  Forgetting to do either leaves incorrect data and potential problems in the system.

`addSignal` is used to formally register a new, active trading position, while `removeSignal` cleans up a position that has been closed or cancelled.

## Interface IReportTarget

This interface lets you fine-tune what data gets recorded during your trading tests. Think of it as a way to pick and choose which details you want to see in your reports.

Each property, like `strategy` or `risk`, controls whether a specific type of event is logged. 

For example, setting `risk` to `true` means events related to risk management will be recorded.

You can turn on or off logging for things like strategy executions, breakeven points, performance metrics, and even live trading data, giving you granular control over the information captured during your backtesting process.


## Interface IReportDumpOptions

This interface defines the settings you can use when exporting or saving your backtesting reports. Think of it as a way to tag the data with important details about where it came from. Each property represents a piece of metadata – like the symbol being traded (e.g., BTCUSDT), the name of the trading strategy used, the exchange it ran on, the timeframe of the data, and a unique ID for the trading signal. You can also specify a name for the walker used in optimization. This ensures that your reports are clearly labeled and easily searchable, especially when dealing with many different backtests.

## Interface IRecentUtils

This interface defines how different systems can store and access recent trading signals. It allows for managing and retrieving the most up-to-date signal information for a specific trading context.  The `handleActivePing` method is used to record new signals.  `getLatestSignal` finds the newest signal that occurred *before* a certain time, preventing look-ahead bias in backtesting. Finally, `getMinutesSinceLatestSignalCreated` calculates how long ago the most recent signal was generated.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, provides a way to share information about a trading signal with users in a clear and understandable way. It builds upon the core signal data and adds crucial details about the original stop-loss and take-profit prices that were initially set. This lets users see the initial risk/reward parameters, even if those prices are being adjusted later on, such as through trailing stops.

The `IPublicSignalRow` also includes details about the signal's financial performance.  You'll find data on the cost of entering the position, the total number of entries and partial closes, and key metrics like unrealized profit and loss (pnl), peak profit, and maximum drawdown. It also keeps track of the original entry price, which remains constant even if the position is being averaged.  Essentially, this interface gives a complete picture of a signal’s status and history, suitable for transparent reporting and user-friendly interfaces.

## Interface IPublicCandleData

This interface defines the structure of a single candle data point that's used to represent price action over a specific time interval. Each candle contains key information like when it started (timestamp), the opening price, the highest and lowest prices reached, the closing price, and the trading volume for that period. Essentially, it's a snapshot of market activity at a given point in time. You can think of it as a standardized way to represent a bar of price data.

## Interface IPositionSizeKellyParams

The `IPositionSizeKellyParams` interface helps define the settings for calculating position sizes using the Kelly Criterion. It focuses solely on the parameters needed for that calculation.

To use it, you'll need to provide two key values: your win rate, which represents the percentage of winning trades, and your win/loss ratio, indicating the average profit compared to the average loss on each trade. These values contribute to determining an optimal position size based on your historical trading performance.


## Interface IPositionSizeFixedPercentageParams

This section details the parameters needed when using a fixed percentage sizing strategy for your trades. The most important setting here is `priceStopLoss`, which represents the price level at which your stop-loss order will be triggered. Think of this as a crucial safety net to limit potential losses.

## Interface IPositionSizeATRParams

The `IPositionSizeATRParams` interface defines the settings needed for determining position size based on the Average True Range (ATR).

It primarily focuses on the current ATR value, which is a key factor in calculating how much of your capital to allocate to a trade. Think of it as a measure of market volatility – a higher ATR suggests larger potential price swings, and this parameter helps adjust your position size accordingly. This parameter helps to control your risk.

## Interface IPositionOverlapLadder

This interface defines how to configure the detection of overlapping positions when using a dollar-cost averaging (DCA) strategy. It lets you set tolerance zones around each DCA level to identify potential overlaps. The `upperPercent` property controls how far above each DCA level is considered an overlap, while `lowerPercent` dictates how far below.  Think of it as defining a buffer zone around each DCA price point - if a position falls within that zone, it's flagged as overlapping. Both percentages are expressed as values from 0 to 100, so 5 represents 5%.

## Interface IPersistStorageInstance

This interface allows you to customize how trading signals are saved and loaded, providing a way to go beyond the default file-based storage. Think of it as a bridge between the backtest-kit and your own storage solution, whether that's a database, an in-memory store, or something else entirely. 

You'll have one instance of this interface used during backtesting and another during live trading. The system uses the unique ID of each signal to organize data. 

The `waitForInit` method prepares the storage for either backtest or live mode. The `readStorageData` method retrieves all of the saved signals. Finally, `writeStorageData` is used to update the storage with new signals, ensuring they're keyed by their signal IDs.


## Interface IPersistStateInstance

This interface, `IPersistStateInstance`, is all about safely saving and loading the data your trading strategies need to remember between runs. Think of it as a way to ensure your strategy’s progress isn't lost if something unexpected happens, like a crash.

It's designed to be customized – if you want to store your state data in a different way than the default file-based method, you can create your own adapter that implements this interface.

The methods allow you to:

*   `waitForInit`: Set up the storage space specific to your strategy.
*   `readStateData`: Retrieve any previously saved state data.
*   `writeStateData`: Save the current state of your strategy, including a timestamp of when it was saved.
*   `dispose`: Clean up any resources used by this instance; it doesn't have to be a complex operation.

## Interface IPersistSignalInstance

This interface lets you customize how backtest-kit stores signals for a particular trading strategy, symbol, and exchange. Think of it as a way to control where and how the signal data is saved. 

If you want to use a database instead of a file, or implement some unique logic for storing signals, you can create a class that follows this interface. 

The `waitForInit` method is called when the system needs to prepare the storage space for the signals.  `readSignalData` retrieves previously saved signal data.  Finally, `writeSignalData` lets you save new signal data, or clear the data entirely by passing `null`.


## Interface IPersistSessionInstance

This interface defines how to manage persistent data specific to a particular trading strategy, exchange, and frame combination. Think of it as a way to save and load information that your trading logic needs to remember between runs, especially important if something unexpected happens and your program crashes.

If you want to customize how this data is stored – maybe you don't want to use files, or you want to store it in a database – you can build your own adapter that implements this interface. 

The `waitForInit` method sets up the storage when everything is ready. `readSessionData` retrieves previously saved data.  `writeSessionData` saves current data along with a timestamp. Finally, `dispose` cleans up any resources when the storage is no longer needed.

## Interface IPersistScheduleInstance

This interface defines how backtest-kit handles saving and loading signals for a specific trading setup – think of it as a way to remember what signals were generated for a particular symbol, strategy, and exchange. If you want to use a different method of persistence, like a database instead of a file, you can create a custom adapter that implements this interface.

The `waitForInit` method lets you set up any initial conditions needed for your storage, like creating a new database connection. `readScheduleData` retrieves any previously saved signal data, allowing you to pick up where you left off. Finally, `writeScheduleData` is used to save the current signal data; setting it to null will clear the stored signal.


## Interface IPersistRiskInstance

This interface defines how your custom code interacts with the backtest-kit framework to manage risk positions, specifically their storage and retrieval. It’s designed for situations where you don’t want to use the default file-based persistence. 

Think of it as a way to customize how the framework remembers the risk exposure for a particular trading context – one tied to a specific risk name and exchange.

The `waitForInit` method lets you prepare your storage mechanism when the context is first set up. The `readPositionData` method retrieves previously saved risk positions for a given time.  Finally, `writePositionData` lets you save the current state of risk positions, so the framework can remember them for later.

## Interface IPersistRecentInstance

This interface helps manage how recent signals are saved and loaded, ensuring that backtests and live trading sessions don’t interfere with each other. It’s designed to be specific to a particular trading setup – think of a symbol, a strategy, an exchange, and a timeframe all working together.

If you want to customize how recent signals are stored (instead of using the default file storage), you can create a class that implements this interface. 

It has three main actions:

*   `waitForInit`: Sets up the storage space for a particular trading setup.
*   `readRecentData`: Retrieves the most recently saved signal for that setup.
*   `writeRecentData`: Saves a new signal as the most recent one for the defined setup, including the date/time it occurred.

## Interface IPersistPartialInstance

This interface lets you manage how partial profit and loss data is saved and loaded for a specific trading setup – think of it as a way to keep track of progress for each individual signal you're using. It focuses on a particular combination of what you're trading (symbol), the strategy you're following (strategyName), and where you're trading (exchangeName).

Each signal gets its own place to store this partial data, organized by a unique signal ID. 

You can build your own custom tools that take over the default method of saving this information to a file, essentially giving you full control over how this data is handled.

To get started, you’ll need to:

*   `waitForInit`: Tell the system to get ready and prepare the storage for the partial data in your context.
*   `readPartialData`: Retrieve the partial data that's already been saved for a specific signal and time.
*   `writePartialData`:  Save new or updated partial data for a signal.

## Interface IPersistNotificationInstance

This interface allows you to customize how trading notifications are saved and retrieved. Think of notifications as important updates or signals related to your trading activity.

It provides a way to manage these notifications separately for backtesting and live trading scenarios. You'll get a dedicated storage space for each mode.

If you want to store notifications in a database or some other location instead of files, you can create a custom adapter that implements this interface.

The `waitForInit` method sets up the storage area when needed. The `readNotificationData` method retrieves all saved notifications. Finally, `writeNotificationData` lets you store new or updated notifications.

## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for specific contexts within the backtest-kit framework, particularly when using LLM memory. Think of it as a way to manage individual pieces of information linked to a particular signal and bucket. 

It provides methods to initialize storage, read individual memory entries by their ID, check if a memory entry exists, write new entries, and softly delete (remove) them – meaning the data remains on disk but isn't shown in normal searches.

You can also use it to list all active memory entries and release any resources the storage is using when it's no longer needed. If you need a different way to store memory than the default file-based system, you can build your own storage solution by implementing this interface.

## Interface IPersistMeasureInstance

This interface defines how to persist cached data for backtest measures. It’s designed to allow you to customize how measures are stored, rather than relying solely on a file-based system. 

The system allows for a "soft delete" feature, meaning deleted entries aren’t actually erased from disk but are marked as removed and excluded from regular searches.

Here's a breakdown of the methods:

*   `waitForInit`:  Gets the storage ready when needed.
*   `readMeasureData`:  Retrieves a cached measure by its unique key.
*   `writeMeasureData`:  Saves a measure and its associated key and timestamp to the cache.
*   `removeMeasureData`:  Marks a measure as deleted without physically removing it from storage.
*   `listMeasureData`:  Provides a way to get a list of all the keys of measures that haven't been marked for deletion.

## Interface IPersistLogInstance

This interface defines how to manage persistent storage for log entries within the backtest-kit framework. It's designed for situations where you want to customize how log data is saved, moving beyond the default file-based storage.

Think of it as a way to create a single, global storage space for your logs, accessible throughout your backtesting process.

The `waitForInit` method lets you ensure the log storage is ready before you start writing anything. Reading and writing log data are handled by `readLogData` and `writeLogData` respectively. When writing, it's critical to avoid overwriting existing log entries, so the storage remains append-only. The data structure, `LogData`, is essentially a collection of log entries, each identified by a unique ID.

## Interface IPersistIntervalInstance

This interface lets you customize how backtest-kit keeps track of which time intervals have already been processed for a specific data bucket. Think of it as a way to manage flags that tell the system, "We've already done something for this time and place."

If you're using a different storage method than the default file system, you can build your own adapter that follows this interface.

Here's what you need to do to implement it:

*   `waitForInit` lets you set up your storage when a new bucket is encountered.
*   `readIntervalData` retrieves the interval data for a given key.
*   `writeIntervalData` saves new interval data, essentially marking an interval as processed.
*   `removeIntervalData` allows you to "soft-delete" a marker, making it appear as if the interval hasn't been processed, so it can be run again.
*   `listIntervalData` provides a way to iterate through all the intervals that haven't been removed.

## Interface IPersistCandleInstance

This interface defines how your backtest kit can store and retrieve historical candle data for a specific trading setup, like a symbol, timeframe, and exchange. Think of it as a way to save those crucial past price movements so you don't have to constantly re-download them.

When you're building a custom solution, you'll implement this interface to handle where and how this data is kept.

The `waitForInit` method is a signal to let the system know that storage is ready for data.

The `readCandlesData` method is how your system fetches a range of historical candles. It's important to understand that if *any* of the candles you’re looking for aren’t in storage, the entire request will return null, indicating a need to pull new data.

Finally, `writeCandlesData` is used to update the stored candle information, allowing you to save newly retrieved or calculated data. Your implementation might choose to ignore candles that are incomplete or that would overwrite existing, complete ones.

## Interface IPersistBreakevenInstance

This interface defines how your application can manage and store breakeven data for trading signals. Think of it as a way to keep track of important information about when a trade might become profitable, specific to a particular trading strategy, symbol, and exchange.

Each signal gets its own dedicated place to store this data.

If you want to change how this information is saved – perhaps storing it in a database instead of a file – you can create your own adapter that implements this interface.

The `waitForInit` method allows you to prepare the storage space when needed.
`readBreakevenData` retrieves previously saved breakeven information for a particular signal and time.
Finally, `writeBreakevenData` lets you save new breakeven data associated with a specific signal.


## Interface IPersistBase

This interface provides the fundamental building blocks for interacting with any persistence layer, like databases or file systems. It outlines the basic actions needed to manage your data: initializing the storage, retrieving data, checking for data existence, writing data, and listing all available data keys. Think of it as a contract that any custom storage solution must adhere to, ensuring a consistent way to handle data within the backtest-kit framework.

The `waitForInit` method prepares your storage, potentially setting up directories and verifying initial conditions.  `readValue` retrieves a specific piece of data, while `hasValue` simply checks if that data exists.  To update data, you use `writeValue`, which ensures your changes are written safely. Finally, `keys` gives you a way to see every piece of data you’re storing, allowing for iteration and verification of the data structure.

## Interface IPartialProfitCommitRow

This represents a record of a partial profit taking action that's been queued up within the backtest.

It tells you exactly what happened: a portion of the position was closed to realize some profit. 

The `action` property confirms it's a partial profit taking event.  `percentToClose` specifies what percentage of the position was actually closed off. Finally, `currentPrice` indicates the price at which this partial profit was executed.

## Interface IPartialLossCommitRow

This interface represents a record of a partial loss order that's been queued for execution. 

It contains information about the action taken ("partial-loss"), the percentage of the position being closed, and the price at which that partial loss was actually carried out. Think of it as a snapshot of a partial order request and its eventual fulfillment.


## Interface IPartialData

This data structure, called `IPartialData`, is used to save parts of your trading system's state, like the progress of a signal. It’s designed to be easily stored and retrieved, even when dealing with complex data.

Essentially, it contains information about the profit and loss levels that a signal has achieved.

The `profitLevels` property holds an array representing the profit levels reached, while `lossLevels` stores the loss levels. These are simplified versions of the full data, prepared for saving and later reassembling. Think of it as a snapshot of the signal’s performance, allowing you to resume where you left off.


## Interface IPartial

The `IPartial` interface manages how profit and loss are tracked for trading signals. It's used by components like `ClientPartial` and `PartialConnectionService`.

The `profit` method handles situations where a signal is making money. It figures out which profit milestones (like 10%, 20%, 30%) have been hit and announces those milestones.

Similarly, the `loss` method handles situations where a signal is losing money, marking and reporting loss milestones.

Finally, the `clear` method is used when a signal finishes trading, whether it hits a target profit, a stop-loss, or simply expires. It cleans up the record of that signal’s profit/loss and ensures everything is saved properly.

## Interface IParseArgsResult

The `IParseArgsResult` interface describes the data you get when you parse command-line arguments for your trading application. It essentially combines your initial input parameters with flags that determine the trading mode – whether you're running a backtest using historical data, paper trading with live data, or actually trading with real money in a live environment. This structure helps ensure your application knows how to behave based on how it was launched.


## Interface IParseArgsParams

The `IParseArgsParams` interface helps you set up the basic information needed to run a trading strategy. Think of it as a way to pre-define what the strategy needs to know to get started. It includes the trading pair you want to analyze, like "BTCUSDT," the specific name of the trading strategy itself, the exchange you'll be using (such as Binance or Bybit), and the timeframe for the price data – whether it's hourly, 15-minute candles, or even daily data. Basically, this interface gives you a structured way to pass in the essential details to kick off a backtest.

## Interface IOrderBookData

This interface describes the structure of order book data, which represents the bids and asks for a particular trading pair.  The `symbol` property tells you which trading pair the data pertains to, like "BTCUSDT".  The `bids` property is a list of buy orders, each with a price and quantity, showing what buyers are willing to pay.  Similarly, the `asks` property holds a list of sell orders, indicating what sellers are asking for their assets.

## Interface INotificationUtils

This interface defines the foundation for how your backtest kit system communicates notifications – things like when a trade opens, closes, or hits profit targets. It's like a set of rules that any system for sending out these notifications (like email, Slack, or a custom display) *must* follow.

Each method represents a specific type of notification event. For example, `handleSignal` covers general signal events, while `handlePartialProfit` specifically deals with when partial profits become available.  There are also methods for handling errors, getting a list of all notifications, and cleaning up when you’re done with the notification system. Essentially, it provides a standardized way to react to various events during a backtest or live trading scenario.

## Interface INotificationTarget

The `INotificationTarget` interface lets you fine-tune which notifications your backtest receives. Think of it as a filter for event updates, allowing you to subscribe only to the information you actually need, rather than receiving everything. If you don't specify this interface, you'll get all notifications by default.

Here's a breakdown of what each property controls:

*   **signal:**  Receive updates about signal lifecycle events – when signals are opened, scheduled, closed, or cancelled.
*   **partial\_profit:** Get notified when the price hits a pre-defined partial profit level.
*   **partial\_loss:** Get notified when the price hits a pre-defined partial loss level.
*   **breakeven:**  Receive notifications when the price reaches the breakeven point.
*   **strategy\_commit:** Track confirmations of different actions taken by the strategy, like partial profit or loss adjustments.
*   **signal\_sync:**  Get updates related to signal synchronization, especially important when trading live and needing to confirm order fills.
*   **risk:** Be alerted when the risk management system blocks a potential trade.
*   **info:** Receive informational messages or notes associated with a signal.
*   **common\_error:** Handle non-fatal errors that happen during the backtest.
*   **critical\_error:**  React to critical, unrecoverable errors that will end the backtest.
*   **validation\_error:**  Detect and address problems with your strategy configuration or data before the backtest even starts.

## Interface IMethodContext

The `IMethodContext` object acts as a little guide for your backtesting process. It holds the names of the different components you're using – the exchange, the strategy, and the frame – so everything can work together seamlessly. Think of it as a way to keep track of which versions of these components are being used during a specific backtest. 

It’s passed around within the system to ensure the correct strategy, exchange, and frame instances are used for calculations and simulations. The `frameName` is especially important; if it's empty, that signals you're running in live mode rather than a historical simulation.


## Interface IMemoryInstance

This interface lays out the groundwork for how different memory storage systems—whether they're simple in-memory storage, persistent storage, or just for testing—will behave. It essentially defines a standard way to interact with and manage the data held within these systems. 

You can use `waitForInit` to make sure the memory is ready before you start adding data. `writeMemory` lets you store information with a unique identifier, a description, and a timestamp. `searchMemory` is powerful for finding specific data within your memory, using a search query and a timestamp filter. 

`listMemory` provides a way to retrieve all entries up to a certain time. If you need to delete data, `removeMemory` handles that. `readMemory` allows you to get a specific piece of data based on its ID and a timestamp. Finally, `dispose` is used to clean up and release any resources used by the memory instance when it's no longer needed.

## Interface IMarkdownTarget

This interface lets you choose which detailed reports you want to see when analyzing your trading strategy. Think of it as a way to customize the level of detail in your backtesting reports.

You can toggle on or off reports for things like how your strategy performs, how risk management affects trades, when stop losses are adjusted, partial profits, portfolio analysis, optimization, scheduling, live trading events, and specific milestones like maximum profit and drawdown. Enabling these different options allows for a more focused and targeted evaluation of your strategy’s performance.

## Interface IMarkdownDumpOptions

This interface, `IMarkdownDumpOptions`, helps you control how information is exported into Markdown documents. Think of it as a set of filters that specify exactly which data to include and where to put it. It's used to organize and present your backtesting results in a structured, readable way. 

You can use properties like `path` to specify the directory for the output, `file` to name the markdown file, and properties like `symbol`, `strategyName`, `exchangeName`, `frameName`, and `signalId` to pinpoint the specific data related to a trade or simulation that should be included. This allows for highly targeted markdown reports that focus on the information you need.


## Interface ILogger

The `ILogger` interface is your way to keep track of what's happening inside the backtest-kit system. It's like a record keeper, helping you understand the flow of events and identify any issues.

It gives you different levels of logging:

*   `log`: This is for general messages about important things that happen, like agents running or data being saved.
*   `debug`: Use this for very detailed information, like what's going on step-by-step when a tool is used – mostly for developers.
*   `info`:  This level is for straightforward updates, like successful actions or confirmations that things worked.
*   `warn`: This level is for situations that might cause problems later, like unexpected conditions or features that are being phased out.

These logs can help you debug problems, monitor system activity, and keep a record of what’s been done.

## Interface ILogEntry

ILogEntry represents a single entry in your backtest's log history, providing valuable insights into what happened during the simulation. Each log entry has a unique identifier, a level indicating its importance (like "log", "debug", "info", or "warn"), and a timestamp marking when it occurred. 

The `createdAt` and `timestamp` properties are specifically designed to enhance the user experience, giving you more context around the log’s timing.  

Optional properties, `methodContext` and `executionContext`, add even more detail by describing the environment and state when the log was created.  Finally, `topic` specifies what part of your code generated the log, and `args` holds any extra information passed along with the log message itself.

## Interface ILog

The `ILog` interface gives you a way to keep track of what's happening during your backtesting or trading simulations. It lets you access a list of all the logged events, which can be helpful for debugging, analyzing performance, or just understanding the sequence of actions taken. Think of it as a record of the simulation's journey, allowing you to retrieve everything that was logged. You can grab the complete history of log entries whenever you need it.

## Interface IHeatmapRow

This interface represents a single row of data for a portfolio heatmap, focusing on the performance of a specific trading pair like BTCUSDT. It provides a comprehensive overview of a strategy’s results, combining profitability, risk metrics, and trade statistics.

You'll find key metrics like total profit/loss percentage, Sharpe Ratio (measuring risk-adjusted return), and maximum drawdown (the largest loss from a peak). The interface also details the number of trades, win/loss counts, and win rate.

It further breaks down performance by calculating average profit/loss per trade, standard deviation of results, and profit factor. Information regarding consecutive win/loss streaks, expectancy (a measure of expected return), and average peak/fall PNL percentages are also included. 

Finally, it presents several additional ratios like Sortino Ratio and Calmar Ratio which offer further perspectives on risk-adjusted performance and recovery potential from drawdowns.

## Interface IFrameSchema

The `IFrameSchema` helps structure how your backtesting periods are defined. Think of it as a blueprint for a specific segment of time you want to analyze. 

Each schema has a unique name to identify it, and you can even add a note for yourself or others to explain its purpose. 

It specifies the time interval (like daily, hourly, or weekly) and the start and end dates for the backtest.  You can also provide optional lifecycle callbacks to hook into specific events during the frame's processing. Essentially, this defines the “when” and “how often” data will be generated for your backtest.

## Interface IFrameParams

The `IFrameParams` object holds the settings needed to create a ClientFrame, which is essentially the environment where your trading strategies will run. It builds upon the `IFrameschema` and includes a logger to help you track what's happening behind the scenes and troubleshoot any issues. The `logger` property is particularly important for debugging – it allows you to output messages and data to understand the execution flow of your backtest.

## Interface IFrameCallbacks

The `IFrameCallbacks` object lets you hook into important moments in how your backtest kit frames are created. Specifically, the `onTimeframe` function gets called right after the system has built the set of timeframes it will use for the backtest. This is a great spot to check if those timeframes look correct, or just log information about them for debugging. You can also use it to perform asynchronous operations related to the timeframe generation.

## Interface IFrame

The `IFrames` interface is a core component that helps generate the timeline for your backtesting simulations. It’s essentially responsible for creating the sequence of specific points in time that your trading strategies will be evaluated against. 

The `getTimeframe` function is the key part of this interface.  You'll use it to get a list of dates and times that represent your backtest's timeline, for a given trading symbol and a named timeframe (like "1m" for one-minute intervals or "1d" for daily). These dates are calculated based on the intervals you've set up, ensuring a consistent spacing between data points for your backtest.

## Interface IExecutionContext

The `IExecutionContext` object provides essential information about the current trading environment. It’s like a little package of details passed around to help your trading strategies and exchange interactions.

You’ll find things like the trading symbol, such as "BTCUSDT", and the current timestamp, which tells you exactly when an event is happening.

It also tells you whether the code is running in a backtest, simulating past performance, or in a live trading environment. This is crucial for making decisions based on real or historical data.


## Interface IExchangeSchema

The IExchangeSchema defines how backtest-kit interacts with different cryptocurrency exchanges. Think of it as a blueprint that tells the framework where to get historical price data, how to handle trade quantities and prices according to the exchange's rules, and whether to retrieve order books or aggregated trades. Each exchange needs its own schema registered using `addExchange()`.

It includes a unique identifier for the exchange, and an optional note for developers.

The most important part is `getCandles`, which specifies how to retrieve historical candlestick data, taking into account the trading symbol, time interval, a starting date, a limit on the number of candles, and whether the backtest is running. You'll also define `formatQuantity` and `formatPrice` to ensure trade amounts and prices are represented correctly for each exchange – otherwise, defaults are used.

Optional functions are available to fetch order book data (`getOrderBook`) and aggregated trades (`getAggregatedTrades`), which provide deeper market information. Finally, you can also define optional callback functions (`callbacks`) to react to certain events, such as when new candle data becomes available.

## Interface IExchangeParams

This interface, `IExchangeParams`, defines the essential configuration needed to connect to and interact with a cryptocurrency exchange within the backtest-kit framework. It’s the blueprint for how the framework understands how to communicate with a specific exchange. 

To work with an exchange, you'll need to provide several key functions. These include fetching historical price data (candles), converting quantity and price values to the format expected by the exchange, retrieving the order book, and getting aggregated trade data. 

The framework also requires a logger for debugging and an execution context, which carries important information like the trading symbol and whether it’s a live or backtesting scenario. All these methods are compulsory, although sensible default implementations are provided within the framework to simplify setup.

## Interface IExchangeCallbacks

This allows you to react when new candlestick data becomes available from the exchange. You can define a function that gets triggered whenever new candles are pulled, letting you process that data immediately – perhaps to update visualizations or trigger other calculations.  The function receives information like the symbol, the timeframe (interval) of the candles, the starting date, a limit on the number of candles requested, and an array containing the actual candle data. It can either be a regular function or a function returning a Promise.


## Interface IExchange

The `IExchange` interface defines how backtest-kit interacts with trading exchanges. It provides core functionalities like retrieving historical and future price data (candles), calculating VWAP (volume-weighted average price), and formatting order quantities and prices to match the exchange's requirements. You can get the latest closing price for a specific interval, access the current order book, and retrieve aggregated trade data.

For fetching candle data, you have several options: get historical candles, fetch future candles (useful for backtesting), and retrieve raw candles with precise control over the date range and number of candles. The system is designed to prevent "look-ahead bias" by respecting the execution context when retrieving data. This means the historical data used for backtesting will reflect data available at the time of the simulated trade. The `getRawCandles` method allows maximum flexibility regarding data limits and date range.

## Interface IEntity

This interface, `IEntity`, serves as the foundation for all objects that are saved and retrieved from persistent storage. Think of it as the starting point for defining data that needs to be reliably stored, whether that's in a database or a file. Any class implementing this interface guarantees it has a unique identifier, ensuring each entity can be easily tracked and managed.

## Interface IDumpInstance

The `IDumpInstance` interface defines how components can save data related to a backtest run. Think of it as a way to record specific events or information during the backtest, like messages exchanged, detailed records, tables of data, plain text outputs, error details, or complex JSON objects. Each dump is associated with a unique identifier and a brief description, ensuring clear context.  The `dispose` method provides a clean way to release any resources the dump instance is using when it's no longer needed.

## Interface IDumpContext

The IDumpContext provides essential information for each piece of data being recorded, helping to organize and understand the data's origin. Think of it as a tag attached to each dump, specifying which trade it relates to (through the signalId), which strategy or agent generated it (bucketName), and a unique identifier for the specific dump itself. It also includes a helpful description that explains what the dump contains, making it easier to search and interpret. Finally, it indicates whether the data comes from a backtest simulation or a live trading environment, influencing how the data is processed and stored.

## Interface ICommitRowBase

The `ICommitRowBase` interface is a foundation for managing how trading actions are recorded and processed. Think of it as a basic building block for queuing up changes that need to happen later, ensuring everything happens at the right time during the trading process. It includes the `symbol` which identifies the asset being traded (like 'BTC-USDT') and a flag `backtest` indicating whether the trade is happening in a simulation or live environment. This separation helps to make sure that events are handled consistently.

## Interface ICheckCandlesParams

This interface defines the information needed to check if candle data already exists in storage. It lets you quickly see if you have the data you need for backtesting without having to search through files. You'll provide details like the trading pair (like "BTCUSDT"), the exchange the data comes from, the candle timeframe (like "1m" for one-minute candles), and the specific start and end dates you want to verify. Essentially, it's a way to make sure your data is ready before starting a backtest.

## Interface ICandleData

This interface represents a single candlestick, a common way to structure price data in financial markets. Each candlestick contains information about the open, high, low, and close prices, along with the trading volume for a specific time interval. The `timestamp` tells you exactly when that particular candle's timeframe began. This data is essential for tasks like calculating VWAP (Volume Weighted Average Price) and for running backtests to evaluate trading strategies.

## Interface ICacheCandlesParams

This interface defines the configuration options you can use when preparing and caching historical price data for backtesting. It lets you hook into specific points in the process – namely, before the warm-up and validation stages begin.  You can use the `onWarmStart` callback to run code just before the system starts gathering data to "warm up" the cache and the `onCheckStart` callback to run code just before the system checks if the cache is already valid. This gives you flexibility to log progress, track resource usage, or perform other actions at the start of these key steps.

## Interface IBroker

The `IBroker` interface defines how the backtest-kit framework connects to a real brokerage for order execution. Think of it as the bridge between the simulation and the actual market.

This interface provides a set of methods that the framework calls before making changes to its internal state, like opening or closing positions. If anything goes wrong during these calls, the framework rolls back any changes, ensuring everything stays consistent.

Importantly, when running in backtest mode, the framework *doesn't* actually send commands to the broker – the `IBroker` methods are simply ignored, so you can develop your broker integration without live trading.

Here's a breakdown of what each method does:

*   `waitForInit`: This is called initially to handle setup tasks such as connecting to the exchange, authenticating, and loading any necessary credentials.
*   `onSignalCloseCommit`:  Handles closing a trade, whether triggered by a take-profit, stop-loss, or manual intervention.
*   `onSignalOpenCommit`:  Confirms the opening of a new trade, marking the position entry.
*   `onPartialProfitCommit`: Deals with closing a portion of a trade to take profits.
*   `onPartialLossCommit`:  Handles closing a portion of a trade to limit losses.
*   `onTrailingStopCommit`:  Manages updates to a trailing stop-loss order.
*   `onTrailingTakeCommit`:  Handles updates to a trailing take-profit order.
*   `onBreakevenCommit`:  Deals with setting a breakeven stop-loss order.
*   `onAverageBuyCommit`:  Processes a new average-buy (DCA) entry.

## Interface IBreakevenData

This data structure, `IBreakevenData`, is designed to store a simple yes/no indicator – has a breakeven point been reached? It’s specifically created to be easily saved and loaded, often using JSON, which requires straightforward data. Think of it as a snapshot of whether a trading strategy has achieved a key milestone for a particular signal.  It’s used within the backtest-kit to track progress and is stored alongside other signal data. It represents a simplified version of the more detailed `IBreakevenState`.


## Interface IBreakevenCommitRow

This represents a single step in calculating and applying breakeven adjustments during a backtest. 

It essentially tells the system to perform a breakeven calculation. 

The `currentPrice` property holds the price level at the moment this breakeven calculation is triggered – this is the price the system uses to determine the adjusted breakeven point. Think of it as a snapshot of the price during the backtest.

## Interface IBreakeven

This interface helps track when a trade's stop-loss can be adjusted to the original entry price, essentially breaking even. 

It’s used by systems that manage trading signals and keeps track of whether that breakeven point has been reached.

The `check` method looks at the current price and determines if the price has moved sufficiently to cover trading fees and allow the stop-loss to be moved to the entry price. If so, it records that breakeven has been achieved and notifies interested components.

The `clear` method resets the breakeven tracking when a trade is closed out, removing any lingering state and ensuring everything is cleaned up properly.

## Interface IBidData

The `IBidData` interface describes a single bid or ask within an order book. It contains two key pieces of information: the price at which the bid or ask is offered, represented as a string, and the quantity of the asset available at that price, also represented as a string. Think of it as a single line from a price list, showing how much of a specific asset is being offered at a given price.

## Interface IAverageBuyCommitRow

This interface describes a single step in a queued average-buy (also known as dollar-cost averaging or DCA) process. 

Think of it as a record of one purchase made as part of a larger averaging strategy. 

It contains details like the price you bought at, how much that purchase cost, and the total number of purchases that have been made so far within this averaging commitment. It's used to track the progress and cost of a DCA buy.

## Interface IAggregatedTradeData

This data structure represents a single trade that happened during your backtesting. It bundles together key information like the price at which the trade took place, how much was traded, and when it occurred.  You’ll also find a flag indicating whether the buyer was the one providing liquidity (acting as a market maker). Each trade is uniquely identified by an `id`.

## Interface IActivityEntry

An `IActivityEntry` represents a single, ongoing trading run, whether it's a backtest or a live trade. Think of it as a record of something currently happening.

These entries are automatically created when a backtest or live trading session starts, and they disappear when it finishes or encounters a problem.

They're used internally to keep track of what's running and to prevent multiple trading processes from interfering with each other.

Each entry includes the trading pair symbol (like "BTCUSDT"), information about which strategy and exchange is running, and whether it's a backtest or a live trade.

## Interface IActivateScheduledCommitRow

This interface represents a request to activate a previously scheduled commitment. 

Think of it as a notification that something that was planned to happen is now being put into motion. 

It includes the signal's unique identifier, telling the system which signal is being activated. There's also a way to specify an activation ID, which might be useful in certain situations where an activation is triggered directly by a user.


## Interface IActionStrategy

The `IActionStrategy` interface gives your trading actions access to information about pending signals, allowing for conditional execution. Think of it as a way to ensure an action only happens when it makes sense based on the current trading situation. 

It lets you check if there's an open position (a pending signal) or a signal that's scheduled to appear in the future. 

Specifically, methods like `hasPendingSignal` and `hasScheduledSignal` let you determine if an action, such as adjusting stop-loss levels or checking for profit targets, should proceed. This helps prevent actions from being triggered prematurely or unnecessarily. It’s used by components that decide when certain actions are appropriate, like when a breakeven or partial profit target is available.


## Interface IActionSchema

The `IActionSchema` lets you extend your trading strategies with custom logic that reacts to events. Think of it as a way to hook into your strategy's execution and do things like send notifications, log data, or even update external state management tools like Redux. 

You register these custom actions using `addActionSchema`. Each action gets a unique identifier, and you can add a note to help document what it does.

The core of an action is the `handler`, which is a function or a set of functions that will be executed during each strategy-frame.  Finally, the `callbacks` property allows you to define special functions that run at specific points in the action's lifecycle, like when it's initialized or disposed. This provides a way to tightly control how your custom actions interact with the strategy.

## Interface IActionParams

The `IActionParams` object is essentially what gets passed to your actions when they run, giving them all the information they need to function correctly. Think of it as a package deal including tools for logging, identifying which strategy and timeframe the action belongs to, and knowing whether it’s a backtest or live execution.

It bundles together a `logger` to help you track what's happening, labels like `strategyName` and `frameName` to identify the context, and flags like `backtest` to adapt behavior. Importantly, it provides a `strategy` object that gives you access to crucial data like the current signal and your current positions. This allows actions to react intelligently to what's happening in the trading system.


## Interface IActionCallbacks

This interface, `IActionCallbacks`, lets you hook into the lifecycle and important events of your trading actions. Think of it as a set of customizable triggers you can use to extend the framework's behavior.

You can use these callbacks to manage resources like database connections or file handles when an action starts or finishes (`onInit`, `onDispose`). They're also useful for logging, monitoring, or saving the state of your actions.

Beyond the basic lifecycle, you get notified about various events. For instance, `onSignal` is a general notification when a trading signal is received, and it's split into `onSignalLive` (for live trading) and `onSignalBacktest` (for testing) for more specific handling.

There are also callbacks for things like breakeven or partial profit/loss events (`onBreakevenAvailable`, `onPartialProfitAvailable`, `onPartialLossAvailable`), allowing you to react to these specific conditions. 

Furthermore, you can monitor the status of scheduled and active signals (`onPingScheduled`, `onPingActive`, `onPingIdle`), and receive notifications when signals are rejected by risk management (`onRiskRejection`).

Finally, `onSignalSync` allows you to intercept and potentially prevent the framework from placing orders, giving you a chance to fine-tune the trading process—if you reject the signal, the framework will try again later.

## Interface IAction

The `IAction` interface is your central point for connecting your trading logic to the backtest-kit framework. Think of it as a set of hooks that the framework uses to communicate important events to you. You can use these hooks to react to signals, monitor breakeven points, track profit and loss levels, manage scheduled and active signals, and respond to risk rejections. It's really designed to let you build custom solutions - whether that’s feeding data to a Redux store, logging events, creating real-time dashboards, or performing custom analytics.  

Here’s a breakdown of what each hook does:

*   **signal:** This general signal handler is fired for *every* tick, whether you're backtesting or live trading.
*   **signalLive:**  Specifically for live trading, this hook fires whenever a new signal is generated.
*   **signalBacktest:** Handles signals specifically during backtesting.
*   **breakevenAvailable:** Notifies you when a stop-loss is moved to the entry price (a breakeven point).
*   **partialProfitAvailable & partialLossAvailable:**  Keep you informed of progress towards profit and loss targets (e.g., 10% profit, 20% loss).
*   **pingScheduled, pingActive, pingIdle:** Help you track the status of signals that are waiting to be activated or are already active.
*   **riskRejection:**  Signals when a potential trade is rejected due to risk assessment.
*   **signalSync:** This is crucial for limit orders; you have the power to veto a trade attempt – the framework will then try again next tick.
*   **dispose:**  A cleanup function; it's important to use this to unsubscribe from anything you’ve subscribed to, close connections, and release any resources when you're done.

## Interface HighestProfitStatisticsModel

This model holds information about the most profitable events in a backtest. It keeps track of every event that contributed to the highest profit, listing them in order from most recent to oldest. You can find the total number of these profitable events as well, giving you a sense of how frequently these peak moments occurred. Essentially, it’s a record of what led to the biggest gains.


## Interface HighestProfitEvent

This object represents a single instance of the highest profit achieved during a trading position. It captures all the key details related to that peak performance. 

Each event includes the exact time it happened (timestamp) and identifies the trading pair (symbol) and the strategy involved (strategyName, signalId). You'll also find information about whether the position was a long or short trade. 

The `pnl` property shows the total profit/loss from the entire position, while `peakProfit` specifically highlights the maximum profit earned before this point.  It also tracks the `maxDrawdown`, indicating the largest loss experienced. 

Furthermore, it records the price at which the profit record was achieved (`currentPrice`), the initial entry price (`priceOpen`), and the take profit and stop loss prices (`priceTakeProfit`, `priceStopLoss`) that were set for the trade. A flag indicates if this event occurred during backtesting (`backtest`).

## Interface HighestProfitContract

The `HighestProfitContract` helps you track when a trading position reaches a new peak in profitability. It's a structured way to receive notifications about those significant profit milestones. 

This notification bundle includes details like the trading symbol involved (e.g., BTC/USDT), the current price at the time of the update, and a timestamp. You'll also get information about which strategy, exchange, and timeframe were active. Importantly, the signal data associated with the position is included, allowing you to understand the specific signal that triggered the trade.

Finally, a flag tells you whether this profit update came from a backtest (historical data) or is happening in a live trading scenario. This is helpful for customizing your response based on the environment.

## Interface HeatmapStatisticsModel

This structure holds a collection of statistics related to a portfolio's performance, visualized as a heatmap. It provides an overview of how your portfolio is doing, broken down by individual assets.

Here's what you'll find inside:

*   **symbols:** This is a list of individual statistics, one for each asset in your portfolio.
*   **totalSymbols:** Just a count of how many different assets are included in the portfolio.
*   **portfolioTotalPnl:** The overall profit or loss for the entire portfolio.
*   **portfolioSharpeRatio:** A measure of risk-adjusted return – essentially, how much profit you’re getting for the amount of risk you’re taking.
*   **portfolioTotalTrades:** The total number of trades executed across the entire portfolio.
*   **portfolioAvgPeakPnl:**  A calculated average of the highest profit seen for each asset, weighted by the number of trades. A higher number generally indicates better performance.
*   **portfolioAvgFallPnl:** A calculated average of the deepest losses seen for each asset, also weighted by trade count. A value closer to zero is preferable.

## Interface DoneContract

This interface represents what happens when a background task, like a backtest or live execution, finishes. It provides key information about the process that just concluded. You’ll find details such as the exchange used, the name of the strategy that ran, whether it was a backtest or a live trade, and the trading symbol involved. Think of it as a report card for your trading process.

## Interface CriticalErrorNotification

This notification signals a severe, unrecoverable error that requires the application to shut down. It's a way for the system to tell you something went wrong at a critical level, and continuing would be unsafe. Each notification has a unique identifier (`id`) and a descriptive error message (`message`) to help you understand the problem. You'll also find detailed information about the error itself, including a stack trace and any relevant data, under the `error` property. Importantly, these notifications always come from a live context, so the `backtest` property is always false.

## Interface ColumnModel

This describes how to set up columns for displaying data in a table. Each column needs a unique identifier, usually a string, so the system knows which data to display. You’ll also provide a label, which is the user-friendly name that appears as the column header.

To control how the data looks, you can provide a `format` function. This function takes the raw data and transforms it into a string suitable for the table. Finally, you can use `isVisible` to conditionally show or hide columns based on certain criteria.


## Interface ClosePendingCommitNotification

This notification signals that a pending trading signal has been closed before the actual trade was executed. It provides detailed information about the closed signal, including a unique identifier and timestamp. You'll see data like the trading symbol, the strategy that generated the signal, and the exchange involved.

The notification also contains comprehensive performance metrics, allowing you to analyze the potential profitability and risk of the signal.  You'll find details on profit and loss (PNL), peak profit, maximum drawdown, and the prices and costs associated with those events. This information helps in understanding how the strategy would have performed and can be valuable for debugging or refining your trading strategies.  Finally, there's an optional note field for any additional context or explanation.

## Interface ClosePendingCommit

This signal tells the backtest engine that a position has been closed. It provides details about the closure, including a unique identifier you can provide to track why the position was closed. You'll also find information about the position’s overall profit and loss (PNL), the highest profit it reached, and the largest loss it incurred during its lifetime. 

Essentially, it's a comprehensive report card for a completed trade, letting the backtest system know the position is finished and providing key performance metrics.


## Interface CancelScheduledCommitNotification

This notification signals that a planned trading signal has been canceled before it could actually execute. It provides a wealth of detail about the canceled signal, including its unique identifier, when the cancellation occurred, and whether it happened during a backtest or live trading session. The notification also contains comprehensive performance metrics associated with the signal, such as profit and loss (P&L), peak profit, maximum drawdown, and price levels at which these values were achieved. Detailed information regarding the signal's construction, including DCA entries, partial closes, original entry price, and reasons behind the signal are also provided. Finally, it includes details about when the notification itself was created.

## Interface CancelScheduledCommit

This interface defines the structure for canceling a previously scheduled signal event within the backtest-kit framework. It’s used to communicate that a signal should no longer be executed.

The `action` property clearly identifies this as a cancellation request.

You can optionally include a `cancelId` to provide context or a reason for the cancellation, which is helpful for tracking or debugging.

Alongside the cancellation details, the request also provides information about the closed position being affected. This includes the total profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the greatest loss experienced (`maxDrawdown`) up to the point the cancellation request was made. These values offer a snapshot of the position’s performance at the time of cancellation.


## Interface BreakevenStatisticsModel

This model holds information about breakeven points reached during a trading simulation.

It keeps track of individual breakeven events, detailing each one within the `eventList` property.

You'll also find the total count of breakeven events recorded in the `totalEvents` property, giving you a quick overview of how many times the simulation reached a breakeven milestone. 

Think of it as a report card showing the history and frequency of those crucial breakeven moments.

## Interface BreakevenEvent

This data structure holds all the essential details whenever a trading signal hits its breakeven point. It’s designed to be used when creating reports to understand the performance of your trading strategies.

The event includes the exact time it happened, the trading pair involved, the name of the strategy used, and a unique ID for the signal. You'll also find information about whether it was a long or short position, the current market price, and the prices related to your entry, take profit, and stop loss levels – both the original values set when the signal started and the potentially adjusted values.

For strategies using dollar-cost averaging (DCA), it provides details on the number of entries and partial closes. Other important fields capture the unrealized profit and loss (PNL) at breakeven, a description of the signal’s reason, and timestamps to track when the position became active and when the signal was initially created. Finally, a flag indicates whether the trading was happening in backtest or live mode.

## Interface BreakevenContract

The `BreakevenContract` represents a significant milestone in a trading strategy – when a signal's stop-loss is moved back to the original entry price, essentially meaning the trade has covered its costs. This event signals a reduction in risk for the trade.

It's triggered automatically and only happens once per signal, providing a reliable way to track progress.

The contract contains detailed information about the event, including the trading symbol, the name of the strategy and exchange involved, the frame in use, the original signal data, the current price at the time of the event, whether it's from a backtest or live trading, and a timestamp for precise tracking. 

Consumers of this information include services that generate reports and users who want to monitor their strategy's safety and performance through direct callbacks.

## Interface BreakevenCommitNotification

This notification signals that a breakeven point has been reached and a trading action has been executed. It provides a wealth of information about the trade, including a unique identifier, the timestamp of the event, and whether it occurred in backtest or live mode.

You'll find details about the specific trading pair, the strategy and exchange involved, and the signal's unique ID. It outlines the entry and take profit/stop loss prices, as well as the original prices before any adjustments.

The notification also includes key performance metrics like total profit and loss (PNL), peak profit, and maximum drawdown, alongside related pricing details and percentage values.

It also details information about DCA entries, partial closes, and creation timestamps for precise tracking. Finally, a note field allows for optional, human-readable descriptions of why the signal was triggered.

## Interface BreakevenCommit

The BreakevenCommit event represents when a trading strategy hits its breakeven point. It essentially signals that a position needs to be adjusted to protect profits or limit losses.

This event provides a detailed snapshot of the trade's history and current status. You'll find information such as the current market price, the total profit and loss (PNL) realized so far, the highest profit achieved, and the biggest drawdown experienced by the position.

The event also clarifies key pricing details: the original entry price, the take profit and stop loss prices both as they were initially set and as they currently exist, and when the trade was initially opened and triggered. Understanding the position direction (long or short) is also included. Finally, timestamps mark when the signal was created and when the position was activated.

## Interface BreakevenAvailableNotification

This notification alerts you when a trade's stop-loss can be moved to the entry price, essentially breaking even. It provides detailed information about the trade, including a unique ID, timestamp, and whether it's from a backtest or live trading.

You'll find key data like the trading pair (e.g., BTCUSDT), strategy name, and the exchange used. The notification also gives specifics about the position, like the entry price, current market price, and take/stop-loss prices—both original and adjusted for trailing.

It includes a comprehensive record of the trade's performance, such as total entries, partial closes, profit and loss (both absolute and as a percentage), peak profit and maximum drawdown figures. You'll also see details about slippage and fees incorporated into the PNL calculations, as well as timestamps related to the signal's lifecycle. Finally, there’s an optional note field for a human-readable explanation of the signal's reasoning.

## Interface BacktestStatisticsModel

The BacktestStatisticsModel provides a detailed breakdown of how your trading strategy performed during a backtest. It gives you a comprehensive set of metrics to evaluate your strategy's effectiveness.

You'll find a list of every trade signal that was closed, along with all its details, like price, profit and loss (PNL), and timestamps. The model also summarizes key information like the total number of trades, how many were winners, and how many were losers.

Several crucial performance indicators are included: win rate (the percentage of winning trades), average PNL per trade, and total cumulative PNL. Risk metrics like standard deviation (measuring volatility), Sharpe Ratio (risk-adjusted return), and Sortino Ratio (similar to Sharpe but focusing on downside risk) are also available.

Additional insights include the certainty ratio which compares win size to loss size, the expected yearly returns, and metrics related to the peak and fall PNL. You'll also see ratios that gauge how well your strategy recovers from losses, like the recovery factor and the Calmar ratio. Note that most numeric values will be null if they can't be safely calculated due to potential errors or inconsistencies in the data.

## Interface AverageBuyCommitNotification

This notification lets you know when a new "average buy" (or DCA) step has been completed in an existing position. It provides a wealth of information about the trade, including the exact price and cost of the new purchase, and how it affects the overall position. You'll see details like the total number of DCA entries made so far, the effective average price, and key performance metrics like peak profit, maximum drawdown, and percentage profit/loss—all updated to reflect the latest averaging action. It also includes timestamps for various stages, identifiers for the signal and strategy, and helpful notes describing the reason for the trade. Essentially, it’s a detailed snapshot of how your DCA strategy is progressing.

## Interface AverageBuyCommit

This event, called AverageBuyCommit, is triggered whenever a new buy (or sell) order is placed as part of a dollar-cost averaging (DCA) strategy for an existing position. It provides a snapshot of the current state of the trade at that moment.

You'll see details like the price at which the averaging buy was executed, the cost of that specific buy, and how that impacts the overall average entry price. The event also shows the unrealized profit and loss (PNL), along with the highest profit and maximum drawdown the position has seen so far.

Other important information included is the original entry price, the current take profit and stop loss prices (which may have been adjusted by trailing stops), the original take profit and stop loss prices before any trailing, and timestamps related to when the signal was created and the position was activated. The `position` property confirms whether the trade is a long (buy) or short (sell) position.

## Interface ActivePingContract

The `ActivePingContract` lets you keep track of what's happening with your active pending signals. It sends out a notification, or "ping," every minute while a signal is still open and being monitored. Each ping provides details about the trading pair (symbol), the strategy that’s managing it, the exchange involved, and all the data from the original signal itself. 

You also get the current price at the time of the ping, which is valuable for creating custom rules. For example, you might want to automatically adjust or close a pending signal if the price moves significantly.

Finally, the ping tells you whether it’s coming from a backtest (historical data) or live trading. This information helps you handle the ping differently depending on the execution environment. You can set up functions to respond to these pings, either for every one or just a single instance.

## Interface ActivateScheduledCommitNotification

This notification signals that a scheduled trading signal has been activated, meaning a trade is starting. It provides a wealth of information about that trade, going beyond just the basic details. 

You'll see details like a unique ID for the notification, the exact time it was triggered, and whether it's happening in a backtest or live trading environment. It includes specifics about the trade itself, such as the trading pair (like BTCUSDT), the strategy and exchange involved, the trade direction (long or short), and prices for entry, take profit, and stop loss. 

Beyond that, it dives deep into performance metrics. You can track the trade's total profit and loss (both in USD and as a percentage), the highest profit achieved, and the largest drawdown experienced. There's even a breakdown of how those numbers were calculated, including the prices used and the number of entries involved. Finally, it includes details on when the signal was initially created and when the position became active.


## Interface ActivateScheduledCommit

This interface represents an event triggered when a previously scheduled trading signal is activated. It provides a wealth of information about the trade that's now being executed. You'll find details like the trade direction (long or short), the entry and take profit/stop loss prices, both original and adjusted for any trailing. 

The data also includes performance metrics associated with the trade up to that point, such as total profit and loss (PNL), the highest profit achieved (peak profit), and the largest drawdown experienced. 

Crucially, it includes timestamps indicating when the signal was initially created (scheduledAt) and when the position was actually activated (pendingAt).  An optional identifier allows you to track why the signal was activated. Finally, the 'action' field explicitly identifies this as an "activate-scheduled" event.
