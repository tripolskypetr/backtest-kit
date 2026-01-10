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

The Walker Validation Service helps you keep track of and make sure your parameter sweep configurations, often called "walkers," are set up correctly. Think of walkers as the blueprints for testing different parameter combinations in your trading strategies.

This service acts as a central place to register your walkers, ensuring they exist before you try to use them in your backtesting process. It's designed to be efficient; it remembers previous validation checks, so it doesn’t have to repeat those checks every time. 

You can add new walkers using `addWalker`, check if a walker exists with `validate`, and get a complete list of registered walkers with `list`. It helps streamline your workflow and prevents errors caused by misconfigured walkers.

## Class WalkerUtils

WalkerUtils provides a set of helpful tools for working with walkers, which are essentially automated trading strategies. Think of it as a shortcut to running and managing those strategies, making the process simpler and more organized.

It’s designed to be easily accessible – you don’t need to create new instances of it each time; there's a single, readily available copy.

You can use `run` to kick off a walker comparison for a specific trading symbol, automatically handling the details of the process and keeping track of what's happening with logging. If you just want a background process that doesn't give you results directly (like for logging or triggering other actions), `background` is your choice.

Need to pause a walker’s signal generation? `stop` does that safely, stopping new signals while letting existing ones finish naturally.

Retrieving and reporting results is also straightforward. `getData` gathers the comparison data, and `getReport` creates a user-friendly markdown report summarizing the strategy comparisons.  `dump` takes that report and saves it to a file.

Finally, `list` lets you see what walkers are currently active and their status, helping you keep an eye on everything.

## Class WalkerSchemaService

This service helps keep track of different walker schemas, ensuring they’re all structured correctly. It acts like a central directory for these schemas, allowing you to register new ones and easily find existing ones by their name.

The service uses a special type-safe storage system to keep things organized. When adding a new schema, it performs a quick check to make sure it has all the necessary parts. You can also update existing schemas with just the changes you need. Retrieving a schema is as simple as providing its name.

## Class WalkerMarkdownService

The WalkerMarkdownService helps you create and save detailed reports about your trading strategies as they're being backtested. It listens for updates during the backtesting process (called "ticks") and organizes the results for each strategy in a separate storage area.

You can then request these organized results to generate beautifully formatted markdown tables that clearly compare the performance of different strategies. These reports are saved directly to your disk, making it easy to review and analyze your backtesting runs.

The service automatically handles setting up the storage and subscriptions, so you don't have to worry about the underlying details. You can also clear the accumulated data when you're finished, either for a specific backtest or all of them at once. Finally, you can easily get the report data or save it to disk without needing to manage the complex report generation process.

## Class WalkerLogicPublicService

This service helps manage and run automated trading strategies, often called "walkers." It builds upon a private service to automatically pass along important details like the strategy's name, the exchange it's using, and the testing environment.

Think of it as a coordinator that sets the stage for your strategies to run smoothly, making sure they all have the information they need.

The `run` method is the main way to start these strategies. You tell it which asset (symbol) to focus on and some basic information about the test setup, and it takes care of launching the strategies and providing the results. It essentially orchestrates the execution of multiple backtests, automating a lot of the setup process.

## Class WalkerLogicPrivateService

This service handles the process of comparing different trading strategies, like a coordinator for a competition. It takes a specific asset, a list of strategies to test, a metric to evaluate them by (like total profit), and some contextual information about the test environment.

As each strategy runs, you'll receive progress updates, allowing you to monitor how things are going. It keeps an eye on the best-performing strategy in real-time.

Finally, it delivers a complete report, ranking all the strategies based on their performance. Internally, it relies on other services to actually run the backtests for each strategy.

## Class WalkerCommandService

WalkerCommandService acts as a central hub for interacting with the walker functionality within the backtest-kit framework. Think of it as a simplified and injectable gateway to the core walker logic. 

It gathers several validation and schema services to ensure the walker, strategies, exchanges, and frames are all correctly configured. This service streamlines the process of running walker comparisons, allowing you to execute tests for specific symbols while providing context – such as the names of the walker, exchange, and frame being used. The `run` method is your primary tool for initiating these comparisons, feeding it a symbol and context information.

## Class StrategyValidationService

This service helps keep track of your trading strategies and makes sure they're set up correctly. Think of it as a central place to register and check your strategies before you start trading.

It allows you to add new strategies, validate that they exist and that any associated risk profiles are valid, and list all the strategies you've registered. To speed things up, it remembers the results of validation checks so you don't have to repeat them unnecessarily.

You can use `addStrategy` to register a new strategy. `validate` is used to double-check a strategy and its risk profile. Finally, `list` lets you see all the strategies currently managed.

## Class StrategySchemaService

The StrategySchemaService helps keep track of your trading strategies and their blueprints. Think of it as a central place where you store and manage the definitions of your strategies. 

It uses a special system to ensure the strategy definitions are well-formed and consistent. 

You can add new strategies using `addStrategy()`, fetch existing ones by name with `get()`, and even update existing strategies using `override()`. Before a strategy is added, `validateShallow()` checks to make sure it has all the essential pieces in place.

## Class StrategyCoreService

This service acts as a central hub for managing strategies within the backtesting framework. It's responsible for orchestrating strategy operations and injecting necessary information like the trading symbol, timestamp, and backtest mode into the process. Think of it as a layer that sits between your strategy logic and the underlying execution environment.

It has several key functions:

*   **Validation:** It ensures a strategy and its associated risk configuration are valid before allowing it to run. It intelligently caches these validations to avoid unnecessary checks.
*   **Signal Retrieval:** It provides ways to retrieve pending and scheduled signals for a symbol, useful for monitoring and time-based actions.
*   **Status Checks:** You can quickly check if a strategy is currently stopped.
*   **Execution:** It provides core methods like `tick` for performing a single step in the strategy, `backtest` for running a quick test against historical data, and `stop` to halt the generation of new signals.
*   **Signal Management:** It allows you to cancel scheduled signals and clear cached strategy data to force reinitialization.
*   **Position Management:** Functions like `partialProfit`, `partialLoss`, and `trailingStop` offer fine-grained control over pending positions, enabling actions like partial closes and stop-loss adjustments.
*   **Breakeven Management:** It can move the stop-loss to breakeven when a specific price level is reached.

Essentially, `StrategyCoreService` simplifies interaction with strategies by handling common setup, validation, and execution tasks while providing a consistent interface.

