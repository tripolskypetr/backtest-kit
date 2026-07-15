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

This function lets you save data – think of it as writing to a specific, labeled memory location – that's tied to the trading signal you're currently working with. It's a way to store information like calculated metrics, intermediate results, or any other data you need to remember during a trade simulation or live trading. The function handles the technical details of knowing whether you're in a backtest or live environment and where to send the data. You provide the name of the memory bucket, a unique ID for the memory location, the data you want to store, and a brief description to help you understand what the data represents. This data is stored as an object of any shape, but it must have properties.


## Function warmCandles

The `warmCandles` function helps speed up your backtesting by pre-loading historical candle data and storing it for quick access. It essentially downloads all the candles within a specified date range and interval (like 1-minute, 1-hour, daily) and makes them readily available. This avoids slow data fetching during the actual backtesting process, improving performance and reducing delays.  You provide it with parameters that define the starting and ending dates, and the desired candle interval.

## Function waitForReady

This function helps ensure your trading system is fully prepared before you start trading, whether it's a backtest or a live trading session. It waits patiently until all the necessary data registries—those defining exchange information, trading strategies, and historical data frames—are loaded.

For backtesting, it makes sure all three types of registries are ready. In live trading, only the exchange and strategy registries are required.

It checks these registries every second, but it won't wait forever; it has a maximum wait time. If everything loads successfully, it proceeds normally. If not, it allows the subsequent attempt to start trading to fail gracefully, so you can handle the error more clearly, such as indicating a missing strategy. You can choose whether to require a frame schema by setting the `isBacktest` parameter.

## Function validate

This function helps you double-check that everything is set up correctly before you start running tests or optimizations. It verifies that all the different parts of your trading system – like exchanges, strategies, risk management, and more – are properly registered and exist where they should.

You can choose to validate specific components, or if you leave it to its own devices, it’ll check everything for you. This is a quick way to catch configuration errors and prevent issues later on. 

Think of it as a final sanity check to ensure a smooth and reliable backtesting process. It remembers previous validations too, so it doesn’t have to do the same work repeatedly.

## Function stopStrategy

This function puts a stop to your trading strategy’s signal generation. It essentially pauses the strategy from creating new trading opportunities. Any existing signals that are already active will finish up normally.

Whether you're running a backtest or a live trading session, the system will halt gracefully at a point where it’s safe to do so – usually when it’s idle or after a signal has completed.

You tell it which trading pair (like BTC/USDT) to stop the strategy for; it figures out which strategy is associated with that symbol based on the current settings.

## Function shutdown

This function lets you properly end the backtesting process. It sends a signal that lets all parts of the system know it's time to clean up, like saving data or closing connections. Think of it as a polite way to say goodbye before the backtest finishes, especially when it's being stopped unexpectedly. It ensures everything wraps up neatly.

## Function setSignalState

This function helps manage and track the state of trading signals, particularly for complex strategies. It's designed to work with systems that need to collect data – like metrics related to trade performance – across multiple trades within a signal.

The function automatically figures out if the system is in backtesting mode or live trading mode. It handles the process of connecting the state update to the current active signal, ensuring everything's synchronized. 

If no active signal is found, the function will raise an error to let you know something went wrong.

This is useful for developing strategies that consider things like how long a trade has been open and its peak profit percentage, especially for automatically exiting trades that haven't performed as expected.

Here's what the parameters do:

*   `symbol`: Specifies the trading pair, such as "BTC-USDT".
*   `dispatch`:  A way to send the updated state information.
*   `dto`:  This is a set of data that includes the initial state value and the name of the data bucket to use.

## Function setSessionData

This function lets you store data specific to a trading symbol, strategy, exchange, and timeframe – essentially, a particular situation in your backtest or live trading. This data sticks around between candles during a single test run and can even persist if your process restarts while you’re live trading. It's perfect for things like caching information from large language models, saving the state of complex indicators, or tracking data across multiple candles that isn't directly tied to a trading signal. To remove existing data, just pass `null` as the value. The function figures out whether it's running in backtest or live mode automatically. You provide the symbol as a string, and the data you want to store (or `null` to remove it).

## Function setLogger

You can now control how backtest-kit reports its activity. This function lets you plug in your own logging system. Any messages generated by the framework, like trading decisions or errors, will be sent to your custom logger. The logger will automatically receive extra information alongside each message, such as the strategy being used, the exchange involved, and the trading symbol. This provides valuable context for debugging and analyzing your backtesting results.

## Function setConfig

This function lets you adjust the overall settings of the backtest-kit framework. You can tweak things like data handling or trading rules, providing a partial configuration object to override the default values. There's also a special "unsafe" flag; use it with caution, mainly for testing purposes, to bypass the usual checks on your configuration.

## Function setColumns

This function lets you tailor the columns that appear in your backtest reports when they're generated as markdown. It's how you can change what information is displayed, like adjusting which metrics are shown.

You provide a new configuration that partially replaces the default settings – you don’t have to define everything from scratch. 

The system checks the new column configurations to make sure they're set up correctly, but if you're in a testing environment, you can bypass those checks using the `_unsafe` flag.

## Function searchMemory

The `searchMemory` function helps you find relevant pieces of information stored in your memory system. Think of it as a powerful search tool that uses a sophisticated scoring system (BM25) to rank results. 

It takes a simple object as input, telling it which memory bucket to search and what keywords to look for. 

The function cleverly figures out whether it's running a backtest or in a live environment, and it also automatically identifies the current signal being processed. 

The result is a list of memory entries, each with a unique ID, a score indicating how well it matches your search, and the actual content of the memory entry itself. You can then use this information to make better trading decisions.


## Function runInMockContext

The `runInMockContext` function lets you execute code as if it were running within a trading strategy's environment, but without actually needing a full backtest.

Think of it as creating a controlled sandbox for your tests or scripts.

You can use it to access things like the current timeframe or other context-related services.

It's particularly helpful when you're testing logic that relies on the trading environment but don't want to run a complete backtest.

If you don't specify any details, it will create a very basic, live-like environment for testing with default placeholder names. You can customize this environment by providing values for `exchangeName`, `strategyName`, `frameName`, `symbol`, `backtest`, and `when`.

## Function removeMemory

This function helps you clean up your backtest data. It removes a specific memory entry associated with a signal, essentially deleting a record of past activity. It’s designed to work seamlessly whether you're running a backtest or a live trading scenario, automatically adjusting based on the context. To use it, you'll provide the name of the data bucket and the unique ID of the memory entry you want to remove.

## Function readMemory

The `readMemory` function lets you retrieve data stored in a specific memory location. Think of it as accessing a named container for holding information relevant to your trading strategy. 

It uses a `bucketName` and `memoryId` to identify precisely which data you want to retrieve. The function cleverly adapts to whether you're running a backtest or live trading, and figures out which signal is currently active. 

You can specify the type of data you're expecting when calling the function.


## Function overrideWalkerSchema

This function lets you modify an existing strategy's walker configuration, which is how the backtest-kit analyzes and compares different trading approaches. Think of it as fine-tuning the analysis setup without rebuilding everything from scratch. You provide a partial configuration – just the pieces you want to change – and the function updates the existing walker, leaving everything else untouched. It's useful for experimenting with different analysis parameters on a strategy you’ve already defined.


## Function overrideStrategySchema

This function lets you tweak a strategy that's already been set up in the backtest-kit. Think of it as making small adjustments – you provide only the parts you want to change, like specific settings or parameters. The rest of the original strategy remains untouched. It's a handy way to experiment with minor modifications without completely redefining a strategy from scratch. You pass in a new, partial configuration, and the function updates the existing strategy accordingly.

## Function overrideSizingSchema

This function lets you tweak a position sizing configuration that's already in use. Think of it as a way to make small adjustments without having to rebuild the entire sizing setup from scratch. You provide a partial configuration – only the settings you want to change – and it updates the existing configuration accordingly. The parts of the sizing schema you don't specify will stay the same.

## Function overrideRiskSchema

This function lets you adjust the risk management settings already set up within the backtest-kit framework. Think of it as a way to fine-tune an existing risk profile – you can change specific parts of it without having to rebuild the entire configuration. It allows you to modify only the parts you need to update, leaving the rest of the original settings untouched. You provide a partial configuration, essentially telling the system which elements you want to change.

## Function overrideFrameSchema

This function lets you tweak how a timeframe is handled during backtesting. Think of it as modifying an existing timeframe’s settings – you can adjust specific parts of its configuration. It won't replace the whole timeframe definition, only the sections you specify. This is useful when you need to make small changes to how data is processed for a particular timeframe without redefining everything from scratch. You provide a partial configuration, and the function merges it with the existing timeframe setup.

## Function overrideExchangeSchema

This function lets you modify how the backtest-kit framework interacts with a particular exchange's data. Think of it as tweaking an existing connection – you’re not rebuilding it from scratch. 

You provide a partial set of new settings, and these will be applied to the existing exchange configuration.  Anything you *don't* specify will remain as it was before. It's a convenient way to adjust things like data sources or symbol mappings without rewriting the entire exchange setup. This is useful when you need to adapt to changes in data availability or how an exchange reports information.

## Function overrideActionSchema

This function lets you tweak existing action handlers without needing to completely re-register them. Think of it as making targeted adjustments—you only change the parts you need to.

It’s handy for things like updating how events are handled, customizing callbacks for different environments like testing versus production, or even swapping out the logic used by a handler on the fly. This allows you to modify behavior without making changes to the underlying strategy itself.

To use it, you provide a partial configuration object that contains only the fields you want to update; the rest of the handler’s configuration remains as it was.

## Function listenWalkerProgress

This function lets you keep track of how a backtest is progressing. It's like having a progress report after each strategy finishes running.

You provide a function that will be called whenever a strategy completes. This function receives information about the progress.

Importantly, the updates are handled one at a time, ensuring that your progress-tracking logic doesn't get overwhelmed, even if your update function takes some time to complete. This prevents any potential performance issues caused by simultaneous execution of the callback.


## Function listenWalkerOnce

The `listenWalkerOnce` function lets you focus on a specific event happening during a trading backtest. It allows you to set up a listener that will only react once when a particular condition is met.

Essentially, you provide a filter to specify what kind of event you’re looking for, and a callback function that will execute just one time when that event occurs.

