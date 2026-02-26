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

## Function warmCandles

This function helps prepare your backtesting environment by pre-loading historical price data. It downloads and stores candle data for a specific period, which speeds up your backtest runs since the data doesn't need to be fetched repeatedly. You provide a start and end date, along with the desired time interval (like 1-minute, 5-minute, or daily), and it takes care of grabbing and persisting those candles. Essentially, it's a way to ensure your backtest has the data it needs readily available.

## Function validate

This function, `validate`, is your safety check before running backtests or optimizations. It makes sure all the components you're using – like exchanges, strategies, and sizing methods – are correctly set up and registered within the system. 

You can tell it to validate specific parts, or, if you leave it blank, it will check *everything* to ensure a complete and consistent configuration.  The good news is, it remembers its results, so it doesn't have to re-check things unnecessarily. This helps to catch potential errors early on and avoids headaches later in your trading process.

## Function stopStrategy

This function lets you pause a trading strategy, effectively halting it from creating any new buy or sell signals. Think of it as putting the strategy on hold. Any existing trades that the strategy is currently managing will still finish up normally. Whether you’re running a backtest or a live trading session, the strategy will gracefully stop at a suitable point, like when it's idle or a signal has completed. You simply need to provide the trading pair symbol (e.g., BTCUSDT) to tell the function which strategy to stop.

## Function setLogger

You can now control how backtest-kit reports its activities. The `setLogger` function lets you plug in your own logging system. This is helpful if you want to send logs to a specific place, like a database or a custom analytics tool, and automatically include important details like the trading strategy, exchange, and the asset being traded in each log message. Just provide an object that follows the `ILogger` interface, and all the framework's logging will go through it.

## Function setConfig

This function lets you adjust how the backtest-kit framework operates. Think of it as fine-tuning the engine before you start a simulation. You can modify specific settings to tailor the backtesting environment to your needs, overriding the default values.  There's also a special flag, `_unsafe`, that lets you bypass some safety checks – you'll only need this in certain testing scenarios. Basically, it gives you control over the overall behavior of the backtesting process.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, like the ones generated in markdown format. Think of it as tailoring the report to show exactly the data you want to see. You can adjust existing column definitions or add your own.

The `columns` parameter is where you specify your changes—it’s a partial configuration, meaning you don't need to redefine all the columns, just the ones you want to modify. 

There’s also an `_unsafe` option; use this with caution, typically only when you’re working in a testing environment and need to bypass the usual validation checks.

## Function overrideWalkerSchema

This function lets you tweak a previously defined strategy walker—think of it as modifying a blueprint for how your strategy is analyzed. It allows you to change specific parts of that walker’s configuration without completely rebuilding it.  Essentially, you provide a partial update, and the existing walker gets adjusted with only the changes you specify; everything else stays as it was. This is really useful when you want to compare strategies with slightly different analysis setups.

## Function overrideStrategySchema

This function lets you modify an already registered trading strategy. Think of it as making tweaks to an existing strategy’s configuration without completely replacing it. You provide a partial configuration – only the settings you want to change – and the function updates the strategy, leaving everything else untouched. It's useful for things like adjusting risk parameters or adding new indicators without rewriting the entire strategy definition.


## Function overrideSizingSchema

This function lets you tweak existing sizing configurations within the backtest-kit framework. Think of it as a way to fine-tune a sizing strategy without rebuilding it entirely. You can selectively update specific parts of a sizing schema, leaving the rest untouched. This provides flexibility when you want to make small adjustments to a strategy's position sizing behavior. Essentially, it allows for partial updates to existing sizing configurations.

## Function overrideRiskSchema

This function lets you tweak an already existing risk management setup within the backtest-kit framework. Think of it as making targeted adjustments – you provide only the parts of the risk schema you want to change, and the rest stays exactly as it was. It's useful when you need to fine-tune settings without completely rebuilding your risk configuration from scratch. This approach ensures you only modify what's necessary while preserving the integrity of your existing setup. It returns a promise resolving to the updated risk schema.

## Function overrideFrameSchema

This function lets you modify the way your data is structured for backtesting, specifically how timeframes are handled. Think of it as fine-tuning the existing setup for a particular timeframe.  Instead of creating a completely new timeframe configuration, you can just update specific parts of it, leaving the rest untouched. You provide a partial configuration – only the settings you want to change – and it returns the updated timeframe schema.

## Function overrideExchangeSchema

This function lets you tweak how backtest-kit interacts with a specific data source, like a historical price feed. Think of it as a way to make small adjustments to an exchange's settings without completely replacing its original configuration. You provide a set of changes you want to make – perhaps updating a symbol mapping or tweaking a data endpoint – and the function applies only those changes, leaving the rest of the exchange's setup untouched. This is handy for customizations or correcting minor discrepancies in data sources. The changes you provide should be a partial update of the expected exchange schema.

## Function overrideActionSchema

