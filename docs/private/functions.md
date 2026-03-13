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

This function helps speed up your backtesting by pre-loading historical price data. It downloads candles – those blocks of price information for a specific time interval – for a range of dates you specify. Think of it like preparing the data you need *before* your trading strategies start running, so they don’t have to wait while fetching it. You tell it where to start and end the date range, and the function takes care of downloading and storing those candles for later use. This is particularly helpful when dealing with longer backtest periods or frequent data requests.

## Function validate

This function helps you make sure everything is set up correctly before you start any backtesting or optimization runs. It checks if all the entities you’re using – like exchanges, trading strategies, or risk management configurations – are properly registered within the system.

You can tell it to validate specific parts of your setup by providing arguments, or just let it check *everything* to be absolutely sure. Think of it as a quick health check for your trading environment, catching any registration errors that could cause problems later. The validation process is also designed to be efficient, remembering results so it doesn’t have to repeat checks unnecessarily.

## Function stopStrategy

This function lets you pause a trading strategy's signal generation. Think of it as hitting a temporary stop button – it won't immediately close any existing trades, but it will prevent the strategy from creating new ones. The strategy will gracefully finish any ongoing signals before stopping, whether you’re running a backtest or a live trade. To halt a strategy, simply provide the trading symbol it's associated with. The system automatically knows if it's in backtest or live mode and will pause at a safe point.

## Function shutdown

This function lets you properly end a backtesting run. It sends out a signal, like a notification, to all parts of your backtest to clean up anything they need to before the program stops. Think of it as a polite way to say goodbye to your backtest, ensuring everything closes down nicely when you're done or if something interrupts the process. It’s helpful when you need to respond to signals that tell the program to stop, like when you press Ctrl+C.

## Function setLogger

You can now control how backtest-kit reports its activities. This function lets you provide your own logging system, giving you more flexibility in how you monitor and debug your trading strategies. The framework will automatically add useful information, like the strategy's name and the trading symbol, to each log message, making it easier to understand what’s happening during backtesting. Simply provide an object that fulfills the `ILogger` interface, and backtest-kit will use it for all its logging needs.


## Function setConfig

This function lets you adjust how the backtest-kit framework operates. Think of it as tweaking the underlying settings to fine-tune your backtesting environment. You can provide a new configuration object, and only the parts you specify will be changed – it doesn’t require a complete overhaul of all settings. There’s also an “unsafe” option available, mainly for test environments where you might need to bypass certain checks.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, like those generated in markdown format. You can tweak the default column definitions to highlight the information that's most important to you. The function checks your changes to make sure they're valid, but if you're working in a testing environment and need maximum flexibility, you can bypass these checks. Just be careful when skipping validation! 


## Function overrideWalkerSchema

This function lets you tweak how backtest-kit analyzes and compares different trading strategies. Think of it as a way to adjust the settings of a "walker," which is responsible for exploring various strategy combinations. You can provide a partial configuration – only the parts you want to change – and the function will merge those changes with the existing walker setup, leaving everything else untouched. This is useful for fine-tuning comparisons without having to redefine the entire walker from scratch.

## Function overrideStrategySchema

This function lets you modify a trading strategy that's already been set up within the backtest-kit framework. Think of it as a way to tweak an existing strategy – you can change specific parts of its configuration without having to recreate the whole thing.  It only updates the details you provide; the rest of the strategy stays as it was originally defined. This is useful for making small adjustments or experimenting with different settings for a strategy you’ve already built. You’ll be giving it a piece of the strategy's configuration, and it will merge that with the existing setup.

## Function overrideSizingSchema

This function lets you tweak an existing position sizing strategy without having to rebuild it from scratch. Think of it as a way to fine-tune a sizing schema you've already set up. You provide a new configuration – it only needs to include the settings you want to change; everything else stays the same. This is helpful for making small adjustments to your sizing rules without affecting the rest of the strategy.

## Function overrideRiskSchema

This function lets you adjust your existing risk management setup without having to redefine the entire thing. Think of it as making small tweaks to a configuration you’ve already created. You provide a partial configuration – just the bits you want to change – and the framework updates the existing risk schema, leaving everything else untouched. It’s a handy way to fine-tune your risk controls as needed. 

The function returns a promise that resolves to the updated risk schema.

## Function overrideFrameSchema

This function lets you adjust the settings for a timeframe you've already defined in your backtesting setup. Think of it as a way to make small tweaks without rebuilding the entire timeframe configuration from scratch. You only need to specify the parts you want to change; everything else will stay as it was. It’s useful for fine-tuning your timeframe parameters as you refine your trading strategy.

## Function overrideExchangeSchema

This function lets you modify how the backtest-kit framework interacts with a specific data source, like a historical price feed for a particular exchange. Think of it as updating a piece of information about an exchange – maybe you want to change how it handles a specific symbol.  It doesn't replace the entire exchange setup; instead, it only changes the parts you specify. You provide a new configuration, and the function applies those changes to the existing exchange schema, leaving the rest untouched. This is useful for fine-tuning your backtesting environment without having to redefine everything.

## Function overrideActionSchema

This function lets you tweak how your actions are handled within the backtest-kit framework without having to completely re-register them. Think of it as a way to make small adjustments to existing action handlers, like changing the logic for a specific event or swapping out callback functions depending on where you're running your tests – development, production, or somewhere else. It’s a quick and easy way to modify how actions behave without needing to alter your core strategy. You only need to provide the parts you want to change; everything else stays as it was.

## Function listenWalkerProgress

This function lets you track the progress of a backtest as it runs. It provides updates after each strategy finishes executing within the backtest. You give it a function that will be called with information about each strategy's completion, and this function ensures that those updates are handled one at a time, even if your update function itself takes some time to process. Think of it as a way to get notified about the steps in the backtest process and make sure your notifications aren't overlapping.  The function returns another function you can call to unsubscribe from these updates later.

## Function listenWalkerOnce

This function lets you subscribe to updates from a trading simulation, but only for a single event that meets a specific condition. You provide a filter – a rule that determines which updates you're interested in – and a function to run when a matching update is found. Once that single matching update appears, the function automatically stops listening and removes itself, ensuring you don't get bombarded with unnecessary data. It’s perfect for situations where you need to react to a particular event and then move on.

Here’s a breakdown:

*   It allows you to define what kind of event you are looking for.
*   It automatically unsubscribes after the first matching event.
*   It's ideal for reacting to specific events in a trading simulation and then stopping.

## Function listenWalkerComplete

This function lets you be notified when the backtest process finishes running all your trading strategies. It’s a way to know when the whole testing cycle is complete.  

When the testing is done, a notification event is sent to your provided function.  

Importantly, the events are handled one at a time, even if the code you provide needs to do something asynchronous, ensuring things happen in the right order and preventing any conflicts. This helps keep your testing process stable and predictable.

## Function listenWalker

The `listenWalker` function lets you keep track of how a backtest is progressing, one strategy at a time. It's like setting up a listener that gets notified when each strategy finishes running within a `Walker`. The information it provides is contained in a `WalkerContract` object. Importantly, even if your callback function takes time to process the information (like if it's an asynchronous operation), the notifications are handled in the order they come in, and only one at a time, to avoid conflicts. You'll get a function back that you can call to unsubscribe from these updates.

