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

This interface defines what happens when a "stop" signal is sent to a backtest. It's used to tell the backtest to halt a specific trading strategy that's running.

Think of it like an emergency brake for your automated trading system.

The signal includes important details: the trading symbol involved, the name of the strategy to pause, and the name of the specific "walker" (a unit of execution) that's being stopped. This allows you to control and interrupt multiple strategies running at once, ensuring you can pinpoint exactly what needs to be stopped.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps you understand how different trading strategies performed during a backtest. It's essentially a combined view of the overall results, built upon the foundation of individual strategy results. Think of it as a single place to see the complete picture of your backtesting experiment, allowing you to easily compare how different approaches stacked up against each other. The core of this model is the `strategyResults` property, which contains a list of detailed results for each strategy you tested.

## Interface WalkerContract

The WalkerContract helps you keep track of how a backtesting comparison is progressing. It provides updates whenever a strategy finishes its test and its ranking is determined. 

You'll see information like the name of the walker, the exchange and frame being used, the symbol being tested, and the specific strategy that just completed. 

Alongside, it shares key performance data (the `stats`), the value of the metric being optimized (`metricValue`), and details about the best-performing strategy encountered thus far (`bestMetric`, `bestStrategy`). 

Finally, it gives you a sense of overall progress – how many strategies have been tested (`strategiesTested`) and how many are left to evaluate (`totalStrategies`).

## Interface WalkerCompleteContract

This interface represents the culmination of a backtesting process within the backtest-kit framework. It signals that all strategies have been run and the final comparison is complete. Think of it as a report card summarizing the entire backtest.

It bundles together vital information, including the name of the backtest walker, the asset (symbol) being tested, the exchange and timeframe used, and the optimization metric. You'll also find the total number of strategies evaluated, and crucially, details about the top performer—its name, the metric value it achieved, and its full statistical breakdown. This provides a complete picture of the backtest’s outcome.

## Interface ValidationErrorNotification

This notification lets you know when a validation check during your backtesting process fails. It’s triggered when the risk validation functions encounter an issue and throw an error. 

The notification provides details about what went wrong. You'll receive an ID for tracking purposes, a timestamp showing when the error occurred, and a descriptive message explaining the validation problem. The `error` property provides more technical information about the specific error encountered. 

Finally, the `backtest` flag confirms this notification originated during a backtesting simulation.

## Interface ValidateArgs

This interface, `ValidateArgs`, acts as a standard way to ensure the names you're using for different parts of your backtesting setup are correct. Think of it as a checklist to catch typos or incorrect references early on. 

It outlines properties like `ExchangeName`, `FrameName`, `StrategyName`, `RiskName`, `SizingName`, `OptimizerName`, and `WalkerName`. Each of these properties expects an enum – a defined list of allowed values – which helps verify that the names you're using actually exist within your backtest configuration. 

Essentially, it simplifies the validation process across various components by providing a consistent structure. If a name doesn't match a registered entity, the validation service will flag it, preventing errors down the line.

## Interface TickEvent

This interface, TickEvent, provides a standardized way to represent every event that happens during a backtest, making it easier to analyze and report on trading activity. Think of it as a single container holding all the information about a tick, whether it's the start of a trade, it's ongoing, or it's finished.

Each event contains details like the exact timestamp, the type of action taken (idle, opened, active, or closed), and crucial information about the trade itself.  For trades that are active, you'll find data like current price, take profit and stop loss levels, along with how close the trade is to hitting those targets. Closed trades will also include details such as the reason for closing and the duration the trade ran for, plus the realized profit and loss. The "note" property allows you to attach descriptive information to the signal.

## Interface SignalScheduledNotification

This notification lets you know when a trading signal is planned for execution at a future time. It's like a heads-up that something's going to happen later based on a strategy’s calculations. 

The notification includes details about the signal, like a unique ID and the exact time it's scheduled. You’ll also find information relating to the backtest process, the financial instrument involved (symbol), the strategy that generated the signal, and the exchange it relates to.  Crucially, it specifies the position to take (long or short), the expected entry price, when it's scheduled, and the current market price at the time of scheduling. This data allows you to track and understand the reasoning behind future trades.

## Interface SignalOpenedNotification

This notification lets you know when a new trade has begun. It provides a detailed snapshot of what just happened, including a unique identifier for the trade itself. You’ll find information like the symbol being traded, the name of the strategy that initiated the trade, and the exchange being used. 

The notification also gives you specifics about the trade, such as whether it's a long or short position, the opening price, and the take profit and stop-loss levels that were set.  A note field allows for any additional context or explanation related to the trade. This data is helpful for tracking performance, debugging, or building visualizations around your automated trading system.

## Interface SignalData$1

This data structure holds all the key details about a single trading signal after it has been closed. Think of it as a record of one completed trade. It tells you which strategy created the signal, a unique ID for that signal, the symbol being traded (like BTC/USD), whether it was a long or short position, and the percentage profit or loss (PNL) achieved.  You’ll also find the reason why the signal was closed, along with the exact times it was opened and closed. It's designed to provide a complete picture of a finished trading signal for analysis and reporting, particularly when calculating performance metrics.

## Interface SignalClosedNotification

This notification tells you when a trading position has been closed, whether it was because a take profit or stop loss was triggered. It provides a wealth of information about the closed trade, including a unique identifier for the signal that initiated it.

You’ll find details like the symbol traded, the name of the strategy and exchange involved, and whether the backtest was live or simulated. 

The notification also includes key data points about the trade itself, such as the opening and closing prices, the percentage profit or loss, and the reason why the position was closed.  You'll also see how long the position was held, and any notes added to the signal. Essentially, it’s a comprehensive record of a completed trading position.

## Interface SignalCancelledNotification

This notification lets you know when a previously scheduled signal has been cancelled before it was actually executed. It provides a lot of details about the cancellation, so you can understand why and what was affected. 

You'll find information like the signal’s unique ID, the timestamp of the cancellation, and whether it occurred during a backtest. It also tells you which symbol, strategy, and exchange were involved, along with the intended position (long or short).

The notification includes details about *why* the signal was cancelled (the `cancelReason`), a unique ID for the cancellation itself (`cancelId`), and the intended duration of the signal. Essentially, it's a record of a signal that didn’t make it to the trading floor.

## Interface ScheduleStatisticsModel

This model holds the key statistics about how your scheduled trading signals are performing. It gives you a clear picture of the volume of signals being scheduled, how many are being activated, and how many are being cancelled. 

You'll find a detailed list of every scheduled event, including its specifics, alongside total counts for all events, scheduled signals, opened signals, and cancelled signals. 

Critically, it calculates important rates: the cancellation rate (which indicates how often signals are cancelled, and you want this to be low) and the activation rate (showing the proportion of signals that actually get activated, aiming for a higher number).

Finally, it provides insight into timings by showing average wait times for both cancelled and activated signals, helping you understand delays in your trading processes.

## Interface ScheduledEvent

This interface holds all the key details about scheduled, opened, or cancelled trading events, making it easy to generate reports and analyze performance. Each event has a timestamp marking when it occurred, along with an action type indicating whether it was scheduled, opened, or cancelled. You'll find information like the trading symbol, a unique signal ID, and the position type involved. 

Important details like the intended entry price, take profit levels, and stop-loss orders are all included, along with the original values before any adjustments. For closed events, you'll see the close timestamp and duration. If an event was cancelled, there's information about the reason and a unique ID for user-initiated cancellations. The total executed percentage from any partial closes is also recorded to provide a full picture of the trade's lifecycle.

## Interface RiskStatisticsModel

This model helps you understand how often your risk controls are kicking in and why. It gathers information about every time a risk rejection happens, allowing you to analyze patterns and identify areas for improvement. 

You'll find a complete list of those rejections in the `eventList`, providing detailed information for each one. The `totalRejections` property gives you a simple count of all rejections, while `bySymbol` breaks down the rejections by the trading symbol involved. Finally, `byStrategy` shows you how frequently each trading strategy is triggering risk rejections.

## Interface RiskRejectionNotification

This notification lets you know when a trading signal was blocked by your risk management system. It provides details about why the signal couldn’t be executed.

You'll see information like the signal's ID, the timestamp it was rejected, whether the rejection happened during a backtest, and the symbol involved. 

