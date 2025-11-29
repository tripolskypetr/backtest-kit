---
title: docs/internals
group: docs
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


# backtest-kit functions

## Function setLogger

This function lets you plug in your own logging system for backtest-kit. It's a simple way to see what's happening under the hood of your trading strategies and experiments. When you provide a custom logger, all internal messages from backtest-kit will be routed through it. Even better, important context like the strategy name, exchange, and trading symbol will be automatically included with each log message, making it much easier to understand what's going on. Just make sure your logger follows the `ILogger` interface.


## Function setConfig

This function lets you adjust the core settings of the backtest-kit framework. Think of it as fine-tuning how the system operates. You can provide a partial configuration object – meaning you don't need to specify *every* setting, just the ones you want to change. This allows you to customize things like data fetching behavior or simulation parameters to tailor the backtesting environment to your specific needs. The function promise resolves when the configuration is applied.

## Function listWalkers

This function gives you a peek at all the different "walkers" that are currently set up within the backtest-kit system. Think of walkers as the individual steps or components that process your trading data. By calling this function, you get a list describing each walker, allowing you to understand what’s happening under the hood or to create tools that adapt to the specific walkers you’re using. It's like getting a directory of all your automated processes.


## Function listStrategies

This function lets you see a complete inventory of all the trading strategies that backtest-kit knows about. It’s like a catalog of your available strategies, showing you what's been added using `addStrategy()`. This list is valuable when you're troubleshooting, creating documentation, or if you want to build a user interface that dynamically displays your strategies. It returns a promise that resolves to an array, where each element describes a strategy.

## Function listSizings

This function gives you a way to see all the sizing configurations currently in use within the backtest-kit framework. Think of it as a handy tool to peek under the hood and understand how your trades are being sized. It returns a list of sizing schemas, allowing you to inspect them for debugging purposes or to create tools that automatically display or manage these configurations. Essentially, it's a quick way to get a complete picture of your sizing setup.


## Function listRisks

This function lets you see all the risk configurations currently in use within your backtest. Think of it as a way to peek under the hood and understand how risk is being managed. It returns a list of these risk configurations, which can be helpful for troubleshooting, generating documentation, or building interfaces that adapt to the specific risks being considered. You'll get a promise that resolves to an array of risk schema objects.

## Function listFrames

This function lets you see a complete inventory of the different data structures, or "frames," that your backtest-kit environment is using. Think of it as a way to explore the types of data available for your trading strategies. It’s incredibly helpful for understanding how your system is organized, for troubleshooting issues, or even for creating tools that automatically display information about your frames. The function returns a list, where each item describes a frame with its schema.

## Function listExchanges

This function lets you see all the exchanges your backtest-kit setup recognizes. It's like getting a directory of all the places your simulations can trade. You can use this to confirm everything is set up correctly, generate a list for a user interface, or just understand what exchanges are available for testing. The function returns a promise that resolves to an array of exchange schema objects, giving you detailed information about each exchange.

## Function listenWalkerOnce

This function lets you set up a listener that reacts to events from a walker, but only once. Think of it as a temporary alert – you define what kind of event you’re looking for, and when it happens, your provided function runs. After that one execution, the listener automatically goes away, so you don't have to worry about manually unsubscribing.

You provide a filter function to specify the kind of event you want to catch, and a function to run when that event occurs. It's a handy way to wait for a specific condition to be met within the walker's progress without keeping a listener active indefinitely.


## Function listenWalkerComplete

This function lets you listen for when the backtest walker finishes running all your strategies. When the walker is done, it will call the function you provide. It's designed to handle events in the order they come in, even if your callback function takes some time to process things – it ensures a steady, sequential flow. Think of it as a notification system to know when all the testing is complete and you can move on to analyzing the results. You give it a function, and it gives you back another function that you can use to unsubscribe from these completion events later.

## Function listenWalker

This function lets you keep an eye on how your backtest is progressing. It's like setting up a notification system that tells you when each strategy finishes running within the overall backtest process. 

