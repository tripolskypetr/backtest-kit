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

This interface defines the information shared when a walker is told to stop. 

It's used to signal that a specific trading strategy, running under a particular walker, needs to be halted. 

The information includes the trading symbol, the name of the strategy being stopped, and the name of the walker that initiated the stop. This allows for situations where multiple strategies are running concurrently and precise control over which one is stopped is required.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps organize and understand the results of backtesting different trading strategies. 

It combines the standard Walker results with extra data that lets you compare how those strategies performed against each other. 

Essentially, it’s a container holding a list of detailed results for each strategy you tested, so you can easily analyze and see which ones did best.


## Interface WalkerContract

WalkerContract represents updates as strategies are being compared during a backtest run. It's like a progress report, letting you know when a strategy finishes its testing phase.

Each update includes details like the walker's name, the exchange and frame being used, the symbol the strategies are trading, and the name of the strategy that just completed its test.

You’ll also get the backtest statistics for that specific strategy, a value associated with a metric being optimized, and the best metric value and strategy seen so far.

Finally, it tells you how many strategies have been tested and the total number of strategies in the comparison. This gives you a good sense of how much of the testing process is left.

## Interface WalkerCompleteContract

The WalkerCompleteContract is a signal that the backtesting process is finished. It tells you that all the different trading strategies have been tested and the final results are ready. 

This contract holds all the details of the backtest, including information like the name of the backtesting process (walker name), the asset being traded (symbol), the exchange and timeframe used. 

You'll also find details about the optimization metric, the total number of strategies that were tested, and most importantly, the name and performance (metric value and statistics) of the single best-performing strategy.

## Interface ValidationErrorNotification

This notification lets you know when a rule or check within your trading strategy's risk management system fails. It's a signal that something went wrong during the validation process – perhaps a rule was violated or an unexpected condition arose.

Each notification has a unique ID so you can track specific errors. The `error` property contains a detailed breakdown of the problem, including what caused it and any additional information that might be helpful for debugging.  There’s also a `message` providing a plain-English explanation of the error.

Importantly, these notifications are specific to errors happening *now*, not during a backtest simulation. The `backtest` flag will always be false.

## Interface ValidateArgs

This interface, `ValidateArgs`, provides a way to ensure that the names you're using for different parts of your backtesting setup are correct. Think of it as a way to double-check that you’re referring to the right exchange, timeframe, strategy, risk profile, action, sizing method, or parameter sweep. 

Each property within `ValidateArgs` represents a specific name – like 'ExchangeName' or 'StrategyName' – and it expects an enum object.  This enum object contains the valid options for that name, and the system will use these to verify that you're using a name that's actually recognized.

Here’s a breakdown of the properties:

*   **ExchangeName**:  The name of the exchange you're using.
*   **FrameName**: The timeframe (e.g., 1 minute, 1 hour) for your data.
*   **StrategyName**: The name of the trading strategy you're testing.
*   **RiskName**: The name of the risk profile being used.
*   **ActionName**:  The name of the action handler (e.g., order placement).
*   **SizingName**: The name of the sizing strategy used to determine order size.
*   **WalkerName**: The name of the parameter sweep configuration.

Using this interface helps catch errors early and prevents unexpected behavior during backtesting.


## Interface TrailingTakeCommitNotification

This notification tells you when a trailing take profit order has been executed. It’s like getting a confirmation that your trailing stop-loss or take-profit has hit its target price.

The `type` clearly indicates this is a trailing take commit notification.  You'll find a unique `id` to identify the event, along with the `timestamp` of when it occurred.  The `backtest` flag will let you know whether this event happened during a simulated trading test or in a live trading environment.

Key details about the trade are included like the `symbol` (e.g., BTCUSDT), the `strategyName` that triggered it, and the `exchangeName` where the trade took place.  You'll also see the `signalId`, which is a unique identifier for the original trading signal.

The notification provides comprehensive information about the trailing adjustments, including `percentShift`, the `currentPrice` at execution, and the `position` (long or short).  You'll also get the original entry price (`priceOpen`), the adjusted take profit and stop loss prices (`priceTakeProfit`, `priceStopLoss`), and their original values before trailing.

Detailed financial data is available too. This includes information about the number of entries (`totalEntries`), partial closes (`totalPartials`), and the overall profit and loss (`pnl`), peak profit, and maximum drawdown. You'll also find profit/loss percentages, the prices used for PNL calculations (`pnlPriceOpen`, `pnlPriceClose`), and other insightful metrics like the prices and costs associated with peak profit and maximum drawdown events.

Finally, a helpful `note` may provide a human-readable explanation of why the signal was triggered, along with timestamps for signal creation, pending status, and the notification's creation itself.

## Interface TrailingTakeCommit

This describes a "trailing take" event, which happens when a trading strategy adjusts its take profit level as the price moves favorably. The `action` property confirms this is a trailing take event.

The `percentShift` determines how much the take profit is moved based on a percentage. 

Important details about the trade are included, such as the `currentPrice` at the time of the adjustment, the overall `pnl` (profit and loss), the `peakProfit` achieved, and the `maxDrawdown` experienced. 

You'll also find information about the trade’s direction (`position`), the `priceOpen` at which the trade was entered, and the now-adjusted `priceTakeProfit` and `priceStopLoss`.

The original `priceTakeProfit` and `priceStopLoss` values, before any trailing adjustments occurred, are also recorded. 

Finally, timestamps indicate when the signal was generated (`scheduledAt`) and when the position was activated (`pendingAt`).

## Interface TrailingStopCommitNotification

This notification signals that a trailing stop order has been triggered and executed. It provides a wealth of information about the trade, including when it happened (timestamp), whether it occurred during a backtest or live trading, and the trading pair involved. You'll find details about the strategy that generated the signal, the exchange used, and the unique identifier for that signal.

The notification breaks down the specifics of the trailing stop, like the percentage shift applied and the current market price at execution. It also outlines the position details, including entry and stop-loss prices, both original and adjusted by the trailing mechanism.

Beyond the immediate trade execution, it delivers comprehensive performance metrics for the position, such as total profit and loss (PNL), peak profit, maximum drawdown, and related pricing and percentage information.  Details on DCA entries and partial closes are also included. Finally, the notification contains optional notes to help understand the signal's reasoning and timestamps related to its creation and activation.

## Interface TrailingStopCommit

This describes what happens when a trailing stop order is triggered in your trading strategy. It's an event that signals a change in your position due to the trailing stop mechanism.

The event includes details about the trade, like whether it's a long or short position, the original entry price, and the current price at the time the stop was adjusted.

You’ll also find key performance metrics associated with the trade, such as the total profit and loss (PNL), the peak profit achieved, and the maximum drawdown experienced. It also records the original and adjusted take profit and stop loss prices, allowing you to see how the trailing stop has impacted your risk management.

Finally, timestamps are provided, indicating when the signal was created and when the position was initially activated.

## Interface TickEvent

This describes the `TickEvent` object, a standardized way to represent events that happen during trading. Think of it as a container holding all the relevant data about a single moment in the trading process.

It includes details like the exact time of the event (`timestamp`), what kind of event it is (`action` - like scheduled, opened, or closed), and key information specific to that event, such as the trading symbol (`symbol`), signal ID (`signalId`), and position type (`position`).

You'll also find price-related information like the current price, open price, take profit, and stop loss levels. For signals that use averaging, it provides details about the number of entries and partial closes. Financial performance metrics are included too, such as unrealized and realized profit/loss (`pnlCost`, `pnl`), and progress towards take profit and stop loss levels.

For closed or cancelled positions, there are additional details such as the reason for closure/cancellation, the duration of the trade, and performance metrics like peak and fall PNL. The `pendingAt` and `scheduledAt` properties give important timing information for different event types.  Essentially, `TickEvent` brings together everything you need to analyze and understand what happened in a trade.

## Interface SyncStatisticsModel

This model holds statistics about how signals are synced. It's designed to give you a clear picture of the signal lifecycle.

You'll find a complete list of all the syncing events, with all their details, in the `eventList` property.

The `totalEvents` property simply tells you how many syncing events have occurred.

`openCount` shows you how many times signals were opened, while `closeCount` indicates how many times signals were closed.

## Interface SyncEvent

This data structure holds all the important details about events happening during a trade, making it easy to create clear reports. It includes the exact time of the event, which trading pair was involved, and the name of the strategy and exchange being used. 

You'll find information about the signal itself, like its unique ID and the action that was taken (like opening or closing a position). For each trade, it keeps track of things like the entry price, take profit and stop loss levels, and how they might have been adjusted.

The record also contains details about the signal’s lifecycle, including when it was created, when the position became active, and information about partial closes. It calculates key performance metrics like profit and loss (PNL), peak profit, and maximum drawdown to understand how the trade performed. Finally, it indicates why the trade was closed and whether the event occurred during a backtest.

## Interface StrategyStatisticsModel

This model holds all the statistics gathered during a backtest, offering a detailed look at how your strategy performed. It includes a complete list of strategy events, giving you access to all the individual actions taken. 

You'll find counts for various event types like cancels, closes, partial profits and losses, trailing stops, breakevens, and activations. There's also a count for average-buy (Dollar-Cost Averaging) events, which is helpful if you’re using that technique. Essentially, it provides a breakdown of the different actions your strategy executed and how frequently they occurred.

## Interface StrategyEvent

This `StrategyEvent` object holds all the important details about what's happening during your trading strategy's execution, whether it's a backtest or live trading. Think of it as a complete record of every action your strategy takes, like opening a position, closing it, or adjusting stop-loss levels.

It includes things like the exact time of the event, the trading pair involved, and the name of the strategy being used. You'll also find information about the price at the time of the action, the size of the position being managed, and any take profit or stop-loss levels that are in place. 

For strategies employing Dollar-Cost Averaging (DCA), it tracks the number of entries and the total cost associated with the averaging process. The `note` property allows you to add custom context or explanations to these events. Essentially, this object provides a comprehensive log of your strategy's activity for reporting and analysis.

## Interface SignalSyncOpenNotification

This notification signals that a pre-planned trade, triggered by a signal, has been executed and a position has been opened. It provides a wealth of information about that trade, including when it happened, whether it was a backtest or a live trade, and the trading pair involved. You'll find details about the strategy and exchange that initiated the trade, along with the signal identifier and the current market price at the time of opening.

The notification also includes extensive performance data for the newly opened position. It outlines the current profit/loss, peak profit achieved, and maximum drawdown experienced so far, all expressed in both numerical and percentage terms. Furthermore, it shares the entry and exit prices used for PNL calculations.

For more in-depth analysis, there's detailed information regarding entries, partial closes, and how the position’s prices evolved, including original prices before any adjustments or averaging. A timestamp indicates when the signal was originally generated, and another records when the position was activated. Finally, a note field allows for optional human-readable descriptions about why a signal was opened.

## Interface SignalSyncCloseNotification

This notification tells you when a trading signal you were following has been closed, whether it was because a target profit was hit, a stop-loss was triggered, the time expired, or you manually closed it. It provides a wealth of information about the closed trade, including the unique identifier of the signal, when it was closed, and whether it occurred during a backtest or live trading.

You'll find details about the performance of the trade, such as total profit and loss (both absolute and as a percentage), peak profit achieved, and maximum drawdown experienced. The notification also breaks down the key prices used in the trade – entry, take profit, and stop loss - both as originally set and after any adjustments.

Furthermore, it outlines the trade direction (long or short), the total number of entries and partial closes, the timing of the signal creation and activation, and a clear reason why the signal was ultimately closed, with an optional note providing additional context. The `createdAt` property indicates when the notification itself was generated, distinct from the signal's timeline.

## Interface SignalSyncBase

This defines the common information found in every signal synchronization event. Think of it as the foundational data shared by all signal-related updates. 

Each signal event will tell you the trading symbol involved, the name of the strategy that created the signal, and the exchange where the action took place.  You'll also find details about the timeframe being used (important for backtesting) and whether the signal originates from a backtest or a live trading environment.

A unique ID identifies each signal, along with a timestamp indicating exactly when it occurred. Finally, a complete record of the public signal data is included for comprehensive context.

## Interface SignalScheduledNotification

This notification type tells you when a trading signal has been set to run in the future. Think of it as a heads-up that a trade is about to happen, but not right away. It provides a wealth of information about that upcoming trade, including when it was scheduled, the trading pair involved (like BTCUSDT), and the strategy that generated the signal.

You'll find details like the intended entry price, take profit and stop-loss levels, and even the original prices before any adjustments. The notification also tracks potential risks and rewards, with metrics like peak profit and maximum drawdown—essentially, a snapshot of how the trade *could* perform.

It also includes financial details: the initial cost of the position, profit/loss calculations, and the total capital involved. Finally, there’s a `note` field for any extra explanation behind the signal. The `scheduledAt` property tells you precisely when the signal was put on the queue to be executed.

## Interface SignalPingContract

The `SignalPingContract` represents a periodic check to ensure a trading order remains active on the exchange while a signal is pending. Think of it as a heartbeat signal confirming the order hasn't been filled, cancelled, or liquidated unexpectedly. 

This event is crucial for maintaining order synchronization between the trading framework and the external order management system. If your system confirms the order is still open, the framework continues monitoring it. If it signals the order is no longer active, the framework automatically closes the pending signal, marking it as closed. 

Importantly, this signal is not generated during backtesting, as there's no live exchange to query. It’s primarily used by broker adapters and registered actions to monitor open positions.

The event contains a wealth of information about the signal's history: its ID, creation and activation timestamps, the strategy that generated it, the exchange used, the trade direction, the original and effective entry, take profit, and stop-loss prices, plus real-time performance metrics like P&L, peak profit, and drawdown. It also includes details about DCA averaging if it was used and the number of partial closes executed. Essentially, it’s a comprehensive snapshot of the position at the moment of the check.

## Interface SignalOpenedNotification

This notification signals the opening of a new trading position, providing a wealth of details about the trade. It tells you when the position was opened, whether it's a backtest or live trade, and includes a unique identifier for tracking.

You'll find key information like the trading symbol, the strategy that triggered the trade, and the exchange used. The notification specifies whether it's a long (buy) or short (sell) position, along with the entry price and target prices for take profit and stop loss.

Beyond the basic trade parameters, you're also given insights into the strategy's performance. It includes metrics like peak profit, maximum drawdown, and percentage profit/loss. Detailed information is provided regarding DCA averaging and partial closes. Finally, a note field provides optional human-readable context for the signal’s reason, and timestamps provide comprehensive timeline for the position's lifecycle.

## Interface SignalOpenContract

This event, `SignalOpenContract`, is triggered when a pre-set order (a limit order) placed by the framework is actually filled by the exchange. Think of it as confirmation that your order went through.

It's particularly useful for keeping external systems in sync with what's happening during trading. If you're using external order management tools or need detailed audit logs, this event provides the necessary information.

The data provided includes the current market price, overall profit and loss (PNL), peak profit and drawdown of the trade, costs, the trade direction (long or short), and the prices at which the order was placed and any stop-loss or take-profit levels. It also includes details about any averaging (DCA) or partial closes that occurred during the position’s life. The timing of when the signal was originally created and when the position actually activated is also included.

## Interface SignalInfoNotification

This notification type lets you receive informational messages broadcast by your trading strategies, like alerts or status updates about open positions. It's essentially a way for your strategies to "speak" to you about what's happening.

Each notification includes detailed information like the strategy's name, the exchange it's operating on, and the trading pair involved. You'll also get crucial data points like the entry price, stop-loss levels (both original and adjusted for trailing), and the current price.

Beyond the basic position details, you can also track performance metrics such as profit and loss (both in USD and as a percentage), peak profit, and maximum drawdown, along with when these points were hit. There’s also a space for strategies to add their own custom notes, which can provide more context or explanations. Timestamps throughout the notification let you trace exactly when events occurred, from the signal’s initial creation to its pending state and beyond. Finally, a notification ID allows you to connect these messages to other systems if needed.

## Interface SignalInfoContract

This interface defines the structure of information sent when a trading strategy wants to broadcast a custom message related to an open position. Think of it as a way for strategies to communicate extra details about their actions, like custom annotations or debugging information. 

Each message includes details like the trading symbol, the strategy's name, the exchange being used, and the frame (if applicable – it’s empty during live trading).  You'll also find all the original signal data, the current market price at the time of the message, a user-defined note for extra context, and a unique ID if needed.

Finally, the message indicates whether it originated from a backtest (historical data) or a live trade, and provides a timestamp marking precisely when the event occurred – either when the message was sent in live mode or at the start of the relevant candle in backtest mode. This allows for tracking and external routing of these custom signal notifications.

## Interface SignalEventContract

