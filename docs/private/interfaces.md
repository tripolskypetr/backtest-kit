---
title: private/internals
group: private
---

# backtest-kit api reference

![schema](../assets/uml.svg)

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

This interface defines the information shared when a walker is being stopped. Think of it as a notification saying, "Hey, we need to halt a specific trading strategy on a particular asset!" It includes the trading symbol, the name of the strategy being stopped, and the name of the walker that’s being interrupted. The walker name is important because you might have multiple walkers working on the same asset at once, and this lets you target the correct one. It's used when you need to pause or end a trading process within the backtest-kit framework.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps organize and understand the results of backtesting different trading strategies. It builds upon the IWalkerResults interface, adding extra information for comparing strategy performance. 

The core of this model is the `strategyResults` property, which is a list of all the results gathered from running each strategy. This list allows for easy comparison and analysis of how different approaches performed during the backtest.

## Interface WalkerStatistics

WalkerStatistics helps you easily understand and compare the performance of different trading strategies. Think of it as a container holding all the results you get when running a backtest. 

It builds upon a standard result set, but adds extra information specifically designed to make comparing strategies much simpler.

The core of this structure is `strategyResults`, which is simply a list of all the results generated during the backtesting process. You’ll use this list to examine how each strategy fared.

## Interface WalkerContract

The WalkerContract describes what happens as backtest-kit runs comparisons between different trading strategies. Think of it as a notification you receive each time a strategy finishes its test run and its results are being assessed. 

It gives you a snapshot of the current state of the comparison, including details like the name of the strategy that just finished, the specific asset it was trading (symbol), and the exchange and timeframe used. 

You'll see key performance statistics for that strategy, along with the metric it was optimized for (like Sharpe Ratio or Sortino Ratio) and its value.  Crucially, it also tells you what the best performing strategy has been so far, along with its metric value, and how many strategies have been tested compared to the total number planned. This helps track progress during the backtest comparison process.

## Interface WalkerCompleteContract

This interface describes what's emitted when a backtesting process, known as a "walker," finishes running and all the results are ready. It packages up a lot of important information about the completed test. You'll find details like the name of the walker, the trading symbol being analyzed, the exchange and timeframe used, and the optimization metric being tracked. 

It also tells you how many strategies were tested, identifies the top-performing strategy, and provides the specific metric score and full statistical details for that best strategy. Essentially, it's a complete report card for a walker's run.


## Interface TickEvent

This interface, `TickEvent`, acts as a central container for all the data you receive about a trade event, no matter if it's a new signal, an open position, or a closed trade. Think of it as a standardized report card for each tick in your backtesting process. 

Each `TickEvent` has a timestamp, indicating when the event happened.  You’ll also find the `action` type—whether it’s an idle state, a new position being opened, a trade actively running, or a trade being closed.

For trades that are actively running, it holds details like the symbol being traded, the signal's ID, and the position type (long or short). It also provides key pricing information, including the opening price, take profit levels, stop loss levels, and progress towards those targets. 

When a trade is closed, the `TickEvent` includes information about the profit and loss, the reason for the closure, and how long the trade lasted. The `note` field provides additional context related to a specific signal.

## Interface SignalData$1

This data structure holds information about a completed trading signal, helping you analyze performance. Each signal is identified by a unique ID and associated with a specific strategy. It includes details like the trading symbol, whether the position was long or short, and the percentage profit or loss (PNL) achieved. You'll also find the reason for closing the signal, alongside the exact times the signal was opened and closed, allowing for detailed backtesting and performance evaluation.

## Interface ScheduleStatisticsModel

The `ScheduleStatisticsModel` helps you understand how your scheduled signals are performing over time. It tracks important metrics related to scheduling, activation, and cancellation.

You'll find a detailed list of all scheduled events in the `eventList` property. The model also provides counts for the total number of events, specifically how many were scheduled, opened (activated), and cancelled.

Key performance indicators like the `cancellationRate` and `activationRate` are included, showing you how often signals are cancelled versus activated, expressed as percentages. If signals are being cancelled frequently, you might want to review your scheduling logic.  Similarly, the `activationRate` can highlight areas for improvement in signal generation.

Finally, `avgWaitTime` and `avgActivationTime` give you insights into how long signals typically wait before being cancelled or activated, allowing you to fine-tune your timing strategies.

## Interface ScheduleStatistics

This object gathers statistics related to scheduled trading signals within the backtest-kit framework. It provides a comprehensive view of signal scheduling, activation, and cancellation activities.

You'll find a detailed list of every scheduled event, including when they were scheduled, opened, or cancelled, within the `eventList` property.  The `totalEvents` property simply counts the total number of events processed. You can also track specific numbers like the total scheduled signals (`totalScheduled`), the signals that were successfully activated (`totalOpened`), and the signals that were cancelled (`totalCancelled`). 

To gauge performance, the `cancellationRate` shows the percentage of scheduled signals that were cancelled – a lower rate is desirable. The `activationRate` shows what percentage of signals were actually opened for trading – a higher rate is better.  Finally, if you have cancelled or opened signals, you can see the average wait times (`avgWaitTime` and `avgActivationTime`, respectively) to better understand signal behavior.

## Interface ScheduledEvent

This interface, `ScheduledEvent`, neatly packages together all the details about events related to your trading signals – whether they were scheduled, opened, or cancelled. Think of it as a single container holding everything you need to analyze and report on these events.

Each `ScheduledEvent` includes the exact time it happened (`timestamp`), what type of event it was (`action`), the trading pair involved (`symbol`), and a unique identifier for the signal (`signalId`). You'll also find information about the trade itself, like the position type (`position`), any notes associated with the signal (`note`), and key price levels like the entry price (`priceOpen`), take profit (`takeProfit`), and stop loss (`stopLoss`).

For events that have ended, like cancelled or opened signals, you’ll also find additional data such as the close timestamp (`closeTimestamp`) and the duration the signal was active (`duration`). This makes it really easy to understand the entire lifecycle of a trading signal and how it performed.

## Interface RiskStatisticsModel

This model holds information about risk rejections, helping you understand where your risk management is being triggered. It collects data from individual rejection events, giving you a detailed list of each one. You'll find the total number of rejections overall, and also breakdowns showing how many rejections occurred for each symbol and for each strategy you’re using. This lets you easily pinpoint areas needing attention or adjustments in your risk controls.

## Interface RiskStatistics

This interface helps you understand how often and why risk rejections occurred during your backtesting. It gives you a detailed breakdown of risk events, allowing you to monitor and improve your risk management strategies. You’ll find a complete list of rejection events, a total count of rejections, and breakdowns categorized by the symbol and strategy involved. This information is valuable for identifying patterns and areas where your risk controls might need adjustments.

## Interface RiskEvent

