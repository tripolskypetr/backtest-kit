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

This interface describes a signal that's sent when a walker, which is essentially a process running a trading strategy, needs to be stopped. It's useful when you have multiple trading strategies running at the same time and you need to interrupt one or more of them. 

The signal includes the trading symbol being affected, the name of the strategy that’s being halted, and importantly, the name of the specific walker being stopped. This last piece lets you selectively stop only certain walkers without affecting others that might be running on the same symbol. Think of it as a targeted "pause" command for your trading processes.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps organize and present results when you're comparing different trading strategies. Think of it as a container holding all the data you need to understand how your strategies performed against each other.

It builds upon the existing IWalkerResults data structure, but adds a crucial piece: the strategyResults. 

This property, strategyResults, is simply a list of all the results you’ve gathered for each strategy you tested, allowing you to easily analyze and compare their performance side-by-side. It’s particularly helpful when you want to clearly present the results in reports or documentation.

## Interface WalkerContract

The WalkerContract represents updates you receive as your trading strategies are being compared against each other. Think of it as a progress report showing how each strategy performed. It tells you which strategy just finished a test run, along with details like the strategy’s name, the symbol it was tested on, and the exchange and frame used. 

You’ll also see performance statistics—things like metrics and values—and how they stack up against the best-performing strategy found so far.  It also includes counts to show you how many strategies have been tested and how many are left to go. Essentially, it gives you a clear view of the ongoing comparison process.

## Interface WalkerCompleteContract

This interface represents the final notification you receive when a backtest walker has finished running all its strategies. It bundles together all the key information about the completed backtest, so you can easily access the results.

You'll find details about the specific walker that ran (its name), the asset being tested (symbol), the exchange and timeframe used, and the optimization metric employed. 

The notification also tells you how many strategies were evaluated, identifies the best-performing strategy, and provides its metric value and detailed statistics. Essentially, it's a complete snapshot of the backtest's outcome.

## Interface ValidationErrorNotification

This notification pops up whenever a risk validation check fails during a backtest or live trading scenario. It's a way for the system to let you know something went wrong with your risk rules.

The `type` property always indicates that it's a validation error. You'll find a unique `id` to help track the specific issue, along with the raw `error` object for detailed debugging information. A helpful `message` explains what went wrong in plain language.  The `timestamp` tells you exactly when the error occurred, and `backtest` confirms whether this happened during a backtest.

## Interface ValidateArgs

This interface, `ValidateArgs`, acts as a blueprint for ensuring the names you're using in your backtesting setup are correct. Think of it as a quality check for your configuration. It outlines the key components – like the exchange you're trading on, the timeframe you're using, the strategy itself, and even how you're managing risk and sizing positions. Each of these properties expects an enum, meaning you’re providing a controlled list of valid options that the system will verify against what it knows. This helps prevent errors and typos from creeping into your backtest and potentially skewing your results.

## Interface TickEvent

This interface, TickEvent, acts as a central hub for all the information you receive about a trading event, regardless of what's happening – whether it's just waiting, a trade opening, a trade running, or a trade closing. It bundles all the crucial data into a single, consistent format.

You'll find details like the exact time of the event, the action being performed (idle, opened, active, or closed), and the specific trading pair involved. For trades that are open or have been closed, you'll also get information about the signal used, the position taken (long or short), any notes associated with the signal, and key price levels like the open price, take profit, and stop loss.  

It also tracks how much of a trade has been executed, the progress toward take profit and stop loss, the profit and loss (P&L), and for closed trades, the reason for closing and the trade's duration. This makes it much easier to analyze and report on trading activity.

## Interface SignalScheduledNotification

This notification tells you when a trading signal is planned for execution in the future. It's like a heads-up that a trade is about to happen, but not right away.

Each notification contains details about the signal, including a unique identifier and the precise time it’s scheduled to be executed. You'll also find information about which strategy generated the signal, the trading symbol involved, the exchange being used, and the direction of the trade (long or short). The open price at the time the signal was generated and the current market price are also provided, alongside the time the signal will actually be used. This helps you understand the context surrounding the scheduled trade.

## Interface SignalOpenedNotification

This notification lets you know when a new trading position has been initiated within the backtest kit. It provides a wealth of information about the trade, including a unique identifier for the signal that triggered it, the exact time the position was opened, and whether it's part of a backtesting run. 

You’ll find details like the trading symbol, the name of the strategy that generated the signal, the exchange being used, and whether the position is a long or short. The notification also includes the opening price, take profit price, stop loss price, and any notes associated with the trade. Essentially, it’s a complete record of what just happened when a new position was created.


## Interface SignalData$1

This `SignalData` object holds all the key details about a completed trading signal, allowing you to analyze performance. Each object represents a single trade that has finished. It tells you which strategy created the signal, gives it a unique ID, and identifies the asset being traded (like BTC/USD). You'll find information about the trade’s direction (long or short), its profit and loss as a percentage, and the reason it was closed.  Finally, the `openTime` and `closeTime` properties track exactly when the trade began and ended, letting you study trade duration.

## Interface SignalClosedNotification

This notification tells you when a trading position has been closed, whether it was triggered by a Take Profit (TP) or Stop Loss (SL) event. It provides a wealth of information about the closed trade.

You’ll find details like the unique ID of the signal that initiated the trade, the timestamp of the closure, and whether the trade occurred during a backtest. It also includes the symbol traded, the name of the strategy used, and the exchange involved.

The notification reveals the direction of the position (long or short), the opening and closing prices, the percentage profit or loss, and the reason for the closure. Furthermore, you can see the trade’s duration and any associated notes. Essentially, it’s a complete record of a closed position, perfect for analysis and review.


## Interface SignalCancelledNotification

This notification tells you when a signal that was planned to be executed has been cancelled. It's a way to understand why a trade didn't happen as originally scheduled.

The notification includes details like the signal's unique ID, the time it was cancelled, whether it was part of a backtest, and the trading symbol involved.  You'll also find information about the strategy and exchange that generated the signal, along with the reason for the cancellation, a cancellation ID, and the planned duration of the signal.  The `position` property specifies whether the signal was intended to be a long or short trade.

## Interface ScheduleStatisticsModel

This model helps you understand how your scheduled trading signals are performing. It gathers key statistics about your scheduled signals, including how many were scheduled, opened (activated), and cancelled. 

You'll find a complete list of all scheduled events, along with their details, within the `eventList` property. 

The model also provides helpful metrics like cancellation rate (how often signals are cancelled – aiming for a lower rate is good) and activation rate (how often signals are activated – you want a higher rate). It even calculates average waiting times for both cancelled and opened signals, giving you insight into potential delays.

## Interface ScheduledEvent

This interface bundles together all the important details about scheduled, opened, and cancelled trading events, making it easier to create reports and analyze trading activity. Each event, whether it's being planned, executed, or cancelled, will have a timestamp indicating when it occurred. You'll find information about the specific trading pair (symbol), the signal ID that triggered the event, and the type of position being held. 

The interface also includes pricing information like the entry price, take profit levels, and stop loss levels, along with any notes associated with the signal. For closed events, there’s a close timestamp and the duration the position was held. If an event was cancelled, you'll also see the reason for cancellation and a unique ID if it was a user-initiated cancellation.  The `totalExecuted` field tells you how much of the position has been closed out through partial closes.

## Interface RiskStatisticsModel

This model holds information about risk rejections, giving you a detailed picture of where your risk controls are being triggered. It contains a complete list of the risk events that occurred, allowing you to examine each one individually. You’ll also find the total number of rejections, broken down by the trading symbol and the strategy involved. This lets you quickly identify trends and potential problem areas in your trading system.

## Interface RiskRejectionNotification

This notification lets you know when a trading signal was blocked by your risk management system. It's triggered whenever a signal doesn't pass the checks set up to protect your account. 

The notification includes details like the signal's ID, when it was rejected, whether the rejection happened during a backtest, and the symbol involved. You’ll also see the name of the strategy and the exchange, along with a specific note explaining why the signal was rejected and a unique rejection ID for tracking. 

It also provides information on the number of active positions you had at the time, the current price of the asset, and the signal itself that was rejected. This allows you to understand the context of the rejection and fine-tune your risk rules as needed.

## Interface RiskEvent

This data structure represents an event that occurs when a trading signal is rejected because it violates a defined risk limit. It's designed to provide all the necessary details for reporting and understanding why a signal wasn't executed. 