## Function listenValidation

This function lets you keep an eye on potential problems during your risk validation checks. It essentially sets up a listener that will notify you whenever a validation function encounters an error. Think of it as a safety net for your trading strategies – if something goes wrong during the validation process, you'll get an alert. 

The errors are handled in the order they happen, even if your error handling code itself takes some time to run. To ensure smooth operation, it uses a queuing system to prevent multiple error handlers from running at the same time. You provide a function (`fn`) that will be called whenever an error occurs, allowing you to log, monitor, or take corrective action. When you’re finished listening, the function returns another function you can call to unsubscribe.

## Function listenSyncOnce

This function lets you tap into the signal synchronization flow just once, and it’s great when you need to coordinate with something outside of backtest-kit.  You provide a filter – a check to see if the signal is relevant to you – and a function to run when a matching signal comes through.  The key thing is, it only runs *once*, then unsubscribes itself.  If your callback function involves asynchronous operations like promises, backtest-kit will pause until that operation finishes before continuing, which can be crucial for maintaining accurate synchronization. This can be useful for things like updating external databases or ensuring data consistency with other systems.


## Function listenSync

This function lets you tap into what's happening behind the scenes as your trading signals are being processed. It's designed to help you keep things in sync with other systems, like a database or external API. Essentially, it allows you to react to signals that are in the process of being opened or closed, ensuring everything stays coordinated. If you provide a function that returns a promise, backtest-kit will pause signal processing until that promise resolves, guaranteeing a synchronized state.

## Function listenStrategyCommitOnce

This function allows you to temporarily watch for specific strategy changes within your backtest. You provide a filter that defines which changes you're interested in, and a function that will be executed only *once* when a matching change occurs. After that single execution, the function automatically stops listening, making it a clean way to react to a one-time event without ongoing monitoring. It's helpful for things like initializing state based on a strategy's initial configuration. 

The first argument specifies the criteria for which events to watch for, and the second argument defines what should happen when a matching event is detected.

## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategies. It's like setting up a notification system that tells you when certain actions are taken, such as canceling a scheduled trade, closing a position for profit or loss, or adjusting stop-loss and take-profit levels. The really useful part is that it handles these notifications one at a time, even if your notification processing takes some time, ensuring things are handled in the correct order and avoiding any issues with multiple things happening at once. You provide a function that gets called whenever one of these strategy events occurs, allowing you to react to them as needed. 


## Function listenSignalOnce

This function lets you react to specific trading signals just once, and then automatically stop listening. Think of it as setting up a temporary alert – you tell it what kind of signal you're looking for, and when that signal appears, a function runs and the alert disappears. It's really handy if you need to respond to a particular market condition and then move on without constantly monitoring. You provide a condition (the `filterFn`) to identify the signal you want, and then a function (`fn`) that will be executed when that signal is detected.

## Function listenSignalLiveOnce

This function lets you tap into live trading signals, but only for a single event. You provide a filter – a rule that determines which signals you're interested in – and a function to run when a matching signal arrives.  It's perfect for quickly reacting to a specific market condition without needing to manage ongoing subscriptions. Once the callback function runs, it automatically stops listening, so you don't have to worry about cleaning up. It works specifically with signals generated during a `Live.run()` execution.


## Function listenSignalLive

This function lets you tap into the live trading signals generated by backtest-kit. It's designed to receive events from `Live.run()` executions, making it perfect for real-time monitoring or reacting to market changes as they happen.  The signals are delivered to your callback function in the order they occur, with an asynchronous queue ensuring that they are processed one at a time. To stop listening, the function returns another function that you can call to unsubscribe.

## Function listenSignalBacktestOnce

This function lets you temporarily tap into the signals generated during a backtest run, but with a twist – it's a one-time deal. You provide a filter to specify which signals you’re interested in, and a function that will be executed precisely once when a matching signal arrives.  After that single execution, the subscription automatically ends, preventing further unwanted signal processing. It's a clean way to grab a specific piece of information from a backtest without lingering subscriptions. The provided filter function determines which events trigger your callback.


## Function listenSignalBacktest

This function lets you tap into the backtest process and receive updates as they happen. Think of it as subscribing to a stream of information about the trading simulation.  Specifically, you'll get events triggered during a `Backtest.run()` execution. These events are delivered one at a time, ensuring they're handled in the order they occurred, which can be helpful for analyzing the backtest’s progress. You provide a function that will be called each time a new event is available – this function will receive details about the event, such as what happened during the simulated trading. When you're finished listening, the function returns another function you can call to unsubscribe.

## Function listenSignal

This function lets you tap into the signals your trading strategy generates, like when a position is opened, active, or closed. It's like setting up a listener that gets notified about important events happening in your backtest.  The cool thing is, it handles these events in order and makes sure they're processed one at a time, even if your callback function takes some time to complete. You just provide a function that will be called whenever a signal event occurs, and it will take care of the rest. When you're done listening, the function returns another function that you can call to unsubscribe.

## Function listenSchedulePingOnce

This function lets you react to specific ping events, but only once. It's like setting up a temporary alert – you define what kind of ping you're looking for, and when it arrives, a function runs and then the alert automatically disappears.  You provide a filter to identify the events you're interested in, and a function to execute when that event happens.  Once the event matches the filter and the function is called, the subscription is automatically removed, preventing further executions. It’s handy for situations where you need to respond to an event just one time.


## Function listenSchedulePing

This function lets you keep an eye on signals that are waiting to be activated according to a schedule. It sends out a "ping" signal every minute while a signal is in this waiting period. Think of it as a heartbeat to confirm the signal is still there and being processed. You provide a function that will be called whenever one of these ping signals is received, allowing you to build custom checks or track the signal’s progress. Essentially, it gives you a way to monitor the lifecycle of scheduled signals.


## Function listenRiskOnce

This function lets you react to specific risk-related events, but only once. You provide a filter that defines which events you're interested in, and a function to execute when a matching event occurs. After the function runs once, it automatically stops listening, making it ideal for scenarios where you need to respond to a condition just one time and then move on. It’s a convenient way to handle temporary needs or react to a single occurrence of a particular risk signal.

## Function listenRisk

This function lets you be notified whenever a trading signal is blocked because it violates your risk rules. Think of it as a watchful eye on your trades, alerting you specifically when something goes wrong. Importantly, you'll only receive these notifications when a signal is *rejected* – signals that pass your risk checks won’t trigger anything, helping to avoid unnecessary alerts.  The notifications are handled in a reliable order, and even if your response takes some time, it won’t disrupt other pending notifications. You provide a function that will be called whenever a risk rejection occurs, allowing you to react appropriately.  The function you provide will return a function which you can call to unsubscribe from the risk rejection events.

## Function listenPerformance

This function lets you keep an eye on how quickly your trading strategies are running. It's like having a built-in profiler that tracks the timing of different operations. Whenever a performance event occurs—like a trade being executed or a calculation happening—this function will notify you, providing details about how long it took. Importantly, these notifications are handled one at a time, even if your notification handling code takes some time to complete, preventing unexpected issues. You give it a function that will be called whenever a performance event happens, and it returns a function you can use to unsubscribe later.

