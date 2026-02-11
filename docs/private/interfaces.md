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

This interface defines the structure of messages sent when a walker needs to be stopped. It's used to signal that a particular trading strategy, running under a specific walker, should be halted. 

Think of it as a notification system – when something needs to pause a trading process, this message details exactly which process to pause.

The message includes the trading symbol involved (like BTCUSDT), the name of the strategy being used, and the name of the walker that’s executing the strategy. This last bit is important because you might have several walkers running different strategies on the same symbol at once, and this lets you target the correct one.


## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps organize and display the results of backtesting different trading strategies. 

It’s essentially a way to combine overall walker results with information about how each strategy performed individually.

Think of it as a report card – it lists all the strategies you tested and provides details about their performance, allowing for easy comparison. 

The core of this report card is the `strategyResults` property, which contains an array of individual results, one for each strategy you ran.

## Interface WalkerContract

The WalkerContract represents the progress updates you'll receive as backtest-kit runs comparisons between different trading strategies. Think of it as a report card showing how each strategy is performing.

Each time a strategy finishes its backtest and its ranking is determined, this contract is emitted, providing you with details like the strategy's name, the exchange and symbol it was tested on, and key statistics from that backtest.

You'll also get information about the metric being optimized (like Sharpe Ratio or Profit Factor), the current best metric value found so far, and which strategy currently holds that top spot.

Finally, the contract keeps track of how many strategies have been tested and how many are left, giving you a sense of how much longer the comparison will take. Essentially, it's a window into the strategy comparison process, keeping you informed on which strategies are performing well and the overall progress of the tests.

## Interface WalkerCompleteContract

This object represents the culmination of a backtesting run, signaling that all strategies have been evaluated and the final results are ready. It bundles together a wealth of information about the backtest, including the name of the backtesting system (the "walker"), the financial instrument being tested (the symbol), and the exchange and timeframe used.

You’ll find details about the optimization metric – the measure used to judge strategy performance – alongside the total number of strategies that were tested. Crucially, it identifies the top-performing strategy and its corresponding metric score.

Finally, it includes comprehensive statistics for that winning strategy, providing a detailed look at its performance during the backtest. Essentially, it’s a complete report card for the entire backtesting process.


## Interface ValidationErrorNotification

This notification signals that a validation error occurred during the trading process. It's triggered when the risk validation functions encounter a problem and raise an error.

Each notification contains a unique identifier (`id`) to help track it. 

You'll also find a detailed error object (`error`) which includes information about what went wrong and a stack trace. A more user-friendly explanation of the error is provided in the `message` field.

Finally, the `backtest` flag is always false for these notifications, indicating the error originated from a live trading context, not a simulated backtest.


## Interface ValidateArgs

This interface, `ValidateArgs`, helps ensure the names you're using for different parts of your backtesting setup are correct. Think of it as a checklist to prevent typos or misconfigurations.

It has properties like `ExchangeName`, `FrameName`, `StrategyName`, `RiskName`, `ActionName`, `SizingName`, and `WalkerName`.  Each of these represents a specific component in your trading system—like the exchange you’re trading on, the timeframe you’re using, or the strategy being employed.

For each property, you provide an enum object. The validation process will then check if the values you’re using actually exist within those enums. This helps catch errors early on, making sure everything is working as expected.

## Interface TrailingTakeCommitNotification

This notification lets you know when a trailing take profit order has been executed. It provides a wealth of information about the trade that just happened, including a unique identifier and timestamp.

You'll find details like the trading symbol, the strategy that initiated the trade, and whether it's a backtest or live execution. The notification also includes the original and adjusted take profit and stop-loss prices, along with the entry price. 

It also records when the signal was created, when the position went pending, and other timestamps for a complete picture of the trade's lifecycle. Essentially, this notification gives you a detailed record of a trailing take profit being triggered.

## Interface TrailingTakeCommit

This describes a "trailing take" event, which happens when your take profit price is adjusted automatically as the market moves in your favor. 

Here's what the information within this event tells you:

*   It clearly identifies the event type as a "trailing-take."
*   `percentShift` shows you how much the take profit price has been shifted as a percentage.
*   `currentPrice` indicates the price of the asset at the time the trailing adjustment occurred.
*   `position` confirms whether you're in a long (buy) or short (sell) trade.
*   You'll find the original entry price (`priceOpen`), the new take profit price (`priceTakeProfit`), and the existing stop-loss price (`priceStopLoss`), which might have changed due to the trailing.
*   `originalPriceTakeProfit` and `originalPriceStopLoss` show the initial values of these prices *before* any trailing adjustments.
*   `scheduledAt` gives you the timestamp when this trailing adjustment was initially planned, and `pendingAt` notes when the position was actually activated.

## Interface TrailingStopCommitNotification

This notification is fired whenever a trailing stop order is triggered. It provides a comprehensive snapshot of the circumstances surrounding the trailing stop's execution.

The notification includes a unique identifier, the timestamp of the event, and whether it occurred during a backtest or live trading.  You'll find details about the trading pair involved, the strategy that generated the signal, and the exchange used.

It also gives you the specifics of the trade, like the position direction (long or short), the entry price, and the adjusted take profit and stop loss prices – alongside the original prices before any trailing adjustments were applied.  Finally, you get timestamps for when the signal was initially created, when it went pending, and when this specific notification was generated.

## Interface TrailingStopCommit

This describes an event related to a trailing stop order being triggered. Think of a trailing stop as a way to automatically adjust your stop-loss price as the price of an asset moves in your favor.

This event, specifically, tells you that a trailing stop adjustment has occurred. It includes details like the percentage shift used to calculate the new stop-loss price, the current market price at the time of the adjustment, and whether the position is long (you bought) or short (you sold).

You’ll also find the original entry price, the current take-profit and stop-loss prices, and their original values before any trailing adjustments. Finally, timestamps are provided to indicate when the signal was generated and when the position was activated. This information helps you understand exactly how and when your trailing stop order was adjusted.

## Interface TickEvent

This data structure, `TickEvent`, provides a standardized way to represent all the key details about any action taken within the trading framework. Think of it as a single source of truth for understanding what happened – whether a trade was opened, closed, canceled, or simply sitting in a waiting state.

Each `TickEvent` has a timestamp marking precisely when the event occurred, and an `action` field clearly identifying the type of event. For trades, you'll find details like the `symbol` being traded, the `signalId` that triggered the action, and the `position` type (like long or short).

You can also access price information like the `currentPrice`, `open price`, `take profit`, and `stop loss` levels, along with their original values before any adjustments. If a trade is active, it'll include progress metrics like `percentTp` and `percentSl`. Closed trades have details like `duration` and `closeReason`, while canceled trades have a `cancelReason`. Finally, for scheduled events, the `scheduledAt` provides the timestamp of the original signal.

## Interface StrategyStatisticsModel

This model holds a collection of statistics gathered during a trading strategy's execution. It essentially gives you a breakdown of different types of events that occurred.

You'll find a detailed list of every event that happened, along with the total number of events recorded.

The model also breaks down specific event types like cancellations, pending closes, partial profit/loss adjustments, trailing stop actions, and breakeven triggers. Each of these has a dedicated count.

## Interface StrategyEvent

This data structure, called `StrategyEvent`, bundles together all the important information about actions your trading strategy takes. Think of it as a detailed record of what happened during a trade.

It includes things like the exact time of the action, the trading pair involved (like BTC/USDT), the name of your strategy, and even the exchange being used.

You'll find details about the signal that triggered the action, the price at the time, and any percentages used for profit-taking or loss-limiting. 

For scheduled or pending actions, you'll also get unique IDs for tracking those steps.

Crucially, it tells you whether the action happened during a backtest (historical simulation) or a live trade, the direction of the trade (long or short), and key price points like entry price, take profit, and stop-loss, including their original values before any trailing adjustments. Finally, there are timestamps to track when the signal was first created and when the position became pending.

## Interface SignalScheduledNotification

This notification type tells you when a signal has been set to execute at a specific time in the future. It's triggered when a signal isn't acted on immediately but is planned for later.

Each notification includes a unique identifier, a timestamp indicating when the signal was scheduled, and information about whether the signal originates from a backtest or live environment.

You’ll also find details about the trading pair involved (symbol), the strategy that generated the signal, and the exchange where the trade will happen.  

The notification further breaks down the trade specifics - direction (long or short), entry price, take profit and stop-loss levels, original values of these levels (before any trailing adjustments), the exact scheduling time, the current market price at the time of scheduling, and the creation timestamp. This provides a complete picture of the scheduled trading activity.

## Interface SignalOpenedNotification

This notification tells you when a new trade has started. It's triggered whenever a trading position is opened, whether it's during a backtest or a live trading session.

Each notification includes a unique identifier and a timestamp marking when the trade began. You'll also find details like the trading pair (e.g., BTCUSDT), the strategy that initiated the trade, and the exchange used.

Crucially, it provides information about the trade itself, like whether it’s a long (buy) or short (sell) position, the entry price, and the take profit and stop loss levels.  It also includes the original take profit and stop loss prices before any adjustments.

Finally, there's an optional note field for a description of why the signal was generated, plus timestamps for when the signal was created and when it became active.

## Interface SignalData$1

This data structure holds all the key details about a completed trade signal, useful for analyzing performance. Each signal’s information, like which strategy created it and a unique ID, is included. You'll find the symbol being traded, whether it was a long or short position, and the percentage profit or loss (PNL) generated. The reason for closing the trade is also recorded, along with the exact times the signal was opened and closed, giving a complete picture of its lifecycle. It's designed to be easily used when building reports or analyzing backtest results.

## Interface SignalCommitBase

This defines the core information you'll find in every signal event within the backtest-kit framework. Think of it as the foundational data point for tracking what happened during a trade.

Each signal commit will include details like the trading pair (e.g., BTCUSDT), the name of the strategy that generated it, and the exchange where the trade took place. It also indicates the timeframe used – relevant during backtesting, but blank during live trading.

You’ll also get confirmation whether the signal originated from a backtest or a live execution, a unique ID for the signal, and the exact timestamp of when the action occurred. These properties provide a consistent structure for understanding and analyzing signal generation.


## Interface SignalClosedNotification

This notification lets you know when a trading position, initiated by a strategy, has been closed. It's a key piece of information for understanding how your strategies are performing, whether you're running them in a simulated environment (backtest) or in live trading. 

The notification includes detailed information about the trade:

*   A unique identifier for the notification itself.
*   The time the position was closed.
*   Whether the trade happened in a backtest or live environment.
*   The trading pair, strategy, and exchange involved.
*   The initial entry price, the closing price, and the take profit and stop loss prices that were set.
*   The profit/loss percentage of the trade.
*   The reason for closing – whether it was due to hitting a take profit, a stop loss, or some other reason.
*   How long the position was open.
*   An optional, descriptive note to explain the trade further.
*   Timestamps marking when the signal was created and became pending.



Essentially, this notification provides a comprehensive snapshot of a closed trade, enabling you to analyze and optimize your trading strategies.

## Interface SignalCancelledNotification

This notification tells you when a signal that was planned to be executed was cancelled before it actually happened. It's a way to understand why a trade didn't go through as expected.

The notification includes details like a unique identifier, the timestamp of the cancellation, and whether the cancellation occurred during a backtest or live trading. You'll also find information about the trading pair involved, the strategy that created the signal, and the exchange where it was scheduled.

It specifies the intended trade direction (long or short), along with the planned take profit and stop-loss prices, and their original values before any adjustments. A crucial detail is the `cancelReason`, which explains *why* the signal was cancelled – perhaps it timed out, was rejected based on price conditions, or was manually cancelled by a user. If a user cancelled it, you'll see a `cancelId`.

Finally, the notification also tracks the signal's lifecycle, including when it was originally scheduled and when it entered a pending state. All of this helps you investigate and troubleshoot unexpected behavior in your automated trading system.

## Interface ScheduledEvent

This interface holds all the details about events related to trading signals – whether they were scheduled, opened, or cancelled. Think of it as a central place to find information for creating reports and understanding what happened with your signals.

Each event recorded here includes a timestamp (when it occurred), the type of action (opened, scheduled, or cancelled), and the symbol being traded. You'll also find information like the signal ID, the type of position (long or short), and any notes associated with the signal.

Crucially, it contains price information like the current market price, the intended entry price, take profit levels, and stop loss levels. It also tracks any modifications to the take profit or stop loss and provides details on partial executions.

For cancelled events, it provides the reason for the cancellation (timeout, price rejection, or user action), along with a unique cancellation ID if applicable.  Opened events have a timestamp indicating when the position became active. Finally, scheduled events have a timestamp of when the initial signal was created. This unified structure makes it much easier to analyze signal performance and understand the sequence of events.

## Interface ScheduleStatisticsModel

This model holds key statistics about signals scheduled within your backtest. It gives you a clear picture of how your signals are performing over time.

You can see a detailed list of every scheduled signal, including its full information, through the `eventList` property.

It also tracks the total count of all events, just the signals that were scheduled, the ones that became active, and the ones that were cancelled. 

The `cancellationRate` shows you the percentage of scheduled signals that were cancelled – a lower rate generally indicates better signal quality. Similarly, `activationRate` reveals the percentage of scheduled signals that successfully activated. 

Finally, it calculates the average waiting times – both for cancelled signals (`avgWaitTime`) and activated signals (`avgActivationTime`) – to help you identify any delays in your process.

## Interface SchedulePingContract

This describes a special event, a "schedule ping," that happens regularly while a trading strategy is actively monitoring a signal. Think of it as a heartbeat confirming that everything's still running smoothly for a particular trading setup.

Each ping contains important details like the trading pair (e.g., BTCUSDT), the name of the strategy in use, and the exchange being monitored.  It also includes all the original information about the signal itself - everything from its ID to its price targets.

There's a flag to tell you if the event came from a backtest (using historical data) or live trading.  The timestamp indicates exactly when the ping occurred – either the time of the ping itself during live trading, or the timestamp of the candle being processed during backtesting.

You can set up your code to respond to these ping events, allowing you to monitor the status of your strategies and even implement custom logic to handle situations like cancellation. It helps you keep a close eye on your automated trading.

## Interface RiskStatisticsModel

This model holds information about risk rejections, helping you understand how your risk management system is performing. It contains a list of all the individual risk events that occurred, giving you detailed insight into each one. You can also see the total number of rejections, and how they're distributed – broken down by the trading symbol involved, and by the specific trading strategy that triggered the rejection. This lets you pinpoint areas where your risk controls might need adjustment or further investigation.

## Interface RiskRejectionNotification

This notification lets you know when a trading signal was blocked because of your risk management rules. It's a way for the system to tell you exactly why a signal didn't get executed.

The notification includes key details like a unique ID, the time it happened, and whether it occurred during a backtest or live trading.  You’ll find the symbol being traded, the name of the strategy that generated the signal, and the exchange involved.

Crucially, it explains *why* the signal was rejected – a human-readable note is provided.  You'll also find information about your current positions, the market price at the time, and details of the proposed trade itself, including entry price, take profit, and stop-loss levels.  There’s even a description of the signal's reasoning if it was available. Finally, the creation timestamp allows you to track when the rejection event was logged.

## Interface RiskEvent

This data structure holds information when a trading signal is blocked due to risk management rules. It's essentially a record of why a signal didn’t make it into a trade.

Each `RiskEvent` tells you when the rejection happened (`timestamp`), which asset was involved (`symbol`), the details of the signal that was rejected (`currentSignal`), and which strategy and exchange were responsible. You'll also find the timeframe used, the current price at the time of rejection, how many positions were already open, and a unique ID for tracking the specific rejection.

A note explains the reason for the rejection (`rejectionNote`), and indicates if the event occurred during backtesting or live trading (`backtest`). This data helps understand and fine-tune risk controls.


## Interface RiskContract

The RiskContract is a notification you receive when a trading signal is blocked because it violates risk management rules. It's designed to help you understand and monitor situations where your trading strategies are being held back by safety limits.

Think of it as an alert that something your strategy wanted to do wasn't allowed due to a risk check.

Here’s what information you get with each notification:

*   **symbol:** Which trading pair (like BTCUSDT) was affected.
*   **currentSignal:** All the details of the signal that was rejected – the planned position size, prices, etc.
*   **strategyName:**  Which strategy tried to execute the trade.
*   **frameName:**  What timeframe was used for the backtest (if applicable).
*   **exchangeName:** The exchange associated with the trade.
*   **currentPrice:** The price of the asset at the time the rejection occurred.
*   **activePositionCount:** How many other positions your system already has open.
*   **rejectionId:** A unique ID to help track down the specific rejection.
*   **rejectionNote:** A description explaining *why* the signal was blocked.
*   **timestamp:** When the rejection happened.
*   **backtest:** Whether this rejection occurred during a simulated backtest or in live trading.

These notifications are useful for services that create reports about risk management, or for directly notifying users about these events. You won’t receive these notifications for signals that are allowed—only when rules are broken.

## Interface ProgressWalkerContract

This interface provides updates on the progress of a background process within the backtest-kit framework. It’s used to monitor how a walker – which handles tasks like evaluating trading strategies – is doing. You'll receive events containing details like the walker's name, the exchange being used, and the specific frame being processed. 

The updates include the total number of strategies the walker needs to handle, how many have been processed so far, and a percentage indicating overall completion. This allows you to track the execution and get a sense of how long it will take for the walker to finish.

## Interface ProgressBacktestContract

This describes the information you receive as a backtest runs in the background. It gives you details about which exchange and strategy are being tested, and what symbol is being traded. You'll also see the total number of historical data points (frames) the backtest will use, how many it has already processed, and the overall percentage of completion. This lets you monitor the backtest's progress and estimate how much longer it will take to finish.


## Interface PerformanceStatisticsModel

This model holds the results of a backtest, giving you a consolidated view of how your trading strategy performed. It includes the name of the strategy being evaluated, the total number of events that occurred during the backtest, and the overall time it took to run the analysis. You'll also find a breakdown of performance statistics, organized by different metrics being tracked. Finally, it contains the raw data for each performance event, allowing for a detailed inspection of individual performance points.

## Interface PerformanceContract

This interface helps you keep tabs on how your trading strategies are performing. It records events during the backtesting or live trading process, letting you pinpoint areas that might be slow or inefficient. Each event includes a timestamp, a reference to the previous timestamp (if applicable), and a description of what's being measured. 

You'll find details about the specific strategy, exchange, and trading symbol involved, along with whether the measurement is happening in backtest or live mode. It allows you to analyze and optimize your trading system's speed and responsiveness.

Here's a breakdown of what's captured:

*   **timestamp:** When the measurement occurred.
*   **previousTimestamp:** When the last measurement occurred.
*   **metricType:** What kind of operation was being measured (e.g., order placement, data retrieval).
*   **duration:** How long the operation took.
*   **strategyName:** The name of the strategy being used.
*   **exchangeName:** The exchange the trade happened on.
*   **frameName:** The name of the timeframe being used (blank during live trading).
*   **symbol:** The trading symbol for the asset being traded.
*   **backtest:** True if the measurement occurred during a backtest, false for live trading.

## Interface PartialStatisticsModel

This model holds information about partial profit and loss events during a backtest. It essentially tracks how often your trades resulted in a profit versus a loss. 

You'll find a complete list of those events, including all their details, stored in the `eventList` property.  The `totalEvents` property gives you the overall count of all profit and loss events that occurred.  `totalProfit` tells you precisely how many of those events resulted in a profit, while `totalLoss` shows you the number of loss events. This information is key to understanding the performance of your trading strategy during a partial backtest.

## Interface PartialProfitContract

This describes events that happen when a trading strategy reaches certain profit milestones, like 10%, 20%, and so on. These events are useful for tracking how well your strategy is performing and for automatically taking some profits along the way. 

Each event includes details like the trading symbol, the strategy's name, the exchange being used, and the price at which the profit level was hit. You’ll also find the original signal data, which includes the initial stop-loss and take-profit prices.

The `level` property tells you exactly which profit percentage was reached, and a `backtest` flag indicates whether the event occurred during a historical simulation or live trading.  Finally, a timestamp provides a record of when this profit event occurred, aligned with either a live tick or a historical candle.

These events are designed to be used by services that generate reports and by your own custom callbacks to react to profit milestones. It's important to note that a single signal can trigger multiple profit events quickly if the price moves significantly.

## Interface PartialProfitCommitNotification

This notification lets you know when a partial profit taking action has occurred. It provides detailed information about the trade, including a unique identifier, the exact time it happened, and whether it occurred during a backtest or live trading. You'll see details like the trading symbol, the strategy that triggered the action, and the exchange involved.