It includes specifics about the strategy and exchange involved, along with a note explaining the reason for the rejection and a unique rejection ID for tracking. You'll also get data on the number of currently active positions, the current price of the asset, and the details of the signal that was rejected. This helps you understand and troubleshoot risk management issues and signal rejections.

## Interface RiskEvent

This data structure holds information about when a trading signal was blocked due to risk management rules. Think of it as a record of a signal that *didn't* get executed because it would have violated a limit.

Each `RiskEvent` tells you when it happened (`timestamp`), what asset was involved (`symbol`), the details of the signal that was rejected (`pendingSignal`), and which trading strategy generated it (`strategyName`).  

You'll also find information like the exchange used (`exchangeName`), the time frame being analyzed (`frameName`), the current price of the asset (`currentPrice`), and how many positions were already open (`activePositionCount`).

A unique ID (`rejectionId`) helps track specific rejections, and a note (`rejectionNote`) explains *why* the signal was rejected. Finally, it indicates whether the rejection occurred during a backtest or live trading (`backtest`).

## Interface RiskContract

The RiskContract provides information when a trading signal is blocked because it violates risk rules. This isn't just for signals that *could* have been risky – it's specifically for those that were outright rejected by the risk system.

It’s a way to keep track of those risk management actions and understand why certain trades didn't happen. Services like report generators use this data, and users can also set up listeners to be notified when these rejections occur.

The data included with each rejection tells you a lot: which trading pair was affected (symbol), the details of the signal itself (pendingSignal), which strategy tried to execute it (strategyName), the timeframe used (frameName), the exchange involved (exchangeName), and the current market price (currentPrice).

You’ll also see information about the overall portfolio status at the time (activePositionCount) and a unique ID for the specific rejection (rejectionId).  A human-readable explanation for the rejection is provided in rejectionNote. Finally, the timestamp tells you precisely when the rejection occurred, and a flag indicates whether it was part of a backtest or live trading.

## Interface ProgressWalkerContract

This interface helps you monitor the progress of background tasks within backtest-kit. It provides updates during a Walker's execution, giving you details about what's happening behind the scenes. 

You'll see information like the name of the Walker, the exchange being used, and the trading symbol involved. The most useful parts are likely the total number of strategies the Walker needs to process, how many have already been handled, and the overall completion percentage, all expressed as a number between 0 and 100. This allows you to get a sense of how long the process might take and whether any issues arise.

## Interface ProgressOptimizerContract

This interface helps you keep an eye on how your trading strategy optimizer is doing. It provides updates during the optimization process, letting you know the name of the optimizer, the trading symbol it's working on, and how much work is left. You'll see the total number of data sources it needs to analyze, how many it's already finished, and a percentage representing overall progress from 0% to 100%. Essentially, it's a progress report for your optimizer, keeping you informed about its status.


## Interface ProgressBacktestNotification

This notification lets you know how a backtest is progressing. It's sent while the backtest is running, giving you updates on its status.

Each notification includes details like the exchange and strategy being used, the specific trading symbol being analyzed, and the total number of historical data points (frames) the backtest will process. 

You’ll also get information about how many frames have already been analyzed and a percentage representing the overall progress. The `id` and `timestamp` provide a unique identifier for each update and when it was sent, respectively.

## Interface ProgressBacktestContract

This contract helps you monitor the progress of your backtest as it runs. It provides key details like the exchange and strategy being used, the trading symbol, and how far along the backtest is. You’ll see the total number of historical data points being analyzed, how many have already been processed, and a percentage indicating overall completion. This lets you keep an eye on long-running backtests and get a sense of how much time remains.

## Interface PingContract

The `PingContract` helps you keep tabs on your active, scheduled trading signals. Think of it as a heartbeat signal emitted every minute while a signal is being monitored – it’s not sent when the signal is new or cancelled.

This ping provides key details like the trading pair (`symbol`), the strategy name (`strategyName`), and the exchange (`exchangeName`) involved. You also get the complete signal data (`data`) including information like entry price, take profit, and stop loss levels. 

A crucial flag, `backtest`, tells you whether the ping originates from a historical backtest run or a live trading execution. Finally, `timestamp` gives you the precise time of the ping, which is when it happened in live mode or the candle timestamp during backtesting. 

You can register custom logic to react to these pings using `listenPing()` or `listenPingOnce()` – enabling you to monitor the signal lifecycle and implement your own checks.

## Interface PerformanceStatisticsModel

This model holds the performance data for a specific trading strategy. It organizes information about how the strategy performed, including the strategy's name itself. You'll find a count of all the performance events captured, as well as the total time it took to gather all those metrics. 

The data is further broken down by metric type, allowing you to analyze different aspects of performance separately. Finally, a complete list of all the individual performance events, in their raw form, is available for more detailed examination.

## Interface PerformanceContract

The `PerformanceContract` helps you keep an eye on how quickly different parts of your trading system are running. It records things like how long it takes to execute orders, analyze data, or make decisions. Each record includes a timestamp, allowing you to track changes over time, and a timestamp of the previous event for comparison. You’ll find information like the type of operation, the strategy and exchange involved, the trading symbol, and whether the activity is happening during a backtest or in live trading. This information is incredibly valuable for spotting slowdowns and optimizing your trading setup.

## Interface PartialStatisticsModel

This model helps you understand the results of your trading strategy when it makes partial adjustments to positions. It keeps track of individual profit and loss events, giving you a detailed list of what happened. You can see the overall number of events, the total number of times your strategy made a profit, and the total number of times it experienced a loss. Essentially, it's a breakdown of how well your strategy is performing when it's not just taking full positions.

## Interface PartialProfitNotification

This notification lets you know when a trading signal has reached a predefined profit milestone, like 10% or 20% gain. It’s a way to track progress and understand how your strategies are performing in real-time during backtesting or live trading.

The notification includes details like the signal’s ID, the timestamp of the event, and the specific level of profit achieved. You'll also see information about the symbol being traded, the strategy and exchange involved, and the current market price, which helps analyze the conditions at the time the profit level was hit. The 'backtest' property confirms whether this notification occurred during a backtest simulation. Finally, it tells you whether the position is long or short.

## Interface PartialProfitContract

This describes events that happen when a trading strategy reaches certain profit milestones, like 10%, 20%, or 30% gain. These events, called `PartialProfitContract`, give you information about what's happening during a trade.

You’ll find details like the trading symbol (e.g., BTCUSDT), the name of the strategy being used, and the exchange where the trade is taking place. It also includes the original price and take profit levels used for the trade, alongside the current price when the profit level was hit.

Each event represents a single profit level reached by a trade signal, and they’re only sent once per level. The `backtest` flag tells you whether the event came from a simulated historical trade or a real-time live trade. Timestamps precisely mark when each level was detected, either in real-time or based on the historical candle data. These events can be used to track performance and understand how your strategies are executing.

## Interface PartialLossNotification

This notification lets you know when a trading signal has experienced a loss, hitting a predefined milestone like a 10% or 20% drawdown. It’s a signal that something's gone wrong and you might want to adjust your strategy or risk management.

The notification contains details like the signal's ID, the time it occurred, whether it's from a backtest, the traded symbol, the strategy and exchange names. Crucially, it tells you the loss level reached (like -10%), the current price of the asset, the opening price at the time the position was opened, and whether the position is long or short. You can use this information to understand the context of the loss and potentially take corrective action.

## Interface PartialLossContract

The PartialLossContract represents when a trading strategy hits a predefined loss level, like a -10%, -20%, or -30% drawdown. It's a way to keep track of how much a strategy is losing and when those loss milestones are triggered.

Each time a loss level is reached, this contract provides detailed information, including the trading pair (symbol), the strategy's name, the exchange and frame it's running on, all the original signal data, the current market price, and the specific loss level reached. Think of it as a detailed report card for each loss event.

Importantly, you’ll only receive one notification per loss level for a particular signal, preventing duplicate reports.  Events can also be grouped together if the market moves significantly in a single tick.

The `backtest` flag tells you whether the event occurred during a historical backtest or in real-time trading. The timestamp indicates exactly when the loss level was detected – either the real-time moment in live trading or the candle timestamp during a backtest. This data is useful for creating reports, monitoring strategy performance, or triggering custom actions when certain loss levels are hit.

## Interface PartialEvent

This interface, `PartialEvent`, bundles together all the key data points needed when generating reports about your trading activity. Think of it as a snapshot of a significant moment during a trade, marking a profit or loss level being hit.  It includes details like the exact time the event happened, whether it was a profit or loss, the trading symbol involved, the name of the strategy used, and even a unique ID for the signal that triggered the trade. 