This data structure represents an event triggered when a trading signal is rejected due to risk management rules. It provides detailed information about why a signal couldn't be executed. 

You’ll find the exact time the rejection happened, along with the symbol being traded, the specifics of the signal itself, and the name of the strategy and exchange involved. It also includes the current market price at the time of rejection, the number of positions already open, and a reason explaining why the signal was blocked. Think of it as a record of a risk limit being hit and preventing a trade.

## Interface RiskContract

The `RiskContract` represents a rejected trading signal due to risk validation. It's a record of when the system prevented a trade from happening because it exceeded defined risk limits.

Think of it as a notification whenever a trading strategy's request is blocked by the risk management system.

Key details included are the trading pair symbol (`symbol`), the specifics of the signal that was rejected (`pendingSignal`), which strategy requested it (`strategyName`), the exchange involved (`exchangeName`), the price at the time (`currentPrice`), how many positions were already open (`activePositionCount`), and a brief explanation of why it was rejected (`comment`). A timestamp (`timestamp`) marks exactly when the rejection occurred. This information helps you understand and monitor potential risk violations and is used for reporting and user notifications.

## Interface ProgressWalkerContract

This interface describes the updates you’ll receive as a background process, like analyzing strategies, runs. It lets you know what's happening during that process, giving you details like the name of the process, the exchange being used, and the trading symbol involved. You'll see the total number of strategies being evaluated, how many have been processed already, and the overall percentage of completion. Essentially, it's a way to monitor the progress of lengthy operations.

## Interface ProgressOptimizerContract

This interface helps you monitor the progress of your trading strategy optimizers. It provides updates during the optimization process, letting you know what's happening behind the scenes. You'll see information like the optimizer's name, the trading symbol being optimized (like BTCUSDT), the total number of data sources the optimizer needs to handle, and how many it's already processed. Finally, a percentage value shows you the overall completion of the optimization.

## Interface ProgressBacktestContract

This interface describes the updates you'll receive as a backtest runs in the background. It provides information about which exchange and strategy are being tested, the trading symbol involved, and how far along the backtest is. You’ll see the total number of historical data points (frames) the backtest will use, the number of frames it has already analyzed, and the overall progress as a percentage. This helps you monitor the backtest's status and estimate how much longer it will take to complete.


## Interface PerformanceStatisticsModel

This model holds all the performance data collected during a backtest or simulation. Think of it as a report card for your trading strategy. 

It includes the strategy's name so you know which strategy the data belongs to, as well as the total number of events and the overall execution time. 

The `metricStats` property provides a breakdown of performance by different categories, and the `events` property contains the complete raw data for detailed inspection. You can use this information to understand how well your strategy performed and pinpoint areas for improvement.


## Interface PerformanceStatistics

This object bundles together a strategy's performance data, giving you a clear picture of how it ran. It holds the strategy's name, the total number of events logged during the backtest, and the overall execution time.  You’ll also find a breakdown of statistics categorized by metric type, and a full list of the raw performance events for detailed inspection. Think of it as a comprehensive report card for a single trading strategy.

## Interface PerformanceContract

The `PerformanceContract` interface helps you keep tabs on how your trading strategies are performing. Think of it as a way to measure how long different parts of your system take to execute. 

It records key information like when an operation started and finished (`timestamp`, `previousTimestamp`), what type of operation it was (`metricType`), and how long it took (`duration`). You'll also find details linking it to specific strategies (`strategyName`), exchanges (`exchangeName`), and trading symbols (`symbol`). Finally, it indicates whether the data comes from a backtest or live trading environment (`backtest`). This data is invaluable for spotting slowdowns or areas for optimization within your trading framework.

## Interface PartialStatisticsModel

This model holds statistics about partial trades, giving you a snapshot of how your strategy performs when it takes profits or cuts losses early. It breaks down the data into a list of individual events, the total number of times those events occurred, and then separates that into the number of profitable events and the number of losing events. Think of it as a way to track the effectiveness of your partial trade management. You can access each event’s full details through the `eventList` array, while `totalEvents`, `totalProfit`, and `totalLoss` provide quick summary numbers.

## Interface PartialStatistics

PartialStatistics helps you keep track of how your trading strategy performs when it makes partial adjustments to positions. It gives you a detailed breakdown of each profit or loss event that occurred, letting you see exactly what happened and when. 

You can view a complete list of those events, along with their details, using the `eventList` property. To get a general sense of performance, you’ll also find the `totalEvents` count which represents all instances of profit and loss, and specific counts for `totalProfit` and `totalLoss` events. This allows you to monitor trends and understand the overall behavior of your strategy.

## Interface PartialProfitContract

The PartialProfitContract represents a signal achieving a specific profit milestone during trading. Think of it as a notification that your strategy has reached, say, a 20% profit target. It includes important details like the trading symbol (e.g., BTCUSDT), the strategy name generating the signal, and the exchange it's being executed on.

You'll also find the full details of the signal itself, the current market price at the time of the profit milestone, and, crucially, the profit level reached (10%, 20%, etc.). A flag indicates whether this event occurred during a backtest (historical data) or live trading. Finally, it contains a timestamp marking exactly when this profit level was detected.

This contract is used by systems to track performance and allows users to monitor their strategy's progress through callbacks. Events are designed to be deduplicated, and multiple levels can occur within a single market tick if prices fluctuate rapidly.

## Interface PartialLossContract

The PartialLossContract represents when a trading strategy hits a predefined loss level, like a 10% or 20% drawdown. Think of it as a notification that your strategy is experiencing a loss. It provides key information about this event, including the trading pair (symbol), the strategy's name, the exchange being used, and the complete details of the signal that triggered it.

You'll also find the current market price at the time of the loss, the specific loss level reached (e.g., 20% loss), and whether the event occurred during a backtest (historical data) or live trading.  A timestamp indicates when this loss level was detected, aligning with either real-time tick data or the candle's timestamp during backtesting. This information is useful for tracking how strategies perform under adverse conditions and for generating performance reports.

## Interface PartialEvent

This interface defines the data structure for partial profit and loss events, designed to be used when generating reports about a trading strategy's performance. Each event represents a milestone reached, such as hitting a 10% profit or a 20% loss level. 

The event records key details including when it happened (timestamp), whether it was a profit or loss, the trading pair involved (symbol), the name of the strategy, a unique identifier for the signal that triggered the trade (signalId), and the type of position held. You'll also find the current market price and the specific profit/loss level that was achieved. Finally, a flag indicates whether the event occurred during a backtest or a live trading session.

## Interface MetricStats

This interface, `MetricStats`, provides a detailed summary of how a particular metric has performed. It bundles together information like the total number of times the metric was recorded, the overall time spent, and key duration statistics. You’ll find insights into the average, minimum, and maximum durations, as well as measures of spread like standard deviation and percentiles (p95 and p99). 

