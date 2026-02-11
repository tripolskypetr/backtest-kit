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

The `warmCandles` function is designed to speed up your backtesting by pre-loading historical price data. It essentially downloads and stores candles (open, high, low, close, volume) for a specific period, from a starting date to an ending date, into a persistent storage. This avoids slow data retrieval during the actual backtesting process, making your tests run much faster. You provide the function with information about the start and end dates, and the desired time interval (e.g., 1-minute, 1-hour, daily), and it handles the data retrieval and storage behind the scenes. This is a great way to optimize performance if you’re frequently re-running backtests on the same historical data.


## Function validate

This function, `validate`, checks if all the things your backtest needs – like exchanges, trading frames, strategies, risk models, sizing methods, and walkers – are properly set up and registered. 

It's like a final check before you run a backtest or optimization.

You can tell it to check specific entities, or if you leave it blank, it will verify *everything*. 

The results of these checks are saved so it doesn't have to re-check them repeatedly, making the process faster. 

Essentially, it helps prevent errors by making sure everything is in place before the real testing begins.

## Function stopStrategy

This function lets you pause a trading strategy's signal generation. It essentially tells the strategy to stop creating new orders. 

Existing open trades will finish as usual.

Whether you're running a backtest or a live trading session, the function will gracefully halt the process at a point where it’s safe to do so, like when the system is idle or a signal has fully closed.

You only need to specify the trading pair symbol (e.g., BTCUSDT) to tell it which strategy to stop.

## Function setLogger

You can now control how the backtest-kit framework reports information. This function lets you provide your own logging system. Any messages generated by the framework – things like trade executions or errors – will be sent to your logger, along with helpful details like the strategy name, the exchange being used, and the trading symbol. This allows for more flexible and customizable monitoring of your backtesting process. To use it, simply pass in an object that follows the `ILogger` interface.

## Function setConfig

This function lets you adjust how the backtest-kit framework operates. Think of it as fine-tuning the engine. You can pass in a set of configuration options to change specific behaviors, but you don’t need to provide everything – just the parts you want to modify.

There's also a special option, `_unsafe`, which is mainly used in testing scenarios. It bypasses certain checks to allow for more flexibility, but be cautious when using it.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, like those generated in markdown format. You can use it to change how data is displayed, such as adding new columns or modifying existing ones. Think of it as tailoring the report to show exactly what you need to see.

The `columns` parameter takes a set of adjustments to the default column configuration. 

Be careful though: By default, the framework checks to make sure your column definitions are correct. If you're in a testing environment and need to bypass these checks (because you're experimenting), you can use the `_unsafe` flag.

## Function overrideWalkerSchema

This function lets you tweak existing backtest walker configurations, which are used to compare different strategies. Think of it as a way to adjust a previously defined setup without starting from scratch. You provide a set of changes – only the fields you want to modify will be updated, while everything else stays the same. This is useful for fine-tuning comparisons and exploring different scenarios with your strategies. 


## Function overrideStrategySchema

This function lets you modify a strategy that's already been set up in the backtest-kit framework. Think of it as making small adjustments to an existing strategy instead of building one from scratch. You provide a piece of the strategy's configuration, and the function will update that part of the original strategy while keeping everything else as it was. This is helpful when you need to fine-tune a strategy without completely redefining it.

The function takes a single argument: a partial strategy configuration. This argument only contains the parts of the strategy you want to change.

## Function overrideSizingSchema

This function lets you tweak an existing position sizing strategy without completely replacing it. Think of it as making small adjustments – you provide a partial configuration, and only those specific settings you provide will be changed. The rest of the original sizing strategy remains in place. It’s useful for fine-tuning your risk management approach without rewriting the entire sizing logic. You’ll be working with a `sizingSchema` that contains the settings you want to modify.

## Function overrideRiskSchema

This function lets you tweak an existing risk management setup within the backtest-kit. Think of it as a way to make small adjustments to your risk configuration without having to rebuild the whole thing. You provide a partial configuration – just the parts you want to change – and it updates the existing risk configuration, leaving everything else untouched. It's a convenient way to refine your risk controls as you go.


## Function overrideFrameSchema

This function lets you adjust how a specific timeframe is handled during backtesting. Think of it as modifying an existing blueprint for a timeframe. You can update certain aspects, like the data it uses, but the rest of the timeframe’s settings will stay as they originally were. This allows for fine-grained control without needing to redefine an entire timeframe configuration. It takes a partial frame schema as input, letting you specify only the changes you want to make.

## Function overrideExchangeSchema

This function lets you modify how the backtest-kit framework interacts with a specific exchange's data. Think of it as tweaking an existing exchange's settings, rather than replacing it entirely. You can adjust things like data frequency or symbol mapping without affecting other configurations.

It takes a partial exchange configuration – essentially, just the parts you want to change – and applies those updates to the existing exchange setup. The rest of the exchange’s original settings stay put.

This is useful if you need to customize the data coming from an exchange for a specific backtesting scenario.


## Function overrideActionSchema

This function lets you tweak existing action handlers – those pieces of code that react to specific events in your backtest – without completely replacing them. Think of it as a targeted update; you only change the parts you need to, leaving the rest of the handler untouched.

