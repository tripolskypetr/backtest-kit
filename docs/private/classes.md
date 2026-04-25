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

The Walker Validation Service helps you keep track of and verify your parameter sweep setups, often used for optimizing trading strategies or tuning hyperparameters. Think of it as a central place to register your different sweep configurations and make sure they're valid before you run them. 

It's designed to be efficient, remembering past validation checks so it doesn't have to repeat work unnecessarily.

You can add new parameter sweep configurations using `addWalker`. To make sure a configuration exists before starting a backtest or optimization, use `validate`. Finally, `list` allows you to see all the parameter sweep configurations you've registered. 

The service keeps a record of all your defined parameter sweeps and ensures they are correctly configured before use, improving reliability and performance.


## Class WalkerUtils

WalkerUtils simplifies working with walkers, which are essentially automated trading systems. It provides an easy way to run and manage these systems, automatically handling details like which exchange and data to use.

Think of it as a central place to control your walkers. It's designed so you only need one instance of it, making it simple to use throughout your application.

Here's a breakdown of what you can do with WalkerUtils:

*   **Run walkers:** Easily start walkers for a specific trading symbol, passing along any extra information they need.
*   **Run walkers in the background:**  Execute walkers without constantly checking for updates, which is helpful for tasks like logging or triggering other actions.
*   **Stop walkers:**  Halt a walker's signal generation process. This will stop any new trading signals from being generated, but existing signals will complete.
*   **Get walker results:** Retrieve data from all the strategies involved in a walker.
*   **Generate reports:** Create readable reports summarizing the walker's performance.
*   **Save reports:** Save those reports directly to your file system.
*   **List active walkers:** See a list of all running walkers and their status (like pending, completed, or rejected).

WalkerUtils manages each walker based on the trading symbol and the specific walker configuration, ensuring they operate independently.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of and manage different schema definitions for your "walkers" – essentially, blueprints for automated trading strategies. It uses a special system to ensure the schemas are stored safely and consistently.

You can add new schema definitions using the `addWalker` function, and then find them again later by their assigned names. The service also checks new schemas to make sure they have all the necessary parts before adding them.

If a schema already exists, you can update it with new information. You can get a specific schema definition by providing its name to the `get` method.

## Class WalkerReportService

WalkerReportService helps you keep track of your trading strategy optimization efforts. It's designed to capture the results of a walker, which is a system for automatically testing different strategy parameters.

Essentially, it listens for updates as your walker runs, recording key information about each test, including performance metrics. This makes it much easier to see how different parameter combinations affect your strategy’s performance.

You can think of it as a detailed logbook for your optimization process.

To use it, you subscribe to receive updates from the walker, and the service handles the logging to a database. When you're done, you can unsubscribe to stop receiving those updates. It ensures you don't accidentally subscribe multiple times, which could lead to confusion. 

The service uses a logger to provide helpful debugging information as well.

## Class WalkerMarkdownService

The WalkerMarkdownService helps you automatically create and save detailed reports about your trading strategies as they're being tested. It listens for updates from your trading simulations and keeps track of the results for each strategy.

It generates nicely formatted markdown tables that make it easy to compare different strategies side-by-side. These reports are saved as files, typically in a `logs/walker` directory, so you have a permanent record of your backtesting process.

You can subscribe to receive progress updates during the simulation, and unsubscribe when you're done. The service handles storing the results for each strategy individually, so you don't have to worry about managing data manually. It also allows you to clear the data if you want to start fresh.

The `dump` function allows you to save the report, optionally specifying a custom file path. The whole process is designed to be automated, minimizing manual effort and providing clear, organized reports for analysis.

## Class WalkerLogicPublicService

This service helps manage and run "walkers," which are essentially automated trading processes. It builds upon a private service to make sure information like the strategy being used, the exchange involved, the frame of reference, and the walker's name are automatically passed along.

Think of it as a coordinator that makes sure everything needed for a walker to execute is readily available.

It has a `run` method that’s the main way to get things going. You provide a symbol (like a stock ticker) and some context information, and it starts the walker comparison process – essentially running backtests for different strategies. The result is an asynchronous generator that produces walker results.

## Class WalkerLogicPrivateService

WalkerLogicPrivateService helps you compare different trading strategies. It works by running each strategy one after another and giving you updates as they finish. 

The service keeps track of the best performing strategy as it goes, and finally provides you with a ranked list of all strategies tested. 

It uses other services internally, such as BacktestLogicPublicService, to actually execute the strategies.

The `run` method is how you start the comparison process, specifying the trading symbol, the strategies you want to compare, the metric you'll use to judge them, and some context information like the exchange and frame names. You'll receive results incrementally as each strategy concludes.

## Class WalkerCommandService

The WalkerCommandService acts as a central point to interact with walker functionality within the system. It's designed to be easily used in different parts of the application and makes sure different services work together.

It relies on several underlying services like `walkerLogicPublicService`, `walkerSchemaService`, and validation services to handle the complex tasks of running and validating walkers.

The key function is `run`, which executes a comparison of walkers for a given symbol, while also passing along important information like the walker's name, the exchange it's connected to, and the frame it uses. This allows the walker process to operate within a specific, defined environment.


## Class TimeMetaService

The TimeMetaService helps you reliably get the current candle timestamp, even when you're not actively running a trading tick. It keeps track of the latest timestamp for each symbol, trading strategy, exchange, and timeframe combination.

Think of it as a memory bank for candle times, updated automatically after each tick.

If you need the timestamp outside of a typical trading execution, like when triggering a command between ticks, this service provides a convenient and accurate way to get it. It will wait a short time if the timestamp isn't immediately available.

You can clear the memory to release resources and ensure you’re using fresh data. This is important to do when starting a new backtest or live trading session to prevent outdated information from affecting results. It’s automatically managed by the backtest, live, or walker system, but you can also manually clear individual entries or all entries if needed.

## Class SystemUtils

The `SystemUtils` class helps keep backtest sessions separate and prevents one session from accidentally messing with another. It does this by temporarily pausing the connections to global event buses.

Think of it like creating a clean slate for each backtest.

The `createSnapshot` method is particularly useful. It essentially takes a picture of the current connections to those global event buses – clearing them out temporarily so a backtest can run without interference. Afterwards, you can use the snapshot to put everything back exactly as it was before.

## Class SyncUtils

The SyncUtils class helps you understand what’s happening during your trading signals by providing data and reports about signal synchronization. It gathers information about signal openings and closings, tracking things like the total number of events, how many signals were opened, and how many were closed.

You can use it to get statistical summaries of your trading activity or generate detailed markdown reports. These reports can be exported to files, creating a handy record of your signal events.

The reports themselves include tables with information about each signal, such as its direction, price levels, profit and loss, and timestamps. This makes it easy to review and analyze your trading performance. The class creates reports for specific symbols, strategies, exchanges and frames, allowing for focused analysis.

## Class SyncReportService

The SyncReportService helps you keep a detailed record of what's happening with your trading signals. It tracks when signals are created (when orders are filled) and when they’re closed (when positions are exited).

Think of it as a logging system that captures all the important lifecycle events of a signal.

It listens for these events, records them with relevant information – like profit/loss when a position closes – and stores them for later review. This makes it easier to audit and understand your trading activity.

You subscribe to get the signal events, and when you're done, you unsubscribe to stop receiving them. The system ensures you don't accidentally subscribe multiple times.

## Class SyncMarkdownService

The `SyncMarkdownService` is responsible for creating and saving reports detailing the lifecycle of trading signals. It keeps track of signal events like openings and closures for each symbol, strategy, exchange, and timeframe used in backtests.

It listens for signal events and organizes them, then generates nicely formatted markdown reports that include a table of signal activity and summary statistics. You can retrieve these statistics or the entire report for a specific combination of symbol, strategy, exchange, and timeframe.

You can subscribe to receive these events, and when you’re done, it's important to unsubscribe to clean up resources.  The service also has methods to clear accumulated data, either for a specific combination or for everything. Finally, it can write reports directly to disk, creating files with names that reflect the symbol, strategy, exchange, timeframe, and whether it was a backtest or live signal.

## Class StrategyValidationService

The StrategyValidationService helps you keep track of your trading strategies and make sure they're set up correctly. It acts like a central manager for all your strategy configurations, ensuring each one exists and that any related risk profiles or actions are also valid. 

Think of it as a registry where you can add new strategies using `addStrategy`.  It provides a `validate` function to check that your strategy and its components are sound.

You can also easily see all the strategies you've registered with the `list` function. To make things efficient, the service remembers the results of validations so it doesn't have to repeat the same checks over and over.

The service relies on other services, `loggerService`, `riskValidationService`, and `actionValidationService`, to provide logging and validation for related components. It uses an internal `_strategyMap` to store and manage strategy schemas.

## Class StrategyUtils

StrategyUtils helps you analyze and report on how your trading strategies are performing. It's like a central place to gather information about what your strategies are doing, like when they're closing positions, taking profits, or setting stop-loss orders.

You can ask it for statistical summaries of events – how many times a strategy took profits versus how many times it trailed a stop, for instance.

It can also build detailed reports in a readable markdown format. These reports show a table of all the actions taken by a specific strategy for a particular market, providing details like the price, percentages, and timestamps of each event.  You can customize which details appear in the table.

Finally, you can have it automatically save those reports as files on your computer, making it easy to track performance over time. The filenames are structured to easily identify which symbol, strategy, exchange, and timeframe the report represents.

## Class StrategySchemaService

The StrategySchemaService acts as a central place to store and manage different strategy schema definitions. It uses a special type-safe system for keeping track of these schemas, making sure everything is organized and consistent. 

You can add new strategy schemas using the `addStrategy()`-like function, and then easily find them again by their names. Before a strategy is added, a quick check makes sure it has all the necessary parts and the correct types. 

If a strategy already exists, you can update parts of it using the `override()` function.  Finally, the `get()` function lets you retrieve a specific strategy schema when you need it.

## Class StrategyReportService

This service helps you keep a detailed record of what your trading strategy is doing. Think of it as a meticulous auditor, logging every significant event like canceling a scheduled trade, closing a pending order, or adjusting stop-loss levels.

To start using it, you need to "subscribe" to its logging capabilities. Once subscribed, it automatically records events like partial profit and loss, trailing stop adjustments, and breakeven movements as separate JSON files. This is really useful if you want an easily auditable trail of your strategy’s actions.

The service differs from other reporting methods because it writes these logs immediately as they happen, rather than collecting them in memory first. 

When you're finished with the logging, you need to "unsubscribe" to stop the process. You can call this multiple times without any problems; it will only clear the subscription if one exists. 

The service also provides functions for logging more specific actions like average buy events for dollar-cost averaging strategies and signals when a scheduled trade is activated early. The service uses a logger to record events, providing helpful context around each log entry.

## Class StrategyMarkdownService

This service helps you track and analyze your trading strategy's performance. It acts as a collector, gathering details about various events like order cancellations, position closures, and profit-taking actions. Instead of saving each event immediately, it holds them temporarily for more efficient processing.

Think of it as a temporary notepad for your strategy, allowing you to generate comprehensive reports and export them as markdown files.

Here's what it does:

*   **Event Tracking:** It records things like when an order is cancelled, when a position is closed for a profit or loss, or when stop-loss levels are adjusted.
*   **Statistics:** It can calculate how many times specific actions occur, giving you insights into your strategy's behavior.
*   **Report Generation:**  It creates readable reports with customizable columns, summarizing your strategy’s performance.
*   **File Export:** You can easily save these reports to files.
*   **Memory Management:** It’s designed to efficiently manage the collected data, avoiding excessive disk writes.

To use it, you first need to "subscribe" to start collecting events, and then "unsubscribe" to stop and clean up. The `getData()` method lets you retrieve the raw data, `getReport()` generates a formatted report, and `dump()` saves the report to a file. You can also clear out the collected data if needed. It also provides functions for tracking specific events, like early activation of signals or average buy entries.

## Class StrategyCoreService

This class, `StrategyCoreService`, acts as a central hub for managing trading strategies, handling a lot of the behind-the-scenes work. It's designed to be used internally by other services, combining validation and data retrieval related to strategies and their execution.

It provides methods to validate strategies, retrieve data about pending signals (like the current position), and perform actions like closing positions or stopping a strategy.  Many of these methods handle calculations like total cost, position PnL, and DCA accounting, ensuring accurate reporting even with complex trading scenarios.

You'll find functions here for getting details about a position’s lifecycle – its profit history, drawdown, and how long it’s been active. It also offers ways to adjust positions, such as setting breakeven or partial profits/losses. Finally, it facilitates actions like disposing of strategies and cancelling scheduled orders.  Essentially, it’s a toolkit for managing and inspecting the status and history of a running trading strategy.

