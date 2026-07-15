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

The WalkerStopContract is a notification that gets sent when a walker is being stopped. Think of it as a signal that a trading process is being interrupted. 

It includes information about which trading symbol is affected, the specific strategy that needs to be halted, and the name of the walker itself. This is important because you might have several different automated trading setups running at once, and this contract helps you pinpoint exactly which one is being stopped. It's like a targeted message saying "stop this specific strategy, running under this walker, on this symbol."

## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps organize and present the results of your backtesting experiments. Think of it as a container holding information about how different trading strategies performed.

It takes the core data from a standard backtest result and adds extra information to compare strategies against each other.

Specifically, it includes a list of strategy results, which details the performance metrics for each strategy you tested. This list lets you easily see how each strategy stacked up.

## Interface WalkerContract

The WalkerContract represents updates during the backtesting comparison process. Imagine it as a notification sent when a particular strategy finishes its test run and its results are assessed. 

Each notification contains details like the walker’s name, the exchange, the timeframe being used, and the symbol being tested.  You'll also find the name of the strategy that just finished, its performance statistics, and the value of the metric being optimized for that strategy.

Importantly, the notification also includes the current best metric value seen among all tested strategies so far, along with the name of that top-performing strategy, plus how many strategies have been tested and how many are left. It provides a running tally of the comparison’s progress.

## Interface WalkerCompleteContract

This interface describes the final notification you receive after a complete backtesting run using the Walker system. It bundles together all the important information about the test. 

You’ll find details like the name of the Walker, the symbol being traded, and the exchange and timeframe used for the backtest.

Crucially, it includes the metric used for optimization, the total number of strategies tested, and identifies the best-performing strategy. 

The notification also delivers the best metric value achieved and comprehensive statistics for that top-performing strategy, giving you a full picture of the results.

## Interface ValidationErrorNotification

This notification signals that a validation error occurred during the backtesting process. 

It happens when the risk validation functions encounter problems and raise errors. 

Each notification includes a unique identifier, a detailed error object that contains stack trace information, and a user-friendly message explaining the validation issue. 

Importantly, the `backtest` property will always be false because these errors originate from the live context, not directly from the backtest simulation itself.

## Interface ValidateArgs

This interface, `ValidateArgs`, helps ensure the names you use for different parts of your backtesting setup are correct. Think of it as a safety net – it’s used internally to check that your exchange, timeframe, strategy, risk profile, action, sizing, and walker names match what the system knows. 

Each property within `ValidateArgs` represents one of these names.  For example, `ExchangeName` holds an enum that validates the name of the exchange you're using.  All the properties work similarly to make sure everything aligns and to prevent errors caused by typos or incorrect names. This makes your backtests more reliable.


## Interface TrailingTakeCommitNotification

This notification tells you when a trailing take profit order has been executed. It's a signal that a trade is closing based on a trailing stop-loss.

The notification includes a unique identifier, the time it happened, and whether it's from a backtest or a live trade. You'll find details about the trading pair, the strategy involved, and the exchange used.

It provides a comprehensive snapshot of the trade, including the original and adjusted take profit and stop-loss prices, entry price, and the number of entries and partial closes.

You'll also see key performance metrics like profit and loss (both absolute and percentage), peak profit, and maximum drawdown. The notification also includes details about the signal, like the percent shift and any notes about why the signal was triggered. Finally, you get timestamps showing when the signal was created, became pending, and when this specific notification was generated.

## Interface TrailingTakeCommit

This describes a trailing take profit event within the backtest-kit framework. It's essentially a notification triggered when a trailing stop mechanism adjusts the take profit level of a trade.

The event includes details about the trade itself, such as whether it's a long or short position, the original entry price, and the current market price at the time of the adjustment.

You'll find information on the adjusted take profit and stop-loss prices, as well as their original values before any trailing modifications.

Crucially, it also provides performance metrics for the position, including the total profit and loss (pnl), the highest profit achieved (peak profit), and the maximum drawdown experienced.

Finally, timestamps indicate when the signal was created and when the position was activated.

## Interface TrailingStopCommitNotification

This notification details when a trailing stop order has been triggered and executed. It provides a wealth of information about the trade, including a unique identifier, the exact time it happened, and whether it occurred during a backtest or live trading. You'll find details about the trading pair involved, the strategy that initiated the signal, and the exchange used.

The notification includes crucial pricing information like the entry price, stop-loss and take-profit levels, both original and adjusted for trailing. It also breaks down the position details, indicating whether it was a long or short trade, and the number of entries and partial closes involved. 

Beyond the basics, you get a full picture of the position's performance, including the total profit and loss, peak profit achieved, maximum drawdown, and associated prices and percentages. Additional fields offer context such as a human-readable note, scheduling and pending timestamps, and when the notification itself was created. This comprehensive data allows for detailed analysis of trailing stop effectiveness and overall trading strategy performance.

## Interface TrailingStopCommit

This data represents a trailing stop event, indicating a change in your trading strategy based on price movement. It contains details about the adjustment made to your stop-loss price.

The `action` property confirms that this event is specifically a trailing stop action. 

You'll find the `percentShift`, which shows how much the stop loss was adjusted based on a percentage. The `currentPrice` tells you the market price at the time of that adjustment.

For performance tracking, you’ll see the `pnl` (profit and loss) of the closed position, `peakProfit` (the highest profit point reached), and `maxDrawdown` (the biggest loss experienced). 

The `position` property clarifies whether it's a long (buy) or short (sell) trade. You can access the `priceOpen` (the initial entry price), the `priceTakeProfit` (the current take profit price, potentially adjusted), and the `priceStopLoss` (the updated stop-loss price). 

Importantly, `originalPriceTakeProfit` and `originalPriceStopLoss` preserve the initial values before any trailing modifications. Finally, `scheduledAt` and `pendingAt` timestamps give you the exact moments of creation and activation of the position.

## Interface TickEvent

This describes a standardized event object used to track what's happening in your trading system. Think of it as a single place to find all the important details about a trade, regardless of whether it's being scheduled, opened, closed, or something else.

Each event includes a timestamp and an `action` type to clearly indicate what occurred. You’ll find key information like the trading symbol, a signal identifier, and position type for most events.

For trades that are actively running, you'll also get information about things like take profit and stop loss prices, how much capital is invested, progress toward those targets, and unrealized profit/loss. Closed trades will have realized PNL and duration.  If a trade is cancelled, there's a reason provided. Finally, you'll find metrics like peak and fall PNL, giving insight into the position's performance. The `totalEntries` and `totalPartials` fields help track DCA (Dollar-Cost Averaging) details.

## Interface SyncStatisticsModel

This model helps you understand how your trading signals are syncing with the system. It provides a collection of individual sync events, giving you detailed information about each one. You can also get a simple count of all sync events, as well as the number of times a signal was opened and closed, which is useful for monitoring signal lifecycle. Essentially, it’s a report card for your signal synchronization process.

## Interface SyncEvent

The `SyncEvent` object is a central piece of information about what's happening during a trading signal’s lifecycle. It packages all the key details – like when the event occurred, which trading pair was involved, the strategy and exchange used, and crucially, *what* action took place.

You'll find specifics like the signal's unique ID, the direction of the trade (long or short), entry and exit prices (take profit and stop loss), and even how those prices have been adjusted along the way. 

It also tracks important performance metrics like total profit and loss (PNL), peak profit, and maximum drawdown, along with when the signal was initially created and when the position became active. 

For signals that were closed, the `closeReason` property explains why. A flag indicates whether the event relates to a backtest. Finally, a timestamp provides when the event itself was recorded. This comprehensive data is designed to be useful for generating clear and informative reports.

## Interface StrategyStatisticsModel

This model holds statistics about your trading strategy's performance, gathered from the events it generates. 

Think of it as a detailed log of what your strategy is doing. 

You'll find a list of every event that occurred, along with totals for various actions like canceling orders, closing positions, taking partial profits or losses, using trailing stops, setting breakeven points, and executing average buy (DCA) strategies. It's a good way to understand the behavior of your strategy and identify potential areas for optimization.


## Interface StrategyEvent

The `StrategyEvent` object holds all the important details about what's happening during a trade, whether it's a backtest or a live execution. It's designed to provide a complete picture of a strategy's actions, from initial signals to closing positions.

Each event includes information like the exact time it happened (`timestamp`), which trading pair was involved (`symbol`), the name of the strategy used, and the exchange and timeframe being utilized. You’ll find specifics on the signal that triggered the action (`signalId`), the type of action taken (`action`), and the current market price at the time.

For profit-taking or loss-limiting actions, the `percentToClose`, `percentShift` (for trailing stops/take profits), and original/effective prices are all recorded. If an action was scheduled or pending, unique IDs (`cancelId`, `closeId`, `activateId`) are provided.

The event also notes whether it's a backtest (`backtest`) or live trade, the trade direction (`position`), and key pricing details like entry price (`priceOpen`), take profit (`priceTakeProfit`), and stop loss (`priceStopLoss`).  For strategies employing dollar-cost averaging (DCA), you'll also see data on entry counts, total entries, and associated costs. Finally, profit and loss data (`pnl`) and a potentially helpful note are included for a comprehensive record of each event.


## Interface SignalScheduledNotification

This notification tells you when a trading signal has been planned for future execution. It’s like a heads-up that a trade is about to happen.

Each notification has a unique identifier, a timestamp indicating when the signal was scheduled, and a flag to specify whether it's from a backtest or live trading environment. It also includes crucial details like the trading pair (symbol), the strategy that generated the signal, and the exchange it's intended for.

You’ll find information about the trade itself: the direction (long or short), target entry price, take profit, and stop-loss levels. It also provides the original prices before any adjustments like trailing stops.

The notification includes details about the trade’s financial aspects like the cost, potential profit and loss (PNL), peak profit achieved, and maximum drawdown experienced. You’ll also get performance metrics like profit/loss percentage and entry/exit prices for PNL calculations. Finally, it provides a current market price and an optional note that explains the reason behind the signal.

## Interface SignalOpenedNotification

This notification tells you when a new trading position has been opened, whether it's part of a backtest or a live trade. It provides a wealth of details about the trade, including a unique identifier, the exact time it was opened, and whether it was a long (buy) or short (sell) position.  You'll find information about the exchange used, the signal that triggered the trade, and the prices involved – entry, take profit, and stop loss, along with their original values before any adjustments.

The notification also gives you comprehensive profit and loss (PNL) data for the position, including peak profit, maximum drawdown, and the prices at which those extremes were reached.  If the position used dollar-cost averaging (DCA), you can see how many entries were made. 

Finally, the notification includes optional notes explaining the reasoning behind the trade and timestamps related to its creation and pending status.  It's like a complete report card for a newly opened trade, perfect for tracking performance and understanding trading decisions.

## Interface SignalInfoNotification

This notification type provides detailed information when a trading strategy sends out a custom informational message about an active trade. It’s like getting a status update directly from your strategy, letting you know what's happening with a specific position.

The notification includes a unique ID and timestamp, along with essential details such as the trading symbol, the strategy's name, and the exchange where the trade occurred. You’ll also find important data points like the entry price, take profit and stop loss levels, and information about any DCA (Dollar Cost Averaging) or partial closes that have been executed.

Furthermore, it shares performance metrics like total profit/loss (both absolute and percentage), peak profit, and maximum drawdown, along with the specific prices at which these metrics were achieved. A user-defined note allows the strategy to communicate a custom message.  Finally, scheduling and pending timestamps help track the signal’s lifecycle, from initial creation to when the position became active.

## Interface SignalInfoContract

This interface defines the structure of messages a trading strategy can send out to let you know about important information related to its actions. Think of it as a way for strategies to "shout" out details about open positions, like what trading pair it's involved in (symbol), which strategy created it, and the exchange and frame used.

You'll find details like the original prices, the current market price at the time of the event, and any custom notes or identifiers the strategy added.  The `backtest` flag tells you if the message is coming from a historical simulation or live trading, and the `timestamp` provides a precise record of when the event occurred, synchronized to the candle in backtest mode. It's a powerful way to monitor strategy behavior, add custom annotations, or push notifications to external systems.

## Interface SignalEventContract

This interface defines how the backtest-kit framework communicates about the opening and closing of pending trading positions. Think of it as a notification system – it allows you to be informed about when a position is about to be or has been entered or exited, without needing to constantly monitor all signal data. 

It covers all the ways a position can be initiated (like a new signal, an immediate order, or a scheduled action) and all the ways it can be closed (like hitting a take-profit or stop-loss, or a user manually closing it). You can subscribe to these events to build custom user interfaces or automate actions based on position lifecycle changes.

The events provide key details about the position, including the trading symbol, the name of the strategy that generated the signal, the exchange being used, and the timeframe being considered. You'll also get the complete data related to the signal, including entry and exit prices, potential profit and loss, and importantly, the reason *why* a position closed if it’s a closing event. A current market price is included for both opening and closing events. Finally, there's a flag to indicate whether the event happened during a backtest or live trading session, as well as a timestamp for precise timing.

## Interface SignalData$1

This object holds all the critical details about a completed trading signal, specifically for calculating and analyzing performance. It tells you which strategy created the signal, provides a unique identifier for it, and specifies the symbol being traded. You’ll find details like whether it was a long or short position, the percentage profit or loss (PNL), and the reason the signal was closed. Finally, it records the exact times the signal was opened and closed, allowing for precise performance tracking over time.

## Interface SignalCommitBase

This interface defines the common information found in every signal commitment event, whether it's happening during a backtest or a live trade. Each event will tell you which trading pair is involved (symbol) and the name of the strategy that created the signal. It also specifies the exchange used and the timeframe if the signal originates from a backtest.

You'll get a unique ID for the signal itself (signalId), the exact time it occurred (timestamp), and details about any DCA averaging or partial closes that have taken place. The original entry price, the signal data at the moment of commitment, and an optional note describing the signal's reason are also included. 

Essentially, it's a standardized package of information for tracking each signal commitment in your trading system.

## Interface SignalClosedNotification

This notification tells you when a trading position has been closed, whether it was stopped out by a stop-loss, hit a take-profit target, or expired. It’s packed with details about the trade, including the unique identifier of the signal, when it closed, and whether it occurred during a backtest or live trading.

You’ll find key information such as the symbol traded (like BTCUSDT), the strategy that generated the signal, and the entry and exit prices. It also provides a breakdown of the position's performance, including profit/loss percentages, peak profit, and maximum drawdown – letting you understand how the trade performed throughout its lifecycle. 

The notification also includes details about how the position was managed, like the number of entries and partial closes, as well as original prices and durations. Finally, a note field allows for optional human-readable explanations regarding the signal's closure.

## Interface SignalCancelledNotification

This notification tells you when a scheduled trading signal was cancelled before it could be activated. It provides a lot of detail about the signal and the circumstances of its cancellation.

You’ll find information like a unique identifier for the notification, the exact time it was cancelled, and whether the cancellation happened during a backtest or live trading. The notification also includes details about the trading strategy involved, the symbol being traded (like BTCUSDT), and the intended trade direction (long or short).

It also holds key information about the trade itself: the take profit and stop loss prices, the intended entry price, and even the original prices before any adjustments were made. You’ll see how many DCA entries were planned and if any partial closes were executed. Crucially, it explains *why* the signal was cancelled - whether it was due to a timeout, price rejection, or a manual user action. There's even a chance to see a custom note explaining the reason behind the signal. Finally, you can check the signal creation, pending, and creation timestamps to understand the signal's lifecycle.

## Interface Signal

The `Signal` object holds important information about a trading position. 

It tracks the initial entry price using the `priceOpen` property.

Internally, it keeps a record of all entry events within the position through the `_entry` array. Each entry includes the price, cost, and timestamp of that specific entry.

The `_partial` array logs any partial exits from the position, noting the type (profit or loss), percentage, current price, cost basis at the time of exit, the entry count at that time, and the timestamp of the partial exit.

## Interface Signal$2

This `Signal` object holds information about a trading position.

It tracks the initial entry price, which is the `priceOpen` you used to get into the trade.

You'll also find a record of all entry events – the `_entry` array – detailing the price, cost, and time for each entry.

Finally, it keeps track of any partial exits you've taken, including the type of exit (profit or loss), percentage, price, cost basis, entry count, and timestamp for each.

## Interface Signal$1

This `Signal` object keeps track of information related to a specific trading signal. It contains the opening price used for the trade, which is essential for calculating profits and losses.

It also stores a history of entry events, detailing the price, cost, and timestamp for each entry made into the position.

Finally, it tracks partial exits, recording details like whether the exit was for profit or loss, the percentage change, current price, cost basis, number of shares closed, and the timestamp of the exit.

