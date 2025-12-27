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

The Walker Validation Service helps you keep track of and confirm that your parameter sweep configurations, which we call "walkers," are set up correctly. Think of walkers as instructions for testing different combinations of settings to find the best performance.

This service acts as a central manager, allowing you to register new walkers, quickly check if a walker exists before you try to use it, and list all the walkers you’ve defined. It also remembers its validation results to speed things up. Essentially, it makes sure your optimization and hyperparameter tuning setups are reliable and efficient. You can register walkers using `addWalker`, verify they exist with `validate`, and see all registered walkers with `list`.

## Class WalkerUtils

WalkerUtils is a helper class designed to simplify working with automated trading strategies, often called "walkers." It acts as a central point for running, stopping, and retrieving information about these strategies. Think of it as a convenient tool that handles the behind-the-scenes details of interacting with the core walker system.

It provides a few key functions:

*   **Running Comparisons:** You can use `run` to kick off a comparison of a specific trading strategy for a given asset. It handles all the setup and provides a stream of results.
*   **Background Runs:** If you only need to perform actions like logging or triggering callbacks based on a walker's progress, `background` lets you run the comparison without needing to process the results directly.
*   **Stopping Strategies:**  `stop` provides a way to halt the signal generation of all strategies within a walker. This is useful for quickly pausing trading activity – it gracefully stops current trades and prevents new ones from being placed.
*   **Retrieving Data & Reports:** `getData` gathers all the results from a walker's strategy comparisons, while `getReport` and `dump` allow you to create and save detailed reports summarizing the walker’s performance.
*   **Listing Walkers:** `list` gives you a quick overview of all currently running walkers and their statuses.

WalkerUtils is designed to be easy to use, automatically managing things like identifying the trading environment and walker configuration. There's only one instance of this class available, so you can access these helpful functions from anywhere in your application.

## Class WalkerSchemaService

This service helps you organize and manage different blueprints, or "walkers," for your trading strategies. It acts like a central place to store and retrieve these blueprints, ensuring they're well-structured and consistent. 

You can think of it as a registry where you register new walker blueprints using `addWalker()`, and then easily find them again by their names using `get()`.  Before a new blueprint is added, the service checks to make sure it has all the necessary parts and types in place with `validateShallow()`. If a blueprint already exists, you can update parts of it with `override()` to make adjustments without replacing the entire thing. It leverages a type-safe storage system, so you can be confident in the structure and validity of your walker schemas.

## Class WalkerMarkdownService

The WalkerMarkdownService helps you automatically create and save reports detailing the performance of your trading strategies. It works by listening for updates from your trading walkers – those processes running your strategies – and keeping track of their results.  These results are then used to generate clear, organized markdown tables that compare your strategies side-by-side.

The service organizes data for each walker individually, ensuring that results are separated and easy to understand. You can customize the reports to focus on specific metrics and strategies, and it automatically saves the finalized reports to files.  It handles the initial setup automatically, so you don't have to worry about manually configuring it. Clearing out old data is also easy, allowing you to reset the report generation for specific walkers or all of them.


## Class WalkerLogicPublicService

This service helps coordinate and manage the execution of automated trading strategies, often referred to as "walkers." It builds upon a private service, automatically passing along important information like the strategy name, exchange, and frame name with each request. 

Think of it as a helpful assistant that takes care of the background details so you can focus on the trading logic. 

You can use the `run` method to initiate a comparison process for a specific financial symbol. This method essentially kicks off the backtesting process for all your available strategies, keeping track of the context for each step.


## Class WalkerLogicPrivateService

This service helps you compare different trading strategies against each other, acting as an orchestrator. It handles running each strategy, one after the other, and keeps you informed of the progress as they finish.

You’ll receive updates as each strategy concludes, and the service diligently tracks the best-performing metric throughout the process. Finally, it delivers a complete report, ranking all the strategies you tested.

Under the hood, it utilizes another service to actually execute the backtests. This component requires information like the trading symbol, the strategies you want to compare, the metric you’re optimizing for, and details about the testing environment.

## Class WalkerCommandService

WalkerCommandService acts as a central hub for accessing the walker functionality within the backtest-kit framework. Think of it as a convenient wrapper, designed to make it easier to manage dependencies and provide a consistent interface for the public API. 

It brings together various services under one roof, including those responsible for logic, schemas, validation (covering strategies, exchanges, frames, walkers, and risk), and schema management.

The key function, `run`, is used to execute a comparison of walkers. You provide the symbol you're interested in and some contextual information – like the names of the walker, exchange, and frame – and it returns a generator that lets you step through the comparison results. This is your go-to starting point for launching walker comparisons within your backtesting workflows.


## Class StrategyValidationService

This service helps you keep track of your trading strategies and make sure they're set up correctly. Think of it as a central place to register and check your strategies before you start trading.

You can add new strategies using `addStrategy`, giving it a name and its configuration details.  The `validate` function then makes sure that strategy exists and, if you’ve linked it to a risk profile, that the risk profile is also valid.  

Need to see what strategies you’ve registered? `list` gives you a complete overview. 

To make things run faster, the service remembers the results of validations, so it doesn’t have to repeat checks unnecessarily. It relies on other services – `loggerService` for logging and `riskValidationService` for validating risk profiles – to do its job.

## Class StrategySchemaService

This service helps you keep track of your trading strategies and their blueprints. It acts like a central repository where you can register different strategy designs. Think of it as a catalog for your strategies, ensuring they all follow a consistent structure.

You add strategies using the `addStrategy` method, referencing them by a unique name. When you need to use a specific strategy, you can retrieve its details using its name.

Before a strategy is added, it's quickly checked to make sure it has all the necessary components. If a strategy already exists, you can update parts of it using the `override` feature. The system uses a special type-safe mechanism to organize and store these strategy blueprints.

## Class StrategyCoreService

