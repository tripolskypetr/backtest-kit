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

This interface defines the information shared when a walker needs to be stopped. Think of it as a notification that a particular trading strategy needs to pause its actions. 

It includes the trading symbol involved, the specific name of the strategy to halt, and the name of the walker responsible for that strategy. This last part is crucial because it allows multiple strategies to run on the same symbol at once, and lets you precisely target which one needs to be stopped.


## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps you understand the results of your backtesting experiments. It's designed to make it easier to work with the data in reports and analyses.

It combines the standard backtest results with extra information for comparing different strategies. 

Specifically, it includes a list of strategy results, allowing you to easily see and analyze how each strategy performed.

## Interface WalkerContract

The `WalkerContract` represents updates you receive as strategies are tested and compared. Think of it as a progress report during the backtesting process.

Each time a strategy finishes its test run, this contract sends information about what just happened.

It includes details like the strategy's name, the symbol being tested, and the exchange and frame it's running on.

You'll also get the strategy’s performance statistics, the specific metric being optimized, and its value, alongside the best metric value seen so far and the strategy achieving it.

Finally, it provides the overall context, telling you how many strategies have been tested and how many remain. This helps you understand where you are in the backtesting workflow.

## Interface WalkerCompleteContract

This interface represents the final outcome of a backtesting process, signaling that all strategies have been evaluated. It bundles together key details about the backtest, including the name of the walker that performed the tests, the trading symbol used, the exchange and timeframe involved. 

You'll find information about the metric used to judge strategy performance, the total number of strategies tested, and most importantly, the name of the best-performing strategy.

It also provides the value of the metric achieved by the best strategy, along with detailed statistics about that strategy's performance, giving you a complete picture of the backtest results.

## Interface ValidationErrorNotification

This notification signals that a problem occurred during validation, likely because a rule or constraint wasn't met. 

Each notification has a unique ID to help track it. 

You'll also get a detailed error message explaining what went wrong, along with a stack trace and other helpful information for debugging. 

The `backtest` flag will always be false because these validation errors arise from issues encountered during the live trading context, not a simulation.

## Interface ValidateArgs

This interface, ValidateArgs, provides a standard way to ensure the names you're using for different parts of your backtesting setup are correct. Think of it as a checklist for your configurations.

It defines properties like ExchangeName, FrameName, StrategyName, and more – each representing a key element in your backtest. 

Each property expects a specific type of data (represented as `T`), and this data should be an enumeration that matches a registered entity within the validation system. This helps guarantee that the names you’re using for exchanges, strategies, risk profiles, and other components are valid and recognized by the backtest-kit framework. Essentially, it's making sure everything is labeled correctly for a smoother and more reliable backtesting process.


## Interface TrailingTakeCommitNotification

This notification signals that a trailing take profit order has been executed. It provides a wealth of information about the trade, including a unique identifier, when it happened, and whether it occurred in backtest or live mode. You'll find details about the trading pair, the strategy involved, and the exchange where the action took place.

The notification also includes crucial pricing information like the entry price, adjusted take profit and stop loss prices, and the original prices set before any trailing adjustments. It breaks down the details of the position itself, telling you if it was a long or short trade, and how many entries or partial closes were involved.

Beyond the basics, this notification offers a comprehensive view of the trade's performance. You get the total profit and loss (pnl), peak profit, maximum drawdown, and associated pricing details, along with how much capital was invested. There's also a field for an optional note, allowing you to add a custom explanation for the trade.  Finally, timestamps track when the signal was created, became pending, and when this notification itself was generated.

## Interface TrailingTakeCommit

This describes a trailing take profit event within the backtest-kit framework. It’s triggered when a trading strategy adjusts a take profit level based on a pre-defined percentage shift. 

The event contains details about the adjustment, including the current market price, the percentage shift applied, and the resulting new take profit price. You'll also find information about the position’s performance up to this point, like the profit and loss (pnl), the highest profit achieved (peak profit), and the maximum drawdown. 

Other key pieces of data included are the trade direction (long or short), the original entry price, the original stop-loss and take-profit levels, and timestamps indicating when the signal was created and when the position was activated. Essentially, it gives you a comprehensive snapshot of what happened when a trailing take profit was executed.

## Interface TrailingStopCommitNotification

This notification tells you when a trailing stop order has been triggered and executed. It provides a wealth of information about the trade, including a unique identifier, the exact time it happened, and whether it occurred during a backtest or a live trading session. You'll find details about the trading pair, the strategy involved, and the exchange used.

The notification breaks down the specifics of the trade – the original and adjusted stop-loss and take-profit prices, the entry price, and the number of entries and partial closes involved. It also gives you a complete picture of the trade's profitability, including total profit/loss, peak profit, maximum drawdown, and their respective prices and percentages.

Finally, it includes optional notes to explain the reasoning behind the signal and timestamps for different stages of the signal lifecycle, giving you a full audit trail of the trailing stop's actions.

## Interface TrailingStopCommit

This describes a trailing stop event, which happens when a trailing stop-loss order is triggered. It provides a snapshot of what's happening with the trade at that specific moment.

The `action` property simply confirms this is a trailing stop event.

The `percentShift` shows how much the stop-loss price was adjusted based on the trailing percentage.

You’ll find details on the current market price (`currentPrice`) and the overall performance of the trade so far, including the profit/loss (`pnl`), the highest profit achieved (`peakProfit`), and the biggest drawdown experienced (`maxDrawdown`).

The `position` indicates whether the trade is a long (buy) or short (sell).

Key pricing information is included: the entry price (`priceOpen`), the current take-profit price (`priceTakeProfit`), and the adjusted stop-loss price (`priceStopLoss`).  You can also see the original take-profit and stop-loss prices (`originalPriceTakeProfit`, `originalPriceStopLoss`) before any trailing adjustments were made.

Timestamps (`scheduledAt`, `pendingAt`) indicate when the signal was created and when the position was activated.

## Interface TickEvent

This describes the `TickEvent` data structure, which acts as a central record for everything that happens during a trade. It's designed to capture all relevant information, no matter what's happening – whether a trade is being scheduled, opened, closed, or canceled.

Each `TickEvent` has a timestamp indicating when it occurred, and an `action` property which specifies the type of event (like 'closed', 'opened', or 'scheduled'). You’ll find details about the trade itself, like the trading symbol, signal ID, position type, and any notes associated with the signal.

For active trades, you'll also find price data, including open, take profit, and stop-loss prices, along with information about any modifications made to those original prices.  If the trade involves averaging entries (DCA), the total number of entries and partial closes will be recorded.

Profit and loss information is also included, representing both unrealized and realized gains or losses, as well as percentage progress toward take profit and stop-loss. Specific event details like close or cancel reasons, the duration of a trade, and performance metrics like peak and fall PNL, are also available in the event data. Certain properties are only relevant for specific actions, so not every value will be present in every event.

## Interface SyncStatisticsModel

This model holds data about signal synchronization events, giving you a clear picture of how signals are being synced within your system. It essentially tracks the lifecycle of these signals.

You'll find a detailed list of each individual sync event recorded within the `eventList` property.  The `totalEvents` field simply tells you how many sync events have occurred overall.  To understand how signals are being initiated and stopped, you can look at `openCount` (the number of signals opened) and `closeCount` (the number of signals closed).

## Interface SyncEvent

The `SyncEvent` object bundles together all the key details about a signal’s lifecycle, designed to make creating reports easier. It provides a snapshot of what happened at a specific point in time regarding a trade.

You'll find details like the exact timestamp of the event, the trading symbol involved, and the names of the strategy and exchange being used. It includes information about the signal itself, such as a unique ID, and importantly, the action taken (like opening or closing a position).

The event also captures the price at the time of the event, the direction of the trade (long or short), and the prices for entries, take profit, and stop loss, both as initially set and as they were adjusted.

Beyond these core details, you can also see data like when the signal was originally created, when it started, and how many entries and partial closes were executed. Crucially, it includes profitability metrics like total Profit & Loss (PNL), peak profit, and maximum drawdown, giving a clear picture of the position’s performance. If a signal was closed, the `closeReason` explains why. The `backtest` property indicates if the event occurred during a backtest simulation, and `createdAt` provides the date of event's creation.

## Interface StrategyStatisticsModel

This model holds a collection of statistics generated during a backtest, giving you a detailed view of your trading strategy's actions. It includes a complete list of all events that occurred, such as buys, sells, and modifications.

You can see the total number of events processed and specific counts for different action types, like cancels, closes, partial profits and losses, trailing stops, and breakeven adjustments. It also tracks events triggered by scheduled actions.

Finally, it keeps track of average buy (Dollar-Cost Averaging) events, if your strategy uses them. These numbers help you understand the behavior and characteristics of your strategy during the backtest.

## Interface StrategyEvent

The StrategyEvent object is designed to hold all the important information about what’s happening during your trading strategy's execution, whether it’s a backtest or a live trade. It acts as a record of key events, including the timestamp, the trading pair involved, the strategy’s name, and the exchange being used. 

Each event details specific actions like opening, closing, or modifying a position, and includes data like the current market price at the time of the action, the percentage used to close a position, and any price shifts applied by trailing stops. You'll find identifiers for scheduled, pending, or activated actions, along with the original and effective take profit and stop loss prices. 

For strategies using dollar-cost averaging (DCA), it records the number of entries, the total cost, and the effective average entry price. A free-form note field allows you to add context or explanations related to the event. The object also tracks if the strategy is running in backtest or live mode, and gives you the position direction (long or short).

## Interface SignalSyncOpenNotification

This notification signals that a pre-planned trading signal, likely a limit order, has been activated and a position has been opened. It provides a wealth of information about the trade, including a unique identifier, the timestamp of its opening, and whether it occurred during backtesting or live trading. You'll find details about the trading pair, the strategy that triggered the signal, and the exchange used.

The notification also includes critical performance data for the position, such as total profit and loss (PNL), peak profit achieved, and maximum drawdown experienced. A full breakdown of pricing, cost, and entry/exit points is also provided, along with insights into how profit/loss is calculated. 

Finally, you'll find technical details surrounding the order execution, including original prices, number of entries, and the timestamps related to signal creation and activation, as well as an optional note for providing additional context to the signal.

## Interface SignalSyncCloseNotification

This notification tells you when a trading signal has been closed, whether it was a take profit, stop loss, time expiry, or manual closure. It provides a wealth of information about the closed trade, including the unique identifier of the signal, the trading symbol, and the strategy that generated it. You'll find details about the trade's performance, such as profit and loss (both absolute and percentage), peak profit achieved, and maximum drawdown experienced. 

The notification also breaks down the entry and exit prices, along with details about any partial closes and DCA entries. It clarifies the reason for the closure, along with any notes associated with it. Furthermore, you can track when the signal was scheduled, activated, and when this specific notification was created to understand the lifecycle of the trade.  This comprehensive data allows for in-depth backtesting analysis and performance evaluation.

## Interface SignalSyncBase

This defines the core information shared by all signal synchronization events within the backtest-kit framework. Each signal event will include details such as the trading pair symbol – like BTCUSDT – the name of the strategy that created it, and the exchange involved.  You'll also find information about whether the event originates from a backtest or live trading environment, a unique identifier for the signal, the exact timestamp of the event, and the full data associated with the public signal. Think of it as a consistent record for tracking signals across different scenarios.

## Interface SignalScheduledNotification

This notification lets you know when a trading signal has been set to execute in the future. It’s like a heads-up that a trade is about to happen, whether it's part of a backtest or a live trade. Each notification has a unique ID and timestamp showing precisely when the signal was scheduled.

You’ll find details like the trading pair (e.g., BTCUSDT), the strategy that generated the signal, and the exchange where the trade will be placed.  The notification also outlines the trade’s specifics – whether it's a long (buy) or short (sell) position, along with target prices for entry, take profit, and stop loss. 

Furthermore, it gives you a good overview of potential performance metrics, including estimated profit (PNL), peak profit achieved, and maximum drawdown experienced so far. You'll also see the entry and exit prices factored into those PNL calculations and details on how many entries were executed. A 'note' field allows for extra details explaining the reason for the signal. Finally, a 'createdAt' timestamp indicates when the data was created, helping you track the signal's lifecycle.

## Interface SignalOpenedNotification

This notification signals the opening of a new trading position. It provides a wealth of information about the trade, including a unique identifier and timestamp to track its lifecycle. You’ll find details like whether it originated from a backtest or live trading, the specific symbol traded, and the strategy responsible for the decision.

The notification also breaks down the trade's specifics: its direction (long or short), entry and exit prices, and details about any take profit or stop-loss orders initially placed. 

For more in-depth analysis, the notification includes performance metrics like total profit/loss (PNL), peak profit, and maximum drawdown, along with the prices and costs associated with those events. It also lists details of any DCA averaging and partial closes that occurred. Finally, an optional note field allows for a human-readable explanation of the trade’s reasoning.

## Interface SignalOpenContract

This event signals that a pre-arranged trade, based on a limit order, has been executed. It's triggered when the trading framework successfully fills that order on the exchange, either in a simulated backtest or in a live trading environment. During backtesting, it happens when the market price meets the predetermined price levels (lower for long positions, higher for short positions).

This event provides detailed information about the completed trade, including the market price at the time of execution, the trade's direction (long or short), the entry and exit prices, profit and loss data, and the number of entries and partial exits. The signal includes information about original and adjusted take profit and stop loss prices, as well as timestamps for when the signal was created and when the trade was activated. This is particularly useful for synchronizing external systems, like order management tools or logging and auditing processes, to confirm that trades were correctly placed and executed.

## Interface SignalInfoNotification

This notification type lets you receive informational updates directly from your trading strategies, beyond just buy and sell signals. Think of it as a way for your strategies to "comment" on their actions and the status of your positions.

Each notification contains a wealth of details about the position, including when it was opened, the prices involved (entry, take profit, stop loss, both original and adjusted), and how many entries or partials were used. You’ll find metrics like peak profit, maximum drawdown, and percentage profit/loss, providing a comprehensive view of a trade's performance.

The notification also provides crucial details like the strategy’s name, the exchange used, and a unique identifier for both the signal and the notification itself. It includes timestamps for critical events like creation, scheduling, and pending status. Plus, you can receive a custom note provided by the strategy itself to offer even more context. Finally, you can optionally assign an identifier to link notifications with external tracking systems.

## Interface SignalInfoContract

This interface defines the structure of information messages sent out by trading strategies. It’s a way for strategies to broadcast custom data related to a specific trade, letting other parts of your system know what's happening.

The information includes details like the trading pair ("BTCUSDT"), the name of the strategy generating the signal, and the exchange being used. You’ll also find information about the historical candle or real-time price at the time of the signal, along with any notes or identifiers you’ve added. 

Essentially, it’s a standardized way to add extra context and debugging information to your backtesting and live trading processes. You can use this to build custom alerts, log events, or integrate with external systems. The `backtest` flag tells you whether the signal is from a backtest or a live trade, and `timestamp` provides a crucial reference point for time-based analysis.

## Interface SignalData$1

This data structure holds all the key details of a completed trade generated by a strategy. It’s designed to be used when calculating and displaying performance metrics, like profit and loss. Each piece of data represents a single, closed trade, outlining which strategy created it, its unique identifier, and what asset was traded. 