## Class StrategyConnectionService

The `StrategyConnectionService` acts as a central router for managing trading strategies within the backtest-kit framework. It’s responsible for ensuring that trading actions (like placing orders, calculating P&L) are directed to the correct strategy implementation based on a combination of the trading symbol, strategy name, and exchange information. To optimize performance, it caches these strategy implementations, retrieving them from memory when possible instead of recreating them.

The service is equipped with various helper methods to retrieve information about a trading strategy’s state, like the current pending signal, total percentage closed, cost basis, and position levels. These methods allow for detailed monitoring and analysis of a strategy's performance. It also includes methods for interacting with the strategy directly, such as executing a tick, backtesting against historical data, and stopping a strategy from generating new signals.

The service supports both live trading (`tick`) and historical backtesting (`backtest`) and provides functionalities for managing scheduled signals, partial profits/losses, trailing stops/takes, and breakeven adjustments. Effectively, it provides a consistent interface for interacting with and managing trading strategies within the broader backtesting system.

## Class StorageLiveAdapter

The `StorageLiveAdapter` provides a flexible way to manage and store trading signals during backtesting and live trading. It acts as a middleman, allowing you to easily switch between different storage methods without changing the core logic of your trading strategy.

You can choose between persistent storage (saving data to disk), in-memory storage (keeping data only in RAM), or a dummy adapter (for testing without actually saving anything). The adapter uses the default persistent storage unless you specify otherwise.

The adapter handles various events like signals being opened, closed, scheduled, or cancelled, and also provides ways to find signals by ID and list all signals. It also deals with ping events for active and scheduled signals, updating the `updatedAt` timestamp.

Changing the storage method is straightforward using functions like `useDummy`, `usePersist`, `useMemory`, or `useStorageAdapter` to completely customize how signals are stored. The `clear` function resets the storage to the default persistent adapter, which is useful when the working directory changes.

## Class StorageBacktestAdapter

The `StorageBacktestAdapter` provides a flexible way to manage how trading signals are stored during backtesting. It lets you choose different storage methods—like persistent storage to disk, in-memory storage, or even a dummy adapter for testing—without changing the core backtesting logic. 

You can easily switch between these storage options using methods like `usePersist()`, `useMemory()`, and `useDummy()`.  The adapter handles events such as signals being opened, closed, scheduled, or cancelled, and provides ways to find signals by ID or list all signals. 

It includes internal mechanisms for updating signal timestamps based on active and schedule pings, ensuring the data stays consistent. The `clear()` method is useful for resetting the storage to the default in-memory adapter when needed, especially if the working directory changes during backtesting iterations. It’s designed to be easily swapped out with custom storage implementations if you have specific needs.

## Class StorageAdapter

The StorageAdapter is your central hub for managing both historical backtest data and real-time trading signals. It automatically keeps track of incoming signals, ensuring that both backtest and live signals are readily accessible.

To start using it, you’ll enable the adapter to begin subscribing to signal sources. A key feature prevents accidental duplicate subscriptions to those sources.

You can easily retrieve a single signal by its ID, or list all signals, either specifically for backtesting or for live trading.  It's also safe to disable and re-enable the adapter as needed to control its activity.

## Class StateLiveAdapter

The `StateLiveAdapter` helps manage and track the state of your trading strategies, especially for complex scenarios like those driven by large language models (LLMs). It's designed to be flexible, allowing you to easily switch between different ways of storing that state – whether it's in memory for quick testing, on disk for persistence across restarts, or a dummy adapter to ignore changes.

Think of it as a central place where your strategy keeps track of important information like how much a trade has gained or lost and how long it’s been open. This information can then be used by an LLM to make decisions about whether to hold or exit a trade. 

It uses a "plug and play" approach, so you can swap out the storage backend without rewriting your core trading logic. The default storage keeps data safely on your hard drive, meaning your state is preserved even if your program restarts.

Here's a breakdown of what you can do with it:

*   **Change how state is stored:** Easily switch between in-memory storage, persistent file-based storage, or a dummy storage for testing.
*   **Manage signal states:** Get and update the state associated with specific signals, enabling complex rule evaluation.
*   **Clean up memory:** The `disposeSignal` function automatically clears state information when a signal is finished.
*   **Clear the cache:** If your base directory changes (like when your strategy needs to reload), use `clear` to force it to create new state instances.



Essentially, `StateLiveAdapter` acts as a reliable and adaptable system for keeping track of and managing the evolving state of your trading strategies.

## Class StateBacktestAdapter

The `StateBacktestAdapter` is a flexible system for managing the data that drives your backtests. It allows you to easily swap out different storage methods for your data – whether that's keeping it in memory for speed, saving it to a file for persistence, or using a dummy adapter for testing.

You can choose between several pre-built storage options: a simple in-memory store, a persistent file-based store, or a dummy store that ignores all changes. The adapter also allows you to define a custom storage solution if needed.

The system is designed to track important metrics for each trading signal, like the highest percentage gain and how long a position has been open. This data is essential for implementing rules, such as automatically exiting trades if they don't meet certain performance criteria over a specific period.

Important functions include `disposeSignal` which cleans up old data associated with a signal when it’s finished, and `getState` and `setState` which handle reading and updating the state data. You can use `useLocal`, `usePersist`, and `useDummy` to quickly switch between storage backends, and `useStateAdapter` allows for a custom implementation.  The `clear` method ensures data is refreshed when the working directory changes.

## Class StateAdapter

The StateAdapter acts as a central hub for managing both backtesting and live trading states. It's designed to keep things clean and prevent issues caused by outdated data.

It automatically handles subscribing to and unsubscribing from lifecycle events, ensuring resources are released when they’re no longer needed. It intelligently directs state-related operations to either the backtest environment or the live environment based on the specific configuration.

To start managing state, you’ll use the `enable` property to trigger the subscription.  Conversely, the `disable` method allows you to stop the subscription.  You can call `disable` safely, even if it's already been called once.

The `getState` method is how you retrieve the current state value associated with a specific signal, while `setState` is used to update those values. The adapter makes sure the request goes to the correct environment – backtest or live – based on your instructions.

## Class SizingValidationService

This service helps you keep track of and make sure your position sizing strategies are set up correctly. It acts like a central place to register all your sizing methods, like fixed percentages or Kelly Criterion approaches. 

Before you try to use a sizing strategy, this service verifies it exists, preventing errors and making your backtesting more reliable. To speed things up, it remembers the results of these checks so it doesn't have to re-validate strategies repeatedly. 

You can use `addSizing` to register new strategies, `validate` to double-check that a strategy is ready to use, and `list` to see all the strategies you’ve registered. This makes managing your sizing configurations much easier and more organized.


## Class SizingSchemaService

The SizingSchemaService helps you keep track of your sizing schemas in a reliable and type-safe way. It uses a special registry to store these schemas, ensuring they are consistent and well-defined.

You can add new sizing schemas using the `register` method, giving each one a unique name. If a sizing schema already exists, you can update it using the `override` method, which lets you change specific parts of it.

Need to use a sizing schema in your strategy? Simply grab it by its name using the `get` method. The service also has built-in checks to make sure new sizing schemas are correctly formatted before they're stored.

## Class SizingGlobalService

The SizingGlobalService helps determine how much of an asset to trade. 

It acts as a central point for calculating position sizes, using a connection service to handle the underlying math. Think of it as the engine that decides how much to buy or sell based on your risk management settings.

This service is used behind the scenes by the platform’s trading processes and also exposed for more advanced use.

It relies on several components: a logger for tracking activity, a connection service to perform the calculations, and a validation service to ensure the sizing is reasonable.

The `calculate` method is the core function; it takes input parameters like risk limits and returns the size of the position to take, considering the current context of the trade.

## Class SizingConnectionService

The SizingConnectionService helps manage how your trading strategies determine position sizes. It acts as a central point to route sizing requests to the right component, ensuring the correct sizing logic is applied.

This service intelligently caches sizing implementations, meaning it remembers and reuses them for efficiency – avoiding repetitive calculations.

It calculates position sizes by considering risk factors and employing different methods like fixed percentages or Kelly Criterion. To use it, you specify a sizing name which directs the request to the appropriate sizing implementation. If your strategy doesn't have specific sizing configurations, this name will be an empty string.

## Class SessionLiveAdapter

The SessionLiveAdapter provides a flexible way to manage and store data during live trading sessions. Think of it as a central hub where your trading strategy can read and write information, and it offers different ways to handle that data—like keeping it in memory, saving it to a file, or simply discarding it.

It’s designed to be easily swapped out, allowing you to change how the session data is handled without altering the core trading logic. The default method is to save the data to a file so it survives restarts. 

You can quickly switch between different storage methods: a simple in-memory option, the persistent file-based method, or even a 'dummy' method that ignores any data written.  You can also provide your own custom storage mechanism if needed.

To keep things running smoothly, the `clear` function is useful if you’re changing the working directory of your strategy, ensuring that fresh data is loaded each time.

## Class SessionBacktestAdapter

This component, the SessionBacktestAdapter, helps manage the data used during backtesting. It acts as a flexible bridge, allowing you to easily swap out how that data is stored and accessed.

By default, it keeps everything in memory, which is fast but temporary.

You can change it to save data to files on your disk for later review, or even use a "dummy" adapter that just ignores any changes – useful for testing.

It’s designed to hold data specific to a combination of asset (symbol), trading strategy, exchange, and timeframe.

There are convenient shortcuts to quickly switch between the default in-memory storage, persistent file storage, a dummy adapter, or even to bring in your own custom adapter.

The `clear` function is important to call if your working directory changes during repeated backtesting runs to make sure fresh instances are created.

## Class SessionAdapter

The SessionAdapter is the central hub for handling data during both simulated (backtest) and live trading. It acts as a dispatcher, directing data operations to either the backtest-specific storage or the live trading storage depending on whether you're running a backtest or a live session.

You can retrieve existing data using `getData`, specifying the symbol, context (strategy, exchange, frame), and indicating if it’s a backtest scenario. Similarly, `setData` lets you update data, again specifying the symbol, value, context, and backtest flag to ensure the data is stored in the appropriate location. This simplifies your code by abstracting away the differences between backtesting and live operations.


## Class ScheduleUtils

The `ScheduleUtils` class helps you keep an eye on signals that are being processed on a schedule. It's like a centralized helper that simplifies reporting on these signals, combining data gathering and logging.

It helps you track signals waiting to be processed, those that were cancelled, and gives you insights into how efficiently things are running with metrics like cancellation rate and average wait times.

You can use it to get detailed data about a specific symbol and strategy combination, generate easy-to-read markdown reports summarizing the signal events, or save those reports directly to a file. Think of it as a way to monitor and troubleshoot your scheduled signals. 


## Class ScheduleReportService

This service helps you keep track of when signals are scheduled and what happens to them. It monitors signal events – when they’re initially scheduled, when they start, and when they’re cancelled – and records these events in a database.

This is useful for understanding how long signals take to execute or why they might be cancelled, which can help you optimize your trading strategies.

You can tell it to start listening for these events and, when you're done, tell it to stop. The service makes sure you don’t accidentally subscribe multiple times.

The `tick` property is where the actual processing and logging of signal events happens. It takes the signal information and saves the details in the database, so you can analyze them later. The service uses a logger to output debugging information.

## Class ScheduleMarkdownService

This service automatically creates reports detailing the scheduling and cancellation of signals. It keeps track of signal events – when they’re scheduled and when they’re cancelled – for each strategy you're using.

It then transforms this data into easy-to-read markdown tables, including helpful statistics like cancellation rates and average wait times. These reports are saved as files in a designated log directory, organized by strategy name.

You can subscribe to receive these updates in real-time and unsubscribe when they’re no longer needed. The service also lets you retrieve specific data or reports programmatically, or clear out the accumulated data if you need to start fresh. You have the option to clear data for a specific strategy and exchange combination, or clear everything.

## Class RiskValidationService

This service helps you keep track of and double-check your risk management settings. It acts like a central record of all your risk profiles, making sure they're available before you try to use them. To speed things up, it remembers the results of previous checks, so it doesn't have to re-validate the same profiles repeatedly.

You can use it to register new risk profiles, validate whether a specific profile exists, and get a complete list of all the profiles you've registered. Think of it as a safeguard to ensure your risk management setup is always consistent and reliable. It offers methods to add, validate, and list your risk profiles in a structured way.

## Class RiskUtils

RiskUtils is a helper tool for understanding and analyzing risk rejection events in your trading system. It gathers data about when and why risk checks failed, allowing you to investigate and improve your strategies.

Think of it as a central place to get summaries and reports about risk rejections.