You'll find information like the exact time the event occurred, the trading symbol involved, and the details of the signal that was rejected. The structure also includes the name of the strategy and exchange, the timeframe used, the current market price at the time of the rejection, and how many active positions were open. A unique ID helps track specific rejections, and a note explains the reason for the rejection. Finally, it indicates whether the event happened during a backtest or in live trading conditions.

## Interface RiskContract

The RiskContract provides information about signals that were blocked because they violated risk rules. It’s designed to help you understand why trades weren’t executed and monitor your risk management effectiveness.

Think of it as a detailed record whenever a trading signal gets rejected – it’s not just for signals that *could* have been placed, but only those actively blocked by risk controls.

Each RiskContract includes key details: the trading pair involved (symbol), the specifics of the signal itself (pendingSignal), which strategy generated it (strategyName), the timeframe it was associated with (frameName), the exchange it was intended for (exchangeName), the market price at the time (currentPrice), how many positions were already open (activePositionCount), and a unique ID for tracking (rejectionId).

You'll also find a human-readable explanation of why the signal was rejected (rejectionNote), when it was rejected (timestamp), and whether it occurred during a backtest or live trading (backtest). This information is essential for services like report generation and for developers who want to respond directly to risk events.

## Interface ProgressWalkerContract

The ProgressWalkerContract lets you keep an eye on how a background task, like testing trading strategies, is going. It sends updates as the task runs, so you know what's happening. 

Each update tells you the name of the walker, the exchange being used, the frame, and the trading symbol involved. You'll also see the total number of strategies being processed, how many have already been handled, and the overall progress as a percentage. This helps you monitor and understand the progress of your backtesting process.

## Interface ProgressOptimizerContract

This interface helps you monitor the progress of your backtest-kit optimizers. It provides updates during the optimization process, letting you know how many data sources have been processed and what percentage of the total is complete. You'll see the optimizer's name and the trading symbol it's working on alongside these progress indicators. Think of it as a status report, telling you where the optimizer is in its journey.

## Interface ProgressBacktestNotification

This notification lets you keep an eye on how your backtest is running. It’s sent during the backtesting process to give you updates. 

Each notification includes details like the exchange and strategy being tested, the symbol involved, and the total number of historical data points (frames) being processed. You’ll also see how many frames have already been analyzed and a progress percentage, letting you know how close the backtest is to completion. The timestamp gives you a record of when the update was sent.

## Interface ProgressBacktestContract

This contract lets you monitor the progress of a backtest as it runs. It provides key details like the exchange, strategy, and trading symbol involved. You'll also see the total number of historical data points (frames) being processed, how many have already been analyzed, and an overall percentage representing how far along the backtest is. Think of it as a progress report that keeps you informed about the backtest’s advancement.


## Interface PingContract

The `PingContract` provides a way to monitor the status of your scheduled signals—those automated trading signals—as they're being watched. Think of it as a heartbeat signal confirming that a strategy is actively observing a specific trading pair on a certain exchange.

These ping events happen roughly every minute while a signal is active, meaning it hasn't been canceled or fully activated for trading. This regular update lets you track the signal’s lifecycle.

Each ping event includes important details such as the trading symbol ("BTCUSDT"), the name of the strategy using the signal, the exchange it’s on, and a comprehensive set of data about the signal itself, including its ID, entry price, and stop-loss levels.  It also tells you if the signal is being tested in a backtest environment or is live.

You can use this information to build custom logic, perhaps to automatically cancel a signal if it hasn’t pinged in a while, or to adjust your strategy based on the signal’s ongoing status. The timestamp included indicates when the ping occurred – either at the time of the ping in live mode or the candle’s timestamp in backtest mode.

## Interface PerformanceStatisticsModel

This model holds the performance data collected during a backtest. It organizes information about a specific trading strategy, telling you how long it ran and the total number of events it processed. You'll find a breakdown of statistics for each metric type used, providing insights into various aspects of the strategy’s performance.  The model also keeps a record of all individual performance events, giving you access to the raw data for deeper analysis. Think of it as a comprehensive report card for your strategy.

## Interface PerformanceContract

The PerformanceContract helps you understand how your trading strategies are performing during backtesting or live trading. It records details about different operations, like how long they take to execute. 

You'll see timestamps indicating when an event occurred and when the previous one happened, allowing you to measure the time between steps. The `metricType` tells you what kind of operation was being performed, and `duration` specifies how long it lasted. 

Information about the specific strategy, exchange, frame (if applicable), and trading symbol are included, giving you a breakdown of performance for each component. Finally, a flag indicates whether the data comes from a backtest or live trading session. This information is valuable for spotting slow operations and improving overall efficiency.


## Interface PartialStatisticsModel

This data model holds information about how a trading strategy performs when it takes partial profits or losses. It's like a snapshot of the results from these specific actions, giving you insight into the frequency and amounts of profits and losses generated.

You’ll find a detailed list of each partial profit/loss event in the `eventList` property. `totalEvents` simply tells you how many partial events were recorded. `totalProfit` and `totalLoss` keep track of how many times the strategy resulted in a profit or a loss from these partial adjustments.

## Interface PartialProfitNotification

This notification lets you know when a trading signal has reached a specific profit milestone during a backtest. It’s triggered when a signal hits levels like 10%, 20%, or any other predefined profit target.

The notification contains important details about the event, including the signal's ID, the time it occurred, and whether it's part of a backtest simulation. You’ll also find the symbol being traded, the name of the strategy used, the exchange involved, and the current price of the asset.

Crucially, it specifies the level of profit reached (e.g., 10%), the initial price when the position was opened, and whether the position is a long or short trade. This information is helpful for analyzing how your strategies perform and understanding when they achieve profitability milestones.

## Interface PartialProfitContract

This describes events that happen when a trading strategy reaches certain profit milestones, like 10%, 20%, or 30% gain. Think of it as a way to track how well your trading strategy is performing, specifically focusing on when it achieves these profit levels. Each event provides details like the trading pair (e.g., BTCUSDT), the strategy name, the exchange being used, and the price at which the milestone was hit. 

The data also includes the original signal information like the initial stop-loss and take-profit prices. It lets you see exactly what happened during that trade.

These events are only sent once for each profit level per trade, and if the price jumps, you might receive multiple level updates in a single tick. It's primarily used for creating reports and for letting you, as the user, know when these important profit levels are reached through functions like `listenPartialProfit()` or `listenPartialProfitOnce()`. Whether the event is from a live trade or a backtest simulation is also indicated. The timestamp represents when the level was detected – either the real-time moment in live trading or the candle time in backtesting.

## Interface PartialLossNotification

This notification lets you know when a trading strategy has reached a specific loss level, like a 10% or 20% drawdown. It's a way to get alerted to potential trouble spots in your strategy's performance.

The notification includes details such as the type of event (a partial loss), a unique ID for tracking, and the exact time it occurred. You'll also find information about whether it happened during a backtest or live trading, the symbol being traded, the strategy's name, the exchange being used, and a signal identifier.

Critically, it tells you the loss level that triggered the notification, the current price of the asset, the price when the position was opened, and whether the position is long or short. This comprehensive data helps you understand the context behind the loss and investigate further.

## Interface PartialLossContract

The `PartialLossContract` represents a notification that a trading strategy has reached a predefined partial loss level, like a -10% or -20% drawdown. It's used to keep track of how a strategy is performing and when it hits these loss milestones.

Think of it as a checkpoint system; each time a strategy dips below a certain loss threshold, this contract is generated. Importantly, you only receive one notification for each loss level per strategy, even if the market moves significantly in a short period.

The notification includes details such as the trading symbol (e.g., BTCUSDT), the name of the strategy involved, the exchange and frame used for execution, and the original data related to the signal. You'll also see the current price at the time of the loss, the specific loss level reached (e.g., 20% represents a -20% loss), and whether it's part of a backtest or live trading execution. A timestamp indicates exactly when the loss level was detected.

This data is valuable for creating reports, monitoring strategy performance, and providing updates to users through callbacks.

## Interface PartialEvent

This interface, `PartialEvent`, serves as a central container for information related to profit and loss milestones during trading. Think of it as a snapshot of key data points whenever a trade hits a profit or loss level, like 10%, 20%, or 30%.

It includes details like the exact time of the event (`timestamp`), whether it’s a profit or a loss (`action`), the trading symbol involved (`symbol`), and the name of the strategy that generated the trade (`strategyName`). You'll also find identifiers like `signalId` to track specific trading signals, and details about the position itself (`position`).

