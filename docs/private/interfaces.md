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

This interface describes a signal that's sent when a walker is being stopped. 

Imagine you have multiple automated trading systems running at once; this signal tells you which one is being paused. 

It includes the trading symbol, the name of the strategy being stopped, and the specific name of the walker that's being halted. 

This allows for targeted interruptions – you can stop a particular walker on a specific symbol and strategy without affecting others.


## Interface WalkerStatisticsModel

The WalkerStatisticsModel provides a clear way to represent the results of a backtesting process. It builds upon the existing WalkerResults interface, adding a special focus on comparing different trading strategies against each other. Specifically, it contains an array detailing the performance of each strategy that was tested, allowing for easy analysis and comparison of their results. This model is particularly useful when generating reports or performing more complex analysis of backtest outcomes.

## Interface WalkerContract

The WalkerContract represents updates during the backtesting process when comparing different strategies. It's like a progress report, letting you know when a strategy finishes its test run and how it performed.

Each time a strategy completes, this contract provides information about that run, including the strategy's name, the exchange and symbol being tested, and key statistics from the backtest. 

You’ll also find details about the metric being optimized, along with the current best-performing strategy and how many strategies have been evaluated so far against the total number planned. The metric value tells you how well the strategy did, and if the value is missing, it indicates an issue with that particular backtest.

## Interface WalkerCompleteContract

This interface describes what's sent when a backtesting process finishes, giving you a complete picture of the results. It bundles together information about the specific backtest—like the name of the walker, the trading symbol, the exchange, and the timeframe used—along with the optimization metric. You'll find details about how many strategies were tested, which one performed the best, and the actual value of that best metric. It also includes a full set of statistics related to the winning strategy.

## Interface ValidationErrorNotification

This notification lets you know when a risk validation check fails during the backtesting process. 

It’s a way for the system to signal that something went wrong with your trading rules or conditions.

Each notification provides a unique identifier, a clear error message that's easy to understand, and detailed information about the error, including a stack trace. 

The `backtest` property will always be false because these errors originate from the live trading environment, not the simulated backtest itself. Essentially, it’s a heads-up about potential issues you should investigate before deploying your strategies.

## Interface ValidateArgs

This interface, `ValidateArgs`, is a central way to ensure consistency across your backtest kit configuration. Think of it as a checklist for all the key components of your trading setup.

It defines properties like `ExchangeName`, `FrameName`, and `StrategyName`, among others, each representing a part of your setup (like the exchange you're trading on, the timeframe you're using, or the trading strategy itself).

For each of these properties, you'll provide an enum – a predefined list of valid options. The system then uses this to check if the values you’ve chosen are actually recognized and supported within the backtest kit, preventing errors and ensuring everything works correctly. This helps catch potential mistakes early on when setting up a backtest.

## Interface TrailingTakeCommitNotification

This notification tells you when a trailing take profit order has been executed. It's like a confirmation that your strategy has automatically adjusted its take profit and closed a position.

The notification includes a unique ID and timestamp to help track events. You'll find details about the trading pair (symbol), the strategy that triggered the action, and the exchange where the trade happened.

Crucially, it provides the original and adjusted take profit and stop-loss prices, letting you see how the trailing mechanism impacted the trade.

Alongside the core trade details like entry and exit prices, position direction (long or short), and the total number of entries and partial closes, it also delivers comprehensive performance data. This includes the position's overall profit and loss (pnl), peak profit, maximum drawdown, and relevant pricing data – all helping you analyze your strategy's effectiveness. 

Finally, there's an optional note field for human-readable explanations of why the signal was generated, and timestamps detailing the signal's creation and activation.

## Interface TrailingTakeCommit

This interface describes an event that happens when a trailing take profit order is triggered. It gives you details about the price movements and calculations that led to this event. You'll find information like the current market price, the percentage shift used to adjust the take profit, and the overall profit and loss (pnl) of the position.

The event also includes data on the position's history, such as the highest profit achieved (peakProfit) and the largest drawdown experienced. You can see the initial entry price, the current take profit and stop loss prices, as well as the original values before any trailing adjustments were applied. Finally, timestamps tell you precisely when the signal was created and the position began.

## Interface TrailingStopCommitNotification

This notification tells you when a trailing stop order has been triggered and executed. It provides a wealth of information about the trade, including a unique identifier, the exact time it happened, and whether it occurred during a backtest or live trading. You’ll find details about the trading pair, the strategy used, and the exchange involved.

The notification includes comprehensive pricing information, such as the entry price, original and adjusted stop-loss and take-profit prices, and the current market price at the time of execution. It also breaks down the position details – whether it was a long (buy) or short (sell) trade.

Furthermore, it provides a complete picture of the trade’s profitability, including total profit and loss, peak profit, maximum drawdown, and key price points. If the trade involved averaging or partial closes, you’ll find details about the number of entries and partials executed. Finally, optional notes can provide additional context or reasoning behind the signal.

## Interface TrailingStopCommit

This describes an event triggered when a trailing stop order is executed. It provides a detailed snapshot of the trade's status at the moment the trailing stop was activated.

The event identifies the action as a "trailing-stop" and includes the percentage shift used to adjust the stop-loss price. You'll find the current market price when the adjustment occurred, alongside the total profit and loss (pnl) for the trade.

It also gives you a look at the position's performance history, showing the peak profit and maximum drawdown reached.  The trade direction (long or short) is specified, along with the initial entry price.

You can access the updated take profit and stop loss prices, as well as their original values before any trailing adjustments. The event also includes timestamps indicating when the signal was created and the position became active. This allows for precise tracking and analysis of trailing stop performance.

## Interface TickEvent

This describes the `TickEvent` data structure, which is a central way to represent events happening during trading. It bundles together all the relevant information about a tick, regardless of whether it's a new order, a closed trade, or a scheduled signal.

Each `TickEvent` has a timestamp marking when it occurred, and an `action` type to specify what's happening (like "closed", "opened", or "scheduled").  You'll find details about the trading pair involved (`symbol`), the signal that triggered it (`signalId`), and the type of position being held (`position`).

For events related to trades, you'll also see information like the entry price (`priceOpen`), take profit and stop-loss levels, and how many entries were made for a DCA strategy.  Profit and loss data, both unrealized and realized, are included (`pnlCost`, `pnl`), along with progress towards take profit and stop-loss targets.

If a position is closed or cancelled, reasons for that action are included.  Finally, durations, peak and fall PNL percentages for closed positions, and pending/scheduled timestamps are also available for specific event types. This consistent format makes it easier to analyze and generate reports from your trading activity.

## Interface SyncStatisticsModel

The `SyncStatisticsModel` helps you understand how your trading signals are syncing with the backend. It essentially collects data about signal synchronization events.

You can access a complete list of these events through the `eventList` property, giving you granular details about each sync. 

The `totalEvents` property provides the overall number of synchronization events that occurred.  

Specifically, `openCount` tracks how many times signals were opened, and `closeCount` tracks how many times signals were closed. This allows you to monitor the lifecycle of your trading signals.

## Interface SyncEvent

The `SyncEvent` object holds all the important details about what’s happening during a trading signal’s lifecycle, which is really useful for creating reports. It's like a snapshot in time, containing information like when the event occurred (`timestamp`), which trading pair it relates to (`symbol`), and the name of the strategy involved (`strategyName`).

You'll find details about the signal itself, such as its unique ID (`signalId`) and what action triggered the event (`action`). It also includes vital pricing information – the current market price (`currentPrice`), the price at which you entered the trade (`priceOpen`), and any take profit or stop loss levels that were set (`priceTakeProfit`, `priceStopLoss`, `originalPriceTakeProfit`, `originalPriceStopLoss`).

If you're using dollar-cost averaging (DCA), the `SyncEvent` records how many entries were made (`totalEntries`) and any partial closures of the position (`totalPartials`). The performance metrics, like profit and loss (`pnl`), peak profit, and maximum drawdown, are also included to help analyze the signal's effectiveness. For signals that have been closed, you’ll see the reason why (`closeReason`). The `createdAt` property indicates when the record of the event was created in the system.

## Interface StrategyStatisticsModel

This model holds a collection of statistics generated during a backtest or live trading session, giving you a detailed view of your strategy's activity. It includes a comprehensive list of all events that occurred, letting you examine individual actions.

You'll find counts for various event types, such as canceled schedules, pending closes, and partial profit/loss adjustments. The model also tracks events related to trailing stops, trailing take profits, breakeven adjustments, and activated schedules.

Finally, it provides a count for average-buy (dollar-cost averaging) events, offering insight into a specific trading behavior. This information helps you analyze strategy performance and identify areas for optimization.


## Interface StrategyEvent

This data structure acts as a central record for everything happening during your trading strategy's execution, whether you're running a backtest or live trading. It captures key details like the timestamp of the event, the trading symbol involved, the name of your strategy, and the exchange being used. You'll find information about the signal that triggered the action, the type of action taken (like buying, selling, or adjusting stops), and the current market price at that moment.

The event includes specifics related to profit-taking and loss-limiting, such as percentages for closing positions and adjustments for trailing stops. If an action was scheduled or pending, identifying IDs are provided for tracking. Creation and execution times are recorded, along with indicators for backtest versus live mode and the direction of the trade (long or short).

Detailed position information is included, such as the entry price, take profit and stop-loss levels, and the original prices before any trailing adjustments. For strategies utilizing dollar-cost averaging (DCA), you'll also see the effective entry price, the number of entries made, and the cost of those entries. A user-provided note can be attached for additional context, and the current profit and loss is also included.

## Interface SignalSyncOpenNotification

This notification signals that a trading signal has been activated and a position has been opened, typically through a limit order. It provides a wealth of detail about the trade, including a unique identifier, the time it happened, and whether it occurred during a backtest or live trading. You’ll find key information like the trading symbol, the strategy that generated the signal, and the prices used for entry, stop-loss, and take-profit.

The notification also gives you a comprehensive view of the position’s performance so far, showing the profit/loss, peak profit, maximum drawdown, and related prices and percentages. It breaks down costs, trade direction, and details about any DCA averaging or partial closures that might have occurred.  Finally, timestamps are provided for when the signal was initially created, when the position went live, and when the notification itself was generated.

## Interface SignalSyncCloseNotification

This notification tells you when a trading signal, generated by a strategy, has been closed – whether it hit a take profit or stop loss, timed out, or was closed manually. It provides a ton of detail about the trade, including when it was created, the trading pair involved, and the strategy that generated it. You'll find information about the trade's profit and loss (both absolute and percentage), its peak profit, and maximum drawdown, giving you a complete picture of its performance. The notification also breaks down details like entry and exit prices, and even includes specifics about how many entries and partials were involved. Finally, it specifies *why* the signal was closed, and offers a chance to include a custom note explaining the reasoning.

## Interface SignalSyncBase

This defines the core information shared by all signal synchronization events within the backtest-kit framework. Think of it as the basic building block for understanding where signals originate.

Each signal event will include the symbol being traded (like "BTCUSDT"), the name of the strategy that created the signal, and the exchange it’s connected to.  You'll also see the timeframe being used, which is relevant only when backtesting—it's blank during live trading.

To track signals, there's a unique identifier (signalId) alongside a timestamp, letting you pinpoint precisely when the signal was generated. Finally, it contains the full details of the signal itself, providing a complete picture of the trading decision.

## Interface SignalScheduledNotification

This notification tells you about a trading signal that's been planned for future execution. It's like getting a heads-up about a trade that will happen later.

Here's a breakdown of what the information means:

*   **`id`**: A unique identifier for this specific signal notification.
*   **`timestamp`**: The date and time when the signal was scheduled.
*   **`backtest`**: Indicates whether this is a simulation (`true`) or a real-time trade (`false`).
*   **`symbol`**: The trading pair involved (like BTCUSDT).
*   **`strategyName`**: The name of the strategy that generated the signal.
*   **`exchangeName`**: The exchange where the trade will take place.
*   **`signalId`**: A unique identifier for the signal itself.
*   **`position`**: Whether the trade is a long (buy) or short (sell).
*   **`priceOpen`**: The intended entry price.
*   **`priceTakeProfit`**: The target price to take profits.
*   **`priceStopLoss`**: The price to cut losses.
*   **`cost`**: The total cost of entering the position.
*   **`pnl`**, **`peakProfit`**, **`maxDrawdown`**:  These provide performance metrics like profit/loss, highest profit, and maximum loss experienced by the position so far.
*   **`pnlPercentage`**: Profit/loss expressed as a percentage.
*   **`scheduledAt`**: The exact time the signal was originally scheduled.
*   **`currentPrice`**: The price of the asset at the time the signal was scheduled.
*   **`note`**: A free-text explanation of why the signal was generated.
*   **`createdAt`**: The time the notification was created.

The other properties such as `totalEntries`, `totalPartials`, `originalPriceTakeProfit`, and similar offer detailed insights into how the signal was constructed, including information on DCA averaging and partial closures.

## Interface SignalOpenedNotification

This notification tells you when a new trade has been opened – essentially, a position has been started. It’s like getting an alert when a trading strategy puts money to work.  The `type` field confirms this is a "signal.opened" notification, and the `id` is a unique identifier for this specific event.

The notification includes a lot of detail about the trade itself: When it started (`timestamp`), whether it happened during a simulation (`backtest`), the asset being traded (`symbol`), the strategy that triggered the trade (`strategyName`), and the exchange used (`exchangeName`).

You'll find the unique ID for the trading signal (`signalId`), whether it was a long ("buy") or short ("sell") position, and the price at which the trade was executed (`priceOpen`).  There’s also information about potential profit targets (`priceTakeProfit`), stop-loss levels (`priceStopLoss`), and the original prices before any adjustments like averaging.

It also tracks details related to any DCA averaging used (`totalEntries`), partial closes (`totalPartials`), the initial cost of the position (`cost`), and the profit and loss (PNL) figures (`pnl`, `peakProfit`, `maxDrawdown`, and related percentage and price data). Finally, there’s a space for an optional explanation (`note`) and timestamps detailing when the signal was created and when the position went live (`scheduledAt`, `pendingAt`, and `createdAt`).

## Interface SignalOpenContract

This event signifies that a pre-planned trade, based on a limit order, has been executed. It's triggered when the trading framework gets confirmation from the exchange that your order has been filled, either buying or selling. In testing mode, it happens when the price meets your specified criteria (lower than your buy price or higher than your sell price).

This notification is particularly useful for systems outside the core framework, like order management tools or audit logs, to confirm the actual execution of your trades.

The event provides a wealth of information about the trade:

*   The current market price at the time of execution.
*   The total profit and loss (PNL) realized on the trade.
*   The highest profit achieved during the trade's lifetime.
*   The largest loss experienced.
*   The total cost associated with entering the position.
*   The direction of the trade (long or short).
*   The exact price at which the order was filled.
*   The initial take profit and stop loss prices set for the trade, both as originally defined and after any adjustments.
*   The original entry price used before any averaging techniques.
*   Timestamps for when the signal was initially created and when the position was activated.
*   Details about any averaging (DCA) used to enter the position and any partial exits taken during the trade.

## Interface SignalInfoNotification

This notification type lets you receive updates from your trading strategies, specifically when they want to share informational notes about a position they've opened. Think of it as a way for your strategies to communicate key details about a trade as it's happening.

Each notification contains a wealth of information, including the strategy's name, the exchange it's operating on, the trading pair involved (like BTCUSDT), and even the current market price. You’ll also find details about the trade itself, such as the entry price, take profit and stop-loss levels, and how many entries were used if the strategy employs dollar-cost averaging.

Beyond the basics, you can track the position's performance with metrics like profit/loss (both in USD and as a percentage), peak profit, and maximum drawdown, all measured from the point the strategy initiated the trade. There are also timestamps marking key stages of the trade, allowing you to pinpoint exactly when events occurred.  The note field provides a space for the strategy to supply custom, human-readable details that may be important for understanding its decision making. A notification ID is also available for linking this event with other systems.