You can use it to retrieve statistics like the total number of rejections, broken down by symbol and strategy. It also creates nicely formatted markdown reports that show detailed information about each rejection, including the symbol, strategy, position, price, and the reason for the rejection.

Finally, you can save these reports directly to files for easy sharing or archiving.  These files are named based on the symbol and strategy, making them easy to identify.

## Class RiskSchemaService

The RiskSchemaService helps you keep track of your risk schemas, ensuring they're consistent and reliable. 

It uses a special storage system to make sure your schemas are typed correctly.

You can add new risk profiles using the `addRisk()` method, and find them later using their names. 

The `validateShallow()` function quickly checks if a schema has all the necessary components before you add it.

If a risk profile already exists, you can update it using `override()` to make small changes. 

Finally, `get()` allows you to easily retrieve a specific risk profile by its name.

## Class RiskReportService

The RiskReportService is designed to keep a detailed record of any signals that are rejected by the risk management system. It acts as a listener, capturing these rejection events and storing them in a database. 

Essentially, it helps you understand *why* signals are being blocked, allowing for analysis and audits.

You can think of it as setting up a monitoring system specifically for rejected trades.

The service allows you to subscribe to receive these rejection events and provides a way to unsubscribe when you no longer need to monitor them. It’s designed to prevent accidental multiple subscriptions, ensuring a clean and reliable data stream. The service also utilizes a logger to output debug information.

## Class RiskMarkdownService

The RiskMarkdownService helps you automatically create reports detailing risk rejections in your trading system. It listens for rejection events and organizes them by symbol and strategy, then generates easy-to-read markdown tables that summarize what happened.

It keeps track of all rejection events, giving you statistics like the total number of rejections and breakdowns by symbol and strategy. These reports are saved as markdown files so you can easily review and share them.

You can subscribe to receive these rejection events as they happen, and the service makes sure you don't accidentally subscribe multiple times. When you're finished, you can unsubscribe to stop receiving events.

The service handles the storage of these events, and allows you to retrieve statistics, generate reports, and save them to disk. You can even clear the accumulated data when it's no longer needed, either for a specific symbol and strategy or everything at once.

## Class RiskGlobalService

This service manages and enforces risk limits during trading, acting as a central hub for risk-related operations. It works closely with a connection service to validate and apply risk constraints, and is a critical component both within the backtest-kit framework and its public interface.

The service keeps track of several internal elements, including logging, connection services, and validation processes. 

Importantly, the `validate` function helps ensure risk configurations are correct, efficiently caching results to prevent repeated checks.  The `checkSignal` function determines whether a trade can proceed based on defined risk limits.

To track active trades, you'll use `addSignal` to register a new signal, and `removeSignal` to record when a trade is closed. Finally, `clear` allows you to reset the risk data, either for everything or for a specific risk configuration.

## Class RiskConnectionService

The RiskConnectionService acts as a central dispatcher for all risk-related checks and signal management within the trading framework. It ensures that risk assessments are handled by the correct, specialized risk handler based on the specific risk being evaluated. This service cleverly remembers previously used risk handlers to speed things up, avoiding redundant creation.

It uses a `riskName` to direct operations to the appropriate risk handler. Strategies that don't have specific risk configurations will use an empty string for this identifier.

The service utilizes several supporting services like `RiskSchemaService` and `ActionCoreService` for its operation.

The `getRisk` method is crucial; it's responsible for finding or creating the right risk handler and caching it for future use, associating risk with specific exchanges and frames.

The `checkSignal` method performs the actual risk assessment, verifying portfolio health, symbol exposure, and position limits. If a signal is deemed too risky, it will notify other parts of the system.

The `addSignal` and `removeSignal` methods handle the registration and removal of trading signals within the risk management system, again directing them to the appropriate risk handler.

Finally, `clear` lets you manually flush the cached risk handlers, useful for scenarios where you need to refresh or reset the risk management state.

## Class ReportWriterAdapter

This component helps manage where and how your trading data and reports are stored. It's designed to be flexible, letting you easily switch between different storage methods without changing a lot of code.

It keeps track of storage instances for different report types (like backtest results, live trading data, etc.), ensuring you only have one storage instance per report type throughout your application.

You can customize the storage method by providing your own adapter, but it comes with a default option that stores data in JSONL files.

The `writeData` method is how you actually send data to the storage, and it automatically sets up the storage if it doesn’t already exist.

There are convenience methods to switch between adapters: `useDummy` disables all storage (useful for testing), `useJsonl` reverts to the standard JSONL storage, and `useReportAdapter` lets you define your own storage adapter.

If your working directory changes, it’s important to clear the cache with `clear` to ensure new storage instances are created correctly with the updated path.


## Class ReportUtils

ReportUtils helps you control which parts of your trading system are generating detailed logs. It's designed to let you turn on and off logging for things like backtests, live trading, strategy analysis, and performance monitoring individually.

The `enable` function lets you pick and choose which of these reporting services you want active. When you use it, it starts recording events in JSONL format, which provides a structured way to analyze what’s happening in your system. Make sure you remember to stop the logging later, as `enable` gives you a function to do that at once.

The `disable` function allows you to stop the logging for specific services – perhaps you want to temporarily halt logging during a strategy update.  It provides more granular control, but it doesn't require a separate cleanup step like the `enable` function does.

## Class ReportBase

The `ReportBase` class provides a way to log trading events as JSONL files, making it easy to analyze your backtest results. It's designed for efficiently writing data to a single file for each report type, ensuring that new data is always appended without overwriting existing information.

The system automatically handles creating the necessary directories and manages writing operations, including dealing with potential backpressure and timeouts to prevent data loss. It also includes built-in error handling to keep your backtesting process stable.

You can easily search through these reports using metadata like the trading symbol, strategy name, exchange, frame, signal ID, or walker name. This makes it straightforward to filter and analyze specific events within your backtest. The `waitForInit` method safely sets up the file and writing stream, and the `write` method handles adding new data, complete with relevant metadata and a timestamp.


## Class ReportAdapter

The ReportAdapter helps you manage where your trading data is saved and how it's organized. Think of it as a flexible system for logging events and building analytics pipelines. 

It lets you easily swap out different storage methods – like switching between a simple JSONL file and a more complex database – without changing your core trading logic. 

The adapter keeps track of these storage locations so you don't have to recreate them repeatedly.

You can even temporarily disable reporting with a "dummy" adapter, useful for testing.

To ensure your reports are stored correctly across different runs, especially if the working directory changes, clearing the cache is essential. 


## Class ReflectUtils

This utility class provides a way to easily track key performance metrics for your trading positions, like profit & loss, peak profit, and drawdown. It consolidates access to position data from the core trading engine, ensuring consistent and validated information for both backtesting and live trading. Think of it as a single source of truth for understanding how a position is performing.

You can use it to query information like:

*   **Profit & Loss:** Get the unrealized P&L in percentage or dollar terms for the current position.
*   **Peak Performance:** Find the highest profit price, timestamp, and corresponding P&L values.
*   **Drawdown:** Determine the depth of the worst losses, when they occurred, and how long a position has been in a drawdown state.
*   **Position Duration:** See how long a position has been active or how long a signal has been waiting.
*   **Distance from Peaks:** Measure how far current prices are from the highest profit and deepest drawdown points.

The class is designed as a singleton, so you access it once and reuse it to retrieve these metrics throughout your trading logic. The `backtest` parameter allows you to distinguish between live and historical data. All queries are fully validated to ensure data integrity and safety.

## Class RecentLiveAdapter

This component manages recent trading signals, providing a flexible way to store and retrieve them. It acts as a bridge, allowing you to easily switch between different storage methods without changing the rest of your code. By default, it saves signals persistently, meaning they're saved to disk. However, you can also opt for in-memory storage if you prefer.

It offers straightforward ways to get the most recent signal for a given trading context or calculate how long ago a signal was created.  You have control over the underlying storage mechanism, allowing you to plug in custom solutions if needed. The `useRecentAdapter` function lets you specify the exact type of storage to use, and the `usePersist` and `useMemory` functions offer convenient shortcuts for switching between persistent and in-memory storage. If things go wrong, `clear` resets the adapter to its initial persistent state.

## Class RecentBacktestAdapter

This class, `RecentBacktestAdapter`, provides a flexible way to manage and access recent trading signals within a backtesting environment. Think of it as a central hub for working with signals, allowing you to easily switch between different storage methods. By default, it uses an in-memory storage, making it fast and suitable for testing, but it also supports persistent storage to disk for more robust data retention.

It handles events like active pings and provides methods to get the most recent signal for a specific trade context, as well as calculate the time since that signal was created. You can change the storage backend it uses to either a persistent disk-based solution or return to the default in-memory option, giving you control over how your signal data is managed. The `clear` method is a quick way to reset everything back to the default in-memory storage.

## Class RecentAdapter

The RecentAdapter helps manage and access recent trading signals, whether you're running a backtest or a live trading system. It automatically keeps track of the latest signals by listening for updates.

You can easily get the most recent signal for a particular trading setup (like a specific strategy on a certain exchange).

It prevents accidental duplicate subscriptions to ensure efficient operation.

There are methods to enable and disable this signal tracking, and it's safe to disable it multiple times.

The `getLatestSignal` function lets you find the latest signal, checking your backtest data first and then live data.

`getMinutesSinceLatestSignalCreated` tells you how long ago that latest signal was generated, again prioritizing backtest data. 


## Class PriceMetaService

PriceMetaService helps you get the most recent market price for a specific trading setup. Think of it as a central place to look up prices without being directly involved in the trading process itself.

It keeps track of prices for each symbol, strategy, exchange, and timeframe combination, updating them as new information comes in. If you need a price outside of a normal trading tick, this service is designed to provide it.

If a price hasn't been seen yet, it will wait a short time for the information to arrive.

You can clear out the stored prices to make sure you're always working with fresh data, either for all setups or just a specific one.  This is especially useful when starting a new trading simulation or live session. It's updated automatically by other parts of the system and is managed as a single, shared resource.

## Class PositionSizeUtils

This class offers helpful tools for figuring out how much of an asset to trade, also known as position sizing. 

It provides different calculation methods, such as fixed percentage risk, Kelly Criterion, and an ATR-based approach. 

Each method is designed to be straightforward and incorporates checks to make sure the input data is appropriate for the chosen method. 

Essentially, it simplifies the process of determining the right trade size based on your account balance, market conditions, and your chosen strategy.


## Class Position

The `Position` class provides helpful tools for determining take profit and stop loss prices when you're setting up trades. 

It's designed to work whether you're going long (buying) or short (selling) an asset. 

The class offers two methods for calculating these levels:

*   `moonbag`: This method sets a take profit level a fixed distance above the current price.
*   `bracket`: This method gives you more control, letting you define both a take profit and a stop loss percentage.

These functions automatically adjust the calculations to consider whether your position is long or short.

## Class PersistStorageUtils

This class provides tools for managing how signal data is saved and loaded persistently, especially useful for long-running backtests or live trading. It ensures that your signal data isn't lost if something unexpected happens.

The system cleverly caches storage instances to avoid unnecessary overhead and allows you to plug in your own custom storage solutions if the built-in options don't quite fit your needs. 

Each individual signal's data is stored in its own file, making it easy to manage and recover specific pieces of information.  The way data is written to disk is designed to be safe, even if the process is interrupted.

To get started, you can choose from different storage adapters like JSON or a dummy adapter that simply discards any changes, which can be helpful for testing. If your working directory changes, you'll want to clear the cache to ensure the storage uses the correct path. The `readStorageData` function restores your signals from disk, and `writeStorageData` ensures any changes are saved.

## Class PersistStateUtils

This class provides tools for reliably saving and retrieving state information during backtesting. It manages how your strategy's data is stored persistently, so you don't lose progress even if the process restarts. 

It intelligently handles storage locations based on signal identifiers and bucket names, ensuring data is organized and accessible.  You can also choose between different storage methods, like using a default JSON format or swapping to a dummy adapter that simply discards any writes – useful for testing.

The class has functions to read existing state data, write updated state data safely, and clear the cached storage if necessary, like when the working directory changes.  You can also easily switch out the storage mechanism to use custom adapters. Finally, it provides a way to clean up storage associated with signals that are no longer being used.

## Class PersistSignalUtils

This class, PersistSignalUtils, helps manage how signal data is saved and loaded, especially for trading strategies. It ensures that each strategy has its own dedicated storage area and allows for flexibility by supporting different storage methods. The system is designed to handle crashes gracefully and avoid data corruption during writes, making it reliable for persisting signal states.

It offers a way to switch between storage methods, including a default JSON-based system and a dummy adapter that simply ignores all write requests. You can also register your own custom storage adapter. 

