---
title: private/internals
group: private
---

# backtest-kit api reference

![schema](../assets/uml.svg)

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

The Walker Validation Service helps you keep track of and confirm your walker configurations, which are used for things like optimizing trading strategies and tuning parameters. It's like a central control panel for ensuring your walkers are set up correctly before you start running tests.

You can register new walkers using `addWalker`, and before using a walker, it's a good idea to `validate` that it exists – this service double-checks for you. To see all the walkers you’ve registered, use `list`. The service also cleverly remembers its validation results to speed things up.

## Class WalkerUtils

WalkerUtils provides helpful tools for working with walkers, which are essentially sets of trading strategies. It simplifies the process of running and managing these walkers, automatically handling details like identifying the specific exchange and walker name.

You can think of WalkerUtils as a central place to interact with your walkers, offering convenient functions. The `run` method lets you execute a walker and receive its results step-by-step. If you just want a walker to perform actions in the background, like logging or triggering callbacks, use `background`. 

Need to pause a walker's signal generation? The `stop` method gracefully halts the strategies within a walker, ensuring ongoing signals finish before stopping completely.

For retrieving results, `getData` pulls together data from all the strategies within a walker, while `getReport` generates a nicely formatted markdown report summarizing the walker’s performance.  You can even save this report directly to a file using `dump`. Finally, `list` gives you an overview of all the walkers currently running and their status. 

WalkerUtils is designed to be easily accessible, making it a great resource for managing and analyzing your trading strategies.

## Class WalkerSchemaService

The WalkerSchemaService helps keep track of different trading strategies, or "walkers," and their configurations in a structured and organized way. It uses a special system to ensure that the information for each walker is consistent and follows a defined format.

You can add new walker configurations using `addWalker()`, and then easily find them again later by their names. If you need to make small adjustments to an existing walker's settings, you can use the `override()` function to update just the parts you need to change. There's also a built-in check (`validateShallow`) that makes sure each walker’s configuration looks right before it’s officially registered, helping prevent errors down the road. Essentially, it's a central place to manage and ensure the quality of your trading strategy definitions.

## Class WalkerMarkdownService

This service is designed to automatically create and save reports about your backtesting strategies. It listens for updates from your walkers, which are essentially your trading simulations, and keeps track of how each strategy performs. 

The service gathers data and then generates nicely formatted markdown tables that allow you to easily compare different strategies. These reports are saved as files, making it simple to review and analyze your trading results. 

You don't have to manually start the reporting process; it’s designed to work automatically as your walkers run, ensuring you have a record of their performance. You also have the option to clear out older data when it's no longer needed. The whole process is designed to be simple and reliable, so you can focus on improving your strategies.

## Class WalkerLogicPublicService

This service acts as a friendly interface for coordinating and running walker processes. It simplifies things by automatically passing important information like the strategy name, exchange, frame, and walker name along with each request. Think of it as a helper that makes sure everything needed for a walker to function correctly is readily available.

It relies on two other internal services to do its work. It provides a `run` method which takes a symbol and context information to execute walker comparisons, essentially driving the backtesting process for all strategies. It handles the details of sending requests and managing the context, so you don't have to worry about it.


## Class WalkerLogicPrivateService

This service helps you compare different trading strategies against each other. It orchestrates the process of running each strategy and keeps track of how they're performing.

Essentially, it takes a symbol, a list of strategies you want to compare, a metric to evaluate them by (like profit or Sharpe ratio), and some context information. Then, it runs each strategy one after another, providing you with updates as each completes. 

You'll get a running tally of which strategy is looking best, and at the end, a ranked list of all strategies based on your chosen metric. It does this by using another service to actually run the backtests for each strategy.

## Class WalkerCommandService

WalkerCommandService acts as a central point for accessing various walker-related functions within the system. Think of it as a helper that simplifies using the core walker logic, making it easier to manage dependencies.

It bundles together several key services, including those responsible for logic, schema management, validation, and risk assessment. 

The `run` method is particularly important; it lets you execute a comparison of a walker for a specific trading symbol. When you run this method, you provide information about the walker's name, the exchange it's using, and the frame it operates within, ensuring the correct setup for the comparison. The result of the run is an asynchronous generator, allowing you to process the comparison results step-by-step.

## Class StrategyValidationService

The StrategyValidationService helps you keep track of your trading strategies and make sure they're set up correctly. It acts like a central manager, storing information about each strategy you’re using.

You can add new strategies using `addStrategy()`, which registers them with the service.  Before you start using a strategy, you can use `validate()` to confirm that it exists and its associated risk profile is valid – this prevents errors down the line.

The service remembers the results of these validations, so it doesn't have to re-check things repeatedly, which makes things faster.  If you need to see all the strategies you’ve registered, `list()` gives you a handy overview. Think of it as a helpful assistant ensuring your strategies are ready to go.

## Class StrategySchemaService

This service helps you keep track of the blueprints for your trading strategies. Think of it as a central place to store and manage how your strategies are structured. 

It uses a special system to ensure everything is typed correctly, preventing errors down the line. 

You can add new strategy blueprints using `addStrategy()`, and then easily find them again by their name.  If you need to make small adjustments to an existing blueprint, you can use `override()` to update it. The `validateShallow()` function checks that your new blueprints have all the necessary pieces before they’re added.  Finally, `get()` lets you retrieve a specific strategy blueprint when you need it.

## Class StrategyCoreService

