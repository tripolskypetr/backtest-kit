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

This service helps you keep track of and double-check your walker configurations, which are essential for things like parameter sweeps and fine-tuning models. Think of walkers as blueprints for exploring different settings.

It acts like a central hub for all your walkers, making sure they're properly set up before you start running tests. Adding a new walker is as simple as registering its configuration.

To prevent errors, the service checks if a walker exists before you use it. It also remembers the results of previous checks to speed things up.

You can also get a complete list of all the walkers that are currently registered.


## Class WalkerUtils

WalkerUtils is a helper class designed to simplify working with walkers, which are essentially automated trading strategies. It provides a central point to execute and manage these strategies.

Think of it as a way to easily run your trading algorithms and get their results without writing a lot of complicated code. It handles details like automatically identifying the trading exchange and the name of the algorithm being used.

WalkerUtils also offers several helpful functions:

*   `run`: Executes a walker for a specific trading symbol and provides a stream of data from its progress.
*   `background`: Runs a walker in the background, perfect for tasks like logging or performing other actions based on the walker's activity, without needing to see the intermediate results.
*   `stop`:  Gracefully stops all strategies within a walker, allowing any currently running trades to finish before halting new signal generation.
*   `getData`: Retrieves all the results from the walker's strategy comparisons.
*   `getReport`: Creates a formatted markdown report summarizing the walker's performance, including customizable columns.
*   `dump`: Saves the generated report to a file.
*   `list`: Shows a list of currently running walkers and their status.

WalkerUtils is designed to be easy to use, providing a single, convenient way to manage your trading strategies and their outputs.

## Class WalkerSchemaService

The WalkerSchemaService helps keep track of different schema configurations used for walkers. It uses a specialized system to store these schemas in a way that helps prevent errors due to incorrect data types.

You add new schema configurations using the `addWalker` function, and can then retrieve them later by their unique name.

The service includes checks to make sure new schemas are set up correctly before they are stored. It also provides a way to update existing schema configurations with just the changes you need. 

Essentially, it's a central place for managing and ensuring the consistency of your walker schema definitions.

Here's a breakdown of key parts:

*   `loggerService`: Handles logging information related to the service's operations.
*   `_registry`: This is where the actual schema configurations are stored.
*   `register`:  Adds a new walker schema to the registry.
*   `validateShallow`: Quickly checks that a new schema has the necessary components.
*   `override`: Lets you update parts of an existing schema without replacing the whole thing.
*   `get`: Retrieves a specific schema configuration.

## Class WalkerReportService

WalkerReportService helps you keep a record of your strategy optimization experiments. It's like a digital notebook that logs the results of each test run as you fine-tune your strategies.

It listens for events from your optimization process and diligently records the key performance metrics and statistics.  You can think of it as a way to track which parameter settings lead to the best results and monitor the overall progress of your optimization efforts.

It stores this data in a SQLite database, allowing for detailed analysis and comparison of different strategies.

To use it, you'll subscribe to receive optimization events, and when you’re done, you’ll need to unsubscribe to prevent further logging. Importantly, subscribing only happens once to prevent duplicate entries.

## Class WalkerMarkdownService

The WalkerMarkdownService helps you automatically create and save detailed reports about your trading strategies. It listens for updates from your walkers – essentially your backtesting simulations – and carefully tracks their performance.

It keeps the results for each walker separate, so you can easily compare strategies. The service then transforms this data into easy-to-read markdown tables, which are saved as files for later review.

You can subscribe to receive updates as the walkers run, and unsubscribe when they're finished. The `tick` function is key for processing those updates. You can retrieve specific data, generate a full report, or save it directly to disk. It also provides a way to clear out old data, either for a single walker or all of them.

## Class WalkerLogicPublicService

This service helps manage and execute trading "walkers," which are essentially automated sequences of actions. It's designed to simplify how you run these walkers by automatically passing along important information like the strategy being used, the exchange involved, and the name of the walker itself. 

Think of it as a layer on top of a private walker logic service that ensures everything gets the right context.

The `run` method is the main way to use this service; it allows you to kick off a walker for a specific trading symbol and will handle the necessary setup. It provides a stream of results from the walker execution.


## Class WalkerLogicPrivateService

WalkerLogicPrivateService helps you compare different trading strategies. It manages the process of running each strategy one after another and gives you updates as they finish. 

Essentially, it orchestrates the backtesting process, keeping track of the best performing strategy along the way.

The service relies on BacktestLogicPublicService to actually perform the backtests.

You can use it to run a comparison for a specific financial symbol and a list of strategies you want to compare, defining the metric you'll use to judge their performance.

The `run` method starts this process and will provide a stream of results, one for each strategy. You’ll receive updates as each backtest completes, so you can monitor the comparison in real time.

## Class WalkerCommandService

WalkerCommandService is like a central hub for interacting with the walker functionality within the backtest-kit framework. It acts as a bridge, making the walker's capabilities accessible to other parts of the system. 

Think of it as a simplified interface for accessing various services needed for walker operations, allowing for easy integration and dependency management. 

It holds references to several other services like logging, walker logic, schema management, and validation services – basically, everything it needs to manage and run walkers.

The main function, `run`, is what you'll use to actually execute a walker comparison. You provide a symbol (like a stock ticker) and context information (the walker, exchange, and frame names) to initiate the process and receive results. It returns a generator, allowing you to process results as they come.

## Class TimeMetaService

The TimeMetaService helps you keep track of the latest candle timestamp for each trading setup you're using—think symbol, strategy, exchange, and timeframe. It's designed to give you that timestamp even when you're not actively in the middle of a trade execution.

Essentially, it remembers the last known timestamp for each combination of symbol and setup. If you need a timestamp outside of a regular trading tick, it provides it.  It waits a short while (up to LISTEN_TIMEOUT milliseconds) to make sure a timestamp is available if it hasn't been updated yet.

The service works by storing these timestamps in special streams (BehaviorSubjects).  These streams are updated automatically after each trade tick by another service, so you don't have to worry about manually updating them. It also smartly uses the timestamp from the execution context if you’re already within a trading execution.

You can clear these stored timestamps to free up memory, which is especially useful when starting a new backtest or live trading session. It's a way to make sure you're always working with the freshest data. The service is managed automatically and doesn’t require you to handle the low-level stream management.

## Class SyncUtils

SyncUtils helps you understand and analyze the lifecycle of your trading signals. It gathers data related to when signals are opened and closed, letting you see how many events occurred, and providing detailed statistics. 

You can request summaries of this data, including tables that show crucial details about each signal, like the symbol traded, the direction of the position, pricing information, and performance metrics. 

This class also allows you to save those reports as Markdown files, making it easy to share or review your trading activity—filenames clearly indicate what’s included in the report. The data comes from a service that tracks signals and stores information about events, allowing for detailed analysis of your trading strategies.

## Class SyncReportService

The SyncReportService is designed to keep a detailed record of signal activity, specifically when signals are opened and closed. It monitors a stream of synchronization events, capturing important information like the specifics of a newly placed order (signal-open) and the details of when a position is exited, including profit/loss and the reason for the closure (signal-close). 

This service logs these events in a structured JSONL format, perfect for auditing and tracking trading activity.  It uses a logger to provide debugging information and ensures that the subscription to the event stream only happens once, preventing unnecessary logging. 

You can think of it as an automated system that generates a report log whenever a signal triggers an order or a position is closed out. The `subscribe` method starts the process of listening for these events, and `unsubscribe` stops it, ensuring you only log data when needed.

## Class SyncMarkdownService

This service helps you keep track of your trading signals and create reports about them. It listens for signal opening and closing events and organizes them by symbol, strategy, exchange, and timeframe. You can then generate reports in markdown format that show the details of each signal's lifecycle, along with statistics like the total number of signals, opens, and closes.

To start using it, you'll need to subscribe to the `syncSubject` to receive those signal events.  Once you're done, you can unsubscribe to clean up and stop listening.

The `tick` method handles each incoming signal event, adding a timestamp and routing it to the correct storage location. You can retrieve the accumulated data or generate a report for a specific symbol, strategy, and timeframe combination.

Finally, the `dump` method creates these reports and saves them as markdown files. You can also clear out the accumulated data to start fresh, either for a specific combination of parameters or for everything.

## Class StrategyValidationService

This service acts as a central hub for managing and checking the health of your trading strategies. It keeps track of all the strategies you've defined and ensures they’re set up correctly before you start trading.

Think of it as a quality control system: it verifies that each strategy actually exists, that the risk profiles attached to it are valid, and that any actions associated with it are also configured properly.

To make things efficient, it caches the results of these checks, so it doesn't have to re-validate strategies repeatedly.

Here's what you can do with it:

*   You can register new strategies using `addStrategy()`.
*   `validate()` makes sure a strategy is present and its related configurations are set up correctly.
*   `list()` will show you all the strategies currently registered with the service.

It relies on other services – `loggerService`, `riskValidationService`, and `actionValidationService` – to handle logging, risk assessment, and action verification, respectively.

## Class StrategyUtils

StrategyUtils provides tools to analyze and report on your trading strategies. It acts as a central point to access and organize data collected about strategy events, like when a trade is canceled, closed for profit, or adjusted with a trailing stop.

You can use it to pull out statistical summaries of how your strategies are performing, understanding things like how often different actions are triggered. It also generates nicely formatted markdown reports containing detailed information about each strategy event, including the symbol traded, action taken, price details, and timestamps.

Finally, StrategyUtils lets you save these reports to files, making it easy to share your results or keep a record of your strategy's activity. The reports are named using the symbol, strategy, exchange, and frame, making them easily identifiable.

## Class StrategySchemaService

The StrategySchemaService helps keep track of different strategy blueprints, ensuring they’re all structured correctly. It acts like a central library for strategy definitions.

It uses a special registry to safely store these blueprints, allowing you to add new ones and find them later by name.

Before a new strategy blueprint is added, it's checked to make sure it has all the necessary pieces. You can also update existing blueprints with only the changes you need.

If you need to find a specific strategy blueprint, you can simply ask for it by name, and the service will retrieve it for you. 

The service also has a logger to help with debugging.

## Class StrategyReportService

This service helps you keep a detailed record of what your trading strategies are doing, especially during backtesting. Think of it as a detailed audit trail for your strategies.

To start logging events, you need to "subscribe" to the service. Then, as your strategies take actions like closing positions, taking profits, or adjusting stop-loss orders, this service captures those events and saves them as individual JSON files. This is different from other reporting services that might gather everything in memory; this one writes immediately to disk.

There are several specific types of events it tracks:

*   **cancelScheduled:** When a scheduled order is canceled.
*   **closePending:** When a pending order is filled.
*   **partialProfit:** When a portion of a position is closed at a profit.
*   **partialLoss:** When a portion of a position is closed at a loss.
*   **trailingStop:** When the trailing stop-loss is adjusted.
*   **trailingTake:** When the trailing take-profit is adjusted.
*   **breakeven:** When the stop-loss is moved to the entry price.
*   **activateScheduled:** When a scheduled order is triggered early.
*   **averageBuy:** When a new entry is added to a position (useful for dollar-cost averaging).

Once you’re done, you "unsubscribe" to stop the logging process.  The `subscribe` method makes sure only one subscription exists at a time, and `unsubscribe` can be called multiple times safely.

## Class StrategyMarkdownService

This service helps you track and report on strategy actions during backtesting or live trading. It acts like a central collector, gathering information about events like cancellations, closes, partial profits/losses, trailing stops, and breakeven adjustments.

Think of it as a temporary holding area for these events before you generate a report. Unlike other services that immediately write data to disk, this one holds events in memory, allowing for more efficient batch reporting.

To start using it, you need to "subscribe" to begin collecting data. Events are recorded automatically as your strategy executes. You can then use methods to get the data, generate a nicely formatted Markdown report, or save the report to a file. When you're done, remember to "unsubscribe" to stop data collection and clear the stored information.

The service uses a clever caching system to manage the data it holds. This means it doesn't create a new storage space for every strategy, but reuses existing ones, which makes it more efficient.

