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

This interface defines the information shared when a walker needs to be stopped. It's used to signal that a particular walker, running a specific strategy on a certain trading symbol, should be halted. This is especially useful when you have several walkers active at once, allowing you to precisely target the one that needs to be paused. The signal includes the trading symbol, the name of the strategy being used, and the unique name of the walker itself.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps organize and understand the results of backtesting different trading strategies. It's designed to make it easier to compare how various strategies performed. 

Essentially, it's a container for a list of strategy results, providing a clear way to see how each strategy fared against the others. This list allows you to analyze and compare the performance of each strategy.

## Interface WalkerContract

The `WalkerContract` represents a notification you receive as backtest-kit runs comparisons between different trading strategies. Think of it as a progress report.

Each time a strategy finishes its testing phase, a `WalkerContract` event is triggered, giving you key information.

You’ll see details like the strategy's name, the exchange and symbol being tested, and the exchange's timeframe.

The contract also provides performance statistics for the strategy, a single metric value used for ranking, and the current best value achieved so far.  You'll also get information about how many strategies have been tested, and the total number of strategies in the test set. Essentially, it allows you to monitor and understand how the strategies are performing relative to each other as the comparison proceeds.

## Interface WalkerCompleteContract

This interface represents the final notification you receive when a backtesting process is complete. It bundles all the important information about the run, including the name of the backtesting process (the walker), the financial instrument being tested (symbol), the exchange and timeframe used.

It provides details about the optimization metric used, the total number of strategies that were tested, and crucially, identifies the best-performing strategy along with its metric value and detailed performance statistics. This lets you quickly see which strategy excelled and how it performed.

## Interface ValidationErrorNotification

This notification lets you know when a validation check fails during your trading simulations. 

It’s a signal that a risk validation function encountered a problem, like an invalid parameter or an unexpected condition. 

Each notification includes a unique ID, a detailed error message designed to be understandable, and a serialized error object containing extra debugging information like a stack trace. 

Notably, the `backtest` flag is always false for these notifications because they reflect issues discovered in the live trading context, not the simulated environment.

## Interface ValidateArgs

This interface, ValidateArgs, acts as a blueprint for ensuring the correctness of names used throughout the backtest-kit system. It’s essentially a checklist to make sure you're using the right terms when referring to exchanges, timeframes, trading strategies, risk profiles, actions, sizing strategies, and parameter sweep configurations. Each property, like ExchangeName or StrategyName, expects an enum—a predefined set of allowed values—so the system can confirm that the name you're using is recognized and valid. Think of it as a way to prevent errors by double-checking your terminology.

For example, if you're specifying a strategy, the StrategyName property would hold an enum containing valid strategy names, and the validation process would confirm that the strategy you’ve chosen is actually a supported one. This helps maintain consistency and reliability in your backtesting setup.


## Interface TrailingTakeCommitNotification

This notification signals that a trailing take-profit order has been executed. It provides comprehensive details about the trade that just happened.

You'll find a unique identifier (`id`) and timestamp (`timestamp`) for tracking, along with information about whether this occurred in backtest mode (`backtest`) or live trading (`backtest`). The notification includes the trading pair (`symbol`), the strategy responsible (`strategyName`), and the exchange used (`exchangeName`).

Detailed information about the trade itself is also included:

*   The signal's unique ID (`signalId`)
*   The percentage shift of the original take profit distance (`percentShift`)
*   The current market price (`currentPrice`)
*   The trade direction (`position`) – whether it's a long (buy) or short (sell) position.
*   The entry price (`priceOpen`)
*   The adjusted take profit and stop-loss prices (`priceTakeProfit`, `priceStopLoss`) along with their original values (`originalPriceTakeProfit`, `originalPriceStopLoss`).
*   The original entry price at signal creation (`originalPriceOpen`).
*   Cost details (`cost`), leverage multiplier (`multiplier`), and number of entries (`totalEntries`) and partials (`totalPartials`).
*   A wealth of performance data, including total profit/loss (`pnl`), peak profit (`peakProfit`), maximum drawdown (`maxDrawdown`), percentage profit/loss (`pnlPercentage`), and related price and cost information for each.
*   An optional note (`note`) providing human-readable context for the signal's reason.
*   Timestamps for when the signal was scheduled (`scheduledAt`), became pending (`pendingAt`), and when this notification was generated (`createdAt`).

Essentially, this notification gives you a complete picture of a trailing take-profit event, useful for analysis, auditing, and understanding your trading strategy's performance.

## Interface TrailingTakeCommit

This interface describes a trailing take profit event within the backtest-kit framework. It essentially represents a signal generated when a trailing stop loss or take profit order is triggered.

The `action` property confirms this is a trailing-take event.

The `percentShift` value defines how the take profit level is adjusted based on price movements.

You’ll also find the `currentPrice` at the time the adjustment occurred, and detailed profit and loss information like the total PNL, peak profit, and maximum drawdown achieved by the position.

The `position` property indicates whether the trade was a long (buy) or short (sell) position. 

Key pricing details, including the original take profit and stop loss prices before any trailing adjustments, are also included.  Finally, the `scheduledAt` and `pendingAt` timestamps provide a timeline of when the signal was created and the position became active.

## Interface TrailingStopCommitNotification

This notification signals that a trailing stop order has been triggered, resulting in a trade execution. It provides a wealth of details about the trade, including a unique ID and timestamp.

You'll find information about whether the test was run in backtest or live mode, the trading pair involved, and the strategy responsible for the signal. Crucially, it includes specifics like the percent shift applied to the original stop-loss distance.

The notification details the current market price at the time of execution, the trade direction (long or short), and the entry price. You’ll also see original and adjusted stop-loss and take-profit prices, along with details like the cost of the trade and the number of entries and partials involved.

A significant portion of the notification is dedicated to performance metrics, tracking P&L, peak profit, and maximum drawdown. You can also find details about the prices and costs associated with these metrics, providing a comprehensive picture of the position's lifecycle. Finally, there are optional notes and timestamps related to signal scheduling and pending status.

## Interface TrailingStopCommit

This describes a trailing stop event, which occurs when a trailing stop-loss mechanism adjusts the stop-loss price. The `action` property confirms this is a trailing-stop related event.

The event includes important price data, such as the `currentPrice` at the time of adjustment, the `priceOpen` (entry price), and the updated `priceStopLoss` and `priceTakeProfit`.  You’ll also find the original stop-loss and take-profit prices before any trailing adjustments were made with `originalPriceStopLoss` and `originalPriceTakeProfit`.

Performance metrics of the position are also provided, including the total Profit and Loss (`pnl`), the highest profit achieved (`peakProfit`), and the largest loss incurred (`maxDrawdown`).  The `position` property indicates whether the trade is a long (buy) or short (sell) position. 

Finally, timestamps (`scheduledAt`, `pendingAt`) record when the signal was generated and when the position was activated.

## Interface TickEvent

This describes the structure of a `TickEvent`, which is a standardized way to represent any action taken within the trading system. Think of it as a single record detailing what happened – whether a trade was scheduled, opened, closed, or cancelled.

Each `TickEvent` contains various pieces of information, like the exact time it occurred (`timestamp`), the type of action that took place (`action`), and specifics related to the trade itself (like the symbol, position type, take profit/stop loss prices).  You'll find details about averaging strategies (like `totalEntries` and `totalPartials`), profitability metrics (`pnlCost`, `pnl`), and reasons for certain actions like closing or cancelling trades.  For events like scheduled orders or active positions, it will also store values related to timing and progress towards target prices. The `TickEvent` ensures consistency when you're analyzing and reporting on your trading activity.

## Interface SyncStatisticsModel

This model holds statistics related to signal synchronization events. Think of it as a way to monitor how signals are being sent and received within your system. 

It includes a complete list of all synchronization events, providing detailed information about each one. You can also see the total number of events that occurred, as well as the number of times signals were opened and closed. This helps you understand the lifecycle of signals and identify any potential bottlenecks or issues.

## Interface SyncEvent

The `SyncEvent` object bundles all the key details about what's happening with a trading signal, making it easier to create reports that explain how your strategies are performing. It provides a comprehensive snapshot of a signal's lifecycle, from initial creation to closure.

Each event captures the time it happened, the trading pair involved, the name of the strategy and exchange being used, and whether it's a live trade or part of a backtest. You'll also find a unique ID for each signal, the specific action that triggered the event (like opening, closing, or adjusting stop-loss levels), and the current market price at that moment.

The event also records the trade direction (long or short), the entry price, and the take-profit and stop-loss prices – both the initial values and any adjustments that were made.  For strategies using dollar-cost averaging (DCA), you can see the total number of entries and partial exits. 

You can track the profit and loss (pnl) of the trade, as well as the highest profit achieved and the maximum drawdown experienced, helping you understand risk and performance. If the signal was closed, the reason for the closure is also included. Finally, a timestamp string representing when the event was created is available for additional tracking.

## Interface StrategyStatisticsModel

This model holds a collection of statistics gathered during a trading strategy's execution. Think of it as a scorecard for your strategy's actions.

You’ll find a detailed list of every event that occurred, known as the `eventList`, allowing you to examine individual actions.

The model also provides simple counts for various types of events, such as the number of times a strategy canceled a scheduled order, closed a pending order, or took partial profits or losses. 

You can track how often trailing stops or takes were triggered, and even see how many times breakeven levels were hit.

Finally, it includes a count for activate-scheduled events and average buy (dollar-cost averaging) events.


## Interface StrategyPauseNotification

This notification lets you know when a strategy's pause state changes. It's triggered whenever the `setPaused` function actually modifies the strategy's pause setting.

When a strategy is paused, it stops creating new trades—the `getSignal` function isn't called and any pending trade requests are put on hold. However, any existing trades that are already open or scheduled for execution will continue to be managed and closed as usual.

Here's what the notification includes:

*   A unique ID and timestamp indicating when the change occurred.
*   Information about whether this event is happening during a backtest or in live trading.
*   The symbol, strategy name, exchange, and frame name associated with the change.
*   Confirmation of the new paused state: `true` means trading is suspended, and `false` means trading has resumed.
*   A timestamp representing when the notification itself was created.

## Interface StrategyEvent

This data structure holds all the important information about actions your trading strategy takes, like opening, closing, or adjusting positions. It's designed to be easily used to create reports detailing what your strategy is doing.

Each event includes details like the exact time it happened, the trading pair involved (symbol), the name of your strategy, and where it's running (exchange). You'll also find details specific to the action itself, such as the signal that triggered it, the price at which it executed, and any percentage adjustments being made. 

For scheduled actions, it tracks IDs like `cancelId`, `closeId`, and `activateId`. It also indicates whether the strategy is running in backtest or live mode, and the trade direction (long or short). 

Beyond the basics, you'll find information about entry and stop-loss prices, including the original values before any trailing adjustments.  If your strategy uses dollar-cost averaging (DCA), details on the number of entries and the average price are also provided. The structure also tracks timestamps, like when the signal was initially created and when the position went pending. Finally, there's a field for optional notes from your strategy's code and a record of the profit and loss at that specific event.

## Interface SignalScheduledNotification

This notification type tells you when a trading signal has been scheduled to execute in the future. It's like a heads-up that a trade is about to happen, whether you're running a backtest or live trading. The notification includes a lot of detail: a unique ID, when the signal was scheduled, and whether it's happening in a backtest or live environment.

You'll find information about the trading pair, the strategy that generated the signal, and the exchange involved. It also specifies the trade direction (long or short), target entry price, take profit, and stop-loss levels, along with their original values before any adjustments.

Beyond the basic trade details, you’ll also see information about any dollar-cost averaging (DCA) involved, partial closes, the cost of the initial position, and performance metrics like profit and loss (PNL), peak profit, and maximum drawdown, all measured in both dollar amounts and percentages. It even tracks the prices at which profit and losses were realized and the number of entries made along the way. Finally, there's a field for an optional note that provides context or reasoning for the signal.

## Interface SignalOpenedNotification

This notification tells you when a new trade has been opened by a strategy. It provides a wealth of information about the trade, including when it started, what exchange was used, and the details of the order itself like entry and stop-loss prices. You'll see data about the trade’s performance too, such as peak profit, maximum drawdown, and total profit/loss, both in USD and as a percentage. 

The notification distinguishes between backtesting and live trading and includes details about DCA (Dollar Cost Averaging) entries and any partial closes. It also specifies the trade direction – whether it's a long (buy) or short (sell) position – and includes various price points used in the position management, as well as a note for any specific reason the signal was triggered. It contains creation and pending timestamps for accurate tracking and analysis.

## Interface SignalInfoNotification

This notification type lets strategies send out informational messages related to open positions. Think of it as a way for a trading strategy to provide updates or context about a trade beyond just the buy or sell orders.

Each notification includes details like the trading symbol, the strategy that generated it, and when the event occurred.  You'll find information about the position itself, such as the entry price, take profit/stop loss levels, and the trade direction (long or short).

The notification also contains key financial data linked to the trade like costs, P&L, and drawdown information. It gives you a snapshot of the position’s performance, including peak profits and maximum losses, alongside details like entry and exit prices and the total capital invested.  Strategies can also include a custom note to provide further explanation. Lastly, there are timestamps to track when the signal was created, pending, and when the notification was generated, making it easier to trace the position's lifecycle.


## Interface SignalInfoContract

This defines the information shared when a trading strategy wants to communicate something about its actions. Think of it as a way for strategies to "announce" details about their positions, such as debugging information or custom annotations.

The notification includes key details like the trading symbol, the strategy's name, and the exchange it’s using.

It also provides access to the full data related to the signal, the current market price, and any custom notes or identifiers a strategy might add. Finally, the notification indicates whether the event is part of a backtest (historical data) or live trading. The timestamp specifies when the event occurred, aligned with either the real-time price or the candle’s time during backtesting.

## Interface SignalEventContract

The `SignalEventContract` helps you keep track of when a trading signal starts and ends without needing to monitor all the signal data. Think of it as a notification system for your positions. 

It tells you when a pending trade is opened or closed, letting you know exactly what's happening with your strategies.

This event provides essential details like the trading pair (symbol), the strategy involved, the exchange, and the timeframe. You’ll also receive the full signal data, including price levels, potential profit and loss, and other relevant signal information.

When a position closes, you'll understand why – whether it was a take profit, stop loss, time expiration, user action, or something else. You can use these events to build custom logic or simply keep a closer eye on your trading activity. 

The `backtest` flag clarifies if the event originates from a historical simulation or live trading, and the `timestamp` tells you precisely when the event occurred.

## Interface SignalData$1

This interface, `SignalData`, describes the data you'll find for each completed trading signal within a performance report. Think of it as a record of one particular trade, detailing its origin, what was traded, and how it performed. Each entry includes the name of the strategy that suggested the trade, a unique identifier for that signal, and the symbol being traded. You’ll also see the direction of the trade (long or short), the percentage profit or loss, and a reason why the signal was closed. Finally, timestamps note exactly when the signal began and ended.

## Interface SignalCommitBase

This defines the basic information included in every signal event, whether it’s from a backtest or a live trading environment. Each signal event will tell you what trading pair it's for (like BTCUSDT), which strategy generated it, and the exchange it’s associated with. You'll also find details about the timeframe being used, whether it’s a backtest or a live trade, and a unique identifier for the signal. 

Crucially, it includes the timestamp of the event, along with details about how many entries and partial closes have been made. It also stores the initial entry price.  Finally, the signal event will include the full signal data itself and an optional note to help explain the signal's reasoning.

## Interface SignalClosedNotification

This notification tells you when a trading position, initiated by a strategy, has been closed, whether it hit a take profit or stop loss. It provides a wealth of information about the trade, including a unique identifier and a timestamp of when it closed.

You'll find details about the strategy that made the trade, the exchange used, and the specific symbol being traded. Crucially, it differentiates between backtesting (simulated trading) and live trading.

The notification also breaks down the technical aspects of the trade:
*   Entry and exit prices
*   Original and adjusted take profit/stop loss levels
*   Details about DCA (Dollar Cost Averaging) entries
*   The cost of the initial position.

Beyond just the mechanics, you’ll also get performance metrics, like profit/loss (both as a percentage and in USD), peak profit achieved, and the maximum drawdown experienced. It tracks everything from the original price and total entries to partial closes and slippage. Finally, a `note` field lets you include a custom description for the reason of the signal close. The timestamp of when the signal was first created is also included.

## Interface SignalCancelledNotification

This notification appears when a trading signal, which was previously scheduled for execution, gets cancelled before it actually happens. It provides detailed information about the signal and the circumstances of its cancellation, like the reason for cancellation (timeout, price rejection, or user intervention). You’ll find details such as the signal's unique ID, when it was scheduled, the trading pair involved, the intended trade direction (long or short), and the planned entry and exit prices. 

The notification also includes comprehensive profit and loss data, although these values will be zero since the trade never occurred. Other useful data points include the leverage applied, the number of partial closes and entries planned, and details about the timing of the cancellation. This information is valuable for troubleshooting and understanding why a signal didn’t execute as planned. It also includes details about when the signal was created and any notes associated with it.

## Interface Signal

This `Signal` object holds the essential details about a trading position. It tracks the initial entry price, represented by `priceOpen`. 

You'll also find a record of all entry events, stored in `_entry`, providing details like the price, cost, and timestamp for each entry.

Finally, the `_partial` array contains information about any partial exits taken during the position's lifecycle, including the type of exit (profit or loss), percentage, current price, cost basis, entry count, and timestamp.

## Interface Signal$2

This `Signal` object represents a trading signal, keeping track of key details about a position. It stores the initial entry price, indicated by `priceOpen`.

The signal also holds a history of entry events (`_entry`), noting the price, cost, and timestamp of each entry.

Finally, it maintains a record of any partial exits, detailing whether they were for profit or loss, the percentage of the position closed, the price at the time of exit, the cost basis at the time of closure, the number of units closed, and the timestamp of the action.

## Interface Signal$1

This section describes the `Signal$1` object, which represents a trading signal within the backtest-kit framework.

It holds essential information about a trade.

The `priceOpen` property stores the price at which the position was initially entered.

The `_entry` array keeps track of all the entries made for this signal, recording details like price, cost, and timestamp.

Finally, `_partial` is an array documenting any partial exits from the position, including the type of exit (profit or loss), percentage, current price, cost basis, number of shares at the time of the exit, and the timestamp.


## Interface ScheduledEvent

This data structure represents a single event related to a trading signal – whether it was scheduled, cancelled, or opened. It’s a way to collect all the essential details about these events in a consistent format for generating reports and analyzing trading activity.

Each event includes a timestamp marking when it occurred, the type of action (scheduled, cancelled, or opened), and the specific trading pair involved. You'll find identifiers like the signal ID and position type, along with any notes attached to the signal.

It also contains pricing information like the current market price, entry price, take profit, and stop loss levels – and the original values of those levels before any modifications. If a DCA strategy was used, it tracks the total entries and partial closes.

For cancelled events, it details the reason for cancellation and a unique cancellation ID if a user initiated the cancellation. Opened events have a timestamp indicating when the position became active. Finally, it includes the unrealized Profit and Loss (PNL) and the duration of the event if it’s cancelled or opened.

## Interface ScheduleStatisticsModel

This model holds statistics related to signals scheduled for future activation. 

It gives you a clear view of how your scheduled signals are performing, tracking everything from the initial scheduling to cancellations and successful activations.

You'll find a detailed list of all scheduled events, along with overall counts of scheduled, opened, and cancelled signals.

Key performance indicators such as cancellation rate (how often signals are cancelled), activation rate (how often signals are successfully activated), and average waiting times for both cancelled and opened signals are also included. These metrics help you understand the effectiveness of your scheduled signal strategy and identify areas for improvement.

## Interface SchedulePingContract

This defines what a "schedule ping" looks like within the backtest-kit framework. Think of it as a heartbeat signal emitted every minute while a trading strategy is actively monitoring a scheduled signal – that is, when it's neither fully activated nor cancelled.

These pings provide a snapshot of the signal's status and market conditions. They include details like the trading pair (symbol), the strategy name using the signal, the exchange involved, the timeframe, all the signal’s data, the current price, and whether the execution is a backtest or live.