## Function listenPartialProfitAvailableOnce

This function lets you set up a listener that waits for a specific partial profit condition to be met, then takes action once, and then stops listening. You provide a filter that defines the exact condition you're looking for – think of it as a rule to identify the events you care about. Once an event matches your rule, the function will execute a callback you define, performing whatever action you need, and then automatically unsubscribe itself from further events. It's a handy way to react to a particular profit level just once.


## Function listenPartialProfitAvailable

This function lets you be notified when your trading strategy reaches certain profit milestones, like 10%, 20%, or 30% gains. It’s like setting up alerts for significant progress. Importantly, these alerts are handled in order, one after another, even if the notification involves some processing time on your end. This ensures things don’t get out of sync. You provide a function that will be called whenever a profit milestone is hit, and this function receives information about the contract at that point. The function you provide also returns a function that can be used to unsubscribe from this alert.

## Function listenPartialLossAvailableOnce

This function lets you set up a listener that reacts to partial loss events, but only once. You provide a filter to specify exactly which loss events you're interested in, and a callback function to run when a matching event occurs. Once the callback has been triggered, the listener automatically stops, making it perfect for situations where you need to respond to a specific condition just one time. It's a convenient way to react to a one-off loss situation without needing to manage subscriptions yourself.

## Function listenPartialLossAvailable

This function lets you be notified when your trading strategy experiences specific levels of loss, like 10%, 20%, or 30% decline. It ensures these notifications happen in the order they occur, even if your notification handling takes some time. To avoid issues with multiple notifications happening simultaneously, it uses a queuing system to process them one at a time. You provide a function that will be called each time a loss level is reached, and this function will receive information about the partial loss contract. The function you provide returns a function that can unsubscribe from these notifications later on.

## Function listenHighestProfitOnce

This function lets you set up a one-time alert based on the highest profit a contract has achieved. You provide a filter – a condition that must be met – and a function to execute when that condition is met.  Once the filter matches a highest profit event, your function runs just once, and then the alert automatically stops listening. This is perfect for situations where you only need to react to a specific profit milestone.

It takes two arguments: a filter function that checks each profit event and a callback function that gets executed when a matching event is found.


## Function listenHighestProfit

This function lets you keep an eye on when your trading strategies reach new peak profit levels. It will notify you whenever a signal achieves a higher profit than before. Importantly, it makes sure that these notifications are handled one at a time, even if the function you provide to handle them takes some time to complete. This is great for things like tracking important profit milestones or adjusting your strategies on the fly as profits increase. You give it a function that will be called each time a new highest profit is reached, and it returns a function you can use to stop listening.

## Function listenExit

This function allows you to be notified when the backtest-kit framework encounters a critical, unrecoverable error that halts the process. Think of it as an emergency alert for your backtesting environment. It's different from handling regular errors because these fatal errors will stop the current background task, such as a live trading simulation or a backtest.  The function ensures that when an error occurs, your callback function is executed in a safe, sequential manner, even if that function itself performs asynchronous operations. You provide a function that will be called with an error object when such a fatal error happens, and this function returns another function that you can use to unsubscribe from these alerts later.

## Function listenError

This function lets your strategy gracefully handle errors that might pop up during its operation, like when an API call fails. Instead of crashing, the strategy will keep running, but you'll be notified about the issue. The errors are dealt with one at a time, in the order they happen, even if your error handling code takes some time to complete. Think of it as setting up a safety net – if something goes wrong, you'll get a signal, and you can react without interrupting the trading process. To use it, you simply provide a function that will be called whenever a recoverable error occurs.

## Function listenDoneWalkerOnce

This function lets you react to when a background task within your trading strategy finishes, but only once. You provide a filter to specify which completion events you're interested in, and then a function that will be executed when a matching event occurs. Once that function has run, the subscription is automatically removed, so you won't get any further notifications. It’s a handy way to perform a one-off action after a background process completes, like updating a display or triggering another action. 

You give it a condition to check each completion event against, and the action to take when that condition is met. The function takes care of subscribing and unsubscribing, so you don't have to worry about manual cleanup.

## Function listenDoneWalker

This function lets you keep an eye on when background tasks within your backtest complete. It's perfect for situations where you need to react to those tasks finishing, ensuring things happen in the right order.

Think of it as a notification system: you provide a function (`fn`) that will be called whenever a background task is done. Importantly, even if your function takes some time to run (like if it involves asynchronous operations), the next completion event will wait patiently in line until yours is finished. This makes sure things don't get jumbled up and that your logic executes predictably.

The function returns another function that you can use to unsubscribe from these completion notifications later on, so you can stop listening when you no longer need to.

## Function listenDoneLiveOnce

This function lets you react to when background tasks within your trading strategy finish running. You provide a filter – a way to specify which completed tasks you’re interested in – and a callback function that will be executed when a matching task is done. Importantly, the callback runs only once, and the function automatically stops listening after that, keeping things clean and efficient. It’s useful for triggering actions or calculations when specific background processes conclude.

## Function listenDoneLive

This function lets you keep an eye on when background tasks within your backtest finish running. It’s really useful if you need to react to these completions in a specific order. The function provides a way to subscribe to these "done" events, ensuring that when a background task is complete, you get notified, and any processing you do based on that notification happens one step at a time, even if your processing involves asynchronous operations.  You give it a function that will be called when a task is done, and it returns another function you can use to unsubscribe from these notifications later.

## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but only once. You provide a way to specify which backtest completions you’re interested in – essentially, a filter.  Once a backtest completes that matches your filter, your provided callback function will be run, and then the subscription is automatically removed, so you won't get any more notifications. It’s perfect for situations where you only need to act on a backtest’s result once. 

Here's how it works:

*   **`filterFn`**:  This is your condition. It checks if a completed backtest should trigger your action.
*   **`fn`**:  This is the code that will run when a matching backtest finishes.

## Function listenDoneBacktest

This function lets you be notified when a backtest finishes running in the background. It’s really useful if you need to perform actions after a backtest is complete, like updating a user interface or saving results. The function provides a way to ensure these actions happen one at a time, even if they involve asynchronous operations, preventing any unexpected issues from occurring simultaneously. Essentially, it’s a reliable way to respond to the completion of a backtest. You provide a function that will be called when the backtest is done, and it returns a function you can use to unsubscribe from these notifications later.

## Function listenBreakevenAvailableOnce

This function lets you set up a listener that waits for a specific breakeven protection event to happen, but only reacts once. You give it a filter – a rule to determine which events you're interested in – and a callback function that will run when a matching event occurs. Once the callback has been executed, the listener automatically stops, so you don't have to worry about manually unsubscribing. It’s handy when you need to respond to a particular breakeven condition just one time and then move on.

The `filterFn` defines what kind of event you want to listen for. 
The `fn` is the code that gets executed when a matching event is detected.


## Function listenBreakevenAvailable

This function lets you get notified whenever a trade’s stop-loss automatically moves to breakeven. It's triggered when the price moves favorably enough to cover the costs associated with the trade. Think of it as a way to be alerted when a trade has essentially paid for itself. The notifications are handled one at a time to avoid any issues with overlapping processing. To stop receiving these notifications, the function returns a cleanup function that you can call.

