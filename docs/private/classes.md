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

The WalkerValidationService helps you keep track of and make sure your parameter sweep configurations, which we call "walkers," are set up correctly. It's like a central place to register your walkers, define the ranges they’ll explore during optimization or hyperparameter tuning, and verify they exist before you try to use them. 

This service also remembers whether a walker is valid to avoid unnecessary checks, making things faster. 

Here's what you can do:

*   **Register walkers:**  Use `addWalker()` to add new walker configurations.
*   **Verify walkers:** `validate()` makes sure a walker exists before you run anything.
*   **See your walkers:** `list()` shows you all the walkers you've registered.

The service uses a map to store walkers and a logger service for helpful messages.

## Class WalkerUtils

WalkerUtils helps manage and run "walkers," which are essentially automated processes for analyzing trading strategies. It simplifies the process of executing these walkers and provides tools for monitoring and managing them.

Think of WalkerUtils as a central hub. It provides a single, easy way to start, stop, and retrieve information about your walkers. It automatically handles things like pulling key information from walker configurations.

Here's what you can do with WalkerUtils:

*   **Run walkers:** Easily kick off a walker comparison for a specific trading symbol, providing extra information about what you're testing.
*   **Run in the background:** Start a walker to perform actions like logging or triggering callbacks without needing to directly watch the results.
*   **Stop walkers:** Halt the generation of new trading signals from a walker. This stops any strategies in progress, but allows existing signals to complete before stopping completely.
*   **Get data & reports:** Retrieve the data produced by walker comparisons or generate nicely formatted reports to understand the results. You can also save these reports to a file.
*   **List walkers:** See a list of all currently running walkers, including their status (e.g., running, completed, or error).

It’s designed to be a central, always-available resource—a single instance that you can use throughout your system.

## Class WalkerSchemaService

This service keeps track of different schema definitions, specifically for "walkers," which seem to represent components in a larger system. It uses a special registry to store these schemas in a way that helps prevent errors related to incorrect data types.

You can add new schema definitions using the `addWalker()` method (represented here as `register`).  To get a specific schema definition, you'll use the `get()` method, providing the name of the schema you're looking for.

Before adding a new schema, the `validateShallow()` function quickly checks that it has the necessary properties and that they are of the correct types.  If you need to update an existing schema, the `override()` function allows you to change only certain parts of it, leaving the rest untouched.

The service also includes internal logging capabilities and a registry that manages how the schemas are stored.

## Class WalkerReportService

WalkerReportService helps you keep track of how your trading strategies are performing during optimization. It listens for updates as your strategies are tested and saves the results to a database. This allows you to easily see which parameters are working best, compare different strategies, and monitor your optimization progress over time.

To get started, you'll subscribe to receive these optimization updates. Once you're done, you can unsubscribe to stop receiving them. The service uses a logger to provide feedback, and it's designed to prevent accidental duplicate subscriptions.

## Class WalkerMarkdownService

The WalkerMarkdownService helps you automatically create and save reports about your trading strategies, specifically designed for use with walkers. It listens for updates from your walkers, keeping track of how each strategy is performing.

It organizes strategy results separately for each walker, preventing them from interfering with each other.

The service generates nicely formatted markdown tables that let you easily compare the performance of different strategies. These reports are saved as files, making it simple to review and share your results.

You can subscribe to walker events to start receiving updates, and unsubscribe when you no longer need them. The `tick` function is what handles processing those updates and storing the results. You can retrieve the accumulated data, generate reports, or even clear out all the stored data if you need to start fresh. The service also handles creating the necessary file directories to store your reports.

## Class WalkerLogicPublicService

This service helps manage and run "walkers," which are essentially automated trading processes. It builds on a private service to handle the core walker logic, but adds a layer of context management. Think of it as providing a standardized way to execute trading strategies and automatically pass along key information like the strategy's name, the exchange being used, the timeframe, and the walker's identifier.

The service uses a logger to track events and relies on other services for managing walker schemas. The main function, `run`, is used to start a walker comparison for a specific stock symbol, effectively launching a set of backtests across different strategies while ensuring consistent context. It returns a generator that produces results as they become available.


## Class WalkerLogicPrivateService

WalkerLogicPrivateService helps you compare different trading strategies, orchestrating their execution and providing updates along the way. It essentially acts as a manager for running multiple strategies one after another.

As each strategy finishes its backtest, you'll receive progress updates. The service also keeps track of the best performance metric in real-time so you can see how strategies stack up. Finally, it delivers a complete report at the end, ranking all the strategies you tested. 

This service relies on BacktestLogicPublicService to actually execute the backtests for each strategy.

The `run` method is the key – it's how you start the comparison process, specifying the symbol to trade, the strategies you want to compare, the metric you want to optimize for, and some context information about the testing environment.

## Class WalkerCommandService

WalkerCommandService acts as a central point to access and manage walker functionality within the system. It's designed to be easily used in different parts of the application through dependency injection.

Think of it as a convenient layer on top of `WalkerLogicPublicService`, providing a structured way to interact with the walker's core logic.

It relies on several services like `loggerService`, `walkerLogicPublicService`, and various validation services to handle different aspects of walker operation.

The main function, `run`, is what initiates a walker comparison. You tell it which symbol to analyze and provide context details, such as the walker's name, the exchange it's connected to, and the frame it's running within, and it will return a sequence of results.

## Class TimeMetaService

The TimeMetaService helps you keep track of the latest candle timestamp for each trading setup – think of it as knowing exactly when the last candle closed for a specific symbol, strategy, exchange, and timeframe. It's especially useful when you need this timestamp outside the usual trading tick cycle, like when executing a command between trades.

It essentially maintains a record of these timestamps, updating them as new ticks come in. If you need a timestamp, it’ll quickly provide it, or wait briefly if it’s still loading. 

The service is designed to be reliable, falling back on another service if you’re already in a trading tick. To keep things clean, it allows you to clear these timestamp records, either for a specific setup or all of them, which is important when starting a new backtest or trading session. It's a central piece for coordinating time-sensitive operations across your trading system.

## Class SyncUtils

The SyncUtils class helps you analyze and understand your signal synchronization data. It collects information about signal opening and closing events, allowing you to get a detailed picture of what's happening with your trading strategies.

You can use it to retrieve aggregated statistics, like the total number of signals opened and closed. It also generates nicely formatted Markdown reports that include tables summarizing each signal event, providing key details like the signal ID, action taken (open or close), position information, and performance metrics.

Finally, the class allows you to easily save these reports to files for later review and analysis, organizing them by symbol, strategy, and whether they are backtest or live data. It handles creating the necessary directories to store these files.

## Class SyncReportService

The SyncReportService is designed to keep a record of what's happening with your signals, specifically when they are initiated and exited. It listens for these "sync" events and neatly packages them into a report file, which is useful for keeping track of your trading activity and auditing purposes.

The service diligently logs when a signal is opened – basically, when a new order gets filled – capturing all the important details about that signal. It also records when a position is closed, noting the profit or loss and why it was closed.

Think of it as a detailed logbook of your signal lifecycle.

You can tell it to start listening for these events by using the `subscribe` method, which prevents accidental duplicate subscriptions. When you're done needing the service, use `unsubscribe` to stop the listening – if it wasn't already listening, this step is harmless. The `subscribe` method returns a function that you can call to stop the subscription. 

The `tick` property is the engine that actually processes these events and writes them to the report. The `loggerService` allows for debugging and displaying messages about the service’s operation.

## Class SyncMarkdownService

This service helps you create and store reports about your trading signals, specifically focusing on when they open and close. It listens for signal events and organizes them by symbol, strategy, exchange, and timeframe.

You can think of it as a data collector and reporter for your trading signals. It gathers information about each signal's lifecycle and presents it in an easy-to-read markdown format.

To start using it, you'll subscribe to a stream of signal events. Once subscribed, it automatically begins tracking these events and building up data. You can then request reports or statistics for specific combinations of symbols and strategies.

It allows you to view accumulated statistics, generate detailed reports, or even clear all collected data. You can also save these reports directly to disk, making it simple to review past performance. It provides a way to track and analyze how your signals perform over time.

## Class StrategyValidationService

This service helps keep track of your trading strategies and makes sure they're set up correctly. It acts like a central control panel, registering your strategies, validating them before they're used, and remembering its findings to speed things up later. 

You can add new strategies using `addStrategy`, providing their details. The `validate` function is used to verify that a strategy exists and that any linked risk profiles and actions are also valid. To see a complete list of registered strategies, use the `list` function.

The service also relies on other services like `loggerService`, `riskValidationService`, and `actionValidationService` to manage logging, risk profile validation, and action validation. Essentially, it’s designed to provide a reliable way to manage and confirm your strategy configurations.

## Class StrategyUtils

StrategyUtils helps you analyze and understand how your trading strategies are performing. It acts as a central place to gather and present data about your strategy’s actions.

It collects information about events like closing positions, taking profits, or adjusting stop-loss orders. This information is organized and summarized to give you a clear picture of what's happening.

You can request detailed statistics, like the frequency of different types of actions taken by a strategy. 
It can also generate well-formatted markdown reports displaying a timeline of these events, including key details like the price, percentage values, and timestamps. 

Finally, it can easily save these reports as files, automatically creating the necessary directories to keep things organized. The reports include a summary section detailing how often each type of action was taken.

## Class StrategySchemaService

The StrategySchemaService helps keep track of different trading strategy blueprints. It acts like a central library, storing and organizing these blueprints so they can be easily accessed and reused.

It uses a special system to ensure the blueprints are structured correctly and consistently.

You can add new strategy blueprints using `addStrategy()`, and retrieve existing ones by their names using `get()`.  If a blueprint already exists, you can update parts of it using `override()`. Before a blueprint is added, `validateShallow()` checks to make sure it has all the necessary parts and that they're the right type. The `register` property is an internal function not intended for direct use.

## Class StrategyReportService

This service is designed to keep a detailed audit trail of your trading strategy's actions, like when it cancels orders, closes positions, or adjusts stops and take-profits. It's particularly useful if you want to review exactly what your strategy did and when, especially for regulatory or debugging purposes.

To start using it, you need to "subscribe" – this tells the service to begin recording events.  Each time a significant action happens – whether it's a partial profit take, a trailing stop adjustment, or a breakeven move – the service saves a record of it to a separate JSON file.  

Think of it as a digital paper trail for your strategy.  When you're done, you can "unsubscribe" to stop the logging. This service writes events directly to disk, unlike other reporting services that might hold everything in memory temporarily.  It's reliable and ensures that you don’t lose track of anything.


## Class StrategyMarkdownService

This service helps you track and report on your trading strategy's actions during backtesting or live trading. Think of it as a detailed event recorder and report generator for your strategies.

It collects information about various actions like canceling orders, closing trades, and adjusting stop-loss levels.  Instead of writing each action to disk immediately, it temporarily stores them to create more comprehensive reports later.

To start using it, you need to "subscribe" to begin collecting data.  Once subscribed, the service automatically logs events triggered by your strategy. To get your data, use methods to retrieve statistics or generate markdown reports which can be saved to files. When you’re finished, you “unsubscribe” to stop data collection and clear the collected information.

The service remembers which symbol, strategy, exchange, frame, and backtest setting each event belongs to, making it easy to organize your reports.  It also offers the ability to configure which columns appear in your reports, and you can clear the stored data when it's no longer needed.

## Class StrategyCoreService

StrategyCoreService is a central hub for managing strategy operations, providing a way to interact with strategies and their data. It's a foundational component used internally by other services.