You can customize your reports by choosing which columns to include.  You can also selectively clear accumulated data if needed, either for a specific strategy or everything at once.

## Class StrategyCoreService

This class, `StrategyCoreService`, acts as a central hub for managing strategy operations during backtesting or live trading. It's designed to inject relevant information like the trading symbol, timeframe, and backtest mode into the execution process.

Think of it as a helper that simplifies how strategies are run and validated, relying on other services for tasks like logging, connection management, and risk assessment.

Here's a breakdown of what it offers:

*   **Signal Retrieval:**  It can fetch the current pending or scheduled signal for a symbol, providing details about the active trade or a future one.
*   **Position Metrics:**  It gives you insights into the current position's status, including its cost basis, percentage closed, total cost, invested count, PnL, and entry levels (DCA details).
*   **Validation & Checks:**  It validates strategy configurations and can check things like whether a breakeven point has been reached or if a strategy should be stopped.
*   **Execution Control:** You can use it to close pending or scheduled signals, stop a strategy's operation, or dispose of resources.
*   **Performance Monitoring:** It provides methods to track things like the position's maximum drawdown, the time since peak profit, and other performance metrics.
*   **Tick & Backtest:** Provides utility methods to manage the execution on a tick or backtest run.



In short, `StrategyCoreService` organizes and centralizes the management and data access associated with a strategy's lifecycle within the backtesting framework.

## Class StrategyConnectionService

The StrategyConnectionService acts as a central hub for managing trading strategies within the backtest-kit framework. It intelligently routes requests to the correct strategy implementation based on the symbol and strategy name, ensuring each strategy operates in its designated exchange and timeframe. To optimize performance, it caches these strategy instances, avoiding redundant creation.

Key functionalities include:

*   **Strategy Routing:** It automatically connects requests to the right strategy.
*   **Performance:** It keeps a cache of strategies to avoid recreating them.
*   **Initialization:** It ensures strategies are ready before they're used.
*   **Comprehensive Operations:** It handles both live trading ticks and backtesting processes.

The service provides methods to retrieve information about positions, such as pending signals, total cost, and PnL, and it offers functions to modify positions through partial profit/loss closures and average buy orders.  It also allows for stopping or canceling scheduled signals, and importantly provides methods to validate actions before they are executed.

## Class StorageLiveAdapter

The StorageLiveAdapter helps manage how your trading signals are stored, offering flexibility by letting you choose different storage methods like persistent disk storage, in-memory storage, or even a dummy adapter for testing. It acts as a central point for interacting with your storage, handling events like signals being opened, closed, scheduled, or cancelled, and providing methods to find signals by ID or list them all. 

You can easily switch between storage types using methods like `usePersist`, `useMemory`, and `useDummy`, giving you control over data persistence. If you need to change the underlying storage mechanism entirely, the `useStorageAdapter` method lets you specify a custom storage adapter. It's also important to call `clear` periodically, especially when the working directory changes, to ensure a fresh storage setup. The adapter internally keeps track of things like when signals were last updated with ping events.

## Class StorageBacktestAdapter

The `StorageBacktestAdapter` provides a flexible way to manage how your backtest data is stored. Think of it as a central hub that can connect to different storage systems, like saving data to a file, keeping it only in memory, or even using a dummy storage for testing.

It allows you to easily switch between storage methods without changing much of your core backtest code. By default, it uses persistent storage (saving to disk), but you can easily swap this out for in-memory or dummy storage.

The adapter handles events related to signals – when they’re opened, closed, scheduled, or cancelled – and passes these actions on to the chosen storage backend. You can retrieve signals by their ID or get a list of all stored signals.

It also has convenient methods (`useDummy`, `usePersist`, `useMemory`) to quickly change the storage backend you’re using. The `clear` method resets the adapter to the default in-memory storage, which is useful when your working directory changes. This keeps your storage fresh.


## Class StorageAdapter

The StorageAdapter is the central component for managing how your trading signals are saved and accessed. It automatically keeps track of signals as they come in, handling both historical backtest data and current, live signals.

To start using it, you'll enable it to begin receiving signal updates. Conversely, you can disable it to stop this process, and it’s safe to call this even if it's already disabled.

You can search for a specific signal using its unique ID.  The adapter also lets you view lists of signals, allowing you to retrieve all backtest signals or all live signals separately. 


## Class SizingValidationService

The SizingValidationService helps you keep track of your position sizing strategies and make sure they're set up correctly. Think of it as a central organizer for your sizing rules.

You can add new sizing strategies using `addSizing`, essentially registering them with the service.

Before you use a sizing strategy, `validate` will quickly check if it actually exists, preventing errors down the line. The service is smart too, it remembers validation results to speed things up.

Finally, `list` provides a way to see all the sizing strategies you've registered so you have a full overview of what’s available.

## Class SizingSchemaService

The SizingSchemaService helps you keep track of sizing schemas, which are essentially sets of rules for determining trade sizes. It uses a special system to store these schemas in a way that helps prevent errors. 

You add sizing schemas using the `addSizing` method (though it’s not explicitly shown here) and can later find them again by their assigned name using the `get` method. 

Before a sizing schema is officially added, it's checked to make sure it has the expected structure and data types.  If a sizing schema already exists, the `override` method lets you update parts of it without replacing the entire thing. The service has a logger built in that can be configured to help monitor its activity.

## Class SizingGlobalService

The SizingGlobalService is a central component responsible for determining how much to trade in each operation. It uses a connection service to perform the actual position size calculations and also incorporates validation steps to ensure the sizing is appropriate. Think of it as the engine that translates your risk preferences into concrete trade sizes. It's a global service, meaning it's accessible and used throughout the backtest-kit framework, both internally and by the public API. It has several internal helpers for logging, managing connections and validating sizing parameters. The `calculate` method is the core function, taking sizing parameters and a context and returning the calculated position size.

## Class SizingConnectionService

The SizingConnectionService acts as a central hub for handling position sizing calculations within the backtest-kit framework. It intelligently directs sizing requests to the correct sizing implementation, making sure the right sizing method is used for a particular strategy.

To optimize performance, the service keeps a record of sizing implementations it has already used (memoization), so it doesn't have to recreate them every time.

You specify which sizing method to use by providing a name, and if no sizing is defined, an empty string is used.

The `getSizing` property provides a way to access these sizing implementations, efficiently retrieving them from the cache or creating them when needed. The `calculate` property is where the actual sizing computation happens, taking into account risk parameters and the chosen method. It handles the complexities of applying different sizing approaches like fixed percentage or Kelly Criterion.

## Class SessionUtils

The `SessionUtils` class helps keep your backtest sessions separate and clean. Imagine you're running multiple backtests – you don't want one test messing with the data or events of another.

This class provides a way to essentially "pause" the global event system before each session. It clears out any existing subscriptions so that tests don't inadvertently interact.

The `createSnapshot` property offers a handy way to take a picture of the current listener state before entering a session. This allows you to revert back to the original state later on, guaranteeing a fresh start for each backtest run. Think of it like hitting a reset button for the event system.


## Class ScheduleUtils

The ScheduleUtils class is designed to help you monitor and understand the performance of your scheduled signals. It acts as a central point for accessing and reporting on the status of signals waiting to be processed.

Think of it as a tool to keep track of how your scheduled signals are behaving—whether they're in the queue, have been canceled, and how long they're waiting.

This class provides methods for gathering statistics about signal events, creating formatted markdown reports detailing signal activity, and even saving those reports directly to a file. It's set up to be easily accessible within your project, so you don't have to worry about complex setup.

You can retrieve data related to a specific symbol and strategy to see how signals are performing.
The class allows you to generate reports that summarize events, and save those reports for later review or analysis. 


## Class ScheduleReportService

The `ScheduleReportService` helps you keep track of when signals are scheduled, opened, and canceled, especially useful for spotting potential delays in your trading. It works by listening for these signal lifecycle events and saving them to a database.

Essentially, it logs the time between when a signal is scheduled and when it’s either executed or canceled.

To use it, you’ll subscribe to receive the signal events – this prevents accidental duplicate subscriptions – and later unsubscribe when you no longer need the service. The `tick` property is the key component that processes those events and writes them to the database. The logger service provides a way to see debug information, and the single shot mechanism ensures this service isn't accidentally triggered multiple times.

## Class ScheduleMarkdownService

The ScheduleMarkdownService helps you keep track of when your trading signals are scheduled and if they get cancelled, providing detailed reports. It listens for signal events – when a trade is scheduled and when it’s cancelled – and organizes these events by your trading strategy. You'll get nicely formatted markdown reports that include important details about each event, like when it was scheduled and when it might have been cancelled.

These reports aren’t just a list of events; they also include helpful statistics like your cancellation rate and the average wait time between scheduling and execution.

The service automatically saves these reports as markdown files, making it easy to review your strategies’ performance. Each strategy gets its own report stored in a dedicated directory. You can also programmatically retrieve data, generate reports, and clear old data if needed. The system creates separate data storage for each trading setup, ensuring organized reports for different symbols, strategies, exchanges, and timeframes.

## Class RiskValidationService

The RiskValidationService helps you manage and check your risk management settings. It keeps track of all the risk profiles you've defined.

Before you try to use a risk profile, this service verifies that it actually exists, preventing errors. 

To improve performance, it remembers the results of those checks, so it doesn't have to re-validate the same profiles repeatedly.

You can add new risk profiles using `addRisk`, check if a profile is valid with `validate`, and get a complete list of all registered profiles using `list`. Essentially, it provides a central place to manage and ensure the integrity of your risk configurations.

## Class RiskUtils

This class offers tools to examine and report on risk rejections that occur during trading. It helps you understand why trades might have been rejected and provides a way to analyze these rejections systematically.

Think of it as a way to dig into the reasons behind rejected trades – whether those rejections are due to margin issues, validation errors, or other concerns.

You can pull out statistical data like the total number of rejections, broken down by symbol and strategy, to get a broad overview of risk events.

It can also generate detailed reports in Markdown format that summarize each rejection event, including information like the symbol, strategy, position, exchange, price, number of active positions, and the reason for the rejection.

Finally, it can save these reports directly to files for easier sharing and record-keeping. The filenames will be based on the symbol and strategy, making them easy to identify.

## Class RiskSchemaService

This service helps keep track of different risk profiles, ensuring they are consistently structured and managed. It uses a special system to store these profiles in a type-safe way, minimizing errors.

You can add a new risk profile using `addRisk()`, which registers it with a specific name. To get a previously registered profile, simply retrieve it by name using `get()`.

If you need to update a risk profile, you can use `override()` to apply partial changes.

Before a risk profile is registered, `validateShallow()` quickly checks its basic structure to confirm that all necessary components are present and correctly typed. The underlying registry is managed internally, and a logger is included for tracking activities.

## Class RiskReportService

The RiskReportService helps you keep track of rejected trades by recording why they were blocked. It's designed to listen for signals that were flagged by your risk management system and store those rejection details—like the reason for rejection and the specifics of the signal—in a database.

Think of it as an auditor for your risk controls, allowing you to analyze and improve your trading decisions.

To get it working, you'll need to subscribe to the risk rejection events. This sets up a listener that captures those rejections.  Once you're done, you can unsubscribe to stop the monitoring.  The service makes sure you don't accidentally subscribe multiple times, preventing duplicate entries in your records. 

The `loggerService` allows you to see debugging information to ensure the service is working as expected. `tickRejection` handles the actual process of capturing and logging rejection events.


## Class RiskMarkdownService

The RiskMarkdownService helps you create detailed reports about rejected trades due to risk management. It listens for "risk rejection" events and organizes them, keeping track of rejections for each symbol and trading strategy.

It automatically generates readable markdown tables that show the specifics of each rejection, along with helpful statistics like the total number of rejections and breakdowns by symbol and strategy. These reports are saved as files on your computer.

You can subscribe to receive these events, and easily unsubscribe when you no longer need them. The service keeps track of data for different combinations of symbols, strategies, exchanges, frames and backtest settings, storing them separately to keep things organized.

