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

The Walker Validation Service helps you keep track of and verify your parameter sweep configurations, which are essentially blueprints for testing different settings in your trading strategies. It acts as a central hub, storing all your walker definitions and making sure they're valid before you start running tests. 

Think of it as a librarian for your walkers – it ensures they exist and are properly set up. It remembers which walkers have already been checked so it can work faster, too. 

You can use this service to register new walkers, double-check if a specific walker is ready for use, and get a complete list of all walkers you’ve defined. It simplifies managing those parameter explorations and ensures everything runs smoothly.


## Class WalkerUtils

WalkerUtils provides helpful tools for running and managing your trading walkers, essentially streamlining how you compare and analyze different strategies. Think of it as a central hub for interacting with your walkers, taking care of the underlying details so you can focus on the bigger picture.

It offers a simple way to execute walkers, automatically handling details like identifying the correct walker and logging progress.  You can also trigger walkers in the background – perfect for tasks like logging or triggering callbacks without needing to wait for results. 

Need to pause a walker?  The `stop` function cleanly halts new signals, allowing ongoing activity to finish gracefully.  The `getData` method retrieves all the results from your walker comparisons, while `getReport` and `dump` let you create and save nicely formatted reports. Finally, `list` gives you a quick overview of all your currently running walkers and their status. It’s designed as a single, readily available instance for easy integration into your projects.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of different trading strategies, or "walkers," and their configurations in a safe and organized way. It acts as a central place to store and manage these strategy blueprints.

Think of it as a registry; you add new strategies using `addWalker()` and then easily find them again by their name. The service ensures your strategies are structurally correct before they're added to the registry with its validation feature.

You can also update existing strategies using `override()` to make changes without completely replacing the original.  And when you need to use a strategy, you can quickly retrieve it using `get()`.  It leverages a secure storage system to protect your strategy definitions.

## Class WalkerReportService

The WalkerReportService helps you keep track of how your trading strategies are improving during optimization runs. It listens for updates from the optimization process and neatly stores the results in a database. This lets you easily compare different strategy configurations, monitor progress, and identify the best performing setups.

It uses a logger to provide debugging information and provides a way to subscribe to optimization events, ensuring you don't accidentally subscribe multiple times. You can also easily stop listening for those events when you’re done. Essentially, it’s designed to be a reliable way to record and analyze your strategy optimization journey.


## Class WalkerMarkdownService

The WalkerMarkdownService helps you automatically generate and save reports about your trading strategies. It listens for updates from your trading simulations – what we call "walkers" – and keeps track of how each strategy is performing.

Think of it as a reporting engine that builds detailed comparison tables in a readable markdown format. These reports are then saved to your logs directory, making it easy to review and analyze your strategy performance over time.

You can subscribe to receive these updates as they happen, and the service makes sure you don't accidentally subscribe multiple times.  It provides methods to get specific data, generate the complete report, and save it to a file.  You also have the ability to clear the accumulated data, either for a specific walker or all of them. This service uses a clever system to efficiently store data for each walker, preventing them from interfering with each other.

## Class WalkerLogicPublicService

This service helps manage and run "walkers," which are essentially backtesting processes within the system. It's designed to make it easier to execute backtests by automatically passing along important information like the strategy being tested, the exchange it's for, and the specific backtest "frame" it's running within. 

Think of it as a layer on top of another service (`WalkerLogicPrivateService`) that takes care of automatically providing the necessary context for each backtest. 

The core function, `run`, lets you kick off a comparison of walkers for a given stock symbol.  It handles the behind-the-scenes setup and execution, letting you focus on the results. Effectively, this initiates backtests across all defined strategies.

## Class WalkerLogicPrivateService

This service helps you compare different trading strategies against each other. Think of it as an orchestrator that manages the whole process of running multiple backtests and then presenting the results.

It works by taking a symbol, a list of strategies you want to compare, a metric to evaluate them on, and some context information.  The service then runs each strategy one after another, keeping track of how each one is performing.

As each strategy finishes, you’ll get updates showing its progress. Ultimately, the service returns a ranked list of all the strategies based on your chosen metric, so you can easily see which one performed best. It relies on other services to handle the actual backtesting and formatting of results.

## Class WalkerCommandService

WalkerCommandService acts as a central access point for interacting with the core walker functionality within the backtest-kit. Think of it as a facilitator, wrapping around the more complex internal services to provide a streamlined interface for external use. It gathers together various validation and logic services, like those responsible for checking your strategies, exchanges, and the overall framework setup.

The service's primary function is the `run` method, which allows you to execute a walker comparison. This method takes a symbol (like a stock ticker) and some context information—specifically, the names of the walker, exchange, and frame involved—and generates a sequence of results from the comparison. It's essentially how you kick off a test or analysis of your trading strategies. The service internally manages the communication between different components, making it easier to use the walker's capabilities within your application.


## Class StrategyValidationService

This service helps keep track of your trading strategies and makes sure they're set up correctly before you start trading. Think of it as a central hub for managing your strategy definitions. You can register new strategies using `addStrategy`, telling the service about their structure.

Before running any trades, you can use `validate` to confirm a strategy exists and that its related risk profile is also valid. This prevents errors and ensures everything is in order.

Need to see what strategies you’ve registered? The `list` function gives you a handy overview of all the strategy schemas you've defined.  The service also remembers previous validation results to make things faster.

## Class StrategySchemaService

The StrategySchemaService helps you keep track of your trading strategy definitions in a structured and organized way. Think of it as a central place to store and manage the blueprints for your strategies. 

It uses a special system to ensure the strategy information is always in the expected format, and it makes it easy to add new strategies or update existing ones. 

You can register new strategy definitions using `addStrategy()`, retrieve them by their name using `get()`, and even update existing definitions with `override()`.  Before a strategy is registered, it's checked to make sure it has all the necessary components using `validateShallow()`. This service ensures that your strategies are consistent and reliable.

## Class StrategyCoreService

This service acts as a central hub for managing and interacting with trading strategies within the backtest framework. It handles tasks like validating strategies, retrieving signals, and executing actions like stopping or canceling signals. It’s designed to work behind the scenes, making it easy to perform common strategy operations while ensuring consistency and injecting necessary information like the trading symbol and timeframe.

Here's a breakdown of its key features:

*   **Validation:** It thoroughly checks strategy configurations and associated risk settings, preventing errors and ensuring everything is set up correctly. This validation process is optimized to avoid unnecessary repetitions.
*   **Signal Retrieval:**  You can use it to find the current pending or scheduled signals for a specific symbol, which is useful for monitoring things like take-profit and stop-loss levels.
*   **State Checks:** It provides methods to quickly determine if a strategy is stopped or if the breakeven point has been reached.
*   **Execution Actions:** The service enables actions like stopping the generation of new signals, canceling scheduled signals, and clearing cached strategy data.
*   **State Modification:** Methods exist to manage partial profit/loss closing and adjust trailing stop/take levels.
*   **Backtesting and Ticking:** It facilitates running fast backtests and checking signal status at specific timestamps. 

Essentially, it provides a simplified and reliable way to control and observe strategies within the backtest environment.

## Class StrategyConnectionService

This service acts as a central hub for managing and executing strategies within the backtest-kit framework. It intelligently connects requests for strategy operations (like generating signals or backtesting) to the correct strategy implementation, keeping track of which strategy is used for which symbol. 

Think of it as a smart router – when you ask for a signal for a specific trading pair (symbol and strategy), this service finds the right strategy to handle that request and makes sure it's ready to go. It's also designed to be efficient; it stores frequently used strategy instances to avoid unnecessary re-initialization.

