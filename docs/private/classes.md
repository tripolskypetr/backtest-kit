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

The WalkerValidationService helps you keep track of and verify your parameter sweep configurations, which are used for things like optimizing trading strategies or tuning hyperparameters. Think of it as a central place to register and check if your parameter sets are correctly defined before you start running tests.

It essentially manages a collection of these parameter sets (called walkers).

You can add new walkers to the system using the `addWalker()` method.

Before running any tests or analyses using a specific walker, you'll want to use `validate()` to make sure it’s properly registered.  This prevents errors and ensures everything is set up correctly.

If you need to see all the walkers you've registered, the `list()` function provides a quick way to get a list of all configurations. 

The service also optimizes its performance by remembering the results of validations, so it doesn't have to repeatedly check the same walkers.

## Class WalkerUtils

WalkerUtils simplifies interacting with and managing walker comparisons, which are essentially automated tests of trading strategies. It provides a straightforward way to execute these tests and offers tools for monitoring their progress and generating reports. The class acts as a central hub for these operations, automatically handling details like identifying the specific trading system and comparison setup to use.

You can run walker comparisons directly, execute them in the background for tasks like logging or triggering callbacks without needing to process every update, or halt ongoing comparisons to prevent new signals from being generated. It also allows retrieving complete results and generating a formatted markdown report detailing the comparison.

Finally, WalkerUtils lets you check the status of running walker instances and save the generated reports to a file. It's designed to be easily accessible throughout your application, ensuring a consistent way to manage and observe these critical trading tests.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of and manage your walker schemas, which are essentially blueprints for how your walkers operate. It uses a special system to store these schemas in a type-safe way, reducing errors.

You can add new walker schemas using the `addWalker()` method (represented here as `register`) and find them again later by their name using `get()`.

Before a new schema is officially added, the `validateShallow()` method quickly checks if it has all the necessary parts and if those parts are of the expected types – this helps prevent issues down the line.

If a schema already exists, you can update it with new information using `override()`, which lets you change specific parts without having to redefine the whole schema.

The service also has a built-in logging system (`loggerService`) to help you track what’s happening. Finally, it holds the actual schema registry internally (`_registry`), though you typically won’t interact with it directly.

## Class WalkerReportService

WalkerReportService helps you keep track of how your trading strategies are performing during optimization. It listens for events from your optimization process and records key details like metrics and statistics. This allows you to easily compare different strategies and see how your optimization is progressing over time. 

The service uses a database to store these results, making it simple to analyze and understand your optimization journey.

You can start receiving these updates by using the `subscribe` function, which will return a function to stop the updates with `unsubscribe`. It’s designed to prevent accidental duplicate subscriptions, ensuring smooth operation.

## Class WalkerMarkdownService

This service helps you create reports about your trading strategies, specifically focusing on what’s happening during "walker" simulations. It listens for updates from these simulations and gathers information about how different strategies are performing.

It keeps track of results for each simulation separately, ensuring that data for one strategy doesn't interfere with another. It then organizes this data into easy-to-read tables, which it can save as markdown files for detailed analysis.

You can subscribe to receive updates as the simulations run, and unsubscribe when you no longer need them. The service allows you to retrieve specific data points, generate full reports, and save them to disk. It can also clear out old data when you want to start fresh. If you're looking to generate reports on how your trading strategies are doing, this service is designed to help.


## Class WalkerLogicPublicService

This service helps coordinate and manage the execution of walkers, which are essentially the building blocks of your trading strategies. It builds upon a private service to seamlessly pass along important information like the strategy name, exchange, frame, and walker identifier.

Think of it as a conductor ensuring everything runs smoothly and consistently.

The `run` method is the key – it takes a symbol (like a stock ticker) and context data, then kicks off the walker comparison process. This function handles the actual execution of your backtests. It will iterate through all strategies.


## Class WalkerLogicPrivateService

WalkerLogicPrivateService helps you compare different trading strategies against each other. It manages the process of running these strategies and provides updates as they finish.

The service keeps track of the best performance seen so far and then delivers a final report showing how all the strategies stack up in a ranked order. 

It relies on BacktestLogicPublicService to actually execute the individual trading strategies.

The `run` method is the main way to use the service - you give it a stock symbol, a list of strategies to test, and the metric you want to optimize for (like profit or drawdown).  It then runs each strategy one after another, providing progress updates along the way.


## Class WalkerCommandService

WalkerCommandService acts as a central access point for interacting with walker functionality within the system. Think of it as a convenient layer on top of WalkerLogicPublicService, designed to make it easier to incorporate walker operations into different parts of your application.

It manages several services involved in the process, including validation services for strategies, exchanges, frames, walkers, and risk assessment, as well as services that handle schemas and logging.

The primary function it exposes is the `run` method. This method allows you to execute a walker comparison, specifying the symbol you want to analyze, along with important context details like the names of the walker, exchange, and frame being used. It returns a generator that yields the results of the walker comparison, allowing for a stream of information.

## Class TimeMetaService

The TimeMetaService helps you get the most recent candle timestamp for a specific trading setup – think symbol, strategy, exchange, and timeframe – even when you're not actively running a trade. It’s like having a reliable clock that always knows the latest time for your trading.

It keeps track of these timestamps in a smart way, storing them and updating them automatically as your strategies run. If you need that timestamp outside of the usual trading loop, the service provides it to you. If a timestamp hasn't arrived yet, it waits briefly for it.

To keep things clean and efficient, the service manages these stored timestamps, allowing you to clear them out entirely or just for a specific trading setup. This ensures you're always working with the freshest data and avoids potential issues caused by old timestamps. The service is designed to work seamlessly with other parts of the trading system, and it's automatically updated and reset as needed.

## Class SystemUtils

The SystemUtils class helps keep your backtesting sessions separate and clean. It prevents one backtest from accidentally affecting another, which is crucial for reliable results.

Think of it as creating a temporary "safe zone" for each test.

The `createSnapshot` function lets you create a backup of the current event listeners before a backtest starts. This backup lets you restore everything to its original state once the test is finished, ensuring a fresh start for the next session. It’s like hitting a reset button for the event listeners.

## Class SyncUtils

SyncUtils helps you understand what’s happening with your trading signals over time. It gathers information about when signals are opened and closed.

This class provides ways to get data about the signals—like how many were opened and closed—and create easy-to-read reports.

You can retrieve summarized statistics about signal activity, or generate detailed markdown reports that show each signal's specifics, including its entry and exit details and performance.

Finally, SyncUtils can automatically save these reports as files, organizing them by symbol, strategy, and whether they are backtest or live data. This makes it simple to track and analyze your trading activity.

## Class SyncReportService

The SyncReportService is designed to keep a record of when your trading signals are created and closed. It listens for signal events, specifically when a signal is opened (like a limit order being filled) and when a signal is closed (when a position is exited). 

It diligently logs detailed information about these events – for signal openings, it captures the full signal details, and for signal closures, it includes profit and loss data along with the reason for the exit.

This service then uses a `ReportWriter` to store these events persistently, ensuring an audit trail for order management. To prevent accidental duplicates, it uses a mechanism to ensure only one subscription is active at a time.

You can start listening for these events by using the `subscribe` method, which returns a function you can call later to stop listening. The `unsubscribe` method provides a clean way to end the subscription process, ensuring no further events are recorded.

## Class SyncMarkdownService

This service is responsible for creating and saving reports detailing the lifecycle of signals, such as when they are opened and closed. It keeps track of these signal events and organizes them by symbol, strategy, exchange, timeframe, and whether it’s a backtest or live trade.

The service listens for signal events, recording each one and generating detailed reports in markdown format. These reports will include a summary of the signal's journey, including when it opened, when it closed, and any reasons for closure.  You also get statistics like the total number of events, opens, and closes. 

To start receiving signal events, you need to subscribe to a designated event stream.  The system prevents accidental duplicate subscriptions, so the first subscription call returns a way to unsubscribe. When you’re finished, you can unsubscribe, which cleans up everything and stops the service from listening for new events.

The `getData` function provides a snapshot of the accumulated statistics for a specific signal, letting you check the overall health and performance of a particular signal.  You can also generate reports on demand using the `getReport` function. The `dump` function takes the report and saves it as a file.  Finally, `clear` allows you to wipe the accumulated data, either for a specific signal setup or everything entirely.

## Class StrategyValidationService

The StrategyValidationService helps you keep track of your trading strategies and make sure they're set up correctly. It acts like a central manager, registering your strategies and checking if they exist before you try to use them. 

It also verifies that any linked risk profiles and actions are also valid, ensuring a smooth and error-free trading experience. 

To speed things up, it remembers the results of previous validation checks.

Here's what you can do with it:

*   **Register new strategies:** Use `addStrategy` to add your strategy configurations.
*   **Validate strategies:** `validate` makes sure your strategies and their related settings are in order.
*   **See all registered strategies:** `list` gives you a complete overview of all the strategies you’ve registered.

It relies on other services—the logger, risk validation, and action validation—to handle specific checks.

## Class StrategyUtils

StrategyUtils helps you understand how your trading strategies are performing by providing tools to analyze and report on their activity. Think of it as a central place to gather information about what your strategies are doing – whether they're closing positions, taking profits, or adjusting stops.

It lets you easily pull out key statistics like how often a strategy is taking certain actions. You can also generate detailed reports in a readable format that shows all the events your strategies have triggered, including important details like price, percentage values, and timestamps.

Finally, it can automatically save these reports to files, so you can keep a record of your strategies' behavior over time. You can specify which columns to display in the report and customize the file naming. The system keeps a limited history of events – about 250 events per strategy and symbol combination – so you don't get overwhelmed with data.

## Class StrategySchemaService

This service acts as a central hub for managing and storing strategy schemas, ensuring they are consistently structured and typed. It uses a specialized registry to keep track of these schemas in a type-safe way.

You can add new strategies to the registry using the `addStrategy()` function (represented here as `register`). To find a specific strategy, just use its name with the `get()` function.

Before a new strategy is added, the service performs a quick check (`validateShallow`) to make sure it has the basic, necessary properties.

If you need to update an existing strategy, you can use the `override()` function to apply changes, ensuring you don’t have to redefine the entire schema.

The service also has an internal logger to help track and debug any issues that might occur during strategy management.

## Class StrategyReportService

This service helps you keep a detailed audit trail of what your trading strategies are doing. It records key events like canceling scheduled orders, closing pending orders, taking partial profits or losses, adjusting stop-loss and take-profit levels, and moving the stop-loss to breakeven.

Think of it as a way to create a persistent log of your strategy’s actions, which is great for reviewing and debugging. Unlike a service that accumulates data in memory, this one writes events directly to files as they happen.

To start using it, you need to "subscribe" to begin logging. Once subscribed, events are saved to JSON files. When you're done, you can "unsubscribe" to stop the logging process. It’s important to subscribe before logging events and unsubscribe when you no longer need the audit trail. Each event type (cancel-scheduled, close-pending, etc.) has its own method to record the details.

## Class StrategyMarkdownService

This service helps you keep track of what's happening with your trading strategies during backtesting or live trading. It acts like a central log, collecting details about actions like canceling orders, closing trades, and adjusting stop-loss levels.

Instead of immediately saving every action, it temporarily stores them, allowing for more efficient batch reporting and analysis.

To start using it, you need to "subscribe" to begin collecting events. It then automatically records events as your strategy executes.  You can later retrieve statistics, generate formatted reports in Markdown, or export those reports to files. When you're finished, you "unsubscribe" to stop collecting data and clean up the memory.

The service uses a clever caching system to manage the storage of events for each strategy and symbol combination.

It provides functions to record specific trade actions:
- `cancelScheduled`: Records when a scheduled order is canceled.
- `closePending`: Records when a pending order is closed.
- `partialProfit/Loss`: Records when a portion of the position is closed for profit or loss.
- `trailingStop/Take`: Records adjustments to trailing stop-loss or take-profit levels.
- `breakeven`: Records when the stop-loss is adjusted to the entry price.
- `activateScheduled`: Records when a scheduled signal is activated early.
- `averageBuy`: Records when a new averaging entry (DCA) is made.

You can get a summary of the events (`getData`) or a detailed report (`getReport`) in markdown format.  The `dump` function combines these two, creating a file.  The `clear` method allows you to erase any accumulated event data.

## Class StrategyCoreService

This service acts as a central hub for managing trading strategies within the backtest framework. It wraps other services to inject relevant information, like the trading symbol, timeframe, and backtest settings, into the trading execution process. It handles validations, retrieves key data points about a position (like cost, P&L, and entry prices), and provides methods to interact with the strategy, such as closing positions, stopping signals, and performing backtests. It's a key component used internally by other backtesting services.

The service offers a range of methods to query the status of a position, including its total cost, P&L, entry prices, partial closures, and more. It also provides functionality to adjust stop-loss and take-profit levels, cancel scheduled signals, and dispose of strategies. Memoization is used to optimize validation performance. Data returned by these functions provides useful insights into a position’s performance and history.


## Class StrategyConnectionService

The StrategyConnectionService acts as a central router for your trading strategies. It intelligently finds the right strategy implementation based on the trading symbol and its specific configuration, optimizing performance by caching these strategy instances.

Essentially, it handles requests to strategies, ensuring they're correctly initialized and executed, whether you're running live trades or backtesting historical data.

Here’s a breakdown of what it does:

*   **Smart Routing:** Directs strategy calls to the correct implementation, based on symbols and other configuration details.
*   **Performance Boost:**  Caches strategy instances to avoid recreating them repeatedly, which speeds things up.
*   **Proper Initialization:** Makes sure strategies are ready to go before any trading actions happen.
*   **Handles Live & Historical Data:** Works equally well for real-time trading (ticks) and analyzing past performance (backtesting).

The service provides methods for retrieving signals, position details (like cost, P&L, levels), and managing signals (partial closes, average buy, scheduled activation). It also provides mechanisms to safely stop a strategy and clear cached data.  All data access methods are context-aware, ensuring operations are properly isolated based on exchange and trading frame.

## Class StorageLiveAdapter