## Function listenBacktestProgress

This function lets you keep an eye on how a backtest is progressing. It's like setting up a notification system that tells you about the backtest's status as it runs.

The function gives you a callback that will be triggered as the backtest goes through its steps. Importantly, these updates happen one at a time, even if your callback function needs to do some extra work – this ensures things stay organized.

You receive progress updates during the `Backtest.background()` execution, helping you understand the backtest’s journey. To stop listening to these updates, the function returns another function you can call.

## Function listenActivePingOnce

This function lets you temporarily listen for specific active ping events and react to them just once. You provide a filter to define which events you're interested in, and a function that will be executed when a matching event occurs. Once that event is processed, the listener automatically stops, so you don't have to worry about managing subscriptions manually. It’s perfect for scenarios where you need to wait for a particular condition related to active pings and then take action.

You tell it what to look for using `filterFn`, which is like a set of instructions for identifying the events you want.  Then, you define `fn`, the code that will run when an event matches your filter. After `fn` runs once, the listener turns itself off.

## Function listenActivePing

This function allows you to keep an eye on the status of your active trading signals. It essentially subscribes you to updates – a "ping" – that happen every minute. Think of it as a heartbeat signal for your signals, letting you know they're still active.

The function gives you a callback that gets triggered whenever a ping event occurs. This is great for building systems that dynamically manage your signals, for example, automatically adjusting settings or pausing strategies based on their activity.

Importantly, these pings are handled one at a time, even if your callback needs to do some asynchronous work. This ensures that the processing order is maintained and prevents any conflicts or unexpected behavior. To stop listening, the function returns another function that you can call to unsubscribe.

## Function listWalkerSchema

This function gives you a peek under the hood, letting you see all the different "walkers" that are currently set up within the backtest-kit framework. Think of walkers as specialized tools for processing your trading data. By using this function, you get a list of these tools, which can be helpful for understanding how your backtest is configured, creating documentation, or even building user interfaces that adapt to the available walkers. It essentially provides a snapshot of all the registered walker schemas.

## Function listStrategySchema

This function lets you see a complete list of all the trading strategies your backtest-kit setup knows about. It's like getting a directory of your available strategies, each described by its schema. Think of it as a quick way to inspect what strategies are ready to be used, helpful when you’re troubleshooting, creating documentation, or building user interfaces that need to display strategy options. The function returns a promise that resolves to an array, with each item in the array detailing a registered strategy’s structure.

## Function listSizingSchema

This function lets you see all the sizing strategies currently set up in your backtest. Think of it as a way to peek under the hood and understand how your trades will be sized. It returns a list of configurations, which can be helpful if you're troubleshooting or want to build tools that adapt to different sizing methods. Essentially, it provides a snapshot of all the sizing schemas you've added.

## Function listRiskSchema

This function lets you see all the risk schemas currently set up within your backtest environment. Think of it as a way to peek under the hood and understand how your risk management is configured. It returns a list of these configurations, which can be helpful when you’re troubleshooting, creating documentation, or building a user interface that needs to adapt to different risk settings. Basically, it's your window into the risk profiles that are actively being used.

## Function listFrameSchema

This function lets you see all the different types of data structures, or "frames," that your backtest kit is set up to handle. Think of it as a way to get a complete inventory of all the custom data formats you've defined. It returns a list of these definitions, which can be helpful if you're troubleshooting, creating documentation, or building user interfaces that need to understand the different data types. Basically, it shows you what kinds of data your backtesting system is designed to work with.

## Function listExchangeSchema

This function provides a way to see all the different exchanges your backtest-kit setup knows about. It essentially gives you a list of the exchange configurations that have been added, allowing you to inspect them or use them to build tools. Think of it as a directory listing for your exchanges, helpful for making sure everything is set up correctly or creating a user interface to manage them. The function returns a promise that resolves to an array containing the details of each registered exchange.

## Function hasTradeContext

This function simply tells you whether the trading environment is ready for actions. It confirms that both the execution and method contexts are active, which is necessary before you can use important tools like fetching historical data (candles), calculating average prices, or formatting numbers and quantities used in trades. Think of it as a quick check to ensure everything is set up correctly before proceeding with your trading logic. If it returns `true`, you're good to go; otherwise, something might be missing in the setup.

## Function getWalkerSchema

This function helps you understand the structure of a trading strategy or analysis component you're using. Think of it as a way to peek inside and see what data a particular piece of your backtesting setup expects. You give it the name of the strategy or analysis – a unique identifier – and it returns a detailed blueprint outlining its expected inputs and outputs. This blueprint, called an "IWalkerSchema," clarifies how that component fits into the overall backtesting process.

## Function getTotalPercentClosed

This function helps you understand how much of a trade is still open. It tells you the percentage of your initial position that hasn't been closed yet, ranging from 0% (fully closed) to 100% (completely open). The function is smart enough to handle situations where you've added to a trade over time (Dollar-Cost Averaging or DCA), so it gives an accurate picture even with partial closures. You don't need to worry about whether the system is running a backtest or a live trade - it figures that out automatically. To use it, you just need to provide the symbol of the trading pair you're interested in.

## Function getTotalCostClosed

This function lets you find out how much money you've spent on a position you still own. It calculates the total cost basis, taking into account any times you've closed parts of the position along the way, ensuring it reflects a dollar-accurate value. It smartly figures out whether you're running a backtest or a live trade, so you don't have to worry about setting anything. Just provide the symbol of the trading pair you're interested in, and it will return the total cost as a number.

## Function getTimestamp

This function, `getTimestamp`, gives you the current time. It's useful for knowing exactly when events are happening within your trading strategy. When you're testing a strategy against historical data (backtesting), it returns the timestamp of the specific time period the strategy is currently evaluating. If you're running the strategy live, it provides the actual, current time.

## Function getSymbol

This function lets you easily find out what symbol your backtest or trading strategy is currently focused on. It's a simple way to grab the symbol string from the environment your code is running in. Just call it, and it returns a promise that resolves to the symbol name. This is useful for things like displaying the current symbol in a user interface or using it in logging statements.

## Function getStrategySchema

This function lets you find out the structure of a trading strategy that's been set up within the backtest-kit framework. You give it the name of the strategy you're interested in, and it returns a detailed description of what that strategy looks like – what inputs it needs, what calculations it performs, and how it behaves. Think of it as a blueprint for a particular trading approach, allowing you to understand and potentially validate its design. It's useful for building tools that work with strategies programmatically or for simply inspecting how a strategy is configured. The name you provide must match a strategy that has already been registered within the system.

## Function getSizingSchema

This function helps you access the specific rules and logic used to determine how much of an asset to trade in a backtest. Think of it as looking up a pre-defined plan for position sizing. You provide a name – a unique identifier – and the function returns the detailed schema associated with that name, allowing you to understand and potentially customize the sizing strategy. Essentially, it's a way to fetch the blueprint for how your trades are sized.


## Function getScheduledSignal

This function helps you find out what scheduled signal is currently running for a specific trading pair. Think of it as checking if a pre-planned signal is active. It will return information about that signal if it's running, or nothing at all (null) if no signal is scheduled.  The function intelligently figures out whether you're in a backtesting simulation or live trading environment, so you don't need to worry about that. You just need to tell it which symbol you're interested in.

