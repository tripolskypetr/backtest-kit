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

This interface defines the information passed when a walker is instructed to stop. It's used to signal that a particular trading strategy needs to be halted.

The signal includes the trading symbol involved, the name of the strategy being stopped, and crucially, the name of the walker itself. This last detail is important because you might have several walkers running different strategies on the same symbol, and this helps pinpoint exactly which one to interrupt. Think of it like a precise instruction to stop a specific strategy running on a particular asset.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps you understand how different strategies performed during a backtest. It's essentially a collection of results from multiple strategies, allowing you to easily compare their strengths and weaknesses. 

Specifically, the `strategyResults` property contains an array—a list—of these individual strategy results, each detailing a strategy's performance metrics. This makes it straightforward to see, at a glance, which strategies did best and why.


## Interface WalkerContract

WalkerContract defines what information is shared as a strategy backtest progresses. It's like a notification that a particular strategy has finished being tested, allowing you to track how it's performing relative to others.

Each notification includes details such as the name of the strategy, the exchange and symbol being tested, and the backtest statistics generated.

You'll also find the strategy's optimized metric value, alongside the best metric observed so far and which strategy achieved it. Finally, it tells you how many strategies have been tested and how many remain. This lets you monitor the entire backtest process and see how strategies are stacking up against one another.


## Interface WalkerCompleteContract

The WalkerCompleteContract represents the final stage of a backtesting process, signaling that all strategies have been evaluated. It bundles together all the crucial results from the backtest run. 

You'll find information about which walker performed the test, the trading symbol involved, and the exchange and timeframe used.

It also details the optimization metric, the total number of strategies tested, and identifies the best-performing strategy based on that metric.

Finally, the contract provides the detailed statistics associated with that top strategy, giving you a complete picture of its performance.

## Interface ValidationErrorNotification

This notification signals that a problem arose during validation – likely due to something in your trading strategy or setup failing a check. 

It's a way for the system to tell you that a validation function encountered an error.

Each notification includes a unique ID, a detailed error message you can understand, and a serialized error object with a stack trace for debugging.

The `backtest` property is always false because these errors happen during the live validation phase, not within a simulated backtest environment.

## Interface ValidateArgs

This interface, ValidateArgs, acts as a blueprint for ensuring the names of various components in your backtesting setup are correct. Think of it as a quality check for things like the exchange you're trading on, the timeframe you're using, or the strategy you've chosen.

It defines properties for ExchangeName, FrameName, StrategyName, RiskName, ActionName, SizingName, and WalkerName. Each of these properties expects an enum – essentially a list of acceptable values. The system will then verify that the names you’re using for these components are actually in that allowed list.

This helps prevent errors and ensures consistency throughout your backtesting process by making sure everything is labeled correctly and refers to a recognized component.

## Interface TrailingTakeCommitNotification

This notification signals that a trailing take-profit order has been executed. It provides a wealth of information about the trade, including a unique identifier, the exact time it happened, and whether it occurred during a backtest or live trading. You'll find details about the trading pair, the strategy that triggered it, and the exchange used.

The notification details the original and adjusted take-profit and stop-loss prices, along with crucial metrics like the percentage shift applied to the original take-profit level. It also breaks down the trade's performance with profit and loss (both absolute and percentage), peak profit achieved, and maximum drawdown experienced.

Furthermore, you'll get a complete picture of the position’s history—the entry price, the total number of entries if using dollar-cost averaging, and the number of partial closes performed. Detailed PNL calculations, including slippage and fees, are also included, as well as timestamps for signal creation and execution. Finally, a human-readable note can offer additional context about the reason behind the signal.

## Interface TrailingTakeCommit

This interface describes an event triggered when a trailing take profit order is executed. It represents a point in time when the take profit price has been adjusted based on a percentage shift, effectively following the market price. 

The event provides detailed information about the trade, including the direction (long or short), the original entry price, and the current market price that caused the adjustment. You'll find the updated take profit and stop-loss prices, along with their original values before any trailing adjustments occurred.

Furthermore, the event captures performance metrics for the position, such as the total profit and loss (pnl), the highest profit achieved (peakProfit), and the maximum drawdown experienced. Timestamps indicate when the signal was created and when the position was activated. This information is invaluable for analyzing the effectiveness of your trailing take profit strategy.


## Interface TrailingStopCommitNotification

This notification signals that a trailing stop order has been triggered and executed. It provides a wealth of detail about the trade, including when it happened, which exchange and strategy were involved, and the specific parameters of the trailing stop itself – like the percentage shift applied. You’ll find information about the trade's direction (long or short), entry and stop-loss prices, and how they were adjusted by the trailing mechanism.

The notification also includes extensive performance data for the trade, like peak profit, maximum drawdown, and P&L figures, all meticulously tracked with details on slippage and fees. This allows for a thorough post-trade analysis of the strategy’s performance, offering insights into the trade's profitability and risk profile. Finally, there’s a timestamp indicating when the notification itself was generated, and a field for a human-readable note explaining the reason for the signal.

## Interface TrailingStopCommit

This describes a trailing stop event, which happens when a trailing stop-loss order is triggered during a trade. The `action` property simply confirms that this is a trailing stop event. The `percentShift` tells you how much the stop-loss price was adjusted, expressed as a percentage. 

You'll also find details about the trade itself, including the `currentPrice` at the time of the adjustment, the `position` (whether it was a long or short trade), and the `priceOpen` - the original entry price. The `priceTakeProfit` and `priceStopLoss` show the current, potentially adjusted, prices for taking profit and stopping losses. 

For historical context, `originalPriceTakeProfit` and `originalPriceStopLoss` tell you the original take profit and stop loss prices before any trailing adjustments were made.

Finally, performance metrics are included such as `pnl` (profit and loss), `peakProfit` (the highest profit reached during the trade), and `maxDrawdown` (the largest loss experienced). `scheduledAt` and `pendingAt` provide timestamps relating to when the signal was created and when the position was activated.

## Interface TickEvent

This describes a standardized tick event, which is a core piece of data for analyzing and understanding what's happening during a trading process. Think of it as a single snapshot of an event, providing comprehensive information about a trade's lifecycle.

Each event has a timestamp indicating when it occurred, and an `action` type that categorizes it – like a scheduled order, a canceled trade, or a position being opened or closed.  Specific details vary depending on the action; for instance, "scheduled" or "opened" events will include signal information like the `signalId`, `position` type, and potentially notes.

The event also includes key price points – the open price, take profit, stop loss, and their original values – and details about averaging strategies if used (like `totalEntries` and `totalPartials`). Financial data like profit and loss (both absolute and percentage), along with metrics like progress toward take profit and stop loss, are also recorded.  For completed positions, you'll find the close reason and duration, while peak and fall PNL values offer insights into the position's performance.  Essentially, this structure provides a unified way to track all aspects of a trade.


## Interface SyncStatisticsModel

The SyncStatisticsModel helps you understand how your signals are syncing. It essentially tracks events related to signal lifecycle, like when signals are opened or closed. 

You'll find a detailed list of all syncing events within the `eventList` property, allowing you to examine individual occurrences. The `totalEvents` property provides a quick count of all syncing activities. 

To easily monitor signal openings, use the `openCount`, and to track signal closures, use the `closeCount`.

## Interface SyncEvent

The `SyncEvent` object acts as a central record of everything that happens during a trading signal's lifecycle. It contains a wealth of information about each event, from when the signal was created to when it was closed.

You'll find details like the exact timestamp of each action, the trading pair involved, the name of the strategy used, and the exchange it ran on. The `frameName` indicates if this is a live signal or part of a backtest.

Each signal has a unique identifier (`signalId`) and a type of action associated with it.  Important pricing information like entry price (`priceOpen`), take profit (`priceTakeProfit`), and stop loss (`priceStopLoss`) are all included, as are the original values before any trailing adjustments.

For signals involving DCA (Dollar Cost Averaging) or partial closes, you'll also see the total number of entries and partials executed.  Profit and loss (`pnl`), including peak profit and maximum drawdown, are tracked to showcase the position's performance.

If a signal is closed, the `closeReason` explains why, and a `backtest` flag indicates whether the event occurred during a simulation. Finally, a timestamp of when the event was created (`createdAt`) is stored for audit purposes. This consolidated data allows for detailed analysis and report generation.

## Interface StrategyStatisticsModel

This model holds detailed information about what happened during a strategy's execution. Think of it as a record of all the actions your strategy took.

It keeps track of things like the total number of events, and breaks those down further, showing how many times your strategy canceled scheduled actions, closed pending orders, took partial profits or losses, adjusted trailing stops, or hit breakeven points. 

You’ll also find counts for actions like activating scheduled orders and average buy (dollar-cost averaging) events.

The `eventList` property gives you access to a complete history of each individual strategy event, including all its details.

## Interface StrategyEvent

This data structure holds all the key information about what's happening in your trading strategy, allowing for detailed reports and analysis. It essentially captures every action taken – from initial entry to profit taking or stop-loss triggers.

You'll find details like the exact time of the event, the trading pair involved, the strategy and exchange being used, and whether it's a backtest or live trade. Crucially, it records the action itself, along with the current market price, and any percentage-based adjustments like profit targets or trailing stops.

For more complex strategies involving scheduled or pending actions, you'll see identifiers (cancelId, closeId, activateId) to track those operations. The structure also keeps track of entry prices, stop-loss levels, and whether they've been adjusted by trailing stops, along with how many DCA entries have been made. Finally, it includes profit and loss information, costs associated with trades, and any optional notes added to the commit. It allows to understand signal creation and pending times as well.

## Interface SignalScheduledNotification

This notification tells you when a trading signal has been planned for a future execution. It's like a heads-up that a trade is about to happen. 

The notification includes details like a unique ID, the exact time the trade was scheduled, and whether it's happening in a test environment or live. You’ll also find important information about the trade itself: the trading pair (like BTCUSDT), the strategy that generated the signal, the exchange it’ll be executed on, the trade direction (long or short), and the planned entry, take profit, and stop-loss prices. 

It provides a comprehensive snapshot of the signal’s performance metrics too, like total profit and loss, peak profit achieved, and the maximum drawdown experienced, along with percentages and prices related to these. Finally, there’s an optional note to provide additional context or reasoning behind the signal.

## Interface SignalOpenedNotification

This notification tells you when a new trade has been opened by the system. It's a signal that a position is now active, whether it's a backtest simulation or a real-time trade. The notification provides a wealth of detail, including a unique identifier, the exact time the trade started, and whether it's a long (buy) or short (sell) position. 

You'll find information about the trade's symbol (like BTCUSDT), the strategy that triggered it, and the exchange used.  Crucially, it also includes details like the entry price, take profit and stop-loss levels, and information about any averaging strategies (DCA) or partial exits used. 

Beyond the basic trade information, you get performance metrics like total profit & loss (both in USD and percentage), peak profit and maximum drawdown, and specific price points associated with those metrics. This data allows for a detailed understanding of the position’s performance characteristics and can be used for analyzing the strategy's effectiveness. There’s also a “note” field for any custom explanations of the signal's reason and timestamps for when the signal was created and pending.

## Interface SignalInfoNotification

This notification type lets your trading strategies communicate important details about a position to the outside world. Think of it as a way for your strategy to "shout out" information about a trade, like an update on its performance or key details about its configuration. It's particularly useful for monitoring strategies, creating custom dashboards, or integrating with other systems.

The notification includes things like the trade's symbol, the strategy that initiated it, and the exact time it was triggered. It also provides a wealth of performance data, like realized profit and loss, peak profit, and maximum drawdown, all calculated during the position's life. You'll find details about take profit, stop loss levels, and how they might have changed with trailing adjustments. 

Crucially, it also conveys user-defined notes, giving you the flexibility to include custom messages or explanations alongside the data. The notification includes identifiers for tracking and correlation across different systems, plus timestamps marking important phases of the trade – scheduling, pending, and creation. This extensive information lets you gain a deep understanding of your strategy's behavior and performance.

## Interface SignalInfoContract

This structure, `SignalInfoContract`, lets strategies communicate custom information during trading. Think of it as a way to broadcast messages about what's happening in your strategy—like a debugger or a way to send notifications to other systems.

When a strategy uses the `commitSignalInfo()` function, this object is sent out to any listeners.

It includes details like the symbol being traded (e.g., BTCUSDT), the name of the strategy that triggered the event, and the exchange and frame involved.

You'll find the full data from the signal itself, including original price levels and execution details.

There’s also the current market price at the time of the event, a user-defined note for extra context, and an optional ID for tracking purposes.

Finally, it clearly indicates whether the event comes from a backtest (historical data) or live trading. A timestamp provides a precise record of when the event occurred.

## Interface SignalEventContract

This interface helps you keep track of when trading positions are opened and closed within the backtest framework. It acts like a notification system, letting you know about significant events without needing to constantly monitor all signal activity. You’ll receive these notifications when a position begins – whether it’s from a new signal, an immediate entry, or a scheduled action – and when it concludes, covering various exit scenarios like hitting take profit or stop loss levels, or being closed manually.

The notification includes details like the trading symbol, the strategy responsible, the exchange involved, and the timeframe being used. You’ll also get the full data associated with the signal that triggered the event, containing details like entry price, stop-loss levels, and potential profit. If a position is closed, the reason for closure will be specified. The notification also indicates if the event occurred during a backtest or live trading session and provides a timestamp for precise timing information. These notifications are useful for user callbacks and tracking the active state of trades.

## Interface SignalData$1

This `SignalData` object holds all the key details for a single trading signal that has been closed. Think of it as a record of one completed trade. 

It includes the name of the strategy that created the signal, a unique ID for that signal, and the trading symbol involved. 

You'll also find information about whether the position was a long or short one, the percentage profit or loss (PNL) realized from the trade, and the reason why the position was closed. Finally, it records the exact times the signal was opened and closed.

## Interface SignalCommitBase

This interface defines the common information found in every signal commitment event, whether it's part of a backtest or a live trade. Each signal event includes details like the trading symbol (e.g., BTCUSDT), the name of the strategy that created it, and the exchange used. 

You'll also find information specific to backtesting, like the timeframe used, and whether the event originated from a backtest or live execution. A unique identifier for the signal, a timestamp reflecting when it occurred, and tracking details like the number of entries and partial closes are also provided. 

Crucially, it preserves the original entry price – the price when the signal was first generated – even if the trade is later adjusted through dollar-cost averaging. Finally, the entire signal data is bundled in a standardized format, along with an optional note for explaining the signal's reasoning.

## Interface SignalClosedNotification

This notification tells you when a trading position has been closed, whether it was triggered by a take profit or stop loss, or simply expired. It provides a wealth of information about the trade, including a unique identifier, when it closed, and whether it happened during a backtest or live trading. You’ll find details like the symbol traded, the strategy used, and the direction of the trade (long or short).

The notification also breaks down the financial performance of the trade, showing the entry and exit prices, take profit and stop loss levels, and the total profit or loss, both in percentage and in raw USD. It even tracks the peak profit and maximum drawdown the position experienced and the prices at which those occurred.

Finally, you can see details about the trade's execution, such as the number of entries made (useful if averaging was involved), the duration of the position, and a textual explanation for why it closed. It also keeps track of when the signal was first scheduled and when it went pending.

## Interface SignalCancelledNotification

This notification tells you that a trading signal was cancelled before it could be activated. It's like getting a heads-up that a planned trade won't happen.

The notification includes a lot of details about the cancelled signal, such as a unique identifier, the exact time of cancellation, and whether it occurred during a backtest or live trading.

You'll also find information about the signal's specifics – the trading pair, the strategy that generated it, the intended trade direction (long or short), and the initially planned take profit and stop-loss prices.

If the signal involved averaging entries (DCA) or partial closes, the notification reveals how many of each were planned.

The `cancelReason` field explains *why* the signal was cancelled, which could be due to a timeout, price rejection, or a manual cancellation by a user. The `cancelId` provides further context if the cancellation was initiated by a user.

Finally, timestamps track the signal’s lifecycle, from initial creation to its pending state and eventual cancellation, providing a full picture of the event.

## Interface Signal

The `Signal` object holds information about a specific trading signal generated by your strategy. It tells you the opening price of the trade.

It also keeps track of the entry details for each position taken—including the price, cost, and time of entry.

Finally, it records any partial exits, specifying the type of exit (profit or loss), the percentage of the position closed, the price at which it exited, the cost basis at the time of closing, the number of shares/contracts exited, and the timestamp.