## Class StrategyConnectionService

The `StrategyConnectionService` acts as a central hub for managing and executing trading strategies within the backtest-kit framework. It intelligently routes requests to the correct strategy implementation based on the symbol and strategy name being used. To optimize performance, it cleverly caches these strategy instances, avoiding redundant creation.

Think of it as a dispatcher ensuring each strategy gets its instructions and resources in an organized way. Before any operations, the service makes sure the strategy is properly initialized.

Here’s a breakdown of its key capabilities:

*   **Strategy Routing:** It automatically directs calls to the right strategy based on symbol and name.
*   **Caching:** It stores frequently used strategies for faster access.
*   **Live and Backtesting Support:**  It handles both real-time (`tick`) and historical data (`backtest`) scenarios.

The service relies on several other components for its functionality, including services for logging, execution context, strategy schema, risk, exchange, and partial/breakeven connections.

Specifically, you can use it to:

*   **Retrieve signals:** Access pending and scheduled signals for a given strategy.
*   **Check strategy state:** Determine if a strategy is stopped.
*   **Run ticks:** Execute live trading actions.
*   **Perform backtests:** Evaluate strategies against historical data.
*   **Control strategies:** Stop, clear, or cancel scheduled operations.
*   **Manage partial profits/losses:** Execute partial trades.
*   **Adjust trailing stops:** Fine-tune stop-loss parameters.
*   **Set breakeven points:** Manage breaking even strategies.

## Class SizingValidationService

This service helps you keep track of and make sure your position sizing rules are set up correctly within backtest-kit. Think of it as a central place to register your different sizing strategies, like fixed percentage, Kelly criterion, or ATR-based approaches. 

Before you use a sizing strategy, you can use this service to double-check that it's been registered. It also remembers its checks to make things faster. You can easily add new sizing strategies, confirm that existing ones are ready, and get a complete list of all the sizing options you’ve registered. This simplifies managing your sizing configurations and helps prevent errors during backtesting.

## Class SizingSchemaService

This service helps you keep track of different sizing strategies for your trading backtests. It uses a special registry to store these strategies in a way that catches errors early on.

You can think of it as a central place to define how much of an asset to trade in different situations.

Adding a new sizing strategy is done through the `register` method, and you can update an existing one using `override`.  If you need to use a sizing strategy, the `get` method retrieves it by its assigned name.

Before adding a sizing strategy, a quick check (`validateShallow`) makes sure it has the necessary building blocks, ensuring everything is set up correctly.

## Class SizingGlobalService

This service handles the calculations needed to determine how much of an asset to trade, considering factors like risk tolerance and account size. It acts as a central point for sizing operations within the backtesting framework. 

Think of it as the engine that translates your strategy’s signals into actual trade sizes. It relies on other services to validate the sizing request and connect to the necessary data sources. 

The core function, `calculate`, takes parameters defining the sizing request, like the amount of risk you're willing to take, and returns the calculated position size. This service is crucial for both the internal workings of the backtest and for when you, as a user, interact with the sizing aspects of the framework.


## Class SizingConnectionService

This service helps connect your trading strategies to the right sizing methods, ensuring your positions are calculated correctly based on your risk management rules. Think of it as a traffic director for sizing calculations.

It uses names to identify the specific sizing method you want to use, like "fixed-percentage" or "kelly-criterion." It's also smart – it remembers which sizing methods it's already set up, so it doesn't have to recreate them every time, which makes things faster.

When you need to calculate a position size, you provide some parameters and tell it which sizing method you want to use. The service then handles the rest, taking into account your risk settings and the chosen sizing approach. If you aren't using any sizing configuration, just leave the sizing name blank.

## Class ScheduleUtils

The ScheduleUtils class is designed to help you monitor and understand how your scheduled signals are performing. It acts as a central place to track things like signals waiting to be processed, any that have been cancelled, and how long they're typically waiting.  Think of it as a helper for getting insights into the efficiency of your scheduling system.

You can use it to get detailed statistics about a specific strategy and symbol, or to generate a formatted report in Markdown.  The report can even be saved directly to a file. This utility is provided as a single, readily accessible instance to simplify its use within your backtest kit framework.

## Class ScheduleMarkdownService

The ScheduleMarkdownService helps you keep track of your scheduled trading signals and create useful reports. It listens for when signals are scheduled or cancelled, carefully collecting this information for each strategy you're using. Then, it transforms this data into nicely formatted Markdown tables, providing insights like cancellation rates and average wait times.

The service automatically saves these reports as Markdown files in your logs directory, making it easy to review your signal scheduling performance. It uses a clever storage system, so each combination of symbol, strategy, exchange, timeframe, and backtest has its own dedicated data space.

To get started, the service automatically initializes itself when you first use it, subscribing to the necessary signal events. You can also clear the collected data if needed, either for a specific strategy or globally. The `unsubscribe` function allows you to stop listening to events if required.

## Class RiskValidationService

The RiskValidationService helps you keep track of and confirm your risk management setups. It acts as a central place to register different risk profiles – think of them as pre-defined rules for managing risk – and makes sure those profiles actually exist before you try to use them. To make things faster, it remembers whether a profile exists or not, so it doesn't have to check every single time. 

You can add new risk profiles using `addRisk`, double-check that a profile exists using `validate`, and get a full list of all registered profiles with `list`. It's like having a librarian for your risk rules, ensuring everything is organized and ready to go. The service relies on a logger for tracking and internal storage (`_riskMap`) for managing risk profile information.

## Class RiskUtils

RiskUtils is a helpful tool for understanding and analyzing risk rejection events within your backtesting system. It acts as a central point to collect and present information about when your strategies triggered risk controls. 

Essentially, it gathers data from risk rejection events, providing you with key statistics and detailed reports. You can retrieve aggregated data like total rejections, broken down by symbol and strategy, or generate a comprehensive markdown report outlining each rejection event, including details like the position, price, and reason for rejection.

The tool can even automatically save these reports as markdown files, making it easier to review and share insights regarding your strategy's risk profile.  Think of it as a way to systematically monitor and improve the risk management aspects of your trading strategies. The data is tracked and organized through a system that stores up to 250 rejection events for each combination of symbol and strategy.

## Class RiskSchemaService

This service helps you keep track of your risk schemas in a safe and organized way. Think of it as a central place to store and manage the rules and configurations that define your risk profiles. 