## Function getRiskSchema

This function helps you access pre-defined templates for managing risk in your trading strategies. Think of it as looking up a blueprint for how to calculate and track a specific type of risk, like volatility or drawdown. You provide the name of the risk you’re interested in, and the function returns a detailed schema outlining how to handle it. This allows for consistent and structured risk management across different backtests.

## Function getRawCandles

The `getRawCandles` function helps you retrieve historical candlestick data for a specific trading pair. You can request a limited number of candles, or define a start and end date for the data you need. The function automatically adjusts how much data is fetched based on the parameters you provide, always ensuring that the data doesn't look into the future. 

You have several ways to specify your request: you can set both a start and end date along with a limit, just define start and end dates, provide only an end date and a limit, or only provide a limit to fetch candles backward from the current time.

Here’s a breakdown of what the arguments mean:

*   `symbol`: The trading pair, like "BTCUSDT".
*   `interval`: The timeframe for the candles, such as "1m" for one-minute candles or "1h" for one-hour candles.
*   `limit`: The maximum number of candles you want to get.
*   `sDate`: The start date for the candles, given as milliseconds since the epoch.
*   `eDate`: The end date for the candles, also given as milliseconds since the epoch.

## Function getPositionPnlPercent

This function helps you quickly understand how much profit or loss you’re currently facing on an open trade. It calculates the unrealized percentage profit and loss for a specific trading pair, taking into account things like partial trade closures, the cost of entering the trade (DCA), slippage, and trading fees. If you don't have any active trades for that symbol, it will return null. The function is smart enough to adjust its calculations depending on whether you're running a backtest or a live trade and automatically gets the current market price to provide an accurate assessment. You just need to tell it the trading pair symbol you’re interested in.

## Function getPositionPnlCost

This function helps you figure out the unrealized profit or loss, expressed in dollars, for a trade that's still open. It considers things like the percentage gain or loss, the total amount you’ve invested, and factors in potential slippage and fees you might have encountered. If there aren't any active trades pending, it will return null. The function smartly adapts to whether you're running a backtest or a live trading session and automatically grabs the current market price to do the calculation. You just need to provide the symbol, like "BTCUSDT," to get the PNL amount.


## Function getPositionPartials

This function allows you to see a history of how your position has been partially closed, whether it was for profit or loss. It provides a detailed breakdown of each partial close, including the percentage closed, the price at which it occurred, and the cost basis at that time. 

If you haven't executed any partial closes yet, the function will return an empty list. If there's no active signal, it won't return anything.

You can use this information to understand how your trading strategy is managing risk and taking profits or limiting losses. To get this information, you simply need to specify the trading symbol you're interested in.

## Function getPositionPartialOverlap

This function helps avoid accidentally closing partial positions at nearly the same price again. It checks if the current market price falls within a small range around any previously executed partial close prices for a specific trading pair. 

Essentially, it calculates a tolerance zone around each partial close price based on predefined percentages. If the current price falls within any of those zones, the function returns true, signaling that a partial close at that price is likely redundant. If there are no existing partials or signals, it will return false.

You can customize this tolerance zone by providing a `ladder` parameter, allowing you to adjust the allowed deviation from the partial close price. This is useful for fine-tuning how aggressively you want to avoid duplicate partial closes.

## Function getPositionLevels

This function helps you understand where your current trade stands in relation to your initial entry and any subsequent DCA (Dollar Cost Averaging) purchases. It provides a list of prices, starting with the original price you bought the asset at, and including any prices used when you committed to averaging down your position. 

If you haven't created a pending signal yet, or haven't made any DCA purchases, it will return null or a list containing just the initial price. You provide the symbol of the trading pair you're interested in to get this information.


## Function getPositionInvestedCount

This function lets you check how many times you've added to a position through dollar-cost averaging (DCA) for a specific trading pair. It tells you how many DCA entries have been made on top of the initial investment. A result of 1 means it's just the original entry; higher numbers mean subsequent DCA buys have been added. If there's no active trading signal for that pair, it will return null. The function handles whether you're running a backtest or a live trade automatically. You just need to provide the symbol of the trading pair you're interested in.

## Function getPositionInvestedCost

This function helps you figure out how much money you've committed to a trade. It calculates the total cost basis for a pending signal, essentially adding up all the entry costs associated with it. Think of it as the total investment made so far for a specific trading pair. If there isn’t a pending signal, the function will let you know by returning null. It automatically adjusts its behavior depending on whether you're running a backtest or a live trading session. You just need to provide the symbol of the trading pair you're interested in.

## Function getPositionHighestProfitTimestamp

This function helps you find out exactly when a specific trading position reached its highest profit. It looks at the historical data for a given trading pair, like BTC/USD, and tells you the timestamp – essentially, the date and time – when that position was performing the best. If there's no historical data available for that position, it won't be able to find a timestamp and will return null. You provide the symbol of the trading pair you're interested in to use this function.


## Function getPositionHighestProfitPrice

This function helps you find the highest price a long position or the lowest price a short position has reached since it was opened. It essentially tracks the best possible outcome for the trade so far. Initially, it starts with the price you entered the trade at. As the market moves, it constantly updates this record to reflect the most favorable price achieved. You provide the trading symbol, and it returns a number representing that highest profit price, which is always guaranteed to be available once a trade is active.


## Function getPositionHighestProfitBreakeven

This function checks if a trade could have realistically reached its highest potential profit while still breaking even. It’s designed to analyze past trades and determine if the profit target was achievable given the entry price and market conditions.

The function takes the trading pair symbol as input, like "BTCUSDT."

It returns `true` if a breakeven point was mathematically possible at the highest profit price, and `false` otherwise. If no trade signals are currently pending for that symbol, the function will return `null`. This indicates that there’s no trade to analyze.


## Function getPositionHighestPnlPercentage

This function helps you understand how well a specific trade has performed. It tells you the highest percentage profit that position ever reached during its entire lifespan. You provide the symbol of the trading pair, like "BTCUSDT", and it returns that peak profit percentage. If there's no trading signal associated with that symbol, the function will indicate that by returning null. Essentially, it's a way to quickly see the most profitable point of a trade’s history.

## Function getPositionHighestPnlCost

This function helps you understand the cost associated with achieving the highest profit for a specific trading pair. It looks back at a position's history and tells you how much it cost (in the currency of the trade, like USD or BTC) to reach that peak profit. If there's no record of a signal for that trading pair, the function will return null, meaning no such cost can be determined. You simply provide the trading pair symbol – like "BTCUSDT" – and it will give you that cost value.


## Function getPositionEstimateMinutes

This function helps you understand how long a trading position is expected to last. It looks at the currently active signal and tells you the originally estimated duration in minutes. Think of it as checking the expected lifetime of a trade before it expires.

If there isn't a signal currently active, the function will return null.

To use it, you simply provide the trading pair symbol, like "BTCUSDT", and it will give you the estimated duration in minutes.


## Function getPositionEntryOverlap

This function helps avoid accidentally adding multiple DCA entries at very similar prices. It checks if the current market price is close enough to any of your existing DCA entry levels, considering a small tolerance range around each level.

