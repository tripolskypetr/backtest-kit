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

This function helps prepare your backtesting environment by pre-loading historical price data. It downloads all the candles (open, high, low, close prices) for a specific time period, from a starting date to an ending date, and stores them for quick access during backtests. Think of it as warming up the data so your simulations run faster. The `params` object tells it which date range and time interval (e.g., 1-minute, 1-hour) to download. It’s useful for ensuring that the data needed for your backtests is readily available and avoids delays caused by repeatedly fetching it.

## Function validate

This function helps you make sure everything is set up correctly before you start any backtesting or optimization runs. It checks if all the entities you're using – like your exchanges, trading strategies, and risk management systems – are actually registered in the system.

You can choose to validate specific entity types if you only want to check a portion of your setup, or you can let it validate *everything* to get a complete picture. The validation results are saved so that it runs faster next time. Essentially, it’s a safety net to prevent errors caused by missing or misconfigured entities.


## Function stopStrategy

This function lets you pause a trading strategy's activity. It essentially tells the strategy to stop creating new trading signals. Any existing open signals will finish their lifecycle as usual, but no new ones will be generated. The framework will gracefully halt the strategy at a convenient point, whether it's during a backtest or a live trading session. To stop a strategy, you simply need to provide the trading symbol it's associated with.

## Function shutdown

This function helps you safely end a backtest run. It sends out a signal that lets all parts of your backtest know it's time to clean up and prepare to finish. Think of it as a polite way to tell everything to wrap things up before the backtest completely stops, especially useful when you need to handle interruptions gracefully.

## Function setLogger

You can customize how backtest-kit reports information by providing your own logger. This lets you direct log messages to a file, a database, or any other system you prefer. The framework automatically adds helpful context to each log message, such as the strategy name, exchange, and trading symbol, so you know exactly what's happening during your backtesting process. Simply pass your custom logger, which needs to conform to the `ILogger` interface, to the `setLogger` function.

## Function setConfig

This function lets you adjust how the backtest-kit framework operates. You can use it to change various settings, like how data is handled or how results are calculated. It allows you to provide a partial configuration, meaning you only need to specify the settings you want to modify, not the entire configuration. There's also a way to bypass some safety checks during testing if necessary, but be careful when doing that.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports. You can change how data is displayed by providing a new configuration that modifies the default settings. It's a way to tailor your reports to show exactly the information you need. Be aware that the system checks your column definitions to make sure they're valid, but there's an option to skip this check if you’re working in a test environment.

## Function overrideWalkerSchema

This function lets you modify an existing trading strategy's walker configuration, which is used for comparing different strategies. Think of it as fine-tuning a strategy's settings without completely rebuilding it. It only changes the specific parts of the walker you provide – everything else stays the same. This is helpful when you want to test slight adjustments to a strategy's analysis method. You pass in a partial configuration object, and it returns the updated walker schema.

## Function overrideStrategySchema

This function lets you modify a trading strategy that's already set up within the backtest-kit framework. Think of it as a way to fine-tune an existing strategy without having to rebuild it entirely. You provide a portion of the strategy’s configuration, and this function will update only those specific parts you’ve defined, leaving the rest of the strategy untouched. It’s handy for making adjustments or adding new options to a strategy after it's already been registered.

## Function overrideSizingSchema

This function lets you tweak existing position sizing rules within the backtest kit. Think of it as a way to make small adjustments to how your trading strategy determines how much capital to allocate to each trade. You don't have to redefine the entire sizing schema; instead, you just specify the parts you want to change, and the rest of the original configuration stays the same. This is helpful for fine-tuning your sizing strategy without starting from scratch. The function returns a promise that resolves to the updated sizing schema.

## Function overrideRiskSchema

This function lets you tweak a risk management setup that's already in place. Think of it as making small adjustments instead of starting from scratch. You provide a partial configuration – just the bits you want to change – and the framework updates the existing risk schema, leaving everything else untouched. It's a convenient way to fine-tune your risk controls without rebuilding the whole thing. 

The function takes a risk configuration object as input and returns a promise resolving to the updated risk schema.

## Function overrideFrameSchema

This function lets you modify the structure of data used during backtesting, specifically how information is organized for a particular timeframe. Think of it as a way to tweak how your backtest handles data like open, high, low, close prices, or volume. You can update specific parts of an existing timeframe's setup without having to redefine the entire thing from scratch. This is especially helpful when you need to adjust a timeframe’s configuration on the fly. Just provide the changes you want to make, and the function will merge them with the existing timeframe definition, preserving what you didn't touch.

## Function overrideExchangeSchema

This function lets you modify how backtest-kit interacts with a particular data source, like a historical price feed. Think of it as tweaking an existing exchange's settings without rebuilding it from scratch.  You provide a piece of the exchange's configuration – only the parts you want to change – and the function updates the existing schema, keeping everything else the same. This is helpful for things like adjusting data intervals or adding custom parameters to an exchange.


## Function overrideActionSchema

This function lets you tweak existing action handlers—those pieces of code that respond to events—without having to completely replace them. Think of it like making small adjustments to a setting rather than rebuilding the whole system. You can use it to change how an action behaves, perhaps to adjust it for a testing environment or to swap out a callback function. This provides flexibility to modify existing behaviors dynamically, all while keeping the core handler registration intact. The function only changes the parts you specify; everything else stays the same.

## Function listenWalkerProgress

This function lets you track the progress of backtest-kit's Walker as it runs through your strategies. It provides updates after each strategy finishes, allowing you to monitor the process. The updates are delivered one at a time, even if your tracking code takes some time to process each update – ensuring things don't get out of order or overwhelmed. Think of it as a way to get notified about how far along the backtesting process is. 

You give it a function to call whenever an update is available, and it returns another function that you can use to stop listening for these updates whenever you need to.


## Function listenWalkerOnce

This function lets you listen for events happening within a trading simulation, but with a twist – it only listens once. You provide a filter to specify which events you're interested in, and a function to run when a matching event occurs. Once that single event is processed, the listener automatically stops, making it a clean and efficient way to react to specific, one-off conditions during a backtest. Think of it like setting a temporary alert – you want to know something happened, and then you're done listening. 