It uses a special system to ensure everything is typed correctly, preventing errors. You can add new risk profiles using `addRisk()` and find them again later by their name with the `get()` method. 

The `validateShallow` function acts as a quick check to make sure new risk profiles have the essential pieces in place before they’re added. If you need to update an existing risk profile, the `override` function lets you make partial changes.  The service also keeps a log of activity through its `loggerService`.

## Class RiskMarkdownService

This service is designed to help you understand and document why your trading strategies are being rejected due to risk rules. It listens for risk rejection events and organizes them, creating easy-to-read markdown reports.

Think of it as a way to automatically generate a log of every time a trade was blocked by your risk management system. These reports break down the rejections by symbol and strategy, giving you a clear picture of where your strategies are running into issues.

The service gathers all the rejection details and summarizes them into statistics and tables.  It then saves these reports to your disk in a standard format, making it simple to track and review.  You can clear the accumulated data when it's no longer needed or focus on specific symbol/strategy combinations. The service automatically sets itself up when first used, and provides a way to clean up any subscribers when done.

## Class RiskGlobalService

This service handles risk management globally within the backtest-kit framework. It essentially acts as a gatekeeper, ensuring that trading signals adhere to predefined risk limits before they’re executed. 

It works closely with a risk connection service to perform these validations. To prevent unnecessary checks, the validation process is cached, so similar requests aren’t repeatedly processed.

You can use this service to check if a trading signal is permissible, register when a signal is opened, or remove it when it's closed.  There’s also a way to clear all stored risk data, or just data associated with a specific risk configuration. This is crucial for managing and resetting risk parameters during backtesting or live trading.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks within the trading system. It intelligently directs risk-related operations to the correct specialized risk handler based on a designated risk name. 

To boost performance, it keeps a record of these risk handlers, so it doesn’t have to recreate them every time they’re needed. It’s particularly useful when you need to ensure trades comply with pre-defined risk limits.

The service offers methods for validating signals (allowing or rejecting trades), registering open trades, and removing closed trades, all while accurately directing requests to the right risk handler. You can even clear the cached risk handlers when you need to refresh them. Strategies that don’t have custom risk configurations will use an empty string as the risk name.

## Class PositionSizeUtils

This class offers helpful tools for figuring out how much of an asset to trade, also known as position sizing. It provides pre-built calculations for a few common strategies, so you don’t have to write them yourself.

You'll find methods for determining size using a fixed percentage of your account, the Kelly Criterion (a more complex, growth-focused approach), and a technique based on Average True Range (ATR), which considers volatility.

Each method includes built-in checks to make sure the data you provide is compatible with the chosen sizing method, which helps prevent errors. Essentially, it simplifies the process of calculating appropriate position sizes for your trades.

## Class PersistSignalUtils

The PersistSignalUtils class helps manage how signal data is saved and retrieved, particularly for trading strategies. It automatically handles storing and loading signal information for each strategy, making sure data is kept safe even if there are interruptions. 

You can customize how this data is stored by plugging in your own adapter. The class ensures operations like reading and writing are done reliably and in a way that protects against data loss if the system crashes. 

Client strategies rely on this class to load their initial signal states and to save any changes made during operation.  It provides functions to read existing signals or write new ones, designed for safety and consistency.

## Class PersistScheduleUtils

This class, PersistScheduleUtils, helps manage how scheduled signals are saved and loaded, particularly for trading strategies. It's designed to make sure these signals are reliably stored, even if something unexpected happens.

It automatically handles storage for each strategy, and you can even customize how the storage works by plugging in your own adapter. This utility ensures that when a strategy restarts, it can pick up right where it left off with its scheduled signals.

The `readScheduleData` function retrieves previously saved signal data, and `writeScheduleData` saves the current signal data, making sure the process is done safely and reliably. Finally, `usePersistScheduleAdapter` lets you swap in alternative ways to store this information, giving you control over the persistence method.

## Class PersistRiskUtils

This class, PersistRiskUtils, helps manage and save your active trading positions, especially when dealing with different risk profiles. It's designed to ensure your data is reliably stored and retrieved, even if something unexpected happens.

The system automatically handles storing the position data, keeping track of different risk profiles and allowing for custom adapters if you need more specialized storage solutions.  Importantly, it makes sure that when saving or reading positions, the process is done safely and consistently.

You can think of it as a safety net for your trading strategy, guaranteeing that your current position status is preserved and ready to be restored. It uses a special technique called atomic writes when saving, meaning it's super resistant to data corruption even during crashes. The `readPositionData` function retrieves this saved information, while `writePositionData` saves the latest changes, ensuring your system always starts from a known, consistent point. You also have the option to plug in your own way of storing this data by using the `usePersistRiskAdapter` method to customize the storage mechanism.

## Class PersistPartialUtils

This class provides tools for safely saving and retrieving partial profit/loss information for your trading strategies. It’s designed to be reliable, even if your application crashes unexpectedly. 

Essentially, it remembers where your strategy stood at a certain point, allowing it to pick up right where it left off. 

The system keeps track of this information separately for each symbol and strategy name, and you can even customize how this data is stored using adapters. You can retrieve existing partial data or save updated data, and the process is handled securely to prevent data corruption. When initializing a trading strategy, this class helps load any previously saved state.

## Class PersistBreakevenUtils

This utility class helps manage and save the breakeven state of your trading strategies. It ensures that your breakeven data persists between sessions, so you don't lose progress. 

Think of it as a system for remembering what your strategies have already achieved. It stores this information in files, creating a structure like `data/breakeven/BTCUSDT_my-strategy/state.json` for each strategy.

It’s designed to be efficient; it creates only one storage instance for each combination of symbol, strategy name, and exchange. When you need to read or save the breakeven data, it handles those operations reliably, even protecting against data corruption with atomic writes. You can even customize how the data is saved and loaded using a custom adapter if needed.

## Class PerformanceMarkdownService

This service helps you understand how your trading strategies are performing by collecting and analyzing various performance metrics. It listens for events that track performance data, organizes these metrics by strategy, and then calculates things like average performance, minimum and maximum values, and percentiles. 

You can request aggregated performance statistics for specific symbol and strategy combinations. The service also creates readable markdown reports that can pinpoint potential bottlenecks in your strategy’s execution, and saves those reports to your logs directory for easy review.

To help with this process, it manages its own internal storage for performance data, ensuring each strategy and data combination is kept separate. There's also a way to clear this data when you need to start fresh. Finally, the service initializes itself by subscribing to performance events, and provides a method to unsubscribe when you're done.