Here's a breakdown of what it does:

*   **Routes strategy calls:** It directs requests to the appropriate strategy based on the symbol and strategy name.
*   **Caches strategies:** It stores strategy instances to boost performance.
*   **Ensures readiness:** It makes sure strategies are initialized before any operations begin.
*   **Handles live and historical data:** It supports both real-time trading (tick) and backtesting (backtest).
*   **Provides signals:**  It retrieves active signals, scheduled signals, and manages breakeven calculations.
*   **Manages strategy state:**  You can stop, clear, or cancel strategies using this service.
*   **Supports partial profits and losses:** It allows for executing partial positions based on profit or loss targets.
*   **Offers trailing adjustments:**  It enables adjusting trailing stop-loss and take-profit levels.

## Class SizingValidationService

This service helps keep track of your position sizing strategies, making sure they're set up correctly before you start trading. It acts like a central registry where you add and manage your sizing rules. 

You can use it to register new sizing strategies, like fixed percentage or Kelly Criterion, ensuring they are available for use. Before you attempt to use a sizing strategy, you can validate that it exists. 

To improve performance, it remembers the results of these validations, so it doesn’t need to check again unnecessarily. If you need to see what sizing strategies you've registered, you can simply request a list of them.

## Class SizingSchemaService

This service helps you keep track of sizing schemas, which are essentially blueprints for how much to trade. It uses a safe and organized way to store these schemas, making sure they are properly typed and consistent. 

You can add new sizing schemas using the `register` method, or update existing ones with `override`. To get a sizing schema you need, simply use the `get` method and provide its name. 

Before a sizing schema is added, it’s quickly checked to ensure it has all the necessary parts with the right types – this validation happens automatically thanks to `validateShallow`. The service keeps a record of your sizing schemas, acting as a central place to manage them.

## Class SizingGlobalService

This service helps determine how much of an asset to trade, based on your risk preferences and other factors. It acts as a central hub for calculating position sizes, coordinating with other services to ensure the calculations are accurate and valid. Think of it as the engine that translates your desired risk profile into a specific number of shares or contracts.

It relies on a connection service for obtaining necessary data and another service to validate the sizing parameters. The core function, `calculate`, is where the actual sizing calculation takes place, and it considers the name of the sizing operation being performed. This calculation is essential for managing risk effectively in your trading strategies.

## Class SizingConnectionService

The SizingConnectionService acts as a central hub for handling position sizing calculations within your backtesting framework. It intelligently routes sizing requests to the correct sizing implementation based on a name you provide.

Think of it as a dispatcher – you tell it *how* you want to size your positions (e.g., "kelly-criterion," "fixed-percentage"), and it makes sure the right sizing logic is applied. 

To avoid repeated creation of sizing logic, it cleverly caches these implementations, making things more efficient. It relies on other services like `loggerService` and `sizingSchemaService` to function properly.

The `getSizing` method is your key access point for retrieving these sizing implementations, while `calculate` is used to perform the actual sizing calculation using specified parameters and risk management considerations. If your strategy doesn’t have specific sizing rules, you can leave the sizing name blank.


## Class ScheduleUtils

ScheduleUtils helps you keep track of and understand how your scheduled signals are performing. It's designed to make it easy to monitor things like how long signals wait, how often they're cancelled, and generally get a feel for the health of your scheduling process. 

Think of it as a central place to access information related to your scheduled signals. You can request data about signals for a specific trading symbol and strategy, or generate a clear markdown report detailing their status. 

It also allows you to save these reports directly to a file on your computer for later review. This class is set up to be readily available, so you don’t have to worry about creating a new instance each time you need it.


## Class ScheduleReportService

This service helps you keep track of your scheduled trading signals, specifically for identifying and addressing potential delays in order execution. It listens for events related to signals being scheduled, opened, and cancelled. 

The service automatically calculates how long a signal takes from the moment it's scheduled until it's either executed or cancelled, which is useful for pinpointing bottlenecks. It records all this information in a database, allowing you to analyze and optimize your trading processes.

You can easily enable or disable this tracking by subscribing to the signal events and unsubscribing when you no longer need the data. The system ensures you don't accidentally subscribe multiple times, avoiding duplicate entries.

Here's a breakdown of what it does:

*   Logs signal lifecycle events (scheduled, opened, cancelled).
*   Measures the time elapsed between scheduling and execution/cancellation.
*   Stores data in a report database for analysis.
*   Provides a simple way to start and stop the tracking process.

## Class ScheduleMarkdownService

This service helps you keep track of and report on scheduled signals generated by your trading strategies. It listens for when signals are scheduled and cancelled, and neatly organizes this information for each strategy you're using.

The service automatically creates reports in markdown format – think nicely formatted tables – that you can save to your logs. These reports include details about each signal, and also provide helpful statistics like cancellation rates and average wait times.

You can get specific reports for a single strategy and symbol combination, or clear out the accumulated data when you're done with a backtest. The system ensures that each strategy and timeframe has its own dedicated storage space for these reports, keeping things organized. If you need a fresh start, you can easily clear all accumulated data.

## Class RiskValidationService

This service helps you keep track of your risk management rules and make sure they're all set up correctly. Think of it as a central place to register and check the validity of your risk profiles. 

It lets you add new risk profiles, so you can define the rules you want to follow.  You can then use the validation function to confirm a specific risk profile actually exists before you try to use it – this prevents errors and unexpected behavior.

To make things faster, the service remembers the results of previous validations, avoiding unnecessary checks. Finally, you can get a list of all the risk profiles you've registered. This service is designed to simplify and improve the reliability of your risk management setup.

## Class RiskUtils

The RiskUtils class is like a handy tool for understanding and reporting on risk rejection events within your trading system. It provides a way to gather information about when and why trades were flagged for potential risk issues. Think of it as a way to review your system's guardrails and see how they're performing.

You can use it to get statistics about rejections – things like the total number of rejections, broken down by the asset being traded and the strategy used.  It also lets you create detailed reports in Markdown format, showing a table of all the rejection events, including information such as the position, exchange, price, and the reason for the rejection.

Finally, you can easily save these reports to files, making it simple to share them or keep a record of your risk management activities. The file names are created in a standardized way, making organization straightforward.  It’s designed to work with the RiskMarkdownService, pulling data from a storage system that keeps track of rejection events.

## Class RiskSchemaService

This service helps you organize and manage different risk profiles, ensuring they're consistent and well-defined. It acts as a central place to store these profiles, using a system that makes sure the data types are correct. 

You can add new risk profiles using the `addRisk` function, and easily retrieve them later by their name. The service also checks that new profiles have the necessary elements before they’re saved, preventing errors.  If a profile already exists, you can update parts of it without recreating the entire thing. The service keeps track of everything internally, making it simpler to work with risk profiles throughout your application.

## Class RiskReportService

The RiskReportService helps you keep track of when your trading signals are rejected by your risk management system. It acts like a recorder, capturing details about each rejected signal – why it was rejected and what the signal was. 

This service connects to your risk management system and stores these rejection events in a database, allowing you to analyze risk patterns and review past decisions. It ensures you won't accidentally subscribe multiple times to receive these rejection notifications, preventing duplicates. You can easily start and stop the service by subscribing and unsubscribing, ensuring you only receive the data you need.

## Class RiskMarkdownService

The RiskMarkdownService helps you create reports detailing why your trading strategies were rejected due to risk management rules. It listens for risk rejection events and keeps track of them, organizing them by the specific symbol, strategy, exchange, timeframe, and backtest you're using. 