You'll find information such as the trading direction (long or short), the percentage profit or loss, and the reason for the trade's closure. Crucially, it also includes the exact timestamps of when the trade began and ended, allowing for a complete timeline of each transaction.

## Interface SignalCommitBase

This defines the fundamental information shared across all signal commitment events within the backtest-kit framework. Each signal commitment carries details like the trading pair's symbol, the name of the strategy that generated it, and the exchange it’s associated with.

It also specifies whether the signal originates from a backtest or a live trading environment, along with a unique ID for tracking purposes. You’ll find a timestamp marking when the signal was generated, along with information about the number of entries and partial closes executed.

Crucially, it records the original entry price and provides access to the raw signal data.  Finally, an optional note field allows for adding a human-readable explanation of why the signal was generated.

## Interface SignalClosedNotification

This notification tells you when a trading position has been closed, whether it was triggered by a take profit or stop loss, or some other reason. It provides a wealth of information about the trade, including the unique identifier, when it closed, and whether it was part of a backtest or a live trade. You'll find details about the symbol, strategy, and exchange involved, as well as the entry and exit prices and the original take profit and stop loss levels.

The notification also gives you insight into the trade's performance, with metrics like total profit/loss, peak profit, and maximum drawdown, all presented in both percentage and absolute USD values.  You'll also learn about the number of DCA entries and partial closes executed. Finally, details such as the scheduling and pending timestamps provide a full timeline of the signal’s lifecycle.

## Interface SignalCloseContract

This event, named `SignalCloseContract`, lets you know when a trading signal has been closed, whether that's because it hit a profit target, a stop loss, timed out, or was manually closed. It's designed to help external systems, like order management tools or accounting systems, stay in sync with what’s happening in the trading framework.

The event provides a wealth of information about the closed position. You’ll find details like the current market price, the overall profit and loss (PNL), the highest profit achieved, and the largest drawdown experienced. You also get the original and adjusted take profit and stop loss prices, the entry price, and information about the trade's direction (long or short).

Furthermore, it includes details about when the signal was initially created, when the position started, and crucially, *why* it was closed. If the position used dollar-cost averaging (DCA), it specifies how many entries and partial closes were involved. This lets you accurately track and reconcile your trading activity.

## Interface SignalCancelledNotification

This notification informs you when a scheduled trading signal has been cancelled before it could be executed. It’s like a notification saying “Hey, this order we planned didn’t go through.” 

The notification includes detailed information about the cancelled signal, such as its unique identifier, the trading symbol involved (e.g., BTCUSDT), the strategy that generated it, and the exchange where it was scheduled. 

You'll find specifics about the planned trade, including the intended direction (long or short), the take profit and stop-loss prices, and the entry price.  It also provides insight into *why* the signal was cancelled—was it due to a timeout, a price rejection, or a manual cancellation?

Furthermore, it includes technical details like timestamps, whether the cancellation occurred during backtesting or live trading, and details about any partial closes that might have been executed previously. The `note` field allows for an optional, custom explanation of the cancellation. You can also see the durations and pending timestamps.

## Interface Signal

The `Signal` object represents a single trading signal generated by your strategy. It holds vital information about the trade.

The `priceOpen` property tells you the price at which the trade was initiated.

Internally, it keeps track of the entry details in the `_entry` array. This array records each time the signal triggered a position opening, including the entry price, associated costs, and the timestamp.

Similarly, `_partial` is an array that holds information about any partial exits taken during the life of the trade. For each partial exit, you'll find details like the type (profit or loss), percentage of the position exited, current price at the time, the cost basis for the remaining position, how many shares or contracts were involved, and the timestamp.

## Interface Signal$2

The `Signal$2` object represents a trading signal and keeps track of important details about its execution. It holds the initial entry price of the position as `priceOpen`. 

You can also find a history of entry events, including the price, cost, and timestamp of each entry, stored within the `_entry` array. 

Furthermore, the `_partial` array details any partial exits from the position, noting whether they were for profit or loss, the percentage of the position exited, the price at the time of exit, the cost basis at the time, and the number of units held when the exit occurred.


## Interface Signal$1

This `Signal$1` object holds key information about a trading signal. 

It includes the opening price used when entering the position.

You’ll also find a record of entry details, which includes price, cost, and when the entry occurred.

Finally, it tracks any partial exits from the position, detailing whether they were for profit or loss, the percentage of the position exited, the price at the time of exit, the cost basis at the time of closing, the number of shares/contracts exited, and the associated timestamp.


## Interface ScheduledEvent

This data structure neatly packages all the key details about trading events – whether they were opened, scheduled, or cancelled. It gives you a complete picture of what happened, including when it occurred and the specific parameters used, like entry price, take profit, and stop loss levels.  You'll find information about any modifications made to the original prices, the number of entries and partial closes executed, and even the reason for cancellation if one happened.  It also includes real-time data like current market price and unrealized profit and loss (PNL) at the time of the event, alongside timestamps for creation, activation, and closing. Think of it as a single record containing everything needed to analyze and understand the entire lifecycle of a trade.

## Interface ScheduleStatisticsModel

This model holds a collection of statistics related to your scheduled trading signals. It helps you understand how well your scheduling strategy is performing.

You'll find a detailed list of all the scheduled events, including when they were scheduled, opened, or cancelled.

The model also provides key figures like the total number of signals scheduled, opened, and cancelled.

It calculates crucial performance indicators such as the cancellation rate (how often signals are cancelled) and the activation rate (how often scheduled signals become active trades). 

Finally, it tracks how long signals typically wait before being cancelled or activated, giving you insights into potential bottlenecks or inefficiencies.

## Interface SchedulePingContract

This interface describes the data you receive when a scheduled signal is actively being monitored – essentially, a regular heartbeat while the signal is running. These "schedule ping" events happen every minute.

You can use them to keep track of the signal's status and to build your own custom monitoring systems.

Each ping contains important information:

*   The symbol (like BTCUSDT) involved.
*   The name of the strategy managing the signal.
*   The exchange where the signal is active.
*   The full details of the scheduled signal itself, including pricing information.
*   The current market price at the time of the ping, allowing you to react to price changes.
*   A flag to tell you whether this ping is from a backtest (historical data) or live trading.
*   A timestamp indicating precisely when the ping occurred.

You can listen for these pings to implement custom cancellation logic – for example, automatically stopping a signal if the price moves unexpectedly.

## Interface RiskStatisticsModel

This model helps you understand and track risk events in your backtesting process. It bundles together information about individual risk rejections, the overall count of rejections, and how those rejections are distributed across different symbols and strategies. You'll find a list of all the specific risk events that occurred, along with summaries showing how many rejections happened for each symbol and strategy you're using. This gives you a clearer picture of where your risk management is being triggered and where potential issues might lie.


## Interface RiskRejectionNotification

This notification lets you know when a trading signal was blocked by your risk management rules. It provides a lot of details to help you understand why the signal wasn't executed.

You'll see the unique ID of the notification, the time it happened, and whether it occurred during a backtest or live trading.  It also tells you which strategy tried to generate the signal, which exchange was involved, and the specific reason for the rejection.

The notification also gives you context about the market conditions at the time, including the symbol being traded, current price, and details about the potential trade like its direction (long or short), take profit, and stop loss levels. If a signal ID is available, you'll also find it here. 

You can also find the number of active positions and, optionally, a description of the signal's purpose.  Finally, the notification includes a timestamp for when it was created.

## Interface RiskEvent

This data structure holds details about when a trading signal was blocked due to risk management rules. It’s like a log entry explaining why a trade didn’t happen. 

Each entry tells you when the rejection occurred, which trading pair was involved, the specifics of the signal that was rejected, and the name of the strategy and exchange that generated it. 

You'll also find the time frame being used, the current market price, how many positions were already open, and a unique ID for the specific rejection. A note explaining the reason for the rejection is included, along with an indicator if the rejection happened during a backtest or in live trading.

## Interface RiskContract

The RiskContract represents a signal that was blocked because it violated risk management rules. Think of it as a record of when the system said "no" to a trading action.

It’s used to keep track of actual risk breaches and to let different parts of the system, like report generators and user notifications, know what happened.

Here’s what information is included for each rejected signal:

*   **symbol:** Which trading pair was affected (e.g., BTCUSDT).
*   **currentSignal:** The details of the trade that was being attempted.
*   **strategyName:** The name of the trading strategy that generated the signal.
*   **frameName:** The timeframe being used for the backtest or trading.
*   **exchangeName:** Which exchange was involved.
*   **currentPrice:** The price of the asset at the moment the risk check failed.
*   **activePositionCount:** The total number of open positions across all strategies.
*   **rejectionId:** A unique ID for this specific rejection event, for debugging.
*   **rejectionNote:** A human-readable explanation of why the signal was rejected.
*   **timestamp:** When the rejection occurred.
*   **backtest:** Whether this occurred during a backtest or live trading.

## Interface ProgressWalkerContract

The `ProgressWalkerContract` helps you keep tabs on how a backtesting process is going. It's essentially a notification system that sends updates as your backtests run. 

You'll receive these updates – which include details like the walker's name, the exchange being used, and the frame – as each backtest is performed.

The most important information is that it tells you the total number of trading strategies involved, how many have already been processed, and the overall percentage of completion. This allows you to monitor the progress and estimate how long the entire backtest will take.

## Interface ProgressBacktestContract

This interface provides updates on the backtesting process as it runs. It allows you to monitor the status of a backtest, showing you which exchange and trading strategy are being used, along with the specific symbol being tested.  You'll see how many historical data points (frames) are in the backtest, how many have already been processed, and the overall percentage of completion. Essentially, it's a way to know how far along the backtest has come and anticipate when it will finish.

## Interface PerformanceStatisticsModel

This model holds all the performance data collected for a specific trading strategy. It gives you a high-level view of how a strategy performed, including the strategy's name and the total number of events and execution time recorded. 

Inside, you’ll find `metricStats`, which organizes the data by the type of performance metric being tracked. Finally, the `events` array contains all of the raw data points, allowing for a detailed look at each individual performance recording.

## Interface PerformanceContract

The PerformanceContract lets you keep an eye on how your trading strategies are performing. Think of it as a record of events happening during a backtest or live trading, giving you insights into where things might be slow or inefficient. 

Each record includes details like when the event occurred, when the previous event happened, and what kind of operation was being performed. 

You’ll also find information about which strategy and exchange were involved, and whether the event occurred during a backtest or in live trading. Knowing the trading symbol helps pinpoint which asset the metric relates to. This helps identify areas for improvement and optimize your trading system.

## Interface PartialStatisticsModel

This model helps you understand how your trading strategy performs when it makes partial adjustments to positions. It essentially collects data about each time your strategy realizes a partial profit or loss.

You'll find a list of all those events, complete with details, in the `eventList` property. The `totalEvents` property tells you the overall number of partial profit/loss events that occurred.  Then, `totalProfit` tells you how many of those events resulted in a profit, and `totalLoss` tells you how many resulted in a loss. This allows for detailed analysis of your strategy's partial position adjustments.

## Interface PartialProfitContract

The `PartialProfitContract` represents when a trading strategy reaches a pre-defined profit milestone, like 10%, 20%, or 30% gain. It's a notification used to keep track of how a strategy's profits are building up.

These notifications happen for each level achieved and are sent out when a trading signal hits those profit targets. You can think of it as a running tally of progress toward a take-profit goal.

The notification includes important details:

*   The trading symbol (e.g., BTCUSDT)
*   The name of the strategy that made the trade
*   The exchange and frame used for the trade
*   The original signal information, including prices
*   The current market price at the time the level was reached
*   The specific percentage profit level achieved (10%, 20%, etc.)
*   Whether it’s from a backtest or live trading
*   A timestamp indicating when the level was reached.

Systems like the report generator or your own custom functions can listen for these notifications to monitor performance or generate reports.

## Interface PartialProfitCommitNotification

This notification tells you when a partial profit commitment has been executed, whether it’s from a backtest or live trading. It provides a ton of details about the trade, including a unique ID, when it happened, and which exchange and strategy were involved. You’ll find information about the symbol being traded, the entry and take profit/stop loss prices, along with details about how those prices might have changed due to trailing adjustments.

It also includes key performance indicators (KPIs) like total profit and loss (pnl), peak profit, and maximum drawdown, all calculated up to the point of the partial close. You’ll see how much of the position was closed, the current price at the time, and even numbers like the total entries and partial closes. There’s also extra info for deeper analysis, such as the individual entry prices, cost, and percentages, as well as timestamps showing when the signal was created, pending, and scheduled. Lastly, a note field provides space for explaining the reasoning behind the signal.

## Interface PartialProfitCommit

This object represents a partial profit-taking action within a trading strategy's backtest. It details how much of a position is being closed, what percentage of the position is being taken off, and the current market conditions at the time of that action. Included are key performance metrics for the position, such as the total profit and loss, the highest profit achieved, and the maximum drawdown experienced. You'll also find information about the original entry price, take profit, and stop loss levels, along with how those levels might have been adjusted through trailing. Finally, the object captures the timestamps associated with the signal's creation and the position's activation.

## Interface PartialProfitAvailableNotification

This notification signals that your trading strategy has reached a profit milestone, like 10%, 20%, or 30% gain. It's a way to track your progress and understand how your strategy is performing.

The notification includes key details such as a unique ID, the exact time the milestone was reached, and whether it's from a backtest or live trading environment.  You'll find information about the trading pair, the strategy used, and the specific signal that triggered it.

The notification also provides crucial information about the trade itself: the entry price, the current market price, the trade direction (long or short), and the effective take profit and stop-loss prices. You'll also see the original prices before any adjustments from trailing stops or DCA averaging.

It digs deeper with metrics like total entries, partial closes, and total profit and loss (PNL) data, along with insights into the position’s peak profit and maximum drawdown.  You’ll also find percentages, cost values and entry details for a complete picture of the position's performance. Lastly, there's an optional note field for any human-readable explanations about the signal.


## Interface PartialLossContract

The `PartialLossContract` represents events triggered when a trading strategy hits predefined loss levels, like -10%, -20%, or -30% drawdown. These events are essential for monitoring how your strategies are performing and understanding their potential risk exposure.

Each event details precisely what happened: which trading pair (`symbol`), which strategy (`strategyName`) generated the signal, on which exchange (`exchangeName`) and frame (`frameName`). You’ll also get access to the complete original signal data (`data`), the current price at the time of the loss (`currentPrice`), and the specific loss level reached (`level`).

The `level` property is important to remember - even though it’s a positive number, it indicates a negative loss percentage.  A `level` of 20 means a -20% loss from the initial entry price.

Finally, you can determine whether this event comes from a backtest (historical data) or live trading through the `backtest` flag, and see exactly when the loss was detected via the `timestamp`.  These events are intended for services like report generation and for custom monitoring through callbacks.


## Interface PartialLossCommitNotification

This notification tells you when a partial closing of a trading position has happened. It’s like a detailed report card for a specific part of a trade. 

You’ll find key information here like a unique ID for the notification, when it occurred, and whether it's part of a backtest or a live trade.

The report breaks down the specifics of the trade: the trading pair, the strategy that triggered the close, and details about the position itself – whether it was a long or short trade, the entry price, and the stop-loss and take-profit levels (both original and adjusted).

It also provides a full financial picture of the position, including profit and loss figures, peak profit, and maximum drawdown, all presented in both absolute and percentage terms. You’ll see details about the number of entries and partial closes, plus some optional notes explaining the reasoning behind the trade. Finally, it records timestamps for the signal’s creation, pending status, and the notification’s creation.