StrategyCoreService acts as a central hub for managing and executing trading strategies within the backtest-kit framework. It combines several other services to ensure strategies have the necessary information, like the trading symbol and time, before they run. Think of it as a coordinator that makes sure everything is set up correctly for a strategy to do its job.

It keeps track of previously validated strategies to avoid unnecessary checks, and logs those validation activities for transparency. You can use it to quickly check if a strategy has a pending signal, or to see if it’s been stopped.

The `tick` and `backtest` methods are your go-to tools for running strategies, taking in candle data and time information to simulate trading. The `stop` method provides a way to halt a strategy from producing new signals, while `clear` is useful for forcing a strategy to re-initialize.


## Class StrategyConnectionService

The `StrategyConnectionService` acts as a central hub for managing and routing requests to your trading strategies. It intelligently connects specific trading symbols to their corresponding strategy implementations, ensuring the correct strategy handles data for each symbol. To improve performance, it keeps a record of these strategy instances, avoiding unnecessary re-creation.

Before you can use a strategy, it needs to be initialized, and this service handles that process. You can then use it to run live trades with the `tick()` function, which processes incoming market data, or perform historical backtesting using the `backtest()` function, which analyzes past data to evaluate strategy performance.

Need to pause a strategy? The `stop()` function allows you to halt a strategy from generating new signals.  If you want to force a strategy to re-initialize, or release resources, you can use `clear()`. The service also provides access to information like the current pending signal and whether a strategy is stopped, providing valuable monitoring capabilities.

## Class SizingValidationService

This service helps you keep track of your position sizing strategies and makes sure they're set up correctly. Think of it as a central place to manage how you determine the size of your trades. 

You can register new sizing strategies using `addSizing`, providing a name and the details of the strategy. Before you actually use a sizing strategy, `validate` confirms it exists, preventing errors. To speed things up, the service remembers the results of validations. Finally, `list` gives you a complete overview of all the sizing strategies you've registered.

## Class SizingSchemaService

This service helps you organize and manage your sizing schemas, which are essentially blueprints for how much to trade. It uses a special system to keep track of these schemas in a way that avoids errors thanks to TypeScript. 

You add new sizing schemas using the `register` method, and you can update existing ones with `override`.  If you need to use a sizing schema in your backtesting, you simply grab it by name with `get`.  Before a sizing schema is added, it's quickly checked to make sure it has all the necessary parts using a process called "shallow validation." This ensures consistency and helps prevent problems later on.

## Class SizingGlobalService

The SizingGlobalService is a central component for determining how much to trade in each operation. Think of it as the brain behind position sizing within the backtest-kit framework. It works closely with other services – a connection service for getting size information and a validation service to ensure the sizing is correct – to perform its calculations.

You'll primarily interact with it through the `calculate` method, which takes risk parameters and some context information to figure out the appropriate position size. This service is vital for strategies to manage risk effectively.


## Class SizingConnectionService

The SizingConnectionService helps manage how position sizes are calculated within your backtesting strategies. It acts as a central point, directing sizing requests to the correct sizing method based on a name you provide. 

To improve performance, it remembers (caches) the sizing methods it's already used, so it doesn’t have to recreate them every time.

You can think of it as a dispatcher – you tell it which sizing method you want to use (like "fixed-percentage" or "kelly-criterion"), and it handles the rest. The `calculate` method is what you'll use to actually determine the position size, taking into account your risk parameters and the chosen sizing method. If a strategy doesn't have a custom sizing configuration, the sizing name will be an empty string.

## Class ScheduleUtils

ScheduleUtils helps you keep track of and understand how your scheduled trading signals are performing. It's like a central hub for monitoring and reporting on signals that are waiting to be executed. 

Think of it as a tool to see how signals are queued up, whether any are being cancelled, and how long they’re waiting. You can ask it for data about a specific trading symbol and strategy to understand its performance.

It can also create easy-to-read markdown reports that summarize the activity of scheduled signals, and even save those reports directly to a file. It’s designed to be simple to use, always available as a single, ready-to-go instance.

## Class ScheduleMarkdownService

This service helps you track and report on scheduled signals for your trading strategies. It keeps an eye on when signals are scheduled and cancelled, organizing the information separately for each strategy you're using. 

It generates easy-to-read markdown reports detailing these events, along with useful statistics like cancellation rates and average wait times. These reports are automatically saved as files in your logs directory.

The service automatically connects to the signal events, so you don’t have to worry about setting that up. You can also clear out the stored data if needed, either for a specific strategy or everything at once. 

The service uses a system to ensure each symbol and strategy pair has its own dedicated storage space, keeping things organized. You can request specific data or reports on a per-strategy or per-symbol basis, and it handles creating the necessary directories for saving reports.

## Class RiskValidationService

This service helps you keep track of and double-check your risk management setups. Think of it as a central place to register different risk profiles – essentially, sets of rules and configurations – and make sure they're all accounted for before you start trading.

It’s designed to be efficient; once a risk profile is validated, the result is saved to avoid repeating the check.  You can add new risk profiles using `addRisk`, verify that a profile exists before using it with `validate`, or get a full list of all registered profiles through `list`. This makes managing your risk configurations easier and more reliable. The service also uses a logger to help you track what’s happening.

## Class RiskUtils

The RiskUtils class helps you understand and report on risk rejections within your trading system. Think of it as a tool to analyze why trades were rejected and how frequently.