StrategyCoreService acts as a central hub for managing and running strategies within the backtest-kit framework. It combines several services to ensure strategies have the necessary information to operate correctly, especially during backtesting.

Think of it as an orchestrator—it handles tasks like validating strategies, retrieving pending signals, checking if a strategy is stopped, and most importantly, executing the core strategy logic.

It simplifies the process of running strategies by automatically providing the right context (like the symbol being traded and the time period) to the strategy itself. 

Here's a breakdown of what it does:

*   **Validation:** It verifies that strategies and their risk configurations are set up correctly, remembering previous validations to avoid unnecessary checks.
*   **Signal Retrieval:** It can fetch the currently active signal for a particular symbol.
*   **Status Checks:** It allows you to determine if a strategy has been stopped.
*   **Execution:**  It provides methods like `tick` and `backtest` to run the strategy against real-time or historical data. These methods carefully prepare the data and pass it to the strategy.
*   **Control:** It lets you stop a strategy from generating new signals and clear its cached data for a fresh start.

## Class StrategyConnectionService

The StrategyConnectionService acts as a central hub for managing and running your trading strategies. It intelligently routes requests to the correct strategy instance based on the symbol and strategy name you specify. Think of it as a dispatcher, ensuring each strategy gets the right instructions.

To optimize performance, it cleverly remembers (caches) strategy instances, so it doesn't have to recreate them every time you need them. Before any strategy operations can happen, it makes sure the strategy is properly initialized. 

You can use it to execute live trading ticks (`tick()`) or perform backtests (`backtest()`) on your strategies, giving you flexibility in how you test and deploy them. It also provides ways to check if a strategy is stopped (`getStopped()`), retrieve pending signals (`getPendingSignal()`), and even clear out existing strategy instances from memory (`clear()`), allowing for resets and resource management. It's designed to handle the complexities of running multiple strategies simultaneously, ensuring they operate correctly and efficiently.

## Class SizingValidationService

The SizingValidationService helps you keep track of your position sizing strategies and make sure they're set up correctly. Think of it as a central place to register and check your sizing rules.

You can add new sizing strategies using `addSizing()`, providing a name and a description of how that strategy works. 

Before you actually use a sizing strategy in a backtest, the `validate()` function checks to see if it's been registered, preventing errors. To speed things up, the service remembers its validation checks so it doesn't have to repeat them unnecessarily.

Finally, `list()` provides a convenient way to see all the sizing strategies you’ve currently registered, making it easy to manage your configuration.

## Class SizingSchemaService

This service helps you keep track of how much of an asset you'll trade in your backtesting strategies. It’s like a central place to store and manage your sizing rules – the rules that determine your position sizes. 

It uses a special system to ensure that your sizing rules are well-formed and consistent, checking for the essential building blocks before they’re saved. 

You can add new sizing rules using `register`, update existing ones using `override`, and easily find the rules you need using `get`. Think of `register` as adding a new rule, `override` as tweaking an existing one, and `get` as simply looking up a rule by its name.

## Class SizingGlobalService

This service helps determine how much to trade, handling the complex calculations involved in position sizing. It acts as a central point for these calculations, connecting various services to ensure accuracy and consistency.  Think of it as the engine that figures out how much capital to allocate to each trade based on your risk profile and trading strategy.

The service relies on a connection service for its data and a validation service to confirm calculations are correct.  The `calculate` method is the core function; it takes parameters like risk tolerance and market data and returns the recommended position size. It also includes a logger service to record events related to sizing calculations.

## Class SizingConnectionService

The SizingConnectionService acts as a central hub for handling position sizing calculations within the backtest-kit framework. It intelligently directs sizing requests to the correct sizing implementation, making it easy to use different sizing methods without complex code changes. 

To optimize performance, it remembers (caches) previously used sizing implementations, so you don’t have to recreate them every time. This caching is managed by the `getSizing` property, offering flexibility and control.

The `calculate` method is the primary way to get a position size, taking into account your risk parameters and the chosen sizing method. It handles the behind-the-scenes routing to the appropriate sizing logic, whether you're using a fixed percentage, Kelly Criterion, or something else. If a strategy doesn’t have any sizing configuration, you'll use an empty string for the sizing name.

## Class ScheduleUtils

ScheduleUtils is a handy helper for keeping track of and reporting on signals that are scheduled for execution. Think of it as a central place to monitor how your trading strategies are queuing up signals and how long they're waiting to be processed.

It gives you easy access to information about scheduled signals, like how many are in the queue, how many have been cancelled, and how long they typically take to run. You can also generate clear, readable markdown reports that summarize this data for a specific symbol and strategy.

The utility is designed to be simple to use; it's available as a single, readily accessible instance. It’s also useful for analyzing backtest runs to understand signal scheduling performance.

Here’s a breakdown of what it lets you do:

*   **Get Data:** Pull statistical information on scheduled signals for a particular symbol and strategy.
*   **Generate Reports:** Create markdown reports summarizing signal events, which are useful for quickly understanding performance.
*   **Save Reports:** Save these reports directly to a file on your computer.

## Class ScheduleMarkdownService

This service automatically creates reports detailing scheduled and cancelled trading signals. It keeps track of these events for each strategy you're backtesting, compiling them into easy-to-read markdown tables. You'll find these reports saved as `.md` files in your logs directory, organized by strategy name.

The service gathers data by listening for signal events – both when signals are scheduled and when they're cancelled. It calculates statistics like cancellation rates and average wait times, adding valuable insights to your backtesting analysis. 

To use it, you don't need to explicitly initialize anything; it handles that automatically when you first start using it.  You can then retrieve the accumulated data, generate the reports, or clear the data if needed. The service organizes data in isolated storage for each symbol, strategy, and backtest combination, ensuring a clean separation of information.

## Class RiskValidationService

