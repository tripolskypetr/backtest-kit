---
title: private/functions
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


# backtest-kit functions

## Function writeMemory

The `writeMemory` function lets you store data persistently within your trading strategy, associating it with a specific memory location identified by a name and ID. Think of it as creating labeled containers to hold information that your strategy can recall later. This function automatically handles the complexities of where and how this data is saved, whether you're running a backtest or a live trade.

You provide the name of the memory bucket, a unique ID for the memory slot, the data you want to store (which can be any object), and a brief description to help you remember what's in there. 

The function takes care of resolving the current signal – meaning it knows which trade or signal the memory belongs to – so you don't have to worry about that detail yourself. It adapts seamlessly to different environments, handling the nuances of backtesting versus live trading without requiring you to change your code.


## Function warmCandles

This function helps speed up backtesting by pre-loading historical candle data. It fetches candles within a specified date range and interval, storing them so they’re readily available during a backtest run. Think of it like preparing the data in advance so your backtest doesn't have to repeatedly download it. This is particularly useful when you're working with frequently used date ranges or intervals. The `params` object will contain details about the starting and ending dates, as well as the candle interval you want to cache.

## Function waitForReady

This function ensures that all necessary components are fully initialized before you begin trading. It waits, checking periodically, until the system confirms that the registries for exchanges, strategies, and (if in backtest mode) historical data frames are ready. This is particularly helpful when these components are loaded asynchronously, such as when using plugins or fetching configuration remotely. If the waiting period exceeds a certain limit, the function simply finishes, and any errors arising from missing components will be surfaced later during the trading process. You can control whether to wait for historical data frames by setting the `isBacktest` parameter.

## Function validate

The `validate` function checks that all the entities your trading system uses – like exchanges, strategies, and risk settings – are correctly registered. 

Think of it as a quick health check before you start running tests. 

You can specify which entities to check, or just let it verify *everything*. 

It’s designed to be efficient, remembering the results of previous checks so it doesn't repeat work. 

Run this before any backtests or optimizations to avoid errors caused by missing or misconfigured entities.

## Function stopStrategy

This function allows you to pause a trading strategy's signal generation.

It effectively stops the strategy from creating new trades. 

Any existing, open trades will still finish executing.

The framework will handle stopping the process safely, whether you're in backtesting or live trading mode. 

You simply need to provide the trading pair symbol (like 'BTCUSDT') for the strategy you want to pause; the system will identify the correct strategy based on your current context.

## Function shutdown

This function provides a way to cleanly end a backtest. It sends out a signal that lets all parts of the backtest know it's time to wrap up. Think of it as a polite way to say goodbye, allowing components to finish what they’re doing and save any important data before the testing process stops. You'd usually call this when you need to stop the backtest, like when you press Ctrl+C.

## Function setSignalState

The `setSignalState` function lets you update a specific value related to a trading signal. This is particularly useful when you're building strategies that track metrics over time, like how long a trade is open or its percentage gain.

It automatically finds the current active signal – whether it's a pending order or one that's already scheduled – and uses that information. If no active signal is found, the function will let you know by throwing an error.

It works seamlessly in both backtesting and live trading environments, automatically adjusting its behavior based on the execution context.

This function is designed for advanced strategies, often used in scenarios involving AI or large language models (LLMs) where you're accumulating data about each trade. The goal is to manage trades that can withstand drawdowns and potentially achieve significant profits. 


## Function setSessionData

This function lets you store data specific to a trading symbol, strategy, exchange, and the timeframe you’re using. Think of it as a place to keep information that needs to be remembered between candles during a backtest, or even if the program restarts while running live. This is great for things like saving results from complex calculations or storing state information that needs to be available across multiple candles. If you want to clear the stored data, simply pass `null` as the value. It automatically adjusts to whether you’re running a backtest or live trading.

You provide the symbol of the trading pair, and the data you want to store, which can be an object or `null` to remove existing data.


## Function setLogger

You can now control how the backtest-kit framework logs information. This function allows you to provide your own logging system, letting you capture and manage log messages however you prefer. When you set a logger, all internal framework messages will be sent to it, and importantly, useful context like the strategy name, exchange, and symbol will be automatically included with each log entry. This makes debugging and understanding your trading strategies much easier.


## Function setConfig

The `setConfig` function lets you adjust how the backtest-kit framework operates. You can pass in a set of configuration options to change specific settings, overriding the defaults.  It's particularly useful when setting up test environments because it includes an `_unsafe` flag that bypasses some configuration checks, which is necessary in certain testing scenarios. Think of it as fine-tuning the framework to suit your specific backtesting needs.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, like those generated for markdown. You can change how data is displayed and organized within the reports.

It allows you to modify existing column configurations or add new ones, overriding the default settings. 

Keep in mind that the system validates your changes to ensure everything is set up correctly. 

There's also a special option, `_unsafe`, which bypasses those validations—but you should only use it if you absolutely know what you're doing, such as in a testing environment.


## Function searchMemory

The `searchMemory` function lets you find relevant pieces of stored information related to your trading signals. It uses a powerful search technique called BM25 to rank the results, ensuring the most important information appears first. 

Think of it as a way to quickly retrieve related data based on a text query – like finding past performance or notes associated with a specific market movement.  The function intelligently figures out whether you're in a backtesting or live trading environment, and also picks the correct signal from your current workflow.

You provide a `dto` object containing the name of the memory bucket you want to search and the query you’re looking for. The function returns a list of results, each including a unique ID, a score representing how well it matches your query, and the actual data content.


## Function runInMockContext

This function lets you run a piece of code as if it were part of a backtest or live trading environment, but without actually running a full backtest.

It's perfect for testing or creating scripts that need information like the current timeframe or other context-related details.

You can specify which exchange, strategy, frame, symbol, and time to simulate, but if you don’t, it defaults to a simple live-mode setup. 

The provided function executes the provided `run` function inside this simulated environment, allowing access to context-dependent services.


## Function removeMemory

This function helps you clean up your backtest data by deleting specific memory entries. Think of it as removing old records associated with a particular signal. 

It takes two pieces of information: the name of the "bucket" where the memory is stored and a unique identifier for the specific memory entry you want to remove.

Importantly, this function automatically handles the specifics of whether you're running a backtest or a live trading session, and it will resolve any pending or scheduled signals related to the deletion. This means you don't have to worry about those details – it's handled for you.


## Function readMemory

The `readMemory` function lets you retrieve data that's been stored in memory, specifically linked to the current trading signal. It’s designed to be flexible, working whether you're running a backtest or a live trade.

You provide a simple object containing the bucket name and a unique memory ID to identify the data you want. The function then handles the details of finding the right signal and whether it's a test or live environment. 

Essentially, it's a shortcut for accessing stored data with minimal configuration.


## Function overrideWalkerSchema

This function lets you tweak an existing trading strategy's walker configuration, which is how the strategy’s decisions are analyzed and compared.  It’s useful when you want to adjust things like how data is processed or how signals are evaluated without having to rebuild the entire strategy. You essentially provide a set of changes – just the parts you want to modify – and the function applies those changes to the original walker setup, leaving the rest untouched. Think of it as a targeted update for more granular control over strategy analysis. The input is a partial walker configuration object.


## Function overrideStrategySchema

This function lets you modify a trading strategy that's already set up within the backtest-kit framework. Think of it as a way to tweak an existing strategy – you can change specific parts of its configuration without having to redefine the entire thing. It's helpful when you want to adjust settings like parameters or data sources without a complete overhaul. You provide a smaller piece of information, representing the changes you want to make, and it merges that with the original strategy definition.

## Function overrideSizingSchema

This function allows you to modify a position sizing strategy that’s already been set up within the backtest-kit framework. Think of it as a way to fine-tune an existing sizing strategy without having to rebuild it entirely. You provide a new configuration, and only the properties you specify will be changed; everything else stays the same. This is useful for making incremental adjustments to your sizing rules as you refine your trading system. You’ll be giving the function a partial sizing configuration, where you only define the parts you want to override.

## Function overrideRiskSchema

This function lets you tweak existing risk management settings within the backtest-kit framework. Think of it as a way to make small adjustments to a risk profile that's already been set up.  You don’t replace the whole thing, just specific parts you want to change. 

It accepts a partial configuration – just the settings you want to update – and then applies those changes to the existing risk management setup. Any settings you *don't* provide will stay as they were.


## Function overrideFrameSchema

This function lets you modify existing timeframe configurations used during backtesting. Think of it as a way to tweak specific aspects of a timeframe without rebuilding the whole thing. You provide a partial configuration – just the settings you want to change – and the function updates the original timeframe accordingly, leaving everything else untouched. This is useful for adjusting things like the data aggregation frequency or other timeframe-specific settings after the initial setup.

## Function overrideExchangeSchema

This function allows you to modify an already set up data source for an exchange. Think of it as making targeted changes to an exchange’s configuration, rather than completely replacing it. You can specify only the parts of the exchange's setup that you want to adjust – anything you don't provide will keep its original values. It's useful when you need to tweak an existing exchange’s settings without redoing everything. The function returns the updated exchange schema.


## Function overrideActionSchema

This function lets you tweak existing action handlers within the backtest-kit framework. Think of it as a way to fine-tune how your trading logic reacts to specific events, like orders being filled or market data arriving. You don't need to replace the entire handler – just provide the changes you want to make, and only those parts of the configuration will be updated. This is helpful for quickly adapting to different environments, switching between different handler versions, or making small adjustments to behavior without fundamentally altering your strategy. To use it, you'll provide a partial configuration object with the settings you'd like to modify.

## Function listenWalkerProgress

This function lets you monitor the progress of a trading strategy backtest. It provides updates after each strategy finishes running within a larger backtest process.

Importantly, these updates are delivered one at a time, even if the function you provide for handling them performs asynchronous operations. This ensures a controlled and predictable flow of information about the backtest’s advancement.

To use it, you give it a function that will be called with details about the completed strategy. The function you provide will also return another function that can be called to unsubscribe from the updates.


## Function listenWalkerOnce

`listenWalkerOnce` lets you listen for specific events happening as a process moves forward, but only once a certain condition is met. Think of it as setting a temporary listener that reacts to a single event matching your criteria. After that one event is processed by your callback function, the listener automatically disappears. This is handy when you need to react to something specific happening in a process and then don’t need to listen anymore.

You provide a filter – a rule to decide which events you're interested in – and then a function that will be executed when that rule is satisfied for the first time. The function returns a way to stop listening.