It also tracks wait times, giving you the average, minimum, and maximum time between events related to the metric. Essentially, it's a comprehensive package for understanding the behavior of a specific metric within your backtesting framework.


## Interface MessageModel

This describes the structure of a message within a conversation, particularly useful for interacting with large language models. Think of it as a way to represent a single turn in a chat. Each message has a `role` which tells you who sent it – whether it’s the system providing instructions, the user asking a question, or the assistant (the LLM) responding.  The `content` property holds the actual text of the message itself. This model helps keep track of the conversation flow and context when building prompts for the LLM.

## Interface LiveStatisticsModel

The LiveStatisticsModel gives you a detailed look at how your live trading strategy is performing. It keeps track of everything from the total number of trades and signals to more advanced metrics like win rate and average profit per trade. You’ll find a list of every event – from initial signals to closed trades – and a comprehensive set of statistics to help you assess your strategy's risk and reward profile. 

Key performance indicators like total profit, win rate, and standard deviation are included, with explanations of what they mean and how to interpret them. It even calculates annualized Sharpe ratios and expected yearly returns to give you a longer-term view of potential performance. All numerical values are carefully checked to ensure accuracy, and will be flagged as unavailable if they can't be reliably calculated.

## Interface LiveStatistics

The `LiveStatistics` interface provides a detailed breakdown of your live trading performance. It’s designed to help you understand how your strategies are doing in real-time.

You'll find information about every event that occurred during trading, from initial setup to signal closures. This includes a complete list of all events. You can easily track the total number of events, and specifically the number of closed signals.

Key performance metrics like win count and loss count tell you how often your strategies are successful or unsuccessful.  The `winRate` gives you a quick percentage view of your profitability.  Beyond that, you get a deeper look at profitability with the average PNL per trade and the total cumulative PNL.

To assess risk, the standard deviation (or `stdDev`) is included - a lower value suggests less volatility.  Risk-adjusted performance is available with the Sharpe Ratio and Annualized Sharpe Ratio, both indicating how much return you’re getting for the level of risk taken.  Finally, the Certainty Ratio compares your average winning trade to the absolute value of your average losing trade, while the expected yearly returns estimate potential long-term gains.

Importantly, if any calculation results in an unsafe value like NaN or Infinity, the corresponding metric will be represented as null.

## Interface IWalkerStrategyResult

This interface describes the outcome of running a trading strategy within the backtest framework. Each strategy run produces a result containing its name, detailed performance statistics, a specific metric value used for ranking, and its final rank relative to other strategies in the comparison. The `stats` property holds a wealth of information about the backtest, such as total return, Sharpe ratio, and drawdown. The `metric` field provides a single, quantifiable value allowing for easy comparison across different strategies, and `rank` indicates how well the strategy performed in the overall group.

## Interface IWalkerSchema

The IWalkerSchema helps you set up A/B tests for different trading strategies within backtest-kit. Think of it as a blueprint for how you want to compare your strategies against each other.

You'll give it a unique name to identify the test, and optionally add a note for yourself. It specifies which exchange and timeframe to use for all the strategies involved.

Most importantly, you'll list the names of the strategies you want to test, making sure they've been registered beforehand. You can also choose which metric, like Sharpe Ratio, you want to optimize for. Finally, you can add optional callbacks to be notified about different stages of the testing process.

## Interface IWalkerResults

This interface holds all the information gathered when a backtest walker finishes its run. Think of it as a complete report card for a series of strategy tests. It tells you which asset, or "symbol," was being analyzed, along with the specific "exchange" and "walker" used for the tests. You'll also find the "frame" – the time period or data frequency – that was employed during the backtesting process. Essentially, it bundles together key identifying details from a backtest execution.

## Interface IWalkerCallbacks

This interface lets you hook into the backtest process and get notified about key events. You can listen for when a specific strategy begins testing, when it finishes (receiving performance statistics and a key metric), or if an error occurs during testing. Finally, there’s a callback that fires when all the backtests are complete, giving you the overall results. These callbacks provide visibility and control during the strategy comparison phase.

## Interface IStrategyTickResultScheduled

This interface describes what happens when a trading strategy creates a scheduled signal – essentially, a signal that's waiting for the price to reach a certain point before being activated. It provides key details about that signal, like the strategy and exchange it came from, the symbol being traded, and the current price at the time the signal was scheduled. The `action` property simply confirms that the signal is in the "scheduled" state, meaning it’s waiting for the price to match its entry point. You'll see this result when your strategy generates a signal that needs to wait for a price condition to be met.

## Interface IStrategyTickResultOpened

This interface describes the data you receive when a new trading signal is created within your backtest. It signifies that a signal has been successfully generated, validated, and saved. You'll find details about the signal itself, including its unique ID, the name of the strategy that produced it, the exchange it relates to, and the trading symbol involved.  The `currentPrice` property tells you the VWAP price at the moment the signal was opened, which is useful for analyzing performance. Think of this as a notification that a signal is ready to be acted upon.

## Interface IStrategyTickResultIdle

This interface represents what happens when your trading strategy is in a waiting period, essentially doing nothing. It tells you the strategy’s name, the exchange it’s connected to, the specific trading pair it's monitoring, and the current price at the time it went idle. The `action` property explicitly confirms that the state is "idle," and importantly, it indicates there's no active trading signal present at that moment; the `signal` is null. Think of it as a checkpoint to understand why your strategy isn’t actively trading.

## Interface IStrategyTickResultClosed

This interface describes the result you get when a trading signal is closed within a backtest. It provides a complete picture of what happened at the close, including the reason for closing (like reaching a take-profit target or a stop-loss), the price used to calculate profits, and the resulting profit and loss. 

You'll find details about the original signal that was executed, along with information about which strategy and exchange were involved. It also includes a timestamp marking exactly when the signal was closed, making it easy to track events in your backtest timeline. Essentially, this gives you a final, detailed report for each closed signal.


## Interface IStrategyTickResultCancelled

This interface describes what happens when a signal that was planned to be executed gets cancelled. It usually means the signal didn’t trigger a trade, perhaps because it was stopped before a position could be opened. 

The result includes details like the cancelled signal itself, the price at the time of cancellation, when the cancellation happened, and the strategy and exchange involved. Think of it as a record of a signal that didn’t lead to a trade, allowing you to track and understand why. 

Here’s what you can find in the record:

*   The reason for the result: It’s marked as "cancelled."
*   The specific signal that was cancelled.
*   The closing price when the cancellation occurred.
*   A timestamp of the cancellation event.
*   The name of the strategy responsible.
*   The exchange used.
*   The trading symbol, like BTCUSDT.

## Interface IStrategyTickResultActive