This interface helps you track the lifecycle of pending trading positions without needing to monitor all the underlying signal data. It provides notifications when a position is either opened or closed.

You'll receive events related to various opening scenarios, such as new signals, immediate entries, scheduled activations, or manual user activation. Similarly, closure events cover all possibilities – take profit, stop loss, time expiry, user-initiated closure, broker fills, or situations where the order isn't active.

The `action` property tells you whether a position was "opened" or "closed," while `symbol`, `strategyName`, `exchangeName`, and `frameName` identify the specific market, strategy, exchange, and timeframe involved. The `data` property gives you the full details of the signal. When a position closes, the `closeReason` property tells you why. The `currentPrice` provides the entry or exit price, and the `backtest` flag indicates if this occurred during a backtest or live trading. Finally, `timestamp` records exactly when the event happened.

## Interface SignalData$1

This interface, `SignalData`, holds all the key details about a completed trading signal used in generating performance reports. Think of it as a record of one particular trade – it tells you which strategy created the signal, a unique ID for that signal, the asset being traded (like BTC/USD), whether it was a long or short position, and its profit or loss expressed as a percentage. You'll also find the reason the signal was closed, plus the exact times it was opened and closed. Ultimately, `SignalData` gives you the information needed to understand how individual signals contributed to your overall trading results.

## Interface SignalCommitBase

This defines the basic information shared by every signal event within the backtest-kit framework. Each signal, whether it's from a simulation or live trading, includes details like the trading pair's symbol, the name of the strategy that generated it, and the exchange it's associated with. 

You’ll also find information specific to backtesting, like the timeframe used, and a flag indicating whether the signal originated from a backtest or live environment. Every signal has a unique ID and timestamp for tracking.

The signal also tracks how many entries have been made as part of a DCA (Dollar-Cost Averaging) strategy, and how many partial closes have been performed. A key piece of data is the original entry price, which is the price at which the initial trade was placed, even if subsequent DCA entries have adjusted the average price. 

Finally, the complete signal data is included as well as an optional note for human-readable explanations of the signal’s reasoning.

## Interface SignalClosedNotification

This notification tells you when a trading position has been closed, whether it was triggered by a take profit, a stop loss, or some other event. It provides a wealth of details about the trade, including a unique identifier, the exact time it closed, and whether it happened during a backtest or live trading. You'll find information about the symbol traded, the strategy used, and the direction of the trade (long or short).

The notification includes key pricing information like the entry and exit prices, take profit and stop loss levels, and even how these were adjusted over time. It also breaks down the profit and loss of the trade, showing it as both a percentage and a raw dollar amount, along with peak profit and maximum drawdown figures. You can see exactly how much capital was invested and the effective price used in the PNL calculation.

Finally, the notification explains *why* the position closed and gives the duration of the trade, any optional notes about the signal, and the timestamps related to its creation and activation. It's a complete record of the signal's lifecycle, from initial planning to final execution.

## Interface SignalCloseContract

This event lets you know when a trading signal has been closed, whether that's because a profit target was hit, a stop-loss triggered, time ran out, or a user manually closed it. It's designed to help systems outside of the core trading engine stay in sync, like order management tools or auditing systems.

The event provides a snapshot of the trade at the moment of closure. You'll find details such as the current market price, the total profit and loss (PNL), and the highest profit and largest drawdown experienced by the position. It also includes information about the original and final prices used for entry, take profit, and stop-loss, along with when the signal was initially created and when the position was opened.

You can also see exactly *why* the signal was closed—for example, was it a take profit, stop loss, or expiration? Information on the number of initial entries and any partial closures helps understand the position's history.

## Interface SignalCancelledNotification

This notification is sent when a scheduled trade signal is cancelled before it's actually executed. It provides detailed information about the cancelled signal, which is useful for understanding why a trade didn't happen. 

The notification includes the unique identifier of the cancelled signal, the time it was cancelled, and whether it was during a backtest or live trading. You’ll find specifics about the trade itself, such as the trading pair, strategy used, and whether it was a long or short position, including take profit and stop loss levels.

It also offers insight into the signal's history, revealing the original entry and exit prices, how many DCA entries were planned, and why the signal was cancelled – whether due to a timeout, price rejection, or a manual cancellation. Information on scheduling and pending times provides a deeper understanding of the signal's lifecycle, and a note field allows for adding custom descriptions.

## Interface Signal

This `Signal` object holds all the data related to a single trading position. 

It remembers the opening price (`priceOpen`) used when the trade was initiated. 

You'll find a record of entry events (`_entry`), detailing the price, cost, and timestamp of each position entry.

Partial exits from the position are also tracked in `_partial`, showing the type (profit or loss), percentage gained or lost, closing price, cost basis, the number of shares/contracts held at the time, and a timestamp. These records help analyze partial exits for adjustments to your strategy.

## Interface Signal$2

This `Signal` object represents a trading signal, tracking its price and related events. It holds the initial entry price for the position as `priceOpen`.

Internally, it maintains a record of entries made, storing the price, cost, and timestamp for each.

It also keeps track of any partial exits, noting the type (profit or loss), percentage, current price, cost basis at the time of exit, the number of shares/contracts exited, and the corresponding timestamp. These details allow you to analyze the performance of your trading strategy over time.

## Interface Signal$1

This `Signal$1` object holds information about a single trading position. It includes the `priceOpen`, which is simply the price at which you initially entered the trade.

The `_entry` property is an array that records each time you added to the position, specifying the price, total cost, and the timestamp of that entry.

Similarly, `_partial` is an array tracking any partial exits or adjustments you made to the position, detailing the type of adjustment (profit or loss), the percentage based on cost basis, the price at the time, the cost basis at closure, and the number of shares/contracts at the time of the adjustment. These arrays help you reconstruct the position's history and analyze its performance.

## Interface ScheduledEvent

This data structure bundles all the relevant information about trading events—when they were scheduled, opened, or cancelled—into a single, organized format, which is useful for creating reports and analyzing performance. Each event record includes details like the exact time it happened, the type of action (scheduled, cancelled, or opened), the trading symbol involved, and a unique ID for the signal.

You'll also find crucial pricing information, such as the entry price, take profit levels, and stop loss orders, along with their original values before any modifications were made.  For strategies using DCA, it tracks the total number of entries and partial closes executed.

Further details capture performance metrics like unrealized P&L, how long a position was open (for cancellations and openings), and the reason for cancellations, including user actions or system limitations. The `scheduledAt` field indicates when the initial signal was created, providing a complete timeline of the trading event.


## Interface ScheduleStatisticsModel

The `ScheduleStatisticsModel` helps you understand how your scheduled trading signals are performing. It presents a collection of key metrics related to your scheduled signals, including how many were scheduled, activated (opened), and cancelled.

You’ll find a detailed list of individual events, alongside totals for all three categories.

It also calculates important rates like cancellation rate (the percentage of signals that were cancelled) and activation rate (the percentage that were activated). Lower cancellation rates are desirable, while higher activation rates are generally better.

Finally, it provides averages for how long signals waited before being cancelled or activated, measured in minutes. This data assists in evaluating and refining your scheduling strategy.

## Interface SchedulePingContract

This interface defines what happens when a scheduled trading signal is actively being monitored. Think of it as a regular heartbeat signal confirming the system is keeping an eye on a signal.

It provides information about the symbol, the strategy involved, and the exchange it's monitoring. You'll also see details like the timeframe (or "frame") being used and the complete data associated with that specific signal.

A key piece of information is the `currentPrice` which represents the market price at the time the ping occurred, useful for creating your own automated monitoring rules. It also tells you if this ping comes from a backtest (using historical data) or live trading. Finally, you get a timestamp so you know precisely when the ping was generated.

This ping allows you to listen for these events and build custom logic, potentially to cancel or adjust signals based on price movements or other conditions. It's crucial for actively managing and reacting to scheduled signals.

## Interface ScheduleEventContract