It then builds these events into nicely formatted markdown tables, providing you with summaries of total rejections, breakdowns by symbol and strategy to help you understand where issues might be occurring.

The service automatically saves these reports as markdown files to a specific directory, allowing you to easily review and analyze your risk rejection history. You can also request specific data or reports programmatically, or clear out the accumulated data when it's no longer needed. It ensures that each combination of symbol, strategy, exchange, timeframe, and backtest gets its own isolated storage.

## Class RiskGlobalService

The RiskGlobalService is a central component managing risk controls within the backtest-kit framework. It acts as a gatekeeper, ensuring that trading signals adhere to defined risk limits.

Think of it as a layer of protection, wrapping around the connection to the risk management system to validate configurations and prevent unwanted trades. It leverages several services, including those for validating risk, exchange, and frame-specific settings.

The `validate` function performs checks on risk configurations, remembering previous validations to make the process efficient.  You can use `checkSignal` to see if a potential trade is allowed based on established limits.

When a trade is initiated, `addSignal` registers it with the risk management system. Conversely, `removeSignal` is used to acknowledge when a trade is closed.  Finally, `clear` allows you to wipe out risk data, either for a specific risk configuration or for all configurations.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks within your trading system. It directs risk-related operations to the correct risk management component, ensuring that your strategies adhere to defined risk limits.

Essentially, it figures out which specific risk rules apply to a given trade based on factors like the exchange, timeframe, and whether you’re in backtesting mode. This service uses a smart caching system to avoid repeatedly creating these risk management components, which speeds things up.

You'll use this service to validate signals before they’re executed, and to register and deregister trades with the risk management system. It’s particularly useful for strategies that have different risk profiles depending on the exchange or timeframe they're trading.  If a signal violates the set risk limits, the service will notify you through an event. The caching can be manually cleared if needed.

## Class ReportUtils

ReportUtils helps you control which parts of the backtest-kit framework are recording data for analysis. It lets you turn on or off logging for things like backtest runs, live trading sessions, walker simulations, and performance evaluations.

The `enable` function allows you to pick and choose which types of logging you want active. It sets up the logging systems and returns a function that you *must* call later to shut down the logging gracefully and prevent memory issues.

The `disable` function lets you selectively stop logging for specific areas without affecting others. It immediately stops the logging processes and releases resources.

## Class ReportAdapter

The ReportAdapter helps you manage and store your trading data in a consistent way, letting you easily change how that data is stored without altering the core logic of your backtesting system. It uses a flexible design, allowing you to swap out different storage methods like JSONL files or potentially other databases.

The system keeps track of your report storage, creating only one instance for each type of report (like backtest results or live trade data). This ensures efficient use of resources and prevents conflicts. 

You can control which storage method is used – the default is JSONL files, but you can easily switch to a different method or even a dummy adapter that simply discards all data for testing purposes. The adapter automatically sets up the necessary storage when you first write data, making the process straightforward. It also provides real-time event logging, making debugging and analysis much easier.

## Class PositionSizeUtils

This class offers helpful tools for determining how much of an asset to trade in a backtest. It provides several pre-built methods, each calculating position size differently – think of it as offering different strategies for sizing your trades.

Each method, like `fixedPercentage`, `kellyCriterion`, and `atrBased`, takes into account factors like your account balance, the asset's price, and other relevant data.  The framework ensures that the information you provide aligns with the chosen sizing method, helping to prevent errors.  Essentially, it simplifies the process of calculating your position size, allowing you to focus on other aspects of your trading strategy. You can use these methods to automatically determine appropriate trade sizes based on your chosen approach.

## Class PersistSignalUtils

This class provides tools for keeping track of your trading signals, ensuring they aren’t lost even if something unexpected happens. It acts as a central place to save and retrieve signal data for each strategy you're using, specifically designed to work with the ClientStrategy in live trading. 

You can customize how this data is stored by registering different persistence adapters, or easily switch back to the default JSON format. There's even a "dummy" adapter that’s useful for testing, as it simply ignores all attempts to save data.

When your strategy is starting up, `readSignalData` fetches any previously saved signal information; if no signal is found, it returns nothing. Conversely, `writeSignalData` reliably saves the current signal state to disk, employing a method that's designed to be resistant to data corruption during crashes.

## Class PersistScheduleUtils

The `PersistScheduleUtils` class helps manage how scheduled signals are saved and loaded, particularly for trading strategies. It ensures that these signals are stored reliably, even if the system crashes. Each strategy gets its own separate storage area, and you can even customize how the data is saved using different adapters.

To get your scheduled signals back when the system restarts, `readScheduleData` retrieves that saved information. Conversely, `writeScheduleData` saves the current state of your scheduled signals to persistent storage, doing so in a safe way to prevent data loss.

The class also allows you to easily switch between storage methods. `useJson` enables the standard JSON-based storage, `useDummy` provides a testing mode where writes are ignored, and `usePersistScheduleAdapter` lets you bring in your own custom storage solution.

## Class PersistRiskUtils

The PersistRiskUtils class helps manage how active trading positions are saved and retrieved, particularly for different risk profiles. It's designed to safely store information about positions, even if the system crashes unexpectedly.

It automatically handles storing data for each risk profile and allows you to customize how that data is stored using different adapters. You can even switch to a "dummy" adapter to temporarily disable saving, useful for testing. 

The class provides functions to read and write position data, ensuring that the writing process happens securely and doesn’t lead to corrupted data. This is crucial for systems like ClientRisk that rely on accurately tracking active positions.

## Class PersistPartialUtils

This utility class helps manage how partial profit and loss information is saved and retrieved. It keeps track of these values for each trading symbol and strategy name, using a clever system to avoid unnecessary reloads. You can even customize how this data is stored, choosing from different adapters. 

The class ensures that the data is read and written safely, even if your system unexpectedly crashes. It’s especially important for keeping track of your trading progress in live mode.

You can easily switch between different storage methods, including using a simple JSON format or even a "dummy" adapter that throws away any changes (useful for testing!). It retrieves existing partial data when things start up and updates the saved data whenever your profit/loss levels change.

## Class PersistBreakevenUtils

This class helps manage and save your breakeven data, like whether a signal has been reached, so you don't lose it when you restart. It's designed to be a central place for handling this data, ensuring changes are saved reliably.

It organizes your data in specific folders and files, creating a structure like `dump/data/breakeven/BTCUSDT_my-strategy/state.json` to store this information.  Essentially, it makes sure your progress is remembered.

You can even customize how this data is saved—using JSON format by default—or switch to a "dummy" mode which acts like a test mode where nothing is actually saved to disk. The system automatically handles creating the necessary files and folders, and uses a clever technique to ensure that writes are done safely, preventing data loss. This ensures your application’s breakeven state is preserved and recoverable.

## Class PerformanceReportService

This service helps you understand where your trading strategy is spending its time. It acts like a data collector, listening for performance events – moments like when your strategy is calculating something or executing an order. 

It then carefully records these events, noting how long each step takes and any relevant details. All this information is stored in a database, making it easier to pinpoint bottlenecks and optimize your strategy's efficiency.

You can think of it as adding a layer of monitoring to your backtesting process. The `subscribe` method starts this monitoring, giving you a way to stop it later with an automatically provided function.  The `unsubscribe` method offers another way to stop monitoring. It’s designed to prevent you from accidentally subscribing multiple times, which could cause problems.

## Class PerformanceMarkdownService

