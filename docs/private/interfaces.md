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

This interface defines the information shared when a walker needs to be stopped. Think of it as a notification that a specific trading strategy, running under a particular name, needs to be paused or halted. It’s useful when you have multiple strategies running concurrently and need to precisely target the one you want to stop. The notification includes the trading symbol, the name of the strategy itself, and the name of the walker that's being interrupted, allowing for targeted shutdowns.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel provides a clear way to represent the results of a backtesting process, particularly when comparing multiple strategies. It builds upon the existing IWalkerResults interface, adding extra details to facilitate strategy comparisons.  You’ll find an array of strategy results within this model, making it easy to analyze how different trading approaches performed. This structure is specifically helpful when working with markdown services that need to present and interpret backtest data in a user-friendly format.

## Interface WalkerContract

The `WalkerContract` helps you track the progress of comparing different trading strategies. It provides updates as each strategy finishes its backtesting run and is ranked.

You'll receive these updates with information like the strategy's name, the exchange and frame being used, the symbol it's trading, and the backtest statistics generated.

Each update also includes the metric being optimized, its value for the completed strategy, and the current best metric value seen so far alongside the name of the leading strategy.

Finally, you'll know how many strategies have been tested and the total number remaining, giving you a clear picture of how much longer the comparison will take.

## Interface WalkerCompleteContract

This interface represents the final notification you receive when a backtest walker finishes its job. It signals that all the chosen trading strategies have been tested and the complete results are ready for you to review.

The notification includes essential details like the name of the walker, the trading symbol it evaluated, the exchange and timeframe used for the tests, and the metric used to determine the best strategy. 

You’ll also find information about the total number of strategies tested, the name of the top-performing strategy, its best metric score, and detailed statistics specifically for that best strategy. This comprehensive data allows you to easily understand and analyze the performance of different strategies across your backtesting runs.


## Interface ValidationErrorNotification

This notification signals that a validation error occurred during your backtesting or trading process. It's a way for the system to tell you something went wrong when it tried to enforce your risk rules. 

Each notification includes a unique identifier (`id`) so you can track it, and a descriptive `message` to help you understand the problem. You'll also find a detailed `error` object with information like the stack trace, which is super helpful for debugging. The `backtest` property will always be `false` because these errors come from real-time validation checks, not simulations.

## Interface ValidateArgs

This interface, `ValidateArgs`, helps ensure your backtest configuration is correct by verifying the names of key components. Think of it as a checklist to prevent typos and errors. It defines properties like `ExchangeName`, `FrameName`, `StrategyName`, `RiskName`, `ActionName`, `SizingName`, and `WalkerName`. Each of these properties expects an enum object, allowing the system to check if the name you've provided is a recognized and valid option for that particular component within your backtest setup. This contributes to building more reliable and accurate backtesting simulations.

## Interface TrailingTakeCommitNotification

This notification tells you when a trailing take profit order has been executed. It provides a wealth of information about the trade, including a unique identifier, the exact time it happened, and whether it occurred during a backtest or in live trading.

You'll find details about the strategy involved, the exchange used, and the specifics of the trade itself, such as the symbol, position direction (long or short), and original/adjusted take profit and stop loss prices. It also includes crucial information about the DCA (Dollar Cost Averaging) process, like the total number of entries and partial closes. 

The notification also includes detailed Profit and Loss (PNL) data, including percentages, entry and exit prices, total cost, and the initial investment. Lastly, it shares timestamps to track when the signal was scheduled, became pending, and when the notification itself was created.

## Interface TrailingTakeCommit

This interface describes what happens when a trailing take profit order is triggered within the backtest-kit framework. It represents a specific action – a trailing take – and provides all the relevant details about that event.

You'll find information about how much the take profit price has shifted, the current market price when the adjustment occurred, and the unrealized profit and loss at that point. It also outlines the direction of the trade (long or short), the original entry price, and the updated take profit and stop-loss prices. 

Crucially, it includes the original take profit and stop-loss levels before any trailing adjustments were made, allowing you to track how the strategy's risk management has evolved. Finally, timestamps indicate when the trailing signal was initially generated and when the position was first activated.

## Interface TrailingStopCommitNotification

This notification lets you know when a trailing stop order has been triggered and executed, whether it happened during a backtest or in a live trading environment. It provides a wealth of details about the trade, including a unique identifier, the exact time it occurred, and whether it was part of a backtest.

You’ll find information about the trading pair (like BTCUSDT), the strategy that generated the signal, and the exchange used.  Crucially, it outlines how the trailing stop adjusted the original stop-loss and take-profit prices.

The notification also includes important data points for tracking performance such as the entry and exit prices, the total number of entries (if using DCA), the total number of partial closes, and a comprehensive breakdown of the Profit and Loss (PNL). Finally, you’ll get the timestamps associated with signal creation and when the position started.

## Interface TrailingStopCommit

This interface describes an event triggered when a trailing stop order is executed. It provides a snapshot of the position's details at the moment the trailing stop adjustment happens. You'll find information here like the percentage shift used to adjust the stop loss, the current market price, and the unrealized profit and loss (pnl) of the position.

The event also includes the original take profit and stop loss prices, allowing you to track how the trailing stop has modified those levels. You can see the entry price, and importantly, the new, adjusted stop loss price. The timestamps indicate when the trailing stop signal was initially generated and when the position was activated. This information is crucial for understanding and auditing trailing stop actions within your backtesting or trading system.


## Interface TickEvent

The `TickEvent` object provides a standardized way to represent all types of trading events within the backtest-kit framework. Think of it as a single container holding all the relevant data—like a detailed log entry—for actions like opening, closing, scheduling, or cancelling a trade. It includes essential information such as timestamps, the type of action taken (e.g., "closed", "opened"), the trading symbol, and the signal ID associated with the event.

For trades that involve take profit and stop loss orders, you’ll find details about their prices, including the original prices set at the signal’s creation. If the trade used DCA (Dollar-Cost Averaging), the number of entries is tracked. Partial closes are also accounted for, along with the total executed percentage. 

Performance metrics like unrealized or realized profit/loss (pnl), percentage progress toward take profit and stop loss, and duration of the trade are also included.  Specific events, like closed or cancelled trades, have additional details such as the reason for closure or cancellation. Lastly, timestamps for when positions became active or signals were initially scheduled are available for reference.

## Interface SyncStatisticsModel

This model holds information about how your signals are syncing. It keeps track of every sync event that happens, giving you a complete history in the `eventList` property. You can easily see the total number of sync events with `totalEvents`, and quickly understand how many signals have been opened (`openCount`) versus closed (`closeCount`). It's a useful tool for monitoring the lifecycle of your signals and diagnosing any potential issues.

## Interface SyncEvent

The `SyncEvent` object holds all the key details about significant events that happen during a trading strategy's lifecycle, especially useful for generating reports. It’s designed to be a central record, bundling information from different parts of the system into one place. You’ll find things like the exact time the event occurred (`timestamp`), which trading pair was involved (`symbol`), and the name of the strategy and exchange.

It also tracks important details related to specific trades: the signal’s unique ID (`signalId`), the action taken (`action`), the trade direction (`position`), entry and profit/loss prices (`priceOpen`, `priceTakeProfit`, `priceStopLoss`), and even how those prices might have changed due to trailing stops or averaging. 

For signals that have been closed, there’s a `closeReason` to explain why.  The object also indicates whether the event originates from a backtest (`backtest`), and includes timestamps for when the signal was initially created and when the position was activated.  Finally, it captures information about partial closes and DCA entries.

## Interface StrategyStatisticsModel

This model holds all the statistical information gathered during a backtest run of your trading strategy. Think of it as a detailed report card showing how your strategy performed and the actions it took.

It includes a complete list of every event your strategy triggered, allowing for a deep dive into its behavior. You'll also find key metrics like the total number of events generated, and counts for specific actions like canceling orders, closing positions, taking partial profits or losses, and utilizing trailing stops.

For strategies employing dollar-cost averaging (DCA), it even tracks the number of average buy events. Basically, this model gives you a comprehensive understanding of your strategy's activity during a backtest.

## Interface StrategyEvent

This data structure acts as a central hub for all the significant events happening within your trading strategy. Think of it as a detailed log entry whenever your strategy takes action, whether it's placing an order, canceling one, or closing a position. It includes essential information like the exact time of the event, the trading pair involved, and the strategy's name.

You’ll find details about the signal that triggered the action, along with specifics about the trade itself, such as the position direction (long or short), entry price, take profit levels, and stop loss levels – both the initial and adjusted values if trailing stops are in use.  It also tracks information about DCA averaging, if applicable, like the total number of entries and the average entry price. 

For scheduled or pending actions, you'll see IDs that help you track their status.  The `pnl` property provides a snapshot of the strategy's profit and loss at that specific moment. This comprehensive data is invaluable for generating reports and analyzing your strategy's performance. The `backtest` property will distinguish between live and historical simulations.

## Interface SignalSyncOpenNotification

This notification tells you when a signal, specifically a limit order, has been activated and a position has been opened. It's like a confirmation that your trading plan is in action. 

You'll find a unique ID for this notification, along with the exact time it happened, whether it occurred during a backtest or live trading, and the symbol being traded (e.g., BTCUSDT). It also identifies the strategy that generated the signal and the exchange it was executed on.

The notification provides key details about the trade itself: the signal ID, the current price, the direction (long or short), and the entry price. You can also see the original and adjusted take profit and stop-loss levels, along with information about any DCA averaging or partial closes that were implemented. 

Finally, it includes comprehensive P&L data for the newly opened position, showing the profit/loss amount, percentage, cost, and entries, along with timestamps for signal creation and activation.

## Interface SignalSyncCloseNotification

This notification lets you know when a trading signal has been closed, whether it was due to hitting a take profit or stop loss, time expiring, or manual intervention. It provides a wealth of information about the closed signal, including a unique identifier, the exact time it closed, and whether it occurred during a backtest or live trading.

You'll find details about the trading symbol, the strategy that generated the signal, and the exchange it was executed on. It also includes critical data for profit and loss calculations, such as entry and exit prices, total investment, and percentage gain or loss. 

The notification clarifies the trade direction (long or short), details the original and adjusted take profit and stop loss prices, and provides insight into any DCA averaging or partial closes that may have occurred. Finally, timestamps indicate when the signal was initially created and when the position was activated, along with the reason for the signal's closure.

## Interface SignalSyncBase

This describes the fundamental information that every signal synchronization event shares, regardless of whether it originates from a backtest or live trading. Each signal event includes details like the trading symbol (e.g., BTCUSDT), the name of the strategy that produced it, and the exchange where it was placed. You’ll also find information about the timeframe used, a flag to indicate if it's a backtest event, a unique identifier for the signal, its timestamp, and the complete signal data itself. Essentially, this provides the common foundation for understanding any signal that’s synchronized within the backtest-kit framework.

## Interface SignalScheduledNotification

This notification lets you know when a trading signal has been set to execute in the future. It’s like a heads-up that a trade is going to happen, whether you're running a backtest or live trading. Each notification has a unique ID and timestamp indicating when the signal was scheduled. 

The details included tell you everything you need to know about the upcoming trade: the symbol being traded, the strategy that generated it, the exchange it will use, and the planned trade direction (long or short). You’ll also find key price points like the entry price, take profit, and stop loss, along with their original values before any trailing adjustments. 

It also provides details about how the position was built, including the number of DCA entries and partial closes.  Financial information like the cost of the trade, unrealized PNL, and profit/loss percentages are included. Finally, the current market price at the time of scheduling and the creation timestamp are also provided for context.

## Interface SignalOpenedNotification

This notification tells you when a new trade has been opened. It’s like a confirmation that a signal generated by your trading strategy has resulted in a position being created – whether it's a backtest or a live trade.

The notification includes a lot of useful details. You’ll find the unique ID of the signal, the exact time it was opened, and whether it occurred during backtesting or live trading. Crucially, it provides information about the trade itself, like the symbol being traded (e.g., BTCUSDT), the strategy that generated the signal, the trade direction (long or short), and the entry price.

You can also see the take profit and stop loss prices, as well as their original values before any adjustments. Information about any averaging (DCA) or partial closing strategies used is also included. Finally, it provides profit and loss information, allowing you to track performance and understand the cost and effectiveness of the signal. The notification also includes a "note" field for any explanation or reason behind the signal.

## Interface SignalOpenContract

This event lets you know when a trading signal has been executed – specifically when a limit order has been filled by the exchange. It's a signal that a position is now open, whether it's a long (buy) or short (sell) trade. 

