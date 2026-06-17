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

This function lets you store data in a specific memory location, like writing to a labeled container. Think of it as saving a piece of information for later use within your trading strategy. It automatically figures out if you're running a test or a live trading session. 

You’ll provide a name for the container (bucketName), a unique identifier for the memory location (memoryId), the data you want to save (value), and a brief description of what's being stored. The data you store can be any type of object. 

This function handles the underlying details of managing signals, so you don’t have to worry about that. It's a convenient way to persist data within your strategy’s execution environment.


## Function warmCandles

This function helps speed up backtesting by pre-loading historical candle data and storing it for quick access. It essentially downloads all the candles for a specific timeframe, from a starting date to an ending date, and saves them so they don't need to be re-downloaded during a backtest. This can significantly reduce the overall backtesting time.

You provide a set of parameters that define the starting and ending dates, as well as the candle interval you want to download and cache. This lets you focus on your trading strategies without the delay of constantly fetching the same data.


## Function waitForReady

This function ensures that all necessary components are initialized before you begin trading, whether it's a backtest or a live trading session. It waits for the registries responsible for validating exchanges, trading strategies, and historical data frames to be fully populated. 

During backtesting, it makes sure everything – exchanges, strategies, and historical data – is set up. For live trading, it only confirms that the exchange and strategy registries are ready, as historical data isn't needed.

It checks these registries every second, waiting for a maximum of a certain time. If everything isn't ready within that time, the function finishes without an error, and it's your responsibility to handle any resulting issues (like missing strategy configurations) later on. You can use this to prevent trading from starting before everything is properly loaded. 

The `isBacktest` parameter lets you specify whether a frame schema is also needed, which is only relevant for backtesting scenarios.

## Function validate

This function helps ensure everything is set up correctly before you run a backtest or optimization. It checks that all the entities you’re using – like exchanges, strategies, and sizing methods – actually exist in the system.

You can tell it to validate specific entity types, or if you leave it blank, it will check everything.

Think of it as a safety net to prevent errors caused by missing or misconfigured entities, and the results are saved to make it faster next time. It's a good idea to run this validation before kicking off any tests.

## Function stopStrategy

This function lets you pause a trading strategy's signal generation. 

It effectively halts the strategy from creating any new trades. 

Any existing, open trades will still finish up as usual.

The system gracefully stops the backtest or live trading session at a suitable point, like when it's idle or a trade is closed.

You simply provide the trading pair symbol (like BTC-USDT) to specify which strategy you're pausing.


## Function shutdown

This function provides a way to safely end a backtest run. It signals to all parts of the testing framework that it's time to wrap up and clean up any resources. Think of it as a polite exit – it lets everything know to prepare for the program to finish without any hiccups, especially when the testing is being stopped unexpectedly. This is useful for handling things like signals that tell the program to stop.

## Function setSignalState

This function helps you manage and update information related to a specific trading signal. It's particularly useful when you're building strategies that track metrics over time, like how long a trade is open or its maximum gain.

It works by updating a piece of data associated with the currently active signal.  Think of it like saving a specific detail about a trade.

The function handles the details of knowing whether you're in a backtesting environment or a live trading situation. 

If there's no active signal, it will let you know with a warning. This function aims to support advanced strategies that collect information across multiple trades to optimize outcomes, targeting specific drawdown and profit goals.


## Function setSessionData

The `setSessionData` function lets you store information that lasts between candles during a backtest or live trading run. Think of it as a way to keep track of things like intermediate calculations or LLM inference results that you need to remember even if your process restarts. You specify which trading pair (symbol) the data belongs to, and then provide the value you want to store, or pass `null` to remove the data. It automatically knows whether it's running in a backtest or live environment.

## Function setLogger

You can now control where and how the backtest-kit framework's internal logging appears. This function lets you plug in your own logging system, like sending logs to a file, a database, or a specialized monitoring tool. The framework will automatically add helpful details to each log message, such as the trading strategy being used, the exchange involved, and the specific asset being traded – making it easier to track down issues and understand what's happening during backtesting. Just provide an object that implements the `ILogger` interface, and the framework will handle the rest.

## Function setConfig

This function lets you adjust how the backtest-kit framework operates by changing its global settings. Think of it as tweaking the underlying machinery. You can provide a new set of configuration values – not all at once, just the ones you want to change – and this function will update the framework accordingly. There's a special `_unsafe` flag; only use this if you're running tests and need to bypass some safety checks – it's generally best to avoid it otherwise.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, like when you generate markdown reports. Think of it as tweaking what information you see in those reports – you can change the order, names, or even which data points are displayed. You provide a set of new column definitions, and the framework will apply them to your reports.  It's designed to be flexible, allowing you to override the default settings.

For most use cases, the framework checks your new column definitions to make sure they're valid. However, in some specialized testing scenarios, you might need to bypass this validation—there's an option to do so, but use it with caution.

## Function searchMemory

The `searchMemory` function helps you find relevant data stored in your memory system based on a search query. It uses a powerful technique called BM25 to rank the results, ensuring the most pertinent entries are returned first. 

The function intelligently figures out which signal to search for and whether you're running a backtest or a live trading environment, so you don’t have to specify those details.

You provide a bucket name (where the data is stored) and your search query, and it returns an array of results. Each result includes a unique ID, a score indicating how well it matches the query, and the actual data content itself.


## Function runInMockContext

This function lets you run code as if it were part of a backtest or live trading environment, but without actually running a full backtest. It's designed for testing and development.

Think of it as creating a temporary, simplified version of your trading system.

You can customize the settings to mimic different scenarios – exchange, strategy, timeframe, even whether it’s a backtest or a live environment. If you don’t provide any settings, it defaults to a basic live-mode setup. 

The `run` parameter takes a function that you want to execute inside this mock environment, allowing you to safely test context-dependent code.


## Function removeMemory

This function lets you delete a specific memory entry associated with a signal. Think of it as cleaning up old data related to a particular trading signal. It handles the complexities of knowing whether you're in a testing environment or a live trading scenario, taking care of resolving any pending signals automatically.

Here's what you need to provide:

*   `bucketName`: The name of the bucket where the memory is stored.
*   `memoryId`: The unique identifier of the memory entry you want to remove.

Essentially, it provides a straightforward way to remove unwanted memory associated with a signal, simplifying memory management within the backtest-kit framework.


## Function readMemory

The `readMemory` function lets you retrieve stored data from a memory location, associating that data with the current trading signal. It handles figuring out whether you're in a backtesting environment or live trading, and knows which signal it's currently working with, so you don't have to worry about those details. To use it, you provide the name of the memory "bucket" and a unique identifier for the specific memory item you want to read.  The function will return the data as an object of a defined type.

## Function overrideWalkerSchema

This function lets you tweak a trading strategy's walker configuration—think of it as adjusting how the strategy explores different scenarios for comparison. It doesn’t replace the whole walker setup; instead, you provide only the changes you want to make, and the rest of the existing configuration stays put. This is really handy when you want to test a specific change to a strategy's walker without having to redefine everything from scratch. You supply a partial walker configuration, and the function returns the updated, complete walker schema.

## Function overrideStrategySchema

This function lets you modify a strategy's configuration after it's already been set up. Think of it as tweaking a strategy’s settings without completely replacing it. 

You provide a new set of configuration details – just the parts you want to change – and the function updates the existing strategy, leaving everything else untouched. 

It's useful for making adjustments to strategies during development or for applying conditional configurations. 

The `strategySchema` argument accepts only a partial configuration object.


## Function overrideSizingSchema

This function lets you tweak an existing position sizing strategy without completely replacing it. Think of it as fine-tuning—you can adjust specific settings within a sizing schema. 

You provide a new configuration, but only the values you specify will be changed; the rest of the original sizing configuration stays the same. This is useful when you want to make small adjustments to your sizing rules based on market conditions or new data. It takes a sizing schema object as input, which will override parts of the previous schema.

## Function overrideRiskSchema

This function lets you tweak existing risk management settings within the backtest-kit framework. Think of it as a way to fine-tune a previously set-up risk profile, rather than starting from scratch. You provide a piece of the risk configuration – like a new maximum drawdown percentage – and only that specific part gets updated. Everything else stays as it was originally defined, keeping the rest of your risk controls intact. It’s a simple way to adapt your risk management without rewriting the entire thing.

## Function overrideFrameSchema

This function lets you modify a timeframe configuration that's already being used for backtesting. Think of it as tweaking an existing timeframe setup – you can change specific parts of it, like the data intervals or other settings.  It only updates the information you provide; everything else about the timeframe stays the same. This is helpful if you need to adjust a timeframe after it’s already been set up. You provide a partial configuration object, and it returns the updated timeframe schema.

## Function overrideExchangeSchema

This function lets you modify an existing exchange's configuration. Think of it as a way to tweak a data source without rebuilding it entirely. You provide a partial configuration – just the settings you want to change – and the function updates the existing exchange, leaving everything else untouched. It’s useful for making adjustments to your data sources after they’ve already been set up.

## Function overrideActionSchema

This function lets you tweak an action handler's settings without completely replacing it. Think of it as a targeted update – you can change specific parts of how an action is handled, like its callback or some configuration, while leaving the rest untouched. This is really handy when you need to adjust things on the fly, like changing logic for testing or different environments, or modifying how actions behave without needing to rewrite the whole strategy. You just provide the parts you want to change, and the function takes care of the rest.

## Function listenWalkerProgress

This function lets you track the progress of your backtest as each strategy finishes running. It provides a way to get notified after each strategy's execution is complete. The notifications arrive in the order they happen, and importantly, it handles asynchronous callbacks safely to avoid any conflicts or unexpected behavior. You provide a function that will be called with information about each completed strategy. The function you provide will also return a function to unsubscribe from these updates.