## Function listenWalkerComplete

This function lets you listen for when the backtest walker finishes running all its strategies. 

Think of it as a notification that the entire backtesting process is done. 

It ensures that the event handling happens one after another, even if your callback function needs to do some asynchronous work. This is really useful to avoid issues if multiple strategies are running at the same time. You provide a function that will be called when the walker completes, and this function returns another function that you can use to unsubscribe from these notifications later.

## Function listenWalker

The `listenWalker` function allows you to track the progress of a backtest as it runs. It lets you register a function that will be called after each strategy within the backtest completes. 

Importantly, this function handles events in order and prevents the callback from running concurrently, which is useful when your callback function performs asynchronous operations. This makes it a reliable way to monitor and react to the completion of each strategy in your backtest.

You provide a function (`fn`) that will be executed for each strategy, and `listenWalker` returns a function that can unsubscribe from these events when you no longer need them.


## Function listenValidation

This function lets you keep an eye on potential problems during risk validation – that is, when your trading strategies are being checked for errors. It essentially creates a listener that will alert you whenever a validation error occurs.

The listener provides a way to debug and monitor these validation failures.

Any errors that arise during the validation process will be delivered to your callback function one at a time, in the order they happen.  This approach ensures that even if your callback function takes some time to execute, the errors are handled sequentially to maintain order and prevent unexpected behavior.


## Function listenSyncOnce

This function lets you listen for specific synchronization events related to order updates, but it only runs your code once. It’s designed to help your system coordinate with other systems that might need to know about order changes. If your callback function involves asynchronous operations (like promises), the backtest-kit will pause order processing until those operations finish. 

You provide a filter function to select the events you're interested in, and then a callback function that gets executed once when a matching event occurs. 
A warning flag exists, but currently it’s not explained in detail.
The function returns a cleanup function that you can call to unsubscribe from the events.

## Function listenSync

This function lets you react to signals being synchronized – think of it as a notification when a trade is about to happen or is being finalized. It's particularly helpful if you need to communicate with other systems during the trading process, like updating an external database or triggering another action.  You provide a function that will be called whenever a synchronization event occurs, and this function can even handle asynchronous operations. If your function does involve async operations, the trading process will pause and wait for it to finish before proceeding, ensuring everything stays in sync. The `warned` parameter is there for internal use and you don’t need to worry about it.


## Function listenStrategyCommitOnce

This function lets you react to strategy changes, but only once. You provide a way to identify the specific strategy event you're interested in, and a function that will run exactly one time when that event occurs. After that single execution, the subscription is automatically removed, so you don't need to worry about cleaning up. It's handy for situations where you need to respond to a specific action just once.

Here's how it works:

You provide two pieces of information:

*   A filter: This helps you select the exact strategy events you want to monitor.
*   A callback: This is the code that will be executed once the filtered event happens.

Once the matching event is detected and the callback executed, the listener is automatically stopped.

## Function listenStrategyCommit

This function lets you keep an eye on changes happening to your trading strategies. It provides a way to react to events like signals being canceled, orders being closed, or stop-loss and take-profit levels being adjusted. Think of it as subscribing to updates about the ongoing management of your strategies.

The events are handled in the order they occur, and even if your reaction to an event involves asynchronous operations, it ensures that the events are processed one at a time, preventing conflicts. You simply provide a function that will be called whenever one of these strategy management events happens. This helps you build systems that respond reliably to changes in your trading strategies.

## Function listenSignalOnce

This function allows you to react to specific trading signals just once and then stop listening. You provide a filter – a condition that must be met for the signal to trigger your reaction – and a function to execute when that condition is met. Once the signal matches your filter, your function runs, and the listener automatically stops, preventing it from firing again. It's a clean way to respond to a single, specific occurrence of a signal within your trading strategy.

## Function listenSignalNotifyOnce

This function lets you react to specific signal events just once. You tell it what kind of event you're looking for with a filter – a function that checks if an event is interesting. When an event matches your filter, a provided callback function runs once, and then the subscription automatically stops. It’s a simple way to handle a single, important signal without managing subscriptions manually.


## Function listenSignalNotify

This function lets you listen for notifications about signals – specifically, when a strategy wants to share a note related to an active trade. 

Think of it as a way to be informed when a strategy is providing extra context about what it's doing.

The notifications are handled in a specific order, even if the processing of each notification takes some time, ensuring that everything happens sequentially. 

Essentially, it provides a reliable way to catch and react to these signal updates without worrying about interruptions or races. To stop listening, the function returns a cleanup function that you can call.


## Function listenSignalLiveOnce

This function allows you to temporarily listen for specific trading signals as they're happening during a live backtest run. You provide a filter—a condition that determines which signals you're interested in—and a function that gets executed once when a matching signal arrives. After that one execution, the listener automatically stops, so you don't have to worry about manually cleaning up subscriptions. Essentially, it’s a quick and easy way to react to a single, relevant signal during a live backtest.


## Function listenSignalLive

This function lets you tap into live trading signals generated during a backtest or live execution. You provide a function that will be called whenever a new signal event happens. 

Importantly, these signals are processed one at a time, ensuring that events are handled in the order they occur. 

Keep in mind that you'll only receive signals when `Live.run()` is actively running. The function returns an unsubscribe function that you can call to stop listening for these signals.


## Function listenSignalEventOnce

This function allows you to temporarily listen for specific trading signals. It's designed to react to a signal just once and then automatically stop listening. You provide a filter to define what kind of signal you're looking for, and a function to execute when that signal arrives. It's perfect for situations where you need to respond to a particular event, like a market opening or closing, and then you don’t need to keep monitoring. The function returns a function that can be called to unsubscribe from the event.


## Function listenSignalEvent

This function lets you tap into the lifecycle of your trading signals – specifically when a signal is first created or when it’s closed. It’s useful for tracking what's happening with your positions and responding to events like take profit, stop loss, or time expiration. The events are delivered in the order they occur, and the system ensures that each event is fully processed before the next one begins, even if your response involves asynchronous operations. You provide a function that gets called with details about each signal event. When you're done listening, the function returns another function that you can call to unsubscribe.

## Function listenSignalBacktestOnce

This function lets you listen for specific signals generated during a backtest run, but only once. You provide a filter—essentially a set of criteria—to determine which signals you're interested in. When a signal matching your filter appears during the backtest, a provided callback function will be executed with the details of that signal. After that single execution, the listener automatically stops, ensuring it doesn't continue to run unnecessarily. 

It's useful for tasks like:

*   Confirming a specific condition occurs during a backtest.
*   Verifying a particular signal is generated as expected.
*   Performing a single action based on a signal's information.


## Function listenSignalBacktest

This function lets you tap into the flow of a backtest and receive updates as it runs. Think of it as subscribing to a stream of events happening during the backtest process. You provide a function that will be called whenever a new event occurs, and the backtest will pass information about that event to your function.

Importantly, you’ll only get these events from backtests that have been started using `Backtest.run()`. The events are delivered one after another, ensuring they're processed in the order they were generated. This is helpful for monitoring progress or making adjustments based on real-time backtest data. To stop listening, the function returns another function that you can call.


## Function listenSignal

This function lets you hook into the trading signals generated by the backtest-kit. Whenever a new signal occurs – whether it's the start of a trade (idle), a trade being opened, a trade becoming active, or a trade closing – your provided function will be called.