Crucially, it holds pricing information: the current market price (`currentPrice`), the entry price (`priceOpen`), the take profit target (`priceTakeProfit`), and the stop loss level (`priceStopLoss`).  It also preserves the original take profit and stop loss prices that were set when the signal was first created, allowing you to track any adjustments.  Other helpful pieces of information include the percentage of the position already closed (`totalExecuted`), a descriptive note (`note`) explaining the reasoning behind the signal, and a flag indicating whether the trade is part of a backtesting simulation (`backtest`).


## Interface MetricStats

This interface, `MetricStats`, helps you understand the overall performance of a specific metric during your backtesting. It bundles together key statistics like the number of times a metric was recorded, the total time it took, and the average duration. You'll find details on the shortest and longest durations, as well as measures of variability like standard deviation and percentiles (p95 and p99). 

It also provides insights into the timing between events, including the average, minimum, and maximum wait times. By examining these statistics, you can pinpoint bottlenecks or areas for optimization within your trading strategy.

## Interface MessageModel

This defines how conversations with a language model are structured. Each conversation is made up of messages, and each message tells you who sent it – whether it was a system providing instructions, the user asking a question, or the language model responding. The `role` property clarifies the sender, while the `content` property holds the actual words of the message. It’s a simple but essential way to organize the flow of a conversation for things like building prompts or keeping track of the context.

## Interface LiveStatisticsModel

This model provides a detailed snapshot of your live trading performance. It collects statistics from every event, from idle periods to closed trades, giving you a comprehensive view of how your system is doing.

You'll find information like the total number of events processed, the number of winning and losing trades, and key performance indicators.

The model calculates important metrics such as win rate, average profit per trade, total profit, and volatility (standard deviation). It also provides risk-adjusted performance measures like the Sharpe Ratio and annualized Sharpe Ratio to help you assess returns relative to risk.  The Certainty Ratio helps gauge the consistency between winning and losing trades, while expected yearly returns estimate potential annual gains. All numeric values are carefully managed; they are set to null if the calculation would produce an unreliable or meaningless result.

## Interface LiveDoneNotification

This notification signals that a live trading session has finished. It’s sent when the live execution is fully complete.

The notification includes key details like a unique identifier for the session, the timestamp marking the end, and confirmation that it was a live, not a backtest, run. You'll also find information about the specific trading symbol, the strategy used, and the exchange where the trading took place. This allows you to track and analyze live trading activity with precise data.

## Interface IWalkerStrategyResult

This interface, `IWalkerStrategyResult`, represents the outcome of running a single trading strategy during a backtest comparison. It bundles together key information about that strategy’s performance.

You’ll find the strategy's name clearly listed, along with comprehensive statistics generated during the backtest itself – things like total return, Sharpe ratio, and drawdown.

A crucial value, `metric`, is included; this is the specific number used to compare the strategy against others. If the metric is invalid for some reason, it will be null.  Finally, `rank` tells you where the strategy stands in the overall comparison – the higher the rank (1 being the best), the better the strategy performed.

## Interface IWalkerSchema

The IWalkerSchema defines how to run A/B tests, letting you compare different trading strategies against each other. Think of it as a blueprint for setting up your experiment.

Each walker, or test run, needs a unique name so you can track it.  You can also add notes to help explain what the walker is designed to do.

It specifies which exchange and timeframe the strategies will be tested on, ensuring a level playing field.  You provide a list of strategy names – these are the strategies you want to compare, and they need to be set up separately.

The IWalkerSchema also lets you choose what to optimize for, like the Sharpe Ratio, but you can also customize this. Finally, you can define optional callbacks to react to events during the walker’s lifecycle.


## Interface IWalkerResults

This interface holds all the information gathered when a backtest walker finishes comparing different trading strategies. Think of it as a complete report card for a set of strategies run against a specific market. It tells you which asset, like a stock ticker symbol, was being tested. You'll also find out which exchange was used, such as Coinbase or Binance.  The name of the backtest walker itself and the specific timeframe (like 1-minute or daily) are included, providing full context for the results.

## Interface IWalkerCallbacks

This interface lets you hook into different stages of the backtest process, providing a way to monitor and react to what's happening. You can receive notifications when a particular strategy begins testing, when it finishes (successfully or with errors), and when all the strategies in your comparison are done. This allows for custom logging, progress tracking, or even real-time adjustments to your backtesting run. The `onStrategyStart` callback tells you when a new strategy is about to be tested, `onStrategyComplete` provides the final statistics and a metric after a strategy finishes, `onStrategyError` alerts you to any problems encountered during testing, and `onComplete` signals the end of the entire backtest process with the overall results.

## Interface IStrategyTickResultScheduled

This interface represents a specific type of event within the backtest-kit framework, signaling that a trading strategy has generated a signal and is now patiently waiting for the price to reach a predefined entry point.  Essentially, the strategy has identified a potential trade but isn't executing it just yet. 

The event includes details about the signal itself, the strategy and exchange involved, the timeframe being used, the trading symbol, and the price at the time the signal was created. Knowing whether this event occurred during a backtest or a live trading session is also provided. This information helps track the signal's journey and understand how the strategy is behaving.


## Interface IStrategyTickResultOpened

This interface represents the data you receive when a new trading signal is created within the backtest-kit framework. Think of it as a notification saying, "Hey, a new signal has just been generated!" 

It provides essential details about the signal, including the name of the strategy that created it, the exchange and timeframe it relates to, the trading pair involved, and the current price at the time the signal was opened.  You'll also find a unique ID for the newly created signal, and a flag to confirm whether the signal originated from a backtest or a live trading scenario. This information is particularly useful for monitoring and analyzing how strategies perform and understanding the context surrounding each signal.

## Interface IStrategyTickResultIdle

This interface describes what happens when a trading strategy isn't actively signaling anything – it's in an idle state.  Essentially, it's a record of the conditions when the strategy isn't taking action. It tells you the name of the strategy, the exchange it's operating on, the timeframe being used, and the trading symbol involved.  You'll also find the current price at that moment and a flag to indicate whether this idle event happened during a backtest or in live trading.  It's a way to keep track of periods where the strategy is just observing the market.

## Interface IStrategyTickResultClosed

This interface, `IStrategyTickResultClosed`, represents what happens when a trading signal is closed, providing a comprehensive record of the event. It tells you the signal has been closed, along with the reason for the closure – whether it was due to a time limit expiring, reaching a take-profit target, or hitting a stop-loss. 

You'll also find key information like the closing price, a timestamp marking precisely when the signal closed, and a detailed breakdown of the profit and loss, including any fees or slippage. The data includes identification details like the strategy name, exchange used, the timeframe employed (like 1-minute or 5-minute intervals), and the symbol being traded, along with whether this event occurred during a backtest or in live trading. It's basically a complete snapshot of a closed trading signal, allowing for thorough analysis and review.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a trading signal that was scheduled to execute doesn't actually trigger – perhaps it was cancelled directly, or it hit a stop-loss before a trade could be opened. It gives you details about the cancelled signal, including the price at the time of cancellation, the exact timestamp, and the strategy, exchange, timeframe, and symbol involved. 

You'll also find information like whether the event occurred during a backtest, the reason for the cancellation, and an optional cancellation ID if the signal was manually cancelled. This information is valuable for understanding why your strategy didn't execute as planned and for debugging potential issues.



The `action` property will always be "cancelled" to immediately identify the type of result.


## Interface IStrategyTickResultActive

This interface describes the data you receive when a trading strategy is actively monitoring a signal, waiting for a take profit, stop loss, or time expiration. It essentially represents a position that's "in the game" and being watched.

You'll see details like the strategy's name, the exchange it's operating on, and the time frame being used, along with the trading symbol. The `currentPrice` indicates the price being tracked for the TP/SL calculation. 

Progress indicators, `percentTp` and `percentSl`, show how close the position is to achieving its take profit or stop loss targets. 

The `pnl` property provides the unrealized profit and loss for the position, factoring in fees, slippage, and any partial closes. Finally, the `backtest` flag confirms whether the data originates from a backtesting simulation or a live trading environment.

## Interface IStrategySchema

This schema defines how your trading strategies are registered and work within the backtest-kit framework. Each strategy needs a unique name so the system knows which one is which. You can add a note to describe your strategy—helpful for yourself and anyone else using it.

The `interval` property helps control how often your strategy generates signals, preventing it from overwhelming the system. The core of the strategy is the `getSignal` function – this is where you put your trading logic. It takes a symbol (asset) and a date/time, and returns a signal to execute or `null` if no action is needed.  If you specify a price target, the signal waits for the price to reach that level before triggering.

