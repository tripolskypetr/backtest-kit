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

This function lets you store data in a special memory space that’s linked to a particular trading signal. Think of it as creating a labeled note specifically for a certain signal's use. 

You provide a name for this memory bucket, a unique identifier for the memory itself, the data you want to store (which can be any object), and a description to help you remember what’s in it.

The function automatically figures out if you’re running a backtest or a live trade, so you don't have to worry about that. It uses information from the current trading environment and the signal you’re working with. 

It only saves the data if there's an active signal – if not, it'll just let you know with a warning.


## Function warmCandles

This function helps prepare your backtesting environment by pre-loading historical price data. It’s like stocking up on supplies before a long journey – it ensures that the data you need for your trading strategies is readily available and doesn't need to be downloaded during the actual backtest.  Specifically, `warmCandles` retrieves all candlestick data for a chosen time period, from a starting date to an ending date, and stores them so they can be quickly accessed later. Think of it as a warm-up routine for your backtesting engine. The `params` object dictates the timeframe and other details for this data retrieval.

## Function validate

This function is your safety net when setting up backtests or optimizations. It checks if all the components you're using – like exchanges, strategies, and sizing methods – are correctly registered and ready to go. You can tell it to check just a few specific components, or if you want a full health check, it can validate everything automatically. This process is also designed to be fast, as it remembers the results of previous checks.

## Function stopStrategy

This function lets you pause a trading strategy. It effectively tells the strategy to stop creating any new trade signals. Any existing open trades will still finish as planned, but the strategy won't initiate anything new. Whether you're running a backtest or a live trading scenario, the system will gracefully halt at a suitable moment, typically when it's idle or after a trade closes. To pause a specific strategy, you simply need to provide the trading symbol.

## Function shutdown

This function lets you safely end a backtest run. It signals to all parts of the backtest system that it's time to wrap things up and clean up any temporary files or resources. Think of it as a polite way to exit, giving everything a chance to say goodbye before the program closes. It's especially useful when you need to stop the backtest because of a signal, like if you press Ctrl+C.

## Function setLogger

You can now control how backtest-kit reports information during your backtesting runs. The `setLogger` function lets you plug in your own logging system, whether it's writing to a file, sending data to a monitoring service, or something else entirely.  When you provide a logger, any messages generated by the framework will be sent to it. Importantly, the logger will automatically receive extra details about the context of the log, such as the strategy name, exchange, and the symbol being traded, making it easier to debug and analyze your results. To use it, just pass your custom logger object that conforms to the `ILogger` interface.

## Function setConfig

This function lets you adjust how backtest-kit operates by changing its global settings. You can tweak things like data fetching or execution speed by providing a configuration object. The `config` parameter allows you to selectively override the default settings – you don't need to provide every setting, just the ones you want to change. There’s a special `_unsafe` flag, which is really only needed in testing environments because it bypasses important safety checks.

## Function setColumns

This function lets you tailor the columns displayed in your backtest reports. Think of it as customizing what information you see when reviewing your trading strategy's performance. You can adjust the default column definitions to highlight the metrics most important to you. 

The function takes a configuration object that lets you modify column settings, and it includes a safety check to ensure your changes are valid. If you're working in a testbed environment and need to bypass these checks, there's an option for that as well.

## Function searchMemory

This function helps you find relevant memory entries based on a search query. It’s designed to quickly locate information stored in your backtest or live trading environment. 

It automatically figures out whether it's running a backtest or a live trade. The function pulls the trading symbol and signal ID from the current environment. 

If there isn't a pending signal to search for, it'll let you know with a warning and won’t return any results. The search uses a sophisticated method called BM25 to rank the results and returns a list of matching memory entries, along with a score indicating how well they match your query. You can specify the "bucketName" where your memory entries are stored and the actual "query" you want to search for.

## Function removeMemory

This function helps clean up data related to your trading signals. Specifically, it deletes a "memory" entry – think of it as a temporary record – associated with a particular signal.

It figures out the symbol and signal ID automatically based on where the function is being used.

If there's no signal to remove a memory for, it will simply let you know with a warning.

The function also understands whether it’s running in a backtesting environment or a live trading situation and adapts accordingly.

To use it, you need to provide the name of the bucket where the memory is stored and the unique identifier of the memory entry you want to remove.


## Function readMemory

This function helps you retrieve data stored in memory during a backtest or live trading session. Think of it as fetching a specific piece of information that's been saved for later use. You need to tell it which memory "bucket" and unique identifier to look for. The function figures out whether it's running a backtest or live trading based on the environment it's in. If there's no active pending signal, it will let you know with a warning and won't be able to find anything.

## Function overrideWalkerSchema

This function lets you tweak an existing strategy's walker configuration—think of it as customizing how the strategy analyzes historical data for comparison. You can provide only the parts of the walker you want to change; anything you don't specify stays the same. Essentially, it’s a way to selectively adjust the walker's behavior without having to redefine the entire thing. This is helpful for experimenting with different analysis setups without a complete overhaul. The function returns a promise resolving to the modified walker schema.

## Function overrideStrategySchema

This function lets you modify an already registered trading strategy. Think of it as updating a strategy’s settings without having to redefine the whole thing. You only need to specify the parts of the strategy you want to change; everything else stays the same. It's helpful for tweaking configurations or adding new options to existing strategies. The function returns a promise that resolves to the updated strategy schema.

## Function overrideSizingSchema

This function lets you tweak existing position sizing rules within the backtest kit. Think of it as a way to make small adjustments to a sizing strategy you've already set up – you don’t need to redefine the entire thing. It allows you to change specific parts of a sizing schema, like the initial capital or the percentage of capital to use for each trade, while keeping the rest of the original configuration intact.  Essentially, you provide a snippet of updated sizing information, and it merges that with the existing sizing schema.

## Function overrideRiskSchema

This function lets you adjust an existing risk management setup within the backtest-kit. Think of it as tweaking a configuration you've already put in place – you don’t have to start from scratch. You provide a partial update, essentially just specifying the settings you want to change.  Any aspects of the risk configuration *not* included in your update will stay exactly as they were. It's a convenient way to fine-tune your risk controls without needing to redefine the entire schema.


## Function overrideFrameSchema

This function lets you adjust the settings for a specific timeframe you’re using in your backtest. Think of it as a way to tweak a timeframe's configuration *after* it's already been set up. You don’t have to redefine the entire timeframe; instead, you just provide the parts you want to change. The rest of the timeframe’s existing settings will stay exactly as they were. It’s useful for making minor adjustments to timeframes without having to rebuild everything from scratch.

## Function overrideExchangeSchema

This function lets you modify an existing exchange's data source configuration within the backtest-kit framework. Think of it as a way to tweak a registered exchange without completely replacing it. You provide a partial configuration – only the settings you want to change – and the function updates the existing exchange, leaving the rest of its settings untouched. It's useful for making adjustments to things like data endpoints or other exchange-specific parameters after the initial setup.

## Function overrideActionSchema

This function lets you tweak existing action handlers without having to completely replace them. Think of it as a way to make small adjustments to how your trading logic reacts to events. You can use it to change things like the callback functions used for different environments, or to subtly adjust how actions behave – all without needing to re-register the entire action handler. It’s a flexible way to modify your system's behavior on the fly.

Essentially, you provide a partial update – only the parts you want to change are modified, while the rest stays the same.

## Function listenWalkerProgress

