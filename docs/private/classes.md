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

The WalkerValidationService helps you keep track of and make sure your parameter sweep setups (called "walkers") are correctly configured. Think of it as a central place to register your walkers, ensuring they exist before you try to use them in your backtesting.

It keeps a record of all your walkers, making it easy to see what's available.

To use it, you'll add your walker configurations using `addWalker`. Before running anything, you’ll use `validate` to confirm a walker exists – this prevents errors later on. You can also use `list` to see all the walkers you've registered. It also remembers its validation results to speed things up.

## Class WalkerUtils

WalkerUtils simplifies working with walkers, which are processes that evaluate trading strategies. It provides a central place to run walkers, automatically managing details like which exchange and data to use.

Think of it as a helper for running and managing your trading strategy experiments. It keeps track of each walker's progress and allows you to easily stop them.

Here's a breakdown of what you can do:

*   **Run walkers:** Start a walker comparison for a specific trading symbol.
*   **Run walkers in the background:** Similar to running, but it doesn't show you the results – useful for tasks like logging or triggering other actions.
*   **Stop walkers:** Halt a walker's strategy generation. This allows ongoing signals to finish, but prevents new ones from being created.
*   **Get walker data:** Retrieve the results of a walker’s strategy comparisons.
*   **Generate reports:** Create a summary of a walker’s performance in a readable markdown format.
*   **Save reports:**  Save those generated reports directly to a file.
*   **List active walkers:** See a list of all currently running walkers and their status.

WalkerUtils ensures that each walker operates independently, preventing conflicts when working with multiple walkers simultaneously. It’s designed to be convenient and easy to use, acting as a single point of access for common walker operations.

## Class WalkerSchemaService

The WalkerSchemaService helps keep track of different "walker" schemas, acting like a central place to store and manage them. It uses a special storage system to ensure the schemas are consistent and typed correctly.

You can add new walker schemas using the `addWalker` function, and then find them again later by their names.

It has some built-in checks to make sure new schemas have the necessary information before they are added.

The `override` function lets you update existing schemas with just the changes you need.

Finally, you can use `get` to retrieve a specific schema when you need it.

## Class WalkerReportService

The WalkerReportService helps you keep a record of your optimization runs. It’s designed to track how your strategies perform as you tweak their parameters.

It essentially listens for updates from your optimization process and saves the results – metrics, statistics, and which strategies are doing well – into a database. 

You can think of it as a way to monitor your progress and compare different strategy configurations. 

The service is built to avoid accidental duplicate subscriptions, ensuring a clean and reliable logging process. To use it, you subscribe to receive updates, and when you’re done, you unsubscribe.

## Class WalkerMarkdownService

This service helps you create and save detailed reports about your trading strategies as they're being tested. It listens for updates from your trading simulations, keeping track of how each strategy is performing. 

Think of it as a report generator – it gathers data during the simulation and organizes it into easy-to-read markdown tables. These reports are then saved to your computer in a structured way, so you can easily compare different strategies and analyze their results.

You can subscribe to receive these updates, and unsubscribe when you no longer need them. The `tick` function is responsible for processing the updates and building up the results. There are methods to retrieve specific data, generate a full report, and save the report to a file. Importantly, you can clear the stored data for individual walkers or all walkers at once, allowing you to start fresh with new testing.

## Class WalkerLogicPublicService

This service helps coordinate and manage the execution of walkers, which are essentially automated processes for testing and evaluating trading strategies. It simplifies things by automatically passing along important information like the strategy's name, the exchange being used, the timeframe, and the walker's identity.

Think of it as a helper that makes sure all the necessary details are available when a walker runs.

The `run` method is your primary tool: it takes a symbol (like "AAPL") and some contextual information and then generates a sequence of results from the walker's execution. It's designed to run tests for all your defined strategies. The service relies on other internal components for schema management and private walker logic.

## Class WalkerLogicPrivateService

WalkerLogicPrivateService helps you compare different trading strategies, essentially orchestrating the process.

It steps through each strategy one by one, keeping you updated on the progress along the way and tracking the best performance seen so far.

Finally, it provides a complete report, ranking all the strategies you tested.

This service relies on BacktestLogicPublicService to actually run each strategy's backtest.

The `run` method is the main way you interact with this service – you tell it which symbol to backtest, which strategies to use, which metric to optimize for, and some contextual information. It then returns a series of progress updates as each backtest finishes.

## Class WalkerCommandService

The WalkerCommandService acts as a central hub for interacting with the walker functionality within the backtest-kit framework. Think of it as a simplified access point, making it easier to use the walker logic in different parts of your application. 

It manages dependencies like logging, walker logic, schema validation, and exchange validation—essentially, all the components needed to run and verify your trading strategies.

The key function you'll use is `run`, which allows you to execute a walker comparison for a specific trading symbol. This function takes the symbol and context information (like the names of the walker, exchange, and frame) and returns a series of results, letting you analyze how different strategies perform in a consistent environment. It’s designed to be used when you need to orchestrate and observe the results of walker comparisons.

## Class TimeMetaService

The TimeMetaService helps you keep track of the most recent candle timestamp for each trading setup you're using—think symbol, strategy, exchange, and timeframe—across your backtests. It’s like having a reliable clock that knows exactly when each trade opportunity occurred.

It works by remembering the latest timestamp, and if it doesn't have one yet, it will wait a bit to see if one arrives. If you're already in the middle of a trading execution, it can get the timestamp quickly from another service.

You can ask it to forget those timestamps, especially when starting a new backtest or live trading session, which keeps things fresh and prevents errors caused by old data. The service automatically updates itself after each trading tick, so you always have the latest information without having to constantly ask for it. It's designed to be reliable and simple to use, making sure you have the timing information you need when you need it.

## Class SystemUtils

The `SystemUtils` class helps keep your backtesting sessions separate and clean. It's designed to prevent one backtest from accidentally affecting another by interfering with shared data. 

Think of it like creating a temporary "clean slate" for each backtest.

The `createSnapshot` method lets you take a picture of the current listener state—essentially, it clears out the listeners for global subjects. This ensures that when a new backtest runs, it starts with a fresh and isolated environment. You can then restore that original listener state later when you're done with the backtest.

## Class SyncUtils

SyncUtils helps you analyze and understand the lifecycle of your trading signals. It gathers information about signal openings and closures to provide insights into performance.

You can use it to get statistical summaries of signal activity, like the total number of signals opened and closed.

It can also generate detailed markdown reports which include tables showing signal details like entry and exit prices, profit/loss percentages, and timestamps. These reports can be saved as files for later review or sharing. The reports include information about the symbol traded, the strategy used, and the trading frame.

## Class SyncReportService

The SyncReportService helps you keep a record of what’s happening with your trading signals. It's designed to automatically track when signals are created (when an order is filled) and when they're closed (when a position is exited).

Think of it as a detailed logbook for your trading activity.

It listens for specific events related to signals and records information like the details of the signal itself when it starts, and profit/loss along with the reason for closure when it ends. This is perfect for keeping a clear audit trail.

You subscribe to receive these events, and when you're done, you can easily unsubscribe. The system makes sure you're not accidentally adding multiple subscriptions. It uses a dedicated logger to provide useful debug output.

## Class SyncMarkdownService

This service is designed to automatically create and save reports about signal synchronization events. It essentially listens for signals being opened and closed, and keeps track of all the details.

Think of it as a record keeper for your trading signals—it collects information about when signals are opened, closed, and the reasons behind closures. This information is then neatly formatted into markdown tables, which are easy to read and understand.

You can subscribe to start receiving these events, and it's a one-time subscription to avoid duplicate registrations. Conversely, you can unsubscribe to stop listening and clear out all collected data.

The `tick` function is the workhorse—it receives each signal event, adds a timestamp, and organizes it into a specific category based on the symbol, strategy, exchange, and time frame. The `getData` function lets you retrieve accumulated statistics for a specific combination of these factors.  The `getReport` function constructs a full markdown report based on the stored data. You can also trigger a `dump` to save the report directly to a file. Finally, the `clear` function allows you to wipe out all collected data or just data for a specific trading setup.

## Class StrategyValidationService

This service acts as a central hub for managing your trading strategies. It keeps track of all the strategies you've defined, ensuring they exist and that any related risk profiles and actions are set up correctly.

You can use it to register new strategies with `addStrategy`, which lets you add strategy configurations. 

Before using a strategy, the `validate` function checks that everything is in order, preventing errors later on.  

Need to see what strategies you've registered? `list` provides a handy way to see a complete list of all your strategy schemas. 

For efficiency, the service remembers the results of validation, so it doesn't have to re-check things unnecessarily. It relies on other services, `riskValidationService` and `actionValidationService`, to handle the validation of related configurations.

## Class StrategyUtils

StrategyUtils provides tools to analyze and report on how your trading strategies are performing. It gathers information about events like closing trades, taking profits, or adjusting stop-loss orders.

You can use it to get statistical summaries of strategy activity, like how many times a particular action was taken. It also lets you create detailed markdown reports that present these events in a clear, table-formatted view, including important details such as prices, percentages, and timestamps.

Finally, you can easily save these reports to files on your computer, automatically creating the necessary directories to store them. These reports are named in a way that helps you quickly identify the strategy, symbol, and timeframe they represent. It functions like a centralized helper, pulling data and creating reports based on what's been recorded.


## Class StrategySchemaService

This service helps keep track of strategy schemas, acting like a central directory for your trading strategies. It uses a specialized system to ensure everything is typed correctly and safely stored. 

You can add new strategy schemas using the `addStrategy` function (referred to as `register` here), and then retrieve them later by their name using `get`.

Before adding a new strategy, the `validateShallow` function checks if the basic structure of the schema is correct, making sure all the essential parts are present and of the right type.

If you need to update an existing strategy, the `override` function lets you change specific parts of the schema without replacing the entire thing.

The `loggerService` property allows you to integrate logging for debugging and monitoring the service's operations.


## Class StrategyReportService

This service helps you keep a detailed, permanent record of what's happening in your trading strategies. Think of it as a robust audit trail, writing each key event – like canceling a scheduled order, closing a pending trade, taking partial profits or losses, adjusting trailing stops, or hitting breakeven – to individual JSON files.

To use it, you first need to "subscribe" to start logging. Then, whenever a relevant event occurs, you'll use specific functions like `cancelScheduled` or `partialProfit` to record it.  These functions gather information about the trade, like the symbol, the current price, and the strategy's performance, and save it to a file. 

Crucially, unlike other reporting methods, this service writes each event *immediately* to disk, rather than building up a report in memory. This ensures you always have a reliable record, even if something goes wrong.  When you're finished, you "unsubscribe" to stop the logging.  It's designed to be easy to manage, and it’s safe to unsubscribe multiple times.


## Class StrategyMarkdownService

This service helps you keep track of what your trading strategies are doing and create reports about them. It's designed to collect events like signals being canceled or profits being taken, and then generate summaries in a readable markdown format.

Think of it as a detailed logbook for your strategies. Instead of writing each event directly to a file, it holds them temporarily to allow for creating larger, more useful reports.

Here's how it works:

*   **Start Tracking:** Use `subscribe()` to tell the service to start watching for events.
*   **Events are Recorded:** It automatically tracks various actions, such as canceling scheduled orders, closing positions, and taking partial profits.
*   **Gather Data:**  You can retrieve the collected events and stats using `getData()`.
*   **Generate Reports:** `getReport()` creates a formatted markdown report, while `dump()` creates and saves that report as a file.
*   **Stop Tracking:** Use `unsubscribe()` to stop collecting events and clear everything out.

It utilizes a clever system to manage these events, keeping them organized for each strategy and symbol, and only creating new storage areas when needed.  It’s designed to be easy to use, allowing you to create detailed reports that help you understand and improve your trading strategies. You can selectively clear data for particular strategies or clear everything at once.

## Class StrategyCoreService

This service acts as a central hub for managing and interacting with trading strategies, particularly during backtesting and live trading. It essentially wraps and enhances the connection to a trading strategy, providing helpful methods for retrieving data and performing actions related to a specific trade.

It provides functions to retrieve key information about a pending or scheduled signal, like its price, cost, potential profit/loss, and details about partial closes.  You can also find methods for validating, adjusting, and ultimately closing strategies.

The `tick` function allows you to check the state of a strategy at a particular point in time. There are also functions to run quick backtests (`backtest`) and control the strategy, like stopping it (`stopStrategy`) or canceling a scheduled trade (`cancelScheduled`). Finally, it provides methods for cache management and advanced calculations related to position risk and performance.  It's intended to be used internally by other parts of the backtest and live trading systems.


## Class StrategyConnectionService

The `StrategyConnectionService` acts as a central router for trading strategies within the backtest-kit framework. It handles all requests to strategies, ensuring the correct strategy implementation is used for a specific symbol and trading environment (exchange and frame). It smartly remembers previously used strategy instances to avoid unnecessary creation, improving performance.

Here's a breakdown of its key functions:

*   **Routing:** It directs strategy calls to the correct implementation, based on the symbol and trading conditions.
*   **Caching:**  It efficiently stores and reuses strategy instances, preventing redundant creation.
*   **Initialization:** Ensures strategies are properly set up before any trading actions.
*   **Both Live and Backtesting:** Supports both real-time trading (tick) and historical analysis (backtest) scenarios.

The service provides various methods to interact with strategies, including:

*   Retrieving pending signals, calculating position details (cost, PnL), and managing partial and average buy orders.
*   Checking and adjusting stop-loss and take-profit levels.
*   Stopping a strategy and clearing its cached state.

Essentially, it provides a structured and optimized way to manage and execute trading strategies within the framework.

## Class StorageLiveAdapter

The `StorageLiveAdapter` provides a flexible way to manage how your trading signals are stored, allowing you to swap out different storage methods easily. It acts as a central point for interacting with storage, abstracting away the specific implementation details.

You can choose between several storage options: persistent storage (saving signals to disk), in-memory storage (keeping signals only in memory), or a dummy adapter for testing purposes. The adapter pattern makes switching between these options simple.

The `getInstance` property is a clever way to ensure the storage utilities are created only when needed and reused efficiently; you can force it to recreate if you need. The `handleOpened`, `handleClosed`, `handleScheduled`, and `handleCancelled` methods forward events to the currently selected storage. `findById` and `list` methods allow you to retrieve signals from storage.