## Interface Signal$2

This `Signal` object holds the details about a single trading signal generated by your backtest. 

It keeps track of the initial entry price, which is the price at which you first bought or sold.

You'll also find records of any partial exits from the position, noting whether they were profitable or resulted in a loss, along with the price, cost basis, and the number of units held at the time.

Finally, the object stores a history of entry points, including price, cost, and timestamp, useful for analyzing trade performance.

## Interface Signal$1

This `Signal$1` object holds key details about a single trading signal used within the backtest-kit framework. It tracks the initial entry price for a trade, represented by the `priceOpen` property.

You'll also find a record of entry events, including the price, cost, and timestamp of each.

Finally, it stores information about any partial exits from the position, specifying whether they were profit-taking or loss-limiting actions, along with details like the percentage change, current price, cost basis at the time of closure, the number of units held at that point, and the timestamp.


## Interface ScheduledEvent

The `ScheduledEvent` object acts as a central record for all trading events – when a signal is scheduled, opened, or cancelled. It bundles together a wealth of information about each event, making it easier to analyze and generate reports.

Each event has a timestamp, identifies the specific action taken (scheduled, cancelled, or opened), and details the trading pair involved. You'll find the unique signal ID and position type associated with the event.

Beyond the basics, it includes notes about the signal, the current market price at the time, and the entry, take profit, and stop loss prices. Crucially, it stores the original take profit and stop loss prices before any adjustments were made.

For signals using DCA (Dollar-Cost Averaging) strategies, you'll also see details about the number of entries and partial closes. It even tracks the total executed percentage of partial closes.

Finally, the object includes information about the position's PNL (profit and loss), how long the position was open or cancelled, and, in the case of cancellations, the reason behind it and a unique cancellation ID. You'll also see the original entry price before any averaging and the time the position became active.

## Interface ScheduleStatisticsModel

This model gives you a clear picture of how your scheduled signals are performing. 

It tracks all the events associated with your scheduled signals – when they were scheduled, opened (activated), or cancelled. 

You’ll find the total count of each type of event, alongside key performance indicators like cancellation and activation rates. 

The cancellation rate tells you how often scheduled signals are cancelled, and the activation rate shows how often they’re successfully turned into open signals.

Finally, it provides insights into how long signals typically wait before cancellation or activation, helping you identify potential bottlenecks or areas for optimization.


## Interface SchedulePingContract

This defines a standardized way for the backtest-kit framework to notify you about ongoing scheduled signals. Think of it as a heartbeat, letting you know a signal is actively being monitored. These "schedule ping" events happen every minute while a signal is running – it's not triggered when a signal is first created or when it's stopped.

It gives you a chance to keep tabs on the signal's lifecycle and put your own monitoring rules in place. You can listen for these pings repeatedly or just once.

Each ping contains essential information:

*   **symbol:** The trading pair, like "BTCUSDT".
*   **strategyName:** The name of the trading strategy in use.
*   **exchangeName:** The exchange the signal is being tracked on.
*   **frameName:** The timeframe or date range of the analysis. This is blank during live trading.
*   **data:** All the details about the scheduled signal itself, including entry price, take profit, and stop loss.
*   **currentPrice:** The current market price at the moment the ping was sent.
*   **backtest:** A flag indicating whether the ping comes from a historical backtest or live trading.
*   **timestamp:** When the ping was generated.

This provides a structured way to build custom logic around your scheduled signals, such as automatically cancelling a signal if certain conditions are met.

## Interface ScheduleEventContract

This contract helps you keep track of what’s happening with your scheduled trading signals without needing to constantly monitor all the signals. It announces when a signal is initially scheduled (meaning it’s waiting to be triggered) and when it's removed before it ever gets activated.

Think of it like getting a heads-up when a signal is added to the queue, or when it's taken out because something went wrong – maybe it timed out, the price moved against it too quickly, or you manually cancelled it.

Here's a breakdown of what's included in each notification:

*   **Action:** Tells you whether a new signal was scheduled or if an existing one was cancelled.
*   **Symbol:** The trading pair involved (like BTCUSDT).
*   **Strategy & Exchange Names:** Identifies which strategy and exchange the signal belongs to.
*   **Frame:** The timeframe or date range the signal is associated with.
*   **Data:**  All the details of the signal itself, like its ID, price targets, and stop-loss levels.
*   **Reason (for cancellations):** Explains *why* the signal was cancelled (e.g., timeout, price rejection, user intervention).
*   **Current Price:** The market price at the moment of the event.
*   **Backtest Flag:**  Indicates whether the event happened during a backtest or live trading.
*   **Timestamp:**  The exact time of the event, which is the real-time moment in live trading or the candle timestamp in backtesting.

You can use this contract to listen for these events, allowing you to react to changes in your scheduled signals without needing to process the full signal stream.

## Interface RiskStatisticsModel

This model holds information about risk events that occurred during a backtest. Think of it as a report card for your risk management system.

It includes a detailed list of all the risk rejections that happened, along with the total number of rejections. 

You can also see how these rejections are distributed - broken down by the trading symbol involved, and by the strategy that triggered them. This helps identify areas needing attention.

## Interface RiskRejectionNotification

This notification alerts you when a trading signal is blocked by your risk management rules. It's a way of knowing why a potential trade didn't happen.

The notification includes details like a unique ID, the timestamp of the rejection, and whether it occurred during a backtest or live trading. You’ll also see the symbol being traded (like BTCUSDT), the name of the strategy that generated the signal, and the exchange involved. 

It provides a clear explanation for the rejection, an optional unique rejection identifier for tracking, and information about your existing portfolio.  You'll get the current price at the time of the rejection, and specifics about the proposed trade, including entry price, take profit, stop loss and the signal’s reason.

## Interface RiskEvent

The RiskEvent data structure holds information about situations where trading signals were blocked due to risk management rules. It’s essentially a record of when a trade didn’t happen because a limit was triggered.

Each RiskEvent contains details like when it occurred (timestamp), the symbol being traded, the specifics of the signal that was rejected, the name of the strategy involved, the exchange and timeframe being used, and the current market price.

You'll also find information on the number of active positions at the time of the rejection, a unique ID for tracking the rejection, and a note explaining why the signal was blocked. Finally, it indicates whether the event occurred during a backtest or live trading session.

## Interface RiskContract

The RiskContract represents a rejected trading signal due to risk validation. It’s like a notification that a planned trade was blocked because it exceeded pre-defined risk limits.

This event only happens when a trade is actually rejected, avoiding unnecessary notifications for signals that pass the risk checks.

The information provided in the RiskContract helps you understand *why* a signal was rejected. You'll find details like the trading pair (symbol), the specifics of the signal (price, position size), which trading strategy requested it, and the time the rejection occurred.

Key data includes the current market price at the time of rejection, the total number of active positions held, and a unique ID for tracking the event.  A human-readable explanation (rejectionNote) will also be provided, explaining the reason for the rejection.  Finally, it indicates whether the rejection happened during a backtest or live trading.

This data is valuable for creating risk reports and letting users know when their trading strategies are being held back by risk controls.

## Interface ProgressWalkerContract

The `ProgressWalkerContract` helps you keep tabs on how a background process is running. It's designed to give you updates while a `Walker` is working, so you can see what's happening. 

You'll receive information like the name of the walker, the exchange being used, and the trading symbol involved.

It also tells you how many strategies are being evaluated in total, how many have already been processed, and the overall percentage of completion. Think of it as a progress bar for your backtesting operations.

## Interface ProgressBacktestContract

This interface helps you keep an eye on how your backtests are progressing. It provides updates during the backtesting process, letting you know which exchange and strategy are being used, along with the symbol being traded. You'll see information about the total number of historical data points (frames) the backtest needs to analyze and how many have already been processed. Finally, it tells you the percentage of the backtest that's complete, giving you a clear picture of how much longer it will take.

## Interface PerformanceStatisticsModel

This model holds the overall performance data for a specific trading strategy. It breaks down the results, telling you the strategy’s name, the total number of performance events tracked, and the total time it took to run.

The `metricStats` property is key – it organizes performance details by the type of metric being measured, giving you a categorized view of how the strategy performed. Finally, you have access to all the individual performance events (`events`) in their raw form, allowing for a very granular look at the strategy’s behavior.

## Interface PerformanceContract

The `PerformanceContract` helps you understand how quickly different parts of your trading system are working. It records information about operations, like how long they take to complete, when they happen, and what they’re related to.

You'll see these records during backtesting and live trading, allowing you to spot slow areas or bottlenecks. Each record includes a timestamp, the time of the previous record, the type of operation, its duration, and details like the strategy, exchange, frame, and trading symbol it’s connected to. A flag will also indicate whether the data comes from a backtest or live environment.

## Interface PartialStatisticsModel

This model holds key statistics about your backtest results, specifically focusing on events where partial profits or losses occurred. It gives you a breakdown of how many profit events you saw, how many loss events occurred, and the total number of events recorded. The `eventList` provides a detailed record of each individual profit or loss event, while `totalEvents` represents the overall count. Essentially, it’s a quick way to get a grasp on the distribution of profit and loss in your backtest.

## Interface PartialProfitContract

This describes a way to track progress when a trading strategy achieves partial profit milestones. Imagine a strategy aiming for a 100% return, but taking profits along the way at 10%, 20%, and so on. This structure represents each of those milestones, telling you exactly *when* and *how* a strategy is making progress.

Each event includes details like the trading pair (e.g., BTCUSDT), the name of the strategy, the exchange being used, and the frame (which is usually empty for live trading). You’ll also see the original data that led to the signal, the current price at the time of the milestone, and the specific profit level (10%, 20%, etc.).

It tells you whether the event is from a historical backtest or live trading, and provides a timestamp, representing either the real-time moment of the detection or the timestamp of the candle that triggered the level during a backtest. These events are primarily used to monitor performance and generate reports about how your strategies are doing.

## Interface PartialProfitCommitNotification

This notification tells you when a partial profit has been taken on a trade, whether it's a backtest or a live trade. It provides a ton of information about the trade, including a unique ID, when it happened, and which strategy triggered it.

You’ll find details like the trading pair (e.g., BTCUSDT), the entry and take profit/stop loss prices, and how much of the position was closed. It also gives you a complete financial picture of the trade, including profit/loss, peak profit, maximum drawdown, and the effective prices used for those calculations. 

The notification includes details about DCA averaging, like the total number of entries and how that affected pricing. It even tracks the original prices and includes optional notes that explain the reason behind the signal. Finally, it logs timestamps for when the signal was scheduled, became pending, and when the notification itself was created.

## Interface PartialProfitCommit

This data represents a partial profit taking action within a trading strategy. It details how much of a position is being closed – specified by the `percentToClose` – and the current market price at the time of the action. You’ll also find key performance metrics associated with the position, including the total profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the largest drawdown experienced (`maxDrawdown`). 

The information also describes the trade's characteristics, like whether it was a long or short position, the initial entry price (`priceOpen`), and the final take profit and stop loss prices, both as they were originally set and after any trailing adjustments.  A timestamp shows when the signal to take partial profit was generated (`scheduledAt`), and another indicates when the position initially started (`pendingAt`).

## Interface PartialProfitAvailableNotification

This notification tells you when your trading strategy has reached a profit milestone, like 10%, 20%, or 30% of its potential. It’s essentially a checkpoint showing progress towards your take-profit target. 

The notification includes detailed information about the trade: the symbol being traded, the strategy used, which exchange is involved, and a unique ID for both the signal and the notification itself. 

You'll also find key data points like the current price, your original entry price, and the effective stop-loss and take-profit prices (which might have been adjusted if you’re using trailing stops). 

Beyond just the price data, the notification provides a full snapshot of the trade's performance so far, including its total profit and loss (both in USD and as a percentage), the peak profit achieved, and the maximum drawdown experienced. It also tracks details related to DCA averaging (if used) and partial profit-taking. 

Finally, it indicates whether this notification originates from a backtest simulation or a live trading environment. A human-readable note field allows for optional extra context.

## Interface PartialLossContract

The PartialLossContract represents a notification that a trading strategy has hit a predefined loss level, such as -10%, -20%, or -30%. Think of it as a way to keep track of how much a strategy is losing.

This event is triggered when a signal reaches one of these loss levels, and it happens only once for each level per signal.  If the price drops quickly, you might receive multiple loss level notifications in a single tick.

The contract provides key information, including the trading symbol, strategy name, and the exchange and frame where the trade is happening.  You’ll also get the full signal data, the current price at the time of the loss, the specific loss level reached (e.g., 20% loss), and whether this event occurred during a backtest or live trading.

Essentially, it's a detailed alert about strategy drawdown. Services like the PartialMarkdownService use this information to generate reports, and developers can use it to build custom monitoring or response systems.


## Interface PartialLossCommitNotification

This notification tells you when a partial closing of a trade has happened. It's like a detailed report card for that specific action, letting you know exactly what happened and why.

You’ll find a unique ID for the notification, along with the exact time it occurred and whether it happened during a test or live trading. It also includes details about the trade itself: the symbol (like BTCUSDT), the strategy used, and the exchange involved.

The notification breaks down the trade’s performance: you’ll see the percentage of the position closed, current market price, original entry price, and the take profit and stop loss prices, both original and adjusted. 

It also provides a comprehensive view of the position’s profitability, including total profit and loss, peak profit, maximum drawdown, and all associated prices and percentages. There’s a lot of information about the cost, entries, and specific prices related to profit and loss calculations.

Finally, you'll get notes if there's an optional description, a scheduled timestamp, pending time, and the notification creation timestamp – offering a complete timeline of events.

## Interface PartialLossCommit

This interface represents a partial loss event within a trading strategy's backtest. It signifies that a portion of a position has been closed, typically as a risk management technique.

The `action` property clearly identifies this as a 'partial-loss' event. 

The `percentToClose` specifies what percentage of the initial position size was closed.  You'll also find details about the position, including the `position` direction (long or short), the `priceOpen` at which it was initiated, and the `priceTakeProfit` and `priceStopLoss` levels, both their original values and any adjusted values due to trailing stops.

Crucially, the event includes performance metrics for the position up to this point: `pnl` (total profit and loss), `peakProfit` (highest profit achieved), and `maxDrawdown` (largest loss from a peak). Finally, `scheduledAt` and `pendingAt` provide timestamps indicating when the signal was created and when the position was initially activated.

## Interface PartialLossAvailableNotification

This notification signals that a trading position has reached a predefined loss milestone, such as a 10% or 20% drawdown. It provides detailed information about the trade, including its unique identifier, the time it occurred, and whether it’s part of a backtest or live trading. You’ll find key details like the trading pair, the strategy and exchange involved, and the trade’s direction (long or short).

The notification also includes comprehensive performance metrics:

*   Entry and stop-loss/take-profit prices, both original and adjusted for trailing.
*   Detailed information on DCA averaging, including the number of entries and partial closes.
*   Profit and loss (pnl) calculations, including percentage, cost in USD, and entry/exit prices accounting for fees and slippage.
*   Peak profit and maximum drawdown metrics, with associated prices, costs, percentages, and entry counts.
*   An optional note can be included to explain the reason for the signal.

Finally, timestamps are provided to track the signal's creation and lifecycle events like pending and creation.

## Interface PartialEvent

The `PartialEvent` object holds all the important details about profit and loss milestones during a trade. It essentially captures a snapshot of the trade's progress at key points, giving you a complete picture for analysis and reporting.

You'll find information like the exact time of the event, whether it's a profit or loss, and the trading symbol involved. It also includes specifics about the strategy used, the signal that triggered the trade, and the position's details, such as entry and exit prices. 

The object also tracks important settings like the original take profit and stop loss levels, as well as information about any DCA (Dollar Cost Averaging) strategies applied.  Details on partial closes, unrealized profit and loss, and even a human-readable note explaining the trade's reasoning are also included. Finally, flags indicate whether the trade was part of a backtest or live trading.

## Interface OrderSyncOpenNotification

This notification provides detailed information when a scheduled order (like a limit order) is triggered and a position is opened. It acts as a signal confirming that the plan is in action.

The notification includes a unique ID, the time it was created, and whether it's from a backtest or live trading environment. You'll find essential details like the trading pair (e.g., BTCUSDT), the strategy that generated the signal, and the exchange used.

It also gives you a comprehensive performance snapshot of the position, including profit/loss (both in USD and percentage), peak profit achieved, and the maximum drawdown experienced. You’ll find entry and exit prices, and information about any take profit or stop-loss orders initially set.