Think of it as a confirmation that your order actually went through.

The event provides a wealth of information to help you track and reconcile your trades. You'll see the entry price, the current market price, and details about any take profit or stop-loss levels that were set. It also includes information about the position's cost, potential profit and loss (PNL), and how the entry price was originally determined – useful if you’ve been using dollar-cost averaging. 

Timestamp data shows you when the signal was initially scheduled and when the position finally opened, making it ideal for syncing with external systems or for auditing your trading activity. Details on the number of entries and partial closes executed helps you understand complex position building.

## Interface SignalData$1

This interface, SignalData$1, describes a single trading signal that has already been closed. Think of it as a record of one completed trade. It holds key details like which strategy generated the signal, a unique ID for the signal itself, the symbol being traded (like BTC/USD), whether it was a long or short position, and the profit or loss percentage from that trade. You’ll also find the reason the signal was closed, and timestamps indicating when the trade was opened and closed. Essentially, it bundles together the vital information needed to analyze the performance of a trading strategy.

## Interface SignalCommitBase

This interface describes the fundamental information shared by all signal commitment events within the backtest-kit framework. Every time a signal is acted upon – whether in a backtest or live trading environment – this base structure ensures essential details are recorded.

It includes the trading symbol, the name of the strategy that generated the signal, the exchange used, and the timeframe involved. You'll also find information about whether the signal came from a backtest and a unique ID for tracking purposes. 

Crucially, the timestamp tells you *when* the signal action occurred, and the `totalEntries` and `totalPartials` fields provide insight into the complexity of the trade – indicating if it’s a single entry or a DCA (Dollar Cost Averaging) trade, and if any partial closes have been executed. Finally, `originalPriceOpen` holds the initial entry price, which remains constant even with subsequent DCA adjustments.

## Interface SignalClosedNotification

This notification tells you when a trading position, initiated by a strategy, has been closed – whether it was due to hitting a take profit or stop loss, or some other reason. It provides a wealth of information about the trade, including a unique identifier, the exact time it closed, and whether it occurred during a backtest or live trading.

You'll find details about the strategy that generated the signal, the exchange it was executed on, and the direction of the trade (long or short). The notification also includes the entry and exit prices, along with the original take profit and stop loss levels before any adjustments were made.

To help you understand the trade’s performance, the notification also contains profit and loss figures, both as a percentage and in absolute USD value, along with how long the position lasted and any notes explaining the closure. Finally, you'll find timestamps for key events, such as when the signal was first created and when the position went pending. This allows you to reconstruct the timeline of the entire trading process.

## Interface SignalCloseContract

This event lets you know when a trading signal has been closed, whether it was because a profit target was hit, a stop-loss was triggered, time ran out, or a user manually closed it.  It's designed to help other systems, like order management or audit logs, stay in sync with what's happening in the trading framework.

The event provides key information about the closed trade, including the current market price, the total profit and loss (PNL) realized, the trade direction (long or short), and the actual entry, take profit, and stop-loss prices used at the time of closure – these might be different from the initial values due to trailing adjustments or DCA averaging.  You’ll also find details about when the signal was created and when the position was activated.

Furthermore, the event specifies the reason for the closure and gives you insight into how many times the position was averaged (DCA entries) and partially closed. This helps with detailed post-trade analysis and reconciliation.

## Interface SignalCancelledNotification

This notification tells you when a signal that was scheduled to execute has been cancelled before it actually did. It’s useful for understanding why a trade didn't happen.

Each notification includes details like a unique ID, the time it was cancelled, and whether it was part of a backtest or live trading. You'll also find information about the strategy that generated the signal, the exchange it was intended for, and specifics about the potential trade like the planned entry price, stop-loss, and take-profit levels.

The `cancelReason` property is particularly helpful – it explains *why* the signal was cancelled, whether due to a timeout, price rejection, or a manual cancellation by a user. Other details like `totalEntries` and `totalPartials` will show you information about any averaging or partial closing that might have been planned, and you can view when the signal was initially created with `scheduledAt`.

## Interface Signal

This section describes the `Signal` object, which represents a trading signal generated by your backtesting strategy. Think of it as a record of what your strategy 'thinks' about the market.

It keeps track of the initial entry price for a position using the `priceOpen` property. 

The `_entry` property is an array that stores details about each time the signal initiated a position. Each entry includes the price at which the position was opened, the total cost (including fees), and the timestamp of the entry.

Finally, `_partial` is an array that records partial exits (either taking profits or cutting losses) from a position, storing information like the type of exit (profit or loss), the percentage of the position closed, the price at the time of the partial exit, the cost basis when the partial order closes, the number of shares/contracts at the time of the close, and a timestamp.

## Interface Signal$2

This `Signal$2` object represents a trading signal, keeping track of important details about a position. It stores the initial entry price, labeled `priceOpen`, which is crucial for calculating profit and loss. 

You’ll also find records of each entry made into the position, detailed in the `_entry` array. This array includes the price at entry, the associated cost, and the timestamp of the trade.

Finally, `_partial` holds a history of any partial exits or adjustments made to the position, noting the type (profit or loss), percentage, current price, cost basis, entry count, and the timestamp of each partial action.

## Interface Signal$1

This section details the `Signal$1` object, which represents a trading signal within the backtest-kit framework. It holds key information about a position, including the `priceOpen`, which is the initial entry price for the trade. 

You’ll also find a record of entry details stored in the `_entry` property; this provides a history of when and at what price positions were opened and the associated costs. Similarly, `_partial` tracks any partial exits (either for profit or loss), noting the percentage gained or lost, the price at which the partial exit occurred, and relevant cost and quantity information at the time. This allows for a detailed audit trail of each trade’s lifecycle.

## Interface ScheduledEvent

This data structure holds all the key details about trading events, whether they were scheduled, opened, or cancelled. Think of it as a single record summarizing what happened with a specific trade. 

Each event is marked with a timestamp, and it tells you the action taken – whether a signal was scheduled, a trade was opened, or it was cancelled.  You'll find important information like the trading pair (symbol), a unique ID for the signal, and the position type.

The record also includes price points like the entry price, take profit, and stop loss, along with their original values before any adjustments.  If a DCA strategy was used, you'll see details about the number of entries and partial closes. It captures the current P&L and, in the case of cancellations, the reason and a unique ID for the cancellation.  Finally, it includes information about when the position became active or how long it lasted.

## Interface ScheduleStatisticsModel

The `ScheduleStatisticsModel` helps you understand how your scheduled signals are performing. It keeps track of all scheduled signals, including those that were opened (activated) and those that were cancelled. 

You can see the total number of events, and break them down into scheduled, opened, and cancelled counts. 

The model also calculates key performance indicators like the cancellation rate (how often signals are cancelled – lower is desirable) and the activation rate (how often signals become active – higher is better). Finally, it provides insights into waiting times, showing the average time signals spent waiting before being cancelled or activated. This allows you to fine-tune your scheduling strategies and improve their effectiveness.

## Interface SchedulePingContract

This interface describes the data you receive when backtest-kit sends out a "ping" signal during its scheduled monitoring process. These pings happen every minute while a signal is active – meaning it's neither canceled nor activated. Think of them as check-in messages to confirm the signal is still valid and being tracked.

Each ping includes important details like the trading pair (symbol), the name of the strategy using the signal, and the exchange it's on. You’ll also get the full data associated with the signal, the current price at the moment of the ping, whether it’s a backtest or live trade, and a timestamp indicating when the ping occurred.

These pings are really useful if you need to build custom logic to monitor signals, maybe to automatically cancel a signal based on price movements or other conditions. You can listen for these ping events to implement that kind of behavior.

## Interface RiskStatisticsModel

This model holds important data about risk management within the backtest kit. It collects information from every time a risk rejection occurs, allowing you to analyze and improve your strategies. 

You'll find a detailed list of each rejection event in the `eventList` property. The `totalRejections` tells you the overall number of times your risk controls kicked in. To understand where those rejections are happening, the `bySymbol` property breaks down the count by trading symbol, and `byStrategy` shows you how each strategy contributed to the rejections. These details help pinpoint potential areas for optimization.

## Interface RiskRejectionNotification

This notification alerts you when a trading signal is blocked by your risk management rules. It provides detailed information about why the signal was rejected, helping you understand and refine your risk controls.

Each rejection notification has a unique ID and timestamp, indicating exactly when it occurred. You’ll find details like the strategy that generated the signal, the trading symbol involved, and the exchange where the rejection took place.

The `rejectionNote` property offers a plain-language explanation of the specific risk rule that triggered the block. Additional details include the current market price, the number of open positions, and, if available, information about the intended trade like the entry price, take profit, and stop loss levels. A signal ID links the rejection to the specific signal that was attempted.

## Interface RiskEvent

This data structure holds information about signals that were blocked by risk management rules. It provides a detailed record when a trading signal couldn't be executed because it exceeded pre-defined risk limits.

You'll find key details like when the event occurred (timestamp), the trading pair involved (symbol), and the specifics of the signal that was rejected (currentSignal). It also includes the name of the strategy that generated the signal, the exchange used, the timeframe, and the current market price at the time.

Furthermore, it tells you how many positions were already open (activePositionCount), gives a unique ID to track the rejection (rejectionId), explains *why* the signal was rejected (rejectionNote), and confirms whether the event happened during a backtest or live trading (backtest). This information is invaluable for analyzing risk management performance and understanding why certain trades weren't taken.


## Interface RiskContract

This interface, RiskContract, represents a rejected trading signal due to risk validation. Think of it as a notification that a trading attempt was blocked because it crossed a predefined risk limit. It's specifically designed to help you monitor and understand why signals are being rejected, focusing only on actual risk violations.

The information provided includes details like the trading pair involved (symbol), the signal itself (currentSignal) with details like order size and price levels, and the name of the strategy that generated it. You’ll also find the frame used in backtesting, the exchange, the current market price at the time of rejection, and the total number of active positions.

Each rejection gets a unique ID (rejectionId) which is extremely useful for investigation and debugging. A human-readable explanation (rejectionNote) explains why the signal was blocked, and the timestamp tells you precisely when it happened. Finally, a flag (backtest) indicates whether this rejection occurred during a backtest or in live trading. This allows for separate tracking and analysis of risk events in different environments.

## Interface ProgressWalkerContract

This interface describes the updates you’ll receive as a background process, like analyzing strategies, runs. It gives you details about what’s happening, including the name of the process, the exchange and frame being used, the trading symbol involved, and how many strategies have been processed out of the total. You’ll see a `progress` value, a percentage from 0 to 100, to understand how far along the process is. Think of it as a status report letting you know how things are going behind the scenes.

## Interface ProgressBacktestContract

This contract lets you monitor how a backtest is progressing. It provides details about the backtest, including the exchange and strategy being used, along with the trading symbol. You'll see the total number of historical data points (frames) the backtest will analyze, and how many have been processed already. 

Essentially, it gives you a percentage complete to track the backtest's advancement, helping you understand how much longer it will take to finish. The information includes the exchange name, strategy name, symbol, total frames, processed frames and progress percentage.


## Interface PerformanceStatisticsModel

This model holds all the performance data collected during a backtest run for a specific trading strategy. You'll find the strategy's name clearly listed, alongside the total number of performance events that occurred and the overall time it took to run the metrics.  The `metricStats` property breaks down the performance data further, grouping statistics by different metric types. Finally, you can access all the raw performance events, which provides a detailed, granular view of how the strategy performed.

## Interface PerformanceContract

The PerformanceContract helps you keep an eye on how your trading strategies are performing. It's essentially a record of different operations within the backtest-kit framework, like order execution or data fetching, along with how long they took. Each record includes a timestamp, the time of the previous record (if any), and a label describing what kind of operation was measured. You’ll also find details like which strategy, exchange, frame (if in backtest mode), and symbol were involved. This information is fantastic for spotting slow areas in your code and generally understanding how efficiently your strategies are running.

## Interface PartialStatisticsModel

This model holds key statistics about your trading backtest, specifically focusing on partial profit and loss events. It’s designed to help you analyze how your strategy performs at various milestones.

You'll find a detailed list of all the profit and loss events recorded, along with the overall count of events, the number of profitable trades, and the number of losing trades. This information provides a clear picture of your strategy's success rate and overall profitability when considering partial exits. 

Think of it as a snapshot of your partial trading performance, allowing you to pinpoint areas for improvement.


## Interface PartialProfitContract