This function lets you tweak how your actions are handled within the backtest-kit framework without completely replacing the existing setup. Think of it as a way to make small adjustments, like changing a callback function or modifying a setting, without having to re-register the entire action handler. This is particularly helpful if you need to adapt your action behavior for different environments, like development versus production, or if you want to dynamically switch between different handler implementations. You only need to provide the parts of the action configuration you want to change—the rest will stay as they were.

## Function listenWalkerProgress

This function lets you keep track of how a backtest is progressing, especially useful when running multiple strategies. It provides updates after each strategy finishes within a backtest run. 

You provide a function that will be called with details about the progress. Importantly, even if your provided function takes some time to process the information, the updates will be handled one at a time, in the order they are received, preventing any unexpected conflicts or overlaps. This ensures a smooth and predictable flow of information about the backtest.


## Function listenWalkerOnce

This function lets you watch for specific progress updates from a trading strategy, but only once. You tell it what kind of update you’re interested in using a filter function – think of it as a rule that determines if an update is relevant to you. When an update matches your rule, a callback function you provide will be executed exactly one time. After that single execution, the listener automatically stops, so you don’t have to worry about managing subscriptions. It's perfect for situations where you only need to react to a certain event happening just once during the backtest.

The `filterFn` defines your criteria for matching events.
The `fn` is what happens when an event matches your criteria.


## Function listenWalkerComplete

This function lets you be notified when the backtest process finishes running all your trading strategies. Think of it as a way to listen for the "all done" signal from your backtest.  The notifications will come one after another, even if the code you provide to handle the notification takes some time to run. To make sure things stay orderly, it handles notifications in a controlled sequence.  You give it a function to execute when the test is complete, and it returns another function that lets you unsubscribe from these notifications later.

## Function listenWalker

The `listenWalker` function lets you tap into the progress of a backtest or simulation. It’s like setting up an observer that gets notified when each trading strategy finishes its run within the larger backtest process.