## Class Performance

The Performance class helps you understand how your trading strategies are doing. It lets you gather performance statistics for specific symbols and strategies, giving you a breakdown of things like how long different operations take. You can also generate detailed reports in markdown format, which are helpful for identifying bottlenecks and understanding where your strategy might be slow. 

Finally, this class simplifies saving those reports to your hard drive, so you can easily track performance over time and share insights. It organizes performance data by strategy, exchange, and timeframe, making it easy to compare different setups.

## Class PartialUtils

PartialUtils is a handy tool for analyzing your partial profit and loss data, especially when backtesting strategies. It acts as a central hub for gathering and presenting information about those smaller, incremental gains and losses. Think of it as a way to examine the details behind your larger trading performance.

It collects data from events related to partial profits and losses, storing up to 250 events for each symbol and strategy combination. This information includes things like the time of the event, the action taken (profit or loss), the trading symbol, the strategy used, and the price at the time.

You can use PartialUtils to retrieve summary statistics like total profit/loss event counts. It can also generate nicely formatted markdown reports showing a table of these events, including details like signal IDs, position sizes, and price levels.  Finally, it offers an easy way to export these reports to files, automatically creating the necessary directory structure and naming the file based on the symbol and strategy used.

## Class PartialMarkdownService

This service helps you keep track of and report on partial profits and losses during your trading backtests. It listens for events related to profits and losses and organizes them by the symbol being traded and the strategy used. The service then compiles this information into nicely formatted markdown reports, allowing you to easily review and analyze your performance.

You can request overall statistics, generate detailed reports in markdown format, or save these reports directly to disk.  It also provides a way to clear the accumulated data when you no longer need it – you can clear everything or just data for specific trading setups.  The service automatically initializes when you first use it, subscribing to the relevant event streams. When you're finished, you can unsubscribe to free up resources. It uses a system of storage to keep data isolated for different trading combinations, ensuring your reports are accurate and well-organized.

## Class PartialGlobalService

This service acts as a central hub for managing partial profit and loss tracking within the trading system. It's designed to be injected into your trading strategies, providing a single point of access for these operations. Think of it as a coordinator – it logs information about profit and loss events at a global level and then passes those events along to another service that handles the actual tracking.

It simplifies things by providing a consistent way to log and manage these events, making it easier to monitor and debug your trading strategies. This component relies on other services for logging, managing connections, and validating strategies and risk, all injected from the system's dependency injection container. 

The `validate` function helps ensure your strategies and their associated risk configurations are set up correctly and avoids unnecessary checks.  The `profit`, `loss`, and `clear` functions are the primary ways you'll interact with this service – they handle tracking and resetting partial profit/loss states based on market data and signal events, always with that global logging layer in place.

## Class PartialConnectionService

The PartialConnectionService manages how your trading strategy tracks profits and losses for individual signals. It's designed to keep things efficient by remembering (memoizing) those profit/loss tracking objects, so you don’t have to create them repeatedly. 

Think of it as a factory that creates and manages "ClientPartial" objects, each responsible for tracking a single signal's performance. These objects are configured with logging and event handling capabilities.

When your strategy experiences a profit or loss, the service handles the work by retrieving or creating the appropriate ClientPartial and delegating the calculation and reporting.  When a signal is closed, the service cleans up the tracked information, preventing unnecessary memory usage. It works in conjunction with other components like ClientStrategy to provide a complete picture of your backtest or live trading results.

## Class OutlineMarkdownService

The OutlineMarkdownService helps create documentation from the results of AI-powered strategies, particularly useful for debugging and understanding how the AI arrived at its decisions. It takes information like system prompts, user inputs, and the AI's final output, and organizes it into readable markdown files. 

These files are stored in a specific directory structure under a "dump/strategy" folder, with each signal having its own subfolder. The service ensures that the files don't overwrite any previous documentation, avoiding data loss. 

Essentially, it’s a tool for automatically generating a record of the AI's reasoning process, making it easier to review and improve strategies. The process involves dumping signal data and conversation history to markdown files.

## Class OptimizerValidationService

This service helps keep track of your optimizers, making sure they're properly registered and available for use within your backtesting system. It acts like a central directory, storing information about each optimizer you're using. 

You can add optimizers to this directory, and it makes sure you don't accidentally register the same optimizer twice.  It also has a handy feature that remembers previous validation checks, making things faster if you need to validate the same optimizer repeatedly. 

If you need a list of all the optimizers currently registered, it can provide that for you. Think of it as the quality control and organizational hub for your optimizer setup.

## Class OptimizerUtils

This section provides helpful tools for working with your trading strategies, especially when you're using an optimizer. Think of it as a set of utilities to manage and export your optimized strategies. 

You can retrieve data related to your strategies using `getData`, which pulls information from various sources and prepares it for use.  `getCode` allows you to create the complete, runnable code for your strategy, combining all the necessary components. Finally, `dump` provides a simple way to save that generated code to a file, automatically organizing it with a clear naming convention and creating any needed directories. It's a great way to package up your optimized strategies for deployment.


## Class OptimizerTemplateService

This service acts as a blueprint for creating code snippets used in backtesting and optimization. It's designed to leverage a large language model (LLM) – specifically Ollama – to generate these snippets, making the process more automated and flexible.

It handles several key components of a trading strategy:

*   **Exchange Configuration:**  It creates the code needed to connect to and interact with cryptocurrency exchanges like Binance, using the CCXT library.
*   **Timeframe Setup:** It can generate code for analyzing data across multiple timeframes (from 1-minute to hourly).
*   **Strategy Generation:** It constructs the core strategy code itself, using the LLM to translate high-level ideas into functional trading rules. This includes generating structured trading signals with details like entry price, take profit, stop loss, and expected duration.
*   **Walker Creation:** It allows for comparing different trading strategies against each other, using a 'walker' approach to automate the testing process.
*   **Debugging:** It includes built-in tools for debugging, such as saving conversations with the LLM and results to a designated folder.

You can customize certain aspects of this service through configuration, but it provides a robust default setup that simplifies the code generation process. It’s particularly helpful for users who want to integrate LLMs into their backtesting workflows.

## Class OptimizerSchemaService

This service helps keep track of different optimizer configurations, ensuring they're set up correctly and consistently. Think of it as a central place to define and manage how your backtesting experiments are optimized.