The notification also includes specifics about the signal itself, like its ID, the percentage of the position closed, and the current market price at the time of execution. Furthermore, you can access entry prices, take profit and stop loss levels (both original and adjusted), and timestamps related to the signal's lifecycle, like when it was created and when the position went pending. This comprehensive data helps you understand the context of the partial profit action.


## Interface PartialProfitCommit

This describes an event where a portion of your trading position is closed for profit. It's used when your strategy takes a partial profit, rather than closing the entire position at once. 

The `action` property simply confirms this is a partial profit event. 

`percentToClose` tells you what percentage of the total position was closed. You'll also find key price information like `currentPrice` (the price when this action happened), `priceOpen` (the original entry price), `priceTakeProfit` and `priceStopLoss` (which might have changed if trailing was used), and their original values before any adjustments. 

Finally, `scheduledAt` and `pendingAt` provide timestamps to track when the signal was created and the position was activated, respectively, which is helpful for debugging and performance analysis.

## Interface PartialProfitAvailableNotification

This notification alerts you when a trading signal reaches a predefined profit level milestone, like 10%, 20%, or 30%. Each notification has a unique ID and timestamp indicating when this milestone was achieved. You'll see whether the notification originates from a backtest or a live trading environment, alongside details about the specific trading pair (symbol), the strategy that generated the signal, and the exchange used.

The notification breaks down the trade itself, giving you the signal's ID, the profit level reached, the current market price at the time, and the initial entry price. It also provides key price points for the trade, including the take profit and stop loss prices, both the adjusted (if trailing is used) and original values.  Finally, it includes timestamps for when the signal was initially created, when the position went pending, and when the notification itself was generated, giving you a complete timeline of events.

## Interface PartialLossContract

This describes a `PartialLossContract` – a way of reporting when a trading strategy hits certain loss milestones. Think of it as a notification when a strategy's losses reach -10%, -20%, or even -50% of its initial investment.

It's used to track how a strategy is performing, especially when it’s experiencing losses, and is designed to only report these milestones once for each signal. You’ll see details like the trading pair (e.g., BTCUSDT), the strategy's name, the exchange it’s using, and the current price when the loss level was triggered.

The report includes comprehensive signal data, and the `level` property tells you exactly how much the strategy has lost (e.g., `level: 20` means a -20% loss). A flag indicates whether the event happened during a backtest (using historical data) or live trading. Finally, a timestamp records exactly when the loss level was detected, which is different depending on whether it was a backtest or live tick.

## Interface PartialLossCommitNotification

This notification is sent when a partial loss action is executed, indicating a portion of a position has been closed. It provides detailed information about the trade, including a unique identifier, the timestamp of the action, and whether it occurred during a backtest or live trading. You'll find specifics about the trading pair, the strategy that generated the signal, and the exchange where the trade took place.

The notification includes details about the signal itself, like its ID and creation time, as well as key price points like the entry price, take profit, and stop loss – both the original values and those after any trailing adjustments. Finally, it specifies the trade direction (long or short) and the percentage of the position that was closed, along with the current market price at the time of execution.

## Interface PartialLossCommit

This interface represents a partial loss event within the backtest kit. It details a situation where a portion of a trading position is being closed due to a loss. 

You’ll find information here about the percentage of the position being closed, the current market price at the time of this action, and the trade direction—whether it was a long (buy) or short (sell) position. 

It also includes key pricing details such as the original entry price, the calculated take profit and stop loss prices (both as they were initially set, and as they may have been adjusted later), and timestamps marking when the signal was created and the position was activated. This data helps understand the specifics of how and why a partial loss was implemented.

## Interface PartialLossAvailableNotification

This notification tells you when a trading strategy has reached a predefined loss level, like a 10% or 20% loss. It’s a signal that something might be happening with your strategy's performance.

Each notification has a unique identifier and a timestamp indicating precisely when the loss level was hit.  You’ll also find details about the trade itself, including the trading pair (like BTCUSDT), the strategy used, the exchange where the trade occurred, and the direction of the trade (long or short).

It provides key information about the trade's parameters like the entry price, take profit price, stop loss price, and even the original prices before any adjustments.  There's also information regarding the signal creation and pending times.  Importantly, it indicates whether the notification is coming from a backtest or a live trading environment.

## Interface PartialEvent

This object holds details about profit and loss milestones during trading. It’s designed to give you a complete picture of when and why profits or losses occurred.

Each `PartialEvent` includes information like the exact time of the event, whether it was a profit or loss, the trading symbol involved, and the name of the strategy that triggered it. You'll also find the signal ID, the type of position held, and the current market price. 

Crucially, it contains the profit/loss level achieved (like 10%, 20%, etc.), along with the original entry price and the take profit/stop loss prices set when the trade began. It also tracks any partial executions of the position and includes a descriptive note explaining the reasoning behind the signal. Finally, you'll find timestamps for when the position became active, when the signal was created, and whether the event occurred during a backtest or live trading session.

## Interface MetricStats

This interface holds a collection of statistics related to a specific performance metric. It provides a comprehensive view of how that metric behaved during a backtest.

You'll find details like the total number of times the metric was recorded, the overall time spent on the metric, and key summary values. This includes the average, minimum, and maximum durations, alongside measures of spread like standard deviation, median, and percentiles (95th and 99th).

Additionally, it outlines wait times – the intervals between occurrences of the metric – with minimum, maximum, and average values provided. Essentially, it’s a concentrated summary that helps you understand the performance characteristics of a particular metric throughout your backtest.

## Interface LiveStatisticsModel

This model provides a detailed snapshot of your live trading performance. It gathers data from every trade event, including idle periods, open positions, active trading, and closed signals. You can track the total number of events and specifically the number of closed trades.

Key performance metrics are calculated, allowing you to assess your profitability. These include the number of winning and losing trades, the win rate (expressed as a percentage), and the average PNL per trade. Overall cumulative PNL is also tracked.

Beyond simple profitability, the model offers insights into risk. Standard deviation helps gauge volatility – lower values indicate less risk.  The Sharpe and annualized Sharpe ratios combine profitability and risk, with higher values suggesting better risk-adjusted returns. Certainty Ratio is calculated to evaluate the ratio of average winning trade to the absolute value of average losing trade. Lastly, expected yearly returns give you an idea of potential annual gains based on trade duration and PNL. Remember, any calculation resulting in an unsafe value (like NaN or Infinity) will be represented as null.

## Interface InfoErrorNotification

This component handles notifications about errors that pop up during background processes. These aren't critical errors that will stop everything, but they're important to know about so you can investigate and fix them. 

Each notification has a unique identifier (`id`) to help track it. The `type` is always "error.info," telling you exactly what kind of notification it is. 

You'll also get a human-readable `message` explaining the problem and a detailed `error` object including a stack trace and extra information.  Finally, `backtest` will always be false because these notifications come from the live trading environment, not a simulation.


## Interface IWalkerStrategyResult

This object holds the results for a single trading strategy you've tested. 

It includes the name of the strategy you ran, along with a detailed set of statistics summarizing its performance – think things like total profit, maximum drawdown, and win rate. 

You'll also find a single number representing a key metric used to evaluate the strategy, and its overall ranking compared to other strategies in your test. A lower rank signifies a better performing strategy.

## Interface IWalkerSchema

The IWalkerSchema lets you set up A/B tests for different trading strategies. Think of it as a blueprint for running experiments – you give it a name and a descriptive note. 

It tells the backtest-kit which exchange and timeframe to use for all the strategies you're comparing. 

You specify the names of the strategies to be tested, making sure they've been previously registered. 

You can also choose which performance metric (like Sharpe Ratio) to optimize for these strategies, although Sharpe Ratio is the default. Finally, you can define optional callbacks to monitor what’s happening during the testing process.


## Interface IWalkerResults

The `IWalkerResults` object holds all the information you get after a complete backtest run, specifically when comparing different strategies. It tells you which trading symbol was being evaluated. You’ll also find the name of the exchange used for the test and the identifier of the specific backtesting strategy, or "walker," that was employed. Finally, it includes the name of the timeframe used for the backtest, such as "1 minute" or "1 day".


## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you hook into different stages of the backtest process. Think of it as a way to get notified about what's happening under the hood while the framework is comparing different trading strategies.

You can use `onStrategyStart` to know when a specific strategy and symbol combination is beginning its backtest.  When a strategy finishes running, `onStrategyComplete` will be called, providing you with statistics and a metric for that test. If a strategy encounters an error during its backtest, `onStrategyError` will alert you, giving you details about the problem. Finally, `onComplete` gets triggered once all the backtests are done, providing the overall results.


## Interface ITrailingTakeCommitRow

This interface represents a single action queued for a trailing take commit strategy. Think of it as a record of when and how a trailing take profit order should be adjusted. 

Each record includes the type of action being taken - specifically, a "trailing-take" – this lets the system know what kind of order to execute.  It also stores the percentage shift that should be applied to the stop loss, which determines how much the price needs to move before the stop is adjusted. Finally, it keeps track of the price at which the trailing was initially established, providing context for calculations.

## Interface ITrailingStopCommitRow

This interface represents a queued action related to a trailing stop order. Think of it as a record of something that needs to happen regarding a trailing stop, like adjusting the stop price. 

It includes three key pieces of information: 

*   The `action` field confirms this is specifically a trailing stop action.
*   `percentShift` tells you the percentage change applied to the trailing stop.
*   `currentPrice` represents the price at the moment the trailing stop was initially established or last adjusted.

## Interface IStrategyTickResultWaiting

This type represents a tick result specifically when a trading signal has been scheduled and is currently waiting for the price to reach its entry point. You'll receive this type of result repeatedly as the system monitors the price. It's different from the initial signal creation, which is marked as "scheduled" just once.

The result includes details like the signal itself, the current VWAP price, and identifiers like the strategy, exchange, frame, and symbol involved.  Importantly, the progress towards take profit and stop loss are always zero in this "waiting" state.  You also get unrealized profit and loss information for the theoretical, not-yet-activated position, as well as flags to indicate whether this is a backtest or live trade and when it was created.

## Interface IStrategyTickResultScheduled

This type represents a tick result when a trading strategy has generated a signal that's waiting to be triggered – essentially, it's a "scheduled" signal. It holds all the key information about that signal, including the strategy's name, the exchange it's operating on, the timeframe being used, and the symbol being traded.  You’ll find details about the current price at the time the signal was scheduled, along with whether this result came from a backtest or live trading environment. The 'action' property specifically flags this as a scheduled signal result, ensuring type safety within your trading framework. Finally, it tracks when this result was generated, which is important for correlating events and debugging.