You can retrieve data and reports for specific symbol-strategy combinations, or clear out all accumulated rejection data if needed. The `dump` function simplifies saving these reports to disk, even creating the necessary folders if they don’t already exist.

## Class RiskGlobalService

RiskGlobalService is a central hub for managing and validating risk during trading operations. It acts as a layer on top of a risk connection service, ensuring that trading signals adhere to predefined risk limits. This service is essential for both the strategy execution engine and for public API usage.

It keeps track of validations and caches results to prevent unnecessary repeats.

Here's a breakdown of what it does:

*   **Validation:** It validates risk configurations and makes sure these are checked appropriately, keeping a record of activity.
*   **Signal Approval:** The `checkSignal` function determines whether a trading signal is permitted, considering risk limits.
*   **Signal Registration:** `addSignal` logs when a new position is opened, letting the risk management system know about the new trade.
*   **Signal Removal:**  `removeSignal` informs the system when a position is closed.
*   **Data Clearing:**  `clear` allows you to reset the risk data – either completely or for a specific risk configuration (like a particular risk name, exchange, or frame).

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk-related operations within the trading system. It ensures that risk checks and signal management are handled by the correct specialized risk implementation. 

It intelligently caches risk management instances based on the risk name, exchange, frame, and backtest settings, leading to improved performance. Think of it as a smart directory that remembers which risk checker to use for different situations, avoiding repetitive setup.

You can retrieve a specific risk management instance using `getRisk`, which creates it if it doesn't already exist. The `checkSignal` function verifies whether a trading signal complies with predefined risk limits, and it triggers notifications if a signal is blocked.

The `addSignal` and `removeSignal` functions are responsible for registering and deregistering trading signals with the risk management system respectively. Finally, `clear` provides a way to manually clear the cached risk instances when necessary. If your strategy doesn't require custom risk settings, the risk name will simply be empty.

## Class ReportWriterAdapter

The ReportWriterAdapter helps you manage how your trading data and events are stored, allowing for flexibility and efficiency. It acts as a bridge between your trading logic and the storage system you choose.

You can easily swap out different storage methods – like JSONL files or other custom solutions – without changing the core of your trading framework.

The framework keeps track of storage instances, ensuring there's only one for each type of report (backtest, live trading data, etc.), which helps prevent conflicts and improves performance.

When you first need to save data, it automatically sets up the required storage. 

You have control over the storage adapter used, and there's a handy way to temporarily disable writing data for testing or development purposes. It logs events in real-time to JSONL files, giving you instant access to data.


## Class ReportUtils

ReportUtils helps you manage and control which parts of your trading system generate detailed reports. It's designed to let you easily turn on and off logging for things like backtests, live trading sessions, or even just performance monitoring.

You can use it to specify exactly which areas of your system should be generating JSONL event logs, allowing for fine-grained control over your data collection.

The `enable` function lets you turn on logging for specific services. It's important to remember that this returns a cleanup function—make sure you run that function later to avoid memory issues.

Conversely, `disable` lets you stop logging for certain services without affecting others, freeing up resources and potentially reducing the amount of data being stored.

## Class ReportBase

The ReportBase class helps you record and analyze trading events by writing data to JSONL files. It's designed for efficient, append-only logging, ensuring that events are stored reliably. 

It automatically creates directories and handles errors, and includes built-in protections to prevent write operations from taking too long. You can easily search through these logs based on criteria like the trading symbol, strategy, exchange, or signal used.

The class manages a file path and a write stream, initializing them only once to avoid unnecessary overhead. A timeout mechanism prevents writes from getting stuck if the file isn't accessible, and backpressure handling ensures data isn't lost if the write buffer is full. To write data, simply provide the event details and any relevant metadata – the class takes care of formatting and appending it to the JSONL file.

## Class ReportAdapter

This component, the Report Adapter, helps manage where your trading reports are stored and how they're organized. It's designed to be flexible, allowing you to easily change the storage method without altering the core trading logic. 

Think of it as a central point for handling reports – whether you're writing them to JSONL files, or another format entirely. 

You can easily swap out different storage implementations, and the system remembers which one to use for each type of report, preventing unnecessary reconfigurations. It also automatically creates storage locations the first time you write a report. 

If you need to quickly test without saving actual data, there's a "dummy" adapter that just ignores all writes. And, if your working directory changes during a test run, the `clear` function ensures that your storage instances are refreshed to use the updated base path. Finally, you can always revert to the standard JSONL format with the `useJsonl` function.

## Class ReflectUtils

This class provides a central place to get key performance metrics for active trading positions, like profit and loss (PNL), peak profit, and drawdown. Think of it as a convenient way to check on how a trade is doing without digging into individual strategy details.

It offers methods to retrieve information such as:

*   **Current PNL:**  How much the position is currently up or down (in percentage or dollar terms).
*   **Peak Performance:** The highest profit achieved and when it happened, along with related metrics like PnL percentage and cost at that peak.
*   **Drawdown:** The worst loss experienced and when it occurred, including related metrics.
*   **Time-Based Stats:** How long the position has been active, or how long a signal has been waiting.
*   **Distance from Peaks:** How far the current price is from the highest profit or deepest drawdown points.

These calculations account for factors like partial closes and fees, and can be used in both live trading and backtesting scenarios. It's designed to be easily accessible and used consistently across different strategies and exchanges. A single instance of this class is provided, making it simple to use these metrics throughout your application.

## Class RecentLiveAdapter

This component handles tracking recent signals, providing a flexible way to manage how that data is stored. It allows you to choose between keeping the data in a persistent storage, like a file, or using memory for faster but non-permanent access.  The adapter pattern lets you easily swap out the storage mechanism without changing the rest of your code.

You can switch between persistent and memory-based storage using `usePersist()` and `useMemory()`.  `useRecentAdapter()` offers a way to completely customize the storage backend by providing your own implementation.  It also provides helpful methods to retrieve the most recent signal and calculate the time since it was created. Finally, `clear()` allows you to reset the component to its default persistent storage configuration, discarding any cached data.

## Class RecentBacktestAdapter

This component, `RecentBacktestAdapter`, is designed to manage and store recent trading signals efficiently. It’s built around a flexible adapter pattern, allowing you to easily swap out different storage methods without changing the core logic. By default, it uses an in-memory storage, which is great for quick testing.  

However, you can switch to a persistent storage option that saves data to disk if you need to keep signals between sessions.

The adapter provides convenient methods like `getLatestSignal` and `getMinutesSinceLatestSignalCreated` to access and analyze the stored signals. The `useRecentAdapter` method lets you specify a custom storage adapter if needed. If you want to quickly revert to the default in-memory storage, the `clear` method resets everything.

## Class RecentAdapter

The RecentAdapter helps manage and access the most recent trading signals, whether you're running a backtest or a live trading system. It automatically keeps track of signals by listening for updates and ensures you only subscribe to the signal source once.

You can easily get the latest signal for a specific trading pair and strategy using the `getLatestSignal` function.

If you need to know how long ago the latest signal was generated, `getMinutesSinceLatestSignalCreated` calculates the time elapsed in whole minutes.

To start using the adapter, you enable it, and to stop, you disable it—the adapter is designed to handle repeated disabling safely. When you're finished, there’s a cleanup function to ensure everything is properly unsubscribed.

## Class PriceMetaService

The PriceMetaService helps you get the most up-to-date market price for a specific trading setup, considering factors like the symbol, strategy, exchange, and timeframe. It acts as a central place to reliably retrieve prices even when you're not actively executing a trade.

Think of it as a memory bank for prices, updating itself automatically as your strategy generates new price data.  If a price isn’t immediately available, it will wait a short time to see if it arrives.

The service keeps a separate record for each unique combination of symbol, strategy, exchange, and timeframe, ensuring you’re always working with the right price. When running live, it uses the actual exchange price; when backtesting, it relies on the recorded data.

You can clear this memory to refresh it, either for a specific setup or for all setups at once, which is important at the beginning of a backtest or live trading session to avoid outdated information. The service is designed to be automatically updated by the system, so you generally don't need to interact with it directly.

## Class PositionSizeUtils

This class provides tools for determining how much of your account to allocate to a trade, which is a crucial part of any trading strategy. It focuses on calculating position sizes, offering several established methods. 

You'll find methods like fixed percentage, Kelly Criterion, and ATR-based sizing, each designed to handle different risk profiles and trading styles.  

Each of these methods also includes built-in checks to ensure the provided information is suitable for that particular calculation, helping prevent errors. Essentially, this class simplifies the often complex process of calculating appropriate trade sizes.

## Class Position

The `Position` class provides tools for figuring out where to place your take profit and stop loss orders when trading. It’s designed to work whether you're going long (buying) or short (selling). 

It includes a couple of pre-built functions to make this easier.

The `moonbag` function is a simple way to set a take profit level that's significantly above your entry price.

The `bracket` function gives you more control, allowing you to define your own take profit and stop loss percentages based on your risk tolerance. This function essentially calculates the specific price points for your bracket order.

## Class PersistStorageUtils

This class helps manage how signals are stored persistently, like saving them to files so you don't lose data. It's designed to be reliable, even if your program crashes unexpectedly.

It uses a clever system of caching to avoid repeatedly reading and writing data to disk.

You can even customize how the data is stored by providing your own storage adapter.

Each signal is saved as a separate file, making it easy to manage individual signal data.

The `readStorageData` method retrieves the saved signals, restoring their previous state when the backtest or live mode starts. It essentially loads everything back in.

`writeStorageData` handles saving changes to the signals, ensuring a safe and complete save, even if interruptions occur.

To change how data is saved, you can use `usePersistStorageAdapter` to register custom storage methods or `useJson` to revert to the standard JSON format, or `useDummy` for testing.

If you're changing your working directory, you might need to call `clear` to refresh the storage cache.

## Class PersistSignalUtils

This class, `PersistSignalUtils`, provides a way to reliably save and load signal data for your trading strategies. Think of it as a safe keeper for your strategy's current status.

It intelligently manages storage for each strategy, making sure data isn't lost.  You can even plug in your own custom storage methods if the built-in options don't quite fit.

The system automatically handles reading and writing data, and it’s designed to be resistant to crashes, making sure your signals remain protected. 

For example, when a strategy starts up, `readSignalData` retrieves any saved signal information. When the strategy changes a signal, `writeSignalData` immediately persists it.

`usePersistSignalAdapter` lets you swap out the default storage method with something specific to your needs.

If you need to refresh the storage, like when the working directory changes, `clear` will wipe the cache and start fresh. You can also easily switch between using a JSON file for storage, a dummy adapter that doesn’t save anything at all, or other adapters you define.

## Class PersistScheduleUtils

This class, PersistScheduleUtils, helps manage how your trading strategy's scheduled signals are saved and loaded, ensuring they don't get lost if something goes wrong. It keeps track of the storage locations for each strategy, allowing you to customize how the data is saved. It makes sure updates are handled safely and reliably, even if the program crashes unexpectedly.

The class provides tools to read existing scheduled signals when your strategy starts and to save new or updated signals as they occur. These operations are designed to be safe and prevent data loss.

You can also plug in your own storage methods using adapters, offering greater flexibility in how your data is persisted.  If you need to refresh the storage due to changes in the working directory, the `clear` function allows you to reset the cached storage. Finally, you can choose between a standard JSON format, a dummy adapter that ignores writes for testing purposes, or a custom storage method.

## Class PersistRiskUtils

This class, `PersistRiskUtils`, helps manage and save your active trading positions, particularly when dealing with different risk profiles. It’s designed to be reliable, even if your program unexpectedly crashes.

It keeps track of positions in a way that avoids data corruption by using atomic file writes.

Think of it as a safe place to store the details of your trades.

You can even customize how it stores this information using different adapters, or switch to a dummy adapter for testing purposes. 

The `readPositionData` function retrieves previously saved positions, while `writePositionData` saves the current state. It's important to clear the cache (`clear`) when your working directory changes, ensuring fresh storage.

## Class PersistRecentUtils

