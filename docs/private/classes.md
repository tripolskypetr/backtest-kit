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

The WalkerValidationService helps you keep track of and double-check your parameter sweep setups, which are crucial for optimizing trading strategies. Think of it as a central place to register your different "walker" configurations – those that define the ranges of parameters you want to test.

It makes sure the walkers you’re using actually exist before you start running tests, preventing errors. Plus, to speed things up, it remembers the results of its checks so it doesn't have to re-validate every time.

You can add new walkers using `addWalker`, confirm a walker exists with `validate`, and get a complete list of all registered walkers using `list`. It’s designed to simplify the management and verification of your parameter sweep setups.

## Class WalkerUtils

WalkerUtils provides a set of tools to help manage and run your trading walkers, which are essentially automated systems that test trading strategies. Think of it as a helper class that simplifies the process of running these walkers and getting information about them.

It provides a way to easily start a walker comparison, running the calculations and providing logging. You don't need to worry about the underlying details of how the walker runs; WalkerUtils handles that for you.

If you want to run a walker without needing the immediate results—perhaps just to log something or trigger a callback—there's a background execution mode.

You can also stop a walker’s signal generation, which allows any currently active signals to finish before halting further activity, ensuring a graceful shutdown.

WalkerUtils also lets you retrieve all the results from a walker's comparisons, generate a formatted report in Markdown, and even save that report to a file. Finally, it offers a way to check the status of all currently running walkers. WalkerUtils ensures that each symbol and walker combination has its own dedicated instance, preventing any interference between different tests.

## Class WalkerSchemaService

This service helps you keep track of and manage different schema definitions for your "walkers" – think of them as blueprints for specific tasks or processes. It uses a secure and organized system to store these schemas, ensuring they're consistent and reliable.

You can add new walker schemas using the `addWalker` method, and easily find them later by their names.

The service checks your schemas as you add them to make sure they have the basic information they need, preventing errors down the line. 

It also provides a way to update existing schemas with just the changes you need, without having to redefine the whole thing. Retrieving a schema is simple – just ask for it by name.

## Class WalkerReportService

WalkerReportService helps you keep track of your strategy optimization experiments. It acts like a diligent recorder, capturing the results of each test run and storing them in a database, typically SQLite.

Think of it as a way to monitor how your strategies are improving over time, allowing you to compare different parameter settings and identify the best performers. 

The service listens for updates from the optimization process and logs details like performance metrics and statistics. It also remembers the best strategy found so far and tracks the overall progress of the optimization.

To use it, you'll subscribe to receive the optimization events – and be assured you won't accidentally subscribe more than once. When you’re finished, you can unsubscribe to stop receiving these updates.


## Class WalkerMarkdownService

The WalkerMarkdownService helps you create detailed reports about your trading strategies. It listens for updates as your strategies run, keeps track of their performance, and then organizes that information into easy-to-read markdown tables.

Think of it as a central place for gathering and presenting data from your trading experiments.

Here's a breakdown of what it does:

*   It connects to your trading system to receive progress updates.
*   It uses a special "storage" system to keep track of results for each trading strategy, ensuring each one is analyzed independently.
*   It generates markdown tables to compare strategies side-by-side.
*   It automatically saves these reports as markdown files in a designated folder, so you can review them later.

You can subscribe to receive events, unsubscribe when you no longer need them, and clear the accumulated data when you’re finished with a test. You can retrieve specific data points, generate a full report, or save it directly to a file. The service also lets you clear all or specific walker's data.

## Class WalkerLogicPublicService

This service helps manage and run "walkers," which are essentially automated trading processes. It builds on a private service to handle the core walker logic.

It automatically passes along important information like the strategy name, exchange, frame, and walker name, making it simpler to track and understand what's happening during the execution.

You can use the `run` method to kick off a walker comparison for a specific trading symbol and it will provide a stream of results. This method executes backtests across different strategies.

## Class WalkerLogicPrivateService

WalkerLogicPrivateService helps manage and compare different trading strategies. It acts as a coordinator, stepping through each strategy one at a time.

As each strategy finishes its backtest, you'll get updates on its progress. It keeps track of the best-performing strategy along the way.

Finally, it gives you a complete report, ranking all the strategies you tested. It uses other services internally to handle the actual backtesting and formatting the results.

The service requires a symbol to backtest, an array of strategies to compare, the metric to use for evaluation, and details about the environment (exchange, timeframe, and walker name).

It uses a logger for detailed reporting and relies on other helper services for managing backtest logic, markdown formatting, and defining strategy schemas.

## Class WalkerCommandService

WalkerCommandService acts as a central access point for walker functionality within the system. It's essentially a convenient layer for injecting dependencies and making the walker tools available.

Think of it as a helpful assistant that orchestrates various services like logging, schema handling, and validation related to walkers, strategies, exchanges, and frames. 

The `run` function is a key method allowing you to execute a walker comparison. You specify which symbol to compare and provide context—like the walker's name, exchange, and frame—to guide the process. It returns a stream of results.

## Class TimeMetaService

The TimeMetaService helps you reliably access the latest candle timestamp for a specific trading setup – think of it as knowing exactly when the last candle closed. It keeps track of these timestamps for each symbol, strategy, exchange, and timeframe you're using, and it does so in a way that's always up-to-date. 

If you need to know the current candle time *outside* of the normal trading loop (like when executing a command between ticks), this service provides that information. It anticipates that sometimes you'll need this data quickly, so it will wait a short time if a timestamp hasn't arrived yet.

You can clear the service’s memory to make sure you're working with fresh data, either for everything or just a specific trading setup. The service is designed to be cleaned up at the beginning of each new backtest or live trading session to avoid using old information.

## Class SyncUtils

The SyncUtils class helps you understand what’s happening with your trading signals by giving you access to reports and data about them. It collects information about signal openings and closings, like when a limit order gets filled or a position is exited.

You can use it to get overall statistics, like the total number of signals opened and closed, or to generate a detailed report.

The report itself is a markdown document, structured as a table, that includes key details about each signal - the symbol traded, strategy used, signal ID, action taken (open or close), price information, profit/loss details, and timestamps.

Finally, you can use the `dump` function to automatically save these reports as files, neatly organized by symbol, strategy, exchange, frame, and whether it’s a backtest or live run. The class grabs this data from a system that keeps track of these signals and their lifecycle.

## Class SyncReportService

The SyncReportService helps keep track of what’s happening with your trading signals, specifically when they're opened and closed. It acts like a detailed record-keeper, capturing key information about each signal, like when a limit order is filled and when a position is exited.

This service listens for "signal" events – openings and closures – and meticulously logs them, including important details like profit and loss (PNL) and the reason for exiting a position. 

It stores this data in a way that makes it easy to review and audit your trading activity. 

To avoid accidentally logging multiple times, it ensures only one subscription to the signal events is active at a time.

You can start receiving these signal updates with the `subscribe` function, and when you’re done, use `unsubscribe` to stop receiving them.

## Class SyncMarkdownService

This service helps you keep track of signal synchronization events—those moments when your trading signals are confirmed and processed. It automatically gathers information about signal opens and closes for each symbol, strategy, exchange, and timeframe you're using in your backtests or live trading.

It builds detailed reports in markdown format, showing you the lifecycle of each signal, including when it opened, closed, and why. You'll also get summary statistics like the total number of signals processed, how many were opened, and how many were closed.

You can subscribe to receive these signals, and the service will automatically save reports to disk, making them easy to review.  If you need to start fresh with a specific strategy or timeframe, you can clear the stored data. The service also allows you to generate and save reports directly to disk, with filenames that clearly identify the symbol, strategy, exchange, and backtest status. Finally, you can easily retrieve the accumulated data and reports for a specific combination of parameters.

## Class StrategyValidationService

The StrategyValidationService helps you keep track of and ensure the correctness of your trading strategies. It acts like a central manager, storing details about each strategy you’re using. 

Before you use a strategy, this service verifies that it exists and that any related risk profiles and actions are also set up correctly. To boost performance, it remembers the results of past validation checks, so it doesn’t have to repeat the work every time.

You can add new strategies using `addStrategy`, retrieve a list of all strategies with `list`, and perform validation using `validate`. It relies on other services for risk and action validation.

## Class StrategyUtils

StrategyUtils helps you analyze and understand how your trading strategies are performing. It's like a central place to gather and organize all the data about your strategy's actions, such as when it took profits, canceled orders, or hit stop-loss levels.

You can request summarized statistics to see overall trends in your strategy's behavior.

It can also build detailed reports in markdown format, presenting the history of events in a clear, table-like structure. This report includes information like the price at which an action occurred, the percentage shift, and when it happened.

Finally, StrategyUtils makes it easy to save these reports to files so you can review them later or share them with others. The reports are named using the symbol, strategy name, and other relevant details.

## Class StrategySchemaService

The StrategySchemaService helps you keep track of different trading strategy blueprints in a safe and organized way. It uses a special type-safe storage system to ensure your schemas are consistent.

You can add new strategy schemas using the `addStrategy()` method and find them again later by their name using the `get()` method. 

Before adding a strategy, `validateShallow()` checks the basic structure to make sure it has all the necessary parts and that those parts are the right types.

If a strategy already exists, you can update it using the `override()` method, which allows you to change just specific parts of the existing schema.


## Class StrategyReportService

This service is designed to keep a detailed record of your trading strategy's actions, like when it cancels a scheduled trade, closes a pending order, or takes partial profits or losses. Think of it as an audit trail for your strategy's decisions.

To start using it, you need to "subscribe" to begin logging events.  Then, as your strategy executes, the service records events like partial profit or loss closures, trailing stop or take adjustments, and even when a scheduled signal becomes active. These events are saved as individual JSON files, providing a clear history of what happened.

When you're done, you can "unsubscribe" to stop the logging process. This is especially useful if you're only interested in tracking certain periods or for specific debugging.  The service ensures that events are written immediately as they happen, unlike some reporting methods that might hold everything in memory.

## Class StrategyMarkdownService

This service helps you keep track of what your trading strategies are doing during backtests or live trading. It's designed to collect information about actions like canceling orders, closing positions, and adjusting stop-loss levels.

Instead of writing each event immediately to a file, it holds onto them temporarily in memory, grouped by the symbol (asset), strategy name, exchange, and frame (time interval). This lets it generate more efficient reports later.

To start using it, you need to "subscribe" to begin collecting these events, and when you’re done, you “unsubscribe” to stop and clear the data.

You can then request summaries of the events, either as a simple set of counts or as a nicely formatted markdown report. You can also have these reports saved directly to a file.

It offers options to clear the accumulated data completely or just for specific strategies. Think of it as a central hub for monitoring and reporting on your strategies’ activity.

## Class StrategyCoreService