This interface describes a tick result within the backtest-kit framework when a trading strategy is actively monitoring a signal. It signifies that the strategy is waiting for a take profit, stop loss, or time expiration event. 

The result includes details like the strategy's name, the exchange and symbol being traded, and the current VWAP price used for monitoring. 

You'll also find the signal being tracked, along with percentage indicators showing progress towards both the take profit and stop loss levels. This data helps visualize the strategy’s current state and progress during a backtest.


## Interface IStrategySchema

This interface, `IStrategySchema`, acts as a blueprint for defining your trading strategies within the backtest-kit framework. Think of it as a way to describe *how* your strategy makes decisions.  You’ll use this schema when you register a new strategy, essentially telling the framework its name, a helpful note for yourself, and how often it should generate trading signals.

The core of the schema is the `getSignal` function – this is where your strategy's logic resides, determining when and what kind of trades to make.  It can even be configured to wait for price conditions before opening a trade.  You can also add optional callbacks to handle specific events like when a position is opened or closed. Finally, you can assign risk profiles, either single or multiple, to categorize and manage the risk associated with your strategy.

## Interface IStrategyResult

This interface, `IStrategyResult`, is designed to hold all the important information about a single strategy run during a backtest. Think of it as a single row in a comparison table showing how different strategies performed. Each result includes the strategy's name so you know which one it is, a detailed set of backtest statistics to understand its performance, and a numerical value representing the metric you’re using to judge its success – this value can be missing if the strategy didn’t run correctly. Essentially, it provides a clear and concise package of data for evaluating and comparing strategies.


## Interface IStrategyPnL

This interface, `IStrategyPnL`, represents the profit and loss (PnL) outcome of a trading strategy. It breaks down the performance, showing you how much you gained or lost, expressed as a percentage. The `pnlPercentage` property directly tells you the percentage change in your investment.

Crucially, the `priceOpen` and `priceClose` properties detail the actual prices used for the trade calculations. These prices have already been adjusted to account for typical trading costs, specifically a 0.1% fee and 0.1% slippage, giving you a more realistic view of your profitability.

## Interface IStrategyCallbacks

This interface, `IStrategyCallbacks`, lets you plug in functions to be notified about key events during a trading strategy's lifecycle. Think of it as a way to react to what's happening – whether a new signal is being created, a position is active, or a signal is closing. 

You can provide callbacks for when a new signal opens (`onOpen`), when it’s actively being monitored (`onActive`), when no signals are active (`onIdle`), and when a signal closes (`onClose`).  There are also hooks for scheduled signals, allowing you to respond to their creation (`onSchedule`) or cancellation (`onCancel`).

The `onTick` callback gives you the opportunity to react to every market tick.  You can even customize how data is persisted for testing purposes using `onWrite`.  Finally, you’re alerted to partial profit (`onPartialProfit`) or loss (`onPartialLoss`) scenarios. Each callback receives information like the symbol being traded, related data, and a flag indicating whether it’s a backtest.

## Interface IStrategy

The `IStrategy` interface outlines the core methods a trading strategy needs to have within the backtest-kit framework.

The `tick` method is the heart of the strategy, handling each incoming market tick. It's responsible for checking if a new trading signal should be generated and also monitoring any existing stop-loss or take-profit orders.

`getPendingSignal` allows a strategy to check the details of any active signal it has currently, like its remaining time or potential stop-loss levels.

You can use the `backtest` method to quickly test your strategy against historical data. It simulates trading based on a series of price candles.

Finally, the `stop` method is for pausing a strategy’s signal generation without abruptly closing any existing trades. This is useful when you need to shut down a live trading strategy gracefully.

## Interface ISizingSchemaKelly

This interface defines a sizing strategy based on the Kelly Criterion, a formula used to determine optimal bet size based on perceived edge. When implementing this strategy, you'll specify that the `method` is "kelly-criterion".  The `kellyMultiplier` property lets you control the aggressiveness of the sizing; a smaller value like 0.25 (the default) represents a "quarter Kelly" approach, which is more conservative, while larger values increase risk and potential reward. This allows you to fine-tune how much of your capital is allocated to each trade according to the Kelly Criterion calculations.

## Interface ISizingSchemaFixedPercentage

This schema defines a simple way to determine your trade size – by consistently risking a fixed percentage of your capital on each trade.  It's straightforward: you specify a `riskPercentage` which represents the portion of your account you're comfortable losing on a single trade, expressed as a number between 0 and 100. The `method` is always set to "fixed-percentage" to identify this specific sizing approach. This provides predictability and consistency in your risk management.

## Interface ISizingSchemaBase

This interface, `ISizingSchemaBase`, provides the foundation for defining how much of your account to allocate to a trade. It ensures consistency across different sizing strategies.

You'll find key properties here like `sizingName`, which gives your sizing strategy a unique identifier, and a `note` field for documenting its purpose. 

It also handles limits: `maxPositionPercentage` controls the maximum percentage of your account used in a single trade, while `minPositionSize` and `maxPositionSize` set absolute minimum and maximum trade sizes.  Finally, `callbacks` allows you to add custom logic triggered at different points in the sizing process.

## Interface ISizingSchemaATR

This schema defines how to size your trades using the Average True Range (ATR) indicator. It's a way to dynamically adjust your position size based on market volatility. 

You'll specify the sizing method as "atr-based" to confirm you're using this approach.

The `riskPercentage` determines what portion of your capital you're willing to risk on each trade, expressed as a number between 0 and 100.

Finally, `atrMultiplier` controls how much the ATR value influences the distance of your stop-loss order; a higher multiplier means a wider stop.

## Interface ISizingParamsKelly

This interface defines the parameters needed to use the Kelly Criterion for determining trade sizes within the backtest-kit framework. It's primarily used when setting up how your trading strategy decides how much to invest in each trade.

The `logger` property allows you to connect a logging service, which is helpful for debugging and understanding how the Kelly Criterion calculations are affecting your trade sizing. Think of it as a way to monitor the decisions being made behind the scenes.

## Interface ISizingParamsFixedPercentage

This interface defines how to set up your trading strategy's position sizing when using a fixed percentage approach. It essentially tells the backtest system what percentage of your available capital you want to risk on each trade. 

You'll use this to configure how much of your funds are allocated to each position based on a predetermined percentage. 

The `logger` property allows you to connect a logging service, which is useful for debugging and monitoring the sizing calculations during your backtesting runs – it lets you see what's happening behind the scenes.

## Interface ISizingParamsATR

This interface, `ISizingParamsATR`, helps you configure how much of your capital to allocate to trades when using an Average True Range (ATR) based sizing strategy.  It's used when setting up the `ClientSizing` object. 

The `logger` property is essential for troubleshooting and understanding what's happening behind the scenes; it allows you to receive debug messages about the sizing calculations. You'll need to provide a logger service that conforms to the `ILogger` interface.