This contract provides a way to keep track of scheduled trading signals without needing to constantly monitor the main signal stream. It lets you know when a signal is added to the schedule (meaning it's waiting for the right market conditions to activate) or when a signal is removed from the schedule before it ever activates.

Think of it as a notification system for signals that are on standby.

The events cover two main actions: a signal being scheduled and a signal being cancelled. You can listen for these events to understand the lifecycle of your signals.

You'll find key details in each event, including the symbol being traded, the strategy that created the signal, the timeframe it applies to, and the full data associated with the signal. If a signal is cancelled, the reason for cancellation is also provided. You'll also see the current price at the time of the event and whether it occurred during a backtest or live trading session.

## Interface RiskStatisticsModel

This model holds statistical information about risk rejection events, helping you monitor and understand your risk management processes. 

It contains a detailed list of each risk rejection event that occurred, allowing you to investigate specific instances.

You'll also find the total number of rejections, a breakdown of rejections categorized by the trading symbol, and another breakdown grouped by the trading strategy used. These groupings allow you to quickly identify patterns and areas for improvement in your risk controls.

## Interface RiskRejectionNotification

This notification alerts you when a trading signal is blocked by your risk management rules. It's a way to understand why a potential trade didn’t happen.

Each notification has a unique identifier and a timestamp indicating when the rejection occurred. You'll also see if it originated from a backtest or live trading environment.

The notification includes key details like the trading symbol, the strategy involved, the exchange used, and a clear explanation of *why* the signal was rejected.  You can also find information about your existing open positions, the current market price, and the specific signal that was rejected, including details like entry price, take profit, and stop-loss levels. A unique identifier for the rejection itself is optionally included for tracking purposes, and the reason the signal was generated is also available.


## Interface RiskEvent

The `RiskEvent` provides details about trading signals that were blocked due to risk management rules. It's essentially a record of when a trading decision couldn't happen because of pre-defined limits.

This object holds key information like the exact time the event occurred, the trading pair involved, the signal that was rejected, and the name of the strategy and exchange that generated it. 

You'll also find the timeframe used, the current market price, and the number of existing positions when the rejection happened. A unique ID identifies each rejection, along with a note explaining *why* the signal was rejected. Finally, it indicates whether this event occurred during a backtest or in live trading.

## Interface RiskContract

The RiskContract provides information about rejected trading signals due to risk validation failures. It's a way for the system to tell you when a trading signal was blocked because it violated a risk limit.

This contract focuses on *actual* risk breaches, so you only receive notifications when something goes wrong, not just when signals are allowed.

It contains several pieces of important information:

*   **symbol:** The trading pair affected, like "BTCUSDT."
*   **currentSignal:** The details of the signal itself, including position size, prices, and stop-loss levels.
*   **strategyName:** Which strategy tried to execute the signal.
*   **frameName:**  The time frame the signal was generated for.
*   **exchangeName:**  The exchange the signal relates to.
*   **currentPrice:** The price of the asset at the moment the rejection occurred.
*   **activePositionCount:** How many positions were already open when the signal was rejected, giving you a sense of overall portfolio exposure.
*   **rejectionId:** A unique identifier to help track and debug specific rejections.
*   **rejectionNote:**  A human-readable explanation of why the signal was rejected.
*   **timestamp:**  The precise time the rejection happened.
*   **backtest:**  Indicates whether this rejection happened during a backtest or in live trading.

Services like report generation and custom user alerts use this contract to monitor and understand risk management activities.

## Interface ProgressWalkerContract

The `ProgressWalkerContract` provides updates on the status of a background process, specifically during the execution of a Walker. You'll receive these updates as the Walker is working through strategies. 

It tells you which Walker is running, what exchange and frame it's using, and the trading symbol involved. 

The most important information is the total number of strategies to be processed, how many have already been handled, and a percentage representing the overall completion progress. This helps you monitor the progress and potentially estimate how much longer the process will take.

## Interface ProgressBacktestContract

This contract provides updates on the progress of a backtest as it runs. You'll receive these updates while a backtest is executing, giving you insight into how far along it is. Each update includes details like the exchange and strategy being used, the trading symbol being analyzed, the total number of data points (frames) the backtest will cover, and how many frames have already been processed. Finally, you’ll see the overall completion percentage, represented as a number between 0 and 1, so you can easily gauge how much longer the backtest has to go.

## Interface PerformanceStatisticsModel

This model holds the overall performance statistics for a particular trading strategy. It includes the strategy's name, the total number of performance events tracked, and the total time spent calculating those metrics. The `metricStats` property organizes performance data by metric type, providing a breakdown of how the strategy performed across different aspects. Finally, the `events` property contains all of the individual performance data points collected during the backtest, allowing for a detailed look at the strategy's behavior.

## Interface PerformanceContract

The `PerformanceContract` helps you understand how your trading strategies are performing by providing detailed timing information. It’s like a performance log that records how long different parts of your strategy take to execute. 

Each entry in this log, called a `PerformanceContract` event, includes:

*   When the event happened (timestamp) and when the previous one did.
*   What kind of activity was being measured.
*   How long that activity took.
*   The name of the strategy, the exchange it was used on, and the trading symbol involved.
*   A flag indicating whether the metric comes from a backtest (simulated trading) or live trading.

By analyzing these records, you can pinpoint slow areas in your strategy and identify opportunities to make it more efficient. This is especially helpful during backtesting to make sure your strategy is as optimized as possible before going live.


## Interface PartialStatisticsModel

This model holds information about profit and loss events during a backtest, specifically focusing on partial results. It keeps track of individual events in detail within the `eventList` property, offering a way to examine each milestone. You'll also find the overall count of all events (`totalEvents`), as well as separate counts for profitable events (`totalProfit`) and losing events (`totalLoss`). This data helps in understanding the distribution of outcomes and the performance of your trading strategy at various stages.


## Interface PartialProfitContract

The `PartialProfitContract` helps you track how your trading strategies are performing as they reach profit milestones. It's like a notification system that tells you when a strategy has achieved a certain percentage profit, like 10%, 20%, or 30%.

Each notification, or event, includes key details about the trade, such as the trading pair (symbol), the strategy that initiated it, the exchange being used, and the specific profit level achieved.

You’ll also find the current market price at that moment, allowing you to precisely calculate the profit percentage. This is extremely useful for understanding how your strategies are doing over time and for creating reports.

The `PartialProfitContract` also indicates if the event comes from a backtest (historical data) or live trading, and provides a timestamp. Importantly, it only sends a notification once for each profit level per signal, even if price changes rapidly. Services like the `PartialMarkdownService` use this data for generating performance reports, and users can subscribe to these events to receive live updates.

## Interface PartialProfitCommitNotification

This notification signals that a portion of your trading position has been closed to realize profits. It provides a wealth of details about this partial close, including a unique identifier, the exact time it happened, and whether it occurred during a backtest or live trading. You'll find information about the trading pair, the strategy that generated the signal, and the specific exchange involved.

The notification also includes key price points like the entry price, take profit, and stop loss levels, both as they are currently and as they were originally set.  You can see how many entries make up this position, how many partial closes have occurred, and a comprehensive breakdown of the position's profit and loss, including peak profit and maximum drawdown.

Essentially, this notification gives you a complete snapshot of the partial profit closure, allowing you to analyze its performance and understand how it contributes to your overall trading strategy. It includes crucial data like the PNL, percentage gain/loss, cost, and entry/exit prices used in the PNL calculation, along with performance metrics such as peak profit and maximum drawdown. There’s also a timestamp for when the signal was initially scheduled, when the position became active, and when this specific notification was created. Finally, a note field provides space for any extra explanation about why the partial profit was taken.

## Interface PartialProfitCommit

This event signifies a partial profit taking action within a trading strategy. It details the specifics of closing a portion of an existing position, indicating how much of the position was closed as a percentage.

The event also provides essential context about the trade, including the current market price when the action occurred, the overall profit and loss (PNL) realized so far, and the highest profit and largest drawdown experienced by the trade.

You’ll find information about the trade’s direction (long or short), the initial entry price, and the intended take profit and stop loss levels, both as originally set and as they were adjusted during the trade.

Finally, timestamps indicate when the signal was created and when the position initially became active, giving you a timeline of events.

## Interface PartialProfitAvailableNotification

This notification signals that your trading strategy has reached a milestone in profit, like 10%, 20%, or 30% gain. It's a way to track progress and understand how your strategy is performing. Each notification includes details like a unique ID, when it happened, whether it's from a backtest or live trading, and the trading pair involved.

You'll also find information about the strategy and exchange used, the original entry price, the current market price at the time of the milestone, and the configured stop-loss and take-profit prices. It breaks down the performance metrics, including total profit and loss (both in USD and as a percentage), peak profit achieved, and maximum drawdown experienced. Finally, it tells you when the signal was created, when it became active, and the reason behind the signal, if available.

## Interface PartialLossContract

The PartialLossContract represents when a trading strategy hits a predefined loss level, like a -10%, -20%, or -30% drawdown. It's a way to track how much a strategy is losing and when it happens. 

These events are triggered for each loss level achieved by a signal, but only once for each signal to avoid duplicates.  If the price moves significantly in one tick, multiple loss levels might be triggered at the same time.

You can use these events to build reports about strategy performance or to set up custom actions based on the strategy’s current loss. The data provided includes information like the trading symbol, the strategy’s name, the exchange, the current price, the exact loss level reached, whether it's a backtest or live trade, and the timestamp of the event. It also includes all the original signal data.

## Interface PartialLossCommitNotification

This notification tells you when a portion of a trading position has been closed. It’s like getting a status update on a trade that isn't fully finished. The `type` confirms it's a partial loss commit. You'll find details like the unique ID of this event (`id`), when it happened (`timestamp`), and whether it occurred during testing or live trading (`backtest`).

It also gives you key information about the trade itself – the trading pair (`symbol`), the strategy that triggered it (`strategyName`), the exchange used (`exchangeName`), and the specific signal ID (`signalId`). The notification breaks down exactly *how much* of the position was closed (`percentToClose`), and the current market price at the time (`currentPrice`).

You'll also see the position direction (long or short), the initial entry price (`priceOpen`), and details regarding any take profit or stop loss prices that were set. It even keeps a record of the original prices before any adjustments were made (`originalPriceTakeProfit`, `originalPriceStopLoss`, etc.).

Furthermore, the notification provides a complete performance overview of the position - the total entries, partial closes, cumulative profit and loss (`pnl`, `peakProfit`, `maxDrawdown`), expressed both numerically and as a percentage.  You can see how the position performed, including the highest profit and largest loss experienced, along with details of the price and cost associated with those key points. Finally, it includes additional details like a note describing the reasoning behind the trade, as well as timestamps for when the signal was scheduled, pending, and created.

## Interface PartialLossCommit

This data represents a partial loss event within a trading strategy's backtest. It signifies a scenario where a portion of an existing position is being closed, likely as a risk management technique. The `action` property clearly identifies this as a "partial-loss" event.

The `percentToClose` tells you what percentage of the original position size is being reduced. You'll also find the `currentPrice` at the time the partial loss was triggered, as well as the `pnl` accumulated by the position up to that point.

Detailed performance metrics for the position are provided, including `peakProfit` (the highest profit achieved), `maxDrawdown` (the largest loss experienced), and the original entry `priceOpen`. You can also see the intended `priceTakeProfit` and `priceStopLoss` levels, along with their original values before any trailing adjustments.

Finally, timestamps `scheduledAt` and `pendingAt` help you understand when the signal was created and when the position initially became active.

## Interface PartialLossAvailableNotification

This notification signals that a trading strategy has reached a predefined loss milestone, like losing 10% or 20% of the initial investment. It provides detailed information about the situation, including a unique identifier, the exact time it occurred, and whether it happened during a backtest or live trading. You'll find specifics about the trading pair, the strategy used, the exchange involved, and the direction of the trade (long or short).

The notification also includes key pricing data: the entry price, the current market price at the time of the loss, and the original stop-loss and take-profit levels.  You can also find details on any DCA averaging used, the number of partial closes executed, and the overall profit and loss (both in USD and percentage terms) related to this position.  It also contains data points showing the peak profit achieved and the maximum drawdown experienced, allowing for a complete picture of the position's performance lifecycle. Finally, a note field can be used to provide additional context or explanation for the signal.

## Interface PartialEvent

This data structure provides a standardized way to track profit and loss milestones during trading. It gathers all the relevant information about a specific profit or loss event, like when a level (e.g., 10%, 20%) was hit.

Each event record includes details like the exact timestamp, whether it was a profit or loss, the trading pair involved, and the strategy or signal responsible. You'll find information on the entry price, take profit targets, stop loss levels, and even the original prices set when the trade was initially created.

If a dollar-cost averaging (DCA) strategy was used, you'll see details about the total number of entries and the original entry price before averaging. Records also capture the total executed percentage from partial closes and the current unrealized profit and loss. A human-readable note explains the reason behind the signal, along with timestamps for when the position became active and the signal was created. Finally, a flag indicates whether the event occurred during a backtest or a live trading session.

## Interface MetricStats

This object holds a collection of statistics related to a particular performance measurement, like order execution time or message processing duration. It tells you how many times a specific action was performed, the total time it took across all instances, and key duration metrics. 

You'll find details like the average duration, the shortest and longest durations, and the standard deviation to understand the spread of the data. Percentiles (like the 95th and 99th) reveal how long events typically take under various conditions.

Furthermore, it includes information about the wait time between events, providing insights into the intervals between actions. This comprehensive set of data allows you to analyze the performance of your trading system and pinpoint areas for optimization.

## Interface MessageModel

This framework defines a `MessageModel` to represent individual messages in a chat history, covering everything from initial instructions to responses and even tool usage. Each message has a `role` indicating who sent it – whether it’s a system prompt, a user question, the assistant’s reply, or a result from a tool. The core of the message is its `content`, the actual text being conveyed, although assistant messages can sometimes have only tool calls and no content.

Some providers offer enhanced reasoning, which is accessible through the `reasoning_content` property.  If an assistant uses tools, you'll find details about those tool calls listed in the `tool_calls` array.  Images can also be attached to messages and are supported in various formats, including Blobs, raw bytes, or base64 strings. Finally, if a message is a direct response to a tool call, it will have a `tool_call_id` to link it back to that specific call.

## Interface MaxDrawdownStatisticsModel

This model helps you understand the maximum drawdown experienced during a trading simulation. It keeps track of individual drawdown events, providing a detailed history of how much capital was lost from peak to trough. 

The `eventList` property gives you access to all recorded drawdown events, ordered from most recent to oldest, allowing you to analyze the sequence and timing of these losses.  You can also see the total number of drawdown events with `totalEvents`, which gives a sense of the frequency of these occurrences.

## Interface MaxDrawdownEvent

This data structure represents a single instance of a maximum drawdown event that occurred during a trading simulation or live trading. It provides detailed information about the circumstances surrounding that drawdown.

Each `MaxDrawdownEvent` includes the exact time the event happened, the trading pair involved, and the name of the strategy and signal that triggered it. You'll also find details about the position's direction (long or short), its total profit and loss, the highest profit achieved, and the size of the maximum drawdown itself. 

The record also stores the price at which the drawdown occurred, along with the entry price, take profit level, and stop-loss price set for the trade. Finally, it indicates whether the event took place during a backtesting phase.

## Interface MaxDrawdownContract

The `MaxDrawdownContract` provides information when a new maximum drawdown is detected for a trading position. 

It gives you details like the trading symbol, the current price, and when the update occurred. 

You'll also find the names of the strategy, exchange, and timeframe being used, along with the signal data related to the position.

A key part of this information is whether the update is from a backtest or live trading environment.

This data is invaluable for risk management – letting you react to changes in position value and protect your capital.


## Interface LiveStatisticsModel

This `LiveStatisticsModel` provides a wealth of information about your live trading performance. It essentially gives you a snapshot of how your strategy is performing, calculated directly from your live trading results.

You'll find details on the number of trades executed, broken down by wins, losses, and total events.  Key performance indicators like win rate, average profit/loss (PNL), and total PNL are included, all expressed as percentages. 

Beyond just raw profit, it delves into risk-adjusted metrics like Sharpe Ratio, Sortino Ratio, and Calmar Ratio – these help you understand how much risk you're taking to achieve your returns.

The model also offers insight into trade durations, volatility (standard deviation), and even analyzes consecutive winning and losing streaks. You can see how the market is trending and if buyer or seller pressure is dominating.

A lot of the values are marked as "null if unsafe" – this means the calculation couldn't be reliably performed (likely due to a lack of data or unexpected results).  Generally, higher values are better for metrics like Sharpe Ratio, average PNL, and expectancy.

## Interface InfoErrorNotification

This notification signals that a background task encountered a problem it can potentially recover from. 

It's designed to provide information about errors happening behind the scenes, rather than critical failures.

Each notification has a unique identifier (`id`) and a clear explanation of the issue in the `message` field.  You'll also find details about the error itself, including a stack trace and related data, in the `error` property. Importantly, these notifications always indicate that the error occurred in a live trading context, not during a backtest (`backtest: false`). The `type` is always set to "error.info" to distinguish it from other notification types.

## Interface IdlePingContract

This interface represents an event that occurs when a trading strategy is in an idle state, meaning it’s not currently responding to any active trading signals.

Think of it as a heartbeat, confirming the strategy is waiting for new instructions.

The event provides key details about the situation: the trading pair (symbol), the name of the strategy itself, the exchange where it's running, and whether it’s a live trade or a backtest simulation.

It also includes the current market price at the time of the idle ping and a timestamp to precisely mark when this idle state occurred, which is meaningful either in real-time or within the historical context of a backtest.

You can listen for these idle ping events to monitor a strategy's lifecycle and understand its periods of inactivity.

## Interface IWarmCandlesParams

This describes the settings needed to fetch historical candle data and save it for later use, like before a backtest. You'll specify the trading pair you're interested in, like "BTCUSDT," and the exchange it's traded on. The candle interval, like a 1-minute or 4-hour chart, also needs to be defined. 

Finally, you'll set the start and end dates to define the time range for which you want to download those historical candles. It’s a way to prepare the data your backtest will use.

## Interface IWalkerStrategyResult

This interface defines the structure of data returned for a single strategy when you're comparing multiple trading strategies. 

Each result contains the name of the strategy being evaluated. 

You'll also find a set of statistics detailing how that strategy performed during backtesting.

A key metric value is included, which is used to determine the strategy's relative performance; it can be null if the strategy's results are invalid. 

Finally, the rank provides a straightforward way to see how the strategy stands against others, with a rank of 1 signifying the best performing strategy.


## Interface IWalkerSchema

The Walker Schema defines how to run A/B tests across different strategies. Think of it as a blueprint for setting up a comparative analysis of your trading approaches. 

You’ll give it a unique name (walkerName) for easy identification, and can add a note (note) for your own records. 

It specifies which exchange and timeframe (frameName) to use for all the strategies you're comparing. 

The core of the schema is the strategies array – this lists the names of the strategies you want to pit against each other, ensuring they’ve been properly registered beforehand.

You choose a metric (metric) like Sharpe Ratio to gauge performance and compare the strategies. 

Finally, you can provide optional callbacks (callbacks) to customize the testing process with your own event handling.

## Interface IWalkerResults

The `IWalkerResults` interface holds all the information gathered when a walker finishes comparing different trading strategies. 

It essentially represents the final outcome of a backtesting run.

Here's what you'll find:

*   **symbol:**  The ticker symbol of the asset that was being traded (e.g., 'BTCUSDT').
*   **exchangeName:** The name of the cryptocurrency exchange used for the backtest (e.g., 'Binance').
*   **walkerName:** Identifies the specific walker that performed the testing.
*   **frameName:**  Specifies the timeframe used for the backtest (e.g., '1h', '1d').

## Interface IWalkerCallbacks

This interface provides a way to hook into the backtest process and receive updates as it runs. Think of it as a way to get notified about what's happening behind the scenes when testing different trading strategies.

You can use these callbacks to:

*   `onStrategyStart`: Get notified when a new strategy and symbol combination begins testing.
*   `onStrategyComplete`: Receive the final results and key metrics after a strategy’s backtest finishes.
*   `onStrategyError`: Be alerted if a strategy encounters an error during its backtest. This helps you diagnose and fix any problems quickly.
*   `onComplete`:  Know when the entire backtest process is finished and all strategies have been evaluated.

These callbacks allow you to build custom tools or visualizations that track and analyze the backtest progress.

## Interface ITrailingTakeCommitRow

This interface represents a queued action for a trailing take commit strategy. Think of it as a scheduled instruction to adjust your trade based on a trailing price.

It contains information about the type of action being taken ("trailing-take"), the percentage shift that needs to be applied to the stop-loss, and the price at which the trailing was initially set.  Essentially, it's a record of when and how a trailing stop-loss should be adjusted.

## Interface ITrailingStopCommitRow

This interface describes a queued action related to a trailing stop order. It represents a single step needed to adjust a trailing stop, indicating that the action involves a "trailing-stop" adjustment. The `percentShift` property defines the percentage change applied to the stop price, and `currentPrice` holds the price level at the time the trailing stop was initially established or last modified. Think of it as a record of a specific change to a trailing stop, outlining the amount of the shift and the starting price.

## Interface IStrategyTickResultWaiting

The `IStrategyTickResultWaiting` represents a situation where a planned trading signal is patiently waiting for the price to reach a specific entry point. You'll receive this type of result repeatedly as the system continuously monitors the price.

It’s different from the initial “scheduled” result, which only appears when the signal is initially created.

Here's a breakdown of what the properties tell you:

*   `action`: Confirms that the signal is currently in a “waiting” state.
*   `signal`: Contains all the details of the planned trading signal.
*   `currentPrice`: The current price being monitored against the signal's entry point.
*   `strategyName`: The name of the strategy that generated the signal.
*   `exchangeName`: The exchange where the trading is planned.
*   `frameName`: The time frame used for the strategy (e.g., 1-minute, 5-minute).
*   `symbol`: The trading pair being monitored (e.g., BTCUSDT).
*   `percentTp` and `percentSl`: These values are always zero while waiting, as no position is yet open.
*   `pnl`: Represents the theoretical, unrealized profit and loss if the signal were to trigger now.
*   `backtest`: Indicates if the data is from a backtest or live trading.
*   `createdAt`: Records the timestamp when this particular tick result was generated.

## Interface IStrategyTickResultScheduled

This interface represents a tick result specifically when a strategy has scheduled a trade – meaning it's waiting for the price to reach a predefined entry point. It’s triggered when the strategy generates a signal that includes a target price.

The result contains details about the signal that was scheduled, including the strategy and exchange names, the timeframe being used, and the trading symbol. You'll also find information about the current price at the time the signal was scheduled and whether the event occurred during a backtest or in live trading. Essentially, it’s a snapshot of the conditions when the strategy decided to schedule a trade and is ready for activation.

Here's a breakdown of the information included:

*   **action:** Confirms this is a scheduled event.
*   **signal:** Holds all the data related to the scheduled trade signal.
*   **strategyName:** Identifies which strategy generated the signal.
*   **exchangeName:** Specifies the exchange being used.
*   **frameName:** Indicates the timeframe of the chart.
*   **symbol:** The trading pair (e.g., BTCUSDT).
*   **currentPrice:** The price at the time the signal was scheduled.
*   **backtest:**  Shows if this is a backtest or live trade.
*   **createdAt:** A timestamp marking when the event occurred.

## Interface IStrategyTickResultOpened

This interface represents a notification that a new trading signal has been created and is now active. It's a key event that happens after a signal is validated and saved.

You'll see this notification when a new signal is triggered.

The notification includes details like the name of the strategy that generated the signal, the exchange and timeframe it applies to, the symbol being traded, and the current price at the signal's open.  It also tells you whether the signal originated from a backtest or a live trading environment and when it was created. The newly created signal itself, complete with a unique ID, is also included.


## Interface IStrategyTickResultIdle

This interface represents a tick result indicating that a trading strategy is currently in an idle state, meaning it’s not actively executing any trades. It provides details about the context of this idle state, including the strategy's name, the exchange being used, the timeframe of the price data, and the trading symbol involved. You’ll find information like the current price and whether this data originates from a backtest or a live trading environment. It's essentially a record showing when and why your strategy paused its actions.

## Interface IStrategyTickResultClosed

This interface represents the result you receive when a trading signal is closed, providing a snapshot of the final state and performance. It bundles together crucial information about the closure, including the reason for closing – whether it was due to time expiry, hitting a take profit/stop loss level, or a manual closure. You'll find details like the final VWAP price, the exact timestamp of the closure, and a comprehensive profit/loss calculation that factors in fees and slippage. 

The data also includes tracking information such as the strategy name, exchange, time frame, and trading symbol. To distinguish backtest runs from live trading, a boolean flag is included. For user-initiated closures, a unique close ID is provided, and there's also a timestamp indicating when the result was created.  The completed signal object contains the original parameters used when the signal was first generated.

## Interface IStrategyTickResultCancelled

This interface represents a special kind of trading result: when a planned signal doesn't actually trigger a trade, usually because it was cancelled or stopped out before a position could be opened.

It gives you details about why the signal didn't execute. You'll find information like the signal itself, the price at the time of cancellation, and exactly when it happened, all linked to the strategy, exchange, timeframe, and symbol involved.

It also includes helpful details for tracking like the strategy’s name, the exchange used, and if it was a backtest or live trade. A unique ID is provided if the signal was intentionally cancelled by the user. Finally, a timestamp indicates when the result was recorded, referencing either the candle time during backtesting or a live execution context.

## Interface IStrategyTickResultActive

This interface represents a tick result when a trading strategy is actively monitoring a signal, waiting for a take profit, stop loss, or time expiration. It holds all the details about the situation, including the signal being watched, the current price used for monitoring, and the names of the strategy, exchange, and timeframe.

You’ll find information about the trading symbol, progress toward take profit and stop loss, and the unrealized profit and loss (pnl) for the active position, considering fees and slippage.  It also indicates if the data originates from a backtest or live trading environment. 

Finally, it tracks the timestamps of when this tick result was created and the last processed candle, primarily for use within the backtesting logic to manage data chunks.

## Interface IStrategySchema

The IStrategySchema defines how your trading strategies are set up and registered within the backtest-kit framework. Think of it as a blueprint for your strategy, telling the system how it generates trading signals and manages risks.

It requires a unique name to identify the strategy, and allows for a developer note to add helpful context.

The `interval` property sets a minimum time between signals, which helps prevent the system from being overwhelmed with requests.

The heart of the schema is the `getSignal` function – this is where your strategy’s logic lives; it takes current data and calculates whether to buy, sell, or hold. You can even use it to create signals that wait for a specific price level to be reached.

You can also include lifecycle callbacks (`callbacks`) like `onOpen` and `onClose` to trigger specific actions at the beginning and end of a strategy run. Risk management is supported through optional `riskName` or `riskList` identifiers.  Lastly, it provides optional settings for attaching actions and a place for your own custom data (`info`) to monitor strategy performance.

## Interface IStrategyResult

This interface represents the result of running a trading strategy during a backtest. It’s essentially a way to package up all the important information about a single strategy's performance.

Each `IStrategyResult` includes the strategy's name, so you know which strategy produced the results. You'll also find a detailed set of statistics about how the strategy performed, covering things like total profit, win rate, and drawdown. 

Importantly, it also holds the value of the optimization metric you're using to rank strategies – this lets you easily compare different strategies against each other. Finally, it records the timestamps of the first and last signals generated by the strategy, allowing you to understand the timing of its activity.

## Interface IStrategyPnL

This interface describes the profit and loss (PNL) results for a trading strategy. It shows you how much money you've made or lost, taking into account fees and slippage – those little costs that pop up when buying and selling. 

The `pnlPercentage` tells you the percentage change in your investment, positive or negative. To get a feel for the actual dollar amount, `pnlCost` calculates the absolute profit or loss in USD based on how much you initially invested (`pnlEntries`). 

Finally, `priceOpen` and `priceClose` represent the prices at which you entered and exited your positions, respectively, after those fees and slippage are factored in.

## Interface IStrategyCallbacks

This interface lets you hook into key moments in a trading strategy's lifecycle. Think of it as a way to listen in and react to what's happening with your signals.

You can define functions to be triggered on every market tick (`onTick`), when a new signal is opened (`onOpen`), when a signal is actively monitored (`onActive`), or when there's no active signal (`onIdle`).

There are also callbacks for when a signal is closed (`onClose`), scheduled for later (`onSchedule`), or cancelled before execution (`onCancel`). `onWrite` allows you to interact with how the signal data is stored, mostly for testing.

You can also be notified when a signal reaches a partial profit (`onPartialProfit`), a partial loss (`onPartialLoss`), or breakeven (`onBreakeven`). Two special "ping" callbacks, `onSchedulePing` and `onActivePing`, give you the chance to check on scheduled and active signals more frequently than the main strategy interval, which is useful for tasks like timing out signals or dynamically adjusting positions.

## Interface IStrategy

This interface, `IStrategy`, outlines the core methods for how your trading strategies execute. Think of it as a blueprint for how your strategies interact with the backtest-kit framework.

The `tick` method is the workhorse – it runs on each price update, checking for signals and TP/SL conditions.  `getPendingSignal` and `getScheduledSignal` are helper methods to retrieve the signals currently influencing the strategy.

There's a whole set of methods (`getBreakeven`, `getTotalPercentClosed`, `getTotalCostClosed`, `getPositionEffectivePrice` etc.) which focus on the health and state of the position, often involving calculations around costs and profit/loss.  These help track things like how much of your investment remains and how much profit or loss you've made.

The `backtest` method is vital for testing a strategy against historical data. `stopStrategy`, `cancelScheduled` and `closePending` give you control over the strategy's operation.

`createSignal`, `createTakeProfit`, and `createStopLoss` allow for external processes to influence the strategy’s actions.  Finally, several methods like `trailingStop`, `breakeven`, and `averageBuy` are methods users can use to control parts of the strategy’s behavior. Many validation functions exist for `trailingStop`, `breakeven`, and `averageBuy` which can be safely called at any time. They return boolean to signal success of an action.


## Interface IStorageUtils

This interface defines the core methods any storage adapter used by backtest-kit needs to provide. Think of it as the blueprint for how your storage system interacts with the trading framework. 

It includes functions for responding to different signal lifecycle events: when a position is opened, closed, scheduled, or cancelled.

You'll also find methods for retrieving signals – specifically, finding a signal by its unique ID and listing all signals currently stored.

Finally, there are dedicated functions to process active and schedule pings, which are used to keep track of the update timestamps for signals that are currently open or scheduled. These ensure the system knows when signals last had activity.

## Interface IStorageSignalRowScheduled

This interface defines the structure of a signal row that's been scheduled for execution. It holds key information about the signal's state.

The `status` property confirms that the signal is currently scheduled, meaning it's waiting for a specific time to be acted upon.

The `currentPrice` represents the price of the asset at the time the signal was scheduled, essentially a snapshot of the market conditions when the scheduling took place. This is useful for ensuring consistent execution based on the initial price.

## Interface IStorageSignalRowOpened

This interface represents a signal that has been opened, indicating a trade has begun. It contains essential information about the signal’s current state.

The `status` property simply confirms that the signal is currently 'opened'. 

The `currentPrice` tells you the VWAP price at the moment the signal was triggered, providing a benchmark for performance evaluation. This price corresponds to the `currentPrice` found within the `IStrategyTickResultOpened` object.

## Interface IStorageSignalRowClosed

This interface represents a signal that has been closed, providing details about its performance and closure. It’s specifically used when a trading signal is finished and you need to analyze its results.

You'll find key information here like the profit and loss (PNL) generated by the signal, the final price at which it was closed, and the reason why it was closed.  It also provides a timestamp marking exactly when the signal’s lifecycle concluded.

Think of it as a complete record of a finished trading signal, including the financial outcome and the circumstances of its closure.


## Interface IStorageSignalRowCancelled

This defines a specific type of signal record used within the backtest-kit framework, representing a signal that has been cancelled. It's a simple structure; the key piece of information is the `status` property, which is always set to "cancelled". This indicates that the signal, previously active, is no longer valid or should not be acted upon. Think of it as marking a trade idea as no longer relevant.

## Interface IStorageSignalRowBase

This interface defines the core information needed to store a signal. It ensures that every signal has a record of when it was created and last updated, which is crucial for tracking its lifecycle.  Each signal also gets a priority value, which helps manage the order in which signals are processed. Think of it as a way to ensure the most important signals are handled first, regardless of whether you’re running a live trading system or a backtest. The `createdAt` and `updatedAt` values are timestamps linked to the moment a strategy generated the signal, while `priority` is essentially a unique identifier for ordering signals.

## Interface IStateParams

`IStateParams` helps you organize and set up initial values for your trading signals. Think of it as a way to define how your signals are grouped together and what their starting point is. 

You specify a `bucketName`, which acts like a folder to keep related signals tidy – maybe you'd use "trade" for signals related to trade execution or "metrics" for performance data. 

Then, you provide an `initialValue` that's used when a signal doesn't have any previously saved data. This sets the default state of the signal from the beginning.

## Interface IStateInstance

The `IStateInstance` interface provides a way to manage and track information related to individual trading signals. Think of it as a container for keeping records of things like peak unrealized profit and loss, or how long a trade has been open.

It's designed to be flexible, allowing you to store different types of data for each trade. This is especially helpful when building strategies that use machine learning models, as you can use it to monitor how well those models are performing over time.

The `waitForInit` method is used to set up the state when it's first created. `getState` lets you retrieve the current state at a specific point in time—it also includes a safeguard to prevent looking into the future. `setState` allows updating the state, with a mechanism that ensures restarts of a backtest don't corrupt ongoing data. Finally, `dispose` is used to clean up any resources used by the state instance when it's no longer needed.

## Interface ISizingSchemaKelly

The `ISizingSchemaKelly` interface defines how to size trades using the Kelly Criterion. It’s specifically used when you want to calculate your bet size based on your expected return and risk. 

This schema requires you to specify the `method` as "kelly-criterion", indicating that you're using the Kelly Criterion.  You also need to set the `kellyMultiplier`, which controls how aggressively you apply the Kelly Criterion – a smaller value like 0.25 (the default) represents a more conservative approach, while larger values increase the bet size.


## Interface ISizingSchemaFixedPercentage

This schema dictates a trading sizing strategy where the size of each trade is determined by a fixed percentage of your available capital. 

Essentially, you define a `riskPercentage` – a number between 0 and 100 – which represents the maximum portion of your capital you're willing to risk on any single trade. 

The `method` property is always set to "fixed-percentage" to identify this specific sizing approach.

## Interface ISizingSchemaBase

This interface defines a foundational structure for sizing configurations within the backtest-kit framework. Each sizing schema needs a unique identifier, represented by `sizingName`, to distinguish it from others. 

You can also add a `note` to provide additional context or documentation for developers.

To control risk, `maxPositionPercentage` sets the limit on how much of your account can be in a single trade, expressed as a percentage. The `minPositionSize` and `maxPositionSize` properties enforce absolute minimum and maximum trade sizes. 

Finally, `callbacks` provide a way to customize the sizing process with lifecycle hooks, allowing you to react to specific events.

## Interface ISizingSchemaATR

This schema defines a sizing strategy that relies on the Average True Range (ATR) to determine trade size. 

It's designed for situations where you want to manage risk based on market volatility.

The `method` property confirms you're using an ATR-based sizing approach. 

`riskPercentage` specifies the maximum percentage of your capital you're willing to risk on any single trade, typically expressed as a value between 0 and 100.  The `atrMultiplier` value then dictates how the ATR is used to set the stop-loss distance, influencing the size of the position based on how much the price fluctuates.

## Interface ISizingParamsKelly

The `ISizingParamsKelly` interface defines the parameters needed for sizing trades using the Kelly Criterion within the backtest-kit framework. It primarily focuses on providing a logger to help with debugging and understanding how the sizing calculations are being performed. Essentially, it's a way to get feedback on the sizing process and ensure it's working as expected. The key property is `logger`, which is an object used to record messages during the backtest execution.

## Interface ISizingParamsFixedPercentage

This interface defines how much of your capital you'll use for each trade when using a fixed percentage sizing strategy. It's pretty straightforward: you specify a logger to help track what's happening during your trading simulations. The logger allows you to see details about the sizing calculations and any potential issues.


## Interface ISizingParamsATR

This interface defines the settings you use when determining how much of your capital to allocate to a trade, specifically when using an Average True Range (ATR) based sizing strategy. It primarily includes a logger, which helps you keep track of what's happening and debug any issues in your trading logic. Think of it as a way to monitor and troubleshoot the sizing process as your trades are being executed.

## Interface ISizingCallbacks

The `ISizingCallbacks` interface allows you to hook into the sizing process within the backtest-kit framework. Specifically, it provides a way to observe and potentially influence how position sizes are determined.

The `onCalculate` callback is triggered immediately after the framework computes the size of a trade. Think of it as a notification letting you know what size was calculated, along with any relevant parameters used in that calculation. You can use this callback to log the size for review, perform checks to make sure it’s within expected ranges, or even adjust it—though that's a more advanced use case.

## Interface ISizingCalculateParamsKelly

To help you determine optimal bet sizes using the Kelly Criterion, this interface defines the necessary input values. You'll need to provide a win rate, expressed as a decimal between 0 and 1, representing the percentage of successful trades.  Also, specify the average win/loss ratio; this tells the system how much you typically win compared to how much you lose on each trade.  These parameters together allow the framework to calculate a Kelly sizing recommendation, aiming to maximize long-term growth while managing risk.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the data needed when you're sizing your trades using a fixed percentage approach. Essentially, it tells the backtest kit how much of your capital to allocate based on a predetermined percentage. 

It requires you to specify the stop-loss price – this is the price at which your trade will be automatically closed to limit potential losses. Think of it as the maximum amount you’re willing to risk on this particular trade.


## Interface ISizingCalculateParamsBase

This interface defines the foundational information needed for determining how much of an asset to trade. It includes the trading symbol, like "BTCUSDT", so the system knows exactly what you're trading. 

You'll also find the current balance of your trading account and the anticipated entry price for the trade. These values provide context for calculating the appropriate trade size.


## Interface ISizingCalculateParamsATR

This interface defines the configuration needed when calculating position sizes using an ATR (Average True Range) based method. Essentially, it provides the necessary values for that calculation.  You'll specify that the sizing method is "atr-based," and then provide the current ATR value itself as a number. This ATR value represents the market's volatility and is used to determine how much to trade.

## Interface ISizing

The `ISizing` interface is all about figuring out how much of an asset to buy or sell. It's the core of how a trading strategy decides on position sizes.

Think of it as a calculation engine that takes into account factors like your risk tolerance and account balance.

The `calculate` property is the key function – it's what you use to define your sizing logic. You give it some data about the trade, and it returns the size of the position.

## Interface ISignalRow

This `ISignalRow` interface represents a complete trading signal within the backtest-kit framework. Think of it as a single instruction for your trading system, containing all the necessary details to execute a trade. Each signal gets a unique ID upon creation, making it easy to track.

It includes key information like the cost of the position, the entry price, the expected holding time, and identifiers for the exchange, strategy, and timeframe used.  You'll find details about when the signal was created and when the position became active. It specifies the trading pair (like BTCUSDT) and flags whether the signal was pre-scheduled.

The signal also tracks advanced information, such as partial profit or loss closures, allowing for a detailed calculation of overall profit.  It incorporates trailing stop-loss and take-profit functionality, dynamically adjusting price targets. DCA (Dollar Cost Averaging) history is also recorded for each signal.

Finally, it stores peak and fall prices encountered during the position's life, along with a timestamp for the signal's creation. This detailed record allows for a thorough post-trade analysis of performance.


## Interface ISignalIntervalDto

This data object represents a signal that's designed to be delivered in batches, useful for optimizing how frequently trading signals are requested. Think of it as a way to group signal requests together – instead of getting one signal at a time, you can retrieve them in intervals. Each signal within this batch has a unique ID, ensuring you can track and manage them individually even though they're bundled together. The system will hold off on retrieving the next signal until the specified interval has passed.

## Interface ISignalDto

This interface, `ISignalDto`, defines the structure for signals used within the trading framework. It represents a single trading instruction, containing all the necessary details to execute a trade. Each signal will have a unique ID, automatically generated if you don't provide one. 

The signal includes the ticker symbol being traded, whether the position should be long (buy) or short (sell), and a descriptive note explaining the reason behind the signal. You'll also specify the entry price, take profit target, and stop-loss levels to manage the trade's risk and reward. 

You can also set a time limit, specified in minutes, after which the position will automatically expire; use infinity to keep the position open until a profit target, stop-loss, or manual closure. Finally, the signal includes the cost of entering the position.


## Interface ISignalCloseRow

This interface, `ISignalCloseRow`, builds upon the existing `ISignalRow` and provides extra details specifically for when a signal is closed. It's designed to handle situations where a user manually closes a signal, like when they decide to stop following a trading strategy.  

If a signal is closed by a user, this interface includes `closeId`, which is a unique identifier for that particular closure.  You'll also find `closeNote`, allowing the user to add a short explanation about why they chose to close the signal. These properties aren’t present when a signal closes automatically.

## Interface ISessionInstance

This interface outlines how different backtest kit components interact with session data. Think of a session as a container for temporary information needed during a trading simulation, specifically tied to a particular symbol, strategy, exchange, and timeframe. It’s designed to hold things that change frequently, like results from AI models or the state of indicators, to keep everything running efficiently within a single trading run. 

The `waitForInit` method is used to get the session ready. `setData` lets you store new values, associating them with a specific timestamp.  `getData` retrieves those values, but it's smart enough to avoid peeking into the future – it won’t return data from a later point in time. Finally, `dispose` cleans up any resources the session was using when you're finished with it.

## Interface IScheduledSignalRow

The `IScheduledSignalRow` represents a signal that doesn't execute immediately. It's essentially a signal on hold, waiting for the market price to reach a specific level (`priceOpen`). Think of it as a delayed order – you want to enter a trade only when the price hits a certain point.

Initially, the signal is “pending” at the time it was scheduled (`scheduledAt`), but once the price reaches that target (`priceOpen`), the signal becomes active and its pending time is updated to reflect the actual wait time. This lets you plan entries based on expected price movements without needing to constantly monitor the market. The `priceOpen` property defines that target price.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled trading signal that may have been canceled by a user. It builds upon the basic scheduled signal information, adding details specifically for cancellations. If a user cancels a scheduled signal, a `cancelId` will be assigned to identify the cancellation, and a `cancelNote` allows for adding a reason or explanation for the cancellation. These properties are only present when a signal has been explicitly canceled by a user.

## Interface IScheduledSignalActivateRow

This interface represents a signal that's scheduled to be activated, and specifically includes information about when it was triggered by a user action. It builds upon the standard scheduled signal data, adding fields to track a unique activation ID and a note explaining why the user initiated the activation. Think of it as a way to log who and why a scheduled signal was manually started. If a signal is activated automatically, these fields won't be present; they're only used when a user directly triggers the signal.

## Interface IRuntimeRange

This interface, `IRuntimeRange`, helps define the timeframe for your backtesting simulations. It essentially tells the backtest kit when to start and stop executing your trading strategy. You'll find two key properties here: `from` specifies the beginning date of the backtest, and `to` indicates the ending date. Think of it as setting the boundaries for your historical trading analysis.

## Interface IRuntimeInfo

This interface provides important details about the current state of your trading simulation or live execution. It includes the symbol you're trading, like "BTCUSDT," and the timeframe being analyzed. If you’re running a backtest, you'll see the specific date range covered.

You can also pass along custom information through the `info` property, which is handy for monitoring or creating specialized reports. 

The `context` object tells you details about the environment, such as the exchange name, the strategy you're using, and the timeframe (frame) being applied. Crucially, it tells you the exact timestamp and current price for the data being processed. Finally, a `backtest` boolean will confirm whether the code is running a historical simulation, and not live trading.

## Interface IRunContext

The `IRunContext` interface acts as a central hub, providing everything a function needs to operate within the backtest-kit framework. Think of it as a complete package – it bundles together information about the trading strategy, the exchange it's connected to, and the current state of the backtest. It’s designed to give you all the data you need to make decisions, without having to piece together information from different sources. This context is passed to functions so they have access to both routing information (like which exchange and strategy are involved) and runtime details (like the trading symbol and the current timestamp).

## Interface IRiskValidationPayload

This object holds the information needed when you're checking if a trade is safe to execute. Think of it as a snapshot of your portfolio's situation at a given moment.

It includes the signal that triggered the potential trade, allowing you to evaluate the risk associated with that specific opportunity.

You’ll also see the total number of positions currently open and a detailed list of those positions, providing a comprehensive view of your portfolio's exposure. This helps in making informed decisions about risk management.

## Interface IRiskValidationFn

This defines a function that helps you ensure your trading strategy is behaving responsibly. It's used to check if a trade meets certain risk criteria before it's executed. If the trade is okay according to your rules, the function does nothing. If it violates your rules, it provides a reason why the trade is being rejected – a clear explanation of what went wrong. The function can also signal a rejection by throwing an error, which is then automatically translated into a user-friendly rejection reason.

## Interface IRiskValidation

This interface helps you define rules to make sure your risk assessments are accurate and reliable. Think of it as setting up checks to ensure the data you're using is valid. 

You specify these checks using a function – `validate` – which actually performs the validation logic. 

To make things clear, you can also add a `note` to explain what the validation is doing and why it's important. This is especially useful when collaborating with others or documenting your framework.

## Interface IRiskSignalRow

This interface, IRiskSignalRow, helps manage risk during trading. It builds upon existing signal data by adding crucial details like the entry price (priceOpen) and the initial stop-loss and take-profit levels that were set when the trading signal was created. This extra information is particularly useful for validating and controlling risk exposure, ensuring positions are handled according to the original plan. You'll find the entry price, initial stop-loss, and initial take-profit prices all readily available within this structure.

## Interface IRiskSchema

This interface defines a way to create reusable risk profiles for your trading strategies. Think of it as a blueprint for how you want to manage and control risk within your portfolio.

Each risk profile has a unique identifier, allowing you to easily reference it. You can also add a note to describe the purpose of the profile.

You can also attach callbacks to react to events like when a trade is rejected or allowed.  Most importantly, you’ll define custom validations to enforce your specific risk rules – these are the core of how you control your portfolio's behavior. The validations can be provided as functions or pre-defined configurations.

## Interface IRiskRejectionResult

When your risk validation checks fail, this result object tells you why. It provides a unique ID so you can track the specific rejection event. More importantly, the 'note' field gives you a clear, human-readable explanation of the reason for the failure, helping you understand and fix the underlying issue.

## Interface IRiskParams

This interface defines the parameters used when setting up your risk management system. It bundles together essential pieces of information, including the name of the exchange you’re working with, a logger for debugging, a time service to handle time-sensitive operations correctly, and a flag to indicate whether you're in backtesting or live trading mode. 

Crucially, it includes an `onRejected` callback - this function gets called when a trading signal is blocked because it would violate your risk limits. It's a chance to understand why the trade was rejected, emit information about the rejection, and is used separately from other callbacks related to the risk schema.

## Interface IRiskCheckOptions

When you're doing complex trading strategies, sometimes you need to make sure certain actions happen in a very specific order, especially when multiple parts of your code are running at the same time. This `IRiskCheckOptions` setting lets you temporarily "reserve" a portion of your trading position.

Think of it like putting a hold on some assets so that all parts of your system see the updated availability *before* a final trade happens. 

The `reserve` property, if set to `true`, ensures this happens safely, preventing conflicts and unexpected behavior when multiple pieces of code are trying to adjust positions concurrently. It's all about making sure everyone's on the same page when it comes to risk management.


## Interface IRiskCheckArgs

The `IRiskCheckArgs` interface holds all the information needed to decide whether a new trade should be allowed. Think of it as a set of checks performed *before* a trading signal is even generated, ensuring the conditions are right. It gathers details like the trading pair involved (symbol), the signal itself, the name of the strategy requesting the trade, and information about the exchange and risk management setup. You’ll also find current price data and a timestamp for precise context. This is essentially a data package passed along to help evaluate if opening a position is safe and aligned with the trading plan.

## Interface IRiskCallbacks

This interface provides a way to be notified about the outcomes of risk checks during trading. You can use it to react to situations where a trading signal is blocked due to risk limits, or to celebrate when a signal is approved and can proceed. Specifically, `onRejected` will be called when a signal is prevented, and `onAllowed` will be called when a signal successfully passes all risk checks. These callbacks let you build custom logic around these events, like logging, or adjusting trading behavior.

## Interface IRiskActivePosition

This interface describes an active trading position, the kind of thing a trading strategy holds open. It contains all the key details about a position, including which strategy created it, which exchange it's on, and its symbol like "BTCUSDT". You'll find information here like the direction of the trade (long or short), the price at which it was entered, and any stop-loss or take-profit levels set. 

The interface also tracks how long the position is expected to last and precisely when it was opened. This information helps analyze risks and how different strategies interact.

## Interface IRisk

The `IRisk` interface is responsible for managing the risk associated with your trading strategies and ensuring they don't exceed defined limits. It allows you to check if a new trading signal is permissible based on your risk profile.

There are two ways to check a signal: `checkSignal` simply validates the signal against risk limits, while `checkSignalAndReserve` does the validation *and* reserves space for the position within the system's internal records – this is crucial for preventing multiple strategies from exceeding limits simultaneously.

Once a signal is validated and potentially reserved, you can then `addSignal` to officially register the new position. Conversely, when a position is closed, `removeSignal` informs the system so that the risk limits can be adjusted accordingly. It’s important to always follow a successful `checkSignalAndReserve` with either `addSignal` or `removeSignal` to keep the system's records accurate.

## Interface IReportTarget

This interface lets you choose exactly which kinds of data to record during your trading tests. Think of it like a checklist—you can pick and choose what information you want to see logged.

For example, you might want to enable logging for strategy actions, risk rejections, or breakeven points to understand how your trading logic is performing.

Alternatively, you could focus on specific milestones like highest profit or maximum drawdown to track progress and potential risks.

You can also control logging for performance metrics, scheduled signals, or even all the details of live trading, tailoring your data collection to your specific analysis needs. Each boolean property represents a different category of events you can choose to log.

## Interface IReportDumpOptions

This interface defines what information is included when you're exporting data from a backtest report. Think of it as a way to specify which details – like the trading symbol, strategy name, exchange, timeframe, signal ID, and walker optimization name – should be included in the report output. It lets you control what metadata accompanies your performance data. This is helpful for organizing and filtering large backtest results.

## Interface IRecentUtils

This interface defines how different systems can manage and access recently generated trading signals. It allows you to connect to various data storage solutions, like databases or in-memory caches, to keep track of signal history.

The `handleActivePing` method is used to receive new signal data and store it.

The `getLatestSignal` method lets you fetch the most recent signal for a specific trading setup – specifying the asset, strategy, exchange, timeframe, whether it's a backtest, and a time boundary. Importantly, it prevents looking into the future by ignoring signals created after the provided time.

Finally, `getMinutesSinceLatestSignalCreated` helps you determine how long ago the most recent signal was generated, again respecting that future data shouldn't be considered.


## Interface IPublicSignalRow

This interface, IPublicSignalRow, provides a view of a trading signal that's specifically designed to be shared and understood by users. It builds upon the core signal information with added details about the initial stop-loss and take-profit levels. Even if the strategy adjusts these levels later (like with trailing stops), you’ll always be able to see the original values that were set when the signal was created.

Here's a breakdown of what the information represents:

*   **Cost:** The initial investment required to enter the position.
*   **originalPriceStopLoss:** The initial stop-loss price you set.
*   **originalPriceTakeProfit:** The initial take-profit price you set.
*   **partialExecuted:** Shows how much of the position has been closed through partial exits.
*   **totalEntries:**  Indicates how many times you’ve added to the position (helpful for understanding dollar-cost averaging).
*   **totalPartials:**  Counts how many partial exits have been taken.
*   **originalPriceOpen:** The price at which you initially entered the trade.
*   **pnl:** The current unrealized profit or loss on the position.
*   **peakProfit:** The highest profit the position has reached.
*   **maxDrawdown:** The largest loss the position has experienced.



Essentially, IPublicSignalRow is about providing complete transparency to users, ensuring they understand both the current state and the original intentions behind each trading signal.

## Interface IPublicCandleData

This interface defines the structure for a single candlestick, representing price action over a specific time interval. Each candlestick includes key data points like the time it began (timestamp), the price when it started (open), the highest price reached (high), the lowest price seen (low), the price at the end (close), and the total trading volume during that time. Essentially, it’s a snapshot of market activity packed into one data object.


## Interface IPositionSizeKellyParams

This defines how to calculate your position size using the Kelly Criterion, a method for betting or trading based on probabilities.

It focuses on two key pieces of information: your win rate, which represents the percentage of trades that are profitable, and your win/loss ratio, reflecting the average amount you win compared to the average amount you lose. 

Essentially, it allows you to input your historical performance metrics to determine an optimal bet size that maximizes long-term growth. Providing these values helps the system calculate a suggested position size for your trades.


## Interface IPositionSizeFixedPercentageParams

This describes the settings you'd use when sizing your trades using a fixed percentage of your capital, but with a stop-loss order. Specifically, `priceStopLoss` tells the system the price at which you want to place your stop-loss order to limit potential losses on the trade. It's a crucial number for risk management within your backtesting strategy.

## Interface IPositionSizeATRParams

The `IPositionSizeATRParams` interface defines the settings needed for determining your position size based on the Average True Range (ATR). It primarily focuses on the ATR value itself, which represents the average price fluctuation over a specific period. This value is crucial for calculating how much capital you'll allocate to a trade, helping manage risk by adjusting position size according to market volatility. Essentially, a higher ATR suggests more volatility, potentially leading to a smaller position size.

## Interface IPositionOverlapLadder

This interface, `IPositionOverlapLadder`, helps you fine-tune how your backtest kit detects overlapping positions when using dollar-cost averaging (DCA). Think of it as defining a safety zone around each of your DCA purchase prices.

It lets you specify two percentages: `upperPercent` and `lowerPercent`.  `upperPercent` tells the system how far *above* each DCA level to look for potential overlaps, and `lowerPercent` defines how far *below* each level that triggers the overlap detection. These percentages are expressed as values between 0 and 100, making them easy to understand. 

Essentially, by adjusting these values, you control the sensitivity of the overlap detection system, helping to more accurately identify and handle situations where your DCA purchases might be conflicting.

## Interface IPersistStrategyInstance

This interface helps you manage how a trading strategy's data is saved and loaded for specific situations, like when you're backtesting. Think of it as a way to customize where and how the strategy remembers its progress. 

Each strategy instance—identified by a combination of the trading symbol, strategy name, and exchange—gets its own separate storage space. 

If you want to change how the default file-based storage works, you can build your own adapter that implements this interface. It provides methods to:

*   Initialize the storage space.
*   Read existing saved data.
*   Write updated data to the storage. You can even clear the data to start fresh.

## Interface IPersistStorageInstance

This interface defines how your custom storage solutions can interact with the backtest-kit framework. Think of it as a way to swap out the default file storage for something else, like a database or in-memory store.

There's one instance of this storage adapter used during backtesting and another used during live trading, keeping things separate for each mode.

When you need to load saved data, `readStorageData` fetches all the stored signals, organizing them by their unique IDs.

To save new or updated signals, `writeStorageData` takes a collection of signals and writes them to your chosen storage location.

Finally, `waitForInit` is used to set up the storage when it’s needed.

## Interface IPersistStateInstance

This interface defines how to manage persistent state for a trading strategy, specifically for a given combination of a signal and a bucket name. It's designed to help your strategy remember its progress even if it crashes.

Think of it as a way to save and load the important information your strategy needs to function correctly.

If you want to customize how your strategy stores this information – maybe using a database instead of a file – you'll implement this interface.

The `waitForInit` method sets up the storage initially.  `readStateData` retrieves previously saved data. `writeStateData` saves the current data, along with a timestamp. Finally, `dispose` cleans up any resources used, although the default behavior might just do nothing.

## Interface IPersistSignalInstance

This interface defines how trading strategies can save and load their signals. Think of it as a way to remember what a strategy learned during a backtest. 

Each strategy running on a specific symbol and exchange gets its own signal storage. 

If you want to customize how signals are stored—maybe in a database instead of a file—you can create a class that implements this interface. 

The `waitForInit` method prepares the storage for the strategy. `readSignalData` fetches the previously saved signals. Finally, `writeSignalData` saves the current state of the signals, or clears them if you pass `null`.

## Interface IPersistSessionInstance

This interface helps manage how trading sessions are saved and loaded, ensuring your work isn't lost even if something goes wrong. 

Think of it as a way to keep track of the state of a particular strategy, exchange, and frame – a specific combination within your backtesting setup.

You can use it to create your own custom ways of storing that session data, instead of relying on the default file-based system.

The `waitForInit` method sets up the storage when needed.  `readSessionData` retrieves previously saved information, `writeSessionData` saves new data, and `dispose` cleans up any resources when the session is finished.

## Interface IPersistScheduleInstance

This interface provides a way to manage how scheduled signals are saved and loaded for a specific trading setup – think of it as a personalized storage system for your automated trading decisions. It's designed so you can customize where and how these signals are kept, instead of relying on a default method.

The `waitForInit` method is like setting up the groundwork before you start saving anything; you'll use it to indicate if you’re starting from scratch or loading existing data. `readScheduleData` retrieves a previously saved signal, bringing back the instructions for your strategy.  Finally, `writeScheduleData` is for storing a new or updated signal, effectively recording your trading decisions for future use – and you can even use it to erase existing signals by setting the data to null.

## Interface IPersistRiskInstance

This interface helps you manage how your trading strategy’s risk positions are saved and loaded. Think of it as a way to customize where and how your strategy remembers its current risk exposure. It’s specifically designed to handle risk data related to a particular combination of a risk name and an exchange. 

If you want to change how this information is stored – perhaps you’d rather use a database instead of a file – you can create a custom adapter that implements this interface.

The `waitForInit` method allows you to prepare the storage area when your strategy starts up. `readPositionData` retrieves the saved risk positions from storage at a specific point in time. Finally, `writePositionData` allows you to save the current risk positions back to storage.

## Interface IPersistRecentInstance

This interface helps manage and store the most recent trading signal for a specific setup, like a particular symbol, strategy, or exchange. Think of it as a way to remember what signal was active last time, which is helpful when you're switching between live trading and backtesting.

The `waitForInit` method prepares the storage area for a particular combination of symbol, strategy and so on.  It essentially sets things up for that specific context.

`readRecentData` retrieves that most recently saved signal—the last active signal recorded for that setup.

Finally, `writeRecentData` saves a new signal to the storage area, marking it as the most recent for that particular trading setup and including a timestamp.

## Interface IPersistPartialInstance

This interface helps manage how your backtest keeps track of partial profits and losses for individual trading signals. Think of it as a way to save and load information about how a trade is doing *before* it's fully closed.

This persistence is organized by a combination of what you're trading (symbol), the specific strategy being used, and the exchange involved – effectively creating a unique scope for each.

If you want to store this data in a way that's not just the default file system method, you can create your own adapter that implements this interface.

The `waitForInit` method prepares the storage area when needed.  `readPartialData` retrieves previously saved information about a signal’s progress. Finally, `writePartialData` is used to record the current state of a signal's partial data.


## Interface IPersistNotificationInstance

This interface lets you customize how trading notifications are stored. Think of notifications as important events or messages related to your trades – things you want to remember or act upon.

This interface provides a way to control that storage, allowing you to use something other than the default file-based system. There's one instance of this storage used for backtesting and another for live trading.

The `waitForInit` method prepares the storage for use, while `readNotificationData` retrieves all stored notifications.  Finally, `writeNotificationData` saves new or updated notifications, associating each one with a unique identifier.

## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for a specific area within your backtesting system. Think of it as a way to manage persistent information, like chat history or other context-dependent details, that needs to survive between different parts of your backtest. 

It lets you load, save, check for the existence of, and list memory entries, and even perform a "soft delete" – removing a record without actually deleting the file from disk. This is useful for cleaning up old data while still keeping it accessible if needed. 

If you want to customize how memory is stored, you can create your own implementation of this interface to handle data in a different way, like using a database instead of files. The `waitForInit` method lets you prepare your storage when everything is set up. Finally, `dispose` gives you a way to clean up resources when you're done with the storage.

## Interface IPersistMeasureInstance

This interface defines how to store and retrieve cached data for backtest measures. Think of it as a way to save results so you don't have to recalculate them every time. 

It allows for a feature called "soft delete" where data can be removed from active use without actually being erased from disk – it’s marked as removed, but still available if needed later.

If you want to customize how the backtest-kit handles storing these measures (perhaps using a different storage method than the default file system), you can create your own adapter that implements this interface.

Here's what the interface requires:

*   `waitForInit`:  A way to prepare the storage for a specific data bucket.
*   `readMeasureData`:  Fetches a cached measure entry based on a unique key.
*   `writeMeasureData`: Saves a new measure entry to the cache, along with a timestamp.
*   `removeMeasureData`:  Marks an entry as deleted, keeping it on disk but excluding it from normal searches.
*   `listMeasureData`: Provides a way to see a list of all the available (non-deleted) cache keys.

## Interface IPersistLogInstance

This interface lets you customize how backtest-kit stores its log data. Instead of using the default file-based storage, you can build your own adapter to persist logs somewhere else, like a database.

The system uses a single, global log storage area for each process, meaning all logs from a backtest will end up in the same place.

Logs are organized and retrieved based on their unique IDs, allowing you to access specific entries when needed.

When creating your own storage adapter, you’ll need to implement `waitForInit` to prepare the storage and `writeLogData` to save log entries, making sure to avoid duplicates. `readLogData` is used to fetch all of the saved log data.

## Interface IPersistIntervalInstance

This interface helps manage how backtest-kit keeps track of which trading intervals have already happened for a specific set of data. Think of it as a way to remember that a particular signal has already been triggered.

It's used internally to ensure that certain actions only occur once per interval and data combination.

You can customize this behavior by providing your own implementation, which is useful if you want to store this information differently than the default file system approach.

Here's what the functions do:

*   `waitForInit`: Sets up the storage for a given interval.
*   `readIntervalData`: Retrieves information about a previously fired interval.
*   `writeIntervalData`: Records that an interval has been fired.
*   `removeIntervalData`:  Effectively resets a marker, allowing the interval to be triggered again.
*   `listIntervalData`: Provides a way to see all the intervals that have been fired but haven't been reset.

## Interface IPersistCandleInstance

This interface defines how backtest-kit stores and retrieves candle data for a specific trading symbol, timeframe, and exchange. Think of it as a way to persist your historical data so you don't have to constantly re-download it.

It lets you initialize the storage, read a chunk of candles within a given time range, and write new or updated candles back into storage. 

The `readCandlesData` method is particularly important: if it returns `null`, that means your data for that time range isn't complete and you need to fetch it from the original data source.

If you want to use a different way to store your candle data – perhaps a database or in-memory storage – you can create a custom implementation of this interface.

## Interface IPersistBreakevenInstance

This interface helps manage how breakeven data – the point where a trade becomes profitable – is saved and loaded. Think of it as a specialized memory for each trading strategy running on a particular exchange and for a specific trading instrument (like a stock or cryptocurrency). 

Each signal within a strategy has its own set of breakeven data, organized by a unique identifier. 

If you want to store this data in a place other than the default file-based storage, you can create your own adapter that implements this interface. 

The `waitForInit` method prepares the storage space when needed.
The `readBreakevenData` method retrieves previously saved breakeven data for a particular trading signal at a given time.
Finally, the `writeBreakevenData` method is used to save new or updated breakeven data for a signal.

## Interface IPersistBase

This interface outlines the basic operations needed for any custom storage adapter used within the backtest-kit framework. Think of it as a contract: if you build a way to store and retrieve data, this is what you need to be able to do. 

It includes methods for initializing persistence, reading individual entities, checking for their existence, writing new or updated entities, and listing all entities you’re managing. The `waitForInit` method ensures setup only happens once.  The `keys` method provides a way to iterate through all stored entities, which is helpful for checks and making sure everything is consistent.

## Interface IPartialProfitCommitRow

This object represents a request to take a partial profit on a trade. It’s essentially a message telling the system to close a portion of your current position.

It includes the `action` which is always "partial-profit" to identify the type of action, `percentToClose` which is the percentage of the position you want to close, and `currentPrice` which is the price at which the partial profit was actually executed. This data helps track exactly what happened during the backtest.


## Interface IPartialLossCommitRow

This interface represents a request to partially close a position, essentially a piece of an instruction to sell a portion of what you own. 

It tells the system that an action is being taken to reduce a position, and specifies what percentage of the position should be closed.

It also includes the price at which the partial closing happened, which is important for tracking and accounting.


## Interface IPartialData

This data structure helps save and load the progress of a trading signal. It focuses on capturing just the key information needed – specifically, the profit and loss levels that have been hit. 

Think of it as a snapshot of where a trade has been, allowing you to resume later.

The `profitLevels` and `lossLevels` properties store these levels as simple arrays. These arrays represent the data that was originally kept as sets, but needed to be converted for storage. This allows the trading system to remember important milestones achieved during a backtest.

## Interface IPartial

The `IPartial` interface manages how your trading signals track profit and loss. It's used by components like `ClientPartial` and `PartialConnectionService`.

Think of it as a system that monitors your signals and alerts you when they hit specific profit milestones – like 10%, 20%, or 30% profit. It does the same for losses.

The `profit` method handles times when a signal is making money, while the `loss` method deals with signals going the other way. When your trading strategy determines that a signal has reached a new profit or loss level, these methods are called to make sure you get notified.

Finally, the `clear` method is used when a signal is finished – whether it hit a take profit, stop loss, or simply expired. It removes the signal's data and cleans up resources.

## Interface IParseArgsResult

The `IParseArgsResult` object holds the information gathered when processing command-line arguments. It takes your initial input and adds flags that determine how the trading system will operate. Specifically, it tells you whether the system is set to run a backtest (simulating past performance), paper trade (practicing with live data), or engage in live trading. These flags control the core behavior of the trading system.

## Interface IParseArgsParams

This interface describes the information needed to run a trading strategy. Think of it as a blueprint for telling the backtest-kit what to do. It specifies things like which cryptocurrency pair to trade (symbol), the name of the specific trading strategy you want to use, which exchange you're connecting to, and the timeframe for the price data, like hourly or daily candles. Essentially, it provides the default settings for starting a backtest.


## Interface IOrderBookData

This interface defines the structure of order book data, which represents the current state of buy and sell orders for a specific trading pair.  It contains the symbol of the trading pair, along with arrays detailing the bids (prices buyers are willing to pay) and the asks (prices sellers are willing to accept).  Each bid and ask is represented as an object containing price and quantity, allowing you to see the depth of orders at different levels. This data is fundamental for understanding market liquidity and potential price movements.

## Interface INotificationUtils

This interface defines the core methods for any system that wants to send notifications about a trading strategy's activity. Think of it as a contract that ensures different notification methods – like email, SMS, or webhooks – all communicate events in a consistent way.

The `handleSignal` method is your go-to for general signal updates, covering events like when a trade is opened, closed, or altered. More specific signal notifications are handled by `handleSignalNotify`.

You’ll also find methods for more granular alerts related to profit-taking: `handlePartialProfit`, `handlePartialLoss`, and `handleBreakeven`.  `handleStrategyCommit` deals with broader strategy changes, encompassing several of these profit management features.

`handleSync` is used for keeping things in sync concerning open and closed signals.  When things go wrong, `handleRisk`, `handleError`, and `handleCriticalError` ensure you're informed about rejection, general errors, and serious issues respectively.  Validation problems are reported via `handleValidationError`.

Finally, `getData` lets you retrieve a list of all previously recorded notifications, while `dispose` gives you the ability to clear out that notification history.

## Interface INotificationTarget

The `INotificationTarget` interface lets you finely control which notifications your backtest or live trading system receives. Instead of getting bombarded with every possible notification, you can specify exactly the event types you're interested in, improving performance and reducing noise.

Think of it as a filter—you tell the system what kinds of updates you want to be informed about. If you don’t provide an `INotificationTarget`, all notifications are enabled by default.

You can subscribe to notifications related to:

*   **Signals:** Events like when a signal is opened, scheduled, closed, or canceled.
*   **Partial Profits:** Alerts when the price reaches a pre-defined partial profit level.
*   **Partial Losses:** Alerts when the price reaches a pre-defined partial loss level.
*   **Breakeven:** Notifications when the price reaches the breakeven point.
*   **Strategy Actions:** Confirmations when actions like partial profits, losses, or activations are committed.
*   **Signal Synchronization:** Updates when orders are filled or positions are closed in live trading.
*   **Risk Management:** Notifications when a signal is blocked by the risk manager.
*   **Informational Signals:** Manual or strategy-generated messages associated with active signals.
*   **Errors:** Both recoverable (common) and unrecoverable (critical) errors, as well as validation errors.



By carefully selecting which properties you enable within `INotificationTarget`, you tailor the information flow to your specific needs and optimize your monitoring process.

## Interface IMethodContext

This context object holds essential information about the current trading operation. Think of it as a little package that travels along, telling the system *which* strategy, exchange, and frame to use for the task at hand.  It’s automatically passed around by the system to ensure everything's aligned.

Specifically, it contains the names of the strategy, exchange, and frame schemas being utilized. The frame name will be blank when operating in live mode. It's how the system knows which specific configurations to load.


## Interface IMemoryInstance

This interface outlines how different memory storage systems—whether they’re local files, persistent databases, or dummy implementations for testing—should behave.

The `waitForInit` method ensures the memory system is ready before any operations are attempted.

The `writeMemory` method lets you store data with a unique ID, a descriptive label, and a timestamp.

The `searchMemory` method lets you find data using a search term, again considering a timestamp to only return relevant entries. It uses a special scoring system (BM25) to prioritize the most relevant results.

You can also `listMemory` to see all available entries, filtered by a specific timestamp.

If you need to delete a specific entry, use the `removeMemory` method.

The `readMemory` method retrieves a single entry by its ID, and it won't return data that's newer than a specified timestamp.

Finally, `dispose` is used to cleanly release any resources the memory instance is holding when it's no longer needed.

## Interface IMarkdownTarget

This interface lets you fine-tune which detailed reports your backtesting framework generates. Think of it as a way to pick and choose what information you want to see about your trading strategy's performance. 

You can enable reports for everything from the basic strategy signals (entry and exit) to more specialized things like risk rejections, breakeven events, and even portfolio heatmap analysis. 

There are controls for tracking performance metrics, scheduled signals, live trading activity, and in-depth backtest results with a full history of each trade. You can also opt into milestone tracking for things like highest profit and maximum drawdown. It's all about customizing the reporting to suit your specific needs and focus on the data that's most valuable to you.


## Interface IMarkdownDumpOptions

This interface defines the settings you can use to generate documentation in Markdown format. Think of it as a set of instructions for creating documentation files. 

It specifies details like where the files should be saved, what the filename should be, and what specific trading components – like a strategy, exchange, or timeframe – the documentation should focus on. You can use these properties to precisely target the documentation generation process, ensuring you get the right information in the right place. For instance, you can specify a path, filename, symbol, strategy, exchange, and timeframe to get focused results.

## Interface ILogger

The `ILogger` interface is how different parts of the backtest-kit framework communicate about what’s happening. It’s essentially a way to record events and information at varying levels of detail.

You can use it to write down general happenings, like when an agent starts or a session connects.

There are also specific log levels to help focus your attention:

*   `debug` is for very detailed information used primarily during development.
*   `info` records successful actions and general system activity.
*   `warn` flags potential issues that don't stop the system but should be investigated.

These logs help track events, troubleshoot problems, and monitor overall system health.

## Interface ILogEntry

ILogEntry represents a single entry in your backtest's log history, giving you a detailed record of what happened during the simulation. Each log entry has a unique ID and a level (log, debug, info, or warn) to indicate its importance.  It also includes timestamps, and optional context information like the method and execution environment it came from. You can see when the log was created, when it actually happened, and any related arguments that were passed. This comprehensive information helps you understand and debug your trading strategies.

## Interface ILog

The `ILog` interface lets you keep track of what's happening during your backtesting or trading simulations. It provides a way to see a complete history of log messages. The `getList` method is the key here; it allows you to retrieve all the log entries that have been recorded, so you can review them later to understand the sequence of events and identify any potential issues.

## Interface IHeatmapRow

This interface, `IHeatmapRow`, represents a single row in a heatmap displaying trading performance. It bundles a ton of statistics for a specific trading pair (like BTCUSDT) across all the strategies used.

You'll find key metrics like total profit/loss, Sharpe and Sortino ratios (measuring risk-adjusted return), and maximum drawdown (the biggest loss from a peak). It also breaks down trade data—how many wins, losses, win rates, average profits and losses, and the length of winning and losing streaks.

Beyond the basics, it provides details on things like expectancy (a prediction of profit per trade) and average peak/fall PNL (how high or low a trade went).

There’s also a good amount of information on trade durations and the behavior of buyers and sellers as reflected in price movement.  Finally, it includes a classification of the overall trend ("bullish," "bearish," etc.) and its strength and confidence. Essentially, it's a comprehensive snapshot of how a specific trading pair performed.

## Interface IFrameSchema

The `IFrameSchema` helps you define the scope of your backtesting simulations. Think of it as setting the stage – it specifies the time period and frequency of data used for your tests.

Each frame has a unique name for easy identification and you can add notes to explain what the frame represents.

You'll define the start and end dates of your backtest period, and the interval at which data points will be generated (like every minute, hour, or day). If you don't specify an interval, it defaults to one minute.

Optionally, you can provide callbacks to execute code at specific points in the frame's lifecycle.

## Interface IFrameParams

The `IFrameParams` object is essentially the set of instructions given when creating a "frame" within the backtest-kit system. Think of a frame as a self-contained unit of work during a backtest.

It combines the basic frame schema with a logger—a tool for recording debugging information.  The `logger` property allows you to track what's happening inside the frame to help diagnose problems or understand its behavior. The `interval` property provides a unique name or identifier for this particular frame, making it easier to manage and reference.

## Interface IFrameCallbacks

The `IFrameCallbacks` interface lets you hook into what happens as your backtest framework builds and prepares the time periods it will use for analysis. Specifically, the `onTimeframe` function gets called right after the framework creates the list of timeframes. This is your chance to check if those timeframes look correct, record some information about them, or do anything else that needs to happen once the timeframe data is ready. You’ll receive the array of dates, the start and end dates of the timeframe, and the interval used to generate them.

## Interface IFrame

The `IFrame` interface is a core component for creating the timelines your backtesting strategies will run on. Think of it as the mechanism that defines when your trading simulations will happen.

Specifically, the `getTimeframe` function allows you to request a list of dates and times for a particular trading symbol and a named timeframe (like "1h" for hourly data). This function then returns an array of those dates, which are evenly spaced according to the interval you've set up for that timeframe. This list of timestamps acts as the backbone of your backtest, dictating the order and timing of your simulated trades.

## Interface IExecutionContext

The Execution Context provides essential information about the current state of your trading strategy or exchange interaction. Think of it as a shared set of data that’s passed around to keep everything synchronized.

It includes details like the trading symbol (e.g., BTCUSDT), the exact timestamp of the current event, and whether the code is running in a backtesting environment (for historical data analysis) or in a live trading scenario.

This context is managed by the ExecutionContextService and is automatically available when you're performing actions like fetching historical candles or handling incoming ticks.


## Interface IExchangeSchema

The `IExchangeSchema` acts as a blueprint for how backtest-kit interacts with different cryptocurrency exchanges. It essentially defines how to retrieve and format data from a specific exchange.

Each schema needs a unique `exchangeName` to identify it. You can add a `note` for your own documentation purposes.

The most crucial part is `getCandles`, a function that fetches historical price data (candles) for a given trading pair and time range.  You'll use this to supply your backtest with historical market data.

`formatQuantity` and `formatPrice` handle how quantities and prices are represented, ensuring they conform to the exchange's specific rules. If you don’t provide them, a default Bitcoin precision is used.

`getOrderBook` and `getAggregatedTrades` are optional functions that provide access to order book data and aggregated trades, respectively – useful for more complex strategies. If not implemented, they'll trigger an error if used.

Finally, `callbacks` allows you to register functions that will be executed at specific points in the backtesting process, such as when new candle data becomes available.

## Interface IExchangeParams

This interface defines the configuration needed to connect to and interact with a cryptocurrency exchange within the backtest-kit framework. Think of it as a set of essential tools the framework uses to communicate with a real or simulated exchange.

You’ll need to provide functions for retrieving historical candle data, formatting order quantities and prices to match the exchange’s rules, fetching order books, and getting aggregated trade data. The framework will use these to execute your trading strategies.

Each function needs to know the symbol (the trading pair like BTC/USDT), the timeframe, and whether it's running a backtest.  A logger is also required for displaying debug information, and an execution context service provides context like the current symbol and backtest flag.  Essentially, it's the blueprint for how backtest-kit understands and interacts with a specific exchange.

## Interface IExchangeCallbacks

This section defines optional functions you can provide to the backtest kit to be notified about incoming data from an exchange. Specifically, `onCandleData` lets you know when candle (OHLCV - Open, High, Low, Close, Volume) data is received for a specific trading symbol and timeframe. You'll get details like the symbol, the timeframe interval, the start date of the data, the number of candles requested, and an array containing the actual candle data. Think of it as a listener for new candlestick information arriving from your data source.


## Interface IExchange

This interface, `IExchange`, defines how your backtesting system interacts with a specific cryptocurrency exchange. It allows you to retrieve historical and future price data, format trade quantities and prices to match the exchange’s rules, and calculate important metrics like the VWAP (volume-weighted average price).

You can use methods to fetch historical candles, essentially snapshots of price action over time, and also simulate future candles for backtesting purposes. The framework handles ensuring that data retrieval respects the context of your backtest, preventing look-ahead bias.

Retrieving the order book and aggregated trades are also supported to give a fuller view of market activity.

The `getRawCandles` method is very flexible, letting you specify start and end dates or just a limit of candles to retrieve, with the framework automatically calculating the missing parameters. This method also respects the context of your backtest to ensure accuracy.

## Interface IEntity

This interface serves as the foundation for all data objects that are saved and retrieved from storage within the backtest-kit framework. Think of it as the common starting point for representing things like trades, orders, or account balances – anything that needs to be stored persistently. It ensures that all such objects have a consistent structure, which makes working with them much easier and more reliable.

## Interface IDumpInstance

The `IDumpInstance` interface defines how to save different kinds of data during a backtesting run. Think of it as a way to record specific moments or information that you want to keep for later analysis.

It provides several methods for different data types:

*   `dumpAgentAnswer`: Stores the complete conversation history of a specific agent's actions.
*   `dumpRecord`: Saves simple key-value data.
*   `dumpTable`: Allows you to save data arranged in a table format, automatically determining the column headers based on the data.
*   `dumpText`:  Saves plain text or markdown content.
*   `dumpError`: Records details about errors that occurred.
*   `dumpJson`:  Preserves complex objects as formatted JSON.

Each of these methods receives the data to be saved, a unique identifier for that data (`dumpId`), and a brief explanation (`description`). The `dispose` method is used to clean up any resources used by the instance when you're finished with it. This interface is designed to be used within a context that knows the signal and bucket name.

## Interface IDumpContext

The IDumpContext helps organize and identify data dumps, acting as a label for different pieces of information. Each dump is linked to a specific trade using the `signalId` and grouped by a `bucketName`, often representing a strategy or agent. A unique `dumpId` distinguishes each individual dump entry.

The `description` field is a human-friendly explanation of the dump's content, and it’s used to make it easily searchable and readable. Finally, the `backtest` flag clarifies whether the data originates from a backtest simulation or live trading.

## Interface ICommitRowBase

This interface, `ICommitRowBase`, serves as the foundation for handling trading events that need to be processed later. Think of it as a way to temporarily store information about a trade—like which asset was involved—so it can be applied correctly at the right time. It holds essential details: the trading symbol, which identifies the asset pair being traded (e.g., BTC-USDT), and a flag indicating whether the trade happened within a backtesting scenario.

## Interface ICheckCandlesParams

This interface defines the information needed to check if candle data is already available in storage. It's used to quickly verify if you have the historical data you need without needing to search through all your files.

You'll provide details like the trading pair (like BTCUSDT), the exchange you're using, the timeframe of the candles (like 1 hour), and the specific date range you're interested in. The system uses this information to see if the candle data is readily available.


## Interface ICandleData

This interface represents a single candlestick, which is a common way to organize price data over time. 

Each candlestick includes the timestamp of when it began, the opening price, the highest and lowest prices reached during that period, the closing price, and the total volume of trades that occurred. 

You'll see this structure used when calculating things like volume-weighted average price (VWAP) and when performing backtests to evaluate trading strategies. Think of it as a single snapshot of market activity.

## Interface ICacheCandlesParams

This interface defines how to configure the caching process for historical data. It lets you define actions to be taken at specific points in the data retrieval and caching cycle. You can specify functions that will run right before the initial validation of the cached data begins, and then again before the warm-up phase kicks in if the validation fails. These callbacks provide a chance to log events, update progress indicators, or perform any necessary setup before the caching process proceeds. The callbacks receive information about the symbol, the time interval of the data, and the date range being processed.

## Interface IBroker

The `IBroker` interface acts as the bridge between the backtest-kit and a live trading environment like an exchange. It's essentially a set of rules for how the framework communicates with a broker.

Think of it as a series of callbacks that the framework uses when it needs to take actions like opening or closing positions. Importantly, these calls happen *before* the framework makes any changes to its internal state, so any errors during these calls will prevent those changes, ensuring a reliable process. However, these callbacks are skipped entirely during backtesting mode.

Here's a breakdown of what each callback does:

*   **`waitForInit`**: Initial setup – connect to the exchange, load credentials, etc. Called once before anything else happens.
*   **`onSignalCloseCommit`**:  Handles closing a position (take-profit, stop-loss, manual close). If something goes wrong here (an exception is thrown), the position remains open.
*   **`onSignalOpenCommit`**: Deals with opening a new position. Errors during this process cause the attempt to be rolled back and retried.
*   **`onOrderCheck`**: Monitors a pending order and throws an error if the order is not found. Use this to check if the order exists on the exchange.
*   **`onSignalActivePing`**:  A per-tick check for open positions. This allows you to reconcile the framework's view of the position with the exchange’s actual state – for example, reacting to gaps in price.
*   **`onSignalSchedulePing`**:  Similar to `onSignalActivePing` but for scheduled positions waiting to be activated.
*   **`onSignalIdlePing`**: Handles events when no positions are active.
*   **`onSignalScheduleOpen`**: Places the initial order for a scheduled position.
*   **`onSignalScheduleCancelled`**: Cancels a scheduled position's order.
*   **`onSignalPendingOpen`**: Confirmation and setup for a new, open position.
*   **`onSignalPendingClose`**:  Clean up and record P&L for a closing position.
*   **`onPartialProfitCommit`, `onPartialLossCommit`, `onTrailingStopCommit`, `onTrailingTakeCommit`, `onBreakevenCommit`, `onAverageBuyCommit`**: These handle specific partial profit/loss, trailing stops, breakeven, and DCA events.



The callbacks named with "Commit" suffix represent an opportunity to make a trade.
The callbacks named with "Ping" suffix represents an opportunity to react to a trade.

## Interface IBreakevenData

This data structure holds a simplified record of whether a breakeven point has been achieved for a specific trading signal. It’s designed to be easily saved and loaded, often used when storing data related to trading strategies.

Think of it as a simple "yes/no" indicator -  `reached` tells you if the breakeven target has been met. 

It's used to keep track of the state of breakeven progress across different signals. This information is then used later to rebuild the full breakeven state.


## Interface IBreakevenCommitRow

This represents a single action taken during a backtest related to breakeven points. Specifically, it signifies a commitment or adjustment linked to a breakeven calculation. The `action` property confirms this is a breakeven-related event. Alongside that, `currentPrice` stores the price level at the moment the breakeven was determined.

## Interface IBreakeven

The `IBreakeven` interface helps manage when a trading signal's stop-loss order is adjusted to the entry price – essentially, breaking even. It's used by components that track and react to this situation.

It monitors the price to see if it’s moved favorably enough to cover any transaction fees. 

The `check` method determines if breakeven should be triggered, considering whether it's already been reached, whether the price movement covers costs, and if moving the stop-loss to the entry price is feasible.  If everything aligns, it marks the breakeven status, triggers a notification, and saves the information.

The `clear` method resets the breakeven status when a signal's trade is finished, removing the data and updating saved records.

## Interface IBidData

This describes the data for a single bid or ask price within an order book. Each bid or ask is represented with two key pieces of information: the price at which it's offered and the number of units available at that price. Both the price and quantity are stored as strings.

## Interface IAverageBuyCommitRow

This interface represents a single step in a queued average-buy (also known as DCA) strategy. 

It tells the backtest system to execute a buy order to add to your existing average.

Each step includes the price you bought at (`currentPrice`), the total cost of that specific purchase (`cost`), and the updated total number of purchases you've made so far (`totalEntries`). Essentially, it's a record of one piece of your DCA process.

## Interface IAggregatedTradeData

IAggregatedTradeData holds information about a single trade that happened. Think of it as a record of one transaction. Each record has a unique ID, the price at which the trade took place, the amount of the asset that was traded, and the time the trade occurred.  It also tells you whether the buyer was acting as a market maker, which provides clues about the direction of the trade.

## Interface IActivityEntry

An `IActivityEntry` represents a single instance of a trading activity, whether it's a backtest or a live trade. Think of it as a record that says "this specific strategy on this exchange is currently running."

It’s created when an activity begins and removed when it finishes, either successfully or with an error. 

This entry includes details like the trading pair (e.g., "BTCUSDT"), the name of the strategy being used, the exchange it's running on, and whether it's a backtest or a live execution. 

The system uses these entries to check if multiple activities are trying to run at the same time, preventing conflicts and ensuring everything works smoothly.

## Interface IActivateScheduledCommitRow

This interface represents a queued task to activate a scheduled commitment. Think of it as a message in a queue telling the system to trigger a previously planned action.

It includes the type of action, which is always "activate-scheduled." It also specifies the unique identifier of the signal related to this activation.  You can optionally provide an activation ID, useful if the activation is being initiated manually by a user rather than automatically.


## Interface IActionStrategy

The `IActionStrategy` interface gives your action handlers a way to peek at the current signal situation – whether a trade is already in progress or a future trade is planned. It allows handlers to avoid unnecessary actions, like calculating profit targets when there's no active trade.

Essentially, it's a read-only window into what the strategy is currently doing.

You can use it to check:

*   If there's an open trade (a "pending signal").
*   If a trade is scheduled for the future.

These checks help streamline your trading actions and improve efficiency. The `hasPendingSignal` method confirms if a trade is actively running, while `hasScheduledSignal` verifies if a future trade is waiting to be executed.

## Interface IActionSchema

The `IActionSchema` lets you hook into a trading strategy's execution to build custom tools and integrations. Think of it as a way to listen for specific events happening during a trade and react to them.

You can use these actions for things like keeping track of a strategy's performance in a database, sending alerts to a messaging service when something interesting happens, or even triggering other automated processes based on what’s happening in the strategy.

Each action is uniquely identified and can have helpful notes for developers. It’s essentially a blueprint for how your custom event handler should work, and it’s automatically set up for each run of the strategy. You can use them to manage state, log events, send notifications, collect analytics, or run custom business logic.

## Interface IActionParams

The `IActionParams` object holds all the information an action needs to run, acting as a central hub for everything it requires. Think of it as a package of tools and details passed to an action when it's triggered.

It includes a `logger` for keeping track of what's happening and helping with debugging. You’ll find details about the strategy and timeframe this action belongs to, like the `strategyName` and `frameName`.

It also tells you which `exchangeName` the action is operating on, whether you’re running a `backtest`, and provides a `strategy` context - giving the action access to current position and signal information. Essentially, it’s all the context needed to perform a specific task within your trading strategy.

## Interface IActionCallbacks

This API defines a set of callbacks you can use to extend the functionality of your trading strategies within the backtest-kit framework. Think of these as hooks that let you customize what happens at different points in the trading lifecycle.

You can use `onInit` to set up things like database connections or load any initial data needed by your strategy.  Similarly, `onDispose` is for cleaning up – closing connections, saving data, and unsubscribing from anything you started in `onInit`.

Several callbacks are triggered when signals are generated. `onSignalLive` and `onSignalBacktest` give you distinct access to live and backtesting signals. There's also a general `onSignal` callback that gets triggered regardless of mode.

Specific events related to risk management, breakeven points, partial profits/losses, and scheduling are covered by callbacks like `onBreakevenAvailable`, `onRiskRejection`, and `onPingScheduled`.

If you’re working with scheduled signals, `onScheduleEvent` and `onPingScheduled` are vital for managing those orders. For pending signals, `onPendingEvent` handles opening and closing, while `onPingActive` monitors active positions.  `onPingIdle` is called when no signals are active.

Finally, `onSignalSync` and `onOrderCheck` offer advanced control. `onSignalSync` lets you approve or reject signal openings/closings, and `onOrderCheck` is used to verify that pending orders haven't been unexpectedly filled or cancelled. Remember that these callbacks can throw errors to reject actions, unlike most others.



Essentially, these callbacks provide a way to inject custom logic into the trading process at key moments. You can register these callbacks to monitor the strategy, handle exchange interactions, and implement complex trading logic.


## Interface IAction

This interface, `IAction`, is your central hub for connecting your custom logic to the backtesting and live trading processes. Think of it as a set of event listeners that tell you what's happening within the trading framework. You can use these events to build things like dashboards, log trading activity, or manage your own custom state.

The `signal` methods ( `signal`, `signalLive`, `signalBacktest`) provide core updates about strategy ticks and candles, acting as the primary heartbeat of trading activity.  Then there are more specific event handlers, such as `breakevenAvailable`, `partialProfitAvailable`, and `partialLossAvailable` which alert you when profit or loss targets are met.

The `scheduleEvent`, `pendingEvent`, `pingScheduled`, `pingActive` and `pingIdle` methods track the lifecycle of signals, from creation and scheduling to active trading.  `riskRejection` signals when a trade is blocked due to risk constraints.

`signalSync` is a crucial signal that lets you intervene *before* an order is placed, allowing you to reject trades if necessary. Lastly, `orderCheck` provides a final verification step before trade execution in live mode.

Finally, the `dispose` method provides a clean-up mechanism to release resources when the action handler is no longer required. This is essential for proper shutdown and resource management.





## Interface HighestProfitStatisticsModel

This model holds information about the events that resulted in the highest profit during a trading backtest. 

It essentially keeps track of those profitable moments.

The `eventList` property gives you a detailed look at each of those highest-profit events, presented in chronological order (most recent first).

`totalEvents` simply tells you how many of these peak profit events were recorded overall.

## Interface HighestProfitEvent

This data represents the single best performing trade recorded for a specific strategy. It contains details about when the record was set (timestamp) and which trading pair (symbol) was involved. You'll find the strategy's name and a unique identifier for the signal that triggered the trade, as well as whether the position was a long or short one.

Crucially, it includes the total profit and loss (PNL) for the closed position, alongside key metrics like peak profit and maximum drawdown seen during the trade's lifetime.  The record price that led to this high profit, along with the entry, take profit, and stop-loss prices, is also captured. Finally, a flag indicates if this event occurred during a backtesting simulation.

## Interface HighestProfitContract

The `HighestProfitContract` provides information when a trading position reaches a new peak profit level. It gives you details about the trade, including the symbol being traded (like "BTC/USDT"), the current price, and the exact time this happened. You’ll also see the name of the trading strategy being used, the exchange where the trade occurred, and the timeframe of the data (like "1m" for one-minute intervals). The signal data associated with the trade is included too. Importantly, it indicates whether this profit milestone was achieved during a backtest or in live trading, allowing you to handle the information differently depending on the context.

## Interface HeatmapStatisticsModel

This model provides a comprehensive overview of your portfolio's performance, aggregating data from all the assets you're tracking. It gives you a broad picture of how your entire portfolio is doing, rather than just focusing on individual assets.

You’ll find key metrics like the total profit and loss, Sharpe Ratio, and the total number of trades executed across all symbols.  It includes metrics to understand risk, such as the maximum drawdown (the largest loss from a peak) and the standard deviation of returns.

The model also offers insights into trade characteristics, like average duration, win/loss streaks, and the average time spent in winning and losing trades. It presents several key risk-adjusted return ratios like Sortino and Calmar ratios, along with calculations like expectancy and certainty ratio.  Finally, you get an estimate of the expected yearly returns based on the aggregated trade data.

## Interface DoneContract

This interface describes what happens when a background process, whether it's a backtest or a live trading session, finishes running. It provides key details about the completed run, like which exchange was used, the name of the trading strategy involved, and whether it was a backtest or live execution. You'll find information like the trading symbol (like BTCUSDT) and the frame name (which is empty when running live). Essentially, it’s a notification with essential information about a finished background trading run.


## Interface CronHandle

This object lets you cancel a scheduled task that you previously set up with the Cron system. Think of it as a way to turn off a recurring event. If you no longer need a task to run automatically, using this handle is the easiest way to stop it, preventing further executions. It's essentially a shortcut for manually removing the task's registration.

## Interface CronEntry

A `CronEntry` defines when and how a specific piece of code will run within a backtesting system. It's essentially a scheduled task for your backtest.

Each entry needs a unique `name` to identify it, and this name can't contain colons.

You set the `interval` – like "1m" for every minute or "1h" for every hour – to determine when the code runs, based on the candle boundaries. If you skip the interval it's a "fire-once" trigger, meaning it runs just once.

The `symbols` property controls whether the code runs globally (once per boundary) or for each individual symbol you specify. If you list symbols, the code runs once for each symbol that matches the current boundary.

Finally, the `handler` is the actual code that gets executed when the conditions are met.

## Interface CriticalErrorNotification

This notification signals a critical error within the backtest framework that requires the process to stop immediately. 

It provides important details about the error, including a unique identifier, a human-readable message explaining what went wrong, and a full stack trace with related data. 

The `type` field confirms it’s a critical error notification. Notably, errors of this type originate from the live context, so the `backtest` flag is always false.


## Interface ColumnModel

This describes how to set up columns for creating tables, especially useful when you want to display data in a clear, organized way. Essentially, you define how each piece of data should be presented.

Each column has a unique identifier, a friendly name to show as the header, and a formatting function to transform the raw data into something readable.

You can also control whether a column should even be shown, using a function that can determine visibility based on certain conditions. This allows for dynamic table generation that adapts to the data.

## Interface ClosePendingCommitNotification

This notification appears when a signal that was waiting to be activated gets closed before it actually activates a position. It provides a wealth of information about why the signal was closed and the performance of the potential position. The notification includes details like a unique identifier, the exact time of the close, and whether it happened during a backtest or live trading.

You’ll find key details about the signal itself, such as the trading pair, the strategy that generated it, and a unique ID for the signal and the closing action.  It also outlines the technical specifics like the number of entries and partial closes. 

Crucially, the notification includes a thorough P&L breakdown, revealing everything from total profit/loss and peak profit achieved to maximum drawdown experienced and prices at which those highs and lows occurred.  There’s a description field for any custom notes explaining the closing decision. Finally, a timestamp indicates when this notification was originally generated.

## Interface ClosePendingCommit

This signal tells the backtest system that a pending order has been closed. It includes information about the reason for the closure, identified by a user-provided `closeId`, if available. 

You’ll also find details about the position's performance, such as its total profit and loss (`pnl`), the highest profit reached (`peakProfit`), and the largest loss experienced (`maxDrawdown`). These metrics provide a complete picture of the closed position's journey.


## Interface CancelScheduledCommitNotification

This notification signals that a previously scheduled trading signal has been cancelled before it was activated. It provides a wealth of information about the signal and the potential trade that would have occurred, including a unique identifier, timestamps, and whether it originated from a backtest or live environment. You'll find details like the trading pair (e.g., BTCUSDT), the strategy and exchange involved, and a unique signal ID.

The notification includes comprehensive performance metrics as if the trade *had* taken place, such as potential PNL, peak profit, and maximum drawdown figures, all displayed in both absolute dollar amounts and percentages. There's also information about DCA entries, partial closes, original entry price, and various price points related to performance. Finally, an optional note field can provide further context or explanation for the cancellation.

## Interface CancelScheduledCommit

This interface describes a request to cancel a previously scheduled signal event. It's used when you need to stop a signal from being sent or processed. 

The `action` field simply confirms that you're requesting a cancellation.

You can optionally include a `cancelId` to provide a specific reason for the cancellation, which can be helpful for tracking or debugging.

Along with the cancellation request, you're also providing information about the related trade, including its total profit and loss (`pnl`), the highest profit achieved during its lifecycle (`peakProfit`), and the maximum drawdown it experienced (`maxDrawdown`). This gives context to why the signal was scheduled and now needs to be cancelled.


## Interface BreakevenStatisticsModel

This model holds information about the breakeven points reached during a trading backtest.

It essentially gives you a breakdown of how many times the breakeven level was hit, and a detailed list of each individual event.

The `eventList` property contains all the recorded breakeven events, providing comprehensive data for each one.

The `totalEvents` property simply tells you the total count of times breakeven was achieved.

## Interface BreakevenEvent

This data structure holds all the key details whenever a trading signal hits its breakeven point. It’s designed to give you a complete picture of what happened – from the exact time and the trading pair involved, to the strategy and signal ID that triggered it. 

You'll find information about the current market price, the entry price, and any take profit or stop loss levels that were set. It even includes the original prices that were initially defined when the signal was first created.

If you're using a dollar-cost averaging (DCA) strategy, you’ll see details about the number of entries and partial closes. The overall profit and loss (PNL) at the time of breakeven is also captured, along with a human-readable note to explain the reason behind the signal. Finally, it stores timestamps for when the position became active and when the signal was scheduled, as well as an indicator if the trade was part of a backtest or a live trade.

## Interface BreakevenContract

This interface represents a breakeven event, which happens when a trading signal's stop-loss is moved back to its original entry price. It's a signal that your trade has moved far enough into profit to cover costs, and often signifies a reduction in risk.

Each breakeven event contains a lot of details to help you understand what happened:

*   The trading symbol (like BTCUSDT)
*   The name of the strategy that generated the signal
*   The exchange and frame where the trade is executing
*   Full information about the original signal
*   The price that triggered the breakeven
*   Whether it was from a backtest or live trading
*   And the exact time the event occurred.

These events are designed to be tracked and reported on, or you can set up notifications whenever one occurs. They're safe to rely on because they only happen once for each signal.

## Interface BreakevenCommitNotification

This notification signals that a breakeven point has been reached and a commitment action has been executed, likely closing part or all of a position. It provides a wealth of information about the trade, including a unique identifier and a timestamp indicating when the event occurred. You'll find details about whether this happened during a backtest or live trading, along with specifics about the trading pair, the strategy involved, and the exchange used.

The notification also breaks down the trade's performance: entry and exit prices, take profit and stop loss levels (both original and adjusted), and a comprehensive breakdown of DCA entries and partial closes. Crucially, it includes performance metrics like total profit/loss (pnl), peak profit, and maximum drawdown – both in absolute and percentage terms – offering a full picture of the position's lifecycle. You’ll find details on peak profit and maximum drawdown including price points, associated costs, and the number of entries executed at those points.  A note field allows for optional human-readable explanations for the signal, and several timestamps detail creation and scheduling events.

## Interface BreakevenCommit

This `BreakevenCommit` represents an event signaling a breakeven adjustment has been triggered. It contains a wealth of information about the position at the time of this adjustment, allowing you to understand the context and rationale behind the breakeven.

You'll find details like the current market price, the overall profit and loss (PNL), and the highest profit and largest drawdown the position ever reached.  The direction of the trade (long or short) is also specified.

Critically, it includes the original entry price, and the effective take profit and stop loss prices – which may have been adjusted by trailing stops.  You’ll also see the original, unadjusted take profit and stop loss prices. 

Timestamps for when the signal was created and when the position initially activated are also provided for precise tracking and analysis. Essentially, this commit gives you a complete snapshot of the position’s performance and pricing before the breakeven was applied.


## Interface BreakevenAvailableNotification

This notification signals that your trading position has reached a point where its stop-loss can be adjusted to the entry price, essentially breaking even. It provides a wealth of information about the trade, including a unique identifier, the time it occurred, and whether it's from a backtest or live trading. 

You'll find details like the trading pair, the strategy used, and the exchange involved. The notification includes the current market price and the original entry price, alongside your take profit and stop-loss levels (both as initially set and with any trailing adjustments).

The data also breaks down the trade's history: the number of entries used (helpful if you're using dollar-cost averaging), the number of partial closes, and detailed profit and loss metrics. This includes peak profit, maximum drawdown, and all associated prices and percentages. 

