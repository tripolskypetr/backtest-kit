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

The Walker Validation Service helps you keep track of and make sure your parameter sweep configurations – we call them “walkers” – are set up correctly. Think of it as a central place to register and verify these configurations, which are used for things like optimizing trading strategies or tuning hyperparameters. 

It allows you to add new walker configurations, check if a particular configuration exists before using it, and get a complete list of all the registered walkers. To make things efficient, it also remembers the results of previous validations so it doesn't have to repeat the work unnecessarily. The service uses a registry to manage walkers and caches validation results to speed things up.

## Class WalkerUtils

WalkerUtils provides helpful tools for working with walkers, which are essentially sets of trading strategies tested against historical data. Think of it as a central hub for easily running and managing these tests.

It simplifies the process of executing walker comparisons, automatically handling details like identifying the correct data source and logging progress. It ensures each walker instance runs independently for each symbol, preventing conflicts.

You can use WalkerUtils to:

*   Run comparisons and get results.
*   Run comparisons in the background when you only need side effects, like logging.
*   Stop walkers to halt signal generation, which is useful for pausing tests.
*   Retrieve complete results data from all strategies within a walker.
*   Generate and save reports summarizing the comparison results, customizing the information shown.
*   See a list of all currently running walkers and their status.

It's designed to be straightforward to use, offering a single, easy-to-access instance.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of different walker schema configurations in a safe and organized way. It uses a special system to store these schemas, making sure they are consistent and follow a defined structure. 

You can add new walker schemas using the `addWalker()` function, and then find them later by their names. The service also checks new schemas to ensure they have all the necessary parts before storing them.

If you need to update an existing schema, you can use the `override()` function to make changes. The `get()` function is available to easily retrieve a walker schema by its name when you need it.

## Class WalkerReportService

The WalkerReportService helps you keep track of how your trading strategies are performing during optimization. It’s like a dedicated recorder that listens for updates from your optimization process and neatly saves those results in a database.

Think of it as a way to see how different strategy settings compare against each other – it logs metrics and statistics for each test run. The service also helps you identify the best performing strategy and monitors how the optimization is progressing overall.

To get it working, you subscribe to receive optimization updates, and when you're done, you unsubscribe to stop the logging. The system makes sure you don't accidentally subscribe multiple times, which could lead to confusing results.

## Class WalkerMarkdownService

The WalkerMarkdownService helps you create reports in Markdown format that track the progress and results of your trading strategies. It listens for updates from your trading simulations – often called “walkers” – and keeps track of how each strategy is performing.

This service builds up a record of results for each walker, using a clever system to efficiently store and retrieve the information. When you’re ready, it transforms these results into nicely formatted Markdown tables, making it easy to compare different strategies side-by-side.

You can configure which data points and columns are included in the reports, and the service handles saving the reports directly to your logs directory. It also provides ways to clear out old data and manage subscriptions to the walker events. Essentially, this service takes the raw data from your simulations and presents it in a clear, organized, and easily shareable report.


## Class WalkerLogicPublicService

This service helps coordinate and manage the execution of "walkers," which are essentially automated trading strategies within your backtesting framework. It builds upon a private service to handle the core logic, but adds a layer of convenience by automatically passing along important information like the strategy name, exchange, and frame name to each walker. 

Think of it as a middleman ensuring that each trading strategy has all the details it needs to run correctly.

The `run` method is your main tool for initiating these walker executions, allowing you to specify a symbol and any relevant context. It returns a sequence of results, letting you iterate through the outcomes of each strategy's backtest.


## Class WalkerLogicPrivateService

This service helps you compare different trading strategies against each other, like a competition to see which performs best. It takes a symbol (like a stock ticker), a list of strategies you want to test, a metric you’ll use to measure performance (like profit), and some context details.

As each strategy runs, you'll get updates on its progress.  It keeps track of the best-performing strategy in real-time, so you can see how things are shaping up.  Finally, it gives you a complete report ranking all the strategies.

Internally, it uses other services to actually perform the backtesting and formatting the output. Think of it as a coordinator that manages and tracks the individual strategy tests.


## Class WalkerCommandService

WalkerCommandService acts as a central hub for interacting with the walker functionality within the backtest-kit framework. Think of it as a convenient way to access and manage the different services involved in running and validating your trading strategies. 

It's designed to be easily integrated into your projects using dependency injection, meaning you can plug it in and start leveraging the walker's capabilities.

Inside, it manages several key services, including those responsible for logging, walker logic, schema management, and various validation checks for your strategies, exchanges, frames, and overall walker configuration. 

The `run` method is the main entry point: it allows you to execute a walker comparison for a specific trading symbol, passing along important details about the environment in which the walker should operate, such as the walker's name, exchange name, and frame name. It returns a sequence of WalkerContract objects, allowing you to process the results iteratively.

## Class StrategyValidationService

The StrategyValidationService helps you keep track of your trading strategies and make sure they're set up correctly. Think of it as a central manager for all your strategies, ensuring they exist and, if you're using them, that the associated risk profiles are valid.

It lets you register new strategies using `addStrategy()`, so the service knows about them.  To check if a strategy is ready to go, you can use the `validate()` method.  The service also remembers previous validations, speeding things up. 

You can see a complete list of all registered strategies with `list()`, giving you a quick overview of what you've configured.  The service is designed to be efficient, reducing redundant checks.

## Class StrategySchemaService

This service helps you keep track of your trading strategy blueprints – essentially, the definitions of how your strategies work. It uses a secure and type-safe system to store these blueprints.

You can add new strategy blueprints using `addStrategy()`, and then retrieve them later by their name using `get()`.  If you need to make small adjustments to an existing blueprint, you can use `override()` to update specific parts without replacing the whole thing.

Before adding a new blueprint, the service checks that it's structurally correct using `validateShallow()`. This helps prevent errors down the line by ensuring all the necessary parts are there and of the right type.  The `register` property is used internally to manage the storage.

## Class StrategyCoreService

This service acts as a central hub for managing and interacting with trading strategies within the backtest kit. It essentially handles the behind-the-scenes operations, injecting important information like the trading symbol, timestamp, and backtest settings into the strategy's processes.

It has several key functions:

*   **Validation:** It thoroughly checks the strategy configuration and associated risk settings, making sure everything is set up correctly. This validation is optimized to avoid unnecessary repeats.
*   **Signal Management:** It provides ways to retrieve pending and scheduled signals, allowing monitoring of things like take-profit/stop-loss levels and scheduled activations.
*   **State Checks:** You can use it to determine if a strategy has reached breakeven, has been stopped, or to check its overall status.
*   **Core Operations:** It provides methods for executing backtests, stopping a strategy, canceling scheduled signals, and clearing cached strategy data. These actions are typically delegated to other services.
*   **Partial Adjustments:** It includes functions for executing partial profit or loss closures, and adjusting trailing stop-loss or take-profit levels.
*   **Context Handling**: All operations involve execution context to perform strategy execution related tasks.

## Class StrategyConnectionService

This service acts as a central hub for managing and executing trading strategies. It intelligently routes requests to the correct strategy implementation based on the specific symbol and strategy name being used, ensuring that each strategy operates independently. To optimize performance, it caches frequently used strategy instances, avoiding redundant initialization.

Before any strategy operations like generating signals or running backtests, it makes sure the strategy has been properly initialized. It seamlessly handles both real-time (tick) and historical data (backtest) scenarios.

Here's a breakdown of what it does:

*   **Strategy Routing:**  It finds the correct strategy implementation based on a combination of symbol, strategy name, exchange, and frame.
*   **Caching:** It stores frequently used strategies in a cache to avoid repeated loading, improving speed.
*   **Initialization:**  It guarantees that strategies are fully set up before they're used.
*   **Signal Management:** It provides methods to retrieve pending and scheduled signals for a strategy.
*   **Risk and Breakeven Calculations:** It includes logic for calculating breakeven points, checking for stopped states, and handling partial profit/loss executions.
*   **Control:** You can stop, clear (reset), and cancel signals from strategies.  The `clear` method forces a re-initialization of a strategy.
*   **Trailing Logic:** It enables adjustments to trailing stop-loss and take-profit distances.



The service relies on other components like the logger, execution context, strategy schema, exchange connection, and partial connection services to function properly.

## Class SizingValidationService

This service helps you keep track of your position sizing strategies and make sure they're set up correctly before you start trading. Think of it as a central place to register your different sizing approaches, like fixed percentage, Kelly Criterion, or ATR-based methods. 

You can add new sizing strategies using `addSizing`, and use `validate` to double-check that a strategy exists before using it in a backtest. This validation process also benefits from caching, so it’s fast and efficient. Finally, `list` lets you see a complete overview of all the sizing strategies you've registered. It's designed to simplify managing and verifying your sizing configurations.


## Class SizingSchemaService

The SizingSchemaService helps you keep track of different sizing strategies for your trading backtests. It’s like a central library where you can store and retrieve pre-defined sizing rules.

This service uses a safe and organized system to manage these sizing rules, making sure they’re consistently structured. You add new sizing rules using `register` and update existing ones with `override`.  Retrieving a sizing rule you need is easy with the `get` method, allowing you to quickly apply it in your backtesting process.

Before a sizing rule is added, a quick check (`validateShallow`) ensures it has all the necessary components in the right format. This ensures consistency and prevents errors later on.

## Class SizingGlobalService

The SizingGlobalService helps determine how much of an asset to trade, acting as a central hub for size calculations. It works closely with other services, including one for managing connections and another for ensuring sizing rules are valid. Think of it as the engine that figures out your trade sizes, taking into account your risk preferences and trading strategy. 

It's used behind the scenes by the backtest-kit framework to execute strategies and also provides an internal API for sizing calculations. 

Here's what makes up the service:

*   It relies on a logger to keep track of what’s happening.
*   It uses a connection service to communicate with the necessary systems for sizing.
*   It has a validation service to double-check that sizing calculations are correct.
*   The `calculate` method is the core function; it takes parameters like risk amount and a context object and returns the calculated position size.

## Class SizingConnectionService

The SizingConnectionService acts as a central hub for handling position sizing calculations within the backtest-kit framework. It intelligently directs sizing requests to the correct sizing implementation based on a provided name, ensuring the right sizing method is applied. 

To improve performance, it cleverly caches these sizing implementations, so it doesn’t have to recreate them every time you need them.  

This service allows strategies to use different sizing methods like fixed percentages or Kelly Criterion, and manages the interaction with sizing configurations. When a strategy doesn’t have specific sizing setup, you'll use an empty string for the sizing name. The `calculate` function is where the actual size calculation happens, taking into account your risk parameters and the selected sizing method.

## Class ScheduleUtils

ScheduleUtils is a helper class designed to make it easier to monitor and understand the timing of your trading signals. It keeps track of signals that are waiting to be processed, those that have been cancelled, and provides useful metrics like cancellation rates and average wait times. You can use it to gather information about signals for a specific trading strategy and market. 

This class provides methods to retrieve statistical data, generate clear markdown reports, and even save those reports directly to a file. It's set up to be readily available in your project, acting as a single, easy-to-use resource for signal scheduling insights. Essentially, it helps you understand how efficiently your signals are being handled.


## Class ScheduleReportService

The ScheduleReportService helps you keep track of when your trading signals are scheduled and what happens to them – whether they're executed or cancelled. It essentially monitors your signals and records key moments like when a signal is first scheduled, when it starts running, and when it's stopped.

This service connects to your signal events and automatically logs these events to a database. It even calculates how long a signal takes from scheduling to when it runs or gets cancelled, giving you valuable insights into potential delays. 

You can easily start and stop this monitoring process with the `subscribe` and `unsubscribe` functions, making sure you only record the data you need. It's designed to prevent accidental double-logging, so your records stay accurate. The `tick` property is where the real processing of events happens and the `loggerService` lets you see what’s going on for debugging.

## Class ScheduleMarkdownService

This service automatically creates reports about your trading signals, specifically focusing on when signals are scheduled and cancelled. It keeps track of these events for each strategy you're using and compiles them into easy-to-read markdown tables.

Think of it as a system that monitors your strategies, noting when signals are planned and if those plans ever change. It then summarizes this activity and saves it to files, making it simple to review how your strategies are behaving over time. You can customize the reports to show specific details, and even get statistics like cancellation rates to help you fine-tune your trading.

The service stores data separately for each combination of symbol, strategy, exchange, frame, and backtest, ensuring your reports stay organized. You can easily get the data, generate reports, or clear accumulated information as needed. It provides functions for subscribing to signal events, unsubscribing when finished, and even clearing out all the stored data when a fresh start is desired.

## Class RiskValidationService

This service helps you keep track of and verify your risk management setups. Think of it as a central place to register your risk profiles and double-check that they're available before you try to use them in your trading strategies.

It’s designed to be efficient, remembering the results of previous validations so it doesn’t have to re-check things unnecessarily.

Here’s what it does:

*   You can register new risk profiles using `addRisk`.
*   `validate` makes sure a risk profile exists before you proceed.
*   `list` allows you to see all the risk profiles that are currently registered.

## Class RiskUtils

The RiskUtils class helps you understand and analyze risk rejection events in your trading system. Think of it as a tool to review why trades might have been blocked or adjusted.

It gathers data about rejected trades, including details like the symbol involved, the trading strategy used, the position (long or short), and the reason for the rejection.

You can use RiskUtils to get statistical summaries of these rejections, such as the total number of rejections, broken down by symbol or strategy. It also allows you to generate nicely formatted markdown reports that display the rejection events in a table, along with the summary statistics at the bottom.

Finally, you can save these reports directly to files for later review or sharing, with filenames that clearly identify the symbol and strategy. It’s a great way to proactively identify and address potential issues in your trading setup.

## Class RiskSchemaService

The RiskSchemaService helps you keep track of your risk profiles in a safe and organized way. It's like a central address book for risk schemas, ensuring they’re consistent and properly structured. 

You can think of it as a place to register new risk profiles using the `addRisk()` (represented by the `register` property) method, and later easily find them again by name with the `get` property.  Before a risk profile is registered, it’s quickly checked to make sure it has all the necessary pieces using `validateShallow`. If you need to make changes to an existing risk profile, you can update it using the `override` property, providing only the information that's changed. This service uses a special system (`ToolRegistry` from functools-kit) to manage these risk profiles, guaranteeing type safety and preventing errors.

## Class RiskReportService

The RiskReportService helps you keep track of when your risk management system blocks trades. It acts like a recorder, catching all the signals that are rejected and saving them in a database. This lets you analyze why those trades were blocked and review your risk settings later on.

You can think of it as a listener that’s always watching for rejected signals.  It carefully logs each rejected signal, including the reason for the rejection and the details of the signal itself.  This information gets saved so you can review it later.