## Function listenWalkerOnce

`listenWalkerOnce` lets you react to specific events as they happen during a backtest, but only once. You provide a filter – a way to identify the events you're interested in – and a callback function that will run when a matching event occurs. After that single execution, it automatically stops listening, making it perfect for situations where you need to wait for something specific to happen and then react. This helps keep your code clean and efficient by avoiding unnecessary ongoing subscriptions.

## Function listenWalkerComplete

This function lets you be notified when the backtest process finishes running all your trading strategies. It's like setting up a listener that gets triggered when the backtest is done. Importantly, the notifications happen one after another, even if the notification itself involves some asynchronous work. This helps prevent issues that can arise from running things at the same time. To use it, provide a function that will be called when the backtest completes, and the function returns another function to unsubscribe from these notifications later.

## Function listenWalker

The `listenWalker` function lets you keep track of what's happening as your backtesting strategies run. It's like setting up an observer that gets notified after each strategy finishes within a Walker.run() process.

Importantly, it handles these notifications in order and makes sure your callback function runs one at a time, even if it's doing something complex like an asynchronous operation. This helps prevent any unexpected issues caused by running things simultaneously. You provide a function (`fn`) that gets called for each event, receiving details about the strategy's progress. To stop listening, the function returns another function which you can call to unsubscribe.

## Function listenValidation

The `listenValidation` function lets you keep an eye on potential problems in your risk validation processes. It's a way to be notified when those validation checks fail, specifically when they throw errors during signal processing. Think of it as a safety net – it allows you to debug and monitor these failures without interrupting the main flow of your backtesting. The errors you receive will be delivered one at a time, in the order they occurred, ensuring you can analyze them methodically, even if your error handling involves asynchronous operations.


## Function listenSyncOnce

This function lets you listen for specific signal synchronization events, but only once. It's great when you need to make sure something happens just one time in response to a signal, like when coordinating with another system. The function will execute your provided callback once an event matches the filter you set, and it will wait for the callback to finish if it's a promise.  Think of it as a one-time alert for a particular type of signal event. You can also control whether a warning message is displayed.  When the function is done, you can stop listening by calling the function it returns.

## Function listenSync

This function lets you react to synchronization events within the backtest-kit framework. It’s designed for situations where you need to coordinate with external systems or processes. 

Think of it as a way to get notified when a trade signal is about to be acted upon – like when a signal is pending to be opened or closed.  If the function you provide includes asynchronous operations (like promises), the backtest will pause and wait for those to finish before proceeding with the trade. This is a powerful tool for ensuring everything is in sync before executing trades. 

You provide a callback function that gets executed whenever a synchronization event happens, and this function will return a function to unsubscribe from the event.


## Function listenStrategyCommitOnce

This function lets you react to specific changes happening within your trading strategies, but only once. Think of it as setting up a temporary alert for a certain condition. You provide a rule (the `filterFn`) that describes what kind of event you're interested in, and a function (`fn`) that gets executed the moment that event occurs. After that single execution, the alert is automatically turned off. It’s great for things like confirming a strategy has loaded or a specific trade has been placed and then you can proceed with other actions.


## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategies. It’s like setting up a notification system that tells you when things like scheduled orders get cancelled, positions are closed, or stop-loss and take-profit levels are adjusted.

The notifications happen one at a time, even if your notification handler takes a while to process them, ensuring nothing gets missed or overlaps. You provide a function that will be called whenever one of these strategy events occurs, and this function will be used to handle these events. 

You can unsubscribe from these notifications whenever you need to stop listening.

## Function listenSignalOnce

This function lets you react to a specific trading signal just once. You provide a condition – a filter – that determines which signals you're interested in. When a signal meets that condition, a callback function you define runs, and then the subscription automatically stops. It's perfect for scenarios where you need to react to a particular event and then move on. 

Essentially, you're setting up a temporary listener that fires only once for the right signal.

The `filterFn` is the rule that decides whether a signal is the one you want. The `fn` is the action that gets performed when a matching signal arrives.

## Function listenSignalNotifyOnce

This function lets you quickly react to specific trading signals and then automatically stop listening. You tell it what kind of signals you're interested in by providing a filter – a function that checks if a signal matches your criteria. When a matching signal arrives, your provided callback function runs just once, and then the subscription is turned off. It’s a convenient way to handle a single, important signal without managing ongoing subscriptions.

## Function listenSignalNotify

This function lets you listen for notifications when a trading strategy sends out information about a trade. Specifically, it picks up on events triggered when a strategy uses `commitSignalInfo()` to share notes related to an active position. The system ensures these notifications are handled one at a time, even if the notification process itself takes some time, making sure everything stays orderly. You provide a function that will be called whenever a notification is available, and this function will receive details about the signal information. You can unsubscribe from these notifications when you no longer need them.

## Function listenSignalLiveOnce

The `listenSignalLiveOnce` function lets you temporarily tap into live trading signals, but only to catch one specific event. Think of it as setting up a brief alert that triggers a function just once when a certain condition is met during a live trading simulation. It's perfect for quickly reacting to a specific signal without needing to manage ongoing subscriptions. The function takes a filter to decide which events you’re interested in and a callback function that will execute when a matching event appears. After the callback runs, the subscription is automatically removed, so you don't have to worry about cleaning up.


## Function listenSignalLive

This function lets you set up a way to receive real-time updates as trades happen during a live backtest. 

It's designed to handle these updates one at a time, ensuring they're processed in the order they arrive.

You provide a function that will be called whenever a new signal event occurs, and this function will receive information about the event. 

Keep in mind that you'll only get these events if you’re running a backtest in "live" mode.

The function returns another function that you can call to stop the subscription.


## Function listenSignalBacktestOnce

This function lets you temporarily "listen" for specific events during a backtest run. It's designed for situations where you only need to react to something happening once.

You provide a filter – a test to determine which events you're interested in – and a function to execute when a matching event occurs.

Once that one event is processed, the listener automatically stops listening, ensuring you don’t get bombarded with unnecessary data later on. Essentially, it's a quick and clean way to grab a single piece of information during a backtest.

It takes two arguments: a filter function that checks incoming events and a callback function that runs when the filter matches an event. The filter helps you narrow down the events you want to observe, and the callback is what actually *does* something with the matching data. The function returns an unsubscribe function, so you can manually stop the listener if needed.

## Function listenSignalBacktest

This function lets you tap into the stream of data generated during a backtest. It's like setting up a listener that gets notified whenever a signal event happens. 

You provide a function that will be called for each event, and the backtest framework handles the rest, ensuring these events are processed one after another. 

Keep in mind, you'll only receive these signals if you're running a backtest with `Backtest.run()`. The listener is a way to react to what's happening inside the backtest as it unfolds.


## Function listenSignal

This function lets you listen for updates from your trading strategies – think of it as keeping an ear to the ground for what’s happening with your trades. Whenever a strategy changes state, like when a trade is opened, active, or closed, this function will call a function you provide.

It's designed to handle these updates in order, preventing things from getting out of sync if your callback function does some work asynchronously. Essentially, it makes sure that your code reacts to each trading event one at a time, in the correct sequence.

You provide a function that will be executed with the details of each event. This allows you to react to different stages of the trading lifecycle.


## Function listenSchedulePingOnce

The `listenSchedulePingOnce` function helps you react to specific ping events, but only once. Think of it as setting up a temporary listener. It takes a filter to identify the events you're interested in and a function to run when that event occurs. Once the event is found and the function is executed, the listener automatically disappears, so you don't need to worry about cleaning up. It's great for situations where you need to respond to a particular condition only one time.

The `filterFn` lets you precisely define which events should trigger your callback.

The `fn` is the action that happens when a matching event is detected.


## Function listenSchedulePing

The `listenSchedulePing` function lets you keep an eye on scheduled signals as they're waiting to become active. It sends out a "ping" every minute while a signal is in this waiting period. 

Think of it as a heartbeat – it lets you know the signal is still there and being monitored. You provide a function that gets called each time this ping happens, so you can build custom checks or logging around the signal's lifecycle. 

Essentially, it’s a way to be notified about the ongoing monitoring of scheduled signals. The function you provide will receive an event object with details about the ping. When you’re done listening for these pings, you can call the function returned by `listenSchedulePing` to unsubscribe.

## Function listenRiskOnce

The `listenRiskOnce` function lets you set up a temporary listener for risk rejection events. It's like saying, "Hey, I only care about these specific risk events, and I just need to react to the first one that fits." Once the condition you define (using `filterFn`) is met, the provided function (`fn`) will run, and the listener automatically stops listening. This is great for situations where you're waiting for a particular risk rejection to happen and then want to take action, but don't want to keep listening afterward.

It takes two parts: a filter to identify the relevant events and a function to run when that event is detected. The function returns another function that can be called to remove the listener.


## Function listenRisk

This function lets you react to situations where a trading signal is blocked because it violates your defined risk rules. 

Think of it as a notification system specifically for when something goes wrong with your risk checks. 

You provide a function that will be called whenever a signal is rejected due to a risk failure. This function receives information about the rejected signal. Importantly, you'll only get these notifications for rejected signals – you won't be notified when a signal is approved.  The framework makes sure your callback function is executed one at a time, in the order the events occur, even if your function takes some time to complete.

## Function listenPerformance

This function lets you keep an eye on how your trading strategies are performing in terms of speed and efficiency. It’s like setting up a listener that gets notified whenever operations happen during a backtest. 

You provide a function that will be called with information about each operation's timing. 