It gathers information about rejections – including the symbol, strategy, position, price, and reason – and organizes it for easy analysis.

You can use it to:

*   Get statistical summaries of risk rejections, like total counts and breakdowns by symbol or strategy.
*   Generate clear, human-readable markdown reports detailing each rejection event, including a table of data and summary statistics.
*   Save those reports to files for later review or distribution.

The class pulls its data from a system that listens for risk events and stores rejection information, making it a convenient way to monitor and understand your risk management process.

## Class RiskSchemaService

This service helps you keep track of your risk schemas, ensuring they’re all structured correctly and consistently. It uses a special registry to store these schemas in a type-safe way. 

You can add new risk profiles using the `addRisk()` function (which is actually called `register` within the service) and retrieve them later by their assigned names using `get()`.  If you need to make small adjustments to an existing schema, `override()` lets you update specific parts of it. Before a schema is officially registered, `validateShallow()` performs a quick check to make sure it has all the essential pieces in place.

## Class RiskMarkdownService

This service helps you automatically generate reports detailing risk rejections in your backtesting framework. It keeps track of when and why trades are rejected, organizing the information by the trading symbol and strategy being used. 

It listens for risk rejection events, compiles them into easy-to-read markdown tables, and provides summary statistics like total rejections and breakdowns by symbol and strategy. These reports are saved as `.md` files, making them simple to view and analyze.

The service manages storage separately for each symbol-strategy combination, ensuring that data remains organized. It also has an automatic initialization process, so you don't have to worry about setting it up manually. You can clear the accumulated data if needed, either for a specific symbol-strategy or globally.

## Class RiskGlobalService

This service manages risk-related operations, acting as a central point for validating and tracking trading signals against predefined risk limits. It works closely with a connection service to interact with the risk management system.

The service keeps a record of open trading signals, using this information to ensure trades adhere to established risk parameters. It automatically validates risk configurations to avoid unnecessary checks and keeps a log of validation activity. 

You can use it to confirm whether a signal is permissible based on risk rules, register new signals, or close existing ones with the risk management system. It also provides a way to clear all or specific risk data when needed.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks in your trading strategies. It intelligently directs risk-related operations to the correct risk management component based on a descriptive name you provide.  Think of it like a dispatcher – you tell it which "type" of risk to handle, and it takes care of the rest.

To improve performance, it remembers previously used risk management components, so it doesn't have to recreate them every time.

The service provides methods for validating signals against risk limits, registering new signals, and closing out existing ones. You can even clear the cache of previously used risk components if needed.  Strategies that don’t have specific risk configurations will use an empty string for the risk name.

## Class PositionSizeUtils

This class offers helpful tools for determining how much of an asset to trade in a backtest, making sure your position sizes are calculated correctly. It provides pre-built functions for several common sizing strategies, like using a fixed percentage of your account, the Kelly Criterion (a more advanced method aiming for optimal growth), and basing the size on the Average True Range (ATR) to account for volatility. Each function checks to make sure the information you provide is appropriate for the sizing method you've chosen. 

Essentially, this class simplifies the process of figuring out the right position size and helps prevent errors in your trading simulations.

Here’s a breakdown of the specific sizing methods available:

*   **fixedPercentage:** Calculates position size based on a set percentage of your account balance.
*   **kellyCriterion:** Uses the Kelly Criterion formula, requiring win rate and win/loss ratio data, to determine an optimal position size.
*   **atrBased:** Calculates position size considering the Average True Range, providing a way to adjust to market volatility.

## Class PersistSignalUtils

The `PersistSignalUtils` class helps manage how trading signals are saved and restored, particularly when a trading strategy is running live. Think of it as a keeper of your strategy's signal history. 

It's designed to be reliable, making sure that even if your system crashes, your signal data isn't lost or corrupted.  It does this by saving signal information to disk in a safe and consistent way.

The class automatically handles creating the storage for signals, and lets you customize *how* those signals are stored if you want to use a different method.

You can retrieve existing signal data using `readSignalData`, which looks up a signal based on the symbol and strategy name.  Conversely, `writeSignalData` is used to save new or updated signals, employing a technique called "atomic writes" to ensure data integrity. Finally, `usePersistSignalAdapter` allows you to plug in your own specialized storage mechanisms.

## Class PersistScheduleUtils

This class, PersistScheduleUtils, helps manage how your trading strategy's scheduled signals are saved and loaded, ensuring they don't get lost if something goes wrong. Think of it as a reliable memory for your strategy's plans.

It intelligently handles storing these signals separately for each strategy you're using, and it’s designed to work with different ways of storing data – you can even plug in your own custom storage methods.

The `readScheduleData` method fetches previously saved signal information, allowing your strategy to pick up where it left off, while `writeScheduleData` securely saves the current signal state. It's built to protect against data corruption by using atomic operations.

Finally, `usePersistScheduleAdapter` lets you customize exactly how the data is stored, giving you flexibility in how your strategy's scheduled signals are managed.

## Class PersistRiskUtils

This class, PersistRiskUtils, helps manage and save information about your active trading positions, specifically for different risk profiles. It's designed to keep things reliable, even if your system crashes.

Think of it as a safe place to store your position data, ensuring it's always up-to-date. It uses a clever system to avoid conflicts when multiple parts of your application are trying to access the same data.