The `timestamp` represents the time of the ping, either the real-time time during live trading or the candle timestamp during backtesting. You can use these pings to track the lifecycle of your scheduled signals and build custom logic, perhaps to automatically cancel signals under certain price conditions. The framework lets you listen for these pings to build that custom logic.

## Interface ScheduleEventContract

This contract helps you keep track of when signals are scheduled and when they are removed, without needing to constantly monitor the entire signal flow. It lets you know when a signal is first put in place, waiting to be activated, and when it’s taken out of the system before that activation happens.

Think of it as a notification system specifically for the "waiting" phase of a signal. You can use it to build custom callbacks that react to scheduled signals being created or cancelled.

Here's what you'll find in these notifications:

*   **Action:** Whether a new signal was scheduled or an existing one was cancelled.
*   **Symbol:** The trading pair involved, like "BTCUSDT."
*   **Strategy Name:** The name of the strategy that created the signal.
*   **Exchange Name:** Where the signal is being managed.
*   **Frame Name:** The timeframe or date range the signal is associated with.
*   **Data:** All the details of the signal itself, like the ID, position size, price levels, etc.
*   **Reason:** If a signal was cancelled, this tells you *why* – perhaps it timed out, was rejected by the price, or you manually cancelled it.
*   **Current Price:** The market price at the exact moment the event occurred.
*   **Backtest Mode:** Indicates whether the event occurred during a backtest or live trading.
*   **Timestamp:** The precise time of the event.

Importantly, this doesn't tell you when a signal *activates* – that's handled through the regular signal stream. It’s solely focused on the scheduling and cancellation process.

## Interface RiskStatisticsModel

This model holds important statistics about risk events that occurred during your backtesting or live trading. It gives you a breakdown of risk rejections, allowing you to monitor and improve your risk management.

The `eventList` property provides a complete record of each individual risk rejection, including all associated details. 

You'll also find the `totalRejections` count, representing the overall number of times risk controls were triggered.

To help pinpoint the source of risk, the data is further organized: `bySymbol` shows how many rejections happened for each trading symbol, and `byStrategy` reveals which strategies were most often flagged for risk.

## Interface RiskRejectionNotification

This notification is triggered when a trading signal gets blocked by your risk management rules. It's basically a heads-up that something you tried to do didn't go through.

The notification includes a unique ID, a timestamp, and whether it happened during a backtest or live trading. It tells you which trading pair, strategy, and exchange were involved, and most importantly, *why* the signal was rejected with a human-readable explanation. 

You'll also find details about your current positions, the market price at the time of rejection, and the specifics of the signal itself – like the intended entry price, take profit, and stop loss levels. There's also information about how long the signal was expected to last and any applied leverage. Finally, it has a timestamp marking when this notification was made.

## Interface RiskEvent

This data structure, `RiskEvent`, holds information about instances where trading signals were blocked due to risk management rules. 

Think of it as a record of when the system said "no" to a trade. 

Each `RiskEvent` includes details like the exact time it happened (`timestamp`), the trading pair involved (`symbol`), and the signal that was rejected (`currentSignal`). 

You’ll also find information about which strategy generated the signal, the exchange and timeframe it was related to, and the current market price at the time. 

The `activePositionCount` tells you how many positions were already open when the rejection occurred. A unique `rejectionId` helps track specific rejection events, and `rejectionNote` provides the reason for the rejection. Finally, `backtest` indicates whether this rejection happened during a backtest or live trading.

## Interface RiskContract

The RiskContract represents a rejected trading signal due to risk validation. It’s a record of when a signal was blocked because it violated your risk management rules.

Think of it as an alert that something you wanted to trade was stopped – this contract holds all the details about that event.

You'll find information like the symbol (e.g., BTCUSDT), the exact signal that was rejected, which strategy tried to execute it, and the timeframe it was for.

It also includes crucial context: the current market price, how many other positions you already have open, a unique ID for tracking, a human-readable explanation of why it was rejected, and the precise time it happened.  Finally, it tells you whether this rejection occurred during a backtest or live trading. This information helps you understand your risk controls and fine-tune your trading strategies.

## Interface ProgressWalkerContract

This interface helps you keep an eye on the progress of a backtest walker, which is essentially a process that runs many trading strategies.

It gives you details like the name of the walker, the exchange being used, and the frame defining the strategies. 

You'll also get the total number of strategies being tested, how many have already been processed, and a percentage showing how far along the process is.  Essentially, it's a report card for your backtesting run.

## Interface ProgressBacktestContract

This interface lets you keep an eye on how a backtest is going. It provides updates as the backtest runs, giving you the exchange name, strategy name, and trading symbol involved. 

You'll see information about the total number of historical data points being analyzed, and how many have already been processed. 

The `progress` property shows you a percentage complete, so you can understand how much longer the backtest will take. This helps you monitor the backtest’s advancement.

## Interface PerformanceStatisticsModel

This model holds the performance statistics gathered from a trading strategy. It breaks down the overall performance into several key pieces of information.

You'll find the name of the strategy being evaluated, along with the total count of performance events that were logged. 

It also provides the total time it took to calculate all these metrics. The `metricStats` section provides a detailed breakdown of statistics for each individual metric type. Finally, the model includes a complete list of all the individual raw performance events that contributed to these statistics.

## Interface PerformanceContract

The PerformanceContract is how backtest-kit reports on how long things take during a backtest or live trading session. It's like a detailed log that helps you understand where your strategy is spending its time and identify any slow spots.

Each PerformanceContract event tells you when something happened, how long it took (duration), and what it was related to – like the strategy, exchange, trading symbol, and whether it's a backtest or live run.  The `previousTimestamp` allows you to track changes in performance over time.  You can use these events to profile your strategy and pinpoint bottlenecks that might be impacting its efficiency.


## Interface PauseContract

The PauseContract lets you track when a trading strategy is temporarily stopped and then restarted. This happens when the `setPaused` function is used to put a hold on new trades – no new signals are generated, but any existing trades continue to execute normally. You can use this information to inform users about these pauses and resumes, such as through a notification system like Telegram.

The contract provides details like the trading symbol involved, whether the strategy is now paused or resumed, the precise time of the change, the strategy and exchange names, the timeframe being used, and a flag indicating whether this change occurred during a backtest or live trading. This comprehensive data allows you to handle the pause/resume events appropriately based on the context.

## Interface PartialStatisticsModel

This model helps you understand the results of a backtest when you're looking at partial trades—those that aren't all-in or all-out. It gives you a breakdown of the individual events that occurred during the backtest.

You’ll find a detailed list of each event in the `eventList` property, allowing you to examine what happened during each milestone.

The `totalEvents` property tells you the total number of these profit/loss events that were recorded. 

Beyond that, you can quickly see the overall performance with `totalProfit` (the number of profitable events) and `totalLoss` (the number of losing events).


## Interface PartialProfitContract

This describes a partial profit event – a notification when a trading strategy reaches a specific profit milestone during execution. Think of it as a progress report on how well a trade is doing, showing when it's hit, say, 10%, 20%, or 30% profit. These events are generated by the trading system and let you track the performance of strategies and how they are performing in terms of profits.

Each event contains several key details to understand what happened:

*   The trading symbol (like BTCUSDT)
*   The name of the strategy that triggered it
*   The exchange and frame where the trade is happening
*   The original data from the signal that started the trade
*   The current price at which the profit level was achieved
*   The specific profit level reached (10%, 20%, etc.)
*   Whether it’s a backtest (historical data) or live trade
*   The exact time the event occurred.

The system makes sure each level is only reported once for each signal and can send multiple levels at once if the market moves significantly. Different parts of the system, like reporting tools and user notifications, can use this information.

## Interface PartialProfitCommitNotification

This notification tells you when a partial profit has been taken on a trade. It provides a wealth of information about the trade, including the unique identifier, when it happened, and whether it was a backtest or a live trade. You'll find details like the trading pair, the strategy that triggered it, and the specific percentage of the position that was closed.

The notification also includes pricing information like the entry price, take profit price, and current market price. It describes the trade direction (long or short) and offers a comprehensive view of the position's performance, including peak profit, maximum drawdown, and profit/loss percentages. You can see how the PNL was calculated, the cost of the trade, the number of entries and partials, and even a note explaining the reasoning behind the signal. Finally, there's information about when the signal was scheduled, pending, and when this notification itself was created, providing a full timeline of the trading event.

## Interface PartialProfitCommit

This describes an event triggered when a trading strategy takes a partial profit. It indicates that a portion of an existing position is being closed.

The `action` property confirms this is a partial profit event. The `percentToClose` specifies what percentage of the position will be closed.

You’ll also find details about the position itself, including its direction (`position`), entry price (`priceOpen`), and originally set take profit and stop loss levels (`priceTakeProfit`, `priceStopLoss`, `originalPriceTakeProfit`, `originalPriceStopLoss`).

The framework provides information on the position’s performance to that point, like the total profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the largest drawdown experienced (`maxDrawdown`).

Finally, timestamps (`scheduledAt`, `pendingAt`) show when the signal was created and when the position initially went live. The `currentPrice` reflects the market price at the time the partial profit signal was generated.

## Interface PartialProfitAvailableNotification

This notification signals that a trading strategy has reached a predefined profit milestone, like 10%, 20%, or 30% gain. It's a way to track progress towards your profit targets.

The notification includes a lot of details about the trade, such as the specific trading pair, the strategy used, and the exchange where the trade took place. You'll find information about the entry price, current market price, and the trade's direction (long or short).

It also provides extensive financial data, including the total profit and loss (both in USD and as a percentage), peak profit achieved, and maximum drawdown experienced. You can see how the profit and loss are calculated, considering factors like slippage and fees.

If the position has been partially closed, this notification tells you how many partial closes have happened so far. It also shares details about how many entries were used and information on the original take profit and stop loss prices. 

Finally, there's a timestamp for when the milestone was reached, a unique identifier, and a note that might explain the reasoning behind the trade. You can also determine if the notification is coming from a live trade or a backtest simulation.

## Interface PartialLossContract

The PartialLossContract represents notifications about a trading strategy hitting predefined loss levels, like -10%, -20%, or -30% drawdown. These events are triggered when a signal experiences a loss milestone.

You'll find details like the trading symbol, the name of the strategy generating the signal, and the exchange and frame involved.  It includes the original signal data, the current price at the time of the event, and importantly, the percentage loss level reached.

The `backtest` flag tells you whether this event occurred during a historical backtest or a live trading session.  Each loss level event is sent only once per signal, even if multiple levels are triggered quickly. The timestamp indicates when the loss level was detected - either at the exact moment in live trading or based on the candle during backtesting.

## Interface PartialLossCommitNotification

This notification informs you about a partial closing of a position, providing a wealth of details about the trade. It tells you *when* the partial close happened (timestamp), *which* strategy was responsible, and *where* the trade was executed (exchange). You’ll find the unique identifier for the signal and the percentage of the position that was closed.

The notification also gives a full picture of the position's performance, including the entry and take profit/stop loss prices, original values before trailing adjustments, and overall profit/loss (pnl).  You can see peak profit and maximum drawdown information, along with the prices and costs associated with those moments.

Detailed data is available about the initial investment – entry price, cost, and the number of entries used if DCA averaging was involved.  Information about the multiplier used and the total entries and partials executed is included. There’s even an optional note providing more context for the trade. Finally, you can see when the signal was scheduled and when the position became active.

## Interface PartialLossCommit

This data represents a partial loss event during trading. It signifies that a portion of an existing position is being closed, rather than the entire position. 

The `action` property confirms this is a partial loss. The `percentToClose` indicates what percentage of the position is being closed, for example, closing 50% of the position. 

Alongside this, the record provides key information about the position itself, including its direction (long or short), the original entry price (`priceOpen`), and any take profit or stop loss prices that were in place. You’ll also find the current market price when the partial loss signal was generated. 

Crucially, it includes performance metrics associated with the position up to this point—total profit and loss (`pnl`), peak profit achieved, and maximum drawdown experienced. 

Finally, timestamps, such as `scheduledAt` and `pendingAt`, provide a timeline of when the signal was created and when the position was initially activated.

## Interface PartialLossAvailableNotification

This notification lets you know when a trading strategy has hit a predefined loss level, like -10%, -20%, or -30% of its initial capital. It's a way to track how a strategy is performing and identify potential problems early on, whether you’re running a backtest or a live trading strategy.

Each notification includes a unique ID and timestamp, along with details like the trading symbol, strategy name, and exchange. You'll also find information about the trade itself, including the entry price, stop-loss levels (both original and adjusted for trailing), the trade direction (long or short), and the current market price at the time of the loss milestone.

Beyond the basic trade details, the notification provides a comprehensive performance snapshot. You can see the total profit or loss (PNL) of the position, including how it’s performed relative to the original entry price and how it compares to peak profit and maximum drawdown events. It also gives you insights into the number of entries and partial closes, total invested capital, and the multiplier used for leverage.  Finally, there's a 'note' field for any human-readable explanation of why the signal was triggered.

## Interface PartialEvent

The `PartialEvent` object holds information about important milestones during trading, specifically when a profit or loss level is hit. Think of it as a snapshot of what happened at a key point in a trade.

It includes details like the exact time of the event, whether it was a profit or a loss, and which trading pair was involved. You'll also find information about the strategy used, the signal that triggered the trade, and even the entry and exit prices.

For strategies using techniques like dollar-cost averaging (DCA), it tracks the total number of entries and the amount of partial closures executed.  It also holds information about the signal's original take profit and stop loss targets, as well as a human-readable note explaining the reason for the signal. 

Finally, the object includes details about when the position became active, when the signal was scheduled, and whether the trading is happening in backtest mode or live. It also tracks the current unrealized profit and loss (PNL) at the time of the event.

## Interface OrderSyncOpenNotification

This notification signals the opening of a trading position, whether it's a direct order or a resting order placed as part of a scheduled signal. It provides comprehensive details about the trade, including a unique identifier, the exact time it happened, and whether it occurred during backtesting or live trading.

You’ll find important information like the trading pair, the name of the strategy that generated the signal, and the exchange where the trade took place. Crucially, it specifies the `orderType`: whether it was an immediate "active" order or a "schedule" order placed in anticipation.

The notification also includes detailed performance metrics, like profit and loss (pnl), peak profit, and maximum drawdown, along with associated prices and costs.  You can see the entry and exit prices used for PNL calculations, and details about how many entries and partials were executed.

Furthermore, it provides specifics about the trade’s parameters, such as the initial price, take profit, stop loss, and the number of entries and partials involved, along with timestamps showing when the signal was scheduled and when the position went live. Finally, a `note` field allows for an optional human-readable explanation of the signal’s reasoning.

## Interface OrderSyncCloseNotification

This notification lets you know when a pending trading signal has been closed, whether it was because of a take profit or stop loss, time expiration, or manual closure. It provides a wealth of detail about the closed position, including when it was created, the trading pair involved, and the exchange used. You'll find metrics like total profit/loss, peak profit, and maximum drawdown, along with the specific prices and costs associated with the trade. The notification also keeps track of details like the number of entries made and any partial closures, allowing you to analyze the complete trading lifecycle and understand the factors that influenced its outcome. It specifies if this occurred during a backtest or live trading scenario.

## Interface OrderSyncCheckNotification

This notification provides a snapshot of an active trading position, acting as a check to ensure the order placed by your strategy is still valid with your external order management system. It’s essentially a "ping" to confirm the order hasn't been cancelled or modified. These notifications happen whenever a strategy is actively trading and are throttled to prevent overwhelming the system.

Here's a breakdown of what the information tells you:

*   **Details about the signal:** Includes things like the strategy name, exchange, trade direction (long or short), and the original and effective prices for entry, take profit, and stop loss.
*   **Performance metrics:** You'll find key performance indicators like realized and unrealized profit/loss (PNL), peak profit, and maximum drawdown - providing insight into the position's profitability and risk profile.
*   **DCA and Partial Closures:** Information about how many entries were used for averaging and how many partial exits have occurred.
*   **Timestamps:**  Dates and times associated with key events like signal creation, pending status, and when the ping was emitted.
*   **Signal Context:** Details like the signal ID, the reason for the signal (note), and the original cost of the position.

Essentially, this notification is a detailed report card for each open trade, helping you monitor its status and performance.

## Interface OrderSyncBase

This defines the common information shared across different order synchronization events within the trading framework. It provides a foundational structure for understanding what's happening with orders, whether they are being actively managed or scheduled.

You'll find details like the trading symbol ("BTCUSDT"), the name of the strategy that triggered the order, and the exchange being used.  It also tells you if the activity is part of a backtest or live trading.

Crucially, the `signalId` links the event to a specific signal, and `attempt` tracks how many times the framework has tried to execute this order – a higher number indicates potential issues and retries. Knowing the `type` helps differentiate between active order events (like opening or closing positions) and events related to orders placed as part of a scheduled signal. The `signal` property contains all the information about the signal itself at the time of the event.


## Interface OrderStopContract

This event signals that a trading order has reached a terminal state – it's no longer active or scheduled. Think of it as a notification that the system has permanently concluded something about an order it was watching. It happens just before the system finishes up its work related to that signal.

The reason for this conclusion can be that the order was unexpectedly removed from the exchange (perhaps filled or cancelled elsewhere), or that the system encountered too many temporary errors trying to confirm its status.  You'll see details like the trading pair, strategy name, exchange, timeframe, a unique identifier for the signal, and the timestamp when it occurred.  

The event includes extensive information about the trade, such as entry and exit prices, profit/loss, and details about any averaging or trailing adjustments that might have happened.  Notably, this event only occurs in live trading environments; it doesn't happen during backtesting. It's a notification-only event, so any errors in your listener won't interrupt the process.

## Interface OrderStopCheckNotification

This notification signals a terminal event related to an order, specifically when an order check resolves definitively. It's a rare occurrence, happening only once per monitored signal when the check concludes with either the order being deleted (meaning it couldn't be found) or the maximum retry attempts have been exhausted. The notification provides comprehensive details about the order, the signal that generated it, and the position’s performance – including entry and exit prices, profit/loss data (both absolute and percentage), and details about trailing stop-loss and take-profit adjustments. The `reason` property clarifies whether the termination was due to the order being deleted or reaching the maximum retry limit. A wealth of information about the position's history, such as peak profit, maximum drawdown, and individual entry details like total entries and partials, is also included. This notification is exclusively for live trading environments and isn't associated with backtesting.

## Interface OrderRejectOpenNotification

This notification alerts you when a trading order is definitively rejected by the exchange – it's a signal that retrying the order isn't worthwhile. It only happens when the system definitively knows the order won’t go through, not for temporary hiccups.

Here's a breakdown of the details you'll receive:

*   **Unique Identifiers:** It includes a unique ID for the notification, a timestamp of rejection, and a unique signal ID.
*   **Trade Details:** You'll see the symbol being traded, the strategy involved, the exchange that rejected the order, and the type of order that failed (either a new position or a scheduled order).
*   **Attempt History:** The 'attempt' number tells you how many times the system tried to place the order before it was ultimately rejected.
*   **Reasoning:** A descriptive error message explains why the exchange refused the order.
*   **Current Market Conditions:** You’ll get the current market price and a snapshot of the position's performance up to that point, including peak profit, maximum drawdown, and related pricing information.
*   **Order Parameters:** Details about the original and adjusted take profit, stop loss, and entry prices are provided.
*   **Additional Context**: Additional data is given about the signal’s creation and activation, its position (long or short), DCA entries, partial fills, and an optional note explaining the signal's purpose.

Essentially, this notification provides a comprehensive view of why an order was rejected, along with crucial information about the state of the position at that moment.

## Interface OrderRejectOpenContract

This describes a situation where a trading order was rejected while it was already in progress. Specifically, it means either an attempt to open a new position or a scheduled entry placement didn't go through. 

The trade attempt is considered failed and the signal associated with it is no longer usable.

The `action` property clarifies *what* was rejected – whether it was the initiation of a position ("signal-open").  The `cost` property tells you the total cost associated with this failed order.

## Interface OrderRejectCloseNotification

This notification signals that a closing order was rejected by the broker – essentially, the broker refused to close your position. It's a live-only event, meaning it only happens with real trades, not during backtesting. It’s triggered when the attempt to close a position fails due to a problem with the broker, like connectivity issues or an internal error, and the attempt ends with a rejection.

