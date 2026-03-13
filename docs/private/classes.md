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

This service helps you keep track of and make sure your "walkers" – those configurations that define ranges for optimizing your trading strategies – are set up correctly. Think of it as a central place to register your walkers, check if they're valid before you use them, and quickly access a list of all the walkers you’ve defined. It remembers validation results to make things faster, too.

You can add new walker configurations using `addWalker()`. Before running any tests or strategies that rely on a particular walker, it’s a good idea to use `validate()` to confirm it exists. If you need to see all the walkers you have registered, the `list()` method will give you a list of them. The service keeps a record of all your walkers and validates their setup to help ensure everything runs smoothly.

## Class WalkerUtils

WalkerUtils simplifies working with walkers, which are essentially sets of trading strategies tested together. It provides easy ways to start, stop, and retrieve data from these walkers. Think of it as a helper tool for managing and understanding how different strategies perform.

It allows you to run walkers, either to get their results directly or in the background for tasks like logging. You can also stop a walker to prevent it from generating new trading signals.

If you need to see how a walker performed, WalkerUtils can generate a detailed markdown report or save it to a file. It also provides a way to check the status of all running walkers. The system ensures that each walker instance is isolated for different symbols and avoids interference between different walker runs.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of different trading strategies, or "walkers," and their configurations in a structured and organized way. It acts as a central place to store and manage these strategy definitions.

Think of it as a library for your trading strategies – you can add new ones, find existing ones, and even update them. It ensures these strategy configurations are in the correct format, preventing errors and keeping things consistent. 

The service uses a special system to make sure the information stored is of the expected types, and it offers ways to register, retrieve, and update these strategy definitions. You can register a new strategy, retrieve one by its name, or update an existing one with just the changes you need.

## Class WalkerReportService

The WalkerReportService is designed to keep a detailed record of your strategy optimization experiments. It acts as a listener, quietly observing the progress of your walker strategies and neatly storing the results in a SQLite database. 

Think of it as a meticulous record-keeper, noting down important metrics and statistics for each test run. It not only logs individual results but also tracks the overall optimization progress and identifies the best-performing strategy so far. 

To use it, you subscribe to the walker emitter, and it automatically handles logging the results. When you're finished, you simply unsubscribe to stop the logging process. The service prevents you from accidentally subscribing multiple times, keeping things clean and organized.

## Class WalkerMarkdownService

The WalkerMarkdownService is designed to automatically create and save reports about your backtesting strategies. It keeps track of how each strategy performs during a backtest, accumulating detailed results as the backtest progresses. These results are then organized into clear, easy-to-read markdown tables that compare the different strategies.

To start, you subscribe to the backtest's progress events, and the service listens for updates. It uses a special storage system to ensure each backtest run (or 'walker') has its own set of results, keeping things organized. You can then use the service to generate reports for specific strategies, symbols, or metrics, and it will save these reports as markdown files, conveniently located in your logs directory. There's also a way to clear out all the accumulated data if you need to start fresh.

## Class WalkerLogicPublicService

This service helps manage and run your trading strategies, also known as "walkers." It builds upon a private service to make sure important information like the strategy's name, the exchange being used, the timeframe, and the walker's name are automatically passed along where needed.

Think of it as a helper that simplifies the process of running your backtesting scenarios.

It has a few key components: a logger for tracking activity, a private service it relies on for the core logic, and a schema service for understanding the structure of your walkers.

The `run` method is the main way to use this service. You give it a stock symbol and some context information, and it will execute backtests for all your strategies, ensuring that the context is correctly set for each one.


## Class WalkerLogicPrivateService

WalkerLogicPrivateService helps manage and compare different trading strategies, essentially orchestrating a "walk" through them. It takes a symbol, a list of strategies you want to compare, a metric to evaluate them by (like profit or drawdown), and some contextual information about your trading environment. 

As each strategy finishes its backtest, you’ll receive updates on its progress. The service keeps tabs on the best-performing strategy as things go along, and finally, it provides a ranked report showing how all the strategies stack up against each other. Behind the scenes, it uses other services to handle the actual backtesting and formatting of the results. It sequentially runs each strategy using BacktestLogicPublicService.

## Class WalkerCommandService

WalkerCommandService acts as a central access point for interacting with the walker functionality within the backtest-kit framework. Think of it as a convenient layer on top of the core walker logic, designed for easy integration into your applications. It manages dependencies and provides a simple interface for executing walker comparisons.

The service relies on several other services to handle tasks like logging, validating strategies, exchanges, frames, and walkers, ensuring everything is set up correctly before execution. 

The core function, `run`, is how you trigger a walker comparison. You provide it with a symbol (like a stock ticker) and some context – the names of the walker, exchange, and frame you want to use.  It then returns a sequence of results from the comparison.

## Class TimeMetaService

The TimeMetaService helps you reliably track the most recent candle timestamp for your trading strategies. It's designed to provide this timestamp even when you're not actively executing a trade, such as when running commands between ticks. 

Think of it as a central record of the current time for each strategy, symbol, exchange, and timeframe combination. This record is constantly updated as your strategies process data. It will wait for a short time if the timestamp hasn't arrived yet.

If you’re already running within a trading execution, it uses a shortcut to get the time; otherwise, it looks up the last known timestamp. Importantly, you can clear the service’s memory if needed, either for a single strategy or all of them, ensuring you're not relying on outdated information. It's essentially a way to always know what time it is in your trading world.

## Class SyncUtils

The SyncUtils class helps you understand what's happening with your trading signals. It collects information about when signals are opened and closed, allowing you to analyze performance and identify potential issues.

You can use it to get statistical summaries of your signal activity, like the total number of signals opened and closed. It also lets you generate detailed reports in Markdown format, presenting the signal events in an organized table. This report includes important information like signal direction, prices, profit/loss, and timestamps.

Finally, SyncUtils provides a convenient way to save these reports to a file on your computer, making it easy to review and share your trading data. The reports are named with the symbol, strategy, exchange and frame to easily identify them.

## Class SyncReportService

This service helps you keep a detailed record of when your trading signals are created and closed, which is really useful for checking and understanding your trading activity. It listens for events related to signal openings (like when a limit order gets filled) and signal closures (like when a position is exited). 

It captures important information for each event, such as the details of the signal when it’s opened and the profit/loss (PNL) and reason for closure when it’s closed. These events are then saved in a structured report format for easy auditing.

To get it working, you need to subscribe to the service to start listening for these events, and you can unsubscribe later when you don't need it anymore. The service ensures that only one subscription is active at a time, preventing unwanted or duplicated logs. You can also use a logger service for debugging.

## Class SyncMarkdownService

The SyncMarkdownService helps you automatically create reports detailing your signal synchronization events. It keeps track of signal activity – when signals open and close – for each specific combination of symbol, strategy, exchange, timeframe, and backtest scenario.

Essentially, it listens for signal events, organizes them, and then generates neatly formatted markdown tables summarizing the signal lifecycle for each of those scenarios. You can also get overall statistics like the total number of events, opens, and closes.

The service saves these reports directly to your disk in a designated "dump/sync/" folder. You can customize what information appears in the reports and where they're saved.

You can subscribe to the service's events and later unsubscribe, and there are methods to retrieve the stored data, generate reports, clear the data, and trigger a report dump.

## Class StrategyValidationService

The StrategyValidationService helps you keep track of your trading strategies and make sure they're set up correctly. Think of it as a central hub for managing your strategy configurations. 

You can register new strategies using `addStrategy`, providing a name and its configuration details. Before you start trading, `validate` checks to ensure a strategy exists and that any related risk profiles and actions are also valid. 

To see what strategies you've registered, the `list` function returns a complete overview. The service is designed to be efficient, remembering previous validation results to speed things up. It relies on other services for risk and action validation.

## Class StrategyUtils

StrategyUtils helps you understand how your trading strategies are performing by providing access to data and reports about their actions. Think of it as a tool to review what your strategies have been doing – things like taking profits, setting stop losses, and canceling orders.

You can use it to get summarized statistics about your strategies, showing you how often different actions were taken.  It also creates detailed reports in a readable Markdown format, presenting each strategy event in a table with important information like the symbol traded, the action taken, the price, and the time.

Finally, it can automatically save these reports to files, so you can easily track and analyze your strategies' behavior over time. The reports are neatly organized with a consistent naming convention, making it easy to find specific reports later.

## Class StrategySchemaService

This service helps you keep track of your trading strategies and their configurations. It acts like a central database for strategy blueprints, ensuring everyone uses the correct structure.

You can add new strategy definitions using the `addStrategy` function, and retrieve them later by their name when you need them.  Before a strategy is added, it’s quickly checked to make sure it has all the necessary parts.

If a strategy already exists, you can update parts of it using the `override` function.  This lets you make small changes without redefining the whole strategy. The `loggerService` property provides access to logging functionality for debugging and monitoring.

## Class StrategyReportService

This service helps you keep a detailed record of your strategy's actions, like when it cancels orders, closes positions, or adjusts stop-loss levels. Think of it as creating an audit trail for your backtesting or live trading.

To start using it, you need to "subscribe" to begin logging events.  Then, whenever your strategy performs one of the tracked actions (like taking a partial profit or setting a trailing stop), the service automatically writes a record to a JSON file.  This is different from other reporting methods that keep everything in memory; this service writes each event immediately.

When you're finished, you "unsubscribe" to stop the logging and clean up any resources.  The service provides specific functions for logging different types of events, each capturing relevant details like the symbol, price, and position size. It’s designed to ensure that each event is recorded reliably and provides a comprehensive overview of your strategy’s behavior.

## Class StrategyMarkdownService

This service helps you keep track of what your trading strategies are doing during backtests or live trading. Instead of writing every event to a file immediately, it gathers them in memory for more efficient reporting.

Think of it as a temporary data warehouse for your strategy's actions like canceling orders, closing positions, and adjusting stops. You can then request statistics, generate nicely formatted markdown reports, or save those reports to files.