The `readSignalData` function retrieves previously saved signal data, while `writeSignalData` saves the current signal state, all while using atomic writes to prevent data loss. The `clear` method allows for refreshing the storage when the working directory changes.

## Class PersistSessionUtils

This class helps manage how your trading strategies save and retrieve important session data. It makes sure that different strategies, exchanges, and frames each have their own dedicated storage location, organized in a predictable way within a `dump/session` directory.

The system uses a clever caching mechanism to avoid repeatedly creating and destroying storage instances, and it’s designed to handle situations where your application crashes unexpectedly.

You can easily switch between different storage methods, like using a real file system or a dummy adapter that simply ignores writes for testing purposes. There’s also a way to register your own custom storage adapters if you need something specialized.

To keep things running smoothly, it's important to clear the cache when your working directory changes, and to clean up storage when sessions are no longer needed. This framework plays a crucial role in ensuring your strategies can safely resume from where they left off, even after interruptions.

## Class PersistScheduleUtils

This utility class helps manage how scheduled signals are saved and loaded, especially for trading strategies. It keeps track of where the data is stored for each strategy to avoid conflicts and makes sure the data is handled safely, even if there are unexpected interruptions.

The class provides a way to customize how scheduled signals are stored, allowing you to use different storage methods or test persistence without actually saving data. 

It has functions to retrieve and save the scheduled signal data, ensuring that the information is written to disk safely to prevent data loss. 

The `clear` method can be useful if your strategy’s working directory changes; it refreshes the storage location. 

You can easily switch between different storage methods, like using JSON files for regular persistence, or a "dummy" adapter that ignores writes, which is useful for testing.

## Class PersistRiskUtils

This class helps manage and store information about active trading positions, specifically for risk management. It ensures that this information is reliably saved and retrieved, even if the system encounters issues. 

It keeps track of active positions separately for each risk profile, using a system that remembers previously used storage methods.

You can even customize how this data is stored by registering your own adapters.

The class handles reading and writing position data, ensuring that changes are saved safely and completely, and that the data isn't corrupted if something goes wrong.

If you're using a different working directory between strategy runs, you should clear the cache to make sure it's using the right location. 

There are also adapter options to switch to a default JSON format or a dummy adapter for testing where changes aren't actually saved.

## Class PersistRecentUtils

This class helps manage how recent trading signals are saved and retrieved, particularly for backtesting and live trading scenarios. It makes sure that data is stored consistently and reliably, even if there are unexpected interruptions.

It remembers which signals are recent for each trading setup (symbol, strategy, exchange, and timeframe), storing them in a way that prevents data loss. You can even customize how it stores these signals using different adapters.

The `readRecentData` function fetches the latest saved signal, and `writeRecentData` saves new ones in a safe way that avoids corruption.

It also allows you to change how the data is stored, for example, switching to a simple JSON format or a “dummy” adapter that doesn't actually save anything – useful for testing.  If your working directory changes, clearing the storage cache ensures things start fresh.

## Class PersistPartialUtils

This class helps manage and safely store your trading strategy's partial profit and loss information. It essentially remembers where your strategy stood at a given point in time, allowing it to pick up where it left off if there's a disruption.

It keeps track of this data for each specific combination of trading symbol, strategy name, signal ID, and exchange. Critically, it uses special techniques to ensure this data isn’t corrupted even if your computer crashes.

You can customize how this information is stored using adapters. Think of adapters as different ways to save data – you can use the standard JSON format or switch to a test mode that doesn't actually save anything.

The `readPartialData` function retrieves previously saved information. It’s used to load up your strategy’s state when it first starts.  `writePartialData` saves the current state after adjustments to profit/loss levels.

To reset the memory and ensure fresh data is used, the `clear` function can be called. This is particularly useful when your strategy's working directory changes. Finally, adapters can be easily switched between different persist formats.

## Class PersistNotificationUtils

This class helps manage how notification data is saved and loaded, ensuring it's reliable even if there are unexpected interruptions. It keeps track of notification information and stores it individually as separate files, identified by a unique ID.

The system uses a special adapter to handle the actual saving process, and you can even customize this adapter to fit your needs. It reads all existing notifications when needed and handles writing new notification data safely, preventing data loss.

To keep things organized, it also has a cache for storage instances and a way to clear this cache if the working directory changes. You can switch between different storage methods, like using JSON files or even a dummy mode that discards all saved data for testing purposes. Finally, it uses a clever technique called atomic writes to make sure the saved data isn’t corrupted if something goes wrong.


## Class PersistMemoryUtils

This utility class, `PersistMemoryUtils`, helps manage how trading memory data is saved and loaded. It intelligently caches storage locations based on signal identifiers and bucket names, preventing unnecessary file operations.

You can customize how this data is stored by plugging in different adapters, allowing for flexibility in persistence methods.  The class ensures safe writing and deletion of memory entries, and includes a way to list all stored memory entries for tasks like rebuilding indexes.

It offers convenience methods for clearing the cache, disposing of resources when signals are removed, and switching between different persistence strategies like using a default JSON adapter or a dummy adapter for testing. Think of it as a reliable helper for ensuring your trading memory is both persistent and adaptable.

## Class PersistMeasureUtils

This class, `PersistMeasureUtils`, helps manage a persistent cache for data retrieved from external APIs, particularly for caching responses. It ensures that cached data isn't lost and that reads and writes happen reliably.

It uses a system where each cache entry is uniquely identified and stored, and it can adapt to different ways of storing that data, like using JSON files or a "dummy" mode that simply throws away data.

Here's what you can do with it:

*   **Read and Write Data:** It provides functions to read and write cached data to disk.
*   **Custom Storage:** You can configure it to use your own way of persisting data.
*   **Clean Up:** There are ways to remove (soft delete) entries and clear the entire cache.
*   **Adaptable Persistence:** Easily switch between different persistence strategies, like JSON or a dummy adapter for testing.
*   **Listing Keys:** You can get a list of all the keys (identifiers) for a specific cache bucket.



This utility is a critical component for the `Cache.file` feature, enabling the caching of external API responses for faster and more efficient backtesting.

## Class PersistLogUtils

This class, PersistLogUtils, provides a way to reliably save and load log data during backtesting. It handles the details of storing each log entry as a separate file, ensuring that your data isn't lost even if the program crashes.

It uses a system that remembers where the log data is stored, and you can even plug in different ways of storing that data, like using JSON files or a simple placeholder that throws away everything it receives.

The class includes methods for reading all existing log entries, writing new entries, and even clearing the storage entirely, which is useful if you need to start fresh with a new workspace location. It focuses on making sure that writing and reading log data is done safely and consistently.

## Class PersistIntervalUtils

This component handles keeping track of which intervals have already occurred, essentially acting as a memory for the backtest-kit system. It stores this information in files located in a specific directory (`./dump/data/interval/`) to avoid repeatedly processing the same intervals.

Each file represents a specific interval, and its presence indicates that the interval has already fired. If a file is missing, it means the interval is eligible to be processed again.

You can customize how this data is stored and retrieved by registering different persistence adapters.  There are also default options like using JSON files or discarding all changes with a dummy adapter for testing.

The system provides methods to delete interval records (soft delete – the file remains but is marked as removed), allowing intervals to be reprocessed. Furthermore, it provides a way to clear the internal cache, which is useful when the working directory changes. It also offers a way to list all intervals for a specific bucket, used for clearing all interval data.

## Class PersistCandleUtils

This class helps manage how candle data (like price information over time) is stored and retrieved from files. It’s designed to keep the cache of data consistent and efficient.

Each candle's data is saved as a separate file, organized by the exchange, symbol (like a stock ticker), time interval, and the specific time the data represents.

The system checks if all the expected candle files are present before returning cached data, ensuring you have a complete set. If any candles are missing, it treats it as a cache miss and requests new data.

To ensure data integrity, writing to the cache happens in a way that's considered "atomic," meaning the entire operation is treated as a single, indivisible unit.

You can customize how this data is persisted by using different adapters—for example, switching to a dummy adapter that simply ignores write requests. Clearing the cache is important when the location where data is stored changes.

## Class PersistBreakevenUtils

This class manages how breakeven data is saved and loaded from your computer's hard drive. It’s designed to keep track of things like whether a signal has been reached, ensuring your trading strategy remembers its progress.

The system uses a clever approach, creating a dedicated storage area for each symbol (like BTCUSDT) and strategy you’re using. This storage area is located in a `dump/data/breakeven` folder.

You don’t typically need to interact with the class directly; it handles the details of saving and retrieving data. It automatically creates the necessary folders if they don't exist and ensures the data is saved reliably.

If you ever want to change how the data is saved, for example, to use a different file format, you can customize the persistence adapter. There's also an option to use a 'dummy' adapter which effectively disables the saving of data for testing purposes. Finally, you can clear out the stored data if you’re switching locations.

## Class PersistBase

`PersistBase` provides a foundation for storing and retrieving data to files, ensuring operations are reliable and consistent. It automatically handles potential problems like corrupted files and makes sure files are written safely. The framework keeps track of where your data is stored and how it’s organized.

You can specify a name for the type of data you’re managing and a main directory where it will be stored.  It calculates the exact file path for each piece of data based on a unique identifier.

The `waitForInit` method sets things up initially, making sure the storage directory exists and checking the integrity of existing data.  This process only happens once.

You'll find easy-to-use methods for reading and writing data, and checking whether a specific piece of data already exists.  When writing data, the process is handled carefully to prevent data loss.

Finally, it offers a way to get a list of all the data identifiers, which is sorted to help keep things organized. This list is also used during the initial setup.

## Class PerformanceReportService

This service helps you keep track of how long different parts of your trading strategy take to run. It essentially listens for timing signals during strategy execution and records those times, along with relevant details. 

Think of it as a detective, noting down every significant moment in your strategy's operation so you can later identify where things might be slowing down.

You can sign up to receive these timing events, and just as easily unsubscribe when you no longer need the data collection. It makes sure you don’t accidentally subscribe more than once.

The service logs these events into a database, allowing you to analyze them to optimize your strategy and find bottlenecks. You'll also have a logger to help with debugging.

## Class PerformanceMarkdownService

This service helps you keep track of how your trading strategies are performing. It listens for performance updates and organizes them by strategy, symbol, exchange, timeframe, and whether it's a backtest or not. 

You can think of it as a central collector of performance data. It calculates key statistics like averages, minimums, maximums, and percentiles to give you a good overview of your strategy's strengths and weaknesses.

The service also automatically creates detailed reports in a readable markdown format, which are saved to your logs directory. These reports highlight potential bottlenecks or areas for improvement in your trading strategy.

Here's a quick rundown of what you can do:

*   **Subscribe & Unsubscribe:** It lets you easily start and stop collecting performance data.
*   **Track:**  This is how you tell the service about performance events.
*   **Get Data:** You can retrieve the calculated performance statistics for a specific strategy.
*   **Generate Reports:**  It creates the markdown reports.
*   **Save Reports:**  Reports can be saved to a specified file path.
*   **Clear Data:** You can completely wipe out the collected performance data when needed.

## Class Performance

The Performance class helps you analyze how well your trading strategies are doing. It provides tools to gather and understand performance data, identify potential bottlenecks, and create reports.

You can use it to retrieve detailed performance statistics for a specific trading strategy and symbol, which includes metrics like average durations, volatility, and percentiles to spot unusual behavior. 

It also allows you to generate easy-to-read markdown reports that visually break down the performance, highlighting areas that might be slowing things down. Finally, you can save these reports directly to your hard drive for later review or sharing. The reports will be saved in a `./dump/performance/` folder by default.

## Class PartialUtils

PartialUtils provides a way to analyze and report on partial profit and loss events recorded during trading. Think of it as a tool to inspect how your strategies are performing incrementally, rather than just at the very end.

It gathers data about partial profits and losses—things like small gains or losses triggered by events—and organizes it for review. You can retrieve key statistics like the total number of profit and loss events.

It allows you to create detailed reports in Markdown format, showing a table of individual profit/loss events with details like the symbol traded, the strategy used, the price, and the time.  This table is then followed by a summary of the key metrics.

You can also easily save these reports to files as Markdown documents, making it simple to share your trading insights or keep a record of performance. The filenames are automatically created based on the symbol and strategy name.


## Class PartialReportService

The PartialReportService helps you keep track of when your trades partially close, whether that's due to profit or loss. It listens for signals indicating these partial exits, recording details like the price and level at which they occurred. This service then saves this information to a database, allowing you to analyze your trading performance in more detail.

You can set up the service to receive these signals, and it prevents accidental double-subscription to ensure accurate record-keeping.  If you need to stop receiving these signals, a provided function lets you easily unsubscribe. The service also includes a logger to help with debugging and troubleshooting.