The `StorageLiveAdapter` provides a flexible way to manage how your trading signals are stored. It acts as a central point for interacting with different storage mechanisms, allowing you to easily switch between persistent storage (saving to disk), in-memory storage (temporary storage), or a dummy adapter (for testing purposes where no actual storage happens). 

You can choose your storage method using methods like `usePersist`, `useMemory`, and `useDummy`, and the system remembers your choice for subsequent operations.  The `clear` method is useful for resetting this choice when your working environment changes.

The adapter also handles various events related to signal activity – opening, closing, scheduling, and cancellations – forwarding these actions to the currently selected storage implementation.  You can also retrieve signals by ID or list all signals, again relying on the active storage adapter. Finally, it provides a factory to control the creation of storage utilities, allowing for even greater customization.

## Class StorageBacktestAdapter

This component provides a flexible way to manage how trading signal data is stored during backtesting. It allows you to easily switch between different storage methods, like persistent storage on disk, keeping data in memory, or even using a "dummy" adapter that doesn't actually save anything.

It acts as a middleman, delegating tasks like retrieving, listing, and updating signals to the currently selected storage method. You can swap out the storage backend by using the `useStorageAdapter` method, which lets you specify which implementation to use.

There are built-in options for quickly switching to persistent, memory, or dummy storage with `usePersist`, `useMemory`, and `useDummy`, respectively.  If you're running multiple backtests where the base directory changes, you’ll want to call `clear` to force a fresh storage adapter instance to be created. The `handleOpened`, `handleClosed`, `handleScheduled`, and `handleCancelled` methods pass along signal events to the underlying storage adapter.

## Class StorageAdapter

The StorageAdapter acts as a central hub for managing both the signals from your backtesting simulations and any live trading data. It automatically keeps track of new signals as they are generated, streamlining how you access and use this information.

You can control whether the adapter is actively listening for new signals using the `enable` property, which ensures a subscription only happens once. Conversely, `disable` provides a safe way to stop the adapter from receiving and storing signals, and it’s fine to call this multiple times.

Need to look up a specific signal? `findSignalById` lets you locate signals based on their unique identifier, regardless of whether they originate from backtest or live data. If you want to see all the signals from your backtesting simulations, use `listSignalBacktest`. Similarly, `listSignalLive` retrieves all signals from your live trading environment.

## Class StateLiveAdapter

The StateLiveAdapter provides a flexible way to manage and store the state of your trading signals. Think of it as a central hub for keeping track of important data like peak percentages and how long a position has been open. It's designed to be adaptable; you can easily switch between different storage methods, from keeping data in memory for quick access to persisting it to a file for long-term reliability.

You can choose to save state data to a file on your computer (the default), keep it only in the current running program’s memory, or even use a "dummy" adapter that essentially ignores any changes. This makes it really useful for testing and experimentation.

The system is clever in how it manages these state instances, only creating them when needed and clearing them out when signals are closed. This optimization is key to performance.

It’s particularly helpful for strategies that need to react to specific events, such as automatically closing trades based on performance indicators over time—like the example given about using an LLM to assess a trade's progress and exiting if it doesn’t meet certain criteria. The data it tracks will survive restarts and you don't have to worry about losing that information.

To completely refresh the state, you can clear the cache, which is especially useful when changing the working directory for a strategy.


## Class StateBacktestAdapter

The `StateBacktestAdapter` provides a flexible way to manage the state of your backtesting environment, allowing you to easily switch between different storage methods. By default, it uses an in-memory storage, meaning all data is held in the process's memory and isn't saved when the process ends.

You have the option to change this behavior and use a persistent storage solution that saves data to disk, or a dummy adapter that effectively ignores any state changes – useful for testing or isolating certain scenarios.

The adapter is designed to track specific information like peak performance and how long a position has been open, which is particularly helpful for implementing automated trading rules based on LLM-driven insights. For example, if a trade doesn't reach a certain performance threshold after a set amount of time, the adapter can trigger an automatic exit.

To manage memory and ensure data consistency, there are methods to dispose of old state data related to a specific signal, and to clear the entire cache of memoized data when needed, like when the working directory changes. Essentially, it’s a modular system for keeping track of your backtesting progress and adapting it to different needs.

## Class StateAdapter

The StateAdapter is the central hub for managing your trading state, whether you're running a backtest or live trading. 

It handles the behind-the-scenes work of keeping track of your data and cleaning up when things change.

Think of it like this: it listens for events related to your trading signals and automatically makes sure old data gets cleared out, preventing confusion.

You can use it to either get the current state of a signal, or to update the state when necessary.  The adapter figures out whether you're in backtest or live mode and sends the request to the appropriate storage.

The `enable` property lets you start tracking state, making sure everything's set up correctly.  `disable` lets you stop that tracking—and it's perfectly safe to call this multiple times.


## Class SizingValidationService

This service helps you keep track of and ensure your position sizing strategies are set up correctly. It acts as a central place to register your different sizing approaches, like fixed percentages or Kelly Criterion. 

Before you try to use a sizing strategy, this service will confirm it's actually registered, preventing errors and making your backtesting process more reliable.

For efficiency, it remembers the results of these checks so it doesn't have to re-validate strategies repeatedly. 

You can use it to:

*   Add new sizing strategies to your registry.
*   Verify that a sizing strategy exists before using it.
*   Get a complete list of all the sizing strategies you've registered.

## Class SizingSchemaService

The SizingSchemaService helps you keep track of your sizing schemas, which define how much of an asset to trade. It uses a special registry to safely store these schemas.

You add sizing schemas using `addSizing()` and find them later by their name.

Before a sizing schema is added, a quick check makes sure it has all the necessary parts and that they’re the right type.

The `register` method lets you add new sizing schemas to the registry.
The `override` method lets you update existing sizing schemas with just the changes you want to make.
Finally, the `get` method helps you find a specific sizing schema by its name.

## Class SizingGlobalService

The SizingGlobalService helps determine how much of an asset to trade. It's a central part of the backtest-kit framework, handling position sizing calculations behind the scenes for both the strategy execution and the tools you use. 

Think of it as a coordinator; it uses a sizing connection service and a validation service to do its job.

The `calculate` function is the key – it takes information about your risk parameters and the situation (like the sizing name) and figures out the appropriate position size. The service also has properties for logging and interacting with other services, which are managed internally.


## Class SizingConnectionService

This service handles the calculations needed to determine how much of an asset to trade, based on your chosen sizing strategy. It acts as a central point, directing sizing requests to the right implementation, whether it's a fixed percentage, a Kelly criterion approach, or something else. 

To improve efficiency, it remembers which sizing strategies it's already set up, so it doesn't have to recreate them every time you need to calculate a size.

The service relies on a schema service to understand the sizing configurations and a logger for tracking what’s happening. You specify which sizing method to use through a name, and if a strategy doesn't have a custom sizing setup, you’ll use an empty string as the sizing name. 

The `getSizing` property is the main way to get a sizing instance, remembering past requests to avoid recreating it. `calculate` then uses this to compute the actual position size, taking into account your risk parameters and the selected sizing method.


## Class SessionLiveAdapter

The SessionLiveAdapter provides a flexible way to manage data during live trading sessions. Think of it as a central hub that can store and retrieve session information, and it’s designed to be easily swapped out with different storage methods. 

By default, it uses a persistent storage that saves data to your computer's file system, meaning your data survives even if the program restarts. You also have the option to use a temporary, in-memory storage for quicker testing, or a dummy storage that simply ignores any data changes.

It intelligently caches these storage options, creating a specific instance based on the trading symbol, strategy name, exchange, and the timeframe being used, avoiding unnecessary overhead.

You can easily change how data is stored using convenient commands like `useLocal`, `usePersist`, `useDummy`, or even define and use your own custom storage adapter.  If your working directory changes during your strategy's runtime, it's helpful to clear the cache using `clear` to ensure fresh instances are used.

## Class SessionBacktestAdapter

This component, the SessionBacktestAdapter, provides a flexible way to manage and store data during backtesting. It acts as a bridge, allowing you to easily swap out different storage methods without changing the core backtesting logic.

By default, it uses an in-memory storage, meaning all data is kept in the program's memory.  However, you can switch to storing data on disk for persistence or use a dummy adapter for testing purposes.

You can control how the data is stored using convenient methods like `useLocal`, `usePersist`, and `useDummy`. If you need even more control, `useSessionAdapter` lets you plug in your own custom storage solution.

The adapter keeps track of session data for each trading symbol, strategy name, exchange, and timeframe to optimize performance.  If you change the directory where your backtest data is stored (using `process.cwd()`), you can clear the internal cache with `clear` to ensure fresh instances are created. The `getData` and `setData` methods provide the means to retrieve and update the session data.

## Class SessionAdapter

The SessionAdapter acts as a central hub for handling data storage during both backtesting and live trading sessions. Think of it as a traffic director, ensuring that data requests and updates are sent to the correct place – either the backtest storage or the live session storage – depending on whether you’re running a test or a real-time trade.

You can retrieve existing data using the `getData` method, specifying the symbol, context (like strategy and exchange names), whether it's a backtest, and the timestamp. Similarly, the `setData` method allows you to update the stored data, again ensuring it goes to the right location. It simplifies the data management process by abstracting away the underlying differences between backtesting and live trading environments.


## Class ScheduleUtils

This class offers tools to analyze and report on scheduled trading signals. Think of it as a way to keep tabs on how your automated trading strategies are performing when it comes to signal execution. 

It helps you monitor signals waiting in a queue, signals that were cancelled, and calculate metrics like cancellation rates and average wait times. 

You can also use it to generate easy-to-read markdown reports detailing the signal lifecycle for specific trading strategies. 

The `getData` method retrieves performance statistics, `getReport` creates a formatted markdown report, and `dump` saves those reports directly to a file. It’s designed for simple, consistent access to these reporting functions, using a single, readily available instance.


## Class ScheduleReportService

The ScheduleReportService helps you keep track of your scheduled signals and how long they take to execute or get cancelled. It listens for events related to signals being scheduled, activated, or cancelled.

It calculates the time elapsed between when a signal is scheduled and when it either starts running or is cancelled. This information is then saved to a database for later analysis and troubleshooting of any potential delays.

You can use the `subscribe` function to start listening for these signal events, and remember to use the returned function to `unsubscribe` when you no longer need to track them. If you try to subscribe multiple times, it will only register the first attempt, preventing unnecessary processing. The `unsubscribe` function gracefully stops the service from listening for events, ensuring clean operation.

## Class ScheduleMarkdownService

This service automatically creates reports detailing scheduled trading signals, helping you analyze your strategies. It monitors when signals are scheduled and cancelled, keeping track of events for each strategy.

The reports are presented in a readable markdown format, showing detailed information about each event, and include helpful statistics like the cancellation rate and how long signals typically wait before execution.

These reports are saved to your logs folder, making it easy to review and understand the performance of your trading strategies over time.

You can subscribe to receive updates on scheduled signals, unsubscribe when you no longer need them, and clear the accumulated data when necessary. You can also request specific reports and dump them to disk in markdown format. The system organizes data into isolated storage for each unique combination of symbol, strategy, exchange, frame, and backtest.

## Class RiskValidationService

This service helps you keep track of and confirm your risk management settings. It acts like a central hub for all your defined risk profiles.

You can register new risk profiles using `addRisk`, and before you actually use a profile, `validate` makes sure it exists, preventing errors.

To improve performance, the results of these validations are cached, so repeated checks don't slow things down.

If you need to see what risk profiles you've set up, `list` will give you a complete list of them. 

The service also keeps a record of a logging service and an internal map for managing risk profiles.

## Class RiskUtils

RiskUtils helps you analyze and understand why your trading strategies might be getting flagged for risk. Think of it as a tool to dig into rejection events – moments when your strategy triggered a risk check.

It gathers information from events related to risk rejections, keeping track of things like the symbol being traded, the strategy used, the position taken, and the reason for the rejection.

You can use it to get summaries of rejection statistics, like how many times a particular strategy was rejected or how many rejections occurred for a specific symbol.  It can also create readable reports in Markdown format, essentially building a table of these rejection events with details like the price, position size, and timestamp.

Finally, RiskUtils provides a simple way to export these reports to files, making it easier to share or archive your risk rejection data. These files are named based on the symbol and strategy used, like "BTCUSDT_my-strategy.md".

## Class RiskSchemaService

This service helps manage and store risk schema definitions. It uses a special system to keep track of different schema types safely.

You can add new risk profiles using the `addRisk()` function (which is registered via `register`), and find them again later by their names using the `get()` function. 

Before a new risk schema is added, it's quickly checked to make sure it has all the necessary parts with the `validateShallow()` function.  If a risk schema already exists, you can update parts of it using the `override()` function. The `loggerService` property provides access to logging and context information for debugging and monitoring.

## Class RiskReportService

The RiskReportService helps you keep track of when your risk management system flags and rejects trades. It listens for those rejection events and saves details like why the trade was rejected and what the trade looked like.

Think of it as a logbook for your risk controls.

You can tell the service to start listening for these rejection events using the `subscribe` method, and it will send you back a function to stop listening – use that when you're done.

To stop listening, simply call the `unsubscribe` method.  It’s designed so you won’t accidentally subscribe more than once.

The service also uses a logger to help with debugging, and it stores the rejection data for later analysis and auditing.

## Class RiskMarkdownService

This service helps you automatically generate reports about rejected trades due to risk management. It listens for these rejection events and organizes them by symbol and trading strategy.

The service then creates nicely formatted markdown tables summarizing these rejections, along with overall statistics like the total number of rejections and breakdowns by symbol and strategy.

These reports are saved as files on your disk, making it easy to review and analyze your risk management performance.

You can subscribe to receive these events, unsubscribe when you no longer need them, and clear the accumulated data when necessary. 

The service also provides methods to retrieve statistical data and generate reports for specific symbol-strategy combinations and functions to save reports to disk. Each combination has its own storage, ensuring data isolation.

## Class RiskGlobalService

This service acts as a central point for managing risk-related operations within the backtest-kit framework. It handles tasks like validating risk configurations and ensuring that trading signals adhere to predefined risk limits. 

The service relies on several components, including services for connecting to risk systems, validating configurations, and handling data for different exchanges and trading frames. 