Finally, there's a field for an optional note explaining the signal, along with timestamps related to when the signal was scheduled, became pending, and when this notification was created.

## Interface BeforeStartContract

The `BeforeStartContract` event lets you perform setup tasks right before a trading strategy begins its run, whether it's a backtest or live trading. Think of it as a signal that the engine is about to start replaying historical data or executing trades in real-time.

This event fires just once at the very beginning of each run, before any trading signals are generated. It's the perfect place to do things like open log files, reset any counters that track performance, or send out notifications that a trading session has started.  It is always paired with an `AfterEndContract` event, so you know both will happen for each run.

The information provided includes the trading symbol, the name of the strategy being used, the exchange involved, and whether it's a backtest or live run.  You'll also get the current price and a timestamp representing when the event occurred. For backtests, the timestamp refers to the planned start of the historical data, while in live mode it's the actual current time. The timestamp and `when` properties are essentially the same value—the timestamp is just the numerical representation of the `when` date.

## Interface BacktestStatisticsModel

This model provides a detailed breakdown of your trading strategy's performance during a backtest. It collects numerous statistics, including individual trade details, win/loss counts, and profitability metrics. You'll find information about average profit per trade, overall cumulative profit, and how volatile your strategy is, measured by standard deviation.

Several key ratios are calculated to assess risk-adjusted returns, like the Sharpe Ratio and Sortino Ratio, helping you compare your strategy to others.

