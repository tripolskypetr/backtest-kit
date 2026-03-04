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

This service helps you keep track of and double-check your "walkers"—those configurations that define the ranges for your parameter sweeps and hyperparameter tuning. It essentially acts as a central place to register your walkers, ensuring they exist before you try to use them.  The service remembers whether a walker is valid, so it doesn't have to repeatedly check, making things faster. You can use it to add new walkers, confirm if a walker is set up correctly, and get a list of all your registered walkers.

## Class WalkerUtils

WalkerUtils provides helpful tools for working with walkers, which are essentially automated trading strategies. It simplifies the process of running and managing these strategies, especially when you need to log their progress or want to run them in the background.

Think of it as a central hub for interacting with your walkers. You can use it to kick off a walker comparison, run one silently without seeing the results (useful for things like logging), or stop a walker from generating new trading signals.

The `run` function executes a walker and gives you access to its data as it goes. `background` lets you run a walker without interruption and `stop` gracefully halts a walker's signal generation process. 

You can also retrieve all the walker's data with `getData` or generate a detailed report in markdown format (which can be saved to a file) using `getReport` and `dump`. Finally, `list` allows you to see the status of all currently active walkers. It's designed to be easy to use and ensures each walker instance is isolated for consistent performance.

## Class WalkerSchemaService

This service acts as a central place to manage and keep track of different "walker" schemas, which are essentially blueprints for how your trading strategies operate. It uses a special system to ensure these schemas are stored and handled safely, preventing type-related errors.

You can add new walker schemas using the `addWalker()` function (referred to as `register` in the code) and retrieve them later by their assigned name using the `get()` function. Before adding a schema, it's checked to make sure it has all the necessary pieces and that those pieces are the right type – this is handled by the `validateShallow()` function.

If a walker schema already exists, you can update parts of it without replacing the whole thing, thanks to the `override()` function. Think of it as a way to tweak an existing schema without starting from scratch. The service also keeps a record of these schemas, making it easier to organize and reuse them.

## Class WalkerReportService

The WalkerReportService helps you keep track of how your trading strategies are performing during optimization runs. It acts like a recorder, capturing the results of each test – things like profit, drawdown, and other important metrics – and storing them neatly in a database. 

Think of it as a way to monitor your strategy's learning process and easily compare different parameter settings to see what works best. It listens for updates from the optimization process and automatically saves the data. 

You can subscribe it to listen for these updates, and when you're finished, you can unsubscribe to stop it from recording. It’s designed to prevent accidental double-recording, ensuring your data stays clean and accurate. It utilizes a logger to provide debugging information.

## Class WalkerMarkdownService

This service helps you automatically create reports about your trading strategies as they’re being tested. It listens for updates from your backtesting process, collects the results for each strategy, and then neatly organizes them into easy-to-read markdown tables.

The service keeps track of each strategy's performance individually, ensuring that data from different strategies doesn’t get mixed up. You can specify which data points to include in the reports, like comparing various strategies side-by-side.

It saves these reports as markdown files, typically in a logs directory, making them simple to view and share. You have the option to clear the collected data for specific strategies or for all of them at once. It’s designed to be connected to your backtesting environment, receiving updates as the tests run and producing reports as they complete.

## Class WalkerLogicPublicService

This service helps manage and run "walkers," which are essentially automated trading strategies within the backtest-kit framework. It builds upon a private service to automatically pass along important details like the strategy's name, the exchange it's using, the timeframe, and the walker's identifier. 

Think of it as a convenient layer that ensures your strategies always have the information they need.

The `run` method is the key – you give it a stock ticker symbol and a context object, and it kicks off the backtesting process for all strategies, automatically handling the context propagation. It returns a generator that lets you process the results as they come in.


## Class WalkerLogicPrivateService

This service helps you compare different trading strategies, essentially orchestrating a "walkthrough" of each one. It works by running each strategy one after another and providing updates as they finish, so you can see the progress. As each strategy completes, it keeps track of the best performing one. Finally, it delivers a complete report ranking all the strategies you compared.

It relies on other services internally to handle the actual backtesting and formatting of results.

The `run` method is the main way to use this service.  You tell it which asset to test, which strategies to use, what metric to optimize for, and some context about your environment. The method then executes those strategies and returns results piece by piece as they’re available.

## Class WalkerCommandService

WalkerCommandService acts as a central point to interact with the walker functionality within the backtest-kit framework. Think of it as a convenient layer on top of the more complex WalkerLogicPublicService, making it easier to use and manage dependencies. It gathers several services together, including those for handling walker logic, schemas, validations (for strategies, exchanges, frames, walkers, risks, and actions), and a strategy schema service. 

The core function, `run`, is how you initiate a walker comparison. You provide it with a symbol (like a stock ticker) and context information—specifically, the names of the walker, exchange, and frame you’re working with—and it returns a stream of data representing the walker's results. This allows you to easily access and work with the data generated by the walker.

## Class SyncUtils

The `SyncUtils` class is designed to help you understand and analyze the lifecycle of your trading signals. It gathers information about signal openings and closings, providing statistical summaries and detailed reports. 

You can use it to fetch overall statistics like the total number of signals opened and closed. It can also generate a formatted markdown report, essentially a table, showing all the details of those signals – including things like entry and exit prices, take profit/stop loss levels, and profit/loss information.

Finally, you can easily save these reports to a file on your system, which is really helpful for reviewing your trading performance or sharing it with others. The reports are automatically named in a clear way that includes the symbol, strategy, exchange, and whether it was a backtest or live trade.

## Class SyncReportService

The SyncReportService helps you keep a record of what's happening with your trading signals, specifically when they're created and when they're closed out. It's designed to capture important details like when a signal is first created (when a limit order gets filled) and when a position is exited, including the profit or loss and why the position was closed.

This service listens for synchronization events and neatly logs them to files so you can review them later for auditing or analysis. It ensures that you only subscribe to these events once, preventing duplicate records. You can easily start and stop the service from listening to these events using the `subscribe` and `unsubscribe` methods. The `tick` property handles the actual processing and logging of the signal events.

## Class SyncMarkdownService

The SyncMarkdownService helps you keep track of your signal synchronization events and generate easy-to-read reports. It watches for signal openings and closings, carefully organizing the data based on the symbol, strategy, exchange, timeframe, and whether it's a backtest.

You can then ask it to create formatted markdown tables displaying the details of each signal's lifecycle. The service also keeps statistics like the total number of signals, opens, and closes, giving you a quick overview.

The reports are saved automatically to your disk, and you can customize the columns shown in the reports. You can also retrieve specific data or completely clear the accumulated data if needed. This service is designed to give you a clear and organized view of your signal synchronization activity.


## Class StrategyValidationService

The StrategyValidationService helps you keep track of your trading strategies and make sure they're set up correctly. Think of it as a central hub for managing your strategy configurations. 

You can register new strategies using `addStrategy()`, providing a name and a description of the strategy. The service then validates those strategies, checking not only that they exist, but also ensuring any associated risk profiles and actions are also valid. 

To speed things up, validation results are cached.  If you need to see what strategies you’ve registered, you can use `list()` to get a full overview. This service is built to help you avoid errors and streamline your backtesting process.

## Class StrategyUtils

StrategyUtils helps you analyze and understand how your trading strategies are performing. It's a central place to gather and present information about strategy events, like when a trade was canceled, closed for profit, or adjusted with a trailing stop. 

You can use it to get a statistical summary of events, showing you how often different actions are happening. It also allows you to create detailed reports in markdown format, which are easy to read and share. These reports show each event in a table with key details like the symbol traded, the action taken, and the price at the time.

Finally, this utility can automatically save those reports to files, making it simpler to track your strategy's performance over time and share the results. The filenames are designed to be descriptive, including the symbol, strategy name, exchange, timeframe, and whether it's a backtest or live run.

## Class StrategySchemaService

The StrategySchemaService acts as a central hub for storing and managing the blueprints, or schemas, of your trading strategies. It leverages a special type-safe storage system to keep things organized. 

You can register new strategy blueprints using `addStrategy()` – essentially telling the service about a new strategy you want to use. When you need to use a specific strategy, you can retrieve its blueprint by its name using `get()`.

Before a new strategy is accepted, `validateShallow()` checks if it has all the necessary components and that they're of the right type. If you need to update an existing strategy's blueprint, `override()` lets you make changes to specific parts of it, without having to redefine the entire thing. This service helps ensure consistency and validity across all your trading strategies.

## Class StrategyReportService

This service helps you keep a detailed record of what your trading strategies are doing. Think of it as a meticulous auditor, capturing key events like when a signal is canceled, a position is closed, or partial profits/losses are taken. It's designed to create individual JSON files for each event, making it easy to review and analyze your strategy's behavior.

To start using it, you need to "subscribe" to logging; once subscribed, each significant action your strategy takes will be automatically recorded. When you're finished, you can "unsubscribe" to stop the logging process.

The service provides specific functions to log different types of events – from trailing stops and take profits to breakeven adjustments and average buy entries. Each of these functions captures relevant details like the symbol being traded, the price, and performance metrics. This allows for a comprehensive audit trail of your strategy's performance and decisions.


## Class StrategyMarkdownService

This service helps you track and report on what's happening in your trading strategies during backtesting or live trading. Instead of writing each event to a file immediately, it temporarily holds them in memory to create comprehensive reports later.

Think of it as a central hub for strategy events like canceling scheduled orders, closing pending orders, or adjusting stop-loss levels. You "subscribe" to start collecting these events, and "unsubscribe" to stop and clear everything.

It provides several useful functions:

*   **`getData()`:**  Gives you the raw statistics and a list of all accumulated events for a specific trading setup (symbol, strategy, exchange).
*   **`getReport()`:** Generates nicely formatted markdown reports that you can easily read and share. You can customize what data appears in the report.
*   **`dump()`:**  Automatically creates and saves the markdown report to a file.
*   **`clear()`:**  Lets you wipe the slate clean, either for a specific setup or all of them.