This function lets you track the progress of backtest simulations as they run. It provides updates after each strategy within the simulation finishes executing. Importantly, these updates are handled one at a time, even if your tracking function needs to do some processing, ensuring things don't get messy with concurrent operations. You give it a function to be called with progress information, and it returns another function that you can use to unsubscribe from these updates later.

## Function listenWalkerOnce

This function lets you watch for changes happening within a trading simulation, but only once a specific condition is met. You provide a rule – a filter – that defines what kind of change you're interested in.  When a change matches your rule, a function you specify will run once to handle it, and then the watching stops automatically. It's great when you need to react to a particular event and then don’t need to monitor further.

Essentially, it's a convenient way to set up a temporary listener for walker events.

The `filterFn` determines which events are relevant.  The `fn` is what actually *does* something when the right event appears.

## Function listenWalkerComplete

This function lets you be notified when a backtest run, orchestrated by the Walker, finishes processing all the strategies you’ve set up. Think of it as a signal that all the testing is done.  It ensures that the notification you receive is processed one at a time, even if the code you provide to handle the notification needs to do some asynchronous work. This prevents things from getting tangled up if multiple tests complete around the same time. You give it a function that will be called when the Walker finishes, and it returns a function you can use to unsubscribe later if you need to.

## Function listenWalker

This function lets you keep an eye on how your backtesting is progressing. It provides updates after each strategy finishes running within the backtest. You’ll receive these updates as `WalkerContract` events, which you can use to monitor progress or perform actions based on the results. Importantly, these updates are handled one at a time, even if your callback function needs to do some asynchronous processing, ensuring things stay in order. Think of it as a way to get notified about each strategy's completion within your backtest execution.


## Function listenValidation

This function lets you keep an eye on potential problems during your risk validation checks. It’s like setting up an alert system; whenever a validation check fails and throws an error, this function will notify you. The errors are handled one at a time, ensuring things are processed in the order they happen, even if your notification process takes some time. You provide a function that will receive the error details whenever a validation issue arises, helping you debug and monitor your system effectively.

## Function listenSyncOnce

This function lets you temporarily tap into the signal synchronization events happening within the backtest-kit framework. It's designed to react to specific events based on your criteria, but only once. Think of it as setting up a temporary listener that runs a piece of code when a certain condition is met, then disappears. Because it's synchronous, be mindful that any asynchronous operations within your callback will pause the trading process until they finish. It’s really handy for quickly syncing your backtest with external systems or performing a one-off action based on a signal.

You provide a filter – a function that decides which signals you’re interested in. Then, you give it a callback – the code that will run exactly once when a matching signal arrives.

## Function listenSync

This function lets you keep a close eye on what's happening when your trading system is syncing signals – think of it as a way to be notified when signals are being prepared for opening or closing. It's particularly helpful if you need to coordinate with other systems or services during these processes. The cool part is that if the callback function you provide returns a promise, the trading system will pause and wait for that promise to resolve before continuing, ensuring everything stays in sync. This means your positions won't be opened or closed until your external process finishes its work.


## Function listenStrategyCommitOnce

This function lets you set up a listener that reacts to changes in your trading strategy, but only once. You provide a filter – a rule to determine which changes you're interested in – and a function to execute when a matching change happens.  Once that change is detected and your function runs, the listener automatically stops listening. It's perfect for situations where you need to respond to a single, specific event related to your strategy. Think of it like setting up a temporary alert that goes off only when a particular condition is met, then disappears afterward.

You specify what to look for using `filterFn`, and what to do when you find it using `fn`. The function returns another function which you can call to unsubscribe.

## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategies. It's like setting up a listener that will notify you whenever certain actions are taken, such as canceling a scheduled trade, closing a position for profit or loss, or adjusting stop-loss and take-profit levels. Importantly, the notifications happen in the order they occur, and any processing you do within your notification handler will be handled carefully to avoid conflicts. You provide a function that will be called whenever one of these events takes place, allowing you to react accordingly.  The function returns a way to unsubscribe from these notifications.


## Function listenSignalOnce

This function lets you set up a temporary listener for trading signals. It allows you to react to a specific condition happening in your backtest – for example, waiting for a particular signal to appear. You provide a filter to define what signals you’re interested in, and a function to execute when that signal is received. Once the signal you’re looking for appears, your function runs, and the listener automatically stops listening. It’s handy for things like triggering an action only after a certain signal has been sent.


## Function listenSignalLiveOnce

This function lets you tap into live trading signals, but only for a single event that matches your specific criteria. You provide a filter—essentially a rule—that determines which signals you want to see. Once a signal arrives that satisfies your rule, a callback function you define is executed. After that one execution, the subscription is automatically canceled, preventing further notifications. It's a clean and efficient way to react to a single, important event within a live trading environment.

## Function listenSignalLive

This function lets you tap into the live trading signals generated by backtest-kit. Think of it as setting up an observer – whenever a new trading signal comes through from a running strategy, a function you provide will be called.  It's designed for processing events that happen while a strategy is actively running, making it useful for real-time monitoring or reacting to market changes. Importantly, these signals only come from strategies executed with `Live.run()`, and they are delivered to your function in the order they are received, ensuring you don't miss anything. The function returns a function that you can call to unsubscribe from receiving these live signals.

## Function listenSignalBacktestOnce

This function lets you temporarily tap into the signals generated during a backtest run. You provide a filter – a rule to decide which signals you're interested in – and a function to execute when a matching signal arrives. The cool part is that it's a one-time deal: your function runs just once for the first matching signal, and then the subscription automatically stops. This is great for quickly inspecting specific events or performing a single action based on a signal without lingering subscriptions. It only works during a `Backtest.run()` execution.

## Function listenSignalBacktest

This function lets you tap into the stream of data generated during a backtest run. It's a way to react to what's happening as the backtest progresses, like changes in price or signals from your trading strategies. Think of it as subscribing to updates; you provide a function that gets called whenever a backtest event occurs, ensuring events are handled one at a time. This is particularly useful if you need to process these events in a specific order or perform asynchronous operations based on them. You’ll only receive data from backtests initiated using the `Backtest.run()` method.

## Function listenSignal

This function lets you tap into the trading signals generated by backtest-kit. It's like setting up an observer that gets notified whenever a strategy changes state – whether it's idle, opening a position, actively trading, or closing a position. The key thing to remember is that these notifications are handled in order, and any asynchronous operations within your callback won't interfere with the sequence. This ensures that your logic runs smoothly and consistently without unexpected race conditions. To use it, simply provide a function that will be called with the relevant event data each time a signal is emitted. When you're done listening, the function returns another function that you can call to unsubscribe.

## Function listenSchedulePingOnce

This function helps you react to specific ping events, but only once. You provide a filter to define which events you're interested in, and a function to run when a matching event occurs. After the function runs once, it automatically stops listening, so you don’t have to worry about cleaning up. Think of it as a quick way to respond to a specific event and then be done with it.


## Function listenSchedulePing

This function lets you keep an eye on scheduled signals as they wait to become active. Think of it as getting a gentle "ping" every minute while a signal is being monitored.  You provide a function that will be called with details about each ping event, letting you build custom checks or track the signal’s progress. This is useful for understanding the lifecycle of a scheduled signal and ensuring everything's running smoothly. The function returns another function you can call to stop listening to these ping events.

## Function listenRiskOnce

This function lets you set up a temporary listener for risk rejection events. You provide a filter—a way to specify exactly which events you're interested in—and a function that will be executed *only once* when a matching event occurs. After that one execution, the listener automatically stops listening, making it perfect for situations where you need to react to a specific risk condition and then move on. It's a clean way to handle one-off risk rejections without needing to manually unsubscribe.

