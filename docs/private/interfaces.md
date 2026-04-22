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

This interface describes a signal that's sent when a walker needs to be stopped. 

Think of it as a notification that a particular trading strategy, running within a specific walker, is being paused. 

The signal includes the trading symbol involved, the name of the strategy being stopped, and the name of the walker that initiated the stop. 

This is particularly helpful when you have multiple strategies running at the same time, allowing you to precisely target which one needs to be interrupted.


## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps organize and present the results of your backtesting experiments, particularly when comparing different strategies. It builds upon the standard WalkerResults, adding information specifically for comparing strategy performance. You'll find an array containing detailed results for each strategy you tested, allowing you to analyze and contrast their strengths and weaknesses.

## Interface WalkerContract

The WalkerContract represents progress updates as different trading strategies are tested and compared. Think of it as a report card showing how each strategy is doing relative to the others.

Each time a strategy finishes its backtest, a WalkerContract is sent out, giving you information like the strategy’s name, the exchange and symbol it was tested on, and key performance statistics. 

You’ll find details on the metric being optimized, along with its current value and how it compares to the best value seen so far. It also tells you how far along the testing process is, indicating how many strategies have been tested and how many remain. This allows you to monitor the overall backtest progress and see which strategies are emerging as the top performers.

## Interface WalkerCompleteContract

The WalkerCompleteContract signals that a backtesting process has finished, meaning all strategies have been evaluated and the results are ready. It packages up a lot of information about the completed backtest, giving you a full picture of what happened. You'll find details like the name of the backtesting walker, the trading symbol used, and the exchange and timeframe involved.

It also includes the specific metric that was used to judge the strategies, how many strategies were tested in total, and importantly, the name of the strategy that performed the best. You'll also get the actual value of that best metric and a detailed set of statistics for that top-performing strategy. Essentially, this contract delivers a comprehensive report on a backtest's outcome.


## Interface ValidationErrorNotification

This notification signals that a validation error occurred during the backtesting process. 

It's a way for the system to inform you when risk validation checks fail, providing details about the problem. 

Each notification has a unique identifier, a clear error message explaining what went wrong, and a serialized error object that includes a stack trace – useful for debugging. 

Importantly, the `backtest` flag is always false, meaning these errors originate from the live trading context, not directly from the backtest simulation itself.

## Interface ValidateArgs

This interface, `ValidateArgs`, helps ensure that the names you're using for different parts of your backtesting setup are correct. Think of it as a safety net for your configuration. 

It has properties for common names like "Exchange," "Frame" (or timeframe), "Strategy," "Risk profile," "Action," "Sizing," and "Walker." 

Each property expects a special type of data (an enum) that represents the allowed names for that particular component. If you try to use a name that isn't in the list, the validation system will catch it, preventing errors later on. This is a key tool for keeping your backtesting process clean and reliable.


## Interface TrailingTakeCommitNotification

This notification lets you know when a trailing take profit order has been executed. It provides a wealth of details about the trade, like a comprehensive report card. You’ll find information about the unique identifier of the notification, the exact time it happened, and whether it occurred during a backtest or live trading.

It includes specifics like the trading pair, the strategy that triggered the action, and the exchange used. Detailed pricing data is available, including the original and adjusted take profit/stop loss prices, and the current market price at the time of execution.

You’ll also find a full breakdown of the trade's performance, covering profit and loss, peak profit, maximum drawdown, and the number of entries and partials involved. The notification includes metrics like total PNL, profit/loss percentage, and even the specific prices at which peak profit and maximum drawdown were achieved. Finally, there’s a field for optional notes explaining the reasons behind the signal and timestamps to track the signal's lifecycle.

## Interface TrailingTakeCommit

This interface describes an event triggered when a trailing take profit order is executed. It provides detailed information about the trade, including the action that occurred ("trailing-take"). You'll find key details like the percentage shift used to adjust the take profit level, the current price of the asset at the time of the adjustment, and the overall profit and loss (pnl) of the position. 

It also tracks important metrics for the position's performance, such as the peak profit achieved and the maximum drawdown experienced. The event specifies the trade direction (long or short) and includes the original entry price, along with the current take profit and stop loss prices, both as they are after the trailing adjustment and as they were initially set. Finally, timestamps indicate when the signal was created and when the position became active.

## Interface TrailingStopCommitNotification

This notification tells you when a trailing stop order has been triggered and executed. It provides a wealth of information about the trade, including a unique ID, the exact time it happened, and whether it occurred during a backtest or live trading.

You'll find details about the trading pair, the strategy that generated the signal, and the exchange used.  Crucially, it includes key pricing information like the entry price, stop loss and take profit levels—both original and adjusted for trailing.

The notification also breaks down the performance of the position with detailed profit and loss data, including peak profit, maximum drawdown, and the total capital invested.  It also allows you to understand how many DCA entries were executed, and how many partial closes have been done. Finally, a note field allows for a human-readable explanation of the reasoning behind the signal.

## Interface TrailingStopCommit

This describes a trailing stop event, which is a signal triggered when a trailing stop loss order is adjusted. It contains details about the action taken – specifically, a trailing stop – and provides a comprehensive snapshot of the position's performance.  You'll find the current market price at the time of the adjustment alongside key metrics like total profit and loss (PNL), the highest profit achieved, and the maximum drawdown experienced by the position.

The signal also includes information about the trade direction (long or short), the initial entry price, and the take profit and stop loss prices, both as they currently exist and as they were originally set. A timestamp indicates when the signal was created and when the position became active. This data provides a complete picture of the trailing stop event and the position’s history.

## Interface TickEvent

This interface, `TickEvent`, provides a standardized way to represent all types of events happening during a trading process. Think of it as a unified record for every action – whether a trade is opened, closed, scheduled, or cancelled. It gathers all relevant information into a single object, making it easier to analyze and generate reports.

The data included covers a wide range of details, like the event's timing (`timestamp`), its type (`action`), and specifics related to the trade itself – the symbol, signal ID, position, prices, and profit/loss information. You’ll find details on original prices, total entries for averaging, and even reasons for closing or cancellation. It also keeps track of performance metrics like peak and fall PNL percentages for closed positions.  Different event types populate different properties; for example, `pendingAt` is for opened positions, while `duration` is specific to closed positions.

## Interface SyncStatisticsModel

This model holds information about signal synchronization events. Think of it as a report card for how your signals are syncing up. 

It keeps track of every synchronization event, giving you a detailed list of what happened. 

You'll find the total number of synchronization events, as well as how many signals were opened and closed through the synchronization process. This data helps you understand the lifecycle and behavior of your signals.


## Interface SyncEvent

This data structure holds all the important information about what happened during a trading signal’s lifecycle. Think of it as a detailed record of an event, like entering a trade, setting take profit or stop loss levels, or closing a position.

Each `SyncEvent` includes details like the exact time the event occurred, the trading symbol, which strategy was used, and the exchange involved. You’ll also find specifics about the signal itself, such as its ID, the direction of the trade (long or short), and the prices involved for entry, take profit, and stop loss.

The record also tracks details related to any DCA (dollar-cost averaging) used, how many partial closes were executed, and the overall profit and loss (PNL), peak profit, and maximum drawdown experienced during the trade. For closed signals, a reason for the closure is provided. Finally, it flags if this event came from a backtest simulation and provides a creation timestamp.

## Interface StrategyStatisticsModel

This model holds all the statistical data generated during a backtest run, giving you a breakdown of how your strategy performed. It includes a detailed list of every event that occurred, like buys, sells, and stop orders.

You'll also find overall counts for various event types, such as the total number of events, or how many times your strategy canceled or activated scheduled actions. 

Specific counts are tracked for actions like partial profits and losses, trailing stops, and breakeven adjustments. There's even a count for average-buy (Dollar-Cost Averaging) events. It’s designed to give you a clear picture of your strategy's behavior and performance metrics.

## Interface StrategyEvent

This data structure holds all the key information about actions taken by your trading strategy, making it easy to understand what happened and when. It combines details about the trade, like the symbol being traded and the strategy used, with specifics about the action itself, whether it’s an initial entry, a partial close, or a trailing stop adjustment. You'll find information like the exact price at which the action occurred, as well as timestamps showing when the signal was initially created and when the position became active. For strategies using dollar-cost averaging (DCA), it includes details like the total entries and the effective entry price. This centralized event data helps create clear and informative reports about your backtest or live trading performance.

## Interface SignalSyncOpenNotification

This notification tells you when a pre-planned trading signal, like a limit order, has been triggered and a position has been opened. It provides a wealth of information about the trade, including a unique ID, the exact time it happened, and whether it occurred during a backtest or live trading. You’ll find details like the trading symbol, the strategy that generated the signal, and the exchange used.

The notification includes comprehensive performance data for the position, such as total profit and loss (both absolute and percentage), peak profit achieved, and maximum drawdown experienced. It also breaks down the entry and exit prices used in the calculations and offers details on any averaging or partial closures that took place. 

Finally, it specifies the trade direction (long or short), entry price, take profit and stop-loss levels, and timestamps related to the signal's scheduling and activation, potentially including an optional note explaining the reasoning behind the signal. This helps you understand how and why the trade was executed.

## Interface SignalSyncCloseNotification

This notification tells you when a trading signal has been closed, whether it’s from a live trade or a backtest. It provides a ton of details about what happened – when it closed, the trading pair involved, and which strategy generated the signal. You’ll find information on the profit and loss, peak profit achieved, and maximum drawdown experienced throughout the position’s life. 

It also breaks down the specifics of the trade, including entry and exit prices, stop-loss and take-profit levels, and details about any DCA (Dollar-Cost Averaging) or partial closures that occurred. Finally, you'll see the reason for the closure – whether it was a take-profit, stop-loss, time expiry, or manual closure – and any notes added for context. The notification includes timestamps for creation, scheduling, and pending, giving you a full timeline of the signal’s lifecycle.

## Interface SignalSyncBase

This interface defines the core information shared by all signal synchronization events within the backtest-kit framework. Think of it as the foundation for understanding what's happening during a trade – it tells you *what* was traded (symbol), *who* initiated it (strategyName), *where* it happened (exchangeName), and *when* it occurred (timestamp). It also specifies whether the event is part of a historical backtest or a live trading session, and provides a unique ID for each signal. Finally, it includes a full record of the public signal data that triggered the action.

## Interface SignalScheduledNotification

This notification type tells you when a trading signal has been prepared to be executed in the future. It's like a heads-up that a trade is about to happen, whether it’s a simulation (backtest) or a real live trade. 

Each notification contains a lot of details about the planned trade. You’ll find things like the unique signal identifier, the time it's scheduled for, the trading pair involved (e.g., BTCUSDT), and the strategy that generated it. 

You'll also get key price information for the trade, like the target entry price, take profit, and stop loss levels, along with details regarding DCA averaging and partial closes. Plus, there's a whole section of data relating to potential profit and loss, including peak profit, maximum drawdown, and how those figures are calculated, providing insight into potential risk and reward. Finally, there's a field for an optional note, which gives a brief explanation behind why the signal was generated.

## Interface SignalOpenedNotification

This notification signals the opening of a new trading position. It contains a wealth of information about the trade, including a unique identifier and a timestamp indicating when it began.  You'll find details like the trading symbol (e.g., BTCUSDT), the strategy and exchange involved, and the direction of the trade (long or short).

The notification also includes key pricing information: the entry price, take profit target, and stop-loss levels, along with their original values before any adjustments.  It provides extensive details on the position's performance, such as total profit and loss (PNL), peak profit, and maximum drawdown, all expressed both numerically and as percentages.

Further details cover the specific entries and partial exits, total cost, and any notes associated with the signal's rationale.  Timestamps are included for signal creation, pending status, and overall creation of the notification itself, allowing for a comprehensive understanding of the position's lifecycle and its overall performance characteristics. It also clarifies whether the notification originated from a backtest or live trading environment.

## Interface SignalOpenContract

This event, `SignalOpenContract`, lets you know when a trading signal has been successfully activated, meaning the exchange has filled a limit order you placed. It's like a confirmation that your order went through.

This event is especially helpful for synchronizing external systems, like order management tools or audit logs, ensuring everyone is on the same page about what's happening.

The event provides detailed information about the trade, including the entry price (`priceOpen`), take profit and stop-loss levels, the direction of the trade (`position`), and overall performance metrics like profit (`pnl`), peak profit, and maximum drawdown. You’ll also find information on how the position was built, including the number of entries and partial closes. The `scheduledAt` property tells you when the signal was initially created, while `pendingAt` reflects when the position actually started.

## Interface SignalInfoNotification

This notification type lets your trading strategies share helpful information about open positions. Think of it as a way for your strategies to broadcast updates and context about what’s happening.

Each notification contains details like a unique ID, when it was created, and whether it's from a backtest or live trading. You’ll find key information like the trading pair, the strategy’s name, and the exchange where the trade occurred.

The notification also includes data on the current market price, the direction of the trade (long or short), and all the relevant price levels like entry, take profit, and stop loss, both as originally set and after any trailing adjustments.