You’ll also find information about the position type (long or short), the current market price, the specific profit or loss level reached (like 10%, 20%, etc.), and the original entry, take profit, and stop-loss prices.  A handy `note` field allows you to add a descriptive explanation for each event.  Finally, it indicates whether the trade occurred during a backtest simulation or in live trading conditions.

## Interface MetricStats

`MetricStats` helps you understand how a particular performance measurement is doing over time. It bundles together a bunch of useful details about a specific metric, like how many times it was recorded, how long it typically takes, and the range of durations you've seen. You'll find information like average duration, minimum and maximum times, and even statistical measures like standard deviation and percentiles (like the 95th and 99th percentile). It also provides wait time information to understand the spacing between events related to the metric. Essentially, it's a snapshot of the performance characteristics of a specific metric.

## Interface MessageModel

This describes the structure of a message used within the backtest-kit framework, particularly for interactions with Large Language Models. Think of it as representing a single turn in a conversation. Each message has a `role` which tells you who sent it – whether it's the system providing instructions, the user asking a question, or the LLM giving a response.  The `content` property simply holds the actual text of that message. This model is essential for building prompts and keeping track of the conversation's flow when using an Optimizer.


## Interface LiveStatisticsModel

This model gives you a detailed snapshot of how your live trading is performing. It tracks everything from the total number of trades to individual win/loss counts, giving you a complete picture of your strategy's behavior.

You’ll find a chronological list of every event – from idle periods to opened, active, and closed signals – along with key metrics like win rate, average profit per trade, and overall cumulative profit. It also provides advanced measures like standard deviation (a measure of volatility) and the Sharpe Ratio, which helps assess your return compared to the risk taken.  Several of these metrics are marked as potentially unsafe (null) if the calculations can't be reliably performed. Ultimately, this model helps you understand and refine your trading strategy.


## Interface LiveDoneNotification

This notification signals that a live trading session has finished. It’s a message your application receives when a live trade is fully executed and no longer actively running. 

The notification includes key details about the completed trade, such as a unique identifier (`id`), a timestamp (`timestamp`) indicating when it ended, and confirmation that it was a live trade (`backtest: false`). You’ll also find the traded symbol (`symbol`), the name of the strategy used (`strategyName`), and the name of the exchange involved (`exchangeName`). This information helps you track and analyze the results of your live trading activities.


## Interface IWalkerStrategyResult

This interface describes the outcome for a specific trading strategy when it's evaluated within a backtest comparison. It bundles together key information about the strategy's performance.

You'll find the strategy's name listed, alongside detailed statistics generated during the backtest process – things like total profit, Sharpe ratio, and drawdown. 

A single number, the 'metric', represents how this strategy performed relative to others in the comparison, and this will be null if the strategy's data isn’t usable for comparison. Finally, the 'rank' property tells you where this strategy sits in the overall performance ranking – a lower rank means a better result.

## Interface IWalkerSchema

The `IWalkerSchema` helps you set up A/B tests for different trading strategies within backtest-kit. Think of it as a blueprint for comparing how various strategies perform against each other. 

You give it a unique name to identify the test, along with a helpful note for yourself.  It also specifies which exchange and timeframe you’ll be using for the entire test.

Most importantly, you define the names of the strategies you want to compare – these strategies must have been previously registered in the system. You can choose a specific metric, like Sharpe Ratio, to optimize for, and optionally add callback functions to monitor key events during the testing process. Essentially, this schema defines the overall setup and configuration for a comparison of multiple trading strategies.


## Interface IWalkerResults

The `IWalkerResults` object holds all the information gathered after a complete backtest comparison run. It tells you which asset, or `symbol`, was tested, and which `exchangeName` was used for the backtesting. You'll also find the `walkerName` identifying the specific backtest process executed, and the `frameName` indicating the time interval (like daily or hourly) used for the analysis. Essentially, this object gives you a clear picture of the context surrounding a set of backtest results.

## Interface IWalkerCallbacks

This interface lets you hook into the backtest process and get notified at key moments. You can use it to track the progress of your strategy comparisons or react to certain events. 

Specifically, you'll get a notification when each strategy begins testing (`onStrategyStart`), when a strategy finishes its backtest (`onStrategyComplete`), and if an error occurs during a strategy’s test (`onStrategyError`). Finally, `onComplete` is called when all the strategies have been run, giving you the overall results. This allows you to customize how backtest-kit behaves and monitor its performance.


## Interface IStrategyTickResultScheduled

This interface describes what happens when a trading strategy generates a signal that's set to activate later, based on price movements. Essentially, it's a notification that a signal has been created and is "waiting" for the price to reach a specific level. 

You'll see this type of result when your strategy's logic determines a signal, but the conditions for execution haven't been fully met yet.  It includes details like the strategy’s name, the exchange being used, the timeframe, the symbol being traded, and the price at which the signal was originally created. The `backtest` property tells you if this event occurred during a simulated backtest or in a live trading environment. This information is valuable for monitoring and debugging your strategy's behavior.

## Interface IStrategyTickResultOpened

This interface describes what happens when a new trading signal is created within the backtest-kit framework. It essentially tells you that a signal has just been generated and is ready to be used.

You’ll find details about the signal itself – including its unique ID and the strategy, exchange, and timeframe involved in creating it. There’s also information about the current price at the time the signal was opened and whether this event occurred during a backtest or in a live trading environment. Think of it as a notification that a new signal is active, along with all the necessary context.


## Interface IStrategyTickResultIdle

This interface describes what happens when your trading strategy is in an "idle" state, meaning it's not currently executing a trade. It provides information about the situation – you’ll see the strategy's name, the exchange it's connected to, the timeframe being used, and the trading pair involved. The current price is also recorded, so you know what the market conditions were like when the strategy went idle.  Finally, it tells you whether this idle event happened during a backtest (simulated trading) or in live, real-time trading. This lets you understand the context behind periods of inactivity in your strategy.

## Interface IStrategyTickResultClosed

This interface represents the data you receive when a trading signal is closed within the backtest framework. It provides a complete picture of what happened, including the reason for closing, the final price, and the profit or loss achieved. You'll see details like the strategy's name, the exchange used, and the timeframe involved, alongside whether the event occurred during a backtest or live trading session. The `signal` property holds all the original details of the signal that was closed, while `pnl` contains the breakdown of the profit/loss calculation, accounting for fees and slippage. Essentially, this gives you the final accounting of a closed trading signal.


## Interface IStrategyTickResultCancelled

This interface, `IStrategyTickResultCancelled`, describes what happens when a trading signal you've scheduled doesn't actually result in a trade. This could be because the signal never activates or because it's cancelled before a position can be opened, perhaps due to a stop loss being triggered.

The data it provides includes the original signal that was scheduled, the final price at the time of cancellation, and a timestamp to mark when it happened. You'll also find details like the strategy and exchange names, the trading symbol, and whether it’s a backtest or live trade.

Crucially, it explains *why* the signal was cancelled – you’ll see the `reason` property indicating the cause. There's even an optional `cancelId` if the signal was explicitly cancelled using a cancellation request. Essentially, it gives you the information you need to understand why a planned trade didn't occur.


## Interface IStrategyTickResultActive

This interface represents a tick result specifically when a strategy is actively monitoring a signal, waiting for a take profit, stop loss, or time expiration. It provides detailed information about the active trade, including the strategy and exchange names, the trading symbol, and the timeframe being used. You'll find data like the current price being monitored, how far the trade is progressing towards its take profit or stop loss, and the unrealized profit and loss (including fees and slippage).  The `action` property confirms this is an "active" state, and the `backtest` property indicates whether this data originated from a backtest or a live trading environment. It's a comprehensive snapshot of the situation when a position is being managed.

## Interface IStrategySchema

This schema describes how a trading strategy is defined and registered within the backtest-kit framework. Each strategy gets a unique name for identification purposes and you can add a note to describe its logic.

The `interval` property sets a minimum time between signals, helping to control how frequently the strategy reacts to market conditions. 

The core of the strategy is the `getSignal` function, which generates trading signals. This function takes a symbol and a timestamp as input, and returns a signal object (or null if no signal is present). You can even make signals wait for a specific price to be hit by providing an entry price.