It’s incredibly useful for things like changing how an event is handled in a development environment versus a live environment, or switching between different versions of the same handler dynamically. You can also use it to adjust the behavior of an action without needing to make broader changes to your overall trading strategy.

To use it, you provide a partial configuration object containing only the fields you want to change. The function then merges this with the existing handler configuration.


## Function listenWalkerProgress

This function lets you keep track of how a backtest is progressing, especially useful when you're running many strategies. It provides updates as each strategy finishes its run within the backtest. 

The updates are delivered one at a time, even if your tracking code takes some time to process each update. This prevents things from getting out of sync and ensures a smooth flow of information. To stop listening for these progress updates, the function returns another function that you can call.

## Function listenWalkerOnce

`listenWalkerOnce` lets you react to specific events happening within a trading simulation, but only once. Think of it as setting a temporary listener – you define a condition (using `filterFn`), and when that condition is met, a function (`fn`) runs to handle it. Once the function executes, the listener automatically disappears, preventing further unwanted triggers. It’s perfect for situations where you need to wait for a particular event to occur and then perform an action.

The `filterFn` determines which events will trigger the callback.

The `fn` is the function that gets executed when the filtered event occurs. It receives the event data.

The function returns a cleanup function that can be called to unsubscribe the listener manually.


## Function listenWalkerComplete

This function lets you be notified when a backtest run, managed by the Walker, is completely finished. 

It provides a way to react to the end of a testing cycle for all your trading strategies. 

Importantly, any code you put inside the notification function will be handled one step at a time, ensuring things don't get mixed up if your code takes some time to process. You provide a function that gets called when the backtest is done, and this function returns another function that you can call to unsubscribe from the notifications.

## Function listenWalker

The `listenWalker` function lets you track the progress of a backtest as it runs. It's like setting up a listener that gets notified when each strategy finishes its analysis. 

You provide a function that will be called for each event. This function receives information about the strategy that just completed.

Importantly, the events are handled one at a time, even if your callback function needs to do some asynchronous work. This prevents things from getting messy and ensures a smooth flow of information. Think of it as a reliable way to monitor your backtest's activity without interrupting its core process.


## Function listenValidation

This function allows you to keep an eye on any problems that arise during the risk validation process. Whenever a validation check fails and throws an error, this function will notify you. It's perfect for tracking down and fixing issues in your validation setup. The errors are handled in the order they appear, and the notification process itself is designed to be safe and prevents multiple error handlers from running at the same time. You provide a function that will receive the error details when something goes wrong, and this function returns another function that you can use to stop listening for those errors.


## Function listenStrategyCommitOnce

This function lets you react to specific strategy actions within your backtest. It allows you to set up a listener that will only trigger once when a particular event happens, as defined by your filter function. Once the event is caught and the callback runs, the listener automatically stops listening. Think of it as a way to wait for a single, specific action to occur within your strategy and then respond to it.

Here's a breakdown:

*   You provide a filter function that determines which events you're interested in.
*   You also provide a function (the callback) that will be executed when a matching event is detected.
*   The function returns a cleanup function. Calling this cleanup function will manually unsubscribe the listener.

## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategy's management. It's like setting up an alert system that tells you when certain actions are taken, such as canceling a scheduled trade, closing a trade partially for profit or loss, or adjusting stop-loss and take-profit levels. 

These events are handled one after another, even if your notification code takes some time to process each one, ensuring things stay in order. To use it, you give it a function (your notification code) and it will call that function whenever a relevant strategy event happens. It also makes sure that your code doesn’t get overwhelmed by handling these events concurrently.


## Function listenSignalOnce

This function lets you set up a listener that only runs once when it sees a specific signal. 

It's like setting a temporary alert - you tell it what kind of event you're looking for, and it will run a function when that event happens. After that, the listener automatically stops, so you don't have to worry about cleaning up.

You provide a filter – a test that determines which events are interesting – and then provide a callback function that will be executed just one time when a matching event occurs. This is perfect when you need to react to a signal just once and then move on.


## Function listenSignalLiveOnce

This function lets you tap into the live trading signals being generated, but only for a single event that matches your specific criteria. It's a quick way to react to a particular situation without needing to manage ongoing subscriptions. You provide a filter – a test to see if the signal is what you're looking for – and a function to execute when that signal appears. Once the matching signal is received and the function runs, the subscription is automatically canceled, keeping things clean and efficient. It works only with signals coming directly from a `Live.run()` execution.

## Function listenSignalLive

This function lets you subscribe to live trading signals coming directly from a running backtest. Think of it as hooking into the real-time flow of a simulated trade. 

It provides a way to react to each trading decision as it's made. The signals are delivered one after another, ensuring you process them in the order they occurred.

To use it, you'll pass in a function that knows how to handle these signals. This function will be called for each signal received from a Live.run() execution. The function you provide will return a function to unsubscribe.


## Function listenSignalBacktestOnce

This function lets you listen for specific signals generated during a backtest run, but only once. Think of it as setting up a temporary alert that fires just for one event that meets your criteria. 

You provide a filter – essentially, a rule that defines which signals you're interested in – and a function to handle those signals.  Once an event passes through your filter, the function you provided will be executed, and the listener is automatically removed. This is useful for things like logging a particular trade or performing a single calculation based on a specific signal during the backtest. It only works with events produced by `Backtest.run()`.