This class, `StrategyCoreService`, is a central hub for managing trading strategy operations, handling important tasks like validation and retrieving position data. It works closely with other services like `StrategyConnectionService` and `ExecutionContextService` to inject context (like symbol and timeframe) into various operations.

It provides a wide range of methods for getting information about a pending signal, such as its total cost, entry prices, and potential PnL.  You can use these methods to track a strategy's performance and understand its behavior. It also offers methods to manipulate the strategy's state, like adjusting stop-loss levels or adding new entries.

The service includes validation functions, often memoized for efficiency, to ensure the strategy and its configuration are correct.  It also supports backtesting, allowing you to simulate how a strategy would have performed against historical data. There are several methods for dealing with scheduled signals, including activation and cancellation. Finally, it offers functionality for cleaning up resources and managing strategy instances.

## Class StrategyConnectionService

This framework manages strategy execution and routing, acting as a central hub for your trading logic. It automatically assigns tasks to the correct strategy based on the symbol and its associated name, ensuring everything runs in the right context.

It uses caching to efficiently reuse strategy instances, avoiding redundant creation and boosting performance.  You can think of it as an intelligent dispatcher that keeps things organized and optimized.

The service offers a comprehensive suite of functions, including:

*   **Signal Management:** Provides methods to get pending and scheduled signals, check status, and adjust or cancel them.
*   **Position Analysis:**  Offers tools to analyze position details, such as P&L, entry costs, and levels.
*   **Trading Actions:**  Includes functions for live trading (`tick`) and backtesting (`backtest`), as well as actions to stop strategies, adjust stop-loss or take-profit levels, and perform partial closes.
*   **State Validation:** Offers features to validate trading actions without actually executing them.

Overall, this framework simplifies your trading infrastructure by handling routing, caching, and providing a well-defined interface for interacting with strategies.

## Class StorageLiveAdapter

The `StorageLiveAdapter` helps manage and store trading signals, allowing you to easily switch between different storage methods. It acts as a flexible middleman, letting you choose how your signals are saved – whether it's to a file on your disk (the default), kept in memory only, or even discarded with a dummy adapter.

You can swap out the storage backend completely with `useStorageAdapter` if you need a very specific way to handle data. The adapter provides methods for opening, closing, scheduling, and canceling signals, as well as retrieving them by ID or listing all signals. 

It also handles periodic "ping" events to keep signal information up-to-date.  If you're just testing or want to avoid writing anything to storage, `useDummy` disables all writes. To go back to the standard persistent storage, `usePersist` restores the default behavior. For temporary data you don't need to keep, `useMemory` stores signals in memory. If your working directory changes, `clear` helps refresh the adapter.

## Class StorageBacktestAdapter

The `StorageBacktestAdapter` is a flexible tool for managing how your backtesting framework stores information about trading signals. It allows you to easily switch between different storage methods, like persistent storage to disk, in-memory storage, or even a dummy storage for testing purposes. The adapter uses a pattern that lets you plug in different storage implementations, giving you control over where and how your data is kept.

It provides convenient shortcut functions – `usePersist()`, `useMemory()`, and `useDummy()` – to quickly change the active storage method. `usePersist` is the default, meaning signals are saved to disk. `useMemory` stores signals only in memory, and `useDummy` effectively ignores any storage operations.

The adapter also handles events related to signal activity, such as signals being opened, closed, scheduled, or cancelled, and forwards those events to the selected storage backend. It allows you to find signals by their ID or list all signals. 

The `clear()` function is particularly useful when the base directory changes during backtesting, ensuring a fresh start with the default storage adapter. Internal bookkeeping and adapter switching are managed through the `_signalBacktestUtils` property and the `useStorageAdapter()` function.

## Class StorageAdapter

The StorageAdapter is the central component for managing how your trading signals are stored, whether they're from a backtest or live trading.

It automatically keeps track of new signals as they are generated, ensuring they are saved. 

It simplifies working with signals from different sources, providing a single place to access both backtest and live data.

To prevent unwanted duplicates, it utilizes a special mechanism to subscribe to signal sources only once.

You can easily activate or deactivate the storage functionality, and it’s safe to deactivate it multiple times without issue.

Need to find a specific signal? You can search by its ID.

It also offers functions to retrieve all signals from your backtesting and live environments, respectively.

## Class SizingValidationService

This service helps you keep track of and double-check your position sizing strategies. It acts like a central place to register all your sizing methods, making sure they're available before you try to use them. 

To make things efficient, the service remembers whether a sizing strategy is valid, so it doesn't have to re-check every time.

You can use it to:

*   Register new sizing strategies using `addSizing`.
*   Verify that a sizing strategy exists before applying it with `validate`.
*   Get a complete list of all registered sizing strategies through `list`.

The service also uses a logger to help with debugging and keeps track of sizing configurations internally.

## Class SizingSchemaService

This service helps you keep track of sizing schemas, which define how much of an asset to trade. It's designed to be type-safe, ensuring your schemas are consistent.

The service uses a registry to store these sizing schemas, allowing you to easily add new ones with `addSizing()` and find existing ones by name using `get()`. You can also update existing schemas with `override()`.

Before a sizing schema is added, `validateShallow` checks to make sure it has all the necessary properties and that those properties are the right types. This helps prevent errors later on. The `loggerService` allows for internal logging functionality related to the service's operations.

## Class SizingGlobalService

The SizingGlobalService helps determine how much of an asset to trade, essentially calculating position sizes. It acts as a central point for these calculations, coordinating with other services to ensure everything is done correctly. Think of it as the brain behind deciding how much to buy or sell.

It uses a connection service to handle the details of the sizing process and another service to validate the parameters. 

The core function is `calculate`, which takes information about the trade (like risk tolerance) and figures out the appropriate size. This function is used both internally by the trading framework and by those using the public API.


## Class SizingConnectionService

The `SizingConnectionService` acts as a central hub for calculating position sizes in your trading strategies. It intelligently directs sizing requests to the correct sizing implementation, based on a name you provide. 

Think of it as a traffic controller ensuring sizing requests get to the right place. 

It also remembers previously used sizing implementations, boosting performance through a caching mechanism. This means it only creates a new sizing calculation process the first time you use a particular sizing method.

You can use it to determine how much of an asset to trade, factoring in risk management considerations and various sizing approaches like fixed percentages or Kelly Criterion. The service handles choosing the right approach based on the sizingName you specify. When your strategies don't have any custom sizing rules, an empty string is used for this sizingName parameter.

## Class ScheduleUtils

This class offers helpful tools for understanding and reporting on scheduled signals. It acts as a central place to track signals as they wait to be executed, and to see how often they're cancelled.

You can easily retrieve statistics like cancellation rates and average wait times for specific trading strategies and symbols. 

It also allows you to generate clear, readable markdown reports summarizing signal activity, or save these reports directly to a file. Think of it as a way to keep an eye on how your scheduled signals are performing.

The class is designed to be simple to use, accessible as a single, readily available instance.


## Class ScheduleReportService

This service helps track the lifecycle of scheduled signals, specifically designed for understanding how long it takes for orders to execute after being initially scheduled. It monitors signals and records key events like when a signal is scheduled, when it's opened (meaning an order is placed based on the signal), and when it's cancelled.

It automatically calculates the time elapsed between scheduling a signal and either its execution or cancellation. 

The service works by connecting to a system that emits signal events and logs them to a database. It's designed to prevent accidental multiple connections to this signal event system, ensuring accurate tracking. 

To start using it, you'll need to subscribe to the signal emitter, and when you're finished, you should unsubscribe to avoid unnecessary processing.

## Class ScheduleMarkdownService

The ScheduleMarkdownService helps you track and understand how your trading signals are being scheduled and potentially cancelled. It keeps a record of these events for each strategy you're using, creating organized reports.

It listens for signal events – when a signal is scheduled or cancelled – and gathers this information. Then, it turns this data into readable markdown reports that include details about each event and provides useful statistics like cancellation rates and average wait times.

You can request these reports for specific strategies and symbols, or clear the stored data completely or for a specific combination of settings. The service automatically saves these reports to files on your system, making it easy to review performance and identify any potential issues. The storage is organized so each strategy and specific configuration has its own set of reports.

## Class RiskValidationService

The RiskValidationService helps you keep track of your risk management settings and makes sure they're set up correctly before you proceed. Think of it as a central place to register and check your risk profiles. 

It allows you to add new risk profiles with specific configurations. 

Before any actions are taken, you can use it to validate that a particular risk profile actually exists, preventing potential errors.

To speed things up, it remembers (caches) the results of previous validation checks.

Finally, you can easily get a complete list of all the risk profiles you’ve registered.

## Class RiskUtils

The RiskUtils class helps you understand and analyze risk rejection events within your trading system. Think of it as a tool to dig into why trades were rejected and what patterns might be emerging.

It gathers information about rejections, like when they happened, what symbol was involved, which strategy was used, and the reason for the rejection.

You can use it to get summarized statistics, such as the total number of rejections and how they’re distributed across different symbols and strategies.

It also generates detailed reports, presented in markdown format, that list each rejection event with key details like position, price, and the reason for the rejection.  These reports include a summary of important statistics at the end.

Finally, you can easily save these reports as markdown files directly to your file system for later review or sharing. The file names are organized by symbol and strategy, making it simple to find specific rejection analyses.


## Class RiskSchemaService

The RiskSchemaService helps you keep track of your risk schemas in a safe and organized way. It uses a special system to ensure that the schemas are of the expected type.

You can add new risk profiles to the registry using `addRisk()`, and retrieve them later by their assigned name. 

The service also includes a check (`validateShallow`) to make sure new risk schemas have the necessary properties before they are added.

If a risk profile already exists, you can update parts of it using `override`.

Finally, the `get` function allows you to easily find a specific risk profile by its name.

## Class RiskReportService

This service helps track and analyze why certain trading signals are being blocked by your risk management system. It listens for events when signals are rejected, recording the reason and details of the signal itself. 

This information is then saved in a database, allowing you to investigate patterns and potential issues in your risk controls.

To use it, you’ll subscribe to receive these rejection events.  The subscription is designed to prevent accidental multiple connections.  You can later unsubscribe to stop receiving those events. A logger is included to help with debugging.

## Class RiskMarkdownService

The RiskMarkdownService helps you automatically create reports summarizing risk rejections in a readable markdown format. It listens for risk rejection events and organizes them based on the symbol and trading strategy involved.

It builds detailed tables within these reports, providing a clear view of rejection information, along with overall statistics like the total number of rejections and breakdowns by symbol and strategy. These reports are then saved as files to a designated directory.

You can subscribe to receive these rejection events, and the service handles ensuring you don't accidentally subscribe multiple times.  You can also get specific data or reports for individual symbols and strategies, or clear all the accumulated data if needed. The service relies on a storage mechanism that keeps data separate for each combination of symbol, strategy, exchange, frame and backtest.

## Class RiskGlobalService