You can optionally provide lifecycle callbacks like `onOpen` and `onClose` to react to when a position is opened or closed.  

Finally, you can associate a strategy with a specific risk profile, either a single name or a list of names, to help manage potential risks.

## Interface IStrategyResult

This interface, `IStrategyResult`, is designed to hold all the key information about a trading strategy after it’s been tested. Think of it as a single row in a comparison table that shows how different strategies performed. Each result will include the strategy’s name, a comprehensive set of statistics detailing its performance, and a numerical metric value used to rank strategies against each other. If a strategy's results aren’t valid for comparison, this metric value will be null. Essentially, it's a neat package to represent and compare strategy outcomes.

## Interface IStrategyPnL

This interface represents the profit and loss (PnL) calculated for a trading strategy. It gives you the key details about a trade's performance.

The `pnlPercentage` tells you the overall profit or loss as a percentage – a positive number means you made money, and a negative number means you lost.

You'll also find the `priceOpen` and `priceClose`, which are the actual prices used for the trade. These prices have already been adjusted to account for common trading costs like fees (0.1%) and slippage (0.1%), so you're seeing a more realistic view of your returns.

## Interface IStrategyCallbacks

This interface lets you hook into different moments in a trading strategy's lifecycle. Think of them as notification events that your strategy can react to. 

You’ll get notified on every tick of market data with `onTick`. `onOpen` is triggered when a new trade signal is validated and opened. `onActive` lets you know when a signal is being actively monitored.  `onIdle` signals that there are no active trades. When a trade is closed, `onClose` will inform you, providing the final price.

If you're using scheduled trades, `onSchedule` happens when a signal is created for later entry, and `onCancel` when a scheduled signal is cancelled. `onWrite` is used internally for testing purposes to persist signal data.

You can also respond to smaller changes in a trade's progress; `onPartialProfit` and `onPartialLoss` alert you when a trade is moving favorably or unfavorably, respectively, but hasn’t reached its target profit or stop-loss. `onBreakeven` signals when a trade has reached a point where your stop-loss is moved to your entry price. Finally, `onPing` is a regular check-in every minute, even if your strategy doesn't run that often, allowing for custom monitoring and cancellation logic.

## Interface IStrategy

This interface defines the core methods needed for a trading strategy within the backtest-kit framework. It outlines how a strategy interacts with the system to execute trades, monitor conditions, and manage risk.

The `tick` method is the heart of the strategy, handling each price update and checking for signals, take profit (TP), and stop-loss (SL) conditions. `getPendingSignal` and `getScheduledSignal` retrieve information about active signals, which is used for TP/SL monitoring and time expiration.

`getBreakeven` determines if a position has reached a point where the potential profit covers transaction costs, allowing a move to breakeven. The `getStopped` method lets you check if the strategy's processing has been halted.

The `backtest` method enables quick simulations using historical data, evaluating strategy performance.  `stop` prevents new signals, allowing for graceful shutdowns. `cancel` removes scheduled signals without impacting the strategy's overall operation.

`partialProfit` and `partialLoss` provide ways to close portions of a position at a profit or loss level, respectively. These methods manage state updates and crash recovery.  `trailingStop` adjusts the stop-loss distance, while `trailingTake` modifies the take-profit distance, both crucial for dynamic risk management.  Finally, `breakeven` automatically moves the stop-loss to the entry price once a certain profit threshold is met.

## Interface ISizingSchemaKelly

This interface defines a sizing strategy based on the Kelly Criterion, a mathematical formula used to determine optimal bet size. It allows you to specify that you're using the Kelly Criterion for sizing your trades.  The `kellyMultiplier` property lets you adjust the aggressiveness of the strategy; a lower number, like the default 0.25, represents a more conservative "quarter Kelly" approach, while higher values increase the bet size based on the Kelly formula's output. Essentially, you’re controlling how much of your capital to risk using the Kelly Criterion.

## Interface ISizingSchemaFixedPercentage

This schema defines a trading strategy where you consistently risk a fixed percentage of your capital on each trade. The `method` property is always set to "fixed-percentage" to identify this specific sizing approach. The `riskPercentage` property determines that percentage; for example, a value of 10 means you’ll risk 10% of your capital per trade. Keep in mind this value needs to be between 0 and 100 to represent a valid percentage.

## Interface ISizingSchemaBase

This interface, `ISizingSchemaBase`, lays the groundwork for defining how much of your account to risk on each trade. Think of it as the core configuration for sizing your positions. 

It includes essential details like a unique name to identify the sizing strategy, a place for developer notes, and limits on position size, both as a percentage of your account and as absolute numbers. You can also add optional callbacks to customize the sizing process further, allowing you to react to different events within the backtest. It helps ensure your trading strategy adheres to predefined risk parameters.

## Interface ISizingSchemaATR

This schema defines how to size your trades based on the Average True Range (ATR), a common volatility indicator. 

It’s designed to automatically adjust your position size according to market volatility.

The `method` is always set to "atr-based" to indicate this sizing strategy. 

`riskPercentage` lets you control the maximum percentage of your account you're willing to risk on any single trade, typically a value between 0 and 100.

Finally, `atrMultiplier` determines how much the stop-loss distance will be based on the ATR value; a higher multiplier means a wider stop, and potentially smaller position sizes in volatile markets.

## Interface ISizingParamsKelly

This interface, `ISizingParamsKelly`, helps you define how much of your capital to risk on each trade when using the Kelly Criterion. It's used when setting up your trading strategy within backtest-kit.  You'll need to provide a logger, which is a tool for recording useful debugging information as your backtest runs. Think of the logger as a way to keep track of what's happening behind the scenes.

## Interface ISizingParamsFixedPercentage

This interface defines how to set up your trade sizing when using a fixed percentage approach. It's a simple way to ensure that each trade you take represents a consistent portion of your available capital. 

The core of this setup involves specifying a `logger` – this helps you keep track of what’s happening behind the scenes, like debugging trade sizing calculations. Think of it as a helpful tool to monitor and adjust your strategy.


## Interface ISizingParamsATR

This interface defines the parameters needed when you're determining how much to trade based on the Average True Range (ATR) indicator. It's primarily used when setting up your trading strategy’s sizing logic within backtest-kit.

You'll find a `logger` property here, which is essential for keeping track of what's happening in your code and helps in debugging your sizing calculations – it's a way to record messages and information during the backtesting process. Think of it as a tool for understanding how your strategy is behaving.


## Interface ISizingCallbacks

The `ISizingCallbacks` interface lets you hook into the sizing process within the backtest-kit framework. Specifically, you can provide a function, `onCalculate`, that gets triggered immediately after the framework determines how much to trade. This is a great place to observe the calculated size, perhaps to record it for analysis or double-check that it's within expected limits. Think of it as a notification system so you can see what's happening behind the scenes when the framework decides on trade sizes.

## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate your trade size using the Kelly Criterion. It's all about figuring out how much to risk based on your historical trading performance.

You’ll provide a win rate, representing the percentage of trades that are successful, and a win/loss ratio, which tells you the average profit compared to the average loss on winning trades. 

Essentially, it’s a structured way to feed your backtest results into a sizing strategy that aims to maximize long-term growth.


## Interface ISizingCalculateParamsFixedPercentage

This interface defines the information needed to calculate trade size using a fixed percentage of your capital. It's specifically for strategies that want to risk a set percentage of their funds on each trade. 

You’ll provide a `method` which must be set to "fixed-percentage" to indicate you're using this sizing strategy.  You also need to specify a `priceStopLoss`, which is the price at which your stop-loss order will be triggered, helping determine the trade size.

## Interface ISizingCalculateParamsBase

This interface defines the core information needed for calculating the size of a trade. It includes the trading symbol, like "BTCUSDT", which identifies the pair you're trading. You'll also find your current account balance, representing the funds available for trading, and the planned entry price for the potential trade. These three pieces of data form the foundation for figuring out how much of an asset to buy or sell.


## Interface ISizingCalculateParamsATR

This interface defines the settings you’ll use when determining your trade size based on the Average True Range (ATR).  Essentially, it tells the backtest system that you want to use an ATR-based sizing strategy. You'll need to provide the current ATR value as a number to guide how much to trade. Think of it as specifying you're using ATR to manage risk and size your positions appropriately.

## Interface ISizing

The `ISizing` interface is a core component for determining how much of an asset to trade. Think of it as the brains behind your position sizing strategy. It’s used behind the scenes when your trading strategy is being executed.