## Interface ScheduledEvent

This data structure holds all the key information about trading events like when a trade was scheduled, opened, or cancelled. It's designed to give you a complete picture for analyzing your backtesting results.

You'll find details like the exact time of the event, the trading pair involved (symbol), a unique signal ID, and the type of position taken. It includes essential pricing data like the entry price, take profit, stop loss, and original prices before any adjustments.

If you used DCA (Dollar-Cost Averaging), it tracks the number of entries and partial closes. Profit and loss information (pnl) is also included, along with timing details and, for cancellations, the reason and a unique ID if a user initiated it. Finally, you can access when a position became active or when a signal was initially created.

## Interface ScheduleStatisticsModel

This model holds statistics about scheduled signals, offering insights into how they're managed over time. 

It gives you a complete picture of signal activity, tracking everything from when a signal is scheduled to when it's opened or cancelled. 

You'll find key figures like the total number of signals scheduled, opened, and cancelled, alongside overall event counts.

It also calculates important performance indicators such as cancellation and activation rates, expressed as percentages, to assess the efficiency of your scheduling process.

Finally, the model provides average waiting times for both cancelled and opened signals, helping you identify potential delays or bottlenecks.

## Interface SchedulePingContract

This interface describes the data you receive when tracking a scheduled signal – essentially, a regular "ping" to let you know the signal is active and being monitored. These pings happen roughly every minute while the signal is running, providing a stream of information about its status.

You'll get details like the trading symbol (e.g., BTCUSDT), the name of the strategy involved, and the exchange being used. A `frameName` indicates the timeframe being analyzed; this will be empty during live trading.

The most important part is the `data` property, which contains all the information about the scheduled signal itself, including its ID, position size, and stop-loss levels. The `currentPrice` gives you the current market price at the time of the ping, which is crucial if you want to build custom logic to manage your signals, like automatically canceling them under certain price conditions.

Finally, the `backtest` flag tells you whether the data is coming from a historical simulation or real-time trading, and `timestamp` provides a record of when the ping occurred – either the exact time in live mode or the candle timestamp in backtest mode. This allows you to build custom monitoring and cancellation logic based on the ping events.

## Interface ScheduleEventContract

This contract lets you keep track of signals that are scheduled for execution but haven't actually started trading yet. You can use it to know when a signal is added to the schedule or when it's removed.

It’s useful for monitoring the lifecycle of signals without needing to follow all the regular signal activity.

It's important to understand this *doesn't* track when a scheduled signal actually starts trading; that’s handled elsewhere. Instead, it focuses on the signal's journey from being scheduled to potentially being canceled.

Here’s a breakdown of what information you get with each event:

*   **action**: Tells you whether a new signal was scheduled or an existing one was cancelled.
*   **symbol**: Identifies the trading pair involved (e.g., BTCUSDT).
*   **strategyName**: The name of the trading strategy that created the signal.
*   **exchangeName**: The exchange where the signal originates.
*   **frameName**: The timeframe or date range associated with the signal.
*   **data**: Contains all the details of the signal itself, like its ID, price targets, and position size.
*   **reason**: If a signal is cancelled, this tells you *why* (e.g., timeout, price reject, or user cancellation). It’s only available when the action is “cancelled”.
*   **currentPrice**: The current market price when the event happened.
*   **backtest**: Indicates whether the event occurred during a backtest or live trading.
*   **timestamp**: The precise time of the event, based on either the tick time (live) or the candle timestamp (backtest).

You can listen for these events using `listenScheduleEvent()` or `listenScheduleEventOnce()`.

## Interface RiskStatisticsModel

This model holds information about risk rejections, helping you understand where and why risks are being triggered. 

It collects data about each individual risk event, giving you a detailed history. 

You'll find the total count of risk rejections, as well as a breakdown of those rejections organized by the symbols involved and the strategies employed. This allows you to pinpoint areas needing attention in your trading system.


## Interface RiskRejectionNotification

This notification tells you when a trading signal was blocked by your risk management rules. It provides detailed information about why the signal wasn't executed.

Each notification has a unique ID and timestamp, indicating when the rejection happened. You’ll find details like the strategy name, the exchange involved, and a clear explanation of the rejection reason.

The notification also includes technical information like whether it's from a backtest or live environment, the trading symbol, and current market price. 

For a full picture, you’ll see the number of currently open positions, the intended trade direction (long or short), and the planned take profit and stop-loss prices. Optionally, a signal ID, the estimated duration, and a description of the signal’s reason can be provided too.

## Interface RiskEvent

This data structure holds information about situations where a trading signal was blocked due to risk management rules. Each `RiskEvent` represents a specific instance where a signal couldn't be executed.

It includes details like when the event happened (`timestamp`), the trading pair involved (`symbol`), the signal itself (`currentSignal`), and the name of the strategy that generated it. 

You'll also find the exchange and time frame, the current price, and how many positions were already open when the signal was rejected. 

A unique ID (`rejectionId`) helps track individual rejections, and a note (`rejectionNote`) explains why the signal was rejected. Finally, it indicates whether the event occurred during a backtest or a live trading session.

## Interface RiskContract

The RiskContract represents a signal that was blocked due to risk management checks. It's used to keep track of when and why signals are rejected because of risk limits, not just when signals are generally generated.

Think of it as a log of the times the system prevented a trade from happening because it was deemed too risky.

Here's what information you'll find about each rejected signal:

*   The trading pair involved (symbol), like "BTCUSDT."
*   The details of the signal itself (currentSignal).
*   The name of the strategy that tried to create the signal.
*   The timeframe used during the backtest (frameName).
*   The exchange involved (exchangeName).
*   The price at the time of rejection (currentPrice).
*   The total number of active positions at the time (activePositionCount).
*   A unique ID for this specific rejection (rejectionId).
*   A description of why the signal was rejected (rejectionNote).
*   The timestamp marking when the rejection occurred.
*   Whether the rejection happened during a backtest or live trading (backtest).

This information is used by services like risk reporting tools and by users who want to monitor risk events.

## Interface ProgressWalkerContract

This interface helps you keep an eye on how a backtest walker is doing. 

It provides information about the walker’s name, the exchange being used, and the frame it’s working with. 

You'll also get details like the total number of trading strategies being analyzed, how many have already been processed, and a percentage representing how far along the process is – ranging from 0% to 100%. Think of it as a progress report during a lengthy backtesting run.

## Interface ProgressBacktestContract

This contract provides updates on the backtesting process. As a backtest runs, you’ll receive these events to monitor its progress. 

Each update includes details like the exchange and strategy being used, the trading symbol, and how many historical data points (frames) have been processed out of the total. You'll also get a percentage indicating how much of the backtest is complete, allowing you to track its overall advancement.


## Interface PerformanceStatisticsModel

This model holds all the performance statistics collected during a backtest, grouped by the strategy that generated them. You'll find the strategy's name here, along with the total number of performance events that were tracked and the overall time it took to calculate those statistics. 

The `metricStats` property lets you drill down into performance details, broken down by the type of metric being measured. 

Finally, the `events` array contains all the individual performance data points, providing the complete, raw information used to generate the summarized statistics.

## Interface PerformanceContract

The PerformanceContract helps you monitor how quickly and efficiently different parts of your trading system are running. It's like a digital stopwatch, recording how long various tasks take, like executing orders or calculating indicators.

Each recorded event, or "metric," includes details like when it happened, how long the task took, which strategy and exchange were involved, and whether it was part of a backtest or live trading. This information lets you pinpoint slow areas in your system – perhaps a particular strategy or a connection to a specific exchange – so you can optimize performance. Think of it as a way to find and fix bottlenecks to make your trading run smoother and faster. The `frameName` will be empty if you're not using a frame.

## Interface PartialStatisticsModel

This model holds key statistics about partial profit and loss events during a backtest. 

It gives you a breakdown of how many times profit and loss milestones were reached, along with the total number of events.

You'll find a list of all the individual events, including all their details, stored in the eventList property. TotalEvents simply tells you how many profit and loss events occurred overall. TotalProfit and TotalLoss give you the counts for each type of event individually.

## Interface PartialProfitContract

The `PartialProfitContract` represents a signal achieving a profit milestone during trading. It's like a notification saying "Hey, this trade has reached 10%, 20%, or another percentage of profit!".

These notifications, or events, are sent out as a signal progresses and hits these predefined profit levels – think of them as checkpoints along the way to a full take-profit.

You'll find details about the trading symbol, which strategy generated the signal, the exchange and frame it’s running on, and all the original data associated with the signal itself.

The `currentPrice` tells you the price at which that profit level was actually reached, while the `level` property clearly indicates the percentage (10%, 20%, etc.).

The `backtest` flag tells you if this event happened during a simulated historical test or a live trade. Finally, there's a timestamp indicating precisely *when* this profit level was detected – either the real-time moment for live trades or the timestamp of the historical candle that triggered the event.

These events are used by services like the `PartialMarkdownService` to build reports and also allow you to set up callbacks to monitor strategy progress directly.

## Interface PartialProfitCommitNotification

This notification tells you when a partial profit target has been hit during a trade. It’s like getting a little report card on a piece of your position being closed out. You'll see key details like the unique identifier of the notification, exactly when it happened (down to the millisecond), and whether it's a backtest or a real-time trade.

The notification also provides a wealth of information about the trade itself, including the trading pair, the strategy that triggered it, and the exchange involved. You can trace back the signal, see the entry price, the original take profit and stop-loss levels, and understand how any trailing adjustments have affected those prices.

Beyond the basics, you’ll get a comprehensive view of the trade's performance – total profit and loss (both in USD and as a percentage), peak profit achieved, maximum drawdown experienced, and even details about the individual entries and partial closes. This makes it easy to analyze how the strategy is performing and understand its risk profile. There’s also an optional "note" field which provides some context about why the signal was triggered. Finally, timestamps track signal scheduling, pending state, and the creation of this specific notification.

## Interface PartialProfitCommit

This event signifies a partial profit-taking action within a trading strategy. It details the specifics of how much of the position is being closed, represented as a percentage. Alongside this, you'll find the current market price when the action was triggered, along with a breakdown of the position's performance.

The data includes the total profit and loss (pnl) for the closed portion, as well as important metrics like the peak profit and maximum drawdown experienced by the entire position. It also provides information about the original entry price, stop-loss and take-profit levels, both as they were initially set and as they are currently adjusted.

Finally, timestamps are provided to indicate when the signal was generated and when the position was activated. This comprehensive set of information allows for a detailed analysis of the strategy’s profit-taking behavior and performance.


## Interface PartialProfitAvailableNotification

This notification lets you know when a trading strategy has reached a predefined profit milestone, like 10%, 20%, or 30% gain. It's a signal that things are going well with a trade, whether you're testing a strategy in backtest mode or actively trading live. The notification includes detailed information about the trade – the symbol, the strategy used, and the exchange it was executed on – as well as the entry and take profit/stop loss prices.

You’ll find specifics on the trade's performance, like total profit and loss, peak profit achieved, and maximum drawdown experienced.  It also provides details on the DCA (Dollar Cost Averaging) process, like the number of entries and partial closes. The notification also outlines original pricing data and adjustments made for things like trailing stop losses. This allows a full picture of the trade’s progress and performance.

## Interface PartialLossContract

The `PartialLossContract` describes events that occur when a trading strategy experiences a loss, specifically at predefined milestones like -10%, -20%, and so on. These events are crucial for monitoring a strategy's performance and understanding its drawdown.

Each event provides detailed information, including the trading symbol, the strategy's name, the exchange and frame it’s operating on, and the original signal data. You'll also find the current market price at the time of the loss, the specific loss level reached (e.g., -20%), whether the event originates from a backtest or live trading, and a timestamp of when it happened.

The `PartialLossContract` allows you to track these milestones, enabling services like report generation and allowing users to subscribe to these loss events through callbacks. Note that a single event can represent multiple loss levels triggered during a significant price drop.

## Interface PartialLossCommitNotification

This notification tells you when a portion of a trading position has been closed. It’s like a detailed report card for a partial exit from a trade.

You'll find key information like a unique ID for the notification, when it happened, and whether it occurred during a backtest or live trading. It specifies which trading pair (like BTCUSDT) and strategy were involved, along with the exchange used.

The notification provides a wealth of data about the trade itself: the signal ID, the percentage of the position closed, the current price at the time of the partial close, the trade direction (long or short), the original entry price, and the original stop-loss and take-profit prices.

Crucially, it includes comprehensive performance metrics. You'll get the total Profit and Loss (PNL), the highest profit achieved (peak profit), the largest loss experienced (max drawdown), and their respective prices and costs. You'll also find details about entries, slippage, and fees.  Finally, an optional note can offer extra context about why the partial close was executed.

## Interface PartialLossCommit

This object represents a partial loss event within the backtest framework. It details a situation where a portion of a trading position is being closed.

The `action` property simply identifies this as a partial loss event.

The `percentToClose` tells you what percentage of the position is being closed.  A value of 50 would mean half the position is being closed.

You'll find the `currentPrice` which shows the market price at the moment the partial loss action was triggered.

The `pnl`, `peakProfit`, and `maxDrawdown` properties give you a comprehensive view of the position's performance up to this point, including total profit/loss, the highest profit achieved, and the largest drawdown experienced.

The `position` property specifies whether the original trade was a long (buy) or short (sell) position.

Various price-related properties like `priceOpen`, `priceTakeProfit`, `priceStopLoss`, `originalPriceTakeProfit`, and `originalPriceStopLoss` provide full details about the trade's entry, intended take profit, and stop-loss levels - useful for understanding the trade's parameters and how they evolved.

`scheduledAt` and `pendingAt` timestamps provide a timeline of when the signal was created and when the position was activated.

## Interface PartialLossAvailableNotification

This notification signals that a trading strategy has reached a predefined loss level, like -10%, -20%, or -30% of the initial investment. It’s a way to track potential downside risk within a strategy.

The notification includes a unique ID and timestamp, and tells you whether it's from a backtest or a live trade. It provides key details about the trade: the trading pair (like BTCUSDT), the strategy used, the exchange, a unique signal ID, and the specific loss level triggered.

You'll also find information about the trade itself, like the entry price, the trade direction (long or short), and the current price at the time the level was reached, along with the take profit and stop loss prices. It even includes the original prices before any trailing adjustments.

Further details cover the trade’s history: how many entries were made (important for dollar-cost averaging), how many partial closes have occurred, and the overall profit and loss (including fees), peak profit, and maximum drawdown, all presented in both absolute and percentage terms. There’s also an optional note field for a human-readable explanation of why the signal occurred and timestamps showing when the signal was scheduled, pending, and created.

## Interface PartialEvent

The `PartialEvent` object helps you understand what happened during a trade by bundling together key information about profit and loss milestones. Think of it as a snapshot of a significant moment in a trade. It records details like the exact time, whether it was a profit or loss event, the trading pair involved, the strategy used, and a unique identifier for the signal.

You’ll also find crucial data points such as the current price, the level of profit or loss achieved (like 10%, 20%, etc.), and the original entry, take profit, and stop-loss prices set when the trade began.  If you’re using a dollar-cost averaging (DCA) strategy, it includes details like the total number of entries and the original entry price before averaging.  The `PartialEvent` also tracks the impact of partial closes, the unrealized profit and loss, a human-readable note explaining the signal, and timestamps marking when the position became active and when the signal was scheduled. Finally, it indicates if the trade occurred in backtest or live mode.

## Interface OrderSyncOpenNotification

This notification tells you when a trading position has been opened, either immediately or through a scheduled order. It's essentially a signal that something happened in the trading process, letting you know a position is now active.

The notification provides a wealth of information about this new position, including a unique ID, the timestamp of the event, and whether it occurred during a backtest or live trading. You'll also find details about the trading pair (like BTCUSDT), the strategy that generated the signal, and the exchange where the trade took place.

Crucially, it breaks down the performance metrics of the position: profit and loss (PNL), peak profit, maximum drawdown, and associated prices. It also shares details about entry and exit prices, costs, and the number of entries or partials executed.

Finally, you’ll see information around the order itself: opening price, take profit and stop loss levels, and when the order was scheduled or activated. There's also an optional note field for any additional context about the signal.

## Interface OrderSyncCloseNotification

This notification tells you when a trading signal has been closed, whether it’s from a backtest or a live trade. It provides a lot of details about what happened, including the trading pair, strategy used, and the exchange where the trade was executed. You’ll find the signal's unique identifier, the time it was closed, and whether it was part of a backtest.