The notification provides a wealth of detail to understand the rejection. You'll find a unique identifier for the event, a timestamp marking when it occurred, and the specific reason for the rejection provided by the broker. It also includes comprehensive performance metrics for the position, like P&L, peak profit, and maximum drawdown, giving context to the situation when the rejection occurred. 

You'll also find details like the strategy and exchange involved, the signal’s identifier, the order type, and the number of previous failed attempts before this rejection. Information about the position itself – its type (long or short), entry and exit prices, and stop-loss/take-profit levels – is also included, as well as the cost of the initial entry and the number of entries/partials involved. Finally, there's a timestamp for when the signal was created and a note field for any additional explanation of the rejection.

## Interface OrderRejectCloseContract

This describes what happens when a trading strategy's attempt to close a position is completely rejected. It means the system couldn’t fulfill the closing order. 

Think of it as a definitive "no" to exiting a trade.

The `action` property always indicates this is a "signal-close" rejection.

Crucially, the `closeReason` explains why the closing order was refused – it's the original reason that triggered the closing attempt in the first place.

## Interface OrderRejectBase

This interface describes what happens when a trading order is definitively rejected by the exchange—meaning it's not something that can be retried. It's a notification sent when the system can't fulfill an order, and it's *only* triggered in live trading environments, not during backtesting. You'll receive this notification once per failed order attempt, providing detailed information about the rejected order, including the trading symbol, the strategy that generated the signal, the reason for the rejection (from the broker's error message), and important data like current price, profit/loss snapshots, and entry/stop-loss prices.

The event distinguishes between rejected "active" orders (like openings, fills, and closures) and "schedule" orders (related to placing orders at scheduled signal creation).  It also includes details on the number of consecutive attempts made before the rejection, and various price points related to the trade. The `signalId` is particularly important as it links this rejection back to a specific signal.  Critically, this notification *doesn't* affect the trading verdict – it's purely for informational purposes and should not be used to influence trade logic.

## Interface OrderOpenContract

This event signifies that a limit order has been filled, allowing the framework to enter a new position. It's primarily used to keep external systems in sync with what’s happening on the exchange – confirming that your buy or sell order was actually executed. 

During backtesting, this event is triggered when the price hits your defined entry point (lower than your limit for long positions, higher for short positions). In live trading, it happens when the exchange confirms the order fill.

The event provides detailed information about the trade, including the entry price, current market price, profit and loss (both total and peak), drawdown, and the original take profit and stop loss levels. You'll also find information about how the position was built – whether it involved averaging entries or partial exits. This helps in tracking how the trade was managed from start to finish, with timestamps indicating when the signal was initially created and when the position was actually activated.

## Interface OrderFillOpenNotification

This notification confirms a trading order has been filled or a resting order has been placed – it's a signal that the exchange has actually acted on your trading instructions. It happens *after* a confirmation process, so you know the order definitely went through. This notification is only available for live trading, not backtesting.

The notification provides a wealth of information, including the exact time of confirmation, the trading symbol, the strategy that triggered the order, and details about the order itself (type, direction). You'll find key performance indicators like PnL, peak profit, and maximum drawdown, along with pricing details and entry/exit prices. All this data helps you understand how your strategy is performing and diagnose any issues. The `attempt` field tells you how many times the system tried to execute the order before it succeeded.

## Interface OrderFillOpenContract

This describes a notification you'll receive when a trade order is confirmed—either because a new position was opened, or a resting order was placed. 

Essentially, it tells you something happened with an order you submitted. The `action` property tells you exactly what happened: it's either a "signal-open" for a newly opened position, or a "schedule" indicating an order was placed and is waiting. You'll also get the `cost` associated with that trade, representing the total cost involved.

## Interface OrderFillCloseNotification

This notification confirms a completed trade on a live exchange—it’s the final confirmation that your order actually went through. It’s sent only after the exchange has confirmed the trade, so you know it's a real event, not just a temporary or failed attempt.

The notification contains a wealth of information about the trade, including a unique ID, when it happened, and the strategy that initiated it. You'll find details about the trading pair (like BTCUSDT), the exchange used, and the type of order.

It also provides key performance indicators (KPIs) for the position: profit and loss (PNL), peak profit, maximum drawdown, and related metrics like entry and exit prices, all expressed in USD. You can see how the position performed throughout its lifecycle, revealing the highest profit achieved and the largest loss experienced.

Finally, it includes details about the original order, any trailing stop adjustments, and the reason for closing the trade—whether it was a take profit, stop loss, or a time-based closure. It even includes the original price and the total number of entries and partial closes.

## Interface OrderFillCloseContract

This describes when a trade has been fully closed, meaning the order to exit the trade has been confirmed by your broker. 

It’s a record showing that a position was closed, whether it was due to a take profit, stop loss, time expiry, or manual closure. 

The `action` property always indicates that this is a closing event. The `closeReason` provides more detail about *why* the trade was closed – for example, was it a profit target being hit, a loss limit being triggered, or something else?

## Interface OrderFillBase

This describes the information you receive when an order is actually filled – meaning the broker confirms the order went through. It's important to know that you won't see these fills during backtesting or when orders are rejected or transiently fail. This event provides a wealth of details about the trade, including the trading pair symbol, the strategy that initiated it, and the exchange used.

You'll find information like the signal identifier, a timestamp, the full signal data, and details about any previous failed attempts. It also includes key metrics like profit and loss (PNL), peak profit, and maximum drawdown. 

The `type` property distinguishes between 'active' fills (for opening, closing, or reactivating positions) and 'schedule' fills (when an order is placed based on a scheduled signal). The event also contains details about the entry and exit prices, including original prices before any trailing adjustments and the number of DCA entries and partial closes.

## Interface OrderContinueContract

This event signals that the system is continuing to monitor an order on an exchange. It's a follow-up to an initial check on the order and indicates the system believes the order is still open and active. You'll receive this event periodically while the order remains monitored, and it’s distinguished by whether it’s related to an active position ("active") or a pending order ("schedule").

The `attempt` value tells you if the checks are confirming the order is healthy (0) or if transient issues have been tolerated while still keeping the order open (a number greater than 0, indicating a streak of tolerated failures). The data provided includes details about the trade, such as the symbol, strategy name, exchange, timeframe, signal identifier, and timestamp.

You'll also find performance data, including current price, unrealized profit/loss (PNL), peak profit, maximum drawdown, and entry/stop loss prices – both the effective, potentially adjusted prices, and the original values before any trailing or averaging. Finally, details about the signal itself, such as when it was created, when the position was activated, and the number of entries or partial closures. Keep in mind that backtesting doesn't perform these order checks.

## Interface OrderContinueCheckNotification

This notification lets you know about the status of an order check – essentially, a health check on an open order. It’s triggered when a check passes, but isn't immediately resolved (meaning it’s still open or a minor issue was tolerated). 

Think of it as a signal that the system is actively watching an order.

Here's what the data tells you:

*   **Key Details:** You’ll see unique IDs, timestamps, and information about the trading symbol, strategy, exchange, and signal.
*   **Order Type:** Tells you if it’s an active order supporting an open position, or a resting order awaiting activation.
*   **Failure History:**  The 'attempt' number indicates if any temporary issues were handled.  A value greater than zero means a problem was caught and allowed to continue.
*   **Price and Position:** Provides current market price, trade direction (long or short), and the effective prices for entry, take profit, and stop loss (which might be adjusted by trailing).
*   **Financials:** You'll find details on the total cost, DCA entries, partial closes, P&L (both as raw numbers and percentages), and the peak profit/drawdown experienced by the position.
*   **Timestamps:**  You get information about when the signal was scheduled, when the position became active, and when the notification itself was created.
*   **Note:** A field to add custom descriptions.

This notification is only sent for live orders, and is managed to avoid being sent too frequently.

## Interface OrderCloseContract

This event notifies you when a trading signal has been closed, whether that's because it hit a take profit or stop loss, timed out, or was manually closed. It provides a wealth of information to help you keep track of your trades and manage external systems.

You'll receive this notification whenever a signal is closed, and it includes the current market price at the time of closure.

It also gives you key performance details like the profit and loss (both total and peak), as well as the maximum drawdown experienced during the trade. You'll find information about the trade direction (long or short), the entry and exit prices (both original and potentially adjusted for trailing stops or averaging), and the reason the signal was closed.

Finally, it contains data about any averaging or partial closing that occurred during the trade, letting you understand the trade’s lifecycle in detail. It's designed for syncing with external systems, logging trades, and auditing activity.

## Interface OrderCheckContract

This event, called `OrderCheckContract`, is a signal that helps the system confirm whether orders placed by a trading strategy are still active on the exchange. Think of it as a regular check-in to make sure everything’s still in order.

It's fired whenever a signal is being monitored, *before* the system decides if a signal has been completed. The signal tells you whether it's checking on an existing open position ("active" type) or a pending order waiting to be filled ("schedule" type).

How you respond to this signal is crucial. If the order is still open, acknowledge it – the system will continue monitoring. If the order is gone (filled, cancelled, or liquidated), you must immediately report this by throwing an error; the framework will then close or cancel the signal. Transient errors during the check are tolerated, with multiple attempts before a terminal action.

This event doesn't happen during backtests because backtests don’t interact with a live exchange.

The signal provides a lot of detail:

*   The trading symbol, strategy name, and exchange where the order was placed.
*   The signal’s unique identifier, timestamp, and the complete signal data.
*   A counter tracking consecutive check failures, to handle temporary communication issues.
*   Current market price, unrealized profit/loss, and drawdown data for the position.
*   Details about the entry, take profit, and stop-loss prices, both original and adjusted.
*   Timestamps related to when the signal was created and the position was activated.
*   Number of DCA entries and partial closes that have occurred.



This allows adapters and actions to act on the order's status and react accordingly.

## Interface MetricStats

This object holds a collection of statistics related to a particular performance measurement. It essentially summarizes how often a specific metric was recorded and provides details about its performance.

You'll find information like the total number of times the metric was observed (count) and the total time it took across all those instances.

The statistics also break down the performance into more granular details: average duration, minimum and maximum values, standard deviation, and percentiles (like the 95th and 99th percentile).

Finally, it includes statistics about the time spent waiting between events, giving you a picture of the spacing or latency associated with the metric.

## Interface MessageModel

This framework defines a `MessageModel` to represent a single message within a conversation, like you'd see in a chat history.  Each message has a `role` which specifies who sent it – whether it's a system instruction, a user's input, a response from the assistant, or the result of using a tool. The `content` property holds the actual text of the message.  Some providers also offer a `reasoning_content` field to show the model's thought process.  Assistant messages can also include `tool_calls` if they used a tool, and can contain `images` as blobs, raw bytes, or encoded strings. Finally, a `tool_call_id` identifies which tool call this message is a response to.

## Interface MaxDrawdownStatisticsModel

This model helps you understand maximum drawdown events during a trading simulation. It keeps track of individual drawdown events, storing them in a list called `eventList`, ordered from most recent to oldest. You'll also find a count of all recorded events in the `totalEvents` property. Think of it as a detailed log of the worst performance periods observed.

## Interface MaxDrawdownEvent

This object represents a single instance where a maximum drawdown occurred for a particular trade. It contains detailed information about the event, allowing you to understand exactly when and why the drawdown happened.

You'll find the exact time of the drawdown (timestamp), the trading pair involved (symbol), and the name of the strategy that generated the trade (strategyName). Each trade also has a unique identifier (signalId) and indicates whether it was a long or short position.

The record also includes the profit and loss (pnl) realized from the trade so far, along with the highest profit achieved (peakProfit) and the extent of the maximum drawdown (maxDrawdown).  It provides the price at which the drawdown occurred (currentPrice), the original entry price (priceOpen), and the pre-defined take profit and stop loss levels (priceTakeProfit, priceStopLoss). Lastly, it indicates if the drawdown occurred during a backtest simulation (backtest).

## Interface MaxDrawdownContract

This contract provides information when a new maximum drawdown is reached for a trading position. It gives you details like the trading symbol, the current price at the time, and when the event happened. 

You'll also see the name of the strategy, exchange, and timeframe involved, alongside the signal data related to the position.

A key piece of information is whether the update came from a backtest or live trading environment, which is helpful for tailoring your response. This data helps you monitor and manage risk by tracking the largest loss from a peak value within a position. The framework sends these updates whenever a new drawdown level occurs, enabling real-time adjustments to your trading strategy.

## Interface LiveStatisticsModel

This model provides a detailed snapshot of your live trading performance, offering a wide range of statistics to analyze your strategy. It tracks every event – from initial setup to closed trades – giving you a complete history of your activity. 

You'll find key performance indicators like win rate, average profit per trade, total profit, and volatility measures (standard deviation, Sharpe Ratio). It also goes beyond basic metrics, calculating things like recovery factor, expectancy, and even average durations of winning and losing trades.

To get a deeper understanding of market dynamics, it calculates pressure metrics (buyerPressure, sellerPressure, buyerStrength, sellerStrength) and trend analysis (trend, trendStrength, trendConfidence). Values are often represented as percentages, and a 'null' value indicates the calculation couldn't be safely performed due to unstable data. By examining these comprehensive metrics, you can better assess the strengths and weaknesses of your trading system and identify areas for improvement.


## Interface InfoErrorNotification

This notification type signals that something went wrong during a background process, but it's not necessarily a critical failure that stops everything. 

Think of it as an alert that something needs attention. 

Each notification has a unique ID so you can track it. It also includes a detailed error message designed to be understandable, plus a serialized error object containing important technical details like the stack trace. 

Importantly, these errors originate from the live trading context, not the backtest itself, so the `backtest` property will always be false.


## Interface IdlePingContract

This contract represents notifications about periods of inactivity in your trading strategies. Think of it as a signal that a strategy isn't actively making trades. 

It’s emitted when a strategy isn't monitoring any pending or scheduled trading signals.  You can use these notifications to understand the lifecycle of your strategies and how often they're truly active.

The event provides important details like the trading symbol ("BTCUSDT"), the name of the strategy that's idle, the exchange where it's running, and whether it’s part of a backtest or live trading.  You'll also get the current price at the time of the ping and a timestamp.

You can subscribe to these notifications using `listenIdlePing()` or `listenIdlePingOnce()` to receive alerts whenever a strategy enters an idle state.


## Interface IWarmCandlesParams

This describes the settings you provide when you want to prepare historical candle data for a backtest. It lets you specify the trading pair (like BTCUSDT), the exchange you're using, and the timeframe for the candles (like 1-minute or 4-hour). You also define the start and end dates that outline the historical data you want to download and store beforehand, ensuring a smoother backtesting experience.

## Interface IWalkerStrategyResult

This interface defines the structure of results you get when running a trading strategy through the backtest kit. It bundles together key information about a specific strategy’s performance.

You'll find the strategy's name recorded here, along with a set of statistics summarizing its backtesting results. A crucial value is the 'metric' which is used to compare different strategies against each other; it might be null if something went wrong during calculation. Finally, the 'rank' tells you how well this strategy performed relative to the others, with a rank of 1 being the best.

## Interface IWalkerSchema

The IWalkerSchema describes a set of strategies you want to test against each other, like an A/B test. 

Think of it as a blueprint for how you'll run a backtest comparing different trading strategies. 

You give it a unique name, and you can add a note for yourself to remember why you set it up this way. 

It specifies which exchange and timeframe to use for all the strategies within the test, ensuring a fair comparison. 

Crucially, you tell it which strategies to include – these strategies must already be registered within your backtest system. 

You can choose which metric to optimize, like Sharpe Ratio, to see which strategy performs best. Finally, it allows you to add optional callbacks to monitor or react to events during the backtest process.

## Interface IWalkerResults

The `IWalkerResults` object holds all the information gathered after a full comparison of different trading strategies. It tells you which asset, or symbol, was being tested. It also specifies the exchange and the name of the walker used for the tests. Finally, it includes the name of the timeframe (like daily, hourly) that was used during the backtesting process.

## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you hook into different stages of the backtesting process when comparing strategies. You can use these callbacks to track progress, log results, or handle errors. 

Specifically:

*   `onStrategyStart` is triggered right before a particular strategy is tested, giving you a chance to prepare.
*   `onStrategyComplete` runs when a strategy's backtest is finished, providing you with statistics and performance metrics.
*   `onStrategyError` is called if a strategy encounters a problem during backtesting, allowing you to catch and potentially react to errors.
*   `onComplete` signals that all strategies have been tested, so you can perform final processing or display overall results.

## Interface ITrailingTakeCommitRow

This interface represents a queued action related to trailing take commit orders. It's used internally to manage actions that adjust orders based on a trailing price.

Think of it as a record of what needs to happen – whether to adjust a trailing take order – and the details of that adjustment.

The `action` property simply confirms this is a trailing take action.

`percentShift` defines how much the price needs to move before the order is adjusted, expressed as a percentage.

Finally, `currentPrice` stores the price at the moment the trailing order was initially set.

## Interface ITrailingStopCommitRow

This describes a queued action related to a trailing stop order. It essentially represents a record of a change or adjustment made to a trailing stop. 

Think of it as a snapshot of the state when a trailing stop order was modified.

The `action` field confirms this is specifically related to a trailing stop order. The `percentShift` shows how much the percentage for the stop has been adjusted, and `currentPrice` indicates the price level at which the trailing stop was originally set.

## Interface ISweepTrade

The `ISweepTrade` interface represents a single trade executed within the backtest-kit framework. Each trade record contains key information like the `ideaId` that initiated it, the `symbol` being traded, and the `author` responsible for the original idea. 

You’ll also find details about the trade's `direction`, `entryTimestamp`, and `exitTimestamp`, providing a clear timeline of its lifecycle. Knowing the `exitReason` clarifies why the trade was closed.

The `holdMinutesActual` property tells you exactly how long the trade was held. Profitability is tracked through the `pnlPercent` property.

Finally, `absorbedIdeas` lists other ideas that were prevented from entering a trade because this trade already occupied the spot – enabling detailed tracking of how different trading signals interact and influence outcomes.

## Interface ISweepTrack

This data represents a single author's performance under a specific trading rule, providing a detailed look at their track record. Each entry describes how an author fared within a particular combination of parameters: hold time, lock percentage, stop percentage, and trailing percentage. The data isn’t a simple pass/fail; instead, it's a continuous record of ideas and successes, allowing for nuanced analysis.

The `holdMinutes` indicates how long the trade was allowed to run before evaluation. The `profitLockPercent`, `hardStopPercent`, and `trailingTakePercent` define the specific rule parameters used for grading. The `author` field identifies the author.

The track includes counts of `ideas` (all directional attempts), `hits` (successful trades where the lock or trailing arm triggered before the hard stop), and `hitRate` (the ratio of hits to ideas). This detailed breakdown avoids arbitrary thresholds and lets users assess trust based on the complete data. Essentially, it's a self-contained snapshot of an author's performance under a unique set of trading conditions, designed to be easily searched and filtered.

## Interface ISweepSchema

This schema defines how a sweep, which is essentially a testing configuration, is registered within the backtest-kit framework. Each sweep needs a unique name to identify it.

The `exchangeName` tells the system where to get the historical candle data needed for the tests; be aware that the data source must provide the exact amount of candles expected, or the process will stop.

You can customize specific aspects of the grid, which controls how trades are placed, by overriding default settings—if you don't set a particular grid setting, it will use the default values. 

The system also lets you attach optional callbacks, like functions to run after certain events, with the `onAuthorsTrained` callback triggering once for each unique combination of rules used in the test.

Finally, the `reportOrder` determines how the results of the sweep are ranked and presented, defaulting to "sharpe," and it's important to know this order doesn’t affect how the best trades are selected or tracked.

## Interface ISweepResult

The `ISweepResult` object represents the outcome of a backtesting simulation. It bundles together several pieces of information about the run, providing a complete picture of performance.

You'll find details about the trading symbol being analyzed, along with counts of different types of signals received – total signals, directional signals, and profiles generated.

It also summarizes trade holding behavior, showing average and percentile holding times, which helps understand how long trades were active.

Critically, the result includes a comprehensive report (`ISweepReport`) detailing the performance of each grid point, identifies top-performing strategies (winners), and tracks contributions from different authors. This report is the core of the analysis.

## Interface ISweepPointReport

This report summarizes the performance of a specific grid point within a backtest. It provides a comprehensive view of trading activity at that point, including how many trades were skipped due to author availability. 