## Interface PartialLossCommit

This data represents a partial loss event occurring within a trading strategy. It details a situation where a portion of an existing position is being closed out, rather than the entire position.

The `action` property clearly identifies this as a "partial-loss" event. The `percentToClose` indicates what percentage of the total position size is being reduced.

Crucially, it provides comprehensive performance information regarding the position, including the total profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the greatest drawdown experienced (`maxDrawdown`).

You'll also find details regarding the trade's original setup like entry price (`priceOpen`), intended take profit and stop loss levels (both original and adjusted after trailing), as well as the current market price at the time of the partial close.

Finally, timestamps (`scheduledAt` and `pendingAt`) are included to track when the signal to close this portion of the position was generated and when the position was initially activated.

## Interface PartialLossAvailableNotification

This notification alerts you when a trading position hits a predefined loss milestone, like a 10% or 20% drop. It provides detailed information about why this happened, including a unique ID for tracking and a timestamp indicating when the loss level was reached. You’ll see if it's a backtest (historical simulation) or a live trade, the trading pair involved (like BTCUSDT), and the strategy responsible.

The notification includes comprehensive details about the trade itself: the entry price, trade direction (long or short), and the original/adjusted stop-loss and take-profit prices. You also get a breakdown of the position's history, including the number of initial entries and partial closes executed.

Crucially, it contains performance metrics like total profit/loss (both in USD and percentage), peak profit achieved, and maximum drawdown experienced. This helps you evaluate the position’s performance and understand its risk profile, down to the exact price levels and entries involved at key moments.  Finally, you'll find additional details like a textual note describing the reason behind the signal and timestamps for signal creation, pending status and notification creation.

## Interface PartialEvent

This data structure holds all the important information about a profit or loss milestone during a trade. Think of it as a snapshot of what happened at a significant point in the trading process.

Each event includes details like the exact time it occurred, whether it was a profit or loss, the trading pair involved, and the name of the strategy that generated it. 

You'll also find information about the position size, the current market price, the levels of profit or loss reached (like 10%, 20%, etc.), and the original entry, take profit, and stop loss prices. 

For strategies employing dollar-cost averaging (DCA), it tracks the number of entries made and the original entry price before averaging. It also includes any partial closes that have been executed and the overall unrealized profit and loss (PNL) at that point in time. A human-readable note, timestamps for when the position became active and the signal was created, and a flag indicating if the trade is part of a backtest are also included.

## Interface MetricStats

This object neatly packages together all the statistics calculated for a specific performance metric. It tells you how many data points were collected (the `count`), the total time taken for all those events (`totalDuration`), and then a range of measures describing how those times spread out. You'll find the average time (`avgDuration`), the shortest (`minDuration`), and the longest (`maxDuration`), plus a measure of how much the times varied around the average, known as the standard deviation (`stdDev`).

It also provides percentiles, allowing you to see the durations at the 95th (`p95`) and 99th (`p99`) points, which are useful for understanding outlier behavior. For metrics involving events, it tracks the time between them, giving you `avgWaitTime`, `minWaitTime`, and `maxWaitTime`. The `metricType` property identifies which type of metric these statistics represent.

## Interface MessageModel

This framework defines a `MessageModel` to represent a single message within a conversational history, like you'd find when interacting with a large language model. Each message has a `role` indicating who sent it – whether it’s a system instruction, a user’s query, the assistant's response, or the result of a tool execution. The `content` property holds the actual text of the message, which can be empty for messages that primarily involve tool usage. 

Sometimes, models provide detailed reasoning steps; this is captured in the `reasoning_content` field.  Assistant messages might also include `tool_calls`, detailing any tools the assistant used to generate the response. Finally, messages can contain images, which can be provided as Blobs, raw bytes, or base64 encoded strings. When a message is a direct response to a tool call, it will also have a `tool_call_id` referencing that specific tool call.

## Interface MaxDrawdownStatisticsModel

This model holds information about maximum drawdown events encountered during a trading simulation. 

It keeps track of each drawdown event in a list called `eventList`, which is ordered from the most recent to the oldest. 

You'll also find the total count of all recorded drawdown events in the `totalEvents` property. This allows you to easily see how many times the maximum drawdown occurred throughout the backtest.

## Interface MaxDrawdownEvent

This describes a single instance of a maximum drawdown that occurred during a trading simulation or live trading. It provides a detailed snapshot of the conditions surrounding that drawdown event.

Each record includes the exact time the drawdown occurred, the trading pair involved, the name of the strategy used, and a unique identifier for the signal that triggered the trade.  You'll also find information about the position itself (long or short), the overall profit and loss, the highest profit achieved, and the depth of the drawdown.

Crucially, the record holds the price at which the drawdown was realized, as well as the entry price, take profit price, and stop loss price that were set for the trade. Finally, it indicates whether the event happened during a backtest or in live trading.

## Interface MaxDrawdownContract

This describes the data you receive when a new maximum drawdown is detected in a trading position. It's essentially a notification that the position's value has dropped to a new low point since its peak.

The notification contains important details such as the trading symbol, the current price, and the exact time the drawdown occurred. You’ll also find information about the strategy, exchange, and timeframe involved.

Crucially, it includes the signal that triggered the position and a flag to tell you whether this event happened during a backtest or in live trading. This allows you to tailor your reaction – for example, adjusting stop-losses or managing risk – based on the drawdown event. These updates are sent whenever a new drawdown level is hit, providing real-time insight into position performance.

## Interface LiveStatisticsModel

This model provides a detailed look at your live trading performance, offering a wide range of statistical insights. It keeps track of every event – from idle periods to opened, active, and closed trades – giving you a complete history of your trading activity. You'll find key metrics like the total number of trades, win rate, average profit and loss per trade, and overall cumulative profit.

Beyond basic statistics, it calculates more advanced measures like standard deviation (a measure of volatility), Sharpe and Sortino ratios (which assess risk-adjusted returns), and drawdown-related metrics (recovery factor and Calmar ratio). These more complex calculations help you understand the efficiency and consistency of your trading strategy. Remember, if a number is null, it means the calculation wasn't reliable or safe to perform. The model also provides insights into peak and fall PNL percentages, helping you to assess the potential upsides and downsides of your strategy.

## Interface InfoErrorNotification

This component handles notifications about errors encountered during background processes. These aren’t critical, unrecoverable errors, but issues that need attention. 

Each notification has a unique identifier (`id`) and a descriptive message (`message`) to help understand what went wrong. You'll also find a detailed error object (`error`) containing information like a stack trace and any associated data. 

It's important to know that these notifications always indicate a situation occurring outside of a backtest scenario – the `backtest` property is always `false`.  The `type` property confirms this is an informational error notification, ensuring type safety within your code.

## Interface IdlePingContract

This interface describes a special event, called an "Idle Ping," that happens when a trading strategy isn't actively making moves – essentially, it's just waiting. It's triggered regularly when no trades are pending or scheduled.

Think of it as a heartbeat signal that helps you monitor how long your strategy has been in a resting state.

The Idle Ping includes details like the trading pair involved (e.g., BTCUSDT), the name of the strategy that's idle, which exchange it's using, and whether it's a backtest or a live trading scenario. You'll also get the current market price and a timestamp to pinpoint exactly when the ping occurred. 

You can listen for these idle ping events to build custom tracking or monitoring features for your strategies.

## Interface IWarmCandlesParams

This interface defines the information needed to fetch and store historical candle data. Think of it as a set of instructions for downloading past price charts. It includes details like the specific cryptocurrency pair (symbol) you're interested in, the exchange providing the data, the timeframe of the candles (like 1-minute or 4-hour intervals), and the start and end dates for the data you want to retrieve. It's helpful for preparing your backtesting environment with a complete history of market data.

## Interface IWalkerStrategyResult

This interface describes the result you get when evaluating a trading strategy within a backtest. It holds key information about the strategy itself, like its name.

You'll also find comprehensive statistics about the strategy’s backtest performance, including metrics like profit and drawdown.

A crucial value is the metric – a single number used to compare the strategy against others. Finally, the `rank` property tells you where this strategy stands in the overall comparison, with a lower number indicating a better result.

## Interface IWalkerSchema

The IWalkerSchema defines how to set up A/B tests for different trading strategies. 

Think of it as a blueprint for running comparisons between strategies, making sure they all use the same exchange and timeframe. 

You give it a unique name to identify the test, and can add a note for yourself to explain what it's for. 

It tells the system which strategies to compare, which exchange and timeframe to use for backtesting, and which metric to optimize—like Sharpe Ratio by default—to see which strategy performs best. 

You can also add custom callbacks to hook into different stages of the testing process.


## Interface IWalkerResults

The `IWalkerResults` object holds all the information gathered after a comparison of different trading strategies. It tells you which symbol was tested, what exchange was used for the backtest, the name of the specific "walker" that ran the test, and the name of the timeframe (like 1-minute or daily) used for the analysis. Think of it as a container for the core details about a single backtest run.

## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you hook into different stages of the backtest process. Think of it as a way to get notified and potentially react to what's happening as the backtest kit runs through different strategies.

You'll receive notifications when a strategy starts (`onStrategyStart`), finishes (`onStrategyComplete`), or encounters an error (`onStrategyError`). Each of these provides the strategy name, the trading symbol, and relevant details like statistics and any error message.

Finally, `onComplete` is called when all the strategies have been tested, giving you access to the overall results. This allows for customization and provides insight into the backtesting procedure.

## Interface ITrailingTakeCommitRow

This interface describes a queued action related to trailing take profit and stop-loss orders. 

It represents a single instruction to adjust a trailing stop based on a percentage shift from the current price. 

Essentially, it tells the backtest engine to move the trailing stop by a specific percentage.

The `action` property clearly identifies this as a "trailing-take" action. 

You’ll also find the `percentShift`, which determines how much the trailing stop will move, and the `currentPrice`, which is the price used as the basis for calculating that shift.

## Interface ITrailingStopCommitRow

This interface represents a queued action related to a trailing stop order. Think of it as a record of what needs to happen with a trailing stop – specifically, adjusting it.

It tells us the action being performed is a "trailing-stop" adjustment. 

The `percentShift` property holds the percentage change that will be applied to the trailing stop's price.  This is how much the stop-loss will move.

Finally, `currentPrice` stores the price at which the trailing stop was initially established, providing context for the adjustment.

## Interface IStrategyTickResultWaiting

This interface represents a specific kind of tick result you'll encounter when a trading strategy has a scheduled signal that's still waiting for the price to reach its entry point. Think of it as a holding pattern – the strategy knows it *wants* to trade, but isn’t quite ready yet. 

You'll receive this type of result repeatedly as the price fluctuates and the strategy monitors the signal.  It's different from the initial "scheduled" signal which is only sent once when the signal is created.

Here's what the information included in this result tells you:

*   **action:**  Confirms that the strategy is in a "waiting" state.
*   **signal:** Contains the details of the scheduled trading signal itself.
*   **currentPrice:**  The VWAP price being watched for the entry point.
*   **strategyName, exchangeName, frameName, symbol:**  These provide context and tracking information about where and how the strategy is operating.
*   **percentTp, percentSl:** These are always zero in this "waiting" state because no position has been opened yet.
*   **pnl:**  Shows the theoretical, unrealized profit and loss of the position if it were to be activated.
*   **backtest:**  Indicates whether the strategy is running in backtest mode or live trading.
*   **createdAt:** Records the exact time this tick result was generated, which is useful for debugging and analysis.

## Interface IStrategyTickResultScheduled

This interface describes a special type of tick result that occurs when a trading strategy generates a signal that's intended to be triggered later, based on a specific price condition. It's like the strategy is saying, "I want to trade this, but wait until the price reaches this level."

The result contains all the relevant information about the signal, including the strategy's name, the exchange, the time frame, the symbol being traded, and the price at which the signal was initially generated. You’ll also find details like whether this is happening in a backtest simulation or a live trading environment, and a timestamp marking when this scheduled signal was created. Essentially, it's a record that a planned trade is waiting to be executed.

## Interface IStrategyTickResultOpened

This interface describes what happens when a new trading signal is successfully created. It's a notification that a signal has been generated and is now ready to be acted upon.

You'll receive this notification after the signal has been checked for validity and saved.

The notification includes details like the newly created signal itself, which strategy and exchange generated it, the trading symbol involved (like BTCUSDT), and the current price at the time of creation.  There's also information about whether this event occurred during a backtest or a live trading session, and when it happened.

## Interface IStrategyTickResultIdle

This interface represents a tick result indicating the strategy is in an idle state, meaning no active trading signal is present. It provides details about the context of this idle state, like the strategy’s name, the exchange being used, the timeframe, and the trading symbol. You'll find the current price during this idle period, whether the test is a backtest or live execution, and a timestamp for when the event occurred. Essentially, it's a record of when the strategy isn’t actively trading, but is still observing the market.

It contains these key pieces of information:

*   **action:** Always set to "idle" to clearly identify the state.
*   **signal:**  Always `null` because there is no signal being generated.
*   **strategyName:**  The name of the strategy that generated this event.
*   **exchangeName:** The exchange the strategy is connected to.
*   **frameName:** The timeframe used for this data (like 1-minute or 5-minute candles).
*   **symbol:**  The trading pair being analyzed (e.g., BTCUSDT).
*   **currentPrice:** The price of the trading pair at the time.
*   **backtest:** Flags whether this event came from a backtest or a live trading environment.
*   **createdAt:**  A timestamp indicating exactly when this idle state was observed.

## Interface IStrategyTickResultClosed

This interface describes what happens when a trading signal is closed, providing a comprehensive snapshot of the event. It includes all the details needed to understand why the signal closed—whether it was due to a time limit, a profit or loss target, or a manual closing—and how much profit or loss was generated. 

You'll find information like the final price at the time of closure, a timestamp marking when the closure occurred, and a detailed breakdown of the profit/loss, factoring in things like fees and slippage.  It also tracks essential identifying details like the strategy's name, the exchange used, the time frame, and the trading pair.  A flag indicates whether this closure happened during a backtest or in live trading, and a unique ID is available for manually closed signals. Finally, it records when the closure event itself was generated.


## Interface IStrategyTickResultCancelled

This interface describes what happens when a scheduled trading signal doesn't trigger or gets cancelled before a position is opened. Think of it as a notification that a planned action didn't go through as expected.

It provides details about the signal that was cancelled, the final price at the time of cancellation, and when the cancellation occurred. 

You'll also find information about which strategy and exchange were involved, the timeframe used, the trading symbol, and whether this event happened during a backtest or live trading. 

A `reason` property explains *why* the signal was cancelled, and there’s even an optional ID if the cancellation was initiated by you (through a manual cancellation). Finally, it notes when this cancellation event was created.


## Interface IStrategyTickResultActive

This interface represents a situation where a trading strategy is actively monitoring a signal, waiting for a take profit (TP), stop loss (SL), or expiration. It provides details about the ongoing activity, including the signal being monitored, the current price used for calculations, and the strategy's name and associated exchange and timeframe.

You'll find key information like the symbol being traded, the percentage progress towards TP and SL, and the current unrealized profit and loss (PNL) for the active position. It also indicates whether the activity is part of a backtest or a live trading scenario. Finally, timestamps are included to track the creation of the event and the last candle processed, aiding in the sequencing and advancement of backtesting processes.