The notification also breaks down the profit and loss (PNL) for the trade – including the total profit/loss, peak profit achieved, and maximum drawdown experienced. You get a comprehensive view of the trade's performance, including key prices, costs, and percentages, along with details like entry and exit prices.  It also provides information about how the trade was managed, like the original take profit and stop loss prices, the number of entries and partials involved, and the reason for closure (take profit, stop loss, time expiration, or manual closure). Finally, there’s an optional note field for extra explanation.

## Interface OrderSyncCheckNotification

This notification provides a snapshot of an open trading position, essentially a "health check" pinged from your external order management system. It's used to confirm that the order backing a signal is still active on the exchange, particularly in live trading environments. These checks happen frequently, but are throttled to avoid overwhelming the system – you'll receive a notification roughly every 15 minutes per signal.

The notification contains a wealth of information about the position, including its symbol, strategy name, and the exchange where it's held. You'll see details about the original order, like the entry and stop-loss prices, along with how they've been adjusted by trailing.

It also provides critical performance metrics such as realized and unrealized profit/loss (PNL), peak profit, and maximum drawdown, along with the entry and exit prices used in those calculations. You'll also find information on DCA entries and partial closes if they've occurred. Finally, a note field allows for additional human-readable context around the signal's rationale.

## Interface OrderSyncBase

This describes the common information you'll find in events related to order synchronization within the backtest-kit trading framework. Think of it as a shared foundation for understanding what's happening with your orders.

Each event will tell you what *type* of order is involved – whether it's an active order being managed (like opening, filling, or closing) or a scheduled order initially being placed. It will also specify the trading pair's *symbol*, the *strategyName* that generated the signal, and the *exchangeName* used. 

You’ll also see details like the *frameName* (important for backtesting), whether it’s a *backtest* run or a live trade, and a unique *signalId* for tracking purposes. Finally, the *timestamp* reflects the precise moment of the event, and a full *signal* record provides all the signal data at that time.

## Interface OrderOpenContract

This event, `OrderOpenContract`, lets you know when a limit order has been filled and a position has been opened. It’s especially useful if you’re connecting your trading framework to external systems that need to track order execution, like order management systems or audit logs. 

Think of it as a confirmation that your buy or sell order has been accepted by the exchange. 

The event provides a wealth of information about the trade, including the price at which it was filled (`priceOpen`), the current market price, and performance metrics like profit (`pnl`), peak profit, and maximum drawdown. You’ll also find details about the original take profit and stop loss prices, and how many entries and partial closes were involved. This data helps you understand the position’s history and performance. The `scheduledAt` and `pendingAt` fields indicate when the signal was initially created and when the position was activated, respectively. The `totalEntries` and `totalPartials` fields show you if and how much of your position was averaged or closed early.

## Interface OrderCloseContract

When a trading signal is closed – whether by hitting a take profit or stop loss, expiring, or being manually closed – this event is triggered. It provides a wealth of information about the closed position, designed to help external systems keep track of orders and record financial results. Think of it as a notification saying, "This signal has finished, here's everything you need to know about it."

You'll receive details like the current market price at the time of closure, the total profit and loss (PNL) for the entire trade, and key performance metrics like peak profit and maximum drawdown, which show the highest profit achieved and the largest loss experienced.

The event also includes the initial trade direction (long or short), the effective entry and target prices used for closing, and the original prices before any adjustments like trailing or averaging. It also tells you exactly when the signal was created and when the position was activated. 

Finally, it specifies the reason for the closure, and details the number of times the position was averaged (DCA) and how many partial closes were executed. This allows external systems to accurately reflect the nuances of the trade’s execution.

## Interface OrderCheckContract

The `OrderCheckContract` is a signal sent during live trading to ensure orders are still valid on the exchange. Essentially, it's a periodic check-in to confirm that the orders backing your trading signals are still open and haven't been unexpectedly filled, canceled, or liquidated. This helps the system react gracefully to situations where an order might be missing from the exchange.

There are two main types of checks: "active" for open positions and "schedule" for pending orders awaiting activation.  If the system receives a response indicating the order is missing, it will either close the pending signal or cancel the scheduled signal. 

Importantly, this event is *not* sent during backtesting as there's no actual exchange interaction to query.  It's used by broker adapters and registered actions to stay informed about the status of orders and react accordingly. The data provided includes a wealth of details about the signal, position, pricing, profit/loss information, and historical details like entry and stop-loss prices – all crucial for a complete understanding of the trade's progress.

## Interface MetricStats

`MetricStats` provides a consolidated view of performance data for a particular metric. It bundles information like the number of times a metric was recorded (`count`), how long the total time was spent for that metric (`totalDuration`), and detailed timing statistics. You’ll find averages (`avgDuration`), minimums (`minDuration`), maximums (`maxDuration`), and measures of spread like standard deviation (`stdDev`), and percentiles (95th and 99th – represented as `p95` and `p99`), to understand the distribution of the metric's values. 

For metrics related to event timing, it also captures statistics like `avgWaitTime`, `minWaitTime`, and `maxWaitTime` to show the intervals between events. Essentially, this object is a summary snapshot of how a specific metric is performing.


## Interface MessageModel

The `MessageModel` represents a single message within a conversation with a large language model. Think of it as one turn in the dialogue.

It contains information about who sent the message – whether it's a system instruction, something the user typed, a response from the assistant, or the result of a tool being used.

Each message has text content, and sometimes includes additional details like reasoning steps (if the language model provider exposes them).

If the assistant uses tools, these messages also include a list of `tool_calls`. 

Images can be attached to messages as well and are supported in different formats. When an assistant responds to a specific tool call, a `tool_call_id` identifies which tool call the message is related to.

## Interface MaxDrawdownStatisticsModel

The `MaxDrawdownStatisticsModel` helps you understand and track maximum drawdowns in your trading strategy. 

It provides two key pieces of information:

*   `eventList`: This is a complete record of all the drawdown events that have occurred, presented in chronological order from the most recent to the oldest. Each event contains details about the drawdown.
*   `totalEvents`: This simply tells you how many drawdown events have been recorded overall.

## Interface MaxDrawdownEvent

This object represents a single instance of maximum drawdown experienced during a trade. It contains key details about when the drawdown occurred, which asset was involved, and the specifics of the trade itself. You'll find information like the exact timestamp, the trading symbol, the name of the strategy used, and a unique identifier for the signal. 

The object also details the position taken (long or short), the profit and loss generated, and crucial price points: the initial entry price, take profit level, and stop loss level.  Knowing these values allows for a deep dive into the factors that led to the drawdown. Finally, a flag indicates whether this drawdown event occurred during a backtest simulation.

## Interface MaxDrawdownContract

The `MaxDrawdownContract` provides information when a new maximum drawdown is detected for a trading position. It essentially tells you the worst peak-to-trough loss experienced by a position so far.

This data includes the trading symbol, the current price at the time of the update, and a timestamp. You’ll also find the names of the strategy, exchange, and timeframe being used.

The `signal` property contains data related to the trade itself. A crucial `backtest` flag tells you whether the update originates from a historical simulation (backtest) or live trading.

By tracking this information, you can build systems that react to drawdown events - for example, automatically adjusting stop-loss orders or implementing other risk management techniques. These updates occur whenever a new drawdown level is reached, letting you respond to changes in market conditions and position performance.

## Interface LiveStatisticsModel

This model provides a comprehensive set of statistics derived from your live trading results, giving you detailed insights into your strategy's performance. It tracks everything from the total number of trades and closed signals to more advanced metrics like Sharpe Ratio and Calmar Ratio. 

You can access a full history of events through the `eventList` property. Key performance indicators like win rate, average PNL, and total PNL are readily available to assess profitability. Volatility and risk-adjusted returns are quantified with metrics such as standard deviation, Sharpe Ratio, and Sortino Ratio.

Beyond simple profitability, the model delves into trade durations, consecutive win/loss streaks, and even the pressure from buyers and sellers impacting price movements. Trend analysis, including strength and confidence scores, helps you understand the overall market direction and how your strategy aligns with it. Remember that many of these values can be null if the calculation is unreliable due to factors like insufficient data or unusual market conditions.

## Interface InfoErrorNotification

This component handles notifications about errors that happen while things are running in the background. These aren't critical failures that stop everything, but issues that need attention.

Each notification has a unique identifier (`id`) and a descriptive error message (`message`) to help you understand what went wrong. There’s also a detailed error object (`error`) included, providing a stack trace and extra information. 

Importantly, these notifications always indicate that they originate from a live context, not a backtest (`backtest: false`). The `type` property confirms that it's an informational error notification.

## Interface IdlePingContract

The IdlePingContract represents notifications that occur when a trading strategy isn't actively monitoring any signals. 

Think of it as a heartbeat signal indicating a period of inactivity for a particular strategy.

It provides details like the trading symbol ("BTCUSDT"), the name of the strategy, the exchange it's running on, and whether the activity is part of a backtest or live trading.

You can subscribe to these idle ping events to keep track of your strategy's lifecycle and understand when it's not actively engaged.

The event also includes the current market price and a timestamp, which reflects when the ping occurred—either a live tick or the timestamp of a historical candle during a backtest.


## Interface IWarmCandlesParams

This object defines the settings you use to download and store historical price data. Think of it as preparing the ground for a backtest by ensuring you have the necessary past information. You'll specify which trading pair (like BTCUSDT) and exchange you're interested in, along with the timeframe you need (like 1-minute candles or 4-hour candles). Most importantly, it sets the start and end dates for the historical data you want to retrieve and save for later use in your backtest.

## Interface IWalkerStrategyResult

This interface describes the output you get when evaluating a single trading strategy within a backtesting framework. It holds essential information about that strategy's performance.

You'll find the strategy's name, allowing you to easily identify which strategy the results pertain to.

The `stats` property bundles a comprehensive set of backtesting statistics – things like total return, Sharpe ratio, and maximum drawdown – giving you a detailed view of how the strategy performed.

The `metric` property represents a specific value used for comparing strategies, and it might be null if the strategy wasn't valid for that metric.

Finally, `rank` indicates the strategy's position relative to other strategies being compared – a rank of 1 means it performed the best.

## Interface IWalkerSchema

The Walker Schema lets you set up and manage A/B tests for different trading strategies. 

Think of it as a blueprint for comparing how well various strategies perform against each other. You give it a unique name, a note for your own records, and specify which exchange and timeframe to use for all strategies being tested. 

It tells the system which strategies to compare—making sure they've been previously registered. You can also choose which metric, like Sharpe Ratio, to optimize for.  Finally, optional callbacks let you hook into different stages of the testing process.

## Interface IWalkerResults

The `IWalkerResults` object holds all the information gathered after a test run comparing different trading strategies. It tells you which financial instrument, or symbol, was being analyzed. It also specifies the exchange used for the trading and the name of the testing process, known as the walker. Finally, it identifies the time frame used in the backtest, like minute data or daily bars.

## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you hook into different stages of the backtest process when comparing multiple strategies. 

You can get notified when a specific strategy begins testing, allowing you to log this event or prepare for data collection. 
Once a strategy's backtest finishes, `onStrategyComplete` provides access to key statistics and a metric, giving you a chance to analyze the results. 
If a strategy encounters an error during backtesting, `onStrategyError` will alert you, letting you debug the problem or handle the error gracefully. 
Finally, `onComplete` fires when all the strategies have been run, providing the overall results of the walker process.

## Interface ITrailingTakeCommitRow

This interface represents a queued action for a trailing take commit, essentially a plan to adjust your trade based on a trailing stop-loss. 

It tells the system to execute a "trailing-take" action.

The `percentShift` property defines how much the price needs to move in your favor before the trailing stop is adjusted. This is expressed as a percentage.

Finally, `currentPrice` records the price level when the trailing stop was initially established, providing context for the shift calculation.

## Interface ITrailingStopCommitRow

This interface represents a queued action related to a trailing stop order. Think of it as a record of a pending change to a trailing stop, triggered by a specific event.

It includes the type of action, which will always be "trailing-stop" in this case.  You'll also find the percentage shift that needs to be applied to the stop price, and the price at which the trailing stop was originally established. This information helps ensure the trailing stop is adjusted correctly.

## Interface IStrategyTickResultWaiting

This interface describes a tick result when a trading signal is scheduled but hasn't yet triggered. Think of it as a status update saying, "Hey, I'm waiting for the price to reach a certain point so I can execute this signal."

You'll receive this type of result repeatedly as the price fluctuates while the signal is on hold. It's different from the initial "scheduled" signal, which only happens once when the signal is first created.

The information included allows you to track the details of the waiting signal: the signal itself, the current price being monitored, the strategy and exchange involved, the timeframe being used, the trading symbol, and progress towards take profit and stop loss. It also provides information on any unrealized profit and loss, whether the test is a backtest or live trade, and when the tick result was generated.

## Interface IStrategyTickResultScheduled

This interface describes a special type of result you get during backtesting or live trading when a strategy has scheduled a trade. It means the strategy has generated a signal and is now waiting for the price to reach a specific entry point.

Think of it as a notification that a trade is "on hold" – the strategy is ready to act but needs the price to move a bit further.

Here's what the information includes:

*   The type of action is marked as "scheduled."
*   Details about the scheduled signal itself.
*   The name of the strategy that generated the signal.
*   The exchange used for trading.
*   The timeframe (like 1-minute or 5-minute) being used.
*   The symbol being traded (e.g., BTCUSDT).
*   The price at which the signal was initially triggered.
*   A flag indicating whether this is a backtest or a live trade.
*   A timestamp showing when this event happened.

## Interface IStrategyTickResultOpened

This interface describes what happens when a new trading signal is created within the backtest-kit system. It's a notification that a signal has been successfully generated, checked, and saved.

The notification includes several details to help you understand the context:

*   The strategy that generated the signal, including its name.
*   The exchange and time frame used for the signal.
*   The symbol being traded (like BTCUSDT).
*   The price at the moment the signal was created.
*   Whether the signal was created during a backtest or a live trading session.
*   A timestamp indicating exactly when the signal was created.
*   Most importantly, you'll get the full details of the new signal itself, complete with an automatically assigned ID.

## Interface IStrategyTickResultIdle

This interface describes what happens when a trading strategy isn't actively generating a signal – it's in an idle state. Think of it as a notification that the strategy is waiting for new information to make a decision.

It provides key details about the situation, like the name of the strategy being used, the exchange it’s connected to, the time frame being analyzed, and the trading pair involved. 

You'll also find the current price at that moment, whether this is part of a backtest or live trading, and a timestamp indicating when this idle state was observed. This allows you to track strategy behavior even when it’s not placing trades.


## Interface IStrategyTickResultClosed

This interface represents the result you get when a trading signal is closed, providing a snapshot of what happened and the outcome. It gives you detailed information about the closing event, including why it closed (like reaching a target profit, a stop-loss, or simply expiring) and the price at the time of closure.

You'll find the original signal details along with important financial data like profit and loss, accounting for fees and potential slippage. The interface also keeps track of things like the strategy name, exchange, and timeframe used for trading, which is helpful for analysis and debugging. It also indicates if the close happened during a backtest or a live trade and if the close was user-initiated. Finally, a timestamp tells you exactly when the close occurred and when the result was generated.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a previously scheduled trading signal is cancelled before a trade can be made. It’s used to tell you that something that *was* supposed to happen didn’t, perhaps because the signal didn't activate or was stopped before it could trigger a trade.

The information contained includes details about the cancelled signal itself (the `signal`), the price at the time of cancellation (`currentPrice`), and the exact time it happened (`closeTimestamp`). You’ll also find identifiers like the strategy and exchange names (`strategyName`, `exchangeName`), the timeframe used (`frameName`), and the symbol being traded (`symbol`).

It's flagged whether it's a backtest (`backtest`) or live trade, and provides a `reason` explaining why the signal was cancelled – such as manual cancellation. A unique ID (`cancelId`) is included if the cancellation was user-initiated. Finally, a timestamp (`createdAt`) notes when the result itself was generated, referencing either the candle time (in backtest) or the live execution context.

## Interface IStrategyTickResultActive

This interface represents a specific state in a trading strategy where a signal is active and being monitored, typically waiting for a take profit (TP), stop loss (SL), or time expiration. It provides detailed information about the ongoing situation.

The `action` property simply identifies this as an "active" state.

You'll find the `signal` data associated with the active position. The `currentPrice` is the price being used to track progress towards TP/SL. 

Alongside this, the interface includes tracking details like the `strategyName`, `exchangeName`, `frameName`, and `symbol` involved in the trade. 

The `percentTp` and `percentSl` show how far along the strategy is in reaching its TP or SL targets. The `pnl` provides a real-time view of the unrealized profit and loss, factoring in fees and slippage. 

It also indicates whether the trade is part of a `backtest` or live trading scenario. A timestamp, `createdAt`, records when the event occurred, and `_backtestLastTimestamp` assists with managing the timing of backtest operations.

