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

The Walker Validation Service helps you keep track of and ensure your parameter sweep configurations, often called "walkers," are set up correctly. Think of walkers as defining the different scenarios you want to test when optimizing a trading strategy or tuning hyperparameters.

This service acts as a central hub for managing these walkers, allowing you to register new ones, check if they exist before running tests, and quickly list all the walkers you've defined.  It also remembers the results of previous validations to make things faster.

You can add new walkers using `addWalker`, confirm a walker is present using `validate`, and view a list of all registered walkers with `list`. The service also uses a logger to help you debug any issues.

## Class WalkerUtils

WalkerUtils simplifies working with walkers, which are components that compare different trading strategies. Think of it as a helper class to easily run and manage these comparisons.

It provides a straightforward way to execute walkers, automatically handling some of the underlying details like knowing which exchange and framework to use. The class is designed to be easily accessible throughout your system, acting as a single point of control.

You can run walkers in the foreground to get real-time results or in the background if you just want to trigger actions like logging or callbacks. It also lets you stop walkers gracefully, preventing new signals while allowing existing ones to complete.

Need to gather all the data from a walker's strategy comparisons? There's a method for that.  You can also generate and save comprehensive reports, which are formatted in Markdown, giving you a clear overview of each strategy's performance. Finally, you can list all the active walkers to keep track of their status.


## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of your trading strategies’ configurations in a structured and safe way. It’s designed to store and manage what we call "walker schemas," which essentially define how a trading strategy behaves. 

Think of it as a central place to register and retrieve these strategy configurations. You can add new schemas using the `addWalker()` method, and later get them back using their names.

The service ensures your schemas are correctly formed by doing a quick check upon registration – it makes sure all the necessary parts are present and of the right type.

You can also update existing schemas with new information; the `override()` method lets you do that without replacing the entire schema. Finally, the `get()` method is your go-to for retrieving a schema when you need it.

## Class WalkerMarkdownService

The WalkerMarkdownService is designed to automatically create and save detailed reports about your backtesting strategies. It listens for updates from your walkers – the components that run your strategies – and gathers data about their performance.

Think of it as a report generator that keeps track of how different strategies are doing, and organizes that information into easy-to-read markdown tables. Each walker gets its own dedicated storage space to ensure reports stay organized.

You can use this service to view results for a specific walker, symbol, or metric. It handles saving the reports directly to your logs directory, creating folders as needed. There’s also a way to clear out all the accumulated data if you need to start fresh. The service initializes automatically when you first use it, and handles the technical setup to ensure it's always ready.

## Class WalkerLogicPublicService

This service helps manage and run automated trading strategies, often called "walkers," in a coordinated way. It builds upon a private service to handle the core logic of the walkers and adds automatic context management. This means things like the strategy name, exchange being used, the timeframe of the data, and the walker's name are automatically passed along, simplifying how you set up and run your tests. 

Essentially, it provides a convenient way to execute multiple backtests across different strategies while ensuring the proper context is available for each. You can use it to compare walkers for a specific stock ticker symbol, providing the walker's name, exchange, and timeframe as parameters. The result is a sequence of data representing the walker's performance.

## Class WalkerLogicPrivateService

The WalkerLogicPrivateService helps you compare different trading strategies against each other, like a race to see which performs best. It manages the process of running each strategy, keeping track of how they're doing as they go.

You'll receive updates as each strategy finishes, allowing you to monitor the progress in real-time. It identifies the top-performing strategy along the way and ultimately delivers a complete report ranking all the strategies you’ve tested.

Essentially, it uses another service to handle the individual backtesting of each strategy and coordinates the overall comparison process. The `run` method is your entry point – you give it a symbol, a list of strategies to compare, a metric to judge them by, and some contextual information, and it returns a sequence of results.

## Class WalkerCommandService

WalkerCommandService acts as a central point for interacting with the core walker functionality within the backtest-kit. Think of it as a convenient bridge, providing easy access to the underlying logic for running and managing your trading simulations. It bundles together several key services – like validation and schema management – to streamline the process.

The `run` method is the main action you'll use; it allows you to kick off a walker comparison for a specific trading symbol. When you call it, you’ll need to provide information like the walker’s name, the exchange it’s using, and the frame it’s operating within, so the system knows exactly what to execute. The result is a stream of data representing the walker's behavior.

## Class StrategyValidationService

The StrategyValidationService helps you keep track of and make sure your trading strategies are set up correctly. It acts as a central place to register your strategies and check if they exist before you start using them. 

It also verifies that any associated risk profiles are valid, ensuring everything is sound. To make things run smoothly, it remembers past validation results, so it doesn't have to re-check everything every time. 

You can add new strategies using `addStrategy`, check if a strategy is valid with `validate`, and see a complete list of registered strategies using `list`. The service works with a logger and a risk validation service to manage and oversee strategy operations.

## Class StrategySchemaService

This service acts as a central place to store and manage the definitions of your trading strategies. Think of it like a library where you catalog each strategy’s blueprint. 

It keeps track of these blueprints in a safe and organized way, using a special system for type safety.

You can add new strategy blueprints using `addStrategy()`, and then easily find them later by their names. 

Before a new strategy blueprint is added, it's checked to make sure it has all the necessary pieces in the right format.

If you need to update an existing strategy blueprint, you can do so with partial changes. And of course, you can retrieve any strategy blueprint by its name when you need it.

## Class StrategyCoreService

This service acts as a central hub for managing trading strategies within the backtest-kit framework. It leverages other services like those for connections, validation, and risk assessment to provide a streamlined interface for strategy operations.

Here's a breakdown of its key capabilities:

*   **Validation:** It ensures that strategies and their configurations are valid, caching results to improve performance and avoiding repetitive checks.
*   **Signal Retrieval:** It provides access to pending and scheduled signals for specific symbols, crucial for monitoring and managing trade executions.
*   **State Checks:** It lets you quickly determine whether a strategy has reached breakeven, has been stopped, or whether it's still active.
*   **Strategy Execution:** It handles tasks like running backtests, ticking (checking signal status), and managing strategy stops and cancellations.
*   **Partial and Trailing Adjustments:** It allows for adjustments to positions, enabling partial profit-taking, partial loss-taking, trailing stop-loss, and trailing take-profit actions.
*   **Cache Clearing:** It offers a way to clear cached strategy data, forcing a refresh and re-initialization.

Essentially, this service orchestrates a lot of the behind-the-scenes work involved in running and managing trading strategies, making it a critical component of the backtest-kit system.

## Class StrategyConnectionService