## Interface SignalInfoContract

This structure helps you understand and react to information signals coming from your trading strategies. 

It's like a notification system that lets strategies communicate important details about their actions.

Each notification contains details about the trading symbol, the strategy's name, the exchange being used, and the timeframe it's operating in. 

You’ll also find the complete data from the signal, the current price, a user-defined note for extra explanation, and an optional ID for tracking. 

Finally, it indicates whether the event occurred during a backtest (using historical data) or live trading, and it includes a precise timestamp for when the event happened.

## Interface SignalData$1

This data structure holds information about a single trading signal after it has been closed. Think of it as a record of one completed trade. It includes details like which strategy created the signal, a unique ID for that signal, and the trading pair involved (like BTC/USDT).

You'll also find information about the trade itself – whether it was a long or short position – and its performance, represented as a percentage profit and loss (PNL). Crucially, it also explains why the signal was closed and records the exact times when the trade started and ended. This provides a complete picture of a signal's lifecycle within a backtest.

## Interface SignalCommitBase

This defines the core information shared by every signal event within the backtest-kit framework. Think of it as the standard set of data you'll receive whenever a signal is generated or acted upon.

Each signal event includes details like the trading pair's symbol (e.g., BTCUSDT), the name of the strategy that triggered it, and the exchange it was executed on.

You'll also find information about whether the signal is part of a backtest or a live trading session, a unique identifier for the signal itself, and the precise time it occurred.

Crucially, it provides insight into the number of entries made (DCA levels) and partial closes executed, alongside the original entry price before any averaging.  The complete signal data itself is also included, giving you a snapshot of the signal's state. Finally, a note field allows for adding custom explanations about the signal’s reasoning.

## Interface SignalClosedNotification

This notification tells you when a trading position has been closed, whether it was due to a take profit, stop loss, or other reason. It provides a wealth of information about the trade, including a unique identifier, the timestamp of the close, and whether it occurred in backtest or live mode. You'll find details about the trading pair, the strategy involved, and the specific entry and exit prices.

The notification also gives you a comprehensive breakdown of the position's performance, including profit and loss percentages, peak profit and maximum drawdown figures, and details about the number of entries and partial closes. There’s even information about how slippage and fees impacted the final profit/loss calculations, along with timing details like when the signal was scheduled, pending, and created. This data allows for a very detailed retrospective analysis of each closed trade.

## Interface SignalCloseContract

This event lets you know when a trading signal has been closed, whether that's because of a profit target, a stop-loss, time expiry, or a manual action. It's designed to help external systems, like order management tools or audit logs, stay in sync with what's happening in the trading process.

The event provides a lot of detail about the closed position, including the current market price, the overall profit and loss, the highest profit achieved, and the biggest loss experienced during the trade. It also tells you the original and effective entry, take profit, and stop-loss prices, along with when the signal was created and when the position was activated.

You'll find information on the trade direction (long or short), the reason for the closure, and details about any dollar-cost averaging or partial closes that occurred. The `totalEntries` and `totalPartials` values help you understand how the position was built up and closed down.

## Interface SignalCancelledNotification

This notification type is sent when a signal that was scheduled for execution is cancelled before it actually happens. It provides detailed information about the cancelled signal, allowing you to understand why it was cancelled and what its intended parameters were. 

You’ll find details like the unique identifier of the signal, the timestamp of the cancellation, and whether the cancellation occurred during a backtest or in a live trading environment. It also includes information about the trading pair, the strategy that generated the signal, and the intended trade direction (long or short). 

The notification contains key price levels – take profit, stop loss, and entry price – as well as the original values before any adjustments were made. Further details about DCA averaging and partial closes are provided through `totalEntries` and `totalPartials`.  A `cancelReason` property explains the cause of the cancellation, and a `cancelId` is available if the cancellation was triggered by a user action. The signal’s scheduling and pending times are also included, alongside any user-provided notes.


## Interface Signal

This `Signal` object holds all the vital information about a single trade. It tracks the initial entry price, represented by `priceOpen`, which is the price when you first bought or sold.

The `_entry` property stores a history of when and how positions were initially opened – keeping track of the price, cost, and timestamp for each entry. 

Similarly, `_partial` keeps a record of any partial exits from the position, noting the reason (profit or loss), the percentage of the position closed, the price at the time, the cost basis, and the number of shares or contracts sold.


## Interface Signal$2

This `Signal` object represents a trading signal within the backtest-kit framework. It keeps track of important details about a trade.

The `priceOpen` property stores the price at which the position was initially opened – essentially, the entry price.

It also maintains a record of all entries made for this signal, within the `_entry` array. Each entry includes the price, associated cost, and the timestamp of that action.

Finally, `_partial` logs any partial exits or adjustments made during the trade, noting whether it's a profit or loss, the percentage change, current price, cost basis, and the number of units at the time of the partial exit, alongside its timestamp.

## Interface Signal$1

This section details the `Signal$1` object, which represents a trading signal. It holds crucial information about a trade.

The `priceOpen` property tells you the price at which the position was initially opened.

The `_entry` array stores a history of all entry points for this signal, including the price, total cost, and the timestamp of each entry.

Finally, `_partial` tracks any partial exits or adjustments made during the trade’s lifecycle, noting the type of adjustment (profit or loss), percentage change, current price, cost basis, number of shares at the time, and the timestamp.

## Interface ScheduledEvent

This data structure holds all the key details about trading events—when they were scheduled, opened, or cancelled. It's designed to make creating reports and analyzing your backtest results much easier.

You'll find information like the exact time of the event, the type of action that occurred (opening, scheduling, cancelling), and the trading pair involved.  It also includes the signal ID, position type, and any notes associated with the signal.

Crucially, it tracks pricing details like entry price, take profit, stop loss, and any changes made to those prices.  You’ll also see data about partial closes, total entries (if using DCA), and the unrealized profit and loss (PNL) at the time of the event.

For cancelled events, it provides the reason for the cancellation and an ID if it was user-initiated.  There are also timestamps indicating when a position became active or when a signal was originally created, giving a complete timeline of each trade.

## Interface ScheduleStatisticsModel

The `ScheduleStatisticsModel` helps you understand how your scheduled signals are performing.

It gives you a complete overview of all scheduled events, including their details, and summarizes key metrics like the total number of signals scheduled, opened, and cancelled.

You can easily track the cancellation rate (how often scheduled signals are cancelled) and the activation rate (how often scheduled signals become active).

The model also provides insights into how long signals typically wait before being cancelled or activated, measured in minutes, giving you a deeper understanding of your scheduling strategy's efficiency. This data helps you assess and optimize how your signals are handled over time.

## Interface SchedulePingContract

This defines what information you get when a scheduled signal is actively being monitored – it’s like a regular check-in to see how things are going. These check-ins, called "schedule ping events," happen every minute while the signal is running, but not while it's being set up or cancelled.

You can subscribe to receive these ping events and use the data to build your own monitoring systems.

The event includes details like the trading pair (symbol), the name of the strategy being used, the exchange it's on, and the timeframe. You’ll also get all the signal’s data, including the entry price, take profit, stop loss, and the current market price at the time of the ping.  A flag indicates whether this ping is from a historical backtest or live trading. Finally, the event also provides the exact timestamp of the ping.

## Interface RiskStatisticsModel

This model holds data about risk events, helping you understand and monitor your risk management processes. 

It keeps track of every risk rejection event in detail, providing a complete record. 

You'll find the total count of rejections and a breakdown of those rejections, categorized by the trading symbol and the strategy involved. This allows you to easily identify areas needing attention or adjustment in your risk controls.

## Interface RiskRejectionNotification

This notification informs you when a trading signal has been blocked because of risk management rules. It’s a way of knowing why a potential trade didn't happen.

Each rejection notification has a unique ID and a timestamp indicating when it occurred. It also tells you whether the situation arose during a backtest or in live trading.

You'll find details like the trading symbol (e.g., BTCUSDT), the name of the strategy that generated the signal, and the exchange involved. A human-readable explanation of why the signal was rejected is provided in the `rejectionNote` field.

The notification provides more context, including the number of active positions, the current price at the time of rejection, and, if available, information about the signal itself, such as a unique signal ID and details about the proposed trade direction (long or short).

Further technical details include entry and exit prices (take profit and stop loss), estimated duration and a signal description, along with the creation timestamp.

## Interface RiskEvent

This data structure holds information about when a trading signal was blocked due to risk limits. 

Each `RiskEvent` provides details about the rejected signal, including the exact timestamp, the trading pair involved, and the name of the strategy that generated it. 

It also includes technical details like the exchange used, the timeframe, and the current market price.

You’ll find information about the signal itself, how many positions were already open, and a unique ID for the rejection. 

Crucially, it explains *why* the signal was rejected, along with a flag to indicate whether the rejection occurred during a backtest or live trading.

## Interface RiskContract

The RiskContract represents a rejected trading signal due to a risk validation failure. Think of it as an alert when the system prevents a trade from happening because it would violate risk limits.

It's designed to help you monitor and understand actual risk management events, not just normal trading activity.

Here's what information you get with each RiskContract:

*   **symbol:** The trading pair involved, like BTCUSDT.
*   **currentSignal:** All the details about the trade that was attempted (price, position size, etc.).
*   **strategyName:** The name of the trading strategy that tried to place the trade.
*   **frameName:** The timeframe used for the backtest execution.
*   **exchangeName:** The exchange the trade would have been placed on.
*   **currentPrice:** The price of the asset at the time the risk check happened.
*   **activePositionCount:** The total number of open positions you had at that moment.
*   **rejectionId:** A unique ID to help track down specific rejections.
*   **rejectionNote:** A human-readable explanation of why the trade was rejected.
*   **timestamp:** The exact time the rejection occurred.
*   **backtest:**  Indicates whether this rejection happened during a backtest or in live trading.

This information is valuable for things like creating reports and setting up systems to respond to risk violations.

## Interface ProgressWalkerContract

The ProgressWalkerContract defines how information about a background process, like testing trading strategies, is communicated. It provides updates on the walker's progress, specifically detailing which exchange and frame are being used and which trading symbol is involved. You'll see these updates with information like the total number of strategies it's aiming to evaluate, how many it has already handled, and a percentage representing how close it is to finishing. Think of it as a report card for a long-running task, keeping you informed about what's happening. 

It includes properties like `walkerName`, `exchangeName`, `frameName`, `symbol`, `totalStrategies`, `processedStrategies`, and `progress`. These values allow you to monitor the stage of the evaluation and understand the workload being performed.


## Interface ProgressBacktestContract

This contract describes the progress updates you'll receive while a backtest is running. It lets you know which exchange and strategy are being tested, what symbol is being traded, and how far along the backtest is. You'll see the total number of historical data points (frames) being analyzed, as well as how many have already been processed. Finally, it provides a percentage to show you the overall completion of the backtest, ranging from 0% to 100%.

## Interface PerformanceStatisticsModel

This model holds all the performance data collected for a specific trading strategy. It provides a high-level view of how the strategy performed, including its name and the total number of events and duration of the test. 

You'll find detailed statistics broken down by different metrics, allowing you to analyze performance across various aspects of the strategy. Finally, it contains a complete list of all the individual performance events recorded, offering the most granular level of information.

## Interface PerformanceContract

This interface, `PerformanceContract`, is designed to help you understand how quickly different parts of your trading system are running. Think of it as a way to profile your code and find areas where things might be slowing down.

Each time an important action happens—like fetching data or placing an order—a `PerformanceContract` is created.  These contracts record when the event started and ended, along with details like which strategy, exchange, or symbol was involved. The timestamp of the previous event is also included which allows you to see the time elapsed between operations.  It also indicates if the operation took place during a backtest or in a live trading environment. This information lets you pinpoint bottlenecks and optimize your performance.

## Interface PartialStatisticsModel

The PartialStatisticsModel helps you understand how your trading strategy performs when it uses partial fills or takes profits/losses in smaller chunks. It collects data from each of these smaller events.

You'll find an array of detailed event records in the `eventList` property, so you can inspect exactly what happened during each partial profit or loss. 

The `totalEvents` property simply tells you the total number of these partial events that occurred. `totalProfit` and `totalLoss` each count how many times you made a profit or experienced a loss during these partial fills.

## Interface PartialProfitContract

This describes a `PartialProfitContract`, which represents a signal reaching a profit milestone during trading. Think of it as a notification saying "Hey, this trade has made 10%, 20%, or another percentage in profit!" It's used to track how well your strategy is doing and to manage partial take-profit orders.

The notification includes key details: which asset is involved (symbol), which strategy created the trade (strategyName), the exchange and frame used (exchangeName and frameName), all the original data for the signal (data), the current price when the milestone was hit (currentPrice), and exactly which profit level was reached (level).

You'll also know if this event occurred during a backtest using historical data or a live trade (backtest flag), and when the event happened (timestamp). This allows you to understand when and how often your strategy reaches profit milestones.

## Interface PartialProfitCommitNotification

This notification tells you when a portion of a trade has been closed to realize some profit. It provides a wealth of information about the trade, including a unique ID, when it happened, and whether it occurred during a backtest or live trading. You'll see details like the trading pair (e.g., BTCUSDT), the strategy involved, and the exchange where the action took place.

The notification includes specifics on the original entry price, take profit, and stop-loss levels, plus how they might have changed with trailing adjustments. It breaks down key metrics like total profit/loss (both in USD and percentage), peak profit, and maximum drawdown, along with related prices and costs. 

You’ll also find details about the number of entries and partial closes executed, as well as any notes added to describe the signal’s reasoning. Finally, several timestamps are included to understand the signal’s lifecycle, from its initial creation and pending status to when this notification was generated.

## Interface PartialProfitCommit

This event signifies a partial profit-taking action within a trading strategy. It details what happened when a portion of a trade was closed, providing insight into the strategy's risk management and profit-locking approach.

The `action` property confirms this is a partial profit event. 

The `percentToClose` indicates precisely how much of the position was closed, represented as a percentage. 

Alongside, you’ll find key price points: the `currentPrice` at the time of the action, the `priceOpen` (entry price), the `priceTakeProfit` (effective take profit), and the `priceStopLoss` (effective stop loss), as well as the original values before any trailing adjustments.

To help understand performance, the event also includes the `pnl` (total profit and loss of the closed portion), `peakProfit`, and `maxDrawdown` (the largest loss experienced by the trade so far). 

Finally, the `position` type ("long" or "short") clarifies the trade direction and timestamps (`scheduledAt`, `pendingAt`) mark when the signal was created and the position was activated.

## Interface PartialProfitAvailableNotification

This notification signals that a profit milestone has been reached during a trade, like hitting 10%, 20%, or 30% profit. It’s a way to track progress and understand how a trade is performing.

Each notification includes a unique ID, a timestamp, and whether it's from a backtest or a live trade. You’ll also find details like the trading pair, the strategy used, the exchange it’s on, and the signal ID.

The notification also gives you key data points about the trade: the profit level achieved, the current price, the original entry price, the trade direction (long or short), and the initial stop-loss and take-profit levels. You can see how those levels may have adjusted over time.

Detailed financial information is included like total profit and loss (both in USD and as a percentage), peak profit achieved, and maximum drawdown experienced. It breaks down how many entries were used, how many partials were executed, and provides entry and exit prices used for profit/loss calculations. Finally, it provides extra context like a note or timestamps for when the signal was scheduled, went pending, and when this notification was created.

## Interface PartialLossContract

The PartialLossContract represents events triggered when a trading strategy experiences a pre-defined loss level, such as a 10%, 20%, or 30% drawdown. This allows you to track how your strategy is performing and when it hits these loss milestones.