After that single execution, the listener automatically stops, so you don’t have to worry about manually cleaning up your subscriptions. It's great for situations where you need to react to a specific event and then move on. You provide the filter function to determine which events are of interest, and the callback function to handle the event once it’s detected.

## Function listenWalkerComplete

This function lets you get notified when a backtest run finishes. It's like setting up a listener that waits for the entire testing process to complete.

When the testing is done, this listener will trigger your provided function. Importantly, it ensures that these notifications happen one at a time, even if your function does something that takes a little while to finish. This helps avoid unexpected issues that could arise from running multiple completion routines simultaneously. You can unsubscribe from these notifications by calling the function that's returned by `listenWalkerComplete`.

## Function listenWalker

The `listenWalker` function lets you keep an eye on how a backtest is progressing. It's like signing up to receive updates after each strategy finishes running within a backtest. 

These updates, called "walker progress events," are delivered in the order they happen. Even if your update routine takes some time to process, the updates still come one after another, ensuring things stay organized. To prevent any hiccups, it makes sure each update is handled one at a time, making sure everything runs smoothly. You provide a function that will receive these updates, and it returns a function you can use to unsubscribe later.

## Function listenValidation

The `listenValidation` function lets you keep an eye on potential problems during risk validation. It's a way to catch errors that might occur when your trading signals are being checked.

Whenever a risk validation check fails, this function will trigger a notification.

You provide a function that gets called when an error happens. This callback receives an error object providing details.

The system ensures these error notifications are handled one at a time, even if the function you provide takes some time to complete. This helps maintain order and prevent unexpected behavior. It’s a handy tool for tracking down issues and making sure your risk validations are working smoothly.

## Function listenSyncOnce

The `listenSyncOnce` function lets you tap into a stream of synchronization events, but it only runs your provided code once when a specific condition is met. Think of it as a temporary listener that waits for something specific to happen.

It’s especially handy when you need to quickly coordinate with other systems – for instance, updating an external database immediately after a trade occurs.

You tell it what to look for using a `filterFn`, and then provide a function (`fn`) that will be executed when that condition is met. If that function involves asynchronous operations like promises, the entire synchronization process will pause until those operations are finished.  You don’t need to worry about things running out of order.


## Function listenSync

This function lets you listen for events related to signal synchronization, like when a signal is about to be opened or closed. It's particularly helpful if you need to coordinate with other systems during these processes. The provided function (`fn`) will be called whenever a synchronization event occurs, and any promises returned by that function will block further processing until resolved, ensuring things happen in the right order. You can also control whether a warning is displayed when the listener is registered. Essentially, it's a way to keep your trading system in sync with external components.

## Function listenStrategyCommitOnce

This function lets you set up a temporary listener for strategy events. You tell it what kind of events you're interested in using a filter, and then provide a function to run *only once* when that event occurs. After that single execution, the listener automatically stops listening. It's a handy way to react to a specific strategy action and then move on.

It takes two pieces of information: a filter to identify relevant events and a function to execute when a matching event happens. The function returns another function which when called will remove the listener.

## Function listenStrategyCommit

This function lets you monitor changes happening within your trading strategies, like when signals are canceled, orders are closed, or stop-loss and take-profit levels are adjusted. It's like setting up a notification system specifically for strategy management events. The cool thing is, it handles events one at a time, even if your notification processing takes some time, ensuring things stay in order and preventing issues from running multiple processes at once. You provide a function that gets triggered whenever one of these events occurs, and it will give you the details of that specific event. It also allows you to unsubscribe from these notifications whenever you need to stop listening.


## Function listenSignalOnce

This function lets you react to specific trading signals just once. You provide a filter – a test to see if a signal matches what you're looking for – and a callback function that runs when a matching signal arrives. It automatically stops listening after that one execution, so you don't have to worry about unsubscribing manually. Think of it as setting up a temporary listener that reacts only when a particular condition is met. 

It’s great for situations where you need to trigger an action based on a specific signal, but only want it to happen once.


## Function listenSignalNotifyOnce

This function lets you react to specific trading signals just once. You provide a filter to define which signals you're interested in, and then a function to execute when a matching signal arrives. Once that one signal is processed, the listener automatically stops, so you don't have to worry about manually unsubscribing. It's perfect for one-off actions based on signals.

It takes two parts: first, a way to identify which signal events you want to react to. Then, the code you want to run when one of those events happens. The function returns another function that you can call to stop the listener if needed.


## Function listenSignalNotify

This function lets you listen for notifications whenever a trading strategy sends out a signal note about an open position. Think of it as a way to be informed when a strategy wants to communicate something specific about its trading activity. The notifications are delivered one at a time, even if your code to handle them takes some time to complete, ensuring things happen in the correct order. You provide a function that will be called with details about the signal whenever it's sent. When you're done listening, the function returns another function that you can use to unsubscribe.

## Function listenSignalLiveOnce

The `listenSignalLiveOnce` function lets you temporarily listen for specific trading signals coming directly from a live simulation. 

You provide a filter – a rule to determine which signals you’re interested in – and a callback function that will execute once when a matching signal arrives. 

Think of it as setting up a temporary listener that only runs your code once for the first signal that meets your criteria, then it automatically stops listening. This is useful for quick checks or one-off actions during a live test.


## Function listenSignalLive

This function lets you hook into the live trading signals generated when you're running a backtest with `Live.run()`. It provides a way to react to each trading event as it happens, ensuring they are processed one after another in the order they arrive.  You’ll pass in a function that will be called with information about each signal, like what strategy triggered it and any relevant results. Crucially, this is specifically for live, running backtests, not historical data.  The function returns another function that, when called, will unsubscribe you from these live signals.

## Function listenSignalEventOnce

This function lets you set up a listener that reacts to a specific type of event happening within the backtest. It’s like setting a trap – you define what kind of event you're waiting for, and when it appears, your code runs once and then the listener disappears. This is really helpful if you need to respond to something like a trade opening or closing, and then you don’t want to worry about the listener anymore. 

You provide a filter to specify which events should trigger the listener. 
Then, you supply a function that will be executed when that matching event occurs. 
Once the event fires and your function runs, the listener automatically stops listening.

## Function listenSignalEvent

This function lets you tap into what’s happening with your trading signals. It allows you to be notified when a signal is initiated (either automatically or by you) or when it’s closed, such as when a take-profit or stop-loss is triggered, or when a time limit expires. 

The events are handled in the order they occur, even if your handling function needs a little time to process each one. It's a way to keep track of the full lifecycle of your signals during both testing and live trading.

You provide a function that will be called whenever a signal event happens; this function receives information about the event that occurred. When you're done listening, the function returns another function that you can call to unsubscribe.

## Function listenSignalBacktestOnce

This function lets you temporarily "listen" for specific events during a backtest run. Think of it as setting up a quick, one-time alert for when a certain condition is met. You provide a filter – essentially, a rule – to determine which events you're interested in, and then a function that will be executed only once when that rule is triggered. After that single execution, the "listener" automatically disappears, so you don't have to worry about cleaning up. It's perfect for quickly inspecting data or triggering a single action based on backtest results.

You'll only receive events generated directly from a `Backtest.run()` execution.


## Function listenSignalBacktest

This function lets you tap into the flow of a backtest and react to what's happening as it runs. You provide a function that will be called whenever a new signal event occurs during the backtest process. Importantly, these events are handled one after another, ensuring that everything is processed in the right order. This is particularly useful when you need to track progress, log data, or perform actions based on real-time events within the backtest. It only works with events generated from `Backtest.run()`. When you’re done listening, the function returns another function that you can call to unsubscribe.


## Function listenSignal

This function lets you tap into the flow of trading signals from your backtest. It's like setting up an alert that gets triggered whenever a strategy generates a signal – whether it’s deciding to wait (idle), opening a trade (opened), actively managing a trade (active), or closing a trade (closed).

Crucially, the signals are handled one at a time, even if your alert needs to do something that takes a little while. This prevents things from getting jumbled up and ensures a stable, predictable flow.

You provide a function that will be called with the details of each signal event. When you’re done listening, the function returns another function that you can call to unsubscribe and stop receiving those signals.

## Function listenSchedulePingOnce

The `listenSchedulePingOnce` function helps you react to specific events happening within the backtest-kit system, but only once they occur. It's like setting up a temporary alert.

You provide a filter that defines which events you're interested in, and a function that gets executed when a matching event is detected.

Once that event happens and your function runs, the alert automatically goes away—no need to manually unsubscribe. This makes it great for situations where you need to respond to a single, specific condition.


## Function listenSchedulePing

This function lets you listen for periodic "ping" signals that are sent while a scheduled trading signal is being monitored, essentially while it's waiting to become active. Think of it as a heartbeat indicating the signal is still being tracked.

You can provide a function that will be called with each ping event, allowing you to build custom monitoring or tracking logic. This is useful for keeping tabs on the lifecycle of a scheduled signal. 

The function returns an unsubscribe function; call this when you no longer want to receive those ping signals.


## Function listenScheduleEventOnce

This function lets you listen for specific scheduled events, but only once. It's great when you need to react to something happening on a schedule—like when a new schedule is created or an existing one is removed—and then you're done. You provide a filter to select which events you're interested in, and a callback function that will run just once when a matching event occurs. After the callback runs, the function automatically stops listening, cleaning things up for you.

## Function listenScheduleEvent

This function lets you keep an eye on when scheduled trading signals are created or canceled. You'll get notified if a signal is initially scheduled, or if it's canceled before it actually starts – for example, because the price conditions weren’t met or a user canceled it.

It's important to note that this doesn't cover the moment a signal actually *activates*; that’s a separate event handled by other listeners.

The events you receive will be processed one after another, even if your callback function takes some time to run. This ensures things happen in the expected order.

You provide a function that will be called whenever one of these lifecycle events occurs, and this function returns another function you can use to unsubscribe from receiving these events later.


## Function listenRiskOnce

The `listenRiskOnce` function lets you monitor risk rejection events and react to them, but only once. It’s like setting up a temporary alarm – it listens for a specific condition (defined by your filter), triggers an action when that condition is met, and then stops listening. This is really helpful when you need to wait for a particular risk rejection to occur and then do something specific, without continuously monitoring.