This service helps you keep track of and verify your risk management setups. Think of it as a central place to register all your risk profiles – essentially, the rules and guidelines for managing risk. Before any trading activity happens, you can use this service to double-check that a specific risk profile actually exists and is properly configured. 

It also remembers its checks, so it doesn't have to repeatedly validate the same profile, making things faster. You can add new risk profiles, validate existing ones, and get a complete list of all the profiles you’ve registered. This ensures consistency and prevents errors related to missing or misconfigured risk settings.

## Class RiskUtils

The RiskUtils class offers tools to analyze and report on risk rejection events within the backtest-kit framework. Think of it as a central place to get a handle on why trades were rejected and how frequently.

It provides methods to pull out key statistics, like the total number of rejections, broken down by symbol and strategy. You can also generate nicely formatted markdown reports detailing each rejection event, complete with useful information like the position, exchange, price, and reason for the rejection. 

Finally, RiskUtils can create and save these reports as files, making it easy to share or archive your risk rejection data.  The data comes from events tracked by the RiskMarkdownService and stored internally, allowing you to understand and address potential issues in your trading strategies.

## Class RiskSchemaService

This service helps keep track of your risk profiles in a structured and organized way. It uses a special type-safe system to store these profiles, ensuring they're consistent and reliable. You can add new risk profiles using the `addRisk` function (which is represented here as `register`), and retrieve them later by their unique names using the `get` function. 

Before a risk profile is added, it’s quickly checked to make sure it has all the necessary information with the `validateShallow` function.  You can also update existing risk profiles; the `override` function lets you make changes to specific parts of a profile without having to replace the whole thing. The service relies on a logging mechanism (`loggerService`) to keep track of what's happening.

## Class RiskMarkdownService

The RiskMarkdownService is designed to automatically create reports detailing risk rejections encountered during trading. It keeps track of all rejection events, organizing them by the asset being traded (symbol) and the specific trading strategy used.

The service generates these reports as easily readable markdown tables, providing a clear overview of what went wrong and when. You’ll find statistics included, showing the total number of rejections, broken down by symbol and strategy. These reports are automatically saved as files on your disk, making it easy to review and analyze potential issues.

You don't have to manually start this process – the service automatically subscribes to rejection events and handles the report generation. It uses a clever system to ensure each symbol and strategy combination has its own dedicated storage space, preventing data from mixing up. You can also clear the stored data if needed, either for a specific combination of symbol, strategy, and backtest or for everything at once.

## Class RiskGlobalService

This service acts as a central hub for managing risk checks within the trading framework. It works closely with a connection service to ensure trading signals adhere to predefined risk limits. The service keeps track of open trading signals, registering them and removing them as they're opened and closed. 

For efficiency, the risk validation process is memoized, preventing unnecessary re-checks of the same configurations. You can clear the risk data entirely, or target specific risk instances if needed. This helps in maintaining control and stability during backtesting or live trading.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks within your trading system. It intelligently directs risk-related operations to the correct risk implementation based on a specified name, ensuring different strategies or environments use the appropriate rules.

To improve performance, it cleverly caches these risk implementations, so you don't have to recreate them every time.  You can think of it as a smart dispatcher for your risk management.

It provides functions for validating signals – checking things like portfolio drawdown, how much you're exposed to specific symbols, and daily loss limits.  When a signal is rejected due to risk limits, it will notify your system.

There are also methods to register and unregister signals with the risk management system as positions are opened and closed.  If you need to clear cached risk settings, especially during backtesting or switching environments, you can do so with the `clear` function.  When no risk configuration is present for a strategy, the `riskName` will simply be an empty string.

## Class PositionSizeUtils

This class offers helpful tools for figuring out how much of an asset to trade, often called position sizing. It’s designed to make calculating these sizes easier and more reliable.

Inside, you’ll find different pre-built methods for determining your position size, such as:

*   **Fixed Percentage:**  This method automatically calculates the size based on a fixed percentage of your account balance, ensuring consistent risk exposure.
*   **Kelly Criterion:**  A more complex approach that considers your win rate and win-loss ratio to optimize your position size.
*   **ATR-Based:**  This uses the Average True Range (ATR) to help size your positions based on the asset's volatility.

Each method has built-in checks to make sure your input data is suitable, reducing the chance of errors. Think of it as having a built-in quality control system for your position sizing calculations.

## Class PersistSignalUtils

This class, PersistSignalUtils, is like a helpful assistant for keeping track of trading signals. It makes sure that signals are safely stored and remembered, particularly for strategies that need to resume where they left off. 

It works by creating a unique storage space for each trading strategy, so information doesn't get mixed up. You can even customize how these signals are stored using special adapters.

The system handles reading and writing signals reliably, protecting against data loss even if something unexpected happens. Specifically, `readSignalData` retrieves existing signals, and `writeSignalData` saves new ones, all while ensuring that the process is secure. It's a core component used by the ClientStrategy to manage signals in live trading environments. Finally, you can extend its functionality with custom persistence adapters using `usePersistSignalAdapter`.

## Class PersistScheduleUtils

This class, PersistScheduleUtils, helps manage how scheduled signals are saved and loaded, especially for trading strategies. It ensures that signal data is reliably stored, even if there are interruptions or crashes.

Essentially, each strategy gets its own dedicated storage for these scheduled signals, and you can even plug in your own custom storage solutions. The data reads and writes happen in a way that prevents corruption, ensuring the signals remain consistent. 

The `readScheduleData` method fetches previously saved signal data, and `writeScheduleData` stores new or updated signal data. ClientStrategy uses these methods to load initial states and persist changes. You can also customize the underlying persistence mechanism using `usePersistScheduleAdapter`.

## Class PersistRiskUtils

This class, PersistRiskUtils, helps manage and store information about your active trading positions, specifically focusing on risk management. It's designed to work closely with ClientRisk to ensure that your positions are saved reliably, even if something unexpected happens.