You can customize how this data is stored, and it’s used by ClientRisk to load and save your active position state. The `readPositionData` method retrieves the saved positions, while `writePositionData` securely updates them. There’s also a way to plug in your own custom storage mechanisms using `usePersistRiskAdapter`.

## Class PersistPartialUtils

This class, PersistPartialUtils, helps keep track of your profit and loss levels, especially when things get tricky like a sudden system crash. It’s designed to work with the ClientPartial component to reliably save and restore this information.

Think of it as a safe deposit box for your trading data. It stores partial profit/loss information for each trading symbol, and it does so in a way that's crash-resistant.

It remembers where it stores data, so you don’t have to worry about re-finding it.

You can even customize how it saves data by plugging in your own storage adapter.

The `readPartialData` method fetches any previously saved profit/loss information for a specific symbol, giving you a head start when you restart.  If there’s no existing data, it simply returns nothing.

The `writePartialData` method is responsible for saving changes to your profit/loss levels, making sure the process is done safely and securely with atomic file writes, so data isn’t corrupted. 

Finally, `usePersistPartialAdapter` lets you use a different method to store and retrieve partial data, tailoring the system to your specific needs.

## Class PerformanceMarkdownService

The PerformanceMarkdownService helps you understand how your trading strategies are performing over time. It gathers performance data, organizes it by symbol and strategy, and then calculates key statistics like average returns, minimum returns, and percentiles.

This service creates separate storage areas for each combination of symbol and strategy, ensuring that the data remains isolated and organized. 

You can use it to generate clear, readable reports in Markdown format, which are saved to your logs directory. These reports provide a handy breakdown of performance and can even help pinpoint bottlenecks in your strategies. 

There's also a way to easily clear out the accumulated performance data when it's no longer needed. The service initializes itself when it starts up, but only does so once to avoid any issues.


## Class Performance

The Performance class helps you understand how your trading strategies are doing. It provides tools to gather and analyze performance data, making it easier to spot areas for improvement. 

You can use it to retrieve detailed statistics, such as the average execution time and volatility, for specific trading strategies and symbols. 

It also lets you create readable markdown reports that visualize performance, highlighting potential bottlenecks and providing a clear overview of your strategy’s behavior. You can even save these reports directly to your computer for later review and sharing.

## Class PartialUtils

This class is designed to help you analyze and understand your partial profit and loss data within the backtest-kit framework. Think of it as a tool to extract meaningful information and present it clearly.

It gathers data related to partial profits and losses, storing a limited history of events – up to 250 for each symbol and strategy combination.  You can use this class to get summary statistics, like total profit/loss counts, or to create detailed reports showing individual events.

The `getData` method lets you retrieve these overall statistics. The `getReport` method generates a well-formatted markdown document detailing all the partial profit/loss events for a specific symbol and strategy, presenting them in a table with essential information like action, symbol, signal ID, and price. Finally, the `dump` method takes that report and saves it as a markdown file, automatically creating the necessary directory if it doesn't exist – making it easy to share or review your results.

## Class PartialMarkdownService

This service helps you track and report on your partial profits and losses in a clear, organized way. It listens for events related to profits and losses and keeps a running tally for each symbol and strategy you're using.

The service automatically creates markdown reports detailing each event, including key information, and saves these reports to your computer.  You can also request statistics like the total number of profit and loss events recorded.

To use it, you don't need to manually initialize anything – it sets itself up automatically when you first start using it. It organizes data for each symbol-strategy combination separately, ensuring a clean and isolated view of performance. You have the option to clear this data when needed, either for a specific combination or all at once.

## Class PartialGlobalService

This service acts as a central hub for managing and tracking partial profits and losses within your trading strategies. Think of it as a layer that sits between your strategy logic and the underlying connection service that actually handles the details of partial tracking. It’s designed to be injected into your strategy, simplifying how you manage partials and providing a clear point for monitoring activity.

The main purpose is to provide a single entry point for managing partials, allowing for centralized logging to easily monitor what’s happening. It delegates the actual processing to a connection service while adding logging for global oversight.

Several services are injected into this component, including a logger, a connection service, and validation services to ensure your strategy and associated risk configurations are valid. You'll find methods for recording profits, losses, and clearing the partial state, all with associated logging before the work is passed on.


## Class PartialConnectionService

The PartialConnectionService helps track profit and loss for individual trading signals. It’s designed to manage and reuse data related to each signal, preventing unnecessary creation of objects.

Think of it as a central place to get and manage "ClientPartial" objects, which hold the details about a signal's profit and loss. It keeps track of these objects, reusing them whenever possible.

Whenever a profit or loss occurs, this service handles the details, making sure the information is recorded and events are triggered. When a signal is closed, it cleans up any associated data to keep things efficient. This service works closely with the overall trading strategy, making sure profit and loss calculations are accurate and well-managed.

## Class OutlineMarkdownService

The OutlineMarkdownService is designed to help you keep track of how your AI-powered trading strategies are working. It automatically creates a neatly organized folder structure to store important details from your strategy's conversations and results. 

Think of it as a digital diary for your AI – it saves the initial instructions given to the AI (the system prompt), each question you ask (user messages), and the AI's final answer along with the trading signal it produces. 

This service uses a logger to handle the writing of these files, and you don’t have to worry about accidentally deleting old records; it only creates files if the directory doesn't already exist. The generated markdown files are named to clearly indicate their content and order within the conversation. 


## Class OptimizerValidationService