Key metrics include overall profit and loss, average profit, win rate, and risk-adjusted performance indicators like the Sharpe and Sortino ratios, which consider the impact of holding time. You'll also find information about maximum drawdown, indicating the largest peak-to-trough decline in cumulative profit. 

The report details average and percentile holding times, shedding light on how long trades are typically held. An important feature is the full list of trades executed at that grid point; this enables detailed investigation of individual trades contributing to the reported statistics. Exit reasons are also tracked to provide a granular understanding of trade closures.

## Interface ISweepParams

The `ISweepParams` object holds all the settings needed to run a sweep, acting as a central place for configuration. It includes a logger for displaying debug messages during the sweep process. It also defines the grid axes which determine how the sweep explores different parameter combinations and specifies the order in which results should be ranked and reported. These parameters are pre-configured with default values, making setup easier.

## Interface ISweepMetricReport

This object holds a complete report for a single backtesting sweep. It combines all the data for a specific test run, focusing on how well each grid point performed based on a single metric - profit before stop. 

It’s organized to show the best-performing grid points according to several ranking criteria, and also includes a detailed record of the rules used (like hold periods, lock-ins, stops, and trailing stops) and the authors who defined them. This track data offers granular insights into the rules themselves, instead of just a pass/fail judgement, allowing you to investigate which rules consistently produce good results. The data is presented efficiently, avoiding repetition and enabling straightforward filtering and analysis.

## Interface ISweepIdeaProfile

This `ISweepIdeaProfile` represents a single trading idea's performance over time, specifically detailing how its price moved. It’s like a detailed record of a single trade's journey.

Think of it as a snapshot of the price action from the moment you entered the trade until a specific point in the future. The profile includes the initial entry price, a series of historical candle data (price movements), and several key metrics summarizing its overall behavior.

It’s important to understand that this profile is built *once* for the entire trade duration; the system doesn't recalculate anything as it evaluates the trade. This helps make the evaluation process more efficient.

Several metrics are included to give a broad view of the trade's success or failure, such as whether the trade ultimately made money (hit), the largest favorable and adverse price swings (MFE/MAE), and how long these movements took. There's also information about how the price shook out early on and a measure of the typical price movement during the trade's life (medianMovePercent). These metrics provide a complete picture of the trade's journey, allowing for comprehensive grading and analysis.

## Interface ISweepIdea

An ISweepIdea represents a single trading idea, essentially a public forecast made by someone. Think of it as a signal or suggestion for a trade. Each idea has a unique ID, a timestamp indicating when it was published, and specifies the trading pair (like BTCUSDT). It also tells you the direction the author believes the price will move – whether they're forecasting a rise or a fall. Finally, it includes the author's login name, identifying who published the idea. When running simulations, the analysis happens at the level of the entire idea, not individual price points.

## Interface ISweepGridPoint

This defines a single point on a grid used in trading strategies. Each grid point specifies conditions for managing a trade.

You can set a hard stop level, expressed as a percentage from the entry price, to limit potential losses.

A trailing take profit can be implemented, which adjusts the target price as the price moves in a favorable direction. This is defined as a percentage pullback from the highest price reached since the trade began.

There’s also a maximum holding time, measured in minutes, which dictates how long a position can be held.

Finally, a profit lock feature allows for taking profits when the price reaches a certain level above the entry price, then exiting if the price drops back to that level; disabling it is possible by setting the value to zero.

## Interface ISweepGridAxes

This section defines how you can specify ranges of values for key trading parameters – hard stops, trailing take profits, hold times, and profit locks – to test different strategies. Think of it as setting up the boundaries within which your trading rule will operate.

Each parameter (hard stop percent, trailing take percent, hold minutes, and profit lock percent) is represented as an array of numbers.  These numbers define the different values you want to test for each parameter.

The `hardStopPercent` values determine the maximum acceptable loss for a trade, crucial for limiting potential catastrophe losses. The `trailingTakePercent` controls how much of a winning trade's gains can be given back before exiting.  `holdMinutes` dictates the maximum time a position can be held, affecting how frequently trades are executed. Finally, `profitLockPercent` establishes a fixed profit level that, once reached, will trigger an exit if the price pulls back.

It's important to note that these parameters are never truly ignored; they always play a role in evaluating a trade's performance. Each setting is actively checked and factored into the grading system that assesses the quality of your trading rules.

## Interface ISweepCallbacks

This interface allows you to monitor the progress of a backtesting simulation and react to key events. Think of it as a way to get detailed updates on what's happening behind the scenes, rather than just seeing a final result.

You'll receive notifications as the simulation processes different stages, like idea generation or grid evaluations. The `onProgress` callback tells you how many items have been processed within a specific stage, helpful for understanding how long a particular step might take.

The `onIdeas` callback provides information about the total number of ideas found and how many are directional (excluding neutral ideas).  

When the simulation builds profiles based on ideas, `onProfiles` will notify you, and it will also indicate if any profiles were cut short due to a lack of candle data.

The `onAuthorsTrained` function provides insights into how each author performs on different grading rules, detailing their raw track record.  It's data for you to analyze and determine author trustworthiness.

When a grid point is evaluated, the `onGridPoint` callback will provide the report and associated trades.

The `onRanking` function triggers when a ranking is calculated, giving you the sorted reports and the top performer based on a specific criterion.

Finally, the `onDone` function signals the completion of the entire simulation and provides the overall result.

## Interface ISweepBest

This interface defines a single winning point within a sweep, focusing solely on the criterion used to determine that win. It contains a reference to the `SweepRankingCriterion` that dictated the outcome and a link to the `ISweepPointReport` holding comprehensive details about the winning point. 

Important to remember, the actual trades executed during that winning point and any associated tracking information are stored within the `ISweepPointReport` and the bucket's tracks, respectively. This prevents duplication of information and keeps the `ISweepBest` concise and focused on the ranking criterion itself. If no winning point exists, the `report` property will be null.

## Interface ISweepAbsorbedIdea

This represents a trading idea that wasn't executed because the author already had a position open. Think of it as a signal that was "swallowed up" by a previous trade. 

It's designed to simplify analysis, as it includes both the idea's ID and the author's identifier, allowing for a direct look at the data without needing to combine information from separate sources. Essentially, it tells you that a particular trading idea wasn't acted upon because of something the author was already doing.

The structure includes:

*   `ideaId`: A unique number identifying the trading idea.
*   `author`: The identifier of the author who had the existing position preventing the trade.

## Interface ISweep

The `ISweep` interface provides a way to execute a complete backtesting simulation. You can specify a trading symbol and a list of trading ideas to be evaluated. The process involves several steps: it filters ideas based on defined profiles, then applies author filters, assesses the performance of those ideas through grid evaluation, and finally generates a ranked list of results. The `run` method orchestrates these steps and returns a comprehensive `ISweepResult` object containing the simulation’s outcome.

## Interface IStrategyTickResultWaiting

This interface describes a specific situation in your trading strategy – when a signal has been scheduled but is still waiting for the price to reach the entry point. It’s not the initial creation of a signal; it represents the ongoing monitoring of that signal.

The result object includes details like the signal itself, the current price being watched, and information about the strategy, exchange, timeframe, and trading symbol involved.

You’ll also find details about the potential profit and loss (pnl) if the signal were to trigger immediately, as well as indicators of whether the trading is occurring in backtest or live mode and when the result was generated. Since the signal hasn’t activated yet, the progress towards take profit and stop loss will always be zero.


## Interface IStrategyTickResultScheduled

This interface represents a specific type of event in the trading system – when a trading signal is generated and scheduled, meaning it’s waiting for the price to reach a predetermined entry point. Think of it as a notification that a potential trade has been identified and is on hold.

It contains all the necessary details about that signal, including the strategy and exchange involved, the trading symbol like BTCUSDT, the timeframe used (e.g., 1-minute candles), and even the current price at the time the signal was scheduled. 

Knowing if the signal was generated during a backtest (historical simulation) or live trading is also included, along with the precise timestamp of the event. It's essentially a record of a planned trade, capturing the context surrounding its creation.


## Interface IStrategyTickResultOpened

This interface describes the result you get when a new trading signal is created within the backtest-kit framework. It's essentially a notification that a signal has been successfully generated and saved. 

The `action` property clearly indicates that this result represents a signal being opened. You'll find all the important details about the new signal, including its generated ID, conveniently stored in the `signal` property. 

The result also provides context on where the signal originated: the strategy's name, the exchange used, the timeframe, and the trading symbol.  You also get the current price at the time the signal was created, as well as whether this is a backtest or live execution. Finally, a timestamp indicates when the result itself was generated.

## Interface IStrategyTickResultIdle

This interface describes a specific event that happens when your trading strategy isn't actively making trades – it's in an "idle" state. It provides information about what's happening at that moment, like the strategy’s name, which exchange is being used, the timeframe being analyzed, and the trading symbol. You'll find the current price during that idle period, along with a flag indicating if this data originates from a backtest or a live trading scenario. The creation timestamp helps track precisely when this idle state event occurred. It's a way to monitor your strategy even when it’s not actively trading.

## Interface IStrategyTickResultClosed

This interface describes what happens when a trading signal is closed, giving you a complete picture of the outcome. It includes details like the reason for the closure – whether it was due to a time limit, a profit target, a stop-loss, or a manual close.

You'll find the closing price, the exact time the signal closed, and a comprehensive profit/loss calculation that factors in things like fees and slippage. 

The interface also keeps track of key identifiers: the strategy name, the exchange used, the timeframe, and the trading symbol. 

It indicates whether the event occurred during a backtest or in a live trading environment, and provides a unique ID if the close was initiated manually. Finally, it includes a timestamp indicating when this specific closing event was recorded.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a scheduled trading signal is cancelled before a trade actually takes place. 

Think of it as a notification that a planned signal didn't trigger a trade, perhaps because it was cancelled manually or because the conditions for entry weren't met.

It provides details about the cancelled signal itself, including the final price used for calculations, the exact time of the cancellation, and the names of the strategy, exchange, and timeframe involved.  You'll also find information on whether this cancellation occurred during a backtest or in a live trading environment, and the reason behind the cancellation. 

Finally, it includes an optional ID if the cancellation was initiated through a specific cancellation request. The creation timestamp provides context relative to the candle or execution context.

## Interface IStrategyTickResultActive

This interface describes the result when a trading strategy is actively monitoring a signal, waiting for a take profit (TP), stop loss (SL), or a time expiration. It provides details about the signal being watched, including its current price and the strategy and exchange involved. You'll find identifying information like the strategy and symbol names, as well as the timeframe being used.

The result also tells you how far the position is progressing towards its TP or SL, and shows the current unrealized profit and loss (PNL).  A flag indicates whether the result comes from a backtest or a live trading environment. Finally, timestamps are included to track when the result was created and when the last candle was processed, useful for internal tracking and synchronization.

## Interface IStrategySchema

This schema describes a strategy used within the backtest-kit framework. It's essentially the blueprint for how a trading strategy will generate signals and behave.

Each strategy needs a unique `strategyName` for identification. A `note` can be added for documentation purposes.

The `interval` property controls how often the strategy can generate a signal, preventing it from overwhelming the system – the default is once per minute.

The core of the strategy is the `getSignal` function, which determines whether a buy or sell signal is generated based on current market data. The function can produce a scheduled signal, which will be triggered when price is reached or a regular signal triggered immediatelly.

Optional `callbacks` allow you to define actions that happen when a trade opens or closes.

You can also assign a `riskName` and optionally a `riskList` to the strategy for risk management purposes.  The `actions` property lets you associate specific actions with the strategy.  Finally, `info` provides a way to pass custom data to the strategy for monitoring or other uses.

## Interface IStrategyResult

This interface, `IStrategyResult`, represents a single row in a table that compares different trading strategies. It holds key information about each strategy, including its name – so you know which strategy you're looking at. 

You’ll also find the complete statistical breakdown of the backtest for that strategy, letting you see exactly how it performed.  A key ranking element is the metric value, which represents the outcome of the optimization process; this can be null if the strategy isn't valid. Finally, timestamps indicate when the first and last signals occurred for each strategy, helping you understand the time window of their activity.

## Interface IStrategyPnL

This interface, IStrategyPnL, represents the result of a trading strategy's profit and loss calculation. It helps you understand how your strategy performed financially.

The `pnlPercentage` property gives you the profit or loss expressed as a percentage – a positive number means profit, a negative number means a loss. 

`priceOpen` shows the actual price at which your trade entered, taking into account small adjustments for fees and slippage.  `priceClose` similarly represents the exit price, also adjusted for those factors.

Finally, `pnlCost` reveals the total profit or loss in dollars, calculated from the percentage and the initial investment. `pnlEntries` tells you the total amount of capital initially used to enter all the positions.


## Interface IStrategyCallbacks

This interface provides a way to listen for specific events within your trading strategy. Think of them as hooks that allow your code to react to what's happening with your signals.

You can define functions to be executed when a signal is opened, activated, goes idle, gets closed, is scheduled for later, or is cancelled. There are also callbacks for when a signal reaches partial profit, partial loss, or breakeven points.

Additionally, you can set up actions to run on every tick, or even on a per-minute basis for scheduled and active signals, enabling you to track signals and respond to changes dynamically. A special callback is provided for persisting signal data during testing and backtesting. These callbacks give you granular control and flexibility in how your strategy operates and responds to market conditions.

## Interface IStrategy

The `IStrategy` interface defines the core methods for a trading strategy. It provides functions for handling ticks, retrieving signals (pending and scheduled), checking conditions like breakeven and paused state, and managing position details.

Here's a breakdown:

**Core Execution:**

*   `tick`: The main function called for each price update. It checks for signal generation, takes profit/stop loss conditions.
*   `getPendingSignal`: Retrieves the current signal, if any. Used for monitoring TP/SL and time expiration.
*   `getScheduledSignal`: Retrieves the currently scheduled signal.
*   `getBreakeven`: Determines if the price has moved enough to cover transaction costs.
*   `getStopped`: Checks if the strategy is stopped.
*   `getPaused`: Checks if the strategy is paused.
*   `setPaused`: Pauses or resumes new position openings.
*   `createSignal`:  Queues user-supplied signals for later execution.
*   `dispose`:  Releases resources when the strategy is no longer needed.

**Position Monitoring:**

These methods provide information about a pending or active position:

*   `getTotalPercentClosed`:  How much of the position is still held.
*   `getTotalCostClosed`: How much of the initial investment has been recovered.
*   `getPositionEffectivePrice`: The average entry price for a position.
*   `getPositionInvestedCount`: Number of entries in the position.
*   `getPositionInvestedCost`: Total cost basis of the position.
*   `getPositionPnlPercent`: Unrealized percentage profit/loss.
*   `getPositionPnlCost`: Unrealized profit/loss in dollars.
*   `getPositionEntries`:  History of entry prices and costs (DCA entries).
*   `getPositionPartials`:  History of partial close transactions.

**Management & Actions:**

*   `backtest`: Simulates the strategy's performance against historical data.
*   `stopStrategy`: Prevents the strategy from generating new signals.
*   `cancelScheduled`: Cancels a scheduled signal without stopping the strategy.
*   `activateScheduled`: Forces the activation of a scheduled signal.
*   `closePending`: Closes an active position without stopping the strategy.
*   `createTakeProfit`: Reports that a take profit order was filled.
*   `createStopLoss`: Reports that a stop loss order was filled.
*   `partialProfit`: Closes a percentage of the position for profit.
*   `partialLoss`: Closes a percentage of the position to cut losses.
*   `breakeven`: Moves the stop-loss to breakeven.
*   `averageBuy`: Adds a new entry to a position (DCA).
*   `trailingStop`: Adjusts the trailing stop-loss.
*   `trailingTake`: Adjusts the trailing take profit.
*   `validateBreakeven`/`validatePartialProfit`/`validatePartialLoss`/`validateTrailingStop`/`validateTrailingTake`/`validateAverageBuy`: Checks preconditions for the respective actions without executing them.



**Status and Time-Based Information:**

These methods provide insights into the strategy's state and timing:

*   `getStatus`:  Returns a snapshot of the strategy's state.
*   `getPositionEstimateMinutes`: Expected duration of the position.
*   `getPositionCountdownMinutes`: Remaining time before expiration.
*   `getPositionActiveMinutes`: Time the position has been active.
*   `getPositionWaitingMinutes`: Time a scheduled signal has been waiting.
*   `getPositionHighestProfitPrice`/`getHighestProfitDistancePnlPercentage`: Track the best prices achieved.
*   `getPositionDrawdownMinutes`: Time since the position's worst loss.


## Interface IStorageUtils

This interface defines the core functionality needed for any storage adapter used within the backtest-kit framework. Think of it as a contract – any storage solution you want to use must provide ways to react to signal events like being opened, closed, scheduled, or cancelled. 

It also provides methods for retrieving signals: you can look up a specific signal by its ID or list all signals currently stored.

Finally, there are special event handlers to keep track of signals that are actively pinging, updating their timestamps to reflect their current status. This ensures your data remains accurate as signals transition between states.


## Interface IStorageSignalRowScheduled

This interface describes a signal stored in your backtest, specifically one that was scheduled for a later time. It holds essential information about that scheduled signal. The `status` property simply confirms that the signal is in a 'scheduled' state. Crucially, it also includes `currentPrice`, which represents the market price at the moment the signal was initially scheduled – this is directly linked to the `currentPrice` found in strategy ticks.

## Interface IStorageSignalRowOpened

This interface describes a signal event when a trading strategy initiates a position. 

It contains essential information about the opening of a trade.

The `status` property will always be "opened", clearly indicating the action that occurred.

The `currentPrice` tells you the price at which the trade was initially entered, which is tied to the price data from the strategy's tick information. This helps in understanding the trade's entry point.

## Interface IStorageSignalRowClosed

This interface describes a signal that has been closed, representing a completed trading opportunity. It holds information about how the signal performed when it was closed.

You’ll find details about the signal’s final profit and loss (PNL), the closing price, and the reason why the signal was closed. 

The data included here is directly linked to the information recorded when the signal was finalized, allowing for a complete picture of its trading history. It provides essential data for analyzing performance and understanding signal behavior.


## Interface IStorageSignalRowCancelled

This interface describes a signal row that has been cancelled. It’s a simple way to represent a signal’s status when it’s no longer active. The core of this is the `status` property, which is always set to "cancelled". Essentially, this tells you that the associated trading signal is no longer valid or should be ignored.

## Interface IStorageSignalRowBase

This interface defines the fundamental properties shared by all storage signal rows, regardless of their specific status. Think of it as the foundation for how signal data is saved. It includes `createdAt` and `updatedAt`, which record the precise moments the signal was created and last modified, using timestamps from the strategy tick results.  Finally, `priority` ensures signals are rewritten in a specific order when needed, using the current time to maintain that order.

## Interface IStateParams

`IStateParams` helps you define how your trading signals manage their internal state. It's essentially a configuration object used when creating a signal that needs to remember things between executions.

You specify a `bucketName`, which acts like a folder to organize different state-related aspects of your signal – think of it as "trade" for trade-related information or "metrics" for performance data.

Then, you provide an `initialValue`, which is what the signal will start with if it hasn't been initialized yet. This ensures your signal always has a known starting point.

## Interface IStateInstance

This interface, `IStateInstance`, is designed to manage the data associated with each individual trade as it happens. Think of it as a way to track key performance indicators—like the highest unrealized profit, how long the trade has been open, and how close it is to a predetermined exit point—all while the trade is active.

It's particularly useful for strategies using LLMs, where you need to monitor trade confirmations over time.

The `waitForInit` method prepares the state for use.

`getState` lets you read the current values, but it's smart: it won't show you future data – it protects against looking ahead.

`setState` lets you update those values, ensuring that if a backtest restarts, it doesn't corrupt any existing data. Updates with earlier timestamps will overwrite older ones.

Finally, `dispose` cleans up any resources that the state instance is using when it's no longer needed.

## Interface ISizingSchemaKelly

The `ISizingSchemaKelly` interface defines how to size your trades using the Kelly Criterion. This approach aims to maximize long-term growth by determining the optimal percentage of your capital to risk on each trade. 