## Function listenSignalBacktest

This function lets you tap into the flow of events happening during a backtest. Think of it as setting up an observer that gets notified whenever the backtest generates a signal. 

It provides a way to react to what's happening in the backtest, one step at a time.

The function returns another function, which you’ll use to unsubscribe from the backtest events when you're done.

The events you receive are specifically from the `Backtest.run()` process, so they represent the signals generated during that particular backtest execution.

The important thing is that these signals are delivered in the order they happen, ensuring a sequential flow of information for your reaction function.


## Function listenSignal

This function lets you listen for events generated by your trading strategies. Whenever a strategy changes state – whether it's idle, opening a position, actively trading, or closing a position – this function will notify you.

It's designed to handle these events in a reliable order, even if your notification handler takes some time to process.  It makes sure that notifications are handled one at a time, preventing conflicts if your callback function does something complex.

You provide a function that will be called whenever an event occurs, and this function will return another function to unsubscribe from the signals.

## Function listenSchedulePingOnce

This function helps you react to specific "ping" events within the backtest-kit system, but only once. Think of it as setting up a temporary listener that waits for a particular condition to be met.

You provide a filter – a way to identify the exact ping events you're interested in – and a function that will be executed when that event occurs.

Once the event matches your filter and the function runs, the listener automatically disappears, so you don't have to worry about manually unsubscribing. It's great for actions you only want to perform a single time in response to a specific event.


## Function listenSchedulePing

This function lets you monitor the progress of scheduled signals – those signals that are waiting to be activated. Every minute while a signal is scheduled, a "ping" event is sent. You provide a function that gets called whenever this ping occurs. It's a way to keep tabs on the signal's lifecycle and add your own custom checks or logging during the waiting period. The function returns a function that you can call to unsubscribe from these ping events.

## Function listenRiskOnce

`listenRiskOnce` lets you set up a temporary listener to react to specific risk rejection events. Think of it as a way to wait for a particular condition to happen and then take action, but only once. You provide a filter that tells it which events you're interested in, and then a function that will be executed when that event occurs. After the function runs once, the listener automatically turns itself off. This is handy when you need to react to something specific and don't want to keep listening forever.

It takes two main parts:

*   A filter function: This determines which risk rejection events should trigger the action.
*   A callback function: This is the code that runs when the filtered event occurs. 


## Function listenRisk

This function lets you monitor when trading signals are blocked because they violate risk rules. 

You provide a function that gets called whenever a signal is rejected for risk reasons. Importantly, you only receive notifications for rejected signals, not when trades are approved.

The framework ensures that these risk rejection notifications are handled one at a time, even if your callback function takes some time to complete. This helps prevent issues caused by multiple callbacks running simultaneously.

Essentially, it’s a way to be alerted specifically when something goes wrong with your risk management system.


## Function listenPerformance

This function lets you keep an eye on how quickly your trading strategies are executing. It's like setting up a listener that gets notified whenever a certain operation completes, allowing you to track its timing. Think of it as a way to identify if any part of your strategy is unexpectedly slow, helping you optimize its performance. The events are handled one at a time, even if the function you provide takes some time to process, making sure the timing information is accurate. When you're done listening, the function returns another function that unsubscribes you from these performance updates.


## Function listenPartialProfitAvailableOnce

This function lets you react to specific profit-taking events in your backtest, but only once. Think of it as setting up a temporary alert—it listens for a condition you define, triggers a function when that condition is met, and then stops listening. You provide a filter that defines what kind of profit event you're interested in, and a function that will run once when that event occurs. It's really handy when you need to perform a specific action based on a particular profit level but don't want to continue monitoring after that. 

It automatically removes itself from the listeners after the one trigger so you don't have to worry about managing subscriptions yourself.

The filter allows you to specify exactly what conditions need to be true for the event to be triggered.
The function you provide will be executed once and only once when the filter matches an event.


## Function listenPartialProfitAvailable

This function lets you monitor your trading strategy's progress as it reaches profitability milestones. Specifically, you'll get notified when the strategy hits levels like 10%, 20%, or 30% profit.

The notifications, represented as `PartialProfitContract` events, are delivered in the order they occur. To keep things stable, the callback function you provide will be executed one at a time, even if it involves asynchronous operations. This makes sure that your monitoring logic doesn't interfere with each other.

To use it, you just need to provide a function that will be called whenever a partial profit level is achieved. The function you provide will return a function to unsubscribe from the event.


## Function listenPartialLossAvailableOnce

This function helps you react to a specific, temporary loss condition in your trading system. It lets you define a rule – a filter – to identify the exact events you’re interested in. Once an event matches that rule, your provided function will be executed *just once*, and then the subscription is automatically cancelled. This is perfect when you need to respond to a single occurrence of a certain loss threshold and don’t want to keep monitoring continuously.

Essentially, you set up a listener that waits for something specific to happen, takes action once, and then goes away.

The `filterFn` lets you specify what kind of loss event triggers the response.
The `fn` is the function that gets called when that specific event happens.

## Function listenPartialLossAvailable

This function lets you monitor the progress of a trading strategy's losses, breaking them down into stages like 10%, 20%, and 30%. 