The `calculate` property is the key here. It’s a function that takes a set of parameters – essentially, information about your risk profile and the current trading conditions – and then figures out the optimal position size to take. This function will return a promise that resolves to the calculated size.

## Interface ISignalRow

The `ISignalRow` represents a complete trading signal, acting as the core data structure within the backtest-kit framework. Each signal gets a unique identifier assigned automatically, making it easy to track and manage throughout the backtesting process.

It stores essential information like the entry price, the exchange and strategy used for the trade, the timeframe considered, and when the signal was created and became active.  You'll find the trading symbol (like BTCUSDT) and markers indicating whether the signal was scheduled or not.

A key feature is the ability to track partial position closures, crucial for accurately calculating profit and loss, using the `_partial` property. It keeps a record of each partial close, noting the type (profit or loss) and the price at which it occurred.  This allows for a more precise PNL calculation based on the weighted contributions of each partial close.

Finally, it supports trailing stop-loss and take-profit prices with the `_trailingPriceStopLoss` and `_trailingPriceTakeProfit` properties, dynamically adjusting these prices based on the strategy's logic and position type. These trailing prices override the original stop-loss and take-profit values during execution.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, the kind of information you'd use to initiate a trade. Think of it as a standardized format for describing a trade idea. It contains details like whether you're going long (buying) or short (selling), the entry price, and the levels for taking profit and setting a stop-loss to manage risk.  

Each signal will have a unique identifier, generated automatically if you don’t provide one. You’ll also find a field for a brief explanation of why the signal was generated. Finally, there's an estimate of how long the trade is expected to last. The price levels for take profit and stop loss must be set correctly in relation to the entry price, ensuring that a long position has a take profit above and a stop loss below, and a short position the opposite way around.

## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, describes a signal that's designed to be triggered at a specific price in the future. Think of it as a signal on hold, waiting for the market to reach a certain level. It builds upon the basic `ISignalRow` and represents a signal that's currently inactive, pending until the price hits your target. 

Once the market price reaches the `priceOpen` level, this “scheduled” signal transforms into a standard pending signal, ready to be executed.  A key feature is how the time it’s been waiting (pending time) is tracked – it initially reflects when the signal was scheduled, and updates to the actual wait time once it's activated. The `priceOpen` property simply defines that target price the signal is waiting for.

## Interface IScheduledSignalCancelRow

This interface, `IScheduledSignalCancelRow`, represents a scheduled trading signal that might have been canceled by a user. It builds upon the `IScheduledSignalRow` interface, adding a `cancelId` property. This `cancelId` is only present if a user specifically requested the signal be canceled, allowing you to track those user-initiated cancellations alongside automatically scheduled signals. Think of it as a way to distinguish signals that were executed as planned from those that were manually stopped.

## Interface IRiskValidationPayload

This interface, `IRiskValidationPayload`, is designed to give risk validation functions all the information they need to make informed decisions. Think of it as a package containing details about the current trading environment. 

It builds upon `IRiskCheckArgs` and includes data about the portfolio’s state. Specifically, you'll find the `pendingSignal` – the signal that’s about to be acted upon;  the `activePositionCount` – simply the number of positions currently held; and a detailed list of `activePositions` providing specifics on those positions.


## Interface IRiskValidationFn

This defines how you can check if a trade is safe to execute. Think of it as a gatekeeper for your trading strategies. It’s a function that takes trade details and decides whether to allow the trade or not. 

If everything looks good, it simply lets the trade proceed by returning nothing. If something's wrong – maybe the risk is too high – it can either return a specific rejection reason (an `IRiskRejectionResult`) or throw an error, which backtest-kit will then handle and convert into a rejection reason.

## Interface IRiskValidation

This interface helps you define how to check if your trading risks are acceptable. It’s all about setting up rules to make sure your trading strategy doesn't expose you to too much danger.

You specify a `validate` function, which is the core of the check – it takes the risk parameters and determines if they pass or fail.  You can also add a `note` to explain what this particular validation is doing and why it’s important; this is great for making your code easier to understand and maintain. Essentially, it's a way to document and enforce your risk management rules.

## Interface IRiskSignalRow

This interface, `IRiskSignalRow`, helps with managing risk during trading. It builds upon the existing `ISignalDto` to provide extra information vital for risk checks. Specifically, it includes the entry price (`priceOpen`), the initially set stop-loss price (`originalPriceStopLoss`), and the originally planned take-profit price (`originalPriceTakeProfit`). Having these values readily available simplifies verifying risk parameters and ensuring positions are handled responsibly.

## Interface IRiskSchema

This interface, `IRiskSchema`, helps you define and manage risk controls for your trading portfolio. Think of it as a blueprint for setting up safety checks and limits. 

Each schema has a unique `riskName` to identify it, and you can add a `note` to explain its purpose. 

You can optionally provide `callbacks` to be notified when a risk check is rejected or allowed, allowing you to react programmatically.  The heart of the schema is the `validations` array. This array holds the actual rules – custom functions or objects – that determine if a trade or portfolio action is permissible based on your defined risk criteria.

## Interface IRiskRejectionResult

This interface, `IRiskRejectionResult`, helps you understand why a trading strategy's risk validation failed. When your backtest kit strategy doesn't pass the risk checks, this result is provided to give you more details.  It includes a unique `id` to track the specific rejection and a clear `note` explaining the reason behind the failure in plain language, making it easier to debug and fix the issue. Essentially, it's a helpful message telling you what went wrong during the risk assessment.

## Interface IRiskParams

The `IRiskParams` object defines the settings used when setting up the risk management system. It includes essential information like the name of the exchange you’re working with, a logger to help track what's happening, and a flag to indicate whether you're running a test backtest or a live trading session.  A crucial part of this setup is the `onRejected` callback, which you can customize to handle situations where a trading signal is blocked by risk limits – it lets you react to those rejections and potentially emit events related to them.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, holds all the information needed to perform a risk check before a new trade is potentially opened. Think of it as a safety net – it's used *before* a signal is created to make sure the conditions are right to actually execute a trade. 

It bundles together key details like the trading pair's symbol (e.g., "BTCUSDT"), the pending signal itself, the name of the strategy suggesting the trade, and information about the exchange, the risk profile being used, and the timeframe involved.  The current price and a timestamp are also included for precise calculations and context. Essentially, everything you need to assess the risk associated with a potential new position is right here.

## Interface IRiskCallbacks

This interface defines optional functions that your trading strategy can use to react to risk-related events. Think of them as notifications – your strategy gets told when a trade is blocked by risk rules or when it's cleared to proceed.

The `onRejected` function is triggered when a trading signal is stopped because it would violate pre-defined risk parameters.  Conversely, `onAllowed` is called when a signal successfully passes all risk checks and is approved for execution.  You can use these callbacks to log these events, update your strategy’s state, or take other actions based on the risk assessment.


## Interface IRiskActivePosition

This interface describes an active trading position that’s being monitored by the risk management system. Think of it as a snapshot of a trade – it holds key details like which strategy opened it, on what exchange, and the trading symbol involved. 

You'll find information about the position’s direction (long or short), the price at which it was entered, and any stop-loss or take-profit orders that were set. 

The interface also records the estimated duration of the position and the exact time it was initiated. This allows for deeper analysis across different trading strategies and helps track performance.


## Interface IRisk

This interface defines how a system can manage and enforce risk rules when trading. It allows you to determine if a trading signal is safe to execute, based on pre-defined risk limits. 

You can use it to register when a new trade is opened, tracking details like the trade direction, entry price, stop-loss, and estimated holding time.  Conversely, it provides a way to record when a trade has closed, ensuring the system stays up-to-date. Essentially, it's the backbone for controlling how much risk your trading strategies take on.


## Interface IReportTarget

This interface lets you choose exactly what kinds of data to log during your backtesting sessions. Think of it as a way to fine-tune the level of detail you want recorded.

You can toggle on or off logging for things like risk rejections, breakeven points, partial order closures, heatmap data, walker iterations, performance metrics, scheduled signals, and even live trading events. Each property (risk, breakeven, partial, heat, walker, performance, schedule, live, backtest) corresponds to a specific type of event, and setting it to `true` enables logging for that event.  It's perfect for focusing on the aspects of your strategy you're most interested in analyzing.

## Interface IReportDumpOptions