Think of it as a secure vault for your position data. It remembers which storage method to use for each risk profile and makes sure that updates are written safely and without risk of data corruption.

You can even customize how the data is stored by plugging in your own storage adapters.  The `readPositionData` method retrieves your saved position details, while `writePositionData` updates them. This class ensures consistency when restoring or saving your trading state.

## Class PersistPartialUtils

This class, PersistPartialUtils, helps keep track of your trading progress – specifically, the partial profits and losses – and makes sure that information isn't lost, even if something unexpected happens. It’s designed to work closely with the ClientPartial component for live trading scenarios.

The class intelligently manages storage, remembering where to find partial data for each symbol and strategy combination. You can even customize how this data is stored using your own adapters. 

Importantly, it uses special techniques to read and write this data safely, ensuring that your progress is accurately saved and retrievable, even in the event of a system crash.  When starting up, `readPartialData` is used to fetch any previously saved partial data.  After adjustments to profit/loss levels, `writePartialData` reliably stores the updated information. If you need more control over the storage mechanism, `usePersistPartialAdapter` lets you register your own way of handling persistence.

## Class PerformanceMarkdownService

This service helps you understand how your trading strategies are performing. It keeps track of performance data for each strategy and symbol combination, collecting key metrics like averages, minimums, maximums, and percentiles. 

You can request aggregated statistics for a specific strategy and symbol to see its overall performance. 

The service can also generate detailed markdown reports that pinpoint potential bottlenecks and areas for improvement. These reports are saved to your logs directory, making it easy to review and share your findings.

It also has a way to clear out all the collected data when you need a fresh start. 

Finally, the service initializes itself automatically to start collecting performance data.

## Class Performance

The Performance class helps you understand how well your trading strategies are performing. It offers tools to gather and analyze performance statistics, providing insights into areas that might need improvement.

You can retrieve detailed performance data for specific symbols and strategies, including counts, durations, averages, and percentiles, to pinpoint potential bottlenecks.

It also generates readable markdown reports that visually break down the time spent on different operations, helping you identify where your strategy is slowing down.  You can save these reports directly to your hard drive for later review or sharing. Finally, you have the option to customize the columns displayed in the reports.

## Class PartialUtils

This class provides helpful tools for analyzing your partial profit and loss data, which is especially useful when backtesting or live trading. Think of it as a way to easily get statistics and reports about your trading performance, broken down by symbol and strategy.

You can use it to pull out key numbers like total profit/loss event counts. It can also generate clear, well-formatted markdown reports – essentially tables – that show you all the details of your partial profits and losses, including when they occurred, how much was involved, and why.  These reports include information like the action (profit or loss), the symbol traded, the trading strategy used, signal IDs, position size, level percentages, prices, and timestamps.

Finally, the class lets you automatically save these reports to files on your computer, neatly organized by symbol and strategy name, making it a breeze to review your trading history and share results. It handles creating the necessary folders, so you don't have to worry about that.

## Class PartialMarkdownService

The PartialMarkdownService helps you track and report on your trading performance by creating detailed reports of partial profits and losses. It listens for these events as they happen and organizes them based on the trading symbol and strategy used. 

You can then generate easy-to-read markdown tables that break down each profit and loss event, along with overall statistics like total profit and loss counts. The service automatically saves these reports to your disk, making it simple to review your progress over time.

It uses a special system for storing this data, ensuring each symbol and strategy pair has its own dedicated storage space.  You can clear out this stored data when you're done with it, either selectively for specific trades or completely. The service sets itself up automatically when you first use it, so you don't have to worry about any manual configuration.

## Class PartialGlobalService

The PartialGlobalService acts as a central hub for managing partial profit and loss tracking within the backtest framework. Think of it as a gatekeeper – it sits between your trading strategy and the underlying connection layer, ensuring everything is logged and validated before it happens. It's injected into your strategy to provide a single point for dependency injection, making your code cleaner and easier to manage.

This service doesn’t actually *do* the work of tracking partials; it relies on another component, the PartialConnectionService, for that.  However, it logs every action related to partial profit/loss at a global level, providing valuable insights into how your strategy is performing.

It also handles important validation steps, making sure your strategy and associated risk configurations are set up correctly.  The `validate` function, for example, avoids repeating these checks unnecessarily.

Finally, the `profit`, `loss`, and `clear` functions are the main entry points for handling profit, loss, and signal closure events.  Each function logs the operation before passing it on to the PartialConnectionService for actual processing.

## Class PartialConnectionService

This service is responsible for keeping track of partial profits and losses for your trading signals. Think of it as a central place that manages and remembers information about each signal's progress.

It efficiently creates and stores "ClientPartial" objects, which hold the details of each signal’s profit and loss. Each signal gets its own ClientPartial, and this service makes sure you don’t create unnecessary ones by cleverly caching them. 

When a signal hits a profit or loss milestone, this service handles the updates and notifications. If a signal closes completely, it cleans up its associated data, ensuring everything runs smoothly and efficiently. The service relies on a logger for recording events and uses caching to optimize performance and prevent memory issues.

## Class OutlineMarkdownService

The OutlineMarkdownService helps create organized documentation from the outputs of AI-powered strategy optimization. It automatically generates markdown files to record the conversation flow, including the initial system prompt, user inputs, and the final LLM-generated output. 

These files are saved within a specific directory structure, making it easy to review the debugging process and understand how the AI arrived at a particular strategy. The service avoids accidentally overwriting existing documentation by checking if the directory already exists before creating new files. This tool is particularly useful for saving and examining the logs and conversation history involved in strategy development.


## Class OptimizerValidationService

This service acts as a central place to keep track of all your optimizers, ensuring they exist and are properly configured within your backtesting system. It's like a librarian for optimizers, making sure everything is organized and accessible.

You can add new optimizers to this registry, and it makes sure you don’t accidentally register the same optimizer twice.  The service also has a handy way to check if a particular optimizer is registered, and it does this quickly thanks to a performance optimization technique.