It's designed to keep track of these milestones and notify you when they're reached. 

Crucially, it handles notifications in a controlled way – it processes them one at a time, ensuring that any actions you take based on these loss levels don’t interfere with each other, even if your notification process takes some time.

You provide a function as input; this function will be called whenever a new loss level is hit, and it receives details about the loss event. To stop listening, the function returns another function that you can call.

## Function listenExit

To handle unexpected, critical errors that can halt your backtest or live trading process, use `listenExit`. 

This function allows you to subscribe to fatal errors, like those that might occur within background tasks.

Unlike handling general errors, these are severe problems that will immediately stop execution.

The errors are processed one at a time, even if your error handling function performs asynchronous operations, ensuring a consistent response. This prevents multiple error handlers from running concurrently.

You provide a callback function (`fn`) that will be invoked when a fatal error happens, and `listenExit` returns a function that can unsubscribe from these events.


## Function listenError

This function lets you set up a way to catch and deal with errors that happen while your trading strategy is running, but aren't critical enough to stop the whole process. Think of it as a safety net for things like failed API requests. 

The errors you catch are handled one at a time, in the order they happened, ensuring a smooth workflow even if the error handling takes some time. It helps to keep your strategy running even when unexpected problems pop up.

You provide a function (`fn`) that will be called whenever one of these recoverable errors occurs, allowing you to log them, retry actions, or take other corrective measures. When you’re done with this error handling, you can unsubscribe from the error events.


## Function listenDoneWalkerOnce

This function lets you react to when a background task within the backtest-kit framework finishes, but only once. You provide a filter that determines which completion events you're interested in, and a function that gets executed when a matching event happens. The magic is that it automatically stops listening after that single execution, so you don't need to worry about manually unsubscribing.

It’s useful for tasks like verifying the success of a particular process or triggering a cleanup action after a specific background operation concludes.

Here's a breakdown:

*   You tell it what to look for (using `filterFn`).
*   You tell it what to do when it finds it (using `fn`).
*   It handles the unsubscribing for you, ensuring it only runs once.

## Function listenDoneWalker

This function lets you keep track of when background tasks within the backtest-kit framework finish. 

Essentially, you provide a function that gets called whenever a background task completes. 

The function makes sure these completion notifications are handled one at a time, even if your provided function takes some time to process, preventing any unexpected issues from multiple things happening at once. It's a way to be notified and react to the end of those background operations.

## Function listenDoneLiveOnce

The `listenDoneLiveOnce` function lets you react to when a background task finishes, but only once. You provide a filter to specify which tasks you're interested in, and then a function that will be called when a matching task completes. Once that callback runs, it automatically stops listening, so you don't need to worry about manual cleanup. It's great for situations where you need to perform an action immediately after a specific background process is done, and you only need to do it once.

Here's a breakdown:

*   You give it a way to check *which* background tasks it should watch for.
*   You tell it what function to run when a matching task finishes.
*   It handles the cleanup for you – it stops listening after the first event.


## Function listenDoneLive

This function lets you monitor when background tasks run by Live have finished.

It’s a way to be notified when a process in the background has completed its work.

You provide a function that will be called when a task is done, and this function will be executed sequentially, ensuring that even if the provided function is asynchronous, the order of events is maintained. This prevents multiple functions from running at the same time.


## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but only once. Think of it as setting up a listener that executes your code just once when a specific condition related to the backtest completion is met. 

It uses a filter – you provide a function that checks if the backtest event matches what you're looking for. Only when that filter returns true will your provided callback function be executed. 

Once your callback has run, the listener automatically disappears, preventing it from triggering again. This ensures that you handle the completion event only the first time it occurs, simplifying your code.


## Function listenDoneBacktest

This function lets you get notified when a background backtest job finishes. 

Think of it as setting up a listener that waits for a particular backtest to be done. 

When the backtest is complete, your provided function will be called with information about the finished backtest. Importantly, even if your function takes some time to complete (like if it’s doing something asynchronously), the system makes sure that events are handled one after another in the order they arrive. This prevents any unexpected conflicts or issues that might arise from multiple callbacks running at the same time. To stop listening, the function returns another function that you can call to unsubscribe.


## Function listenBreakevenAvailableOnce

This function lets you set up a listener that waits for a specific breakeven condition to be met, then reacts just once and stops listening. You provide a filter – a way to describe exactly what kind of breakeven event you're interested in – and a function to run when that event happens. Once the event is detected and your function runs, the listener automatically turns itself off. This is great if you need to perform an action only when a particular breakeven threshold is reached.

The filter function determines which events are considered a match.
The callback function is executed only when a matching event is found.


## Function listenBreakevenAvailable

This function lets you be notified whenever a trade's stop-loss is automatically adjusted to the entry price – essentially, a breakeven point. This happens when the trade has made enough profit to cover the initial costs and fees. The notification you receive will contain details about the contract that triggered the event. 

It’s designed to handle these notifications in a safe and reliable way, ensuring that even if your notification code takes some time to run, events are processed one after another, without causing any conflicts. To stop listening for these events, you'll receive a function that you can call to unsubscribe.

## Function listenBacktestProgress

This function lets you keep an eye on how your backtest is running. It allows you to receive updates as the backtest progresses, ensuring you get information in the order it's generated. 