The RiskGlobalService acts as a central hub for managing risk-related operations within the backtest-kit framework. It sits between the trading strategies and the underlying risk connection service, ensuring that trades adhere to defined risk limits.

It keeps track of validation activities and uses caching to make validation faster and more efficient.

The service offers functions to check if a trading signal should proceed based on established risk rules, and to register newly opened trades with the risk management system.  It also allows for removing completed trades from the risk register.

Finally, the service provides a way to completely wipe out all accumulated risk data, or to selectively clear data associated with a specific risk profile.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks within your trading system. It intelligently directs risk-related operations to the correct risk management component, making sure the right rules are applied based on the specific situation.

It keeps track of frequently used risk management instances, a technique called memoization, to speed things up and avoid unnecessary overhead.

To help with organization, it uses a `riskName` to identify which risk rules to apply. If a strategy doesn’t need custom risk rules, this name is simply left empty.

Here’s a quick look at what it offers:

*   **`getRisk`**: This method retrieves the correct risk management component, creating it if needed and remembering it for future use based on exchange and frame.
*   **`checkSignal`**:  This is your primary way to ensure a trade adheres to the risk rules, performing checks like portfolio drawdown and exposure limits. If a rule is broken, it will notify you.
*   **`addSignal` & `removeSignal`**: These methods handle the lifecycle of trades, registering new signals and removing them when they close, allowing for precise risk tracking.
*   **`clear`**:  This allows you to manually clear the cached risk management components when needed, ensuring the system reflects the current state.



It's important to note that this service relies on other services like `RiskSchemaService`, `ActionCoreService` and `ExecutionContextService` for its functionality.

## Class ReportWriterAdapter

This component helps you manage where your trading data and reports are stored. It uses a flexible design, allowing you to easily swap out different storage methods without changing your core code. 

It keeps track of your reports (like backtest results, live trading data, or walker data) in a memoized cache, ensuring you only have one version of each report type running at any time. By default, it saves reports as JSONL files.

You can customize how reports are stored by changing the report factory, or use convenient shortcuts like switching to a dummy adapter to ignore writes or reverting to the standard JSONL format. The `writeData` method is your primary tool for sending data to the configured storage, and it automatically handles creating storage if it doesn’t already exist. This system simplifies creating pipelines for analyzing and tracking your trading activity. It also supports lazy initialization, meaning it only starts writing when you need it.

## Class ReportUtils

ReportUtils helps you control what kind of logging and reporting happens within the backtest-kit framework.

It lets you turn on or off logging for different areas like backtesting, live trading, performance analysis, and more.

The `enable` method is the main way to start logging – it subscribes to the specific services you choose and returns a function that you *must* call later to stop logging everything at once. Think of it as turning on a bunch of lights, and needing a single switch to turn them all off.

If you just want to stop a specific type of logging, the `disable` method is what you need. This is like switching off a single light without affecting the others. It doesn't give you a cleanup function; the logging stops instantly.

ReportUtils is designed to be extended by other classes, so you can customize the reporting process further.

## Class ReportBase

The `ReportBase` class helps you record and analyze trading events. It's designed to write data to a file in a standardized JSONL format, one event per line, making it easy to process and search later. This class handles the complexities of writing to a file, including managing buffering, timing out slow writes, and creating necessary directories.

It's organized so that each report type (like order fills or strategy signals) goes into its own file.

You can search these reports by criteria like the trading symbol, strategy, exchange, time frame, or signal identifier, allowing you to filter and investigate specific events. The initialization happens only once, guaranteeing the safety of resource allocation and error handling.

The `write` method is the primary way to log events, and it automatically adds metadata and a timestamp to each entry. It includes built-in protections to prevent slow writes from causing problems, automatically waiting or timing out if necessary.

## Class ReportAdapter

The ReportAdapter helps manage where and how trading data is stored. Think of it as a flexible system that lets you choose different ways to save your reports – like using a simple JSON file or something more complex. 

It remembers which storage method you’re using, so you don’t have to keep telling it. The system also automatically creates a new storage location for each type of report you generate.

You can easily switch between storage methods, even using a "dummy" adapter to temporarily prevent any data from being saved (useful for testing).  

If your working directory changes during a backtest, it's a good idea to clear the adapter's memory to ensure new storage locations are created. This system makes sure your data is stored in a consistent and organized way.


## Class PriceMetaService

PriceMetaService helps you get the most recent market price for a specific trading setup. It acts like a memory, storing the latest price for each combination of symbol, strategy, exchange, frame, and whether it’s a backtest. 

Think of it as a convenient way to access the current price even when you're not actively executing a trade. 

If the price isn’t immediately available, it will wait a short time, up to a few seconds, to ensure you get a valid value. It's designed to be automatically updated by the system after each trading tick, ensuring accuracy.

You can clear the stored prices completely or just for a specific setup to make sure you’re working with fresh data, which is particularly important at the start of a new trading session. The service itself manages everything internally, updating prices and holding onto them until you tell it to clean up.

## Class PositionSizeUtils

This class helps you determine how much of your account to use for each trade. It offers different approaches to position sizing, like fixed percentages, Kelly Criterion, and ATR-based methods. Each method has built-in checks to ensure it’s being used correctly. 

You can use these methods by calling them directly; they don't require any setup or initialization. 

Here's a quick look at what each method does:

*   **fixedPercentage:**  Calculates position size based on a predetermined percentage of your account balance.
*   **kellyCriterion:**  A more complex method considering win rate and win-loss ratio to determine an optimal position size (use with caution!).
*   **atrBased:**  Determines position size using the Average True Range (ATR) to account for market volatility. 

Each of these calculations takes into account factors like the trading symbol, your account balance, the opening price, and other specific parameters depending on the method.

## Class PersistStorageUtils

This class provides tools for reliably saving and loading signal data, ensuring that your trading strategies don't lose progress even if something goes wrong. It helps manage how signals are stored persistently, meaning the data survives restarts and interruptions.

The class intelligently handles storage, creating a single storage instance for each signal and storing each as a separate file.  You can even customize how this storage works by plugging in your own adapters.

Importantly, writing data is done in a way that minimizes the risk of corruption if the application crashes unexpectedly.  The system also provides a way to clear the storage cache when needed, which is useful in specific scenarios.

It provides methods for reading and writing signal data, and it allows you to switch between different storage methods – like using JSON for standard storage or using a “dummy” mode for testing where nothing is actually saved.

## Class PersistSignalUtils

This class, PersistSignalUtils, helps manage how signal data is saved and retrieved, especially for strategies running in live mode. It ensures that signal information isn't lost, even if there are unexpected interruptions.

It provides a way to store signal data separately for each strategy, allowing for customized storage methods. You can even plug in your own storage solutions.

The class is designed to handle reading and writing signal data securely and reliably. If a signal doesn't exist, reading will return null.

You can register different ways to store the data, like using JSON files or even a dummy adapter to simply ignore writes for testing. The `clear` method refreshes the storage cache when the working directory changes, and `useJson` and `useDummy` let you choose between default JSON persistence and a no-op storage method respectively.

## Class PersistScheduleUtils

This class helps manage how trading signals are saved and loaded, particularly for strategies that rely on scheduled signals. It ensures that these signals are kept safe even if the program crashes. 

Each strategy gets its own dedicated storage area for these signals, and you can even customize how the storage works by providing your own adapter.

The system carefully handles reading and writing these signals to prevent data corruption.

Here's a quick rundown of what you can do:

*   **Read existing signals:** You can fetch the previously saved signal data for a specific trading symbol and strategy.
*   **Save new signals:** This lets you store the current state of a scheduled signal.
*   **Choose a storage method:** You can select between a standard JSON format, a dummy adapter that doesn't save anything (useful for testing), or a custom storage method.
*   **Clear the storage:**  When the program’s working directory changes, it's important to clear out old storage to make sure the new directory is used correctly.

The `ClientStrategy` uses this class to load signals when it starts and to save them when they change.

## Class PersistRiskUtils

This class helps manage how your trading positions are saved and loaded, particularly when dealing with risk management. It's designed to keep track of active positions reliably, even if unexpected issues occur. 

It remembers where your position data is stored for each risk profile, making it easy to find. You can also customize how this data is stored, using different adapters if needed.

The `readPositionData` method retrieves saved position information, while `writePositionData` ensures that updates to your positions are saved safely to disk, preventing data loss.

You can also clear the existing storage cache when the working directory changes, making sure you get fresh data. 

There are built-in options to switch between different storage methods: you can use the default JSON format, or a dummy adapter that discards changes for testing purposes.

## Class PersistPartialUtils

This class helps manage and save your trading strategy’s partial profit/loss information, ensuring that data isn't lost even if there are unexpected interruptions. It keeps track of these values for each symbol and strategy, storing them in a way that’s reliable and prevents data corruption. 

The system automatically handles the storage, creating unique locations for each symbol and strategy combination. You can even customize how this data is stored by providing your own adapter.

When your strategy restarts, this class loads the previously saved information, allowing the strategy to pick up where it left off. To ensure data safety, writing and reading operations are handled carefully.

You have the option to clear the saved data, which is useful if the underlying storage location changes. Additionally, you can switch between using a standard JSON format, a dummy adapter for testing (which effectively ignores any saving), or using your custom adapter.


## Class PersistNotificationUtils

This class, `PersistNotificationUtils`, helps manage how notification data is saved and loaded. It’s designed to be reliable, even if the program crashes unexpectedly.

It provides a way to use different storage methods, including a default JSON option and a dummy option for testing where data isn't actually saved.

You can also register your own storage adapter if you need something specialized.

The class automatically saves each notification as a separate file, making it easy to manage individual notifications.

Importantly, when notifications are read or written, the process is designed to be safe and avoid data corruption. The `readNotificationData` function loads all saved notifications, while `writeNotificationData` saves changes to disk. The `clear` method is useful to reset the storage if the working directory changes.

## Class PersistMemoryUtils

This class helps manage how your trading data is saved and loaded from disk, ensuring that your progress isn't lost even if your application crashes. It’s designed to keep track of memory entries, grouping them by a signal ID and bucket name, and stores them in JSON files within a specific directory structure.

You can customize how this data is stored by using different persistence adapters, or revert to the default JSON storage. The class also provides utilities for reading, writing, and removing memory entries, and it provides a way to list all the available entries for rebuilding indexes. It includes a "dummy" mode that lets you disable persistence completely for testing purposes. To maintain accuracy, it's important to clear the storage cache when the working directory changes and to properly dispose of memory adapters when a signal is no longer needed.

## Class PersistMeasureUtils

This utility class helps manage how cached data from external APIs is saved and retrieved, specifically designed for long-term storage. It keeps track of different cache buckets, ensuring each one has its own dedicated storage space.

You can customize how the data is stored by plugging in different adapters, allowing flexibility depending on your needs. The system is built to handle data updates safely, even if unexpected issues occur.