To get it working, you need to subscribe it to the system that’s generating these risk rejection events. Importantly, you only subscribe once – it prevents accidental duplicate subscriptions. When you're done, you can unsubscribe, which stops the service from listening for new rejection events.


## Class RiskMarkdownService

The RiskMarkdownService is designed to automatically create detailed reports about risk rejections during your trading backtests. It keeps track of every rejection event that happens, organizing them by the symbol being traded and the strategy being used. 

The service generates clear, readable markdown tables summarizing these rejections, including key statistics like the total number of rejections, broken down by symbol and strategy. These reports are saved as files on your disk, making it easy to review and analyze risk management performance. 

You subscribe to receive rejection events, and the service handles the accumulation and organization. The `getData` method lets you pull out summary statistics, while `getReport` creates the markdown report itself.  The `dump` method automatically saves the reports, and `clear` allows you to reset the accumulated data when needed – either for a specific symbol/strategy combination or all of them. This ensures you have a comprehensive, automated record of risk rejections.

## Class RiskGlobalService

The RiskGlobalService acts as a central hub for managing risk during trading. It uses a connection to a risk management system to ensure trading activity stays within defined limits. This service keeps track of open trades and validates configurations to prevent errors and redundant checks.

It provides methods for checking if a trade signal is permissible, registering new trades, closing existing trades, and clearing out risk data.  You can clear all risk data or target specific risk configurations for cleanup.  Essentially, it’s responsible for keeping your trading operations safe and compliant with pre-defined risk rules.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks within the backtest-kit. Think of it as a smart router that directs risk-related requests to the right place, ensuring your trading strategy adheres to defined risk limits.

It uses a clever caching system, so retrieving the correct risk implementation for a specific exchange and timeframe is fast and efficient. This caching is especially helpful if you’re frequently using the same risk settings.

The service handles things like validating portfolio drawdown, symbol exposure, and position counts against your pre-defined risk limits. If a signal triggers a risk limit breach, it flags this and lets the system know.

You can register new trades (signals) with the risk system so they are tracked and managed, and conversely, remove signals when they are closed out. Finally, you have the ability to clear the cached risk settings if you need to refresh them. This is especially useful when testing or modifying your risk configurations.

## Class ReportUtils

ReportUtils helps you control which parts of the backtest-kit framework generate detailed logs. Think of it as a way to turn on and off the recording for things like backtest runs, live trading, or performance analysis.

The `enable` function lets you pick which logging features you want active, and it returns a handy function to turn them all off again later. It’s really important to use that "turn off" function when you’re done, otherwise you might have issues with memory.

If you only need to stop some logging while others continue, `disable` allows you to individually switch off specific report services, without affecting the ones you still want to monitor. It’s a straightforward way to pause logging without needing to disable everything.

## Class ReportAdapter

The ReportAdapter helps you organize and store data generated during backtesting and live trading. It’s designed to be flexible, letting you easily switch between different storage methods without changing your core code. Think of it as a central hub for your logs and analytics.

It remembers which storage instances you’re using, ensuring you don't create unnecessary duplicates. The default storage method is appending data to JSONL files, but you can plug in alternatives. 

You can tell it what type of storage to use, like switching to a dummy adapter that doesn't actually save anything for testing purposes, or returning to the standard JSONL format. The adapter automatically starts storing data the first time you write something, and it handles the behind-the-scenes details of setting up and managing that storage.

## Class PositionSizeUtils

This class helps you figure out how much of an asset to trade based on different strategies. It's a collection of helpful tools, rather than something you create an instance of – think of it as a toolbox filled with position sizing methods.

Inside, you'll find methods like `fixedPercentage`, `kellyCriterion`, and `atrBased`, each with its own way of calculating the appropriate position size.  Each method carefully checks that the information you provide makes sense for the chosen sizing strategy, helping prevent errors. Essentially, it takes your account balance, entry price, and other relevant data, and then suggests a suitable position size to trade.

## Class PersistSignalUtils

This class provides tools to reliably save and load signal data, particularly useful for strategies that need to remember their state. It ensures that signal information is stored correctly, even if there are unexpected interruptions.

The framework automatically manages storage instances for each strategy, making it easy to keep track of data. You can also customize how the data is stored by plugging in your own adapter.

To get signal data back, `readSignalData` fetches it, and `writeSignalData` saves it, both designed to avoid data corruption issues. 

If you're experimenting or need to disable persistence entirely, `useDummy` provides a way to discard all write operations, effectively making the persistence system a no-op. And when you want to go back to standard storage, `useJson` switches to the default JSON adapter. Finally, `usePersistSignalAdapter` lets you define your own storage method for specialized needs.

## Class PersistScheduleUtils

PersistScheduleUtils helps manage how scheduled signals are saved and retrieved, particularly for strategies that need to remember their state. It ensures each strategy has its own dedicated storage and allows you to customize how that storage works.

The class handles reading and writing scheduled signal data, ensuring that the process is reliable even if the system crashes.  When a strategy starts, it uses `readScheduleData` to load any previously saved signals. When a strategy changes a scheduled signal, `writeScheduleData` saves that change safely to disk.

You can even swap out the default storage method.  `usePersistScheduleAdapter` lets you plug in your own custom way of storing the signals, `useJson` switches to the standard JSON format, and `useDummy` provides a way to test by effectively ignoring all persistence attempts.

## Class PersistRiskUtils

This class helps manage how your trading positions are saved and loaded, particularly for risk management. It ensures your active positions are reliably stored and restored, even if something unexpected happens.

It uses a clever system to keep track of different risk profiles, allowing you to tailor persistence strategies for each. You can even plug in your own custom ways of storing this data if the built-in methods don't quite fit your needs.

The class guarantees safe and consistent updates to your position data, preventing data loss due to crashes. When your system starts up, it automatically loads your saved positions, and whenever a signal is added or removed, it saves the updated positions.

You can easily switch between different persistence methods like using standard JSON files or a dummy adapter for testing purposes – the dummy adapter just throws away all write attempts.

## Class PersistPartialUtils

This class helps manage and store partial profit/loss information for your trading strategies, ensuring data isn't lost even if something goes wrong. It keeps track of these partial values separately for each symbol and strategy you're using.

You can customize how this data is stored by plugging in different adapters; or, if you're just testing, you can use a dummy adapter that effectively ignores any persistence attempts.

When your strategies start up, `readPartialData` retrieves previously saved partial data.  When your strategies make changes to profit/loss levels, `writePartialData` securely saves that updated information to disk, employing special techniques to avoid data corruption in case of unexpected interruptions. The framework handles this behind the scenes, so you don't have to worry about the low-level details of saving and loading. It uses a system of factories for managing the storage.

## Class PersistBreakevenUtils

This class helps manage and save the breakeven data – essentially, the progress and status – for your trading strategies. It automatically handles storing and retrieving this data to files on your computer so you don’t lose it.

Think of it as a central hub for keeping track of your strategy's state, ensuring that when you restart, things pick up right where they left off. It’s designed to be reliable, using techniques to avoid data corruption during saves.

You can even customize how this data is stored, switching between formats like JSON or even a "dummy" mode that simply ignores all save attempts for testing purposes. The system efficiently manages these storage connections, creating only one for each combination of trading symbol, strategy name, and exchange.  It intelligently initializes these connections only when needed, and automatically creates the necessary file structure.

## Class PerformanceReportService

This service helps you keep track of how long different parts of your trading strategy take to run. It acts like a data collector, listening for timing events during strategy execution. 

Think of it as a way to identify bottlenecks – where your strategy might be slowing down. It records these timing details along with relevant information and stores them in a database, making it easy to analyze and optimize your code.