Think of it as a way to listen for signals that tell you what's happening behind the scenes of your backtest – it’s perfect for displaying progress bars or logging key milestones.

The updates you receive will be processed one at a time, even if your code needs some time to handle each update. This makes sure everything stays organized and prevents unexpected behavior.

To use it, you simply provide a function (`fn`) that will be called with information about the backtest's current state whenever an update is available. When you're done, the function returns another function that you can call to unsubscribe from the updates.

## Function listenActivePingOnce

This function lets you set up a one-time listener for active ping events, which are notifications about activity in the trading system. You provide a filter – a condition that determines which pings you're interested in – and a callback function that will run *once* when a matching ping occurs. After that single execution, the listener automatically stops, so you don't have to worry about manually cleaning it up. It's perfect for situations where you need to react to a specific, short-lived event. 

You give it a way to identify the pings you want (the `filterFn`) and what you want to do when one is found (`fn`).


## Function listenActivePing

This function lets you monitor the lifecycle of active trading signals. It provides a way to be notified about these signals every minute, which is really helpful if you need to adjust your strategies based on their status. The notifications are delivered in the order they occur, and the system ensures that each notification is handled one at a time, even if your processing takes some time. To use it, you simply give it a function that will be called whenever a new active ping event happens, and it will return a function to unsubscribe from the events.

## Function listWalkerSchema

This function helps you discover all the different ways your backtest-kit framework is set up to process data. It returns a list of "walkers," which are essentially building blocks defining how data is analyzed and transformed during a backtest. Think of it as a way to see exactly what’s happening under the hood.  You can use this information to understand your existing setups, build tools to visualize the process, or troubleshoot any unexpected behavior. It pulls the list of walkers that you’ve previously registered using `addWalker()`.

## Function listStrategySchema

This function helps you discover all the trading strategies that have been set up within your backtest-kit project. It essentially gives you a complete inventory of the strategies you're working with. Think of it as a way to see a list of all your defined trading approaches, making it easier to understand your setup, troubleshoot potential issues, or even build user interfaces that dynamically display your strategies. It returns this information as a list of strategy schemas, providing details about each one.

## Function listSizingSchema

This function lets you see all the sizing configurations currently set up within the backtest-kit framework. Think of sizing as how much of an asset you're buying or selling in each trade. This function returns a list of those configurations, allowing you to inspect them. It's particularly handy when you're trying to understand how your trading strategy is sizing orders, or if you're building tools to visualize or manage these settings. You can use it to debug, generate documentation, or create user interfaces that dynamically show sizing options.


## Function listRiskSchema

This function helps you see all the risk configurations currently set up within the backtest-kit framework. Think of it as a way to peek behind the scenes and understand how risk is being managed in your trading simulations. It returns a list of these configurations, making it simple to check your settings, generate documentation, or build tools that interact with your risk management rules. You can use this to verify that your risk schemas have been correctly registered after adding them.

## Function listFrameSchema

This function lets you see all the different data structures (frames) your backtest is using. Think of it like a directory listing of your data organization. It's helpful if you want to understand how your backtest is handling information, build tools to display this information, or troubleshoot any issues. The function returns a list of these data structure definitions, which you can then inspect.


## Function listExchangeSchema

This function provides a way to see all the exchanges that your backtest-kit setup recognizes. It returns a list, allowing you to easily inspect the configuration for each exchange. Think of it as a quick way to check what data sources are available for your backtesting and trading strategies – it’s handy for troubleshooting or creating user interfaces that adapt to the exchanges you’re using. You'll get an array of information describing each exchange.

## Function hasTradeContext

This function simply tells you if the environment is ready for trading actions. 

It verifies if both the execution context and the method context are currently running. 

Think of it as a quick check to make sure all the necessary pieces are in place before you try to interact with the exchange or perform calculations. You need this to be true before calling functions like `getCandles` or `formatPrice`.


## Function getWalkerSchema

The `getWalkerSchema` function is your go-to tool for understanding the structure of a specific trading strategy or algorithm within the backtest-kit framework. Think of it as looking up the blueprint for a particular trading method.  You give it the name of the strategy you’re interested in, and it returns a detailed description of its components and how it's expected to behave. This lets you peek under the hood and see exactly what that strategy is doing.



It takes a single input: the `walkerName`, which is simply the unique identifier for the trading strategy. The function then returns a structured object (`IWalkerSchema`) that outlines the strategy's design.

## Function getSymbol

This function lets you find out which symbol your backtest or live trading is currently focused on. It's a simple way to check which asset you're working with, and it returns the symbol as a string. You'll get this information back as a promise that resolves to the symbol.

## Function getStrategySchema

The `getStrategySchema` function lets you fetch the definition of a trading strategy that's been set up in the backtest-kit framework. Think of it like looking up the blueprint for a specific trading approach. You provide the strategy's unique name, and the function returns a structured description of how that strategy operates, including what data it needs and how it makes decisions. This is helpful for understanding or validating how a strategy is designed.


## Function getSizingSchema

This function helps you fetch the details of a specific sizing strategy that's been registered within the backtest-kit framework. Think of sizing as how much of an asset you're trading in each instance. 