You can also provide callbacks to execute actions when a trade opens or closes.  For risk management, you can specify a risk profile name or a list of profiles, allowing the system to manage potential losses.

## Interface IStrategyResult

This interface, `IStrategyResult`, holds all the important information about a trading strategy after it's been tested. Think of it as a single row in a comparison table, letting you easily see how different strategies performed. Each result includes the strategy's name so you know what you're looking at, plus a whole bunch of detailed statistics about its backtest performance. Finally, it also records the value of the metric you're using to rank the strategies, which helps you quickly identify the best performers.

## Interface IStrategyPnL

This interface represents the profit and loss (PnL) calculation for a trading strategy. It gives you a clear picture of how your strategy performed, taking into account realistic trading costs. The `pnlPercentage` property shows your profit or loss as a percentage, making it easy to compare different strategies. You’ll also find the adjusted entry (`priceOpen`) and exit (`priceClose`) prices, which have been modified to reflect fees and slippage – those small costs that happen when you buy and sell.

## Interface IStrategyCallbacks

This interface defines a set of optional functions your trading strategy can use to react to different events in the backtest-kit framework. Think of them as hooks that let your strategy respond to what's happening.

For example, `onTick` gets triggered every time a new price comes in, giving you the latest data. `onOpen` is called when a new trade is started, while `onClose` tells you when a trade has finished. There are also callbacks for when a trade is actively running (`onActive`), when there are no active trades (`onIdle`), and for various scheduling actions like `onSchedule` and `onCancel`. 

You’ll also find notifications for partial profit or loss events (`onPartialProfit`, `onPartialLoss`) as well as when a signal hits breakeven (`onBreakeven`). Finally, `onPing` allows you to perform custom checks every minute, regardless of your strategy's usual interval. This is useful for tasks like regularly verifying if a trade should be cancelled. You can choose to use only the callbacks you need for your particular strategy.

## Interface IStrategy

This interface outlines the core actions a trading strategy takes within the backtest-kit framework. Think of it as a blueprint for how a strategy behaves – how it reacts to price changes, handles signals, and manages risk.

The `tick` method is the heart of the strategy, triggered regularly with new price data. It checks for potential trading signals and whether any stop-loss or take-profit conditions have been met.

Strategies can query for pending and scheduled signals using `getPendingSignal` and `getScheduledSignal` respectively. These functions return null if no signal is present. These are important for managing take-profit, stop-loss, and time expiration.

`getBreakeven` determines if the price has moved far enough to cover transaction costs, allowing a strategy to move its stop-loss to the entry price. It's based on a formula considering slippage and fees.

`getStopped` simply checks if the strategy is paused.

The `backtest` method simulates the strategy's performance using historical price data, checking for signals and TP/SL triggers.

`stop` pauses a strategy from generating new signals, but allows existing trades to finish naturally. It's like a graceful shutdown.

`cancel` lets you cancel a scheduled trading signal without stopping the entire strategy. This is useful for temporarily pausing a planned entry.

`partialProfit` and `partialLoss` allow for closing a portion of a position based on profit or loss targets, with validation to prevent over-closing.

`trailingStop` dynamically adjusts the stop-loss level, moving it closer to the entry price as the price moves in a favorable direction. It ensures a protective adjustment relative to the original SL distance.

`trailingTake` dynamically adjusts the take-profit level, bringing it closer to the entry price as the price moves in a favorable direction. It ensures a conservative update to the original TP.

`breakeven` moves the stop-loss to the entry price when the price has moved sufficiently in profit to cover transaction costs, offering a form of risk protection. It's a one-time operation.

## Interface ISizingSchemaKelly

This interface defines a way to size your trades using the Kelly Criterion, a popular method for maximizing growth. When implementing this, you're telling the backtest-kit framework to use a sizing approach based on the Kelly Criterion formula. The `kellyMultiplier` property lets you control how aggressively the sizing is applied; it's a number between 0 and 1, representing the proportion of your capital to bet on each trade. A common starting point is 0.25, which represents a "quarter Kelly" approach – a more conservative sizing strategy.

## Interface ISizingSchemaFixedPercentage

This schema defines a simple way to determine your trade size: you always risk a fixed percentage of your capital on each trade. 

The `method` property is always set to "fixed-percentage" to identify this specific sizing strategy. 

The `riskPercentage` property tells the framework what percentage of your capital you're comfortable risking – for example, a `riskPercentage` of 1 means you’ll risk 1% of your capital per trade. Remember to keep this value between 0 and 100.


## Interface ISizingSchemaBase

This interface, ISizingSchemaBase, acts as a foundation for defining how much of your account to allocate to each trade. It provides essential parameters for controlling position sizing.

You'll find a unique name to identify each sizing strategy, a space for adding developer notes to explain its purpose, and limits to set.  Specifically, it defines the maximum position size as a percentage of your account balance, a minimum absolute position size, and a maximum absolute position size.  Finally, you can optionally include callback functions to customize sizing behavior based on different events.

## Interface ISizingSchemaATR

This schema defines how to size your trades using the Average True Range (ATR) indicator. It allows you to base your position size on a percentage of your account and an ATR multiplier. The `riskPercentage` setting determines the maximum percentage of your capital you’re willing to risk on each trade. The `atrMultiplier` controls how far your stop-loss is placed based on the ATR value, helping to account for market volatility. Essentially, this setup creates a risk-aware sizing approach that adapts to price fluctuations.

## Interface ISizingParamsKelly

This interface defines the parameters needed to use the Kelly Criterion for determining trade sizes within the backtest-kit framework. It's essentially a way to tell the system how aggressively or conservatively you want to size your trades based on your expected returns and risk. 

You'll provide a logger, which is helpful for keeping track of what's happening during the backtesting process and identifying any potential issues. Think of the logger as a way to get helpful messages and diagnostics as your backtest runs.

## Interface ISizingParamsFixedPercentage

This interface, `ISizingParamsFixedPercentage`, helps you define how much of your capital you’ll use for each trade when using a fixed percentage sizing strategy. It's all about controlling your position sizes.

You'll need to provide a `logger` which is a service for displaying messages – this helps you keep track of what's happening during backtesting and debugging any issues. Think of it as a way to get feedback on your sizing calculations.


## Interface ISizingParamsATR

This interface defines the parameters used when determining how much to trade based on the Average True Range (ATR) indicator. It's primarily used when setting up your trading strategy's sizing logic.

You'll find a `logger` property here, which allows you to output debug information—helpful for understanding how your sizing calculations are working and diagnosing any potential issues. Think of it as a way to keep track of what's going on behind the scenes.

## Interface ISizingCallbacks

This section describes callbacks that allow you to interact with the sizing process within the backtest-kit framework. Specifically, the `onCalculate` callback is triggered immediately after the framework determines the size of a trade. This provides an opportunity to examine the calculated size, perhaps for debugging or to ensure it aligns with your expectations. You can use this callback to log information about the calculated quantity and the parameters that influenced the sizing decision, allowing for detailed analysis of the sizing process.

## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate your trade size using the Kelly Criterion. It's all about figuring out how much to risk based on your historical performance. You’ll need to provide your win rate, expressed as a number between 0 and 1, and your average win/loss ratio. These values help the framework determine an optimal bet size that balances potential reward with risk of ruin.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the information needed to calculate your trade size using a fixed percentage approach. When using this method, you specify a `priceStopLoss`, which represents the price at which your stop-loss order will be triggered.  The framework uses this stop-loss price to determine the appropriate trade size based on a pre-defined percentage of your capital. Essentially, it’s a way to consistently risk a set portion of your funds per trade, tied to a specific stop-loss level.

## Interface ISizingCalculateParamsBase

This interface defines the basic information needed to figure out how much of an asset to buy or sell. It includes the trading pair you're working with, like "BTCUSDT," the current balance in your account, and the price at which you're planning to enter the trade. Think of it as the foundational data any sizing calculation will require. It provides a consistent structure for determining trade size regardless of the specific sizing strategy being used.

## Interface ISizingCalculateParamsATR

This interface defines the information needed when calculating trade sizes using an ATR (Average True Range) based method.  Essentially, it's a way to tell the backtest engine how to determine the size of each trade you want to execute. It includes the method used ("atr-based") and the current ATR value itself, which is a key factor in deciding how much capital to risk per trade. You provide this ATR value to the sizing calculation to inform the logic.