You'll find a `method` property, explicitly set to "kelly-criterion", to identify this sizing strategy. Crucially, it includes a `kellyMultiplier` property, which controls how aggressively you apply the Kelly Criterion. A value of 0.25, for example, implements a "quarter Kelly" approach, which is generally considered a more conservative and safer strategy than full Kelly. You can adjust this multiplier to suit your risk tolerance.

## Interface ISizingSchemaFixedPercentage

This schema lets you define a trading strategy where the size of each trade is determined by a fixed percentage of your available capital. It's a straightforward approach for managing risk, ensuring each trade only exposes you to a predetermined portion of your funds.

The `method` property is always set to "fixed-percentage" to identify this specific sizing method.

You also specify the `riskPercentage`, which represents the maximum percentage of your capital you’re willing to risk on a single trade, expressed as a number between 0 and 100. For example, a riskPercentage of 10 means each trade will use 10% of your capital.

## Interface ISizingSchemaBase

This interface defines the fundamental structure for sizing configurations within the backtest-kit framework. Each sizing schema needs a unique identifier, which is the `sizingName`. You can also add a descriptive note to help understand the sizing strategy using the `note` field. 

To manage risk, you can set limits on the position size – `maxPositionPercentage` controls the maximum as a percentage of your account, while `minPositionSize` and `maxPositionSize` define absolute minimum and maximum position sizes. Finally, the `callbacks` property allows you to hook into specific stages of the sizing process, providing opportunities for customized behavior.


## Interface ISizingSchemaATR

This schema defines how to size trades based on the Average True Range (ATR). 

It's used when you want to manage risk by adjusting trade size based on market volatility. 

The `method` property must be set to "atr-based" to indicate this specific sizing approach.

The `riskPercentage` determines the maximum percentage of your account you're willing to risk on a single trade, usually a value between 0 and 100.

Finally, the `atrMultiplier` governs how much the stop-loss distance is calculated using the ATR value, influencing the overall trade size.

## Interface ISizingParamsKelly

This interface defines the parameters needed for calculating trade sizes using the Kelly Criterion within the backtest-kit framework. 

It primarily includes a `logger` property, which allows you to connect a logging service to monitor and debug the sizing calculations – useful for understanding how much capital is being allocated to each trade. Essentially, it's about defining the settings for determining how much of your capital to risk on each trade based on the Kelly Criterion formula, along with a way to track the process for troubleshooting.


## Interface ISizingParamsFixedPercentage

This interface defines the settings you'll use when determining how much of your capital to allocate to a trade using a fixed percentage approach. It's primarily used within the backtest-kit framework.

The most important part is the `logger`, which allows you to track debugging information and gain insights into how your sizing strategy is behaving. This logger helps you monitor and adjust your trade sizing parameters effectively.

## Interface ISizingParamsATR

This interface defines the settings you'll use to control how much of your capital is used for each trade when using an Average True Range (ATR) based sizing method. 

It includes a `logger` property, which is a tool that lets you see what's happening behind the scenes and helps you debug any issues. Think of it as a way to monitor and troubleshoot your trading logic.


## Interface ISizingCallbacks

The `ISizingCallbacks` interface provides a way to hook into the sizing process within the backtest-kit framework. You can use it to observe and potentially adjust how position sizes are determined.

Specifically, the `onCalculate` callback function gets triggered immediately after the framework calculates a potential trade size. This is a great opportunity to log the calculated size for auditing purposes or to add custom checks to ensure the size is within acceptable limits. You can use either a standard function or a function that returns a promise to handle this callback.

## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate your trade size using the Kelly Criterion. 

Essentially, it provides the core data for that calculation. 

You'll need to specify the calculation method – which in this case is the Kelly Criterion – alongside your win rate (expressed as a decimal between 0 and 1) and the average ratio of your wins to your losses. These values help determine how much of your capital to allocate to each trade.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the data needed to calculate trade sizes using a fixed percentage of your account balance. 

It includes the method, which is always "fixed-percentage" to identify the sizing strategy. 

You’ll also specify a `priceStopLoss`, which represents the price at which a stop-loss order would be triggered.

## Interface ISizingCalculateParamsBase

This interface defines the basic information needed for calculating trade sizes. 

It includes the trading symbol, like "BTCUSDT", which identifies the asset being traded. It also specifies the current balance of your trading account and the intended entry price for the trade. These properties act as the foundation for determining how much of an asset to buy or sell.

## Interface ISizingCalculateParamsATR

This interface defines the settings needed when calculating position sizes using the ATR (Average True Range) method. It requires you to specify that the sizing method is "atr-based" and provides a numerical value for the ATR itself. Essentially, it's how you tell the backtest kit to use the ATR to determine how much to trade, and what the current ATR value is.

## Interface ISizing

The `ISizing` interface defines how a trading strategy determines how much of an asset to buy or sell. It's the core of managing position sizes.

The primary responsibility is the `calculate` method. This method takes parameters that describe the current trading conditions and uses them to compute the optimal position size – essentially, deciding how much to trade. It's an asynchronous function, meaning the calculation might involve some processing time.


## Interface ISignalRow

This interface, `ISignalRow`, represents a complete trading signal that's been validated and prepared for execution. Think of it as the finalized blueprint for a trade. Each signal has a unique identifier (`id`) and associated details like the cost of the trade (`cost`), entry price (`priceOpen`), and expected duration (`minuteEstimatedTime`). 

It also stores critical information for scaling trades, like the `multiplier` which adjusts for leverage.  The system tracks which exchange (`exchangeName`), strategy (`strategyName`), and timeframe (`frameName`) the signal relates to, along with timestamps indicating when it was created (`scheduledAt`), became pending (`pendingAt`), and what symbol is being traded (`symbol`).

Beyond the basics, `ISignalRow` keeps a record of partial profits and losses (`_partial`), a trailing stop-loss price (`_trailingPriceStopLoss`), and DCA entry history (`_entry`).  It also tracks the highest and lowest prices achieved during the trade (`_peak`, `_fall`), and a dynamically adjusted take profit price (`_trailingPriceTakeProfit`).  Finally, a timestamp (`timestamp`) records when the signal was initially generated, useful for audit trails and historical analysis. This rich set of data enables comprehensive backtesting and performance analysis.


## Interface ISignalIntervalDto

The `ISignalIntervalDto` helps manage how often trading signals are delivered. It's designed to bundle multiple signals together and release them at once, based on a defined interval. This approach prevents a flood of signals and ensures they are spaced out appropriately. Each signal within this grouping has a unique identifier, acting like a specific code for tracking purposes.

## Interface ISignalDto

This interface, ISignalDto, represents the data structure used to communicate signal information within the trading framework. Think of it as a standardized way to describe a trading opportunity – whether it's a long (buy) or short (sell) position. The system automatically assigns a unique ID to each signal, and you provide details like the ticker symbol, entry price, take profit target, and stop loss levels to manage risk. You can also add a note to explain the reasoning behind the signal.

The framework provides flexibility by allowing you to set an estimated duration for the position, or keep it open indefinitely.  You can also specify the cost associated with entering the position and a multiplier to adjust potential profit and loss. Essentially, it's a complete package for defining and managing trading signals.

## Interface ISignalCloseRow

This interface represents a signal event that involves a closing action, specifically when a user initiates the close. It builds upon the existing ISignalRow to provide additional details about the closure process. The `closeId` property holds a unique identifier associated with the closure, and the `closeNote` provides a user-provided explanation or comment related to the closure decision. These properties are only relevant when a close is triggered by a user's actions, distinguishing them from automatic closures.

## Interface ISessionInstance

This interface outlines how session instances should behave, acting as a shared memory space for data specific to a particular trading setup - that's a combination of a symbol, a strategy, an exchange, and a frame of time. Think of it as a way to store temporary information, like results from calculations or intermediate states, that a strategy needs during a single backtesting run. This helps avoid recalculating things or losing track of progress.

The session instance provides a way to initialize itself, store data along with a timestamp, retrieve data based on a timestamp (preventing looking into the future), and clean up when it's no longer needed. It's designed to be flexible, allowing you to store different types of data as long as it's structured as an object.

## Interface IScheduledSignalRow

The `IScheduledSignalRow` represents a signal that's waiting for a specific price to be reached before a trade can be executed. Think of it as a signal on hold until the market moves in a certain direction.

It builds upon the standard signal representation, adding the crucial element of a target price (`priceOpen`) – the price that must be hit before the trade becomes active.

Once the market price reaches this target, the "pending" signal transforms into a regular, active signal, ready to be executed. The system remembers when the signal was initially scheduled and continues tracking the actual time until that activation point. This allows for a clear understanding of the signal’s timeline.

The `priceOpen` property simply defines that target price.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled signal that might have been cancelled by the user. It builds upon the standard scheduled signal information and adds details specifically for situations where a user initiated a cancellation. You'll find a `cancelId` to uniquely identify the cancellation, and a `cancelNote` to provide any reasoning or explanation the user gave when requesting the cancellation. These extra details are only present when the signal was cancelled through user action.

## Interface IScheduledSignalActivateRow

This interface defines a row of data used for scheduling signals, specifically when those signals are triggered by a user action. It builds upon the standard signal scheduling information and adds details about the activation process itself. If a signal is activated by a user, this interface includes an `activateId` to uniquely identify that activation and an `activateNote` which allows the user to add a descriptive explanation for why the signal was activated. Essentially, it's a record linking a scheduled signal to a specific user action that prompted it.

## Interface IRuntimeRange

This interface, `IRuntimeRange`, simply defines the timeframe your backtesting or strategy execution will cover. It's like setting the boundaries for your simulation - it tells the system *when* the backtest should start and stop. You'll find two key pieces of information here: `from`, which is the starting date, and `to`, which is the ending date. Think of it as specifying the beginning and end of your historical data window for analysis.

## Interface IRuntimeInfo