## Interface IStrategySchema

The IStrategySchema defines how your trading strategy works and how it interacts with the backtest-kit system. 

It's essentially a blueprint that tells the system what signals your strategy generates and how often it should check for those signals.

Each strategy needs a unique name, and you can add a note for yourself or others to understand its purpose.

The `interval` property controls how frequently the strategy checks for signals – you can set a minimum time between these checks.

The core of the strategy is the `getSignal` function, which takes the current market price and time as input and calculates whether to buy or sell. This function returns a signal, or null if no action should be taken.

You can also define lifecycle callbacks like `onOpen` and `onClose` to execute code at the start and end of the strategy. 

Finally, strategies can be assigned risk profiles and actions to integrate with risk management and other systems.

## Interface IStrategyResult

The `IStrategyResult` represents a single run of a trading strategy during a backtest. Think of it as a record of how one strategy performed. 

It holds the strategy's name, so you know which strategy it is, along with a comprehensive set of statistics detailing its performance. 

Crucially, it also includes the value of the metric used to judge the strategy's success – this is how strategies are ranked against each other.  You'll find the timestamps of the first and last signals generated by the strategy, which gives you a sense of its activity window. If a strategy didn't generate any signals, those timestamps will be null.

## Interface IStrategyPnL

This interface represents the profit and loss (PNL) calculation results for a trading strategy. It provides a breakdown of how your strategy performed, taking into account both transaction fees and slippage, which are common factors affecting real-world trading.

The `pnlPercentage` tells you the overall profit or loss as a percentage of your initial investment. A positive value means you made money, and a negative value means you lost.

You'll also find the `priceOpen` and `priceClose` values, which show the adjusted entry and exit prices respectively, reflecting the impact of fees and slippage.

The `pnlCost` gives you the actual dollar amount you gained or lost on the trade. Finally, `pnlEntries` indicates the total amount of money you originally invested to achieve that trade.


## Interface IStrategyCallbacks

This interface lets you plug in custom functions to react to different phases of a trading strategy's lifecycle. Think of them as event listeners that fire when a signal transitions between states like opening, becoming active, or closing. You can use these callbacks to log information, perform calculations, or trigger other actions based on the signal's status.

Here’s a breakdown of what each callback does:

*   `onTick`: Runs every time a new price data point arrives – useful for real-time monitoring.
*   `onOpen`: Triggers when a new signal is validated and a position is opened.
*   `onActive`: Fires when the signal is actively being monitored, meaning it's in a pending state.
*   `onIdle`: Called when no active signals are present, indicating a period of inactivity.
*   `onClose`: Signals that a signal has been closed, providing the final closing price.
*   `onSchedule`:  Indicates a scheduled signal is created – often used for delayed entries.
*   `onCancel`: Notifies you when a scheduled signal is cancelled before a position is opened.
*   `onWrite`: Called when signal data is saved for testing or persistence.
*   `onPartialProfit`: Signals that the position has moved favorably, but the take profit hasn’t been reached.
*   `onPartialLoss`: Triggers when the position has moved unfavorably, but the stop-loss hasn’t been hit.
*   `onBreakeven`:  Alerts you when the signal reaches the breakeven point, often accompanied by a move of the stop-loss.
*   `onSchedulePing`: Provides regular updates (every minute) for scheduled signals, allowing for custom monitoring and potential cancellation.
*   `onActivePing`:  Offers minute-by-minute updates for active, pending signals for custom monitoring or management.

## Interface IStrategy

The `IStrategy` interface defines how a trading strategy interacts with the backtest-kit framework.

The `tick` method is called on each price update, and it’s responsible for checking for signals, potential take profit/stop loss triggers, and throttling.

You can use `getPendingSignal` and `getScheduledSignal` to retrieve active signals, helping you monitor TP/SL and expiration.

Several methods like `getBreakeven`, `getTotalPercentClosed`, `getTotalCostClosed`, `getPositionPnlPercentage`, and `getPositionPnlCost` provide detailed insights into the position’s status and performance. They are helpful for understanding partial closures, DCA averaging, and overall profitability.

`backtest` lets you quickly run simulations using historical price data.

`stopStrategy` provides a graceful way to halt new signal generation without prematurely closing existing positions.  `cancelScheduled` and `activateScheduled` allow fine-grained control over scheduled signal activation.

The `closePending`, `partialProfit`, `partialLoss`, `trailingStop`, `trailingTake`, and `breakeven` methods offer control over position management and risk adjustments.

The `validate` methods for partial profit/loss, trailing stop, trailing take, and breakeven allow you to verify if those actions would be successful *before* executing them.

Finally, numerous `get...` methods exist to access detailed data regarding position history, performance metrics, and timing information. These help in analyzing how a strategy performed and understand its behavior over time. The `dispose` method allows for clean shutdown of the strategy and resource cleanup.

## Interface IStorageUtils

This interface defines the basic functionalities needed for any storage adapter used within the backtest-kit trading framework. Think of it as a contract – any storage solution you want to use needs to provide ways to react to different signal events, like when a trade is opened, closed, scheduled, or cancelled.

The adapter must also provide methods for retrieving information, specifically finding a signal by its unique ID and listing all signals currently stored.

Finally, it handles special ping events that keep the signal's update timestamp current, ensuring accurate historical tracking for both opened and scheduled positions. These pings are important for maintaining data integrity.

## Interface IStorageSignalRowScheduled

This interface represents a signal row that's been scheduled. It's straightforward – it confirms the signal is in a "scheduled" state. The `status` property is explicitly set to "scheduled," clearly indicating the signal's current processing phase. Think of it as a flag saying, "This signal is ready to be acted upon."

## Interface IStorageSignalRowOpened

This interface defines the data structure for a storage signal that represents an open position. It indicates that a trade has been initiated and is currently active.

The core of this structure is the `status` property, which is always set to "opened". This clearly signals that the signal is actively managing a trade.

## Interface IStorageSignalRowClosed

This interface represents a signal that has been closed, meaning a trade has been executed and the position is settled. 

It contains information specific to closed signals, unlike open signals which have different data. 

The `status` property confirms the signal is indeed in a closed state.

Crucially, it includes the `pnl` property, which holds the profit and loss data associated with that closed trade – essentially, how much money was made or lost.

## Interface IStorageSignalRowCancelled

This interface represents a storage signal row that has been cancelled. It's straightforward – if you see this structure, it means the associated signal is no longer active or valid. 

The only piece of information it provides is the `status` property, which will always be set to "cancelled". This clearly indicates the signal's current state.

## Interface IStorageSignalRowBase

This interface defines the basic structure for how signal data is stored. Every signal, regardless of its status, will have these core properties. 

`createdAt` records precisely when the signal was initially created, using a timestamp from the strategy results.
`updatedAt` similarly tracks when the signal was last modified.
`priority` dictates the order in which the storage adapter should process these signals; a timestamp representing the current time ensures signals are handled in a timely order.

## Interface IStateParams

`IStateParams` defines the configuration needed to set up a named state area for your signals. Think of it as giving your signals a way to organize themselves, like putting trades in a "trade" folder and performance data in a "metrics" folder. You’ll specify a `bucketName` which acts as that folder name, providing a logical grouping for related signal states.  Along with that, you tell it what the starting value should be for each signal within that bucket with `initialValue`, ensuring a consistent beginning for your data.

## Interface IStateInstance

The `IStateInstance` interface helps manage and track information about a trading position over time. Think of it as a place to store key metrics for each trade, like the highest unrealized profit, how long the position has been open, and when to cut losses. This is especially useful for strategies that use AI to make decisions, as it allows the AI to learn from the position's performance.

It provides methods for setting up this tracking, reading the current values, and updating them as the trade progresses.  The system is designed to prevent accidentally looking into the future by ensuring that reads only access past data. Importantly, it can handle situations where a backtest restarts, allowing it to reset this tracking without disrupting a live trading environment. Finally, there's a way to release any resources used by the state instance when it's no longer needed.

## Interface ISizingSchemaKelly

This schema defines a sizing strategy based on the Kelly Criterion, a formula that helps determine the optimal amount to bet or invest based on the expected return. 

It’s designed to maximize long-term growth, but it's important to understand its potential for volatility.

The `method` property is always set to "kelly-criterion" to identify the sizing approach.  The `kellyMultiplier` property controls how aggressively you apply the Kelly Criterion – a lower value like 0.25 (the default) represents a more conservative "quarter Kelly" approach, while a higher value increases the bet size but also increases risk.

## Interface ISizingSchemaFixedPercentage

This schema defines a simple way to size your trades, always using a fixed percentage of your capital for each trade. It's straightforward: you specify a `riskPercentage` value, which represents the maximum percentage of your account you’re willing to risk on a single trade.  For instance, setting `riskPercentage` to 20 means each trade will risk 20% of your available funds. The `method` property is always set to "fixed-percentage" to identify this specific sizing approach.

## Interface ISizingSchemaBase

This interface defines the basic structure for sizing configurations within the backtest-kit framework. Every sizing schema will have a unique identifier, allowing you to easily distinguish between different sizing strategies. 

You can also add a note to provide extra context or documentation for developers.

The configuration also includes limits on position size, specifying the maximum percentage of your account that can be used, and setting absolute minimum and maximum position sizes to ensure practical trade sizes. Finally, optional callbacks allow for custom logic to be triggered at different stages of the sizing process.

## Interface ISizingSchemaATR

This schema helps define how much of your capital you want to risk on each trade, using the Average True Range (ATR) to determine stop-loss placement. 

It’s designed for strategies that rely on ATR to manage risk effectively.

You'll specify a `riskPercentage` representing the maximum portion of your account you're willing to lose on a single trade – typically a value between 0 and 100. 

The `atrMultiplier` then determines how far your stop-loss will be placed away from the entry price, based on the current ATR value. A higher multiplier results in a wider stop.


## Interface ISizingParamsKelly

The `ISizingParamsKelly` interface defines the parameters needed when setting up how much capital your trading strategy uses for each trade, specifically using the Kelly Criterion. It requires a logger to help with debugging and understanding what's happening behind the scenes as your backtest runs. This logger allows you to see details and potentially diagnose issues with your sizing strategy.

## Interface ISizingParamsFixedPercentage

This interface defines the settings for determining how much of your capital to use for each trade when using a fixed percentage sizing strategy. It requires a logger to help with debugging and understanding what's happening behind the scenes. The logger allows you to see information about the sizing calculations and any potential issues.

## Interface ISizingParamsATR

This interface defines the parameters needed for determining trade sizes based on the Average True Range (ATR) indicator. 

It focuses on providing logging capabilities for debugging purposes. Specifically, it requires a `logger` service to output debugging information during the sizing process. This logger helps in understanding how the sizing calculations are being performed and allows for troubleshooting if necessary.

## Interface ISizingCallbacks

The `ISizingCallbacks` interface provides a way to hook into the sizing process within the backtest-kit framework. You can use it to observe and potentially influence how position sizes are determined. 

Specifically, the `onCalculate` function is triggered immediately after the framework calculates the size of a trade. This is a good spot to record details about the sizing process or to make sure the calculated size falls within acceptable limits. The function receives the calculated quantity and parameters used in the sizing calculation.

## Interface ISizingCalculateParamsKelly

When calculating your trade size using the Kelly Criterion, you'll need to define some key parameters. This structure holds the information needed for that calculation. 

Specifically, you'll specify the method used – in this case, it's the Kelly Criterion. You also need to provide your win rate, expressed as a decimal between 0 and 1, and the average ratio of your wins to your losses. These values help determine a fraction of your capital to risk on each trade.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the settings you'll use when your trading strategy calculates position sizes based on a fixed percentage of your available capital. It's really straightforward: you'll specify that the sizing method is "fixed-percentage" and also provide a stop-loss price. This stop-loss price is crucial for risk management within your backtesting framework. Think of it as telling the system how much you're willing to lose on each trade.

## Interface ISizingCalculateParamsBase

This interface defines the essential information needed for calculating the size of a trade. It includes the trading symbol, like "BTCUSDT", so the system knows what asset is being traded. You’ll also find the current account balance – the total funds available – and the intended entry price for the trade. These three pieces of information are fundamental to determining how much of an asset to buy or sell.

## Interface ISizingCalculateParamsATR

This interface defines the settings you'll use when determining how much of your capital to allocate to a trade using an Average True Range (ATR) approach.  Essentially, it tells the backtest framework that you want to use ATR to help figure out your position size.

It includes two key pieces of information:

*   `method`:  This *must* be set to "atr-based" to indicate you're using the ATR sizing method.
*   `atr`: This is the actual ATR value you’ve calculated – it’s the number that will be used in the sizing calculation itself.

## Interface ISizing

The `ISizing` interface is all about figuring out how much of an asset to trade. It's a core part of how the backtest-kit executes trading strategies, handling the nitty-gritty of determining position sizes.

Specifically, the `calculate` method is the key—it takes a set of parameters describing the trading environment and risk tolerance, and then returns a number representing the calculated position size. This function is asynchronous, meaning it might involve some processing time.

## Interface ISignalRow

This interface, `ISignalRow`, represents a complete trading signal after it's been processed and validated within the backtest-kit framework. Each signal gets a unique ID for tracking purposes. It holds a wealth of information, including the cost of the trade, the price at which the position was opened, and the expected duration. The signal also includes details like the exchange and strategy used, the timeframe it applies to, and timestamps marking key moments like creation and activation.

Beyond the basics, it tracks partial closes for accurate profit and loss calculations, allowing for the assessment of complex, staged exits.  It also manages trailing stop-loss and take-profit prices, which dynamically adjust based on market movement.  The `_entry` property records any dollar-cost averaging activity, and `_peak` and `_fall` track the highest and lowest prices seen during the position’s lifetime for analysis. Finally, a `timestamp` field marks the signal's origin within the backtesting or live trading context.





## Interface ISignalIntervalDto

This data structure, `ISignalIntervalDto`, is designed to help manage signals, especially when you need to retrieve them in batches or at specific intervals. Think of it as a way to group signals together, preventing the system from requesting the next signal until a certain time has passed. Each signal within this structure is identified by a unique ID (a UUID) to ensure clarity and tracking.

## Interface ISignalDto

This interface defines the structure of a signal, representing a trading instruction. When you request a signal, you'll receive an object conforming to this definition.  The signal includes details like the ticker symbol, whether you should buy ("long") or sell ("short"), and a short explanation of why the signal was generated. You’ll also find price targets for taking profit and setting a stop-loss to manage risk, along with an estimated duration for the trade. A unique ID is automatically assigned to each signal. The cost of entering the position is also specified.

## Interface ISessionInstance

This interface outlines how different session instances should behave, providing a consistent way to manage temporary data during backtesting. Think of it as a place to store information that's specific to a particular trading strategy, symbol, exchange, and timeframe – maybe calculations from machine learning models, intermediate results from indicators, or values that need to be tracked across multiple time periods.

The `waitForInit` method lets you signal when the session is ready to be used. `setData` allows you to write new data to the session, associated with a specific timestamp. To retrieve this data, `getData` allows access, but it protects against looking into the future. Finally, `dispose` is used to clean up any resources the session is using when it's no longer needed.

## Interface IScheduledSignalRow