Beyond simple profit and loss, the model also examines trade durations, the size of price movements, and even attempts to classify the overall trend of the market during the backtest. A wide range of additional metrics like consecutive win/loss streaks, pressure imbalances, and trend strength further deepen the analysis. If any of these calculations are unreliable, the corresponding value will be null.

## Interface AverageBuyCommitNotification

This notification signals that a new "averaging" (or DCA - Dollar Cost Averaging) buy order has been added to an existing position. Think of it as a record of each time your strategy buys a little bit more of an asset to lower your average purchase price. 

The notification includes a wealth of information about the trade, such as the exact price it was executed at, the total cost of that particular buy, and how it impacts your overall average entry price. You’ll find details about the trade’s history, including which exchange and strategy initiated it, along with crucial performance metrics like profit/loss (pnl), peak profit, and maximum drawdown.  

It also provides insight into how slippage and fees have impacted pricing, and keeps track of original settings like take profit and stop loss levels. Ultimately, this notification helps you understand the progress and performance of your DCA strategy in real-time or during backtesting. Each property is uniquely identifiable, including the signal's ID, timestamp, and a note explaining the reasoning behind the trade.

## Interface AverageBuyCommit

This event, called `AverageBuyCommit`, signals when a new averaging (or DCA) purchase is made within an existing position. It provides detailed information about that specific averaging action, like the price it was executed at (`currentPrice`) and the total cost of that buy. 