It offers functions to read and write cached data, and includes methods to clear the entire cache when necessary, such as when the base directory changes. 

There's also the option to use a default JSON adapter for standard storage or a "dummy" adapter that simply discards any write operations, useful for testing or when persistent storage isn’t required.

## Class PersistLogUtils

This class provides tools for reliably saving and retrieving log data. It acts like a central manager for how log information is stored on disk.

It intelligently handles storage, remembering the last known state and allowing you to plug in different ways to save the data, like using JSON files or even discarding the data entirely for testing purposes.

The `readLogData` method is used to load all previously saved log entries, ensuring your system remembers its history.  `writeLogData` saves new log entries, doing it in a way that protects against data loss even if your application crashes.

You can also change how the log data is saved.  For example, you can switch to a simpler, JSON-based storage or a "dummy" adapter that ignores any saves, helpful for testing.  If your application's working directory changes, use the `clear` method to refresh the storage.


## Class PersistCandleUtils

This utility class helps manage a cache of historical candle data, which is crucial for backtesting trading strategies. It stores each candle as a separate JSON file, making it easy to locate and retrieve specific data points.

The cache intelligently validates itself – it only returns data if it has *all* the candles you're requesting, preventing partial or incorrect results.  If any candles are missing, it signals a cache miss and forces a refresh.

This system also automatically updates the cache when data is incomplete, ensuring accuracy. To keep things running smoothly, use the `clear()` method whenever your working directory changes, forcing a fresh start for the cache. 

You can choose different storage methods, including JSON or a dummy adapter for testing purposes, tailoring persistence to your specific needs. The `writeCandlesData` function requires carefully validated candle data to maintain data integrity and consistency.

## Class PersistBreakevenUtils

This utility class manages how breakeven data is saved and loaded from disk. It keeps track of breakeven state for different trading strategies and symbols. 

Think of it as a central place to store and retrieve information about your breakeven points, ensuring that your strategies remember their progress even if you restart. It automatically creates the necessary files and folders to hold this data, organized by symbol, strategy name, and exchange. 

You can even customize how this data is stored, for instance, by using JSON or by pretending to save it (a "dummy" adapter useful for testing).  The system cleverly avoids writing the same data repeatedly by keeping a memoized cache and allows the system to adapt to changing working directories. This ensures a consistent and reliable way to maintain your breakeven state.

## Class PersistBase

This class provides a foundation for storing and retrieving data to files, ensuring that operations are handled reliably and without data loss. It's designed to work with file-based persistence, making sure your data stays safe even if something goes wrong during a write.

The class manages where your data is stored—you specify an entity name and a base directory.  It automatically keeps track of the exact location of files and cleans up any corrupted ones it finds.

You can easily iterate through all the entities you've stored using the `keys` method, which provides a sorted list of entity IDs.

Key functions allow you to read existing data, check if data exists, and write new data, all while employing atomic file operations to guarantee data integrity. An initialization process ensures the persistence directory is ready and validates existing data when the system starts up, and this process only runs once.

## Class PerformanceReportService

This service helps you understand how long different parts of your trading strategy take to execute. It listens for timing information from your strategy and records it in a database.

Think of it as a performance tracker that highlights potential bottlenecks in your code. 

You can easily start monitoring your strategy's performance by subscribing to the service, and equally important, stop monitoring it when you no longer need to. The service ensures you don't accidentally subscribe multiple times, which could cause issues. 

The `loggerService` property lets you add debugging output for more detailed performance insights, and the `track` property handles the actual processing and logging of these timing events.


## Class PerformanceMarkdownService

This service is designed to monitor and analyze how your trading strategies are performing. It listens for performance data, organizes it by strategy, and then calculates key statistics like averages, minimums, maximums, and percentiles.

The service automatically generates reports in Markdown format, which helps you quickly identify bottlenecks and areas for improvement.  These reports are saved to your logs directory.

You can use the `subscribe` function to start receiving performance data, and `unsubscribe` to stop.  The `track` method is the key to feeding the service the performance information it needs.

Need to review past performance?  The `getData` method allows you to retrieve statistics for a specific symbol and strategy. You can generate a report using `getReport`, and save that report to disk with `dump`. Finally, `clear` lets you wipe the performance data and start fresh. The service uses a logger for output and a system for managing data storage, ensuring each strategy's data remains isolated.

## Class Performance

The Performance class helps you understand how well your trading strategies are performing. It offers tools to collect and analyze data related to your strategies' execution.

You can retrieve aggregated performance statistics for a specific symbol and strategy combination, providing key metrics like counts, durations, averages, and volatility measures.

To better visualize your strategy’s performance, you can generate a detailed markdown report. This report breaks down the time spent on different operations, presents key statistics in a table, and highlights potential bottlenecks using percentile analysis.

Finally, the class lets you easily save these performance reports to disk, which is handy for tracking trends and sharing results – the reports will be stored in a folder named 'dump/performance' by default.

## Class PartialUtils

The PartialUtils class helps you analyze and report on partial profit and loss data collected during trading. Think of it as a tool for examining how your strategies are performing in smaller, more granular steps.

It gathers information from partial profit/loss events—details like when a trade moved in your favor or against you, what symbol was involved, and the strategy used. This information is stored temporarily, allowing for analysis and reporting.

You can request aggregated statistics, like the total number of profit and loss events, or generate comprehensive markdown reports summarizing individual trades. These reports list key details of each event, including the action (profit or loss), symbol, price, and timestamp.

Finally, you can easily save these reports to a file, creating a persistent record of your trading performance, automatically naming the file using the symbol and strategy name.

## Class PartialReportService

The `PartialReportService` is designed to keep track of every time your trading strategy partially closes a position, whether it's a profit or a loss. Think of it as a detailed record of those intermediate steps in your trades.

It listens for signals indicating partial profit and partial loss events, capturing information like the price and level at which these exits occur. This information is then logged to a database.

You can use the `subscribe` function to activate this monitoring; it ensures you don’t accidentally subscribe multiple times and provides a way to stop listening with the returned unsubscribe function. The `unsubscribe` function provides a convenient way to stop the service from listening, although it does nothing if you haven't subscribed in the first place. The service also has a logger to help debug any issues.


## Class PartialMarkdownService

The PartialMarkdownService helps you track and report on partial profits and losses during trading. It listens for these events and keeps a running tally for each symbol and strategy you're using. 

It automatically generates easy-to-read markdown reports that detail each profit and loss event, providing a clear picture of how your strategies are performing. You can also request overall statistics, like the total number of profits and losses.

The service saves these reports as markdown files, organized by symbol and strategy, making it simple to review your trading history. It also offers a way to clear out this stored data when you want to start fresh. You can even customize which data points appear in the reports and where they're saved. It provides a dedicated method to stop and start listening for new events, preventing multiple subscriptions.

## Class PartialGlobalService

This service acts as a central hub for managing partial profit and loss tracking within the system. Think of it as a middleman – it receives requests related to profit, loss, and clearing partial states and then passes them on to the connection service to handle the actual work. It’s designed to be injected into strategies, streamlining how they interact with the system and providing a single point for managing these interactions.

A key feature is its logging capability; every action taken – whether it's registering a profit, a loss, or clearing a position – is recorded for monitoring and debugging. This service relies on other components like validation and schema services to ensure configurations are correct before proceeding.

Essentially, it makes the system more organized, easier to monitor, and more reliable when dealing with partial profit and loss calculations.

## Class PartialConnectionService

The PartialConnectionService manages and tracks partial profit and loss information for trading signals. It's designed to avoid creating unnecessary instances and ensures that each signal has its own dedicated record.

Think of it as a central hub: when a profit or loss is detected for a signal, this service finds or creates a record for it, configures it, and then hands off the actual profit/loss calculation to that record.

It cleverly remembers these records using a technique called memoization, so it doesn’t have to recreate them every time. When a signal is finished, this service cleans up those records, making sure nothing is left behind.

This service works closely with the ClientStrategy and uses a combination of caching and event emissions to keep things running smoothly and efficiently. You'll find it’s automatically injected into the ClientStrategy, streamlining the process. The getPartial property is what creates the memoized instances. The profit and loss methods handle the updating of these partial records, and the clear method makes sure they are cleaned up when no longer needed.

## Class NotificationLiveAdapter

This component provides a flexible way to manage notifications during live trading. It acts as a central point, letting you easily swap out different notification methods without changing your core trading logic.

You can choose how notifications are handled – storing them in memory, persisting them to disk, or even discarding them entirely with a dummy adapter. The adapter pattern allows you to plug in custom notification backends if the built-in options don’t meet your needs.

The `handleSignal`, `handlePartialProfit`, `handlePartialLoss` and other methods simply pass notification events to the currently active adapter.  You can retrieve all stored notifications with `getData` and clear them with `dispose`.

To switch notification methods, use methods like `useDummy`, `useMemory` (the default), or `usePersist`. The `useNotificationAdapter` method gives you the most control, allowing you to specify a custom adapter. If the process directory changes, it's important to `clear` the cached utils instance to ensure correct behavior.

## Class NotificationBacktestAdapter

This component provides a flexible way to handle notifications during backtesting, allowing you to choose where those notifications are stored or processed. It's designed to be adaptable, letting you easily swap out different notification "backends" without changing the core backtesting logic. By default, notifications are stored in memory, but you can switch to persistent storage on disk or use a "dummy" adapter that simply ignores the notifications.

You can manage how notifications are handled by using methods like `useDummy`, `useMemory`, and `usePersist` to quickly change the underlying adapter. The `handleSignal`, `handlePartialProfit`, and similar methods are all wrappers that forward the notification events to the currently selected adapter.  You can also retrieve all stored notifications with `getData` and clear them with `dispose`.  Finally, `clear` is important to call when your working directory changes between backtest runs to ensure a fresh start with the default memory-based adapter.

## Class NotificationAdapter

This component handles all your notifications, whether you're running a backtest or a live trading session. It automatically keeps track of notifications as they come in, and provides a simple way to retrieve them.

To prevent confusion and duplicate notifications, it ensures subscriptions happen only once.  You can turn notification tracking on and off as needed, and it’s safe to disable it even if it’s already off.

Retrieving your notifications is as easy as asking for either the backtest or live data, and you can completely clear out all stored notifications when you're finished with a backtest or live session.

## Class MemoryAdapter

The MemoryAdapter helps manage and store data related to signals and buckets, like keeping track of information for a specific trading strategy. It's designed to be efficient by only creating a data storage area (an "instance") when it's actually needed, and reusing it whenever possible.

You can easily switch between different storage methods: a simple in-memory solution, persistent storage to files, or even a dummy adapter that throws away any data you try to save. The default storage method combines in-memory storage with file persistence for a balance of speed and data safety.