This class, `PersistRecentUtils`, is a helpful tool for keeping track of the most recent signals generated by your trading strategies. Think of it as a way to remember the latest actions taken, like buy or sell orders.

It automatically manages where this information is stored, organizing it by symbol (the asset being traded), the name of your strategy, the exchange used, and the timeframe of the data. It even lets you customize how that data is stored, like using JSON files or simply discarding the information for testing purposes.

The class protects against data loss. It utilizes atomic file writes, so any crashes during the writing process won’t corrupt the stored information.

Here's a quick rundown of what it offers:

*   **Persistent storage:** It makes sure your recent signals aren't lost.
*   **Customizable:** You can choose how the data is stored.
*   **Safe:**  It prevents data corruption even if something goes wrong.
*   **Easy management:**  It handles the details of reading and writing signals, so you don't have to.
*   **Cache clearing:** You can clear the storage cache whenever the working directory changes to ensure fresh storage instances.


## Class PersistPartialUtils

This class helps manage how your trading strategies remember their progress, specifically profit and loss levels. It’s designed to be reliable, even if your program crashes unexpectedly.

It keeps track of these levels for each strategy and trading symbol, using efficient and safe ways to store and retrieve them.  You can also customize how this information is stored.

Here's a breakdown of what it does:

*   It automatically manages the storage of partial data, creating unique instances for each trading symbol and strategy.
*   You have the option to use different "adapters" to change how the data is stored – like using JSON files or something else entirely.
*   When it saves data, it does so in a way that prevents corruption if your program crashes in the middle of the save.
*   It's used by the `ClientPartial` component to load and save your trading progress.

You can use these features:

*   Register a custom storage mechanism.
*   Clear the stored data cache.
*   Switch to using the built-in JSON storage.
*   Switch to a dummy storage that effectively ignores any writes – useful for testing.

## Class PersistNotificationUtils

This class provides tools for reliably saving and loading notification data, ensuring that your trading system's notifications are preserved even if things go wrong. It handles the storage automatically, managing individual notifications as separate files identified by their unique IDs.

You can customize how these notifications are stored by registering your own persistence adapters. 

The class provides methods to read existing notifications, which is how your system recovers its state after a restart, and to write new or updated notifications to disk safely. This writing process uses techniques to avoid data loss in case of crashes.

For testing or development purposes, there are also options to use a “dummy” adapter that simply ignores all write attempts or to revert to the default JSON-based storage. The internal cache of storage instances can be cleared when needed to ensure fresh storage is used, especially if the working directory changes during repeated strategy runs.

## Class PersistMemoryUtils

This class helps manage how memory data is saved and loaded persistently. It provides a way to store data related to signals and buckets, ensuring that the information isn't lost when the application restarts. It intelligently caches storage instances to improve performance and supports different methods for saving data, including using custom adapters or switching to a "dummy" adapter for testing purposes. The class also allows you to clear the cache and properly dispose of resources when signals are no longer needed, contributing to a clean and efficient system. Furthermore, you can list all the stored memory entries for a given signal and bucket, which is valuable for rebuilding data indexes.

## Class PersistMeasureUtils

This utility class helps manage how cached data from external APIs is stored persistently, like saving it to a file. It ensures that each set of cached data is handled separately and reliably. 

The system allows you to use different ways to store this data, including custom methods, and it handles writing and reading data in a safe and consistent way, even if the program crashes.

Here's a breakdown of what it offers:

*   **Reading and Writing:** Functions to read and write cached data to disk.
*   **Removal:** A way to mark cached data as removed without actually deleting the file, allowing it to be refreshed later.
*   **Customization:** You can swap in different storage methods based on your needs.
*   **Cleaning Up:** A method to clear the entire cache.
*   **Adapters:** Options to use a default JSON-based storage or a dummy adapter for testing (which simply ignores any data you try to save).
*   **Listing Keys:** The ability to list all the keys of data stored in a specific cache bucket.

## Class PersistLogUtils

This class, PersistLogUtils, helps manage how log data is saved and retrieved. It's designed to be reliable, even if the system crashes unexpectedly.

It uses a special system to make sure logs are stored safely, one entry at a time, and that reads and writes happen without errors.

You can customize how logs are saved by registering different adapters. 

The `readLogData` function loads all the saved log entries, while `writeLogData` saves new entries.

Sometimes, like when the working directory changes, you might need to clear the saved logs with the `clear` method. There are also options to switch between different storage methods, like using a standard JSON format or a dummy adapter that just throws away the data for testing purposes.

## Class PersistIntervalUtils

This component helps manage whether a trading interval has already fired. It keeps track of fired intervals in a special directory under `./dump/data/interval/`, essentially acting as a memory of what's been done.

The system uses files to represent interval status; a file’s existence signifies the interval has fired, while its absence means it hasn't.

You can read, write, and even "soft delete" (mark as removed) these interval records. A soft delete doesn't physically remove the file, but makes it so the system thinks the interval hasn't fired, triggering it again.

The framework allows you to customize how this persistence happens, letting you use different storage adapters, like switching to a JSON-based solution or even a dummy adapter that just throws away data for testing purposes.  There's also a way to clear out the internal cache of this data when needed.


## Class PersistCandleUtils

This utility class helps manage a cache of historical candle data for trading. It stores each candle as a separate file, organized by exchange, symbol, and time interval. The system checks if the entire set of requested candles is available in the cache before returning data, ensuring you only get complete datasets. 

The class provides a way to write validated candle data to persistent storage, ensuring that the candles are in the correct order and aligned with the requested time range. It uses atomic file operations to prevent data corruption.

You can customize how the data is persisted by registering different persistence adapters, or switch to a dummy adapter for testing purposes. It also includes a `clear` method to refresh the cache when the working directory changes.

## Class PersistBreakevenUtils

This class manages how breakeven data is saved and loaded from your computer's file system. It's designed to be reliable, ensuring that your breakeven states are stored safely, even if your program restarts.

It intelligently caches these storage instances, creating a new one only when needed for a specific combination of symbol, strategy, and exchange.  You can even customize how the data is stored, for example, using a different file format or adapter.

The class handles creating the necessary directories and files if they don't already exist, and makes sure that file writes are done securely to prevent data loss. If you ever want to reset the stored breakeven data, you can clear the cache, ensuring that new data is loaded or saved properly. Finally, you can switch between a standard JSON storage and a dummy adapter that does nothing to simulate or test without writing to the disk.

## Class PersistBase

`PersistBase` is a foundational class designed to handle saving and retrieving data to files, ensuring a reliable and safe process. It's specifically built for situations where you need to persist data like trading strategies or historical data.

It takes care of crucial details like safely writing files so they aren't corrupted, automatically checking and repairing any files that might be damaged, and providing a simple way to loop through all the data it manages.  It organizes your data into files, and the location where those files are stored is determined by the `baseDir` you provide during setup.

You provide a name for your data (`entityName`), and it calculates the precise file location for each piece of data (`entityId`). 

`waitForInit` sets up the storage area and validates the existing files, doing this only once.  The class provides methods to read data (`readValue`), check if data exists (`hasValue`), and write data (`writeValue`). It also provides an asynchronous generator (`keys`) to easily retrieve a list of all the data it is holding.

## Class PerformanceReportService

This service helps you understand where your trading strategies are spending their time. It acts like a detective, carefully recording how long different parts of your strategy take to run.

Think of it as a listener, constantly monitoring for performance events.  When it detects one, it logs the details, including how long the operation took and any relevant information.

It stores this data for later analysis, allowing you to pinpoint bottlenecks and optimize your strategy’s efficiency.

You can easily start using this by subscribing to the service, and to stop it you just call the unsubscribe function that's returned when you subscribe.  If you aren't subscribed, the unsubscribe function simply does nothing.

## Class PerformanceMarkdownService

This service is designed to help you understand how your trading strategies are performing. It gathers data about your strategies as they run, tracking key metrics.

It organizes this information by symbol, strategy, exchange, timeframe, and whether it’s a backtest. Each combination of these factors gets its own set of data.

You can subscribe to receive performance updates and then unsubscribe when you’re finished. The `track` method is the core of data collection, and it's meant to be used within your trading logic to send performance information. 

It provides ways to retrieve aggregated statistics, such as averages, minimums, maximums, and percentiles. It can also generate a well-formatted markdown report which includes an analysis to pinpoint performance bottlenecks. These reports are saved to your logs directory for later review. You have control over where these reports are stored and what data they include.

Finally, it allows you to clear the collected performance data when you want to start fresh.


## Class Performance

The Performance class helps you understand how well your trading strategies are performing. It allows you to gather performance statistics for specific symbols and strategies, giving you a breakdown of key metrics like how long operations take, their average duration, and volatility.

You can request a comprehensive report that’s formatted in Markdown, which highlights areas where performance might be slowing down, through percentile analysis.

The class also has functionality to save these reports directly to your computer, creating a convenient record of your backtest results. You can specify a custom path for the saved report, or it will default to a location within your project's directory. 

Finally, it includes a method to clear accumulated metrics if you're starting fresh or want to reset your analysis.

## Class PartialUtils

PartialUtils helps you analyze and understand the smaller, partial profit and loss events that occur during a trading simulation or live trading. It acts as a central hub for gathering and presenting this information.

You can request summary statistics, like the total number of profit and loss events, for a specific trading symbol and strategy.

It also creates detailed markdown reports that list individual profit/loss events, showing things like the symbol traded, strategy used, price, and whether it was a profit or loss. This report includes a table of events and important summary information.

Finally, PartialUtils can automatically generate and save these markdown reports as files on your computer, making it easy to review and share your trading performance data.  The file names clearly indicate the symbol and strategy they represent.

## Class PartialReportService

The PartialReportService helps you keep track of when your trades partially close, whether it's for a profit or a loss. It listens for these "partial exit" events and records them, along with the price and level at which they happened.

Think of it as a way to monitor how your positions are being reduced over time, capturing each step of the process.

You can easily set it up to receive these events, and it makes sure you don't accidentally subscribe multiple times. When you’re done, you can unsubscribe to stop receiving those events. 

It uses a logger for any debugging information and relies on another component (`ReportWriter`) to actually save the data. The `tickProfit` and `tickLoss` properties handle processing profit and loss events respectively, and ensures the data gets written to the database.


## Class PartialMarkdownService

This service helps generate and store reports detailing partial profits and losses during trading. It listens for events indicating profits or losses, keeping track of them for each trading symbol and strategy you're using. 

It then organizes this information into easy-to-read markdown tables, providing a summary of the trading activity and overall profit/loss statistics. 

The reports are saved to disk, allowing you to review your trading performance over time.

You can subscribe to receive these events, and unsubscribe when you no longer need them. You can also request data and reports for specific symbol-strategy combinations, or clear the accumulated data when needed. There's a dedicated storage system ensuring data isolation for each symbol and strategy.

## Class PartialGlobalService

The PartialGlobalService acts as a central hub for managing partial profit and loss tracking within your trading strategy. It's designed to streamline how your strategy interacts with the underlying connection layer, ensuring consistent logging and validation.

Think of it as a middleman that sits between your strategy and the connection service, handling tasks like logging and validating data before passing it along.

This service is injected into your strategy, making it easy to manage and monitor partial profit/loss events.  It provides a centralized logging point, allowing you to keep track of what’s happening at a high level.

Several validation services are available for checking the existence of strategies, risks, exchanges, and frames, which are memoized to improve efficiency.

The `profit`, `loss`, and `clear` methods handle the actual profit, loss, and signal closure events, respectively, by logging the operation and then forwarding the request to the connection service.

## Class PartialConnectionService

The PartialConnectionService is a tool that keeps track of partial profits and losses for each trading signal. It's like a central manager for these smaller, individual profit/loss records.

It creates and manages "ClientPartial" objects, which hold the details of each partial profit/loss, ensuring there's only one for each signal. These ClientPartial objects are stored in a clever way so they're quickly accessible when needed.

When a profit or loss occurs, the service figures out which ClientPartial is responsible and asks it to update its records. When a signal is closed, the service cleans up those records, freeing up resources and preventing clutter.