This service helps keep track of your optimizers, ensuring they're properly registered and available for use. Think of it as a central registry for all your trading optimizers.

It lets you add new optimizers, making sure you don't accidentally register the same one twice.  You can also quickly check if an optimizer exists, and the system is smart about remembering those checks so it doesn't have to repeat the work.

If you need a complete list of all registered optimizers, it provides a simple way to retrieve that information.  Essentially, it’s designed to manage and validate your optimizers effectively.

## Class OptimizerUtils

OptimizerUtils offers helpful tools for working with and exporting your trading strategies. It allows you to retrieve previously generated strategy data, create complete code files ready to run, and easily save those code files to your desired location. 

You can use `getData` to gather information about your strategies, including details from different training periods.  `getCode` constructs the full code necessary for your strategy, bundling everything together. Finally, `dump` automates the process of creating and saving these strategy code files, organizing them neatly with a standardized naming convention.

## Class OptimizerTemplateService

This service acts as a central engine for creating the code snippets needed to run and optimize trading strategies. It's designed to work seamlessly with the Ollama LLM, allowing you to generate code that incorporates sophisticated analysis and trading logic.

It can handle a range of tasks, from setting up the basic exchange connection (like Binance) and defining timeframes (like 1-minute, 5-minute intervals) to crafting the core strategy configuration and generating signals. The generated code is structured, using JSON for signals and providing debug logging for troubleshooting.

You have the flexibility to customize certain aspects of the code generation process through configuration, allowing it to adapt to your specific needs. It can even generate code to compare different strategies, a process known as "walking."  The service also provides convenient helper functions for generating text and JSON output from the LLM, and for saving debugging information. The signals are structured with fields for position, note, price levels, and estimated time.

## Class OptimizerSchemaService

The OptimizerSchemaService helps you keep track of and manage different configurations for your optimizers. Think of it as a central place to store and organize how your optimizers are set up. 

It ensures that new optimizer configurations are properly validated before they're added, making sure they have all the necessary information. You can register new schemas, retrieve existing ones by name, and even update existing schemas with new information. 

Under the hood, it uses a registry to store these schemas, and it also provides a way to do a quick check of the basic structure of a schema. The service is designed to be reliable and consistent in how it handles optimizer configurations.

## Class OptimizerGlobalService

This service acts as a central point for working with optimizers, ensuring everything is validated before proceeding. It handles logging operations and checks to make sure the optimizer you're trying to use actually exists. 

Think of it as a gatekeeper for optimizer interactions.

It provides methods for retrieving data related to your optimizers, generating the complete code for them, and saving that code to a file. The `getData` method pulls together information from various sources to create strategy metadata. The `getCode` method constructs the full strategy code.  Finally, the `dump` method simplifies the process of creating and saving your strategy code to a file, again with the necessary validation checks in place.


## Class OptimizerConnectionService

The OptimizerConnectionService helps you easily work with optimizers in your backtesting system. It's designed to manage and reuse optimizer connections efficiently, preventing unnecessary overhead.

Think of it as a central hub for getting optimizer instances. It keeps a record of these instances, so it can quickly provide them when you need them again – this is called memoization and speeds things up considerably.

When you request an optimizer, it combines any custom templates you provide with default templates to create the final configuration.  It also allows you to inject a logger for tracking what’s happening.

You can use the `getOptimizer` function to retrieve an optimizer, `getData` to pull strategy metadata, `getCode` to generate the actual code, and `dump` to save the generated code to a file. This service simplifies the process of interacting with and using optimizers within your backtesting framework.


## Class LoggerService

The LoggerService helps standardize logging across your backtesting framework. It provides a consistent way to record events, automatically adding helpful details like which strategy, exchange, and timeframe the log relates to, as well as information about the asset being traded and the time of the action. If you don't configure a custom logger, it falls back to a "no-op" logger that essentially does nothing.

You can customize the logging behavior by setting your own logger implementation. The service includes properties to manage context information and a core `log` method that can be used for different severity levels like debug, info, and warn. This ensures your logs are informative and easy to understand.

## Class LiveUtils

LiveUtils helps you manage live trading operations with a focus on ease of use and reliability. It's designed as a central hub for running strategies in real-time and provides tools for monitoring and controlling them.

Think of it as a convenient way to kick off live trading sessions and keep them running smoothly. The `run` function is the core – it starts an infinite, automated process that continuously generates trading signals.  If things go wrong and the process crashes, it’s designed to automatically recover from any saved state.

You can also run strategies in the background using `background`, which is perfect if you just want to trigger actions or save data without needing to see the trading results directly.  Need to pause trading? The `stop` function gracefully halts the generation of new signals while allowing existing ones to complete.

Beyond just running, LiveUtils gives you ways to check in on how things are going. You can get statistics (`getData`), generate reports (`getReport` and `dump`), and even see a list of all active live trading instances (`list`) along with their current status. This makes it easy to keep track of what’s happening and troubleshoot any issues.

## Class LiveMarkdownService

The LiveMarkdownService helps you automatically create and save detailed reports of your live trading activity. It keeps track of every event – like when a strategy is idle, when a trade is opened or closed – and organizes them neatly into markdown tables.

You’ll find these reports saved in the logs/live/ directory, with a separate file for each strategy.  The service automatically gathers data and calculates key trading statistics like win rate and average profit.

Behind the scenes, it uses a specialized storage system to isolate data for each symbol and strategy combination. You don't need to worry about manually setting anything up; the service initializes itself automatically when you start using it.