## Class PartialMarkdownService

The PartialMarkdownService helps you track and report on the profit and losses of your trading strategies. It listens for events indicating profits or losses and keeps track of them for each symbol and strategy you're using.

You can have it generate nicely formatted markdown reports that detail these events, including helpful statistics. These reports are then saved to your computer, organized by symbol, strategy, exchange and timeframe.

This service provides functions to retrieve data, create reports, and even clear out the accumulated event data when needed, giving you flexibility in how you manage and analyze your trading performance. It ensures that each trading setup has its own isolated storage for accuracy and avoids interference.


## Class PartialGlobalService

This service acts as a central hub for managing partial profit and loss tracking within the trading system. It's designed to be injected into the core strategy component, providing a consistent way to handle these partial states. 

Think of it as a middleman: it logs important information about partial operations, then passes those operations on to another service responsible for the actual tracking. 

It helps keep things organized by ensuring all partial tracking events are logged in one place, making it easier to monitor and debug. This service also validates strategy configurations to ensure everything is set up correctly before trading actions occur.

It provides functions for recording when a trade reaches a profit level, when it incurs a loss, and when a trade is closed – each with logging to provide visibility.

## Class PartialConnectionService

The PartialConnectionService manages how profit and loss information is tracked for each trading signal. It acts like a central hub, creating and maintaining records for each signal to ensure accurate tracking.

Think of it as a smart cache – when a new signal appears, it creates a record (a `ClientPartial`) to store its performance data.  It remembers these records so it doesn't have to recreate them every time.

This service is designed to work with the ClientStrategy and uses a system of memoization to efficiently manage these records, making sure it only creates what’s needed and cleans up when signals are finished.

The `getPartial` function is the key to this – it's how the service retrieves or creates those signal-specific records.

When a signal becomes profitable or incurs a loss, the `profit` or `loss` functions handle the updates and notifications.  Finally, when a signal is closed, the `clear` function makes sure the record is properly cleaned up, ensuring no unnecessary data lingers.

## Class NotificationLiveAdapter

This component provides a flexible way to send notifications about your trading strategy's progress. Think of it as a central hub that can be easily configured to send notifications to different places, like a database, a simple in-memory store, or even nowhere at all (a dummy adapter for testing).

You can switch between different notification methods – persistent storage, in-memory storage (which is the default), or a dummy mode that doesn't actually send anything. This makes it easy to test your strategy without overwhelming yourself with notifications.

The `handleSignal`, `handlePartialProfit`, and other `handle...` methods act as messengers, forwarding information about events like signal generation, partial profit/loss, or errors to whichever notification adapter you've selected. There are also methods to retrieve all stored notifications or clear them out.  If your project’s base directory changes between runs (like when using `process.cwd()`), be sure to call the `clear` method to reset to the default in-memory adapter.

## Class NotificationHelperService

This service acts as a central hub for ensuring that signals are correctly validated and communicated within the backtesting system. It primarily deals with confirming the integrity of different aspects of a trading strategy – like the strategy itself, the exchange it uses, the data frame, and any associated actions.

The validation process is designed to be efficient; once a specific combination of strategy, exchange, and frame has been checked, the system remembers the result, so it doesn’t have to repeat the same checks.

The core function of this service is `commitSignalNotify`, which is triggered during active pings. It gathers the signal information, validates all the necessary components, and then sends out a notification—essentially, broadcasting the signal's details to registered listeners and persisting the data. 

Think of it as the quality control and communication center for signal notifications during backtests.


## Class NotificationBacktestAdapter

This component, `NotificationBacktestAdapter`, provides a flexible way to manage and send notifications during backtesting. It's designed to be easily customized to use different notification methods – whether you want to store them in memory, persist them to disk, or simply ignore them entirely.

Think of it as a central hub for all your notification events, like signals, profits, losses, or errors. It uses a modular design, allowing you to swap out the actual notification system without changing the core backtest logic.

You can easily switch between different notification implementations using convenient helper functions like `useDummy`, `useMemory`, and `usePersist`.  The default is to keep notifications in memory, but you can change this as needed.

The `handleSignal`, `handlePartialProfit`, `handleRisk` and other similar methods act as relays, forwarding notification data to the currently selected notification backend.  `getData` lets you retrieve all stored notifications and `dispose` clears them out. Finally, `useNotificationAdapter` gives you direct control, allowing you to specify your own custom notification adapter class. If your working directory changes during backtest iterations, calling `clear` will ensure a fresh, properly initialized notification system is used.

## Class NotificationAdapter

The NotificationAdapter is the central hub for managing and accessing notifications during backtesting and live trading. It automatically keeps track of notifications by listening to various signals related to trading activity, like profit, loss, and errors. 

To prevent unnecessary subscriptions, it uses a unique system to ensure each signal is registered only once. 

You can retrieve all stored notifications, either from the backtesting or live environment, using the `getData` method. When you're finished, `dispose` clears the notifications and ensures everything is cleaned up properly. It's also safe to call `disable` multiple times without issue.

## Class MemoryLiveAdapter

This component provides a flexible way to manage temporary data during live trading, acting like a central storage hub. It uses a design pattern that allows you to easily swap out different storage methods without changing your core trading logic.

You have a few storage options available: a persistent file-based storage (the default, which saves data to disk), a purely in-memory solution that resets each time your application restarts, a dummy storage that simply discards any data, or even a custom storage solution of your own creation.

The system keeps track of these data entries, organizing them by signal and bucket. You can write data to memory, search through existing data, list all entries, remove specific entries, or read individual entries. There's also a way to manually clear the cache of memoized instances. If you're frequently changing the directory your application runs in, clearing this cache can help prevent unexpected behavior. When a signal is closed, data associated with that signal can be automatically disposed of.

## Class MemoryBacktestAdapter

This adapter provides a flexible way to manage memory storage during backtesting. It allows you to choose different storage methods depending on your needs, with options ranging from a simple in-memory solution to a persistent file-based system or even a dummy adapter for testing. You can easily switch between these storage methods using methods like `useLocal`, `usePersist`, and `useDummy`.

The adapter manages cached memory instances for efficient access, keyed by signal and bucket. When a signal is closed or cancelled, the `disposeSignal` method clears the associated cached instances. 

It includes functionality to write data to memory, search using a BM25 scoring system, list existing entries, remove entries, and read individual entries. If you require more control, you can also implement your own custom memory adapter and use `useMemoryAdapter`. To ensure fresh instances when your working directory changes, call `clear` to refresh the cache.

## Class MemoryAdapter

The MemoryAdapter acts as a central hub for managing how your backtest and live trading environments store and retrieve data. It handles the underlying memory storage, whether you're running a simulation (backtest) or a live trade.

Think of it as a smart switch; it automatically directs data writes, searches, and retrievals to the correct location – either your backtest memory or your live trading memory.

To keep things clean and prevent issues, the adapter automatically subscribes to signal events and cleans up old data when signals are finished. It makes sure resources are properly managed.

You can enable or disable this memory management to control when data is actively being stored and handled.

The adapter provides methods for writing data to memory, searching for specific information, listing all stored entries, removing data, and reading individual entries. These operations are routed to the appropriate backtest or live system based on your configuration.

## Class MaxDrawdownUtils

This class helps you analyze and understand your trading strategy’s risk profile, specifically focusing on maximum drawdown. Think of it as a tool to generate reports and statistics about how much your strategy lost from its peak to its lowest point.

It doesn't create data itself; it gathers information that's already been tracked by other parts of the system.

You can use it to:

*   Retrieve detailed statistics about the maximum drawdown for a specific strategy and symbol.
*   Generate a markdown report summarizing the drawdown events.
*   Save that markdown report directly to a file for easy sharing or record-keeping.

The reports can be customized to show specific data points, and the information can be pulled from either live trading data or from backtest results.

## Class MaxDrawdownReportService

The `MaxDrawdownReportService` is designed to keep track of and record your trading strategy's maximum drawdown events. It essentially listens for these drawdown occurrences and saves them in a structured format suitable for analysis.

It connects to a data stream – `maxDrawdownSubject` – and whenever a new drawdown is detected, it writes a detailed record to a database. This record includes things like the timestamp, the traded symbol, the strategy's name, the exchange, the timeframe, signal details (ID, position, current price, and order parameters), providing a comprehensive snapshot of what happened at the moment of the drawdown.

To get this service running, you need to subscribe to the data stream.  The system makes sure you don’t accidentally subscribe multiple times, ensuring efficient operation. If you later want to stop recording drawdown events, you can unsubscribe, which gracefully stops the recording process.


## Class MaxDrawdownMarkdownService

This service helps you create and save reports detailing the maximum drawdown experienced during backtesting. It listens for events related to drawdown and organizes this data based on factors like the trading symbol, strategy, exchange, and timeframe.

You can subscribe to start receiving these drawdown events and unsubscribe to stop them and clear any stored data.

The service offers methods to retrieve the raw data, generate a formatted markdown report, and directly save that report to a file. You can specify which symbol, strategy, exchange, and timeframe to generate a report for.

To completely clear the collected data, you can call the `clear` method. Providing specific details like symbol, strategy, exchange, and timeframe clears only the data associated with that combination; calling it without any details clears everything.

## Class MarkdownWriterAdapter

The MarkdownWriterAdapter helps you manage where your backtest reports are saved and how they're organized. It's designed to be flexible, letting you easily switch between different storage methods like saving each report to a separate file, appending everything to a single log file, or even silencing the report generation entirely. 

It remembers which storage method you're using, ensuring you don't accidentally create duplicate reports.

You can change the default storage method, or choose between the standard folder-based approach, a consolidated JSONL log, or a "dummy" mode that doesn't save anything. The `clear` method is useful when your working directory changes to ensure fresh storage instances are used. `useMd()` gives you those individual report files, `useJsonl()` centralizes everything into one file, and `useDummy()` prevents any files from being written.

## Class MarkdownUtils

This class helps you control the generation of markdown reports for different parts of your trading system, like backtests, live trading, or strategy performance. It lets you turn these reports on or off for specific areas, giving you fine-grained control over what data is being collected and how it's presented.

You can selectively enable report generation for things like backtest results, risk metrics, or performance analysis. When you enable a report, it starts gathering data and creating markdown files. It's very important to remember to "unsubscribe" from these enabled reports when you no longer need them – this prevents potential memory issues.

If you want to stop report generation for just *some* parts of your system without affecting others, you can disable them individually. If you’re finished with reports completely, or just need to reset the data being gathered, there’s also a method to clear the accumulated report data without stopping the generation process.

## Class MarkdownFolderBase

This class provides a straightforward way to generate markdown reports, organizing them into individual files within a specified directory structure. It's designed for creating human-readable reports that are easy to browse and review.

Each report gets its own `.md` file, and the file's location is determined by a combination of a base path and a specific file name you provide.

The adapter doesn't handle any special initialization steps; it simply writes content directly to files as needed. This makes it a simple and efficient choice for producing organized sets of markdown reports. 

You can think of it as the standard way to generate reports within the backtest-kit framework, making it perfect for detailed analysis and manual review. 

The `dump` method is the core function - it handles the actual writing of the markdown content to the individual report files, creating any necessary directories along the way.

## Class MarkdownFileBase

This framework component manages writing markdown reports as JSONL files, providing a structured way to log and process your trading data. It's designed to handle large volumes of data efficiently, using an append-only approach that's easy to integrate with other JSONL processing tools.

Each type of markdown report (like trade details or performance analysis) gets its own dedicated file, making organization and filtering much simpler. The adapter automatically creates directories as needed and includes metadata with each entry, such as the symbol traded, strategy used, and the timestamp.

Initialization is handled automatically, ensuring the file and write stream are set up correctly, and write operations are protected against timeouts to prevent data loss. You can safely call the initialization function multiple times as it’s designed to run only once. The `dump` method is the core function for writing your markdown content, taking the data and metadata as input.


## Class MarkdownAdapter

This component provides a flexible way to manage how your markdown data is stored. It uses a design pattern that lets you easily swap out different storage methods without changing the rest of your code. 

You can choose between storing your markdown as separate files, appending to a single JSONL file, or even using a "dummy" adapter that effectively ignores any writes—useful for testing. 

The system intelligently manages these storage options and creates instances only when needed, ensuring efficient resource use.  It provides convenient shortcuts to switch between the most common storage methods: folder-based files and JSONL append.


## Class LoggerService

The LoggerService helps you keep your trading logs organized and informative. It’s designed to automatically add important details to your log messages, like which strategy, exchange, or frame is being used, and what symbol, time, or backtest is involved.

You can use this service to provide your own logging solution, or it will fall back to a default "do nothing" logger if you don't provide one.