This interface defines a signal that’s designed to be triggered at a specific price point in the future – essentially a delayed order. It builds upon the basic signal representation, adding the crucial element of waiting for a price to be reached before execution. Think of it as a signal that’s currently "on hold," patiently waiting for the market to move to the desired price.  Once that target price, `priceOpen`, is hit, the pending signal transforms into a standard, active signal. Initially, the time the signal was scheduled is recorded as its pending time, which gets updated with the actual wait time when the signal activates. The `priceOpen` property holds the target price at which the signal will be activated.

## Interface IScheduledSignalCancelRow

This interface describes a scheduled trading signal that may have been canceled by the user. It builds upon a base scheduled signal, adding information specifically about cancellations. If a user cancels a signal, a `cancelId` is assigned to identify the cancellation, and a `cancelNote` can be provided to explain why the signal was canceled. This helps track and manage user-initiated changes to scheduled signals.

## Interface IRunContext

The `IRunContext` acts as a central hub, holding all the information a function needs when it's being executed within the backtest-kit framework. Think of it as a complete package containing details about where the data is coming from—specifically, the exchange, strategy, and frame—and also about the current conditions of the backtest—the symbol being analyzed, the timestamp, and whether it’s a backtest or not. This single object simplifies things because it gets passed to a function, which then separates its contents and distributes them to specialized services for handling.

## Interface IRiskValidationPayload

This data structure holds the information needed for risk validation checks. It builds upon a base set of arguments and includes details about the current trading signal, such as its price, and provides insights into your portfolio’s activity. You’ll find here the signal that’s being evaluated, along with the total number of open positions and a detailed list of those active positions. This helps you assess the potential risks associated with a given trade.

## Interface IRiskValidationFn

This function type defines how you check if a trading decision is safe to make. It’s essentially a gatekeeper. If everything looks good and the trade is likely to be successful, the function should do nothing or return null. However, if there's a problem – maybe the risk exceeds a certain threshold – it needs to signal that by either returning a detailed rejection reason (an `IRiskRejectionResult` object) or throwing an error. The framework will catch any errors and convert them into a rejection result so you can understand what went wrong.

## Interface IRiskValidation

This defines how you can set up checks to ensure your risk parameters are valid before trading. Think of it as a way to define rules – a validation function – that gets run against your risk settings. You can also add a note to explain what that rule does, which is really helpful for understanding why the check is in place. This helps make your trading setup more reliable and easier to understand.

## Interface IRiskSignalRow

This interface, IRiskSignalRow, helps manage risk by adding important price details to existing signal information. It builds upon the standard signal data to include the entry price when the position was opened. You'll also find the original stop-loss and take-profit prices here, reflecting the levels set when the signal was initially generated. This allows for accurate risk validation and tracking of initial trade parameters.

## Interface IRiskSchema

The IRiskSchema lets you define and register custom risk controls for your portfolio. Think of it as setting up guardrails to manage risk at a high level. Each risk control is given a unique identifier, and you can add notes for yourself to explain its purpose.

You can also provide callbacks that trigger when a risk control is rejected or allowed, allowing for specific actions to be taken in those situations.

The heart of the risk control is the `validations` array – this is where you list the actual checks and rules that will be applied. These validations can be defined as functions or pre-built objects, offering flexibility in how you implement your risk management logic.

## Interface IRiskRejectionResult

This interface describes the result when a risk validation check fails. It provides details to help you understand why the validation didn't pass. Each rejection has a unique ID so you can track it, and a clear note explaining the reason for the rejection in plain language. This allows for easier debugging and correction of issues that cause validation failures.


## Interface IRiskParams

This interface defines the settings you pass to the ClientRisk component to manage risk during trading. You'll need to specify the exchange you're working with, like "binance," and provide a logger to help debug any issues. A crucial element is the `TimeMetaService`, which ensures accurate timekeeping during backtesting to avoid looking into the future and skewing results. You can also set a flag to indicate whether you're in backtest mode or live trading. Finally, there's a callback function you can define, `onRejected`, which gets triggered whenever a trading signal is blocked due to risk limits. This is your chance to react to the rejection, perhaps emitting a custom event or logging extra details.

## Interface IRiskCheckOptions

The `IRiskCheckOptions` interface offers a way to manage how risk checks are handled, particularly when multiple operations are happening at the same time. It’s mainly about preventing problems when different parts of your trading system try to modify positions simultaneously.

The `reserve` property is key here; when set to `true`, it ensures that changes to your positions are tracked carefully.  Essentially, it provides a snapshot of the position size before other actions can happen, which helps avoid conflicts and ensures that all parts of your system see a consistent view of the trading activity. This helps maintain the integrity of your trading calculations and prevent unexpected results from race conditions.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, holds all the information needed to perform a risk check – essentially, to decide whether it's safe to execute a new trade. Think of it as a set of validation rules run *before* a trading signal is actually placed. It bundles details like the trading pair's symbol, the signal itself, the strategy responsible for the signal, and information about the exchange, risk profile, timeframe, current price, and timestamp. All these pieces of data allow the risk check to determine if conditions are right for a new position. It’s purely informational, passing data from the overall strategy context to the risk check function.

## Interface IRiskCallbacks

This interface defines optional callbacks that you can use to get notified about the outcomes of risk checks within your trading system. Specifically, `onRejected` is triggered when a trading signal is blocked because it violates your risk limits, letting you know a trade won't proceed. Conversely, `onAllowed` is called whenever a signal successfully clears all risk checks, indicating that a trade is approved. These callbacks allow you to build custom logic around your risk management process, such as logging events or triggering alerts.

## Interface IRiskActivePosition

This interface describes a single, active trading position that's being monitored for risk management across different strategies. It provides all the key details about the position, including which strategy is using it, which exchange it's on, and the specific trading pair involved. You'll find information on the position's direction (long or short), the entry price, and protective orders like stop-loss and take-profit levels. 

Finally, it includes timestamps and time estimates to help track the position’s lifespan and potential duration. This data allows for a comprehensive view of open positions and helps assess overall risk exposure.


## Interface IRisk

The `IRisk` interface is your framework for managing risk when trading. It helps you ensure that your trading signals don't violate any risk limits and keeps track of your open positions.

The `checkSignal` function lets you verify if a signal is okay to execute based on your defined risk parameters.  `checkSignalAndReserve` is a more robust version; it not only checks the signal but also immediately marks space for the potential position, ensuring that concurrent strategies don't accidentally exceed limits if multiple signals pass the initial check at the same time.  Think of it as temporarily holding a spot to avoid double-booking your risk exposure.

The `addSignal` function is used to officially register a new, opened position.  Conversely, `removeSignal` cleans up when a position is closed, allowing the framework to accurately reflect available risk capacity. It’s crucial to always pair a successful `checkSignalAndReserve` or `checkSignal` with either an `addSignal` or a `removeSignal` to prevent stale data and maintain the integrity of the risk management system.

## Interface IReportTarget

This interface lets you pick and choose exactly which data points you want to see in your reports when running backtests. Think of it as a way to fine-tune your reporting to focus on the most important aspects of your trading strategy. You can enable logging for things like strategy commits, risk rejections, breakeven points, partial order fills, performance metrics, scheduled signals, and even milestones like hitting your highest profit or experiencing a maximum drawdown. Essentially, you control which events generate reports, giving you greater control over the amount and type of information collected during a backtest. By enabling or disabling these options, you can tailor your reports to precisely answer the questions you're investigating about your strategy's performance.

## Interface IReportDumpOptions

This section describes options used when exporting report data, helping to organize and filter the information you collect. Each option acts like a tag, allowing you to easily identify and search for specific data points. For example, you can specify the `symbol` like "BTCUSDT" to only include Bitcoin trades, or the `strategyName` to focus on a particular trading strategy. Other options include the `exchangeName`, `frameName` (like a 1-hour timeframe), `signalId`, and `walkerName`—all contributing to precise data filtering and management during backtesting.

## Interface IRecentUtils

This interface defines how different systems can keep track of the most recent trading signals. It's all about making sure your backtesting and live trading are synchronized and accurate.

The `handleActivePing` method lets you record a new signal whenever a ping event occurs, ensuring the system always knows the latest information.

`getLatestSignal` fetches that most recent signal, but with a crucial safety check: it avoids showing signals that happened *after* the point in time you're analyzing, which prevents misleading results in backtests.

Finally, `getMinutesSinceLatestSignalCreated` helps you understand how fresh a signal is by calculating the time passed since it was generated – useful for evaluating the signal's relevance.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, provides a way to share key information about a trading signal with users, particularly regarding its original stop-loss and take-profit levels. It builds upon the standard `ISignalRow` and specifically includes `originalPriceStopLoss` and `originalPriceTakeProfit` to show users what the initial stop-loss and take-profit prices were when the signal was created. These original prices stay fixed, even if the stop-loss or take-profit is adjusted using trailing mechanisms.

The data includes details about how the position was managed, such as `cost` for the initial entry, `partialExecuted` to track partial closes as a percentage, and `totalEntries` to understand how many times the position was averaged.  `totalPartials` tracks the number of partial closes executed. 

You'll also find key performance indicators such as `pnl` (unrealized profit and loss), `peakProfit`, and `maxDrawdown` to assess the position's performance. The `originalPriceOpen` reflects the initial entry price. Essentially, it's a comprehensive snapshot of a signal's data designed for transparency and reporting.

## Interface IPublicCandleData

This interface defines the structure of candle data used within the backtest-kit framework. Each candle represents a specific time interval and contains key price points and volume information. 

It includes the timestamp indicating when the candle began, the opening price, the highest and lowest prices reached during that time, the closing price, and the volume of trades that occurred. Think of it as a snapshot of market activity for a given period.


## Interface IPositionSizeKellyParams

This interface defines the settings you'll use to calculate position sizes based on the Kelly Criterion. It’s about determining how much of your capital to allocate to a trade.

You'll specify two key values: the `winRate`, which represents the probability of a winning trade (expressed as a number between 0 and 1), and the `winLossRatio`, which tells you the average profit you make on a winning trade compared to the average loss on a losing trade. These values help the system determine an optimal bet size.


## Interface IPositionSizeFixedPercentageParams

This interface defines the parameters needed for a trading strategy that uses a fixed percentage of your capital for each trade, and includes a stop-loss price. Specifically, `priceStopLoss` tells the backtest how much to reduce the trade size if the price moves against you. It’s crucial for managing risk and limiting losses when using this sizing method.

## Interface IPositionSizeATRParams

This interface defines the settings needed to determine how much of your capital to use for each trade when using an Average True Range (ATR) based position sizing strategy.

Specifically, it contains a single property:

*   **atr**: This represents the current Average True Range value. It's used to calculate the appropriate position size based on market volatility.

## Interface IPositionOverlapLadder

This configuration defines how to detect overlapping positions when using a dollar-cost averaging (DCA) strategy. It sets boundaries for a "tolerance zone" around each DCA level. The `upperPercent` determines how much higher than a DCA price, expressed as a percentage, will be considered an overlap. Similarly, `lowerPercent` defines how much lower than a DCA price, also as a percentage, that will trigger an overlap warning. These percentages help you fine-tune the sensitivity of overlap detection and identify potentially problematic situations in your trading.

## Interface IPersistStorageInstance

This interface provides a way to manage how trading signals are saved and loaded, specifically for either backtesting or live trading. Think of it as a custom storage system that replaces the default file-based approach.

It allows you to initialize the storage, read all previously saved signals – which are organized by a unique ID for each signal – and write new signals to be saved. 

Essentially, it’s designed for those who want to adapt how trading signals are persistently stored, perhaps to use a database instead of a simple file. The interface ensures consistency between backtesting and live trading environments.

## Interface IPersistStateInstance

This interface lets you manage how your trading strategy's state is saved and loaded, specifically for a unique combination of a signal and a bucket. Think of it as a way to customize where and how your strategy remembers things like open orders or calculated indicators.

It’s designed to be used when you want your strategy to be resilient to crashes – if the system restarts, it can recover the state from where you've stored it.

You can implement this interface to swap out the default file-based storage with something else, like a database or an in-memory cache.

The `waitForInit` method sets up the storage when things start.  `readStateData` retrieves the saved information. `writeStateData` saves the current state to the chosen storage, noting the timestamp.  Finally, `dispose` cleans up any resources used by the storage.

## Interface IPersistSignalInstance

This interface lets you customize how trading signals are saved and loaded for a particular combination of symbol, strategy, and exchange. Think of it as a way to control the persistence of signal data for a specific trading setup. 

If you need more than just file-based storage, you can build your own adapter that implements this interface. 

The `waitForInit` method allows you to prepare the storage when things are starting up.
The `readSignalData` method retrieves the saved signal data.
Finally, `writeSignalData` is used to store new signal data, and you can even clear the data by sending `null`.


## Interface IPersistSessionInstance

This interface helps manage and save session data specifically for a particular trading setup—think of it as keeping track of information related to a strategy, exchange, and frame. It's designed to ensure your trading sessions don't lose progress even if things go wrong.

If you want to customize how this data is stored (instead of using the default file-based method), you can create your own adapter that follows this interface.

The `waitForInit` method prepares the storage for your session. `readSessionData` retrieves any previously saved data, while `writeSessionData` saves the current state.  Finally, `dispose` cleans up any resources used, allowing for a clean exit.

## Interface IPersistScheduleInstance

This interface lets you customize how backtest-kit saves and loads signals for a specific trading setup—think of it as tailoring the storage for a particular combination of asset, strategy, and exchange. If you want to move away from the default file storage, you can create your own adapter that implements this interface. The `waitForInit` method is used to set up the storage when it starts, `readScheduleData` retrieves the saved signal data, and `writeScheduleData` saves new or updated signal information – or clears it if needed. This provides a way to persist signals for each unique combination of symbol, strategy name, and exchange name.

## Interface IPersistRiskInstance

This interface provides a way to manage how your trading strategy's risk positions are saved and loaded. Think of it as a bridge between your strategy and a storage system, whether that’s a file, a database, or something else.

It allows you to customize where and how your risk data – like maximum position sizes or risk limits – are kept track of.  This is particularly useful if the default file storage isn't what you need.

The `waitForInit` method is called at the beginning to set up the storage for your specific risk context. `readPositionData` retrieves the saved risk positions at a given time, while `writePositionData` saves the current risk positions. By implementing this interface, you effectively control the persistence of your risk management information.

## Interface IPersistRecentInstance

This interface defines how to manage and store the most recent trading signal for a specific setup. Think of it as a way to remember the last signal generated for a particular symbol, strategy, exchange, and timeframe, keeping backtesting separate from live trading.

If you need to customize how this information is saved – maybe you want to store it in a database instead of a file – you can create an adapter that implements this interface.

The `waitForInit` method prepares the storage space for the signal data. The `readRecentData` method retrieves the previously saved signal. Finally, `writeRecentData` saves the current signal, along with the timestamp.

## Interface IPersistPartialInstance

This interface helps you manage and save partial profit and loss information for a specific trading setup. Think of it as a way to remember where things stood during a trade, even if the trading session ends. 

It's designed to keep data separate for each unique combination of a financial instrument (symbol), a trading strategy, and an exchange.

If you want to customize how this data is stored - perhaps to use a database instead of a file - you can build your own adapter that implements this interface.

The `waitForInit` method sets up the storage space.

`readPartialData` lets you retrieve previously saved partial data for a specific trade signal.

`writePartialData` allows you to record the partial data for a particular trade signal.