You can easily set it up to start collecting data, and when you’re done, you can just as easily tell it to stop. It's designed to prevent accidentally subscribing multiple times, ensuring clean and reliable data collection. The service also provides a way to log debugging information.

## Class PerformanceMarkdownService

This service helps you understand how your trading strategies are performing. It keeps track of various performance metrics as your strategies run, like average execution time and potential bottlenecks.

It automatically gathers data based on your trading symbol, strategy name, exchange, timeframe, and whether it's a backtest or live trade.  Each combination of these factors gets its own dedicated storage space to keep things organized.

You can subscribe to receive these performance updates, and the service provides a way to unsubscribe when you no longer need them.  The `track` function is used to feed it the performance data as your strategies execute.

It also generates detailed reports in a readable markdown format, analyzing the performance and pinpointing areas for improvement. You can save these reports to your disk for later review.  If you need to start fresh, you can clear the stored performance data.

## Class Performance

The Performance class is your go-to tool for understanding how well your trading strategies are doing. It offers a straightforward way to gather and analyze performance data, helping you pinpoint areas for improvement.

You can retrieve detailed performance statistics for specific strategies and trading symbols using `getData`. This provides a breakdown of metrics like duration, average execution time, and volatility, which allows you to understand the performance in detail.

Want a clear, concise overview? `getReport` generates a user-friendly Markdown report that visualizes performance bottlenecks and key statistics, making it easy to spot where your strategy might be struggling.

Finally, `dump` lets you save these reports directly to your hard drive, either to a location you specify or the default `./dump/performance/{strategyName}.md` directory, enabling easy sharing and long-term tracking of your strategies' performance.

## Class PartialUtils

This class helps you analyze and report on partial profit and loss data generated by your trading strategies. Think of it as a tool to dig into those small gains and losses that happen before a trade is fully closed. 

It gathers data from events tracking partial profits and losses, storing a limited history of these events for each symbol and strategy combination. You can use it to get summary statistics like total profit/loss events, or to generate detailed reports. 

These reports are formatted as Markdown tables, showing key details for each event like the type of event (profit or loss), the symbol traded, the strategy used, and the price at the time. The reports also include a summary of the data. 

Finally, this tool can easily save those reports to a file on your computer, automatically creating the necessary folder structure to keep things organized. The file names clearly identify the symbol and strategy the report covers.

## Class PartialReportService

This service helps you keep track of every partial trade you make. It's designed to record when a position is closed with a partial profit or loss, storing details like the price and level at which the exit occurred.

It works by listening for signals indicating a partial profit or loss event.  You need to tell it to start listening by subscribing, and it will automatically send you a way to stop it.  The service then logs these events to a database for later analysis.

Think of it as a detailed log of all the little steps taken within your trading strategy. To use it, you tell it to start listening for profit and loss signals and then, when you're done, you tell it to stop listening. It handles the details of saving that information to your database.

## Class PartialMarkdownService

The PartialMarkdownService helps you create reports detailing your partial profits and losses during backtesting. It listens for signals about these events – both profits and losses – and organizes them by the trading symbol and strategy you’re using. 

It then builds nicely formatted markdown tables summarizing these events, along with overall statistics like total profit and loss counts. You can save these reports to your disk, making it easy to review and analyze your trading performance.

You can subscribe to receive these signals, and the service makes sure you don't accidentally subscribe more than once. The `getData` method lets you pull statistical summaries, `getReport` generates the markdown reports, and `dump` saves them to a file. Finally, `clear` allows you to reset the accumulated data, either for a specific symbol and strategy or for everything.


## Class PartialGlobalService

This service acts as a central hub for managing partial profit and loss tracking within your trading strategy. It's designed to be injected into your strategy, providing a single point of access for these operations. Think of it as a middleman; when your strategy needs to record a profit, loss, or clear a partial state, this service logs the action and then passes it on to a dedicated connection service to handle the actual work.

It uses separate services for validating your strategy setup – making sure everything like the risk, exchange, and frame you're using are all valid. This validation is cached to prevent repeated checks.

The `profit`, `loss`, and `clear` functions are the main ways your strategy interacts with this service. They log events before forwarding them, so you have a clear record of what's happening at a global level. This helps with monitoring and troubleshooting. Essentially, it provides a structured and logged way to handle partial profit/loss management.

## Class PartialConnectionService

The PartialConnectionService manages how profit and loss information is tracked for individual trading signals. It's like a central hub that keeps track of each signal's performance. 

Think of it as a smart factory – whenever a new signal comes in, it creates a dedicated record (a `ClientPartial`) to manage its profit and loss. This record isn’t created every time; it intelligently reuses existing records thanks to a caching system.

It handles profit and loss calculations, sending out notifications when new profit or loss levels are hit, and cleaning up the records when signals are closed. This service works closely with the overall trading strategy and ensures that information about each signal's performance is organized and accessible. 

The service's “memoize” feature ensures that it’s efficient, avoiding unnecessary creation of records. When a signal is finished, it cleans up its record, preventing memory buildup.

## Class OutlineMarkdownService

This service helps to automatically create documentation in markdown format, especially useful for debugging and understanding how AI-powered trading strategies work. It's designed to be used by the AI Strategy Optimizer to record important details from the conversations and outputs of the AI.

The service organizes these records into a specific folder structure under a `dump/strategy/{signalId}` directory. Inside that directory, you’ll find files documenting the system prompt, each user message, and the final output from the AI.

The service uses a logger for its operations and provides a function, `dumpSignal`, to write the conversation history, signal data, and AI output to these markdown files. It smartly avoids overwriting existing documentation if a directory has already been created.

## Class OptimizerValidationService

The OptimizerValidationService helps keep track of available optimizers within the backtest-kit framework, ensuring they're properly registered and can be used reliably. Think of it as a central directory for optimizers.

It allows you to register new optimizers, preventing you from accidentally adding the same one twice. 

When you need to verify that an optimizer is available, the service provides a quick validation check, and it's designed to be speedy even if you perform this check repeatedly.

You can also get a complete list of all registered optimizers and their details if you need to examine them. It basically manages and protects your optimizer setup.

## Class OptimizerUtils

OptimizerUtils provides helpful tools to work with strategies generated by your optimization runs. You can use it to retrieve the strategy data, like the generated strategies and their associated metadata, after an optimization is complete. It also allows you to easily generate the complete code for your strategies, bundling everything together into a single, runnable file. Finally, you can use OptimizerUtils to save this generated code directly to a file, making it simple to deploy and execute your optimized strategies. The file names follow a clear naming convention, including the optimizer's name and the trading symbol.


## Class OptimizerTemplateService

This service acts as a central hub for creating the code snippets needed for backtesting and optimization. It uses a large language model (LLM) to generate various parts of the trading strategy, including the initial setup, strategy logic, and data handling. 

It offers features like analyzing data across different timeframes (from 1-minute to 1-hour), creating structured JSON outputs for trading signals, and providing helpful debug logs. The service also incorporates CCXT for connecting to exchanges like Binance, and a "Walker" system to compare different trading strategies.

The service provides methods to generate code for everything from the initial banner with imports to the final launcher that runs the backtest.  It assists in crafting messages for the LLM, creating configurations for exchanges and timeframes, and producing code to save intermediate results and formatted text/JSON outputs. These outputs adhere to a specific JSON schema for signals, ensuring consistent and structured trading instructions.

## Class OptimizerSchemaService