## Interface IStrategyTickResultOpened

This interface represents a notification that a new trading signal has been created. It's sent when a strategy generates a signal that passes validation and is saved.

Here's what you'll find included in this notification:

*   **Action:** Clearly identifies this as an "opened" signal.
*   **Signal:** The full details of the newly created signal, including a unique ID.
*   **Strategy Name:**  Tells you which strategy generated the signal.
*   **Exchange Name:**  Indicates the exchange being used.
*   **Frame Name:**  Specifies the timeframe the signal is based on, like "1m" or "5m".
*   **Symbol:**  The trading symbol involved, for example, "BTCUSDT."
*   **Current Price:** The price used when the signal was triggered.
*   **Backtest:** A flag showing whether this is a backtest scenario or a live trade.
*   **Created At:** A timestamp indicating precisely when this signal result was created.

## Interface IStrategyTickResultIdle

This interface describes what happens when your trading strategy is in a resting state – essentially, no active trade signals are present. It provides a snapshot of the market conditions at that moment.

You'll see details like the strategy's name, the exchange being used, the timeframe being analyzed (like 1-minute or 5-minute candles), and the trading symbol (e.g., BTCUSDT). The current price is also recorded.

There's also information about whether the data comes from a backtest (past performance analysis) or a live trading environment. Lastly, a timestamp indicates precisely when this idle state was observed. It helps you correlate events and understand the sequence of your strategy's behavior.


## Interface IStrategyTickResultClosed

This data structure represents what happens when a trading signal is closed, providing a complete picture of the outcome. 

It includes all the original details of the signal, along with the final price at which it was closed.

You'll find information about why the signal closed, whether it was due to a time limit, a profit or loss target, or a manual closure.

Crucially, it also gives you a detailed breakdown of the profit or loss, factoring in things like fees and slippage.

The record keeps track of the strategy, exchange, and timeframe used, as well as whether it’s a backtest or live trade. If the signal was closed manually, a unique identifier is included. Finally, it includes the timestamp when the result was generated.

## Interface IStrategyTickResultCancelled

This interface represents a situation where a trading signal was scheduled but didn't result in an actual trade. It happens when a signal is cancelled, perhaps because it was stopped before it could trigger an entry or because it was explicitly cancelled by the user.

The data provided includes the cancelled signal itself, the final price at the time of cancellation, and details about when and where the signal was cancelled. You'll find information like the strategy and exchange names, the timeframe used, and the trading symbol involved. A flag indicates whether this cancellation occurred during a backtest or in a live trading environment. 

A cancellation reason and an optional ID are also included to help track why the signal was cancelled, especially if you manually cancelled a signal. Finally, there's a timestamp indicating when the cancellation record was created.

## Interface IStrategyTickResultActive

This interface describes a tick result indicating that a strategy is actively monitoring a signal, waiting for a take profit, stop loss, or time expiration to be triggered. It contains details about the signal being monitored, the current price used for evaluation, and the strategy's identification information, including its name, the exchange it's operating on, and the timeframe being used. 

You'll find information about the trading pair, progress towards take profit and stop loss, and the unrealized profit and loss (PNL) for the position, considering fees and slippage. The information also specifies whether the event originated from a backtest or a live trading environment and when the result was created. This data is helpful for analyzing the state of active positions during a strategy's execution.

## Interface IStrategySchema

This schema defines how a trading strategy behaves within the backtest-kit framework. Each strategy gets a unique name for identification and can include a note for developers to add helpful context. 

Strategies also specify a minimum time interval between signal generation, preventing them from sending signals too frequently.

The core of the strategy is the `getSignal` function, which is responsible for calculating trading signals. This function receives market data and returns a signal if a trade should be made, or null if no action is needed. You can even tell the strategy to hold off on a signal until a specific price level is reached.

You can also set up callbacks to react to events like when a position is opened or closed. Strategies can be associated with risk profiles for better risk management, and you can optionally tag strategies with action identifiers.


## Interface IStrategyResult

This interface represents a single result from running a trading strategy backtest. It bundles together everything needed to understand and compare different strategies. Each result includes the strategy's name, a comprehensive set of statistics detailing its performance, and a specific metric value used to rank the strategy – this value can be missing if there were issues during the backtest. Think of it as a row in a table showing how well each strategy did.

## Interface IStrategyPnL

This interface describes the result of a strategy's profit and loss calculation. It gives you a clear picture of how your strategy performed, taking into account real-world trading factors.

Here's what you'll find:

*   **pnlPercentage:**  This tells you the profit or loss as a percentage – a positive number means profit, and a negative number indicates a loss.
*   **priceOpen:** This is the price at which you entered the trade, but it's been adjusted to reflect the impact of small fees and slippage (the difference between the expected price and the actual price you got).
*   **priceClose:** Similarly, this represents the price at which you exited the trade, also adjusted for fees and slippage. 

Essentially, these values let you see your strategy’s performance in a more realistic way, considering those little costs that add up.

## Interface IStrategyCallbacks

This interface provides a way to hook into the lifecycle of trading signals within your strategy. You can register functions to be called at specific moments, like when a signal is opened, active, idle, closed, or scheduled.

Each callback function is triggered under certain conditions, giving you opportunities to react to changes in the signal's state. For example, `onOpen` is called when a new signal starts, while `onClose` lets you know when a signal has finished.  There are also callbacks for scheduled and canceled signals, as well as for partial profit and loss situations.

The `onTick` function receives information on every market tick, allowing for real-time updates.  The `onWrite` callback is mainly used for testing and persisting signal data.  Finally, `onSchedulePing` and `onActivePing` enable you to perform custom monitoring and adjustments on scheduled and active signals respectively, on a minute-by-minute basis. These callbacks provide a flexible way to extend and customize the behavior of your trading strategy.

## Interface IStrategy

This interface, `IStrategy`, defines the core methods for a trading strategy within the backtest-kit framework. It's the blueprint that strategies need to follow.

Here's a breakdown of what each method does:

*   **`tick`**: This is the heart of the strategy - it's executed for each price update (tick). It checks for potential trade signals, trailing stop/profit conditions.
*   **`getPendingSignal`**:  Looks for any active, pending trade signals for a given symbol. It's used internally to monitor things like take profit and stop-loss, and to ensure signals don’t expire.
*   **`getScheduledSignal`**:  Similar to `getPendingSignal`, but specifically for scheduled trade signals, retrieving the active one if it exists.
*   **`getBreakeven`**:  Determines if the current price movement has covered the costs of the trade (slippage and fees).  It uses a specific calculation to determine this.
*   **`getStopped`**: Checks whether the strategy has been halted from generating new signals.
*   **`backtest`**: A quick way to test a strategy on historical price data. It simulates trades based on past candles.
*   **`stopStrategy`**:  Shuts down the strategy from generating new signals, without forcing immediate closing of existing positions.
*   **`cancelScheduled`**:  Cancels a pre-planned trade signal without affecting other parts of the strategy.
*   **`activateScheduled`**: Manually triggers a scheduled trade, bypassing the normal waiting period.
*   **`closePending`**: Closes an already active trade without interrupting anything else.
*   **`partialProfit`**: Closes a portion of an existing trade that is already in profit.
*   **`partialLoss`**: Closes a portion of an existing trade that's incurring losses.
*   **`trailingStop`**:  Automatically adjusts the stop-loss level to protect profits as the price moves favorably.
*   **`trailingTake`**:  Adjusts the take-profit level to lock in profits and potentially allow for more gains.
*   **`breakeven`**:  Moves the stop-loss to the entry price once the trade is profitable enough to cover costs.
*   **`dispose`**: Cleans up and releases resources used by the strategy when it’s no longer needed.

## Interface IStorageUtils

This interface defines the core functions any storage system needs to support within the backtest-kit framework. Think of it as a contract – any system that wants to store and retrieve trading signals needs to implement these methods. It includes functions for reacting to signal events like when a trade is opened, closed, scheduled, or cancelled. You’ll also find ways to look up a specific signal by its unique ID and to retrieve a complete list of all stored signals. Essentially, it provides the basic building blocks for persisting your trading data.

## Interface IStorageSignalRowScheduled

This interface represents a signal row stored in the system, specifically when the signal is scheduled. 
It indicates that the signal is awaiting execution or further processing.
The `status` property is fixed and always indicates "scheduled", confirming the signal's current state.

## Interface IStorageSignalRowOpened

This interface describes a signal row that's currently in an "opened" state. It's a simple way to track when a signal has been activated or triggered. The key piece of information here is the `status` property, which is always set to "opened" to indicate that the signal is active. Think of it as a flag marking a trade as being live.

## Interface IStorageSignalRowClosed

This interface represents a signal that has been closed and finalized. It contains information about the signal's final performance.

Specifically, it tells you the signal is in a "closed" state, indicating it's no longer active. 

It also provides the profit and loss (PNL) data associated with that closed signal, allowing you to analyze its financial outcome.

## Interface IStorageSignalRowCancelled

This interface represents a signal row that has been cancelled. It simply indicates the signal's current status is "cancelled." It’s a straightforward way to track the state of a signal within the backtest-kit system, specifically when that signal is no longer active.

## Interface IStorageSignalRowBase

This interface defines the core information needed to store a signal, regardless of its specific status. Every signal saved will include a timestamp of when it was created (`createdAt`) and last updated (`updatedAt`).  Signals are also assigned a `priority` which dictates the order they’re processed - during both live trading and backtesting, this is based on the current time. Think of it as ensuring older signals are dealt with before newer ones.

## Interface ISizingSchemaKelly

This defines a way to calculate how much to invest in each trade using the Kelly Criterion. 

It essentially tells the backtest-kit system to use the Kelly Criterion formula to determine sizing. You'll specify a `kellyMultiplier` value, which is a number between 0 and 1. This multiplier controls how aggressively you're applying the Kelly Criterion; a smaller number (like 0.25, the default) is a more conservative approach, while a larger number risks more capital per trade.

## Interface ISizingSchemaFixedPercentage

This schema defines a straightforward way to size your trades – you'll consistently risk a fixed percentage of your capital on each trade. It's simple and predictable.

To use it, you specify the `method` as "fixed-percentage" and then set the `riskPercentage`. This value, expressed as a number between 0 and 100, determines the proportion of your capital that will be at risk for every trade you execute.

## Interface ISizingSchemaBase

This interface defines the basic structure for sizing strategies in backtest-kit. Every sizing strategy needs a unique identifier, which is the `sizingName`. You can also add a `note` for explaining the sizing strategy’s purpose.