The `PartialProfitContract` helps you keep tabs on how your trading strategies are performing by providing information when they reach specific profit milestones. Think of it as a notification system for when your strategy hits 10%, 20%, 30% profit, and so on. Each notification includes details like the trading pair (symbol), the name of the strategy that triggered it, the exchange being used, and the current market price at the time the milestone was hit.

You'll also find the original data related to the signal that triggered the profit, alongside a flag indicating whether the event occurred during a backtest or live trading. The `timestamp` property tells you exactly when the event happened, which is important for accurate reporting and analysis. These events are designed to be used by reporting services or custom callbacks to monitor and analyze strategy performance. It's worth noting that you'll only receive each level once, even if prices jump around a lot.

## Interface PartialProfitCommitNotification

This notification lets you know when a partial profit target has been hit and executed within your trading strategy. It's a detailed report, including a unique identifier and timestamp for tracking purposes. You'll find key information like the trading symbol, the strategy’s name, and the exchange used, along with specifics about the trade itself—direction (long or short), entry price, take profit levels, and stop loss levels both as they currently are and as they were initially set.

The notification also provides a wealth of performance data. You’ll see the current price at the time of the partial profit, the profit and loss in both percentage and absolute terms, and a breakdown of the investment, including the entry and exit prices used in the PNL calculation and the total cost. Finally, it contains timestamps for when the signal was scheduled and when the position became pending, giving you a full timeline of the trade's lifecycle. The notification also clarifies if it originates from a backtest or a live trading environment.

## Interface PartialProfitCommit

This event signals that a partial profit is being taken on a trade. It provides a lot of detail about the trade at the moment the partial profit was triggered, including the direction of the trade (long or short) and the entry price. You'll find the current market price and the unrealized profit and loss (PNL) associated with the position.

The event also includes the original and adjusted take profit and stop-loss prices, allowing you to understand how trailing stops may have affected them. Finally, timestamps indicate when the signal was created and when the position was activated, offering insight into the timing of events. The `percentToClose` property tells you what portion of the position is being closed off with this action.

## Interface PartialProfitAvailableNotification

This notification lets you know when a trading strategy has reached a profit milestone, like 10%, 20%, or 30% gain. It's triggered during both backtesting and live trading.

The notification includes a unique identifier and timestamp, plus details about the trade itself, such as the symbol, strategy name, exchange, and signal ID. You'll also find information about the profit level achieved, the current price at the time, the original entry price, and whether the position is a long or short trade.

The data also breaks down the take profit and stop loss prices, both as they currently are and as they were initially set. It details any DCA averaging applied and how many partial profits have been taken. Crucially, it provides a snapshot of the unrealized profit and loss (both in USD and as a percentage), along with the entry and exit prices used for that P&L calculation.  Finally, it records when the signal was first scheduled and when the position went pending.

## Interface PartialLossContract

The `PartialLossContract` represents a notification that a trading strategy has hit a predefined loss level, like a -10% or -20% drawdown. Think of it as a signal that things are moving in an unfavorable direction for a trade.

It's used to keep track of how much a strategy has lost along the way, offering insight into its performance. This information is particularly useful during backtesting to analyze risk management effectiveness.

Each loss level is reported only once per trade, even if the price swings dramatically. The notification contains key details: the symbol of the trading pair, the strategy’s name, where the trade is happening (exchange and frame), the original signal data, the current price, the specific loss level reached, whether it’s a backtest or live trade, and the timestamp of the event.  The level value is a positive number representing a negative loss (e.g., 20 signifies a -20% loss).

## Interface PartialLossCommitNotification

This notification tells you when a partial position closure has happened, whether it’s during a backtest or a live trade. It provides a ton of detail about the trade that was executed, including a unique ID for the notification and the exact time it occurred. You'll find information about the strategy involved, the exchange used, and the trading pair, along with specifics like the percentage of the position closed and the current market price at the time.

The notification also gives you a complete picture of the original order parameters, including the initial entry price, take profit, and stop loss levels, as well as how they might have been adjusted with trailing stops. You can see how the trade impacts profitability with detailed P&L information, including percentage gains/losses and the entry and exit prices used in the calculations. Finally, you'll get timestamps detailing when the signal was created, when the position became active, and when the notification itself was generated. This is incredibly useful for analyzing trade performance and understanding the system's behavior.

## Interface PartialLossCommit

This describes what happens when a strategy triggers a partial loss – closing only a portion of your position. 

The `action` property clearly identifies this as a "partial-loss" event. You’ll also find the `percentToClose`, which tells you exactly what percentage of the position is being closed.

Important price information is included too: `currentPrice` reflects the market price at the time of the action, while `priceOpen` represents the initial entry price.  You'll see the original take profit and stop loss prices (`originalPriceTakeProfit`, `originalPriceStopLoss`), as well as the prices they've evolved to after any trailing adjustments (`priceTakeProfit`, `priceStopLoss`).

The `pnl` property gives you the unrealized profit and loss at the time the partial loss was triggered. Finally, `position` confirms whether the trade was a "long" (buy) or "short" (sell) position, alongside timestamps indicating when the signal was created (`scheduledAt`) and when the position was activated (`pendingAt`).

## Interface PartialLossAvailableNotification

This notification informs you when a trading strategy reaches a predefined loss milestone, like a 10% or 20% drawdown. It's a signal that things aren't going as planned, and it provides a wealth of information to help you understand why.

You’ll find details such as a unique identifier for the notification and the exact timestamp of when the loss level was hit. Crucially, it includes the trading symbol, the strategy's name, and the exchange used. It also tells you whether this is happening in a backtest simulation or live trading.

The notification breaks down the specifics of the trade, offering the entry price, take profit and stop-loss levels (both original and adjusted for trailing), and the trade direction (long or short). You'll also see details about DCA (Dollar Cost Averaging) if it's being used, including the number of entries and partial closes.

A comprehensive snapshot of the current profit/loss situation is provided, including the unrealized PNL, percentage profit/loss, and the actual entry and exit prices used for the PNL calculation, along with the total invested capital. Finally, timestamps associated with the signal's creation and pending phases are included for full context.

## Interface PartialEvent

This data structure helps track profit and loss milestones during trading. It bundles together all the important details about a specific profit or loss level reached by a strategy. You’ll find information like the exact time the event occurred, whether it was a profit or loss, the trading symbol involved, and the strategy's name and signal ID.

The structure also includes key price points, such as the entry price, take profit target, and stop-loss levels, along with their original values when the signal was initially created. If the strategy uses dollar-cost averaging (DCA), you’ll see details about the total entries and the original entry price before averaging. Partial closes are also tracked, along with the total percentage executed.

Finally, the record captures the unrealized profit and loss (PNL) at that specific level, a human-readable note explaining the signal's reasoning, and timestamps for when the position became active and when the signal was initially scheduled, along with a flag indicating whether the trade is part of a backtest.

## Interface MetricStats

This object bundles together statistics calculated for a particular performance metric. It provides a comprehensive view of how that metric performed across many recorded instances. 

You’ll find details like the total number of times the metric was recorded, the total time spent for all instances, and key duration measurements - average, minimum, maximum, standard deviation, median, and percentiles (95th and 99th).

It also includes information about wait times between events related to the metric, including minimum, maximum, and average durations. The `metricType` property clearly identifies what kind of metric these statistics represent.

## Interface Message

This describes a message, which is a fundamental building block for tracking conversations. Each message has a `role` indicating who sent it – whether it’s a system instruction, something the user typed, or a response from the LLM.  The `content` property holds the actual text of the message itself. Essentially, it's how you represent a single turn in a conversation or a piece of information exchanged.

## Interface LiveStatisticsModel

This model provides a detailed view of your live trading performance. It collects data on every event—from idle periods to trade openings, activity, and closures—allowing for in-depth analysis. You’ll find key statistics like the total number of trades, win/loss counts, and win rate, which reflects the percentage of profitable trades. 

Beyond basic counts, it also calculates vital metrics such as average profit per trade, total cumulative profit, and volatility measures (standard deviation). The Sharpe Ratio and annualized Sharpe Ratio help evaluate risk-adjusted returns, while the certainty ratio provides insight into the ratio of average wins to average losses. Finally, it estimates expected yearly returns based on typical trade durations and profits.

All numeric values are marked as null if the calculations are unreliable due to potential errors, ensuring data accuracy.

## Interface InfoErrorNotification

This notification lets you know about errors that happen during background processes, but aren't critical enough to stop everything. Think of it as a heads-up about something that needs attention. Each notification has a unique ID to help you track it, and includes a detailed error object with information like a stack trace and extra data to help debug.  You'll also get a clear, human-readable error message explaining what went wrong. Importantly, these notifications are specifically for errors within the testing environment and won't occur during live trading.

## Interface IWalkerStrategyResult

This interface holds the results for a single trading strategy that's been evaluated. It contains the strategy's name so you know which strategy the data refers to.  You'll also find comprehensive statistics about the backtest performance, allowing you to understand how the strategy performed. A key metric value is included for direct comparison against other strategies, and finally, a rank is assigned to show its position relative to the others – the lower the rank, the better the strategy performed.

## Interface IWalkerSchema

The IWalkerSchema helps you set up A/B tests for your trading strategies. Think of it as a recipe that tells backtest-kit how to compare different strategies against each other. 

You give it a unique name so it can be recognized, and an optional note for yourself to remember what it's for.

It specifies which exchange and timeframe to use for all the strategies you're testing. The `strategies` property is a critical list – it tells backtest-kit exactly which strategies you want to compare in your A/B test. 

You can also choose a metric, like Sharpe Ratio, to optimize for, and you can hook into different stages of the walker process using callbacks if you need more control.

## Interface IWalkerResults

The `IWalkerResults` interface holds all the information gathered after running a comparison of different trading strategies. It acts as a central container for the outcome of a backtest walker. You’ll find details like the trading symbol that was tested, the name of the exchange used for the backtest, the specific name of the walker that performed the tests, and the name of the timeframe the strategies were evaluated on. This interface helps organize and access key details about a completed backtesting run.

## Interface IWalkerCallbacks

This interface lets you hook into different stages of the backtest process, providing a way to monitor and react to what's happening behind the scenes. You can get notified when a specific strategy begins testing, and then again when it finishes, receiving important statistics and performance metrics. If a strategy encounters a problem during testing, you’ll also be alerted with details about the error. Finally, when all strategies are done, you'll get a summary of the overall results. These callbacks help you understand, debug, and potentially influence the backtesting workflow.

## Interface ITrailingTakeCommitRow

This interface describes a specific action related to trailing take commit strategies within the backtest kit. Think of it as a record of a single instruction to adjust a trade based on a trailing price. 

It tells the system to perform a "trailing-take" action, which means adjusting a stop-loss or take-profit order to follow the price. The `percentShift` property defines how much the price needs to move before the order is adjusted, expressed as a percentage.  Finally, `currentPrice` remembers the price level when the trailing take commit was originally initiated, providing a reference point for calculations.


## Interface ITrailingStopCommitRow

This interface describes a single action queued for execution within a trailing stop strategy. Think of it as a record of what needs to happen – specifically, a trailing stop adjustment. 

It contains three key pieces of information: the type of action being performed ("trailing-stop"), the percentage shift that needs to be applied to the stop price, and the price at which the trailing stop was initially established. This data allows the backtest system to accurately recreate the trailing stop adjustments as part of the historical simulation.

## Interface IStrategyTickResultWaiting

This interface describes what happens when a trading strategy is patiently waiting for a signal to become active. It's a notification you receive repeatedly while the strategy is monitoring the price to see if it hits the entry point for a pre-planned signal. 

You’ll find key information included, like the name of the strategy and exchange being used, the trading symbol, and the current price being observed.  Importantly, the progress towards take profit and stop loss is always zero at this stage because the position hasn't actually been opened yet. The result also provides the unrealized profit and loss (pnl) figures for this theoretical, pending position, along with whether the data originates from a backtest or a live trading environment and when the notification was generated.

## Interface IStrategyTickResultScheduled

This interface describes what happens when a trading strategy generates a signal and is waiting for the price to reach a specific entry point. It's essentially a notification that a signal has been scheduled and is pending.

The information included tells you which strategy created the signal, the exchange and timeframe it applies to, the trading symbol involved, the current price at the time of scheduling, and whether the event occurred during a backtest or live trading.  You'll also find the detailed signal itself, and the precise moment the event was created, allowing for tracking and analysis of the trading process. This helps you understand the logic flow of your strategy and its behavior as it anticipates price movements.


