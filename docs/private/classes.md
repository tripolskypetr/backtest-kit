---
title: private/classes
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


# backtest-kit classes

## Class WalkerValidationService

This service helps you keep track of and make sure your walker configurations are set up correctly. A walker defines the ranges of parameters you'll test when optimizing or tuning models. Think of it as a central place to register your walkers, so you know they're available and valid before you start running tests. It remembers the results of validations to speed things up and provides a simple way to see a list of all the walkers you’ve defined. You can use it to add new walkers, double-check that a walker exists before using it, and get a complete overview of all your walkers.

## Class WalkerUtils

WalkerUtils provides helpful tools for working with walkers, which are essentially automated trading strategies. It simplifies running and managing these strategies, automatically handling some of the underlying complexities. 

Think of it as a central place to kick off walker comparisons – it manages the process and keeps things organized. You can start a comparison, run it in the background without needing to see all the details, or stop it entirely. 

The class also provides functions to get data from completed comparisons, generate reports, and save those reports to a file. It even allows you to list all the active walkers and their current status, so you can keep an eye on what's running. It's designed to be easy to use, with a single, readily accessible instance to manage all your walker operations.

## Class WalkerSchemaService

This service helps you keep track of different trading strategies, or "walkers," and their associated configurations in a safe and organized way. Think of it as a central library for your trading blueprints. It uses a special system to ensure the configurations are structured correctly, preventing errors down the line.

You can add new trading strategies using `addWalker()`, and retrieve them later by their name using `get()`. If a strategy already exists, you can update parts of its configuration with `override()`. Before adding a new strategy, `validateShallow()` checks to make sure it has all the necessary components in the right format. The service stores all these configurations in a secure registry.

## Class WalkerReportService

The WalkerReportService helps you keep track of how your trading strategies are performing during optimization. It acts like a diligent record keeper, capturing the results of each test run and storing them in a database. 

This service listens for updates from the optimization process and logs key details like metrics and statistics for each strategy. You can use it to monitor your progress, identify the best-performing strategies, and compare different parameter settings. 

To use it, you subscribe to receive these updates, and when you’re done, you can unsubscribe to stop the flow of information. The system makes sure you don't accidentally subscribe multiple times, preventing unwanted data.

## Class WalkerMarkdownService

This service helps you automatically create and save reports about your trading strategies as they’re being tested. It listens for updates during the testing process, keeping track of how each strategy is performing.  The service gathers results and organizes them into easy-to-read markdown tables, which it then saves to files on your computer, making it simple to review and compare your strategies. 

You can subscribe to receive these updates as they happen, and unsubscribe when you no longer need them.  There's a way to get specific data about a strategy’s performance, generate a complete report, or clear out all the accumulated data if you want to start fresh. Each strategy run, or “walker,” gets its own dedicated storage space to keep things organized.


## Class WalkerLogicPublicService

This service helps manage and run your trading strategies, also known as "walkers." It simplifies things by automatically passing important information, like the strategy's name and the exchange being used, along with each execution. Think of it as a conductor orchestrating different parts of your backtesting process. 

It relies on a private service to handle the core logic and another to understand the structure of your walkers. 

The `run` method is key; it allows you to execute comparisons for a specific financial instrument (like a stock ticker) and automatically provides the necessary context for each strategy. This method returns a sequence of results as your walkers complete.


## Class WalkerLogicPrivateService

This service helps you compare different trading strategies against each other. It acts as an orchestrator, running each strategy one after another and giving you updates on their progress. As each strategy finishes, you'll receive information about its performance, and the service keeps track of the best-performing strategy in real-time. Finally, it provides a complete ranked list of all the strategies you tested, so you can easily see which ones performed the best for a specific symbol. To run a comparison, you need to specify the trading symbol, a list of strategies to test, the metric you’re using to evaluate them (like profit or Sharpe ratio), and some context information about the exchange, frame, and walker.

## Class WalkerCommandService

WalkerCommandService acts as a central access point for interacting with walker functionality within the backtest-kit. Think of it as a helpful intermediary, simplifying how you use the underlying walker logic. It's designed to be easily incorporated into your applications using dependency injection.

It manages several internal services, including those responsible for logging, handling walker logic, validating strategies and exchanges, and ensuring the overall structure of your backtesting setup is sound. 

The main thing this service lets you do is `run` a walker comparison. You provide a symbol (like a stock ticker) and context information – specifying the walker, exchange, and frame you want to use – and it returns a stream of results from the walker comparison.

## Class StrategyValidationService

This service helps you keep track of and make sure your trading strategies are set up correctly. It acts like a central control panel for your strategies, letting you register new ones and double-check that everything – the strategy itself, the associated risk settings, and any actions it triggers – are all valid. 

To make things faster, it remembers the results of previous validations, so it doesn't have to re-check everything every time. 

You can use it to:

*   Add new strategies to your system.
*   Verify that a specific strategy exists and that its settings are okay.
*   Get a complete list of all the strategies you've registered. 

It relies on other services, like risk and action validation, to handle the specifics of those areas.

## Class StrategyUtils

StrategyUtils provides helpful tools for understanding how your trading strategies are performing. It acts as a central place to gather and present information about strategy events, like when a partial profit was taken or a trailing stop was triggered.

You can use it to get statistical summaries of your strategy's actions, like how many times it canceled a scheduled order. It also allows you to create clear, readable reports in Markdown format that include a table of all events with details like price, percentage values, and timestamps. Finally, you can easily save these reports to files for later review and analysis. Think of it as a way to keep track of your strategy's history and learn from its behavior.

## Class StrategySchemaService

This service helps you keep track of your trading strategy blueprints, ensuring they're structured correctly and easily accessible. It acts like a central catalog for your strategies.

Think of it as a way to register each strategy, giving it a unique name so you can find it later. When you add a strategy, it performs a quick check to make sure it has all the necessary building blocks.

You can update existing strategies by providing just the parts you want to change.  Retrieving a strategy is as simple as knowing its name – the service will fetch the complete blueprint for you. It uses a special system for type-safe storage, which helps prevent errors.

## Class StrategyReportService

This service helps you keep a detailed record of what your trading strategies are doing. Think of it as a meticulous auditor, writing down every significant action – like canceling orders, closing positions, or adjusting stop-loss levels – to a separate JSON file for each event.

To start using it, you need to "subscribe" to begin logging, and then "unsubscribe" when you're done. It's designed to write each event immediately to disk, providing a reliable history for review and debugging, unlike other services that might hold information in memory.

The service provides functions for logging different types of strategy actions:

*   **cancelScheduled:** Records when a scheduled order is canceled.
*   **closePending:** Logs the closure of a pending order.
*   **partialProfit/partialLoss:** Tracks partial position closures that result in profit or loss.
*   **trailingStop/trailingTake:** Records adjustments to trailing stop-loss or take-profit levels.
*   **breakeven:** Logs when the stop-loss is moved to the entry price.
*   **activateScheduled:** Records when a scheduled signal is activated early.
*   **averageBuy:** Tracks entries when implementing a dollar-cost averaging (DCA) strategy.

Each of these functions takes information about the trade, like the symbol being traded, the current price, and details about the strategy itself. The “subscribe” and “unsubscribe” methods manage the logging process, ensuring it’s turned on and off appropriately.

## Class StrategyMarkdownService

This service helps you gather and analyze data about your trading strategies, particularly useful for backtesting. Think of it as a collector for events like canceling orders, closing positions, and setting stop losses. Instead of writing each event to a file immediately, it holds them temporarily, allowing for more efficient batch reporting.

To start using it, you need to "subscribe" to begin collecting events. Once subscribed, the service automatically records various actions your strategy takes. You can then retrieve aggregated statistics, generate nicely formatted markdown reports, or save those reports to files. When you're finished, you “unsubscribe” to stop collecting data and clean up the accumulated information.

The service is designed to avoid performance bottlenecks by storing data in memory, using a clever caching system for reports specific to each symbol and strategy. You can customize the reports by choosing which details to include. It also provides options to clear data – either selectively for a specific strategy or a complete wipe.

## Class StrategyCoreService

This service acts as a central hub for managing strategy operations, especially during backtesting or live trading. It combines the functionality of several other services to inject important information like the trading symbol, timestamp, and backtest status into the strategy execution.

Think of it as a wrapper around your strategy logic, providing extra context and ensuring everything runs smoothly.

Here's a breakdown of what it does:

*   **Validation:** It checks if a strategy and its related configurations are valid, avoiding repeated checks by remembering previous validations.
*   **Signal Management:** It can retrieve the current pending and scheduled signals for a symbol, which is helpful for monitoring things like take-profit (TP) and stop-loss (SL) levels.
*   **State Checks:** You can use it to quickly determine if a strategy is stopped or has reached breakeven.
*   **Tick and Backtest Execution:** It handles the core operations of running a strategy’s `tick()` or `backtest()` function, making sure it has the necessary data.
*   **Control Functions:** It offers actions like stopping a strategy, cancelling scheduled signals, closing pending signals (without stopping the strategy entirely), and disposing of strategy instances.
*   **Partial Position Management:** Functions exist to execute partial closes based on profit or loss levels and adjust trailing stop-loss and take-profit distances.
*   **Early Activation:** It allows for early activation of scheduled signals.
*   **Averaging:** Provides a way to add new entries to a position to average the buy price.

Essentially, this service simplifies the interaction with strategy logic by providing convenient functions and handling common tasks. It’s particularly useful for automating backtesting and ensuring a consistent environment for your strategies.

## Class StrategyConnectionService

The `StrategyConnectionService` acts as a central hub for managing and executing trading strategies within the backtest-kit framework. Think of it as a smart router that directs requests to the correct strategy based on the symbol, strategy name, and exchange details.

It intelligently handles strategy operations like getting signals, checking for breakeven points, stopping strategies, and disposing of resources. Importantly, it keeps track of which strategies are running and caches them to improve performance.

When you need to run a live tick or a backtest, this service ensures the right strategy gets the data it needs and that everything is handled correctly. It’s also responsible for canceling scheduled signals and closing positions, always making sure that these actions are done within the proper context.

It offers methods for:

*   **Getting Strategies:**  Retrieves the correct strategy implementation, creating it only once and reusing it for efficiency.
*   **Signal Management:**  Fetches pending and scheduled signals for monitoring and action.
*   **Breakeven & Stopped State:** Checks conditions related to breakeven and whether a strategy should be stopped.
*   **Executing Trades:**  Handles both live `tick()` and backtesting `backtest()` operations.
*   **Control Operations:**  Allows you to stop, dispose, and clear strategies.
*   **Partial and Trailing Adjustments:**  Manages partial profit/loss closures and trailing stop/take adjustments.
*   **Early Activation:**  Allows for early activation of scheduled signals.
*   **Average Buy:**  Adds new entries to a DCA strategy.



Essentially, `StrategyConnectionService` keeps things organized and optimized so that your strategies run smoothly and efficiently.

## Class StorageLiveAdapter

The `StorageLiveAdapter` is a flexible component for managing trading signals, allowing you to easily switch between different storage methods. It acts as a bridge, providing a consistent interface while letting you choose how your signals are actually stored – whether it's on disk, in memory, or even as temporary "dummy" data for testing.

You can swap out the underlying storage mechanism by specifying a constructor for a particular storage utility. There are several pre-built adapters to choose from, including one that uses persistent storage (the default), one that stores data only in memory, and a dummy adapter which is great for testing without actually saving any data. 

The adapter handles events like signals being opened, closed, scheduled, or cancelled, passing these on to the selected storage implementation. You can also retrieve signals by their ID or list all signals currently stored. Essentially, it gives you control over where and how your trading signals are kept, with a simple way to change that behavior.

## Class StorageBacktestAdapter

The StorageBacktestAdapter acts as a flexible middleman for managing how your backtest data is stored. It allows you to easily switch between different storage methods without changing much of your core backtesting logic.

You can choose to persist your data to a file using the default persistent storage, keep everything in memory for fast but temporary results, or use a dummy adapter that essentially ignores all writes—useful for testing. 

The adapter handles events like signals being opened, closed, scheduled, or cancelled, and it provides ways to find signals by their ID and list all stored signals.  You control which storage method is used by swapping out the underlying storage implementation, making it simple to adapt to different testing needs.

## Class StorageAdapter

The StorageAdapter is the central place where your trading signals are kept, whether they’re from a backtest or live data. It automatically updates itself as new signals are generated and ensures that you can easily access them all in one spot. 

You can think of `enable` as turning on the signal storage – it subscribes to the signal sources to receive updates. The `disable` function does the opposite, cleaning up and unsubscribing when you no longer need it, and it’s perfectly safe to call it multiple times. 

Need to find a specific signal? The `findSignalById` method lets you locate a signal using its unique ID. And if you need to see all the signals from a backtest or live source, `listSignalBacktest` and `listSignalLive` provide those lists.

## Class SizingValidationService

This service helps you keep track of your position sizing strategies and makes sure they're correctly set up. Think of it as a central place to register all your sizing approaches, like fixed percentages or Kelly Criterion methods. Before you use a sizing strategy, you can use this service to confirm it exists and is properly configured, preventing potential errors.  It even remembers its validation results, making the process quicker each time. You can add new sizing strategies using `addSizing`, double-check their existence and methods with `validate`, and get a complete list of registered strategies with `list`. The service also utilizes a logger service and an internal map to manage the sizing information efficiently.

## Class SizingSchemaService

This service helps you keep track of different sizing strategies for your trading backtests. It's like a central library where you can store and manage your sizing rules. The service uses a secure and organized way to store these sizing strategies, ensuring they are typed correctly.

You can add new sizing strategies using `register`, update existing ones with `override`, and easily retrieve a specific strategy using its name with `get`. Before a sizing strategy is added, it's checked to make sure it has all the necessary parts and is structured correctly – this is done with the `validateShallow` functionality.  The service relies on a logging system to track what's happening and a tool registry for managing the sizing strategies themselves.


## Class SizingGlobalService

This service, SizingGlobalService, handles the calculations needed to determine how much of an asset to trade. Think of it as the engine that figures out your position sizes based on your risk tolerance and trading strategy. It relies on other services to do the heavy lifting – one for connecting to data sources and another for validating the sizing rules.  You generally won’t interact with this directly, as it's used behind the scenes by the core backtesting process and the public trading API. The `calculate` function is the key method, taking in parameters like risk limits and a context to figure out the right size for each trade.

## Class SizingConnectionService

This service helps manage how position sizes are calculated within your trading strategies. It acts as a central hub, directing sizing requests to the correct implementation based on a name you provide. 

Think of it as a smart router for sizing calculations.

It remembers which sizing methods it's already set up, so it doesn't have to recreate them every time you need them - making things faster and more efficient.

You'll use the `sizingName` to tell it which sizing method to use, and it handles the rest, taking into account risk management parameters and various sizing approaches like fixed percentage, Kelly Criterion, or ATR-based sizing. If your strategy doesn’t have any sizing configuration, the `sizingName` will be an empty string.


## Class ScheduleUtils

This class, `ScheduleUtils`, is designed to help you keep track of and analyze scheduled trading signals. It acts as a central point for accessing information about signals waiting to be executed and how long they've been waiting. Think of it as a tool to monitor the health and performance of your scheduling system.

You can use it to gather statistics on scheduled signals for a particular trading symbol and strategy, or to create detailed markdown reports summarizing signal activity. The reports can even be saved directly to a file. Because it's implemented as a singleton, it’s easy to use throughout your backtesting framework. This makes it simple to understand how your scheduled signals are behaving and identify potential bottlenecks or issues.

## Class ScheduleReportService