## Interface ISizing

The `ISizing` interface helps your trading strategies determine how much of an asset to buy or sell. Think of it as the engine that figures out your position size based on your risk tolerance and trading parameters. 

It has a single, important method called `calculate`. This method takes a set of parameters, like your current account balance, risk percentage, and the price of the asset, and returns a number representing the size of the position you should take. Essentially, it translates your risk preferences into concrete trading quantities.

## Interface ISignalRow

An `ISignalRow` represents a complete trading signal, acting as the core data structure throughout the backtesting process.  Each signal gets a unique ID, ensuring easy tracking and management.  It includes crucial details like the entry price (`priceOpen`), the exchange and strategy used, and the timeframe it applies to.

You'll also find the signal's creation and pending timestamps (`scheduledAt`, `pendingAt`), along with the trading pair symbol (`symbol`). A special flag (`_isScheduled`) indicates if the signal was scheduled in advance.

A sophisticated feature allows for partial position closures, recorded in the `_partial` array. This data enables precise Profit and Loss (PNL) calculations by considering how much of the position was closed at various prices and times.  Related computed values like `_tpClosed`, `_slClosed`, and `_totalClosed` automatically track these partial closures.

Finally, the system supports trailing stop-loss (`_trailingPriceStopLoss`) and take-profit (`_trailingPriceTakeProfit`) prices, which dynamically adjust based on market movements and strategy parameters. These trailing prices override the originally set stop-loss and take-profit levels during execution, providing a more flexible risk and reward management approach.

## Interface ISignalDto

This data structure represents a trading signal, the kind you’d get from an automated system or a human analyst. It defines the basic elements needed to execute a trade.

Each signal includes a direction – whether it’s a "long" (buy) or "short" (sell) position. 

You'll also specify the entry price, a target price for taking profits, and a stop-loss price to limit potential losses.  It’s important to note that your take profit price needs to be higher than the entry price for a long position and lower for a short position, and similarly with your stop-loss. Finally, you can add a note to explain the reasoning behind the signal, and estimate how long the position is expected to last. The system can automatically assign a unique ID if you don't provide one.

## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, represents a trading signal that’s designed to be executed when the price hits a specific target. Think of it as a signal that's patiently waiting for the right market conditions. It builds upon the basic `ISignalRow` and has a crucial element: it's not triggered immediately.

Instead, it sits in a queue, waiting for the market price to reach the `priceOpen` value you’ve defined. Once that price is achieved, it transforms into a standard, active signal.  A key detail is how the `pendingAt` timestamp is handled – it initially reflects the scheduled time but gets updated to the actual time when the signal becomes active. Essentially, it's a mechanism for delayed execution based on price levels.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled trading signal that can be canceled by the user. It builds upon the existing `IScheduledSignalRow` and adds a `cancelId` property. Think of `cancelId` as a unique identifier assigned when a user requests to cancel a specific signal – it allows for tracking and managing those user-initiated cancellations separately. If a signal wasn’t canceled directly by the user, this `cancelId` will simply be absent.

## Interface IRiskValidationPayload

This interface, `IRiskValidationPayload`, holds all the information a risk validation function needs to make a decision. It builds upon `IRiskCheckArgs` and includes details about your portfolio's current state.

You'll find the `pendingSignal` property here, representing the signal that's about to be executed. Because this signal is being used for risk checks, the `priceOpen` value is guaranteed to be available.

The payload also provides insight into your overall exposure, with `activePositionCount` showing the total number of open positions and `activePositions` giving you a list of those positions themselves, each with its own details.

## Interface IRiskValidationFn

This defines how you can check if a trade is safe to execute within the backtest. Think of it as a gatekeeper – it evaluates a potential trade and decides whether to allow it. If everything looks good, the gatekeeper lets the trade proceed. If there’s a problem, like a risk limit being exceeded, it provides a reason why the trade is being rejected, preventing it from happening. The check can be done by returning a rejection reason, or by raising an error which gets translated into a rejection.

## Interface IRiskValidation

This interface helps you define how to check if your trading strategies are behaving responsibly, particularly when it comes to risk. Think of it as setting up rules to make sure your backtesting doesn't go too far or make unrealistic assumptions.

You provide a `validate` function – this is the actual logic that will perform the risk check. It takes parameters related to the risk being evaluated. You can also add a `note` to explain what the validation is meant to do, which is useful for anyone reading the configuration. Essentially, it allows you to create reusable and understandable risk validation steps in your backtesting process.

## Interface IRiskSignalRow

This interface, `IRiskSignalRow`, helps manage risk during backtesting. It builds upon existing signal data to incorporate key pricing information. Specifically, it adds the entry price (`priceOpen`) along with the initially set stop-loss (`originalPriceStopLoss`) and take-profit (`originalPriceTakeProfit`) levels. This data is crucial when validating risk parameters and ensuring positions are handled safely during the backtest.

## Interface IRiskSchema

This interface, `IRiskSchema`, lets you define and register your own risk management rules within the backtest-kit framework. Think of it as a blueprint for how your portfolio will handle risk.

Each risk schema has a unique name for identification and an optional note for developers to explain its purpose.

You can also specify callbacks to be triggered during certain risk management events, like when a trade is rejected or allowed. 

Most importantly, it's the `validations` array where you define the actual rules. This array holds functions or objects that will be executed to determine if a trade meets your portfolio’s risk criteria. You’ll use these validations to ensure your trading strategy stays within acceptable risk boundaries.


## Interface IRiskRejectionResult

This interface, `IRiskRejectionResult`, helps you understand why a trading simulation or strategy validation failed. It's like a little report that appears when something goes wrong during the checks. You'll find a unique `id` to track the specific failure, and a helpful `note` explaining the reason in plain language, making it easier to debug and fix the problem. Think of it as a friendly explanation of what tripped up the validation process.

## Interface IRiskParams

This interface defines the settings you provide when setting up the risk management system for your trading bot. It’s essentially a collection of configurations that dictate how the system behaves. 

You’ll need to specify the `exchangeName`, like "binance", to tell the system which exchange it’s operating on. A `logger` is included so you can easily track what’s happening and debug any issues. The `backtest` setting is crucial – set it to `true` when you're practicing with historical data and `false` when you’re trading live. 

Finally, the `onRejected` callback is a special function that lets you react when a trading signal is blocked because it hits a risk limit. This allows you to emit events or perform other actions before the rejection is officially processed.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, provides the information needed to assess whether a new trade should be allowed. Think of it as a safety check performed before a trading signal is actually created. It bundles together key details like the trading pair’s symbol, the pending signal itself, the name of the strategy suggesting the trade, and information about the exchange and risk profile involved. You'll also find details like the current price and timestamp to help evaluate conditions. It essentially passes along relevant context from the broader trading environment to the risk check logic.

## Interface IRiskCallbacks

This interface defines optional functions that your backtest can use to respond to risk-related events during trading. Think of it as a way to get notified when a trade is blocked by your risk rules or when it’s approved to proceed. 

The `onRejected` function is triggered whenever a trading signal is blocked because it violates your defined risk limits. Conversely, `onAllowed` is called when a signal successfully passes all risk checks and is permitted to execute. These callbacks allow you to log these events, trigger alerts, or perform other actions based on your risk management strategy.

## Interface IRiskActivePosition

This interface describes a single, active trading position being monitored for risk assessment across multiple strategies. Think of it as a snapshot of a trade that's currently open.

It contains key details like the name of the strategy that initiated the trade, the exchange it's on, and the specific trading symbol involved (like BTCUSDT). You’ll also find information about the direction of the trade (long or short), the entry price, and any stop-loss or take-profit levels set.

The `minuteEstimatedTime` helps estimate how long the position has been active and `openTimestamp` indicates the precise time the trade began. This data helps assess overall risk exposure by combining information from different trading strategies.

## Interface IRisk

This interface defines how a system manages and enforces risk rules for trading. It’s responsible for ensuring that trades align with pre-defined risk limits and for keeping track of open positions. 

The `checkSignal` function is the gatekeeper—it evaluates a potential trade based on risk parameters and decides whether it's permissible. 

When a trade is executed, `addSignal` registers the position, allowing the system to monitor its progress and manage risk exposure. Conversely, when a trade closes, `removeSignal` cleans up the records, ensuring accurate tracking.


## Interface IReportTarget

This interface lets you fine-tune which kinds of data backtest-kit records during a backtest or live trading session. Think of it as a way to control the level of detail in your event logs.