This service handles things like validating strategy configurations, retrieving information about pending signals (like profit/loss and entry points), and performing actions like closing positions or adjusting stop-loss levels. It injects relevant information like the trading symbol, timestamp, and backtest parameters into the strategy’s execution context, ensuring that operations are performed with the correct data.

**Key Features:**

*   **Signal Management:**  Provides methods to retrieve and manipulate pending signals, including their profit/loss, entry prices, and partial closes.
*   **Position Details:**  Offers insights into the current position, such as the total cost, invested count, effective price, and percentage closed.
*   **Validation:** Validates strategy and risk configuration to ensure proper functionality.
*   **Actions:**  Allows for actions like stopping a strategy, canceling scheduled signals, and closing pending positions.
*   **Backtesting:** Facilitates fast backtesting by wrapping strategy backtest functionality.
*   **Performance Metrics:** Includes methods for tracking and reporting on metrics such as maximum profit and drawdown.



It’s designed to be reusable and well-organized, making it easier to build and maintain complex trading systems. It promotes consistency by centralizing common strategy operations.

## Class StrategyConnectionService

This class acts as a central hub for managing strategies within the backtesting framework. It intelligently routes calls to the correct strategy implementation, ensuring that each strategy operates in its isolated environment.

The service uses a caching mechanism to store and retrieve strategy instances, boosting performance. It automatically handles strategy initialization and supports both live trading (tick) and backtesting (backtest) operations.

Here's a breakdown of what it does:

*   **Smart Strategy Routing:** It directs requests to the right strategy based on the trading symbol and strategy name.
*   **Performance Caching:** It keeps frequently used strategies readily available, preventing repetitive creation.
*   **Safe Initialization:** It guarantees that strategies are properly initialized before any trading actions occur.
*   **Comprehensive Support:** It handles both live and historical data simulations.

The class provides several methods to interact with strategies:

*   **`tick()`:** Executes a single trading tick for a strategy.
*   **`backtest()`:** Runs a strategy against historical data.
*   **`getStrategy()`:** Retrieves a cached strategy instance.
*   **`getPendingSignal()`:**  Accesses the currently active pending signal data.
*   **`getPosition...()` methods:** Provide detailed information about the current position, like cost, profit, and levels.

It also offers advanced capabilities:

*   **Partial Close Management:** Functions to partially close positions at profit or loss levels (`partialProfit`, `partialLoss`).
*   **Trailing Stop/Take Management:** Adjustments to trailing stop and take-profit levels (`trailingStop`, `trailingTake`).
*   **Scheduled Signal Control:** Activating or canceling scheduled orders (`activateScheduled`, `cancelScheduled`).
*   **Validation Functions:**  Checking if an action (like average buy or partial close) is valid before execution.


## Class StorageLiveAdapter

The `StorageLiveAdapter` acts as a flexible middleman for managing how your trading signals are stored. It lets you easily switch between different storage methods – like keeping data on your hard drive, using memory only, or even using a "dummy" adapter that does nothing at all. 

Think of it as a pluggable system; you can swap out the underlying storage without changing much of your strategy's core logic.

It provides methods for handling various signal events (opened, closed, scheduled, cancelled) and for retrieving signals by ID or listing them all. The `handleActivePing` and `handleSchedulePing` methods keep signals up-to-date by recording when they’re active or scheduled. 

You can choose which storage method to use with the `useStorageAdapter`, `useDummy`, `usePersist`, or `useMemory` functions, with persistent storage being the default.  If your environment changes significantly, you can clear the adapter and force it to reinitialize.

## Class StorageBacktestAdapter

The `StorageBacktestAdapter` provides a flexible way to manage how your backtesting data is stored. Think of it as a central hub that allows you to easily switch between different storage methods like persistent storage (saving to disk), in-memory storage (fast but temporary), or a dummy storage (for testing without actually saving anything).

It handles events related to signals – when they're opened, closed, scheduled, or cancelled – and it lets you retrieve signals based on their ID or list all of them.  It also keeps track of when signals are actively pinged or scheduled, updating their timestamps.

You can change the storage method it uses through the `useStorageAdapter`, `useDummy`, `usePersist`, or `useMemory` functions, giving you great control over your backtest's data persistence.  There's also a `clear` function to reset the adapter to its default in-memory configuration, useful when the working directory changes. Essentially, this adapter simplifies managing where your backtesting signals are saved and how you interact with that storage.

## Class StorageAdapter

The StorageAdapter acts as a central hub for managing how your trading signals are stored, whether they’re from backtesting or live trading. It automatically keeps track of new signals as they're generated, simplifying how you access them. 

It makes sure you don't accidentally subscribe to signal updates multiple times, preventing unexpected behavior. You can also easily turn storage on or off – and it’s safe to turn it off more than once.

Need to retrieve a specific signal? The `findSignalById` method lets you search by ID across your entire signal history.  If you only want to see the signals from your backtests, `listSignalBacktest` is what you need. Similarly, `listSignalLive` shows you all of the signals from your live trading.

## Class SizingValidationService

This service helps you keep track of your position sizing strategies and makes sure they're correctly set up before your backtests run. 

It acts like a central directory for your sizing configurations, letting you register new strategies with `addSizing`. 

Before you use a sizing strategy in a backtest, you can use `validate` to confirm it exists, preventing potential errors. 

For efficiency, it remembers the results of validations, so things run faster.  If you need to know what sizing strategies are available, `list` gives you a complete overview.


## Class SizingSchemaService

The SizingSchemaService helps you keep track of and manage your sizing schemas in a reliable, type-safe way. It uses a specialized registry to store these schemas, ensuring everything is organized and consistent.

You can add new sizing schemas using the `addSizing()` function (referred to as `register` in the code) and access them later by their unique names using the `get` function.  If a sizing schema already exists, you can update it using the `override` function – think of it as providing partial changes to an existing schema.

Before a sizing schema is actually added, it undergoes a quick check with `validateShallow` to make sure it has all the necessary parts and that they're the right types. This helps prevent errors later on. The service also keeps track of logging information for tracking purposes.

## Class SizingGlobalService

This service helps determine how much to trade based on your risk management rules. It’s a central component, handling position sizing calculations for both the internal strategy execution and when you're interacting with the system. 

It relies on other services to make those calculations, specifically a connection service and a validation service. 

The `calculate` method is the key function – you provide it with details about the trade (like the amount of risk you want to take) and it returns the appropriate position size to use. This method also keeps track of the sizing operation being performed.


## Class SizingConnectionService

The SizingConnectionService acts as a central hub for calculating position sizes within your backtesting strategies. It intelligently directs sizing requests to the correct sizing implementation based on a name you provide.

To optimize performance, it remembers (caches) these sizing implementations, so it doesn't have to recreate them every time you need them.

Think of it as a smart dispatcher that ensures your sizing calculations are handled correctly, whether you're using a fixed percentage, a Kelly criterion, or another sizing method.

The `getSizing` property is the key to retrieving these sizing implementations, and it automatically handles creating and caching them.

The `calculate` method is where the actual sizing calculations happen, using the provided parameters and context (including the sizing name). It takes care of picking the right sizing method and performing the necessary calculations. If your strategy doesn't have a specific sizing configuration, you'll use an empty string as the sizing name.


## Class ScheduleUtils

The ScheduleUtils class helps you manage and understand the reporting of scheduled trading signals. Think of it as a tool to keep track of signals that are waiting to be executed and to analyze how well the scheduling is working. 

It provides a simple way to get data about these signals, like how many are queued, how often they're cancelled, and how long they're taking to be processed.

You can easily generate clear, readable reports in markdown format to visualize this information for a specific trading strategy and symbol. 

The class is designed to be readily available throughout your backtesting framework, ensuring you have easy access to signal scheduling insights. It also allows you to save these reports directly to your hard drive.

## Class ScheduleReportService

The ScheduleReportService helps you keep track of how your scheduled signals are performing. It's designed to listen for signal events – when a signal is scheduled, when it starts, and when it's cancelled. 

It carefully records these events, noting the time elapsed between scheduling and when the signal is either executed or cancelled. This information is then saved to a database so you can analyze and understand any delays.

To use it, you’ll subscribe to receive these signal events, and when you’re done, you’ll unsubscribe to stop listening. The service is set up to prevent accidental multiple subscriptions, ensuring reliable tracking. It uses a logger to provide useful debugging information.

## Class ScheduleMarkdownService

The ScheduleMarkdownService helps you keep track of your trading signals by automatically creating reports. It listens for when signals are scheduled and cancelled, then organizes this information for each strategy you're using. The service compiles this data into easy-to-read markdown tables, and also calculates useful statistics like cancellation rates and average wait times.

It saves these reports as markdown files, making them simple to view and analyze.

Here's a breakdown of what you can do with it:

*   **Subscribe & Unsubscribe:** You tell the service to start paying attention to your signal events, and you can later stop that monitoring.
*   **Process Events:** It handles incoming signal events (scheduling, cancellations) and keeps track of them.
*   **Get Data:**  Retrieve statistics about scheduled signals for a specific trading setup.
*   **Generate Reports:** Create a full markdown report showing all the signal events for a particular trading setup.
*   **Save Reports:** Automatically save these reports to disk in an organized folder structure.
*   **Clear Data:** You can completely wipe the recorded data, or just clear the data for a specific strategy and instrument.



The service manages its data storage carefully, ensuring that data for different strategies and instruments is kept separate.

## Class RiskValidationService

This service acts like a gatekeeper for your risk management setup. It keeps track of all your defined risk profiles and makes sure they exist before you try to use them, preventing errors down the line. 

Think of it as a central registry where you can add new risk profiles using `addRisk`.  Before running any trading strategies, you can use the `validate` function to confirm a specific risk profile is registered – it's like a quick check to ensure everything is in order. 

For efficiency, the service remembers previous validation checks thanks to memoization, speeding things up.  Finally, `list` allows you to see a full inventory of all the risk profiles currently registered with the system.

## Class RiskUtils

This class helps you analyze and report on risk rejections that occur during trading. Think of it as a tool to understand why your strategies are being flagged and potentially rejected. It gathers information about these rejections, like the symbol involved, the strategy used, the position taken, and the reason for the rejection.

You can request summarized statistics about these rejections, such as the total number of rejections for a specific symbol and strategy. 

It also allows you to create detailed reports in Markdown format, which include a table of all rejection events with relevant details, plus a summary of key statistics at the end. Finally, you can easily export these reports to files, creating organized records of your risk management activity. The class retrieves and compiles this information from a service that's listening for risk rejection events and storing them.

## Class RiskSchemaService

This service helps manage a collection of risk schema definitions, ensuring they are stored and accessed in a type-safe way. It uses a registry to keep track of these schemas, allowing you to easily add new ones and retrieve existing ones by name. 

Before a risk schema is added, a quick check is performed to verify its basic structure, making sure all necessary components are present. You can also update existing schemas, essentially replacing parts of them with new information. 

Finally, when you need a specific risk schema, you can simply request it by its name, and the service will return the definition. 

The service also includes a logger for tracking activities and providing context.

## Class RiskReportService

The RiskReportService helps you keep a record of when trading signals are rejected by your risk management system. It’s designed to capture these rejection events and store them in a database, making it easier to analyze why trades are being blocked and to audit your risk controls.

It listens for signals that have been rejected and logs details like the reason for rejection and information about the signal itself.