## Interface ISizingCallbacks

The `ISizingCallbacks` interface lets you hook into different stages of the sizing process within the backtest-kit framework. Specifically, you can use the `onCalculate` callback to be notified whenever the framework determines how much to buy or sell. Think of it as a chance to observe and verify the sizing logic; perhaps you want to log the calculated quantity and the parameters used, or ensure the size makes sense given your strategy’s rules. It’s a way to peek under the hood and gain more insight into how your trades are being sized.

## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate your trade size using the Kelly Criterion. It's all about figuring out how much of your capital to risk based on your trading strategy's performance. You'll provide your win rate, which represents the percentage of winning trades, and your average win/loss ratio, which tells you how much you win on a winning trade compared to how much you lose on a losing trade. These two values are then used to determine an optimal bet size that maximizes long-term growth.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the information needed to calculate trade size using a fixed percentage approach. It's used when you want to risk a specific percentage of your capital on each trade, based on a predetermined stop-loss price.  You’ll provide a `method` value confirming you're using the 'fixed-percentage' sizing method, and a `priceStopLoss` which acts as the basis for determining that percentage. Essentially, this lets you control how much of your account you're willing to lose on a single trade, tied to your risk management strategy.

## Interface ISizingCalculateParamsBase

This interface defines the basic information needed to figure out how much of an asset to buy or sell. It includes the trading pair you're working with, like "BTCUSDT", the total amount of money you have in your account, and the price at which you intend to make your first trade. Think of it as the foundation for calculating your trade size – you'll need to know these core details before you can determine how many assets you can realistically buy.


## Interface ISizingCalculateParamsATR

This interface defines the settings you’ll use when determining your trade size based on the Average True Range (ATR). Essentially, it tells the backtest kit how to calculate your position size using the ATR indicator. You’ll specify that you want to use the "atr-based" method and provide the current ATR value, which will be a number representing the recent volatility. Think of this as informing the system: "I want to size my trades according to this ATR value."

## Interface ISizing

The `ISizing` interface helps determine how much of an asset to trade in a strategy. It's the core of managing position sizes. 

Essentially, it provides a `calculate` method. This method takes in parameters defining your risk tolerance and trading context, and then returns the recommended quantity to buy or sell. Think of it as the brains behind deciding "how much" to trade, based on your strategy's rules.

## Interface ISignalRow

This interface, `ISignalRow`, represents a complete trading signal that’s been checked and confirmed for use within the backtest-kit framework. Think of it as the finalized version of a signal ready to be executed. Each signal has a unique identifier, `id`, which helps track it throughout the process. 

It also includes important details like the entry price (`priceOpen`), the exchange being used (`exchangeName`), and the specific strategy generating the signal (`strategyName`). 

You'll find timestamps for when the signal was initially created (`scheduledAt`) and when the position became pending (`pendingAt`). The symbol being traded, like "BTCUSDT", is also clearly defined. Finally, `_isScheduled` is an internal flag indicating that the signal was initially created as a scheduled event.

## Interface ISignalDto

This interface, `ISignalDto`, defines the structure for signal information used within the backtest-kit framework. It represents a trade suggestion, providing details like whether it's a "long" (buy) or "short" (sell) position.  You'll find fields for the reasoning behind the signal in the `note` property and the entry price in `priceOpen`. 

Crucially, it includes `priceTakeProfit` for setting a profit target and `priceStopLoss` for defining an exit point to limit potential losses – remember, these prices must relate logically to the entry price depending on the position direction.  Finally, `minuteEstimatedTime` indicates how long the signal is expected to remain active before potentially expiring.  The system automatically creates an ID for each signal.

## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, represents a signal that's waiting for a specific price to be reached before a trade is executed. Think of it as a signal with a delayed trigger – it doesn’t act immediately. It builds upon the `ISignalRow` interface.

When a signal is created this way, it’s initially a "pending" signal, meaning it's ready to go but just waiting for the market to meet a certain condition.  

The `priceOpen` property specifies the price level that, when reached, will activate the signal and convert it into a standard, active signal.  The signal's "pending" time, or `pendingAt`, is tracked – it starts recording when the signal is scheduled and continues until the price is met, then reflects the actual time of activation.

## Interface IRiskValidationPayload

This interface, `IRiskValidationPayload`, holds all the information a risk validation function needs to make a decision. Think of it as a package delivered to the validation function containing details about what's happening. It includes the signal that's about to be acted upon (`pendingSignal`), the total number of positions currently open (`activePositionCount`), and a list of those active positions (`activePositions`). This allows the risk checks to consider the existing portfolio state when evaluating new trades.

## Interface IRiskValidationFn

This defines a special function type used to check if your trading strategy's risk settings are safe and reasonable. Think of it as a quality control check for your strategy. It's designed to take the risk parameters – things like maximum position size or leverage – and verify they fall within acceptable limits. If the validation fails, the function will throw an error, stopping you from accidentally deploying a strategy with potentially dangerous risk levels. It helps ensure your backtesting is conducted with safe and controlled parameters.

## Interface IRiskValidation

This interface, `IRiskValidation`, helps you define how to check if a trading action is safe. Think of it as setting up rules to prevent risky trades. 

It has two main parts: a `validate` function, which is the actual logic you’ll write to perform the check, and an optional `note` field. The `note` is just a helpful description to explain what the validation is doing – it’s like adding a comment to your code to make it clearer to others (and yourself later!).  You use this to ensure trades meet specific criteria before they’re executed.

## Interface IRiskSchema

This interface, `IRiskSchema`, lets you define and register risk controls for your trading portfolio. Think of it as a way to set up rules and checks to manage your risk exposure. 

Each schema has a unique name (`riskName`) so you can identify it later. You can also add a note (`note`) to explain what the schema is for. 

To make things even more flexible, you can provide optional callbacks (`callbacks`) to react to specific events. Most importantly, you define your actual risk logic with a list of validations (`validations`). These validations are functions or objects that check your portfolio's status and determine if a trade should be allowed or rejected.


## Interface IRiskParams

This interface, `IRiskParams`, defines the essential settings you provide when setting up your risk management system within the backtest-kit framework. It’s like configuring the guardrails for your trading strategies.

You'll use a `logger` to keep track of what's happening – handy for debugging and understanding why decisions are being made. 

The `onRejected` callback is crucial; it’s triggered when a trading signal gets blocked because it would violate your risk limits. Think of it as the notification you receive when the guardrails kick in – you can use this opportunity to log the details, perhaps send an alert, or take other actions before the rejection is finalized.


## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, holds all the information needed to decide if a new trade should be allowed. Think of it as a safety check performed before a trading signal is actually generated. It provides details like the trading pair symbol (e.g., BTCUSDT), the signal itself, the name of the strategy requesting the trade, the exchange being used, the current price, and the timestamp of the current market data. Essentially, it bundles all the relevant context for a risk assessment.