Importantly, the signals are handled one at a time, even if your function takes some time to run (like if you're doing some calculations or making API calls).  This ensures signals are processed in the order they arrive, preventing potential issues from running multiple signals concurrently.

To use it, you just give it a function that will receive the details of each signal event. When you're done listening to signals, the function returns another function that you can call to unsubscribe.


## Function listenSchedulePingOnce

This function helps you react to specific ping events just once and then automatically stops listening. Think of it as setting up a temporary alert – you wait for a certain condition to be met, a function runs to handle it, and then the alert disappears. It's great when you need to respond to a single occurrence of a particular ping event without constantly monitoring. You define what kind of ping event you’re looking for and what action to take when it appears, and the function takes care of the rest, ensuring you don't get bothered again.


## Function listenSchedulePing

This function lets you keep an eye on what’s happening with your scheduled trading signals, even while they're waiting to become active. It sends out a little "ping" every minute while a signal is being monitored. 

You can use this to build your own custom checks or simply monitor the signal's lifecycle.

Essentially, you provide a function that gets called each time this ping occurs, and that function will receive information about the ping event. 

When you’re done listening, the function returns another function that you can call to unsubscribe.


## Function listenScheduleEventOnce

This function lets you set up a temporary listener for scheduled events – think of it as a one-time alert for a specific type of scheduled task. It allows you to specify a condition, using a filter function, to determine which events you’re interested in. Once an event matches your criteria, the provided function will be executed just once, and then the listener will automatically disappear. This is particularly helpful when you need to react to something happening only once, like a scheduled item being created or canceled.

You define what events trigger the alert using a filter function.

The function you provide will then handle the event.

Finally, the listener stops listening after the first event.


## Function listenScheduleEvent

This function lets you monitor the lifecycle of scheduled signals within your backtesting or live trading environment. You can subscribe to events indicating when a signal is initially scheduled or when it's cancelled before it becomes active. 

It's particularly useful for reacting to cancellations caused by things like timeouts or price rejections. Keep in mind that the moment a signal actually activates isn't reported here; that’s covered by the standard signal emission listeners. 

Events are handled in the order they occur, ensuring consistent processing even if your callback function performs asynchronous operations. Essentially, it provides a way to be notified about the beginnings and ends of signal scheduling processes.


## Function listenRiskOnce

`listenRiskOnce` lets you monitor risk rejection events and react to them, but only once. It’s like setting up a temporary alert – you specify a condition (`filterFn`) and a function (`fn`) to run when that condition is met. After the function executes once, the monitoring stops automatically. This is really helpful if you need to wait for a specific risk rejection to occur and then take action, but don’t want to keep listening indefinitely. 

The `filterFn` determines which events trigger the callback. 

The `fn` is the action you want to perform when the filtered risk event occurs. 

The function returns an unsubscribe function that you can call to stop listening before the one-time execution completes, if needed.

## Function listenRisk

This function lets you set up a listener to be notified whenever a trading signal is blocked because it fails a risk check. Think of it as an alert system for risky trades. It’s designed to only notify you when something goes wrong – you won’t get constant updates about trades that *are* allowed.

The events you receive are processed one after another, even if the code you provide for handling them takes a while to run. This ensures things happen in the right order and prevents unexpected issues from multiple notifications at once.

To use it, you provide a function that gets called whenever a risk rejection event occurs. When you are done listening to these risk rejection events, you can unsubscribe by calling the function returned by `listenRisk`.


## Function listenPerformance

This function lets you keep an eye on how long different parts of your trading strategy take to run. It’s designed to help you spot any slow areas that might be impacting your performance.  Essentially, it listens for events that report performance metrics – like how long an order took to execute.

These events are handled one at a time, ensuring things don't get messed up by trying to process them all at once. You provide a function that gets called whenever a performance metric is recorded, and this function handles the data. When you're done listening, you can unsubscribe from the performance events using the returned function.


## Function listenPartialProfitAvailableOnce

This function lets you set up a one-time alert based on your trading progress. It allows you to specify a condition—using `filterFn`—that must be met for the alert to trigger. Once that condition is met, the provided callback function (`fn`) will execute, and then the alert automatically stops listening. It's perfect for situations where you need to react to a specific profit target being reached just once.


## Function listenPartialProfitAvailable

This function lets you be notified whenever a trade hits certain profit levels, like 10%, 20%, or 30% gain. It guarantees that these notifications happen one at a time, even if the processing of one notification takes some time. You provide a function that will be called each time a profit level is reached, and this function receives details about the trade at that point.  The function you provide returns another function which you can call to unsubscribe from these notifications.


## Function listenPartialLossAvailableOnce

This function lets you set up a one-time alert for when a specific kind of partial loss event occurs. You provide a filter to define exactly what events you're looking for, and then a function to run when that event happens. Once the event is detected and the function runs, the subscription automatically stops, so you don't get further notifications. It's perfect for reacting to a particular loss scenario just once. 

Essentially, it’s a way to say, "Hey, tell me *only* when this specific loss situation arises, and then leave me alone."


## Function listenPartialLossAvailable

This function lets you keep track of how much your trading strategy has lost, in stages. It's like setting up alarms for loss milestones – 10%, 20%, 30%, and so on.

Whenever a loss level is hit, this function will call a function you provide.

Importantly, it handles these events in a specific order, and ensures the callback function runs one at a time, even if it takes time to complete. This makes sure your strategy reacts consistently to these loss signals. 

You provide a function as input that gets called with the details of the loss event each time a threshold is reached. The function you provide will return a function that unsubscribes the listener.

## Function listenMaxDrawdownOnce

This function allows you to monitor for specific maximum drawdown events and react to them just once. You provide a filter to define which drawdown events you're interested in, and a function to execute when a matching event occurs. Once that event is detected and handled, the monitoring automatically stops, making it perfect for situations where you need to respond to a particular drawdown condition and then move on. Essentially, it's a way to listen for a single, specific event and then forget about it.

## Function listenMaxDrawdown

This function lets you keep an eye on when your trading strategy hits new drawdown lows. Think of it as setting up a notification system that alerts you whenever a signal's maximum drawdown changes. It’s designed to handle these alerts one at a time, even if the notification process itself takes some time, ensuring that you don’t miss anything. You can use this to build systems that automatically adjust risk levels or trigger other actions when drawdown reaches certain points. The function returns a way to unsubscribe from these notifications when you no longer need them. 


## Function listenIdlePingOnce

This function lets you react to "idle ping" events, which signal periods of inactivity in your application. It’s designed to run a specific action *only once* when a matching idle ping occurs. You provide a filter to determine which idle ping events trigger your action, and then you define the function to execute when a matching event arrives.  The function returns an unsubscribe function, which you can call to stop listening for these events.

## Function listenIdlePing

The `listenIdlePing` function lets you monitor for periods of inactivity in your trading system. It allows you to register a callback function that will be executed whenever the system is idle – meaning no trades are currently being monitored or scheduled. This is useful for tasks like periodically checking connections or performing maintenance without interrupting active trading. The function returns an unsubscribe function, allowing you to easily stop listening for these idle ping events when they're no longer needed.


## Function listenHighestProfitOnce

This function lets you set up a listener that will only trigger once when a specific trading event occurs that meets your criteria. It’s helpful if you need to react to a particular profit milestone and then stop listening. You provide a filter – essentially a rule – that determines which events you're interested in. Once an event matches that rule, the provided callback function executes, and the listener automatically stops. This prevents it from triggering again.

## Function listenHighestProfit

This function allows you to monitor when a trading strategy achieves a new peak profit. It's like setting up an alert that fires every time your strategy reaches a higher profit level than before.

The events are delivered one at a time, ensuring that your code processing them doesn’t get overwhelmed even if the profit fluctuates rapidly.  The system handles the order of events and prevents multiple callbacks from running simultaneously.

You can use this to log milestones, adjust risk parameters based on profit levels, or implement other strategies that respond to profit growth.  To use it, you provide a function that will be called each time a new highest profit is recorded.


## Function listenExit

This function allows you to monitor for serious, unrecoverable errors that halt the execution of background processes like Live, Backtest, or Walker. It’s designed to catch problems that would otherwise crash your application. 

When a critical error occurs, a function you provide will be called, giving you a chance to log the error or take other corrective actions.

Importantly, the errors are handled in the order they happen, even if your error handling function takes some time to complete. The system ensures that these error events are processed one at a time, preventing conflicts and ensuring reliability.


## Function listenError

This function lets you set up a listener that will be notified whenever a recoverable error occurs during your trading strategy's execution. Think of it as a safety net – if something goes wrong, like a failed API request, the system won’t crash; instead, it'll let you handle it. 

The listener will receive the error object so you can log it, retry the operation, or take other corrective actions. Importantly, these error events are handled one at a time, ensuring that any actions you take in response to the error won't interfere with the ongoing strategy execution. This provides a stable and predictable way to manage unexpected issues. The function returns a cleanup function that you can use to unsubscribe from these events when they are no longer needed.


## Function listenDoneWalkerOnce

This function allows you to be notified when a background process within your trading strategy finishes, but only once. You provide a filter to specify which completed processes you’re interested in, and a callback function that will run when a matching process finishes. Once the callback executes, the subscription is automatically removed, so you won't receive further notifications. This is ideal for situations where you need to react to a specific completion event just one time.

It’s useful for things like triggering cleanup operations or logging details after a particular background task concludes.


## Function listenDoneWalker

This function lets you listen for when background tasks within a Walker finish running. Think of it as getting a notification when a process you started in the background finally completes.

It ensures that when a task finishes, the notification you receive is handled one at a time, even if your notification handling involves asynchronous operations. This avoids potential problems caused by multiple notifications happening simultaneously.

You provide a function that will be called whenever a background task is done, and this function will be executed in a safe, sequential manner. The function you provide will receive information about the completed task within the `DoneContract` object.


## Function listenDoneLiveOnce

This function allows you to react to when a background task initiated by `Live.background()` finishes, but only once. It's like setting up a temporary listener that responds to a specific type of completion event.

You provide a filter function to determine which completion events you're interested in, and then a callback function to execute when a matching event occurs.

Once the callback has been triggered once, the listener automatically removes itself, preventing further executions. This makes it perfect for situations where you need to perform a one-time action based on a background process completing.


## Function listenDoneLive

This function lets you be notified when background tasks initiated by the `Live` object finish running. Think of it as setting up a listener for when those "behind the scenes" operations are done. The events are delivered in the order they occurred, and the callback you provide will be executed one at a time, even if it involves asynchronous processes. This helps prevent unexpected conflicts or issues caused by running callbacks simultaneously. To stop listening, the function returns another function that you can call to unsubscribe.


## Function listenDoneBacktestOnce

This function lets you react to when a backtest finishes, but only once. You provide a condition – a test to see if the backtest event is the one you’re interested in. 

Then, you give it a function to run when that specific backtest completes. 

Importantly, once the function runs, it automatically stops listening, so you won't be notified about any other backtest completions. This is great for actions you only want to perform one time after a particular backtest is done.


## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. 

It’s like setting up a listener that waits for a specific backtest to complete. 

When the backtest is done, a special event will be sent to your callback function. 

Importantly, even if your callback function does something that takes time (like making an API request), the backtest kit will handle it carefully, processing events one after another to avoid any problems. 

You’ll get back a function that you can call to unsubscribe from these completion notifications whenever you no longer need them.

## Function listenCheckOnce

This function lets you temporarily "listen" for specific order check events and run a piece of code once when those events happen. Think of it as a one-time alert for particular situations.

If something goes wrong within your code, the system will consider the order to be closed until your code finishes running, which helps when coordinating with external systems. 

You provide a filter – a test – to decide which events should trigger your code.  Then, you give the code itself, which will execute just once when a matching event appears.  It's useful for things like verifying data or connecting to external services.


## Function listenCheck

The `listenCheck` function lets you monitor signals and react to them as they happen. It’s particularly handy when you need to coordinate with external systems or ensure things are processed in a specific order.

Think of it as setting up a listener for order-check events. Whenever a signal is active or scheduled (meaning a position is open or an order is waiting), you'll receive an event.

The function you provide (the `fn` parameter) will be called for each event. If your function returns a promise, the process will pause until that promise resolves. The `warned` parameter is available, but currently doesn't have a defined purpose.


## Function listenBreakevenAvailableOnce

This function lets you set up a listener that waits for a specific breakeven condition to occur. You define what that condition is using a filter – essentially, you tell it which events you're interested in. When that condition is met, the function will execute your provided callback function just once, and then automatically stop listening. This is great for situations where you need to react to a breakeven event only once and then move on. 

It takes two things: a filter to identify the events you want to track, and a function to run when a matching event happens. The function returns a cleanup function that you can use to manually unsubscribe from the listener if needed, although it's designed to unsubscribe automatically.

## Function listenBreakevenAvailable

This function lets you get notified when a trade's stop-loss automatically moves to the entry price, which signifies the trade has become breakeven. This typically happens when the trade has made enough profit to cover any fees and potential slippage. It ensures events are handled one at a time, even if your callback function needs to do some asynchronous processing. You provide a function that will be called whenever a breakeven event occurs, and this setup allows you to react to these events as they happen. The function returns an unsubscribe function that you can call to stop receiving these notifications.

## Function listenBeforeStartOnce

This function lets you react to specific events that happen right before a backtest begins. Think of it as setting up a one-time action that will only happen once when a certain condition is met before the trading simulation starts. You provide a filter to specify which events you’re interested in, and a function that will be executed only once when that event occurs. After that single execution, the subscription is automatically removed, so you don’t have to worry about cleaning up.

## Function listenBeforeStart

This function allows you to execute code right before a trading strategy begins for a specific asset. It's useful for tasks like logging, preparing data, or setting initial conditions. The function you provide will be called whenever a new strategy is about to start, and it ensures that these calls happen one after another, even if your code takes some time to complete. This prevents any unexpected interference from multiple actions happening simultaneously. Essentially, you're setting up a listener that gets triggered just before each trading strategy starts.

## Function listenBacktestProgress

This function lets you keep tabs on how a backtest is progressing. It's like setting up a listener that gets notified as the backtest runs. 

The listener receives updates about the backtest's status, and these updates are handled one at a time, even if the information needs some processing. 

Essentially, it provides a way to monitor and react to changes during the backtest process, ensuring the updates are handled in a controlled sequence. You provide a function that will be called with these progress updates. You can then unsubscribe from these updates when you no longer need them.

## Function listenAfterEndOnce

This function lets you react to specific events that happen after a trading operation completes, but only once. You provide a filter to specify which events you're interested in, and then a function to handle those events. Once the event matching your filter occurs, your function will run, and the subscription will be automatically removed, so you don't have to worry about cleaning up. It’s a convenient way to perform a single action based on a specific event without ongoing subscriptions.


## Function listenAfterEnd

This function lets you hook into what happens *after* a trading strategy finishes running for a particular asset. It provides a way to react to the completion of a strategy execution. The events are delivered one at a time, in the order they occurred, even if your reaction involves asynchronous operations. To ensure stability, the function uses a queuing mechanism, preventing multiple reactions from happening simultaneously. You essentially subscribe to these events and define what should happen afterward.


## Function listenActivePingOnce

This function lets you temporarily listen for specific active ping events and react to them just once. You provide a way to identify which events you're interested in, and a function to run when a matching event arrives. After that one execution, the function automatically stops listening, keeping your subscriptions clean and efficient. It's a great way to quickly respond to a particular ping condition and then move on.

The `filterFn` determines which events trigger the callback. The `fn` is the action you want to take when a matching event is detected.

## Function listenActivePing

This function lets you keep track of active trading signals. It listens for events that are sent out every minute, giving you a way to monitor the status of your signals and react to changes as they happen.

The events are handled one at a time, ensuring things run smoothly even if your callback function takes some time to process. It makes sure the callback function doesn't run concurrently, preventing any potential conflicts. 

You provide a function that will be called whenever a new active ping event occurs, allowing you to build custom logic around signal management.


## Function listWalkerSchema

This function helps you discover all the different ways your backtest-kit system is configured to handle data. It returns a list of schemas, each describing a specific 'walker' – a component that processes and transforms data during a backtest. Think of it as a way to see all the building blocks your system uses to analyze historical data. This is incredibly handy if you need to understand how your backtest is set up, create documentation, or build tools that adapt to different configurations.

## Function listStrategySchema

This function lets you see a complete overview of all the trading strategies you've set up within your backtest-kit environment. It essentially gathers information about each strategy, like its name and configuration details, and presents them in an easy-to-read list. Think of it as a way to quickly understand what strategies are available for use or to generate documentation for your system. It's especially handy when you’re troubleshooting or want to create a user interface that adapts to the strategies you’ve defined.


## Function listSizingSchema

This function provides a way to see all the sizing configurations you've set up within your backtest-kit trading environment. It essentially gives you a list of how your strategies will determine position sizes. Think of it as a way to inspect your sizing rules. You can use this to understand your strategy’s behavior, generate documentation, or even build tools that dynamically adjust sizing parameters. It fetches all the sizing schemas previously added using `addSizing()`.

## Function listRiskSchema

This function allows you to see all the risk schemas that are currently active within your backtest kit setup. Think of it as a way to list all the different risk profiles you've defined. It's particularly helpful when you're troubleshooting, generating documentation, or creating interfaces that need to display these risk configurations. The function returns a promise that resolves to an array containing details about each registered risk schema.

## Function listMemory

This function lets you retrieve a list of all the memory entries associated with your current signal. It's really useful for seeing what data has been stored and referenced. 

You provide a `bucketName` to specify which group of memory entries you're interested in. 

The function figures out whether you're in backtest mode or a live trading environment on its own, so you don't have to worry about that. It also automatically identifies the currently active signal for you, simplifying the process. 

The function returns a promise containing an array of objects, where each object represents a memory entry and includes its unique ID (`memoryId`) and the content itself (`content`). The `content` will be of the type you specified when calling the function (defaults to a generic object).


## Function listFrameSchema

This function helps you discover what types of data your backtest-kit environment is ready to handle. It gives you a list of all the "frame schemas" that have been registered, essentially outlining the different data structures you can work with in your trading simulations. Think of it as a way to see the blueprint for the data your backtest expects—ideal for understanding the system, troubleshooting, or building tools that need to know about these data structures. It provides a clear overview of all available data frames.

## Function listExchangeSchema

This function allows you to see a complete list of all the exchanges your backtest-kit framework is currently set up to use. 

It essentially gives you a snapshot of the exchanges you’ve added through the `addExchange()` function. 

Think of it as a handy tool for quickly checking your setup, building tools that adapt to different exchanges, or simply understanding what’s available for backtesting. The result will be an array containing details about each registered exchange.

## Function hasTradeContext

This function lets you quickly verify if the trading environment is fully ready for actions. It essentially confirms that both the execution and method contexts are established. If it returns true, it means you can safely use functions that interact with the exchange, like retrieving historical data, calculating prices, or formatting numbers. Think of it as a quick health check before running trading commands.


## Function hasNoScheduledSignal

This function helps you determine if a trading signal is currently scheduled for a specific asset, like "BTCUSDT." It returns `true` if no signal is waiting to be triggered, meaning it's safe to generate a new one. Think of it as a safety check – it prevents your system from trying to create signals when one is already in the pipeline. It intelligently adapts to whether you're running a test backtest or a live trading environment. You simply provide the trading pair's symbol as input.

## Function hasNoPendingSignal

This function, `hasNoPendingSignal`, checks if there's currently a signal waiting to be triggered for a specific trading pair, like 'BTCUSDT'. It returns `true` when no such signal exists. 

Think of it as the opposite of `hasPendingSignal`; it's helpful to use this to control when new trading signals are created – ensuring you don't generate signals when one is already pending.

The function smartly adapts to whether you're running a test backtest or a live trading environment without you needing to specify anything. You simply provide the symbol you’re interested in, and it does the rest.

## Function getWalkerSchema

The `getWalkerSchema` function helps you find the blueprint or definition for a specific trading walker. Think of a walker as a reusable piece of logic in your backtesting setup.  You give it a name, and this function will return the detailed structure – what inputs it expects, what outputs it produces, and how it's supposed to behave. This is useful when you need to understand the capabilities and requirements of a particular walker within your trading system. The function needs the walker's unique name to find the correct schema.


## Function getTotalPercentHeld

This function helps you understand how much of your initial trading position you still hold. It calculates the percentage, considering any partial closures you've made. A result of 100% means you haven't closed any part of your position yet, while 0% means the entire position has been closed. It's particularly useful if you've used DCA (Dollar-Cost Averaging) and closed your position in stages.

Essentially, it's the same as using `getTotalPercentClosed`, providing the same information about your position's status. You just need to give it the trading pair symbol as input.

## Function getTotalPercentClosed

This function tells you what percentage of your position in a specific trading pair is still open. It’s a way to see how much of your holdings remain, with 100% meaning everything is still held and 0% meaning it’s all been closed. The function takes into account any staggered entries you might have made through dollar-cost averaging, even if you’ve closed the position in portions. It figures out whether it's running in a backtest or live environment automatically. You just need to provide the trading pair symbol (like "BTCUSDT") to get the percentage.

## Function getTotalCostClosed

This function helps you determine the total cost basis, in dollars, of any open position you currently hold for a specific trading pair. It's really useful for understanding your cost average, especially if you’ve been gradually adding to a position through multiple transactions and partial closes. The framework cleverly figures out whether it's running a backtest or live trading session, so you don’t need to worry about that.

You simply provide the symbol of the trading pair you’re interested in, like "BTCUSDT", and it returns the total cost.


## Function getTimestamp

This function, `getTimestamp`, provides a way to retrieve the current timestamp within your trading strategy. It's handy for tracking time-based events or synchronizing actions.

The timestamp you get depends on whether you're running a backtest or live trading. During a backtest, it represents the timestamp of the specific historical timeframe being analyzed. When trading live, it returns the present, real-time timestamp.

## Function getSymbol

This function allows you to retrieve the symbol you're currently trading. It's a simple way to know which asset your backtest or trading strategy is focused on. The function returns a promise that resolves to a string representing the trading symbol. This is useful for displaying information to the user or dynamically adjusting your trading logic based on the current symbol.

## Function getStrategyStatus

This function allows you to peek at the current, internal state of a trading strategy during a backtest or live trade. It gives you a snapshot of things like queued actions, pending signals, and any deferred user actions. Think of it as a way to check what's currently "in the works" for a specific trading pair. It figures out whether it’s running a backtest or a live trade on its own, so you don’t need to worry about that. You just need to provide the symbol of the trading pair you’re interested in.


## Function getStrategySchema

This function helps you understand the structure of a trading strategy you're using within the backtest-kit framework. It fetches a detailed description, essentially a blueprint, of a specific strategy by its name. Think of it as looking up the recipe for a particular trading approach to see what inputs it needs and what kind of results it produces. You provide the strategy's unique identifier, and it returns a structured schema outlining all its components.

## Function getSizingSchema

This function helps you access pre-defined strategies for determining how much capital to allocate to each trade. Think of it as a lookup tool for different sizing approaches, like fixed percentage, Kelly criterion, or custom formulas. You provide a name that identifies the sizing method you want, and the function returns a detailed description of how that sizing strategy works. This lets you understand and potentially customize how your backtests manage risk. It’s a key part of setting up a realistic and well-controlled trading simulation.

## Function getSignalState

This function helps you retrieve a specific value associated with a trading signal. It's designed to work seamlessly within the backtest-kit framework, automatically figuring out whether you're in a testing or live trading environment.

The function looks for an active signal, either one that's pending or scheduled, and uses that to determine the data you're accessing. If no such signal is found, it will raise an error.

It's particularly useful for advanced strategies—like those using large language models—that need to track metrics on a per-trade basis, such as how long a trade stays open and the maximum profit it reaches. The documentation gives examples of specific trade rules based on these metrics.

You’ll provide the trading symbol and a configuration object (`dto`) that specifies where the state value is stored. This function simplifies accessing and managing data related to individual trading signals.


## Function getSessionData

This function lets you retrieve data that's stored specifically for a particular trading symbol, strategy, exchange, and timeframe combination. Think of it as a way to hold information that needs to last between candles, even if the program restarts. This is handy for things like caching results from complex calculations or keeping track of intermediate steps in your strategy, preventing you from having to recalculate them repeatedly. The function automatically handles whether you're in a backtesting or live trading environment. You just provide the symbol you're interested in, and it returns the associated data, or null if nothing is stored.


## Function getScheduledSignal

This function lets you check if a scheduled signal is currently active for a particular trading pair. It's designed to be simple to use - just provide the symbol of the asset you're trading (like 'BTCUSDT'). 

It fetches the current signal details, and if no signal is scheduled, it will return nothing. 

The system figures out if you're running a test or a live trading session automatically, so you don't have to specify that.


## Function getRuntimeInfo

This function provides insights into the current environment your trading strategy is running in. It tells you things like which asset you're trading, the exchange it's listed on, the timeframe being used (e.g., 1 minute, 1 day), and the specific strategy in action. Crucially, it also confirms whether you’re in a backtesting scenario or a live trading session. You can customize the type of data it returns depending on your needs.


## Function getRiskSchema

This function helps you find pre-defined structures for managing risk within your trading strategies. Think of it as looking up a template – you provide a name (the `riskName`) and it returns a detailed blueprint (the `IRiskSchema`) outlining how to assess and control that specific risk. This allows for consistent and standardized risk management across different backtests and strategies. Essentially, it's a handy tool to make sure you're evaluating risk in a uniform way.


## Function getRemainingCostBasis

This function helps you figure out how much money is still tied up in a trading position. It specifically tells you the remaining cost basis, which is the amount of the position that hasn't been sold off yet.  

It accounts for situations where you've bought into a position over time using dollar-cost averaging (DCA) and then closed parts of it. 

Essentially, it's a useful way to understand the initial investment that's still exposed to market risk for a particular trading symbol.  This function is another way of looking at the total cost of the position that has already been closed.

You just need to provide the trading symbol (like BTC/USD) to get the remaining cost basis.


## Function getRawCandles

The `getRawCandles` function is your go-to tool for retrieving historical candlestick data. 

You can specify exactly which candles you need by providing a symbol and a timeframe (like 1-minute, 5-minute, or hourly).

It's really flexible - you can limit the number of candles returned, or define a specific start and end date range. If you only provide an end date and a limit, it will automatically calculate the start date.

Crucially, the function is designed to avoid look-ahead bias, ensuring your backtests are accurate, and always uses the execution context's timeframe as a reference point. 

Here’s a breakdown of how you can use the parameters:

*   You can provide a start date, end date, and limit to get a precise set of candles.
*   Just providing start and end dates will automatically calculate a limit.
*   Providing an end date and a limit lets the function determine the start date.
*   A start date and a limit allow retrieval starting from that date.
*   If you just give a limit, the function will pull candles backward from the current timeframe.

## Function getPositionWaitingMinutes

This function tells you how long a trading signal has been waiting to be put into action. It specifically looks at a scheduled signal for a particular trading pair, like BTC-USDT.

If there isn't a scheduled signal waiting, the function will return null. 

You provide the symbol of the trading pair you're interested in to find out the wait time. The result will be in minutes.

## Function getPositionPnlPercent

This function helps you understand how your current trading strategy is performing. It calculates the unrealized profit or loss, expressed as a percentage, for a specific trading pair. 

The calculation is quite thorough, taking into account things like partial trade closures, dollar-cost averaging (DCA), potential slippage, and trading fees.

If there isn't a currently active trade or signal, it will return null.

Importantly, it adapts to whether you’re running a backtest or a live trade and it also fetches the current market price for accurate calculations. You don’t need to worry about manually setting these.


## Function getPositionPnlCost

This function helps you understand how much money you've potentially gained or lost on a trade that's still open. It calculates the unrealized profit and loss, expressed in dollars, based on the current market price.

Essentially, it figures out how much your investment would be worth if you sold it right now. 

The calculation considers factors like partial closes of positions, the cost of averaging into a position (DCA), and potential slippage and fees.

If there isn't an open trade, the function will return null.

You don't need to worry about fetching the current price or whether you're in backtest or live mode – the function handles that automatically.

You just need to provide the symbol of the trading pair (e.g., BTCUSDT).

## Function getPositionPartials

This function helps you understand how your trading strategy has been partially closing positions. It retrieves a list of all the partial profit and loss closures that have occurred for a specific trading symbol.

You'll see details like the type of closure (profit or loss), the percentage of the position that was closed, the price at which it was closed, the cost basis at the time of closure, and how many DCA entries were involved.

If there's no active trading signal or no partial closures have been made, it will return either null or an empty array respectively. You can use this information to analyze the performance of your partial closure strategy. The function requires you to specify the trading symbol you're interested in.

## Function getPositionPartialOverlap

This function helps you avoid accidentally closing partial positions twice at roughly the same price. It checks if the current market price is close enough to a previously executed partial close order, using a defined tolerance range. 

Essentially, it’s a safety check to prevent overlapping orders.

If you've already done a partial close at a certain price, this function determines if the current price is still within a reasonable range of that previous price, considering a percentage-based tolerance.

The function requires the trading symbol and current price to be checked and optionally, you can adjust the tolerance range for the comparison. It will return true if the current price falls within that tolerance zone of an existing partial close, and false otherwise.


## Function getPositionMaxDrawdownTimestamp

This function helps you find out when a specific trading position experienced its biggest loss. It looks at the historical data for a given trading pair and tells you the exact timestamp (date and time) when the price hit its lowest point for that position. 

Essentially, it's a way to understand the most challenging moments a position went through.

If there’s no active or pending trading signal associated with the position, the function won’t be able to provide a timestamp and will return null. 

You'll need to provide the symbol of the trading pair you're interested in, like "BTCUSDT".

## Function getPositionMaxDrawdownPrice

This function helps you understand the potential risk of a trading position. It calculates the maximum drawdown, which is essentially the lowest price your position experienced during its lifespan. 

Think of it as finding the biggest peak-to-valley difference in price movement while you held the position.

To use it, you simply provide the trading symbol (like BTCUSDT), and it will return a number representing that maximum drawdown. 

If there's no open position or signal associated with that symbol, the function will indicate that by returning null.


## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand the risk associated with a specific trading position. It calculates the maximum drawdown, expressed as a percentage of the profit and loss (PnL), that the position experienced from its beginning until the lowest point. Essentially, it tells you the largest peak-to-trough decline in the position's profitability.

To use it, you simply provide the trading pair symbol, such as 'BTC-USDT'. The function then returns a number representing this PnL percentage drawdown. 

If no trading signals exist for the given symbol, the function will return null.


## Function getPositionMaxDrawdownPnlCost

This function helps you understand the maximum drawdown experienced by a specific trading position. 

It calculates the profit and loss (PnL) in the quote currency at the exact time the position hit its lowest value. 

Essentially, it tells you how much money you would have lost at the worst point of that trade.

You provide the symbol of the trading pair (like "BTC/USD") to retrieve this drawdown PnL for that particular position.

If no active trading signals exist, the function will return null.

## Function getPositionMaxDrawdownMinutes

This function helps you understand the risk exposure of a trading position. It tells you how much time has passed since the position reached its lowest point, essentially measuring the duration of the maximum drawdown. The value will be zero if the trough was just reached, and increases as time passes. If no trading signal exists for the specified symbol, the function will return null, indicating that there's no position to analyze. You provide the symbol of the trading pair you want to check, such as 'BTC-USDT'.

## Function getPositionLevels

This function helps you see the prices at which you've been buying into a trade using dollar-cost averaging (DCA). 

It gives you a list of prices, starting with the initial price when the signal was first triggered. 

Any prices added later by averaging in more buys will also be included in this list. 

If there's no active signal or the initial buy was the only one, it will return either an empty list or just the initial price. You need to provide the trading pair symbol to get the data.


## Function getPositionInvestedCount

getPositionInvestedCount helps you track how many times you've added to a position using dollar-cost averaging (DCA).

It tells you the number of DCA entries made for the current pending signal; a value of 1 means it's the original purchase, and each subsequent call to commitAverageBuy() increases the count.

If there isn't a pending signal, it will return null.

The function automatically figures out if it's running in a backtest or a live trading environment.

You simply provide the symbol of the trading pair, such as BTCUSDT, to get the information.


## Function getPositionInvestedCost

This function helps you figure out how much money you've put into a particular trading position. It calculates the total cost basis, which is the sum of all the costs associated with buying into that position. 

Think of it as adding up all the individual purchase prices.

If there isn’t a pending trading signal, it will return null. It knows whether it's running a backtest or a live trading session, so you don't need to specify.

You just need to tell it which symbol, like 'BTCUSDT', to look at.


## Function getPositionHighestProfitTimestamp

This function helps you find out exactly when a specific trading position reached its peak profit. It looks at the entire history of that position and tells you the timestamp of the moment it made the most money. If there’s no data for that position yet, it will return nothing. You need to provide the trading pair symbol, like 'BTCUSDT', to tell the function which position to analyze.

## Function getPositionHighestProfitPrice

This function helps you understand the peak performance of an open trade. It identifies the highest price a long position reached after it was opened, or the lowest price a short position reached. 

Think of it as a record of how far in the money your trade has gone.

The function returns this highest profit price for a given trading pair. If no trade is currently active, it won't return a value. However, as soon as a trade is initiated, this value will always reflect at least the price at which you entered the trade.

## Function getPositionHighestProfitMinutes

This function helps you understand how long a trading position has been away from its best performance. It tells you the number of minutes that have passed since the price reached its highest point of profit for that particular trading pair. Think of it as a way to gauge how far a position has fallen from its peak.

If the position's price was at its highest exactly when you run the function, the result will be zero. If no trading signals are currently active, the function will return null.

You provide the trading pair's symbol, like "BTCUSDT," to specify which position you're interested in.


## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position is from its best performance. It calculates the difference between the highest profit percentage achieved and the current profit percentage, ensuring the result is never negative. Essentially, it shows you how much room there is for your trade to potentially improve. The function requires you to specify the trading pair's symbol to perform the calculation. If there's no trading signal currently active, it won't be able to give you a value.

## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your current trading position is from its best possible profit. It calculates the difference between the highest profit achieved so far and the current profit, but only considers the positive difference (meaning it doesn't count losses). Think of it as a measure of how much further you could potentially improve your position. 

The function takes the trading symbol (like "BTCUSDT") as input and returns a number representing that distance. 

If there's no open trading signal for that symbol, the function will return null, indicating it can't calculate the distance.


## Function getPositionHighestProfitBreakeven

This function helps determine if a trade could have reached a breakeven point after achieving its highest possible profit. 

It checks if, at the point where the trade made the most money, it was still mathematically possible for the price to move back to a breakeven level.

If there are no active trade signals for a specific trading pair, the function will return null.

You provide the trading pair's symbol (like "BTCUSDT") to the function, and it will tell you whether breakeven was a possibility during the trade's peak profit.


## Function getPositionHighestPnlPercentage

This function helps you understand how well a specific trade performed. It looks at a trading position – like buying and selling a particular asset – and finds the point where it made the most profit relative to its initial investment. 

Essentially, it tells you the highest percentage gain the position ever achieved during its lifetime.

If there's no trading data available for the specified asset, the function will return null.

You provide the asset’s symbol, like "BTC-USDT", to tell the function which position to analyze.


## Function getPositionHighestPnlCost

This function helps you understand the financial performance of a specific trading pair. It calculates and returns the highest profit and loss cost that occurred while a position was open. Essentially, it tells you the most expensive point, in terms of quote currency, the position ever reached in terms of profit and loss. If no trading signals are pending for that symbol, the function returns null, indicating that there’s no data to analyze. You provide the symbol of the trading pair (like BTC-USDT) as input, and it provides a number representing that maximum PnL cost.

## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand the potential risk of a specific trading position. It calculates how far the position's profit has come from its lowest point, expressed as a percentage. Essentially, it tells you the "distance" between where you are now (in terms of profit) and the lowest point the position has reached. If there's no active trading signal for that symbol, the function won't be able to provide a result.

The calculation involves finding the difference between the current profit percentage and the maximum percentage loss experienced. Any negative result is treated as zero, ensuring the output is always a positive or zero value.

To use it, simply provide the trading symbol (like "BTCUSDT") and the function will return the calculated drawdown percentage.


## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand the potential downside risk of a trading position. It calculates the difference between the current profit and loss (PnL) and the lowest point (trough) of the profit and loss during its history. Essentially, it tells you how far the position has fallen from its peak, expressed in PnL terms. If there’s no active signal for the given trading pair, the function won't return a value. You provide the symbol of the trading pair to get this information.

## Function getPositionEstimateMinutes

This function helps you find out how long a trading position is expected to last. 

It checks the current pending signal and tells you the estimated duration in minutes.

Think of it as looking at the signal's original plan for how long it should stay open, before the `time_expired` deadline.

If there’s no pending signal to examine, the function will return null.

You need to provide the trading symbol (like BTC-USDT) to use this function.

## Function getPositionEntryOverlap

The `getPositionEntryOverlap` function helps you avoid accidentally entering the same position at nearly the same price multiple times when using a dollar-cost averaging (DCA) strategy. It checks if the current market price is close to any of your previously established DCA entry levels. 

Essentially, it determines if the price you're considering entering at is already covered by a previous entry.

The function takes the trading symbol and the current price as input. You can also optionally provide configuration to define how close is too close. It returns `true` if the price is within a defined tolerance range of an existing level, and `false` if no pending signal exists. This helps streamline your trading and ensure efficient position building.


## Function getPositionEntries

This function lets you see the details of how a position was built up, especially if you've used dollar-cost averaging (DCA). It gives you a list of each purchase made to establish or add to a position. 

You’ll get information like the price at which each buy occurred and how much money was spent for that particular purchase.

If there's no ongoing trade or no DCA was used, the function will indicate that by returning either null or a single-element array. The `symbol` parameter tells the function which asset's position history you want to see.


## Function getPositionEffectivePrice

This function helps you determine the average price at which you've acquired a position, taking into account any dollar-cost averaging (DCA) strategies you’ve employed. It calculates this effective price by considering the total cost divided by the total quantity of assets purchased at different prices. 

If you’ve made partial exits from your position, it intelligently recalculates this average price by factoring in the cost basis at the time of each partial exit, and then adjusting it based on any additional DCA entries made afterward. 

If you haven’t used DCA, the function simply returns the original opening price. If there’s no active position, it will return null. The function dynamically adapts to whether the backtest is running in a simulation or a live trading environment.

You provide the symbol of the trading pair (like BTC/USDT) as input.


## Function getPositionDrawdownMinutes

This function helps you understand how far your current trading position is from its best performance.

It calculates the time, in minutes, that has passed since your position reached its highest profit point.

Think of it as a measure of how much "ground" your position has lost since its peak.

If the position is at its best, the number will be zero.

If there's no active trade open, the function will return null.

You just need to provide the symbol of the trading pair you're interested in to get this information.

## Function getPositionCountdownMinutes

This function helps you figure out how much time is left until a trading position expires. 

It calculates this by looking at when a position was flagged as pending and comparing that to an estimated expiration time. 

If the estimated time has already passed, the function returns zero, meaning the position is considered expired. 

If there's no pending signal for a particular trading pair, the function will indicate that by returning null. 

You provide the trading pair's symbol (like "BTC-USDT") to get the countdown.

## Function getPositionActiveMinutes

This function lets you find out how long a specific trading position has been open. It calculates the time in minutes since the position was initially created. 

If there isn't a pending signal related to that position, the function will return null, indicating that the position data isn’t available. To use it, you just need to provide the symbol of the trading pair you’re interested in, like "BTC/USDT".


## Function getPendingSignal

This function lets you check if a trading strategy currently has a pending signal waiting to be triggered. It retrieves the details of that signal, if one exists. 

If there's no pending signal, it simply tells you by returning nothing.

It cleverly figures out whether it's running a backtest or a live trade without you needing to specify.

You provide the symbol of the trading pair you're interested in, like 'BTCUSDT', to find the signal associated with it.


## Function getOrderBook

This function allows you to retrieve the order book for a specific trading pair, like BTCUSDT. 

It requests the order book data from the exchange you're connected to.

You can specify how many levels of the order book you want to receive – the default is a substantial depth.

The timing of the request is managed automatically based on the current execution context, which is important for both backtesting and live trading. The exchange itself handles how it uses the timing information.


## Function getNextCandles

This function helps you get a batch of historical candles for a specific trading pair and timeframe. Think of it as requesting the next set of candles following the latest data available.  You tell it which symbol you're interested in (like "BTCUSDT"), how granular the timeframes should be (options include "1m" for one-minute intervals, up to "8h" for eight-hour intervals), and how many candles you need. The function then pulls those candles from the exchange's data, providing the data needed for backtesting and analysis.

## Function getMode

This function tells you whether the trading framework is currently running a backtest (analyzing historical data) or operating in a live trading environment. It returns a promise that resolves to either "backtest" or "live," letting you adjust your code's behavior based on the context. Think of it as a simple way to check if you're practicing or actually trading.

## Function getMinutesSinceLatestSignalCreated

This function helps you figure out how much time has passed since the last trading signal was generated for a specific symbol. 

It essentially tells you the number of minutes that have gone by.

The function doesn't care whether the signal is still active or has already been completed; it just looks at the time of the most recent signal.

This is particularly handy if you need to implement a waiting period or cooldown after actions like a stop-loss order.

It looks for this signal information first in your historical backtest data and then in live data. If no signal is found, it will return null. The function cleverly figures out whether it's running in backtest or live mode based on where it's being used. 

You provide the trading symbol (like 'BTCUSDT') as input.

## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand the risk profile of a trading strategy. It calculates the maximum percentage difference between the highest profit achieved and the lowest point of loss during the backtest.

Essentially, it tells you the worst-case scenario regarding potential losses relative to peak gains.

The result is expressed as a percentage, and a null value indicates that there's no trading data available.

You provide the trading pair symbol, like "BTC-USDT", as input to retrieve this drawdown information.


## Function getMaxDrawdownDistancePnlCost

This function helps you understand the risk profile of a trading strategy by calculating the maximum drawdown distance based on profit and loss. Specifically, it figures out the difference between the highest profit achieved and the lowest loss experienced during a trading period. 

It essentially tells you the largest potential loss you could have faced from the peak of your profits.

The function requires you to specify the trading pair symbol to analyze. 

If there are no trading signals for a given symbol, the function will return null.


## Function getLatestSignal

This function helps you retrieve the most recent trading signal for a specific asset, like BTC/USDT. 

It doesn’t care whether the signal led to an open or closed trade—you'll get the latest one recorded. 

This is helpful for situations where you want to prevent actions like opening a new trade too quickly after a previous event, like a stop-loss trigger. 

The function prioritizes checking historical data first, and then live data if needed, and will return nothing if there are no signals available. It intelligently adapts to whether your test is a historical backtest or a live trading environment. You simply need to provide the trading pair symbol as input.

## Function getFrameSchema

The `getFrameSchema` function lets you look up the definition of a specific frame within your backtest kit. Think of a frame as a container for data used in your trading strategy – things like historical prices, volume, or indicators.  You provide the name of the frame you’re interested in, and the function returns the detailed structure (its schema) that describes what data it holds. This is useful when you need to understand the exact format of data being passed around in your backtest.


## Function getExchangeSchema

This function allows you to look up details about a specific cryptocurrency exchange that the backtest-kit framework supports. You provide the name of the exchange you're interested in, and it returns a structured description of that exchange, including information about its data format and available instruments. Think of it as a way to understand how the backtest-kit interprets data from different exchanges. The `exchangeName` is a unique identifier; make sure you know the correct name for the exchange you're querying.

## Function getDefaultConfig

This function provides you with a starting point for configuring your backtests. It returns a set of default values for various settings, covering areas like data fetching, signal generation, order management, and reporting. Think of it as a cheat sheet – it shows you all the knobs and dials you *can* adjust and what they're set to by default. Examining this default configuration is helpful if you're new to the framework or want to understand the impact of different settings.

## Function getDefaultColumns

This function provides a set of predefined column configurations used for creating markdown reports within the backtest-kit framework. Think of it as a template for structuring your data display – it defines the available columns and their initial settings.  It's helpful to examine the returned object to understand the possible column types and how they are set up by default. You can then use this information as a starting point when customizing your own report layouts.  The returned object is read-only, meaning you can’t directly modify it, only use it as a guide.

## Function getDate

This function, `getDate`, provides a simple way to retrieve the current date within your trading strategy or analysis. It's helpful for time-sensitive actions, like scheduling trades or calculating indicators that depend on the date. When running a backtest, it returns the date associated with the timeframe you're examining. When running live, it gives you the actual current date.

## Function getContext

This function provides access to the current method's context. Think of it as a way to peek inside and see details about what's happening during a particular step in your trading strategy. It returns an object containing relevant information about the method's execution, allowing you to tailor your logic based on the surrounding environment. Essentially, it helps you understand *where* and *how* your code is running within the backtest.

## Function getConfig

This function lets you peek at the framework's internal settings. Think of it as a way to see how the backtesting environment is set up.

It returns a snapshot of all the configuration values, covering things like retry counts for data fetching, limits on the number of signals and notifications, and whether certain features like dollar-cost averaging or parallel processing are enabled. 

Importantly, it provides a copy of the configuration; any changes you make to the returned object won't affect the actual running settings of the backtest-kit. It’s purely for observation and understanding the framework's behavior.

## Function getColumns

This function provides a snapshot of the available columns used for creating reports within the backtest-kit framework. It gathers configurations for various data types like closed trades, heatmaps, live ticks, partial fills, breakeven events, performance metrics, risk assessments, scheduled tasks, strategy events, synchronization status, highest profit markers, maximum drawdown points, walker profit and loss, and overall strategy results. 

Think of it as a way to see exactly what data columns are available for customizing your reports. The returned configuration is a copy, so any changes you make won’t affect the original settings within the backtest-kit. It’s perfect for examining the available columns or creating a local representation for analysis.

## Function getClosePrice

This function lets you retrieve the closing price from the most recent candle for a specific trading pair and time interval. You provide the symbol, like "BTCUSDT" for Bitcoin against USDT, and the timeframe you're interested in, such as "1h" for a one-hour candle. It returns a promise that resolves to the closing price as a number, giving you a snapshot of recent price action. Essentially, it's a quick way to get the last known closing price for a particular asset on a specific timeframe.


## Function getCandles

This function allows you to retrieve historical price data, specifically candles, for a given trading pair. You provide the symbol of the pair you're interested in, like "BTCUSDT," the time interval for the candles (e.g., 1 minute, 4 hours), and how many candles you want to receive. The function then pulls this data from the connected exchange. Think of it as requesting a slice of the trading history to analyze past performance or build trading strategies. The data returned includes open, high, low, close prices, and the timestamp for each candle.

## Function getBreakeven

This function helps determine if a trade has reached a point where it's made a profit large enough to cover the costs associated with the transaction. It looks at the symbol being traded and the current market price to see if the price has moved sufficiently in a profitable direction to account for slippage and trading fees. The function intelligently adapts to whether it's running in a backtesting environment or a live trading scenario, simplifying the process of assessing trade profitability. 

You provide the symbol and the current price, and it tells you whether the breakeven point has been surpassed.


## Function getBacktestTimeframe

This function helps you find out the dates used for a backtest for a specific trading pair, like BTCUSDT. It returns a list of dates representing the timeframe the backtest covers. You provide the symbol of the trading pair you're interested in, and it gives you back the date range used in the backtest. This lets you know exactly what period of time your backtest is analyzing.


## Function getAveragePrice

This function helps you determine the Volume Weighted Average Price, or VWAP, for a specific trading symbol like BTCUSDT. 

It looks at the five most recent one-minute candles to calculate this average. 

The VWAP is based on a formula that considers both the price and the volume traded.

If there's no trading volume for a particular symbol, it will instead give you the simple average of the closing prices.

You just need to provide the symbol you're interested in to get the VWAP.

## Function getAggregatedTrades

This function lets you retrieve a list of aggregated trades for a specific trading pair, like BTCUSDT. It pulls this data from the exchange you're connected to.

You can request all trades within a certain timeframe, or specify a maximum number of trades you want to receive. If you don't provide a limit, it will gather trades from the last hour. If you do, it will fetch trades backward until it has enough to meet that limit.


## Function getActionSchema

This function helps you find the blueprint, or schema, for a specific action within the backtest-kit framework. Think of it as looking up the rules and expected data for a particular trading action. You provide the name of the action you're interested in, and it returns a detailed description of what that action involves – what inputs it needs and what it does. This is useful for understanding how actions are structured and validated.

## Function formatQuantity

This function helps you display quantity values correctly for different trading pairs. It takes a symbol like "BTCUSDT" and a numerical quantity as input. 

Then, it automatically formats the quantity to match the specific rules of the exchange you're using, ensuring the correct number of decimal places are shown. This is useful for presenting quantities in a user-friendly and accurate way.


## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a symbol like "BTCUSDT" and a raw price number and formats it according to the rules of the specific exchange. This ensures that the displayed price has the right number of decimal places, which is important for clarity and accuracy when viewing trading data. Essentially, it takes care of the formatting details so you don't have to.


## Function dumpText

The `dumpText` function lets you save raw text data, like logs or detailed analysis, associated with a specific trading signal. Think of it as a way to record events during a backtest or live trade.

It automatically figures out whether you're running a backtest or a live trading session, based on where the function is called. 

You provide a data object containing the bucket name, a unique identifier for the dump, the actual text content, and a description explaining what the text represents.  The function handles resolving the active trading signal so you don't have to. This makes it a convenient way to preserve detailed information about your trading activity.

## Function dumpTable

This function helps you display data as a neat table, especially useful for examining results during a backtest or live trading session. It takes an array of objects, each representing a row in your table, and presents them in a structured way. The function cleverly figures out the appropriate signal to associate with this table, whether it’s a pending or scheduled one, without you needing to explicitly specify it. It also adapts to whether you’re running a backtest or a live simulation. The column headers are automatically determined based on all the keys found in your data, simplifying the process of presenting complex information.


## Function dumpRecord

The `dumpRecord` function lets you save a piece of data – think of it as a single record – with a label and some details into a system for later review or analysis. This function is designed to be flexible; the data you’re saving can have various types of information organized as key-value pairs. It intelligently figures out whether you're running a test or a live trading scenario, and it also automatically determines which signal is currently active. This makes it easy to associate the record with the correct signal without manual configuration. The system also assigns a unique identifier to this record.

## Function dumpJson

The `dumpJson` function lets you save complex data structures, like configuration settings or detailed trading results, as formatted JSON within the backtest-kit system. Think of it as a way to permanently record snapshots of your data. This function intelligently handles the context of your backtest, whether you're running simulations or live trading, and automatically resolves signal dependencies.  You provide the data as a JavaScript object, along with a bucket name, a unique identifier (dumpId), a descriptive label, and the JSON data itself, and it’s stored in a way that’s linked to the specific signal being executed. This makes it easy to track and analyze data related to particular trades or events.


## Function dumpError

The `dumpError` function helps you report errors within your trading strategies, associating them with specific data buckets and dump identifiers. Think of it as a way to add context to errors, making them easier to track and debug later. It handles the details of knowing whether you're in a backtest or live trading environment and automatically resolves the relevant signal, so you don’t have to worry about those specifics in your code. You provide a description of the error, along with identifiers that link it to particular data or processes within your system.


## Function dumpAgentAnswer

This function helps you save a complete record of a conversation with the agent, including all the messages exchanged. 

It's designed to be easy to use, as it automatically figures out which signal the conversation is related to and whether you're in a testing or live environment. 

You provide the function with details about the conversation, like the bucket name, a unique identifier for the dump, the actual messages, and a brief description. The function then handles the rest, making it simple to keep a detailed log of your agent interactions.


## Function createSignalState

The `createSignalState` function helps you manage and track the state of your trading signals, especially when dealing with complex strategies like those driven by AI. It provides a pair of functions, `getState` and `setState`, that are automatically linked to the current trading environment, whether it's a backtest or a live trade. This removes the need to manually specify signal IDs.

It's particularly useful for strategies that gather information over time, like calculating metrics based on trade duration and profit. Think of it as a way to keep track of how each signal is performing during a sequence of trades, making it easier to analyze and refine your approach. It’s designed to be effective with strategies which aim to balance risk and reward, adapting to different market conditions.

## Function commitTrailingTakeCost

This function lets you update the take-profit price for a trade to a specific price. 

It's designed to simplify changing your take-profit, calculating the correct percentage shift based on the initial take-profit distance.

The system handles the details of determining whether you're in a backtest or live trading environment, and it also automatically gets the current market price to ensure accuracy.

You just need to provide the symbol (like BTCUSDT) and the new take-profit price you want. 

The function will return a boolean indicating whether the change was successful.


## Function commitTrailingTake

This function helps you fine-tune your take-profit levels for pending orders, specifically using a trailing approach. It lets you adjust the distance of your take-profit order relative to where it was originally set. 

It’s important to understand that this function always calculates adjustments based on the original take-profit level you initially defined, avoiding errors that can build up with repeated adjustments. 

If you provide a smaller shift percentage, it will be prioritized and the take-profit will move towards a more conservative position (closer to your entry price). 

For long positions, the take-profit can only move closer to the entry price, while short positions can only move further away, ensuring that the most conservative adjustment takes effect. 

The function figures out whether it’s running in a backtesting or live trading environment automatically.


## Function commitTrailingStopCost

This function lets you change the trailing stop-loss price to a specific value. 

It simplifies setting a new stop-loss by calculating the necessary percentage shift based on the initial stop-loss distance.

The function automatically handles whether it's running in a backtest or live trading environment and also retrieves the current price to ensure accuracy. 

You provide the trading symbol and the desired new stop-loss price, and it takes care of the rest.


## Function commitTrailingStop

This function lets you fine-tune the trailing stop-loss for a trade that already has a pending stop-loss order. It's important to understand that it works based on the *original* stop-loss distance set when the trade was initially entered, not any adjustments made later. 

Think of it like this: it's constantly recalculating the stop-loss position relative to that initial point.  If you're shifting the stop-loss, percentage adjustments are absorbed - the better protection always wins. 

A negative shift brings the stop-loss closer to the entry price, while a positive shift moves it further away.  For long positions, the stop-loss can only move higher, and for short positions, only lower. 

The function also automatically figures out whether it's running in backtesting or live trading mode. You provide the trading symbol, the percentage shift you want to apply to the original stop-loss, and the current price of the asset.

## Function commitSignalNotify

This function lets you send out informational messages related to your trading strategy. Think of it as a way to leave notes about what your strategy is doing, like "RSI crossed a threshold" or "Detected a volume spike." These notes don't change your positions, they’re just for providing extra context and potentially triggering external alerts. It automatically knows which strategy and exchange it's working with, and gets the current price to include in the notification. You just need to specify the symbol (like BTCUSDT) and can add extra details through the payload.

## Function commitPartialProfitCost

This function helps you partially close your trading positions when you're already in profit. It lets you specify how much of your position to close based on a dollar amount – for example, closing $150 worth of your position.

It simplifies the process by automatically calculating the percentage of your position to close based on your initial investment.

The function is designed to work in both backtesting and live trading environments and it automatically gets the current price to make the calculation. You need to ensure the price is moving in a profitable direction for this function to work as intended.


## Function commitPartialProfit

This function lets you automatically close a portion of an open trade when the price is moving in a profitable direction, essentially helping you secure some gains along the way. It's designed to close a specified percentage of your position – you tell it how much, like 25%, 50%, or even 75%. The function handles whether it’s running a test or a live trade for you, so you don’t have to worry about that. You'll need to provide the symbol of the trading pair and the percentage you want to close.


## Function commitPartialLossCost

This function helps you close a portion of your trading position when you're experiencing losses, specifically aiming to move toward your stop-loss level. It simplifies the process by letting you specify the dollar amount you want to close, and the system automatically calculates the corresponding percentage of your position. 

The function handles whether you're in a backtesting or live trading environment and will automatically get the current price to ensure the close order is placed in the correct direction, toward your stop loss. To use it, you simply provide the trading symbol and the dollar amount you want to close.

## Function commitPartialLoss

This function lets you partially close an open position when the price is moving in a way that triggers your stop-loss. It's designed to automatically adjust based on whether you’re running a backtest or a live trade. You specify the symbol of the trading pair and the percentage of the position you want to close – for example, closing 25% of your open position. The system ensures that the price movement aligns with the direction of your stop-loss before executing this partial closure.


## Function commitCreateTakeProfit

This function lets you tell the backtest kit that a take-profit order for a position has been filled on the exchange, even if it bypassed the usual VWAP-based checks. Think of it as informing the system about a real-world event that happened independently of the backtest's calculations. It's used to ensure that the backtest accurately reflects what happened in a live trading environment, where orders can sometimes fill at unexpected price levels.

The framework generally calculates take profit based on VWAP, but the actual order might execute differently. This function bridges that gap and reports the actual close.

If there’s no open position to close, this function won't do anything.

You can optionally include extra information, like an order ID or a note, to help track the event. It intelligently figures out whether it’s running in a backtest or live environment.

## Function commitCreateStopLoss

This function lets you tell the system that a stop-loss order you’ve been waiting for has actually been executed on the exchange. It's used when the exchange fills the stop-loss order at a price different from what the backtest framework might have calculated initially.

Think of it as confirming a real-world event that deviates from the simulated behavior.

The function automatically figures out whether it's running a backtest or a live trade.

You provide the symbol of the trading pair and optionally, some extra information like an ID and a note, which can be helpful for record-keeping. If no pending signal exists, the function does nothing. The system will then record that the trade was closed due to a stop-loss.

## Function commitCreateSignal

This function lets you manually inject signals into the backtest or live trading environment, bypassing the usual signal retrieval process. Think of it as a way to feed custom signals directly into the system.

You provide a trading symbol and a signal data object (DTO) containing the details of your signal. The signal will be executed based on the presence of a `priceOpen` value: if absent, the signal executes immediately at the current price; if present, it either executes immediately if the price is already reached or is scheduled to execute when the target price is hit.

It’s important to note that the system checks if another signal or action is already being processed, and it won't accept new signals under those conditions. It automatically figures out whether it's running a backtest or a live trading session.

The provided signal data is also validated to ensure it's in the correct format.


## Function commitClosePending

This function allows you to finalize and remove a pending order from your trading strategy without interrupting its normal operation. Think of it as confirming that a previously placed order to buy or sell is now executed. It's useful when you want to acknowledge that a pending signal has been fulfilled without halting the overall strategy or stopping it from generating new trading signals.  You can optionally provide details like an ID and a note to document the closure of the pending order. The function intelligently adapts to whether it's running in a backtesting environment or a live trading scenario.

## Function commitCancelScheduled

This function lets you cancel a scheduled trading signal without interrupting the overall strategy execution. It effectively clears a signal that was waiting for a specific price to trigger, but it won’t affect any signals that are already active or stop the strategy from generating new ones. The function figures out whether it's running in a backtest or live environment automatically. You can optionally include extra information like an ID or note when canceling the signal.

## Function commitBreakeven

This function helps manage your trading risk by automatically adjusting your stop-loss order. 

Specifically, it moves your stop-loss to the price you originally bought in at, essentially eliminating risk, once the price has moved favorably enough to cover the costs associated with the trade, like slippage and fees. 

It works automatically depending on whether you're in a backtesting or live trading environment, and it retrieves the current price to make this adjustment. You just need to specify the trading pair symbol.

## Function commitAverageBuy

The `commitAverageBuy` function helps you build dollar-cost averaging (DCA) strategies. It allows you to add a new buy order to your position's history, essentially recording a purchase at the current market price. 

This function automatically calculates and updates the average purchase price for your position, reflecting the impact of this new buy. 

It also signals that a buy has occurred, which can be useful for tracking and analyzing your trading activity.  You just need to specify the trading pair symbol, and it handles the details of getting the current price and updating the position's data. A cost parameter is also supported.


## Function commitActivateScheduled

This function lets you manually trigger a previously scheduled signal before the target price is reached. Essentially, it prepares the signal to be activated on the next price update. It’s useful when you want to execute a trade based on a signal ahead of time. 

You specify the trading symbol, and optionally, you can add a commit payload to include a unique ID and a note for tracking purposes. The framework automatically handles whether it's running a backtest or a live trading session.

## Function checkCandles

The `checkCandles` function helps verify that the necessary historical price data, or "candles," are already saved. It efficiently checks if your trading strategy has all the data it needs without loading everything at once.  It uses a special feature of the data storage system to quickly confirm if each expected price point exists.  If even one price point is missing or out of sync, the function will detect that, allowing the system to retrieve only the missing data.

The `params` argument contains the specific details about which candles to check.


## Function cacheCandles

The `cacheCandles` function helps make sure your historical price data is readily available for backtesting. It fetches candles (OHLCV data) for a specific trading symbol, timeframe, and date range. 

It works in two phases: first, it verifies if the data already exists; if not, it downloads the missing data and then re-checks to ensure its validity. This two-step process with a retry ensures your backtesting environment has the complete historical data it needs. You can provide callbacks for tracking progress during the initial check and the warm-up (data download) phase.


## Function addWalkerSchema

This function lets you register a "walker" within the backtest-kit framework. Think of a walker as a system that runs multiple strategy tests against the same historical data. It then analyzes and compares the results based on how well they performed – for example, comparing profitability or drawdown. You provide a configuration object, defining how the walker should operate and what metrics to use for the comparison.

## Function addStrategySchema

This function lets you tell the backtest-kit about a new trading strategy you've created. It's how you register your strategy so the framework knows how it works and can apply its built-in checks.

When you register a strategy, it's checked to ensure signals are valid – things like correct prices, sensible take profit/stop loss settings, and properly timed signals.

The framework also helps manage how often your strategy sends signals, preventing a flood of trades, and ensures the strategy’s state can be reliably saved even if there are interruptions during live trading.

You provide a configuration object, called `strategySchema`, which describes your strategy's specific rules and parameters.

## Function addSizingSchema

This function lets you tell the backtest-kit system about how you want to determine your position sizes. It’s how you define the rules for how much of your capital to allocate to each trade. You provide a sizing schema, which includes details like the method you’re using (like fixed percentage, Kelly criterion, or ATR-based sizing), the risk parameters involved, limits on position size, and even a way to respond to calculations as they happen. Essentially, it’s a key piece for making sure your trading strategy adheres to your desired risk management principles.

## Function addRiskSchema

This function lets you define how your trading system manages risk. Think of it as setting up the guardrails for your strategies. You can specify limits on how many positions can be open at once and even add custom checks to ensure your portfolio remains healthy and balanced. Because these risk rules are shared across different strategies, you get a broader view of your overall risk exposure. The system keeps track of everything that's currently trading and provides information to help you enforce those risk controls. 

Essentially, it's how you tell the backtest kit to keep your trading under control.

The `riskSchema` argument contains all the details of your risk configuration.


## Function addFrameSchema

This function lets you tell the backtest-kit about a new timeframe generator you want to use. Think of it as registering a custom way to create the periods of time your backtest will analyze.

You provide a configuration object that details the start and end dates for your backtest, the interval (like daily, weekly, or monthly) you want to use for generating timeframes, and a function that will be called to handle any events related to the timeframe generation. This is how you tailor the backtest to use specific time periods for your analysis.


## Function addExchangeSchema

This function lets you tell the backtest-kit framework about a new exchange you want to use for your backtesting. Think of it as registering a data source, so the framework knows where to get historical price data and how to interpret it. You provide a configuration object that defines how to access the exchange’s data – including fetching historical candles – and how to format price and quantity information.  It also handles calculating VWAP (Volume Weighted Average Price) based on recent trade data.



The `exchangeSchema` object holds all the details about the exchange you're adding, allowing the backtest-kit to work with its data effectively.

## Function addActionSchema

This function lets you register custom actions within the backtest kit. Actions are a powerful way to connect your trading strategy to external systems – think sending notifications to Telegram, logging events, updating a Redux store, or triggering custom logic based on strategy events. When you register an action, it gets linked to a specific strategy and timeframe combination, and it's then ready to receive and respond to the various events that occur during the backtest (like signals generated, or profit targets hit). Essentially, it's your bridge between the backtest simulation and the rest of your tools and processes. You provide an action schema to define how this action should behave.