You provide a function that will be called after each strategy completes. Importantly, even if your notification function takes some time to process (like if it's doing something asynchronous), the notifications will be handled one at a time, in the order they occur, ensuring things stay organized. It gives you a way to react to the outcome of each strategy as the backtest unfolds.

## Function listenValidation

This function lets you keep an eye on potential problems during the risk validation process. It essentially sets up a listener that gets notified whenever a validation check throws an error. Think of it as a safety net for catching and responding to issues as they happen. 

The listener you provide will be called whenever a validation error occurs, allowing you to debug or log these failures. Importantly, these events are handled one at a time, even if your response needs to involve asynchronous operations. This ensures a consistent order and prevents unexpected behavior due to parallel execution. 

You give it a function – your callback – that gets executed when an error arises. The callback receives the error object itself, allowing you to inspect it and take appropriate action. When you’re done monitoring, you can unsubscribe from the listener by calling the function it returns.

## Function listenSignalOnce

This function lets you temporarily listen for specific trading signals. Think of it as setting up a short-term alert – you specify a condition (using `filterFn`), and when that condition is met, a provided function (`fn`) runs once, and then the listening stops automatically. It's perfect for situations where you only need to react to a particular signal just one time, like waiting for a specific price level to be reached.

You tell it what signal you're looking for with `filterFn`, and what to do when that signal arrives with `fn`. Once the signal matches your filter and the callback executes, the subscription ends.

## Function listenSignalLiveOnce

This function lets you temporarily listen for specific trading signals coming from a live simulation. You provide a filter – a rule to determine which signals you’re interested in – and a function to run when a matching signal arrives. Once that single matching signal is received, the function automatically stops listening and cleans up, ensuring you don't get bombarded with unwanted updates. It's a great way to react to a particular event during a live backtest without needing to manage subscriptions manually. You're only getting signals from a `Live.run()` execution.


## Function listenSignalLive

This function lets you listen for real-time trading signals generated by your backtest strategy when it's running live. Think of it as setting up a listener that gets notified whenever your strategy produces a signal. It’s designed to handle these signals one at a time, ensuring they’re processed in the order they arrive from the live execution. To receive these signals, you provide a function that will be called with the signal data. This listener only works when you're actively running your strategy in live mode.

## Function listenSignalBacktestOnce

This function lets you temporarily "listen" for specific signals generated during a backtest run. You provide a filter – a rule that determines which signals you're interested in – and a function to execute when a matching signal appears. The function runs your callback only once and then automatically stops listening, ensuring you don't get unexpected updates later. It’s a clean way to react to a single event during a backtest without needing to manage subscriptions manually.

Here’s how it works:

*   You give it a filter (`filterFn`) to specify the type of signals you want to see.
*   You also provide a function (`fn`) that will be executed when a signal matches your filter.
*   Once the matching signal is processed, the listener automatically turns itself off.

## Function listenSignalBacktest

This function lets you hook into the backtest process and receive updates as it runs. Think of it as setting up a listener that gets notified whenever a signal is generated during the backtest.

It's specifically designed to work with events coming from `Backtest.run()`.

The function you provide (`fn`) will be called with each signal event, ensuring the events are handled one after another in the order they occurred. This allows you to react to changes during the backtest and process them in a controlled way. When you’re finished, you'll get a function back that you can use to unsubscribe from these updates.

## Function listenSignal

This function lets you easily stay informed about what's happening in your backtest. It’s a way to listen for key events like when a strategy is idle, a position is opened, a trade is active, or a position is closed.  The function provides a listener that's designed to handle these events in a reliable order, even if your callback function takes some time to complete.  Essentially, it guarantees that events are processed one at a time, ensuring your logic doesn't get tripped up by unexpected timing issues. You give it a function that will be called whenever one of these events occurs, and it returns a function you can use later to unsubscribe from those updates.

## Function listenProgress

This function lets you keep an eye on how your backtest is running, especially when it’s doing background tasks. It’s like setting up a notification system that calls your provided function whenever the backtest makes progress. Importantly, even if your notification function takes some time to run (like if it's making an API call), the backtest will still report progress in the order it happens, preventing any unexpected issues. Think of it as a reliable way to track the steps of your backtest without disrupting its execution. You give it a function to be called with progress updates, and it returns a function that you can use to unsubscribe later.

## Function listenPerformance

This function lets you monitor how your trading strategies are performing in terms of speed and efficiency. It's like setting up a listener that gets triggered whenever the backtest-kit records a performance event, such as how long a particular trade execution took. The data provided allows you to profile your strategies, pinpoint slow operations, and ultimately optimize their speed. The function guarantees that the callback you provide will be executed one at a time, even if it involves asynchronous processing, ensuring consistent and predictable timing information. You essentially register a function to receive these performance updates, allowing for detailed analysis and adjustments to your trading logic.

## Function listenError

This function lets you be notified when errors occur during background tasks within your backtest or live trading environment. Specifically, it catches errors that happen inside `Live.background()` or `Backtest.background()` functions. It ensures errors are handled one at a time, even if the function you provide to handle them takes some time to execute. You provide a function as input, and this function will be called whenever a background task encounters an error, giving you a chance to log it, retry the operation, or take other corrective actions. The function you provide will be called with an `Error` object containing details about the problem. When you are finished listening for errors, you can use the function that is returned to unsubscribe.

## Function listenDoneWalkerOnce

This function lets you set up a listener that gets notified when a background task finishes, but only once. You provide a filter to specify which completed tasks you're interested in, and then a function that will be executed when a matching task is done. After that function runs, the listener automatically stops listening, so you don't have to worry about cleaning it up. It's a simple way to react to a specific background task completion without ongoing subscriptions. 

It accepts two things: a filter that checks if the completed task meets your criteria, and the function you want to run once a matching task finishes. The listener handles the cleanup for you.


## Function listenDoneWalker

This function lets you listen for when background tasks within the backtest-kit framework finish running. It’s a way to be notified when a process, started with `Walker.background()`, has completed.  Importantly, the notifications are processed one at a time, even if your notification code takes some time to run, ensuring things stay in a predictable order. To use it, you provide a function that will be called when a background task is done; this function receives information about the completed event. The function you provide will then return another function that you need to call to unsubscribe from listening to the events.

## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running within the backtest-kit framework. Think of it as setting up a listener that gets notified when a specific background process is done.

You provide a filter – a way to specify *which* completed tasks you're interested in – and a function to run when a matching task finishes. 

The beauty of it is that this listener automatically cancels itself after it runs once, so you don't have to worry about managing subscriptions. It’s a clean and simple way to respond to specific completion events.


## Function listenDoneLive

This function lets you tap into when background tasks running within the backtest-kit framework finish. It's like setting up a notification system – when a background process is done, the function you provide will be called.

Importantly, the events are handled one at a time, ensuring that your code executes in the order they occur, even if the code you provide takes time to run. This is useful for situations where you need to react to completed background processes in a specific sequence or need to prevent any race conditions in your logic.

You simply provide a function (`fn`) that will receive information about the completed task, and `listenDoneLive` returns another function you can use to unsubscribe from these notifications later.

## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but with a twist – it only runs your code *once* and then stops listening. You can specify a condition using `filterFn` to only trigger your code when a specific backtest completes. Think of it like setting up a single, targeted alert for a backtest's completion. Once the alert triggers, the listener automatically goes away, so you don't have to worry about manually unsubscribing. It's useful for things like reporting a specific result or performing a one-time action when a particular backtest is done.


## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. It’s a way to react to the completion of a backtest without blocking the main process. 

Think of it as subscribing to an event; you provide a function (`fn`) that will be executed when the backtest is done. 

Importantly, even if your function is asynchronous, the notifications will be processed one at a time, in the order they occur. This ensures that completion events are handled sequentially. 

The function itself returns another function. Calling this returned function will unsubscribe you from receiving these completion notifications.

## Function getMode

This function tells you whether the backtest-kit is currently running in backtest mode or live trading mode. It returns a promise that resolves to either "backtest" or "live," allowing your code to adjust its behavior based on the environment it's operating in. Think of it as a simple check to see if you’re practicing or actually trading.

## Function getDate

This function, `getDate`, provides a simple way to retrieve the current date within your trading strategies. It's useful for time-based logic, such as scheduling actions or calculating time elapsed. Whether you're running a backtest or trading live, this function will return the correct date – the timeframe date during backtesting and the real-time date when trading live. Essentially, it gives you the date you’re currently operating within.

## Function getCandles

This function lets you retrieve historical price data, like open, high, low, and close prices, for a specific trading pair. You tell it which trading pair you’re interested in (for example, BTCUSDT), how frequently the data should be grouped (like every minute, every hour), and how many data points you want to get. It pulls this information directly from the exchange you’re connected to. The data you get represents candles, which are snapshots of price action over a specific time period.

## Function getAveragePrice

The `getAveragePrice` function helps you figure out the average trading price of a specific cryptocurrency pair, like BTCUSDT. It uses a method called Volume Weighted Average Price, or VWAP, which considers both the price and the amount of trading activity. 

Essentially, it looks at the last five minutes of trading data to calculate this average. If there's no trading volume to work with, it simply averages the closing prices instead. You just need to provide the symbol of the trading pair you're interested in, and the function will return the calculated average price.

## Function formatQuantity

The `formatQuantity` function helps you prepare the quantity you want to trade in a way that's correct for the specific exchange you're using. It takes the trading pair, like "BTCUSDT", and the raw quantity amount as input. The function then uses the exchange's rules to ensure the quantity is formatted with the right number of decimal places, which is crucial for successful trades. This avoids errors caused by incorrect formatting and makes sure your orders are properly understood by the exchange.

## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a symbol like "BTCUSDT" and a raw price number, then formats the price according to the specific rules of that exchange. This ensures that you’re showing the price with the right number of decimal places, which is crucial for clear and accurate presentation. Essentially, it handles the intricacies of price formatting for you.


## Function addWalker

This function lets you register a "walker" – essentially a component that runs backtests for several strategies simultaneously and then evaluates how well they performed against each other. Think of it as setting up a competition between your trading strategies, all using the same historical data. You provide a configuration object, `walkerSchema`, which defines how this comparison will be carried out. This is a key step in setting up a more comprehensive analysis of your strategies beyond just individual backtest results.

## Function addStrategy

This function lets you add a trading strategy to the backtest-kit framework. Think of it as registering your strategy so the system knows how to run it. When you add a strategy this way, the framework automatically checks to make sure it's set up correctly, verifying things like the price data and stop-loss logic. It also helps prevent issues where signals are sent too frequently and will ensure the strategy's data is safely stored if the system experiences any interruptions while running in live mode. You provide a configuration object that defines how your strategy operates.

## Function addSizing

This function lets you tell the backtest-kit how to determine the size of your trades. Think of it as setting up the rules for how much capital you're willing to risk on each trade. You provide a configuration object that specifies things like whether you want to use a fixed percentage of your capital, a Kelly Criterion, or an ATR-based sizing method. It also lets you control risk parameters and set limits on how large your positions can be. By registering your sizing configuration with this function, you ensure that the backtest-kit consistently applies your chosen sizing strategy during simulations.


## Function addRisk

This function lets you define and register the rules your trading system uses to manage risk. Think of it as setting up the guardrails for your automated strategies. You’re telling the framework how many trades you can have running at once, and potentially adding more complex checks to ensure your portfolio stays healthy – things like checking correlations between assets or monitoring portfolio metrics. Importantly, these risk rules are shared among all your trading strategies, so you get a holistic view of risk across your entire system. The framework keeps track of all active positions, which your custom risk checks can access to make informed decisions about which trades to allow or reject.

## Function addFrame

This function lets you tell the backtest-kit about the timeframe you want to use for your backtesting. Think of it as defining the schedule for how your historical data will be organized and processed. You provide a configuration object that specifies the start and end dates of your backtest, the interval (like daily, hourly, or minute data), and a function to handle any events that happen during the timeframe generation. Essentially, it’s how you set up the timeline for your backtesting simulation.

## Function addExchange

This function lets you tell backtest-kit about a new data source for trading, like Binance or Coinbase. Think of it as registering where the framework will pull historical price information from. You provide a configuration object that describes how to fetch candles (price data) and format trade values. Once registered, the framework can use this exchange to run your trading strategies. The system also uses the data to calculate moving averages.

# backtest-kit classes

## Class WalkerValidationService

The WalkerValidationService helps ensure your trading strategies, or "walkers," are correctly defined and follow the expected structure. Think of it as a quality control system for your strategy blueprints.

You can use it to register the structure of each walker you're using, essentially defining what a valid walker looks like. This service keeps track of those definitions, allowing you to check if a walker's configuration is correct.

It offers a few key functions: you can add new walker definitions, validate an existing walker against its definition, and list all registered walker schemas to see what you've defined. This helps prevent errors and promotes consistency across your backtesting environment.

## Class WalkerUtils

WalkerUtils provides a set of helpful tools for working with walkers, making it easier to run comparisons and analyze results. Think of it as a helper for simplifying interactions with the walker system. 

You can use `run` to execute a walker comparison for a specific symbol, automatically passing along important information like the walker's name. If you just want to run a walker comparison silently, without needing the immediate results, the `background` function lets you do that.

Need to see the final results of a walker’s performance? `getData` retrieves the overall results from all the strategy comparisons.  For a detailed, human-readable breakdown, `getReport` generates a markdown report summarizing the walker’s performance.  Finally, `dump` lets you save that report directly to a file on your disk. It's designed to be a single, easy-to-use instance for streamlined walker operations.

## Class WalkerSchemaService

This service helps you keep track of different walker schemas in a structured and reliable way. It acts like a central hub where you register and retrieve these schemas, ensuring they're consistent and properly formatted.

The service uses a special registry to store the schemas safely and with type checking. You can add new schemas using `addWalker()` and easily find existing ones by their names using `get()`.

Before adding a new schema, `validateShallow` checks that it has all the necessary components and they’re of the expected types, preventing errors down the line. If you need to update an existing schema with just a few changes, the `override` function lets you do that without replacing the whole thing.

## Class WalkerMarkdownService

This service helps you automatically create and save detailed reports about your trading strategies as they run. It listens for updates from your trading simulations (walkers) and gathers data about how each strategy is performing. The reports are nicely formatted using markdown tables, making it easy to compare different strategies side-by-side.

Each walker gets its own dedicated storage area to keep its results separate. You can trigger report generation and saving to disk, or clear out the accumulated data when needed. The service handles creating the necessary directories to store the reports.

Importantly, the initialization of this service is handled automatically, so you don't have to worry about setting things up manually.

## Class WalkerLogicPublicService

The WalkerLogicPublicService helps manage and coordinate the execution of trading strategies, simplifying how you run backtests. It automatically passes essential information like the strategy name, exchange, frame, and walker name along with each request, so you don't have to manually include it every time.

Think of it as a layer on top of the private service that takes care of the details for you. 

The `run` method is the main way you interact with this service, allowing you to specify a symbol and context to initiate the backtesting process, handling execution for all strategies.


## Class WalkerLogicPrivateService

This service helps you compare different trading strategies against each other. It acts as an orchestrator, running each strategy one after another and keeping you informed of the progress. 

You give it a symbol to analyze, a list of strategies to test, a metric to optimize for, and some context details. As each strategy finishes its backtest, you'll receive updates about its performance.

The service tracks the best-performing strategy as it goes, and ultimately provides you with a ranked list of all strategies tested. It relies on other services internally to handle the actual backtesting and markdown generation.

## Class WalkerGlobalService

WalkerGlobalService acts as a central access point for walker-related functionality within the backtest-kit framework. Think of it as a convenient hub to get things done, especially useful when you're setting up your system with dependency injection.

It bundles together several important services, including those for handling walker logic, schemas, validation, and strategy.

The `run` method is a key function that allows you to initiate a walker comparison for a specific trading symbol, providing context about the walker, exchange, and frame being used. This method returns an asynchronous generator, allowing you to process the results step-by-step.

## Class StrategyValidationService

The StrategyValidationService helps ensure your trading strategies are set up correctly before you start backtesting. It acts as a central place to register and verify your strategy definitions.

You can add strategy schemas to the service, essentially telling it what each strategy looks like and what data it expects. The `validate` function then checks if a particular strategy is registered and, if risk validation is enabled, whether it has a valid risk profile.

If you need to see what strategies you’ve registered, the `list` function provides a handy way to see a list of all the strategy schemas you've added. It’s all about making sure your strategies are properly defined and ready to go for backtesting.

## Class StrategySchemaService

The StrategySchemaService helps keep track of your trading strategies and their configurations in a structured way. Think of it as a central library where you store the blueprints for each strategy.

It uses a type-safe system to ensure everything is set up correctly. You can add new strategies using `addStrategy()` and then find them later by their name using `get()`.

Before a strategy is officially added, the service checks to make sure it has all the necessary parts and that those parts are of the expected types. This check is done with `validateShallow`.

You can also update existing strategies with `override`, providing only the information that needs to be changed. This avoids having to redefine the whole strategy every time you make a small adjustment.

## Class StrategyGlobalService

StrategyGlobalService acts as a central hub for managing and interacting with trading strategies within the backtest framework. It's designed to streamline strategy operations by providing a unified way to access and control them, especially during backtesting and live trading scenarios.

Think of it as a helper that brings together different services needed to run a strategy. It handles things like validating strategies, checking their status at specific times, and running quick backtests against historical data. 

The service keeps track of strategy validations to avoid unnecessary work and makes sure strategies are properly cleared from memory when needed. It connects to the underlying strategy connection service to stop or clear strategies. 

Essentially, it's a behind-the-scenes component that simplifies the process of working with strategies within the larger backtest system.


## Class StrategyConnectionService

The StrategyConnectionService acts as a central hub for managing and executing trading strategies within the backtest-kit framework. It automatically directs requests to the correct strategy implementation based on the current context, ensuring the right strategy is always used. 

To optimize performance, it remembers previously loaded strategies, so it doesn't need to recreate them repeatedly. Before any trading operations – whether live ticks or backtesting – it makes sure the strategy is properly initialized. 

You can use it to run live trades (`tick()`) and analyze historical data through backtesting (`backtest()`). The `stop()` function allows you to temporarily halt a strategy’s signal generation, and `clear()` helps you refresh a strategy’s state or release associated resources.

## Class SizingValidationService

The SizingValidationService helps ensure your trading strategies have properly defined sizing methods. It allows you to register different sizing approaches, like fixed percentage, Kelly Criterion, or ATR-based methods, with associated schemas. 

You can add sizing schemas to the service using the `addSizing` function.  The `validate` function lets you check if a particular sizing method is registered and, if needed, verifies its configuration. To see all registered sizing methods, you can call the `list` function, which returns a list of all available sizing schemas. This service is a helpful tool for preventing errors and maintaining consistency in your backtesting and trading logic.


## Class SizingSchemaService

The SizingSchemaService helps you keep track of your sizing schemas in a safe and organized way. It uses a type-safe system for storing these schemas, ensuring consistency and preventing errors.

You can add new sizing schemas using the `register` method and update existing ones with `override`. If you need to get a specific sizing schema, just use the `get` method, providing the name of the schema you're looking for.

The service also includes a validation step to quickly check if your sizing schema has the necessary parts and is structured correctly before it’s stored. This helps catch potential problems early on. Essentially, it's your central hub for managing and accessing sizing schemas within your backtesting framework.

## Class SizingGlobalService

The SizingGlobalService helps determine how much of an asset to trade, acting as a central hub for position sizing calculations. It manages connections and validation related to sizing and is used behind the scenes by the backtest-kit framework. 

Think of it as the engine that figures out your trade sizes based on your risk profile. It uses a connection service to get the necessary data and a validation service to make sure everything is set up correctly.

The `calculate` method is the core of this service, taking your sizing parameters and a context to compute the appropriate position size. This service is designed for internal use within the backtest-kit, streamlining the sizing process for strategies.


## Class SizingConnectionService

This service handles the process of determining how much of an asset to trade, based on a specific sizing method. It acts as a central point, directing sizing requests to the correct sizing implementation. 

To improve performance, it remembers previously used sizing methods (like a cache), so it doesn’t need to recreate them every time. 

The `getSizing` property lets you retrieve a specific sizing method, creating it if it doesn't already exist in the cache. 

The `calculate` method is used to actually compute the position size, taking into account things like your risk tolerance and the configured sizing method. This method uses the provided context to route the sizing calculation to the appropriate sizing implementation.

## Class ScheduleUtils

This class provides helpful tools for understanding and managing how your trading strategies schedule and execute signals. It acts as a central place to gather information about scheduled signals, including data on cancellations and wait times. 

You can use it to get a quick overview of a strategy’s signal activity, generating reports in a readable markdown format.  It also allows you to save these reports to a file for later review.  If you need to reset the tracked data, the class offers options to clear information for a specific strategy or all strategies. Think of it as a monitoring tool to help you understand the performance of your scheduling setup.

## Class ScheduleMarkdownService

This service helps you automatically create reports about your trading strategies' scheduled signals. It keeps track of when signals are scheduled and cancelled, compiling this information into easy-to-read markdown tables.

The service listens for signal events and organizes them by strategy, building up a record of activity. You can then request a report for a specific strategy, which will be generated as a markdown file.

It also provides some helpful statistics like cancellation rates and average wait times, giving you insights into how your strategies are performing. Reports are saved automatically to a designated folder.

The service manages its data for each strategy separately, so you can have independent reporting for each. You can clear the stored data whenever needed, either for a specific strategy or for all strategies. Initial setup is handled automatically when you first use the service.

## Class RiskValidationService

The RiskValidationService helps you make sure your trading strategies are accounting for potential risks. Think of it as a safety net.

You start by defining the risks you want to track—for example, maximum position size or margin requirements—using the `addRisk` method. This lets you register a specific risk with a defined structure.

The `validate` method checks if a particular risk profile exists, ensuring your system is ready to handle it.

If you need to see what risks you’ve already defined, the `list` method provides a simple way to get a list of all registered risk schemas. This is useful for understanding your current risk management setup. 

The `loggerService` property allows you to integrate with a logging system for detailed tracking and debugging. The internal `_riskMap` is used to store the risk schemas.

## Class RiskSchemaService

This service helps you keep track of your risk schemas, ensuring they're consistent and reliable. It uses a type-safe system to store these schemas, making it less likely you'll have errors related to incorrect data.

You can register new risk profiles using the `addRisk()` method (represented here as `register`), and easily find them later using their names with the `get()` method. 

Before a new risk profile is registered, it’s checked to make sure it has the expected structure using `validateShallow`. If you need to update an existing risk profile, you can use the `override()` method to apply changes. This service also uses a logger to help you track what’s happening behind the scenes.

## Class RiskGlobalService

This service manages risk checks and interactions with a risk management system. It acts as a central point for validating risk limits and communicating with that system, handling things like registering open trades and closing them out.

It keeps track of risk data and avoids repeating validation checks unnecessarily. You can clear all risk data, or just data related to a specific risk profile. 

The service uses a `RiskConnectionService` behind the scenes, and provides functions to check if a trading signal is allowed, register open positions, and remove closed ones. It also logs its activities for monitoring and debugging.

## Class RiskConnectionService

The RiskConnectionService acts as a central point for handling risk checks within your backtesting system. It directs risk-related operations to the specific risk management component that's configured for a given strategy. 

Think of it as a smart router; you specify a "riskName," and it finds the correct risk implementation to handle the request. To speed things up, it remembers (caches) those risk implementations so it doesn't have to recreate them every time.

You can use it to check if a trade signal is permissible based on pre-defined limits – like maximum drawdown, exposure to a symbol, or the number of positions. It also allows you to register and remove signals as they open and close, keeping the risk system updated. If you need to flush those cached risk implementations for a particular strategy, you can easily clear them.


## Class PositionSizeUtils

This class provides helpful tools for figuring out how much of an asset to trade, also known as position sizing. It includes pre-built methods for several common strategies.

You'll find methods for calculating position size based on a fixed percentage of your account balance, the Kelly Criterion (a more advanced approach focusing on win rates and loss ratios), and using the Average True Range (ATR) to determine size. 

Each of these methods helps automate the process, and they're designed to validate your inputs to ensure they align with the chosen sizing strategy. Essentially, this class gives you a set of ready-to-use calculations to help you manage your risk and determine appropriate trade sizes.

## Class PersistSignalUtils

The PersistSignalUtils class is designed to help strategies reliably save and restore their signal data, even if the system crashes unexpectedly. It acts like a central manager for keeping track of signals, ensuring that the data is stored safely and consistently for each strategy.

It handles the technical details of storing data, using a special system to memoize storage instances, meaning it remembers where the data is located and doesn’t need to re-find it every time. You can even customize how this storage works by providing your own persistence adapter. 

The `readSignalData` function retrieves existing signal information for a specific strategy and trading symbol, bringing the strategy’s state back to where it left off. Conversely, `writeSignalData` carefully saves new signal data, employing atomic writes to prevent data loss in case of unexpected interruptions. 

If you need to integrate a unique storage method, the `usePersistSignalAdapter` function lets you register a custom persistence adapter, tailoring the persistence behavior to your specific needs.

## Class PersistRiskUtils

This utility class helps manage how active trading positions are saved and restored, particularly for different risk profiles. It ensures that the data for each risk profile is stored separately and efficiently.

You can customize how this storage works by providing your own persistence adapter. 

The class handles reading position data to recover a trading session and writing new position data to disk, ensuring that even if something goes wrong, your data remains safe. The write operations are designed to be atomic, meaning they happen as a single, indivisible step, so you won't risk corrupted data if the system crashes during a save. This is crucial for keeping track of active positions in a reliable way.

## Class PerformanceMarkdownService

This service helps you understand how your trading strategies are performing by gathering and analyzing data. It listens for performance events, keeps track of metrics for each strategy individually, and then calculates things like averages, minimums, maximums, and percentiles to give you a good overview. 

You can easily generate detailed reports in Markdown format, including analysis to pinpoint potential bottlenecks in your strategies. These reports are saved automatically so you can review them later. 

The service also provides ways to get the raw performance data, clear out accumulated data when needed, and make sure the service only initializes once. It uses a special storage system so that each strategy's performance is tracked separately.

## Class Performance

The Performance class helps you understand how your trading strategies are performing. It allows you to retrieve detailed statistics, like counts, durations, and percentiles, to see where time is being spent within your strategy.

You can generate easy-to-read markdown reports that highlight bottlenecks and provide a clear picture of your strategy’s efficiency. These reports can then be saved to a file.

If you need to start fresh, there’s a simple method to clear all accumulated performance data from memory. This is useful for testing or when you want to analyze a new period of trading activity.

## Class LoggerService

The LoggerService helps standardize logging across the backtest-kit framework, ensuring your logs always contain useful context. Think of it as a central hub for all your logging needs.

You can customize the underlying logger by providing your own implementation through the `setLogger` method. If you don't specify a logger, it defaults to a "no-op" logger, which essentially does nothing.

It automatically adds details like which strategy, exchange, and frame are being executed, along with the symbol, timestamp, and whether it’s a backtest. This context is injected into messages logged using methods like `log`, `debug`, `info`, and `warn`, making it much easier to understand what's happening during your backtests. The service manages these context details internally through `methodContextService` and `executionContextService`.

## Class LiveUtils

LiveUtils offers helpful tools for running and monitoring live trading sessions. Think of it as a central hub to streamline your live trading workflow.

The `run` method is the core – it launches a continuous, never-ending trading process for a specific symbol, allowing your strategy to run indefinitely. A significant benefit is its ability to recover from crashes; if the process fails, it will automatically restart and pick up where it left off.

For scenarios where you only need to run live trading for things like sending data to a callback or persisting results, the `background` method provides a way to do that without needing to actively process the trading results yourself. This runs silently in the background.

You can also use `getData` to retrieve performance statistics from your live trading sessions, and `getReport` to generate a nicely formatted markdown report summarizing all the events. Finally, `dump` provides a simple way to save that report to a file for later review. The whole system is designed to make live trading as smooth and reliable as possible.

## Class LiveMarkdownService

The LiveMarkdownService helps you automatically create detailed reports about your trading strategies as they run. It keeps track of everything that happens – from when a strategy is idle, to when trades are opened, active, and closed. These events are then organized into easy-to-read markdown tables, complete with important trading statistics like win rate and average profit/loss. 

The service saves these reports to files, so you can easily review your strategy's performance over time. Each strategy gets its own dedicated report file for clear organization. The service handles creating the necessary directories to store these reports. 

To get started, the service automatically initializes itself when first used.  You don't need to explicitly call an initialization function.  The `onTick` callback from your strategy needs to call the `tick` method to pass events to the service. You can also clear the data for a specific strategy or clear everything if you want to start fresh.

## Class LiveLogicPublicService

This service helps manage and orchestrate live trading, simplifying the process by handling context automatically. Think of it as a layer on top of the private service that makes sure your trading strategy always knows which exchange and strategy it's working with.

It provides an ongoing stream of trading signals – opened, closed, or cancelled – that continues indefinitely.  This stream is designed to keep running, even if there are interruptions; the system will automatically recover its state and pick up where it left off.

The `run` method is the key here: you give it a symbol (like "BTC-USD") and the service does the rest, automatically injecting the necessary context into all the underlying trading functions.  It’s like having a built-in memory for your trading operations.

## Class LiveLogicPrivateService

This service helps orchestrate live trading using a continuous, real-time monitoring process. It essentially runs an endless loop, constantly checking for trading signals. 

Each time the loop runs, it captures the current time and then assesses the signal status. It only sends back results when trades are opened or closed – active or idle trades are skipped. A short pause occurs between each check to manage resource usage.

A key feature is its ability to recover from crashes; it automatically restarts and retrieves the trading state from storage. The service delivers results in a memory-efficient way using an asynchronous generator, allowing you to process data incrementally. Think of it as a continuous stream of trading events, always running and ready to adapt to changes.

## Class LiveGlobalService

This service acts as a central hub for accessing live trading capabilities within the backtest-kit framework. Think of it as a convenient way to inject dependencies and manage live trading processes.

It provides access to various services like logging, live logic, strategy and exchange validation, schema management, and risk assessment – all crucial for a robust live trading environment.

The key functionality is the `run` method, which lets you execute live trading for a specific symbol.  It's designed to run continuously, even if things go wrong, and provides a stream of results, whether it's a trade opening, closing, or cancellation. You're essentially getting a resilient, ongoing feed of live trading events.

## Class HeatUtils

This class helps you visualize and understand how your trading strategies are performing by creating heatmaps. Think of it as a tool to get a quick, visual summary of your portfolio's health for each strategy you're running.

It gathers information about your trading signals—specifically, how each symbol contributed to the overall strategy results.  You can request the raw data or a nicely formatted markdown report that shows key metrics like total profit/loss, Sharpe Ratio, maximum drawdown, and the number of trades executed for each symbol.

The reports organize symbols by profit, making it easy to spot your best-performing assets.  You can even save these reports directly to a file on your computer, so you can share them or keep a record of your performance over time. The class is designed to be simple to use, available as a single instance you can readily access.

## Class HeatMarkdownService

This service helps you visualize and analyze your backtesting results with a portfolio heatmap. It keeps track of closed trades for each strategy and calculates key metrics like total profit/loss, Sharpe Ratio, and maximum drawdown, providing a clear picture of performance at both the strategy and individual symbol level.

You can think of it as an automated reporting system that generates markdown tables summarizing your backtest data. It’s designed to be robust, handling potential mathematical issues gracefully. The service automatically initializes when you start using it, and each strategy has its own separate data storage.

The `tick` function is what you’ll use to feed the service closed signal data from your signal emitter.  You can request the data, generate a report, or even save the report directly to a file. You also have the option to clear the data if you need to start fresh, either for a specific strategy or for all strategies.

## Class FrameValidationService

The FrameValidationService helps ensure your trading strategies are using the correct data structures. Think of it as a way to register and check the format of the data your backtesting system receives. 

You can add frame schemas—essentially blueprints for your data—using the `addFrame` method, telling the service what data it should expect. The `validate` method then lets you verify if a specific frame actually conforms to the registered schema. 

If you need to see what schemas have been registered, the `list` method provides a simple way to retrieve that information. This service ensures data consistency and helps prevent errors during backtesting.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of the blueprints for your trading frames. It's like a central place to store and manage the structure of your data.

Think of it as a registry where you can add new frame schemas using the `register` method or update existing ones with `override`. You can also retrieve a frame schema by its name with the `get` method. The service uses a special registry to ensure everything stays type-safe and consistent.

Before a new frame is added, a quick check happens (`validateShallow`) to make sure it has all the necessary parts. This helps prevent errors later on.

## Class FrameGlobalService

This service handles the core mechanics of generating timeframes for your backtesting process. Think of it as the engine that figures out exactly when your trading decisions should be evaluated. It works closely with a connection service to fetch the data and a validation service to ensure everything is accurate.

The main function you'll likely use is `getTimeframe`. It takes a symbol (like "BTCUSDT") and a frame name (like "1h" for one-hour candles) and returns a promise that resolves to an array of dates representing those timeframes. This array essentially tells your backtest logic when to execute each trade. 

It's primarily used internally, but understanding its purpose illuminates how backtest-kit organizes and delivers the data needed for backtesting.

## Class FrameConnectionService

The FrameConnectionService helps manage and access different trading frames, like daily, weekly, or monthly data, within your backtesting setup. It automatically figures out which frame you're working with based on the current context.

Think of it as a central hub that connects you to the right frame implementation, and it keeps track of these implementations to avoid creating them repeatedly, making things faster. 

It provides a way to get a specific frame, caching it for efficiency, and also lets you retrieve the start and end dates for backtesting a particular symbol within a frame. When in live mode, the frame name is empty, meaning no frame constraints are applied. 

The service relies on other components like a logger, a frame schema service, and a method context service to function correctly.

## Class ExchangeValidationService

The ExchangeValidationService helps you make sure your trading strategies are set up correctly by validating the details of the exchanges they use. Think of it as a quality control system for your exchange configurations.

You start by adding the schema for each exchange you plan to use.  This schema defines the expected format and structure of the exchange data.

The `validate` function checks if an exchange has been registered and its schema is valid.  You can also use it to catch errors early in your backtesting process.

Finally, the `list` function provides a convenient way to see all the exchanges you've registered and their associated schemas, making it easy to manage and review your setup.

## Class ExchangeSchemaService

The ExchangeSchemaService helps keep track of information about different cryptocurrency exchanges, ensuring everything is structured correctly. It uses a special type-safe system to store this data, making it less prone to errors.

You can add new exchange details using `addExchange()` and retrieve them later by their name using `get()`. If you need to update an existing exchange’s information, the `override()` method lets you make changes to specific parts of the data. Before adding a new exchange, `validateShallow()` checks if it has all the necessary properties in the right format. Essentially, this service acts as a central place to manage and verify the details of each exchange you’re working with.

## Class ExchangeGlobalService

The ExchangeGlobalService acts as a central hub for interacting with exchanges, making sure important information like the trading symbol, time, and backtesting parameters are always readily available. It combines the functionality of connecting to an exchange with the ability to inject this crucial context into operations. 

Think of it as a helper that streamlines your exchange interactions by automatically handling the details of the trading environment. It also remembers if a particular exchange configuration has already been checked for validity, saving time by avoiding repeated checks. 

This service provides methods to retrieve historical and future candle data, calculate average prices, and format price and quantity information, all while keeping track of the current context. It's a key component used internally for both backtesting and live trading logic.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It automatically directs your requests – like fetching candles or getting prices – to the correct exchange based on your current settings.

Think of it as a smart router; you don't need to worry about which exchange you’re using, it handles that for you. It keeps track of the connections to each exchange, so it's fast and efficient, remembering previously used exchanges. 

It provides a complete set of functions you're familiar with from the `IExchange` interface, making it easy to perform actions like retrieving historical price data (`getCandles`), getting the next set of candles for backtesting (`getNextCandles`), retrieving the current average price (`getAveragePrice`), and ensuring your price and quantity values conform to the specific requirements of each exchange (`formatPrice`, `formatQuantity`).

## Class ClientSizing

This component handles determining how much of your capital to allocate to a trade. It lets you choose from several sizing methods like fixed percentage, Kelly Criterion, or using Average True Range (ATR). You can also set limits on the minimum and maximum position size, and define a maximum percentage of your capital that can be used for any single trade. This sizing component allows for custom validation and logging through callbacks, giving you flexibility in how you manage and monitor your trades. Essentially, it figures out the right amount to buy or sell based on your strategy's rules and risk management preferences. The `calculate` method is the key function – it takes trade parameters and returns the calculated position size.

## Class ClientRisk

ClientRisk helps manage the risk of your trading portfolio by setting limits and preventing trades that might break those limits. Think of it as a safety net for your strategies. It's designed to work with multiple trading strategies at once, allowing it to understand the combined risk across your entire portfolio.

The system keeps track of all currently open positions across your strategies, using this information to evaluate new trade signals. It also allows you to create your own custom rules to further refine your risk controls. 

ClientRisk is automatically used when a strategy wants to open a new position; it steps in to make sure the trade aligns with your defined risk parameters. When a trade is opened or closed, ClientRisk updates its records, ensuring accurate risk assessment. It’s initialized once when the system starts and skips data retrieval if you’re running a backtest.


## Class ClientFrame

The `ClientFrame` is the engine that powers your backtesting, responsible for creating the timeline of data your strategies will operate on. Think of it as a factory that produces arrays of timestamps representing your historical data, from one-minute intervals to three-day chunks.

It’s designed to be efficient, avoiding unnecessary calculations by caching previously generated timeframes. You can configure how often these timeframes are created and can even hook in custom functions to validate or record the generated data. 

The `getTimeframe` function is the core method; it's what you'll use to get the data timeline for a specific trading symbol. Remember that it uses caching, so calling it again for the same symbol will retrieve the previously generated data instead of recalculating it.


## Class ClientExchange

This class provides a client-side way to interact with an exchange, specifically designed for backtesting scenarios. It lets you retrieve historical and future candle data, allowing you to simulate trading strategies across different time periods. 

You can easily fetch past candles to analyze historical price movements, and look ahead to get future candles needed when evaluating how a trading signal would have performed. It also has a built-in function to calculate the Volume Weighted Average Price (VWAP) based on recent trade data, providing insights into the average price paid or received. 

Finally, it helps ensure your orders are formatted correctly for the exchange by providing functions to format both quantity and price, guaranteeing compatibility with the exchange’s requirements. This makes sure your simulated trades are accurate and realistic.

## Class BacktestUtils

This class offers helpful tools to streamline your backtesting process. It acts as a central point for initiating and managing backtest runs.

The `run` function lets you kick off a backtest for a specific trading symbol, providing context like strategy and exchange names.  It returns a sequence of results as the backtest progresses.

If you just need to run a backtest to trigger actions like logging or callbacks without needing the detailed results, the `background` function is perfect; it handles the backtest in the background without exposing the individual results.

You can also retrieve statistics summarizing the performance of a particular strategy using `getData`. `getReport` generates a nicely formatted markdown report summarizing a strategy’s closed signals, while `dump` lets you easily save that report to a file.

## Class BacktestMarkdownService

The BacktestMarkdownService is designed to automatically create and save detailed reports about your backtesting results. It keeps track of closed trading signals for each strategy you're testing, storing this information in a way that’s efficient and keeps data separate for each strategy. 

It generates these reports as markdown tables, which are then saved to your logs/backtest directory. You don’t need to manually build these reports – the service handles it all, listening for trading signals and creating the reports. 

The service also includes options to clear the stored signal data, either for a specific strategy or for all strategies. It automatically initializes when you first use it, so you don't have to worry about setting it up. It relies on a logger service for debugging and provides a way to retrieve statistical data and the complete report for a given strategy.

## Class BacktestLogicPublicService

BacktestLogicPublicService helps you run backtests in a simplified way. It manages the overall backtesting process, taking care of important details like keeping track of things like the strategy name, exchange, and frame being used. 

Essentially, it sits on top of the core backtesting logic and automatically passes this information along, so you don't need to specify it repeatedly in your code. 

The `run` method is the primary way to execute a backtest. It takes the symbol you want to test and starts streaming backtest results as a generator, automatically providing the necessary context to the underlying framework functions.

## Class BacktestLogicPrivateService

This service helps orchestrate backtesting processes, particularly when dealing with a lot of data. It breaks down the backtesting into manageable steps, starting by getting the timeframes for analysis.

It then moves through those timeframes, processing them one at a time and only performing calculations when a trading signal opens. When a signal closes, the backtest calculations are done, and the result is sent out.

Importantly, it handles everything in a memory-efficient way, streaming the results as they become available instead of building up a large array. You can also stop the backtest early if needed.

The `run` method is the main entry point – you provide a symbol (like a stock ticker) and it returns an asynchronous generator that yields the backtest results for closed signals. The service also relies on several other global services for things like logging, strategy management, exchange data, and timeframes.

## Class BacktestGlobalService

This service acts as a central hub for backtesting operations within the framework. Think of it as a way to easily access and manage the core components needed to run backtests.

It bundles together various services like logging, strategy schema handling, and validation, making it straightforward to inject these dependencies wherever they are needed. 

You’ll use this service if you need to execute a backtest for a specific trading symbol, providing information about the strategy, exchange, and data frame you're using. It handles the behind-the-scenes work of running the test and delivering the results.

# backtest-kit interfaces

## Interface WalkerContract

The `WalkerContract` helps you track the progress of your backtest comparisons. It’s like a little report delivered each time a strategy finishes testing and its ranking is determined.

You'll find key details included in this report, such as the name of the strategy that just completed, the exchange and symbol being tested, and the statistics generated during that test. 

Crucially, it also tells you how the current strategy’s performance compares to the best-performing strategy found so far, along with the overall progress of the comparison – how many strategies have been tested and how many remain. This allows you to monitor the optimization process and understand how different strategies are stacking up against each other.

## Interface TickEvent

This interface, TickEvent, provides a standard way to represent different events that happen during a backtest. Think of it as a single container holding all the essential data – like when the event occurred, what type of event it was (idle, opened, active, or closed), the trading pair involved, and a unique identifier for the signal. 

For events like opening, active, or closing a trade, you'll find details about the trade itself, such as the open price, take profit levels, stop loss, and any notes associated with the signal. When a trade is closed, further information is available, including the profit and loss, the reason for closure, and how long the trade lasted.  Essentially, this interface aims to unify the data structure for reporting and analysis of your backtest results, regardless of the specific event that took place.

## Interface ScheduleStatistics

This object helps you understand how your scheduled trading signals are performing. It provides a snapshot of all the events – when signals were scheduled and when they were cancelled.

You can see a complete list of these events, along with the total number of signals that were scheduled or cancelled. 

It also tells you the cancellation rate, which indicates the proportion of scheduled signals that were ultimately cancelled; a lower rate generally suggests more efficient signal management. Finally, you can calculate the average wait time for cancelled signals, giving you insight into potential delays or issues with your scheduling process.

## Interface ScheduledEvent

This interface holds all the key details about scheduled and cancelled trading events, making it easier to create reports and analyze your backtesting results. It combines information like when the event happened (timestamp), what type of event it was (scheduled or cancelled), the trading pair involved (symbol), and a unique identifier for the signal (signalId). 

You’ll also find information about the trade itself, such as the position type, any notes associated with the signal, and the planned entry price, take profit, and stop-loss levels. If an event was cancelled, you're provided with the close timestamp and duration of the trade. Essentially, it's a consolidated view of everything you need to know about a scheduled or cancelled trading event within your backtest.

## Interface ProgressContract

The ProgressContract provides updates on how a backtest is going. It’s like a little report sent during the background execution of your trading strategy. 

Each update includes the exchange and strategy names, the trading symbol involved, the total number of historical data points the backtest will analyze, and how many have already been processed. You'll also get a percentage indicating overall completion – a handy way to know how much longer the backtest will take.

## Interface PerformanceStatistics

This interface helps you understand how a trading strategy performed. It gathers key data points, like the strategy's name and the total number of events processed. You can see the overall execution time, and it breaks down the performance into different metric categories. Finally, it provides access to all the individual performance events, allowing for a deeper dive into the strategy's behavior. Think of it as a complete report card for your trading strategy.

## Interface PerformanceContract

The PerformanceContract lets you monitor how your trading strategies are performing, offering insights into where things might be slow or inefficient. It captures details about each operation, like when it started and ended (using timestamps), what kind of operation it was (metricType), and how long it took (duration). You’ll also find information about which strategy, exchange, and trading symbol were involved, along with whether the operation occurred during a backtest or live trading. This data is invaluable for profiling and optimizing your trading system. 

The `timestamp` tells you precisely when something happened. `previousTimestamp` helps you understand the sequence of events and calculate time intervals between them. The `metricType` clearly identifies the type of operation being measured. `strategyName`, `exchangeName`, and `symbol` tie the metric back to the specific components being tested. Finally, `backtest` indicates if the operation occurred in a simulated or live environment.

## Interface MetricStats

This object holds all the statistical data collected for a particular performance metric, like order execution time or fill slippage. It essentially summarizes how that metric performed over a set of tests.

You’ll find key information here, including the total number of times the metric was recorded, how long each instance took, and the overall range—from the fastest to slowest—along with important measures like the average, median, and percentiles (like the 95th and 99th).

It also provides details about the time *between* events related to the metric, helping you understand the timing and responsiveness of your trading logic. Each statistic is measured in milliseconds.

## Interface LiveStatistics

The `LiveStatistics` interface provides a collection of data reflecting your trading performance in real-time. It's essentially a snapshot of how your strategies are doing, offering key metrics for analysis.

You're given a detailed list of every event that has occurred during trading, including idle periods, order openings, active trades, and closed positions.  A simple count of total events, as well as just closed trades, is also included.

To understand profitability, you're provided with the number of winning and losing trades, along with crucial percentages like win rate, average PNL per trade, and the total PNL across all closed positions.

Beyond just profit, the data includes measures of risk and efficiency.  You'll find the standard deviation of returns to gauge volatility, the Sharpe Ratio to assess risk-adjusted returns, and an annualized version of that ratio.  Finally, a Certainty Ratio and Expected Yearly Returns provide additional insights into the predictability and potential performance of your strategies.  Keep in mind that many of these values might be null if the calculation results in an unsafe (NaN or Infinity) number, indicating an unreliable result.

## Interface IWalkerStrategyResult

This interface describes the result you get for each trading strategy when you're comparing them in a backtest. It holds the strategy's name, along with detailed performance statistics calculated during the backtest. You'll also find a key metric value used to rank the strategies against each other, and a numerical rank indicating how the strategy performed relative to the others—a lower rank means better performance. Think of it as a scorecard for each strategy, letting you easily see how they stack up.


## Interface IWalkerSchema

The IWalkerSchema defines how to set up A/B tests comparing different trading strategies within the backtest-kit framework. Think of it as a blueprint for running experiments. 

You give it a unique name so the system knows which test it is, and you can optionally add a note for yourself to explain what the test is about. 

It specifies which exchange and timeframe to use for all strategies being compared, making it easy to ensure a level playing field. The schema lists the names of the strategies you want to test against each other, ensuring they're all strategies that have been previously registered. 

You can also specify the metric you want to optimize – like Sharpe Ratio – and include optional callbacks to trigger actions at different points during the testing process.

## Interface IWalkerResults

The `IWalkerResults` object holds all the information gathered after a backtest walker has compared several trading strategies. It tells you which trading strategy was tested – including the symbol, exchange, and timeframe – and what metric was used to judge their performance.  You'll find details like the total number of strategies evaluated, the name of the strategy that performed the best, and the best metric score achieved. Finally, it provides access to the full statistical data for that top-performing strategy.

## Interface IWalkerCallbacks

This interface provides a way to listen in on the backtesting process when using the walker functionality. You can use these callbacks to track the progress of your strategy comparisons and react to key events. 

The `onStrategyStart` callback lets you know when a new strategy is beginning its backtest, giving you the strategy's name and the symbol it's being tested against.  When a strategy's backtest finishes, the `onStrategyComplete` callback is triggered, sending you the strategy's name, the symbol, key statistics from the backtest, and a custom metric value. Finally, `onComplete` is called once all strategies have been tested, providing you with a summary of all the results. This lets you monitor and potentially influence the backtesting workflow.

## Interface IStrategyTickResultScheduled

This interface describes a specific type of tick result within the backtest-kit framework. It signifies that a trading signal has been generated and is currently "scheduled," meaning it's waiting for the market price to reach a predetermined entry point. 

You'll encounter this result when your strategy's `getSignal` function produces a signal that includes a specified `priceOpen`. The result provides key details like the strategy’s name, the exchange used, the trading symbol, the current price when the signal was generated, and the actual signal row itself. This allows you to track and understand the conditions that led to a scheduled signal being created and monitor its progress.


## Interface IStrategyTickResultOpened

This interface describes what happens when a new trading signal is created within your backtesting strategy. Think of it as a notification that a signal has been successfully generated and is now ready to be acted upon. 

It provides key details about the signal, including its unique identifier, the name of the strategy that generated it, the exchange it's for, and the trading symbol involved (like "BTCUSDT"). You’re also given the current price at the time the signal was opened, which is helpful for understanding the context of the trade. This information is essential for building custom logic or visualizations around your backtesting process.


## Interface IStrategyTickResultIdle

This interface, `IStrategyTickResultIdle`, represents what happens when your trading strategy isn't actively making decisions – it's in an idle state. It’s a way to keep track of events when no signal is present. You’ll see this result when your strategy is waiting for new information or conditions to trigger a trade.

It provides information like the name of the strategy, the exchange being used, the symbol being traded (like BTCUSDT), the current price, and confirms that the `action` is indeed "idle," and that no signal is currently present. This data helps you monitor your strategy's behavior and understand when it's not taking action.


## Interface IStrategyTickResultClosed

This interface represents the result of a trading signal being closed, providing a complete picture of what happened and the financial outcome. It includes the original signal details, like its initial parameters, along with the final price at which the trade was closed. You’ll also find information about why the signal closed – whether it was due to a time limit expiring, a take-profit target being reached, or a stop-loss being triggered.

Importantly, this result provides a profit and loss calculation, factoring in fees and slippage, along with identifying the strategy and exchange used. It also includes the exact timestamp of when the trade closed, allowing for detailed performance analysis. Essentially, it's the final report card for a closed trading signal.


## Interface IStrategyTickResultCancelled

This interface describes what happens when a pre-planned trading signal is cancelled. It’s used when a signal doesn’t actually lead to a trade being opened, for example, if it’s deactivated or hits a stop-loss before a position can be entered.

The `action` property simply confirms that the action taken was a cancellation. You'll also find details about the signal that was cancelled, like the `signal` itself, and the `currentPrice` at the time of cancellation. Finally, you're provided with tracking information, including the `strategyName`, `exchangeName`, and the `symbol` being traded.


## Interface IStrategyTickResultActive

This interface represents a state in your trading strategy where a signal is actively being tracked. Think of it as the strategy 'waiting' – it's monitoring a specific signal, anticipating a potential trade trigger like a Take Profit (TP), Stop Loss (SL), or time expiration. 

The `action` property confirms this 'active' state. You’ll find details about the signal itself in the `signal` property. The `currentPrice` field holds the VWAP (Volume Weighted Average Price) which serves as the price benchmark for the strategy's monitoring.  To keep things organized, the interface also includes information about the strategy's name, the exchange it’s operating on, and the trading symbol involved.

## Interface IStrategySchema

This interface, `IStrategySchema`, is the blueprint for defining a trading strategy within the backtest-kit framework. Think of it as a recipe that tells the system how your strategy makes trading decisions.  

It requires a unique `strategyName` for identification and can include a `note` to explain the strategy's purpose. You’ll also specify a minimum `interval` to prevent the strategy from generating signals too frequently. 

The core of the schema is the `getSignal` function, which is where you’re writing the actual logic that decides when to buy or sell. It takes a symbol (like a stock ticker) and returns a signal – or nothing if no action is needed.  You can even use a priceOpen to schedule a signal, waiting for the price to reach a specific point before executing.

Optional callbacks, `callbacks`, provide hooks for actions when a trade opens or closes. You can also assign a `riskName` to associate your strategy with a specific risk profile for better management.

## Interface IStrategyPnL

This interface, `IStrategyPnL`, helps you understand how your trading strategy performed by providing key profit and loss details. It represents the result of a trade's profitability, taking into account fees and slippage – those small costs that often impact real-world trading. You’ll find the `pnlPercentage` property, which shows you the profit or loss as a percentage, allowing for easy comparison of different strategies. The `priceOpen` property gives you the actual entry price you paid, after accounting for fees and slippage, and `priceClose` tells you the exit price after the same adjustments.

## Interface IStrategyCallbacks

This interface provides a way to hook into the key events of your trading strategy within the backtest-kit framework. Think of these as notification points that allow your strategy to react to changes in the trading environment.

You can define functions to be executed when a new signal is opened, when a signal is actively being monitored, when there are no active signals, when a signal is closed, or when a scheduled signal is created or canceled.  The `onTick` callback gets triggered with every new price update, providing a constant stream of data.  The `onOpen`, `onActive`, `onIdle`, `onClose`, `onSchedule`, and `onCancel` callbacks give you specific opportunities to customize behavior around the signal lifecycle. Each callback receives relevant data like the symbol, signal details, price information, and a flag indicating whether the event is part of a backtest.

## Interface IStrategy

The `IStrategy` interface outlines the essential functions any trading strategy built with backtest-kit must have. It's the foundation for how your strategy interacts with the framework.

The `tick` function represents a single step in your strategy’s execution, handling each new market update. It's responsible for checking if a signal should be generated, and also whether any existing take profit or stop loss orders need adjustment.

The `backtest` function allows you to quickly test your strategy using historical price data. This lets you see how your strategy would have performed without risking real money.

Finally, `stop` provides a way to halt your strategy’s signal generation, useful for controlled shutdowns in live trading where you don’t want to abruptly close any currently open positions.

## Interface ISizingSchemaKelly

This interface defines how to size your trades using the Kelly Criterion, a strategy focused on maximizing long-term growth. When implementing this, you’re essentially telling the backtest kit that your sizing method is based on the Kelly Criterion. The `kellyMultiplier` property controls how aggressively you size your positions; a lower value (like the default of 0.25) represents a more conservative quarter Kelly approach, while higher values increase risk and potential reward. This multiplier directly impacts how much of your capital is allocated to each trade based on the signals generated by your strategy.

## Interface ISizingSchemaFixedPercentage

This schema lets you define a trading strategy where the size of each trade is always based on a fixed percentage of your available capital. You specify that percentage using the `riskPercentage` property – for example, a value of `2` means each trade will risk 2% of your total capital. The `method` property is always set to `"fixed-percentage"` to identify this specific sizing approach. It's a simple way to ensure consistent risk exposure across all your trades.

## Interface ISizingSchemaBase

This interface, ISizingSchemaBase, provides a foundation for defining how much of your account to allocate to each trade. Think of it as a blueprint for sizing your positions. 

It includes essential properties like `sizingName`, a unique identifier for your sizing strategy, and a helpful `note` field for adding developer documentation. You'll also find controls for position sizing: `maxPositionPercentage` lets you cap your exposure as a percentage of your account balance, while `minPositionSize` and `maxPositionSize` set absolute minimum and maximum trade sizes.  Finally, `callbacks` allow you to customize the sizing process with optional lifecycle hooks.

## Interface ISizingSchemaATR

This schema defines how your trading strategy determines position size using the Average True Range (ATR). It's designed for strategies that want to size trades based on market volatility.

The `method` property is always set to "atr-based" to confirm you're using this specific sizing technique.

`riskPercentage` controls how much of your capital you’re willing to risk on each trade – a value between 0 and 100 represents the percentage.

Finally, `atrMultiplier` determines how the ATR is used to calculate the stop distance, effectively scaling the position size based on the current volatility of the asset. A higher multiplier will lead to wider stops and potentially smaller position sizes.

## Interface ISizingParamsKelly

This interface, `ISizingParamsKelly`, helps you define how much of your capital to risk on each trade when using the Kelly Criterion. It's primarily used when setting up your trading strategy's sizing parameters. You’re essentially providing information about how your strategy will determine bet sizes.

One key part is the `logger`, which allows you to track and debug your sizing decisions – a really helpful way to understand why your strategy is placing the trades it is.

## Interface ISizingParamsFixedPercentage

This interface, `ISizingParamsFixedPercentage`, helps define how much of your capital you're going to risk on each trade when using a fixed percentage sizing strategy. It's a straightforward way to control your position sizes. 

You’re required to provide a `logger` object, which is used for displaying helpful debugging information about your trading decisions. Think of it as a way to keep track of what's happening behind the scenes.


## Interface ISizingParamsATR

This interface, `ISizingParamsATR`, helps you control how much of your capital is used for each trade when using an ATR-based sizing strategy. It’s designed to work with the `ClientSizing` constructor. The key component here is the `logger`, which allows you to see debug information and troubleshoot any issues you might encounter while using the sizing parameters. This logger helps you understand how your trade sizes are being calculated.

## Interface ISizingCallbacks

This interface helps you tap into the sizing process within backtest-kit. Specifically, the `onCalculate` property lets you hook into the moment when the framework determines how much of an asset to trade. You can use this to keep an eye on the calculated size – perhaps to log it for analysis or to ensure it falls within acceptable limits. It provides a way to observe and potentially influence the sizing decisions being made.

## Interface ISizingCalculateParamsKelly

This interface describes the information needed to calculate trade sizes using the Kelly Criterion. 

To use it, you'll need to specify the calculation method, which in this case is "kelly-criterion." You also provide the win rate, expressed as a number between 0 and 1, and the average win/loss ratio to inform the sizing. Essentially, this defines the inputs that help determine how much to trade based on your historical performance.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the information needed to calculate the size of a trade using a fixed percentage of your capital. Essentially, it tells the backtest kit how much of your funds you want to risk on each trade, expressed as a percentage. You're providing the stop-loss price, which the system uses to determine the appropriate trade size based on that fixed percentage risk. It's a straightforward way to manage risk by committing a consistent portion of your capital to each potential trade.

## Interface ISizingCalculateParamsBase

This interface, `ISizingCalculateParamsBase`, provides the foundational information needed when determining how much of an asset to buy or sell. It ensures that all sizing calculations have access to essential data.

You'll find details about the trading symbol, represented by `symbol`, which identifies the asset pair being traded, like "BTCUSDT". It also includes the current account balance, `accountBalance`, so sizing algorithms can factor in available capital. Finally, `priceOpen` represents the anticipated entry price for a trade.

## Interface ISizingCalculateParamsATR

This interface defines the information needed when calculating trade sizes based on the Average True Range (ATR). To use this method, you're essentially telling the system to use the ATR value to determine how much to trade. The `atr` property holds the actual ATR value that will be used in the sizing calculation – it's the numerical value representing the volatility you're factoring in.

## Interface ISizing

The `ISizing` interface is a core piece of backtest-kit, responsible for determining how much of an asset your trading strategy will buy or sell. It's the engine that figures out your position size, ensuring your trades align with your risk management rules.

The main part of this interface is the `calculate` function. This function takes in information about your trading parameters—like your risk tolerance and account size—and figures out the appropriate position size for a given trade. It's how the framework translates your risk preferences into actual trade volumes.

## Interface ISignalRow

This interface, `ISignalRow`, represents a fully formed signal ready to be used within the backtest kit. Think of it as the finalized version of a trading signal after it's been checked and prepared. 

Each signal has a unique ID, which is automatically generated. You’ll also find the entry price, the exchange to use, and the name of the strategy that generated the signal. 

Importantly, it records when the signal was initially created and when the position became pending. It also includes the trading pair symbol, like BTCUSDT, and an internal flag indicating whether the signal was initially scheduled. This interface helps keep track of all the essential details related to a single trading signal.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, the kind you’d get when requesting a signal from the backtest-kit framework. Think of it as a structured way to communicate what a trade should be. 

It includes details like whether you should go long (buy) or short (sell), a description of why the signal was generated, and the entry price for the trade. Importantly, it also specifies the target price for taking profit and the price at which to cut your losses with a stop-loss order. Finally, it indicates how long you should expect to hold the position before it expires.  If you don't provide a unique ID for the signal, the system will automatically create one.

## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, represents a signal that's waiting for the market to reach a specific price before it can be executed. Think of it as a signal put on hold, patiently awaiting a particular price level to trigger it. It builds upon the `ISignalRow` interface, adding the concept of delayed execution.

Once the market price hits the `priceOpen` level defined in the signal, it transforms into a standard pending signal, ready to be filled. An important detail is that the `pendingAt` timestamp will initially reflect the time the signal was scheduled, and then update to the actual time it began waiting.

The `priceOpen` property is the key – it defines the target price that needs to be reached for the signal to activate.


## Interface IRiskValidationPayload

This data structure provides the information needed for risk validation checks. It includes details about your current portfolio, specifically how many active positions you have and a list of those active positions. Think of it as a snapshot of your trading activity, allowing risk functions to assess potential issues based on what you’re currently holding. The `activePositionCount` simply tells you the total number of active positions, while `activePositions` gives you the specifics of each one.

## Interface IRiskValidationFn

This defines a special function type used to ensure your trading strategies are set up safely. Think of it as a gatekeeper for your risk settings. It’s responsible for checking things like your initial capital, maximum position size, or other risk-related parameters to make sure they are within acceptable limits. If the function detects something is wrong – for example, your position size is too large for your capital – it will throw an error, preventing your backtest from proceeding with potentially dangerous settings. It’s a crucial part of building robust and reliable trading strategies.


## Interface IRiskValidation

This interface, `IRiskValidation`, helps you define how to check if your trading strategies are behaving safely. Think of it as a way to set up rules and guidelines to prevent risky actions.

It has two main parts: a `validate` function that performs the actual risk check—this is where you put the logic to determine if the strategy is okay—and an optional `note` field to add a description explaining what the validation is doing and why. This note is really helpful for making sure everyone understands the validation's purpose.

## Interface IRiskSchema

The `IRiskSchema` interface helps you define and manage risk controls for your trading portfolio. Think of it as a blueprint for how you want to ensure your trades stay within acceptable boundaries. 

Each schema lets you assign a unique name to identify it, and add a note for your own reference to explain its purpose. You can also specify optional callbacks to be triggered when a trade is rejected or allowed.

The core of the schema is the `validations` array. This is where you put your custom rules – functions or objects – that will be used to evaluate your trades and determine whether they meet your risk criteria.  Essentially, this is where you write the logic that keeps your portfolio safe.

## Interface IRiskParams

The `IRiskParams` interface defines the information needed when setting up a risk management system within the backtest-kit framework. Think of it as a blueprint for configuring how your trading system will handle risk. 

It primarily focuses on providing a way to log important events and debugging information during the backtesting process. Specifically, it requires a `logger` which is responsible for capturing and displaying messages, helping you understand what's happening behind the scenes while your backtest runs.

## Interface IRiskCheckArgs

The `IRiskCheckArgs` interface provides the information needed to decide if a trading strategy should be allowed to create a new signal. It’s used as a check *before* a signal is generated, essentially validating if the conditions are right for opening a position. Think of it as a gatekeeper ensuring your strategy isn't acting inappropriately based on market conditions and its own identity.

It bundles together several pieces of context from the `ClientStrategy`, including the trading pair's symbol, the strategy's name, the exchange being used, the current market price, and the current time. By providing these details, the risk check can make informed decisions about whether the strategy should proceed with generating a signal. It’s a way to ensure responsible and controlled trading.

## Interface IRiskCallbacks

This interface provides a way to be notified about the results of risk assessments during trading. 

If a trading signal is blocked because it exceeds defined risk limits, the `onRejected` callback will be triggered, letting you know which symbol was affected and why. 

Conversely, if a signal successfully clears all risk checks, the `onAllowed` callback will be called, so you can track when trades are permitted. 

Think of these callbacks as notification tools to monitor your risk management process.

## Interface IRiskActivePosition

This interface, `IRiskActivePosition`, represents a single, active trading position that’s being monitored for risk management across different strategies. Think of it as a snapshot of a trade, telling you key details about it. You'll find information like the original signal that triggered the trade (`signal`), which strategy is responsible for it (`strategyName`), the exchange it's on (`exchangeName`), and the exact time the position was opened (`openTimestamp`). This allows for a complete picture of a position’s lifecycle in relation to risk analysis.

## Interface IRisk

The `IRisk` interface helps your trading strategies stay within defined risk boundaries. It's a core part of managing risk exposure.

You'll use `checkSignal` to see if a potential trade aligns with your risk rules – it tells you whether a signal is safe to execute.

To keep track of active trades, you'll register them with `addSignal`, providing details like the asset being traded and the specific risk profile being used. 

When a trade closes, `removeSignal` lets you update the system and reflect the reduced risk exposure. Essentially, this interface helps you monitor and control how much risk your strategies are taking on.

## Interface IPositionSizeKellyParams

This interface defines the parameters needed to calculate position sizes using the Kelly Criterion. It focuses on the sizing aspect, excluding any specific method used for calculating the win rate or win/loss ratio. You'll provide a win rate, expressed as a number between 0 and 1, representing the probability of winning a trade.  Also, you specify the average win/loss ratio, which is the average amount you win compared to what you lose on a single trade. These two values together let the framework determine how much of your capital to allocate to each trade.

## Interface IPositionSizeFixedPercentageParams

This interface defines the parameters needed to calculate a position size using a fixed percentage of your capital. It's a straightforward way to size your trades, ensuring a consistent percentage of your portfolio is at risk on each trade. The `priceStopLoss` property specifies the price at which your stop-loss order will be placed, helping to manage potential losses. You'll use this when you want to determine how much to trade based on a fixed percentage and a defined stop-loss price.

## Interface IPositionSizeATRParams

This interface, `IPositionSizeATRParams`, helps define the settings needed when calculating position sizes using the Average True Range (ATR) indicator. It’s a straightforward way to specify the current ATR value, which is a key input for determining how much capital to allocate to a trade. Essentially, you’re telling the system what the recent volatility has been, so it can adjust your position accordingly. Think of it as providing a single number representing market risk.

## Interface IPersistBase

This interface defines the core functions for managing data persistence within the backtest-kit. It handles reading, writing, and checking for the existence of your trading entities, like orders or account snapshots. 

The `waitForInit` method sets up the persistence directory initially and makes sure it’s done only once. 

`readValue` fetches a specific entity based on its ID.

`hasValue` lets you quickly check if an entity already exists before attempting to read or write it.

Finally, `writeValue` writes an entity to storage, ensuring the operation is done safely and reliably.

## Interface IMethodContext

This interface, `IMethodContext`, acts as a little helper package that carries important information about which parts of your trading system are involved in a particular operation. Think of it as a way to keep track of which exchange, strategy, and frame are being used.  It’s automatically passed around within the backtest-kit framework, so you don't have to manually manage these details. 

It contains three properties: `exchangeName`, `strategyName`, and `frameName`. These strings identify the specific schemas (configurations) associated with the trading exchange, the strategy being employed, and the historical data frame being used. Notably, `frameName` is left empty when running in live trading mode, as there’s no historical frame involved in that scenario.

## Interface ILogger

The `ILogger` interface provides a standard way for different parts of the backtest-kit framework to record information about what's happening. Think of it as a central place to keep track of events, errors, and important details.

You can use it to log general messages about significant events. It also has specific methods for debug information – helpful when you're troubleshooting – and for providing informational updates on things like successful actions. Warnings are used to flag potential issues that need review but don't stop the system from working. This logging system helps you understand, monitor, and debug your trading strategies.

## Interface IHeatmapStatistics

This interface, `IHeatmapStatistics`, holds a snapshot of your portfolio’s performance, presented in a way that’s easy to visualize. It provides key metrics calculated across all the assets you're tracking.

You’ll find a detailed breakdown of each symbol’s statistics in the `symbols` array, giving you insight into individual asset behavior. 

The `totalSymbols` property simply tells you how many assets are included in this overall view.  `portfolioTotalPnl` represents the combined profit and loss for your entire portfolio, while `portfolioSharpeRatio` indicates the risk-adjusted return.  Finally, `portfolioTotalTrades` provides a count of all the trades executed across your portfolio.

## Interface IHeatmapRow

This interface describes the performance statistics for a single trading symbol, like BTCUSDT, when looking at the combined results of all strategies applied to it. It provides a snapshot of how that symbol performed overall, including metrics like total profit, risk-adjusted return (Sharpe Ratio), and maximum drawdown.

You’ll find details on the total number of trades executed for that symbol, broken down into winning and losing trades, and key profitability indicators like average profit per trade and win rate. It also includes information on streaks of wins and losses, as well as expectancy, which helps gauge the long-term profitability potential. Each property offers insights into a different facet of the symbol's trading performance.

## Interface IFrameSchema

The `IFrameSchema` describes the basic structure for defining a timeframe used within backtest-kit. Think of it as the blueprint for a specific trading period, dictating when and how data is generated. Each schema needs a unique `frameName` to identify it.  You can add a `note` for your own documentation, which helps explain the purpose of that timeframe. 

The `interval` property sets the frequency of data points – for example, daily, hourly, or even minute-by-minute.  `startDate` and `endDate` clearly mark the beginning and end of the backtesting period that this frame will cover. Finally, you have the option to provide `callbacks` to hook into key events within the frame's lifecycle.

## Interface IFrameParams

The `IFramesParams` interface defines the information needed when you're setting up a ClientFrame, which is a core component for running trading strategies. Think of it as the blueprint for how your frame will operate. Crucially, it includes a `logger` property. This logger allows you to keep track of what’s happening inside the frame, which is incredibly helpful for debugging and understanding your trading strategy's behavior. The logger allows you to send debug messages for internal logging.

## Interface IFrameCallbacks

This interface lets you listen for events related to how your backtest organizes time periods. Specifically, `onTimeframe` is triggered whenever a new set of timeframes is created, like when the backtest is initialized or the data range changes. It provides you with the generated timeframe dates, the start and end dates of the overall data, and the interval used to create those timeframes, allowing you to inspect or record information about these crucial building blocks of your backtest.

## Interface IFrame

The `IFrame` interface is a core component that helps generate the timeline for your backtesting simulations. Think of it as the system that creates the sequence of dates and times your trading strategies will be evaluated against. 

The `getTimeframe` function is the main method you'll interact with. It takes a symbol (like a stock ticker) and a frame name (defining the interval, such as "1m" for 1-minute candles) and returns an array of dates. This array represents the times your strategy will be tested – essentially, the 'when' for your trading decisions. This function handles the process of spacing out those timestamps according to the specific timeframe you've chosen.

## Interface IExecutionContext

The `IExecutionContext` interface provides the information your trading strategies and exchanges need to function correctly. Think of it as a shared set of parameters that's automatically passed around to give context for actions like fetching historical data, handling market events, and running backtests. It tells your code *what* symbol you're trading, *when* the operation is happening (the current timestamp), and crucially, whether it’s running a backtest or a live trade. This interface helps ensure everything operates within the correct timeframe and knows if it's analyzing past data or interacting with a live market.

## Interface IExchangeSchema

This interface describes how your data source, like a cryptocurrency exchange or broker, integrates with the backtest-kit framework. Think of it as a blueprint for connecting to a specific trading platform. 

You're essentially telling the framework where to get candle data (the historical price movements) and how to handle quantities and prices according to the exchange's specific rules. The `exchangeName` is a unique identifier for your connection. 

The `getCandles` function is the core – it’s how the framework retrieves the price data for a given symbol (like BTC/USD), interval (like 1 hour), and time range. `formatQuantity` and `formatPrice` ensure your orders and calculations respect the exchange's precision requirements. Finally, `callbacks` allows you to hook into events like candle data arrival for potential custom logic.

## Interface IExchangeParams

The `IExchangeParams` interface helps set up your exchange connection within the backtest-kit framework. Think of it as the configuration you pass when creating your exchange instance. It includes a `logger` so you can see what's happening behind the scenes – useful for debugging and understanding how your trading strategies are behaving. You also provide an `execution` context, which gives the exchange information about the current environment, like which symbol you’re trading and the timeframe you're using. This ensures your backtest or live trading environment is correctly configured.

## Interface IExchangeCallbacks

The `IExchangeCallbacks` interface lets you listen for events coming from the exchange data feed within the backtest-kit framework. Specifically, you can register a function to be called when new candlestick data becomes available. This `onCandleData` callback receives details about the request – which symbol, time interval, starting date, number of candles requested – and the actual candle data itself. It's a useful way to react to incoming market data as it's being retrieved.

## Interface IExchange

The `IExchange` interface defines how your backtesting system interacts with an exchange. It provides essential methods for retrieving historical and future candle data, which are crucial for analyzing price action and generating trading signals.

You can use `getCandles` to pull past candle data for a specific symbol and interval, allowing you to recreate past market conditions. `getNextCandles` is designed for backtesting, enabling you to simulate future price movements. 

To ensure your orders are placed correctly, `formatQuantity` and `formatPrice` automatically adjust quantities and prices to match the exchange’s precision rules.

Finally, `getAveragePrice` calculates the Volume Weighted Average Price (VWAP) based on recent activity, giving you an idea of the average price during a specific timeframe.

## Interface IEntity

This interface, `IEntity`, serves as the foundation for anything you store and retrieve from a database within the backtest-kit framework. Think of it as a common starting point for all your data objects, ensuring they share a consistent structure. If you're creating custom data models that need to be saved or loaded, they should implement this interface. It’s a simple way to maintain organization and consistency across your trading system's data.

## Interface ICandleData

This interface, `ICandleData`, represents a single candlestick, a common way to visualize price action over time. It contains all the essential information for each time interval: the exact time the candle began (`timestamp`), the price when trading started (`open`), the highest price reached during that time (`high`), the lowest price seen (`low`), the closing price at the end (`close`), and the total volume of trades that occurred (`volume`).  Think of it as a snapshot of market activity for a specific period, useful for things like calculating moving averages or running simulations of trading strategies. It’s a foundational piece of data for backtesting and analyzing market behavior.

## Interface DoneContract

This interface helps you track when a background process, either in a backtest or live trading environment, finishes running. It's a notification that tells you a specific strategy has completed its execution.  You'll receive an instance of this interface when a `Live.background()` or `Backtest.background()` function is done. It provides key details like the exchange used, the name of the strategy, whether it was a backtest or live run, and the trading symbol involved.  Essentially, it's a completion report for your background tasks.

## Interface BacktestStatistics

The `BacktestStatistics` interface holds all the key performance indicators calculated after running a backtest. It provides a detailed breakdown of your strategy's results, allowing for thorough analysis.

You'll find a list of every closed trade (`signalList`) along with the total number of trades executed (`totalSignals`). It also tracks the number of winning trades (`winCount`) and losing trades (`lossCount`).

Several key metrics help you assess profitability and risk. The `winRate` shows the percentage of winning trades. The `avgPnl` represents the average profit or loss per trade, while `totalPnl` is the overall cumulative profit. 

To measure risk, the `stdDev` indicates volatility, and the `sharpeRatio` and `annualizedSharpeRatio` provide risk-adjusted return measures. The `certaintyRatio` helps understand the relationship between winning and losing trade sizes. Finally, `expectedYearlyReturns` gives an estimate of yearly performance based on trade durations and profits. Note that if any calculation results in an unsafe value (like dividing by zero), the corresponding statistic will be null.