The `IRuntimeInfo` interface provides essential details about what's happening during a trading execution, whether it's a backtest or a live trade. It tells you which trading pair is involved, the period being analyzed (if it's a backtest), and any custom data the strategy itself provides. You’ll also get details about the trading environment - the exchange and strategy names, and the timeframe being used. 

Crucially, this interface also includes the current time, the current price of the asset, and a flag to confirm whether the execution is part of a historical backtest. Think of it as a snapshot of the trading environment at a specific moment. 


## Interface IRunContext

The `IRunContext` acts as a central hub of information when you're running code within the backtest-kit framework. Think of it as a package containing everything a function needs to know – details about the trading strategy, the exchange it's connected to, and the current market conditions. It brings together data related to the routing of your code (like which exchange and strategy are involved) and the runtime environment (like the specific asset being traded and the current time). This single package simplifies how information is passed around during the backtesting process.

## Interface IRiskValidationPayload

This object holds the information needed to assess risk during the trading process. It builds upon the basic arguments for risk checks by adding details about the current trading signal and the overall portfolio.

Specifically, it includes the `currentSignal` being evaluated, which has all the necessary price data already calculated. You'll also find the `activePositionCount`, representing the total number of open positions, and a list of all `activePositions` for a complete picture of what's currently being held.

## Interface IRiskValidationFn

This defines a function that helps ensure your trading strategies are behaving responsibly. Think of it as a safety check. The function takes some data related to a trade and determines if it should be allowed to proceed. If everything looks good, the function does nothing or returns null. However, if something is amiss – like the risk is too high – it either throws an error or returns a detailed explanation of why the trade is being rejected. This allows you to catch and handle potential issues proactively.

## Interface IRiskValidation

This interface lets you define how to check if your risk parameters are set up correctly. Think of it as setting up rules to make sure your trading strategy isn't going to make mistakes because of incorrect inputs.

You'll provide a function, `validate`, that performs the actual validation—it takes your risk parameters and decides if they're acceptable.  You can also add a `note` to explain what the validation is doing; it's like adding a comment to your code so you and others understand why you're doing things a certain way.

## Interface IRiskSignalRow

This interface, `IRiskSignalRow`, is designed to hold key information related to a trading signal for internal risk management purposes. It builds upon the existing `ISignalDto` to incorporate crucial details like the entry price (`priceOpen`), the initially set stop-loss price (`originalPriceStopLoss`), and the original take-profit price (`originalPriceTakeProfit`).  Think of it as a way to access the original parameters used when a trade was triggered, helping to validate risk and ensure consistency throughout the backtesting process. This allows for tracking how the initial setup compares to the actual trading conditions.

## Interface IRiskSchema

The `IRiskSchema` allows you to define and manage risk controls for your portfolio, essentially setting up rules to govern how your trades are executed. Think of it as creating a custom profile for your risk management. 

Each risk profile has a unique identifier (`riskName`) so you can easily reference it. You can also add a note (`note`) for yourself or other developers to explain the purpose of the risk profile.

You can optionally define callbacks (`callbacks`) to trigger specific actions when trades are rejected or allowed, giving you a way to respond to risk decisions programmatically.

The heart of the risk profile is the `validations` array, where you specify the actual checks and rules that the framework will use to evaluate trades. These validations can be functions (`IRiskValidationFn`) or pre-defined objects (`IRiskValidation`), providing flexibility in how you express your risk logic.

## Interface IRiskRejectionResult

This interface represents the result when a risk check fails during a trading simulation. It provides a way to understand *why* a trade was rejected. Each rejection has a unique `id` to help track it, and a clear `note` explaining the reason for the rejection in plain language, making it easier to debug and improve your trading strategies.

## Interface IRiskParams

This interface defines the information needed to configure how risk is managed within the backtest-kit framework. It essentially bundles together settings for things like the name of the exchange you're using, a way to log debugging information, and a service that handles timekeeping to prevent errors related to looking into the future.

You'll also find settings for whether you’re running a backtest (simulated trading) or live trading. A key part is the `onRejected` callback – this gets triggered whenever a trading signal is blocked due to risk constraints, giving you a chance to react to and log these situations. This callback is important for relaying risk events separately from other system callbacks.

## Interface IRiskCheckOptions

To help manage situations where multiple parts of your trading logic are trying to adjust positions at the same time, the `IRiskCheckOptions` lets you temporarily "reserve" a position. Think of it as a quick placeholder.

This is particularly useful when you want to make absolutely sure that other checks or signals see the updated position size *before* a final trade order is placed.  The `reserve` option, when set to `true`, ensures this happens safely and prevents any race conditions. It creates a temporary record of the intended change, visible to concurrent operations, guaranteeing consistency in your backtesting results.

## Interface IRiskCheckArgs

The `IRiskCheckArgs` interface holds all the information needed to determine if a new trade should be allowed. Think of it as a safety check that runs *before* a trading signal is actually generated. It gathers details like the trading pair (symbol), the signal being considered, the name of the strategy that wants to make the trade, and information about the exchange and risk profile being used. It also provides the current price and timestamp for context. Essentially, this interface provides a snapshot of the trading environment to help ensure responsible trading practices.

## Interface IRiskCallbacks

This interface defines optional callbacks you can use to monitor and react to the outcomes of risk assessments within the backtest-kit framework. If a trading signal is blocked due to risk constraints, the `onRejected` callback is triggered, letting you know which symbol was affected and the details of the risk check. Conversely, if a signal successfully clears all risk checks, the `onAllowed` callback is invoked, informing you about the approved symbol and associated parameters. These callbacks enable custom handling of risk-related events within your trading strategies.

## Interface IRiskActivePosition

This interface represents an active trading position that's being monitored for risk analysis across different strategies. Think of it as a snapshot of a trade – it holds all the crucial details about a long or short position. You’ll find information like the strategy and exchange involved, the symbol being traded (like BTCUSDT), and the direction of the trade (long or short). 

It also includes key price points: the entry price, stop-loss, and take-profit levels. Finally, it tracks how long the position has been open with an estimated time and a precise timestamp indicating when the trade began. This data helps understand and manage the risks associated with trading.


## Interface IRisk

The `IRisk` interface is like a gatekeeper for your trading strategies, ensuring they don't take on too much risk. It provides functions to check if a new trading signal is acceptable based on predefined risk limits.

There's a special `checkSignalAndReserve` function that’s designed to prevent multiple strategies from simultaneously exceeding risk limits; it checks a signal and *immediately* sets aside a placeholder for the potential position, all in one safe step.  Think of it like holding a seat at a concert – ensuring you can actually take the action. You absolutely must follow this up with either finalizing the trade (`addSignal`) or canceling it (`removeSignal`) to keep things consistent.

The `addSignal` function is used to record when a trade actually begins, associating specific details about the position with its risk profile.  When a trade closes, `removeSignal` lets the system know that the position is no longer active and the associated risk can be released.

## Interface IReportTarget

The `IReportTarget` interface lets you fine-tune what information your backtest kit generates in its reports. Think of it as a way to control the level of detail you receive. You can selectively turn on or off logging for specific areas like strategy commits, risk rejections, breakeven points, partial closes, performance metrics, scheduled signals, and more. This is helpful if you only want to focus on certain aspects of your trading performance or need to reduce the volume of data being logged. By setting these boolean properties to `true` or `false`, you're essentially telling the system which events are important enough to be recorded.

## Interface IReportDumpOptions

This interface defines the information needed to properly label and organize your backtest reports. It's like adding tags to your data so you can easily find and understand it later. You can specify the trading symbol, the name of the strategy you used, the exchange the data comes from, the timeframe, and even a unique identifier for the signal that triggered the trade. This is particularly useful when running multiple backtests and wanting to keep them organized.

## Interface IRecentUtils

This interface defines how different systems can manage and access recent trading signals. It allows you to connect to various data stores, like databases or in-memory caches, to keep track of the most recent signals generated by your trading strategies.

The `handleActivePing` method is used to record new signals as they come in, ensuring that you always have the latest information.  `getLatestSignal` lets you retrieve a specific signal based on the symbol, strategy, exchange, timeframe, and a critical "when" timestamp.  This "when" timestamp is important—signals from the future are excluded to prevent looking ahead and getting inaccurate results. Finally, `getMinutesSinceLatestSignalCreated` tells you how long ago the most recent signal was generated, helpful for understanding signal frequency and potential strategy adjustments.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, provides a way to share key details about a trading signal with users, including the initial settings. It builds upon the core `ISignalRow` to include the original stop-loss and take-profit prices that were set when the signal was first created. This is important because even if trailing stop-loss or take-profit mechanisms are in use, users still need to see the starting point for those values.

You'll find information here about the cost to enter the trade, how much of the position has been partially closed, and the number of entries and partial closes that have occurred. It also includes the initial entry price, which won't change even with averaging, and important profit/loss metrics like unrealized PnL, peak profit, and maximum drawdown, all calculated at the time the signal was generated. The `originalPriceStopLoss` and `originalPriceTakeProfit` fields are particularly valuable for transparency, allowing users to understand the original risk management parameters.

## Interface IPublicCandleData

This interface defines the structure of a single candlestick, representing price action over a specific time interval. Each candlestick contains key data points including the exact time it began, the opening price, the highest and lowest prices reached, the closing price, and the total trading volume during that period. Think of it as a snapshot of market activity at a particular moment. The timestamp is given in milliseconds since the Unix epoch, allowing for precise chronological ordering.

## Interface IPositionSizeKellyParams

This interface defines the parameters needed to calculate position sizes using the Kelly Criterion. It's all about figuring out how much of your capital to allocate to each trade based on your historical performance.

You'll specify your win rate, which represents the percentage of winning trades you've experienced, and your average win/loss ratio - essentially, how much you win on average compared to how much you lose. These values are critical inputs for the Kelly Criterion calculation, helping you optimize your trading size.

## Interface IPositionSizeFixedPercentageParams

The `IPositionSizeFixedPercentageParams` interface helps you define the parameters needed when using a fixed percentage sizing strategy for your trades. It's a straightforward way to specify how much of your capital you want to risk on each trade based on a percentage.

Currently, the only parameter you need to define is `priceStopLoss`, which represents the price level at which your stop-loss order will be triggered. This is essential for managing risk and limiting potential losses.

## Interface IPositionSizeATRParams

This interface defines the settings needed to calculate your position size based on the Average True Range (ATR). 

It's a straightforward way to manage how much of your capital you're risking on each trade, adjusting the size according to market volatility.

The `atr` property simply holds the current ATR value, which is a key component in the position sizing formula.

## Interface IPositionOverlapLadder

This interface helps you define a safe zone around your dollar-cost averaging (DCA) levels when backtesting. It essentially sets boundaries to detect when trades are happening too close together, which might indicate overlap and potentially inaccurate results.

The `upperPercent` property specifies how much above each DCA level to consider as an overlap – for instance, if set to 5%, any trade occurring 5% higher than a DCA is flagged.  Similarly, `lowerPercent` defines how much below each DCA level triggers an overlap warning, for example, at 5%. These percentages work on a scale of 0 to 100, making them easy to understand and adjust.

## Interface IPersistStrategyInstance

This interface defines how a trading strategy’s state can be saved and loaded separately from the main backtesting process. Think of it as a way to remember where a strategy was at a particular point in time, so you can pick up exactly where you left off. 

Each strategy, for a specific asset (symbol), unique name, and exchange, has its own dedicated persistence context. 

If you want to customize how this state is stored – perhaps using a database instead of files – you can create a class that implements this interface. The `waitForInit` method sets up the storage for a specific strategy. The `readStrategyData` method retrieves the saved state, and `writeStrategyData` allows you to save the current state, or clear the saved state entirely.


## Interface IPersistStorageInstance

This interface lets you customize how trading signals are saved and loaded, providing a way to go beyond the default file storage. Think of it as a bridge between the backtest-kit and your own storage solution, whether it's a database or something else entirely.

The system uses this interface to manage signal data separately for backtesting and live trading, creating a dedicated storage space for each.

When you implement this interface, you'll handle the initialization of storage, reading all previously saved signals, and writing new or updated signals back to where they're kept. The signals are organized and identified by a unique ID.

## Interface IPersistStateInstance

This interface helps your trading strategies safely store and retrieve their state, even if things go wrong, like the program crashing unexpectedly. Think of it as a way to save your progress so you can pick up where you left off.

It's designed to work with a specific combination of data signals and storage buckets.

If you need more control over how your strategies' state is saved – perhaps you want to use a database instead of files – you can build your own adapter that implements this interface.

Here’s what the methods do:

*   `waitForInit`: Sets up the storage area for your strategy’s state when it starts.
*   `readStateData`: Loads any previously saved state from storage.
*   `writeStateData`: Saves the current state to storage, along with a timestamp.
*   `dispose`: Cleans up any resources used by the state storage.


## Interface IPersistSignalInstance

This interface defines how trading strategies can save and load their signal data. Think of it as a way to remember what a strategy learned over time, even after the backtest finishes or the program closes. It's specific to a combination of the trading symbol, the strategy's name, and the exchange it's using.

If you want to customize how signal data is stored – perhaps using a database instead of a file – you can create a class that implements this interface.

The `waitForInit` method is used to prepare the storage area for the signal data when the strategy begins. `readSignalData` retrieves any previously saved data. And `writeSignalData` allows strategies to save their current signal data, or clear the stored data if it’s no longer needed.

## Interface IPersistSessionInstance

This interface helps manage how session data is saved and loaded for a specific trading setup – think of it as a way to remember what happened during a particular backtest run. 

It's designed to be customized, so if you want to store your session information in a way that's different from the default file storage, you can build your own adapter that implements this interface.

The `waitForInit` method makes sure the storage is ready before anything else happens. `readSessionData` retrieves any previously saved information, while `writeSessionData` saves the current state. Finally, `dispose` cleans up when the session is finished.

## Interface IPersistScheduleInstance

This interface defines how a specific trading strategy’s scheduled signals are stored and retrieved. It's designed to be customized, allowing you to use a database or other storage method instead of the default file-based approach. 

The `waitForInit` method prepares the storage area for a strategy – think of it as setting up the initial conditions. `readScheduleData` fetches the previously saved signal data for that strategy. Finally, `writeScheduleData` is used to save a new signal, or to clear out the stored data entirely if needed. Essentially, it manages the loading and saving of a strategy's pre-planned actions.

## Interface IPersistRiskInstance

This interface defines how to manage and store risk positions for a particular trading context. Think of it as a way to save and load information about the risk taken in a specific scenario, identified by a risk name and exchange. If you want to use a different method for storing this data—maybe a database instead of a file—you can create your own adapter that implements this interface.

The `waitForInit` method is used to prepare the storage space for a specific risk context, ensuring everything is ready to go.

`readPositionData` allows you to retrieve previously saved risk position data for a particular point in time.

Finally, `writePositionData` lets you save the current state of the risk positions, creating a record of the risk taken at a specific moment.

## Interface IPersistRecentInstance

This interface defines how to store and retrieve the most recent trading signal for a specific setup. Think of it as a way to remember the last active signal used, but separately for each symbol, strategy, exchange, and timeframe you're testing or trading.

It lets you customize how this "recent signal" data is saved, rather than relying on a default file-based approach.

The `waitForInit` method prepares the storage area for a new signal.

`readRecentData` fetches the last saved signal for this particular configuration.

Finally, `writeRecentData` saves the current signal along with the timestamp of when it was active.

## Interface IPersistPartialInstance

This interface defines how to save and retrieve partial profit and loss data for a specific trading setup. Think of it as a way to keep track of progress on a trade's journey, independent of the overall backtest. 

It's tied to a unique combination of the traded asset (symbol), the trading strategy used, and the exchange involved.

Each individual trading opportunity gets its own place to store this data, identified by a unique signal ID.

If you want to customize where or how this data is stored – for instance, to use a database instead of a file – you can create an adapter that implements this interface.

The `waitForInit` method sets up the storage area for a given context.
`readPartialData` fetches the previously saved progress for a signal at a particular point in time.
Finally, `writePartialData` saves the current state of a signal’s progress.

## Interface IPersistNotificationInstance

This interface lets you customize how notification data is stored during backtesting or live trading. Think of notifications as important events that your trading system generates – this allows you to persist them for later analysis or debugging.

Each backtest or live session gets its own dedicated storage area for these notifications.

If you want to move away from the default file-based storage (perhaps to a database or a more specialized system), you can build your own adapter that implements this interface.

The `waitForInit` method is called at the start to prepare the storage.  `readNotificationData` retrieves all the previously stored notifications. Finally, `writeNotificationData` saves the notifications, organized by their unique identifiers.

## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for a specific area within the backtest-kit system. Think of it as a way to manage individual pieces of information related to a particular trading scenario and a named storage bucket.

It provides methods for initializing the storage, reading existing data, checking if data exists, writing new data, and performing soft deletions—meaning data isn’t permanently removed but is excluded from normal searches.

You can also list all the accessible data entries or release any resources being used. This interface is designed for custom implementations if you want to change how memory data is handled beyond the default file-based approach.

## Interface IPersistMeasureInstance

This interface defines how to manage cached data for individual buckets within the backtest-kit framework. It's mainly used when the system needs to store responses from external APIs.

The system allows for "soft deletes," meaning data can be removed from active use but still remains on disk, marked as deleted. This allows for recovery or other actions if needed.

If you want to change how data is stored (perhaps using a different storage method instead of files), you can create a custom adapter that implements this interface.

Here's a breakdown of what the interface methods do:

*   `waitForInit`: Sets up the storage area for a specific bucket.
*   `readMeasureData`: Retrieves data from the cache using a unique key.
*   `writeMeasureData`: Stores data in the cache, associating it with a key and timestamp.
*   `removeMeasureData`: Marks an entry as deleted, keeping the file but preventing it from showing up in normal reads.
*   `listMeasureData`: Provides a way to see all the keys of the data currently being used in the cache.

## Interface IPersistLogInstance

This interface defines how to manage persistent storage for log entries within the backtest-kit framework. Think of it as a way to customize how log data is saved and retrieved, instead of relying on the default file storage. 

The system uses a single, global storage space for logs within each process. This means logs aren't tied to a specific context, but are accessible globally.

If you want to change how logs are saved (perhaps to a database or a different file format), you'd build your own adapter that implements this interface. 

The `waitForInit` method lets you control when the log storage becomes ready. `readLogData` fetches all the saved log entries.  `writeLogData` handles saving new log entries, ensuring that existing entries aren't overwritten to maintain a consistent log history.

## Interface IPersistIntervalInstance

This interface defines how to manage persistence markers for time intervals within a trading backtest. Think of it as a way to remember which intervals have already been processed for a specific trading bucket and key.

It lets you customize how the backtest keeps track of which intervals have run, going beyond the default file-based approach.

You can use this to initialize storage, read existing interval data, write new markers, and delete (or "soft-delete") markers to trigger reprocessing. Soft-deleting a marker means it's essentially ignored, allowing the process to run again. Finally, it provides a way to list all the markers that are currently active and haven’t been soft-deleted.

## Interface IPersistCandleInstance

This interface defines how your application can store and retrieve historical candle data for a specific trading symbol, timeframe, and exchange. Think of it as a way to manage a local copy of your price data, avoiding constant re-downloads.

It provides three key methods: `waitForInit` sets up the storage space, `readCandlesData` fetches a chunk of historical candles within a specific time range, and `writeCandlesData` saves new or updated candle data.

If `readCandlesData` returns `null`, it means some of the requested data isn't available in the cache, and your application needs to fetch it from the source. 

You can use this interface to create your own custom solutions for storing candles, instead of relying on the default file-based approach.

## Interface IPersistBreakevenInstance

This interface lets you manage how breakeven data is saved and loaded for specific trading setups. Think of it as a way to customize where and how your trading framework remembers important information about when a trade becomes profitable.

It focuses on a particular combination of asset (symbol), trading strategy, and exchange – essentially a unique context for your trading.

Each trading signal gets its own dedicated spot to store this breakeven information.

If you want to change the default file storage method, you can build your own adapter that implements this interface.

The `waitForInit` method is used to set up storage when it's needed. 

`readBreakevenData` retrieves the previously saved breakeven data for a given signal and date.

`writeBreakevenData` saves the updated breakeven data for a signal.

## Interface IPersistBase

This interface outlines the core functions needed for any system that wants to store and retrieve data, like historical trades or account snapshots. It’s designed to be flexible, allowing you to plug in different storage mechanisms – whether that’s files, databases, or something else entirely. 

The `waitForInit` method handles setting up the initial storage environment and confirming it's ready.  `readValue` and `hasValue` are straightforward for grabbing and checking if a specific piece of data exists. `writeValue` takes care of saving data, making sure that changes are written reliably. Finally, `keys` gives you a way to list all the data IDs that are being managed, helping with things like data integrity checks or iterating through everything. Think of it as a foundation for building a robust system that can save and load your trading data.

## Interface IPartialProfitCommitRow

This describes a single step taken during a backtest to take some profits. 

It represents a request to close a portion of your trading position. 

Think of it as saying, "Close X percent of my holdings at the current price."

Specifically, the `action` always indicates this is a partial profit action.  The `percentToClose` tells you what percentage of the position should be closed, and the `currentPrice` records the price at which that partial closing occurred.

## Interface IPartialLossCommitRow

This represents a record of a partial loss order that's been queued for processing. It contains essential details about that order.

Specifically, it tells you the type of action being taken – in this case, a "partial-loss." It also includes the percentage of the position that will be closed through this partial loss and the price at which that partial loss was executed. Having this information helps track and manage your trading strategies.

## Interface IPartialData

IPartialData is designed to help save and restore trading data, specifically focusing on the important milestones of a trade. It takes the data about profit and loss levels, which are typically stored as sets of values, and transforms them into simple lists that can be easily saved to a file or database. This makes it possible to pause a backtest and pick up right where you left off later on, preserving the progress made for each trading signal. It essentially provides a snapshot of where a trade stands regarding its profit and loss targets.

## Interface IPartial

The `IPartial` interface is responsible for keeping track of how much profit or loss a trading signal has generated. It's used by components like `ClientPartial` and `PartialConnectionService`.

Whenever a signal reaches specific profit milestones (like 10%, 20%, or 30% gain), or loss milestones, this interface makes sure those events are recognized and reported.

The `profit` method handles situations where a signal is making money, and the `loss` method handles situations where a signal is losing money. Both methods check for new profit/loss levels and avoid sending duplicate notifications.

Finally, the `clear` method cleans up the records associated with a signal once it’s finished trading, ensuring a clean slate for the next signal.

## Interface IParseArgsResult

The `IParseArgsResult` object holds the outcome of parsing command-line arguments, primarily related to how your trading system should operate. It essentially combines your initial input parameters with flags that determine the environment you're running in. 

You'll find properties like `backtest`, `paper`, and `live`, which clearly indicate whether the system is simulating trades using historical data, trading with simulated funds in real-time, or executing actual trades with real money. These flags control the core behavior of your trading strategy.

## Interface IParseArgsParams

The `IParseArgsParams` interface holds the essential information needed to run a backtest. Think of it as a container for the core settings. It includes the trading symbol, like "BTCUSDT," the name of the strategy you want to test, the exchange you're connecting to, and the timeframe of the data you'll be using, such as "1h" for one-hour candles.  This structured approach helps standardize how backtest arguments are passed.

## Interface IOrderBookData

The `IOrderBookData` interface describes the structure of order book information. It holds data about the current bids and asks for a specific trading pair. 

Each order book contains a `symbol` which identifies the trading pair, like "BTCUSDT." 

It also includes two arrays: `bids`, representing buy orders, and `asks`, representing sell orders. Each element within these arrays would follow the structure defined by `IBidData`, which isn't detailed here but presumably describes individual bid and ask orders.

## Interface INotificationUtils

This interface outlines the core methods that any notification system needs to provide when working with the backtest-kit framework. Think of it as the blueprint for how different systems (like email, Slack, or custom alerts) can communicate important events happening during a trading simulation or live execution.

It defines methods to handle various occurrences – signals being generated, partial profits or losses being available, orders being filled or rejected, and even errors that arise. There are specific handlers for different types of events, like when a strategy pauses or encounters a critical error.  

You can also retrieve a historical record of all notifications that have been processed, or clear that history when it's no longer needed. This interface makes sure all notification adapters work consistently with the framework.


## Interface INotificationTarget

This interface lets you pick and choose which notifications you want to receive from the backtest or live trading environment, improving efficiency. If you don't specify anything, you'll get notified about everything.

Here's a breakdown of the different notification types you can subscribe to:

*   **Signal Events:** These cover events related to signals, like when they're opened, scheduled, closed, or canceled. You’ll get details on signal lifecycle.
*   **Partial Profit/Loss:** You can be notified when the price hits pre-defined partial profit or loss levels, before any final decisions are made.
*   **Breakeven:** Receive notifications when the price reaches the breakeven point.
*   **Strategy Commitments:**  Get confirmations for actions like partial profits, loss commitments, or order cancellations.
*   **Order Synchronization:** Track the status of orders placed during live trading, confirming order fills and order placements.
*   **Order Checks:**  Monitor if your orders are still active on the exchange - live trading only. This is a regular check to ensure orders haven't been silently dropped.
*   **Order Fills & Rejections:** Receive notifications when orders are actually filled or rejected by the broker. These are confirmations *after* the initial sync. Live only.
*   **Order Continuation/Stopping:**  Learn whether a checked order remains open or if it's been terminated due to a problem. Live only.
*   **Risk Management:** Get notified if the risk manager blocks a potential trade.
*   **Informational Messages:**  Receive custom messages related to signals.
*   **Pause State:** Track when the strategy is paused or resumed.
*   **Errors:**  Be alerted to both non-critical and critical errors that might occur during the backtest or live session. Validation errors can be reported for configuration issues as well.

## Interface IMethodContext

The `IMethodContext` interface helps your backtesting code keep track of which specific strategies, exchanges, and data frames it's currently working with. Think of it as a set of labels that tell the system which components to load and use. It includes the names of the exchange, strategy, and data frame being utilized. This information is automatically passed around during the backtesting process, so you don't have to manage it directly. The frame name will be blank when running in live mode.

## Interface IMemoryInstance

This interface outlines how different memory storage systems—whether they’re local, persistent, or even just for testing—should behave.  It’s the blueprint for managing your trading data.

You’ll use `waitForInit` to get things started.  Then, `writeMemory` lets you store new pieces of information, complete with a description and a timestamp.  Need to find something specific? `searchMemory` uses a powerful search algorithm to find relevant content.

To see everything stored up to a certain point in time, use `listMemory`.  If you need to clean up, `removeMemory` gets rid of individual entries. If you’re looking for a single specific piece of data, `readMemory` retrieves it. Finally, `dispose` ensures all resources are properly released when you're done with the memory system.

## Interface IMarkdownTarget

This interface lets you fine-tune which detailed reports are generated during your backtesting and live trading. Think of it as a checklist for the kinds of insights you want to see.

You can choose to track things like strategy events (when trades enter or exit), risk rejections (trades blocked by limits), or even breakeven points.

It also includes options for portfolio analysis like heatmaps, performance bottleneck investigations, and signal lifecycle tracking.

Want to see the overall results of your backtest? Enable the `backtest` option. 

Essentially, it gives you a lot of control over the level of detail in your reports, allowing you to focus on the areas that are most important to your trading process.

## Interface IMarkdownDumpOptions

This interface, `IMarkdownDumpOptions`, helps control how information is exported in Markdown format. Think of it as a set of instructions telling the system exactly where to look for data and what kind of data to include. 

It specifies things like the directory path, the name of the file, and details about the trade, such as the symbol being traded (like "BTCUSDT"), the name of the strategy used, the exchange involved, the timeframe, and a unique signal ID. This lets you target and generate specific reports for different parts of your backtesting analysis.


## Interface IMCPTextMessage

This describes a simple text message used within a communication system. Each message has a unique ID to help keep track of it and ensure it's received correctly. The `type` clearly identifies it as a text message, and it contains the actual text content intended for display or processing. It’s a straightforward way to transmit text-based information.

## Interface IMCPSignalNotifyCommand

This command lets you send out informational notifications related to your trading positions. Specifically, it’s used to announce something about a currently open position for a trading pair you're actively using. The system identifies which signal to associate with the notification based on the trading symbol.

The command requires you to specify the trading symbol, the name of the MCP (Model Context Protocol) schema making the request, and a descriptive note that will be part of the notification. Think of it as a way to provide context and updates on your positions to other parts of the system.


## Interface IMCPSchema

The IMCPSchema defines how a particular trading strategy interacts with the backtest environment. Think of it as a configuration that connects a name (the MCP name) to a specific strategy.

It's important to be clear about which strategies are being controlled—if you have multiple strategies running, you *must* specify them in the schema to avoid confusion.

You can also customize things like the cost of entering a position and the leverage used, falling back on default values if you don't provide them.

The schema also allows you to restrict what actions an external agent can perform on the strategy, ensuring security. There’s a way to create custom reports to send data to external systems, and you have optional callbacks to react to different events within the backtest. Overall, it's about organizing and controlling how strategies are managed within the backtesting framework.

## Interface IMCPPositionOpenCommand

This command tells the system to open a trading position, specifically a "moonbag" – a type of position with predefined take profit and stop loss levels. It's used when live trading is enabled and dictated by a particular strategy.

You'll need to specify which trading pair you're trading, whether you're going long (buying) or short (selling), and the name of the strategy schema that's initiating this order.  Finally, you can add a note to explain why you’re creating this signal, which is useful for tracking and understanding your trades.


## Interface IMCPPositionCloseCommand

This command lets you close a trading position that's already set up and active. It’s used to finalize the process of closing out a position within a specific trading strategy.

You’ll need to specify the trading pair symbol like "BTCUSDT" to identify which position to close.

Also, you have to tell the system which registered MCP (Model Context Protocol) schema is initiating this closing action.

Finally, you can add a note, which is a simple text description explaining *why* you’re closing the position - it’s helpful for record-keeping and understanding what happened.

## Interface IMCPImageMessage

This describes a special message used within a system for sharing image data, like a chart or graph. Each image message gets a unique ID to help keep track of it. 

The message is clearly identified as an "image" message to avoid confusion with other types of messages.

It includes the image's file type (like "image/png") and the image itself, encoded in a base64 format which allows the image to be easily sent as text.

## Interface IMCPContext

The `IMCPContext` object holds a snapshot of your trading portfolio at a specific point in time. Think of it as a record of what assets you own and how much, updated for each active strategy instance. It's passed to your message processing functions so your strategies have the information they need to make decisions. Each strategy running within the backtest will have its own unique `IMCPContext` object.

## Interface IMCPCallbacks

This section defines callbacks you can use to monitor the actions of a Model Context Protocol (MCP) during backtesting. Think of them as ways to peek behind the scenes and see exactly what the MCP is doing, without interfering with the actual test run. These callbacks are optional—if you don't provide one, it simply won't be triggered.  If a callback encounters an error, it'll be logged, but the backtest will continue running.

Here's a breakdown of the available callbacks:

*   **`onStatus`**: This callback gets triggered when the `getStatus` function completes, providing the snapshot of the portfolio and any messages that were generated.

*   **`onPositionOpen`**:  This one fires when a new position is opened, allowing you to see the details of the signal and data (like take profit/stop loss levels and cost) that were sent to the live strategy.

*   **`onPositionClose`**: When a position is closed, this callback delivers the signal ID associated with that closure.

*   **`onAverageBuy`**:  This is for when a DCA entry happens – you'll receive the signal ID related to the averaging action.

*   **`onSignalNotify`**: Get notified when a note is attached to a signal; you'll receive the signal ID.

## Interface IMCPAverageBuyCommand

This command lets you add a small piece of a larger trade (a dollar-cost average, or DCA) to an existing, open position. It's specifically used with the Model Context Protocol (MCP) system.

Essentially, it adds an order to buy at the current price, contributing to the overall cost of a trade already in progress for a particular trading pair. The system knows which specific trading strategy and signal triggered this command. The amount of money used for this small piece comes from the budget allocated within that strategy.

The command requires you to specify the symbol, like "BTCUSDT," and the name of the MCP schema that is initiating it.

## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework communicate about what's happening. It’s essentially a way for the system to keep a record of events – from when things start up to when they encounter problems.

You can use it to write general messages about significant actions, or to record very detailed information during development or when you're troubleshooting.

It also allows for logging informational updates about successful actions and warnings about potential issues that need to be looked into. Different levels of logging exist to categorize the importance of the message being recorded.

## Interface ILogEntry

ILogEntry represents a single entry in your backtesting log history. Each entry has a unique ID and a type indicating its severity—log, debug, info, warn, or agent. It also includes a timestamp to help with log management and rotation.

To provide more context, entries can include methodContext and executionContext, offering details about where and how the log originated.  You can also assign a topic to categorize the log, and include additional arguments if needed. This structured format makes analyzing and understanding your backtest results easier.

## Interface ILog

The `ILog` interface lets you keep track of all the messages generated during a backtest, blending the standard logging levels with information about the AI agent involved. It’s essentially a more detailed logger.

The key feature is the `getList` method, which provides access to a complete list of every log entry recorded, allowing you to review the entire backtest process and understand what happened at each step.


## Interface IHeatmapRow

This interface, `IHeatmapRow`, represents a collection of key statistics for a single trading symbol, giving you a comprehensive view of its performance across all strategies. Think of it as a detailed report card for each trading pair, like BTCUSDT. It includes vital metrics like total profit/loss, risk-adjusted returns (Sharpe and Sortino ratios), how much the portfolio dipped (max drawdown), and trading frequency.

You'll also find breakdowns of trade performance—win rates, average profits and losses, winning/losing streaks—along with insights into how long trades typically last. Further metrics provide insight into trade momentum, buyer/seller influence, and trend characteristics.

Essentially, this interface consolidates all the important signals needed to quickly assess the health and efficiency of a trading strategy for a given symbol.

## Interface IFrameSchema

This schema defines a specific period and frequency for generating data points during a backtest. Think of it as setting the scope and granularity of your historical data. 

Each frame has a unique name to identify it, and you can add a note for your own documentation.

You specify the interval for generating data (like every minute, every hour, etc.). If you don't set it, it defaults to one minute. Crucially, you define the start and end dates of the backtest period.

Finally, you can register callbacks to be triggered at various points in the frame lifecycle, allowing for custom actions or data adjustments.

## Interface IFrameParams

The `IFrameParams` object holds the essential information needed to set up a frame within the backtest-kit framework. Think of it as the blueprint for creating a specific execution environment. 

It includes a `logger`, which is your tool for keeping track of what's happening inside the frame – a way to see the debug output. 

The `interval` property defines a unique name for the frame, making it easy to recognize and manage different testing setups.

## Interface IFrameCallbacks

This allows you to react to when the timeframe array – the set of dates your backtest will use – is created. 

You can use this callback to confirm the dates are what you expect, or to simply log them for debugging.

The callback receives the array of dates, the start and end dates of the timeframe, and the interval (like daily, weekly, or monthly) that was used to create them.

## Interface IFrame

The `IFrame` interface is a core component for setting up the time-based structure of your backtests. Think of it as the engine that creates the sequence of dates and times your trading strategy will be evaluated against.

It provides a way to fetch a list of timestamps for a specific trading symbol and timeframe, ensuring your backtest runs consistently with the desired frequency. This function will return an array of `Date` objects, which represent the moments in time your strategy will analyze.


## Interface IExecutionContext

The `IExecutionContext` object provides essential information about the current state of a trading operation. Think of it as a little package of data that’s automatically passed around to tell your strategies and exchange connections what's going on.

It includes details like the trading symbol, such as "BTCUSDT," and the current timestamp. 

Crucially, it also tells you whether you're running a backtest (testing a strategy on historical data) or a live trade. This is represented by the `backtest` property - `true` for backtesting, `false` for live trading.

## Interface IExchangeSchema

The IExchangeSchema defines how backtest-kit connects to and retrieves data from a specific cryptocurrency exchange. It’s essentially a blueprint for telling the framework where to find historical candle data, order books, and trades.

Each exchange you want to use needs a schema with a unique identifier (exchangeName). You can add a note to help yourself or others understand the exchange’s specifics.

The most important part is the `getCandles` function, which is responsible for actually fetching the historical price data. It takes a symbol (like BTC/USDT), a timeframe (like 1 hour), a start date, a limit on the number of candles, and a flag for backtesting.

You can also define functions to format trade quantities and prices to match the exchange’s rules—otherwise, it will default to Bitcoin precision.

If you need to access order book data or aggregated trades, you can provide `getOrderBook` and `getAggregatedTrades` functions, respectively; otherwise, the framework will throw an error if these are requested. Finally, you can provide optional lifecycle callbacks like `onCandleData` for any custom processing.

## Interface IExchangeParams

The `IExchangeParams` interface defines the necessary configuration when setting up a connection to a cryptocurrency exchange within the backtest-kit framework. It's essentially a blueprint for how the framework interacts with an exchange during backtesting or live trading.

You’ll need to provide a logger to handle debugging and informational messages. It also requires an execution context which holds important data like the trading symbol, the current timestamp, and whether it's a backtest environment.

Crucially, several functions are mandatory, including methods for retrieving historical candle data, formatting trade quantities and prices according to exchange-specific rules, fetching order books, and getting aggregated trade data. The framework provides reasonable defaults for many of these, but you’ll typically need to implement them to connect to a particular exchange.

## Interface IExchangeCallbacks

The `IExchangeCallbacks` object lets you register functions to be notified about specific events coming from the exchange. 

Specifically, the `onCandleData` callback lets you react whenever the backtest-kit receives new candlestick data.  You’ll get details like the symbol being traded, the candlestick interval (e.g., 1 minute, 1 hour), a timestamp indicating when the data started, how many data points were requested, and the actual candlestick data itself. This allows you to perform custom actions or analyses when new price history becomes available.

## Interface IExchange

The `IExchange` interface defines how your backtesting environment interacts with a simulated or real cryptocurrency exchange. It provides tools for accessing historical and future price data, as well as calculating essential metrics.

You can retrieve historical candle data using `getCandles`, or look ahead to future candles with `getNextCandles` – crucial for simulating trading scenarios. The framework also handles formatting trade quantities and prices to align with the exchange’s specifications using `formatQuantity` and `formatPrice`.

For more sophisticated analysis, you can calculate the Volume Weighted Average Price (VWAP) with `getAveragePrice`, which is based on recent trading activity, or quickly grab the last close price with `getClosePrice`. 

Further, the interface enables you to retrieve order book information (`getOrderBook`) and aggregated trade data (`getAggregatedTrades`) to analyze market depth and trading activity. `getRawCandles` offers flexible control over candle retrieval, allowing you to specify start and end dates or simply retrieve a specific number of candles relative to the execution context time, all while preventing look-ahead bias.

## Interface IEntity

This interface serves as the foundation for any data that's saved and retrieved, like order details or account balances. Think of it as the common ground for different types of stored information within the system. It ensures consistency and allows for standardized handling of persistent data.

## Interface IDumpInstance

The `IDumpInstance` interface defines how to store information during a backtest run. Think of it as a way to save snapshots of different data types for later analysis.

It lets you save things like:

*   Complete conversation histories from agents.
*   Simple key-value data records.
*   Data formatted as tables (arrays of objects).
*   Plain text or Markdown content.
*   Error descriptions.
*   JSON data in a structured format.
*   Status updates from the Model Context Protocol (MCP).

Each save operation—whether it's a message, a record, or a table—is linked to a unique `dumpId` and a brief `description` to help you understand what it represents.  The `dispose` method is used to clean up any resources used by the dump instance when you're finished with it.  The dump instance's scope is determined by the `signalId` and `bucketName` passed during its creation.

## Interface IDumpContext

The `IDumpContext` helps identify and organize data dumps within the backtest-kit framework. Think of it as a label that sticks to each piece of data you’re saving. 

It includes key information like the `signalId` which links the data to a specific trade, and the `bucketName` which groups data by strategy. Each dump also gets a unique `dumpId` for individual tracking.

You can also add a helpful `description` – a human-readable note about what the data represents. This description is useful for searching and for making the data understandable later.

Finally, a `backtest` flag distinguishes whether the data comes from a simulated backtest or a live trading environment, influencing how it's handled.


## Interface ICommitRowBase

This interface, `ICommitRowBase`, acts as a foundation for events that need to be processed later, rather than immediately. Think of it as a way to hold onto information about a trading action – like a buy or sell – until the system is ready to properly record it. Each event includes the trading pair’s symbol, so you know exactly what asset was involved. It also notes whether the action occurred during a backtest, which is important for distinguishing historical simulations from live trades.

## Interface ICheckCandlesParams

ICheckCandlesParams defines the information needed to verify if your trading data (candles) are properly stored. It's like a checklist to ensure you have the right data for backtesting.

You’ll provide the trading pair's symbol – like "BTCUSDT" – along with the exchange it came from and the time interval of the candles (e.g., "1m" for one-minute candles).

Crucially, you also specify a date range: the starting and ending dates you want to check for candle availability. This helps quickly confirm data exists without needing to search through all your files.


## Interface ICandleData

This interface describes a single candlestick, which represents a snapshot of price action and trading volume over a specific time period. Each candle contains information about when it started (timestamp), the price when it opened (open), the highest and lowest prices reached (high and low), the price when it closed (close), and the total trading volume (volume) during that time. This data is essential for analyzing price trends and testing trading strategies. It’s like a single frame from a moving price chart.

## Interface ICacheCandlesParams

This interface, `ICacheCandlesParams`, helps manage how your backtesting framework prepares data for analysis. It's designed to give you control over the process of checking if cached data is valid and then warming up that cache if needed.

Think of it as a way to customize what happens right before your backtest starts loading data.

You can use the `onWarmStart` callback to execute some code before the warm-up phase begins, typically after a validation check fails. Similarly, `onCheckStart` lets you run code before the initial cache validation process. Both callbacks provide details about the symbol, timeframe, and date range being processed, so you can tailor your actions accordingly.

## Interface IBrokerOrderVerdictTransient

This object represents a temporary problem encountered while placing or managing an order. It's how the backtest-kit framework signals that an order attempt failed for a reason that might be resolved quickly, like a brief network interruption. 

Think of it as a "try again later" signal. 

The framework will automatically retry the order a certain number of times, attempting to resolve the temporary issue. The `reason` property always indicates a transient problem, and the `error` property provides details about what went wrong, if available. 

Crucially, adapters and listeners don't create this object directly; they use it to communicate temporary failures to the framework.

## Interface IBrokerOrderVerdictRejected

When an order fails due to a business-level issue, this interface represents the final decision. It's how the backtest-kit communicates that an order can't be fulfilled and won't be retried.

Think of it as a definitive "no" from the system, triggered by something like a lack of available trading partners. 

This isn't something you, as an adapter, create directly. Instead, you signal a rejection by throwing a specific `OrderRejectedError`. The backtest-kit then packages that error into this `IBrokerOrderVerdictRejected` to confirm the rejection. 

If you see this verdict, the order is either dropped (if opening) or closed immediately (if closing).


## Interface IBrokerOrderVerdictDeleted

This interface represents a final decision made by the backtest framework regarding an order, specifically when an order is no longer available. It's a signal that something went wrong – typically because the order was cancelled on the exchange.

You, as an adapter or listener, don't create this directly. Instead, you indicate a problem with an order by returning a specific value or throwing an error.  A normal return or `true` means the order is confirmed; an error indicates a temporary problem; and a specific error like `OrderDeletedError` means the order is permanently gone.

When the `reason` is "deleted", it signifies that the order could not be found and the framework will immediately handle it, bypassing some standard processes. The `error` property contains the specific error that triggered this "deleted" verdict, giving you more details about why the order was removed.

## Interface IBrokerOrderVerdictConfirmed

This object represents a final decision made about an order – whether it's allowed to proceed or not. It's how the backtest-kit framework communicates the outcome of a gate or check that you've set up. You, as the adapter or listener, don't create this object directly; instead, you signal your decision by returning a value or throwing an error. 

A "confirmed" reason indicates that the order is good to go – either the gate allowed the order to open or close, or the order check found the order to still be active. Essentially, it's the framework’s way of saying “yes, this order is valid and should continue.”

## Interface IBrokerOrderVerdictBase

This `IBrokerOrderVerdictBase` acts as a foundational structure for how the trading framework handles decisions about orders. It's essentially a base for different kinds of verdicts, like whether an order can proceed or needs further review. 

The `__type__` property is a special identifier that distinguishes between the different specific types of verdicts that derive from this base. It’s a way to tell the system exactly *what kind* of order decision has been made.

## Interface IBroker

This interface defines how your application connects to a brokerage or exchange, allowing it to execute trades. It’s designed to work with the backtest-kit framework, but only in live trading scenarios—backtest mode ignores these calls.

The `waitForInit` method sets up the initial connection, like connecting to the exchange and verifying credentials. It’s crucial for reconciling any pre-existing orders or positions that might linger from a previous, interrupted session to prevent unexpected trades.  The process is lazy, meaning it's only triggered before the first trade is attempted.

Several methods handle order lifecycle events:

*   `onOrderCloseCommit`:  Deals with closing positions (take-profit, stop-loss, or manual).  It’s a key "gate" and any errors thrown here can trigger retries or, in severe cases, force-close the position.
*   `onOrderOpenCommit`:  Handles opening new positions. Like `onOrderCloseCommit`, it's a gate and throwing an error here can lead to retries or a rejected order.
*   `onOrderActiveCheck`:  Monitors existing open positions, confirming their status with the exchange. Errors are tolerated with retries up to a limit; beyond that, the position is closed.
*   `onOrderScheduleCheck`:  Handles scheduled orders (resting entry orders).  Similar to `onOrderActiveCheck`, errors trigger cancellation and retries.
*   `onSignalActivePing`:  Allows for reacting to real-time events and adjusting the position (e.g., based on slippage or gaps in price). It doesn't close the position directly.
*   `onSignalSchedulePing`: Provides information about resting orders.
*  `onSignalScheduleOpen`:  Used to place the initial resting order when a scheduled signal is created.
* `onSignalScheduleCancelled`: Used to cancel the resting order when a scheduled signal is cancelled.
* `onSignalPendingOpen`: Used to place a confirmation trade and protective orders once a position is opened.
*   `onSignalPendingClose`:  Deals with the final closing of the position and recording of profit/loss.

The remaining methods (`onPartialProfitCommit`, `onPartialLossCommit`, etc.) are for specific profit and loss management strategies, providing information or actions when those events occur. They’re purely informational and don't directly manage order execution.

## Interface IBreakevenData

This data structure holds information about whether a breakeven point has been achieved for a particular trading signal. It's designed to be easily saved and loaded, often used when persisting data.

Essentially, it tells you if the breakeven goal has been met – a simple yes or no answer, represented as a boolean value. This allows for straightforward storage and retrieval of this key information.


## Interface IBreakevenCommitRow

This describes a single record detailing a breakeven commitment that's been added to a queue for processing. Each record contains information about the action being taken – in this case, it's a breakeven adjustment – and the price at which the breakeven point was established. Essentially, it's a snapshot of a calculation indicating when a trade might reach a point of no loss.

## Interface IBreakeven

This interface helps track when a trading signal's stop-loss can be moved to the entry price, essentially covering the costs of the trade. It's used by components that manage and monitor signals.

The `check` method is like a regular health check to see if the conditions for reaching breakeven are met – namely, the price has moved enough to account for fees, the stop-loss hasn’t already been moved, and moving the stop-loss is feasible. It then records that breakeven has been achieved and notifies any listeners.

When a signal is closed, the `clear` method resets the breakeven tracking, removes related data, and makes sure everything is cleaned up properly.

## Interface IBidData

This describes a single bid or ask price point within an order book. Each bid or ask has a `price`, which is represented as a string value. There's also a `quantity` associated with that price, also stored as a string, indicating how much is available at that level. Essentially, it's a snapshot of one specific offer to buy or sell.

## Interface IAverageBuyCommitRow

This interface represents a single step in a queued average-buy (DCA) strategy. It holds information about a specific buy order within the averaging process. 

Each entry details the price at which the buy occurred, the cost in US dollars, and the total number of averaging entries that will exist after this order is executed. Think of it as one line item in a plan to gradually acquire an asset.


## Interface IAggregatedTradeData

This data structure holds information about a single trade that happened. Think of it as a record of one transaction, complete with the price at which it occurred and how many units were exchanged. It also includes a timestamp marking exactly when the trade took place, and crucially, tells you whether the buyer was acting as a market maker—this helps understand the direction of the trade. Each trade is given a unique identifier for easy tracking and referencing.

## Interface IAgentLogger

This interface, `IAgentLogger`, provides a way to log messages specifically from your AI agent's activity. Think of it as a separate channel for recording what the agent *did* – its reasoning, tool use, and generated responses.  It’s distinct from the framework's own diagnostic logging, which focuses on how the testing system itself is performing. By keeping these separate, you can easily review your agent's behavior independently of any framework-level issues and ensures compatibility with existing logging setups.

To record those agent actions, you'll use the `agent` method. This method takes a topic (a label to describe the message) and any number of arguments that will be included in the log entry.

## Interface IActivityEntry

An `IActivityEntry` represents a single, ongoing trading run, whether it's a backtest or a live trade. Think of it as a record of something currently happening.

These entries are automatically created when a trading process begins, like when a backtest starts or a strategy executes.

They're also removed when that process finishes or encounters an error.

The system uses these entries to keep track of what’s running and ensure that things aren't being done at the same time inappropriately.

Each entry includes details like the trading pair’s symbol (e.g., "BTCUSDT") and information about the strategy and exchange involved. Finally, it notes whether the activity is a backtest or a live trade.

## Interface IActivateScheduledCommitRow

This interface represents a message that's put in a queue to trigger the activation of a previously scheduled task. 

It essentially tells the system to "go ahead and activate" a specific signal.

The `signalId` property is mandatory and uniquely identifies the signal to be activated. 

Sometimes, you might need to specify the `activateId` which provides context about how the activation was initiated, though it's optional.


## Interface IActionStrategy

The `IActionStrategy` interface gives your trading actions a way to peek at whether a signal is currently in progress. Think of it as a safe check to prevent actions from happening when they shouldn't, like trying to adjust a profit target when there’s no active trade.

It allows handlers to see if there's a pending signal for a specific symbol, giving you information to make informed decisions within your trading logic.

There are two key methods:

*   `hasPendingSignal` tells you if an order is currently open for a given symbol.
*   `hasScheduledSignal` tells you if a future signal is waiting to trigger for that same symbol.

This helps your actions react properly to different trading scenarios and avoids unexpected behavior.

## Interface IActionSchema

The `IActionSchema` lets you customize how your trading strategies react to events and integrate with external systems. Think of it as a way to hook into your strategy’s execution flow and run your own code at specific points. 

You can use actions to:

*   Manage the state of your strategy, like updating data in Redux or other state management libraries.
*   Send notifications to places like Telegram or Discord.
*   Track performance metrics and gather analytics.
*   Trigger custom logic based on events within your strategy.

Each action is created individually for each strategy run, giving it access to all the events happening during that run. You can add multiple actions to a single strategy to extend its capabilities.

The schema itself specifies a unique name for the action, an optional note for documentation, the code that will actually handle the events (either as a constructor or a set of functions), and optional callbacks to control its lifecycle.

## Interface IActionParams

The `IActionParams` object holds all the information an action needs to run, blending configuration details with real-time data. Think of it as the complete package passed to your action when it's executed.

It includes a `logger` to help you track what your action is doing and quickly pinpoint any issues. You'll also find the `strategyName` and `frameName` – essentially labels to identify where the action belongs within your trading system.

Knowing the `exchangeName` (like "binance") is also vital, as actions often need to interact with specific exchanges.

The `backtest` flag tells the action whether it's running in a historical simulation or live trading mode. Critically, the `strategy` property provides a window into the current state of the trading strategy - things like the signal and position details.

## Interface IActionCallbacks

This framework lets you define callbacks for different stages of your trading actions, providing a lot of flexibility and control over how your strategies interact with the system. Think of these callbacks as hooks that trigger at specific points in the process, allowing you to customize things like resource management, logging, and more.

Here's a breakdown of what each callback does, essentially acting as event listeners for different occurrences within your strategy:

**Initialization and Disposal:**

*   `onInit`: Runs when an action handler is set up. Useful for things like connecting to databases or loading data.
*   `onDispose`: Runs when an action handler is shut down.  Great for closing connections, flushing data, or saving state.

**Signal Handling (Events):**

*   `onSignal`:  A general callback triggered by signal events in both backtesting and live trading.
*   `onSignalLive`: Specifically for live trading – triggered by signals received live.
*   `onSignalBacktest`:  Specifically for backtesting – triggered by signals during backtest runs.
*   `onBreakevenAvailable`: Fires when a breakeven point is reached on a trade.
*   `onPartialProfitAvailable`:  Alerts you when a partial profit target is hit.
*   `onPartialLossAvailable`:  Notifies you when a partial loss target is reached.
*   `onPingScheduled`: Used for monitoring scheduled signals while they are waiting.
*   `onScheduleEvent`: Signals lifecycle events related to scheduled signals.
*   `onPendingEvent`:  Triggers when a pending order is opened or closed.
*   `onPingActive`:  Runs every minute when a pending position is active.
*   `onPingIdle`: Runs every tick when no signals are active.
*   `onRiskRejection`:  Signals when a signal is rejected by your risk management system.
*   `onOrderSync`:  Lets you manually gate order opening/closing, throwing errors to reject operations.
*   `onOrderCheck`: Regularly checks if an order is still valid during live trading and backtesting.

**Manual Event Handling:**

*   `onPingScheduled`, `onPendingEvent`, and `onOrderCheck` provide a manual, event-driven way to interact with the exchange, letting you create and cancel orders directly within the strategy tick.  This is an alternative to using a Broker adapter. 

Essentially, these callbacks give you fine-grained control over the lifecycle of your trading actions, allowing you to monitor, react to, and influence the process at various stages.

## Interface IAction

This interface, `IAction`, provides a flexible way to connect your custom logic to the trading framework’s events. Think of it as a centralized hub for reacting to what's happening during backtests and live trading.

You can use it to build external systems like dashboards, logging tools, or even integrate with external services like logging. It defines several methods, each corresponding to a specific type of event emitted by the trading framework.

For example, you'll find methods to respond to signal generation (`signal`, `signalLive`, `signalBacktest`), profit and loss updates (`breakevenAvailable`, `partialProfitAvailable`, `partialLossAvailable`), or the lifecycle of scheduled signals (`pingScheduled`, `scheduleEvent`). 

There are also handlers for order management (`orderSync`, `orderCheck`) for advanced use cases where you need to react to order events. Finally, `dispose` lets you clean up resources when your integration is no longer needed.  Essentially, it allows you to plug your own processes into the core trading flow.

## Interface HighestProfitStatisticsModel

This model holds information about the events that resulted in the highest profits during a trading backtest. It's essentially a record of those peak performance moments.

You'll find a complete, ordered list of those profitable events within the `eventList` property, with the most recent events appearing first. The `totalEvents` property simply tells you how many of these peak profit events were recorded throughout the backtest.

## Interface HighestProfitEvent

This data structure represents the single best-performing trade recorded during a backtesting or live trading period. It bundles together all the key details about that winning trade, allowing you to easily identify and analyze the factors that contributed to its success. You’ll find information like the exact time the record was set, the trading pair involved, and the name of the strategy that generated the trade.

It also includes details on the trade's direction (long or short), its overall profit and loss (PNL), the highest profit it reached, and the maximum drawdown it experienced. Furthermore, the record holds the price at which the record profit was achieved, along with the entry, take profit, and stop-loss prices. A flag indicates whether this record came from a backtest simulation or a live trading scenario.

## Interface HighestProfitContract

The `HighestProfitContract` provides information when a trading position reaches a new peak profit. It gives you details like the trading symbol, the current price at that moment, and the exact time of the update. You'll also see which strategy, exchange, and timeframe were involved, along with the data from the signal that triggered the trade. Importantly, this contract also tells you whether the profit milestone was reached during a backtest or a live trade, allowing you to adjust your reactions accordingly. This allows you to build logic for actions like adjusting stop losses or taking partial profits as your trades become profitable.

## Interface HeatmapStatisticsModel

This structure holds a summary of how your entire portfolio performed, aggregating data across all the different assets you're trading. It breaks down the overall picture with key metrics like total profit/loss, risk-adjusted returns (Sharpe and Sortino ratios), and trade-related details.

You'll find a list of individual symbol statistics, along with totals for the whole portfolio – things like the total number of symbols traded, overall profit, and the average peak and fall in profit.

It also gives you insights into the trade durations, win/loss streaks, and even how consistently profitable you've been, represented through averages and standard deviations.  Finally, it presents projections like expected yearly returns and trade frequency, helping you understand potential future performance.

## Interface DoneContract

This interface represents what happens when a background process finishes, whether it's a backtest or a live trading session. It gives you information about the completed execution, like which exchange was used, the name of the strategy that ran, and whether it was a backtest or live trade. You’ll see this data when a background task is done, allowing you to understand what just happened and potentially react to it.

It includes details such as:

*   The name of the exchange.
*   The name of the trading strategy.
*   The name of the frame involved (this will be blank if it's a live session).
*   Whether it was a backtest or a live trade.
*   The trading symbol, like BTCUSDT.

## Interface CronHandle

This `CronHandle` is like a little key that lets you cancel a scheduled task you created with the Cron system. Think of it as a way to say "undo" to a recurring event. If you no longer need a task to run automatically, you can use this handle to remove it, ensuring it stops running. It's a simple and direct way to clean up your scheduled tasks.

## Interface CronEntry

A CronEntry defines when and how a specific task runs within the backtest framework. It's essentially a schedule for executing a piece of code.

Each entry needs a unique name to identify it, and this name cannot contain colons. 

You specify the interval – like every minute, five minutes, or hourly – at which the handler should be triggered. If you skip the interval altogether, the task runs just once, immediately upon the first matching tick.

You can also create a whitelist of symbols to restrict the handler to specific instruments; if you don't provide a list of symbols, the handler runs only once for all backtests. With a symbol list, it runs once for each whitelisted symbol.

Finally, the `handler` property tells the system what function to actually execute when the schedule is met.

## Interface CriticalErrorNotification

This notification signals a critical error that needs immediate attention, usually resulting in the trading process stopping. 

It includes details about the error itself, such as a unique identifier, a human-readable explanation, and a full stack trace to help pinpoint the problem's origin. 

The 'type' field confirms it's a critical error notification. You'll notice the `backtest` flag is always false because these errors happen during live trading, not during simulations.

## Interface ColumnModel

This describes how to define a column for generating tables, especially for displaying data in markdown. Think of it as a blueprint for what each column should look like.

Each column has a unique `key` to identify it, a `label` to show as the column header, and a `format` function that transforms your data into a readable string.  You can also specify an `isVisible` function that lets you conditionally hide or show a column based on certain conditions. This lets you tailor the display of your data to precisely how you want it presented.

## Interface ClosePendingCommitNotification

This notification alerts you when a pending trade signal is closed before the position is fully activated. It provides a detailed breakdown of what happened, whether it’s from a backtest or live trading.

You'll find details like the unique ID of the signal, the exact time it was closed, the trading symbol involved (like BTCUSDT), and the name of the strategy that generated it. The notification also includes crucial pricing information – the original take profit and stop loss prices, the actual prices used, and how many entries and partial closes were involved.

It also gives you a complete picture of the position's performance, including the total profit or loss (in both USD and percentage terms), peak profits, maximum drawdowns, and the prices at which those points were reached.  You can track things like the initial cost of the trade, the leverage used, and timestamps relating to when the signal was created and the position activated. Finally, you’ll find a field for a note, where you can record custom explanations for the closure.

## Interface ClosePendingCommit

This signal indicates that a pending order has been closed. 

It includes details about the closure, such as a unique identifier you can provide to track why the order was closed. 

You'll also find comprehensive profit and loss data for the closed position, including the total profit/loss, the highest profit reached, and the largest drawdown experienced during its lifetime. This information allows you to thoroughly analyze the performance of the closed order.

## Interface CancelScheduledCommitNotification

This notification signals that a scheduled trading signal was cancelled before it could be activated. It provides detailed information about the cancelled signal, including its unique identifier, the time of cancellation, and whether it occurred during a backtest or live trading session.

The notification includes specifics about the trade itself, like the trading pair, strategy, exchange, and trade direction (long or short), along with the intended entry price and stop-loss/take-profit levels. You’ll also find details regarding the original signal, such as the creation timestamp, the planned activation time, and the potential cost of the trade.

Beyond just the basics, it provides a comprehensive financial snapshot of what *would have* been the trade, including profit and loss calculations, peak profit, maximum drawdown, and the associated prices and costs. A field for a user-provided reason for cancellation is also included. Essentially, this notification gives you a full picture of a signal that didn't execute due to cancellation.

## Interface CancelScheduledCommit

This interface represents a signal used to cancel a previously scheduled event within the backtest kit. It's a way to tell the system to disregard a pending action. 

You can provide a `cancelId` to help identify why the cancellation occurred, which is useful for tracking and debugging. 

Alongside the cancellation request, the signal includes performance data for the position being affected: specifically, its total profit and loss (`pnl`), the highest profit reached (`peakProfit`), and the largest loss experienced (`maxDrawdown`). This data offers valuable context about the trade's history before it was canceled.

## Interface BreakevenStatisticsModel

This model holds information about breakeven events that occurred during a backtest.

It essentially gathers and organizes data related to when trades reached a breakeven point.

You’ll find a list of all individual breakeven events, each containing detailed information.

It also provides a simple count of how many breakeven events were recorded.

## Interface BreakevenEvent

This data structure represents a breakeven event, providing all the crucial details about when a trading signal reached its breakeven point. It bundles information like the exact time of the event, the symbol being traded, the name of the strategy used, and the unique ID of the signal.

You'll find important price points included, such as the entry price (breakeven level), take profit target, and stop-loss levels, along with their original values set when the signal was created. The data also tracks details of any dollar-cost averaging (DCA) strategies used, including the total number of entries and partial closes. 

Furthermore, it includes performance metrics like unrealized profit and loss (PNL), and a human-readable note explaining the signal’s rationale, alongside timestamps for when the position became active and when the signal was initially created. A flag indicates whether the event occurred during a backtest or in a live trading environment.

## Interface BreakevenContract

The `BreakevenContract` represents a significant event in your trading strategy – when the stop-loss for a trade is moved back to the original entry price. Think of it as a milestone where the trade has covered its costs and the risk has been reduced.

This event is triggered for each trading signal and is designed to be reliable, ensuring that it only fires once per signal. The data provided includes essential details like the trading symbol, the strategy's name, and the exchange it’s running on. 

It contains a snapshot of the original signal data – including the initial stop-loss and take-profit levels – as well as the current price that triggered the event. You can also tell whether this breakeven event happened during a backtest using historical data or in live trading.

Components like the `BreakevenMarkdownService` use these events to create reports, and you can also set up your system to respond to these breakeven events in real-time with callbacks.

## Interface BreakevenCommitNotification

This notification signals that a breakeven action has been executed on a trade. It provides a wealth of information about the trade's history and performance. You'll find details like a unique ID for the notification, the exact time it occurred, and whether it happened during a backtest or live trading.

The notification includes details about the traded asset (symbol), the strategy involved, and the exchange used. It also breaks down the trade's specifics, including the entry and exit prices, stop-loss levels, and the number of entries and partial closes.

Furthermore, it provides comprehensive profit and loss (PNL) data – everything from the total PNL in USD to percentage gains or losses, peak profit achieved, and maximum drawdown experienced. The notification also includes information about the initial investment cost, leverage used, and timestamps for when the signal was created, became pending, and when the notification itself was generated. A descriptive note can also be included to explain the signal’s reasoning.

## Interface BreakevenCommit

This describes a "breakeven" event within a trading strategy's backtesting process. It signifies a point where the strategy has adjusted a trade, essentially aiming to secure some profit and minimize potential losses.

The event contains detailed information about the trade's current state, including the current market price, the overall profit and loss realized so far, and the highest profit and largest drawdown experienced. 

It also gives specifics on the trade's direction (long or short), the initial entry price, and the take profit and stop loss levels, both as they currently exist and as they were originally set. 

Finally, timestamps indicate when the signal was created and when the position initially became active. Essentially, it's a snapshot of the position at the point of a breakeven adjustment, allowing for analysis of the strategy's behavior.


## Interface BreakevenAvailableNotification

This notification alerts you when a trade's stop-loss can be moved to the entry price, essentially letting you break even. It provides a wealth of information about the trade, including a unique ID, when it happened, and whether it's a backtest or live trade.

You'll find details like the trading pair, strategy name, exchange, and the current market price. Crucially, it includes the original entry price and how it's been affected by any averaging (DCA) or trailing adjustments to the take profit and stop-loss levels.

The notification also gives you a breakdown of the trade's financial performance – the cost, multiplier, number of entries/partials, P&L, peak profit, and maximum drawdown – all expressed as percentages and absolute USD values.  There's even information about the prices and entries at peak profit and maximum drawdown points. 

Finally, there’s an optional note to explain the signal’s reasoning and timestamps for when the signal was scheduled, pending, and the notification itself was created.

## Interface BeforeStartContract

The `BeforeStartContract` event lets you perform one-time setup tasks right before a strategy begins running, whether it's a backtest or live trade. It's like a preparation signal that’s guaranteed to happen only once at the start of each run. You'll always get a corresponding `AfterEndContract` event later, even if the run encounters issues.

This event gives you key details about the run, including the trading symbol, the strategy's name, the exchange involved, and the timeframe being used.  You'll also find information like the current price and the time the run is starting – in backtests, this is the intended starting point of the historical data, while in live mode, it’s the current time. The `backtest` property tells you if it’s a backtest or a live run, and you can use it to adjust your setup accordingly. You get both a `Date` object and a timestamp for the event time, offering flexibility for handling the time information. Any errors in your listener will be handled separately, ensuring the run continues.

## Interface BacktestStatisticsModel

This model gives you a detailed breakdown of how your trading strategy performed during a backtest. It collects a wide range of statistics, from the total number of trades and win/loss counts to more advanced metrics like Sharpe Ratio and Calmar Ratio, which help evaluate risk-adjusted performance. You'll find information about average profit/loss per trade, volatility, and trade durations.

The `signalList` property provides access to all the individual trade details, allowing for deeper investigation of specific trades. Several of the metrics, like average PNL and Sharpe Ratio, are marked as potentially unsafe (null) if calculations encounter issues like division by zero.

The model also includes insights into market pressure and trends, identifying whether the overall trend was bullish, bearish, sideways, or neutral, along with measures of trend strength and confidence.  Finally, it provides granular details about winning and losing streaks and characteristics of trade movements.

## Interface AverageBuyCommitNotification

This notification tells you when a new buy order has been added to a position using a dollar-cost averaging (DCA) strategy. It provides detailed information about the trade, including a unique ID, the exact time it happened, and whether it's part of a backtest or live trading. 

You'll see the trading pair involved (like BTCUSDT), the strategy that triggered the buy, and the exchange used. It also includes the price at which the new buy occurred, the total cost of that buy, and the current average price of the position.

The notification gives a comprehensive look at the position’s performance too - its peak profit, maximum drawdown, and overall profit/loss in both USD and percentage terms. It also includes details about original prices, stop-loss and take-profit levels, and the number of buys and partial exits made so far. Finally, there’s a field for a short explanation of why the buy was made.

## Interface AverageBuyCommit

This interface represents an average-buy event within a trading strategy, which is useful for strategies implementing dollar-cost averaging. It provides details about the averaging purchase, including the price at which the trade was executed, the total cost of that purchase, and the new, averaged entry price. The interface also includes information about the position's current profit and loss (both realized and unrealized), the peak profit achieved, and the maximum drawdown experienced. 

You can track how the averaging is affecting the position's performance. It also records the original entry price and details about the take profit and stop-loss levels, both original and adjusted for trailing. Timestamps associated with the signal and position activation are included for precise tracking of events.

## Interface AfterEndContract

The `AfterEndContract` is a signal that's triggered when a trading strategy finishes running. This happens whether the strategy completes normally, encounters an error, or is stopped prematurely. It’s designed to help you clean up after a strategy run, like saving final data or sending notifications.

You can expect this signal to fire exactly once for each time a strategy run begins, and it always comes paired with a `BeforeStartContract` signal.

The `when` property of this signal tells you when the strategy finished. In backtesting, it's the time of the last candle processed; if no candles were processed, it uses the frame’s starting time, ensuring accurate duration calculations. In live trading, it represents the current time, rounded to the nearest minute.

The signal also includes information about the trading symbol, the name of the strategy and exchange, the frame used, and whether it’s a backtest or live run. A handy `currentPrice` is included so you don't have to pull it from the exchange yourself. Finally, `timestamp` provides the same date information as `when`, but as a millisecond value, making it easier to serialize for logging or other purposes.

## Interface ActivePingContract

This describes a specific type of event, an "ActivePing," that occurs within the backtest-kit framework when a trading signal is active and being monitored. Think of it as a heartbeat signal confirming the system is still tracking a pending trade.

It’s emitted roughly every minute while a signal is still open (not yet closed) and provides a wealth of information to help you manage those active trades. You can use it to build custom logic that reacts to how a trade is performing.

The event includes details like the trading pair (e.g., BTCUSDT), the name of the strategy managing the trade, the exchange being used, and the timeframe being analyzed. It also gives you access to the full data of the pending signal and the current price of the asset.

Finally, you’ll know whether the event originates from a historical backtest run or a live trading session. This is crucial for tailoring your logic appropriately. You can subscribe to these ActivePing events to trigger actions in your trading system.

## Interface ActivateScheduledCommitNotification

This notification tells you when a scheduled trading signal has been activated, letting you know a trade is about to happen. It’s like a heads-up that a plan you set up is now being put into action.

The notification includes a ton of detail about the trade, such as the unique identifier, the exact time it was activated, and whether it's a backtest or a real trade. You'll also find information about the trading pair, the strategy that triggered the signal, and the specifics of the order itself - including price targets for profit and loss.

Essentially, it's a comprehensive snapshot of everything you need to know about a scheduled trade as it's being executed, covering details from the initial cost and leverage used to performance metrics like peak profit and maximum drawdown. The 'createdAt' field tells you when the notification itself was generated.

## Interface ActivateScheduledCommit

This interface represents an event triggered when a scheduled signal is activated. It provides comprehensive details about the trade being executed.

You'll find information like the direction of the trade (long or short), the entry and take profit/stop loss prices, both original and adjusted for any trailing.

The event also includes performance metrics like total profit and loss (PNL), peak profit, and maximum drawdown, reflecting the position's history up to the point of activation. 

Finally, timestamps for when the signal was initially created and when it's being activated are also provided, alongside an optional user-provided identifier to explain the activation reason.