To start using it, you need to "subscribe" to begin collecting events.  Once subscribed, events are recorded automatically as your strategy executes.  When you're ready, you can get detailed data, generate reports (which can be saved to files), or clear the collected information. When you're finished, be sure to "unsubscribe" to stop the collection and release the memory.

It uses a clever caching system to manage data for each specific trading symbol, strategy, exchange, frame, and backtest/live status, ensuring it's efficient and organized.  You can clear the accumulated data selectively for specific scenarios or clear everything at once.

## Class StrategyCoreService

The `StrategyCoreService` is a central hub for managing trading strategies within the backtest kit. It acts as a bridge, injecting essential information like the trading symbol, timeframe, and backtest mode into the strategy’s execution environment. Think of it as an orchestrator, coordinating various validation and data retrieval tasks related to strategy operation.

Here's a breakdown of what it does:

*   **Validation & Configuration:** It rigorously checks strategy setups, risks, and exchange configurations.  This is done efficiently by memoizing validations, preventing repeated checks.
*   **Signal Retrieval:**  It provides methods to fetch pending signals (active trades), scheduled signals (future trades), and related position information like cost basis, invested amounts, P&L, and entry details.
*   **Position Management:** It offers functions to manipulate a strategy's position, including partial profit/loss closures, adjusting stop-loss and take-profit levels, and adding new DCA entries.
*   **State Queries:**  It allows you to check the state of a strategy (like whether it’s stopped or has a pending signal) without actually triggering actions.
*   **Backtesting & Ticking:** It handles the execution of backtests and individual 'ticks' (updates) for strategies.
*   **Clean-up:** It provides methods to safely dispose of and clear strategy instances.



Essentially, this service provides a controlled and reliable way to interact with and manage trading strategies within the framework, ensuring consistency and accuracy in backtesting and live trading scenarios.

## Class StrategyConnectionService

This service acts as a central hub for managing strategy operations, ensuring they're routed to the correct strategy implementation. It intelligently caches these strategy instances to improve performance, avoiding unnecessary re-creation.

Think of it as a smart dispatcher – when a trading action needs to be performed, this service figures out *which* strategy is responsible for that particular symbol and exchanges the call.  It remembers previously used strategies so it can quickly reuse them.

Before any operations occur, it makes sure the strategy has properly initialized. It handles both live ("tick") and backtesting ("backtest") scenarios.

It also provides handy methods for getting information about a strategy's position, like the percentage closed, cost basis, entry prices, and pending signals. This is helpful for monitoring and analyzing trade activity.  You can check if a strategy is stopped or has a pending signal, and even force close or cancel actions.  Essentially, it gives you a comprehensive toolkit for interacting with and managing strategies in your trading system.

## Class StorageLiveAdapter

The `StorageLiveAdapter` provides a flexible way to manage how your backtesting framework stores trading signals. Think of it as a central point that connects your strategy to a specific storage method – whether that's saving data to a file, keeping it only in memory, or using a dummy adapter for testing purposes. It's designed to be easily swapped out, so you can switch between persistent storage, in-memory storage, or even a "dummy" storage that does nothing, all without changing your core strategy logic.

It offers convenience methods like `usePersist()`, `useMemory()`, and `useDummy()` to quickly select your desired storage method, and handles events like signals being opened, closed, scheduled, or cancelled by passing these on to the selected storage. You can also find signals by ID or list all stored signals. The `useStorageAdapter` method lets you define your own custom storage adapters if you need something beyond the built-in options.

## Class StorageBacktestAdapter

The `StorageBacktestAdapter` provides a flexible way to manage data during backtesting, allowing you to choose different storage methods. It acts as a middleman, letting you swap out how your backtest data is stored without changing the core backtesting logic.

You can easily switch between three storage options: persistent storage (saves data to disk), in-memory storage (data exists only during the backtest run), and a dummy storage (essentially ignores all storage operations).

The adapter handles events like signals being opened, closed, scheduled, or cancelled, passing those actions along to the currently selected storage method.  You can also retrieve a signal by its ID or list all signals. 

The `useStorageAdapter` method lets you completely customize which storage implementation is used, while `useDummy`, `usePersist`, and `useMemory` offer convenient shortcuts to the most common choices.

## Class StorageAdapter

The StorageAdapter is the central hub for managing your trading signals, whether they're from past backtests or current live trading. It automatically keeps track of new signals as they come in, making sure your data is always up-to-date. 

You can easily access signals regardless of their origin – backtest or live – through a consistent interface. To avoid any accidental duplicates, it uses a clever system to ensure you only subscribe to signal updates once.

To start using the adapter, you enable it to begin listening for signals; disabling it cleanly removes those listeners. You can search for specific signals by their unique ID, or retrieve lists of all backtest or live signals currently stored.


## Class SizingValidationService

This service helps you keep track of and verify your position sizing strategies, ensuring everything is set up correctly before you start trading. It acts as a central place to register your different sizing approaches, like fixed percentage or Kelly Criterion, and checks to make sure they're actually registered before you try to use them. 

The service remembers its validation results to speed things up, and you can easily see a complete list of all the sizing strategies you've registered. Adding a new sizing strategy is as simple as registering its details, and you can check if a sizing strategy exists, optionally confirming its method, before applying it to your trades.

## Class SizingSchemaService

The SizingSchemaService helps you keep track of different sizing strategies for your trading backtests. Think of it as a central place to store and manage these sizing rules. It uses a system that ensures your sizing schemas are correctly formatted before they're added, preventing errors down the line. 

You can add new sizing strategies using the `register` method, or update existing ones with `override`. If you need to use a specific sizing strategy, the `get` method allows you to retrieve it by its name. This service makes sure your sizing configurations are organized and consistent throughout your backtesting framework.

## Class SizingGlobalService

This service handles the complex math behind determining how much of an asset to trade. It acts as a central point for size calculations within the backtesting framework, relying on other services to help with the process. Think of it as a calculator that takes your risk tolerance and other factors into account to figure out the right position size. 

It uses a `SizingConnectionService` to connect to external resources and a `SizingValidationService` to ensure the calculations are valid. The `calculate` method is the core function, taking parameters like risk amounts and context information to return a calculated position size. The service is designed for internal use within the framework but is also accessible through the public API.


## Class SizingConnectionService

The SizingConnectionService acts as a central hub for all position sizing calculations within the backtest-kit. It ensures that sizing requests are directed to the correct sizing method, like fixed-percentage or Kelly Criterion, based on a specified name. 

To improve efficiency, it remembers (caches) the sizing methods it's used, so it doesn't have to recreate them every time. 

Think of it as a smart router, connecting your trading strategy to the right sizing tool, and keeping things fast. If your strategy doesn't have any custom sizing rules, it will use an empty sizing name. 

It relies on other services, like a sizing schema service and a logger, to manage configurations and track activity. You can get a sizing object through `getSizing` and calculate a position size using the `calculate` method, providing the sizing name and necessary parameters.

## Class ScheduleUtils

The `ScheduleUtils` class helps you understand how your scheduled trading signals are performing. Think of it as a central place to monitor signals that are waiting to be executed. 

It keeps track of signals that are queued up, those that get cancelled, and can calculate things like how often cancellations happen and how long signals are waiting.

You can easily request data about scheduled signals for a specific trading pair and strategy, or generate a readable markdown report summarizing the signal activity. This report can be saved to a file for later review. The class is designed to be simple to use, acting as a readily available tool for observing and analyzing your trading schedule.

## Class ScheduleReportService

This service helps you keep track of when your trading signals are scheduled, opened, and cancelled, especially useful for understanding delays in order execution. It listens for signal events and records important information like when a signal was scheduled, when it started processing, and when it was cancelled. 

The service automatically calculates how long signals take between scheduling and when they actually begin or are cancelled. It stores these records in a database so you can analyze them later. To make sure you don't accidentally subscribe multiple times, it uses a mechanism that prevents duplicate subscriptions.  You can easily subscribe to receive these signal events and unsubscribe when you no longer need them.

## Class ScheduleMarkdownService

The ScheduleMarkdownService is designed to keep track of when trading signals are scheduled and cancelled, and then create easy-to-read reports about them. It listens for these signal events and organizes them by strategy. These events are then compiled into markdown tables, including helpful statistics like cancellation rates and wait times. 

The service stores these reports as markdown files in a specific directory, making it simple to review and analyze your trading activity. You can retrieve statistics, generate reports, save them to disk, or even clear the stored data entirely if needed. This allows you to gain insights into signal scheduling, identify potential issues, and optimize your trading strategies. Think of it as an automated record-keeper for your signal events, presented in a clear and understandable format.

## Class RiskValidationService

This service helps you keep track of your risk management configurations and makes sure they’re set up correctly before your trading strategies run. Think of it as a central place to register and verify your risk profiles. 

You can add new risk profiles using the `addRisk` method, and use `validate` to confirm that a specific profile exists before it's used in a trade.  The service also remembers previous validation results to speed things up, and the `list` method lets you see all the risk profiles you've registered.  This is designed to make sure your risk management rules are in place and working as expected, contributing to a safer and more reliable trading environment.

## Class RiskUtils

The RiskUtils class helps you analyze and understand risk rejections within your trading system. Think of it as a tool for examining why trades were blocked or modified due to risk controls. 

It gathers data about rejected trades – including details like the symbol, strategy used, position size, price, and reason for rejection – and presents it in helpful ways. You can request statistics about the total number of rejections, broken down by symbol or strategy. 

The class can also generate clear, readable markdown reports that list all the rejection events, along with summary statistics at the bottom. Finally, it makes it easy to save these reports to a file, so you can review them later or share them with others. This allows you to monitor risk control performance and identify areas for improvement.

## Class RiskSchemaService

The RiskSchemaService helps you organize and manage your risk schemas, ensuring they are correctly structured and accessible. It uses a special type-safe storage system to keep track of these schemas. 

You can add new risk profiles using the `addRisk()` method (which is represented internally by `register`), and retrieve them later using their names with `get()`.  The service also has a built-in check, `validateShallow`, to quickly confirm that new schemas have the necessary components before they are added.  If you need to update an existing schema, the `override()` method lets you make targeted changes without replacing the entire schema.