Key functionalities include:

*   **Signal Validation:** `checkSignal` and `checkSignalAndReserve` determine whether a trading signal is permissible based on risk rules. The latter provides a concurrent-safe way to validate and reserve resources, preventing conflicting validations.
*   **Signal Management:** `addSignal` records when a signal is executed, while `removeSignal` cleans up when a signal is closed.
*   **Data Clearing:** `clear` allows you to wipe out existing risk data, either globally or for a specific risk instance.

Essentially, it’s a behind-the-scenes engine that keeps your backtesting and trading strategies operating within safe and defined boundaries.

## Class RiskConnectionService

This service acts as a central hub for managing risk checks within your trading system. It intelligently directs risk-related operations to the correct specialized risk handler, ensuring that each trading activity adheres to the appropriate risk guidelines.

It keeps track of frequently used risk handlers, storing them for quick access, which speeds up the entire trading process.

Here's a breakdown of what it does:

*   **Risk Routing:** It decides which specific risk handler to use based on a given identifier (riskName), making sure the right rules are applied.
*   **Caching:** It remembers previously accessed risk handlers so that it doesn't have to recreate them every time they're needed.
*   **Signal Validation:** It carefully examines trading signals to ensure they comply with predetermined risk limits, like portfolio drawdown or position size.
*   **Concurrency Safety:** It has a special function (`checkSignalAndReserve`) to handle situations where multiple operations might happen at the same time, preventing issues and ensuring accuracy.
*   **Signal Management:** It allows you to record when a signal is opened and close it when it’s finished, helping to maintain accurate risk tracking.
*   **Cache Clearing:** You can manually clear the cached risk handlers when needed, ensuring the system stays up-to-date.

The service relies on several other components to operate, including services for handling schema, time data, and core actions.

## Class ReportWriterAdapter

The ReportWriterAdapter is designed to manage and store your trading data in a flexible way. It lets you easily switch between different storage methods, like saving to JSONL files or using other custom solutions.

The adapter intelligently keeps track of your storage instances, ensuring you only have one active instance for each type of report (like backtest results, live trading data, or walker analysis). This helps to prevent conflicts and ensures efficient data management.

You can change how data is stored by using `useReportAdapter`, letting you plug in your preferred storage methods. The adapter automatically creates the necessary storage when you first start writing data.

To test or temporarily disable data storage, `useDummy` will discard all writes. If you need to reset the adapter, `clear` removes existing storage instances.  Returning to the standard is done with `useJsonl`. It’s especially useful if your project’s working directory changes during a strategy run.

## Class ReportUtils

ReportUtils helps you control which parts of the system are generating detailed logs, like for backtesting or live trading. Think of it as a way to turn on and off different "report services."

You can selectively enable logging for things like backtests, performance analysis, or even just a walker. When you enable a service, it begins recording events in JSONL format, which includes helpful information for analysis.  It's really important to remember to unsubscribe when you’re done to prevent memory issues.

Conversely, you can disable specific logging services without affecting others, which is useful for reducing log clutter. Disabling stops the logging and frees up resources.  Unlike enabling, you don't need to unsubscribe after disabling.

This utility is typically extended by ReportAdapter for more advanced features.

## Class ReportBase

The `ReportBase` class provides a way to log trading events to JSONL files, designed specifically for backtesting and analysis. It handles writing data in a sequential, append-only fashion, making it suitable for building up a history of events. The system automatically creates the necessary directories and manages file paths.

It's built to handle large volumes of data efficiently, incorporating mechanisms to prevent write errors and ensure data isn't lost. It includes a timeout to prevent stalled writes and automatically includes metadata like the trading symbol, strategy, exchange, and timestamp with each log entry.  You can use this to create reports for various aspects of your backtest, like order execution, signal generation, or portfolio performance. The initialization process only runs once, and subsequent calls are ignored, ensuring efficient setup. To write data, simply pass the event data and any optional flags – the class automatically formats the information and writes it to the designated file.

## Class ReportAdapter

The ReportAdapter helps manage and store trading data in a structured way, like creating reports after each trade. It’s designed to be flexible, letting you easily switch between different storage methods without changing your core trading logic. 

Think of it as a central hub that handles where your reports are saved. It remembers which storage method you're using to avoid creating duplicates.

By default, it saves reports as JSONL files, but you can change it to use other methods or even disable reporting altogether (using the dummy adapter).  It also automatically cleans up old storage instances if your working directory changes, which is useful when running multiple trading simulations. If you need to change how reports are stored, this adapter provides a simple way to do so.

## Class ReflectUtils

This utility class, `ReflectUtils`, provides a way to check on the performance of your trading strategies in real-time, whether you’re live trading or running backtests. Think of it as a tool for monitoring key metrics like profit and loss, peak performance, and how much risk you’ve taken.

It offers a variety of methods, all designed to give you a clear picture of your position's status. You can find out the unrealized profit or loss in both percentage and dollar terms.  You can also track the highest profit achieved, when it was reached, and the drawdown, showing your biggest losses.

These methods also reveal how long a position has been open, how long a signal has been waiting, and other time-based metrics. They're all accessed through a single, globally available instance, making them easy to use. The `backtest` parameter allows you to tailor the calculations for either live or historical data. It ensures consistent data access across different environments while validating the provided context.

## Class RecentLiveAdapter

This component manages access to recent trading signals, allowing you to choose where those signals are stored – either persistently on disk or just in memory. Think of it as a flexible bridge between your trading strategies and your data storage.

It uses a pattern that lets you easily swap out the storage mechanism without changing your core code. You can use the default persistent storage, which saves signals to disk, or switch to an in-memory option for faster but temporary data.

The `getInstance` property is a smart shortcut; it builds the storage utility only once and reuses it, making things more efficient.  You can force a rebuild by using the `clear` method, which is useful if your environment changes.

There are also convenient functions to handle incoming ping events, retrieve the most recent signals for a particular trading setup, calculate how long ago a signal was created, and most importantly, to change the storage type.


## Class RecentBacktestAdapter

This component acts as a bridge for managing recent backtest data, letting you choose where that data is stored – either in memory or on disk. It uses a flexible design, allowing you to easily swap out the storage mechanism without changing the rest of your code.

The default behavior is to store data in memory, which is convenient for quick testing and development. However, you can easily switch to persistent storage to save your data between sessions.

You can change the storage method using `useMemory` and `usePersist`. The `clear` function is useful for ensuring that when your project's working directory changes, the adapter reinitializes itself correctly. 

The `getInstance` property ensures a single, efficient access to the currently configured storage adapter. This adapter handles retrieving signals, calculating time elapsed since signal creation, and responding to ping events, all by delegating to the underlying storage implementation.

## Class RecentAdapter

The RecentAdapter is designed to manage and provide access to the most recent trading signals, whether you're running a backtest or a live trading system. It automatically updates signal storage by listening for incoming data and ensures you always have access to the latest signal information for a specific symbol and trading context. 

To prevent duplicate subscriptions, it uses a singleshot pattern.

You can enable the adapter to start monitoring signals, or disable it to stop the monitoring process; disabling is safe to do repeatedly.

Retrieving signals is simple: use `getLatestSignal` to find the most recent signal for a specific symbol, taking into account a time cutoff to avoid look-ahead bias.  

The `getMinutesSinceLatestSignalCreated` function lets you determine how long ago the latest signal was generated, also using a time cutoff for look-ahead protection.


## Class PriceMetaService

PriceMetaService helps you get the latest market prices for your trading strategies, even when you're not actively running a tick. It acts like a memory bank, storing prices for each symbol, strategy, exchange, frame, and backtest configuration.

This service keeps track of prices received from your strategies and updates them automatically. You can quickly retrieve the most recent price or wait a short time for the first price to arrive.

If you need a live price outside of a tick execution, PriceMetaService will fetch it from the exchange. To prevent outdated information, you'll want to clear the stored prices when starting a new strategy. Think of it as a way to ensure you’re always working with the right price information.

It's managed centrally and updated by other components, making it simple to integrate into your backtesting or live trading environments.


## Class PositionSizeUtils

This class helps you figure out how much of an asset to buy or sell in a trade, based on different strategies. It offers a few common position sizing methods, like fixed percentage, Kelly Criterion, and ATR-based approaches. 

Each method has its own formula and a little bit of built-in checking to make sure you're using it correctly. You provide things like your account balance, the price of the asset, and other relevant data, and the class calculates a suggested position size for you.

Essentially, it's a toolkit for calculating how much to risk and allocate to each trade. 

Here's what's available:

*   **fixedPercentage:** Determines position size by risking a fixed percentage of your account balance.
*   **kellyCriterion:**  Calculates position size based on win rate and win/loss ratio, aiming to optimize growth.
*   **atrBased:** Uses the Average True Range (ATR) to determine position size, reflecting market volatility.

## Class Position

The Position class provides helpful tools for determining take profit and stop loss prices when you're trading. It’s designed to make setting these levels straightforward, automatically adjusting them based on whether you're holding a long or short position. 

There are two main functions available:

*   **moonbag**: This calculates take profit and stop loss levels based on a "moonbag" strategy, which means your take profit is a fixed percentage above (for long positions) or below (for short positions) your entry price.

*   **bracket**: This allows for more customization, letting you define your own specific percentages for both the take profit and stop loss levels. 

Both functions take information about your position type, current price, and percentage levels to determine the appropriate take profit and stop loss prices.

## Class PersistStorageUtils

This class helps manage how signal data is saved and loaded persistently, ensuring your backtest and live trading sessions can remember their state. It's designed to be reliable and efficient, automatically handling the creation of storage instances based on the trading mode (backtest or live).

The class keeps track of storage instances and provides functions to read and write signal data, allowing you to easily retrieve previously stored signals. You can even customize how the data is stored by providing your own storage adapter.

When working with trading strategies, especially those running for extended periods, this utility ensures that signal states are preserved even if the process restarts.

Here's a breakdown of what it offers:

*   **Flexible Storage:** You can use the default file-based storage, a dummy storage for testing, or plug in your own custom storage solution.
*   **Efficient Management:** It automatically creates storage instances for backtest and live modes.
*   **Data Persistence:** Read and write signal data easily to save and load states.
*   **Customization:** Adapt the storage behavior to your specific needs.
*   **Clean Up:** It allows you to clear the storage cache when necessary, such as when the working directory changes.

## Class PersistStorageInstance

This class provides a way to store and retrieve trading signals persistently, using files on your computer. It's designed to be reliable, even if your system crashes during operations.

Each signal is saved as its own JSON file, making it easy to manage and understand how your data is organized. When you need to load all signals, it reads through a list of file names.

The `backtest` property simply indicates whether the storage is for backtesting purposes. The `_storage` property handles the actual file operations behind the scenes.

The `waitForInit` method ensures that the storage is ready before you start working with it.

You can use `readStorageData` to get all the saved signals at once and `writeStorageData` to update or add new signals to the storage. This framework makes it relatively simple to keep track of your trading data across sessions.


## Class PersistStateUtils

This class helps manage how your trading strategy’s data is saved and loaded, making it more reliable. It automatically handles creating storage locations for your strategy's state based on signal IDs and bucket names.

It lets you customize how this storage works, for example, by using a different type of storage or simulating persistence for testing.  You can easily switch between using a real file-based storage system or a dummy one that doesn’t actually save anything.

If your application's working directory changes, you'll need to clear the internal cache to ensure everything is reloaded correctly.  It also offers methods to clean up storage after a signal is no longer needed, and you can initialize the storage when needed, skipping initialization if a setup is already done. This class makes sure the data is written and read safely.

## Class PersistStateInstance

This class provides a way to save and load the state of your trading strategies persistently, using files. It’s designed to work specifically with a signal and a bucket name, which essentially acts as a unique identifier for where the data is stored.

The `signalId` and `bucketName` properties identify the data being managed.

Initialization happens through `waitForInit`, and then you can retrieve previously saved state with `readStateData` or store new state with `writeStateData`.  The `writeStateData` method ensures that writes are handled safely, preventing data loss.

Importantly, `dispose` doesn’t do anything on its own, because the cleanup of any temporary cached data is managed elsewhere.


## Class PersistSignalUtils

This utility class helps manage how signal data is saved and retrieved, particularly for trading strategies. It ensures each strategy gets its own dedicated storage space for signals, making things organized and reliable.

You can customize how these signals are stored by providing your own storage adapter, or use the built-in options like a file-based system or a dummy adapter for testing. 

The class automatically handles reading and writing signal data, creating the necessary storage if it doesn't already exist.  It also manages these operations safely, even in case of unexpected issues.

If your trading environment changes – for example, if the current working directory shifts – you can clear the storage cache to ensure everything stays consistent.


## Class PersistSignalInstance

This class helps you reliably store and retrieve signal data, specifically designed for trading strategies. It's like a safe keeper for your signal information.

It combines file storage with a focus on safety, ensuring your data isn't lost even if something unexpected happens.  Each signal is identified by a unique combination of the symbol, strategy name, and exchange name.

The constructor needs the symbol, strategy name, and exchange name to set up the storage location.

You can use `waitForInit` to make sure the storage is ready before you start writing data.

`readSignalData` lets you fetch the signal data associated with a specific symbol.

`writeSignalData` is how you save or clear the signal data, ensuring it's written securely.


## Class PersistSessionUtils

This class provides tools for reliably saving and loading session data during backtesting. Think of it as a way to keep track of important information like order books or account balances between different parts of your backtest.

It manages these data snapshots and automatically handles where they're stored, usually in files within a specific directory structure.

You can even customize how this data is stored if you want, or temporarily disable persistence for testing.

The class keeps track of these storage locations and ensures that the correct one is used for each strategy, exchange, and time frame.

If you're switching strategies or environments, you might need to clear the cached data to ensure everything is fresh. You can also manually delete the data for a specific session when it's no longer needed.

## Class PersistSessionInstance

This component helps keep track of your trading sessions by saving important data to a file. It’s designed to work specifically with a strategy and exchange pair, identifying each session using a unique frame name. Think of it as a dedicated container for storing information related to a single run of your trading logic.

It automatically handles saving session data to disk and retrieving it later. The `waitForInit` method ensures the storage is ready to use before anything else happens. 