The service makes logging simple with methods like `log`, `debug`, `info`, and `warn`, each adding a different level of detail to your messages.

To customize it, you can set your own logger implementation using the `setLogger` method. The `methodContextService` and `executionContextService` properties manage the context information added to log messages.

## Class LogAdapter

The `LogAdapter` helps manage and store your trading logs, offering flexibility in where and how those logs are saved. It uses a pattern that lets you easily swap out different logging methods – you can choose to store logs in memory, on disk, or even discard them entirely.

Initially, it uses an in-memory storage, but you can change it to save logs to a file using `usePersist` or `useJsonl` for more persistent records.  If you just want to suppress logging completely for testing or performance reasons, `useDummy` will prevent any log entries from being written.

The `useLogger` method allows you to define a custom logging implementation, giving you full control.  The `clear` function is important to call when your program's working directory changes; it ensures you get a fresh logging setup.  Essentially, it's a central place to control how your trading system records its activities.

## Class LiveUtils

LiveUtils provides tools for managing live trading sessions. It’s designed to simplify the process of running strategies in a live environment and includes features to handle crashes and provide real-time updates.

You can start a live trading session for a specific symbol and strategy using `run` or `background`. The `run` function gives you a continuous stream of trading results, while `background` runs the trading without directly providing results, suitable for tasks like persistence or callbacks.

To get information about an active signal, you can use functions like `getPendingSignal`, `getTotalPercentClosed`, `getScheduledSignal`, and others to check for signals, retrieve key data, and assess position metrics like cost, invested amount, PnL, and entry levels.

You can also interact with running strategies using functions like `stop` to halt a strategy, or `commit...` functions to modify signals and positions (e.g., `commitPartialProfit`, `commitBreakeven`). These functions help you manage and adjust your trading activity. LiveUtils also includes functions to retrieve data and generate reports about past and current trading activity.

Finally, `getMaxDrawdownDistancePnlPercentage` and similar functions are available for performance assessment, helping you understand the risk profiles and potential drawdowns of your trading strategies.

## Class LiveReportService

The LiveReportService helps you track what your trading strategy is doing in real-time. It's designed to listen for every event – from when the strategy is waiting for a signal to when a trade is opened, active, or closed – and record these details.

Think of it as a detailed logbook for your live trading.

It uses a logger to help with debugging, and manages subscriptions to ensure it's not receiving signals multiple times. You can subscribe to start listening for events, and unsubscribe to stop. The `subscribe` method returns a function you can call to cancel the subscription, and the `unsubscribe` method handles that cleanly for you. The data is written to a database so you can easily review performance and make adjustments later on.

## Class LiveMarkdownService

The LiveMarkdownService helps you automatically create and save reports during live trading sessions. It listens for updates from your trading strategies – like when a trade is opened, active, or closed – and keeps track of all these events. It then uses this information to generate easy-to-read markdown tables, providing a snapshot of your trading activity.

You'll get valuable statistics included in these reports too, such as your win rate and average profit/loss (PNL). These reports are saved automatically to your logs directory, organized by strategy name.

To use this, you'll need to subscribe it to your trading system’s signal emitter.  Once subscribed, it processes each tick event, recording the details of your trades.  You can also manually retrieve data and reports, and even clear the accumulated data when needed. The service manages its own storage for each unique trading combination, ensuring your data stays organized and isolated.

## Class LiveLogicPublicService

This service manages live trading operations, making them easier to use by automatically handling context information like the strategy name and exchange. It acts as a bridge to a private service, streamlining how you interact with the trading system. 

It’s designed to run continuously, providing a stream of trading results (signals to open, close, or cancel positions) indefinitely. 

The service is also robust, meaning it can recover from crashes and pick up where it left off by saving and restoring its state. It keeps track of time using `Date.now()` to ensure accurate progression of trades.

To start a live trading session, you simply provide the symbol you want to trade and a context object; the service handles the rest, propagating that context to the underlying functions.

## Class LiveLogicPrivateService

This service manages live trading operations, constantly monitoring and reacting to market changes. It works by continuously checking for new trading signals and actions.

Think of it as an always-on process that streams updates – only reporting when trades are opened or closed, not when things are simply active.

It's designed to be resilient; if something goes wrong, it can automatically recover and continue trading. The service uses a memory-efficient approach, sending updates as a stream instead of loading everything into memory at once. It will keep running indefinitely, acting as the engine for your live trading strategies. 

You provide the symbol you want to trade, and the service takes care of the rest, continually generating results for you to analyze.


## Class LiveCommandService

This service gives you a way to connect to and interact with the live trading environment. It acts as a convenient middleman, making it easier to inject dependencies and use the underlying live trading logic in your applications.

Think of it as a central hub for running live trades.

Here's what you can do with it:

*   It handles the connection to the live trading systems.
*   It validates strategies and exchanges to ensure everything is set up correctly.
*   The `run` function is the main method you'll use.  It starts the live trading process for a specific symbol, continuously providing updates on the trade status – whether it's opened, closed, or canceled – and automatically attempts to recover if errors occur. It's an ongoing stream of information, making it ideal for real-time monitoring and control.


## Class IntervalUtils

IntervalUtils helps you manage how often certain functions run, making sure they don't execute too frequently – like once per time interval. It offers two approaches: one that keeps track of things in memory (the `fn` mode) and another that saves information to a file (the `file` mode), which is helpful if your application needs to remember things even after it restarts.

The `fn` function lets you wrap a regular function, ensuring it only runs once during each interval. If a function returns `null`, it won’t trigger the timer and will try again later.  Each function you wrap gets its own dedicated memory space, keeping things organized.

The `file` function does the same but persists the information to a file, so it remains even if the program stops and starts again.  Like the `fn` function, each wrapped function gets its own dedicated space.

To clean up resources and prevent conflicts, `dispose` removes the memory or file-based tracking for a function.  `clear` completely wipes out all these tracked functions. `resetCounter` makes sure that the file-based functions start fresh and don't clash with older ones when the working directory changes.  You can think of it as a way to restart the numbering system.


## Class HighestProfitUtils

This class helps you analyze and understand your trading strategies' peak performance. It gathers information about the times your strategies made the most profit.

Think of it as a tool to review and summarize how well your strategies did in specific scenarios.

It offers three main ways to work with this data:

*   **getData:**  This lets you pull detailed statistics for a particular trading symbol, strategy, exchange, and timeframe. You can specify if it’s a backtest or live data.
*   **getReport:** It creates a formatted markdown report summarizing the highest profit events for a specific combination of symbol and strategy. You can also choose which data points to include in the report.
*   **dump:** This function takes all that data and writes a complete markdown report directly to a file, so you can easily share or archive it. Like `getReport`, you can customize which columns are included.

## Class HighestProfitReportService

This service helps track and record your most profitable trades. It keeps an eye on signals that generate the highest profit and saves those moments to a report database for later review and analysis.

Think of it as an automated record-keeper, noting down the details whenever a new peak profit is achieved.

To get it working, you need to tell it to start listening for those profitable signals – that's done using the `subscribe` method.  Once it's listening, it will automatically log details like the timestamp, symbol, strategy name, exchange, frame, and backtest information, along with specifics about the signal itself (position, prices, etc.).

If you later want to stop recording, use the `unsubscribe` method. This will prevent any further entries into the report.  The `subscribe` method makes sure you don't accidentally subscribe multiple times, preventing unnecessary processing.


## Class HighestProfitMarkdownService

This service is responsible for creating and saving reports detailing the highest profit achieved, which is useful for analyzing trading performance. It listens for incoming data about profitable contracts and organizes them based on symbol, strategy, exchange, and timeframe.

You can subscribe to receive these data points, and the subscription is handled efficiently to prevent redundant subscriptions.  Unsubscribing will detach it from the data source and clear all accumulated information.

The `tick` method processes individual data events, routing them to the correct storage location.

To retrieve the data, `getData` allows you to pull accumulated statistics for a specific combination of symbol, strategy, exchange, timeframe, and whether it's a backtest.  `getReport` generates a nicely formatted markdown report including a table of events and the total count.  You can also use `dump` to create this report and save it to a file with a descriptive name.

Finally, `clear` provides a way to wipe out stored data; you can selectively clear data for a specific symbol, strategy, exchange, timeframe, and backtest, or clear everything entirely.

## Class HeatUtils

HeatUtils offers a helpful way to visualize and analyze your trading portfolio's performance. It gathers data across all your strategies and symbols, giving you a clear picture of how each one is doing. 

Think of it as a tool that automatically creates heatmaps – visual representations of your portfolio’s statistics – saving you the manual effort.

Here's what you can do with it:

*   **Get Data:** Retrieve detailed heatmap statistics for a specific strategy, broken down by individual symbols and including overall portfolio metrics.
*   **Generate a Report:** Create a nicely formatted markdown report showing a table with key performance indicators like total profit, Sharpe ratio, maximum drawdown, and the number of trades executed for each symbol. These symbols are listed from best to worst performer.
*   **Save to Disk:** Easily export the generated report to a file, with the option to specify the filename and location. It will create the necessary directory if it doesn't already exist.

## Class HeatReportService

The HeatReportService helps you track and analyze your trading activity by recording when signals close and generate profit or loss. It's designed to gather data from your entire portfolio, providing a comprehensive view of performance trends.

It listens for events related to signal closures, specifically focusing on those with profit and loss (PNL) data. This information is then saved to a database, making it available for generating heatmaps and visualizing your trading patterns. 

To avoid accidentally logging the same event multiple times, it employs a safety mechanism to prevent multiple subscriptions.

You can start receiving these events by using the `subscribe` method, which also gives you a function to stop listening with `unsubscribe`. The `tick` property handles the actual processing of those signal events, ensuring only closed signals are captured and saved.

## Class HeatMarkdownService

This service helps you visualize and analyze your trading performance, particularly for backtesting. It gathers data from your trading signals and organizes them into clear, understandable reports. Think of it as a dashboard that shows you how your strategies are doing, broken down by individual assets and overall portfolio.

It keeps track of key metrics like profit and loss, Sharpe Ratio, and maximum drawdown, both for each asset and for your entire portfolio.  You can request a summary of this data, or generate a nicely formatted markdown report to share or save. 

The service intelligently manages its data storage, ensuring that each exchange, timeframe, and backtest mode has its own dedicated area.  You subscribe to receive updates as trades are closed, and a handy unsubscribe function lets you stop listening. The clear function allows you to reset the data, either for a specific set of conditions or for everything.  It’s designed to handle potential math errors gracefully, preventing unexpected results.

## Class FrameValidationService

This service helps you keep track of and confirm the validity of your trading timeframes. Think of it as a central place to register your different timeframe setups and double-check they're correct before you start trading.

It lets you easily register new timeframes, providing their configurations.

Before any operations, it verifies that a timeframe actually exists, preventing errors.

To make things efficient, it remembers the results of past validations so it doesn't have to repeat checks unnecessarily.

You can also get a complete list of all the timeframes you've registered.


## Class FrameSchemaService

This service helps you manage and organize your frame schemas, which are like blueprints for how your data is structured during backtesting. It keeps track of these schemas in a secure and type-safe way, ensuring consistency and preventing errors.

You can add new frame schemas using the `register` method, and retrieve them later using `get` to access their definitions. If you need to update an existing schema, `override` allows you to make changes without replacing the entire schema.

Before a new frame schema is added, it's checked for essential properties and correct types to ensure everything is set up properly – this is handled by the `validateShallow` function. This ensures your data structure is valid and reliable for backtesting.


## Class FrameCoreService

This service manages the core framework functionalities related to timeframes. It acts as a central point for generating and handling timeframe data within the backtesting environment.

Essentially, it leverages a connection service to fetch timeframe data and a validation service to ensure its accuracy. The `getTimeframe` function is key – it’s used to create the sequences of dates that drive each iteration of your backtest. Think of it as the engine that provides the timeline for your trading strategy to run against. It takes a symbol (like AAPL) and a frame name (like 'day') to return a list of dates.


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different frame implementations within the backtest environment. It automatically directs requests to the correct frame based on information available in the method context. 

To boost performance, it cleverly caches these frame instances, so you don't have to create them repeatedly.

It also provides a way to retrieve the timeframe boundaries (start and end dates) for a specific symbol within a frame, enabling you to control the scope of your backtest. When in live mode, the frame name is empty, indicating no frame constraints are applied.

Here's a breakdown of the key parts:

*   It retrieves frames using their names.
*   It remembers (caches) those frames to avoid recreating them.
*   It understands the timeframe of backtests, letting you specify the start and end dates.


## Class ExchangeValidationService

The ExchangeValidationService helps keep track of your configured exchanges and makes sure they're all set up correctly before you start trading. Think of it as a central manager for your exchanges. 