`useStorageAdapter` lets you register your own custom storage implementation. If your working directory changes between strategy runs, you'll want to call `clear` to ensure the storage instance is recreated with the updated path. The `useDummy`, `usePersist`, and `useMemory` methods provide shortcuts to switch between common storage adapters.

## Class StorageBacktestAdapter

The `StorageBacktestAdapter` provides a flexible way to manage how trading signals are stored during backtesting. It acts as an intermediary, allowing you to easily switch between different storage methods like persistent storage (saving to disk), in-memory storage (for quick tests), or a dummy storage (which doesn't actually save anything).

Think of it as a central hub that connects your backtesting process to your chosen storage solution. 

You can choose the storage method using convenience functions like `usePersist`, `useMemory`, or `useDummy`, and once selected, the adapter handles all the underlying storage operations for you. It has methods for finding signals by ID, listing all signals, and responding to various signal events like opening, closing, scheduling, and cancellations.

The `getInstance` property cleverly caches the storage utility, building it only once and reusing it to improve performance, but it can be reset if needed, for example, when switching between backtest strategies. The `clear` method is particularly important to call when your working directory changes during a backtest to ensure a fresh storage instance is used.

## Class StorageAdapter

The StorageAdapter is responsible for handling and organizing your trading signals, both those generated during backtesting and those from live trading. It automatically keeps track of new signals as they come in by listening for updates. 

You can easily access signals from either your backtest runs or your live trading environment through a single, unified interface.

To prevent issues, the adapter uses a system that ensures it only subscribes to signal updates once.

If you need to stop the adapter from collecting signals, you can disable it – and it’s safe to disable it even if it's already been disabled.

You can also quickly retrieve a specific signal using its ID, or view lists of all backtest signals and all live signals currently stored.

## Class StateLiveAdapter

The `StateLiveAdapter` helps manage and store information about trading signals, allowing different ways to handle that data. Think of it as a central place to keep track of important details like how a trade is performing.

It has several options for where that data is stored: in memory for quick access, on disk for permanent storage, or even a "dummy" mode that simply ignores any changes (useful for testing). The default is to store data on disk so it survives when your program restarts.

The adapter also remembers certain data, like the peak performance and how long a trade has been open, which can be crucial for evaluating a trading strategy, especially when using AI to guide decisions.

You can easily switch between these storage methods and even plug in your own custom ways of managing the data. The `disposeSignal` method cleans up old data when a signal is finished. The `clear` method is helpful when the base directory for your program changes to ensure fresh data is used.

## Class StateBacktestAdapter

The `StateBacktestAdapter` helps manage and store data during backtesting, offering flexibility in how that data is handled. It’s designed to work with different storage methods, allowing you to choose between keeping data in memory, saving it to a file, or using a dummy adapter that simply discards any changes.

Think of it as a central hub for tracking important metrics like peak profit and how long a position has been open, specifically for evaluating trading rules based on LLM (Large Language Model) insights.

You can easily switch between these storage options – in-memory, persistent (disk-based), or dummy – to suit your needs. It automatically handles caching data for efficiency, but it has a way to clear that cache when needed, like when the base directory changes. The `disposeSignal` method is vital for cleaning up data when a signal is finished.

The `getState` and `setState` methods provide the core functionality for reading and updating this tracked data during the backtest.

## Class StateAdapter

The StateAdapter is the central component for managing how your trading data is stored and accessed, whether you're running a backtest or a live trading session. 

It automatically handles cleaning up old data when signals are finished, ensuring your system doesn't get bogged down with unnecessary information. 

You can easily enable or disable the state storage functionality, and it makes sure that updates and reads go to the correct storage location – either for backtesting or live trading – based on your instructions. 

The `enable` property ensures that the subscription to signal events happens only once. The `disable` function safely removes the subscription multiple times. 

The `getState` method allows you to retrieve the current data associated with a particular signal, while `setState` is used to update that data.


## Class SizingValidationService

The SizingValidationService helps you keep track of and verify your position sizing strategies. It's like a central hub for all your sizing rules.

You can register new sizing strategies using `addSizing`, telling the service about them.  Before you actually use a sizing strategy, `validate` checks to make sure it's registered, preventing errors. 

To speed things up, the service remembers validation results (this is called memoization).  If you just want to see what sizing strategies you've registered, `list` provides a quick overview.  Essentially, this service keeps your sizing strategies organized and confirms they're ready to use.

## Class SizingSchemaService

The SizingSchemaService helps you organize and manage different sizing strategies for your trading system. It’s like a central place to store and access pre-defined sizing rules, making sure they're all consistent and typed correctly. 

It uses a special registry to safely store these sizing strategies, preventing errors caused by mismatched data types. You can add new sizing strategies using `addSizing()` and easily retrieve them later by their name using `get()`.

Before a sizing strategy is added, a quick check ensures it has the necessary building blocks. If you need to update an existing sizing strategy, you can use `override()` to apply partial changes. This service ensures your sizing logic is well-managed and easy to maintain.

## Class SizingGlobalService

This service handles the complex process of determining how much to trade. 

It's a central component, managing the calculations needed for sizing positions.

The service relies on other components like a sizing connection service and a sizing validation service to perform its tasks.

You can think of it as the brains behind figuring out how much capital to allocate to each trade based on your risk profile.  The `calculate` method is the main way to request a size, providing parameters and context for the calculation.


## Class SizingConnectionService

The SizingConnectionService helps manage how your trading strategies determine position sizes, connecting to the right sizing logic based on the strategy's configuration. 

It acts as a central point for sizing calculations, directing requests to specific sizing implementations.

To improve performance, it remembers (caches) these sizing implementations, so it doesn't need to recreate them every time.

When a strategy doesn't have its own sizing configuration, it uses an empty string for sizing routing.

The `getSizing` method is key – it retrieves the appropriate sizing implementation, creating it if it doesn’t exist yet and then remembering it for future use.

The `calculate` method then takes your sizing parameters and applies the selected sizing method to determine the appropriate position size, considering risk management factors. It handles different sizing methods like fixed percentage, Kelly Criterion, and ATR-based approaches.

## Class SessionLiveAdapter

This component allows you to manage live trading sessions and their data in a flexible way. It provides a way to connect to different storage methods for your session data, making it easy to switch between keeping data in memory, saving it to a file, or using a dummy adapter that simply discards changes. The default is to save your data to disk so it survives restarts, but you can easily switch to an in-memory adapter for testing or a dummy adapter for situations where you don't need to persist data. 

You can use helper functions to quickly choose which storage method you want to use: `useLocal`, `usePersist`, `useDummy` and `useSessionAdapter`. The system intelligently remembers which storage method is in use for different combinations of symbols, strategies, exchanges, and frames.

If you need to change the base path where files are saved, make sure to clear the cache with `clear` to ensure new instances are created with the correct configuration. This is especially important if you're running multiple strategies that might rely on different configurations. You can access and update session data using the `getData` and `setData` methods, which work with the currently configured storage adapter.

## Class SessionBacktestAdapter

This component helps manage and store data during backtesting, allowing for different ways of handling that data. It acts as a bridge, or adapter, between the backtesting process and how the data is actually held.

By default, it uses an in-memory storage, meaning data is only present while the backtest is running. However, you can easily switch to storing data on your hard drive for persistence. There’s even a “dummy” option which is useful for testing and ignores any data changes.

You can also plug in your own custom data storage methods if needed. The framework intelligently caches these storage methods, speeding up the process, but it has a way to clear the cache when necessary, particularly when your working directory changes. This lets you read and update the backtest data for specific symbols, strategies, exchanges, and timeframes.

## Class SessionAdapter

The SessionAdapter acts as a central point for handling data related to both backtesting and live trading sessions. It intelligently directs operations to either the backtest storage (SessionBacktest) or the live storage (SessionLive), depending on whether you’re running a simulation or a live trade.

You can retrieve data using `getData`, specifying the symbol, a context object containing strategy, exchange, and frame names, whether you're in backtest mode, and the timestamp.  Similarly, `setData` allows you to update data for a given symbol, context, backtest flag, and timestamp, again ensuring the correct storage is used. Essentially, it simplifies data access and management by abstracting away the differences between backtest and live environments.


## Class ScheduleUtils

The ScheduleUtils class helps you keep track of and understand your scheduled trading signals. It acts like a central point to access information related to signals that are waiting to be executed.

It provides a way to get data about signals, like how many are queued, how many are canceled, and how long they're typically waiting. 

You can also generate nicely formatted reports in Markdown, making it easy to review your scheduling performance for a specific strategy and symbol.

Finally, it offers a simple way to save these reports directly to a file. Think of it as a helper for monitoring and analyzing the health of your scheduling system.

## Class ScheduleReportService

This service is designed to keep a record of when signals are scheduled, opened, and cancelled, specifically for tracking any delays in order execution. It works by listening for these signal events and storing details like the time between scheduling and the actual execution or cancellation. 

Think of it as a watchdog making sure you can see the timeline of your signals.

You can use it to monitor and debug issues related to order delays.

The `subscribe` method allows it to connect to the signal emitter, and it’s designed to prevent accidental duplicate connections. When you're done, the `unsubscribe` method safely disconnects the service. The service also uses a logger to help with troubleshooting.

## Class ScheduleMarkdownService

The ScheduleMarkdownService helps you keep track of how your trading strategies are performing by automatically generating reports about scheduled signals. It listens for signals being scheduled and cancelled, and organizes this information by strategy.

It builds detailed markdown tables summarizing these events, including key metrics like cancellation rates and average wait times. These reports are saved as `.md` files in a designated logs directory, making it easy to review your strategy's behavior.

You can subscribe to receive signal events, unsubscribe when you no longer need them, and clear out old data to keep things tidy. The service also provides methods to retrieve statistical data and reports for specific symbol-strategy combinations, and offers a way to save those reports directly to disk. Each strategy operates with its own dedicated storage space.

## Class RiskValidationService

The RiskValidationService helps you keep track of your risk management configurations and makes sure they're all set up correctly. It acts like a central hub, managing a list of risk profiles.

Before any operations that rely on a risk profile, the service will check to see if it exists, preventing potential issues down the line. 

To make things efficient, validation results are cached, so you don't have to repeat checks unnecessarily.

You can add new risk profiles using `addRisk`, confirm their existence using `validate`, or get a full list of what's registered with `list`. It also has a `loggerService` and an internal `_riskMap` for managing the data.

## Class RiskUtils

This class provides tools for analyzing and reporting on risk rejection events within your trading system. Think of it as a way to automatically generate reports and statistics about why trades were rejected, helping you identify and address potential issues in your strategies.

It gathers data about rejections – including details like the symbol involved, the trading strategy used, the position taken, the exchange, the price, and the reason for the rejection.  The information comes from a central service that listens for rejection events.

You can use it to:

*   Get aggregated statistics on rejections, such as the total number of rejections and breakdowns by symbol or strategy.
*   Generate detailed markdown reports that list all rejection events in a table format, including key information about each rejection.
*   Save these reports as files on your computer, making it easy to review and share them. The files are named based on the symbol and strategy.



Essentially, this helps you keep track of and understand why your trading system might be rejecting trades, allowing for improved performance and risk management.

## Class RiskSchemaService

The RiskSchemaService helps you organize and manage your risk schemas, ensuring consistency and type safety. It acts like a central repository where you store your risk profiles. 

You can add new risk profiles using the `addRisk()` (or `register()`) method, and easily retrieve them later by their name using the `get()` method.

Before adding a risk schema, the `validateShallow()` function quickly checks that it has all the necessary parts and that they are the right types. This prevents errors and keeps your risk profiles in good shape.

If you need to update a risk profile that already exists, the `override()` function allows you to make changes without replacing the entire profile. 

The service leverages a tool registry to safely store and manage these risk schemas.

## Class RiskReportService

The RiskReportService helps you keep track of why your trading signals are being rejected. It acts like a recorder, listening for when signals are blocked by your risk management system.

It gathers details about each rejected signal – the reason for the rejection, and information about the signal itself – and stores this information in a database. This allows you to analyze why signals are being rejected and improve your risk controls.

You can use the `subscribe` method to start receiving these rejection notifications, and `unsubscribe` to stop. The system ensures you don't accidentally subscribe multiple times. Think of it as a simple way to create an audit trail of your risk management decisions. 




The service relies on a logger for debugging and has a component that handles the risk rejection events, ready to log them.

## Class RiskMarkdownService

This service automatically creates and saves detailed reports about rejected trades, which is helpful for understanding why trades aren't happening. It monitors for rejection events and organizes them based on the traded symbol and the strategy being used. 

The service then builds these events into easy-to-read markdown tables, along with overall statistics like the total number of rejections and a breakdown by symbol and strategy. You can configure which data points to include in the reports.

The reports are saved as markdown files, making them simple to view and share. The service provides methods to retrieve statistics, generate reports, save them to disk, and even clear out accumulated data when it’s no longer needed. You can specify which symbol, strategy, exchange, frame and backtest to clear.

## Class RiskGlobalService

RiskGlobalService is the central hub for managing risk within the trading framework. It handles the complex validation and tracking of trading signals to ensure they comply with predefined risk limits. 

It works closely with other services, like RiskConnectionService, to ensure everything operates within acceptable boundaries.

Here’s a breakdown of what it does:

*   It validates risk configurations to make sure they're correct and avoids repeating this process unnecessarily.
*   `checkSignal` verifies if a trading signal is permissible based on current risk rules.
*   `checkSignalAndReserve` is a special version of `checkSignal` that not only checks the signal but also locks it down to prevent conflicts from other simultaneous requests, ensuring fairness and accuracy.
*   `addSignal` registers a new trading signal once it's been approved.
*   `removeSignal` cleans up a signal when it's closed out.
*   `clear` lets you wipe out risk data, either selectively based on specific criteria or completely. 

Essentially, this service acts as a gatekeeper and record-keeper for all trading activity, safeguarding against excessive risk exposure.

## Class RiskConnectionService

This service acts as a central hub for managing risk checks within your trading strategies. It intelligently routes requests for risk validation to the correct risk implementation based on a provided name, ensuring that each strategy and exchange uses the appropriate risk rules. It’s designed to be efficient by remembering (caching) previously used risk implementations to avoid unnecessary work.

Think of it like a traffic controller for your risk assessments.

Here’s a breakdown of its key functions:

*   **`getRisk`:** This is the workhorse function. It retrieves the correct risk implementation, creating it if it doesn't already exist, and importantly, it remembers it for future use, speeding up your backtesting or live trading. The caching mechanism is aware of exchange and frame names to isolate risk calculations.
*   **`checkSignal`:** This function is used to determine whether a trading signal is permissible based on defined risk limits, covering aspects like portfolio drawdown, exposure, and position sizes. If a signal is rejected, it will notify the client using a defined event.
*   **`checkSignalAndReserve`:** A specialized version of `checkSignal` that's designed to be used in concurrent environments. It not only checks the signal’s validity but also immediately secures a spot for it in the active positions – vital for preventing conflicts when multiple signals are being processed simultaneously.
*   **`addSignal` & `removeSignal`:** These functions are for registering and removing trading signals from the risk management system.
*   **`clear`:** This function provides a way to clear the cached risk implementations, effectively resetting the risk environment for a specific risk name.

Essentially, this service provides a structured and optimized way to apply and manage risk rules, making your trading strategies more robust and efficient.

## Class ReportWriterAdapter

This component provides a flexible way to handle and store reports generated during backtesting or live trading. It acts as an intermediary, allowing you to easily swap out different storage methods without changing your core trading logic.

The system intelligently manages storage instances, ensuring there's only one for each type of report (like backtest results, walker data, or live trade information). This helps to optimize resource usage.

By default, reports are stored as JSONL (JSON lines) files, appending new data to them.  You can easily change this behavior, though, by providing your own storage adapter.  The system only creates the storage when you first write data, so it’s efficient.

It provides methods to change the default storage adapter, clear the existing storage cache if needed (like when your working directory changes), and even use a dummy adapter to effectively disable report writing for testing or debugging.

## Class ReportUtils

ReportUtils helps you control logging for different parts of your trading system, like backtesting, live trading, and performance analysis.

You can selectively turn on logging for specific services. When you enable logging, the system starts capturing events and writing them to JSONL files, along with helpful information for analysis.  It's important to remember to unsubscribe when you're done to avoid problems.

Conversely, you can turn off logging for certain services without affecting others. This allows you to focus logging only on the areas you're currently investigating. Disabling a service immediately stops the logging process.

## Class ReportBase

The `ReportBase` class helps you log and analyze data from your trading backtests. It writes events to files in a structured JSONL format, one event per line, making it easy to process later. 

Think of it as a system for collecting snapshots of what’s happening during your tests.

It handles creating the necessary directories and managing the writing process, including error handling and preventing data loss.  The files are organized in a predictable location like `./dump/report/{reportName}.jsonl`.

You can search these logs later to focus on specific events, filtering by things like the trading symbol, strategy, exchange, or the time frame being used.

The class ensures that writing data is reliable, handling potential delays and timeouts to prevent errors. Initializing the writing process is handled automatically, and you don't have to worry about it running multiple times.

Finally, you simply provide the data you want to record, along with some optional details, and it takes care of formatting and writing it to the log file.

## Class ReportAdapter

The ReportAdapter helps organize and store your trading data in a structured way, making it easy to analyze later. Think of it as a flexible system – you can swap out different storage methods (like JSONL files) without changing the core of your trading strategy. 

It also remembers which storage method is being used for each type of report, avoiding unnecessary setup. The adapter doesn't start writing data until it's needed, and it keeps a log of events in real-time.

You can customize the adapter to use a specific storage constructor. If you need to reset the storage, the `clear` function will wipe the cache. For testing or debugging, you can even use a dummy adapter that ignores all data. Finally, a handy `useJsonl` method lets you easily go back to the default JSONL-based storage.


## Class ReflectUtils

This utility class provides a way to track and understand the performance of your trading strategies in both backtesting and live trading environments. It acts as a central hub for retrieving key metrics like profit and loss, peak profit levels, and drawdown information.

Think of it as a reporting tool that consolidates various performance indicators related to active positions. It handles the complexities of calculations like slippage and fees, and provides details about how long a position has been open or waiting.

You can use it to quickly grab things like:

*   **Profit & Loss:** Unrealized P&L percentage and cost, highest profit achieved, and maximum drawdown.
*   **Time Metrics:** How long a position has been active, or the time elapsed since the highest profit/largest drawdown.
*   **Distance from Peaks:** The difference between the current price and the highest profit or worst drawdown, measured in P&L percentage or cost.

The class is designed to be used easily—it’s a singleton instance, meaning you only need one copy to access all its helpful functions. The `backtest` parameter lets you adapt the reporting to the specific context of a simulated backtest or live trading.

## Class RecentLiveAdapter

The RecentLiveAdapter helps you manage and retrieve recent trading signals, providing flexibility in how those signals are stored. It acts as a central point, allowing you to easily switch between different storage methods, like keeping data on disk for persistence or using memory for faster access.

You can plug in different storage implementations, with default options for persistent and in-memory storage.  The `getInstance` property makes sure that the storage is only created once and cached, speeding up access, and `clear` lets you refresh that cached storage when needed, particularly when your working directory changes.

Methods like `getLatestSignal` and `getMinutesSinceLatestSignalCreated` allow you to retrieve signal data, while `handleActivePing` deals with active ping events.  The `useRecentAdapter` function is your main control – it’s how you tell the adapter which storage method to use, and `usePersist` and `useMemory` offer quick shortcuts to switch between persistence and memory.

## Class RecentBacktestAdapter

This component manages how recent trading signals are stored and retrieved, offering flexibility through different storage options. It acts as a bridge, allowing you to switch between storing signals in memory or persistently on disk. 

You can easily change the storage method using `useMemory` to use an in-memory store (which is the default) or `usePersist` to save signals to a file. The `useRecentAdapter` function provides the ability to define custom storage solutions if needed.

The `clear` function is crucial to ensure that signals are correctly loaded when your project’s working directory changes, preventing unexpected behavior.  It effectively resets the storage mechanism, ensuring a fresh start with the most current configuration. The `getInstance` property handles setting up and caching the storage utility, so you don't have to worry about recreating it repeatedly. The `handleActivePing`, `getLatestSignal`, and `getMinutesSinceLatestSignalCreated` methods are straightforward ways to access information about the recent signals, acting as convenient entry points to the underlying storage.

## Class RecentAdapter

The RecentAdapter is the central component for handling recent trading signals, whether you’re backtesting or running live. It automatically updates and stores signals, ensuring you always have access to the most current information.

To prevent redundant subscriptions, it utilizes a "singleshot" mechanism, so it only subscribes once. 

You can enable or disable this process with the `enable` property and the `disable` method, respectively. The `disable` method is safe to call even if the adapter is already disabled.

The `getLatestSignal` method allows you to quickly get the most recent signal for a specific trading symbol and setup.  Crucially, it prevents "look-ahead bias" by only returning signals that occurred before a specified time.

Finally, `getMinutesSinceLatestSignalCreated` calculates how long ago the most recent signal was generated, also taking into account the look-ahead cutoff.

## Class PriceMetaService

PriceMetaService helps you get the current market price for a specific trading setup – like a particular symbol, strategy, exchange, and timeframe – even when you're not actively executing trades. It acts like a memory for prices, updating them as new information comes in.

This service keeps track of prices for each unique combination of symbol, strategy name, exchange name, frame name, and whether it’s a backtest. If you need the price outside of the usual trading cycle, like when executing a command between ticks, it can provide that information.

The service waits briefly for the first price to arrive and uses a cached system to store prices, making it efficient.  You can clear the stored prices for a specific setup or clear them all at once to make sure you’re always working with fresh data, which is especially important when starting a new backtest or live trading session. It’s automatically managed within the trading framework, keeping everything synchronized and preventing outdated information.

## Class PositionSizeUtils

This class offers helpful tools for figuring out how much of an asset to trade, which is crucial for managing risk. It provides different approaches to position sizing, like using a fixed percentage of your account, applying the Kelly Criterion (a more complex method based on win rates and losses), or using Average True Range (ATR) to account for market volatility. 

Each sizing method is a function that considers factors like your account balance, the asset's price, and other relevant data. The system automatically checks that the sizing parameters you provide are appropriate for the method you choose, helping prevent errors. Essentially, it's a set of ready-to-use formulas to help you determine the right size for your trades.

Here’s a quick rundown of the methods available:

*   **fixedPercentage:** Sizes your position based on a predetermined percentage of your available funds.
*   **kellyCriterion:** A more advanced calculation that considers win rate and win/loss ratio to determine an optimal position size.
*   **atrBased:** Calculates position size based on the Average True Range, a measure of price volatility.

## Class Position

The `Position` class provides helpful tools for determining where to place your take profit and stop loss orders when trading. It simplifies the process of figuring out these levels, and it even adjusts the direction (whether you're buying or selling) automatically.

It offers two key functions:

*   **moonbag:** This calculates take profit and stop loss levels based on a 'moonbag' strategy where the take profit is set at a fixed percentage above or below the current price.

*   **bracket:** This lets you define your own take profit and stop loss percentages, giving you more control over your risk and reward. It determines the appropriate price levels for both.

## Class PersistStorageUtils

This class provides tools to reliably store and retrieve signal data, ensuring your backtesting and live trading processes are resilient. It handles the storage automatically, creating separate files for each signal and managing them in a way that minimizes the risk of data loss.

It simplifies working with persistent storage by memoizing (caching) storage instances, so you don’t need to create them repeatedly. You can also customize how the data is stored using different storage adapters, or switch to a dummy adapter for testing purposes. 

The `readStorageData` function retrieves all stored signals for a specific mode (backtest or live), while `writeStorageData` saves the signals. To ensure data integrity, it performs atomic operations when reading and writing. If your working directory changes, you can clear the cache to force a refresh of the storage adapter.

## Class PersistStorageInstance

This class provides a way to save and retrieve trading signals persistently, using files on your computer. It's designed to work well with backtesting scenarios and focuses on reliability even if your system crashes unexpectedly.

Each trading signal is stored in its own JSON file, making it easy to manage individual signals. When you need to load signals, the system reads them all by looking at a list of available file names.

The `waitForInit` method ensures the storage is ready before you start working with it. You can retrieve all stored signals using `readStorageData` and update them with `writeStorageData`, which handles saving each signal individually, ensuring data integrity. The `backtest` property indicates whether it's used in a backtesting environment.

## Class PersistStateUtils

This class provides a way to reliably save and load state data for your trading strategies. It handles the underlying storage automatically, so you don't have to worry about file management. It uses a clever system to create storage locations based on identifiers (signalId and bucketName), ensuring each strategy has its own dedicated space.

The class cleverly manages the storage locations, creating them only when needed and reusing them as long as the identifiers stay the same.  You can even swap out the default storage method to use something custom, or switch to a dummy storage for testing purposes that doesn't actually save anything.

It offers methods to initialize the storage, read existing data, and write new data, all in a safe and organized way. A handy 'clear' function is available to wipe the storage cache when needed, like when your project’s working directory changes. Finally, you can also dispose of individual storage entries when a signal is no longer needed.

## Class PersistStateInstance

This class, `PersistStateInstance`, provides a simple way to save and load data related to a specific trading signal. Think of it as a container for managing the persistent state of your backtest. 

It uses a file-based system to store this data, ensuring that the saves are handled carefully. Each instance is tied to a specific signal and a bucket name, which acts like a unique identifier for the data being stored. 

When you're done with an instance, the `dispose` method doesn't need to do anything special; the system takes care of cleaning up related cached information.

Here's a quick breakdown of what you can do with it:

*   **Initialization:** `waitForInit` ensures the storage is ready before you start working with it.
*   **Loading Data:** `readStateData` retrieves the saved data using the bucket name as a key.
*   **Saving Data:** `writeStateData` writes new data, again using the bucket name for organization.
*   **Cleanup:** `dispose` is a silent operation, relying on other utilities to handle memory management.


## Class PersistSignalUtils

This utility class helps manage how signal data is saved and retrieved, especially for strategies that need to remember their state. It keeps track of different storage options for each strategy and symbol combination, ensuring that each one gets its own dedicated space. 

You can customize how these signals are saved using custom storage options. If you want to change things up, you can register your own signal constructors.

The class handles reading and writing signal data, and it’s designed to be reliable even if things go wrong, ensuring signal state is protected.  It also lazily creates the storage instance only when it's first needed, which can improve performance. 

If you need to reset the stored signals, there's a `clear` method to wipe everything out. You might use this if your application's working directory changes. There are also built-in options to switch between a default file-based storage and a dummy storage for testing purposes.


## Class PersistSignalInstance

This class helps you reliably save and load signal data, like trading decisions, to a file. It's designed to be safe even if your program crashes unexpectedly. 

The class identifies each signal by its symbol, the name of the trading strategy, and the exchange it's associated with. It uses these details to store the signal data within a dedicated file.

To get started, you provide the symbol, strategy name, and exchange name when you create an instance. 

The `waitForInit` method sets up the underlying storage, ensuring everything's ready.

`readSignalData` retrieves the previously saved signal data using the symbol. 

And `writeSignalData` saves a new signal or clears the existing one, again using the symbol to identify it.


## Class PersistSessionUtils

This class helps manage how session data is saved and loaded, particularly useful for trading strategies that need to remember their state across runs. It keeps track of where session data is stored, like in a file on your computer, and provides a way to change how that storage works if you need to.

The core idea is that it creates a unique storage location for each strategy, exchange, and frame combination, making sure each one has its own dedicated place for its data. It remembers the storage it uses, so it doesn’t need to recreate it every time.

You can even switch between different ways of storing the session, like using a real file, a simple dummy that does nothing, or a custom storage solution you create. The class takes care of ensuring data is written and read safely.

It’s designed to make sure your session data survives crashes and restarts. If you’re dealing with a strategy that needs to persist information, this class handles the complexities of session persistence. You can clear the stored data, or dispose of specific session data when you no longer need it.

## Class PersistSessionInstance

This class provides a way to save and load session data related to your trading strategies and exchanges, persistently storing it to files. It acts as a middleman, ensuring data is written safely and reliably.

Each session uses a unique identifier derived from the strategy and exchange names, along with a frame name, to organize data within its storage.

The `waitForInit` method prepares the underlying storage system to be ready to receive data.

You can use `readSessionData` to retrieve previously saved session information. Similarly, `writeSessionData` allows you to save the current state of your session.

Finally, the `dispose` method doesn't do anything directly; memo cache cleanup is handled separately by a utility function to ensure proper resource management.

## Class PersistScheduleUtils

This class provides tools for reliably saving and loading scheduled trading signals, ensuring your strategies don't lose progress even if something goes wrong. It creates separate storage for each strategy, symbol, and exchange combination, so signals are kept organized.

You can customize how these signals are stored, or use the built-in options like file-based storage or a dummy version for testing. The class automatically handles reading and writing signals and ensures these operations are handled safely, even if the program crashes unexpectedly. 

It’s used internally by the ClientStrategy to manage those crucial scheduled signals.  If your trading environment changes, you can clear the stored data to start fresh.


## Class PersistScheduleInstance

This class helps you save and load schedule data, like when a trading strategy should send signals, to a file. It’s designed to be reliable even if your program crashes unexpectedly.

Each instance of this class is tied to a specific trading symbol, strategy name, and exchange. 

The `waitForInit` method makes sure the storage is ready before you try to read or write data. 

You can use `readScheduleData` to retrieve existing schedule information for a symbol, or `writeScheduleData` to update it – or to completely clear the schedule for that symbol. This makes it easy to manage your trading schedules persistently.


## Class PersistRiskUtils

This class provides tools for safely managing and storing information about active trading positions, especially when dealing with different risk profiles. It’s designed to be reliable and efficient, making sure your position data is handled correctly even if unexpected issues arise.

The framework automatically creates and manages storage instances for each risk profile, preventing conflicts and ensuring data consistency. You can even swap out the default storage mechanism to use your own custom adapters for different storage solutions.

To retrieve position data, use `readPositionData`, which handles lazy initialization to minimize overhead.  Similarly, `writePositionData` takes care of saving active position details.

For more flexibility, you can customize the way position data is persisted by using `usePersistRiskAdapter` to specify a different storage constructor. 

The `clear` method is useful for refreshing the storage if the environment changes, while `useJson` and `useDummy` let you quickly switch between file-based storage and a no-op mode for testing purposes.

## Class PersistRiskInstance

This component, `PersistRiskInstance`, is designed to reliably store and retrieve position data, acting as a bridge between your trading logic and persistent storage. It's built to ensure your data isn't lost even in unexpected situations.

Think of it as a safe place for your position information, guaranteeing that writes happen completely or not at all. 

It automatically handles the details of saving data to a file, using a consistent identifier to locate the position records. 

Here's a breakdown of what it does:

*   **Initialization:** It needs a little setup to be ready for writing data, which `waitForInit` handles.
*   **Reading:**  `readPositionData` retrieves your stored position data.
*   **Writing:** `writePositionData` updates the stored position data, ensuring the change is saved safely.

The `riskName` and `exchangeName` are used to identify the specific data being stored, and these details are part of the persistent storage itself. It utilizes a fixed storage key for consistency and efficient data access.

## Class PersistRecentUtils

This class, `PersistRecentUtils`, helps manage how recent trading signals are saved and retrieved, ensuring they're available even if things go wrong. It acts like a smart memory, remembering signals for specific trading setups (like a particular stock, strategy, exchange, and timeframe). 

It's designed to be efficient, creating and reusing these memory instances only when needed.

Here’s a breakdown of what it does:

*   **Customizable Storage:** You can tell it how to store signals, whether it's using files, a database, or even just pretending to store them (useful for testing).
*   **Automatic Management:** It handles saving and reading signals safely, even if the system crashes.
*   **Context-Aware:** It knows which signals belong to which trading setup, keeping things organized.
*   **Easy to Refresh:** If you need to clear its memory, you can easily do so.
*   **Switching Options:** It provides shortcuts to use a default file-based storage or a dummy (no-op) storage for testing.

Essentially, `PersistRecentUtils` takes care of the messy details of saving and retrieving recent signals, so your trading logic can focus on making decisions.

## Class PersistRecentInstance

This class helps you save and retrieve the most recent trading signal information for a specific trading setup. It’s designed to work with file storage, making the process reliable. 

Essentially, it creates a unique storage location based on the trading symbol, strategy name, exchange, and frame name – plus whether it's a backtest or live scenario. This means you can keep track of recent signals independently for different strategies and environments.

The class uses `waitForInit` to ensure the storage is ready before you try to read or write anything. 

You can then use `readRecentData` to get the most recent signal saved and `writeRecentData` to update it with new information.  The class handles the technical details of saving the data, so you can focus on your trading logic. 


## Class PersistPartialUtils

This class helps manage how trading strategies remember their progress, specifically profit and loss information. It makes sure this information is saved reliably, even if there are unexpected interruptions.

It uses a clever system to ensure each strategy’s data is stored correctly and separately, using a combination of symbol, strategy name, and exchange.  You can even customize how this data is stored, using different "adapters," like saving to files or using a placeholder.

If you need to change how the data is stored, you can easily switch between default methods or your own custom ones. To ensure data consistency, sometimes it's necessary to reset the stored data, particularly when the environment changes.

## Class PersistPartialInstance

This class, `PersistPartialInstance`, helps save and retrieve temporary data related to your trading strategies. Think of it as a safe place to store information that you might need later, even if something goes wrong. It automatically manages files to ensure your data isn't lost.

It's designed to work with a specific trading symbol, strategy, and exchange, keeping everything organized.

Internally, it uses a storage system that's protected against crashes, so you can be confident your data is secure.

Here's what it does:

*   It initializes the storage system to ensure it's ready.
*   `readPartialData` allows you to fetch temporary data associated with a specific signal.
*   `writePartialData` lets you save temporary data related to a particular signal.

## Class PersistNotificationUtils

This class provides tools to reliably save and load notification data, ensuring your trading strategies remember important events. It intelligently manages how these notifications are stored, creating a separate file for each one and using a special system to prevent data loss even if something goes wrong.

You can easily customize how the data is stored by providing your own storage methods. The class remembers which storage method is active, and only creates a new one when needed. 

The `getNotificationStorage` property lets you access the storage mechanism for a specific mode (like "backtest" or "live"). Functions like `readNotificationData` and `writeNotificationData` handle reading and saving the notification details. 

If you need to change how notifications are handled – perhaps switching to a different storage type – `usePersistNotificationAdapter` allows you to register custom storage constructors.  `clear` is available to force a refresh of the storage mechanism if the working directory changes. You can use `useJson` and `useDummy` for default file-based and dummy storage respectively.

## Class PersistNotificationInstance

This class helps manage persistent notification data, meaning it keeps track of notifications even when your application restarts. It’s designed to work with a file system, saving each notification as its own JSON file identified by a unique ID. This approach ensures that even if something unexpected happens, your data remains safe because it uses atomic writes.

The class is set up to work either in a test environment (indicated by the `backtest` property, which you can control when creating it) and provides a way to initialize the underlying storage, read all the notification data, and write new or updated notification data.  Essentially, it simplifies the process of reliably storing and retrieving notification information.


## Class PersistMemoryUtils

This class provides a way to manage how memory data is stored and retrieved, ensuring it's persistent even if the application crashes. It keeps track of storage instances, essentially containers for your memory data, based on a combination of a signal ID and a bucket name. You can customize how these storage instances are created, or use built-in options like a standard file-based system or a dummy system for testing.

The class handles reading, writing, and deleting memory entries, and it does this in a way that avoids conflicts. It also includes a method to clear the cache of storage instances, which is useful if your working directory changes. Finally, you can iterate through all existing memory entries, useful for rebuilding indexes. The data is typically stored in JSON files within a specific directory structure, which allows for crash-safe memory persistence.

## Class PersistMemoryInstance

This class provides a way to store and retrieve memory data to files, acting as a reliable data keeper for your trading strategies. It’s designed to work with the broader memory management system.

It manages data within a specific bucket, identified by a name, and linked to a signal ID.

Data is retrieved using an ID and can be removed, although this is a soft delete – the data still exists but is filtered out of lists. The `listMemoryData` method gives you access to these stored entries, but it skips any entries marked as deleted. 

Initializes the storage and handles writing, reading, and removing memory data. Because this is a file-based solution, it doesn't need to clean itself up – that's taken care of elsewhere.

## Class PersistMeasureUtils

This utility class helps manage cached data from external APIs, ensuring that your backtesting process is efficient and reliable. It acts as a central place to store and retrieve cached API responses, organizing them based on a combination of timestamp and the asset being analyzed.

The class uses a clever system where it creates a specific storage instance for each unique combination of timestamp and asset, avoiding unnecessary caching of the same data repeatedly. You have the flexibility to customize how this storage happens by providing your own custom storage solutions.

The class ensures data integrity with atomic operations and built-in safeguards to prevent data loss even if the system crashes. It automatically creates the necessary storage when you first try to read or write data to a specific combination, so you don't have to worry about upfront setup.

If you're dealing with a lot of API data and want to speed up your backtesting, this class is a powerful tool for keeping your system running smoothly. You can even swap out the default storage mechanisms for testing purposes or different environments. Clearing the cache is a simple process, especially when your working directory changes.

## Class PersistMeasureInstance

This class provides a way to store and retrieve measure data, acting as a persistent layer for your backtesting framework. It’s designed to be reliable, using a file-based system that ensures data is saved safely. 

The data can be marked as deleted, but the file isn't actually removed – instead, a flag indicates it's soft-deleted, allowing you to potentially recover it later if needed. 

You can retrieve specific measure entries by their key, write new entries, or remove existing ones.  When listing all the entries, it conveniently filters out those that have been marked as deleted. 

The `waitForInit` method ensures the storage is ready before you start working with it. The internal `_storage` handles the actual file operations, and the `bucket` property defines the storage location.


## Class PersistLogUtils

This class helps manage how log data is saved and retrieved, ensuring it's handled reliably. It keeps a single, global log instance available for quick access, creating it only when needed.

You can customize how logs are persisted by using adapters—essentially swapping out the underlying storage mechanism. 

The class handles writing new log entries, making sure no duplicates are added, and reads all existing logs. It's designed to be resilient to crashes, protecting your log data. 

You can change the logging implementation if you need to, for example to switch to a different storage format or to use a dummy logging implementation for testing. The `clear` function is important to call when the program's working directory changes.

## Class PersistLogInstance

This class helps you save trading logs to files, making sure your data is safe even if something goes wrong. It stores each log entry as a separate file, organized by a unique ID. 

When you read the logs, it scans through all these files to gather all the data. The system only adds new log entries; it won't replace any existing ones, preventing accidental data loss.  It's designed to be reliable, using techniques that protect against crashes during saving.

You can use `waitForInit` to make sure the storage is ready before you start adding data.  `readLogData` gets you all the stored log information and `writeLogData` adds new entries to the storage, making sure no entry is lost.


## Class PersistIntervalUtils

This component manages persistence for tracking which time intervals have already fired within your trading strategies. It helps avoid redundant actions by remembering if a signal has already been processed for a particular time period and market. Data is stored in files within a `./dump/data/interval/` directory.

You can customize how this persistence works by providing your own constructors for handling interval markers.

The `readIntervalData` and `writeIntervalData` functions handle reading and saving these markers, creating the necessary data structures as needed.  `removeIntervalData` allows you to 'soft-delete' markers if needed, which can be helpful for cleanup or testing.

The `listIntervalData` function provides a way to iterate over the markers for a specific time period.

If your working directory changes during a backtest, remember to clear the cached bucket instances.

Finally, you can easily switch between different persistence methods - using standard file storage, a JSON-based approach, or even a dummy implementation for testing purposes where persistence is not needed.

## Class PersistIntervalInstance

This class provides a way to save and load data related to specific time intervals, like trading strategies, using files on your system. It's designed to be reliable, ensuring data is written correctly even if something goes wrong during the process.

The data is stored within a designated "bucket," essentially a folder, and each interval's information is represented as a file. When you want to get rid of an interval's data, instead of completely deleting the file, it's marked as "removed" – this allows the system to essentially forget about it temporarily and potentially reactivate it later.

Here's a breakdown of what you can do:

*   **Initialization:** It sets up the underlying storage system to be ready.
*   **Reading Data:** You can retrieve the data associated with a specific time interval using a unique key. If the data doesn't exist or has been "removed," it will return nothing.
*   **Writing Data:** You can save data for a time interval, identified by its unique key.
*   **Soft Deletion:**  Instead of permanently deleting data, you can mark it as removed. This way the data still exists, but the system behaves as if it doesn’t.
*   **Listing Data:** You can view a list of all the active, non-removed time interval data within the bucket.



The class handles the details of reading and writing files, providing a simple interface for managing your time interval data.

## Class PersistCandleUtils

This class, PersistCandleUtils, helps manage a cache of historical candle data for trading strategies. It stores each candle as a separate file, making organization and retrieval straightforward. The system automatically checks if the cached data is complete and refreshes it when needed, ensuring you're working with the most accurate information.

It's designed to work with ClientExchange for efficiently caching and accessing candle data.

Here's a breakdown of how it functions:

*   **Customizable Cache:** You can swap out the way candles are cached by providing your own constructor for the cache instance. This gives you flexibility in how the data is stored and managed.
*   **Efficient Reads and Writes:** The system handles reading and writing candles in a smart way, initializing the cache instance only when it's first used.
*   **Easy Cache Refresh:**  If your working directory changes, simply call `clear()` to refresh the memoization cache.
*   **Built-in Options:** You can quickly switch between the default file-based cache, a dummy cache (for testing), or use a custom cache adapter.



The `readCandlesData` method retrieves the cached candle data within a specified time range. The `writeCandlesData` method saves new candle data to the cache.

## Class PersistCandleInstance

This class helps you reliably save and retrieve historical candle data for trading. It’s designed to store each candle as a separate file, making it easy to manage and access individual data points.

If a candle is missing when you try to read it, the system will treat it as a cache miss, prompting a fresh retrieval.  When writing data, any incomplete candles (those that haven't fully closed) and previously existing data are skipped, guaranteeing a clean and append-only cache.

Here’s a breakdown of what it offers:

*   **Persistence:** It uses file storage so your data isn't lost when the application restarts.
*   **Data Integrity:** Incomplete candles are ignored during writing to ensure only complete data is cached.
*   **Cache Management:**  Missing candles trigger a re-fetch, and invalid candles generate warnings.

The constructor needs the trading symbol, the candle interval (e.g., 1 minute, 1 hour), and the exchange name to organize the stored data.  It includes methods to initialize storage, read a range of candles, and write new candle data, all while maintaining data consistency.

## Class PersistBreakevenUtils

This class helps manage and store breakeven data for your trading strategies, ensuring it's saved and retrieved reliably. It handles the persistence behind the scenes, so you don't have to worry about file handling.

Think of it as a central hub for keeping track of breakeven points – it automatically reads and writes this data to files organized by symbol and strategy.  The system remembers which storage method (like a standard file-based approach or a dummy one for testing) to use, and you can even customize this if you need a special way to store the data.

It avoids creating unnecessary files and connections, only initializing storage when it's actually needed. If you switch where your project is located or want to change how the data is stored, you can easily refresh the system.  This utility aims to simplify the process of saving and loading breakeven data, allowing you to focus on your trading logic.

## Class PersistBreakevenInstance

This class helps you reliably save and retrieve breakeven data for your trading strategies. It's designed to work with a specific symbol, strategy name, and exchange, creating a dedicated storage space for that combination.

It handles the file storage behind the scenes, making sure your data is saved correctly and safely even if the program crashes unexpectedly. The storage is tied to a unique identifier for each signal, allowing you to track data for individual signals.

To get started, you provide the symbol, strategy name, and exchange name when creating an instance.

You can use `waitForInit` to ensure the storage is ready before attempting to read or write data.

`readBreakevenData` lets you retrieve existing breakeven data by specifying a signal ID and a timestamp.  `writeBreakevenData` allows you to save new or updated breakeven data associated with a signal.


## Class PersistBase

This class provides a foundation for storing and retrieving data to files, ensuring that changes are saved reliably and safely. It's designed to manage files related to a specific type of data, like trades or indicators, keeping them organized in a designated directory.

The class handles the details of creating and maintaining the directory where the data files are stored, and it automatically checks for and corrects any corrupted files. You don't have to worry about manual file handling; it takes care of writing updates to files in a secure way, preventing data loss.

It allows you to easily read, write, and check for the existence of data, and provides a way to list all the IDs of the data it manages. The order of IDs is sorted alphabetically. The initialization process only runs once to make sure the directory exists and the files are valid.

## Class PerformanceReportService

This service helps you keep track of how long different parts of your trading strategy take to execute. It listens for timing events and records them in a database, allowing you to identify bottlenecks and areas for optimization.

The `loggerService` property lets you send debugging information, while `track` is responsible for actually processing and logging the performance data.

To start collecting this data, use the `subscribe` method – it will connect the service to the performance event stream. Make sure to call the unsubscribe function returned by `subscribe` when you no longer need to collect the data, or use the `unsubscribe` method to do it for you. This prevents multiple subscriptions and ensures clean event handling.

## Class PerformanceMarkdownService

The PerformanceMarkdownService helps you keep track of how your trading strategies are performing. It listens for performance data, organizes it by strategy, and calculates key statistics like averages, minimums, maximums, and percentiles.

It automatically creates reports in markdown format, which includes analysis to help identify bottlenecks and areas for improvement. These reports are saved to your logs directory.

You can subscribe to receive performance updates and unsubscribe when you're finished. There are functions to retrieve data and statistics, generate reports, and even clear the stored data when needed. Essentially, it provides a comprehensive system for monitoring and reporting on the performance of your backtests. You can also specify which data columns to include in the reports.


## Class Performance

The Performance class helps you understand how your trading strategies are performing. It provides tools to analyze performance metrics and generate detailed reports. 

You can retrieve performance statistics for specific strategies and symbols, getting a breakdown of key metrics like duration, volatility, and percentiles to pinpoint potential problem areas.

The framework can also create easy-to-read markdown reports that summarize your strategy's performance, highlighting areas that might be slowing it down. These reports include information on how time is spent across different operations.

Finally, this class lets you save those performance reports directly to your file system, making it simple to track progress and share results. The reports are saved in a `dump/performance` folder by default.


## Class PartialUtils

This class helps you understand and analyze the partial profit and loss data generated during trading. It’s designed to provide easy access to summarized statistics and detailed reports about your trading performance.

You can retrieve aggregated statistics like total profit/loss counts for specific symbols and strategies. It also lets you generate markdown reports showcasing individual partial profit/loss events, including crucial details like the action taken (profit or loss), the symbol traded, the strategy used, the signal ID, the position held, the level of the trade, the price at the time, and the mode (backtest or live).

Finally, it can automatically save these reports as markdown files, organizing them by symbol and strategy name, making it simple to track and review your trading history. The reports include helpful summaries at the end to provide a quick overview of your performance.


## Class PartialReportService

The PartialReportService helps you keep track of when your trading strategies partially exit positions, whether that's due to profits or losses. It acts like a recorder, specifically designed to capture and log these partial exits.

It listens for signals indicating partial profit and loss events, carefully noting the price and level at which these exits occurred.

This information is then stored in a database, allowing you to analyze your strategy's behavior in more detail and see exactly how partial exits impact performance.

You can easily start and stop this monitoring process using the `subscribe` method, which guarantees you won’t accidentally subscribe multiple times. The `unsubscribe` method cleanly stops the recording if needed. The service utilizes a logger to output debugging information.

## Class PartialMarkdownService

The PartialMarkdownService is designed to create detailed reports about your trading performance, specifically focusing on profits and losses. It listens for these events as they happen and carefully organizes them by symbol and strategy. 

Think of it as a record-keeper for your trading activity. It gathers all the profit and loss information, summarizes it with statistics, and then formats this information into easy-to-read markdown tables. 

You can then save these reports directly to your hard drive, creating a permanent record of your trading history. The service is structured to keep each symbol and strategy’s data separate, ensuring clarity and organization. You can also clear old data to keep things tidy, either for a specific combination or everything at once.

## Class PartialGlobalService

This service acts as a central hub for managing partial profit and loss tracking within the trading system. It simplifies how strategies interact with the underlying connection layer by providing a single injection point and ensuring consistent logging. Think of it as a middleman that monitors and records all partial operations, like when a trade hits a profit or loss level, before passing those actions along to the connection service to be handled. 

It keeps track of things like profit and loss based on incoming data and signals, and can clear those records when a trade is closed.

Several validation services are also incorporated—for strategy, risk, exchange, and frame—to confirm configurations are correct. The `validate` property provides a way to confirm those configurations, remembering previous checks to avoid unnecessary repetition. 

The `loggerService` property allows centralized logging of operations related to partial profit and loss. The actual work, like creating and managing ClientPartial instances, is handled by the `partialConnectionService`.

## Class PartialConnectionService

This service manages the partial profit and loss tracking for trading signals. It’s designed to keep things organized and efficient by creating and storing individual tracking components for each signal.

Think of it as a smart factory for these tracking components, which are called `ClientPartial` instances. It keeps a record of these components, making sure you don't create unnecessary ones.

When a signal reaches a profit or loss milestone, the service handles the necessary calculations and notifications. When a signal is closed out, it cleans up its tracking component, preventing clutter and memory issues.

This component works closely with the overall trading strategy and uses a clever caching system to optimize performance, ensuring that everything runs smoothly and efficiently. It ensures that data is logged and events are triggered appropriately throughout the trading process.

## Class NotificationLiveAdapter

This class, `NotificationLiveAdapter`, acts as a central hub for sending notifications related to your trading strategies. It’s designed to be flexible, allowing you to easily change *how* those notifications are delivered – whether it's to memory, a persistent store, or even nowhere at all (for testing purposes).

Think of it as an adapter pattern in action: you can swap out the underlying notification mechanism without altering the rest of your code. It starts with a default in-memory storage, but offers other options like persisting notifications to disk or completely ignoring them.

It provides methods for handling various events like signals, partial profits/losses, strategy commits, and errors. Each of these calls simply passes the information on to whatever notification system you've currently configured.

You can change the notification backend using methods like `useDummy`, `useMemory`, `usePersist`, and `useNotificationAdapter`. `useNotificationAdapter` gives you the most control, letting you specify the exact class responsible for handling notifications.  `useDummy` is especially useful for testing, as it prevents notifications from actually being sent.  `clear` is a special method you'd use if your base directory for persistent storage changes during a backtest.

The `getInstance` property is a clever way to ensure that the notification utility instance is only created once and cached for efficiency.

## Class NotificationHelperService

This service helps manage and send out notifications about signals, particularly important information related to trading strategies. It's a behind-the-scenes component used by the framework to ensure everything is running smoothly.

The `validate` function checks the strategy, exchange, frame, risk, and action schemas, but it's clever about it – it only runs these checks once for each unique combination of strategy, exchange, and frame. This speeds things up by avoiding repetitive validation.

The `commitSignalNotify` function is how you trigger the actual notification. It gathers information, performs the necessary validations, and then broadcasts a notification to anyone who's listening, also saving this information for later review. Think of it as the system's way of announcing important signal events.

Several services are wired into this helper to validate different parts of the process.

## Class NotificationBacktestAdapter

This component provides a flexible way to handle notifications during backtesting. It acts as a bridge between your trading strategy and various notification systems, allowing you to easily switch between different notification methods without changing your core strategy code.

It uses a pattern where you can plug in different notification "backends" – like storing notifications in memory, persisting them to a file, or simply ignoring them (dummy mode). The default behavior is to store notifications in memory.

You can easily swap out the notification system using methods like `useDummy`, `useMemory`, and `usePersist`.  `usePersist` will save your notifications for later analysis or review. `useDummy` is helpful for testing or when you don't need notifications.

The `handle...` methods (like `handleSignal`, `handlePartialProfit`, etc.) are the entry points for your strategy to send notification events. These methods simply forward the information to the currently configured notification backend.  `getData` allows you to retrieve all notifications that have been stored, and `dispose` clears them.  The `clear` method ensures that a new notification handler is created if the working directory changes. This is particularly useful when running multiple strategies or when the base path changes during backtesting.

## Class NotificationAdapter

The NotificationAdapter helps manage and track notifications during both backtesting and live trading. It automatically receives and stores notification updates as they occur.

You can subscribe to specific notification types, like profit, loss, or error signals, and the adapter ensures you only subscribe once to avoid duplicates. 

It provides a straightforward way to retrieve all notifications, distinguishing between backtest and live data. When you're finished, you can easily clear out all stored notifications using the dispose function. This adapter simplifies notification handling so you can focus on your trading strategy.


## Class MemoryLiveAdapter

This `MemoryLiveAdapter` provides a way to store and manage data during live trading, offering flexibility in how that data is handled. It acts as a middleman, allowing you to easily switch between different storage methods without changing your core trading logic.

You can choose to store data in memory for speed, persistently to a file on your system for safekeeping across restarts, or even use a dummy adapter for testing purposes where you don't want any data saved. The adapter keeps track of data using memoization, meaning it reuses instances until they’re explicitly cleaned up.

The `disposeSignal` method is important – use it to clear out any old data associated with a signal when it's no longer needed. You can write, search, list, remove, and read data using provided methods, all while leveraging BM25 full-text search capabilities. If you need something beyond the built-in options, you can even plug in your own custom storage implementation. Don’t forget to call `clear` if your working directory changes during a strategy's run to ensure fresh instances are created.

## Class MemoryBacktestAdapter

This framework provides a flexible way to manage memory for backtesting trading strategies. Think of it as a container for storing and retrieving data related to your trading simulations. It’s designed to be adaptable, allowing you to choose different storage methods depending on your needs.

You can use it to store things like historical data, calculated indicators, or any other information your strategy needs to access. By default, it uses an in-memory storage – all data exists only while the program is running. However, you can easily switch to persistent storage that saves data to disk, or even a dummy adapter that simply discards any data written.

When you no longer need specific data, the `disposeSignal` function allows you to clear out those memory entries. You can search, list, add, remove, and read data within this framework. It also includes helpful methods like `useLocal`, `usePersist`, `useDummy`, and `useMemoryAdapter` to quickly switch between storage configurations and even plug in custom memory adapter implementations. If you change your working directory between strategy runs, remember to call `clear` to refresh the adapters.

## Class MemoryAdapter

The MemoryAdapter acts as a central manager for handling memory storage, whether you're running a backtest or a live trading simulation. It automatically handles cleanup to prevent issues with stale data.

You control memory usage through `enable` and `disable` functions; `enable` sets up the necessary subscriptions and `disable` cleans them up.

The `writeMemory` function lets you store data, while `searchMemory` allows you to find specific entries using a search query.  `listMemory` provides a way to view all the stored data, and `removeMemory` deletes individual entries. Finally, `readMemory` retrieves a single, specific entry.  The adapter intelligently directs these operations to either the backtest or live environment based on your configuration.

## Class MaxDrawdownUtils

This utility class helps you analyze and understand maximum drawdown events in your trading strategies. It provides easy ways to get summary statistics and generate reports about how much your strategies have lost at their worst points.

Think of it as a tool to look back and see where your strategies stumbled, helping you improve their resilience.

You can use it to:

*   Pull out key statistical data concerning max drawdowns for a specific trading setup (like a particular symbol, strategy, exchange and timeframe).
*   Create a readable markdown report detailing all the drawdown events that occurred.
*   Save those reports directly to a file so you can review them later or share them with others.

Essentially, this class provides convenient shortcuts for working with drawdown information, letting you focus on interpreting the results and refining your trading strategies.

## Class MaxDrawdownReportService

This service helps track and record maximum drawdown events during backtesting. It's designed to monitor for situations where your trading strategy experiences its largest decline from a peak.

The service listens for drawdown signals and saves them to a database in a format suitable for analysis. Each record includes details like the timestamp, symbol, strategy name, exchange, frame, and backtest information, along with signal-specific data such as position size, current price, and order parameters.

To start recording these drawdown events, you need to subscribe. This ensures that only one subscription exists to prevent duplicate data. The subscription also provides a way to stop the recording process later, which is done by unsubscribing. If you don’t subscribe, unsubscribing won't do anything.

## Class MaxDrawdownMarkdownService

This service is designed to automatically create and store reports detailing the maximum drawdown experienced during trading. It keeps track of drawdown information for each symbol, strategy, exchange, and timeframe combination.

You can tell the service to start listening for drawdown events, and it will begin collecting data. Conversely, you can tell it to stop listening and clear all accumulated data.

The service offers several ways to access and use this information:

*   You can request the raw data for a specific trading scenario.
*   You can generate a formatted markdown report showing the maximum drawdown.
*   You can generate the markdown report and directly save it to a file.

Finally, you have the option to clear the stored data, either for a specific scenario or for everything it’s tracking.

## Class MarkdownWriterAdapter

The MarkdownWriterAdapter helps manage how your backtest results are saved. It provides a flexible way to choose different storage methods, like saving each report as a separate file, combining them into a single JSONL file, or even suppressing the output entirely. It remembers which storage method is used for different types of reports (like backtest results versus live trading data) so you don't have to create them manually each time. 

You can easily change how reports are stored by using functions like `useMd`, `useJsonl`, or `useDummy`. If you need to switch the underlying storage mechanism, `useMarkdownAdapter` lets you provide your own implementation.  The `clear` function is useful for ensuring fresh storage when the working directory changes. The adapter ensures only one storage instance exists for each report type, ensuring consistent behavior.

## Class MarkdownUtils

MarkdownUtils helps you control the creation of markdown reports for different parts of your trading system, like backtests, live trading, and performance analysis.

You can turn on markdown reporting for specific areas of your system using the `enable` method.  When you do, it starts collecting data and will generate reports when you need them.  It's very important to remember to "unsubscribe" from these enabled services when you're finished, or your program might use more memory than it should.

If you just want to temporarily stop reporting for certain features, `disable` lets you do that without affecting the others.

Finally, `clear` gives you a way to wipe out the existing report data for a specific part of your system, allowing you to start fresh without stopping the reporting entirely.

## Class MarkdownFolderBase

This adapter is designed to create well-organized reports where each report is saved as its own individual markdown file. It's a great choice when you want easily readable reports that you can browse manually. 

It automatically creates the necessary directories to hold your reports, and you specify the file path and name through configuration options. 

Essentially, it doesn’t manage any streams; instead, it directly writes the markdown content to the specified file, making it straightforward to use. There's no special initialization needed for this adapter to function correctly. 

The core function is `dump`, which writes the content to a file, automatically generating the directory structure based on your provided path and filename.


## Class MarkdownFileBase

This framework component, `MarkdownFileBase`, helps you automatically create and manage markdown report files in a structured way. It writes your trading reports as JSONL (JSON Lines) entries to separate files, making them easy to process with standard JSON tools. Think of it as a way to centralize all your markdown reports and simplify analysis.

Each report type gets its own file, and the files are organized into a predictable directory structure. 

The system includes built-in safeguards like automatic directory creation, error handling, and a timeout to prevent write operations from hanging. You can filter reports by criteria like symbol, strategy name, exchange, frame, or signal ID.

To use it, you provide a name identifying the type of markdown report you’re generating. Then, the `dump` method lets you write content to the file, automatically including metadata for easy searching and filtering. The initialization process happens automatically, but you can explicitly call `waitForInit` if needed.

## Class MarkdownAdapter

The MarkdownAdapter helps you manage how your markdown files are stored, offering flexibility and efficiency. It allows you to easily switch between different storage methods without changing your core code.

You can choose to store markdown as separate files (the default), or combine them into a single JSONL file. 

The adapter also remembers your storage choices, so you don’t have to keep specifying them. This means you only need to configure your storage once.

For testing or quick experimentation, a dummy adapter is available which simply ignores any markdown data written to it. It's a safe way to prevent any actual file modifications. 

The `useMd()` and `useJsonl()` methods provide shortcuts to switch between the most common storage options.

## Class LookupUtils

The `LookupUtils` class acts as a central record of what's currently happening within your backtests and live trading sessions. Think of it as a log of active activities, like running simulations or live trades.

Whenever a backtest, live session, or a specific step within a strategy starts, it registers its presence with this system. Similarly, when something finishes, it’s removed from the record.

This system also plays a role in efficiency, deciding whether to pause briefly during certain operations based on whether there are other activities running concurrently.

You don’t create instances of `LookupUtils` – it's a singleton object accessible directly.

Here are the key functions it provides:

*   `addActivity`:  This adds a new activity to the ongoing record, useful when a simulation or trade begins.  If the same activity tries to be added again, it simply updates the existing record.
*   `removeActivity`: This removes an activity when it's finished, so the record stays accurate.  It's particularly important to use this in a "finally" block to ensure clean-up even if errors occur.
*   `listActivity`: This provides a snapshot of all the currently running activities. 

The `_lookupMap` property manages this collection of activities internally.

## Class LoggerService

The `LoggerService` helps standardize logging across your trading strategies and backtests. It acts as a central point for recording information, automatically adding helpful details like which strategy, exchange, or method is generating the log.

You can provide your own logger to customize how and where logs are sent, or the service will fall back to a basic "no operation" logger if you don’t specify one. 

The `log`, `debug`, `info`, and `warn` methods are your primary tools for recording messages, and they all handle adding context for you.  This simplifies keeping track of what's happening during your backtests. Finally, `setLogger` lets you plug in your preferred logging mechanism.

## Class LogAdapter

The `LogAdapter` is designed to provide flexible logging capabilities within your backtesting framework. It allows you to easily switch between different logging methods, like storing logs in memory, saving them to a file, or even disabling logging altogether. You can choose how your logs are handled by swapping out the underlying logging implementation.

It defaults to using an in-memory logger, but you can switch to persistent storage for saving logs to disk, a dummy logger to effectively silence logging, or a JSONL adapter for more detailed file output. To change how logs are handled, use methods like `usePersist`, `useMemory`, `useDummy`, or `useJsonl`.

The `clear` method is important to use when your working directory changes, which ensures that your log adapter refreshes and uses the new location. The adapter also provides standard logging levels like `log`, `debug`, `info`, and `warn` that you can use to categorize your log messages.

## Class LiveUtils

This class provides tools for managing live trading operations, simplifying access to core functionality and offering features like crash recovery and real-time progression. It's designed as a central point for interacting with live trading, making it easy to start, stop, and monitor trading activities.

You can run live trading for a symbol, either yielding results as they come or running in the background without directly processing them.  It allows you to retrieve information about the current state of a position, such as pending signals, total percentage closed, breakeven points, and entry prices.

You can adjust position parameters like stop-loss and take-profit levels, and even prematurely activate scheduled signals. The framework keeps track of position details, including profit/loss, drawdown, and other performance metrics.  Importantly, it offers methods to cancel or close active signals directly and view overall stats.


## Class LiveReportService

LiveReportService helps you track what's happening with your trading strategy in real-time. It listens for events like when a signal is idle, opened, active, or closed.

Think of it as a detailed logbook for your trading activity. Every tick event, along with all the relevant information, is recorded and saved to a database.

The service connects to the signal events through a subscriber, ensuring you won't accidentally log things multiple times. 

You can easily control when it's listening – subscribe to start receiving events, and unsubscribe to stop. If you're already subscribed, attempting to subscribe again won't cause problems.

## Class LiveMarkdownService

The LiveMarkdownService helps you automatically create detailed reports about your live trading activity. It keeps track of everything that happens during your trades – from the initial signal to when a position is closed.

This service listens for trading events, builds up a history of each trade, and then generates nicely formatted markdown tables summarizing the events and key statistics like win rate and average profit/loss.

You can request the accumulated data or a full report for specific trading strategies and symbols, and the service conveniently saves these reports to disk so you can review them later. It also lets you clear out the stored data if needed, either for a specific trading setup or completely.

The service relies on a logger and a special storage system to ensure each trading setup has its own isolated set of data. It also includes a way to easily subscribe and unsubscribe to receive live trading events.

## Class LiveLogicPublicService

This service is designed to handle live trading, making it easier to manage and coordinate everything involved. It builds upon a private service, automatically passing along important information like the strategy name and exchange being used.

Think of it as a central hub that handles the flow of data and actions in a live trading environment.

It's built to run continuously, constantly generating data related to strategy trades – these can be signals to open a position, signals to close one, or cancellations. If something goes wrong and the process crashes, it's designed to recover the necessary information from saved data, so trading can resume without losing progress.

The `run` method is the main entry point. You provide a symbol to trade, and it takes care of the rest, automatically including all the required context information. The process streams the results in a never-ending sequence of trade events.


## Class LiveLogicPrivateService

This service manages live trading operations, ensuring continuous monitoring and efficient handling of trading signals. It operates as an ongoing process, constantly checking for new signals and reacting to them.

The core of its operation is an infinite loop that repeatedly checks for updates. Each cycle captures the current time, processes signals, and then streams the results – specifically, when positions are opened or closed – as a continuous stream of data.

To make the process robust, it includes crash recovery, so if something goes wrong, the system can automatically restart and pick up where it left off. The service uses a memory-efficient approach, streaming data instead of holding large amounts of information in memory. It's designed to run indefinitely, providing a constant flow of trading data. To do this it utilizes injected dependencies, such as a logger, strategy core, and method context.

## Class LiveCommandService

The LiveCommandService helps you connect to and interact with the live trading environment. It acts as a central point for accessing various services needed for live trading, like validating strategies and exchanges, and managing risk.

Think of it as a convenient layer on top of the LiveLogicPublicService, designed to be easily integrated into your applications.

You can use it to start a live trading session for a specific symbol, providing information about the strategy and exchange you're using.  This service handles things like automatically recovering from crashes, so your trading can continue smoothly. It returns results continuously as trading events happen, letting you monitor and react in real-time.

## Class IntervalUtils

IntervalUtils helps manage how often your functions run within specific time intervals, ensuring they don't execute too frequently. It offers two ways to do this: in-memory, where the state is lost when the program restarts, and file-based, where the state is saved to a file so it persists across restarts. You access these capabilities through a single, easy-to-use object named `Interval`.

The `fn` property lets you wrap regular functions, ensuring they only run once per interval.  If a function returns `null`, it won't start a timer, and will retry on the next call.

The `file` property does the same thing but uses a file to store whether a function has already run. This means your state is saved even if your program restarts.

If you want to stop tracking a specific function, you can use `dispose`. The `clear` function removes all tracking data, while `resetCounter` resets the internal index used for file-based tracking, vital when the working directory changes.

## Class HighestProfitUtils

This class helps you analyze and understand the most profitable trades your strategies have made. Think of it as a reporting tool that gathers information about those peak performance moments.

It provides easy ways to get a summary of the best trades, create formatted markdown reports detailing those trades, or even save those reports directly to a file.

You can specifically request data and reports for a particular trading symbol, strategy, exchange and timeframe. There's also an option to focus on backtesting results. 

The class is set up so you don't need to create an instance of it – its methods are readily available.


## Class HighestProfitReportService

This service is designed to keep track of the most profitable trades. It listens for events indicating a new highest profit has been achieved and records this information in a structured format.

Think of it as a dedicated recorder for exceptional trading performance.

It receives data about each profitable trade, including details like the timestamp, symbol, strategy used, and specific price points involved (open, take profit, and stop loss). This information is then written to a database to allow for later analysis and reporting.

To start capturing these high-profit events, you need to subscribe to the service. Importantly, it only subscribes once – attempting to subscribe again just returns the original unsubscribe function. 

When you're finished, you can unsubscribe to stop the service from recording any further events.

## Class HighestProfitMarkdownService

This service is designed to create and save reports detailing the highest profit achieved in a trading scenario. It listens for incoming data about these profits, organizing them by symbol, strategy, exchange, and time frame. 

You can subscribe to receive these data points, but the subscription is managed carefully to prevent repeated subscriptions.  Unsubscribing completely clears all accumulated data.

The `tick` method processes each individual piece of incoming data, storing it appropriately.  You can request specific data or reports for particular combinations of symbol, strategy, exchange, and time frame. The `getReport` method creates formatted markdown reports, and the `dump` method saves these reports as markdown files to disk, naming them according to the trading scenario. Finally, you have the option to clear either specific storage buckets or all of them, essentially resetting the recorded data.

## Class HeatUtils

HeatUtils helps you easily create and export visualizations of your trading portfolio's performance. Think of it as a tool to quickly see how different assets are contributing to your strategy's overall results.

It gathers data from completed trades, automatically calculating key statistics like total profit, Sharpe ratio, and maximum drawdown for each symbol.

You can retrieve this data programmatically to use it in other tools, or generate a nicely formatted markdown report showing your portfolio's performance breakdown.

The reports can also be saved directly to a file on your computer, making it simple to share or keep a record of your strategy's performance. It's designed to be simple to use, acting as a central point to access these visualizations.


## Class HeatReportService

HeatReportService helps you track and analyze your trading performance by recording every closed trade. It focuses on signals that have resulted in a profit or loss.

The service listens for these closed signal events, and stores them in a database so you can later generate visualizations – like heatmaps – to understand patterns in your trading. 

It's designed to only record these 'closed' events, ignoring other signal actions. To ensure you’re not accidentally subscribing multiple times, it prevents duplicate connections.

You can subscribe to receive these events, and when you're done, you can unsubscribe to stop the data collection.

## Class HeatMarkdownService

This service helps you visualize and understand your trading performance through interactive heatmaps. It listens for signals from your trading strategies and gathers statistics about each trade, allowing you to see how different strategies and symbols are performing. 

The service organizes data based on the exchange, timeframe, and whether you're in backtest or live mode, ensuring that your data is neatly separated and manageable. It can generate detailed reports in Markdown format, including portfolio-wide metrics and breakdowns for individual symbols.

You can subscribe to receive updates in real-time and easily unsubscribe when you no longer need the data. The service handles potential errors gracefully and efficiently manages its storage to prevent performance issues. Clearing the stored data is possible, either for a specific configuration or completely, effectively resetting the heatmap.


## Class FrameValidationService

The FrameValidationService helps you keep track of and verify the configurations for different timeframes in your trading strategy. It acts like a central directory for your timeframe setups, ensuring they are correctly defined before you attempt to use them. 

Think of it as a safety check – before your backtest kit tries to work with a timeframe, this service makes sure it actually exists and is properly set up. 

It provides a few core functions: `addFrame` lets you register new timeframe configurations, `validate` checks if a timeframe exists, and `list` provides you with a complete overview of all the timeframe setups you’ve registered. It also uses a technique called memoization, which means it remembers previous validation results to speed things up. 

The service relies on a `loggerService` for logging and utilizes an internal `_frameMap` to store the frame configurations.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of the structures, or schemas, used within your trading framework. It’s like a central repository for defining how your data should be organized. 

This service uses a special registry to store these schemas in a way that helps prevent errors. 

You can add new schemas using the `register` method, update existing ones with `override`, and retrieve them using `get`, all identified by a unique name. Before adding a schema, a quick check ensures it has the basic structure it needs thanks to the `validateShallow` feature.


## Class FrameCoreService

FrameCoreService manages the core workings of timeframes within the backtesting environment. It acts as a central hub for generating and validating timeframes needed for simulations.

Think of it as the engine that provides the sequence of dates for your backtest to run through. It relies on other services to connect to data sources and ensure the timeframes are correct. 

The `getTimeframe` function is the key here – you'll use it to get the specific dates you need for a particular symbol and timeframe name. It returns a promise that resolves to an array of dates.


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different trading frames within the backtest environment. It intelligently routes requests to the correct frame implementation based on the currently active context. 

To optimize performance, it remembers (caches) previously created frame instances, so it doesn't have to recreate them every time.

It handles the timeframe constraints for backtesting, allowing you to specify the start and end dates for your analysis. When running in live mode, there are no frame constraints, so the frame name will be an empty string.

The service relies on other components like the logger service, frame schema service, and method context service to function effectively. 

You can use the `getFrame` method to retrieve a frame, and `getTimeframe` to get the specific start and end dates used for backtesting a particular symbol.

## Class ExchangeValidationService

The ExchangeValidationService helps you keep track of your trading exchanges and make sure they're properly set up. Think of it as a central manager for all your exchange configurations. 

It lets you register new exchanges, so you have a clear list of what’s available.

Before you start any trading operations, you can use it to quickly check if an exchange is valid and ready to go. 

To make things efficient, the service remembers previous validation results, avoiding unnecessary checks. 

If you need to see a full inventory of your registered exchanges, you can easily request a listing.

## Class ExchangeUtils

The ExchangeUtils class provides helpful tools for interacting with different cryptocurrency exchanges. It acts as a central, readily available resource for common exchange-related tasks.

It handles getting historical candle data, calculating average prices, and retrieving the most recent closing price. You can also use it to format trade quantities and prices to match the specific rules of each exchange. 

Need the order book or aggregated trade data for a specific trading pair?  ExchangeUtils can fetch that too.  And if you need raw candle data with customized date ranges and limits, it provides a flexible way to retrieve it, ensuring consistency in how time is handled to avoid potential biases. Essentially, it simplifies working with various exchanges and ensures your code remains compatible over time.

## Class ExchangeSchemaService

The ExchangeSchemaService helps you keep track of information about different cryptocurrency exchanges in a structured and reliable way. 

It uses a specialized system to store these exchange details, ensuring type safety and preventing errors. 

You can add new exchanges using `addExchange()` and easily find them again by their name using `get()`. 

Before adding a new exchange, the service performs a quick check (`validateShallow`) to make sure it has all the necessary details in the correct format. 

If you need to update an existing exchange's information, you can use `override()` to make targeted changes.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for interacting with exchanges, ensuring that every operation is aware of the current trading context like the symbol being traded and the specific time period. It combines connection details with execution parameters to properly handle data retrieval. 

This service offers a suite of functions to retrieve market data: you can request historical candles, get future candles (primarily for backtesting), calculate average prices, and fetch the closing price for a given time interval. It also includes methods for formatting prices and quantities, retrieving the order book, and accessing aggregated trade data. 

The `validate` method checks the exchange configuration, making sure things are set up correctly, and avoids repeating these checks unnecessarily. The `getRawCandles` method provides a lot of flexibility for fetching historical data, allowing you to specify start and end dates alongside the usual limits. Essentially, it's the go-to place for getting all the market data you need within the Backtest-Kit framework.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently routes your requests – like fetching candles or order book data – to the correct exchange based on the current context. To avoid repeatedly creating connections, it cleverly caches these connections for improved performance.

Essentially, this service simplifies working with various exchanges by handling the complexities of connecting and communicating with each one.

Here's a breakdown of its key capabilities:

*   **Automatic Exchange Selection:** It automatically figures out which exchange to use, based on the current trading context.
*   **Cached Connections:** It remembers the connections to exchanges, so it doesn’t have to re-establish them every time.
*   **Comprehensive Exchange Functionality:** It provides a full set of functions to access and manipulate data from the connected exchange.
*   **Convenient Data Retrieval:** It offers methods for getting candles (historical price data), the next batch of candles based on time, average price, order book information, aggregated trades, and raw candle data.
*   **Formatting Assistance:** It helps you correctly format prices and quantities to comply with the specific rules of each exchange.



You can think of it as a universal adapter that allows your backtesting or trading system to communicate seamlessly with different exchanges.

## Class DumpAdapter

The DumpAdapter helps you save data generated during your backtesting process, providing different ways to store it. Think of it as a flexible system for collecting information like messages, records, and tables. It automatically creates a unique storage space for each signal and bucket, keeping things organized.

You can choose where this data is stored: by default, it creates markdown files, but it also supports storing the data in memory (for quick access) or discarding it entirely (useful for testing). You can even create your own custom storage solutions.

Before you start dumping data, you need to activate the adapter, and you can deactivate it when you're finished. The `clear` function resets the adapter's internal cache, which is helpful when your working directory changes. It's designed to be efficient, preventing unnecessary buildup of data in memory.

## Class CronUtils

This utility class helps schedule tasks within your backtesting framework, particularly when you're running multiple tests in parallel. It makes sure that the same scheduled event only runs once, even if multiple tests try to execute it simultaneously.

Think of it as a coordinator that prevents multiple tests from stepping on each other's toes when dealing with time-based events.

Here’s a breakdown of how it works:

**Registration and Management:**

You can register tasks to run at specific times or intervals. If you register the same task multiple times, it just updates the existing one—old tasks will continue to run until they’re finished.

**Handling Parallel Execution:**

When multiple tests are running at the same time, this class ensures that only one instance of a task is executed at a given moment. It uses promises to coordinate the execution and prevent conflicts.

**Clearing Marks:**

You can clear the flags that mark tasks as "fired," allowing them to be executed again later. This is useful if you want to re-run a test or a specific part of it.

**Overall Purpose:**

It's designed to synchronize periodic tasks across different parallel backtests, offering a single point of control to avoid conflicts and ensure predictable behavior. The class is a singleton, meaning there's only one instance of it, making it easy to access and manage. This simplifies the coordination of your backtesting process.


## Class ConstantUtils

This class provides a set of pre-calculated values designed to help manage your take-profit and stop-loss levels, using a method inspired by the Kelly Criterion and incorporating a way to gradually reduce risk. These values represent percentages of the total distance between your initial entry point and your ultimate profit or loss targets.

Think of it like this: if your goal is to make a 10% profit, these levels tell you at what points you should take partial profits. For example, TP_LEVEL1 triggers at 30% of the way to that 10% target, giving you a 3% profit. Similarly, SL_LEVELS are set to provide early warnings or final exits in case the trade moves against you. These levels are meant to help you lock in gains and limit losses systematically.


## Class ConfigValidationService

The ConfigValidationService helps ensure your trading setup is mathematically sound and capable of making a profit. It’s like a safety net, checking your configuration parameters to catch potential errors before they lead to losses.

This service scrutinizes your settings, making sure percentages like slippage and fees are non-negative, and that your TakeProfit distance is sufficient to cover those costs. It also verifies that ranges make sense – for instance, that your StopLoss is set appropriately – and confirms time-related values are positive integers. Finally, it checks parameters related to how candles are fetched and processed, confirming they are within reasonable limits to avoid issues. 

Essentially, it's designed to prevent configurations that would lead to unprofitable trading. You don't directly interact with this class; it runs automatically to keep your trading environment healthy.

## Class ColumnValidationService

This service helps ensure your column configurations are set up correctly. It checks that each column definition has all the necessary pieces – a key, a label, a format, and a visibility setting.

It also verifies that those keys are all unique, and that the format and visibility settings are actually functions that can be used. Basically, it's a safety net to prevent errors and inconsistencies in how your columns are defined. 

The `validate` function performs these checks across all your column configurations.

## Class ClientSizing

The ClientSizing class helps determine how much of an asset to trade based on various strategies and rules. It’s designed to be flexible, offering different sizing methods like fixed percentages, Kelly criterion, and using Average True Range (ATR).

You can set limits on the maximum and minimum position sizes, as well as restrict the percentage of your capital that can be used for a single trade.

The `calculate` method is the core – it takes input parameters and returns the calculated position size, taking all your defined rules into account. This class ensures your trading positions are consistent with your overall strategy.


## Class ClientRisk

ClientRisk helps manage the risk of your trading strategies, ensuring they don't exceed predefined limits. It’s designed to work at the portfolio level, looking at the combined effect of multiple strategies.

It keeps track of all open positions across different strategies and provides a way to define custom validation rules. These rules check signals before they’re executed, preventing actions that might violate your risk parameters.

The `checkSignal` function assesses if a signal is acceptable based on these rules, and it can execute custom validations if configured. A more secure `checkSignalAndReserve` function not only validates signals but also temporarily secures a spot in the position tracking, preventing race conditions when multiple strategies are working concurrently.

When a signal is opened, `addSignal` registers it; and when it's closed, `removeSignal` removes it, maintaining an accurate record of active positions. This component is important for safe and controlled trading operations. Because it works with `activePositions`, it provides important data to risk assessment process.

## Class ClientFrame

The `ClientFrame` class is responsible for creating the timeline of data used during backtesting. Think of it as the engine that builds the sequence of timestamps your trading strategy will evaluate. 

It avoids unnecessary work by storing previously generated timeframes, a technique called singleshot caching. You can adjust how far apart these timestamps are – from one minute to one day intervals.  

Additionally, the `ClientFrame` can be set up to run checks or record information during timeframe creation. This class works closely with the backtest logic to ensure accurate iteration over historical data.

Its main function is exposed through `getTimeframe`, which returns a promise resolving to an array of dates representing the backtest timeframe for a specific asset. This function is memoized, meaning it only calculates the timeframe once and reuses the result.


## Class ClientExchange

This component handles fetching data from an exchange, acting as a bridge between your backtesting system and the actual market data. It offers several key functionalities, including retrieving historical and future candles (essential for backtesting), calculating the Volume Weighted Average Price (VWAP) to understand average trading prices, and formatting price and quantity data according to exchange-specific rules. It prioritizes efficiency by using prototype functions and is designed to prevent look-ahead bias in its data retrieval methods, ensuring your backtest results are reliable.

Here's a breakdown of what it can do:

*   **Candle Data:** It can fetch historical candles going back in time, or future candles ahead of the current time—crucial for simulating trading scenarios.
*   **VWAP Calculation:** It determines the VWAP, which represents the average price a security has traded at throughout the day, based on recent trading activity.
*   **Data Formatting:** It formats both prices and quantities to match the precise rules of the specific exchange you're using.
*   **Order Book and Trades:** It allows you to access order book information and aggregated trade data to understand market depth and trading volume.
*   **Flexible Data Retrieval:** The `getRawCandles` method gives you a lot of control, letting you specify start and end dates or limits for your data requests, all while ensuring proper time alignment and bias prevention.

Essentially, this component provides a robust and reliable way to access and prepare exchange data for your backtesting framework.

## Class ClientAction

The `ClientAction` class is a central component for managing and executing custom logic within your trading strategies. It essentially acts as a bridge between the core backtest-kit framework and your own specialized code, handling the lifecycle and routing of events to your action handlers. 

Think of it as a manager that sets up your custom functions (action handlers), ensures they're initialized and cleaned up properly, and then directs different types of signals – like trade confirmations, profit targets, or risk alerts – to the right functions within those handlers. These handlers are where you'll integrate things like state management, logging, notifications, or analytics.

The `waitForInit` and `dispose` methods use a 'singleshot' approach, guaranteeing that your handler is initialized and cleaned up only once. Several methods, such as `signal`, `signalLive`, and `signalBacktest`, act as gateways for passing different types of signals to your handlers, differentiated by whether they come from live trading or backtesting environments.  The `signalSync` method is a special gate for controlling positions using limit orders.

## Class CacheUtils

CacheUtils helps you speed up your code by automatically remembering and reusing results from functions. It's like a shortcut that avoids recalculating things you've already figured out.

Think of it as a helper that wraps your functions, letting you control how often the cached results are updated based on time intervals, like when new candle data comes in.

There's a special version, `file`, that does the same thing but saves the cached results to disk, so they're available even if your program restarts.  This is handy for larger calculations.

If you want to completely start over with caching for a particular function, you can "dispose" of it, which clears everything. The `clear` and `resetCounter` functions are useful when your program's working directory changes, making sure caching starts fresh.

It’s designed to be easily used because there’s only one instance of it throughout your project.

## Class BrokerBase

This class, `BrokerBase`, provides a foundation for connecting your trading strategies to real-world exchanges. Think of it as a template you customize to communicate with a specific broker like Binance, Coinbase, or Interactive Brokers. It handles the complex interactions with the exchange, letting your strategy focus on making trading decisions.

You don't have to write a lot of code from scratch! The `BrokerBase` class comes with default behavior for most actions, like logging events. You only need to override the methods that are specific to your chosen exchange's functionality – for instance, placing orders, setting stop-loss levels, or sending trade notifications.

Here's how it works:

1.  **Initialization:** The `waitForInit()` method is where you'll handle things like connecting to the exchange and logging in.
2.  **Events:** The methods like `onSignalOpenCommit`, `onSignalCloseCommit`, and others are triggered when your strategy needs to take action, such as opening or closing a position. Inside these methods, you'll put the code to actually execute those actions on the exchange.
3.  **Logging:** Everything is logged, giving you a clear record of what’s happening and making debugging easier.

Essentially, `BrokerBase` simplifies the process of integrating your trading strategy with a live exchange, by providing the groundwork and handling the common tasks, so you can focus on the core logic of your trading bot.

## Class BrokerAdapter

The `BrokerAdapter` acts as a middleman between your trading logic and the actual broker, providing a layer of control and safety. Think of it as a gatekeeper for any actions that affect your account, like opening or closing positions, or adjusting stop-loss orders.  It ensures that these actions happen correctly and consistently.

During testing (backtest mode), these actions are bypassed, which is useful for simulating trades without real money.  When you're actually trading live, these actions are passed on to your connected broker.

You need to register your broker with the `useBrokerAdapter` method *before* you start trading.  Then, you can `enable` the adapter to begin routing signals to your broker. When you're done, `disable` the adapter to stop.  The `clear` method is handy when your testing environment changes, forcing a re-initialization of the connection.

The `commit*` methods (like `commitSignalOpen`, `commitPartialProfit`, etc.) are the core functionality, ensuring that each operation is validated before being sent to the broker. They provide a chance to intervene if something goes wrong, preventing unintended account changes.  If any of these `commit*` calls fail, the intended action is cancelled.

## Class BreakevenUtils

The BreakevenUtils class helps you analyze and report on breakeven events within your trading system. It acts as a central place to gather and present information about how your strategies are performing against breakeven points.

Think of it as a tool for pulling together data about when your strategies hit breakeven, calculating some key statistics, and creating readable reports.

You can retrieve summarized statistical data, such as the total number of breakeven events, related to a specific trading symbol and strategy.

The class can also generate detailed markdown reports, presenting a table of all breakeven events, including timestamps, prices, and positions. This is useful for visually inspecting and understanding your strategy’s behavior.

Finally, you can easily export these reports as markdown files, giving you a convenient way to archive and share your breakeven analysis. The filename will be automatically generated based on the symbol and strategy name.

## Class BreakevenReportService

The BreakevenReportService helps you keep track of when your trading signals reach their breakeven point. 

It acts as a listener, constantly checking for these breakeven events and recording them. 

Each recorded event includes all the details of the signal that achieved breakeven.

This information is then stored in a database, allowing you to analyze and monitor your trading performance over time. 

To use it, you'll subscribe to receive breakeven events and then unsubscribe when you no longer need it. The subscription system prevents you from accidentally subscribing multiple times.

## Class BreakevenMarkdownService

The BreakevenMarkdownService helps you automatically generate and save reports detailing when your trading strategies have hit breakeven points. It listens for these "breakeven" events and keeps track of them for each symbol and strategy you're using. 

It creates nicely formatted markdown tables that summarize these events, along with overall statistics about the number of breakeven events. 

These reports are then saved as files on your computer, organized by symbol, strategy, exchange, frame, and whether it's a backtest.

You can subscribe to receive these events and then use the service to retrieve statistics, generate the report as a string, or save it directly to a file.  There's also a function to clear out all the accumulated data if you need to start fresh. It uses specialized storage to keep each symbol-strategy combination's data separate.

## Class BreakevenGlobalService

The BreakevenGlobalService acts as a central hub for managing breakeven calculations within the system. It's designed to be a single point of access for the ClientStrategy, making it easy to manage dependencies. This service primarily delegates its work to the BreakevenConnectionService, but it also provides a valuable layer of centralized logging, recording all breakeven-related actions.

Several services, including validation and schema retrieval, are injected into this service to ensure the strategy and associated configurations are valid.

The `validate` function checks the strategy and risk configurations, avoiding repetitive checks for commonly used combinations.

The `check` function determines whether a breakeven trigger should occur, logging the action before handing it off to the connection service.  Finally, `clear` resets the breakeven state when a signal closes, also with logging and delegation to the connection service.

## Class BreakevenConnectionService

The BreakevenConnectionService helps track and manage breakeven points for trading signals. It acts like a central hub, creating and storing information about each signal's breakeven status.

Essentially, it keeps track of breakeven calculations for each signal, reusing those calculations whenever possible to save resources.

Here’s how it works:

*   It creates a unique record for each trading signal, storing the breakeven details.
*   When you need to check or clear a breakeven point, it handles the work by delegating to a specialized component.
*   It automatically cleans up these records when a signal is no longer active, preventing unnecessary clutter.

It’s integrated into the overall trading system to provide consistent breakeven management. It also keeps track of events related to breakeven changes.

## Class BacktestUtils

The `BacktestUtils` class provides helpful tools for running and analyzing backtests within the trading framework. It's designed to be easily accessible and simplifies common backtesting tasks.

Think of it as a central hub for running simulations. You can kick off a backtest for a specific trading symbol and strategy using the `run` or `background` methods, with the `background` option being great for tests you just want to run without immediate results.  

Need to peek at what's happening during a backtest?  Methods like `getPendingSignal`, `getTotalPercentClosed`, and `getPositionPnlCost` give you insights into the state of a position. There are also utilities to determine if signals exist (`hasNoPendingSignal`, `hasNoScheduledSignal`) and check if the breakeven point has been achieved.

You can also query details about a position like its entry prices (`getPositionLevels`), partial close events (`getPositionPartials`), or how much is invested (`getPositionInvestedCost`).

If you're looking to modify a backtest in flight, `commitClosePending` and similar functions allow closing or adjusting signals. `commitAverageBuy` lets you add entries to simulate DCA strategies. Lastly, `list` method enables listing all active backtest instances.


## Class BacktestReportService

This service helps you keep a detailed record of what's happening during your backtests. It specifically tracks the lifecycle of trading signals – when they're waiting, when they're open, active, and closed.

Essentially, it listens for events happening within your backtest and saves all the important information about those events into a database. This is invaluable for understanding how your strategy performed and for debugging any issues.

You can easily set it up to start listening, and when you're done, there's a simple way to stop it from collecting data. It makes sure you don't accidentally subscribe multiple times, which could cause problems.

The service utilizes a logger for outputting debugging information and a tick processor to handle and record all types of events. The `subscribe` property gives you the ability to begin monitoring and returns a function for unsubscribing. Lastly, `unsubscribe` is used to stop monitoring signals.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save detailed reports about your backtesting results. It listens for incoming market data (ticks) and focuses on signals that have already closed, keeping track of information about each one.

It uses a special storage system that keeps data separate for each symbol, strategy, exchange, timeframe, and backtest run, ensuring your data stays organized. 

You can use it to:

*   Get overall statistics for a specific strategy and symbol.
*   Generate a formatted markdown report that shows details of all the closed signals.
*   Save these reports as files on your computer, organized by strategy.

The service also provides ways to clear old data from storage and to subscribe to and unsubscribe from market data events. This allows you to control when and how often the service processes information.

## Class BacktestLogicPublicService

This service helps manage and run backtests, simplifying the process by automatically handling important context information. It builds upon a private backtest logic service and incorporates context management to streamline execution. 

You don't need to manually pass strategy names, exchange names, or frame names to functions like getting candles or signals; the service handles that for you.

Here's a breakdown of key parts:

*   **Logger Service:** Provides access to context and execution information, and also allows you to set up logging.
*   **Backtest Logic Private Service:** The core service responsible for the actual backtesting logic.
*   **Time Meta Service:** Handles time-related data for the backtest.
*   **Frame Schema Service:** Defines the structure and organization of data frames used in the backtest.
*   **Exchange Connection Service:** Manages connections to the exchanges used for data and order execution.
*   **`run` method:** This is the main method to start a backtest for a specific symbol. It sends signals—like orders opened, closed, or cancelled—as a stream, making it easy to process results step-by-step. The context information is automatically included in each step.

## Class BacktestLogicPrivateService

The BacktestLogicPrivateService manages the overall process of running a backtest. It works by first getting the timeframes from a frame service, then stepping through each timeframe. 

When a trading signal appears (like an order to buy or sell), the service fetches the necessary historical price data (candles) and then executes the backtest logic to simulate the trade.

The service intelligently skips timeframes that don’t involve active trades, optimizing for efficiency. As trades are completed, the results (whether successful or cancelled) are streamed out, one at a time, instead of building a large list in memory. This makes it suitable for backtests involving a significant amount of data.

You can also halt the backtest prematurely if needed.

Here's a breakdown of the key components it uses:

*   **loggerService:** Handles logging and context.
*   **strategyCoreService:** Executes the trading strategy logic.
*   **exchangeCoreService:** Interacts with the exchange data.
*   **frameCoreService:** Provides the timeframes for the backtest.
*   **methodContextService:** Manages method context.
*   **actionCoreService:** Handles actions related to trades.

The `run` method is the main entry point; you pass it a symbol (like "BTCUSDT") and it returns a stream of results describing what happened during the backtest.


## Class BacktestCommandService

BacktestCommandService acts as a central point for running backtests within the system, making it easy to integrate into various parts of the application. It's essentially a helper that provides access to the core backtesting logic. 

It bundles together several supporting services like validation and logging to streamline the backtesting process.

To kick off a backtest, you’ll use the `run` method, which needs the symbol you want to backtest and some context information – namely the names of the strategy, exchange, and frame you're using. This method returns a series of results indicating how the strategy performed on each tick, whether it opened, closed, or cancelled positions.


## Class ActionValidationService

The ActionValidationService helps you keep track of and verify your action handlers – those pieces of code that respond to specific events or commands in your system. Think of it as a central control point to make sure everything is set up correctly before your application runs.

You can add new action handlers using `addAction`, telling the service about their configurations. To be safe, use `validate` before using an action handler to confirm it's properly registered. This prevents unexpected errors. 

For efficiency, the service remembers the results of previous validations, a technique called memoization, so it doesn't have to re-check things unnecessarily.  If you need a complete overview, `list` provides a summary of all registered action handlers. 

Essentially, it's there to organize your action handlers and prevent problems due to missing or incorrect configurations.


## Class ActionSchemaService

This service keeps track of and manages the blueprints for actions within your trading system. It ensures that these blueprints, called action schemas, are well-formed and consistent, and that they only contain allowed methods. 

Think of it as a librarian for action schemas – it registers them, checks them for errors, and provides them when needed. It uses a special system to guarantee type safety.

It allows you to:

*   Add new action schemas.
*   Make sure the schemas are structured correctly.
*   Update existing schemas with just the changes you need.
*   Retrieve a full, existing action schema.

The service relies on a logger for tracking activity and has an internal registry to store the schemas safely. This helps maintain the integrity and reliability of your actions.

## Class ActionProxy

The `ActionProxy` acts as a safety net for your custom trading logic within the backtest framework. It ensures that any errors occurring in your code don't crash the entire system, instead, these errors are logged and handled gracefully. Think of it as a wrapper around your code that catches potential problems.

It’s designed to handle a wide range of events that happen during trading, including initialization (`init`), signal generation (`signal`, `signalLive`, `signalBacktest`), and various profit/loss events (`breakevenAvailable`, `partialProfitAvailable`, `partialLossAvailable`).  It also handles scheduled pings (`pingScheduled`, `pingActive`, `pingIdle`), and risk rejections (`riskRejection`).

Here's a breakdown of how it works:

*   **Error Handling:** Each method automatically wraps your code in `try...catch` blocks. This means if something goes wrong, it's caught, logged, and the system keeps running.
*   **Partial Implementations:** If you don't provide a particular method in your trading logic, `ActionProxy` gracefully handles this by simply returning `null`.
*   **Factory Pattern:**  You create `ActionProxy` instances using the `fromInstance` method, which helps maintain a controlled way of wrapping your code.
*   **Sync Handling:** Notably, the `signalSync` method *doesn’t* use the error-catching `try...catch` block.  Errors here are intended to be directly raised.

Essentially, `ActionProxy` allows you to build and test trading strategies with confidence, knowing that unexpected errors won’t derail the whole process.

## Class ActionCoreService

The ActionCoreService acts as a central manager for handling actions within your trading strategies. It's like a conductor, orchestrating the execution of actions defined in your strategy schemas.

It automatically retrieves the list of actions from your strategy configurations and then invokes the appropriate handlers for each. This service is a core component, used both internally within the backtest framework and exposed as part of the public API.

Here's a breakdown of its key functions:

*   **Validation:** It meticulously validates the strategy's context, including the strategy name, exchange, and frame, ensuring everything is set up correctly. It also checks the validity of risks and actions defined in the strategy schema.  This process is optimized – it remembers previous validations to avoid unnecessary repetition.
*   **Initialization:**  Before a strategy runs, `initFn` initializes each action, loading any necessary state from persistent storage.
*   **Signal Routing:** It’s responsible for distributing signals (like price updates) to the appropriate actions, differentiating between backtest, live trading, and other scenarios (`signal`, `signalLive`, `signalBacktest`).
*   **Event Handling:** It routes various events, like breakeven opportunities, partial profit/loss triggers, and scheduled pings, to the relevant actions (`breakevenAvailable`, `partialProfitAvailable`, etc.).
*   **Risk Management:** It handles risk rejection events, ensuring that a signal is valid before it’s executed.
*   **Synchronization:** The `signalSync` function coordinates actions to ensure positions are opened or closed consistently across all actions.
*   **Cleanup:** Finally, `dispose` cleans up resources after a strategy completes its execution, and `clear` allows you to clear action data, either for a specific action or globally.



Essentially, this service simplifies strategy execution by managing the complexities of action dispatching and validation.

## Class ActionConnectionService

The ActionConnectionService acts as a central hub for directing different types of events – like signals, breakeven updates, and scheduled pings – to the correct processing logic within your trading strategy. It uses a system of routing, where the `actionName` specifies which particular piece of code should handle the event.

To improve efficiency, it intelligently caches these processing routines, meaning it only creates them once and reuses them for subsequent events with the same strategy, exchange, and frame. This caching system prevents redundant work and boosts performance.

The service relies on other components like a logger and action schema service to function correctly. You can clear the cache manually if needed. Essentially, it streamlines the flow of events to ensure they're handled correctly and efficiently within your backtesting or live trading environment.

## Class ActionBase

This class, `ActionBase`, is designed to help you create custom actions that respond to events in your trading strategy. Think of it as a foundation you build upon to extend the core functionality of the backtest-kit. It handles the repetitive work of logging and ensures your custom logic gets triggered at the right times.

When you extend `ActionBase`, you'll get pre-built logging for key events. You can then override specific methods like `signal`, `signalLive`, or `dispose` to implement your own logic, like sending notifications via Telegram, updating a database, or performing risk management checks. 

The framework provides signals for various situations: signal generation, breakeven hits, partial profit milestones, and more. You only need to implement the methods that are relevant to your particular actions.

Essentially, `ActionBase` simplifies building custom trading logic by managing the boilerplate and ensuring your code is called at the right points during a trading strategy's lifecycle, making it easier to focus on your specific logic. You'll be given the strategy name, frame name, and action name during construction, so you have context about where the code is being executed. Finally, you can implement `init` and `dispose` methods for setup and cleanup.