This service helps keep track of different optimizer configurations, ensuring they're set up correctly. It acts like a central hub for managing these configurations, validating that they have all the necessary information. 

You can register new configurations with it, and it will check to make sure they contain key details like the optimizer's name, training range, data source, and how prompts are retrieved.  If a configuration already exists, you can update parts of it, blending in your changes with the original. Finally, it provides a way to easily retrieve a specific configuration by its name. It’s all about keeping your optimizer setups organized and reliable.


## Class OptimizerGlobalService

This service acts as a central point for interacting with optimizers, ensuring everything runs correctly and securely. It's like a gatekeeper, logging what's happening and making sure the optimizer you're trying to use actually exists. 

It handles requests to retrieve data, generate code, or save code to a file, always double-checking before passing the work on to other services.  

Here’s a quick look at what it does:

*   **`getData`**:  Gets information about the strategies defined for a specific optimizer – think of it as pulling up the details of a particular trading approach.
*   **`getCode`**:  Combines everything to produce the actual code you'd use to run a strategy.
*   **`dump`**: Creates a file containing the generated code, ready to be used.



The service relies on other components: a logger for tracking activity, a validation service to confirm optimizers are valid, and a connection service to handle the underlying optimizer operations.

## Class OptimizerConnectionService

The OptimizerConnectionService is like a helpful manager for connecting to and reusing optimizer tools. It keeps track of these tools, so you don't have to create them every time you need one, making things faster. It combines default settings with any customizations you provide to ensure your optimizers work exactly as intended.

It has these key functions:

*   It provides a simple way to get an optimizer instance, remembering the ones you've already created.
*   You can ask it to retrieve data related to a specific symbol and optimizer.
*   It can generate the actual code needed to run a trading strategy.
*   It's able to save generated code directly to a file if you need it.

This service handles the behind-the-scenes complexities, allowing you to focus on building and testing your trading strategies. It uses other services to manage logging, schemas, and templates, ensuring everything works together smoothly.

## Class NotificationUtils

This class, NotificationUtils, makes it easy to work with notifications within the system. It handles some behind-the-scenes setup so you don’t have to worry about it.

Think of it as a simplified way to get and manage your notifications. You can fetch a list of all notifications, sorted with the newest ones appearing first, or you can completely clear the notification history.  The internal `_instance` property holds the actual logic for dealing with notifications.

## Class MarkdownUtils

MarkdownUtils helps you control whether or not different parts of the backtest-kit framework create markdown reports. Think of it as a central switchboard for report generation.

You can selectively turn on markdown reporting for things like backtests, live trading, or performance analysis. When you enable a service, it starts collecting data and will generate reports when needed.  It's really important to remember to "unsubscribe" from the enabled services when you're done with them to avoid issues later on.

Conversely, you can disable markdown reporting for specific areas, allowing you to control the level of detail and resource usage.  Disabling doesn't require a special unsubscribe step – the reporting is simply stopped. 

This utility class is designed to be used and extended by other components, like MarkdownAdapter, to add more specific functionality.

## Class MarkdownAdapter

The MarkdownAdapter helps manage how your markdown data is stored, offering flexibility and efficiency. It uses a pattern that lets you easily swap out different storage methods without changing the rest of your code.  It also keeps track of storage instances so you don't create unnecessary duplicates, ensuring only one storage area exists for each type of markdown data like backtest results or live data.

You can choose between storing your markdown as separate files (.md) or appending it to a single JSONL file, or even use a dummy adapter to discard writes for testing purposes.  The default is to create separate files, but you can change this easily. The adapter automatically sets up the storage the first time you write data, and it's designed to be simple to use with shortcuts for common storage types. It gives you control over which adapter to use and when.

## Class LoggerService

The LoggerService helps ensure consistent logging across the backtest-kit framework by automatically adding useful information to your log messages. It essentially acts as a wrapper around your chosen logging mechanism.

You can plug in your own logger using the `setLogger` function, or if you don't provide one, it will default to a do-nothing logger.

The service automatically includes details about which strategy, exchange, and frame are being executed, as well as specifics about the symbol, time, and whether it's a backtest. This context helps you quickly understand what's happening when you review logs.

The `log`, `debug`, `info`, and `warn` functions provide different logging levels, all with automatic context injection. Think of them as convenient shortcuts for logging messages with varying degrees of importance.

## Class LiveUtils

This utility class helps manage live trading operations, providing a way to run strategies and interact with them. It acts as a central point for running live trades, handling potential crashes, and providing useful tools for monitoring and control.

The `run` function is the main way to start a live strategy; it creates an ongoing stream of trading results, automatically recovering from errors.  For background tasks like persistence or callbacks, you can use `background` to run the trading process without directly handling the output.

Need to check on the current state of a strategy? `getPendingSignal` and `getScheduledSignal` retrieve the active signals, while `getBreakeven` checks if the price has moved far enough to cover costs.

You can influence the strategy's behavior with functions like `stop` (to halt new signals) and `cancel` (to remove scheduled signals).  There are also methods for adjusting positions, such as `partialProfit`, `partialLoss`, `trailingStop`, and `trailingTake`, allowing for dynamic adjustments to stop-loss and take-profit levels. Importantly, `trailingStop` and `trailingTake` prioritize maintaining protection and prevent errors by always calculating from the *original* stop/take values.

Finally, the `breakeven` function moves the stop-loss to the entry price when a certain profit threshold is reached.  You can also retrieve statistics and reports with `getData` and `getReport`, and list all active instances with `list`. The `dump` function saves reports to a file for later review.

## Class LiveReportService

The LiveReportService helps you keep a close eye on your live trading strategies by recording every important event as they happen. It’s designed to capture events like when a signal is idle, opened, active, or closed, storing all the details in a database. Think of it as a real-time logbook for your trading activity.

You can use it to monitor how your strategies are performing and analyze them later.  The service listens for these events and automatically saves them, so you don't have to worry about manually tracking everything. It prevents you from accidentally subscribing multiple times, ensuring efficient operation.

To use it, you'll subscribe to receive the events, and when you’re done, you can unsubscribe to stop the recording. The `tick` property handles the actual processing and database logging, while `subscribe` manages the connection to the live data feed.

## Class LiveMarkdownService

The LiveMarkdownService helps you automatically generate and save detailed reports of your live trading activity. It keeps track of everything that happens during your trades—from periods of inactivity to when positions are opened, active, and closed—for each strategy you're using. 

The service listens for updates as your strategies run and converts this information into easy-to-read markdown tables, including key trading statistics like win rate and average profit. It saves these reports to your logs folder, creating a history of your trading performance for each strategy. 

You can subscribe to receive these updates as they happen, and unsubscribe when you’re done. It also offers functions to get specific data, generate custom reports, save them to disk, and even clear out old data when you need to. It’s designed to be flexible, allowing you to clear data for individual strategies or everything at once.


## Class LiveLogicPublicService

This service helps manage live trading operations, simplifying the process by automatically handling context information like the strategy name and exchange. It essentially acts as a convenient layer on top of a more private service. 

Think of it as an engine that continuously runs your trading strategy – it's designed to keep going indefinitely.  Even if something unexpected happens and the process crashes, it’s built to recover and pick up where it left off, saving your progress. 

The core function, `run`, is how you kickstart the trading process for a specific symbol. It delivers a stream of trading results (signals to open or close positions) continuously, all while automatically managing the necessary context for your strategy.


## Class LiveLogicPrivateService