To control how much of your account a trade can use, there are limits on position size. `maxPositionPercentage` sets the maximum size as a percentage of your account balance.  `minPositionSize` and `maxPositionSize` provide absolute limits on the trade size.

Finally, `callbacks` allow you to hook into different stages of the sizing process if needed, letting you customize the behavior further.

## Interface ISizingSchemaATR

This schema defines how to size your trades using the Average True Range (ATR). 

It's specifically for strategies that want to base their position size on the ATR, a measure of volatility. 

You'll need to specify a risk percentage – this tells the system what portion of your capital you’re willing to risk on each trade, expressed as a number between 0 and 100.  The ATR multiplier then determines how far your stop-loss will be placed relative to the ATR value, allowing your position size to adjust based on current market volatility.

## Interface ISizingParamsKelly

This interface defines the parameters needed for Kelly Criterion sizing, a strategy for determining how much of your capital to risk on each trade. 

It includes a logger, which is really just a way to output debugging information and track what's happening during the backtesting process. Think of it as a tool to help you understand the framework's decisions and troubleshoot any issues.


## Interface ISizingParamsFixedPercentage

This interface defines how much of your capital you'll use for each trade when using a fixed percentage sizing strategy. It's pretty straightforward: you'll primarily need a logger to help track what's happening and identify potential issues. The logger helps you see the decisions the sizing framework is making, which is crucial for debugging and understanding your backtest results.

## Interface ISizingParamsATR

This interface defines the settings you'll use to control how much of your capital is used for each trade when using an ATR-based sizing strategy. It primarily focuses on providing a way to log information about the sizing process, which is really useful for debugging and understanding why your trades are being sized the way they are. The `logger` property lets you specify a service that will handle sending those log messages where you need them.

## Interface ISizingCallbacks

The `ISizingCallbacks` interface provides a way to hook into the sizing process within the backtest kit. You can use it to monitor or adjust how position sizes are determined during your simulations. Specifically, the `onCalculate` callback is triggered immediately after the framework computes a potential position size. This lets you log the size, verify it against your rules, or potentially even make minor adjustments before it’s used in the backtest.

## Interface ISizingCalculateParamsKelly

This section defines the information needed to calculate bet sizes using the Kelly Criterion, a strategy for maximizing long-term growth. To use this, you'll need to provide the win rate, which represents the percentage of winning trades, and the win/loss ratio, which describes how much you win compared to how much you lose on average for each trade. These values will be used to determine an optimal bet size that balances risk and reward. Essentially, it's a way to automate how much capital you allocate to each trading opportunity based on its perceived profitability.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the parameters needed to calculate trade sizes using a fixed percentage approach. It tells the backtest kit that you want to size your trades based on a predetermined percentage of your available capital. You'll need to specify the stop-loss price when using this method, which is crucial for determining the percentage used for sizing. Essentially, it's a straightforward way to manage risk by linking trade size to a stop-loss level.

## Interface ISizingCalculateParamsBase

This defines the basic information needed to figure out how much of an asset to trade. It includes the trading pair you're working with, like BTCUSDT, and the total amount of money you have available in your account.  Also included is the price at which you intend to enter the trade. These pieces of data are fundamental for determining appropriate trade sizes.

## Interface ISizingCalculateParamsATR

This describes the settings you'd use when determining how much of your capital to allocate to a trade based on the Average True Range (ATR).  You'll specify that the sizing method is "atr-based," which tells the system to use ATR for calculating position size.  Crucially, you'll also provide the current ATR value as a number. This represents the average price fluctuation over a specific period and is vital for managing risk.

## Interface ISizing

The `ISizing` interface is all about figuring out how much of an asset to trade. Think of it as the part of the system that determines your position size – how many shares or contracts you’ll buy or sell. 

It has one main method, `calculate`, which takes in some information about your risk preferences and market conditions, and then it figures out the appropriate size for your trade. This calculation happens asynchronously, meaning it might involve some behind-the-scenes processing before the result is ready.

## Interface ISignalRow

The `ISignalRow` represents a complete trading signal, automatically given a unique ID after it's been validated. It holds all the essential information for executing a trade, including the entry price (`priceOpen`), the exchange and strategy used (`exchangeName`, `strategyName`), and the timeframe (`frameName`).  You'll also find details like the creation timestamp (`scheduledAt`), when the position became active (`pendingAt`), and the trading pair symbol (`symbol`).

A crucial internal flag, `_isScheduled`, indicates whether the signal was created as part of a scheduled operation.  If the position has been partially closed, the `_partial` array keeps track of each closing event, allowing for accurate profit and loss calculations.  Derived values, `_tpClosed`, `_slClosed`, and `_totalClosed` provide summaries of these partials.

The `_trailingPriceStopLoss` and `_trailingPriceTakeProfit` properties represent dynamically adjusted stop-loss and take-profit levels. These are managed by the system's trailing logic and override the original stop-loss and take-profit prices for trade execution purposes while preserving the original values for record-keeping.

## Interface ISignalDto

The ISignalDto represents a single trading signal. Think of it as a structured way to communicate a trading idea. It includes details like whether you should buy (long) or sell (short), a description of why you're making that trade, and important price levels to manage the position.

Specifically, you'll find:

*   A unique identifier for the signal.
*   The direction of the trade - long or short.
*   A note explaining the rationale behind the signal.
*   The price at which you’d enter the trade.
*   Target price levels for taking profits.
*   Price levels for setting stop-loss orders to limit potential losses.
*   An estimate of how long the signal is expected to remain active.

The `priceTakeProfit` and `priceStopLoss` values need to align with the trade direction, ensuring a logical setup.

## Interface IScheduledSignalRow

This interface describes a signal that's waiting for a specific price to be reached before a trade is executed. Think of it as a signal on hold, delayed until the market hits a certain level. It builds upon the basic signal representation and initially holds a scheduled time. Once the market price reaches the defined entry price, it transforms into a regular, active signal, and the pending time gets updated to reflect the real wait time. The `priceOpen` property defines the target price that triggers this delayed signal.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled trading signal, but with an added feature – the ability to cancel it. It builds upon the basic scheduled signal information and includes a `cancelId`. This `cancelId` is specifically used when a user manually cancels a signal, giving a way to track those user-driven cancellations separately. Think of it as a reference number assigned when you tell the system to halt a previously scheduled action.

## Interface IRiskValidationPayload

This object holds the information needed to assess risk during trading. It combines details from the signal being considered, like the current signal itself, along with a snapshot of your current trading activity. You'll find the current signal's data, a count of how many positions you currently hold, and a complete list of those active positions. This allows risk checks to accurately evaluate potential impacts based on the portfolio's current state.

## Interface IRiskValidationFn

This function is your gatekeeper for ensuring trades are safe and reasonable. It takes a proposed trade and decides whether it’s acceptable based on your risk rules. If the trade is good to go, the function should do nothing or return null. If there's a problem – maybe the trade is too large or violates a specific risk limit – the function should either throw an error or return a detailed explanation of why the trade is being rejected. This allows backtest-kit to handle the rejection gracefully and provide feedback.


## Interface IRiskValidation

This interface lets you define how to check if your trading strategies are behaving responsibly, particularly when it comes to risk. Think of it as setting up rules to make sure your strategy isn't doing anything unexpected or dangerous. 

It has two parts: a `validate` function, which is the core logic of your risk check – it takes parameters and returns a result indicating whether the check passed. And then a `note` field that's just for explanation; it's there to help you (or others) understand *why* you've set up that particular validation rule. It’s a good place to document the reasoning behind your risk checks.

## Interface IRiskSignalRow

This interface represents a row of data used internally for risk management calculations. It builds upon the existing `ISignalDto` to provide additional crucial information about a trade. Specifically, it includes the entry price (`priceOpen`), the initially set stop-loss price (`originalPriceStopLoss`), and the initially set take-profit price (`originalPriceTakeProfit`). This data is vital for validating risk exposure and understanding the original parameters of a position.

## Interface IRiskSchema

The `IRiskSchema` helps you define and enforce rules for your portfolio's risk management. Think of it as a blueprint for how to keep your trading strategy safe. 

Each schema has a unique identifier, `riskName`, to easily reference it. You can add a descriptive note, `note`, for yourself or other developers.

You can also specify callbacks, `callbacks`, to react to certain events related to the risk control. The core of the schema is the `validations` array. This is where you put your custom logic – functions or objects – that will actually check if a trade aligns with your desired risk profile. 


## Interface IRiskRejectionResult

This interface represents the outcome when a risk validation check fails. It provides details to help you understand why the validation didn't pass. Each rejection has a unique identifier (`id`) to track it specifically, and a clear explanation (`note`) describing the reason for the failure in a way that's easy to understand. Think of it as a notification saying "something didn't meet the requirements, and here's why."

## Interface IRiskParams

This interface defines the configuration options you provide when setting up your risk management system. It includes essential details like the name of the exchange you're working with, a logger for tracking what’s happening, and a flag to indicate whether you’re in backtesting or live trading mode. Crucially, it also has a special callback function (`onRejected`) that gets triggered whenever a trading signal is blocked by risk controls. This allows you to handle these rejections specifically, perhaps by sending alerts or adjusting your strategies, before the system proceeds with further actions.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, holds all the information needed to decide if a new trade should be allowed. Think of it as a set of safety checks run before a trading signal is actually acted upon. It provides details like the trading pair involved (symbol), the signal itself, the name of the strategy making the request, and information about the exchange and risk profile being used.  You'll also find the current price and a timestamp included, useful for contextual validation. Essentially, it’s a snapshot of everything relevant when deciding whether to proceed with a potential trade.

## Interface IRiskCallbacks

This interface lets you define functions that get triggered when your trading strategy's risk checks either fail or succeed. Think of it as a way to be notified about potential issues or confirmations related to your trading limits.

The `onRejected` function will be called whenever a trading signal is blocked because it violates your pre-defined risk constraints. This gives you a chance to investigate why the trade was rejected, perhaps to adjust your risk parameters.

Conversely, the `onAllowed` function is called whenever a trading signal is approved after passing all the risk checks. You might use this to log successful trades or perform other actions confirming your strategy is operating within acceptable boundaries.

## Interface IRiskActivePosition

This interface describes a single trading position that's being monitored for risk management purposes. It holds all the key details about a position, including which trading strategy opened it, the exchange it's on, and the trading symbol involved. You’ll find information like whether it's a long or short position, the entry price, stop-loss and take-profit levels, and when the position was initiated. This data is crucial for understanding how different strategies interact and managing overall risk across your entire trading system.