The system ensures these notifications are processed one at a time, even if your provided function takes some time to complete, preventing any overlapping or unexpected behavior. This makes it great for spotting slow parts of your code and optimizing them.


## Function listenPartialProfitAvailableOnce

This function lets you set up a listener that reacts to specific partial profit levels being reached during a backtest. Think of it as a one-time alert for a particular profit condition. You provide a filter – a rule to identify the events you're interested in – and a function to execute when that rule is met. Once the condition is met, the listener automatically stops, so you won't receive any further notifications.

It's great for situations where you need to react to a specific profit milestone only once, like triggering a particular action or recording data.

The filter function determines which events trigger the callback. The callback function is then executed with the details of that matching event.


## Function listenPartialProfitAvailable

This function lets you track progress towards profit milestones during a backtest. 

You provide a function that will be called whenever a profit level is reached, like 10%, 20%, or 30% gain. 

Importantly, these events are handled one at a time, even if your function takes some time to complete, ensuring things don't get out of order. 

The subscription can be cancelled by returning the function provided as a parameter.

## Function listenPartialLossAvailableOnce

This function lets you set up a one-time alert based on changes to your partial loss level. It's like saying, "Hey, I only care about this specific situation happening *once*."

You provide a filter—a rule that defines when you want to be notified—and a function that will run when that rule is met.

The function then monitors for changes and executes your function just one time when the filter condition becomes true, then automatically stops listening. This is great for reacting to a specific, unusual loss event.


## Function listenPartialLossAvailable

This function lets you monitor your trading strategy's loss levels, like when it hits 10%, 20%, or 30% loss milestones. It sends you notifications whenever these loss levels are reached. Importantly, these notifications are handled one at a time to ensure things run smoothly, even if your notification processing takes some time. You provide a function that will be called each time a loss level is triggered, and this function receives information about the specific loss event. The function you provide will return a function that when called will unsubscribe you from the events.

## Function listenMaxDrawdownOnce

This function lets you react to specific max drawdown events and then automatically stop listening. Think of it as setting up a one-time alert for when a certain drawdown condition is met. You tell it what conditions to look for (using `filterFn`), and it will call your function (`fn`) just once when that condition is found. After that, it stops listening, so you don't get further notifications. 

It's great for things like pausing a trade when a drawdown reaches a critical level, or triggering a report based on a particular drawdown value.

The `filterFn` determines which events trigger the callback. 
The `fn` is the function that will be executed when a matching event is detected, and it handles the details of the event data.


## Function listenMaxDrawdown

This function lets you keep an eye on the maximum drawdown of your trading strategies. It will notify you whenever a new peak drawdown is reached, letting you react to changes in risk exposure. The events are handled one at a time, even if your reaction involves some processing, ensuring things happen in the right order. This is helpful if you want to adjust your risk management based on how much your strategy is losing. You provide a function that gets called whenever a drawdown event occurs.

## Function listenIdlePingOnce

`listenIdlePingOnce` lets you set up a listener that reacts to idle ping events, but only once a specific condition is met. You provide a function (`filterFn`) that determines which idle ping events are relevant to you, and then you specify a callback function (`fn`) that will be executed when a matching event occurs. Once that matching event has been processed, the listener automatically stops, ensuring it doesn’t trigger again. This is handy for things like initiating a specific action only after the system has been idle for a defined period. It returns a function that unsubscribes the listener.

## Function listenIdlePing

This function lets you listen for moments when the backtest kit isn't actively processing any trading signals. Think of it as getting a notification when things are quiet. 

It’s useful if you want to perform maintenance tasks or run checks when the system isn't busy executing trades. 

You provide a function that will be called with information about the idle ping event whenever this quiet period occurs.  The function you provide handles the `IdlePingContract` data. To stop listening, the function returns a cleanup function that you can call.


## Function listenHighestProfitOnce

This function lets you set up a temporary listener that reacts to specific profitable trades. 

You provide a rule (the `filterFn`) to define what kind of profitable trade you’re interested in.  Then, you give it a function (`fn`) that will be executed *only once* when a trade matches your rule.

After that one execution, the listener automatically stops listening, so it's great for reacting to a particular event and then forgetting about it. Think of it as a quick, one-time alert for a specific trading scenario.


## Function listenHighestProfit

This function lets you monitor when a trading strategy achieves a new peak profit. It's like setting up a notification system that alerts you whenever the strategy's profit reaches a higher point.

The events are handled in the order they occur, and the callback function you provide will be executed one at a time, even if it takes some time to complete. 

Think of it as a way to track those important profit milestones and potentially adjust your strategy based on how well it’s performing. You give it a function that will be called whenever a new highest profit is reached. The function you provide will be called with details about that event.


## Function listenExit

The `listenExit` function lets you monitor for and respond to serious errors that abruptly halt processes like background tasks in live trading, backtesting, or data walking. These aren't the minor hiccups your code might recover from – they're critical failures that shut everything down. 

You provide a function as input, and `listenExit` will call that function whenever a fatal error occurs. 

Importantly, errors are handled one at a time, in the order they happen, even if your error handling function involves asynchronous operations. This ensures a controlled and sequential response to those critical events. The registration returns an unsubscribe function that you can use to stop listening to exit events.

## Function listenError

The `listenError` function helps you handle errors that happen during your trading strategy's execution but aren't critical enough to stop everything. Think of it as a way to catch and deal with hiccups – maybe an API call fails, but you still want your strategy to keep running.

It essentially sets up a listener that will notify you whenever one of these recoverable errors occurs.

The errors will be handled one at a time, in the order they happen, even if the error handling itself takes some time to complete. This makes sure things stay organized and prevents problems caused by trying to process errors all at once.

To use it, you provide a function (`fn`) that will be called with the details of each error. The function itself returns a way to stop listening for errors.


## Function listenDoneWalkerOnce

This function lets you react to when a background task within your backtest completes, but only once. You provide a filter to specify which completed tasks you're interested in, and a function that will run when a matching task finishes. Once that function has executed, the listener is automatically removed, ensuring it doesn't trigger again. Think of it as a single, targeted alert for a specific background process.


## Function listenDoneWalker

This function lets you listen for when background tasks using the Walker framework finish running. It's like setting up a notification system to be alerted when a process is done. 

When a background task completes, it will trigger the function you provide.  Importantly, even if your function takes some time to run (like doing something asynchronous), the next completion notification won't be sent until yours is finished – ensuring events are handled one at a time in the order they arrive. This helps maintain order and prevents unexpected behavior if your callback involves asynchronous operations.


## Function listenDoneLiveOnce

This function lets you react to when background tasks finish running in your backtest. 

It allows you to specify a condition (using `filterFn`) to determine which completion events you're interested in.

Once a matching event occurs, a provided callback function (`fn`) will be executed exactly once, and then the subscription automatically stops. This is great for tasks that you only need to handle once upon completion.

## Function listenDoneLive

This function lets you listen for when background tasks, started with `Live.background()`, finish running. It’s designed for situations where you need to know when a process is truly complete, especially if that process involves asynchronous operations.

You provide a function (`fn`) that will be called when a task is done. 

The events are handled one after another to ensure a predictable order, and the framework makes sure your callback function runs without interference from other processes. Think of it as a way to reliably react to the completion of background tasks in a controlled sequence.


## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but only once. You provide a filter to determine which backtest completions you’re interested in, and then a function that will be executed when a matching backtest is done. Importantly, it automatically stops listening after that single execution, so you don’t need to worry about cleaning up. It’s handy for things like updating a UI with final results or triggering a follow-up action.


## Function listenDoneBacktest

This function lets you get notified when a background backtest finishes running. It’s useful if you need to perform actions after a backtest completes, like updating a user interface or saving results. 

The function provides a way to subscribe to events triggered when a backtest finishes. These events are handled one at a time, even if your notification code takes a while to execute. This ensures that everything runs in the correct order. You provide a function that will be called when a backtest is done, and the function returns another function that you can call to stop listening for these completion events.


## Function listenBreakevenAvailableOnce

This function lets you set up a temporary listener for breakeven protection events. You provide a filter to specify exactly which events you're interested in. Once an event matching your filter arrives, the provided callback function will be executed just once, and then the listener will automatically stop listening. It's perfect for situations where you need to react to a specific breakeven condition and then move on.

You essentially tell it "Hey, watch for events like this, and when you see one, do this *one* time, then stop watching."

The first argument is the filter - a function that decides if an event is relevant. The second argument is the function that runs when a matching event is found.

## Function listenBreakevenAvailable

This function allows you to be notified when a trade's stop-loss automatically moves to the original entry price, a feature designed to protect profits. It's essentially telling you that the trade has made enough money to cover its initial costs, so the risk is now at the original purchase price.

The notifications are delivered one at a time, even if your callback function takes some time to execute, ensuring that nothing gets missed. 

To use it, you provide a function that will be called whenever a breakeven event occurs, and this function returns another function that can be used to unsubscribe from the event.


## Function listenBeforeStartOnce

This function lets you react to specific events that happen right before a backtest begins. You provide a filter – a way to identify the exact events you're interested in – and a function to execute when that event occurs.  Critically, it's designed to only run your function *once* and then automatically stops listening, keeping things clean and efficient. Think of it as setting up a single, one-time alert for a particular condition at the start of a trading simulation. 


## Function listenBeforeStart

This function lets you hook into the moment right before a trading strategy begins for a specific asset. Think of it as a heads-up signal. 

It provides a way to execute code sequentially, even if that code involves asynchronous operations. 

The `fn` you provide will be called with details about the upcoming strategy run, ensuring events are handled one after the other to avoid any clashes. You can unsubscribe from these signals at any time by returning the value that is returned from the `listenBeforeStart` function.

## Function listenBacktestProgress