You provide the symbol you're trading and the current price. Optionally, you can customize the acceptable tolerance range – how much higher or lower the price can be and still trigger a potential entry.

The function returns true if the current price falls within that acceptable range of any existing DCA level, indicating a potential overlap. If there are no existing DCA levels, it will return false. This helps you refine your trading strategy and avoid unnecessary entries.

## Function getPositionEntries

This function lets you see how your current trading position was built up, step by step. It gives you a list of each individual purchase made for a specific trading pair, like BTC/USDT.  You'll find details like the price at which each purchase occurred and how much money was spent on it. If you haven't placed any trades yet, or if you only made one purchase, it will show you nothing or a single entry, respectively.  It's useful for understanding your average entry price and the costs associated with each step of your trading strategy. The 'symbol' parameter tells the function which trading pair's history you want to see.

## Function getPositionEffectivePrice

This function helps you understand the average price you paid for a position in a trade. It calculates a weighted average, taking into account any partial closes you might have made and any DCA (Dollar-Cost Averaging) entries. Essentially, it shows you the effective entry price, which is often more useful than just the initial price. 

If you don't have any open trades or pending signals, the function will return null, letting you know there's nothing to calculate. The function will work the same whether you're running a backtest or a live trade.

You just need to provide the symbol of the trading pair you're interested in, like 'BTCUSDT'.

## Function getPositionDrawdownMinutes

This function helps you understand how far a trading position has fallen from its best performance. It tells you, in minutes, how long ago the position reached its highest profit point. Think of it as a measure of how much the price has moved against you since the position was at its peak. The value will be zero when the position first becomes profitable, and then it increases steadily as the price declines. If there isn't an active trade happening for the specified symbol, the function won’t return any value. 

You provide the trading pair symbol, like "BTCUSDT", to check the drawdown for that specific position.


## Function getPositionCountdownMinutes

This function tells you how much time is left before a trading position expires. It figures this out by looking at when the position was initially marked as pending and comparing that to an estimated expiration time.

The result is always a positive number representing minutes; if the expiration time has already passed, it will return zero. 

If a pending signal isn't found for the specified trading pair, the function will indicate that by returning null. You'll need to provide the symbol, like "BTC-USDT", to check the countdown for a particular trading pair.

## Function getPendingSignal

This function lets you check if your trading strategy currently has a pending order waiting to be filled. It takes the symbol of the trading pair, like "BTCUSDT," as input. 

It will retrieve the details of the pending signal, if one exists. If there’s no pending order, it will tell you by returning nothing. 

The function cleverly figures out whether it’s running in a backtesting environment or a live trading situation, so you don’t need to worry about that.


## Function getOrderBook

This function lets you retrieve the order book for a specific trading pair, like BTCUSDT. It pulls this information directly from the exchange you're connected to. 

You can optionally specify how many levels of the order book you want to see; if you don't specify, it will use a default depth. The function handles the timing of the request based on the current environment – whether you're backtesting or live trading.

## Function getNextCandles

This function helps you grab a batch of historical candle data for a specific trading pair and timeframe. Think of it as requesting the next set of candles that follow the most recent data your backtest has. You provide the symbol like "BTCUSDT", the interval like "1h" (for one-hour candles), and how many candles you want. It then pulls those candles from the exchange using its built-in methods, ensuring you get data that aligns with your backtesting context.

## Function getMode

This function tells you whether the backtest-kit framework is currently running in backtest mode or live trading mode. It's a simple way to check the context of your code - if it's being used to simulate past performance or to execute trades in real-time. The function returns a promise that resolves to either "backtest" or "live", giving you a clear indication of the operational environment. You can use this information to adjust your strategies or logging accordingly.

## Function getFrameSchema

This function lets you find out the structure of a particular trading frame that's been set up within the backtest-kit framework. It's like looking up the blueprint for how a specific part of your backtesting environment is organized. You provide the name of the frame you're interested in, and it returns a detailed description of what that frame contains – essentially, what data and logic it uses. This is useful for understanding the framework’s inner workings or when you need to programmatically interact with a frame's schema.

This function is how you define your own custom trading frames within the backtest-kit system. It takes a unique name for your frame and a description of its structure – outlining what data it needs and how it will operate. Essentially, you’re telling the framework, "I've created this new component, and here's what it does and how it's set up." This registration makes your custom frame available for use in your backtesting strategies.

This interface describes a data frame that’s flexible and can adapt to different data types. It represents a core building block for handling data within the backtest-kit, allowing you to interact with and manipulate your trading data in a structured way. The `view()` method provides access to the underlying data frame, letting you perform calculations, filtering, and other data-related operations. The `T` part defines the data types that the frame can hold.

This interface outlines the information available within a function that's being executed as part of a backtest or trading strategy. The most important part is the `now()` method, which gives you the current date and time—essential for time-sensitive calculations and order placement. Think of it as the context your code operates within, providing access to things like the current time.

This interface defines the structure of a trading frame – the blueprint that tells the backtest-kit how a specific component operates. It includes the frame's name for identification, a list of other data frames it relies on, and a list of functions it uses for calculations and logic. It’s the formal description used when registering a new frame using `registerFrame`. Essentially, it describes what a frame *is* made of.

This simply defines what a “Frame Name” is: it's just a regular string. You use frame names to refer to specific components within your backtest-kit setup, like when registering a new frame or referencing a data frame. Think of it as a label you give to different parts of your trading system.

A Timestamp, in backtest-kit, is represented as a simple number. This number likely represents a point in time, often in milliseconds since the Unix epoch. It’s the standard way to track time within the framework, allowing you to perform calculations and comparisons based on time.

## Function getExchangeSchema

This function helps you find the details of a specific cryptocurrency exchange that backtest-kit knows about. Think of it as looking up the blueprint for how a particular exchange works within the framework. You give it the name of the exchange you're interested in, and it returns a set of information describing things like what trading pairs are available, how orders are structured, and other exchange-specific characteristics. This information is essential for accurately simulating trading strategies against that exchange during backtesting. It’s a core way to configure your backtests to match real-world conditions.


## Function getDefaultConfig

This function provides you with a set of pre-defined settings that the backtest-kit framework uses. Think of it as a template for how the system is initially set up. It’s useful for understanding all the configurable options and what their standard values are, which can be a good starting point for your own customizations. You'll find things like settings related to data fetching, order placement, and notification limits within this configuration.

## Function getDefaultColumns

This function provides a ready-made set of column configurations used for generating reports. Think of it as a template showing you what columns are typically displayed and how they're set up by default in backtest-kit. You can peek inside to understand the structure and options available for customizing your reports, like what data each column represents (closed trades, heatmap rows, live ticks, etc.) and their initial formatting. It’s a great starting point if you want to build your own custom reporting configurations.

## Function getDate

This function lets you retrieve the current date within your trading strategy. Think of it as a way to know what date your backtest is simulating or, when running live, the actual date and time of your trading activity. It's handy for things like scheduling trades based on specific dates or analyzing data related to a particular day. The date returned will depend on whether you're running a backtest or in live trading mode.

## Function getContext