Each event contains detailed information about the loss, including the trading symbol, the strategy and exchange names, the current price that triggered the event, and the specific loss level reached. It also includes the original signal data, the execution mode (backtest or live), and a timestamp indicating when the loss level was detected.

These events are emitted once for each loss level per signal and can be consumed by reporting services or by your own custom logic to monitor and react to strategy performance. The data helps understand the strategy’s drawdown and potential areas for improvement.

## Interface PartialLossCommitNotification

This notification tells you when a partial close of a trading position has happened. It's like a detailed report on what just occurred. You'll see details like a unique ID for the notification, the exact time it happened, and whether it occurred during a backtest or live trading.

The notification includes key information about the trade itself – the trading pair, the strategy that initiated it, and the exchange used. It dives deep into the specifics of the position, including the entry price, take profit and stop-loss levels (both original and adjusted), the trade direction (long or short), and the percentage of the position that was closed.

Beyond the basics, you'll find a wealth of performance data, like the position's total profit and loss, the highest profit achieved, the maximum drawdown experienced, and how that profit/loss breaks down in terms of percentage and absolute value.  

You'll also get granular details such as the original entry price, the total number of entries used (especially useful if the strategy uses dollar-cost averaging), and the number of partial closes already executed. Finally, there's space for an optional note to provide a human-readable explanation of why the partial close was triggered.

## Interface PartialLossCommit

This data represents a partial loss event during a trading backtest. It details the action taken – specifically, a partial closure of a position. You'll find information about the percentage of the position that was closed, along with the current market price at the time of the event. 

The record includes the profit and loss (pnl) associated with the closed portion of the position, as well as the highest profit and largest drawdown experienced by the position overall. You can also see the direction of the trade (long or short), the original entry price, and the take profit and stop loss prices, both as initially set and as they were adjusted.

Finally, timestamps are included to indicate when the signal was created and when the position initially activated. This provides a complete picture of the circumstances surrounding the partial loss.

## Interface PartialLossAvailableNotification

This notification signals that a trading strategy has reached a predefined loss level, like -10%, -20%, or -30% of the initial investment. It's a way to track how a trade is performing and potentially trigger adjustments.

Each notification includes details like a unique ID, the exact time it occurred, and whether it's from a test (backtest) or live trading environment.

You’ll also find key information about the trade itself, such as the trading pair (e.g., BTCUSDT), the strategy that generated the signal, the exchange used, and the direction of the trade (long or short).

The notification provides insight into the trade's performance: original entry price, current market price, take profit and stop loss levels (both initial and adjusted for trailing), and accumulated profit/loss, along with percentage-based performance. 

It also details information about DCA entries, partial closes, and maximum drawdown experienced so far. A 'note' field may offer extra context explaining why the signal was triggered. Finally, it includes timestamps for when the signal was created, pending, and the notification itself was generated.

## Interface PartialEvent

This data structure holds all the key information about profit and loss milestones during a trade. Think of it as a snapshot of where a trade stands at a specific point in time, like when it hits a 10% or 20% profit level. Each event includes details like the exact time it happened, whether it's a profit or loss, the trading pair involved, and the name of the strategy that generated the trade.

You'll also find important pricing information, such as the entry price, take profit target, and stop loss levels, along with their originally set values. If the strategy uses a dollar-cost averaging (DCA) approach, it will also provide information about the number of entries and the original entry price before averaging.

Finally, it keeps track of partial closes if any were executed, along with the unrealized profit and loss (PNL) at that moment, a human-readable explanation of the trade's signal, and timestamps indicating when the position became active and the signal was created. It’s especially useful for creating reports and analyzing trading performance.

## Interface MetricStats

This object holds a collection of statistics related to a particular performance metric. It provides a comprehensive view of how that metric behaved during a backtest or live run.

You'll find details like the total number of times the metric was recorded, the total time it took across all instances, and the average duration.

It also includes measures of variability, like the standard deviation, median, and percentiles (95th and 99th), which help understand the spread of the data.

Finally, it describes the wait times between events triggering the metric, offering insight into the frequency and spacing of occurrences.

## Interface MessageModel

The `MessageModel` represents a single message within a conversation, encompassing various roles like system instructions, user prompts, assistant replies, and tool responses. Each message has a `role` to indicate who sent it, and a `content` field holding the actual text.

Sometimes, messages will also include `reasoning_content`, which offers insight into the model's thought process.

If the assistant used tools, you'll find details about those actions within the `tool_calls` array.

Images can be included in a message as well, and they can be provided as Blobs, raw bytes, or base64 encoded strings.

Finally, if a message is a response to a tool call, a `tool_call_id` will identify the specific tool call being addressed.

## Interface MaxDrawdownStatisticsModel

This model helps you understand the maximum drawdown experienced during a trading simulation. It keeps track of individual drawdown events and provides a count of how many such events occurred. 

The `eventList` property stores a chronological record of each drawdown event, with the most recent ones appearing first.  You can examine this list to analyze the timing and magnitude of these significant losses.

The `totalEvents` property simply tells you how many maximum drawdown events were identified throughout the backtest.

## Interface MaxDrawdownEvent

This data structure represents a single instance of a maximum drawdown event that occurred during a trading position. It captures the details of when and how a drawdown occurred, providing a snapshot of the position's performance. 

Each event includes information like the precise timestamp, the trading symbol involved, the name of the strategy used, and a unique identifier for the signal that triggered the trade. You'll also find the position direction (long or short), along with details about the position’s profit and loss (PNL), its peak profit, and the depth of the drawdown itself. 

The event also records the current price at which the drawdown was recorded, the original entry price, and any set take profit or stop loss levels. A flag indicates whether the event occurred during a backtesting simulation.

## Interface MaxDrawdownContract

The `MaxDrawdownContract` provides information when a new maximum drawdown is encountered for a trading position. It tells you the symbol involved, the current price at that moment, and a timestamp for tracking. 

You'll also get details like the strategy name, exchange, and timeframe being used, along with the specific signal that triggered the position. A key piece of information is the `backtest` flag, letting you know if this drawdown occurred during a simulated backtest or in actual live trading. 

This data helps you monitor risk, understand how your strategy is performing, and build custom logic to respond to drawdown events—like adjusting stop-loss orders or implementing other risk management techniques. It's a valuable tool for proactively managing your trading.

## Interface LiveStatisticsModel

The LiveStatisticsModel provides a detailed breakdown of your trading performance, giving you a comprehensive view of how your strategy is performing in live conditions. It tracks a wide range of metrics, from the total number of trades and wins/losses to more advanced indicators like the Sharpe Ratio and Sortino Ratio.

The model gathers data from every event—idle periods, signal openings, active trades, and closed positions—allowing for robust analysis. Key performance indicators like win rate, average profit per trade, and total profit are all calculated, with values being null if a safe calculation isn’t possible.

Beyond basic profitability, the model dives deeper with metrics to assess risk and efficiency. You'll find information about volatility (standard deviation), risk-adjusted returns (Sharpe and Sortino ratios), and even how trades are trending (bullish, bearish, or sideways).

It also provides insights into trade durations and movement patterns, highlighting average win/loss durations, directional pressures (buyer/seller strength), and even a trend classification with associated confidence. Essentially, this model offers a complete picture of your strategy's health and potential areas for improvement.

## Interface InfoErrorNotification

This component handles notifications about errors that pop up during background tasks, but aren't critical enough to stop everything. Each notification has a unique identifier and includes a detailed error message you can understand. 

You’ll also get a serialized error object, complete with a stack trace and extra details about what went wrong. 

Crucially, these notifications specifically indicate that the error occurred within a background task and not directly in a live trading environment.

## Interface IdlePingContract

This interface describes events that happen when a trading strategy isn't actively making decisions – essentially, it's "idle." 

Think of it as a heartbeat signal indicating the strategy is waiting for instructions. It provides information about *what* strategy is idle, *where* it's running (exchange and symbol), and the current price at the time the signal was emitted.

You can subscribe to these events to monitor the lifecycle of your trading strategies and understand when they're in a passive state.

The events include details such as the trading symbol (like BTCUSDT), the strategy's name, the exchange it’s on, and whether it’s part of a backtest or live trading. You'll also get the current price and a timestamp to mark when the idle event occurred. 
A key piece of info is whether the event is from a backtest (using historical data) or a live trade.

## Interface IWarmCandlesParams

This describes the settings used to gather historical candle data and store it for later use, like preparing for a backtest. You’ll specify the trading pair you're interested in, like "BTCUSDT," along with the exchange providing that data. Then you define the time frame – for instance, 1-minute or 4-hour candles – and the specific start and end dates you want to cover. Essentially, it's a blueprint for downloading and organizing past price data.

## Interface IWalkerStrategyResult

This interface describes the output for a single strategy when you're comparing multiple strategies using a "walker" approach. It bundles together key information about that strategy's performance.

You'll find the strategy's name here, alongside a detailed set of statistics generated from its backtest—things like total return, Sharpe ratio, and drawdown. 

A single metric value, used for ranking the strategies against each other, is also included.  Finally, the `rank` property tells you where this strategy sits in the overall comparison (with a rank of 1 being the best performer).

## Interface IWalkerSchema

The IWalkerSchema defines how to set up A/B tests for different trading strategies. It's like a blueprint that tells the backtest-kit what to compare and how. 

You'll give it a unique name for the walker, and can add a note for your own reference. 

It specifies which exchange and timeframe to use when running backtests for all the strategies involved. 

Critically, you list the names of the strategies you want to compare – these strategies need to have been registered beforehand. 

You can also choose which metric to optimize, such as Sharpe Ratio, or add custom callbacks for specific events during the testing process.


## Interface IWalkerResults

The `IWalkerResults` object holds all the information gathered after a series of trading strategy tests have been run. It essentially represents the final outcome of a backtesting process that compares different strategies. 

You'll find details about the specific asset (the `symbol`) that was traded, the `exchangeName` used for data, and the name of the `walker` itself, which defines the testing procedure.  Finally, it includes the `frameName`, indicating the timeframe used for the analysis, like daily or hourly bars. This object gives you a snapshot of the overall backtest environment.

## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you hook into the backtest kit's process, allowing your code to respond to different events as strategies are tested.

You can use `onStrategyStart` to know when a new strategy is beginning its evaluation. 
`onStrategyComplete` fires once a strategy’s backtest is finished, giving you the final statistics and a metric. 
If a strategy encounters an error during its backtest, `onStrategyError` will be triggered, so you can handle the failure gracefully. Finally, `onComplete` gets called when the entire backtesting run is done, and it provides a summary of the results.

## Interface ITrailingTakeCommitRow

This interface represents a specific action taken within a backtest – a trailing take commit. Think of it as a record of when the system adjusted its target price based on a trailing stop-loss strategy.

It tells you *what* action was taken ("trailing-take"), *how much* the price shifted by (the `percentShift`), and importantly, *at what price* the trailing was initially established (`currentPrice`). 

Essentially, it's a snapshot of a trailing stop-loss adjustment during a simulation.

## Interface ITrailingStopCommitRow

This interface describes a queued action related to trailing stops. It represents a single instruction for adjusting a trailing stop based on market movements.

Essentially, it contains the details of what needs to happen—specifically, a "trailing-stop" action—along with the percentage shift that needs to be applied and the price at which the trailing stop was initially established. Think of it as a record of a trailing stop adjustment, ready to be processed.

## Interface IStrategyTickResultWaiting

This interface describes a special kind of tick result you'll get when a trading signal is scheduled and waiting for the right price conditions to activate. It's not the initial creation of the signal, but what happens as the system monitors it.

Think of it as the framework telling you, "Hey, this signal is ready, but the price hasn’t hit the entry point yet – we're waiting!"

Here's what's included in this information:

*   **The signal itself:** Details about the scheduled trading signal.
*   **The current price:** The price the system is tracking against the signal's entry point.
*   **Strategy and exchange details:**  The names of the strategy and exchange involved in the trade.
*   **Symbol and timeframe:** Information about the trading pair and the timeframe used for analysis.
*   **Progress towards take profit and stop loss:** While waiting, these will always show as zero.
*   **Theoretical P&L:**  The unrealized profit or loss you'd have if the trade were active.
*   **Backtest flag:** Indicates whether this is a backtest simulation or a live trade.
*   **Creation timestamp:** When the tick result was generated, based on either backtest candle data or a live execution.

## Interface IStrategyTickResultScheduled

This interface describes a special kind of tick result that happens when your trading strategy generates a signal and waits for a specific price to be reached before executing a trade. It's like the strategy is saying, "I want to buy BTCUSDT, but I'll wait until the price hits $30,000." 

The `action` property simply identifies this as a "scheduled" type of result.  You'll find the actual details of the signal – like the target price – in the `signal` property. The `strategyName`, `exchangeName`, `frameName`, and `symbol` tell you exactly which strategy, exchange, timeframe and instrument this relates to.

The `currentPrice` represents the price when the signal was initially scheduled.  Knowing whether this happened during a backtest or in live trading is indicated by the `backtest` property. Finally, `createdAt` records when this specific tick result occurred, tied to the candle’s timestamp during backtesting or the execution context’s timestamp when running live.

## Interface IStrategyTickResultOpened

This object represents a signal being created, letting you know a new trading opportunity has appeared. It's fired after the system has checked and saved the signal information. 

You'll find details about the signal itself, like its unique ID and all the important information associated with it. The object also includes information about which strategy, exchange, and timeframe generated this signal, along with the symbol being traded (like BTCUSDT). You’ll see the current price when the signal opened, whether it's a backtest or live trade, and when the signal was created. This gives you a complete picture of what just happened.


## Interface IStrategyTickResultIdle

This interface represents what happens when a trading strategy isn’t actively doing anything – it’s in an idle state. It provides information about the situation at that moment, like the strategy's name, which exchange and timeframe it's operating on, and the symbol being traded. 

You'll also find the current price, whether it's a backtest or live trade, and the time the data was recorded. 

Essentially, it's a snapshot of the market conditions when the strategy isn't taking action, allowing you to track and analyze periods of inactivity.

## Interface IStrategyTickResultClosed

This interface describes what happens when a trading signal is closed, providing detailed information about the outcome. It gives you a snapshot of the signal's final state, including the reason it was closed, the price at which it closed, and a full breakdown of the profit and loss.

You’ll find key details like the strategy and exchange names, the trading symbol, and whether the event is part of a backtest. 

It also includes the timestamp of the closing event, the signal's original parameters, and a unique ID if the closure was initiated by the user. The 'createdAt' field tells you when this information was recorded relative to the candle or execution. This comprehensive data helps you analyze the performance of your trading strategies.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a planned trading signal is cancelled before it actually executes. This could be because the signal didn’t trigger or because it was stopped out before a trade could be opened.

It provides details about the cancelled signal, the current price at the time of cancellation, and when the cancellation happened.  You'll also find information about which strategy and exchange were involved, the timeframe being used, the trading pair, and whether it's a backtest or live scenario.

A key piece of information is the `reason` for the cancellation.  There's also a unique identifier, `cancelId`, which is useful if a user manually cancelled the signal using a cancellation command. Finally, you can see the exact time the cancellation event was recorded.

## Interface IStrategyTickResultActive

This interface represents a situation where a trading strategy is actively monitoring a signal, waiting for a take profit (TP), stop loss (SL), or time expiration. It provides a snapshot of the trading position's status.

You’ll find information such as the name of the strategy and the exchange it's operating on, as well as the trading symbol and timeframe being used. 

The `percentTp` and `percentSl` properties show the progress towards your take profit and stop loss levels, respectively, indicating how close you are to those targets. 

The `pnl` property details the current, unrealized profit and loss, accounting for fees, slippage, and any partial position closures. There's also a flag indicating whether this data originates from a backtest or a live trading environment. 