The PerformanceMarkdownService helps you keep track of how your trading strategies are performing. It listens for performance updates and organizes them by symbol, strategy, exchange, and timeframe. You can then ask it to calculate things like average performance, minimums, maximums, and percentiles to get a clear picture of what's happening.

The service can also generate easy-to-read markdown reports that highlight areas where your strategy might be struggling, and it can automatically save those reports to your logs.

It provides methods to subscribe and unsubscribe from performance events, track performance data, retrieve statistics, generate reports, save reports to disk, and clear the stored performance data. It manages storage to ensure performance data is kept separate for each unique combination of symbol, strategy, exchange, timeframe, and backtest.

## Class Performance

The Performance class helps you understand how your trading strategies are performing. It offers tools to gather key statistics, identify bottlenecks, and create readable reports.

You can use `getData` to retrieve detailed performance metrics for a specific trading symbol and strategy, allowing you to see how long different parts of your strategy are taking and their volatility. `getReport` builds a markdown report visualizing these metrics, including a breakdown of time spent on different operations and percentile analysis to highlight potential performance bottlenecks. Finally, `dump` lets you save these reports to a file, conveniently stored under a "dump/performance" directory, making it easy to track and compare your strategy’s efficiency over time.


## Class PartialUtils

This class is like a handy tool for digging into the partial profit and loss data your backtesting or live trading generates. It provides a single place to access and organize information about those smaller profit/loss events, rather than just the big picture.

You can use it to get a quick overview of how much profit and loss has occurred, generating a report that neatly organizes each event into a table showing things like the type of event (profit or loss), the symbol traded, the strategy used, and the price at the time. This report is also easily exportable to a file, automatically naming it with the symbol and strategy used.

Essentially, it takes data collected by another system and transforms it into useful reports and statistics to help you understand the detailed performance of your strategies. It's designed to make it easy to analyze those smaller steps that contribute to overall trading results.

## Class PartialReportService

This service helps you keep track of how your trades are performing by logging every time a portion of a position is closed, whether it's for a profit or a loss. It listens for signals indicating these partial exits and carefully records the details, like the price and the amount of the position closed. 

You can easily tell it to start monitoring these events and it will automatically store the information. When you’re done, you can tell it to stop listening, ensuring you don’t accidentally accumulate unnecessary data. It’s designed to be used only once to prevent duplicate entries. 

Here's a breakdown of what you can do:

*   It receives information about partial profits and losses.
*   It records each partial exit event in a database.
*   You can start and stop its monitoring functionality.
*   It prevents accidentally subscribing multiple times.

## Class PartialMarkdownService

The PartialMarkdownService helps you create reports detailing your partial profits and losses during backtesting. It listens for events related to these profits and losses, keeping track of them for each symbol and strategy you're using. 

It automatically generates nicely formatted markdown tables that summarize these events, allowing you to easily review your performance. You’ll also get overall statistics like the total number of profit and loss events recorded.

The service saves these reports as markdown files on your computer, organized by symbol, strategy, exchange, frame, and whether it’s a backtest.

You can subscribe to receive these events, and the service makes it simple to get data, generate reports, and save them. You also have the option to clear the accumulated data if you need to start fresh.

## Class PartialGlobalService

PartialGlobalService acts as a central hub for managing partial profit and loss tracking within the system. Think of it as a gatekeeper – it receives requests related to partials, logs them for monitoring purposes, and then passes them on to the PartialConnectionService to handle the actual work. This design ensures a single entry point for these operations, making it easier to manage and debug.

It relies on several other services injected from the dependency injection container, such as validation and schema services, to ensure the strategy and related configurations are valid before processing. The `validate` property is a handy shortcut to make sure everything is set up correctly, and it remembers previous validations to avoid repeating checks unnecessarily.

The `profit`, `loss`, and `clear` methods are the main ways to interact with the service.  When a profit or loss is triggered, or a partial is cleared, this service records the event before passing it along to the connection service.

## Class PartialConnectionService

This service helps track partial profits and losses for your trading signals. It’s designed to efficiently manage and reuse data about each signal, avoiding unnecessary overhead.

Think of it as a central place to get and manage details about how a signal is performing – whether it’s making a profit or experiencing a loss. It keeps track of these details for each signal and remembers them so you don’t have to recreate them every time.

The service creates a special record, called a `ClientPartial`, for each signal ID. These records are cached for quick access, and they're automatically cleaned up when the signal is closed.

You can think of it as a factory, making these records and ensuring they're properly configured with logging and notifications. When a signal hits a profit or loss level, this service handles it and lets other parts of your system know. Finally, when a signal closes, it removes the record to keep things tidy.


## Class OutlineMarkdownService

This service helps create documentation in Markdown format, particularly useful for debugging and reviewing how AI strategies are developed. It's designed to work with the AI Strategy Optimizer, capturing important details of the process.

The service automatically organizes information into a structured directory system under a `dump/strategy` folder, using the `signalId` to identify each specific strategy execution. You'll find files for the initial system prompt, each user input during the interaction, and the final output from the language model, all neatly documented.

To make things smoother, it avoids accidentally overwriting existing documentation by checking if the directory already exists. The `dumpSignal` function is key – it handles the actual writing of all this information to the Markdown files, combining conversation history and signal data for a complete record.


## Class OptimizerValidationService

This service helps ensure your optimizers are properly registered and available for use within the backtest-kit framework. It acts like a central record-keeper, maintaining a list of known optimizers and their configurations. 

Adding an optimizer to this registry lets the system know about it, preventing errors later on. 

The service also makes checking for optimizer existence quick and efficient thanks to memoization – it remembers the results of previous checks so it doesn't have to repeat the work. 

You can use this service to both add new optimizers to the system and to view the list of all registered optimizers.

## Class OptimizerUtils

This section provides tools for working with strategies generated by your optimization runs. You can use these utilities to retrieve information about your strategies, generate the actual code that will execute them, and save that code to files for later use.

Specifically, `getData` lets you pull all the strategy details, including how they were trained and what data they used. `getCode` assembles everything needed for a complete, runnable strategy – think of it as combining all the pieces into a single, ready-to-go file. Finally, `dump` takes that generated code and saves it to a file, neatly organized and named based on your optimizer and the trading symbol. This makes it easy to deploy and manage your generated strategies.

## Class OptimizerTemplateService

This service acts as a central hub for creating code snippets used in backtesting and optimization processes. It leverages an LLM (specifically, Ollama) to generate code for various components, including strategy definitions, exchange configurations, and data handling. Think of it as a code generator that simplifies the creation of trading strategies and tests.

It’s designed to handle different timeframes (like 1-minute, 5-minute, and hourly charts) and structures the output of trading signals in a standardized JSON format, which makes it easy to process and use. The service also provides debugging capabilities by saving conversations and results to a dedicated directory.

You can use it to compare different trading strategies using a “Walker” approach, and it integrates with CCXT for accessing exchange data.  While the service provides default code templates, you have the flexibility to customize certain aspects through configuration. It creates helper functions for tasks like dumping JSON data and generating text responses from the LLM. The generated JSON signals include details like entry price, take profit, stop loss, and expected duration, helping to define trade parameters.

## Class OptimizerSchemaService

The OptimizerSchemaService helps keep track of different optimizer configurations, ensuring they're set up correctly. Think of it as a central place to register and manage these configurations, with built-in checks to make sure everything's in order.

It uses a registry to store these configurations safely, so they can't be accidentally changed.

Here's what you can do with it:

*   **Register new configurations:**  You can add new optimizer configurations using the `register` method, which will automatically validate them.
*   **Quickly check configurations:** The `validateShallow` method lets you quickly verify the basic structure of a configuration.
*   **Update existing configurations:** The `override` method allows you to modify existing configurations by only changing the parts you need.
*   **Retrieve configurations:**  You can easily get a specific optimizer configuration using the `get` method by providing its name. 

Essentially, it's a tool for organizing and maintaining your optimizer settings, ensuring they're valid and accessible.

## Class OptimizerGlobalService

The OptimizerGlobalService acts as a central point for interacting with your optimizers, ensuring everything runs smoothly and safely. It’s responsible for handling requests, checking if the optimizer you're trying to use actually exists, and then passing the work along to another service to actually generate the strategy code or data.

Think of it as a gatekeeper – it logs what's happening, verifies things are correct, and then gets the right tools involved to do the heavy lifting. 

Here's a breakdown of what it does:

*   **`getData`**:  This method retrieves all available data for a specific optimizer, combines it, and creates helpful metadata.
*   **`getCode`**: It creates the complete code needed to run your strategy based on the optimizer you specify.
*   **`dump`**: This handy function generates the strategy code and saves it directly to a file, simplifying the process of using the generated code.

It relies on other services for logging, optimizer validation, and the actual connection to the optimizer.

## Class OptimizerConnectionService

The OptimizerConnectionService is designed to make working with optimizers much easier and more efficient. It acts as a central place to manage connections to different optimizers, keeping track of them and reusing them when possible to avoid unnecessary overhead.

Think of it as a smart helper that creates optimizer connections on demand and remembers them for later use, speeding up your workflow. It automatically combines your custom configurations with default settings, giving you a good starting point while still allowing for personalization. 

You can use it to retrieve data, generate code, and even save the generated code directly to a file. The service integrates logging to keep you informed of what's happening behind the scenes. This service relies on other services like OptimizerSchemaService and OptimizerTemplateService to function correctly.


## Class NotificationUtils

The NotificationUtils class gives you a simple way to manage notifications within your application. It handles some behind-the-scenes setup automatically so you don't have to worry about it. You can use it to retrieve a list of all notifications, sorted from newest to oldest, or to completely clear the notification history. Think of it as a convenient interface for interacting with the underlying notification system.

## Class MarkdownUtils

MarkdownUtils helps you control when and where markdown reports are generated within the backtest-kit framework. Think of it as a central switchboard for report creation across different areas like backtesting, live trading, and performance analysis.

You can selectively turn on markdown reporting for specific services using the `enable` function. When you do, it starts listening for events, collecting data, and preparing reports, but it’s really important to remember to "unsubscribe" afterward to avoid problems.  The `enable` function gives you a function to do just that.

Conversely, `disable` lets you shut off markdown reporting for particular services without affecting others. This is handy when you only need reports in certain situations.  Unlike `enable`, disabling doesn't require a cleanup function; it immediately stops report generation.


## Class MarkdownAdapter

The MarkdownAdapter helps manage how your markdown data is stored, providing flexibility and efficiency. It uses a design pattern that lets you easily switch between different storage methods like storing each piece of data in a separate file or combining them into a single JSONL file.  It remembers which storage instance it's using, making sure you don't create multiple copies of the same data in memory.

You can easily change the type of storage used with `useMarkdownAdapter`, and quick shortcuts like `useMd` (for separate files) and `useJsonl` (for a single JSONL file) are available. If you just need to test things without writing any data, `useDummy` will discard everything.  The adapter automatically sets up the storage the first time you write data, and remembers the settings for future use.

## Class LoggerService

The LoggerService helps ensure consistent logging across the backtest-kit framework by automatically adding useful information to your log messages. It acts as a middleman, forwarding log requests to a logger you provide, but enriching them with details like the strategy, exchange, and execution context. If you don't specify a logger, it defaults to a "no-op" logger that doesn't actually log anything.

You can customize the logging behavior by setting your own logger implementation using the `setLogger` method. This lets you integrate it with your preferred logging system.

The service has properties for managing context and the underlying logger, and it provides convenient methods like `log`, `debug`, `info`, and `warn` for different log levels. These methods all handle adding the automatic context information for you.

## Class LiveUtils

This utility class, `LiveUtils`, helps manage live trading operations, providing a simplified and robust way to run strategies. It's designed to handle live trading and provides tools to interact with and control those live processes.

Think of it as a central hub for launching and monitoring your live trading strategies. It uses a special technique called an "infinite generator" so it keeps running indefinitely, processing data continuously. Importantly, it’s built to recover from crashes – if something goes wrong, it automatically tries to pick up where it left off from saved data.

Here’s a breakdown of what it can do:

*   **Start Live Trading:** You can initiate live trading for a specific symbol and strategy.
*   **Run in the Background:**  There's a way to start a trading process that runs silently without directly displaying results – useful for tasks like data persistence or callbacks.
*   **Check on Signals:** You can retrieve information about pending and scheduled signals the strategy is using.
*   **Breakeven Management:**  It can verify if the price has moved enough to cover transaction costs and potentially set a breakeven point.
*   **Control Signals:** You can stop the generation of new signals or cancel specific scheduled signals.
*   **Adjust Position Management:** It includes functions to execute partial profit or loss closures and to manage trailing stop-loss and take-profit levels – dynamically adjusting these to protect gains.
*   **Data and Reporting:** You can retrieve statistics and generate detailed reports about the trading activity, even saving them to a file.
*   **List Active Processes:** See a list of all currently running live trading instances and their status.

`LiveUtils` essentially acts as a single point of access for managing live trading, offering recovery and a variety of control mechanisms.

## Class LiveReportService

The LiveReportService is designed to keep a real-time record of your trading strategy's activity, storing all the key moments in a SQLite database. It diligently tracks events like when your strategy is idle, when a position is opened, when it's actively trading, and when it's closed.

Essentially, it listens for signal events and meticulously logs them, giving you detailed information about what's happening during live trading. The service ensures that you're not accidentally subscribing multiple times to avoid unwanted data overload, and provides a way to stop listening when you no longer need the live reports. You can think of it as a detailed journal for your trading strategy, allowing you to monitor and analyze its performance as it happens.


## Class LiveMarkdownService

This service helps you automatically generate reports about your live trading activity. It listens for trading events like when a strategy is idle, opens a position, is active, or closes a trade. It then organizes this information and neatly presents it in markdown tables, along with useful statistics like win rate and average profit/loss. 

The service stores these events specifically for each trading symbol, strategy name, exchange, timeframe, and whether it’s a backtest or live run, so you get detailed reports for each setup.  You can easily save these reports to your computer, and the service will even create the necessary directories if they don't already exist.  There's also a way to clear out all this accumulated data if you need to start fresh or want to free up space. It's designed to be simple to integrate, as it's triggered by the standard `onTick` callback function used in most trading strategies.

## Class LiveLogicPublicService

This service simplifies live trading by handling the complexities of context and state management. It acts as a public interface built on top of a more private service, automatically passing along important information like the strategy and exchange names to your trading logic. 

Think of it as a way to avoid repeatedly specifying context details in your code - it handles that for you.

The core function, `run`, continuously generates trading signals (both opening and closing) for a specific symbol, and it's designed to be robust. If the process crashes, it can recover its state from disk, ensuring minimal data loss. It keeps track of time using the current date and time, enabling real-time trading. You provide the symbol you want to trade, and the service takes care of the rest, streaming trading events to your application.

## Class LiveLogicPrivateService

This service helps orchestrate live trading by continuously monitoring a symbol and providing updates as they happen. It works by looping indefinitely, checking for new signals, and then streaming the results – only when trades are opened or closed. Think of it as a live feed of trading activity, rather than just a constant stream of data. 