The `tick` property is how the service receives updates, and you'll connect it to your strategy’s `onTick` callback. If you want to see just a portion of the data, you can specify which columns to include in the report. There’s also a `clear` function to easily wipe out accumulated data, either for a specific strategy or everything at once.

## Class LiveLogicPublicService

This service helps manage live trading sessions, making them easier to work with by automatically handling important details like the trading strategy and exchange being used. It essentially acts as a helper layer on top of another service, so you don't have to keep passing those details around every time you need to fetch data or generate signals.

Think of it as an ongoing stream of trading information - it runs indefinitely, constantly providing updates on what’s happening.  If something goes wrong and the process crashes, it can recover and pick up where it left off.

To start a live trading session, you simply tell it which symbol to trade and provide the strategy and exchange names. It then continuously generates results, blending real-time data with a mechanism for resilience in case of interruptions.

## Class LiveLogicPrivateService

This service helps automate live trading by continuously monitoring a symbol and reacting to signals. Think of it as a tireless worker that constantly checks for trading opportunities.

It operates in a loop, regularly checking the status of your trading signals and producing results. Importantly, it only reports when a trade is actually opened or closed, not when things are just running normally.

The process is designed to be efficient, streaming results to you without consuming excessive memory. It’s also built to be resilient; if something goes wrong, it can automatically recover and pick up where it left off.

You initiate the process using the `run` method, specifying the trading symbol you want to monitor. The `run` method returns an infinite generator, continuously providing updates as new trades are executed.

## Class LiveCommandService

This service acts as a central point for accessing live trading features within the backtest-kit framework. Think of it as a convenient helper, especially useful if you're injecting dependencies into your code. It bundles together several other services, including those for logging, validating strategies and exchanges, and handling schema information, as well as managing risk. 

The main function, `run`, is the core of this service. It kicks off the live trading process for a specific trading symbol, sending it information about the strategy and exchange you’re using. It continuously generates trading results – essentially giving you a stream of data as the live trading unfolds, with automatic recovery if things go wrong.

## Class HeatUtils

HeatUtils helps you visualize and analyze your trading strategy's performance using heatmaps. Think of it as a tool to quickly understand how different assets are contributing to your strategy's overall results. It gathers statistics across all your symbols within a strategy, making it easy to see which ones are performing well and which ones might need attention.

You can use it to:

*   **Retrieve Data:**  Get a detailed breakdown of your portfolio's performance – seeing things like total profit, Sharpe Ratio, and maximum drawdown for each individual asset within a strategy.
*   **Generate Reports:** Create easy-to-read markdown reports that present your portfolio’s heatmap in a nicely formatted table, sorted by profit.
*   **Save Reports:**  Automatically save these reports to a file on your computer, so you can keep track of your strategy's progress over time. 

This utility provides a simple way to access this information and is available as a single, readily accessible instance in your backtest kit.

## Class HeatMarkdownService

The Heatmap Service helps you visualize and understand how your trading strategies are performing by creating a portfolio-wide heatmap. It gathers data from closed trades, calculating key metrics like profit/loss, Sharpe Ratio, and maximum drawdown for both individual assets and your overall portfolio. 

Think of it as a tool that automatically builds reports, displayed in a readable markdown table, showing you the health of each strategy and the assets they trade. It's designed to be easy to use, handling potential errors gracefully and remembering data for each strategy separately. 

The service essentially listens for trading signals, collects the results, and then provides you with clear, organized reports. It handles the behind-the-scenes work of collecting and organizing data, allowing you to focus on interpreting the results and optimizing your strategies. You can even save these reports as markdown files for later review or sharing. It sets itself up automatically when you first use it, so there's no manual configuration required.

## Class FrameValidationService

This service helps you keep track of your trading timeframes and make sure they're set up correctly. Think of it as a central place to register all your different timeframe configurations, like daily, hourly, or weekly charts.

Before you start trading or analyzing data based on a specific timeframe, you can use this service to confirm it's been properly registered. It remembers which timeframes you've added, and it even keeps a record of whether they're valid so it doesn't have to check every time.

You can add new timeframes using `addFrame`, check if a timeframe exists with `validate`, and get a complete list of all your registered timeframes with `list`. This helps prevent errors and ensures your backtesting and trading strategies are running on the correct and valid timeframes.

## Class FrameSchemaService

This service acts as a central place to store and manage the blueprints, or schemas, that define how trading frames are structured. It uses a special type of storage to keep things organized and prevent errors. You can think of it like registering a new type of trading strategy – you give it a name, and the service remembers its details. 

If a schema already exists, you can update parts of it instead of replacing the entire thing. The service also checks new schemas to make sure they have the basic information they need before allowing them to be used.  You’ll use it to add, update, and retrieve these frame schemas by their assigned names.


## Class FrameCoreService

FrameCoreService helps manage the timeline of your backtesting process. It works behind the scenes to generate the dates and times your strategies will be evaluated against. Think of it as the engine that provides the historical data window for your backtest. 

It relies on other services like FrameConnectionService for actually getting the data and a validation service to ensure things are working correctly. 

The key function, `getTimeframe`, is what you’ll indirectly benefit from – it creates an array of dates based on the symbol (like "BTCUSDT") and the timeframe you've selected (like "1h" for one-hour candles). This array defines the period your backtest will cover.


## Class FrameConnectionService