When you're finished, the `dispose` method doesn’t do anything directly—instead, it relies on a separate utility function to clean up any associated memory. This persistent storage provides a way to resume sessions or analyze performance over time.


## Class PersistScheduleUtils

This utility class helps manage how scheduled trading signals are saved and loaded, ensuring they are reliable even if there are unexpected interruptions. It keeps track of these signals for each strategy and symbol combination, using a system that remembers which storage method is currently active.

The class intelligently creates storage instances, allowing you to easily swap out different storage methods (like using a file, a dummy system for testing, or a custom solution).

You can read existing signals from storage using `readScheduleData` and save updated signals (or clear them entirely) with `writeScheduleData`.  The first time you access or modify a signal for a particular combination, it automatically sets up the necessary storage.

If you want to customize the storage mechanism, you can specify a custom constructor with `usePersistScheduleAdapter`.  There are also convenient shortcuts like `useJson` to use the standard file-based storage or `useDummy` to create a non-persistent storage for testing purposes.  The `clear` function can be used to refresh the storage if something changes in your environment.

## Class PersistScheduleInstance

This class provides a way to save and load schedule data, like signals, to a file. It's designed to be reliable, even if your program crashes unexpectedly. 

Each instance of this class is linked to a specific trading symbol, strategy name, and exchange name, which helps organize the data. 

It uses a file to store the data, making it persistent across program restarts. 

You can use it to retrieve existing schedule data or to save new data, essentially acting as a bridge between your code and the file system. The `waitForInit` method makes sure the storage is ready before you try to read or write anything.


## Class PersistRiskUtils

This class, `PersistRiskUtils`, helps manage and save information about active trading positions, making sure that data is handled safely and consistently. It acts as a central hub for storing and retrieving these position details, specifically designed to work with different risk profiles.

It efficiently creates and manages storage instances, remembering previously created ones to avoid unnecessary work. You can even customize how these instances are created by swapping out the default with your own code.

The core functions, `readPositionData` and `writePositionData`, allow you to fetch and save active positions, and they ensure this process is handled carefully and safely.

If you need to switch how this data is persisted, like using a different file format or a testing mode where nothing is actually saved, `usePersistRiskAdapter`, `useJson`, and `useDummy` provide easy ways to do so. The `clear` method is available to refresh the cached data when the environment changes, ensuring everything is up-to-date.


## Class PersistRiskInstance

This class helps you save and retrieve position data persistently, like keeping track of your trades even when your application restarts. It's designed to be reliable, using safe writing methods to prevent data loss in case of unexpected crashes. 

Think of it as a way to store your trading positions in a file, and this class handles all the complex details of reading and writing that data. 

It's tied to a specific risk name and exchange name, organizing data in a structured way. 

The `waitForInit` method prepares the storage for use.  `readPositionData` lets you retrieve saved positions at a specific time.  Finally, `writePositionData` stores new or updated position information.


## Class PersistRecentUtils

This class helps manage how recent trading signals are saved and retrieved, especially in backtesting and live trading environments. It ensures that the same storage mechanism is used for signals related to a specific trading symbol, strategy, exchange, and timeframe, avoiding inconsistencies.

The system uses a clever memoization technique, so it only creates one storage instance for each unique combination of these factors.

You can even customize how these signals are stored by providing your own storage adapter. This lets you experiment with different storage solutions or integrate with existing data management systems. 

The class handles the details of reading and writing signals safely, so you don't have to worry about data corruption. It also provides tools to refresh the storage mechanism, like when the program's working directory changes.

There are also convenient shortcuts to switch between default storage methods, such as using a file-based system or a dummy instance for testing purposes. Essentially, it makes managing recent signals reliable and adaptable for various use cases.

## Class PersistRecentInstance

This class helps you save and load the most recent trading signal data for a specific trading strategy. It uses a file to store this information, ensuring it's kept reliably.

The class identifies data by combining the trading symbol, strategy name, exchange, frame name, and whether the test is a backtest or live run – making sure each context has its own isolated storage. 

You can use `waitForInit` to make sure the storage is ready, and `readRecentData` to get the last saved signal.  `writeRecentData` is how you save a new signal, associating it with a specific timestamp.  Essentially, it's a convenient way to keep track of the last signal your strategy generated.

## Class PersistPartialUtils

This class helps manage and save partial profit and loss information, particularly useful for keeping track of progress during trading. It ensures that this data is saved correctly and reliably, even if there are unexpected interruptions.

It automatically creates storage areas for each trading symbol and strategy, preventing data from different setups from mixing together. 

You can customize how this data is stored by providing your own storage mechanisms.

The class handles reading and writing partial data, and it sets up the system so that the storage is initialized automatically the first time it's needed.

If you need to change how the data is saved (like switching to a different storage format or using a testing mode), you can easily configure it. Clearing the stored data is available, this is important when you restart your application.

## Class PersistPartialInstance

This class helps you save and retrieve incomplete trading data to a file, ensuring data integrity even if something goes wrong. It's designed to work with a specific trading symbol, strategy, and exchange, keeping data organized. 

It manages the underlying file storage automatically and uses a unique identifier for each piece of data. 

The `waitForInit` method makes sure the storage is ready before you try to use it. 

You use `readPartialData` to get the data you’ve previously saved, and `writePartialData` to save new or updated information, always linked to a specific signal. This is useful for scenarios where you might need to pause a process and resume it later without losing any progress.


## Class PersistNotificationUtils

This utility class helps manage how notification data is saved and loaded, ensuring it's handled reliably. It keeps track of different storage methods, allowing you to choose between default file-based storage, a custom adapter you provide, or even a dummy storage that doesn’t actually save anything. 

The class automatically creates a storage instance for each mode (backtest or live), and it handles reading and writing notification data safely, even if there are unexpected interruptions.

You can easily swap out the storage method being used, for example, switching to the default file storage or opting for a dummy storage for testing purposes. This is particularly useful when the working directory changes, as the `clear` method refreshes the storage to use the new base path. It's designed to work closely with other components like `NotificationPersistLiveUtils` and `NotificationPersistBacktestUtils` to ensure consistent data handling.

## Class PersistNotificationInstance

This component handles saving and retrieving notifications to persistent storage, typically files. It's designed to be reliable, even if things go wrong during the saving process.

Each notification is stored as its own JSON file, making it easy to manage and identify individual notifications. When you need to load all notifications, the system looks through all the available files.

The `backtest` property determines how the storage is configured – it likely affects how the data is handled in testing environments.

The `waitForInit` method ensures that the underlying storage is ready before any operations are attempted.

To get all notifications, use `readNotificationData`, which gathers them from the files. 

When saving notifications, `writeNotificationData` handles writing each one individually and uniquely identified by its ID.

## Class PersistMemoryUtils

This class provides a way to reliably store and retrieve data across different parts of your trading strategy, even if the system crashes. It's designed to manage how your strategy remembers things between runs.

It keeps track of storage locations based on signal IDs and bucket names, creating a dedicated storage area for each combination. You can customize how this storage works by providing your own ways to create and manage these storage areas, or stick with the default file-based approach.

The class has methods to read, write, delete, and check for existing data. When you need to access data for the first time, it automatically sets up the storage area. You can clear the internal storage cache if your working directory changes during a strategy run. It also offers ways to iterate through all the stored data, which is useful for rebuilding internal indexes. Finally, there are options to use a dummy instance for testing, or switch back to the default JSON-based persistence.

## Class PersistMemoryInstance

This class provides a way to store and retrieve memory data to a file, acting as a persistent layer for your trading framework. It's built to manage data related to a specific signal and bucket.

It handles saving data to files and keeps track of whether a data entry is considered deleted (but not physically removed from disk). 

You can use it to read a single piece of data, check if a specific piece of data exists, write new data or remove existing data.

When listing all the data, it automatically filters out any entries that have been marked as deleted.

Importantly, this class doesn't handle its own cleanup; that's managed by a separate utility function, ensuring a clean and organized system.

## Class PersistMeasureUtils

This utility class helps manage cached data from external APIs, making sure the information is reliably stored and retrieved. It creates specialized storage areas for each set of data, identified by a combination of timestamp and symbol.

You can customize how this caching works by providing your own storage "builders," allowing you to use different storage mechanisms. This system ensures data reads and writes happen safely, even if the application unexpectedly crashes.

The class also offers handy methods like `listMeasureData` to view all cached entries within a specific storage area, and `clear` to completely reset the cache when needed, such as when the working directory changes. You can easily switch back to a default file-based storage or use a dummy implementation for testing purposes.

## Class PersistMeasureInstance

This component provides a way to save and retrieve measure data persistently, like to a file. It acts as a layer on top of a basic storage system to handle things like safely writing data and marking entries as deleted instead of actually removing them. 

The `bucket` property defines where this data is stored. 

You can use `readMeasureData` to fetch a specific piece of data by its key, and `writeMeasureData` to save new data or update existing entries.  `removeMeasureData` doesn't erase the data entirely; it just flags it as removed, which is useful for keeping historical records. Finally, `listMeasureData` provides a way to get a list of all available data entries, excluding those that have been marked as removed. `waitForInit` ensures the storage is ready before you start working with it.

## Class PersistLogUtils

This class helps manage how log entries are saved and retrieved. It keeps a single, cached instance of the log storage system to avoid creating new ones repeatedly. 

You can customize how the log entries are stored by providing your own storage constructor, essentially swapping out the default storage mechanism.

The `readLogData` method retrieves all the existing log entries, while `writeLogData` adds new entries to the persistent storage.  It’s important to know that writes are append-only and duplicates are ignored.

To ensure reliability, it handles log state safely even if the system crashes.  It also offers a `clear` method to reset the cached log instance, particularly useful when the working directory changes.  Finally, it provides convenient shortcuts like `useJson` to switch back to the standard file-based storage and `useDummy` for testing where no actual logging is needed.

## Class PersistLogInstance

This component provides a way to store your trading logs to files, ensuring they’re kept safely and consistently. Think of it as a persistent memory for your backtesting process. 

Each log entry gets its own separate file, organized by a unique ID. This method makes it easy to read the entire history of your backtest.

The system is designed to be append-only, meaning it will only add new data and will never accidentally erase existing log entries. This protects against data loss even if something unexpected happens during the writing process.

Before working with logs, you need to initialize the storage. The `waitForInit` method handles this process. 

Retrieving and saving log data are straightforward actions using `readLogData` and `writeLogData`. `readLogData` retrieves all entries, while `writeLogData` adds new ones without overwriting any existing data.

## Class PersistIntervalUtils

This component handles keeping track of when specific intervals have already fired, helping to avoid redundant calculations. It stores this information in files located in a directory structure under `./dump/data/interval/`. 

Think of it as a record-keeping system; if a file exists for a particular interval, it signifies that interval has already been processed. If the file is missing, it means the interval hasn’t fired yet, or it returned null during the last run.

You can customize how this record-keeping happens, for instance, switching to a file-based system or using a dummy system for testing where no actual persistence takes place. The system lazily loads data and creates bucket instances when they are first accessed, ensuring efficient operation.  It also provides a way to completely clear the record cache, which is helpful when the working directory changes.

## Class PersistIntervalInstance

This class provides a way to store and manage interval data, essentially markers that trigger actions at specific times. It's designed to work with files, making the data persistent even if your application restarts.

The data is organized within a "bucket," which is like a folder for your interval markers. When you need to retrieve a marker, `readIntervalData` fetches it.  If the marker doesn’t exist or is marked for deletion, it returns nothing.

To save a marker, use `writeIntervalData`.  If you need to remove a marker without actually deleting the file, `removeIntervalData` is your tool—it just adds a flag indicating it's removed.  This is useful because it allows the interval to be re-enabled later.

Finally, `listIntervalData` gives you a way to see all the active, non-deleted markers in your bucket, providing a list of their keys. `waitForInit` makes sure the underlying storage is ready before any operations happen.

## Class PersistCandleUtils

This class helps manage a cache of historical candle data, storing each candle as a separate file. It's designed to make accessing and saving candle data efficient, especially when dealing with a large number of candles.

The class automatically handles checking if the cached data is still valid and will refresh it when needed. It prioritizes speed and reliability, making sure reads and writes happen safely.

You can customize how the cached data is stored by using different "adapters" – choosing between a standard file-based system, a simpler version for testing, or providing your own custom storage mechanism.

If your working directory changes, it’s important to clear the internal cache to ensure everything stays synchronized.

## Class PersistCandleInstance

This class provides a way to store and retrieve historical candle data, essentially acting as a persistent layer for your trading system. It uses individual JSON files to represent each candle, organizing them by their timestamp.

When you request candle data, it checks for the presence of each candle's file. If a file is missing, it’s considered a cache miss, signaling a need to refetch the data.

The storage system is designed to be append-only. It won't save candles that aren’t fully complete (meaning they haven't reached their close time) or overwrite existing candle data, ensuring the integrity of the historical records.  If it finds a problem with the stored data, it will alert you and treat it as a missing candle.

You can initialize the storage layer, retrieve batches of candles within a specific timeframe, and write new batches of candles to the storage. This lets you keep a history of market data even when your application restarts.


## Class PersistBreakevenUtils

This class helps manage and save breakeven data for your trading strategies, making sure information persists between runs. It's designed to keep track of breakeven points for specific symbols, strategies, and exchanges, storing this data in files.

It uses a clever system where it only creates and loads the data storage for a specific symbol and strategy combination the first time it's needed – this is called lazy initialization. 

You can even customize how this data is stored, swapping out the default file storage for other options, like a dummy that does nothing. It acts as a central hub for accessing and saving this data.

If your working directory changes during a strategy run, you may need to clear the cached data to ensure things are reloaded correctly.

## Class PersistBreakevenInstance

This class provides a way to reliably store and retrieve breakeven data, essentially acting as a persistent memory for your trading strategies. It’s designed to be crash-safe, ensuring your data isn’t lost even if something unexpected happens. 

It works by storing data in files, using a unique identifier (signalId) to organize the information. Think of it like a digital filing cabinet for your trading calculations.

The class automatically handles writing data securely, preventing corruption. 

Here’s what you can do with it:

*   It's initialized with the symbol, strategy name, and exchange name it manages.
*   `waitForInit` prepares the underlying storage – a one-time setup step.
*   `readBreakevenData` fetches existing breakeven data for a specific signal.
*   `writeBreakevenData` saves new or updated breakeven data for a given signal.


## Class PersistBase

This class provides a foundation for storing and retrieving data to files, ensuring a safe and reliable process. It handles the technical details of managing files, including ensuring they aren't corrupted and making sure updates happen completely. 

The `entityName` and `baseDir` define where and what you're storing. The `waitForInit` method sets up the storage area initially and checks that the existing files are in good shape.

You can use `readValue` to get data back, `hasValue` to check if data exists, and `writeValue` to save data – all while it takes care of writing the data in a safe, atomic way. To get a list of all the data being stored, use the `keys` method to iterate through entity IDs, presented in sorted order.

## Class PerformanceReportService

This service helps you understand where your trading strategy is spending its time. It acts as a listener, quietly recording the duration of different parts of your strategy's execution. This information is then stored in a database, allowing you to pinpoint bottlenecks and optimize your strategy’s performance.

You can tell it to start listening for these timing events, and it will automatically stop listening when you tell it to. 

Here's a breakdown of how it works:

*   It uses a `loggerService` to provide helpful debugging information.
*   The `track` function handles the actual process of recording performance data.
*   The `subscribe` function is how you tell it to start listening to the strategy’s performance events – and it makes sure you don’t accidentally subscribe more than once.
*   The `unsubscribe` function is used to stop it from listening and cleaning up.

## Class PerformanceMarkdownService

This service helps you understand how your trading strategies are performing by gathering and analyzing key metrics. It listens for performance events happening during your backtests or live trading, keeps track of these events for each strategy, and then summarizes them into useful statistics. 

You can use it to get overall performance figures, like average returns and maximum drawdowns, but it also identifies potential bottlenecks in your strategies. It can generate reports in a readable markdown format, which makes it easy to share your results or identify areas for improvement. 

The service also provides ways to clear out old performance data, and to manage how it subscribes and unsubscribes to the flow of performance events. Essentially, it gives you the tools to monitor, analyze, and refine your trading strategies.


## Class Performance

The Performance class helps you understand how well your trading strategies are performing. It offers tools to analyze and report on your strategies' performance metrics.

You can retrieve aggregated performance statistics for a specific symbol and strategy, revealing detailed information like execution times, averages, and volatility.

To make understanding even easier, the class can generate comprehensive markdown reports, presenting a breakdown of where your strategy spends its time and highlighting potential bottlenecks through percentile analysis.

Finally, you can save these reports directly to your disk, making it simple to track and share your performance insights. The reports are typically stored in a directory named `dump/performance`, but you can customize the location.

## Class PartialUtils

The `PartialUtils` class helps you analyze and understand partial profit and loss data from your trading strategies. Think of it as a tool to inspect how your strategies are performing incrementally, rather than just at the very end.

It gathers information about partial profit and loss events, storing up to 250 of these events for each symbol and strategy combination. This data includes details like the time, type of event (profit or loss), symbol traded, strategy name, signal ID, position size, level, price, and whether it's a backtest or live trade.

You can use `PartialUtils` to get summarized statistics about your partial profits and losses. It can also create nicely formatted markdown reports that display all the individual events in a table, including details like the event type, symbol, strategy name, signal ID, position, level, price, and timestamp. These reports help you visually examine the sequence of events.

Finally, `PartialUtils` can save these markdown reports to files, making it easy to share your analysis or keep a record of your strategy’s performance. The files are named using the symbol and strategy name, so you can easily identify them.

## Class PartialReportService

The PartialReportService helps you keep track of when your trades partially close, whether it's for profit or loss. It listens for those specific events and records details like the price and level at which the partial closure happened. 

Think of it as a logbook for those in-between moments of a trade. 

You can tell it to start listening for partial profit and loss events, and it will send that information to be saved. To stop it from listening, there's an unsubscribe function that you can use. It's designed to prevent accidental multiple subscriptions, keeping things tidy. If you're already subscribed, this method does nothing.

## Class PartialMarkdownService

This service helps you track and report on the partial profits and losses in your trading backtests. It listens for events indicating profit or loss and keeps a running total for each symbol and strategy you're using.

It automatically generates readable markdown reports summarizing these events, including detailed information about each profit or loss. You can also request overall statistics, like the total number of profits and losses.

The reports are saved to disk, making it easy to review your trading performance over time. You have control over where these reports are saved, and can even clear the stored data when you need to start fresh. The system ensures that each combination of symbol, strategy, exchange, frame, and backtest has its own separate storage. You can subscribe to receive profit/loss updates and unsubscribe when you no longer need them.

## Class PartialGlobalService

This service acts as a central hub for tracking and managing partial profits and losses within your trading strategy. It's designed to be injected into your strategy code, offering a single point of access for these operations. 

Think of it as a log and forwarding system; whenever a profit, loss, or clearing of a partial position occurs, this service first records the event for monitoring purposes and then passes the request on to a lower-level service that actually handles the changes. Several validation services are also available to ensure the strategy and related configurations like risk, exchange, and frame are valid before proceeding with partial operations. 

It simplifies how your strategy interacts with the partial profit/loss tracking system, promotes consistent logging, and helps keep your strategy code cleaner and more organized. The `validate` property uses caching to avoid unnecessary re-checks of strategy configurations.

## Class PartialConnectionService

The PartialConnectionService is designed to manage and track partial profit and loss information for trading signals. It's like a central hub that creates and maintains records for each signal, ensuring that these records are properly initialized and cleaned up when needed. 

Think of it as a smart factory – whenever you need to track profit or loss for a signal, it provides a specialized component (a ClientPartial) that handles that specific task. These components are cached to avoid unnecessary creation, and they’re automatically removed when the signal is no longer active.

The service receives helpful tools like logging and event handling to keep everything organized and informed. When a signal experiences a profit, loss, or closure, this service coordinates the actions and notifies other parts of the system. It's a crucial part of the overall trading strategy, ensuring accurate and efficient tracking of partial results.

## Class NotificationLiveAdapter

This component handles sending notifications about your trading strategy's progress, like signal events, profits, losses, and errors. It's designed to be flexible so you can easily switch between different ways of receiving those notifications – whether that's storing them in memory, saving them to a file, or simply ignoring them altogether for testing.

You can choose how notifications are handled by switching between adapters: a default in-memory adapter, a persistent adapter for saving notifications to disk, or a dummy adapter that does nothing.

The `handleSignal`, `handlePartialProfit`, `handlePartialLoss`, `handleBreakeven`, `handleStrategyCommit`, `handleSync`, `handleRisk`, `handleError`, `handleCriticalError` and `handleValidationError` methods are all pass-throughs to the currently selected notification adapter, ensuring consistent notification delivery. The `getData` method allows you to retrieve all the notifications that have been generated. The `dispose` method clears any stored notifications.

If your environment changes (like when the working directory changes during strategy runs), it's important to call `clear()` to force a new instance of the notification adapter to be created. This ensures it's using the correct configuration for the current environment.

## Class NotificationHelperService

This service helps manage and send out notifications related to signals, making sure everything is validated before it's sent. It’s primarily used internally by the backtest-kit framework, so you won’t directly use it unless you're deep in customization.

Think of it as a gatekeeper for signal information. Before a signal is broadcast, it checks several aspects, like the strategy, exchange, frame, and action schemas, to ensure everything is correct.  This check is performed only once for each unique combination of strategy, exchange, and frame name to improve efficiency.

You'll interact with this indirectly through `onActivePing` callbacks, specifically using the `commitSignalNotify()` function. This function is responsible for taking the signal information, validating it, and then sending it out to the rest of the system. The notification itself is then handled by other components responsible for displaying and persisting the information.


## Class NotificationBacktestAdapter

This component lets you manage notifications during backtesting, offering flexibility in how those notifications are handled. It uses a design that allows you to easily swap out different notification methods without changing your core backtesting logic.

You can choose to store notifications in memory (the default), persist them to disk, or even use a dummy adapter that effectively ignores notifications entirely.

The `handleSignal`, `handlePartialProfit`, `handleRisk`, and other methods are ways to send different types of notifications. These methods simply pass the data to the currently active notification backend.

The `useDummy`, `useMemory`, and `usePersist` methods provide quick ways to switch between notification storage methods.  The `useNotificationAdapter` function gives you the most control by allowing you to specify exactly which notification class to use.  `clear` resets the cached notification utilities, which is important if your working directory changes.

## Class NotificationAdapter

The NotificationAdapter is the central hub for handling notifications during both backtesting and live trading. It automatically receives and organizes notifications triggered by various events like signals, profits, losses, and errors.

You can enable the adapter to start receiving notifications, which is done only once to prevent unnecessary subscriptions. Conversely, you can disable the adapter to stop receiving notifications; calling disable multiple times is perfectly safe. 

To retrieve the accumulated notifications, there's a getData method that lets you specify whether you want the backtest or live notifications. When you’re finished, dispose of the adapter to clear all stored notifications and release resources.

## Class MemoryLiveAdapter

This component provides a flexible way to manage data during live trading, acting as a central storage hub. Think of it as a smart memory system that can be easily swapped out with different storage methods.

By default, it saves data to files on your computer's file system, ensuring that your data persists even if the program restarts. However, it also offers alternatives: a temporary in-memory storage for quick testing, or even a "dummy" option that simply discards any data written to it.

You can easily change which storage method is used, and the system automatically manages how data is stored and retrieved. 

It allows you to search, list, add, remove, and read entries. If you want to clean up or customize the storage, there are methods to dispose signals and clear caches. It’s designed to make handling trading memory a clean and adaptable process.

## Class MemoryBacktestAdapter

This adapter provides a flexible way to manage memory storage for backtesting, allowing you to choose different storage methods depending on your needs. By default, it uses an in-memory storage system based on BM25 for searching, meaning all data resides in the process's memory and isn't saved permanently.

You can easily switch between different storage implementations. For instance, you can choose to persist data to files, use a dummy adapter that simply discards data for testing purposes, or use a custom storage adapter you've built yourself.

The `disposeSignal` method helps keep memory usage in check; it clears out stored data associated with a specific signal when that signal is no longer needed. You can write, search, list, remove, and read data from memory using the provided methods. If your working directory changes during backtest iterations, you'll want to call `clear` to ensure fresh instances are created with the correct base path.

## Class MemoryAdapter

The MemoryAdapter is the central hub for managing how your backtests and live trading environments store and retrieve data. It intelligently directs memory-related operations, like writing, searching, listing, removing, and reading entries, to either the backtest or live memory systems based on your configuration.

To keep things tidy and prevent memory leaks, the MemoryAdapter automatically handles subscriptions to signal lifecycle events, ensuring that when a signal is closed, any related memory is cleaned up. It also uses a "single-shot" approach to subscriptions, guaranteeing that you don't accidentally subscribe multiple times.

You can control its activity with `enable` and `disable` functions; enabling it subscribes to lifecycle events, while disabling simply unsubscribes. The `enable` function ensures that stale data doesn't linger in your systems.  The `writeMemory` function lets you store data, while `searchMemory` allows you to find data using full-text search, `listMemory` retrieves all entries, `removeMemory` deletes entries, and `readMemory` fetches a specific entry. All these functions use the information you provide to determine if they are operating in a backtest or live environment.

## Class MaxDrawdownUtils

This class offers tools to analyze and report on maximum drawdown events, which help understand potential risks in your trading strategies. It acts as a central place to gather and present data collected from max drawdown events.

You can use it to fetch detailed statistical information about drawdowns, specifying the symbol, strategy, and data context you’re interested in.

It also allows you to create markdown reports summarizing these drawdown events, either as a string or by saving them directly to a file. You can customize which columns appear in the reports.


## Class MaxDrawdownReportService

The MaxDrawdownReportService is designed to keep track of maximum drawdown events during a trading simulation. It monitors for these drawdown occurrences and records them in a special JSONL database for later analysis.

Think of it as a dedicated reporter, always listening for new drawdown events. When it detects one, it carefully notes important details – things like the exact time, the asset involved, the trading strategy used, the price at which the trade was placed, and so on – and saves that information.

To get started, you need to tell the service to begin watching for drawdown events using the `subscribe` method. To stop the service and prevent further records from being created, use `unsubscribe`. It’s designed to avoid accidentally subscribing multiple times, so it’s safe to call `subscribe` even if it’s already active.

## Class MaxDrawdownMarkdownService

This service is designed to automatically create and store reports detailing maximum drawdown, a critical risk metric for trading strategies. It listens for drawdown data and organizes it based on the trading symbol, strategy, exchange, and timeframe.

You can think of it as a data collector and reporter for drawdown events.

To start receiving these events, you need to subscribe. To stop and clear all collected data, unsubscribe.

The service allows you to retrieve the accumulated data, generate a formatted markdown report, or directly save the report to a file. 

You can also clear the stored data. If you specify a particular symbol, strategy, exchange, timeframe, and backtest flag, only the data associated with that combination will be cleared. Otherwise, it clears *everything*.

## Class MarkdownWriterAdapter

This component manages how your trading reports are saved, offering flexible ways to control where and how the information is stored. It uses a design that lets you easily swap out different storage methods without changing your core code.

You can choose to save reports as individual markdown files in a folder (the default), append them to a single JSONL file, or even suppress the output entirely.  The system remembers which storage method you're using, so you don't have to keep reconfiguring it.

If your project's working directory changes, like when moving between strategy iterations, it's important to clear the cache to ensure that new storage is created with the correct path.  You can also change the default markdown storage adapter if you have a custom implementation.

## Class MarkdownUtils

This class helps manage how markdown reports are generated for different parts of the backtest-kit framework, like backtests, live trading, or performance analysis.

You can selectively turn on markdown reporting for specific areas, and it gives you a way to cleanly turn them all off at once to avoid resource leaks - remember to use the cleanup function it provides!

Alternatively, you can disable markdown reporting for just certain areas while leaving others running, providing precise control over what's reported.