The `effectivePriceOpen` represents the new, averaged entry price after this purchase is factored in, which is a key indicator of your overall entry point.  You can also see the current unrealized profit and loss (`pnl`), as well as the highest profit and maximum drawdown the position has experienced so far.

The event also includes original price data like the `priceOpen`, `priceTakeProfit`, and `priceStopLoss`, along with their original, unadjusted values. Timestamps, `scheduledAt` and `pendingAt`, are also provided, indicating when the signal was created and when the position became active. The `position` property specifies whether the trade is a long (buy) or short (sell) one.

## Interface AfterEndContract

This interface signals the completion of a strategy run, acting like a cleanup notification. It's triggered definitively once per strategy execution, guaranteeing a consistent point for final tasks like flushing data, closing connections, or sending completion messages. Think of it as a reliable endpoint for tidying up after a trading simulation or live trade.

The `when` property is particularly useful. During backtests, it represents the exact time of the last processed candle, allowing you to calculate the duration of the run accurately. In live trading, it reflects the current time rounded to the nearest minute.

The event contains key details about the run, including the trading symbol, the strategy's name, the exchange involved, and the timeframe used. You'll also find whether the run was a backtest or live, and the average price at the moment of completion, saving you the effort of querying the exchange separately. The `timestamp` provides a convenient, serializable representation of the `when` date, helping with logging or transmitting this information.