You’ll also get performance metrics such as the position’s P&L, peak profit, and maximum drawdown, alongside details about any DCA entries or partial closes that have occurred. There’s also a user-defined note field, allowing strategies to provide custom explanations or commentary. Finally, timestamps are available to track the signal’s lifecycle, from scheduling to becoming pending and then fully created.

## Interface SignalInfoContract

This interface defines the information shared when a strategy wants to broadcast a custom message related to a trading position. Think of it as a way for strategies to communicate details about their actions, like annotations or debug information, to external systems or user callbacks. The message includes key identifiers like the trading symbol, strategy name, and exchange, so you know exactly where the event originated.

You’ll also find crucial data such as the complete signal row information, the current market price at the time, and any custom notes or identifiers provided by the strategy. It also tells you if the event happened during a backtest or a live trading session, along with a timestamp for precise timing. This structured notification allows you to build custom monitoring or reporting tools based on the signals your strategies are generating.

## Interface SignalData$1

This data structure holds all the key details for a single, completed trade generated by your trading strategy. Think of it as a record of one signal's lifecycle, from opening to closing. 

It includes the name of the strategy that created the signal, a unique ID for that signal, and the trading symbol involved. You'll also find the direction of the trade (whether it was a long or short position) and the percentage profit or loss achieved.

Crucially, it also tells you why the signal was closed, along with timestamps marking when the trade began and ended. This information is used to build performance reports and analyze your strategy's effectiveness.

## Interface SignalCommitBase

This describes the basic information you’ll find in every signal event, whether it's from a backtest or a live trading environment.  Each signal commit includes details like the trading pair’s symbol, the name of the strategy that generated it, and the exchange it’s associated with. You'll also find the timeframe being used (important for backtesting), whether the signal is from a backtest or live session, and a unique ID for the signal itself. 

The timestamp represents when the event occurred, which could be a tick or a candle depending on the context. 

Additional useful information includes the total number of entries and partial closes made, along with the original entry price that hasn't been adjusted by any averaging.  Finally, a snapshot of the signal data is included, along with an optional note to provide context or reasoning behind the signal.

## Interface SignalClosedNotification

This notification lets you know when a trading position has been closed, whether it's due to hitting a take profit or stop loss, or simply expiring. It provides a wealth of detail about the trade, including the unique identifier of the signal, the time it was closed, and whether it was part of a backtest or live execution.  You'll find key information like the entry and exit prices, the strategy used, the direction of the trade (long or short), and important performance metrics like profit/loss, peak profit, and maximum drawdown. The notification also provides details about any DCA averaging or partial closes that occurred and includes information about slippage and fees. Finally, it contains the creation and pending timestamps for detailed tracking of trade lifecycle.

## Interface SignalCloseContract

This event lets you know when a trading signal has been closed, whether it was due to reaching a take profit or stop loss, time expiration, or manual intervention. It's designed for systems that need to keep track of trades happening outside the core framework, like order management or audit logging.

The event provides a snapshot of the closed position, including the current market price, overall profit and loss, the highest profit achieved, and the largest drawdown experienced. You'll also see details like the original entry and exit prices, the trade direction (long or short), and the reason for closure. 

The signal’s creation and activation timestamps are also available for tracking purposes. Finally, it details how many times the position was averaged through DCA and how many partial exits occurred.

## Interface SignalCancelledNotification

This notification type tells you when a signal that was previously scheduled has been cancelled before it could be executed. It provides a wealth of details about the cancelled signal, including a unique identifier, the timestamp of the cancellation, and whether it occurred during a backtest or live trading. You'll find information about the trading pair, the strategy that generated the signal, and the exchange where it was scheduled. 

The notification also includes details about the planned trade, such as the intended position (long or short), take profit and stop-loss prices (both original and adjusted), and how many entries were involved. The reason for the cancellation is specified, alongside any optional user-provided cancellation identifier. Finally, it includes timestamps related to when the signal was scheduled, became pending, and when the overall process was initiated.

## Interface Signal

This `Signal` object holds all the information about a single trading position within a backtest. It essentially represents a completed trade.

The `priceOpen` property tells you the price at which the position was initially opened.

The `_entry` array records details of each entry point within the position, including the price, cost, and timestamp of each entry.

Finally, the `_partial` array tracks any partial exits from the position, noting the type (profit or loss), percentage, price, cost basis, entry count, and timestamp of each partial exit.


## Interface Signal$2

This `Signal$2` object holds information about a trading position. 

It tracks the initial entry price, represented by the `priceOpen` property.

You'll also find records of entries made into the position, detailing the price, cost, and timestamp for each.

Additionally, it keeps a log of partial exits, noting the type (profit or loss), percentage, current price, cost basis, entry count at the time of the partial exit, and the timestamp. 

These properties together provide a detailed history of the position’s lifecycle.


## Interface Signal$1

This `Signal` object tracks the details of a trading position. 

It keeps track of the entry price for the position using the `priceOpen` property, which is simply a number.

Internally, the `_entry` array records each individual entry point within the position, providing details like price, cost, and the timestamp of that entry. 

Similarly, `_partial` holds information about any partial exits from the position – whether they were profit-taking or loss mitigation – along with details like the percentage, price at exit, cost basis, number of shares exited, and timestamp.


## Interface ScheduledEvent

This data structure holds all the key details about a trading event – whether it was scheduled, opened, or cancelled. Think of it as a comprehensive record for generating reports and analyzing trading activity.

Each event includes the exact time it occurred, what action was taken (like opening a position or canceling a signal), and the specifics of the trade, such as the symbol being traded, the signal's ID, and its position type.

You'll also find pricing information like the initial entry price, take profit levels, and stop loss orders, along with how these prices might have changed.

For events involving multiple entries or partial closes, you'll find the number of entries made and the number of partial closes executed.

If a position was closed, the time of closure and duration of the trade are recorded. In cases of cancellation, a reason and ID are provided to track why the trade was halted.

Finally, it captures the unrealized profit and loss (PNL) at the time of the event, along with timestamps to measure the lifecycle of the trade.

## Interface ScheduleStatisticsModel

This model holds data about how your scheduled trading signals are performing. It lets you see a complete record of all your scheduled, opened, and cancelled signals.

You can view the total number of each type of event, and track important metrics like the cancellation rate and activation rate to understand how effectively your scheduling is working. 

The model also provides insights into how long signals typically wait before being cancelled or activated, helping you optimize your scheduling strategy. It presents everything in a clear format, including a detailed list of all events with their specific details.

## Interface SchedulePingContract

The SchedulePingContract provides a way to keep track of signals that are being monitored on a schedule. You'll receive these ping events roughly every minute while a signal is active – meaning it hasn't been cancelled or fully activated.

These events include details about the trading pair (symbol), the strategy name, and the exchange involved. You'll also get the complete data for the scheduled signal, including information like open price and stop-loss levels.

A key piece of information is the current market price at the time of the ping, which is distinct from the signal’s original opening price. This allows you to build custom logic, such as automatically cancelling a signal if the price drifts too far.

Finally, a flag indicates whether the ping is coming from a backtest (historical data) or a live trading execution.  The timestamp provides the time the ping was sent; in live mode, it's the current time, and in backtest mode, it's the timestamp of the candle being processed. You can register to receive these events using `listenSchedulePing()` or `listenSchedulePingOnce()`.

## Interface RiskStatisticsModel

This model holds statistics about risk events, helping you understand where and why your trading system is encountering issues. It contains a detailed list of individual risk events, allowing for deeper investigation into specific rejections. You'll also find a total count of all risk rejections, providing a general overview of risk activity. To further analyze trends, the model breaks down rejections by the traded symbol and by the trading strategy that triggered them.

## Interface RiskRejectionNotification

This notification provides information when a trading signal is blocked by risk management rules. It's a way for the system to tell you why a potential trade didn't go through.

Each notification has a unique ID and timestamp indicating when the rejection happened, along with a human-readable explanation of the reason. You’ll also see details like the strategy involved, the exchange used, and the trading symbol affected.

The notification includes specifics about the trade itself, such as the intended direction (long or short), entry price, take profit, and stop-loss levels. It also provides context, like the number of active positions and the current market price at the time of rejection. If a signal identifier was associated with the rejected trade, it's included here for reference. A note describing the reason for the signal is also available. Knowing if the rejection happened during a backtest or live trading is also part of the notification.

## Interface RiskEvent

This data structure holds information about times when a trading signal was blocked due to risk management rules. Think of it as a record of when the system said "no" to a trade.

Each `RiskEvent` provides details like the exact time the signal was rejected, the trading pair involved, the specifics of the signal itself, and the name of the strategy and exchange that generated it. You'll also find the current market price at the time of rejection, along with information about any existing positions.

A unique ID is assigned to each rejection to help track and analyze these events, and a note explains why the signal was blocked. Finally, a flag indicates whether the rejection occurred during a backtest or in a live trading environment.


## Interface RiskContract

The RiskContract provides information about signals that were blocked due to risk validation. It's a way to know exactly when and why a trading signal was rejected, helping you monitor and improve your risk management.

This contract contains details like the trading pair involved (symbol), the specific signal that was rejected (currentSignal), and the strategy that generated it (strategyName).  You'll also find information about the timeframe used in the backtest (frameName), the exchange, the price at the time of rejection (currentPrice), and how many other positions were already open (activePositionCount).

Each rejection is given a unique ID (rejectionId) and a human-readable explanation (rejectionNote) to aid in debugging and reporting.  A timestamp (timestamp) indicates exactly when the rejection occurred, and a flag (backtest) clarifies whether the rejection happened during a backtest or in live trading.  Different services like reporting tools or custom alerts can use this data.

## Interface ProgressWalkerContract

This interface helps you monitor the progress of long-running tasks, specifically when running backtests. It provides updates during the process, letting you know which walker is running, which exchange and frame are being used, and what trading symbol is involved. 

You'll see information about the total number of strategies being evaluated and how many have already been processed. A percentage completion value is also provided, ranging from 0.0 to 1.0, so you can easily visualize how far along the process is. This allows you to get a clear picture of the backtest’s status and potential completion time.


## Interface ProgressBacktestContract

The `ProgressBacktestContract` provides a way to monitor the status of your backtest as it runs. It’s designed to give you updates on how far along the backtest is, particularly when running a backtest in the background. 

You’ll receive updates containing details like the exchange and strategy being used, the trading symbol, the total number of historical data points (frames) being analyzed, and how many frames have already been processed.

The `progress` value provides a percentage complete, ranging from 0.0 (start) to 1.0 (finish), allowing you to gauge the estimated time remaining. This information helps you understand the backtest's current state and overall duration.


## Interface PerformanceStatisticsModel

This model holds the performance statistics gathered from a trading strategy. It essentially bundles everything you need to understand how a strategy performed.

The `strategyName` clearly identifies which strategy these statistics belong to. 

`totalEvents` tells you how many performance measurements were taken. 

`totalDuration` represents the overall time spent calculating these performance statistics.

The `metricStats` property is where you'll find a breakdown of the statistics, organized by the type of metric being measured.  Think of it as a way to easily compare different aspects of the strategy’s performance.

Finally, `events` contains the complete list of raw performance data points, allowing for more in-depth analysis if needed.

## Interface PerformanceContract

The `PerformanceContract` helps you understand how your trading strategies are performing. It acts like a detailed log, recording events during the trading process. 

Each entry in this log, called a performance event, includes information such as when it happened, when the previous event occurred, and the type of activity being measured. You’ll also see which strategy and exchange were involved, the name of the trading frame (if applicable), the symbol being traded, and whether the activity took place in backtest or live mode. 

By examining these performance events, you can pinpoint areas where your strategy might be slow or inefficient, helping you optimize its execution. The timestamp data is measured in milliseconds from the epoch. The first event in the log will have a null value for the previous timestamp.

## Interface PartialStatisticsModel

This model holds information about the results of your trading backtest, specifically focusing on partial profit and loss events. It’s designed to help you understand how your strategy performs at different milestones.

The `eventList` property contains a detailed record of each profit or loss event that occurred during the backtest, giving you granular insights.  You’ll also find the `totalEvents` count, representing the total number of profit and loss events. The `totalProfit` and `totalLoss` properties clearly show how many times your strategy generated a profit versus a loss. Essentially, it's a snapshot of your partial performance data.

## Interface PartialProfitContract

The `PartialProfitContract` represents a notification when a trading strategy hits a pre-defined profit milestone, like 10%, 20%, or 30% gain. It's designed to help you keep track of how your strategies are performing and potentially trigger actions based on partial take-profit targets.

This event is generated within the backtest-kit framework and provides detailed information about the trade, including the symbol, strategy name, and exchange. You'll find data like the original entry price, the current price at the milestone, and the specific percentage level reached. The `backtest` flag tells you whether the event originated from a historical simulation or live trading, and the `timestamp` indicates precisely when that milestone was achieved. It’s essentially a record of a strategy progressing towards its profit goal. Services like report generators use this data, and you can also set up your own functions to react to these events.

## Interface PartialProfitCommitNotification