Finally, timestamps are included to track when the result was created and when the last candle was processed, useful for timing and synchronization in backtesting.

## Interface IStrategySchema

The IStrategySchema defines the blueprint for how a trading strategy functions within the backtest-kit framework. Think of it as a recipe – it outlines the strategy’s name, any helpful notes for developers, and importantly, how frequently it should generate trading signals.

It's the central component for registering a strategy.

The `getSignal` function is the heart of the strategy, responsible for determining whether to buy, sell, or hold, taking into account the current price and any scheduled entry points.  You can also specify callbacks for certain events like when a trade opens or closes.

Furthermore, you can associate risk profiles and actions with your strategy for better risk management and integration with other systems. Finally, there’s a space for runtime data which allows you to add custom monitoring or external logic to the strategy’s execution.

## Interface IStrategyResult

The `IStrategyResult` represents a single run of a trading strategy during a backtest. Think of it as a record summarizing how a specific strategy performed. 

It holds the strategy's name so you know which strategy the data belongs to. You'll also find a detailed set of statistics about the backtest itself, providing a comprehensive view of its performance.

A key value is the metric value – this is what's used to rank strategies, and can be null if the backtest was invalid. Finally, it keeps track of when the first and last signals occurred during the backtest, which is useful for understanding the timeline of a strategy's activity.


## Interface IStrategyPnL

This interface describes the result of a profit and loss (PnL) calculation for a trading strategy. It provides details on how much your strategy gained or lost, expressed both as a percentage and in absolute dollar terms. 

The `pnlPercentage` tells you the overall profit or loss as a percentage of your initial investment. 

You’ll also find the `priceOpen` and `priceClose`, which show the entry and exit prices, respectively, accounting for realistic trading costs like fees (0.1%) and slippage (0.1%).

The `pnlCost` is the actual dollar amount of profit or loss you experienced, calculated based on your invested capital (`pnlEntries`). The `pnlEntries` property itself represents the total amount of money you initially put into the strategy.

## Interface IStrategyCallbacks

This interface, `IStrategyCallbacks`, lets you hook into key moments of your trading strategy's lifecycle. Think of it as a way to get notified about what's happening – whether a signal is just opening, is actively being monitored, or has closed.

You can specify functions to run when a new signal is opened (`onOpen`), when it's actively being tracked (`onActive`), when no signals are active (`onIdle`), and when it finally closes (`onClose`). 

There are also callbacks for signals that are scheduled to open later (`onSchedule` and `onCancel`), offering flexibility in handling delayed entries and cancellations. You’ll get notified when a signal reaches a partial profit (`onPartialProfit`), a partial loss (`onPartialLoss`), or breakeven (`onBreakeven`). 

The `onTick` callback is triggered with every price update, providing constant insights into the market.

For signals scheduled to open in the future, `onSchedulePing` and `onActivePing` provide minute-by-minute updates, allowing for custom monitoring and potentially adjusting the signal based on changing conditions. Finally, `onWrite` gets called when signal data is saved.

## Interface IStrategy

This interface defines the core functions a strategy needs to implement when used within the backtest-kit framework.

The `tick` function is the heart of the strategy - it's called on each price update to check for signals, trailing stops, and other conditions.

You can use `getPendingSignal` and `getScheduledSignal` to see what signal is currently active or waiting for activation.

Several functions provide insight into the position’s performance, like `getTotalPercentClosed`, `getPositionPnlPercent`, and `getPositionEffectivePrice`, which all leverage DCA data to give a more accurate picture.

The `backtest` method is key for simulating how your strategy would have performed on historical data.  It's a fast way to assess its effectiveness.

Finally, a suite of methods—`stopStrategy`, `cancelScheduled`, `closePending`, `breakeven`, `averageBuy`—allow for manual control and modifications to the strategy’s behavior during testing. There are also many helper functions to gather more position details, like `getPositionHighestProfitPrice`, `getPositionMaxDrawdownPrice`, etc.

## Interface IStorageUtils

This interface defines the core functions any storage adapter used with the backtest-kit trading framework needs to provide. Think of it as the blueprint for how your storage system interacts with the backtesting process. 

It outlines methods for responding to different signal events – when a position is opened, closed, scheduled, or cancelled. These methods allow the storage to react to the trading activity.

The framework also relies on the storage adapter to locate specific signals by their unique ID and to retrieve a full list of all stored signals.

Furthermore, there are functions to process "ping" events, specifically for actively opened and scheduled signals. These ensure that the signal’s update timestamp remains accurate during the backtest.


## Interface IStorageSignalRowScheduled

This interface describes a signal's row information when it's scheduled for execution. 

It holds the current status, which will always be "scheduled".

Alongside the status, it includes the current price at the time the signal was scheduled – essentially, the price used when the signal was initially planned. This price is directly linked to the `IStrategyTickResultScheduled.currentPrice` value, ensuring consistency.

## Interface IStorageSignalRowOpened

This interface describes a signal row that indicates a position has been opened. It contains basic information about the opening of the trade.

Specifically, it confirms the signal's status is "opened" and provides the current price at the time the signal was triggered, which is helpful for tracking performance. Think of it as a record showing when a trade started and at what price.


## Interface IStorageSignalRowClosed

This data structure represents a trading signal that has already been closed. It contains all the crucial information about that closed signal, specifically focusing on its financial performance and how it ended.

You'll find the profit and loss (PNL) achieved when the signal was closed, giving you insight into its profitability. 

It also includes the final price at which the trade was closed, the reason for the closure, and a precise timestamp marking when the trade concluded. This allows for detailed analysis of closed trades and helps understand what factors led to specific outcomes.


## Interface IStorageSignalRowCancelled

This interface describes a signal row that has been cancelled. 

It simply indicates that the signal's current status is "cancelled". This is a straightforward way to represent a signal that is no longer active or valid.

## Interface IStorageSignalRowBase

This interface defines the foundational structure for storing signals within the backtest-kit framework. Every signal, regardless of its specific state, will have these core fields. 

`createdAt` and `updatedAt` record when the signal was initially created and last modified, providing a valuable timeline for analysis. `priority` is used to control the order in which signals are processed, ensuring that more recent or important signals are handled first. These properties are critical for maintaining data integrity and efficient signal management during backtesting and live trading.

## Interface IStateParams

The `IStateParams` interface helps define how your signals manage their stored data. Think of it as a blueprint for organizing signal states. 

It has two main parts: `bucketName` and `initialValue`. 

`bucketName` is like a folder name – it logically groups related pieces of signal data together. For example, you might use "trade" for information about a specific trade or "metrics" for performance measurements. 

`initialValue` sets the starting point for a signal’s data when nothing has been saved yet. It ensures that every signal has a known, usable value right from the start.

## Interface IStateInstance

The `IStateInstance` interface outlines how to manage temporary data for your trading strategies, especially those using LLMs. Think of it as a way to track specific metrics about a trade – like its highest unrealized profit or how long it's been open – throughout its lifetime. 

This data helps your strategies learn and adapt, such as deciding when to exit a trade if it hasn't met certain profit goals after a defined period.

The interface provides methods for initializing the data, reading its current value, updating it, and cleaning up any resources used. Importantly, updates with earlier timestamps will overwrite older data, which is designed to avoid problems when restarting a backtest. The methods also safeguard against look-ahead bias by ensuring that the data read is never from the future.

## Interface ISizingSchemaKelly

This defines a sizing strategy based on the Kelly Criterion, a formula designed to maximize long-term growth. It’s essentially a way to determine how much of your capital to allocate to each trade.

The `method` property confirms you’re using the Kelly Criterion approach.

The `kellyMultiplier` property lets you adjust the aggressiveness of the Kelly Criterion.  A smaller multiplier, like the default 0.25, represents a "quarter Kelly" approach, which is generally considered safer. A higher multiplier would commit more capital per trade, potentially increasing both gains and losses.

## Interface ISizingSchemaFixedPercentage

This schema defines a straightforward trading sizing strategy where the size of each trade is determined by a fixed percentage of your available capital. 

The `method` property simply identifies this as a "fixed-percentage" sizing approach.  The crucial part is `riskPercentage`, which represents the maximum percentage of your capital you're willing to risk on any single trade.  For example, a `riskPercentage` of 1 would mean risking 1% of your capital per trade.


## Interface ISizingSchemaBase

This interface defines the core structure for sizing strategies within the backtest-kit framework. Each sizing strategy will have a unique name to identify it. 

You can also add a note to document the sizing strategy for clarity. 

The sizing schema dictates how much of your account capital to use for each trade, with constraints: you specify a maximum percentage of your account to risk, a minimum and maximum absolute position size.

Finally, you can attach optional callback functions to the sizing strategy for more customized behavior during its lifecycle.

## Interface ISizingSchemaATR

This schema defines how to size trades based on the Average True Range (ATR). It's designed for strategies where risk management relies on ATR values to determine appropriate position sizes.

The `method` property is fixed and will always be "atr-based," indicating this sizing approach.

`riskPercentage` dictates the maximum percentage of your capital you’re willing to risk on each trade – typically a value between 0 and 100. 

Finally, `atrMultiplier` is a key parameter.  It multiplies the ATR value to calculate the distance for your stop-loss orders, effectively determining the size of the position based on the volatility measured by the ATR.

## Interface ISizingParamsKelly

This interface defines the parameters needed to calculate position sizes using the Kelly Criterion. It primarily contains a `logger` property, which allows you to track and debug the sizing calculations. Think of the logger as a way to see what's happening under the hood when the framework is determining how much to trade based on your expected returns and risk. It's especially helpful when experimenting with different Kelly Criterion variations or troubleshooting sizing issues.

## Interface ISizingParamsFixedPercentage

This interface defines how to configure a trading strategy using a fixed percentage of your capital for each trade. It essentially tells the strategy how much to risk on every opportunity.

The `logger` property allows you to connect a logging service so you can see what the sizing calculations are doing – helpful for debugging and understanding how your strategy is behaving. Think of it as a way to keep an eye on the sizing process.

## Interface ISizingParamsATR

This interface defines the settings you’ll use when determining trade sizes based on the Average True Range (ATR). It's primarily used when setting up how much capital you allocate to each trade.

The `logger` property lets you specify a service to help with debugging and tracking what's happening behind the scenes. This is helpful for understanding how your sizing strategy is behaving and identifying any potential issues.

## Interface ISizingCallbacks

The `ISizingCallbacks` interface lets you customize how your trading strategy handles position sizing. It provides a hook, `onCalculate`, which is triggered immediately after the framework determines how much of an asset to trade. This is a great place to add your own logic, maybe to record the calculated size for later review or ensure it aligns with specific rules you’ve set. Think of it as a chance to observe and potentially influence the sizing process without directly modifying the core sizing algorithms.

## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate your position size using the Kelly Criterion, a strategy for determining optimal bet size. To use this, you’ll need to provide the win rate of your trading strategy, expressed as a value between 0 and 1. You’ll also need to specify the average win/loss ratio – essentially, how much you win on average for every loss. These two values are combined to determine how much of your capital to allocate to each trade.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the specific information needed when you want to size your trades using a fixed percentage approach. Essentially, it tells the backtest kit that you're using a strategy where the size of your trade is determined by a set percentage of your available capital.

You'll need to provide the `method`, which confirms you’re using the “fixed-percentage” sizing technique, and also specify the `priceStopLoss` – this represents the price at which your stop-loss order will be placed. This allows the system to accurately calculate and apply your sizing rules within the backtest.

## Interface ISizingCalculateParamsBase

This defines the basic information needed for any sizing calculation within the backtest-kit framework. It ensures that all sizing methods share a common understanding of the trading environment. 

You’ll find properties like the trading symbol, representing the asset being traded (such as "BTCUSDT"), the current balance of your trading account, and the intended price at which you plan to enter the trade. These fundamental details help the sizing logic determine how much of the asset to buy or sell.

## Interface ISizingCalculateParamsATR

This interface defines the settings you'll use when determining how much of your capital to allocate to a trade based on the Average True Range (ATR). You'll specify that the sizing method is "atr-based".  The `atr` property holds the actual ATR value you’re currently using to inform your sizing decisions. Think of it as the volatility metric guiding how much you’ll risk.

## Interface ISizing

The `ISizing` interface is responsible for figuring out how much of an asset to trade in each step of your backtest. It's a core component that determines your position sizes.

Essentially, it provides a `calculate` method. This method takes in some parameters about your risk settings and then returns a number representing the desired position size. 

This calculation happens internally within the backtest execution engine.

## Interface ISignalRow

This `ISignalRow` represents a complete and validated trading signal within the backtest-kit framework.  Each signal is assigned a unique ID and contains all the essential information needed for execution and tracking. It includes details like the cost of the position, entry price, expected duration, and which exchange and strategy the signal belongs to.

The signal also stores important runtime information, such as when it was scheduled and when it went pending. It identifies the trading symbol and indicates if the signal was initially scheduled.

A key feature is the history of partial profit and loss closures (`_partial`), allowing for complex PNL calculations. There are also fields to manage trailing stop-loss and take-profit prices (`_trailingPriceStopLoss` and `_trailingPriceTakeProfit`), overriding the default values dynamically.

For positions built using dollar-cost averaging (DCA), the `_entry` array keeps track of each entry price and cost. The `_peak` and `_fall` properties track the highest profitable and lowest lossing price points, respectively, used for performance analysis. Finally, the `timestamp` property indicates when the signal was created.

## Interface ISignalIntervalDto

This data structure helps manage signals, especially when you need to combine several signals into a single request. Think of it as a way to bundle up signal requests to improve efficiency. It’s used by a utility function that allows you to retrieve multiple signals at once. Each signal within this bundle is assigned a unique ID, making it easy to track and identify them.

## Interface ISignalDto

This interface defines the structure for signal data used within the backtest-kit framework. When a signal is generated, it's packaged into this format, which includes essential details like the ticker symbol, whether it's a long or short position, and a descriptive note.

You'll find fields for the entry price, take profit target, and stop-loss levels, ensuring clear risk management parameters. The `minuteEstimatedTime` property lets you set a time limit for the signal; if no time limit is provided, the position remains open indefinitely until a take profit or stop-loss is triggered.

Finally, the `cost` property represents the monetary investment needed for this trade. An automatically generated ID is assigned to each signal for tracking purposes, although you can provide one yourself.

## Interface ISignalCloseRow

This interface, `ISignalCloseRow`, builds upon the existing `ISignalRow` to provide extra information when a signal is closed by the user. It adds two new fields: `closeId` which uniquely identifies the closure action, and `closeNote`, which allows for recording user-provided context or a reason for the closure. Think of this as a way to track specific user actions related to signal closures, like why a particular signal was stopped. This is useful for understanding and auditing user behavior concerning signal management.

## Interface ISessionInstance

The Session Instance acts as a central hub for holding temporary data specific to a particular trading setup – think of it as a scratchpad for calculations and information related to a single symbol, strategy, exchange, and timeframe. It's designed to hold things like intermediate results from complex calculations, data from AI models, or any accumulated information that needs to be accessed and updated during a trading run.

You'll use it to initialize session data, record new values along with timestamps, and retrieve values as needed.  Importantly, when retrieving data, it prevents looking ahead in time, ensuring fairness and accurate backtesting. When you're finished with a session, the `dispose` method allows you to clean up and release any resources it might be using.

## Interface IScheduledSignalRow

This interface defines a signal that's not immediately acted upon—it's scheduled to trigger when the price reaches a certain level. Think of it as a signal waiting for a specific price to be hit before an order is placed.

It builds upon the basic signal row but adds the concept of a "priceOpen," which is the target price needed to activate the signal. 

Once the price reaches this "priceOpen," the signal transforms into a standard pending signal. 