Before you start using any data storage functions, you need to activate the adapter. Disabling the adapter later simply stops it from tracking signal lifecycle events.

You can add data using `writeMemory`, search using text-based scoring with `searchMemory`, list everything with `listMemory`, delete entries with `removeMemory`, or retrieve a single item with `readMemory`. The `clear` function resets the adapter's internal cache, useful for scenarios where your working directory changes, and `dispose` releases resources, ensuring a clean shutdown.

## Class MaxDrawdownUtils

This class helps you understand and analyze the maximum drawdown experienced during trading simulations or live trading. It acts as a central place to gather and present information about how much your strategies lost from peak to trough.

Think of it as a tool to get reports and statistics about drawdown events. You can request data on specific symbols and strategies, defining what data you're interested in.

It provides a few key functions:

*   `getData` allows you to fetch numerical statistics related to drawdown.
*   `getReport` creates a human-readable markdown report summarizing drawdown events.
*   `dump` generates the same markdown report and saves it directly to a file.

Essentially, it simplifies accessing and presenting drawdown information to help you assess and improve your trading strategies.

## Class MaxDrawdownReportService

The MaxDrawdownReportService is designed to automatically track and record maximum drawdown events, which are crucial for evaluating trading strategies. It essentially listens for drawdown updates and saves these events as JSON files, allowing for detailed analysis later.

Think of it as a dedicated recorder for significant losses in your trading tests.

To get it working, you need to tell it to start listening.  It only subscribes once; further attempts just give you the same way to stop it.

When it's actively tracking, it gathers all the important details of each drawdown event – including timestamps, symbols, strategy names, and even the specifics of the trading signals involved.  This rich data allows for a complete picture of what happened during those drawdown moments.

Finally, you can tell it to stop listening when you no longer need it to track drawdowns.


## Class MaxDrawdownMarkdownService

This service is designed to automatically create and save reports detailing maximum drawdown metrics for your trading strategies. It keeps track of drawdown data for specific symbols, strategies, exchanges, and timeframes.

You need to tell it to start listening for drawdown events using the `subscribe` method. When it receives these events, it gathers and organizes the data.

You can then retrieve the accumulated data using `getData`, generate a formatted markdown report with `getReport`, or directly save the report to a file with `dump`. 

The `clear` function lets you erase this stored data – you can clear everything at once, or just the data for a specific symbol and strategy combination. Be careful, clearing all data will reset everything. The service also handles unsubscribing and stopping the data collection process through the `unsubscribe` method.

## Class MarkdownWriterAdapter

The MarkdownWriterAdapter helps you manage how your trading reports are saved, offering flexibility in storage methods. It allows you to choose between creating individual markdown files for each report, centralizing them in a single JSONL file, or completely disabling markdown output for testing or efficiency. 

You can easily switch between these storage options using functions like `useMd`, `useJsonl`, and `useDummy`.

Under the hood, it efficiently manages storage instances, ensuring that only one is created for each report type, like backtest or live trading data.

The `useMarkdownAdapter` function lets you customize the storage mechanism entirely, and the `clear` function is useful for situations where you need to refresh the storage location. The adapter automatically creates storage when you first write data, simplifying the process of saving your trading information.

## Class MarkdownUtils

The MarkdownUtils class helps control the creation of markdown reports for various parts of the backtest-kit framework, like backtesting, live trading, and strategy performance analysis.

It lets you turn on or off markdown reporting for specific features.

The `enable` method lets you choose which services should generate markdown reports and returns a function you *must* call to clean up and prevent memory issues. Think of it as subscribing to these services – when you’re done, you need to unsubscribe them.

The `disable` method allows you to stop markdown reporting for certain services without affecting others, giving you fine-grained control over report generation.  This stops data accumulation and report creation for those services, freeing up resources.

## Class MarkdownFolderBase

This class helps you create organized reports where each report is saved as its own markdown file. Think of it as a way to keep your backtesting results neatly separated into individual files, making them easy to browse and understand.

It creates a folder structure based on your specified path and filename, so you don't have to worry about creating those directories yourself.  Each report is written directly to a file without any complex stream management.

The `waitForInit` method is essentially a placeholder; it doesn't actually do anything because this adapter operates directly with files.

The main function to use is `dump`, which takes the markdown content and options (like the file path) and writes the content to the correct file, ensuring the file and directory structure exist.


## Class MarkdownFileBase

The `MarkdownFileBase` class provides a way to consistently write your markdown reports as JSONL files, making them easier to manage and process. It's designed to append data to a single file for each report type, and it handles the writing process efficiently.

This adapter creates a dedicated directory to store these JSONL files and automatically creates it if it doesn't exist.  It also includes safeguards to prevent writing errors and ensures writes complete within a reasonable time (15 seconds), helping to avoid issues with slow or unresponsive systems.

You can filter these reports later by searching for specific criteria like the trading symbol, strategy name, exchange, frame, or signal ID. 

To start using it, you specify the report type during creation, and the class handles initializing the file and write stream.  The `dump` method is then used to add new markdown content along with important metadata for organization and searching. It’s a great tool for centralized logging and integrating with other JSONL-aware tools.


## Class MarkdownAdapter

The MarkdownAdapter helps manage how your markdown data is stored, offering flexibility and efficiency. It lets you choose different ways to store markdown—either as individual files or in a single JSONL file—and it remembers which method you've chosen so you don't have to keep setting it. 

You can easily switch between storage methods using shortcuts like `useMd` for individual files or `useJsonl` for a combined JSONL approach.

If your project directory changes, it’s a good idea to clear the adapter's memory using `clear` to make sure new storage is initialized correctly.

For testing or situations where you don’t want to save any markdown data, `useDummy` provides a way to simulate writes without actually writing anything to disk.


## Class LoggerService

The LoggerService helps ensure consistent logging across your trading strategies and backtests by automatically adding useful context to each log message. Think of it as a central hub for all your logging needs.

It allows you to plug in your own preferred logger, but it smartly adds information like the strategy and exchange being used, as well as details about the current trade execution. If you don't provide your own logger, it will use a simple "no-op" logger that doesn't actually log anything.

You can use the `log`, `debug`, `info`, and `warn` methods to record different levels of information. Each method automatically enriches the message with the relevant context, so you don't have to do it manually.  The `setLogger` method lets you swap in a completely different logging solution if you need to. 

Essentially, it simplifies logging and provides a standardized way to understand what’s happening within your backtests and strategies.

## Class LogAdapter

The `LogAdapter` provides a flexible way to manage and store log messages within the backtest-kit framework. Think of it as a central hub for all your logging needs, allowing you to easily swap out how those logs are handled.

By default, logs are stored in memory, which is quick and convenient. However, you can switch to persistent storage on disk or even use a dummy adapter that essentially ignores all log messages – useful for performance testing or situations where you don't need logging at all.

You can change how logging is done at any time using methods like `usePersist`, `useMemory`, and `useDummy`.  You also have the option to create and use your own custom log adapters.  The `clear` method is a good idea to call at the beginning of each new backtest run to reset logging. Getting all log entries is done through `getList` and logging messages of different levels (debug, info, warn) is facilitated by corresponding methods.

## Class LiveUtils

The `LiveUtils` class provides tools for managing live trading operations, acting as a central hub for interacting with the live trading system. It simplifies access to core functions and includes features like crash recovery and real-time tracking.

You can think of `LiveUtils` as a manager for your live trading sessions. It helps you run trading strategies, handle errors, and monitor their progress.

Here's a breakdown of what it does:

*   **Running Strategies:** `run()` starts a live trading session for a specific symbol and strategy. This session continues indefinitely, even if the program crashes, thanks to built-in recovery mechanisms.  `background()` is similar but runs the trade silently without displaying results, useful for tasks like persistent data storage.
*   **Signals and Positions:** Various methods like `getPendingSignal()`, `getTotalPercentClosed()`, and `getPositionPnlCost()` allow you to retrieve information about the current state of a trading position -  like pending orders, profitability, and entry prices.
*   **Control & Safety:** `stop()` pauses live trading, `commitCancelScheduled()` and `commitClosePending()` let you prematurely end signals.  `commitBreakeven()` automatically moves stop-loss levels for profit protection.
*   **DCA Management:**  Methods like `commitAverageBuy()` and `getPositionEntries()` are crucial for managing dollar-cost averaging (DCA) strategies, adding entries and tracking their costs and prices.
*   **Data and Reporting:** `getData()` provides statistical information. `getReport()` and `dump()` generate comprehensive reports for analysis and record-keeping.
*   **Overlap Protection:**  Methods like `getPositionEntryOverlap()` and `getPositionPartialOverlap()` help avoid errors by preventing duplicate entries or closes at similar price levels.



The `LiveUtils` class uses a singleton pattern, meaning you always access the same instance, ensuring consistent management of your live trading operations.

## Class LiveReportService

The LiveReportService helps you keep a real-time record of your trading activity as it happens. It's designed to capture every key event in your trading signal's lifecycle—when it's idle, when a trade is opened, when it’s active, and when it’s closed.

It listens for these events and diligently logs them, including all the relevant details, directly to a SQLite database. This detailed record is invaluable for monitoring how your trading strategy performs and analyzing its behavior.

To make sure you don't accidentally overload the system, it prevents multiple subscriptions to the live signal feed. When you want to start receiving these updates, the `subscribe` method does this and returns a function you can use to stop it. The `unsubscribe` method cleanly stops the reporting process, ensuring it only does something when it's actually subscribed.


## Class LiveMarkdownService

The LiveMarkdownService helps you automatically generate and save reports of your live trading activity. It essentially listens for updates related to your trading strategies, like when a trade is opened, active, or closed.

It gathers this information and organizes it into nicely formatted markdown tables that include details about each trading event. You'll also get useful statistics such as win rate and average profit/loss.

The service saves these reports as `.md` files, making them easy to read and analyze – typically found in a `logs/live/` directory, named after your strategy.

Here's a breakdown of what you can do with it:

*   **Subscription:** You subscribe to receive tick events from your trading system. Importantly, you can only subscribe once to avoid duplicate events.
*   **Data Retrieval:** You can request specific data or a complete report for a given symbol, strategy, exchange, frame, and backtest configuration.
*   **Report Generation:** It creates markdown reports detailing all the events associated with a particular trading strategy.
*   **Saving Reports:** You can save these reports directly to disk.
*   **Clearing Data:** You can clear accumulated event data, either for all strategies or just a specific combination of symbol, strategy, exchange, frame, and backtest.

The `tick` method is key – it’s the place where the service processes each update and records the relevant details for each strategy. It relies on a `loggerService` for debug output and a `getStorage` function to manage the data storage.

## Class LiveLogicPublicService

This service manages live trading operations, handling the behind-the-scenes coordination. It simplifies things by automatically passing information about the trading strategy and exchange to the relevant functions, so you don’t have to manually include it every time.