## Interface IPersistNotificationInstance

This interface lets you customize how your trading strategies store notifications – those important messages about events happening during a backtest or live trade. Think of it as a way to replace the default file storage with something else, like a database or an in-memory solution. 

The system manages one of these storage instances specifically for backtesting and another for live trading.

When you implement this interface, you'll provide methods to initialize the storage, retrieve all stored notifications at once, and save new notifications. Notifications are uniquely identified, so retrieving and saving are handled by their IDs. This allows you to build systems that remember what happened during a test run or keep track of important events in real-time.

## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for specific contexts within the backtest-kit framework, particularly for use with Large Language Models (LLMs). Think of it as a blueprint for managing memory entries related to a particular signal and bucket. 

It allows for the persistence of memory entries, meaning data is saved and can be loaded later. A special feature is the ability to "soft delete" entries – marking them as removed but keeping the file on disk, preventing them from appearing in standard searches while still preserving the data. 

If you're building your own custom way to store LLM memory, you can implement this interface to tailor how memory data is handled instead of using the default file-based approach.

The methods available include initializing storage, reading data by ID, checking for existence, writing new entries, soft-deleting entries, listing all active entries, and releasing resources when no longer needed.

## Interface IPersistMeasureInstance

This interface lets you customize how backtest-kit stores and retrieves data for measures, which are essentially sets of results from your backtesting runs. 

Think of it as a way to manage a catalog of performance results, potentially saving them to a file or another storage system.

The system handles a clever "soft delete" feature, where old results aren't completely erased but are marked as removed, keeping them around for potential recovery or analysis while being excluded from normal searches.

You can initialize the storage, read existing data, write new data with timestamps, and list the available keys. 

If you need a way other than the default file-based storage for these measure results, you can build your own adapter that implements this interface.

## Interface IPersistLogInstance

This interface defines how to manage a global, persistent log of trading activity. Think of it as a way to store records of what happened during backtests, but without tying that storage to a specific backtest run.

It’s designed to be customized—if you want to store logs somewhere other than the default file system (like a database), you can create your own adapter that follows this interface.

The `waitForInit` method ensures the logging system is ready before you start recording data. `readLogData` retrieves all the existing log entries. Finally, `writeLogData` handles adding new entries, making sure to avoid duplicates by checking existing IDs. This helps maintain a clean, append-only log.

## Interface IPersistIntervalInstance

This interface defines how a backtest-kit component can persist information about which time intervals have already been processed for a specific data bucket. Think of it as a way to remember "we've already done this."

The presence of a record indicates that a particular interval has already fired. If you need to re-run an interval (perhaps because data was corrected), you can "soft-delete" the record to make it disappear, allowing the system to run it again.

This interface lets you customize how this "memory" is stored, moving beyond the default file-based storage.

Here’s what you can do if you implement this interface:

*   **waitForInit:** Set up the storage specifically for a bucket.
*   **readIntervalData:** Retrieve the persistence information for a specific interval.
*   **writeIntervalData:** Record that a specific interval has been processed.
*   **removeIntervalData:** Effectively "forget" that an interval has been processed, allowing it to run again.
*   **listIntervalData:** Get a list of all the intervals that have been processed and are still considered valid.

## Interface IPersistCandleInstance

This interface defines how a backtest kit stores and retrieves candle data for a specific trading symbol, timeframe, and exchange. It’s essentially a way to persist your cached candles so you don't have to re-download them every time you run a backtest.

The `waitForInit` method allows you to prepare the storage for this specific set of candles before any data is loaded.

`readCandlesData` is the key method – it's how you fetch a batch of candles from the stored cache. Critically, if even one candle within the requested range is missing, it returns `null`, signaling to your backtesting system that it needs to go get that data from the original source (like a data provider).

`writeCandlesData` is for saving candles to the cache. Implementations might choose to ignore partially complete or redundant candles to ensure data integrity. This helps ensure you don't accidentally corrupt or overwrite valuable historical data.

## Interface IPersistBreakevenInstance

This interface lets you manage how breakeven data, which helps track when a trade becomes profitable, is stored. It's designed to work with a specific trading setup – a combination of a financial instrument (symbol), a trading strategy, and an exchange. 

Essentially, each trading signal has its own set of breakeven information, and this interface provides the tools to load and save that information. 

You can think of it as a way to customize where and how this data is kept, instead of relying on the default storage method. The `waitForInit` method gets things ready, `readBreakevenData` retrieves existing data, and `writeBreakevenData` saves new or updated data.


## Interface IPersistBase

This interface outlines the core functions needed for any custom system that stores and retrieves data, like trading strategies or historical data. It's designed to be simple, providing essential operations for creating, reading, updating, and listing data entries. 

The `waitForInit` method helps set up the storage area and ensures it’s done only once.  `readValue` fetches a specific data item, while `hasValue` checks if an item exists at all.  `writeValue` safely stores a new or updated data item. Finally, `keys` provides a way to get a list of all the data identifiers, sorted alphabetically, which is useful for checking data integrity and processing everything in sequence. Think of it as the basic building blocks for connecting to different types of data storage.

## Interface IPartialProfitCommitRow

This represents a single instruction to take a partial profit on a trade. 
It's a record of an action to close a portion of a position.

Here's what each part means:

*   **action:**  Always "partial-profit" – it confirms this is a partial profit instruction.
*   **percentToClose:** This tells you what percentage of the position to close out.  For example, 25 would mean close 25% of the position.
*   **currentPrice:** This records the price at which the partial profit was actually executed.

## Interface IPartialLossCommitRow

This represents a single instruction to partially close a position during a backtest. 

Think of it as one step in a plan to reduce your exposure to a trade. 

It contains details like the percentage of the position to be closed (`percentToClose`), the price at which the partial closing happened (`currentPrice`), and confirms that this is indeed a partial loss action. It's a record of one specific step taken to decrease your holdings.

## Interface IPartialData

IPartialData is a way to save and load bits and pieces of your trading data, especially the levels where your trades hit profits or losses. 

Think of it as a simplified snapshot of your trading progress.

It converts sets of profit and loss levels into arrays so they can be easily saved and later reconstructed.

This data is stored and retrieved by the PersistPartialAdapter, and ultimately helps build the full picture of your trading state. It contains two key pieces of information: the profit levels reached and the loss levels reached.

## Interface IPartial

The `IPartial` interface is how the system keeps track of how profitable or loss-making a trading signal is. It's used by both the client and the connection service to monitor signals. 

When a signal is making money, the `profit` method calculates if it’s hit any of the usual milestones like 10%, 20%, or 30% profit, and notifies the system. Similarly, the `loss` method does the same when a signal is losing money.  It’s designed to only send out notifications for *new* profit/loss levels, avoiding duplicates.

Finally, the `clear` method is used when a signal finishes – whether it’s hit a take profit or stop loss, or simply timed out. This method cleans up the record of the signal’s progress and updates the system.

## Interface IParseArgsResult

The `IParseArgsResult` object holds the outcome of parsing command-line arguments. It takes your initial input parameters and adds flags indicating the trading mode you've chosen. These flags tell the system whether to run a backtest using historical data, execute paper trading with simulated funds, or engage in live trading with real money. Essentially, it's a container for important settings that determine how the trading framework will operate.


## Interface IParseArgsParams

The `IParseArgsParams` interface describes the information needed to run a trading strategy. It's essentially a template for what your command-line arguments should look like. 

You'll need to specify which trading pair you're interested in, like "BTCUSDT". 

Then you tell the system which strategy you want to use. 

Next, you provide the name of the exchange you're connecting to – whether it's Binance, Bybit, or another supported platform. 

Finally, you'll set the timeframe for the data the strategy uses, such as "1h" for one-hour candles.

## Interface IOrderBookData

The `IOrderBookData` interface represents the data you get from an order book, which is essentially a snapshot of all the buy and sell orders waiting to be executed.

It contains the `symbol` which tells you what trading pair this data applies to – for example, BTCUSDT.

You’ll also find `bids`, a list of buy orders, and `asks`, which is a list of sell orders. Each element within these lists provides details about a specific order, like price and quantity.


## Interface INotificationUtils

This interface defines the core functionality for systems that send notifications from the backtest-kit framework. Think of it as a blueprint for how different notification methods – like email, SMS, or webhook integrations – should behave.

It provides methods for reacting to various events within the backtest, such as when a trade is opened or closed, when partial profit or loss targets are reached, and when strategy configurations change. There are also specific handlers for errors, both general and critical, ensuring problems are communicated appropriately. 

You can retrieve all stored notifications using a `getData` method, and clear them when they are no longer needed with `dispose`. Each adapter that wants to participate in providing notifications must implement these methods.

## Interface INotificationTarget

This interface lets you fine-tune which updates your backtest or live trading session sends to you. Think of it as a way to only receive the information you're actively using, instead of everything all the time.

You can subscribe to notifications about signal events like when a signal is opened, scheduled, closed, or cancelled.

It also allows you to receive alerts when partial profit, partial loss, or breakeven levels are reached – these are opportunities to potentially adjust your positions before a final decision is made.

You'll also get notifications about strategy actions, like when a partial profit or loss target is committed, or when a scheduled order is activated.

Specifically, you can choose to listen for confirmations that orders have been executed, signals that synchronize with live market data, or notifications when risk rules prevent a trade.

There are also informational and error notifications available, covering everything from manual messages to critical failures that might end the session. If you don't specify anything, you’ll receive all notifications by default.

## Interface IMethodContext

The `IMethodContext` object acts like a little guide, helping your backtesting code figure out which specific configurations to use. It holds the names of the exchange, strategy, and frame you're working with. Think of it as a set of labels that tell the system exactly which versions of these components to load for your backtest. When running a live test, the frame name will be empty. This context is automatically passed around within the backtest framework, so you typically don't need to manage it directly.


## Interface IMemoryInstance

This interface outlines how different memory storage systems – whether they're local files, persistent databases, or just test data – should behave within the backtest-kit framework.

The `waitForInit` method lets you ensure the memory is ready before starting any operations.

`writeMemory` is used to add new data points to the memory, along with a description and timestamp.

`searchMemory` allows you to find specific information within the memory, using a search term and a date filter. It ranks the results by relevance.

`listMemory` retrieves all memory entries up to a specific date.

`removeMemory` deletes a single entry from memory, associating the deletion with a timestamp.

`readMemory` fetches a particular entry by its ID and a date, and won’t return anything if the data is too recent.

Finally, `dispose` provides a way to clean up and free any resources the memory system is using.

## Interface IMarkdownTarget

This interface lets you pick and choose which detailed reports you want to generate within the backtest-kit framework. It's all about controlling the level of insight you get into your trading strategy's behavior.

You can turn on reports for things like:

*   How your strategy is generating entry and exit signals.
*   When signals are being blocked due to risk management.
*   Tracking breakeven points.
*   Monitoring partial profit/loss events.
*   Analyzing your portfolio's performance visually with a heatmap.
*   Comparing and optimizing strategies with a walker.
*   Examining performance metrics and identifying bottlenecks.
*   Signals waiting to be triggered by a schedule.
*   Real-time trading events.
*   The complete backtesting results including every trade.
*   The lifecycle of signals being opened and closed.
*   Tracking the highest profit achieved.
*   Monitoring maximum drawdown.

By enabling these different options, you can tailor the reports to focus on the specific areas you want to investigate and understand.

## Interface IMarkdownDumpOptions

This interface defines settings to control how data is exported, particularly to Markdown documents. Think of it as a set of instructions for organizing and labeling your backtest results. You specify the directory where the files should go, the file name itself, and details like the trading pair (like BTCUSDT), the name of the trading strategy, which exchange was used, the timeframe (e.g., "1m" for one-minute candles), and a unique identifier for the signal involved. These properties let you pinpoint exactly which data you are exporting and where it should live.

## Interface ILogger

The `ILogger` interface defines a way for different parts of the backtest-kit system to record what's happening. It allows components to write messages detailing events like when things start up, tools are used, policies are checked, or if there are any problems with saving data. 

You can use it to track the overall flow of actions – from agents running to sessions connecting and data being stored. 

The `ILogger` offers several methods for logging:

*   `log`: For general messages about important events.
*   `debug`: For detailed information used when you're trying to figure out a problem or see exactly what's happening during complex operations.
*   `info`: For reporting successful actions and general status updates.
*   `warn`: To highlight potential issues that might need attention, even if they don't stop the system from working.

## Interface ILogEntry

ILogEntry represents a single entry in the backtest kit's log history. Each log entry has a unique identifier and a level indicating its importance – whether it's a standard log, a debug message, an informational note, or a warning. 

It also includes a timestamp, helping to keep track of when the log was created, and a 'createdAt' field for improved user experience.  You can also find details about the method and execution context associated with the log, like the specific function or state where it originated. Finally, additional arguments can be included to provide more specific information alongside the log message itself.


## Interface ILog

The `ILog` interface helps you keep track of what's happening during your backtests. It lets you access a list of all the log entries that have been recorded, providing a full history of events, errors, and informational messages. This is useful for debugging and understanding the flow of your trading strategy. You can retrieve the complete list of log entries using the `getList` method, which returns a promise containing an array of `ILogEntry` objects.

## Interface IHeatmapRow

This interface describes the performance statistics for a single trading symbol within a portfolio heatmap. It gathers aggregated data across all trading strategies applied to that specific symbol, giving you a consolidated view of its performance.

You'll find key metrics here like total profit or loss, the Sharpe Ratio (a measure of risk-adjusted return), and the maximum drawdown, which indicates the largest loss from a peak.

The data also breaks down the number of winning and losing trades, calculates the win rate, and provides insights into average trade profit and loss.  You can also see the longest winning and losing streaks, along with more advanced ratios like Sortino and Calmar, which help evaluate risk and potential. Finally, it provides insights into typical peak and fall performance across all trades.

## Interface IFrameSchema

This defines a building block for your backtesting strategy – a "frame." Think of a frame as a specific chunk of time you're analyzing, like a daily or weekly period. 

Each frame has a unique name to identify it, and you can add a note for yourself to remember why you set it up this way.

The `interval` property specifies how often data is generated within that frame (e.g., every minute, every hour, every day). 

You’ll also set the `startDate` and `endDate` to define the boundaries of the time period this frame represents.

Finally, you can provide callbacks to execute code at different points in the frame's lifecycle, allowing for more customized behavior.

## Interface IFrameParams

The `IFramesParams` object is how you set up the basic environment for your backtesting client. It's like giving your backtest a set of initial instructions.

It includes a `logger`, which is really useful for tracking what's happening behind the scenes – it lets you see what the backtest is doing and helps in debugging any issues. Think of it as a helpful assistant who provides detailed logs.

## Interface IFrameCallbacks

The `IFrameCallbacks` interface provides a way to react to events as your backtest timeframe is being prepared. Specifically, the `onTimeframe` function allows you to be notified when the array of dates and times for your backtest is created. This is a handy place to log what timeframes are being used or to quickly check if the generated timeframe data looks correct before the backtest begins. You can use this to ensure your trading system is operating within the expected date ranges and intervals.


## Interface IFrame

The `IFrame` interface is a core component that handles how your backtest data is organized by time. Think of it as a way to define the timeline for your trading strategy.

It has one key method, `getTimeframe`, which is responsible for creating a list of specific dates and times that your backtest will use. These timestamps are evenly spaced, based on the interval you've set. This ensures consistent data points for your trading logic to analyze. Essentially, it sets the stage for the chronological order of events within your backtest.