You can use it to register new exchanges using `addExchange()`, so the service knows about them.

Before performing any operations on an exchange, use `validate()` to confirm it exists – this prevents errors later on.

For efficiency, validation results are stored so it doesn’t have to check every time. 

Finally, `list()` allows you to see all the exchanges currently registered and their configurations. It maintains a registry and offers ways to add, check and list exchanges.

## Class ExchangeUtils

The ExchangeUtils class is designed to make working with different cryptocurrency exchanges easier. It acts as a central point, providing validated access to common exchange operations. 

Think of it as a helper that handles the details of interacting with exchanges for you.

Here's what it can do:

*   It retrieves historical candle data, automatically calculating the timeframe needed.
*   It can compute the VWAP (volume-weighted average price) to understand price trends.
*   It ensures that quantities and prices are formatted correctly according to each exchange's specific rules.
*   You can request order books and aggregated trade data.
*   It allows fetching raw candle data with precise control over date ranges and limits, carefully avoiding potential biases.

It's structured so there's only one instance of it running, making it simple to use throughout your trading framework.

## Class ExchangeSchemaService

This service helps keep track of information about different cryptocurrency exchanges, ensuring everything is structured correctly. It uses a special registry to store these exchange details in a type-safe way.

You can add new exchanges using the `addExchange` function, and retrieve existing ones by their names. 

Before an exchange is added, a quick check (`validateShallow`) makes sure all the necessary information is present and in the right format.

If an exchange already exists in the registry, you can update parts of its information using the `override` function.

Finally, the `get` function allows you to easily find an exchange's details if you know its name.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for all interactions with an exchange, ensuring that each request is aware of the current trading context – things like the symbol being traded, the specific time, and whether it's a backtest or live trade. It combines the functionality of connecting to the exchange and managing the overall execution environment.

It handles tasks like retrieving historical and future candle data (for backtesting), calculating average prices, formatting price and quantity data, and fetching order books and aggregated trades. All these operations are performed with the crucial context of the trading environment injected. 

Validation of the exchange configuration is built-in and optimized to prevent repeated checks. The service is designed to be a reliable and consistent way to access exchange data within the backtest-kit framework.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently directs your requests—like fetching candles or order books—to the correct exchange based on the context of your operation. To make things efficient, it remembers previously used exchange connections, so you don't have to repeatedly establish them.

This service provides methods for retrieving historical and future candles, calculating average prices (either from live data or historical candles), and formatting prices and quantities to match the specific rules of each exchange. It also handles order book data and aggregated trade information. Essentially, it simplifies the process of working with multiple exchanges by abstracting away the complexities of each one and providing a consistent interface. The service is designed to work seamlessly within both backtesting and live trading environments.

## Class DumpAdapter

The `DumpAdapter` helps you save data from your backtest kit in different formats and locations. Think of it as a flexible tool that lets you choose *how* your data is saved, whether that's to markdown files, held in memory, or even discarded entirely.

Initially, it will save data as markdown files, creating a separate file for each piece of information you want to store. It creates a specific, temporary storage space for each data point it handles, ensuring data is kept organized.

You can easily change how the data is saved by using commands like `useMemory` to store everything in memory, or `useDummy` to ignore the data completely. For advanced users, `useDumpAdapter` lets you create your own custom storage methods.

Before you start saving data, you must activate the adapter with `enable`. When you're finished, `disable` stops it.

There are several methods for saving different kinds of data: `dumpAgentAnswer` saves conversation histories, `dumpRecord` handles simple key-value pairs, `dumpTable` formats data into tables, and `dumpText` saves raw text. The `dumpJson` method allows for saving complex, nested data structures.

If you need to refresh how it's saving data after changing the working directory, `clear` wipes out the cached storage.

## Class ConstantUtils

This class provides a set of pre-calculated values to help manage your take-profit and stop-loss levels when trading, inspired by the Kelly Criterion and designed to reduce risk. Think of these as a guide for breaking up your profit targets and loss limits into stages.

The `TP_LEVEL1`, `TP_LEVEL2`, and `TP_LEVEL3` properties represent levels for taking partial profits—they’re designed to let you secure some gains early, more later, and almost all of it near the end of your target. For example, `TP_LEVEL1` at 30% means you'd take a partial profit when the price reaches 30% of the distance to your full take profit target.

Similarly, `SL_LEVEL1` and `SL_LEVEL2` define stop-loss levels to help protect your capital. `SL_LEVEL1` gives an early warning sign to reduce exposure, while `SL_LEVEL2` ensures you exit the trade if things turn very unfavorable. These levels are calculated as percentages of the distance to your overall stop-loss target.

## Class ConfigValidationService

The ConfigValidationService helps make sure your trading setup is mathematically sound and has the potential to be profitable. It acts as a safety net, double-checking all the global configuration settings before your backtest runs.

It focuses on ensuring things like slippage and fees aren't set too high to make profitable trades impossible, and that percentage-based settings are always positive values. Additionally, it confirms that minimum and maximum values for parameters are consistent with each other, and that time-related settings have valid integer values.

Think of it as a quality control system that verifies your settings align with trading realities, helping you avoid costly mistakes during backtesting. It validates that your take profit distance accounts for fees and slippage, making sure you’re not setting unrealistic expectations. The service also checks things like retry attempts and timeout durations to ensure those parameters are positive integers too.


## Class ColumnValidationService

This service, ColumnValidationService, is designed to keep your column configurations in good shape. It ensures that each column definition adheres to a strict set of rules, preventing errors and inconsistencies.

Essentially, it verifies that every column has all the necessary pieces – a key, a label, a format, and a visibility setting. It also makes sure these keys are unique, and that the format and visibility are defined as functions, not just plain values. Finally, it checks that the key and label are actually text strings and not empty. The `validate` method performs this entire check on your column configurations.

## Class ClientSizing

ClientSizing helps determine how much of an asset to trade based on various strategies and limitations. It's designed to be flexible, offering options like fixed percentage sizing, Kelly criterion, and ATR-based sizing. You can set boundaries on the position size, ensuring it doesn't exceed certain minimums or maximums. 

It also provides controls to limit the overall percentage of your portfolio allocated to any single position. Furthermore, ClientSizing can be extended with callback functions to handle custom validation logic or logging for more refined control over the sizing process. 

The `calculate` method is the core function, taking input parameters and returning the calculated position size. Essentially, it’s the engine that translates a trading strategy’s signals into concrete trade sizes.

## Class ClientRisk

ClientRisk helps manage risk across your entire portfolio of trading strategies. It's designed to prevent trading signals that might exceed predefined limits, such as the maximum number of positions you can hold simultaneously.

This system keeps track of all active positions, combining data from different strategies to provide a holistic view of your risk exposure. Think of it as a central safety net preventing your strategies from accidentally conflicting and exceeding your risk tolerance.

The ClientRisk system is automatically integrated into the strategy execution process, validating each signal before a trade is placed.  It also allows you to define custom risk checks based on your specific needs.

ClientRisk maintains a record of your open positions and periodically saves this information, although this saving is skipped when running in backtest mode.

It includes methods to register newly opened positions (`addSignal`) and remove positions when they are closed (`removeSignal`), keeping its internal records up-to-date.

## Class ClientFrame

This component, the ClientFrame, is responsible for creating the sequences of timestamps used during backtesting. Think of it as the engine that provides the chronological order of data for your trading simulations. It avoids repeating the same work by caching generated timeframes, making the process more efficient. You can control how frequently these timestamps are generated, choosing intervals from one minute to one day, and it offers ways to verify and record the timeframe data as it's being created. The BacktestLogicPrivateService relies on this to step through historical periods for analysis.

The `getTimeframe` function is the key here; it's what actually produces the timeline of timestamps for a specific trading symbol, and it utilizes a caching mechanism to ensure efficiency.

## Class ClientExchange

This component handles accessing and formatting exchange data, forming a crucial link between your backtesting environment and real-time data sources. It provides methods for retrieving historical and future candle data, which is essential for analyzing past performance and simulating future scenarios. You can also use it to calculate VWAP (Volume Weighted Average Price), a key indicator for understanding market activity.

The `getCandles` method retrieves historical data, aligning timestamps to ensure accuracy. `getNextCandles` is specifically designed for backtesting, bringing in future data to model signal durations.  `getAveragePrice` calculates VWAP based on recent 1-minute candles, offering a quick view of price trends.

Beyond data retrieval, it also formats quantities and prices based on the specific rules of the exchange you're using.  The `getRawCandles` method offers flexibility with date ranges and limits, while `getAggregatedTrades` provides aggregated trade data for analyzing volume and price action. Finally, `getOrderBook` retrieves order book data for a given symbol and depth.

The code prioritizes efficiency by using prototype functions and it's carefully designed to prevent look-ahead bias, ensuring the integrity of your backtest results.

## Class ClientAction

The `ClientAction` class is a core component that manages how your custom action handlers—the code that performs tasks like logging, sending notifications, or interacting with external services—work within the backtest-kit framework. It's responsible for setting up these handlers, making sure they run correctly, and cleaning up afterward.

Think of it as a central hub for your action handlers. When events like a new signal, a breakeven trigger, or a partial profit event occur, the `ClientAction` routes these events to the appropriate parts of your handler's code. It initializes your handlers only once, and ensures they are properly disposed of when they are no longer needed.

It provides specialized signal handling methods for backtesting and live trading environments separately. 

There's a crucial `signalSync` method, which is used to control position openings and closings using limit orders; it's designed to report any errors directly so they can be handled.

## Class CacheUtils

CacheUtils helps you automatically store and reuse the results of your functions, which can significantly speed up your backtesting process. Think of it as a way to avoid recalculating things you've already figured out.

It provides a couple of key features: `fn` for caching regular functions and `file` for caching asynchronous functions by saving them to disk. The `file` feature is particularly useful for things like indicators or data processing where storing the results on disk is efficient.

Each function you cache is kept separate, preventing one function's cached results from affecting another.

You can also manually delete cached results using `dispose` if you need to force a recalculation.  `clear` and `resetCounter` are for more advanced scenarios, like when your working directory changes, ensuring clean cache states between different runs.


## Class BrokerBase

This `BrokerBase` class is designed to help you connect your trading strategies to real-world exchanges. Think of it as a template or starting point for creating your own custom broker adapters. It handles common tasks like placing orders, managing stop-loss and take-profit levels, and tracking your positions.

You don't have to rewrite everything from scratch; this class provides default implementations for most actions, logging each step along the way.  You'll extend this base class to build a connector specific to the exchange you want to use.

Here’s how it works:

*   **Initialization:** The `waitForInit()` method lets you set up the connection to your exchange, authenticate, and load any necessary configuration.
*   **Event Handling:** When your strategy executes, specific methods are called (`onSignalOpenCommit`, `onSignalCloseCommit`, etc.).  These handle actions like opening and closing positions, and adjusting your risk management.
*   **Partial Management:** It provides hooks for partial profit and loss execution, allowing you to refine your strategy's risk control.
*   **Trailing Stops & Take Profits:**  Dedicated methods manage trailing stop-loss and take-profit adjustments.
*   **DCA support:** A method for handling average buy commits.

The class takes care of logging everything, making it easier to debug and monitor your trading activity. By extending `BrokerBase`, you can focus on the unique aspects of connecting to your preferred exchange. It essentially simplifies the process of integrating your trading logic with a live brokerage API.

## Class BrokerAdapter

The `BrokerAdapter` acts as a gatekeeper between your trading strategy and the actual broker, ensuring smooth and safe transactions. It's designed to intercept key actions like opening/closing signals, taking profits, and adjusting stop-loss orders *before* any changes are made to your core trading data.

During testing or simulations (backtests), these broker interactions are skipped entirely, allowing you to evaluate your strategy without real-world broker limitations. However, in live trading, the `BrokerAdapter` relays these actions to your registered broker.

Crucially, if any of the `commit*` methods (like `commitSignalOpen`, `commitPartialProfit`, etc.) encounter an error, the intended changes to your trading data are blocked, preventing potential issues.

To make this work, you need to first tell the `BrokerAdapter` which broker to use using `useBrokerAdapter` and then activate it with `enable`. The `enable` function also provides a way to shut it down safely with `disable`. Also, remember to clear the adapter if the underlying context changes, like when changing directory.

## Class BreakevenUtils

This class helps you analyze and understand breakeven protection events that occur during your trading backtests or live trading. It's like a central hub for getting information about these events, letting you see how often they happen and generate reports to examine them. 