You provide the name of the sizing strategy you want to know more about, and it returns a structured object containing all the configuration details for that strategy. It's a handy way to understand how a particular sizing method is set up. 

The `sizingName` is the unique identifier that distinguishes one sizing strategy from another.


## Function getRiskSchema

This function helps you find the specific rules and calculations used to manage a particular type of risk in your trading strategy. Think of it like looking up a template – you give it a name (like "VolatilityRisk" or "PositionSizeRisk"), and it returns the details of how that risk is assessed and controlled. The name you provide must be a recognized risk identifier that's already been set up within the backtest-kit system. This is how you access the pre-defined structure for handling various risk factors.

## Function getRawCandles

The `getRawCandles` function is your tool for retrieving historical candlestick data. You can specify which trading pair (like BTCUSDT) and timeframe (like 1-minute, 1-hour, etc.) you want data for.

It's designed to be really flexible—you can request a specific number of candles, or define a start and end date for your data range. 

If you don't provide a start date, the system will calculate it based on your end date and the number of candles you’re requesting.

Importantly, the function avoids look-ahead bias by respecting the current execution context, ensuring a fair backtesting environment. The end date you specify will always be checked to ensure it's not in the future.

## Function getOrderBook

This function allows you to retrieve the order book for a specific trading pair, like BTCUSDT. 

It pulls this data from the exchange you're connected to within the backtest-kit framework.

The function takes the trading symbol as input, and you can optionally specify how many levels of depth you want to see in the order book.  If you don’t specify a depth, it uses a default maximum.

The timing of the request is handled automatically based on the current execution context, ensuring it aligns with the backtest or live trading environment. The exchange implementation might use the timing information or disregard it depending on whether you're backtesting or trading live.


## Function getNextCandles

This function lets you grab a batch of future candles for a specific trading pair and timeframe. It's designed to get candles that come *after* the current point in time based on how your backtest is set up. 

You provide the symbol of the asset you're trading (like BTCUSDT), the time interval for the candles (options include 1 minute, 3 minutes, up to 8 hours), and how many candles you want to retrieve. The function then uses the underlying exchange's tools to pull those candles. 


## Function getMode

This function tells you whether the backtest-kit framework is currently running a backtest or a live trading session. It returns a promise that resolves to either "backtest" or "live", giving you a simple way to adapt your code based on the environment it's running in. For example, you might use this to conditionally log extra data during backtests or disable certain features in live mode.

## Function getFrameSchema

The `getFrameSchema` function helps you find the blueprint, or schema, for a specific frame within your backtest. Think of it like looking up the exact structure and data types expected for a particular type of data point in your trading simulation. You give it the name of the frame you're interested in, and it returns the schema that defines that frame. This is useful for understanding how data is organized and validated within your backtest.

## Function getExchangeSchema

This function helps you find the details of a specific exchange that backtest-kit supports. Think of it as looking up the blueprint for how a particular exchange works – things like what order types it offers, how its data is structured, and more. You provide the name of the exchange you're interested in, and it returns a structured description of that exchange, allowing you to accurately simulate trading on it within your backtests. It’s useful when you want to ensure your strategies are compatible with a specific exchange's rules and data.


## Function getDefaultConfig

This function gives you a set of pre-defined settings that are used by the backtest-kit trading framework. It's like a starting point for your own custom configurations. 

You can look at the values returned to understand what each setting controls and what the default behavior is. Think of it as a quick reference guide for all the possible configuration options. It's read-only, so you can’t directly change these values, but they provide a solid base for your own modifications.


## Function getDefaultColumns

This function provides a starting point for defining the columns you want to display in your backtest reports. It returns a set of pre-configured column definitions, covering areas like strategy performance, risk metrics, and event details. Think of it as a blueprint—you can use it to understand the possibilities and customize the columns to fit your specific reporting needs. It's helpful for seeing all the available column options and how they’re typically set up.

## Function getDate

The `getDate` function provides a way to retrieve the current date within your trading strategy. 

It’s a simple tool that tells you what date your code is operating on.

During a backtest, it gives you the date associated with the specific historical timeframe you're analyzing. 

When running live, it gives you the current, real-time date. Essentially, it adapts to the mode of operation.

## Function getContext

This function gives you access to the current environment where a method is running. Think of it as a snapshot of the situation – it holds information like which method is active and other relevant details. It's a promise, so it will return this information asynchronously. Using this context can be helpful for debugging or understanding the flow of your backtesting process.


## Function getConfig

This function lets you peek at the framework's settings. 

It gives you a snapshot of how the system is currently configured, like limits on timing, retry attempts, and notification amounts. 

Think of it as checking the "options" panel to see what's influencing the backtesting process. Importantly, the returned configuration is a copy, so you can look at it without changing the actual running settings.

## Function getColumns

This function provides access to the column configurations used for generating markdown reports within the backtest-kit framework. It returns a snapshot of the currently defined columns, encompassing different data types like closed trade results, heatmap rows, live data ticks, partial events, breakeven points, performance metrics, risk events, scheduled tasks, strategy events, and walker signals. Think of it as a way to see what data is being used to build your reports. Importantly, the returned configuration is a copy, so any changes you make won't affect the underlying definitions used by the backtest-kit.

## Function getCandles