Essentially, this service handles the behind-the-scenes work of keeping track of those in-between profit and loss figures, so the rest of the system can focus on executing trades. It's injected into the larger trading strategy to make this tracking happen.

## Class NotificationLiveAdapter

This component helps you send notifications about your trading strategies, offering flexibility in how those notifications are delivered. It uses a design pattern that lets you easily swap out different notification methods without changing the core logic.

By default, it keeps notifications in memory, but you can switch to persistent storage (saving them to disk) or use a "dummy" adapter that simply ignores notifications for testing purposes.

It provides methods like `handleSignal`, `handlePartialProfit`, and others to deal with specific events during backtesting, forwarding them to the currently selected notification adapter. You also have convenience functions like `useDummy`, `useMemory`, and `usePersist` to quickly change the notification backend.

The `getData` method retrieves all the notifications that have been captured, while `dispose` clears them. If your working directory changes, use the `clear` method to reset the adapter to its default in-memory state, ensuring a fresh start. Finally, the `useNotificationAdapter` method gives advanced control, allowing you to specify your own custom notification adapter.

## Class NotificationHelperService

This service helps manage and send out notifications about signals within the trading framework. It's designed to make sure everything is validated before sending those notifications.

Think of it as a helper for ensuring the system has checked all its bases—strategy, exchange, frame, risk, and actions—before broadcasting a signal. It does this validation only once for each combination of strategy, exchange, and frame.

The primary function is `commitSignalNotify`, which is used to actually trigger those notifications. It gathers information about the signal, validates everything, and then sends out a notification that can be received and processed by other parts of the system. It's essentially a central point for ensuring signals are handled correctly and communicated effectively.

## Class NotificationBacktestAdapter

The `NotificationBacktestAdapter` helps you send out notifications during your backtesting process, like when a signal is triggered or a partial profit is realized. It's designed to be flexible, allowing you to easily switch between different ways of handling these notifications.

By default, it stores notifications in memory, but you can easily change it to persist them to disk or simply ignore them entirely using a dummy adapter. This makes it suitable for different backtesting scenarios, from simple local tests to more complex setups.

The adapter provides methods to handle various events – signals, profits, losses, errors, and more – passing along relevant data. You can also get a list of all stored notifications or clear them out completely. The `use...()` methods (like `usePersist`, `useMemory`, `useDummy`) make it simple to change the notification backend on the fly, and `clear` ensures a fresh start if your working directory changes.

## Class NotificationAdapter

This component is responsible for handling notifications, both during backtesting and in live trading environments. It automatically keeps track of notifications as they happen, ensuring you don't miss important updates. 

To make sure you don’t accidentally get duplicate notifications, it uses a special mechanism that only subscribes once.

You can use its `enable` property to start listening for notifications, and `disable` to stop. 

The `getData` property lets you retrieve all notifications, specifying whether you want the backtest or live data. Finally, the `dispose` property clears out all stored notifications, providing a clean slate when you’re finished.

## Class MemoryAdapter

The MemoryAdapter helps manage and store data associated with specific signals and buckets, ensuring efficient memory usage. It acts as a central point for accessing and manipulating this data.

This adapter automatically creates and manages instances of memory storage, remembering which ones are in use and avoiding unnecessary duplication. You can easily switch between different storage methods – a fast in-memory option, a persistent file-based storage, or even a dummy adapter for testing.

To start using the adapter, you need to activate it, which links it to the lifecycle of your signals.  When a signal ends, it automatically cleans up the related memory.  You can deactivate it when you're done.

The adapter provides methods for writing, reading, searching, listing, and deleting data from memory. It uses a search technology called BM25 to find relevant data.

If you're switching locations in your project (like changing the current working directory), it's a good idea to clear the adapter's memory to ensure fresh instances are created. Finally, you can release the adapter’s resources when it's no longer needed.

## Class MaxDrawdownUtils

This class offers tools to help you analyze and understand maximum drawdown events in your trading strategies. It acts like a central hub for information gathered about these drawdown events.

You can use it to get statistical data summarizing drawdown performance for specific symbols and strategies.

The class can also generate a detailed markdown report outlining all the drawdown events that have occurred. This report can be customized to show specific columns of data.

Finally, it provides a way to automatically save these markdown reports as files, making it easy to share or archive your drawdown analysis.

## Class MaxDrawdownReportService

This service focuses on tracking and recording maximum drawdown events during backtesting. It monitors a specific data stream (`maxDrawdownSubject`) and diligently saves drawdown records to a JSONL database, which is useful for later analysis.

Think of it as a system that automatically logs significant drops in your trading performance.

Each time a new drawdown is detected, the service captures a detailed snapshot of the situation – including timestamps, symbols, strategy names, order details, and prices – and writes this information to the database.

To start logging, you need to subscribe to the data stream, and the service ensures you only subscribe once, preventing duplicate registrations. 

To stop tracking, you can unsubscribe, which gracefully disconnects the service from the data stream and stops the logging process.

## Class MaxDrawdownMarkdownService

This service helps you create and store reports about maximum drawdown, which is a key measure of risk in trading. It keeps track of drawdown data for different trading setups – like specific symbols, strategies, exchanges, and timeframes. 

You can start and stop it from receiving updates (subscribe and unsubscribe) and it will gather information as it receives events. The `getData` method allows you to retrieve the accumulated drawdown statistics for a specific trading scenario.  You can then generate a formatted markdown report using `getReport` or save that report directly to a file with `dump`.  Finally, the `clear` function gives you the option to completely wipe all accumulated data or selectively clear data for specific symbol-strategy-exchange-frame combinations.

## Class MarkdownWriterAdapter

This component helps manage how your trading reports are saved, offering flexibility in where and how they're stored. It acts as a middleman, letting you easily switch between different storage methods like saving each report as a separate file, combining them into a single log file, or even turning off report generation entirely.  The system remembers which storage method you're using so you don't have to reconfigure it.

You can choose to save reports as individual markdown files using the default setup, or opt for a centralized, append-only JSONL log. There's also a "dummy" option that effectively turns off markdown output for testing or when you don't need it.  

You can change the underlying method used to write the markdown files, or completely disable them. The system automatically handles creating the necessary storage when you first write a report of a particular type. 

If you change your working directory during a strategy run (like when iterating through different strategies), you might need to clear the cache to ensure the storage is reinitialized with the correct path.

## Class MarkdownUtils

MarkdownUtils helps you control which parts of the backtest-kit framework generate markdown reports. It lets you turn on and off reporting for things like backtests, live trading, strategy performance, and more.

You can selectively enable markdown reporting for specific areas, and when you do, it starts gathering data and preparing reports. Importantly, when you enable reporting, you *must* remember to unsubscribe from those services later to avoid problems.

If you need to stop generating reports for just certain aspects of the system, you can disable them individually.  This gives you fine-grained control over what gets reported.

Finally, if you want to start fresh with a clean slate of data for a particular report, you can clear the accumulated data without stopping the reporting process entirely.

## Class MarkdownFolderBase

This adapter is designed for creating well-organized, human-readable reports where each report is stored in its own separate markdown file. Think of it as the standard way to generate reports. 

It automatically creates the necessary directories to hold your reports, and it constructs the file name based on the paths and file names you define. 

Because it writes files directly, there's no need for any special setup or initialization. It’s straightforward and perfect for situations where you want to easily browse and review your backtesting results. 

You specify the type of markdown target being used when you create the adapter. 

The `dump` method is how you actually write the markdown content to the individual files, handling the directory structure and file naming for you.

## Class MarkdownFileBase

This class provides a way to write markdown reports as JSONL (JSON Lines) entries to a specific file. Think of it as a specialized logger for your markdown outputs. It's designed to handle large amounts of data efficiently and reliably.

Each report type gets its own file, making it easier to organize and process. The system ensures that the files are created automatically and that writing operations are protected against timeouts, preventing data loss.

The `dump` method is your primary tool for writing reports. It takes the markdown content, along with search metadata like the symbol and strategy name, and formats it into a JSONL line. The `waitForInit` method ensures the file and stream are ready before you start writing, though calling it multiple times is safe. It’s built for centralized logging and integrating with tools that work with JSONL data.

## Class MarkdownAdapter

The MarkdownAdapter helps manage how your markdown files are stored, offering flexibility by letting you choose different storage methods. You can easily switch between storing each markdown entry as a separate file, or appending them all to a single JSONL file. It's designed to be efficient, creating storage instances only when needed and remembering them for later use.  If you just want to test things out without actually writing any data, you can even use a dummy adapter that does nothing. Setting a custom adapter is done with `useMarkdownAdapter`, and there are convenient shortcuts, `useMd` and `useJsonl`, to quickly switch between common storage styles.

## Class LoggerService

The LoggerService helps ensure all logging within the trading framework is consistent and provides valuable context. It acts as a central point for logging, automatically adding important details like the strategy, exchange, and execution information to each log message. You can customize the logging behavior by providing your own logger implementation through the `setLogger` function. If you don't specify a logger, it uses a basic "no-op" logger, meaning no logs are actually recorded.

The service relies on two helper services, `methodContextService` and `executionContextService`, to gather the contextual information and inject it into the logs.  It offers methods like `log`, `debug`, `info`, and `warn` for different logging levels, all providing that automatic context enrichment.  Essentially, it simplifies the process of writing useful and informative logs within your trading strategies.


## Class LogAdapter

The `LogAdapter` provides a flexible way to manage logging within your backtesting framework. It allows you to easily switch between different logging methods, such as storing logs in memory, saving them to a file, or completely disabling logging. The default behavior is to keep logs in memory, but you can easily change this.

You can use the `usePersist()`, `useMemory()`, `useDummy()`, and `useJsonl()` functions to change the logging mechanism. `useJsonl()` is particularly useful for saving logs to JSONL files. The `useLogger()` function lets you define your own custom logging adapter.

The `clear()` function is helpful for resetting the logging adapter, especially when your strategy environment changes.  You can access all logged information with `getList()`, and there are dedicated methods for different logging levels like `log()`, `debug()`, `info()`, and `warn()` which all send messages to the currently selected adapter.

## Class LiveUtils

The `LiveUtils` class provides tools for running live trading strategies, handling potential crashes, and retrieving key position data. It acts as a central point for live trading operations, simplifying access to the underlying services.

Here's a breakdown of its functionality:

*   **Running Live Trades:** It lets you start a live trading session for a specific symbol and strategy, with automatic recovery from crashes thanks to persistent state.  You can also run a trade "in the background," where results are consumed without being directly displayed.
*   **Getting Signal Information:** You can retrieve details like the current pending or scheduled signal, whether signals exist at all, and various metrics about a position's performance (cost basis, PnL, open price, etc.).
*   **Position Management:**  Functions are available to manage the current active position: you can move stop-loss or take-profit levels, add new DCA entries, or take partial profits/losses.
*   **Reporting & Data:** It offers ways to generate reports on trading activity, dump data to disk, and list all active live trading instances.  You can also request data statistics.
*   **Signals Control:** You can activate a scheduled signal or force the immediate closure of a pending signal.

Essentially, `LiveUtils` is a helper class that streamlines and enhances the live trading process.

## Class LiveReportService

LiveReportService is designed to keep a detailed record of your trading activity as it happens, storing everything in a SQLite database. It tracks the entire life cycle of your trading signals, from when they're just waiting to be used, to when they're active and then finally closed.

This service listens for those trading events and diligently logs them, including all the important details. It handles all the different types of events you might encounter.

You can think of it as a real-time monitoring tool, letting you analyze how your strategies are performing while they're live.

To get it working, you’ll use the `subscribe` method, which connects to the signal events. It makes sure only one subscription happens at a time, preventing unwanted behavior. `unsubscribe` will then disconnect it. The `loggerService` property is useful to help debug the process.

## Class LiveMarkdownService

The LiveMarkdownService helps you automatically create reports about your live trading activity. It listens for updates from your trading strategies, like when a trade is opened, active, or closed, and carefully records all the details. These details are then organized into easy-to-read markdown tables, including key statistics like win rate and average profit.