## Interface IStrategySchema

The IStrategySchema defines how a trading strategy behaves within the backtest-kit framework. Think of it as a blueprint that tells the system how to generate trading signals. 

Each strategy needs a unique name for identification. You can also add a note to describe the strategy, helpful for your own records.

The strategy specifies how often it should be checked for new signals – it’s like setting a minimum refresh rate.

The core of the strategy is the `getSignal` function. This is the code that analyzes market data and decides whether to buy or sell. It can also handle situations where you want to wait for a specific price to be reached before entering a trade.

You can further customize a strategy by adding callbacks that execute when a position is opened or closed.  It also supports risk management by assigning a risk profile and potentially a list of profiles. There's even a way to tag strategies with actions for linking to other components. Finally, you can include custom data for ongoing monitoring and tracking.

## Interface IStrategyResult

This interface defines the structure for a single row in a backtest comparison table. Each row represents a strategy that has been run, and includes its name, a comprehensive set of backtest statistics, and the value of the metric used to rank the strategies. It also tracks the timestamps of the first and last signals generated by the strategy. These timestamps can be useful for understanding the timing of trades and assessing the strategy's activity during the backtest period. If a strategy didn't generate any signals, those timestamps will be null.

## Interface IStrategyPnL

This interface represents the profit and loss calculation for a trading strategy. It provides a detailed breakdown of performance, considering realistic trading conditions.

The `pnlPercentage` tells you the overall profit or loss as a percentage of your initial investment – a positive number means you made money, and a negative number means you lost.

You'll also find the `priceOpen` and `priceClose` values, which reflect the actual prices you paid to enter and exit trades, after accounting for fees (0.1%) and slippage (0.1%). These adjusted prices provide a more accurate picture of your trading costs.

The `pnlCost` is the absolute profit or loss in dollars, calculated based on your initial investment. Lastly, `pnlEntries` represents the total amount of capital initially used to execute your trades.

## Interface IStrategyCallbacks

This interface defines a set of optional callbacks that your trading strategy can use to respond to different lifecycle events of a trading signal. You can think of these as notification hooks that allow you to execute custom logic at specific points in a signal’s journey.

The `onTick` callback is fired with every price update, giving you a constant stream of data.  `onOpen` triggers when a new signal is successfully validated and prepared for entry.  When the signal is actively monitored, `onActive` is called. If there are no signals being tracked, `onIdle` will notify you.

`onClose` is called when a signal is fully closed out, providing the final closing price. If you schedule a signal for later entry, `onSchedule` is called when it's created. Conversely, `onCancel` is used when a scheduled signal is cancelled without a position being opened.

`onWrite` is a backtest-specific callback, used for persisting signal data.  For signals that have moved into profit or loss, but not yet reached their take profit or stop loss levels, `onPartialProfit` and `onPartialLoss` respectively, provide updates.  The `onBreakeven` callback notifies you when a signal reaches a breakeven point.

Finally, `onSchedulePing` and `onActivePing` are designed for scheduled and active signals respectively, giving you regular updates (every minute) regardless of your strategy's main interval – useful for custom monitoring and adjustments.

## Interface IStrategy

This interface, `IStrategy`, defines the core methods needed for a trading strategy to function within the framework. Think of it as a contract that all strategies must adhere to.

The `tick` method is the heart of the strategy, executed for each new price tick. It checks for signals, trailing stops, and profit targets. The `getPendingSignal` and `getScheduledSignal` methods retrieve information about any active signals waiting for activation.

You can use `getBreakeven` to see if it's safe to move the stop-loss.

Several methods provide insights into the position's health: `getTotalPercentClosed` and `getTotalCostClosed` track how much of the position has been closed, `getPositionEffectivePrice` calculates the average entry price, and `getPositionPnlPercent` and `getPositionPnlCost` show the unrealized profit or loss.

`getPositionEntries` gives you a history of when the position was built up through DCA. Partial closes are tracked with `getPositionPartials`.

The `backtest` method runs simulations using historical data. `stopStrategy` pauses new signal generation, `cancelScheduled` and `activateScheduled` manage scheduled signals without halting the strategy entirely, and `closePending` allows you to close a position directly.

There are methods for inserting user-provided signals (`createSignal`), handling profit and loss events (`createTakeProfit`, `createStopLoss`), and retrieving position state (`getStatus`, `getPositionEstimateMinutes`).  Several other methods allow calculating and validating actions such as `partialProfit`, `trailingStop`, and `breakeven`. Finally, `dispose` cleans up resources when the strategy is no longer needed.

## Interface IStorageUtils

This interface defines the core functionality expected of any storage adapter used within the backtest-kit framework. Think of it as a contract; any component handling signal data needs to implement these methods.

It provides hooks for responding to different signal lifecycle events: when a signal is opened, closed, scheduled, or cancelled.

The interface also includes methods for retrieving signal data – you can find a specific signal by its ID or list all signals currently in storage.

Finally, it contains methods to handle periodic "ping" events, specifically for active and scheduled signals, allowing the system to keep track of when these signals were last interacted with. These updates are crucial for long-term data integrity.

## Interface IStorageSignalRowScheduled

This interface represents a signal record that's been scheduled for execution. It holds information about the signal's current status, which will always be "scheduled". Crucially, it also stores the `currentPrice` at the time the signal was scheduled, which is the same price recorded in the strategy tick data. This price serves as a reference point for the signal's execution.

## Interface IStorageSignalRowOpened

This interface describes a signal event when a trade is opened. It essentially confirms that a signal has triggered an entry into a position. 

You'll find two key pieces of information here: a simple "opened" status indicator and the price at which the trade was initiated – specifically, the VWAP price at the time the signal fired. This price data, found in the `currentPrice` property, directly corresponds to the `currentPrice` found in a `IStrategyTickResultOpened` object.

## Interface IStorageSignalRowClosed

This data structure represents a trading signal that has already been closed. It contains all the information related to that closed signal, including its profit and loss (PNL), the final price at which it was closed, and the reason for its closure. You'll find details about when the signal was closed, marked by a precise timestamp. Think of it as a record summarizing the outcome of a completed trade.

## Interface IStorageSignalRowCancelled

This interface represents a signal row that has been cancelled. 

It's a simple way to indicate that a trading signal is no longer active or valid.

The key property here is `status`, which is always set to "cancelled" to clearly mark the signal's state.

## Interface IStorageSignalRowBase

This interface defines the basic structure for storing signal data, ensuring that all signal types share a consistent foundation. It includes key information like the creation timestamp, a timestamp for when the data was last updated, and a priority level used for organizing and processing signals. The `createdAt` and `updatedAt` values capture the exact moment the signal was generated and modified, respectively, and the `priority` field allows for controlled rewriting of signals based on their importance. Think of it as the foundational template for every signal you store.

## Interface IStateParams

IStateParams helps you organize and manage data within your trading signals. Think of it as a way to categorize your signal's information.

You define a `bucketName`, which is essentially a label for grouping related data, like "trade" or "metrics."

And you specify an `initialValue`, which is what the signal's data will start with if there isn't any pre-existing information available.

## Interface IStateInstance

The `IStateInstance` interface is designed to manage mutable data associated with each trading signal, particularly useful for strategies relying on large language models (LLMs) that track metrics over a trade's lifespan. Think of it as a way to keep track of things like the highest unrealized profit, how long a trade has been open, and when to cut losses.

This interface provides methods to manage this data.

`waitForInit` is used to kick things off at the start.

`getState` lets you retrieve the current state, but it cleverly prevents "look-ahead bias" by returning an initial value if the requested time is in the future.  This prevents using information not yet known.

`setState` updates the state, and it handles situations where the backtest restarts, ensuring that any previously written data doesn’t cause problems. It also provides the current state to the updater, guarded against look-ahead bias.

`dispose` cleans up any resources used by the state instance.

## Interface ISizingSchemaKelly

This defines a way to calculate your trade size using the Kelly Criterion, a formula that helps determine how much of your capital to risk on each trade. 

The `method` is explicitly set to "kelly-criterion" to indicate you're using this specific sizing technique. 

The `kellyMultiplier` controls how aggressively you're applying the Kelly Criterion – a lower value like 0.25 represents a more conservative approach (often called "quarter Kelly"), while a higher value risks more of your capital per trade. You can adjust this multiplier to suit your risk tolerance.


## Interface ISizingSchemaFixedPercentage

This schema defines a simple way to size your trades, always using a fixed percentage of your available capital. 

You specify a `riskPercentage`, which represents the maximum percentage of your capital you're willing to risk on a single trade.  For example, a `riskPercentage` of 2 would risk 2% of your capital for each trade. 

The schema identifies itself with the method "fixed-percentage".


## Interface ISizingSchemaBase

This interface defines the fundamental structure for sizing strategies within the backtest-kit framework. It provides a way to uniquely identify each sizing configuration with a `sizingName`. 

You can add a `note` for documentation purposes, helping explain the sizing strategy's purpose. 

It also includes constraints on position sizing: `maxPositionPercentage` limits the size based on a percentage of your account, while `minPositionSize` and `maxPositionSize` set absolute minimum and maximum position sizes. Finally, `callbacks` allow for custom logic to be triggered at different points in the sizing process.


## Interface ISizingSchemaATR

This schema defines a sizing strategy based on the Average True Range (ATR). 

It's designed for traders who want to adjust their position sizes based on market volatility, as measured by the ATR.

The `method` is always set to "atr-based" to identify this specific approach.

You'll need to specify a `riskPercentage`, which dictates what portion of your trading capital you're willing to risk on each trade – typically a value between 0 and 100.

Finally, the `atrMultiplier` determines how the ATR value influences the stop-loss distance, controlling how far your stop-loss is placed from the entry price based on volatility.


## Interface ISizingParamsKelly

This interface defines the parameters used when calculating trade sizes using the Kelly Criterion method. It includes a way to specify a logger for tracking debugging information during the sizing process. Essentially, it allows you to control how trade sizes are determined and get insights into what’s happening behind the scenes. The logger helps monitor the sizing calculations and spot any potential issues.

## Interface ISizingParamsFixedPercentage

This interface defines the parameters used when you want your trading strategy to use a fixed percentage of your capital for each trade. It requires a logger, which is a tool for recording information and debugging your backtest. Think of it as a way to keep track of what's happening during your simulation.


## Interface ISizingParamsATR

This interface defines the settings you'll use when determining how much of an asset to trade based on the Average True Range (ATR). It's all about controlling your position size with ATR.

The `logger` property lets you hook in a logging system—think of it as a way to get helpful messages and track what's happening during the sizing calculations, which can be valuable for debugging and understanding your trading strategy.

## Interface ISizingCallbacks

The `ISizingCallbacks` interface allows you to hook into the sizing process of your trading strategy. Specifically, the `onCalculate` callback is triggered right after the framework determines how much to trade. This gives you a chance to observe the calculated trade size, log it for analysis, or even perform checks to ensure the sizing logic is behaving as expected. It receives the calculated quantity and additional parameters related to the sizing calculation.


## Interface ISizingCalculateParamsKelly

To calculate your trade sizes using the Kelly Criterion, you'll need to provide some information about your trading strategy. This set of parameters defines exactly what’s needed.

You’ll specify the calculation method as "kelly-criterion." 

Then you need to tell the system your strategy's win rate, expressed as a decimal between 0 and 1.  Finally, you need to define the average win/loss ratio that your strategy has historically produced. These three pieces of data are used to determine the optimal amount to risk on each trade.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the data needed to calculate trade sizes using a fixed percentage of your account balance. 

Essentially, it tells the backtest kit to size your trades based on a pre-determined percentage of your available capital, using a specific stop-loss price. 

You'll provide a `method` value of "fixed-percentage" to indicate the sizing approach and a `priceStopLoss` value which represents the price at which to place your stop-loss order.

## Interface ISizingCalculateParamsBase

This interface defines the essential information needed to calculate the size of a trade. It includes the symbol of the trading pair, like BTCUSDT, so the system knows what assets are involved. You'll also find the current account balance, which is crucial for determining how much capital you have to work with. Finally, it provides the anticipated entry price for the trade, which impacts the potential risk and reward. These three pieces of data form the foundation for any sizing calculation.

## Interface ISizingCalculateParamsATR

This interface defines the settings you’ll use when determining position size based on the Average True Range (ATR) indicator.  It essentially tells the backtest kit to use an ATR-based sizing approach.  You'll need to provide an `atr` value, which represents the current ATR reading, to guide the size calculation. Think of the `atr` value as a key piece of data the system uses to figure out how much of an asset to trade.


## Interface ISizing

The `ISizing` interface is the core component responsible for determining how much of an asset to trade in each scenario. Think of it as the risk management engine of your backtest. 

It provides a single method, `calculate`, which takes a set of parameters – like your risk tolerance, account balance, and the potential reward of a trade – and returns the size of the position as a number. 

This calculation happens behind the scenes, within the strategy's execution process. You, as the strategy developer, implement this interface to define your specific sizing logic.

## Interface ISignalRow

This interface, `ISignalRow`, represents a complete trading signal used within the backtest-kit framework. Each signal has a unique identifier, like a UUID, and contains all the necessary information for execution. It includes details like the cost of the position, entry price, the expected duration, and which exchange and strategy are associated with it.

You’ll also find information regarding when the signal was created and when it became active (`scheduledAt` and `pendingAt`). Key identifiers like the trading pair (`symbol`), the frame identifier, and internal flags (`_isScheduled`) are also included.

Beyond the basic details, this structure tracks partial closes with profit and loss data, allowing for more accurate Profit and Loss (PNL) calculations. It also handles dynamic Take Profit and Stop Loss adjustments through trailing prices (`_trailingPriceStopLoss` and `_trailingPriceTakeProfit`). 

A history of DCA (Dollar Cost Averaging) entries is stored in `_entry`, while `_peak` and `_fall` record the highest and lowest prices seen during the trade’s lifespan, further aiding in performance analysis. Finally, a timestamp is provided for tracking when the signal was first generated.

## Interface ISignalIntervalDto

This data structure helps manage signals that need to be delivered in intervals. It’s designed to be used with a utility function that allows you to request several signals at once. Think of it as a way to group related signals together and ensure they're released at specific times. 

Each signal within this structure has a unique identifier, which is a standard UUID. This ID is automatically generated and helps distinguish each signal.

## Interface ISignalDto

This interface, `ISignalDto`, represents the data structure for a trading signal. Think of it as a standardized way to communicate what a signal *is* – what asset to trade, in what direction, and at what prices. Each signal will have a unique identifier, and you can optionally provide your own, though one will be automatically assigned if you don't. 

The signal includes key information: the ticker symbol, whether you're going long (buying) or short (selling), a descriptive note explaining the reasoning behind the signal, and the entry price.  It also specifies the take profit and stop loss prices to manage risk and potential gains.  You can set an estimated duration for the signal – if you don’t specify a time limit, the position remains open until the take profit or stop loss is triggered. Finally, there’s a field to record the cost associated with entering the position.

## Interface ISignalCloseRow

This interface, `ISignalCloseRow`, builds upon the existing `ISignalRow` to handle situations where a signal is closed by a user action. It adds two key pieces of information: `closeId` which uniquely identifies the user-initiated close, and `closeNote`, allowing users to provide a brief explanation or reason for the closure. Think of it as a way to track and annotate user-driven signal terminations within your backtesting system. This is particularly useful for understanding and analyzing why a signal was closed outside of the automated trading logic.


## Interface ISessionInstance

The `ISessionInstance` acts as a shared space for data that's specific to a particular trading setup - a combination of a symbol, strategy, exchange, and timeframe. Think of it as a temporary holding area to store information needed during a single backtesting run.

It allows you to store things like the results of complex calculations (perhaps from a large language model), intermediate results from indicators, or other data that needs to be passed between different parts of your strategy.

This interface provides methods to initialize the session, write new data with a timestamp, read data based on a timestamp to prevent looking into the future, and clean up any resources when the session is done. It helps keep your backtesting runs organized and efficient by centralizing important data.

## Interface IScheduledSignalRow

The `IScheduledSignalRow` represents a trading signal that’s set to activate when a specific price is reached. Think of it as a signal on hold, waiting for a price trigger. 

It builds upon the basic `ISignalRow`, adding the element of delayed execution until the market hits the `priceOpen` you’ve specified.

Once the market price equals your `priceOpen`, this scheduled signal transforms into a regular, active signal.

The `priceOpen` property holds the price level that must be hit before the signal becomes active. The scheduled time is tracked, and initially the time when it was scheduled is set as the pending time, which later gets updated.

## Interface IScheduledSignalCancelRow