You can specifically turn on or off logging for things like risk rejections, breakeven points, partial order closures, heatmap data, walker iterations, performance metrics, scheduled signals, live trading activity, and backtest signal closures. This gives you great control over what information is captured and makes it easier to focus on the aspects of your trading strategy you want to analyze. By selectively enabling these options, you can manage the size of your logs and improve the clarity of your results.

## Interface IReportDumpOptions

This interface, `IReportDumpOptions`, helps you organize and filter the data when writing reports from your backtesting runs. Think of it as a set of labels you can apply to your trading data. You’ll specify things like the trading pair (like "BTCUSDT"), the name of your strategy, the exchange you’re using, and the timeframe you’re analyzing. It also includes identifiers for specific signals and walker optimizations, letting you drill down into very specific aspects of your backtest results. Essentially, this allows for a more targeted and detailed analysis of your trading performance.

## Interface IPublicSignalRow

The `IPublicSignalRow` interface provides a way to share signal data with users while maintaining transparency about the original trade parameters. It builds upon the core `ISignalRow` and adds `originalPriceStopLoss` and `originalPriceTakeProfit` properties. These original stop-loss and take-profit values are the ones set when the signal was initially created, and they remain constant even if trailing stop-loss or trailing take-profit features are in use, allowing users to see the initial trade plan alongside the current, potentially adjusted, levels.

Also included is `totalExecuted`, which tracks the total percentage of the position closed through partial executions. This value is the sum of all partial close percentages, indicating how much of the original position has been closed out.

## Interface IPositionSizeKellyParams

The `IPositionSizeKellyParams` interface helps you define the parameters needed for calculating position sizes using the Kelly Criterion. It's all about figuring out how much to risk on each trade based on your expected performance. You'll provide two key pieces of information: your win rate, which represents the percentage of trades you expect to win, and your average win/loss ratio, which tells you how much you typically make on a winning trade compared to how much you lose on a losing one. These parameters are used to determine an appropriate position size for each trade.

## Interface IPositionSizeFixedPercentageParams

This interface defines the parameters needed to calculate your position size using a fixed percentage approach. It focuses on sizing based on a percentage of your account balance.

The key property is `priceStopLoss`, which represents the price at which your stop-loss order will be triggered to limit potential losses. This value is crucial for determining the appropriate position size, as it influences the risk associated with the trade.

## Interface IPositionSizeATRParams

This interface defines the parameters needed for calculating position sizes based on the Average True Range (ATR). It's primarily used to control how much capital you allocate to a trade based on the ATR's volatility measurement.

The `atr` property holds the current Average True Range value, which directly impacts the size of the position taken. A higher ATR suggests greater volatility, and consequently, a smaller position size might be used to manage risk.

## Interface IPersistBase

This interface defines how components interact with persistent storage, letting them read, write, and check for the existence of data. Think of it as a standard set of tools for saving and retrieving information.

The `waitForInit` method ensures the storage area is ready and any necessary setup is done only once.  `readValue` retrieves a specific piece of data, while `hasValue` quickly checks if that data even exists.  `writeValue` is used to save data, guaranteeing it's written reliably. Finally, `keys` gives you a way to list all the available data identifiers.

## Interface IPartialData

This data structure helps save and load important progress information for your trading signals. Think of it as a snapshot of where a signal stands, particularly focusing on the profit and loss levels it has encountered. Because some data types don't easily translate into a format that can be stored, it converts sets of profit and loss levels into simple arrays. This makes it easy to keep track of signals even when you need to restart your backtesting process. It’s used to store information related to a specific signal and later rebuilds it into a complete state.


## Interface IPartial

This interface, `IPartial`, is all about keeping track of how well (or not) your trading signals are performing. It handles the progress of signals, specifically noting when they hit certain profit or loss milestones like 10%, 20%, or 30%.

There are three main functions you'll find here:

*   `profit`: This one gets called when a signal is making money. It figures out if any new profit levels have been reached and sends out notifications.
*   `loss`:  Similar to `profit`, but this is for when a signal is losing money. It tracks loss levels and sends out alerts.
*   `clear`: This function is used when a signal is finished – whether it hits a target profit or loss, or simply expires. It cleans up the signal’s record, removes it from memory, and makes sure everything is saved properly.

Essentially, `IPartial` ensures you get timely updates on your signal's performance and provides a clean way to manage their lifecycle.

## Interface IOptimizerTemplate

This interface, `IOptimizerTemplate`, acts as a blueprint for creating pieces of code and messages used within the backtest-kit framework. Think of it as a code generator – it provides methods to build different components needed for running and analyzing trading strategies.

It can create things like:

*   A debugging helper function (`getJsonDumpTemplate`) to easily inspect data.
*   The initial setup code (`getTopBanner`) that includes necessary imports and configurations.
*   Default messages for interacting with a Large Language Model (LLM) – both what a user might say (`getUserMessage`) and what the assistant would respond with (`getAssistantMessage`).
*   Configuration code for key components like Walkers (`getWalkerTemplate`), Exchanges (`getExchangeTemplate`), Frames (time periods) (`getFrameTemplate`), and Strategies (`getStrategyTemplate`).
*   The code to actually start the whole process – the launcher (`getLauncherTemplate`).
*   Simple helper functions for text and JSON output from LLMs (`getTextTemplate`, `getJsonTemplate`).

Essentially, `IOptimizerTemplate` simplifies the process of setting up and running backtesting experiments by automatically generating a lot of the boilerplate code.

## Interface IOptimizerStrategy

This interface, `IOptimizerStrategy`, holds all the information about a trading strategy that was created using an LLM. Think of it as a complete record of how the strategy came to be.  It includes the trading symbol the strategy is designed for, a unique name to identify it, and the entire conversation history with the LLM that led to its creation – including your initial prompts and the LLM’s responses. Crucially, it also stores the actual strategy description itself, which is the code or rules the system uses to make trading decisions.

## Interface IOptimizerSourceFn

The `IOptimizerSourceFn` lets you provide data to the backtest-kit optimizer, which is crucial for finding the best strategies. Think of it as a way to feed your optimizer historical data to learn from.  It’s designed to handle large datasets efficiently by allowing you to retrieve data in chunks, or pages.  Each piece of data you provide needs to have a unique identifier – this helps the optimizer keep track of everything.

## Interface IOptimizerSource

This interface describes where your backtest data comes from and how it's presented to a language model. You’ll define a unique name for your data source, along with a short description to help you identify it. 

The most important part is the `fetch` function, which tells backtest-kit how to retrieve the data, making sure it can handle large datasets using pagination. 

You also have the option to customize how the user and assistant messages look. If you don't provide these custom formatters, backtest-kit will use its default formatting.

## Interface IOptimizerSchema

This schema defines the blueprint for how backtest-kit creates and evaluates trading strategies using optimization techniques. Think of it as a configuration file that tells the system where to get data, how to generate strategy ideas, and how to measure their performance. 

You specify training time periods – these are different slices of historical data used to create slightly varied strategy versions that are then compared against each other.  A separate testing period is designated to evaluate the overall effectiveness of these generated strategies. 

The schema incorporates data sources, which provide the information needed to fuel the strategy generation process.  A key function, `getPrompt`, takes the conversation history built from these data sources and crafts a specific prompt for generating trading strategies. 

You can also customize the strategy generation process with optional templates, or define callbacks to track the progress and events of the optimization process.  Finally, each optimizer setup needs a unique name for identification and retrieval.

## Interface IOptimizerRange

This interface, `IOptimizerRange`, helps you specify the timeframe for backtesting or optimization. Think of it as defining the "window" of historical data your strategies will be evaluated against.  It has three key pieces of information: a `note` for describing the range (like "2023 Bear Market"), a `startDate` to mark the beginning date (inclusive), and an `endDate` to mark the end date (also inclusive). You'll use these properties to tell the system exactly what historical periods to use for training or testing your trading strategies.

## Interface IOptimizerParams

This interface defines the settings needed when creating an optimizer within the backtest-kit framework. Think of it as a blueprint for configuring how the optimization process will run. It includes a logger, which is essential for tracking what’s happening and identifying any issues during optimization – you’ll get helpful messages to guide you. 

It also incorporates a complete template, effectively combining your custom template with default settings, ensuring everything functions correctly and consistently. This template dictates the available strategies and the overall structure of the optimization process.

## Interface IOptimizerFilterArgs