You can configure where these reports are saved, usually in a `logs/live` directory, with each report named after your strategy.

Here’s a breakdown of what it does:

*   **Subscribes to events:** It connects to your trading system to receive real-time updates on what's happening with your strategies.
*   **Tracks events:** It keeps track of every step in the trading process – from idle periods to when trades are opened, active, and finally closed.
*   **Generates reports:**  It compiles all this information into markdown files, providing a clear summary of your trading activity.
*   **Provides statistics:**  It calculates and includes important trading statistics to help you analyze your performance.
*   **Stores data:** It uses a storage system to manage all the event data, ensuring that information for each strategy and trading setup is kept separate.
*   **Clears data:** It can clear out the recorded data, either for a specific trading setup or for everything.



You can get the collected data, generate reports, and save them to disk. If you want to stop listening for events, you can easily unsubscribe.

## Class LiveLogicPublicService

This service helps manage and run live trading sessions, simplifying the process by automatically handling the context needed by your trading strategies. Think of it as a manager that ensures your strategies always have the right information about the trading symbol, strategy name, and exchange.

It provides a continuous stream of trading signals (open, close, or cancelled) as an ongoing process, designed to run indefinitely.

If something goes wrong and the process crashes, it's built to recover and continue from where it left off, preserving your progress.

The `run` method is the key to starting a live trading session for a specific symbol. It automatically handles context and provides a steady stream of trade signals, making it easy to integrate your strategies without manual context management.


## Class LiveLogicPrivateService

This service manages live trading operations, continuously monitoring and reacting to market changes. It operates as an ongoing process, checking for new trading signals at regular intervals. 

The core functionality involves an infinite loop that creates a timestamp, evaluates signals, and then produces results – specifically when trades are opened or closed.  It’s designed to be very efficient with memory, streaming data instead of storing everything.

If the process encounters an issue and crashes, it will automatically recover its state.  The `run` method is how you kick off the live trading for a specific symbol, and it returns a stream of results you can work with.

## Class LiveCommandService

This service acts as a gateway to the live trading functionality within the backtest-kit framework. It’s designed to be easily integrated into your application using dependency injection.

Essentially, it simplifies interaction with the underlying live trading logic. 

The `run` method is the core function; it initiates and manages live trading for a specified symbol.  It continuously generates results—either indicating an opened position, a closed position, or a cancelled trade—and automatically attempts to recover from any crashes during the trading process. You provide the strategy and exchange names to contextualize the trades.


## Class IntervalUtils

IntervalUtils provides a way to control how often certain functions are executed, ensuring they only run once per specified time interval. Think of it as a gatekeeper for your functions, preventing them from running too frequently.

It offers two modes of operation: a simple in-memory version (`fn`) that keeps track of its state in the program's memory, and a more robust file-based version (`file`) that persists the state to disk, ensuring it survives restarts.

The `fn` function lets you wrap a function to make it fire only once per interval. It's handy for tasks that shouldn't be repeated within the same time window.

The `file` function does the same, but also saves the firing state to a file, so your signal remains active even if the program is restarted.

To clean up and free resources, you can use `dispose` to remove a function's tracking or `clear` to wipe out all tracking for all functions. `resetCounter` ensures new intervals start at zero when the working directory changes. It’s a singleton, meaning you access it through `Interval` for simplicity.

## Class HighestProfitUtils

This class helps you understand and analyze your highest profit trading results. Think of it as a central place to pull information about the most profitable trades you've made. 

It's designed to work with data collected from events, allowing you to see detailed statistics and reports.

You can use it to:

*   Get specific statistical data for a particular trading symbol, strategy, exchange, and timeframe.
*   Generate markdown reports outlining all highest profit events for a given combination of symbol and strategy.
*   Save those markdown reports directly to a file.



Essentially, it makes it easier to review and understand your best-performing trades.

## Class HighestProfitReportService

This service is designed to keep track of your most profitable trades and store that information for later analysis. It's essentially a listener that watches for new "highest profit" moments happening in your trading strategies.

Whenever a new highest profit is achieved, the service captures all the important details – like the timestamp, symbol, strategy name, exchange, frame, and backtest – along with specific information about the trade itself such as the position, current price, and take profit/stop loss levels.

These details are then saved as records in a special "highest_profit" database, allowing you to review and learn from your best-performing trades.

To begin recording these profit events, you need to subscribe to the service.  The first time you subscribe, it starts listening for those profit signals. If you try to subscribe again, it simply gives you back the way to stop listening, rather than subscribing multiple times.

When you're done collecting data, you can unsubscribe, which stops the service from writing any more profit records.


## Class HighestProfitMarkdownService

This service helps you create and save reports detailing the highest profit events for your trading strategies. It listens for incoming data about these profitable trades and organizes them based on the symbol, strategy, exchange, and timeframe you specify.

You can subscribe to receive these profit events, and the system ensures you don’t accidentally subscribe multiple times.  Unsubscribing completely clears all stored data and stops the service from listening.

Each time a new profitable trade occurs, the service processes it and stores the details. You can then retrieve the accumulated statistics for a specific symbol, strategy, exchange, timeframe, and whether it's a backtest or live trade.  Generating a report is easy – it produces a formatted markdown document that shows the most recent events and the total number of events recorded.

You can also automatically save these reports to disk, with filenames that clearly indicate the symbol, strategy, exchange, timeframe, and whether it's a backtest.  Finally, you can clear the stored data – either for a specific combination of symbol, strategy, exchange, and timeframe, or to clear everything entirely.

## Class HeatUtils

HeatUtils helps you create and manage portfolio heatmaps, providing insights into your trading strategy’s performance. It simplifies the process of gathering and displaying statistics for each symbol and overall portfolio. Think of it as a tool to visualize how different assets contribute to your strategy's success.

You can easily retrieve heatmap data for a specific strategy, showing metrics like total profit, Sharpe ratio, maximum drawdown, and trade counts for each symbol. This data is pulled from all closed signals associated with the strategy.

It also lets you generate a nicely formatted markdown report that summarizes this data in a table, sorted by total profit. You can customize which columns are shown in the report.

Finally, you can save these reports directly to your hard drive, with HeatUtils creating the necessary folders if they don't already exist. The reports will be named after your strategy, making them easy to find and share.

## Class HeatReportService

This service helps you track and analyze your trading performance by recording every time a signal closes, including the profit or loss. It listens for those closing signals across all your assets and carefully stores the details in a database.

The service’s primary job is to log closed signals along with their associated profit and loss data. It avoids logging other types of signal actions to keep the data focused on what matters most - closed trades. 

You can easily start and stop this data collection process. When you want to start logging, the `subscribe` method connects to the signal feed. When you're done, the `unsubscribe` method cleanly disconnects and stops the logging. It’s designed to prevent accidental multiple subscriptions, ensuring a clean data stream.


## Class HeatMarkdownService

This service helps you visualize and understand the performance of your trading strategies by creating a heatmap. It listens for completed trades and aggregates data, providing both overall portfolio metrics and detailed breakdowns for each individual symbol.

It keeps track of data separately for each exchange, timeframe, and backtest mode, ensuring that your analysis is isolated and accurate. You can subscribe to receive updates in real-time and then unsubscribe when you no longer need them.

You can request the aggregated data, generate a markdown report to share your results, or save the report directly to a file. If you want to start fresh with your data, you can clear the stored information for a specific combination of exchange, timeframe, and mode, or clear everything to start completely over. The service also handles calculations safely, avoiding issues with potentially problematic values like NaN or Infinity.

## Class FrameValidationService

This service helps you keep track of and ensure the validity of your trading timeframes, also known as frames. It's like a central manager for all your frame configurations. 

You can use it to register new timeframes with specific details using `addFrame()`. 

Before running any operations that rely on a particular timeframe, `validate()` checks to make sure it exists and is properly set up, preventing potential errors.

To boost performance, the service remembers the results of these validation checks. Finally, `list()` provides a way to see all the frames you've registered.

## Class FrameSchemaService

This service is responsible for keeping track of different "frame" schemas, which are essentially blueprints for how your backtesting data is structured. It uses a special registry to store these schemas in a type-safe way, ensuring everything is consistent.

You can add new frame schemas using the `register` method, providing a unique name and the schema definition. Similarly, `override` lets you update existing schemas, allowing you to make changes without replacing the entire definition.

If you need to access a specific frame schema, use the `get` method, providing its name to retrieve it. Before a schema is officially registered, it's checked with `validateShallow` to make sure it has all the necessary elements in the right format.

## Class FrameCoreService

FrameCoreService is a central tool within the backtest-kit, responsible for handling the timeframes used in your backtesting scenarios. It works closely with the FrameConnectionService to fetch and manage these timeframes, acting as a foundational element for the entire backtesting process. Think of it as the engine that provides the sequence of dates your strategy will be tested against. 

It's primarily used behind the scenes by the BacktestLogicPrivateService, so you typically won't interact with it directly.

The core function, `getTimeframe`, lets you request a specific array of dates for a given trading symbol and timeframe name (like "1h" or "1d"). This is what powers the iterative testing of your trading strategy across different points in time.


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different frame implementations within the backtest-kit. It automatically routes requests to the correct frame based on information provided in the method context.

To improve performance, it uses a clever caching system to store and reuse these frame instances, avoiding unnecessary creation.

This service also handles the backtest timeframe, allowing you to specify a start and end date and the interval for your simulations.

When operating in live mode, the frame name is empty, indicating no frame constraints are applied. 

The `getFrame` function is your main entry point for accessing frame implementations, while `getTimeframe` retrieves the boundaries of your backtest period for a given symbol. It relies on `loggerService`, `frameSchemaService` and `methodContextService` to do its job.

## Class ExchangeValidationService

The ExchangeValidationService helps you keep track of your trading exchanges and make sure they're set up correctly before you start trading. Think of it as a central hub for managing your exchange configurations.

It allows you to register new exchanges, making sure they're known to the system. Before any trading actions, you can use it to double-check that an exchange actually exists, preventing errors.

This service remembers the results of its checks, so it's efficient and doesn't have to repeat validation work unnecessarily. 

You can also get a simple list of all the exchanges you’ve registered. 

The service utilizes a logger for recording important events, and an internal map to manage registered exchanges.

## Class ExchangeUtils

The ExchangeUtils class is designed to simplify interactions with different cryptocurrency exchanges. It acts as a central hub for common operations, ensuring data is retrieved and formatted correctly for each exchange. Think of it as a helper that handles the complexities of each exchange's specific rules and data structures.

It uses a special system to manage instances for each exchange, preventing conflicts and ensuring everything runs smoothly.

Here's what it can do:

*   It can retrieve historical price data (candles) for a given trading pair and timeframe.
*   It calculates the average price of an asset based on recent trading activity.
*   It can format trade quantities and prices to conform to each exchange's specific rules, preventing errors.
*   It provides access to real-time order book data.
*   It fetches aggregated trade data to understand market activity.
*   It retrieves raw candle data, allowing for custom time ranges to be specified. 

The class is designed to be easy to use and consistent, making it a valuable tool for anyone working with multiple exchanges.

## Class ExchangeSchemaService

This service helps keep track of information about different cryptocurrency exchanges, ensuring that the data used for backtesting and trading is consistent and reliable. 

It uses a special system for storing this information in a type-safe way, preventing errors caused by incorrect data types.

You can add new exchanges using `addExchange()` and find them later by their name using `get()`.

Before an exchange's details are added, `validateShallow()` quickly checks that it has all the necessary pieces of information.

If you need to update existing exchange data, `override()` lets you make partial changes without replacing everything. 

The service also has an internal registry (`_registry`) and a logger (`loggerService`) for internal operations and debugging.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for interacting with exchanges within the trading framework. It intelligently combines exchange connection details with information about the current trading scenario, like the specific symbol being traded and the time period being analyzed. 

Think of it as a facilitator – it handles the details of communicating with the exchange while making sure the right context is provided for each request.

It has several key functions:

*   Retrieves historical candle data (price charts).
*   Can also fetch future candle data specifically for backtesting scenarios.
*   Calculates average prices (VWAP).
*   Formats price and quantity values according to exchange-specific rules.
*   Obtains order book information to understand current market depth.
*   Retrieves aggregated trade data to analyze trading activity.
*   Offers a method to get raw candle data, allowing for flexible date ranges and limits.

Validation checks are performed to ensure proper exchange configuration, and these checks are cached to prevent repeated work. This service is a core component, used internally by other parts of the system to manage exchange interactions.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It automatically directs requests to the correct exchange based on the currently active context, simplifying your backtesting and trading logic. It's designed to be efficient, remembering previously used exchange connections to avoid repeated setup.

This service provides methods for retrieving historical and future candle data, calculating average prices (using real-time data or VWAP in backtesting), and accessing order books and trade history. It also ensures that prices and quantities are formatted correctly to adhere to each exchange's specific rules. When you need to fetch data or execute actions related to a particular exchange, this service handles the complexities behind the scenes.

## Class DumpAdapter

The DumpAdapter acts as a central point for saving different types of data during a backtest, like messages, records, tables, and errors. It allows you to choose where this data is stored – the default is to create individual markdown files, but you can also use memory storage, discard the data entirely (dummy mode), or provide your own custom storage solution.

Before you start dumping data, you need to "enable" the adapter, which subscribes it to signal lifecycle events and helps avoid memory leaks by cleaning up old data when signals are finished.  Conversely, "disable" stops this monitoring.

The adapter provides methods like `dumpAgentAnswer`, `dumpRecord`, `dumpTable`, `dumpText`, and `dumpJson` for saving specific types of information. You can switch between storage backends using methods like `useMarkdown`, `useMemory`, `useDummy`, or `useDumpAdapter` to inject your own implementation.  If the underlying working directory changes, use `clear` to ensure fresh instances are used.

## Class ConstantUtils

This class provides a set of constants that are helpful for setting up take-profit and stop-loss levels in your trading strategies. These levels are calculated using a method inspired by the Kelly Criterion and a system of exponential risk decay. Essentially, they’re designed to help you manage your risk and lock in profits progressively as a trade moves in your favor.

The constants define different stages for both take-profit and stop-loss triggers, each representing a percentage of the total distance to the ultimate target. For example, TP_LEVEL1 triggers when the price reaches 30% of the distance to your final take-profit, while SL_LEVEL1 activates at 40% of the distance to the stop-loss. This allows for a staged approach to taking profits and limiting losses, adapting to the evolving potential of the trade.

## Class ConfigValidationService

This service helps ensure your trading configuration is mathematically sound and has the potential to be profitable. It meticulously checks various settings within the global configuration to catch potential errors or unrealistic setups. 

The validation process focuses on several key areas: it makes sure percentages like slippage and fees are non-negative, confirms that the minimum take-profit distance adequately covers all costs, and verifies logical relationships between parameters like stop-loss distances. 

It also checks time-related settings and constraints on how data is processed. Ultimately, this service helps you avoid setting up configurations that are mathematically incorrect or destined for losses. It's a safeguard to help you build robust and reliable trading strategies.

## Class ColumnValidationService

The ColumnValidationService helps keep your column configurations clean and reliable. It’s designed to catch errors early by making sure your column definitions follow specific rules.

Essentially, it checks your column settings to ensure they’re properly structured, complete, and consistent. It makes sure all necessary information like the column's identifier, display name, formatting instructions, and visibility settings are present.

The service verifies that keys and labels are strings, and that functions are provided for formatting and visibility. It also guarantees that each column has a unique identifier.

By using this service, you can avoid problems down the line caused by incorrect or incomplete column definitions.

## Class ClientSizing

ClientSizing helps determine how much of an asset to trade based on your strategy's needs. It’s designed to be flexible, allowing you to use different sizing approaches like fixed percentages, Kelly criterion, or Average True Range (ATR). 

You can set limits on the maximum or minimum position size, and also control the maximum percentage of your capital that can be used for a single trade. 

This component also allows for custom callbacks so you can validate sizing calculations or log relevant information. Essentially, it takes into account your strategy’s instructions and turns them into concrete trade sizes.

The `calculate` method is the core functionality – it's what you use to actually get the position size based on the inputs you provide.


## Class ClientRisk

ClientRisk helps manage risk across your entire portfolio, acting as a safety net for your trading strategies. It’s like a central authority that checks if a new trading signal aligns with your predefined limits.

It keeps track of all active positions across strategies to ensure you're not exceeding maximum position limits or violating other custom risk rules. Think of it as a way to prevent accidentally over-leveraging or taking on too much risk.

This component is used when executing strategies to make sure signals are validated before trades are placed. It offers flexibility to incorporate custom validations, allowing you to tailor risk checks to your specific needs and access detailed information about active positions.

ClientRisk instances are shared among multiple strategies, allowing for a broader view of your portfolio's risk profile.

It maintains a record of all active positions and automatically updates this information, but this persistence is skipped during backtesting.

You can add signals as they’re opened and remove them when they're closed, ensuring the system always has an accurate picture of your trading activity.

## Class ClientFrame

The ClientFrame is responsible for creating the sequences of timestamps used during backtesting, essentially laying out the timeline for your tests. It avoids repeating the work of generating these timestamps by using a caching system. You can control how far apart these timestamps are, choosing intervals from one minute to one day.

It also allows you to hook in custom functions to check the validity of the generated timestamps or record information about their creation. This component works behind the scenes, powering the core backtesting engine.

The `getTimeframe` property is the key method here – it's how you request a timeframe array for a specific trading symbol and it remembers the results so you don't have to recalculate them every time. You can clear this cache if you need to regenerate the timeframe.

## Class ClientExchange

This class, `ClientExchange`, acts as a bridge to get data from an exchange, designed specifically for backtesting and trading. It provides ways to retrieve historical and future price data (candles), calculate the volume-weighted average price (VWAP), and format quantities and prices according to the exchange's rules.

It offers methods to fetch candles, both looking back in time and forward, which is useful for simulating trading scenarios. You can request candles for a specific time range, and the system automatically adjusts the starting point to align with the candle interval.

Calculating the VWAP involves averaging prices based on traded volume, providing insight into price trends. Quantity and price formatting ensures the data is presented in a way that adheres to exchange standards.

The `getRawCandles` method offers a lot of flexibility for retrieving candles, allowing you to specify start and end dates, or just a number of candles to retrieve, always preventing any data from the future being used.  Finally, you can fetch order book and aggregated trades data, respecting time constraints to avoid look-ahead bias.

## Class ClientAction

ClientAction is the central component for managing and running your custom action handlers within the backtest-kit framework. Think of it as a smart manager that takes care of setting up, running, and cleaning up after your handlers.

It’s responsible for initializing your handlers, routing different types of events (like trading signals or breakeven updates) to the right places within your handler, and ensuring everything is properly disposed of when it's no longer needed. 

Your action handlers are where you’ll put your custom logic, such as managing your application's state, logging events, sending notifications (like to Telegram or Discord), or tracking performance metrics. The ClientAction makes sure these handlers are integrated seamlessly with the rest of the backtest-kit system.

It provides several methods for handling specific events: `signal` for general events, and more specialized methods like `signalLive`, `signalBacktest`, `breakevenAvailable`, `partialProfitAvailable`, `pingScheduled`, and others to deal with different monitoring scenarios.  `signalSync` is a special gateway for synchronizing position management via limit orders.

## Class CacheUtils

CacheUtils offers a handy way to automatically cache the results of your functions, especially those used in trading strategies. Think of it as a way to avoid repeating expensive calculations.

It works by wrapping your functions, so they remember previous results based on the timeframe you specify (like hourly, daily, etc.).  This means if you call the same function with the same input data, it will return the cached result instantly instead of re-running the function.

For asynchronous functions that need to store results persistently, `file` provides a similar feature using file-based caching.  This stores the results on disk, making them available even if the application restarts. File caches are organized under a specific directory structure, ensuring they're isolated and easy to manage.

If you need to completely remove the cached data for a function, `dispose` allows you to clear the cache and force a fresh execution.  `clear` resets all caching, while `resetCounter` deals with file caching index management when your working directory changes.



It's designed as a single, shared instance (`CacheUtils`), so you don't need to worry about creating or managing multiple instances.

## Class BrokerBase

This class, `BrokerBase`, provides a foundation for connecting your trading strategy to a real-world exchange. Think of it as a template for building your own custom broker adapter. It handles a lot of the boilerplate work for you, providing default implementations for common tasks like placing orders, updating stop-loss levels, and recording trades.

The lifecycle involves a few key steps: first, initialization where you’d set up your exchange connection; then, a series of event methods are called as your strategy runs, triggering actions like opening, closing, or partially adjusting positions.

You don’t need to implement every method – the defaults log information about what’s happening, so you can focus on the parts that are specific to the exchange you’re working with. This includes things like placing and canceling orders, tracking your positions, and sending notifications.

The event methods (like `onSignalOpenCommit` or `onPartialProfitCommit`) are triggered automatically by the backtest-kit, signaling specific events that require interaction with the exchange. Each of these provides a clear place to implement the actual exchange-specific logic, allowing for a clean separation of concerns between the trading strategy and the exchange interaction.

## Class BrokerAdapter

The `BrokerAdapter` acts as a gatekeeper for interactions with your broker, ensuring that any changes to your trading environment happen safely and reliably. It sits between your trading logic and the actual broker connection, providing a layer of control.

During testing (backtest mode), it quietly ignores any commands it would normally send to the broker, allowing you to simulate trading without real-world consequences. When you're actually trading live, it forwards these commands to your broker.

Think of it like this: it's a transaction manager. If anything goes wrong during the process of sending a command to the broker, the whole operation is rolled back, and your trading data remains consistent.

It handles various actions, such as sending signals to open or close positions, adjusting partial profits or losses, modifying stop-loss and take-profit levels, setting breakeven prices, and managing average buy orders.

To use it, you first need to tell the `BrokerAdapter` which broker to work with using `useBrokerAdapter`. Then, you activate it with `enable()`, which subscribes it to events. `disable()` deactivates it. If you need to reset the broker's connection, you can call `clear()`.

## Class BreakevenUtils

This class helps you understand and analyze breakeven events that have occurred during trading. It acts as a central point for gathering and presenting information about these events. You can use it to retrieve statistics like the total number of breakeven occurrences, or to create detailed reports summarizing individual breakeven events.

The class pulls data from a service that listens for breakeven events and stores them. It can then generate reports in markdown format, listing events with details like the symbol traded, the strategy used, entry and breakeven prices, and whether the event was part of a backtest or live trading.

It's also possible to directly save these reports to a file on your system, making it easy to share or archive your breakeven analysis. The reports are structured with clear columns, including symbol, strategy, signal ID, position, entry price, breakeven price, timestamp, and mode. You can choose which columns to display in your report.


## Class BreakevenReportService

The BreakevenReportService is designed to track and record when a trading signal reaches its breakeven point. It acts as a listener, picking up these "breakeven" events and saving the details – like what signal triggered it – into a database. 

This allows you to analyze when your strategies are achieving breakeven and understand their performance over time.

To get started, you'll subscribe to the breakeven signal emitter to receive these events.  The service ensures that you only subscribe once, preventing accidental duplication of records. When you’re finished, you can unsubscribe to stop receiving these events.


## Class BreakevenMarkdownService

The BreakevenMarkdownService helps you automatically generate and store reports detailing breakeven events for your trading strategies. It listens for these "breakeven" signals, collects the details for each symbol and strategy you're using, and then organizes them into easy-to-read markdown tables.

You can request summary statistics, like the total number of breakeven events recorded. These reports are saved to disk so you can review them later.

The service uses a clever storage system, creating separate, isolated data areas for each combination of symbol, strategy, exchange, frame, and backtest to keep things organized.

You can subscribe to receive these events, unsubscribe when you no longer need them, and clear the accumulated data whenever you need to start fresh. The `dump` function allows you to save reports to a specific location, and you can specify which columns to include in the reports.

## Class BreakevenGlobalService