This interface, `IScheduledSignalCancelRow`, represents a scheduled trading signal that might have been cancelled by the user. It builds upon the basic `IScheduledSignalRow` and adds information specifically for cancellations that were triggered directly by the user. If a user cancels a scheduled signal, this interface allows us to track that cancellation with a unique `cancelId` and a `cancelNote` – a brief explanation from the user about why they cancelled it. Think of it as a way to record the details of a user-requested cancellation of a planned trade.

## Interface IScheduledSignalActivateRow

This interface defines a row of data for scheduled signals, but with a key addition: the ability to track when a user manually triggered the activation. It builds upon the standard scheduled signal data, adding details about the activation process. Specifically, it includes an `activateId` to uniquely identify the user-initiated activation and an `activateNote` to record any notes the user might have provided during activation. Think of it as a way to log who and why a scheduled signal was activated outside of the system’s automatic timing.

## Interface IRuntimeRange

This interface, `IRuntimeRange`, simply describes the period of time your backtest will cover. It's like setting the start and end dates for your historical data analysis. You’ll use it to specify the timeframe your trading strategy will be evaluated against, ensuring it operates within a defined and consistent period. The `from` property represents the beginning of that time range, while the `to` property marks the end.

## Interface IRuntimeInfo

The `IRuntimeInfo` interface provides key details about the current state of a trading run, whether it's a backtest or live execution. It tells you what symbol you're trading, the time period being analyzed (if it’s a backtest), and any custom data your strategy has added for its own needs. You’ll also find information about the exchange, strategy, and frame being used, along with the exact time of the current candle or tick and its corresponding price. Finally, it clearly indicates whether the run is a backtest, allowing your code to adapt accordingly.


## Interface IRunContext