The service continuously runs a trading simulation, pulling in data and generating trading signals.  If the process unexpectedly stops, it’s designed to recover and resume from where it left off using saved data.

It’s built to keep running indefinitely, tracking time using the system clock to ensure everything stays synchronized.  Essentially, it provides a convenient and robust way to execute your trading strategies in real-time.

You can start the trading process for a specific symbol, and it will provide a stream of data representing trading events, such as when a position is opened, closed, or canceled.


## Class LiveLogicPrivateService

This service manages the live trading process, continuously monitoring and reacting to signals. It operates as an ongoing, never-ending loop, constantly checking for new signals and processing them.

Each cycle involves creating a timestamp to track the real-time progression and using the `tick()` method to evaluate the signal status. The service then streams the results—specifically when positions are opened or closed— rather than active or idle states.

To conserve resources, it delivers results as a memory-efficient stream using an asynchronous generator. If the process encounters a crash, it will recover the trading state from disk, ensuring continuity. The `run` method takes a symbol as input and initiates this ongoing, streaming live trading operation for that symbol.

## Class LiveCommandService

The LiveCommandService makes it easy to interact with the live trading parts of the backtest-kit framework. Think of it as a central hub for managing live trades. 

It handles things like validating your trading strategies and exchanges, and it provides a clean way to inject dependencies, keeping your code organized.

The core function, `run`, is what kicks off the live trading process. You give it a symbol (like a stock ticker), and some context about your strategy and exchange.  It then continuously generates results, handling potential issues and automatically attempting to recover from crashes to keep trading running. This is all done asynchronously, so your application won't freeze up while trading.


## Class HighestProfitUtils

This class helps you access and understand the best-performing trades recorded by the backtest system. Think of it as a tool for analyzing which strategies and symbols are generating the most profit.

It works by collecting data from events that mark highest profit points.

You can use the `getData` method to get detailed statistics about the highest profit events for a specific trading symbol, strategy, and exchange.  The `getReport` method creates a readable markdown report summarizing these events. Finally, `dump` lets you automatically save that report to a file, making it easy to share or archive your findings.  This allows for easy analysis of the most profitable strategies in a given context.

## Class HighestProfitReportService

The `HighestProfitReportService` keeps track of the highest profit achieved during a backtest and records this information for later analysis. It actively monitors for new highest profit events and saves them to a JSONL database.

This service connects to a specific data stream, `highestProfitSubject`, to listen for these events. When a new highest profit is detected, it captures all the relevant details—including timestamps, symbols, strategy names, exchange information, and price levels—and saves this snapshot to the database. 

The `subscribe` function allows you to begin monitoring for these events, ensuring that only one subscription is active at a time to prevent redundant data. The `unsubscribe` function is then used to stop the data recording process.

## Class HighestProfitMarkdownService

This service is designed to automatically create and save reports detailing the highest profit achieved for specific trading setups. It listens for data about these setups and organizes it based on symbol, strategy, exchange, and timeframe.

You can subscribe to receive updates as these profit events occur. This subscription is handled carefully to avoid repeated subscriptions – the first subscription returns a way to unsubscribe, and subsequent calls return the same unsubscribe function.

The service provides ways to retrieve the accumulated data, generate formatted markdown reports, and save those reports as files. If no data has been recorded for a particular combination of symbol, strategy, exchange, and timeframe, it will return a report with zero events.

It also offers a way to clear the accumulated data for specific combinations or to completely wipe the slate clean, effectively resetting the tracked data. This clearing process is also what happens when you unsubscribe from the data feed.

## Class HeatUtils

HeatUtils helps you visualize and understand how your trading strategies are performing. It’s like a tool to quickly create and save reports that show a heatmap of your portfolio’s results.

This tool automatically gathers data from all your closed trades to give you a clear picture of how each symbol and your overall portfolio did.

You can get the raw data, generate a formatted markdown report, or even save that report directly to a file on your computer. The report displays key metrics like total profit/loss, Sharpe Ratio, maximum drawdown, and the number of trades for each symbol, sorted by profitability. 

It’s designed to be easy to use; think of it as a single, convenient place to access and work with your portfolio heatmap data.

## Class HeatReportService

The HeatReportService is designed to keep track of your trading signals, specifically when a signal closes and generates profit or loss. It's like a dedicated recorder for those key moments in your trading activity.

It listens for signals and only focuses on events where a signal has closed, capturing important information like the profit and loss involved.

This service then stores this data in a database, allowing you to analyze your trading performance across different assets.

To ensure you don’t accidentally flood the database with multiple entries, the service prevents it from being subscribed to more than once.

You can easily start and stop its monitoring using the `subscribe` method, which provides a function to unsubscribe when you no longer need it.

## Class HeatMarkdownService

This service helps you visualize and analyze your trading performance using heatmaps, particularly useful for backtesting. It gathers data from your trading signals and organizes it into meaningful statistics for each strategy and symbol.

It keeps track of closed trades and calculates key metrics like total profit/loss, Sharpe ratio, and maximum drawdown for each symbol, as well as aggregated portfolio-level information.

You can subscribe to receive updates as new trades happen, or unsubscribe when you don't need the real-time data. It handles potential errors when doing calculations and ensures data is organized efficiently.

The service can generate reports in markdown format, making it easy to share and review your results. It also offers the ability to save these reports to disk with automatically generated filenames that include the strategy name, exchange, and backtest mode. If needed, you can clear all stored data, or selectively clear data for specific strategies or exchanges.

## Class FrameValidationService

The FrameValidationService helps you keep track of and verify your trading timeframes, often referred to as frames. It acts like a central record-keeper, storing all your defined timeframes and checking to make sure they are valid before you use them in your strategies.

It's designed to be efficient too, remembering previous validation results to speed things up. 

Here's what you can do with it:

*   **Register Timeframes:** Use `addFrame()` to tell the service about a new timeframe you're using. You'll provide a name and a description of its structure.
*   **Validate Existence:** `validate()` checks if a given timeframe actually exists in your registered list. This prevents errors down the line.
*   **Get a List of Timeframes:** `list()` provides you with a complete inventory of all the timeframes you’ve registered.



Essentially, this service ensures you're working with the correct and existing timeframes, which is crucial for reliable backtesting and trading.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of your frame schemas in a structured and organized way. It acts like a central repository for these schemas, ensuring consistency and type safety. 

You can add new frame schemas using the `register` method, giving each one a unique name. If a schema already exists, you can update it using the `override` method – this lets you modify just specific parts of the existing schema.

Need to find a particular schema?  The `get` method will retrieve it based on its name.  

Before a new schema is registered, the service performs a quick check with `validateShallow` to make sure it has all the essential properties in the right format, helping catch potential errors early on.


## Class FrameCoreService

FrameCoreService is a central component that handles the creation and management of timeframes for your backtesting process. It works closely with the FrameConnectionService to fetch and organize data. Think of it as the engine that provides the chronological sequence of data points your trading strategies will be evaluated against.

It’s a foundational piece, primarily used behind the scenes by the BacktestLogicPrivateService, so you typically won't interact with it directly.

The service is equipped with logging, connection management, and validation capabilities for ensuring the integrity of the timeframes.

The `getTimeframe` method is its key function; it allows you to specify a symbol (like a stock ticker) and a timeframe name (like "1m" for one-minute intervals) and receive back an array of dates that represent the period you want to backtest.

## Class FrameConnectionService

The FrameConnectionService helps manage and access different frames of data used in trading strategies. It automatically directs requests to the correct frame implementation based on the currently active context.

To improve efficiency, it remembers previously created frames, so it doesn't need to recreate them every time they're needed.

This service also provides a way to get the timeframe boundaries for a specific trading symbol, allowing you to control the period of a backtest. It uses information stored in the frame configuration to define the start and end dates.

When operating in live mode, there are no frame constraints, meaning the frame name will be empty.

## Class ExchangeValidationService

This service helps you keep track of and verify your trading exchanges. It acts as a central place to register your exchange configurations, ensuring they are available before you try to use them in your backtesting or live trading. The service remembers if an exchange is valid, so it doesn’t have to re-check repeatedly, making things run faster. 

You can add new exchanges using the `addExchange` function. To make sure an exchange is good to go before you start trading with it, use the `validate` function. If you need to see a list of all exchanges you’ve registered, the `list` function will provide them. Essentially, this service is your guide to managing and confirming your exchange setups.

## Class ExchangeUtils

The ExchangeUtils class is a helpful tool for working with different cryptocurrency exchanges within the backtest-kit framework. It acts as a central point, ensuring that interactions with each exchange follow a consistent and validated process. Think of it as a manager that handles common exchange-related tasks.

It provides methods to retrieve historical candle data, calculate average prices, and format quantities and prices to match the specific rules of each exchange. Getting order book and aggregated trades is also easy with this class. 

Importantly, the `getCandles` function automatically figures out the correct date range for historical data, and the system ensures consistency with how candles are retrieved previously. The class is designed to be readily available, ensuring ease of use and avoiding repetitive code throughout your trading strategies.

## Class ExchangeSchemaService

This service helps keep track of information about different cryptocurrency exchanges, ensuring everything is structured correctly and consistently. It uses a special system to store this information in a safe and type-aware manner. 

You can add new exchanges using `addExchange()`, and retrieve existing ones by their name using `get()`. 

Before an exchange is added, a quick check (`validateShallow`) makes sure it has all the essential details.  If you need to update an existing exchange, the `override` method allows you to change just the parts that need modification. The service relies on several other internal tools to manage logging and storage.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for interacting with exchanges within the backtest-kit framework. It handles tasks like retrieving historical and future candle data, calculating average prices, and fetching order books. This service injects crucial information like the trading symbol, time, and whether the process is a backtest into the execution environment, ensuring consistency across operations.

The service also validates exchange configurations, remembers previous validations to speed things up, and provides formatted price and quantity representations. It provides methods to obtain aggregated trades, and raw candle data with configurable date and limit parameters. Essentially, it streamlines exchange-related actions while providing the context needed for both historical analysis (backtesting) and live trading.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently directs requests to the correct exchange implementation based on the context of your trading logic. 

This service keeps things efficient by remembering (caching) exchange connections to avoid repeatedly creating them, speeding up your backtesting or live trading processes. 

You can use it to retrieve historical price data (candles), fetch the latest candles relative to a specific time, get the average price (either from real-time data or by calculating it from historical data), and obtain order book information and aggregated trades. 

It also handles formatting prices and quantities to ensure they adhere to the specific rules and precision requirements of each exchange, crucial for order placement. The service intelligently routes all requests to the right exchange and provides logging for better transparency.

## Class DumpAdapter

The `DumpAdapter` helps you save information about your trading strategy, like messages, records, tables, and errors, in different formats and locations. It acts as a central point for managing how this data is stored, allowing you to easily change the storage method without modifying the core logic.