## Function listenRisk

This function lets you monitor for situations where a trading signal is blocked because it violates risk rules. Think of it as a notification system for when your trading plan hits a safety limit.

It only alerts you when a signal *fails* the risk check – it won’t bother you with signals that are perfectly fine.

The alerts are processed one at a time, ensuring that your response isn't overwhelmed, even if the callback you provide takes some time to run. This helps to guarantee that you handle risk rejections in a controlled and orderly fashion.

You provide a function (`fn`) that gets called whenever a risk rejection occurs, and this function returns another function that you can use to unsubscribe from those notifications when you no longer need them.

## Function listenPerformance

This function lets you keep an eye on how quickly your trading strategies are running. It's like setting up a listener that gets notified whenever a performance measurement is taken during your strategy's execution. 

You provide a function (`fn`) that will be called with details about each performance event. The information includes timing metrics, allowing you to pinpoint slowdowns or areas where your strategy might be inefficient.

Importantly, these performance updates are handled in a carefully controlled way, processing them one at a time even if your callback function takes some time to complete. This prevents issues that could arise from running things concurrently. You can unsubscribe from these updates when you no longer need them; the function returns a function to do just that.

## Function listenPartialProfitAvailableOnce

This function lets you react to specific profit levels being reached in your trading strategy, but only once. You provide a filter – a set of conditions – that determines when you want to be notified. Once an event matches your filter, the provided callback function runs, and then the function automatically stops listening. Think of it as setting up a temporary alert for a particular profit target. It's handy when you need to take action based on a one-time profit condition and don’t want to continue monitoring afterward. 

It takes two things: a filter function to identify the events you're interested in, and a callback function that gets executed when a matching event occurs. The function then returns an unsubscribe function to stop listening manually.

## Function listenPartialProfitAvailable

This function lets you keep track of your trading progress as you reach certain profit milestones, like 10%, 20%, or 30% gains.  It will notify you whenever a signal hits one of these levels. Importantly, the notifications are handled in the order they arrive, and even if your callback function takes some time to process, it won’t interfere with subsequent notifications—it ensures a steady and reliable flow of information. To use it, you provide a function that will be called with details about each partial profit event. When you are done, the returned function allows you to unsubscribe from these updates.

## Function listenPartialLossAvailableOnce

This function lets you set up a listener that reacts to specific partial loss events, but only once. You provide a filter to define what kind of loss event you're interested in, and a callback function that will be executed when that event happens. Once the callback runs, the listener automatically stops, so you don't have to worry about cleaning it up. It’s helpful when you need to react to a particular loss condition just a single time.

The filter function determines which events will trigger your callback. The callback function handles the event data once it’s triggered.

## Function listenPartialLossAvailable

This function lets you keep track of how much a contract has lost in value, specifically at predefined milestones like 10%, 20%, and 30% loss. You provide a function that will be called whenever a loss level is reached.  It’s designed to handle these updates one at a time, even if your callback function takes some time to complete, ensuring things happen in the order they’re received. This avoids any issues that might arise from processing multiple loss events simultaneously. Essentially, it provides a way to react to significant loss levels in a controlled and sequential manner.

## Function listenHighestProfitOnce

This function lets you watch for specific moments when a trade reaches a certain profit level, but only want to react once. You provide a filter that defines what kind of profit event you're interested in, and a function that will run exactly one time when that event occurs. Once your function has run, the listener automatically stops, so you don't keep getting notified. 

It’s handy when you need to trigger a specific action, like closing a position or adjusting a strategy, based on a unique high-profit event.

Here's a breakdown of how it works:

*   `filterFn`: This is like a security guard - it checks if an incoming profit event matches what you're looking for.
*   `fn`: This is the action that happens *once* when the security guard lets an event pass through.

## Function listenHighestProfit

This function lets you keep an eye on when your trading strategy hits a new peak profit level. It's designed to be reliable, ensuring that your callback function, which handles those events, always runs one at a time, even if it takes some time to complete. Think of it as a way to automatically respond to profit milestones, like adjusting your strategy or taking certain actions based on how well things are going. You provide a function that will be called whenever a new highest profit is achieved, and this function will then manage the tracking for you.

## Function listenExit

This function lets you be notified when the backtest or live trading environment encounters a serious, unrecoverable error that will halt the process. Think of it as an emergency alert system for your trading framework. It's different from catching regular errors because these are critical issues that will stop the current operation.  The errors are handled one at a time, even if your error handling code takes some time to run. Using this allows you to clean up resources or log important details before the system completely shuts down. To set this up, you simply provide a function that will be executed when a fatal error occurs.

## Function listenError

This function helps you monitor and respond to errors that happen while your trading strategy is running, but aren't severe enough to stop the whole process. Think of it as a safety net that catches hiccups like failed API requests. 

It allows you to define a function that gets called whenever such an error occurs.  The errors are handled one at a time, in the order they happen, so you can be sure your error handling logic runs predictably even if those errors involve asynchronous operations. It ensures that your error handling doesn't accidentally cause more problems by running multiple things at once. You provide a function, and it returns another function that you can call to stop listening for these errors.

## Function listenDoneWalkerOnce

This function lets you react to when a background task within your backtest finishes, but only once. You provide a filter to specify which completed tasks you're interested in, and a function that will be called when a matching task is done.  Once that function runs, it automatically stops listening for further events, so you don't have to worry about manually unsubscribing. Think of it as a one-time alert for specific completion events.

## Function listenDoneWalker

This function lets you keep an eye on when background tasks within the backtest-kit framework finish running. It's particularly useful if those tasks involve asynchronous operations. When a background task is done, it will call the function you provide. 

Importantly, these completion notifications are handled one at a time, ensuring things don't get jumbled up even if your provided function needs to do some processing before acknowledging the completion. You can think of it as a way to be notified when a long-running process in your backtest finishes, guaranteeing that the notification reaches you in the right order and doesn’t interfere with other operations. The function returns an unsubscribe function that you can use to stop listening for these events when you no longer need them.

## Function listenDoneLiveOnce

This function lets you react to when a background task initiated with `Live.background()` finishes, but in a special way: it only triggers once and then automatically stops listening. You provide a filter – a function that determines which completion events you're interested in – and a callback function that will execute just one time when a matching event occurs. Think of it as setting up a temporary listener that cleans up after itself. This is useful when you only need to react to a completion event once and don’t want the listener to remain active.


## Function listenDoneLive

This function lets you keep an eye on when background tasks, started with `Live.background()`, finish running. It’s like setting up a notification system to be informed when these tasks are done.  The notifications arrive one after another, even if the notification handling itself takes some time to complete – this makes sure things happen in the right order. You provide a function that will be called whenever a background task finishes, and this function returns another function that you can use to unsubscribe from these notifications when you no longer need them.

## Function listenDoneBacktestOnce

This function lets you react to when a backtest completes, but only once and with a specific condition. You provide a filter – a way to check if the completed backtest meets certain criteria – and a function to run when a matching backtest finishes.  It’s designed for situations where you need to know about a specific backtest's completion and then don't need to listen anymore. The subscription is automatically removed after the function runs once, keeping your code clean and efficient.


## Function listenDoneBacktest

This function lets you react when a background backtest finishes running. It's a way to be notified when the calculations are complete.  The notification will happen even if your reaction involves some asynchronous work, and the order of events will be preserved – they'll be handled one after another. Think of it as setting up a listener that gets triggered when a background backtest is done, guaranteeing your response runs in the correct sequence. You provide a function that gets called upon completion, and this function returns another function which you can use to unsubscribe from the listener when you no longer need it.