The `IRunContext` acts as a central hub for information needed when running code within the backtest-kit framework. It bundles together two key pieces of data: how your strategy is configured (like which exchange and strategy it's connected to) and the runtime state of the backtest itself (such as the current symbol and timestamp). Think of it as a single, complete package of everything a function needs to know to execute properly during a backtest. This context is given to the system and then divided into separate components for managing strategy routing and runtime state.

## Interface IRiskValidationPayload

This object holds the information needed when checking if a trade is risky. It builds upon the base arguments used for risk checks, adding details about your portfolio's current state. 

Specifically, it includes the signal that triggered the potential trade – you can be sure the price data is available within that signal. You’ll also find the total number of positions currently open and a complete list of those active positions, which helps assess overall exposure.

## Interface IRiskValidationFn

This function type defines how you check if a trade or order meets your risk management rules. Think of it as a gatekeeper – it decides whether a trade should proceed or not. If everything looks good, the function simply does nothing (returns null or void). However, if something triggers a risk concern – like exceeding a limit or violating a rule – it either throws an error or returns a specific rejection result detailing why the trade was blocked. This allows you to clearly understand and react to any risk-related issues.

## Interface IRiskValidation

This interface helps you define and document rules for validating risk parameters in your trading strategy. Think of it as a way to ensure your risk checks are behaving as expected.  You'll provide a `validate` function – this is the core logic that performs the actual validation.  Alongside that, you can add a `note` to explain what the validation is checking and why. This makes your code more readable and easier to maintain.

## Interface IRiskSignalRow

This interface, IRiskSignalRow, helps with managing risk during trading. It builds upon existing signal data by adding crucial information about the initial trade setup. Specifically, it includes the entry price of the position, along with the original stop-loss and take-profit prices that were set when the signal was first generated. This data is especially useful when validating and controlling risk exposure.

## Interface IRiskSchema

The IRiskSchema lets you define and register custom risk controls for your portfolio. Think of it as a way to put rules in place to manage risk at a portfolio level.

Each risk schema has a unique identifier, a `riskName`, so you can easily recognize it. You can also add a note to document the purpose of the risk control.

You can optionally provide callbacks – `onRejected` and `onAllowed` – which act as triggers for specific actions when a risk check is performed. 

The heart of the schema is the `validations` array. This is where you put the custom logic that determines whether a trade or portfolio state is acceptable based on your defined risk rules. These validations can be functions or pre-defined validation objects.

## Interface IRiskRejectionResult

This interface describes the outcome when a risk check fails during your trading strategy's validation. It provides information to help you understand why the rejection happened. Each rejection has a unique ID, and a clear, easy-to-understand explanation of the problem is included in the "note" property. This helps pinpoint and fix issues in your trading logic.

## Interface IRiskParams

This interface defines the configuration needed for managing risk within the trading system. It includes details like the exchange being used, a logger for tracking activity, a time service to ensure accurate data handling, and a flag to indicate whether the system is in backtesting or live trading mode. 

You can also specify a callback function that's triggered when a trading signal is blocked due to risk constraints. This callback lets you handle these situations, potentially emitting events or performing other actions before the system proceeds. Essentially, it provides a way to react to and manage risk-related rejections.

## Interface IRiskCheckOptions

The `IRiskCheckOptions` interface helps manage potential conflicts when multiple parts of your trading system are trying to use the same position at the same time. Specifically, the `reserve` option provides a way to temporarily mark a position as being used. This ensures that if other parts of your code are checking the size of the position, they see the updated value *before* the position is actually fully committed, preventing unexpected behavior in concurrent scenarios. Think of it as a little reservation to keep things orderly.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, provides the information needed to perform a risk check before a trading signal is generated. Think of it as a set of validations to make sure it's a good time to open a new position. It’s given to your risk management logic before a signal is created, essentially to double-check if the conditions are right.

The arguments include details about the trading pair (`symbol`), the signal itself (`currentSignal`), which strategy is requesting the trade (`strategyName`), the exchange being used (`exchangeName`), and a specific risk profile identifier (`riskName`). It also provides the timeframe being considered (`frameName`), the current price (`currentPrice`), and a timestamp (`timestamp`) for accurate validation. All of these arguments come directly from the `ClientStrategy` context.

## Interface IRiskCallbacks

This section describes callbacks related to risk management within the trading framework. You can use these to react to situations where a trading signal is either blocked due to risk limits or approved to proceed. The `onRejected` callback gets triggered when a signal fails a risk check, letting you know a trade won’t be executed. Conversely, the `onAllowed` callback informs you when a signal successfully passes all risk evaluations and is ready for execution. These callbacks help you monitor and potentially adjust risk parameters based on real-time trading signals.

## Interface IRiskActivePosition

This interface describes an active trading position that's being monitored for risk management across different strategies. It holds all the key details about a position, like which strategy owns it, the exchange it's on, and the trading symbol involved. 

You'll find information like the direction of the trade (long or short), the entry price, and any stop-loss or take-profit levels set.  It also tracks how long the position is expected to last, and when it was initially opened. Think of it as a snapshot of a trade, capturing all the critical data needed to understand and manage risk.


## Interface IRisk

The `IRisk` interface manages risk controls and tracks positions in your trading strategies. It's responsible for ensuring that trades align with pre-defined risk limits and that you’re not exceeding those boundaries.

The `checkSignal` method evaluates whether a signal is safe to execute based on your risk settings.  There’s also a `checkSignalAndReserve` method which offers a safer way to do this, especially when multiple strategies are running simultaneously. It verifies the signal *and* immediately sets aside a placeholder for the potential position, preventing other strategies from exceeding limits in between the check and the actual trade placement. Remember, if `checkSignalAndReserve` succeeds, you *must* either finalize the trade with `addSignal` or cancel it with `removeSignal` to avoid incorrect tracking.

The `addSignal` method records a newly opened position, officially adding it to the active position count. Conversely, `removeSignal` cleans up a closed position, ensuring accurate tracking of remaining risk exposure.

## Interface IReportTarget

This interface lets you pick and choose which types of events you want to log during your trading backtests. Think of it as a way to control the level of detail in your reports. Each property, like `strategy` or `risk`, corresponds to a specific category of events – for example, enabling `risk` logging captures events related to risk management.  You can enable or disable these categories individually to focus on the information most relevant to your analysis, keeping your logs manageable and highlighting key aspects of the trading process.  By toggling these boolean values, you fine-tune the reports that are generated, ultimately giving you a tailored view of your backtest results.

## Interface IReportDumpOptions

This interface lets you specify details when exporting report data, like the symbol being traded (e.g., BTCUSDT), the name of the trading strategy used, and the exchange it ran on. You can also include the timeframe (like a 1-minute or 1-hour chart) and a unique identifier for the signal that triggered the trade. Lastly, it allows you to record the name of the walker used for optimization purposes. Providing these details helps organize and analyze your backtesting results.

## Interface IRecentUtils

This interface defines how different systems can store and access recent trading signals. It provides a way to manage and retrieve the most up-to-date signal information for a particular trading setup. 

The `handleActivePing` method allows systems to record new signal events, ensuring the storage stays current.  `getLatestSignal` fetches the most recent signal for a specific symbol, strategy, and timeframe, while also preventing looking into the future by returning null if the signal is too recent.  Finally, `getMinutesSinceLatestSignalCreated` calculates how long ago the most recent signal was generated, useful for understanding signal frequency and timing.

## Interface IPublicSignalRow

This interface, IPublicSignalRow, provides a way to share detailed information about a trading signal with external systems or users. It builds upon the existing ISignalRow to include the original stop-loss and take-profit prices that were initially set when the signal was generated.  Even if those stop-loss and take-profit levels are adjusted later by strategies like trailing stops, this interface ensures that the original values remain visible.

You'll find key details here like the cost of entering the trade, the number of entries and partial closes executed, and the original entry price.  It also includes profit and loss information, showing the unrealized P&L, the peak profit reached, and the maximum drawdown experienced by the trade. The `partialExecuted` property shows what percentage of the position has been closed through partial exits, which is helpful to understand the position's lifecycle. The `totalEntries` and `totalPartials` properties quantify the extent of the position’s DCA and partial exit strategy. 

Essentially, IPublicSignalRow allows you to transparently show users the initial parameters and performance metrics of a trading signal.

## Interface IPublicCandleData

This interface defines the standard structure for candle data used throughout the backtest-kit framework. Each candle represents a specific time interval and contains key price points and volume information. 

You'll find properties like `timestamp` to mark when the candle began, `open` for the initial price, `high` and `low` for the extremes, `close` to indicate the final price, and `volume` representing the trading activity within that time period. This consistent data format allows for easy integration of different data sources into your backtesting strategies.

## Interface IPositionSizeKellyParams

This interface defines the parameters used to calculate position sizes based on the Kelly Criterion. Think of it as setting the rules for how much of your capital you'll risk on each trade.

You'll specify a `winRate`, representing the percentage of winning trades you expect, and a `winLossRatio`, which reflects the average profit you make on a winning trade compared to the average loss on a losing trade. These values help determine an optimal bet size, aiming to maximize long-term growth.

## Interface IPositionSizeFixedPercentageParams

This section describes the parameters used for a trading strategy that sizes positions based on a fixed percentage of your available capital, and includes a stop-loss order. 

The `priceStopLoss` property specifies the price at which a stop-loss order will be triggered to limit potential losses. It's a critical value to define how your risk management will operate.

## Interface IPositionSizeATRParams

The `IPositionSizeATRParams` interface holds the information needed to calculate your position size using the Average True Range (ATR). It's a straightforward way to determine how much to trade based on market volatility.

The most important part is the `atr` property, which represents the current ATR value. This value directly influences the size of your trade – a higher ATR generally means a larger position size to account for increased volatility.


## Interface IPositionOverlapLadder

This interface defines how to control the detection of overlapping positions when using dollar-cost averaging (DCA). It helps you specify a zone around each DCA level to look for potential overlaps.

The `upperPercent` property sets the upper boundary of this zone as a percentage; values above this point are considered overlaps. 

The `lowerPercent` property sets the lower boundary of the zone, similarly marking values below it as overlaps. You'll use these percentages to fine-tune the sensitivity of the overlap detection system.

## Interface IPersistStrategyInstance

This interface helps you customize how trading strategies store and retrieve their data across different trading contexts. Think of it as a way to manage the memory of a strategy, allowing it to remember its state even after it's been paused or stopped.

It's designed for specific combinations of a trading symbol, strategy name, and exchange.

If you need more control over how this data is saved – perhaps you want to use a database instead of a file – you can build a custom adapter that implements this interface.

The `waitForInit` method sets up the storage for a particular strategy instance. 
`readStrategyData` fetches any existing saved data for that instance.
Finally, `writeStrategyData` lets you save the current state of the strategy, or clear it entirely if needed.


## Interface IPersistStorageInstance

This interface defines how to manage and persist signal data for backtesting or live trading. Think of it as a way to save and load your trading signals so you don’t lose them between sessions.

Essentially, it lets you customize how your signals are stored – instead of relying on the default file-based storage, you can create your own solution.

The `waitForInit` method sets up the storage when a backtest or live trading session begins.  The `readStorageData` method retrieves all saved signals and presents them as a list. Finally, `writeStorageData` is responsible for saving the signals back to the chosen storage location, organizing them by their unique signal IDs.

## Interface IPersistStateInstance

This interface defines how to manage persistent storage for strategy states. Think of it as a way to save and load the important information your trading strategy needs to remember, specifically for a particular signal and bucket combination.

If your strategy needs to reliably recover from interruptions, like crashes or restarts, you can create a custom adapter that implements this interface.

The `waitForInit` method allows you to prepare the storage space. `readStateData` retrieves the saved state. `writeStateData` is used to save the latest state, and `dispose` is for cleaning up when the storage is no longer needed – although it might not always be required to do anything.


## Interface IPersistSignalInstance

This interface helps you manage how trading signals are saved and loaded for a particular setup. Think of it as a way to customize where and how signal data is stored. 

It's designed to work with a specific combination of a symbol, a strategy name, and an exchange. 

If you want to go beyond the default file-based storage, you can create your own adapter that implements this interface.

The `waitForInit` method prepares the storage space for the signals. The `readSignalData` method retrieves previously saved signal data. And the `writeSignalData` method allows you to save new or updated signal data, or clear the data entirely by setting it to null.

## Interface IPersistSessionInstance

This interface defines how to manage session data specifically for a particular trading strategy, exchange, and frame combination. Think of it as a way to save and load important information about a running trading setup so you can pick up where you left off, even if things crash.

If you want to customize how this data is stored – perhaps using a database instead of a file – you can create your own implementation of this interface.

The `waitForInit` method sets up the storage for a session. The `readSessionData` method retrieves previously saved data.  `writeSessionData` is used to save the current state.  Finally, `dispose` cleans up any resources when the session is no longer needed.

## Interface IPersistScheduleInstance

This interface lets you customize how backtest-kit saves and loads signals for specific trading setups. Think of it as a way to control where and how information about scheduled signals is stored, rather than relying on the default system. It's designed for situations where you might want to use a different storage method, like a database or an in-memory cache, instead of a simple file.

Implementing this interface involves three key actions: initializing the storage, retrieving existing signal data, and writing new or updated signal data. Each of these actions is handled through promises, allowing for asynchronous operations like fetching data from a remote server.  The interface is specific to a particular symbol, strategy, and exchange, ensuring that persistence is correctly managed for each distinct scenario. If you need to persist scheduled signals in a more tailored fashion, this is the interface to work with.

## Interface IPersistRiskInstance

This interface defines how a trading system remembers risk positions for a specific combination of risk name and exchange. Think of it as a way to customize where and how that information is saved – potentially moving away from the default file storage. 

If you need to build your own system for managing risk data, you’ll implement this interface. 

The `waitForInit` method prepares the storage area. The `readPositionData` method retrieves previously saved risk position data for a given time. Finally, `writePositionData` saves the current risk positions for that time.


## Interface IPersistRecentInstance

This interface helps keep track of the most recent trading signal used in a specific scenario. Think of it as a way to remember what signal was active for a particular symbol, trading strategy, exchange, and timeframe – all within a backtest or live trading environment. 

It allows you to customize how this information is saved and retrieved, potentially moving away from the default file-based storage. If you need to manage recent signals in a unique way, you can build your own adapter that implements this interface.

The `waitForInit` method sets up the storage for a specific context. `readRecentData` retrieves the last saved signal, and `writeRecentData` saves a new signal along with the date and time it occurred.

## Interface IPersistPartialInstance

This interface defines how to manage temporary data related to profit and loss for a particular trading setup. Think of it as a way to save and load intermediate results – specifically, how much profit or loss has been made at certain points in time – for a specific symbol, trading strategy, and exchange.

It allows you to customize how this data is stored, rather than relying on the default file-based method.

To work with this, you’d create a custom adapter that implements these methods:

*   `waitForInit` sets up the storage area when needed.
*   `readPartialData` retrieves stored data for a signal at a given time.
*   `writePartialData` saves new data for a signal.

Essentially, it's about controlling how the framework remembers partial trading results.

## Interface IPersistNotificationInstance

This interface lets you customize how notifications are saved and loaded during backtesting or live trading. Think of it as a way to replace the default file storage with your own solution, like a database or in-memory cache.

There's a separate instance of this for backtesting and live trading.

When you implement this, you'll be responsible for initializing the storage, reading all existing notifications, and writing new or updated notifications.  Notifications are identified by their unique IDs, and reading pulls all of them.

## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for a specific context within the backtest-kit framework. Think of it as a way to manage pieces of information related to a particular trading signal and a designated bucket. 

It allows for persisting memory entries, meaning data can be saved to disk and later reloaded. 
A key feature is the ability to "soft-delete" entries – marking them as removed but keeping them on disk.  This is useful when you want to remove data from active use but preserve it for potential analysis or recovery.

If you're creating a custom way to store this memory data, such as using a database instead of files, you'll need to implement this interface.

Here's a quick breakdown of the actions it supports:

*   **Initialization:**  Ensuring the storage is ready to use.
*   **Reading:**  Fetching a specific memory entry by its ID.
*   **Checking Existence:** Verifying if a memory entry with a given ID exists.
*   **Writing:** Saving a new memory entry or updating an existing one.
*   **Soft-Deleting:** Marking a memory entry as removed without actually deleting it from disk.
*   **Listing:** Retrieving all available memory entries (excluding those that have been soft-deleted).
*   **Cleanup:** Releasing any resources held by the storage system.

## Interface IPersistMeasureInstance

This interface defines how to store and retrieve cached data for backtest measures, often used when fetching data from external sources. 

It allows you to customize how this cached data is managed – for example, you might store it in a database instead of a file.

The cache supports a "soft delete" feature, which means removing data doesn’t erase it completely from disk; instead, it's marked as removed, allowing for recovery if needed.

Here's what you can do with this interface:

*   **`waitForInit`**: Prepare the storage area for a specific measure.
*   **`readMeasureData`**: Get a cached data entry based on its key.
*   **`writeMeasureData`**: Save new data or update existing data within the cache.
*   **`removeMeasureData`**: Mark a data entry as deleted, keeping the file but excluding it from typical searches.
*   **`listMeasureData`**: Get a list of all the keys of available (non-deleted) entries.

## Interface IPersistLogInstance

This interface defines how your application can manage and store log data persistently, acting as a central place for all logs within the running process. It’s designed to be a single, global storage location, different from how other data might be handled.

If you want to customize how logs are saved—perhaps to a database instead of a file—you'll implement this interface.

The `waitForInit` method allows you to ensure log storage is ready before you start writing data.

`readLogData` retrieves all of your stored log entries, essentially reading the entire log history.

Finally, `writeLogData` is responsible for saving new log entries, ensuring that each entry is uniquely identified and that you don’t accidentally overwrite existing data—it’s an append-only system.

## Interface IPersistIntervalInstance

This interface defines how your custom storage system interacts with the backtest-kit framework to manage when specific trading intervals have already run. Think of it as a way to keep track of which intervals have "fired" for a particular time period and asset.

It allows you to customize how the backtest-kit knows whether to re-trigger an interval's function.  The framework uses this to avoid running the same function multiple times within the same interval. 

You can use it to persist this information to a file, database, or other custom storage.  If a record is "soft-deleted," it's as if it doesn’t exist, so the interval function will run again.

Here's a breakdown of the key functions:

*   `waitForInit` sets up the storage for each interval.
*   `readIntervalData` retrieves information about a specific interval marker.
*   `writeIntervalData` records that an interval has occurred.
*   `removeIntervalData` marks an interval as needing to be re-run.
*   `listIntervalData` provides a way to iterate through all interval markers that haven't been removed.

## Interface IPersistCandleInstance

This interface defines how to store and retrieve historical candle data for a specific trading instrument, timeframe, and exchange. Think of it as a way to manage a local copy of market data.

The `waitForInit` method allows you to prepare the storage area when needed.

The `readCandlesData` method fetches a batch of candles from the storage based on a specified time range. Importantly, if any candle within that range is missing, it returns null, signaling that the data needs to be fetched from the original source.

Finally, the `writeCandlesData` method is used to save newly downloaded or recalculated candles into the storage. Implementations have the flexibility to skip candles that are incomplete or already present to maintain data integrity.

## Interface IPersistBreakevenInstance

This interface helps manage where your trading strategy's breakeven data is saved. Think of it as a way to customize how that information is stored.

It's tied to a very specific combination: a trading symbol, the name of the strategy you're using, and the exchange it's on.

Each signal – a discrete trading instruction – has its own little area for storing this breakeven data, organized by a unique signal ID.

If you want to store this data somewhere other than the default (like a database instead of a file), you can create your own version of this interface.

The `waitForInit` method is used to set up the storage space.  `readBreakevenData` retrieves saved information.  And `writeBreakevenData` saves new or updated information about a signal’s breakeven point.

## Interface IPersistBase

This interface outlines the fundamental operations for any custom persistence adapter you might create for backtest-kit. Think of it as the core contract your adapter needs to fulfill to handle saving and retrieving data.

It defines five essential methods: `waitForInit` to set up and check your persistence directory on startup; `readValue` to fetch a specific entity; `hasValue` to quickly check if an entity exists; `writeValue` to securely save an entity; and `keys` to provide a way to list all entities. 

The `keys` method is particularly important as it’s used for both iterating through all your persisted data and for ensuring data integrity. By implementing this interface, you can build flexible persistence solutions tailored to your specific needs, like saving data to a database or a file system.

## Interface IPartialProfitCommitRow

This object represents a partial profit taking action that's been queued up in your backtest. 

It tells the backtest system to close a portion of your position. 

The `action` property confirms it’s a partial profit action, and `percentToClose` specifies what percentage of the position should be closed. Finally, `currentPrice` records the price at which this partial profit was actually executed.

## Interface IPartialLossCommitRow

This represents a record of a partial loss order that has been queued for execution. It contains essential details about the action being taken – specifically, a partial loss. You'll find the percentage of the position being closed in the `percentToClose` field, and the price at which the partial loss transaction occurred, recorded in the `currentPrice` field. This information helps track and verify the specifics of your trading strategy's partial loss executions.

## Interface IPartialData

IPartialData helps save and load progress for your trading signals. It's like a snapshot of key information.

It focuses on storing the profit and loss levels you've hit during a trade.

Think of it as converting sets of levels into simple arrays so they can be easily saved, like in a database. 

When you start a backtest, this data can be loaded to continue from where you left off, allowing you to pick up right where you stopped. 

It essentially holds the `profitLevels` and `lossLevels` as arrays, representing the levels reached during the trading process.

## Interface IPartial

The `IPartial` interface manages how profit and loss is tracked for trading signals. It's used by components like `ClientPartial` and `PartialConnectionService` to keep track of milestones.

When a signal makes money, the `profit` method calculates if the signal has reached profit levels like 10%, 20%, or 30%, and reports those milestones. Similarly, the `loss` method does the same for losses, recognizing levels like 10%, 20%, or 30% loss. It avoids sending duplicate notifications.

Finally, the `clear` method cleans up the profit/loss record when a signal is finished, removing it from memory and saving any changes, while also cleaning up related internal data.

## Interface IParseArgsResult

The `IParseArgsResult` object holds the outcome of parsing command-line arguments. 

It essentially combines the original input parameters with flags that determine the trading environment.

Specifically, it tells you if the system should operate in backtest mode (using historical data), paper trading mode (simulated trading with live data), or live trading mode (actual trading with real funds).


## Interface IParseArgsParams

This interface describes the information needed to run a trading strategy. Think of it as a way to tell the system *what* to trade, *where* to trade it, and with what kind of data. You’ll specify things like the trading pair (like BTCUSDT), the name of the strategy you want to use, which exchange you're connected to (Binance, Bybit, etc.), and the timeframe for the candles (like hourly or 15-minute intervals). It essentially sets up the basic parameters for a backtesting run.


## Interface IOrderBookData

This interface describes the structure of order book data. It holds information about the bids (buy orders) and asks (sell orders) available for a specific trading pair.

The `symbol` property tells you which trading pair the order book data represents, like 'BTCUSDT'.

The `bids` property is a list of buy orders, and the `asks` property is a list of sell orders. Each of these lists contains details about individual orders within the book.

## Interface INotificationUtils

This interface defines how different notification systems should work within the backtest-kit framework. It’s a blueprint for adapters that can send notifications about what's happening during a backtest or live trading.

Each method represents a different type of notification event that the system might generate, like when a trade is opened, partially profits are available, or errors occur.  The `handleSignal` method covers general trade signals, while others like `handlePartialProfit` and `handleBreakeven` deal with more specific profit-taking opportunities.

The `handleSync` and `handleCheck` methods manage signal synchronization and pinging.  `handleRisk` deals with situations where a trade is rejected based on risk rules.  Various `handleError` methods manage errors of different severity.

Finally, `getData` lets you retrieve all stored notifications, and `dispose` is used to clear those notifications when you're finished.  Essentially, it’s the standard for sending alerts and updates about the trading process.

## Interface INotificationTarget

This interface lets you finely control which notifications your backtest or live trading system sends to you. Think of it as a way to subscribe only to the information you really need, preventing unnecessary noise. If you don't specify this interface, you'll receive *all* notifications, which can be overwhelming.

Here's a breakdown of what each property represents:

*   **signal:** Notifications related to signal lifecycle – when signals are opened, scheduled, closed, or canceled.
*   **partial\_profit:** Alerts when the price hits a pre-defined partial profit level.
*   **partial\_loss:** Notifications when the price reaches a pre-defined partial loss level.
*   **breakeven:** Alerts when the price reaches the breakeven point.
*   **strategy\_commit:** Confirms when different commit actions happen in your strategy (partial profits, loss, etc.).
*   **order\_sync:** Keeps you informed about the synchronization of orders in live trading situations, like when an order is filled or a scheduled order is placed.
*   **order\_check:** Used in live trading to verify if orders are still active on the exchange, helping prevent issues.
*   **risk:** Notifies you when the risk manager prevents a new signal from being opened.
*   **info:** Lets you receive manual or strategy-generated messages attached to active signals.
*   **common\_error:**  Handles and logs non-fatal errors that don't stop the backtest or live session.
*   **critical\_error:**  Signals severe, unrecoverable errors that will end the session.
*   **validation\_error:**  Alerts you when there are problems with your strategy's configuration or the data you're using.

## Interface IMethodContext

The `IMethodContext` provides essential information to the backtest-kit framework about the specific trading environment being used. Think of it as a set of labels that tell the system which strategy, exchange, and data frame are relevant for a particular calculation or action. This context ensures that the right pieces of the puzzle are connected during the backtesting process. It includes the names of the strategy, the exchange it’s operating on, and the data frame being used; the data frame name is blank when operating in live mode. The `IMethodContext` is automatically passed around by the framework, so you typically don't need to handle it directly.

## Interface IMemoryInstance

The `IMemoryInstance` interface outlines how different memory storage systems – whether they’re local, persistent, or even just dummy data – should behave.

It provides methods for interacting with memory. 

You can initialize the instance with `waitForInit`.  `writeMemory` lets you store data associated with a unique ID, along with a description and timestamp. The `searchMemory` function helps you find relevant data using full-text search, only showing entries created up to a specific time. `listMemory` retrieves all entries, also respecting that time limit.

To delete specific data, use `removeMemory`, and `readMemory` allows you to retrieve a single entry, but will not return it if it’s newer than the specified time. Finally, `dispose` helps release any resources the instance is using when you’re finished with it.

## Interface IMarkdownTarget

This interface lets you pick and choose which detailed reports you want to see when running backtests. Think of it like customizing your dashboard. You can turn on reports for things like strategy signals (entry and exit), risk rejections, breakeven events, partial profits, portfolio heatmaps, strategy comparisons, performance bottlenecks, scheduled signals, live trading activity, overall backtest results, signal lifecycle events, tracking your highest profits, and monitoring maximum drawdowns. By toggling these flags, you control exactly what level of detail you receive about your backtest.

## Interface IMarkdownDumpOptions

This interface defines the options used when generating markdown documentation, providing details about where the information originates. It allows you to specify the location of a file, like the directory path and filename, along with context like the trading pair (symbol), the strategy being used, the exchange platform, the timeframe, and a unique identifier for the signal. Essentially, it gives you a way to pinpoint exactly which data the documentation represents, enabling organized and targeted output.

## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework communicate about what's happening. It’s a way to keep track of important events, diagnostic details, and any potential issues that arise.

You can use it to record general events, such as agents starting up or sessions connecting.

The `debug` method is for more detailed information helpful during development or when troubleshooting.

`info` logs standard updates about successes and validations, giving you a general overview of how things are progressing.

`warn` is for situations that might need a closer look, even if they don’t stop the system from working.

## Interface ILogEntry

The `ILogEntry` interface represents a single entry in the backtest kit's log history. Each log entry has a unique identifier, a level indicating its severity (like "log", "debug", "info", or "warn"), and a timestamp marking when it was created.  You'll also find a date for better readability.

To help pinpoint the origin of the log, it includes information about the execution environment, such as the method context and execution context.  Finally, any additional arguments passed when creating the log are also included, giving you a full picture of what happened.

## Interface ILog

The `ILog` interface provides a way to keep track of what’s happening during your backtesting or trading simulations. It's designed to let you see a complete history of the events and messages generated by your strategies and the backtest kit itself.

Specifically, the `getList` method allows you to retrieve all the log entries that have been recorded, giving you a full picture of the simulation’s progress and any important details or warnings that occurred. This is incredibly useful for debugging, understanding strategy behavior, and analyzing performance.

## Interface IHeatmapRow

This describes a single row of data within a heatmap used to analyze trading performance for a specific asset. It provides a comprehensive set of statistics, breaking down how a strategy performed on that particular trading pair.

You'll find key metrics like total profit/loss, risk-adjusted returns (Sharpe and Sortino ratios), drawdown information, and the number of trades won and lost. It also dives into details like average win/loss amounts and durations, and streak analysis.

Beyond basic performance, the heatmap row offers insights into market dynamics, such as buyer and seller pressure and trend strength, ultimately helping you understand the strategy's behavior and potential. A lot of these numbers help evaluate not just *if* a strategy is profitable, but *how consistently* it's profitable and how risky it is.

## Interface IFrameSchema

The IFrameSchema defines a specific time period and frequency for your backtesting. Think of it as setting up a window in time that your trading strategy will be tested against. 

Each schema has a unique name for identification, and you can add notes to describe it. You'll specify the interval – like every minute ("1m"), hour ("1h"), or day ("1d") – which determines how often timestamps are generated.

You also define the start and end dates for the backtest period, marking the beginning and end of the window. Finally, you can include callbacks to hook into different stages of the frame's lifecycle.


## Interface IFrameParams

The `IFrameParams` object holds the essential information needed to set up a frame within the backtest-kit framework. Think of it as a container for configuration details. It includes a `logger` which is a tool for recording debugging information, helping you understand what's happening inside the frame. You also specify an `interval` which is a descriptive name to easily identify the frame during the backtesting process.

## Interface IFrameCallbacks

The `IFrameCallbacks` interface lets you hook into key moments in the timeframe generation process. Specifically, you can provide a function that's triggered after a new set of timeframes is created.

This allows you to observe what timeframes were generated, when they started and ended, and what interval was used.

It's a handy way to verify the timeframe generation is working as expected or to keep a record of the timeframes used in your backtest. You can also use it to validate the timeframes before they’re used in further calculations.


## Interface IFrame

The `IFrame` interface is a core component for setting up the timeline of your backtesting process. It's responsible for creating the sequence of dates and times that your trading strategy will be evaluated against.

Essentially, it provides a way to generate a list of timestamps—think of them as specific points in time—for each symbol you're trading, based on a chosen timeframe like daily, weekly, or hourly.

The `getTimeframe` method is the key here.  You give it a symbol (like "BTCUSDT") and a frame name (like "D" for daily), and it returns a promise that resolves to an array of those timestamps, spaced consistently according to your selected timeframe. This array acts as the backbone for iterating through your historical data during the backtest.

## Interface IExecutionContext

The `IExecutionContext` object is like a little package of information passed around to your trading strategies and exchange interactions. Think of it as the current state of things.

It tells your code what trading pair you're working with, like "BTCUSDT," and precisely when the operation is happening – what the current timestamp is.

Crucially, it also indicates whether you're running a test (backtest mode) or a real-time trade. This helps your code behave differently depending on the environment.

## Interface IExchangeSchema

This schema describes how backtest-kit interacts with a specific cryptocurrency exchange. It’s essentially a blueprint for connecting to and retrieving data from an exchange.

Each exchange needs a unique identifier – the `exchangeName` – to be recognized within the system.  You can also add a `note` to provide extra context for developers.

The core of the schema is the `getCandles` function.  This is how backtest-kit pulls historical price data (candles) for a trading pair from the exchange. It specifies the symbols, time intervals, start dates, and the number of candles needed.

`formatQuantity` and `formatPrice` handle the exchange's specific rules for how to display the quantities of assets and their prices, making sure they’re correct for the exchange. If you don't define these, a default precision is applied.

There are also optional functions for retrieving order books (`getOrderBook`) and aggregated trades (`getAggregatedTrades`), allowing for more detailed analysis.  If these are not provided, calling them will result in an error.

Finally, `callbacks` lets you hook into certain events happening during data retrieval for custom actions or logging.

## Interface IExchangeParams

This interface defines the configuration needed for a connection to an exchange within the backtest-kit framework. Think of it as the blueprint for how your backtest interacts with a simulated exchange.

It requires several essential functions to retrieve data and format orders. You'll need to provide methods to fetch historical candles, format trade quantities and prices to match the exchange’s rules, retrieve order books, and access aggregated trade data.

Each of these functions must handle the 'backtest' flag, which is crucial for distinguishing between real-time and historical data. The `logger` and `execution` properties provide context for debugging and tracking your backtest’s progress.


## Interface IExchangeCallbacks

The `IExchangeCallbacks` interface lets you register functions that will be called by the backtest-kit framework when it receives data from an exchange.

Specifically, the `onCandleData` property allows you to define a function to be executed whenever new candlestick data becomes available. This function receives details like the symbol, the candlestick interval (e.g., 1 minute, 1 hour), the timestamp of the earliest data, the number of data points retrieved, and an array containing the actual candlestick data. You can use this to react to new market data in your backtest.

## Interface IExchange

The `IExchange` interface defines how your backtesting environment interacts with an exchange's data. It allows you to retrieve historical and future candle data, essential for simulating trades. You can request candles from the past or look ahead to future data, which is important for backtesting scenarios.

The framework provides tools to handle the specific formatting requirements of different exchanges, ensuring orders and prices are correctly represented. It also offers a way to calculate the VWAP (Volume Weighted Average Price) – a common metric for understanding price trends – based on recent trading activity.

You can also retrieve current order book information and aggregated trade data for a trading pair to understand market depth and recent activity.  The `getRawCandles` method provides a very flexible way to retrieve candle data, letting you specify start and end dates, or just a number of candles. This is all designed to help prevent look-ahead bias and ensure accurate backtesting results, respecting the current time of your backtest simulation.

## Interface IEntity

This interface serves as the foundation for any data that’s stored and retrieved persistently within the backtest-kit framework. Think of it as the parent for all your trading-related data objects, ensuring they all have a consistent structure for interacting with the system. It's a blueprint guaranteeing that entities like trades, orders, or account snapshots share a common foundation.

## Interface IDumpInstance

The `IDumpInstance` interface defines how a component saves data during a backtest or trading simulation. Think of it as a way to capture snapshots of what's happening—messages, records, tables, errors, and more—and store them for later analysis. Each instance focuses on a specific combination of a signal and a storage location, keeping things organized.

The interface provides several methods for different types of data:

*   `dumpAgentAnswer` saves the entire conversation history from an agent.
*   `dumpRecord` handles simple key-value data.
*   `dumpTable` stores data in a structured table format, automatically figuring out the column headers.
*   `dumpText` allows saving raw text or Markdown content.
*   `dumpError` logs error descriptions.
*   `dumpJson` saves complex data as a JSON block.

Finally, `dispose` cleans up and releases any resources used by the instance, making sure everything is tidy when you're done.

## Interface IDumpContext

The IDumpContext helps organize and identify data being recorded during a trading process. It's like a little package of information given to a component that handles dumping data. 

This context includes things like a unique signal identifier to track which trade the data relates to, a bucket name for grouping data by strategy or agent, and a unique ID for the dump entry itself. There's also a description field for a human-readable label, useful for understanding what the data represents, and a flag to indicate whether the data comes from a backtest or a live trading session. It's primarily used behind the scenes to manage and categorize data.

## Interface ICommitRowBase

This interface, `ICommitRowBase`, serves as a foundational structure for handling events related to commits within the backtest-kit framework. Think of it as a way to hold information about a trade or action that needs to be recorded, but not immediately processed. It ensures these events are handled at the right time, particularly when the system needs to be sure it's operating within a suitable environment. 

The `symbol` property simply tells you which trading pair is involved (like BTC-USDT). The `backtest` property is a flag that indicates whether the action happened during a simulated backtest, which is useful for analysis and validation.

## Interface ICheckCandlesParams

This interface defines the information needed to check if candle data already exists in storage. It's used to quickly verify if your historical data is available without having to search through files.

You'll specify the trading symbol like "BTCUSDT", the name of the exchange providing the data, the timeframe of the candles (e.g., 1-minute candles, 4-hour candles), and a date range to check. 

Essentially, it's a structured way to ask, "Do I have the candle data for this specific symbol, exchange, timeframe, and date range?"

## Interface ICandleData

This interface defines the structure of a single candlestick, which is a common way to represent price data over time. Each candlestick holds information about the opening price, the highest and lowest prices reached, the closing price, and the volume of trades that occurred during that time period. The `timestamp` tells you exactly when that candlestick's time interval began. This data is essential for tasks like calculating moving averages or running backtests to evaluate trading strategies.

## Interface ICacheCandlesParams

This interface helps manage how your backtesting system handles historical data caching. It lets you define callbacks—special functions—that run at key moments during the data loading process. Specifically, you can set functions to be triggered *before* the validation phase begins and *before* the warm-up phase kicks in after a validation failure. These callbacks allow you to monitor or log data loading events as your backtest prepares.

## Interface IBroker

This interface defines how your code connects to a real brokerage or exchange, acting as a bridge between the backtesting framework and live trading. It's all about executing orders and receiving updates.

The `waitForInit` method is your handshake – use it to connect to the exchange, load credentials, and prepare everything for live trading.

When a signal needs to be closed (take-profit, stop-loss, or manual close), the `onOrderCloseCommit` method is called. This is your chance to place the real exit order and record profit/loss.  If anything goes wrong (throws an error), the framework tries again on the next tick, giving you a chance to retry.

Similarly, `onOrderOpenCommit` handles opening new positions. It’s called before the framework changes its internal state.  If an error occurs here (throws an error), the framework rolls back any changes, as if the order never happened, and retries.

`onOrderActiveCheck` monitors open positions to ensure the order still exists on the exchange.  Throwing an error here means the framework closes the position. It's important to handle network issues gracefully and *not* throw an error in those cases.  This method is the exception-based alternative to event-driven approach via `onSignalActivePing`.

`onOrderScheduleCheck` works like `onOrderActiveCheck` but for scheduled (resting) orders, checking for order cancellations.

`onSignalActivePing` is a purely informational hook for open positions – it's your chance to reconcile your VWAP view with the actual exchange data (e.g., handle gapped prices).  Unlike `onOrderActiveCheck`, throwing here *doesn't* close the position.

`onSignalSchedulePing` is similar to `onSignalActivePing` but for scheduled orders.

`onSignalIdlePing` runs when the strategy is idle, useful for housekeeping tasks.

The `onSignalScheduleOpen` method is invoked when a scheduled order is created; you'll place the resting order here, tagging it for later monitoring.

`onSignalScheduleCancelled` handles scenarios where a scheduled order is cancelled, and you should cancel the related real order.

Finally, several `on...Commit` methods (`onPartialProfitCommit`, `onPartialLossCommit`, `onTrailingStopCommit`, etc.) are called when specific actions are committed, allowing for real-time confirmation and adjustments. These generally involve placing real orders or updating existing ones.



The whole design emphasizes that these methods are gatekeepers, protecting the framework’s internal state during live execution. Errors during execution cause retries instead of abrupt failures.

## Interface IBreakevenData

This interface defines the data needed to save and load information about whether a breakeven point has been achieved for a specific trading signal. It's designed for easy storage, typically as a simple boolean value, and allows the system to remember the breakeven status even when restarting. Think of it as a snapshot of whether the trading strategy has met its initial profit target. It's used to persist the state of a trading strategy, ensuring that the system can recall important milestones.

## Interface IBreakevenCommitRow

This object represents a commitment related to a breakeven calculation within the backtest. It signals that a breakeven point has been reached and needs to be recorded. 

The `action` property confirms that this is a breakeven action. 

The `currentPrice` represents the price level at which the breakeven calculation was performed, providing context for the breakeven event.

## Interface IBreakeven

The `IBreakeven` interface helps manage a strategy's breakeven point—the price level where losses are covered. It's used by components that track and react to this crucial milestone.

Essentially, it monitors a signal’s stop-loss. When the price moves favorably enough to offset transaction costs, the stop-loss is automatically adjusted to the entry price. This is a way to protect profits and reduce risk.

The `check` method performs this assessment, looking to see if breakeven has been achieved.  It considers whether the price has moved sufficiently, and if so, it triggers an event, remembers the event’s details, and saves this information.

The `clear` method is used to reset the breakeven state when a trade is finished, like when a take-profit or stop-loss is hit or the trade expires. It cleans up all related data to prepare for the next trade.

## Interface IBidData

This interface represents a single bid or ask price point within an order book. It holds the price at that level, which is stored as a string, and the quantity of the asset available at that price, also stored as a string. Essentially, it defines a single line on the buy or sell side of the market.

## Interface IAverageBuyCommitRow

This interface describes a single step within a queued average-buy strategy, sometimes called a DCA (Dollar-Cost Averaging) commit. It represents one purchase made as part of the overall averaging process.

Each commit has a specific action – always "average-buy" – to identify it.

The `currentPrice` tells you the price paid for this particular purchase.  You’ll also see the `cost` of that individual purchase, representing the USD amount spent. Finally, `totalEntries` tracks how many averaging entries have been made up to this point in the strategy.

## Interface IAggregatedTradeData

IAggregatedTradeData holds information about a single trade that took place. Think of it as a record of a transaction, containing key details like the price and quantity involved. Each trade has a unique ID and a timestamp to indicate exactly when it happened.  You'll also find out if the buyer was acting as a market maker, which helps in understanding the trade's direction within the market.

## Interface IActivityEntry

An `IActivityEntry` represents a single instance of a backtest or a live trading run that's currently happening. Think of it as a record keeping track of what's running and where. 

These entries are created when a task starts, like when a backtest begins or a strategy is launched, and then they're removed when the task finishes successfully or encounters an error. 

The system uses these entries to monitor what's happening and to ensure that multiple tasks aren't trying to do the same thing at the same time, avoiding conflicts.

Each entry includes the trading symbol (like "BTCUSDT"), details about the strategy and exchange involved (like the strategy's name), and whether it's a backtest or a live run.

## Interface IActivateScheduledCommitRow

This interface represents a message that's placed in a queue to trigger the activation of a previously scheduled commitment. Think of it as a notification telling the system to proceed with an action that was planned ahead of time.

It includes the action type, which is always "activate-scheduled," along with a signal ID, which uniquely identifies the signal being activated.  You can also optionally provide an activation ID if the activation is initiated directly by a user. This helps track the origin of the activation request.

## Interface IActionStrategy

The `IActionStrategy` interface gives your action handlers a way to peek at whether a trading signal is waiting to be acted upon. Think of it as a way to check if something is about to happen before your custom code runs.

It lets you safely decide if certain actions, like adjusting stop losses or taking partial profits, should be skipped if no signal is currently active. 

Specifically, it provides two key methods: `hasPendingSignal` which tells you if there's an open position and `hasScheduledSignal` which tells you if a future signal is queued up. These checks help prevent actions from running unexpectedly when there's nothing to act on.

## Interface IActionSchema

This defines a blueprint for custom actions you can attach to your trading strategies. Think of actions as hooks that let you inject extra functionality into your backtesting process.

They’re designed to help you connect your strategy to external systems like state management libraries (like Redux) or for things like logging events, sending notifications, and collecting data.

Each action gets its own instance for every strategy run, giving it access to all the events happening during that run. You can add multiple actions to a single strategy.

Here's what's involved:

*   **actionName:** A unique name to identify your action when you register it.
*   **note:** A helpful note to explain what the action does – good for your own documentation.
*   **handler:**  This is the core of your action – the code that gets executed. You can provide a constructor, or a set of functions that mimic an action.
*   **callbacks:** These are optional functions you can use to control when your action runs, like before or after certain events.

## Interface IActionParams

This interface, `IActionParams`, defines the information an action receives when it's created. Think of it as a package containing everything an action needs to function properly.

It includes a logger to help you track what's happening and identify any problems.  You’ll also find details like the strategy and timeframe the action belongs to.

It tells you whether the action is running in a backtesting environment, and importantly, gives you access to the current signal and position information for the strategy. This context is essential for making informed decisions within your trading actions.

## Interface IActionCallbacks

The `IActionCallbacks` interface lets you customize how your trading actions behave during different phases, offering hooks for initialization, cleanup, and event handling. Think of it as a way to inject your own logic into the trading process.

You can use these callbacks for things like connecting to databases, initializing services, saving state, or even logging and monitoring activity. Importantly, these callbacks are all optional and work both synchronously and asynchronously.

Here's a breakdown of the specific events and what you can do with them:

*   **`onInit`**: This runs when an action handler starts up. Use it to set up resources like database connections or load any necessary data.
*   **`onDispose`**: This is called when the action handler is finished. It's ideal for closing connections, flushing data, or saving the current state.
*   **`onSignal`**: This gets triggered whenever a signal arrives from the strategy, regardless of whether you're in backtest or live trading.
*   **`onSignalLive`**: Specifically for live trading, this provides signal events.
*   **`onSignalBacktest`**: Just for backtesting, this callback handles signal events.
*   **`onBreakevenAvailable`**:  Called when the stop-loss moves to the entry price.
*   **`onPartialProfitAvailable`**: Fires when a partial profit level is reached.
*   **`onPartialLossAvailable`**: Triggered when a partial loss level is reached.
*   **`onPingScheduled`**: Gets called periodically while a scheduled signal is waiting to activate.
*   **`onScheduleEvent`**: Handles events related to scheduled signals, like when a signal is scheduled or cancelled.
*   **`onPendingEvent`**: Lets you respond to when a pending position is opened or closed.
*   **`onPingActive`**:  Triggered regularly while a pending position is open.
*   **`onPingIdle`**: Fired every tick when there are no active signals.
*   **`onRiskRejection`**:  Called when a signal is rejected by the risk management system.
*   **`onOrderSync`**: Used for manually confirming order openings and closings—throw an error to reject the operation, which will be retried.
*   **`onOrderCheck`**:  Checks if pending orders are still valid on the exchange and can throw an error if the order isn't found, causing the position to close.



The `onScheduleEvent`, `onPendingEvent`, `onPingActive`, and `onOrderCheck` events provide manual wiring points to directly control exchange interactions, offering an alternative to using a Broker adapter. These callbacks allow you to customize and fine-tune your trading actions for specific scenarios.

## Interface IAction

This interface, `IAction`, acts as a central hub for your custom logic within the backtesting framework. Think of it as a place to plug in your own systems – like a Redux store, logging tools, or even a real-time dashboard – to react to what's happening during trading.

The framework will notify you of various events through these methods: `signal` (for general trading updates), `signalLive` and `signalBacktest` (for live and backtest modes respectively), and more specific events like breakeven, partial profit/loss adjustments, and scheduled signal milestones.

Beyond standard trading signals, you'll receive notifications regarding ping events (monitoring signal status), schedule events (signal creation and cancellation), pending signals, order synchronization, and risk rejections.

The `orderSync` and `orderCheck` methods are particularly powerful, letting you influence order placement and confirmations – but remember that exceptions here have specific behaviors.

Finally, `dispose` provides a chance to clean up any resources you’ve used when the testing is complete.  By implementing these methods, you can tailor the framework to your exact needs.

## Interface HighestProfitStatisticsModel

This model holds information about the most profitable trading events that occurred during a backtest. 

It essentially stores a complete history of these high-profit moments, with the most recent ones appearing first in the `eventList`. You can also easily see the total number of profitable events that were recorded overall through the `totalEvents` property. Think of it as a scorecard highlighting the best performing trades.

## Interface HighestProfitEvent

This represents a single instance where a position reached its highest profit. It holds all the details about that peak performance moment. You'll find information like the precise time it happened, the trading pair involved, the name of the strategy that generated the trade, and a unique ID for the signal that triggered it. 

It also includes details about the position itself—whether it was a long or short trade—along with the total profit and loss realized. Crucially, it tracks the highest profit achieved during the position's entire life, the maximum drawdown experienced, and the price points at which the position was opened, targeted for take profit, and set for a stop loss. Finally, it indicates whether this event occurred during a backtesting simulation.

## Interface HighestProfitContract

This interface describes the information you'll receive when a trading strategy hits a new peak profit level. It provides details such as the trading symbol involved (like "BTC/USDT"), the current price at that moment, and the exact time of the update. You’ll also get context about the strategy's name, the exchange being used, and the timeframe being analyzed (for example, a 1-minute chart).

The included signal data gives you specifics about the trade itself, and a flag tells you whether this update came from a historical backtest or a live trading session. 

This data allows you to build custom responses to those profit milestones, potentially triggering actions like adjusting stop-loss orders or taking partial profits.

## Interface HeatmapStatisticsModel

This model summarizes the overall performance of your entire trading portfolio, providing a broad view across all the assets you're trading. It breaks down key metrics like total profit and loss, Sharpe Ratio, and total number of trades for the whole portfolio.

You'll find aggregated data for each individual symbol represented in the `symbols` array, allowing you to understand how each asset contributes to the overall portfolio performance.

The model also includes metrics that offer a more nuanced perspective, such as the trade-count-weighted average peak and fall profit/loss, which smooth out extreme results and give a better picture of typical performance. Other calculated metrics such as average trade duration, median profit percentage, consecutive win/loss streaks, and various risk-adjusted return ratios (Sharpe, Sortino, Calmar) are included as well. Finally, a look at the overall expectancy and expected yearly returns provides additional context for evaluating your portfolio’s potential.

## Interface DoneContract

This interface describes what happens when a background process finishes, whether it's a backtest or a live trading session. It gives you information about the completed process, like which exchange was used, what strategy ran, and whether it was a backtest or live trade. You'll see this information when a background task, initiated by `Live.background()` or `Backtest.background()`, is done. 

It tells you things like the exchange name, strategy name, and symbol being traded. If it’s a backtest, the `backtest` property will be true; otherwise, it's a live trade.  The `frameName` property will be empty if running in live mode.


## Interface CronHandle

This object, returned when you schedule a task with the Cron system, lets you easily cancel that scheduled task. Think of it as a simple way to say "I don't need this task to run anymore" – it effectively removes the scheduled job without needing to remember the exact command you used to schedule it. It’s a clean way to undo a scheduled task registration.

## Interface CronEntry

A CronEntry defines when and how a particular function should be executed within your backtesting environment. It’s essentially a schedule for your code.

Each entry needs a unique name to identify it, and that name can't contain colons.

You also specify a candle interval—like every minute, five minutes, or hourly—to determine the timing of execution. If you skip defining an interval, the entry becomes a "fire-once" entry, running just once at the very beginning.

The `symbols` property allows you to control the scope of execution. If left empty, the function runs just once for all backtests. However, if you provide a list of symbols, it runs once for each symbol within that list.

Finally, the `handler` property is the function that actually gets executed according to the defined schedule and scope.

## Interface CriticalErrorNotification

This notification signals a critical error that requires the backtest process to stop immediately. 

It carries important details about the error, including a unique identifier, a human-readable message explaining what went wrong, and the full error object with its stack trace and any associated data. 

You’ll notice the `backtest` property is always false because these errors originate from the live trading context, not the backtesting environment itself. This notification provides vital information for debugging and addressing serious issues.

## Interface ColumnModel

This interface helps you define how data should be presented in a table. Think of it as a blueprint for each column.

Each column gets a unique identifier (`key`) so you can refer to it, and a friendly name (`label`) to show in the table header.

The `format` property lets you customize how the actual data is displayed—you can use it to transform numbers, dates, or anything else. 

You can also control column visibility with `isVisible`, allowing you to dynamically show or hide columns based on certain conditions.

## Interface ClosePendingCommitNotification

This notification is sent when a pending trading signal is closed before it fully activates. It provides a wealth of information about the closed position, useful for understanding why the signal was closed and its performance. You’ll find details like a unique identifier for the notification, a timestamp, and whether it originated from a backtest or live trading environment. 

The notification includes key metrics like the total number of entries (potentially from a dollar-cost averaging strategy), partial closes performed, the original entry price, and extensive profit and loss (PNL) data. This includes peak profit achieved, maximum drawdown, and corresponding prices and costs. Furthermore, you get details about the signal itself, the strategy that generated it, and an optional note explaining the reason for the closure. Lastly, a timestamp indicating when the notification was created is also available. This comprehensive data allows for detailed analysis of signal performance and the reasons behind its closure.


## Interface ClosePendingCommit

This event signals that a previously opened position has been closed. It includes details about the closure, such as a unique identifier for the reason behind it. You’ll also find information about the position's profit and loss (PNL), the highest profit it reached, and the largest drawdown it experienced throughout its lifetime. Essentially, this event provides a snapshot of the closed position's performance history.

## Interface CancelScheduledCommitNotification

This notification lets you know a previously scheduled trading signal has been cancelled before it was activated. It provides detailed information about the cancelled signal, including a unique identifier, when the cancellation occurred, and whether it happened during backtesting or live trading. You'll find specifics about the trading pair, the strategy that generated the signal, and details like the original entry price, the total number of entries and partial closes, and comprehensive performance metrics such as peak profit, maximum drawdown, and profit/loss figures, all presented with considerations for slippage and fees. The note property allows for a custom description explaining the cancellation reason, and a creation timestamp confirms when the notification was generated.

## Interface CancelScheduledCommit

This interface lets you cancel a scheduled signal event. It's used when you want to stop a signal that's been planned for later execution.

You'll specify the action as "cancel-scheduled" to indicate what you're doing.  You can also include a `cancelId` to provide a reason for the cancellation, which is helpful for tracking and debugging.

The interface also includes information about the performance of the related strategy, providing the total Profit & Loss (`pnl`), the highest profit reached (`peakProfit`), and the largest loss experienced (`maxDrawdown`) throughout the strategy's activity leading up to the signal’s creation. This gives you insight into the strategy's performance at the time of cancellation.

## Interface BreakevenStatisticsModel

The `BreakevenStatisticsModel` helps you understand how often breakeven points are reached during a backtest. It keeps track of all the times a breakeven event occurred, providing a detailed list of each event. You can also quickly see the total number of times a breakeven was achieved, giving you a simple overview of how consistently breakeven points are being hit. This model is useful for assessing the risk and performance related to breakeven milestones in your trading strategy.

## Interface BreakevenEvent

This data structure holds all the key details whenever a trading signal reaches its breakeven point. It's like a snapshot of what happened at that moment, providing a comprehensive record for analysis and reporting.

You'll find the exact time of the event, the trading symbol involved, the name of the strategy used, and a unique identifier for the signal itself. It also includes details about whether it was a long or short position, the current market price, and the entry price that marks breakeven.

Information about the original take profit and stop loss levels, along with details about any dollar-cost averaging (DCA) or partial closes performed, are also included. Finally, it captures performance metrics like unrealized profit and loss, and any notes or explanations associated with the signal. It also tracks the signal's lifecycle, noting when it became active and when it was initially scheduled.

## Interface BreakevenContract

The `BreakevenContract` represents a specific event: when a trading signal's stop-loss is moved back to the original entry price. This usually signifies the trade has moved into profit enough to cover initial costs and reduce risk.

It's a valuable signal for keeping tabs on your strategy's safety and milestones – essentially, when your risk is being actively managed. These events are designed to be reliable; each signal generates this notification only once.

Here's a breakdown of the information included with each `BreakevenContract`:

*   **symbol**: The trading pair involved, like BTCUSDT.
*   **strategyName**: The name of the strategy that created the signal.
*   **exchangeName**: The exchange where the trade is happening.
*   **frameName**:  The timeframe being used (like a 5-minute chart; an empty string means live trading).
*   **data**: The full original data of the trading signal.
*   **currentPrice**: The price at which the breakeven was reached.
*   **backtest**: A flag indicating if this event came from a historical test or live trading.
*   **timestamp**:  The precise time the event occurred (live trading) or the candle’s time (backtesting).

Consumers of these events include services that create reports and users who want to be notified directly.

## Interface BreakevenCommitNotification

This notification signals that a breakeven point has been reached and a trading action has been executed. It provides a wealth of information about the trade, including a unique identifier, when it happened (timestamp), and whether it occurred during a backtest or live trading.

You’ll find details about the traded asset (symbol), the strategy responsible for the signal, and the exchange used. It also includes the entry and take profit/stop loss prices, both original and adjusted for trailing, alongside details about any DCA (Dollar Cost Averaging) or partial closes that occurred.

The notification goes further, offering a comprehensive view of the trade's financial performance – including profit/loss (pnl) figures, peak profit, and maximum drawdown metrics. You can see how the trade performed relative to the original entry price and understand the overall financial impact of the position with details like total investment and profit/loss percentages. Finally, there's an optional note field for added context about why the breakeven action was triggered.

## Interface BreakevenCommit

The BreakevenCommit event signals that a position has reached a breakeven point, essentially meaning the strategy has adjusted the position to protect profits and limit potential losses. It provides a snapshot of the position's performance at the time of this adjustment, including the current market price.

You’ll find details about the position’s overall profit and loss (PNL), as well as key metrics like the highest profit achieved (peak profit) and the largest drawdown experienced.

The event also clarifies the initial entry price, original take profit and stop loss prices, and how they may have changed due to trailing strategies.  Finally, it includes timestamps marking when the signal was created and when the position was initially activated. This information allows you to understand the circumstances surrounding the breakeven adjustment and the position's history.


## Interface BreakevenAvailableNotification

This notification signals that your trading position now has the opportunity to break even – meaning the stop-loss order can be adjusted to your original entry price. It provides a wealth of information about the trade, including a unique identifier, the exact time it occurred, and whether it's from a backtest or live trading.

You'll find details like the trading pair (e.g., BTCUSDT), the strategy used, and the exchange involved. The notification also gives you the current market price, the entry price, and the trade direction (long or short).

Beyond the basics, it includes crucial performance metrics like peak profit, maximum drawdown, and detailed profit/loss breakdowns. You'll see the original prices, the number of entries and partial closes, and how slippage and fees have impacted the P&L.  Finally, it can include a note providing context about why this breakeven opportunity arose.

## Interface BeforeStartContract

This interface, `BeforeStartContract`, lets you hook into the very beginning of a trading strategy run. It's a signal that's sent right before the strategy starts processing data, giving you a chance to do setup tasks like opening log files or resetting counters. It's guaranteed to fire only once per run and is always followed by an `AfterEndContract` signal, ensuring a clean lifecycle even if things go wrong.

The signal provides crucial information about the run, including the trading symbol (like "BTCUSDT"), the name of the strategy, the exchange providing data, and whether it’s a backtest or live run. You'll also find the current price and the event’s timestamp as a `Date` object and its milliseconds representation, saving you time and simplifying data handling. If it’s a backtest, the `when` property represents the intended start time of the historical data, while in live mode, it's the current time.

## Interface BacktestStatisticsModel

This model provides a detailed breakdown of your backtesting results, offering a wealth of information to evaluate your trading strategy. It organizes data into key performance indicators, like the total number of trades, win rate, and overall profit. You'll find metrics covering profitability (average P&L, total P&L), risk (standard deviation, Sharpe Ratio), and trade characteristics (average duration, step size).

Several important ratios help assess risk-adjusted returns and potential future performance, such as the Calmar Ratio and Expectancy. Furthermore, the model analyzes trade sequences with metrics like average consecutive win/loss P&L, and examines market pressures with buyer/seller strength indicators. Finally, it classifies the overall trend and provides a confidence level for that assessment, based on historical price data. Remember, any numeric value marked as "null" signifies that the calculation was considered unreliable or unrepresentative due to data limitations.

## Interface AverageBuyCommitNotification

This notification lets you know when a new portion has been bought in a position using a dollar-cost averaging (DCA) strategy. It provides a ton of details about this specific averaging purchase, including the exact time it happened, whether it's part of a backtest or a live trade, and which exchange it occurred on. You'll find key information like the current price, the total cost of this purchase, the calculated effective average entry price, and the total number of DCA entries made so far.

Beyond the immediate details of the purchase, the notification also includes a comprehensive snapshot of the position's performance. This includes metrics like peak profit, maximum drawdown, and profit/loss percentages. Essentially, it gives you a complete picture of how the DCA strategy is impacting the position's overall health and potential.  You can also see details like the original entry price, take profit and stop loss levels, and signal creation timestamps for more in-depth analysis. It’s like a detailed report card for each DCA step.

## Interface AverageBuyCommit

This interface represents an average-buy event within a trading strategy, signaling that a new averaging entry has been added to an existing position. The `action` property definitively marks this as an average-buy event. It provides a snapshot of the position's state at the moment the averaging buy occurred, including the `currentPrice` at which the buy executed and the `cost` of that specific buy. 

You'll also find the `effectivePriceOpen`, which reflects the updated average entry price after incorporating the new buy.  The information includes profitability metrics: `pnl` (current unrealized profit and loss), `peakProfit` (the highest profit seen so far for this position), and `maxDrawdown` (the largest loss experienced). 

Details about the original trade setup like `priceOpen`, `priceTakeProfit`, and `priceStopLoss` are included, along with their original, untrailed values (`originalPriceTakeProfit` and `originalPriceStopLoss`). Timestamps, `scheduledAt` and `pendingAt`, track the signal creation and position activation times, respectively.

## Interface AfterEndContract

This interface signals the end of a strategy run, whether it finished normally, encountered an error, or was cancelled. It's a critical point for cleanup tasks that need to happen once per run, such as saving data, closing connections, or sending notifications. You can rely on receiving this event exactly once for each strategy run, paired with a corresponding "start" event.

The `when` property indicates the time of completion: in backtesting, it's the historical time of the last processed candle, or the frame's start date if nothing was processed; in live trading, it's the current wall-clock time rounded to the nearest minute.  This property, along with `timestamp` (which is the same value but in milliseconds), gives you a reliable reference for when the run concluded.

The event also provides key details like the trading symbol, strategy name, exchange, and frame name, allowing you to identify the specific run that ended.  You’ll also find a `backtest` flag to distinguish between simulated and live runs, and `currentPrice` for a convenient, readily available price at the completion time.

## Interface ActivePingContract

This defines what happens when a trading strategy is actively waiting for a signal to trigger – essentially, it's a regular heartbeat. Every minute while a pending signal is active, this event is sent out. It provides information like the trading pair (e.g., BTCUSDT), the name of the strategy using it, the exchange involved, and the timeframe being monitored.

You also get all the details of the pending signal itself, like the take profit and stop loss prices. Importantly, the current price of the asset is included, letting you build custom logic that reacts to price movements.

Finally, it tells you whether this ping is part of a backtest (historical data) or live trading.  The timestamp represents the time of the ping—either the real-time moment for live trading or the candle timestamp during backtesting. Developers can use this information to monitor signals and customize how their strategies behave.

## Interface ActivateScheduledCommitNotification

This notification signals that a scheduled trading signal has been activated, meaning a trade is about to be executed. It's triggered when a user manually initiates a scheduled signal, regardless of the current market price.

The notification provides a wealth of information about the upcoming trade, including a unique identifier, the exact time of activation, and whether it's happening in a test or live environment. You'll find details about the trading pair (like BTCUSDT), the strategy that generated the signal, and the exchange being used.

It dives deep into the specifics of the trade itself, outlining the trade direction (long or short), the entry price, take profit and stop-loss levels, and any adjustments made to those prices. There’s also a breakdown of how the trade was built, including any dollar-cost averaging (DCA) involved and any partial closes that have occurred.

Crucially, it includes comprehensive profit and loss (PNL) data, like total profit/loss, peak profit achieved, and maximum drawdown experienced so far.  You'll also find information about when the signal was initially scheduled and the current market price at the time of activation. Finally, there's an optional note field for providing context or explaining the rationale behind the signal.

## Interface ActivateScheduledCommit

This data structure represents an event triggered when a scheduled signal is activated. It contains a wealth of information about the trade being executed, including whether it's a long or short position, the entry and exit prices (original and adjusted), and the current market price at the time of activation. You’ll also find key performance metrics tied to the position, such as total profit and loss (PNL), peak profit, and maximum drawdown – all calculated up to the moment the signal was generated.  A unique identifier for the activation reason can be provided by the user, and timestamps indicate when the signal was created and when the activation occurred. This allows you to track and analyze the performance and behavior of your automated trading strategies.