The `StrategyConnectionService` acts as a central hub for managing and routing strategy operations within the backtest-kit framework. It ensures that the correct strategy instance is used for a given trading symbol and strategy name, optimizing performance by caching these instances.

Think of it as a smart dispatcher, making sure the right strategy gets the right data and instructions. It automatically handles tasks like initializing strategies, retrieving signals, checking for break-even points, and stopping strategies when needed.

Here's a breakdown of its key features:

*   **Intelligent Routing:** It directs requests to the appropriate strategy based on the symbol and strategy name.
*   **Performance Boost:** It caches strategy instances, avoiding repetitive initialization and saving resources.
*   **Initialization Control:** It enforces that strategies are properly initialized before any operations are performed.
*   **Handles Different Modes:**  It works seamlessly with both live trading (tick) and backtesting (backtest) scenarios.
*   **Signal Management:** Provides methods to retrieve pending and scheduled signals.
*   **Risk and Breakeven Checks:** Includes functions to check for breakeven and determine if a strategy should be stopped.
*   **Partial and Trailing Adjustments**: Offers ways to manage partial profits/losses and trailing stops/takes for active signals.
*   **Cache Clearing**: Provides a way to manually clear the strategy cache and force a re-initialization.



The service relies on several other services like `LoggerService`, `ExecutionContextService`, `StrategySchemaService`, `RiskConnectionService`, `ExchangeConnectionService` and `PartialConnectionService` to handle logging, context management, schema validation, risk assessment, exchange communication and partial position management respectively.

## Class SizingValidationService

The SizingValidationService helps you keep track of and verify your position sizing strategies. Think of it as a central hub for ensuring your sizing rules are set up correctly before your trading system runs. 

You can use it to register new sizing strategies using `addSizing`, and then confirm that a specific sizing strategy exists before using it with the `validate` function.  It also keeps a list of all registered strategies with the `list` method. To make things efficient, the service remembers its validation results, so you don't have to repeat checks unnecessarily. The service utilizes a logger to help with troubleshooting.

## Class SizingSchemaService

This service helps you keep track of different sizing strategies for your trading backtests. Think of it as a central place to store and manage how much of your capital you’ll use for each trade.

It uses a system to ensure your sizing strategies are structured correctly, checking for essential components before they're saved. 

You can add new sizing strategies using the `register` method, update existing ones with `override`, and easily retrieve them by name using the `get` method. It's designed to be organized and type-safe, making sure your sizing configurations are consistent and reliable.

## Class SizingGlobalService

This service, `SizingGlobalService`, handles the critical task of determining how much of an asset to trade, essentially setting your position size. Think of it as a central hub for size calculations, coordinating with other services to ensure accurate and validated sizing. It's a core component used both behind the scenes within the backtest-kit framework and also accessible through the public API. 

The service relies on internal components like `SizingConnectionService` to get the necessary data and `SizingValidationService` to verify the sizing parameters. You won't typically interact with these internal dependencies directly.

The key function is `calculate`, which takes parameters defining your risk profile and the trade details, and returns the calculated position size. It also includes a `sizingName` context for identification and logging purposes.


## Class SizingConnectionService

This service acts as a dispatcher for calculating position sizes, ensuring the right sizing method is used for different strategies. It keeps track of which sizing methods are available and reuses them whenever possible to speed things up – this is called memoization.

The `getSizing` function is how you fetch a specific sizing method; it creates one if it doesn't already exist, and remembers it for later use.

The `calculate` function is where the actual size calculation happens. It takes information about the risk involved and the chosen sizing method and figures out how much to trade. This function intelligently directs the sizing request to the appropriate sizing implementation based on the strategy's configuration. If a strategy doesn't have specific sizing rules, you’ll use an empty string for the sizingName.

## Class ScheduleUtils

ScheduleUtils is a helper class designed to make it easier to understand how your scheduled signals are performing. Think of it as a central place to monitor and report on signals that are waiting to be processed.

It keeps track of signals that are queued, those that have been cancelled, and calculates useful metrics like the cancellation rate and average wait time. 

You can use it to get detailed statistics for a specific trading symbol and strategy, or to generate a nicely formatted markdown report. The report can also be saved directly to a file for later review. It's set up to be easily accessible throughout your trading framework, ensuring consistent monitoring.

## Class ScheduleMarkdownService

The ScheduleMarkdownService is designed to automatically generate reports about scheduled trading signals, helping you understand how your strategies are performing over time. It keeps track of when signals are scheduled and cancelled, organizing this information by strategy and trading symbol.

The service builds detailed markdown tables summarizing these events, along with key statistics like cancellation rates and typical wait times. These reports are saved as files, making it easy to review your strategy's behavior and identify potential areas for improvement.

It works by listening for signal events – when signals are scheduled or cancelled – and storing that information. You don't need to manually trigger anything; the reports are generated automatically. You have the flexibility to clear out this data when it's no longer needed, or focus on specific symbol-strategy combinations. The service initializes itself automatically when first used, ensuring reports start flowing without needing any extra setup.

## Class RiskValidationService

This service helps you keep track of your risk management rules and makes sure they're set up correctly before your trading strategies run. It acts as a central place to register and verify different risk profiles, ensuring everything is in order. Think of it as a safety net for your trading.

You can add new risk profiles using `addRisk`, and `validate` makes sure a profile exists before you try to use it. To see what risk profiles you’ve already registered, use `list`. The service also remembers the results of previous validations to speed things up.

## Class RiskUtils

The RiskUtils class helps you understand and analyze risk rejections that occur during trading. Think of it as a tool for reviewing why trades might have been prevented or adjusted. It gathers information about these rejections, which includes details like the symbol involved, the trading strategy used, the position taken, and the reason for the rejection.

You can use RiskUtils to get statistics like the total number of rejections, broken down by symbol and strategy, giving you a clear picture of potential problem areas.  It can also generate reports in Markdown format, presenting the rejection events in an organized table with key details.  Finally, it offers a convenient way to save these reports to a file, making it easy to share or archive your risk rejection analysis. The class essentially provides a way to extract, summarize, and export data about rejected trades.

## Class RiskSchemaService

This service helps you keep track of and manage your risk schemas in a safe and organized way. It uses a special system to ensure your schemas are structured correctly, preventing errors down the line. 

You can add new risk profiles using the `addRisk()`-like function, and easily find them again by their names. If you need to update an existing risk profile, you can do so with partial changes. The service also checks the basic structure of your schemas before adding them, making sure they have all the necessary components. Think of it as a central library for your risk profiles, ensuring consistency and preventing issues.

## Class RiskMarkdownService