To use it, you’ll subscribe to receive these rejection events. When you're finished tracking these events, you can unsubscribe to stop receiving them. The service is designed to prevent accidental double-subscription, which could cause issues. It utilizes a logger to output debugging information, and a `tickRejection` property handles the actual logging to the database.

## Class RiskMarkdownService

The RiskMarkdownService helps you automatically generate and save reports detailing risk rejections within your trading system. It actively monitors for rejection events, keeping track of them separately for each symbol and trading strategy. 

It then assembles this data into easy-to-read markdown tables, providing a clear overview of rejection information along with summary statistics. The reports are saved to disk, making them readily accessible for review and analysis.

You can subscribe to receive rejection events, and unsubscribe when no longer needed. The `tickRejection` function handles the processing of these events.

You can retrieve statistical data, generate individual reports, or save reports to disk. There's also a way to completely clear all accumulated data or just data for a specific symbol-strategy combination. The service uses a storage system that creates isolated instances for each symbol-strategy-exchange-frame-backtest combination, ensuring that data is organized and doesn't interfere with other setups.

## Class RiskGlobalService

RiskGlobalService acts as a central point for managing and enforcing risk limits within the trading system. It handles validations and checks signals against pre-defined risk configurations.

This service relies on other components like a connection service for risk data and dedicated validation services for different aspects of the system.

Here's a breakdown of its key functions:

*   It validates risk configurations, remembering previously validated settings to avoid unnecessary work.
*   `checkSignal` determines whether a trading signal should proceed based on risk limits, preventing potentially problematic trades.
*   `addSignal` registers new trading positions, marking them within the risk management system, and `removeSignal` closes out those positions when they are exited.
*   `clear` allows for resetting the risk data, either selectively for a specific risk setup or completely clearing all data.

Essentially, RiskGlobalService provides a safety net, ensuring trading activity aligns with defined risk parameters.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks within your trading system. It intelligently routes requests to the correct risk management component based on a risk name, ensuring that each strategy and exchange operates within its defined limits. To improve performance, it remembers previously retrieved risk management components, avoiding unnecessary re-creation.

This service handles everything from validating signals before execution to tracking open and closed positions for risk assessment. Think of it as a traffic controller, making sure every trade adheres to the pre-defined risk rules specific to its strategy, exchange, and timeframe. When a signal needs to be checked, it consults the appropriate risk manager and, if the signal is rejected, it flags the event. The system also allows you to clear those remembered risk management components when needed. It's a crucial part of building a robust and controlled trading environment.

## Class ReportWriterAdapter

This component helps manage how your trading data and events are stored for analysis and review. It acts as a flexible middleman, allowing you to easily swap out the storage method without changing your core trading logic.

Think of it as a central point for controlling where your reports end up, whether that's a simple JSONL file or something more complex.

It keeps track of storage instances, making sure you only have one active instance for each type of report (like backtest results or live trade data). This is efficient and prevents conflicts.

You can easily change the type of storage used – switching to a dummy adapter to temporarily halt writes is also an option. The default storage method is appending data to JSONL files. 

The system only initializes the storage when it first needs to write data, making it lazy and resource-friendly.


## Class ReportUtils

ReportUtils helps manage how your trading system generates reports and logs data.

It lets you turn on and off different types of logging, like backtest results, live trading events, or performance metrics.

The `enable` function lets you pick which report services to activate, and it's crucial to remember to use the cleanup function it returns to avoid memory problems later.

The `disable` function lets you stop logging for specific services without affecting others, and it doesn't require a separate cleanup step. 

Think of it as a way to precisely control what data is recorded and how.

## Class ReportBase

The `ReportBase` class helps you reliably log event data as JSONL files, making it easy to analyze your trading strategies later. It's designed to write data continuously, ensuring no events are lost, and handles potential slowdowns gracefully.

Each report type gets its own file, located in a directory that’s automatically created.  You can filter these logs by criteria like the trading symbol, strategy name, exchange, timeframe, signal ID, and walker name, allowing targeted analysis.

The class manages the file writing process, handles errors, and includes a 15-second timeout to prevent writing operations from hanging indefinitely.  Initialization happens only once, and writing is done in a safe manner that avoids buffer overflows. You just provide the data, metadata, and it takes care of formatting and appending it to the JSONL file.


## Class ReportAdapter

The ReportAdapter helps manage how your trading data and analytics are stored, making it easy to switch between different storage methods. It's designed to be flexible, allowing you to plug in different ways to save your reports. 

Think of it as a central point for controlling where your reports go – you can easily change from saving to a JSONL file to using a different system altogether.  It remembers which storage method you've selected, so you don't have to configure it every time. 

If you need to refresh your storage, like when your working directory changes, you can clear the cache to ensure new storage instances are used. There's also a dummy mode that allows you to temporarily disable report writing, which can be useful for testing. Finally, the `useJsonl` method ensures that you are utilizing the default JSONL storage.

## Class PriceMetaService

PriceMetaService helps you get the latest market price for a specific trading setup, like a symbol, strategy, exchange, and timeframe. It keeps track of these prices and updates them as new data comes in from your strategy. 

Think of it as a convenient way to access the price information outside of the normal trading process – for example, if you need to trigger an action between ticks.

It's designed to be reliable; if a price isn't immediately available, it will wait a short time before letting you know.  It also remembers the prices it has, so it doesn’t need to constantly re-fetch them.

To keep things clean and prevent outdated information, you should clear the stored prices at the beginning of each new trading period.  You can either clear all prices or just specific ones.

PriceMetaService automatically handles updating the prices based on information from your strategy and exchange connections, making it easy to use without a lot of extra work. It's set up as a central component that’s managed by the system.


## Class PositionSizeUtils

This class helps you figure out how much of an asset to trade, using different position sizing techniques. It offers pre-built methods to calculate the right size based on your risk tolerance and trading strategy. 

Each method, like fixed percentage, Kelly Criterion, and ATR-based sizing, performs checks to make sure the data you provide is appropriate for the selected approach.

Here's a quick rundown of the available methods:

*   **fixedPercentage:** Determines the position size based on a fixed percentage of your account balance, ensuring a consistent risk level.
*   **kellyCriterion:** Calculates the optimal position size using the Kelly Criterion, which aims to maximize long-term growth by considering win rate and win-loss ratios.
*   **atrBased:** Determines position size based on Average True Range (ATR), a measure of volatility, helping to adjust position size to the asset's price movement.

## Class Position