Initially, it defaults to saving data as individual markdown files. However, you can switch the storage to memory (for temporary storage), a dummy backend (to discard data entirely for testing), or even provide your own custom storage implementation.

Before you can start saving data, you need to "enable" the adapter. This registers it to listen for signal lifecycle events. When a signal is finished, the adapter cleans up any temporary data associated with it.  You can then "disable" it when you're done.

The adapter provides methods like `dumpAgentAnswer`, `dumpRecord`, `dumpTable`, `dumpText`, and `dumpJson` for saving different kinds of data.  You can also clear the adapter's internal cache, which is useful when the working directory changes during a trading strategy run. Using `useDumpAdapter` allows for maximum flexibility, enabling you to integrate custom dumping logic.

## Class ConstantUtils

The `ConstantUtils` class provides a set of predefined percentages that help manage take-profit and stop-loss levels in a trading strategy. These values are derived from the Kelly Criterion and incorporate a mechanism for gradually reducing risk. Think of them as incremental steps toward your overall profit target or a way to limit potential losses.

For instance, `TP_LEVEL1` represents the point where 30% of the distance to your final take-profit target has been reached, while `SL_LEVEL1` indicates an early warning for potential losses based on 40% of the distance to your stop-loss. Subsequent levels – `TP_LEVEL2`, `TP_LEVEL3`, `SL_LEVEL2` – offer progressively more conservative exits, helping to secure gains and minimize risk as the trade progresses. These constants allow you to structure your risk management in a systematic, mathematically-informed way.

## Class ConfigValidationService

The ConfigValidationService acts as a safety net for your trading configurations. It meticulously checks your settings to prevent errors and ensure your strategies have a chance to be profitable. 

It focuses on making sure things like slippage, fees, and profit margins are set correctly, ensuring they're all positive values.

The service also verifies that your take-profit settings are realistic, guaranteeing enough distance to cover trading costs.

Beyond percentages, it confirms other parameters like timeouts and candle request limits are also set appropriately with positive integer values. 

Essentially, it's designed to catch potential configuration mistakes before they impact your backtesting results.

## Class ColumnValidationService

The ColumnValidationService helps you ensure your column configurations are set up correctly and avoid errors. It acts as a safeguard to verify that each column definition adheres to specific rules.

Essentially, it checks your column setups for essential elements like a unique key, a descriptive label, a formatting function, and visibility control.

It makes sure these keys and labels are properly formatted as strings, that the formatting and visibility elements are actually functions, and that each key is unique within its group. 

The `validate` method performs this entire check on all your column configurations at once.

## Class ClientSizing

The ClientSizing class helps determine how much of an asset to trade, acting as the brains behind position sizing. It offers flexibility with various sizing approaches like fixed percentages, Kelly Criterion, and using Average True Range (ATR). You can set limits on minimum and maximum position sizes, as well as a maximum percentage of your capital to risk.

It’s designed to be easily customized with callbacks that allow you to validate sizing decisions or track sizing activity. The `calculate` method is the core of the class, taking input data and returning the calculated position size. This class is a key component in the backtest-kit framework, used during strategy execution to ensure well-managed trades.

## Class ClientRisk

ClientRisk helps manage risk across your entire portfolio, preventing trades that could violate your pre-defined limits. It’s designed to work at the portfolio level, analyzing the combined impact of multiple trading strategies.

This framework keeps track of all active positions, regardless of which strategy opened them, allowing for a comprehensive view of your risk exposure. It’s particularly useful for limiting the maximum number of positions you hold simultaneously.

ClientRisk also allows you to define your own custom risk checks, accessing details about all your current positions to ensure any new trading signals align with your specific risk rules. It ensures that signals are only executed if they pass these risk checks.

Think of it as a safety net for your trading, preventing unintended consequences from multiple strategies acting independently. The system automatically saves and loads positions to manage the data and simplifies integrating new strategies into your portfolio.

Here’s what you can do with it:

*   **Track Active Positions:**  It automatically knows what positions are open across all your trading strategies.
*   **Define Limits:**  Control how many positions you hold.
*   **Custom Risk Checks:**  Add your own rules for when a trade is allowed.
*   **Cross-Strategy Analysis:**  See the overall risk picture, considering how multiple strategies interact.
*   **Automated Persistence:** Manages saving and loading position data.



To add a new signal, use `addSignal` to register when a position is opened. Use `removeSignal` to notify the system when a position has been closed.

## Class ClientFrame

The ClientFrame component is responsible for creating the timelines used during backtesting. Think of it as the engine that produces the sequence of timestamps representing historical data.

It's designed to avoid unnecessary work by caching generated timelines, so it doesn't recalculate them repeatedly.

You can customize the spacing between timestamps – from one-minute intervals to three-day gaps – depending on the granularity of your backtest.

The ClientFrame also lets you hook into the process to verify the data or record events as the timelines are created.

This component works closely with the core backtesting logic, providing the foundational timeline for analysis.



The `getTimeframe` property is the main way to get a timeline.  It takes a symbol (like a stock ticker) and returns a promise that resolves to an array of dates representing the timeframe for backtesting that symbol. Because it utilizes a "singleshot" approach, the results are cached for future use.

## Class ClientExchange

This class, `ClientExchange`, acts as a bridge to get data from an exchange, designed for backtesting trading strategies. It's built for efficiency, reusing code where possible.

It lets you retrieve historical and future candle data (price charts), which is essential for analyzing past performance and predicting future movements.  You can also calculate the Volume Weighted Average Price (VWAP) to gauge the average price based on trading volume.

The class offers convenient functions to format quantities and prices, ensuring they adhere to the specific rules of the exchange you're using. It also provides a way to fetch order book data and aggregated trades.

When retrieving candles, it takes care to align timestamps correctly to ensure accurate data and prevent "looking into the future" which would invalidate a backtest.  It’s flexible with how you specify date ranges for candle retrieval, and includes checks to prevent errors.



Finally, the `getAggregatedTrades` method efficiently retrieves trade data, aligning timestamps to prevent look-ahead bias and handling different pagination strategies.

## Class ClientAction

The `ClientAction` component manages the execution of custom action handlers, which are essential for extending the framework's capabilities. Think of it as a central hub for connecting your own logic to the trading process. It handles setting up the action handler, making sure it's initialized just once, and then routes different types of events to the handler, like signals from live trading, backtesting, or breakeven/profit/loss levels. 

You can use action handlers to integrate things like state management libraries (Redux, MobX), log trading activity, send notifications (Telegram, Discord), or track performance metrics. 

Importantly, `ClientAction` takes care of cleaning up resources when the handler is no longer needed, ensuring a clean and stable environment. The `signalSync` method provides a specific gateway for managing position openings and closings through limit orders, and is designed to directly pass any errors encountered during the process.

## Class CacheUtils

CacheUtils provides tools to automatically cache the results of your functions, making your backtesting more efficient. It's designed to avoid redundant calculations by storing and reusing previously computed values.

You can use `fn` to wrap regular functions and `file` to wrap asynchronous functions, both based on timeframe intervals. The `file` option additionally persists cached results to disk, improving performance for frequently used asynchronous operations. Each wrapped function gets its own dedicated cache, preventing conflicts between different strategies or exchanges.

To free up memory and data, you can use `dispose` to remove a specific function's cache, or `clear` to completely wipe out all cached data, which is helpful when your working directory changes.  Think of `clear` as a way to reset the caching system to its initial state.

## Class BrokerBase

This class provides a foundational structure for connecting your trading strategy to real exchanges. Think of it as a template you customize to interact with a specific brokerage. It's designed to simplify the process of placing orders, managing stop-loss and take-profit levels, tracking positions, and sending notifications.

The framework provides default "no-op" implementations for all common trading actions, which means you only need to override the methods relevant to your brokerage’s specific functionality. You'll use this to manage things like placing orders (both market and limit), updating stop-losses, and tracking positions. 

The lifecycle begins with an initialization step (`waitForInit`) where you'll connect to your exchange and authenticate. Then, as your strategy runs, it calls different methods - `onSignalOpenCommit` to open a position, `onSignalCloseCommit` to close it, and several others for managing partial profits, losses, trailing stops, and average buy entries.  All these actions are automatically logged, making debugging and monitoring easier.

Essentially, this class lets you focus on the trading logic, while the framework handles the complexities of interacting with an external broker. It provides a consistent way to manage your trades regardless of the specific exchange you're using.

## Class BrokerAdapter

The `BrokerAdapter` acts as a middleman between your trading logic and your actual brokerage. It’s designed to make sure that any actions you want to perform, like sending signals or adjusting stop losses, are handled safely and consistently, whether you're testing strategies or trading live.

Think of it as a checkpoint; before any changes are made to your core trading data, the `BrokerAdapter` gets a chance to step in. This is crucial because if something goes wrong during that process, the changes are automatically rolled back, keeping your system in a known state.

When you’re backtesting, the `BrokerAdapter` quietly sits out—it doesn't actually communicate with a real brokerage. However, when you're trading live, it routes these actions to your configured brokerage connection. The `BrokerAdapter` handles events like signal openings and closures, partial profit and loss adjustments, trailing stops and take profits, breakeven orders, and average buy entries, intercepting each action before they impact your core data.

You need to tell the `BrokerAdapter` which brokerage to work with by registering an instance or its constructor using `useBrokerAdapter` before you activate it with `enable`.  `enable` subscribes to a system that automatically handles signal events. You can later deactivate it and reset the system using `disable` or `clear` as needed. The `clear` function is particularly useful when your environment changes, like when the working directory updates, to ensure you’re using a fresh broker instance.

## Class BreakevenUtils

The BreakevenUtils class helps you analyze and understand your breakeven performance. It's like a central place to gather information about when your strategies hit breakeven points.

It provides a way to get statistical summaries of breakeven events, showing you things like the total number of times a strategy reached breakeven.

You can also generate detailed reports in Markdown format, which includes tables listing individual breakeven events with key details like the symbol, strategy used, entry price, and the price at which breakeven was achieved.

Finally, it allows you to save these reports as Markdown files directly to your computer, making it easy to share or archive your breakeven analysis. It organizes the reports neatly by symbol and strategy name. The whole process involves listening to event data and storing it for analysis.

## Class BreakevenReportService

The BreakevenReportService helps you keep track of when your trading signals reach their breakeven point. It's designed to automatically record these events, along with details about the signal, and save them to a database.

Think of it as a dedicated recorder for those crucial moments in your backtesting process.

To use it, you'll subscribe to a signal emitter to receive updates about breakeven events. You can then unsubscribe later to stop receiving those updates.

The service also includes a logger to help you debug and understand what’s happening. It uses a special mechanism to ensure you don’t accidentally subscribe multiple times.


## Class BreakevenMarkdownService