The RiskMarkdownService helps you automatically generate reports about rejected trades due to risk rules. It keeps track of these rejections, organizing them by the symbol being traded, the strategy used, and the timeframe. 

Think of it as a system that listens for when a trade is blocked by a risk rule and then builds a clear, readable markdown document detailing those blocked trades. You can request overall statistics like the total number of rejections, or drill down to see rejections specific to a certain symbol or strategy. 

The service automatically saves these reports to your disk, making it easy to review and analyze your risk rule performance. It handles the storage and organization for you, so you don't have to manually compile this information. It initializes itself automatically when you start using it, and also provides a way to clear the accumulated data when needed.

## Class RiskGlobalService

This service acts as a central point for managing risk within the backtest-kit framework. It’s responsible for making sure trading signals align with established risk limits, working closely with a connection service to perform those checks. Think of it as a gatekeeper, preventing trades that would exceed predefined boundaries.

It keeps track of open and closed signals to maintain an accurate view of current risk exposure. This component also validates risk configurations to ensure everything is set up correctly and avoid repeating those checks unnecessarily.

The service provides methods to check if a signal is permissible, register new signals, remove completed signals, and completely clear risk data if needed – either for a specific risk setup or globally. It provides logging to track validation activity and ensures a robust risk management process.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks during trading. It ensures that risk assessments are performed by the correct implementation based on the specific risk profile you've defined.

Think of it as a smart router; when it needs to check a trading signal against risk limits, it figures out which risk engine to use, considering factors like the exchange, the trading frame, and whether you're in backtest mode. It keeps track of these risk engines to avoid creating them repeatedly, making the process much faster.

You can register signals (when you start a trade) and deregister them (when you close a trade) with the service, which allows the risk system to monitor ongoing positions. There’s also a way to clear the cached risk engines, useful for resetting or refreshing the system. Strategies without specific risk configurations will use an empty string as the risk name.

## Class PositionSizeUtils

This class offers helpful tools for figuring out how much of an asset to trade, a crucial part of any trading strategy. It's designed to make position sizing easier and more reliable. 

Inside, you'll find pre-built methods for several common sizing approaches, like using a fixed percentage of your account, applying the Kelly Criterion formula, or basing the size on the Average True Range (ATR). Each method includes built-in checks to ensure the information you provide is compatible with the sizing technique being used. Essentially, it’s a collection of functions you can use to determine your position size, all within a single, convenient place.

Here's a quick breakdown of what's available:

*   **fixedPercentage:** Calculates the position size based on a fixed percentage of your account balance.
*   **kellyCriterion:** Determines position size using the Kelly Criterion, which aims to maximize long-term growth. This method requires information like win rate and win/loss ratio.
*   **atrBased:** Calculates position size based on the ATR, a measure of price volatility.

## Class PersistSignalUtils

PersistSignalUtils helps manage how trading signals are saved and restored, especially when a strategy is running live. It ensures that even if something unexpected happens, your signal data remains safe and consistent.

Essentially, it remembers the state of your strategies, like the signals they’re generating, so they can pick up where they left off.

You can customize how this saving and restoring happens by providing your own persistence adapter, giving you flexibility in how the data is stored.

When a strategy starts up, `readSignalData` fetches any existing signal information, and when a signal changes, `writeSignalData` reliably saves that new state. ClientStrategies rely on these functions to manage signal persistence during live execution.

## Class PersistScheduleUtils

The `PersistScheduleUtils` class helps manage and safely store scheduled signals, especially when you're running automated trading strategies. It ensures that your strategies remember the scheduled signals even if your system crashes. 

Essentially, it acts like a secure memory for scheduled events, keeping track of them for each trading strategy.

Here's a breakdown of what it does:

*   **Stores scheduled signals:** It persistently saves the information about any scheduled signals a strategy has.
*   **Crash Protection:**  It writes data to disk in a way that prevents data loss if your system unexpectedly shuts down.
*   **Customizable:** You can even plug in your own storage mechanism if you need something beyond the default.
*   **Works with ClientStrategy:**  This utility class is directly used by the `ClientStrategy` to load and save those scheduled signals. 

The `readScheduleData` method retrieves the saved scheduled signal information, and `writeScheduleData` stores new or updated data. The `usePersistScheduleAdapter` method lets you swap out the standard persistence method for your own custom solution.

## Class PersistRiskUtils

This class, PersistRiskUtils, helps manage and save the details of your active trading positions, especially when dealing with different risk profiles. It keeps track of these positions in a way that’s efficient and reliable, using a clever system to avoid repeatedly creating storage instances.

You can customize how this data is stored by plugging in your own adapter, providing flexibility in your setup. The process of reading and writing this position data is designed to be secure and consistent. It ensures that changes are saved reliably, even if something unexpected happens during the process.

Specifically, the `readPositionData` method retrieves previously saved positions, while `writePositionData` saves the current positions to disk. These operations are handled carefully to avoid data corruption. A handy feature allows you to register custom persistence adapters, making it adaptable to your specific needs.

## Class PersistPartialUtils

This class, `PersistPartialUtils`, helps manage and safely store the partial profit and loss information used by your trading strategies. Think of it as a way to make sure your strategy remembers where it left off, even if something unexpected happens.

It keeps track of these partial states separately for each symbol and strategy combination, using a clever system to avoid unnecessary work. You can even customize how this information is stored if you need to.

The class provides methods to read existing partial data—useful when starting up a strategy—and to write new data safely, ensuring that no information is lost in case of crashes.  It uses special techniques to make these writes as reliable as possible.

There’s also a feature allowing you to plug in your own data storage methods if the default isn't quite what you need.


## Class PersistBreakevenUtils

This class helps manage and save your breakeven data, ensuring it's preserved between sessions. Think of it as a librarian for your trading strategies' crucial data points. It automatically handles storing and retrieving this information to files on your computer, organized by the trading symbol, the strategy you're using, and the exchange.

It's designed to work behind the scenes, ensuring data is saved safely and efficiently. It only creates a storage location for your data the first time you need it, and it uses a system to avoid accidentally corrupting your saved files.  You can even customize how this data is stored if you have specific requirements.  The class keeps track of where data for each symbol and strategy is stored, making it easy to load and update the data as needed.

## Class PerformanceMarkdownService

This service helps you understand how your trading strategies are performing by collecting and analyzing key metrics. It listens for performance events and keeps track of them for each strategy you're using, calculating things like average performance, the best and worst results, and percentiles to give you a comprehensive view. 