If you need to see a complete list of all the optimizers you've registered, this service provides that as well. Essentially, it helps keep your optimizers in order and makes validation much simpler.

## Class OptimizerUtils

The OptimizerUtils provides tools for working with trading strategies generated by an optimizer. You can use it to retrieve information about your strategies, generate the actual code that runs them, and save that code to files.

The `getData` function lets you pull strategy data, essentially gathering all the relevant details and history related to your optimizer run.  The `getCode` function then takes that data and assembles it into a complete, runnable code file that contains everything your strategy needs. Finally, `dump` takes the generated code and saves it to a file, creating the necessary folders if they don't already exist, making it easy to deploy your strategies.

## Class OptimizerTemplateService

This service is designed to help you automatically generate code snippets for backtesting and optimizing trading strategies. It acts as a central place for creating these code pieces, using a large language model (LLM) through its integration with Ollama.

It offers a range of useful features, including the ability to analyze data across multiple timeframes (like 1-minute, 5-minute, and hourly intervals). The generated code produces signals in a structured JSON format, making them easy to understand and use.  You’ll also find built-in debugging tools that log information to a designated directory.

The service can handle communication with cryptocurrency exchanges using CCXT, and it also allows you to compare different trading strategies.  While it provides default templates, you have the flexibility to customize certain aspects through your configuration settings.

Here's a breakdown of what it can generate:

*   **Overall Code Structure:**  It produces the foundational code with necessary imports and constants.
*   **User/Assistant Prompts:**  It creates prompts for the LLM to understand the data being analyzed.
*   **Strategy Comparisons (Walker):** It generates configuration for comparing several strategies against each other.
*   **Individual Strategies:**  It generates code for individual trading strategies, incorporating multi-timeframe analysis and signal generation.
*   **Exchange Configuration:** It sets up the connection to cryptocurrency exchanges like Binance.
*   **Timeframe (Frame) Configuration:**  It handles the configuration for specific time periods in your backtesting.
*   **Launcher Code:**  It creates the code needed to actually run the comparison tests.
*   **Debugging Helpers:** It provides tools to save LLM conversations and results for easier troubleshooting.
*   **Text and JSON Output Helpers:** It has dedicated tools for generating text-based analysis and structured trading signals (following a defined JSON schema for position, notes, prices, and estimated duration).

## Class OptimizerSchemaService

The OptimizerSchemaService helps you keep track of and manage the configurations for your optimization strategies. Think of it as a central place to store and validate these configurations, ensuring they’re set up correctly.

It uses a registry to hold these configurations, and when you add a new configuration, it makes sure all the necessary pieces are there. You can also update existing configurations by making partial changes—it intelligently merges the new information with what's already stored. Finally, it provides a way to easily retrieve a configuration by its name when you need it.


## Class OptimizerGlobalService

This service acts as a central hub for working with optimizers, ensuring everything runs smoothly and safely. It's your main entry point for retrieving optimizer data and generating strategy code.

Before anything happens, the service keeps a log of the operation and double-checks that the optimizer you’re working with actually exists. Then, it passes the request on to a specialized service for handling the actual data retrieval or code generation.

You can use it to:

*   **Get data:**  Retrieve information about your optimizers, including details about the strategies they can generate.
*   **Generate code:** Create the complete code for your trading strategies based on the optimizer's settings.
*   **Save code:**  Save the generated code directly to a file for later use.

The service handles the validation and logging, so you can focus on getting your strategies working.

## Class OptimizerConnectionService

The OptimizerConnectionService helps you easily work with optimizers in your backtesting system. It acts as a central point for creating and managing connections to different optimizers, making sure you don't create unnecessary duplicates. 

It intelligently caches optimizer instances, which speeds things up by avoiding redundant setup. You can also customize the optimizer templates by combining your own settings with the default ones.

The service provides methods to:

*   Retrieve optimizer instances, using a name to identify them.
*   Fetch data and create metadata for your trading strategies.
*   Generate complete, ready-to-run code for your strategies.
*   Save the generated code to a file for later use.

Think of it as a smart helper that handles the behind-the-scenes complexity of connecting to and using optimizers.

## Class LoggerService

The LoggerService helps keep your backtesting logs organized and informative. It acts as a central point for all logging within the backtest-kit framework. 

You can think of it as a smart wrapper around your chosen logging system. It automatically adds extra details to each log message, like which strategy, exchange, and frame are involved, plus information about the specific symbol and time being analyzed. This context makes it much easier to understand what's happening during your backtests.

If you don't provide your own logger, it defaults to a “no-op” logger, meaning it won't actually record anything.

You can customize the logging behavior by setting your own logger using the `setLogger` method. It uses `methodContextService` and `executionContextService` internally to manage these contextual details.

## Class LiveUtils

LiveUtils provides tools to make running live trading easier and more robust. It acts as a central point for starting, monitoring, and stopping live trading sessions.

Think of it as a helper for your trading bots, handling the complexities of connecting to exchanges and keeping things running smoothly, even if there are unexpected errors. 

You can use it to start a live trading session for a specific symbol and strategy, with the framework automatically recovering from crashes and keeping track of the progress. There’s also a “background” mode for running trades where you’re not directly interested in the results—perhaps you just want to trigger some other actions or save data.  

If you need to stop a trading session, LiveUtils offers a way to do so gracefully, ensuring that any active trades complete normally. You can also get statistics, reports, and a list of all currently running trading instances to monitor their status. Everything is designed for convenient access and management of your live trading operations.

## Class LiveMarkdownService

The LiveMarkdownService helps you automatically create and save reports about your live trading activity. It listens to every signal event – from when a strategy is idle to when a trade is opened, active, or closed – and keeps track of all the details. 

It organizes this information into nicely formatted markdown tables, giving you a clear view of what's happening with your strategies. You'll get useful statistics like win rate and average profit/loss.