It uses a registry to store these configurations, preventing accidental changes. When you add a new optimizer setup, this service validates that it has all the necessary information like the optimizer's name and data sources. 

You can also update existing configurations by partially changing their settings, and easily retrieve a specific optimizer configuration by its name. Basically, it makes sure your optimization processes are well-defined and accessible.

## Class OptimizerGlobalService

OptimizerGlobalService acts as a central hub for working with optimizers, making sure everything is set up correctly before any actions are taken. It’s designed to be the main way you interact with optimizers, handling tasks like logging what you’re doing and confirming that the optimizer you're requesting actually exists. 

Think of it as a gatekeeper—you ask it for data, code, or to save a strategy, and it makes sure everything’s valid before passing the request on to the parts that actually do the work. 

Here’s what it allows you to do:

*   **Fetch Data:** It can pull together data from different sources and create metadata about your trading strategies.
*   **Generate Code:** It constructs the complete code for your trading strategies, ready to be executed.
*   **Save Strategies:**  It can create files containing your strategy code and save them to your desired location.

It relies on other services, like OptimizerConnectionService and OptimizerValidationService, to handle the underlying details.

## Class OptimizerConnectionService

This service helps you easily work with optimizers, making sure you don't create the same optimizer multiple times. It keeps a cache of optimizer instances, speeding things up considerably. 

It allows you to combine your own custom settings with default settings for optimizers, giving you flexibility.  You can also inject a logger to track what's happening. 

The `getOptimizer` method is central to this - it finds or creates an optimizer for you, remembering previous ones to avoid repeating work. 

Beyond just creating optimizers, it provides ways to fetch data related to them and even generate the complete code needed to run the strategies. Finally, there’s a convenient `dump` function for saving the generated code directly to a file.


## Class NotificationUtils

This utility class, `NotificationUtils`, makes it easy to manage and view notifications within the system. It handles some of the behind-the-scenes setup for you, ensuring everything's ready before you access notification data.

You can use `getData` to retrieve a list of all notifications, sorted with the newest ones appearing first.

Need to start fresh?  The `clear` method will wipe out the entire notification history. 

Essentially, it's a convenient way to interact with notifications without needing to worry about the technical details.

## Class LoggerService

The LoggerService helps standardize how logging happens across the backtest-kit framework. It provides a simple way to record messages at different levels (debug, info, warn) while automatically adding important details like which strategy, exchange, and frame are being used, as well as the symbol and time of execution. You can use the default logging, or easily plug in your own logging solution by setting a custom logger. The service manages this context information, making sure all your log messages have the information needed to understand what's happening. If you don't configure a custom logger, it will fall back to a "no-op" logger that does nothing.

## Class LiveUtils

LiveUtils provides tools for running and managing live trading sessions within the backtest-kit framework. It acts as a central hub, simplifying interactions with the underlying live trading engine and ensuring operations are logged and recoverable. Think of it as a helper class that makes live trading more reliable and manageable.

The `run` function is the primary method, offering an infinite, self-healing stream of trading results. It allows for continuous trading even if the process crashes, as state is persisted to disk.  There's also a `background` mode that lets you run live trading silently, useful for tasks like data persistence or callbacks without directly processing results.

You can check on the status of your trading with functions like `getPendingSignal` and `getScheduledSignal`, which retrieve details on active signals. To pause trading, use `stop`; to cancel a specific signal without halting the entire process, use `cancel`.

The class also includes functions for managing positions, such as `partialProfit` and `partialLoss`, allowing for partial exits at predefined levels.  You can adjust your trailing stop-loss with `trailingStop` or move it to breakeven with `breakeven`.

For monitoring and reporting, `getData` provides statistical information, `getReport` generates formatted reports, and `dump` saves those reports to disk. Finally, `list` allows you to see the status of all currently active live trading sessions. Each trading setup (symbol-strategy combination) runs in its own, isolated instance for better organization and management.

## Class LiveMarkdownService

The LiveMarkdownService helps you automatically create reports detailing your live trading activity. It keeps track of every event – from idle periods to opening, active, and closed trades – for each strategy you're using. These events are then compiled into nicely formatted markdown tables, along with useful statistics like win rate and average profit/loss.

The service saves these reports directly to your logs folder, making it easy to review your performance. It handles the technical details of storing and organizing the data, so you can focus on analyzing your trades. 

You don't need to explicitly initialize it; it starts working automatically when you begin trading. You can also clear the stored data if you need to, and there's a way to unsubscribe from the signal events when you're finished. Think of it as an automated record-keeping system for your live trading. It organizes and presents your trading history in a readable format.

## Class LiveLogicPublicService

LiveLogicPublicService is designed to make live trading easier by handling a lot of the behind-the-scenes details. It acts as a friendly interface to the core trading logic, automatically managing things like which strategy and exchange you're using.

Think of it as a constantly running process – it never stops – that generates trading signals (both buy and sell signals) as they happen.  If something goes wrong and the process crashes, it can automatically recover and pick up where it left off.

The `run` function is the key to starting the live trading process for a specific asset. It streams the signals you need, and importantly, it handles the context – the information about the strategy and exchange – so you don't have to pass it around manually. It’s all handled for you! This service relies on a logger and a private service for its operations.

## Class LiveLogicPrivateService

This service handles the ongoing process of live trading, keeping everything running smoothly and continuously monitoring market conditions. It operates in a continuous loop, checking for new signals and providing updates on trades that are opened or closed – you won't see updates for trades that are simply active.  The system is designed to be resilient; if something goes wrong, it can recover and pick up where it left off, ensuring uninterrupted trading.  It efficiently streams results to you, providing a constant flow of information without consuming excessive memory. Essentially, it’s an endless generator that keeps your live trading operation running and informs you about significant events. 

The service relies on several core components like a logger, the core strategy logic, and a method context service to function. The `run` method starts this continuous process, allowing you to specify the trading symbol you want to monitor.

## Class LiveCommandService

The LiveCommandService acts as a central point for interacting with live trading features within the backtest-kit framework. Think of it as a helper that makes it easier to inject dependencies when building your applications.

It provides a straightforward way to start live trading, allowing you to specify the trading symbol and some contextual information, such as the strategy and exchange names being used.

Under the hood, it’s continuously running an asynchronous process that generates trading results – opening and closing signals – while automatically handling potential errors and keeping things stable.

Several supporting services, like those for logging, validation of strategies and exchanges, and managing strategy schemas, are also managed and accessible through this service.