You can request the aggregated statistics for a specific strategy and symbol or generate a detailed markdown report that highlights potential bottlenecks and areas for improvement. The reports are automatically saved to your logs directory. 

The service is designed to be initialized only once, and it includes a way to clear all accumulated performance data if needed. It utilizes a storage system that keeps data separate for each symbol, strategy, exchange, timeframe, and backtest combination.

## Class Performance

The Performance class helps you understand how your trading strategies are performing. It provides tools to gather and analyze performance data, pinpointing areas that might be slowing things down or causing volatility.

You can retrieve detailed statistics for specific symbols and strategies, showing metrics like duration, average times, and percentiles to highlight potential bottlenecks. It's like getting a breakdown of where your strategy is spending its time.

The class also generates easy-to-read markdown reports that summarize the performance analysis, including time distributions and detailed tables. These reports are designed to make it easy to identify problem areas. Finally, you can save these reports directly to your computer for later review or sharing.

## Class PartialUtils

This utility class helps you analyze and report on partial profit and loss data collected during backtesting or live trading. Think of it as a tool to summarize and visualize the smaller, incremental gains and losses that contribute to your overall strategy performance.

It gathers information from events related to profits and losses, keeping track of things like timestamps, actions, symbols, and signal IDs. You can request summary statistics like total profit/loss event counts.

The main features include generating reports in Markdown format, which allows for easy readability and sharing. These reports display events in a table with key details, and also include summary information at the bottom. You can also save these reports directly to files on your computer. It's designed to be simple to use, providing a straightforward way to understand and document your strategy's behavior.


## Class PartialMarkdownService

The PartialMarkdownService helps you track and report on small, incremental profits and losses during your backtesting or live trading. It listens for events representing these gains and losses, organizing them by the trading symbol and strategy you're using.

Think of it as a detailed record-keeper. It builds up information about each symbol and strategy, then generates nicely formatted markdown tables that clearly display these profit/loss events.

You can request statistics, such as the total number of profit or loss events, or generate a complete report summarizing the activity for a specific symbol and strategy. This report can then be saved as a file, making it easy to review performance.

The service automatically manages its storage, keeping data separate for each combination of symbol, strategy, exchange, timeframe, and backtest setting. It also handles initialization and cleanup, so you don't have to worry about manually subscribing or unsubscribing to event streams. You can also clear out all accumulated data or selectively clear data for a specific trading setup.

## Class PartialGlobalService

This service manages tracking partial profits and losses across the entire system. Think of it as a central hub for these operations, making sure everything is logged and handled consistently.

It's designed to be easily plugged into a trading strategy – specifically, it’s injected alongside other configuration details. The service doesn't actually *do* the work of managing partials itself; instead, it passes those tasks along to another component called `PartialConnectionService`.

Before passing anything on, it adds its own logging to keep a record of what's happening. It also includes validation services to check things like the strategy's existence and associated configurations, streamlining the process and preventing errors.

There are a few key methods: `profit` handles reaching a profit level, `loss` deals with reaching a loss level, and `clear` resets the partial state when a signal closes.  All of these methods log their actions before forwarding them.

## Class PartialConnectionService

The PartialConnectionService helps track profit and loss for individual trading signals. Think of it as a manager that keeps track of how each signal is performing. 

It creates and remembers (caches) special objects called ClientPartial, one for each signal. These ClientPartial objects hold the profit and loss information for a specific signal.

When a signal makes a profit or incurs a loss, this service uses the appropriate ClientPartial to record the event and notify other parts of the system. 

When a signal is closed, the service cleans up the ClientPartial to prevent memory issues, ensuring resources are managed efficiently. It’s injected into the broader trading strategy system to coordinate these tracking activities.

## Class OutlineMarkdownService

This service helps automatically create documentation in markdown format, specifically for AI-driven trading strategies. It's designed to be used by the AI Strategy Optimizer to keep track of how strategies are developed and debugged.

The service saves important information in a structured way, creating a folder for each strategy with files containing:

- The initial system prompt used to guide the AI
- Each user's input during the strategy creation process, stored in separate numbered files
- The final output from the AI, along with the generated trading signal.

It avoids accidentally overwriting previous work by only creating files if the corresponding directory doesn't already exist. The service relies on a logger service that is provided to it.


## Class OptimizerValidationService

This service helps keep track of your optimizers, making sure they exist and are properly registered within your backtesting system. Think of it as a central directory for all the different optimization strategies you're using. 

It’s designed to prevent you from accidentally trying to use an optimizer that hasn’t been set up correctly, which could lead to errors. To make things efficient, it remembers the results of previous validations, so it doesn’t have to repeat checks unnecessarily.

You can use this service to register new optimizers, verify that an optimizer is available, and get a complete list of all registered optimizers along with their details. Essentially, it's a handy tool for ensuring the integrity and reliability of your optimization process. 


## Class OptimizerUtils

This toolkit offers helpful functions for working with trading strategies generated by an optimizer. It provides ways to retrieve strategy data, create the actual code for those strategies, and save that code to files for later use. 

You can use `getData` to pull together all the information about your strategies, essentially gathering metadata and history related to how they were trained. `getCode` allows you to build a complete, runnable code file for your strategies, including all the necessary parts like imports and helper functions. Finally, `dump` automates the process of saving your generated code to a file, creating directories if they don't exist and naming the files in a consistent format.

## Class OptimizerTemplateService

This service acts as a central hub for creating code snippets used in backtesting and optimization processes. It leverages a large language model (Ollama) to generate sophisticated trading strategies and related configurations.

The service can automatically generate code for various components, including exchange connections (like Binance using CCXT), timeframe configurations, strategy definitions, and launcher scripts to run the backtests. It’s designed to handle multiple timeframes (1m, 5m, 15m, 1h) and produces structured JSON output for trading signals.

Debugging is streamlined with logging to a designated directory. The system also facilitates strategy comparison using a "walker" approach, allowing users to test multiple strategies against each other.  You can customize parts of this process through configuration settings.

Specific code templates are provided for:

*   Generating introductory banners containing necessary imports.
*   Crafting prompts for the LLM to understand the data.
*   Creating acknowledgements from the LLM.
*   Building Walker configurations for strategy comparison.
*   Constructing strategy code with multi-timeframe analysis.
*   Defining exchange setups.
*   Setting up different timeframes.
*   Creating launchers to execute the walker.
*   Generating helper functions for debugging (dumping data to files).
*   Generating text based insights.
*   Creating structured JSON signals that detail entry/exit prices, stop-loss levels, and estimated duration.

## Class OptimizerSchemaService