This notification tells you when a partial profit has been taken – essentially, a portion of your trade has been closed. It provides a wealth of information about that specific partial closure, including a unique identifier, when it happened, and whether it occurred during backtesting or live trading.

You'll find details about the trade itself, like the trading pair (e.g., BTCUSDT), the strategy that triggered it, and the exchange used. Crucially, it includes the entry price, the take profit and stop-loss prices (both the original and adjusted values), and the percentage of the position that was closed.

Beyond the basics, this notification contains comprehensive performance data related to the entire position.  This includes peak profit, maximum drawdown, total profit and loss (both in absolute and percentage terms), and details about the prices and costs associated with those metrics. It even breaks down how many entries contributed to the trade and provides information related to slippage and fees. A human-readable note can be included to explain the reasoning behind the signal. Timestamps for various stages of the trade - scheduling, pending, creation and now this partial commitment - are also included.


## Interface PartialProfitCommit

This object represents a partial profit taking event within your backtest. It tells you that a portion of a trade was closed, and provides detailed information about that specific action. You’ll find the percentage of the position that was closed (percentToClose), along with the current market price when the action occurred.

Crucially, this event also includes performance metrics for the position: its total profit and loss (pnl), the highest profit it ever reached (peakProfit), and the largest drawdown it experienced. The trade's direction (long or short) and its entry price (priceOpen) are also included.

You can see the intended take profit and stop loss prices, both as they were originally set and after any trailing adjustments. A timestamp indicates when this signal was generated (scheduledAt), and when the position was initially activated (pendingAt). This detailed data allows you to analyze the effectiveness of your partial profit-taking strategy.

## Interface PartialProfitAvailableNotification

This notification tells you when your trading strategy has hit a profit milestone, like reaching 10%, 20%, or 30% profit. It’s a signal that things are going well! 

The notification includes lots of details: a unique ID, when it happened, whether it's from a backtest or live trading, which trading pair and strategy triggered it, and the current market price at that moment. 

You’ll also see information about the entry price, trade direction (long or short), and how your stop-loss and take-profit levels were calculated, including any trailing adjustments. It details the DCA (Dollar Cost Averaging) history, and important financial metrics like total profit and loss, peak profit, and maximum drawdown. The notification also keeps track of original prices, and gives a complete picture of the position's performance with useful numbers and percentages. It even provides a free text field for any specific notes.

## Interface PartialLossContract

The `PartialLossContract` helps you keep track of when a trading strategy hits predefined loss levels, like -10%, -20%, or -30% drawdown. It's a signal that's sent out whenever a trading strategy experiences a loss milestone.

These signals are specifically designed to monitor how your strategies are performing, particularly their drawdown, and can be used to trigger actions like adjusting stop-loss orders.

You’ll find key information included, such as the trading symbol, the name of the strategy generating the signal, the exchange and frame being used, and the current price when the level was triggered.  The `level` property tells you exactly how much loss has occurred (e.g., `level: 20` means a 20% loss). A `data` field holds the complete original signal information, and a `backtest` flag indicates whether the event occurred during backtesting or live trading.  Finally, a timestamp is provided to indicate exactly when the loss level was detected.


## Interface PartialLossCommitNotification

This notification tells you when a partial closing of a trading position happens, whether it’s part of a backtest or a live trade. It provides a ton of details about the trade, like a unique ID, when it happened, and if it was a backtest or a real trade.

You’ll see information about the trading pair (like BTCUSDT), the strategy that triggered the close, and important pricing data like the entry price, take profit, and stop loss levels.

The notification also includes key performance metrics for the position, like total profit/loss (PNL), the highest profit achieved (peak profit), and the biggest loss experienced (max drawdown).  You'll find the total entries and partials executed, allowing you to track the whole position's lifecycle.

There's also a 'note' field for a human-readable explanation of why the partial close occurred, and timestamps for when the signal was created, scheduled, and when the position started. All of this data allows you to thoroughly analyze the performance and reasons behind each partial closing event.

## Interface PartialLossCommit

This data represents a partial loss event, indicating a strategy is closing a portion of its position. It details exactly what happened: the action taken was a partial loss, and specifies the percentage of the position that was closed. You'll find important price information included, such as the current market price at the time of the action, the entry price, and the original and adjusted take profit and stop-loss prices. 

The record also captures performance metrics for the position, providing total profit and loss, peak profit achieved, and the maximum drawdown experienced.  Finally, it includes timestamps relating to when the signal was created and when the position was initially activated. This comprehensive data allows for a deep understanding of the strategy's behavior and the context surrounding the partial loss.

## Interface PartialLossAvailableNotification

This notification signals that a trading position has reached a pre-defined loss milestone, like a 10% or 20% drawdown. It's a way to track potential trouble spots in a trade and potentially adjust your strategy.

The notification includes a unique ID, a timestamp of when the loss level was triggered, and whether it occurred during a backtest or live trading. You'll find details about the trading pair, the strategy involved, and the exchange used.

It also contains a wealth of information about the trade itself: the entry price, the current price, the position direction (long or short), and the current stop-loss and take-profit levels.

Beyond the immediate trade details, you get a snapshot of the position's performance: peak profit, maximum drawdown, and overall profit/loss percentages. This includes the prices and costs associated with those milestones, and the number of entries made. 

Finally, there's an optional note field for any human-readable explanation of why the signal was generated. Creation timestamps for the signal and the notification itself are also provided for tracking purposes.

## Interface PartialEvent

This object bundles together all the key details about when a profit or loss milestone is hit during a trade. Think of it as a snapshot of what happened at a particular point in time, providing information like when the event occurred, whether it was a profit or a loss, and the trading symbol involved. It also includes details about the strategy and signal that triggered the trade, as well as crucial price points like the entry price, take profit, and stop loss levels – both the original targets and the current market price.

You'll find information about any partial closes executed, the total number of entries if a dollar-cost averaging strategy was used, and the unrealized profit and loss at that moment. There’s even a note field for a human-readable explanation of why the signal was triggered and timestamps to show when the position became active and when the signal was initially created. Finally, a flag indicates whether the trade occurred during a backtest or in a live trading environment.

## Interface MetricStats

This object bundles together statistics related to a specific performance measurement, like order execution time or message processing duration. It provides a comprehensive view of how that metric behaved during a backtest.

You'll find details like the total number of times the metric was recorded, the total time it took across all instances, and the average duration. 

It also breaks down the metric into more granular pieces, including the minimum and maximum values observed, the standard deviation, and key percentiles (like the 95th and 99th percentile).

Finally, it includes information about the time between events related to the metric, giving you the minimum, maximum, and average wait times. This helps to understand the timing characteristics of your system.


## Interface MessageModel

This framework defines a `MessageModel` to represent a single interaction within a conversational AI context, like a chat history. Each message has a `role`, indicating whether it’s a system instruction, a user's input, the assistant’s response, or a result from using a tool. The main content of the message is held in the `content` property, which is the actual text being communicated.

Sometimes, AI models explain their thought process, and this is captured in the `reasoning_content` field. If the assistant uses tools to respond, details about those tool calls are stored in the `tool_calls` array.

Visual information like images can also be included, available as Blobs, raw bytes, or base64 strings. Messages that specifically reply to a previous tool call will have a `tool_call_id` linking them back to that call.

## Interface MaxDrawdownStatisticsModel

This model holds information about maximum drawdown events that have occurred.

It keeps track of each drawdown event individually in a list called `eventList`, which is ordered from the most recent to the oldest.

You can also find the total number of drawdown events recorded in the `totalEvents` property. This provides a quick overview of the frequency of these events.

## Interface MaxDrawdownEvent

This describes a single instance of a maximum drawdown event that occurred while a trading position was open. Each event provides details about when it happened, which trading pair was involved, the name of the strategy used, and a unique identifier for the signal that triggered the trade.

You'll find information about the position's direction (long or short), its total profit and loss (PNL), and the highest profit reached during the position’s life. Crucially, it records the maximum drawdown experienced, alongside the price at which the drawdown was reached, the entry price, and any set take profit or stop loss levels. Finally, it indicates whether this event occurred during a backtest simulation.

## Interface MaxDrawdownContract

The MaxDrawdownContract provides information whenever a new maximum drawdown occurs for a trading position. It essentially tells you the biggest loss experienced by a strategy so far.

This data includes details like the trading symbol, the current price, the time the drawdown happened, the strategy and exchange names, and the timeframe being used. You'll also get the signal data related to the position and a flag to indicate whether the event occurred during a backtest or live trading.

By receiving these updates, you can build custom logic to manage risk, perhaps adjusting stop-losses or optimizing position sizes in response to drawdown levels. Tracking these events gives you a real-time view of potential losses and allows for proactive adjustments to your trading strategies.

## Interface LiveStatisticsModel

The LiveStatisticsModel provides a detailed view of your live trading performance. It collects data from every trade event, including idle periods, order openings, active trades, and closed positions, allowing you to analyze what's working and what's not.

You'll find the raw event data in the `eventList`, along with the total number of events and closed trades. Key performance indicators like win count, loss count, and win rate help gauge profitability. 

Beyond basic wins and losses, it calculates the average and total PNL (profit and loss) per trade and across all trades. Volatility is measured with standard deviation, and risk-adjusted performance is evaluated using the Sharpe Ratio and its annualized version. The Certainty Ratio and Expected Yearly Returns provide further insight into the consistency and potential of your trading strategy. Finally, it tracks peak and fall PNLs to help understand the magnitude of price swings during trades. Note that any calculation resulting in an unsafe value (like division by zero) will be represented as null.

## Interface InfoErrorNotification

This interface handles notifications about errors that occur during background tasks, but aren't critical enough to stop the entire process. 

Each notification has a specific type, a unique identifier, and contains details about the error itself, including a user-friendly message. 

You'll also find a serialized error object with a stack trace and additional information, and a flag that's always false because these notifications come from the live trading context, not the backtest itself. Think of it as a way to be alerted to potentially problematic situations without disrupting your ongoing tests.

## Interface IdlePingContract

This contract represents a ping event that occurs when a trading strategy isn't actively responding to any signals. It's like a heartbeat indicating the strategy is in a 'waiting' or 'idle' state.

Think of it as a notification saying, "Hey, this strategy is currently not making any trades."

The event provides details like the trading symbol ("BTCUSDT"), the name of the strategy involved, and the exchange it's running on. 

For backtests, it also includes a "frameName" for context and a flag to distinguish between real-time and historical data. You can use this to track the lifecycle and behavior of your strategies during periods of inactivity. 

Finally, it captures the current price and the exact timestamp of the ping, which is crucial for accurate tracking whether you’re live trading or running a backtest. Developers can "listen" for these events to build custom monitoring or reporting tools.

## Interface IWalkerStrategyResult

This interface defines the outcome of running a trading strategy within a backtest comparison. It bundles together key information about each strategy tested.

You'll find the strategy's name, a set of statistics calculated from its backtest results, and a specific metric value used to rank its performance. Finally, the `rank` property tells you where this strategy sits relative to all the others being compared – the lower the number, the better the performance based on the chosen metric.

## Interface IWalkerSchema

This schema defines how to set up A/B testing for different trading strategies. 

Think of it as a blueprint for comparing how well several strategies perform against each other. You provide a unique name for your test setup, a description for your reference, and specify the exchange and timeframe you want to use for all the strategies involved.

The most important part is the `strategies` array, which lists the names of the strategies you’re comparing – these need to be registered beforehand. 

You can also choose a metric to optimize, like the Sharpe Ratio, or customize the process using callbacks for specific events.

## Interface IWalkerResults

The `IWalkerResults` interface holds all the information gathered when a trading strategy comparison, or "walker," is finished. It essentially summarizes the outcome of running a walker.

You'll find key details like the trading symbol that was tested, the exchange used to perform the tests, the name of the specific walker that ran the comparison, and the timeframe (or "frame") used for the backtesting. This interface lets you easily access these core pieces of information after a walker has completed its work.

## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you customize what happens during the backtest comparison process. Think of it as a way to listen in on the testing, receiving notifications at key moments.

You can be notified when a particular strategy begins testing, allowing you to log the start or prepare for data collection.

When a strategy’s backtest is finished, you'll get a call with performance statistics and a key metric, enabling you to analyze the results immediately.

If a strategy encounters an error during testing, you’ll be alerted, allowing you to investigate and potentially handle the issue gracefully.

Finally, once all strategies have been tested and the entire process is complete, a final callback is triggered, giving you access to the overall results.

## Interface ITrailingTakeCommitRow

This interface describes a queued action related to trailing take profit and stop-loss orders. It represents a single instruction to adjust the trailing stop based on a price shift.

The `action` property always indicates this is a "trailing-take" action. 

`percentShift` specifies the percentage change in price that triggers the adjustment. Finally, `currentPrice` records the price level at which the trailing stop was initially set.

## Interface ITrailingStopCommitRow

This interface represents a queued action related to trailing stop orders. Think of it as a record that's waiting to be processed, telling the system to adjust a trailing stop. 

It includes the type of action – specifically, "trailing-stop" – so the system knows what kind of adjustment to make.  You’ll also find the `percentShift`, which is the percentage amount the trailing stop should be adjusted, and the `currentPrice`, which is the price at the time the trailing stop was initially set. These values are crucial for correctly calculating the new trailing stop price.