## Function listenBreakevenAvailableOnce

This function lets you set up a listener that will react to specific breakeven events, but only once. You provide a filter – essentially a rule – that defines which events you're interested in. Once an event matches your filter, the provided callback function will run, and then the listener automatically stops listening. It’s perfect for situations where you need to respond to a specific breakeven condition and then don't need to worry about it anymore.

The first thing you provide is the filter itself, determining which events trigger the response. Then, you specify the function that will be executed when a matching event is detected. The listener stops immediately after executing the callback.

## Function listenBreakevenAvailable

This function lets you be notified whenever a trade's stop-loss automatically adjusts to the entry price, meaning the profit has covered the transaction costs. It's like setting up an alert that triggers when a trade reaches a point where you're no longer at risk. The notifications are handled one at a time to avoid issues if your handling code takes some time to process. You provide a function that will be called with details about the trade that triggered the breakeven event.

## Function listenBacktestProgress

This function lets you keep an eye on how a backtest is progressing. It's like setting up a listener that gets notified as the backtest runs in the background. The updates you receive will be in the order they happened, and even if your notification function takes some time to process, the updates will still be handled one at a time to avoid any issues. You provide a function that will be called with information about the backtest's current state, and this function returns another function that you can call to stop listening for those updates.

## Function listenActivePingOnce

This function lets you react to specific active ping events, but only once. You provide a filter to define which events you're interested in, and a callback function that will be executed when a matching event occurs. After the callback runs, the function automatically stops listening, which is helpful when you need to respond to something just one time and then move on. Think of it as a temporary listener that handles a single event and then disappears.

## Function listenActivePing

This function lets you keep an eye on active trading signals within the backtest-kit framework. It's designed to notify you whenever a signal becomes active or changes status, sending updates roughly every minute. The updates are delivered in the order they happen, and the system makes sure your code handles them one at a time, even if your response involves asynchronous operations. You provide a function that gets called whenever a new ping event occurs, allowing you to build logic that reacts to these signal lifecycle changes.

## Function listWalkerSchema

This function provides a way to see all the different trading strategies (walkers) that are currently set up within the backtest-kit framework. Think of it as a tool to inspect what's happening behind the scenes – it returns a list describing each strategy, which can be really handy for understanding your system or for creating tools that automatically display information about your trading configurations. It’s like getting a peek under the hood to see all the potential trading approaches you've incorporated. This is especially helpful if you’ve added custom trading strategies.


## Function listStrategySchema

This function lets you see all the trading strategies your backtest kit is currently set up to use. It's like a directory listing for your strategies, providing a simple way to check what's been registered. This is really helpful if you're trying to figure out what strategies are available, building a tool to display them, or just making sure everything's configured correctly. The function returns a list of strategy schemas, which contain information about each strategy.


## Function listSizingSchema

This function helps you see all the sizing strategies that have been set up in your backtest. Think of it as a way to list all the different methods your framework is using to determine how much to trade. It's really handy if you’re trying to understand your setup, build tools that automatically display these strategies, or simply check that everything is configured correctly. The function returns a list of sizing schema objects, providing a comprehensive overview of your trading size configurations.

## Function listRiskSchema

This function lets you see all the risk schemas that have been set up in your backtest. Think of it as a way to get a complete overview of how your risk management is configured. It's helpful for checking your work, creating documentation, or building user interfaces that need to understand these risk settings. The function returns a list of these risk schemas, allowing you to easily access and work with them programmatically.

## Function listMemory

This function helps you see what data is stored for a particular signal. It's like looking through a log of past events related to your trading strategy.

It automatically figures out whether you're running a test or a live trade.

The function takes a `dto` object which tells it which storage bucket to look into.

If there's no active signal to examine, it will let you know with a warning, but still give you an empty list – nothing to see there! It returns a list of memory entries, each showing a unique ID and the associated content.


## Function listFrameSchema

This function lets you see all the different types of data structures (called "frames") that your backtesting system is using. Think of it as a way to get a complete inventory of the data formats you've set up. It’s helpful if you're trying to understand how your backtest is organized, create tools to manage your frames, or simply check that everything is configured correctly. The function returns a list of these frame definitions, which you can then examine.

## Function listExchangeSchema

This function lets you see all the different exchanges that your backtest-kit setup is aware of. It fetches a list of exchange schemas, which describes how the framework understands and interacts with those exchanges. Think of it as a way to check which data sources you've connected and how they're configured.  You can use this information to help troubleshoot problems, generate documentation, or build user interfaces that adapt to the exchanges you're using. The function returns a promise that resolves to an array of these exchange schema objects.

## Function hasTradeContext

This function simply tells you whether you're in a state where you can actually execute trading actions. It verifies that both the execution and method contexts are currently running. Think of it as a check to make sure everything is set up correctly before you try to fetch data or perform calculations related to a trade. If it returns true, you're good to go and can safely use functions like `getCandles` or `formatPrice`.

## Function hasNoScheduledSignal

This function checks if there's currently no scheduled trading signal for a specific trading pair, like BTC-USDT. It's basically the opposite of checking for an existing signal – use it to make sure your system doesn't try to generate signals when it shouldn't. The function knows whether it's running in a backtesting environment or live trading mode without you needing to specify it. You just give it the symbol of the trading pair you're interested in, and it will tell you true or false based on whether a scheduled signal exists.

## Function hasNoPendingSignal

This function helps you check if there's an existing signal waiting to be triggered for a specific trading pair. It's the opposite of `hasPendingSignal`, so you can use it to make sure you're not accidentally creating new signals when one is already in place. The function figures out whether you're running a backtest or a live trading session without you needing to specify it. You simply pass in the symbol of the trading pair you're interested in, and it will tell you whether or not a pending signal exists for it.

## Function getWalkerSchema

This function lets you find out the structure and expected inputs for a specific trading strategy, also known as a "walker," within the backtest-kit framework. Think of it like looking up a blueprint for a particular strategy.  You give it the name of the strategy you’re interested in, and it returns a description of what data it needs and how it’s organized. This is handy for understanding how a walker works and ensuring you're providing it the right information.


## Function getTotalPercentClosed

This function helps you understand how much of a trading position is still open. It tells you the percentage of the original position that hasn’t been closed, which is useful for tracking your progress during a trade. A value of 100 means you haven't closed any part of your position, while 0 means it's completely closed. The calculation is smart enough to handle situations where you've added to the position using dollar-cost averaging (DCA) while also closing it in smaller amounts. It works whether you're backtesting or trading live, automatically adjusting to the current environment. To use it, just provide the trading pair symbol.

## Function getTotalCostClosed

This function helps you figure out the total cost of your current holdings for a specific trading pair. It's especially useful if you've been buying into a position gradually, like with dollar-cost averaging, and then closing parts of it off. The function takes the symbol of the trading pair as input, like "BTC-USDT," and it will tell you the total cost basis in dollars. It smartly adapts to whether you're running a backtest or live trading, so you don't need to worry about that.

## Function getTimestamp

This function, `getTimestamp`, gives you the current time. It’s a handy way to know what time it is within your trading strategy. When you're testing your strategy against historical data (backtesting), it returns the timestamp associated with the specific timeframe being analyzed. But when you're actually trading live, it provides the real-time current timestamp.

## Function getSymbol

This function retrieves the symbol you're currently trading, like "BTCUSDT" or "ETHUSD." Think of it as asking the backtest environment, "What asset are we working with right now?". It returns a promise that resolves to a string representing the trading symbol. You'll use this to ensure your strategies are operating on the correct asset.