## Interface IRiskCallbacks

This interface lets you define functions that get triggered when your trading strategy's risk checks either pass or fail. Think of it as a way to be notified about potential risk issues or successful risk assessments. You can specify a callback function, `onRejected`, which will be executed whenever a trading signal is blocked because it violates your risk rules. Conversely, `onAllowed` lets you celebrate when a signal makes it through the risk checks and is safe to proceed with. These callbacks provide a flexible way to monitor and react to risk events within your backtesting or live trading environment.

## Interface IRiskActivePosition

This interface describes a position that a trading strategy currently holds, and that the ClientRisk component is keeping track of. It's useful for understanding how different strategies are interacting and affecting overall risk.

Each position has details like the signal that triggered it, the name of the strategy that created it, the exchange where the trade took place, and the exact time the position was opened. This information helps in analyzing risk across multiple strategies simultaneously.


## Interface IRisk

The `IRisk` interface helps manage and enforce risk limits within your trading strategies. It acts as a gatekeeper, ensuring your signals don't violate predefined risk boundaries.

You can use `checkSignal` to determine if a trading signal is permissible, providing details about the signal for evaluation. 

`addSignal` lets you register when a new position is opened, keeping track of active trades.  Conversely, `removeSignal` notifies the system when a position is closed, updating the risk profile accordingly. This interface allows you to monitor and control your risk exposure in a structured way.


## Interface IPositionSizeKellyParams

The `IPositionSizeKellyParams` interface helps you calculate position sizes using the Kelly Criterion, a popular method for determining how much to bet or trade based on your expected return. It defines the parameters needed for this calculation. You'll provide your estimated win rate, expressed as a number between 0 and 1, and your average win/loss ratio – essentially, how much you win on average for every loss. These values are key to the Kelly Criterion formula and will guide your position sizing strategy.


## Interface IPositionSizeFixedPercentageParams

This interface defines the parameters needed to calculate a position size using a fixed percentage of your portfolio. It's specifically used when you want to risk a certain percentage of your capital per trade.

The `priceStopLoss` property tells the system at what price you'll place a stop-loss order for the trade. This helps determine the amount of capital needed to calculate the appropriate position size.

## Interface IPositionSizeATRParams

The `IPositionSizeATRParams` interface defines the settings you provide when calculating position size using an Average True Range (ATR) approach. It's a straightforward set of parameters designed to help you determine how much capital to allocate to a trade based on market volatility. The key piece of information you’ll provide is the `atr` value, which represents the current Average True Range—essentially, a measure of how much the price fluctuates. This value is crucial for calculating a suitable position size that accounts for the market's volatility.

## Interface IPersistBase

This interface defines the basic functions for saving and retrieving data within the backtest-kit framework. Think of it as the foundation for how your trading strategies’ data is stored and loaded. It provides methods to ensure your storage area is properly set up, quickly check if a piece of data exists, read data back from storage, and reliably write new data. These functions are designed to work together, ensuring your data is handled safely and consistently.


## Interface IPartialData

This data structure helps save and restore information about a trading signal's progress. Think of it as a snapshot of key details, specifically the profit and loss levels that have been hit. Because some data types can't be directly saved, sets of profit and loss levels are converted into simple arrays for storage. This allows the framework to remember where a signal stood even after it's been stopped or the application restarted.

## Interface IPartial

The `IPartial` interface helps track how trading signals are performing financially, whether they're making a profit or a loss. It's used internally by the system to monitor signals and notify users when certain milestones are hit.

When a signal is making money, the `profit` method is triggered. It checks if the signal has reached predefined profit levels like 10%, 20%, or 30% and sends out notifications for any new levels achieved. The `loss` method works similarly, but for signals experiencing losses, tracking levels like 10%, 20%, or 30% loss.

Finally, when a signal closes, whether due to a take profit, stop loss, or time expiry, the `clear` method cleans up the tracked data, removes it from memory, and saves any necessary changes. This ensures the system doesn't continue to monitor signals that are no longer active.

## Interface IOptimizerTemplate

This interface provides a way to create code snippets and messages for use with Large Language Models (LLMs) within the backtest-kit framework. Think of it as a toolkit for building custom backtesting environments powered by LLMs.

It includes methods to generate various configuration code blocks, such as setting up the initial environment (`getTopBanner`), crafting user and assistant messages for LLM conversations (`getUserMessage`, `getAssistantMessage`), and defining components like Walkers, Exchanges, Frames, and Strategies. You can also use it to create helper functions for debugging and generating structured or text-based outputs from the LLM. Ultimately, these methods help you automate the process of setting up and running backtesting experiments.

## Interface IOptimizerStrategy

This interface, `IOptimizerStrategy`, holds all the information about a trading strategy that's been created using an LLM. Think of it as a container for everything needed to understand how the strategy came to be. It includes the trading symbol the strategy is designed for, a unique name to identify it, and the full conversation history with the LLM that shaped the strategy. Importantly, it also stores the actual strategy description or logic as text, which is what you’ll use to implement the trading rules.


## Interface IOptimizerSourceFn

The `IOptimizerSourceFn` is essentially a function that provides the data your backtest optimization process uses to learn and improve. Think of it as a data feed specifically designed for training an algorithm. It needs to be able to handle large datasets by fetching data in smaller chunks (pagination), and crucially, it must give each piece of data a unique identifier. This unique ID is important for tracking and managing the data during the optimization process.

## Interface IOptimizerSource

This interface describes a data source used for optimizing strategies, particularly for feeding information into large language models. Think of it as a way to tell backtest-kit where to get your historical data and how to present it in a format the LLM can understand.

You'll give it a unique name to easily identify the data source and can add a short description for clarity. The most important part is the `fetch` function, which tells backtest-kit how to retrieve your data, and it needs to support bringing data in chunks.

Finally, you have the flexibility to customize how the data is formatted into user and assistant messages for the LLM. If you don’t specify custom formatters, backtest-kit will use its own default templates.

## Interface IOptimizerSchema

This interface, `IOptimizerSchema`, acts as a blueprint for setting up and registering optimizers within the backtest-kit framework. Think of it as defining the entire process of generating and testing strategies. 

It lets you specify a descriptive note, a unique name for your optimizer, and crucially, define different training and testing time periods to evaluate performance. The `source` property allows you to incorporate multiple data sources that feed information into the strategy generation process.

You’ll use `getPrompt` to craft the specific prompt sent to the language model to generate your strategies, using the accumulated data.  You also have the option to customize the generation process using `template` or monitor the optimizer's lifecycle through `callbacks`. This schema gives you a lot of control over how strategies are created and assessed.