This service handles the behind-the-scenes work of running a live trading strategy. Think of it as the engine that continuously monitors the market and executes trades. It operates in an endless loop, constantly checking for new trading signals and efficiently streaming the results – only the trades that are actually opened or closed are sent out.

The system is designed to be resilient; if something goes wrong, it can automatically recover and continue trading from where it left off. It uses real-time data to ensure you’re always operating with the latest information, and it's structured to be memory-efficient so it can handle long periods of trading. 

To start trading, you simply provide the trading symbol, and it will start sending you a stream of opened and closed trade results. It's like a live feed of your strategy's actions.

## Class LiveCommandService

This service provides a straightforward way to access live trading features within the backtest-kit framework. It acts as a central point, making it easier to manage dependencies and integrate live trading functionality into your applications. 

Think of it as a helper that simplifies interactions with the underlying live trading logic. It handles the complexities behind the scenes, giving you a clean interface for starting and managing live trades.

The core functionality revolves around the `run` method, which allows you to initiate live trading for a specific symbol. This method continuously generates trading results and is designed to handle unexpected errors and automatically recover from crashes, ensuring uninterrupted operation. You'll need to provide the symbol you want to trade and some context, like the names of the strategy and exchange you're using.

## Class HeatUtils

HeatUtils simplifies creating and analyzing portfolio heatmaps within the backtest-kit framework. It acts as a central point for gathering and presenting performance data across all symbols used by a specific strategy. 

You can use it to retrieve aggregated statistics – like total profit/loss, Sharpe Ratio, and maximum drawdown – for each symbol within a strategy’s historical performance. 

It also generates nicely formatted markdown reports that display this information in a sortable table, allowing you to easily compare the performance of different symbols.  Finally, HeatUtils can automatically save these reports as markdown files to your desired location, making it easy to share and archive your backtesting results. It's designed to be readily available throughout your backtest processes.

## Class HeatReportService

The HeatReportService helps you keep track of your trading signals and how they perform. It's designed to gather information about signals that have closed, specifically focusing on the profit and loss (PNL) associated with them.

Think of it as a system that listens for "signal events," but only cares about when a signal has finished and resulted in a gain or loss. This data is then recorded in a special database for later analysis, enabling you to generate heatmaps that visualize your portfolio's performance across different assets.

To use it, you subscribe to receive these signal events, and a function is returned allowing you to easily stop the service from listening. The system ensures that you won't accidentally subscribe multiple times, preventing redundant data collection.


## Class HeatMarkdownService

The Heatmap Service helps you visualize and analyze your trading performance across different strategies and symbols. It listens for trading signals and automatically gathers key statistics like total profit and loss, Sharpe Ratio, and maximum drawdown for each symbol and strategy.

It organizes this information neatly, keeping separate data for each exchange, timeframe, and backtest mode so you can easily compare different setups. You can request the current data or generate a user-friendly markdown report that summarizes your portfolio’s performance, making it easy to share or keep records. 

The service is designed to be safe, handling potential mathematical errors gracefully, and it also remembers previously accessed data to improve performance. There’s a way to stop it from listening for new signals if you need to. Finally, you can completely clear the accumulated data whenever you want, either for everything or just a specific trading configuration.

## Class FrameValidationService

This service helps you keep track of your trading timeframes and make sure they're properly set up. Think of it as a central place to manage all your timeframe definitions. 

You can register new timeframes using `addFrame`, providing a name and schema for each. Before you start any trading logic, the `validate` function lets you check if a particular timeframe actually exists, preventing errors later on.  To speed things up, it remembers previous validation results.  Finally, `list` allows you to see all the timeframes you’ve registered. It manages all your timeframes and makes sure everything is working correctly.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of the blueprints for your trading strategies, ensuring they all follow a consistent structure. It’s like a central library where you store and manage these blueprints.

You can think of it as a place where you register your strategy templates using the `register` method, giving each one a unique name.  If you need to make changes to an existing blueprint, you can use `override` to update just the parts that need changing. Need to grab a blueprint?  Just use `get` and provide its name, and it’ll be delivered. 

This service uses a system to make sure the blueprints you add are properly formatted before they're stored, making sure everything's in order. It also utilizes a specialized storage system for type-safe management of these schemas.

## Class FrameCoreService

The FrameCoreService acts as a central hub for managing timeframes within the backtesting process. It's a core component, working behind the scenes to provide the necessary time data. Think of it as the engine that prepares the historical data – the time periods – that your trading strategies will be tested against.

It relies on other services like `FrameConnectionService` to actually fetch the timeframe data, and `FrameValidationService` to ensure it's correct. The `getTimeframe` function is its main offering: you give it a symbol (like "BTCUSDT") and a timeframe name (like "1h" for one-hour candles), and it returns an array of dates representing that timeframe for backtesting. This service is crucial for setting up the data foundation of any backtest.


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for working with different trading frames, like historical data sets. It automatically directs your requests to the correct frame based on the context of your operation. 

To improve performance, it keeps a record of the frames it's already created, so you don't have to recreate them every time. 

It's designed to manage backtesting time periods by providing start and end dates for analysis. When operating in live mode, it doesn't restrict the frames being used. 

Essentially, it simplifies frame management, caching frames for efficiency and allowing you to define specific time periods for backtesting. It utilizes a couple of helper services – loggerService, frameSchemaService, and methodContextService – to accomplish its tasks. 

The `getFrame` function is the primary way to access a frame, and the `getTimeframe` function allows you to specify the start and end dates for your backtests.

## Class ExchangeValidationService

This service helps you keep track of your exchanges and make sure they're set up correctly before you start trading. Think of it as a central manager for your exchange configurations.

It lets you register new exchanges, check if an exchange actually exists before you try to use it, and even provides a handy list of all the exchanges you’ve registered. To make things efficient, it remembers the results of its checks, so it doesn’t have to re-validate exchanges repeatedly. You can use it to ensure that your trading framework has a solid foundation of properly configured exchanges.

## Class ExchangeUtils

The ExchangeUtils class is designed to make interacting with different cryptocurrency exchanges easier and more reliable. It acts as a central helper, ensuring that data requests and formatting adhere to each exchange’s specific rules. You’ll find it’s a single, readily available resource for common exchange-related tasks.

It includes a convenient way to retrieve historical price data (candles) from exchanges, automatically figuring out the correct timeframe and starting point for your requests.  You can also use it to calculate the VWAP (volume-weighted average price) and to correctly format trade quantities and prices to match the formatting required by each exchange. This formatting helps prevent errors when placing orders. The system ensures each exchange operates with its own isolated instance for consistent behavior.

## Class ExchangeSchemaService

This service helps keep track of different exchange configurations, ensuring they're set up correctly and consistently. It acts as a central place to store and manage these configurations, using a secure and type-safe system.

You can add new exchange configurations using the `addExchange` function and retrieve them later by their name. Before adding a new configuration, the service performs a quick check to make sure all the necessary information is present.

If a configuration already exists, you can update parts of it using the `override` function, allowing for easy adjustments without replacing the entire setup. Essentially, it's a system for organizing and controlling how your trading strategies interact with different exchanges.

## Class ExchangeCoreService

ExchangeCoreService acts as a central hub for interacting with exchanges within the backtest-kit framework. It's designed to streamline operations by automatically including important details like the trading symbol, the specific time, and backtest settings into each request. Think of it as a layer that sits between your trading logic and the actual exchange connection, making sure everything is properly contextualized.

It relies on other services to handle things like logging, connecting to the exchange, and validating configurations. The `validate` property simplifies checking if an exchange setup is correct, avoiding repeated checks. 