This service helps you keep track of how your scheduled signals are performing by automatically logging key events to a database. It listens for signals being scheduled, opened (meaning they're about to be executed), and cancelled. 

The service calculates how long each signal takes from scheduling to execution or cancellation, giving you insights into potential delays. It prevents accidental duplicate subscriptions, ensuring the logging process remains reliable. You can easily start and stop the logging by subscribing and unsubscribing, and the unsubscribe function makes sure everything is cleaned up properly. It utilizes a logger to provide helpful debug information along the way.

## Class ScheduleMarkdownService

The ScheduleMarkdownService is designed to automatically create reports about scheduled signals for your trading strategies. It keeps track of when signals are scheduled and cancelled, collecting all the details. These details are then compiled into easy-to-read markdown tables, along with helpful statistics like cancellation rates and average wait times.

It's responsible for listening for these events and organizing the information for each strategy. The reports themselves are saved as markdown files in a designated log directory.

You can retrieve the collected statistics or generate a full report for a specific symbol and strategy. The service also offers a convenient way to clear out the accumulated data when it's no longer needed, either for a specific setup or a complete cleanup. It's all about making it simple to monitor and understand how your strategies are performing in terms of signal scheduling.

## Class RiskValidationService

This service helps you keep track of and verify your risk management setups. Think of it as a central place to register all your risk profiles—those rules and configurations you use to manage risk—and double-check that they're actually there before you try to use them. To make things efficient, it remembers previous validation checks so it doesn't have to repeat the process unnecessarily. 

You can add new risk profiles using `addRisk`, confirm a profile exists with `validate`, and get a complete list of all registered profiles with `list`. This service keeps your risk management consistent and reliable by ensuring everything's properly configured. 


## Class RiskUtils

The RiskUtils class helps you analyze and understand risk rejections within your backtesting framework. It acts like a central hub for gathering information about rejected trades, providing statistics and reports to help you identify potential issues.

You can use it to get summarized data like the total number of rejections, broken down by the specific asset and trading strategy. It also allows you to generate detailed markdown reports that list each rejected trade with information like the symbol, strategy, position, price, and reason for rejection. 

Finally, this class makes it easy to save those reports directly to files, organized by symbol and strategy, so you can review them later. Think of it as a tool for understanding *why* your strategies are being rejected and what you can do to improve them.

## Class RiskSchemaService

The RiskSchemaService helps you keep track of your risk schemas in a safe and organized way. It uses a special registry to store these schemas, making sure they are typed correctly. You can add new risk profiles using the `addRisk()` method (through the `register` property) and easily find them later by their names with the `get()` method. 

Before adding a new risk schema, the service does a quick check with `validateShallow` to make sure it has all the necessary parts and they are of the expected types. If you need to update an existing risk profile, the `override` method allows you to make partial changes without replacing the whole schema. The `loggerService` property provides access to logging functionalities for debugging and monitoring.

## Class RiskReportService

This service helps you keep track of when your risk management system rejects trading signals. It acts like a recorder, capturing details about each rejected signal – why it was rejected and what the signal looked like. 

You can think of it as a way to audit your risk controls and understand why certain trades aren't happening.

The service listens for rejection events and safely stores them in a database. To use it, you subscribe to receive these events; when you're finished, you unsubscribe. It's designed to prevent accidental double-subscription, ensuring things run smoothly.


## Class RiskMarkdownService

The RiskMarkdownService helps you create reports detailing rejected trades due to risk management rules. It listens for risk rejection events, keeps track of these rejections for each symbol and strategy you're using, and then turns that information into nicely formatted Markdown tables. You can get overall statistics, like the total number of rejections, broken down by symbol and strategy, and easily save those reports to your disk.

The service uses a storage system to keep everything organized, ensuring data for each symbol, strategy, exchange, frame, and backtest is kept separate. You subscribe to receive rejection events, and the service handles the details of accumulating and reporting on them.  There are functions to retrieve data, generate reports, save them to disk, and even clear out the accumulated rejection data when you need to start fresh.  Essentially, it automates the process of documenting and analyzing risk rejections in your trading system.

## Class RiskGlobalService

This service is responsible for managing and validating risk limits within the trading system. Think of it as a central authority that checks if trades are allowed based on pre-defined rules. It works closely with other services to handle risk connections, validations, and logging.

It keeps track of open trades (signals) and makes sure they adhere to the established risk parameters. The `validate` function helps confirm risk configurations, avoiding unnecessary checks.

You can use it to verify if a trade signal should proceed, register new trades, remove closed trades, and even clear out all risk-related data when needed, providing flexibility for different scenarios and testing environments. It provides methods to add, remove and check signals.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks within your trading framework. It intelligently directs risk-related operations to the correct risk management component based on a specified risk name.  

Think of it as a router – when your strategy needs to check if a trade is permissible based on risk limits, this service figures out which specific risk rules to apply. To avoid unnecessary work, it cleverly caches these risk components, so repeated checks for the same exchange and timeframe are much faster.

You'll use it to validate signals against portfolio limits, track opened and closed positions within the risk system, and even clear out cached risk data when needed. The service handles things like validating drawdown, exposure, position counts, and daily loss limits, ensuring your trading stays within defined boundaries.  Strategies without risk configurations will use an empty string for the riskName.

## Class ReportUtils

ReportUtils helps you control which parts of the backtest-kit framework, like backtests, live trading, or performance analysis, generate detailed logs. Think of it as a way to turn logging on or off for specific areas.

You can use the `enable` function to start logging for the services you're interested in; it will begin writing data to JSONL files and send you back a function you *must* use to stop the logging later, otherwise your application might run into memory problems.

If you just want to stop logging for certain services without affecting others, `disable` lets you do that. It immediately stops the logging process for the services you specify.

## Class ReportBase

The `ReportBase` class helps you reliably log trading events to files for later analysis. It creates a single JSONL file for each report type, appending new events as they happen. It's designed to handle a large volume of data, with built-in safeguards like a 15-second timeout for writing to prevent issues and automatic directory creation for organization.

You can filter these log files based on criteria like the trading symbol, strategy used, exchange, timeframe, signal ID, or the walker involved, making it easy to focus on specific aspects of your backtesting.

The class manages the file writing process for you; you simply provide the data you want to log, along with any relevant options. Internally, it uses a stream-based approach to efficiently write data and includes mechanisms to handle situations where the write buffer is full. Importantly, the initialization process happens only once, ensuring consistency and preventing unnecessary setup.

## Class ReportAdapter

The ReportAdapter helps manage and store your backtesting data consistently. Think of it as a flexible system for directing event logs to different storage locations. It uses a pattern that allows you to easily swap out how data is stored without changing much of your core code.

It remembers which storage instances you're using, so you don’t create new ones every time, improving efficiency. The default storage option writes data to JSONL files.

You can customize the way data is saved by setting a new storage constructor, or even use a "dummy" adapter that simply throws away any data you try to write – useful for testing or preventing accidental logging. The system only starts storing data when you actually write something, which avoids unnecessary setup.

## Class PositionSizeUtils

This class offers helpful tools for figuring out how much of an asset to trade, a critical part of any trading strategy. It provides pre-built methods for several common position sizing techniques, like using a fixed percentage of your account, applying the Kelly Criterion (which aims to maximize growth), and basing the size on the Average True Range (ATR) to account for volatility. 

Each method includes built-in checks to ensure you're using the right approach and providing the necessary information. Think of it as a set of ready-to-use calculators that simplify the often-complex task of determining appropriate position sizes. You just need to supply the relevant details like your account balance, the asset’s price, and any volatility measures.

## Class PersistStorageUtils

This class provides tools for saving and loading signal data so your backtesting or live trading system doesn't lose information when it stops running. It intelligently manages where and how your signal data is stored, keeping things organized.

The system is designed to be robust; it uses special techniques to ensure data isn't corrupted even if your system crashes unexpectedly. It allows you to choose different ways to store your data, and you can even plug in your own custom methods if you need something specific.

Each signal is stored as a separate file, making it easy to manage individual signals. When you need to load your data, it reads all the signals from storage. When changes are made to the signals, it immediately saves them back to disk. You can even temporarily disable persistence to simulate a non-persistent environment for testing.

## Class PersistSignalUtils

The `PersistSignalUtils` class helps manage how signal data is stored and retrieved, especially for trading strategies. It automatically handles creating storage areas for each strategy and allows for customization using different storage adapters.

The class ensures a safe and reliable way to save and load signal states, even if the system crashes during the process. This is crucial for maintaining the integrity of your trading strategy's progress.

You can choose different persistence methods like using a standard JSON format or a dummy adapter that simply ignores writes for testing purposes. It also provides functions to read previously saved signals and write new signals, all designed to be done securely. The `readSignalData` method is used to bring back a strategy's saved state, while `writeSignalData` ensures that changes are saved correctly.


## Class PersistScheduleUtils

This class provides tools for safely saving and loading scheduled signals for your trading strategies. It automatically handles storage for each strategy, ensuring that your data is consistent even if your application encounters issues.

You can customize how this data is stored by registering different persistence adapters, or easily switch back to the default JSON-based storage. There’s even a dummy adapter available if you just want to test without actually saving anything to disk.

When a strategy needs to restore its previously saved scheduled signals, the `readScheduleData` method retrieves them.  And when a strategy needs to save its signals, `writeScheduleData` does so in a way that protects against data loss due to crashes. This is especially helpful for `ClientStrategy` in live trading scenarios.

## Class PersistRiskUtils

This class, PersistRiskUtils, is designed to safely manage and store information about active trading positions, particularly for different risk profiles. It’s a helper class used by ClientRisk to keep track of what's happening during live trading.

The class uses a clever system where it remembers storage instances for each risk profile to make things efficient. You can even customize how data is stored using different adapters.

When ClientRisk needs to start up or update position data, it relies on `readPositionData` to load existing positions and `writePositionData` to save the latest changes. The `writePositionData` function is designed to be particularly safe, using special techniques to prevent data loss even if something unexpected happens, like a system crash.

To make things even more flexible, it allows you to plug in your own custom storage solutions through `usePersistRiskAdapter`. If you just want to test things out or disable persistence entirely, you can switch to the default JSON adapter or a "dummy" adapter that ignores all write requests.

## Class PersistPartialUtils

This class helps manage how your trading strategy remembers its progress, specifically its partial profit and loss levels. It keeps track of this information separately for each symbol and strategy combination, making sure the data is stored reliably even if something unexpected happens.

You can customize how this data is stored by plugging in different adapters, or you can easily switch back to the default JSON storage. There’s even a dummy adapter available that simply ignores all write attempts, which is useful for testing.

The `readPartialData` function retrieves previously saved partial data, while `writePartialData` safely saves the current state to disk, preventing data loss from crashes. This is a core component used internally by `ClientPartial` to maintain your strategy's state during live trading.

## Class PersistNotificationUtils

This class provides tools for reliably saving and loading notification data. Think of it as the behind-the-scenes manager that makes sure your notifications stick around even if things go wrong. It cleverly handles storing each notification as a separate file, using its unique ID as the filename.

It has a built-in mechanism to use different ways of storing the data, allowing for customization, and even a "dummy" mode for testing where changes aren't actually saved.  The `readNotificationData` function retrieves all saved notifications, while `writeNotificationData` takes care of safely writing changes to disk, ensuring data isn't lost.  This system is used by other parts of the framework—NotificationPersistLiveUtils and NotificationPersistBacktestUtils—to manage notification persistence. You can even plug in your own custom storage methods if needed.

## Class PersistCandleUtils

This class helps manage cached candle data, storing each candle as a separate file for efficient access. It’s designed to ensure data integrity, only returning cached data if the entire requested set of candles is present. If even one candle is missing, the cache is considered invalid.

The class utilizes a factory to handle the actual data storage and provides methods to read and write candle data to the cache, guaranteeing atomic operations. It's used internally by the ClientExchange to streamline candle data handling.

You can customize how the data is persisted by registering different adapters, or switch between using standard JSON files, or even a dummy adapter that simply ignores write requests for testing purposes. The read function verifies that all requested candles are available before returning them, maintaining data consistency.

## Class PersistBreakevenUtils

This class helps manage and save your breakeven data, which is essential for tracking and restoring trading strategies. Think of it as a safe place to store information about your breakeven points for different symbols and strategies. It automatically creates folders and files to hold this data, ensuring everything is neatly organized.

The system uses a special trick to make sure the saving and loading process is reliable—it writes files in a way that prevents data loss. It also remembers previously created storage instances, making things faster when you need to access or update your data.

You can even customize how your data is stored; the class allows you to use different adapters, or even switch to a "dummy" adapter that simply ignores all write operations for testing purposes. This offers flexibility for various scenarios.

## Class PersistBase

PersistBase provides a foundation for storing and retrieving data to files, ensuring that writes are handled safely and reliably. It's designed to work with named entities, keeping them organized within a designated directory. 

The system automatically validates the integrity of stored files and cleans up any that are corrupted.  You can efficiently loop through all the entity IDs that are currently stored using an asynchronous generator.

The `waitForInit` method helps to set up the storage directory and check for any existing issues when the system first starts up.  The atomic write feature ensures that data isn't lost or corrupted even if interruptions occur during the saving process.  The base class handles file path calculations and includes retry mechanisms for deleting files if needed.

## Class PerformanceReportService

The PerformanceReportService helps you keep track of how your trading strategies are performing, specifically pinpointing areas where they might be slow or inefficient. It essentially listens for timing events during your strategy's execution and records them.

Think of it as a detective for your code, collecting clues about where time is being spent. These clues are then stored in a database so you can analyze them later.

You can easily tell it to start listening for these events, and it will send you back a way to stop listening when you’re done. It's designed to avoid accidentally subscribing multiple times, which could lead to problems. It uses a logger to output debugging information, too.

## Class PerformanceMarkdownService

This service helps you keep track of how your trading strategies are performing. It listens for performance data, organizes it by strategy, and calculates key statistics like average, minimum, and maximum values. It also creates detailed reports in markdown format, which includes an analysis of potential bottlenecks in your strategy’s performance. These reports are saved automatically to a designated log directory, making it easy to review and identify areas for improvement.

You can subscribe to receive performance updates or unsubscribe when you no longer need them. There's a method to retrieve accumulated performance statistics for a specific combination of symbol, strategy, exchange, timeframe, and backtest scenario.  You can also request a full performance report or clear the accumulated data if you need to start fresh. The system ensures that data is isolated per unique combination of symbol, strategy, exchange, timeframe and backtest.

## Class Performance

The Performance class helps you understand how well your trading strategies are performing. It provides tools to collect and analyze performance data, making it easier to identify areas for improvement.

You can use `getData` to get a detailed breakdown of performance metrics, like how long different operations take and how much they vary. This gives you a clear picture of where your strategy spends its time.

To communicate your findings effectively, `getReport` generates user-friendly markdown reports that visualize performance trends and highlight potential bottlenecks.

Finally, `dump` allows you to save these reports directly to your file system, making it simple to share your analysis or track performance over time. You can customize the output path or choose specific columns to include in the report.

## Class PartialUtils

This class helps you analyze and report on partial profit and loss data from your backtesting or live trading. It’s like having a central hub for pulling together all those little profit and loss events that happen during a trade.

You can use it to get overall statistics like total profit/loss event counts. It can also create nicely formatted markdown reports, showing you a table of all the partial profit and loss events for a specific trading strategy and symbol. 

Need to save those reports? This class can also generate the report and dump it to a file on your disk, automatically creating the necessary directories. Think of it as an easy way to keep track of how your strategies are performing, step by step.

## Class PartialReportService

The PartialReportService is designed to keep track of every time a position is partially exited, whether it's a profit or a loss. It acts like a record-keeper, capturing details like the price and level at which each partial exit happened.

To get started, you'll need to "subscribe" to the service, which connects it to the streams of partial profit and loss events.  This subscription is designed to prevent accidental double-subscriptions.

The service then diligently logs these partial exit events, storing the information persistently. If you're done tracking these partial closures, you can "unsubscribe" to stop the service from listening. A logger service is included for debugging purposes, and the `tickProfit` and `tickLoss` properties handle processing the specific event types.

## Class PartialMarkdownService

This service helps you create reports detailing your partial profits and losses during trading. It listens for profit and loss signals, keeping track of them for each symbol and strategy you’re using.

The service organizes this data and turns it into readable markdown tables, offering statistics like the total number of profit and loss events. It’s designed to save these reports to your disk, specifically in a directory structure like `dump/partial/{symbol}_{strategyName}.md`, making it easy to review your trading performance.

You can subscribe to receive these signals and unsubscribe when you no longer need them. The `getData` method allows you to retrieve the accumulated statistics, while `getReport` generates the markdown report itself. You can also use the `dump` function to directly save these reports to disk, and `clear` to wipe the stored data if needed, either for a specific combination or everything at once.


## Class PartialGlobalService

This service manages the tracking of partial profits and losses within the trading framework. Think of it as a central hub for these operations, ensuring everything is logged and handled consistently. It's injected into the core trading strategy, providing a single point of access for partial tracking and allowing for centralized monitoring.

It relies on other services to validate the strategy, risk, exchange, and frame configurations involved. The core functionality revolves around the `profit`, `loss`, and `clear` methods – these log activity and then pass the actual processing to a connection service. This layered design keeps the main strategy separate from the underlying connection mechanics, while providing a clear audit trail of partial profit/loss events.

## Class PartialConnectionService

The PartialConnectionService helps track profit and loss for individual trading signals. It’s designed to efficiently manage these tracking details, creating and storing information about each signal's performance.

Think of it as a smart factory – whenever a signal is encountered, it either provides an existing tracker or creates a new one, ensuring that each signal has its own dedicated record.  It remembers these trackers so you don't have to constantly create them.

It keeps things organized by linking each tracker to a specific signal ID and whether it's a backtest or live trade. This system also handles cleanup, automatically removing trackers when signals are no longer needed, preventing unnecessary memory usage.  

The service provides methods for recording profits, losses, and clearing the records when a signal is closed, each delegating the actual work to the individual trackers.  You can find these trackers using `getPartial`, and the service automatically handles ensuring they are properly set up. It uses a logger to keep track of events and works closely with other parts of the trading system.

## Class NotificationLiveAdapter

The `NotificationLiveAdapter` is designed to provide a flexible way to handle notifications during live trading. It acts as a central hub, allowing you to easily swap out different notification methods without changing the core trading logic.

Think of it like a universal translator for notifications – it takes signals from your trading system and sends them to wherever you want them to go, whether that's a simple memory store, a file on your disk, or some other custom system.

Initially, it uses an in-memory storage as its default, but you can switch it to persistent storage (saving notifications to disk) or a "dummy" mode which simply ignores notifications entirely for testing purposes.

The adapter provides methods for handling various events, such as signals, partial profits, losses, strategy commits, risks, and errors – essentially, anything that needs to be reported. You can also retrieve all stored notifications or clear them completely. The `useNotificationAdapter` method lets you completely customize which notification method is used going forward.

## Class NotificationBacktestAdapter

This class provides a flexible way to manage notifications during backtesting. It acts as a central point for handling different types of events like signals, profit updates, errors, and more.

You can easily swap out how these notifications are handled – whether you want to store them in memory, persistently on disk, or simply ignore them for testing purposes.  The `useMemory`, `usePersist`, and `useDummy` methods make switching between these different notification strategies simple. 

Internally, it uses a specific "notification utils" component to actually process the notifications, and you can even customize this component if you need something beyond the built-in options.  Each of the `handle...` methods simply passes the data to this underlying component, allowing for a consistent way of dealing with events regardless of how they're stored or handled. The `getData` and `clear` methods give you access to and control over the stored notifications, depending on which adapter you're currently using.

## Class NotificationAdapter

The NotificationAdapter is a central component for handling notifications during backtesting and live trading. It automatically keeps track of notifications by listening for updates, providing a single place to access them whether they're from a backtest or a live trading session. To prevent unwanted duplicate notifications, it uses a clever “singleshot” feature that ensures you only subscribe to updates once. 

You can easily turn notification tracking on and off using the `enable` and `disable` functions. If you need to retrieve all the notifications, the `getData` function lets you grab them, specifying whether you want the backtest or live notifications. And when you’re finished, the `clear` function provides a simple way to remove all notifications for either backtest or live storage.

## Class MarkdownUtils

This class helps you control which parts of the backtest-kit framework generate markdown reports. Think of it as a central switchboard for turning reports on and off for things like backtests, live trading sessions, performance analysis, and more.

The `enable` function lets you selectively turn on markdown reporting for certain areas. It sets up the system to gather data and create reports, but crucially, it gives you a function to later turn *everything* you enabled back off, preventing memory problems.  Make sure to use that cleanup function when you’re done!

The `disable` function is for shutting down markdown reporting for specific parts of the system.  It immediately stops the report generation process and frees up resources, allowing you to control reporting on a per-service basis.  This doesn’t require a separate cleanup function because the changes happen instantly. 


## Class MarkdownFolderBase

This adapter lets you create a well-organized set of markdown reports, with each report saved as its own individual file. It’s designed for situations where you want easy access to each report’s content, like for manual review or creating a structured directory of results.

The adapter automatically creates the necessary directories based on the file path you specify.  Each report's file name includes information about your backtest, making it easy to identify. 

The `waitForInit` method doesn’t actually *do* anything – it’s just there because the interface requires it, as this adapter doesn’t need any special setup.

The core function is `dump`, which handles writing the markdown content to the designated file and creating the directory structure if needed. You provide the content to be written and options that define the file path and name.


## Class MarkdownFileBase

This component handles writing markdown reports in a structured, JSONL format to a single file for each report type. Think of it as a way to centralize all your trading reports – like performance summaries, order books, or market visualizations – into a standardized, easily processable file. It’s designed to write data incrementally, which is helpful for large reports, and includes built-in safeguards to prevent issues like slow writing or stalled processes.

The `MarkdownFileBase` creates a dedicated file within a `dump/markdown` directory (it'll create this directory if it doesn't exist) and each line within that file is a JSON object containing the markdown data, along with useful metadata like the trading symbol, strategy name, exchange, timeframe, and signal ID. This metadata makes it much easier to filter and analyze your reports later.

You don’t have to worry about managing the file writing process directly; this component takes care of it, including creating the file, writing the data, and handling potential errors. There's even a timeout to ensure writing doesn’t get stuck.

To use it, you essentially provide the markdown content and some optional metadata, and the component handles writing it to the appropriate JSONL file. The `waitForInit` method ensures the file and stream are properly set up, and subsequent calls are safely ignored thanks to a built-in mechanism.

## Class MarkdownAdapter

The MarkdownAdapter helps you manage how your markdown data is stored, offering flexibility and efficiency. It allows you to easily switch between different storage methods, like saving each piece of data in its own file or appending them to a single JSONL file. 

It intelligently caches storage instances to ensure you're not creating unnecessary duplicates, which is especially helpful for larger projects. You can customize the storage mechanism using `useMarkdownAdapter` to set a specific storage constructor.

Convenience methods like `useMd`, `useJsonl`, and `useDummy` let you quickly switch between the default folder-based storage, a JSONL append-based storage, and a dummy adapter that effectively ignores writes, respectively. The adapter automatically creates the necessary storage when you first write data.

## Class LoggerService

The LoggerService helps ensure consistent logging throughout your backtesting framework by automatically adding helpful context to your messages. It lets you provide your own logging mechanism, but automatically includes details like the strategy, exchange, and frame being used, along with information about the symbol, time, and whether it's a backtest. If you don't specify a logger, it defaults to a do-nothing logger.

You can customize the logging behavior using the `setLogger` method to use your preferred logging library.  The `log`, `debug`, `info`, and `warn` methods provide different severity levels for your messages, all with automatic context. Internally, it manages context services and a common logger for organized operation.

## Class LiveUtils

This class provides tools for running and managing live trading sessions. Think of it as a helper for your trading strategies when they're actually running in a live environment. It handles things like automatically restarting if something crashes and keeps track of what's happening.

You can start a live trading session for a specific symbol and strategy using the `run` method, which acts like a never-ending stream of updates.  If you just want the process to run in the background, performing actions without reporting them directly, the `background` method is your friend.

Want to know what's currently going on?  Methods like `getPendingSignal` and `getScheduledSignal` give you insights into active signals. You can also check if a trade has reached its breakeven point with `getBreakeven`.

Need to intervene?  Functions like `stop`, `commitCancelScheduled`, and `commitClosePending` allow you to manually control the process without halting the entire trading system. There are also specialized methods for partial profit and loss adjustments, along with trailing stop and take-profit management. The `commitTrailingStop` and `commitTrailingTake` functions are particularly important, carefully calculating adjustments to prevent compounding errors. The `commitBreakeven` method lets you automate stop-loss adjustments.

For more advanced control, `commitActivateScheduled` allows you to trigger a scheduled trade early, `commitAverageBuy` facilitates dollar-cost averaging, and `commitPartialProfit` or `commitPartialLoss` enable partial position management.

Finally, `getData` lets you retrieve statistics, `getReport` generates markdown reports, `dump` saves reports to a file, and `list` shows the status of all active trading instances.  Essentially, `LiveUtils` simplifies the complexities of live trading while providing a robust and controlled environment.

## Class LiveReportService

The LiveReportService is designed to keep a real-time record of your trading strategy's activity. It listens for events like when a trade is idle, opened, active, or closed, and diligently saves all the details to a SQLite database.

You can think of it as a live monitoring tool for your trading system, allowing you to analyze performance and troubleshoot issues as they happen.

It uses a logger to output debugging information and includes safeguards to ensure you don't accidentally subscribe to the live signal multiple times. 

To start tracking your trades, you'll use the `subscribe` function, which returns a function that lets you stop the tracking when you’re done.  And if you need to stop tracking at any point, `unsubscribe` handles that cleanup for you.


## Class LiveMarkdownService

The LiveMarkdownService helps you automatically create and save detailed reports about your live trading activity. It listens for every event—like when a strategy is idle, opens a position, becomes active, or closes a trade—and keeps track of it all. These events are then organized into easy-to-read markdown tables, providing a clear overview of what’s happening with each of your strategies.

You'll get useful statistics too, such as win rates and average profit/loss per trade.  The service neatly saves these reports to your computer in a designated folder (logs/live/), making it simple to review and analyze your trading performance. 

To use it, you’ll connect it to your trading system's event stream, and it will handle the reporting process automatically. It also provides functions to get existing data, clear data, or customize what's included in the reports.  Each trading combination (symbol, strategy, exchange, frame, and backtest status) gets its own separate report storage, ensuring data is neatly organized.

## Class LiveLogicPublicService

LiveLogicPublicService helps manage and orchestrate live trading. It builds upon a private service, automatically handling important context information like the strategy and exchange being used, so you don’t have to pass it around manually with every function call.

Think of it as a continuous, never-ending stream of trading signals – it keeps running indefinitely.  If things go wrong and the process crashes, it's designed to bounce back and pick up where it left off, thanks to saved state. It uses the current time to track and manage the trading progression accurately.

You can start it for a specific trading symbol, and it will provide a stream of results including signals to open, close, or cancel trades.


## Class LiveLogicPrivateService

This service manages the continuous, real-time execution of your trading strategy. It acts as an engine that constantly monitors market data and generates updates as your strategy opens, closes, or cancels positions. Think of it as an always-on process that streams trading activity to you.

It's designed to be resilient; if something goes wrong, it will recover and pick up where it left off. The process doesn’t stop, continuously cycling through monitoring, evaluating signals, and reporting on changes. 

Key components like logging, strategy core logic, and method context are integrated for a comprehensive trading environment. The service provides an efficient, memory-friendly stream of trading events.


## Class LiveCommandService

This service acts as a central point for live trading operations within the backtest-kit framework. Think of it as a helper that makes it easy to inject dependencies for live trading.

It provides a single `run` method which is the primary way to start and manage live trading for a specific asset. This method continuously streams results – like opened, closed, or cancelled trades – and is designed to automatically recover from unexpected issues, ensuring a more robust live trading experience.

Internally, it relies on several other services to handle things like logging, validating trading strategies, and verifying exchange details, providing a layered approach to reliability and functionality. These included services for strategy validation, exchange validation, strategy schema, risk validation and action validation.

## Class HeatUtils

HeatUtils helps you visualize and analyze your portfolio's performance through heatmaps. Think of it as a tool that simplifies creating insightful reports about how your trading strategies are doing. 

It automatically gathers data from all your closed trades, breaking down performance by individual assets and providing overall portfolio metrics. You can easily get the raw data or generate a nicely formatted markdown report showcasing key performance indicators like total profit, Sharpe Ratio, and maximum drawdown, sorted by profitability. 

Need to save the report? HeatUtils can do that too, creating the necessary directory and saving the report as a markdown file with a default name based on your strategy. It’s designed to be super convenient to use, acting as a single point of access for all your heatmap needs.

## Class HeatReportService

This service is designed to keep track of your trading signals, specifically when they've closed out, to help you analyze your performance with heatmaps. It listens for events related to closed signals and records them in a database. 

Think of it as a dedicated observer that only cares about when a signal finishes – it doesn’t bother with anything else. This lets you build visualizations that show you how different strategies are performing across all your assets. 

You can subscribe to start collecting this data and unsubscribe when you no longer need it. The subscription mechanism is designed to prevent you from accidentally subscribing multiple times, which could lead to problems.

## Class HeatMarkdownService

The Heatmap Service helps you visualize and understand your trading performance across different strategies and symbols. It continuously gathers data on closed trades, allowing you to see key metrics like profit/loss, Sharpe Ratio, and maximum drawdown, both for individual symbols and your entire portfolio. 

Think of it as a live dashboard that summarizes your trading activity. It provides a way to generate reports in Markdown format, making it easy to share your results or keep a record of your progress.  You can specify which data to include in these reports, and it ensures calculations are handled safely, even if unexpected values arise. The service also remembers previous calculations to improve performance.

You can subscribe to receive real-time updates from the trading system and later unsubscribe when you no longer need them.  The service stores data separately for each exchange, timeframe, and backtest mode, ensuring your information is organized.  It's designed to be easily cleared, whether you want to wipe all data or just data related to a specific setup. Finally, it can save those reports directly to a file on your computer.

## Class FrameValidationService

The FrameValidationService helps you keep track of your trading timeframes and makes sure they're set up correctly. Think of it as a central place to manage and check your timeframe configurations. You can use it to register new timeframes, easily verify if a timeframe exists before you try to use it, and even see a complete list of all the timeframes you’ve defined. The service is designed to be efficient, remembering past validation checks to speed things up. It keeps a record of all your timeframes and provides tools to manage and validate them, preventing errors and streamlining your trading setup.

## Class FrameSchemaService

This service helps keep track of the blueprints, or schemas, that define how your trading strategies are structured. It uses a special type-safe system to store these schemas, making sure everything is organized correctly. You can think of it as a central repository where you register new schema designs and easily look up existing ones by name.

The service performs a quick check to make sure new schemas have all the necessary parts before adding them.  You use `register` to add a completely new schema and `override` to update an existing one with just the changes you need.  Finally, `get` allows you to find a schema by its name when you need to use it.


## Class FrameCoreService

This service, `FrameCoreService`, handles the behind-the-scenes work of generating the timeframes your backtesting needs. It's a central component that works closely with other services to ensure everything runs smoothly.

Think of it as a factory for creating the sequences of dates you'll use to simulate trading. It relies on another service, `FrameConnectionService`, to actually pull the timeframe data, and uses another, `FrameValidationService`, to ensure the timeframes are valid. 

The `getTimeframe` method is the primary way to use it; you give it a symbol (like "BTCUSDT") and a timeframe name (like "1h"), and it returns an array of dates representing that timeframe. This is what the backtesting engine will iterate over. The service also has internal logging and validation components to help keep things organized and reliable.

## Class FrameConnectionService

The FrameConnectionService helps manage and access different trading frames within your backtesting environment. Think of it as a central hub that directs your requests to the right frame implementation, ensuring you’re working with the correct data and configuration. 

It intelligently routes requests based on the current method context, making things more streamlined. The service also keeps track of frequently used frames, storing them for quick access and boosting performance—this clever caching avoids unnecessary work. 

The service provides a way to retrieve the start and end dates for your backtest, allowing you to focus on a specific period of time. This is useful for isolating and analyzing specific market conditions. When in live mode, no frames are used, and the `frameName` is empty.

## Class ExchangeValidationService

This service helps keep track of your trading exchanges and makes sure they're properly set up before your backtests run. Think of it as a central place to register each exchange you're using, like Coinbase or Binance. 

It provides methods to add new exchanges, check if an exchange exists, and get a complete list of all exchanges you've registered. To speed things up, it remembers the results of validation checks, so it doesn't have to re-validate every time. This helps your backtesting process run smoothly and avoids errors caused by misconfigured exchanges. 

You can use `addExchange` to register a new exchange.  `validate` makes sure an exchange is correctly configured before you try to use it.  And `list` gives you a handy overview of all the exchanges you've registered.

## Class ExchangeUtils

This class, `ExchangeUtils`, is like a helper for working with different cryptocurrency exchanges within the backtest-kit framework. It provides easy access to common exchange operations, making sure everything is validated correctly. There's only one instance of this helper available – think of it as a central, shared tool.

You can use it to retrieve historical price data (candles) for a specific trading pair and time interval.  It smartly figures out the date range needed based on how far back you want to look.  It also calculates the average price (VWAP) using recent trading data.

Need to make sure your order quantities and prices are formatted correctly for a specific exchange? This helper can do that too, following the exchange’s rules for precision.  You can also request the order book, which shows the current buy and sell orders, and retrieve raw candle data with precise control over the date and quantity range.  The class is designed to be compatible with older versions of the framework and helps prevent look-ahead bias when dealing with historical data.

## Class ExchangeSchemaService

This service helps you keep track of the different exchange configurations your trading system uses. It acts like a central repository where you store and manage details about each exchange, like their data format and rules.

You can add new exchange configurations using `addExchange()`, and later retrieve them by name when you need to use them. 

Before an exchange configuration is accepted, it's quickly checked to make sure it has the essential information it needs. You can also update existing configurations with `override()` to make changes without replacing the entire setup. Finally, `get()` allows you to easily find a specific exchange configuration by its name.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for interacting with exchanges, ensuring that important information like the trading symbol, time, and whether it’s a backtest or live trade is passed along correctly. It builds upon the ExchangeConnectionService and ExecutionContextService to manage these details.

Validation is a key part of the process, with a built-in mechanism to check and memoize exchange configurations, preventing unnecessary checks.

This service provides several methods for retrieving data: fetching historical candles, obtaining future candles (specifically for backtesting scenarios), calculating average prices, formatting prices and quantities, and retrieving order book information. All these operations are performed with consideration of the execution context. There’s also a function to get raw candle data, allowing for more control over date ranges and limits.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently directs requests to the correct exchange implementation based on the current context, ensuring your code seamlessly works with various platforms. To optimize performance, it remembers previously used exchanges, so you don't have to repeatedly create connections.

This service provides a complete set of functions for common trading tasks: fetching historical and future candles, retrieving average prices (either live or calculated from historical data), and formatting prices and quantities to comply with each exchange's specific rules. You can also retrieve order book data and access raw candles with customizable date ranges. Everything is logged for auditing and debugging purposes. It takes care of the complexities of connecting and communicating with different exchanges, letting you focus on your trading strategies.

## Class ConstantUtils

The ConstantUtils class provides a set of pre-calculated values used for setting take-profit and stop-loss levels in your trading strategies. These values are based on the Kelly Criterion, a mathematical formula for optimal bet sizing, and incorporate a decay mechanism to manage risk.

Think of it as a framework for breaking down your profit and loss targets into stages.  For instance, if your target profit is 10%, TP_LEVEL1 is reached at 3%, TP_LEVEL2 at 6%, and TP_LEVEL3 at 9%, allowing you to secure profits in increments.

Similarly, SL_LEVEL1 represents an early warning sign at 40% of the stop-loss distance, while SL_LEVEL2 acts as a final exit point at 80%, helping to minimize potential losses.  These constants give you a convenient starting point for configuring your strategy's risk management.

## Class ConfigValidationService

This service helps make sure your trading configuration settings are mathematically sound and won't lead to losses. It checks a wide range of parameters, including percentages like slippage and fees, ensuring they're all positive values.

A crucial check ensures that your minimum take-profit distance is large enough to cover all trading costs, so you can actually make money when a trade hits its target. The service also verifies that ranges are set up correctly, like stop-loss distances, and that time-related settings and candle request parameters are using appropriate values.

The `validate` function is the core of this service, performing all these checks to keep your trading setup in good shape. It's essentially a safety net to catch potential errors in your configuration.

## Class ColumnValidationService

The ColumnValidationService helps you make sure your column configurations are set up correctly and follow the rules. It acts as a quality check for your column definitions, making sure everything is consistent. 

It verifies that each column has all the necessary pieces – a key, a label, a format, and a visibility setting. It also ensures that those keys are unique so there's no confusion.

The service checks that your format and visibility settings are actually functions that can be used. Finally, it confirms that the key and label fields contain text. Think of it as a safety net to catch potential errors early on.

## Class ClientSizing

This component, ClientSizing, figures out how much of your assets to allocate to a trade. It's designed to be flexible, allowing you to use different sizing approaches like fixed percentages, the Kelly Criterion, or Average True Range (ATR). 

You can also set limits on how much you're willing to risk per trade, either by specifying minimum or maximum position sizes or by capping the percentage of your capital used. It also provides ways to hook in your own logic for verifying trade parameters or keeping a record of sizing decisions. Ultimately, this piece helps make sure your trading strategy takes appropriate position sizes. 

The `calculate` method is the core; it’s what actually determines the position size based on the strategy's input and your sizing configurations.

## Class ClientRisk

ClientRisk helps manage the overall risk of your trading portfolio by setting limits and validating trade signals. Think of it as a safety net to prevent your strategies from taking on too much risk at once. It keeps track of all open positions across different strategies, allowing it to enforce rules that consider the combined impact of various trading approaches.

This system uses a shared risk instance across multiple strategies, enabling it to assess and control risk in a holistic way. It's automatically used before a trade is executed to ensure it aligns with the defined risk parameters.

The `_activePositions` property is a central record of your current positions, automatically updating and persisting them to disk (except during backtesting).

`checkSignal` is the core method used to evaluate a trade, considering custom validations and ensuring no limits are breached. Signals are registered with `addSignal` when opened and removed with `removeSignal` when closed, enabling continuous risk tracking.

## Class ClientFrame

The `ClientFrame` is the engine that creates the timelines your backtests run on. Think of it as the clock for your trading strategies. It generates arrays of timestamps – essentially, a list of dates and times – that tell the backtest how to move through historical data. 

To avoid wasting resources, it caches these timelines so it doesn’t have to rebuild them every time. You can customize the intervals it uses, from one minute to three days, and even add your own logic to check or record events as timelines are created.  The `getTimeframe` property is the core function to get the timeline array; it uses a clever caching system to avoid unnecessary work.


## Class ClientExchange

This class, `ClientExchange`, is your go-to for accessing exchange data within the backtest-kit framework. It's designed to be efficient, using techniques to minimize memory usage. 

You can use it to retrieve historical and future candle data for a specific trading symbol and interval. When backtesting, `getNextCandles` allows you to fetch future candles needed for generating trading signals.  It can also calculate the VWAP (Volume Weighted Average Price) – a useful indicator based on recent trading activity.

The class also handles the formatting of quantities and prices, ensuring they adhere to the rules of the specific exchange you're interacting with. If you need raw, unfiltered historical data, the `getRawCandles` method offers a lot of flexibility in specifying the date range and number of candles you want, with built-in safeguards against look-ahead bias. Finally, you can use `getOrderBook` to get a snapshot of the current order book.

## Class ClientAction

The `ClientAction` component is the core of how your custom action handlers, which manage things like logging, notifications, and analytics, are integrated into the trading framework. It takes care of setting up and cleaning up your handlers, ensuring they only run once and are properly disposed of when they're no longer needed.

Think of it as a smart intermediary. It receives events from the trading system, like a new tick of data or a change in a contract's status, and routes those events to the appropriate methods within your action handler.

It manages the lifecycle of the handler, creating it only when necessary and guaranteeing a clean exit.  There are dedicated methods for handling different types of events, like signal updates for live or backtest trading, breakeven, partial profit/loss, and ping-related notifications. Essentially, `ClientAction` simplifies the process of connecting your custom logic to the trading engine.

## Class CacheUtils

CacheUtils helps you speed up your backtesting by automatically caching the results of your functions. Think of it as a way to remember calculations so you don't have to repeat them unnecessarily. It's set up to work with timeframes, so the cached results are automatically invalidated when a new timeframe starts.

You get a single, shared instance of this utility, making it simple to use throughout your backtesting code.

There are a few handy tools inside:

*   `fn`: This is the core function. You wrap your existing functions with this to enable caching. It automatically takes care of storing and retrieving results based on the timeframe you specify.
*   `flush`: This is for cleaning up. It lets you completely remove the cache for a specific function, or for *all* functions. This is useful if you've changed the function's implementation or want to free up memory.
*   `clear`: This clears the cache for just the current testing scenario (strategy, exchange, backtest mode). It's like wiping the slate clean for that specific run.
*   `gc`: This is a garbage collector for your cache. It automatically removes old, expired cache entries to keep things tidy and efficient.





## Class BreakevenUtils

The BreakevenUtils class helps you analyze and report on breakeven events within your backtesting or live trading system. It acts as a central point for accessing information gathered about when trades hit their breakeven points.

Think of it as a tool to get a summary of how often your strategies reach breakeven, and to create reports detailing those events. You can request simple statistics, like the total number of breakeven events, or generate comprehensive markdown reports.

These reports present each breakeven event in a table with details like the symbol traded, strategy used, entry price, current price, and more.  You can even save these reports directly to files, making it easy to share or archive your results. The reports automatically create the necessary directories if they don’t exist.

## Class BreakevenReportService

This service helps you keep track of when your trading signals reach their breakeven point. It's designed to listen for these "breakeven" events and automatically save details about them—like the specifics of the signal—to a database. Think of it as a record-keeping tool for understanding how your strategies perform.

To use it, you'll subscribe to a signal emitter to receive these breakeven notifications. Once subscribed, the service silently logs each event. You can unsubscribe at any time to stop the logging. The system makes sure you don't accidentally subscribe multiple times, preventing duplicate entries in your records. It utilizes a logger to provide debugging information.

## Class BreakevenMarkdownService

The BreakevenMarkdownService helps you automatically create and save reports about breakeven events in your trading strategies. It keeps track of these events – times when a trade reached a breakeven point – for each symbol and strategy you're using.

It listens for breakeven signals and organizes them, then transforms that information into easy-to-read markdown tables. You can generate reports with detailed information about each event, as well as overall statistics like the total number of breakeven occurrences.

The service saves these reports to your computer in a standardized format, making it simple to review and analyze your strategy’s performance. You can choose which data to include in the report, and even clear the accumulated data when needed. This service is designed to be efficient, ensuring that each combination of symbol, strategy, exchange, frame, and backtest gets its own isolated storage space.

## Class BreakevenGlobalService

This service acts as a central hub for managing breakeven calculations within your trading strategy. It's designed to be injected into your strategy, providing a single point of access for breakeven-related operations and ensuring everything is logged for monitoring purposes.

Think of it as a middleman – it receives requests, records them in logs, and then passes them on to a separate connection service that actually handles the underlying calculations.

Several validation services are built-in, making sure your strategy, risk parameters, exchanges, and data frames all exist and are correctly configured before any calculations happen. The `validate` method streamlines this by remembering previous validations to avoid unnecessary checks. 

The `check` method determines whether breakeven conditions have been met, and the `clear` method resets the breakeven state when a signal closes, both with detailed logging throughout the process.

## Class BreakevenConnectionService

The BreakevenConnectionService helps track breakeven points for trading signals. It’s designed to efficiently manage and reuse breakeven calculations, avoiding redundant work.

Essentially, it creates a special object, called ClientBreakeven, for each unique trading signal, keeping track of its breakeven details.  These objects are cleverly cached, so you don't have to recreate them every time you need them.

When a signal is opened, this service checks if a breakeven calculation is needed and triggers an event if certain conditions are met. When a signal closes, it clears the breakeven data and removes the cached object, keeping things clean. The service gets injected with other tools it needs to function, such as a logger and a core action service. It’s the central point for managing breakeven calculations within the system.

## Class BacktestUtils

This class provides helpful tools to run and manage backtesting simulations. Think of it as a utility belt for your backtesting experiments.

You can use `run` to execute a backtest for a specific trading symbol and strategy, getting results as they become available.  If you want to run a test quietly, without seeing the results directly (perhaps for logging or other side effects), use `background`.

Need to peek at the current pending or scheduled signal? `getPendingSignal` and `getScheduledSignal` can retrieve that information.  You can also check if a trade has reached breakeven using `getBreakeven`.

To control your backtest mid-execution, there are functions like `stop` (to halt the test), `commitCancelScheduled` (to cancel a scheduled signal), and `commitClosePending` (to close a pending signal). 

Several other methods allow you to fine-tune active signals – adjusting trailing stops (`commitTrailingStop`, `commitTrailingTake`) or taking partial profits/losses (`commitPartialProfit`, `commitPartialLoss`).  There's also a function to move the stop-loss to breakeven (`commitBreakeven`) and activate scheduled signals prematurely (`commitActivateScheduled`).

If you're building a dollar-cost averaging (DCA) strategy, `commitAverageBuy` lets you add new entries.  Finally, `getData` and `getReport` provide ways to gather statistics and generate reports from completed backtests. `dump` saves your reports to a file. `list` provides an overview of all currently running backtest instances.



It's designed as a singleton, meaning there’s just one instance of this class managing all backtest operations, making it simple to access and use throughout your code.

## Class BacktestReportService

The BacktestReportService helps you keep a detailed record of your backtesting strategy's activity. It essentially acts as a diligent observer, capturing every significant event—when a signal is idle, when it's opened, actively being used, or closed. 

It stores this information in a database (SQLite), allowing you to later analyze performance and debug any issues that arise. You subscribe the service to receive these events, and it handles all the technical details of logging them. Importantly, it prevents accidental double-logging by ensuring only one subscription is active at a time. You can unsubscribe to stop the logging when you no longer need it. Think of it as a recorder for your backtest, creating a valuable audit trail.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create readable reports during backtesting, essentially turning your trading experiments into nicely formatted documents. It listens for trading signals, specifically keeping track of signals that have closed. 

Think of it as a recorder that neatly organizes your backtest data. It accumulates information about these closed signals and then uses that information to generate markdown tables, which are easy to read and understand. 

You can then save these reports directly to your disk, organized by strategy name, allowing you to easily review and analyze the results of your backtests. The service also lets you clear out the recorded data when you're finished with a particular backtest, or just want a fresh start. It makes the whole process of documenting and sharing your backtesting results much simpler.


## Class BacktestLogicPublicService

BacktestLogicPublicService is designed to simplify running backtests within the backtest-kit framework. It acts as a middle layer, handling the context needed for your trading strategies to function correctly. Think of it as a way to automatically pass along important information like the strategy name, exchange, and timeframe to all the underlying components, so you don't have to specify them repeatedly.

The `run` method is the core of this service - it's how you actually kick off a backtest for a specific trading symbol. It returns a stream of results representing the trades executed during the backtest. Because of the automatic context handling, you can focus on the logic of your strategies without getting bogged down in manually managing context parameters.


## Class BacktestLogicPrivateService

The `BacktestLogicPrivateService` helps orchestrate backtesting processes in a memory-friendly way, especially when dealing with lots of data. It works by getting timeframes, then stepping through them one by one. Whenever a trading signal appears, it fetches the necessary candle data and executes the backtest logic.  Once a signal is closed, the results are streamed out – instead of collecting everything in memory at once. 

You can even stop the backtest early if needed, by interrupting the process. This service uses several other services for things like logging, strategy execution, exchanging data, managing timeframes, providing context and handling actions, so it relies on these components to function properly. The `run` method is the main entry point, letting you kick off a backtest for a specific symbol and receive the results as a continuous stream of data.

## Class BacktestCommandService

This service acts as a central point to start and manage backtesting processes within the system. Think of it as the main gateway for running backtests and accessing related functionality. It simplifies how different parts of the application interact with the backtesting engine by providing a consistent interface.

The service relies on several other specialized services for tasks like logging, validating strategy definitions, and checking for potential risks. 

You can use the `run` method to actually execute a backtest. This method takes a symbol (like a stock ticker) and contextual information—such as the names of the strategy, exchange, and frame—to control the backtest's parameters. The backtest results are delivered as a stream of data, showing how the strategy performed at each step.


## Class ActionValidationService

The ActionValidationService helps you keep track of and double-check your action handlers—those pieces of code that respond to specific events. Think of it as a central manager for all your actions. 

You can add new action handlers using `addAction`, providing a name and schema for each one. Before using an action handler, it's a good idea to `validate` it to make sure it's actually registered, preventing unexpected errors. 

The service remembers its validation results to speed things up, avoiding redundant checks. If you need to see a complete list of all the action handlers you’ve registered, you can use the `list` function. It's designed to make sure your actions are reliable and well-managed.

## Class ActionSchemaService

The ActionSchemaService is responsible for keeping track of the blueprints for actions your trading system can take. It ensures these blueprints are well-formed and safe before letting them be used. 

Think of it as a librarian for your actions, making sure everything is categorized correctly and follows the rules.

It uses a type-safe system, so errors related to incorrect action definitions are caught early.  You can register new action blueprints, validate existing ones to make sure they are set up properly, and even update them later without needing to completely recreate them. If a blueprint already exists, attempting to register it will result in an error. The service also keeps an eye on the methods available in your action handlers, making sure they only use the approved ones.  Finally, it provides a way to easily retrieve a complete action blueprint when needed.

## Class ActionProxy

The `ActionProxy` acts as a safety net when your custom trading logic is executed. It's designed to prevent errors in your code from bringing the entire trading system down. Think of it as a wrapper around your own functions, automatically catching any mistakes and logging them, but allowing the system to keep running.

It handles various events like signals, profit/loss levels, scheduled tasks, and cleanup routines. Essentially, whenever your trading strategy needs to react to something (a new candle, a profit target reached, a scheduled event), `ActionProxy` steps in to ensure that any errors don't stop the trading process.

You don't directly create `ActionProxy` instances; instead, you use the `fromInstance()` method, which takes your own code (that implements parts of the `IPublicAction` interface) and wraps it in this protective layer.  This ensures consistent error handling across all parts of your strategy and makes debugging much easier, because issues are reported without crashing the system. The goal is that the system keeps moving forward even if your custom functions have hiccups.

## Class ActionCoreService

The ActionCoreService acts as a central hub for managing actions within your trading strategies. It's responsible for coordinating how actions are handled, from validating their setup to dispatching signals and cleaning up afterward.

Essentially, it takes the action instructions defined in your strategy’s schema and makes sure everything is set up correctly, then it systematically sends events to each action.  This ensures actions work in a predictable, sequential order.

The service uses several other components internally to handle things like logging, action connections, validations (for strategies, exchanges, frames, and risks), and retrieving strategy schemas.

Key functionalities include:

*   **Initialization:** Sets up each action's initial state by fetching data from the strategy schema and invoking an initialization handler.
*   **Signal Routing:** Delivers signal events (for live trading, backtesting, and scheduled pings) to the appropriate actions.
*   **Event Handling:**  Manages various events like breakeven, partial profit/loss, risk rejections, and active pings, routing them to their corresponding actions.
*   **Validation:** Checks the strategy's context and configuration to ensure everything is valid. This is optimized to avoid repetitive checks.
*   **Cleanup:**  Disposes of actions at the end of strategy execution to release resources.
*   **Data Clearing:** Allows for clearing action data, either for a specific action or globally across all strategies.

## Class ActionConnectionService

The `ActionConnectionService` acts as a central hub for directing actions within your backtesting or live trading environment. Think of it as a smart router that ensures the correct action is executed for each specific scenario. It intelligently manages and reuses action implementations (called `ClientAction` instances) to improve performance, avoiding unnecessary re-creation.

The service relies on a few key pieces of information – the action name, strategy name, exchange name, and frame name – to determine the precise `ClientAction` to use. It uses caching to store these `ClientAction` instances, so if the same action is needed again with the same parameters, it retrieves the cached version instead of creating a new one.

It provides several methods for handling different events: `signal`, `signalLive`, `signalBacktest`, `breakevenAvailable`, `partialProfitAvailable`, `partialLossAvailable`, `pingScheduled`, `pingActive`, `riskRejection`, `dispose` and `clear`. Each of these routes a specific type of event to the appropriate `ClientAction` for processing. The `initFn` method is used to initialize the ClientAction, loading any persisted state it might need. Finally, the `clear` method helps to release resources by invalidating cached actions.

## Class ActionBase

This class, `ActionBase`, acts as a foundation for building custom components that interact with your backtesting or live trading strategies. Think of it as a starting point for adding things like notifications, logging, or custom business logic. It handles a lot of the boilerplate work for you, including automatically logging events so you don’t have to write that code yourself repeatedly.

When you extend this class, you'll get access to important information like the strategy’s name, frame name, and the specific action that triggered an event.  You'll also be able to implement specific methods to respond to events like signals, breakeven availability, or partial profit milestones.

The lifecycle is straightforward: initialization happens once, event handling occurs as the strategy runs, and a final cleanup process ensures resources are released properly. The class distinguishes between backtest and live trading modes, allowing you to create actions that behave differently in each environment.  You only need to override the methods you want to customize; the default implementations handle basic logging.