## Interface IOptimizerRange

This interface, `IOptimizerRange`, helps you set the boundaries for your backtesting and optimization periods. Think of it as defining a specific timeframe for your analysis. It's made up of a `startDate` and an `endDate`, both representing dates within your historical data. You can optionally add a `note` to describe what that timeframe represents, like "Early 2023 growth" or "Post-pandemic recovery." This allows you to clearly label and understand the purpose of each range you define.

## Interface IOptimizerParams

This interface, `IOptimizerParams`, holds the settings needed to create a ClientOptimizer. Think of it as a container for essential components.

It includes a `logger` which is used to display helpful messages during the optimization process – this is automatically provided.

It also bundles a `template` which defines the methods available for the optimization, combining your custom settings with some default behaviors.

## Interface IOptimizerFilterArgs

This interface, `IOptimizerFilterArgs`, defines the information needed to efficiently fetch data for backtesting. It specifies which trading symbol you're interested in, like "BTCUSDT", and the exact start and end dates for the data you need. Think of it as setting the boundaries for the historical data the backtest will use – it helps the system quickly locate the relevant information without unnecessary searching.

## Interface IOptimizerFetchArgs

When you're working with data that needs to be pulled in chunks, `IOptimizerFetchArgs` helps manage how much data is fetched at a time. It lets you specify a `limit`, which is the maximum number of records to retrieve in a single request – think of it as the page size. You also control the `offset`, which tells the system how many records to skip before starting to fetch – this is how you move between pages. By adjusting these two values, you can efficiently handle large datasets.

## Interface IOptimizerData

This interface, `IOptimizerData`, serves as the foundation for how data is provided to the backtest kit's optimization tools. Think of it as a standard format that ensures all data sources can be used consistently. Each piece of data, represented as a "row," must have a unique identifier, called `id`. This ID is crucial for preventing duplicate data entries, especially when dealing with large datasets pulled from various sources in chunks or pages.

## Interface IOptimizerCallbacks

This interface lets you listen in on what’s happening during the optimization process. Think of it as a way to get notified at key moments and potentially react to what’s going on.

You can be alerted when data is gathered for a particular strategy, allowing you to check its validity or record it for later analysis. Similarly, you'll receive notifications when code is generated and written to a file.

Specifically, you’ll get callbacks when:

*   Strategy data is ready for all training periods.
*   The generated strategy code is complete.
*   The code has been saved to a file.
*   Data has been retrieved from a data source. 

This allows you to monitor, log, or even modify the behavior of the optimization process as it progresses.

## Interface IOptimizer

This interface defines how you interact with the optimization process within the backtest-kit framework. Think of it as a way to request data, generate code, and save that code to a file for your trading strategies.

The `getData` method pulls all the necessary information for a given trading symbol, preparing it for strategy creation. It essentially gathers data and organizes it in a format suitable for further processing.

`getCode` lets you build a complete, runnable trading strategy as a string of code.  It combines all the necessary components like imports and the actual strategy logic.

Finally, `dump` takes the generated code and saves it to a file.  It handles creating any necessary folders and ensures the file ends with the `.mjs` extension.

## Interface IMethodContext

This interface, `IMethodContext`, helps the backtest-kit framework know which specific configurations to use when running simulations or tests. Think of it as a set of instructions that tells the system *which* strategy, exchange, and data frame to work with.  It carries names—like "strategyName" and "exchangeName"—so the framework can automatically pull in the right settings for each operation.  When you're running a live test, the "frameName" will be empty, signifying that no historical data frame is needed. Essentially, it streamlines the process of connecting different parts of your trading logic.

## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework communicate about what’s happening. It provides a simple way to record important events, details, and potential issues within the system. 

You can use it to keep track of things like when agents start or finish, when data is saved, or if any problems are encountered. 

The `log` method is for general messages, `debug` is for very detailed information useful during development, `info` provides a summary of normal operations, and `warn` flags potential concerns that need to be looked into. This helps with understanding and troubleshooting the backtest’s behavior.

## Interface IHeatmapStatistics

This structure organizes the overall performance data for your portfolio, giving you a snapshot of how everything is doing. It provides a breakdown of statistics across all the assets you're tracking.

You'll find an array detailing the performance of each individual symbol, alongside key metrics like the total number of symbols in your portfolio, the total profit and loss (PNL) across everything, the portfolio’s Sharpe Ratio, and the total number of trades executed. Essentially, it’s a central place to see how your entire investment strategy is performing.

## Interface IHeatmapRow

This interface represents a row in the portfolio heatmap, providing a snapshot of performance for a single trading symbol like BTCUSDT. It gathers key statistics from all strategies applied to that symbol, giving you a clear picture of its overall trading results.

You'll find metrics like total profit or loss percentage, the Sharpe Ratio which gauges risk-adjusted returns, and the maximum drawdown, indicating the biggest potential loss experienced. Other important details include the total number of trades, win/loss counts, win rate, average profit/loss per trade, and measures of volatility like standard deviation.

The interface also includes useful indicators of trading consistency such as the longest winning and losing streaks, and the expectancy, a calculation that estimates potential profit based on win and loss patterns.  Essentially, it summarizes everything you need to know about a symbol’s performance in one convenient object.

## Interface IFrameSchema

This defines a blueprint for how your backtesting environment handles time – essentially, it's a way to describe a specific "frame" of time for your trading strategy.  Each frame has a unique name to identify it, and you can add a note to help explain its purpose. The `interval` property sets how frequently time advances within the frame (e.g., every minute, hour, or day).  You also specify the start and end dates that define the backtest period for this frame, marking the beginning and end of the data being analyzed. Finally, you can optionally attach functions (callbacks) to be executed at certain points during the frame’s lifecycle.

## Interface IFrameParams

The `IFramesParams` interface defines the information needed when creating a ClientFrame, which is a core component of backtest-kit. It builds upon `IFramesSchema` and crucially includes a `logger` property. This `logger` allows you to easily track and debug what's happening within the frame during your backtesting process, providing valuable insights for troubleshooting and optimization. Essentially, it's your window into the inner workings of the frame.

## Interface IFrameCallbacks

This interface defines functions that are called during the lifecycle of a timeframe frame within the backtest-kit. Specifically, the `onTimeframe` property lets you provide a function that will be executed whenever a new set of timeframes is created. This is a handy way to track what timeframes are being generated, check if they're what you expect, or perform any other actions related to the timeframe construction process. You'll get the actual timeframe dates, the start and end dates used to create them, and the interval used as input to the timeframe generation.

## Interface IFrame