You provide a filter function that determines which events you're interested in, and a callback function that will execute when a matching event occurs. Once the callback is triggered, the listener automatically stops, preventing further executions.


## Function listenRisk

The `listenRisk` function lets you be notified when a trading signal gets rejected because of a risk check. 

It’s designed to only alert you about *rejected* signals, so you won't be overwhelmed with notifications for signals that pass the risk validation.

This function makes sure that the notifications are handled one at a time, even if your notification process takes some time to complete. It uses a queue to prevent multiple notifications from happening at the same time, ensuring your application handles them reliably.

You give it a function (`fn`) that will be called whenever a signal is rejected due to risk reasons. The function you provide will receive an object containing information about the rejected signal. The function returns another function which you can call to unsubscribe from the events.


## Function listenPerformance

This function lets you keep an eye on how long different parts of your trading strategy take to run. It's like a performance monitor that fires off events as your strategy executes.

These events contain timing data, helping you pinpoint where your strategy might be slow or inefficient.

The events are processed one at a time, even if your callback function does some work asynchronously, ensuring no races or unexpected behavior. Think of it as a neat way to profile your strategy's performance and find those areas ripe for optimization.

You provide a function that will be called whenever a performance event occurs. This callback function receives data about the specific operation's timing.


## Function listenPartialProfitAvailableOnce

This function lets you set up a one-time alert for when a specific profit level is reached during a backtest. You provide a filter – essentially, a rule – that defines what conditions need to be met. Once that condition is met, a callback function runs, and then the alert automatically stops listening. It’s great for reacting to a particular profit target being hit without constantly monitoring. Think of it as a "wait for this, then do this once" kind of setup.


## Function listenPartialProfitAvailable

This function lets you track your trading progress as you reach profit milestones during a backtest. It will notify you when your profit hits levels like 10%, 20%, or 30% of your total potential gain.

The events are delivered one at a time, ensuring things happen in order, even if your notification function takes a little time to complete. It handles this process safely, preventing multiple notifications from being triggered at the same time.

You provide a function that will be called with information about the profit event, allowing you to react accordingly. This subscription can be stopped by returning the value returned from the function call.


## Function listenPartialLossAvailableOnce

This function lets you set up a listener that reacts to changes in partial loss levels, but only once. You provide a filter – a way to specify exactly which loss conditions you're interested in – and a function that will be executed when that condition is met. Once the condition is met and the function runs, the listener automatically stops, so you don’t have to worry about managing subscriptions yourself. Think of it as a way to wait for a specific loss situation to happen and respond to it immediately.

## Function listenPartialLossAvailable

This function lets you monitor your trading strategy's losses as they happen. It sends notifications when your losses hit specific milestones like 10%, 20%, or 30% of your initial capital. 

The events are delivered one after another, even if your callback function takes some time to execute, ensuring that they are processed in the order they occurred. To prevent any issues with running your callback function simultaneously, it uses a queueing mechanism. You provide a function that will be called with details about the partial loss event.


## Function listenMaxDrawdownOnce

This function allows you to set up a temporary listener to watch for specific max drawdown events. It's like putting a watch on for a particular condition – when that condition is met, your provided function runs just once, and then the listener stops. You can use it to react to a specific drawdown level and then automatically clean up the listener afterward. 

The filter function lets you define exactly which drawdown events you're interested in. The callback function then handles that specific event. This ensures you only react when necessary and avoid unnecessary processing.


## Function listenMaxDrawdown

This function lets you be notified whenever a trading strategy hits a new maximum drawdown. Think of it as a way to keep a close eye on how much your strategy's losses are growing. When the strategy experiences a new drawdown, this function will call back to your provided function. Importantly, the callbacks are handled in order and one at a time, so you don’t have to worry about things getting out of sync. This is really useful if you want to react to drawdown changes, maybe by adjusting your risk levels. To stop listening for these events, the function returns another function you can call.

## Function listenIdlePingOnce

This function lets you set up a listener that reacts to specific "idle ping" events – these are signals about the system's activity. You provide a filter to define which events you’re interested in, and then a function that will be executed only when an event that matches your filter arrives. Importantly, this listener only runs once for the first matching event and then automatically stops listening, making it ideal for quick, one-off actions. The function returns a cleanup function that you can call to manually unsubscribe from these events if needed.

## Function listenIdlePing

The `listenIdlePing` function lets you be notified when your trading system is completely idle – meaning no signals are currently being monitored. It’s like getting a signal that everything's quiet.

You provide a function that will be called whenever this idle state occurs. This function receives an `IdlePingContract` object, which provides information about the ping event.

Importantly, the function you provide gets executed asynchronously, allowing for queued processing.

To stop listening for these idle ping events, the function returns another function that you can call to unsubscribe.

## Function listenHighestProfitOnce

This function lets you set up a listener that reacts to moments when a trade achieves a specific, highest profit level. It’s like setting a one-time alert – once the condition you define is met, the function runs your specified action and then stops listening.

You provide two things: a filter that defines when the alert should trigger (like "when the profit exceeds $1000") and the action you want to take when that condition is met (like "send me an email"). Once that condition is met, the function automatically handles the notification and then stops paying attention. This is really handy for reacting to rare, important profit milestones.

The filter function checks each profit event, and the callback function handles the single event that passes the filter.

## Function listenHighestProfit

This function lets you keep track of when a trading strategy hits a new peak profit level. It's like setting up a listener that gets notified whenever a new highest profit is achieved.

The listener ensures that these profit milestones are handled one at a time, even if the processing of one milestone requires some asynchronous operations. 

Think of it as a way to monitor your strategy's performance and potentially trigger actions based on how much profit it's making. You provide a function that gets called each time a new highest profit is reached.


## Function listenExit

The `listenExit` function allows you to be notified when a critical error occurs and halts the entire process – things like problems in background tasks within Live, Backtest, or Walker environments. This isn't for minor errors that your code might recover from; it's for situations that will stop the current operation. When an error happens, your provided callback function will be executed, ensuring that events are handled one at a time, even if your callback contains asynchronous operations. This helps maintain order and prevent unexpected behavior when dealing with these significant errors.

## Function listenError

This function helps you keep your trading strategies running smoothly, even when things go wrong. It allows you to set up a listener that will be notified whenever an error occurs during the strategy's execution – think of things like problems connecting to an API. The key is that these are errors the system *can* recover from, so the trading process doesn't completely stop. The errors are handled in the order they happen, and the way you handle each error is done one at a time to prevent any unexpected conflicts.

## Function listenDoneWalkerOnce

This function lets you react to when a background task finishes, but only once. It's helpful when you need to know when a specific type of background process concludes. You provide a filter to select the events you're interested in, and a function to execute when a matching event occurs. Once that function runs, the subscription automatically ends, preventing it from firing again.

## Function listenDoneWalker

This function lets you track when background tasks within a walker have finished. 

Think of it as a way to be notified when a series of operations, started with `Walker.background()`, are all done.

It ensures that when a task finishes, your code gets notified in the order those tasks completed. 

The callback function you provide will be executed after each task finishes, and it handles the `DoneContract` event data. To prevent issues with timing, your callback will run one at a time, even if it's an asynchronous function.


## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running within your backtest. 

It allows you to specify a condition – a filter – to only receive notifications about specific completed tasks. Once the condition is met and the callback is executed, the subscription is automatically removed, ensuring it only runs once. Think of it as a one-time alert for a particular background process completion. You provide a test to determine which events you're interested in, and then the action to take when that event happens.


## Function listenDoneLive

This function allows you to monitor when background tasks initiated by Live.background() finish running. 

It sets up a listener that gets triggered when a background task is complete, and importantly, handles these completion notifications one at a time to avoid any unexpected issues from running the notification code simultaneously. You provide a function that will be called with details about the completed task, and this function returns another function that you can call to unsubscribe from these notifications later.

## Function listenDoneBacktestOnce

This function lets you listen for when a background backtest finishes, but with a special twist – it only triggers once and then stops listening. You provide a filter function to specify which backtest completions you're interested in. Once a matching backtest completes, the provided callback function runs once with details about that completed backtest, and then the listener automatically disappears, preventing further notifications. It's perfect for actions that only need to happen one time when a specific backtest concludes.

## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. 

It’s a way to react to the completion of a backtest that's running in the background, allowing your application to proceed with further actions after the backtest is done.

The notifications are handled in the order they're received, and any asynchronous operations within your notification callback are processed one at a time, preventing any conflicts or unexpected behavior. To unsubscribe from these notifications, the function returns a function that you can call.


## Function listenCheckOnce

`listenCheckOnce` lets you temporarily listen for specific order checks, but it only runs your code once and then stops listening.  It's really handy when you need to quickly grab information from the trading system and sync it with something else, like an external database. If your code encounters an error, it tells the system that the trade isn't active anymore until your code finishes. You provide a filter to select which order checks you're interested in, and a function to handle the selected check just once.  You can even make that function asynchronous, and the system will wait for it to complete before continuing.

## Function listenCheck

The `listenCheck` function lets you monitor the status of a trading signal by listening for specific events. It's designed to help you coordinate your trading logic with external systems or handle potentially slow operations.

If something goes wrong within your monitoring function, it automatically marks the related order as closed, preventing further actions.