## Class RiskReportService

This service helps you keep track of when your risk management system rejects trading signals. It acts as a listener, picking up details about those rejected signals – like why they were rejected and what the signal was – and saving that information in a database. 

Think of it as an audit trail for your risk management decisions. You can use the stored data to analyze patterns, understand the causes of rejections, and improve your risk controls.

To start using it, you'll subscribe to the risk rejection events. The service ensures you won't accidentally subscribe multiple times. When you're done, you can unsubscribe to stop receiving those rejection events.

## Class RiskMarkdownService

This service helps you automatically create and save reports detailing risk rejections during your trading backtests. It keeps track of every time a trade is rejected based on risk rules, organizing these events by the specific trading symbol, strategy, exchange, frame, and whether it's a backtest or live trade.

The service listens for risk rejection signals and compiles them into readable markdown tables, along with helpful statistics like the total number of rejections and a breakdown by symbol or strategy. You can then save these reports to a file on your computer, making it easy to analyze and understand the risk management effectiveness of your strategies.

You can subscribe to receive these rejection events and unsubscribe when you're done. There are also methods to retrieve the accumulated data, generate the reports, save them to disk, and even clear the collected data if you need to start fresh. Each combination of symbol, strategy, exchange, frame, and backtest scenario gets its own dedicated storage for accurate and isolated reporting.

## Class RiskGlobalService

This service manages and validates risk limits within the trading framework. It acts as a central point for risk-related operations, using a connection service to ensure trades adhere to predefined limits. 

The service keeps track of validations to avoid unnecessary checks and provides logging for transparency. You can use it to determine if a trading signal is permissible based on risk rules, register open signals, and remove closed signals.  

It also offers a way to clear existing risk data, either for a specific configuration or a complete reset. This helps maintain a clean slate for risk management and testing. The core components include logging, risk connection, validation, and frame validation services, all working together to ensure responsible trading practices.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks within your trading system. It intelligently routes requests to the correct risk management component based on the specific risk being assessed, using a name you provide. To speed things up, it remembers which risk components it's already created, so it doesn't have to recreate them repeatedly.

It lets you check if a trading signal is safe to execute by validating things like potential drawdown, how much of your portfolio is exposed to a particular symbol, and your daily loss limits.  When a signal is rejected due to a risk limit, the system will notify you.

You register open positions with this service so they can be monitored for risk, and you also tell it when positions are closed. This allows the system to track your risk exposure accurately. You can also clear the system's memory of specific risk configurations when they're no longer needed. Strategies without any risk configuration will use an empty string for the risk name.

## Class ReportUtils

ReportUtils helps you control which parts of your backtest or trading system generate detailed logs. It lets you turn on logging for things like backtest runs, live trading, or performance analysis, and just as easily turn them off when you don't need them.

You can selectively enable specific report types, and it's crucial to remember to "unsubscribe" from those reports when you’re done to avoid problems with your program’s memory.

If you want to stop logging for certain areas without affecting others, use the disable function. This method instantly stops the logging for the specified services.

## Class ReportBase

ReportBase helps you save your trading data in a structured way, specifically designed for analyzing performance after the fact. It writes each event as a line in a JSON file – think of it like a logbook for your trades. 

It creates the necessary folders automatically and handles writing data efficiently, making sure it doesn’t overwhelm the system.  It’s also built to be reliable; if a write takes too long, it’ll alert you, preventing data loss.  You can easily search through the logged data, filtering by things like the trading symbol, the strategy used, or the exchange involved.

The `waitForInit` method sets everything up initially, and you use `write` to actually add data to the log file.  The `write` method automatically includes important information with each event, such as timestamps and metadata, making the data ready for analysis.

## Class ReportAdapter

This component helps manage and store your backtesting results and other related data in a structured way. It uses a flexible design that lets you easily switch between different storage methods, like writing data to JSONL files or using other custom storage solutions. It's designed to avoid creating multiple instances of the same storage, ensuring efficiency and consistency throughout your application.

You can customize how data is stored by providing your own storage adapter. 

It automatically creates the necessary storage when you first write data, and it’s built to handle real-time event logging. There’s also a handy "dummy" mode that lets you temporarily disable data writing for testing or debugging purposes. You can easily switch back to the default JSONL storage with a single function call.

## Class PriceMetaService

PriceMetaService helps you get the latest market price for a specific trading setup, like a particular symbol, strategy, exchange, and timeframe. It keeps track of these prices in a clever way, using a special system that updates automatically as new data comes in.

Think of it as a convenient place to look up the current price when you need it, even when you're not actively executing a trade. If the price hasn't arrived yet, it will wait patiently for a short time.

You can clear out this stored price data when you start a new strategy or test to ensure you’re always working with fresh information. It's designed to be managed automatically, but you have the option to clear specific prices or everything at once. It’s a single, central service for managing these price snapshots.

## Class PositionSizeUtils

This class offers helpful tools for figuring out how much of an asset to trade, making sure your position size aligns with your strategy. Think of it as a calculator for trading, giving you different ways to determine your position size based on factors like your account balance, the asset’s price, and risk tolerance.

It provides several pre-built calculation methods:

*   **Fixed Percentage:**  This method uses a set percentage of your account balance for each trade.
*   **Kelly Criterion:** This is a more advanced method aiming to maximize long-term growth based on your win rate and win/loss ratio.
*   **ATR-based:**  This approach uses the Average True Range (ATR) to help you size your position based on the asset’s volatility.

Each of these calculations checks to make sure the information you provide makes sense for the sizing method you've chosen, so you can be confident in the results.  It's designed to be easy to use – just call the appropriate method with the necessary details.

## Class PersistStorageUtils

This class helps you save and load the data for your trading signals so you don't lose progress, even if something goes wrong. It cleverly manages how these signals are stored, making sure things are reliable.

The system keeps track of each signal individually, storing them as separate files identified by their unique ID. When the program starts, it reads these files to bring everything back to where you left off. When signals are updated, it writes the new information to disk, doing so in a way that protects against data loss if your computer crashes.

You can even customize how the signals are stored – for instance, you can choose to use a standard JSON format or switch to a "dummy" mode that basically ignores all storage requests which is useful for testing. This makes it flexible for different use cases. The class also uses a system of "adapters" to handle the actual storage process, so you can swap in different methods as needed.

## Class PersistSignalUtils

This class helps manage how trading signals are saved and restored, particularly for strategies running in live mode. It ensures that signal data is stored reliably, even if the system crashes. 

It provides a way to use different storage methods, including the default JSON format and a "dummy" option for testing where no data is actually saved. You can also register your own custom storage mechanisms.

The `readSignalData` method fetches saved signal information, while `writeSignalData` stores new signals to disk, ensuring the writes are done safely to prevent data loss. This system keeps track of signals for each trading symbol and strategy.

## Class PersistScheduleUtils

The PersistScheduleUtils class helps manage how scheduled signals are saved and loaded, particularly for trading strategies. It ensures that the saved data for each strategy is consistent and reliable, even if the system crashes.

Think of it as a helper that stores and retrieves information about your trading signals, making sure they're available when you need them.

It provides a few ways to handle this storage:
*   You can use the built-in JSON storage.
*   You can connect it to your own custom storage system.
*   Or, for testing, you can use a dummy adapter that just pretends to save data (and does nothing).

The `readScheduleData` method fetches saved signal information, while `writeScheduleData` saves new or updated signal data, doing so in a safe way to prevent data loss. The `usePersistScheduleAdapter` method lets you plug in alternative ways to store this data.

## Class PersistRiskUtils

This class, PersistRiskUtils, helps manage how your trading positions are saved and loaded, particularly when dealing with risk management. It's designed to keep track of active positions and ensure that information isn't lost, even if something unexpected happens.

It intelligently handles storage, using different methods depending on how you want to persist your data—you can even plug in your own custom storage solutions. 

The `readPositionData` method retrieves your saved position data, while `writePositionData` saves your current position information safely to disk using atomic writes to prevent data corruption. It's used by the ClientRisk system to load and save your trading state.

You can easily switch between different persistence methods; for example, using JSON for standard storage or a dummy adapter for testing purposes when you don't want any data to be saved. This provides flexibility in how you manage your risk data.

## Class PersistPartialUtils

This class, PersistPartialUtils, helps manage how your trading strategy's profit and loss data is saved and loaded, especially important for keeping things running smoothly even if there are unexpected interruptions. It intelligently stores these partial results, keeping track of them separately for each symbol and strategy you're using. 

You can customize how this data is stored by using different persistence adapters, or easily switch back to the built-in JSON storage. There’s also a handy “dummy” adapter which is useful for testing – it pretends to save data but actually does nothing. The class takes care of safely reading and writing these partial results, ensuring data isn’t lost and that the process is handled reliably. When starting up, the system uses it to retrieve previously saved data. After updates to profit and loss levels, it saves them back, using a process designed to prevent corruption.

## Class PersistNotificationUtils

This class provides tools for safely saving and retrieving notification data, ensuring your application can recover even if there are unexpected interruptions. It helps manage how notifications are stored, using a special mechanism to handle each notification individually as a separate file.

You can customize how these notifications are saved by registering different "adapters" – essentially, different ways of storing the data. There's even a built-in option for testing purposes that simply ignores any save attempts, useful for quickly developing without persistent storage.

The `readNotificationData` method loads all saved notification information, while `writeNotificationData` handles saving new or updated notifications. These methods are designed to be reliable, using techniques to prevent data loss in case of crashes. It's primarily used by other components to handle the underlying storage details.

## Class PersistMeasureUtils

This class, PersistMeasureUtils, helps manage storing and retrieving data from external sources, like APIs, in a reliable and consistent way. It acts like a central manager for caching API responses, ensuring that data is saved correctly and can be accessed quickly. 

It organizes cached data into "buckets" based on timestamps and symbols, making it easy to find exactly what you need. You can even customize how the data is stored using different adapters – think of adapters as different ways to save files.