You can use it to retrieve historical price data (`getCandles`), get hypothetical future data when backtesting (`getNextCandles`), and calculate things like the average price (`getAveragePrice`). It also provides helpful tools (`formatPrice`, `formatQuantity`) for ensuring prices and order quantities are displayed correctly for the specific context of your trading.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently directs your requests to the correct exchange based on the context of your operation, making it easy to switch between exchanges without changing your code.

To improve efficiency, it remembers previously used exchange connections, so you don't have to re-establish them every time. This service also implements the standard `IExchange` interface and provides logging to track all interactions.

Here's a quick look at what it offers:

*   **Automatic Exchange Selection:** It figures out which exchange to use based on configuration.
*   **Cached Connections:** Keeps track of exchange connections to avoid unnecessary setup.
*   **Candle Data Retrieval:**  Fetches historical and future candle data for price analysis.
*   **Price and Quantity Formatting:** Automatically adjusts prices and quantities to match the specific rules of the exchange you're using, ensuring your orders are correctly formatted.
*   **Average Price Calculation:** Provides current average prices, adapting its method depending on whether you’re in a backtesting or live trading environment.

## Class ConstantUtils

This class provides a set of pre-calculated values that help manage take-profit and stop-loss levels in your trading strategies, designed around the Kelly Criterion and an approach that gradually reduces risk. Think of these values as checkpoints along the way to your ultimate profit or loss targets.

For example, if your target profit is 10%, TP_LEVEL1 is set to 30%, meaning it triggers when the price has moved 3% in your favor. TP_LEVEL2 triggers at 6% and TP_LEVEL3 at 9%, allowing you to capture profits in stages.

Similarly, the stop-loss levels work in a similar way, protecting you from excessive losses. SL_LEVEL1 warns you at 40% of the potential loss, while SL_LEVEL2 signals a more decisive exit to prevent significant losses. These constants allow for a systematic, mathematically-informed approach to profit-taking and risk management.

## Class ConfigValidationService

This service acts as a safety net for your backtesting configurations, making sure your settings are mathematically sound and won’t lead to unprofitable trades. It double-checks all your global parameters, like slippage, fees, profit margins, and timeouts. 

The service verifies that percentage values are non-negative, and ensures that your take-profit distance is sufficient to cover trading costs, guaranteeing a potential profit when the target is hit. It also enforces rules about the relationships between settings (like minimum and maximum values) and confirms that time-related parameters are positive integers. Basically, it prevents common configuration mistakes that can sabotage your backtesting results. 

The `validate` function performs all these checks, giving you confidence that your configuration is set up correctly. You can also access the `loggerService` property to help in debugging validation issues.


## Class ColumnValidationService

This service acts as a safety net for your column configurations, making sure they’re set up correctly and won't cause problems later. It diligently checks each column definition to ensure it has all the necessary pieces – a unique identifier (`key`), a descriptive label (`label`), a formatting rule (`format`), and a visibility setting (`isVisible`).  

It also makes sure these identifiers (`key`) are all distinct within their groups, and confirms that the formatting and visibility rules are actually functions that can be executed. Basically, it helps prevent common errors and keeps your column definitions consistent and reliable. The `validate` method does all this checking, ensuring your configurations are structurally sound.

## Class ClientSizing

This component, ClientSizing, helps determine how much of your assets to use for each trade. It’s designed to be flexible, offering several common sizing strategies like fixed percentages, Kelly criterion, and Average True Range (ATR) based sizing. You can also set limits on your position size, ensuring you don't risk too much on any single trade. 

It allows for callbacks, which means you can add your own logic for checking and recording sizing decisions. Essentially, ClientSizing takes information about a trade and calculates the appropriate position size, all while respecting your defined rules and constraints. The `calculate` method is the core function where the sizing calculation actually happens, taking parameters specific to that calculation and returning the recommended position size.

## Class ClientRisk

ClientRisk helps manage the overall risk of your trading portfolio, preventing strategies from taking actions that could exceed your defined limits. It’s like a safety net that works across all your strategies, ensuring they don't collectively violate risk rules.

This system keeps track of all currently open positions, even if they are managed by different trading strategies. It uses this information to validate new trading signals before they’re executed, preventing signals that would push the portfolio beyond acceptable risk levels.

ClientRisk is initialized once to load existing positions, and this initialization is skipped when running simulations. It also periodically saves the current positions to disk, although this saving isn’t done during simulations.

You can define custom risk checks that have access to information about the signal being considered and the current state of the portfolio.  The `checkSignal` method determines whether a signal should proceed, and it instantly rejects a signal if any check fails.

When a trade is opened, the `addSignal` method is called to register the new position, and `removeSignal` is called when a trade is closed. These methods are used to update the internal record of active positions.

## Class ClientOptimizer

This component, the ClientOptimizer, helps manage and run optimization processes. It gathers data from various sources, handles page-by-page loading, and organizes it to build a history of conversations for use with large language models. It's also responsible for generating the actual code for your trading strategies, putting everything together – imports, helper functions, the strategy itself, and components needed to execute it.  Finally, it allows you to save the generated code to a file, creating the necessary directories if they don't already exist. The `onProgress` property lets you track the optimization’s progress as it runs.

## Class ClientFrame

The ClientFrame is the engine that creates the timelines your backtesting uses. It’s responsible for generating the arrays of timestamps – the exact dates and times – that your trading strategies will step through when simulating historical trades.  To avoid unnecessary work, it remembers previously generated timelines and reuses them.

You can customize the interval between these timestamps, from as short as one minute to as long as three days. The ClientFrame also allows you to hook into the timeline creation process with callbacks, so you can check if the generated times are valid or log information about them. It works closely with the backtesting logic to provide the data needed to run simulations over time.

The `getTimeframe` function is the core method, producing these timeline arrays. Think of it as requesting a timeline for a specific asset; it handles caching the result so you don't have to generate the same timeline multiple times.

## Class ClientExchange

The ClientExchange class provides a way to access exchange data within a backtesting environment. It's designed to be memory-efficient by using prototype functions.

You can retrieve historical candle data based on a specific symbol and time interval, moving backwards from the current time.  It also allows you to fetch future candles, which is crucial for simulating trading strategies during backtesting by providing data for the signal duration.

To help with trade execution, the class calculates the VWAP (Volume Weighted Average Price) using the last few 1-minute candles – the exact number is set globally. You can also format quantity and price values to adhere to the exchange's specific rules, ensuring correct representation based on the asset’s lot size and price filters. Essentially, this class simplifies getting the data and preparing it for your backtesting or trading needs.

## Class CacheUtils

CacheUtils is a helper class designed to make caching function results easier, especially when dealing with time-based data like candlestick charts. It essentially wraps your functions so they remember previous results based on the timeframe you specify.

Think of it as a way to avoid recomputing things repeatedly when you know the answer hasn't changed. The `fn` property is the main tool - you use it to wrap your functions.

There's also a `flush` method that lets you completely clear out all cached results for a specific function. This is useful if you've made changes to the function itself and want to ensure you’re using fresh calculations.  Alternatively, `clear` allows you to remove the cached value only for the current situation – like a specific strategy and trading mode – while leaving other cached results intact. 

It's a singleton, meaning there's only one instance of it, making it simple to use throughout your code.

## Class BreakevenUtils

This class helps you analyze and report on breakeven events – those moments when a trade reaches its breakeven point. It’s designed to provide insights into your trading strategies by gathering data and presenting it in a clear, understandable way.