Initially, the time the signal was scheduled (`scheduledAt`) is tracked, and it updates to the actual time it started waiting (`pendingAt`) once it's activated. 

Essentially, it allows for delayed entry based on price targets.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled signal, but with extra information specifically for cancellations that were requested by the user. Think of it as a special type of scheduled signal designed to handle situations where a previously planned signal needs to be stopped. It includes a unique `cancelId` to identify the cancellation and a `cancelNote` allowing the user to add a reason or explanation for the cancellation. This extra data helps track and manage user-triggered signal cancellations within the system.

## Interface IScheduledSignalActivateRow

This interface represents a scheduled signal that has been activated, potentially by a user action. It builds upon the standard scheduled signal data, adding details specific to how the activation occurred. If a user manually triggered the signal, this interface will contain an `activateId` to identify that specific activation and an `activateNote` to provide additional context from the user's request. Essentially, it's how you track signals that weren’t simply triggered automatically according to a schedule, but involved a bit of human intervention.

## Interface IRuntimeRange

This interface, `IRuntimeRange`, simply describes the timeframe your backtesting will cover. It's essentially a start and end date – the `from` property holds the beginning date of your backtest, and the `to` property holds the ending date. Think of it as setting the boundaries for the historical data your strategy will be tested against. It helps ensure your backtest accurately reflects the period you're interested in analyzing.

## Interface IRuntimeInfo

The `IRuntimeInfo` interface provides essential details about the environment in which your trading strategy is running. It gives you access to key pieces of information like the trading symbol, the timeframe being used for backtesting, and any custom data your strategy might need.  You'll find details about the exchange, strategy, and frame in use, along with the current market price and a timestamp of the current data point. Knowing whether the system is running a backtest or live trade is also included, which is crucial for adapting your logic. Essentially, it’s a package of data to help your strategy understand the situation it’s in and perform accurately.

## Interface IRunContext

The `IRunContext` acts as a central hub for all the information needed when running a piece of code within the backtest-kit framework. Think of it as a combined package, holding details about *where* the code is running (exchange, strategy, frame) and *what* the current conditions are (symbol, timestamp, whether it’s a backtest). It's a unified way to provide all this data to the code, simplifying how things work internally. The framework uses this single object to distribute the information to specialized services that manage different aspects of the context.

## Interface IRiskValidationPayload

This data structure holds all the information needed to assess the risk associated with a new trading signal. It builds upon the initial arguments provided for risk validation, adding details about your portfolio's current state. Specifically, you’ll find the signal itself – the trade suggestion being evaluated – alongside the number of positions you currently hold and a comprehensive list of those active positions. Knowing these details allows your risk checks to accurately determine if taking on a new trade is appropriate given your current portfolio exposure.

## Interface IRiskValidationFn

This defines a function that helps ensure your trading strategies are safe and sound. Think of it as a gatekeeper—it checks if a trade is acceptable based on certain rules. If everything looks good, the function quietly lets the trade through. However, if something's amiss, like too much risk or a violation of a rule, it signals a problem by either returning a specific rejection result or throwing an error. This allows the backtest framework to halt the process and provide you with information about why the trade was rejected.

## Interface IRiskValidation

This section defines how to set up checks to ensure your risk parameters are behaving as expected. Think of it as defining rules to make sure your trading system isn't making any dangerous decisions. You specify a `validate` function, which is the core logic that performs the actual check.  You can also add a `note` to clearly document *why* you've set up that particular validation, making it easier for others (or your future self) to understand its purpose.

## Interface IRiskSignalRow

This interface, IRiskSignalRow, helps manage risk during trading by providing key information about a position. It builds upon the existing signal data to include the entry price, the initial stop-loss level, and the initial take-profit level. This allows for validation and adjustments to risk parameters based on the original plan for the trade. Think of it as a record that holds the fundamental details of a trade's price targets when assessing risk.


## Interface IRiskSchema

This interface lets you define and register risk controls for your portfolio, essentially setting up rules to ensure your trading stays within acceptable boundaries. Think of it as creating a profile for each risk you want to manage.

Each risk profile has a unique identifier called `riskName` so you can easily reference it later. You can also add a `note` to explain the purpose of the profile – a helpful reminder for yourself or other developers. 

You can optionally provide `callbacks` to trigger specific actions based on events like a rejected trade or an allowed trade. The core of this is the `validations` array, where you define the actual rules that your portfolio will follow; these can be individual validation functions or an array of them.

## Interface IRiskRejectionResult

When your risk checks fail, this object tells you why. It gives each rejection a unique ID so you can track it, and it provides a clear, understandable explanation of the problem in the 'note' field. Think of it as a friendly message explaining what went wrong during the validation process.

## Interface IRiskParams

This interface defines the settings you provide when setting up your risk management system. It includes things like the name of the exchange you're working with, a way to log debugging information, and access to accurate time data to avoid issues like looking into the future.

You also get a callback function, `onRejected`, that gets triggered when a trading signal is blocked because it would violate your risk rules. This callback gives you a chance to emit events related to the rejection, separate from other callbacks related to the risk schema. This lets you customize how you handle and report risk limit breaches.


## Interface IRiskCheckOptions

The `IRiskCheckOptions` interface lets you control how risk checks behave when multiple parts of your trading system are trying to access and modify positions at the same time. Specifically, the `reserve` property is key for ensuring accuracy.  When set to `true`, it creates a temporary marker in the system's record of active positions. This marker guarantees that any other check happening simultaneously "sees" the planned position change before it actually happens, preventing potential errors caused by overlapping actions. Think of it like a brief reservation that makes sure everyone's calculations are based on the most up-to-date information.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, provides all the information needed to determine if a new trade should be allowed. Think of it as a set of validation checks performed *before* a trading signal is actually generated. It gathers data like the trading pair's symbol, the signal being considered, the name of the strategy making the request, and details about the exchange, risk profile, timeframe, current price, and timestamp. Essentially, it’s a snapshot of the trading environment at the moment a potential trade is being evaluated, allowing you to define rules to prevent unwanted or risky trades.

## Interface IRiskCallbacks

This interface defines optional functions that your trading strategy can use to respond to risk-related events. Think of these as notifications – your strategy can choose to react when a trade is blocked due to risk limits, or when a trade is approved after passing all the checks. The `onRejected` function will be called when a trade signal fails a risk assessment, and the `onAllowed` function will be triggered when a trade signal is deemed safe to proceed with. You can use these callbacks to log events, adjust parameters, or perform other actions based on risk assessments.

## Interface IRiskActivePosition

This interface describes an active trading position being monitored for risk analysis. Think of it as a snapshot of a trade – it holds details like which strategy opened it, the exchange used, and the trading symbol involved, like BTCUSDT.

It includes fundamental information about the position, such as whether it’s a long or short trade, the entry price, and any stop-loss or take-profit levels set. You'll also find information about the estimated duration of the trade and a timestamp indicating when the position was initiated. Essentially, it’s a structured way to represent and track individual trading positions across different strategies.


## Interface IRisk

This interface defines how to manage risk when trading. It's designed to prevent strategies from taking on too much risk simultaneously.

The `checkSignal` function is your first line of defense—it verifies if a new trade idea aligns with your predefined risk limits. A safer, more reliable version, `checkSignalAndReserve`, not only checks the signal but also immediately sets aside a placeholder for the position, ensuring atomicity and preventing race conditions when multiple strategies are competing for resources.

Once a trade is validated and reserved, you'll use `addSignal` to formally register the trade and its details, and `removeSignal` to clean up when a trade is closed. It’s essential that you always follow a successful `checkSignalAndReserve` with either `addSignal` or `removeSignal` to avoid creating inaccurate risk records.

## Interface IReportTarget

This interface lets you fine-tune what data gets recorded during your trading tests. Think of it as a way to control the level of detail in your reports.

Each property—like `strategy`, `risk`, `breakeven`, and so on—represents a specific area of trading activity.

Setting a property to `true` turns on logging for that area, providing more detailed information in your reports. Conversely, `false` means that activity won't be logged.

This configuration gives you precise control over what data you collect, allowing you to focus on the most important aspects of your trading strategies.

## Interface IReportDumpOptions

This interface lets you customize how report data is saved and organized. Think of it as a set of labels you attach to your data to easily find it later. You can specify things like the trading pair (like BTCUSDT), the name of the strategy used, the exchange it ran on, the timeframe (e.g., 1 minute, 1 hour), a unique ID for the signal, and the name of the walker used for optimization. This helps keep your backtest results clearly tagged and searchable.

## Interface IRecentUtils

This interface defines how different systems can manage and access recent trading signals. It's designed to ensure we always have a record of the most up-to-date signal information.

The `handleActivePing` method lets adapters receive and save new signal events, keeping everything current.

`getLatestSignal` lets you fetch the most recent signal for a specific trading setup, like a particular symbol, strategy, and timeframe. Importantly, it prevents "look-ahead bias" by only returning signals that occurred *before* the requested time.

Finally, `getMinutesSinceLatestSignalCreated` helps you determine how long ago the latest signal was generated, useful for analyzing signal freshness and timing.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, provides a way to share key information about a trading signal with users in a clear and understandable way. It builds upon the standard signal data by including the original stop-loss and take-profit prices that were initially set when the signal was created. Even if those stop-loss and take-profit levels change due to trailing or other adjustments, the original values remain visible.

Here’s what you'll find in this data:

*   **Cost:** The initial cost of getting into the trade.
*   **originalPriceStopLoss:** The original stop-loss price you set.
*   **originalPriceTakeProfit:** The original take-profit price you set.
*   **partialExecuted:**  The percentage of the position that has been closed out through partial trades.
*   **totalEntries:**  How many times you’ve added to this position (useful for understanding dollar-cost averaging).
*   **totalPartials:**  How many times you’ve taken partial profits or losses.
*   **originalPriceOpen:** The price at which you initially entered the trade.
*   **pnl:** The current unrealized profit or loss on the position.
*   **peakProfit:** The highest profit the position has ever made.
*   **maxDrawdown:** The largest loss the position has ever experienced.



The goal is to offer transparency so you can see the original plans and how the position has evolved over time.

## Interface IPublicCandleData

This interface describes the basic data structure for a single candlestick, representing a period of price activity. Each candlestick holds information like the time it started, the opening price, the highest and lowest prices reached, the closing price, and the trading volume for that period. Essentially, it’s a way to represent one "bar" of price data in your trading analysis. The timestamp tells you precisely when that bar’s period began, while the other properties outline the price fluctuations and activity that occurred during that time.

## Interface IPositionSizeKellyParams

To help you calculate how much to bet or trade based on the Kelly Criterion, this interface defines the essential parameters. It lets you specify the `winRate`, which is the percentage of times you expect to win, and the `winLossRatio`, representing the average profit compared to the average loss when you’re right. These values are used to determine the optimal size of each trade or bet.

## Interface IPositionSizeFixedPercentageParams

This describes the parameters you'll use when sizing trades using a fixed percentage approach. Specifically, it defines a single property: `priceStopLoss`. Think of `priceStopLoss` as the price level where you'll place a stop-loss order to limit potential losses on your trade. It's a crucial number for risk management.

## Interface IPositionSizeATRParams

The `IPositionSizeATRParams` object holds the settings needed when calculating your position size using the Average True Range (ATR). Specifically, it contains the current ATR value, which is a key factor in determining how much capital to allocate to a trade based on market volatility. This parameter lets you specify the ATR reading that influences your sizing strategy.

## Interface IPositionOverlapLadder

This interface defines how to set up a safety zone around each of your dollar-cost averaging (DCA) levels. It helps you identify instances where trades might be overlapping, potentially impacting your backtesting results. 

You specify `upperPercent` and `lowerPercent`, both represented as percentages (0-100). The `upperPercent` determines how far above a DCA level a trade needs to be to be considered an overlap, while `lowerPercent` controls how far below a level it needs to be. These values essentially create a buffer around each DCA, helping to pinpoint unwanted trade intersections.

## Interface IPersistStrategyInstance

This interface helps manage how your trading strategies save and load their data, particularly when dealing with delayed or persistent information. Think of it as a way to customize where and how your strategy’s state is stored, instead of relying on a default system. 

It's specifically designed for each unique combination of trading symbol, strategy name, and exchange.

The `waitForInit` method prepares the storage area for your strategy's data. 
`readStrategyData` retrieves any previously saved strategy information.
Finally, `writeStrategyData` allows you to save the current state of your strategy, or clear it out entirely if needed.

## Interface IPersistStorageInstance

This interface defines how your custom storage solutions integrate with the backtest-kit framework. It’s designed to handle storing and retrieving signals, essentially the data about your trades or market observations. 

Think of it as a way to customize where and how backtest-kit keeps track of the signals it's working with – whether that's a file, a database, or something else entirely.

The `waitForInit` method lets you prepare your storage when the backtest or live mode starts. 

`readStorageData` lets you retrieve all the signals that have been previously saved, and `writeStorageData` lets you save new signals or update existing ones. Each signal is associated with a unique identifier, making it easy to locate specific data.

## Interface IPersistStateInstance

This interface defines how a specific piece of trading strategy data can be saved and loaded. Think of it as a way to ensure your strategy remembers its progress even if something unexpected happens. 

It's particularly useful for strategies that need to keep track of information across different time periods or data sources. 

If you're building a custom way to save your strategy’s data – instead of using the standard file-based method – you'll need to implement this interface.

The `waitForInit` method gets things ready for saving, `readStateData` retrieves the saved information, `writeStateData` actually saves the data along with a timestamp, and `dispose` cleans up anything the persistence instance is using.

## Interface IPersistSignalInstance

This interface helps manage how trading signals are saved and loaded for a specific combination of symbol, strategy, and exchange. Think of it as a way to customize where and how your trading signals are stored, rather than relying on the default file-based method.

If you need to use a database or another storage solution for your signals, you can build a custom adapter that implements this interface.

The `waitForInit` method sets up the storage area when needed.
`readSignalData` retrieves previously saved signal information.
Finally, `writeSignalData` saves the current signal data, or clears the storage if you pass `null`.

## Interface IPersistSessionInstance

This interface defines how to manage persistent data for a specific trading session – think of it as a way to save and load information related to a particular strategy, exchange, and timeframe. It’s designed to help keep your backtesting sessions safe, even if there are unexpected interruptions.

If you want to customize how data is saved (instead of using the default file-based method), you can build your own adapter that implements this interface.

Here's a breakdown of what it lets you do:

*   **waitForInit:**  Sets up the storage area for your session data when it's first needed.
*   **readSessionData:** Retrieves any previously saved data for this session.
*   **writeSessionData:** Stores the current session data, along with a timestamp indicating when it was saved.
*   **dispose:**  Cleans up any resources your custom storage might be using – it’s a way to ensure everything is properly released when you're done.

## Interface IPersistScheduleInstance

This interface helps backtest-kit remember scheduled signals—those actions you plan to take at specific times—for each unique combination of asset, trading strategy, and exchange. Think of it as a way to save and load these planned signals so you don't have to re-create them every time you run a backtest.

If you want to customize how these signals are stored (instead of using the default method), you can build your own adapter that implements this interface.

The `waitForInit` method sets up the storage area for a particular scheduled signal.
`readScheduleData` retrieves a previously saved scheduled signal.
`writeScheduleData` saves a new scheduled signal, or removes a previously saved one by setting it to null.

## Interface IPersistRiskInstance

This interface helps you manage how trading positions and associated risk data are saved and loaded for specific situations. Think of it as a way to customize where and how your backtest-kit keeps track of your positions. It’s designed to work with a particular combination of risk name and exchange, allowing you to have different storage methods for different scenarios.

If you need more control over position persistence, you can build your own system that implements this interface. The `waitForInit` method allows you to set up the storage when needed.  `readPositionData` retrieves the saved position data for a given time, and `writePositionData` is used to save the current position data.