Here's a breakdown:

*   You give it a rule ("filter") that decides which events you care about.
*   You also give it an action ("function") that will run when an event matches that rule.
*   It listens, triggers your action *once*, and then quietly stops listening.

## Function listenWalkerComplete

This function lets you listen for when the backtest walker finishes running all of your strategies. It's useful for triggering actions after the entire backtesting process is complete.  The function takes a callback – a piece of code you want to run when the walker is done – and returns a way to unsubscribe from these notifications later. Importantly, the events are handled one at a time, even if your callback function involves asynchronous operations, ensuring things happen in the order they were received and preventing any potential conflicts.

## Function listenWalker

The `listenWalker` function lets you keep track of how a backtest is progressing. It's like setting up a notification system that tells you when each strategy within the backtest has finished running.

You provide a function (`fn`) that will be called for each strategy. This function receives an event containing information about the completed strategy.

Importantly, even if your function (`fn`) takes a while to execute (like if it's doing something asynchronously), the notifications will be handled one at a time, in the order they arrive. This prevents any unexpected issues from multiple strategies being processed at the same time. 

The function returns another function which you can use to unsubscribe from these notifications later on, cleaning up your listeners.

## Function listenValidation

This function lets you keep an eye on potential problems during your risk validation checks. Whenever a validation function encounters an error, this function will notify you. It's perfect for catching bugs and keeping track of any validation failures. Importantly, it makes sure these notifications happen one after another, even if your error handling involves asynchronous operations, ensuring things stay organized. You provide a function that will be called whenever an error occurs, and this function returns another function to unsubscribe from these notifications when you no longer need them.

## Function listenSyncOnce

This function lets you temporarily hook into the signal synchronization process, but only once. Think of it as setting up a single, special listener that reacts to specific events. You define what kind of events you’re interested in using a filter – it only triggers when a signal matches your criteria.

The function you provide to handle those events will run just once, and if that function involves asynchronous operations like promises, the backtest will pause until those operations finish before moving on. This makes it useful for keeping things in sync with external systems during the backtesting process. 

When you’re done with the listener, it automatically cleans itself up; you don't need to manually unsubscribe.


## Function listenSync

This function lets you keep a close eye on when your trading signals are being processed, especially when things are happening asynchronously. It’s perfect for making sure your system stays in sync with external services or databases.  Whenever a signal needs to be opened or closed, this function will call your provided callback.  If your callback function returns a promise, the trading process will pause until that promise resolves, ensuring everything happens in the right order. Essentially, it gives you a way to reliably coordinate actions with the rest of your system.

## Function listenStrategyCommitOnce

This function lets you react to specific changes happening with your trading strategies, but only once. You tell it what kind of change you're interested in using a filter – a little test that checks each change. When a matching change occurs, it runs a function you provide, and then it automatically stops listening, so you don’t have to manage that yourself. Think of it as setting up a one-time alert for a particular strategy action.

It takes two parts: a filter to identify the events you care about, and a function to execute when that event happens. Once the function runs, the subscription stops.

## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategies. It's like setting up a listener that gets notified whenever certain actions are taken, such as canceling a scheduled trade, closing a position, or adjusting stop-loss and take-profit levels.  The listener handles these events one at a time, even if your callback function takes some time to process, ensuring things happen in the correct order. You provide a function that will be called whenever one of these strategy actions occurs, giving you a chance to react to them. When you're finished, the function returns another function that you can use to unsubscribe from these events.

## Function listenSignalOnce

This function lets you set up a listener that only runs once when a specific signal condition is met. You provide a filter – essentially, a rule that defines which signals you're interested in – and a callback function that will be executed when a matching signal arrives. Once the callback has run, the listener automatically stops listening, so it's perfect for situations where you need to react to a signal just once and then move on. It's a convenient way to wait for a particular event to happen without needing to manage subscriptions manually.

## Function listenSignalLiveOnce

This function lets you temporarily tap into live trading signals generated by backtest-kit, but only to receive one specific event. You provide a filter – a way to identify the exact signal you're looking for – and a function to execute when that signal arrives. Once that signal is received, the function automatically unsubscribes, so you don't keep listening unnecessarily. It’s ideal for quickly grabbing a single piece of data during a live backtest run. 

Essentially, it's a quick way to listen and react to a single event during a live simulation without ongoing subscriptions.


## Function listenSignalLive

This function lets you tap into the live trading signals generated by backtest-kit. It's a way to get notified as trades happen in real-time during a Live.run() execution. Think of it as subscribing to a stream of updates. 

The function takes a callback – a piece of code you provide – that will be executed whenever a new trading signal is available. Importantly, these signals are processed one after another, ensuring a reliable order. To stop listening, the function returns another function that you can call to unsubscribe.


## Function listenSignalBacktestOnce

This function lets you tap into the backtesting process and react to specific signals generated during a backtest run. Think of it as setting up a temporary listener that only cares about certain events. You provide a filter – a way to identify the events you’re interested in – and a function to execute when a matching event occurs.  Crucially, this listener automatically turns itself off after it has fired just once, ensuring it doesn’t interfere with subsequent backtest runs. It's perfect for things like logging a specific trade condition or performing a single calculation based on a particular signal.


## Function listenSignalBacktest

This function lets you tap into the flow of a backtest and react to what's happening as it runs. It's like setting up a listener that gets notified whenever a signal is generated during the backtest process.

You provide a function, and this function will be called whenever a signal event occurs. Importantly, these events are handled one at a time, so you don't have to worry about juggling multiple signals simultaneously.

This listener only works during a `Backtest.run()` execution, and it gives you a way to observe and potentially respond to events as they happen within the backtest. When you're done listening, the function returns another function that you can use to unsubscribe.

## Function listenSignal

This function lets you be notified whenever a trading strategy generates a signal, like when it decides to buy, sell, or hold. It’s a way to react to the strategy's actions in real-time.

Importantly, the signals are handled one at a time, even if your reaction to a signal involves some processing that takes a bit of time. This ensures things happen in the order they are received and prevents conflicts. 

You provide a function as input – this function will be called whenever a signal event occurs (idle, opened, active, closed), allowing you to do whatever you need to do based on that signal. The function returns another function that you can call to unsubscribe from receiving these signals later.

## Function listenSchedulePingOnce

This function lets you set up a one-time listener for ping events within your backtest. You provide a filter to specify which ping events you’re interested in, and a function to execute when a matching event occurs. Once that event is processed, the listener automatically shuts itself down – it’s perfect for reacting to a specific condition and then cleaning up. Think of it as a temporary alert system for your trading logic.

## Function listenSchedulePing

This function lets you keep an eye on signals that are waiting to be activated within your backtest. It sends out a “ping” every minute while a signal is in this waiting period. You can use this ping to track how long a signal has been waiting or to do other custom checks during this monitoring phase. Essentially, it provides a way to be notified about the signal's lifecycle and allows you to add your own logic to observe what’s happening. To use it, you give it a function that will be called each time a ping event occurs, and it returns a function to unsubscribe from those events when you're finished.

## Function listenRiskOnce

This function lets you set up a temporary listener for risk rejection events. You provide a filter—a way to specify exactly which types of risk events you're interested in—and a callback function that will run just once when a matching event occurs. Once the callback has executed, the listener automatically stops, so you don't have to worry about managing subscriptions yourself. It’s a handy way to react to a specific risk condition and then be done with it.

Essentially, it's a one-time alert system for risk events that you define.


## Function listenRisk

This function lets you monitor for situations where your trading signals are being blocked because they violate risk rules. You’ll only receive notifications when a signal is rejected – it won't bother you with signals that are perfectly fine. The notifications are processed one at a time, ensuring things happen in the order they're received, even if your handling logic takes some time. Essentially, it's a way to keep an eye on potential risk-related issues without being overwhelmed by constant updates. You provide a function that gets called when a risk rejection happens, and this function returns another function that you can use to unsubscribe from these notifications later.

## Function listenPerformance

This function lets you keep an eye on how quickly your trading strategies are running. It's like setting up a listener that will notify you whenever a performance measurement is taken during your strategy's execution. These notifications, called "PerformanceContract" events, help you pinpoint where your code might be slow or inefficient. 

The cool thing is, even if your callback function takes some time to process each notification, the notifications are handled one after another, in the order they're received, ensuring things stay organized. You can think of it as a way to profile your strategy's performance and find areas for optimization. 

To use it, you simply provide a function that will receive these performance events. The function you provide will also be removed when you no longer need to listen for these events, returning a function that will unsubscribe from performance metric events.

## Function listenPartialProfitAvailableOnce

This function lets you watch for specific profit levels being reached in your trading strategy, but only once. You provide a condition – a filter – to define which profit events you're interested in. When that condition is met, a callback function you specify will run exactly one time, and then the listener automatically stops. It’s a handy tool when you need to react to a particular profit situation just once and don’t want to keep listening afterward.

Essentially, you tell it "I want to know when *this* happens, then I'm done listening."


## Function listenPartialProfitAvailable

This function lets you keep track of your trading progress as it hits certain profit milestones, like reaching 10%, 20%, or 30% profit. You provide a function that will be called whenever one of these milestones is reached. The system ensures these updates are handled one at a time, even if the function you provide takes some time to complete, to avoid any unexpected issues. Essentially, it's a way to be notified and react to your trade’s performance as it grows.

## Function listenPartialLossAvailableOnce

This function lets you set up a listener that reacts to partial loss level changes, but only once. You provide a filter – a way to specify exactly what kind of loss condition you’re looking for – and a function to run when that condition is met. Once the condition is found and your function runs, the listener automatically stops listening, so it won’t trigger again. It’s perfect for situations where you need to react to a specific loss scenario just one time.

You give it two pieces: a filter that tells it which loss events to watch for, and a callback function that will be executed when the filter matches. The listener takes care of unsubscribing itself after the callback has been executed once.


## Function listenPartialLossAvailable

This function lets you keep track of how much a contract has lost in value. It will notify you when the loss reaches specific milestones, like 10%, 20%, or 30% of the initial value. Importantly, even if your callback function takes some time to run, the events are handled one at a time to prevent issues with multiple things happening at once. You provide a function that gets called with details about the partial loss event, and the function returns another function you can use to unsubscribe from these notifications later.

## Function listenExit

This function lets you be notified when something goes seriously wrong, like a crash, in background processes like Live, Backtest, or Walker. It's for errors that halt the whole process – unlike `listenError`, you can’t recover from these.  You provide a function that will be called when a fatal error occurs, and it ensures these errors are handled one at a time to prevent conflicts. The provided function will receive an error object containing details about what happened. When you're done listening for these errors, the function returns another function that you can call to unsubscribe.

## Function listenError

This function lets you set up a listener that will catch errors that happen during your trading strategy's execution, but aren’t critical enough to stop everything. Think of it as a safety net for things like temporary API problems. When an error occurs, the provided function will be called to deal with it, and importantly, your strategy will keep running. The errors are handled one at a time, even if the function you provide takes some time to complete. This helps avoid issues caused by multiple errors happening at once.

## Function listenDoneWalkerOnce

This function lets you react to when a background task finishes, but only once. You provide a way to identify which specific completion events you're interested in, and a function to run when that event happens.  Once the function runs, it automatically stops listening, so you don't need to manage the subscription yourself. Think of it as a temporary listener that cleans up after itself.


## Function listenDoneWalker

This function lets you be notified when a background task within a Walker finishes processing. Think of it as setting up a listener that gets triggered when a job is done. The important thing is that when the task completes, your code will run sequentially, one step at a time, even if your code needs to do some asynchronous work. This helps avoid potential issues from multiple operations happening at the same time. You provide a function that will be called when the task finishes, and the function returns another function to unsubscribe from the listener when you no longer need it.

## Function listenDoneLiveOnce

This function lets you monitor when background tasks within your backtest finish, but only once. You provide a filter to specify which completed tasks you're interested in, and then a function that will be executed when a matching task completes. After that function runs, the subscription automatically stops, ensuring you don't get further notifications. It’s perfect for actions you only need to perform one time after a background process concludes.


## Function listenDoneLive

This function lets you keep track of when background tasks within your backtest are finished. It's useful if you need to know when a process has completed before moving on to the next step. Think of it as a notification system for background jobs.  The function you provide will be called whenever a background task is done, and these calls happen one after another, even if your function takes some time to execute, ensuring things proceed in a controlled sequence. It helps prevent unexpected issues that can arise from running callbacks at the same time.

## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but only once. You provide a filter that determines which backtest completions you're interested in, and a function that gets called when a matching backtest is done. Once that function has run, the subscription automatically stops, so you won't receive any further notifications. It's perfect for performing a single, specific action after a particular backtest completes. 

Think of it as setting up a one-time alert for a specific backtest event. 

You'll get a function back from this call, which you can use to cancel the subscription if you need to.


## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. It's great for actions you need to take *after* a backtest completes, like saving results or updating a display.  

The key thing to understand is that when the backtest is done, your notification function will be called, and it will be processed one at a time, even if it's an asynchronous function. This ensures things happen in the correct order and avoids any unexpected issues with multiple processes running simultaneously. You provide a function that will be executed when the backtest is done, and this function returns another function that you can use to unsubscribe from these notifications later.

## Function listenBreakevenAvailableOnce

This function lets you set up a listener that reacts to specific breakeven events, but only once. You provide a filter – a test to see if the event is relevant – and a callback function that will run when a matching event happens. After the callback runs once, the listener automatically stops listening, so it's perfect for situations where you only need to respond to something happening just one time. It's a handy way to wait for a particular breakeven condition to be met.

You give it two things: first, a way to determine if an event is what you're looking for, and second, what you want to do when that specific event occurs. Once that event triggers your callback, that's it – the listener shuts down.


## Function listenBreakevenAvailable

This function lets you get notified whenever a trade's stop-loss automatically adjusts to breakeven – meaning the profit covers the original transaction costs. Think of it as a safety net; it ensures your trade isn't at risk if the price moves favorably.  You provide a function that will be called whenever this happens, and the system guarantees those calls happen one after another, even if your function takes some time to complete. This helps prevent unexpected issues caused by multiple callbacks running at the same time. To stop receiving these notifications, the function returns another function you can call.

## Function listenBacktestProgress

This function lets you keep an eye on how a backtest is progressing. It provides updates during the background calculations of a backtest, letting you track its status. The updates are delivered one at a time, even if your code takes some time to process each update. This ensures that the progress information is handled in a controlled and orderly way. You provide a function that will be called with each progress event, and the function returns another function which can be used to unsubscribe from the updates.

## Function listenActivePingOnce

This function lets you react to specific active ping events, but only once. You provide a filter to define which events you're interested in, and a function to execute when a matching event occurs. After that single execution, the function automatically stops listening, cleaning up the subscription for you. It's perfect for situations where you need to wait for a particular condition to be met within the active ping stream and then take action.


## Function listenActivePing

This function lets you keep an eye on active trading signals. It listens for updates, which happen roughly every minute, providing information about the signals that are currently running. 

You’ll get these updates one at a time, even if your code takes some time to process each one – this ensures things don't get messy with multiple things happening at once. Think of it as a way to automatically react to changes in your active signals, like adjusting your strategies on the fly. You simply provide a function that will be called whenever a new update is available.

## Function listWalkerSchema

This function lets you discover all the different trading strategies or analysis methods (walkers) that are currently set up within the backtest-kit framework. It provides a list of their configurations, which is helpful if you're trying to understand how things are working, create documentation, or build tools that automatically adjust based on the available strategies. Think of it as a way to see all the "building blocks" your trading system is using.

## Function listStrategySchema

This function gives you a list of all the trading strategies that have been set up within the backtest-kit system. Think of it as a way to see what strategies are available for testing or analysis.  It’s really helpful if you want to understand which strategies you've defined, build tools that automatically display them, or simply check everything is configured correctly. It returns a promise that resolves to an array of strategy schema objects.

## Function listSizingSchema

This function lets you see all the sizing strategies that are currently set up within the backtest-kit system. It gives you a list of configurations, each describing how to determine the size of your trades. Think of it as a way to inspect the rules that dictate how much money you're putting into each position. You can use this to double-check your settings, create documentation, or even build tools that adapt to different sizing methods. It's a convenient way to peek under the hood and understand how sizing is being handled.


## Function listRiskSchema

This function lets you see all the risk schemas that have been set up in your backtest. Think of it as a way to peek under the hood and understand how risk is being managed. It returns a list of these schemas, which can be helpful for checking your configuration, building tools to display risk settings, or simply making sure everything is working as expected. Essentially, it gives you a complete inventory of your risk management setup.

## Function listFrameSchema

This function helps you discover what kinds of data your backtest simulations are using. It provides a list of all the "frame schemas" that have been set up, essentially telling you what kinds of information are available at each point in time during a backtest. Think of it as a way to peek under the hood and see exactly what data structures your trading strategies will be working with. This is really handy for understanding your system, creating helpful documentation, or even building tools that automatically display information based on those schemas.

## Function listExchangeSchema

This function lets you see a complete list of all the exchanges your backtest-kit setup knows about. Think of it as a way to confirm everything's connected properly. It's especially handy when you're troubleshooting or want to create a user interface that automatically adapts to the exchanges you're using. The function returns a promise that resolves to an array, each item representing an exchange's configuration.

## Function hasTradeContext

This function simply tells you if the trading environment is ready for you to perform actions. Think of it as a quick check to ensure everything is set up correctly before you try to fetch data or execute trades. It confirms that both the execution and method contexts are active. You need this confirmation before using functions like `getCandles` or `formatPrice` – they won't work properly without it. If it returns `true`, you're good to go; otherwise, you need to wait for the environment to initialize.


## Function getWalkerSchema

This function helps you understand the structure of a trading strategy you’re using within the backtest-kit framework. Think of it as looking up the blueprint for a particular strategy. It takes the strategy’s name as input and returns a detailed description of what that strategy involves – things like what data it needs, what calculations it performs, and how it generates trading signals. This is useful for developers wanting to inspect or programmatically work with strategy definitions. It provides a clear, defined schema for each registered trading strategy within your backtesting setup.

## Function getTotalPercentClosed

This function helps you understand how much of a trading position remains open. It tells you the percentage of the original position that hasn't been closed yet, ranging from 100% (meaning the entire position is still active) to 0% (everything has been closed). 

It's smart enough to consider any additions made to the position through dollar-cost averaging when calculating this percentage.

You don't need to worry about whether you're running a backtest or a live trade; this function automatically adapts to the environment it's being used in.

To use it, you simply provide the trading symbol, like "BTCUSDT", and it returns the percentage of the position still open as a number.

## Function getTotalCostClosed

This function helps you figure out the total cost of your current holdings for a specific trading pair, like BTC-USDT. It takes into account any times you've bought more of the asset over time, which is really useful if you've been gradually adding to your position.  Essentially, it calculates your average cost basis. The function automatically adjusts itself depending on whether you're running a backtest or a live trading session, so you don't need to worry about that. You just need to provide the symbol of the trading pair you're interested in.

## Function getTimestamp

This function, `getTimestamp`, is a handy way to know what time it is within your trading strategy. When you're running a backtest, it tells you the timestamp for the specific historical period being analyzed. If you're running your strategy live, it gives you the actual current time. It returns a promise that resolves to a number representing the timestamp.

## Function getSymbol

This function lets you find out what symbol your backtest is currently working with. It’s a simple way to grab the trading symbol, returning it as a promise that resolves to a string. You can use this to make sure your strategies are operating on the correct asset.

## Function getStrategySchema

This function helps you understand the structure of a trading strategy you're using. It takes the name of the strategy as input and returns a detailed description of what that strategy expects – things like the inputs it needs, the types of data it works with, and the overall format. Think of it as a blueprint for a specific trading strategy, allowing you to easily inspect its requirements and integrate it within your backtesting environment. You provide the strategy's name, and it reveals its underlying schema.


## Function getSizingSchema

This function helps you access the configuration details for a specific trading sizing method. Think of sizing as how much of your capital you'll allocate to each trade. You give it a name, like "fixed" or "percentage," and it returns all the settings associated with that sizing method. It's useful when you want to understand or modify the sizing strategy being used in your backtest. Essentially, it's a lookup tool for sizing configurations.

## Function getScheduledSignal

This function helps you retrieve the signal that's currently planned for a specific trading pair. Think of it as checking what the strategy is *scheduled* to do next. It automatically knows whether you're running a backtest or a live trade, so you don’t need to worry about that. If there isn't a scheduled signal for that trading pair right now, it will let you know by returning nothing. You just need to provide the symbol of the trading pair you're interested in.

## Function getRiskSchema

This function helps you find the specific details for a particular risk type you're using in your backtesting setup. Think of it as looking up the blueprint for how a certain risk is calculated and managed. You provide the name of the risk, like "Volatility" or "Drawdown," and it returns a structured description of that risk, outlining things like the data it needs and how it’s computed. It's a handy tool for understanding and working with different risk measures within your trading strategy.


## Function getRawCandles

The `getRawCandles` function is your way to retrieve historical candle data for a specific trading pair and timeframe. It’s designed to be flexible, allowing you to specify the symbol and interval you’re interested in. You can easily fetch a limited number of candles, or define a specific date range to pull data from.

The function intelligently handles different combinations of date and limit parameters, making sure it always fetches data in a way that avoids looking into the future.

Here's how you can use it:

*   You can provide a start date, end date, and a limit to get a specific chunk of data.
*   If you only provide a start date and end date, it will automatically calculate the number of candles needed.
*   If you only specify an end date and a limit, it'll figure out the start date based on the end date and the requested limit.
*   You can also simply request a specific number of candles from the current point backward.

The `symbol` parameter identifies the trading pair (like "BTCUSDT"). The `interval` defines the timeframe of the candles (options include "1m," "3m," "5m," "15m," "30m," "1h," "2h," "4h," "6h," and "8h").  `limit` determines how many candles you want, while `sDate` and `eDate` let you choose a specific date range.

## Function getPositionPnlPercent

This function helps you figure out how your trading positions are performing financially. It calculates the percentage profit or loss on a specific asset, like a stock or cryptocurrency. Essentially, it tells you how much money you've made or lost on each contract you hold, expressed as a percentage. If there's no position open for the given symbol, the function will return null. It’s a straightforward way to quickly assess the profitability of your trades.

## Function getPositionPnlCost

The `getPositionPnlCost` function lets you check how much profit or loss your position currently holds for a specific trading symbol. It's a straightforward way to understand the financial impact of your open trades. This function returns a promise that will resolve to a number representing the profit/loss, or `null` if there's no position open for that symbol. To use it, simply provide the symbol you're interested in, like "BTC-USDT".

## Function getPositionPartials

This function helps you understand how your trades are being partially closed. It provides a list of events where portions of your position were closed for either profit or loss.

You'll see details like the percentage of the position closed, the price at which it was closed, and the cost basis at that time, along with how many DCA entries were accumulated.

If you haven’t initiated any partial closes, you’ll get an empty list. If no signal is pending, the function will return null. You need to specify the trading pair's symbol to get the information.

## Function getPositionLevels

This function helps you understand the prices at which your trades for a specific asset are currently set up. It gives you a list of prices used for Dollar Cost Averaging (DCA) entries, starting with the original purchase price and including any subsequent prices added through the `commitAverageBuy()` function. If there's no active trade signal, the function will let you know by returning null. If you made only the initial purchase and haven't added any more, you'll get an array containing just the original purchase price. You provide the trading pair's symbol (like BTCUSDT) to check the positions for that specific asset.

## Function getPositionInvestedCount

This function helps you figure out how many positions your backtest currently has invested in a specific asset. It takes the symbol of the asset – like "BTCUSDT" – as input. The function then returns a number representing the count of positions, or null if there are no positions for that symbol. Essentially, it’s a quick way to check how much of your portfolio is allocated to a particular asset during a backtest.

## Function getPositionInvestedCost

This function helps you figure out how much money you've invested in a particular asset, like a stock or cryptocurrency. It takes the symbol of the asset as input – for example, "AAPL" for Apple stock. The function then calculates the total cost of your position in that asset. If there's no position open for that symbol, it returns null, meaning you haven't invested in it. The result is a promise that resolves to a number representing the total invested cost, or null if no position exists.


## Function getPositionAveragePrice

This function helps you figure out the average price you paid for a specific asset, like a stock or cryptocurrency. It takes the symbol of the asset – for example, "AAPL" for Apple stock – as input. The function then returns a number representing that average price. If there’s no data available to calculate an average price, it will return null, letting you know there's nothing to report. It’s a useful tool for understanding your cost basis and performance.

## Function getPendingSignal

This function lets you check if your trading strategy currently has a pending order waiting to be filled. It takes the trading pair symbol, like 'BTCUSDT', as input. The function will return the details of that pending signal if one exists, or it will tell you that there isn't a pending signal active right now. It figures out whether you're running a backtest or a live trade automatically, so you don't need to worry about that.


## Function getOrderBook

This function lets you grab the order book for a specific trading pair, like BTCUSDT. It reaches out to the exchange you're using to get this data. You can specify how many levels of the order book you want – a larger number gives you more detail, but takes more data. The function automatically handles the timing based on the current environment, whether you’re backtesting or trading live.

## Function getNextCandles

This function helps you retrieve future candles for a specific trading pair and time interval. It essentially asks the exchange to give you the next set of candles occurring after the current time the backtest is at. You provide the symbol like "BTCUSDT", the interval like "1h", and how many candles you want to fetch. The function then returns a promise that resolves to an array of candle data.

## Function getMode

This function tells you whether the backtest-kit framework is currently running a simulation (backtest mode) or connected to a live trading environment. It's a simple way to check the context of your code – for example, you might want to adjust your trading logic based on whether you’re practicing or actually trading. The function returns a promise that resolves to either "backtest" or "live", clearly indicating the current operational mode.

## Function getFrameSchema

This function lets you find out the structure of a specific frame within the backtest-kit system. Think of it as looking up the blueprint for how a particular type of data is organized. You provide the name of the frame you're interested in, and it returns a description outlining what fields and data types it contains. It’s useful when you need to understand the expected format of frame data for validation or other processing tasks. Essentially, it gives you a clear definition of what a frame of that name *should* look like.


## Function getExchangeSchema

This function helps you find the details of a specific cryptocurrency exchange that backtest-kit knows about. Think of it as looking up the blueprint for how that exchange works within the framework. You give it the name of the exchange you’re interested in, and it returns a structured set of information describing things like available symbols, data formats, and order types. This schema is essential for simulating trading on that exchange accurately.

It requires you to provide the exchange name as input.

## Function getDefaultConfig

This function provides you with a starting point for configuring the backtest-kit framework. It gives you a ready-made set of default values for various settings, covering things like how often prices are checked, how much slippage to expect, and limits on the number of signals and notifications. Think of it as a template – you can look through this configuration to understand all the knobs you can tweak to customize your backtesting environment and then adjust them to suit your specific needs. It’s a helpful way to explore what's possible and get your backtests up and running quickly.

## Function getDefaultColumns

This function gives you the standard set of columns used to create reports within backtest-kit. It's like a template showing you all the different data views – from closed trades and heatmaps to live ticks and scheduled events – and how they’re structured by default.  Think of it as a handy reference to understand the available column options and what their initial setups look like before you customize them for your own reports. You can look at the returned object to get ideas for how to organize and display your trading data.

## Function getDate

This function, `getDate`, simply provides you with the current date. It's useful for situations where you need to know the precise date being used in your trading logic. When running a backtest, it will return the date associated with the specific historical timeframe you're analyzing. If you're running live, it gives you the current, real-time date.

## Function getContext

This function lets you peek inside the current method's environment. Think of it as getting a little snapshot of what's happening right now – things like the current time, data, or any settings being used. It returns a special object filled with this information, allowing your code to adapt based on the circumstances of the ongoing process. You can use it to understand the bigger picture of what's happening within your backtesting or trading strategy.

## Function getConfig

This function lets you peek at the settings that control how backtest-kit operates. It provides a snapshot of the current configuration, which includes things like how often it checks prices, limits on order sizes, retry attempts for data fetching, and various other parameters affecting the backtesting process. Importantly, the function returns a copy of the settings, so any changes you make won't affect the actual running configuration. Think of it as reading the instruction manual without being able to scribble on it.

Here's a glimpse of what you'll find within the configuration:

*   Settings for scheduling tasks and waiting times.
*   Parameters related to price calculations and slippage.
*   Limits on signal generation and order book depth.
*   Options to control notification frequency and logging.
*   Flags to enable or disable certain features like data fetching mutexes and DCA.

## Function getColumns

This function lets you peek at the column configurations used when generating reports. Think of it as getting a snapshot of which data fields are being displayed. It provides a copy, so any changes you make won't affect the original configuration. You can use this to understand what data is being tracked and how it's presented in your backtest reports. 

It gives you access to columns for backtest results, heatmaps, live data, partial fills, breakeven points, performance metrics, risk events, schedules, strategy events, synchronization, walker P&L, and walker strategy results.

## Function getCandles

This function lets you retrieve historical price data, also known as candles, for a specific trading pair. You tell it which trading pair you're interested in, like "BTCUSDT," how frequently the data should be grouped (e.g., every minute, every hour), and how many candles you want to see. The function automatically fetches this data from the trading platform you've connected to, going back from the present time. Think of it as requesting a slice of the trading history for your analysis.


## Function getBreakeven

This function helps determine if a trade has reached its breakeven point, meaning it's made enough profit to cover the costs associated with the trade. It checks if the current price of an asset has moved sufficiently in a profitable direction to offset things like slippage and trading fees. The calculation considers a defined threshold based on these costs, essentially figuring out when you’re "in the clear" on a trade. You give it the symbol of the asset you're trading and the current price, and it tells you whether the breakeven point has been reached, automatically adjusting based on whether you're in backtesting or live trading mode.


## Function getBacktestTimeframe

This function helps you find out the dates used for a backtest of a specific trading pair, like BTCUSDT. It returns a list of dates, essentially telling you the timeframe the backtest covers. Think of it as a way to check what historical data was used to simulate trading for a particular asset. You just need to give it the symbol of the trading pair you're interested in, and it will provide the relevant date range.

## Function getAveragePrice

This function helps you figure out the average price of a trading pair, like BTCUSDT. It uses a method called VWAP, which considers both the price and the volume traded. 

Essentially, it looks at the last five minutes of trading data, calculates a "typical price" for each minute, and then weighs those prices based on the volume during those periods. 

If there's no trading volume recorded, it will just calculate a simple average of the closing prices instead. You just need to provide the symbol you’re interested in to get the average price.

## Function getAggregatedTrades

This function lets you retrieve a list of combined trades for a specific trading pair, like BTCUSDT. It pulls this data from the exchange the backtest-kit is connected to. 

You can request a limited number of trades using the 'limit' parameter, or if you don't specify one, it will retrieve trades from a recent timeframe. The system aims to get at least the number of trades you requested, potentially pulling more to ensure you have enough.


## Function getActionSchema

This function lets you find out the details of a specific action that's been registered within the backtest-kit framework. Think of it like looking up a blueprint – you provide the action’s name, and it gives you back all the information about what that action does and how it's structured. It’s useful when you need to understand or validate the configuration of a particular trading action. The action name acts as the unique identifier you use to pinpoint the schema you’re looking for.

## Function formatQuantity

This function helps you prepare quantity values for trading, ensuring they adhere to the specific rules of the exchange you're using. It takes a trading pair symbol, like "BTCUSDT," and a raw quantity number as input. The function then uses the exchange's formatting rules to correctly calculate the number of decimal places needed for that specific trading pair. The result is a string representation of the quantity, ready to be used in your trading orders.

## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a symbol like "BTCUSDT" and a price as input. Then, it automatically formats the price to match the specific rules of the exchange you're using, ensuring the right number of decimal places are shown. Essentially, it simplifies how you present price information in a consistent and accurate way.

## Function dumpMessages

This function helps you save all the details of a backtest run in a nicely organized way. It takes your chat history – including system prompts, user inputs, and LLM responses – and saves them as markdown files.

You’ll get a folder created with a name based on the `resultId` you provide, inside a main output directory (defaults to `./dump/strategy`). Inside that folder, you'll find files detailing the system prompt, each individual user message, and the final LLM output.

The function avoids accidentally overwriting existing data by skipping the dump if the folder already exists. It also gives you a warning if any user messages are exceptionally long, potentially indicating a problem with the backtest.


## Function commitTrailingTakeCost

This function lets you change the trailing take-profit to a specific price. It's a simpler way to adjust your take-profit, automatically figuring out the percentage shift needed from the original take-profit distance. The system handles the details of whether it's running a backtest or a live trade, and also gets the current market price to do the calculation for you. You just tell it which trading pair you're working with and what the new take-profit price should be.


## Function commitTrailingTake

This function lets you fine-tune the trailing take-profit level for a trade that's already in progress. Think of it as adjusting how far your profit target moves as the price goes in your favor.

It's really important to understand that this function always calculates the new take-profit based on the *original* take-profit level you set when you first placed the trade. This prevents small errors from adding up each time you make an adjustment.

When you use this function, any changes you request will only make the take-profit more conservative—meaning, for long positions, it will only move the take-profit closer to the entry price, and for short positions, it will only move it further away. If you try to make a change that would make it *less* conservative, the function will ignore it.

The function automatically knows whether it’s running in a backtesting environment or a live trading situation.

You provide the symbol of the trading pair, the percentage adjustment you want to make, and the current price of the asset.

## Function commitTrailingStopCost

This function lets you change the trailing stop-loss order to a specific price. It simplifies the process by automatically figuring out the percentage shift needed from the original stop-loss distance. You don't have to worry about whether you're running a backtest or a live trade because it handles that automatically. It also gets the current market price for you to make sure the adjustment is accurate. You just provide the symbol you're trading and the new stop-loss price you want to set.

## Function commitTrailingStop

This function lets you dynamically adjust the trailing stop-loss distance for a trade you've already set up. It's really important to remember that this adjustment is always based on the *original* stop-loss you set when the trade began, not any adjustments that have been made since.

Think of it like this: you're fine-tuning the protection of your profits. You provide a percentage shift – a negative shift brings the stop closer to your entry price, tightening it, while a positive shift pushes it further away, loosening it.

The system is designed to prevent small errors from adding up.  It only updates the trailing stop if the new distance provides *better* protection, essentially moving it in a direction that's more advantageous.  For long positions, the stop can only move higher, and for short positions, it can only move lower. It also automatically figures out if you're running a backtest or a live trade.




You'll need to specify the trading symbol, the percentage shift you want to apply, and the current market price to ensure the adjustment is accurate.

## Function commitPartialProfitCost

This function helps you automatically close a portion of your trade to secure profits. It takes a specific dollar amount you want to close, and it figures out what percentage of your position that represents. Think of it as a simplified way to take partial profits, especially as your trade moves towards its target price. 

It handles the details for you, like checking if you’re in a backtest or live trading environment and getting the current price of the asset. 

You just need to tell it the symbol you're trading (like BTCUSDT) and the dollar amount you want to close.

## Function commitPartialProfit

This function lets you automatically close a portion of your open trade when it's moving towards your target profit level. It's designed to help you secure some gains along the way. You tell it which trading pair you're working with and what percentage of the position you want to close. The system figures out whether it's running in a backtesting environment or a live trading account and handles the process accordingly. Remember, it only closes a portion of the trade if the price is moving in a profitable direction, towards your take profit target.


## Function commitPartialLossCost

This function helps you automatically close a portion of your trade to limit losses. It takes the trading symbol and a specific dollar amount you want to close, and figures out the percentage of your position needed to achieve that. Think of it as a simplified way to move your stop loss closer. The framework handles the details of determining the current price and whether it's running in a backtest or live environment for you. It's designed to work when the price is heading in a direction that would trigger a stop loss.


## Function commitPartialLoss

This function lets you automatically close a portion of your open trade when the price moves unfavorably, essentially moving your stop-loss closer. It's designed to handle situations where you want to reduce your risk by closing a percentage of your position if the market goes against you. You specify the symbol of the trading pair and the percentage of the position you want to close – it handles whether you're running a backtest or a live trade automatically. The function will only execute if the price is trending in a direction that would trigger a stop-loss.


## Function commitClosePending

This function helps you finalize a pending close order for a specific trading pair. It's useful when you want to manually acknowledge or confirm a closing action within your strategy without interrupting its normal operation. Think of it as telling the system, "Yes, I'm aware this closing order is in progress." It won't interfere with any pre-scheduled signals or the overall strategy flow, and it won't halt further signal generation. You can optionally provide a close ID to keep track of the close order's origin. The framework automatically recognizes whether it's running in a backtesting or live environment.

## Function commitCancelScheduled

This function lets you cancel a scheduled trading signal without interrupting your strategy's normal operation. Think of it as removing a signal that was planned for later, like a pending order that you no longer want to execute. It specifically targets signals that are waiting for a certain condition (like the market opening) to become active. Importantly, canceling a signal this way doesn't stop your strategy from running or creating new signals, and it doesn’t trigger any stop actions. You can optionally provide a cancellation ID to help you keep track of when and why you canceled a signal. The function intelligently adapts to whether you're in a backtesting or live trading environment.

## Function commitBreakeven

This function lets you automatically adjust your stop-loss order to breakeven once your trade has gained a certain amount of profit. Essentially, it protects your initial investment by moving the stop-loss to your entry price, eliminating the risk of losing the money you’ve already made. The threshold for triggering this breakeven move is based on a combination of slippage and fee considerations, ensuring you’re covering those costs. It works seamlessly whether you're backtesting strategies or trading live, and it automatically retrieves the current market price to make the decision. You just need to provide the trading pair symbol to use the function.

## Function commitAverageBuy

This function helps you add to a position using a dollar-cost averaging (DCA) strategy. It essentially places a new buy order at the current market price, keeping track of the average price you've paid for the asset. It automatically figures out if you're running a backtest or live trading and gets the current price for you. You just need to tell it the trading symbol (like BTCUSDT) and optionally specify a cost. This function also lets others know a new buy order has been placed by sending out a signal.

## Function commitActivateScheduled

This function lets you trigger a scheduled signal to activate before the price actually hits the intended level. It's useful when you want to manually control when a signal gets processed. 

Think of it as a way to nudge the strategy to consider the signal sooner than it normally would. You can optionally provide an ID to keep track of when you manually activated the signal. The framework automatically knows whether it's running a backtest or a live trading session. 

It essentially sets a flag that the strategy will then check during its regular processing.

## Function checkCandles

The `checkCandles` function is a utility for ensuring your historical price data is properly aligned with the trading intervals you've defined. It directly examines the timestamps stored in your persisted data – think of it as a quality control check on your historical candles. This function is useful for spotting potential issues where your data might not be perfectly synchronized, which could impact backtesting accuracy. It reads this data straight from the storage files, so there are no intermediary layers involved. You provide validation parameters to guide the check and it will perform the verification, finishing with a promise that resolves when the process is complete.

## Function addWalkerSchema

This function lets you register a "walker" – essentially a system that runs backtests for several different trading strategies simultaneously. Think of it as setting up a controlled experiment to see which strategy performs best. You provide a configuration object, the `walkerSchema`, which defines how the walker should execute the backtests and compare the results. It’s designed for situations where you want to benchmark multiple strategies against each other using the same data and evaluation criteria.

## Function addStrategySchema

This function lets you tell backtest-kit about a new trading strategy you've built. It’s how you register your strategy so the framework knows how to use it. When you register a strategy, backtest-kit will automatically check to make sure it’s set up correctly, including verifying the prices, target profit/stop-loss logic, and timing of its signals. It also helps prevent your strategy from sending too many signals at once and ensures your strategy's data can be safely saved even if something unexpected happens during live trading. You just need to provide the strategy's configuration details to this function.


## Function addSizingSchema

This function lets you tell the backtest-kit how to determine the size of your trades. Think of it as defining your risk management strategy. You provide a configuration object that specifies things like whether you're using a fixed percentage of your capital, a Kelly Criterion, or something based on Average True Range (ATR). It also allows you to set limits on how much you're willing to risk and constraints on the maximum size of a position. You can even include custom calculations using callbacks to fine-tune your sizing logic.

## Function addRiskSchema

This function lets you define and register how your trading system manages risk. Think of it as setting up the guardrails for your strategies. 

You can specify limits on how many trades can be active at once, and even create your own custom checks to make sure your portfolio stays healthy—perhaps looking at correlations between assets or other portfolio-level metrics. 

The really powerful part is that multiple trading strategies can share this risk management setup, allowing for a unified view and coordinated risk control across everything you're trading. The system keeps track of all open positions so your risk checks can accurately assess the overall situation.

## Function addFrameSchema

This function lets you tell backtest-kit about a new timeframe you want to use for your backtesting. Think of it as registering a way to generate the historical data your trading strategy will analyze. You provide a configuration object that describes the timeframe, including its start and end dates, the interval (like daily, hourly, or weekly), and a function to handle any events that happen during timeframe generation. Essentially, you’re defining a new data source for your backtest.


## Function addExchangeSchema

This function lets you tell backtest-kit about a new data source, like a cryptocurrency exchange or stock market. Think of it as registering where the framework can find historical price data and other information needed for your trading strategies.  You provide a configuration object that details how to access that data, including how to fetch past price movements (candles), format prices and quantities appropriately for the specific exchange, and even calculate a common indicator like VWAP. Essentially, it's the crucial first step to integrating a new exchange into your backtesting environment.

## Function addActionSchema

This function lets you plug in custom actions to your backtest. Think of actions as ways to react to events happening during your trading strategy's run – like when a signal is generated or a trade hits a profit target. You can use these actions to do things like send notifications to a chat, log events, update external systems, or even trigger other business logic. By registering an action schema, you're essentially telling the backtest kit how to respond to these events in a flexible, event-driven way. Each action gets its own instance, tailored to the specific strategy and timeframe it’s running in, so it receives all the relevant event data.