## Class HeatUtils

The `HeatUtils` class is designed to make it easy to generate and manage portfolio heatmaps within your backtesting or trading system. It handles the complex data gathering and reporting, acting as a simplified interface to the underlying heatmap service. Think of it as a central place to collect performance data across all the symbols your strategy uses.

You can use `getData` to retrieve all the aggregated statistics for a particular strategy, including details for each symbol and overall portfolio metrics.  `getReport` then turns that data into a nicely formatted markdown table showing key performance indicators like total profit, Sharpe Ratio, and maximum drawdown – automatically sorted to highlight your best-performing symbols. Finally, `dump` lets you save these reports directly to a file on your disk, creating the necessary directories if they don't already exist, so you can easily share or archive your results. Because it’s a singleton, you only need one instance of `HeatUtils` to use these features throughout your system.

## Class HeatMarkdownService

The Heatmap Service is designed to give you a clear view of how your trading strategies are performing across different exchanges and timeframes. It listens for signals and automatically calculates key metrics like profit/loss, Sharpe Ratio, and maximum drawdown, both for individual symbols and for your entire portfolio. You can then generate a nicely formatted Markdown report to easily analyze and share these results.

The service keeps track of data separately for each exchange, timeframe, and backtest mode, so you can compare performance across different setups. It's designed to handle potential errors gracefully and efficiently, ensuring reliable calculations even with unusual data. When you first use the service, it automatically starts listening for signals; however, you can manually unsubscribe when needed. Finally, you can clear the accumulated data if you want to start fresh.

## Class FrameValidationService

This service helps you keep track of your trading timeframes and makes sure they're set up correctly. It acts like a central manager for your frames, allowing you to register new ones, check if they exist before you use them, and easily see a list of all the frames you've defined. To improve performance, it remembers whether a frame is valid so it doesn’t have to repeatedly check. You can add frames using `addFrame`, confirm their validity with `validate`, and get a full list of your registered frames with `list`.

## Class FrameSchemaService

The FrameSchemaService helps keep track of different trading strategies (frames) and their definitions. It's like a central catalog where you store the blueprints for your strategies, ensuring they all follow a consistent format.

It uses a special system to manage these blueprints safely and prevent errors. You can add new strategy blueprints using `register`, update existing ones with `override`, or simply look up a blueprint using `get`.

Before a new strategy blueprint is added, the service performs a quick check to make sure it has all the necessary parts. This helps catch potential problems early on. Think of it as a quality control step for your trading strategies.

## Class FrameCoreService

The FrameCoreService acts as a central hub for managing and retrieving timeframes within the backtesting environment. It's a core component, working behind the scenes to ensure the backtest logic has the correct time periods to work with.  It relies on a connection service to fetch the timeframe data and a validation service to make sure it's accurate.

The key function it provides is `getTimeframe`, which, when given a specific asset (like a stock ticker) and a timeframe name (like "daily" or "hourly"), produces an array of dates representing the time window for a backtest run. This service is crucial for setting up each backtesting iteration.


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different "frames" of data used in trading backtests. Think of frames as specific slices of historical market data, each defined by a start date, end date, and interval (like 1-minute, 1-hour, or daily).

It intelligently routes requests for frame data to the correct implementation, automatically figuring out which frame to use based on the current context. To make things efficient, it remembers (caches) the frames it's already created, so it doesn't have to recreate them every time you need them.

This service handles the complexities of backtest timeframe management, ensuring your tests are run within the specified date ranges. When in live mode, it operates without any frame constraints, meaning it doesn't focus on historical data.

The `getFrame` function is your primary way to retrieve these frames; it creates them if they don't exist and reuses them if they do. The `getTimeframe` function helps you define the specific date boundaries for your backtest by fetching the start and end dates associated with a particular frame.

## Class ExchangeValidationService

This service acts as a central place to keep track of your trading exchanges and make sure they’re properly set up. Think of it as a gatekeeper – it ensures that before your backtesting or trading operations try to connect to an exchange, that exchange is actually registered and valid. Adding an exchange involves providing its name and a description of its structure.

You can check if an exchange is valid using the validation function, which is quick because it uses caching to remember previous checks. It's also possible to see a complete list of all exchanges that have been registered. The service keeps a record of all exchanges in a map.

## Class ExchangeUtils

The ExchangeUtils class offers helpful tools for working with different cryptocurrency exchanges. It acts as a central, readily available resource for common exchange-related tasks.

It manages a system to ensure each exchange has its own dedicated setup, preventing conflicts.

You can easily retrieve historical candle data using `getCandles`, which automatically figures out the correct date range. `getAveragePrice` calculates the VWAP, giving you a sense of the average price over a period.

Need to ensure your order quantities and prices are formatted correctly for a specific exchange?  `formatQuantity` and `formatPrice` handle that for you, ensuring compatibility and avoiding errors.

## Class ExchangeSchemaService

This service acts as a central place to keep track of information about different cryptocurrency exchanges. It ensures that the details for each exchange – things like what trading pairs are available and how orders are formatted – are consistent and accurate. 

It uses a special system to store this information in a type-safe way, making it less prone to errors. You can add new exchange details using `addExchange()`, and get the details for a specific exchange by its name. 

Before an exchange’s information is saved, the service does a quick check to make sure it has all the necessary pieces.  If an exchange’s information already exists, you can update parts of it with the `override()` method.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for all exchange-related tasks within the backtesting framework. It's designed to handle fetching historical data, calculating averages, and formatting prices and quantities, all while ensuring the right context (like the trading symbol and time) is applied to each operation. This service wraps other services to automatically provide the necessary information, making it easier to work with exchange data.

It provides functions to retrieve historical candles, simulate future candles (specifically for backtesting purposes), calculate average prices, and correctly format price and quantity values for display or processing. The validation feature ensures your exchange configurations are correct, and it remembers previous validations to avoid unnecessary repetition. This core service is essential for running backtests and managing live trading logic.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently routes your requests – like fetching candles or getting average prices – to the correct exchange based on the current context. To speed things up, it remembers which exchange instances it's already created, so it doesn't have to create new ones every time.

It handles all the necessary communication with the exchange and ensures that prices and quantities are formatted correctly to match the specific rules of the exchange you're using. This service is vital for both backtesting historical data and for live trading, providing a consistent interface regardless of the underlying exchange.

Here's a breakdown of what it offers:

*   **Automatic Exchange Selection:** It figures out which exchange to use without you needing to specify it directly.
*   **Performance Boost:** It avoids repeatedly creating connections to exchanges.
*   **Complete Exchange Functionality:** Provides a full set of actions you can perform on an exchange.
*   **Price and Quantity Formatting:**  Ensures trades are structured correctly for each exchange.



The service relies on other components like a logger, execution context, schema service, and method context service to function. The `getExchange` method is the core function, retrieving the appropriate exchange instance. `getCandles` and `getNextCandles` retrieve historical and subsequent price data respectively, while `getAveragePrice` provides the current average price. `formatPrice` and `formatQuantity` guarantee that the data conforms to the exchange's formatting requirements.

## Class ConstantUtils

The ConstantUtils class provides a set of predefined percentages used for calculating take-profit and stop-loss levels. These values are based on the Kelly Criterion and a system of exponential risk decay, designed to optimize trading outcomes.

Think of them as predefined checkpoints on your profit and loss journey. For example, TP_LEVEL1 represents the point where you'd lock in a small portion of your potential profit, while SL_LEVEL1 acts as an early warning sign that the trade might be turning against you. Each level guides your exit strategy, aiming to capture profits while limiting potential losses, with a focus on gradually reducing exposure as the trade progresses. Each property (TP_LEVEL1, TP_LEVEL2, TP_LEVEL3, SL_LEVEL1, SL_LEVEL2) defines a percentage of the total distance to your target take-profit or stop-loss.

## Class ConfigValidationService

The ConfigValidationService acts as a safety net for your backtesting configurations. It meticulously checks your settings, like slippage, fees, and profit margins, to make sure they’re mathematically sound and won’t lead to unprofitable trades.

It makes sure that your take profit distance is large enough to cover all the costs involved in a trade, including slippage and fees. You'll also find it validates that ranges make sense – like ensuring a stop loss distance is less than a take profit distance – and that timers and retry counts are sensible positive numbers. 

Essentially, this service helps prevent common errors and ensures your configurations are set up for success. The `validate` function performs these checks, and the `loggerService` helps you understand any problems it finds.

## Class ColumnValidationService

This service helps ensure your column configurations are set up correctly, preventing errors down the line. It acts as a safety net, checking that all your column definitions are complete and consistent with the expected structure.

It verifies a few critical things:

*   Every column has the necessary properties: `key`, `label`, `format`, and `isVisible`.
*   The `key` and `label` properties are strings and aren't empty.
*   The `format` and `isVisible` properties are actually functions, as they should be.
*   All the `key` values are unique, avoiding conflicts and unexpected behavior.

Essentially, it’s a way to catch potential problems with your column setups early on, making your application more robust.

## Class ClientSizing

This component, ClientSizing, figures out how much of your assets to use for each trade. It's designed to be flexible, letting you choose from different sizing methods like a fixed percentage, the Kelly Criterion, or using Average True Range (ATR). You can also set limits on the minimum and maximum position sizes and restrict the overall percentage of your capital used in any single trade.  

It's built to work with your trading strategy, calculating the ideal position size based on your chosen settings. The `calculate` method is the core of this – it takes parameters and returns the calculated position size, taking into account all your constraints and the chosen sizing method. You can even add your own custom logic through callbacks for validation or to log sizing decisions.

## Class ClientRisk

ClientRisk helps manage risk at the portfolio level, ensuring that trading activity stays within defined limits. It's designed to work across multiple trading strategies simultaneously, allowing for a holistic view of your overall risk exposure.

This component keeps track of all open positions and validates new trading signals against configured rules, such as maximum position limits. You can also define your own custom validation logic to account for unique risk factors. 

ClientRisk is a central piece of the backtest-kit framework, automatically checking signals before trades are executed. It uses a special system to load and save position data, and in backtesting mode, this data saving step is skipped for efficiency.

It provides functions to register new trading signals as they open and to remove them when they close, keeping the risk tracking accurate and up-to-date. The `checkSignal` method is the heart of the risk management process, evaluating new signals against your defined constraints and triggering notifications based on the outcome.


## Class ClientOptimizer

The ClientOptimizer helps you experiment with and refine your trading strategies. It's designed to pull data from various places, keep track of how your tests are progressing, and even generate the code for your strategies using pre-built templates.

It collects data, builds a history of conversations with a language model (LLM) related to your strategies, and then pieces together complete, runnable code. 

You can use it to get a list of strategies, generate the code for a specific trading symbol, and then save that code to a file—creating the necessary folders if they don’t already exist and giving you a `.mjs` file ready to use. The `onProgress` property keeps you updated on the status of your optimization process.

## Class ClientFrame

The `ClientFrame` acts as a time machine for your backtesting, creating the sequences of dates and times your trading strategies will run against. It's designed to be efficient, remembering previously calculated timeframes to avoid unnecessary repetition. You can easily customize the interval between these timestamps, ranging from one minute to three days, and it provides ways to check and record the generated timeframes as they're created. Think of it as the engine that feeds historical data into your backtesting process.

The `getTimeframe` property is the main way to get this timeframe data—it takes a symbol (like a stock ticker) and returns a promise resolving to an array of dates, and it's smart enough to remember results for later use.


## Class ClientExchange

This class provides a way to interact with an exchange when you're testing a trading strategy. It’s designed to be efficient in its memory usage.

You can use it to retrieve historical price data, get future price data needed for backtesting, and calculate the VWAP (a measure of average price weighted by volume).

The `getCandles` method pulls historical data, while `getNextCandles` looks ahead to simulate future conditions.  `getAveragePrice` figures out the VWAP using the most recent five 1-minute candles.

Finally, it also helps you format quantities and prices to match the specific requirements of the exchange you're working with, ensuring that your orders look correct.

## Class CacheUtils

CacheUtils helps you speed up your code by automatically caching the results of functions, particularly useful when dealing with time-based data like candles. It's designed to be easy to use—you simply wrap your functions, and CacheUtils takes care of remembering and reusing results based on the timeframe you specify.

The `fn` property is the main tool here; it's how you wrap a function for caching. Each function gets its own dedicated cache, so changes to one function's cache won't affect others.

If you need to refresh the cached results—for example, if the underlying function has changed or you're switching test scenarios—`flush` provides a way to completely clear the cache for a function, or all functions. `clear`, on the other hand, is for more targeted cache clearing, only removing results for the current test setup. Think of `flush` for big resets, and `clear` for fine-tuning.