## Interface IPersistRecentInstance

This interface helps manage how recent trading signals are saved and loaded, but only for a specific setup—like a particular stock, strategy, exchange, timeframe, and backtest. 

Think of it as a dedicated storage space for a signal, so that your live trading and backtesting sessions don't interfere with each other.

If you want to change how these signals are stored (maybe using a database instead of a file), you can create your own adapter that follows this interface.

The `waitForInit` method prepares the storage for the signals.  `readRecentData` retrieves the most recently saved signal.  And `writeRecentData` saves a new or updated signal along with the timestamp.


## Interface IPersistPartialInstance

This interface defines how to handle saving and retrieving partial profit/loss information for a trading strategy. Think of it as a way to remember where a trade stands, specifically for a particular symbol, strategy, and exchange combination. 

Each trade signal keeps its own record, allowing for customized storage solutions beyond just files.

If you want to control how this partial data is saved – perhaps to a database or a different file format – you can create an adapter that implements this interface. 

The `waitForInit` method sets up the storage space when needed.  `readPartialData` fetches previously saved information for a particular signal and time, while `writePartialData` is used to save the current state of a signal's partial data.

## Interface IPersistNotificationInstance

This interface lets you customize how your trading system remembers important notifications – things like order confirmations or error messages – during a backtest or live trading session. It acts as a central place to manage these notifications, ensuring they’re handled consistently.

You can think of it as a way to swap out the default file-based storage for something else, like a database or an in-memory cache, if you need more control.

The `waitForInit` method prepares the storage when the system starts in a specific mode. `readNotificationData` retrieves all previously saved notifications, pulling them from wherever you’ve stored them. Finally, `writeNotificationData` is used to save new notifications or update existing ones, linking each notification to a unique identifier.

## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for specific contexts, like a signal and a bucket. It's primarily used for managing information within LLM applications and provides a way to customize how that memory is persisted.

You can use this interface to build your own storage solutions, like connecting to a database instead of using files.

The interface includes methods to:

*   Initialize the storage.
*   Read a memory entry by its ID.
*   Check if a memory entry exists.
*   Write new memory entries, including a timestamp.
*   Soft-delete (remove) a memory entry – this keeps the file but marks it as not visible.
*   List all the currently available memory entries.
*   Release any resources the storage is using.

## Interface IPersistMeasureInstance

This interface defines how to store and retrieve cached data for each trading bucket. It’s designed to let you customize how the backtest-kit handles cached information, moving beyond a simple file-based system.

The system allows for "soft deletes," meaning data can be removed from view without actually being erased from disk, helping to preserve history.

You’ll use methods like `waitForInit` to get things started, `readMeasureData` to fetch data, `writeMeasureData` to save data, `removeMeasureData` to logically remove data, and `listMeasureData` to see what keys are available.

## Interface IPersistLogInstance

This interface lets you customize how backtest-kit stores its log data. Instead of using the default file-based storage, you can create your own system, like sending logs to a database or another service. 

The framework only uses one global log storage per running process.

If you build a custom adapter, you'll need to implement `waitForInit` to set up your storage and `writeLogData` to add new log entries. When adding new entries, make sure not to overwrite any existing entries – the log should grow over time.  `readLogData` is used to retrieve all the stored log entries.

## Interface IPersistIntervalInstance

This interface lets you customize how the backtest-kit framework keeps track of which time intervals have already been processed for a specific data bucket. Think of it as a way to manage "markers" that signal when a certain point in time has been handled.

You'll need to implement this interface if you want to use a storage method other than the default file system for these markers, like a database or an in-memory solution.

The `waitForInit` method prepares the storage for a new bucket. `readIntervalData` retrieves existing marker data, while `writeIntervalData` creates or updates a marker.  `removeIntervalData` acts like a soft delete – it effectively makes the marker disappear so the system will re-process the interval.  Finally, `listIntervalData` provides a way to see which markers are currently active.

## Interface IPersistCandleInstance

This interface defines how a backtest kit can store and retrieve historical candle data for a specific trading symbol, timeframe, and exchange. Think of it as a way to manage a local copy of the data the backtest needs.

The `waitForInit` method is used to prepare the storage space before anything happens.

The `readCandlesData` method is crucial – it’s used to fetch a chunk of candle data within a specified time range.  Importantly, if even one candle is missing in that range, it signals a "cache miss" by returning `null`, letting the system know it needs to fetch that data from the original source.

Finally, `writeCandlesData` allows you to write new candles into the local cache. Implementations are encouraged to be smart about this, potentially ignoring incomplete data or candles that already exist to keep the data consistent. This interface allows you to replace the default file storage with your own custom storage solution.

## Interface IPersistBreakevenInstance

This interface lets you manage how breakeven data—information crucial for understanding a trade's profitability—is stored and retrieved. Think of it as a way to customize where and how this data is saved, potentially moving away from the default file-based storage. 

It's organized around a specific combination of trading elements: a symbol, a strategy name, and an exchange.

Each trading signal has its own space to store its breakeven information.

If you want to create a system that stores breakeven data in a database or another location, you would implement this interface.

The `waitForInit` method is used to prepare the storage area when things start up.

`readBreakevenData` retrieves previously saved breakeven information for a particular signal and date.

`writeBreakevenData` is used to store breakeven data for a signal, ensuring it’s available later.

## Interface IPersistBase

This interface outlines the basic functions needed for any system that wants to store and retrieve data, like saving trading results or configuration. Think of it as a contract that says, "If you're going to handle the data storage, you need to be able to do these things: initialize, read, check for existence, write, and list all the keys." The `waitForInit` method sets everything up initially, ensuring a clean start. `readValue` gets a specific piece of data, while `hasValue` quickly tells you if a piece of data exists at all. `writeValue` saves your data, and `keys` gives you a way to see everything that's stored. This allows the backtest-kit to work with different ways of saving information, whether it's to a file, a database, or something else entirely.

## Interface IPartialProfitCommitRow

This represents a single instruction to take a partial profit during a backtest. 

Think of it as a row in a queue of actions, telling the backtest system to close a portion of your position.

It includes the type of action, which is "partial-profit", the percentage of the position to close (e.g., 25% to close one quarter of the position), and the price at which that partial profit was actually taken. These details are used to precisely reconstruct what happened during the backtest.


## Interface IPartialLossCommitRow

This represents a record of a partial loss order that’s been queued up. 

It contains information about the specific action taken, which in this case is a "partial-loss." You'll also find the percentage of the position that's being closed out with this order, and the price at which the partial loss was actually executed. This data helps track the details of reducing a position size.

## Interface IPartialData

This data structure, called `IPartialData`, is designed to save and load information about a trading signal. Think of it as a snapshot of key progress points.

It focuses on the profit and loss levels that have been hit during a trading session. These levels are stored as arrays of `PartialLevel` objects.

Essentially, it's a way to preserve the important milestones of a trade, making it possible to resume a backtest or analysis from a specific point in time, instead of always starting from scratch. The data is formatted to be easily saved and retrieved, even across different systems.

## Interface IPartial

The `IPartial` interface is responsible for keeping track of how much profit or loss a trading signal is generating. It's used by components like `ClientPartial` and `PartialConnectionService`.

When a signal is making money, the `profit` method calculates and announces milestones like reaching 10%, 20%, or 30% profit. Conversely, the `loss` method does the same when a signal is losing money, highlighting loss percentages. These methods are used by the strategy monitoring process to keep track of signal performance.

The `clear` method cleans up the signal's profit/loss record when the trade is finished – whether it hits a target, a stop-loss, or just expires. This method ensures the system doesn't hold onto old data and ensures the cleanup of resources.

## Interface IParseArgsResult

The `IParseArgsResult` object holds the information about how the application should run. It combines the original input arguments with flags that dictate the trading environment. You'll find properties to indicate if the application is set to run in backtest mode, which simulates trading using historical data, paper trading mode, which mimics live trading, or live trading mode for actual real-time trading. These flags guide the application’s behavior and data access.

## Interface IParseArgsParams

The `IParseArgsParams` interface describes the information needed to run a trading strategy. Think of it as a blueprint for the inputs the system expects. 

It defines the essential pieces of information: the trading pair (like BTCUSDT), the name of the strategy you want to use, the exchange you're connecting to (like Binance or Bybit), and the timeframe for the price data (such as 1-hour candles).  These properties provide the core configuration for your backtesting session.


## Interface IOrderBookData

The `IOrderBookData` interface represents the data you'll get from an order book, which shows the current buying and selling interest for a particular trading pair.  It has a `symbol` property that tells you which trading pair the data applies to, like "BTCUSDT".  Then, there are `bids` and `asks` properties; these are arrays of `IBidData` objects, each representing a single bid (a buy order) or ask (a sell order).  Essentially, it’s a structured way to hold the information about what prices people are willing to buy and sell at.


## Interface INotificationUtils

This interface defines the core methods for any system that wants to send notifications about your trading strategies. Think of it as a contract that ensures different notification methods – like email, Slack, or a custom dashboard – can all communicate with your backtesting framework in a consistent way.

Each method represents a specific event that needs to be reported: opening or closing a trade, reaching profit or loss targets, confirming strategy settings, synchronizing signals, encountering errors, or retrieving a history of notifications. The `handleSignal` method is a general-purpose hook for various signal-related events.

The `getData` method allows you to retrieve a list of all stored notifications, while `dispose` provides a way to clear them out when you’re finished. Effectively, this provides a standard way to plug in different systems for receiving information about your backtests and live trading.

## Interface INotificationTarget

The `INotificationTarget` interface helps you fine-tune what information your backtest or trading system receives. Instead of getting every notification, you can specify which categories you’re interested in, like signal events, partial profit/loss updates, or risk management rejections. This targeted approach lets you focus on the data most relevant to your analysis and reduces unnecessary overhead.

You can choose to listen for things like:

*   Lifecycle events of signals (when they're opened, scheduled, closed, or cancelled)
*   Notifications about reaching partial profit or loss levels
*   Alerts when the price hits the breakeven point
*   Confirmation that a strategy commit has been executed
*   Synchronization events related to live trading signals
*   Notifications when the risk manager blocks a signal
*   Informational messages from the strategy
*   Non-fatal errors encountered during the process
*   Critical, unrecoverable errors that stop the process
*   Errors related to validation of your strategy setup or data

## Interface IMethodContext

The `IMethodContext` object acts as a central piece of information for your backtesting operations. Think of it as a little package that tells the backtest-kit exactly which configurations to use—specifically, which strategy, exchange, and frame schemas are relevant for the current test. It’s automatically passed around, so you don’t usually need to create it yourself. 

It contains three key pieces of information:

*   `exchangeName`:  The name of the exchange schema being used.
*   `strategyName`: The name of the strategy schema being employed.
*   `frameName`:  The name of the frame schema, which will be empty if you’re running in live mode (meaning real-time data).

## Interface IMemoryInstance

The `IMemoryInstance` interface outlines how different memory storage systems – whether they're temporary, long-term, or just for testing – should behave. It provides a set of standardized functions for interacting with memory.

You can use `waitForInit` to make sure the memory is ready to go.  The `writeMemory` function lets you save data to memory, along with a description and timestamp. Searching for data is done with `searchMemory`, which uses a scoring system to find the best matches.  `listMemory` provides a way to see all of the data stored up to a specific time. To delete entries, use `removeMemory`, specifying the ID and timestamp.  `readMemory` retrieves a single entry from memory, but only if its timestamp is older than the requested one.  Finally, `dispose` cleans up any resources the memory system might be using when it's no longer needed.

## Interface IMarkdownTarget

The `IMarkdownTarget` interface lets you pick and choose which detailed reports you want to see generated during your backtesting or live trading. It’s like a checklist for what kind of information you want to receive.

You can turn on reports that show individual trade signals (strategy), how risk limits impacted trades (risk), or when stop-loss orders adjust (breakeven).

There are also options for tracking partial profits, analyzing portfolio performance with heatmaps, optimizing strategies, and monitoring signal scheduling.

You can generate detailed reports on live trading activity, overall backtest results, synchronization events, and important milestones like highest profit and maximum drawdown. Essentially, this interface gives you fine-grained control over the level of detail in your reports.

## Interface IMarkdownDumpOptions

This interface defines the settings used when generating markdown documentation for backtest-kit. It lets you specify exactly where the documentation should be saved and what parts of your trading system you want included – think of it as a way to control which files and data are documented. The `path` tells the system where to create the documentation files, based on your project’s root directory. You can also use `file`, `symbol`, `strategyName`, `exchangeName`, `frameName`, and `signalId` to narrow down the documentation to specific trading pairs, strategies, or signals, making it much easier to manage large projects.

## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework communicate about what’s happening. It's a standard way to record events, data, and potential issues so you can understand how the system works and troubleshoot problems.

You can use the `log` method for important events and state changes.

The `debug` method is for very detailed information you need when developing or diagnosing issues.

`info` lets you record successful operations and high-level summaries.

Finally, `warn` is used to flag situations that might need attention, like missing data or outdated practices.


## Interface ILogEntry

ILogEntry represents a single entry in your backtest's log history, giving you insights into what happened during the simulation. Each log entry gets a unique ID and a level – whether it's a regular log, a debug message, an informational note, or a warning.  It also includes timestamps for when the event occurred and when it was recorded, helpful for organizing and analyzing the logs over time. 

You can optionally add context to the log entry, like the specific method where the log originated (methodContext) and the broader execution environment (executionContext).  Finally, you can pass additional arguments along with the log message, providing more specific details about the situation.

## Interface ILog

The `ILog` interface gives you a way to keep track of what's happening during your backtesting or trading simulations. It lets you retrieve a complete history of all the log messages that have been generated. You can use this list of log entries to analyze the sequence of events, debug issues, or simply review the performance of your strategies. Accessing the log history is done through the `getList` method, which returns a promise containing an array of `ILogEntry` objects.

## Interface IHeatmapRow

This describes a detailed breakdown of performance statistics for a specific trading symbol within your backtesting framework. Think of it as a report card for a single trading pair, summarizing how strategies performed.

It covers a wide range of metrics, from basic profitability and trade counts (total profit/loss, win rate, total trades) to more sophisticated risk-adjusted return measures like the Sharpe Ratio and Sortino Ratio. You’ll find information on average win/loss sizes, streaks of wins and losses, and even duration of trades.

Beyond just the numbers, there's insight into market behavior with indicators like buyer and seller pressure, strength, and a general trend classification, complete with measures of its reliability. This data helps you understand not just *if* you’re making money, but *how* and *why*, and get a feel for the volatility and stability of the trading environment.


## Interface IFrameSchema

The IFrameSchema defines a specific period and timeframe for your backtesting simulations. Think of it as setting the stage – you tell the framework exactly when your historical data should start, when it should end, and how frequently data points (like minutes, hours, or days) should be generated within that window. Each schema has a unique name for identification, and you can add a note to help yourself remember what it’s for later. You can also configure callbacks to execute specific actions at different points during the frame's processing.


## Interface IFrameParams

The `IFrameParams` object helps set up the environment for your trading simulations. Think of it as a configuration block. It includes a `logger` which is handy for tracking what's happening behind the scenes and spotting any issues. You'll also define an `interval` – essentially a name or label – to easily identify and manage each frame in your backtesting process.

## Interface IFrameCallbacks

The `IFrameCallbacks` interface lets you hook into significant moments in a timeframe's creation process. Specifically, the `onTimeframe` property allows you to run custom code immediately after the framework generates an array of timeframes. You can use this to keep track of what timeframes are being used, or double-check that they're set up the way you expect. This callback receives the array of timeframe dates, the start and end dates for the timeframe series, and the interval used to generate the timeframes.

## Interface IFrame

The `IFrame` interface handles generating the timeline for your backtesting. It's a core part of how the backtest kit organizes and runs tests.

The key function, `getTimeframe`, is responsible for creating an array of timestamps. This array essentially tells the backtest when to evaluate trades, based on the timeframe you've chosen (like daily, hourly, or weekly) and the specific trading symbol you’re testing. The timestamps within this array are evenly spaced out, ensuring consistent intervals for your backtest.

## Interface IExecutionContext

The `IExecutionContext` interface provides the environment your trading strategies and exchange operations work within. Think of it as a set of essential details passed around during execution.

It holds information like the trading symbol, for example "BTCUSDT", and the current timestamp, letting your code know exactly when an event occurred. 

Crucially, it also indicates whether the code is running in a backtesting scenario (simulated historical data) or in a live trading environment. This allows strategies to behave differently based on the context.


## Interface IExchangeSchema

The `IExchangeSchema` defines how backtest-kit interacts with a specific cryptocurrency exchange. Think of it as a blueprint that tells the framework where to get historical price data (candles), how to format trade quantities and prices to match the exchange's rules, and potentially how to access order books and trade history.

Each exchange you want to use will need its own schema.

It includes key functions like `getCandles` to retrieve candle data, `formatQuantity` and `formatPrice` to ensure consistent data representation, and optional functions like `getOrderBook` and `getAggregatedTrades` for more advanced data. You can also add a developer note for documentation purposes. `callbacks` allows you to hook into specific events, like when new candle data becomes available. If you don't define certain functions, like `getOrderBook` or `getAggregatedTrades`, the framework will raise an error if those features are needed.

## Interface IExchangeParams

The `IExchangeParams` interface defines the essential settings and functions an exchange needs to operate within the backtest-kit framework. Think of it as a configuration guide for connecting to and interacting with a specific cryptocurrency exchange.

It requires you to provide several key components, like a way to log messages for debugging, information about the current testing environment, and, most importantly, functions to retrieve historical data like candlestick charts, order books, and aggregated trades. You also need to define how to correctly format trade quantities and prices to match the exchange's specific rules. These functions must accept a `backtest` flag to handle any differences between live and historical data. Providing these parameters allows the backtest-kit to accurately simulate trading on that exchange.


## Interface IExchangeCallbacks

This lets you react to new candle data arriving from an exchange. You’ll receive information about the symbol, the time interval of the candles (like 1 minute or 1 day), the time since the data started, how many candles were requested, and an array containing the actual candle data. It’s a great way to keep your system updated with the latest price action.


## Interface IExchange

The `IExchange` interface defines how your backtesting framework interacts with a specific exchange. It allows you to retrieve historical and future market data, format trade quantities and prices, and access key information like VWAP and order books. 

You can fetch historical candle data using `getCandles`, and for backtesting purposes, look ahead to future candles with `getNextCandles`. The framework carefully handles these operations to avoid looking into the future, ensuring fair backtest results.

To prepare orders, you can use `formatQuantity` and `formatPrice` to adjust values according to the exchange's precision requirements. To understand recent price trends, `getAveragePrice` calculates the VWAP using recent candle data.

You can also retrieve the latest closing price with `getClosePrice`, get a snapshot of the order book with `getOrderBook`, and access aggregated trade data with `getAggregatedTrades`. 

Finally, `getRawCandles` gives you a lot of flexibility in fetching candle data, letting you specify start and end dates, or just a limit, always respecting the execution context and preventing look-ahead bias.

## Interface IEntity

This interface, IEntity, serves as the foundation for all data objects that are saved and retrieved from storage within the backtest-kit framework. Think of it as a common starting point that ensures all persistent objects share a basic structure. It's designed to provide a consistent way to manage and interact with your backtest data, ensuring everything plays nicely together.

## Interface IDumpInstance

The `IDumpInstance` interface defines how components can save data during a backtest run. Think of it as a way to record key information at specific points in time.

It provides several methods for different types of data:

*   `dumpAgentAnswer` saves the entire conversation history for a specific agent.
*   `dumpRecord` is for simple key-value pairs you want to store.
*   `dumpTable` handles data structured like a table, automatically figuring out the column headings.
*   `dumpText` saves raw text or markdown content.
*   `dumpError` is dedicated to saving error messages and descriptions.
*   `dumpJson` preserves complex objects as formatted JSON.

Finally, `dispose` lets the instance clean up any resources it's using when it's no longer needed. Each instance is tied to a particular signal and bucket name, meaning its scope is limited.

## Interface IDumpContext

The IDumpContext helps organize and identify data dumps, especially when working with adapters. Think of it as a little package containing key details about a specific dump. 

It includes the `signalId` which pinpoints the trade the dump relates to, and the `bucketName` which helps group dumps by strategy or agent. Each dump gets a unique `dumpId` for easy tracking, and a helpful `description` to explain what's in the dump. Finally, a `backtest` flag indicates whether the dump originates from a backtest or a live trading environment.

## Interface ICommitRowBase

This interface, `ICommitRowBase`, serves as a foundational building block for events related to committing data. Think of it as a standardized way to represent information that needs to be processed later, ensuring it's handled at the right time within the trading system. It holds essential details like the `symbol` – which trading pair the event relates to – and a flag indicating `backtest` mode, which helps distinguish between live trading and simulated testing environments.

## Interface ICheckCandlesParams

ICheckCandlesParams defines the information needed to quickly check if your trading data (candles) exist in a specific storage location. It’s used to verify that the data is there without having to painstakingly search through all the files. 

You'll need to specify the trading pair symbol, like "BTCUSDT," the name of the exchange providing the data, the timeframe of the candles (e.g., one-minute intervals, four-hour bars), and the beginning and end dates you want to check. This helps ensure you have the right data available for backtesting and analysis.

## Interface ICandleData

This interface describes a single candlestick, which is a common way to represent price data over a specific time interval. Each candlestick holds information about the opening price, the highest price reached, the lowest price seen, the closing price, and the volume of trades that occurred during that time. The `timestamp` tells you exactly when that candlestick represents – the moment the candle "opened." This data is essential for calculating things like moving averages and, of course, for running backtests to see how a trading strategy would have performed.

## Interface ICacheCandlesParams

This interface helps you control the caching process for historical market data. It lets you add custom actions before the validation and warm-up phases begin.

Specifically, `onWarmStart` is triggered right before the warm-up starts, letting you do things like log the start of the process or prepare for the data. `onCheckStart` is called before the validation phase, giving you the chance to perform pre-validation checks or other setup tasks. You get details about the symbol, interval (like 1 minute or 1 hour), and the date range being used for each phase.

## Interface IBroker

The `IBroker` interface defines how the backtest-kit framework communicates with a live brokerage or exchange. Think of it as the bridge between the testing environment and a real trading account.  It's designed so that if something goes wrong during a trading action, the framework's internal state isn't corrupted – actions are transactional. 

When you're running a backtest, the framework won't actually send commands to a broker, so the adapter remains quiet during that time.

Here’s a rundown of the actions the framework might ask your broker adapter to perform:

*   `waitForInit`: This is a one-time setup call, where you’d connect to the exchange, load your credentials, and get everything ready.
*   `onSignalCloseCommit`:  Called when a trade is closed—whether by a take-profit, stop-loss, or manual intervention.
*   `onSignalOpenCommit`: Called when a new trade is entered and confirmed.
*   `onPartialProfitCommit`:  Triggered when a partial profit is taken.
*   `onPartialLossCommit`: Triggered when a partial loss is taken.
*   `onTrailingStopCommit`: Called to update a trailing stop-loss order.
*   `onTrailingTakeCommit`: Called to update a trailing take-profit order.
*   `onBreakevenCommit`:  Called when setting a breakeven stop-loss (setting the stop-loss to the entry price).
*   `onAverageBuyCommit`: Called when adding an order as part of a dollar-cost averaging (DCA) strategy.

## Interface IBreakevenData

This data structure, `IBreakevenData`, helps store information about whether a trading signal has reached its breakeven point. It's designed to be easily saved and loaded, particularly when dealing with persistent data like saved backtest configurations.  Essentially, it represents a simplified version of the more complex `IBreakevenState`, containing only a `reached` flag. This flag indicates if the breakeven condition has been met for a specific trading signal, and is used to allow saving the state as JSON.

## Interface IBreakevenCommitRow

This represents a specific event related to breakeven calculations during a backtest. 

It signals that a breakeven commitment has been made, essentially marking a point where adjustments or considerations are needed based on the current price. 

The `currentPrice` value tells you the price level at the time this breakeven commitment was triggered, offering context for understanding why the system reached this point.

## Interface IBreakeven

The `IBreakeven` interface helps manage situations where a trade's stop-loss order is adjusted to the original entry price, essentially aiming to protect profits. It’s used by the `ClientBreakeven` and `BreakevenConnectionService` components.

This interface keeps track of when a trade’s stop-loss reaches breakeven and lets you know when the price moves enough to cover any transaction fees involved. It’s particularly useful for monitoring signals and automatically adjusting stop-loss orders.

The `check` method figures out if breakeven should be triggered.  It verifies that a breakeven hasn’t already been reached, that the price has moved to cover transaction costs, and that the stop-loss can be moved to the entry price. If everything lines up, it flags the breakeven, triggers a notification, and saves the changes.

The `clear` method resets the breakeven state when a trade finishes, whether it hits a target price, a stop-loss, or simply expires. This cleans up data and ensures everything is prepared for the next trade.

## Interface IBidData

The `IBidData` interface represents a single bid or ask present within an order book. It's a fundamental building block for understanding market depth. Each bid or ask is described by its `price`, which is given as a string, and its `quantity`, also represented as a string. This allows you to track the number of instruments offered or sought at a particular price point.

## Interface IAverageBuyCommitRow

This interface represents a single action taken during a queued average-buy (DCA) strategy. It describes a commitment to buy at a specific price. 

The `action` property always indicates this is an "average-buy" action. 

The `currentPrice` tells you the price at which the new averaging buy was made.  `cost` represents the amount of USD spent on that particular purchase.  Finally, `totalEntries` shows the running total of how many averaging entries have been made so far.

## Interface IAggregatedTradeData

This object holds information about a single trade that happened. Think of it as a record of one transaction. 

It includes the price at which the trade took place, how much was traded (the quantity), and the exact time it occurred.  A key piece of information is whether the buyer was the one providing the liquidity (the maker) – this helps understand the direction of the trade. Each trade record also has a unique ID to distinguish it from others.

## Interface IActivityEntry

An Activity Entry represents a single trading run, whether it's a backtest or a live trade. It's essentially a record of what's currently happening in your system.

When a trading process starts, like running a backtest or executing a live strategy, this entry is created and stored. When that process finishes, or encounters an error, the entry is removed.

Each entry contains information like the trading symbol (e.g., BTCUSDT), details about the strategy and exchange being used, and whether it's a backtest or live activity. 

The system uses these entries to manage and monitor ongoing trading activities, and to check if multiple processes are running concurrently.

## Interface IActivateScheduledCommitRow

This interface represents a request to activate a previously scheduled commit. Think of it as telling the system, "Okay, go ahead and execute that scheduled commit now."

It includes a few key pieces of information:

*   `action`: This always indicates the action being requested is to "activate-scheduled."
*   `signalId`:  This identifies the specific signal that the commit is associated with.
*   `activateId`: This is an optional identifier, useful when a user specifically triggers the activation process.

## Interface IActionStrategy

The `IActionStrategy` interface gives your action handlers a way to peek at the current state of signals. It’s like a read-only window into what's happening with your trading signals.

Think of it as a safety check – before your trading logic runs, it can quickly see if there's an open position or a scheduled signal for a particular symbol.

Specifically, it helps components like `ActionProxy` avoid unnecessary checks or actions when there isn't an active signal.

There are two key methods:

*   `hasPendingSignal` – lets you know if there’s an active trade happening.
*   `hasScheduledSignal` – tells you if a signal is waiting to be triggered.

These methods take a few pieces of information – whether it's a backtest, the symbol you’re trading, and some details about your strategy and exchange – to give you accurate results.

## Interface IActionSchema

The `IActionSchema` lets you extend your trading strategies with custom actions – think of them as special hooks that trigger when specific events happen during a trade.

You use these actions to do things beyond just executing trades, like managing your application’s state, sending notifications to Slack, tracking performance metrics, or even running custom logic.

Each action is essentially a set of instructions, defining what should happen when a particular event occurs within the strategy.

You give each action a unique identifier, and can add a note to describe its purpose.

The core of an action is its `handler`, which is a function that gets executed whenever the action is triggered.

Finally, you can define callbacks to control the action's lifecycle and respond to specific events. This is how you tightly integrate actions with your overall trading system.

## Interface IActionParams

The `IActionParams` interface is like a package of information given to each action when it's created. It's built upon a core schema, but adds extra details needed for the action to work properly.

Think of it as including a helpful `logger` to keep track of what's happening and catch any problems. You'll also find the names of the `strategy` and `frame` it belongs to.

Crucially, it tells the action whether it's running in a `backtest` (simulated trading) or live trading environment.

Finally, it provides a `strategy` object so the action can easily understand the current trading signals and what positions are already open.

## Interface IActionCallbacks

This interface lets you customize how your action handlers behave at different points in their lifecycle and when specific events occur. Think of it as a way to plug in your own code to handle setup, cleanup, and respond to real-time trading signals or system status changes.

You can define functions to perform tasks like establishing database connections when an action handler starts (`onInit`), saving data when it shuts down (`onDispose`), or logging important events during trading (`onSignal`, `onSignalLive`, `onSignalBacktest`).

There are also callbacks for specific situations:

*   `onBreakevenAvailable`: Notifies you when a stop-loss is moved to the entry price.
*   `onPartialProfitAvailable`:  Lets you know when a partial profit target is reached.
*   `onPartialLossAvailable`: Signals when a partial loss target is hit.
*   `onPingScheduled`, `onPingActive`, `onPingIdle`: Provide updates on the status of scheduled or active pending signals.
*   `onRiskRejection`:  Alerts you when a trading signal is blocked by risk management.
*   `onSignalSync`:  Allows you to approve or reject limit order executions, with the opportunity to retry if rejected.



These callbacks are optional, and each can be executed synchronously or asynchronously, providing a great deal of flexibility in how you integrate your custom logic.

## Interface IAction

The `IAction` interface is your central point for connecting your custom logic to the backtest-kit framework. Think of it as a series of hooks that get triggered as the trading system operates. You can use these hooks to do things like update your application's state, log events, display real-time data, or gather analytics.

Each method in the interface represents a different event happening within the system, such as a new signal being generated, a breakeven point being reached, or a risk rejection occurring.

You'll need to implement these methods to respond to these events in a way that makes sense for your application.  For example, you might use `signal` to dispatch a Redux action, or `riskRejection` to display a warning to the user.

Crucially, remember to implement the `dispose` method to properly clean up any resources and subscriptions you create – this helps ensure a stable and reliable trading environment. This is especially important when the connection isn’t needed anymore.

## Interface HighestProfitStatisticsModel

This model holds information about the most profitable trading events. Think of it as a record of your best moments! It includes a complete list of those events, displayed in chronological order, and a count of how many profitable events were recorded overall. You can use this to understand patterns in your successful trades.

## Interface HighestProfitEvent

This describes a single, standout moment of profit during a trading simulation or live trade. Each event captures the highest profit point achieved for a specific trade, marking a significant milestone.

You'll find details like the exact time the record was set, the trading pair involved (e.g., BTC/USDT), and the name of the trading strategy that generated the trade.  A unique signal ID helps track the trade's origin.

The information includes whether the trade was a long (buying) or short (selling) position. It also provides the profit and loss (PNL) figures for the entire trade, the highest profit reached, and the largest loss experienced.

You can also see the price at which the record profit occurred, the original entry price, and any pre-set take profit and stop loss prices. Finally, a flag indicates if this record was from a simulation ("backtest") rather than a live trade.

## Interface HighestProfitContract

This interface describes the data you'll receive whenever a trading position hits a new high-profit level. It provides details like the trading symbol ("BTC/USDT"), the current price, and when this profit milestone occurred. You’ll also get context about the strategy being used, the exchange involved, and the timeframe being analyzed (like "1m" for one-minute intervals). Crucially, it includes the signal that triggered the trade and tells you whether this update is coming from a backtest simulation or live trading. This allows you to react to profit milestones, maybe setting a trailing stop or taking partial profits.

## Interface HeatmapStatisticsModel

This data structure holds a comprehensive summary of your portfolio's performance across all the assets it includes. It provides aggregated statistics, giving you a broad overview of how your trading strategy has performed.

You’ll find details like the total number of assets you're tracking, the overall profit and loss, and key risk-adjusted performance metrics like Sharpe and Sortino ratios. It also calculates metrics that consider the duration of your trades, like average win and loss durations.

Several key performance indicators, like average peak and fall PNL, are calculated to give you a sense of the portfolio’s high-water marks and potential downside. Finally, it estimates annualized returns and trade frequency to project potential yearly performance. The presence of several values like `portfolioAvgConsecutiveWinPnl` or `portfolioAvgConsecutiveLossPnl` indicates detailed analysis of winning and losing streaks.

## Interface DoneContract

This interface describes what happens when a background task finishes, whether it's a backtest or a live trading session. It provides key information about the completed run, like which exchange was used, the name of the strategy that ran, and whether it was a backtest or live execution. You'll find details like the trading symbol involved too, making it easy to track and understand the outcome of your automated processes.

## Interface CronHandle

This object lets you cancel a scheduled task. Think of it as a way to "undo" a registration you made with the Cron scheduler. If you no longer need a regularly repeating action, you can use this handle to stop it, ensuring it doesn't run anymore. It's a straightforward method for cleaning up scheduled tasks.

## Interface CronEntry

A CronEntry defines when and how a particular function (the handler) is executed within a backtesting environment. Each entry has a unique name to identify it, which is also used to prevent duplicate registrations.

The interval property specifies how frequently the handler should run, like every minute, every hour, or every day. If you don't set an interval, the handler will run only once, immediately upon the first matching tick.

You can choose whether the handler executes globally for all symbols or for each individual symbol listed in a whitelist. This allows for targeted analysis of specific instruments. 

Finally, the handler itself is the function that performs the actual task during the backtest. It's important to note that if the handler throws an error, it's retried on the next tick. 

The name and symbol fields have restrictions regarding the use of the colon character (":") to prevent ambiguity.

## Interface CriticalErrorNotification

This notification signals a critical error that requires the application to stop running. 

It's a way for the system to communicate that something went seriously wrong and needs immediate attention.

Each notification has a unique ID, a detailed error message for understanding the problem, and information about the underlying error itself, including a stack trace. 

Importantly, these notifications always indicate errors originating outside of a backtest environment.

## Interface ColumnModel

This describes how to set up columns for creating tables, especially useful for displaying data in a readable format. Think of it as defining what each column should show and how it should look.

Each column needs a unique identifier, a friendly name to show in the table header, and a function to transform the raw data into a presentable string. 

You can also control whether a column is displayed or not, perhaps based on certain conditions. This allows for flexible and dynamic table creation.

## Interface ClosePendingCommitNotification

This notification signals that a pending order was closed before it actually became an active position. It's a way for the system to tell you that something happened to interrupt the process of activating a trade. The notification includes a unique ID and a timestamp marking when the closure happened, along with details like whether it occurred during a backtest or live trading.

You'll find crucial information about the signal itself, such as the symbol being traded, the strategy that generated the signal, and its unique identifier.  The notification also provides a wealth of performance data related to the potential position including PNL, peak profit, maximum drawdown, and entry/exit prices, offering insight into how the signal might have performed.  A note field allows for adding a description for the closure reason. Finally, you can see when the notification was created.

## Interface ClosePendingCommit

This signal indicates that a trading position has been closed. 

It provides details about the closure, including an identifier you can provide to track the reason for the close. 

You'll also find information about the position's overall profit and loss (PNL), the highest profit it reached, and the largest drawdown it experienced throughout its lifecycle. These metrics help you understand the performance of the closed trade.

## Interface CancelScheduledCommitNotification

This notification is sent when a scheduled trading signal is canceled before it's actually executed. It provides a detailed snapshot of the signal's parameters and performance metrics at the point of cancellation. You'll find information like the unique signal identifier, the trading pair involved (e.g., BTCUSDT), and the name of the strategy that generated the signal.

The notification also includes key performance indicators like total profit and loss (PNL), peak profit, and maximum drawdown, all calculated up to the point of cancellation. You'll see details regarding DCA entries and partial closes, original entry price, and a breakdown of costs and percentages related to the position. It indicates whether the signal originated from a backtest or live trading environment, and it includes an optional note for a human-readable explanation of the cancellation reason. Finally, it records the creation timestamp of the notification itself.

## Interface CancelScheduledCommit

This interface represents a signal to cancel a previously scheduled event, allowing for adjustments to planned actions. 

It includes details about the cancellation itself, like a unique identifier for tracking purposes, potentially provided by the user to explain why the event is being cancelled.

Along with the cancellation information, the signal also provides performance data related to the position that triggered the scheduling, including total profit and loss, the highest profit achieved, and the largest drawdown encountered. This data gives context for the cancellation and helps understand its impact.


## Interface BreakevenStatisticsModel

This model helps you understand how often your trading strategy reaches a breakeven point.

It tracks specific events where your strategy recovers initial costs, giving you a detailed list of those moments.

You'll find a complete record of each breakeven event, along with the overall count of how many times this milestone has been achieved. Essentially, it allows you to monitor and analyze your strategy's ability to return to profitability.


## Interface BreakevenEvent

The BreakevenEvent holds all the essential details whenever a trading signal hits its breakeven point. Think of it as a snapshot of what happened at that specific moment. It includes things like the exact time, the trading symbol involved, the name of the strategy used, and a unique identifier for the signal.

You’ll also find information about the position type (like long or short), the current market price, the entry price, and any take profit or stop-loss levels that were in place.  For signals using dollar-cost averaging (DCA), it notes the total number of entries and partial closes.

Furthermore, it tracks the original prices used for take profit and stop-loss, along with any executed partials and the unrealized profit and loss (PNL) at the breakeven point. A descriptive note explains the signal's reason, while timestamps indicate when the position became active and when the signal was originally created. Lastly, a flag tells you whether the event occurred during a backtest or live trading.

## Interface BreakevenContract

The `BreakevenContract` represents a specific event where a trading signal’s stop-loss has been moved back to the initial entry price. This signifies a reduction in risk for that trade, as the potential loss has been covered by the profit accumulated so far.

It's a signal that’s sent out once per trading signal, ensuring you don't get duplicates. The event is triggered when the market moves favorably enough to cover trading costs.

Several components use this data: a reporting service compiles it into summaries, and users can actively listen for these events to monitor their strategy’s performance.

The contract includes details like the trading symbol (e.g., BTCUSDT), the name of the strategy used, the exchange facilitating the trade, the timeframe, the original signal data, the current market price at the time of the event, whether it’s from a backtest or live trading, and a timestamp of when it happened. This comprehensive information allows for detailed tracking of risk management and strategy safety.

## Interface BreakevenCommitNotification

This notification signals that a breakeven point has been reached and the position has been closed. It provides a wealth of detail about the trade, including a unique identifier, the exact time of the event, and whether it occurred during a backtest or live trading.

The notification includes key information about the trade itself, such as the trading pair, the strategy used, and the exchange where the trade happened. You'll also find details like the entry price, take profit, and stop-loss levels, along with their original values before any trailing adjustments.

Beyond the basic trade specifics, it provides a comprehensive performance breakdown. This includes metrics like total profit and loss (both in USD and percentage), peak profit achieved, maximum drawdown experienced, and the prices and entries associated with these key events. You can see how the position performed throughout its lifecycle and gain insights into its profitability and risk profile. The inclusion of entry and partial close numbers offers a deeper look into averaging and closure strategies used. Finally, a note field allows for a human-readable explanation for why the trade was closed.

## Interface BreakevenCommit

This data structure represents a breakeven event, a significant moment in a trading position's lifecycle. It provides a snapshot of the position's state and performance when a breakeven adjustment is triggered, essentially resetting the stop-loss to the entry price.

The `action` property clearly indicates that this event is a breakeven.

You'll find the current market price at the time of the adjustment in `currentPrice`.

Key performance metrics like total profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the largest drawdown experienced (`maxDrawdown`) are all included, offering insight into the position's overall health.

Details about the trade itself are also present: whether it was a long or short position (`position`), the original entry price (`priceOpen`), the initially set take profit (`priceTakeProfit` and `originalPriceTakeProfit`), and the initially set stop-loss (`priceStopLoss`, `originalPriceStopLoss`).

Finally, timestamps mark important milestones: when the signal was created (`scheduledAt`) and when the position was activated (`pendingAt`).

## Interface BreakevenAvailableNotification

This notification signals that your trading position now has the opportunity to break even – meaning the stop-loss order can be adjusted to match your original entry price. It provides a wealth of information about the trade, including a unique identifier, the exact time it happened, and whether it’s from a backtest or live trading.

You'll find details about the trading pair (like BTCUSDT), the strategy used, the exchange involved, and the specific signal that triggered this opportunity. It also includes the current market price, your original entry price, the trade direction (long or short), and the current take profit and stop-loss prices.

Beyond the basics, the notification provides in-depth performance data for the position: total entries and partial closes, profit and loss (pnl), peak profit, maximum drawdown, and various price points related to those metrics. You can also see exactly how much capital was invested and the impact of slippage and fees on the PNL calculations. Finally, there's an optional note to help you understand the reasoning behind the signal.

## Interface BeforeStartContract

This event signals the beginning of a strategy's execution for a specific trading symbol. It's like a starting gun for a strategy, happening just before the strategy begins analyzing data. Think of it as a chance to prepare for the run – opening log files, resetting counters, or sending a notification that a new run has started. 

Importantly, this event always has a corresponding "run ended" event later on, even if the strategy encounters problems. Any errors within this event's handling won't disrupt the overall run.

You’ll receive this event only once per run. The `when` property tells you the intended start time, which is the historical start date in backtest mode and the current time in live mode, both aligned to the nearest minute. You also get useful information like the trading symbol, strategy name, exchange, frame (if applicable), a boolean indicating if it's a backtest, the current price, and a timestamp - all to help you understand the context of the run.

## Interface BacktestStatisticsModel

This model provides a detailed breakdown of backtest performance, giving you a comprehensive view of how your strategy fared. It contains a list of all trade signals with their details, along with key metrics like the total number of trades, win/loss counts, and win rate. You’ll find indicators to assess profitability (average PNL, total PNL) and risk (standard deviation, Sharpe Ratio, Sortino Ratio) – the higher the Sharpe and Sortino ratios, the better the risk-adjusted return.

It also calculates metrics that help you understand trade duration, drawdown, and potential returns. Several metrics, like `buyerPressure` and `sellerPressure`, delve into market dynamics during the backtest. The `trend` property gives you a simple classification of the overall market trend during the backtest period, and `trendStrength` and `trendConfidence` quantify the strength and reliability of that trend.  Keep in mind that many of these values can be `null` if the calculation is unsafe due to potential anomalies in the data.

## Interface AverageBuyCommitNotification

This notification lets you know when a new piece of your dollar-cost averaging (DCA) strategy has been executed. It’s triggered whenever a new averaging entry is added to an existing position. The notification includes details like the exact time, whether it’s a backtest or live trade, the trading pair involved, and the name of the strategy that generated the signal.

You’ll also find important pricing information, including the current price, the cost of the entry, and the adjusted average entry price after this new entry is included. It provides a complete snapshot of your position’s status – the total number of entries, partial closes, and the current profit and loss (pnl) figures, including peak profit and maximum drawdown metrics.

Further details provide insight into the original entry price, take profit/stop loss levels, and helpful notes explaining the reasoning behind the trade. You can also see when the signal was initially created and when the position became active.

## Interface AverageBuyCommit

This interface represents an average-buy event, which occurs when a new purchase is made to gradually lower the average entry price of a position. It provides detailed information about that specific averaging purchase, including the price it was executed at, the cost of the purchase, and the resulting average entry price for the entire position. 

You'll find the current unrealized profit and loss (PNL), as well as the highest profit and largest drawdown achieved by the position so far. The interface also holds information about the original entry price, and any subsequent adjustments to the take profit and stop loss levels. Finally, it includes timestamps indicating when the signal was created and when the position became active.

## Interface AfterEndContract

This interface signals the end of a trading strategy run, whether it's a backtest or live trading. It's designed to be a guaranteed cleanup point, ensuring certain actions happen exactly once after each run, like flushing data buffers or sending completion notifications.

You’ll receive this event paired with a corresponding `BeforeStartContract` event, which marks the beginning of the run. The `when` property indicates the event's time; in backtests, it reflects the time of the last candle processed, while in live trading, it's the current time rounded to the nearest minute.

The event includes vital details about the run, like the trading symbol, strategy name, exchange, and frame used. A `backtest` flag tells you whether the run was a simulation or live trading, and `currentPrice` gives you a readily available average price at the time of completion. Importantly, the `timestamp` property provides the same time information as `when`, but in milliseconds for easier serialization and logging.

## Interface ActivePingContract

This describes a way to keep track of what’s happening with your active trading signals. Think of it as a heartbeat signal sent every minute while a signal is still open and being monitored.  It provides key information about the signal, like the trading pair (symbol), the strategy using it, and the exchange it's on.

You'll also find details about the timeframe used for the signal, all the original data that made up the signal, the current market price at the time of the ping, and whether the signal is part of a backtest or live trading. This allows you to build custom logic, like automatically managing signals based on price movements or other conditions. It essentially allows you to observe and react to signals as they're actively being tracked.

## Interface ActivateScheduledCommitNotification

This notification signals that a scheduled trading signal has been activated, letting you know a trade is about to happen or has already started. It provides a wealth of information about the trade, including a unique ID, the exact time it was triggered, and whether it's a backtest or live trade.

You'll find details like the trading pair (e.g., BTCUSDT), the strategy that generated the signal, and the exchange it's being executed on. 

The notification also includes specifics about the trade itself: the direction (long or short), entry price, take profit and stop loss levels, and details about any DCA (Dollar-Cost Averaging) involved.

Further details cover the potential profit and loss, including peak profit, maximum drawdown, and the associated prices and costs. You can track the progress of the trade with timestamps for creation, pending, and activation, as well as an optional note to explain the reason for the trade. Finally, a timestamp is included indicating when the notification was generated.

## Interface ActivateScheduledCommit

This interface represents an action that activates a previously scheduled signal. It’s essentially a notification that a signal, planned for execution, is now being put into action.

The `action` property confirms this is an activation.  You can also provide an `activateId`, a custom identifier for tracking the reason behind the activation.

The signal includes key information about the trade being executed, such as the `currentPrice` at the time of activation, the `position` (long or short), and the `priceOpen` at which the trade was entered.

You'll also find details on the position's performance, including its total `pnl`, `peakProfit`, and `maxDrawdown` – representing the highest profit and largest loss experienced so far.

Take profit and stop loss information is provided, with both the effective price (`priceTakeProfit`, `priceStopLoss`) and the original prices before any adjustments (`originalPriceTakeProfit`, `originalPriceStopLoss`). Finally, timestamps, `scheduledAt` when the signal was initially created, and `pendingAt` when the position was activated, help to track the signal's lifecycle.