The service automatically saves these reports as markdown files in a designated log directory, making it easy to review your performance. It’s designed to be simple to use; it even initializes itself automatically when you first start using it. You can also clear the stored data if you need to. The service ensures that each symbol, strategy, and backtest combination has its own dedicated storage area, keeping your reports organized.

## Class LiveLogicPublicService

This service helps manage and execute live trading strategies. It acts as a convenient layer on top of the core trading logic, automatically handling important context information like the strategy name and exchange being used, so you don’t have to pass it around with every function call. 

Think of it as a continuous, never-ending stream of trading updates (both signals to buy or sell and confirmations of completed trades).  

It’s designed to be robust – if something goes wrong and the process crashes, it can recover and pick up where it left off using saved data. It also keeps track of time accurately, using the current date and time to ensure things are progressing correctly. To get things started, you’ll specify the trading symbol and associated context.

## Class LiveLogicPrivateService

This service manages the ongoing process of live trading, designed to keep running continuously. It essentially acts as a tireless monitor, constantly checking for trading signals.

The service works by repeatedly checking the status of signals, and it delivers updates only when a trade is opened or closed – it skips over periods of inactivity. It uses a clever streaming approach to handle data efficiently and avoid memory issues.

If the system unexpectedly crashes, it's built to recover and resume trading from where it left off, ensuring no data is lost.  The `run` method is the key to initiating this live trading loop, taking a symbol as input and providing a stream of results. Think of it as a continuously running engine for your trading strategies.

## Class LiveCommandService

This service acts as a central hub for live trading operations within the backtest-kit framework. Think of it as a convenient way to access and manage live trading functionality, designed to be easily integrated into other parts of your application. It handles the complex interactions with lower-level services, like validating your trading strategy and exchange configurations, all behind the scenes. 

The `run` method is the key feature here – it's what kicks off the live trading process for a specific symbol. It continually provides updates on how the strategy is performing, including whether it has opened or closed positions. Importantly, it's built to be resilient and automatically recover from unexpected errors, ensuring your trading continues as smoothly as possible.

## Class HeatUtils

HeatUtils is designed to make it easy to visualize and analyze your trading strategy's performance using heatmaps. It gathers statistics for each symbol your strategy trades, giving you a clear picture of how different assets contributed to overall results. Think of it as a centralized tool that simplifies creating reports and exporting them.

You can retrieve the underlying data for a strategy's heatmap, which breaks down the performance by symbol and provides portfolio-level metrics. 

It can also generate a nicely formatted markdown report summarizing the heatmap data, including important metrics like total profit, Sharpe Ratio, maximum drawdown, and number of trades, all sorted by profitability. Finally, you can easily save this report directly to a file on your computer. This utility operates as a single, readily available instance, making it straightforward to use throughout your backtesting workflow.

## Class HeatMarkdownService

The Heatmap Service helps you visualize and analyze your backtest results. It takes in data from your trading strategies and builds a portfolio-wide view, showing key metrics like profit and loss, Sharpe Ratio, and maximum drawdown.

It organizes information separately for each strategy and backtest mode, so you can easily compare performance. You can view these statistics individually for each symbol, or see a consolidated overview of the entire portfolio.

The service can generate easy-to-read Markdown reports summarizing the heatmap data, which you can then save to files. It handles tricky math situations gracefully, preventing errors. Importantly, it automatically sets itself up when you first start using it, and provides a way to clear out old data when you're done.

## Class FrameValidationService

The FrameValidationService helps you keep track of your trading timeframes and make sure they’re set up correctly. Think of it as a central place to register your timeframes and quickly check if one exists before you try to use it in your backtesting process. It remembers which timeframes you've registered, so you don't have to keep checking.

You can add new timeframes using `addFrame`, and confirm a timeframe is valid using `validate`. If you need a list of all registered timeframes, `list` provides that information. It also uses a clever trick called memoization to make checks faster by remembering previous validation results.

## Class FrameSchemaService

This service helps keep track of the blueprints for your backtesting strategies, ensuring they're all structured correctly. It acts as a central place to store and manage these blueprints, which we call "frames." 

Think of it like a librarian organizing books - you give it a name (the "key"), and it stores the details of the strategy ("IFrameSchema").

You can add new strategy blueprints using `register()`, update existing ones with `override()`, and retrieve them later by name using `get()`.  It makes sure the blueprints have the expected elements before storing them, preventing issues down the line. This service leverages a special system for type-safe storage to keep things organized.

## Class FrameCoreService

The FrameCoreService acts as a central hub for managing timeframes within the backtesting framework. It relies on other services like FrameConnectionService to actually fetch the timeframe data. Think of it as a helper that prepares the timeline of historical data needed for running your trading strategies. 

It provides a simple method, `getTimeframe`, which is your go-to function for getting an array of dates representing the timeframe for a specific trading symbol and timeframe name – essentially setting up the stage for your backtest. The framework uses this service internally to coordinate everything.


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different trading frames, like historical data windows. It automatically directs requests to the correct frame implementation based on the current context, which helps streamline your backtesting process. 

To improve performance, it remembers frequently used frames so you don’t have to recreate them every time. 

This service provides a way to get the timeframe for a specific trading symbol and frame, allowing you to define and restrict the dates used in your backtests. When operating in live mode, it doesn't enforce any frame constraints. It's designed to work with a logger service, a frame schema service, and a method context service, all contributing to its frame routing and management capabilities.

## Class ExchangeValidationService

The ExchangeValidationService helps you keep track of your trading exchanges and make sure they're set up correctly. Think of it as a central place to register your exchanges and quickly check if they're available before you start trading. 

It lets you add new exchanges to a managed list, and provides a way to verify that an exchange is registered before trying to use it – preventing unexpected errors. To make things efficient, the service remembers validation results so it doesn't have to check things repeatedly. You can also easily get a complete list of all the exchanges you've registered.