Think of it as receiving updates – one after another – as each strategy concludes. Importantly, even if your notification code takes some time to process (maybe it's doing some calculations), the updates still come in a controlled, sequential order to avoid any hiccups. This function helps you keep track of what’s happening during the backtest and respond to each strategy's outcome as it happens. You provide a function that will be called with details about each completed strategy.


## Function listenValidation

This function lets you keep an eye on potential problems during risk validation. It’s a way to get notified when something goes wrong while your system is checking signals. Whenever a validation check fails and throws an error, this function will call your provided callback function. 

The good thing is that these errors are handled one at a time, in the order they occur, even if your callback takes some time to run. This helps ensure a smooth and controlled monitoring process. Essentially, it provides a reliable way to debug and track any validation failures that might arise.

The function returns another function that you can call to unsubscribe from these validation error notifications when you no longer need them.

## Function listenStrategyCommitOnce

This function lets you react to specific changes happening within your trading strategy, but only once. Think of it as setting up a temporary listener. You define what kind of change you're interested in using a filter, and then provide a function that will run exactly one time when that specific change occurs. After it runs, the listener automatically disappears, so you don't have to worry about cleaning it up. It’s handy when you need to do something based on an initial strategy setup or a particular action, and then you’re done.

It takes two pieces of information:

*   A filter – this tells the function which events to look out for.
*   A callback function – this is the function that gets executed when a matching event occurs.

## Function listenStrategyCommit

This function lets you tap into what's happening with your trading strategies as they're being managed. It's like setting up a listener to be notified whenever changes occur, such as when a scheduled signal is cancelled, a pending order is closed, or partial profits/losses are taken. 

The notifications you receive will include information about adjustments to stop-loss and take-profit levels, and when a stop-loss is moved to breakeven. Importantly, these events are handled one at a time, even if your callback function takes some time to process, ensuring things happen in a controlled order. You’ll receive a function that, when called, will unsubscribe from these events.

## Function listenSignalOnce

This function lets you set up a listener that reacts to specific trading signals, but only once. You provide a filter – a way to identify the signals you're interested in – and a function to run when that signal arrives. Once the signal matches your filter, your function runs, and the listener automatically stops listening, preventing it from firing again. Think of it as a one-time alert for a particular market condition. It's handy when you need to react to a signal just once and then move on.

## Function listenSignalLiveOnce

This function lets you temporarily listen for specific trading signals coming directly from a live strategy run. Think of it as setting up a temporary alert. You tell it what kind of signal you’re interested in – for example, only signals that meet a certain condition – and then provide a function to execute when that signal arrives. Once that single signal triggers your function, the alert automatically disappears, so you don't have to worry about manually unsubscribing. It's a clean way to react to a one-off event during a live trading simulation.


## Function listenSignalLive

This function lets you tap into the live trading signals generated by backtest-kit. Think of it as subscribing to a stream of updates happening as your strategies run in real-time. It's designed for situations where you want to react to these signals as they come in, and crucially, it ensures these reactions happen in the order they were received. 

You provide a function, and this function will be called whenever a new signal event arrives from a Live.run() execution. This allows you to build custom logic to respond to these signals as your backtest is actively running. The function you pass will receive a special object containing details about the signal. When you’re done listening, the function returns another function that you can call to unsubscribe.

## Function listenSignalBacktestOnce

This function lets you temporarily listen for specific events happening during a backtest run. You provide a filter—a way to choose which events you're interested in—and then a function that will be executed only once when a matching event occurs. Think of it as setting up a temporary listener that responds to a particular signal and then quietly disappears afterward, ensuring you don't continue receiving those events unnecessarily. It’s useful for observing a single, specific moment within a backtest.

It only works during a backtest's `run()` execution.

You give it two things: a filter to specify which events you want to see, and a function that will perform an action when a matching event is found. The provided function will be called just once, and then the listener will automatically unsubscribe.

## Function listenSignalBacktest

This function lets you tap into the stream of data generated during a backtest run. It's like setting up a listener that gets notified whenever a signal is produced. The important thing is that these signals are processed one after another, ensuring you see them in the order they occur during the backtest. You provide a function that will be called with each signal event, allowing you to react to changes and analyze the backtest's progress. This is specifically for events coming from `Backtest.run()`, so you won't receive signals from other sources.


## Function listenSignal

This function lets you register a callback that will be notified whenever your trading strategy produces a signal. Think of it as setting up an observer that listens for important updates like when a trade is opened, active, or closed. The cool part is that these updates are handled one at a time, even if your callback function itself needs to do some asynchronous work. This ensures that signals are processed in the order they come and avoids potential conflicts from multiple operations happening simultaneously. You provide a function that will be executed with the relevant signal data, and this function returns another function which can be used to unsubscribe the listener.

## Function listenSchedulePingOnce

This function helps you react to specific ping events, but only once. You provide a filter – essentially a rule – to identify the events you're interested in. Once an event matches your rule, a provided function will run to handle it, and then the listener automatically stops. It's perfect when you need to respond to a particular event and don't want to keep listening afterwards. 

You define what events to watch for with `filterFn` and what to do with those events using `fn`. The function returns a way to stop listening whenever you want.

## Function listenSchedulePing

This function lets you keep an eye on signals that are waiting to be activated, like a heartbeat check. It sends a ping every minute while a signal is being monitored, giving you a way to track its status and potentially run custom checks. You provide a function that gets called each time a ping event occurs, allowing you to build your own monitoring logic around these scheduled signals. Essentially, it's a way to receive updates on the progress of waiting signals.


## Function listenRiskOnce

This function lets you set up a temporary listener for risk rejection events. You provide a filter – a test that determines which events you're interested in – and a function to run when a matching event occurs. The listener will only execute your function once when the filter condition is met, then it automatically stops listening. It’s great for situations where you need to react to a specific risk rejection just once and then move on.

You define what events you want to react to using the `filterFn`. 
Then you specify the action to take when a matching event is found with `fn`. 
Finally, the function returns an unsubscribe function, though this is automatically called after the first event.


## Function listenRisk

This function lets you monitor when trading signals are blocked because of risk rules. It’s like setting up a listener that only gets notified when something goes wrong with your risk controls, specifically when a signal is rejected. You'll receive events in the order they happen, and the system ensures these events are handled one at a time, even if your processing takes some time. This helps prevent your application from being overwhelmed with notifications and ensures everything is processed reliably. You provide a function that gets called whenever a risk rejection event occurs, giving you a chance to respond to the issue.

## Function listenPerformance

This function lets you keep an eye on how quickly your trading strategies are running. It essentially sets up a listener that will notify you whenever the system records a performance metric, like how long a specific operation took.  Think of it as a tool for spotting slowdowns or inefficiencies in your code. The events are delivered one at a time, even if your callback function needs to do something that takes a little while. This ensures things stay organized and avoids potential conflicts. You provide a function that will be called with these performance updates, and the `listenPerformance` function returns another function that you can use to unsubscribe later.

## Function listenPartialProfitAvailableOnce

This function lets you set up a listener that will trigger a specific action only *once* when a certain profit condition is met. You provide a filter – essentially a test – to define exactly which profit levels you're interested in. Once an event passes that test, your provided function will run, and then the listener automatically stops listening. It's great for situations where you need to react to a profit milestone just one time and don’t want to keep listening afterward. You’ll give it a function that determines if the profit event is relevant and a function to execute when it is.

## Function listenPartialProfitAvailable

This function lets you be notified when your trading strategy hits certain profit milestones, like reaching 10%, 20%, or 30% profit. It's like setting up checkpoints to monitor your progress. Importantly, the notifications are handled one at a time, even if the function you provide to handle them takes some time to complete. This ensures things don't get jumbled up or run concurrently, providing a reliable way to track your strategy's profitability. You provide a function that will be called each time a milestone is reached, and this function returns another function that you can use to unsubscribe from these updates later.

## Function listenPartialLossAvailableOnce

This function lets you set up a one-time alert for when a specific condition related to partial loss is met in your trading strategy. You provide a filter – essentially, a rule – that describes the exact situation you’re looking for.  Once that rule is triggered, a callback function you define will run just once, and then the listening stops automatically.  It's really handy for things like reacting to a very particular loss scenario without needing to manage ongoing subscriptions yourself. You give it a test to see if the loss data matches and then what you want to do when it does.

## Function listenPartialLossAvailable

This function lets you keep track of how much a contract has lost in value. It sends you notifications when the loss reaches specific milestones, like 10%, 20%, or 30% of the initial value. Importantly, these notifications happen one after another, even if your code takes some time to process each one, ensuring things don't get out of order. You provide a function that will be called whenever a loss milestone is hit, and this function will receive information about the contract's current loss.  The function also returns a way to unsubscribe from these notifications when you're done with them.

## Function listenExit

This function allows you to be notified when a serious error occurs that will halt the backtest or other background processes. Think of it as a way to catch the really big problems that prevent your code from finishing. It’s different from catching normal errors because these errors are so severe that they stop everything. The error information will be delivered to your callback function one at a time, ensuring that even if your error handling involves asynchronous operations, they'll be handled in the order they occur.

## Function listenError

This function lets you set up a system to catch and deal with errors that happen while your trading strategy is running, but aren't severe enough to stop the whole process. Think of it as a safety net for things like temporary API connection problems. When an error occurs, the provided function will be called to handle it, ensuring your strategy keeps going smoothly. Importantly, these errors are handled one at a time, in the order they happen, even if your error handling involves some asynchronous operations.

## Function listenDoneWalkerOnce

This function lets you react to when a background task within your backtest finishes, but only once. You provide a filter to specify which completed tasks you're interested in, and a function to run when a matching task finishes. Once that function has run, the subscription automatically stops, so you won't be bothered by further completions. It's a clean way to handle a single event and then move on. 

Think of it as setting up a temporary listener that disappears after it does its job.


## Function listenDoneWalker

This function lets you listen for when background tasks within your backtest walker have finished. It's designed to handle events from Walker.background() – think of it as a notification system for when those processes are done.  Importantly, it makes sure these notifications are processed one at a time, even if the function you provide to handle them is asynchronous, ensuring things happen in the order they're received. You give it a function that will be called when a background task completes, and it returns a function that you can use later to unsubscribe from those notifications.

## Function listenDoneLiveOnce

This function lets you set up a listener that reacts to when a background task finishes running. It's designed to be temporary – it only runs your callback function once and then automatically stops listening. You provide a filter function to specify which completion events you're interested in, and a callback function that will be executed when a matching event occurs. Essentially, it's a quick and clean way to respond to the completion of a single background process.


## Function listenDoneLive

This function lets you track when background tasks run by Live finish executing. It's like setting up a notification system to be informed when those tasks are done.  The notifications arrive one after another, even if the function you provide to handle them takes some time to complete. To make sure things don't get messy, it uses a queue to process these notifications one at a time. You give it a function that will be called when a task finishes, and it returns a function you can use to unsubscribe from these notifications later.

## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but only once. Think of it as setting up a temporary listener. You provide a filter – a little test – to determine which backtest completions you care about, and then a function to run when a matching backtest is done. Once that one event triggers your callback, the listener automatically goes away, so you don't need to worry about cleaning it up.

It’s useful for things like updating a UI element to show the backtest results or triggering a follow-up action immediately after a background test concludes.


## Function listenDoneBacktest

This function lets you be notified when a backtest finishes running in the background. It's a way to react to the completion of a backtest process, ensuring your code runs smoothly after it's done. Importantly, the notifications are handled in order and any code you provide to handle the notification will be executed one at a time, even if it involves asynchronous operations. It's a simple and reliable way to keep track of when your background backtests are complete. You provide a function that will be called when a backtest finishes, and this function returns another function that you can use to unsubscribe from these notifications later.


## Function listenBreakevenAvailableOnce

This function lets you set up a listener that reacts to specific breakeven protection events – think of it as waiting for a particular condition to be met. You tell it what kind of event you’re looking for using a filter function, and then provide a function that will run *just once* when that event happens. Once the callback has executed, the listener automatically stops listening, so you don't need to worry about cleaning up. It's perfect for scenarios where you need to react to something happening just one time.

The `filterFn` acts like a gatekeeper, determining which events will trigger your callback.  The callback function (`fn`) is what actually gets executed when a matching event occurs.

## Function listenBreakevenAvailable

This function lets you keep an eye on when your trades automatically switch to breakeven protection. Essentially, it monitors situations where your profit has grown enough to cover the costs of the trade, triggering the stop-loss to move to your entry price.

You provide a function that will be called whenever this breakeven protection kicks in. 

Importantly, the events are handled one after another, even if your provided function takes some time to complete, ensuring things stay organized. It's a straightforward way to react to these specific trade adjustments within your backtesting setup.


## Function listenBacktestProgress

This function lets you keep an eye on how a backtest is progressing. It's like setting up a listener that gets notified about updates during the backtesting process. You provide a function that will be called whenever there's a progress update. Importantly, these updates are handled one at a time, even if your provided function does some work asynchronously – so you don’t have to worry about things getting messed up by multiple updates happening at once. The function returns another function that you can use to unsubscribe from these progress updates when you no longer need them.

## Function listenActivePingOnce

This function lets you react to specific active ping events, but only once. Think of it as setting up a temporary listener: it waits for an event that meets your criteria, runs a function you provide when it finds a match, and then automatically stops listening. This is handy when you need to perform an action based on a particular ping condition and then move on without ongoing monitoring. You define what kind of ping event you're interested in with a filter, and then specify the action you want to take when that event occurs.


## Function listenActivePing

This function lets you keep an eye on what’s happening with your active signals. It listens for updates every minute, providing information about the status of these signals. Think of it as a way to monitor the lifecycle of your signals and adjust your strategies accordingly.

The system processes these updates in the order they arrive, even if your callback function takes some time to complete. To ensure things run smoothly, it uses a queuing system to prevent multiple updates from being handled at the same time. You simply provide a function that will be called whenever a new active ping event is detected, allowing you to react to those events in real-time.

## Function listWalkerSchema

This function provides a way to see all the different trading strategies or "walkers" that are currently set up and ready to be used within the backtest-kit framework. Think of it like getting a directory listing of available tools. It returns a list of descriptions for each walker, which can be helpful if you're trying to understand what strategies are available, troubleshoot problems, or build interfaces that let you choose which ones to run. Essentially, it's a way to discover the available trading strategies you've registered.


## Function listStrategySchema

This function gives you a way to see all the trading strategies that have been set up in your backtest-kit environment. Think of it like a directory listing – it provides a list of all the strategies defined and ready to be used for backtesting. You can use this information to check what's available, build tools that automatically generate documentation, or create user interfaces that allow users to select from different strategies. Essentially, it allows you to explore and manage the strategies you’ve incorporated into your system.

## Function listSizingSchema

This function lets you see all the different ways your backtest kit is set up to determine how much to trade. Think of it as a peek under the hood to understand the sizing rules you’ve defined. It gives you a list of these sizing configurations, which can be helpful for checking if everything is set up correctly or creating tools to manage them. Essentially, it's a way to get a complete picture of your sizing strategies.

## Function listRiskSchema

This function gives you a look at all the risk schemas that have been set up within your backtest. Think of it as a way to see what risk parameters are being used and how they're configured. It’s handy if you’re troubleshooting, trying to understand your system’s setup, or building tools that need to know about those configurations. The function returns a list of these risk schemas, allowing you to examine them programmatically.

## Function listFrameSchema

This function lets you see all the different types of data structures, or "frames," that your backtest kit is using. Think of it as a way to peek under the hood and understand what kinds of information your trading strategies are working with. It gives you a list of these frame schemas, which can be really helpful when you’re trying to figure out what’s going on, create documentation, or build tools that need to know about the available data. Essentially, it's a quick way to get an inventory of the frames you’ve set up.

## Function listExchangeSchema

This function lets you see all the different exchanges that your backtest-kit system knows about. Think of it as a way to get a complete inventory of the exchanges you’ve set up. It returns a list, so you can easily loop through and display them or use them in your code. This is helpful for things like checking your configuration or creating user interfaces that adapt to the exchanges you're using.


## Function hasTradeContext

This function quickly tells you if you’re in a state where you can actually execute trades. It verifies that both the execution context and the method context are running. Think of it as a gatekeeper – you need both contexts to be active before you can use things like fetching historical data (candlesticks), calculating averages, or formatting prices and quantities within your trading logic. If this function returns `true`, you’re good to go and can safely call those exchange-related functions.

## Function getWalkerSchema

This function helps you understand the structure of a specific trading strategy or data processing step within your backtest. Think of it as looking up the blueprint for a particular component. You give it the name of the component you’re interested in, and it provides you with a detailed description of what that component is expected to do and what data it handles. This is helpful for debugging, understanding complex systems, or building your own custom components. The name you provide must be a recognized identifier for a registered walker.

## Function getSymbol

This function allows you to retrieve the symbol you're currently trading. It's a simple way to know which asset your strategies and indicators are working with. The function returns a promise that resolves to the symbol as a string. Think of it as asking, "What am I trading right now?".

## Function getStrategySchema

This function lets you peek at the blueprint of a trading strategy you've registered within the backtest-kit system. Think of it as getting the detailed description of how a strategy is structured – what inputs it expects, what kind of data it uses, and generally, its expected behavior. You provide the name you gave the strategy when you registered it, and it returns a structured object containing all that information. This is useful if you want to programmatically understand or validate the configuration of a strategy.

## Function getSizingSchema

This function helps you access the details of how your trades are sized. Think of it as looking up a pre-defined plan for how much you'll buy or sell based on specific criteria. You give it a name, which acts like a label you've assigned to a sizing strategy, and it returns all the information about that strategy – things like the formulas used to determine order size. It’s a handy way to understand or inspect the sizing logic being used in your backtesting setup.


## Function getRiskSchema

This function helps you find the specific details of a risk calculation you've set up within your backtesting system. Think of it as looking up a definition – you give it the name of the risk you’re interested in, and it provides you with a structured description of how that risk is calculated. This description, called an IRiskSchema, includes things like the data it needs and the formula used. It's a key tool for understanding and customizing how your backtest assesses potential risks. You simply provide the risk’s unique identifier, and it returns the corresponding schema.

## Function getRawCandles

The `getRawCandles` function allows you to retrieve historical candlestick data for a specific trading pair. You can easily grab a limited number of candles or define a date range to focus on.

The function is designed to avoid look-ahead bias, ensuring the data you're using for backtesting accurately reflects the conditions available at the time. 

You have a lot of flexibility in how you request the data: you can specify a start date, an end date, and a limit, just an end date and a limit, or just a limit to fetch candles from the past. The function will automatically calculate the appropriate start date based on your input, ensuring everything stays within the correct time window. Keep in mind, the end date must always be in the past relative to your execution context.

Here's what the parameters mean:

*   `symbol`: The trading pair you're interested in, like "BTCUSDT".
*   `interval`: The time frame for each candle (e.g., "1m" for one-minute candles).
*   `limit`: How many candles you want to retrieve.
*   `sDate`: The starting timestamp for your data in milliseconds.
*   `eDate`: The ending timestamp for your data in milliseconds.

## Function getOrderBook

This function lets you retrieve the order book for a specific trading pair, like BTCUSDT. It pulls data directly from the exchange you're connected to. 

You can specify how many levels of the order book you want to see; if you don't specify, it'll get the maximum depth. The function handles the timing of the request, making it suitable for both backtesting and live trading scenarios.

## Function getNextCandles

This function helps you retrieve future candles for a specific trading pair and time interval. It's designed to get candles that come *after* the current point in time based on your trading environment. You simply provide the symbol (like "BTCUSDT"), the desired candle interval (such as "1m" for one-minute candles), and how many candles you want to fetch. The function then uses the underlying exchange’s capabilities to bring back those future candles.


## Function getMode

This function tells you whether the system is currently running a backtest or operating in a live trading environment. It’s a simple way to check the context of your code – useful for adapting behavior depending on whether you’re analyzing historical data or actively trading. The function returns a promise that resolves to either "backtest" or "live".

## Function getFrameSchema

This function helps you understand the structure of a particular trading frame within the backtest-kit system. Think of it as looking up the blueprint for a specific frame. You provide the name of the frame you're interested in, and it returns a detailed description of what that frame contains – things like the expected data types and their meanings. This is useful for verifying that your data and setup are compatible with the framework’s expectations. It’s like confirming you’re building with the right parts before you start assembling.


## Function getExchangeSchema

This function helps you access the details of a specific cryptocurrency exchange that backtest-kit knows about. Think of it as looking up the blueprint for how that exchange works within the framework. You provide the name of the exchange – like "Binance" or "Coinbase" – and it gives you back a structured set of information describing things like available markets, order types, and data formats. This information is crucial for accurately simulating trading on that exchange during backtesting.

## Function getDefaultConfig

This function provides you with a set of pre-defined settings used by the backtest-kit framework. Think of it as a starting point for your configuration—it shows you all the options you can adjust and what values they have by default. This is useful for understanding the available settings and how they influence the backtesting process. You can copy this configuration and modify it to fit your specific needs.

## Function getDefaultColumns

This function provides a handy way to get a peek at the standard column setup used for generating reports within the backtest-kit framework. It gives you a predefined configuration, outlining the available columns for different types of data – like closed trades, heatmaps, live ticks, partial fills, breakeven points, performance metrics, risk events, scheduled tasks, strategy actions, and walker signals.  Think of it as a blueprint showing you the default structure for organizing and displaying your trading data.  It’s especially useful for understanding what options are available and how they're structured before you start customizing your own report layouts.

## Function getDate

This function, `getDate`, helps you find out the current date your trading strategy is operating on. It's a simple way to know what date is being used for calculations. When you're backtesting, it will give you the date associated with the specific historical timeframe you're looking at. If you're running the strategy live, it returns the actual, current date and time.

## Function getContext

This function lets you peek inside the current process happening within your backtest. It returns an object containing details about where you are in the code and what's going on. Think of it as a way to understand the surrounding environment of your trading logic – useful for debugging or adapting your strategies based on the current situation. You'll get a promise that resolves to a context object providing this information.

## Function getConfig

This function lets you peek at the system’s global settings. It gives you a snapshot of things like how often the system checks for updates, limits on signal generation, and parameters related to order placement and data fetching. Importantly, it provides a copy of the settings, so you won't accidentally change the actual configuration by messing with what you see. It's useful for understanding how the backtest kit is currently set up.

## Function getColumns

This function gives you a peek at the columns that will be used to generate your backtest reports. Think of it as a way to see exactly what data will be displayed in your markdown tables. It provides a snapshot of the column configurations for various data types like closed trades, heatmaps, live data, and more. Importantly, it gives you a copy of the configuration, so you can look at it without accidentally changing the original settings.

## Function getCandles

This function lets you retrieve historical price data, or "candles," for a specific trading pair like BTCUSDT. You tell it which pair you're interested in, how frequently the data should be grouped (like every minute, 5 minutes, or hourly), and how many candles you want to see. The function then pulls this data from the exchange you're connected to, looking backward from the current time. It's a straightforward way to access past price action for analysis or backtesting.


## Function getBacktestTimeframe

This function helps you find out the dates available for backtesting a specific trading pair, like Bitcoin against USDT. It returns a list of dates that the backtest kit uses for historical data. Just provide the symbol of the trading pair you're interested in, and it will give you the timeframe it covers. This is useful for understanding the scope of your backtest and ensuring you're using the right data.


## Function getAveragePrice

This function helps you figure out the average price a symbol has traded at, using a method called Volume Weighted Average Price, or VWAP. It looks at the last five minutes of trading data, specifically the high, low, and closing prices, to calculate this average. If there's no trading volume recorded, it simply averages the closing prices instead. You just need to tell it which symbol you're interested in, like "BTCUSDT" for Bitcoin against USDT.

## Function getActionSchema

This function lets you find out the details of a specific action available within the backtest-kit framework. Think of it like looking up the definition of a command – you give it the action's name, and it provides you with a description of what that action does and the data it expects.  It’s useful for understanding the expected input and output for a particular action. You provide the name of the action you're interested in, and it returns a structured object outlining its properties.

## Function formatQuantity

This function helps you prepare quantity values for trading, ensuring they adhere to the specific rules of the exchange you're using. It takes a trading symbol like "BTCUSDT" and a raw quantity number as input. The function then automatically formats the quantity to include the correct number of decimal places required by that exchange, preventing potential order rejections or errors. Essentially, it simplifies the process of presenting quantity values in a way that the exchange will understand.


## Function formatPrice

This function helps you display prices in the correct format for a specific trading pair. It takes the trading pair's symbol, like "BTCUSDT", and the raw price value as input. Then, it automatically adjusts the number of decimal places to match how the exchange presents prices, ensuring consistent and accurate display. Essentially, it handles the formatting details so you don't have to worry about them.

## Function dumpMessages

This function helps you save your backtesting results in a nicely organized way. It takes the details of your backtest – like the chat history and any data you’re tracking – and creates a folder full of markdown files.

Each folder is named after a unique identifier you provide for the backtest. Inside, you'll find files documenting the system prompt, each user message, and the final output from the language model.

It's designed to be safe – it won't overwrite any existing folders, and it'll let you know if any user messages are really long. You can specify where these files should be saved, or it will default to a `dump/strategy` folder.

## Function commitTrailingTake

This function lets you dynamically adjust the take-profit level for a pending trade, which is really useful for trailing your profits. It's designed to work with the original take-profit level you set when you initially created the trade, rather than any adjustments already made.

When you call this function, it calculates a new take-profit distance based on a percentage shift you provide.  A negative shift moves the take-profit closer to your entry price, a more cautious approach, while a positive shift moves it further away, making it more aggressive.

A key thing to remember is that the function is smart about updates - it only changes the take-profit if the new calculation results in a *more conservative* position (closer to the entry price). For long positions, the take-profit can only be moved down; for short positions, it can only be moved up. The function handles whether you're in a backtesting or live trading environment automatically.

You provide the symbol of the trading pair, the percentage shift you want to apply, and the current market price to make sure the adjustment is appropriate.

## Function commitTrailingStop

This function helps you fine-tune your trailing stop-loss orders. It lets you adjust the distance of your stop-loss based on a percentage change relative to the original stop-loss you set when the trade began.

Think of it as a way to gradually tighten or loosen your stop-loss over time, protecting profits while giving your trade room to breathe.

It's important to remember this function always refers back to the *original* stop-loss distance – it doesn't adjust based on any previous trailing stop changes. This prevents small errors from adding up. 

The system intelligently decides whether to actually make the adjustment; it only changes the stop-loss if the new distance provides better protection, prioritizing profit safety. When managing long positions, it will only move the stop-loss higher, and for short positions, it only moves it lower.

Finally, the function automatically understands whether it’s being used in a backtesting environment or a live trading scenario. You need to supply the symbol, the percentage adjustment you want to make, and the current market price to determine if the price is triggering the stop.

## Function commitPartialProfit

This function helps you automatically close a portion of your trades when they're in profit, gradually moving you closer to your take-profit target. It lets you specify what percentage of your position you want to close, like closing 25% or 50%. The system figures out whether it's running in a backtesting environment or a live trading environment and adjusts accordingly. You just need to tell it the trading symbol and the percentage of the position you want to close.

## Function commitPartialLoss

This function lets you partially close an open position when the price is moving in a direction that would trigger your stop-loss. It's useful for taking profits or reducing risk when you don't want to completely exit a trade. You specify the symbol of the trading pair and the percentage of the position you want to close, with the percentage ranging from 0 to 100. The function handles whether it's running in a backtesting environment or a live trading situation automatically.

## Function commitClosePending

This function lets you finalize a pending closing order for a trade without interrupting your strategy’s normal operation. Think of it as confirming a close signal that was already in place. It’s useful when you want to manually close a position but still want your strategy to continue generating new trading signals. This action doesn't pause the strategy or set a stop flag, so it keeps everything running smoothly. You can optionally add a close ID to help you keep track of specific user-initiated closures. The function automatically adjusts its behavior based on whether you’re running a backtest or a live trading session.

## Function commitCancelScheduled

This function lets you cancel a scheduled trading signal without interrupting your strategy’s overall operation. Think of it as removing a pending order from the queue – the strategy will still continue to analyze the market and generate new signals. You can optionally provide a cancellation ID to keep track of who requested the cancellation. This function adapts automatically to whether you're running a backtest or a live trading session.

## Function commitBreakeven

This function helps you automatically manage your stop-loss orders. It shifts your stop-loss to the breakeven point – essentially, covering your initial costs – once the price moves favorably.

Think of it as a safety net that locks in some profit after a trade goes your way. The threshold for moving the stop-loss is based on a combination of slippage and fees, ensuring a comfortable margin.

The function figures out whether it's running in a backtest or live trading environment and also retrieves the current price to make its decision, so you don’t have to handle those details. You just need to provide the trading symbol.

## Function commitAverageBuy

This function, `commitAverageBuy`, is how you add a new step to your dollar-cost averaging (DCA) strategy. It essentially places a buy order at the current market price and records it as part of the overall position. 

The function automatically calculates the average entry price, updates the position's records, and signals that a buy has occurred. 

You just need to provide the trading pair symbol, and it handles getting the current price and determining whether you're in a backtesting or live trading environment.


## Function commitActivateScheduled

This function lets you manually trigger a scheduled signal before the price actually hits the target you set. Think of it as a way to override the automatic activation and make it happen sooner. 

It sets a flag indicating the signal should activate, and the strategy will then handle the activation on the next price update. You can optionally provide an ID to help you track when you manually triggered the activation. It automatically adapts to whether you're running a backtest or live trading.


## Function checkCandles

The `checkCandles` function is a tool for ensuring your historical data, specifically the timestamps associated with your candlestick data, are properly aligned with the expected trading interval. It performs a check on cached candle data to confirm everything is in order. This process reads directly from the persistent storage where your data is kept, bypassing any intermediate layers or abstractions for maximum efficiency. Essentially, it's a safeguard to help prevent issues caused by misaligned or incorrect timestamps in your backtesting process. To use it, you'll need to provide a set of validation parameters through the `params` object.

## Function addWalkerSchema

This function lets you register a "walker" – think of it as a specialized tool – that helps compare different trading strategies against each other. It essentially runs multiple backtests, all using the same historical data, and then analyzes how each strategy performed based on a chosen metric. You provide a configuration object, the "walkerSchema," which tells the framework how to run these comparative tests. This is useful for systematically evaluating and refining your trading strategies.

## Function addStrategySchema

This function lets you tell backtest-kit about a trading strategy you want to use. Think of it as registering your strategy with the system. It ensures your strategy’s setup is correct by checking things like signal data and timing, and it helps prevent issues with too many signals coming in at once. If you're running live tests, it also makes sure your strategy's settings are safely saved, even if something unexpected happens. You simply provide a configuration object describing your strategy, and the framework takes care of the rest.


## Function addSizingSchema

This function lets you tell backtest-kit how to determine the size of your trades. Think of it as defining your risk management rules. You’ll pass in a configuration that specifies things like whether you want to use a fixed percentage of your capital, a Kelly Criterion approach, or something based on Average True Range (ATR). You can also set limits on how much you can trade at once, both in absolute terms and as a percentage of your total capital. Finally, it allows you to hook into sizing calculation events if you need custom logic.

## Function addRiskSchema

This function lets you set up how your trading system manages risk. Think of it as defining the guardrails for your strategies. You can specify limits on how many trades can be active at once and even create custom checks to ensure your portfolio stays healthy, considering things like correlations between different assets. The beauty of it is that multiple trading strategies can share these risk rules, allowing for a broader view of your overall risk exposure.

## Function addFrameSchema

This function lets you tell backtest-kit about a new timeframe you want to use for your backtesting simulations. Think of it as registering a way to generate the historical data your strategies will trade against. You provide a configuration object that describes when the backtest should start and end, how frequently the data should be generated (like daily, hourly, or every minute), and a function that will handle the creation of those timeframes. Essentially, it's how you define the schedule for your backtesting.


## Function addExchangeSchema

This function lets you tell backtest-kit about a new data source for trading. Think of it as registering a specific exchange like Coinbase or Binance so the framework knows where to get historical price data and how to interpret it. You provide a configuration object that outlines how to fetch candles (past price and volume data) and how to format prices for display. The framework will then use this information to perform backtests and calculations, including calculating VWAP (Volume Weighted Average Price) based on recent trade data.

## Function addActionSchema

This function lets you tell backtest-kit about a new action handler. Think of actions as ways to react to events happening during your backtesting – like when a signal is generated or a trade reaches a profit target. You can use these actions to do things like update your state management system, send notifications to a messaging app, log important events, or even trigger custom logic. Essentially, it’s how you connect your backtest to external tools or processes. You give it a configuration object describing the action, and the framework will register it to respond to events during strategy runs.