## Function getStrategySchema

This function helps you understand the structure of a trading strategy defined within the backtest-kit framework. When you provide the name of a strategy, it returns a detailed blueprint outlining the expected inputs, outputs, and overall design of that strategy. Think of it as a way to inspect what a strategy is supposed to look like before you actually use it. The name you provide must match the registered strategy identifier.

## Function getSizingSchema

This function helps you access pre-defined strategies for determining how much of your capital to use for each trade. Think of it as looking up a specific recipe for sizing your positions. You provide a name, which acts like an ID, and it returns a set of rules and guidelines that dictate how much to trade. It's a straightforward way to use established sizing approaches within your backtesting framework.

## Function getScheduledSignal

This function helps you retrieve the signal that's been pre-programmed to execute at a specific time for a given trading pair. Think of it as checking what the strategy is supposed to do next based on a schedule. If no such signal is scheduled, it won't return anything, essentially telling you nothing is currently scheduled.  It cleverly figures out whether you're running a backtest or a live trading session without you needing to specify. You just need to tell it which trading pair you’re interested in, like "BTCUSDT".


## Function getRiskSchema

This function lets you fetch the details of a specific risk measurement that's already been set up in your backtest. Think of it as looking up the blueprint for how a certain risk is calculated. You provide the name of the risk you’re interested in, and it gives you back the configuration details – the schema – that defines it. This schema outlines things like the inputs the risk calculation uses and what kind of output to expect. It’s useful when you need to understand or programmatically work with how risk is being assessed within your backtesting environment.


## Function getRawCandles

The `getRawCandles` function is your go-to tool for retrieving historical candlestick data. It’s designed to be flexible, allowing you to specify exactly which candles you need based on symbol, time interval, and date ranges.  You can request a specific number of candles, define a start and end date, or combine these options to narrow down your search.  Importantly, this function is built to avoid any look-ahead bias, ensuring that your backtesting results are reliable.

Here’s a breakdown of how you can use the date parameters:

*   You can provide both a start and end date along with a limit for a precise request.
*   If you only provide a start and end date, the function will automatically calculate the number of candles needed.
*   Supplying an end date and a limit will automatically determine the start date.
*   Specifying a start date and limit fetches candles moving forward from that start date.
*   If you just give a limit, the function will look backward from the current execution timestamp to get that many candles.

The function accepts the trading symbol (like "BTCUSDT"), the candle interval (options include "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", and "8h"), and optional start and end dates in milliseconds.  It returns a promise that resolves to an array of candlestick data.

## Function getPositionPnlPercent

This function helps you understand how much profit or loss you're currently experiencing on a trade that's still open. It calculates the unrealized percentage profit and loss, taking into account things like partial order fills, dollar-cost averaging, potential slippage when executing trades, and any associated fees. 

If you don't have any active trades, it will return null. The function automatically figures out whether you're in a backtesting or live trading environment and gets the latest price for the asset you're trading to make the calculation. You simply provide the trading pair symbol, like "BTCUSDT", and it will do the rest.


## Function getPositionPnlCost

This function helps you understand how much profit or loss you're currently holding on a trade. It calculates the unrealized profit and loss in dollars for a specific trading pair, taking into account things like partial trades, average cost per share, and even slippage and fees. If there isn't an active trade currently being managed, the function will return null. It figures out whether you’re running a backtest or a live trade on its own and automatically gets the current market price for you. You just need to provide the trading pair symbol, like "BTC-USDT", to get the information.

## Function getPositionPartials

This function lets you peek into the history of partial closes – those smaller adjustments you make to your position to lock in profits or limit losses. It retrieves a list of these partial close events for a specific trading pair. 

If you haven't executed any partial closes yet, you'll get an empty list back.  If no signal is currently active, the function will return null.

Each recorded partial close includes details like whether it was a profit or loss close, the percentage of the position it covered, the price used for the close, the cost basis at that time, and how many previous entry prices were included in that partial. This gives you a clear view of how your strategy is managing your position incrementally. You need to provide the trading pair symbol to get the data.

## Function getPositionPartialOverlap

This function helps you avoid accidentally closing parts of your positions multiple times at very similar price levels. It checks if the current market price is close enough to any previously executed partial close prices.

Essentially, it’s a safety net to make sure you're not triggering multiple partial closes when the price is hovering around the same area. 

You give it the trading symbol and the current price, and optionally a configuration for the tolerance zone (how close is "close enough"). It will return true if the current price falls within the allowed range of an existing partial close, and false otherwise. If you haven’t executed any partial closes yet, it will also return false.


## Function getPositionLevels

This function helps you understand the pricing history for a trade you’re planning. It gives you a list of prices used for a dollar-cost averaging (DCA) strategy, showing the original entry price and any subsequent prices added when you bought more of the asset. If there's no active trade plan, it won't return anything. If you started a trade but haven’t added any more purchases, you’ll see just the initial entry price listed. You tell the function which asset (like BTC/USDT) you’re interested in to get this information.

## Function getPositionInvestedCount

This function lets you check how many DCA (Dollar Cost Averaging) steps have been taken for a particular trading pair. It essentially tells you how many times the system has bought more of an asset after an initial purchase.

A result of 1 means it's the original buy order, while a higher number indicates subsequent DCA buys. 

If there's no active trading signal currently, the function will return null. 

The function handles whether you're running a backtest or live trading automatically. You just need to provide the trading pair's symbol to get the count.

## Function getPositionInvestedCost

This function helps you figure out how much money you’ve put into a trade for a specific symbol. It calculates the total cost of buying into the position, considering all the individual buy orders and their associated costs. 

Essentially, it adds up the costs of each buy transaction. 

If there isn't a trade currently in progress, the function will let you know by returning null. It automatically understands whether it's running in a backtesting environment or a live trading scenario. To use it, you just need to provide the symbol of the trading pair you're interested in.

## Function getPositionHighestProfitTimestamp

This function helps you figure out exactly when a specific trading position reached its peak profit. It looks at the history of that position and tells you the timestamp – essentially, the date and time – when the price was at its most favorable point. If there's no record of a signal for that trading pair, the function won't return anything. You give it the symbol of the trading pair you’re interested in, like 'BTCUSDT', and it returns a number representing that timestamp.

## Function getPositionHighestProfitPrice

This function helps you understand the peak profit your current trade has achieved. It tells you the highest price a long position has reached above its entry price, or the lowest price a short position has dropped to below its entry price, since the trade began. Think of it as a record of how far in the money your trade has gotten. It starts by remembering the initial entry price and timestamp when the position opens, then updates this record with each price movement, ensuring you always have a sense of the potential profit realized. You’ll get a number representing that highest profit price, and it will always be available as long as the position is active.

## Function getPositionHighestProfitBreakeven

This function helps you determine if a trade was potentially profitable enough to reach a breakeven point at its peak. It checks for a specific trading pair, like BTCUSDT, and figures out if it was mathematically possible for the trade to break even at the highest price it reached. If there isn't a current trading signal for that symbol, the function won't return a value. Essentially, it's a way to analyze past trades and see if they had the potential for a clean break even at their best point.


## Function getPositionHighestPnlPercentage

This function helps you understand the performance of a specific trading position. It calculates the highest percentage profit achieved by that position at any point during its active timeframe. You provide the symbol of the trading pair, like 'BTCUSDT', and it returns a number representing that peak profit percentage. If there’s no data available for the position, it will return null. Essentially, it's a way to see the best-case scenario for a position's profit.