This interface defines the information needed to fetch specific data for backtesting. Think of it as a way to tell the system precisely which trading pair, and what timeframe, you want data for. You'll provide the symbol, like "BTCUSDT," along with a start and end date to specify the period of data you’re interested in. It's used behind the scenes to efficiently retrieve only the data relevant to your backtest.

## Interface IOptimizerFetchArgs

This interface defines the information needed when fetching data in a paginated way. Think of it as providing instructions for how much data to retrieve at a time. It builds upon existing filter arguments by adding details about pagination. 

You'll use the `limit` property to specify the maximum number of records you want to grab in a single request - the default is 25, but you can change it. The `offset` property tells the system how many records to skip over before starting to return results; this is how you navigate through pages of data.

## Interface IOptimizerData

This interface, `IOptimizerData`, is the foundation for providing data to the backtest-kit's optimization engine. Think of it as a standard way to structure the information that the optimizer needs. Each piece of data you supply *must* have a unique `id`, which is really important for preventing duplicates when you're dealing with large datasets or fetching data in chunks. This `id` acts like a fingerprint, ensuring that the optimizer doesn't process the same information multiple times.


## Interface IOptimizerCallbacks

The `IOptimizerCallbacks` interface allows you to observe and potentially influence what happens during the optimization process. Think of it as a set of hooks that let you peek inside and react to key events.

You can use the `onData` callback to inspect the data generated for each trading strategy after it's been created. This is a good place to log information or double-check that the data looks correct.

The `onCode` callback fires when the code for a strategy is ready.  You might use this to log the generated code or perform any validation steps.

Similarly, `onDump` gets triggered after the strategy code has been written to a file, providing another opportunity for logging or additional actions.

Finally, `onSourceData` is called whenever data is fetched from a data source. It gives you access to the raw data, the source it came from, and the date range it covers, so you can log or validate the imported data.

## Interface IOptimizer

The `IOptimizer` interface helps you create and export trading strategies using a TypeScript framework. It lets you retrieve data to understand how strategies would perform, generate the actual code for those strategies, and then save that code to files for easy use. Think of it as a way to automate the process of building and deploying your trading logic. 

The `getData` method gathers information and prepares it for strategy creation, essentially setting up the foundation. `getCode` then assembles everything into a complete, runnable strategy file. Finally, `dump` takes that generated code and saves it to a file, making it ready to be integrated into your trading system.


## Interface InfoErrorNotification

This interface represents a notification you'll receive when a background task encounters a problem that can be handled without stopping the entire backtest. Think of it as a gentle heads-up about something that needs attention.

Each notification includes an identifier (`id`) to help you track it, a timestamp (`timestamp`) for when the issue occurred, and a boolean `backtest` flag.

The core of the notification is the `error` object itself, providing details about the specific problem, along with a human-readable `message` to explain what happened. The `type` will always be `"error.info"` for these kinds of notifications.


## Interface IMethodContext

This interface, `IMethodContext`, helps your backtesting framework know exactly which configurations to use for each step of a trade. Think of it as a set of instructions that gets passed around to guide the system. It tells the framework which exchange, strategy, and frame configurations are relevant for a particular operation. 

It contains three key pieces of information: the name of the exchange, the name of the strategy, and the name of the frame. The frame name will be empty when running in live mode, indicating that it’s not using a backtesting framework. This context ensures that the correct strategy, exchange, and frame instances are loaded and used consistently.


## Interface IMarkdownTarget

This interface lets you choose which detailed reports are generated within the backtest-kit framework. Think of it as a way to fine-tune the level of information you receive about your trading strategies.

You can toggle on reports to monitor things like risk rejections, when stop losses adjust to your entry price, partial profit/loss events, and portfolio performance visualized as a heatmap. 

It also provides options to track strategy comparisons, performance bottlenecks, scheduled signals, live trading activity, and most importantly, the core backtest results with a complete history of trades.  By enabling only the reports you need, you can keep the output manageable and focus on the most important aspects of your strategy's behavior.

## Interface IMarkdownDumpOptions

This interface, IMarkdownDumpOptions, defines the settings used when creating markdown reports for your backtesting results. Think of it as a way to organize and filter the information that gets included in those reports. It bundles together details like the directory where the report will be saved, the specific file name, the trading pair being analyzed (like BTCUSDT), the name of the strategy used, the exchange involved, the timeframe (frameName), and a unique identifier for any signals generated.  Essentially, it provides all the context needed to pinpoint and document a particular backtest scenario.

## Interface ILogger

The `ILogger` interface provides a standard way for different parts of the backtest-kit framework to record information. It allows components like agents and sessions to log messages about what they're doing, whether it's a simple update, a helpful detail for debugging, or a warning about something that might need investigation. You can use the `log` method for general events, `debug` for in-depth diagnostic information (usually for developers), `info` for standard progress updates, and `warn` for potential issues that don't stop the system but should be checked. This makes it much easier to track down problems and understand how the system is operating.


## Interface IHeatmapRow

This interface represents a row of data in a portfolio heatmap, giving you a quick view of how a specific trading pair performed. It collects key statistics from all strategies applied to that symbol, like total profit or loss, risk-adjusted return (Sharpe Ratio), and the largest drawdown experienced.

You'll find details on the number of trades executed, how many were wins versus losses, and the overall win rate. It also breaks down performance by showing the average profit per trade, how volatile the results were (standard deviation), and how much profit was made relative to losses (profit factor).

Finally, it includes streak information—the longest winning and losing sequences—and expectancy, which offers an estimate of long-term profitability.  Essentially, each `IHeatmapRow` summarizes the complete trading history for a single symbol within your backtest.

## Interface IFrameSchema

This describes a "frame" within the backtest-kit system, essentially defining a specific period and frequency for generating data. Think of it as a slice of time you're analyzing. Each frame has a unique name to identify it, and you can add a note to explain its purpose.

The `interval` property dictates how often timestamps are created within this frame – daily, hourly, or some other frequency.  You’ll also specify the `startDate` and `endDate` to clearly mark the beginning and end of the backtest period this frame represents. Finally, `callbacks` let you hook into different stages of the frame's lifecycle, allowing for custom actions if needed.


## Interface IFrameParams

The `IFramesParams` interface helps you set up the environment for your backtesting. Think of it as a way to provide essential configuration details when creating a `ClientFrame`. 

It builds upon `IFramesSchema`, adding a really useful tool: a `logger`. This `logger` lets you track what's happening during your backtest and helps you debug any issues you might encounter. It's your window into what the backtest framework is doing behind the scenes.

## Interface IFrameCallbacks

This interface provides a way for you to react to changes in the timeframe your backtest is using. Specifically, the `onTimeframe` property lets you run custom code whenever a new set of dates and intervals are calculated for your backtest, like logging the dates or confirming the timeframe looks correct. You’ll receive the array of dates, the start and end dates of the timeframe, and the interval being used. This gives you fine-grained control and visibility into how your backtest is operating.


## Interface IFrame

The `IFrame` interface is a core component that helps manage and generate the timeline for your backtesting simulations. Think of it as the system's way of creating a calendar of moments in time for your trading strategies to analyze. It provides a method, `getTimeframe`, that you can use to get a list of specific dates and times for a given trading symbol and timeframe (like "1 minute" or "1 day"). This list of timestamps is then used to guide the backtest, ensuring that your strategy is evaluated at consistent intervals. Essentially, it sets the rhythm of your historical data analysis.

## Interface IExecutionContext

This interface, `IExecutionContext`, essentially provides the necessary information for your trading strategies and exchanges to operate correctly. Think of it as a container holding the current state of things during a trade. 

It carries details like the trading symbol, such as "BTCUSDT" for Bitcoin against USDT, and the precise timestamp representing the "now" moment for any actions being taken. Importantly, it also indicates whether the system is in backtest mode – a simulated environment for testing – or live trading mode. This context is automatically passed around by the framework to ensure your code has the data it needs.

## Interface IExchangeSchema

This interface describes how backtest-kit interacts with different cryptocurrency exchanges. Think of it as a blueprint for connecting to an exchange and getting the data it needs to run trading simulations. 

Each exchange you want to use needs to be registered with backtest-kit, and this schema defines what that registration looks like. 

You provide a unique name for the exchange, an optional note for yourself to remember details, and most importantly, a function (`getCandles`) that tells backtest-kit how to retrieve historical price data (candles) from that exchange.

It also includes functions for ensuring that trade quantities and prices are formatted correctly to match the exchange’s specific rules – preventing errors due to incorrect precision.

Finally, you can optionally specify callback functions to be notified about events like new candle data arriving, allowing for customized data handling.