This function lets you keep an eye on how your backtest is running. It sets up a listener that receives updates as the backtest progresses. 

Think of it as getting occasional snapshots of the backtest's status.

The updates are delivered in the order they happen, and even if your callback function takes some time to process each update, the updates are handled one after another to avoid any confusion. 

You provide a function that gets called whenever a progress event occurs, and this function will be given information about the event. When you are done, the function returns another function you can use to unsubscribe from the listener.


## Function listenAfterEndOnce

This function lets you react to specific events that happen after a trading simulation finishes, but only once. You provide a filter to specify exactly which events you're interested in, and then a callback function that will be executed just the first time a matching event occurs. After that single execution, the subscription is automatically cancelled, so you don't have to worry about cleaning up. It's a convenient way to perform a one-off action based on the final state of your backtest.


## Function listenAfterEnd

This function lets you tap into what happens after a trading strategy finishes running for a specific asset. 

Think of it as a notification system—you provide a function, and it gets called whenever a strategy concludes.

Crucially, these notifications are handled in a safe and orderly way; even if your function does something complex (like making an API call), it won't interfere with the next notification until it's fully completed. 

This ensures that events are processed one after another, in the order they arrived, preventing any unexpected clashes or race conditions.


## Function listenActivePingOnce

This function lets you watch for specific active ping events and run a piece of code just once when you find one that matches. Think of it as setting up a temporary listener – it listens until it sees what you're looking for, then it stops listening and runs your code. It’s handy for waiting for a particular condition to be met with these active ping events.

You provide a filter function to define what events you're interested in, and a function to execute when a matching event is detected. The listener automatically unsubscribes after the callback has been executed once, ensuring you don't continue processing the same event.


## Function listenActivePing

This function allows you to monitor active signals within the backtest environment. It listens for events, which are sent out every minute, providing updates on the lifecycle of active signals. 

Think of it as a way to keep an eye on what's happening with your trading signals.

Importantly, these events are handled one at a time in the order they're received, and even if your callback function takes some time to process, it won't interfere with the processing of subsequent events. You provide a function that gets called whenever a new active ping event occurs, allowing you to react to changes in signal status.

## Function listWalkerSchema

This function allows you to see all the different trading strategies or "walkers" that have been set up within the backtest-kit system. It gathers a list of these walkers, providing information about each one. Think of it as a way to peek behind the curtain and understand the different approaches being tested. This is especially helpful when you're trying to figure out what's happening, creating documentation, or building a user interface that needs to display these strategy configurations.


## Function listStrategySchema

This function helps you see a complete inventory of all the trading strategies you've set up within the backtest-kit framework. It's like getting a directory listing of all your strategies, returning a list of their descriptions. This is handy if you're trying to understand what strategies are available, building a user interface to manage them, or just checking everything is configured correctly.


## Function listSizingSchema

This function lets you see all the sizing strategies that have been set up in your backtesting environment. Think of it as a way to check what rules are in place for determining how much of an asset to trade. It provides a simple list of these configurations, which is handy for understanding your setup, troubleshooting, or even creating tools that automatically display your sizing rules. It's a convenient way to examine the sizing logic being used during backtesting.

## Function listRiskSchema

This function lets you see all the risk schemas currently set up in your backtest. Think of it as a way to peek under the hood and get a list of all the risk configurations you've defined. It's handy if you’re troubleshooting, want to understand your setup, or want to build an interface that dynamically displays these risks. The function returns a promise that resolves to an array of risk schema objects.

## Function listMemory

This function lets you retrieve a list of all stored memory entries associated with the current signal. Think of it as looking through a history of data points relevant to your trading strategy. 

It simplifies the process by automatically figuring out which signal you're working with and whether you're in a backtesting or live trading environment, based on the surrounding context.

You provide a simple configuration object, specifying the bucket name where the memory is stored.

The function returns a promise that resolves to an array. Each item in the array represents a memory entry, including a unique identifier and the content itself.

## Function listFrameSchema

This function helps you see all the different "frames" or data structures that your backtest setup uses. It essentially gives you a complete inventory of the data formats defined within your trading system. Think of it as a way to peek under the hood and understand what kind of information is being processed during your backtests. It’s particularly helpful if you're trying to debug or build tools that need to interact with these data structures.

## Function listExchangeSchema

This function lets you see a complete inventory of all the exchanges your backtest-kit setup recognizes. Think of it as a way to check which data sources are available for trading simulations. It returns a list, so you can easily loop through them or display them. This is really handy for troubleshooting, creating guides, or building interfaces that automatically adapt to the exchanges you're using.

## Function hasTradeContext

This function simply tells you if the environment is ready for trading operations. 

It checks if both the execution and method contexts are active. 

If it returns true, you're good to go and can use functions like getting candle data, calculating averages, formatting prices or quantities, and accessing dates and modes. Basically, it's a quick check to ensure everything is set up properly before performing actions related to trading.

## Function hasNoScheduledSignal

This function helps you check if a trading signal is currently scheduled for a specific asset, like "BTCUSDT". 

It returns `true` if no scheduled signal exists for that asset, which is helpful to ensure you’re not accidentally generating signals when they aren’t needed.

Think of it as the opposite of `hasScheduledSignal`; it’s a safety check to make sure your signal creation process only runs when appropriate.

The function handles whether you're in a backtesting or live trading environment automatically.

You simply provide the trading pair's symbol as input to get the result.

## Function hasNoPendingSignal

This function, `hasNoPendingSignal`, helps you check if there’s currently a pending trading signal for a specific asset, like "BTCUSDT". It returns `true` if there isn’t a signal waiting, meaning you're clear to potentially generate a new one. Think of it as the opposite of `hasPendingSignal`; it's a useful way to make sure your signal generation logic only runs when appropriate. The function automatically figures out whether it's running in a backtesting or live trading environment, so you don't need to worry about that. You simply provide the symbol of the asset you’re interested in, and it handles the rest.

## Function getWalkerSchema

The `getWalkerSchema` function helps you find information about a specific trading strategy, or "walker," within your backtest setup. Think of it as looking up the blueprint for a particular trading method.  You give it the name of the walker you're interested in, and it returns a detailed schema describing how that walker operates, including the data it uses and the calculations it performs. This allows you to understand and potentially modify or analyze the behavior of your trading strategies.


## Function getTotalPercentClosed

This function lets you check how much of a trading position is still open. It tells you the percentage of the original position size that hasn't been closed out – so a value of 100 means you still hold the entire position, while 0 means it's completely closed. 

It's smart about how it calculates this, even if you’ve added to the position with dollar-cost averaging (DCA) and closed it in smaller chunks along the way.

You just need to provide the symbol of the trading pair you’re interested in, like 'BTCUSDT'. 

It will automatically figure out if it's running in a backtesting simulation or in a live trading environment.


## Function getTotalCostClosed

This function helps you figure out how much money you've invested in a particular trading pair, like BTC/USD. It’s especially useful if you’ve been adding to your position over time through dollar-cost averaging (DCA) and have also been closing parts of it. The function calculates the total cost basis in dollars, considering those partial closes and the varying prices at which you entered the trade. It works whether you're running a backtest or a live trading simulation, because it automatically understands the environment it's in. You simply provide the trading pair symbol, such as "BTC/USD," and it will return the total cost.

## Function getTimestamp

This function, `getTimestamp`, gives you the current time, but it behaves differently depending on whether you're running a backtest or live trading. When testing past performance (backtest mode), it provides the timestamp for the specific point in time you're analyzing. If you’re trading in real-time, it delivers the present, live timestamp. Essentially, it's a way to know what time it is relative to your trading activity.

## Function getSymbol

This function retrieves the symbol you're currently trading, like "BTCUSDT" or "ETHUSD." It's a simple way to know what asset your backtest or trading strategy is focused on. The function returns a promise that resolves to the symbol as a string, so you'll need to use `await` or `.then()` to get the actual value.

## Function getStrategyStatus

This function lets you peek into the current state of your trading strategy as it's running in a backtest or live environment. Think of it as a snapshot of what's happening behind the scenes – queued actions, pending signals, and flags related to user interactions. It provides details for a specific trading pair, like "BTC-USDT". You don't need to worry about whether you're in a backtest or not; the function figures that out for you.


## Function getStrategySchema

The `getStrategySchema` function lets you fetch details about a specific trading strategy that's been set up within the backtest-kit framework. Think of it as looking up the blueprint for a strategy. You provide the strategy's unique name, and the function returns a structured description outlining how that strategy operates, including its inputs, outputs, and other relevant configuration information. This helps you understand and potentially modify or debug strategies programmatically.

## Function getSizingSchema

This function helps you find the specific rules for how much of an asset to trade based on a name you give it. Think of it like looking up a recipe; you provide the recipe name (the sizing name), and the function returns the detailed instructions (the sizing schema). It’s used to access the configuration for determining position sizes in your trading strategies. You use a unique identifier to pinpoint the sizing schema you need.

## Function getSignalState

This function helps you retrieve a specific data value associated with an active trading signal. It automatically figures out whether you're in a backtest or live trading environment.

If a signal is currently active, it fetches the data; otherwise, it gives you back a default starting value and logs a message to let you know.

Think of it as a way to keep track of metrics, like how long a trade is open or how much it has gained, as you're executing trades – especially useful for strategies that adjust based on those metrics. 

The function takes the trading symbol as input and a configuration object containing the bucket name and an initial value for the data you're tracking.

## Function getSessionData

This function lets you retrieve data that's specifically saved for a trading strategy's run. Think of it as a way to store information that needs to be remembered between each candle processed, or even if the process restarts. It's helpful for keeping track of things like complex calculations, caching results, or any state that needs to be maintained throughout a trading session. The function automatically knows whether it's running a backtest or in live trading mode. You just need to provide the symbol of the trading pair you're interested in.