The class uses special techniques to make sure that data is written safely, even if something goes wrong during the process. If you’re using `Cache.file` for persistent caching, this class works behind the scenes to keep things running smoothly.

Here's a quick overview of what you can do with it:

*   **Read data:** Retrieve previously cached API responses.
*   **Write data:** Store API responses so you don’t have to fetch them again.
*   **Customize storage:** Choose different adapters to control how data is saved.
*   **Switch adapters:**  Easily switch between different storage methods, including a dummy adapter for testing.

## Class PersistLogUtils

This utility class helps manage how log entries are saved and retrieved. It keeps track of the storage being used and makes sure that operations are done safely, even if something goes wrong.

It allows you to switch between different ways of storing log data, like using a standard JSON format or even a "dummy" adapter that simply ignores writes—useful for testing. 

The class handles reading all log entries from storage, and critically, it saves each log entry as a separate file identified by its unique ID, ensuring data integrity. It's designed to be reliable, even if the system crashes unexpectedly. You can also create and register your own custom methods for saving and loading log data.


## Class PersistCandleUtils

This class helps manage a cache of historical candle data, storing each candle as a separate file on disk for resilience. It’s designed to work with ClientExchange to keep candle data readily available.

The cache validates itself – it will only return data if it has all the candles you’ve requested. If any candles are missing, the whole cache is considered invalid.

To write data, it expects validated candles that match specific criteria: they must align with the requested time range, have the correct number of candles, and be fully closed.  Writes are handled in a way that minimizes the chance of data corruption.

You can customize how the cache persists data by registering different adapters. It has options for using a standard JSON-based storage, or even a "dummy" adapter that simply ignores all write requests for testing purposes.

## Class PersistBreakevenUtils

This utility class helps manage and save your breakeven data, like signal states, so you don't lose progress. It automatically handles storing and retrieving this data from files on your computer.

Think of it as a central place where your application keeps track of the breakeven status of different trading strategies for various assets. It ensures that these states are saved consistently and safely.

The system uses a special factory to create storage objects, and it only creates one storage object per asset, strategy, and exchange combination.  You can even customize how the data is stored, for instance, using JSON or even a "dummy" adapter that simply ignores writes for testing purposes.  The data is organized in a folder structure, so it's easy to locate and understand.  When data is saved, it does so in a way that prevents data corruption.

## Class PersistBase

PersistBase provides a foundation for saving and retrieving data to files, ensuring your data remains safe and consistent. It's designed for situations where you need to store information persistently, like historical trading data.

The base class handles the technical details of writing files safely – it prevents data corruption by using atomic writes, which means the entire write happens at once or not at all. It also automatically checks for and cleans up any damaged files, and it can retry deleting files if needed.

You specify a name for your data (the `entityName`) and a directory where it will be stored (`baseDir`). It automatically figures out the full path to each file based on a unique identifier (`entityId`). 

The `waitForInit` method sets up the persistence directory initially and ensures the files are valid.  You can retrieve data using `readValue` and check if data exists with `hasValue`. Writing data is done with `writeValue`, which uses the safe atomic writing process. Finally, `keys` gives you a way to iterate through all the unique identifiers (entity IDs) stored.

## Class PerformanceReportService

This service helps you keep track of how long different parts of your trading strategy take to run. It acts like a performance detective, recording the timing of various operations. You can use this information to identify slow spots in your strategy and optimize them for better performance.

The service listens for timing signals and saves those details, along with extra information, into a database. To start tracking, you subscribe to the performance emitter and get a function back that you can use to stop tracking. When you’re done, just call that unsubscribe function. It’s designed to prevent accidental double-subscriptions, making sure your data stays clean.

## Class PerformanceMarkdownService

This service is designed to gather and analyze how your trading strategies are performing. It listens for performance updates, keeping track of key metrics for each strategy you run. 

The service calculates things like average performance, minimums, maximums, and percentiles, allowing you to quickly see overall trends. It then generates easy-to-read markdown reports, often highlighting potential bottlenecks in your strategies.  These reports are automatically saved to a designated folder, making it easy to review and compare results.

You can subscribe to receive performance events and later unsubscribe when you no longer need them. The `track` function is the key to feeding it performance data, while `getData` lets you retrieve specific performance statistics.  The `getReport` and `dump` functions handle generating and saving those detailed reports. Finally, `clear` allows you to wipe the performance data clean when needed.

## Class Performance

The Performance class helps you understand how well your trading strategies are doing. It provides tools to gather and analyze performance data, letting you identify areas for improvement.

You can retrieve detailed performance statistics for specific symbols and strategies, broken down by different types of operations. This gives you a clear picture of what's taking the most time and where potential bottlenecks might be.

It's also easy to generate reports in a readable Markdown format, which visually summarizes your performance metrics, including operation time breakdowns and percentile analysis to highlight potential issues.

Finally, the class allows you to save these reports directly to your computer for later review or sharing.

## Class PartialUtils

This class offers helpful tools for analyzing partial profit and loss data within your backtesting or live trading environment. It acts like a central hub for getting insights from events related to partial profits and losses, allowing you to understand performance in more detail.

You can use it to retrieve summarized statistics, like the total number of profit and loss events, providing a quick overview of activity.

It can also generate nicely formatted Markdown reports displaying individual profit and loss events as tables, including details like the action taken (profit or loss), the symbol traded, signal ID, position size, price, and timestamp. You can even customize which columns appear in the report.

Finally, this class can automatically create and save these reports to files on your disk, making it easy to share and review your results, with filenames that clearly identify the symbol and strategy being analyzed. It takes care of creating any necessary directories for saving the reports.

## Class PartialReportService

The PartialReportService helps you keep track of when your trades partially close, whether it's for a profit or a loss. It listens for signals indicating these partial exits and diligently records them in a database. 

Think of it as a meticulous observer, capturing key details like the price and level at which each partial closure happened.

You can start this service listening by using the `subscribe` method, which will automatically handle preventing multiple subscriptions. When you're done, the `unsubscribe` method safely stops the service from listening. A handy `loggerService` is available for debugging.


## Class PartialMarkdownService

The PartialMarkdownService helps you keep track of and report on your trading performance, specifically focusing on partial profits and losses. It listens for these events and organizes them by symbol and strategy, allowing you to see exactly how each one is performing.

It generates nicely formatted markdown reports – essentially tables – that provide detailed information about each profit or loss event. You can then save these reports to your disk, making it easy to review your trading activity.

The service keeps its data organized within individual storage spaces for each symbol, strategy, exchange, frame, and backtest combination, ensuring data isolation. You can subscribe to receive updates as events happen, unsubscribe when you don't need them anymore, and even clear out the accumulated data when needed, whether for a specific combination or everything at once. The `getData` method lets you retrieve statistics about the accumulated profits and losses while `getReport` is for generating the markdown reports.


## Class PartialGlobalService

This service acts as a central hub for managing partial profit and loss tracking within your trading strategy. Think of it as a middleman – it receives requests related to profits, losses, and clearing partials, logs them for monitoring purposes, and then passes them on to another service responsible for the actual work. It's injected into your strategy, providing a standardized way to handle these operations.

The service relies on several other services provided by the system, like validation and schema services, to ensure everything is set up correctly. It keeps track of validations to avoid unnecessary checks.

The core functions it offers are `profit`, `loss`, and `clear`. These functions are called when a profit level is reached, a loss level is triggered, or a signal closes, respectively. Each function first logs the activity and then forwards the request to the underlying connection service to handle the specific details.

## Class PartialConnectionService

This service helps track partial profits and losses for trading signals. It's designed to efficiently manage and reuse data for each signal, avoiding unnecessary creation and cleanup. 

Think of it as a smart factory for "ClientPartial" objects – each signal gets its own, and this service creates them only when needed, stores them for later use, and cleans them up when they're no longer required.

The service gets information about logging and event handling from other parts of the system, and it handles the actual profit, loss, and clearing operations by delegating them to the specific "ClientPartial" for each signal. It uses a clever caching system to remember these "ClientPartial" objects, making things faster and more efficient. This whole setup is integrated into the broader trading strategy and uses a system to remember which signals are being tracked, whether in a backtesting or live environment.

## Class NotificationLiveAdapter

This component, `NotificationLiveAdapter`, provides a flexible way to manage and send notifications about your trading strategies. It acts as a central hub, allowing you to easily switch between different notification methods without changing your core strategy logic. Think of it like a universal translator for your trading events.

It has several built-in notification options: you can store notifications in memory, persist them to disk, or use a "dummy" adapter that effectively does nothing (useful for testing or when you don’t want notifications). The `useMemory`, `usePersist`, and `useDummy` methods let you quickly choose which notification method to use.

The adapter handles various events, like signals, partial profits, losses, and errors, passing these events on to the currently selected notification backend. You can also customize the adapter entirely by providing your own implementation with `useNotificationAdapter`. If you need to retrieve or clear all notifications, there are methods for that too.

## Class NotificationBacktestAdapter

The NotificationBacktestAdapter helps you manage and send notifications during your backtesting process. Think of it as a flexible system that allows you to choose *how* those notifications are handled – whether they’re stored in memory, saved to a file, or completely ignored.

It provides several pre-built options: a default in-memory adapter, a persistent adapter that saves notifications to disk, and a dummy adapter that simply discards them. This makes it easy to switch between different notification strategies without changing the core backtesting logic.

The adapter offers a set of methods, like `handleSignal`, `handlePartialProfit`, and `handleError`, which are triggered during the backtest and delegate the actual notification to the currently selected adapter. You can easily change the active adapter using methods like `useMemory`, `usePersist`, or `useDummy`, influencing how your backtest interacts with notifications. Getting and clearing notifications is also possible.

## Class NotificationAdapter

The NotificationAdapter is the central hub for handling notifications during backtesting and live trading. It automatically keeps track of notification updates by listening for signals. You can easily access all notifications, whether they’re from backtest simulations or live trading sessions, through a single point. To prevent duplicate notifications, it uses a special mechanism ensuring subscriptions happen only once. When you're finished, a cleanup function helps to ensure everything is properly unsubscribed.