This service helps you keep track of and manage the different configurations used to optimize your trading strategies. Think of it as a central place to define and store how your optimizers will work.

It ensures that each optimizer configuration is set up correctly by verifying essential details like the optimizer's name, the training data range, the data source, and how prompts are generated.  You can register new optimizer configurations, and if you need to adjust an existing one, you can partially update it, merging new details with what's already there.  Finally, it allows you to easily retrieve a specific optimizer configuration by its name when you need it. The service uses a special registry to ensure the configurations are stored safely and can't be changed unexpectedly.

## Class OptimizerGlobalService

This service acts as a central point for interacting with optimizers, ensuring everything runs smoothly and correctly. It’s like a gatekeeper, checking that the optimizer you’re trying to use actually exists before passing your request on to the parts that do the real work.

Essentially, it handles logging, validation, and then delegates requests to other specialized services.

Here’s what you can do with it:

*   **Fetch Data:** You can ask it to retrieve data related to an optimizer for a specific symbol, which includes metadata about the strategies it uses.
*   **Get Code:** It can generate the complete code for a strategy based on the optimizer and symbol you specify.
*   **Dump Code to File:**  Finally, it provides a convenient way to save the generated strategy code directly to a file.

Before any of these actions happen, it confirms that the optimizer you're referencing is valid, preventing errors and ensuring consistent behavior.

## Class OptimizerConnectionService

The OptimizerConnectionService acts as a central hub for working with optimizers in your backtesting setup. It's designed to efficiently manage and reuse optimizer connections, avoiding unnecessary overhead.

Think of it as a smart cache: when you need an optimizer, it either provides one it's already created or creates a new one, remembering it for future use based on its name.

It also handles combining default settings with any custom templates you provide, ensuring your optimizer configurations are consistent. You can inject logging to monitor what's happening, and the service ultimately relies on ClientOptimizer to perform the actual trading calculations.

Here's a breakdown of what it lets you do:

*   **`getOptimizer`**: This is your primary way to get an optimizer instance, and it's carefully managed for performance.
*   **`getData`**: This function fetches the data needed for your optimization strategies.
*   **`getCode`**: This generates the full code for your trading strategy based on the optimizer's settings and data.
*   **`dump`**: This handy tool saves the generated code to a file, making it easy to review and deploy.

## Class NotificationUtils

This class, NotificationUtils, gives you a simple way to manage and view notifications within the system. It handles some setup automatically behind the scenes, so you can focus on getting the notifications you need. 

You can use it to retrieve all existing notifications, presented in the order they appeared (with the newest ones at the top), or to completely erase the notification history. Think of it as a convenient interface for dealing with notifications.

## Class LoggerService

The LoggerService is designed to make sure all logging within the backtest-kit framework is consistent and provides helpful context. Think of it as a central hub for all your logging needs.

It automatically adds information about where a log message came from, such as the strategy, exchange, and the part of the code running. This context is injected automatically, so you don't have to remember to add it yourself.

You can also plug in your own logger if you want to customize where the logs go or how they're formatted, using the `setLogger` function. If you don’t set a logger, it defaults to a "no-op" logger, meaning it won't actually log anything.

The service provides convenient methods like `log`, `debug`, `info`, and `warn` which each log at a different severity level, all while automatically adding context. The `methodContextService` and `executionContextService` handle providing that context automatically.

## Class LiveUtils

This class provides tools for running and managing live trading operations. It's designed to simplify the process and includes features for handling potential crashes and providing real-time updates.

The `run` function is the primary way to start live trading, generating a stream of trade results that automatically recover from crashes by saving and restoring data.  There's also a `background` function that runs trading without generating results, ideal for tasks like persistent data storage or callback execution.

You can check for pending or scheduled signals using `getPendingSignal` and `getScheduledSignal` respectively.  `getBreakeven` helps you determine if a trade has reached a point where it can break even.  

To control live trading, you have options like `stop` (to halt new signal generation), `cancel` (to remove a scheduled signal), and several functions for managing partial profits and losses (`partialProfit`, `partialLoss`).

`trailingStop` and `trailingTake` adjust stop-loss and take-profit levels, protecting profits and tightening risk. The `breakeven` function moves the stop-loss to the entry price when a trade reaches a certain profit level.

Finally, the class includes functions for gathering data (`getData`), generating reports (`getReport`, `dump`), and listing all active trading instances (`list`).  It’s structured to ensure that each symbol-strategy combination runs in its own isolated environment.

## Class LiveMarkdownService

The LiveMarkdownService helps you automatically create detailed reports about your trading strategies as they run. It quietly listens to every event—from when a strategy is idle to when a trade is opened, active, or closed—and keeps track of all the details. These details are then used to generate easy-to-read markdown tables filled with information about each trade.

You'll get helpful statistics like win rate and average profit/loss (PNL) as part of the report. The service neatly saves these reports to your computer in a logs folder, organized by strategy name, making it simple to review your trading performance over time.

The service handles a lot of the behind-the-scenes work, and it’s designed to work with different trading symbols, strategies, exchanges, and timeframes. You can even customize what information gets included in the reports. It's also designed to only initialize once, and provides a way to clear all the stored data when needed.

## Class LiveLogicPublicService

This service helps you run live trading strategies by handling all the behind-the-scenes coordination. It builds upon a private service to automatically manage essential information like the strategy name and exchange, so you don't have to pass it around explicitly in your code.

Think of it as an always-running engine that produces trading signals – it continues indefinitely, generating signals as new data arrives. If something goes wrong and the process crashes, it's designed to recover and pick up where it left off, thanks to saved state. The system uses the current time to keep everything moving smoothly in real-time.

You start a live trading run by providing a symbol and context, and it will continuously provide you with signals representing trades being opened and closed.

## Class LiveLogicPrivateService

This service helps manage live trading, focusing on keeping things running smoothly and efficiently. It constantly monitors a trading strategy, checking for new signals and potential changes. 

The core of the service is an ongoing process that continuously looks for trading opportunities.  It grabs the current time to ensure real-time accuracy and streams results—specifically, when trades are opened or closed—to avoid overwhelming you with less important updates.

The system is designed to be resilient; if something goes wrong, it automatically recovers and picks up where it left off.  Because it's built as an infinite generator, it never stops running unless explicitly told to, providing a continuous stream of trading data for a specific symbol.  The service also uses various helper services for logging, core strategy operations, and managing method context.

## Class LiveCommandService

This service, `LiveCommandService`, acts as a central point for handling live trading operations within the backtest-kit framework. Think of it as a convenient wrapper that makes it easier to inject dependencies and access the core live trading functionality. 

