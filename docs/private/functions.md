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

The `writeMemory` function lets you store data within a specific memory space, associating it with the current signal being processed. Think of it as writing information to a labeled container that's linked to a particular trading event. It handles the details of which signal is active and whether you're running a test or a live trade, so you don't have to worry about that. You provide a bucket name, a unique memory ID, the value you want to store (which can be any object), and a descriptive label to identify what’s being saved. This function simplifies keeping track of data relevant to a particular signal.

## Function warmCandles

This function helps prepare your backtesting environment by downloading and storing historical candlestick data. Think of it as pre-loading the data you'll need for your backtests, making the process faster and smoother. It fetches all the candles for a specified time period, from a starting date (`from`) to an ending date (`to`), and saves them for later use. You provide it with a set of parameters to define the date range and other settings for this data retrieval and caching process.

## Function waitForReady

This function ensures everything is set up correctly before you start trading, whether it's a backtest or a live session. It waits patiently, checking the system's registries – those are like lists of necessary components – until they’re all filled with the right information. 

For backtesting, it makes sure the registries for exchange data, historical frames, and trading strategies are ready.  If you're running a live session, it only needs to confirm the exchange and strategy registries are in place.

Think of it as a safety check to prevent errors later on. It pauses execution for a limited time, around a minute, while waiting for these registries to become available. If it doesn’t get confirmation in that time, it moves on and lets you handle any potential errors that arise when you try to start the trading process. The `isBacktest` option lets you specify if you need frame data to be validated.

## Function validate

This function helps you double-check that everything is set up correctly before you start running tests. It makes sure all the different pieces of your trading system – like exchanges, strategies, and risk management rules – are properly registered and exist.

You can tell it to validate specific parts of your system, or if you leave it blank, it will check everything. 

Think of it as a safety net to prevent errors during backtesting or optimization by ensuring everything is in its place. It also remembers past validation checks to work faster.

## Function stopStrategy

This function lets you pause a trading strategy from creating any new trade signals. 

It essentially puts a hold on the strategy's actions, preventing it from opening new positions. Any existing signals that are already active will finish their process normally. 

Whether you're running a backtest or a live trading session, the system will gracefully halt the strategy at a convenient moment – either when it’s idle or after a signal has completed. To stop a strategy, you just need to provide the trading symbol (like BTCUSDT).


## Function shutdown

This function allows you to safely stop the backtesting process. It sends a signal that lets everything involved – like data handlers or strategy components – know it's time to clean up and prepare to exit. Think of it as a polite way to tell the system to wrap things up before it closes. This is useful when you need to stop the backtest unexpectedly, like when pressing Ctrl+C.

## Function setSignalState

This function lets you update a value associated with a specific trading signal. It's designed to be used when you're building strategies that need to track metrics on a per-trade basis, particularly those driven by language models.

The function automatically handles things like determining whether you're in backtest or live mode, and resolving the current trading signal. If there isn’t a signal currently active, it will notify you.

Think of it as a way to store information tied to a particular trade, like how long it was open or how much it gained, and it works best when you’re building complex strategies that require detailed tracking of trade performance. It helps keep track of metrics across many trades.


## Function setSessionData

The `setSessionData` function lets you store information related to a specific trading setup—like a particular symbol, strategy, exchange, and timeframe—so it’s remembered between candles during a backtest or even if your program restarts in live trading mode. This is great for holding onto things like calculated indicator values or the results of complex computations that you don't want to recalculate every time. You can clear any previously stored data by passing `null` as the value. The function intelligently adapts to whether it’s running in a backtest or live environment. 

It takes two arguments: the symbol of the trading pair you’re working with and the value you want to store. The value can be any object, or you can clear the data entirely by passing null.

## Function setLogger

You can now control how backtest-kit reports its activity by providing a custom logger. This lets you direct log messages – like information about strategies, exchanges, or symbols – to your preferred logging system. The framework automatically adds helpful context to each log message, like the strategy's name or the exchange being used. To use your own logger, simply provide an object that fulfills the `ILogger` interface.

## Function setConfig

This function lets you adjust the overall settings for the backtest-kit framework. You can use it to change things like data fetching or how strategies are executed.  It accepts a configuration object where you can specify the properties you want to modify; you don't need to provide the whole configuration, just the parts you want to change.  There's also an "unsafe" option which is mainly for testing environments and bypasses some of the standard checks – use it with caution.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, particularly when they are exported as markdown. Think of it as tailoring the report to show exactly the data you need. You can change or add to the default column settings, and the system will check to make sure your changes are valid. If you’re doing some advanced testing and need to bypass these validations, there’s a special option to do so.

## Function searchMemory

The `searchMemory` function helps you find relevant information stored in your memory system. It’s designed to quickly locate entries that match a specific query, using a sophisticated scoring system to prioritize the most relevant results.

Think of it like a smart search engine for your trading data – you give it a query and it finds memory entries that best match.

It works by searching through data stored in a "bucket" (identified by `bucketName`) and using a `query` string to find matching content.

The function returns a list of memory entries, each including a unique ID (`memoryId`), a relevance score (`score`), and the content itself (`content`).

It's also smart about how it operates; it knows whether it's running a backtest or a live trading scenario and can automatically resolve pending or scheduled signals.


## Function runInMockContext

This function lets you execute code as if it were running within a backtest-kit environment, but without actually needing a full backtest to run. It’s especially handy for testing and scripting scenarios where you need to use context-aware services like determining the current timeframe. 

You can customize the simulated environment by providing parameters like the exchange name, strategy name, symbol, or whether it should behave like a live or backtest mode. If you don't provide any of these, it will use default placeholder values to create a basic live-mode setup. The "when" parameter defaults to the current minute, aligning with a one-minute interval.


## Function removeMemory

This function helps you clean up data related to your trading strategies. Specifically, it removes a record of a past memory entry, essentially forgetting something that was previously considered. It's designed to work seamlessly whether you're testing your strategy in a simulated environment or running it live. The function takes information about which memory entry to delete – identifying it by a bucket name and a unique memory ID – and handles the rest, adjusting based on the environment it’s operating in.

## Function readMemory

The `readMemory` function lets you retrieve data that's been stored in a specific memory location, associating it with the current trading signal. Think of it like looking up a saved value tied to a particular moment in your trading strategy. It handles the complexities of figuring out which signal is currently active and whether you're running a backtest or live trading session, so you don't have to worry about those details. To use it, you provide the name of the memory bucket and the unique ID of the memory item you want to read. The function will then return the stored data, which must match a predefined TypeScript type.

## Function overrideWalkerSchema

This function lets you tweak an existing "walker" – think of it as a setup for comparing different trading strategies. It allows you to modify specific parts of a walker’s configuration without affecting everything else. You give it a partial configuration, and it returns a complete walker configuration with your changes applied. It's helpful when you want to experiment with slight variations in how your strategies are tested.

## Function overrideStrategySchema

This function lets you modify an existing trading strategy within the backtest-kit framework. Think of it as tweaking a strategy you've already set up, rather than creating a new one from scratch. You provide a portion of the strategy's configuration – only the parts you want to change – and this function updates the original strategy, leaving everything else untouched. It's a way to make adjustments and refinements without needing to redefine the entire strategy.

## Function overrideSizingSchema

This function lets you adjust how your trading positions are sized without completely replacing the original settings. Think of it like fine-tuning an existing sizing plan. You provide a partial configuration – just the settings you want to change – and this function merges those changes with the existing sizing schema. This is useful if you need to tweak things like risk percentages or order sizes based on market conditions or other factors without rewriting the whole sizing plan from scratch. The original sizing schema remains largely untouched, with only the values you specify being modified.

## Function overrideRiskSchema

This function lets you tweak an existing risk management setup within the backtest-kit. Think of it as making targeted adjustments – you provide a set of new settings, and only those specific settings get updated in the existing risk configuration. It’s useful when you need to fine-tune aspects of your risk management without having to redefine the whole thing from scratch. You're essentially providing a set of changes to apply to an already defined risk profile.

## Function overrideFrameSchema

This function lets you tweak how data is structured for a specific timeframe during backtesting. Think of it as a way to make small adjustments to an existing timeframe's settings – you're not creating a brand new timeframe, just modifying one that's already defined. You provide a partial configuration, and only those parts you specify will be changed, while everything else remains as it was previously set up. This is useful for fine-tuning how your backtest handles data for different time intervals.


## Function overrideExchangeSchema

This function lets you modify an already set up data source for an exchange within the backtest-kit system. Think of it as a way to tweak the details of how your exchange data is handled.

You can't completely replace the existing exchange data, only specific parts you define. Any settings you *don't* provide will stay as they were originally configured.

It takes a piece of exchange configuration data as input, and it returns a promise that resolves to the updated exchange schema.


## Function overrideActionSchema

This function lets you tweak existing action handlers within the backtest-kit framework without completely replacing them. Think of it as a targeted update – you can change specific parts of a handler’s configuration. 

It's handy when you need to adjust how events are handled, maybe to test different logic in development versus production, or to swap out different implementations of a handler. You only need to provide the changes you want to make; everything else stays the same. This avoids the need to re-register the entire action handler, making changes quicker and easier.

## Function listenWalkerProgress

This function lets you keep track of how your backtest is progressing. It will notify you whenever a strategy finishes running during the backtest process.

These updates happen one after another, ensuring events are processed in the order they come in, even if your processing involves asynchronous operations.

Think of it as a way to get a stream of notifications as your backtest completes each strategy, allowing you to display progress or perform other actions.

To stop listening for these progress events, the function returns a cleanup function that you can call.

## Function listenWalkerOnce

`listenWalkerOnce` lets you react to specific events happening during a backtest, but only once. It’s like setting up a temporary listener that waits for a particular condition to be met. You provide a filter to define what events you're interested in, and a function to run when that event occurs. Once the event is processed, the listener automatically disappears, ensuring you don’t keep reacting to the same thing repeatedly. 