## Interface IExchangeParams

The `IExchangeParams` interface defines the information needed to set up an exchange connection within the backtest-kit framework. Think of it as a way to pass in essential configuration details. 

It requires a `logger` so you can track what's happening during your backtesting and debug any issues.  You also need to provide an `execution` context, which tells the exchange what market it's operating in – which symbols, the time period, and whether it's a real trade or just a backtest simulation. Essentially, it's the environment the exchange will operate in.

## Interface IExchangeCallbacks

This interface lets you define functions that your backtest kit system will call when it receives new candlestick data from an exchange. You can use these callbacks to react to incoming data, like updating visualizations or performing real-time analysis.  The `onCandleData` function is triggered whenever the backtest kit pulls candle data for a specific trading symbol and time interval. It provides the symbol, interval, a timestamp indicating when the data was retrieved, the number of data points requested, and an array containing the actual candle data.

## Interface IExchange

The `IExchange` interface defines how backtest-kit interacts with a cryptocurrency exchange. It’s the foundation for getting historical and future price data, and for properly formatting order quantities and prices to match the exchange's requirements.

You'll use `getCandles` to retrieve past candle data, and `getNextCandles` to fetch future candle data, which is crucial for backtesting strategies.  `formatQuantity` and `formatPrice` handle the specifics of how quantities and prices should be represented on different exchanges. 

Finally, `getAveragePrice` provides a quick way to calculate the Volume Weighted Average Price (VWAP) based on recent trading activity. It uses the standard VWAP formula, considering the high, low, and close prices of each candle along with its volume.

## Interface IEntity

This interface, `IEntity`, serves as a foundation for all objects that are saved and retrieved from storage within the backtest-kit framework. Think of it as a common blueprint, ensuring that every persistent element has a unique identifier. It's the starting point for defining the structure of data you want to store and manage during your backtesting process.

## Interface ICandleData

This interface describes a single candlestick, the fundamental building block for analyzing price data and running backtests. Each candlestick represents a specific time interval and contains key information like when it started (`timestamp`), the price when it opened (`open`), the highest and lowest prices during that time (`high`, `low`), the price when it closed (`close`), and the total trading volume (`volume`). Think of it as a snapshot of price action over a particular period, essential for understanding market behavior and evaluating trading strategies. You’ll see this data structure used extensively when calculating things like VWAP and when running backtests to simulate how a strategy would have performed.

## Interface IBreakevenData

This interface, `IBreakevenData`, is all about saving and loading information about whether a trade has hit its breakeven point. Think of it as a simplified snapshot of the more detailed breakeven state. It's used to store this data in a way that can be easily saved to a file or database, particularly when working with the persistence adapter.  Essentially, it holds a single piece of information: whether the breakeven has been achieved, represented by a simple `true` or `false` value. This makes it easy to serialize and deserialize, allowing the framework to remember the breakeven status even after restarting.

## Interface IBreakeven

This interface helps track when a trading signal's stop-loss can be moved to the original entry price, essentially achieving a breakeven point. It’s used by systems that manage trading strategies and connections.

The `check` method is the core of this process; it regularly assesses if the price has moved favorably enough to cover any transaction costs, allowing the stop-loss to be adjusted to the entry price. It's called during the active monitoring of a trading signal and involves several checks to confirm it's safe to move the stop-loss.

The `clear` method cleans up the breakeven tracking when a signal is closed – whether it hits a target price, a stop-loss, or its time expires. This ensures resources are released and the tracking is removed when no longer needed.

## Interface HeatmapStatisticsModel

This structure holds the overall performance metrics for your entire portfolio when visualizing it with a heatmap. It breaks down the key figures, giving you a high-level view of how your investments are doing. 

You'll find a list of individual symbol statistics within the `symbols` array, alongside the total count of symbols being tracked.  The structure also provides the portfolio's total profit and loss (`portfolioTotalPnl`), its Sharpe Ratio (`portfolioSharpeRatio`), and the total number of trades executed across all symbols (`portfolioTotalTrades`). This gives you a comprehensive summary to quickly assess portfolio health.


## Interface DoneContract

This interface describes what you get when a background process finishes, whether it's a backtest or a live trade.  It tells you which exchange was used, the name of the trading strategy that ran, and importantly, whether it was a backtest or a live execution. You’ll also find the trading symbol involved, like "BTCUSDT", and the name of the specific frame used in backtesting. Essentially, it's a notification with details about a completed background task, letting you know exactly what happened and where.


## Interface CriticalErrorNotification

This notification signals a serious, unrecoverable problem within the backtest process that necessitates stopping everything. When a critical error occurs, this notification gets sent to inform your application about the issue. It includes details like a unique identifier for the error, a descriptive error message, the time the error happened, and a flag indicating whether it occurred during a backtest. The error itself is also included as an object, providing further technical information to help diagnose the root cause.

## Interface ColumnModel

This defines a way to structure data for creating tables, particularly useful when you want to display information in a readable format.  Think of it as a blueprint for how each column in a table should look and behave. Each column has a unique identifier (`key`) and a user-friendly label (`label`) that will appear in the table header.  You can also provide a `format` function to customize how the data within each cell is displayed – it transforms the raw data into a string. Finally, `isVisible` allows you to conditionally show or hide a column based on certain conditions.

## Interface BreakevenStatisticsModel

This model holds the information about breakeven events encountered during a backtest. It essentially gives you a way to understand how often your trading strategy reached a breakeven point.

You'll find a detailed list of each individual breakeven event, including all the relevant data for each one. 

Alongside that, there's a simple count showing the total number of times a breakeven event occurred. This allows for quick assessment of how frequently the strategy reached this milestone.

## Interface BreakevenEvent

The BreakevenEvent provides a standardized way to track when a trading signal has reached its breakeven point. It bundles together key details about that event, making it easier to generate reports and analyze performance. 

You'll find information like the exact time the breakeven was hit, the trading symbol involved, the name of the strategy that generated the signal, and a unique identifier for that signal. 

It also includes the entry price (breakeven level), the initially set take profit and stop loss prices, as well as their original values when the signal was created.  You can also access information regarding partial closes, a description of the signal, and whether the trade occurred during a backtest or in live trading conditions. Essentially, this event provides a snapshot of what happened at a crucial point in a trade's lifecycle.


## Interface BreakevenContract

This describes a `BreakevenContract`, which is a notification sent when a trading signal’s stop-loss order is adjusted to the entry price – effectively, the trade has reached a breakeven point. It’s used to monitor how a trading strategy is managing risk and achieving milestones, like recovering initial costs.

Each signal only triggers this event once to prevent duplicates. A breakeven event happens when the price moves sufficiently in a profitable direction to cover the transaction costs associated with the trade.

The notification includes details like the trading pair's symbol, the strategy's name, the exchange being used, the timeframe, all the original signal data, the current price at the time of breakeven, whether it was a backtest or live trade, and a timestamp marking when it occurred.  This information is valuable for generating reports and allowing users to react to the breakeven event directly.

## Interface BootstrapNotification

This notification signals the start of the backtest-kit's notification tracking system. Think of it as a "ready" signal – it indicates that the system is set up and ready to record events. Each time a backtest run begins, you'll receive a bootstrap notification, providing a unique identifier and a timestamp for that specific tracking session. This allows you to reliably associate all subsequent notifications with a particular backtest execution.

## Interface BacktestStatisticsModel

This model holds all the key statistics generated from a backtest, allowing you to thoroughly assess how your trading strategy performed. It includes a detailed list of every trade that was closed, giving you access to individual trade data like price and profit/loss. You'll find counts of winning and losing trades, and calculations like win rate, average profit per trade, and total profit across all trades. 

Several important risk and reward metrics are also provided, such as standard deviation (a measure of volatility), Sharpe Ratio (which considers risk when evaluating returns), and annualized Sharpe Ratio.  You’ll also see a certainty ratio, which compares average winning trades to average losing trades, and an estimate of expected yearly returns. Note that any values marked as "null" mean the calculation couldn't be safely performed due to data issues, so don't rely on them.


## Interface BacktestDoneNotification

This notification signals that a backtest has finished running. It’s sent when the backtest process is complete and provides key details about the test.

You’ll receive this notification to know when you can access the results. The notification includes the unique identifier of the backtest, a timestamp marking when it concluded, and confirmation that it was indeed a backtest. 

It also shares information such as the trading symbol involved, the name of the strategy used, and the name of the exchange the data originated from. This gives you a complete picture of what was tested.