It combines several validation services – for strategies, exchanges, schemas, and risk – ensuring everything is set up correctly before trading begins. 

The most important part is the `run` method.  It kicks off the live trading process for a specific trading symbol, sending information about each tick (price update) to your strategy.  This `run` function is designed to continuously operate, automatically recovering from crashes to keep your trading running smoothly. You essentially provide it with the symbol you want to trade and some contextual information like the strategy and exchange names.

## Class HeatUtils

HeatUtils helps you visualize and understand your trading strategy's performance through heatmaps. Think of it as a tool to easily create reports showing how each symbol contributed to your overall strategy results. It automatically gathers data from closed trades for a specific strategy, making it simple to see which assets were successful and which weren’t.

You can use HeatUtils to retrieve the underlying data for your heatmap, generate a nicely formatted markdown report summarizing the key performance indicators (like profit, Sharpe Ratio, and drawdown) for each symbol, or even save that report directly to a file. It’s designed to be easy to use, providing a convenient, single point of access for these heatmap operations.


## Class HeatMarkdownService

The Heatmap Service is designed to give you a clear, real-time view of your backtesting results. It gathers data about closed trades for each strategy, creating detailed statistics like total profit/loss, Sharpe Ratio, maximum drawdown, and the number of trades executed. 

It organizes this information both per-symbol and across your entire portfolio, making it easy to understand how each strategy is performing. The service automatically builds reports in Markdown format, allowing you to quickly share or document your findings.

You can customize the reports and choose which data points to display. It also handles potential mathematical errors gracefully, preventing issues with missing or infinite values. It stores data in a smart way so that each exchange, timeframe, and backtest mode has its own dedicated data set. 

The service automatically starts up when needed, and offers a way to stop listening for new data if you want to clean up. You can also clear the accumulated data whenever you need to start fresh.

## Class FrameValidationService

This service helps you keep track of and make sure your trading timeframes are set up correctly. Think of it as a central place to register and verify that your timeframes (like 1-minute, 5-minute, daily) are properly defined before your backtesting or trading logic runs. It remembers which timeframes you've registered and can quickly check if a timeframe is valid, avoiding errors later on.

You can use it to add new timeframes to its registry. 
You can also use it to confirm that a given timeframe actually exists before you try to use it. 
Finally, it provides a simple way to see a list of all the timeframes currently registered within the system. The service also uses caching to make these checks fast and efficient.

## Class FrameSchemaService

This service acts as a central place to store and manage the blueprints, or schemas, for your trading strategies. It uses a special system to keep track of these schemas in a safe and organized way.

You can think of it as a library where you add new strategy blueprints using `register()`, update existing ones with `override()`, and quickly find the blueprint you need by name using `get()`. Before a new blueprint is added, it checks that it has all the necessary parts with `validateShallow` to make sure everything's set up correctly. It's designed to help you keep your trading strategies consistent and well-defined.

## Class FrameCoreService

This service acts as the central hub for managing timeframes within the backtesting process. It relies on other services to handle connections and validation related to time data. Essentially, it’s responsible for figuring out what dates and times your backtest will use.

The `getTimeframe` method is key - it takes a symbol (like a stock ticker) and a timeframe name (like "1h" for hourly data) and returns an array of dates representing the data needed for that backtest. Think of it as the engine that creates the timeline for your trading simulation. It uses a connection service to get the timeframe information and a validation service to make sure the timeframes are correct.

## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different trading frames within your backtesting environment. It intelligently directs your requests to the correct frame implementation based on the current context.

Think of it as a smart router; it automatically figures out which frame you need without you having to manually specify it each time. To boost efficiency, it keeps a record of frequently used frames, so it doesn't have to recreate them repeatedly. 

This service also handles the backtest timeframe, allowing you to define the start and end dates for your simulations. If you're running in live mode, it operates without any frame restrictions.

The `getFrame` function is key, retrieving frames and caching them for quick access, while `getTimeframe` is used for defining the specific date range for a backtest.


## Class ExchangeValidationService

The ExchangeValidationService helps keep track of your configured exchanges and makes sure they're actually valid before your trading strategies try to use them. It's like a central address book for your exchanges, ensuring you’re interacting with real, working platforms. 

You can add new exchanges to this service using `addExchange()`, specifying their name and details.  Before attempting any trading actions, use `validate()` to check if an exchange exists, preventing potential errors. The service also remembers previous validation results, speeding things up with a technique called memoization. Finally, `list()` gives you a complete overview of all the exchanges currently registered.

## Class ExchangeUtils

This class, `ExchangeUtils`, offers helpful tools for working with exchanges within the backtest-kit framework. Think of it as a central place to simplify common exchange-related tasks. It's designed to be easily accessible as a single instance, making it convenient to use throughout your code.

It includes methods for retrieving historical candle data (`getCandles`), calculating the average price (`getAveragePrice`), and formatting quantities and prices (`formatQuantity`, `formatPrice`) to align with the specific rules of each exchange. The `getCandles` function cleverly figures out the start date automatically, ensuring consistency with how the `ClientExchange` handles data.  Essentially, it makes interacting with exchange data easier and more reliable.

## Class ExchangeSchemaService

This service helps you keep track of different exchange configurations, ensuring they're structured correctly. It acts like a central place to store and manage these exchange setups.

You can add new exchange configurations using `addExchange()` and then retrieve them later by their names.  The system makes sure the information you're adding follows a specific format using `validateShallow`, preventing errors down the line.

If you need to update an existing exchange configuration, you can use `override` to make changes to specific parts of it.  Retrieving a configuration is simple – just use `get` with the exchange's name.  It uses a clever system to store these configurations safely and reliably.

## Class ExchangeCoreService

This service acts as a central hub for interacting with an exchange, providing a layer of coordination to ensure that all operations have the necessary context – like the symbol being traded, the specific time, and whether it's a backtest. It sits between the connection to the exchange and the overall execution flow, handling tasks like validating exchange settings to prevent errors and fetching historical and future price data.  You’ll find it’s used internally by the backtesting and live trading logic.

It keeps track of several related services for things like logging, connecting to the exchange, and managing execution contexts.

The `validate` property offers a way to double-check exchange configurations, making sure everything is set up correctly, and it smartly remembers past validations to speed things up.

The core functions allow you to retrieve candle data (historical prices), calculate average prices (VWAP), and properly format prices and quantities for display, all while respecting the backtest environment if applicable.  The `getNextCandles` method is specifically for retrieving data in backtest mode to simulate future market conditions.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It automatically directs your requests to the correct exchange based on the active context, streamlining your trading operations.  To avoid repeatedly connecting to exchanges, it cleverly caches these connections, making things faster and more efficient.