The system is designed to be resilient; if it crashes, it can recover its state and pick up where it left off. It also uses an efficient streaming approach to handle a large volume of updates without consuming excessive memory.  Essentially, it keeps your live trading process running smoothly and provides a constant flow of meaningful updates.

Here’s a breakdown of what it uses:

*   `loggerService`: For logging events and errors.
*   `strategyCoreService`:  Handles the core logic of the trading strategy.
*   `methodContextService`: Provides context for the methods being executed.

The `run` method is the main entry point and takes the trading symbol as input, returning a generator that provides those live trading results.

## Class LiveCommandService

This service, `LiveCommandService`, acts as a central point for accessing live trading features within the backtest-kit framework. Think of it as a helpful intermediary, making it easier to manage dependencies and integrate live trading functionality into your applications.

It relies on several other services internally, such as validation services for strategies and exchanges, and a service to handle strategy schemas.  These internal dependencies ensure that everything is properly set up and validated before a live trade attempt.

The core function, `run`, is how you start live trading. You tell it which trading symbol you’re interested in and provide some context – like the names of the strategy and exchange being used – and it will continuously stream back results. Importantly, this process is designed to be resilient, automatically recovering from crashes to keep the live trading going.  It’s an endless stream of data, giving you a constant flow of information about what’s happening in the market.

## Class HeatUtils

HeatUtils is a helper class designed to make it easier to analyze and visualize your trading portfolio's performance using heatmaps. It acts as a central point for accessing and generating these heatmaps, automatically gathering data across all symbols used by a particular strategy. Think of it as a convenient shortcut for creating reports and saving them.

You can use `getData` to get the raw numbers behind the heatmap – things like total profit/loss, Sharpe Ratio, and maximum drawdown – broken down for each individual asset and the overall portfolio.

`getReport` takes this data and transforms it into a nicely formatted Markdown table, showing the key performance indicators for each symbol, sorted from best to worst.

Finally, `dump` lets you save this Markdown report directly to a file on your computer, so you can share it or keep a record of your strategy's performance. It will even create the necessary folder if one doesn't already exist.

## Class HeatReportService

The HeatReportService helps you track and analyze your trading performance by recording when your signals close. It focuses specifically on closed signals and their associated profit and loss (PNL) data, allowing you to generate heatmaps to visualize trading activity across different assets.

This service connects to your signal events and securely logs the important information to a database. It's designed to prevent accidental double-logging, ensuring clean and reliable data.

You can easily start and stop the service by subscribing and unsubscribing from the signal emitter. When you’re done, the unsubscribe function gracefully stops the data collection.

## Class HeatMarkdownService

The Heatmap Service helps you visualize and analyze your trading performance across different strategies and symbols. It takes incoming trade data and automatically aggregates key statistics like profit and loss, Sharpe Ratio, and maximum drawdown for each symbol and strategy. 

You can think of it as a central hub that keeps track of how your trading is doing. It provides a way to generate easy-to-read reports in Markdown format, making it simple to share and review your results. 

The service avoids potential errors by handling tricky math situations gracefully.  It also efficiently stores and retrieves data, preventing performance slowdowns even with a large number of strategies and symbols.  You subscribe to receive trade updates and can easily unsubscribe when you no longer need the service. It’s also designed to be easily cleared of data when needed, allowing you to start fresh.

## Class FrameValidationService

This service helps you keep track of your trading timeframes, ensuring they're properly set up and available for use. Think of it as a central place to register and check that your different timeframe configurations – like daily, hourly, or weekly – are all accounted for.  It lets you add new timeframes, verifies that a timeframe actually exists before you try to use it, and even remembers past validation checks to speed things up.  You can also get a complete list of all the timeframes you've registered, making it easy to see everything you've defined. It’s designed to be efficient and reliable, so your backtesting and trading operations run smoothly.


## Class FrameSchemaService

This service helps keep track of the different structures used in your backtesting strategies. Think of it as a central place to store and manage the blueprints for your trading frames.

It uses a special, type-safe way to store these blueprints, ensuring they’re consistent. You can add new blueprints using `register()`, update existing ones with `override()`, and retrieve them by name with `get()`.

Before a new blueprint is stored, the service checks to make sure it has all the necessary parts with `validateShallow`, helping you catch potential errors early on. Basically, it makes sure your blueprints are well-formed before they're used.


## Class FrameCoreService

This service is the central hub for handling timeframes within the backtesting framework. It works behind the scenes to create the sequences of dates needed to run a backtest, relying on other services to manage the connections to data sources and validate the timeframes. Think of it as the engine that delivers the chronological order of data for your trading strategies.

It's built around a connection service that actually retrieves the data and a validation service to ensure the timeframes are correct.

The main function you'll interact with is `getTimeframe`, which takes a symbol (like "BTCUSDT") and a timeframe name (like "1h" for hourly) and returns a list of dates representing that timeframe. This is the data that your backtesting logic will use to evaluate your strategies.


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different trading frames within the backtest-kit. Think of it as a smart router – it automatically figures out which frame implementation you need based on the current context. 

It keeps track of frames, creating them when needed and then remembering them for later use, which makes things faster.  The service also helps manage the timeframe used for backtesting, allowing you to define specific start and end dates for your analysis. 

When you’re running a live trading scenario, there won't be any frame constraints, indicated by an empty frame name. 

Here's a breakdown of what it does:

*   It finds the right frame based on context.
*   It avoids recreating frames unnecessarily by caching them.
*   It handles backtest timeframes, defining the period of your simulations.
*   It retrieves the timeframe boundaries for a specific symbol and frame.



The service relies on other components like the logger service, frame schema service and method context service to function.

## Class ExchangeValidationService

This service acts as a central hub for managing and checking the validity of your trading exchanges. Think of it as a quality control system for your exchanges – before your backtest or trading strategy attempts to connect, this service verifies that the exchange is properly set up and exists. 

It keeps track of all registered exchanges and their configurations. You can add new exchanges to its registry, and it provides a convenient way to check if an exchange is valid before you use it.  The service is designed to be efficient, remembering the results of past validations so it doesn't have to repeat checks unnecessarily. You can also easily get a list of all exchanges it's currently managing.

## Class ExchangeUtils

ExchangeUtils is a helper class designed to simplify interactions with different cryptocurrency exchanges. Think of it as a central place to handle common exchange-related tasks. It's set up as a single, always-available instance for easy use throughout your backtesting or trading system.

It offers several useful methods. You can use `getCandles` to retrieve historical price data for a specific trading pair and time period, and `getAveragePrice` calculates the VWAP, a volume-weighted average price, based on recent candle data.  `formatQuantity` and `formatPrice` handle the potentially tricky task of ensuring your order quantities and prices adhere to the specific precision rules of each exchange.  Finally, `getOrderBook` fetches the current order book for a pair, showing you the depth of bids and asks.  This class takes care of figuring out the right time ranges for data retrieval, maintaining compatibility with older code.

## Class ExchangeSchemaService

This service helps keep track of information about different cryptocurrency exchanges, making sure everything is organized and consistent. It uses a special system to safely store these exchange details. 

You can add new exchanges using the `addExchange` function, and easily find existing ones by their name with the `get` function.  Before adding an exchange, the system checks to make sure it has all the essential pieces of information with `validateShallow`. 