It's helpful when you need to perform an action based on a single, distinct event in the backtest process.

The first argument, `filterFn`, defines which events should trigger your reaction. The second argument, `fn`, is what actually gets executed when a matching event is found. The function returned by `listenWalkerOnce` can be used to unsubscribe manually if needed, though it’s designed to unsubscribe itself.


## Function listenWalkerComplete

This function lets you get notified when a backtest run finishes. It's useful for knowing when all your strategies have been tested. When you subscribe, the function you provide will be called once the testing is complete.

Even if your callback function takes some time to run (like if it's doing something asynchronously), the events will be handled one after another in the order they arrived. To keep things organized and avoid conflicts, it queues up the execution of your function.

You can unsubscribe from these notifications at any time by returning the function it provides.


## Function listenWalker

The `listenWalker` function lets you keep track of what's happening as your backtest runs. It's like setting up an observer that gets notified after each strategy finishes executing within the backtest.

You provide a function that will be called with information about the completed strategy. 

Importantly, this function will be executed one at a time, even if your callback itself takes some time to complete, ensuring the process stays orderly. This provides a reliable way to monitor and react to the progress of your backtesting process.

## Function listenValidation

This function lets you keep an eye on any problems that pop up during the risk validation process, specifically when signals are being checked.

It's like setting up an alert system: whenever a validation check fails, this alert will trigger and your provided function will be called.

The errors you receive will include details about what went wrong.

Importantly, these alerts are handled in the order they occur, and they are processed one at a time to avoid things getting messy with multiple simultaneous alerts. You provide a function that will be executed when an error is detected. This function will receive the error object as a parameter.

## Function listenSyncOnce

This function lets you set up a listener that will only react to a signal once, and only when it meets a specific condition you define. Think of it as a temporary guardrail for your trading logic. If your callback function involves asynchronous operations like promises, backtest-kit will pause everything else until that operation finishes, ensuring your synchronization is accurate. This is particularly helpful when coordinating with external systems that need to be in sync with your trading actions. Once triggered, the listener is automatically removed, so you don’t have to worry about cleaning it up.

## Function listenSync

This function lets you listen for events related to signal synchronization, like when a trade signal is about to be opened or closed. It's designed to help you coordinate with other systems that might need to be involved in the trading process. 

If you provide a function that returns a promise, the trading system will pause and wait for that promise to finish before proceeding with the trade – this ensures everything is in sync. The `warned` parameter is currently not used. It's a handy tool for keeping your trading operations coordinated and reliable.

## Function listenStrategyCommitOnce

This function lets you react to specific changes happening within your trading strategies, but only once. You tell it what kind of change you're interested in using a filter, and then provide a function that should run when that specific change occurs. Once that change happens, it automatically stops listening, so you don’t have to worry about managing the subscription yourself. It's a simple way to wait for something to happen with your strategies and then take action.

The filter helps you pinpoint the exact event you're looking for. The callback function then handles that event, performing whatever action you need.


## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategy's management actions. It's like setting up a listener that gets notified whenever something like a scheduled signal is cancelled, a pending order is closed, or adjustments are made to stop-loss or take-profit levels. 

The notifications you receive include things like partial profit or loss closures, trailing stop adjustments, and when the stop-loss moves to break-even. 

Importantly, the callback you provide will be executed one at a time, even if it takes some time to run, which helps prevent conflicts and keeps things organized. You can unsubscribe from these events when you no longer need them by calling the function it returns.

## Function listenSignalOnce

This function lets you react to specific trading signals just once. You provide a filter – a test to see if a signal is what you’re looking for – and a function to execute when that signal appears. Once the signal matching your filter arrives, the function runs and automatically stops listening, making it ideal for situations where you need to respond to a signal and then move on. It's a handy way to handle one-off events in your trading strategy.


## Function listenSignalNotifyOnce

This function lets you set up a temporary listener for signal events. You provide a rule (the `filterFn`) to decide which events you're interested in. Once an event matches your rule, a provided function (`fn`) will run exactly once to handle that event. After that single execution, the listener automatically stops, so you don't have to manage subscriptions manually. It's perfect for reacting to a signal just once and then forgetting about it.


## Function listenSignalNotify

This function lets you listen for notifications whenever a trading strategy sends out a signal note about an active trade. Think of it as a way to be informed about specific events happening within your strategy's execution.

It works by queuing up these notifications so they're processed one at a time, even if your notification handling code takes some time to complete. This prevents things from getting messy or out of order.

To use it, you provide a function that will be called each time a new signal notification is available, and this function receives information about the signal event. When you're done listening, you can unsubscribe using the function returned by `listenSignalNotify`.


## Function listenSignalLiveOnce

The `listenSignalLiveOnce` function lets you temporarily hook into live trading signals from your backtest, but only for a single event. Think of it as setting up a temporary alert that fires just once when a specific condition is met during a live simulation. It's useful for quickly inspecting data or triggering a one-time action without needing to manage subscriptions manually. You provide a filter – a way to pick which signals you’re interested in – and a function that will be executed only the first time that signal passes through. After that, the subscription is automatically removed, so you don’t need to worry about cleaning up. It works specifically with signals coming from `Live.run()`.


## Function listenSignalLive

This function lets you tap into a live trading simulation, receiving updates as they happen. It's designed to process these updates one at a time, ensuring events are handled in the correct order. You provide a function that will be called with each new event, allowing you to react to the trading signals as they arrive from a live run. Keep in mind that these signals are exclusive to executions started by `Live.run()`. The function you provide returns a function that can be called to unsubscribe from these live signals.


## Function listenSignalEventOnce

This function lets you react to a specific event happening within the backtest, but only once. It's like setting up a temporary listener that automatically goes away after it hears what you're looking for. You tell it what kind of event you're interested in using a filter, and then provide a function that will run when that event occurs. After the function runs once, the listener is removed, so you don’t have to worry about cleaning it up. It’s handy if you need to wait for a particular trade to open or close and then do something specific.


## Function listenSignalEvent

This function lets you keep an eye on what’s happening with your trading signals, both when they’re first created and when they’re finished. You’ll receive notifications whenever a signal is opened, like when a new trade is triggered or you manually activate one, and also when it closes, whether it's due to a profit target, a stop-loss, or just time running out. 

Importantly, these events are delivered to you in the order they happen, even if your response to them takes some time. To use it, you simply provide a function that will be called with details about each signal event. When you're done listening, the function returns another function that you can use to unsubscribe.

## Function listenSignalBacktestOnce

This function lets you set up a listener that only reacts to specific signals coming from a backtest run. Think of it as setting up a temporary alert – it will only fire once when a signal matches your criteria.

You tell it what kind of signals you're interested in using a filter function. 

Then, you provide a callback function that will execute with that matching signal.

Once the callback runs, the listener automatically stops, preventing further executions. It's a clean and simple way to react to a single, specific event during a backtest.

## Function listenSignalBacktest

This function lets you set up a listener to receive updates as a backtest is running. Think of it as plugging into a stream of information about what's happening during the simulation.

The information you get will be in the form of `IStrategyTickResult` objects, which contain details about each step of the backtest.

Importantly, the events are processed one at a time, ensuring a predictable order. You’ll only receive signals that come directly from a running backtest.

The function returns another function that you can call to unsubscribe from the signal listener when you're done.


## Function listenSignal

The `listenSignal` function lets you be notified whenever your trading strategy has a significant change in its state, such as opening a position, closing a position, or transitioning to an active state. It's designed to handle these events, called "ticks," in a reliable way, ensuring they are processed one at a time even if your handling code takes some time to complete. Essentially, you provide a function that will receive these updates, and this function automatically manages the order of processing to avoid any unexpected issues. This allows you to react to your strategy's changes in a controlled and predictable manner.


## Function listenSchedulePingOnce

This function helps you react to specific ping events, but only once. Think of it as setting up a temporary listener that waits for a particular condition to be met, then runs your code, and then automatically stops listening. You provide a filter to define what kind of ping events you’re interested in, and a function to execute when that event is detected. Once the event happens, the listener disappears. This is ideal for situations where you only need to react once to a specific event.


## Function listenSchedulePing

This function lets you listen for regular "ping" signals that are sent while a scheduled trading signal is being monitored and prepared for activation. Think of it as a heartbeat signal confirming the system is still working while waiting.

You provide a function that will be called every minute with information about the ping event.

This allows you to track the progress of a scheduled signal and build custom checks or monitoring logic related to that process.

The function returns an unsubscribe function, which you can use to stop receiving these ping signals when you no longer need them.


## Function listenScheduleEventOnce

This function lets you react to a specific scheduled event just once and then stop listening. You provide a filter to identify the event you're interested in, and a function to run when that event occurs. It's perfect when you need to wait for something like a specific trade to be created or cancelled, and then you don’t need to keep monitoring. The function handles automatically unsubscribing, so you don't have to worry about cleaning up your listener.


## Function listenScheduleEvent

This function lets you keep an eye on what's happening with your scheduled trading signals. You’ll get notified when a signal is initially created and when it's cancelled before it actually starts running—for example, if it times out or doesn't meet a price condition or a user cancels it.

It's important to know that you won’t see notifications about when a signal *starts* running; those are handled by a different function.  The callback you provide will be called with information about the event, and it will run in order.

The function returns a function that you can use to unsubscribe from these events later.

## Function listenRiskOnce

The `listenRiskOnce` function helps you react to specific risk rejection events just once and then automatically stop listening. It takes a filter function that determines which events you're interested in, and a callback function that runs when a matching event occurs. This is handy when you need to wait for a particular risk condition to be met and then take action, after which you don't need to keep monitoring. The function returns an unsubscribe function that you can call if you need to stop listening manually before the single execution.

## Function listenRisk

This function lets you be notified whenever a trading signal is blocked because it doesn't meet your risk criteria. 

Think of it as a safety net – you'll only hear about it when something goes wrong and a trade is prevented. 

The events are delivered one at a time, ensuring your reaction to the risk event is handled in a controlled manner, even if your response involves asynchronous operations. It’s designed to avoid unnecessary notifications when trades are approved. You provide a function that will be called with details about the rejected trade.


## Function listenPerformance

This function lets you keep an eye on how your trading strategy performs. It sends you updates as your strategy runs, tracking things like how long different parts take to complete. Think of it as a performance monitor – you can use this information to find slow spots and optimize your strategy. The updates are delivered one at a time, even if the information you receive requires some extra processing. This ensures that the updates are handled in a controlled way. To use it, you provide a function that will be called with performance event data. When you're done, the function returns another function to unsubscribe.

## Function listenPartialProfitAvailableOnce

This function lets you set up a listener that reacts to specific profit levels being reached during a backtest. You provide a filter to define exactly which profit conditions you’re interested in. Once that condition is met, the provided function is executed just once, and then the listener automatically stops listening. It's a simple way to trigger actions or record information when a certain profit milestone is hit.


## Function listenPartialProfitAvailable

This function lets you be notified whenever your trading strategy hits certain profit milestones, like reaching 10%, 20%, or 30% profit. It's designed to handle these notifications one at a time, even if the process of handling the notification takes some time. You provide a function that will be called with information about the profit milestone reached. This ensures things are processed in the correct order and avoids potential conflicts.


## Function listenPartialLossAvailableOnce

This function allows you to monitor for specific partial loss events within your trading strategy and react to them just once. It’s like setting up a temporary alert – when an event that matches your criteria occurs, your provided function will be executed, and then the alert automatically disappears. You define what constitutes a “matching” event using a filter function, and the callback function handles the event data. This is helpful if you only need to respond to a particular loss scenario once.

## Function listenPartialLossAvailable

This function lets you keep track of how much your trading strategy has lost during a backtest. It will notify you whenever a specific loss level is reached, like 10%, 20%, or 30% of the initial capital. 

The events are delivered one after another, and your callback function will be executed in order, even if it takes some time to run. To prevent issues from running things at the same time, the system ensures that your callback is processed sequentially.

You provide a function as input, and that function will be called each time a new loss level is hit, giving you information about the loss amount. The function you provide will return a function to unsubscribe from these events.

## Function listenMaxDrawdownOnce

This function helps you react to specific maximum drawdown events, but only once. It lets you define a condition – a filter – that determines when you want to be notified. Once that condition is met, a provided function runs to handle the event, and then the function automatically stops listening. It’s great for situations where you need to respond to a particular drawdown situation just one time.

You provide a filter function to check each drawdown event and a callback function that will be executed when the event matches the filter. The callback is triggered once and then the subscription is ended.

## Function listenMaxDrawdown

This function lets you keep an eye on when your backtest reaches new drawdown lows. It's like setting up an alert that triggers whenever the worst point in your trading history changes.

The events are handled one at a time, even if your alert function takes some time to process. 

You can use this to monitor how much your trading strategy has lost from its peak and adjust your risk management accordingly. To use it, you provide a function that will be called whenever a new drawdown level is detected. The function will receive an event object containing details about the drawdown. When you are done, the function returns another function that you can call to unsubscribe from the events.

## Function listenIdlePingOnce

This function lets you react to events indicating periods of inactivity within your application. It listens for "idle ping" events and applies a filter to decide which events trigger an action. Once a matching event is found, it executes a provided function just once, then stops listening. This is useful for actions that need to occur only when inactivity is detected and only once. You specify a filter to determine which idle ping events should be acted upon, and a function to run when a suitable event occurs. When the function returns, the subscription is automatically cancelled.

## Function listenIdlePing

This function lets you listen for moments when your backtest system isn't actively processing any trading signals. 

Essentially, it triggers a notification when everything is quiet and the system is idle.

You provide a function that will be called each time this idle state occurs.

This allows you to perform tasks like logging or housekeeping during periods of inactivity.

The function returns an unsubscribe function so you can stop listening when you no longer need to.

## Function listenHighestProfitOnce

This function lets you set up a temporary listener that reacts to events indicating the highest profit achieved. You provide a filter to specify which events you're interested in, and a function to execute when that event occurs. Once the event happens, the listener automatically stops itself, so you don’t have to worry about managing subscriptions. It's perfect for situations where you need to react to a particular profit milestone just once and then move on.

The filter function determines which events trigger the callback. The callback function handles the event data when the filter matches.

## Function listenHighestProfit

This function lets you monitor when a trading strategy reaches a new peak in profitability. It's like setting up an alert that triggers whenever the strategy's profit gets higher than it ever has before. 

The alerts are handled one at a time, even if your alert logic takes some time to complete – this prevents things from getting messy. You provide a function that gets called whenever a new highest profit is achieved, allowing you to track these milestones and potentially adjust your trading strategy on the fly. It’s helpful for keeping tabs on how well your strategy is performing and responding to significant profit jumps.

## Function listenExit

The `listenExit` function lets you register a callback that will be triggered when the backtest or other background processes encounter a fatal, unrecoverable error – the kind of error that stops the whole process. Think of it as an error notification for situations where recovery isn't possible. These errors are handled one after another, even if your callback function needs time to process the error, ensuring a consistent order of events. It’s designed to reliably alert you to these critical issues.


## Function listenError

This function lets you set up a listener that gets notified whenever a recoverable error occurs during your trading strategy's execution. Think of it as a safety net—if something goes wrong, like a failed API call, the strategy doesn't just crash.

Instead, this listener gets triggered, allowing you to handle the error and keep things running smoothly.

The errors are handled one at a time, in the order they happen, even if your handling function takes some time to complete. It makes sure things stay predictable and avoids unexpected problems. To stop listening for these errors, the function returns another function that you can call to unsubscribe.


## Function listenDoneWalkerOnce

This function lets you react to when a background task finishes, but only once. 

It allows you to specify a condition – a filter – so you only receive notification when a specific type of task completes. 

When the task finishes and matches your filter, a provided function will execute just one time, and then automatically stop listening. This is helpful for things like confirming a particular step in a sequence has finished without needing to manage subscriptions yourself.


## Function listenDoneWalker

This function lets you monitor when background tasks within a trading strategy's "walker" component finish processing. It's designed to handle events that signal the completion of these background tasks, ensuring they are processed one at a time, even if your callback function takes some time to execute. Essentially, you provide a function that gets called when a background task is done, and this function returns another function you can use to unsubscribe from these completion notifications. This helps maintain order and prevent unexpected behavior when dealing with asynchronous operations.

## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running within your backtest.

It’s a way to listen for completion signals specifically from `Live.background()`.

You provide a filter – a way to specify which completion events you're interested in – and a function that will be called just once when a matching event occurs.  After that single execution, the listener automatically stops listening, preventing unwanted repeated callbacks.


## Function listenDoneLive

This function lets you be notified when background tasks initiated through Live.background() finish running. It ensures events are handled one at a time, even if your notification code takes some time to process. Think of it as a way to get a sequential update on the status of those ongoing background operations. You provide a function that will be called whenever a background task is done, and this function returns another function to unsubscribe from those updates.

## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but only once. You provide a filter to specify which backtest completions you're interested in, and then a function that will run when a matching backtest is done. After that function runs, it automatically stops listening, so you won't get any more notifications about that particular backtest. It's useful when you need to perform a single action after a specific background backtest completes.


## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. 

It's useful for triggering actions after a backtest is complete, like updating a UI or saving results. 

The events are delivered in the order they happen, and the code handles asynchronous callbacks gracefully to avoid any problems with multiple things running at once. You provide a function that will be called when a backtest is done, and this function returns another function you can use to unsubscribe from the events later.

## Function listenBreakevenAvailableOnce

This function lets you set up a listener that reacts to breakeven protection events, but only once. You define a filter to specify which events you're interested in, and then provide a callback function that will be executed when a matching event occurs. After that one execution, the listener automatically stops listening – perfect for situations where you only need to respond to a single instance of a condition being met. It's a convenient way to handle specific breakeven events and then forget about them. 

You give it a function that determines if an event is what you want, and then another function that will run when the right event happens. The listening stops after the callback is run.

## Function listenBreakevenAvailable

This function lets you monitor when a trade's stop-loss automatically adjusts to the original entry price, a process known as breakeven protection. It’s designed to notify you when this happens, essentially signaling that the trade has made enough profit to cover its costs.

The events are handled in the order they occur, even if your callback function takes some time to complete. To ensure smooth processing, it uses a queuing mechanism to prevent multiple callbacks from running at once.

You simply provide a function as input—this function will be called whenever a breakeven event happens, giving you the details of the trade that reached this point. The function you provide will return a function that you can call to stop listening to these events.

## Function listenBeforeStartOnce

This function lets you react to specific events that happen right before a backtest begins, but only once. You provide a filter to specify which events you're interested in, and then a callback function that will run just one time when a matching event occurs. After that single execution, the function automatically stops listening, keeping your backtest clean and efficient. It's a handy way to perform setup tasks or adjustments just before a backtest kicks off.

## Function listenBeforeStart

This function lets you hook into the moment right before a trading strategy begins running for a specific asset. You can provide a function that gets called just before each new trading session starts. This function will be executed one after another, ensuring that they run in the order they were received, even if your function involves asynchronous operations. It prevents multiple functions from running at the same time, which can help keep things predictable.

## Function listenBacktestProgress

This function lets you monitor the progress of your backtest as it runs. It's particularly useful for longer backtests where you want to see updates and status changes. You provide a function that will be called whenever a progress event occurs during the background execution of the backtest. Importantly, these events are handled one at a time, even if your callback function takes some time to complete, ensuring that updates are processed in the order they're received. The function returns another function that you can use to unsubscribe from these progress updates when you no longer need them.

## Function listenAfterEndOnce

This function lets you react to events that happen *after* a trading simulation or backtest finishes, but only once. You tell it which events to look for using a filter – essentially, a test to see if the event is relevant to you. Once an event matches your filter, the provided callback function runs, handling that single event, and then the subscription is automatically cancelled. This is a convenient way to perform actions like logging specific results or cleaning up resources without needing to manage subscriptions manually.


## Function listenAfterEnd

This function lets you tap into what happens *after* a trading strategy has finished running for a specific asset. Think of it as getting a notification once the engine is completely done with a particular symbol's backtest. Importantly, any code you put inside your notification function will run one at a time, in the order they were received, which is helpful if you need to process things carefully. It’s a way to react to the completion of a backtest run for a specific asset. You provide a function that will be called when that event occurs.

## Function listenActivePingOnce

This function lets you watch for specific active ping events and react to them just once. You provide a filter to define which events you're interested in, and a callback function that will be executed when a matching event occurs. Once the callback runs, the subscription stops automatically, so you don't have to worry about cleaning up. It's perfect for situations where you need to trigger an action only when a particular active ping condition arises.


## Function listenActivePing

This function lets you keep an eye on active trading signals. It listens for events that happen every minute, giving you insights into the status of your signals. Think of it as a way to track what's happening with your trading strategies in real-time.

The function will call a callback you provide whenever a new active ping event occurs. Importantly, these events are processed one at a time, even if your callback takes some time to complete, so you won't have issues with things happening out of order or overlapping.

To use it, you simply provide a function that will be executed when a new ping event is detected. This allows for building logic that reacts to changes in the status of active signals. The function returns another function that you can call to stop listening to these events.


## Function listWalkerSchema

This function gives you a complete list of all the "walkers" that are currently set up in your backtest-kit environment. Think of walkers as specialized tools for analyzing and processing data during a backtest. 

It's a handy way to see exactly what's happening behind the scenes, allowing you to understand how your data is being handled or to create interfaces that dynamically display the available analysis tools. You can use it to inspect the configuration or create visual representations of your trading strategies.


## Function listStrategySchema

This function gives you a way to see all the different trading strategies that are currently set up and ready to be used within the backtest-kit framework. Think of it as a directory listing all the available strategies. It’s especially helpful if you're trying to understand what strategies are available, build tools that need to know about them, or just double-check everything is configured correctly. The result is a list of strategy definitions that you can use within your application.


## Function listSizingSchema

This function lets you see all the different sizing strategies you've set up for your backtest. It's like getting a complete inventory of how you're determining position sizes. You can use this to double-check your configuration, create helpful documentation, or even build tools that automatically display sizing options. The function returns a list of sizing schemas, each representing a specific sizing strategy.

## Function listRiskSchema

This function helps you see all the risk configurations currently loaded into the backtest-kit framework. It essentially provides a complete list of the risk profiles you’ve set up. This is great for checking what's active, generating documentation, or creating user interfaces that need to display these configurations. The function returns a promise that resolves to an array of risk schemas.

## Function listMemory

This function helps you see all the stored data related to your trading signal. 

Think of it as a way to peek inside the framework’s memory to see what's been saved. 

It automatically figures out which signal you're working with and whether you're in a testing or live trading environment. 

You provide a name for the data bucket to look in, and it returns a list of all the entries, including their unique IDs and the data they contain. It's useful for debugging or understanding how data is being managed within the backtest kit.

## Function listFrameSchema

This function allows you to see a complete catalog of the data structures, or "frames," that your backtesting system is using. Think of it as a way to peek behind the curtain and understand what kinds of information is being processed during a backtest. It provides a list of all the schemas that were previously added using `addFrame()`, which is invaluable for troubleshooting, generating documentation, or creating interfaces that adapt to different backtesting setups. You'll get a collection of frame schema definitions that you can then examine.

## Function listExchangeSchema

This function gives you a look at all the exchanges that your backtest-kit setup knows about. It returns a list of information describing each exchange, allowing you to inspect them. You can use this when you're troubleshooting, when you want to create helpful guides, or when you need to build interfaces that adapt to different exchanges. Essentially, it’s a way to see what exchanges are plugged into your backtesting system.

## Function hasTradeContext

This function simply tells you whether the system is currently in a state where it can execute trades. 

It verifies that both the execution and method contexts are active. 

You'll need this to be true before using functions that interact with the exchange, like fetching historical data (candles), calculating prices, or formatting values. Think of it as a quick check to make sure everything is set up correctly for trading actions.


## Function hasNoScheduledSignal

This function helps you check if a trading signal is currently scheduled for a specific asset, like "BTCUSDT". It tells you definitively whether there's *no* signal waiting to be triggered. Think of it as the opposite of a function that checks for a scheduled signal - you can use this to make sure your signal-generating logic only runs when it's supposed to. It smartly figures out whether you're in a backtesting environment or live trading, so you don't need to worry about that detail. 

You provide the symbol of the asset you're interested in, and it returns a true or false value.

## Function hasNoPendingSignal

This function, `hasNoPendingSignal`, helps you determine if a trading signal is currently waiting to be executed for a specific trading pair, like BTC-USD. It returns `true` if there isn't a signal waiting, meaning it's safe to potentially generate a new one. Think of it as the opposite of `hasPendingSignal`. This makes it useful for controlling when your system creates new trading signals, making sure you don't accidentally create conflicting orders. The function smartly figures out whether it's running in a backtesting environment or a live trading environment.

It takes the trading pair symbol as input, for example, 'BTC-USD'.

## Function getWalkerSchema

The `getWalkerSchema` function helps you find the details of a specific trading strategy, or "walker," registered within the backtest-kit system. Think of it as looking up the blueprint for a particular trading approach. You provide the name of the walker you're interested in, and the function returns a structured description of that walker, outlining its configuration and how it operates. This is useful for understanding how different trading strategies are set up and what their intended behavior is.

## Function getTotalPercentClosed

This function, `getTotalPercentClosed`, tells you what portion of your position for a specific trading pair is still open. Think of it as a percentage – 100% means you haven't closed anything yet, and 0% means the entire position has been closed. 

It's particularly helpful if you've been adding to your position over time through dollar-cost averaging (DCA) because it accurately reflects the percentage even with those multiple entries and partial closes. 

You don't need to specify whether you're in backtest mode or live trading; the function figures that out on its own. You just need to provide the symbol of the trading pair you're interested in, like "BTCUSDT".


## Function getTotalCostClosed

`getTotalCostClosed` helps you figure out how much money you’ve invested in a specific trading pair, like BTC/USD. It tells you the total cost basis of any currently open positions, considering things like dollar-cost averaging (DCA) from multiple purchase points and partial sales. The framework intelligently determines whether it’s running a backtest or a live trading scenario.

You just need to provide the symbol of the trading pair you’re interested in, and it will return the total cost in dollars.

## Function getTimestamp

The `getTimestamp` function provides a way to retrieve the current timestamp within your trading strategy. It's a handy tool for ensuring your actions happen at the right time, whether you're running a backtest or live trading. During a backtest, it will return the timestamp associated with the specific historical timeframe being analyzed. When running live, it gives you the current, real-time timestamp.


## Function getSymbol

This function retrieves the symbol you're currently trading, like 'BTCUSDT' or 'ETHUSD'. It's a simple way to find out which asset the backtest is focused on. The function returns a promise that resolves to a string containing the symbol.

## Function getStrategyStatus

This function lets you peek into the current state of your trading strategy during a backtest or live trading session. It gives you a snapshot of what's happening behind the scenes, including signals that are waiting to be processed, actions that haven't been finalized, and the ID of the signal currently being handled. Think of it as a way to check on the strategy's progress without interfering with its execution.  You provide the symbol of the trading pair (like BTCUSDT) to see the status specifically for that instrument. It figures out if it’s running a backtest or a live trading session automatically.

## Function getStrategySchema

This function helps you find the blueprint for a specific trading strategy. It takes the strategy's unique name as input and returns a detailed description of that strategy, including what data it needs and how it's structured. Think of it like looking up the instructions for building a particular strategy. You'll need to know the exact name of the strategy you're interested in to use this function.

## Function getSizingSchema

This function lets you access pre-defined strategies for determining how much of your capital to use for each trade. It essentially finds a specific sizing method based on a name you provide. Think of it like looking up a particular recipe for trade size – you give it the recipe's name, and it returns the detailed instructions. You need to know the exact name of the sizing strategy you're looking for to use this function.


## Function getSignalState

The `getSignalState` function helps retrieve a specific value associated with the active trading signal. It figures out which signal is active based on the environment it's running in.

If there isn't an active signal, it will let you know and use the default starting value you provide.

This function is particularly useful for more complex trading strategies, like those using AI, where you need to track data about each trade (like how long it's open or its maximum gain) over time. The examples given demonstrate how it can be used to manage risk and identify opportunities for exiting trades.

The function takes the trading symbol and a configuration object as inputs. The configuration object contains the name of the data bucket and the initial value to use if no active signal is found.

## Function getSessionData

This function lets you retrieve data that’s associated with a specific trading symbol and persists across candles during a backtest or live trading session. Think of it as a way to store information that you want to keep handy throughout a run, even if the process restarts. It’s excellent for caching calculations, remembering the state of indicators, or holding onto data needed for decision-making across multiple candles. 

The function takes the trading symbol as input and returns the session data, or null if no data exists for that symbol. It cleverly figures out whether you're in a backtest or live mode without you having to tell it.


## Function getScheduledSignal

This function helps you find out what scheduled signals are currently running for a particular trading pair. Think of it as checking if a pre-planned signal is active right now. 

It will return information about that signal if one is found, and if nothing is scheduled, it will simply return null, indicating no signal is active. 

It cleverly figures out if you're in a backtesting simulation or live trading environment without you needing to tell it.

You just need to provide the symbol of the trading pair you’re interested in, like 'BTCUSDT'.


## Function getRuntimeInfo

This function gives you important details about how your backtest or trading system is currently running. It pulls together information like which asset you're trading, the exchange you're connected to, the timeframe you're using, and the specific strategy that’s active. Essentially, it tells you the context of the current execution, whether you're in a historical backtest or a live trading session. You can use this to adapt your code based on the environment.


## Function getRiskSchema

This function lets you fetch a pre-defined structure for managing risk, identified by a specific name. Think of it as looking up a template to ensure consistency when evaluating risk factors in your trading strategies. You provide the name of the risk you're interested in, and it returns the associated schema that describes its details. This helps standardize how risk is calculated and reported within the backtest-kit framework.

## Function getRawCandles

The `getRawCandles` function allows you to retrieve historical candlestick data for a specific trading pair and timeframe. You can easily control how many candles you want and the date range you're interested in. 

It's designed to be reliable, ensuring that your backtests aren't skewed by looking into the future.

Here's how you can use the function:

*   You can provide a start date, end date, and the number of candles to retrieve.
*   You can just give a start date and end date and the system will automatically determine the number of candles within that period.
*   Or, you could specify an end date and a number of candles, and the function calculates the starting date.
*   Even just specifying the number of candles will work, using a default starting point. 

The function handles date validation to make sure you’re not asking for data beyond available history.

**Parameters:**

*   `symbol`: The trading pair you're interested in (like "BTCUSDT").
*   `interval`: The timeframe for the candles (options include "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", and "8h").
*   `limit`: The number of candles you want to retrieve (optional).
*   `sDate`: The starting date in milliseconds (optional).
*   `eDate`: The ending date in milliseconds (optional).


## Function getPositionWaitingMinutes

This function lets you check how long a signal has been waiting to be activated for a specific trading pair. It will give you a number representing the waiting time in minutes. 

If no signal is currently scheduled for that particular trading pair, the function will return null.

You provide the symbol of the trading pair (like "BTC-USDT") as input to get the waiting time.

## Function getPositionPnlPercent

This function helps you understand how profitable your current open trades are. It calculates the unrealized profit or loss as a percentage, considering factors like partial trade closures, multiple entries (like with dollar-cost averaging), slippage, and trading fees.

If there aren't any open trades currently being managed, it will return null. 

It simplifies the process by automatically determining whether the backtest is running in a simulation or a live environment, and it fetches the latest market price for accurate calculations. You just need to provide the trading pair symbol like "BTCUSDT."


## Function getPositionPnlCost

This function helps you understand how much profit or loss you're currently holding on a trade. It calculates the unrealized profit or loss in dollars for a trade that's still open, using the current market price. 

The calculation takes into account things like how much you invested, any partial closes you've made, how you entered the trade (like dollar-cost averaging), potential slippage and trading fees. If there’s no ongoing trade, the function will return null. 

You don’t need to worry about whether you’re in a testing or live trading environment or retrieving the latest price; it handles those automatically. You simply provide the symbol of the trading pair you're interested in.


## Function getPositionPartials

This function helps you track how your trades are being partially closed out. It gives you a list of each time a portion of your position was closed for either profit or loss, providing details about the price at which it happened and the accumulated cost basis at that point. 

If no trade is currently in progress, the function will return null. If partial closes have occurred, you’ll get an empty array.

For each partial close, you’ll see the type (profit or loss), the percentage of the position closed, the current price used for the execution, the cost basis at the time, and how many DCA entries were included. The function requires the symbol of the trading pair you’re interested in.


## Function getPositionPartialOverlap

This function helps you avoid accidentally closing out a portion of your position multiple times at roughly the same price. It checks if the current market price is close to a price where you’ve already started a partial closing process.

Think of it as a safety check to prevent unwanted repeats.

It looks at previously executed partial closing orders and sees if the current price falls within a certain acceptable range around those prices – a range determined by configurable percentages. If the current price is within that range, it means a partial close is already in progress, and the function returns true. If there are no past partial closes or the current price is too far from them, it returns false, indicating it's safe to proceed with a potential partial close. You can adjust the sensitivity of this check by providing a `ladder` parameter that controls how wide the acceptable price range is.

## Function getPositionMaxDrawdownTimestamp

This function helps you find out when a specific trading position experienced its biggest loss. It looks back at the entire history of that position, identifies the point where the price dipped the lowest, and then tells you the exact timestamp of that event. 

If there isn't an active trade open for the given symbol, it will return null, meaning no drawdown timestamp can be determined. 

You'll need to provide the symbol of the trading pair (like BTC-USDT) to get the timestamp.


## Function getPositionMaxDrawdownPrice

This function helps you understand the most significant loss a specific trading position has experienced. It looks at the historical price data for a given symbol and finds the lowest point the price reached while the position was active.

Essentially, it's like finding the 'bottom' of a price decline for a particular trade.

If there’s no existing trading signal for that symbol, the function will return null.

You provide the symbol of the trading pair (like BTC-USDT) to get this drawdown information for that specific position.


## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand the performance of a specific trading position. It calculates the maximum drawdown in percentage terms based on the profit and loss (PnL) of that position. Essentially, it tells you the biggest percentage loss the position experienced from its highest point.

If there's no active signal for the specified trading pair, the function will return null, indicating that data isn't available. You simply provide the symbol of the trading pair you're interested in to get this drawdown information.


## Function getPositionMaxDrawdownPnlCost

This function helps you understand the maximum drawdown experienced by a specific trading position. It calculates the financial cost, expressed in the quote currency, incurred when the position hit its lowest point. Essentially, it tells you how much money you would have lost at the worst possible time for that position. 

If there's no active trading signal for the position, the function will return null.

To use it, you'll need to provide the symbol of the trading pair you're interested in, like "BTC-USDT."


## Function getPositionMaxDrawdownMinutes

This function tells you how much time has passed since your position experienced its lowest point, or maximum drawdown. It essentially measures the duration of the biggest loss you've had so far for a specific trading pair. The number represents minutes, and it will be zero if the lowest point just happened. If there's no open position for the given symbol, it won't return a value. You provide the symbol, like "BTCUSDT," to get the drawdown time for that particular trade.

## Function getPositionLevels

getPositionLevels lets you see the prices at which your initial buy and any subsequent DCA buys were made for a particular trading pair. Think of it as a way to track your DCA entries.

If there's no active trade signal, it will tell you with a `null` return.

If you only made one initial buy, it will return an array containing just that original price.

Otherwise, you'll get an array listing the original entry price, followed by all the prices where you added more buys using commitAverageBuy. This lets you review the progression of your DCA strategy.


## Function getPositionInvestedCount

getPositionInvestedCount helps you track how many times a position has been adjusted through dollar-cost averaging (DCA). 

It tells you the number of DCA entries made for a specific trading pair. A value of 1 indicates the initial trade; higher numbers mean subsequent DCA buys.

If there’s no active trade to track, the function returns null.

The function automatically determines whether it's running in a backtest or live environment. 

You simply provide the trading pair symbol to get this information.

## Function getPositionInvestedCost

This function helps you figure out how much money you've invested in a particular trading pair, like BTC/USD. It calculates the total cost based on all the average buy orders that have been placed. 

If no orders are pending, it will return null. 

The function intelligently knows whether it's running in a backtest or live trading environment. You just need to provide the symbol of the trading pair you’re interested in.

## Function getPositionHighestProfitTimestamp

This function helps you find out exactly when a specific trade (identified by its symbol) made the most money during its active period. 

It returns a timestamp, which is like a precise date and time, marking that peak profit moment.

If there's no trade history or signals associated with the given symbol, it will return null, indicating no profit information is available. You'll need to provide the trading symbol, such as "BTCUSDT", to get the timestamp.

## Function getPositionHighestProfitPrice

This function helps you find the highest price your position has reached while being profitable. It essentially remembers the best price achieved in a favorable direction since the position began.

For long positions, it tracks the highest price above the initial entry price. For short positions, it tracks the lowest price below the entry price.

It provides this information for a specific trading symbol.

You'll always get a value (like the entry price itself) as long as the position is active; otherwise, it will return null, indicating no signal is pending.


## Function getPositionHighestProfitMinutes

This function tells you how long ago your current trading position reached its highest profit. 

It essentially measures the time passed since the position's peak performance. 

Think of it as a way to see how far your position has fallen from its best point.

The value will be zero if you're checking it at the precise moment the peak profit was achieved.

You'll get a null value back if there are no active signals for the specified trading pair.

The input is the symbol of the trading pair you're interested in, like "BTCUSDT".

## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position has moved from its best possible profit. It calculates the difference between the highest profit percentage achieved so far and the current profit percentage, but it only considers the positive difference – meaning it won’t show a negative value even if the current profit is lower than the peak.  If there's no trading activity yet, the function won't return anything. You provide the trading pair symbol (like 'BTCUSDT') to get the information specific to that pair.

## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your current trading position is from its best possible profit. It calculates the difference between the peak profit you could have achieved and what you've made so far.

Think of it as a measure of how much room you still have to gain.

The function takes the trading symbol (like "BTC-USDT") as input.

It will return a number representing this distance in profit and loss (PnL) cost, or it will return nothing if there’s no active trade signal.


## Function getPositionHighestProfitBreakeven

This function helps determine if a trade could have reached a breakeven point at its peak profit. It checks if, mathematically, the highest profit achieved during a trade was still achievable without losses.

If there are no open trades or signals, the function will let you know by returning null.

To use it, you’ll need to provide the trading pair symbol you’re interested in, like 'BTCUSDT'.

## Function getPositionHighestPnlPercentage

This function helps you understand how well a specific trading position performed. It tells you the highest percentage profit achieved during the entire time the position was open. 

Think of it as finding the peak of a hill – it shows the moment when the position was most profitable.

To use it, you need to provide the trading symbol, like "BTC-USDT".

If there's no record of a profitable price for that position, the function will return null.

## Function getPositionHighestPnlCost

This function lets you find the highest profit-and-loss cost that occurred while a trading position was active. Specifically, it looks at the moment the best (most profitable) price was achieved for a given trading pair. 

If there isn't a signal pending for that position, the function will return null.

You provide the symbol of the trading pair (like BTC-USD) to identify the position you're interested in. The function returns a number representing that highest PnL cost, expressed in the currency of the quote asset.

## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand how risky a specific trading position has been. It calculates the largest percentage drop in profit a position experienced from its peak to its lowest point.

Think of it as measuring the "depth" of the worst loss a trade has seen.

The result is expressed as a percentage – a higher number means a greater potential for loss.

If there's no active trading signal for the specified trading pair, the function won’t be able to provide a value and will return null.

You need to provide the trading pair symbol, like "BTCUSDT", to check the drawdown of that particular position.

## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand how far your position is from its lowest point during a drawdown, expressed as a profit and loss (PnL) cost. It calculates the difference between your current PnL and the lowest PnL your position has seen, ensuring the result is never negative (since a drawdown can't increase your profit).  Essentially, it’s a measure of how much room your position has to recover from a previous loss. If there’s no active trading signal for the specified symbol, the function won’t return a value. You need to provide the trading pair symbol (like "BTC-USDT") to retrieve this data.

## Function getPositionEstimateMinutes

This function helps you understand how long a trading position is expected to last. It looks at the current pending signal and tells you the estimated duration in minutes. Think of it as checking the planned lifespan of a trade.

If there’s no active signal currently, it won't be able to provide an estimate and will return null.

You provide the trading symbol, like "BTCUSDT," to see the estimated time for that specific pair.

## Function getPositionEntryOverlap

getPositionEntryOverlap helps avoid accidentally entering multiple DCA positions at roughly the same price.

It checks if the current price is close enough to one of your existing DCA entry levels – essentially, it sees if you’re already within a tolerance zone around a previous price.

The function returns true if the current price falls within a specified range around any of your existing DCA levels, which helps to prevent unwanted overlapping entries. If no DCA entries exist, it will return false.

You can customize how close is "too close" using the `ladder` parameter, letting you adjust the tolerance zone. The ladder parameter dictates how much price fluctuation is acceptable before a new DCA entry is allowed.

## Function getPositionEntries

getPositionEntries lets you peek at the history of how a trade was built up. It gives you a list of the prices and costs for each part of a position, whether it was the initial purchase or a later DCA (Dollar Cost Averaging) step. If there's no ongoing trade being built, the function will tell you that. If a trade *is* in progress but no DCA has happened yet, you’ll see a list containing only the opening price and cost. To see this information, you simply provide the symbol of the trading pair, like "BTC/USDT."

## Function getPositionEffectivePrice

This function helps you determine the average entry price for a trade you're currently setting up. It calculates a weighted average, taking into account any previous trades and how much you’ve spent. 

It figures this out using a special method that accounts for the cost of each purchase.

If you've closed parts of your position before, it calculates the price carefully, combining the prices from those partial closures with any later additions to your position. If you haven't used DCA, it's simply the opening price of the trade. 

If no trade is currently being prepared, the function will let you know by returning a null value. It cleverly adapts to whether you're running a backtest or a live trade.

You only need to provide the symbol of the trading pair (like BTCUSDT) as input.

## Function getPositionDrawdownMinutes

This function helps you understand how long a trade has been losing ground since its most profitable point. It tells you the number of minutes that have passed since the price peaked for that specific trading pair.

Think of it as a measure of how far a trade has fallen from its best performance. 

The value will be zero right when the peak profit is achieved, and it steadily increases as the price moves lower.

If there's no active trade happening for the specified symbol, the function will return nothing. You need to provide the symbol of the trading pair you are interested in.

## Function getPositionCountdownMinutes

getPositionCountdownMinutes calculates how much time is left before a trading position expires. It looks at when the position was initially flagged as pending and compares that to an estimated expiration time.

The function will return the remaining time in minutes, but it won't ever show a negative number – if the estimated time has already passed, it returns zero. If a pending signal isn’t found for the specified trading pair, the function will return null.

You provide the symbol of the trading pair (like "BTCUSDT") to get the countdown for that specific position.

## Function getPositionActiveMinutes

getPositionActiveMinutes helps you understand how long a particular trade has been running. It tells you the number of minutes a position has been open, giving you a sense of its duration. If there's no active signal for that trade, it will return null, indicating that it can't calculate the active time. You provide the trading pair symbol, like "BTCUSDT," and it gives you back the time in minutes.

## Function getPendingSignal

This function lets you check if your trading strategy currently has a pending order based on a signal. 

It essentially tells you if a signal is waiting to be executed. 

If there’s no pending signal for a particular trading pair (like BTC/USDT), it will return nothing.

The function automatically figures out whether it's running a backtest or a live trade, so you don't need to worry about specifying that.

You just need to provide the symbol of the trading pair you’re interested in.

## Function getOrderBook

This function lets you retrieve the order book for a specific trading pair, like BTCUSDT. 

It pulls data from the connected exchange.

You can optionally specify the depth, which controls how many levels of bids and asks you receive. If you don’t provide a depth, it uses a default value.

The function considers the current time when fetching the order book, which is important whether you're testing past trades or live trading. The exchange itself decides how to use this timing information.


## Function getNextCandles

This function helps you grab a set of future candles for a specific trading pair and time interval. Think of it as requesting a batch of candles that come *after* the point in time the backtest is currently at. It utilizes the underlying exchange's mechanism to get those candles, ensuring you're getting data that aligns with how the exchange would have provided it. You just need to specify the symbol (like BTCUSDT), the candle interval (like 1 minute, 1 hour, etc.), and how many candles you want to retrieve.

## Function getMode

This function tells you whether the backtest-kit framework is currently running a historical simulation (backtest) or a live, real-time trading session. It returns a simple indicator: either "backtest" or "live". You can use this to adjust your code's behavior depending on the environment it's operating in.


## Function getMinutesSinceLatestSignalCreated

This function helps you figure out how much time has passed since the last trading signal was generated for a specific asset, like BTC-USD. It gives you the number of minutes that have gone by, rounding down to the nearest whole minute. 

It doesn't matter if the previous signal is still active or already closed - it just looks at the very last one that was recorded. This is handy for things like making sure you wait a certain amount of time before placing another trade after a stop-loss order.

The function first checks your historical backtesting data and then checks your live data to find that signal. If no signals have ever been created for that asset, it returns null. It automatically knows whether it's running in backtest mode or live mode. 

You just need to tell it which asset you're interested in, using its symbol.

## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand the riskiness of a trading strategy by calculating the maximum drawdown. It looks at the highest profit achieved and the lowest point of loss (drawdown) for a specific trading pair, like 'BTC-USDT'. The result is a percentage representing the difference between those two points, but it will always be zero or positive. If there's no trading activity for that symbol, it won’t provide a result.

## Function getMaxDrawdownDistancePnlCost

This function helps you understand the potential risk of a trading strategy by calculating the maximum drawdown distance based on profit and loss. It looks at the difference between the highest profit achieved and the lowest point of loss, but only considers the positive difference – essentially, the largest potential loss from a peak. The result represents the cost distance.

To use it, you simply provide the trading symbol (like "BTC/USD") and it will return a number.

If there's no trading activity or signals for the specified symbol, it won't return a value.


## Function getLatestSignal

This function helps you retrieve the most recent trading signal – whether it's still pending or has already closed – for a specific trading pair. It doesn’t differentiate between active and closed signals, simply providing the one that was recorded most recently. This can be helpful for things like cooldown periods; for example, you might want to prevent opening a new trade for a certain amount of time after a stop-loss is triggered. The function looks for signals first in the backtest data and then in live data, and will return nothing if no signals exist. It figures out whether you’re in backtest or live mode automatically. You provide the trading pair's symbol as input.

## Function getFrameSchema

The `getFrameSchema` function helps you find the blueprint, or schema, for a specific frame within your backtest. Think of it like looking up the definition of a particular component in your trading system. You give it the name of the frame you're interested in, and it returns detailed information about what that frame contains and how it operates. This is useful when you need to understand or programmatically interact with the structure of a frame.


## Function getExchangeSchema

This function helps you find information about a specific cryptocurrency exchange that your backtesting system understands. It’s like looking up the details of how to connect to and retrieve data from a particular exchange. You give it the name of the exchange, and it returns a set of rules and data structures defining how that exchange works. This is useful for ensuring your backtesting strategy is compatible with the exchange data you're using.

## Function getDefaultConfig

This function provides a set of pre-defined settings for the backtest-kit framework. Think of it as a template to get you started—it shows you all the adjustable options and what they're set to by default. It's a great way to understand the different levers you can pull to customize your backtesting process. This default configuration covers things like how often data is fetched, limits on signal generation, and settings for reports and notifications.

## Function getDefaultColumns

This function provides the standard set of columns used when generating reports. Think of it as a template for how your reports will look. It gives you a peek at all the different types of data—like strategy performance, risk metrics, or scheduled events—that can be displayed as columns. You can inspect this configuration to understand the available options and how they are pre-defined before customizing them for your specific reporting needs.

## Function getDate

This function retrieves the current date, and its behavior changes depending on whether you're running a backtest or in live trading mode. When backtesting, it provides the date associated with the timeframe you're analyzing. If you’re live, it returns the actual, current date. Essentially, it gives you the date relevant to the context of your trading.

## Function getContext

This function gives you access to the current method's environment. Think of it as a way to peek under the hood and see what's happening during a particular step in your trading strategy's execution. It returns an object filled with details about the method, allowing you to customize behavior or access relevant data.

## Function getConfig

This function lets you peek at the system’s core settings. It returns a snapshot of all the configuration values, like how often tasks run, limits on data processing, and flags controlling various features. Importantly, it provides a copy of these settings, so you can look at them without accidentally changing the actual running configuration. Think of it as a read-only window into how the backtest kit is set up.

## Function getColumns

This function gives you a peek at how your backtest data will be displayed in the report. It provides details about the columns used for different aspects like closed trades, heatmaps, live data, partial fills, breakeven points, performance metrics, risk management, scheduling, strategy events, synchronization, profit tracking, maximum drawdown, walker pnl data, and overall strategy results. Think of it as a read-only snapshot of the column definitions—you can look, but don't change them directly.

## Function getClosePrice

This function helps you quickly retrieve the closing price from the most recent candle available for a specific trading pair and timeframe. You provide the symbol, like "BTCUSDT" for Bitcoin against USDT, and the candle interval, such as "1m" for one-minute candles or "4h" for four-hour candles. It returns a promise that resolves to the closing price of that last completed candle, giving you a snapshot of the recent market behavior.


## Function getCandles

This function allows you to retrieve historical candlestick data for a specific trading pair. You provide the symbol, like "BTCUSDT", the desired timeframe for the candles (options include 1 minute, 3 minutes, 15 minutes, and several longer intervals), and the number of candles you want to retrieve. It essentially asks the underlying exchange to provide this data, pulling it backwards from the present time. It's a convenient way to access past price action for analysis or backtesting purposes.


## Function getBreakeven

This function helps you determine if a trade has become profitable enough to cover the initial costs. It calculates a threshold based on slippage and trading fees, and then checks if the current price has exceeded that threshold. You provide the trading pair symbol and the current market price, and the function tells you whether the trade has reached its breakeven point, meaning it's profitable enough to cover the costs of getting into the trade. This function adjusts automatically based on whether you're running a backtest or a live trading environment.

## Function getBacktestTimeframe

This function helps you find out the dates and times that your backtest covers for a specific trading pair, like BTCUSDT. It essentially tells you the time period being analyzed. You provide the symbol of the trading pair you're interested in, and it returns an array of dates representing the backtest timeframe for that pair. This is useful for understanding the scope of your backtesting results.

## Function getAveragePrice

This function helps you figure out the average price of a trading pair, like BTCUSDT. It uses a method called VWAP, which takes into account both the price and the trading volume. Specifically, it looks at the last five minutes of trading data to determine this average. If there's no trading volume reported, it will just use the average of the closing prices instead. You give it the symbol of the trading pair you're interested in, and it returns a number representing the average price.

## Function getAggregatedTrades

This function retrieves historical trade data for a specific trading pair, like BTCUSDT. It pulls this data directly from the exchange you're using.

You can request all trades within a set timeframe, or specify a `limit` to only get the most recent trades. The function ensures you get the requested number of trades by potentially retrieving multiple pages of data. This is useful for analyzing past market activity.


## Function getActionSchema

This function helps you find the blueprint for a specific action within your trading strategy. Think of it as looking up the definition of what a particular action, like "buy" or "sell", should do. You provide the name of the action you're interested in, and it returns a detailed description of that action, outlining what parameters it expects and what kind of data it uses. It's useful for validating your actions or understanding how they’re structured.

## Function formatQuantity

This function helps you display the correct amount of a cryptocurrency or asset when placing orders. It automatically adjusts the number of decimal places based on the specific trading pair, ensuring that your orders comply with exchange requirements. You provide the trading pair symbol, like "BTCUSDT", and the raw quantity value, and it returns a formatted string representing that amount. This ensures accurate order placement and avoids potential rejection due to incorrect formatting.


## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes the symbol, like "BTCUSDT", and the actual price value as input. Then, it automatically adjusts the number of decimal places based on the rules of the specific exchange you're using, ensuring your prices look accurate and consistent. Basically, it handles the formatting details so you don’t have to.

## Function dumpText

The `dumpText` function lets you output raw text data, associating it with a specific signal within your backtest or live trading environment. Think of it as a way to record observations or data points related to a particular trading signal. It handles the complexities of knowing which signal is active and whether you're in a backtesting scenario, so you don't have to worry about that.

The function takes an object containing the bucket name, a unique identifier for the data, the actual text content, and a description to explain the data. It then promises to complete the dumping process without returning any value.


## Function dumpTable

This function helps you display data in a nicely formatted table. It takes an array of objects (like data from a trading simulation) and turns it into a readable table. The table will be linked to the specific trading signal that was running when it was created. 

It intelligently figures out whether you're running a backtest or a live trading session, and handles the details of setting up the signal automatically. The column headers will be determined by examining all the keys present in your data, ensuring everything is displayed clearly. You provide the data, and this function does the presentation work for you.


## Function dumpRecord

This function lets you save a piece of data, which you might think of as a single observation or event, into a specific storage location. It’s designed to work with the backtest-kit system and automatically adjusts based on whether you're running a test or a live trading session.

The data you provide is structured as a simple collection of key-value pairs.

It takes a description to help you understand what the data represents. 
The function handles the details of which signal to associate with this data, automatically choosing the appropriate one based on the system’s current state.


## Function dumpJson

This function helps you save complex data structures, like those generated during backtesting, as neatly formatted JSON. It's like taking a snapshot of your data and storing it in a structured way. The `dumpJson` function automatically knows whether it's running a backtest or live trading, and handles the signal (a communication channel) for you, so you don't have to worry about those details. You provide a name for your data ("dumpId"), a bucket to store it in ("bucketName"), the actual data you want to save (in the "json" field), and a brief description. It takes care of the technicalities of writing this data out.


## Function dumpError

This function lets you record detailed error information, associating it with a specific data bucket and a unique identifier. Think of it as a way to permanently log error details alongside your trading activity. It automatically figures out whether you're running a backtest or a live trading session and handles the signal context, simplifying the error reporting process. You provide the function with information about the error, including a description and its location, and it takes care of the rest.

## Function dumpAgentAnswer

This function helps you save detailed records of conversations with the AI agent during a trading simulation or live trading. It takes all the messages exchanged with the agent, along with a description, and stores them together, linked to a specific trading signal. 

Essentially, it’s a way to create a complete audit trail of the agent’s reasoning and actions. The function takes care of figuring out which signal is currently active and automatically adapts to whether you're running a test or a real-time trading session. You just provide the information about the messages and a short description of what’s happening.


## Function createSignalState

This function helps you manage the state of a trading signal in a simple and organized way. It creates two functions: one to get the current state and another to update it.

You don’t have to worry about specifying a signal ID because it automatically figures out whether you're in backtesting or live trading mode.

It’s especially useful for strategies that track details on each trade, like how long a trade lasts or its maximum profit—perfect for complex strategies using large language models. 

Think of it as a way to keep track of important data points for your trades, making it easier to analyze and refine your strategy.

## Function commitTrailingTakeCost

This function lets you change the take-profit price for a trade to a specific price level. It's helpful if you want to set a fixed target for your profits.

Essentially, it adjusts the trailing take-profit to match the price you provide.

It simplifies the process by automatically figuring out if you're in a backtest or a live trading environment and also gets the current market price for you. 

You'll need to give it the trading pair symbol and the new, desired take-profit price. It returns a promise that resolves to a boolean indicating whether the operation was successful.

## Function commitTrailingTake

This function helps you fine-tune your take-profit orders by adjusting the distance from the original take-profit level. It's designed to keep your trading strategy responsive while avoiding compounding errors that can happen with repeated adjustments. 

Think of it as a way to nudge your take-profit order closer to or further from your entry price, always based on where you initially set that take-profit.

It’s important to understand that the adjustments are made relative to the *original* take-profit distance, not the current trailing take-profit, ensuring accuracy over time.

The function only makes changes that make your take-profit *more conservative*—meaning it will only move it closer to your entry point. For long positions, it brings the TP down, and for short positions, it raises the TP. The `percentShift` value determines the size of this adjustment.

It automatically knows whether it’s running in a backtest or a live trading environment. You just provide the symbol, the percentage adjustment you want to make, and the current price.

## Function commitTrailingStopCost

This function lets you change the trailing stop-loss price to a specific value. It handles the technical details of calculating how much the percentage shift needs to adjust, making it easier to manage. 

It figures out whether you're running a backtest or a live trade automatically.

It also gets the current price to make the calculation accurate.

You provide the trading symbol and the new stop-loss price you want to set. The function will then return a boolean indicating whether the update was successful.


## Function commitTrailingStop

This function helps fine-tune your trailing stop-loss orders. It lets you adjust how far away your stop-loss is from your entry price, expressed as a percentage. 

It's especially important to remember that it always bases its calculations on the initial stop-loss distance you set, not any adjustments that might have already been made. This keeps things accurate and avoids compounding errors.

The function prioritizes protecting your profits. If you try to loosen your stop-loss too much, or move it in a direction that doesn't provide better protection, it won't make the change. For long positions, the stop-loss can only move upward (away from your entry). For short positions, it can only move downward (towards your entry).

It figures out whether you're in a backtesting environment or live trading mode automatically. 

To use it, you’ll need the trading pair symbol, the percentage change you want to make to the initial stop-loss, and the current market price.

## Function commitSignalNotify

This function lets you send out informational messages related to your trading strategy. Think of it as a way to add notes or alerts during a backtest or live trade – it won't change your positions, but it will give you extra details about what's happening. It automatically includes information like the trading pair, the strategy name, the exchange, and the current price, simplifying the notification process. You can also add custom details to your notification using the payload parameter to tailor the message to your specific needs.


## Function commitPartialProfitCost

The `commitPartialProfitCost` function lets you close a portion of your trading position when you’ve made a profit, based on a specific dollar amount. It simplifies the process by automatically calculating the percentage of your initial investment that needs to be closed to achieve that dollar amount. 

Essentially, it’s a shortcut for closing off some of your position, moving towards your target profit.

The function will automatically determine if it's running in a backtesting or live environment and gets the current price to make calculations.

You just need to specify the trading symbol and the dollar amount you want to close.


## Function commitPartialProfit

This function lets you automatically close a portion of your trading position when the price moves favorably, essentially moving you closer to your target profit. It’s designed to take profit on a percentage of your open position.

The function handles whether you're running a backtest or a live trade automatically, so you don’t need to worry about configuring that.

You'll need to provide the symbol of the trading pair (like BTCUSDT) and the percentage of your position you want to close – for example, 50% would close half of your active position. Keep in mind that the price must be moving in the direction of your take profit for this function to execute.


## Function commitPartialLossCost

This function lets you partially close a position to limit losses, specifying the dollar amount you want to reduce the position by. It's essentially a shortcut – you tell it how much in dollars you want to close, and it figures out the corresponding percentage of your position.

The system works best when the price is trending in the direction of your stop-loss order.

It handles the technical details for you, like determining whether it’s running in a backtest or live environment and fetching the current price. You just provide the symbol and the dollar amount you want to use for the partial close.


## Function commitPartialLoss

The `commitPartialLoss` function lets you automatically close a portion of your open position when the price is heading towards your stop-loss level. It’s designed to help manage losses by closing a specified percentage of your position, like 25% or 50%, without needing to manually intervene. The function handles whether it's running in a backtesting environment or a live trading account, making it adaptable to different scenarios. To use it, you provide the symbol of the trading pair (like BTC/USDT) and the percentage of the position you want to close.

## Function commitCreateTakeProfit

This function tells the backtest kit that a take-profit order for an existing position has been filled on the exchange. It's used to handle situations where the actual order execution happens outside of the VWAP-based take-profit checks performed by the framework. Think of it as a way to reconcile what the strategy *thought* would happen with what *actually* happened in the market.

The function essentially confirms a close, marking it as a take-profit event and reporting it on the next tick. If there's no open position waiting for a take-profit, this function does nothing. The framework automatically knows if it's running a backtest or live, so you don't need to specify that.

You can also add an optional note or ID to the commit payload to provide more context around the trade.

## Function commitCreateStopLoss

This function lets you tell the backtest framework that a stop-loss order for a position has been triggered on the exchange. It’s used when the actual order gets filled, perhaps because of a price hitting a high or low, bypassing the usual VWAP-based stop-loss checks.

Think of it as confirming that the exchange has taken action on the stop-loss, and the position will be closed. 

The framework handles whether it's a backtest or live trading session automatically. If there's no pending signal, this function does nothing. You can also include extra information, like an ID and a note, when calling it to help with tracking and analysis.

## Function commitCreateSignal

This function lets you feed custom signals into your backtest or live trading environment, bypassing the usual signal retrieval process. You provide a data object (called a Signal DTO) that contains the details of your signal – think of it as giving the system a direct order.

It's smart about how it handles these signals: if you include a target price, it’ll try to execute the trade immediately if that price is already hit; otherwise, it'll wait for the price to reach that level.  If you don’t specify a price, the signal is processed right away.

Important: It makes sure only one signal or deferred action is being processed at a time, and the data you provide gets checked for validity. It figures out whether it's running a backtest or live trading automatically. You'll need to provide the trading pair symbol and the signal data object.


## Function commitClosePending

This function lets you clear a pending trading signal without interrupting your strategy's operation. Think of it as acknowledging a signal that was previously set but not yet acted upon. It doesn't halt the strategy or prevent it from generating new signals, nor does it set any stop flags. The function intelligently recognizes whether it's running in a backtest or live environment. You can optionally include details like an ID and note with the cancellation.

## Function commitCancelScheduled

This function lets you cancel a previously scheduled signal, essentially removing it from the queue. Think of it as hitting the brakes on a plan without stopping the whole process. It's useful if you've scheduled something but then changed your mind, and you want to keep the strategy running smoothly. Importantly, it doesn't interrupt any signals already in action and won't prevent the strategy from creating new signals. It automatically knows whether it's running in backtest or live mode.

You tell it which symbol the scheduled signal belongs to, and you can optionally add some extra information like an ID or a note to the cancellation.

## Function commitBreakeven

This function helps you automatically manage your stop-loss orders. 

It moves your stop-loss to the entry price, essentially eliminating risk, once the price has moved favorably enough to cover trading fees and a small buffer.

Think of it as a way to lock in profits when things are going well – it will happen without you needing to manually adjust anything.

The function handles things like determining whether it's running in a backtest or live trading environment and getting the current price for you. You only need to tell it which trading pair (symbol) to apply this to.

## Function commitAverageBuy

The `commitAverageBuy` function lets you add a new purchase to your dollar-cost averaging (DCA) strategy. It essentially records a purchase at the current market price, keeping a record of all your purchases to calculate an average price.

This function automatically figures out if it's running in a backtest or a live trading environment, and it grabs the latest price for you. It keeps track of the average purchase price and notifies the system that a new average buy has occurred. You just need to tell it the symbol you're trading, and optionally provide a cost.

## Function commitActivateScheduled

This function lets you trigger a scheduled trading signal to execute before the price actually reaches the predetermined entry price. 

Essentially, it's a way to proactively activate a strategy based on a scheduled signal. 

The function handles whether you're in a backtesting environment or live trading without you needing to specify.

You provide the symbol (like "BTCUSDT") and can optionally include a note or identifier for tracking purposes within the commit payload. Think of it as a way to manually "kick off" a signal, and the system will handle the rest.


## Function checkCandles

The `checkCandles` function is a quick way to see if your historical price data (candles) are already stored and ready to be used. It's designed to be efficient – instead of loading *all* the data, it only checks for the specific candles you expect. If even one candle is missing or out of sync, the whole check fails, letting you know you need to load or refresh the data. This function relies on a “persist adapter” to handle the actual data storage and retrieval.

## Function cacheCandles

The `cacheCandles` function helps make sure your trading data is readily available. It fetches candlestick data for a specific trading symbol, time period, and exchange.

It works in two steps: first, it verifies if the data already exists; if not, it downloads the missing pieces and re-checks. This ensures you have the necessary historical data for backtesting or other analyses.

You'll need to provide details like the symbol you're interested in (e.g., BTC/USDT), the data interval (e.g., 1 hour), the start and end dates for the data you need, the exchange it's from, and optional callbacks to monitor progress.

## Function addWalkerSchema

This function lets you register a walker, which is essentially a way to run multiple trading strategies against the same historical data and then compare how well they performed. Think of it as setting up a system to evaluate different approaches simultaneously. You provide a configuration object that defines how the walker should operate, including the specific metric used to assess the strategies. This enables systematic comparison and optimization of your trading strategies.

## Function addStrategySchema

This function lets you tell the backtest-kit about a new trading strategy you've created. Think of it as registering your strategy so the system knows how to use it.

When you add a strategy, the framework automatically checks that it's set up correctly, like making sure your price data and stop-loss/take-profit rules make sense. It also helps prevent the strategy from sending too many signals too quickly, and if something goes wrong while you're trading live, it can make sure your strategy’s settings are preserved.

You provide the strategy's configuration details, which is a structured object defining how the strategy works.

## Function addSizingSchema

This function lets you tell the backtest-kit how to determine the size of your trades. 

Think of it as setting up the rules for how much money you’ll risk on each trade.

You provide a configuration object that specifies things like whether you want to use a fixed percentage of your capital, a Kelly Criterion approach, or something based on Average True Range. 

It also allows you to set limits on how much you can risk per trade and define custom logic for calculating position sizes. The framework then uses this information during the backtest to simulate realistic trade sizing.


## Function addRiskSchema

This function lets you define how your trading system manages risk. It's a way to set limits, like the maximum number of positions you can have open at once, and to create custom checks for more complex risk scenarios, such as analyzing portfolio metrics or correlations. 

Think of it as registering a set of rules to keep your trading safe.

Importantly, multiple trading strategies can share the same risk management setup, so you can analyze how they interact and impact each other. The system keeps track of all open positions, allowing your custom risk checks to access that information.


## Function addFrameSchema

This function lets you tell the backtest-kit what kind of timeframes you want to use when running your simulations. Think of it as registering a new way to slice up your historical data into trading periods. 

You provide a configuration object that describes the timeframe's start and end dates, the interval (like daily, weekly, or monthly), and a function that will be called to generate those timeframes. This enables the backtest kit to understand your specific needs for timeframe generation. It’s essential to register these schemas before you begin a backtest.

## Function addExchangeSchema

This function lets you tell the backtest-kit framework about a new exchange you want to use for your trading simulations. Think of it as registering a data source – it tells the system where to find historical price data and how to interpret it. 

The exchange you register should be able to provide historical candlestick data, handle formatting of prices and trade sizes, and calculate the VWAP (Volume Weighted Average Price) based on recent trades. 

You'll need to create a configuration object that describes your exchange, and then pass it to this function to officially add it to the system.

## Function addActionSchema

This function lets you register a new action handler within the backtest-kit framework. Think of actions as a way to react to events happening during your backtest, like a signal being generated or a trade reaching a profit target. They're really useful for connecting your backtest to external systems - for example, sending notifications to a Discord channel when a trade is opened, logging detailed performance data, or even integrating with a state management library like Redux. Each action gets triggered alongside specific events during the backtest, giving it access to important information like the trade signals and profit/loss updates. You define the action's configuration using an object and pass it to this function to register it.