## Interface IStrategyTickResultWaiting

This type, `IStrategyTickResultWaiting`, represents a situation where a trading signal is ready to be triggered but is currently paused, waiting for the price to reach the desired entry point. It's something you'll see repeatedly after a signal is initially created.

Think of it as the system keeping an eye on the price, and this result tells you exactly what's happening.

The information included provides details like the signal itself, the current price being monitored, the name of the strategy involved, the exchange and timeframe it relates to, and how far along it is towards take profit and stop loss targets – although these are currently at 0% as the position isn’t yet active. You'll also find information about the strategy’s performance (pnl), whether this is a backtest or live trade, and when the result was generated. This data helps you track the signal’s progress and understand its status.

## Interface IStrategyTickResultScheduled

This interface describes a specific event within the trading framework – a signal that's been scheduled and is awaiting the right price to trigger a trade. Think of it as a "waiting" signal.

It provides details about the signal itself, including the strategy and exchanges involved, the trading symbol, and the timeframe being used. The `currentPrice` represents the price at the moment the signal was scheduled. 

Knowing if the event originates from a backtest or live trading environment is also part of the information included.  Essentially, it's a record of a signal waiting in the wings, ready to be acted upon when the price conditions are met.


## Interface IStrategyTickResultOpened

This data represents what happens when a new trading signal is created within your strategy. It’s triggered after the signal has been validated and saved.

The information includes the signal itself, complete with a unique identifier, along with details like the strategy and exchange involved. You'll also find data about the trading pair, the current price at the time the signal opened, and whether it’s part of a backtest or live trading scenario. Crucially, it also includes a timestamp indicating precisely when this signal generation occurred, referenced to the candle timestamp in backtest or the time of execution when live. This lets you precisely track and analyze signal creation events.

## Interface IStrategyTickResultIdle

This interface represents a tick result indicating that a trading strategy is currently in an idle state, meaning no active trading signal is present. It provides detailed information about the context of this idle state.

The `action` property confirms the 'idle' status.  The `signal` property is explicitly `null` to reinforce this.

The record includes the strategy's name, the exchange it's operating on, the timeframe being used (like 1-minute or 5-minute intervals), and the symbol being traded.  You’ll also find the current price at the time of the idle state, as well as whether the execution is a backtest or a live trade. Finally, a timestamp marks precisely when the idle state was recorded.

## Interface IStrategyTickResultClosed

This data structure represents the outcome when a trading signal is closed, providing a complete picture of what happened. It includes the reason for the closure, whether it was due to a time limit, a profit or loss target, or a manual close. 

You'll find details like the final price used for the calculation, the exact time of the close, and a breakdown of the profit and loss, taking into account fees and slippage. It also logs key identifying information, such as the strategy and exchange names, the trading symbol, and whether the test was a backtest or a live trade. A unique close ID is available for manually closed signals, helping you track specific actions. Finally, the record includes a timestamp of when the result was created, linking it to the candle data or the live execution.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a signal you planned to act on is canceled before a trade actually takes place. It's useful for understanding why a signal didn't lead to a position being opened – perhaps it was cancelled because a stop-loss was triggered first.

The data includes details about the signal that was cancelled, the price at the time of cancellation, and timestamps for when it happened and when the data was created.

You'll also find information to help you track down the source of the cancellation, like the strategy, exchange, timeframe, and the trading pair involved.

Specifically, the `reason` property explains *why* the cancellation occurred, and a `cancelId` is provided if the cancellation was triggered by a manual cancellation request. Finally, a flag `backtest` indicates whether the event happened during a backtest or in a live trading environment.

## Interface IStrategyTickResultActive

This data structure represents a tick result during active trading, specifically when a signal is being monitored and the strategy is waiting for a take profit (TP), stop loss (SL), or time expiration. It contains detailed information about the active signal, including the current price being monitored, the name of the strategy and the exchange it's running on, and the trading symbol. 

You'll find data concerning the progress towards TP and SL, expressed as percentages, and the unrealized profit and loss (PNL) for the position, factoring in fees and slippage. 

The record also indicates whether it originated from a backtest or live trading environment and includes timestamps for tracking and managing the backtest process. It’s essentially a snapshot of the active position’s status at a specific moment in time.

## Interface IStrategySchema

This schema describes how you define a trading strategy within the backtest-kit framework. 

Each strategy needs a unique name to identify it. 

You can also add a note to provide helpful information for other developers.

The `interval` property lets you control how often the strategy generates signals, preventing it from running too frequently.

The core of the strategy is the `getSignal` function, which takes market data and returns a signal – or nothing if no signal is available.  This function can be configured to either execute immediately or to wait for a specific price level.

Optional callbacks, such as `onOpen` and `onClose`, allow you to trigger specific actions at different points in the strategy's lifecycle.

You can also associate risk profiles with your strategy using `riskName` or `riskList` to integrate it into your overall risk management system. Finally, `actions` allows you to tag your strategies for specific purposes.

## Interface IStrategyResult

The `IStrategyResult` represents a single run of a trading strategy during a backtest. Think of it as a record of how a strategy performed.

It holds the strategy's name, allowing you to identify which strategy generated the results.  It also includes detailed statistics about the backtest, covering things like profit, drawdowns, and win rate.

Critically, it also stores the value of the metric you’re using to judge the strategy's performance.  The `firstEventTime` and `lastEventTime` properties indicate when the strategy started and stopped generating signals. If a strategy didn’t produce any signals, these times will be null.


## Interface IStrategyPnL

This interface, `IStrategyPnL`, represents the final profit and loss result for a trading strategy. It gives you a clear picture of how your strategy performed, factoring in real-world costs. 

The `pnlPercentage` tells you the profit or loss as a percentage – a quick way to see if you're making money or losing it.

To understand the actual prices used for calculations, you'll find `priceOpen` and `priceClose`, both adjusted to account for fees and slippage.

`pnlCost` shows the actual dollar amount of profit or loss, calculated from your total invested capital.

Finally, `pnlEntries` represents your total investment, which is the sum of all your initial costs for entering trades.


## Interface IStrategyCallbacks

This interface defines a set of optional callbacks you can use to monitor the lifecycle of your trading signals within the backtest-kit framework. Think of these as event listeners that trigger whenever a signal transitions between different states.

You'll receive a notification at each stage: every tick, when a signal is opened, when it's actively monitored, during idle periods, when it closes, when it's scheduled for later entry, or when a scheduled signal is cancelled. There are also callbacks specifically for partial profit, partial loss, reaching breakeven, and custom monitoring pings for scheduled and active signals. These callbacks provide valuable opportunities to observe and potentially react to your strategies' behavior during a backtest. The `backtest` flag lets you differentiate between live and historical data, and the provided data objects give you access to relevant information like signal details, current prices, and timestamps. Finally, the `onWrite` callback is used when data is saved for testing purposes.

## Interface IStrategy

The `IStrategy` interface outlines the core methods used when running a trading strategy. It includes ways to handle individual ticks (price updates), retrieve pending and scheduled signals (orders), and check for key conditions like breakeven or if the strategy is stopped.

It also provides functions to monitor the position’s performance, such as how much of the position is still open, the total costs, and the average price. Backtesting is supported through a `backtest` function, allowing the strategy to be tested on historical data.

The interface includes methods for controlling a strategy's actions—stopping, canceling scheduled entries, activating scheduled entries, and closing positions—as well as adjusting partial profits, losses and trailing stops.  Finally, there are several getter methods providing details about the position's history and current state, covering things like profit peaks, drawdowns, and time elapsed. `dispose` is used to properly clean up resources when the strategy is no longer needed.

## Interface IStorageUtils

This interface outlines the core functionality any storage adapter used within the backtest-kit trading framework must provide. It defines how the system interacts with storage to manage and track trading signals. 

Specifically, it handles events like when a signal is opened, closed, scheduled, or cancelled, allowing the adapter to record these actions. It also provides methods to locate a signal using its unique ID and retrieve a complete list of all stored signals. 

Finally, it handles ping events to keep track of when signals are actively running (for opened signals) or are scheduled (for scheduled signals), ensuring the signal’s information remains up-to-date.

## Interface IStorageSignalRowScheduled

This interface describes a signal that's been scheduled for execution. 

It's straightforward: a scheduled signal simply has a `status` property that's set to "scheduled".  This helps track the state of signals that are waiting to be acted upon.

## Interface IStorageSignalRowOpened

This interface represents a signal that has been opened, indicating an active trading position. It contains a single property, `status`, which is always set to "opened". Think of it as confirming that a signal has been triggered and a trade is underway. This information helps track the lifecycle of a signal within the backtest.

## Interface IStorageSignalRowClosed

This interface represents a signal that has been closed, meaning it's no longer active. 

It holds information specifically related to the signal's closed state, including its profit and loss (PNL). 

The `status` property confirms that the signal is indeed closed, and the `pnl` property provides the financial outcome associated with that closed trade. This is where you’ll find the performance data for signals that have concluded.


## Interface IStorageSignalRowCancelled

This interface defines the structure for a signal row that has been cancelled. It's a simple way to represent a signal that’s no longer valid or active. The key piece of information it holds is the `status`, which is always set to "cancelled."  Essentially, if you encounter an `IStorageSignalRowCancelled`, you know that the signal it describes has been explicitly marked as cancelled.

## Interface IStorageSignalRowBase

This interface defines the core properties shared by all signal storage rows, regardless of their specific status. It ensures that every signal stored includes precise creation and update timestamps, which are pulled from the strategy tick results. Additionally, a priority field is included, enabling control over the order in which signals are processed – it defaults to the current timestamp. This standardized structure facilitates consistent data management and reliable signal handling within the backtest-kit framework.


## Interface ISizingSchemaKelly

This schema defines how to size your trades using the Kelly Criterion, a method for maximizing growth rate. It’s essential for specifying that you want to use the Kelly Criterion for sizing and includes a multiplier to control how aggressively you apply it. The multiplier determines what portion of your calculated Kelly fraction you actually risk; a lower multiplier, like the default 0.25, is a more conservative approach, while a higher value risks more capital per trade.

## Interface ISizingSchemaFixedPercentage

This schema defines a simple way to size your trades by using a fixed percentage of your capital for each trade. 

It's straightforward: you simply specify a `riskPercentage` which represents the percentage of your total capital you're willing to risk on a single trade. 

For example, if your `riskPercentage` is set to 20, then 20% of your total capital will be used to determine the trade size. This ensures consistent risk exposure for every trade you execute.

## Interface ISizingSchemaBase

This interface defines the basic structure for sizing schemas used within the backtest-kit framework. Each sizing schema needs a unique identifier, which is its `sizingName`. You can also add a descriptive `note` to clarify the purpose of the sizing configuration. 

The schema also specifies constraints on position sizes: a percentage limit on the account (`maxPositionPercentage`), and minimum and maximum absolute values for position size (`minPositionSize`, `maxPositionSize`). Finally, you can include optional callbacks (`callbacks`) to customize the sizing behavior at different stages.

## Interface ISizingSchemaATR

This schema defines how to size your trades using the Average True Range (ATR). 

It's specifically designed for strategies where you want your stop-loss distance to be related to the ATR, which helps adapt to market volatility. 

You'll set a `riskPercentage` to control how much of your capital is at risk on each trade, and an `atrMultiplier` to determine how many times the ATR value your stop-loss should be placed away from the entry price. This combined approach aims to dynamically manage risk and position size.


## Interface ISizingParamsKelly

This interface defines the parameters used when calculating position sizes using the Kelly Criterion, a popular strategy for managing risk in trading.  It primarily contains a logger, which is used to output debugging information and track the sizing process. The logger helps in understanding how the Kelly Criterion is being applied and allows for troubleshooting if needed. You'll use this when setting up the sizing behavior for your trading strategies.

## Interface ISizingParamsFixedPercentage

This interface defines the settings for how much of your capital to use for each trade when using a fixed percentage sizing strategy. It requires a logger to help track and understand what's happening during the trading process. The logger provides a way to see debug information and identify any issues.

## Interface ISizingParamsATR

This interface defines the settings you can use when determining how much to trade based on the Average True Range (ATR). 

It's all about controlling the sizing of your trades using ATR, which helps manage risk.

The `logger` property is essential for tracking what's happening – think of it as a way to get feedback and debug any issues. It’s a service that allows you to write messages for debugging or monitoring purposes.


## Interface ISizingCallbacks

The `ISizingCallbacks` interface lets you hook into the sizing process within the backtest-kit framework. 

Specifically, the `onCalculate` function is triggered immediately after the framework determines the size of a position. This gives you a chance to observe the calculated quantity and any relevant parameters, perhaps to log this information or perform checks to ensure the sizing logic is behaving as expected. You can use either a regular function or a function that returns a promise for this callback.


## Interface ISizingCalculateParamsKelly