## Function getScheduledSignal

This function lets you fetch the currently planned or "scheduled" trading signal for a specific asset, like BTC-USD. 

Think of it as checking what the system has already decided to do based on a pre-defined schedule.

If there's no signal scheduled, the function will tell you by returning nothing. 

It figures out whether it’s running a practice test (backtest) or live trading automatically. 

You just need to provide the trading symbol you're interested in.

## Function getRuntimeInfo

This function gives you a snapshot of how your trading system is currently running. It reveals important details like which asset you’re analyzing, the exchange being used, the timeframe of your charts, and the strategy you've implemented. It also tells you whether you're in a historical simulation (backtest) or a live trading session. Think of it as a quick way to understand the context of your current run.

## Function getRiskSchema

This function lets you fetch details about a specific risk metric that's already been defined in your backtesting setup. Think of it as looking up the blueprint for how a certain risk is calculated and tracked. You provide the name or identifier of the risk you’re interested in, and it returns a structured object describing that risk – things like what data it uses and how it’s calculated. It's useful when you need to understand or programmatically work with the details of a registered risk.


## Function getRawCandles

The `getRawCandles` function helps you retrieve historical price data, also known as candles, for a specific trading pair and timeframe. You can control how much data you get by specifying a limit on the number of candles, or by defining a start and end date for the data you want.

It’s designed to make sure your analysis is fair and doesn't accidentally peek into the future.

Here's how you can use the parameters:

*   You can specify both a start date, end date, and the number of candles.
*   If you only provide a start and end date, it will automatically figure out how many candles are needed to cover that range.
*   If you just want a certain number of candles from a specific point in the past, you can simply set the number of candles you want.
*   If you only provide a number of candles, it will fetch data backwards from the current time.

The function takes the symbol (like "BTCUSDT"), the interval (like "1m" for one-minute candles), and optionally a limit, start date, and end date. The result is an array of candle data.

## Function getPositionWaitingMinutes

This function helps you find out how long a trading signal has been waiting to be put into action. It tells you the wait time in minutes for a specific trading pair, like BTC/USDT. 

If there's no signal currently waiting, it will return null, meaning there’s nothing waiting right now. 

You just need to provide the symbol of the trading pair you're interested in.


## Function getPositionPnlPercent

This function helps you quickly check the unrealized profit or loss as a percentage for a trade you're currently holding. It takes into account things like how much you've already sold, your average entry price (DCA), potential price slippage, and any fees you might have paid. 

If you don't have any active trades, it will return null.

It figures out whether you’re running a backtest or a live trading session and fetches the current price automatically, making it super convenient to use. To use it, simply provide the symbol of the trading pair you're interested in, like "BTCUSDT".


## Function getPositionPnlCost

This function helps you understand how much money you've potentially gained or lost on a trade that’s still open. It calculates the unrealized profit and loss in dollars based on the current market price.

The calculation considers factors like how much you've invested, any partial trades you've made, cost of slippage and fees. 

If there are no open trades, it will return null.  The function automatically knows whether it's running in a backtesting or live trading environment and gets the current price for you.

You just need to provide the trading pair symbol, like "BTCUSDT".


## Function getPositionPartials

This function lets you check the history of partial profit or loss closures for a specific trading pair. It provides a look at how much of your position has been closed out partially, at what price, and the cost basis at the time of each partial. 

If you haven't started a backtest or haven't executed any partial closures, it will return either a null value or an empty array respectively. The output gives you details like the type of closure (profit or loss), the percentage closed, the price used for the closure, the cost basis, and the number of DCA entries at the time. You pass in the trading pair symbol to see the partials associated with that symbol.

## Function getPositionPartialOverlap

This function helps you avoid accidentally closing a position partially more than once at roughly the same price. It checks if the current market price is close enough to a previously executed partial close order. 

Essentially, it's a safety net to prevent unwanted duplicate actions.