You also have the ability to clear out the accumulated data for specific markdown reports without stopping the reporting itself, allowing you to refresh the data while keeping the reporting system active.

## Class MarkdownFolderBase

This adapter provides a straightforward way to generate backtest reports, creating each report as a separate markdown file within a designated folder. Think of it as a convenient way to keep your reports neatly organized for easy human review.

The adapter writes directly to files, so no complex stream management is involved. The file name and location are determined by the `options.path` and `options.file` settings you provide.

It automatically creates the necessary directories, so you don't have to worry about that part. 

The `waitForInit` method is essentially a placeholder – it doesn't do anything because this adapter doesn’t require any initial setup.

The key function is `dump`, which handles writing the markdown content to a file, constructing the full file path, and ensuring the directory structure exists.


## Class MarkdownFileBase

This component helps manage and store your markdown reports, like those generated during backtesting, in a structured and easily processable way. It writes each type of report (e.g., trade summaries, order books) to its own JSONL file, ensuring a clean and organized log.

Think of it as a central hub for all your markdown-based reports. It's designed to handle a large volume of data efficiently, including automatically creating directories and managing potential writing delays. The system also includes built-in protections to prevent write operations from taking too long, and it allows you to filter reports based on various criteria such as the trading symbol and strategy used.

You can initialize the system once, and it's safe to re-initialize it if needed. When you want to create a report, you simply provide the markdown content along with some identifying information (symbol, strategy, etc.), and the component takes care of writing it to the appropriate file. The resulting JSONL files can then be easily processed and analyzed by external tools.


## Class MarkdownAdapter

The MarkdownAdapter helps manage how your markdown files are stored, offering flexibility and efficiency. It lets you easily switch between different storage methods, like having each markdown dump create its own file or appending them all to a single JSONL file.

You can change the way markdown is stored by providing a custom constructor for the adapter, allowing for tailored storage solutions.

For convenience, there are shortcuts to use the default folder-based storage (`useMd`) or the JSONL-based storage (`useJsonl`).  If you just want to test or temporarily disable markdown writing, you can use the `useDummy` adapter, which simply ignores any attempts to write markdown. The system remembers your storage choices, so you don’t have to set them repeatedly.

## Class LookupUtils

The `LookupUtils` framework acts as a central record of what's currently happening in your backtests or live trading sessions. Think of it as a constantly updated list of ongoing activities, like individual backtests, live trades, or even steps within a trading strategy.

Each time a backtest starts, a live session begins, or a step in your strategy is executed, an entry is added to this list.  Conversely, when something finishes, its entry is removed.

It uses an internal map (`_lookupMap`) to keep track of these entries, allowing quick access to the current state.

You can use the `addActivity` function to register a new activity, and `removeActivity` to clean up when it’s done. It's important to use `removeActivity` even if errors occur, to prevent stale entries from lingering. 

Finally, `listActivity` provides a quick way to see a snapshot of all the activities that are currently in progress. This is primarily used internally, but useful for debugging or understanding what's going on. 


## Class LoggerService

The LoggerService is a central tool for logging information within the backtest-kit framework, ensuring all logs are formatted consistently and include important details. It provides a convenient way to record events during backtesting and live trading.

You can customize the logging behavior by providing your own logger implementation through the `setLogger` function, otherwise it defaults to a do-nothing logger.

The service automatically adds context to your log messages, such as the strategy name, exchange, and the specific part of the code being executed. This context helps pinpoint exactly where events occur.

It offers several logging levels – `log`, `debug`, `info`, and `warn` – each appending the context to the message you provide, making it easy to track different types of activity.


## Class LogAdapter

The LogAdapter acts as a central point for managing how your backtesting framework records information, like trades and performance metrics. It's designed to be flexible, allowing you to easily switch between different logging methods without changing a lot of code. By default, it keeps logs in memory, but you can quickly change it to store logs persistently to disk, use a dummy logger that does nothing, or even use a JSONL file.

The `useLogger` method gives you fine-grained control by letting you specify exactly how logs are handled. Methods like `log`, `debug`, `info`, and `warn` are shortcuts to send messages at different levels of importance, all through this adapter. If the working directory changes during testing, remember to call `clear` to refresh the logging setup.

## Class LiveUtils

LiveUtils provides tools for running live trading sessions, handling crashes, and getting real-time data. It acts as a central hub for managing live trading operations.

You can start live trading for a specific symbol and strategy using the `run` method, which continuously generates trading updates and recovers from potential crashes. Alternatively, the `background` method can run trading in the background without interrupting the main process.

The framework offers ways to retrieve important information about the current trade, like the pending signal, total position percentage, cost basis, and estimated minutes remaining. It also includes methods to adjust the trade, such as setting a new breakeven price, moving stop-loss and take-profit levels, and adding new DCA entries.

The `LiveUtils` framework also has functions for specific actions like canceling scheduled signals or closing the position directly. Finally, you can collect stats and reports about trading activity and list active trading instances. This whole system is designed to keep trading operations running smoothly and provide a wealth of information about the position's status.

## Class LiveReportService

The LiveReportService is designed to record every step of your live trading strategy as it happens. It monitors your signals, noting when they're idle, when a trade is opened, when it’s active, and when it's closed.

Essentially, it’s a logging system that saves these details to a SQLite database, allowing you to observe and analyze your trades in real-time.

It works by listening to live signal events and meticulously recording all the relevant information, then storing that data persistently.  To prevent accidental duplicates, it uses a mechanism to ensure only one subscription is active at a time.

You can start receiving these live events by using the `subscribe` method, which returns a function you can call to stop the subscription.  The `unsubscribe` method provides a clean way to stop the service from logging events if needed. Finally, the `tick` property handles the actual processing and logging of these events.


## Class LiveMarkdownService

This service helps you automatically create markdown reports of your live trading activity. It listens for events happening during your trades, such as when a trade is opened, active, or closed, and carefully tracks all the details. 

It organizes this information into easy-to-read markdown tables, giving you a clear overview of how each strategy is performing. You’ll also get key statistics like your win rate and average profit.

The service saves these reports as markdown files in a logs folder, organized by strategy name, making it simple to review your performance over time.

You can subscribe to receive these real-time updates, and the service is designed to prevent accidental duplicate subscriptions. There's also a function to stop receiving these updates when you no longer need them.

You have options to get raw data, generate reports for specific trades, or completely clear the accumulated data. You can even specify where the reports should be saved.

## Class LiveLogicPublicService

This service helps manage and run live trading operations. It simplifies things by automatically handling context information like the strategy and exchange being used, so you don't need to pass it around explicitly in your code.

Think of it as a central hub for live trading that seamlessly integrates with other parts of the backtest-kit framework.

It provides a continuous, never-ending stream of trading results, either signals to open or close positions, or cancellations. 

The system is designed to be resilient, automatically recovering from crashes and preserving your trading progress. It uses the current time to keep everything synchronized.

You can specify the symbol you want to trade and a context object containing the strategy and exchange names to get started.

## Class LiveLogicPrivateService

This service manages the ongoing process of live trading, working behind the scenes to keep everything running smoothly. It uses a continuous loop to constantly monitor the market and check for new trading signals. 

The service streams results—specifically, when trades are opened or closed—efficiently, avoiding unnecessary data. It's designed to be memory-friendly and will run indefinitely, allowing for continuous trading.

If the system experiences a crash, it's built to automatically recover and resume trading from where it left off. The process leverages several core services for logging, strategy execution, and method context. The `run` method is the main entry point, taking a symbol as input and returning an async generator that provides a live stream of trading events.

## Class LiveCommandService

This service helps your application interact with live trading features. It acts as a convenient bridge, making it easier to inject dependencies and use the underlying live trading logic.

Think of it as a central hub for live trading operations.

Here’s a breakdown of what it offers:

*   It handles running live trading sessions for a specific symbol.
*   It incorporates important context like the strategy and exchange being used.
*   The `run` method is the key – it provides an ongoing stream of results (open, closed, or cancelled strategy ticks) and automatically recovers from crashes, ensuring continuous operation. It works using an infinite generator.
*   It uses several other validation services internally to ensure things are set up correctly, including checks for strategies, exchanges, risks, and actions.

## Class IntervalUtils

IntervalUtils provides a way to control how often your functions run, especially when dealing with time-series data like trading signals. Think of it as a gatekeeper for your functions, ensuring they don't fire too frequently.

It has two main modes: in-memory, where the state is temporary, and file-based, where the state is saved to disk, meaning it survives restarts. The `fn` method is used for functions that don't need to persist data, while the `file` method is perfect for actions that need to be remembered between sessions.

To make things even easier, IntervalUtils uses a single, readily available instance called `Interval`, so you don't have to create one yourself. You can clear or dispose of these controlled functions when you need to, such as when your working directory changes, ensuring a clean start each time. It helps avoid conflicts between strategy iterations.

## Class HighestProfitUtils

This class helps you analyze and report on the highest profit-generating events your trading strategies achieve. 

Think of it as a tool to understand which strategies are performing best under different conditions.

It gathers data from events that track highest profits and lets you pull out key statistics or generate complete reports. You can request this data for a specific trading symbol, strategy, exchange, and timeframe. 

The `getData` method lets you grab detailed statistics related to highest profit. The `getReport` method creates a formatted markdown report showcasing these highest profit events.  Finally, `dump` allows you to take that markdown report and save it directly to a file for later review or sharing. It's all about providing easy access to insights about your most successful trading moments.

## Class HighestProfitReportService

The `HighestProfitReportService` is designed to keep track of your most profitable trading moments and record them for later analysis. It essentially listens for notifications of new highest profit records and saves those details to a database.

When you want to start recording these events, you use the `subscribe` function, which kicks off the process of saving data.  It's designed to only subscribe once, preventing duplicate data entries.

To stop recording, use the `unsubscribe` function. It disconnects the service from the data stream, preventing further records from being saved.

The service meticulously captures a snapshot of the trading conditions at the time of each highest profit record, including details like timestamps, symbols, strategy names, exchanges, signal IDs, position sizes, and order prices. This allows you to later understand exactly what led to those successful trades.  Importantly, it retrieves signal-specific information directly from the signal data to ensure accuracy.

## Class HighestProfitMarkdownService

This service helps generate and store reports detailing the highest profit achieved for different trading scenarios. It listens for incoming data about profit events and organizes them based on symbol, strategy, exchange, and timeframe. 

You can subscribe to receive these events, but it's designed to prevent multiple subscriptions.  Unsubscribing completely stops the process and clears all accumulated data.

The `tick` method handles individual profit events, routing them to the appropriate storage area. 

You can retrieve specific data using `getData`, which shows the accumulated statistics for a particular combination of symbol, strategy, exchange, and timeframe. `getReport` creates a nicely formatted markdown report with a table of events and a total count. Finally, `dump` creates this report and saves it as a markdown file to disk, with a filename indicating the symbol, strategy, exchange, and whether it’s a backtest.

To completely reset all the data, use `clear`.  You can clear all storage or just a specific bucket identified by a combination of symbol, strategy, exchange, timeframe, and backtest status.

## Class HeatUtils

HeatUtils helps you easily visualize and analyze your trading portfolio's performance using heatmaps. Think of it as a tool to quickly understand how different assets are contributing to your overall strategy results.

It automatically gathers statistics from all your closed trades, giving you a clear picture of each symbol's performance and the portfolio's overall metrics.

You can request the raw data, or have HeatUtils generate a nicely formatted markdown report that summarizes the key information, such as total profit/loss, Sharpe ratio, and maximum drawdown, sorted by profitability.

The report can be saved directly to a file on your computer for later review or sharing. This whole system is designed to be straightforward – there’s just one readily available instance to use.

## Class HeatReportService

The HeatReportService helps you track and analyze your trading performance by recording when your signals close. It focuses on capturing the profit and loss (PNL) data associated with these closed signals across all the assets you're trading. 

Think of it as a data collector for understanding how your trading strategies are performing over time, allowing you to spot patterns and make informed adjustments.

It connects to a central signal system and specifically records closed signals (those that have ended). It then saves this information in a database for later analysis and generating helpful visualizations – the heatmap.

You subscribe to this service to start receiving signal event updates, and importantly, it prevents you from accidentally subscribing multiple times.  When you’re done, you can unsubscribe to stop receiving these updates.


## Class HeatMarkdownService

This service creates a portfolio-wide heatmap to visualize trading performance. It listens for signals from your trading strategies and aggregates key metrics like profit/loss, Sharpe Ratio, and maximum drawdown for each symbol and across your entire portfolio.

It’s designed to be flexible, with each trading environment (exchange, timeframe, backtest vs. live) having its own dedicated storage area. This prevents data from different contexts getting mixed up.

You subscribe to receive tick events, and the service automatically builds up the heatmap data. It provides functions to retrieve the aggregated statistics, generate a nicely formatted markdown report, or write the report directly to a file. You can also clear the accumulated data to start fresh, either for a specific trading setup or globally. It handles potential errors like `NaN` or `Infinity` gracefully to ensure the report is always clean and understandable.


## Class FrameValidationService

This service helps you keep track of and make sure your trading timeframes (like 1-minute, 5-minute, daily) are properly set up. It acts like a central manager for all your defined timeframes.

You can use it to register new timeframes with specific configurations. 

Before you start using a timeframe in your trading logic, you can ask this service to double-check that it actually exists – preventing errors. The service remembers its checks, making the validation process faster each time. Finally, you can get a complete list of all the timeframes you've registered.

## Class FrameSchemaService

The FrameSchemaService helps keep track of all your different frame schemas, ensuring they are consistent and well-defined. 

It's like a central library for these schemas, allowing you to easily register new ones and retrieve existing ones by their names. 

Before a schema is officially added, a quick check ensures it has the essential properties in the right format. 

You can add a new schema using `register`, update an existing one with `override`, and get a schema back using `get`. The service uses a sophisticated system for storing these schemas safely and in a type-safe manner.

## Class FrameCoreService

This service acts as a central point for handling all things related to timeframes within the backtesting framework. It works closely with a connection service to fetch the necessary data and a validation service to ensure accuracy. Think of it as the engine that provides the sequence of dates your trading strategy will be tested against.