## Interface IExecutionContext

The `IExecutionContext` interface defines the environment in which your trading strategies and exchange operations run. Think of it as a container holding essential information like the trading pair you're working with (the `symbol`), the precise time of the current operation (`when`), and whether you're in a test backtest or a live trading scenario (`backtest`). This context is automatically passed around by the framework to give your strategies the information they need to function correctly, without you having to explicitly pass it around yourself. It helps keep track of what’s happening and when.


## Interface IExchangeSchema

This schema defines how backtest-kit connects to and retrieves data from a specific exchange. It’s essentially a blueprint that tells the framework where to find candles, order books, and trades, and how to properly format numerical data like quantity and price. 

Each exchange needs its own schema with a unique identifier. You can also add a note for your own reference. 

The `getCandles` function is vital—it’s responsible for pulling historical price data.  You'll need to implement functions to format quantities and prices to match the exchange's rules, otherwise the framework will use a default Bitcoin precision.

Optionally, you can provide functions to retrieve order books and aggregated trades. If these aren't provided, attempting to use them will trigger an error.

Finally, the schema allows for callbacks to handle lifecycle events related to candle data, giving you opportunities to react to incoming data.

## Interface IExchangeParams

This interface defines the configuration needed to connect to a cryptocurrency exchange within the backtest-kit framework. It essentially tells the system how to interact with a specific exchange to retrieve data and potentially execute trades. 

You'll need to provide functionality for fetching historical candle data, formatting trade quantities and prices to match the exchange's rules, and retrieving order book and trade information. 

The `logger` property allows you to control debugging output. The `execution` property provides context about the current run, such as the trading symbol and whether it's a backtest. Each method – fetching candles, formatting quantities/prices, retrieving order books, and aggregated trades – is crucial for the framework to operate and requires implementation.

## Interface IExchangeCallbacks

I am ready to proceed. Please provide the content you want me to refine.

## Interface IExchange

The `IExchange` interface defines how backtest-kit interacts with an exchange to get data and format orders. It offers ways to retrieve historical and future candle data, which are essential for simulating trades and analyzing strategies.

You can request candles from the past (`getCandles`) or future (`getNextCandles`) to build your backtesting environment. The framework also provides tools to format order quantities and prices to match the exchange's requirements.

It allows calculating the VWAP (Volume Weighted Average Price) based on recent trading activity and getting the last closing price for a specific time interval.  You can also access the order book and aggregated trades for a trading pair.

To fetch candles, you have several options for specifying the date range and number of candles – the framework handles the calculations and validation to ensure accurate and unbiased data.  Essentially, it aims to provide everything needed to simulate a realistic trading experience without looking into the future.

## Interface IEntity

This interface serves as the foundation for all persistent data objects within the backtest-kit framework. Think of it as a common starting point, guaranteeing that any object you want to store or retrieve has a consistent structure. It’s a basic building block that ensures a standardized way to manage data throughout your backtesting process. It doesn't define any specific properties itself, but any class implementing it will need to adhere to its principles.

## Interface IDumpInstance

This interface defines how components can save data related to a backtest. Think of it as a way to record key events and information during a simulation.

The `dumpAgentAnswer` method lets you save the entire conversation history for a specific agent's interaction.  You can use `dumpRecord` to store simple key-value information. 

`dumpTable` is for presenting data in a structured, table-like format where column names are automatically determined. If you need to preserve text, use `dumpText`, and if something goes wrong, `dumpError` allows you to capture the error details.  Finally, `dumpJson` is designed for storing more complex, nested data in a JSON format.

When the backtest is finished or the data is no longer needed, the `dispose` method helps clean up and release any resources that the component was holding. The entire process is scoped to a specific signal and bucket name when the component is created.

## Interface IDumpContext

The `IDumpContext` helps organize and identify data being saved, particularly during backtesting or live trading. Think of it as a way to tag each piece of information so you can easily find it later. 

Each context includes a `signalId` which links the data to a specific trade, and a `bucketName` which groups data by the strategy or agent using it. A unique `dumpId` distinguishes each individual entry. 

You’ll also find a helpful `description` which allows you to label the data in a way that makes sense to humans. Finally, a `backtest` flag indicates whether the data originates from a backtest run or live trading.

## Interface ICommitRowBase

ICommitRowBase provides a foundation for handling events that need to be committed, but not immediately. Think of it as a way to line up actions to be performed later, ensuring they happen when the system is ready. It includes basic information like the trading symbol involved and a flag indicating whether the process is running as a backtest. This allows for a more controlled and efficient way to manage actions within the trading framework.

## Interface ICheckCandlesParams

This interface defines the information needed to check if candle data exists in storage. It's used to verify if data is available without having to look through all the files.

You’ll need to specify which trading pair you're interested in (like "BTCUSDT"), the exchange where that pair is traded, the timeframe of the candles (like "1m" for one-minute candles), and the date range you want to check. Essentially, it's a way to ask, "Do I have data for this specific trading pair, timeframe, and date range?"

## Interface ICandleData

This interface represents a single candlestick, a common way to organize price data over time. Each candlestick contains information about the opening price, the highest and lowest prices reached during that period, the closing price, and the volume of trades that occurred. The timestamp tells you precisely when this candle's data is relevant, marking the start of that time interval. This structure is crucial for calculating things like volume-weighted average price (VWAP) and for simulating trading strategies in a backtesting environment.

## Interface ICacheCandlesParams

This interface defines the settings you can use when managing how cached historical data is handled. It allows you to customize the process of validating and pre-loading data, ensuring you have the information needed for backtesting. You can provide functions to be executed at specific points in this data preparation process. 

Specifically, you can tell the system what to do just before it begins validating existing cached data, and again before the warm-up phase starts (which happens when validation finds missing data). This lets you log events, display progress, or perform other actions to monitor the data preparation steps.

## Interface IBroker

This interface defines how backtest-kit connects to a live broker or exchange. Think of it as a set of rules your code must follow to interact with a real trading environment.

It's important to know that these calls happen *before* any changes are made to the internal simulation state. If something goes wrong during a call, the system will roll back, ensuring a clean and consistent record.

During backtesting, these calls are ignored, so your broker adapter won’t be burdened with unnecessary processing.

Here's a breakdown of the key actions the framework will ask your broker adapter to perform:

*   **waitForInit:**  A one-time setup step for initial connection and authentication.
*   **onSignalCloseCommit:**  Called when a trade is closed, whether it's a profit, loss, or a manual intervention.
*   **onSignalOpenCommit:** Called to confirm a new trade has begun.
*   **onPartialProfitCommit:** Used to execute a partial profit-taking action.
*   **onPartialLossCommit:** Used to execute a partial loss-taking action.
*   **onTrailingStopCommit:** Called to update a trailing stop-loss order.
*   **onTrailingTakeCommit:** Called to update a trailing take-profit order.
*   **onBreakevenCommit:** Called to move a stop-loss to the entry price for a breakeven point.
*   **onAverageBuyCommit:**  Called when a dollar-cost averaging (DCA) order is placed.

## Interface IBreakevenData

This interface, `IBreakevenData`, is designed to hold basic information about whether a breakeven point has been achieved for a particular trading signal. Think of it as a simplified snapshot of a more complex breakeven state, optimized for saving and loading data, like when you want to preserve trading progress. It primarily focuses on a single value: whether the breakeven has been reached.

It's used within the backtest-kit framework to manage breakeven information and is typically stored as a record linking a signal ID to this data. This allows the system to easily track and restore the breakeven status of multiple signals. When the data is loaded, this simple `IBreakevenData` is converted back into the fuller `IBreakevenState` representation.


## Interface IBreakevenCommitRow

This object represents a single action related to managing breakeven points during a backtest. Specifically, it signals that a breakeven calculation needs to be performed. It includes the current price of the asset at the time the breakeven was established. Think of it as a record of a specific event – "recalculate the breakeven point based on this price."

## Interface IBreakeven

The `IBreakeven` interface helps manage a strategy's ability to move its stop-loss to the entry price, essentially achieving a breakeven point. It's used by the `ClientBreakeven` and `BreakevenConnectionService` components.

The core function of this interface is to monitor price movements and determine when a signal has reached a point where its stop-loss can be adjusted to cover initial costs.

The `check` method is responsible for evaluating this condition - ensuring breakeven hasn't already been triggered, that the price has moved favorably to account for transaction fees, and that the stop-loss adjustment is possible. If all conditions are met, it records the breakeven state and triggers a notification.

The `clear` method is used when a signal is closed, removing the breakeven state and ensuring a clean slate for the next trading opportunity. It also handles cleanup tasks related to the connection service.

## Interface IBidData

This interface represents a single bid or ask found within an order book. It contains two key pieces of information: the price at which the bid or ask is offered, and the quantity of assets available at that price. Both price and quantity are stored as strings.

## Interface IAverageBuyCommitRow

This interface describes a single step in a queued average-buy (also known as Dollar-Cost Averaging or DCA) process. It represents a commitment to buy a certain amount of an asset at a specific price. 

Each entry contains information about the transaction, including the price at which the buy occurred, the cost in USD, and the total number of entries that have been made so far within the DCA strategy. This helps track the progress and details of the automated averaging process.

## Interface IAggregatedTradeData

IAggregatedTradeData holds information about a single trade that happened. Think of it as a record of one transaction – it contains the price at which it occurred, how much was traded, and when it took place. Crucially, it also tells you whether the buyer was the one providing liquidity (acting as a market maker) which can be helpful to understand the flow of the trade. Each trade record has a unique ID for tracking purposes.

## Interface IActivityEntry

An `IActivityEntry` represents a single, ongoing trading process, whether it's a backtest or a live trade. Think of it as a record that the system keeps while a process is running.

This record is created when a trading process begins, like when a backtest starts or a strategy begins executing, and it’s removed when that process finishes or encounters an issue.

It's a key piece in making sure the system handles multiple trading processes smoothly and efficiently, helping to prevent conflicts. The record includes essential details, like the trading pair symbol, the strategy's name and exchange, and whether it’s a backtest or a live run.

## Interface IActivateScheduledCommitRow

This interface represents a queued request to activate a scheduled commit. Think of it as a message saying "Hey, let's run this scheduled commit!"

It includes identifying information: the `signalId` tells you which signal this commit relates to, and the `activateId` lets users trigger specific activations if needed. If you're automating activations, you'll use this to tell the system which scheduled commit to run.


## Interface IActionStrategy

The `IActionStrategy` interface gives your trading actions a way to peek at the current signal state. It’s like giving your actions a quick look at what the strategy is planning – whether there's an open position or a signal waiting to happen.

Think of it as a safety check; it allows actions like setting breakeven levels, taking profits, or managing losses to only proceed if there’s actually something happening on the signal side. 

It provides two key methods:

`hasPendingSignal` tells you if a signal is currently active for a specific trading symbol.

`hasScheduledSignal` lets you know if a signal is waiting to be triggered in the future. 

Essentially, it makes sure your actions are only taking place when they're actually relevant.

## Interface IActionSchema

The `IActionSchema` lets you extend your trading strategies with custom functionality by defining actions. Think of actions as hooks that let you tap into what's happening within a strategy as it's running. 

They're useful for a variety of things – connecting to state management libraries like Redux, logging events, sending notifications, collecting data, or triggering custom actions based on strategy events.

Each action is created uniquely for each strategy run, giving it a fresh start with all the relevant event information. You can attach multiple actions to a single strategy, allowing for a layered approach to extending its behavior.

The `actionName` gives your action a unique ID when you register it. 
The `note` field is just for adding helpful notes to your documentation. 
The `handler` is the core of your action – it's the code that will actually run. 
Finally, `callbacks` let you specify functions that are called at specific points in the action's lifecycle.

## Interface IActionParams

The `IActionParams` object holds all the information an action needs to function correctly, building upon a base schema. Think of it as the complete package of data a trading action receives.

It includes a logger for keeping track of what's happening, ensuring you can debug and monitor your actions. You’ll also find details about the strategy and timeframe the action belongs to, like the strategy's name and the timeframe (e.g., 1 minute, 1 hour).

Crucially, it tells you if the action is running in backtest mode, and provides access to the current state of the strategy, allowing actions to react to signals and existing positions. The exchange name is also provided for context.

## Interface IActionCallbacks

This interface, `IActionCallbacks`, provides a way to hook into different phases of your trading actions, allowing you to customize how your strategies behave and handle resources. Think of it as a set of optional events you can subscribe to.

You can use `onInit` to set things up when an action starts—like connecting to a database or loading data. Conversely, `onDispose` lets you clean up when an action finishes, closing connections or saving data.

Several `onSignal` callbacks exist to respond to incoming signals. You'll have `onSignalLive` specifically for live trading, `onSignalBacktest` for backtesting, and others for events like breakeven triggers, partial profit/loss levels, and ping monitoring. The `onSignalSync` callback is unique—it lets you actively control whether a position is opened or closed, offering precise control but with the possibility of retries if you reject the action.

These callbacks give you opportunities for resource management, logging, monitoring, and reacting to specific trade events in both live and simulated environments.

## Interface IAction

The `IAction` interface is your central hub for connecting your custom logic to the backtest-kit framework. Think of it as a set of event listeners that get triggered as the trading system operates – whether it's running a backtest or live trading.

You can use this interface to build things like real-time dashboards that display trading signals, log detailed trading activity for review, or even automatically adjust your trading strategy based on changing market conditions.

The `signal` method is a catch-all for general trading signals, while `signalLive` and `signalBacktest` let you react differently depending on the mode.  There are also specific methods to respond to events related to breakeven points, partial profits/losses, scheduled and active signals, risk rejections, and even when the system attempts to open or close a position using limit orders.  Finally, the `dispose` method is crucial for cleaning up and preventing memory leaks when your custom logic is no longer needed.

## Interface HighestProfitStatisticsModel

This model holds information about the events that resulted in the highest profit. It includes a complete list of those events, ordered from most recent to oldest, allowing you to review exactly when and how those profits were achieved. Additionally, it keeps track of the overall number of profitable events recorded. Think of it as a detailed log of your best trading moments, ready for analysis.

## Interface HighestProfitEvent

This data represents the single most profitable moment observed for a trading position. It provides details about when this peak profit occurred, the trading pair involved, and the strategy that generated the trade. You’ll find information about the unique signal that triggered the position, whether it was a long or short trade, and the overall profit and loss (PNL) for the entire position.

The record includes not just the final PNL, but also the highest profit point achieved during the position’s lifetime and the maximum drawdown encountered. Furthermore, it captures the price at which the record profit was reached, alongside the initial entry price, the take profit level, and the stop-loss level. Lastly, the record indicates whether the event happened during a backtesting simulation.

## Interface HighestProfitContract

This interface represents updates whenever a trading strategy reaches a new peak profit level. It provides all the key details surrounding that event, like the trading symbol involved ("BTC/USDT"), the current price, and the exact time it happened. You'll also find information about the specific strategy, exchange, and timeframe that contributed to this profit milestone, alongside the signal that triggered the trade. A crucial flag indicates whether this is a result of a simulated backtest or a real-time live trading scenario, which can be important for different types of reactions to the profit increase.

## Interface HeatmapStatisticsModel