The `FrameConnectionService` acts as a central hub for managing and accessing different trading frames within the backtest environment. It intelligently routes requests to the correct frame implementation, automatically determining which frame to use based on the current method context. 

To improve performance, it remembers previously created frames, so it doesn’t have to recreate them every time you need them.  

The service also handles backtesting timeframes – it can give you the start and end dates for a particular symbol and frame, allowing you to focus your backtest on specific periods.  

When running in live mode, frames aren’t used, and the `frameName` will be empty.

It relies on other services like `loggerService`, `frameSchemaService` and `methodContextService` for logging, frame schema information and context respectively. 

The `getFrame` method is how you request a specific frame, and the `getTimeframe` method helps define the boundaries for your backtest.

## Class ExchangeValidationService

This service helps keep track of your trading exchanges and makes sure they're properly set up before you start trading. Think of it as a central place to register each exchange you're using, like Binance or Coinbase. 

It lets you add new exchanges to its internal list, check if an exchange is valid before using it in your backtesting strategies, and quickly see a complete list of all the exchanges you’ve registered.  The system remembers previous validation checks to speed things up too. You can use it to make sure your backtest configurations are solid and avoid errors caused by misconfigured exchanges.

## Class ExchangeSchemaService

The ExchangeSchemaService helps you keep track of the different exchange configurations your trading system uses. It’s like a central library where you store and manage these configurations.

It uses a special system to ensure the configurations are correctly typed and structured, minimizing errors.

You can add new exchange configurations using `addExchange()`, and easily find existing ones by their names. If a configuration already exists, you can update parts of it using `override()`.  Before adding a new configuration, the system quickly checks if it has all the necessary components with `validateShallow()` to prevent issues later on.  Finally, the `get()` function allows you to retrieve a specific exchange configuration when you need it.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for interacting with exchanges, ensuring that important information like the trading symbol, time, and backtest settings are always considered. It combines the functionality of connection management and context awareness.

Inside, it keeps track of various services like logging, exchange connections, and validation.  It caches validation results to speed things up and logs what it’s doing.

You can use it to retrieve historical price data (candles), simulate fetching data from the future during backtesting, calculate average prices, and format price and quantity values, all while providing the necessary context for accurate calculations and operations.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently directs your requests to the correct exchange based on the current context, streamlining your trading logic.

It keeps track of exchange connections, so it doesn't have to re-establish them repeatedly, which makes things faster and more efficient. 

You can use it to retrieve historical price data (candles), get the latest average price, and format prices and quantities to adhere to the specific rules of each exchange. The service handles the complexities of working with various exchanges, allowing you to focus on your trading strategies.

## Class ConstantUtils

This class provides a set of pre-calculated values to help manage your take-profit and stop-loss levels, all based on a Kelly Criterion formula designed to gradually reduce risk. Think of these values as checkpoints along the way to your ultimate profit or loss target.

For example, if your goal is a 10% profit, `TP_LEVEL1` (set at 30) means the first take-profit trigger will occur when the price reaches 3% of that target, allowing you to lock in some early gains. `TP_LEVEL2` and `TP_LEVEL3` follow suit, capturing more profit as the price moves further.

Similarly, `SL_LEVEL1` and `SL_LEVEL2` offer protection by triggering stop-losses at different points, reducing your potential losses if the market moves against you. These levels are designed to create a layered approach to risk management.


## Class ConfigValidationService

This service acts as a safety net for your trading configurations, making sure they're mathematically sound and have a chance of being profitable. It digs deep into your settings, specifically looking at percentages like slippage and fees to confirm they're reasonable (non-negative). 

It also verifies the relationship between key parameters – for example, making sure your stop-loss distance makes sense relative to your take-profit distance. Beyond the basic math, the service checks that your configuration allows for enough profit to cover all trading expenses, including fees and slippage.

Finally, it looks at things like timeouts and retry counts to ensure they’re set to positive integer values, preventing unexpected behavior.  Essentially, it's a way to catch potential errors and ensure your strategy has a solid foundation. The `validate` function performs all these checks.

## Class ColumnValidationService

The ColumnValidationService helps keep your column configurations in good shape. It's designed to check your column definitions to make sure they follow the rules and don’t have any hidden problems. 

Think of it as a quality control system for your column setups. It verifies that each column has all the necessary pieces – a unique identifier (key), a descriptive name (label), a formatting method (format), and visibility settings (isVisible). It also ensures these keys are all distinct and that the format and visibility settings are actually functions, not just random data. Ultimately, this service helps prevent errors and inconsistencies in your data display. 

Here’s what it does:

*   Makes sure every column has the essentials: key, label, format, and isVisible.
*   Confirms that all ‘key’ values are unique so you don’t have any conflicts.
*   Checks that the `format` and `isVisible` settings are actually functions.
*   Verifies that the ‘key’ and ‘label’ are strings with content.

## Class ClientSizing

This component, called ClientSizing, helps determine how much of an asset to trade based on various strategies. It takes into account factors like a fixed percentage of your capital, Kelly Criterion principles, or Average True Range (ATR) to calculate position sizes. 

You can also set limits on the minimum and maximum positions you'll take, and restrict the maximum percentage of your capital used for any single trade. The ClientSizing component also allows you to add custom validation or logging steps to the sizing process, giving you more control and insight. Ultimately, it's used to figure out the right amount to buy or sell in each trade, based on the rules you define. 