The `getTimeframe` function is its key feature—it's what you'll use to get the array of dates needed for a specific trading symbol and timeframe (like daily, weekly, or hourly). 

Essentially, it simplifies the process of obtaining and managing the time data your backtest relies on.


## Class FrameConnectionService

The FrameConnectionService helps manage and access different trading frames, like minute, hour, or daily data, within your backtesting process. It acts as a central hub, automatically directing requests to the correct frame implementation based on the current context.

Think of it as a smart router for frame-related operations. 

To improve performance, it keeps a record (memoizes) of the frame instances it creates, so it doesn't have to recreate them every time. 

It also lets you define the timeframe for your backtest, specifying the start and end dates, allowing you to focus on specific periods of time. When running in live mode, there are no frame constraints.

The service relies on other services like the logger, schema, and method context services to function. 

You can use `getFrame` to fetch a frame by name – the first time, it creates it, and subsequent calls return the stored version. `getTimeframe` helps determine the boundaries for backtesting a particular symbol.

## Class ExchangeValidationService

The ExchangeValidationService helps you keep track of your trading exchanges and make sure they're properly set up before you start trading. Think of it as a central place to register all your exchanges and then quickly check if they’re ready to go. 

It allows you to register new exchanges using `addExchange`, which essentially adds them to its record.  Before any trading actions, you can use `validate` to confirm that an exchange exists and is correctly configured. The service also remembers the results of these validations, so things run faster the second time around.  Finally, the `list` function lets you see all the exchanges currently registered in the system. 

Essentially, it's a handy tool for organization and error prevention in your trading setup.

## Class ExchangeUtils

This class, `ExchangeUtils`, provides helpful tools for working with different cryptocurrency exchanges. It acts as a central point for common exchange-related tasks, ensuring consistency and validation. 

Think of it as a helper that simplifies interacting with exchanges and retrieving data like candles, order books, and trades. 

It's designed to be easily accessible throughout your backtesting framework.

Here's a bit more detail on what it does:

*   **Fetching Data:** It can grab historical candles (price data over time), calculate average prices, get the latest closing price, and retrieve order books and aggregated trades.
*   **Formatting:** It automatically handles formatting trade quantities and prices to match the specific rules of each exchange, which is crucial for accurate backtesting.
*   **Date Handling:** When retrieving historical data, it intelligently calculates the appropriate date range to avoid look-ahead bias, ensuring accurate results.
*   **Isolated Instances:** It maintains separate instances for each exchange to prevent data conflicts and ensure stability.
*   **Raw Data Access:**  You can get raw, unfiltered candle data with precise control over date ranges and limits.

## Class ExchangeSchemaService

The ExchangeSchemaService helps keep track of information about different cryptocurrency exchanges, ensuring everything is structured correctly.

It uses a special system for storing these exchange details in a way that avoids errors caused by incorrect data types.

You can add new exchanges using `addExchange()`, and retrieve existing ones by their name using `get()`.

Before adding a new exchange, `validateShallow()` checks that the essential properties are present and of the right type. 

If you need to update an existing exchange's details, `override()` lets you make changes to specific parts of the schema. 

The service relies on internal components for logging and managing its storage.

## Class ExchangeCoreService

This service acts as a central hub for interacting with exchanges within the backtesting framework. It seamlessly combines exchange connection details with information about the current backtest, like the specific date and time being simulated. 

Essentially, it provides a unified way to request data like historical candles, order books, and trade information from an exchange, ensuring that these requests are properly contextualized for the backtest environment.

The service offers several methods for retrieving exchange data, including functions for fetching candles (both historical and simulated future data for backtesting), calculating average prices, and formatting prices and quantities.  Validation of the exchange configuration is handled efficiently to prevent repeated checks. The `getRawCandles` method is particularly powerful as it provides fine-grained control over the date range and amount of data retrieved.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently directs requests to the correct exchange based on the current trading context. To improve performance, it remembers previously used exchanges, avoiding redundant connections.

This service provides a range of functions for retrieving market data, including historical and real-time candles, average prices, order books, and aggregated trade data.  It also handles the formatting of prices and quantities to ensure they comply with the specific rules of each exchange.

When fetching data, the service determines the exchange to use based on the method context. For historical data, it can retrieve candles within a specific date range. It also distinguishes between live and backtesting modes when calculating average prices – using real-time data live and VWAP calculations during backtesting. The service manages the complexities of different exchanges, allowing you to focus on your trading strategy.

## Class DumpAdapter

The `DumpAdapter` provides a flexible way to store information generated during a backtest, allowing you to choose where that data is saved. It acts as a central point for dumping different types of data – messages, records, tables, text, errors, and JSON – and manages the underlying storage mechanism.

Initially, it defaults to saving data as markdown files, one per dump, in a structured directory. You can easily switch between different storage options, including in-memory storage, a no-op (dummy) mode that discards everything, or even plug in your own custom storage implementation.

To use the adapter, you must first activate it using `enable()`, which subscribes to signal lifecycle events to ensure data isn't stale. You deactivate it with `disable()`.  The `clear()` method is useful when the working directory changes during testing to prevent issues with cached instances. There are also specific methods for dumping various data types like full message histories (`dumpAgentAnswer`), simple records (`dumpRecord`), tabular data (`dumpTable`), raw text (`dumpText`), errors (`dumpError`), and nested JSON objects (`dumpJson`).

## Class ConstantUtils

The `ConstantUtils` class provides a set of pre-defined percentages designed to help manage take-profit and stop-loss levels in your trading strategies. These levels are calculated using a Kelly Criterion approach with an exponential risk decay, aiming for a balanced approach to risk and reward. Think of them as tiers for locking in profits or minimizing losses as a trade progresses.

For instance, when aiming for a final 10% profit, `TP_LEVEL1` at 30% triggers when the price reaches 3% profit, `TP_LEVEL2` at 60% triggers at 6% profit, and `TP_LEVEL3` at 90% triggers at 9% profit.  Similarly, `SL_LEVEL1` at 40% and `SL_LEVEL2` at 80% help manage potential losses by triggering stop-loss levels at those percentages of the overall risk exposure.  These constants offer a quick way to incorporate these optimized levels into your backtesting and trading logic.

## Class ConfigValidationService

The ConfigValidationService acts as a safeguard for your trading configurations, making sure they're mathematically sound and capable of generating profits. It checks various parameters within the global configuration settings to catch potential errors before they impact your backtesting results.

This service pays close attention to percentages like slippage and fees, ensuring they aren't negative. It also verifies that your take-profit settings are realistic – specifically, that they account for all costs involved in a trade. 

Beyond that, it enforces sensible relationships between settings, such as minimum and maximum values, and confirms that time-related parameters, like timeouts and retry counts, are positive whole numbers. Finally, it examines parameters related to how candles (price data) are handled.

Essentially, it's a built-in quality control system for your trading setup.


## Class ColumnValidationService

The ColumnValidationService helps keep your column configurations in good shape. It ensures that each column definition has all the necessary information, like a unique identifier, a display name, a formatting method, and visibility settings.

It verifies that these essential pieces are present and correctly formatted – making sure keys and labels are strings, and formatting and visibility are handled by functions. 

Crucially, it makes sure that the unique identifiers you assign to each column don't clash within their group, preventing unexpected behavior. The service acts as a safeguard, helping to prevent errors and inconsistencies in your column data setup.


## Class ClientSizing

ClientSizing helps you figure out how much to trade based on a variety of approaches. It's a core component used when running strategies to determine the right position size. You can use different sizing methods like a simple percentage, the Kelly Criterion, or ATR-based sizing. 

The system also allows you to set limits, ensuring your positions stay within specified boundaries—both minimum and maximum sizes, and a percentage limit of your overall capital. There’s even a way to add callbacks so you can validate the sizing decisions or record what's happening.

The `calculate` method is the key – it takes input parameters and returns the calculated position size.

## Class ClientRisk

ClientRisk helps manage risk across your trading strategies to prevent exceeding limits. It acts as a central authority, checking signals before they're executed to ensure your portfolio stays within defined boundaries.

It monitors things like the maximum number of concurrent positions you hold, and allows you to add custom checks tailored to your specific risk preferences, taking into account all currently active positions.

Several strategies can share the same ClientRisk instance, enabling a broader view of risk across your entire portfolio.

The `checkSignal` method determines if a signal should be allowed, considering factors like current price and timestamps. `checkSignalAndReserve` provides a safer, concurrent way to validate signals and temporarily reserve a place in the active position map, preventing other strategies from bypassing limits.

Finally, `addSignal` records when a new position is opened, and `removeSignal` cleans up when a position is closed, ensuring the system accurately reflects the current state of your portfolio. It’s important to always pair a successful `checkSignalAndReserve` with either `addSignal` or `removeSignal` to keep the risk map accurate and avoid accumulating stale reservations.

## Class ClientFrame

The ClientFrame is responsible for creating the timeline of data points your backtest will use. Think of it as the engine that builds the sequence of moments in time for your trading strategy to analyze. It avoids repeating work by remembering previously generated timelines, making the process more efficient. 

You can customize how far apart these timeline points are, choosing intervals from one minute to one day. 

The ClientFrame works closely with the core backtesting logic, providing the data needed to run simulations. Its primary function is to give you the ordered list of dates and times for your backtest. You can get a timeframe array for a specific trading symbol using the `getTimeframe` method, which handles caching to optimize performance.


## Class ClientExchange

This `ClientExchange` component acts as a bridge, providing access to exchange data for your backtesting and trading systems. It handles fetching historical and future market data – like candle data – and calculates important metrics like the Volume Weighted Average Price (VWAP).  You can retrieve past candles, get data needed for signal generation in backtests, and format prices and quantities according to the specific rules of each exchange.

Here's a breakdown of its key functions:

*   **Candle Data Retrieval:** It efficiently fetches historical and future candles, ensuring data accuracy and preventing "look-ahead bias" (using future data to influence past decisions). You can specify limits and date ranges.
*   **VWAP Calculation:**  It quickly calculates the VWAP, a key indicator reflecting the average price a security has traded at throughout the day, using the last few 1-minute candles.
*   **Price & Quantity Formatting:** This component formats prices and quantities correctly for each specific exchange, ensuring you're submitting orders and interpreting data in the right format.
*   **Order Book and Aggregated Trades:** You can retrieve order book snapshots and aggregated trade data, also taking into account the current time to avoid look-ahead bias. 
*   **Efficiency:** The code is optimized for performance, using prototype functions to minimize memory usage.



Essentially, this component makes it easier and more reliable to interact with different exchanges and gather the data you need for robust backtesting and trading strategies.

## Class ClientAction

The `ClientAction` component is the central hub for managing and running your custom action handlers within the backtest-kit framework. Think of it as a conductor orchestrating your strategy's logic. It takes care of setting up your handlers, ensuring they only initialize and clean up once, and routing different types of events – like signals from live trading or backtesting – to the appropriate handler methods.

It's designed to be flexible, letting you plug in handlers that manage things like your application's state, track what's happening, send notifications (via Telegram, Discord, or email), or gather analytics. The `signal` methods handle the core event routing, while specific methods like `breakevenAvailable` or `partialProfitAvailable` respond to particular trading milestones. Finally, `signalSync` provides a critical gate for position management using limit orders.



Essentially, `ClientAction` simplifies the process of integrating custom logic into your trading strategies.

## Class CacheUtils

This class provides a straightforward way to cache the results of your functions, particularly those used within a trading strategy. It’s designed to avoid redundant calculations by storing and reusing results based on time intervals or persisting them to disk.

The main feature is the `fn` method, which allows you to wrap a regular function to automatically cache its results, invalidating the cache when the timeframe changes.

There's also a `file` method for caching asynchronous functions to disk – this is handy for expensive computations that you want to reuse across multiple runs, like complex data analysis. This method stores the files within a specific directory structure, making management a bit easier.

To ensure clean operation, you can dispose of specific function caches using `dispose`, completely clear all caches with `clear`, or reset file cache counters with `resetCounter`. This is especially useful if your project’s working directory changes frequently, preventing cache conflicts.

Essentially, `CacheUtils` streamlines the process of caching, optimizing your trading framework's performance and ensuring consistent results across different strategy iterations.

## Class BrokerBase

This class, `BrokerBase`, provides a foundation for building connections to different trading platforms like exchanges. Think of it as a customizable middleman between your trading strategy and the actual exchange. It handles tasks like placing orders (both initial and adjustments like stop-loss orders), recording trades, and sending notifications.

You don’t have to re-implement every aspect of interacting with an exchange – this base class provides default behaviors for logging important events, which you can override to tailor it for your specific exchange.

**Here's how it works:**

1.  **Initialization:** You’ll initialize the broker using `waitForInit()`. This is where you’d connect to the exchange and authenticate.
2.  **Event Handling:** As your trading strategy runs, different events occur – like opening a position, hitting a stop-loss, or making a partial profit.  The `BrokerBase` provides "commit" methods for these events (`onSignalOpenCommit`, `onSignalCloseCommit`, etc.).  These are triggered automatically based on the actions your strategy takes.
3.  **Customization:** You extend the `BrokerBase` class and override these "commit" methods to add the actual exchange interaction logic – placing the orders and managing your positions.
4.  **Logging:** All events are automatically logged, helping you track what's happening and debug any issues.

The `BrokerBase` simplifies the process of integrating your trading strategy with different exchanges, providing a structured way to handle trading operations and keep a record of all actions.

## Class BrokerAdapter

The `BrokerAdapter` acts as a middleman between your trading strategy and the actual broker, providing a layer of control and safety. It’s designed to ensure that trade-related actions are handled consistently, whether you're backtesting or live trading.

Think of it as a transaction manager for your trades. Before any changes are made to the core data (like your account balance), the `BrokerAdapter` steps in. If any of the commit functions (like opening a signal, setting a stop-loss, or averaging into a position) fail, it prevents the changes from happening, ensuring your data remains consistent.

During backtesting, these commit functions are essentially ignored, allowing for quick simulations. When live trading, they forward the actions to your registered broker.

You configure the `BrokerAdapter` by registering a broker adapter - this can be an existing broker object or a class that creates one.  You then 'enable' the adapter to start listening for specific events, like trade openings and closings. When you’re done, you can ‘disable’ it, which stops the listening. A `clear` function allows you to refresh the broker connection if your environment changes.