## Class BreakevenUtils

BreakevenUtils is a tool that helps you understand and analyze breakeven events within your trading system. It gathers information about when trades reach their breakeven point and presents it in a way that's easy to interpret.

Think of it as a reporting system that summarizes breakeven data. It collects details like when a breakeven event occurred, which symbol it involved, the trading strategy used, and key price points. 

You can use BreakevenUtils to:

*   Get statistical summaries of your breakeven performance.
*   Generate clear, organized markdown reports that show all breakeven events in a table format.  These reports include information like the symbol, strategy, entry price, and breakeven price.
*   Save those reports directly to files on your computer for later review or sharing.

The system automatically stores breakeven events and calculates key metrics. It’s designed to make it simple to track and understand how your trading strategies perform regarding breakeven points.

## Class BreakevenMarkdownService

The BreakevenMarkdownService helps you automatically create and store reports about breakeven events during your trading backtests. It listens for these events, gathers them together for each symbol and trading strategy, and then transforms that data into easy-to-read markdown tables. These reports include detailed information about each breakeven event and provide overall statistics.

The service organizes reports and stores them in a dedicated folder on your disk, making it simple to review and analyze your trading performance. It handles the creation of necessary directories if they don't exist.

To manage the data, it includes options to clear the accumulated event information, either for a specific trading combination or globally. It also initializes itself automatically when first used, subscribing to the necessary events, and offers a way to unsubscribe if needed. The service relies on a storage mechanism to keep track of individual symbol-strategy combinations, ensuring data isolation.

## Class BreakevenGlobalService

BreakevenGlobalService acts as a central hub for managing breakeven tracking within the backtest-kit framework. Think of it as a middleman that ensures all breakeven operations are logged and handled consistently. It receives its components—like logging and connection services—from the dependency injection system, making it easy to integrate into various trading strategies.

Its primary role is to validate trading strategies and associated risks before any calculations occur, and it does so efficiently by remembering previous validations. The `check` function is responsible for deciding whether a breakeven trigger should happen, while `clear` handles resetting the breakeven state when a signal closes. Essentially, this service streamlines breakeven management and provides a place to monitor what's happening.

## Class BreakevenConnectionService

The BreakevenConnectionService is like a central manager for tracking breakeven points in your trading strategies. It makes sure you don't create unnecessary calculations by remembering previously computed breakeven data for each trading signal. 

Think of it as a factory that creates and manages "ClientBreakeven" objects—one for each signal—and keeps them organized. It efficiently handles checking and clearing breakeven states, ensuring the system doesn't hold onto data it doesn't need, preventing memory issues. It receives instructions from other parts of the system, like the ClientStrategy, and uses a clever caching system to optimize performance.

Essentially, it simplifies the process of tracking breakeven, ensuring it's handled consistently and efficiently. It receives setup information from a logger and a system for notifying other parts of the application about changes.

## Class BacktestUtils

The `BacktestUtils` class provides helpful tools for running and managing backtest simulations within the trading framework. It's designed to simplify the backtesting process and offers a convenient, globally accessible way to interact with the backtest engine.

The class uses a special "instance memoization" to ensure each unique combination of symbol and strategy has its own isolated backtest running environment, preventing conflicts.

Here’s a breakdown of what you can do with it:

*   **Run backtests:** You can initiate a backtest for a specific symbol and strategy, either to receive results step-by-step or to run it in the background for logging or other side effects.
*   **Monitor signals:**  It allows you to check for pending or scheduled signals for a strategy, which can be useful for debugging or understanding the strategy's behavior.
*   **Control strategy execution:**  You can stop a strategy from generating new signals, cancel scheduled signals, or adjust the trailing stop-loss distance.
*   **Manage positions:**  It offers methods for executing partial profit or loss closures on active positions, and for moving the stop-loss to breakeven.
*   **Gather statistics and reports:**  You can retrieve statistical data and generate markdown reports summarizing the results of completed backtests, and even save those reports to a file.
*   **List active backtests:** Get a snapshot of all currently running backtest simulations and their statuses.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save detailed reports about your trading backtests. It listens for signals during the backtest process and keeps track of how each strategy performed. It then generates readable markdown tables summarizing this information.

The service stores data for each strategy and symbol combination separately, ensuring that results are isolated and accurate. You can easily retrieve statistics, generate reports, or save them directly to disk within the logs/backtest folder. 

To get started, the service automatically initializes itself when you begin a backtest. You can clear the stored data if you need to start fresh. If you're using a logger, you can provide it to the service to help with debugging and monitoring its internal operations. Finally, you can unsubscribe from the backtest signal events when you are done with the service.

## Class BacktestLogicPublicService

This service helps you run backtests in a more straightforward way. It handles the behind-the-scenes details of managing the context – things like the strategy name, exchange, and timeframe – so you don't have to pass them around every time you call a function.

Essentially, it builds upon another internal service to automatically provide this context information.

The `run` function is your primary tool for launching a backtest. It takes a symbol (like "BTC-USD") and automatically injects the necessary context information, simplifying the process of getting backtest results. The results are delivered as a stream, allowing you to process them as they become available.


## Class BacktestLogicPrivateService

This service helps run backtests in a memory-friendly way, especially when dealing with lots of data. It works by getting a list of time periods, and then processing each one step-by-step.

When a trading signal appears, it fetches the necessary historical data and runs the backtest logic.  The service then skips ahead in time until the signal closes, only yielding results for completed trades.

Instead of building up a huge list of results, it sends them to you as they're ready – making it efficient for large backtests. You can even stop the backtest early if you need to.

The `run` method is the main way to use it; you give it a symbol, and it provides an asynchronous generator that streams backtest results as trades are completed. It relies on other services like a logger, strategy core, exchange core, frame core, and method context service to do its work.

## Class BacktestCommandService

This service acts as a central point for kicking off backtesting processes within the system. Think of it as the main gateway to running simulations of trading strategies. It's designed to be easily used and managed, especially when different parts of the application need access to backtesting capabilities.

It relies on several other services to handle specific tasks like validating strategies, exchanges, and data frames, and it uses a logger to keep track of what’s happening during the backtest.

The core function is `run`, which takes a symbol (like a stock ticker) and some contextual information – like the name of the strategy, exchange, and data frame being used – and then returns a series of results as the backtest progresses. It essentially orchestrates the entire backtesting process, making it convenient to initiate and monitor.