When calculating your trade sizes using the Kelly Criterion, you’ll need to provide certain information. This set of parameters defines what’s needed. You’ll specify the method as "kelly-criterion" to indicate you want to use this calculation.  Then you need to tell the system your win rate, which is expressed as a number between 0 and 1. Finally, provide the average ratio of your wins to your losses.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the data needed when using a fixed percentage sizing strategy. It requires you to specify the method, which is always "fixed-percentage" to indicate you're using this particular sizing method. You'll also need to provide a `priceStopLoss`, which represents the price at which you'll place a stop-loss order. This helps the system calculate the appropriate size based on your desired risk management.

## Interface ISizingCalculateParamsBase

This interface defines the foundational information needed for calculating trade sizes. Every sizing calculation relies on knowing the symbol being traded, like "BTCUSDT", as well as the current account balance to determine how much capital is available. Finally, the planned entry price, or the price at which the trade is intended to be executed, is essential for sizing calculations.

## Interface ISizingCalculateParamsATR

This interface defines the settings you'll use when determining how much of your capital to allocate to a trade based on the Average True Range (ATR). The `method` property is fixed to "atr-based," indicating this is specifically for ATR sizing.  You'll need to provide an `atr` value, which represents the current Average True Range calculated for the asset you're trading – this number is the key input for the sizing calculation itself.

## Interface ISizing

The `ISizing` interface is the core component for determining how much of an asset to trade – essentially, your position size. It's used behind the scenes when your trading strategy is running.

The `calculate` property is the most important part; it's a function you'll need to implement. This function takes parameters related to your risk and trading style and returns a number representing the calculated position size. Think of it as defining your risk management rules for each trade.


## Interface ISignalRow

This `ISignalRow` interface describes a complete trading signal within the backtest-kit framework. Think of it as a finalized signal ready for execution, built after initial validation. Each signal has a unique ID for tracking and contains important details like the cost of the trade, the entry price, and expected hold time.

It also stores information about the exchange and strategy used, the trading frame, and timestamps related to when the signal was created and became active. 

Beyond the basics, the signal keeps track of partial profits or losses if the position was closed out early.  It also manages trailing stop-loss and take-profit prices, dynamically adjusting them based on the trade's performance, and tracks the highest and lowest prices seen during the trade's lifespan for performance analysis.

Finally, for strategies using Dollar Cost Averaging (DCA), it maintains a record of each entry price, and the original entry price is preserved for reference. Overall, `ISignalRow` provides a comprehensive record of a trade signal from initiation to (potentially partial) completion.

## Interface ISignalIntervalDto

This data structure, `ISignalIntervalDto`, is designed to help fetch multiple signals at once, improving efficiency. Think of it as a way to bundle signals together, ensuring they're delivered in a controlled sequence. The `id` property simply provides a unique identifier for each signal, like a serial number, to help keep track of them. This is particularly useful when you need to wait for a specific time interval before proceeding to the next signal.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, essentially a set of instructions for a trade. It contains all the necessary information to execute a position. Each signal automatically receives a unique ID, and you can also specify one yourself.

You'll define the trade's direction as either "long" (buying) or "short" (selling). A note field allows you to add a brief explanation for the signal’s rationale.

The signal includes the entry price, the target price for taking profit, and a stop-loss price to manage risk.  Critically, the take-profit and stop-loss prices must be set appropriately for long versus short positions. 

You can also specify an estimated duration for the signal in minutes; if not provided, it defaults to a global configuration setting. A value of `Infinity` means the position stays open indefinitely until either the take-profit or stop-loss is triggered, or it’s manually closed. Finally, the signal includes the cost associated with entering the position, which also defaults to a global configuration value.

## Interface IScheduledSignalRow

The `IScheduledSignalRow` represents a trading signal that isn't immediately executed. Think of it as a signal that's on hold, waiting for the price to reach a certain level. 

It builds upon the basic signal representation (`ISignalRow`), but adds the feature of waiting for a specific price (`priceOpen`) to be hit. 

When the price does reach that target, the "pending" signal transforms into a regular, active signal. A key detail is that the time it's been pending is tracked, initially referencing when it was scheduled, and then updating to the actual time it was activated. The `priceOpen` property simply defines that price target.

## Interface IScheduledSignalCancelRow

This interface describes a scheduled trading signal that might be canceled by a user. It builds upon a standard scheduled signal, but adds extra information to track cancellations. If a user cancels a scheduled signal, this interface includes a `cancelId` – a unique identifier for that specific cancellation – and a `cancelNote` which allows users to add a reason or explanation for the cancellation. This makes it easier to manage and understand why certain signals were removed from the schedule.

## Interface IRunContext