Finally, the notification provides further details regarding the position like cost, direction (long or short), and relevant timestamps like when the signal was scheduled or when the position was activated. This provides a full picture of the trade’s initial conditions.

## Interface OrderSyncCloseNotification

This notification type signals that a pending trading signal has been closed, whether that's because a take profit or stop loss was triggered, a time limit expired, or a manual closure. It provides a wealth of information about the closed position, including its unique identifier, when it was created and closed, and whether it was part of a backtest or live trading scenario. You'll find details about the trade itself, like the entry and exit prices, as well as key performance indicators like profit and loss (both absolute and percentage), peak profit, and maximum drawdown.

The notification also breaks down the specifics of how the position was managed, outlining the original take profit and stop loss levels, the total number of entries (for positions averaged with DCA), and any partial closes that occurred.  Finally, it describes *why* the signal was closed – whether it was due to hitting a target, timing out, or a manual intervention – alongside an optional descriptive note.  Essentially, it's a complete record of a closed trading signal's lifecycle and performance.

## Interface OrderSyncBase

This defines the common information you’ll find in events related to order synchronization within the backtest-kit trading framework. It essentially describes what's happening with an order – whether it’s an active order (like opening, closing, or modifications) or a scheduled order being placed.

Each event includes details such as the trading symbol, the name of the strategy that generated the signal, and the exchange used.  You’ll also see if the event originates from a backtest environment versus a live trading environment.  A unique ID and timestamp provide precise identification and tracking of the signal’s lifecycle. Finally, a complete snapshot of the signal data is included for detailed analysis.

## Interface OrderOpenContract

This event lets you know when a limit order has been filled and a position is officially open. It’s particularly useful for synchronizing with external systems that manage orders, like order management systems or auditing tools. 

Think of it as a confirmation that your limit order (the price you wanted to buy or sell at) was accepted by the exchange.

During backtesting, this event is triggered based on price levels – when the candle's low is below your desired entry price for a long position, or the candle's high is above for a short position. In live trading, the event fires when the exchange confirms the order has been filled.

The event provides a wealth of information about the trade, including the entry price (`priceOpen`), the current market price (`currentPrice`), and how the position has performed so far – its profit/loss (`pnl`), peak profit, and maximum drawdown. You’ll also find details about the original take profit and stop loss prices, as well as information about any DCA (Dollar-Cost Averaging) or partial closes that may have occurred. The `scheduledAt` and `pendingAt` timestamps are useful for tracking the timing of the order and its activation.


## Interface OrderCloseContract

When a trading signal is closed – whether it's because of a profit target, a stop-loss trigger, time expiry, or manual closure – this event is fired. It's designed to keep external systems in sync with what's happening in the backtest kit, like updating order books or recording profit and loss.

You'll receive detailed information about the closure, including the current market price, the direction of the trade (long or short), and the original and final prices for entry, take profit, and stop-loss. The event also provides the overall profit and loss (pnl) for the position, along with its peak profit and maximum drawdown.

The event also provides specifics on the signal's lifecycle, such as when it was created and activated, as well as the reason for closure. Finally, the event includes details about any averaging or partial closures that occurred during the trade's lifespan.

## Interface OrderCheckContract

This event, called `OrderCheckContract`, is a crucial signal emitted during trading to ensure your orders remain valid with the exchange. It's like a regular check-in to confirm that an order you placed is still active. This happens both for open positions ("active" type) and for orders waiting to be triggered ("schedule" type).

If the framework receives a positive response when it checks if an order is still open, it continues monitoring. However, if it doesn't receive a response or a negative response, the framework takes action—either closing the position or cancelling the pending order. 

Keep in mind that this event *won't* happen during backtesting because there's no live exchange data involved. This is primarily used by broker adapters and registered actions.

The signal provides a wealth of information, including the trading pair symbol, the strategy that generated the signal, the current market price, unrealized profit and loss, and details about the original and adjusted entry, take profit, and stop-loss prices. It also includes information on DCA entries and partial closes, giving you a comprehensive picture of the signal's progress and state.

## Interface MetricStats

The `MetricStats` object provides a collection of aggregated data about a specific type of performance metric. It essentially summarizes how a metric performed across a series of measurements.

You’ll find key details like the total number of times the metric was recorded, the total time it took over all those instances, and its average duration. 

It also includes information about the shortest and longest durations, as well as the standard deviation, median, and percentiles (95th and 99th) to give a fuller picture of the distribution.

Finally, the stats cover wait times between events – finding the average, minimum, and maximum waiting periods.

## Interface MessageModel

This describes the structure of a single message within a chat history, like you’d see when interacting with a large language model. Each message has a `role` indicating who sent it – whether it's a system instruction, a user's question, the model's response, or the result of a tool usage.

The core of the message is its `content`, which is the text itself. Some models might also include `reasoning_content` to show the step-by-step thought process behind their answer.

If the assistant uses a tool, `tool_calls` will provide details about that process, and `tool_call_id` specifies which tool call this message refers to. Finally, messages can also contain images, which can be provided as base64 strings, raw bytes, or Blob objects.

## Interface MaxDrawdownStatisticsModel

This model holds the results of a maximum drawdown analysis. 

It contains a detailed list of all drawdown events, ordered from most recent to oldest, allowing you to examine the sequence of losses. 

Alongside the event list, it also provides a simple count of the total number of drawdown events that occurred during the backtest.

## Interface MaxDrawdownEvent

This data represents a single instance of a maximum drawdown event experienced during a trade. It provides details about when the drawdown occurred (timestamp) and which asset (symbol) was involved. You'll also find information related to the trading strategy used (strategyName, signalId) and whether the trade was a long or short position.

The record includes key financial data such as the profit and loss (pnl), the highest profit achieved (peakProfit), and the amount of the drawdown itself (maxDrawdown). To understand the trade’s context, it also stores the current price at the time of the drawdown, along with the entry price (priceOpen), take profit price (priceTakeProfit), and stop loss price (priceStopLoss). Finally, it specifies if the event happened during a backtesting simulation (backtest).

## Interface MaxDrawdownContract

The MaxDrawdownContract provides information when a new maximum drawdown is encountered in a trading position. It's like a notification detailing the worst drop in a position's value so far.

You'll receive this information with details such as the trading symbol, the current price, and the exact time of the update. The contract also includes context about the trading strategy, the exchange being used, and the timeframe involved. 

Importantly, it specifies whether the drawdown event occurred during a backtest or in live trading. This helps differentiate between simulated and real-world scenarios.

This information allows you to build systems that react to drawdown levels, perhaps by adjusting stop-loss orders or adjusting risk exposure based on performance. The framework sends these updates whenever a new drawdown record is made.


## Interface LiveStatisticsModel

The `LiveStatisticsModel` provides a detailed snapshot of your trading performance based on live data. It gathers information from every trade event, including when signals are opened, active, and closed, and organizes it into key metrics. Many of these values will be null if the calculations are unreliable due to unusual market conditions.

Here's a breakdown of what it tracks:

*   **Event Data:** You can access a complete list of events with full details, plus the total number of events, closed signals, and wins/losses.
*   **Performance Metrics:**  It calculates critical performance indicators like win rate, average profit per trade, total profit, and standard deviation (measuring volatility).  You’ll find ratios like Sharpe, Sortino, and Calmar to assess risk-adjusted returns.
*   **Risk & Recovery:**  Metrics like drawdown, recovery factor, and expectancy help assess risk management and potential future profits.
*   **Trade Duration:** The model tracks the average duration of trades, broken down into win and loss durations.
*   **Price Action:** It analyzes price movements, determining buyer and seller pressure, and overall trend strength and confidence using regression analysis.
*   **Distribution Insights:** It provides insights into the distribution of profits and losses through metrics like median PNL, consecutive win/loss sums, and step size analysis.



Essentially, this model gives you a comprehensive toolkit to understand your trading strategy's effectiveness, identify areas for improvement, and gauge overall risk.

## Interface InfoErrorNotification

This notification system helps you keep track of issues that pop up during background processes, specifically those that your application can potentially recover from. Each notification has a unique identifier, a clear error message for understanding the problem, and includes detailed information about the error itself, such as a stack trace and any associated data.  The `backtest` flag is always false because these notifications relate to live environment activities, not simulated backtests. Think of it as a gentle alert about a hiccup that needs attention.

## Interface IdlePingContract

This interface describes a special event called an "idle ping." It happens when a trading strategy isn't actively doing anything – there are no signals being watched or orders being placed. 

Think of it as a heartbeat that lets you know the strategy is in a resting state. The information shared includes details about the trading pair (like "BTCUSDT"), the strategy's name, where it's running (the exchange), and whether it’s a backtest or live trade. 

You can use this event to monitor how often your strategies are idle and how long they stay that way, which can be useful for understanding their lifecycle. The event also provides the current price and a timestamp, which tells you exactly when the idle ping occurred, whether that's in a live trading environment or during a historical backtest.

## Interface IWarmCandlesParams

This object defines the settings needed to download historical candle data and store it for later use, like before running a backtest. You'll specify the trading pair you're interested in, like "BTCUSDT". You also need to tell it which exchange you're pulling data from and the timeframe of the candles, such as "1m" for one-minute candles or "4h" for four-hour candles. Finally, you'll give it a start and end date to define the specific historical period to download.

## Interface IWalkerStrategyResult

This object holds the results for a single trading strategy that you've tested. 

It includes the strategy's name so you know which strategy the results belong to.

You'll also find a collection of statistics detailing how the strategy performed during the backtest, like profit, drawdown, and win rate.

A single number, called the "metric," represents the strategy’s overall performance, which is used to compare it against other strategies. If the metric isn't valid for some reason, it will be null.

Finally, the "rank" tells you where the strategy stands in comparison to all the others – the highest-performing strategy gets rank 1.


## Interface IWalkerSchema

The IWalkerSchema defines how to set up A/B tests for different trading strategies. Think of it as a blueprint for comparing strategies against each other.

You'll give it a unique name (walkerName) to identify the test, and you can add a note for your own records. 

It specifies which exchange and timeframe to use for backtesting all the strategies involved. 

The heart of the schema is the strategies property—this lists the names of the strategies you want to compare, making sure they’ve been registered beforehand. 

You can select a specific metric, like Sharpe Ratio, to optimize for during the backtest, or you can leave it at the default. Finally, you can optionally include callbacks to trigger custom actions at different stages of the testing process.

## Interface IWalkerResults

The `IWalkerResults` interface holds all the information gathered when a trading strategy is tested and compared against others. It provides a structured way to understand the outcome of a full evaluation process. 

You'll find details like the specific trading symbol being analyzed, the exchange used for the test, the name of the testing process itself (the "walker"), and the timeframe used for the backtest. This interface essentially acts as a report card for a strategy's performance within a particular scenario.


## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you hook into the backtest process to get notified about key events. You can use it to monitor what's happening as the framework tests different strategies.

It provides callbacks for when a strategy's testing begins (`onStrategyStart`), finishes (`onStrategyComplete`), encounters an error (`onStrategyError`), and when all testing is done (`onComplete`). The `onStrategyComplete` callback gives you access to performance statistics and a metric after each strategy's run. The `onComplete` callback delivers the final results after all the strategies are evaluated.


## Interface ITrailingTakeCommitRow

This interface describes a specific action that's been queued for your trading strategy – a trailing take commit. Think of it as a command to adjust your take-profit level based on price movements.

It includes three key pieces of information: 

*   The `action` itself, clearly indicating it's a "trailing-take" action.
*   The `percentShift`, which defines the percentage amount to adjust your take profit level.
*   And finally, the `currentPrice`, which is the price at which this trailing adjustment was originally triggered.

## Interface ITrailingStopCommitRow

This describes a record representing a trailing stop order that needs to be executed. It's essentially a message queued up for the trading system to process.

The `action` property identifies this as a "trailing-stop" action.  The `percentShift` tells you how much the price needs to move before the stop-loss is adjusted. Finally, `currentPrice` indicates the price level at which the trailing stop was initially established.

## Interface IStrategyTickResultWaiting

This interface describes a special type of result you get when a trading strategy is patiently waiting for a signal to activate. It happens after a signal is initially created – you'll receive these repeated results as the strategy monitors the price to see if it reaches the entry point defined in that signal.