The BreakevenMarkdownService is designed to automatically create and save reports detailing breakeven events for your trading strategies. It keeps track of these events for each symbol and strategy you're using, generating clear, readable markdown tables.

This service listens for breakeven signals, organizes them, and provides summaries including the total number of breakeven events. It then saves these reports to your computer in a structured directory.

You can subscribe to receive these breakeven signals and unsubscribe when you no longer need them. The service also allows you to retrieve specific data, generate reports, or clear accumulated data. If you need to generate a report for a particular symbol and strategy, the service takes care of creating it, saving it, and giving you the statistics.


## Class BreakevenGlobalService

The BreakevenGlobalService acts as a central hub for managing breakeven calculations within the trading system. It's designed to be a single point of access for the core trading strategy, receiving instructions and then passing them on to the underlying connection service. Think of it as a gatekeeper that also keeps a record of all breakeven related actions.

It's injected into the trading strategy, so it's always available when needed. The service doesn't actually *do* the calculations itself; instead, it forwards those tasks to another service while adding important logging to monitor what's happening.

Several validation services are also integrated, ensuring that strategies, risks, exchanges, and frames are all correctly configured before any breakeven checks are performed.

The `validate` function provides a quick check to confirm strategy and risk settings. The `check` function determines if a breakeven event should happen, and the `clear` function resets the state when a signal is closed, all while maintaining detailed logs.

## Class BreakevenConnectionService

The BreakevenConnectionService helps track and manage breakeven points for trading signals. It’s designed to efficiently handle multiple signals by creating and caching breakeven data, ensuring a single breakeven instance exists for each signal ID.

This service acts as a central point for creating and managing these instances, providing them with necessary tools like logging and event handling. It works closely with the ClientStrategy, providing a streamlined way to check for and clear breakeven conditions. 

Essentially, it’s responsible for making sure the breakeven calculations are done, events are triggered, and resources are cleaned up properly for each signal, all while keeping things efficient through caching. If a signal closes, the service takes care of clearing the breakeven state and removing the associated data.

## Class BacktestUtils

This utility class provides helpful tools for running and analyzing backtests within the trading framework. It simplifies interactions with the backtest engine, logging operations, and retrieving key data about strategy performance.

You can easily start a backtest for a specific symbol and configuration using the `run` method, or execute it in the background with `background` to avoid blocking the main process.  Need to grab a signal?  `getPendingSignal` and `getScheduledSignal` help with that.

For insights into existing positions, functions like `getTotalPercentClosed`, `getTotalCostClosed`, and `getBreakeven` offer details about current holdings and potential breakeven points.  You can also query for various position attributes using methods like `getPositionInvestedCount` and `getPositionPnlPercent`.

`stop` halts a backtest, while `commitCancelScheduled` and `commitClosePending` allow manual intervention during the backtest process. Convenient functions like `commitAverageBuy` and `commitTrailingStop` help manage position adjustments. Finally, `getData` and `getReport` help with analysis after a backtest completes.



The `_getInstance` property ensures that each symbol-strategy combination has its own isolated backtest instance, preventing conflicts.

## Class BacktestReportService

The BacktestReportService helps you keep a record of what's happening during your backtests. It listens for signals from your trading strategy – when it’s waiting, opening a position, actively trading, or closing a position – and saves these details. Think of it as a detailed logbook for your backtest.

It uses a special logging system and stores all the information about each tick event in a database. This lets you examine your strategy’s behavior later on to find areas for improvement.

To make sure things don’t get messy, it ensures that it only listens for these signals once.

You can start listening for events using the `subscribe` function, which will return a way to stop listening later.  The `unsubscribe` function conveniently handles stopping those events. If it's not already listening, calling `unsubscribe` won't cause any problems.


## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save detailed reports about your backtesting results. It works by listening for trading signals as they happen during a backtest. 

It keeps track of closed trades for each strategy, using a clever system to store this data separately for each symbol, strategy, exchange, timeframe, and backtest run. This ensures your reports are organized and easy to understand.

You can request data or generate markdown reports summarizing the performance of a particular strategy on a specific symbol. The service automatically saves these reports as markdown files to your logs directory, making it simple to review and share your backtesting findings.

The service also provides ways to clear out old data and to subscribe to and unsubscribe from backtest events. It ensures that you’re only processing closed trades and keeps things tidy.

## Class BacktestLogicPublicService

The BacktestLogicPublicService helps you run backtests in a straightforward way. It handles the complexities of managing context, like the strategy name, exchange, and frame, so you don't have to pass them around manually.

Think of it as a helper that simplifies your backtesting code.

It uses a private service underneath, but it exposes a public interface to make things easier.

The `run` method is the core of this service. It takes a symbol and runs the backtest, automatically injecting the context needed for functions like fetching historical data or generating signals. The backtest results (signals) are streamed back to you as an asynchronous generator.


## Class BacktestLogicPrivateService

The BacktestLogicPrivateService helps orchestrate the backtesting process, particularly when dealing with lots of data. It works by first obtaining the timeframes you need, then stepping through them one by one.

When a trading signal appears (like a buy or sell indication), it fetches the necessary historical price data (candles) and runs the backtest calculations for that specific signal. The service keeps track of open signals and skips over timeframes until those signals are closed.

Importantly, it delivers the results of the backtest—like whether a trade was profitable or not—as a stream of data, rather than storing everything in memory at once. This makes it much more efficient for handling large datasets. You can also stop the backtest early if needed.

The service relies on several other core services like the StrategyCoreService, ExchangeCoreService, and FrameCoreService to handle the actual backtesting logic, data retrieval, and timeframe management. To start a backtest for a specific stock ticker symbol, you use the `run` method which generates a sequence of results showing the outcome of each trade.

## Class BacktestCommandService

This service acts as a central point for running backtests within the backtest-kit framework. Think of it as the main entry point to start a backtest.

It bundles together several supporting services to handle things like validating your strategy and the data it's using.

The core function, `run`, is how you initiate a backtest, specifying the trading symbol and details about the strategy, exchange, and data frame being used.  It returns a sequence of results representing what would have happened for each tick during the backtest period, including orders opened, closed, and cancelled. Essentially, it's your gateway to seeing how a strategy would have performed historically.

## Class ActionValidationService

The ActionValidationService helps you keep track of and confirm that your action handlers are properly set up and available. Think of it as a central manager for your actions, ensuring things don’t break when you try to use them.

It lets you register new actions, providing details about their structure.  You can then use it to double-check that a particular action is actually registered before you try to execute it. 

To make things fast, the service remembers the results of these checks (memoization), so it doesn’t have to repeatedly validate the same actions.

Finally, you can get a full list of all the actions you've registered to see everything you're working with.


## Class ActionSchemaService

The ActionSchemaService is responsible for managing and organizing the definitions of actions within your trading system. It acts like a central library for action schemas, ensuring they are correctly structured and validated.

It uses a type-safe registry to store these action schemas, and it checks that the methods used within your action handlers are valid according to predefined rules. This helps prevent errors and makes sure your actions behave as expected.

You can register new actions, update existing ones by making small changes without a full re-registration, and retrieve existing action configurations whenever needed. The service helps keep things organized and reliable, especially when your system needs to execute actions based on these schemas. It validates the structure of the schema, verifies that the methods are allowed, and manages private method support.

## Class ActionProxy

The `ActionProxy` acts like a safety net around your custom trading logic. It’s designed to prevent errors in your code from crashing the entire trading system. Think of it as a wrapper that automatically catches errors when your action handlers (like `init`, `signal`, `breakevenAvailable`, etc.) are executed.

If an error occurs within any of those handlers, the `ActionProxy` logs it, sends it to an error reporting system, and then continues execution—it won't abruptly stop the process. This is particularly useful because your action handlers might be missing methods, or have unexpected issues; the `ActionProxy` gracefully handles those situations.

You don't directly create `ActionProxy` instances; they are created via `fromInstance`, which takes your user-defined action handlers and wraps them in this protective layer.  There's one method, `signalSync`, that isn't wrapped – errors there are passed through to another part of the system.  Essentially, it’s a framework component that ensures your custom trading logic runs as smoothly as possible.


## Class ActionCoreService

The ActionCoreService acts as a central hub for managing and executing actions within your trading strategies. It essentially takes the instructions defined in your strategy's schema and makes sure they're handled correctly.

Think of it as a traffic controller, ensuring that events like new signals, breakeven points, or risk rejections are properly distributed to the appropriate actions.

Here's a breakdown of what it does:

*   **Action Management:** It reads the list of actions from your strategy's schema.
*   **Validation:** It meticulously checks that your strategy's setup—the strategy name, exchange, frame—and any related configurations (like risks and actions) are all valid.  This avoids errors later on.
*   **Event Routing:**  It directs various events (signals, profits, losses, pings, etc.) to the corresponding action handlers. Each event type has its own dedicated function (e.g., `signal`, `breakevenAvailable`).
*   **Initialization & Cleanup:** It's responsible for setting up (initializing) actions at the beginning and cleaning them up (disposing) at the end of a strategy execution.
*   **Synchronization:** `signalSync` provides a way to coordinate actions across your strategy, ensuring they all agree before proceeding.
*   **Data Clearing:** The `clear` function allows you to reset action data, either for a specific action or all actions.



It’s a crucial component, working behind the scenes to make your strategies run smoothly and reliably.

## Class ActionConnectionService

This service acts as a central hub for handling actions within your trading strategies. It takes an action name and intelligently routes it to the correct implementation, ensuring the right logic runs for each action. To improve performance, it remembers (caches) these implementations so it doesn't have to recreate them every time.

It’s designed to work with various events like signals, breakeven points, and scheduled pings, directing each one to the appropriate action handler.  The caching is very specific; it considers the strategy, exchange, and frame to make sure the correct action is used for a particular setup.

You can clear the cache if you need to, which can be useful in certain situations. The `initFn` method prepares the action for use, loading any necessary data. Finally, when an action is no longer needed, `dispose` cleans it up.

## Class ActionBase

This class, `ActionBase`, is designed to help you build custom extensions for your trading strategies within the backtest-kit framework. Think of it as a starting point for adding your own logic – like sending notifications, tracking performance, or connecting to external systems. It takes care of the basic event logging for you, so you don't have to write that repetitive code each time.

When you extend this class, you'll have access to key information about the strategy's name, the timeframe, and the specific action being triggered.

The lifecycle of an action handler involves initialization (`init`), responding to various events like signal generation (`signal`, `signalLive`, `signalBacktest`), profit/loss milestones (`partialProfitAvailable`, `partialLossAvailable`), and cleanup (`dispose`). Each event type provides a default implementation, logging what's happening, which you can override with your custom code. For example, you can use `signalLive` to send notifications when a trade is opened in a live environment, or `signalBacktest` to collect metrics during backtesting. The `dispose` method ensures that resources are released when the strategy is complete. Essentially, it simplifies adding custom behavior to your trading strategies.