The `IRunContext` is essentially a container that holds all the information a function needs to operate within the backtest-kit framework. Think of it as a master bundle of details – it combines the information about *where* a strategy is running (exchange, strategy, frame) with the *current conditions* of that run (the symbol being analyzed, the timestamp, and whether it's a backtest or not). This context is provided to functions so they don't have to constantly request individual pieces of information, streamlining the process. It's a central source of truth for what's happening during a backtest or live trading execution.

## Interface IRiskValidationPayload

This data structure holds the information needed to evaluate risk during the trading process. It builds upon the base `IRiskCheckArgs` by adding details about the current trading signal and the overall portfolio status. Specifically, it includes the `currentSignal` – the signal being analyzed which is guaranteed to have pricing information – along with the number of currently open positions (`activePositionCount`) and a complete list of those active positions (`activePositions`). This comprehensive view allows risk validation functions to make informed decisions based on the signal and the portfolio’s exposure.

## Interface IRiskValidationFn

This defines the structure for functions that check if a trade idea meets certain risk criteria. Think of it as a gatekeeper for your trades. If the function determines everything is okay, it simply allows the trade to proceed, returning nothing. However, if something is amiss – maybe the position size is too large, or a risk metric is out of bounds – the function needs to signal this. It can do this by returning a special rejection object detailing the problem, or by throwing an error which will also be converted into that rejection object.

## Interface IRiskValidation

This interface helps you define how to validate risk parameters in your trading strategies. It’s like setting up rules to make sure things are within acceptable bounds. You provide a function, `validate`, which actually performs the validation check, and you can also add a `note` to explain what the validation is supposed to do – helpful for anyone reading your code later. Essentially, it’s a way to ensure your risk management is sound and well-documented.

## Interface IRiskSignalRow

This interface, IRiskSignalRow, helps manage risk during trading. It builds upon the existing SignalDto, adding essential price details. Specifically, it includes the entry price, the initially set stop-loss price, and the original take-profit price. These values are crucial for validating risks and referencing the original trade parameters during the backtesting process.

## Interface IRiskSchema

The IRiskSchema lets you define and register specific risk profiles for your portfolio. Think of it as setting up custom rules and checks to manage risk at a portfolio level. 

Each risk profile has a unique identifier, and you can add notes to document its purpose.

You can also configure callbacks to trigger actions at different points in the risk assessment process, like when a trade is rejected or allowed. 

Finally, the core of the schema is the validations array, which holds the actual logic for enforcing your risk controls – these are the custom rules that determine whether a trade is allowed based on your defined criteria.

## Interface IRiskRejectionResult

This interface describes the result when a risk validation check fails. It provides details to help you understand why the validation didn't pass. Each rejection has a unique ID, allowing you to track specific issues.  You’ll also find a clear, human-readable explanation of the reason for the rejection in the 'note' property, to help you troubleshoot and fix the underlying problem.

## Interface IRiskParams

This interface defines the information needed to manage risk during trading, whether you're running a test or live trading. It includes things like the name of the exchange you're using, a way to log any issues, and details about the current trading environment, like which symbol is being traded and if it's a backtest.

You can also specify a callback function that gets triggered when a trading signal is blocked due to risk limits. This callback lets you handle the rejection and communicate that event separately from other risk-related actions. Essentially, it allows for fine-grained control and reporting when a trade is prevented by risk constraints.

## Interface IRiskCheckArgs

IRiskCheckArgs holds all the information needed to decide if a new trade should even be considered. Think of it as a gatekeeper – it’s used *before* a trading signal is generated to make sure conditions are right. It contains details like the trading pair (symbol), the signal itself, the name of the strategy suggesting the trade, the exchange being used, and other identifiers like the risk name and frame. You'll also find the current price and timestamp, giving context for the risk assessment. Basically, it's a collection of data allowing a risk check to validate if a signal should proceed to the next stage.

## Interface IRiskCallbacks

This section defines optional functions you can use to be notified about risk-related events during your trading simulations. You can specify an `onRejected` function to be called when a trading signal is blocked because it exceeds pre-defined risk limits. Conversely, the `onAllowed` function will be triggered when a signal successfully passes all your risk checks and is approved for execution. These callbacks provide a way to observe and potentially react to the risk assessment process as it happens.

## Interface IRiskActivePosition

This interface represents a single active trading position that's being monitored for risk management. Think of it as a snapshot of a trade – it contains key details like which strategy opened it, on which exchange and frame. You’ll find information about the symbol being traded (like BTCUSDT), whether it's a long or short position, and important price levels like the entry price, stop-loss, and take-profit. 

The interface also includes details about how long the position is expected to last and the exact time it was opened. All these pieces together give a clear picture of what's happening with a particular trade and how it contributes to the overall risk profile.


## Interface IRisk

The `IRisk` interface defines how risk management is handled within the backtest-kit framework. It's the core of ensuring trades align with pre-defined risk parameters.

You'll find two key functions: `checkSignal` and `manageSignal`.  `checkSignal` allows you to verify if a trading signal should be executed, ensuring it respects your risk limits. 

`addSignal` helps to keep track of positions you've opened, essentially registering them with the risk system. Similarly, `removeSignal` is used to notify the system when a position has been closed. Think of it as registering and deregistering trades to maintain an accurate picture of your current risk exposure.

## Interface IReportTarget

This interface lets you finely control which details are logged during a backtest or live trading session. Think of it as a way to turn on or off specific reporting features.

You can choose to track things like strategy changes, risk management decisions, breakeven points, partial order executions, and performance metrics.

Each property, such as `strategy` or `risk`, represents a different type of event you might want to record. Setting a property to `true` activates that specific reporting, while `false` disables it.

By customizing these settings, you can focus on the most important aspects of your trading system and keep your log files manageable. This gives you a lot of control over what information you receive about your trades.

## Interface IReportDumpOptions

This interface defines how you can control what data gets written into your backtest reports. Think of it as a set of filters to help you focus on the specific trades or strategies you're interested in analyzing. You can specify the symbol being traded, like "BTCUSDT," the name of the trading strategy, the exchange used, the timeframe (like a 1-minute or 1-hour chart), a unique ID for the signal that triggered the trade, and the name of the optimization walker involved. By providing these details, you can create highly targeted reports that reveal valuable insights into your backtesting results.

## Interface IRecentUtils

This interface helps manage and access recent trading signals. It provides ways to record new signals when they come in, and to quickly find the most recent signal for a specific trading setup – like a particular symbol, strategy, exchange, and timeframe. You can also easily determine how long ago that latest signal was generated. Essentially, it's the foundation for keeping track of the most up-to-date information about what your trading system is currently suggesting.


## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, gives you a clear view of a trading signal, especially focusing on its original risk management parameters. It builds upon the base `ISignalRow` to expose key information designed for external use, like user interfaces or reporting tools.

You'll find properties here that represent the initial stop-loss and take-profit prices, which remain constant even if the strategy employs trailing stop-loss or take-profit adjustments. This transparency lets users understand the original plan alongside the current, potentially modified, settings.

Beyond the basics, it also includes details like the initial position cost, how much of the position has been closed through partial executions, and the total number of entries and partials.  The `originalPriceOpen` shows the initial entry price, independent of any subsequent averaging.  Furthermore, you get insight into the position's performance with metrics like unrealized profit and loss (`pnl`), peak profit, and maximum drawdown. This gives a complete picture of the signal's journey.

## Interface IPublicCandleData

This interface defines the standard structure for candlestick data used within the backtest-kit framework. Each candlestick represents a period of time, like a minute, hour, or day, and encapsulates key price and volume information. You’ll find the exact time the candle began recorded as a Unix timestamp, alongside the opening price, the highest and lowest prices reached during that time, and the closing price. Finally, the total trading volume for that period is also included.

## Interface IPositionSizeKellyParams

When calculating position sizes using the Kelly Criterion, these parameters define the key factors influencing how much capital to risk on each trade. The `winRate` represents the percentage of winning trades you expect.  The `winLossRatio` tells you the average profit you make on winning trades compared to the average loss on losing trades.  Together, these values help determine an optimal sizing strategy to maximize long-term growth while managing risk.

## Interface IPositionSizeFixedPercentageParams

This defines the parameters needed for a trading strategy that uses a fixed percentage of your capital for each trade. It's focused on determining how much to trade based on a percentage, and it includes the stop-loss price you want to use to limit potential losses. The `priceStopLoss` property lets you specify the price at which you'll automatically exit the trade if it moves against you.

## Interface IPositionSizeATRParams

The `IPositionSizeATRParams` interface holds the settings needed for determining position size using the Average True Range (ATR) method.  It's a straightforward way to link the current ATR value to your trading strategy's sizing decisions. Specifically, the `atr` property represents the latest calculated ATR value, which will be used in the sizing logic.

## Interface IPositionOverlapLadder

IPositionOverlapLadder helps you define how to identify overlapping positions when using dollar-cost averaging (DCA). Think of it as setting up a buffer zone around each purchase price.

You control this buffer with two values: `upperPercent` and `lowerPercent`.

`upperPercent` determines how much *above* a purchase price is considered an overlap. For example, if it's set to 5%, any subsequent purchase is flagged if it's 5% or more above the original price.

`lowerPercent` works similarly but defines how much *below* a purchase price is considered an overlap. A value here, like 3%, would flag a purchase if it's 3% or less below the previous price.

These percentages are expressed as values between 0 and 100.

## Interface IPersistBase

This interface outlines the basic operations needed for any custom storage system used with backtest-kit. Think of it as a contract that your storage solution must adhere to. 

It defines how to initialize storage, retrieve entities by their ID, check if an entity exists, save entities, and list all available entities. 

The `waitForInit` method sets things up initially, ensuring everything's ready before you start. `readValue` and `hasValue` let you grab information from storage, while `writeValue` is how you save your data. Finally, `keys` gives you a way to get a list of all the entities stored. The keys are provided in sorted order for easy iteration and validation.


## Interface IPartialProfitCommitRow

This describes a record representing a partial profit-taking action that’s been queued up during a backtest. Think of it as a single step in a strategy designed to take profits incrementally. 

It includes information like the percentage of the position being closed – for example, closing 25% of your holdings.  You’ll also find the price at which that partial profit was actually executed, which is crucial for accurate performance reporting.  Essentially, it's a snapshot of a small profit-taking move within a larger trading strategy.

## Interface IPartialLossCommitRow

This represents a request to partially close a position. 

Think of it as a message saying "I want to sell a portion of my holdings."

It includes details like the percentage of the position to sell (`percentToClose`), 
the price at which the partial sale happened (`currentPrice`), and a confirmation that this is indeed a partial loss action (`action`). 
This row is placed in a queue, so it isn't immediate.

## Interface IPartialData

This data structure represents a snapshot of trading progress, designed for saving and loading. It’s used to store key information about a signal's performance, like the profit and loss levels it has encountered. Think of it as a simplified version of the full state, containing just the essential details needed to resume trading later. The `profitLevels` and `lossLevels` properties specifically hold arrays of levels reached, making them easy to store and retrieve.

## Interface IPartial

The `IPartial` interface handles tracking how much profit or loss a trading signal is generating. It’s used internally by the framework to keep tabs on signal performance.

Whenever a signal reaches certain profit milestones (like 10%, 20%, or 30% profit), or loss milestones, events are triggered to notify other parts of the system.

The `profit` method handles profit calculations, while the `loss` method deals with losses. These methods are called when a signal's performance is being monitored and ensure that events are only sent for new milestones.

Finally, the `clear` method resets the profit/loss tracking when a signal is finished, whether it's hit a target price, a stop-loss, or just expired. This method also helps clean up resources and ensure data consistency.

## Interface IParseArgsResult

The `IParseArgsResult` interface holds the information gathered when command-line arguments are processed. It combines the original input arguments with flags that specify the trading mode.

Specifically, it tells you whether the application should operate in backtest mode, which uses historical data for simulation, or in paper trading mode, which simulates trading with live data.  Finally, it indicates whether the application should run in live trading mode, meaning real trades with real money.

## Interface IParseArgsParams

The `IParseArgsParams` interface describes the information needed to run a trading strategy. Think of it as a blueprint for what your command-line arguments should look like. It requires you to specify things like the trading pair you're interested in (like "BTCUSDT"), the name of the strategy you want to use, which exchange you're connecting to (like "binance"), and the timeframe for the candle data you'll be using (like "1h" for one-hour candles). Essentially, it's all the core details needed to get your backtest started.

## Interface IOrderBookData

This interface defines the structure of order book data, which represents the current state of buy and sell orders for a specific trading pair. 

It contains a `symbol` property identifying the trading pair, like "BTCUSDT."

The `bids` property holds an array of bid orders – essentially, the prices buyers are willing to pay. 

Similarly, `asks` holds an array of ask orders, representing the prices sellers are offering. Each of `bids` and `asks` is an array of `IBidData` objects, each detailing a specific price and quantity.

## Interface INotificationUtils

This interface defines the core functionality for any system that wants to send notifications about what's happening in your backtest or trading strategy. Think of it as a central point where different notification methods – like sending emails, updating a dashboard, or triggering alerts – can plug in.

Each method represents a specific event that needs to be communicated: signal generation (opening, closing, etc.), profit and loss updates, strategy adjustments (like partial profits), synchronization events, risk rejections, and various error conditions. The `getData` method allows you to retrieve a record of these notifications, and `dispose` helps clean up and remove the stored notifications when you’re finished. Essentially, it ensures all notification adapters can interact in a consistent way.

## Interface INotificationTarget

The `INotificationTarget` interface lets you fine-tune which notifications your backtest or live trading system receives. Think of it as a way to selectively listen for only the events you're interested in, rather than being bombarded with everything. If you don't specify this interface, you'll receive all notifications by default.

You can enable or disable notifications related to signal events like opening, scheduling, closing, and cancellation. You can also subscribe to alerts about reaching partial profit or loss targets, breaking even, or confirmations of strategy actions.

Furthermore, you can track synchronization events for live trading, responses from the risk manager, informational messages from the strategy, and even different types of errors—both recoverable and critical. The `validation_error` property helps you catch problems with your strategy's configuration or the data it’s using. Each property corresponds to a specific type of notification and its source.

## Interface IMethodContext

The `IMethodContext` object provides essential information about the current trading operation. Think of it as a little package of data that tells the backtest system *where* to find the right pieces it needs – like the specific strategy, exchange, and timeframe being used. It carries the names of these schemas, so the system knows exactly which configurations to load. This object is automatically passed around within the backtest framework, ensuring everything works together seamlessly. It's particularly useful for distinguishing between backtesting and live trading, as the frame name will be empty when running in live mode.

## Interface IMemoryInstance

The `IMemoryInstance` interface establishes how different memory storage systems – whether they're simple in-memory stores, persistent databases, or just test dummies – should behave. 

It provides methods to manage and interact with memory data. You can initialize the memory, write new data, search for specific entries using full-text search capabilities, and list all the data currently stored. 

Retrieving and deleting data are also key functions, and finally, when you're done, you can clean up and release any resources used by the memory instance. Essentially, it's a contract that ensures consistent memory management across various backtest-kit implementations.

## Interface IMarkdownTarget

This interface lets you finely control what kinds of reports are generated by the backtest-kit framework. Think of it as a way to turn on or off specific diagnostic tools for your trading strategy.

You can choose to track events like when your strategy generates buy or sell signals, when those signals are blocked by risk limits, or when your stop-loss orders adjust to protect profits. 

It also provides options to analyze portfolio performance, optimize strategies, monitor signals waiting to be triggered, and even see a detailed history of trades. 

Furthermore, it allows you to monitor live trading events and track significant milestones like achieving the highest profit or experiencing the maximum drawdown. Each property corresponds to a different type of report, allowing for highly customized reporting.

## Interface IMarkdownDumpOptions

This interface defines the options you can use when exporting data to Markdown format. It essentially tells the system where to find the information and what specific details to include in the output. You'll find properties like `path`, `file`, `symbol`, `strategyName`, `exchangeName`, `frameName`, and `signalId`. Each of these helps pinpoint the exact data you want to be represented in a Markdown report, letting you focus on the most relevant parts of your trading backtest results. Think of it as giving the system a set of coordinates to locate and extract the information you need.

## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework communicate about what's happening. It's essentially a way to keep a record of events, decisions, and potential issues during the backtesting process.

You can use it to record general happenings, like agents starting or data being stored.

There are specific levels of logging available:

*   `log`: For important events.
*   `debug`: For very detailed information useful when you're investigating problems.
*   `info`: For informational updates about successful actions.
*   `warn`: For situations that might cause trouble later and deserve attention.

This logging system helps you understand how your backtests are running, find and fix errors, and generally get a clearer picture of what’s going on.

## Interface ILogEntry

This interface represents a single entry in your backtest's log history. Each log entry has a unique identifier and a severity level – you'll see "log," "debug," "info," or "warn." 

Each entry also includes timestamps, one generated when the entry was created and one from the backtest itself for enhanced usability. 

Furthermore, you can attach context information like the method used or the overall execution environment to give more details about what happened during the backtest. Finally, extra arguments you provided when creating the log entry are stored as well.

## Interface ILog

The `ILog` interface provides a way to access a history of logging entries within the backtest-kit framework. Think of it as a record of all the events and information that were captured during a trading simulation. 

Specifically, the `getList` method allows you to retrieve all of these logged entries as a list, which is helpful for analyzing what happened during the backtest and debugging any issues. This lets you essentially look back and see exactly what the system was doing at any given point in time.

## Interface IHeatmapRow

This interface defines the data structure for a row in a heatmap visualization, representing the performance of all strategies for a particular trading symbol like BTCUSDT. It provides a comprehensive overview of trading results, including overall profitability (totalPnl), risk-adjusted return (sharpeRatio), and potential losses (maxDrawdown).

You'll find details about the number of trades executed (totalTrades), the proportion of winning trades (winCount, lossCount, winRate), and the average profit/loss per trade (avgPnl). Further insights into trading consistency are revealed by standard deviation (stdDev), average win/loss amounts (avgWin, avgLoss), and the longest winning/losing streaks (maxWinStreak, maxLossStreak). 

The interface also offers advanced metrics such as expectancy and measures of peak and fall PNL to better understand trading performance. Profit factor gives an idea of how much profit you are making compared to the losses.

## Interface IFrameSchema

The `IFrameSchema` defines a specific timeframe for your backtesting strategy. Think of it as setting the boundaries for your historical data analysis. 

Each frame has a unique name to identify it, and you can add a note for yourself to explain its purpose. Crucially, it specifies the interval – like daily, hourly, or weekly – at which your data will be generated. 

You also set the start and end dates, which mark the beginning and end of the historical period you're analyzing. Finally, you can include optional callbacks to trigger actions at different stages of the frame's lifecycle.

## Interface IFrameParams

The `IFramesParams` object holds the settings needed when setting up a connection – think of it as the initial setup instructions. It builds upon a base schema for frame definitions and also includes a logger. This logger is really useful for keeping an eye on what’s happening under the hood, providing valuable debugging information.

## Interface IFrameCallbacks

This function gets called whenever a set of timeframes is created. Think of it as a notification that a new batch of trading periods is ready. You can use this to check if the timeframes look right, log some information about them, or perform other actions based on the start and end dates and the chosen timeframe interval. It receives the array of dates representing the timeframe, the overall start and end dates of the backtest, and the timeframe interval used.


## Interface IFrame

The `IFrames` interface helps manage the different timeframes your backtest uses. Think of it as the system for creating the sequence of moments in time that your trading strategy will be evaluated against.

Specifically, the `getTimeframe` function is the key here. It lets you request a list of specific dates and times for a given asset (like a stock ticker) and a named timeframe (like "daily" or "hourly"). This function is used behind the scenes to create the backbone of your backtest.

## Interface IExecutionContext

The `IExecutionContext` object acts as a shared container of important information while your trading strategies are running. Think of it as a package passed around to provide essential details.

It holds the trading symbol you're working with, such as "BTCUSDT."

It also knows the precise timestamp of the current operation, so your code always knows exactly when things are happening.

Finally, it tells your strategy whether it's running a simulation (backtest mode) or a real-time trade. This is crucial for adjusting behavior depending on the situation.


## Interface IExchangeSchema

This schema describes how backtest-kit interacts with a specific cryptocurrency exchange. It allows you to define where and how candle data (like open, high, low, close prices) is retrieved, and how trade quantities and prices are formatted to match the exchange’s rules. 

You'll specify a unique identifier for the exchange, and can add a note for your own documentation.

The most important part is `getCandles`, which tells backtest-kit how to fetch historical price data. You also have the option of providing functions to correctly format trade quantities and prices, preventing errors due to differing decimal precision. 

Furthermore, you can optionally include functions to retrieve order book information or aggregated trade data. If you don't provide these, backtest-kit will let you know it needs them. Finally, you can register lifecycle callbacks to be notified of events related to candle data.

## Interface IExchangeParams

The `IExchangeParams` interface defines the necessary configuration for connecting to a cryptocurrency exchange within the backtest-kit framework. It outlines the functions and services an exchange implementation must provide.

You'll need to supply a logger to handle debugging output.

The `execution` property provides critical context such as the trading symbol, timestamp, and whether the process is a backtest simulation.

Crucially, several functions are mandatory for interacting with the exchange:

*   `getCandles`: Retrieves historical price data for a given trading pair.
*   `formatQuantity`: Converts raw quantity values to the format expected by the exchange.
*   `formatPrice`: Converts raw price values to the format expected by the exchange.
*   `getOrderBook`:  Fetches the current order book data.
*   `getAggregatedTrades`: Retrieves a history of aggregated trades.

Each of these methods must return a Promise resolving to the appropriate data structure.  Defaults are applied if you don't provide a custom implementation, but custom implementations are generally required.

## Interface IExchangeCallbacks

The `IExchangeCallbacks` interface lets you define functions that your backtest kit system will call when it receives data from an exchange. Specifically, `onCandleData` is triggered whenever the system pulls candle data – those OHLC (Open, High, Low, Close) price charts – from the exchange. You can use this to react to new data arriving, perhaps to log it or perform some custom processing. The function receives details about the symbol being tracked, the time interval of the data (like 1 minute or 1 day), the starting date and time for the data, a limit on the number of candles requested, and of course, the actual candle data itself as an array.

## Interface IExchange

The `IExchange` interface defines how a backtest kit interacts with an exchange. It gives you tools to retrieve historical and future candle data, essential for simulating trades.

You can request candles from the past using `getCandles` or look ahead to future candles with `getNextCandles` (specifically for backtesting scenarios).

The framework also handles the details of trading by letting you format quantities and prices to match the exchange's requirements using `formatQuantity` and `formatPrice`.

Calculating the VWAP (Volume Weighted Average Price) is simple using `getAveragePrice`, which looks at recent trades.

Need to see what orders are currently active? Use `getOrderBook` to get the current order book, or `getAggregatedTrades` to see the recent trades.

Finally, `getRawCandles` provides a flexible way to fetch historical candles, allowing you to specify start and end dates along with a limit. This function is designed to prevent "look-ahead bias" - ensuring that your backtest accurately reflects real-world conditions.

## Interface IEntity

This interface, `IEntity`, serves as the foundation for all data objects that are stored and managed within the backtest-kit framework. Think of it as a common blueprint, ensuring that all persistent entities have a consistent structure. It’s a minimal starting point, designed to be extended by more specific entity types. If you're creating a new type of data to be saved, you'll likely inherit from this interface.

## Interface IDumpInstance

The `IDumpInstance` interface defines how to save data related to backtesting runs. Think of it as a way to record different pieces of information during a test, like conversations, tables of data, or error messages.

Each instance is tied to a specific signal and bucket, meaning it’s responsible for saving data from a particular area of the backtest.

The methods provided offer different ways to store data: you can save full message histories, simple key-value records, tables of data, raw text, errors, or complex JSON objects. Each method takes the data to be saved, a unique ID for the data, and a brief description of what it represents.

Finally, the `dispose` method allows you to clean up and release any resources held by the instance when it’s no longer needed.

## Interface IDumpContext

The `IDumpContext` object helps keep track of where a piece of data came from during a backtest. Think of it as a tag that attaches to each data point, clarifying its origin. 

It contains key information like the `signalId` which identifies the trade it relates to, and a `bucketName` for organizing dumps by strategy or agent.  Each dump also gets a unique `dumpId` for easy reference. 

Finally, a `description` field lets you add a human-friendly explanation of what the data represents, making it easier to understand and find during analysis – it's even used to make data searchable!


## Interface ICommitRowBase

This interface, `ICommitRowBase`, acts as the foundation for events that need to be recorded for later processing, particularly when dealing with situations where immediate execution isn't possible. Think of it as a placeholder for information related to a trading action, like an order or a price update. It holds essential details such as the `symbol` being traded (like "BTC-USDT") and a flag indicating whether the operation is part of a backtesting simulation. This separation allows the system to handle these events reliably even when the environment isn't immediately ready for them.

## Interface ICheckCandlesParams

ICheckCandlesParams defines the information needed to verify the timestamps of your historical candle data. It allows you to specify which trading pair (like BTCUSDT), exchange, and time interval (like 1-minute candles or 4-hour candles) you're checking. You'll also need to provide a date range - a start and end date - to define the period you want to validate. Finally, it tells the system where to find your stored candle data, defaulting to a standard location but allowing you to override it if needed.


## Interface ICandleData

This interface defines a single candlestick, representing a snapshot of price action and volume over a specific time interval. Each candlestick includes the timestamp of when it began, the opening price, the highest and lowest prices reached during that time, the closing price, and the total trading volume. It's a foundational data structure used for things like calculating VWAP (volume-weighted average price) and when running backtests to evaluate trading strategies. Think of it as a single bar on a price chart.

## Interface ICacheCandlesParams

This interface defines the information needed to pre-load historical candlestick data for backtesting. It tells the system which trading symbol and exchange you're interested in, what time interval (like 1-minute or 4-hour candles) you want to download, and the start and end dates for the data you need. Think of it as specifying exactly what historical data you want the system to fetch and store beforehand to speed up your backtest.

## Interface IBroker

The `IBroker` interface defines how the backtest-kit framework connects to a real-world brokerage or exchange. Think of it as the bridge between the simulation and actual trading.

You’ll implement this interface to handle things like connecting to your broker’s API, authenticating, and setting up the necessary connections.

Crucially, these calls happen *before* the framework makes changes to its internal state, ensuring that any errors during communication with the broker won’t corrupt the simulation.

When running backtests, the framework won’t actually use your broker adapter – it’s essentially ignored during that phase.

Here's a breakdown of the actions this interface handles:

*   `waitForInit`: This method is called once at the beginning to perform any initial setup.
*   `onSignalCloseCommit`:  Called when a trade is closed, whether it’s due to a take-profit, stop-loss, or a manual action.
*   `onSignalOpenCommit`: Called to confirm a new trade has been opened.
*   `onPartialProfitCommit`: Used when a portion of a trade is closed for profit.
*   `onPartialLossCommit`:  Used when a portion of a trade is closed at a loss.
*   `onTrailingStopCommit`: Called when a trailing stop order is adjusted.
*   `onTrailingTakeCommit`: Used to update a trailing take-profit order.
*   `onBreakevenCommit`:  Used to set or adjust a breakeven stop loss.
*   `onAverageBuyCommit`:  Called when adding to a position using a dollar-cost averaging strategy.

## Interface IBreakevenData

This data structure holds information about whether a breakeven point has been achieved for a particular trading signal. It's designed to be easily saved and loaded, particularly when using a persistence adapter. Think of it as a simple "yes/no" flag indicating if the breakeven target has been hit, making it straightforward to store as JSON. The `reached` property is a boolean that reflects this key piece of information.

## Interface IBreakevenCommitRow

This represents a single action related to breakeven calculations within the backtest. 

It indicates that a breakeven point has been determined.

The `action` property specifically confirms that this record pertains to a breakeven event.

The `currentPrice` tells you the price level at the time the breakeven was established, giving you context for the calculation.

## Interface IBreakeven

The IBreakeven interface helps manage a strategy's ability to move its stop-loss to the entry price, essentially aiming to protect profits. It keeps track of when this "breakeven" point is achieved – meaning the price has moved enough to cover any transaction costs.

The `check` method is responsible for determining if the breakeven condition has been met. It looks to see if breakeven hasn't already been reached, if the price has moved favorably to account for fees, and if the stop-loss can safely be adjusted to the initial entry price. If it all checks out, the system marks breakeven as achieved, triggers a notification, and saves the state.

Conversely, the `clear` method is used when the strategy's signal closes, whether through a target profit, stop-loss trigger, or time expiry. This clears out the breakeven state from the system's memory and persists that change to disk, ensuring everything is cleaned up properly.

## Interface IBidData

This interface describes a single bid or ask within an order book. Each bid or ask has a price, represented as a string, and a quantity, also represented as a string, indicating how many shares or contracts are available at that particular price. Think of it as one line in the order book showing what buyers are willing to pay and what sellers are willing to accept.

## Interface IAverageBuyCommitRow

This interface represents a single step in a queued average-buy (DCA) strategy. 

It details a specific purchase made as part of the averaging process.

You'll see properties like `currentPrice` which records the price at which the buy occurred, `cost` which shows the USD value of that purchase, and `totalEntries` tracking the cumulative number of buys made so far. 

Essentially, each `IAverageBuyCommitRow` describes a single transaction contributing to your overall DCA strategy and its progress.

## Interface IAggregatedTradeData

This object holds the details of a single trade that happened during a backtest. Think of it as a record of one transaction. It includes the price at which the trade took place, the amount of the asset that was exchanged, the exact time the trade happened, and whether the buyer or seller initiated the transaction as the market maker. Each trade has a unique ID to easily track it.

## Interface IActivateScheduledCommitRow

This interface represents a request to activate a previously scheduled commit. Think of it as a signal that something that was planned to happen is now being triggered. It includes the unique ID of the signal being activated and, optionally, an ID specific to the activation itself if a user is initiating it. This is how the system knows precisely what to activate and potentially who requested the action.

## Interface IActionStrategy

This interface gives your trading actions a way to peek at the current signal status. It's like a read-only window into what the strategy is doing right now.

Specifically, it helps ActionProxy decide whether to run certain actions – like adjusting stop losses or checking for profit targets – by confirming if a signal is actually pending.

There are two key functions:

*   `hasPendingSignal` tells you if there's an open position and an active signal.
*   `hasScheduledSignal` tells you if there's a signal waiting to be triggered in the future.

Essentially, it's a safety net to prevent actions from running prematurely or when they aren't needed.

## Interface IActionSchema

The `IActionSchema` lets you extend your trading strategy with custom logic. Think of it as a way to hook into the strategy's execution and do things like track events, manage state, or send notifications. 

You can register these actions to create reusable event handlers. Each action gets its own unique identifier and an optional note for documentation. 

The core of an action is its handler, which is essentially a piece of code that gets run during each step of the strategy's process. You can also add lifecycle callbacks to control how the action behaves at different points in time. This allows for a flexible way to customize and monitor your strategy's behavior.

## Interface IActionParams

The `IActionParams` interface bundles all the essential information an action needs to function within the backtest-kit framework. Think of it as a package delivered to each action, containing tools and context. 

It includes a `logger` so actions can record information for debugging or monitoring – important for understanding what's happening. 

You'll also find details like the `strategyName` and `frameName`, telling the action which strategy and timeframe it belongs to.  The `exchangeName` identifies the exchange being used.

A `backtest` flag indicates whether the action is running in a historical simulation. 

Finally, the `strategy` property gives the action direct access to real-time signals and position information, enabling it to make informed decisions.

## Interface IActionCallbacks

This interface, `IActionCallbacks`, provides a way to hook into the lifecycle and events of your trading action handlers. Think of it as a set of customizable triggers that let you manage resources and monitor what’s happening within your trading strategies.

You can use these callbacks for things like setting up database connections when an action starts (`onInit`), closing them when it’s finished (`onDispose`), or logging events as they occur.  Each callback is optional, so you only need to implement the ones you need, and they can run either synchronously or asynchronously.

There are specific callbacks for different kinds of signal events.  `onSignal` is a general event that happens in both backtesting and live trading, while `onSignalLive` and `onSignalBacktest` are specific to each mode. You’ll also find callbacks for things like when breakeven is reached (`onBreakevenAvailable`), partial profits or losses are hit (`onPartialProfitAvailable`, `onPartialLossAvailable`), or when ping monitoring runs (`onPingScheduled`, `onPingActive`, `onPingIdle`).  `onRiskRejection` alerts you when a signal is blocked by your risk management rules.

Finally, `onSignalSync` is a unique callback that lets you directly control the framework’s attempts to open or close positions using limit orders. This is powerful, but be careful – errors here aren’t swallowed, so you need to handle them correctly to avoid disrupting your trading.

## Interface IAction

The `IAction` interface is your central hub for connecting your custom logic to the trading framework. Think of it as a set of event listeners that notify you about key moments in the trading process. You can use this to build things like logging systems, real-time dashboards, or even custom action dispatchers for tools like Redux or Zustand.

It provides several methods, each responding to a different type of event.  `signal`, `signalLive`, and `signalBacktest` all deal with signals generated by your strategy—`signal` covers both live and backtest modes while the other two focus on just one.  Beyond just the signals, you can also listen for events related to breakeven points, partial profits or losses, and scheduled or active pings.  There’s also a `riskRejection` event that alerts you when a signal doesn't pass risk validation, and a `signalSync` event that lets you intervene when the framework is attempting to place a limit order.  Finally, `dispose` is crucial for cleanup, ensuring you unsubscribe from everything when your handler is no longer needed, preventing memory leaks.

## Interface HighestProfitStatisticsModel

This model holds information about the events that resulted in the highest profits during a trading backtest. It provides a detailed look at these successful moments, allowing you to analyze what contributed to them.

The `eventList` property contains an ordered list of all the events that resulted in the highest profits, with the most recent events appearing first.  You can examine this list to understand the sequence of trades or conditions that led to these gains. 

The `totalEvents` property simply tells you how many of these high-profit events were recorded during the backtest.

## Interface HighestProfitEvent

This record represents the single most profitable moment observed for a specific trading position. It contains details like the exact time the record was set, the trading pair involved, and the name of the strategy and signal responsible. You'll also find information about whether the position was a long or short trade, along with a breakdown of the total profit, the highest profit point reached, and the maximum drawdown experienced. The record includes the price at which the record was achieved, along with the initial entry price and any associated take profit or stop loss levels. Finally, a flag indicates if this profit event occurred during a backtesting simulation.

## Interface HighestProfitContract

This contract provides information when a trading strategy hits a new peak profit level. It's designed to give you the details surrounding that event, so you can react programmatically. You'll see the trading symbol, the price at that moment, and when it happened. 

The notification also includes the names of the strategy, exchange, and timeframe used, along with the signal that triggered the trade. A key detail is a flag indicating whether this event occurred during a backtest or live trading.

## Interface HeatmapStatisticsModel

This structure organizes key performance statistics for your entire portfolio, giving you a high-level view of how your investments are doing. It presents data for each individual symbol alongside aggregated portfolio-level metrics.

You'll find an array detailing the statistics for each symbol you're tracking. 

The structure also provides a count of the total symbols in your portfolio, the overall profit and loss (PNL), and the Sharpe Ratio, a measure of risk-adjusted return. 

Furthermore, it includes the total number of trades executed and provides averages for peak and fall PNL, weighted by the number of trades—offering insights into the portfolio’s best and worst performance points.

## Interface DoneContract

This interface describes what happens when a background process finishes, whether it's a backtest or a live trade execution. It provides key information about the completed run, like the exchange used, the name of the trading strategy, and whether it was a backtest or live execution. You'll find details about the trading symbol too, so you know exactly which asset was involved. Essentially, it's a notification package confirming a task is done and giving you context about what just happened.


## Interface CriticalErrorNotification

This notification signals a severe problem that demands the trading process be stopped immediately. It's a way for the system to alert you when something goes wrong in a way that requires a complete restart. Each notification has a unique ID and a human-readable message explaining the issue. You'll also find detailed error information including a stack trace, and note that these errors originate from a live context, so the `backtest` flag will always be false.

## Interface ColumnModel

This section describes how to set up the columns that will appear in a table generated by the backtest-kit framework. Think of it as defining the structure and appearance of your data presentation. Each column needs a unique identifier, a label that users will see as the header, and a formatting function to ensure the data within that column is displayed correctly.  You also have the option to control whether a column is visible based on certain conditions, allowing for dynamic table adjustments. This flexible design allows you to customize the tables to effectively showcase the different aspects of your trading analysis.

## Interface ClosePendingCommitNotification

This notification appears when a pending trade signal is closed before it fully activates, essentially canceling it. It provides a detailed breakdown of why the signal was closed and its financial impact. You'll find information like a unique ID for the notification, the exact time it was closed, and whether it occurred during a backtest or live trading.

The notification includes key details about the trade, such as the trading pair, the strategy that generated it, and the exchange where it was intended to be executed. It also gives a comprehensive financial summary, including total profit/loss, peak profit and drawdown information, and detailed pricing data. You’ll see how much capital was invested, what the entry and exit prices were, and even the prices at which peak profit and maximum drawdown were achieved. A user-provided note might also explain the reasoning behind the closure. Finally, a creation timestamp is provided for tracking purposes.

## Interface ClosePendingCommit

This event signals the closure of a previously opened position. 

It provides details about the closure, including a unique identifier you can optionally assign to explain why the position was closed. 

You'll also find comprehensive performance data associated with the closed position, such as its total profit and loss (PNL), the highest profit it reached, and the largest drawdown it experienced. This information gives you a complete picture of the position's lifecycle.

## Interface CancelScheduledCommitNotification

This notification signals that a previously scheduled trading signal has been canceled before it was activated. It provides a wealth of information about the signal and its potential execution, including a unique identifier, timestamps, and whether it occurred during a backtest or live trading. You'll find details about the trading pair, the strategy that generated the signal, and specific identifiers for both the signal and the cancellation itself.

The notification also provides a comprehensive snapshot of the potential position's financial performance, including P&L, peak profit, maximum drawdown, and related pricing data. It even details how many DCA entries and partial closes would have been executed, offering insights into the signal's intended trading strategy. Furthermore, an optional note field is included for a human-readable explanation of why the signal was canceled. Finally, the notification provides a creation timestamp to track the lifecycle of the cancellation event.

## Interface CancelScheduledCommit

This interface defines how to cancel a previously scheduled signal event within the backtest-kit framework. When you need to stop a pending signal, you'll use this structure to communicate that cancellation.  You can optionally provide a `cancelId` to help identify why the cancellation happened. The interface also includes information about the position's performance, specifically the total profit and loss (`pnl`), the highest profit reached (`peakProfit`), and the largest drawdown experienced (`maxDrawdown`) – providing context for the cancellation.


## Interface BreakevenStatisticsModel

This model holds information about your breakeven events, which are key moments when a trade reaches a point where it neither gains nor loses money.

It gives you a detailed breakdown of these events.

You'll find a list of all the individual breakeven events, each with its own specific data, along with the total count of breakeven events that occurred. This helps you understand how often your trades are hitting that crucial breakeven point.

## Interface BreakevenEvent

The BreakevenEvent holds all the important details when a trading signal reaches its breakeven point. Think of it as a snapshot of what happened during the trade. It includes things like the exact time, the trading pair involved, the name of the strategy used, and a unique identifier for the signal itself.

You'll also find information about whether it was a long or short position, the current price at breakeven, and the original entry, take profit, and stop-loss prices. It even keeps track of how many times the position was bought in stages (if using a DCA strategy) and any partial exits that occurred. 

Furthermore, it captures the unrealized profit/loss at that moment, a helpful note explaining the reasoning behind the signal, and timestamps indicating when the position became active and when the signal was initially created. Finally, it flags whether the event occurred during a backtest or a live trading session.

## Interface BreakevenContract

The `BreakevenContract` represents when a signal's stop-loss is moved back to the entry price, signifying a risk reduction milestone. This event is important for keeping track of a strategy’s safety and how much risk is being managed. It only happens once for each signal, ensuring accuracy.

Think of it as a notification when a trade has become profitable enough to cover its initial costs.

Here's what the data in a `BreakevenContract` tells you:

*   **symbol:** The trading pair involved, like BTCUSDT.
*   **strategyName:** The name of the trading strategy that generated the signal.
*   **exchangeName:** The exchange where the trade is happening.
*   **frameName:** The timeframe used for the signal (not applicable in live trading).
*   **data:**  All the original details of the signal, including its entry price and stop-loss levels.
*   **currentPrice:** The price at which breakeven was reached.
*   **backtest:**  Indicates whether this event occurred during a backtest or live trading.
*   **timestamp:** The exact time the breakeven event occurred, which could be a live tick or a historical candle close.

This information can be used to build reports or to trigger custom actions when a breakeven event occurs.

## Interface BreakevenCommitNotification

This notification signals that a breakeven point has been reached and a commitment action has been taken on a trade. It provides a wealth of information about the trade, including a unique identifier, when it happened (timestamp), and whether it occurred during a backtest or live trading. You'll find details about the trading pair, the strategy used, and the exchange involved.

The notification also breaks down the specifics of the trade itself, such as the entry and take profit/stop-loss prices, and details about any dollar-cost averaging (DCA) or partial closes that occurred.  You can see the position's total profit and loss (both in USD and as a percentage), along with peak profit and maximum drawdown metrics, including the prices and timestamps associated with those events.

Finally, it includes timestamps to track when the signal was created and when the position started, along with an optional description explaining the reason for the signal. Essentially, it's a comprehensive record of a breakeven commitment event, allowing you to understand and analyze the performance of your trading strategies.

## Interface BreakevenCommit

This event signifies when a trading position reaches a breakeven point, meaning the potential losses have been recovered. It provides a snapshot of the position's performance at that moment, including the current market price.

You’ll find details like the total profit and loss (pnl) realized up to this point, the highest profit achieved (peakProfit), and the largest drawdown experienced.

The event also gives you the position's direction (long or short), the original entry price, and the target take profit and stop-loss prices – both the initially set values and the prices after any trailing adjustments.

Finally, it includes timestamps indicating when the signal was created and when the position was originally activated, offering a timeline of the trade’s lifecycle.

## Interface BreakevenAvailableNotification

This notification signals that your trading position has reached a point where its stop-loss can be moved to the entry price, essentially breaking even. It provides a wealth of details about the trade, including a unique identifier, the exact timestamp of this event, and whether it occurred during a backtest or live trading.

You'll find specifics about the trading pair (like BTCUSDT), the strategy used, the exchange involved, and the signal's unique ID. The notification also gives you current price data, the original entry price, the position direction (long or short), and details about take profit and stop-loss levels, both as initially set and after any trailing adjustments.

Beyond the core trade data, it offers a comprehensive P&L breakdown, including peak profit and maximum drawdown figures, all expressed in both absolute and percentage terms.  You can see how much you've invested, the prices used for P&L calculations, and even track information related to DCA (Dollar-Cost Averaging) if applicable, as well as partial closes. A note field allows for a custom description of the signal's reason, and timestamps cover when the signal was created, pending, and ultimately generated this notification.

## Interface BacktestStatisticsModel

The BacktestStatisticsModel provides a detailed breakdown of your trading strategy's performance after a backtest. It collects data from every closed trade, allowing you to assess how well your strategy is doing.

You'll find the total number of trades executed, and a clear count of winning and losing trades. Key performance indicators like win rate, average profit per trade, and total profit are included, all expressed as percentages.

It also offers more advanced metrics like standard deviation and the Sharpe Ratio, which help you understand the risk involved in your strategy. The annualized Sharpe Ratio takes this further by projecting the return over a full year.

Finally, it highlights insights like the average peak and fall profit during trades, offering a look at the potential high points and low points your strategy experiences. Note that many values might be null if the calculations are unreliable due to unusual market conditions.

## Interface AverageBuyCommitNotification

This notification provides detailed information whenever a new averaging (DCA) purchase is made within an open trading position. It’s like a snapshot of the position's state after each additional DCA step.

Each notification includes a unique ID, the exact time the purchase happened, and whether it’s from a backtest or live trading environment. You’ll find key details like the trading pair (e.g., BTCUSDT), the strategy responsible, and the price at which the new purchase was executed.

The notification also tracks crucial metrics, including the cumulative cost of all DCA purchases, the effective average price, and the total number of entries made so far.  You get a complete view of the position's profitability with metrics like total profit/loss, peak profit, and maximum drawdown, all expressed in both absolute USD values and percentages.

Furthermore, the notification provides insights into the position's lifecycle, revealing the original entry price, current stop-loss and take-profit levels, and timestamps for various stages, from the initial signal creation to when the position became active. A human-readable note can also explain the rationale behind the signal.

## Interface AverageBuyCommit

This event signifies a new average-buy (or DCA) action has been taken within a trading position.

It's triggered when the framework adds another buy (or sell) order to incrementally build out a position.

The event provides detailed information about the averaging action, including the current price at which the buy occurred and the total cost of that specific buy. 

You'll also find the updated, effective average entry price for the entire position, along with key performance metrics like unrealized profit and loss (PNL), peak profit, and maximum drawdown. 

The original entry price, as well as any adjusted take profit and stop loss prices, are included. Finally, timestamps mark when the signal was created and when the position was activated.

## Interface ActivePingContract

This describes a system for tracking active pending signals during trading. Think of it as a heartbeat signal letting you know a pending order is still open and being monitored. 

It sends out regular updates, every minute, whenever a pending signal is active – that means it hasn’t been closed yet. Each update contains details about the trading pair (symbol), the strategy being used, the exchange, and the full data associated with the signal itself. 

You also get the current market price at the time of the update and whether the update comes from a backtest (historical data) or a live trading environment. These updates enable you to create custom logic to manage those pending signals based on conditions like price movements – perhaps to automatically close a signal if the price changes significantly. You can subscribe to these updates to listen for them, either continuously or just once.

## Interface ActivateScheduledCommitNotification

This notification signals that a scheduled trading signal has been activated, letting you know a trade is about to happen or has already started. It provides a wealth of information about the trade, including a unique ID, the exact time it was triggered, and whether it’s a backtest or live trade. You'll see details like the trading pair (e.g., BTCUSDT), the strategy that initiated the signal, and the exchange it's running on.

The notification includes comprehensive pricing data, like the entry price, take profit, and stop-loss levels, along with their original values before any adjustments. You’ll also find details about how the position was built—whether it's a long (buy) or short (sell) trade, how many entries were involved (especially if it’s a DCA strategy), and any partial closes that have occurred.

Crucially, it includes profitability metrics such as total profit and loss (both absolute and percentage), peak profit, and maximum drawdown, along with prices and costs associated with those. Finally, the notification tells you when the signal was originally scheduled, when it started pending, the current market price, and any custom notes attached to the signal.

## Interface ActivateScheduledCommit

This object represents the details when a previously scheduled trading signal is activated. It includes information about the trade itself, like whether it's a long or short position, and the entry and exit prices (both original and adjusted). You'll find key performance metrics too, like the position’s profit and loss (both total and peak), as well as its maximum drawdown. The `activateId` allows you to add your own notes or tracking information when you trigger the activation. Finally, the `scheduledAt` and `pendingAt` fields record when the signal was initially created and when it became active.