## Interface IRisk

This interface, `IRisk`, is all about keeping your trading safe and manageable. It lets you define and enforce rules to make sure your signals don't take on more risk than you're comfortable with.

The `checkSignal` method is your gatekeeper; it evaluates whether a potential trade aligns with your predefined risk parameters. 

`addSignal` is how you tell the system a new trade has been opened—it tracks the details of the trade so you can monitor its risk exposure.

Finally, `removeSignal` lets you inform the system when a trade has closed, ensuring your risk calculations stay accurate as positions are resolved.

## Interface IReportTarget

This interface lets you choose which kinds of information your backtest framework will record. Think of it as a way to fine-tune the level of detail captured during a backtest run.

You can control whether to log information about strategy actions, risk management decisions, breakeven calculations, partial order fills, heatmap data, walker iterations, performance metrics, scheduled signals, live trading events, and backtest signal closures. Enabling each property turns on the corresponding logging, allowing you to focus on the areas most relevant to your analysis. It’s useful for debugging, optimization, and understanding the inner workings of your trading system.

## Interface IReportDumpOptions

This interface lets you specify details about your backtest reports, helping to organize and filter them effectively. You can use it to tag reports with information like the trading pair (e.g., BTCUSDT), the name of the strategy used, the exchange involved, and the timeframe of the backtest.  It also allows you to associate a unique identifier with the signal and gives a name to the walker optimization. Think of these properties as labels that make it easier to find and analyze specific backtest runs.

## Interface IPublicSignalRow

This interface, IPublicSignalRow, provides a way to see the initial stop-loss and take-profit prices when working with trading signals. It builds upon the standard signal data by adding 'originalPriceStopLoss' and 'originalPriceTakeProfit', which represent the values set when the signal was first created. 

These original prices are preserved even if you're using trailing stop-loss or take-profit mechanisms to adjust the effective values. This is useful for transparency, letting users see both the current, dynamically adjusted SL/TP *and* the starting points.

Think of it as a snapshot of the initial SL/TP settings for a signal.

It also includes 'partialExecuted', which shows the total percentage of a position that has been closed through partial executions. This percentage sums up all the partial close amounts, indicating how much of the position has been closed off using this method.

## Interface IPositionSizeKellyParams

This section defines the settings you can use to control how much of your capital is allocated to each trade when using the Kelly Criterion for position sizing. The `winRate` property represents the probability of a successful trade, expressed as a number between 0 and 1. The `winLossRatio` property specifies the average profit you make compared to the average loss you experience for each trade. By adjusting these values, you influence the aggressiveness of your position sizing strategy.

## Interface IPositionSizeFixedPercentageParams

The `IPositionSizeFixedPercentageParams` interface helps you define the parameters for a trading strategy that uses a fixed percentage of your capital to determine the size of each trade. It's all about controlling risk and consistently allocating funds. 

Specifically, you'll find a `priceStopLoss` property which represents the price at which you want to place a stop-loss order to protect your investment. Setting this value is crucial for managing potential losses.

## Interface IPositionSizeATRParams

To help determine how much to trade, you'll need to specify the Average True Range (ATR) value. This `atr` property represents the current ATR calculated for the asset you’re trading. It’s a number that tells you about the asset's volatility.

## Interface IPersistBase

This interface outlines the basic building blocks for connecting backtest-kit to different ways of storing data, like files or databases. It defines a minimal set of operations: initializing the storage, retrieving a specific data item, checking if an item exists, saving a data item, and listing all available data items. Think of it as a contract that custom storage solutions need to follow to work seamlessly with backtest-kit.

The `waitForInit` method ensures that the storage is set up correctly and only once. `readValue` gets a particular data item.  `hasValue` simply tells you whether that data item exists. `writeValue` saves a data item, making sure the process happens reliably. Finally, `keys` gives you a way to go through all the data items that are being stored, and it presents them in a sorted order, useful for checks and overall management.

## Interface IPartialProfitCommitRow

This represents a specific instruction to take a partial profit on a trade. Think of it as a single step in a plan to gradually close a position. It tells the system to close a certain percentage of the current position. Importantly, it also records the price at which this partial profit action was actually executed, which is valuable for tracking and analysis.

## Interface IPartialLossCommitRow

This object represents a request to partially close a trading position. It's essentially a record of an instruction to sell a portion of your holdings.

It contains three key pieces of information: the action being taken (which is always "partial-loss" to identify it as a partial closing), the percentage of the position that should be closed, and the price at which that partial closing actually happened. Think of it as a confirmation that a portion of your trade was executed and the price it was completed at.

## Interface IPartialData

This data structure holds a snapshot of key information about a trading signal, specifically focusing on its profit and loss levels. It's designed to be easily saved and retrieved, even across sessions. Think of it as a simplified version of the complete signal state.

It includes two main pieces of information:

*   profitLevels: A list of the price points where the signal reached a profit target.
*   lossLevels: A list of the price points where the signal hit a stop-loss level.

These levels are stored as arrays, making them suitable for saving and loading from storage systems that might have limitations with more complex data structures like Sets. When you load this data, it’s transformed back into the full signal state.

## Interface IPartial

This interface, `IPartial`, is all about keeping track of how well (or not so well) your trading signals are performing in terms of profit and loss. It’s used internally by components that manage and monitor your trading signals.

Whenever a signal starts making money, the `profit` method steps in. It figures out if the signal has hit key milestones like 10%, 20%, or 30% profit, and then alerts the system about any new levels reached. Similarly, the `loss` method handles signals that are losing money, tracking milestones like 10%, 20%, or 30% loss and sending out notifications.

Finally, when a signal is finished—perhaps it hit a take profit or stop loss—the `clear` method cleans everything up. It removes the signal's data from memory, saves the changes, and ensures everything is tidied up correctly.

## Interface IParseArgsResult

This object holds the results when you process command-line arguments to configure your trading session. It essentially tells you how the system will operate. It combines your initial input parameters with flags like whether to run a backtest using historical data, paper trade with live market conditions, or actually trade with real money in a live environment. These flags are automatically set based on how you launch the trading framework.

## Interface IParseArgsParams

This interface describes the information needed to set up a backtest. Think of it as a blueprint for what the backtest system needs to know to get started. It specifies things like which cryptocurrency pair to trade (symbol), which strategy to use, which exchange to connect to, and the timeframe for the historical data. Essentially, it's the base set of instructions for telling the backtest framework *what* to test. 

Here's a breakdown of those key pieces:

*   **symbol**: The trading pair you’re interested in, like BTCUSDT or ETHUSDT.
*   **strategyName**: The name of the trading strategy you're going to use for the backtest.
*   **exchangeName**:  The exchange where you'll be simulating trades, such as Binance or Bybit.
*   **frameName**: The timeframe of the price data being used - is it 1-hour candles, 15-minute candles, or daily?

## Interface IOrderBookData

The `IOrderBookData` interface holds information about the current state of an order book. It represents the bids (buy orders) and asks (sell orders) available for a specific trading pair.  You'll find the `symbol` property, which tells you which trading pair the data applies to.  The `bids` property is an array containing details of all the buy orders, and similarly, `asks` holds information about all the sell orders.


## Interface INotificationUtils

This interface serves as the foundation for any system that needs to be notified about what's happening during a backtest or live trading. Think of it as a central place to connect to different notification channels like email, Slack, or a custom system.

It defines a set of methods for receiving updates on various events, such as when a trade is opened or closed, when partial profits or losses are available, when risks are rejected, or when errors occur.  You'll also find methods for getting and clearing a log of these notifications.

Each method you see—`handleSignal`, `handlePartialProfit`, `handleRisk`, etc.—is a hook that your notification adapter must provide a way to respond to. `getData` allows you to retrieve all accumulated notifications, and `clear` gives you the option to wipe them out.

## Interface IMethodContext

The `IMethodContext` helps your backtesting framework know which specific configurations to use for a trading simulation. Think of it as a set of labels – it tells the system exactly which strategy, exchange, and timeframe you're working with.  It carries information like the names of the strategy and exchange being used, and even whether you're in backtesting mode or live trading mode. This context is passed around within the system, simplifying how different parts of the backtest interact with each other.

## Interface IMarkdownTarget

This interface lets you choose which detailed reports to generate during your backtesting process. Think of it as a way to control the level of detail in your analysis.

You can turn on reports for specific things like how your strategy is performing, how risk management is affecting trades, or how different strategies compare against each other. 

For instance, if you’re mainly interested in seeing all the trade events as they happen during a backtest, you can enable the "live" report. Or, if you want to understand where your backtest might be running slowly, the "performance" report will help. 

Each property corresponds to a different kind of report, allowing for a highly customizable reporting experience.

## Interface IMarkdownDumpOptions

This interface defines the options used when exporting data to Markdown files. Think of it as a container for all the information needed to pinpoint a specific piece of data—like a particular strategy's performance on a certain exchange and timeframe.  It includes details like the directory where the Markdown file should be saved, the file's name, and essential information about the trading setup itself, such as the trading pair (symbol), the strategy's name, the exchange being used, the timeframe, and a unique identifier for the signal. Using these options ensures that the exported information is correctly organized and linked to the relevant data source.


## Interface ILogger

The `ILogger` interface is how different parts of the backtest-kit framework communicate about what's happening. It lets components like agents, storage, and more record messages about themselves.

Think of it as a central place to keep track of important events—when things start up, when tools are used, when policies are checked, and if there are any errors. This helps you understand what's going on, debug problems, and keep an audit trail.

The interface provides several ways to log messages:

*   `log`: For general messages about significant events.
*   `debug`: For very detailed information useful during development and troubleshooting.
*   `info`: For general updates about the system’s activity, like successful operations.
*   `warn`: For situations that might need attention but don't stop the system from working.

## Interface IHeatmapRow

This interface defines the data for a single row in a portfolio heatmap, representing the performance of trading for a specific symbol like BTCUSDT. It provides key metrics to understand how a symbol performed across all strategies used.

You'll find information on the total profit or loss percentage earned from all trades involving that symbol.  The Sharpe Ratio helps gauge the return relative to the risk taken. It also details maximum drawdown, which shows the biggest percentage loss experienced.

The interface also outlines trade statistics including total trades, win/loss counts, and the win rate.  Furthermore, it includes profit factor, average win and loss sizes, and streaks (maximum consecutive wins and losses). Finally, it gives expectancy, a metric indicating the average profit per trade you could expect.