## Function getPositionHighestPnlCost

This function helps you understand the cost associated with achieving the highest profit for a specific trading pair. It calculates the PnL cost—essentially, what it took to reach that peak profit—and provides it as a number, expressed in the quote currency. If there's no signal currently waiting, the function will return null, indicating that no peak profit has been established yet. To use it, you simply need to provide the trading pair symbol you're interested in.

## Function getPositionEstimateMinutes

This function helps you understand how long a trade might last. It looks at the current, pending trading signal and tells you the originally estimated duration in minutes. Think of it as checking the planned lifespan of a trade before it actually begins.

If there isn't a pending signal ready to be executed, the function will return null. You provide the trading symbol, like 'BTC/USDT', to specify which trade you're interested in.

## Function getPositionEntryOverlap

This function helps you avoid accidentally making multiple DCA entries at roughly the same price. It checks if the current market price is close enough to any of your existing DCA entry levels, considering a small tolerance range around each level. 

You provide the trading symbol and the current price, and optionally a custom tolerance range. 

The function will return true if the current price falls within that tolerance of an existing entry level, meaning you should probably hold off on another entry. If there are no existing entry levels, it will return false. This prevents you from accidentally spamming orders in a tight price range.

## Function getPositionEntries

This function lets you see how a position was built up, whether it was a single trade or a series of DCA buys. It gives you a list of each individual purchase made for the current signal, showing the price it was bought at and how much money was spent on that specific buy. 

If there's no active signal to analyze, the function will return nothing. If the position was just one initial trade without any DCA, you'll get a list containing just that one entry. You need to provide the trading pair symbol, like "BTCUSDT," to get the entry details for that specific asset.

## Function getPositionEffectivePrice

This function helps you figure out the average price you've paid for a position in a trading pair. It's like calculating your own personal DCA (Dollar-Cost Averaging) price. 

It takes the symbol of the trading pair (like BTC-USDT) as input and returns a number representing that effective price. If there's no active position, it will return null.

The calculation considers any partial closes you've made and blends them with any direct DCA entries, providing a more accurate view of your cost basis. When you didn’t use DCA, it just returns the original opening price. It automatically knows whether it's running in a backtest or a live trading environment.

## Function getPositionDrawdownMinutes

This function helps you understand how long a trade has been losing value since its best moment. It calculates the time, in minutes, since the price reached its highest point for that particular trading pair. Think of it as a way to see how far a position has fallen from its peak. If the price is still at its highest, the value will be zero, but it will increase as the price drops. If there's no active trade happening, the function will return nothing. You provide the trading symbol – like 'BTCUSDT' – to specify which trade you're interested in.

## Function getPositionCountdownMinutes

This function tells you how much time is left before a trading position expires. It calculates this by looking at when the position was initially flagged and comparing it to an estimated expiration time. 

The result is always a positive number representing minutes; if the expiration time has already passed, it returns zero. 

If there’s no pending signal related to the position, the function will return null. You need to provide the symbol of the trading pair (like BTC-USDT) to get the countdown.

## Function getPendingSignal

This function lets you check if your trading strategy currently has a pending order waiting to be filled. It takes the trading symbol, like "BTCUSDT," as input. It will then search for any pending signal associated with that symbol. If a pending signal is found, it returns detailed information about it.  If there's no pending order, it will return nothing, indicating that there's no signal currently waiting. The function handles whether you're in a backtesting environment or live trading automatically.

## Function getOrderBook

This function lets you retrieve the order book for a specific trading pair, like BTCUSDT. It pulls the data directly from the exchange you're connected to. 

You can optionally specify how many levels of the order book you want to see; if you don't provide a depth, it will use a default value. 

The function handles the timing details automatically, adjusting how it uses the timestamp based on whether you're backtesting or trading live.

## Function getNextCandles

This function helps you get a batch of future candles for a specific trading pair and timeframe. Think of it as a way to peek ahead and grab the next few candles that will be available, based on where the backtest is currently at in time. You tell it which symbol you're interested in (like BTCUSDT), the interval you want the candles in (like 1-minute candles), and how many candles you want it to retrieve. It then uses the underlying exchange connection to fetch those candles, making sure they represent candles that come *after* the current simulation point.

## Function getMode

This function simply tells you whether the backtest-kit is currently running a simulation (backtest mode) or connected to a live trading environment. It returns a promise that resolves to either "backtest" or "live", allowing your code to adapt its behavior depending on the operational context. Essentially, it's a quick way to check if you're testing strategies or actively trading.

## Function getFrameSchema

This function lets you find out the structure of a specific trading frame that's been set up within the backtest-kit system. Think of it as looking up the blueprint for how a particular frame operates. You provide the name of the frame you're interested in, and it returns a detailed description of its expected data and properties. This is helpful if you want to understand what information a frame uses or needs to function correctly. 


## Function getExchangeSchema

This function lets you grab the details of a specific exchange that backtest-kit knows about. Think of it like looking up the blueprint for how a particular exchange works – things like what trading pairs it offers and how order books are structured. You simply provide the name of the exchange you're interested in, and it returns a structured object containing all the relevant information. This is helpful for understanding the data backtest-kit uses and customizing strategies to work with different exchanges.


## Function getDefaultConfig

This function provides a starting point for setting up your backtesting environment. It gives you a set of predefined values for various settings, such as candle fetching behavior, signal generation limits, and reporting parameters. Think of it as a template – you can use it to understand all the configuration options and then customize them to fit your specific backtesting needs.  It’s a great way to see what's possible and avoid having to guess at what settings are available. The returned configuration is read-only, so you can't directly modify it – you need to create a copy if you want to make changes.

## Function getDefaultColumns

This function provides a handy way to see the standard column setup used for generating reports within the backtest-kit framework. It gives you a look at the default columns for things like closed trades, heatmaps, live data, partial fills, breakeven points, performance metrics, risk management, scheduling, strategy events, synchronization, highest profit events, walker signals, and overall strategy results. Think of it as a reference guide showing you exactly what columns are available and how they're initially configured, which can be really useful when you’re customizing your reporting.

## Function getDate

This function lets you grab the current date within your trading strategy. It's really useful for time-based decisions. When you're running a backtest, it gives you the date associated with the specific historical timeframe you're analyzing. If you're live trading, it provides the actual, current date.

## Function getContext

This function lets you access details about the current process running within the backtest-kit framework. Think of it as a way to peek under the hood and understand the environment your code is operating in. It returns a context object containing information that can be useful for debugging or adapting your strategy's behavior. You can use this to see things like the current method being executed and other relevant data.


## Function getConfig

This function lets you peek at the settings that control how backtest-kit operates. It provides a snapshot of all the configuration values, like how many candles to fetch, retry delays, maximum signal lifespans, and limits on report display rows. Think of it as a read-only view into the system's internal settings, ensuring you don't accidentally change anything while you're looking. It’s useful for understanding the current behavior or debugging.


## Function getColumns

This function lets you peek at the setup for your backtest reports. It gives you a snapshot of how columns are defined for different parts of the report, like closed trades, heatmaps, live data, and more. Think of it as getting a look at the blueprint for your report's layout, ensuring you can examine the structure without changing it. This is useful when you need to understand what data is being displayed and how.

## Function getCandles

This function lets you retrieve historical price data, also known as candles, for a specific trading pair like BTCUSDT. You tell it which trading pair you're interested in, how frequently the data should be grouped (like every minute, every hour, etc.), and how many data points you want to receive. It pulls this data directly from the exchange you’re connected to, looking backward from the current time. The returned data is an array of candle objects, each containing open, high, low, close prices, and the timestamp.