You’ll receive events – “active” for open positions and “schedule” for pending orders (though backtesting won't generate "schedule" events). These events happen before the order's completion is evaluated, giving you a heads-up about the signal's current state.

The function gives you a way to unsubscribe when you no longer need to listen, effectively stopping the monitoring process.


## Function listenBreakevenAvailableOnce

This function allows you to monitor for specific breakeven protection events, but it only runs your code once when a matching event occurs. It's like setting up a temporary alert – you define what kind of event you’re looking for (using a filter), and when that event happens, your provided function runs and handles it. Then, the alert automatically disappears, preventing repeated executions. This is handy when you need to react to a particular breakeven condition just one time.

You provide two pieces of information: a filter that describes the events you want to receive, and a function that will be executed when a matching event is found. The function handles the specific event data and then automatically stops listening, ensuring it runs only once.


## Function listenBreakevenAvailable

This function lets you monitor when a trade's stop-loss automatically adjusts to the entry price, essentially protecting your profits. It's triggered when the price has moved enough in your favor to cover any fees associated with the trade.

The function provides a way to subscribe to these breakeven events, and makes sure your callback function always runs one at a time, even if it takes a bit of time to complete.  You give it a function to run when a breakeven event occurs, and it returns a function you can use to unsubscribe from those events later.


## Function listenBeforeStartOnce

This function allows you to react to specific events that happen just before a backtest starts, but only once. You provide a filter – a way to select which events you're interested in – and then a function that will be executed once when a matching event occurs. After that single execution, the subscription is automatically cancelled, so you don't have to worry about cleanup. 

Essentially, it’s a one-time listener for events occurring right before the backtest begins.


## Function listenBeforeStart

This function lets you listen for events that happen right before a trading strategy begins running for a specific asset. 

Think of it as a heads-up notification just before the engine kicks off a new trading cycle.

The events are handled one at a time, even if your code takes some time to process, ensuring things stay in order and don't interfere with each other. This is useful if you want to prepare something before the actual trading begins.

You provide a function that will be called whenever this event occurs, and the function handles the specific event data. The function you provide will also return a function which can be used to unsubscribe.

## Function listenBacktestProgress

This function lets you keep an eye on how your backtest is progressing. It's like setting up a listener that gets notified as the backtest runs.

These notifications, called "progress events," are sent while the backtest is performing calculations in the background. 

The important thing is that these notifications are handled one at a time, even if your callback function takes some time to process each event. This makes sure things stay organized and prevents any unexpected issues caused by running things at the same time.

You provide a function (`fn`) that will be called each time a progress event occurs, and this function receives details about the current progress. The function returned by this `listenBacktestProgress` function is used to unsubscribe the listener.


## Function listenAfterEndOnce

This function lets you react to specific events that happen after a trading period concludes, but only once. It's great for things you need to do just one time after a backtest or simulation finishes, like cleaning up resources or performing final calculations. You provide a filter – a way to identify the exact events you're interested in – and a callback function that will be executed when a matching event occurs. Once that single event has been processed, the subscription automatically ends, so you don't have to worry about managing it yourself.

It works by:

*   First, you give it a filter function that checks each event to see if it matches what you need.
*   Then, you give it a callback function – this is the code that will run when a matching event is found.
*   Finally, it automatically stops listening after the callback has run once.


## Function listenAfterEnd

This function lets you tap into what happens after a trading strategy has finished running for a particular asset. It’s like getting a notification once the engine is completely done with a strategy's execution. 

The cool thing is, any code you put inside your notification function will run one at a time, ensuring things are handled in a neat and orderly fashion, even if that code itself takes some time to complete. It uses a queue to manage this.

You provide a function as input; that function will be called whenever the engine signals it’s finished processing a strategy for a symbol. This allows you to trigger actions or clean up tasks after the main strategy run is complete.


## Function listenActivePingOnce

This function helps you react to specific active ping events, but only once. You provide a filter to identify the events you're interested in, and a function that will run when a matching event occurs. After that single execution, the listener automatically stops, so you don't need to worry about manually cleaning up your subscriptions. It's perfect for situations where you need to wait for a particular condition to be met and then take action.

The first argument is a function that decides if an event is relevant. The second argument is the action to take when a relevant event is found, and this function will only be called once.

## Function listenActivePing

This function lets you keep an eye on active signals within your backtest. It listens for events that happen every minute, giving you a way to monitor how signals are changing and react to those changes. 

Think of it as a way to get notified when things are happening with your signals, so you can adjust your strategies accordingly.

The events you receive are handled one at a time, even if the function you provide takes some time to process, ensuring things stay organized. This prevents multiple actions from occurring at the same time. You simply provide a function that will be called whenever a new active ping event occurs, and the function will return a method that unsubscribes from the event when no longer needed.

## Function listWalkerSchema

This function provides a way to see all the different trading strategies or "walkers" that have been set up in your backtest-kit system. It essentially lists all the available strategies you can use for backtesting. Think of it as a directory of all your custom trading logic. This is helpful for understanding your overall setup, troubleshooting, or even creating tools that automatically display the options available.


## Function listStrategySchema

This function lets you see a complete list of all the trading strategies that have been set up and are ready to use within the backtest-kit framework. Think of it as a way to inventory all the different approaches you've defined for testing. It’s handy if you need to double-check what's available, generate documentation, or build a user interface that lets you pick and choose strategies. The result is a simple list of strategy descriptions.

## Function listSizingSchema

This function lets you see all the sizing strategies that are currently active within your backtest kit setup. It essentially gives you a peek under the hood to understand how your positions are being sized. Think of it as a way to verify your sizing configurations or to create tools that dynamically show how different strategies affect your trades. It returns a list of sizing schemas, providing detailed information about each one.

## Function listRiskSchema

This function lets you see all the risk configurations that have been set up within the backtest-kit framework. Think of it as a way to peek under the hood and see how risk is being managed. It returns a list of these configurations, which is handy for troubleshooting, creating documentation, or building user interfaces that need to display risk-related information. You can use this to get a comprehensive view of your risk setup.


## Function listMemory

This function lets you peek into the memory associated with your trading signal. Think of it as checking what data has been stored and is ready to be used.

It retrieves a list of memory entries, each containing a unique identifier and the actual data stored. 

The function intelligently figures out which signal it's dealing with and whether you're in backtesting or live trading mode, so you don't have to worry about those details.

You just need to provide the name of the bucket you're interested in to get the list. 


## Function listFrameSchema

This function helps you discover all the different data layouts (called "frames") that your backtesting environment uses. It's like getting a catalog of all the tables and their structures. You can use this to check what data is available, build tools to display this information, or simply understand how your backtest is organized. It returns a list of these frame schemas, giving you access to their definitions.

## Function listExchangeSchema

This function helps you discover all the exchanges your backtest-kit setup is using. It returns a list of their configurations, which is handy for troubleshooting, generating documentation, or building interfaces that adapt to different exchanges. Think of it as a way to see what exchanges are available for your backtesting environment. You can use it to understand what data sources are being utilized.

## Function hasTradeContext

This function lets you quickly determine if the environment is set up correctly for trading actions. It verifies that both the execution and method contexts are active. Think of it as a safety check – it ensures you can safely use functions that interact with the exchange, such as getting historical data or formatting prices, before proceeding. If it returns true, you’re good to go; otherwise, you'll need to make sure the necessary setup is complete.

## Function hasNoScheduledSignal

This function, `hasNoScheduledSignal`, helps you determine if a scheduled trading signal currently exists for a specific trading pair, like BTC-USDT. It returns `true` if no such signal is active, essentially confirming there's nothing currently planned to trigger a trade. You can use this to safely control when your trading signal generation logic runs, ensuring it doesn’t interfere with existing scheduled signals. It automatically adjusts its behavior depending on whether you’re running a backtest or a live trading environment.

To use it, you simply provide the symbol of the trading pair you're interested in.


## Function hasNoPendingSignal

This function, `hasNoPendingSignal`, helps you ensure that you're not generating new trading signals when one is already in progress. It checks if there's a pending signal for a specific trading pair, like 'BTCUSDT'. If it finds no pending signal, it returns `true`, allowing your code to proceed with signal generation. Conversely, if a pending signal *does* exist, it returns `false`, preventing unwanted signal creation. It smartly adapts to whether you're running a backtest or live trading session. You provide the symbol of the trading pair you're interested in to this function.

## Function getWalkerSchema

This function helps you find the blueprint or definition for a specific trading strategy or "walker" within the backtest-kit system. Think of it like looking up the instructions for a particular type of robot. You provide the name of the walker you’re interested in, and it returns a detailed schema outlining how that walker operates and what data it uses. This schema describes the walker's inputs, outputs, and internal logic.


## Function getTotalPercentHeld

This function tells you what percentage of your initial position remains open for a specific trading pair. Think of it as a way to see how much of your original investment is still active, without considering any partial closures. A value of 100 means you haven't closed any part of the position, while 0 means it’s completely closed. It automatically handles situations where you've added to your position over time using dollar-cost averaging (DCA) and then closed it partially.

It’s essentially the same as using `getTotalPercentClosed`, offering another way to view your position status.

You provide the trading pair's symbol, like "BTCUSDT," to get the percentage.

## Function getTotalPercentClosed

This function helps you understand how much of a trading position is still open. It tells you the percentage of the original position size that hasn't been closed out, ranging from 100% (meaning the entire position is still active) to 0% (meaning everything has been closed). It takes into account any trades you've made to gradually close the position, even if those were done in stages, like with a dollar-cost averaging (DCA) strategy. It's designed to work seamlessly whether you're running a backtest or a live trade because it figures out the context automatically. You just need to provide the trading pair symbol, like "BTCUSDT," to get the percentage.

## Function getTotalCostClosed

This function helps you figure out how much you’ve spent in total on a particular cryptocurrency or asset you're holding. It calculates the cost basis, essentially the average price you paid, even if you bought it in smaller chunks over time (like with dollar-cost averaging). 

It understands whether you're running a backtest (looking at historical data) or a live trading session and adjusts accordingly. To use it, you simply need to provide the symbol, like "BTCUSDT", to get the total cost in dollars.

## Function getTimestamp

This function provides a way to get the current timestamp, and its behavior changes depending on whether you're running a backtest or in live trading mode. During a backtest, it returns the timestamp associated with the timeframe being analyzed. When you're trading live, it gives you the actual current time. It's a convenient way to know what time it is within your trading process.

## Function getSymbol

This function allows you to retrieve the symbol you're currently trading, like "AAPL" or "BTCUSDT." It's really straightforward - just call it, and it will return a promise that resolves to the symbol string. This is useful if you need to know which asset your trading logic is operating on.

## Function getStrategyStatus

This function lets you peek into the current state of a trading strategy as it's running. It's like taking a snapshot of what's happening behind the scenes – things like any signals that are waiting to be processed, actions users have requested, and the order in which they're all happening.

You provide the trading pair symbol (like "BTCUSDT") to specify which strategy you're interested in.

The function retrieves this information, providing insight into the strategy's operational status, and it figures out whether the backtest is running in a simulation or a live environment automatically.


## Function getStrategySchema

The `getStrategySchema` function lets you fetch the detailed blueprint for a specific trading strategy. Think of it as looking up the definition of how a particular strategy works within the backtest-kit system. You provide the strategy's unique name, and the function returns a structured object describing its configuration options and behavior. This schema provides all the information needed to understand and potentially modify a strategy.


## Function getSizingSchema

This function lets you fetch the specific rules and logic for how much to trade, based on a given name. Think of it as looking up the blueprint for a particular trading sizing strategy. You provide the name of the sizing strategy you want, and it returns all the details about that strategy. This helps in understanding and configuring your trading system's risk management.


## Function getSignalState

The `getSignalState` function allows you to retrieve a specific state value associated with the currently active trading signal. It automatically identifies whether you’re in a backtest or live trading environment.

It finds the active signal, either pending or scheduled, and will let you know if it can't find one.

This function is particularly useful for advanced strategies, like those using Large Language Models, that need to track data like maximum profit and how long a trade has been open, across multiple trades. It’s designed to help optimize strategies that aim for modest profits with limited risk, and to quickly exit trades that aren’t performing as expected.

You provide a trading symbol and a data transfer object containing the initial value and bucket name for the state you want to retrieve. The function then returns a promise that resolves with the state value.

## Function getSessionData

This function lets you retrieve data that's specifically tied to a trading session. Think of it as a way to store information that lasts throughout a backtest or live trading run, even if the program restarts.

It's perfect for things like caching results from complex calculations, holding onto temporary data for indicators, or tracking information across multiple candles.

You provide the trading symbol (like "BTC-USDT") and it returns the associated session data, or `null` if no data exists. 

The function intelligently knows whether it's in backtest or live mode and handles the data retrieval accordingly.

## Function getScheduledSignal

This function lets you retrieve the signal that's been pre-programmed to trigger trades for a specific asset, like "BTCUSDT". It's designed to check if a scheduled signal is currently running. If no signal is active, it will return nothing. The system intelligently figures out if it's running a test backtest or a live trading environment. You just need to provide the trading pair's symbol.

## Function getRuntimeInfo

This function gives you essential information about how your backtest or trading strategy is currently running. It tells you things like which asset you're trading, which exchange is being used, the timeframe of your data, the strategy in action, and whether you're in a backtesting environment or live trading. Think of it as a quick status report on your current trading execution. You can customize it to provide information relevant to your specific data type as well.

## Function getRiskSchema

This function helps you find the specific details of a risk management strategy you've set up. Think of it as looking up a blueprint for how a certain type of risk is handled. You provide the name of the risk you’re interested in, and it returns a structured description outlining how that risk is managed within the system. This allows for a clear understanding of the risk mitigation approach.

## Function getRemainingCostBasis

This function, `getRemainingCostBasis`, helps you figure out how much of your investment in a particular asset, like a stock or cryptocurrency pair, remains unclosed. It tells you the dollar value of the portion you still hold, even if you've already sold off some of your initial purchase in smaller amounts. It factors in how you built your position over time through dollar-cost averaging (DCA), making sure the calculation is accurate when you’ve made multiple purchases. Essentially, it’s another way to look at how much of your original cost basis is still active. The function takes the trading symbol as input, like "BTC-USD".

## Function getRawCandles

The `getRawCandles` function allows you to retrieve historical candle data for a specific trading pair and time interval. You can control how many candles you get and the time period you’re interested in.

You can specify a start and end date, along with a limit on the number of candles, or just provide a limit to fetch candles from the past. The function intelligently handles the date calculations when you provide only some of the date parameters.

The function ensures that it fetches data without looking into the future, preventing biased results. 

Here’s what the parameters do:

*   `symbol`: The trading pair you're interested in, like "BTCUSDT".
*   `interval`: The time frame for each candle, like "1m" for one-minute candles.
*   `limit`: The maximum number of candles you want to retrieve.
*   `sDate`: The starting date for the data, in milliseconds.
*   `eDate`: The ending date for the data, in milliseconds.

## Function getPositionWaitingMinutes

This function helps you check how long a pending trade signal has been waiting to be executed. It tells you the number of minutes the system has been holding back on acting on a signal.

If there isn't a signal waiting, it will return nothing.

To use it, you just need to provide the trading pair symbol, like "BTCUSDT," and it will give you the waiting time.


## Function getPositionPnlPercent

This function helps you understand how much profit or loss you're currently experiencing on an open trade. It calculates the percentage of unrealized profit or loss for a specific trading pair, taking into account things like partial closes, how you built your position (DCA), potential slippage, and trading fees. If there isn't an active trade in progress, it will return null. 

The function automatically figures out whether you're in a backtesting simulation or a live trading environment, and it also automatically retrieves the current market price. 

To use it, just provide the symbol of the trading pair you’re interested in, for example, "BTCUSDT".


## Function getPositionPnlCost

This function helps you figure out the unrealized profit or loss, in dollars, for a trade you're currently holding. It considers things like how much you invested initially, any partial closes you've made, and even factors in potential slippage and fees. 

If you don't have any active trades, it will return null. 

It's smart enough to know if you're running a backtest or a live trade and will automatically grab the current market price to make the calculation. You just need to tell it which trading pair you're interested in.

## Function getPositionPartials

This function lets you see how your trades have been partially closed for profit or loss. It provides a history of partial closures triggered by actions like `commitPartialProfit` or `commitPartialLoss`.

If you haven't started a backtest or no signal is active, the function will return null. If there are no partial closures recorded yet, it will return an empty list.

For each partial closure, you'll get details like the type (profit or loss), the percentage of the position closed, the price at which it was closed, the cost basis at the time, and the number of entries included in the partial. The function needs the symbol of the trading pair you're interested in.

## Function getPositionPartialOverlap

This function helps avoid accidentally closing parts of your positions multiple times at similar prices. It checks if the current market price is close enough to a previously executed partial close order.

Essentially, it determines if a new partial close order would overlap with an existing one.

You provide the trading symbol and the current price, and optionally a custom tolerance range. The function then calculates a price range around the existing partial close prices, based on percentages you provide.

If the current price falls within that range, it means there's a potential overlap, and the function returns true, warning you to reconsider. Otherwise, it returns false, indicating that a partial close is likely safe. This function is useful for preventing unwanted order executions and ensuring a more controlled trading process.

## Function getPositionMaxDrawdownTimestamp

This function helps you find out when a specific trading position experienced its biggest loss. It looks at the history of a particular trading pair, like BTC/USD, and tells you the exact timestamp (a date and time) when the price reached its lowest point for that position. If there's no open or recent position for that trading pair, the function will indicate that by returning null. Basically, it's a way to pinpoint the moment a position saw its maximum drawdown.


## Function getPositionMaxDrawdownPrice

This function helps you understand the maximum drawdown experienced by a specific trading position. It essentially tells you the lowest price a position hit while it was open, providing insight into how much it lost at its worst point. If there's no active signal related to that position, the function won't return a value. You provide the symbol of the trading pair (like "BTC/USDT") to get the drawdown information.

## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand the risk profile of a specific trading position. It tells you the percentage of profit or loss you experienced at the point when the position was at its lowest value. Essentially, it's a snapshot of the worst performance the position saw.

To use it, you simply provide the symbol of the trading pair you're interested in, like "BTC-USDT".

The function returns a number representing that percentage, or `null` if there’s no signal currently active for that symbol.

## Function getPositionMaxDrawdownPnlCost

This function helps you understand the financial impact of a trading position’s biggest loss. It calculates how much money you would have lost (in the currency of the traded asset) at the point when the position hit its lowest value.

Essentially, it tells you the PnL cost associated with the maximum drawdown experienced by a specific trading pair. 

If there's no signal currently active for that pair, it won't be able to provide a value and will return null.

You need to specify the trading pair, like "BTC-USD", to get the information.


## Function getPositionMaxDrawdownMinutes

getPositionMaxDrawdownMinutes tells you how much time has passed since your position experienced its biggest loss. Think of it as a measure of how long ago things went south for a particular trade. The number represents minutes, and if the loss just happened, the number will be close to zero. If you don't have any active trades for that symbol, it won’t be able to provide a value. You need to specify the trading pair, like 'BTC-USDT', to get the drawdown time.

## Function getPositionLevels

getPositionLevels helps you see the prices at which your trades for a particular asset were placed. It gives you a list of prices, starting with the original entry price, and including any subsequent prices added when you used commitAverageBuy to add more to your position. If there's no open trade, it will return null. If you made just the initial trade and didn't add any more, you'll get a simple list containing just that initial price. You provide the symbol, like "BTCUSDT," to tell it which asset you're interested in.

## Function getPositionInvestedCount

This function tells you how many times you've added to a particular trade using dollar-cost averaging (DCA). It essentially counts the number of 'steps' you've taken to build up a position after the initial trade. 

A value of 1 means you only made the first purchase, while a higher number means you’ve used `commitAverageBuy()` multiple times. 

If there's no trade currently in progress, it will return null. You give it the symbol of the trading pair (like BTCUSDT) to see the count for that specific trade. It automatically knows whether you're running a backtest or live trading.


## Function getPositionInvestedCost

This function helps you figure out how much money you've invested in a particular trading pair. It calculates the total cost of getting into a position, considering all the buy orders that have been committed. 

If there's no active trading signal right now, it will return null. It intelligently adapts to whether you're running a backtest or a live trading environment. 

You simply need to provide the symbol of the trading pair you're interested in, like "BTCUSD". The result is the total dollar amount invested, based on the entry costs recorded when those orders were committed.


## Function getPositionHighestProfitTimestamp

This function helps you find out when a specific trade reached its most profitable point. 

You give it the symbol of the trading pair – like 'BTCUSDT' – and it tells you the exact timestamp (a number representing the date and time) when the trade was at its peak profit.

If there’s no trading activity recorded for that symbol, it won't return a timestamp.


## Function getPositionHighestProfitPrice

This function helps you find the highest price your position has reached while making a profit. 

Think of it as a record-keeper tracking how well your trade is doing. It starts at the price you bought or sold at and then updates whenever the price moves favorably—higher for long positions and lower for short positions. 

It will give you a number representing that peak profit price. You won't get nothing back, because even a brand new position started with its entry price. 

You just need to tell it which trading pair you're looking at (like 'BTC/USDT').

## Function getPositionHighestProfitMinutes

This function helps you understand how long a particular trading pair has been operating since it reached its most profitable point. 

Essentially, it tells you how far away the current price is from the best price the position has ever seen. 

The result is given in minutes, and it's a useful indicator of how the trade's performance has evolved over time.

If there are no signals for the specified trading pair, the function will return null.

You provide the trading pair symbol (like "BTCUSDT") as input.


## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your current trading position is from its best possible performance. It calculates the difference between the highest profit percentage achieved so far and the current profit percentage, ensuring the result is never negative. Think of it as measuring how much "wiggle room" you had for profit. 

If there isn’t a pending signal for the trade, this function won't be able to provide a result.

You provide the trading pair symbol, like "BTC-USDT", and it gives you back a number representing that distance.

## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your current trading position is from its most profitable point. It calculates the difference between the highest profit you could have made and what you've currently made, but only considers the positive difference—essentially, how much further you could have gone to maximize your profit. If there isn't a trading signal associated with the position, the function won't return a value. You provide the trading pair symbol (like 'BTC-USDT') to specify which position you're interested in.

## Function getPositionHighestProfitBreakeven

This function helps determine if a trade ever reached a breakeven point after achieving its maximum potential profit. 

It checks if, at the highest price a trade could have reached, it would have also mathematically broken even.

If there are no active trading signals for a specific trading pair, the function will return null.

You provide the symbol of the trading pair you’re interested in, like "BTCUSDT".

## Function getPositionHighestPnlPercentage

This function helps you understand how well a specific trade has performed. It looks at a past trading position and finds the highest percentage profit it ever achieved during its lifetime. Essentially, it tells you the peak profitability of that trade. 

You give it the symbol of the trading pair (like BTC-USD), and it returns a number representing that highest profit percentage.

If there’s no trading data available for the given symbol, the function will return null.

## Function getPositionHighestPnlCost

This function helps you understand the financial impact of a trading position. Specifically, it tells you how much profit or loss was incurred when the position reached its most profitable point. 

It takes the trading symbol, like "BTCUSDT", as input.

The function returns a numerical value representing that cost, expressed in the quote currency (the currency used to measure the profit/loss).

If there’s no signal associated with the position, it returns null, meaning it can't calculate the highest profit cost.

## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand how risky a trading position has been. It calculates the largest drop in percentage profit a position has experienced, comparing it to its current profit. The result tells you how far the position fell before recovering, expressed as a percentage.

Essentially, it shows you the "worst-case" scenario relative to where the position stands now.

If there's no ongoing trade, the function won't be able to provide a result. 

You need to specify the trading symbol (like BTC-USD) to get this information for a specific position.

## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand the potential risk in a trading position. It calculates how far the current profit or loss is from the lowest point it reached during a drawdown. Essentially, it tells you the "worst-case" scenario from the current point, relative to the lowest point seen so far. 

If there's no active trading signal for a specific symbol, the function won't be able to calculate this and will return a null value.

You need to provide the trading symbol (like "BTCUSDT") as input to get the drawdown information.


## Function getPositionEstimateMinutes

This function helps you understand how long a trading position is expected to last. It gives you an estimate of the original duration set for a pending signal, essentially telling you how many minutes the position was planned to be open before a timeout. 

If there isn't a signal currently being tracked, the function will return null. You provide the trading symbol, like 'BTC-USDT', to get the estimate for that specific pair. This is useful for keeping track of how long signals are expected to remain active.

## Function getPositionEntryOverlap

This function helps you avoid accidentally making multiple DCA (Dollar Cost Averaging) entries at roughly the same price. 

It checks if the current market price is close to a previously defined DCA entry level, considering a small tolerance range.

You provide the trading symbol and the current price, and the function will tell you if the price falls within that acceptable range. 

If the price *is* within the zone of an existing DCA level, it returns `true`, indicating a potential overlap. If there are no existing DCA levels, it returns `false`.

You can customize the tolerance zone—how much price fluctuation is considered acceptable—using the optional `ladder` parameter, which specifies percentages for the upper and lower bounds of the tolerance.


## Function getPositionEntries

This function lets you see the details of how a trade was built up, especially useful if you’re using dollar-cost averaging (DCA). It shows a list of each individual buy order that contributes to the current signal, giving you the price and cost for each one. If there's no ongoing trade being built, it will simply return nothing. If the trade was started but no more DCA orders were added, you'll get a list with only one entry. You provide the trading pair, like "BTCUSDT," to get the information specific to that pair.

## Function getPositionEffectivePrice

This function helps you determine the average price at which you’ve acquired a position based on the backtest kit’s internal calculations. It factors in any DCA (Dollar-Cost Averaging) entries you’ve made, providing a weighted average that reflects your overall cost. 

If you've had partial closes of your position, the calculation becomes more complex, considering the cost basis at the time of each partial. Ultimately, it aims to give you a clear picture of your entry price, reflecting all your trading activity. 

If there isn't an active trading signal, the function will return null. It figures out whether it's running in a backtest or live trading environment automatically. 

You simply need to provide the trading pair symbol to get the effective price.


## Function getPositionDrawdownMinutes

getPositionDrawdownMinutes tells you how long a trade has been losing ground since it initially made a profit. It's essentially a timer counting up from the moment your position reached its highest profit point. 

If the price is still at its highest point, the value will be zero. As the price drops, this number increases, showing how far from that peak your position now is.

The function requires you to specify the trading pair symbol. It will return null if there are no current trade signals.

## Function getPositionCountdownMinutes

getPositionCountdownMinutes tells you how much time is left before a position closes. It calculates this by looking at when the position was marked as pending and comparing it to an estimated expiration time.

If the estimated time has already passed, it will tell you zero, meaning the position has essentially expired. You won’t get a negative number back – the countdown always starts at zero. 

If there's no pending signal for the specified trading pair, the function will return null, indicating there's nothing to countdown. You need to provide the trading symbol (like 'BTC-PERP') as input to check a specific position.

## Function getPositionActiveMinutes

This function helps you figure out how long a particular trade has been running. It tells you the number of minutes since the position was opened. 

If there isn't a trading signal currently waiting, it won't return a number, instead returning null.

You just need to give it the symbol of the trading pair you’re interested in, like "BTCUSDT".

## Function getPendingSignal

This function lets you check if your trading strategy has an outstanding, pending signal. It tells you what signal is currently waiting to be executed.

If there's nothing waiting, it will simply report back that there is no pending signal.

It handles the difference between backtesting and live trading automatically.

You provide the symbol, like "BTCUSDT," and it returns the information about the pending signal, or null if nothing is waiting.

## Function getOrderBook

This function lets you retrieve the order book for a specific trading pair, like BTCUSDT, from the connected exchange. 
You can specify how many levels of the order book you want to see – a larger depth provides more detail.
The function automatically uses the current time when requesting the order book, which is important for accurate backtesting or real-time trading. 
Keep in mind that the exchange might handle the timing information differently depending on whether you're in a backtest or live trading environment.

## Function getNextCandles

This function helps you retrieve future candles for a specific trading pair and time interval. 

It's designed to get candles that come *after* the current point in time of your backtest or live execution. 

You provide the symbol (like "BTCUSDT"), the candle interval (such as "1h" for one-hour candles), and how many candles you want to fetch. The function then uses the underlying exchange's methods to get those candles. This is essential for simulating how a trading strategy would behave looking into the future.


## Function getMode

This function tells you whether the system is running a backtest (analyzing historical data) or a live trading session. It's a simple way to check the current operational status. The function returns a promise that resolves to either "backtest" or "live".

## Function getMinutesSinceLatestSignalCreated

This function tells you how long, in minutes, it's been since the last trading signal was generated for a specific trading pair. 

It doesn't care if that signal is still active or if it's already closed; it just looks at the timestamp of the most recent signal.

This can be really helpful for setting up rules like cooldown periods after a stop-loss is triggered.

If no signals have ever been created for a particular pair, it will return null. 

It automatically knows whether it’s running in backtest mode or live mode, so you don't have to specify.

You just need to provide the trading symbol, like "BTCUSDT."

## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand how risky a trading strategy has been. It calculates the largest drop from the highest point of profit to the lowest point of loss, expressed as a percentage. Think of it like measuring the 'distance' between the best and worst performance of your strategy. 

It uses the trading pair symbol you provide to look at the historical data. 

If the strategy hasn't generated any signals yet, it won't be able to calculate this value and will return null.


## Function getMaxDrawdownDistancePnlCost

This function helps you understand the risk exposure of a trading strategy by calculating the maximum drawdown distance based on profit and loss. It essentially measures how far a trading position’s profits fell before reaching its lowest point. 

The result represents the difference between the highest profit achieved and the deepest loss experienced, ensuring a non-negative value. 

You provide the trading pair symbol (like 'BTCUSDT') as input, and the function returns a number representing this drawdown distance. It will return nothing if there's no trading signal available.


## Function getLatestSignal

This function helps you find the most recent trading signal for a specific asset. It doesn't care whether that signal led to an open or closed position; it just gives you the latest one recorded. 

Think of it as a way to implement cooldown periods – for example, preventing new trades for a set time after a stop-loss event. It looks for signals first in the historical backtest data and then in real-time data if nothing's found. If no signals exist for that asset, it will return nothing. It figures out whether you're in a backtest or live trading environment automatically.

You provide the trading pair symbol (like BTCUSDT) to specify which asset you're interested in.

## Function getFrameSchema

This function lets you look up the blueprint for a specific frame used in your backtest. Think of a frame as a building block in your trading strategy – it defines what data it needs and how it operates.  You give it the name of the frame you're interested in, and it returns a description detailing that frame's structure and expected data.  This helps ensure everything is set up correctly and consistently within your backtesting environment. The `frameName` uniquely identifies which frame's details you want to see.

## Function getExchangeSchema

This function helps you access details about different cryptocurrency exchanges that backtest-kit knows about. Think of it as looking up the blueprint for how a specific exchange works – things like what order books look like, how trades are structured, and other important technical aspects. You provide the name of the exchange, and it gives you back a structured object containing all that information. This is useful for understanding and configuring your backtesting strategies to accurately reflect real-world exchange behavior.

## Function getDefaultConfig

This function gives you a set of sensible default settings for the backtest-kit trading framework. Think of it as a starting point for your own custom configuration. It provides values for things like how often the system checks for new signals, limits on data retrieval, settings related to order placement, and controls for reporting and notifications. Looking at these defaults is a good way to understand all the different ways you can tweak the framework's behavior.

## Function getDefaultColumns

This function gives you the default setup for the columns used in your backtest reports. It provides a set of pre-defined columns for various data types like strategy results, heatmaps, live data, and performance metrics. Think of it as a template showing you all the column options that can be used and how they're usually configured, which is helpful for understanding and customizing your reporting. You can look at the returned values to see what's possible and tailor your reports exactly how you need them.

## Function getDate

This function, `getDate`, gives you the current date depending on whether you're running a backtest or in live trading mode. When backtesting, it returns the date associated with the timeframe you're analyzing. If you're trading live, it provides the actual current date. It’s a simple way to know what date your calculations and decisions are based on.

## Function getContext

This function provides access to information about the currently running process, like which method is active and any relevant data associated with it. Think of it as a way to peek behind the scenes and understand the environment in which your trading logic is operating. The result is a promise that resolves to a context object, holding details that can be useful for debugging or dynamic adjustments.

## Function getConfig

This function lets you peek at the system's global settings. It's like checking the preferences for how the backtesting framework operates.

It provides a snapshot of values that control things like how frequently data is fetched, limits on calculations, and various display options for reports. 

Importantly, this snapshot is a copy, so any changes you make won't affect the actual running configuration. It's a safe way to see what’s happening under the hood.

## Function getColumns

This function provides a snapshot of how your backtest data will be displayed in the report. 

It gives you access to column definitions for various data types, including strategy results, performance metrics, risk indicators, and more. 

Think of it as a way to see exactly which pieces of information are being used to build your report, and how they are organized. The returned configuration is a copy, so your changes won't affect the core configuration itself.

## Function getClosePrice

This function lets you easily retrieve the closing price from the most recent candle for a specific trading pair and time interval. You tell it which asset you're interested in, like "BTCUSDT," and how frequently the candles are, for example, "1m" for one-minute candles. It will then give you the closing price of that last completed candle. This is helpful for quickly checking the latest price action without needing to download a lot of historical data.

## Function getCandles

This function allows you to retrieve historical price data, or "candles," for a specific trading pair from the connected exchange. You tell it which symbol you want data for, like "BTCUSDT" for Bitcoin against USDT, and the timeframe you're interested in, such as 5-minute or hourly candles. You also specify how many candles you need – for example, requesting the last 100 candles. The function then pulls that data from the exchange’s system to give you a look into past price movements. 

It’s a straightforward way to access historical market data within the backtest-kit framework.


## Function getBreakeven

This function helps determine if a trade has become profitable enough to cover associated costs. It calculates a threshold based on slippage and fees, and then checks if the current price has exceeded that threshold. You provide the trading symbol and the current price, and the function tells you if the trade has reached its breakeven point. It figures out whether it's running in a backtest or live trading environment automatically.


## Function getBacktestTimeframe

This function helps you find out the dates that your backtest covers for a specific cryptocurrency pair, like BTCUSDT. It returns a list of dates representing the timeframe used for the backtest of that particular symbol. You provide the symbol as input, and it gives you back an array of dates that define the backtest period. Essentially, it tells you what dates your backtesting analysis includes.


## Function getAveragePrice

This function helps you figure out the VWAP, or Volume Weighted Average Price, for a specific trading pair like BTCUSDT. 

It looks at the last five minutes of trading data, using the high, low, and close prices of each minute to calculate a typical price. 

Then, it weighs those typical prices by the trading volume for each minute to determine the VWAP. If there's no trading volume available, it simply averages the close prices instead. You just need to provide the symbol you want to analyze, like "BTCUSDT".

## Function getAggregatedTrades

This function retrieves a list of combined trades for a specific trading pair, like BTCUSDT. It pulls this data directly from the exchange you're using.

If you don’t specify a limit, it will grab trades from within a defined time window.  If you *do* specify a limit, it will fetch enough trades to meet that limit.  The trades are pulled in reverse order from the current time.

## Function getActionSchema

This function helps you find the specific details – like what inputs are expected and what outputs to anticipate – for a particular action within your backtest. Think of it as looking up a blueprint for a specific step in your trading strategy. You provide the name of the action, and it returns a structured description of that action's functionality. This is useful for validating your configurations or understanding how different actions interact. It takes the action's name as input, and gives you back the schema outlining its requirements and behavior.

## Function formatQuantity

This function helps you display the correct amount of an asset when placing trades. It takes a trading pair like "BTCUSDT" and a raw quantity number, then formats it to match the specific rules of the exchange you're using. This ensures the displayed quantity has the right number of decimal places, which is crucial for accurate trading. Essentially, it handles the behind-the-scenes formatting so you don’t have to worry about it.


## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a symbol like "BTCUSDT" and a price value, then formats the price to match the specific rules of the exchange where that pair is traded. This ensures that the displayed price has the right number of decimal places, making it look professional and accurate. Essentially, it handles the complexities of different exchanges' formatting so you don't have to.

## Function dumpText

The `dumpText` function lets you save raw text data related to a specific signal, like logging messages or detailed observations. Think of it as a way to record information tied to a particular trading signal, whether it’s part of a backtest or a live trading scenario. It automatically figures out if you’re running a backtest or live and will handle the signal details for you.

You provide the function with a description of the data, a unique identifier (`dumpId`), the name of the "bucket" where it's stored, and the text content itself.


## Function dumpTable

This function helps you display data in a neat, organized table format, especially useful when reviewing backtest results. 

It takes an array of objects (like data rows) and presents them as a table. The table is linked to the signal being analyzed.

The function handles the technical details of identifying whether you're running a backtest or a live trading session. 

It automatically figures out the column headers based on all the different keys found in your data. You don't need to manually define them!


## Function dumpRecord

This function lets you save a simple record of data – think of it like a snapshot of information – associated with a specific signal. 

It's designed to store data in a structured way, organized by a bucket and a unique identifier. The data itself is represented as a collection of key-value pairs.

The function intelligently adapts to whether you're running a test or a live trading environment and handles the underlying signal management for you. 

It’s handy for persisting small pieces of information you might want to review later, like details about a trade or a specific market condition.


## Function dumpJson

The `dumpJson` function is a handy tool for recording data during your backtesting or live trading sessions. It takes a JavaScript object and converts it into a formatted JSON string, essentially creating a snapshot of your data. This JSON block is then associated with a specific signal, allowing you to easily track and review the context surrounding that signal's occurrence. The function smartly handles the environment—whether you're backtesting or live trading—and takes care of resolving any pending or scheduled signals automatically. You just need to provide the bucket name, a unique identifier, the data you want to save as JSON, and a brief description.


## Function dumpError

The `dumpError` function helps you record and report errors that happen during your backtesting or live trading sessions. It takes information about the error – like where it occurred, a unique ID, the error details, and a short description – and sends it for logging or analysis. Importantly, it figures out if you're running a backtest or a live trade and handles the current signal automatically, simplifying the process of tracking and understanding issues as they arise. This function streamlines error reporting by ensuring context is preserved.


## Function dumpAgentAnswer

This function is designed to help you inspect and understand the conversation flow of an AI agent during a trading simulation or live execution. It gathers all the messages exchanged with the agent, connects them to a specific 'dumpId' for organization, and saves them in a designated storage bucket. This is useful for debugging, analyzing agent behavior, and ensuring the agent is responding as expected. The function automatically figures out whether it's running a backtest or a live trading session, streamlining the process for different environments. 

You provide a set of messages and descriptive information, and the function takes care of the rest, saving the complete agent interaction history.


## Function createSignalState

This function helps you manage the state of your trading signals in a straightforward way. It creates a pair of functions – `getState` and `setState` – that are tied to a specific "bucket" and an initial value.

You don’t need to worry about passing signal IDs around because these functions automatically figure out whether you're in backtest or live mode.

It's particularly useful for complex strategies, like those driven by AI models, where you need to track metrics on each trade, such as the length of time a trade is open and its peak profit. 

The framework is designed to work well with strategies aiming for modest profits, even if some trades experience a small drawdown.


## Function commitTrailingTakeCost

This function lets you set a specific price for your take-profit order, regardless of how far it was initially placed. It’s a shortcut to simplify setting take-profit prices, automatically figuring out the correct percentage shift based on your original take-profit distance. The function handles the backtest versus live trading environment and gets the current price for you, making the adjustment process easier. You simply provide the symbol of the trading pair and the absolute price you want your take-profit to be at.

## Function commitTrailingTake

This function lets you fine-tune the trailing take-profit for your open trading signals. It's designed to keep your take-profit moving in your favor, but it's important to understand how it works. 

The key is that it always calculates adjustments based on the original take-profit you set initially – not any adjustments made later. This prevents errors from building up over time.

When you adjust the take-profit, the function only makes changes that make your take-profit *more conservative* – meaning it moves the take-profit closer to your entry price. If you try to move it further away, the function will ignore that request.

Specifically, for long positions, the take-profit can only be moved *down* (closer to the entry price). For short positions, it can only be moved *up* (also closer to the entry price). 

It handles whether you're running a backtest or a live trading session automatically.

You’ll need to provide the symbol of the trading pair, the percentage adjustment you want to apply to the original take-profit, and the current market price.

## Function commitTrailingStopCost

This function lets you set a specific stop-loss price for a trade, essentially fixing it at a certain level. It handles the complexities of calculating how this absolute price relates to your original stop-loss distance – you don't need to worry about those calculations yourself. The function also automatically adjusts based on whether you're in a backtesting or live trading environment, and fetches the current market price to ensure the adjustment is accurate.

It's a handy shortcut when you need to override the automatic trailing stop and establish a precise stop-loss point.


## Function commitTrailingStop

The `commitTrailingStop` function helps manage your trailing stop-loss orders. It allows you to dynamically adjust the distance of your stop-loss based on a percentage shift relative to the initial stop-loss set when the trade was entered.

It's important to understand that this function always calculates adjustments based on the original stop-loss distance, which prevents errors from building up as the function is used repeatedly.

Think of it as fine-tuning your stop-loss; a negative shift brings it closer to your entry price, while a positive shift moves it further away. The function ensures that you're always improving your protection, never making your stop-loss worse than it already is.

It intelligently handles both long and short positions, ensuring the stop-loss moves in the right direction to maximize profit. The function automatically knows whether it's operating in backtesting mode or a live trading environment.


## Function commitSignalNotify

The `commitSignalNotify` function lets you send out information messages related to your trading strategy's decisions. Think of it as a way to leave notes for yourself or send alerts about what's happening during a trade, without actually changing your position.

You can use it to record specific events like when an RSI indicator crosses a certain level or when you see unusual trading volume.

It's designed to be easy to use – it automatically grabs key details like the trading symbol, strategy name, and the current price, so you don't have to provide them manually. You can also add extra information to your notifications using the optional payload.

## Function commitPartialProfitCost

The `commitPartialProfitCost` function lets you automatically close a portion of your position when you’ve reached a certain profit level, measured in dollars. It simplifies the process by converting a dollar amount into a percentage of your initial investment, so you don’t have to calculate it yourself.

This function is designed to move your trade closer to your take profit target, only executing when the price is moving in a profitable direction. It works equally well in backtesting and live trading environments and takes care of fetching the current price for you.

To use it, just specify the symbol of the trading pair and the dollar amount you want to close. For example, `commitPartialProfitCost("BTCUSDT", 150)` will close a portion of your position worth $150.

## Function commitPartialProfit

The `commitPartialProfit` function lets you automatically close a portion of your open trading positions when the price moves in a profitable direction, essentially helping you lock in some gains. 

It closes a specified percentage of your active position, and it only works if the price is heading towards your target profit level.

You don't need to worry about whether you’re in a backtesting or live trading environment; the function handles that automatically.

To use it, you provide the symbol of the trading pair (like "BTCUSDT") and the percentage of the position you want to close – for instance, closing 25% would use a value of 25. The function returns a promise that resolves to a boolean indicating whether the partial profit commitment was successful.


## Function commitPartialLossCost

This function helps you partially close a position when the price is moving towards your stop-loss level, and you want to limit your losses by a specific dollar amount. It simplifies the process by automatically calculating the appropriate percentage of your position to close based on the total cost.  You just specify the dollar amount you want to recover, and the function takes care of the rest, working seamlessly whether you're in backtesting or live trading. It also handles fetching the current price so you don't have to worry about that detail.  The function requires that the price movement be in the direction of your stop-loss.

The function takes the trading symbol and the dollar amount you want to close as input.


## Function commitPartialLoss

This function lets you automatically close a portion of your open trading position when the price moves in a losing direction. You specify the symbol of the trading pair and the percentage of your position you want to close, up to 100%. Think of it as a way to reduce risk by scaling back your exposure when things aren't going as planned, essentially moving toward your stop-loss level. The framework will automatically handle whether it's running in a backtesting or live trading environment.


## Function commitCreateTakeProfit

This function lets you tell the backtest kit that a take-profit order for an open position has been filled on the exchange. It's important because sometimes the exchange executes the order at a price different from what the backtest kit initially calculated based on VWAP.

Essentially, it helps keep the backtest kit synchronized with what actually happened in the market. 

It doesn't do anything if there isn't an existing open position or signal. The close will be reflected in the next tick, with a note indicating it was a take-profit closure. The function intelligently figures out if it's running in a backtest or live environment.

You can optionally add extra information, like an order ID or a note, to the confirmation.

## Function commitCreateStopLoss

This function lets you tell the backtest system that a stop-loss order for a position has been filled by the exchange, like when a candle hits a specific high or low price. It's used to reconcile what the backtest system *thinks* is happening (VWAP-based stop-loss checks) with what’s *actually* happening on the exchange.

Essentially, it confirms the position's closure with the reason being "stop_loss" and that happens on the next tick. The system will only do something if there's a pending signal already in place. 

You can optionally provide extra details, like an ID and note, along with this confirmation. The system automatically knows whether it's running a backtest or a live trading session.

## Function commitCreateSignal

This function lets you feed custom trading signals into the backtest or live trading environment. Think of it as a way to inject your own signals directly, bypassing the usual signal retrieval process. 

You provide a signal description (a `dto`) and a trading symbol. The function then handles whether the signal executes immediately (if a specific price has already been met) or is scheduled to run when that price is reached.

It’s important to know that this function automatically adapts to whether you’re running a backtest or live trading, and it prevents multiple signals from being processed at the same time to maintain order. The provided signal will also be checked for validity before processing.

## Function commitClosePending

This function lets you cancel a pending trade signal without interrupting your strategy's ongoing operation. Think of it as a way to essentially 'undo' a pending order. It specifically clears the signal related to a particular trading pair (symbol) and doesn't impact any scheduled signals or the strategy’s overall function – the strategy will keep generating signals. You can also add optional details like an ID and note to the cancellation if you'd like to keep a record. The framework automatically figures out if it's running in a backtesting environment or a live trading scenario.

## Function commitCancelScheduled

This function lets you cancel a previously scheduled signal without interrupting the overall trading strategy. Think of it as hitting a pause button on a specific signal – it removes it from the queue, preventing it from being activated when the price reaches the defined level. This is useful if you need to adjust or retract a signal based on new information, but you still want the strategy to keep running and potentially generate new signals. It won't impact any signals that are already in progress or affect how the strategy is operating. 

You can also include extra information with the cancellation, such as an ID or a note, using the optional payload parameter. The function intelligently figures out whether it's being used in a backtest or live trading environment.


## Function commitBreakeven

This function helps you manage your trading risk by automatically adjusting your stop-loss order. It moves the stop-loss to the entry price – essentially eliminating the risk of loss – once the price has moved favorably enough to cover transaction fees and a small buffer.

It calculates the threshold for this adjustment based on a combination of slippage and fee percentages. The function takes care of determining whether it's running in a backtesting or live trading environment and retrieves the current price for the symbol you're trading.

You just need to provide the symbol of the trading pair you want to manage (e.g., BTCUSDT).


## Function commitAverageBuy

The `commitAverageBuy` function helps you automate adding buy orders to your trading strategy. It essentially creates a new "average buy" entry for a specific trading pair. 

This function automatically calculates the current price and adds a new buy order to the records, updating the overall average purchase price along the way. It also lets you specify a custom cost if needed, and it handles whether it's running in a backtest or live trading environment for you. Finally, it announces the new buy order with a special "average-buy" event.

## Function commitActivateScheduled

This function lets you trigger a previously scheduled trade before the price actually hits the expected level. Think of it as a way to manually say "go ahead" on a trade that was planned to happen later. 

It essentially sets a flag that the trading strategy will check on the next price update. 

The function automatically understands whether you're running a test (backtest) or live trading.

You provide the trading pair symbol (like "BTCUSDT") and can include an optional note or identifier for tracking purposes.

## Function checkCandles

The `checkCandles` function helps ensure your backtesting environment has all the historical data it needs. It efficiently verifies that the necessary candle data exists within the cached storage, using the persist adapter. Instead of loading everything, it performs a quick check to see if each expected timestamp is present, making the process much faster and more resource-friendly. If even one candle is missing or out of sync, the function will detect it without having to process the entire dataset.


## Function cacheCandles

This function makes sure the historical candle data you need is safely stored and available. It's designed to fetch missing data and ensure everything is up-to-date. It works in two steps: first, it checks if the data exists, and if not, it downloads and verifies the data again to be certain it's correct. You’ll need to specify things like the trading symbol, timeframe (interval), start and end dates, the exchange you're using, and optional callbacks to track progress.

## Function addWalkerSchema

This function lets you add a new "walker" to the backtest-kit system. Think of a walker as a way to run several different trading strategies against the same historical data and see how they stack up against each other. You provide a configuration object – the `walkerSchema` – which tells the system how to run those strategies and how to measure their performance. Basically, it's a key step in setting up a comparative analysis of your trading approaches.

## Function addStrategySchema

This function lets you tell the backtest-kit about a new trading strategy you want to use. It’s like registering your strategy with the system.

When you register a strategy, the framework will check it to make sure everything is set up correctly, including how signals are generated and the logic for things like take profit and stop loss orders. 

It also helps prevent problems with signals being sent too quickly and ensures that your strategy’s data is saved even if there are unexpected issues.

You provide the strategy’s configuration details as an object that follows a specific structure.

## Function addSizingSchema

This function lets you tell the backtest kit how to determine the size of your trades. Think of it as setting up the rules for how much money you'll risk on each trade.

You provide a sizing schema, which is essentially a set of instructions. These instructions specify things like whether you want to use a fixed percentage of your capital, a Kelly Criterion approach, or something based on Average True Range (ATR). 

It also allows you to define risk limits, minimum and maximum position sizes, and even provide custom logic through a callback function to fine-tune the sizing calculations. This helps control your risk and ensures trades align with your strategy.


## Function addRiskSchema

This function lets you tell the backtest-kit system about your risk management rules. 

Think of it as setting up the guardrails for your trading strategies.

It allows you to define limits like the maximum number of positions you can have open at once, and it lets you create more complex checks based on portfolio characteristics or relationships between different strategies.

The beauty of it is that multiple trading strategies can share the same risk management setup, so you get a holistic view of your portfolio's risk exposure and can even have the system automatically adjust strategies based on these rules. This function takes a single object containing all your risk configuration details.


## Function addFrameSchema

This function lets you tell the backtest-kit about a new timeframe generator it can use. Think of timeframes as slices of your historical data – daily, hourly, or whatever interval you need for your strategy. 

You provide a configuration object, `frameSchema`, which tells the framework when your backtest should start and end, how often those timeframes should be created (e.g., every minute, every hour), and how it should handle events related to the timeframe generation. Essentially, it’s how you tell the system *how* to organize your historical data into manageable chunks for analysis.

## Function addExchangeSchema

This function lets you tell the backtest-kit framework about a new exchange you want to use for your backtesting. Think of it as registering a data source – it allows the system to understand how to fetch historical price data, format numbers related to trading, and even calculate VWAP (a volume-weighted average price) based on recent price movements. You provide a configuration object that defines the details of the exchange, essentially telling the framework where and how to get the data it needs.

## Function addActionSchema

This function lets you register a custom action handler within the backtest-kit framework. Think of actions as a way to react to events happening during a backtest – like a signal being generated, or reaching a profit target. They're great for things like sending notifications to a Discord server, logging specific events to a database, or even triggering other business logic. Each action is linked to a particular strategy and time frame, so it gets all the relevant information about what's happening. To set one up, you'll provide an object describing the action – this object is called the action schema.
