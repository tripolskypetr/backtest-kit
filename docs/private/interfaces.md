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

This interface describes what happens when a walker needs to be stopped. 

It's a signal that's sent out when a walker is interrupted – think of it as a notification that a trading process is being paused. 

The notification includes important details: the trading symbol involved, the name of the specific strategy being halted, and the name of the walker itself. This last piece, the walkerName, allows you to target specific processes when stopping multiple walkers running on the same asset.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps organize and understand the outcomes of your backtesting experiments. It combines standard backtest results with extra information that allows you to easily compare different trading strategies against each other. 

Specifically, it holds an array called `strategyResults`, which contains detailed performance data for each strategy you tested. You can use this data to evaluate which strategies performed best and identify areas for improvement.

## Interface WalkerContract

The WalkerContract provides updates as your trading strategies are being compared. Think of it as a progress report during backtesting. 

It tells you what strategy just finished running, alongside key details like the exchange, symbol, and frame being tested.

You'll also get the statistics generated from that strategy's backtest, including the metric value it achieved.

The report also tracks the best-performing strategy found so far and the number of strategies tested against the total number to be evaluated. This helps you understand how far along the comparison process is and which strategies are currently leading the pack.

## Interface WalkerCompleteContract

The WalkerCompleteContract represents the conclusion of a backtesting process. It's triggered when all the strategies have finished running and all the data is ready.

Think of it as a final report card detailing how the backtest went. It contains information about which trading strategy (walker) was used, the asset being tested (symbol), the exchange and timeframe involved, and the optimization metric. 

You'll find details about the total number of strategies tested alongside the name of the strategy that performed best. Crucially, it also provides the performance score (bestMetric) and the full set of statistics (bestStats) for that top-performing strategy.

## Interface ValidationErrorNotification

This notification signals that a validation error occurred during your trading strategy's setup. 

It happens when the checks you've put in place to ensure your trading logic is sound – like verifying parameters or conditions – find something amiss. 

The notification provides a unique identifier, a detailed error message to help you understand the problem, and technical information including a stack trace to pinpoint exactly where the error occurred. 

You'll notice the `backtest` property is always false, because these errors arise during the setup phase, before any actual trading takes place.


## Interface ValidateArgs

This interface helps ensure the names you use for different parts of your backtesting setup are valid. Think of it as a way to double-check that your exchange, timeframe, strategy, risk profile, action, sizing, and parameter sweep names are correct. Each property within this interface expects a type, and that type will likely be an enumeration – essentially a predefined list of allowed values. By using this interface, you're making sure that the names you're using actually correspond to the options available within the backtest-kit system, which reduces errors and improves the overall reliability of your backtests.

## Interface TrailingTakeCommitNotification

This notification tells you when a trailing take profit order has been executed. It’s like a confirmation that your trailing stop has triggered and closed a portion or the entire position. 

It provides a ton of details about the trade, including a unique ID, the exact time it happened, and whether it was a backtest or live trade. You'll find information about the symbol traded, the strategy used, and the exchange involved.

The notification also gives you a comprehensive breakdown of the trade’s performance: the original and adjusted take profit and stop-loss prices, entry price, and crucial metrics like peak profit, maximum drawdown, and the total profit or loss. You'll see how much capital was invested, along with the entry and exit prices used for PNL calculations. Finally, there’s a field for optional notes that can describe the reasoning behind the trade.

## Interface TrailingTakeCommit

This describes a trailing take profit event within the backtest-kit framework. It represents a moment when a position's take profit level has been adjusted due to a trailing stop mechanism.

The event includes details about the adjustment itself – specifically, the percentage shift applied.  You'll find the current market price at the time of the adjustment, along with performance metrics like profit and loss (pnl), the highest profit achieved (peak profit), and the maximum drawdown experienced by the position.

The event also records essential information about the trade, such as whether it's a long or short position, the initial entry price, the current take profit and stop loss prices, and their original, unadjusted values. Finally, timestamps indicate when the signal was created and when the position was activated.

## Interface TrailingStopCommitNotification

This notification tells you when a trailing stop order has been triggered and executed. It provides a wealth of detail about the trade, including when it happened (timestamp), whether it was a backtest or a live trade, and the trading pair involved. You'll find information about the strategy and exchange that generated the signal, along with a unique identifier for both the signal and the notification itself.

The notification includes the original shift percentage used for the trailing stop, and the current market price at the time of execution. Crucially, it provides a complete picture of the position, including entry and stop-loss prices, both original and adjusted by trailing.

Beyond just the execution details, you get a full P&L breakdown for the trade. This includes peak profit, maximum drawdown, and all the key metrics related to performance, all expressed in both absolute and percentage terms.  You’ll also see information about DCA entries and partial closes, as well as timestamps related to signal creation and pending status. Finally, an optional note field allows for additional context or explanation of the signal.

## Interface TrailingStopCommit

This describes an event triggered when a trailing stop order is executed. It provides a comprehensive snapshot of the position's performance and the parameters involved in the trailing stop adjustment.

The `action` property simply identifies the event as a trailing-stop action.

The `percentShift` indicates how much the stop loss adjusted based on the percentage shift rule. 

You'll also find details about the current market price (`currentPrice`) and key performance metrics like total profit/loss (`pnl`), peak profit achieved (`peakProfit`), and maximum drawdown (`maxDrawdown`) during the position's life.

The `position` property clarifies whether the trade was a long (buy) or short (sell) position.

Crucially, it includes the entry price (`priceOpen`) and the resulting effective take profit and stop loss prices (`priceTakeProfit`, `priceStopLoss`) after the trailing adjustment, alongside their original values (`originalPriceTakeProfit`, `originalPriceStopLoss`).

Finally, `scheduledAt` and `pendingAt` timestamps offer insight into when the signal was created and when the position became active.

## Interface TickEvent

This describes the `TickEvent` data structure, a central piece for creating reports and analyzing trading activity. It bundles together all the important details about a single event, regardless of what kind of event it is (like a scheduled order, a closed position, or a cancelled signal).

Think of it as a single record containing all the information needed to understand what happened. It includes things like the exact time the event occurred, the type of event (scheduled, opened, closed, etc.), and crucial data about the trade itself – the symbol, signal ID, position type, prices, and details about take profit, stop loss, and averaging strategies. 

You’ll find profit and loss information (both realized and unrealized), performance metrics like percentage progress toward take profit or stop loss, and details about the reasons for closing or cancelling a trade.  Timestamp fields exist for different event stages, such as `scheduledAt` for when a signal was initially created or `pendingAt` when a position became active.  The structure even captures peak and fall profit/loss percentages to understand the performance over the position's lifetime. The `totalEntries` and `totalPartials` fields provide insight into the complexity of DCA or partial closing strategies employed.

## Interface SyncStatisticsModel

The SyncStatisticsModel helps you understand how your signals are syncing. It gives you a breakdown of all the sync events that have happened, providing a detailed list of each one. You can easily see the total number of syncs, and specifically how many times signals have been opened and closed. This is useful for monitoring the lifecycle of your signals and identifying any potential issues.

## Interface SyncEvent

This data structure holds all the key information about events happening during a trading strategy’s lifecycle. Think of it as a record of what's happening with a trade – when it started, why, and how it progressed.

Each `SyncEvent` contains details like the exact time, the trading pair involved, the name of the strategy, and the exchange being used. You'll find identifiers for each signal and a description of the specific action that took place, such as opening a position or closing it.

The structure also records vital pricing information: the initial entry price, take profit and stop loss levels (both original and adjusted), along with current market price.  If the strategy uses dollar-cost averaging (DCA), the number of entries and partial closes are tracked.

It also includes performance metrics like peak profit, maximum drawdown, and total profit/loss (pnl) for the trade. If the signal was closed, the reason for closure is specified. Finally, it indicates if the event occurred during a backtest, and when the event was created in the system.

## Interface StrategyStatisticsModel

This model holds the statistical information gathered during a backtest. It gives you a breakdown of different actions your strategy took, like when it bought, sold, or adjusted positions.

You'll find a complete list of all strategy events, including all the details associated with each one.

Beyond that, you can quickly see totals for specific event types, like the number of times it canceled a scheduled order, closed a pending order, or took partial profits or losses.

It also tracks events related to trailing stops and take profits, breakeven adjustments, and even actions related to average buy strategies (like Dollar-Cost Averaging). This data helps you understand how your strategy behaved during the backtest and identify areas for potential improvement.

## Interface StrategyPauseNotification

This notification tells you when a strategy has been paused or resumed. It's a way to keep track of changes to a strategy's operational status.

When a strategy is paused, it stops opening new trades, but any existing trades continue to be managed and closed as usual. Think of it as a temporary "hold" on new activity.