This function gives you access to the details of where your code is running within the backtest-kit framework. Think of it as a way to peek under the hood and see things like which method is currently being executed and other relevant information about the current environment. It returns a promise that resolves to an object containing this context data, allowing you to adapt your code based on the specific situation.

## Function getConfig

This function lets you peek at the system's overall settings. It gives you a snapshot of values that control how the backtesting framework operates, like how often it checks for new signals, limits on order sizes, and settings for fetching historical data. The values you get back are a read-only copy, so you can look at them without accidentally changing the actual system configuration. Think of it as a way to understand the underlying rules that govern your backtesting process.

## Function getColumns

This function lets you peek at how your backtest reports are structured. It gives you a snapshot of the columns used for different data views – like closed trades, heatmaps, live data, partial fills, breakeven points, performance metrics, risk events, schedules, strategy events, synchronization events, highest profit events, walker P&L, and strategy results. Think of it as a way to see exactly what data is being displayed in your reports without the risk of changing the report's underlying setup. You’ll get back a collection of column models, each defining how specific data types are presented.

## Function getCandles

This function lets you retrieve historical price data, also known as candles, for a specific trading pair like BTCUSDT. You tell it which pair you're interested in, how frequently the data should be grouped (like every minute, hour, or day), and how many candles you want to see. The function then pulls that data from the connected exchange and returns it to you as an array of candle data points. Think of it as requesting a specific slice of the trading history for a particular asset.


## Function getBreakeven

This function helps you determine if a trade has reached a breakeven point, covering both slippage and fees. It takes the trading symbol and the current price as input. The function calculates a threshold based on predefined slippage and fee percentages, and then checks if the current price has exceeded that threshold. It automatically adjusts its behavior depending on whether you're running a backtest or a live trade.

## Function getBacktestTimeframe

This function helps you find out the time period your backtest covers for a specific trading pair, like BTCUSDT. It returns a list of dates that represent the start and end points of the backtesting data available. Think of it as checking the boundaries of the historical data you're using to test your trading strategy. You just provide the symbol of the asset you're interested in, and it will give you those dates.

## Function getAveragePrice

This function helps you figure out the average price a symbol has traded at recently. It calculates what's known as the Volume Weighted Average Price, or VWAP, which takes into account both the price and the volume of trades. Specifically, it looks at the last five minutes of trading data, using those candles to determine a weighted average. If there's no trading volume, it simply averages the closing prices instead. You just need to provide the symbol you're interested in, like "BTCUSDT".

## Function getAggregatedTrades

This function lets you retrieve historical trade data for a specific trading pair, like BTCUSDT. It pulls this information directly from the exchange the backtest-kit is connected to.  You can request a limited number of trades, or if you don't specify a limit, it will gather trades from within a defined time window. Essentially, it helps you look back at how a trading pair has performed. The function returns an array of aggregated trade data.

## Function getActionSchema

This function helps you find out the structure and expected data for a specific action within your backtest. Think of it as looking up the blueprint for how to execute a trade or manage your portfolio. You provide the name of the action you’re interested in, and it returns a description detailing the properties it needs and their types. This is useful for validating your data and ensuring your actions are set up correctly. It's like a quick reference guide for each action you’ve defined.

## Function formatQuantity

This function helps you prepare quantity values for trading, ensuring they’re formatted correctly for the specific exchange you're using. It takes a trading symbol like "BTCUSDT" and the raw quantity you want to trade as input. Behind the scenes, it uses the exchange's rules to make sure the quantity has the correct number of decimal places, which is important for valid orders. Ultimately, it returns the formatted quantity as a string, ready to be used in your trading logic.

## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes the symbol of the trading pair, like "BTCUSDT", and the raw price value as input. It then uses the specific formatting rules for that exchange to ensure the price is shown with the correct number of decimal places. Essentially, it handles the price formatting details for you, so you don't have to worry about those exchange-specific nuances.

## Function dumpMessages

The `dumpMessages` function helps you save the details of your backtesting runs in an organized way. It takes the unique ID of your run, the entire conversation history (including system prompts, user inputs, and LLM responses), and any structured data you want to keep alongside it.

It will create a folder named after your run's ID within a designated output directory (or `./dump/strategy` if you don't specify one). Inside that folder, you'll find files documenting the system prompt, a summary of your result data, and individual files for each user message and the corresponding LLM output.

If a folder with the same result ID already exists, it won't be overwritten, preserving any previous dumps. You'll also get a warning if any of the user messages are particularly long, exceeding 30 KB. This makes it easier to analyze and share your backtesting results.

## Function commitTrailingTakeCost

This function lets you set a specific take-profit price for a trade. It's a shortcut for updating your trailing take-profit, automatically calculating the necessary percentage shift based on your initial take-profit distance. It handles the details of figuring out whether you're in a backtest or live trading environment and getting the current price, so you don’t have to. You just tell it the symbol you’re trading and the price you want as your new take-profit.


## Function commitTrailingTake

This function lets you fine-tune your trailing take-profit levels for open trades. It's designed to automatically adjust your take-profit distance based on a percentage shift you provide, always referencing the original take-profit level you initially set. 

Think of it like this: you're constantly nudging your take-profit closer or further away from your entry price.  A negative shift brings your take-profit closer, making it more conservative; a positive shift moves it further out, making it more aggressive.

Importantly, it's smart about how it updates. It won't move your take-profit to a less favorable position – it only adjusts toward a more conservative level, preventing errors from building up over time. It also handles the differences between long and short positions correctly, ensuring take-profits are adjusted in the right direction. The function knows whether it's running in backtesting or live trading mode automatically. 

You’ll provide the trading pair's symbol, the percentage shift you want to apply, and the current market price for validation.

## Function commitTrailingStopCost

This function lets you change the trailing stop-loss for a specific trading pair to a fixed price. It’s a handy shortcut that handles some of the calculations for you – it figures out how much the stop-loss needs to shift based on the original distance set when the stop-loss was initially placed. You don't have to worry about whether you're running a backtest or a live trade, and it also automatically gets the current market price to make the adjustment accurate. To use it, you simply provide the symbol of the trading pair and the new absolute stop-loss price you want.

## Function commitTrailingStop

This function lets you fine-tune the trailing stop-loss for your trading signals. It's designed to dynamically adjust the stop-loss distance, helping you protect profits while allowing room for price fluctuations.

It's very important to understand that the adjustment is always calculated based on the initial stop-loss distance you set, not the current trailing stop-loss value. This prevents small errors from adding up over time and potentially messing up your strategy.

The `percentShift` parameter controls how much the stop-loss distance changes. A negative value brings the stop-loss closer to your entry price, tightening the protection, while a positive value moves it further away, giving the price more breathing room. The system is smart - if you try to set a less favorable stop-loss (one that protects less profit), it will ignore the change.

For long positions, the stop-loss can only be moved higher; for short positions, it can only be moved lower. This ensures the stop-loss is always working to protect your position.

Finally, the function automatically knows whether it's running in a backtest or a live trading environment, so you don’t have to worry about configuring it differently for each. You provide the trading symbol, the percentage shift you want, and the current price to evaluate against the stop-loss.

## Function commitPartialProfitCost