This function allows you to retrieve historical price data, presented as candles, from the exchange you're connected to. You specify the trading pair you're interested in, like "BTCUSDT" for Bitcoin against USDT, and the timeframe for each candle, ranging from one minute to eight hours.  The `limit` parameter determines how many candles you want to pull – more candles mean more historical data to analyze. The data returned is an array of candle objects, each containing information like open, high, low, close prices, and the timestamp. It essentially gives you a window into past price action for a specific trading pair.


## Function getBacktestTimeframe

This function helps you discover the timeframe used for a specific trading pair during a backtest. Simply provide the symbol, like "BTCUSDT," and it will return an array of dates that represent the available historical data for that timeframe. This lets you understand the scope of your backtest – what dates are being analyzed. It’s a useful way to check the time period your backtesting strategy will be evaluated against.

## Function getAveragePrice

This function, `getAveragePrice`, helps you figure out the average price of a trading pair like BTCUSDT. It does this by calculating the VWAP, which gives more weight to prices where more trading happened. Specifically, it looks at the last five minutes of trading data, calculates a 'typical price' for each minute (based on the high, low, and close prices), and then combines that with the volume traded at each price. If there's no trading volume, it simply averages the closing prices. You just need to give it the symbol of the trading pair you're interested in, and it returns a number representing that average price.

## Function getActionSchema

This function helps you find the details of a specific action within your trading strategy. Think of it as looking up the blueprint for how a certain action, like placing an order or calculating an indicator, should work. You give it the name of the action, and it returns a description of what that action involves. This is useful for understanding how different actions fit together in your backtesting setup.



The action name is a unique identifier for that action.

## Function formatQuantity

This function helps you ensure that the amount you're trading is presented correctly for a specific cryptocurrency pair. It takes the trading pair's symbol, like "BTCUSDT," and the raw quantity you want to trade as input. It then formats that quantity to match the rules of the exchange you're using, making sure the number of decimal places is accurate. This is crucial because different exchanges have different precision requirements.

## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes the symbol (like BTCUSDT) and the raw price value as input. 

Then, it uses the specific rules of the exchange to format the price, ensuring the correct number of decimal places are shown. This is really important to present prices in a way that matches the exchange’s standards. 

Essentially, it handles the details of price formatting so you don’t have to.


## Function commitTrailingTake

This function helps you manage your take-profit orders when using a trailing stop strategy. It adjusts the distance of your take-profit order based on a percentage shift applied to the original take-profit level you set.

It's really important to remember that the calculations always refer back to your initial take-profit distance – this ensures accuracy and avoids compounding errors if you call the function repeatedly.

Think of it like this: you’re defining how much your take-profit will shift based on the current price. A negative shift moves your take-profit closer to your entry price, making it more conservative. A positive shift moves it further away, making it more aggressive.

The function is smart; it only updates your take-profit if the new value is more conservative than the existing one. For long positions, that means it only moves the take-profit *down* closer to the entry price. For short positions, it only moves it *up*.

It automatically knows whether it's running in a backtest or a live trading environment.

You provide the symbol of the trading pair, the percentage shift you want to apply, and the current price of the asset.

## Function commitTrailingStop

The `commitTrailingStop` function lets you fine-tune the trailing stop-loss distance for a trading signal that's already waiting to be triggered. Think of it as adjusting how far your stop-loss can move away from your entry price.

It's really important to understand that this function always calculates the new stop-loss distance based on the original stop-loss distance you set initially. This is to avoid small errors from adding up over time.

When you adjust the percentage, if you set a smaller change, the larger one takes priority – it only moves your stop-loss in a direction that provides better protection.

For long positions, the stop-loss can only move upwards, and for short positions, it can only move downwards. The closest position to your entry price always wins when updating.

The function automatically adapts to whether you're in backtesting mode or live trading mode.

You’ll need to provide the trading symbol, the percentage change you want to apply to the original stop-loss distance, and the current market price.

## Function commitPartialProfit

This function lets you automatically close a portion of your open trading position when it reaches a profit level, helping you secure gains. It's designed to close a specified percentage of the position – for example, 25% or 50% – as the price moves favorably towards your take profit target. The framework handles whether it's running in a testing environment or a live trading environment.

You'll need to provide the symbol of the trading pair (like BTCUSDT) and the percentage of the position you want to close. 

For example, if your position is large, you might close 25% to lock in some profit while allowing the remaining position to potentially run further.

## Function commitPartialLoss

This function helps you automatically close a portion of your open trade when the price moves unfavorably, essentially inching towards your stop-loss level. It's designed to reduce risk by closing off some of your position. 

You specify the trading symbol and the percentage of the position you want to close. The function handles whether it's being used in a backtesting environment or a live trading setup. 

For example, if you want to close 25% of your open position and the price is moving in the direction of your stop loss, this is the function to use.


## Function commitClosePending

This function lets you manually close a pending order that your trading strategy has already created. Think of it as saying, "Okay, strategy, you were going to do this, but now I've decided to handle it." Importantly, it doesn't interrupt your strategy's regular operation; it keeps running and can create new signals.

It's useful if you want to manage a specific order closure from outside the strategy's logic, like maybe from a user interface. You can also optionally provide an identifier to track why that specific pending order was closed. The system figures out whether it’s running a backtest or live trading based on its environment.