If you need to update an exchange's details, you can use the `override` function to make partial changes without replacing the entire entry. It manages these exchange definitions securely and provides a way to access and update them as needed.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for interacting with exchanges within the backtest-kit framework. It streamlines exchange operations by combining connection management with contextual information like the trading symbol, the specific time period, and whether the test is a backtest or live execution. This service relies on other components like a logger and connection service to function.

It’s designed to handle things like fetching historical and future candle data, calculating average prices, and retrieving order books. All these operations happen with the execution context carefully managed, ensuring the exchange receives the correct parameters.

The service includes a built-in validation process to confirm the exchange's configuration, and it optimizes this process by remembering previous validations to avoid unnecessary repetition. The `validate` property allows you to execute this validation.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently directs your requests – like fetching candles or order books – to the correct exchange implementation based on configuration. To make things efficient, it caches those exchange connections so it doesn't have to recreate them every time.

It provides a consistent interface (`IExchange`) for accessing these exchange functionalities. Behind the scenes, it uses services like logging and execution context to ensure everything runs smoothly and appropriately, whether you’re running a backtest or trading live.

Here's a breakdown of what it lets you do:

*   **Candle Data:** It can retrieve historical and subsequent candles (price data over time) for a specific trading pair.
*   **Average Price:** It calculates the average price – either from live exchange data or from historical candles in backtesting mode.
*   **Price & Quantity Formatting:** It makes sure the prices and order quantities you're using conform to the specific rules of the exchange you're connected to (like the number of decimal places).
*   **Order Books:** It fetches the order book, which shows you the current bids and asks for a trading pair.



The service handles the complexities of interacting with various exchanges, allowing you to focus on your trading strategy.

## Class ConstantUtils

The ConstantUtils class provides helpful, pre-calculated values used for setting take-profit and stop-loss levels in your trading strategies. These levels are based on the Kelly Criterion and an exponential decay model, designed to optimize risk and reward. Think of them as guideposts for managing your trades—they help you lock in profits incrementally and protect yourself from potentially large losses.

Specifically, it offers three take-profit levels (TP_LEVEL1, TP_LEVEL2, and TP_LEVEL3) that trigger at 30%, 60%, and 90% of the distance to your overall take-profit target respectively.  Similarly, it defines two stop-loss levels (SL_LEVEL1 and SL_LEVEL2) that activate at 40% and 80% of the distance to your stop-loss target.  Using these constants allows for a more systematic and mathematically-grounded approach to profit-taking and loss mitigation.

## Class ConfigValidationService

This service helps ensure your backtesting configurations are set up correctly and won't lead to unprofitable trades. It's designed to catch mathematical errors and unrealistic settings before you even start a backtest.

The service checks several things, including that slippage, fees, and profit margins are all positive values. Critically, it verifies that your minimum take-profit distance is large enough to cover all trading costs like slippage and fees – this is essential for ensuring trades can actually be profitable. It also validates relationships between settings like stop-loss distances and makes sure time-based and count-related parameters are positive whole numbers. Finally, it checks parameters related to candle data requests to prevent issues with data retrieval. 

The `validate` method performs all these checks, giving you confidence that your configurations are sound. You can access the underlying logger through the `loggerService` property, which will give you more details about any validation errors.

## Class ColumnValidationService

The ColumnValidationService acts like a quality control checker for your column configurations. It ensures that the way you’re defining your columns is correct and consistent, preventing potential problems down the line. 

It performs a thorough examination of your column setups, making sure that each column has all the necessary pieces – a key, a label, a format, and a visibility setting. It also verifies that these keys are unique so you don’t have conflicts. 

Essentially, it's a safeguard to make sure your column definitions are properly structured and ready for use, helping to avoid errors and unexpected behavior. 


## Class ClientSizing

ClientSizing helps determine how much of an asset your trading strategy should buy or sell. It offers several methods for calculating position sizes, such as using a fixed percentage, the Kelly criterion, or Average True Range (ATR). 

You can also set limits to ensure your positions stay within reasonable bounds, like minimum or maximum sizes, or a percentage cap on how much capital is used for any one trade.  ClientSizing also allows for callbacks, which are handy for validating calculations or keeping a record of what happened. 

Ultimately, it's the tool that figures out the specifics of a trade – how many shares or contracts – before your strategy actually executes it.  It uses a set of parameters to perform this calculation, and the `calculate` method is the core function for determining the position size.

## Class ClientRisk

ClientRisk is a component that helps manage risk for your trading strategies, ensuring they don't exceed pre-defined limits. It acts as a safety net, examining potential trades to make sure they align with your overall risk tolerance.

Think of it as a central authority that all your strategies consult before placing a trade. It keeps track of all active positions across those strategies, allowing for coordinated risk management.

This system is designed to enforce things like maximum position limits and to incorporate any custom risk validation rules you've set up. It's used automatically when your strategies are executing trades, preventing signals that would violate the rules.