## Interface IStrategyTickResultOpened

This interface describes what happens when a new trading signal is created within the backtest-kit framework. It's a notification you'll receive whenever a signal has been successfully validated and saved.

You’ll get detailed information about the signal itself, including its generated ID and all the specifics related to its creation – which strategy generated it, the exchange and timeframe it applies to, and the symbol being traded. The current price at the time the signal opened is also included. 

You’ll also know whether this signal opening is part of a backtest or a live trading scenario. Finally, a timestamp indicates exactly when the signal was created, derived from either the candle time during backtesting or the real-time execution context during live trading.


## Interface IStrategyTickResultIdle

This interface describes what happens when a trading strategy is in a quiet, "idle" state – meaning it’s not currently giving any trading signals. It provides key information about the situation at that moment, like the strategy's name, the exchange it's connected to, the timeframe being used (like 1-minute or 5-minute intervals), and the trading pair involved. You'll also find the current price, whether the data is coming from a backtest or live trading, and a timestamp indicating when this idle state was recorded. This information helps you monitor the strategy's activity and understand when it's simply observing the market.

## Interface IStrategyTickResultClosed

This interface represents the data you get when a trading signal is closed, whether automatically or manually. It provides a detailed snapshot of what happened during the closing process.

You'll find the reason for the closure – perhaps it hit a take-profit target, a stop-loss, or simply expired.  The `signal` property holds all the original details of that signal. 

Crucially, it includes the profit and loss (`pnl`) calculation, factoring in fees and slippage. This allows you to analyze the performance of your strategy.

You’ll also see information about the trade, like the final price at which it closed, the strategy and exchange names used, and whether the event occurred during a backtest or live trading. A unique `closeId` is assigned if the signal was closed manually. Finally, the `createdAt` timestamp tells you exactly when this closing event was recorded.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a trading signal that was scheduled to execute gets cancelled. This could happen if the signal wasn't triggered, or if it was stopped before a trade could be opened.

It provides detailed information about the cancellation, including the signal itself, the price at the time of cancellation, and the exact time it occurred. You'll also find details like the strategy and exchange involved, the timeframe used, and whether this was part of a backtest or live trading. 

Crucially, it includes a reason for the cancellation, and an optional ID if the cancellation was initiated manually by a user. Finally, the creation timestamp helps link the event to its origin, whether that's a backtest candle or a live trade execution.

## Interface IStrategyTickResultActive

This data structure represents a situation where a trading strategy is actively monitoring a signal, waiting for a take profit (TP), stop loss (SL), or time expiration. It provides detailed information about the trade currently in progress.

You’ll see details like the strategy’s name, the exchange it's running on, the timeframe being used, and the specific trading pair involved. The `currentPrice` tells you the VWAP price being used to monitor the position.

Crucially, it includes progress indicators as percentages (`percentTp` and `percentSl`) showing how close the position is to hitting either the take profit or stop loss levels. The `pnl` property gives you the unrealized profit and loss, accounting for fees, slippage, and any partial closes. 

There's also a flag indicating if the activity is part of a backtest or a live trade, along with a timestamp of when the data was generated. The `signal` property holds the details of the signal itself.

## Interface IStrategySchema

This schema helps you define and register your trading strategies within the backtest-kit framework. Think of it as a blueprint that tells the system how your strategy generates trading signals and how it should behave.

Each strategy needs a unique name for identification. You can add a note to describe your strategy for documentation purposes.

The `interval` property controls how frequently your strategy can produce signals, preventing it from overwhelming the system.

The core of your strategy is the `getSignal` function, which calculates the signal based on market data. This function can either generate a signal immediately or schedule one to trigger when a specific price level is reached.

You can also hook into key moments in your strategy's lifecycle, like when a position is opened or closed, by providing `callbacks`.

For risk management purposes, you can assign a risk profile identifier or a list of identifiers to your strategy. Finally, you can associate action identifiers to your strategy to define specific actions the strategy will perform.

## Interface IStrategyResult

This interface defines the structure for presenting results when comparing different trading strategies. Each result entry includes the strategy's name so you know which strategy it represents. It also bundles all the detailed backtest statistics into a single `stats` object, giving you a comprehensive view of the strategy's performance. Finally, it provides a `metricValue` – a key number used to rank the strategies based on your optimization goals, and it can be null if the strategy's result is considered invalid.

## Interface IStrategyPnL

This interface, `IStrategyPnL`, neatly packages the results of a trading strategy’s performance. It gives you a clear picture of how much money your strategy made or lost. You'll find the profit and loss expressed as a percentage, making it easy to compare different strategies. 

It also breaks down the pricing: you'll see the entry price and exit price adjusted to account for common trading costs like fees and slippage. Finally, you can see the actual dollar amount of profit or loss, and the total amount of capital that was at risk.

## Interface IStrategyCallbacks

This interface allows you to hook into key moments in a trading strategy’s lifecycle. You can listen for events like when a signal is first opened, when it transitions to an active monitoring state, or when the system is in a period of inactivity.  There are also callbacks for when a signal is closed, scheduled for later entry, or even cancelled.

You can respond to every incoming tick with the `onTick` callback. Specific events like reaching partial profit or loss, breakeven, or scheduled signal pings also trigger dedicated callbacks. The `onWrite` function helps with persisting data for testing, while `onSchedulePing` and `onActivePing` offer opportunities for custom monitoring and dynamic adjustments to your signals even between your strategy's regular intervals. Each callback provides data about the signal, the current price, and whether the event is occurring during a backtest.

## Interface IStrategy

The `IStrategy` interface defines the core methods for how a trading strategy operates within the backtest-kit framework. It’s essentially a blueprint for client strategies.

Here's what you can do with it:

*   **`tick`**: This is the main method that gets called repeatedly with new price data. It handles signal generation, checking for take profit (TP) and stop loss (SL) conditions.
*   **Signal Retrieval**: There are methods for getting both *scheduled* and *pending* signals. Scheduled signals are things like entries that are planned for a specific time. Pending signals represent active positions that you’re monitoring for TP/SL.
*   **Breakeven and Stop Loss Checks**: Methods exist to see if a position has reached breakeven (covered costs) or if the stop loss has been triggered.
*   **Position Status**: You can easily check things like the percentage of a position that's been closed, the total cost basis remaining, and the effective entry price (considering any DCA entries).
*   **Backtesting**: The `backtest` method allows you to quickly run a strategy against historical data.
*   **Controlling a Strategy**:  You have fine-grained control to `stopStrategy` (prevent new signals), `cancelScheduled` (cancel a scheduled entry), `activateScheduled` (force a scheduled entry), or `closePending` (close the current position).
*   **Partial Position Management**: Methods like `partialProfit` and `partialLoss` let you execute partial closes, and there are validation methods (`validatePartialProfit`, `validatePartialLoss`) to check if they're possible.
*   **Trailing Stops & Take Profit**: Methods exist for adjusting trailing stop-loss and take-profit levels, with validation methods (`validateTrailingStop`, `validateTrailingTake`) to ensure the changes are valid.
*   **DCA (Dollar Cost Averaging)**:  `averageBuy` handles adding more entries to a position, and `validateAverageBuy` checks if a new entry is permitted.
*   **Monitoring**: Several methods provide insights into position performance – like highest profit seen, remaining time until expiration, and drawdown.
*   **`dispose`**: This cleans up resources when a strategy is no longer needed.



Essentially, `IStrategy` gives you a structured way to execute and manage a trading strategy, with tools for signal generation, risk management, and performance monitoring.

## Interface IStorageUtils

This interface defines the core functionality needed for any system that wants to store and manage trading signals within the backtest-kit framework. Think of it as a contract; any storage solution – whether it’s a database, a file system, or something else – needs to provide these methods to work with backtest-kit.

It includes methods to react to different signal lifecycle events: when a signal is opened, closed, scheduled, or cancelled.  You'll also find functions for retrieving specific signals by their ID and for getting a list of all signals that are currently stored. Essentially, it gives you the tools to keep track of your trading signals and their status.


## Interface IStorageSignalRowScheduled

This interface represents a signal that's been scheduled for execution. It essentially tells you that a particular trading signal is planned to happen at a future time. The only information it provides is the `status`, which will always be "scheduled" – confirming that the signal is awaiting its scheduled time. Think of it as a flag indicating the signal's current state within the backtest system.

## Interface IStorageSignalRowOpened

This interface represents a signal that has been opened – think of it as a signal that's actively being used in a trade. It's a simple record confirming the signal is in an "opened" state. The `status` property is fixed and always set to "opened", clearly indicating the signal’s current condition. You'll use this when tracking the lifecycle of a signal within your backtesting or trading system.

## Interface IStorageSignalRowClosed

This interface represents a signal that has been closed, meaning it's no longer active. It contains information specific to closed signals, particularly its financial performance. 

The `status` property simply confirms that the signal is indeed in a closed state. 

Crucially, a closed signal includes a `pnl` (profit and loss) value, which details the financial outcome of the trade when it was closed. This allows for analyzing the profitability of the strategy.

## Interface IStorageSignalRowCancelled

This interface represents a signal row that has been cancelled. It's a simple way to mark a signal as no longer active or valid within the backtest-kit framework. The key piece of information it holds is the `status` property, which is always set to "cancelled". Think of it as a flag indicating that the signal's instructions should be ignored moving forward.

## Interface IStorageSignalRowBase

This interface, `IStorageSignalRowBase`, provides a foundation for how signals are stored, regardless of their specific status. It ensures that every signal saved includes important details like when it was created (`createdAt`) and last updated (`updatedAt`), using timestamps derived from the strategy's results.  Each signal also gets a `priority` assigned, which dictates the order in which they're processed when the data is reloaded or rewritten. This priority is typically based on the current time, ensuring live and backtest signals are handled consistently.


## Interface ISizingSchemaKelly

This interface defines how to calculate position sizes using the Kelly Criterion, a method known for aiming to maximize growth rate. When implementing this, you'll specify that you're using the "kelly-criterion" method.  The `kellyMultiplier` property determines how aggressively you apply the Kelly Criterion; a lower number (like the default 0.25) represents a more conservative, "quarter Kelly" approach, while a higher number uses more of the calculated Kelly amount. It's a number between 0 and 1, influencing the size of each trade.

## Interface ISizingSchemaFixedPercentage

This schema defines a simple way to determine trade size: a fixed percentage of your capital is used for each trade. You specify the `method` as "fixed-percentage" to indicate this sizing strategy. The `riskPercentage` property tells the system what percentage of your total capital you're comfortable risking on a single trade, expressed as a number between 0 and 100. For example, a `riskPercentage` of 2.0 means you'll risk 2% of your capital per trade.

## Interface ISizingSchemaBase

This interface defines the basic structure for sizing schemas used within the backtest-kit framework. Every sizing configuration will have a unique name to identify it, along with a space for developers to add notes for clarity.

You’ll also find settings to control position sizing, including limits on the percentage of your account used per trade, and minimum and maximum absolute position sizes. Finally, there's the option to include lifecycle callbacks to customize behavior at different points in the sizing process.


## Interface ISizingSchemaATR

This schema defines how your trading strategy sizes positions using the Average True Range (ATR). It's designed for strategies that want to dynamically adjust their trade size based on market volatility. 

The `method` is always set to "atr-based" to indicate the sizing approach. 

`riskPercentage` controls what portion of your available capital you're willing to risk on each individual trade, expressed as a percentage.  A higher percentage means larger trade sizes, but also greater potential losses.

`atrMultiplier` determines how the ATR value is used to calculate the stop-loss distance, which then influences the position size. A higher multiplier results in wider stops and potentially smaller positions.


## Interface ISizingParamsKelly

The `ISizingParamsKelly` interface helps you configure how much of your capital your trading strategy will risk on each trade when using the Kelly Criterion. It primarily focuses on providing a way to log information during the sizing process, letting you understand what's happening behind the scenes. You'll supply an `ILogger` instance to this interface, which allows your strategy to output debugging information – helpful for troubleshooting and understanding your risk management.

## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed when you want to size your trades using a fixed percentage of your capital. It's used when setting up how much of your available funds will be used for each trade. 

You'll need to provide a logger, which helps you track and debug what's happening as the trading system runs. The logger allows you to see informational messages and potential errors, making it easier to understand the sizing decisions being made.

## Interface ISizingParamsATR