## Interface ActivePingContract

The ActivePingContract represents events sent periodically while a pending signal is actively being monitored. Think of it as a heartbeat signal confirming the system is still tracking a specific trading opportunity.

These events are emitted every minute and include details about the trading pair (symbol), the strategy managing it, and the exchange involved.  The `frameName` identifies the timeframe the signal relates to, although it's empty in live trading scenarios.

You'll find comprehensive data about the signal itself in the `data` property, including key details like open price, take profit, and stop loss levels.  The `currentPrice` provides the market price at the time of the ping, allowing for dynamic adjustments to your strategy.

Knowing whether the signal originates from a backtest (historical data) or live trading is crucial and indicated by the `backtest` flag. Finally, `timestamp` records when the event occurred, providing precise timing information for live or backtest modes. You can use this information to build custom logic for managing your trading signals.

## Interface ActivateScheduledCommitNotification

This notification signals that a scheduled trading signal has been activated, letting you know that a trade is about to happen or has already started. It's fired when a user manually triggers a scheduled signal, bypassing the typical price check.

The notification provides a wealth of information, including a unique ID, the exact time of activation, and whether it's a backtest or live trade.  You’ll find details about the trading pair, the strategy responsible, and the exchange involved.  It also includes identifiers for the signal and the activation itself, which can be useful for tracking.

The notification gives you specifics about the trade, like the trade direction (long or short), the entry and take profit/stop loss prices – both the initial values and adjusted ones after any trailing stops.  You'll also see details related to any dollar-cost averaging (DCA) strategies used, including the number of entries and partial closes.

Critically, the notification contains performance data for the position, including total profit and loss, peak profit, maximum drawdown, and key prices at those points. This helps you analyze the trade's potential and risk profile. Finally, you get timestamps for when the signal was scheduled and when it became pending, along with the current market price at the time of activation, and a helpful note explaining the trade's reasoning.

## Interface ActivateScheduledCommit

This interface describes an event that occurs when a previously scheduled trading signal is activated. It provides a snapshot of the trade's history and current state, including details like the trade direction (long or short), entry and exit prices (take profit and stop loss, both original and adjusted), and the total profit and loss (pnl) accumulated. You'll find information about the highest profit achieved (peak profit) and the maximum loss experienced (max drawdown) during the trade's lifecycle.  A unique identifier (`activateId`) allows you to track the reason behind the activation. It also records when the signal was initially created (`scheduledAt`) and when the position was actually activated (`pendingAt`).  Essentially, it's a comprehensive record of a trade's journey up to the point of activation.