The `IFrames` interface is a core component that helps structure your backtesting process. Think of it as the mechanism for creating the timeline your trading strategies will operate on. It provides a way to generate a list of specific dates and times, spaced out according to how frequently your strategy needs to make decisions – whether that’s every minute, hour, day, or something else.  The `getTimeframe` function is key; you'll use it to request a set of timestamps for a particular trading symbol and timeframe, and it returns those timestamps as a `Promise` resolving to an array of `Date` objects, ready to be used in your backtest.

## Interface IExecutionContext

The `IExecutionContext` interface provides essential information about the current trading environment. Think of it as a package of data passed around to different parts of your trading strategy, like when you’re fetching historical data or receiving new price updates. It tells your strategy what trading pair it's working with (the `symbol`), exactly when the operation is happening (`when`), and crucially, whether it’s running a backtest – a simulation using historical data – or a live trade. This context allows your strategies to behave differently depending on the situation, ensuring proper data handling and order execution.

## Interface IExchangeSchema

This interface describes how backtest-kit interacts with different cryptocurrency exchanges. Think of it as a blueprint for connecting to a specific exchange's data. You'll use it when you want backtest-kit to pull historical price data and execute trades based on a particular exchange's rules.

Each exchange has a unique identifier, and you can add a note for documentation purposes. The most important part is `getCandles`, which tells backtest-kit *how* to get the historical candle data – essentially, the API endpoint or database query to use.

`formatQuantity` and `formatPrice` handle the specific formatting rules that exchanges use for trade sizes and prices.  Finally, `callbacks` allows you to hook into certain events, like when new candle data arrives, giving you more control.

## Interface IExchangeParams

The `IExchangeParams` interface helps set up your simulated trading environment within backtest-kit. Think of it as the configuration you pass when creating an exchange object. It includes a logger, which allows you to track what's happening during your backtesting process and see helpful debugging messages.  You also provide an execution context, which tells the exchange things like the trading symbol, the time period being backtested, and whether it's a backtest or a live execution. This context is crucial for ensuring your trading logic behaves correctly within the simulation.


## Interface IExchangeCallbacks

The `IExchangeCallbacks` interface lets you hook into events happening when your backtest kit framework connects to an exchange.  Specifically, you can provide a function – `onCandleData` – that gets called whenever the framework retrieves historical or live candlestick data. This function will receive the symbol being traded, the time interval of the candles (like 1 minute, 1 hour, etc.), a timestamp indicating when the data started, the number of candles requested, and an array containing the actual candle data. Essentially, it's your opportunity to react to incoming candlestick information.

## Interface IExchange

The `IExchange` interface defines how backtest-kit interacts with exchanges, letting you access historical and future market data. You can request historical candle data using `getCandles`, which looks backward from the current time. Need to peek into the future for backtesting? `getNextCandles` fetches candles moving forward.

When placing orders, `formatQuantity` and `formatPrice` ensure your order sizes and prices are correctly formatted to match the exchange's requirements.  Finally, `getAveragePrice` provides a simple way to calculate the VWAP (Volume Weighted Average Price) based on recent trading activity, helping you understand the average price a large number of trades occurred at.

## Interface IEntity

This interface, `IEntity`, serves as the foundation for anything that gets saved and retrieved from storage within the backtest-kit framework. Think of it as the common ancestor for all your data objects, ensuring they all share a basic structure. It's designed to provide a consistent way to interact with your persistent data, regardless of its specific type. If you're creating a class that represents something you need to store, it should likely implement this interface.

## Interface ICandleData

This interface represents a single candlestick, which is a standard way to organize price data over a specific time period. Each candlestick contains information about the opening price, the highest price, the lowest price, the closing price, and the trading volume during that time. The `timestamp` tells you exactly when that candlestick's period began. This data is essential for analyzing price movements and for running backtests of trading strategies.

## Interface HeatmapStatisticsModel

This model organizes data to visualize your portfolio's performance using a heatmap. It provides a summary of how your investments are doing across all the assets you're tracking.

You'll find an array called `symbols`, which holds detailed statistics for each individual asset in your portfolio.  The `totalSymbols` property simply tells you how many assets are included in the analysis.  Key performance indicators like the total profit/loss (`portfolioTotalPnl`), the Sharpe Ratio (`portfolioSharpeRatio` – a measure of risk-adjusted return), and the total number of trades (`portfolioTotalTrades`) are also included, giving you a broad overview of the portfolio's activity.

## Interface DoneContract

This interface represents what happens when a background task, either in a backtest or live trading environment, finishes running. You'll receive an object like this when a `Live.background()` or `Backtest.background()` call completes. It tells you which exchange was used, the name of the strategy that ran, whether it was a backtest or live execution, and the trading symbol involved. Think of it as a confirmation message with details about the finished background process.

## Interface ColumnModel

This describes how to configure a column when creating tables for your backtest results. Think of it as defining what information you want to display and how it should look. You'll give each column a unique identifier (`key`), a friendly name for the header (`label`), and a way to transform the data into a readable string (`format`). You can even control whether a column is shown or hidden based on certain conditions using the `isVisible` function. Essentially, this lets you customize the presentation of your data to highlight the information most important to your analysis.

## Interface BacktestStatisticsModel

BacktestStatisticsModel gives you a detailed look at how your trading strategy performed. It collects a wealth of information from your backtest, allowing you to evaluate its strengths and weaknesses. 

You’ll find a complete list of every trade that was closed, along with its details, in the signalList. The totalSignals property simply tells you how many trades were executed.

To assess profitability, you can check the winCount and lossCount, and calculate the winRate – the percentage of profitable trades.  You'll also see the avgPnl, representing the average profit per trade, and the totalPnl, which shows the overall cumulative profit.

To understand the risk involved, the standard deviation (stdDev) provides a measure of volatility – lower values indicate less risk. The Sharpe Ratio, and its annualized version, factor in both return and risk, providing a more nuanced view of performance.  CertaintyRatio offers a comparison of average winning and losing trade sizes, while expectedYearlyReturns attempts to estimate potential annual gains. 

Keep in mind that any numerical values marked as "null" are unreliable, often due to issues like calculations involving infinite or undefined numbers.

## Interface BacktestStatistics

This object provides a comprehensive set of statistics derived from your backtesting runs, allowing you to evaluate strategy performance. It contains a detailed list of every closed trade, including price data and profit/loss information. You'll find key metrics like the total number of trades, the number of winning versus losing trades, and the win rate – essentially, the percentage of profitable trades. 

Beyond basic counts, it also tracks average profit/loss per trade, total cumulative profit, and measures of risk like standard deviation and the Sharpe Ratio, which helps assess risk-adjusted returns. A higher Sharpe Ratio generally indicates better performance for the level of risk taken. The certainty ratio tells you the relative strength of winning trades compared to losing trades, and expected yearly returns gives you an idea of potential annual gains. Keep in mind that any numeric value might be missing (represented as null) if the calculation resulted in an unstable or undefined result.