## Function commitCancelScheduled

This function lets you cancel a previously scheduled trading signal without interrupting your strategy's overall operation. Think of it as retracting a future order – it removes the signal that was waiting for a specific price to trigger. It's useful if you want to adjust your plan without completely halting the strategy.  It won’t affect any existing orders or prevent the strategy from creating new signals.  You can optionally provide a cancellation ID to help you keep track of cancellations you've personally requested. The function works seamlessly in both backtesting and live trading environments.

## Function commitBreakeven

This function helps automate risk management for your trades. It automatically shifts your stop-loss order to your entry price – essentially turning your position risk-free – once the price has moved favorably enough to cover your initial costs. 

It calculates the profit threshold needed to trigger this breakeven move based on slippage and fees. The process works seamlessly whether you're in a backtesting or live trading environment. 

It also fetches the current price for you, so you don't have to worry about that. You just need to provide the trading pair symbol.


## Function commitActivateScheduled

This function lets you trigger a scheduled signal before the price actually hits the specified level. 

Think of it as a way to manually nudge a signal into action, useful for specific testing or scenarios where you want immediate control.

It essentially sets a flag on the signal, and the strategy will pick up on this flag during its regular checks. 

You’ll need to provide the symbol being traded and can optionally include an activation ID to keep track of who initiated the early activation. This function is smart enough to figure out whether it's running a backtest or a live trade.


## Function checkCandles

The `checkCandles` function is designed to ensure your historical candle data is properly aligned with the intended trading intervals. It performs a validation process, directly accessing and verifying the timestamps stored in your persistence layer – essentially, your saved candle data files. This function helps catch potential discrepancies early on, preventing issues that could arise later in backtesting or live trading. It doesn’t rely on intermediary abstractions when reading this data, giving it a direct and efficient check. To use it, you'll provide a set of validation parameters, which guide how the function assesses the timestamp accuracy.

## Function addWalkerSchema

This function lets you register a "walker," which is essentially a way to run backtests for multiple trading strategies simultaneously. Think of it as a tool for comparing how different strategies perform using the same historical data. You provide a configuration object that describes how the walker should operate, and it handles the process of running the tests and evaluating the results. It's a key component for robust strategy evaluation and optimization within the backtest-kit framework.

## Function addStrategySchema

This function lets you tell the backtest-kit about a new trading strategy you've created. Think of it as registering your strategy so the system knows how it works and can use it for backtesting or live trading.

When you register a strategy this way, the framework will automatically check to make sure it's set up correctly – things like the prices are valid, stop-loss and take-profit logic is sound, and timestamps are accurate.

It also helps prevent issues like overwhelming the system with too many signals and ensures your strategy's data can be safely stored even if something unexpected happens during live trading.

To register, you simply provide a configuration object that defines your strategy.

## Function addSizingSchema

This function lets you tell the backtest kit how to determine the size of your trades. Think of it as defining your risk management rules.

You provide a sizing schema – a set of instructions – that specifies things like whether you want to use a fixed percentage of your capital for each trade, a more complex Kelly Criterion, or a strategy based on Average True Range (ATR).

The schema also outlines key risk parameters such as the percentage of capital you're willing to risk, multipliers for Kelly Criterion calculations, or how much weight to give to ATR. 

Finally, you can even include callbacks to react to specific events during the sizing calculation process. Essentially, this function is central to controlling how much you bet on each trade within the backtest.


## Function addRiskSchema

This function lets you define and register how your trading system manages risk. Think of it as setting up the rules for how much you can trade at once and defining custom checks to make sure your portfolio is healthy.

These risk configurations aren’t isolated – they’re shared among different trading strategies, allowing for a broader view of your overall risk exposure. 

The system keeps track of all your active positions so you can perform complex validations, like analyzing correlations between different assets, and even decide whether a trading signal should be accepted or rejected based on risk factors.

## Function addFrameSchema

This function lets you tell the backtest-kit about a new timeframe generator you want to use. Think of it as registering a way to create the specific time periods (like daily, weekly, or monthly) that your backtest will analyze. 

You provide a configuration object, which details how those timeframes should be created, including the start and end dates of your backtest, the interval (like 1 day or 1 week), and a function that will actually generate the timeframe data. This allows you to tailor the time periods used for your backtesting strategy.


## Function addExchangeSchema

This function lets you tell the backtest-kit framework about a new exchange you want to use for your backtests. Think of it as registering a data source, allowing the framework to access historical price data, handle how prices and quantities are displayed, and even calculate indicators like VWAP based on recent trading activity. You'll provide a configuration object that describes the exchange and how to access its data. This sets the stage for fetching historical data and simulating trades on that specific exchange.

## Function addActionSchema

This function lets you register custom actions that will be executed during your backtest or live trading. Think of actions as ways to react to events happening in your trading strategy, like a signal being generated, or a trade reaching a profit target.

You can use these actions to do things like update your state management system (like Redux), send notifications to a messaging service (like Discord or Telegram), log events, track performance metrics, or even trigger other custom business logic.

Essentially, each time a significant event occurs within your strategy – signals, profit/loss updates – your registered actions will be triggered and have access to all the relevant information. The action setup is done once with the `actionSchema` configuration.