The `_activePositions` property is a record of all active trades, which is regularly updated and stored (unless you're backtesting, in which case that storage is skipped). The `checkSignal` method is where the core risk checking takes place – it evaluates whether a trade is permissible based on the configured rules and current positions.

Finally, the `addSignal` and `removeSignal` methods are used to update the system whenever a strategy opens or closes a position, making sure the risk assessment is always current.

## Class ClientOptimizer

The `ClientOptimizer` helps you run optimization processes, acting as the core engine for that. It gathers data from various sources, handling large datasets by retrieving them in smaller chunks. This class builds a record of conversations with a language model as it works, crucial for complex strategy development. 

It’s responsible for creating the actual strategy code you’ll use, piecing together imports, helper functions, your strategy logic, and the necessary components to run it. Finally, it can generate a complete strategy file, including creating any necessary folders, so you can easily save and deploy your optimized strategies.  The `onProgress` function lets you track the progress of the optimization process.

## Class ClientFrame

The `ClientFrame` is a crucial component that handles the creation of time-based data used for backtesting trading strategies. Think of it as the engine that provides the sequence of dates and times your backtest will run against. It’s designed to be efficient, remembering previously calculated timeframes to avoid unnecessary repetition.

You can customize the interval between these timestamps, setting it anywhere from one minute to three days, depending on the level of detail your backtest needs. It also allows you to plug in custom functions to check the validity of the generated timeframes and to record important information during the process. This `ClientFrame` works closely with the backtesting logic to ensure the tests run smoothly across historical data.

The `getTimeframe` function is the primary way to get these timeframes; it generates and caches the date arrays for a specific symbol, and it's designed to be fast and memory-conscious.


## Class ClientExchange

The `ClientExchange` class provides a way to access exchange data within the backtest-kit framework. It’s designed to be a flexible client that interacts with exchanges, primarily for backtesting scenarios.

It allows you to retrieve historical and future candle data, essential for recreating past market conditions or simulating forward-looking strategies. You can also calculate the Volume Weighted Average Price (VWAP) based on recent trading activity, a useful indicator for assessing price trends.

For practical trading, it handles formatting quantity and price values to match the specific requirements of the exchange you're connected to, ensuring correct order placement. The class also provides a method to fetch the order book, providing a real-time snapshot of buy and sell orders. To keep things efficient, it uses prototype functions to minimize memory usage.

## Class CacheUtils

CacheUtils is a helper class designed to automatically cache the results of your functions, which can significantly speed up your backtesting process. It acts like a central manager, ensuring each function has its own private cache. 

You use the `fn` property to “wrap” your functions, telling CacheUtils to remember their results based on the timeframe you specify. This means if you call the function with the same inputs again, it will quickly return the cached value instead of recomputing it.

If you need to force a recalculation, the `clear` method lets you remove a single cached result for a specific scenario (like a particular trading strategy or exchange).  

The `flush` method is a more powerful option. It completely removes the cache for a function, forcing it to recompute *all* its results every time. You'd use this when you change the function's underlying logic, want to free up memory, or switch between different backtesting setups.

## Class BreakevenUtils

This class helps you analyze and report on breakeven events that have occurred during your trading tests or live trading. Think of it as a tool to understand how often your strategies hit breakeven points.

It gathers data from breakeven events, keeping track of things like when they happened, which symbol was involved, the strategy used, and details about the trade itself. You can access this data in a couple of ways.

First, you can get statistical summaries—like the total number of breakeven events—to give you an overview. 

Second, you can generate a nicely formatted markdown report that presents all the individual breakeven events in a table, including key information for each trade. Finally, this report can be easily saved to a file, making it simple to share or keep for your records. The file names are created using the symbol and strategy name, making them easy to identify.

## Class BreakevenReportService

This service helps you track when your trading signals reach their breakeven point, which is a crucial moment for understanding performance. It listens for these "breakeven" signals and diligently records them in a database. Think of it as a detailed logbook for your trading activity, capturing all the information about the signal when it hits breakeven. 

You can easily set it up to monitor your signals and then stop it when you no longer need it, preventing it from continuing to collect data.  It's designed to be safe and reliable, ensuring you don’t accidentally subscribe multiple times and flood your database. The service uses a logger to provide helpful debugging information and relies on a separate `tickBreakeven` component to process the events and store them.

## Class BreakevenMarkdownService

The BreakevenMarkdownService helps you create and save reports detailing when your trading strategies hit breakeven points. It listens for breakeven signals and gathers these events for each symbol and strategy you're using. The service then automatically generates nicely formatted markdown reports, including helpful statistics like the total number of breakeven occurrences.

You can subscribe to receive breakeven events, and the service handles preventing duplicate subscriptions. It also provides methods to retrieve accumulated data, generate reports, save those reports as markdown files to a designated directory, and even clear out old data when needed. The reports are organized by symbol, strategy, exchange, frame, and backtest settings, ensuring you have a clear record of your trading performance.

## Class BreakevenGlobalService

The BreakevenGlobalService acts as a central hub for tracking breakeven points within the trading system. It's designed to be injected into the ClientStrategy, providing a single point of access for breakeven-related operations. Think of it as a middleman: it receives requests, logs them for monitoring purposes, and then passes them on to the BreakevenConnectionService which handles the actual calculations and management.

It’s set up with various validation services to ensure the strategy, risk, exchange, and other elements involved are all valid before proceeding. To prevent unnecessary checks, the validation process is memoized – results are stored so they don't need to be repeated for the same combination of strategy, exchange, and frame.

The `check` function is responsible for determining whether a breakeven should be triggered, and `clear` handles resetting the breakeven state when a signal closes. Both functions prioritize logging for auditing and then delegate the core functionality.

## Class BreakevenConnectionService

The BreakevenConnectionService helps keep track of breakeven points for your trades. It’s designed to efficiently manage and reuse breakeven calculations, avoiding unnecessary work.

Essentially, it creates and stores a special "ClientBreakeven" object for each trading signal you're using, making sure each signal has its own calculation. It remembers these objects so it doesn't have to recreate them every time.

This service handles checking if a breakeven condition is met and clearing the breakeven state when a trade closes. It uses a clever caching system to optimize performance, ensuring resources are cleaned up when signals are no longer needed, and it also logs activities and reports events related to breakeven changes. It's a key component, working alongside other services like ClientStrategy and BreakevenGlobalService.

## Class BacktestUtils

This utility class provides tools for running and managing backtest simulations. It's designed to simplify the process of testing trading strategies.

The `run` function lets you execute a backtest and retrieve the results step by step. There’s also a `background` function for running tests silently in the background, ideal for tasks like logging or callbacks where you don't need the raw results.

Need to know what signals are currently pending or scheduled? The `getPendingSignal` and `getScheduledSignal` functions will fetch that information.

You can check if a signal has reached breakeven with `getBreakeven`.

For more control, there are methods to `stop`, `cancel`, `partialProfit`, `partialLoss`, `trailingStop`, `trailingTake`, and `breakeven`—allowing you to simulate specific actions within a backtest.  `stop` halts the strategy, `cancel` clears a scheduled signal without stopping the strategy, while the partial and trailing functions adjust open positions.  `breakeven` moves the stop-loss to the entry price.

Finally, the `getData` and `getReport` functions allow you to analyze the results of completed tests, and `dump` saves those reports to a file. `list` shows you a quick overview of all running backtest instances. This class handles creating isolated test environments for each symbol and strategy combination to ensure accuracy.

## Class BacktestReportService

The BacktestReportService helps you keep a detailed record of what your trading strategies are doing during backtesting. It acts like a diligent observer, meticulously logging important moments like when a signal starts, becomes active, or closes. 

It connects to your backtest and captures every significant event related to your trading signals. This information is then stored in a database, which is really useful for analyzing your strategy’s performance and identifying any potential issues. 

You can easily start and stop this service—it prevents accidental double-subscription. Once you're done, you can unsubscribe to stop it from recording, ensuring it doesn't interfere with other parts of your system. It relies on a logger service to provide useful debug messages.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create reports summarizing how your trading strategies performed during backtesting. It listens for events that occur during a backtest and keeps track of the signals generated by your strategy.

It compiles this information into nicely formatted markdown tables, which it then saves to files, making it easy to review and analyze your strategy's results.

The service uses a clever storage system to keep data organized and separate for each symbol, strategy, exchange, timeframe, and backtest run. You can generate reports for specific combinations of these factors, or get overall statistics. 

You can control how much data is saved and even clear out old reports to keep things tidy. It also provides a straightforward way to start and stop listening for backtest events.

## Class BacktestLogicPublicService

This service helps you run backtests in a more convenient way. It takes care of automatically passing along important information like the strategy name, exchange, and frame—you don’t have to include them in every function call. 

It essentially streamlines the backtesting process by wrapping around another core service. 

The main function you’ll use is `run`, which allows you to initiate a backtest for a specific symbol. It returns results as a stream, making it easy to process and analyze them. Think of it as the easy button for backtesting orchestration.


## Class BacktestLogicPrivateService

The `BacktestLogicPrivateService` helps you run backtests in a way that's efficient and avoids memory problems. It works by getting a series of timeframes, then processing them one by one, calling tick() for each. When a trading signal opens, it fetches the necessary candle data and runs the backtest calculations. 

The service then jumps ahead to when the signal closes, providing the result and moving on. It delivers results continuously as an async generator, meaning you don't have to wait for everything to finish before seeing some results.  You can even stop the backtest early if needed.

Essentially, it’s designed for testing your trading strategies in a streamlined and memory-conscious manner. This service relies on other core services – like logging, strategy core, exchange core, frame core, and method context – to function correctly. The `run` method is how you kick off a backtest for a particular symbol, and it provides an async generator that streams the backtest results as they become available.

## Class BacktestCommandService

BacktestCommandService acts as a central access point for running backtests within the backtest-kit framework. Think of it as a convenient way to trigger and manage backtesting processes. It's designed to work well with dependency injection, making it easy to integrate into different parts of your application. 

It relies on several other services to handle various tasks, such as logging, validating strategy and exchange configurations, and managing the backtest logic itself. 

The primary function you'll use is `run`, which allows you to start a backtest for a specific trading symbol, providing details about the strategy, exchange, and timeframe you want to use. This function returns a stream of backtest results as the process unfolds.