You control the adapter using `enable` to start listening for notifications and `disable` to stop.  The `getData` function lets you retrieve all stored notifications, specifying whether you want backtest or live data.  Finally, `clear` provides a way to wipe out all stored notifications, again allowing you to target either backtest or live data.

## Class MarkdownUtils

The MarkdownUtils class is your central tool for controlling how your backtest-kit framework generates markdown reports. It lets you turn on and off markdown reporting for different parts of your system like backtests, live trading, performance analysis, and more. 

You can selectively enable specific report types, and the framework will then start listening for events, collecting data, and creating markdown files. It’s really important to remember to “unsubscribe” from those enabled services when you’re done with them – there's a special function returned when you enable, and calling it cleans everything up and prevents potential memory problems.

Conversely, you can disable specific report types without affecting others, immediately stopping data collection and markdown generation. This is helpful if you only need reports for certain scenarios.

## Class MarkdownFolderBase

This class helps you create organized markdown reports by writing each one to its own individual file within a folder. It's designed to make your reports easy to browse and review manually. Think of it as the standard way to generate reports for backtest-kit, organizing everything into clearly labeled files.

Each report gets its own `.md` file, with the location determined by your specified path and file name. The adapter automatically handles creating the necessary directories.

The `waitForInit` method does nothing—it's just there for consistency, as this adapter doesn't require any special setup before writing files.

The `dump` method is where the main work happens; it takes the markdown content and writes it to a new file, constructing the full file path based on your settings.

## Class MarkdownFileBase

This class helps you write markdown reports in a standardized, machine-readable format. It creates a single JSONL file for each type of report you want to generate, making it easier to process and analyze your trading data later. The reports are written in an append-only fashion, meaning new data is added to the end of the file.

The system automatically creates the necessary directories and handles potential errors by sending them to a central error reporting system. It also includes built-in safeguards to prevent write operations from taking too long, with a 15-second timeout to ensure responsiveness.

You can easily filter these reports later by using metadata like the symbol, trading strategy, exchange, timeframe, or signal ID. The `dump` method is the core function for writing your markdown content, attaching this essential metadata to each entry. Initialization is handled automatically, and it’s safe to trigger it multiple times.

## Class MarkdownAdapter

The MarkdownAdapter helps you manage how your markdown data is stored, offering flexibility and efficiency. It allows you to easily switch between different storage methods, like saving each piece of data in a separate file or appending it to a single JSONL file. Think of it as a central point for controlling how your markdown files are created and handled.

The adapter automatically creates storage when you first write data, and it keeps track of a single storage instance for each type of markdown, ensuring consistent access. You can customize the storage method using `useMarkdownAdapter` or use convenient shortcuts like `useMd` for the default file-per-data approach or `useJsonl` for a combined JSONL file.  There's even a `useDummy` option to test things without actually writing anything to disk.

## Class LoggerService

The `LoggerService` helps ensure your backtesting framework logs messages consistently and with useful information attached. It acts as a central point for logging, automatically adding details about where the log originated – like which strategy, exchange, or frame it came from – and the specifics of the execution, such as the symbol being traded and the time it occurred.

You can use the `log`, `debug`, `info`, and `warn` methods to record different types of messages. These methods all automatically enrich your message with the context.

If you don’t provide your own logging mechanism, the `LoggerService` falls back to a "do nothing" logger, so it won't interfere with your testing.

You can customize the logging by using `setLogger` to plug in your own logger implementation. The `methodContextService` and `executionContextService` properties handle providing the contextual information.

## Class LogAdapter

The `LogAdapter` provides a flexible way to manage logging within your backtesting framework. It acts as a central point for logging messages, allowing you to easily switch between different storage methods without changing your core code. By default, it keeps logs in memory, but you can quickly swap it to store logs persistently on disk, use a dummy logger that does nothing, or even log to a JSONL file. This adapter pattern makes it simple to adapt your logging behavior based on your needs, whether you're debugging, performing detailed analysis, or just want to minimize overhead. You can control the logging level, including debug, info, warn, and general messages.

## Class LiveUtils

This class provides tools for running live trading strategies and monitoring their progress. It's designed to handle crashes and recover data from disk, ensuring your strategies keep running.

You can start a live trading session using the `run` method, which generates a stream of trading results. Alternatively, `background` runs a strategy in the background without directly providing results.

For getting detailed information about a position, functions like `getPendingSignal`, `getTotalPercentClosed`, and `getPositionInvestedCost` offer insights into the current state. You can check if a position has reached breakeven using `getBreakeven`.

The class also allows you to interact with a running position, such as canceling a scheduled signal (`commitCancelScheduled`) or closing a pending signal (`commitClosePending`). You can manage partial profits and losses with methods like `commitPartialProfit` and `commitPartialLoss`, and adjust trailing stop-loss and take-profit levels.

Finally, methods like `getData`, `getReport`, and `dump` are available for retrieving statistical data, generating reports, and saving them to disk. The `list` method shows you all the currently running live trading instances. This is a singleton instance, so you access it directly without needing to create a new object.

## Class LiveReportService

The LiveReportService is designed to keep a detailed record of what your trading strategy is doing in real-time. It acts like a meticulous observer, noting every change in state – whether the strategy is idle, has opened a position, is actively trading, or has closed a position. This information is then carefully stored in a database, allowing you to monitor performance and analyze what's happening as things unfold.

To make sure it doesn't get overwhelmed, the service only subscribes to the live trading signal once, preventing duplicate data. You can easily stop it from logging events using the unsubscribe function it provides. The service uses a logger to help with debugging, and it handles the process of taking those live trading tick events and writing them to the database.


## Class LiveMarkdownService

The LiveMarkdownService helps you automatically create reports during live trading sessions. It keeps track of what's happening with your strategies – from when they're idle, to when they open and close trades – and organizes this information into easy-to-read markdown tables. 

Think of it as a real-time logbook for your strategies, providing statistics like win rate and average profit/loss. It saves these reports directly to your computer, making it simple to review performance and identify areas for improvement.

You can subscribe to receive these updates as they happen, and it's designed to ensure you don't accidentally subscribe multiple times. You can also clear out old data when you need to. The service carefully separates data for each strategy and trading setup, ensuring your reports are organized and specific to each scenario. It offers functions to get the data, generate the report, save to disk, and clear data.

## Class LiveLogicPublicService

This service helps manage and execute live trading strategies. It builds on top of a private service, automatically handling important details like knowing which strategy and exchange you're working with.

Think of it as a facilitator – you don't need to repeatedly pass in information about your strategy and exchange for each action. It manages that for you.

The service continuously runs, providing a stream of trading results (signals to open, close, or cancel positions) and is designed to be resilient, automatically recovering from crashes by saving and restoring its state. It keeps track of time using the current system time for accurate progression.


## Class LiveLogicPrivateService

This service handles the continuous, real-time execution of your trading strategy. Think of it as the engine that keeps your live trading running without interruption. It constantly monitors the market and processes signals, providing a stream of results – specifically when a trade is opened or closed.

The service works in a persistent loop, checking for new signals at regular intervals and gracefully recovers from crashes, ensuring your strategy picks up where it left off. It efficiently sends you only the relevant information (open and close signals) as needed, avoiding unnecessary data. 

You can initiate the process for a specific trading symbol, and it will continuously provide updates until you stop it. It’s built to run indefinitely, acting as a reliable pipeline for your live trading operations.

## Class LiveCommandService

This service acts as a central point for accessing live trading capabilities within the backtest-kit framework. Think of it as a simplified helper, designed to be easily integrated into other parts of the system. It bundles together several related services, like those handling validation and schema management, to provide a streamlined experience.

The core functionality is provided by the `run` method. This method kicks off the live trading process for a specific trading symbol, while also passing along important context information – like the strategy and exchange being used – to ensure everything runs correctly. It operates as an ongoing, never-ending process, automatically recovering from crashes to keep trading running smoothly. Essentially, it's the engine that powers the live trading experience.

## Class HighestProfitUtils

This class helps you access and understand the highest profit performance of your trading strategies. Think of it as a central place to pull together data about when your strategies made the most money.

It works by gathering information from events that record highest profit moments. You can use it to get detailed statistics about a specific trading strategy and symbol combination.

Need to see a full report? This class can generate a markdown report summarizing all the highest profit events for a symbol and strategy. You can even save that report directly to a file for later review, and customize what data appears in the report.

## Class HighestProfitReportService

This service is responsible for tracking and recording the moments when your trading strategy achieves its highest profit. It constantly monitors incoming price data, and whenever a new record high profit is reached, it saves that information to a database for later review and analysis. 

Think of it as an automated logbook of your best trading performances.

The `subscribe` function starts the process, connecting it to the data stream.  When you're finished, `unsubscribe` gracefully stops the connection and ensures everything is cleaned up.  You’ll also find internal references to a logger and the tick data itself, used to manage the recording and timing of these high-profit events.

## Class HighestProfitMarkdownService

This service helps you automatically create and store reports detailing the highest profit performance for your trading strategies. It keeps track of events related to profits for each symbol, strategy, exchange, and timeframe combination. 

You can think of it as a data collector and reporter that listens for profit events and organizes them.  It provides functions to retrieve the accumulated data, generate formatted reports as text, and save those reports to a file.  The `subscribe` and `unsubscribe` methods allow you to connect to and disconnect from the system that sends profit data, and the `clear` method allows you to reset the recorded data.  The `tick` property likely represents internal processing related to the data collection.

## Class HeatUtils

HeatUtils simplifies working with portfolio heatmaps, especially when you want to analyze how different symbols performed within a particular strategy. It acts as a central point to gather and present this information in an easy-to-understand format.

To get the detailed performance statistics for a strategy, you can use the `getData` function, which pulls together data from all closed signals. 