This interface, `IReportDumpOptions`, helps you organize and identify the data being written out from backtest-kit's reports. Think of it as a set of labels that tell you exactly what you're looking at in your reports – what trading pair was involved, which strategy was used, the name of the exchange, the timeframe, and even a unique identifier for the signal.  It lets you filter and search through your reports easily, so you can quickly find the data you need based on these key characteristics like the trading symbol or strategy name. Using these properties ensures your reports are clearly categorized and traceable.

## Interface IPublicSignalRow

The `IPublicSignalRow` interface provides a way to share signal data with users while maintaining transparency about the initial trade parameters. It builds upon the standard `ISignalRow` by adding `originalPriceStopLoss` and `originalPriceTakeProfit` properties. These original stop-loss and take-profit prices are the values set when the signal was created and they won’t change, even if the stop-loss or take-profit is adjusted using trailing logic.

This is helpful for showing users the initial trade setup alongside the currently active, potentially adjusted, stop-loss and take-profit levels.

Finally, `totalExecuted` tells you the total percentage of the position that has been closed through partial executions, offering insight into how much of the position has already been realized.

## Interface IPositionSizeKellyParams

The `IPositionSizeKellyParams` interface defines how you set up the Kelly Criterion for determining position sizes in your backtests. It’s a straightforward way to tell the framework how aggressive or conservative you want your trading to be. You'll specify the `winRate`, representing the probability of a winning trade, and the `winLossRatio`, which describes how much you typically win compared to how much you lose on each trade. These two values together help calculate an optimal position size based on Kelly’s formula.

## Interface IPositionSizeFixedPercentageParams

This describes the settings needed for a trading strategy that uses a fixed percentage of your available capital for each trade, and specifically focuses on the stop-loss price. The `priceStopLoss` value tells the system at what price to place a stop-loss order, helping manage risk by automatically limiting potential losses on a trade. It's a simple, straightforward way to control position sizing based on a percentage of your total funds.

## Interface IPositionSizeATRParams

This interface defines the parameters needed to calculate your position size using an Average True Range (ATR) approach. Specifically, it contains the current ATR value, which is a measure of market volatility. You'll use this value to determine how much of your capital to allocate to a trade, with higher ATR values typically resulting in smaller position sizes. This parameter helps you manage risk by automatically adjusting your trade size based on how volatile the market is.

## Interface IPersistBase

This interface provides a simple way for you to build custom storage solutions for your backtesting framework. It outlines the core functions needed for persistence, like reading, writing, and checking for the existence of data. Think of it as a contract – if you create your own storage adapter, it needs to fulfill these basic operations. The `waitForInit` method ensures your storage is properly set up at the beginning, `readValue` retrieves data, `hasValue` confirms data exists, and `writeValue` saves data reliably. It’s designed to be flexible so you can connect to databases, files, or any other storage mechanism you need.

## Interface IPartialData

This interface describes a small piece of data used to save and load the progress of a trading signal. It's designed to be easily stored and retrieved, even if the full trading state isn't needed. Specifically, it holds information about the profit and loss levels that have been hit during trading. These levels are stored as arrays, which makes them compatible with standard data formats like JSON. Think of it as a snapshot of key milestones for a signal.

## Interface IPartial

This interface, `IPartial`, helps track how a trading signal is performing financially. It's used internally to manage profit and loss milestones like 10%, 20%, or 30% levels.

When a signal is making money, the `profit` method calculates the current profit level and sends out notifications for any new milestones achieved. The `loss` method does the same for losses – tracking and reporting new loss levels.

Finally, when a signal finishes trading (whether it hits a take profit, stop loss, or expires), the `clear` method cleans up the recorded data, removes the signal's information from memory, and saves the changes. It’s essentially a way to reset the tracking for the next trading signal.

## Interface IOrderBookData

This interface represents the data you receive for an order book, which shows the current buy and sell orders available for a trading pair. It includes the `symbol` of the trading pair, like "BTCUSDT".  You'll also find arrays of `bids` and `asks`.  The `bids` array holds data for buy orders, and the `asks` array holds data for sell orders. Each element within these arrays contains details about a specific order.

## Interface IOptimizerTemplate

This interface, `IOptimizerTemplate`, provides a collection of tools for building and configuring backtesting systems, particularly when using Large Language Models (LLMs). It's designed to generate the code snippets needed to set up different parts of your backtesting environment.

Think of it as a code generator – you give it information like the symbol you’re trading, the names of your components, and timeframe details, and it provides the necessary TypeScript code.  You'll find methods to create the initial setup (`getTopBanner`), craft messages for LLM interaction (`getUserMessage`, `getAssistantMessage`), and configure crucial elements like Walkers, Exchanges, Frames (timeframes), and Strategies.  It also includes helpers like `getJsonDumpTemplate` and `getTextTemplate` to assist with debugging and structuring LLM outputs. Essentially, it simplifies the process of creating the foundational code for your automated trading experiments.


## Interface IOptimizerStrategy

This interface, `IOptimizerStrategy`, holds all the information that went into creating a particular trading strategy. Think of it as the complete backstory – it includes the symbol the strategy is designed for, a unique name to identify it, and the entire conversation with the language model that shaped its logic. You'll find the prompts and responses from the LLM, which represent the user's instructions and the model's reasoning, all stored within the `messages` property. Finally, the `strategy` property contains the actual text that defines the trading rules – it's the result of the prompting process and represents the core strategy itself.

## Interface IOptimizerSourceFn

The `IOptimizerSourceFn` is essentially a function that provides the data needed to train and optimize your trading strategies. Think of it as a pipeline feeding data to your backtesting engine. It’s designed to handle large datasets efficiently using pagination, meaning it doesn't load everything at once, but in manageable chunks. Importantly, each piece of data it provides needs to have a unique identifier, which is crucial for keeping track of things during the optimization process. This ensures the backtest-kit can reliably manage and use the data for refining your strategies.

## Interface IOptimizerSource

This interface helps you define where your backtest data comes from and how it’s presented to a language model. Think of it as configuring a data pipeline for your LLM-powered trading analysis.

You'll give it a unique name for tracking purposes, and a description to clarify its role. The most important part is the `fetch` function, which is responsible for retrieving the actual backtest results, ensuring it can handle large datasets through pagination.