This interface defines the settings you can use when determining how much to trade based on the Average True Range (ATR) indicator. It lets you control how the ATR is used to calculate your position size. You’ll provide a logger to help with debugging and monitoring your trading strategy. The logger allows you to see what's happening behind the scenes and troubleshoot any issues.

## Interface ISizingCallbacks

This interface provides a way to hook into the sizing process within the backtest-kit framework. Specifically, the `onCalculate` callback lets you observe and potentially influence how position sizes are determined. It’s triggered after the framework calculates a potential trade size, giving you a chance to log the result, perform checks to ensure it aligns with your strategy's rules, or even modify the size if needed. You’ll receive the calculated quantity and a set of parameters used in the calculation, allowing you to fully understand the context of the sizing decision.

## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate your trade size using the Kelly Criterion. It allows you to specify how the sizing is being done - in this case, using the Kelly Criterion formula. You’ll also need to provide your estimated win rate, represented as a number between 0 and 1, and your average win/loss ratio, which tells the framework how much you typically win compared to how much you lose on a trade. These values are crucial for the Kelly Criterion to determine an appropriate bet size.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the information needed to calculate the size of a trade using a fixed percentage of your account balance. 

It's quite straightforward – you’ll specify the sizing method as "fixed-percentage" and provide the price at which you'll place a stop-loss order. The stop-loss price is a crucial element in determining the risk associated with the trade and influences the size calculation. Essentially, this helps the backtest kit determine how much of your capital should be allocated to the trade based on the stop-loss level.

## Interface ISizingCalculateParamsBase

This interface defines the basic information needed for calculating the size of a trade. Every sizing calculation, whether it's determining how much to buy or sell, will require details about the trading pair – its symbol, like "BTCUSDT".  You'll also need to know the current balance of your account and the intended entry price for the trade. Think of it as the foundational data to build upon when deciding how much capital to allocate to a position.

## Interface ISizingCalculateParamsATR

This interface defines the settings used when determining how much to trade based on the Average True Range (ATR). When using ATR-based sizing, you'll need to specify that you're using the "atr-based" method. You'll also provide the current ATR value, which is a key input for the sizing calculation. Essentially, it allows you to tailor your trade size to the current market volatility as measured by the ATR.

## Interface ISizing

The `ISizing` interface is the core of how backtest-kit determines how much of an asset your strategy will trade. Think of it as the brains behind your position sizing logic. It's used internally during the backtesting process.

The key part is the `calculate` method. This method takes a set of parameters describing the current trading situation (like risk tolerance, account size, and price) and returns a promise that resolves to the size of the position the strategy should take. You’ll implement this method to define your specific sizing rules.

## Interface ISignalRow

This interface represents a complete signal within the backtest-kit framework, containing all the necessary information for execution and analysis. Each signal is assigned a unique identifier (`id`) for tracking purposes.

It holds details about the trade itself, including the `cost` of the position, the `priceOpen` at which it was entered, and the identifiers of the `exchangeName`, `strategyName`, and the `frameName` (which is empty in live trading mode).  You’ll also find the `scheduledAt` timestamp, noting when the signal was initially created, and the `pendingAt` timestamp, indicating when the position became active.  The `symbol` specifies the trading pair, like "BTCUSDT".

A flag, `_isScheduled`, marks signals that were scheduled in advance.  Partial closing history is tracked in `_partial`, which is essential for accurate Profit and Loss (PNL) calculations using weighted averages.  The framework manages trailing stop-loss and take-profit prices with `_trailingPriceStopLoss` and `_trailingPriceTakeProfit` respectively; these automatically adjust based on the strategy's settings.

For positions built with Dollar Cost Averaging (DCA), a history of entry prices is stored in `_entry`. The `_peak` property tracks the best performance price for the position, updated as the price moves towards the take-profit target. Finally, `timestamp` reflects when the signal was created within the backtesting or live environment.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, the information used to initiate a trade. When you request a signal, this object will be returned, containing details about the intended trade. 

It includes things like the trade direction (whether to buy or sell), a description of why the signal was generated, the entry price, and target prices for take profit and stop loss.

You'll also find information about the expected duration of the trade and the cost associated with entering that position.  A unique ID will be automatically created for each signal if you don't provide one.

Important: Take profit prices should be higher than the entry price for long positions, and lower for short positions. Stop loss prices should be lower for long positions and higher for short positions.

## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, describes a signal that's set to execute when the market price reaches a specific level. Think of it as a signal that's "on hold" waiting for a particular price to be triggered. It builds upon the basic `ISignalRow` and represents a signal that’s patiently waiting for the price to hit a target.

Once the price does reach that target, it transforms into a regular signal and the pending time is adjusted to reflect when it actually started waiting.  The `priceOpen` property defines the price level the market needs to reach before the signal activates.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled signal that might be canceled by the user. It builds upon the standard scheduled signal information by adding a `cancelId`. Think of `cancelId` as a unique identifier that lets you track and potentially manage user-initiated cancellations of a particular signal. It's essentially how the system knows a signal was canceled directly by you, rather than by some automated process.

## Interface IRiskValidationPayload

This data structure holds all the information needed for risk validation checks. It combines the typical signal data you'd expect with details about your overall portfolio state. You'll find the current trading signal being considered, along with the total number of active positions and a list of those positions, providing a complete picture for assessing risk. Essentially, it's a snapshot of what's happening in your backtest to allow for informed risk management decisions.

## Interface IRiskValidationFn

This type defines a function used to check if a trading decision is safe to execute. Think of it as a gatekeeper – it examines the proposed trade and decides whether it's acceptable based on your risk rules. If the trade passes the check, the function does nothing. If it fails, it either returns a specific rejection reason or throws an error, allowing the system to halt the trade and provide feedback. Essentially, it’s how you enforce your risk management policies within the backtesting process.

## Interface IRiskValidation

This interface helps you set up checks to ensure your trading risks are within acceptable boundaries. Think of it as defining rules to make sure your trades aren't too risky.

You provide a function, `validate`, that actually performs the risk assessment – it’s the core of your validation logic. 

Alongside this, you can add a `note` to explain what the validation is doing and why. This is useful for documenting your risk management process and making it easier for others to understand.

## Interface IRiskSignalRow

This interface, `IRiskSignalRow`, helps manage risk during trading by providing key information about a position. It builds upon the standard signal data and adds details crucial for risk assessment. Specifically, you'll find the entry price (`priceOpen`), the initially set stop-loss price (`originalPriceStopLoss`), and the original take-profit price (`originalPriceTakeProfit`). This data is valuable when validating risk parameters and ensuring trades adhere to predefined safety measures.

## Interface IRiskSchema

This interface, `IRiskSchema`, lets you create custom risk profiles for your trading backtests. Think of it as a way to define rules and checks that your portfolio must follow.

You give each profile a unique `riskName` to identify it. You can also add a `note` to explain what the profile is for – helpful for other developers or for your own reference later.

You can optionally include `callbacks` to be notified when a trade is rejected or allowed based on your risk rules.

The most important part is the `validations` array. This is where you put your actual risk-checking logic, using either pre-built functions or writing your own custom validation functions to enforce your desired constraints.

## Interface IRiskRejectionResult

This interface, `IRiskRejectionResult`, helps you understand why a trading strategy's risk parameters didn't pass validation. When a risk check fails, this object is returned to provide details about the issue. You’ll find a unique `id` to track the specific rejection, and a `note` which explains, in plain language, the reason for the failure. Think of it as a helpful message pinpointing what needs to be adjusted to meet the required risk constraints.

## Interface IRiskParams

This interface, `IRiskParams`, outlines the essential configuration settings when setting up a risk management system. Think of it as the blueprint for how your risk checks will operate. 

You'll specify the `exchangeName` your system is connected to, like "binance" or "coinbase."  A `logger` is also provided so you can track and debug what’s happening behind the scenes.  The `backtest` flag tells the system whether it's running in a simulated environment or live trading mode.

Finally, the `onRejected` callback gives you a chance to react when a trading signal is blocked by risk limits—a place to emit events or log detailed information about why the trade was rejected.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, provides the necessary information for a risk check. It's used to determine whether a new trade should be allowed *before* a trading signal is actually generated. Think of it as a gatekeeper, validating conditions based on the current state of the system.

The arguments passed include details like the trading symbol, the signal being considered, the name of the strategy requesting the trade, and the exchange being used. You'll also find information on the risk profile involved, the timeframe being used, the current price, and the current timestamp. All these pieces help ensure the risk check can accurately assess whether the proposed trade aligns with defined risk management rules.

## Interface IRiskCallbacks

This interface lets you hook into risk management decisions made by backtest-kit. You can provide functions to be notified when a trade signal is blocked because it exceeds risk limits, and also when a signal is approved to proceed. These callbacks, `onRejected` and `onAllowed`, give you visibility into why certain trades are happening (or not happening) based on your defined risk rules. This can be useful for monitoring, logging, or even adjusting your risk parameters dynamically. Essentially, they're a way to receive updates about the outcome of risk checks for each trading symbol.

## Interface IRiskActivePosition

This interface describes a single, active trade that's being monitored for risk assessment. It allows different trading strategies to be analyzed together, giving a broader view of overall risk exposure. 

Each `IRiskActivePosition` represents a specific trade, outlining details like which strategy created it, what exchange it's on, and the trading symbol (like "BTCUSDT"). You’ll find information about the position’s direction (long or short), the entry price, and any stop-loss or take-profit levels set. 

It also tracks how long the position is expected to last and the exact time it was initially opened, providing a complete snapshot of the trade's setup and history.

## Interface IRisk

This interface, `IRisk`, helps manage and control the risk involved in your trading strategies. It's the core of ensuring your trades stay within defined boundaries.

You’ll use `checkSignal` to see if a potential trade is safe to execute, based on pre-set risk parameters.

`addSignal` is used to record when a new position is opened—think of it as letting the system know a trade is active. 

And `removeSignal` lets the system know when a trade has closed, keeping track of your open positions. Essentially, it’s a way to monitor and limit potential losses while trading.

## Interface IReportTarget

The `IReportTarget` interface lets you fine-tune what data gets recorded during your backtesting or live trading. Think of it as a way to control the level of detail in your logs.

You can selectively enable logging for specific events, such as when a strategy makes a decision, when a risk check happens, or when a trade reaches a breakeven point.

This interface gives you control over areas like performance data, scheduled signals, live trading activity, and synchronization of signals. 

By toggling each property (like `strategy`, `risk`, `breakeven`, etc.) to `true` or `false`, you decide precisely which types of events will be included in your JSONL event logs.

## Interface IReportDumpOptions

This interface, `IReportDumpOptions`, acts like a little container holding important details about a trading backtest. Think of it as a way to tag and organize the data generated during a backtest run. It includes things like the trading pair being used (like BTCUSDT), the name of the trading strategy, which exchange was involved, the timeframe of the data, a unique ID for any signals used, and a name for the walker if optimization was performed. By providing these details, you can easily filter and search through your backtest results later on, making it simpler to analyze and compare different strategies and configurations.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, gives you a clear view of a trading signal's key details, especially regarding stop-loss and take-profit levels. It builds upon the basic signal information by including the original stop-loss and take-profit prices that were set when the signal was initially created. 

Even if those stop-loss and take-profit levels are adjusted later, perhaps through a trailing stop mechanism, you'll always know what the original values were. This transparency is really helpful for understanding how the trade has evolved and for creating clear reports or user interfaces.