The function looks at the prices of any existing partial close orders and calculates a tolerance range based on percentages you define (or default percentages if you don't). If the current price falls within that range, it means a partial close is already in progress nearby.

You provide the trading symbol and the current price to be checked, and optionally customize the tolerance zone. The function returns `true` if a partial overlap exists and `false` otherwise, which is useful for coordinating actions within your trading system.

## Function getPositionMaxDrawdownTimestamp

This function helps you find out when a specific trading position experienced its biggest loss. It looks back at the entire history of that position – from when it was opened until now – and identifies the exact timestamp marking the lowest point in its value. 

Essentially, it tells you when the position suffered the most drawdown.

If no trading signals are currently active for that symbol, the function will return null.

To use it, you simply need to provide the symbol of the trading pair you're interested in, like 'BTCUSDT'. The function will then return a timestamp representing the maximum drawdown point for that position.


## Function getPositionMaxDrawdownPrice

This function helps you understand the most significant loss a specific trade has experienced. It calculates the lowest price the trade reached during its active period, essentially showing you the biggest drawdown. 

If there's no open trade associated with the provided symbol, the function will return null, indicating there's nothing to analyze. You provide the symbol of the trading pair (like BTCUSDT) as input to see its maximum drawdown.

## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand the performance of a specific trading position. It calculates the maximum drawdown of the profit and loss percentage for that position, essentially telling you the lowest point the position reached in terms of profitability. The value returned represents the percentage of profit lost at the time of the largest drawdown. If no trading signals are active for that symbol, the function will return null, meaning it can't assess the drawdown. You simply provide the symbol of the trading pair you want to analyze.

## Function getPositionMaxDrawdownPnlCost

This function helps you understand the financial impact of a trading position. It calculates the total cost in terms of profit and loss (expressed in the quote currency, like USD or EUR) that occurred at the point when the position hit its lowest value. Think of it as revealing how much you've lost at the absolute worst moment for that particular trade. If there's no open trade, it won’t give you a value but rather a null response. You provide the trading pair symbol – like "BTC-USD" – to specify which position you're interested in.

## Function getPositionMaxDrawdownMinutes

This function tells you how much time has passed since a trade experienced its biggest loss. It’s a way to measure how long ago things went wrong for a particular trade. 

The time is measured in minutes. If the drawdown happened just now, the value will be close to zero.

If there's no ongoing trade, the function won't return a value. You need to provide the symbol of the trading pair you're interested in.

## Function getPositionLevels

getPositionLevels lets you see the prices at which your initial buy and any subsequent average buy orders were placed for a particular trading pair. It's how you track the prices involved in a dollar-cost averaging (DCA) strategy. 

If there's no open trade, it will return null. If you only made one buy, you'll get an array with just the original entry price. Otherwise, it provides a list of all the prices at which you've bought, starting with the original price and including any prices added through commitAverageBuy. You just need to provide the trading pair symbol to see these prices.


## Function getPositionInvestedCount

This function helps you track how many times you've adjusted a trade using dollar-cost averaging (DCA) for a specific trading pair. 

It tells you the number of DCA entries made for the current open trade – a value of 1 means it’s the original purchase, and each subsequent DCA increases that number. If there isn't an active trade, the function will return null. The function intelligently determines whether it's running in a backtest or a live trading environment. You only need to provide the symbol of the trading pair you're interested in.

## Function getPositionInvestedCost

This function helps you figure out how much money is tied up in a particular trade. It calculates the total cost basis, which includes all the entry costs associated with a signal. 

Essentially, it adds up the costs from each time you bought into the trade. If there's no signal currently in progress, it will return null. The function intelligently determines whether it's running in a backtest or live trading environment.

You provide the trading symbol (like BTC-USDT) as input to see the cost basis for that specific trade.


## Function getPositionHighestProfitTimestamp

This function helps you find the exact moment when a specific trade (or "position") made the most profit. It looks at a trading pair, like "BTCUSDT," and tells you the timestamp—essentially, the date and time—when the price was at its highest point for that trade. 

If there's no active signal for that trading pair, it won't be able to provide a timestamp and will return null. Think of it as a way to pinpoint the peak profitability of a past trade. The input needed is just the symbol of the trading pair you're interested in.

## Function getPositionHighestProfitPrice

This function helps you find the best price your position has achieved while moving in a profitable direction. 

It essentially remembers the highest price for a long position or the lowest price for a short position, since the position was opened. 

The function takes the trading symbol (like "BTCUSDT") as input and returns a number representing that best price. It's always available when a position is active, giving you a snapshot of its performance so far.


## Function getPositionHighestProfitMinutes

This function helps you understand how long a trading position has been operating below its best-ever profit level. It tells you the number of minutes that have passed since the price reached its highest point for that particular trading pair. Think of it as a measure of how far a position has fallen from its peak—a longer number means it’s been a while since it hit that high. If there's no trading signal for the symbol, the function will return null. You provide the trading pair symbol, like "BTCUSDT", to get the information.

## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position has moved from its most profitable point. It calculates the difference between the highest profit percentage achieved and the current profit percentage. 

Essentially, it shows you how much headroom you had before, and how far you are from that peak.

If there are no active trading signals, this function won't be able to provide a result. You need to specify the trading pair, like 'BTC/USDT', to get the calculation.

## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your trading position is from its potential peak profit. It calculates the difference between the highest profit achieved so far and the current profit, ensuring the result is never negative. If no trading signals are pending for a specific symbol, the function will return null. You provide the trading pair symbol, like 'BTC-USD', to get this information.

## Function getPositionHighestProfitBreakeven

This function helps you understand if a trade could have reached a breakeven point at its peak profit. It checks for a specific trading pair, like BTCUSDT, and determines if the highest price achieved during the trade allowed for a breakeven scenario. If there's no active trade signal for that pair, the function will tell you that. Essentially, it's a tool to analyze past trades and see if they had the potential for a clean break-even at their best performance.

## Function getPositionHighestPnlPercentage

This function helps you understand how well a particular trade performed. It looks at a specific trading pair, like BTC-USDT, and tells you the highest percentage profit it ever reached while the trade was open. Think of it as finding the peak of a trade’s performance. 

If there's no active trade data available for that symbol, the function will return null, indicating no information can be provided. Essentially, it’s a way to pinpoint the most profitable moment of a trade's history.

## Function getPositionHighestPnlCost

This function lets you find out the highest profit and loss cost incurred during a trading position's lifetime, specifically at the moment the most profitable price was achieved. It’s a way to understand the peak financial risk associated with that position.

The function takes the trading symbol as input, such as 'BTC-USDT'.

It returns a numerical value representing that highest PnL cost. If there's no existing signal for that position, the function will return null.


## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand how much your trading position has recovered from its biggest loss. It calculates the difference between your current profit percentage and the lowest point your profit reached during that period.

Essentially, it shows you how far your position has climbed back from its most significant dip in profitability.

The function requires you to specify the trading symbol, like "BTC/USDT". It returns a percentage value representing this drawdown recovery. If there’s no existing trading signal for that symbol, the function won't return a value.

## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand how far your trading position is from its lowest point in terms of profit and loss. It calculates the difference between your current profit/loss and the lowest profit/loss you've experienced during the backtest. Essentially, it tells you how much "cushion" you have against potential further losses. If there isn't a currently active trading signal for a particular symbol, the function won't return a value. You just need to specify the trading pair symbol you're interested in.

## Function getPositionEstimateMinutes

getPositionEstimateMinutes helps you check how long a trade is expected to last. It looks at the initial estimate set for a pending trade, essentially telling you the maximum number of minutes it's expected to stay open before it automatically closes due to time expiration. 

If there isn't a trade waiting to be executed, it will return null. 

You provide the trading pair symbol to identify the specific trade you're interested in.


## Function getPositionEntryOverlap

The `getPositionEntryOverlap` function helps you avoid accidentally placing multiple DCA orders at roughly the same price. It checks if the current market price is close to any of your existing DCA entry levels, considering a small tolerance zone around each level.

Think of it as a safety check – it prevents you from accidentally stacking up DCA orders when the price fluctuates slightly.

The function returns `true` if the price falls within a defined range around any existing DCA level and `false` if there are no levels to check against.  You can configure the size of this range with the `ladder` parameter to fine-tune the sensitivity of the check.

## Function getPositionEntries

getPositionEntries lets you peek at the prices and costs of your DCA entries for a specific trading pair. It gives you a list detailing each time you added to your position – whether it was the initial buy or a later DCA commit. If you don't have an active trading signal, it'll return nothing. If you only made one purchase, you'll get a list containing just that one entry. Each entry in the list includes the price at which you bought and the total dollar amount spent at that price.


## Function getPositionEffectivePrice

This function helps you figure out the average price at which you've accumulated a position, taking into account any previous buys or DCA (Dollar-Cost Averaging) strategies. It essentially calculates a weighted average based on how much you spent and the prices at which you bought.

If you've partially closed your position at different prices, this function considers those partial closures and blends them with any subsequent DCA entries to give you a comprehensive view of your average entry price.

If you haven't made any DCA entries, the function simply returns the initial opening price.  It will also tell you there’s no data if there's no active trade in progress. The framework automatically determines whether it's running a backtest or in live trading mode.

You just need to provide the symbol of the trading pair (like BTCUSDT) to get the effective price.

## Function getPositionDrawdownMinutes

getPositionDrawdownMinutes tells you how much time has passed since your current trading position reached its highest profit. Think of it as a measure of how far your profits have fallen from their peak. If your position just started making money, this value will be zero. As prices move and your profits decrease, this number will increase, reflecting the length of the pullback. If there's no active trade happening, it won't be able to provide a value and will return null. You need to specify the trading pair, like "BTCUSDT", to get this information.

## Function getPositionCountdownMinutes

getPositionCountdownMinutes tells you how much time is left before a trading position expires. It calculates this by looking at when the position was first flagged for potential expiration and comparing it to an estimated expiration time. 

The result is always a positive number of minutes, or zero if the estimated expiration has already passed. 

If there’s no indication of a pending expiration for a particular trading pair, the function will return null. You need to provide the trading pair symbol as input.

## Function getPositionActiveMinutes

The `getPositionActiveMinutes` function lets you check how long a particular trading position has been open. It returns the number of minutes the position has been active.

If there’s no signal currently pending for that symbol, the function will return null.

You just need to provide the trading pair symbol – like "BTCUSDT" – to use this function.


## Function getPendingSignal

This function lets you check if your trading strategy currently has a pending order waiting to be filled. 

It returns information about that pending order, like the price and quantity.

If there isn't a pending order active, it will tell you by returning nothing.

You don’t need to worry about whether you're running a test backtest or a live trade – the function figures it out automatically.

To use it, you simply provide the trading pair symbol, like "BTCUSDT".


## Function getOrderBook

This function retrieves the order book information for a specific trading pair, like BTCUSDT. It pulls this data from the exchange you've configured within the backtest-kit framework. 

The function takes the trading symbol as input, and you can optionally specify the desired depth of the order book. If you don’t specify a depth, it will use a default value.

The function is designed to work with the existing timing of your backtest or live trading environment, so the exchange knows when the request is being made. The exchange then uses this timing information as appropriate for either a backtest or a live trading scenario.


## Function getNextCandles

This function lets you grab a batch of future candles for a specific trading pair and time interval. It’s designed to get candles that come *after* the current time frame you're working with, leveraging the exchange's specific way of fetching them. You'll need to provide the symbol, like "BTCUSDT," the candle interval (options include things like "1m" for one-minute candles or "4h" for four-hour candles), and how many candles you want to retrieve. The function returns a promise that resolves to an array of candle data.


## Function getMode

This function tells you whether the backtest-kit is currently running a simulation (backtest mode) or a live trading session. It's a simple way to check the context of your code and adjust behavior accordingly. It returns a promise that resolves to either "backtest" or "live", making it easy to use in your functions.

## Function getMinutesSinceLatestSignalCreated

This function helps you figure out how much time has passed since the last trading signal was generated for a specific asset, like "BTC-USDT". It measures this time in whole minutes. 

It doesn't matter whether that signal is still active or has already been closed; it simply checks the timestamp of the most recent signal. This is handy for things like making sure you wait a certain amount of time before placing a new trade after a stop-loss.

First, it looks for this information in your backtest data, and if it can't find it there, it checks your live trading data. If there’s no signal history at all, it returns null. The function automatically knows whether you're in backtest mode or live trading mode.

You just need to provide the symbol of the asset you're interested in, for example, "BTC-USDT".


## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand the risk profile of a trading strategy. It calculates the maximum drawdown – essentially, the biggest drop from a peak profit to a low point – expressed as a percentage of the peak profit. 

You provide the trading symbol (like BTC/USD) as input, and the function returns that percentage. 

If the strategy hasn’t generated any trading signals yet, the function will return null. This metric can be useful for comparing the riskiness of different strategies.


## Function getMaxDrawdownDistancePnlCost

This function helps you understand the potential risk in a trading strategy by calculating the maximum drawdown distance based on profit and loss. It essentially measures the difference between the highest profit you've seen and the lowest point where you were in the red. 

Think of it as a way to see how far you might fall from your best performance. 

The result represents the largest amount your account would have lost from its peak profit. This value is returned as a number. It won't return anything if there are no trading signals available.

You provide the trading pair symbol (like 'BTC-USD') to specify which strategy you’re analyzing.


## Function getLatestSignal

This function lets you retrieve the most recent trading signal generated by your strategy, whether it’s still active or has already closed. It’s handy for things like implementing cooldown periods – for instance, preventing a new trade immediately after a stop-loss event. The function checks both your historical backtest data and, if you’re running live, your live trading data to find the most recent signal. If no signal exists for the specified trading pair, it will return null. It automatically figures out if it’s running in a backtest or a live environment.

You provide the trading symbol, like 'BTCUSDT', to specify which asset's signal you want.


## Function getFrameSchema

The `getFrameSchema` function lets you look up the blueprint for a specific frame within your backtest. Think of it as finding the detailed instructions for how a particular component of your trading simulation should work. You provide the name of the frame you're interested in, and it returns a description outlining its properties and expected behavior. This is helpful when you need to understand or dynamically work with the structure of your backtest frames.


## Function getExchangeSchema

This function lets you fetch the details of a specific cryptocurrency exchange that backtest-kit knows about. Think of it as looking up the blueprint for how that exchange operates. You provide the name of the exchange you’re interested in, and it returns a structured description of its data format and capabilities. This is useful for understanding the expected data and tailoring your trading strategies accordingly. The exchange name must be a valid identifier recognized by the framework.

## Function getDefaultConfig

This function gives you a set of default settings for the backtest-kit framework. Think of it as a starting point for your configurations. It provides a collection of numbers and boolean values that control various aspects of the backtesting process, like how often data is fetched, limits on the number of signals generated, and whether certain features are enabled. Exploring this default configuration is a great way to understand all the available options before you customize them for your specific trading strategy.

## Function getDefaultColumns

This function provides you with a set of predefined column configurations used for generating markdown reports. Think of it as a template for how your report's columns are structured. It gives you the default layout for various data types like strategy results, heatmap rows, live ticks, partial fills, breakeven events, performance metrics, risk events, scheduled events, strategy events, synchronization events, highest profit events, maximum drawdown events, walker P&L data, and overall strategy results.  You can use this to understand the available column options and their initial setups, which is helpful when customizing your reports.

## Function getDate

This function, `getDate()`, helps you retrieve the current date within your trading simulations or live trading environment. When you're running a backtest, it gives you the date associated with the specific timeframe being analyzed. If you’re running in a live trading scenario, it provides the current, real-time date. Essentially, it's a simple way to know what date your calculations and decisions are based on.

## Function getContext

This function gives you a snapshot of the current environment where your trading logic is running. Think of it as a way to peek behind the curtain and see what's happening during a trade execution. It provides a context object that holds information crucial for understanding the current method's behavior and available resources. It's useful when you need to access data or settings related to the ongoing process.

## Function getConfig

This function lets you peek at the system’s settings. It gives you a snapshot of all the global configuration values, like how often things are checked, limits on data requests, and various controls for generating reports and managing signals. The important thing is that it provides a copy of these settings, so you can look at them without changing the actual system configuration.

## Function getColumns

This function gives you access to the configuration of columns used for generating reports. Think of it as a snapshot of what data is being displayed in your backtest results. 

It provides different sets of columns for various aspects of your backtest, like closed trades, heatmaps, live data, and performance metrics. 

Essentially, you can peek at how the columns are set up to understand the report's structure and the data it presents. The returned configuration is a copy, so changes won't affect the actual backtest-kit setup.


## Function getClosePrice

This function helps you fetch the closing price of the most recent candle for a specific trading pair and timeframe. Think of it as a way to quickly get the latest market price for a particular asset, like Bitcoin against USDT, at a defined interval such as every minute or every hour. You provide the symbol of the trading pair (e.g., BTCUSDT) and the candle interval (like 1m, 5m, 1h), and it returns that closing price. It's useful for making quick decisions based on the latest price action.


## Function getCandles

This function helps you retrieve historical price data, also known as candles, for a specific trading pair. You tell it which symbol you’re interested in, like "BTCUSDT" for Bitcoin against USDT, and the time interval for the candles, such as "1h" for one-hour candles. Finally, you specify how many candles you want to pull back in time. It uses the underlying exchange's tools to get this data for you.

## Function getBreakeven

This function helps determine if a trade has become profitable enough to cover the costs involved in the transaction. It looks at the current price of a trading pair and compares it to a threshold that accounts for slippage and trading fees. Essentially, it's checking if the price has moved in a favorable direction to the point where any losses from the trade have been recovered. The function automatically knows whether it's running in a backtesting environment or a live trading situation. You provide the symbol of the trading pair and the current price to see if the breakeven point has been surpassed.

## Function getBacktestTimeframe

This function helps you find out the dates and times included in a backtest for a specific trading pair, like BTCUSDT. It returns a list of dates that represent the period being analyzed. Essentially, it tells you the start and end points of the backtest data for that particular asset. You provide the symbol of the trading pair, and the function gives you back a list of dates.

## Function getAveragePrice

This function helps you figure out the average price of a trading pair, like BTCUSDT. 

It uses a method called VWAP, which takes into account both the price and the trading volume. Basically, it looks at the last few minutes of trading activity to give you a sense of the overall average.

If there’s no trading volume for a particular period, it will just calculate the average of the closing prices instead. 

You just need to provide the symbol of the trading pair you’re interested in.

## Function getAggregatedTrades

This function retrieves a list of aggregated trades for a specific trading pair, like BTCUSDT. 
It pulls this data directly from the exchange you've configured.

You can request all trades within a defined time window or specify a maximum number of trades to retrieve.  If you don't set a limit, it will fetch trades from the past hour. If you *do* provide a limit, it will collect enough trades to meet that requirement.

## Function getActionSchema

This function helps you find the blueprint for a specific action within your trading strategy. Think of it like looking up the definition of a command – you give it the action's name, and it returns the details outlining what that action should do. It's essential for understanding and validating the actions your backtest kit is performing. The `actionName` is a unique identifier that tells the function exactly which action schema to retrieve.

## Function formatQuantity

This function helps you display the right amount of a traded asset, like Bitcoin or Ethereum, by automatically applying the rules of the exchange you're using. It takes the trading pair symbol (e.g., BTCUSDT) and the raw quantity as input. The function then figures out how many decimal places are needed based on that specific trading pair and returns a formatted string representing the quantity. This ensures that the displayed value matches what the exchange expects, preventing potential order issues.


## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a symbol, like "BTCUSDT," and the raw price value. It then uses the exchange’s specific rules to format the price, ensuring the right number of decimal places are shown, which is important for accurate representation. Essentially, it handles the details of how different exchanges display prices so you don't have to.

## Function dumpText

The `dumpText` function lets you save raw text data, like logs or analysis results, associated with a specific signal. Think of it as a way to record important information related to a trading decision. It automatically handles things like figuring out which signal it belongs to and whether you're in a backtesting or live trading environment, making it easy to use in different situations. You provide a description, a unique identifier (`dumpId`), the text itself, and the name of the bucket where it should be stored.

## Function dumpTable

This function lets you display data as a structured table within the backtest or live trading environment. It takes an array of objects, essentially a collection of rows, and presents them in an organized table format. The table's column headers are automatically determined based on all the different keys found across all the objects in your data. You provide the function with details like the bucket name, a unique ID for the dump, the actual data (the array of objects), and a description to help identify the table. It's designed to work seamlessly, handling signal resolution and mode detection automatically.


## Function dumpRecord

The `dumpRecord` function helps you save a snapshot of data related to a specific trading signal. Think of it as a way to preserve important information from your backtests or live trading sessions. It takes a record of key-value pairs and associates it with a bucket and ID, along with a description to help you understand what the record represents. The function intelligently figures out whether it's running a backtest or live trading based on its environment and handles signals automatically.

## Function dumpJson

The `dumpJson` function helps you record detailed information about your trading decisions. Think of it as a way to save a snapshot of data—like the state of your indicators or the reasoning behind a trade—in a structured JSON format.  It's designed to be linked to specific trading signals, making it easy to understand the context of that data later. This function automatically figures out whether you're running a backtest or a live trade, so you don't have to worry about configuring it differently.

It takes a single object as input that contains the bucket name, a unique dump ID, the JSON data you want to save, and a descriptive message.  The function then saves this JSON data, associating it with the correct trading signal.  This lets you reconstruct what was happening at a particular moment in your trading history.


## Function dumpError

This function lets you record details about an error that occurred during a backtest or live trading session. Think of it as a way to create a log entry specifically tied to a particular trading signal. 

It automatically figures out whether you're in a backtest or live environment and will also handle resolving any pending or scheduled signals that might be relevant to the error.  You provide information like the bucket name, a unique dump ID, the error description itself, and a more general description of the problem. This helps with debugging and understanding what went wrong.

## Function dumpAgentAnswer

This function helps you save the complete conversation history with the AI agent, linking it to a specific trading signal. 

Think of it as archiving a detailed record of the agent's reasoning for a particular trade. 

It automatically figures out whether you're in a backtesting or live trading environment and resolves the relevant signal for you, simplifying the process of saving this data. 

You provide the function with a name for the data bucket, a unique ID for the dump, the messages exchanged with the agent, and a brief description.


## Function createSignalState

This function helps you manage the state of signals within your trading strategies. It gives you two handy functions, `getState` and `setState`, that let you access and update the signal's information.

The great thing is you don't need to manually specify the signal ID – it figures it out automatically based on where your strategy is running (backtest or live).

This is particularly useful if you're building advanced strategies, like those driven by large language models, that need to track details about each trade, such as how long it's been open or its highest gain. The function is designed to work well with strategies that need to gather information over time and potentially exit trades based on those metrics.

## Function commitTrailingTakeCost

This function lets you manually set the take-profit price for a trade. It’s handy when you want to lock in a profit at a specific price level, regardless of how the price has moved since the trade was opened. 

The function cleverly figures out whether you're backtesting or trading live and automatically gets the current price to calculate the adjusted take-profit. You only need to specify the symbol and the desired take-profit price.

## Function commitTrailingTake

This function lets you fine-tune the trailing take-profit for an open pending order. Think of it as gently nudging your take-profit level based on market movement.

It’s important to understand it always calculates adjustments based on the original take-profit you set, not the current, potentially trailing, one. This helps avoid small errors from adding up over time. 

If you want to make your take-profit more conservative (closer to the entry price), use a negative percentage shift. A positive percentage shift will move it further away, making it more aggressive.

The function will only actually change the take-profit if the new level is *more* conservative than the current one. For long positions, it will only lower the take-profit. For short positions, it will only raise it.

It smartly figures out whether it's running in backtest mode or live trading mode based on where it's being used.

You'll need to provide the symbol (like 'BTCUSDT'), the percentage adjustment you want to make, and the current market price.

## Function commitTrailingStopCost

This function lets you change the trailing stop-loss price to a specific value. It simplifies setting a stop-loss by handling the calculations needed to adjust it based on the original stop-loss distance. The system figures out whether it's running a backtest or a live trading scenario and automatically gets the current price to make the calculation. You just need to provide the symbol you're trading and the new stop-loss price you want to set.

## Function commitTrailingStop

The `commitTrailingStop` function helps fine-tune your trailing stop-loss orders. Think of it as a way to dynamically adjust how far your stop-loss is from your entry price.

It's really important to understand that this function always bases its calculations on the *original* stop-loss distance you set initially – not on any adjustments made by previous trailing stop calculations. This prevents small errors from building up over time.

The `percentShift` parameter controls how much to adjust the stop-loss, with negative values bringing it closer to your entry price and positive values moving it further away. It also has a smart "absorption" feature: it only makes changes if the new stop-loss is actually better for protecting your profits. For long positions, it will only loosen the stop-loss, and for short positions, it will only tighten it.

Finally, the function intelligently knows whether it's running in a backtest or live trading environment.

You'll need to provide the trading pair's symbol, the percentage adjustment you want to apply, and the current market price.

## Function commitSignalNotify

This function lets you send out informational messages related to your trading strategy. Think of it as a way to add notes to your backtest or live trading process – it won't change your positions, but it will help you understand what's happening. You can use it to log important decisions, send alerts, or track events within a trade.

The function handles a lot of the setup for you; it knows whether you're running a backtest or live, and it automatically includes details like the strategy name, exchange, and the current price of the asset.

You simply provide the symbol you're trading and any extra information you want to include in the notification.

## Function commitPartialProfitCost

The `commitPartialProfitCost` function lets you automatically close a portion of your trading position when you've made a specific dollar amount in profit. It simplifies the process by taking a dollar amount you want to realize in profit and converting that to the appropriate percentage of your original position cost.

Essentially, it's a shortcut for partially closing a trade when you've reached a desired profit level, ensuring the price is moving in a favorable direction toward your take profit target. It handles the details of figuring out the percentage and automatically adjusts based on whether you're running a backtest or a live trade and retrieves the current price for you. 

You provide the symbol of the trading pair and the dollar amount you want to close, like closing $150 worth of your position.


## Function commitPartialProfit

The `commitPartialProfit` function lets you automatically close a portion of your open trade when the price is moving in a profitable direction, essentially moving you closer to your target profit. You specify the symbol of the trading pair and the percentage of your position you want to close, like 25% or 50%. This function is designed to work seamlessly whether you’re backtesting strategies or running live trades because it adapts to the execution environment. It’s a handy tool for locking in some profits as your trade progresses.


## Function commitPartialLossCost

This function lets you partially close a trade to limit losses, by specifying a dollar amount. It’s a shortcut that figures out the percentage of your position to close based on that dollar value.  Essentially, it helps move your trade closer to your stop-loss order.

The function handles the details of determining if the price is trending in the loss direction and retrieving the current price, so you don’t have to worry about those. You just need to tell it which trading pair you're working with and how much in dollars you want to reduce the position size. It works seamlessly whether you’re running a backtest or a live trade.


## Function commitPartialLoss

This function lets you close a portion of an open trade when the price is heading towards your stop-loss level. It's designed to help manage risk by automatically reducing your exposure on a trade that’s moving against you. You specify the symbol of the trading pair and the percentage of the position you want to close. The system handles whether it's running a backtest or a live trade for you.

## Function commitCreateSignal

This function lets you feed custom trading signals into your backtest or live trading environment. Think of it as a way to inject your own logic or external data directly into the trading process, bypassing the usual signal retrieval methods.

The signals are processed in the next tick. If you don't provide a specific price target (priceOpen), the signal is executed right away at the current price. If you *do* provide a price target, the signal will execute as soon as that price is reached, or it will be scheduled to wait for it.

Before the signal is processed, it goes through a validation check. And to keep things stable, it prevents you from sending multiple signals at once – only one signal or deferred action can be active at a time.

The function automatically adapts to whether it's running a backtest or a live trading session.

You provide the trading symbol and a data object representing your signal.

## Function commitClosePending

This function allows you to cancel a pending order without interrupting your trading strategy. Think of it as a way to clear a signal you've previously set but don't want to execute right now. 

It won't impact any other signals or the overall operation of your strategy, and it won't prevent the strategy from creating new signals. The function intelligently adapts to whether you’re in a backtesting or live trading environment.

You can optionally provide details like an ID and a note to document the reason for cancelling the pending order.


## Function commitCancelScheduled

This function lets you cancel a scheduled trading signal without disrupting your strategy’s overall operation. Think of it as hitting the pause button on a signal that's waiting to be triggered – it clears the signal that's been set but allows your strategy to keep running and generating new signals. It's useful if you want to change your mind about a planned action. Importantly, this doesn't affect any currently active signals or stop your strategy from working; it simply removes the scheduled one. The framework automatically determines whether it's running a backtest or live trading session. You can optionally include details like an ID and note in the cancellation.


## Function commitBreakeven

This function helps manage your trades by automatically adjusting your stop-loss order. It essentially aims to protect your profits by moving the stop-loss to your entry price once the trade has moved favorably enough to cover potential fees and a small amount of slippage. 

It handles the complexity of determining when to trigger this adjustment—it calculates the threshold based on pre-defined percentages for slippage and fees—and it automatically figures out whether you're in a backtesting or live trading environment. You don’t need to worry about getting the current price either; the function fetches that for you. 

Just provide the symbol of the trading pair, and it takes care of the rest, potentially reducing your risk and securing some gains.


## Function commitAverageBuy

The `commitAverageBuy` function lets you add a new buy order to your trading strategy's history, useful for dollar-cost averaging (DCA). It essentially records a purchase at the current market price, helping to build a record of how your position was accumulated.

The function also calculates and updates a running average of the entry prices, and it notifies the system that a new average buy has occurred. 

It handles whether you're running a backtest or a live trade automatically and uses a built-in method to find the current price. You just need to specify the trading pair symbol for the trade. Optionally, you can provide a cost parameter.

## Function commitActivateScheduled

This function lets you trigger a scheduled order to execute before the price actually hits the target price you initially set. It’s useful when you want to proactively manage your trades.

Essentially, you’re setting a "go" signal for the strategy. The strategy will then act on that signal during the next price update.

You need to specify the trading symbol for the order, and you can optionally include extra information like an ID or a note to help you track the trade. The framework figures out whether it's running a backtest or a live trading session automatically.

## Function checkCandles

The `checkCandles` function is a quick way to see if your historical market data (candles) are already stored and ready to be used. It efficiently verifies if the data exists without having to load everything, which saves time and resources. Think of it as a preliminary check before starting a backtest – it makes sure the data you need is there. It relies on the persistence adapter to handle the actual checking process.

## Function cacheCandles

This function helps make sure your historical price data (candles) is available where it needs to be, usually in a persistent storage location. It's designed to check if the data already exists, and if not, it automatically fetches and validates the missing data. Think of it as a way to proactively prepare your trading system with the data it needs without you having to manually download everything. The function downloads missing data, and then double-checks the data is correct. It’s like having a backup plan for your historical price information. 

It takes information about which asset (symbol), timeframe (interval), data start and end dates (from, to), the exchange providing the data (exchangeName), and functions to track progress (onCheckStart, onWarmStart) as input.

## Function addWalkerSchema

This function lets you register a new "walker" – essentially a set of instructions – that will help compare how different trading strategies perform against each other. Think of it as setting up a system to run multiple backtests simultaneously, using the same data, and then evaluating them based on a chosen performance measure. You provide a configuration object, detailing how this comparison process will work, and the function takes care of registering it within the backtest-kit framework.

## Function addStrategySchema

This function lets you tell the backtest-kit about a new trading strategy you've created. Think of it as registering your strategy so the system knows how to use it. When you register a strategy this way, the framework will automatically check it for common issues like making sure your price data is valid and your take profit/stop loss logic works correctly. It also helps prevent the system from getting overwhelmed with signals and ensures that your strategy's information is safely stored even if there are unexpected problems during live trading.

You provide the strategy's configuration details – a strategy schema – when you call this function.

## Function addSizingSchema

This function lets you tell the backtest-kit how to determine the size of your trades. It’s all about defining rules for how much capital to allocate to each trade based on factors like risk tolerance and market volatility. You provide a sizing schema, which acts as a blueprint outlining the specific sizing method, risk parameters, and any limitations on position sizes. Essentially, it’s a key component for managing risk and ensuring your trading strategy aligns with your overall investment goals.

## Function addRiskSchema

This function lets you tell the backtest-kit framework about your risk management rules. Think of it as setting up guardrails for your trading.

You'll define things like how many trades you can have running at once and even create custom checks to make sure your portfolio stays healthy – maybe checking for correlations between different assets. 

The system keeps track of all your open positions across all your strategies, so it can apply those rules consistently. Multiple strategies use the same risk rules, which helps analyze how they interact and keep everything in check.

## Function addFrameSchema

This function lets you tell the backtest-kit about a new timeframe generator it can use. Think of it as registering a way to slice up your historical data into specific time periods for testing. You provide a configuration object that outlines how these timeframes should be created – specifying the overall test period, the interval (like daily, hourly), and a function that will handle the actual generation of these timeframes. Essentially, you're giving the backtest-kit another tool to analyze your data. 

The configuration object you provide has details about the start and end dates for your backtest, the interval of your timeframes, and a function that's called to actually generate the timeframes themselves.


## Function addExchangeSchema

This function lets you tell the backtest-kit framework about a new data source for an exchange. Think of it as registering where the framework should look to get historical price data, understand the specific formatting of prices and quantities for that exchange, and calculate things like VWAP (volume-weighted average price). You'll provide a configuration object that defines these details for the exchange you want to use. This is a crucial step to enable backtesting with data from a specific exchange.

## Function addActionSchema

This function lets you register a special "action" that will be triggered during your backtest or live trading. Think of actions as automated responses to specific events happening in your strategy, like when a trade hits a profit target or a stop-loss.

They’re really useful for a bunch of things: keeping track of your trading activity, sending yourself alerts (like to Discord or Telegram), connecting to external systems, or even running custom logic based on what’s happening in your strategy.

Each time your strategy executes, a new action gets created, and it gets all the important details about what’s happening - signals, profit/loss, and more. You provide a configuration object (`actionSchema`) to tell the framework exactly what kind of action you want.