## Class ExchangeUtils

The `ExchangeUtils` class is like a helpful assistant for working with different cryptocurrency exchanges. It’s designed to make common tasks easier and safer, providing a single, reliable place to go for these operations.

It manages its own internal workings to ensure each exchange is treated separately.

You can use `getCandles` to retrieve historical price data, figuring out the right timeframe automatically to match your request. `getAveragePrice` calculates the VWAP, giving you an idea of the average price over a period.  `formatQuantity` and `formatPrice` handle the often-tricky precision requirements of each exchange, ensuring your trade orders are correctly formatted and valid. All of these methods operate with validation built-in.

## Class ExchangeSchemaService

This service helps keep track of different exchange configurations, ensuring they're set up correctly and consistently. It acts like a central library for exchange schemas.

You add new exchange configurations using `addExchange()`, and retrieve them later using their names. The service uses a special system to store these configurations in a type-safe way, meaning it helps prevent errors. 

Before a new exchange configuration is added, it's checked to make sure it has all the necessary pieces. If a configuration already exists, you can update parts of it using `override()`. Finally, you can easily get a specific exchange configuration by providing its name.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for interacting with exchanges within the backtest-kit framework. It combines connection details with information about the specific trading scenario, like the asset being traded, the time period, and whether it's a backtest or live trade.  This service handles validating exchange settings to ensure they are correct and efficient.

It provides methods to retrieve historical and future price data (for backtesting purposes only), calculate average prices, and format price and quantity values, all while incorporating the relevant context for the trade. Think of it as a wrapper around the exchange connection, adding the necessary context for accurate and reliable trading operations during backtesting and potentially live trading. The service relies on other components like a logger and validation service to ensure operations are tracked and reliable.

## Class ExchangeConnectionService

The `ExchangeConnectionService` acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently routes your requests – like fetching historical data or getting the current average price – to the correct exchange implementation based on the configured exchange name. To make things efficient, it remembers (caches) these exchange connections so you don't have to repeatedly create them.

It provides methods for fetching candles (historical price data), retrieving the next batch of candles relative to a specific time, getting the current average price, and formatting prices and quantities to conform to the precise rules of each exchange. This service handles the underlying complexities of communicating with various exchanges, allowing you to focus on your trading strategies. The service also logs all operations, which is helpful for debugging.

Here's a breakdown of the key components:

*   **Automatic Routing:** It automatically determines which exchange to use.
*   **Caching:** It caches exchange connections for speed.
*   **Comprehensive Interface:** It provides a complete set of functions for interacting with exchanges.
*   **Formatting:** It ensures price and quantity formatting aligns with exchange specifications.



The `getExchange` method is the core of this routing, retrieving the appropriate exchange connection. `getCandles` and `getNextCandles` provide access to historical and recent price data, respectively. `getAveragePrice` gives you the current price, calculated differently based on whether you’re backtesting or live trading. `formatPrice` and `formatQuantity` are important for ensuring your orders comply with exchange rules.

## Class ConstantUtils

The `ConstantUtils` class provides a set of predefined values used for setting take-profit and stop-loss levels in your trading strategies. These values are calculated using a modified Kelly Criterion, designed to manage risk and optimize profit potential.

Think of these constants as predefined milestones along your target profit or loss path.  For example, if you're aiming for a +10% profit, `TP_LEVEL1` will trigger when the price reaches +3%, `TP_LEVEL2` at +6%, and `TP_LEVEL3` at +9%.  Similarly, `SL_LEVEL1` and `SL_LEVEL2` offer early warning and final exit points for stop-loss management.

This approach lets you lock in profits incrementally while still allowing the trade to run, and provides tiered exits to minimize potential losses if the trade moves against you. The different levels allow for a staged approach to exiting a trade.


## Class ConfigValidationService

The ConfigValidationService is here to make sure your trading configurations are mathematically sound and have a chance to actually make money. It’s like a safety net, checking all your key settings – things like slippage, fees, profit margins, and how far your take profit needs to be – to catch any potential errors or setups that would lead to losses. 

It confirms that percentage-based values are positive, time-related values are whole numbers, and that relationships between settings (like stop-loss and take-profit distances) make sense. A core check verifies that your minimum take profit distance accounts for all transaction costs like slippage and fees, so you’re not losing money just to break even. Essentially, this service helps you avoid common configuration pitfalls that could tank your backtesting results.

## Class ColumnValidationService

The ColumnValidationService helps keep your column configurations tidy and reliable. It acts as a safety net, checking that all your column definitions are set up correctly and follow the rules.

It makes sure each column has all the essential pieces: a unique key, a descriptive label, a defined format, and a visibility setting.  It also verifies that the keys you've chosen don't clash with each other, and that the format and visibility instructions are actually functions that can be executed. Basically, it ensures your column configurations are structurally sound and ready to go.

You can use its `validate` method to perform these checks on your configurations, catching potential errors early on. It's designed to prevent issues down the line by confirming that all the configurations in your system align with the expected structure.

## Class ClientSizing

This component, ClientSizing, figures out how much of your capital to use for each trade. It's designed to be flexible, letting you choose from different sizing methods like fixed percentages, Kelly Criterion, or Average True Range (ATR). 

You can also set limits on how large a position can be, either as a minimum or maximum size.  A key feature is the ability to define rules to validate sizing results or keep a record of how sizing decisions were made. Essentially, it takes the strategy’s signals and turns them into concrete trade sizes.

The `calculate` method is the workhorse, taking input parameters and returning the calculated position size. The `params` property holds all the configuration details for the sizing process.

## Class ClientRisk

ClientRisk helps manage the overall risk of your trading portfolio. It’s a central component that prevents strategies from taking actions that could exceed your defined limits. Think of it as a safety net that watches what's happening across all your strategies simultaneously.