The `calculate` method is the core function, doing the actual position size calculation based on input parameters.


## Class ClientRisk

ClientRisk helps manage the overall risk of your trading portfolio by setting limits and preventing strategies from taking actions that could exceed those limits. It's like a safety net for your strategies, ensuring they operate within defined boundaries.

This system tracks active positions across all your strategies, giving you a complete view of your portfolio's exposure. It uses a shared instance to enable analysis of risk across different strategies.

ClientRisk validates each trading signal before it's executed, checking against rules you've set, and can include custom validations tailored to your specific needs. It automatically handles the loading and saving of position data, ensuring that the risk checks are always based on the most up-to-date information.

You can register new signals as they open and remove them when they close, letting ClientRisk stay aware of what's happening in your portfolio in real-time. This process allows your strategies to execute safely, protecting you from potential losses.

## Class ClientOptimizer

The ClientOptimizer helps you manage and execute optimization processes. It's designed to gather information from various places, like different data sources, and then use that information to create and generate trading strategies. 

Think of it as a central hub that collects data, builds a history of interactions, and then pieces together the code for your strategies, ultimately allowing you to export this code to files. It receives progress updates and reports on its current state as it works.

It handles retrieving strategy data, generating the actual code for your trading strategy, and even saving that code to a file – creating any necessary folders along the way. This simplifies the process of building and deploying optimized trading strategies.

## Class ClientFrame

The `ClientFrame` is a core component responsible for creating the timelines your backtests use. Think of it as the engine that generates the sequence of dates and times your trading strategies will be tested against.  It cleverly avoids unnecessary work by remembering previously generated timelines, a technique called singleshot caching. You can customize the interval between these timestamps, ranging from one minute to three days.

It’s designed to be flexible, letting you add validation steps and log important events during the timeline generation process. The `ClientFrame` works closely with the backtesting logic to drive the historical analysis.

To get a timeframe, you call the `getTimeframe` function, providing the symbol you want to backtest.  This will return a promise that resolves to an array of dates, and it will store the result for future use.


## Class ClientExchange

This `ClientExchange` component helps your backtesting framework communicate with an exchange to get the data it needs. It's designed to be efficient in how it uses memory.

You can use it to retrieve historical price data, looking backward from a specific point in time.  It also allows you to fetch future price data, which is crucial for simulating trading scenarios.

It can calculate a Volume Weighted Average Price (VWAP) based on recent trading activity, which is useful for understanding price trends.  The number of candles considered for this calculation is determined by a global setting.

Finally, it takes care of formatting quantities and prices to match the specific rules of the exchange you're connected to, ensuring your orders look correct.

## Class BacktestUtils

This class, BacktestUtils, is your go-to helper for running backtests within the framework. Think of it as a convenient toolbox to manage your backtesting processes. It provides a simple way to execute backtests and track their progress.

You can start a backtest using the `run` method, which will give you a stream of results as it progresses.  For running tests in the background, like for logging or other side effects, use the `background` method.  It runs the test but doesn't show you the individual results.

If you need to halt a strategy's trading, the `stop` method gracefully pauses it. The `getData` function allows you to pull out the statistical results from completed backtests.  Need a nicely formatted report?  `getReport` generates a markdown document.  You can even save this report to a file with the `dump` method. Finally, `list` gives you a quick overview of all the backtests currently running and their status. A single instance of this utility class exists so that you can easily access these functionalities.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and store reports about your trading backtests. It listens for signal events during a backtest and keeps track of how each strategy performed on different symbols. 

Think of it as a record-keeper that organizes all the closed trades for each strategy you’re testing. It then transforms that data into nicely formatted markdown tables, which are easy to read and understand.

You can use this service to generate complete reports for a specific symbol and strategy, or clear out all the accumulated data when you're finished. The reports are saved as markdown files in your logs directory, making it simple to review your backtest results. The service automatically handles creating the necessary directories and ensures it only initializes once.

## Class BacktestLogicPublicService

This service helps manage and run backtesting processes, streamlining the workflow. It essentially acts as a middleman, automatically handling important context information like the strategy name, exchange, and timeframe. 

You don't need to repeatedly pass this context data to functions – the service takes care of it behind the scenes.

The `run` function is the core; it executes a backtest for a given asset and provides results as a stream of data. This makes it easier to analyze the backtest's performance over time.


## Class BacktestLogicPrivateService

This service handles the complex process of backtesting a trading strategy. It works by first gathering timeframes from another service, then stepping through each one to simulate trading. 

When a signal tells the strategy to enter a trade, the service fetches the necessary historical price data and executes the strategy’s logic. It intelligently skips forward in time to the point where the signal closes, then reports the result of that trade.

Instead of storing all the results in memory at once, it streams them to you one by one, making it efficient for backtesting long periods of data.  You can even stop the backtest early if you need to by interrupting the stream. The `run` method is the main entry point – you give it a trading symbol, and it produces a continuous stream of backtest results.

## Class BacktestCommandService

This service acts as a central point for initiating and managing backtests within the backtest-kit framework. Think of it as a convenient way to trigger backtesting processes, providing access to various underlying services. It's designed to be easily integrated into your application through dependency injection.

It handles tasks like validating your trading strategy and the exchanges and data frames you're using. 

The key functionality is the `run` method, which lets you start a backtest for a specific trading symbol. When you call `run`, you need to provide information about the strategy, exchange, and data frame you want to use for the test, and it will return results as they become available.