The information included tells you which signal is waiting, the current price being watched, and details about the strategy and exchange involved (like the strategy's name, the exchange, the timeframe, and the trading pair). You'll also find indicators like the progress towards take profit and stop loss, although these are always zero during the waiting period. It also includes unrealized profit and loss (which is theoretical until the position is activated), whether the process is running a backtest, and when the result was generated.


## Interface IStrategyTickResultScheduled

This interface describes a specific event within a trading strategy – when a signal is generated and scheduled, awaiting a price trigger. Think of it as the system noting, "Okay, we have a trading idea, but let's wait for the price to reach a certain point first."

The data included tells you which strategy and exchange generated the signal, the symbol being traded, the price at the time of scheduling, and whether it's happening in a backtest or live environment. You'll find details about the timeframe used and when the signal was created, all helping with tracking and debugging. Essentially, it’s a record of a pending trading opportunity.

## Interface IStrategyTickResultOpened

This data structure represents what happens when a new trading signal is created within the backtest-kit framework. 

It's sent out when a signal is successfully generated, validated, and saved.

Think of it as a notification that a new trading opportunity has appeared.

The information included details like the signal itself (including a unique ID), which strategy and exchange created it, the timeframe it applies to, the symbol being traded, the price at the moment the signal appeared, and whether it's part of a backtest or live trading scenario. There's also a timestamp associated with its creation.

## Interface IStrategyTickResultIdle

This interface describes what happens when your trading strategy is in an "idle" state, meaning no trading signal is active. It provides key details about the situation, like the strategy's name, the exchange being used, and the timeframe being analyzed. You’ll also find the symbol of the trading pair, the current price, and whether the data comes from a backtest or live trading. Finally, it includes a timestamp indicating when this idle state was recorded.

## Interface IStrategyTickResultClosed

This interface represents the data you receive when a trading signal is closed, whether automatically or manually. It provides a complete picture of what happened at the time of closure, including the reason for closing (like hitting a stop-loss, reaching a take-profit target, or simply time expiration).

You’ll find details like the final price used for the trade, the profit or loss (including fees and potential slippage), and timestamps indicating when the signal was closed and the result was created. The information also includes tracking data such as the strategy name, exchange, time frame, and trading symbol used.

If the close was initiated by the user, a unique close ID will be present. A flag indicates whether the closure happened during a backtest or in a live trading environment. Essentially, it's a comprehensive record of a signal's closure and its financial outcome.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a planned trading signal doesn't actually lead to a trade being opened – maybe the signal never triggers, or a stop loss is hit before an entry occurs. It's a record of that cancellation.

It includes details like the signal that was cancelled, the final price used when it was cancelled, and the exact time of the cancellation. You'll find information about the strategy and exchange involved, along with whether the event happened during a backtest or a live trade. A reason for cancellation is provided, and if you intentionally cancelled the signal yourself using a cancel ID, that's also included. Finally, it notes when the cancellation record itself was created.

## Interface IStrategyTickResultActive

This type, `IStrategyTickResultActive`, represents a specific state within a trading strategy – when a signal is active and the system is monitoring for a take profit (TP), stop loss (SL), or time expiration. It signifies the strategy is actively managing a position.

It contains details about the current signal being monitored, the price being tracked, and identifies the associated strategy, exchange, and timeframe. You'll also find information about how far the position is from the TP and SL targets.

The data includes the unrealized profit and loss (PNL) of the active position, taking into account fees and slippage. A flag indicates whether the data originates from a backtest or a live trading environment. Finally, timestamps track when the result was created and when the last candle was processed, which is useful for backtesting processes.

## Interface IStrategySchema

This schema defines how a trading strategy is structured and registered within the backtest-kit framework. Each strategy needs a unique name to be recognized.

You can add a note for yourself or other developers to explain the strategy's logic.

The `interval` property lets you control how frequently the strategy generates signals, preventing it from sending too many requests.

The core of the strategy is the `getSignal` function, which takes the symbol, a timestamp, and the current price and calculates the signal. It can be configured to wait for a specific price level (entry point) or execute immediately.

You can also define lifecycle callbacks like `onOpen` and `onClose` to trigger specific actions at key moments.

Additionally, you can associate a risk profile and list of risk identifiers for managing potential losses, and a list of actions to tag the signals generated.

Finally, `info` is for adding custom data related to the strategy, useful for monitoring or integration with external tools.

## Interface IStrategyResult

The `IStrategyResult` represents a single run of a trading strategy during a backtest. It bundles together important information for comparing different strategies.

You’ll find the strategy's name here, so you know which strategy generated the results.

It also includes a comprehensive set of backtest statistics to give you a detailed look at the strategy's performance, covering things like returns, drawdown, and more.

A key metric value helps rank the strategies based on your chosen optimization goal. This value might be null if the backtest revealed issues.

Finally, the timestamps of the first and last signals generated by the strategy are recorded, useful for understanding the strategy’s activity throughout the backtest period. If no signals were generated, these will be null.

## Interface IStrategyPnL

This interface defines the results you get when calculating profit and loss for a trading strategy. It gives you a clear picture of how well your strategy performed, taking into account realistic factors like transaction fees and slippage – the difference between the expected price and the actual price you get when executing a trade. 

The `pnlPercentage` shows the profit or loss as a percentage of your initial investment. 

You’ll also find the entry price (`priceOpen`) and exit price (`priceClose`), both adjusted to account for those fees and slippage, so you know exactly what prices were used in the calculation.

The `pnlCost` represents the actual profit or loss in dollars, while `pnlEntries` shows the total amount of money invested to initiate the trades.

## Interface IStrategyCallbacks

This interface provides a way to receive notifications about key events during a trading strategy's lifecycle. Think of these as event listeners that trigger when your strategy enters different states or performs specific actions. 

You can hook into events like when a new signal is opened, when it’s actively being monitored, or when it's in an idle state with no open signals. There are also callbacks for when a signal is closed, scheduled, or cancelled, allowing you to respond to these transitions.

Furthermore, you can receive updates about partial profits, losses, and when a signal reaches breakeven, giving you granular insight into the signal's performance.  There are specialized ping callbacks (`onSchedulePing`, `onActivePing`) that provide minute-by-minute updates for scheduled and active signals, ideal for custom monitoring or dynamic adjustments. Lastly, the `onWrite` callback is specifically for persisting data during backtesting.

## Interface IStrategy

The `IStrategy` interface defines the core actions a trading strategy can perform. It focuses on managing positions, reacting to ticks, and handling signals, all with built-in considerations for things like slippage and fees.

The `tick` method is the heart of the strategy, handling each new price update by checking for signals and potential profit-taking or stop-loss triggers.

You can use `getPendingSignal` and `getScheduledSignal` to check if a position is already active or waiting to be triggered.

Several methods help monitor the progress of a position, such as `getBreakeven` to determine if a position has reached a point where slippage and fees are covered, and `getTotalPercentClosed` and `getTotalCostClosed` to track partial exits.

The framework allows for backtesting with `backtest`, giving you a way to evaluate strategies against historical data.  There are also methods for controlling a strategy's activity: `stopStrategy` to pause it, `cancelScheduled` to dismiss a scheduled entry, `activateScheduled` to manually trigger one, and `closePending` to prematurely close an active position.

More specialized methods include `createSignal` to manually inject a signal, and a set of functions to control risk management such as `trailingStop` and `breakeven`. These allow users to fine-tune their strategies and react to market conditions.  Finally, various methods provide detailed insights into a position's performance, tracking metrics like highest profit/loss points and drawdown.

## Interface IStorageUtils

This interface defines the core functionality that any storage adapter used with the backtest-kit trading framework needs to provide. It’s essentially a contract ensuring all storage solutions can consistently manage and interact with trading signals.

The framework will call methods on your storage adapter to react to various signal lifecycle events like when a signal is opened, closed, scheduled, or cancelled. These calls let the adapter update its internal state accordingly.

You'll also need to provide ways to retrieve signals. This includes finding a specific signal by its unique ID, or listing all signals currently held in storage.

Finally, there are methods to handle “ping” events – special notifications about signals that are active or scheduled, allowing the adapter to keep track of their status and update timestamps. These pings ensure signals remain accurately represented in the storage system.

## Interface IStorageSignalRowScheduled

This interface describes a signal row that's been scheduled for later execution. 

It contains two key pieces of information: a `status` indicating it's "scheduled," and the `currentPrice` which represents the price at the time the signal was initially scheduled. Think of `currentPrice` as a snapshot of the market conditions when the signal was created, tied to the `IStrategyTickResultScheduled` data. This helps you understand the context of the signal's scheduling.

## Interface IStorageSignalRowOpened

This interface describes a signal row when a trade has been opened. It essentially tracks the state of an active trade.

The `status` property will always be "opened," indicating that a position is currently held. 

The `currentPrice` represents the price at the moment the trade was initiated, a valuable reference point for monitoring trade performance. It's linked to the `IStrategyTickResultOpened.currentPrice` data.

## Interface IStorageSignalRowClosed

This interface represents a signal that has been closed, meaning a trade was executed. It provides key information about the closed signal, specifically focusing on financial results and the circumstances of its closure.

You'll find data here about the profit and loss (PNL) realized when the signal closed, along with the final price at which the trade happened.  

The `closeReason` tells you *why* the signal was closed - perhaps it hit a target price, or a stop-loss was triggered.  Finally, the `closeTimestamp` records precisely when the closure occurred. This data is essential for analyzing performance and understanding trading behavior.

## Interface IStorageSignalRowCancelled

This interface represents a signal row that has been cancelled. It's a simple way to mark a signal as no longer active or valid.  The only property it contains, `status`, is a fixed string value of "cancelled," clearly indicating the signal's current state. Think of it as a flag to say "this signal is no longer relevant."

## Interface IStorageSignalRowBase

This interface defines the fundamental structure for storing signal data, regardless of its specific state. It ensures that every signal record includes information about when it was created and last modified, using timestamps.  The `priority` field is crucial for managing the order in which signals are processed, using the current date and time to maintain order. This provides a consistent foundation for all signal storage implementations.

## Interface IStateParams

`IStateParams` helps you define how your trading signals manage their data. Think of it as setting up containers for related information.

You specify a `bucketName`, which is like giving a folder a name to organize your signals – perhaps "trade" for trade-related data or "metrics" for performance tracking.

Then, you provide an `initialValue`. This is what the signal will start with if there's no existing data saved. It's the default state until something else comes along.

## Interface IStateInstance

The `IStateInstance` interface acts as a blueprint for how state is managed within the backtest-kit framework. It's designed to hold information that changes over time, like performance metrics for a trade. Think of it as a way to track things like the highest unrealized profit, how long a trade has been open, and when to cut losses if things aren’t going as planned.

This interface provides methods for getting started, reading the current state, updating the state, and cleaning up when finished. The `waitForInit` method sets things in motion. `getState` lets you check the state at a specific point in time, making sure you’re not looking into the future. `setState` is used to record new state information, and it has a clever feature – it allows older states to be overwritten, which is important if a backtest needs to be restarted. Finally, `dispose` makes sure that any resources used by the state are released properly.

## Interface ISizingSchemaKelly

This schema defines a sizing strategy based on the Kelly Criterion, a mathematical formula for determining optimal bet sizes. It's designed for situations where you want to maximize long-term growth of your capital.

The `method` property confirms that this is a Kelly Criterion sizing approach.  The `kellyMultiplier` controls how aggressively the Kelly Criterion is applied; a smaller multiplier (like the default 0.25) results in smaller, more conservative bet sizes, while a larger multiplier increases the potential for gains (and also the risk of losses). Essentially, it's a way to tune the Kelly Criterion to your risk tolerance.

## Interface ISizingSchemaFixedPercentage

This schema defines a simple way to size your trades – you'll always risk a fixed percentage of your capital on each trade. 

The `method` property is set to "fixed-percentage" to identify this sizing approach. 

The `riskPercentage` property tells the system what percentage of your available funds you're comfortable risking per trade; for example, a value of 1% means you'll risk 1% of your capital on each trade. This value should be between 0 and 100.

## Interface ISizingSchemaBase

This interface, `ISizingSchemaBase`, forms the foundation for how your trading strategies determine position sizes. It provides a set of core properties that define sizing configurations.

Each sizing configuration has a unique `sizingName` for identification and an optional `note` field for developers to add explanatory information. You can also set limits on position sizes using `maxPositionPercentage` (as a percentage of your account), and define absolute minimum and maximum position sizes using `minPositionSize` and `maxPositionSize`. Finally, the `callbacks` property allows you to hook into specific points in the sizing calculation process for more advanced customization.

## Interface ISizingSchemaATR

This schema defines how to size trades based on the Average True Range (ATR), a measure of volatility. 

It uses an "atr-based" method.

You'll specify a `riskPercentage`, which represents the portion of your capital you’re willing to risk on each trade, expressed as a percentage (between 0 and 100).

The `atrMultiplier` controls how far your stop-loss is placed based on the current ATR value; a higher number means a wider stop.


## Interface ISizingParamsKelly

This interface defines the parameters needed for sizing trades using the Kelly Criterion, a method for determining optimal bet sizes. It includes a `logger` property, which is used to record debugging information during the backtesting process. Think of the logger as a way to keep track of what’s happening behind the scenes, helping you understand and troubleshoot your trading strategy. Essentially, you’ll use this to provide a way for the system to communicate important details about the sizing calculations.


## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed when you want your trading strategy to size its positions using a fixed percentage of available capital. It requires a logger, which is useful for tracking what's happening behind the scenes and helping you debug any issues. Think of the logger as a way to get feedback from the backtest-kit as it runs.

## Interface ISizingParamsATR

This interface defines how to control trade sizing when using an ATR (Average True Range) based approach. 

It primarily focuses on providing a way to log any relevant debugging information during the sizing process, through the `logger` property. This logger allows you to observe how the ATR calculations influence the trade size.


## Interface ISizingCallbacks

This interface provides a way to respond to events that happen when determining how much of an asset to trade. Specifically, `onCalculate` lets you react when the framework figures out the size of a trade, allowing you to log details or ensure the size is what you expect. You can use this to keep track of sizing decisions or catch any unexpected calculations.


## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate your trade size using the Kelly Criterion. It essentially tells the backtest framework how to determine the optimal amount to risk based on your strategy's performance.

You'll provide your win rate, expressed as a number between 0 and 1 (e.g., 0.6 for a 60% win rate), and your average win/loss ratio (how much you win on average for each winning trade compared to how much you lose on each losing trade). 

These two values are crucial for the Kelly Criterion to determine a fraction of your capital to allocate to each trade.


## Interface ISizingCalculateParamsFixedPercentage

This interface defines the parameters needed to calculate trade sizing using a fixed percentage approach. It requires you to specify the method as "fixed-percentage" to indicate you're using this sizing strategy. You also need to provide a `priceStopLoss` value, which represents the price at which a stop-loss order would be triggered. Essentially, these parameters tell the system how much of your capital to allocate and where to place a stop-loss based on a pre-determined percentage.

## Interface ISizingCalculateParamsBase

This interface defines the foundational information needed when figuring out how much of an asset to trade. It includes the symbol of the trading pair, like "BTCUSDT," the current balance of your account, and the anticipated price at which you plan to enter a trade. Think of it as a set of building blocks that all sizing calculations will rely on. You’ll provide this information so the system knows what resources are available and what the intended entry point is.

## Interface ISizingCalculateParamsATR

This interface defines the settings you'll use when determining the size of your trades based on the Average True Range (ATR).  You'll see the `method` property set to "atr-based" to indicate you're using this specific sizing approach.  The `atr` property holds the actual ATR value that will be incorporated into the sizing calculation; it represents the average of price fluctuations over a specific period. This value is essential for adjusting your position size according to market volatility.

## Interface ISizing

The `ISizing` interface is all about determining how much of an asset to trade. Think of it as the engine that decides your position size. It's a core component used behind the scenes during strategy execution.

The `calculate` property is the heart of this interface. It's a function you provide that takes some input data (`ISizingCalculateParams`) and then figures out the size of the position you should take, returning that value as a promise. Essentially, it's where you implement your sizing logic, taking into account factors like risk tolerance and account balance.


## Interface ISignalRow

This `ISignalRow` interface represents a complete trading signal within the backtesting framework. Think of it as a standardized record of a signal that's ready to be executed, containing all the necessary information. Each signal gets a unique ID to easily track it throughout the process.

It holds details about the trade, like the cost, entry price, expected duration, which exchange and strategy it belongs to, and the symbol being traded. There's also a timestamp to mark when the signal was initially created and when it went live.

Beyond the basics, the `ISignalRow` keeps track of more complex details. It includes a history of partial closes (profit or loss) to precisely calculate overall P&L, and manages trailing stop-loss and take-profit prices that dynamically adjust based on the trade's performance. DCA entries are also recorded, providing a history of the price at which the asset was purchased. Lastly, it monitors the highest profitable and lowest lossing prices seen during the trade's lifespan. This rich data set allows for detailed performance analysis and optimization of trading strategies.

## Interface ISignalIntervalDto

This data structure lets you request signals at specific intervals, useful when you need to retrieve multiple signals together. Think of it as a way to batch your signal requests to improve efficiency.  Each signal request gets a unique ID to help track it.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, essentially a set of instructions for a trade. It contains all the necessary information to execute a trade, like which asset to trade (`symbol`), whether to buy (`long`) or sell (`short`), and the intended entry price (`priceOpen`).

You’ll also find details about where to set your profit target (`priceTakeProfit`) and how to limit potential losses with a stop-loss (`priceStopLoss`). 

A human-readable note (`note`) lets you record the reasoning behind the signal.

The system automatically assigns a unique identifier (`id`) to each signal.

You can specify how long the signal should remain active (`minuteEstimatedTime`), or leave it open indefinitely. A cost value (`cost`) is also included, representing the financial commitment of the trade.

## Interface ISignalCloseRow

This interface, `ISignalCloseRow`, builds upon the existing `ISignalRow` to handle situations where a trading signal is closed manually by a user. It introduces two new properties: `closeId` and `closeNote`. The `closeId` specifically identifies the user-initiated close event, providing a unique reference.  `closeNote` allows for adding a descriptive note about the reason or details of the user's closing action. These additions are only relevant when a user directly manages the closing of a trading signal.

## Interface ISessionInstance

This interface defines a way to manage temporary data during a backtesting run. Think of it as a place to store information that’s specific to a particular trading strategy, symbol, and timeframe. 

It's designed to hold things like cached results from AI models, intermediate calculations for indicators, or values that need to be tracked across multiple candles. 

The `waitForInit` method sets up the session. `setData` lets you write new data and associate it with a specific point in time. `getData` retrieves that data, ensuring you're not looking into the future. Finally, `dispose` cleans up any resources used by the session when it's no longer needed.

## Interface IScheduledSignalRow

The `IScheduledSignalRow` represents a signal that's designed to be triggered when a specific price level is reached. Think of it as a signal on hold, waiting for a particular price to occur. 

It's closely related to a regular signal, but with an added delay – it won't activate until the market price hits the `priceOpen` level. 

Essentially, this lets you create trading strategies where you want to enter a position *after* a price target is reached, providing a delayed execution.

The `priceOpen` property defines that target price. Once the market reaches this price, the `IScheduledSignalRow` transforms into a standard pending signal and the order is placed.


## Interface IScheduledSignalCancelRow

This interface represents a scheduled signal that might have been cancelled by a user. It builds upon the standard scheduled signal information by adding details specifically related to cancellations. If a user cancels a signal, a unique cancellation ID and any notes they provided will be stored here. Think of it as a way to track and understand why a scheduled signal didn't execute as planned – because someone manually cancelled it. The `cancelId` identifies the cancellation event, and `cancelNote` contains any explanation the user provided.

## Interface IScheduledSignalActivateRow

This interface describes a row of data related to a scheduled trading signal, but with an important addition: it allows for activations that are triggered by a user. Think of it as a regular scheduled signal, but with the ability for a person to manually kick it off.  The `activateId` property holds a unique identifier associated with that manual activation, and the `activateNote` lets you store any notes or context the user provided when they initiated the activation. This is particularly useful when you need to track who started a trade and why.

## Interface IRuntimeRange

This interface, `IRuntimeRange`, simply describes the timeframe your backtest will cover. It has two key pieces of information: a starting date (`from`) and an ending date (`to`). Think of it as setting the boundaries for your historical data – it tells the backtesting engine exactly which dates to pull data for and run your strategy against. Essentially, it defines the period you're simulating.

## Interface IRuntimeInfo

This interface provides essential details about the environment your trading strategy is operating in. It gives you access to the trading symbol, like "BTCUSDT", and the time period being analyzed if you're running a backtest. 

You can also retrieve extra, custom data that your strategy itself might be providing. 

Beyond that, it supplies information about the exchange, strategy, and timeframe being used, as well as the precise timestamp for the current data point and the current market price. Finally, it tells you definitively whether you are in backtest mode or running live.

## Interface IRunContext

The `IRunContext` object acts as a central hub, providing everything a function needs to operate within the backtest-kit framework. It bundles together information about the overall testing setup – like which exchange and strategy are being used – alongside the immediate runtime conditions, such as the symbol being analyzed and the current timestamp. Think of it as a package containing all the details needed to execute a piece of code within the backtesting environment, allowing for a clear separation of concerns between the broader system and the current operation. The framework then unpacks this comprehensive context and distributes its components for efficient use.

## Interface IRiskValidationPayload

This data structure holds the information needed to assess risk during trading. It combines the details of the signal being evaluated with a snapshot of your portfolio's current state. You'll find the signal itself, represented by `currentSignal`, which always includes the price at which the trade was initiated. 

The payload also includes information about your open positions, specifically the total number of active positions (`activePositionCount`) and a list of those positions (`activePositions`). This allows validation functions to make informed decisions based on the overall portfolio exposure.


## Interface IRiskValidationFn

This defines how you'll check if a trade is safe to make. It's a function that examines a potential trade and decides whether to allow it or not. If the trade looks good, the function doesn’t do anything – it simply lets the trade proceed. However, if there’s a risk or problem with the trade, the function either returns a specific rejection message, or throws an error, so the system knows to stop the trade and understand why.

## Interface IRiskValidation

This interface helps you define rules to check if your trading risks are acceptable. It's essentially a way to ensure your trading strategy doesn't take on more risk than you're comfortable with.

You provide a `validate` function that performs the actual risk assessment, taking in parameters to evaluate.  A `note` field lets you add a description, like explaining *why* a particular validation is important or what it's checking for – this makes your code easier to understand and maintain.

## Interface IRiskSignalRow

This interface, IRiskSignalRow, helps manage risk during trading. It builds upon the existing ISignalDto, adding crucial details about the trade's beginning. You'll find the entry price (`priceOpen`), the initial stop-loss price (`originalPriceStopLoss`), and the initial take-profit price (`originalPriceTakeProfit`) all included here. These values are essential for verifying and controlling risk associated with a trade, especially when assessing potential losses or gains.

## Interface IRiskSchema

This defines a way to create custom rules for managing risk within your trading portfolio. Think of it as setting up guardrails to ensure your portfolio behaves as expected.

Each risk profile, identified by a unique `riskName`, lets you add notes for yourself and optionally specify callback functions to trigger actions at certain points in the process.

The core of a risk profile is its `validations`, where you’ll define the actual checks and balances. You can provide these validations as functions or pre-defined objects, which allows for a flexible way to implement your specific risk management strategies.

## Interface IRiskRejectionResult

When your risk validation fails, this object provides details about why. It includes a unique ID to track the specific rejection and a clear explanation, in plain language, of what went wrong. Think of it as a friendly message telling you exactly what needs fixing in your setup.

## Interface IRiskParams

This interface defines the settings passed to the ClientRisk component, which helps manage trading risks. It includes essential information like the name of the exchange you're trading on and a logger to help with debugging. You'll also need to provide a time service to ensure accurate, bias-free calculations, especially during backtesting. 

The `backtest` flag distinguishes between running tests on historical data and live trading. Most importantly, the `onRejected` callback allows you to react when a trading signal is blocked due to risk constraints – it's a way to customize how risk rejections are handled and reported.

## Interface IRiskCheckOptions

The `IRiskCheckOptions` interface helps manage how risk checks are performed, especially when multiple processes are involved. It has a property called `reserve`.

If you set `reserve` to `true`, the system ensures that when a risk check happens, it temporarily marks a position as being used. This is crucial to prevent issues that can occur when multiple processes try to use the same position at the same time, ensuring a more reliable and predictable trading environment. This way, other checks will see the updated position size before any changes are officially applied.

## Interface IRiskCheckArgs

The `IRiskCheckArgs` interface provides the data needed to assess whether a new trade should be allowed. Think of it as a set of checks run *before* a trading signal is actually generated. It bundles together essential information about the potential trade, including the trading pair's symbol, the signal itself, the strategy initiating the trade, and details about the exchange and risk management setup. You'll find information like the current price, a timestamp, and identifiers like the strategy and risk names all included to allow for robust risk evaluation. Essentially, it's a snapshot of the context surrounding a trade request.

## Interface IRiskCallbacks

This interface defines optional functions that your backtesting strategy can use to respond to risk management events. Think of them as notifications your strategy receives when the system assesses a trade's risk. The `onRejected` function gets called if a trade is blocked because it exceeds a defined risk threshold. Conversely, `onAllowed` is triggered when a trade passes all the risk checks and is permitted to proceed. These callbacks give you a way to monitor and react to the system’s risk assessments within your trading logic.

## Interface IRiskActivePosition

This interface describes an active trading position that's being monitored for risk analysis. It holds all the key details about a position, like which strategy created it, the exchange it's on, and the trading symbol involved (like BTCUSDT). You’ll find information about the direction of the trade – whether it's a long or short position – along with the entry price and any stop-loss or take-profit levels.  There's also data about how long the position is expected to last and a record of exactly when the trade was initiated. Essentially, it's a snapshot of everything important related to an open position.

## Interface IRisk

The `IRisk` interface is your gatekeeper for managing risk while trading. It allows you to ensure your trading signals adhere to pre-defined risk limits and keeps track of your positions.

The `checkSignal` method evaluates whether a specific trading signal is permissible based on your defined risk parameters. A safer, more robust option is `checkSignalAndReserve`, which simultaneously verifies the signal and makes a preliminary "reservation" for the position within a protected area – this prevents multiple strategies from simultaneously exceeding limits.  It’s crucial to follow this up with either adding the actual signal data (`addSignal`) or canceling the reservation (`removeSignal`) to keep your risk tracking accurate.

`addSignal` is used to formally register a newly opened trading position in the system.  Finally, `removeSignal` is how you clean up when a position is closed, ensuring that your risk calculations remain correct.

## Interface IReportTarget

This interface lets you fine-tune what information gets recorded during your trading tests. Think of it as a way to control the level of detail in your reports.

You can selectively turn on or off logging for different aspects of the trading process, such as strategy performance, risk management, breakeven points, partial order fills, data analysis, schedule events, and more. Each property represents a specific type of event you might want to track.

For example, if you're primarily interested in how your trading strategy is performing, you can enable the `strategy` property. If you want to monitor the risk aspects, you can enable `risk`.  This gives you control over the report's contents and helps keep it focused on what's most important for your analysis.

## Interface IReportDumpOptions

This interface defines the details you can specify when writing out report data. It's a way to tag your data with important information like which trading pair (symbol) the data relates to, the name of the trading strategy used, the exchange it came from, and the timeframe (frameName). You can also include a unique identifier for the signal and the name of the walker used for optimization. Essentially, it lets you organize and filter your backtest results based on these key characteristics.

## Interface IRecentUtils

This interface defines how different systems can store and access recent trading signals. It provides methods for responding to "ping" events that indicate new signals are available, for fetching the most recent signal for a specific trading setup, and for determining how long ago that signal was generated. The `handleActivePing` method is used to save these new signals. The `getLatestSignal` method retrieves the most recent signal, carefully ensuring it doesn’t accidentally look into the future. Finally, `getMinutesSinceLatestSignalCreated` tells you how much time has passed since the latest signal was recorded, useful for validating your backtesting and trading logic.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, is designed to provide a clear and complete view of a trading signal, especially for external users or reporting. It builds upon the core signal information but adds crucial details about the initial settings.  You'll find here the original stop-loss and take-profit prices that were set when the signal was created – these values don't change even if you're using trailing stop-loss or take-profit techniques.

The `cost` property tells you the initial investment required for the position. The `originalPriceStopLoss` and `originalPriceTakeProfit` values let you track the initial risk management parameters.  `partialExecuted` shows you what percentage of the position has been closed using partial exits. `totalEntries` indicates if the position was a single entry or a series of averaged entries.  `totalPartials` represents the number of times partial exits have been triggered.

It also includes information about the position's performance, like the `originalPriceOpen` which is the initial entry price, and key metrics like `pnl`, `peakProfit`, and `maxDrawdown` that reflect the profit and loss history up to the signal's creation time. These metrics help you understand the position's overall health and potential.

## Interface IPublicCandleData

This interface describes a single candlestick, a common way to represent price data over a period of time. Each candlestick holds several pieces of information about the price action during that time. You'll find the exact time the candlestick started (timestamp), the price when it opened (open), the highest and lowest prices it reached (high and low), and the price when it closed (close). Finally, the volume property tells you how much trading activity occurred during that same period.

## Interface IPositionSizeKellyParams

This interface defines the parameters needed to calculate position sizes using the Kelly Criterion. It's all about determining how much to bet or trade based on your expected win rate and the average amount you win compared to what you lose.  You’ll specify a `winRate`, representing the proportion of time you expect to be profitable, and a `winLossRatio`, which describes the average profit for each losing trade. Together, these values help determine the optimal position size to maximize long-term growth.

## Interface IPositionSizeFixedPercentageParams

This describes the settings you use when determining how much of an asset to trade using a fixed percentage of your capital. 

Specifically, `priceStopLoss` tells the system at what price to place a stop-loss order to limit potential losses. This value is crucial for risk management within your trading strategy.

## Interface IPositionSizeATRParams

The `IPositionSizeATRParams` interface holds the information needed to calculate a position size based on the Average True Range (ATR). 

It's designed for use when you want to determine how much to trade based on market volatility, as measured by the ATR.

Currently, it only contains one piece of information: `atr`, which represents the current ATR value. This value is essential for calculating the size of your position.

## Interface IPositionOverlapLadder

This defines how to detect overlapping positions when using dollar-cost averaging (DCA). It essentially sets up a "buffer zone" around each of your DCA levels. 

The `upperPercent` property controls how much above each DCA level is considered an overlap – think of it as a safety margin to prevent unintended trades.  The `lowerPercent` property does the same but for below the DCA levels.

Both percentages are expressed as values between 0 and 100, so a value of 5 represents 5%. By adjusting these values, you can fine-tune how aggressively your backtest kit identifies potential overlap issues.

## Interface IPersistStrategyInstance

This interface helps you manage how a trading strategy's data is saved and loaded, particularly when dealing with delayed execution or needing to preserve information between sessions. It’s designed to work with a specific combination of a trading symbol, the strategy's name, and the exchange being used. 

If you want to change the way strategy data is stored—perhaps using a database instead of a file—you can create a custom adapter that implements this interface. 

The `waitForInit` method prepares the storage area for the strategy’s data.  The `readStrategyData` method retrieves any previously saved data. Finally, `writeStrategyData` allows you to save the current state of the strategy, or to clear out any existing data by setting it to null.

## Interface IPersistStorageInstance

This interface defines how your custom storage solutions can interact with the backtest-kit framework. Think of it as a way to replace the default file storage with something else, like a database or an in-memory store.

There's one instance of this storage adapter used during backtesting and another during live trading, ensuring isolation between the two.

The `waitForInit` method lets you prepare the storage before anything else happens in the context.

`readStorageData` retrieves all previously saved signals, looping through the storage to find them. They're identified by their unique signal IDs.

Finally, `writeStorageData` lets you save the current state of your signals, again using the signal ID as the key for each signal.

## Interface IPersistStateInstance

This interface defines how a specific piece of a trading strategy's state can be safely stored and retrieved. Think of it as a way to save important information for a particular calculation or decision, making sure it's not lost even if there's a problem.

It's particularly helpful when building strategies that need to remember things between runs or in case the system crashes. 

If you're building a custom way to store strategy state (like using a database instead of a file), you would implement this interface.

Here's what you'll need to do:

*   `waitForInit`:  A way to prepare the storage when it first starts.
*   `readStateData`: Loads the saved state from wherever it's stored.
*   `writeStateData`: Saves the current state to the storage. This includes specifying when the data was saved.
*   `dispose`:  Clean up any resources that were used. This might not be necessary in all cases.

## Interface IPersistSignalInstance

This interface defines how a backtest kit trading system can store and retrieve signals related to a specific trading strategy and symbol. Think of it as a way to save the signals generated by your strategy so you can load them again later.

If you want to customize where and how your signals are saved – perhaps using a database instead of a file – you can create a class that implements this interface.

The `waitForInit` method allows you to set up the storage space before signals are saved. `readSignalData` fetches previously saved signals, and `writeSignalData` is used to store new or updated signal information; setting the data to null clears the stored signal.

## Interface IPersistSessionInstance

This interface defines how to manage persistent session data for a specific trading setup—think of it as a way to save and load information related to a particular strategy, exchange, and timeframe. It's designed to help prevent data loss if your backtesting system crashes.

If you need to customize how this data is stored (perhaps using a database instead of a file), you can build your own adapter that implements this interface.

The `waitForInit` method prepares the storage for the session. `readSessionData` retrieves previously saved data. `writeSessionData` saves the current data, including a timestamp. Finally, `dispose` cleans up any resources used, although this may be optional in some cases.

## Interface IPersistScheduleInstance

This interface helps backtest-kit remember the signals it generates for a specific trading strategy on a particular symbol and exchange. Think of it as a way to save and load the signals so you can resume a backtest where you left off, or analyze past performance.

If you're building a custom solution for how signals are stored – maybe using a database instead of files – you'll need to implement this interface.

The `waitForInit` method is used to prepare the storage when a backtest starts. `readScheduleData` retrieves any previously saved signal information. Finally, `writeScheduleData` allows you to store a new signal or clear existing data when needed.

## Interface IPersistRiskInstance

This interface lets you customize how backtest-kit stores and retrieves risk positions – essentially, the details of active trades for a specific risk profile and exchange combination. If you want to use a database or another storage method instead of the default file storage, you can build a custom adapter that implements this. 

The `waitForInit` method is called to prepare the storage when a new risk context is created, allowing you to set up your custom storage mechanism. `readPositionData` retrieves the historical positions, allowing you to access previous state. Finally, `writePositionData` is how you'd save the current positions to your custom storage, ensuring they're preserved for future calculations.

## Interface IPersistRecentInstance

This interface defines how to store and retrieve the most recent signal for a specific trading setup. Think of it as a way to remember what signal was active last time you ran a backtest or were live trading. 

Each storage instance is tied to a particular combination of symbol, strategy name, exchange, and timeframe.

If you want to customize how this "remembered" signal is saved—perhaps using a database instead of a file—you'll create a class that implements this interface.

The `waitForInit` method sets up the storage when needed. `readRecentData` loads the previously saved signal, and `writeRecentData` saves the current signal.


## Interface IPersistPartialInstance

This interface defines how to save and load partial profit and loss information for a specific trading setup. Think of it as a way to remember where a trade stands, even if the program restarts. 

It focuses on a particular combination of asset (symbol), the trading strategy used (strategyName), and the exchange involved (exchangeName). 

The data for each individual trade signal is stored separately, identified by a unique signal ID. 

If you want to customize how this information is saved, like using a database instead of a file, you can create an adapter that implements this interface.

The `waitForInit` method sets up the storage area for a new trading context.

`readPartialData` retrieves the saved progress of a trade.

`writePartialData` saves the current progress of a trade.


## Interface IPersistNotificationInstance

This interface lets you customize how trading notifications are saved and loaded. Think of notifications as important messages your trading system generates – things like order confirmations or errors. 

This interface provides a way for you to control where and how those notifications are stored, rather than relying on the default file-based storage. There's a separate storage instance for backtesting and for live trading.

The `waitForInit` method prepares the storage when needed. The `readNotificationData` method retrieves all previously saved notifications. Finally, `writeNotificationData` saves new or updated notifications to the storage, associating each notification with a unique identifier.


## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for a specific part of your trading system. Think of it as a way to manage the information associated with a particular signal and a designated storage area. 

It allows you to read, write, and list memory entries—pieces of data—and even soft-delete them, meaning they're removed from active use but remain on disk. 

If you need a different way to store memory data beyond the default file-based method, you can create a custom implementation of this interface. 

Here's a breakdown of what you can do:

*   **waitForInit:** Sets up the storage area for memory.
*   **readMemoryData:** Retrieves a specific memory entry by its unique ID.
*   **hasMemoryData:** Checks if a memory entry with a given ID exists.
*   **writeMemoryData:** Creates or updates a memory entry, including a timestamp.
*   **removeMemoryData:** Marks a memory entry for deletion (soft-delete).
*   **listMemoryData:** Retrieves a list of all memory entries that haven't been marked for deletion.
*   **dispose:** Cleans up any resources used by the storage.

## Interface IPersistMeasureInstance

This interface defines how to store and retrieve cached data for a specific trading strategy bucket. Think of it as a way to save results from external sources so you don't have to repeatedly fetch them.

It allows for a feature called "soft delete" – when data is removed, it isn't actually erased from disk, but marked as such, allowing for easy recovery if needed.

If you want to customize how this cached data is stored – perhaps using a database instead of a file – you can create a custom adapter that implements this interface.

Here’s what the interface methods do:

*   `waitForInit`:  Prepares the storage area for the bucket.
*   `readMeasureData`:  Retrieves a cached data entry based on its key.
*   `writeMeasureData`:  Saves a new data entry to the cache, along with a timestamp.
*   `removeMeasureData`:  Marks an entry as deleted, keeping the file but excluding it from regular searches.
*   `listMeasureData`:  Provides a way to see a list of all available cached entries (excluding the marked deleted ones).

## Interface IPersistLogInstance

This interface defines how to manage persistent log data across your backtest-kit application. Think of it as a way to store log entries so they aren't lost when your backtest finishes or the application restarts.

Instead of being tied to a specific trading strategy or system, these logs are global, meaning they're stored and accessed in one central place.

If you want to change how logs are saved – for example, to store them in a database instead of a file, you can create a custom adapter that implements this interface.

The `waitForInit` method allows you to prepare the logging system for use.

`readLogData` allows you to retrieve all the saved log entries for review or further processing.

Finally, `writeLogData` provides the mechanism to save new log entries, ensuring that entries aren’t overwritten and the log remains an append-only record.

## Interface IPersistIntervalInstance

This interface helps manage how information about when an interval has run is stored for a specific time bucket. Think of it as a way to remember that a particular task has already been done for a given period. 

It's designed for scenarios where you need to control precisely how that "done" status is tracked – maybe you want to store this data in a custom database or a different file format than the default.

The `waitForInit` method prepares the storage for a bucket, `readIntervalData` retrieves existing marker information, and `writeIntervalData` saves new information about interval runs.  If you need to re-run something, you can "soft-delete" a marker using `removeIntervalData`—essentially making it disappear for the system's purposes until the next run cycle. Finally, `listIntervalData` allows you to see all the intervals that haven’t been removed.

## Interface IPersistCandleInstance

This interface defines how to manage and store candle data for a specific trading symbol, timeframe (interval), and exchange. Think of it as a way to save and load historical price data.

The `waitForInit` method prepares the storage space for this particular data set.

`readCandlesData` is used to retrieve a range of historical candles, and crucially, it will return `null` if even a single candle is missing from the saved data.  This signals to the system that it needs to go back and fetch that missing piece of data from the original source.

`writeCandlesData` allows you to save newly fetched or calculated candles to the storage.  When saving, you might want to skip candles that are incomplete or that already exist to prevent accidentally replacing complete data. 

Essentially, it's a persistent store for candle data, ensuring that missing data triggers a refresh from the source and that existing data isn't overwritten unnecessarily.

## Interface IPersistBreakevenInstance

This interface lets you manage how breakeven data – the information needed to know when a trade is profitable – is saved and loaded. Think of it as a way to customize where and how this vital information is stored. 

It's specific to a particular combination of symbol (the asset being traded), strategy name, and exchange – meaning each trading setup gets its own dedicated storage space.

The `waitForInit` method prepares the storage area for a new context.
The `readBreakevenData` method retrieves saved breakeven data for a particular trade signal.
The `writeBreakevenData` method saves the breakeven data for a trade signal.

You can build your own adapters that implement this interface to replace the default file storage with something else, like a database or an in-memory solution.

## Interface IPersistBase

This interface, `IPersistBase`, is designed to let you build your own ways to save and load data for your backtesting system. It lays out the basic building blocks: initializing persistence, reading data, checking for its existence, writing data safely, and listing all available data keys. Think of it as a standard way for different storage methods – like files, databases, or even in-memory stores – to interact with the backtesting framework. 

The `waitForInit` method ensures everything is set up correctly once, before any data is loaded. `readValue` and `hasValue` are used to retrieve and verify data. `writeValue` writes data reliably. Finally, `keys` gives you a way to get a sorted list of all the data identifiers, useful for checks or looping through everything. 

The framework provides a default implementation called `PersistBase`, but you can create your own custom adapters that meet the requirements of `IPersistBase`.

## Interface IPartialProfitCommitRow

This interface represents a single instruction to take a partial profit on a trade. Think of it as a row in a queue telling the backtest system to sell a portion of your position. 

Each instruction specifies the percentage of the position to close, and the price at which that partial sale actually occurred.  The `action` property simply identifies this as a partial profit action.


## Interface IPartialLossCommitRow

This represents a request to partially close a position, essentially selling a portion of it. 

It includes details like confirmation that the action is a "partial-loss", the percentage of the position being closed, and the price at which that partial sale occurred. Think of it as a record of a partial sale order being processed.


## Interface IPartialData

This data structure, called `IPartialData`, is designed to save and load a snapshot of your trading signal's progress. It focuses on the key information needed to resume where you left off.

Think of it as a simplified version of your trading state, specifically storing the profit and loss levels achieved so far.

The `profitLevels` property holds an array representing the successful profit levels reached, and `lossLevels` similarly tracks the loss levels encountered. This makes it easy to save progress and pick up later without losing your hard-earned gains or learning from your losses. The data is structured as arrays to ensure it can be saved as JSON.

## Interface IPartial

The `IPartial` interface is responsible for keeping track of how well your trading signals are performing, specifically looking at milestones like reaching 10%, 20%, or 30% profit or loss.

It's used by components like `ClientPartial` and `PartialConnectionService` to monitor signals and notify you when important profit/loss levels are hit.

The `profit` method handles situations where a signal is making money. It figures out which profit levels have been reached and sends out notifications for *new* levels.

The `loss` method does the same, but for when a signal is losing money.  It tracks loss levels and sends notifications for new ones.

Finally, the `clear` method is used to reset the profit/loss tracking when a signal finishes – whether it hits a target, a stop-loss, or expires. This cleanup process also involves saving the changes and releasing resources.

## Interface IParseArgsResult

The `IParseArgsResult` object holds the results after processing command-line arguments, especially those related to trading modes. It essentially combines the original input parameters with flags that tell the system whether to run in backtest mode (using historical data to test strategies), paper trading mode (simulated trading with live data), or live trading mode (actual trading with real money). 

Here’s what it contains:

*   `backtest`: A true/false value indicating if the backtest mode is enabled.
*   `paper`: A true/false value indicating if the paper trading mode is enabled.
*   `live`: A true/false value indicating if the live trading mode is enabled.

## Interface IParseArgsParams

This interface describes the information needed to run a trading strategy from the command line. It specifies the essential details like which cryptocurrency pair to trade (symbol), what trading strategy to use (strategyName), which exchange to connect to (exchangeName), and the timeframe for the data (frameName). Think of it as a blueprint for how the command line arguments are structured to tell the backtest-kit exactly what to do. It provides default values, making sure all the necessary pieces are in place to start the backtest.

## Interface IOrderBookData

The `IOrderBookData` interface describes the structure of order book information. It holds the symbol of the trading pair, along with lists of bids and asks. Bids represent buy orders, and asks represent sell orders. Each bid and ask is structured with the `IBidData` interface.

## Interface INotificationUtils

This interface serves as a foundation for systems that send notifications about trading activity. Any component that wants to deliver notifications – like sending alerts to a user or logging events – needs to follow this blueprint.

It defines a set of methods to handle different types of trading events. You'll find methods for reacting to signals (when a trade is opened, closed, or altered), as well as events related to profit taking, loss management, and strategy adjustments. 

There are also methods to deal with errors and validation issues. 

Finally, the interface provides functions to retrieve and clear all stored notifications, allowing for reporting and cleanup.

## Interface INotificationTarget

This interface lets you finely control which notifications your backtest or live trading system receives. Think of it as a way to subscribe only to the alerts you actually need, rather than being bombarded with everything. If you don't provide this interface, you'll get all notifications by default.

Here's a breakdown of the different notification types you can choose to enable:

*   **Signal events:** Notifications about signal lifecycle events like when a signal is opened, scheduled, closed, or canceled.
*   **Partial profit/loss:** Alerts when the price hits a partial profit or loss level defined in your strategy.
*   **Breakeven:** Notifications when the price reaches the breakeven point.
*   **Strategy commits:** Confirmations that a strategy action (like a partial profit take or trailing stop) has been executed.
*   **Signal synchronization:** Events related to order confirmations, such as when an order is filled or a position is exited.
*   **Risk rejections:** Notifications when the risk manager prevents a signal from opening.
*   **Informational signals:** Manual or strategy-generated messages providing additional information about an active signal.
*   **Common errors:** Alerts for recoverable runtime errors that are logged but don't stop the process.
*   **Critical errors:** Notifications for unrecoverable errors that terminate the backtest or live session.
*   **Validation errors:** Alerts for issues found when validating the strategy configuration or input data.

## Interface IMethodContext

The `IMethodContext` interface acts as a container, holding crucial information about the trading environment a particular operation is running within. Think of it as a little package that travels alongside your code, telling it *where* to find the right components. It holds the names of the schemas used for the exchange, the strategy, and the frame – essentially, the identifiers that pinpoint the specific trading system being utilized. If you’re running a live trading session, the frame name will be blank, indicating that it’s not part of a historical backtest. This context is automatically passed around by the `MethodContextService` to ensure everything operates on the correct data and configurations.

## Interface IMemoryInstance

The `IMemoryInstance` interface sets the rules for how memory is managed within the backtest-kit framework. Think of it as a blueprint for different ways to store and retrieve trading data – whether that's in local storage, a persistent database, or even just a temporary "dummy" setup for testing.

It provides methods for interacting with this memory:

*   `waitForInit` ensures the memory is ready to go before anything else happens.
*   `writeMemory` lets you save data with a unique ID, a description, and a timestamp.
*   `searchMemory` helps you find specific data using keywords, ranking results by relevance, and only showing entries up to a certain point in time.
*   `listMemory` retrieves all data entries up to a particular timestamp.
*   `removeMemory` deletes a specific data entry, again respecting a timestamp boundary.
*   `readMemory` fetches a single data entry, and won’t return results if the data is too recent.
*   Finally, `dispose` cleans up any resources used by the memory setup when it's no longer needed.

## Interface IMarkdownTarget

This interface lets you pick and choose which reports you want to see when using the backtest-kit framework. Think of it as a way to control the level of detail in your analysis.

You can turn on reports for things like strategy signals (entry and exit points), risk management events (signals blocked by limits), or even track milestones like the highest profit achieved and maximum drawdown experienced.

There are options to analyze overall portfolio performance, compare different strategies, and monitor signals waiting to be triggered.

You can also enable reports for live trading events or detailed backtest results with the entire trade history.

Ultimately, this interface gives you granular control over the reporting features, so you only see what’s most relevant to your trading analysis.

## Interface IMarkdownDumpOptions

This interface defines the options used when generating markdown documentation, especially for backtest results. Think of it as a way to organize and label the different components of your trading strategies and data. It includes information like the directory where the documentation will be placed, the specific file name, the trading pair involved (like BTCUSDT), the name of the strategy being used, the exchange platform, the timeframe (e.g., 1m, 1h), and a unique identifier for any trading signals. Using these properties ensures your documentation is clearly categorized and easy to find.

## Interface ILogger

The `ILogger` interface defines a standard way for different parts of the backtest-kit framework to record information. Think of it as a central hub for keeping track of what's happening inside the system.

You can use it to log various messages, categorized by severity.

Here's a breakdown of the logging levels available:

*   **log():** This is your go-to method for recording important events and state changes, like when an agent starts working or data is saved.

*   **debug():** Use this for really detailed information, mainly for developers to diagnose issues. It’s helpful to see the steps involved in something, like a tool call or how the system is navigating.

*   **info():** This captures significant updates and confirmations - for example, if a policy check passes or data is successfully saved.  It’s a more concise view of what’s happening.

*   **warn():**  This is for situations that aren’t critical errors, but are worth noting - maybe there's some missing data or you're using a feature that will be replaced soon.

## Interface ILogEntry

This describes a single entry in the system's log history, like a record of what happened during a backtest. 

Each entry has a unique ID, a type indicating its severity (log, debug, info, or warn), and a timestamp for efficient management of the log. 

It also stores the date and time the log was created, alongside information about where the log originated from – the specific method and execution environment. Finally, you'll find any additional arguments that were passed when the log was generated.

## Interface ILog

The `ILog` interface helps you keep track of what's happening during your backtests. It’s like having a detailed record of all the events – trades, data updates, errors – that occur.

The `getList` method is your way to view this record; it retrieves all the logged entries, allowing you to examine the sequence of events and debug any issues. Think of it as downloading the entire history of your backtest's activities.

## Interface IHeatmapRow

This describes a detailed breakdown of performance metrics for a specific trading symbol within a backtest. Think of it as a report card for how a strategy performed on a particular asset like BTCUSDT. It covers everything from basic profitability (total profit/loss) to more advanced risk-adjusted measures like Sharpe and Sortino ratios, which consider how much risk you took to achieve those returns.

You'll find information about trade frequency, win/loss rates, average profits and losses, and even streak lengths (how many wins or losses in a row). There's a lot of data about the size of price movements and how buyers and sellers are influencing the price. Finally, a trend analysis attempts to classify the overall direction of the asset. Overall, this data set allows for a comprehensive assessment of a trading strategy's performance for a given symbol.

## Interface IFrameSchema

This `IFrameSchema` defines a reusable building block for your backtesting setup. Think of it as a template that tells the backtest-kit how to create and manage specific time periods for your simulations. 

Each schema has a unique name to identify it, and you can add a note to explain what it's for.  

Crucially, it defines the *interval* – like "1m" for one-minute intervals or "1d" for daily – and the start and end dates that mark the timeframe you want to analyze. You can also specify optional callbacks to trigger specific actions at different points in the frame lifecycle. This allows you to customize how data is processed and used during the backtest.

## Interface IFrameParams

The `IFrameParams` object holds the settings needed when setting up a frame within the backtest-kit framework. Think of it as a configuration bundle for a specific trading frame. It includes a `logger` which is vital for keeping track of what's happening and diagnosing any issues. 

You'll also specify an `interval`, like "1m" for one-minute data, which clearly labels the type of data this frame will be processing. Essentially, it defines the frame's identity and how it will report its activity.

## Interface IFrameCallbacks

This section describes how to react to the creation of timeframes within the backtest framework. Specifically, `onTimeframe` allows you to execute a function whenever a set of timeframes is generated. This is handy for checking the accuracy of the timeframes or for simply recording the process. The function receives the array of dates making up the timeframe, the start and end dates for the entire test, and the interval used to create those timeframes. You can use it to log data or perform other validations as needed.


## Interface IFrame

The `IFrame` interface is a core part of backtest-kit, responsible for creating the timeline your trading strategies will be tested against. Think of it as defining *when* your strategy will run – specifying the dates and times for each bar in your backtest.

The `getTimeframe` function is the key here. It takes a ticker symbol (like "AAPL") and a frame name (like "daily" or "hourly") and returns a promise that resolves to an array of timestamps. These timestamps are evenly spaced apart, reflecting the interval of the timeframe you've chosen. This essentially builds the sequence of historical data your backtest will use.

## Interface IExecutionContext

The `IExecutionContext` provides the essential information your trading strategies and exchange interactions need to function correctly. Think of it as a package of details passed along during execution.

It tells your code what asset is being traded, represented by the `symbol` property – for example, "BTCUSDT".  The `when` property indicates the current timestamp, so your code knows precisely when an event is happening. Finally, the `backtest` property clearly flags whether the code is running in a simulated environment (backtest) or live, real-time trading. This lets your strategy adjust its behavior accordingly.

## Interface IExchangeSchema

This schema defines how backtest-kit interacts with a specific cryptocurrency exchange. It's essentially a blueprint for connecting to and retrieving data from an exchange.

Each exchange you use needs to register a schema like this, giving it a unique name for identification. You can also add a note for yourself to document anything specific about the exchange's setup.

The core of the schema is the `getCandles` function, which is responsible for fetching historical price data (candles) for a given trading pair and time range. You’ll also likely use `formatQuantity` and `formatPrice` to ensure that trade sizes and prices conform to the exchange's specific rules – otherwise, defaults are provided.

If you need more advanced functionality, you can also implement optional methods like `getOrderBook` to retrieve order book data, `getAggregatedTrades` to get trade history, or `callbacks` for lifecycle events. If those optional methods aren't provided, the system will raise an error when they're called.

## Interface IExchangeParams

The `IExchangeParams` interface defines the configuration needed to connect to and interact with a cryptocurrency exchange. It essentially bundles all the necessary functions your backtesting system needs to simulate trading on a specific exchange.

You'll need to provide a logger to handle debugging and informative output during the backtesting process.

Crucially, it requires methods for fetching historical candle data, formatting order quantities and prices to match the exchange's rules, retrieving order books, and obtaining aggregated trade data.  These functions will be used to simulate market conditions and execute trades during backtesting.  Default implementations are often available, but you’ll need to customize them if you’re integrating with a less common exchange. The `execution` context provides information like the trading symbol, the current time, and whether the process is a backtest.

## Interface IExchangeCallbacks

This lets you react to incoming candle data from an exchange. 

You can define a function that gets triggered whenever new candlestick data arrives for a specific trading symbol and time interval. 

The function receives details like the symbol, interval, starting date, the number of candles requested, and an array of candlestick data points. This is useful for displaying real-time charts or performing immediate analysis.


## Interface IExchange

The `IExchange` interface defines how your backtesting environment interacts with an exchange. It provides essential functions for retrieving market data, formatting order quantities and prices, and calculating key indicators.

You can fetch historical candle data (`getCandles`), simulate fetching future candles (`getNextCandles` - useful for backtesting), and format quantities and prices to match the exchange's specific requirements. The framework also offers a way to calculate the VWAP (Volume Weighted Average Price) based on recent candle data (`getAveragePrice`).

For real-time insights, you can retrieve the latest order book (`getOrderBook`) and aggregated trades (`getAggregatedTrades`). The `getClosePrice` function gives you the closing price from the most recent completed candle for a chosen time interval.

The `getRawCandles` method allows for very flexible retrieval of candle data, letting you specify start and end dates, and a limit, or rely on the current context time for reference. Importantly, all data retrieval respects the backtest context to prevent issues like looking into the future.

## Interface IEntity

This interface serves as the foundation for any data that's saved and retrieved from storage within the backtest-kit framework. Think of it as the parent for all your persistent objects, ensuring they all share a common structure. If you're defining a class representing something that needs to be saved (like a trade or an account balance), it should probably implement this interface. It establishes a base level of consistency for how your data is handled.

## Interface IDumpInstance

This interface defines how a component can save data related to a backtest run. Think of it as a way to record important information at different stages. 

Each dump instance is linked to a specific signal and bucket, and it has several methods for saving different types of data:

*   `dumpAgentAnswer`: Stores the complete conversation history for a specific agent.
*   `dumpRecord`:  Allows saving data as a simple set of key-value pairs.
*   `dumpTable`: Presents data in a structured table format, automatically figuring out the column headers.
*   `dumpText`:  Saves raw text, which could be plain text or markdown.
*   `dumpError`: Records details about any errors that occurred.
*   `dumpJson`: Stores complex data structures as formatted JSON.

Finally, the `dispose` method is used to clean up and release any resources the instance is using when it's no longer needed.

## Interface IDumpContext

The `IDumpContext` helps track where data is coming from when saving information during a trading process. It's essentially a package of information that identifies a specific data point. 

You'll find details like the signal that triggered the trade (`signalId`), the name of the strategy or agent that generated it (`bucketName`), and a unique ID for that data point (`dumpId`). 

There's also a description field for a human-friendly label – think of it as a short explanation of what the data represents. Finally, a flag indicates whether the data originates from a backtest or a live trading scenario. This context is used to organize and identify data entries.

## Interface ICommitRowBase

This interface defines the basic information available for a commit event—essentially a record of something that needs to be registered during a trading process. It contains the trading pair's symbol, so you know which asset is involved, and a flag to indicate whether the operation is part of a backtesting simulation. Think of it as a way to collect details about events that happen during a trade, ensuring they are handled correctly later on, especially when the system needs a stable environment to process them.

## Interface ICheckCandlesParams

ICheckCandlesParams defines the information needed to verify if your trading data (candles) are correctly stored and available. It's essentially a way to quickly check if your backtest-kit has all the data it needs for a specific trading pair, exchange, and timeframe without having to perform a full scan of the storage.

You’ll specify the trading symbol like "BTCUSDT", the name of the exchange you’re using, the candle timeframe (e.g., 1 minute, 4 hours), and the date range you want to check. This lets you confirm that the correct historical data is present for your backtesting or analysis.

## Interface ICandleData

The `ICandleData` interface represents a single candlestick, providing a snapshot of price action and trading volume over a specific time interval. Each candle includes the timestamp – the moment it began – along with its opening price, the highest and lowest prices reached, the closing price, and the total volume of trades that occurred during that period. This data is crucial for tasks like calculating moving averages, and for running backtests to evaluate trading strategies. Essentially, it's a standardized way to represent price data for analysis and automated trading.

## Interface ICacheCandlesParams

This interface defines the settings you can use to control how your backtest kit manages historical price data. It's all about ensuring you have the right data available for your trading strategies, and it lets you hook into key moments in that process. 

Think of it as a way to prepare your data – first, it checks if the data exists, and if not, it warms up the cache with more data. 

The `onWarmStart` callback lets you run code before the data warming process begins for a specific trading symbol and timeframe. 
Similarly, the `onCheckStart` callback triggers before the warming up phase starts when the data validation fails, allowing you to perform actions or logging. 


## Interface IBroker

This interface defines how your trading framework connects to a real broker or exchange. Think of it as the bridge between the backtesting engine and the live market.

Here's a breakdown of the key parts:

*   **`waitForInit`**: This is your initial setup. It’s where you connect to the exchange, load API keys, and get everything ready.
*   **`onSignalCloseCommit`**:  This handles closing positions (take-profit, stop-loss, manual close).  It's a critical gate—if something goes wrong here (an error), the framework *doesn't* close the position, it tries again.
*   **`onSignalOpenCommit`**: This is where new positions are opened.  Like `onSignalCloseCommit`, it’s a gate; a failure here means the order isn't placed, and the framework retries.  It handles both immediate orders and orders placed on a schedule.
*   **`onOrderCheck`**: This is called frequently to verify orders are still valid. A thrown error here means the position or schedule is closed/cancelled. It's a way to react to potential order issues, but it's designed to be resilient to temporary network problems – don't throw on transient errors.
*   **`onSignalActivePing`**:  This runs constantly for open positions. It's your opportunity to reconcile the framework's view of the market with the actual state on the exchange – catching things like a gap through a stop-loss.
*   **`onSignalSchedulePing`**:  Similar to `onSignalActivePing`, but for scheduled orders waiting to be triggered.
*   **`onSignalIdlePing`**: A heartbeat for when there's no trading activity.
*   **`onSignalScheduleOpen`**:  This function triggers when placing the initial resting order for a scheduled signal.
*   **`onSignalScheduleCancelled`**: This signal is emitted when a scheduled signal is cancelled, and the corresponding order needs to be cancelled on the exchange.
*   **`onSignalPendingOpen`**: A lifecycle hook for when a new position is opened.
*   **`onSignalPendingClose`**: Similar to `onSignalPendingOpen`, but for when a position is closed.
*   **`onPartialProfitCommit`, `onPartialLossCommit`, `onTrailingStopCommit`, `onTrailingTakeCommit`, `onBreakevenCommit`, `onAverageBuyCommit`**: These hooks are called when respective actions are committed.

The framework is designed to be exception-based, meaning errors in these methods prevent actions from happening and trigger retries.  For live trading, you’ll implement these methods to interact with your chosen broker. During backtesting, these calls are skipped.

## Interface IBreakevenData

This interface defines the data used to store whether a breakeven point has been reached for a particular trading signal. It's a simple representation, just a boolean value indicating if the breakeven has been achieved. Think of it as a snapshot of the breakeven state that can be easily saved and loaded, like when the trading system needs to remember where it left off. It's used internally to keep track of breakeven progress and is converted from the more detailed breakeven state.

## Interface IBreakevenCommitRow

This represents a single instruction for adjusting a trade's breakeven point. It tells the system to recalculate the breakeven level.

The `action` property will always be "breakeven," indicating this is a breakeven adjustment.

The `currentPrice` is the price used to calculate the new breakeven level – essentially, the price the system observed when this adjustment was triggered.

## Interface IBreakeven

The IBreakeven interface helps manage a system that automatically adjusts a trade's stop-loss to the entry price once it has reached a certain profit level. It's used by components that track and react to these breakeven events.

The `check` method is the core of this process, regularly evaluating whether a signal's price movement has made it safe to move the stop-loss to breakeven, taking into account transaction costs. If the conditions are right, it records that breakeven has been achieved and triggers a notification to other parts of the system.

The `clear` method is used to reset the breakeven status when a trade is closed, ensuring that the system is ready for the next trade. It removes the trade's information from active memory and saves the changes.

## Interface IBidData

This interface describes a single bid or ask price point found within an order book. It contains two pieces of essential information: the price at which the order is placed, and the quantity of orders available at that price. Both the price and the quantity are represented as strings.

## Interface IAverageBuyCommitRow

This interface represents a single step in a queued average-buy (also known as Dollar-Cost Averaging or DCA) process. It holds information about a specific buy action taken as part of a larger DCA strategy.

Each `IAverageBuyCommitRow` tells you the price at which a new averaging entry was purchased, how much that purchase cost in USD, and the total number of averaging entries that will exist in the queue after this action is completed. Think of it as a record of one particular buy within a series of buys intended to build up an average price. The `action` property simply confirms that this record relates to an average-buy action.

## Interface IAggregatedTradeData

This data structure represents a single trade that happened, offering key details for analysis and backtesting. Each trade is uniquely identified by an `id`, and we know the `price` at which it took place, the `qty` (quantity) involved, and the exact `timestamp` – recorded in milliseconds since the Unix epoch.  Finally, `isBuyerMaker` tells you if the buyer was acting as the market maker, which helps determine the trade's direction.

## Interface IActivityEntry

An `IActivityEntry` represents a single, ongoing trading activity, whether it's a backtest or a live trade. Think of it as a record of what's currently happening.

These entries are automatically created when a trading activity begins and removed when it finishes, either successfully or with an error.

The system uses these entries to keep track of and manage multiple trading activities, especially to avoid conflicts when several activities run at the same time.

Each entry contains the symbol being traded, details about the strategy and exchange involved, and whether it’s a backtest or live execution.

## Interface IActivateScheduledCommitRow

This interface represents a message that signals an activation of a previously scheduled commitment. Think of it as a notification that something planned is now happening.

It includes the type of action, which is always "activate-scheduled". 

You’ll also find the `signalId`, which identifies the specific signal being activated.  If the activation was initiated by a user, there's an optional `activateId` to specify which action triggered it.

## Interface IActionStrategy

This interface gives action handlers a way to peek at the trading signal status without actually executing anything. Think of it as a way to check if there's a pending order or a signal scheduled to happen.

It’s primarily used by the ActionProxy to decide whether certain actions, like adjusting stop-loss levels or taking partial profits, should even be considered.

Specifically, it helps determine if actions related to break-even, partial profits/losses, pings, and scheduled events should proceed.

The `hasPendingSignal` method lets you see if there's an open position currently waiting for a signal.

The `hasScheduledSignal` method lets you check if a signal is waiting to be triggered in the future. You'll need to provide details like whether it’s a backtest and the symbol involved.

## Interface IActionSchema

This defines how you can extend a trading strategy with custom actions. Think of actions as hooks that let you inject code into the strategy's execution flow. 

These actions can be used for all sorts of things – managing the strategy’s internal state, recording events for later analysis, sending out notifications, or even triggering other business processes. 

You register these actions with a unique name and a short description. Each action has a handler, which is essentially a piece of code that gets run for every "frame" of the strategy's execution. You can also add callbacks for specific moments in the action’s lifecycle, giving you even more control.  Multiple actions can be linked to a single strategy, allowing for a layered approach to customization.


## Interface IActionParams

The `IActionParams` object holds all the crucial information needed when an action is executed within the backtest-kit framework. Think of it as a package containing everything an action needs to know about its environment. 

It builds upon a base schema and incorporates runtime details like a logger to help track and debug what's happening. You'll also find information like the strategy and timeframe the action belongs to.

Key pieces of information included are:

*   A logger for sending messages and tracking execution.
*   The strategy's name and the timeframe it's associated with.
*   Details about the exchange being used.
*   Whether the action is part of a backtest simulation.
*   The current state of the strategy, including its signal and position information.

## Interface IActionCallbacks

This document describes the lifecycle callbacks you can use when building actions within the backtest-kit framework. These callbacks provide a way to react to various events and perform tasks like resource management, logging, and interacting with external systems.

**Initialization and Disposal:**

*   `onInit`: This callback is triggered when an action handler starts up. It's a good place to initialize connections, load data, or set up subscriptions.
*   `onDispose`: This callback runs when an action handler is shut down, allowing you to clean up resources like closing connections and flushing buffers.

**Signal Handling:**

The framework offers several callbacks based on the signal source and trading mode:

*   `onSignal`: A general callback triggered by signals from all modes (live and backtest).
*   `onSignalLive`: Specifically called for signals in live trading mode.
*   `onSignalBacktest`: Specifically called for signals during backtesting.

**Profit & Loss Management:**

*   `onBreakevenAvailable`: Gets called when a breakeven point is reached.
*   `onPartialProfitAvailable`: Triggered when a partial profit level is achieved.
*   `onPartialLossAvailable`:  Called when a partial loss level is reached.

**Scheduled Events:**

*   `onPingScheduled`:  Runs periodically while a scheduled signal is awaiting activation.
*   `onScheduleEvent`: Notifies you about lifecycle events related to scheduled signals, like creation or cancellation.

**Pending Signals:**

*   `onPendingEvent`: This callback deals with pending signal events, both when a position is opened and when it is closed. You can use it to manually manage order placement.
*   `onPingActive`: Runs periodically while a pending position is active.
*   `onPingIdle`:  Runs every tick when there are no active signals.

**Risk Management and Order Management:**

*   `onRiskRejection`:  Called when a signal is rejected by the risk management system.
*   `onOrderSync`:  Lets you synchronize order actions, potentially rejecting them and retrying on the next tick.  Throwing an error here will retry the operation.
*   `onOrderCheck`:  Used to verify that orders are still pending on the exchange and react appropriately if they're missing.  Throwing an error here will cause the system to retry.

**Important Notes:**

*   Many of these callbacks are event-driven, letting you hook into specific actions within the framework.
*   Manual wiring is required for certain events, allowing you to take direct control over exchange interactions.
*   For order-related actions (`onOrderSync`, `onOrderCheck`), carefully handle exceptions or return false to avoid unintended consequences.

## Interface IAction

This interface, `IAction`, is your central hub for connecting your custom logic to the backtest-kit's trading engine. Think of it as a set of event listeners that let you react to what's happening during a backtest or live trade.

Each method within `IAction` corresponds to a specific event, like a signal being generated, a partial profit level being reached, or a risk check failing. You can use these to do things like log events, update a dashboard, or manage your own custom trading logic.

The `signal`, `signalLive`, and `signalBacktest` methods are the core for receiving trading signals, with distinctions based on whether the signal comes from a live or backtest environment.  Specialized methods handle milestones like reaching a breakeven point, hitting profit or loss targets, and monitoring scheduled signals.

Beyond core trading events, methods like `orderSync` and `orderCheck` let you intervene in the order execution process—for example, rejecting an order or ensuring it's still active—which is crucial for managing risk. Finally, `dispose` provides a way to clean up resources when your custom logic is no longer needed.  Essentially, `IAction` is a flexible way to extend the framework's functionality and tailor it to your specific needs.

## Interface HighestProfitStatisticsModel

This model keeps track of the events that resulted in the highest profit during a trading simulation. It essentially gives you a complete record of those profitable moments, presented in chronological order with the most recent event first. You can see exactly how many profitable events were recorded overall, and access a detailed list of each one, allowing you to analyze what factors contributed to those successes. It's a handy tool for understanding and replicating high-profit scenarios.

## Interface HighestProfitEvent

This data structure represents the single best profit event observed for a particular trading position. It holds all the key details about when and how that peak profit was achieved. You'll find information like the exact timestamp, the trading pair involved, the strategy and signal that triggered the trade, and whether it was a long or short position.

Crucially, it includes not only the final profit and loss (PNL) but also the highest profit point reached during the trade's lifespan, along with the maximum drawdown experienced.  The open price, take profit, and stop-loss prices are also recorded. Finally, a flag indicates if this event occurred during a backtesting simulation.

## Interface HighestProfitContract

The `HighestProfitContract` provides information when a trading strategy reaches a new peak profit level. It bundles key details about the trade, including the symbol being traded, the current price, and the exact time the highest profit was achieved. You'll also find the strategy name, exchange, and timeframe involved, along with the signal that triggered the trade. Critically, it also specifies whether this update is from a historical backtest or a live trading scenario. This allows you to build custom actions based on those profit milestones, such as adjusting stop-loss orders or taking partial profits.

## Interface HeatmapStatisticsModel

This structure holds a comprehensive set of statistics for your entire portfolio, giving you a high-level view of performance. It breaks down key metrics across all the symbols you're trading, rather than just looking at individual assets.

You'll find aggregated data like the total profit and loss, Sharpe and Sortino ratios, and the total number of trades executed.  It also provides insight into risk management, including measures of drawdown and volatility.

The framework calculates trade-weighted averages for peak profit and fall profit, giving a more accurate representation of typical performance than simple averages. Duration metrics show how long trades are typically held.  

Several key performance indicators are annualized or geometrically extrapolated, allowing you to estimate potential yearly returns and compare results across different timeframes and strategies. It even includes a measure of expectancy, representing the expected return per trade. Finally, it gives the number of trades if extrapolated to a year.


## Interface DoneContract

This interface lets you know when a background process, either a backtest or a live trading session, has finished running. 

It provides key details about what just completed, like the exchange it used, the name of the trading strategy, and whether it was a backtest or a live execution. 

You’ll also find the trading symbol involved, such as "BTCUSDT," and the name of the frame if it was part of a backtest. Think of it as a notification with important context about a completed trading operation.


## Interface CronHandle

This object lets you cancel a scheduled task you previously registered with the Cron system. Think of it as an unsubscribe button for your automated trading functions. When you’re done with a task or want to stop it from running, simply call the method on this handle. It's a clean way to remove your registered functions without having to manually track and call the unregistration function directly.

## Interface CronEntry

A CronEntry defines when and how a specific piece of code will run within the backtest framework. 

Each entry needs a unique name, used to identify it and prevent duplicates. It also requires a candle interval – like "1m" or "1h" – which dictates how often the code executes based on the timing of candle data.

You can also specify a list of symbols; if left empty, the code runs once for all backtests, whereas listing symbols makes it run once per symbol within the list. 

Finally, there's a handler, which is the actual function that will be executed according to the defined schedule and symbol selection. If the handler fails, the system will retry it.

## Interface CriticalErrorNotification

This notification signals a critical error within the backtest framework, demanding immediate attention and process termination. 

It carries essential details about the error, including a unique identifier, a clear human-readable message explaining the issue, and a full stack trace with related data. 

The `type` property confirms this is a critical error notification, allowing for safe and reliable error handling. 

Notably, the `backtest` flag will always be false, because these errors originate from a live context rather than a simulation.

## Interface ColumnModel

The `ColumnModel` interface helps you customize how data is displayed in tables. Think of it as a blueprint for each column you want to show.

Each column gets a unique `key` to identify it, and a `label` that users see as the column header.

The `format` function lets you transform the raw data into a nicely formatted string—maybe you want to display dates or currency in a specific way.

Finally, the `isVisible` function gives you control over whether a column is shown at all, potentially based on some condition.

## Interface ClosePendingCommitNotification

This notification signals that a pending signal has been closed before a full position was activated. It provides detailed information about the closure, including a unique identifier, the time it happened, and whether it occurred during backtesting or live trading. You'll find details like the trading symbol, the strategy involved, and the exchange used.

The notification also includes comprehensive performance metrics for the closed position, such as total profit and loss (PNL), peak profit, maximum drawdown, and their associated prices and percentages.  Crucially, it breaks down the PNL by entry and considers slippage and fees. Furthermore, it gives insight into the closing reason via an optional note and records the creation timestamp of the notification itself. This detailed information helps to understand why a signal was closed and how the position performed.

## Interface ClosePendingCommit

This signal signifies the completion of a previously opened position, indicating it has been closed. 
It provides details about the trade's performance, including its total profit and loss (PNL).
You'll also find information about the highest profit reached during the position's lifetime and the largest drawdown experienced. 

The `action` field confirms this is a closing signal, while `closeId` lets you optionally add a custom identifier to explain why the position was closed.

## Interface CancelScheduledCommitNotification

This notification signals that a previously scheduled trading signal has been cancelled before it was activated. It provides comprehensive details about the cancelled signal, including its unique identifier, when the cancellation happened, and whether it occurred during a backtest or live trading environment. The notification contains a wealth of information about the intended trade, such as the trading pair, strategy name, exchange, signal ID, and details about any planned DCA (Dollar Cost Averaging) or partial closing actions.

You’ll find details about the potential trade’s performance, including P&L (profit and loss), peak profit, maximum drawdown, and relevant prices – all adjusted to account for potential slippage and fees.  It also includes details like the initial entry price, the total amount invested, and a user-provided note explaining the reason for the cancellation. Finally, timestamps are included to track the creation and cancellation times of the notification.


## Interface CancelScheduledCommit

This interface lets you signal a cancellation of a previously scheduled event. Think of it as telling the system, "Hey, something that was supposed to happen isn't going to anymore."

You’ll specify that you're cancelling with the `action` property.

To help track why you're cancelling, you can include a `cancelId` – a user-defined identifier to explain the reason.

Along with the cancellation, you'll also provide performance data about the position related to this event. That includes the total profit and loss (`pnl`), the highest profit ever reached (`peakProfit`), and the biggest loss incurred (`maxDrawdown`). These values reflect the position's history up to the point the cancellation signal is sent.


## Interface BreakevenStatisticsModel

This model holds information about breakeven points reached during a trading simulation. 

It keeps track of individual breakeven events, storing details for each one in the `eventList`. 

You can also see the overall count of breakeven events with the `totalEvents` property. Think of it as a way to understand how frequently your strategy reaches a breakeven state.


## Interface BreakevenEvent

This data structure holds all the key information about when a trading signal hits its breakeven point. It’s designed to make creating reports and analyzing performance easier. 

You’ll find details like the exact time it happened, the trading pair involved, the name of the strategy used, and the signal's unique ID. 

It also includes crucial price points: the entry price, the take profit target, and the stop loss level, along with their original values when the signal was first created.

If the strategy used dollar-cost averaging (DCA), you'll see information about the number of entries and partial closes. It tracks how much profit has been made so far and provides a human-readable explanation of the signal. Finally, it indicates whether the trade occurred in backtest or live mode and when it was first created and became active.

## Interface BreakevenContract

This object represents a specific event: when a trading signal's stop-loss order has moved back to the original entry price, essentially eliminating the initial risk. It's a signal that the strategy is reducing its risk, a positive milestone.

Each event includes details like the trading symbol (e.g., BTCUSDT), the name of the strategy that generated the signal, and the exchange and frame used. You'll also find all the original data associated with that signal, along with the current market price at the time of the event, and whether it originated from a backtest or live trading. The timestamp helps pinpoint exactly when this breakeven event happened, either at the moment it occurred in live trading or at the specific historical candle during a backtest.

## Interface BreakevenCommitNotification

This notification lets you know when a breakeven point has been reached and acted upon in a trade. It provides a comprehensive snapshot of the trade's performance up to that point.

Here's what you'll find in this notification:

*   **Identification:** A unique ID, timestamp, and whether it's from a backtest or live trading.
*   **Trade Details:** The symbol being traded, the strategy used, the exchange involved, and a unique signal identifier.
*   **Price Information:** Key prices like the current market price, the entry price, and any take profit or stop-loss levels (both original and adjusted for trailing).
*   **DCA and Partial Closings:** Details about any dollar-cost averaging (DCA) used, the total number of entries, and any partial position closures.
*   **Performance Metrics:**
    *   Total profit and loss (PNL) including all entries and partials.
    *   Peak profit and maximum drawdown, along with the prices and PNL at those points.
    *   Percentage-based profit/loss and related metrics.
*   **Additional Information:** A note providing context or explanation for the signal, along with timestamps for signal creation, pending status, and notification creation.



It’s designed to offer a complete record of a breakeven event, including how the trade performed leading up to it.

## Interface BreakevenCommit

This event signifies that a breakeven adjustment has been triggered for a trading position. It provides detailed information about the position's performance and price levels at the time of the adjustment. You’ll find key data points like the current market price and the overall profit/loss (PNL) achieved up to this point. 

The event also includes metrics reflecting the position’s journey – the highest profit attained (peakProfit) and the largest drawdown. The trade direction (long or short) is clearly indicated, along with the original entry price and the prices for take profit and stop loss, as well as their adjusted values if trailing stops were used.

Timestamps are included for when the signal was created and when the position initially activated, giving you a timeline of the trading event. The `action` property confirms that the event type is a breakeven.

## Interface BreakevenAvailableNotification

This notification signals that your trading position's stop-loss can now be moved to your entry price, essentially reaching a breakeven point. It provides a wealth of information about the trade, including a unique ID, the exact time this opportunity arose, and whether it's happening in a backtest or live environment.

You’ll find details on the trading pair involved (like BTCUSDT), the strategy that generated the signal, and the exchange being used. The notification also provides a snapshot of the current market price, the initial entry price, and the trade direction (long or short).

Beyond the basics, you get insights into the position's performance, like peak profit, maximum drawdown, and overall profit/loss, complete with percentages and associated prices.  It even breaks down details like slippage and fees that influenced the position's financial performance. Finally, there’s an optional note field that could offer a human-readable explanation for why the signal was generated.

## Interface BeforeStartContract

This event signals the start of a new trading simulation or live trading session for a specific asset. Think of it as a preparation signal before the strategy begins analyzing data and potentially placing trades. It's a guaranteed checkpoint – if this event happens, you're guaranteed to receive a corresponding event marking the end of that trading period.

You can use this event to set up essential tasks, such as initializing log files, resetting counters that track performance, or sending notifications that the trading run has begun. It fires only once at the very beginning of each run, before any trading signals are generated.

The information provided includes the trading symbol, the name of the strategy being used, the exchange providing data, the timeframe (if applicable), and whether it’s a backtest or live run. A current price and a timestamp are also included for convenience, allowing you to avoid additional queries or date manipulations. Remember that in backtest mode, the timestamp indicates the intended start time, while in live mode it represents the actual current time.

## Interface BacktestStatisticsModel

This model provides a detailed breakdown of your backtesting results, offering a comprehensive view of your strategy's performance. It contains a wealth of data, from individual trade details to overall statistical summaries. You'll find information on the number of winning and losing trades, win rate, average profit and loss, and various risk-adjusted return metrics like Sharpe and Sortino ratios. 

It also digs into the specifics of trade duration, drawdown, and consecutive win/loss streaks. Furthermore, it analyzes market pressure and trend characteristics, indicating whether buyers or sellers are dominating and the strength of the underlying trend. Many of these values will be null if the calculation isn't reliable due to data inconsistencies. 

The `signalList` property gives you access to the raw data for each closed trade, allowing for granular analysis. Analyzing these metrics will help you understand your strategy's strengths and weaknesses and how it behaves under different market conditions.

## Interface AverageBuyCommitNotification

This notification signals that a new portion of your dollar-cost averaging (DCA) strategy has been executed. It provides a wealth of information about this specific averaging entry, including when it happened, whether it's from a backtest or live trading, and the trading pair involved. You'll find details like the current price, total cost, and how the averaged entry price changes your overall position.

The notification also contains a comprehensive overview of the entire position, including the total number of averaging entries and partial closes, the current position direction (long or short), and vital performance metrics like peak profit, maximum drawdown, and profit/loss percentages, all calculated up to this point. Furthermore, it offers insight into the original signal parameters, slippage and fee adjustments, and even a human-readable note explaining the reason behind the signal. Finally, timestamps provide a record of the signal’s lifecycle, from initial creation to its active pending state.

## Interface AverageBuyCommit

This interface represents an average-buy event, which happens when a new buy order is placed to gradually lower the average entry price of a position.

It provides details about the event, including the price at which the new averaging buy was executed, the cost of that buy, and the updated effective (averaged) entry price. 

You'll also find information about the current profit and loss (PNL), the highest profit achieved, and the maximum drawdown experienced by the position so far.

The interface includes the original entry price, the current take profit and stop loss prices (which might have been adjusted through trailing), the original take profit and stop loss prices, and timestamps related to the signal's scheduling and activation. It clarifies the trade direction (long or short) to ensure clarity on the position being managed.

## Interface AfterEndContract

This interface signals the end of a trading strategy's execution, whether it finished normally, encountered an error, or was stopped prematurely. It’s designed to ensure certain cleanup tasks happen reliably once per run, like flushing data buffers or sending notifications.

You'll receive this event paired with a `BeforeStartContract` event for the same run, and these events are guaranteed to always be matched. The `when` property tells you precisely when the strategy finished: in backtesting, it's the time of the last processed candle, or the frame’s start date if nothing was processed; in live trading, it's the current time rounded to the nearest minute.

The event also provides essential details like the trading symbol (`symbol`), the strategy's name (`strategyName`), the data source (`exchangeName`), and the timeframe used (`frameName`). You'll also find out if the run was a backtest (`backtest`) and a convenient average price (`currentPrice`) to avoid needing to fetch it from the exchange yourself. Finally, `timestamp` offers the same time information as `when` but as a simple number for easy logging or communication.

## Interface ActivePingContract

The ActivePingContract defines a way to receive updates about active, pending signals within your trading strategies. Think of it as a heartbeat signal, sent every minute while a pending signal is still open.

This allows you to track the lifecycle of your signals and build custom logic to manage them. For example, you might want to adjust stop-loss orders or dynamically adjust parameters based on price movement.

Each ping event contains key information:

*   The trading pair (symbol) involved, like BTCUSDT.
*   The name of the strategy that created the signal.
*   The exchange where the signal is active.
*   The timeframe or date range being analyzed (or empty if it’s live trading).
*   All the original data of the pending signal itself, including entry price, stop-loss, and take-profit levels.
*   The current market price at the time of the ping.
*   Whether the signal is from a backtest or live trading.
*   A timestamp indicating when the ping occurred, reflecting either the live trading moment or the historical candle being processed.

You can listen for these pings to react to changes in your active signals and implement custom management strategies.

## Interface ActivateScheduledCommitNotification

This notification tells you when a scheduled trading signal has been activated, meaning the system has begun executing the trade. It provides a wealth of information about the trade, including a unique identifier, the exact time it was activated, and whether it's happening in a simulated backtest or live trading environment.

You'll find details about the specific trading strategy, the exchange it's using, and the trade direction (long or short). The notification also includes the entry price, take profit, and stop-loss levels, as well as how they might have been adjusted.

Beyond the basic trade details, you'll get performance metrics like potential profit and loss (both in absolute and percentage terms), peak profit achieved, and maximum drawdown experienced. Several other details about the trade lifecycle, such as when it was originally scheduled, when it entered a pending state, and how many entries or partial closes were involved, are also included. Finally, there's space for an optional note explaining why the signal was activated.

## Interface ActivateScheduledCommit

This describes what happens when a previously scheduled signal is now being put into action. It essentially tells you the details of that activation event.

You'll find information about why the signal was activated – it's specifically marked as an "activate-scheduled" action. There's also an optional identifier that might have been provided by the user to explain *why* they chose to activate it.

The data includes key performance metrics like total profit and loss (PNL), the highest profit achieved, and the maximum drawdown experienced by this trade. You'll also see the direction of the trade (long or short), the entry price, and both the final take profit and stop loss prices, as well as the initial values before any adjustments were made.

Finally, it records the timestamps—when the signal was initially created and when it actually started to be executed.