This service provides a complete interface for common exchange tasks:

*   **Retrieving historical price data (candles):**  You can request candles for a specific trading pair and timeframe.
*   **Fetching the next set of candles:**  Specifically designed to keep your backtests or live trading systems updated with the latest data.
*   **Getting the current average price:**  It intelligently obtains this data either from a live exchange API or calculates it based on historical data when backtesting.
*   **Formatting prices and quantities:**  It ensures that the prices and quantities you send to the exchange adhere to its specific rules, preventing errors.

It's built with logging and performance in mind, making it a reliable and efficient component for your trading framework. The service relies on other components like the logger, execution context, schema, and method context services to function properly.

## Class ConstantUtils

This class provides a set of constants used to define take-profit and stop-loss levels for your trading strategies, based on the Kelly Criterion and a method that gradually reduces risk. These constants represent percentages of the total distance to your final profit or loss target.

For example, if you're aiming for a 10% profit, `TP_LEVEL1` at 30% means a partial profit is taken when the price reaches 3% higher than your entry point. `TP_LEVEL2` (60%) takes profit at 6%, and `TP_LEVEL3` (90%) captures almost all of the potential profit at 9%.  Similarly, `SL_LEVEL1` at 40% signals an early warning for a potential loss, while `SL_LEVEL2` (80%) ensures you exit the position before significant losses occur. These levels are designed to help you manage risk and lock in profits in a structured way.

## Class ConfigValidationService

This service helps make sure your trading configurations are mathematically sound and likely to be profitable. It meticulously checks your settings, like slippage, fees, and profit margins, to ensure they are reasonable and won't lead to losing trades.

The validation process also verifies that your take-profit distance is sufficient to cover all trading costs, and that relationships between parameters like stop-loss distances make sense. 

Essentially, it's a safety net to catch errors in your configuration before you start backtesting, preventing issues related to negative percentages, invalid time values, or unrealistic parameter ranges. The service performs checks on time-based settings, candle parameters, and overall economic viability of your trading setup.

## Class ColumnValidationService

The ColumnValidationService acts as a safeguard for your column configurations, ensuring they're set up correctly and won't cause problems later. Think of it as a quality checker for how your data columns are defined. 

It meticulously examines each column to make sure it has all the necessary parts, like a unique identifier (key), a descriptive label, a formatting rule (format), and a visibility setting (isVisible). It also confirms these identifiers are all distinct, and that the formatting and visibility are actually functions – not just any kind of value. Ultimately, this service helps you catch errors early and maintain a consistent, reliable structure for your data columns.


## Class ClientSizing

This component, ClientSizing, helps determine how much of your assets to allocate to a trade. It’s designed to be flexible, offering several sizing methods like fixed percentages, Kelly criterion, or using Average True Range (ATR). You can also set limits on your position size, ensuring you don't risk too much on any single trade. 

The ClientSizing class takes a configuration object with your desired sizing parameters, then uses those to figure out the optimal position size. The `calculate` method is the core of this process, taking trade information and returning the size it recommends. Think of it as a safety net and optimizer for your trading strategy.


## Class ClientRisk

ClientRisk helps manage risk across your trading strategies, acting as a safety net to prevent exceeding defined limits. It’s designed to work at the portfolio level, meaning it considers all strategies together when making decisions.

This component keeps track of all open positions across different strategies, using a special key to identify each one. It ensures this tracking is done only once, even if multiple strategies are using it.

The core function is `checkSignal`, which evaluates incoming trading signals against your configured risk rules and custom validations. It gives you access to the specifics of the signal and all current positions to make informed decisions.

To keep things organized, ClientRisk registers when a signal opens (`addSignal`) and when it closes (`removeSignal`), providing a clear audit trail. It also handles saving and loading position data, although this feature is bypassed when running in backtesting mode.

## Class ClientOptimizer

The ClientOptimizer helps you automate and refine your trading strategies. It acts as a bridge between different data sources and uses templates to generate code for your strategies, making the optimization process smoother.

It gathers data from various places, handles large datasets through pagination, and keeps track of conversations with any Large Language Models used during the process. 

The `getData` method pulls in your strategy data and prepares it for optimization.  `getCode` takes that data and constructs the actual code you can run. Finally, `dump` lets you save the generated code as a ready-to-use file, creating necessary folders if they don’t exist.  The `onProgress` callback keeps you informed about what's happening during these processes.

## Class ClientFrame

The `ClientFrame` class helps generate the timeline of data your backtesting strategy will use. Think of it as creating a list of specific dates and times for your backtest to run through. It's designed to avoid repeating the work of creating this timeline – it remembers previous calculations to be more efficient.  You can control how spaced out those dates and times are, from very frequent (like every minute) to much wider intervals (like every three days).  The `ClientFrame` can also be set up to check if the generated timeline is valid and to record important information along the way. The core responsibility of this class is to supply the data timeline to the backtesting engine.

The `getTimeframe` property is the main way you interact with the `ClientFrame`; it’s how you ask it to generate the timeline for a particular trading symbol. The results are saved so it doesn't have to recalculate them every time.


## Class ClientExchange

This class acts as a bridge to get data from an exchange, designed to be used within a backtesting environment. It's built to be efficient, utilizing prototype functions to minimize memory usage. You can retrieve historical candle data, look ahead to future candles (important for simulating trades), and calculate the VWAP based on recent trading activity. 

The `getCandles` method retrieves past data relative to a specific point in time.  `getNextCandles` specifically looks forward in time, which is crucial for backtesting scenarios.  To help understand the average price, the `getAveragePrice` method calculates the VWAP using a configurable number of recent 1-minute candles.

For presenting data accurately, both `formatQuantity` and `formatPrice` methods ensure numbers are displayed in the correct format, respecting the exchange's specific rules for precision and rounding.

## Class CacheUtils

CacheUtils offers a simple way to cache the results of your functions, which is really useful for optimizing backtesting performance. Think of it as a way to avoid recalculating the same things over and over again.

It works by wrapping your functions – essentially, it adds a layer of caching around them. The caching is tied to timeframes, so the cache knows when it needs to be refreshed based on changes in your data.

You can clear the cache for a specific function if you make changes to its implementation or if you want to free up memory.  There's also a way to completely flush all cached data for a function, essentially starting fresh.  Finally, you can clear the cache for just the current scenario, leaving the cached data for other scenarios intact.

The `_getInstance` property handles the internal details of creating and managing these caches, and it's not something you'll typically need to interact with directly.