You can also generate a nicely formatted markdown report with the `getReport` function, displaying key metrics like total profit/loss, Sharpe Ratio, and maximum drawdown, sorted by profitability.

Finally, `dump` allows you to save these reports directly to a file on your computer, creating the necessary folders if they don't exist, making it easy to share or archive your analysis. This whole class is designed to be readily available, as a single, easy-to-use instance.


## Class HeatReportService

This service helps you track and analyze your trading performance by recording when your signals close. It focuses specifically on closed signals and the profit or loss (PNL) associated with them, gathering data across all your investments.

The service listens for signal events and saves these closed signal details into a database designed for creating heatmaps, providing a visual way to understand your trading patterns.  It’s designed to only subscribe once to prevent it from overwhelming the system.

You can start the process with `subscribe` which returns a function you can use to stop listening with `unsubscribe`.  The service also has a `tick` property that processes these signal events and logs them, ensuring a record of each closed signal.

## Class HeatMarkdownService

The Heatmap Service is designed to give you a clear picture of how your trading strategies are performing across different markets and timeframes. It automatically gathers data from your trading signals and organizes it in a way that's easy to understand.

It keeps track of key statistics for each symbol you’re trading, like total profit/loss, Sharpe Ratio (a measure of risk-adjusted return), maximum drawdown (the largest peak-to-trough decline), and the number of trades executed.  You can see overall portfolio metrics, broken down by individual strategy.

The service creates separate storage spaces for each exchange, timeframe, and backtest mode to keep things organized. It has a built-in mechanism to avoid duplicate subscriptions and provides a way to safely handle mathematical calculations, even if they might produce unexpected results. You can also generate a nicely formatted Markdown report with your data and even save it to a file. Finally, it offers a simple way to clear out accumulated data when it's no longer needed.

## Class FrameValidationService

This service helps you keep track of your trading timeframes and make sure they're set up correctly. Think of it as a central place to register your different timeframe configurations, like 1-minute, 5-minute, or daily charts. 

Before you start trading or analyzing data, this service can quickly verify that a specific timeframe actually exists in your system. It’s designed to be efficient, remembering its validation results to avoid unnecessary checks. 

You can add new timeframes using `addFrame`, confirm a timeframe’s validity with `validate`, and see a complete list of your timeframes with `list`. It’s a handy tool to ensure your trading framework is working with the timeframes you intend to use.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of the structures used in your backtesting strategies, making sure they're consistent and well-defined. It acts as a central place to store and manage these schemas.

Think of it as a registry where you can add, update, and retrieve the blueprints for your trading frames. It uses a special system to ensure type safety, so you can be confident that your schemas are correct.

You can register new schemas using `register()`, update existing ones with `override()`, and easily access them by name using `get()`. The service also checks your schemas to make sure they have the necessary components before they are registered, preventing potential issues down the line.

## Class FrameCoreService

This service acts as the central hub for managing timeframes within the backtesting process. It works closely with other services to ensure the timeframes used are valid and consistent. Essentially, it provides a convenient way to get the dates you need for your backtest, pulling data from the connection service and verifying its accuracy. Think of it as the engine that creates the timeline for your trading simulation. 

It relies on a logger for tracking activity and uses a connection service to retrieve timeframe data. The core function, `getTimeframe`, is your go-to method for obtaining an array of dates based on a specific symbol and timeframe name, ready to drive your backtest logic.


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for handling different trading frames, like minute, hourly, or daily data. It intelligently routes requests to the correct frame implementation based on the current context. To speed things up, it remembers (caches) these frame instances so it doesn’t have to recreate them every time. 

Think of it as a dispatcher – you ask for a specific frame, and it gets it for you, either retrieving a previously created one or creating a new one if it's needed.

It also manages the timeframe for backtesting, letting you specify the start and end dates for your analysis.  When running in live mode, there's no specific frame applied, so `frameName` will be empty.

Here's a breakdown of its core parts:

*   **`getFrame`**: This is how you get a frame instance. It remembers which frames you’ve already requested.
*   **`getTimeframe`**: This lets you pull the specific start and end dates you've set up for a backtest, ensuring your simulations stay within the desired time range.

## Class ExchangeValidationService

This service helps you keep track of your trading exchanges and makes sure they're set up correctly before you start trading. It acts like a central record, allowing you to register new exchanges and verify they are ready to be used. 

It remembers whether an exchange is valid to speed things up – you don’t have to re-check every time. You can easily add new exchanges to the system, confirm that a specific exchange exists, and get a full list of all the exchanges you’ve registered. Think of it as a simple way to organize and confirm your exchanges are in good working order.

## Class ExchangeUtils

The ExchangeUtils class is designed to simplify how you interact with different cryptocurrency exchanges within the backtest-kit framework. Think of it as a helpful assistant that handles the complexities of each exchange’s unique way of doing things.

It’s structured as a single, always-available resource, so you don't need to worry about creating multiple instances.

Here's what it does:

*   **Fetching Historical Data:** It can retrieve candlestick data (price charts) from exchanges, automatically adjusting the timeframe based on your request.
*   **Calculating Average Prices:** It computes the VWAP (a common trading metric) using recent price data.
*   **Formatting Trade Details:** It correctly formats quantities and prices to match the specific rules of each exchange, ensuring accurate orders.
*   **Retrieving Order Books:**  You can grab the current order book, showing the depth of bids and asks.
*   **Getting Trade History:** It pulls aggregated trade data, giving you a summarized view of trading activity.
*   **Flexible Candle Retrieval:**  It provides a way to get raw candle data, allowing for precise control over date ranges and limits, which is particularly useful for backtesting.




Essentially, ExchangeUtils provides a consistent and validated way to access exchange data, making your backtesting and trading strategies more reliable.

## Class ExchangeSchemaService

This service acts as a central place to store and manage information about different cryptocurrency exchanges, ensuring consistency and type safety. It uses a special system to track these exchange details, making sure everything is organized and predictable. 

You can add new exchanges to the system using `addExchange()` and then easily find them later by their name. The service also has a built-in check to confirm that each exchange’s data is in the expected format before it’s added, preventing errors down the line.

If you need to update information for an existing exchange, you can do so with `override()`, which allows you to change specific parts of the exchange's details. Finally, you can retrieve the complete information for a specific exchange using its name.

## Class ExchangeCoreService

ExchangeCoreService acts as a central hub for interacting with exchanges within the backtest framework. It combines connection management with the ability to inject crucial information like the trading symbol, timestamp, and backtest status into each exchange operation. This service is essentially a wrapper, streamlining how the system retrieves data like historical candles, order books, and aggregated trades.

To avoid repetitive validation, it memoizes the exchange configuration validation process. The core functionality includes methods for fetching various data points from the exchange, such as candles (both historical and, in backtest mode, future), average prices, and order book information. You'll find that these methods all accept a timestamp and a boolean indicating whether the operation is part of a backtest.

Formatting price and quantity also benefits from this execution context injection.  The system provides tools to get raw candles and the ability to customize data retrieval using date ranges and limits, ensuring a comprehensive and controlled interaction with the exchange.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently routes your requests – like fetching candles or order book data – to the correct exchange based on the context of your operation. To avoid repeated connections, it remembers the exchange instances it’s already used, making things faster and more efficient.