This service, BreakevenGlobalService, acts as a central point for managing and tracking breakeven calculations within the system. It's designed to make things easier to manage and monitor.

Think of it as a middleman that sits between your trading strategies and the underlying connection layer that handles actual calculations. It receives instructions from your strategies and passes them on, but it also keeps a record of everything happening for logging and monitoring purposes.

It’s injected into your strategies, making it simple to use and maintain. This service relies on other components – like a logger and connection service – which are provided by a dependency injection system.

It validates strategies and related configurations before calculations, and keeps track of results to avoid unnecessary checks. 

Key functions include `check`, which determines if a breakeven should be triggered, and `clear`, which resets the breakeven state when a signal is closed. Both these functions log actions and then pass them along to the connection service.

## Class BreakevenConnectionService

The BreakevenConnectionService manages the tracking of breakeven points for trading signals. It's designed to efficiently create and manage objects that calculate and monitor these breakeven levels.

Essentially, it acts as a central point for creating and handling these breakeven calculations, ensuring that only one calculation is performed per signal, and that those calculations are properly cleaned up when no longer needed.

It leverages a caching mechanism to avoid unnecessary recalculations, making the process more performant. When a check or clear operation is needed for a specific signal, the service either retrieves the existing calculation or creates a new one, delegates the operation, and cleans up afterwards.

The service relies on other components—like a logger and action core service—that are provided by the overall system. It's a critical component within the broader trading strategy, contributing to accurate and timely decision-making.


## Class BacktestUtils

This class provides tools and shortcuts for running backtests, making it easier to evaluate trading strategies. It's designed to be a central point for common backtesting operations.

You can use it to easily start a backtest for a specific symbol and strategy, or to run a test in the background without needing to see the results immediately. It also offers functions to peek at key information about a running or completed backtest, like pending signals, position details, and profit/loss metrics.

Here's a breakdown of what it offers:

*   **Easy Backtest Execution:** Simplifies starting backtests with pre-defined context (strategy name, exchange, frame).
*   **Background Testing:** Allows running backtests in the background for tasks like logging or other side effects, without blocking the main process.
*   **Signal Information:** Provides access to details about pending or scheduled signals, like whether signals exist or breakeven has been reached.
*   **Position Metrics:** You can retrieve details about the current position, such as entry prices, cost basis, unrealized profit/loss, and the number of units held.
*   **Reporting and Analysis:** Generates reports, extracts statistics, and saves data to files for deeper analysis.
*   **Control & Management:** Includes functions to stop backtests early, activate scheduled signals, and cancel pending signals, giving you more control over the testing process.
*   **DCA Management:** Tools to manage and analyze details of DCA entries and partial closes.

Essentially, this class provides a convenient way to interact with and monitor the backtesting process, offering shortcuts for frequently used tasks and simplifying access to crucial data.

## Class BacktestReportService

The BacktestReportService helps you keep a detailed record of what's happening during your backtests. It essentially acts as a listener, carefully tracking every signal event—when a signal is idle, opened, active, or closed—and saving those details. This is really useful for analyzing your strategy's performance and troubleshooting any issues.

It works by connecting to a signal emitter and diligently logging each tick event alongside complete signal information. The data gets persistently stored through the `ReportWriter`. To prevent accidental duplicate subscriptions, the service uses a mechanism to ensure it only registers once. 

You can initiate this process using the `subscribe` method, which returns a function to stop the subscription. When you're finished, `unsubscribe` gracefully ends the data collection. If the service isn't subscribed in the first place, unsubscribing does nothing.


## Class BacktestMarkdownService

The BacktestMarkdownService helps you automatically create and save detailed reports during backtesting. It works by listening to incoming market data (ticks) and keeping track of when trading signals are closed. 

It organizes this information, creating tables summarizing signal details, and then saves these tables as Markdown files to your logs directory, making it easy to review your backtest results.

You can request specific statistical data or generate complete reports for individual symbols and strategies. The service manages its data in isolated storage areas, preventing information from different backtests from mixing. 

There's also functionality to clear out this accumulated data when it’s no longer needed, either for a specific backtest setup or all backtests at once. You can subscribe to receive tick events to process the closed signals, and there's a way to stop that subscription when you're finished.

## Class BacktestLogicPublicService

The BacktestLogicPublicService helps manage and run backtests in a straightforward way. It builds upon a private service and automatically handles important contextual information like the strategy name, exchange, and timeframe. This means you don't have to manually pass this context to functions like fetching candles or generating signals – it’s all taken care of behind the scenes.

It offers a `run` method which executes the backtest for a specified symbol and provides a continuous stream of results (signals for trades) as an asynchronous generator. This generator allows you to efficiently process and analyze the backtest results as they become available. 

The service also has a logger service and a reference to the private backtest logic service for internal operations.

## Class BacktestLogicPrivateService

The BacktestLogicPrivateService manages the complex process of running backtests efficiently. It works by first retrieving the timeframes needed for the backtest. Then, it processes each timeframe, checking for signals.

When a signal appears, it fetches the necessary historical data (candles) and executes the backtesting logic. It intelligently skips ahead to the timeframe when the signal resolves.

The service streams backtest results one at a time, which is a memory-saving technique compared to building up large arrays.  You can even stop the backtest early if needed. 

The `run` method is the core function, accepting a symbol and returning an async generator that produces results like completed signals or cancellations. This generator provides a stream of results, making it flexible for various consumption patterns.


## Class BacktestCommandService

This service acts as a central point for running backtests within the framework. It's designed to be easily used and managed, often through dependency injection. 

It relies on several other services to handle things like validating strategies, risks, actions, exchanges, and frames, ensuring everything is set up correctly before the backtest begins.

The primary function is `run`, which lets you execute a backtest for a specific symbol. You'll need to provide context, including the names of the strategy, exchange, and frame you're using. This function returns a series of results, detailing the outcomes of each tick during the backtest, showing events like scheduled orders, filled orders, and canceled orders.


## Class ActionValidationService

This service helps you keep track of and verify your action handlers – the pieces of code that actually *do* things in your trading system. Think of it as a central place to register all your actions and a quick way to double-check they're available before you try to use them.

It remembers if an action is valid, so it doesn’t have to constantly re-check, making things faster.

Here's what you can do with it:

*   **Register new actions:** Use `addAction` to add your custom action schemas to the service.
*   **Verify action existence:** The `validate` method is your go-to for confirming an action handler is ready to be used.
*   **See registered actions:**  `list` will give you a complete overview of all the actions you've registered.

It also has properties to store the logger service and the action map.

## Class ActionSchemaService

The ActionSchemaService is like a librarian for your trading actions, keeping track of all the details about what each action does and how it works. It ensures everything is set up correctly and consistently.

It uses a type-safe system to store and manage these action details. 

The service checks that the action handlers only use the allowed methods, making sure things are done the right way. It also allows for private methods, which are internal to the action.

You can register new actions, making sure they're valid and don't already exist.

If you need to tweak an existing action, you can update parts of its definition instead of redoing the whole thing.

Finally, it provides a way to retrieve the full details of an action when it's needed, like when setting up connections.


## Class ActionProxy

The `ActionProxy` acts as a safety net when using custom trading logic within the backtest framework. It’s designed to protect the system from crashing if your custom code has errors. Think of it as a wrapper around your actions that catches and logs any errors that occur, allowing the backtest to continue running smoothly instead of halting abruptly.

Here's a breakdown of how it works:

*   **Error Protection:**  Every time your code needs to perform an action (like handling a signal, a profit level, or a scheduled event), `ActionProxy` wraps that action in a special error-handling process. If something goes wrong in your code, the error is logged, reported, but the backtest doesn't stop.
*   **Flexible Compatibility:** It handles situations where you might not have implemented every possible action. If a method is missing, `ActionProxy` gracefully handles it without breaking things.
*   **Factory Creation:** You don’t directly create `ActionProxy` instances; instead, you use the `fromInstance()` method to create them, which ensures consistent error handling.
*   **Various Events:** It provides wrappers for many different events within the backtest process, including:
    *   `init`: Initialization errors are captured.
    *   `signal`, `signalLive`, `signalBacktest`: Signal generation handled safely.
    *   `breakevenAvailable`, `partialProfitAvailable`, `partialLossAvailable`: Profit and loss management actions wrapped for error protection.
    *   `pingScheduled`, `pingActive`, `pingIdle`:  Handles scheduled and active events with error capture.
    *   `riskRejection`: Handles situations where a trade is rejected by the risk management system.
    *   `dispose`: Cleanup actions are protected.
*   **Special Case: `signalSync`:** This specific method isn't wrapped in the standard error handling.  Errors here are deliberately passed on to another system for processing.

## Class ActionCoreService

The ActionCoreService is the central hub for managing actions within your trading strategies. It's responsible for coordinating how actions are triggered and handled.

Essentially, it takes the action list defined in your strategy's configuration and makes sure each action gets executed in the correct order, based on events like new market data or scheduled tasks.

Here's a breakdown of what it does:

*   **Action Management:** It reads the list of actions from a strategy's schema, validates everything involved (strategy name, exchange, frame, risks, and actions themselves), and then executes them sequentially.
*   **Event Routing:** It handles events like signal updates (regular, live, or backtesting), breakeven triggers, partial profit/loss, scheduled pings, and even risk rejections, routing them to the appropriate actions.
*   **Initialization and Cleanup:**  It initializes actions at the beginning of a strategy's run and cleans them up when the strategy is finished.
*   **Synchronization:**  `signalSync` provides a way to make sure all actions agree before proceeding with a position change.
*   **Data Clearing:** It can clear action data for a specific action or globally.

The service also has some important utility methods:

*   **`validate`**: A shortcut to quickly check the health of a strategy setup.  It caches the results so it doesn't repeat checks unnecessarily.
*   **`initFn`**:  Prepares actions for use by calling initialization functions.
*   **`dispose`**: Cleans up actions at the end of a strategy.

Think of it as a conductor ensuring all the different action "instruments" in your strategy play together in harmony.

## Class ActionConnectionService

This service acts as a central dispatcher for different actions within your trading strategies. It intelligently routes events like signals, breakeven updates, and scheduled pings to the correct action handler based on its name, the strategy it belongs to, the exchange, and the timeframe being used.

To improve performance, it caches these action handlers, so it doesn't have to recreate them every time they're needed. Think of it as a smart router that ensures the right actions are triggered at the right time.

The service utilizes several dependencies – a logger, action schema service, and strategy core service – to function correctly.

You’ll primarily interact with it via methods like `signal`, `breakevenAvailable`, and `dispose`, which trigger specific events and handle action lifecycles within your strategies. The `getAction` method is internal and used for retrieving cached instances.  You can also clear the cache using `clear` if needed.

## Class ActionBase

This class, `ActionBase`, is your starting point for building custom actions within the backtest-kit trading framework. Think of it as a foundation you build upon to extend the system's capabilities. It takes care of the basic logging and event handling so you don't have to write boilerplate code.

Essentially, it simplifies adding custom logic for things like sending notifications, updating state, or collecting analytics related to your trading strategy. The class handles a lot of the behind-the-scenes mechanics, ensuring that events are logged and processed correctly, and provides access to the strategy's context information.

Here's a breakdown of how it works:

*   **Initialization:** When a new action is created, it receives the strategy name, frame name, and action name. A one-time `init` method allows for setup tasks like connecting to a database or initializing an API.
*   **Event Handling:**  Various event methods (`signal`, `signalLive`, `signalBacktest`, `breakevenAvailable`, etc.) are triggered at specific points during the strategy's lifecycle – signal generation, profit/loss milestones, risk management. You override these to define your custom behavior in response to these events.  For example, `signalLive` is specifically for actions that need to run only during live trading.
*   **Lifecycle:** The `dispose` method ensures proper cleanup when the action is no longer needed, guaranteeing resources are released.
*   **Built-in Logging:** All events are automatically logged, helping you track and debug your custom actions.

By extending `ActionBase`, you can add functionality to manage your trading strategy's state, send notifications, collect metrics, or trigger custom business logic without needing to write a lot of repetitive code.