## Class BreakevenUtils

This class offers helpful tools for examining breakeven events, providing insights into your trading strategy's performance. It acts as a central point for accessing and presenting breakeven data collected by the system.

You can easily retrieve aggregated statistics like the total number of breakeven events for a specific symbol and strategy.

It can also generate detailed markdown reports outlining each breakeven event, including vital information like the symbol, strategy used, entry price, breakeven price, and timestamp.

Finally, it provides a convenient way to save these reports directly to files, organized by symbol and strategy name, for later review or sharing. Think of it as your automated breakeven report generator and data analyst.

## Class BreakevenReportService

The BreakevenReportService is designed to keep track of when your trading signals reach their breakeven point. It acts as a listener, capturing these significant events – moments when a trade has recovered its initial investment.

All the details about these breakeven achievements, like the specifics of the signal, are logged and stored in a database. 

To use it, you'll subscribe to receive these breakeven events.  This subscription is managed to prevent issues with overlapping registrations.  When you’re finished, you can unsubscribe to stop receiving the events.  The service also utilizes a logger for debugging purposes, and ensures the data is reliably saved to your database through the ReportWriter.

## Class BreakevenMarkdownService

The BreakevenMarkdownService helps you automatically create and store reports detailing breakeven events for your trading strategies. It listens for these events and organizes them, then transforms the information into readable markdown tables that summarize the data. 

You can subscribe to the service to receive these events, and then use the `tickBreakeven` method to process them. The service keeps track of events for each symbol and strategy combination, ensuring everything is neatly separated.

It provides a way to access key statistics about the breakeven events and can generate full reports for a specific trading symbol and strategy.  The reports are saved to disk in a standardized format, making it easy to review and analyze your trading performance.  You can even clear out the stored data when it's no longer needed, either selectively or completely.

## Class BreakevenGlobalService

This service acts as a central point for managing breakeven calculations within the trading system. Think of it as a middleman; it receives requests related to breakeven, logs them for monitoring purposes, and then passes them on to another service responsible for the actual calculations.

It's designed to be easily integrated into the core trading strategy – specifically, it's injected along with other necessary settings. This keeps things organized and makes it simple to track how breakeven is being handled across the entire system.

Several validation services are also integrated to ensure the strategy, associated risks, exchanges, and other elements exist before processing requests.

The `validate` method is a quick check to confirm that a strategy and its related risk configurations are valid, and it remembers previous checks to avoid repeating them unnecessarily.

The `check` method determines if a breakeven trigger should occur, and if so, it signals that action. Finally, the `clear` method resets the breakeven state when a trading signal ends.

## Class BreakevenConnectionService

This service helps keep track of breakeven points for trading signals. It’s designed to efficiently manage and reuse breakeven calculations, creating a dedicated instance for each signal ID.

Think of it as a factory that produces and manages "ClientBreakeven" objects, making sure each signal has its own record. These objects are cached, so you don't have to recreate them every time you need to check or clear the breakeven status.

When a signal is checked, this service either finds an existing breakeven record or creates one, then performs the actual calculation. Similarly, when a signal closes, the service clears the breakeven record and removes it from the cache. It relies on other services for logging, actions, and managing time, and it sends notifications about breakeven events.

## Class BacktestUtils

This class provides tools for running and analyzing backtests. It's designed to be used as a central place to interact with the backtest system.

You can use it to run a backtest, execute it in the background without immediate results, or retrieve information about a specific backtest, such as the current pending signal or the position's profitability. The class handles things like DCA entries, partial profit/loss takes, and trailing stop/take adjustments.

Here's a breakdown of what you can do:

*   **Run a backtest:**  `run()` initiates a backtest for a specific symbol and configuration.
*   **Background backtesting:** `background()` runs tests without needing to immediately see the results – good for testing things that don't directly produce data.
*   **Signal information:** Retrieve details about pending signals, including the breakeven price, the effective entry price (accounting for DCA), and potential profit/loss percentages.
*   **Position details:** Get information about the current position, such as the number of units held, the total cost, and the percentage of the position that has been closed.
*   **Control the backtest:** You can activate scheduled signals, close pending signals, commit partial profit or loss orders, and adjust trailing stop/take levels.
*   **Data and Reporting:**  Access statistics and generate reports with key performance metrics.
*   **Listing active tests:** See a list of currently running backtests and their status.



The class is designed as a singleton, so you don't need to create instances, it's a single central point of access for backtest utilities.

## Class BacktestReportService

The BacktestReportService helps you keep a detailed record of what's happening during your backtests. It diligently captures every signal event – when a signal is idle, opened, active, or closed – and saves that information to a database.

Think of it as a logbook for your trading strategy’s performance during the backtest.

You subscribe the service to the backtest’s signal emitter to receive these events, ensuring you don’t accidentally duplicate your subscriptions. The `subscribe` method returns a function to unsubscribe, letting you gracefully stop the event flow when needed.  If you're no longer subscribed, `unsubscribe` simply does nothing. The service also utilizes a logger to output debugging information.


## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save reports about your backtesting results. It works by listening for events as your strategy runs and keeps track of the signals that have closed. 

It uses a clever storage system to keep data separate for each symbol, strategy, exchange, timeframe, and backtest run, preventing interference between different tests. 

You can use it to generate reports in markdown format, which are easy to read and share. These reports detail the information about the closed signals.

The service can automatically save these reports to a specific directory on your disk.

To use it, you subscribe to the backtest signal emitter to receive tick events, ensuring the service is active during your backtest.  When you're done, you can unsubscribe to stop receiving those events. It offers ways to clear all accumulated data or just data for a specific backtest configuration.

## Class BacktestLogicPublicService

This service helps you run backtests, taking care of automatically managing the context needed for your strategy. It simplifies the process by handling things like the strategy name, exchange, and frame—you don't have to pass them around explicitly. 

Essentially, it acts as a layer on top of the private backtest logic, making it easier to use.

The `run` function is the core of this service; it executes the backtest for a specific symbol and provides a stream of results, like signals to open, close, or cancel positions. The context, containing details about the strategy and environment, is automatically passed to all related functions during the backtest. 

It uses two key components: a logger service and the private backtest logic itself.

## Class BacktestLogicPrivateService

The BacktestLogicPrivateService helps run backtests in a way that's efficient with memory. It works by first gathering the timeframes you'll be testing from a frame service.

Then, it steps through each timeframe, processing them one by one. When a trading signal appears (like a buy or sell opportunity), it fetches the necessary candle data and executes the backtest logic.

The service skips ahead to the timeframe where the signal is closed, then it reports the outcome of the test. This process continues, giving you a continuous stream of results without storing everything in memory at once. You can even stop the backtest early if needed.

To make it work, it needs dependencies like services that handle strategy logic, exchange data, frame management, and more. The `run` method is where you start the backtest process for a specific symbol, and it produces a stream of results.


## Class BacktestCommandService

The BacktestCommandService is like a central hub for running backtests within the system. It provides a straightforward way to access and utilize backtesting capabilities.

It's essentially a helper, built on top of the more detailed BacktestLogicPublicService, making it easy to inject and use for backtest related tasks. 

Several internal services, such as those handling validation and logging, are also managed and accessed through this service.

The core function is `run`, which lets you execute a backtest for a specific trading symbol.  You also need to supply details like the strategy, exchange, and frame names for the backtest to work correctly. It returns a sequence of results representing what would have happened on each tick during the backtest.

## Class ActionValidationService

This service helps you keep track of and double-check your action handlers, which are essential components for your trading strategies. It acts like a central manager for all your action handlers, making sure they are properly registered before anything runs.

It lets you register new action handlers using `addAction`, and then easily verify their existence with `validate`.  This prevents errors later on.

To speed things up, it remembers the results of those validations, so it doesn't have to repeat the checks every time. Finally, `list` provides a way to see all the action handlers currently registered. 

Essentially, it's your safety net and organizational tool for managing action handlers within the backtest-kit framework.


## Class ActionSchemaService

The ActionSchemaService acts as a central hub for managing and organizing action schemas within your trading framework. It ensures that action schemas are registered correctly, validated for consistency, and easily accessible when needed.

It uses a type-safe system to store these schemas, helping to prevent errors. The service also checks that action handlers only use the methods they're supposed to, promoting cleaner and more reliable code.

Here's a breakdown of its capabilities:

*   **Registration:** You can register new action schemas, and the service will verify they're properly structured and that the methods used are valid. It won't allow duplicate action names.
*   **Validation:** Before a schema is registered, a quick check confirms that all the required properties are present and of the correct type.
*   **Updates:** You can modify existing action schemas – just provide the changes you want, and the service will merge them with the original. This avoids the need to re-register everything from scratch.
*   **Retrieval:** When needed, you can easily fetch a specific action schema by its name, allowing other parts of the system to use the configuration details.

The service keeps track of which actions are available and how they should be handled, ultimately contributing to a more organized and robust trading environment.

## Class ActionProxy

The `ActionProxy` is a safety net for your custom trading logic within the backtest-kit framework. Think of it as a wrapper around your code that ensures things don't break unexpectedly. It's designed to prevent errors in your action handlers—the functions you write to define how your trading strategy reacts to market events—from crashing the entire backtesting or live trading system.

Whenever one of your action handlers encounters a problem, the `ActionProxy` catches the error, logs it, and keeps the process moving. It’s like having a built-in error handler.  This is achieved through `try...catch` blocks surrounding all the action methods.

You don't directly create `ActionProxy` instances; instead, you use `fromInstance()` to wrap an existing handler.

The `ActionProxy` handles a range of events, including:

-   `init`: Initial setup.
-   `signal`: General signal processing.
-   `signalLive`: Signal processing in live trading.
-   `signalBacktest`: Signal processing during backtesting.
-   `breakevenAvailable`: Handling breakeven events.
-   `partialProfitAvailable`: Managing partial profit targets.
-   `partialLossAvailable`: Managing partial loss limits.
-   `pingScheduled`: Dealing with scheduled signals.
-   `pingActive`: Managing active positions.
-   `pingIdle`: Handling periods of inactivity.
-   `riskRejection`: Responding to risk management rejections.
-   `dispose`: Clean up when the strategy finishes.

Notably, the `signalSync` method is an exception to this error-handling rule, as errors here need to propagate for proper limit order handling.  Essentially, `ActionProxy` helps keep your trading strategy stable and prevents errors from bringing down the whole system.

## Class ActionCoreService

The ActionCoreService acts as a central coordinator for handling actions within your trading strategies. It’s responsible for automatically managing and executing these actions based on the defined strategy schema.

Think of it as a traffic controller for events; it receives information (like market ticks, breakeven notifications, or scheduled pings) and distributes them to the appropriate actions within a strategy.

Here's a breakdown of its key functionalities:

*   **Action Management:** It reads the list of actions defined in a strategy’s schema and orchestrates their execution.
*   **Validation:** It ensures the strategy setup and related components (exchange, frame, risks, and actions) are valid and consistent.
*   **Event Routing:**  It dispatches specific events – like market updates, breakeven notifications, or scheduled tasks – to the corresponding actions in a predefined order. There are distinct routing methods for backtesting, live trading, and signal synchronization.
*   **Initialization & Cleanup:** It handles the initialization of actions before a strategy runs, including loading any necessary persisted data.  It also cleans up actions when a strategy finishes.
*   **Synchronization:** `signalSync` provides a way to ensure all actions agree on position-related events.

The service relies on various other services for its operations, like validation and schema retrieval, making it a vital piece of the framework's infrastructure. You generally won't interact with this service directly; it operates behind the scenes to manage action execution.


## Class ActionConnectionService

This component acts as a central hub for directing different actions within your trading strategies. It intelligently routes specific events – like signals, breakeven updates, or scheduled pings – to the correct action handler, based on details like the action's name, the strategy and frame it belongs to, and whether it's a backtest. To improve performance, it remembers previously created action handlers, so it doesn't need to recreate them every time.

Think of it as a traffic controller, ensuring each signal gets to the right place without unnecessary work.

Here's a breakdown of what it does:

*   **Action Routing:** It takes an action name and related context information (strategy, exchange, frame, and backtest mode) and figures out which action handler should receive the event.
*   **Caching:** It keeps a record of the action handlers it's already created, so it can quickly reuse them, making things faster. The cached instances are specific to a combination of strategy, exchange, and frame, meaning different strategies and frames have their own isolated sets of action handlers.
*   **Event Handling:** It provides various methods (`signal`, `signalLive`, `breakevenAvailable`, etc.) for sending different types of events to the appropriate action handlers. Each of these methods takes a relevant event and context information.
*   **Initialization & Cleanup:** It has functions to initialize and dispose of these action handlers, ensuring they're properly set up and cleaned up when needed. The `clear` function specifically helps to clear the cached action handlers.



This component is designed to be efficient and reliable, ensuring the correct actions are executed at the right time.

## Class ActionBase

The `ActionBase` class is your foundation for extending the backtest-kit framework. It’s designed to help you add custom logic and integrations to your trading strategies, like handling notifications, logging events, or connecting to external services. Think of it as a starting point where you can plug in your own code to extend the core functionality.

When you create a custom action handler, you inherit from `ActionBase`, which provides default behavior for many common tasks, such as logging events automatically. You only need to implement the methods relevant to your specific needs, avoiding repetitive boilerplate code. The framework calls these methods at specific points during the strategy execution – like when a signal is generated, a breakeven point is hit, or a position reaches a profit/loss milestone.

The lifecycle of an action handler starts with its creation and continues through initialization (`init`), where you can set up any resources it needs. Events like signals (`signal`, `signalLive`, `signalBacktest`) are then triggered as the strategy runs, allowing your code to react to those events. Finally, `dispose` gets called at the end to clean up everything.

Each event method (like `signal`, `breakevenAvailable`, `partialProfitAvailable`) has a version for live trading and backtesting, so you can tailor your actions differently based on the environment. The `riskRejection` method informs you when a signal is blocked by risk management. The `ping` methods track the state of the strategy (scheduled, active, or idle) allowing for monitoring of these states.