## Interface IFrameSchema

This defines a basic building block for your backtesting periods, essentially setting up the timeline for your trading simulation. Each frame represents a specific period of time, identified by a unique name. You can add a note to describe it for clarity.

It’s crucial to define the interval – like daily, weekly, or hourly – which determines how timestamps are generated within that period. You also clearly set the start and end dates for your backtest, making sure the simulation covers the desired timeframe.

Finally, you can add optional callbacks to react to specific events within the frame’s lifecycle, allowing for more customized behavior during your backtest.


## Interface IFrameParams

The `IFramesParams` object is what you give to the `ClientFrame` when you're setting it up – it's how you configure the frame. It includes a logger, which is a handy tool for seeing what's going on behind the scenes and debugging any issues. Think of it as a way to keep an eye on the frame’s inner workings.

## Interface IFrameCallbacks

This section describes callbacks related to how your backtest framework handles time periods for trading. Specifically, the `onTimeframe` callback gets triggered whenever the framework creates a new set of timeframes—think of these as the chunks of time your trading strategy will evaluate. You can use this callback to verify the generated timeframes are what you expect, or just to log them for debugging purposes. The callback receives the array of dates, the start and end dates of the entire timeframe, and the interval used to create them.

## Interface IFrame

The `IFrames` interface is a core part of how backtest-kit handles time, specifically generating the sequence of moments in time your trading strategy will be tested against. Think of it as the engine that creates the timeline for your backtest.

The `getTimeframe` function is the key to this process.  You give it a trading symbol (like "BTCUSDT") and a name for the timeframe you want (like "1h" for one-hour candles), and it returns an array of dates, representing the timestamps for your backtest to run through. These timestamps are carefully spaced based on the timeframe you chose. This allows the backtest to iterate through each moment in time and simulate trading decisions.

## Interface IExecutionContext

The Execution Context holds important information about the current state of your trading strategy. It’s like a shared set of details passed around during the execution of your code, allowing your strategy to know things like the trading symbol, the exact time of the operation, and whether it's running in a simulated backtest or a live trading environment. This context is automatically managed and delivered to your strategy, so you don't have to manually track it. 

It provides implicit context for functions like fetching historical data, handling market updates, and running backtests. 

The context includes:

*   The `symbol`: The specific trading pair being used (like BTCUSDT).
*   The `when`: The precise date and time of the current operation.
*   The `backtest`: A flag indicating whether the code is running in backtesting mode or live trading.

## Interface IExchangeSchema

This schema describes how backtest-kit connects to and understands different cryptocurrency exchanges. Think of it as a blueprint for integrating a new exchange into the system. 

It includes a unique name to identify the exchange and an optional note for developers. The core of the schema is `getCandles`, which tells backtest-kit how to retrieve historical price data—crucial for simulating trading. You also define how to format trade quantities and prices to match the exchange's specific rules. 

There's an optional `getOrderBook` function for retrieving the current order book depth, and `callbacks` allow for reacting to specific events. If you don't provide an order book function, you'll need to handle order book data manually.

## Interface IExchangeParams

This interface defines the essential configuration needed to connect to and interact with an exchange within the backtest-kit framework. It provides the building blocks for how the backtest kit understands and utilizes an exchange's data and functionality.

You’ll need to supply a logger to handle debugging information, and an execution context that tells the system what symbol, time, and whether it's a backtest we are operating under.

Crucially, several functions are mandatory for any exchange implementation: `getCandles` to retrieve historical price data, `formatQuantity` and `formatPrice` to properly represent quantities and prices according to the exchange's rules, and `getOrderBook` to obtain the current order book data. Default behaviors are used if you don't explicitly provide these, but you'll almost certainly want to customize them.


## Interface IExchangeCallbacks

This allows your backtest kit system to respond to incoming candle data from an exchange. Whenever new candlestick information arrives for a specific trading symbol and timeframe, this function will be triggered. You can use it to process and react to the real-time price action as it's being received. The callback receives details like the symbol, interval, the start date of the data, how many candles were requested, and an array containing the actual candle data.


## Interface IExchange

This interface defines how the backtest-kit interacts with different cryptocurrency exchanges. It lets you retrieve historical price data (candles) for a specific trading pair and time frame, and also fetch future candles for backtesting scenarios. You can also use it to format trade quantities and prices to match the exchange’s requirements, calculate the VWAP (volume-weighted average price) which is a common indicator, and get the order book information. It provides ways to get raw candle data with flexible date and limit options, ensuring that the historical data aligns with the backtest execution time to avoid biased results.

## Interface IEntity

This interface acts as the foundation for all data objects that are stored and managed within the backtest-kit framework. Think of it as a common starting point for things like trades, orders, or account information - anything that needs to be saved and retrieved.  It ensures that all these data objects have a consistent structure and can be handled uniformly by the system. It's a core building block for building persistent data models.


## Interface ICommitRowBase

This interface, `ICommitRowBase`, provides a foundational structure for handling events related to committing data—think of it as a way to hold onto information until the system is ready to process it. It's particularly useful when you need to wait for the right conditions before finalizing a change. Each event includes the trading symbol, like "BTC-USD", and a flag indicating whether the operation is happening within a backtesting environment.

## Interface ICheckCandlesParams

This interface defines the information needed to check the timestamps of your historical candle data. Think of it as a way to verify that your trading data is complete and accurate within a specific time range.

You'll need to specify the trading pair's symbol, the exchange it came from, and the time interval (like 1-minute or 4-hour candles).  You also need to provide the start and end dates for the period you want to check, and optionally, where your persisted data is stored.  The default location for your candle data is "./dump/data/candle", but you can adjust this if it's stored elsewhere.

## Interface ICandleData

This interface represents a single candlestick, the basic unit of data used in trading and backtesting. Each candlestick holds information about a specific time period, including when it started (timestamp), the price when it began (open), the highest and lowest prices reached (high and low), the price when it ended (close), and the total volume of trades during that time. You'll use this data to feed your strategies and analyze their performance. The timestamp is given in milliseconds since the Unix epoch, making it easy to work with for time-based calculations.

## Interface ICacheCandlesParams

This defines the information needed to fetch and store historical candlestick data. It's used to prepare your trading environment before running a backtest. You'll specify the trading pair, the exchange providing the data, the timeframe for the candles (like 1-minute or 4-hour), and the start and end dates for the data you want to retrieve. Think of it as a set of instructions telling the system exactly what historical data to download and save for later use.

## Interface IBreakevenData

This data structure, `IBreakevenData`, is designed to hold information about whether a breakeven point has been achieved for a specific trading signal. It's a simplified version of the more detailed `IBreakevenState` and is primarily used for saving and loading data, like when persisting your backtesting results.  Essentially, it tells you a straightforward "yes" or "no" – has the breakeven been reached? This boolean value makes it easy to store and retrieve, as it can be readily converted to and from JSON. It's stored alongside data for many signals, helping to track progress over time.

## Interface IBreakevenCommitRow

This object represents a specific action related to breakeven calculations during a trading backtest. Think of it as a record of when the system adjusted a trade’s breakeven point. 

The `action` property always indicates this is a "breakeven" event, meaning an adjustment to the breakeven level occurred.  The `currentPrice` property tells you the price level at which that breakeven adjustment happened. This helps track how the breakeven point shifted as the market price changed.

## Interface IBreakeven

This interface manages the process of moving a trading signal's stop-loss to the break-even point, which is the original entry price. It’s designed to help ensure trades aren't immediately stopped out due to small price fluctuations, especially when considering transaction costs.

The `check` method is the core of this functionality; it periodically assesses whether the price has moved sufficiently to warrant moving the stop-loss to break-even. It considers factors like whether break-even has already been achieved, whether the price has moved enough to offset transaction costs, and whether it's safe to move the stop-loss. When this happens, it triggers a notification and saves the change.

The `clear` method is used when a trade concludes, whether through a take-profit, stop-loss hit, or time expiration.  It resets the break-even state, cleans up internal records, and saves those changes, ensuring everything is properly managed as a trade ends.

## Interface IBidData

This data structure represents a single bid or ask price and its corresponding quantity within an order book.  It's how the system conveys the price at which someone wants to buy or sell, and how much of that asset they're offering. The `price` property holds the price level as text, and the `quantity` property indicates the number of assets available at that price, also as text. Think of it as a snapshot of a specific point in the market's supply and demand.

## Interface IActivateScheduledCommitRow

This interface represents a request to activate a previously scheduled trading commit. Think of it as telling the system to actually execute a plan that was already set up.

It includes a few key pieces of information:

*   `action`: This clearly identifies the request as an "activate-scheduled" action.
*   `signalId`:  This specifies the unique identifier of the trading signal that triggered the scheduled commit. It's how the system knows *which* plan to activate.
*   `activateId`:  (Optional)  If a user manually triggers the activation, this field holds a unique identifier for that specific activation request.

## Interface IActionSchema

The `IActionSchema` lets you extend your trading strategy with custom functionality. Think of it as a way to hook into the strategy's execution to do things like track performance, send alerts, or manage external state. 

You define actions by giving them a unique name, optionally adding a note for documentation, and providing a handler function that will be executed during each trading frame. This handler effectively gets a front-row seat to everything happening within the strategy.

You can even add callbacks to the action, giving you control over specific points in its lifecycle and allowing you to react to different events occurring during strategy execution. Actions can be attached to a strategy multiple times, so you can create a complex ecosystem of event handling and state management.

## Interface IActionParams

This interface defines the information given to actions within the backtest-kit framework. Think of it as a package containing details about where and how the action is being executed. 

It includes a logger to help you track what’s happening and debug any issues. You'll also get the name of the strategy and timeframe the action belongs to. 

Finally, a flag indicates whether the action is running in a backtesting environment versus live trading. This allows for different behavior based on the context.

## Interface IActionCallbacks

This interface provides a set of optional callbacks that let you hook into the lifecycle and events of your trading actions. Think of them as customizable event listeners that you can use to manage resources, monitor activity, or persist state.

The `onInit` callback runs when an action handler is created, perfect for things like connecting to a database or setting up subscriptions.  `onDispose` is its counterpart, executed when the action handler is finished – use it to close connections or save data.