To really customize how the data is communicated to the LLM, you can provide custom formatters for both the “user” (your prompts) and the "assistant" (the LLM's responses).  If you don't provide these, the system uses built-in templates to structure the messages.

## Interface IOptimizerSchema

This schema defines how your optimizer will work within the backtest-kit framework. Think of it as a blueprint for building and evaluating trading strategies. 

You'll use it to tell the framework where to get your data, how to generate strategy ideas (using prompts), and how to test those strategies. 

It allows you to specify multiple training periods to compare different strategy variations. A separate testing period is designated for validating the final strategy's performance. 

You can give your optimizer a descriptive name and add a note for explanation. The `getPrompt` function is key; it’s responsible for crafting the prompts that drive strategy generation from conversation history. Optionally, you can customize the strategy generation process and track its progress with lifecycle callbacks.

## Interface IOptimizerRange

This interface lets you define specific time periods for backtesting or optimizing your trading strategies. Think of it as setting the boundaries for the data your system will use. You specify a `startDate` and an `endDate` to clearly mark the beginning and end of the period.  Optionally, you can add a `note` – a short description – to help you remember what this time range represents, like "2023 market correction" or "Post-pandemic recovery".

## Interface IOptimizerParams

This interface describes the settings needed to set up a ClientOptimizer. Think of it as the blueprint for how the optimization process will run. 

It requires a logger, which is used to record important events and provide helpful debugging information – essentially, it keeps track of what's happening.

It also needs a complete template, which defines all the available strategies and how they should be executed during optimization. This template combines your custom settings with some default values to make sure everything works correctly.

## Interface IOptimizerFilterArgs

This interface defines the information needed to request specific data from a data source. It's primarily used when optimizing trading strategies, allowing you to specify exactly which trading pair and time period you're interested in. You’ll provide a symbol, like "BTCUSDT," along with a start date and an end date to define the data range for analysis. Essentially, it helps narrow down the data used for backtesting or optimization.

## Interface IOptimizerFetchArgs

When you're pulling data for optimization, `IOptimizerFetchArgs` helps manage how much data you get at once. Think of it as a way to break down large datasets into smaller, more manageable chunks. The `limit` property controls how many records you retrieve in each request – the default is 25, but you can adjust it.  The `offset` lets you specify where to start fetching from, useful for pagination where you're moving through data page by page.

## Interface IOptimizerData

This interface defines the basic structure for data that will be used to optimize trading strategies. Every data source providing information for optimization needs to have a unique identifier, called `id`, for each data point. This `id` helps prevent duplicate data entries when you're working with large datasets or pulling data in chunks. Think of it as a way to make sure you're only using each piece of data once, even if you retrieve it in multiple steps.

## Interface IOptimizerCallbacks

This interface lets you plug in custom functions to keep an eye on what's happening during the optimization process. You can use these callbacks to log important events, verify data or code, or trigger other actions. 

Specifically, `onData` is triggered when the optimization framework has gathered and processed all the data needed for your strategies. `onCode` gives you a notification when the strategy code has been generated. You'll get `onDump` when the generated code is written to a file. Finally, `onSourceData` informs you when data has been successfully pulled from your data source, along with details about the data, the source name, and the date range.

## Interface IOptimizer

The `IOptimizer` interface lets you work with a system that creates trading strategies and generates the code to run them. Think of it as a way to automate the process of building and testing trading ideas. 

You can use `getData` to pull information and create a basic outline for a strategy, essentially prepping the groundwork.  Then, `getCode` takes that groundwork and produces the full, ready-to-use code for your trading strategy, including all the necessary pieces to execute it. Finally, `dump` allows you to save that generated code directly to a file, organizing it into a usable project structure for you.

## Interface InfoErrorNotification

This notification lets you know about problems that popped up during background processes, but aren't critical enough to stop everything. Think of it as a heads-up about something that needs attention. 

Each notification has a unique identifier (`id`) to help you track it, and a timestamp to tell you precisely when it occurred.  It carries details about the error itself (`error` - a generic object containing more specifics), and a user-friendly explanation (`message`) of what happened. The `backtest` flag indicates whether the error occurred during a backtesting simulation.  The `type` property is fixed to "error.info" to clearly identify this kind of notification.

## Interface IMethodContext

The `IMethodContext` interface acts as a little helper, carrying important names that guide the backtest-kit framework in finding the right components for your trading simulations. Think of it as a set of instructions – it tells the system which strategy, exchange, and frame configurations to use. It’s automatically passed around during the backtesting process, so you don’t need to manually track these names yourself.  This makes it easier to ensure the correct strategy and data are used in each step of your backtest. The `frameName` property is especially important; it's left blank when running in live mode, distinguishing it from backtesting scenarios.


## Interface IMarkdownTarget

This interface lets you choose which detailed reports to generate when running backtests. Think of it as a way to control how much information you get back about your strategy's performance.

You can turn on reports for things like risk rejections – when your strategy would have taken a trade but was blocked by risk rules. 

It also allows you to track specific events like when your stop-loss moves to your entry price (breakeven), or when you take partial profits. 

You can even get a portfolio heatmap, compare different strategy versions, and analyze performance bottlenecks. 

Finally, you can enable reports for scheduled signals, live trading events, or comprehensive backtest results with a full trade history. Select the features you need for your analysis.

## Interface IMarkdownDumpOptions

This interface, `IMarkdownDumpOptions`, acts as a container for all the details needed when creating markdown reports within the backtest-kit framework. Think of it as a way to organize all the identifying information about a specific backtest result, like which strategy was used, which trading pair it involved, and even the timeframe it analyzed.  Each property represents a piece of that information – the directory to save the report, the filename, the symbol being traded, the strategy's name, the exchange used, the timeframe of the data, and a unique ID for the signal that triggered trades.  Having all this grouped together makes it much easier to generate and organize backtest documentation.


## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework can report what's happening. Think of it as a way to leave breadcrumbs as the system runs, so you can understand how things work or troubleshoot problems.

It provides several methods for different types of messages: `log` for general events, `debug` for very detailed information you'd usually only use when debugging, `info` for important status updates, and `warn` to highlight potential issues that aren't critical errors.  These logs are used by components like agents and storage to record everything from tool calls to errors, which helps with monitoring, auditing, and finding and fixing bugs.

## Interface IHeatmapRow

This interface represents a single row of data for a portfolio heatmap, providing a quick overview of how a particular trading pair (like BTCUSDT) performed across all your strategies. It bundles key performance indicators together, so you can easily compare different symbols.

You'll find metrics like total profit or loss, a Sharpe Ratio to measure risk-adjusted returns, and the maximum drawdown, which indicates the biggest potential loss. 

The data also includes trade statistics – the total number of trades, how many were wins versus losses, and the win rate. Further details like average profit per trade, standard deviation, profit factor, and even the longest winning and losing streaks help paint a more complete picture of that symbol’s trading history. Finally, expectancy, combining win rate and average win/loss amounts, gives an idea of long-term profitability.

## Interface IFrameSchema

This `IFrameschema` helps organize and define how your backtesting data is structured. Think of it as a blueprint for a specific timeframe you want to analyze, like daily or weekly data. 

Each schema has a unique name, a helpful note for developers, and specifies the time interval (like daily, weekly, or hourly) used to generate data points. Critically, it defines the start and end dates of the backtesting period, creating the boundaries of the historical data you'll be working with. You can also add optional lifecycle callbacks to customize how data is handled within each frame.


## Interface IFrameParams

The `IFrameParams` interface defines the information needed to set up a testing environment within backtest-kit. Think of it as the foundational settings for your backtesting process. It builds upon `IFrameSchema`, incorporating additional logging capabilities. The crucial part is the `logger` property, which allows you to monitor and debug what's happening during your backtest – it's your window into the testing process.


## Interface IFrameCallbacks

This section describes callbacks related to the lifecycle of a timeframe within the backtest-kit framework. Specifically, the `onTimeframe` callback is triggered each time a new set of timeframes is created. Think of it as a notification letting you know a batch of timeframes is ready – you can use this opportunity to inspect them, log details, or perform any necessary validations to ensure they are as expected. It receives the generated timeframes (as dates), the start and end dates for the entire timeframe range, and the interval used to create them.


## Interface IFrame

The `IFrames` interface is a crucial part of how backtest-kit organizes and manages time data. Think of it as the engine that creates the timelines your trading strategies will run against.  It provides a method, `getTimeframe`, that you can use to generate a sequence of dates and times for a specific trading symbol and timeframe (like "1m" for one-minute candles or "1d" for daily data).  This method effectively creates the stepping stones for your backtesting process, ensuring your strategy is evaluated at consistent intervals. It’s an internal component, so you generally won't interact with it directly, but it's responsible for delivering the temporal foundation for your backtests.


## Interface IExecutionContext

This interface, `IExecutionContext`, acts like a little package of information that's passed around during your trading strategy's execution. Think of it as the current state of things. It tells your strategy what trading pair it's dealing with (the `symbol`, like "BTCUSDT"), exactly when the operation is happening (`when` - a timestamp), and crucially, whether it's a simulated backtest or a real-time trade (`backtest`). This context is automatically provided, so you don't need to manually manage it – it’s handled by the framework.

## Interface IExchangeSchema

This schema defines how backtest-kit interacts with a specific cryptocurrency exchange. Think of it as a blueprint for connecting to a data source, like an API or database, and understanding how that exchange handles things like order sizes and prices. 

Each exchange you want to use with backtest-kit needs its own schema.

Here's what you need to provide:

*   **exchangeName:** A unique name to identify this exchange within the backtest-kit system.
*   **getCandles:** This is the most important part – it tells backtest-kit how to retrieve historical price data (candles) for a given trading pair and time period.
*   **formatQuantity:** Exchanges have different rules for order sizes. This function helps ensure your orders are correctly formatted for the specific exchange. If you don’t define this, it will default to a common Bitcoin precision.
*   **formatPrice:** Similar to quantity formatting, this handles price formatting according to the exchange’s rules.  It defaults to Bitcoin precision if not provided.
*   **getOrderBook:**  If you need order book data, this function defines how to retrieve it. If omitted, backtest-kit will let you know that this feature is unavailable for that exchange.
*   **callbacks:** You can optionally specify functions to be run at different points, like when new candle data arrives.
*   **note:** This is a place to add a note for documentation purposes.

## Interface IExchangeParams

This interface, `IExchangeParams`, defines the essential configuration needed to connect to and interact with an exchange within the backtest-kit framework. Think of it as a blueprint for how the framework understands your exchange.  It bundles together several crucial services and functions, all of which are necessary for the backtest to function correctly.

The `logger` property lets you direct debugging information, helping you track what's happening during your backtest. The `execution` property provides information about the current environment, like the symbol being traded, the time, and whether it's a backtest or live trading scenario.

Most importantly, you'll need to provide functions for fetching historical candle data (`getCandles`), formatting trade quantities (`formatQuantity`), formatting prices (`formatPrice`), and retrieving order book data (`getOrderBook`).  The framework uses these functions to simulate exchange behavior, so these are vital for accurate backtesting.  Default implementations are available, but you'll typically want to customize them to match the specific rules of the exchange you're using.

## Interface IExchangeCallbacks

This interface lets you hook into what happens when your backtest receives candlestick data from an exchange. Specifically, the `onCandleData` function will be triggered whenever new candlestick data arrives for a particular trading symbol and time interval. You can use this to react to new data, potentially updating your visualizations or performing custom analysis as the data comes in. The function receives the symbol, interval, starting date, number of candles requested, and the actual array of candlestick data.

## Interface IExchange

The `IExchange` interface defines how a trading exchange interacts with the backtest-kit framework. It provides essential functionalities like retrieving historical and future candle data, which is crucial for analyzing past performance and simulating future scenarios. You can also use it to format trade quantities and prices to match the exchange's specific requirements. To help with strategy development, the interface allows you to calculate a VWAP (Volume Weighted Average Price) based on recent trading activity. Finally, it offers a way to access the order book, giving you insight into the current market depth for a particular trading pair.

## Interface IEntity

This interface, `IEntity`, serves as the foundation for any data that's stored and retrieved within the backtest-kit framework. Think of it as a common starting point for how different pieces of information are represented and managed. If you're creating your own custom data objects that need to be saved or loaded, they should generally implement this interface. It provides a basic structure for how these objects are handled throughout the system.

## Interface ICandleData

This interface defines what a single candlestick looks like – think of it as a snapshot of price activity over a specific time. Each candlestick represents a period and includes the opening price, the highest price reached, the lowest price, the closing price, and the total trading volume during that period.  The `timestamp` tells you precisely when that candle began, measured as milliseconds since a fixed point in time. This data is essential for calculations like VWAP and for running backtests to evaluate trading strategies.

## Interface IBreakevenData

This data structure, `IBreakevenData`, is designed to hold information about whether a breakeven point has been achieved for a particular trading signal. It's specifically made to be easily saved and loaded, allowing the system to remember the breakeven status even after it restarts.  Essentially, it's a simplified version of the full breakeven state, containing just a single piece of information: whether the breakeven target has been hit. This simplifies the process of storing this data, especially when dealing with formats like JSON.

## Interface IBreakeven

This interface helps track when a trading signal's stop-loss can be moved to breakeven, essentially covering the initial transaction costs. It's used by systems managing trading strategies and connections.

The `check` method figures out if breakeven conditions are met, like the price moving enough to cover costs and the stop-loss not already at breakeven. It then marks breakeven as reached, sends out a notification, and saves the updated information.

When a signal closes, the `clear` method removes the breakeven tracking and saves that change, ensuring everything is cleaned up properly.

## Interface IBidData

This describes a single bid or ask price within an order book. Each bid or ask is represented by this data structure. It includes the price at which the order is placed, stored as a string, and the quantity of shares or contracts available at that price, also stored as a string. Think of it as a snapshot of one line in the buy or sell queue.

## Interface HeatmapStatisticsModel

This data structure holds the overall performance metrics for your portfolio, giving you a snapshot of how everything is doing. It breaks down the results across all the assets you're tracking.

You'll find a list of individual symbol statistics, detailing the performance of each one. It also provides key portfolio-level numbers like total profit/loss, the Sharpe Ratio which measures risk-adjusted return, and the total number of trades executed. Essentially, it's a convenient way to get a high-level view of your portfolio's health and activity.


## Interface DoneContract

This interface tells you when a background task, like a backtest or a live trading run, has finished.  It provides key details about what just completed. You'll find the name of the exchange used, the specific strategy that ran, and whether it was a backtest or a live session.  It also includes the trading symbol involved, like "BTCUSDT," allowing you to easily track and analyze your trading activities.  If the task was part of a larger frame within the backtest, the frame's name is also provided; otherwise, this will be an empty string when running in live mode.

## Interface CriticalErrorNotification

This notification lets you know about really serious problems that have happened in your backtest or trading system – problems so bad that the process needs to stop. It’s sent when something critical goes wrong.

The notification includes a unique identifier (`id`) so you can track specific errors, along with a timestamp to pinpoint exactly when the error occurred.  You'll also find the error object itself and a descriptive `message` explaining the issue. A `backtest` flag indicates whether the error originated during a backtest simulation.

## Interface ColumnModel

This defines how data is displayed in tables generated by backtest-kit. Think of it as a blueprint for each column you want to see.

Each column needs a unique identifier, a user-friendly label for the header, and a way to format the underlying data into a readable string. 

You can also specify whether a column should be shown or hidden, perhaps based on certain conditions. This allows you to customize the table to show only the information you need.


## Interface BreakevenStatisticsModel

This model holds information about how often breakeven points are hit during a trade. It essentially tracks breakeven events.

You'll find a list of all the individual breakeven events, including all their details, stored in the `eventList` property. 

The `totalEvents` property simply tells you the total count of these breakeven events that occurred.

## Interface BreakevenEvent

This event provides a single, consistent way to track when trading signals have reached their breakeven point. It bundles together all the key details about that moment, making it easier to generate reports and analyze trading performance.

You'll find information like the exact time the breakeven occurred, the symbol being traded, the name of the strategy used, and the signal's unique ID. It also records details about the trade itself, including the position type (long or short), the current market price, the entry price (breakeven level), and the original take profit and stop loss prices. 

Additional information like the total executed percentage (useful for partial closes) and a human-readable note explaining the signal's reasoning are included. Finally, a flag indicates whether the event happened during a backtest or in live trading.

## Interface BreakevenContract

This describes a `BreakevenContract`, which represents when a trading signal's stop-loss has been moved back to the original entry price – essentially, the trade has covered its costs and is now risk-free. Think of it as a milestone indicating a strategy has successfully reduced its risk.

Each event is unique to a particular signal and won't be repeated. It provides key information like the trading pair (`symbol`), the strategy involved (`strategyName`), the exchange and timeframe used (`exchangeName`, `frameName`), and the original signal details (`data`). You'll also find the current price that triggered this event and whether it’s from a backtest or live trade (`backtest`, `currentPrice`). Finally, the `timestamp` tells you exactly when the breakeven event occurred, reflecting either the real-time moment or the historical candle's time.

This information is useful for tracking how strategies are managing risk, generating reports, or allowing users to receive notifications when a signal reaches this breakeven point.

## Interface BootstrapNotification

This notification signals that the notification system is ready and tracking has begun. It’s a simple message letting you know everything’s set up to start recording notifications. The notification includes a unique identifier (`id`) and a timestamp (`timestamp`) to help you track when it occurred. Think of it as a “lights on” signal for the notification system.

## Interface BacktestStatisticsModel

This model gives you a detailed breakdown of how your trading strategy performed during a backtest. It collects key statistics like the total number of trades, how many were winners versus losers, and the overall profit or loss generated.

You'll find percentages representing your win rate and average profit per trade. To assess risk, it also provides metrics like standard deviation (a measure of volatility) and the Sharpe Ratio, which balances profit against risk.  The model includes both a regular Sharpe Ratio and an annualized version, which accounts for the time frame of your backtest. 

Finally, it presents a "Certainty Ratio," indicating the relationship between average winning and losing trades, and an estimate of yearly returns. Importantly, any of these numbers that are unreliable due to calculation issues will be marked as null, letting you know when to be cautious interpreting the results. The `signalList` property holds the full information for each individual trade, allowing for a deeper dive into performance.

## Interface BacktestDoneNotification

This notification signals that a backtesting process has finished running. It's sent when the backtest is complete, providing key information about what just happened. 

You'll find details such as the unique identifier of the backtest, the time it concluded, and confirmation that it was indeed a backtest. Crucially, it includes specifics like the trading symbol being analyzed, the name of the strategy used, and the exchange it relates to. This allows you to track and understand the results of your historical trading simulations.