The Position class provides helpful tools for figuring out where to place your take profit and stop loss orders when trading. It simplifies things by automatically adjusting the direction (whether you're buying or selling) based on your position type.

It offers two main functions to help with this:

*   **moonbag:** This calculates take profit and stop loss levels using a specific "moonbag" strategy, placing your take profit at a fixed percentage above the current price.

*   **bracket:**  This function lets you customize both your take profit and stop loss levels, providing greater control over your risk and reward. You specify the percentage for both. 

Both functions return an object containing the position type, take profit price, and stop loss price.

## Class PersistStorageUtils

This utility class helps manage how signal data is saved and loaded, ensuring reliable storage even if your program crashes. It handles the behind-the-scenes details of writing data to files and reading it back, so you don't have to.

It offers a way to customize the storage mechanism, allowing you to plug in different adapters for specialized needs. Each signal's data is stored in its own file, identified by a unique ID, simplifying organization.

To ensure data integrity, the class performs write operations atomically, preventing corruption in case of unexpected interruptions.  You can also clear the storage cache if the program's working directory changes. 

There's a built-in option to switch to a “dummy” adapter that effectively disables saving, which can be helpful for testing. The class is essential for persistent storage of signals during live operation.

## Class PersistSignalUtils

The PersistSignalUtils class helps manage how signal data is saved and loaded, especially for trading strategies. It ensures that each strategy has its own dedicated storage space and provides a way to plug in different methods for saving data, like using JSON files or even discarding writes for testing. 

It automatically handles safely writing and reading signal data, making sure that the data isn't corrupted even if the system crashes. The class's `readSignalData` method is used to retrieve previously saved signal information, and `writeSignalData` saves new information.

You can customize how data is stored by using the `usePersistSignalAdapter` method to integrate your own persistence adapter. 

The `clear` method helps refresh the storage, which is useful when the working directory changes. Lastly, `useJson` and `useDummy` simplify switching between standard JSON persistence and a testing mode that doesn't actually save any data.

## Class PersistScheduleUtils

This class helps manage how scheduled signals are saved and loaded for trading strategies. It makes sure each strategy has its own isolated storage, and you can even use your own custom methods for saving data.

The system prioritizes safety; it uses special techniques to ensure that data isn't corrupted even if the program crashes unexpectedly during a save.

Here’s a bit more detail:

*   **Reading and Writing Data:** The `readScheduleData` method retrieves existing signal data, while `writeScheduleData` saves new or updated signal data. These operations are carefully handled to prevent data loss or corruption.
*   **Customization:** You can choose how the data is stored by using the `usePersistScheduleAdapter` method to register a custom adapter.
*   **Convenience Options:** The `useJson` method lets you switch back to the standard JSON storage, and the `useDummy` method is helpful for testing since it essentially ignores any data you try to save.
*   **Cache Management:** The `clear` method is useful for resetting the storage, especially when the program's working directory changes.

This utility is mainly used internally by `ClientStrategy` to handle persistence, ensuring a smooth and reliable trading experience.

## Class PersistRiskUtils

This class, `PersistRiskUtils`, helps manage and save your trading positions, particularly when dealing with different risk profiles. It’s designed to keep track of active positions and ensure that even if something goes wrong, your position data isn't lost.

The class uses a clever system of memoization, meaning it remembers which storage methods to use for each risk profile, making things efficient.

You can even customize how it saves data by plugging in your own adapters.

Importantly, it handles saving and reading data safely, so position information isn't corrupted even if the application crashes.

Here’s a quick rundown of its main features:

*   **Reading Positions:**  `readPositionData` retrieves the active positions that have been saved for a particular risk profile and exchange.  It’s used when starting up to load your previous state.
*   **Saving Positions:** `writePositionData` handles saving your active position information to disk.  It does this carefully, using atomic writes to ensure data integrity.
*   **Adapters:** `usePersistRiskAdapter` lets you swap in different ways of storing that data – think JSON, or even a dummy adapter that throws away changes for testing.
*   **Cache Clearing:**  `clear` helps keep things running smoothly by resetting the storage cache if your working directory changes.
*   **Default and Dummy Adapters:**  You can quickly switch back to the standard JSON storage with `useJson`, or disable storage completely with `useDummy`.



This tool is essential for keeping your trading strategy’s state consistent and reliable.

## Class PersistPartialUtils

This class helps manage and safely store your trading strategy's partial profit and loss information. It keeps track of these values for each symbol and strategy combination, ensuring that even if your application crashes, the data isn't lost.

It uses a clever system to avoid creating duplicate storage instances and allows you to plug in different ways of saving the data, such as JSON files or even a "dummy" adapter that throws everything away for testing purposes. 

When your strategy starts, this class loads any previously saved partial data. And when profit/loss levels change, it reliably writes the updated data back to disk using a process that’s designed to prevent corruption. 

You can clear the cached storage if your working directory changes, which is important when running strategies repeatedly. You can also quickly switch between using a standard JSON storage, a custom adapter, or a dummy adapter for testing.

## Class PersistNotificationUtils

This class helps manage how notifications are saved and loaded, ensuring they're handled reliably even if there are unexpected issues. It provides a way to store each notification individually as a file, identified by its unique ID, and offers safeguards against data loss.

You can customize how notifications are stored by plugging in different adapters. 

The `readNotificationData` method retrieves all previously saved notifications, rebuilding the state from disk, while `writeNotificationData` ensures changes are written to storage safely.

To keep things fresh, you can clear the storage cache, which is useful if your project's working directory changes. It also includes convenient options to switch between a standard JSON storage, or a dummy adapter that effectively ignores all persistence requests.

## Class PersistMemoryUtils

This class helps manage how your application remembers information (memory entries) even when it restarts. It's designed to make sure this memory isn't lost and can be retrieved reliably.

The system organizes this memory in specific folders on your computer based on identifiers like `signalId` and `bucketName`. You can customize how this memory is stored using different "adapters," allowing you to experiment with various storage methods.

Here’s a breakdown of what you can do with it:

*   **Load and Save Memory:** It provides functions to read, write, and delete these memory entries from disk.
*   **Manage Storage:** The system keeps track of which storage instances are active, creating them as needed and cleaning them up when they're no longer required.  It's important to refresh these when your working directory changes.
*   **Customization:** You can plug in your own storage adapter to change how data is persisted. There's also a "dummy" adapter that's useful for testing as it doesn’t save anything to disk.
*   **Rebuild Indexes:** You can retrieve a list of all memory entries to rebuild indexes.
*   **Cleanup:** The `dispose` function helps free up resources when you're finished with a particular memory storage.

## Class PersistMeasureUtils

This class, `PersistMeasureUtils`, helps manage how cached data from external APIs is stored and retrieved persistently, like saving it to a file. It's designed to ensure that your cached data remains consistent even if your application crashes.

The class manages cached data grouped by a unique identifier (a combination of timestamp and symbol), and it allows you to customize how this data is saved and loaded using different adapters.  It ensures data is written and read atomically, preventing data corruption.  

You can use this class to read, write, and delete cached data. Removing an entry doesn't actually delete the file from disk – it just marks it as "soft deleted," so subsequent reads will return nothing.

It also provides ways to register custom storage methods or revert back to a default JSON-based storage.  A special "dummy" adapter is available if you want to temporarily disable persistence for testing purposes.  Finally, you can clear the entire cache if the working directory changes.

## Class PersistLogUtils

This class helps manage how log data is saved and loaded, ensuring it's reliable even if things go wrong. It uses a special system to handle the storage, allowing you to swap out different ways of saving the data if needed.

The `readLogData` method retrieves all the saved log entries, loading them from storage, and if there’s nothing to load, it returns an empty list. The `writeLogData` method saves each individual log entry as a separate file, protecting the data from corruption in case of crashes.

You can also customize how the data is stored using adapters, or switch to a simple JSON-based storage, or even use a "dummy" adapter that just throws away the data for testing. Clearing the storage helps ensure everything is fresh when running different strategies in different locations on your system.

## Class PersistIntervalUtils

This framework component manages how the system remembers which time intervals have already been processed. It acts as a persistence layer, storing information about interval firing in files located in a designated directory. The presence of a file indicates that the interval has fired; its absence suggests it hasn't or that it was previously cleared.

It offers several ways to interact with its persistence: you can read and write data to these files, or even mark entries as "removed" – essentially resetting their state to allow them to fire again.

For flexibility, the system lets you swap out the storage mechanism, allowing custom adapters for different needs, or revert to a simple JSON-based storage or even a “dummy” adapter that does nothing. 

It provides a way to list all the existing interval keys for a given time bucket, useful for cleanup operations. Finally, it includes a cache clearing function that's important when the working directory changes between strategy runs.

## Class PersistCandleUtils

This class helps manage a cache of historical candle data, like price information over time. It stores each candle as a separate file to keep things organized.

To ensure data accuracy, it only returns cached data if the entire requested set of candles is available. If even one candle is missing, it signals that the cache isn’t complete.

The system also automatically updates the cache when data is incomplete.

The class allows you to use different ways to store data, including a standard JSON format or a dummy adapter that simply ignores all changes – useful for testing. You can even replace the default storage with a custom implementation.

When the program's working directory changes, you’ll need to clear the stored cache to prevent issues.

## Class PersistBreakevenUtils

This utility class helps manage and save breakeven data, ensuring that your trading strategies remember their progress even when they restart. It handles the behind-the-scenes work of storing and retrieving this data to disk, making it easy to persist the state of your trading strategies.

The class uses a clever system to create and reuse storage locations, one for each combination of symbol (like BTCUSDT), strategy name, and exchange.  You can customize how this data is saved, switching between standard JSON files or even a "dummy" adapter that simply ignores writes.

If your working directory changes between strategy runs, you can clear the cached storage to force it to recreate the necessary files.  Essentially, it's designed to reliably save and load your strategy's breakeven state, ensuring continuity and preventing data loss.

## Class PersistBase

This class provides a foundation for storing and retrieving data to files, ensuring data integrity and reliability. It's designed to handle situations where data corruption might occur.

It keeps track of the type of data being stored (entity name) and where it's being stored (base directory). 

The framework automatically validates and cleans up any corrupted files during initialization and keeps the directory organized. 

It also has built-in retry mechanisms for deleting files, and provides a way to iterate through all the stored entities using an asynchronous generator.

You can easily read, write, and check for the existence of entities, and it makes sure that file operations are done safely and reliably.


## Class PerformanceReportService

This service helps you understand how long different parts of your trading strategy take to execute. It acts like a detective, carefully recording the time it takes for each step. 

Think of it as listening for "performance events" – those moments when something important happens in your strategy’s execution. It then saves these timing details, including how long each step took and some extra information about the event.

You can tell this service to start listening for these events, and it will keep track of everything.  When you're done, you can also tell it to stop listening.  Importantly, it only allows one subscription at a time to prevent issues.

The recorded data is stored in a way that makes it easy to analyze later, letting you pinpoint bottlenecks and optimize your strategy's performance. It uses a logger to provide helpful debugging information during its operation.

## Class PerformanceMarkdownService

This service is designed to help you understand how your trading strategies are performing. It constantly monitors and collects performance data as your strategies run.

The service organizes this data by symbol, strategy name, exchange, frame, and whether it's a backtest or live trading scenario, ensuring that metrics are isolated and specific.

It automatically calculates key statistics like averages, minimums, maximums, and percentiles, providing a clear picture of your strategy's behavior. It can also generate detailed reports in markdown format, highlighting potential bottlenecks and areas for improvement. These reports are saved to disk for easy access and analysis.

You can subscribe to receive performance updates, unsubscribe to stop receiving them, and clear the accumulated data when needed. It also offers functions to retrieve specific performance data and generate reports on demand.

## Class Performance

The Performance class helps you understand and analyze how your trading strategies are performing. It provides tools to gather overall performance statistics for a specific symbol and strategy combination, giving you a clear picture of how things are working.

You can request a detailed report that uses markdown format, highlighting key areas like operation durations and percentile analysis to pinpoint potential bottlenecks. This helps you identify where your strategy might be slow or inefficient.

Furthermore, the class allows you to save these performance reports directly to your computer for later review, making it easier to track progress over time. The reports are organized into directories named after your strategies, simplifying navigation and organization. You can also customize the columns shown in the report.

## Class PartialUtils

The PartialUtils class helps you analyze and report on the smaller, partial profits and losses that occur during trading. Think of it as a tool to break down the bigger picture and see what’s happening in detail.

It gives you a way to gather statistics about these partial events, like the total number of profit and loss occurrences.

You can also generate readable reports in markdown format, presenting the partial profit/loss events in a table with details such as the action (profit or loss), symbol traded, strategy used, signal ID, position, level, price, and timestamp.

Finally, it allows you to save these reports to files for later review, organizing them by symbol and strategy name. The files are saved as markdown documents, making them easy to read and share.

## Class PartialReportService

The PartialReportService helps you keep track of smaller, partial exits from your trading positions. It specifically records when you take profits or losses before closing a position completely.

It listens for signals indicating these partial profit and loss events, and carefully logs details like the price and level at which they occurred. This information is then stored in a database for later review and analysis.

You can use the `subscribe` method to tell the service to start listening for these events, and `unsubscribe` to stop. It prevents accidental duplicate subscriptions.
The `loggerService` property lets you control the debug output, while `tickProfit` and `tickLoss` handle profit and loss event processing respectively.

## Class PartialMarkdownService

The PartialMarkdownService helps you keep track of and report on your partial profits and losses during trading. It listens for events indicating profits and losses, keeping a record of each one for a specific trading symbol and strategy. 

It then compiles this information into nicely formatted markdown reports, including summaries of total profit/loss events. These reports are saved to disk, making it easy to review your progress.

You can subscribe to receive these events, and the service makes it simple to retrieve statistics, generate reports, and save them to files. There's also a way to clear the accumulated data when it’s no longer needed, either for a specific setup or everything at once. Each unique combination of symbol, strategy, exchange, frame, and backtest has its own dedicated storage space for its data.

## Class PartialGlobalService

This service acts as a central hub for managing and tracking partial profits and losses within the trading system. It's designed to be injected into the core trading strategy, providing a single point of access for these operations.

Essentially, it sits between the strategy and the underlying connection service, allowing for centralized logging of all partial actions. This makes it easier to monitor what's happening with profits and losses across the entire system.

Think of it as a middleman that ensures all profit/loss calculations are logged for monitoring before they're handled by the connection service. It uses other services to validate components like the strategy and risk configurations.

The `profit`, `loss`, and `clear` functions handle specific events, logging them before passing the work to the connection service.  The `validate` function ensures the components involved are valid and avoids repeated checks.

## Class PartialConnectionService

The PartialConnectionService manages how profit and loss information is tracked for individual trading signals. It acts like a central hub, making sure there's only one tracking instance for each signal.

Think of it as a smart factory that creates and remembers these tracking instances (ClientPartial) for each signal. This process uses a technique called memoization to avoid creating unnecessary duplicates.

When a signal reaches a profit or loss threshold, this service handles the details, sending out notifications and updating the relevant tracking instance. When a signal is closed out, it cleans up the tracking data, making sure resources aren't wasted.

The service is designed to work with the ClientStrategy, and uses other services for logging and handling actions, which makes it a well-integrated part of the overall trading framework. It effectively handles the lifecycle of partial profit/loss tracking for each signal you're trading.

## Class NotificationLiveAdapter

The `NotificationLiveAdapter` acts as a central hub for sending notifications related to your trading strategies. Think of it as a flexible messenger that can deliver updates in different ways.

It's designed to be adaptable – you can easily swap out the way notifications are sent, whether that's keeping them in memory, saving them to a file, or just discarding them (for testing purposes). The default behavior stores notifications in memory.

You can switch between different notification methods: a dummy adapter that does nothing, an in-memory adapter for temporary storage, or a persistent adapter that saves notifications to disk.

The adapter provides a suite of methods for handling different events – signals, profit/loss updates, strategy commitments, errors, and more. Each of these methods simply passes the information along to the currently configured notification system.

You can also retrieve all the notifications that have been stored, or clear them out entirely. If your base directory changes (like when a strategy runs multiple times), you should reset the adapter to ensure it uses the correct path.

## Class NotificationBacktestAdapter

This component acts as a central hub for managing notifications during backtesting. It’s designed to be flexible, allowing you to easily swap out different notification methods – like storing data in memory, persisting it to a file, or discarding notifications entirely (using a dummy adapter). The default behavior keeps notifications in memory for quick access.

You can switch between these notification methods using convenient helper functions: `useDummy`, `useMemory`, and `usePersist`. `useDummy` is useful for quickly silencing notifications during testing. `useMemory` is the standard, and `usePersist` ensures your notifications are saved for later review.

It provides methods for handling various events during backtesting, such as signals, partial profits, losses, and errors. All these event handling functions simply pass the information to the currently selected notification method.

The `getData` method lets you retrieve all the notifications that have been captured so far, and `dispose` clears the stored notifications. If you change the working directory between backtesting runs, it’s recommended to call `clear` to ensure the adapter resets to its default in-memory configuration.

## Class NotificationAdapter

This component handles and organizes all your trading notifications, whether you're running a backtest or a live trading system. It automatically keeps track of notifications as they come in, ensuring you don't miss anything. 

It makes it easy to access both backtest and live notifications in a single place, and it's designed to prevent accidental duplicate notifications.

You can turn it on and off as needed, and it's safe to turn it off multiple times.  When you're finished, you can clear out all the notifications it has stored.


## Class MemoryAdapter

The MemoryAdapter acts as a central hub for managing and accessing memory instances, specifically for data related to signals and buckets. It's designed to efficiently handle these instances, ensuring they are created and managed in a controlled way.

Think of it as a smart way to keep track of data linked to specific signals and buckets, avoiding duplicates and ensuring data consistency.

You can easily change how this data is stored – choosing between a simple in-memory solution, persistent storage on your file system, or even a "dummy" mode that just ignores any data changes.

The `enable` and `disable` functions control how the adapter interacts with the signal lifecycle, automatically cleaning up memory when a signal is finished, which prevents issues caused by leftover data. You *must* `enable` before using any of the memory functions.

You have methods to write, search, list, remove, and read data, all while leveraging BM25 full-text scoring for powerful searching capabilities.

If you're experimenting or need a fresh start, `clear` wipes the slate clean, rebuilding memory instances. Finally, `dispose` releases the resources used by the adapter, cleaning up after it’s done.

## Class MaxDrawdownUtils

This class helps you understand and report on the maximum drawdown experienced during trading. It acts as a central place to access information collected about those drawdown events.

Think of it as a way to create reports or get summary statistics regarding your trading performance concerning potential losses.

You can retrieve data about the drawdown, generate a comprehensive markdown report outlining the events, or even save that report directly to a file. To access and work with this data, you'll specify the trading symbol, strategy name, exchange, and timeframe you're interested in. This is particularly useful for assessing risk and optimizing strategies.


## Class MaxDrawdownReportService

The `MaxDrawdownReportService` is responsible for recording maximum drawdown events, which are crucial for assessing risk in trading strategies. It keeps track of these drawdown occurrences and saves them to a database in a JSONL format for later analysis. 

It listens for drawdown notifications and, whenever a new drawdown happens, it logs a record containing detailed information such as the timestamp, symbol, strategy name, exchange, frame, backtest details, signal ID, position size, current price, and even the effective take profit and stop loss prices from the signal itself.

To start the process of saving these drawdown events, you need to "subscribe" to the service.  Importantly, it prevents you from accidentally subscribing multiple times – subsequent subscription attempts simply return the existing unsubscribe function. 

You can then "unsubscribe" from the service to stop it from recording further drawdown events. This disconnection is done using the function returned when you initially subscribed.


## Class MaxDrawdownMarkdownService

This service is responsible for creating and saving reports about maximum drawdown, a key risk metric in trading. It actively monitors drawdown events and organizes them based on the trading symbol, strategy, exchange, and timeframe. 

You can subscribe to receive these drawdown events and conversely unsubscribe to stop monitoring and clear any stored data.  The `tick` method handles the processing of each individual drawdown event. 

To retrieve the accumulated drawdown statistics for a specific trading context, use the `getData` method. The `getReport` method takes this data and transforms it into a user-friendly markdown report.  If you want the report saved directly to a file, the `dump` method will generate the report and write it to the specified path. Finally, the `clear` method allows you to reset the stored data, either for a specific trading combination or a complete reset.

## Class MarkdownWriterAdapter

The MarkdownWriterAdapter helps you manage how your trading reports are saved. Think of it as a flexible tool that lets you choose where and how your reports are stored – whether it's in individual files, combined into a single JSONL file, or discarded entirely. 

You can easily switch between different storage methods using functions like `useMd`, `useJsonl`, or `useDummy`. `useMd` creates a separate markdown file for each report, `useJsonl` appends everything to one file, and `useDummy` effectively turns off markdown generation.

Behind the scenes, it's designed to be efficient.  It keeps track of storage instances and only creates new ones when needed.  If you need to change how your markdown is created, you can adjust the `MarkdownFactory` to customize the adapter. The `clear` function is useful if your working directory changes, ensuring that new storage is created properly.

## Class MarkdownUtils

The MarkdownUtils class helps you control when and how markdown reports are generated within the backtest-kit framework.

It lets you turn on markdown reporting for specific areas like backtests, live trading, or performance analysis, choosing exactly what you want to see in markdown format.

When you enable markdown reporting, it starts listening for data, gathers information, and creates markdown files when needed.  It’s important to remember that enabling a service comes with a cleanup function – use it to stop the reporting and prevent memory issues.

Conversely, you can disable markdown reporting for certain areas without affecting others, allowing for targeted control over report generation. This is useful if you want to focus on specific aspects of your trading. Disabling doesn’t require a cleanup function; it immediately stops the markdown process for the specified areas.

## Class MarkdownFolderBase

This adapter is designed for creating reports with a structured directory layout, where each report is saved as its own individual markdown file. Think of it as the go-to choice when you want easily navigable and human-readable reports.

The adapter automatically handles creating the necessary directories for your reports, making organization effortless. Each file's location is determined by the `path` and `file` settings you provide.

The `waitForInit` method doesn’t actually do anything – it's just included because the base class requires it. 

The core functionality lies in the `dump` method, which takes your markdown content and writes it to a file, handling the creation of directories along the way.


## Class MarkdownFileBase

This class, `MarkdownFileBase`, helps you write markdown reports in a structured way as JSONL files. Think of it as a system for creating standardized, append-only logs of your trading reports.

It organizes reports into individual files based on their type, making it easy to find and process specific kinds of information later. The system handles writing data in streams, managing buffer sizes to prevent slowdowns, and even includes a timeout to prevent writes from getting stuck.  It automatically creates the necessary directories to keep everything organized.

You can filter these reports by criteria like the trading symbol, strategy used, exchange, timeframe, and signal ID, making it simple to pinpoint the data you need.

The initialization process is handled automatically, and you can call the initialization multiple times without issue.  Finally, the `dump` method lets you write a single markdown report line with all the necessary metadata attached.

## Class MarkdownAdapter

The MarkdownAdapter helps manage how your markdown files are stored and organized. It's designed to be flexible, allowing you to choose different ways to store markdown data.

You can easily switch between storing each markdown file as a separate `.md` file or appending them to a single `.jsonl` file. 

The adapter also remembers the storage setup you choose, preventing unnecessary re-initialization.

If your project directory changes, you can clear the adapter's memory to ensure files are written to the correct location. A dummy adapter is available for testing or situations where you don't want any markdown files to be saved.

## Class LoggerService

The LoggerService is designed to provide consistent logging across the entire backtest-kit framework. It's a central place for managing log messages and automatically adding important contextual information to them.

Think of it as a helper that takes your logging requests and enhances them with details like which strategy is running, which exchange is involved, and what part of the process is executing. 

You can plug in your own preferred logger, or if you don’t specify one, it will use a basic, "do nothing" logger.

It offers different logging levels – log, debug, info, and warn – all with the benefit of automatic context addition. 

To customize the logging, you can set your own logger implementation using the `setLogger` method.  The service relies on `methodContextService` and `executionContextService` to automatically add information to the logs.

## Class LogAdapter

The `LogAdapter` component provides a flexible way to manage and store your trading logs. Think of it as a central hub for all your logging needs, allowing you to easily switch between different storage methods.

By default, logs are stored in memory, which is quick and easy for testing. However, you can swap this out for persistent storage on disk, a dummy adapter that doesn't log anything at all, or a JSONL file adapter for more structured logging.

You can change the logging mechanism at any time using methods like `usePersist`, `useMemory`, `useDummy`, and `useJsonl`. The `useLogger` method lets you completely customize the adapter by providing your own logging class. 

The `clear` method is useful for situations where your application's working directory changes; it effectively resets the log adapter to its initial state. You can retrieve all logged entries at once with `getList`, and use `log`, `debug`, `info`, `warn` to log different levels of information.

## Class LiveUtils

LiveUtils provides tools for managing live trading operations, acting as a central point for interacting with the live trading system. It offers simplified access to running live trades and includes features like crash recovery and real-time progress tracking.

The `run` method starts live trading for a specific symbol and strategy, continuously generating trading results and automatically recovering from crashes by persisting state.  The `background` method allows you to run live trades silently without seeing the generated results, useful for tasks like persistence or callbacks.

You can also retrieve specific signal details such as pending, scheduled, or breakeven points using methods like `getPendingSignal`, `getScheduledSignal`, and `getBreakeven`.  There are functions to check for the presence or absence of signals, too.

A variety of methods let you inspect the state of a live position, including its cost basis, invested units, percentage closed, PnL, entry levels, and more. You can also adjust the trailing stop and take-profit levels.

The framework offers methods for controlling live trading, such as `stop` (to halt a strategy), `commitCancelScheduled` (to cancel a scheduled signal), and `commitClosePending` (to immediately close a pending position). Several commit methods facilitate actions like partial profit/loss closures and DCA entries. The `list` method allows you to see a summary of all active live trading instances and their statuses. Finally, `getData` and `getReport` facilitate reporting and data analysis on live trading activities.

## Class LiveReportService

LiveReportService helps you track what's happening with your trading strategy in real-time by recording every significant event – from when it's waiting for a signal to when a trade is opened, active, or closed.

It connects directly to your live trading signals and saves all the details of these events into a database. 

Here's a breakdown of how it works:

*   It listens for those live trading signal events.
*   It logs all types of tick events, providing a complete record.
*   It then stores this information persistently.
*   The `subscribe` method lets you connect to the live signal flow, and crucially, it prevents you from accidentally subscribing multiple times, which could cause problems.  You'll get a function back that you need to call to stop listening.
*   The `unsubscribe` method cleanly disconnects from the live signal flow, ensuring everything shuts down properly.






## Class LiveMarkdownService

The LiveMarkdownService helps you create and save detailed reports about your live trading activity. It keeps track of various events happening in your strategies – like when a strategy is idle, when it opens a position, when it's actively trading, and when a position is closed. 

It gathers this information for each strategy and then formats it into easy-to-read markdown tables, also providing key statistics such as win rate and average profit/loss. These reports are automatically saved to files in a logs directory, making it simple to review and analyze your trading performance.

You subscribe to receive real-time trading signals, and the service handles the process of collecting and storing data. The `tick` function is the core of the reporting process, handling all event types as they come in. You can request specific data or reports for a particular trading symbol and strategy, or clear out all accumulated data if needed. The system ensures that data is organized and isolated for each unique combination of symbol, strategy, exchange, timeframe, and backtest setting.

## Class LiveLogicPublicService

This service manages live trading, making it easier to work with. It automatically handles things like the trading strategy's name and the exchange it's using, so you don't have to keep passing that information around.

Think of it as a central coordinator for your live trading process. 

It constantly runs, providing a stream of trading results - signals to open, close, or cancel trades.

If things go wrong and the process crashes, it can recover and pick up where it left off, thanks to saved state. It’s designed to keep going indefinitely and adjusts to the current time.

You give it a symbol to trade, and it handles the rest, providing a continuous flow of updates.

## Class LiveLogicPrivateService

This service manages live trading operations, constantly monitoring and reacting to market changes. It functions as an infinite loop, continuously checking for new trading signals. 

Each cycle involves creating a timestamp, evaluating the current signal status, and then reporting any new trades that were opened or closed – essentially skipping over signals that are still active or inactive. 

There's a short pause between each cycle to manage resource usage. The system is designed to be robust, automatically recovering from crashes and resuming trading from where it left off. The results are streamed to you efficiently as a generator, so you only process the signals that matter.


## Class LiveCommandService

This service is your gateway to live trading functionality within the backtest-kit framework. It acts as a central point of access, making it easier to integrate live trading into your applications.

Think of it as a helper that simplifies using the underlying live trading logic.

It provides a `run` method which is the core of live trading. This method continuously executes trading strategies for a specified symbol, while also gracefully handling unexpected errors and keeping the process running. The `run` method returns a stream of results, letting you know what's happening with each trade – whether it's opening, closing, or being cancelled. You’ll need to provide the strategy and exchange names when starting the live trading process.


## Class IntervalUtils

IntervalUtils provides a way to control how often certain functions are executed, especially useful in trading strategies. Think of it as a way to ensure a task only runs once per defined time period, like every minute or every hour.

There are two main ways to use this: in-memory, where the state is kept in the program’s memory, and file-based, where the state is saved to a file so it persists even if the program restarts. The file-based version is good for critical operations you want to guarantee happen only once per interval.

It works by creating unique "instances" for each function you want to control, so each function operates independently. You can also clear or dispose of these instances to reset the behavior or remove them completely. This is important if you change the location where your program is run, ensuring fresh instances are created. Essentially, it's a toolbox for managing the timing of your functions in a predictable and reliable way.

## Class HighestProfitUtils

This class is your go-to for understanding the highest profit performance of your trading strategies. Think of it as a tool that gathers and presents the best results your strategies have achieved.

It provides a few key functions:

*   **getData:** This lets you pull specific statistics for a given trading symbol, strategy, and environment. You can use it to see exactly how a strategy performed in a particular scenario.
*   **getReport:** This function creates a detailed markdown report showcasing all the highest profit events for a specific symbol and strategy combination.  Essentially, it compiles a comprehensive overview of that strategy's top moments.
*   **dump:**  It’s similar to `getReport`, but instead of just showing the report, it automatically saves it to a file – perfect for archiving or sharing your results. You can specify the file path and choose which columns of data to include.

## Class HighestProfitReportService

This service is responsible for tracking and recording the highest profit achieved during a trading backtest. It monitors a specific data stream, `highestProfitSubject`, and whenever a new highest profit is detected, it creates a record containing detailed information about that event.

The record includes key data like the timestamp, symbol, strategy name, exchange, timeframe, backtest ID, signal ID, position size, current price, and the effective price levels for opening, take profit, and stop loss. Crucially, this information comes from the signal itself, providing a complete snapshot of the conditions when the highest profit was reached.

To start capturing this data, you'll use the `subscribe` method. This method prevents accidental multiple subscriptions; attempting to subscribe again simply returns the original unsubscribe function.  When you’re finished, use `unsubscribe` to stop the recording process. It's essentially calling the function returned by `subscribe`.

## Class HighestProfitMarkdownService

This service is designed to create and save reports detailing the highest profit achieved for a given trading setup. It listens for incoming data about potential profits and organizes them based on the symbol, strategy, exchange, and timeframe being used.

You can subscribe to receive these profit events, but it's designed to avoid unnecessary re-subscriptions – the initial subscription is remembered, and subsequent attempts just return a way to unsubscribe. When you’re done, you can unsubscribe to stop listening and clear all the accumulated data.

Whenever a new profit event comes in, this service efficiently routes it to a specific storage area based on its details. You can then request reports, either as raw data or a nicely formatted markdown table, showing the highest profits recorded.  The reports can also be saved directly to a file, with filenames that clearly indicate the symbol, strategy, exchange, and whether it's a backtest or live data.

Finally, a `clear` function allows you to completely wipe out the stored data – either for a specific trading setup or everything at once, essentially resetting the system.

## Class HeatUtils

HeatUtils helps you visualize and analyze your trading portfolio's performance using heatmaps. It's a handy tool that gathers statistics across all your symbols and strategies, making it easier to understand what's working and what isn't. 

You can use it to get a snapshot of your portfolio's performance, showing things like total profit, Sharpe ratio, and maximum drawdown for each symbol.

It can also generate a nicely formatted markdown report that summarizes the heatmap data, sorted by total profit. This report can be saved directly to a file on your computer. 

Think of it as a central place to access and export these important performance metrics for your strategies. It’s readily available for use in your backtesting workflow.


## Class HeatReportService

HeatReportService is designed to track and record closed trading signals, specifically focusing on profit and loss (PNL) data, to create a portfolio-wide heatmap. It listens for these closed signal events and saves them to a SQLite database for later analysis. 

The service uses a logger to provide debugging information and a mechanism to prevent multiple subscriptions to the signal events. 

To start receiving signal events, you’ll use the `subscribe` function, which also gives you a way to stop listening by returning an unsubscribe function.  If you no longer need to track these events, calling the `unsubscribe` function will ensure you’re no longer receiving updates.

## Class HeatMarkdownService

The Heatmap Service helps you understand how your trading strategies are performing by creating a portfolio-wide view of your signals. It collects data on closed trades, organizes it by strategy and symbol, and then generates reports that are easy to read and understand.

It essentially keeps track of statistics like total profit/loss, Sharpe Ratio (a measure of risk-adjusted return), maximum drawdown (the largest peak-to-trough decline), and the number of trades executed for each symbol.

You subscribe the service to receive trade updates, and it manages a storage system to hold this data, making sure that each exchange, timeframe, and backtest mode has its own independent storage.  It can generate reports in Markdown format for easy sharing and analysis, and safely handles calculations to avoid errors caused by unexpected data.

To keep things tidy, you can clear out the collected data when it's no longer needed, either for specific combinations of exchange, timeframe, and backtest settings or for everything at once. It offers a way to save the report directly to a file on your disk for later reference.

## Class FrameValidationService

The FrameValidationService helps you keep track of and verify the different timeframes your trading strategies use. It acts as a central place to register your timeframes and then quickly check if a particular timeframe is valid before you try to use it.

Think of it like a checklist – you add all your timeframes to the service, and then when you need to use one, it confirms it's on the list. 

It also remembers its checks, so it doesn’t have to re-validate the same timeframe repeatedly, which speeds things up.  You can use `addFrame` to register new timeframes, `validate` to confirm a timeframe's existence, and `list` to see all the timeframes you've registered. The service also has a `loggerService` and an internal `_frameMap` for managing the registered timeframes.

## Class FrameSchemaService

This service is responsible for keeping track of different frame schemas, which are like blueprints for how your trading strategies are structured. It uses a special system to ensure that the schemas are stored in a consistent and type-safe way.

You can add new schemas using the `register` method, and retrieve existing ones using `get`. If a schema already exists, you can update it using the `override` method to modify specific parts without replacing the entire schema. 

Before a schema is registered, it's checked by `validateShallow` to make sure it has all the necessary components and that their types are correct – this helps prevent errors later on. The `loggerService` provides ways to monitor what's happening.

## Class FrameCoreService

This service manages how your trading backtests handle time. It acts as a central point for getting the timeframe data needed to run a backtest.

Essentially, it uses another service, `FrameConnectionService`, to fetch the actual time data, and then provides a straightforward way to retrieve timeframe arrays for specific symbols and timeframe names.

You can think of it as the engine that provides the chronological sequence of data your trading strategies will be evaluated against.

Specifically, `getTimeframe` is the key function to use – it's what you'll call to get the array of dates that define the period your backtest will cover.

## Class FrameConnectionService

The FrameConnectionService helps manage and access different frame implementations within the backtest environment. It acts as a central hub, automatically directing requests to the correct frame based on the current context. 

Think of it as a smart router that makes sure your commands go to the right place. 

To improve speed, it remembers which frames it has already created, avoiding unnecessary work. 

It also handles the timeframe for backtesting, allowing you to define a specific start and end date for your analysis. If you're operating in live mode, the frame name will be empty, meaning there are no specific frame constraints.

Here's a breakdown of its core components:

*   It uses a logger service, frame schema service, and method context service to function correctly.
*   The `getFrame` method is the main way to access a specific frame, and it utilizes caching for efficiency.
*   The `getTimeframe` method helps limit backtesting to a particular date range.

## Class ExchangeValidationService

The ExchangeValidationService helps keep track of your configured exchanges and ensures they're properly set up before you start trading. It acts like a central manager for your exchanges.

You can add new exchanges using the `addExchange` function, essentially registering them with the service. 

Before performing any actions related to an exchange, you should use the `validate` function to confirm it exists and is ready to go.  This prevents unexpected errors later on.

If you need to see all the exchanges you've registered, the `list` function will give you a comprehensive overview of them. 

The service also remembers previous validation results to make things faster and more efficient.

## Class ExchangeUtils

The ExchangeUtils class provides helpful tools for interacting with exchanges, simplifying common tasks and ensuring data consistency. It’s designed as a single, readily available resource.

It handles fetching candles (historical price data) and calculating the appropriate start time based on the interval and number of candles you need. You can also use it to determine the average price (VWAP) for a trading pair.

For placing orders or displaying market information, ExchangeUtils helps format quantities and prices to match the specific rules of each exchange.

Need to see what orders are currently open? The class retrieves order book data. It also allows you to retrieve aggregated trade data and raw candle data with custom date ranges for more advanced analysis. Essentially, it provides a convenient and validated interface for many common exchange-related operations.

## Class ExchangeSchemaService

The ExchangeSchemaService helps keep track of information about different cryptocurrency exchanges, ensuring that the data is well-organized and consistent. It uses a special system to store these exchange details safely and accurately.

You can add new exchanges using `addExchange()` and easily find them again by their names. 

Before an exchange is added, a quick check (`validateShallow`) makes sure it has all the necessary information in the right format.

If an exchange already exists, you can update parts of its information using `override`.

Finally, `get` lets you retrieve a specific exchange's details whenever you need them.

## Class ExchangeCoreService

ExchangeCoreService acts as a central hub for interacting with exchanges, providing a way to access historical and simulated data. It’s designed to work seamlessly with other parts of the backtesting framework, ensuring that all requests are aware of the current simulation parameters like the trading symbol, specific date, and whether it's a backtest or live execution.

The service manages connections to the exchange and adds details about the execution context – things like the trading symbol and the point in time – to requests.  This allows the exchange to potentially adjust its behavior depending on whether it’s a backtest or a real-time trade.

You'll find methods to retrieve:

*   Historical candle data, including future candles for backtesting.
*   VWAP (volume-weighted average price).
*   Formatted price and quantity information.
*   Order book data.
*   Aggregated trade data.
*   Raw candle data with advanced date filtering.

The validation process for exchange configurations is optimized to avoid unnecessary repetition, while also logging its progress.  Each request takes into account the current execution context to ensure accuracy and consistency throughout the backtesting process.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It automatically directs your requests – like fetching candles or order books – to the correct exchange based on the context of your trading activity. To make things efficient, it remembers which exchanges it's already connected to, so it doesn’t have to repeatedly establish connections. 

This service handles common tasks like retrieving historical price data (candles), getting the next batch of candles based on the current time, calculating the average price, and formatting prices and quantities to match the specific requirements of each exchange. It also provides access to order books and aggregated trade data. Essentially, it simplifies the process of communicating with various exchanges while ensuring data is handled correctly. You don't need to worry about which exchange to use directly; the service figures it out for you.


## Class DumpAdapter

The DumpAdapter helps manage and store information during your backtesting process, offering flexibility in how that information is saved. It acts as a central point for different storage methods, allowing you to switch between writing to markdown files, storing data in memory, or even discarding the data entirely (useful for testing). 

Before using any of its functions, you need to activate it using `enable`, which ensures it listens for signal lifecycle events and cleans up old data. Conversely, `disable` stops that listening.

You can use functions like `dumpAgentAnswer`, `dumpRecord`, `dumpTable`, `dumpText`, `dumpError`, and `dumpJson` to save different types of data. These functions accept a context object, which provides additional information about where the data should be stored.

The adapter defaults to storing data in markdown files. However, you can easily change this behavior by using functions like `useMarkdown`, `useMemory`, `useDummy`, or `useDumpAdapter` to switch to alternative storage options or provide your own custom storage mechanism. `useDumpAdapter` lets you completely replace the underlying storage with your own implementation.

Finally, `clear` helps maintain a fresh start by clearing out any cached data, ensuring the adapter works correctly when your working directory changes.

## Class ConstantUtils

The `ConstantUtils` class provides a set of pre-calculated values used for managing take-profit and stop-loss levels in a trading strategy. These constants are based on the Kelly Criterion and incorporate a mechanism for risk decay.

Think of it like this: the strategy uses multiple take-profit and stop-loss levels to gradually exit a trade, rather than one large exit.

The take-profit levels (`TP_LEVEL1`, `TP_LEVEL2`, `TP_LEVEL3`) are percentages representing how far the price needs to move towards the final target profit before triggering a partial exit.  For example, `TP_LEVEL1` at 30% means the first partial profit is taken when the price reaches 30% of the distance to the total take-profit goal.

Similarly, the stop-loss levels (`SL_LEVEL1`, `SL_LEVEL2`) represent points at which the strategy reduces its exposure by exiting a portion of the trade if the price moves unfavorably. `SL_LEVEL1` at 40% triggers a small exit to limit potential losses.

## Class ConfigValidationService

The ConfigValidationService is designed to safeguard your trading configurations by verifying the settings in GLOBAL_CONFIG. It's like a built-in safety check to catch potential errors that could lead to unprofitable trades.

It meticulously examines your settings, making sure percentages like slippage and fees are positive values, and that the take profit distance is enough to cover those costs. The service also confirms that your time-related settings, such as timeouts, are represented by positive whole numbers. It also checks ranges and candle parameters to ensure their validity. 

Essentially, it's here to make sure your configurations are mathematically sound and designed for success.


## Class ColumnValidationService

The ColumnValidationService helps keep your column configurations in good shape, ensuring they follow the rules set by the ColumnModel interface. It’s like a quality control check for your column definitions.

This service examines all of your column configurations, looking for a few key things:

*   It makes sure every column has the essential properties: key, label, format, and isVisible.
*   Each 'key' value has to be unique within its group of columns.
*   It verifies that the 'format' and 'isVisible' properties are actually functions, not just some other kind of data.
*   Finally, it confirms that your 'key' and 'label' values are strings and aren’t empty.

The `validate` method does all of this checking at once. The service also uses a `loggerService` to report any problems it finds.

## Class ClientSizing

The ClientSizing class helps determine how much of an asset to trade based on your strategy's goals. It's a flexible tool that uses different methods, like fixed percentages or the Kelly Criterion, to calculate position sizes. 

You can set limits on minimum and maximum positions, as well as a maximum percentage of your capital to risk on each trade. 

The `calculate` method is the core—it takes into account all your settings and returns the calculated position size. Think of it as the engine that figures out the right amount to buy or sell. It's what the strategy execution uses to decide how much to trade.


## Class ClientRisk

ClientRisk helps manage risk across your entire portfolio of trading strategies. It acts as a gatekeeper, making sure new trades don't violate any predefined limits.

It's designed to prevent you from exceeding maximum position sizes and to enforce any custom risk rules you've set up.  

Think of it as a central control point for all your strategies – they all share the same risk management rules.  This allows for a comprehensive view of risk across all strategies.

It’s integrated into the strategy execution process, so signals are checked *before* any trades are actually made.

The system keeps track of all currently open positions, using a unique identifier for each one. It also handles loading and saving this position data, though this feature is skipped when you're backtesting.

You can register new trades (signals) with `addSignal` and remove them when they’re closed, using `removeSignal`.

The `checkSignal` method is the key to risk management, evaluating new trades against those constraints and allowing or rejecting them as needed.

## Class ClientFrame

The `ClientFrame` class is responsible for creating the timeline of timestamps that a backtest will run through. Think of it as the engine that sequences the historical data. It avoids repeating this process by caching the timestamps it generates, making things more efficient. You can adjust how far apart these timestamps are—from one minute to three days—to match the level of detail you need.

It also allows you to add custom checks or logging during timeframe generation.

The `getTimeframe` method is the core functionality, and it returns a promise containing the array of dates for the backtest period. This method remembers its results, so it doesn’t regenerate them needlessly.


## Class ClientExchange

This component handles fetching data from an exchange, acting as a bridge between your backtesting system and the actual market data. It provides ways to retrieve historical and future candle data, calculate the volume-weighted average price (VWAP), and format trade quantities and prices according to exchange-specific rules. The system is designed for efficiency, using prototypes to minimize memory usage.

You can use this to get past candles to analyze trends or look ahead to get future candles to simulate a backtest.

Here’s a breakdown of what it does:

*   **Candle Data:** Retrieves historical and future candles for a given symbol and time interval.
*   **VWAP Calculation:** Determines the VWAP based on recent 1-minute candles.
*   **Formatting:**  Properly formats trade quantities and prices based on the trading pair’s specific requirements, ensuring accurate representation.
*   **Raw Candle Retrieval:**  Provides flexible methods for fetching candles with customizable start and end dates and limits, all while avoiding the risk of looking into the future.
*   **Order Book and Trades:** Fetches order book data and aggregated trade history.

The whole process is carefully designed to prevent "look-ahead bias" - a crucial element to ensure accurate and reliable backtest results. Each function is thoughtfully structured to ensure data integrity and reliable results.

## Class ClientAction

The `ClientAction` class is a central component that manages and executes your custom action handlers within the backtest-kit framework. Think of it as a conductor orchestrating the interactions between your strategy and external systems. It handles the lifecycle of your action handlers, ensuring they're properly initialized and cleaned up. 

It's designed to make it easy to integrate your custom logic, such as state management (like Redux), event logging, notifications (like Telegram or Discord), and analytics. This allows your strategies to react to events and communicate their status.

Specifically, `ClientAction` uses a special mechanism to ensure that each handler is initialized and disposed of only once, preventing unexpected behavior.

The framework provides specific methods like `signal`, `signalLive`, and `signalBacktest` to route different types of events to your handlers. There are also specialized event handlers for things like breakeven triggers, partial profit/loss milestones, scheduled pings, risk rejections, and synchronization signals. Note that the `signalSync` method is a critical gateway for managing orders and any errors it encounters will propagate directly.

## Class CacheUtils

CacheUtils provides a way to easily cache the results of your functions, which can significantly speed up backtesting and other processes. It's designed to avoid redundant calculations by storing and reusing results based on time intervals.

Think of it as a way to remember what your function calculated for a specific timeframe, so it doesn't have to recalculate it every time.

There's a `fn` method to cache regular functions and a `file` method for caching asynchronous functions that need to persist data to disk.  File caching stores results in files, making them available even if your program restarts.

You can also clean up the cached data using `dispose` to force a recalculation, or `clear` to wipe everything and start fresh, useful when your working directory changes.  The system ensures each function gets its own isolated cache, preventing unexpected interactions.

## Class BrokerBase

This `BrokerBase` class is your starting point for connecting your trading strategy to a real exchange. Think of it as a customizable bridge between your automated strategy and the actual trading platform. It provides a solid foundation with pre-built functions for key actions, like opening and closing positions, adjusting stop-loss and take-profit orders, and recording trades.

You don't have to reinvent the wheel—most of the common tasks are already set up with default logging. To actually trade on an exchange, you'll extend this class, plugging in the specific API calls needed for that exchange.

Here's a breakdown of how it works:

*   **Initialization:**  `waitForInit()` is your chance to set up the connection to the exchange (e.g., log in to your account).
*   **Event Handling:**  A series of methods (`onSignalOpenCommit`, `onSignalCloseCommit`, etc.) are triggered by your strategy when certain conditions are met.  These are where you'll put the code to execute the orders on the exchange.
*   **Actions covered:** These events handle opening and closing trades, managing partial profits and losses, adjusting trailing stops, and adding to DCA positions.

Essentially, `BrokerBase` handles the mechanics of interacting with the exchange, allowing you to focus on designing and refining your trading strategies. It makes it easier to build a robust and reliable trading system.

## Class BrokerAdapter

The `BrokerAdapter` acts as a crucial intermediary between your trading strategies and the actual broker. Think of it as a safety net and a traffic controller – it intercepts certain actions, like sending signals or adjusting stop-loss orders, before they directly impact your trading data.

When testing strategies in a simulated environment (backtesting), these actions are skipped entirely, preventing them from affecting the backtest results. However, when trading live, the `BrokerAdapter` forwards these actions to the connected broker.

It manages signal events (opening and closing positions), as well as adjustments to profit, loss, stop-loss, and take-profit levels. Crucially, if any of these actions fail, the system rolls back any changes made to the data, preventing data corruption.

You'll need to register your specific broker adapter with the `useBrokerAdapter` method before activating the adapter using `enable`. The `enable` function subscribes to events that automatically route signal opening and closing requests, and it’s important to remember to `disable` when you’re finished to avoid unnecessary subscriptions. It's also important to `clear` the adapter if your working directory changes.

## Class BreakevenUtils

BreakevenUtils helps you analyze and report on breakeven events, offering a way to understand how your strategies are performing. It’s a handy tool for accessing and summarizing data collected by the BreakevenMarkdownService.

You can easily retrieve statistical data like the total number of breakeven events.

It can also generate detailed markdown reports that show individual breakeven events in a table format, including information like the symbol traded, strategy used, entry price, and the time of the event.

Finally, this tool allows you to export those reports directly to files, automatically creating the necessary folders if they don’t already exist, so you can keep a record of your breakeven performance.

## Class BreakevenReportService

The BreakevenReportService helps you keep track of when your trading signals become profitable, marking the moment they reach breakeven. It essentially listens for these "breakeven" events and records them.

Think of it as a dedicated recorder for important milestones in your trading strategy.

The service logs all the details of each breakeven event, including information about the signal itself, allowing you to analyze performance later. It safely handles subscriptions, preventing accidental multiple registrations.

You can tell it to start listening for these events using the `subscribe` function, which gives you a way to stop listening later with the returned function. Similarly, the `unsubscribe` function allows you to completely stop the service from monitoring.

## Class BreakevenMarkdownService

This service is designed to automatically create and save reports detailing breakeven events for your trading strategies. It keeps track of these events—moments when a trade reaches its break-even point—for each symbol and strategy you're using.

The service listens for "breakeven" signals and compiles information about each event.  It then neatly organizes this data into markdown tables, providing a clear overview of these events, along with summary statistics.

You can trigger the creation of these reports, which are saved to a specific directory on your system, to help you analyze and understand the performance of your trading strategies. It's possible to clear the accumulated data, either for a specific symbol and strategy or to clear everything. The service ensures data is organized into isolated storage areas based on your symbol, strategy, exchange, frame, and backtest configuration.

## Class BreakevenGlobalService

This service, called BreakevenGlobalService, acts as a central hub for managing breakeven calculations within the backtest-kit framework. Think of it as a go-between—it receives requests for breakeven operations and passes them on to a lower-level service while also keeping a record of everything happening.

It’s designed to be easily incorporated into trading strategies and provides a convenient place to monitor breakeven-related activity. The service relies on several other services, like validation and schema services, to ensure everything is set up correctly before any calculations take place.

The `validate` function ensures the strategy and its related configurations are valid, and caches these validations to avoid repeated checks. The `check` function is responsible for determining if a breakeven trigger should occur, and the `clear` function resets the breakeven state when a signal is closed. Logging is handled centrally, giving you a clear view of breakeven operations at a global level.

## Class BreakevenConnectionService

This service helps track when a trading signal has reached a breakeven point. It efficiently manages and creates instances to monitor each signal, ensuring we don't create unnecessary objects.

It keeps a record of these signal-specific calculations, using a clever caching system for faster access. When you need to check if a signal has broken even, or when it's time to clear the breakeven status, this service handles the process.

The service relies on other components for logging and managing actions, and it communicates changes to a central tracking mechanism. Think of it as a central hub for managing breakeven calculations for each trading signal.


## Class BacktestUtils

This class provides helpful tools for running and analyzing backtests within the trading framework. It acts as a central hub for managing backtest operations and accessing key data points.

You can use it to run backtests for specific symbols and strategies, either in a standard way or in the background for tasks like logging.  It also provides shortcuts for retrieving important information about active positions, such as pending signals, open positions, and profit/loss data. The `run` method is the primary way to execute a backtest and receive results, while `background` allows for background execution without directly processing the results.

Need to know the current pending signal?  Methods like `getPendingSignal` and `hasNoPendingSignal` are available.  Want to understand the performance of a position?  You can fetch information such as breakeven price, average entry price, position size, and realized profit/loss.  The `commit...` methods let you manually interact with a running backtest, such as setting trailing stops or taking partial profits. Finally, `getReport` and `dump` are used to generate and save reports summarizing backtest results.  Think of it as a toolkit to streamline and analyze your backtesting process.

## Class BacktestReportService

The BacktestReportService helps you track what's happening during your backtests. It diligently records all the changes in your trading signals—when they're inactive, when they start, when they're actively trading, and when they close. 

Think of it as a detailed logbook for your backtest strategies. It listens for these signal events and saves them along with lots of information about each event to a database.

You can easily start the service to listen for these signal events, and when you’re finished, you can stop it. The service is designed to prevent accidentally subscribing multiple times.

Here’s what the service offers:

*   A way to log all the important events related to your trading signals.
*   Automatic saving of these events to a database for later review.
*   Simple methods for starting and stopping the logging process.


## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save reports summarizing the performance of your trading strategies during backtests. It listens for signals as your backtest runs and keeps track of how those signals performed – specifically, when they closed. 

It organizes this information, creating detailed markdown tables that you can easily read and analyze. These reports are saved to your logs directory, making it simple to review your strategy’s history.

You can retrieve statistics and generate reports for specific symbols, strategies, exchanges, and timeframes. The service also allows you to clear out all the accumulated data if you want to start fresh, or clear data for a specific backtest configuration.

To get started, you'll subscribe to the backtest signal emitter; once subscribed, the service automatically processes tick events to capture signal performance. When you're finished, remember to unsubscribe to stop receiving those events.

## Class BacktestLogicPublicService

This service helps manage and run backtests in a streamlined way. It automatically handles the context needed for your backtesting process – things like the strategy name, exchange, and frame – so you don't have to pass them around explicitly. 

Think of it as a convenient layer on top of the private backtesting logic.

The `run` method is key; it allows you to start a backtest for a specific symbol. It returns a stream of results – signals representing trades (opens, closes, cancellations) – and those results will already have the necessary context attached. You don't need to worry about setting that up yourself. The service uses a logger and the private backtesting logic internally to do the work.

## Class BacktestLogicPrivateService

The BacktestLogicPrivateService manages the process of running a backtest, handling the flow of data efficiently. It starts by retrieving timeframes, then iterates through them, processing each one and triggering actions based on signals.

When a signal indicates a trade should be opened, the service fetches relevant candle data and executes the backtest logic. To manage trade durations, it skips timeframes until a signal indicates a trade should be closed. 

The service then reports the result, continuing the cycle with the next timeframe. Importantly, it streams the results as they become available, avoiding the buildup of large arrays and optimizing memory usage. You can also interrupt the backtest early if needed.

This class depends on several other services: the strategy core, exchange core, frame core, action core, and method context. The `run` method is the main entry point, allowing you to specify the symbol you want to backtest and receive results as a stream.

## Class BacktestCommandService

The BacktestCommandService acts as a central point for starting and managing backtests within the system. Think of it as a go-between, making it easy for different parts of the application to request and receive backtest results.

It's designed to be used for dependency injection, meaning it's a clean way to provide access to backtesting capabilities without directly exposing complex internal details.

Several services—like those handling strategy, risk, action, and exchange validations—are essential parts of this service, ensuring everything is set up correctly before a backtest begins. 

The primary function, `run`, is how you initiate a backtest. You provide a symbol to test and context (like the strategy, exchange, and frame names) to set the parameters for the backtest, and it returns a series of results describing the actions taken during the backtest.


## Class ActionValidationService

The ActionValidationService helps you keep track of and verify your trading actions. It acts like a central manager for all your action handlers, ensuring they're properly registered before your trading logic runs. 

Think of it as a checklist: you add action definitions using `addAction`, and then `validate` confirms that those actions actually exist before they're used. 

To speed things up, it remembers previous validation results, so checks aren’t repeated unnecessarily. 

Finally, `list` provides a handy way to see all the action handlers that are currently registered with the service. 

It also uses a logger service for any important notifications and stores the action configurations internally.

## Class ActionSchemaService

The ActionSchemaService helps you keep track of and manage your action schemas – think of them as blueprints for how actions are executed within your system. It makes sure everything is type-safe and organized, leveraging a registry to store these schemas.

It checks that your action handlers (the code that actually *does* the actions) only use the methods they're supposed to, ensuring a secure and predictable process.

You can register new action schemas, with the service validating them to make sure they’re set up correctly, or update existing ones with just the changes you need.

Retrieving a schema is also straightforward, providing you with all the details necessary to create and use client actions. 

The service uses a logger to help with debugging and monitoring, and it utilizes a registry for safe and structured storage. It also allows for private methods, and provides shallow validation for basic correctness.


## Class ActionProxy

The `ActionProxy` acts as a safety net when you’re using custom logic within your trading strategy. It's designed to prevent errors in your custom code from bringing down the entire backtesting or live trading system. Think of it as a wrapper around your custom action handlers that automatically catches and logs any errors that might occur, allowing the system to continue running.

It’s a factory-pattern class, meaning you create instances of it using `fromInstance`, which takes your partial implementation of an action and a set of parameters.

Here's a breakdown of its key functions:

*   **`init()`**: Runs your initialization code and catches any errors during setup.
*   **`signal()`**: Handles regular signal events, wrapping your code to prevent crashes.
*   **`signalLive()`**: Specifically handles signal events during live trading.
*   **`signalBacktest()`**: Specifically handles signal events during backtesting.
*   **`breakevenAvailable()`**, **`partialProfitAvailable()`**, **`partialLossAvailable()`**, **`pingScheduled()`**, **`pingActive()`**, **`riskRejection()`**: Similar error-capturing wrappers for different event types.
*   **`dispose()`**: Cleans up resources when the strategy ends, safely handling potential errors.
*   **`signalSync()`**: A special case where errors *aren't* caught, as they need to be passed along directly.

Essentially, `ActionProxy` is there to make sure your custom trading logic doesn't unexpectedly stop the whole process, logging errors and continuing execution whenever possible.

## Class ActionCoreService

The ActionCoreService is the central hub for handling actions within your trading strategies. It automatically manages the execution of actions defined in your strategy schemas, ensuring they're invoked in the correct order and with the right data.

Think of it as a conductor leading an orchestra of actions – it retrieves the list of actions from your strategy’s blueprint, validates everything to make sure it's set up correctly, and then makes sure each action gets its turn to run.

Here's a breakdown of what it does:

*   **Initialization:** Sets up individual actions with `initFn`, allowing them to load any necessary data or state.
*   **Signal Handling:** It routes different types of events (like market ticks, breakeven confirmations, or scheduled pings) to the appropriate actions within the strategy. There are dedicated methods for backtesting, live trading, and specific events like `signalLive` and `signalBacktest`.
*   **Validation:** The `validate` function ensures your strategy's context and configurations (strategy name, exchange, frame, risks, and actions) are all valid before proceeding. This avoids errors later on.
*   **Synchronization:**  `signalSync` provides a way to coordinate actions, making sure all registered actions agree before proceeding.
*   **Cleanup:** The `dispose` function cleans up resources when a strategy is finished, ensuring a tidy exit.
*   **Data Clearing:** The `clear` function removes action data, either for a specific action or all actions, to ensure a fresh start.

This service relies on several other validation and connection services to function, acting as a critical component in orchestrating complex trading strategies.

## Class ActionConnectionService

The ActionConnectionService is responsible for directing different types of events – like signals, breakeven notifications, and scheduled pings – to the correct action handler within your trading strategy. It intelligently manages these actions, creating them only when needed and storing them for later use to improve performance.

When an event needs to be processed, the service uses the action name, strategy name, exchange name, and frame name to find the appropriate handler. It keeps a record of these handlers, so it doesn’t have to recreate them every time. This memoization ensures efficiency across your strategies.

The service also provides methods for initializing, disposing of, and clearing these action handlers, allowing for proper setup and cleanup. Different versions of events, such as those for backtesting vs. live trading, are handled separately using dedicated signal functions. Essentially, it's a centralized hub for routing and managing your strategy's actions.

## Class ActionBase

This framework provides a base class, `ActionBase`, to help you extend the core trading logic with custom actions. Think of it as a foundation for building specialized components that handle things like sending notifications, logging events, or managing your strategy's state.

When you create your own actions, you inherit from `ActionBase`, which handles the common setup and logging for you. You only need to implement the specific functions that your custom actions require.

Here's a breakdown of how it works:

*   **Lifecycle:** When your strategy runs, `ActionBase` manages the lifecycle of your custom actions—initialization, execution during signal events, and cleanup afterward.
*   **Events:** It provides various event methods like `signal`, `breakevenAvailable`, and `partialLossAvailable` that are triggered at specific points during the trading process. You can override these methods to perform actions based on these events. `signalLive` is specifically for actions running in a live trading environment.
*   **Flexibility:** You can use this base class to integrate with external services like databases, email providers, or messaging platforms.
*   **Logging:**  All important events are automatically logged, making it easier to debug and monitor your custom actions.
*   **Context:** You get access to key information about your strategy, such as its name and the timeframe it's running on.



Ultimately, `ActionBase` simplifies the process of creating and managing custom logic within the trading framework.