This structure organizes key statistics for your entire portfolio, providing a high-level view of its performance. It breaks down the results for each symbol you're tracking and then aggregates those results into overall portfolio numbers. 

You'll find details like the total number of symbols in your portfolio, the combined profit and loss (PNL), and the Sharpe Ratio, which measures risk-adjusted return. 

Furthermore, it includes data on the total number of trades executed and weighted averages of peak and fall PNL, giving you a sense of the portfolio’s best and worst performing moments. The `symbols` property holds the individual statistics for each asset.

## Interface DoneContract

This interface represents the information you receive when a background process finishes, whether it's a backtest or a live trading session. It tells you which exchange was used, the name of the trading strategy that ran, and if it was a backtest or a live execution.  You'll also get the trading symbol involved, like "BTCUSDT" for Bitcoin against USDT. The "frameName" field is empty when running in live mode, providing context for backtesting scenarios.


## Interface CronHandle

This object acts like a cleanup tool for scheduled tasks. When you set up a recurring task using the system, you'll get this handle back. To stop that task from running, simply dispose of this handle – it automatically removes the task from the schedule. Think of it as a way to easily cancel a timer you previously started.

## Interface CronEntry

The `CronEntry` defines when and how a specific function (the handler) is executed within the backtest framework. Each entry needs a unique name, used to identify it and prevent duplicates.

The `interval` property determines how often the handler runs – you can set it to intervals like "1m" or "1h" for regular execution, or leave it out to trigger the handler just once.

You can control how broadly the handler applies by setting the `symbols` list. If this list is empty, the handler runs once for every boundary across all backtests. If you provide a list of symbols, the handler will only execute when a tick matches one of those symbols at a boundary.

Finally, the `handler` itself is the function that gets executed when the configured timing and symbol conditions are met. It's the core logic you want to run within your backtest.

## Interface CriticalErrorNotification

This notification signals a serious, unrecoverable error within the system that requires the process to stop immediately. It's a way for the backtest-kit framework to alert you to critical issues. Each notification has a unique identifier, a descriptive error message, and detailed information about the error itself, including a stack trace. Notably, these notifications always originate from the live trading context, and are never generated during a backtest run itself – the `backtest` property will always be false.

## Interface ColumnModel

This describes how to set up columns for displaying data in tables, particularly when generating markdown tables. Think of it as defining what data to show and how to present it. Each column has a unique identifier, a label that appears in the table header, and a function to transform the data into a readable string. You can even control whether a column should be shown at all using a visibility function.

## Interface ClosePendingCommitNotification

This notification appears when a signal, before becoming a full trade, is canceled or closed for some reason. It provides a wealth of details about the intended trade, allowing you to understand why it didn't activate. You'll see information like a unique ID for the notification, the timestamp of the closure, and whether it occurred during a backtest or live trading.

The notification includes key details about the signal itself, like the trading symbol, the strategy that generated it, and its unique identifier. It also outlines the planned trade's specifics, including the number of entries and partial closes involved, the original entry price, and the potential profit and loss profile, covering peak profits and maximum drawdowns.

Crucially, it includes the PNL (profit and loss) information, detailing costs, percentages, and prices used in calculations, as well as prices related to peak profit and maximum drawdown events. Lastly, there’s an optional note for a human-readable explanation and a timestamp of when the notification itself was generated. It is a comprehensive view of what would have been a trade.

## Interface ClosePendingCommit

This event signals that a previously opened position has now been closed. 

It includes important details about the closure, such as a unique identifier (`closeId`) that you can use to track the reason for the closure if needed.

You'll also find comprehensive profit and loss information, including the total profit/loss (`pnl`) generated by the entire position, the highest profit achieved during its lifetime (`peakProfit`), and the largest drawdown experienced (`maxDrawdown`). 

Essentially, this event provides a complete snapshot of the position's performance leading up to its closure.


## Interface CancelScheduledCommitNotification

This notification signals that a scheduled trading signal has been cancelled before it could be executed. It provides detailed information about the signal, including its unique identifier, the trading pair (like BTCUSDT), and the strategy that generated it. You'll see details about the signal’s execution environment, whether it originated from a backtest or live trading, and a unique ID for the cancellation itself.

The notification also includes extensive performance data for the trade that *would have* been executed, like the entry price, potential profit and loss (both overall and peak values), drawdown information, and the total amount invested. You can use this information to understand the context of the cancellation and potentially debug the strategy or scheduling process. A note field offers a space for a human-readable explanation of why the signal was cancelled. The creation timestamp indicates when the cancellation notification was generated.

## Interface CancelScheduledCommit

This interface defines how to cancel a scheduled signal event within the backtest-kit framework. It’s used to communicate that a previously planned signal should no longer be executed.

You’ll specify the action as "cancel-scheduled" to indicate a cancellation request.  You can also optionally include a `cancelId` to provide some context or reason for the cancellation, helpful for tracking or debugging. 

Along with the cancellation request, you're also providing information about the position associated with the signal – its total profit and loss (`pnl`), the highest profit ever reached (`peakProfit`), and the largest loss encountered (`maxDrawdown`). This gives valuable context regarding the position being cancelled.

## Interface BreakevenStatisticsModel

This model holds information about your breakeven events, the points where a trade reaches a break-even state.

It tracks everything related to these milestones, giving you a clear picture of how often they occur.

The `eventList` property contains a detailed record of each individual breakeven event that happened during your backtest or trading simulation. 

You'll also find the `totalEvents` property, which simply tells you the total count of all breakeven events observed.

## Interface BreakevenEvent

This data structure holds all the details you need when a trading signal hits its breakeven point. It's designed to give you a complete picture of what happened during that specific event.

You’ll find information like the exact time, the trading pair involved, the name of the strategy used, and the unique ID of the signal that triggered the event. 

It also includes important price points: the price when breakeven was reached, the initial entry price, and the take profit and stop loss levels that were set. You can even see the original take profit and stop loss prices, which is useful for understanding how the signal has evolved.

If the strategy used dollar-cost averaging (DCA), the data will also tell you how many entries were made and how many partial closes were executed. 

Finally, it logs the unrealized profit and loss (PNL), a human-readable note about the signal, timestamps for when the position became active and the signal was created, and whether the event occurred during a backtest or live trading.

## Interface BreakevenContract

This interface represents a breakeven event, which happens when a trading signal's stop-loss is moved back to the original entry price. It's a signal that the strategy is reducing its risk – the price has moved favorably enough to cover costs and potentially generate some profit.

The event provides a lot of information to help you understand exactly what happened: the trading symbol (like BTCUSDT), the name of the strategy that generated the signal, the exchange and frame being used, the complete data about the original signal, the price at which breakeven was achieved, and whether the event came from a backtest or live trading. This information is useful for tracking how your strategy manages risk, building reports, or setting up custom notifications.  Events of this type are designed to only fire once for each signal to avoid duplicates.

## Interface BreakevenCommitNotification

This notification signals that a breakeven point has been reached and a trade has been closed. It provides a wealth of information about the trade, including a unique ID and timestamp of when it happened, whether it occurred during backtesting or live trading, and the trading pair involved. You'll find details like the strategy and exchange used, and a unique signal identifier.

The notification breaks down the specifics of the position, such as its direction (long or short), entry and exit prices, and any stop-loss or take-profit levels that were in place. It also includes a history of any averaging or partial closes that occurred.

You can delve into the financial performance of the trade with data on total profit and loss, peak profit, maximum drawdown, and associated prices and costs. A handy percentage representation of profit/loss is also included. 

Finally, there's optional descriptive text, as well as timestamps related to signal scheduling and pending status.

## Interface BreakevenCommit

This event signifies a breakeven adjustment has occurred within a trading strategy. It provides a snapshot of the position's state at the time of this adjustment, detailing crucial information for analysis.

The `action` property confirms that this event is specifically related to a breakeven action. You'll find the current market price, the overall profit and loss (`pnl`) accumulated for the position, and the highest profit (`peakProfit`) and largest drawdown (`maxDrawdown`) it experienced.

The event also describes the trade's direction (long or short), the original entry price (`priceOpen`), and the prices initially set for taking profits (`priceTakeProfit`) and limiting losses (`priceStopLoss`). Importantly, it also keeps track of the original take profit and stop loss prices *before* any adjustments like trailing.

Finally, timestamps (`scheduledAt` and `pendingAt`) are included to pinpoint when the signal was generated and when the position first became active. This allows for precise tracking and evaluation of the strategy's performance.

## Interface BreakevenAvailableNotification

This notification signals that your trade has reached a point where the stop-loss can be moved to break-even, essentially protecting your initial investment. It provides a wealth of information about the trade, including a unique identifier, the exact time this event occurred, and whether it’s happening during a backtest or live trading.

You'll find details like the trading pair (e.g., BTCUSDT), the name of the strategy that triggered the signal, and the exchange used. It also includes the current market price, the entry price, and the trade direction (long or short).

The notification further breaks down key performance indicators like total profit/loss (pnl), peak profit achieved, and maximum drawdown, alongside related prices and percentages. You can also see details about how many entries were used (important for strategies employing dollar-cost averaging) and information about any partial position closures. Finally, optional notes can provide additional context.

## Interface BeforeStartContract

This interface, `BeforeStartContract`, signals the very beginning of a trading strategy's run, before any actual trading data is processed. Think of it as a preparation signal – it gives you a chance to set things up before the trading simulation or live execution kicks off. This event is guaranteed to happen only once for each run, and it’s always followed by an `AfterEndContract` signal to mark the end. 

If you need to perform setup tasks like opening log files, resetting counters, or sending notifications, this is the place to do it. It's a reliable spot to ensure consistent initialization for each trading run.

The information provided includes details about the trading symbol, strategy name, exchange, and frame. There’s also a handy `currentPrice` to give you a snapshot of market conditions at the start, and a `when` timestamp, which indicates the intended start time (in backtest mode) or the actual current time (in live mode).  It provides both a `Date` object and a raw timestamp for ease of use.

## Interface BacktestStatisticsModel

This model holds a comprehensive set of statistics generated from backtesting a trading strategy. It gives you a detailed picture of how the strategy performed, including every individual trade and aggregated performance metrics. 

You’ll find a list of all the closed trades, alongside the total number of trades executed. It breaks down the results into winning and losing trades, and calculates key performance indicators.

These KPIs include the win rate, average profit/loss per trade, and total profit/loss across all trades. You’ll also find volatility metrics like standard deviation, and risk-adjusted performance ratios like Sharpe Ratio, Sortino Ratio, and Calmar Ratio.

Furthermore, it provides insight into peak and fall percentages during trades, and looks at how quickly the strategy recovers from losses, represented by the recovery factor. Be aware that many of these values can be null if the calculations are unreliable due to unusual market conditions.

## Interface AverageBuyCommitNotification

This notification signals a new step in your dollar-cost averaging (DCA) strategy, letting you know another portion of your position has been purchased. It provides detailed information about this specific averaging entry, including when it happened, the price paid, and how it affects your overall position.  You'll see details like the total number of averaging entries you've made, the current effective entry price, and the total cost of this particular averaging purchase.

The notification also includes performance data tied to the position, such as peak profit, maximum drawdown, and the associated prices and costs at those points, giving you a comprehensive view of the position's journey so far. You can see if this is a backtest simulation or a live trade, along with crucial identifiers like the signal ID and strategy name.  Finally, you’ll find details about when the signal was initially scheduled and when the position became pending.

## Interface AverageBuyCommit

This event, called AverageBuyCommit, signals that a new averaging purchase has been made within an existing position. It provides a snapshot of the position's state immediately after this averaging event takes place.

The `action` property confirms this is an average-buy event. You'll find the `currentPrice` showing the price at which this averaging purchase happened.  The `cost` tells you how much this specific averaging purchase cost in USD. 

The event also details the overall position performance. `effectivePriceOpen` represents your new, averaged entry price, while `pnl`, `peakProfit`, and `maxDrawdown` provide key metrics about the position’s profitability and risk. The `position` property simply clarifies if it's a long or short trade.

Importantly, `priceOpen` reflects the initial entry price when the position was first opened, and `priceTakeProfit` and `priceStopLoss` show the current, potentially adjusted, take profit and stop-loss levels. The `originalPriceTakeProfit` and `originalPriceStopLoss` give you the initial values before any trailing adjustments were applied. Finally, `scheduledAt` and `pendingAt` timestamps help track when the signal was created and the position was activated.

## Interface AfterEndContract

This interface, `AfterEndContract`, signals the completion of a trading strategy run. It’s triggered consistently, whether the run finishes normally, encounters an error, or is externally stopped. Think of it as a reliable way to clean up after a trading strategy finishes – like flushing any buffered data or sending notifications that the run is done.

You can expect this event to happen once for every start event, ensuring a clean and predictable lifecycle for your strategies. Any errors within the cleanup process are handled internally to prevent them from disrupting your main application.

The `when` property tells you exactly when the run ended. In backtesting, it reflects the precise historical time of the last processed candle, or the start of the frame if nothing was processed. In live trading, it represents the current time, rounded to the nearest minute. The `timestamp` property is just a convenient numerical representation of that date and time.

The event also provides key details about the run itself, including the trading symbol (`symbol`), the strategy's name (`strategyName`), the exchange used (`exchangeName`), the timeframe (`frameName`), and whether it was a backtest (`backtest`).  You’ll also find the average price at the end of the run (`currentPrice`), which can be useful for reporting or further analysis.

## Interface ActivePingContract

This defines a standard way for the system to let you know about ongoing monitoring of a pending signal. Think of it as a regular heartbeat while a signal is active, providing information every minute.

You'll receive these "active ping" events while a pending signal remains open, allowing you to keep track of its lifecycle.

Each ping includes details like the trading pair (symbol), the strategy being used, the exchange involved, and all the data associated with the pending signal itself.

Crucially, you’ll also get the current market price at the time of the ping and whether the event originates from a backtest or live trading.

The timestamp indicates when the event occurred – either the precise moment of the ping in live trading or the candle timestamp in backtest mode. This lets you build custom logic to manage signals based on these updates.

## Interface ActivateScheduledCommitNotification

This notification signals that a scheduled trading signal has been manually triggered, meaning a trade is about to happen. It's like a heads-up that the system is about to execute a planned trade, regardless of current price conditions.

The notification includes a lot of detail about the impending trade: a unique ID, when it was activated, whether it's a backtest or live trade, the trading pair (like BTCUSDT), the strategy that generated it, and the exchange it's going through.  You'll find details about the trade itself, including the direction (long or short), the intended entry price, and take profit/stop-loss levels – both the original and adjusted values if trailing stops are in use.

Beyond the basics, you can also see information about how the trade will be managed, such as the number of entries and partial closes already executed, and very detailed performance data for the position including profit/loss, peak profit, maximum drawdown, and entry prices.  Finally, the notification tells you when the signal was originally scheduled, when it entered a pending state, and the current market price at the time of activation, and a helpful note explaining the reasoning behind the signal.

## Interface ActivateScheduledCommit

This interface describes an event triggered when a previously scheduled trading signal is put into action. It provides a snapshot of the position being activated, including details like the trade direction (long or short), the entry price, and the initially set take profit and stop loss levels. You’ll also find information about the position’s performance up to this point, such as its total profit and loss, peak profit, and maximum drawdown. The event also includes information about the timestamp when the signal was originally created and when it was activated. A user-provided identifier can be added to help track the reason for the activation.