## Function getBreakeven

This function helps you determine if a trade has become profitable enough to cover the costs involved. It calculates a breakeven point based on factors like slippage and fees, and then checks if the current price has exceeded that point. You provide the trading symbol and the current price, and the function tells you whether the trade is past its breakeven threshold. It automatically adapts to whether you're running a backtest or a live trade.

## Function getBacktestTimeframe

This function lets you find out the time period used for a backtest of a specific trading pair, like BTCUSDT. It returns a list of dates that define the backtest window. Essentially, it tells you the start and end dates for the historical data being used in the backtest. You provide the symbol of the trading pair you're interested in, and it gives you back the dates associated with its backtest.

## Function getAveragePrice

The `getAveragePrice` function helps you determine the Volume Weighted Average Price, or VWAP, for a specific trading pair. It looks at the recent trading activity, specifically the last five one-minute candles, to calculate this value.  The VWAP is figured out by considering the typical price of each candle (based on its high, low, and close values) and weighting it by the volume traded at that price. If there’s no trading volume available, it falls back to calculating a simple average of the closing prices. You just need to provide the symbol of the trading pair, like "BTCUSDT," to get the VWAP.

## Function getAggregatedTrades

This function lets you retrieve a history of combined trades for a specific trading pair, like BTCUSDT. It pulls this data directly from the exchange the backtest kit is connected to.

You can request all trades within a certain timeframe, or specify a `limit` to retrieve just the most recent trades. If you don't provide a `limit`, it will grab trades from a defined window of time. The function returns an array containing details about each aggregated trade.

## Function getActionSchema

This function helps you find the blueprint for a specific trading action within the backtest-kit framework. Think of it like looking up the details of a particular order type or a custom signal. You give it the name of the action you're interested in, and it returns a structured description of what that action involves – things like the expected inputs and any validation rules. It's useful when you need to understand or programmatically work with different actions.


## Function formatQuantity

This function helps you prepare quantity values for trading, ensuring they match the specific formatting rules of the exchange you're using. It takes a trading symbol like "BTCUSDT" and a raw quantity number, then converts the quantity into a string that's properly formatted for that exchange. This ensures your order submissions are valid and avoids issues caused by incorrect decimal places. Essentially, it handles the nuances of how different exchanges represent quantity values.

## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a symbol like "BTCUSDT" and a raw price value, then formats it to match the specific rules of that exchange, ensuring the right number of decimal places are shown. Think of it as automatically handling the price formatting details so you don't have to. This makes sure your displayed prices look professional and accurate.


## Function dumpText

The `dumpText` function lets you save raw text data, like logs or reports, associated with a specific trading signal. It automatically figures out which signal it belongs to, making it easy to organize your data. If there isn't a signal currently being processed, it'll just let you know with a warning instead of trying to save anything.  You provide the data as a single object containing the bucket name, a unique identifier for the data, the actual text content, and a description for what the text represents.

## Function dumpTable

This function helps you display data in a structured, table-like format within your backtesting environment. It takes an array of objects, each representing a row of data, and neatly presents them.

Crucially, it automatically figures out the column headers by looking at all the different keys used across all the objects in your data. 

The function is designed to be linked to a specific trading signal, pulling information from the most recently active signal. If no signal is active, it will let you know with a warning message and won't display anything. You provide the bucket name, a unique identifier for the data, the actual data as an array of objects, and a description to help you understand what the table represents.


## Function dumpRecord

This function helps you save data snapshots—think of them as records—to a specific storage bucket. It's designed to capture the state of your trading system at a particular moment, associating that record with a unique identifier and a descriptive label. The function automatically figures out which signal the record belongs to, but it will only work if a signal is currently being processed. If no signal is active, you'll see a warning message, and the function won't save anything. You provide the bucket name, a unique dump ID, the data you want to save (as a simple key-value collection), and a short explanation of what the record represents.

## Function dumpJson

The `dumpJson` function helps you save complex data structures as neatly formatted JSON files, automatically associating them with a specific trading signal. Think of it as a way to record snapshots of your trading state – like variable values or calculated metrics – for later analysis or debugging.  It automatically figures out which trading signal the data belongs to, so you don't have to manually specify it. If there isn’t an active trading signal, it will just let you know by logging a warning, instead of trying to save the data. This function takes a data transfer object containing the bucket name, a unique identifier for the dump, the JSON data itself, and a description to help you remember what the data represents.

## Function dumpError

The `dumpError` function helps you record error details related to specific trading signals. It essentially allows you to attach an error message to a particular signal's history, providing context for later analysis or debugging. The function automatically identifies the signal it's associated with, so you don't have to manually specify it. If there's no signal actively being processed, it will simply warn you and not perform any action. You provide a description of the error, a unique identifier for the dump, and the error content itself to be stored.

## Function dumpAgentAnswer

This function helps you save a complete record of an agent's conversation, linking it to a specific trading signal. It takes all the messages exchanged with the agent, along with a description, and stores them in a designated bucket. The function automatically figures out which signal the conversation relates to, making it easy to keep track of agent interactions during trading. If there isn't a signal to associate the conversation with, you'll see a warning, and the data won't be saved.

The `dto` parameter contains all the information needed for the dump, including the bucket name, a unique ID for the dump, the actual messages, and a brief description.


## Function commitTrailingTakeCost

This function lets you set a specific take-profit price for a trade. It's designed to be easy to use because it handles some of the underlying complexities for you. Essentially, you provide the symbol you're trading and the desired take-profit price, and the function will automatically calculate how much to adjust the trailing take-profit to reach that level, referencing the original take-profit distance. It also takes care of figuring out whether you're running a backtest or a live trade, and it gets the current market price to ensure the adjustment is accurate.


## Function commitTrailingTake

This function lets you fine-tune your trailing take-profit levels for open trades. It's designed to adjust the distance of your take-profit order based on a percentage change relative to the initial take-profit you set.

Think of it as a way to automatically move your profit target as the price moves in your favor.

It's important to understand that the adjustment is always calculated from the *original* take-profit distance, not the current trailing take-profit level. This helps prevent small errors from building up over time.

The function ensures that your trailing take-profit only becomes more conservative – it won't make it more aggressive. For long positions, it will only lower the take-profit; for short positions, it will only raise it.

Finally, the function figures out whether it's running in a backtesting environment or a live trading environment automatically.

You'll need to provide the symbol of the trading pair, the percentage shift you want to apply, and the current market price.

## Function commitTrailingStopCost

This function lets you change the trailing stop-loss price to a specific level you choose. Think of it as setting a fixed target for your stop-loss. It simplifies the process by figuring out the percentage shift needed from the original stop-loss distance, and it handles getting the current price automatically. You don't need to worry about whether you're in a backtesting or live trading environment – it adapts automatically. Essentially, it’s a convenient way to move your trailing stop to a defined price point.

The function requires you to provide the trading symbol and the new stop-loss price you want to set. It then returns a boolean value indicating whether the change was successful.

## Function commitTrailingStop

This function lets you fine-tune the trailing stop-loss for a pending trade. It's designed to automatically adjust your stop-loss distance based on price movements, helping protect your profits.

A key thing to remember is that it calculates adjustments based on the *original* stop-loss level you set, not the current trailing stop-loss. This prevents small errors from adding up over time.

When you adjust the percentage, larger changes take priority—the new stop-loss will only move in a direction that provides better protection.