It provides a consistent way to get candles (historical and upcoming), calculate average prices (considering whether you're backtesting or live trading), format prices and quantities to match each exchange's specific rules, retrieve order books, and fetch aggregated trades. The service handles the underlying complexities of connecting to different exchanges, so you can focus on your trading logic. You can also retrieve raw candles with custom date ranges, offering more flexibility for historical data analysis.

## Class ConstantUtils

The ConstantUtils class provides a set of pre-calculated values designed to help manage take-profit and stop-loss levels in a trading strategy. These constants are based on the Kelly Criterion and incorporate a risk decay model, aiming to optimize profit-taking and loss mitigation. 

Think of them as checkpoints along the path to your ultimate profit or loss targets. For example, TP_LEVEL1 locks in a small portion of your potential profit (30%), while SL_LEVEL1 gives an early indication that the trade might be heading in the wrong direction. The other levels build on this approach, allowing for incremental profit capture and risk reduction. These predefined levels are intended to automate these decisions and reduce manual intervention during the trading process.

## Class ConfigValidationService

This service helps keep your trading configurations sound and profitable by double-checking the settings you've defined. It’s like a built-in safety net, making sure your numbers make sense mathematically and won't lead to losing trades. 

The service meticulously reviews percentages like slippage and fees, ensuring they’re not negative. It also verifies that your take-profit distance is set high enough to cover all associated costs – slippage and fees – so you actually make money when your target is hit. Beyond that, it checks logical relationships between values, such as ensuring stop-loss distances are reasonable, and that timeouts and candle-related parameters are properly configured as positive integers. This proactive validation prevents errors and helps maintain a robust trading system.

## Class ColumnValidationService

The ColumnValidationService helps keep your column configurations clean and consistent. It acts as a safety net, making sure your column definitions are set up correctly and won't cause problems later. 

It checks several things to ensure your columns are valid:

*   Every column must have a key, a label, a format, and be clearly visible.
*   The keys you use for each column have to be unique – no duplicates allowed.
*   The format and visibility settings need to be functions that can be executed.
*   The keys and labels themselves must be strings and can't be empty.

Essentially, this service makes sure your column configurations are well-formed and ready to go.

## Class ClientSizing

This component, called ClientSizing, helps determine how much of your capital to use for each trade. It’s designed to be flexible, allowing you to choose from various sizing methods like fixed percentages, the Kelly Criterion, or using Average True Range (ATR). You can also set limits on your position size, ensuring it stays within safe boundaries, and even incorporate custom validation and logging through callbacks. The `calculate` method is the core of this component – it takes trade information and figures out the appropriate position size based on your chosen settings.

## Class ClientRisk

ClientRisk helps manage the overall risk of your trading portfolio, especially when using multiple strategies simultaneously. It acts as a gatekeeper, ensuring that new trades don't violate pre-defined limits, like the maximum number of positions you can hold at once.

Think of it as a safety net; it checks each potential trade against your risk rules before it's executed. It keeps track of all open positions across all strategies, enabling cross-strategy risk assessment which is vital for a holistic approach to risk management.

The ClientRisk system initializes by loading existing positions, but skips this step during backtesting.  It also provides a way to persist these positions to disk, although this persistence is also bypassed when backtesting.

You can customize the risk checking process with your own validation logic, giving you complete control over how risk is assessed. The `checkSignal` function is the core of this process, evaluating signals and triggering callbacks based on whether they're allowed.  New and closed signals are registered and unregistered through the `addSignal` and `removeSignal` methods.

## Class ClientFrame

The `ClientFrame` helps your backtesting process by creating timelines of dates and times for your trading strategies. Think of it as a tool that slices up historical data into manageable chunks for analysis. It avoids repeating work by remembering previously generated timelines, making your backtests run faster. 

You can customize how far apart these time points are, choosing intervals from one minute to three days.  Plus, it allows you to hook in your own checks and logging functions to ensure data quality and keep track of what's happening.  The `getTimeframe` function is its core feature, providing you with a date array for a specific trading symbol, and it's designed to be efficient by caching results. 


## Class ClientExchange

This component, `ClientExchange`, acts as a bridge between your backtesting environment and the actual exchange data. It provides a consistent way to retrieve historical and future price data, calculate key metrics like VWAP, and format trade quantities and prices according to exchange-specific rules. It’s designed for efficiency, using prototype functions to minimize memory usage.

Here's a breakdown of what it does:

*   **Candle Data:** You can fetch historical candle data moving backwards in time, or "look ahead" to get future candles, essential for backtesting strategies that require signal duration. The process aligns timestamps to ensure accurate data retrieval.
*   **VWAP Calculation:** It can calculate the Volume Weighted Average Price (VWAP) using the last few 1-minute candles. This is helpful for understanding average price levels during a trading period.
*   **Formatting:** It formats trade quantities and prices based on the exchange’s requirements, ensuring your orders are correctly represented.
*   **Raw Candles:** Offers more flexibility fetching candle data by specifying start and end dates or limits.
*   **Order Book & Aggregated Trades:** It also fetches order book data and aggregated trades, essential for understanding market depth and order flow.
*   **Safety First:** All methods are carefully designed to prevent look-ahead bias, ensuring the backtest results are reliable and realistic. The system carefully manages date ranges and limits to avoid peeking into the future.

## Class ClientAction

The `ClientAction` component is designed to manage and execute custom logic within your backtesting or live trading strategies. Think of it as a central hub for handling events and connecting them to your specific action handlers.

It takes care of creating an instance of your action handler, making sure it's initialized and cleaned up correctly. It routes various events—like signal updates, breakeven notifications, partial profit/loss triggers, and ping confirmations—to the appropriate methods within your handler.

You can use action handlers for things like managing state in your application (using Redux or similar), logging events, sending notifications via Telegram or Discord, or collecting data for analytics. The `signalLive` and `signalBacktest` methods let you differentiate between events coming from live trading versus backtesting environments. The `signalSync` method provides a critical gate for position adjustments.


## Class CacheUtils

CacheUtils helps you easily manage caching for your functions, especially when dealing with time-based data like candlestick charts. Think of it as a helper to speed up your code by remembering results it’s already calculated.

It provides a few key features:

*   **`fn`**: This is the main tool for caching regular functions. It automatically stores the results of your function calls based on a timeframe interval, so it doesn’t have to recompute them every time.

*   **`file`**:  Similar to `fn`, but it persists cached data to files on your disk. This is excellent for caching large datasets or results that take a long time to calculate and you want to avoid recalculating them every time you run your backtest. The file names are based on function name, interval, and a unique index, storing them under a specific directory structure.

*   **`flush`**:  This lets you completely clear the cache for a specific function.  Use this when you've made changes to a function and want to ensure you're getting fresh results. You can also flush all caches for a clean slate.

*   **`clear`**:  This clears the cache *only* for the currently active strategy, exchange, and backtest mode.  It’s a more targeted way to clear the cache than `flush`.

*   **`gc`**:  This performs garbage collection, which means it removes old, expired cached entries that are no longer relevant, freeing up memory.



The `CacheUtils` system uses a singleton instance, so you access it directly without needing to create an object.

## Class BrokerBase

This `BrokerBase` class is your starting point for connecting your trading strategy to a real exchange. Think of it as a template you extend to create a custom adapter for platforms like Binance, Coinbase, or others. It provides a framework with pre-built "no-op" functions that simply log what's happening – you replace these with the actual code to interact with your chosen exchange.

The class handles the flow of events like opening new positions, closing existing ones, and adjusting stop-loss and take-profit levels.  You’ll override methods like `onSignalOpenCommit` to place orders on the exchange and `onSignalCloseCommit` to execute exits.

Here's how it works:

1.  **Initialization:** When your backtest or live trading begins, the `waitForInit()` method is called. This is where you’d connect to the exchange, log in, and load any necessary settings.
2.  **Event Handling:**  As your strategy executes, various "commit" methods (`onSignalOpenCommit`, `onSignalCloseCommit`, etc.) are invoked. These are the signals that tell the broker what action to take (buy, sell, adjust stop-loss).
3.  **Default Behavior:**  Each "commit" method has a default implementation that logs the event. This helps you see what's happening without immediately writing exchange-specific code.
4.  **Lifecycle:**  There’s no need to manually clean up; the framework handles most of that for you.



The framework takes care of logging all these actions, making it easier to track what’s happening during your trading process. By extending `BrokerBase`, you can tailor the broker's behavior to your specific exchange and integration needs.

## Class BrokerAdapter

The `BrokerAdapter` acts as a middleman between your trading logic and your actual brokerage. It’s designed to safely handle actions like opening and closing positions, setting stop-loss orders, and implementing take-profit strategies. Think of it as a gatekeeper – it checks and validates things before letting them through to modify your core trading data.

During backtesting, the `BrokerAdapter` quietly ignores these actions, allowing you to test your strategy without actually placing orders. When you're live trading, it forwards those actions to your connected brokerage.

Here's a breakdown of what it does:

*   **Transaction Safety:** It ensures that if any operation fails (like a broker rejecting an order), your trading data doesn't get corrupted. The whole operation is rolled back.
*   **Signal Handling:** It automatically routes `signal-open` and `signal-close` events to your broker.
*   **Commit Operations:** Several methods like `commitPartialProfit`, `commitTrailingStop`, and others provide controlled points to interact with the broker *before* changes are made to your core trading data.
*   **Easy Integration:** You register your broker using `useBrokerAdapter`, providing either a way to create a broker instance or a pre-existing one.
*   **Activation & Deactivation:**  `enable` starts the connection with your broker, while `disable` disconnects it. It's designed to be easy to manage and won't cause problems if you accidentally call `disable` multiple times.

## Class BreakevenUtils

The BreakevenUtils class helps you analyze and report on breakeven events in your backtesting or live trading. Think of it as a tool to understand how often your strategies hit breakeven points and to document those instances. It gathers data about breakeven events—including when they happened, the symbol involved, the strategy used, and the details of the trade—and stores it for later review.

You can use this class to quickly get overall statistics about your breakeven performance for a particular symbol and strategy. It also lets you create detailed markdown reports that present all breakeven events in a clear, organized table format, including important information like entry price and timestamp. Finally, it can automatically save these reports to files on your computer, making it easy to share or archive your results. The reports are saved with filenames that clearly indicate the symbol and strategy being analyzed.

## Class BreakevenReportService

The BreakevenReportService helps you keep track of when your trading signals reach their breakeven point, essentially the point where you've recovered your initial investment. It listens for these "breakeven" moments and records them in a database. 

Think of it as a way to automatically document your trading progress. 

You can easily start and stop this monitoring – the `subscribe` method begins recording, and it provides a function you can use to stop. It makes sure you're not accidentally recording the same event multiple times. If you need to turn off the recording, `unsubscribe` cleans up everything. This service includes a logger for debugging and a helper to manage breakeven calculations.

## Class BreakevenMarkdownService

This service helps you automatically generate and save reports detailing when your trades reached breakeven points. It listens for "breakeven" events happening during your backtesting or live trading and keeps track of them for each symbol and strategy you're using. The service then organizes this data into easy-to-read markdown tables, complete with statistics like the total number of breakeven events.

You can subscribe to receive these breakeven events and unsubscribe when you no longer need them. The `tickBreakeven` function is the core of processing these events, and the service handles saving reports to disk in a structured directory, so you can easily review your trading performance.  You can also retrieve statistics or generate reports on demand for specific symbols, strategies, or clear all accumulated data when needed. The system is designed to isolate data for each unique combination of symbol, strategy, exchange, timeframe, and backtest type.

## Class BreakevenGlobalService

The BreakevenGlobalService acts as a central hub for tracking breakeven points within the backtest-kit framework. Think of it as a middleman, handling all breakeven-related operations and ensuring they are logged for monitoring purposes. It’s designed to be injected into the ClientStrategy, providing a single point of access and simplifying how strategies interact with the underlying breakeven mechanisms.

It relies on other services, like a logger and a connection service, which are provided by the system's dependency injection container. This allows for flexibility and maintainability.

The `validate` function performs checks on your strategy and associated risk settings, preventing errors and optimizing performance by remembering previous validations. The `check` function determines if a breakeven trigger should occur, and the `clear` function resets the breakeven state when a signal is closed—both functions log their actions before forwarding the work to the connection service.

## Class BreakevenConnectionService

This service helps keep track of breakeven points for trading signals. It makes sure you don't create too many of these tracking objects, efficiently reusing them based on the signal ID. Think of it as a manager that creates, configures, and cleans up these breakeven trackers.

It works by storing these trackers in a special cache, retrieving them when needed, and then discarding them when a signal is closed.  The `getBreakeven` property is the heart of this caching mechanism.

The `check` method determines if a breakeven event should occur, while the `clear` method handles cleanup when a signal's lifecycle is complete.  The service receives necessary services like a logger and action core through dependency injection, making it adaptable to different environments. Essentially, it simplifies breakeven tracking, preventing unnecessary object creation and ensuring resources are managed properly.

## Class BacktestUtils

This class provides helper functions for backtesting strategies. It's designed to simplify running backtests and retrieving information about positions.

It acts as a singleton, ensuring you always use the same instance for backtest operations.

Here's a breakdown of what it offers:

*   **Running Backtests:** You can start a backtest for a specific symbol and context (strategy, exchange, frame). You can run it normally to receive results as they come, or in the background for side effects like logging.
*   **Signal Information:** It retrieves details about pending and scheduled signals, including breakeven price, the average entry price, and the number of units held.
*   **Position Management:** You can get information about the position, like the percentage closed, the cost basis, estimated minutes, countdown minutes, highest profit levels and partial closes.
*   **Position Adjustments**: It allows for manual adjustments of the position, such as committing partial profits or losses, or updating trailing stop-loss and take-profit levels.
*   **Control & Reporting:**  You can stop the backtest early, activate scheduled signals manually, or generate reports with closed signals.
*   **Statistics and Data:** You can obtain statistical data about past backtest runs, giving you insights into strategy performance.

## Class BacktestReportService

The BacktestReportService helps you track what your trading strategies are doing during backtesting. It essentially records every important signal event—when a strategy is idle, when a position is opened, when it’s active, and when it’s closed—and saves those details to a database. 

You can think of it as a detailed logbook for your backtests, which is super helpful for analyzing performance and figuring out what went right or wrong.

It connects to the backtesting engine and listens for those signal events, then it diligently stores them for later examination. To use it, you subscribe to receive these events, and when you're done, you unsubscribe to stop the logging. It's designed to prevent accidental double-logging, ensuring clean and reliable data.


## Class BacktestMarkdownService

The BacktestMarkdownService helps you create reports summarizing your backtesting results. It listens for trading signals and keeps track of closed trades for each strategy. It then generates readable markdown tables that you can save as files.

You can think of it as a reporting engine that automatically builds reports after a backtest runs, giving you a clear view of how your strategies performed.

Here's a breakdown of what it does:

*   **Accumulates data:** It collects data about closed trades (signals) for each strategy you run.
*   **Generates reports:** It converts that data into nicely formatted markdown tables.
*   **Saves reports:** It saves those reports as `.md` files in a dedicated "logs/backtest" directory.
*   **Clears data:** You can clear the collected data to start fresh or just clear data for a specific strategy.
*   **Subscription:** You subscribe to the backtest events to receive tick data and generate reports.



The service uses a clever system to ensure that each trading strategy, symbol, exchange, timeframe, and backtest combination has its own isolated storage, so reports are organized and easy to understand.

## Class BacktestLogicPublicService

This service helps orchestrate backtesting, making it easier to run simulations. It automatically handles important details like the strategy name, exchange, and frame being used, so you don't have to pass them around manually.

Think of it as a helper that simplifies how you run backtests and makes sure everything is aware of the context.

The `run` method is the main way to start a backtest. It takes a symbol (like "BTC-USD") and automatically takes care of passing context information to the underlying backtesting engine. It delivers the results as a stream of data, showing you how the strategy performed over time.

## Class BacktestLogicPrivateService

The BacktestLogicPrivateService is like the conductor of a backtesting orchestra, carefully managing the process of evaluating your trading strategies. It works by first getting the timeline of data, then processing each point in time. When a signal tells your strategy to start a trade, it fetches the necessary market data and runs the backtest logic. 

This service is designed to be efficient, delivering results incrementally without needing to store everything in memory at once. You can even stop the backtest early if you need to. Think of it as a pipeline that delivers results as they become available, rather than a batch process. The `run` method kicks off this whole process for a specific stock or cryptocurrency.

## Class BacktestCommandService

This service acts as a central point for running backtests within the system. It's designed to be easily used and managed, making it a key component for accessing backtesting capabilities. 

Think of it as a helper that coordinates all the different pieces needed for a backtest, like validating the strategy, risk, and actions. It handles the core execution of the backtest process itself, taking a symbol and context information as input. The result is a series of tick results, showing the simulated performance of the strategy. This service simplifies the process of running backtests, allowing developers to focus on their strategies.


## Class ActionValidationService

This service helps you keep track of your action handlers and makes sure they're available when you need them. Think of it as a central place to register and check the health of your actions. 

You can add new action handlers using `addAction`, and then `validate` makes sure a handler exists before it’s used, preventing errors. To speed things up, the service remembers whether an action is valid, so it doesn’t have to repeatedly check. 

If you need a full list of all the action handlers you’ve registered, the `list` function will give you that information. It's designed to make managing your actions simpler and more reliable.

## Class ActionSchemaService

The ActionSchemaService helps you keep track of and manage the blueprints for your actions, ensuring they’re set up correctly and consistently. It's like a librarian for action definitions, making sure everything is organized and follows the rules.

This service uses a type-safe storage system and validates your action schemas to confirm they only use the methods you've approved. It also allows you to make small changes to existing action schemas without having to recreate them entirely, which can save you a lot of time.

You can register new action schemas, validate them before adding them, and easily retrieve them when needed. It makes sure your actions are well-defined and play nicely together within your system.


## Class ActionProxy

The `ActionProxy` acts as a safety net when using custom trading logic. It wraps your code – the parts you write to handle signals, breakeven points, profit levels, and more – to prevent errors from crashing the entire backtesting or live trading system. Think of it like a bodyguard for your code, catching any mistakes and logging them, allowing the process to continue smoothly.

It doesn’t directly create instances; you use `fromInstance` to wrap an existing handler. This ensures consistent error management across all methods, even if some methods aren't defined in your custom code (in those cases, `ActionProxy` will just return `null`).

Here's a quick breakdown of what it handles:

*   **Initialization:** Sets up the action handler, handling potential errors during initialization.
*   **Signal Handling:**  Manages `signal`, `signalLive`, and `signalBacktest` events (different signal types for live, backtest and general modes), crucial for deciding when to buy or sell.
*   **Profit/Loss Events:** Deals with `breakevenAvailable`, `partialProfitAvailable`, and `partialLossAvailable` events, to manage how profits and losses are taken.
*   **Scheduled Tasks:** Manages `pingScheduled` and `pingActive` for timed actions.
*   **Risk Management:** Handles `riskRejection` events, which occur when a trade is blocked by risk rules.
*   **Synchronization:**  Provides a gateway for position opening and closing, with the exception of the `signalSync` method, which intentionally allows errors to propagate to its calling function.
*   **Cleanup:** Handles `dispose`, which cleans up resources when the trading process ends.

Essentially, `ActionProxy` lets you experiment with more complex trading strategies without the fear of a single error bringing the whole system down.

## Class ActionCoreService

The `ActionCoreService` is a central hub for managing how strategies interact with actions. It essentially takes the instructions (actions) defined in a strategy's blueprint and makes sure they're executed in the right order, handling validations and routing events to the appropriate action handlers.

Think of it as a conductor of an orchestra, ensuring each instrument (action) plays its part correctly and in sync.

Here's a breakdown of what it does:

*   **Action Orchestration:** It reads the list of actions from a strategy's description and uses them to distribute events.
*   **Validation:**  It verifies everything is set up correctly – the strategy name, the exchange it's using, and the actions themselves. This prevents errors and ensures things run smoothly.
*   **Initialization:** When a strategy starts, it initializes each action and loads any saved state.
*   **Event Routing:** It directs different types of events, such as price updates (`signal`), breakeven points (`breakevenAvailable`), and scheduled pings (`pingScheduled`), to the corresponding actions.  There are specific event routes for backtesting and live trading.
*   **Synchronization:** The `signalSync` method is used to ensure that all actions agree on the status of a position (open or closed).
*   **Cleanup:**  When a strategy finishes, it cleans up by disposing of all associated actions.
*   **Clearing:** It provides a way to clear action data, either for a specific action or globally.

The service relies on several other services for its operations, like validating strategy schemas, actions, risks, exchanges, and frames.  It's a core component of the backtest-kit framework, enabling strategies to function correctly and reliably.

## Class ActionConnectionService

The `ActionConnectionService` acts like a central dispatcher, ensuring that different actions are handled by the correct components within your trading system. It intelligently routes action calls, like signals or breakeven notifications, to the appropriate "ClientAction" implementation.

To optimize performance, it uses a clever caching mechanism. When an action is needed, it first checks if it's already been created. If not, it generates it, and then stores it for later use, avoiding redundant work across different strategies and frames. This caching is based on the action name, strategy name, exchange name, and frame name, effectively isolating action behavior for each unique combination.

The service provides several methods for different event types – `signal`, `signalLive`, `breakevenAvailable`, `partialProfitAvailable`, `pingScheduled`, `riskRejection`, and `signalSync` – all of which route the data to the corresponding action.  It also includes a `dispose` function for cleaning up resources and a `clear` function to empty the cache when needed. Importantly, `signalSync` doesn't have error handling to ensure any issues are immediately passed along for resolution.

## Class ActionBase

This base class, `ActionBase`, is your starting point for building custom actions within the backtest-kit framework. Think of it as a foundation to extend when you want to do more than just the default logging—like managing state, sending notifications, or collecting analytics. It handles the basic setup and event logging for you, so you don't have to reimplement those common tasks.

When you create a custom action, you'll inherit from `ActionBase` and override specific methods to define your desired behavior. These methods are triggered by various events during the strategy’s lifecycle, such as when a signal is generated, a breakeven is reached, or a partial profit/loss milestone is hit.  You'll receive data related to the event and context about the strategy (its name, the timeframe it’s running on, and the action’s name).

The `init` method allows you to perform any one-time setup needed when the action starts up—like connecting to a database or initializing an API client.  The `dispose` method is your cleanup crew, called when the action is finished, so you can disconnect resources and ensure everything's tidy. This setup ensures that your custom logic is seamlessly integrated into the backtesting and live trading process.