Several `onSignal` callbacks exist for reacting to trading signals, split into `onSignalLive` for live trading, `onSignalBacktest` specifically for backtesting, and a general `onSignal` for both.  There are also callbacks to respond to specific events like hitting a breakeven point (`onBreakevenAvailable`), reaching partial profit or loss targets (`onPartialProfitAvailable`, `onPartialLossAvailable`), or receiving ping signals during scheduled or active monitoring (`onPingScheduled`, `onPingActive`).  Finally, `onRiskRejection` notifies you if a signal is blocked by risk management. Each callback provides context like the action and strategy names, frame, and whether it's a backtest.

## Interface IAction

The `IAction` interface is your central point for managing how your trading system reacts to events. Think of it as a way to plug in your own logic to handle what happens when a signal is generated, a breakeven is reached, or other key events occur. It's designed to be flexible, letting you connect it to tools like Redux, logging systems, or even dashboards.

The interface provides several methods, each handling a specific type of event:

*   **signal**: This is the most general – it handles signals from both live and backtesting modes.
*   **signalLive**: Specifically handles signals while you're live trading.
*   **signalBacktest**: Deals only with signals generated during backtesting.
*   **breakevenAvailable**: Notifies you when a stop-loss is moved to match the entry price.
*   **partialProfitAvailable**: Signals when a partial profit level is reached.
*   **partialLossAvailable**: Signals when a partial loss level is reached.
*   **pingScheduled**: Informs you when a signal is waiting for activation based on a schedule.
*   **pingActive**: Informs you when an active signal is being monitored.
*   **riskRejection**: Notifies you when a signal is rejected due to risk validation failure.
*   **dispose**:  It's crucial to call this method when you're finished using the interface to clean up any lingering resources, like subscriptions.



By implementing these methods, you can create a highly customized and responsive trading system that does more than just generate signals – it *reacts* to them in a way that's tailored to your exact needs.

## Interface HeatmapStatisticsModel

This structure holds the overall statistics for your portfolio's heatmap. Think of it as a summary of how all your symbols are performing together.

It includes a list of individual symbol statistics, allowing you to see details for each asset. 

You’ll also find the total count of symbols in your portfolio, the combined profit and loss (Pnl) across all holdings, and key performance metrics like the Sharpe Ratio and total number of trades executed. This gives you a quick view of your portfolio's health and activity.


## Interface DoneContract

This interface, `DoneContract`, lets you know when a background process – whether it's a backtest or a live trading operation – has finished running. It provides key details about what just concluded.

You'll see this contract when a background task, initiated by either `Live.background()` or `Backtest.background()`, is complete.

It includes information like the exchange used, the name of the strategy involved, and whether the execution happened in backtest or live mode.  The symbol being traded is also part of the data, clearly identifying which asset was involved. Think of it as a confirmation and report card for your background tasks.

## Interface CriticalErrorNotification

This notification signals a very serious problem within the backtest-kit framework – something has gone wrong that requires the entire process to stop. 

It’s designed to provide details about the error so you can understand what happened. 

Each notification has a unique identifier, a human-friendly explanation of the problem, and a snapshot of the error itself, including where it occurred in the code. 

Importantly, these notifications always indicate that the error originated from a live trading context, not from the backtest simulation itself. This helps clarify that the issue isn't related to the backtesting environment.

## Interface ColumnModel

This defines a flexible way to structure and display data in tables. Think of it as a blueprint for each column you want to show.

Each column has a unique identifier called `key`, a user-friendly `label` that appears as the header, and a `format` function that transforms the underlying data into a readable string.

You can also control whether a column is displayed or not using the `isVisible` function, allowing for dynamic adjustments to the table's presentation. This makes it possible to tailor tables to different situations or user preferences.


## Interface ClosePendingCommit

This event signals that a previously created pending order should be closed. 

It’s used when you need to cancel or adjust a pending order that's been waiting to be filled.

The `action` property is always set to "close-pending" to clearly identify the type of event.

You can optionally include a `closeId` to provide a custom identifier explaining why the pending order is being closed—useful for tracking and auditing purposes.

## Interface CancelScheduledCommit

This interface lets you cancel a previously scheduled signal event. Think of it as a way to retract a plan you’ve already put in motion.

You'll need to specify that the action is a "cancel-scheduled" action.

Optionally, you can include a `cancelId` to provide a more detailed reason for the cancellation – this is useful for tracking and debugging purposes. It's like adding a note to explain why you're canceling.


## Interface BreakevenStatisticsModel

This model holds the results of breakeven analysis, giving you insights into when trades have reached a point where they’re no longer at risk.

It contains a list of individual breakeven events, each with its own specific details.

You’ll also find the total count of all breakeven events that occurred during the backtest. 

Essentially, it’s a collection of data points illustrating your breakeven performance.

## Interface BreakevenEvent

The `BreakevenEvent` provides a standardized way to track and report when trading signals reach their breakeven point. It gathers key details about the trade, including when it happened (`timestamp`), which asset was involved (`symbol`), the strategy used (`strategyName`), and the unique identifier of the signal (`signalId`).

You’ll find the type of position taken (`position`), the market price at breakeven (`currentPrice`), and the original entry price (`priceOpen`). It also includes take profit and stop loss prices, both the original levels set initially (`originalPriceTakeProfit`, `originalPriceStopLoss`) and the current levels. 

The event also contains details such as executed percentages from partial closes (`partialExecuted`), a human-readable explanation of why the signal was generated (`note`), and timestamps for when the position became active (`pendingAt`), and when the signal was first created (`scheduledAt`).  Finally, a flag (`backtest`) indicates whether the trade occurred during a backtest or in a live trading environment.

## Interface BreakevenContract

This interface describes what happens when a trading signal's stop-loss price is adjusted to the original entry price – essentially, the trade has moved into profit enough to cover its costs.

It's a notification sent out when a strategy achieves a risk reduction milestone, indicating that the potential loss on a trade has been eliminated.

The information included lets you know what trading pair, strategy, exchange, and timeframe this event relates to.

You'll also receive all the original details of the signal that triggered this, plus the current market price and whether the event occurred during a backtest or a live trade.

Finally, you get a timestamp to track when exactly this breakeven event occurred, which differs based on whether the trade is live or part of a historical backtest.

## Interface BreakevenCommitNotification

This notification is sent when a breakeven action occurs within the trading system. It provides detailed information about the trade that triggered the breakeven.

You'll find a unique identifier for the notification, along with a timestamp indicating when the breakeven happened. 

The notification also specifies whether it originated from a backtest or a live trading environment and includes details about the trading pair, the strategy involved, and the exchange used. 

It provides key price points like the entry price, take profit price, stop loss price, and their original values before any adjustments.  You'll also see timestamps related to the signal's creation and the position's activation, along with the trade direction (long or short).

## Interface BreakevenCommit

The `BreakevenCommit` represents an event where a trading position is being adjusted to breakeven. 

Think of it as a notification that the system is automatically resetting your stop-loss to the entry price, essentially protecting any profits made so far. 

This event contains all the relevant details about the trade that’s being adjusted. You'll find the current market price, whether the position is a long or short trade, the entry price, and the initially set take profit and stop loss prices. The original take profit and stop loss values are also included, letting you see how much they’ve potentially changed over time due to trailing stops.  Finally, it records when the signal was created and when the position became active.


## Interface BreakevenAvailableNotification

This notification signals that a signal's stop-loss can now be adjusted to the entry price, effectively achieving breakeven. It provides comprehensive details about the event, including a unique identifier and timestamp. 

You'll find information like the strategy and exchange involved, as well as the specific signal and trade direction (long or short). The notification also includes current market data, the entry price, and the original and adjusted take profit and stop-loss prices. Finally, it tracks the signal's lifecycle with timestamps indicating when it was created, scheduled, and when the position went pending.  Knowing whether the notification originates from a backtest or live environment is also provided.

## Interface BacktestStatisticsModel

This model holds a wealth of information about how your trading strategy performed during a backtest. It breaks down the results into key statistics to help you understand its strengths and weaknesses. 

You'll find details on every individual trade, represented by the signalList, and overall counts of winning and losing trades. 

Key performance indicators like win rate, average PNL (profit and loss), and total PNL are included, offering a clear picture of profitability. It also includes metrics for assessing risk, like standard deviation and the Sharpe Ratio – which considers both return and volatility. Finally, you'll see an estimate of yearly returns based on your backtest data. 

If any of these calculations encounter invalid numbers, they'll be represented as null, indicating an unsafe or unreliable result.

## Interface ActivePingContract

The ActivePingContract represents events that happen while a trading signal is still active and being monitored. These events, emitted regularly, give you information about the signal's lifecycle. 

Think of it as a heartbeat for your active trades – a notification that things are still running as expected. 

Here's what information is included:

*   **symbol:** The trading pair involved, like "BTCUSDT."
*   **strategyName:**  The name of the trading strategy that created the signal.
*   **exchangeName:** The exchange where the trade is happening.
*   **data:**  All the details about the pending signal itself, including important parameters like take profit and stop loss levels.
*   **backtest:**  Indicates whether the event occurred during a historical backtest or a live trade.
*   **timestamp:** The precise time of the event – either the current time in live mode or the timestamp of the candle being analyzed in backtest mode.

You can subscribe to these events to build custom logic, such as dynamically adjusting trading parameters or triggering alerts.  The `listenActivePing` and `listenActivePingOnce` functions allow you to receive these notifications and react to them.

## Interface ActivateScheduledCommitNotification

This notification tells you when a previously scheduled trading signal has been activated. It's triggered when a user manually initiates a trade based on a scheduled signal, bypassing the usual price condition.

The notification includes a unique ID and timestamp marking when the activation happened. You’ll also find details about whether the activation occurred during a backtest or in live trading.

It provides comprehensive information about the trade, including the symbol being traded, the strategy that generated the signal, the exchange used, and the specific trade direction (long or short).

You get the entry price, take profit and stop-loss prices – both the original values and the current, potentially adjusted, amounts. A timestamp reveals when the signal was initially created and when the position started pending. Finally, the current market price at the time of activation and when the notification was generated are provided for reference.

## Interface ActivateScheduledCommit

This interface describes an action to activate a previously scheduled trading signal. Think of it as confirming that a plan to trade should now be executed.

It includes details like the activation identifier, which is useful for tracking why a signal was activated. 

You'll also find key information about the trade itself, such as the current market price, the direction of the trade (long or short), and the entry price. 

Furthermore, it contains prices related to risk management – the take profit and stop loss levels, both as they currently stand and as they were initially set.  Finally, the timestamps, `scheduledAt` and `pendingAt`, record when the signal was created and when the trade is actually starting.