This function helps you automatically close a portion of your trade when you've made a profit, using a specific dollar amount. It simplifies the process by figuring out what percentage of your position that dollar amount represents. Think of it as a way to lock in some gains as your trade moves towards your take-profit target. 

The function takes the trading symbol and the dollar amount you want to close as input. It automatically determines if you’re in backtesting or live trading mode and gets the current price to ensure the price movement is in a profitable direction. This makes it easy to manage your trades and secure profits without complex calculations.

## Function commitPartialProfit

This function lets you automatically close a portion of your open trade when it's making a profit, gradually moving it closer to your target profit level. You tell it which trading pair you're working with, and what percentage of the trade you want to close – for example, you might close 25% of the position.  It's designed to work seamlessly whether you’re backtesting historical data or running a live trading strategy. The system handles the difference between those modes automatically.

## Function commitPartialLossCost

This function helps you automatically close a portion of your position when you're experiencing a loss. It lets you specify the dollar amount you want to close, and it figures out the corresponding percentage of your investment. Think of it as a way to move your stop loss closer to your entry price – it simplifies the process. The system handles the details of getting the current price and automatically works whether you're in a backtesting environment or a live trading scenario. To use it, you just need to provide the trading symbol and the dollar amount you want to close.

## Function commitPartialLoss

This function helps you automatically close a portion of your open trade when the price is moving against you, essentially heading towards your stop-loss level. It's designed to reduce potential losses by closing a specified percentage of your position. You simply tell it which trading pair you're dealing with and what percentage of the position you want to close, and it takes care of the rest, figuring out whether it's running in a simulated backtest or a live trading environment. The function will only execute if the price is trending in a direction that moves closer to your stop-loss.


## Function commitClosePending

This function lets you manually close an existing, pending trade signal without interrupting your trading strategy. Think of it as a way to cancel a planned closure. It’s useful when you want to override an automatic signal, but still want your strategy to keep running and generating new trading ideas. Importantly, using this function won’t stop your strategy from operating or trigger any stop flags. You can optionally provide a unique ID to help you track user-initiated closures. The function figures out whether it’s running in a backtest or live trading environment automatically.

## Function commitCancelScheduled

This function lets you cancel a previously scheduled trading signal within your backtest or live trading environment. Think of it as removing a planned action – it won't interrupt your strategy's ongoing operation or prevent it from generating new signals. You can optionally provide a unique ID to help you keep track of which cancellation requests you've made. Importantly, this only affects signals that were scheduled; it doesn't impact any existing open orders or the overall strategy.

## Function commitBreakeven

This function helps manage your trades by automatically adjusting your stop-loss order. It essentially moves your stop-loss to the original entry price once the price has moved favorably enough to cover any transaction costs and a small buffer for slippage. Think of it as a way to lock in profits and protect your position without constantly monitoring it. The function handles the details of determining the price threshold and retrieving the current price, making it easier to implement in your trading strategies. It works seamlessly in both backtesting and live trading environments. You just need to provide the symbol of the trading pair you're interested in.

## Function commitAverageBuy

This function helps you add a new purchase to a dollar-cost averaging (DCA) strategy. It essentially records a buy order at the current market price, keeping track of the average price you've paid for the asset. The function automatically figures out if it’s running in a backtest or live trading environment and gets the current price for you. You provide the symbol of the trading pair, and optionally a cost. After adding this buy, it updates the overall average price and signals that a new average buy has occurred.

## Function commitActivateScheduled

This function lets you manually trigger a scheduled signal before the price actually hits the specified price level. It's helpful when you want to proactively act on a signal.  Essentially, you're setting a flag that tells the strategy to activate the signal on the next price update. The system automatically figures out if it’s running a backtest or a live trading session. You provide the symbol you're trading and, optionally, a unique ID to track the activation if needed.

## Function checkCandles

The `checkCandles` function is a utility tool that makes sure your historical price data, or candles, are properly aligned with the trading intervals you've set up. It's like a quality check to ensure everything is synchronized. This function dives directly into your stored data files to verify this alignment. It doesn't rely on intermediate layers, giving it a direct and efficient way to validate your candle data. You provide it with parameters outlining what to check, and it performs the validation process.

## Function addWalkerSchema

This function lets you register a "walker," which is essentially a tool for comparing the performance of different trading strategies against each other. Think of it as setting up a system that runs several strategies on the same historical data and then analyzes how well they did, based on a metric you define. You provide a configuration object, called `walkerSchema`, to tell the system how to run the comparison. This allows for a more systematic and thorough evaluation of various trading approaches.

## Function addStrategySchema

This function lets you tell backtest-kit about a new trading strategy you've created. Think of it as registering your strategy so the framework knows how to use it. When you register a strategy, it automatically checks to make sure your signals are valid, like verifying prices, take profit/stop loss calculations, and timestamps. It also helps prevent a flood of signals and makes sure your strategy's data is safe even if there’s a problem with the system. You provide a configuration object that describes your strategy, and the framework takes care of the rest.

## Function addSizingSchema

This function lets you tell the backtest kit how to determine the size of your trades. You're essentially defining a sizing strategy – whether it’s a fixed percentage of your capital, a Kelly Criterion approach, or something based on Average True Range (ATR). 

It’s how you specify the risk you’re comfortable with, setting limits on how much of your capital you’re willing to risk per trade, and setting minimum and maximum position sizes. You can also provide a custom function to be called during the sizing calculation process for even more control. Think of it as configuring the rules for how much to buy or sell in each trade.

## Function addRiskSchema

This function lets you set up how your trading system manages risk. It’s like defining the guardrails for your strategies, ensuring you don't take on too much exposure at once.

You can specify limits on the total number of positions across all your strategies and even create more sophisticated checks, for example, monitoring portfolio metrics or correlations. 

The function registers these risk rules, allowing multiple strategies to share the same risk management system for a holistic view and to prevent exceeding defined boundaries.  This shared system keeps track of all open positions so your custom risk validations have access to the overall portfolio.

## Function addFrameSchema

This function lets you tell backtest-kit how to generate the timeframes it will use for backtesting. Think of it as registering a new way to slice up your historical data into trading periods. You'll provide a configuration object that specifies things like the start and end dates of your backtest, the interval (e.g., 1-minute, 1-day), and a function that will be called to actually create those timeframes. Essentially, it’s how you customize the granularity of your historical data for testing trading strategies.

## Function addExchangeSchema

This function lets you tell backtest-kit about a new exchange you want to use for your strategies. Think of it as registering a data source – you’re essentially saying, "Hey, I have this exchange with its own unique way of providing historical data and calculating things like VWAP."  The exchange schema you provide defines how the framework should fetch historical price data, how to format prices and quantities, and how to calculate the Volume Weighted Average Price. This allows the backtest-kit to simulate trading on that specific exchange. 


## Function addActionSchema

This function lets you tell backtest-kit about a new action you want to use. Think of actions as little helpers that respond to events happening during your backtesting, like a trade being opened or closed. You can use these actions to do things like log results, send notifications, or even trigger other systems. It’s like setting up automated responses to specific moments in your trading strategy. The `actionSchema` you provide defines how this helper works and what kind of events it should react to. Each action is created specifically for each trading strategy run, ensuring it’s always aware of the current context.