You can use it to get overall statistics about breakeven events, such as how many times they've occurred.  It can also create nicely formatted reports in Markdown, which include tables showing details about each breakeven event, like the symbol traded, the strategy used, entry and breakeven prices, and the time it happened.

Finally, you can easily export these reports to files, so you can keep a record of your breakeven performance or share them with others. The reports are saved as Markdown files, named using the symbol and strategy name, for easy identification. The data comes from a service that listens for breakeven events and keeps track of them, storing the information for later analysis.

## Class BreakevenReportService

The BreakevenReportService helps you keep track of when your trading signals reach the breakeven point. It's designed to listen for these "breakeven" moments and record them, including all the details about the signal that achieved it. Think of it as a way to automatically log milestones in your trading strategy's performance.

To use it, you’ll need to subscribe to the breakeven signal – this starts the logging process and ensures you only subscribe once. When you're done, you can unsubscribe to stop the recording. The service stores this information so you can analyze how often your signals reach breakeven. It uses a logger to provide feedback during operation.

## Class BreakevenMarkdownService

The BreakevenMarkdownService helps you automatically create and save reports about breakeven events – those points where a trade becomes profitable. It listens for these events, keeps track of them for each specific symbol and trading strategy, and then turns that information into nicely formatted markdown tables. 

You can think of it as a system that gathers data about how your trades are performing and presents it in a readable report. The reports include details about each event and overall statistics.

The service saves these reports as `.md` files, organized by symbol and strategy, making it easy to review your trading performance. You can also clear the data if you need to start fresh or want to delete specific reports. It uses a storage system that ensures each symbol-strategy combination gets its own independent data space.

## Class BreakevenGlobalService

BreakevenGlobalService acts as a central hub for managing breakeven calculations within the system. Think of it as a middleman – it receives requests related to breakeven tracking and passes them on to a connection service while keeping a record of everything that's happening. This service is injected into the main trading strategy, ensuring a consistent way to handle breakeven operations across the entire system.

It's designed to make monitoring easier because all breakeven-related actions are logged in one place. It also simplifies the trading strategy’s interaction with the underlying breakeven mechanics.

Here's a breakdown of what it handles:

*   **Validation:** It checks to make sure the trading strategy and its associated settings (like risk and exchange details) are all valid before proceeding. It’s smart about this, remembering previous checks so it doesn’t repeat work unnecessarily.
*   **Breakeven Triggering:** The `check` function determines if breakeven conditions are met and, if so, it triggers the necessary actions.
*   **Breakeven Clearing:** When a trading signal closes, the `clear` function resets the breakeven state.

Ultimately, BreakevenGlobalService provides a controlled and trackable way to handle breakeven calculations, keeping everything organized and manageable. It relies on other services provided by the dependency injection container for logging, connection management, and validation.

## Class BreakevenConnectionService

The BreakevenConnectionService helps track and manage breakeven points for your trading signals. It’s designed to be efficient, creating and reusing breakeven tracking objects for each signal to avoid unnecessary overhead.

Think of it as a central hub that keeps track of these breakeven points, ensuring they're properly initialized and cleaned up when no longer needed. It stores these tracking points for each signal ID, making sure you're not creating new ones every time. 

This service handles the details of creating, managing, and clearing these tracking objects, letting your trading strategy focus on the core logic. It works closely with other parts of the system to ensure everything stays in sync. Specifically, it manages objects called ClientBreakeven, creating them on demand and cleaning them up when signals are finished. It also notifies other parts of the system when a breakeven condition is met or cleared.

## Class BacktestUtils

This class, `BacktestUtils`, offers a suite of tools to manage and interact with backtesting processes. It's designed to simplify running backtests and getting information about them.

The `run` method is your go-to for initiating a full backtest, providing results as it progresses. If you just want to run a backtest in the background – for example, to log data or trigger callbacks – without needing the results immediately, use `background`.

Need to check on the status of a backtest? `getPendingSignal` and `getScheduledSignal` will fetch details about active signals.  You can also use `getBreakeven` to see if a pending signal has met its breakeven point.

For more direct control, `stop` halts signal generation, `cancel` clears a scheduled signal, and `partialProfit`/`partialLoss` allow you to manage partial position closures. `trailingStop` and `trailingTake` help refine trailing stop-loss and take-profit orders by making percentage adjustments while protecting against error accumulation. The `breakeven` method moves the stop-loss to the entry price when a certain profit threshold is met.

Finally, `getData` retrieves backtest statistics, `getReport` generates a report in markdown format, `dump` saves that report to a file, and `list` provides a quick overview of all running backtest instances and their statuses. The system ensures each symbol-strategy combination gets its own dedicated backtest instance, keeping things isolated and organized.

## Class BacktestReportService

The BacktestReportService helps you keep a detailed record of your backtesting strategy's activity. It acts like a meticulous observer, noting down every key moment – when a signal is idle, when it's opened, active, and finally closed. 

It connects to your backtest and listens for these signal events, saving all the relevant details to a SQLite database. This lets you later analyze the strategy's behavior, track down any issues, and generally debug more effectively.

You can easily start and stop the service's monitoring process. Subscribing to the backtest events is straightforward and prevents you from accidentally subscribing multiple times. When you’re finished, simply unsubscribe to stop the logging. The service also uses a logger to provide helpful debugging messages.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you automatically create and save detailed reports about your backtesting results. It listens for trading signals and keeps track of how those signals performed, specifically focusing on signals that have closed. 

Think of it as a recorder that builds tables summarizing each trade, so you can easily analyze what happened during your backtest. These reports are saved as markdown files in a logs folder, making them easy to read and share.

You can request specific data or reports for a particular trading symbol, strategy, exchange, timeframe, and backtest run. There's also a way to clear out the recorded data if you need to start fresh. 

The service allows you to subscribe to receive these signal events and unsubscribe when you’re done, ensuring you only receive the information you need.

## Class BacktestLogicPublicService

BacktestLogicPublicService simplifies running backtests by handling context management for you. It acts as a bridge between the core backtesting logic and provides a way to automatically pass information like the strategy name, exchange, and frame to the underlying functions.  You don't need to explicitly specify this context in every call – it's handled behind the scenes.

Essentially, it offers a cleaner and more convenient way to execute backtests. 

The `run` method is the key here: you give it a symbol (like "BTC-USD"), and it provides a stream of backtest results. This method cleverly injects the relevant context, making your backtesting code easier to write and understand. It uses a generator to deliver results asynchronously.


## Class BacktestLogicPrivateService

This service manages the complex process of running a backtest. It works by first getting the timeframes for your data, then stepping through each one. When a trading signal appears – for example, a buy or sell indication – the service fetches the necessary historical price data (candles) and executes the backtesting logic.

It intelligently skips ahead in time until a signal closes, and then delivers the result of that trade to you. Importantly, the results are streamed to you as they become available, rather than accumulating them into a large array which is much more memory-efficient.

You can also stop the backtest early if you need to.

The `run` method starts the entire backtest process for a specific trading symbol, providing you with a continuous stream of completed trade results.

## Class BacktestCommandService

This service acts as a central point for running backtests within the system. It's designed to be easily used in different parts of the application, allowing for flexible testing and analysis. 

Think of it as a helper that connects various validation and logic components together to perform a backtest. 

It takes a stock symbol and information about the strategy, exchange, and data frame you want to use for the test. It then generates a sequence of backtest results, letting you step through how your trading strategy would have performed.  This service relies on several other services for managing strategy and exchange validation and the underlying backtesting logic.