You can retrieve aggregated statistics about breakeven events, such as the total count, to gain a high-level understanding of their frequency.  It also enables creating detailed markdown reports that show individual breakeven events in a well-formatted table, including important details like the symbol, strategy used, entry and breakeven prices, and the time the event occurred. Finally, you can easily save these reports as markdown files to your computer for later review or sharing, with the file name automatically generated based on the symbol and strategy. The class handles the file saving and directory creation for you.

## Class BreakevenReportService

The BreakevenReportService is designed to keep track of when your trading signals reach their breakeven point. It listens for these "breakeven" events and diligently records them. 

Think of it as a system that makes sure you don't miss important milestones in your trading strategy's performance.

It stores this data, along with all the details about the signal that achieved breakeven, in a database, ready for you to analyze. 

To use it, you'll subscribe to the signal emitter to start receiving these events, and you can unsubscribe later when you no longer need this tracking.  The system prevents accidental double-subscription to avoid any unwanted behavior.


## Class BreakevenMarkdownService

The BreakevenMarkdownService helps you automatically create and save reports about breakeven events for your trading strategies. It listens for these events and organizes them, then generates nicely formatted markdown tables summarizing the data.

This service keeps track of breakeven events for each symbol and strategy you use, storing them separately to prevent conflicts. It provides a way to get overall statistics about your breakeven events, and can save these reports as markdown files on your computer.

You can subscribe to receive breakeven event updates, and unsubscribe when you no longer need them.  The `tickBreakeven` function is crucial for processing the events as they come in.  The service offers easy ways to retrieve the data, generate reports, and save them to disk, and it has a convenient `clear` function to remove all the accumulated data.

## Class BreakevenGlobalService

This service, called BreakevenGlobalService, acts as a central point for managing breakeven tracking within the system. It simplifies things by providing a single place to inject necessary components and ensuring all breakeven-related actions are logged consistently. Think of it as a coordinator that relays requests to a more specialized connection service while keeping a record of what's happening.

It's designed to be used within a ClientStrategy and relies on other services for tasks like validating strategies, schemas, risks, exchanges, and frames.

The `validate` function helps ensure that strategy configurations are valid and avoids unnecessary checks by remembering previous validations. The `check` function determines if a breakeven should occur and initiates that process, with logging before passing the work along. Finally, the `clear` function handles resetting the breakeven state when a signal is closed, again with logging and delegation.

## Class BreakevenConnectionService

The BreakevenConnectionService manages and tracks breakeven points for trading signals. It ensures that each unique signal has its own dedicated tracking instance, preventing conflicts and optimizing performance through a caching mechanism. 

Think of it as a central hub: when a signal needs its breakeven point checked or cleared, this service handles the work, creating and managing the necessary components.

The service is designed to work seamlessly with other parts of the trading system and keeps track of these breakeven instances, cleaning them up when they’re no longer needed.

It provides functions to check if a signal has reached a breakeven point, and to reset the tracking when a signal is closed. You don't have to worry about the details of how these instances are created and stored; this service handles that for you.


## Class BacktestUtils

This class provides tools to simplify and manage backtesting operations. It acts as a central hub for running tests and accessing related data.

The `run` method executes a backtest for a specific symbol and strategy, providing a stream of results.  You can also run a backtest in the background (`background`) without directly receiving results, which is useful for tasks like logging or running tests without interrupting the main process.

To retrieve information about a pending or scheduled signal, use methods like `getPendingSignal`, `getScheduledSignal`, `hasNoPendingSignal`, or `hasNoScheduledSignal`. These functions are helpful for checking if signals exist and setting up logic accordingly.

Several methods offer insights into a position's performance. You can get information like total percentage closed (`getTotalPercentClosed`), total cost closed (`getTotalCostClosed`), or the effective entry price (`getPositionEffectivePrice`). Functions like `getPositionPnlPercent` and `getPositionPnlCost` calculate profit/loss, while `getPositionLevels` displays the DCA entry prices.

The `getBreakeven` function checks if the price has moved enough to cover costs and potentially reach breakeven.

The framework provides more granular control with functions like `commitPartialProfit` (for partial profit closes), `commitAverageBuy` (to add DCA entries), and `commitTrailingStop` (to adjust trailing stops).

You can also retrieve performance statistics, like maximum drawdown and distances from peak profit, using methods like `getPositionHighestProfitDistancePnlPercentage`.

Finally, the `stop` method allows you to halt a backtest, and `commitCancelScheduled` and `commitClosePending` enable early termination of scheduled or pending signals. `list` method allows you to see a summary of current backtest status.

## Class BacktestReportService

The BacktestReportService helps you track and analyze your trading strategies by recording every significant event during backtesting. It essentially acts as a detailed log, capturing everything from when a signal is idle to when it's opened, active, or closed.

This service listens for events generated by your backtest and saves all the information, including specifics about the signal, to a SQLite database. This allows you to review and debug your strategies effectively.

You can easily start receiving these events using the `subscribe` function, which prevents you from accidentally signing up multiple times. When you’re done collecting data, the `unsubscribe` function neatly stops the recording process, making sure you don't continue logging unnecessarily. The `tick` property is responsible for processing the events and preparing them for database storage, while `loggerService` handles any debugging output.


## Class BacktestMarkdownService

The BacktestMarkdownService helps you automatically create and save reports during backtesting. It listens for signals generated during backtests and keeps track of the results of closed trades for each strategy. It builds easy-to-read markdown tables summarizing this information, making it simple to analyze your backtest outcomes.

This service organizes data using a clever system – each unique combination of symbol, strategy, exchange, frame, and backtest gets its own dedicated storage space, preventing data from different tests from getting mixed up.

You can request the data and generate reports for specific symbol-strategy combinations, or clear all accumulated data when you're finished. There’s also a way to subscribe to receive these tick events and a corresponding way to unsubscribe when you're done. Finally, the service handles saving these reports directly to your disk, organized neatly within the logs/backtest folder.

## Class BacktestLogicPublicService

This service helps orchestrate backtesting processes, making it easier to run simulations. It automatically manages the context needed for your backtesting, like the strategy name, exchange, and frame. 

You don't need to manually pass these details to every function; the service handles it for you.

The `run` function is your main entry point for a backtest. It takes a symbol as input and produces a stream of results—like signals to open, close, or cancel trades—using an async generator. Essentially, it runs the backtest and gives you the results step-by-step.


## Class BacktestLogicPrivateService

The BacktestLogicPrivateService manages the entire backtesting process, handling data flow and ensuring efficiency. It works by first retrieving timeframes from a frame service, then processing each timeframe one at a time. 

When a trading signal indicates a new position should be opened, the service fetches the necessary candle data and runs the backtest logic for that specific event. It then efficiently skips any timeframes until the position is closed.

The service delivers backtest results incrementally, avoiding the creation of large, memory-intensive arrays. This means it streams results as they become available. You can also stop the backtest early by breaking out of the consuming loop.

To run a backtest, you provide the symbol you wish to test, and it returns an async generator that produces results as a stream. This allows for flexible and responsive integration into your backtesting workflows.


## Class BacktestCommandService

The BacktestCommandService acts as a central point to kick off backtesting processes. It's designed to be easily integrated into different parts of your application, providing a straightforward way to access the core backtesting engine. 

This service relies on several other components for its operation, including services to manage logging, strategy definitions, risk assessment, and validation of actions, strategies, exchanges, and frames. 

The primary method, `run`, is how you initiate a backtest. You provide the symbol you want to backtest and details about the strategy and environment to use, like the strategy name, exchange, and frame – and it will return a series of results detailing how the strategy performed over time, including order openings, closings, and cancellations.

## Class ActionValidationService

The ActionValidationService helps keep track of your action handlers—those pieces of code that react to different events—and makes sure they're all set up correctly. Think of it as a central manager for your actions.

You use `addAction` to register new handlers so the service knows about them. 

The `validate` function is crucial; it checks that an action handler actually exists before your application tries to use it, preventing errors. 

To see what action handlers you've registered, you can use `list`. The service is also designed to be efficient by remembering previous validation results, a technique called memoization.

## Class ActionSchemaService

The ActionSchemaService is responsible for managing and keeping track of different action schemas, which define how actions are executed within the system. It uses a type-safe storage system to ensure consistency and correctness.

It makes sure action handlers (the code that actually performs the action) only use methods that are explicitly permitted.

Here’s what it can do:

*   It lets you register new action schemas in a way that’s checked for errors.
*   It verifies that the methods used within an action handler are allowed.
*   You can even update existing schemas with just the changes you need.
*   It allows for private methods to be used without interference.
*   It provides a way to fetch a complete action schema configuration when needed.

The `register` method adds new action schemas, `override` updates existing ones, and `get` retrieves a schema by its name. The `validateShallow` method performs preliminary checks before a schema is registered.

## Class ActionProxy

The `ActionProxy` acts as a safety net around your custom trading logic, ensuring that errors in your code don't crash the entire backtesting system. Think of it as a protective wrapper around the functions you provide to the framework. It’s designed to be incredibly robust—if a function you define has an error, the `ActionProxy` will catch it, log it, and keep the backtest running smoothly.

It uses a special pattern where it expects you to provide a partial implementation of actions, and it will fill in the gaps gracefully by returning `null` if a method isn't defined.

Here’s a breakdown of what it handles:

*   **Initialization:** The `init` method is wrapped to prevent errors during setup.
*   **Signal Handling:** It safely manages signal events in different modes (general, live, backtest) which are triggered during strategy evaluations.
*   **Breakeven and Profit/Loss Levels:** Handles events related to reaching breakeven, partial profits, and partial losses.
*   **Scheduled Pings:** Deals with regular pings related to scheduled and active signals.
*   **Risk Rejection:** Manages events when signals are rejected by risk management.
*   **Synchronization:** A dedicated gate (`signalSync`) exists for handling limit order transactions and will propagate errors directly.
*   **Cleanup:** The `dispose` method ensures cleanup occurs safely.
*   **Factory Creation:**  The `fromInstance` method provides the correct way to create an `ActionProxy` object, ensuring it’s set up with error handling.

Essentially, `ActionProxy` is your safeguard, enabling you to build and test trading strategies with confidence, knowing that unexpected errors won't derail the entire process.

## Class ActionCoreService

The ActionCoreService acts as a central hub for managing actions within your trading strategies. It essentially takes the list of actions defined in your strategy’s configuration and makes sure they are executed in the right order and with the correct data.

It handles several key tasks:

*   **Action Management:** It fetches actions from the strategy’s blueprint and calls specific handlers for each one.
*   **Validation:** It verifies that the strategy, exchange, and frame being used are all valid and that any associated risks and actions are also configured correctly.  This process is optimized so it isn't repeated unnecessarily.
*   **Event Routing:** It distributes various events like market signals, breakeven notifications, partial profit updates, and ping requests to the appropriate actions.

Different methods, such as `signal`, `signalLive`, `signalBacktest`, handle different types of signal events, ensuring each action receives the appropriate information.  Similarly, there are methods for events related to risk, position synchronization, and cleanup.

The `initFn` initializes actions, and `dispose` cleans up after strategy execution. The `clear` function allows you to reset action data.  Ultimately, the ActionCoreService ensures actions are executed smoothly and consistently across different strategies and environments.

## Class ActionConnectionService

This service is responsible for directing different actions within your trading strategies to the correct implementation. It acts like a central router, making sure the right code handles specific events.

The `getAction` property is key - it fetches pre-built action handlers, and cleverly caches them to avoid repeated creation, optimizing performance. These cached handlers are specific to a combination of strategy, exchange, and frame, ensuring the correct action is used for each scenario.

Essentially, you'll be using the various `signal...`, `breakevenAvailable`, `partialProfitAvailable`, `ping...`, `riskRejection`, and `signalSync` methods to pass events to the appropriate action handlers, and the `dispose` and `clear` methods manage resource cleanup and cache invalidation. The `initFn` handles the initial setup and loading of any required data for an action.

## Class ActionBase

This class, `ActionBase`, is designed to help you build custom actions within the backtest-kit framework. Think of it as a foundation for extending the system’s behavior without having to write a lot of boilerplate code. It handles common tasks like logging events and provides access to key information about the strategy.

It's intended for tasks like managing your strategy's state (using Redux, Zustand, or similar), sending notifications via Telegram or Discord, keeping track of events for monitoring, and even triggering custom actions based on specific conditions.

When you create a custom action, you'll inherit from `ActionBase` and override only the methods that you need.  The class takes care of logging, making sure everything is recorded, and provides the strategy name, frame name, and action name for context.

The lifecycle involves initialization (`init`), regular signal handling (`signal`, `signalLive`, `signalBacktest`), and cleanup (`dispose`).  Different events like breakeven achievement, profit/loss milestones, scheduled pings, and risk rejections are also handled via specific methods, each with a default logging implementation that you can customize. This lets you extend the core functionality of the trading framework.