The notification includes details like the strategy's name, the trading symbol it’s involved with, whether it's running in backtest or live mode, and the new pause state (whether it's paused or resumed). You’ll also find timestamps for when the change occurred and when the notification was created, providing a full timeline.


## Interface StrategyEvent

This data structure holds all the important information about events happening within your trading strategy, like when a trade is opened, closed, or modified. It's designed to be used when creating reports, so you can easily understand what's happening with your strategy's performance.

Each event includes details like the exact time it occurred, the trading pair involved, the strategy's name, and the exchange being used. You’ll find specifics about the action taken – whether it’s a new trade, a partial close, or something else. It also records details like the current price, the percentage of the position being closed, and prices associated with take profit and stop loss orders, both as they are initially set and after any trailing adjustments. 

For strategies using dollar-cost averaging (DCA), the structure captures additional details like the cumulative number of entries and the overall cost of the trade. It even includes a timestamp indicating when the initial signal was created and when the position became pending. Finally, there’s a place for a note to add custom information related to a specific event.

## Interface SignalScheduledNotification

This describes a notification you'll receive when a trading signal is scheduled for future execution – think of it as a heads-up about a planned trade. The notification includes a lot of details about the upcoming trade, like the symbol being traded (e.g., BTCUSDT), the strategy that generated it, and the exchange where it will happen. You’ll find information about the trade's direction (long or short), price targets for entry, profit, and stop-loss, and even details about any DCA (Dollar Cost Averaging) strategy involved.

It also gives you insights into potential profitability and risk, including expected profit/loss, peak profit achieved so far, and maximum drawdown experienced. 

The notification also provides timestamps for when the signal was scheduled and created, and even a note that can provide a human-readable explanation for the signal’s reason. Finally, it tells you whether the signal is from a backtest (simulated trading) or live trading environment.

## Interface SignalOpenedNotification

This notification tells you when a new trade has been opened by a trading strategy. It provides a wealth of information about the trade, including a unique identifier and a timestamp of when it happened. You'll see details like whether it's a backtest or live trade, the symbol being traded (like BTCUSDT), and the strategy and exchange responsible.

The notification also breaks down the specifics of the trade itself: the direction (long or short), entry price, take profit and stop loss levels, and information about any DCA averaging or partial closes.  

Beyond the basic trade setup, you'll find performance metrics like total profit/loss (PNL), peak profit, and maximum drawdown, all expressed in both absolute dollar amounts and percentages. There are also prices associated with these metrics, allowing for a granular view of the trade's lifecycle. 

Finally, you’ll find some optional details such as a human-readable explanation ("note") or timestamps detailing when the signal was scheduled and when it became pending.

## Interface SignalInfoNotification

This notification type represents informational messages broadcast by your trading strategies. It’s a way for strategies to share details about open positions, like entry prices, take profit/stop loss levels, and performance metrics. These notifications are particularly helpful for monitoring strategies in both backtest and live modes, providing insights into their behavior and progress.

Each notification includes a lot of detail: timestamps, strategy and exchange information, position specifics (long or short, prices), and performance indicators like peak profit, maximum drawdown, and PNL. You’ll find both original and adjusted price levels, along with details on DCA entries and partial closes. The 'note' field allows strategies to provide custom messages. There’s also optional identifiers to help connect notifications with external systems and track signal scheduling.

## Interface SignalInfoContract

This interface describes information broadcasts from trading strategies, particularly when they’re sending custom messages about their actions. Think of it as a way for strategies to "shout out" important details about a trade.

The message includes the trading symbol, the name of the strategy sending it, and the exchange and frame it's happening on. Crucially, it provides the raw data associated with the signal itself, including details like stop-loss and take-profit levels, and the current market price.

You can also attach a custom note and ID to these notifications for specific purposes. The interface also specifies whether the message originates from a backtest (historical data) or live trading. Finally, a timestamp indicates when the notification occurred.


## Interface SignalEventContract

This describes how to track the lifecycle of pending trading signals within the backtest-kit framework. It provides a way to know when a signal is about to be acted upon (opened) or when it has been resolved (closed) without needing to constantly monitor all signal data.

Think of it as a notification system; you can subscribe to these notifications to learn about signal openings and closings.

The events detail crucial information about each signal, including which market it's for, which strategy created it, the timeframe being used, and all the details of the signal itself like entry and exit prices.

When a signal closes, you’ll also be told *why* it closed – whether it was due to a profit target, a stop-loss, a time limit, or user intervention. The current price at the time of the event is also provided, representing either the entry price for new signals or the closing price for completed ones. Finally, it tells you if the event originates from a backtest or live trading environment, and provides a timestamp for accurate tracking.

## Interface SignalData$1

This object holds all the key details about a single, finished trading signal used for performance analysis. It tells you which strategy created the signal, assigns it a unique ID, and identifies the symbol being traded. You’ll find information about whether the trade was a long or short position, the percentage profit or loss (PNL) achieved, and the reason the signal was closed.  Finally, it records exactly when the signal was opened and closed, providing a complete picture of its lifespan and outcome.

## Interface SignalCommitBase

This describes the fundamental information shared by every signal commit event within the backtest-kit framework. It contains details like the trading pair involved (symbol), the name of the strategy that created the signal, and the exchange where the trade happened. You'll also find information about whether the signal came from a backtest simulation or a live trading environment. 

Each signal also gets a unique ID and a timestamp reflecting when it occurred. The system tracks the number of entries and partial exits performed on a trade, and importantly, retains the original entry price, even as DCA averaging is applied. Finally, the complete signal data and an optional explanatory note are included for clarity and debugging.

## Interface SignalClosedNotification

This notification tells you when a trading position has been closed, whether it was a take profit, stop loss, or timed out. It provides a wealth of information about the trade, including a unique identifier, when it happened, and whether it occurred during a backtest or live trading.

You'll find details like the trading pair, the strategy used, and entry/exit prices, along with the original take profit and stop-loss levels that were initially set. The notification also breaks down the profit and loss, including peak profit and maximum drawdown figures, along with relevant prices and costs. It also gives you insight into DCA entries, partial closes, and the duration of the position. Finally, a note field allows for a brief description of why the position was closed.

## Interface SignalCancelledNotification

This notification lets you know that a trading signal that was planned for execution has been cancelled before it actually took place. It provides a lot of detail about the cancelled signal, helping you understand why it didn't execute.

You’ll find information like a unique ID for the cancellation, the exact time it was cancelled, and whether the cancellation happened during a backtest or live trading. 

The notification also includes the trading symbol, the strategy that generated the signal, and specifics about the intended trade – like the planned take profit and stop-loss prices, the intended direction (long or short), and details about any DCA (Dollar Cost Averaging) strategies involved. Crucially, it explains *why* the signal was cancelled – perhaps due to a timeout, a price rejection, or a manual cancellation by a user. The notification even tells you how long the signal was scheduled before it was cancelled.

## Interface Signal

This `Signal` object holds all the information related to a specific trade. 

It tracks the initial entry price, which is simply the price at which you first bought or sold an asset.

Crucially, it also maintains a history of entries made for this signal, recording not only the price but also the cost and timestamp for each.

Finally, it keeps a record of any partial exits, noting the type (profit or loss), percentage, current price, cost basis at the time of closing, number of units closed, and timestamp.

## Interface Signal$2

This `Signal` object represents a trading signal and holds important data about a trade. 

It tracks the initial entry price for the position using the `priceOpen` property. 

The `_entry` array stores details about each entry point into the position, including the price, cost, and timestamp of the entry. 

You'll also find the `_partial` array here, which logs information about any partial exits taken during the trade, such as the reason (profit or loss), percentage, current price, cost basis, entry count, and timestamp. These details allow you to review and analyze how your trading strategies perform over time.

## Interface Signal$1

The `Signal` object represents a trading signal and holds key information about its execution. It tracks the initial entry price of a position with the `priceOpen` property, which tells you at what price the trade was initiated.

Internally, it maintains records of entries made, stored in the `_entry` array. Each element in this array details a specific entry event, including the price, total cost, and the time it occurred. 

Similarly, the `_partial` array captures details regarding partial exits from the position, whether they resulted in profit or loss.  Each partial exit record includes information like the exit type, percentage gain/loss, the price at the time of exit, cost basis at the time of exit, the entry count at the time of exit and the timestamp of the event.

## Interface ScheduledEvent

The `ScheduledEvent` object is designed to hold all the important information about events within a trading system – when they were scheduled, opened, or cancelled. Think of it as a complete record for each trade action.

It includes details like the exact time of the event, what type of action occurred (scheduled, cancelled, or opened), and the specifics of the trade itself, such as the trading pair, signal ID, position type, and any notes attached to the signal.

You’ll find pricing information like the entry price, take profit levels, and stop-loss orders, alongside any original prices before modifications. 

It also tracks data related to DCA (Dollar Cost Averaging) strategies, including the number of entries and partial closes, along with the total executed percentage.

For cancelled events, you’ll find reasons for the cancellation, and for opened events, a record of when the position became active. Finally, it contains PNL (Profit and Loss) data and duration information for certain events.

## Interface ScheduleStatisticsModel

The `ScheduleStatisticsModel` gives you a clear picture of how your scheduled trading signals are performing. It contains a complete list of all scheduled, opened, and cancelled events, along with key numbers like the total number of signals in each state.

You’ll find metrics detailing your cancellation rate – the percentage of signals that were cancelled – which you want to keep low. Activation rate, indicating the percentage of signals that successfully activated, is another important metric you’ll want to be high.

The model also provides insights into timing, showing you the average wait time before cancelled signals were cancelled and the average time before activated signals were opened. This helps you understand the efficiency and responsiveness of your scheduled trading system.


## Interface SchedulePingContract

This describes events that happen regularly while a trading strategy is actively monitoring a signal – think of it as a heartbeat. These "schedule ping" events occur every minute when a signal is being monitored but hasn't yet been completed (either cancelled or activated).

Each ping includes information like the trading pair (symbol), the strategy’s name, the exchange it's running on, and the timeframe being used. You’ll also receive all the detailed data related to the signal itself, as well as the current price. 

There's a flag indicating whether this ping comes from a backtest (historical data) or live trading. Finally, the event includes a timestamp, which is the time of the ping in live mode or the candle's timestamp during backtesting.

This allows you to create custom checks or actions, like automatically cancelling a signal if the price deviates too much from the initial price. You can subscribe to these ping events to react to the ongoing monitoring process.

## Interface ScheduleEventContract

This framework provides a way to keep track of scheduled trading signals without needing to monitor the entire signal stream. It focuses on when a signal is initially scheduled or removed before it ever becomes active.

You can listen for these events to understand the lifecycle of a scheduled signal – when it's added to the schedule and when it's canceled.

The `ScheduleEventContract` gives you information about these changes, including the symbol being traded, the strategy involved, the timeframe, and the data associated with the signal. If a signal is cancelled, you'll also know *why* it was cancelled (like a timeout, price rejection, or user action). 

It also includes the current market price at the time of the event and whether it happened during a backtest or live trading session. Think of it as a notification system specifically for the scheduling and cancellation of signals.

## Interface RiskStatisticsModel

This model holds statistics related to risk events, giving you insights into how often and where risks are being triggered. 

It collects data on individual risk events, providing a detailed list of each one.

You can see the total number of times risk rejections occurred overall.

The model breaks down those rejections, showing you how many happened for each specific trading symbol.

It also organizes rejections by the trading strategy that initiated them, helping you pinpoint which strategies might be encountering issues.

## Interface RiskRejectionNotification

This notification tells you when a trading signal was blocked due to risk management checks. It's a way for the system to let you know why a potential trade didn't happen.

Each notification has a unique ID and a timestamp, so you can track when these rejections occur. It also specifies which strategy, exchange, and symbol were involved.

You'll get a clear explanation in `rejectionNote` as to *why* the signal was rejected. The system includes details like the number of active positions, the current price, and even the intended entry, take profit, and stop-loss prices if available.

Information about the signal itself, like its ID, direction (long or short), and an optional note describing its purpose, is also provided.  Finally, the system will tell you if the rejection happened during a backtest or a live trading session and the time the notification was created.

## Interface RiskEvent

The `RiskEvent` object holds information about trading signals that were blocked due to risk management rules. Think of it as a record of when the system decided *not* to execute a trade. 

Each `RiskEvent` includes details like the exact time the event occurred (timestamp), the trading pair involved (symbol), and the specific signal that was rejected. You'll also find the name of the strategy making the decisions, the exchange being used, the timeframe being analyzed, and the current market price. 

Crucially, it also tells you how many positions were already open when the signal was rejected, a unique identifier for the rejection itself, and a note explaining *why* the signal was blocked. Finally, it specifies whether the event occurred during a backtest or live trading.

## Interface RiskContract

The RiskContract represents a signal that was blocked due to a risk validation failure during trading. It provides detailed information about why a signal wasn't executed, which is helpful for monitoring and improving your risk management.

You'll find details like the trading pair symbol (e.g., BTCUSDT), the specifics of the signal itself (position size, prices), the strategy that requested the trade, and the frame used during backtesting.

It also includes information about the market price at the time of the rejection, the number of existing active positions, and a unique ID for tracking the event. A human-readable note explains the reason for the rejection, and a timestamp marks precisely when it happened. Finally, a flag indicates whether this occurred during a backtest or live trading session. This data enables services like report generation and allows you to set up notifications for when risk limits are triggered.

## Interface ProgressWalkerContract

The `ProgressWalkerContract` helps you monitor the progress of long-running background tasks within the backtest-kit framework. It's like a status report you receive while a process is running, letting you know how far along it is.

Each report includes details like the name of the process (walker), the exchange being used, the frame configuration, and the trading symbol involved.

You'll see information about the total number of strategies being evaluated, how many have been processed so far, and a percentage indicating the overall completion. This gives you a clear picture of how much work is left to be done.


## Interface ProgressBacktestContract

This contract provides updates on the progress of a backtest as it runs. You'll receive events based on this contract when a backtest is in progress, giving you details about what's happening. 

It tells you the name of the exchange being used, the strategy being tested, and the trading symbol involved. The most important information is the total number of historical data points (frames) the backtest will analyze, how many have been processed already, and the percentage of completion. This allows you to monitor the backtest’s advancement and estimate how much time is left.


## Interface PerformanceStatisticsModel

This model holds a collection of performance statistics related to a specific trading strategy. It tells you the strategy's name, the total number of performance events recorded, and the overall execution time.

You’ll also find a breakdown of statistics organized by the type of metric being measured. 

Finally, it includes a full list of the individual performance events, allowing for detailed analysis and debugging. Essentially, it's a comprehensive record of how a strategy performed.

## Interface PerformanceContract

The PerformanceContract helps you understand how your trading strategies and system are performing over time. It's like a detailed log that records key moments during a trade execution, allowing you to pinpoint where things might be slow or inefficient.

Each entry in the log – a PerformanceContract – includes when the event happened, how long it took, and what kind of action was being performed.  You’ll find information like the strategy name, the exchange used, and the trading symbol involved.

It distinguishes between backtesting (testing your strategy with historical data) and live trading, which is useful for comparing performance in different environments. The `previousTimestamp` enables you to calculate durations between events, which can be especially helpful for identifying bottlenecks. This contract provides valuable data for profiling your system and optimizing its performance.


## Interface PauseContract

This interface describes the events triggered when a trading strategy is paused or resumed. It's designed to let external systems, like notification services, know when a strategy stops or starts automatically trading. 

The event tells you which trading symbol is affected, whether the strategy is now paused or active, and when the change happened. It also provides the strategy's name, the exchange being used, the timeframe of the trading, and importantly, whether this is a live trading event or part of a backtest. You can use this information to tailor notifications – for example, you might handle backtest pause events differently than live trading pauses.

## Interface PartialStatisticsModel

This model helps you understand the results of your trading strategy by breaking down the events that occurred during backtesting. It keeps track of every profit and loss event, allowing you to analyze how your strategy performs at different milestones. 

The `eventList` property contains a detailed record of each individual event, providing the most granular level of information.  You’ll also find `totalEvents`, which simply counts everything, and `totalProfit` and `totalLoss`, giving you a quick view of how many events were profitable versus losing. These metrics are key to assessing strategy performance.

## Interface PartialProfitContract

The `PartialProfitContract` describes the notifications you'll receive when a trading strategy reaches a predefined profit milestone during its execution. Think of it as a progress report on how well a trade is performing. It’s used to keep track of how much profit a strategy has made at various stages, like 10%, 20%, and so on.

Each notification contains detailed information, including the trading symbol, the name of the strategy involved, and the exchange used. You'll also find the original signal data, the current price, the specific profit level achieved, and whether it's a backtest simulation or live trading.  The timestamp tells you exactly when that milestone was reached, either reflecting the real-time market or the historical candle data. These notifications are essential for understanding strategy performance and generating reports.  Events are only sent once for each level, even if prices move quickly and trigger multiple levels in a single market update.

## Interface PartialProfitCommitNotification

This notification tells you when a partial profit commitment has been executed within a trading strategy, whether it's a backtest or a live trade. It provides a wealth of detail about the trade, including a unique identifier, the timestamp of the action, and whether it occurred during backtesting.

You'll find specifics about the trading pair (like BTCUSDT), the strategy used, and the exchange involved. The notification details the percentage of the position closed, the current price at the time of execution, and the trade direction (long or short).

Beyond the immediate execution, it includes historical data like the entry price, take profit and stop-loss levels (both original and adjusted), and the total number of entries and partial closes.

A key section details the Profit and Loss (PNL) information for the entire position, including peak profit, maximum drawdown, and associated prices and costs. You’ll also get information about the investment amount and prices for peak profit and drawdown events.

Finally, there’s an optional note for extra context, along with timestamps detailing when the signal was scheduled, pending, created, and when this specific notification was generated. This comprehensive data set provides complete transparency into the partial profit execution.

## Interface PartialProfitCommit

This data represents a partial profit taking action within your trading strategy backtest. It details how a portion of your existing position is being closed, providing key information about the trade’s performance up to that point.

The `action` property confirms this is a partial profit-taking event. 

You'll find the percentage of the position being closed in `percentToClose`. 

Crucially, the data includes the `currentPrice` at the time of the action and the overall Profit & Loss (`pnl`) of the closed portion of the trade.

The data also tracks the position's history, allowing you to see the `peakProfit` it reached, the `maxDrawdown` experienced, and the original entry `priceOpen`.

Additional information like the `priceTakeProfit`, `priceStopLoss`, and their original, untrailed values (`originalPriceTakeProfit`, `originalPriceStopLoss`) are provided.

Timestamps, `scheduledAt` and `pendingAt`, show when the signal was created and when the position originally became active. This allows for precise analysis of timing and execution.

## Interface PartialProfitAvailableNotification

This notification signals that a partial profit milestone has been achieved during a trade, like reaching 10%, 20%, or 30% profit. It’s a way to track progress and understand how a trade is performing. The notification includes details like a unique ID, when it occurred, and whether it’s from a backtest or live trade.

You’ll find information about the trading pair involved, the strategy used, and the exchange where the trade took place. Critically, it shows the entry price, the current market price at the milestone, and the effective take profit and stop loss prices – including any trailing adjustments.

The notification also provides insight into the trade’s performance, including total profit/loss, peak profit, maximum drawdown, and key pricing details. You'll find details on the total number of entries and partial closes executed. It also shows information about how many entries were involved and total capital invested.  Finally, there’s an optional note field for a human-readable explanation of why the signal occurred.

## Interface PartialLossContract

The `PartialLossContract` helps you keep track of when a trading strategy hits predefined loss levels, like -10%, -20%, or -30% drawdown. It's a notification that gets sent when a strategy’s losses reach a specific milestone.

Each notification includes key details such as the trading pair (symbol), the name of the strategy, and the exchange and frame it’s running on. You’ll also get the original signal data, the current price, and the exact loss level reached, all recorded with a timestamp.

Importantly, these notifications are only sent once for each loss level per signal, even if the market moves quickly. The `backtest` flag tells you whether the event occurred during a historical simulation or a live trade, and the `timestamp` indicates when that level was triggered – either during a live tick or based on a historical candle. These notifications are used for generating reports and allowing users to react to strategy drawdown.

## Interface PartialLossCommitNotification

This notification signals that a portion of your trading position has been closed. It provides a wealth of information about the closure, including a unique ID, the exact time it occurred, and whether it happened during a backtest or live trading. You'll find details about the trading pair, the strategy and exchange involved, and the percentage of the position that was closed.

The notification also details key price points like the current price, entry price, take profit, and stop loss levels, along with their original values before any adjustments. It tracks the number of entries and partial closes executed, and importantly, provides a comprehensive look at the position's performance.

You can review the total profit/loss (both in USD and as a percentage), peak profit achieved, maximum drawdown, and the prices and entry counts associated with those events. It also gives you the total capital invested and the effective prices used in the PNL calculations, taking into account fees and slippage. A note field allows for additional context or reasoning behind the partial closure. Finally, several timestamps are provided detailing signal creation, pending state, and the notification creation time.

## Interface PartialLossCommit

This data represents a partial loss event occurring during a trading strategy's execution. It details the action taken, which is a partial closure of a position.

The `percentToClose` property specifies what portion of the position is being closed, expressed as a percentage.  Alongside the price at the time of the action (`currentPrice`), the record also provides a snapshot of the position's performance.

You'll find comprehensive profit and loss information, including the total PNL (`pnl`), the highest profit achieved (`peakProfit`), and the largest drawdown experienced (`maxDrawdown`) before the partial loss.

The `position` property indicates whether it was a long or short trade. Further details include the initial entry price (`priceOpen`), intended take profit (`priceTakeProfit`, along with its original value `originalPriceTakeProfit`), and stop-loss prices (both effective `priceStopLoss` and original `originalPriceStopLoss`). Timestamps for signal creation (`scheduledAt`) and position activation (`pendingAt`) are also included.

## Interface PartialLossAvailableNotification

This notification signals that a trading strategy has reached a predefined loss milestone, like a 10% or 20% drawdown. It provides detailed information about the event, including a unique identifier, the exact time it occurred, and whether it's happening during a backtest or live trading. You'll find specifics about the trading pair, the strategy involved, the exchange used, and the trade’s direction (long or short).

The notification breaks down key pricing details like the original entry price, the current market price, and any trailing adjustments to the take profit and stop loss levels. It also includes comprehensive performance data. 

You can see the total number of entries and partial closes, plus vital metrics like total profit/loss (both in USD and as a percentage), peak profit achieved, maximum drawdown experienced, and even the prices at which those peaks and troughs occurred. It also tells you how many entries were made at the peak profit or maximum drawdown. Finally, a note field provides optional, human-readable context for the signal, and several timestamps track the signal’s creation and activation.

## Interface PartialEvent

This data structure represents key information about profit and loss milestones during a trade. It collects details like the exact time of the event, whether it's a profit or a loss, and the trading pair involved. You'll find information about the strategy and signal that triggered the trade, along with specifics about the position itself, including the current price and the original take profit and stop-loss levels.

For trades involving dollar-cost averaging (DCA), you’ll see details such as the total number of entries and the original entry price before averaging. Information about partial closes is included to track how much has been executed. 

It also holds unrealized profit and loss (PNL) data, a human-readable note explaining the trade's reasoning, and timestamps related to when the position became active and when the signal was initially created. Finally, it indicates whether the trade occurred in backtest or live mode.

## Interface OrderSyncOpenNotification

This notification tells you when a trading position has been opened, providing a wealth of information about the trade. It’s triggered either when an order is filled immediately or when a resting order is placed as part of a scheduled signal.

You'll find details like the unique ID of the notification, the exact time the signal was opened, and whether it originated from a backtest or live trading environment. It includes the trading pair, the strategy that generated the signal, and the exchange used.

The notification also contains important performance metrics, like total profit/loss (PNL), peak profit achieved, maximum drawdown, and the prices associated with these values.  You can see how much was invested, the entry price, and details about any take profit and stop loss orders. 

Additional details include the number of entries made (useful for strategies using dollar-cost averaging), the timestamp when the signal was initially scheduled, and an optional note providing context for the trade. Finally, you can see when the position actually became active and the creation time of the notification itself.

## Interface OrderSyncCloseNotification

This notification lets you know when a trading signal has been closed, whether it was due to a profit target being reached, a stop-loss triggered, time expiration, or a manual closure. It provides a wealth of information about the closed position, including when it was created and activated, the trading pair involved, and which strategy generated it. You’ll find detailed performance metrics like profit and loss (both absolute and percentage), peak profit, and maximum drawdown, along with the prices at which those levels were achieved. The notification also outlines the number of entries and partial closes executed during the trade, and importantly, explains *why* the signal was closed. It distinguishes between backtesting and live trading environments and includes the original and adjusted prices for entry, take profit, and stop loss.

## Interface OrderSyncCheckNotification

This notification provides a snapshot of an open order's status, specifically designed for live trading and backtesting. It’s triggered periodically to ensure the order is still active on the exchange, acting as a "ping" to the external order management system. To prevent being overwhelmed, these notifications are throttled – you’ll only receive one for each signal every 15 minutes.

The notification includes a wealth of detail about the position, such as the trading symbol, the strategy that generated the signal, and the exchange it’s on. You'll find key pricing information, including original and adjusted prices for take profit and stop loss levels, along with details about DCA averaging and partial closures.

Crucially, it also contains comprehensive P&L information, tracking unrealized profit/loss, peak profit, and maximum drawdown—all providing a detailed view of the position’s performance. Timestamp information and optional notes further enrich the context of the order's status. This information is invaluable for monitoring order synchronization and understanding the performance characteristics of your trading strategies.

## Interface OrderSyncBase

OrderSyncBase provides common information shared across different order synchronization events within the trading framework. These events relate to either active orders (like opening, filling, and closing) or scheduled orders placed when a signal is initially created.

The `type` property indicates whether the event is related to an active order or a scheduled order. Each event carries details like the trading symbol, the name of the strategy that generated the signal, the exchange used, and whether the signal originated from a backtest or live trading environment.

A unique signal identifier (`signalId`) and timestamp are also included, alongside the full details of the public signal itself. The `attempt` property tracks consecutive failures of an order attempt; the framework automatically manages this count to control retry behavior. This helps the system handle transient errors and ensures orders are placed reliably.

## Interface OrderOpenContract

This event lets you know when a limit order has been filled and a position is officially open. It’s particularly useful if you're connecting backtest-kit to external systems that manage orders, ensuring everything stays in sync.

During backtesting, this event is triggered when the price hits the expected level – lower than the entry price for a long position or higher than the entry price for a short position. In live trading, it signals that the exchange has confirmed the order.

The event provides a wealth of information, including the price at which the position was opened, the total profit and loss (PNL), peak profit, maximum drawdown, and the original entry and stop-loss prices. You'll also find details about any averaging or partial closes that might have occurred. 

It also contains the timestamps for when the order was initially scheduled and when it actually activated. The `totalEntries` and `totalPartials` properties indicate if and how many DCA entries or partial closures were involved.


## Interface OrderCloseContract

This event signals that a trading signal has been closed, whether automatically due to a profit target, a stop-loss trigger, or manually by a user. It provides a wealth of information about the closed position, making it useful for external systems that need to track and manage orders.

You’ll find details about the closing price, the overall profit and loss (both total and peak), and key prices like the original take profit and stop loss levels, as well as the prices used at the time of close. It also tells you the trade direction (long or short), the time the signal was created and activated, and crucially, *why* the signal was closed.

For positions that used dollar-cost averaging (DCA), it details the number of entries and partial closes that occurred during the trade’s lifecycle. This information allows external order management systems to reconcile positions, update records, and ensure accurate reporting of trading activity.

## Interface OrderCheckContract

The `OrderCheckContract` event is a crucial signal emitted during the trading process. It essentially asks your external order management system if an order associated with a signal is still active on the exchange. This happens both when a position is open (an "active" signal) and when waiting for an order to activate (a "schedule" signal).

The framework relies on your response to this ping. If your system confirms the order is still open, the monitoring continues. If not (e.g., the order was filled, cancelled, or liquidated externally), the framework will take action, potentially closing or canceling the signal. Transient issues like network blips are tolerated with retries, but persistent problems lead to order termination.

Keep in mind that this event isn't triggered during backtesting, as there's no real exchange involved.

The event carries a wealth of information about the signal and associated position, including timestamps, pricing data, P&L, and order details.  The `attempt` property tracks how many consecutive times the check has failed, allowing the system to handle temporary issues before taking more drastic action. This contract helps ensure synchronization between your trading logic and the actual state of orders on the exchange.

## Interface MetricStats

`MetricStats` provides a collection of key performance data for a specific measurement type, like order execution time or message processing duration. It essentially bundles together several statistical summaries of that measurement.

You'll find the `metricType` to identify what's being measured. Then, a range of statistics are available, including the number of measurements recorded (`count`), the total time taken across all measurements (`totalDuration`), and common metrics like average, minimum, and maximum values (`avgDuration`, `minDuration`, `maxDuration`).

To help understand the distribution of the data, the statistics also include the standard deviation (`stdDev`), median (`median`), and percentiles like the 95th and 99th (`p95`, `p99`). Finally, it gives information about the time between events with `avgWaitTime`, `minWaitTime`, and `maxWaitTime`.


## Interface MessageModel

This defines what a message looks like in a conversation with a language model. Think of it as the building block for the entire chat history.

Each message has a `role` which tells us who sent it - whether it's the system giving instructions, a user making a request, the assistant giving a response, or a tool providing a result.  The `content` is the actual text of the message, and some providers also include `reasoning_content` which allows you to see the assistant's thought process.

Assistant messages can also include `tool_calls`, letting you know if the assistant used a tool to help formulate the response.  If the message contains an image, it can be provided in different formats like base64 strings or image files.  Finally, `tool_call_id` links a message specifically to a tool call it’s responding to.

## Interface MaxDrawdownStatisticsModel

This model holds information about maximum drawdown events that occurred during a trading simulation. 

It keeps track of each drawdown event in a list called `eventList`, which is ordered from the most recent to the oldest. 

You can also see the total number of drawdown events recorded through the `totalEvents` property. Essentially, this provides a complete picture of the worst performance periods observed during your backtest.

## Interface MaxDrawdownEvent

This describes a single record of a maximum drawdown experienced during a trade. Each record holds a lot of information about what happened. 

You’ll find the exact time the drawdown occurred, identified by a Unix timestamp. The symbol being traded, the name of the strategy that generated the trade, and a unique identifier for the signal are also included.

The record specifies whether the position was long or short. It also details the total profit and loss (PNL) for the trade, the highest profit achieved, and the maximum drawdown itself, expressed in PNL terms. 

Additional information such as the current price at the time of the record, the entry price, and any set take profit or stop loss levels are also present. Finally, it indicates if the event occurred during a backtesting simulation.

## Interface MaxDrawdownContract

This contract provides details when a new maximum drawdown is observed for a trading position. It allows you to track how much a position's value has declined from its peak.

The information includes the trading symbol, the current price, a timestamp, and names of the strategy, exchange, and frame being used. 

You'll also get the signal data related to the position and a flag to indicate whether this drawdown event occurred during a backtest or live trading. 

This data is helpful for implementing risk management strategies, such as adjusting stop-loss orders or managing overall position size in response to significant drawdowns.

## Interface LiveStatisticsModel

This model provides a detailed snapshot of your trading performance, offering a wide range of statistics derived from your live trades. It essentially collects all the events – from initial setup to closing a trade – and calculates key metrics to help you understand how well your strategy is doing.

You'll find everything from basic counts like total trades, wins, and losses to more sophisticated measures like the Sharpe Ratio, which assesses risk-adjusted returns, and expectancy, which projects potential profit per trade. There's also a breakdown of volatility (standard deviation), and directional pressures (buyer/seller) giving you insight into market behavior.

The model goes beyond simple averages, including metrics like median PNL to identify potential skewness in your trade distribution. You can also analyze consecutive win/loss streaks, average trade durations, and step size to understand patterns in your trading behavior. The trend properties indicate the overall direction and strength of the market based on historical data.



Essentially, it's a toolbox to not just see *if* you’re making money, but *why* and how to potentially improve your strategy. Note that any numerical values can be null if the calculation isn't safe due to factors like division by zero or other mathematical anomalies.

## Interface InfoErrorNotification

This component handles notifications about errors that occur during background processes, but which aren't critical enough to halt the whole system. 

Each notification has a unique identifier (`id`) and a user-friendly explanation of what went wrong (`message`). 

The `error` property contains detailed information about the problem, including a stack trace and any extra data. 

It’s important to note that these notifications are specific to the running environment; the `backtest` flag will always be false. The `type` property distinguishes this notification from others.

## Interface IdlePingContract

This interface describes what happens when a trading strategy isn't actively making moves – essentially, when it's "idle."

It's a notification sent when a strategy isn't monitoring any active signals. Think of it as a heartbeat letting you know the strategy is just sitting, waiting.

The event provides details like the trading pair involved (e.g., BTCUSDT), the name of the strategy, and the exchange it's running on. 

You'll also get the current market price and a flag indicating whether this event came from a backtest (historical data) or live trading. Finally, a timestamp tells you exactly when this idle ping occurred.


## Interface IWarmCandlesParams

This defines the information needed to request a set of historical candles. Think of it as the blueprint for telling the system exactly which candles you want to download and store for later use, like before running a backtest. You’ll specify the trading pair (like BTCUSDT), the exchange providing the data, the timeframe of the candles (like 1-minute or 4-hour), and the start and end dates you're interested in. This lets the system efficiently gather the necessary data to prepare for your analysis.

## Interface IWalkerStrategyResult

This interface defines the output for a single strategy when running a backtest comparison. It bundles together essential information about the strategy's performance.

You'll find the strategy's name here, along with detailed statistics calculated during the backtest process. A key value, often a custom metric used to judge performance, is also included. Finally, the `rank` property shows how the strategy performed relative to others in the comparison, with a lower number indicating a better result.

## Interface IWalkerSchema

The IWalkerSchema defines how to set up A/B tests comparing different trading strategies. 

Think of it as a blueprint for running a controlled experiment on your strategies. 

It lets you specify a unique name for your test setup, add a helpful note for yourself, and choose the exchange and timeframe to use for all strategies involved. 

You’ll also list the names of the strategies you want to compare – those strategies need to be registered separately. You can choose which metric, like Sharpe Ratio, to use for evaluating the strategies.  Finally, you can even provide callback functions to react to different stages of the backtesting process.


## Interface IWalkerResults

The `IWalkerResults` object holds all the information gathered after a complete backtesting walk, essentially summarizing the results of comparing different strategies. It tells you which asset, or symbol, was being tested. You'll also find the name of the exchange the tests were run on. The `walkerName` identifies the specific testing process used, and `frameName` indicates the time frame used for the analysis. It's a central container for understanding the context of a backtest run.


## Interface IWalkerCallbacks

This interface lets you hook into the backtest process and get notified about key events. Think of it as a way to observe what's happening as the backtest kit runs different strategies.

You can receive notifications when a strategy test begins (`onStrategyStart`), when it finishes (`onStrategyComplete`), or if an error occurs during the testing (`onStrategyError`). 

Finally, `onComplete` will let you know when the entire backtest run is finished, providing you with a summary of the results. These callbacks give you flexibility to monitor performance, log data, or perform custom actions during the backtest.


## Interface ITrailingTakeCommitRow

This interface represents a queued action related to trailing take commit strategies. Think of it as a record of a change that needs to happen in your trading strategy.

It tells the system that the action being taken is a "trailing-take" maneuver, which means adjusting a stop-loss order based on price movement.

The `percentShift` property defines how much the price should shift, expressed as a percentage. Finally, `currentPrice` keeps track of the price level at which the trailing action was initially set.

## Interface ITrailingStopCommitRow

This interface describes a queued action related to a trailing stop order. Think of it as a record of a change that needs to happen concerning a trailing stop.

It includes the type of action, which is always "trailing-stop" to identify it. 

You'll also find the percentage shift that was applied to the trailing stop, and the price at which the trailing stop was initially set. These values provide context for the action being taken.

## Interface IStrategyTickResultWaiting

This type represents a tick result specifically for a scheduled trading signal that’s currently waiting for the price to reach a specific entry point. You’ll receive this type of result repeatedly as the system monitors the signal. It's distinct from the "scheduled" result, which is only sent when the signal is initially created.

The data includes the signal itself, the current price being monitored, the name of the strategy, and details about the exchange, time frame, and trading symbol.  You’ll also see the percentage progress towards your take profit and stop loss – these will always be zero for signals still in the waiting phase.

The result also provides unrealized profit and loss information (which is currently theoretical since the position isn't active yet), an indicator of whether you're in backtest or live mode, and the timestamp of when this result was generated. This allows you to track the progress and status of your scheduled signals as they wait for activation.


## Interface IStrategyTickResultScheduled

This data represents a signal that's been scheduled – meaning the strategy has identified a potential trading opportunity and is waiting for the price to reach a specific entry point. It’s a notification you receive when the strategy generates a signal and prepares to execute based on price conditions.

The information included tells you what action triggered the result, which signal is waiting, and details about the strategy and the market. You'll find the strategy's name, the exchange it’s operating on, the time frame being used, the symbol being traded, and the price at the time the signal was scheduled.

It also indicates whether the event happened during a backtest or live trading, and a timestamp marking when the result was created. Essentially, it’s a record of a potential trade being set up, waiting for the right price.


## Interface IStrategyTickResultOpened

This object represents what happens when a new trading signal is created within your strategy. It's a notification that a signal has been generated, validated, and saved. 

You'll receive this notification immediately after the signal is successfully processed.

Here's what the notification contains:

*   The signal itself, complete with its unique identifier.
*   The name of the strategy that generated it.
*   The exchange and timeframe being used.
*   The symbol of the trading pair involved (like BTCUSDT).
*   The current VWAP price at the time the signal was opened.
*   A flag to indicate whether this event originated from a backtest or a live trading environment.
*   A timestamp marking exactly when this event occurred.

## Interface IStrategyTickResultIdle

This interface describes what happens when your trading strategy is in a "resting" or "idle" state—meaning it's not currently giving any trading signals. It provides information about the circumstances of that idle period. 

You'll find details like the strategy's name, the exchange it's connected to, the timeframe being used (like 1-minute or 5-minute candles), and the trading symbol. Importantly, it also records the current price at that moment and whether the system is running in backtesting mode or live trading mode. A timestamp indicates precisely when the idle event occurred. The signal itself is recorded as null to confirm the absence of a trading signal during this state.

## Interface IStrategyTickResultClosed

This interface describes the data you receive when a trading signal closes, providing a comprehensive snapshot of what happened. It includes information like the closing price, the reason for the closure (like a stop-loss being hit or time expiring), and the profit or loss generated. 

You'll find details such as the strategy’s name, the exchange used, the trading timeframe, and the symbol being traded.

The data also indicates whether this closure occurred during a backtest or in live trading, and if the closure was manually initiated, a unique closing ID is provided. Finally, a timestamp records when this result was generated. This allows for detailed analysis and review of past trades.


## Interface IStrategyTickResultCancelled

This interface describes what happens when a trading signal is cancelled before a trade actually takes place. Think of it as a notification that a signal was scheduled but didn't lead to an open position – maybe the signal expired, or a stop-loss was triggered before the signal could activate.

It provides details about the cancelled signal itself, along with information about the price, the time the cancellation happened, and the trading environment (strategy, exchange, timeframe, symbol, backtest vs. live mode).  You'll find a reason explaining why the signal was cancelled, and even an optional ID if the cancellation was initiated by a user-requested stop. Finally, it includes a timestamp marking when the cancellation record was created.


## Interface IStrategyTickResultActive

This interface describes a specific kind of event that happens when a trading strategy is actively managing a position. It signifies that the strategy is watching a signal and waiting for either a take profit (TP), stop loss (SL), or a time expiration to occur.

The data includes details like the name of the strategy and the exchange being used, as well as the trading symbol and time frame.  You'll also find information about how far the position is from its TP or SL, represented as percentages.  

The `signal` property tells you exactly which signal is being monitored. The `currentPrice` represents the price being tracked for TP/SL.

Crucially, it includes the unrealized profit and loss (`pnl`) considering fees, slippage, and any partial closes that might have happened.  The `backtest` flag indicates whether this data is coming from a historical backtest or a live trading environment.  Timestamps are provided for tracking when the event occurred and when the last candle was processed, useful for backtesting processes.

## Interface IStrategySchema

The IStrategySchema defines how a trading strategy functions within the backtest-kit framework. It’s essentially a blueprint that tells the system how to generate trading signals.

Each strategy has a unique name for identification. 

You can add notes to help other developers understand the strategy's purpose.

The `interval` property controls how often the strategy can request signals, preventing it from overwhelming the system.

The core of the strategy lies in the `getSignal` function, which calculates a signal based on the current market conditions – it’s what determines when to buy or sell. This function can handle signals that are triggered immediately based on the current price or be scheduled to occur when a certain price level is reached.

You can optionally provide lifecycle callbacks (`callbacks`) for specific events such as when a trade opens or closes.

You can associate a risk profile (`riskName` or `riskList`) with the strategy for risk management purposes.

Furthermore, you can tag a strategy with specific actions (`actions`) and provide runtime data (`info`) for custom monitoring or other logic.

## Interface IStrategyResult

The `IStrategyResult` helps you organize and compare the results of different trading strategies after a backtest. It bundles together essential information like the strategy's name, a comprehensive set of backtest statistics, and the value of the metric you're using to evaluate performance. You'll also find timestamps marking when the first and last signals were generated, which can be useful for understanding the strategy's activity window. This structure is perfect for building comparison tables and identifying top-performing strategies.

## Interface IStrategyPnL

This interface represents the profit and loss result for a trading strategy. It details how much money you made or lost, taking into account a small fee (0.1%) and slippage (0.1%). 

You'll find the profit/loss expressed as a percentage – a positive number means you're in the green, and a negative number means you're in the red.

The `priceOpen` and `priceClose` properties show the actual entry and exit prices after factoring in those fees and slippage, giving you a more realistic view of your trades.

The interface also provides the absolute profit/loss amount in USD, calculated from the percentage and the total amount you initially invested (`pnlEntries`). Finally, `pnlEntries` tells you the total capital you put into the trades.

## Interface IStrategyCallbacks

This interface defines optional callback functions that your trading strategy can use to react to different events in the backtest kit framework. You can use these callbacks to log information, trigger custom actions, or adjust your strategy's behavior based on what's happening.

The `onTick` callback gets called every time there’s a new price update, providing you with the result of the tick, the current price, and a timestamp.

When a new trade signal is opened, you'll receive the `onOpen` callback, with details like the signal data and the current price. Similarly, `onActive` notifies you when a signal is being actively monitored.  If no signal is active, the `onIdle` callback is triggered.

The `onClose` callback is invoked when a signal is closed, giving you the final closing price. For signals entered with a delay, `onSchedule` lets you know when a scheduled signal is created, and `onCancel` is called if a scheduled signal is canceled before being opened.

The `onWrite` callback is specifically for persisting signal data, used during backtesting to save information for analysis.

For more granular feedback, `onPartialProfit` is called when a signal is showing some profit, `onPartialLoss` when it’s incurring a small loss, and `onBreakeven` when it reaches a break-even point.

Finally, `onSchedulePing` and `onActivePing` are special callbacks for scheduled and active signals, respectively, running every minute to allow for custom monitoring and dynamic adjustments to your trading logic, even outside the regular strategy interval.

## Interface IStrategy

The `IStrategy` interface defines the core methods for a trading strategy. It provides functions to handle ticks, retrieve signals (pending and scheduled), check breakeven, determine if the strategy is paused or stopped, and access various position details like PnL, entry prices, and partial close history.

The `tick` method processes each price update, checks for signals and TP/SL conditions. `getPendingSignal` and `getScheduledSignal` retrieve active signals for monitoring. Other functions provide insights into position risk and performance, such as breakeven status, PnL percentages, DCA entries, and partial close history.

The interface also offers control mechanisms: `setPaused` to temporarily halt new positions, `cancelScheduled` and `activateScheduled` to manage scheduled signals, `closePending` to manually close a position, and methods to influence position management like `averageBuy`, `trailingStop`, and `breakeven`.  `backtest` allows simulating the strategy's performance with historical data. `stopStrategy` halts signal generation while preserving existing positions. Finally, `dispose` cleans up resources when the strategy is no longer needed.

## Interface IStorageUtils

This interface defines the basic functions any storage adapter used by the backtest-kit framework needs to provide. It outlines how to react to different signal events like when a position is opened, closed, scheduled, or cancelled. You'll also find methods for retrieving signals, allowing you to look up a specific signal by its ID or list all stored signals.

Finally, there are methods for processing "ping" events, specifically `ActivePing` and `SchedulePing`, which keep track of the last updated time for signals that are currently open or scheduled. These events help maintain accurate data about the status of your trading signals.


## Interface IStorageSignalRowScheduled

This interface defines the structure of a signal record when it's scheduled for future execution. 

It includes two key pieces of information. 

The `status` property is always "scheduled," confirming the signal is waiting to be triggered. 

The `currentPrice` property captures the price at the moment the signal was scheduled, acting as a snapshot from the original market data and matching the price recorded within the strategy's tick result.

## Interface IStorageSignalRowOpened

This interface describes the data for a trading signal that has been opened. It essentially confirms a position has been initiated.

The `status` property simply indicates that the signal is currently "opened".

Alongside the status, you'll find `currentPrice`, which records the VWAP price at the moment the signal was opened. This is the same price information available in a `IStrategyTickResultOpened` object, providing a consistent reference point.

## Interface IStorageSignalRowClosed

This interface describes a closed trading signal, representing its final state after a trade has concluded. It contains all the crucial information about how the signal performed.

You’ll find details here about the signal's status, which is explicitly marked as "closed." 

Importantly, it includes the profit and loss (PNL) data generated by the trade. 

Furthermore, it provides the final price at which the trade was closed, the reason for the closure, and the precise timestamp of that closing event. This data is directly linked to information found in `IStrategyTickResultClosed`, providing a consistent view of the trading event.

## Interface IStorageSignalRowCancelled

This interface represents a signal row that has been cancelled. It's a simple way to track when a signal's execution has been stopped or invalidated.  The `status` property will always be "cancelled" for these types of signal rows, clearly indicating their state. Essentially, it's a flag to identify signals that didn't complete normally.


## Interface IStorageSignalRowBase

This interface defines the basic structure for how signal data is stored, regardless of its specific status. It ensures that every signal record includes information about when it was created and last updated, using timestamps derived from strategy ticks. Signals are also assigned a priority, which helps manage the order in which they are processed, with a default value based on the current time. This consistent structure helps maintain accurate record-keeping and efficient signal handling within the trading system.

## Interface IStateParams

The `IStateParams` interface helps define how your trading signals manage their data. Think of it as setting up containers for your signals. 

It lets you specify a `bucketName`, which is essentially a label to organize your signal data—like "trade" or "metrics"—making it easier to track and understand.

You also get to provide an `initialValue`. This value is used as the starting point for a signal's data when no previous data is available.

## Interface IStateInstance

This interface, `IStateInstance`, provides a way to manage data associated with each trade, particularly useful for complex strategies using LLMs. It allows you to track specific metrics over a trade's lifetime, like the highest unrealized profit or how long the trade has been open.

Think of it as a record for each individual trade, containing information that helps determine when to exit a position.

The `waitForInit` method simply marks the state as ready. `getState` lets you read the current values of those trade metrics, but it's designed to prevent looking into the future – if you request data from a time that hasn't happened yet, you'll get a default value instead. `setState` lets you update these metrics, and importantly, older entries can be overwritten by newer ones, which is helpful for restarting backtests. Finally, `dispose` is used to clean up any resources used by the state.

## Interface ISizingSchemaKelly

This defines a specific way to determine how much of your capital to use for each trade, based on the Kelly Criterion. The Kelly Criterion aims to maximize long-term growth by calculating an optimal bet size.

This schema requires you to specify that the sizing method is "kelly-criterion".

You also need to set the `kellyMultiplier`, which controls how aggressively the Kelly Criterion is applied.  A value of 0.25, for example, represents a "quarter Kelly" strategy, meaning you'll bet a smaller fraction of your total capital than the full Kelly Criterion would suggest, reducing risk.


## Interface ISizingSchemaFixedPercentage

This schema defines a trading sizing strategy where the size of each trade is determined by a fixed percentage of your capital. 

It’s straightforward – you specify a `riskPercentage`, which represents the maximum percentage of your account you're willing to risk on a single trade. 

For example, a `riskPercentage` of 1 would mean risking 1% of your capital per trade. The framework will then calculate the trade size accordingly, ensuring you don’t exceed that predetermined risk level.


## Interface ISizingSchemaBase

This interface defines the basic structure for sizing configurations within the backtest-kit framework. Each sizing schema needs a unique identifier, or sizingName, to distinguish it. 

You can also add a note to provide helpful context or documentation for developers.

To manage risk, sizing schemas specify limits on position sizes: a maximum percentage of the account, a minimum absolute size, and a maximum absolute size. 

Finally, you can provide callbacks for specific lifecycle events within the sizing process if needed.


## Interface ISizingSchemaATR

This schema defines how to size your trades based on the Average True Range (ATR), a common volatility indicator. 

It’s used to adjust your position size based on market volatility.

The `method` property is fixed at "atr-based", indicating this is an ATR-based sizing approach.

`riskPercentage` determines what portion of your account you’re willing to risk on each trade; a value between 0 and 100 represents the percentage.

`atrMultiplier` controls how far your stop-loss is placed from the entry price, using a multiple of the ATR value to account for typical price fluctuations.

## Interface ISizingParamsKelly

This interface defines the parameters needed to use the Kelly Criterion for determining trade sizes. 

It's mainly used when setting up how much capital to risk on each trade.

The `logger` property is essential for debugging and monitoring the sizing process, allowing you to see what's happening behind the scenes. You'll provide an instance of a logger service to receive diagnostic messages.

## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed for determining how much of your capital to use for each trade when employing a fixed percentage sizing strategy. It requires a logger, which allows you to output debugging information and track the sizing decisions made. Essentially, this ensures you can monitor and understand how your sizing strategy is behaving.

## Interface ISizingParamsATR

This interface, `ISizingParamsATR`, defines the parameters used when determining how much to trade based on the Average True Range (ATR). It's primarily used when setting up a sizing strategy within the backtest-kit framework.

It contains a single property:

*   **logger:** This is a service that allows you to log debugging information. It helps you understand how the sizing is being calculated and troubleshoot any issues.

## Interface ISizingCallbacks

The `ISizingCallbacks` interface defines functions that are called during the sizing process of a trading strategy. Specifically, the `onCalculate` function is triggered after the strategy determines how much of an asset to trade. You can use this callback to examine the calculated size, log the details for review, or even verify that the size makes sense within your trading rules. It's a great place to add extra checks or monitoring during the sizing step.

## Interface ISizingCalculateParamsKelly

To help you determine your bet size using the Kelly Criterion, this object defines the necessary information. You’ll need to provide your win rate, expressed as a number between 0 and 1, representing the proportion of winning trades.  Also, specify the average win/loss ratio you’ve observed – essentially, how much you win on average for every dollar you lose. These values will be used to calculate the optimal fraction of your capital to allocate to each trade.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the parameters needed when you want to size your trades using a fixed percentage approach.  Essentially, it tells the backtest framework that you're using a strategy where the size of your trade is determined by a fixed percentage of your available capital.  It requires you to specify the stop-loss price, which is crucial for calculating the appropriate trade size based on that percentage. This provides a straightforward way to manage risk by consistently applying a set percentage to each trade.

## Interface ISizingCalculateParamsBase

This interface provides the foundational information needed for sizing calculations in your trading strategies. It ensures all sizing methods have access to essential data. 

You'll find the trading symbol, like "BTCUSDT", which identifies the asset being traded.  The `accountBalance` represents the total amount of funds available for trading. Finally, `priceOpen` tells you the anticipated price at which you intend to enter the trade.

## Interface ISizingCalculateParamsATR

This interface defines the parameters needed when calculating position sizes using an ATR (Average True Range) based method. To use this, you'll specify that your sizing method is "atr-based" and then provide the current ATR value as a number. The ATR value represents the volatility of the asset.

## Interface ISizing

The `ISizing` interface defines how your trading strategy determines how much to buy or sell in each trade. It's essentially the engine that calculates your position size.

The core of this interface is the `calculate` method. This method receives information about the trade opportunity – things like the risk you're willing to take, the price, and potentially other factors – and then returns the size of the position you should take, expressed as a numerical value.  This allows strategies to dynamically adjust position sizes based on market conditions and individual risk tolerance.

## Interface ISignalRow

This interface, `ISignalRow`, represents a complete trading signal that’s been validated and prepared for execution. Each signal is assigned a unique identifier (`id`) for tracking purposes. It holds all the necessary details for a trade, including the cost (`cost`), entry price (`priceOpen`), and expected duration (`minuteEstimatedTime`).

The signal also specifies the exchange (`exchangeName`), the strategy used (`strategyName`), and the timeframe (`frameName`). A timestamp (`scheduledAt`) records when the signal was initially created, and another (`pendingAt`) tracks when the position became active.  You'll find the trading pair symbol (`symbol`) here as well, along with a flag (`_isScheduled`) to note if it was pre-scheduled.

To help with performance analysis, the signal keeps a record of partial closes (`_partial`), detailing profit and loss percentages and prices. It also handles trailing stop-loss and take-profit prices (`_trailingPriceStopLoss`, `_trailingPriceTakeProfit`) which dynamically adjust based on strategy settings, overriding the original values.

For strategies utilizing Dollar Cost Averaging (DCA), the `_entry` property stores the history of price and cost for each purchase. To help understand the position's performance,  `_peak` tracks the highest profit-reaching price, while `_fall` records the lowest loss-reaching price. Finally, `timestamp` provides a reference point for when the signal was created, especially important for backtesting.

## Interface ISignalIntervalDto

This data structure helps manage signals, particularly when you need to retrieve them in batches or intervals. It's used to ensure signals are delivered at specific times, preventing a flood of signals and allowing for more controlled execution. Each signal has a unique identifier, like a serial number, making it easy to track and manage them.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, acting as a standardized way to pass information about a potential trade. It contains essential details like the ticker symbol, whether you're going long (buying) or short (selling), and a description of why the signal was generated. You'll also find information about the intended entry price, take profit target, and stop-loss levels to manage risk. A unique ID will automatically be created for each signal, although you can provide one yourself. Finally, it includes an estimated time the signal is expected to be active, and the cost associated with entering the position.

## Interface ISignalCloseRow

This interface defines the structure of a signal row when a trade has been closed, likely due to a user action. It builds upon the standard signal row information, adding specific details about the closing process. If a close was initiated by the user, this interface holds the unique identifier of that close event (the `closeId`) and any notes the user provided as part of the closing instruction. Essentially, it provides context and a record of how and why a trade was closed.

## Interface ISessionInstance

The `ISessionInstance` interface helps manage temporary data specific to each trading combination – think of it as a dedicated workspace for a strategy's calculations. It's used by different data storage options, like local storage or dummy data, to hold information that needs to be shared during a single test run. 

This workspace is tied to a particular symbol, strategy, exchange, and timeframe.  You might use it to store things that are expensive to recalculate, like results from a complex AI model or the state of a custom indicator.

Here's what you can do with a session instance:

*   **Initialization:** It lets you signal when a session is ready for use.
*   **Storing Data:** You can write new data to the session, associating it with a specific timestamp.
*   **Retrieving Data:** You can read data from the session at a given timestamp. It won’t return data from the future, preventing issues with looking ahead.
*   **Cleanup:**  You can release any resources held by the session when it's no longer needed.

## Interface IScheduledSignalRow

The `IScheduledSignalRow` represents a trading signal that's designed to be executed when a specific price level is reached. Think of it as a signal that's put on hold, waiting for a certain price to be hit before it becomes active.

It builds upon a standard signal and adds the concept of a 'priceOpen', which is the target price the signal waits for.

Once the market price hits the 'priceOpen', the signal is activated and transformed into a regular, pending signal ready to be executed.  A key element is that a timestamp of when the signal was initially scheduled will be tracked until activation and then updated when it turns into a pending signal. The `priceOpen` property simply specifies the target price that must be reached for the signal to activate.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled trading signal that might be canceled by the user. It builds upon the standard scheduled signal information, adding details specifically for cancellations. If a user cancels a signal, this interface lets you track that event with a unique ID and a note explaining why the cancellation occurred. Think of it as a way to manage and understand user-initiated signal cancellations within your trading system.

## Interface IScheduledSignalActivateRow

This interface describes a row of data related to signals that are scheduled for activation. It builds upon the standard signal row information by adding details specific to when activations are triggered by a user. Specifically, it includes an `activateId` which is a unique identifier for that user-initiated activation, and an optional `activateNote` which allows users to add a short explanation or reason for the activation. Essentially, this helps track and understand user actions related to scheduled signal activations.

## Interface IRuntimeRange

This interface, `IRuntimeRange`, simply describes the timeframe you're using for your backtest. It tells the backtest kit when the simulation should begin and when it should end. Think of it as setting the boundaries of the historical data you want to analyze. The `from` property holds the start date, and the `to` property holds the end date of this period.

## Interface IRuntimeInfo

The `IRuntimeInfo` interface provides a snapshot of what’s happening during a trade execution, whether it's a backtest or a live trade. It gives you access to key details like the trading symbol (e.g., BTCUSDT), the period of time being analyzed for backtesting.

You can also find extra information specific to the trading strategy itself, allowing for custom monitoring or reporting. The `context` property reveals information about the exchange, strategy, and data frame being used.

Furthermore, this interface provides the exact timestamp of the current candle or tick, the current market price, and a clear indication of whether the strategy is operating in backtest mode. Essentially, it’s a way to peek into the current state of the trading environment.

## Interface IRunContext

The `IRunContext` object acts as a central hub of information when running code within the backtest-kit framework. Think of it as a package containing everything a function needs to know about its environment. It brings together details about the trading strategy, the data feed, and the current runtime conditions—like the specific symbol being analyzed and the exact moment in time. The framework then separates this combined context into specialized services to handle different aspects of the execution.

## Interface IRiskValidationPayload

This structure holds the data needed when validating trades based on risk rules. It builds upon the basic trade information you already have and adds details about your overall portfolio. 

Specifically, it includes the signal that triggered the potential trade – ensuring you have all the necessary price data to make informed decisions – along with how many positions you currently hold and a list of those active positions. This gives you a complete picture of your portfolio state for robust risk management.

## Interface IRiskValidationFn

This function type is all about making sure your trading strategy behaves responsibly and doesn't take on too much risk. Think of it as a gatekeeper—it checks if a trade request is safe to proceed with. If everything looks good, it lets the trade through. But if it spots a potential problem, like too much leverage or a violation of your risk rules, it stops the trade and explains why, giving you a clear reason for the rejection. It's flexible in how it communicates those rejections, letting you return a specific rejection result or even throw an error, which will be handled gracefully.

## Interface IRiskValidation

This section describes how to define rules to check if your trading strategies are behaving safely and predictably. You essentially provide a function, `validate`, which takes risk parameters and determines if they meet your criteria. Think of it as setting up guardrails for your trading.  A `note` field lets you add a description to explain what the validation is doing, which is helpful for anyone reviewing or maintaining your code.

## Interface IRiskSignalRow

This interface, IRiskSignalRow, helps keep track of key pricing information during risk management. It builds upon existing signal data and adds the entry price of a trade (priceOpen) alongside the initially set stop-loss (originalPriceStopLoss) and take-profit (originalPriceTakeProfit) levels. Essentially, it allows for easy access to the original trade parameters for risk validation purposes.

## Interface IRiskSchema

The `IRiskSchema` lets you define how your portfolio manages risk, essentially setting up your own personalized rules. Think of it as a way to create custom checks to ensure your trading strategy stays within acceptable boundaries.

Each risk schema has a unique name to identify it, and you can add a note to explain what the schema does – helpful for documentation and understanding later.

You can also specify callbacks for different lifecycle events. These are like triggers that run when certain things happen – for example, when a trade is initially rejected or when a trade is ultimately allowed.

Most importantly, this schema defines a list of validations – these are the actual rules that get applied to your portfolio. You can write these validations as functions or simpler objects.

## Interface IRiskRejectionResult

When your risk validation check fails, this object provides details about why. It includes a unique identifier (`id`) to track the specific rejection and a clear explanation (`note`) in human-readable language to help you understand and fix the issue. Think of it as a friendly message explaining why something didn't pass the validation test.

## Interface IRiskParams

The `IRiskParams` interface defines the information needed when setting up a risk management system. It includes the name of the exchange you're working with, a logger to help track what’s happening, and a time service to ensure accurate data and prevent potential errors due to looking into the future. 

It also specifies whether the system is running in backtesting mode (simulated trading) or live trading mode. 

Finally, you can provide a callback function, `onRejected`, that gets triggered when a trading signal is blocked by risk limits; this lets you log or otherwise react to those rejections.

## Interface IRiskCheckOptions

The `IRiskCheckOptions` interface lets you control how risk checks behave when multiple parts of your trading system are trying to do things at the same time. Specifically, it provides a way to make sure everyone sees the same information about positions before a trade happens.

The `reserve` option, when set to `true`, acts like a safety lock. It temporarily marks a position as being used, guaranteeing that any other checks happening simultaneously will see the updated state, even before the actual trade is confirmed. This helps prevent situations where multiple orders might try to use the same position simultaneously.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, provides the necessary data for performing risk checks before a trading signal is executed. Think of it as a set of criteria to ensure a new trade is permissible based on current market conditions and strategy settings. It contains information like the trading symbol, the pending signal itself, the name of the strategy initiating the request, and details about the exchange, risk profile, timeframe, current price and timestamp. These parameters are all passed directly from the broader context of the trading strategy, allowing for a validation step to prevent unwanted trades.

## Interface IRiskCallbacks

This interface lets you define functions that get triggered when risk checks are performed. Think of it as a way to be notified about the outcomes of those checks. Specifically, `onRejected` will be called if a trading signal is blocked because it exceeds pre-defined risk limits, and `onAllowed` will be called when a signal successfully passes those risk checks. You can use these callbacks to log events, update user interfaces, or perform other actions based on the risk assessment results.

## Interface IRiskActivePosition

This interface describes a single active trading position that a trading strategy holds. It contains all the important details about the position, like which strategy owns it, the exchange and frame being used, the symbol being traded (like BTCUSDT), and whether it's a long or short position. You'll also find the entry price, stop-loss and take-profit prices, along with estimations of how long the position has been open and when it was initially opened. This information is vital for analyzing how different strategies perform relative to each other.


## Interface IRisk

The `IRisk` interface manages and enforces risk limits for your trading strategies. It's like a gatekeeper that makes sure your trades stay within acceptable boundaries.

The `checkSignal` method is your first line of defense – it evaluates whether a potential trade aligns with your risk parameters. A special, safer version, `checkSignalAndReserve`, not only performs this check but also temporarily “reserves” a spot for the trade, preventing other strategies from exceeding the limits concurrently. This is important when multiple strategies are running at once to avoid unexpected over-trading.

Once a signal is approved and reserved, `addSignal` officially registers the new trade and its details. Conversely, `removeSignal` cleans up the record when a trade is closed, ensuring the risk management system accurately reflects your positions. It's crucial to always follow a successful `checkSignalAndReserve` with either `addSignal` or `removeSignal` to maintain accurate risk tracking.

## Interface IReportTarget

This interface lets you fine-tune which aspects of your trading process are logged as reports. Think of it as a way to control the verbosity of your data output.

You can selectively turn on or off logging for things like strategy actions, risk rejections, breakeven points, partial trades, performance metrics, scheduled signals, and even live trading events.

Each property (like `strategy`, `risk`, `breakeven`, etc.) is a simple boolean – either true to enable logging or false to disable it. This allows a targeted approach to capturing the specific data you need for analysis and debugging.

## Interface IReportDumpOptions

This interface defines the information needed to properly label and organize your backtest reports. Think of it as a way to tag your data so you can easily find and understand it later. It includes details like the trading pair (e.g., BTCUSDT), the name of the strategy you used, the exchange involved, the timeframe of the data, a unique identifier for the signal, and the name of any optimization walker used.  Essentially, it's a set of properties that help categorize and filter your backtest results for analysis.

## Interface IRecentUtils

This interface defines how different systems can manage and access recent trading signals. It provides a way to record active signals, retrieve the most recent one for a specific set of conditions, and determine how long ago that signal was generated. The `handleActivePing` method allows systems to update the stored signals based on incoming events. The `getLatestSignal` method ensures signals aren't used to predict the future by rejecting signals generated after a specified time. Finally, `getMinutesSinceLatestSignalCreated` helps calculate the time elapsed since a signal was last seen.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, provides a way to share detailed information about a trading signal with users, even when trailing stop-loss or take-profit orders are in use. It builds upon the core `ISignalRow` to include the original stop-loss and take-profit prices that were set when the signal was first created. This ensures that users always know the initial risk parameters, regardless of any adjustments made by trailing mechanisms.

It includes several key pieces of data for understanding a position's history and performance. You’ll find details like the initial cost, the number of entries made (useful for understanding dollar-cost averaging), and the number of partial closes executed.

The `originalPriceOpen` property stores the initial entry price, which remains unchanged even with averaging, serving as a reliable reference point.  The `pnl`, `peakProfit`, and `maxDrawdown` properties give you a snapshot of the position's profit and loss performance up to the signal's creation. The `partialExecuted` property represents the percentage of the position closed via partial orders. Finally, `totalEntries` and `totalPartials` indicate the extent of DCA and partial close activity.

## Interface IPublicCandleData

This interface describes a single candlestick, a standard representation of price data over a specific time period. Each candlestick contains key information: the time it represents (timestamp), the price when it began (open), the highest and lowest prices during that time (high and low), the price when it ended (close), and the volume of trades that occurred. Think of it as a snapshot of market activity at a particular moment, with all the essential price and volume details. This data is fundamental for analyzing price trends and performance in backtesting or live trading.

## Interface IPositionSizeKellyParams

This interface defines the settings you'll use when calculating position sizes based on the Kelly Criterion. It’s all about figuring out how much of your capital to risk on each trade.

You'll provide two key pieces of information: your win rate, expressed as a number between 0 and 1, and your average win/loss ratio. This ratio tells the framework how much you typically gain on winning trades compared to how much you lose on losing ones.

## Interface IPositionSizeFixedPercentageParams

This defines how to set up a trading strategy that uses a fixed percentage of your available capital for each trade.

It allows you to specify a `priceStopLoss`, which is the price at which your trade will automatically close to limit potential losses. Think of it as a safety net for your positions.

## Interface IPositionSizeATRParams

This interface defines the settings needed for calculating position size based on the Average True Range (ATR). 

It contains a single property, `atr`, which represents the current ATR value. This value is used to determine how much capital to allocate to a trade, with higher ATR values typically resulting in smaller position sizes to manage risk. Think of it as a way to adjust your bet size based on how volatile the market is.

## Interface IPositionOverlapLadder

This defines how to detect overlapping positions when using dollar-cost averaging (DCA) strategies. It allows you to set boundaries, expressed as percentages, around each DCA level. 

The `upperPercent` property controls how much higher than a DCA level will be considered an overlap – essentially, how far above the level a new position can be placed before it's flagged as potentially problematic. 

Similarly, `lowerPercent` defines how much lower than a DCA level is acceptable before it's flagged as an overlap. These percentages help you fine-tune the sensitivity of overlap detection, preventing positions from being too close together. They are given as values between 0 and 100, like "25" representing 25 percent.

## Interface IPersistStrategyInstance

This interface helps you manage how strategy data is saved and loaded for a specific combination of symbol, strategy name, and exchange. Think of it as a way to customize where and how your strategy's progress is stored. 

It allows you to create your own system for saving data instead of relying on the default file-based approach.

The `waitForInit` method is used to set up the initial storage conditions.
`readStrategyData` retrieves the previously saved data.
Finally, `writeStrategyData` is responsible for saving the current data, and you can use `null` to delete existing data.

## Interface IPersistStorageInstance

This interface lets you customize how trading signals are saved and loaded for a specific environment, whether it's a backtest or a live trading session. Think of it as a way to replace the default file-based storage with something else, like a database or an in-memory cache.

You'll find one instance of this storage setup for each environment – one for backtesting and one for live trading.

The `waitForInit` method handles setting up the storage when needed.
`readStorageData` retrieves all the saved signals, effectively gathering all the historical data.
Finally, `writeStorageData` allows you to save a collection of signals to the storage, associating each signal with a unique identifier.

## Interface IPersistStateInstance

This interface defines how a strategy can save and load its state – things like indicator values or order history – so that if the system crashes or restarts, it can pick up where it left off. Each state instance is tied to a specific data stream (signalId) and a bucket (bucketName) to keep things organized.

If you're building a custom way to manage this state, perhaps using a database instead of files, you’ll need to implement this interface. 

The `waitForInit` method is called to prepare the storage. `readStateData` fetches the previously saved data.  `writeStateData` handles actually saving the current state, including a timestamp. Finally, `dispose` allows for cleanup when the state isn't needed anymore, though it doesn't require any specific action by default.

## Interface IPersistSignalInstance

This interface defines how backtest-kit manages and saves signal data for a specific trading setup – think of it as the way it remembers what happened during a test. It's tied to a particular combination of the asset being traded (symbol), the strategy used, and the exchange involved.

If you want to change how backtest-kit stores signals, like using a database instead of a file, you can build your own adapter that follows this interface. 

The `waitForInit` method sets up the storage when needed.  `readSignalData` retrieves any previously saved data, and `writeSignalData` lets you save the current state of the signal. You can even clear the data by passing `null` to `writeSignalData`.

## Interface IPersistSessionInstance

This interface defines how to manage session data that's specific to a combination of strategy, exchange, and frame – essentially, a particular setup for your trading. It’s used to make sure your session information isn't lost if something unexpected happens.

If you want to control how this data is saved and loaded (instead of the default file storage), you can create your own adapter that implements this interface.

Here's what the methods do:

*   `waitForInit`: Sets up the storage area for your session data.
*   `readSessionData`: Retrieves any previously saved data for this session.
*   `writeSessionData`: Saves the current session data, along with a timestamp.
*   `dispose`: Cleans up any resources associated with storing the session data – this might not do anything by default.

## Interface IPersistScheduleInstance

This interface lets you customize how backtest-kit saves and loads the signals that trigger your trading strategies based on schedules. It’s designed for each unique combination of symbol, trading strategy, and exchange. If you need to store scheduled signals in a database or another system instead of files, you can create a class that implements this interface. The `waitForInit` method is called when the storage is set up, `readScheduleData` retrieves previously saved signals, and `writeScheduleData` saves new or updated signals—or clears existing ones.

## Interface IPersistRiskInstance

This interface defines how your custom code can manage and store information about risk positions, specifically for a particular risk type and exchange. Think of it as a way to customize where and how backtest-kit keeps track of your trading activity.

If you want to replace the default storage method (like using a file), you’ll implement this interface.

It includes three key functions:

*   `waitForInit` lets you prepare the storage space when things start up.
*   `readPositionData` retrieves previously saved position data at a specific time.
*   `writePositionData` saves the current state of your position data for later retrieval.

## Interface IPersistRecentInstance

This interface helps manage and store the most recent trading signal for a specific combination of symbol, strategy, exchange, and timeframe. Think of it as a way to remember the last signal generated for a particular setup.

It’s designed to be adaptable, allowing you to create your own methods of storing these signals instead of relying on the default file-based approach.

The `waitForInit` method prepares the storage for the specific signal context. `readRecentData` retrieves the most recently saved signal, and `writeRecentData` saves a new signal along with the timestamp when it occurred. This lets you separate live trading data from backtesting results.

## Interface IPersistPartialInstance

This interface lets you manage how partial profit and loss data is saved and retrieved for a particular trading setup. Think of it as a way to keep track of progress on a specific trade, considering the symbol being traded, the strategy used, and the exchange involved. 

Each trade signal has its own dedicated spot to store this data.

If you want to customize how this data is saved (maybe instead of files, you want to use a database), you can create your own adapter that follows this interface.

The `waitForInit` method sets up the storage area for this particular trading context.

`readPartialData` retrieves the partial data that has already been saved for a specific signal at a certain point in time.

Finally, `writePartialData` saves the current state of a signal's partial data.

## Interface IPersistNotificationInstance

This interface lets you customize how trading notifications are saved and loaded. Think of it as a way to control where and how your notifications are stored, instead of relying on the default file storage. There's a separate instance of this for backtesting and for live trading.

The `waitForInit` method prepares the storage for a specific mode, ensuring everything is ready.

`readNotificationData` fetches all previously saved notifications from the storage – it goes through all the keys to find them.

`writeNotificationData` is responsible for saving new notifications to the storage, identifying them by their unique ID.

## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for a specific area of your trading system. Think of it as a way to save information, like trade history or analysis results, and then load it back later, specifically tied to a particular signal and bucket.

It allows for a "soft delete" – you can mark data as removed, effectively hiding it from normal access, but the file itself isn't erased. This is useful for things like debugging or auditing.

If you want to customize how memory is saved (perhaps using a database instead of files), you can build your own adapter that implements this interface.

Here's a breakdown of the key actions it allows:

*   **waitForInit:** Sets up storage for this specific memory area.
*   **readMemoryData:** Retrieves a memory entry based on its unique ID.
*   **hasMemoryData:** Checks if a memory entry with a given ID exists.
*   **writeMemoryData:** Saves a new memory entry, including when it was created.
*   **removeMemoryData:** Marks a memory entry as deleted, but keeps the underlying file.
*   **listMemoryData:** Provides a way to loop through all the memory entries that haven't been marked for deletion.
*   **dispose:**  Cleans up any resources that this storage is using, allowing for efficient resource management.

## Interface IPersistMeasureInstance

This interface helps you manage how data is stored for a specific trading strategy or bucket within the backtest-kit framework. Think of it as a way to persist data, like API responses, so you don't have to repeatedly fetch it.

It allows for a clever "soft delete" feature; when you want to remove data, it doesn't actually disappear from disk but is marked as removed, letting you keep it around for potential analysis or recovery.

If you need to customize how this data persistence works – perhaps using a database instead of files – you can build your own adapter that implements this interface.

Here's what the interface expects:

*   `waitForInit`:  A way to prepare the storage area for the data.
*   `readMeasureData`:  A method to retrieve cached data using a key.
*   `writeMeasureData`:  A method to save data to the cache with a key and timestamp.
*   `removeMeasureData`:  A method to mark data as deleted (soft delete).
*   `listMeasureData`:  A method to get a list of all the available keys, excluding those marked as deleted.

## Interface IPersistLogInstance

This interface defines how your application can manage and store log data persistently, across sessions. It's designed for situations where you need a single, global place to keep your logs, rather than tied to a specific context.

Think of it as a way to customize how your trading framework saves its logs to disk.  You can build your own system to handle this, if the default file-based storage isn't what you need.

The `waitForInit` method allows you to prepare the log storage when your application starts. `readLogData` lets you retrieve all the existing log entries from storage, which will be organized by their unique IDs.  Finally, `writeLogData` is how you add new log entries, ensuring that you don't accidentally overwrite existing ones to maintain an append-only log.

## Interface IPersistIntervalInstance

This interface helps manage how backtest-kit keeps track of when certain time intervals have already been processed for a specific data bucket. Think of it as a way to ensure that an event only happens once within a given timeframe. 

If you need to customize how this tracking is done, perhaps using a database instead of files, you can create your own implementation of this interface.

The `waitForInit` method prepares the storage for a bucket, while `readIntervalData` retrieves existing data related to a specific interval. `writeIntervalData` creates or updates that tracking information, and `removeIntervalData` essentially resets the system for a key, allowing the process to run again. Finally, `listIntervalData` lets you see what intervals are currently marked as processed for a bucket.

## Interface IPersistCandleInstance

This interface lets you manage a specific slice of your candle data cache, organized by a particular trading symbol, time interval (like 1 minute or 1 day), and exchange. Think of it as a little storehouse for candle data related to one specific trading pair on one specific exchange.

The `waitForInit` method is used to set up the storage for that particular candle context.

The `readCandlesData` method retrieves a set of candles within a defined time range; if even one candle is missing, it will return null, indicating that you need to pull data from the original source.

Finally, `writeCandlesData` lets you store new candles into that cache. When writing, it’s recommended to skip any candles that aren't fully complete or that already exist in the cache to avoid overwriting data.

## Interface IPersistBreakevenInstance

This interface lets you manage how breakeven data – that’s the point at which a trade becomes profitable – is saved and loaded. It's specifically linked to a particular trading setup, considering the asset (symbol), the trading strategy, and the exchange used.

Think of it as a place where the framework keeps track of each signal’s breakeven details.

If you want to change how this data is stored – perhaps instead of files, you want to use a database – you can create your own adapter that follows this interface.

The `waitForInit` method prepares the storage area for your trading context.

`readBreakevenData` retrieves the previously saved breakeven information for a particular signal at a specific date and time.

Finally, `writeBreakevenData` saves the breakeven data for a signal, associating it with a timestamp.

## Interface IPersistBase

This interface helps you create custom ways to store and retrieve data for backtesting. It outlines the basic functions needed for persistence, like initializing the storage, reading a specific data item, checking if a data item exists, writing a data item, and listing all available data items. Think of it as a contract that your custom storage solution needs to follow, ensuring a consistent way to interact with the backtest-kit framework. The `waitForInit` method makes sure initialization happens only once. The `keys` method provides a way to iterate through all stored items.

## Interface IPartialProfitCommitRow

This object represents a single instruction to take a partial profit on a trade. 

It tells the backtest system to close a portion of your position. 

You'll find details like the percentage of the position to close (`percentToClose`) and the price at which that partial profit was actually executed (`currentPrice`). The `action` property simply confirms this is a partial profit instruction.

## Interface IPartialLossCommitRow

This interface represents a record of a partial loss order that's been queued for execution. It details a specific action taken to reduce a position, indicating a "partial-loss" event. The `percentToClose` property specifies what portion of the position was closed, expressed as a percentage. Finally, `currentPrice` captures the price at which that partial loss trade actually took place, providing important context for performance analysis.

## Interface IPartialData

This interface describes a small piece of data used to save and load the state of a trading signal. Think of it as a snapshot of key information – specifically, the profit and loss levels that have been hit.

It's designed to be easily stored and retrieved, even if you only need to save a portion of the complete signal data. The `profitLevels` and `lossLevels` properties hold arrays of levels, which are simplified versions of the original data used in the trading system. This allows for saving data even if certain data structures aren't directly compatible with storage formats.

## Interface IPartial

The `IPartial` interface is all about keeping track of how much profit or loss a trading signal is making. It's used by the `ClientPartial` and `PartialConnectionService` to monitor signals and report milestones.

When a signal is making money, the `profit` method is called to check if it's reached key profit levels like 10%, 20%, or 30%. It only sends out notifications for new levels reached, avoiding repeated announcements.

Similarly, the `loss` method handles situations where a signal is losing money, tracking and reporting loss levels in the same way.

Finally, when a signal finishes – whether it hits a take profit, stop loss, or expires – the `clear` method is used to clean up the signal’s data, saving changes and ensuring everything's tidy.

## Interface IParseArgsResult

The `IParseArgsResult` object holds the information gathered when command-line arguments are processed. It essentially combines your original input parameters with flags that determine the type of trading environment you want to run – whether that’s simulating trades using historical data (backtest), practicing with live data in a simulated environment (paper), or actually trading with real money (live). This lets you easily control the trading mode directly from the command line.

## Interface IParseArgsParams

The `IParseArgsParams` interface outlines the information needed to run a trading strategy. Think of it as a blueprint for what the backtest-kit needs to know to get started. It includes the trading pair, like "BTCUSDT", the name of the strategy you want to use, the exchange you're connecting to, such as "binance", and the timeframe for your data, which could be "1h" for an hourly candle or "15m" for a fifteen-minute candle. This structure helps clearly define the necessary inputs for command-line argument parsing and ensures everything is set up correctly before the backtest begins.


## Interface IOrderBookData

This interface describes the structure of order book data, which represents the bids (buy orders) and asks (sell orders) available for a specific trading pair. The `symbol` property tells you which trading pair the data applies to, like "BTCUSDT."  The `bids` property holds an array of bid orders, and `asks` holds an array of ask orders. Each order within these arrays contains details about the price and quantity.

## Interface INotificationUtils

This interface serves as a foundation for how your backtest kit interacts with external notification systems. Think of it as a set of rules that any notification adapter needs to follow.

It defines various methods for handling different types of events that occur during a backtest, such as when a trade is opened or closed, partial profits or losses are available, or the strategy is paused. 

You'll find methods to manage signal synchronization and order checks, as well as ways to respond to errors and critical issues. 

There are also methods to retrieve and clear any notifications that have been stored for later review. Essentially, it’s the blueprint for building a system that can communicate important events from your backtest to other applications.


## Interface INotificationTarget

This interface, `INotificationTarget`, lets you finely control which notifications you receive during a backtest or live trading session. Instead of getting bombarded with every possible update, you can specify exactly which categories of events you're interested in. Think of it as a subscription filter—only subscribe to the information you need.

Here's a breakdown of the different notification types you can enable:

*   **Signal Events:** Keep track of signal lifecycle events like when a signal is created, scheduled, closed, or cancelled.
*   **Profit/Loss Notifications:** Get alerts when the price reaches predefined profit or loss levels before a final decision is made.
*   **Commit Confirmation:**  Receive confirmations when the strategy takes actions like partial profits, losses, or activating scheduled signals.
*   **Order Synchronization:** Monitor how orders are being filled and executed in live trading.
*   **Order Checks:**  Verify that orders are still open and active on the exchange during live monitoring.
*   **Risk Management:** Be informed if risk rules block the creation of new signals.
*   **Informational Signals:** Get manual or strategy-generated messages attached to signals.
*   **Pause Status:** Track when the strategy pauses operations (preventing new signals but allowing existing ones to close).
*   **Errors:** Receive notifications for both common (recoverable) and critical (fatal) errors, as well as validation failures during configuration.



By selectively enabling these properties, you tailor the notifications to focus on the most relevant aspects of your strategy's performance.

## Interface IMethodContext

The `IMethodContext` object helps your backtesting code keep track of which specific trading setups it's working with. Think of it as a little packet of information that travels alongside your code. It tells the system exactly which strategy, exchange, and data frame are being used for a particular calculation or trade simulation. This ensures the right pieces of your trading environment are loaded and used correctly, making the backtesting process smoother and more accurate. The `frameName` will be blank if you're doing a live test.

## Interface IMemoryInstance

The `IMemoryInstance` interface outlines how different memory storage solutions—like local storage, persistent storage, or even dummy data—should work within the backtest-kit framework. It provides a set of methods for managing data stored in memory.

You can use `waitForInit` to ensure the memory storage is properly set up before you start adding data. `writeMemory` lets you store data associated with a specific ID and timestamp, along with a description. When you need to find something, `searchMemory` uses a powerful full-text search algorithm to rank potential matches, ensuring older data is prioritized. `listMemory` provides a way to retrieve all available entries up to a specific date and time.  If you need to clean up old data, `removeMemory` allows you to delete specific entries.  `readMemory` allows you to fetch a specific piece of data by its ID and the time it was stored, returning nothing if the data is too recent. Finally, `dispose` is used to release any resources the memory instance is holding when it's no longer needed.

## Interface IMarkdownTarget

This interface lets you choose exactly what kinds of detailed reports you want when running your backtests. Think of it as a way to control the level of insight you get into how your trading strategy performs. 

You can turn on reports for specific events like when your strategy enters or exits trades, when risk limits block a trade, or when your stop loss adjusts to your entry price. It also offers options to analyze portfolio performance visually with a heatmap, optimize strategies with comparisons, and track how signals are scheduled and executed. 

Finally, you can get reports on key milestones such as the highest profit achieved and the maximum drawdown experienced, offering a comprehensive view of your backtesting results.  Each property (strategy, risk, breakeven, etc.) is a simple on/off switch for different report types.

## Interface IMarkdownDumpOptions

This interface defines the configuration options used when exporting information to Markdown format. It lets you specify exactly what part of your backtesting results you want to see in the output. You can use the `path` and `file` properties to control where the Markdown files are saved, and the `symbol`, `strategyName`, `exchangeName`, `frameName`, and `signalId` properties to filter and target specific trades, strategies, or data points. This provides a precise way to generate focused and relevant documentation from your backtest results.

## Interface ILogger

The `ILogger` interface defines a way for different parts of the backtest-kit system to record what's happening. Think of it as a central place to keep track of important events.

You can use it to log general happenings, detailed debug information (mostly for development), informational updates on successful actions, and warnings about potential issues.

This logging system helps you understand how the system is working, spot errors, and keep an audit trail of what's transpired during a backtest. 

It’s utilized by components like agents, sessions, and storage, so you'll see logs related to those activities.


## Interface ILogEntry

This interface defines a single entry in the backtest kit's log history, representing a specific event or message during a backtest run. Each log entry has a unique ID and a type indicating its severity level (log, debug, info, or warn).  A timestamp helps track when the event occurred, and there's a "createdAt" field for better user readability. 

The `methodContext` and `executionContext` properties provide extra details about where the log originated and the program's state at that moment, enriching the log's context.  A `topic` property clarifies which method or function generated the log, and `args` holds any extra information passed along with the log message.

## Interface ILog

The `ILog` interface provides a way to keep track of what's happening during your backtests and simulations. It lets you access a complete history of log messages, which is really useful for debugging and understanding how your trading strategies are performing. 

The `getList` method is your key to getting that history; it retrieves all of the logged events, presented as a list you can examine.


## Interface IHeatmapRow

This interface, `IHeatmapRow`, represents a single row of data in a heatmap visualization of your trading backtest results. Each row focuses on a specific trading pair, like BTCUSDT, and summarizes its performance across all strategies used.

It provides a comprehensive set of metrics, including profitability (totalPnl), risk-adjusted returns (sharpeRatio, sortinoRatio, calmarRatio), drawdown information (maxDrawdown), and trade statistics (totalTrades, winCount, lossCount). You’ll also find details about average trade performance (avgPnl, avgWin, avgLoss), streak analysis (maxWinStreak, maxLossStreak), and duration (avgDuration).

Beyond the basics, the interface also includes advanced indicators like expectancy, recovery factor, and certainty ratio, offering a deeper insight into the robustness and potential of each trading pair.  Finally, it provides insights into price action patterns (buyerPressure, sellerPressure, trendStrength, trendConfidence) helping to understand the underlying market dynamics affecting this specific trading pair. Overall, `IHeatmapRow` allows you to quickly understand the key performance characteristics of a trading pair and identify potential strengths and weaknesses.


## Interface IFrameSchema

The `IFrameSchema` defines a specific period of time for your backtest, essentially setting the stage for the simulation. Think of it as defining "when" your trading strategy will be tested.

Each frame has a unique name to identify it, and you can add a note for your own records.

Crucially, you specify the interval—like every minute ("1m") or every day ("1d")—which determines how frequently the backtest generates timestamps.

You also define the start and end dates, marking the beginning and end of the time range for the backtest.

Finally, you can include optional callback functions to be executed at certain points during the frame's lifecycle, giving you even more control over the testing process.

## Interface IFrameParams

The `IFrameParams` object holds the essential information needed to set up a frame within the backtest-kit trading framework. Think of it as the configuration that tells the frame who it is and how it should operate. It builds upon the `IFrameschema` and incorporates a `logger` – a helpful tool for keeping track of what's happening within the frame and debugging any issues. It also specifies an `interval`, essentially a unique name for the frame that helps identify it during the backtest.

## Interface IFrameCallbacks

The `IFrameCallbacks` interface lets you hook into important moments in a timeframe's lifecycle. You can use the `onTimeframe` function to receive notifications when a new set of timeframes has been created. This is a great spot to double-check that the timeframes look right or to keep a record of what's happening. The function will give you access to the array of dates, the start and end dates of the timeframe, and the interval used for generation.

## Interface IFrame

The `IFrame` interface is a core part of how backtest-kit manages time during backtesting. It's essentially responsible for creating the schedule of dates your strategy will be evaluated against.

The key function, `getTimeframe`, is what generates those dates. You give it a symbol (like a stock ticker) and a frame name (e.g., "1d" for daily data), and it returns a promise that resolves to an array of timestamps. These timestamps represent the points in time your backtest will simulate trading. The spacing between these dates is determined by how you’ve configured the timeframe.


## Interface IExecutionContext

The `IExecutionContext` object provides essential information about the current trading environment. Think of it as a little package of details passed around to different parts of your strategy or exchange code. 

It tells you what trading pair you're working with, like "BTCUSDT," and precisely what time the operations are happening. 

Crucially, it also indicates whether you're in a backtesting scenario, allowing your code to behave differently when simulating trades versus running live.

## Interface IExchangeSchema

The `IExchangeSchema` defines how backtest-kit interacts with a specific cryptocurrency exchange. It essentially tells the framework where to get historical trading data (candles), how to handle trade quantities and prices, and optionally, where to get order book and trade information. Each exchange needs its own schema, using a unique identifier.

You can provide optional notes for documentation purposes.

The core of the schema is the `getCandles` function, which retrieves the candle data necessary for backtesting.  It takes a symbol (trading pair), time interval, start time, number of candles, and a flag for backtesting mode as input.

For trade execution and calculations, the `formatQuantity` and `formatPrice` functions are important – these ensure that quantities and prices adhere to the exchange’s specific rules, preventing errors. If you don't specify these, a default Bitcoin precision is used on Binance.

You can also provide optional functions like `getOrderBook` and `getAggregatedTrades` to fetch order book and aggregated trade data if your data source provides them, otherwise the framework will raise an error.

Finally, you can subscribe to certain lifecycle events by setting callbacks.

## Interface IExchangeParams

This interface defines the configuration needed to connect to and interact with a cryptocurrency exchange within the backtest-kit framework. Think of it as a set of instructions for how the backtest-kit should talk to the exchange.

You'll need to provide functions for retrieving historical data like candles (price charts), order books, and trade history, as well as functions to correctly format quantities and prices to match the exchange's specific rules. These functions are essential for accurately simulating trading scenarios.

Crucially, all the methods listed here are mandatory; the backtest-kit can’t operate without them. It also expects a logger for debugging and an execution context to keep track of things like the trading symbol and whether a test is being performed.


## Interface IExchangeCallbacks

This interface lets you register functions that will be called when the backtest kit receives candle (OHLCV) data from an exchange. You can use this to react to incoming data, potentially for logging or further processing. The function receives the symbol, the data interval (like 1 minute or 1 day), a timestamp indicating when the data was requested, the number of candles requested, and finally an array containing the actual candle data. It’s designed to be asynchronous, so you can use `async/await` if needed.


## Interface IExchange

The `IExchange` interface defines how backtest-kit interacts with different cryptocurrency exchanges. It provides methods for getting historical and future candle data, crucial for simulating trading strategies. You can request candles from the past, or even look ahead to future candles during backtesting.

The framework helps with handling trade quantities and prices by formatting them according to the specific exchange's rules. It can also calculate the VWAP (Volume Weighted Average Price) based on recent trading activity.

Retrieving order book data and aggregated trades is also possible, giving you a snapshot of market activity.  

You have a lot of flexibility when fetching candle data; you can specify start and end dates, limits, or a combination of these to retrieve the precise historical data you need, all while ensuring accurate backtesting without looking into the future.

## Interface IEntity

This interface serves as the foundation for all objects that are saved and retrieved from a database. Think of it as the common starting point for things like trades, instruments, or any other data you need to store persistently within your backtesting system. Any class implementing `IEntity` will inherently have the ability to be easily managed and tracked within the framework's data storage mechanisms.

## Interface IDumpInstance

The `IDumpInstance` interface defines how to save data during a backtest run. Think of it as a way to record what happened, allowing you to examine the details later.

It provides several methods for different types of information:

*   `dumpAgentAnswer`: Stores the complete conversation history for a specific agent's actions.
*   `dumpRecord`:  Saves simple key-value pairs of information.
*   `dumpTable`:  Organizes and stores data presented in a table format with headers automatically created.
*   `dumpText`:  Allows you to save plain text or formatted markdown notes.
*   `dumpError`: Records error messages for debugging purposes.
*   `dumpJson`: Persists complex data structures as JSON for detailed analysis.

The `dispose` method is used to clean up any resources this instance might be using when it's no longer needed. Each instance is tied to a specific signal and a bucket, meaning the data saved is always connected to a particular part of the backtest.

## Interface IDumpContext

The IDumpContext provides information needed to organize and identify data dumps. Think of it as a container holding details about where a particular piece of data belongs. 

It includes the `signalId` which connects the dump to a specific trade, the `bucketName` which groups dumps by strategy or agent, and a unique `dumpId` to distinguish it from others.  A helpful `description` lets you label the contents of the dump, and is used for searching and display. Finally, the `backtest` flag indicates if the data originates from a backtest or live environment, impacting how it's handled. This context is primarily used behind the scenes by the DumpAdapter.

## Interface ICommitRowBase

This interface, `ICommitRowBase`, provides a foundational structure for events that involve committing data or actions. Think of it as a way to hold information temporarily, ensuring it's processed at the right time and in the correct environment. Each event will have a `symbol`, which identifies the trading pair involved (like BTC-USD), and a `backtest` flag indicating whether the action is happening within a simulated backtesting scenario. It's designed to give you a standardized way to manage and eventually apply these commit operations when everything is ready.

## Interface ICheckCandlesParams

This interface describes the information needed to check if candle data exists in a storage system. It's used to verify if a particular trading pair, exchange, timeframe, and date range has already been stored, avoiding unnecessary file scans. The parameters specify the trading symbol, the exchange where the data originates, the candle timeframe (like 1-minute or 4-hour), and the start and end dates for the check. Essentially, it lets you quickly see if you already have the data you need.

## Interface ICandleData

This interface defines the structure for a single candlestick, a fundamental building block for analyzing price movements. Each candlestick represents a specific time interval and contains key information like when it started, the opening price, the highest and lowest prices reached, the closing price, and the volume traded.  It’s used within the backtest-kit framework for things like calculating moving averages and powering backtesting simulations. Essentially, it's a record of what happened during a particular slice of time in the market.


## Interface ICacheCandlesParams

The `ICacheCandlesParams` object helps manage how historical candlestick data is fetched and cached, especially when dealing with situations where the cache might be missing data. It allows you to define custom actions that happen at key moments in this process.

Specifically, you can use it to run code before the initial validation of the data and again before the warm-up phase, which is triggered when the validation fails. These callbacks give you opportunities to log progress, update UI elements, or perform other preparatory tasks.

The callbacks receive details like the symbol being processed, the candle interval (e.g., 1 minute, 1 hour), and the date range of data being considered. This information can be useful for providing informative messages or debugging.

## Interface IBrokerOrderVerdictTransient

This interface represents a temporary setback encountered while trying to place or manage an order. It’s a signal from the system that something unexpected happened, like a brief network interruption or a temporary problem on the exchange's side. 

Don't worry about creating this verdict directly; it's generated internally by the framework to handle these situations.

If an error occurs during order processing, the system flags it as "transient," which means it will automatically attempt to resolve the issue a limited number of times. 

The `reason` always indicates this is a temporary problem, and the `error` property holds information about the underlying cause, if available. Essentially, it's the system's way of saying, "Let's try again shortly."

## Interface IBrokerOrderVerdictRejected

When an order can't be fulfilled, this tells you why and provides details. 

It's a signal from the system indicating a permanent problem – the order won’t go through and retrying won't help. 

This isn't something you actively create; it's generated by the framework based on errors it encounters. 

If you see this, it means the order was rejected for a business reason, like a lack of available resources, and the system won't try again. Open orders will be dropped, and closed orders will be immediately closed.

The `error` property holds the specific error message that caused the rejection, which helps you understand the problem.

## Interface IBrokerOrderVerdictDeleted

When an order is unexpectedly removed – perhaps because the user cancelled it directly on the exchange – the `IBrokerOrderVerdictDeleted` signal is used. This isn't something you create; instead, the system detects the order's absence and communicates this using a special notification. Think of it as the framework's way of saying, "Hey, this order we were expecting is gone!" 

The `reason` property confirms that the order was deleted.  The `error` property contains details about *why* the order was deleted, like the original `OrderDeletedError` that triggered the notification. This allows your system to react appropriately to the situation.

## Interface IBrokerOrderVerdictConfirmed

This object represents the framework's final decision about whether an order action is allowed or a check passes. 

Think of it as the "all clear" signal from the system. 

It's not something you create directly; instead, your adapter or listener communicates acceptance or rejection through specific return values or errors.

If the framework receives a normal return or `true`, it means the order is good to go. 

If it receives a specific error indicating rejection, that's a terminal condition. 

The `reason` property, set to "confirmed," simply indicates that everything checks out and the order can proceed.

## Interface IBrokerOrderVerdictBase

The `IBrokerOrderVerdictBase` acts as a foundational building block for decisions made about orders within the backtest-kit framework. Think of it as the parent for different ways an order might be handled. It's designed to be flexible, allowing for various reasons behind the decision, without needing to know those reasons in advance.

The `__type__` property is a special marker that helps the system understand exactly *which* type of verdict is being presented – essentially, it's a way to categorize the decision.

## Interface IBroker

This interface defines how your code connects to a live trading environment, like an exchange. It's the bridge between your trading strategy and a real broker. All methods within this interface are executed *before* the core trading system changes its state, so errors will not alter the state. When backtesting, these calls are skipped entirely.

**waitForInit():**
This is a one-time setup step that runs *before* any trading happens. Use it to establish connections, load credentials, and perform a crucial "orphan sweep". An orphan sweep cleans up any lingering orders or positions left behind from previous, potentially crashed, executions.  It’s essential for a clean start, matching current positions with what’s on the exchange. It's important to understand that this function runs before the very first trade, not just when enabling trading. Handle "rejected opens" during this sweep – re-adopt existing live positions or flatten exchange orphans.

**onOrderCloseCommit():**
This is called when the system is closing a trade (take-profit, stop-loss, manual close). You'll place the actual closing order with the broker here.  If there's a problem (network issue, exchange failure) the close can retry; if the reason is that there's no counterparty the close is rejected.

**onOrderOpenCommit():**
This is called when opening a new trade. You'll place the initial order with the broker here, using `signalId` to tag the order. Issues like network failures lead to retries, while a rejection means the order is dropped entirely.

**onOrderActiveCheck():**
This method periodically checks on already-open positions. If the exchange reports the order is missing, the position is closed automatically. If there's a temporary problem communicating with the exchange, the check is retried, with a limit on the number of attempts.

**onOrderScheduleCheck():**
Similar to `onOrderActiveCheck`, but for orders that are waiting to be filled (resting orders).  If the order is cancelled or rejected, you need to cancel the order on the exchange.

**onSignalActivePing():**
This is a key event-driven method.  It allows you to react to *real-world* events from the exchange that might not match your strategy’s expectations, like a stop-loss being hit before your strategy expected it. You can use this to manually commit take-profit, stop-loss, or close orders.

**onSignalSchedulePing():**
Like `onSignalActivePing`, but for orders that are waiting to be filled.  Use this to activate or cancel resting orders based on real-time exchange data.

**onSignalIdlePing():**
Called when there are no trades active. Used for housekeeping tasks.

**onSignalScheduleOpen():**
Called when a new resting order is placed. This is where you initiate the actual order with the exchange.

**onSignalScheduleCancelled():**
Called when a scheduled order is cancelled.  You'll need to cancel the corresponding order on the exchange.

**onSignalPendingOpen():**
Called when a position is opened.  Place the confirmation and protective orders (take profit, stop loss) here.

**onSignalPendingClose():**
Called when closing a position. Finish any cleanup (cancel orders) and record final profits/losses.

**onPartialProfitCommit(), onPartialLossCommit(), onTrailingStopCommit(), onTrailingTakeCommit(), onBreakevenCommit(), onAverageBuyCommit():**
These are for committing incremental changes related to profit-taking, loss mitigation, and DCA strategies.

## Interface IBreakevenData

This interface defines the data used to store and retrieve breakeven information. It's a simplified version of the more complex breakeven state, designed for saving to a database or file. Essentially, it tells you whether the breakeven point has been achieved for a particular trading signal. This information is kept as a simple true/false value, making it easy to store and later reload when you need it.

## Interface IBreakevenCommitRow

This object represents a record of a breakeven commitment that has been queued for processing. It signifies an action related to breakeven calculations. 

The `action` property specifically indicates that this record pertains to a breakeven event. The `currentPrice` property stores the price level at which the breakeven point was initially determined. Essentially, it's a snapshot of the price when the breakeven condition was established.

## Interface IBreakeven

The `IBreakeven` interface manages the tracking of when a trade's stop-loss should be adjusted to the entry price – the breakeven point. It helps ensure trades are protected while still allowing for potential profit.

This interface monitors a trade's progress and, when the price moves favorably enough to cover trading costs, it triggers an event signaling that the stop-loss can be moved to breakeven.

The `check` method determines if breakeven should be triggered, and if so, it updates the trade’s status and notifies listeners. The `clear` method resets the breakeven status when a trade is closed, ensuring a clean slate for the next signal.

## Interface IBidData

The `IBidData` interface represents a single bid or ask found within an order book. It provides essential details about that specific price level. Each bid or ask has a `price`, which is recorded as a string, and a corresponding `quantity`, also represented as a string, indicating how much is available at that price. This structure allows you to easily access the price and volume information for individual bids and asks.


## Interface IAverageBuyCommitRow

This interface represents a single step in a queued average-buy strategy, sometimes called a DCA (Dollar-Cost Averaging) commit. It essentially describes one purchase within a larger averaging plan. 

Each commit includes the current price at which the purchase was made, the total cost of that specific purchase in dollars, and the updated total number of averaging entries that have been made so far. The `action` property confirms that this entry relates to an average-buy operation.

## Interface IAggregatedTradeData

IAggregatedTradeData holds information about a single trade that took place. It's designed to give you the specifics you need for backtesting and in-depth analysis.  Each trade record includes the price at which it happened, the quantity of assets exchanged, and the exact time it occurred as a timestamp. A key detail is `isBuyerMaker`, which tells you if the buyer was acting as a market maker – helpful for understanding trade direction and potential impacts. You'll use this data to understand the specifics of individual trades within your backtest.

## Interface IActivityEntry

An `IActivityEntry` represents a single, ongoing trading operation, whether it’s a backtest or a live trade. Think of it as a marker indicating something is currently running.

These entries are created when a trading process begins, like when a backtest starts or a strategy executes a trade, and they're removed when the process finishes successfully or encounters an error.

The system uses these entries to keep track of what’s happening and to prevent conflicts if multiple operations are running at the same time.

Each entry includes details like the trading symbol (e.g., "BTCUSDT"), the strategy and exchange being used, and whether it’s a backtest or a live trade.

## Interface IActivateScheduledCommitRow

This interface represents a message that's put in a queue to trigger the activation of a scheduled commitment. It's how the system knows to actually start the process.

The `action` property always indicates that the action being performed is "activate-scheduled".

You'll also find the `signalId`, which is a unique identifier for the signal that's being activated. If a user specifically initiated the activation, the `activateId` provides additional information about that action.

## Interface IActionStrategy

The `IActionStrategy` interface gives your action handlers a way to peek at the current state of a trading signal. Think of it as a way to check if something's "in the works" before taking action.

It lets you easily see if there's a signal actively waiting to be filled – whether it's for a break-even point, profit taking, loss prevention, or just a scheduled event. This is really useful for making decisions about whether to proceed with a specific action.

Essentially, it’s like a quick look under the hood to ensure things are set up correctly before your trading logic kicks in. You use it to confirm that an action is appropriate based on the current trading environment.


## Interface IActionSchema

The `IActionSchema` lets you extend your trading strategy with custom functionality. Think of it as a way to hook into your strategy's execution and do things like log events, send notifications, or manage your strategy's state.

You define these extensions using an "action schema," which specifies how your custom logic should be applied. 

Each action is created separately for each strategy instance and the timeframe it's running on, giving you a focused environment to work with.

Here's a breakdown of what you need to define in your action schema:

*   **actionName:** A unique identifier for your action.
*   **note:**  A helpful note for yourself (or other developers) to explain what the action does.
*   **handler:**  This is where you provide the actual code that will be executed when the action triggers. It can be a constructor function or a partially implemented action interface.
*   **callbacks:**  Optional functions that let you control when and how your action runs within the strategy lifecycle.

## Interface IActionParams

This interface defines the data passed to actions within the backtest-kit framework, blending configuration details with runtime information. It's essentially a package of everything an action needs to function correctly.

You get a logger to help track what's happening and troubleshoot any issues.

The `strategyName` and `frameName` tell the action what strategy and timeframe it belongs to. The `exchangeName` identifies which exchange is being used.

A `backtest` flag indicates whether the action is running a simulated test.

Finally, the `strategy` property provides access to critical information about the current state of the trading strategy, like the signal and position details.


## Interface IActionCallbacks

This API reference details lifecycle and event callbacks used within the backtest-kit framework, offering flexibility for customization and resource management. Think of these callbacks as hooks that let you react to different stages of a trading strategy's execution.

Initialization and Cleanup:

The `onInit` callback runs when a trading action handler starts up. Use it to set up connections, load data, or subscribe to necessary services.  `onDispose` runs when the handler is shut down, perfect for closing connections and saving data.

Signal Events:

Several callbacks handle signal events. `onSignal` receives every signal from both backtesting and live trading. `onSignalLive` and `onSignalBacktest` isolate signals for live and backtest environments respectively. These are triggered frequently during strategy evaluation.

Profit and Loss Management:

`onBreakevenAvailable`, `onPartialProfitAvailable`, and `onPartialLossAvailable` trigger when specific profit/loss levels are hit – handy for dynamic risk management.

Scheduling:

`onPingScheduled` runs while waiting for scheduled signals. `onScheduleEvent` manages lifecycle events related to scheduled signals. `onPendingEvent` is called when a pending order opens or closes. `onPingActive` monitors active pending positions. `onPingIdle` fires when there are no signals pending.

Risk Management:

`onRiskRejection` alerts you when a signal is rejected by the risk management system.

Order Management:

`onOrderSync` is critical for order confirmations—it’s a gate that allows rejecting orders through exceptions.  `onOrderCheck` verifies the status of pending orders on every live tick, ensuring order persistence and stability.

Manual Wiring:

Some callbacks like `onScheduleEvent`, `onPendingEvent`, `onOrderSync`, and `onOrderCheck` support manual wiring for complex, event-driven actions. This allows direct interaction with the exchange by calling commit functions within the strategy tick context.


## Interface IAction

The `IAction` interface is your central point for connecting your custom logic to the trading framework's event stream. Think of it as a way to plug in your own actions—like logging, monitoring, or even triggering external systems—in response to specific events within the backtesting or live trading process.

It provides a series of methods, each representing a different type of event.  For example, `signal` is fired every time a new trading signal is generated, while `breakevenAvailable` is triggered when a stop-loss order reaches the entry price. `orderSync` is a critical method called during order placement, allowing you to potentially reject orders based on custom criteria.

Several of these methods, like `signalLive` and `signalBacktest`, are specific to either live or backtest modes, letting you tailor your behavior.  You'll also find events related to scheduled signals, partial profits/losses, and ping activity.

Crucially, the `dispose` method is essential for cleaning up any resources you use within your custom action handler when it's no longer needed, preventing memory leaks.  You'll implement these methods to handle events from the framework.

## Interface HighestProfitStatisticsModel

This model holds information about the events that resulted in the highest profits during a trading simulation. 

Specifically, it includes a list, `eventList`, which is a chronological record of those highest-profit events, starting with the most recent. You'll also find `totalEvents`, a simple count of how many such events were recorded. Think of it as a way to understand and analyze the periods of greatest success in your trading strategy.

## Interface HighestProfitEvent

This data represents the single best performing trade recorded for a specific strategy. Each event contains details like the exact time it happened, which trading pair was involved, and the name of the strategy used. You'll also find information about the trade's direction (long or short), its overall profit and loss, and the highest profit it reached.

Furthermore, the record includes information about the initial entry price, any take profit or stop loss levels that were set, and whether this event occurred during a simulated backtest. The `maxDrawdown` value indicates the biggest loss the position experienced before reaching this peak profit.

## Interface HighestProfitContract

The `HighestProfitContract` provides information whenever a trading strategy reaches a new peak profit. It’s like a notification that something good is happening! This notification includes details like the trading symbol, the current price at that moment, and when the update occurred. You'll also find context about the strategy itself – its name, the exchange used, and the timeframe involved. A key part of the notification is the signal data that triggered the trade, and importantly, a flag tells you whether this profit milestone was reached during a backtest or actual live trading.

## Interface HeatmapStatisticsModel

This data structure represents a comprehensive overview of your portfolio's performance, aggregating statistics across all the assets you're tracking. It provides a high-level view of how your portfolio is performing, including key metrics like total profit and loss, risk-adjusted returns (Sharpe and Sortino ratios), and trade characteristics.

You'll find information about the individual symbols within your portfolio, along with overall portfolio statistics such as the total number of trades and average trade durations. Several key performance indicators, like peak profit, maximum drawdown, and expectancy, give insight into the best and worst potential outcomes.

The structure also offers a detailed look at win/loss streaks, duration of winning and losing trades, and volatility measures like standard deviation. Finally, it includes annualized and extrapolated metrics, such as expected yearly returns and trade frequency, to allow for long-term performance assessment.

## Interface DoneContract

This interface describes what happens when a background process finishes, whether it's a backtest or a live trading session. It provides details about the specific exchange used, the name of the trading strategy that ran, and the frame it was operating within (which will be blank if it’s a live session). You'll also know if the execution was a backtest or live trade, and the trading symbol involved, like BTCUSDT.

## Interface CronHandle

The `CronHandle` is like a little ticket you get when you schedule something to happen regularly using the Cron system. Think of it as a way to cancel that scheduled task later. When you're done with a scheduled task, you can use this handle to tell the Cron system to stop it – it's basically a shortcut for manually removing the schedule.

## Interface CronEntry

A CronEntry defines when and how a specific function should be executed during a backtest.

Each entry needs a unique name to identify it, and this name can’t contain colons.

You specify an interval, like "1m" or "1h", to determine the time boundary at which the function runs. If you skip the interval, it will run just once at the start.

You can also specify a list of symbols. If you don't provide this list, the function will run once for every backtest, but if you provide a list, it will run once for each symbol in that list.

Finally, the handler is the function that gets executed when the timing and conditions are met.

## Interface CriticalErrorNotification

This notification signals a serious, unrecoverable error that requires the program to stop running. 

It's a way for the system to tell you something went terribly wrong, and you need to investigate. 

Each notification has a unique ID to help track it down, along with a detailed error message explaining the issue. 

You'll also get the error’s stack trace and other helpful information to pinpoint the root cause. 

Importantly, these notifications always indicate errors originating from the live environment, not from a backtest simulation.

## Interface ColumnModel

This defines how a column of data is structured when generating tables, like those you might see summarizing backtest results.  Essentially, it's a blueprint for taking data and presenting it in a readable, formatted way.

Each column has a unique `key` to identify it, a `label` that will appear as the column header, and a `format` function which is responsible for turning the raw data into a human-readable string.  You can also specify an `isVisible` function to control whether a column is displayed at all, perhaps based on certain conditions.  This gives you a lot of flexibility in tailoring the presentation of your data.


## Interface ClosePendingCommitNotification

This notification tells you when a pending trade signal is closed before it actually becomes an active position. It's particularly useful for understanding why a signal didn't lead to a full trade activation. The notification includes a unique ID and timestamp, and specifies whether it happened during a backtest or live trading.

You'll find details like the symbol being traded, the strategy and exchange involved, and a unique identifier for the original signal. It also provides information about any DCA averaging that was in place, including the number of entries and partial closes.

Crucially, the notification includes comprehensive performance data for the potential trade, even though it wasn’t fully executed. This includes total profit and loss (both absolute and percentage), peak profit figures, maximum drawdown, and entry/exit prices used for the PNL calculations. You can see the potential impact on your capital if the trade *had* been activated. A human-readable note might be attached to explain the reason for the closure. Finally, a timestamp indicates when the notification itself was generated.

## Interface ClosePendingCommit

This signal lets you know a position has been closed, essentially marking the end of a trade. 

It provides important details about that closed trade. 

You'll see the `action` clearly identified as "close-pending," and optionally a `closeId` that you can use to track why the position was closed.

The signal also includes vital performance metrics: the total profit and loss (`pnl`) for the entire position, the highest profit reached (`peakProfit`), and the largest loss experienced (`maxDrawdown`).  These values represent the performance *up to the time the signal was generated*.


## Interface CancelScheduledCommitNotification

This notification tells you when a scheduled trading signal has been cancelled before it actually went through. It's a way to know that something planned didn't happen, which could be due to various reasons like a system issue or a manual override.

The notification includes details like a unique ID, the timestamp of the cancellation, whether it happened during backtesting or live trading, and the symbol being traded. You'll also find information about the strategy involved, the exchange used, and specifics about the signal itself – its ID, reason for cancellation (if provided), details about any DCA entries or partial closes, and important performance metrics like profit/loss, peak profit, and maximum drawdown. Essentially, it provides a complete picture of the cancelled signal and its potential impact.

## Interface CancelScheduledCommit

This interface defines how to cancel a signal event that's already scheduled. Think of it as a way to undo a planned action.

You'll use it when you need to stop something from happening later, and you can optionally provide a reason for the cancellation.

Along with the cancellation details, you're also providing information about the closed position, including the total profit and loss, the highest profit achieved, and the largest drawdown experienced. This gives context to why the event is being canceled.


## Interface BreakevenStatisticsModel

This model holds information about breakeven points reached during a trading simulation. 

It keeps track of every single breakeven event, storing them in a list with all the associated details. You can also find the total count of these breakeven events here. Essentially, this is your central location for understanding how frequently breakeven was achieved.


## Interface BreakevenEvent

The BreakevenEvent provides a single, organized package of data whenever a trading signal reaches its breakeven point. It collects all the key details related to that moment, like when it happened (timestamp), which trading pair was involved (symbol), the name of the strategy used, and a unique identifier for the signal.

You'll find information about the position taken (long or short), the current market price, and the original entry price – marking the breakeven level. It also includes the initially set take profit and stop loss prices.

For strategies employing dollar-cost averaging (DCA), it specifies the total number of entries and partial closes.  Details like the original entry price before averaging, and the total executed percentage from partial closes are also included. 

Alongside financial data such as unrealized profit and loss (PNL), the event captures human-readable notes describing the signal's rationale, along with timestamps showing when the position became active and when the signal was initially created. Lastly, a flag indicates whether the event occurred during a backtest or live trading.

## Interface BreakevenContract

This interface represents a breakeven event, a key milestone in a trading signal's lifecycle. It’s triggered when a signal’s stop-loss is moved back to the initial entry price, signifying the trade has covered its costs and reduced risk.

The event contains details like the trading symbol (e.g., BTCUSDT), the name of the strategy that generated the signal, the exchange and frame used, and the full data associated with the original signal. You'll also find the current market price that triggered the breakeven and a flag to indicate if this event came from a backtest or live trading. 

Essentially, it’s a notification that a trade is performing well enough to have reached a breakeven point, allowing consumers like reporting services or user callbacks to track progress and monitor strategy safety. These events happen only once for each signal.

## Interface BreakevenCommitNotification

This notification signals that a breakeven action has occurred during trading. It’s essentially a confirmation that a trade has reached a point where it's breaking even.

The notification includes a lot of detailed information about the trade, such as a unique identifier, the exact time it happened, and whether it occurred during backtesting or live trading. You’ll see the trading symbol, the strategy used, and the exchange it ran on.

It provides a comprehensive snapshot of the position's history, including the original entry and take profit/stop-loss prices, and how those prices might have been adjusted by trailing stops.

You'll also find details about the trade’s financial performance like total profit and loss (both in USD and as a percentage), as well as key performance indicators such as peak profit and maximum drawdown along with related pricing and number of entries. 

Finally, there are fields for optional notes and timestamps for when the signal was scheduled, became pending, and when the notification itself was generated. This allows you to trace the full lifecycle of the trade.

## Interface BreakevenCommit

The BreakevenCommit represents an event triggered when a breakeven adjustment occurs during a trade. This event signals that a position has reached a point where adjustments are needed to protect profits or limit losses. 

It provides details about the current market price at the time of the adjustment, the profit and loss (pnl) realized so far, the highest profit achieved, the largest drawdown experienced, and the direction of the trade (long or short).  

You'll also find the original entry price, the take profit and stop loss prices (both as they currently stand, and as they were initially set), and timestamps indicating when the signal was created and when the position was activated. Essentially, it’s a comprehensive snapshot of the position's state at the moment of the breakeven event.

## Interface BreakevenAvailableNotification

This notification signals that your trading position has reached a point where the stop-loss can be moved to breakeven – essentially, your initial entry price. It provides a wealth of detail about the position, including its unique identifier, when it occurred, whether it’s from a backtest or live trading, and the specific trading pair involved.

You’ll find key data points like the current market price, the original entry price, and the direction of the trade (long or short). Detailed information about take profit and stop-loss prices, both original and adjusted for trailing, is also included.

Beyond the basics, the notification dives into performance metrics. It shares details about the total number of entries and partial closes, the position's profit and loss (both in USD and percentage), peak profit, maximum drawdown, and the prices and entry counts associated with those events. There's also a note field for any specific reason or explanation associated with this event. Finally, it logs timestamps for when the signal was created, became pending, and when this notification was generated.

## Interface BeforeStartContract

This interface, `BeforeStartContract`, signals the very beginning of a trading strategy run. Think of it as a "ready to go" notification before the historical data or live market feed starts being processed. It's triggered once for each run of your trading strategy, ensuring initialization tasks like opening log files or resetting internal counters happen precisely once. 

Crucially, there’s a corresponding `AfterEndContract` event that will always follow, even if something goes wrong during the run. This guarantees closure and proper cleanup.

The information provided within this event includes details like the trading symbol, strategy name, the exchange providing the data, and whether it's a backtest or live run. You'll also find the current market price and the time the event occurred, which is aligned to a one-minute boundary. In backtest mode, the time represents the intended starting point of the historical data, whereas in live mode it’s the actual current time.  The `timestamp` property offers the same time information as `when`, but in milliseconds for easier handling and serialization.

## Interface BacktestStatisticsModel

This model provides a detailed breakdown of how a trading strategy performed during a backtest. It contains a wealth of information, from the raw data of individual trades to calculated metrics like win rate, average profit, and risk-adjusted return. You'll find individual trade details in the `signalList`, along with core counts like total signals, wins, and losses.

The model calculates several key performance indicators, including metrics for profitability (`avgPnl`, `totalPnl`), risk (`stdDev`), and efficiency (`SharpeRatio`, `SortinoRatio`).  It also explores more nuanced aspects of trading behavior, such as average trade durations, consecutive win/loss streaks, and the balance between buyer and seller pressure. 

Finally, it examines the overall trend of the backtest period by assessing both slope and confidence.  Overall, this model offers a comprehensive toolkit for understanding and evaluating a trading strategy's performance.  Keep in mind that many of these values might be null if the calculations were considered unreliable due to unusual market conditions.

## Interface AverageBuyCommitNotification

This notification lets you know when a new piece of your dollar-cost averaging (DCA) strategy has been executed. It's triggered whenever a new averaging entry is added to an open position.

The notification provides a wealth of detail, including a unique ID, the exact time it occurred, and whether it’s part of a backtest or live trade. It identifies the trading pair involved, the strategy responsible, and the exchange used.

You'll find key data like the current price at the time of the averaging entry, the cost of that entry, and the effective average entry price so far. It also tracks the total number of averaging entries made and any partial closes executed.

Beyond the core details, the notification gives you a comprehensive view of the position's performance, including profit and loss (both in USD and as a percentage), peak profit levels, maximum drawdown, and original entry prices. Finally, there's a timestamp for when the signal was created and when it went pending, along with an optional note explaining the reasoning behind the signal.

## Interface AverageBuyCommit

This event, `AverageBuyCommit`, signifies a new purchase has been added to a position using an averaging strategy, also known as Dollar-Cost Averaging (DCA).

It provides a snapshot of the position's details at the time of this averaging buy, including the price at which the purchase was made (`currentPrice`), the cost of that purchase (`cost`), and the resulting effective average entry price (`effectivePriceOpen`). 

You’ll also find information about the position’s overall performance up to this point, like unrealized profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the largest drawdown experienced (`maxDrawdown`). 

The event includes the original entry price (`priceOpen`) which remains unchanged by the averaging process, alongside the adjusted take profit and stop-loss prices (`priceTakeProfit`, `priceStopLoss`) potentially modified by trailing mechanisms, and their original values (`originalPriceTakeProfit`, `originalPriceStopLoss`). Timestamps for signal creation (`scheduledAt`) and position activation (`pendingAt`) are also included for tracking purposes.

## Interface AfterEndContract

This interface marks the end of a strategy execution, whether it ran to completion, was stopped, or encountered an error. It's designed for cleanup tasks that need to happen reliably once per run, like saving results or sending notifications.

You're guaranteed to receive this event exactly once for each corresponding start event, ensuring your cleanup processes are consistent. If any errors occur within your cleanup logic, they won't interrupt the main process and are handled separately.

The `when` property tells you when the strategy finished: in backtesting, it’s the time of the last candle processed, defaulting to the start of the frame if nothing was processed; in live trading, it’s the current time rounded to the nearest minute. The `timestamp` provides the same information as a millisecond value, useful for serialization.

The event also provides important context like the trading symbol, strategy name, exchange, and frame used. A boolean `backtest` property clearly indicates whether the run was a simulation or live trading. Finally, `currentPrice` offers a readily available average price from the exchange, saving you the need to fetch it yourself.

## Interface ActivePingContract

This describes the `ActivePingContract`, which is a way for the backtest-kit framework to let you know about the status of active pending signals. Think of it as regular check-ins while a pending signal is still open and being monitored.

Each ping event contains a lot of information, including the trading symbol (like "BTCUSDT"), the name of the strategy using it, the exchange it's on, and the timeframe it’s associated with.

You'll also receive all the details of the pending signal itself in the `data` property – things like entry price, take profit, and stop loss.  The `currentPrice` tells you the market price at the moment the ping was sent, which can be helpful for custom logic.

Finally, `backtest` indicates whether the ping is part of a historical simulation or live trading, and `timestamp` tells you exactly when the ping occurred.  This allows you to build custom logic around these periodic updates.

## Interface ActivateScheduledCommitNotification

This notification signals that a previously scheduled trading signal has been activated, meaning it's time to execute the trade. It's triggered when a user manually initiates a signal, bypassing the typical price check. The notification provides a wealth of detail about the trade, including a unique ID, when it happened, and whether it's a backtest or live trade.

You’ll find information about the trading pair (like BTCUSDT), the strategy that generated the signal, and the exchange where the trade will occur.  It includes specifics about the position size, entry price, take profit and stop-loss levels, along with details about any dollar-cost averaging (DCA) used, including the number of entries and partial closes.

The notification also provides extensive performance data for the trade, such as the total profit and loss (PNL), peak profit, maximum drawdown, and key pricing information.  Finally, it includes timestamps for signal creation, pending status, and notification creation, along with a user-provided note to explain the reason for the trade.

## Interface ActivateScheduledCommit

This interface defines the data structure used when activating a previously scheduled trading signal. It essentially communicates the details of a trade being brought to life.

Key information included is the trade's direction (long or short), entry and exit prices (take profit and stop loss, both original and adjusted), and the current market price at the time of activation.

You'll also find performance metrics like total profit and loss (PNL), peak profit, and maximum drawdown calculated up to the point the signal was created.

Finally, timestamps are provided, indicating when the signal was initially created and when the position started to be active. A user-provided identifier for the activation reason can also be included.