The service intelligently caches storage for each symbol and strategy combination, so it manages memory efficiently. It’s designed for batch reporting, making it ideal for analyzing a series of backtests without constantly hitting your disk.

## Class StrategyCoreService

The `StrategyCoreService` acts as a central hub for managing trading strategies within the backtest framework. Think of it as an orchestrator, handling many common tasks related to strategies.

It relies on several other services—like `StrategyConnectionService`, `StrategySchemaService`, and validation services—to perform its functions. These dependencies enable it to manage strategies, validate their configurations, and interact with the exchange.

Here's a breakdown of what it does:

*   **Signal Management:** It can retrieve and manage pending signals (active positions), scheduled signals (future actions), and provide information like percentage closed, total cost, average entry price, and the number of DCA entries.
*   **Position Details:** It provides various metrics about a position, including its cost basis, unrealized profit/loss, and levels.
*   **Validation:** It rigorously validates strategies and risk configurations, ensuring they’re set up correctly.  It's designed to avoid unnecessary validation checks.
*   **Strategy Control:**  It offers methods to stop, cancel scheduled actions, and close pending signals—essentially controlling a strategy’s behavior.
*   **Backtesting & Ticking:** It facilitates backtesting by running strategies against historical data and processes ticks (updates) at specific timestamps.
*   **Partial Actions:** It allows for partial profit-taking or loss-cutting, with validation steps before execution.
*   **State Adjustments:** Allows adjusting trailing stop and take profit values.
*   **DCA Management:** Provides methods to add or check the possibilities for adding more DCA entries to an active position.



Essentially, `StrategyCoreService` provides a consolidated interface for interacting with and monitoring trading strategies, crucial for both backtesting and potentially live trading.

## Class StrategyConnectionService

This service acts as a central hub for managing and routing trading strategy operations. It intelligently connects incoming requests with the correct strategy implementation, making sure that each request is handled by the right strategy for a specific symbol and configuration.

Think of it as a smart router, caching frequently used strategies to improve performance and ensuring everything is properly initialized before any trading action happens.

Here's a breakdown of what it does:

*   **Smart Routing:** It directs calls to the appropriate strategy based on the symbol, exchange, and timeframe.
*   **Performance Boost:** It remembers (caches) strategy instances to avoid creating new ones repeatedly, which speeds things up.
*   **Safe Operations:**  It ensures strategies are fully ready before any trading activity takes place.
*   **Handles Live and Backtesting:** It supports both live trading (`tick()`) and historical simulations (`backtest()`).

**Key Functions:**

*   **`getStrategy()`:** Retrieves a cached strategy instance—creates it if it doesn’t exist yet.
*   **`getPendingSignal()`:**  Checks for an active signal, critical for things like monitoring stop-loss and time limits.
*   **`getTotalPercentClosed()`, `getTotalCostClosed()`, etc.:** Provides information about the position's state, particularly relevant for strategies using partial exits.
*   **`tick()` and `backtest()`:**  The core methods for executing live trades and backtesting strategies respectively.
*   **`stopStrategy()`:** Allows you to halt a specific strategy's signal generation.
*   **`dispose()`:** Clears out a strategy from memory when it's no longer needed.

This service manages a lot of the behind-the-scenes work, allowing you to focus on defining and testing your trading strategies.

## Class StorageLiveAdapter

The StorageLiveAdapter helps manage how your trading signals are stored, offering flexibility by allowing you to choose different storage methods. Think of it as a middleman—it handles requests for storing and retrieving signals, but delegates the actual work to a specific storage backend.