## Class BreakevenUtils

The BreakevenUtils class is designed to help you understand and analyze breakeven events within your backtesting or live trading environment. Think of it as a tool to gather and present information about when your strategies hit breakeven points.

It provides a straightforward way to access key statistics related to breakeven occurrences, like the total number of times a strategy has reached breakeven. 

You can also use it to create detailed reports in Markdown format. These reports will present your breakeven events in a clear, tabular view, showing things like the symbol traded, the strategy used, the entry price, the current price, and the timestamp.

Finally, this class simplifies the process of saving these reports directly to files, allowing for easy archiving and sharing of your breakeven analysis. It handles creating the necessary directories and ensuring the files are saved correctly.

## Class BreakevenMarkdownService

The BreakevenMarkdownService helps you create and save reports detailing when your trading strategies break even. It listens for "breakeven" events—moments when a trade reaches its initial cost—and keeps track of these events for each symbol and strategy you're using. 

This service organizes these events into easy-to-read markdown tables, providing a clear overview of your trading performance. You can generate reports focusing on specific symbols, strategies, exchanges, timeframes, and backtest scenarios.  It also calculates overall statistics, like the total number of break-even events.

Reports are automatically saved to your disk, neatly organized within a `dump/breakeven` directory. The service handles the creation of this directory if it doesn't already exist. You can clear out the collected data when it's no longer needed, either for a specific strategy combination or everything at once. 

Initialization happens automatically the first time you use it, subscribing to the necessary event stream. Importantly, you don't have to worry about manually subscribing or unsubscribing.

## Class BreakevenGlobalService

This service acts as a central hub for tracking breakeven points within the trading system. Think of it as a middleman – it receives requests related to breakeven calculations and forwards them to another service that handles the actual work. 

It's designed to be easily integrated into the trading strategies through dependency injection, ensuring a consistent way to manage breakeven data across the system.

Crucially, it provides logging for all breakeven operations, allowing for easy monitoring and troubleshooting.  It has several supporting services to validate the configuration before any calculations occur, preventing errors.

The `check` function determines if a breakeven should be triggered and performs the necessary actions, while `clear` resets the breakeven state when a signal is closed.  These functions log activity before passing the work to the connection service.

## Class BreakevenConnectionService

This service helps keep track of breakeven points for your trading strategies. It's designed to efficiently manage and reuse breakeven calculations, avoiding unnecessary work.

Essentially, it creates and stores a special object (called `ClientBreakeven`) for each unique trading signal, making sure you don't recreate them repeatedly.  These objects are cached for quick access, and cleaned up automatically when signals are finished.

The service acts like a central hub, handling the creation, maintenance, and cleanup of these breakeven objects, and letting other parts of the system know when changes happen. You'll find it working alongside other services like `BreakevenGlobalService` and using the `loggerService` to keep things running smoothly. It also provides methods to check if a breakeven is reached and to clear the breakeven state when a trade closes.


## Class BacktestUtils

This class, `BacktestUtils`, is your central hub for running and managing backtests within the trading framework. Think of it as a helper to simplify the backtesting process. It's designed to be used everywhere you need it, and there's only ever one version of it running.

To start a backtest, use the `run` method. It takes the symbol (like BTCUSD) and context (strategy name, exchange, and timeframe) to execute the test and provides results as it runs.  Alternatively, if you just want to run a backtest in the background for things like logging or callbacks without needing to see the results step-by-step, you can use `background`.

You can check what signals the strategy is currently waiting on with `getPendingSignal` or what signals are scheduled to be triggered later using `getScheduledSignal`.  `getBreakeven` tells you if a signal has reached a point where it's safe to move the stop-loss.

Need to pause a strategy? `stop` halts signal generation.  `cancel` removes a specific scheduled signal without impacting ongoing tests.  You can also manipulate pending orders with `partialProfit` (close a portion for profit) and `partialLoss` (close a portion to limit losses).

For fine-tuning, `trailingStop` and `trailingTake` adjust stop-loss and take-profit distances respectively, always relative to the original settings to prevent errors. There’s also a `breakeven` function to automatically adjust stop-loss based on profitability.

Finally, `getData` gives you overall statistics, `getReport` generates a markdown report, `dump` saves the report to a file, and `list` shows you a rundown of all the backtests that are currently running.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save detailed reports about your backtesting results. It listens for signals generated during backtests and keeps track of how each strategy performs.

Think of it as a recorder that meticulously logs every trade and then neatly organizes that information into readable markdown tables. These tables give you a clear picture of your strategy's performance, including signal details.

The service automatically saves these reports to a specific folder in your logs directory, making it easy to review and analyze your backtesting experiments.  You can customize what data is included in the reports, or clear out the recorded data when you're done. It handles the storage of data efficiently, ensuring each backtest combination has its own isolated record. The service initializes automatically, so you're ready to start generating reports right away.

## Class BacktestLogicPublicService

This service acts as a central coordinator for backtesting, simplifying the process by handling background details. It essentially makes backtesting easier by automatically managing context information – things like the strategy name, exchange, and frame – so you don't have to pass them around explicitly in your code. 

Think of it as a wrapper around the core backtesting logic, adding a layer of convenience.

The `run` method is the primary way to initiate a backtest. It takes a symbol (like a stock ticker) and automatically provides the necessary context to the backtesting engine, then streams back the results as a series of data points.


## Class BacktestLogicPrivateService

This service manages the complex process of running a backtest, breaking it down into manageable steps. It works by first getting a list of timeframes from a separate service, then systematically processing each timeframe. When a trading signal appears, it requests the necessary historical data (candles) and executes the backtesting logic.  Instead of storing all the results in memory, it streams them out as an asynchronous generator, which is a memory-efficient way to handle large datasets. Importantly, the backtest can be stopped early by interrupting the generator, giving you flexibility and control over the process.  The service relies on other core services for logging, strategy execution, exchange data, timeframes, and method context. The `run` method is the main entry point, taking a symbol as input and returning the async generator that yields backtest results.


## Class BacktestCommandService

This service acts as a central point for kicking off backtesting processes within the system. Think of it as the main doorway to running simulations. It’s designed to be easily used with dependency injection, making it simple to plug into different parts of the application. 

It bundles together several other services – dealing with things like logging, strategy validation, risk assessment, and the actual backtest logic itself.

The main thing you'll use is the `run` method.  It lets you tell the system which asset you want to backtest (identified by its symbol) and provides important details about the strategy, exchange, and data frame you want to use during the simulation.  The `run` method returns a series of results, allowing you to examine the backtest as it progresses.