Beyond that, you’ll find information about the cost of getting into the position, how much of it has been closed through partial executions, the number of entries made (helpful for understanding if it's a simple entry or a DCA strategy), and the initial entry price. It also includes the current unrealized profit or loss at the time the signal was generated.

## Interface IPublicCandleData

This interface defines the standard structure for candlestick data used within the backtest-kit framework. Each candle represents a specific time period and contains key information about the price action during that time. You'll find properties like `timestamp` indicating when the candle began, the `open`, `high`, `low`, and `close` prices, and the `volume` of trades that occurred. Essentially, it provides a consistent way to represent historical price and volume data for analysis and backtesting.

## Interface IPositionSizeKellyParams

This interface, `IPositionSizeKellyParams`, helps you calculate position sizes using the Kelly Criterion. Think of it as a way to determine how much of your capital to risk based on your expected win rate and the average size of your wins compared to your losses. You'll provide two key pieces of information: `winRate`, which represents the percentage of time you expect to be profitable, and `winLossRatio`, reflecting how much you typically win for each loss. These parameters will then be used to calculate an appropriate position size.

## Interface IPositionSizeFixedPercentageParams

This interface defines the parameters needed for a trading strategy that uses a fixed percentage of your capital to determine the size of each trade. It's particularly useful when you want to maintain a consistent risk level with every trade. 

The `priceStopLoss` property specifies the price at which you'll place a stop-loss order, helping to limit potential losses on the trade. Essentially, it's the price point where you'll automatically exit the position if the market moves against you.

## Interface IPositionSizeATRParams

This interface defines the settings you'll use when calculating your position size based on the Average True Range (ATR). Specifically, it holds the current ATR value which is a key input for determining how much capital to allocate to a trade. Think of it as telling the system how volatile the market is, impacting your position sizing accordingly.

## Interface IPositionOverlapLadder

The `IPositionOverlapLadder` interface helps you define how to identify overlapping positions when using a dollar-cost averaging (DCA) strategy. Think of it as setting boundaries around each DCA level to check for potential conflicts. 

It has two key settings: `upperPercent` and `lowerPercent`. 

`upperPercent` controls how much above each DCA level is considered an overlap – for example, if you set it to 5%, anything 5% higher than a DCA price is flagged.  

`lowerPercent` does the opposite, defining how much below each DCA level is also considered an overlap. This lets you customize the sensitivity of your overlap detection. Both percentages are expressed as values between 0 and 100.

## Interface IPersistBase

This interface outlines the basic functions needed for any system that wants to store and retrieve data, like saving trading results or configuration. Think of it as a contract: if you build a custom storage solution (like a database or file system), you need to provide ways to initialize it, read data, check if data exists, write data, and list all the data keys.  The `waitForInit` function sets things up initially, ensuring everything's ready to go. `readValue` and `hasValue` let you grab and check for specific pieces of data, while `writeValue` handles saving new or updated information. Finally, `keys` provides a way to see a list of everything stored, organized alphabetically.

## Interface IPartialProfitCommitRow

This interface describes a request to take a partial profit on a trade. It's used when the backtest kit is scheduling actions to manage your trading strategy. Each request includes information about how much of the position to close, expressed as a percentage, and the price at which that partial close was executed. Think of it as a record of one specific step in taking profits along the way.

## Interface IPartialLossCommitRow

This interface represents a request to close a portion of your trading position. Think of it as telling the backtest system, "I want to sell a certain percentage of my holdings." 

It includes the action type, which will always be "partial-loss," the percentage of the position you wish to close (represented as a number), and the price at which that partial closing occurred.  Essentially, it's a record of a partial sell order being processed.

## Interface IPartialData

This interface, `IPartialData`, helps us save and load important data about a trading signal. Think of it as a snapshot of key information needed to resume a backtest later. It specifically stores the profit and loss levels that have been hit during a trade, turning them into arrays so they can be easily saved as JSON. This allows the backtest framework to remember where a signal was when it was paused and pick up right where it left off.

## Interface IPartial

The `IPartial` interface helps track how well trading signals are performing, specifically focusing on profit and loss milestones. It's used by the system to keep tabs on signals and alert when they hit key levels like 10%, 20%, or 30% profit or loss. 

When a signal is generating profits, the `profit` method calculates progress and sends out notifications for newly reached profit levels, avoiding duplicate alerts. Similarly, the `loss` method handles signals experiencing losses, recognizing and reporting new loss levels as they're encountered. 

Finally, when a trading signal is closed – whether it hits a take-profit, stop-loss, or expiration – the `clear` method cleans up the tracked data, removing it from active memory and saving any necessary updates.

## Interface IParseArgsResult

This interface describes the result you get when you parse command-line arguments for your trading bot. It essentially tells you which mode your bot is operating in. 

You'll see flags like `backtest`, `paper`, and `live`.

`backtest` is true if you're running a simulation using historical data. `paper` means you're trading with simulated money but using live market data. And `live` indicates you're actively trading with real funds.

## Interface IParseArgsParams

This interface, `IParseArgsParams`, outlines the information needed to run a trading strategy. Think of it as a blueprint for what the backtest-kit expects when you're providing instructions from the command line. It specifies details like which cryptocurrency pair you’re trading (the `symbol`), the name of the specific trading strategy you want to use (`strategyName`), which exchange you’re connecting to (`exchangeName`), and the timeframe of the data the strategy will analyze (`frameName`). It helps ensure everything is set up correctly before the backtesting process begins.

## Interface IOrderBookData

This interface describes the structure of order book data, which is essential for understanding market depth and price levels. It holds information about the bids and asks currently available. The `symbol` property identifies the trading pair, like "BTCUSDT." The `bids` array contains details about all the buy orders, and the `asks` array holds information about all the sell orders. Each of these arrays uses the `IBidData` type to represent individual bid or ask orders.

## Interface INotificationUtils

This interface outlines the fundamental actions that any system responsible for sending notifications – like emails, messages, or logs – needs to support within the backtest-kit framework. It provides a set of methods for handling different types of events that occur during a trading simulation. 

These events include signals being generated (trades opening, closing, or being paused), notifications about partial profit or loss opportunities becoming available, and updates related to strategy settings.  You’ll also find methods to manage synchronization, risk rejections, various errors, and to retrieve or clear a list of all notifications that have been generated.  Essentially, it's the foundation for building any notification system to keep you informed about what's happening during your backtests.

## Interface IMethodContext

The `IMethodContext` interface is like a little guide for your backtesting code, telling it exactly which configuration to use. Think of it as a set of instructions that helps the framework find the right strategy, exchange, and historical data frame for your tests. It contains the names of these components – the exchange name, the strategy name, and the frame name – so everything works together seamlessly. If you're running a live simulation, the frame name will be empty, signaling that it's not using historical data.

## Interface IMarkdownTarget

This interface lets you pick and choose which reports you want to generate when running backtests. Think of it as a way to customize the level of detail you see in your trading analysis.

You can turn on reports for specific events like when your strategy sends buy or sell signals, when trades are blocked by risk rules, or when your stop-loss order moves to your entry price.

It also includes options to track portfolio heatmaps, compare different strategies, analyze performance bottlenecks, and monitor scheduled signals.

Want to see everything that happens during a live trade? You can enable live trading reports. Or, if you just want the main results and trade history, the backtest report is your go-to. Finally, you can get reports about the synchronization of signals.

There’s a setting for almost every aspect of your trading activity, allowing you to focus on the data most important to your analysis.

## Interface IMarkdownDumpOptions

This interface, `IMarkdownDumpOptions`, helps organize information when generating documentation or reports. Think of it as a container holding key details about a specific backtest run, like which trading pair was involved ("BTCUSDT"), the name of the strategy used, and the timeframe analyzed. It includes the path where the report should be saved, the specific file name to create, and unique identifiers for the signal and strategy.  Essentially, it provides a structured way to track and label all the important pieces of a backtest.

## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework can record information about what's happening. Think of it as a central place to keep track of events, errors, and important details.

It gives you several ways to log messages, categorized by their importance. You can use `log` for general notes, `debug` for very detailed information useful when you're troubleshooting, `info` for important updates like successful actions, and `warn` to highlight potential issues that need a second look. These logs help you understand how the system is behaving, find and fix problems, and keep an audit trail of events.

## Interface ILogEntry

This interface defines what a single log entry looks like within the backtest-kit framework. Each log entry has a unique ID, a level (like "log," "debug," or "info"), and a timestamp to help track when it occurred. 

It also includes useful contextual information, such as the method where the log originated (`methodContext`), details about the execution environment (`executionContext`), a topic describing what's being logged, and any additional arguments passed with the log message. Think of it as a structured way to capture all the relevant details of a logging event during your backtesting process.

## Interface ILog

The `ILog` interface gives you a way to keep track of what's happening during your backtesting or trading simulations. It extends the standard logging capabilities, allowing you to retrieve a complete history of all the log messages generated. The `getList` method is the key here; it's how you fetch all those stored log entries so you can analyze them, debug issues, or just understand the flow of events. This is useful for detailed post-trade analysis.

## Interface IHeatmapRow

This interface represents a single row of data for a portfolio heatmap, giving you a quick view of how a particular trading pair performed. It bundles together key performance indicators like total profit and loss, risk metrics like Sharpe Ratio and maximum drawdown, and trading activity statistics. You'll find information about the total number of trades, how many were wins versus losses, and calculated values like win rate and average profit/loss per trade. The data includes insights into streaks of wins and losses, and an expectancy calculation to help assess overall profitability. Essentially, it’s a snapshot of a symbol's trading history, distilled into a manageable set of numbers.

## Interface IFrameSchema

The `IFrameschema` is how you define the time periods your backtest will analyze. Think of it as setting the scope of your historical data.  Each schema has a unique name to identify it, and you can add a note for yourself to explain its purpose. 

Crucially, you specify the data interval – like daily, hourly, or minute-by-minute – which dictates how timestamps are generated. You also clearly mark the beginning (`startDate`) and end (`endDate`) dates of the backtesting period. 

Finally, you can optionally attach special functions (`callbacks`) that run at different points in the frame's lifecycle, allowing for custom logic during the backtest process.

## Interface IFrameParams

The `IFrameParams` interface defines the information needed when setting up a core component within the backtest-kit framework. Think of it as a configuration object. It builds upon `IFrameSchema` and crucially includes a `logger`. 

This `logger` property is your tool for tracking what's happening inside the framework - it’s how you’ll get helpful debugging information to diagnose any issues. Providing a logger allows you to monitor the framework's internal operations.

## Interface IFrameCallbacks

This section describes functions that get called at specific points in the backtest process, allowing you to observe and react to what's happening. The `onTimeframe` function, for example, is triggered once the timeframe data has been created. You can use it to check if the timeframe setup looks correct or to simply keep a record of the time periods being used for the backtest. It receives information about the timeframe array itself, the start and end dates, and the interval used to create them.

## Interface IFrame

The `IFrame` interface is a key part of how backtest-kit manages time. Think of it as the engine that creates the timeline for your trading simulations. 

Specifically, the `getTimeframe` function is what actually builds this timeline. You give it a symbol (like 'AAPL') and a timeframe name (like 'daily'), and it returns an array of dates – these are the exact points in time your backtest will analyze. The dates are spaced out based on the timeframe’s interval, ensuring consistent data points for your strategies. This function is handled under the hood to orchestrate the backtesting process.

## Interface IExecutionContext

This interface represents the environment in which your trading strategies and exchange interactions operate. Think of it as the current state of the trading process.

It carries vital information, such as the trading symbol – like "BTCUSDT" – which identifies the specific asset being traded. It also keeps track of the current timestamp, indicating when an event or operation occurred.  Finally, it indicates whether the system is in backtest mode, allowing you to test strategies against historical data, or in a live trading environment. This context is automatically provided during various operations like fetching historical data or processing real-time market updates.

## Interface IExchangeSchema

This interface describes how backtest-kit connects to and interacts with a cryptocurrency exchange. Think of it as a blueprint for defining a data source.

The `exchangeName` is a unique identifier for the exchange you're using within the backtest framework.  A `note` field lets you add helpful comments for yourself or other developers.

The core functionality comes from `getCandles`, which is responsible for retrieving historical price data (candlesticks) from the exchange – whether that’s an API or a database.  `formatQuantity` and `formatPrice` handle the exchange-specific rules for how to correctly represent trade sizes and prices, ensuring they align with the exchange's precision.  If you don't provide these, the system will use a default precision.

Beyond basic price data, you can optionally implement `getOrderBook` to fetch order book information and `getAggregatedTrades` to retrieve trade history. If these functions aren't defined, attempting to use them will result in an error.

Finally, `callbacks` allows you to hook into specific lifecycle events related to candle data, giving you more control over the process.

## Interface IExchangeParams

This interface, `IExchangeParams`, defines the essential configuration needed to connect to and interact with a cryptocurrency exchange within the backtest-kit framework. It’s essentially a blueprint for how the system understands your exchange.

You'll provide a logger to help with debugging and tracking what's happening during backtesting. Crucially, it includes an execution context, which holds important details like the trading symbol, the trading time, and whether you’re running a backtest or a live trade.

The core functionality revolves around fetching market data. You need to supply functions to retrieve historical candles (price data over time), format quantities and prices to match the exchange's rules, access the order book (current buy and sell orders), and obtain aggregated trade data. All these functions are mandatory, though sensible default values are applied if you're experimenting.

## Interface IExchangeCallbacks

This interface lets you define functions that your backtest kit application can use to respond to incoming candle data from an exchange. The `onCandleData` function is the core of this – it's triggered whenever the backtest kit gets new candlestick data for a specific trading symbol and timeframe.  You can use this to update your UI, log data, or perform other actions as new data arrives. The function receives the symbol, the time interval (like 1 minute or 1 day), a timestamp indicating when the data started, the number of candles requested, and an array containing the actual candle data. You can either define a regular function or a function that returns a promise.

## Interface IExchange

The `IExchange` interface defines how backtest-kit interacts with different cryptocurrency exchanges. It provides essential functions for retrieving historical and future price data, calculating VWAP (volume-weighted average price), and formatting order quantities and prices to match the exchange's specific rules.  You can fetch candles to analyze past price movements, or look ahead to see simulated future candles for backtesting purposes.

The framework allows you to get the order book to understand current market depth, or retrieve aggregated trades to see recent trading activity.  A powerful feature lets you fetch raw candle data with a lot of control, allowing you to specify a date range or simply a number of candles to retrieve, all while ensuring the data respects the backtesting environment and avoids looking into the future.  This means you can pull historical data for analysis and replay historical events accurately.

## Interface IEntity

This interface, `IEntity`, serves as the foundation for all objects that are saved and retrieved from storage within the backtest-kit framework. Think of it as a common blueprint, ensuring all persistent data structures share a basic structure. It's the starting point if you're defining your own custom data types to be used in your trading simulations and analysis.

## Interface ICommitRowBase

This interface, `ICommitRowBase`, is the foundation for how backtest-kit handles updates and actions during a simulation or live trading session. Think of it as a container for basic information about a commit event, like a trade or order adjustment. It ensures that these changes are processed at the right time, even if things are happening quickly. 

Each commit event includes the trading symbol involved, like "BTCUSDT," and a flag to indicate whether the backtest is running in a historical simulation or in live trading mode. This simple structure helps organize and manage trading actions.


## Interface ICheckCandlesParams

This interface defines the information needed to check the timestamps of your historical candle data. Think of it as a set of instructions for verifying that your price data is correct and complete. You'll need to provide the trading symbol like "BTCUSDT", the name of the exchange where you got the data, the time interval of the candles (such as 1-minute or 4-hour), and the start and end dates you want to check.  Finally, it specifies where the candle data files are stored on your computer – you can accept the default location or specify a different path.

## Interface ICandleData

This interface, `ICandleData`, represents a single candlestick, which is a standard way to visualize price movements over time. Each candlestick contains key information about a specific time window, including when it began (`timestamp`), the price when it opened (`open`), the highest and lowest prices reached (`high`, `low`), the price when it closed (`close`), and the amount of trading activity (`volume`). It’s the basic building block for analyzing price history, useful for things like calculating volume-weighted average prices or running backtests of trading strategies. Think of it as a snapshot of market activity during a defined period.


## Interface ICacheCandlesParams

This interface defines the information needed to pre-load historical price data, also known as candles, into persistent storage. Think of it as a blueprint for requesting a chunk of historical data for a specific trading pair, exchange, and time frame. You’ll use this when you want to ensure you have enough historical data available *before* you start running a backtest.  It includes details like the trading symbol (like BTCUSDT), which exchange the data comes from, the candle interval (like 1-minute candles or 4-hour candles), and the start and end dates for the data you’re requesting.

## Interface IBroker

This interface, `IBroker`, defines the contract a trading framework uses to communicate with a broker or exchange. It establishes a set of actions the framework will request from the broker.

The `waitForInit` method is the first step – it makes sure the broker connection is ready before anything else happens.

Then, several `on...Commit` methods represent actions the framework will ask the broker to perform.  These actions include closing existing positions (`onSignalCloseCommit`), opening new positions (`onSignalOpenCommit`), and managing existing trades. You'll see functions for adjusting partial profits (`onPartialProfitCommit`), limiting losses (`onPartialLossCommit`), setting trailing stops (`onTrailingStopCommit`), taking trailing profits (`onTrailingTakeCommit`), setting breakeven points (`onBreakevenCommit`), and implementing average buy strategies (`onAverageBuyCommit`).  Each of these functions receives a payload containing the specific details for the action.

## Interface IBreakevenData

This interface, `IBreakevenData`, is a simple way to store information about whether a breakeven point has been achieved for a particular trading signal. Think of it as a snapshot of the breakeven status that can be easily saved and loaded. It's used to keep track of this status persistently, meaning it survives restarts or data refreshes.

The key piece of information it holds is `reached`, a simple `true` or `false` value indicating if the breakeven has been reached. This makes it easy to serialize the data into a format like JSON for storage. When this data is loaded back, it's then transformed into a more complete `IBreakevenState`.

## Interface IBreakevenCommitRow

This interface represents a single entry in a queue of breakeven actions. Think of it as a record of when the system needs to adjust a trade's breakeven point. 

It includes two key pieces of information: an action type, always indicating "breakeven" for this specific row, and the current price of the asset at the time the breakeven adjustment was triggered. This current price is essential for calculating the new breakeven level. Essentially, it's a notification to recalculate the trade's profitability target.

## Interface IBreakeven

This interface helps keep track of when a trade's stop-loss should be adjusted to breakeven, essentially protecting your initial investment. It’s used by components that manage trading signals and their associated actions.

The `check` method is the core of this functionality - it determines if the price has moved favorably enough to justify moving the stop-loss to the entry price, taking into account any transaction costs. Think of it as confirming that you've made enough profit to cover fees and still be safe.

Conversely, the `clear` method resets the breakeven status when a signal is closed, whether it's hit a take-profit or stop-loss target, or expired. It cleans up the system and prepares it for the next signal.

## Interface IBidData

This interface describes a single bid or ask price point within an order book. It represents a specific price and the amount of an asset being offered or wanted at that price. The `price` property holds the price level as a string, and the `quantity` property indicates how much of the asset is available at that price, also represented as a string. Think of it as a snapshot of one line in an order book.

## Interface IAverageBuyCommitRow

This interface represents a single step in a recurring average-buy strategy, often called a Dollar-Cost Averaging (DCA) plan.  Each time the strategy executes a buy, this record is created. It details the price at which the buy occurred, the cost of that particular purchase in US dollars, and the running total of how many buy entries have been made overall. Think of it as a snapshot of a single buy within a larger DCA plan, keeping track of progress and cost.

## Interface IAggregatedTradeData

This data structure holds information about a single trade. Each trade is identified by a unique ID and includes the price at which it happened, the quantity of assets involved, and the exact time it took place. A key piece of information is whether the buyer initiated the trade as the market maker, which helps understand the direction of the trade within the market. This provides a detailed view of trading activity for analysis and backtesting purposes.

## Interface IActivateScheduledCommitRow

This interface describes a message used to trigger the activation of a scheduled commit within the backtest-kit framework. It's essentially a notification telling the system to put a specific scheduled commit into action. 

The message identifies the action being performed as "activate-scheduled."  It also includes the unique ID of the signal related to this scheduled commit, and optionally an activation ID if the activation was started by a user. Think of it as a targeted instruction to the system to execute a pre-planned trading step.

## Interface IActionSchema

This defines a blueprint for creating custom actions that can be added to your trading strategies. Think of actions as little helpers that react to events happening within your strategy, letting you do things like log activity, send notifications, or integrate with external systems. 

Each action has a unique name for identification, a note for developers to understand its purpose, and a handler – essentially the code that runs when the action is triggered.  You can also define optional callbacks to control how the action behaves at different stages, like when it's initialized or when events occur. Multiple actions can be attached to a strategy, giving you a lot of flexibility in extending its functionality.

## Interface IActionParams

This interface, `IActionParams`, bundles together everything an action needs to run smoothly within the backtest-kit framework. Think of it as a package containing vital information – a logging tool to help track what’s happening, identifiers for the strategy and timeframe it belongs to, and details about the exchange being used.  Crucially, it also indicates whether the action is being executed as part of a backtest simulation. The `logger` property gives you a way to record information for debugging or monitoring, while `strategyName` and `frameName` tell you where this action fits within the larger trading strategy. You'll also find the `exchangeName` and a flag, `backtest`, to signify if the system is running a test.

## Interface IActionCallbacks

This interface, `IActionCallbacks`, provides a way to hook into different stages of your trading actions, allowing you to customize behavior and handle events. Think of it as a set of customizable event listeners for your trading logic. You can use these callbacks to manage resources, log activity, or even influence how trades are executed.

Here's a breakdown of what each callback does:

*   `onInit`: This runs when an action handler starts up.  Good for setting up things like database connections or loading any necessary data.
*   `onDispose`:  This callback fires when the action handler is shut down. Use it to clean up resources, save data, or unsubscribe from anything you set up in `onInit`.
*   `onSignal`:  A general-purpose event that’s triggered every time a signal is generated, whether you’re backtesting or live trading.
*   `onSignalLive`:  Specifically triggered for live trading signals.
*   `onSignalBacktest`: Specifically triggered during backtesting.
*   `onBreakevenAvailable`:  Notifies you when the breakeven point of a trade is reached.
*   `onPartialProfitAvailable`: Informs you when a partial profit level is hit.
*   `onPartialLossAvailable`:  Alerts you when a partial loss level is triggered.
*   `onPingScheduled`:  Called periodically while a signal is waiting to be activated (e.g., a pending order).
*   `onPingActive`:  Called periodically while a position is active.
*   `onRiskRejection`:  Notifies you when a trading signal is rejected by your risk management system.
*   `onSignalSync`: A special callback that lets you directly influence whether a limit order is placed or a position is closed. You have the power to reject the action, and the framework will try again on the next tick, offering a crucial control point for complex trading scenarios.  Be careful with this one because errors aren't automatically handled.

## Interface IAction

The `IAction` interface is designed to help you connect your trading framework to external systems and manage events as they happen. Think of it as a central hub for reacting to what's going on in your backtest or live trading environment.

You can use this interface to do a bunch of things, like sending data to your Redux store, logging events, building real-time dashboards, or tracking analytics.

The interface defines several methods, each responding to a specific event:

*   `signal`: This is the main event handler, triggered for every tick or candle during both backtesting and live trading.
*   `signalLive`: Specifically for live trading signals.
*   `signalBacktest`: Specifically for backtesting signals.
*   `breakevenAvailable`: Notified when your stop-loss reaches your entry price.
*   `partialProfitAvailable`: Alerts you when you hit a pre-defined partial profit level.
*   `partialLossAvailable`: Alerts you when you hit a pre-defined partial loss level.
*   `pingScheduled`: Informs you when a signal is waiting to be activated on a schedule.
*   `pingActive`: Informs you when a pending signal is actively being monitored.
*   `riskRejection`:  Notifies you when a signal is rejected due to risk validation.
*   `signalSync`:  This is important for handling situations where the framework attempts to open or close a position with a limit order. If you throw an error here, the framework will retry later.
*   `dispose`: A cleanup method you should implement to release any resources and cancel subscriptions when you're finished using the action handler. This ensures you don't have lingering connections or unnecessary data processing.

## Interface HighestProfitStatisticsModel

This model holds information about the most profitable trading events recorded during a backtest. It essentially provides a snapshot of the best performing moments. You'll find a complete, ordered list of these profitable events in the `eventList` property, presented from the most recent to the oldest.  The `totalEvents` property simply tells you how many profitable events were captured in total.

## Interface HighestProfitEvent

This data represents the moment a position achieved its highest profit during a trading simulation or live trade. It tells you exactly when, which asset (symbol), and which strategy was involved. You’ll find details like the signal ID that triggered the trade, whether it was a long or short position, and the price at which the peak profit was reached.  It also includes the initial entry price, take profit level, and stop loss, providing a full snapshot of the trade's parameters at the time of maximum profit. Finally, it indicates if this event occurred during a backtesting run.

## Interface HighestProfitContract

The HighestProfitContract helps you track and react to when a trading position reaches a new peak profit. It provides key details about that moment, including the symbol being traded, the current price, and the precise timestamp. 

You’ll also get information about which strategy, exchange, and timeframe were in play when the profit was achieved, along with the signal that triggered the trade. 

Importantly, there's a flag indicating whether this profit milestone occurred during a backtest or in live trading, allowing you to tailor your response accordingly. This is perfect for setting up automated actions like trailing stops or taking partial profits as your positions perform well.


## Interface HeatmapStatisticsModel

This structure holds all the summarized data you’d see on a portfolio heatmap. Think of it as a consolidated view of how your entire portfolio is performing.

It breaks down your portfolio's performance into key figures like the total profit and loss across all assets, the Sharpe Ratio which gauges risk-adjusted returns, and the total number of trades executed.

You'll also find a list of individual symbol statistics, providing a detailed look at each asset's contribution to the overall portfolio performance.  The `totalSymbols` property simply tells you how many different assets are included in this calculation.


## Interface DoneContract

This interface, DoneContract, lets you know when a background task finishes, whether it's a backtest or a live trading session. It bundles important information about what just completed, like the exchange used, the name of the trading strategy, and whether it was a backtest or live run. You'll find details about the trading symbol involved, too. Think of it as a notification carrying key details about the end of a process. 

The `frameName` property is empty when running live, indicating it wasn't part of a specific backtesting frame.

## Interface CriticalErrorNotification

This notification signals a critical error within the backtest-kit framework, indicating a problem so severe that the process needs to stop. Each critical error notification is uniquely identified by an `id` and includes a user-friendly `message` to help understand what went wrong.  You'll also find detailed information about the error itself, including a stack trace and other relevant data, packaged within the `error` property. Importantly, these notifications always originate from the live context, so the `backtest` flag will always be false.

## Interface ColumnModel

This interface describes how to structure data for creating markdown tables. Think of it as a blueprint for each column you want to display. 

Each column needs a unique identifier, a user-friendly label that will appear as the header, and a function that knows how to convert the underlying data into a readable string. 

You can also specify a function to control whether a column should be shown or hidden, allowing you to dynamically adjust what's displayed. This provides flexibility in presenting your data.

## Interface ClosePendingCommitNotification

This notification tells you when a pending trading signal has been closed before a position actually opened. It's like a "canceled" signal, but with a lot of detail. You’ll see the unique identifier for the signal, the strategy that created it, and where it was intended to be executed.

The notification includes important information about the original signal, like the intended entry price and the total number of planned entries or partial closes.  You can also access performance data like profit/loss, both as a percentage and in absolute USD terms, which helps understand the outcome even though the trade didn't fully activate.  A timestamp shows precisely when the closure was confirmed. Whether the signal came from a backtest or a live trading environment is also indicated. Finally, a unique ID specifically for this closure event is provided.

## Interface ClosePendingCommit

This event signals that a pending order has been closed. It's used to communicate the details of a closing action within your trading strategy’s backtesting process.

The `action` property clearly identifies this as a "close-pending" event.  You can optionally provide a `closeId`, a user-defined string, to help you track why the order was closed. Finally, the `pnl` property provides the profit and loss information associated with this closing event, giving you insight into the financial impact of the action.

## Interface CancelScheduledCommitNotification

This notification tells you when a scheduled trading signal has been cancelled before it could be activated. It’s like a heads-up that something you planned didn’t go through.

Each notification has a unique ID and timestamp, letting you track exactly when and why the cancellation happened. You'll also see details like the trading symbol, the strategy's name, and the exchange involved.

The notification includes key information like the original entry price, current profit and loss (both in USD and as a percentage), and the total number of entries and partials associated with the signal. It even provides the entry and exit prices used in the PNL calculation, along with the total capital invested.  Finally, you'll find the creation timestamp for comprehensive tracking. The `backtest` property indicates whether the cancellation occurred during a backtest or live trading.

## Interface CancelScheduledCommit

This interface lets you cancel a previously scheduled signal event within the backtest-kit framework. Think of it as a way to stop something from happening that was already planned.  You'll use it when you need to undo a future action, perhaps because circumstances have changed or a decision was reevaluated.

The `action` property clearly identifies this as a cancellation request.  You can optionally provide a `cancelId` to explain *why* you’re canceling—a helpful note for tracking and debugging.  Finally, `pnl` contains the unrealized profit and loss at the time the cancellation is requested, giving you context for the change.

## Interface BreakevenStatisticsModel

This model holds all the information about breakeven points encountered during a backtest. It tracks each individual breakeven event, storing details about each one in the `eventList` property, which is essentially a collection of records.  You’ll also find the total number of breakeven events recorded in the `totalEvents` property, giving you a quick overview of how frequently the breakeven milestone was hit. This information is useful for analyzing trading strategy performance and understanding its sensitivity to price fluctuations.

## Interface BreakevenEvent

The BreakevenEvent provides a standardized way to track and report when trading signals have reached their breakeven point.  It bundles together all the key details about that event, making it easy to analyze performance. 

You'll find information such as the exact time, the trading symbol involved, the name of the strategy used, and a unique ID for the signal. It also includes crucial pricing information, like the entry price, take profit target, stop loss, and their original values set when the signal was created.

For strategies using dollar-cost averaging (DCA), you'll also see the number of entries and partial closes executed, along with the original entry price before averaging.  The event also provides the current unrealized profit and loss (PNL), a note describing the signal’s reasoning, and timestamps indicating when the position became active and when the signal was originally scheduled. Finally, a flag indicates whether the event occurred during a backtest or live trading.

## Interface BreakevenContract

The `BreakevenContract` represents when a trading signal's stop-loss is adjusted to the entry price, marking a reduction in risk. This event signifies that the price has moved favorably enough to cover transaction costs and potentially secure some profit.

It’s a crucial signal for tracking a strategy's risk management and overall safety. You’ll see these events generated only once for each signal to avoid duplicates.

The `BreakevenContract` contains important details:

*   `symbol`: The trading pair involved (like BTCUSDT).
*   `strategyName`: The name of the strategy that created the signal.
*   `exchangeName`: The exchange being used.
*   `frameName`: Identifies the timeframe the signal is running on (empty for live trading).
*   `data`: The full set of information about the original signal.
*   `currentPrice`: The price at which breakeven was achieved.
*   `backtest`: Indicates whether the event occurred during a backtest or live trading.
*   `timestamp`: When the breakeven event happened, either when it was set in live mode or when the relevant candle closed in backtest mode.

Services like the `BreakevenMarkdownService` can use these events to build reports, and you can also listen for them directly using `listenBreakeven()` or `listenBreakevenOnce()`.

## Interface BreakevenCommitNotification

This notification lets you know when a trade has reached its breakeven point and a commitment has been made. It provides a wealth of details about the trade, including a unique identifier and the exact timestamp of the event. You'll find information about whether the trade occurred in backtest or live mode, the trading symbol, the strategy that triggered it, and the exchange used.

The notification also breaks down the trade's specifics: the entry and take profit/stop loss prices (both original and adjusted for trailing), the number of DCA entries, and the number of partial closes executed. It includes a complete picture of the trade's profitability with P&L figures, percentages, and prices, alongside key timestamps like when the signal was initially created and when the position became active. This information allows you to precisely track and analyze breakeven events for your trading strategies.

## Interface BreakevenCommit

The BreakevenCommit represents when a trading strategy automatically adjusts a trade to protect profits and limit potential losses, essentially breaking even on the initial investment. This event includes crucial information like the current market price at the time of the adjustment and the unrealized profit or loss (PNL) of the trade up to that point. You'll also find details about the trade's direction – whether it was a long (buy) or short (sell) position – as well as the original entry price and the originally set take profit and stop loss prices. 

Importantly, the BreakevenCommit also tells you the *effective* take profit and stop loss prices, which might have changed due to trailing stop-loss mechanisms. You can track the original, unaltered take profit and stop loss values too. The event also contains timestamps related to when the signal was created and when the position was initially activated.

## Interface BreakevenAvailableNotification

This notification lets you know when a trading signal's stop-loss has reached the entry price, essentially allowing you to move it to breakeven. It provides a wealth of information about the trade, including details like the strategy name, exchange used, and a unique signal identifier. You'll find specifics on the current market price, the original entry price, the direction of the trade (long or short), and how the take profit and stop-loss have been adjusted, if at all.

The notification also includes performance data such as the unrealized profit and loss, both as a percentage and in USD, along with details about DCA entries and partial closes, if any. Timestamps for various stages of the signal’s lifecycle – creation, pending, and the breakeven availability – are also provided for comprehensive tracking. It also distinguishes between live and backtest environments.

## Interface BacktestStatisticsModel

This model holds all the key statistics calculated after running a backtest of your trading strategy. It gives you a clear picture of how your strategy performed.

You’ll find a detailed list of every trade that was closed, including its price, profit and loss, and timestamps, in the `signalList` property.

Other important information includes the total number of trades, the number of winning and losing trades, and calculated rates like the win rate – which shows the percentage of profitable trades.

For a deeper understanding of risk and return, you'll also see metrics like average profit per trade, total profit across all trades, volatility (standard deviation), and risk-adjusted return ratios (Sharpe and annualized Sharpe). There’s also a certainty ratio that compares average winning trades to the average loss. Finally, it estimates your yearly returns based on trade duration and profit. All of these numbers will be null if the calculation is unreliable.

## Interface AverageBuyCommitNotification

This notification lets you know when a new averaging (DCA) buy order has been executed as part of a larger strategy. It’s triggered whenever a position’s average entry price is adjusted, essentially marking another step in a dollar-cost averaging plan. The notification includes a unique ID, the exact time it happened, and whether it occurred during a backtest or live trading.

You'll find details like the trading pair (e.g., BTCUSDT), the strategy that generated the signal, and the exchange used. Crucially, it provides the price at which the buy occurred, the cost in USD, and the new, averaged entry price. It also tracks the total number of DCA entries made so far and any partial closes that have been executed.

The notification also surfaces important pricing and risk management information: the original entry price, the effective take profit and stop-loss prices, and associated P&L data including profit/loss amounts, percentages, and entry/exit prices. Finally, you'll see timestamps indicating when the signal was created, when the position became pending, and when the notification itself was generated.

## Interface AverageBuyCommit

This event signals that a new buy or sell order has been placed as part of a dollar-cost averaging (DCA) strategy for an existing position. It provides details about this particular averaging action, including the price at which the order was executed and the total cost of that order. You'll also find information about how this action affects the overall average entry price of the position, as well as the current unrealized profit and loss.

The event includes the original entry price, which remains unchanged by the averaging process, alongside the current take profit and stop loss levels, possibly adjusted for trailing. You’ll see the original take profit and stop loss values as well before any trailing modifications were made. Timestamps are provided to indicate when the signal was initially generated and when the position became active.

## Interface ActivePingContract

This interface defines what information is shared when a pending signal is actively being monitored. Think of it as a heartbeat signal, sent every minute while a signal is open. It includes details like the trading pair (symbol), the strategy managing it, and the exchange it's on.

You'll also get the full details of the pending signal itself, including things like the initial price and stop-loss levels.  The current market price at the time of the ping is included, which is useful for custom logic based on price movements.

Finally, you’ll know if the signal is being monitored during a backtest (using historical data) or live trading.  A timestamp indicates exactly when the ping occurred, varying slightly depending on whether it's a live or backtest event. You can use this information to build custom logic and manage your signals dynamically.

## Interface ActivateScheduledCommitNotification

This notification signals that a previously scheduled trading signal has been manually activated by a user. It’s like confirming you want the trade to happen, even if the price hasn’t reached the initially expected level. The `type` property confirms this is an "activate_scheduled.commit" notification.

The notification includes a unique `id` to track it, along with the `timestamp` of when the activation was confirmed. You’ll also find details about whether it's happening in backtest mode (`backtest`) or live trading.

It provides all the essential trade information: the trading pair (`symbol`), the strategy that generated the signal (`strategyName`), the exchange used (`exchangeName`), and the signal’s unique identifier (`signalId`). An optional `activateId` is provided if you manually triggered the activation. 

You’ll get the trade direction (`position`), entry price (`priceOpen`), take profit (`priceTakeProfit`), and stop loss levels (`priceStopLoss`), alongside their original values before any adjustments. It also includes details about any DCA averaging (`totalEntries`), partial closes (`totalPartials`), and performance metrics like PNL (`pnl`, `pnlPercentage`, and related price and cost information). Finally, you can see the signal’s creation and pending timestamps (`scheduledAt`, `pendingAt`), as well as the current market price (`currentPrice`) and the notification creation time (`createdAt`).

## Interface ActivateScheduledCommit

This interface describes the data needed to activate a previously scheduled trading signal. Think of it as confirming and executing a plan that was set up earlier. It includes details like the current market price, the entry price you'll use, and the calculated profit and loss at that entry point. You'll also find information about your trade direction (buying or selling), and the take profit and stop-loss prices, both as they are currently set and as they were originally defined. A timestamp indicates when the signal was initially created and another specifies when the position is actually activated. Optionally, you can provide a user-defined identifier to track why this activation happened.