If you’re long, the stop-loss will only move higher, and if you’re short, it will only move lower, always favoring a stop-loss that's closer to your entry price for increased protection.

The function handles whether you're in backtest or live trading mode automatically, so you don’t need to worry about that. You just provide the symbol, the percentage adjustment you want to make, and the current price.

## Function commitPartialProfitCost

This function lets you partially close a trade when you've reached a certain profit level, specified as a dollar amount. It’s a simple way to lock in some gains as your trade moves toward its target profit. The function automatically figures out how much of your position to close based on the dollar amount you provide, and it handles getting the current price for you. It works whether you're backtesting or live trading, and it only works if the price is moving in a profitable direction. You just need to tell it which trading pair you're working with and how much in dollar value you want to close.

## Function commitPartialProfit

This function lets you automatically close a portion of your trading position when it's in profit, helping you lock in gains. It's designed to be flexible, working whether you're testing strategies in backtesting mode or running live trades. To use it, you simply specify the trading symbol and the percentage of your position you want to close – for example, closing 25% of your open position. The function will only execute if the price is moving in the direction of your take-profit target, ensuring you're truly capturing profits.


## Function commitPartialLossCost

This function lets you automatically close a portion of your position to limit losses, using a specific dollar amount. It's a simpler way to manage partial closes because it calculates the necessary percentage of your position based on the dollar amount you specify. The system will automatically determine if it’s running in a backtest or live trading environment, and will also get the current price for you. You just need to tell it which trading pair you want to adjust and how much in dollar terms you want to close. Essentially, it helps you move towards your stop-loss target with a specific dollar loss.


## Function commitPartialLoss

This function helps you automatically close a portion of your open trade when the price is moving in a direction that would trigger your stop-loss. It lets you close, for example, 50% of your position. The `symbol` parameter specifies which trading pair you're working with, and `percentToClose` tells the function what percentage of the position you want to close. It's designed to work seamlessly whether you're testing strategies in a backtest or executing live trades, handling the mode automatically.

## Function commitClosePending

This function lets you finalize a pending closing order for a trade without interrupting your strategy's normal operation. Think of it as confirming a closing signal that was already in place. It's useful when you want to manually close a position, but still keep your trading strategy running and generating new signals. Importantly, this action doesn't pause your strategy or set any stop flags, so it can continue its work as usual. You can optionally provide a close ID to help you track user-initiated closures. The framework automatically handles whether it's running in a backtest or live environment.

## Function commitCancelScheduled

This function lets you cancel a previously scheduled trading signal within your backtest or live trading environment. Think of it as removing a pending order from the queue – it's like hitting the brakes on a future action. Importantly, this doesn’t interrupt your trading strategy; it continues running as normal and can still generate new signals. You can optionally provide a unique ID to help you track which cancellation was initiated by you. It works seamlessly whether you're testing your strategy historically or running it live.

## Function commitBreakeven

This function helps you manage your risk by automatically adjusting your stop-loss order. It essentially moves your stop-loss to the entry price – essentially a zero-risk position – once the price has moved favorably enough to cover the costs of the trade, like slippage and fees. 

Think of it as a safety net that locks in profits once a trade has gone your way sufficiently. The function automatically determines the price threshold for this adjustment based on predefined parameters, and it works equally well in backtesting and live trading environments. It also handles retrieving the current price to make the calculations. You only need to provide the trading symbol to use it.

## Function commitAverageBuy

This function lets you add to a position using a dollar-cost averaging (DCA) approach. It essentially places another buy order, calculating the average price based on all previous entries. 

You provide the trading symbol, and optionally a cost, and it handles the rest – automatically getting the current price and updating the overall average entry price for the position. A signal is emitted to notify other parts of the system that a new average buy has been committed. It intelligently adapts to whether it's running in a backtesting or live trading environment.

## Function commitActivateScheduled

This function lets you trigger a scheduled signal to activate before the price actually hits the target price you initially set. It's useful if you want to manually control when a signal goes off.

You provide the symbol of the trading pair, and optionally, an ID to help you track when you manually activated the signal. The framework automatically handles whether you're in a backtesting or live trading environment. The activation itself doesn't happen immediately; it's processed during the next tick of the backtest.


## Function checkCandles

The `checkCandles` function is designed to make sure your historical price data, or "candles," are properly aligned with the time intervals you're using for trading. It's a behind-the-scenes check that verifies the consistency of your data.

This function dives deep, directly reading data from where it’s stored to do this verification. It's a useful tool for ensuring the reliability of your backtesting and trading systems. You provide it with some parameters to guide the check, and it will confirm that everything lines up as expected.

## Function addWalkerSchema

This function lets you register a custom "walker" to use with backtest-kit. Think of a walker as a specialized process that runs backtests for several strategies simultaneously, allowing you to easily compare their results against each other. You provide a configuration object, called `walkerSchema`, which tells backtest-kit how to execute and analyze these simultaneous backtests. It's particularly useful when you want to evaluate different strategies on the same dataset and measure their performance using a consistent metric.

## Function addStrategySchema

This function lets you tell backtest-kit about a new trading strategy you've created. Think of it as registering your strategy so the framework knows how to use it. When you register a strategy, backtest-kit will check to make sure everything is set up correctly, like the prices and the logic for take profit and stop loss orders. It also helps to prevent signals from being sent too frequently and ensures that your strategy’s data is safely stored even if there's a problem during live trading. You provide a configuration object describing your strategy, and the framework takes care of the rest.

## Function addSizingSchema

This function lets you tell the backtest framework how to determine the size of your trades. Think of it as setting up the rules for how much capital you'll allocate to each position. You provide a configuration object that outlines things like your risk tolerance, the sizing method you prefer (like fixed percentage, Kelly Criterion, or ATR-based), and any limits you want to place on position sizes. By registering this sizing schema, the framework will use these rules during the backtest to calculate appropriate position sizes.

## Function addRiskSchema

This function lets you define how your trading system manages risk. Think of it as setting up the guardrails for your strategies. You can specify limits on how many positions can be open at once, and even create custom checks to ensure your portfolio stays healthy and balanced, considering things like correlations between assets. The cool part is that multiple trading strategies can share the same risk management rules, allowing for a broader view of overall portfolio risk and providing a centralized way to control potential issues.

## Function addFrameSchema

This function lets you tell backtest-kit about a new timeframe you want to use for your simulations. Think of it as registering a way to create the historical data your backtesting strategy will operate on.  You'll provide a configuration object that specifies things like the start and end dates of your backtest, the frequency of the data (e.g., daily, hourly), and a function that actually generates those timeframes.  Essentially, it's how you customize the data source for your backtesting.

## Function addExchangeSchema

This function lets you tell backtest-kit about a new exchange you want to use for your backtesting. Think of it as registering a data source – it provides the framework with information about where to get historical price data, how to format prices and quantities, and how to calculate things like VWAP (volume-weighted average price) based on recent trading activity. You provide a configuration object, `exchangeSchema`, that defines all these details for the specific exchange you're using. Essentially, it’s a key step in setting up backtest-kit to access and use data from a particular trading platform.

## Function addActionSchema

This function lets you tell the backtest-kit framework about a custom action you want to perform during a backtest. Think of actions as triggers – they allow you to automatically do things like send notifications, log events, or update external systems whenever specific events happen in your strategy, such as a signal being generated or a trade reaching a profit target. You define these actions through configuration objects, and this function registers them so the framework knows when and how to execute them. Each action is tied to a specific strategy and timeframe, ensuring it receives the right context for its task.