You can easily switch between different storage options: persistent storage (saving signals to disk), in-memory storage (signals are lost when the application restarts), or a dummy adapter (useful for testing as it doesn't actually store anything). The adapter also provides methods to find signals by ID and list all stored signals.

It’s designed to be adaptable; you can swap out the underlying storage implementation with your own custom solution. The default setup uses persistent storage, but it's simple to change based on your needs.  The `_signalLiveUtils` property holds the actual storage utility object that's currently being used. Methods like `handleOpened`, `handleClosed`, `handleScheduled` and `handleCancelled` pass signal-related events to the currently selected storage adapter.

## Class StorageBacktestAdapter

The `StorageBacktestAdapter` acts as a flexible middleman for how your backtest kit stores signal data. It lets you easily swap out different storage methods without changing the rest of your code.

Think of it like this: you can choose to store your data permanently on disk, keep it in memory for faster testing, or even use a "dummy" adapter that pretends to save data but does nothing at all.

The adapter provides methods for handling signal events like opening, closing, scheduling, and cancelling, as well as finding signals by their ID and listing all signals.  It also offers convenient shortcuts like `usePersist`, `useMemory`, and `useDummy` to quickly switch between storage options.  Under the hood, it uses different storage utilities based on which adapter you've selected.

## Class StorageAdapter

The StorageAdapter is the central hub for managing all your trading signals, whether they’re from backtesting historical data or coming in live. It automatically keeps track of new signals as they're generated, making sure everything's neatly organized.

To get it working, you need to "enable" it, which sets up the connections to receive those signals. You can then "disable" it to stop those connections whenever needed—don't worry about accidentally disabling it too many times, it's safe.

Need to find a specific signal? The `findSignalById` method searches through both your backtest and live data.  If you want to see all the signals generated during backtesting, `listSignalBacktest` provides that.  Similarly, `listSignalLive` gives you a list of all your live signals.

## Class SizingValidationService

This service helps you keep track of your position sizing strategies and makes sure they're set up correctly before you start trading. Think of it as a central manager for your sizing rules. 

You can register new sizing strategies using `addSizing`, and the service will remember them.  Before using a sizing strategy, `validate` checks to see if it’s actually registered, preventing errors. To avoid repeatedly checking, the service uses caching for improved performance. Finally, `list` gives you a handy overview of all the sizing strategies you've registered.

## Class SizingSchemaService

The SizingSchemaService helps you keep track of different strategies for determining how much to trade – we call these "sizing schemas." It uses a special system to ensure everything is typed correctly and organized.

You can add new sizing schemas using `register`, updating existing ones with `override`, and easily retrieving them later by their name using `get`.

Before a sizing schema is added, it's checked to make sure it has all the necessary parts and the right types, ensuring consistency and preventing errors. This check is done with the `validateShallow` method internally. The service relies on a logger to track what's happening and uses a registry to safely store the sizing schemas.

## Class SizingGlobalService

This service helps determine how much of an asset to trade, considering factors like risk and account size. It acts as a central point for these calculations, streamlining the trading process. 

Essentially, it takes parameters – like how much risk you're willing to take – and uses them to figure out the appropriate position size.  It relies on other services to validate the calculations and connect to data sources. 

Think of it as the engine that translates your risk preferences into concrete trading sizes. The `calculate` method is the key part, performing the actual size computation.


## Class SizingConnectionService

The SizingConnectionService acts as a central hub for calculating position sizes within the backtest-kit framework. It intelligently directs sizing requests to the specific sizing method you've configured, like fixed percentage or Kelly Criterion.

Think of it as a smart router – you tell it which sizing method you want to use (through a 'sizingName'), and it handles the rest.

To make things efficient, it remembers which sizing methods it’s already set up, avoiding unnecessary re-creation. It relies on other services to understand the available sizing methods and helps to tie together the sizing logic with risk management principles. When no sizing configuration is present, an empty string is used to signify that. 

The `calculate` function is the main way you’ll use this service, providing the necessary data and letting it determine the optimal position size.

## Class ScheduleUtils

ScheduleUtils is a helpful tool designed to monitor and report on your scheduled signals. Think of it as a central place to keep track of signals that are waiting to be processed, and to see how well things are running. It provides a single, easy-to-use instance that gives you access to information about your scheduled signals, including statistics and reports.

You can retrieve data about signal events for specific symbols and strategies, allowing you to understand their performance. It also generates clear, readable markdown reports, making it simple to share information with others or analyze your system's behavior. Finally, the utility can save these reports directly to a file on your computer.

## Class ScheduleReportService

This service helps you keep track of your scheduled signals and how long they take to execute or get canceled. It essentially listens for events related to signals – when they are scheduled, when they start processing, and when they are canceled. 

The service calculates the time it takes between a signal being scheduled and when it actually runs or is canceled, recording that information in a database. To prevent accidentally subscribing multiple times, it uses a mechanism to ensure only one subscription is active at a time. 

You can start listening for signal events by using the `subscribe` method, and when you’re done, `unsubscribe` stops the service from listening and cleans up any resources. The `tick` property is the core component that handles all the processing and database logging.

## Class ScheduleMarkdownService

This service helps you create reports about scheduled signals, like when a trading signal is planned. It listens for signals that are scheduled and cancelled, and organizes them by strategy. The service then generates easy-to-read markdown tables that show the details of each signal event, including helpful statistics like cancellation rates and wait times.

Think of it as a way to keep track of your trading plans and see how well they’re being executed.  The reports are saved to a log file for each strategy, making it easy to review. 

You can subscribe to receive these events in real-time, and unsubscribe when you no longer need the updates. The `tick` function handles the ongoing processing of these events.  You can also request specific data or generate reports for a particular trading strategy and symbol. Finally, it provides a way to clear the stored data when you want to start fresh.

## Class RiskValidationService

This service helps you keep track of your risk management settings and make sure they're all set up correctly. It acts like a central record for all your risk profiles, allowing you to register new ones and quickly check if a specific profile exists before you use it in your trading strategies. To speed things up, it remembers the results of previous validation checks, so it doesn’t have to re-check them every time. You can also use it to get a complete list of all the risk profiles you’ve registered.

It has a place to store your logging information, and an internal data structure to manage the risk profiles. 

You can add new risk profiles using `addRisk`, verify a profile’s existence with `validate`, and retrieve a full list of registered profiles using `list`.

## Class RiskUtils

The RiskUtils class helps you understand and analyze risk rejection events within your backtesting or trading system. Think of it as a tool for examining when and why your strategies encountered potential problems.

It gathers data from risk rejection events, storing a limited history of those events—up to 250 for each combination of symbol, strategy, and exchange.

You can use it to:

*   Get statistics like the total number of rejections and breakdowns by symbol or strategy.
*   Generate detailed reports in Markdown format, showing each rejection event with key information like the symbol, strategy, position, price, and reason.
*   Save those reports to files, making it easy to share or archive your risk analysis.

Essentially, RiskUtils provides a way to dig into the details of your risk management process, helping you identify patterns and improve your strategies.

## Class RiskSchemaService

The RiskSchemaService helps you keep track of your risk schemas in a structured and organized way. It uses a special type-safe storage system, so you can be sure your schemas are consistent. 

You can add new risk profiles using the `addRisk()` function (implemented as `register`), and find them again later by their name with the `get()` function. Before a new risk schema is added, it’s quickly checked to make sure it has all the necessary parts with `validateShallow`. If you need to update an existing risk profile, you can use the `override()` function to make changes without replacing the whole thing.

## Class RiskReportService

The RiskReportService helps you keep track of when your trading signals are rejected by your risk management system. It acts like a dedicated recorder, capturing details about each rejected signal, including why it was rejected and what the signal looked like. 

You can think of it as a way to create an audit trail for your risk management decisions, allowing you to analyze patterns and improve your risk controls.

To use it, you'll subscribe to the risk rejection events.  This sets up the service to listen for and record those rejections. When you're done, you can unsubscribe to stop the recording. The service is designed to prevent accidental double-subscriptions, ensuring reliable logging. It utilizes a logger to provide helpful debugging information during its operation.

## Class RiskMarkdownService

The RiskMarkdownService is designed to automatically create and save reports detailing rejected trades due to risk management rules. It listens for risk rejection events and organizes them by the trading symbol and strategy being used.

It generates easy-to-read markdown tables that present detailed information about each rejection, along with overall statistics like the total number of rejections, broken down by symbol and strategy. These reports are saved as files on your disk, making it simple to review and analyze your risk management performance.

You can subscribe to receive these rejection events and unsubscribe when you no longer need them. The service also lets you retrieve statistics and generate reports for specific symbol-strategy combinations, or clear out all accumulated data when needed. Think of it as a way to keep track of why your trades are being rejected and ensure your risk rules are working as intended.

## Class RiskGlobalService

This service acts as a central hub for managing risk within the trading framework. It handles validating risk configurations, ensuring trades adhere to defined limits, and keeping track of open positions. Think of it as the gatekeeper, making sure every trade aligns with the overall risk strategy. 

It uses other services internally to handle specific tasks like connecting to risk systems and performing validations, and it caches validation results to improve performance. The `checkSignal` method is key - it determines whether a trading signal is permitted based on the current risk rules. You’ll also find methods to register (`addSignal`) and remove (`removeSignal`) signals when positions are opened and closed, respectively, allowing for accurate tracking. Finally, `clear` allows you to wipe the slate clean, either for all risk data or for a specific configuration.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks within the trading system. It intelligently directs risk assessment requests to the correct risk implementation based on a name you provide. To improve speed and efficiency, it remembers previously used risk implementations, avoiding unnecessary re-creation. 

Think of it as a smart router that ensures your trading signals are always evaluated against the appropriate risk rules. 

Here’s a breakdown of what it does:

*   **Risk Routing:** It routes risk checks based on a provided risk name.
*   **Caching:** It saves previously used risk implementations to improve performance.
*   **Signal Validation:** It verifies signals against various risk limits like drawdown and exposure.
*   **Signal Management:** It registers and removes signals from the risk management system.
*   **Cache Clearing:** It allows you to manually clear the cached risk implementations when needed.

The service relies on other services for logging and schema management. The `getRisk` function is key; it's used internally and also provides a memoized way to retrieve the correct risk implementation, ensuring that it’s readily available.

## Class ReportUtils

ReportUtils helps you control which parts of your trading system – like backtests, live trading, or performance analysis – generate detailed log files.

It lets you pick and choose what gets logged, which is useful for focusing on specific areas or troubleshooting problems.

When you enable logging for a service, it starts recording events in real-time to JSONL files, including useful information for filtering and analyzing data.  Remember to "unsubscribe" from these enabled services when you’re done to avoid issues later on.

Conversely, you can disable logging for certain services without affecting others, giving you fine-grained control. Disabling simply stops the logging process and frees up resources; it doesn’t require an unsubscribe step like enabling does.



It's designed to be used alongside other classes like ReportAdapter, to extend its functionality.

## Class ReportBase

The `ReportBase` class helps you record trading events in a structured way, primarily for analysis and debugging. It writes each event as a line in a JSONL file, making it easy to process later.

Think of it as a logger specifically designed for backtesting – it automatically creates the necessary directories and handles potential errors gracefully. The system ensures writes don't overwhelm the process and includes a timeout to prevent hangs.

You can filter these log files by criteria like symbol, strategy, exchange, or timeframe, allowing you to pinpoint specific scenarios. The class manages the file writing process, ensuring data is appended safely and efficiently.  The initialization of the file and stream is handled automatically and safe to call multiple times. A timeout mechanism is in place to prevent writes from taking too long.

## Class ReportAdapter

This component helps you manage and store your trading data, like backtest results or live trade information. It acts as a central point for writing structured data, allowing you to easily swap out how and where that data is saved.

You can change the way data is stored by providing a different storage “adapter” - think of it as plugging in a new system. The system remembers which adapter you're using for each type of report (like backtest reports versus live trading reports), ensuring you don't create multiple instances of the same storage.

It automatically starts saving data as soon as you write anything, and you can easily switch to a "dummy" adapter that throws away data if you're just testing things out. By default, it uses a simple JSONL (JSON lines) format for storing your reports. The goal is to provide a flexible and efficient way to log events and gather analytics for your trading framework.

## Class PositionSizeUtils

This class offers helpful tools for figuring out how much of an asset to trade, which is key for managing risk. It provides specific functions for different sizing strategies, like using a fixed percentage of your account, applying the Kelly Criterion (a more complex formula based on win rates and profit ratios), and using the Average True Range (ATR) to gauge volatility. 

Each of these functions includes built-in checks to make sure the information you provide is appropriate for the chosen sizing method, preventing errors. The class doesn't require you to create an instance; you can directly use the provided methods.


## Class PersistStorageUtils

This utility class helps manage how signal data is saved and loaded, especially for keeping track of changes over time. It ensures that your signal information is reliably stored, even if something unexpected happens.

The class automatically handles creating storage instances and allows you to customize how the data is stored. It keeps each signal's data in its own file, identified by a unique ID. Importantly, it uses special techniques to make sure that writes are performed safely, preventing data corruption if the application crashes.

You can choose between different storage methods—like using the standard JSON format or opting for a "dummy" adapter that simply discards any changes you make, which is useful for testing.

When your application starts, it can load the saved signal data to restore its state. Conversely, whenever a signal is updated, this class writes the new data back to disk. The system makes sure these writes happen in a way that's unlikely to lead to data loss.




The `readStorageData` method retrieves all the saved signal data. It will return an empty list if no signals have been saved yet.

The `writeStorageData` method is responsible for saving signal data to disk, ensuring that each signal's state is preserved. 

You can register your own custom storage adapters using `usePersistStorageAdapter` to tailor the storage behavior to your needs.


## Class PersistSignalUtils

PersistSignalUtils is a helper class designed to handle saving and retrieving signal data, particularly for trading strategies. It makes sure that each strategy has its own dedicated storage, allowing for organized data management. You can even customize how the data is stored using different adapters, or simply revert to the standard JSON format. 

To ensure reliability, PersistSignalUtils writes data in a way that prevents corruption, even if something goes wrong during the process. ClientStrategy uses this class to load previous signal states and to save new ones. 

If you want to test things out without actually saving data, there’s even a “dummy” adapter that acts as a placeholder, discarding any changes you make.

## Class PersistScheduleUtils

This class helps manage how scheduled signals are saved and restored for your trading strategies. It ensures that the signal data is handled safely, even if your application crashes unexpectedly.

It provides a way to use different storage methods, like JSON files or even a dummy adapter that doesn't save anything at all – useful for testing.

The class is designed to work specifically with ClientStrategy to keep track of those scheduled signals as your strategy is running. When a strategy starts, it reads any previously saved signal data; when it makes changes, it saves the updated data back. The saving process is handled in a way that minimizes the risk of data loss. You can also register custom methods to manage data storing.

## Class PersistRiskUtils

This class helps manage how your trading positions are saved and restored, particularly when dealing with risk management. It's designed to ensure your active positions are kept safe and consistent, even if your system encounters problems.

It cleverly remembers storage instances for each risk profile, allowing you to customize how data is saved. You can even swap in different ways to handle the persistence, like using a standard JSON format or testing with a "dummy" adapter that doesn't actually save anything. 

The class is responsible for reading in your existing positions, and writing updates to them to make sure everything stays in sync. The writing process is carefully designed to be safe, using atomic operations to prevent data loss if the system crashes unexpectedly. It works closely with the ClientRisk component to keep things running smoothly.

## Class PersistPartialUtils

This class, PersistPartialUtils, helps manage how your trading strategies keep track of partial profit and loss information, especially when a strategy needs to recover from unexpected stops. It ensures that this data is saved reliably, even if things go wrong.

The system cleverly stores this partial data separately for each symbol and strategy combination, and you can even plug in your own custom ways of storing this information. It uses special techniques to make sure the data is read and written safely, preventing corruption.

To get things started, it offers a few pre-built options: the standard JSON format, a fallback to a simple "dummy" adapter that doesn’t actually save anything (useful for testing), and the ability to register completely custom data storage methods. Functions are provided to both read existing partial data and save updated partial data.

## Class PersistNotificationUtils

This class helps manage how notifications are saved and loaded, making sure the information sticks around even if there are interruptions. It provides a central place to control how notification data is stored, using a system that remembers previously saved notifications.

You can customize how notifications are persisted by registering different storage adapters, or easily switch back to the default JSON storage. There’s even a "dummy" adapter which is helpful for testing, as it simply ignores any attempts to save data.

The `readNotificationData` function retrieves all saved notification information, and `writeNotificationData` securely saves changes to individual notification files, ensuring data integrity even if something goes wrong. The system uses unique IDs for each notification, storing them as separate files for individual management. This makes restoring a notification’s state straightforward.

## Class PersistMeasureUtils

This class helps manage how cached data from external APIs is saved and retrieved, ensuring it's durable even if things go wrong. It organizes cached data into buckets based on timestamps and symbols, using a system that remembers these buckets for efficient storage. You can customize how this data is stored by plugging in different adapters, or use the built-in JSON adapter for standard storage.

The class provides functions to read and write data to these cached buckets, making sure operations are reliable. It even has a "dummy" adapter that's helpful for testing because it simply throws away any data you try to save. 

Essentially, it simplifies persistent caching for your trading framework by handling the complexities of saving and loading data safely and flexibly.



Here's a breakdown of specific features:

*   **Data Organization:** Data is stored in buckets defined by timestamp and symbol, making it easy to locate.
*   **Customizable Storage:** You have control over the storage mechanism using adapters.
*   **Reliable Operations:** Reads and writes are designed to be atomic and crash-safe.
*   **Testing Support:** The dummy adapter allows for testing without actual data persistence.

## Class PersistLogUtils

This class, PersistLogUtils, helps manage how log data is saved and retrieved, ensuring that your logs are safely stored even if something goes wrong. It keeps track of log entries by storing each one as a separate file, identified by a unique ID.

It's designed to work closely with LogPersistUtils, the component responsible for the overall logging process. You can even customize how these logs are stored by using different persistence adapters.

The class provides convenient methods for reading all existing log entries and writing new ones to disk, making sure the process is reliable. There are also handy shortcuts to switch between different storage methods, such as using a standard JSON format or even a "dummy" adapter that simply ignores all writes for testing purposes.  This allows you to quickly test different logging implementations without affecting the actual persistence.

## Class PersistCandleUtils

This utility class helps manage and store candle data for trading, essentially acting as a persistent cache. It keeps each candle as a separate JSON file, organized by exchange, symbol, interval, and timestamp. The system checks if the entire set of candles you're requesting is available before returning data – if even one is missing, it indicates a cache miss and triggers a refresh. 

It's designed to ensure data integrity by only providing complete datasets and automatically invalidating the cache when data isn’t fully present.  The `readCandlesData` method is particularly important, as it carefully verifies that all expected candles exist before delivering them, following a specific algorithm to check timestamps.  The `writeCandlesData` function handles saving the candles, guaranteeing atomic file operations for reliability. 

You can customize how this caching works by registering different persistence adapters, choosing between JSON storage or even a dummy adapter that simply ignores writes for testing purposes. It’s a core component used by ClientExchange to efficiently manage candle data.

## Class PersistBreakevenUtils

This utility class helps manage and save the breakeven state of your trading strategies, ensuring your progress isn't lost. It handles the behind-the-scenes work of storing and retrieving this data from disk.

Think of it as a librarian for your breakeven data, organizing it in a specific folder structure under a 'dump/data/breakeven' directory. Each strategy and symbol pairing gets its own file to hold the information.

The class is designed to be efficient; it uses a clever system to create storage for each combination of symbol, strategy, and exchange only when needed, and it remembers these so it doesn't have to recreate them. You can even customize how this data is stored – perhaps you want to use a different format besides JSON – and this class allows you to do that. It ensures data is written safely, preventing potential corruption.


## Class PersistBase

`PersistBase` provides a foundation for storing and retrieving data to files, ensuring that your data remains consistent even if interruptions occur. It handles the technical details of writing files safely, so you don't have to worry about data corruption. 

This class automatically manages the directory where your data is stored and can clean up any damaged files it finds. It also offers a way to iterate through all your data entries using an asynchronous generator.  You can easily check if a specific data item exists, read its information, or write new data, all while the system takes care of the underlying file operations.  The `waitForInit` method sets up the storage directory initially and validates existing data upon startup, preventing potential issues later on.

## Class PerformanceReportService

The PerformanceReportService is designed to help you understand where your trading strategies are spending their time, so you can make them run more efficiently. It acts like a detective, quietly observing the timing of different steps within your strategy’s execution.

It works by listening for "performance events" and recording how long each one takes, along with some extra details. These timing records are then stored in a database, allowing you to later analyze your strategy’s performance and pinpoint any bottlenecks. 

You can easily start this monitoring process using the `subscribe` method, which ensures that you don’t accidentally subscribe multiple times. To stop the monitoring, use the `unsubscribe` method.  The service uses a logger to provide debugging information.

## Class PerformanceMarkdownService

This service helps you keep track of how your trading strategies are performing. It listens for performance data, organizes it by strategy and trading symbol, and then calculates important statistics like average performance, minimums, maximums, and percentiles. 

You can request this data to see how a specific strategy did, or generate detailed markdown reports that analyze performance bottlenecks. These reports are automatically saved to your logs directory. 

The service also offers ways to subscribe to and unsubscribe from performance events, ensure that data isn’t collected redundantly, and clear out old performance data when needed. It uses a clever storage system, ensuring that each strategy’s data is kept separate and organized.

## Class Performance

The Performance class helps you understand how your trading strategies are performing by offering tools to analyze metrics and create reports. It provides a way to gather aggregated performance statistics, letting you see how different strategies are doing for specific symbols. You can generate easy-to-read markdown reports which visually break down where your strategy is spending its time, including detailed statistics and highlighting potential bottlenecks using percentile analysis. 

These reports can also be saved directly to your hard drive for later review or sharing, with the option to specify a custom file path. The `getData` method lets you retrieve these statistics programmatically for deeper analysis. The class is designed to simplify the process of pinpointing performance issues and optimizing your trading strategies.


## Class PartialUtils

This class helps you analyze and understand your partial profit and loss data, which is crucial for evaluating trading strategies. It acts as a central hub for accessing and presenting this information in a user-friendly way.

You can use it to pull out key statistics, like the total number of profit and loss events, giving you a quick overview of performance. It also allows you to generate detailed reports in Markdown format, presenting your partial profit/loss events in an organized table with important details like action, symbol, signal ID, position, level, price, and timestamps.

Finally, this class makes it easy to save these reports directly to a file on your system for later review or sharing, automatically creating the necessary folder structure to keep things organized. Think of it as your go-to tool for digging into and understanding how your strategies are performing in terms of partial gains and losses.

## Class PartialReportService

This service helps you keep track of partial profits and losses during your backtesting. It specifically records when you close off portions of a position, either in profit or at a loss.

Think of it as a detailed logbook for your trading decisions, capturing the price and level at which you took those partial exits. 

To use it, you need to connect it to the emitters that signal those partial exit events.  It uses a system to ensure it only listens once, preventing duplicate entries. 

You can subscribe to start receiving these events and unsubscribe when you no longer need to track them. The `subscribe` method returns a function you can call to stop listening – a clean way to manage the connection.

## Class PartialMarkdownService

The PartialMarkdownService helps you create reports detailing your partial profits and losses during backtesting. It acts like a listener, gathering up all the profit and loss events for each symbol and strategy you're testing. 

It then neatly organizes this data into Markdown tables, providing a clear overview of your trading performance. You can request statistics, like the total number of profit and loss events, or generate full reports to see the detailed history of each trade.

The service automatically saves these reports as Markdown files, making them easy to review and analyze. You can also clear out the stored data if you need to start fresh or want to remove old records.  It's designed to keep each symbol and strategy's data separate, ensuring accurate reporting.

## Class PartialGlobalService

The PartialGlobalService acts as a central hub for managing partial profit and loss tracking within the backtesting framework. It's designed to be injected into your trading strategies, offering a single point of access for these operations.

Think of it as a middleman; it logs any partial profit or loss events at a global level before passing them on to the PartialConnectionService, which handles the actual tracking.  This centralized logging is helpful for monitoring how your strategies are performing.

The service relies on several other services – for logging, validating strategies, retrieving configurations, and assessing risks – all injected through the dependency injection system.  It also includes a `validate` function to check the validity of your strategy setup, which is designed to be efficient by remembering previous validations.  The `profit`, `loss`, and `clear` functions are the primary ways you'll interact with this service to record and reset partial state.

## Class PartialConnectionService

The PartialConnectionService is like a central manager for tracking profits and losses on individual trading signals. It keeps track of these signals, ensuring each one has its own dedicated record.

Think of it as a factory that creates and maintains these records, reusing them whenever the same signal appears again to avoid unnecessary overhead. These records, called ClientPartial instances, are responsible for the actual profit/loss calculations and reporting.

The service connects with other parts of the system, like a logger and an event emitter, to keep everything coordinated.  When a trade hits a profit or loss threshold, the service handles the process – creating the record if it doesn't exist, calculating the profit/loss, and letting the rest of the system know. When a trade closes, the service cleans up these records to prevent memory buildup. It's designed to be efficient and reliable for handling multiple trading signals.

## Class NotificationLiveAdapter

This component, `NotificationLiveAdapter`, provides a flexible way to handle notifications during live trading. It acts as a central point for sending out information about trading events, like signals, partial profits, losses, and errors, using different "backends" for storing or displaying those notifications.

You can easily swap out how notifications are handled without changing the rest of your code. It starts with an in-memory storage by default, but you have options to use persistent storage (saving to disk) or a dummy adapter that essentially ignores notifications entirely - useful for testing or when you don't need to record them.

The `handle...` methods (like `handleSignal`, `handlePartialProfit`, etc.) are how you pass data to the adapter, and they’ll forward it to whichever notification backend you've chosen.  There are also methods like `getData` to retrieve stored notifications and `clear` to delete them.  Finally, `useNotificationAdapter`, `useDummy`, `useMemory`, and `usePersist` let you easily change the notification backend.

## Class NotificationBacktestAdapter

This component lets you manage notifications during backtesting, offering flexibility in how those notifications are handled. It uses a pattern that allows you to easily swap out different notification implementations—like storing notifications in memory, persisting them to a file, or simply ignoring them (a "dummy" adapter).

You can choose a default in-memory storage, or switch to a persistent storage to save notifications for later review, or use a dummy adapter if you only need to run the backtest without generating notifications. The component provides methods to easily switch between these options.

The `handleSignal`, `handlePartialProfit`, and similar methods are designed to pass notification events to the currently configured adapter. You'll find methods for retrieving all stored notifications or clearing them out, depending on your needs. Finally, you can customize the notification adapter by providing your own implementation.

## Class NotificationAdapter

The NotificationAdapter helps you keep track of notifications, whether you're running a backtest or a live trading system. It automatically updates notifications as things change and provides a single place to access them all. 

To avoid getting duplicate notifications, it uses a clever mechanism that ensures you only subscribe to updates once. 

You can easily turn notifications on and off, retrieve all stored notifications for either backtesting or live trading, and even clear them out completely when you're done. It's designed to be simple and reliable, making sure you always have the information you need.


## Class MarkdownUtils

This class helps you control when and how markdown reports are generated for different parts of the backtest-kit system. Think of it as a central switchboard for report creation.

You can selectively turn on markdown reporting for things like backtests, live trading, or performance analysis using the `enable` method. When you enable a service, it starts gathering data and producing markdown files, but be sure to use the cleanup function that `enable` returns to stop it later, otherwise you might leak memory.

Alternatively, you can use `disable` to stop markdown reporting for specific services without affecting others. This lets you focus on particular areas or save resources when you don’t need reports. When you disable a service, it stops collecting data and generating files immediately.

This class is designed to be expanded upon by other components, making it a flexible foundation for creating custom reporting solutions.

## Class MarkdownFolderBase

This adapter helps you create well-organized reports by writing each one to its own individual markdown file. Think of it as a way to build a folder full of reports, each neatly labeled and stored separately. It automatically creates the necessary directories for you, so you don't have to worry about that. 

You essentially tell it where you want to save the reports (using options like `path` and `file`), and it handles the rest, writing the content directly to the file. This makes it a great choice if you want to easily browse and review your reports manually. 

The `waitForInit` method doesn't actually do anything, as this adapter works by directly writing to files, so it doesn't need any special setup. The `dump` method is what you'll use most often – it takes the markdown content and writes it to the file based on your specified options.

## Class MarkdownFileBase

This component helps you create and manage markdown reports in a structured way, specifically designed for backtesting trading strategies. It writes reports as JSONL (JSON Lines) files, a format that’s easy to process and analyze with other tools. Each report line includes important information like the report type, the actual markdown content, and metadata like the trading symbol, strategy name, and frame – making it easy to filter and find specific reports later. 

The system handles file creation automatically and includes built-in safeguards to prevent write errors and ensure stability. It uses a stream-based approach with backpressure to manage data flow and a 15-second timeout to prevent operations from getting stuck.  The `waitForInit` method sets everything up initially, and the `dump` method is how you actually write the markdown content to the file, along with all the relevant details. Think of it as a way to keep all your trading report data organized and accessible.


## Class MarkdownAdapter

The MarkdownAdapter helps you manage how your markdown data is stored, providing flexibility and efficiency. It uses a pattern that allows you to easily switch between different storage methods, like saving each piece of data as a separate file or appending them to a single JSONL file. 

It's designed to make sure you only have one instance of each type of markdown storage (like "backtest" or "live") running at a time, which keeps things organized and prevents conflicts.

You can change the default storage method using `useMarkdownAdapter`, or use shortcuts like `useMd` for the standard file-per-item approach, `useJsonl` for appending to a single file, or `useDummy` to temporarily disable markdown writing for testing. The storage itself is only created when you first write data, making things lazy and efficient.

## Class LoggerService

The LoggerService helps keep your backtesting logs organized and informative. It acts as a central point for logging messages, automatically adding important details like which strategy, exchange, and frame are being used, as well as information about the specific asset and time period.

You can use the `log`, `debug`, `info`, and `warn` methods to record different levels of messages within your backtest. The service automatically injects context into these messages, so you don’t have to manually add those details each time. 

If you don't provide a specific logging implementation, it will default to a basic "no-op" logger which effectively does nothing, so it won't interfere with your testing. You can customize the logger by using `setLogger` to plug in your own logging solution. The service also manages method and execution context separately.

## Class LogAdapter

The `LogAdapter` provides a flexible way to manage and store log messages within your backtesting system. Think of it as a central point for all logging, allowing you to easily change how and where those logs are kept. By default, it stores logs in memory, which is quick and convenient.

However, you're not limited to that! You can swap out the default memory-based logging for persistent storage on disk, a "dummy" logger that silently discards logs, or even a JSONL file adapter for detailed record-keeping.

The `useLogger` method gives you the ultimate control - you can specify a custom log implementation. Changing the logger is simple with `usePersist`, `useMemory`, and `useDummy` methods, making it easy to tailor the logging behavior to your specific needs. The `getList` method retrieves all accumulated log entries, and individual log levels like `log`, `debug`, `info`, and `warn` provide specific message categorization.

## Class LiveUtils

This utility class simplifies live trading operations within the backtest-kit framework. It offers a streamlined way to run live trading, manage crashes, and monitor progress. Think of it as a helpful assistant that handles the behind-the-scenes complexities of live trading.

It provides several handy functions:

*   **Running Live Trades:**  It lets you easily kick off live trading for a specific crypto and strategy.  It automatically handles persistent storage so if something goes wrong, it can pick up where it left off.
*   **Background Execution:** You can also run trading in the background—ideal for things like sending notifications or logging data without directly impacting the trading process.
*   **Signal Information:**  It can retrieve details about pending and scheduled signals, providing insights into the current trading plan.
*   **Position Metrics:**  You can quickly get key data about your current position, such as the percentage closed, cost basis, average entry price, and PnL.
*   **Control and Management:**  Features allow you to stop trading, cancel scheduled orders, or manually close positions.
*   **Trailing Stops/Take Profits:** It facilitates adjustments to trailing stop-loss and take-profit levels, offering refined risk and profit management.
*   **Data Reporting:** It lets you generate reports with details about trading events or save that report to a file.



Essentially, `LiveUtils` acts as a central hub for all live trading functionality, making it easier to manage and observe your live trading strategies.

## Class LiveReportService

The LiveReportService helps you track what your trading strategy is doing in real-time by recording every important event. It essentially acts as a live log for your strategy's signals.

It listens for events like when a signal is idle, when a trade is opened, when it’s active, and when it’s closed.  All the details about each event are saved to a database, allowing you to monitor and analyze your strategy's performance as it’s happening.

You subscribe to receive these live events, and a mechanism prevents you from accidentally subscribing multiple times. When you’re finished, you can unsubscribe to stop the logging. There’s also a logger service you can use for debugging purposes.

## Class LiveMarkdownService

The LiveMarkdownService is designed to automatically create and save detailed reports about your live trading activity. It continuously monitors trading events—like when a strategy is idle, a position is opened or closed, or is actively running—and organizes this information for each strategy you're using. The service then generates these events into easy-to-read markdown tables, providing valuable insights into your trading performance, including win rates and average profit/loss. 

It keeps all data separate for different combinations of symbols, strategies, exchanges, and timeframes, ensuring a clear and organized record. You can subscribe to receive these updates in real-time, and the service handles the process of stopping those updates when you’re finished. The reports are saved to your logs folder, making them readily accessible for analysis and review. You also have the option to clear the data if needed, either for a specific combination or for everything.

## Class LiveLogicPublicService

This service helps you run live trading strategies smoothly and reliably. It acts as a bridge, simplifying how your strategies interact with the core trading engine. 

Think of it as a way to avoid constantly passing around information like the strategy name and exchange – it handles that automatically for you. 

It continuously runs your strategy, providing a stream of trading signals (open, close, or cancellation notifications) and automatically saving progress so that if something goes wrong, you can pick up right where you left off. It constantly checks the current time to make sure everything is progressing as it should.


## Class LiveLogicPrivateService

This service manages the ongoing process of live trading, acting as the engine that keeps everything running. It continuously monitors the market and reacts to signals, providing a stream of trading events – specifically when positions are opened or closed. Think of it as an infinite loop constantly checking for new opportunities and recovering gracefully if anything goes wrong.

The service uses an efficient, memory-friendly approach, sending you only the relevant information as it happens. It works by regularly checking the status of trading signals and giving you updates on trades as they begin and end, never pausing until explicitly stopped. Because it's designed to run indefinitely, it's built to automatically recover from crashes and pick up where it left off.

## Class LiveCommandService

This service acts as a central point for interacting with the live trading features of the backtest-kit framework. Think of it as a helper, simplifying how different parts of the system work together during live trading.

It bundles several other services—like those for validating strategies, exchanges, and risks—making it easier to manage dependencies.

The key function, `run`, is the workhorse: it launches and maintains a continuous live trading session for a specific symbol.  It’s designed to keep running indefinitely, automatically recovering from any errors that might pop up along the way.  When using it, you'll need to provide the symbol you're trading and some contextual information, such as the strategy and exchange names being used. The `run` function produces a stream of results detailing what's happening during the live trading process, like when a strategy opens, closes, or cancels a position.


## Class HeatUtils

This class, HeatUtils, is designed to make it easier to generate and manage portfolio heatmaps. It acts as a central point for accessing heatmap data and reports, automatically gathering information across all symbols used by a particular strategy. 

You can use it to retrieve aggregated statistics, like total profit and loss, Sharpe ratio, and maximum drawdown, for each symbol within a strategy. It also provides a convenient way to create and save these statistics as markdown reports. 

Think of it as a tool to quickly visualize and understand the performance of your trading strategies by generating clear, organized heatmaps. The class is always available as a single instance, simplifying its use throughout your backtesting process.

## Class HeatReportService

The HeatReportService is designed to track and record when trading signals close, allowing for a broad view of your portfolio’s performance through heatmap analysis. It listens for these closing events and saves the associated profit and loss (PNL) data to a database.

To avoid accidentally overloading the system, it only logs closed signals and ensures that you don't accidentally subscribe multiple times. 

You can start tracking these events by subscribing to the signal emitter, and when you're done, you can unsubscribe to stop the tracking process. It also uses a logger to help you debug any issues that might arise.

## Class HeatMarkdownService

The Heatmap Service helps you visualize and analyze your trading performance across different strategies and symbols. It keeps track of closed trades, calculates key metrics like profit, Sharpe Ratio, and maximum drawdown, and presents this information in an easy-to-understand format. 

Think of it as a central hub that gathers data from your trading signals and organizes it into meaningful reports.  The service automatically creates separate storage areas for each exchange, timeframe, and backtest mode, ensuring your data remains isolated and organized.

You subscribe to the service to receive updates as trades are closed. The service then compiles this information, letting you generate reports, view detailed statistics for each symbol, and save these reports as markdown files. It also has a built-in way to handle potential errors in calculations, ensuring that you always get a reliable report, and provides a convenient way to clear the data when you're finished analyzing it.

## Class FrameValidationService

The FrameValidationService helps you keep track of and make sure your trading timeframes are set up correctly. Think of it as a central place to register your different timeframe configurations, like daily, hourly, or weekly charts. 

Before your trading strategies try to use a timeframe, this service checks to ensure it's actually registered and valid. It remembers its checks, so it doesn’t have to re-validate frequently, making everything run faster.

You can add new timeframes with `addFrame`, verify an existing one with `validate`, and get a list of all registered timeframes using `list`. This service helps to prevent errors related to missing or misconfigured timeframes, which is especially important when automating trading.

## Class FrameSchemaService

This service acts like a central place to store and manage the blueprints, or schemas, for your backtesting frames. Think of it as a library where you define the structure of each frame – what properties it needs and what type those properties should be. 

It uses a special system to ensure everything is type-safe, meaning it helps prevent errors related to incorrect data types.

You can add new frame blueprints using `register()`, update existing ones with `override()`, and fetch them by name with `get()`. The service also performs checks to make sure your frame blueprints are structurally sound before they’re officially stored. This helps maintain consistency and avoids issues later on in your backtesting process.

## Class FrameCoreService

This service, `FrameCoreService`, is the central hub for managing timeframes within the backtesting environment. It works behind the scenes to provide the sequences of dates needed for running simulations. Think of it as the engine that powers the timeline of your backtest. 

It relies on other services to handle connection details and frame validation. To get a specific timeframe for a particular asset and timeframe name, you can use the `getTimeframe` method, which returns an array of dates for iteration. Essentially, it’s the tool that translates your desired backtest parameters into a usable timeline.


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different frame implementations within the backtest-kit. It automatically figures out which specific frame to use based on the current context, ensuring that operations are directed to the correct one.

To improve efficiency, it remembers previously created frames, so it doesn’t have to recreate them every time you need them. This memoization technique speeds things up considerably. 

The service also handles the timeframe used in backtesting, allowing you to easily define the start and end dates for your tests. When you’re running in live mode, there are no frame constraints, so the frameName will be empty.

Here's a breakdown of the key parts:

*   **`getFrame`**: This is your go-to method for getting a frame. Just give it a frame name, and it'll either return a cached instance or create a new one.
*   **`getTimeframe`**:  This function helps you set the boundaries of your backtest by retrieving the start and end dates for a specific symbol and frame.

## Class ExchangeValidationService

This service helps you keep track of your trading exchanges and make sure they're set up correctly. It acts like a central manager, registering each exchange you use and then verifying that it's available before your trading strategies try to connect. 

Think of it as a checklist: you add your exchanges to the service, and when you need to use one, the service double-checks that it's still valid.  It's designed to be efficient too – it remembers the results of previous checks so it doesn’t have to repeat them unnecessarily. You can easily add new exchanges, check if an exchange is valid, or get a complete list of all the exchanges you’ve registered.

## Class ExchangeUtils

The `ExchangeUtils` class is designed to simplify interactions with different cryptocurrency exchanges within the backtest-kit framework. It acts as a central helper, ensuring consistent and validated access to exchange data. Think of it as a toolbox for retrieving information like price history, order books, and trade data.

A key feature is its singleton design, meaning there's only one instance of this class, making it easy to use throughout your code. 

Retrieving historical price data (`getCandles`) is made straightforward, automatically adjusting the time range to ensure compatibility. It also offers a convenient way to calculate the average price (`getAveragePrice`) based on recent trading activity.  

When dealing with trade orders, `ExchangeUtils` handles the necessary formatting of quantities and prices (`formatQuantity`, `formatPrice`) to meet the specific precision requirements of each exchange.  You can also easily pull order book data (`getOrderBook`) and aggregated trade information (`getAggregatedTrades`). 

For advanced scenarios requiring precise control over the data fetched, `getRawCandles` provides flexible options for specifying date ranges and limiting the number of candles. It prioritizes preventing look-ahead bias by using the current time for calculations.

## Class ExchangeSchemaService

This service keeps track of the different exchange schemas your backtesting system uses. It's designed to be reliable and type-safe, ensuring your schemas are consistent.

You can add new exchange schemas using the `addExchange` function, and retrieve them later using their names.  Before adding a schema, the system quickly checks it to make sure it has all the necessary parts. 

If you need to update an existing schema, you can use the `override` function to make targeted changes.  Essentially, it's a central place to store and manage the blueprints for how your backtest interacts with various exchanges.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for interacting with exchanges within the backtesting framework. It combines exchange connection details with information about the specific backtest or live trading environment, like the symbol being traded and the date/time. Think of it as a layer that makes sure all exchange requests are aware of the context of the simulation or live trade.

It provides methods for retrieving various data points from exchanges, such as historical and future candles (for backtesting only), average prices, order books, and aggregated trades. Each of these methods takes into account the trading context, ensuring the exchange receives the appropriate information. There’s also a validation process to confirm the exchange configuration is correct, which it remembers to avoid repeatedly checking the same setup. Ultimately, this service is a foundational piece for both backtesting and live trading logic.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently directs your requests to the correct exchange based on the context of your trading operations. To optimize performance, it remembers the connection details for each exchange, so you don't have to repeatedly set them up. 

This service provides a consistent way to retrieve historical and real-time data, such as candles (price charts), order books, and trade history, regardless of the underlying exchange.  It also handles the complexities of formatting prices and quantities to adhere to each exchange’s specific rules, ensuring your orders and data requests are valid. When calculating average prices, it adapts to whether you're in a backtesting or live trading environment. You can get candles within a specific date range or fetch the next batch of candles based on your current execution time.

## Class ConstantUtils

This class provides predefined constants to help you set take-profit and stop-loss levels based on the Kelly Criterion and a decay system. Think of these as preset percentages designed to optimize your risk and reward strategy.

The constants, like TP_LEVEL1, TP_LEVEL2, TP_LEVEL3, SL_LEVEL1, and SL_LEVEL2, represent the percentage of the total distance to your ultimate take-profit or stop-loss target. For instance, TP_LEVEL1 is set at 30%, meaning it triggers when the price reaches 30% of the way to your final profit goal.  This allows you to gradually secure profits and manage risk along the way.

Essentially, you're breaking down your take-profit and stop-loss targets into smaller, strategic levels to improve your trading approach.

## Class ConfigValidationService

The ConfigValidationService is your safety net for setting up your trading configurations. It meticulously checks all your global settings to make sure they make mathematical sense and won't lead to unprofitable trades. 

It looks at things like slippage, fees, and profit margins to ensure they are all positive values. Crucially, it confirms that your minimum take-profit distance is large enough to cover all the trading costs – slippage and fees – so you can actually make money when your take-profit target is reached.

The service also makes sure that your settings have logical ranges – like ensuring stop-loss distances are properly related – and that time-based values are positive whole numbers. Finally, it verifies the settings related to candle data requests to prevent errors and ensure efficient data handling. Think of it as a final quality check before you start trading.

## Class ColumnValidationService

The ColumnValidationService helps make sure your column configurations are set up correctly. It checks your column definitions to ensure they follow the expected rules, preventing errors later on. 

Essentially, it verifies that each column has the necessary pieces of information – a unique key, a descriptive label, a formatting method, and a way to control its visibility. It also ensures that the keys you use for each column are unique and that the formatting and visibility settings are actually functions that can be executed. Think of it as a quality control system for your column setups.

## Class ClientSizing

This component, called ClientSizing, helps determine how much of an asset to trade based on various factors. It's like having a built-in calculator for your trading strategy. You can choose from different sizing methods, like using a fixed percentage, the Kelly criterion, or considering Average True Range (ATR).

It also allows you to set boundaries - minimum and maximum position sizes, and a limit on how much of your capital can be used for a single trade. Plus, you can add your own custom checks or record the sizing decisions as they're made. Ultimately, ClientSizing takes information about a trade and figures out the ideal position size for your strategy to execute.


## Class ClientRisk

ClientRisk helps manage risk across your trading strategies, acting as a gatekeeper to ensure no trades violate your limits. It prevents signals that would exceed maximum position counts or fail custom validation rules. Think of it as a central control point, shared by multiple strategies, allowing for a comprehensive view of your portfolio's risk exposure.

This system keeps track of all open positions, updating them as trades are made and removed when positions are closed. During initialization, it pulls position data from storage, although this step is skipped when running backtests. 

The core function, `checkSignal`, determines whether a new trade is permitted, considering factors like the symbol, strategy, exchange, and current market price.  If a signal fails validation, the check is immediately rejected. You can also define your own custom validation rules.

To keep things organized, `addSignal` registers newly opened trades, while `removeSignal` clears closed trades from the record.  This enables a robust and controlled trading environment.

## Class ClientFrame

This component, the `ClientFrame`, is responsible for creating the timelines your backtesting runs against. Think of it as the engine that produces the sequence of dates and times your trading strategies will be tested on. 

It's designed to be efficient, avoiding unnecessary recalculations by storing previously generated timelines. You can easily customize the interval between these dates – from one minute all the way to three days. 

The `ClientFrame` can also be extended with custom logic to verify the data it produces or to record details about the timeline generation process.  It works closely with the core backtesting engine to ensure accurate and timely simulations.

The `getTimeframe` method is the key function here - it’s how you request a specific timeline for a given asset.  Because it uses a caching mechanism, calling it repeatedly for the same period won't re-generate the timeline every time.

## Class ClientExchange

This class, `ClientExchange`, acts as a bridge to external exchange data, designed for backtesting trading strategies. It provides methods for retrieving historical and future candle data, calculating VWAP (Volume Weighted Average Price), and formatting trade quantities and prices according to exchange-specific rules.  The system prioritizes efficiency by using prototype functions to minimize memory usage.

To get historical data, `getCandles` fetches candles backwards from a specific point in time, aligning timestamps to the interval being requested.  `getNextCandles` does the same for future candles, useful for simulations where you need to look ahead for signal generation. `getAveragePrice` calculates VWAP based on recent 1-minute candles, using a configurable number of candles.

For trade representation, `formatQuantity` and `formatPrice` ensure data is presented correctly for the specific exchange you’re interacting with.  `getRawCandles` offers more flexibility, allowing you to specify start and end dates for candle retrieval.

The `getOrderBook` method retrieves the current order book, and `getAggregatedTrades` fetches a history of trades, carefully avoiding look-ahead bias – a crucial consideration for accurate backtesting.  Essentially, this class provides a controlled and standardized way to access exchange data for building and evaluating trading strategies.

## Class ClientAction

The `ClientAction` component acts as a central hub for managing and executing your custom action handlers. Think of it as the traffic controller for events related to your trading strategy. It initializes your handlers, ensures they only run once, and then routes different types of events – like signals from live trading, backtesting, breakeven alerts, or risk rejections – to the appropriate methods within your handler.

Your action handlers are where you’ll put the specific logic for things like updating your application's state (using tools like Redux or Zustand), sending notifications (via Telegram or email), or collecting data for analytics. `ClientAction` seamlessly integrates these handlers into the core backtest-kit system.

It offers methods like `signal`, `signalLive`, `signalBacktest`, and others to deliver event data to your handlers.  Important to note, `signalSync` is a special gateway for opening or closing positions, and any errors that occur during this process are passed directly to the `CREATE_SYNC_FN` function. It provides `dispose` functionality to ensure proper cleanup when the action handler is no longer required.

## Class CacheUtils

CacheUtils helps you easily manage caching for your functions, particularly when dealing with time-based data like candlesticks. It's designed to speed up your backtesting and analysis by storing results and reusing them when appropriate.

The `fn` function lets you wrap any function to automatically cache its results based on a chosen timeframe. This ensures that calculations are only performed when needed, saving valuable time.

For asynchronous functions that benefit from persistent storage, use the `file` function. It caches data to disk, making it available even across sessions. Files are organized in a specific directory structure, and using the same function reference ensures you reuse the same cache file.

If your function's implementation changes, or you want to free up memory, `flush` is your go-to. It removes the entire cache for a specific function, forcing recalculation. `clear` is a more targeted approach; it only clears the cache for the current testing scenario, leaving other scenarios unaffected.

Finally, `gc` helps keep things tidy by automatically removing outdated or expired cached entries, preventing unnecessary memory usage. This periodic cleanup keeps your cache efficient and relevant.

## Class BrokerBase

This class, `BrokerBase`, serves as a starting point for building connections to real-world exchanges within the backtest-kit framework. Think of it as a blueprint for how your trading system interacts with a broker. It handles the essential tasks like placing orders, managing stop-loss and take-profit levels, and keeping track of positions.

The beauty of this class is that it comes with pre-built "default" versions for all the key actions, so you don't have to write everything from scratch.  These defaults simply log what's happening, which is helpful for debugging and understanding the flow of your trading logic.

Here’s how it works:

1.  **Initialization:**  The `waitForInit()` method is called at the beginning to set up the connection to the exchange – logging in, loading configuration, and so on.
2.  **Events:** As your trading strategy runs, specific "commit" methods are triggered: `onSignalOpenCommit` (for opening a position), `onSignalCloseCommit` (for closing a position), `onPartialProfitCommit`, `onPartialLossCommit`, `onTrailingStopCommit`, `onTrailingTakeCommit`, `onBreakevenCommit`, and `onAverageBuyCommit` (for DCA entries).
3.  **Customization:** To connect to a real exchange, you’ll need to *extend* this class and override these methods to perform the actual trading actions – sending orders, updating limits, etc.

You won't need to implement every method – the defaults handle the logging, making development easier. This base class ensures a consistent structure and logging for all your broker integrations.

## Class BrokerAdapter

The `BrokerAdapter` acts as a middleman between your trading strategy and the actual broker. It's designed to ensure that every action your strategy takes – like opening or closing positions, setting stop losses, or averaging in – is properly handled and validated before it's sent to the broker.

Think of it as a safety net. If anything goes wrong during a trading operation, the `BrokerAdapter` prevents the change from being applied, keeping your trading state consistent.

During backtesting, these broker interactions are skipped entirely to speed up the process. However, in live trading, these calls are forwarded to your registered broker.

The `BrokerAdapter` also automatically handles signal events (open/close) using a subscription system, making those processes smoother. You explicitly call other methods to manage actions like partial profits, trailing stops, and break-even orders, ensuring everything is validated before execution.

You register your broker adapter using `useBrokerAdapter` before activating the adapter with `enable`.  `enable` sets up the automatic signal handling, while `disable` cleans it up. It's crucial to have a broker adapter registered before enabling, and the `enable` function returns a way to unsubscribe, ensuring clean behavior.

## Class BreakevenUtils

The BreakevenUtils class helps you understand and analyze breakeven events within your backtesting or live trading environment. Think of it as a tool for gathering and presenting information about when your strategies hit breakeven points.

It doesn’t create the breakeven events themselves; it collects and organizes data that's already been generated by other parts of the system. You can use it to get summary statistics like the total number of breakeven events.

It can also generate nicely formatted reports in markdown, showing individual breakeven events with details like the symbol, strategy used, entry price, and timestamp. These reports can be easily read and shared.

Finally, the class allows you to export these reports directly to files, which is handy for keeping records or sharing analyses with others. The file names are structured to easily identify the symbol and strategy they represent.

## Class BreakevenReportService

This service helps you keep track of when your trading signals reach the breakeven point, which is a crucial milestone. It acts like a recorder, capturing these breakeven events and saving them to a database so you can analyze them later.

The service listens for signals that hit breakeven and logs all the important details related to each event. It makes sure you don’t accidentally subscribe multiple times to avoid any confusion and ensures data persistence by writing the information to the Report database.

You can start receiving these event notifications by using the `subscribe` function, and when you're done, the `unsubscribe` function stops the recording. If you haven't subscribed, the `unsubscribe` function does nothing.

## Class BreakevenMarkdownService

This service is designed to automatically create and save reports detailing breakeven events for your trading strategies. It listens for these events and organizes them, generating easy-to-read markdown tables with all the important details. 

Essentially, it keeps track of when your strategies hit breakeven points and creates a record of them. You can then save these reports to your hard drive for analysis and review.

The service allows you to subscribe to receive these breakeven events, unsubscribe when you no longer need them, and retrieve summarized data or full reports for specific symbols and strategies. It also provides a way to completely clear the stored data when needed. Each symbol and strategy pairing gets its own dedicated storage area, ensuring your data remains organized and isolated.

## Class BreakevenGlobalService

The BreakevenGlobalService acts as a central hub for managing breakeven calculations within the trading system. It's designed to be injected into the core strategy logic, providing a single point for accessing breakeven functionality and ensuring consistent logging. Think of it as a middleman: when the strategy needs to check or clear a breakeven, it goes through this service.

This service doesn't actually *do* the calculations itself; instead, it passes those requests on to another component, the BreakevenConnectionService. Before forwarding, it records these actions in a central log, allowing for easy monitoring of breakeven activity.

Several other services, like those for validating strategy configurations, risks, exchanges, and frames, are also integrated to ensure data integrity.  The `validate` function is a handy shortcut, remembering previous checks to avoid unnecessary re-validation.  The `check` and `clear` functions are the primary ways to interact with breakeven calculations, with the GlobalService handling logging and delegation before they are processed.

## Class BreakevenConnectionService

This service helps track and manage breakeven points for trading signals. It acts as a central hub for creating and managing individual breakeven calculations, ensuring that you don’t have unnecessary calculations running.

Essentially, it keeps track of breakeven calculations for each trading signal, storing them efficiently so they're readily available when needed. The system avoids recreating these calculations repeatedly by cleverly caching them. 

The service receives configuration from other parts of the system and notifies other components when breakeven checks or clearings occur. When a signal is closed, this service cleans up the associated data to prevent memory issues and keep things organized. It's designed to be easily integrated and work behind the scenes to provide accurate and efficient breakeven tracking.

## Class BacktestUtils

This class, `BacktestUtils`, provides helper functions for running and analyzing backtests within the trading framework. It’s designed to be a single, easy-to-use point of access for common backtesting operations.

You can run a backtest for a specific symbol and configuration using the `run` method, which gives you results as they become available. If you just need to run a backtest to log information or trigger side effects without processing results, the `background` method will execute the backtest in the background.

To get information about a currently open position, you can use methods like `getPendingSignal`, `getTotalPercentClosed`, `getPositionAveragePrice`, or `getPositionPnlCost`. These functions provide details such as the current signal, position size, cost basis, and unrealized profit/loss.

The `stop` method lets you halt a backtest safely, while `commitCancelScheduled` and `commitClosePending` allow you to manually control the execution of signals. Several methods such as `commitPartialProfit` and `commitTrailingStop` enable modifying a position during the backtest.

Finally, `BacktestUtils` also includes functions to obtain backtest statistics (`getData`, `getReport`, `dump`), and check the status of running backtests (`list`). It uses a singleton pattern so you can access these functions conveniently anywhere in your code.

## Class BacktestReportService

The BacktestReportService helps you keep a detailed record of your backtesting strategy's activity. It acts like a diligent observer, capturing every signal event – from when a signal is idle to when it's opened, active, or closed.

Think of it as a way to debug and analyze your trading strategies after they've run. 

It does this by listening for signals from your backtest and storing these events in a database. To make sure things don't get overwhelming, it prevents multiple subscriptions, and provides a way to stop listening when you're done. The `subscribe` method handles setting up this listening process and returning a function to stop it, while `unsubscribe` provides a clean way to stop the listening process.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create detailed reports about your backtesting results, automatically saving them as markdown files. It works by listening to the trading activity during a backtest and keeping track of the closed trades for each strategy.

Essentially, it gathers data on each closed trade—things like entry and exit prices, profits, and losses—and organizes this information into neat, readable tables. These tables are then compiled into markdown reports, which are saved to a specific directory so you can easily review them.

You can customize the reports by choosing which data columns to display. You can also clear out the accumulated data when you’re done with a backtest, or just clear data for a specific strategy and symbol. 

To use it, you'll need to subscribe to the backtest events to make it listen for the trading data, and then unsubscribe when you don’t need it anymore. The service uses a clever system to ensure that data for different symbols, strategies, exchanges, and timeframes are kept separate.

## Class BacktestLogicPublicService

BacktestLogicPublicService helps you run backtests in a straightforward way. It builds upon a private backtest logic service, automatically managing important context information like the strategy name, exchange, and frame. This means you don't have to keep passing these details around to different functions – the system handles it for you.

Essentially, it streamlines the backtesting process.

The `run` method is your main tool for starting a backtest. You give it the symbol you want to backtest and it returns a stream of results – signals indicating closed trades, opened trades, and more – allowing you to analyze the strategy's performance. This method handles the context automatically, making your code cleaner and easier to understand.


## Class BacktestLogicPrivateService

This service is the engine that powers your backtesting process, designed to handle large datasets efficiently. It works by getting a sequence of timeframes, then stepping through each one, checking for trading signals. When a signal tells your strategy to open a position, it fetches the necessary historical price data (candles) and runs the backtesting logic.

It intelligently skips ahead in time to the point where the signal closes, and then reports that closed trade as part of the backtest’s results. Importantly, this process streams the results directly, meaning it doesn’t build up a massive array in memory—ideal for backtesting over long periods. 

You can even stop the backtest early if needed by interrupting the flow. The `run` method is the main way to start a backtest, and it returns an async generator that provides the trade results as they become available. It needs to know which stock symbol you want to backtest.

## Class BacktestCommandService

This service acts as a central point to kick off and manage backtesting operations. Think of it as a convenient way to access the core backtesting engine within the system. It's designed to be easily integrated into different parts of your application using dependency injection.

The service relies on several other components, like services for handling strategy schemas, risk and action validation, and the actual backtest logic itself. 

You can initiate a backtest for a specific trading symbol by calling the `run` method, providing details like the strategy name, exchange name, and frame name you want to use for the simulation. This method returns a series of results as the backtest progresses, giving you insights into how your strategy would have performed.

## Class ActionValidationService

This service helps keep track of and verify your action handlers, ensuring they’re set up correctly before your trading strategies run. Think of it as a central place to register and double-check all the actions your system can take. 

It's designed to be efficient too; once an action handler is validated, the result is stored so you don't have to re-check it every time.

You can use it to add new action handlers, check if a specific action is valid, or get a complete list of all registered actions. It keeps your action configurations organized and prevents errors by making sure everything is in place before your trades happen.


## Class ActionSchemaService

The ActionSchemaService helps you organize and manage the blueprints for your actions within the backtest-kit framework. Think of it as a central place to define how actions should behave, ensuring everything is set up correctly and consistently. 

It keeps track of these action blueprints in a way that's type-safe, preventing common errors. When you register a new action, it checks that your code follows the rules, making sure it only uses approved methods. You can even update existing action blueprints without having to recreate them from scratch. 

The service provides ways to add new action blueprints, confirm they are correctly formed, modify existing ones, and retrieve them when needed – all to keep your actions running smoothly and reliably. It relies on a tool registry for safe storage and ensures action handlers have the right methods.

## Class ActionProxy

ActionProxy acts as a safety net when using custom action handlers in your trading strategies. It’s designed to prevent errors within your code from crashing the entire backtesting or live trading system. Think of it as a wrapper that automatically catches and logs any errors that occur during key events like signal generation, breakeven adjustments, or cleanup. 

The system makes sure that even if a method is missing from your custom action handler (perhaps you don’t need a certain feature), the process continues smoothly—it defaults to returning `null` in those cases. Errors are logged and reported, but the trading process isn’t interrupted.

You create an ActionProxy by using the `fromInstance` method, providing your custom action handler. This ensures all the methods – like `init`, `signal`, `dispose`, and others – are protected with this error-catching layer. Notably, the `signalSync` method is an exception and intentionally doesn't use this error protection, as it needs to pass errors directly to the sync function. Essentially, it makes your custom actions much more robust and reliable.

## Class ActionCoreService

The `ActionCoreService` is the central hub for managing and executing actions within your trading strategies. It’s responsible for taking instructions defined in your strategy’s schema and putting them into action.

Essentially, it retrieves a list of actions from the strategy's configuration, verifies everything is set up correctly (like strategy names, exchanges, and risks), and then executes them one after another. This service is used both when running backtests and in live trading environments.

It has several key functions, each responsible for handling different types of events:

*   **`initFn`**: Prepares actions when a strategy is initialized, often loading any saved state.
*   **`signal` / `signalLive` / `signalBacktest`**:  These handle the core signal events, routing them to the appropriate actions to trigger trades or other behaviors. They have slightly different versions depending on whether you’re in live or backtesting mode.
*   **`breakevenAvailable` / `partialProfitAvailable` / `partialLossAvailable`**: These functions handle specific profit-taking or loss-limiting events, dispatching them to the relevant actions.
*   **`pingScheduled` / `pingActive`**: These functions manage ping events related to signal monitoring.
*   **`riskRejection`**: This handles situations where a signal fails a risk validation check, notifying the actions.
*   **`signalSync`**: This synchronizes actions across all registered actions, ensuring they all agree before proceeding.
*   **`dispose`**: Cleans up and releases resources when a strategy is finished.
*   **`validate`**:  A crucial function that checks if your strategy setup is correct before execution, avoiding errors later on. It caches the results to speed things up.
*   **`clear`**:  Allows you to clear action-related data, either for a specific action or globally.

The service relies on several other services to perform its functions, like validating exchanges, strategies, risks, and schemas. It essentially orchestrates the entire action execution process within your backtesting framework.

## Class ActionConnectionService

This service acts as a central hub for directing actions within your backtesting or live trading environment. It intelligently manages and routes different types of events – like signals, breakeven notifications, partial profit/loss updates, and scheduled pings – to the correct action handler. 

Think of it as a traffic controller, ensuring each event reaches the appropriate component based on the action's name, the strategy it belongs to, and the trading frame it's operating within.

To optimize performance, it uses a clever caching system.  It remembers which action handlers it has already created, so it doesn't need to recreate them every time – this saves valuable resources.  You can even clear this cache manually if needed.

The service also handles initialization, ensuring that action handlers are properly set up and loaded with any necessary persistent data. This ensures smooth operation and efficient data management for your trading strategies.


## Class ActionBase

This base class, `ActionBase`, is designed to help you build custom components that react to events within the backtest-kit trading framework. Think of it as a foundation you extend to add your own logic for things like sending notifications, tracking performance, or managing external systems.

It handles the tedious work of logging events and provides access to important information like the strategy's name and the context of the action. You only need to implement the specific methods you need for your custom actions – all others have default implementations.

Here's a breakdown of how it works:

*   **Initialization:** When you create an action, it's provided with key details like the strategy and frame names.  You can use the `init()` method to perform any setup tasks like connecting to a database or initializing an API client.
*   **Event Handling:** The framework calls different methods on your action as events occur, such as a new signal being generated (`signal`), a breakeven being reached (`breakevenAvailable`), or a risk rejection happening (`riskRejection`).  There are separate methods for live trading (`signalLive`) and backtesting (`signalBacktest`).
*   **Lifecycle:**  The `dispose()` method ensures you can clean up any resources when the action is no longer needed.

By extending `ActionBase`, you can easily create powerful and reusable components to tailor the trading framework to your specific needs.