It keeps track of all open positions, allowing you to set limits like the maximum number of positions you can hold at once, and even define your own custom risk checks. These custom checks can look at all your active positions to make informed decisions.

ClientRisk is automatically used when a strategy wants to open a new position. It checks if the trade is allowed, and only proceeds if everything is within your risk parameters. It's designed to work with multiple strategies, ensuring a holistic view of your portfolio’s risk.

You can add signals (new positions) and remove them (closed positions) as needed, and ClientRisk handles the details of tracking those changes. It also has a one-time initialization process to load existing positions, although this is skipped during backtesting.

## Class ClientOptimizer

The `ClientOptimizer` helps manage and run optimization processes, acting as a bridge between the optimization service and the actual data and code generation. It gathers data from various sources, handles pagination, and prepares it for the optimization process. It's designed to track the progress of these operations and report updates. 

This class automatically builds a history of interactions with Large Language Models (LLMs) to provide context during code generation. It also takes care of creating the final strategy code, pulling together necessary components like imports and helper functions. Finally, it can save the generated code to a file, creating directories as needed, resulting in an easily runnable `.mjs` file.

## Class ClientFrame

The `ClientFrame` component is responsible for creating the timelines your backtesting runs use. Think of it as the engine that produces the sequence of dates and times for your historical data.  It’s designed to be efficient, avoiding duplicate timeline generation through a caching mechanism. You can configure the time interval used, ranging from one-minute intervals to three-day intervals. It also lets you hook in custom logic to check the validity of the generated timeframe or log details during the process.  This component works closely with the core backtesting engine to drive the simulation forward through time.  The `getTimeframe` property is the primary way to retrieve these timelines, and it cleverly caches results so you don't rebuild them unnecessarily.


## Class ClientExchange

This `ClientExchange` component acts as a bridge to your exchange data, providing essential functions for backtesting and live trading. It's designed to be memory-efficient, using prototype functions to minimize resource usage.

You can use it to retrieve historical candle data based on a specific time, or look ahead to fetch future candles, which is particularly useful when simulating trades in a backtest. It provides a way to calculate the VWAP, a common indicator based on volume and price, using a configurable number of recent 1-minute candles.

Finally, it simplifies handling exchange-specific formatting needs for both quantities and prices, ensuring accurate representation based on the traded symbol's rules. This helps avoid common errors related to precision and rounding.

## Class CacheUtils

CacheUtils helps you speed up your code by automatically remembering and reusing the results of expensive function calls. It's like having a built-in memory for your functions.

You can easily wrap any function with `fn` to have it cached based on a timeframe. This means the function will only recalculate when the timeframe changes, saving you a lot of processing power.

If you need to force a function to recalculate, `clear` removes the cached result *only* for the current situation. Think of it as cleaning out one specific entry in the memory.

Sometimes you might want to completely wipe the memory for a function— `flush` does that. It removes all cached results for a function, regardless of how it's being used. This is useful when you've made changes to a function and need to ensure fresh results, or if you want to free up memory.

## Class BacktestUtils

BacktestUtils is a helpful tool that simplifies running and managing backtests within the framework. It acts as a central point for common backtesting operations, providing a convenient way to execute tests and gather information.

The `run` function lets you kick off a backtest for a specific symbol and strategy, providing results as they become available. For tasks that don't need the results directly, the `background` function allows you to run a test in the background—ideal for logging or triggering other actions during the process.

You can also use `stop` to halt a strategy’s signal generation, effectively pausing a backtest.  It’s designed to stop cleanly, allowing existing signals to complete.

Need to analyze the results? `getData` provides statistics from closed signals, while `getReport` generates a formatted markdown report.  `dump` makes saving these reports to a file easy, and `list` gives you an overview of all currently running backtest instances and their statuses.  The system ensures that each unique combination of symbol and strategy gets its own isolated backtest instance.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you automatically create and save reports about your backtesting results. It keeps track of closed trading signals for each strategy you’re testing, storing the information in a way that prevents conflicts between different tests. 

Essentially, it listens for updates during your backtest and gathers data about completed trades. You can then request a nicely formatted Markdown report summarizing those trades, including key details. The reports are saved as files on your computer, organized by the symbol, strategy name, and backtest you ran. 

The service also allows you to clear out old data if you’re running many tests and want to manage storage space, and it automatically initializes itself when needed. You can choose to clear all data or just data from a specific test run.

## Class BacktestLogicPublicService

BacktestLogicPublicService helps you run backtests in a simplified way. It handles the behind-the-scenes context management, so you don't need to repeatedly pass information like the strategy name or exchange details to different functions. 

Think of it as a helper that automatically sets up the environment for your backtesting process. You tell it which symbol to backtest and provide an initial context, and it takes care of propagating that context to all the relevant parts of the backtesting engine. 

The `run` method is the main entry point; it streams backtest results one by one, letting you process them as they become available. This makes it efficient for long backtests.


## Class BacktestLogicPrivateService

This service helps run backtests efficiently, especially when dealing with lots of historical data. It works by getting a list of time periods, then stepping through each one, checking for trading signals. When a signal tells the strategy to open a trade, it fetches the necessary market data and runs the core backtesting logic.

Instead of storing all the results in memory at once, it sends them out one by one as the backtest progresses, which is great for avoiding performance issues with large datasets. You can also stop the backtest early if you need to, just by interrupting the process. The `run` method is how you kick off the backtest for a specific trading symbol.

## Class BacktestCommandService

This service acts as a central access point for running backtests within the system. Think of it as a helper that makes it easy to plug backtesting functionality into other parts of your application. 

It bundles together several other services – like those responsible for validating strategies, exchanges, and data frames – to ensure everything is set up correctly before a backtest begins.

You'll primarily use the `run` method to kick off a backtest, providing the symbol you want to test and some context information like the strategy, exchange, and data frame names. The `run` method returns a sequence of backtest results over time.
