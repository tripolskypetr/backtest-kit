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

The `writeMemory` function lets you store data persistently within your trading strategies. Think of it as creating a labeled container for information—you give it a name (`bucketName`), a unique identifier (`memoryId`), the actual data you want to save (`value`), and a brief explanation (`description`). It's designed to work seamlessly whether you’re testing strategies historically or deploying them live, handling the differences automatically.  This function is tied to a specific trading signal, ensuring the data is accessible within the context of that signal's execution.


## Function warmCandles

The `warmCandles` function is designed to speed up your backtesting by proactively downloading and storing historical candle data. It essentially pre-loads candles for a specified date range, making them readily available when your backtest needs them. You tell it the starting and ending dates, and the function fetches all candles for the selected time interval and saves them for later use. This can significantly reduce data retrieval times during backtest execution, leading to a faster and more efficient process.


## Function waitForReady

This function helps ensure that all the necessary components are set up before you start trading, whether you're running a backtest or a live trade. It waits patiently, checking every second, until the system confirms that it has the information it needs – things like details about the exchange, the trading strategy, and for backtests, the historical data frames.

If you're doing a backtest, it verifies all three pieces of information are ready. If you're trading live, it only checks the exchange and strategy.

Think of it as a safety net at the beginning of your trading session, preventing errors that could arise from incomplete setup. It’s designed to be used when those components are loaded asynchronously, delaying the actual trading process until everything is properly in place. If it can't get everything ready in a reasonable amount of time, it will finish silently, and any errors that come up later are expected to be dealt with in the trading execution. 

The `isBacktest` parameter allows you to specify whether to check for frame schema registration.

## Function validate

The `validate` function helps make sure everything is set up correctly before you run any tests or optimizations. It checks if all the entities you're using – things like exchanges, strategies, or risk managers – actually exist in the system’s registry.

You can tell it specifically which entities to check, or if you leave it blank, it will check *everything*. 

This process is efficient because the results are stored, so you don't have to repeat it unnecessarily. Think of it as a safety net to prevent errors caused by missing or misconfigured components.

## Function stopStrategy

This function lets you pause a trading strategy's signal generation. It effectively puts a stop to new trades, although any existing trades will finish as planned. The system will halt at a point where it's safe to do so, whether that's when it's idle or after a current trade has concluded. It figures out whether it's running a backtest or a live trading session automatically. You specify the trading pair, like 'BTCUSDT', to indicate which strategy you want to stop.

## Function shutdown

This function provides a way to properly end a backtest run. It sends a signal that tells all parts of the system to prepare for closing down. Think of it as a polite way to exit, allowing everything to finish any ongoing tasks or clean up before the program stops completely. It's helpful to use when the program receives a signal to stop, like when you press Ctrl+C.

## Function setSignalState

This function helps you manage and track the state of a trading signal. It's particularly useful when you want to keep track of metrics related to individual trades, like how long a trade is open or how much profit it's made.

The function automatically figures out whether you're in backtesting mode or live trading mode.

It makes sure the signal is active before updating its state, and if no signal is active, it will give you a warning.

Think of it as a way to carefully record and manage details about each trade as it progresses. It's designed to be especially helpful when dealing with complex trading strategies that involve continuously evaluating and adjusting trades based on various factors. It works by updating a specific value associated with a signal, and it handles resolving active signals and adapting to different execution environments.


## Function setSessionData

This function lets you store information specific to a particular trading pair, strategy, exchange, and timeframe, and that information will last throughout the backtest or live trading session. Think of it as a place to hold temporary data, like results from complex calculations or the state of an indicator, that you need to access across multiple candles.

You can clear the stored data by passing `null` as the value.

The function automatically figures out whether it's running a backtest or a live session.

It takes two arguments: the symbol of the trading pair and the value you want to store, which can be an object or `null` to remove the data.

## Function setLogger

You can now control how backtest-kit reports its internal activity. This function lets you plug in your own logging system, so you can direct messages to a file, a monitoring tool, or wherever you need them. The framework will automatically include important details like the trading strategy name, the exchange being used, and the symbol being traded alongside each log message, giving you valuable context. To use it, simply pass an object that implements the `ILogger` interface to the `setLogger` function.


## Function setConfig

This function lets you adjust how the backtesting framework behaves. You can change settings like the data source, the default order size, or other global parameters. Think of it as fine-tuning the engine of your backtest.  

There’s a special `_unsafe` flag.  You'll typically only use this during testing, where you want to bypass some safety checks in the configuration to streamline the process. It allows for more flexibility in testing scenarios where strict validation isn't essential.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports. Think of it as tailoring the report layout to show exactly the data you need. You can modify existing column configurations or add new ones. 

Be aware that the framework will check your new configurations to make sure they are structurally sound, but if you're in a testing environment and need extra flexibility, you can bypass this validation. This provides more control over the visual presentation of your backtest results.

## Function searchMemory

The `searchMemory` function lets you find relevant data stored in your memory system. Think of it as a powerful search tool specifically designed for your trading framework. You provide a bucket name (where your data is stored) and a search query, and it uses a technique called BM25 to find the best matches. 

The function handles a lot of the setup work for you. It figures out which signal you're currently working with and whether you're in a backtesting or live trading environment. 

The function returns an array of results. Each result includes a unique memory ID, a score indicating how well it matches your query (higher score is better), and the actual data content itself. The data is formatted to match the type of data you initially saved.


## Function runInMockContext

This function allows you to run a piece of code as if it were part of a backtest or live trading environment, but without actually running a full backtest. It's great for testing and development—for example, you might want to use it to verify how your code behaves when it needs to know the current trading timeframe.

You can customize the context in which the function runs by providing parameters like the exchange name, strategy name, or trading symbol. If you don't provide these, it will use default placeholder values, creating a basic environment suitable for quick tests.

The default setup simulates a live trading session, but you can change the `backtest` parameter to `true` to mimic a backtesting scenario. The `when` parameter determines the time the function will be executed within this context, defaulting to the current minute.

## Function removeMemory

This function helps you clean up your backtest data. 

It's designed to erase specific memory entries, essentially removing a piece of historical information related to a particular trading signal. 

Think of it as tidying up the records used by your backtest or live trading system. It automatically adjusts its behavior based on whether you’re in a backtesting or live environment and handles signal execution within the system. You provide the name of the bucket and the unique ID of the memory entry you want to remove.


## Function readMemory

The `readMemory` function lets you retrieve data that's been stored in memory, associating it with the currently active trading signal. Think of it as a way to access previously saved information relevant to your specific trading decisions.

It handles the complexities of knowing which signal is active and whether you're in a backtesting or live trading environment, so you don't have to worry about those details.

To use it, you simply provide the name of the memory bucket and a unique identifier for the piece of data you want to retrieve. The function then returns a promise that resolves with the data, formatted according to the type you specified.


## Function overrideWalkerSchema

This function lets you adjust a trading strategy's walker configuration—think of it as tweaking how the strategy explores different trading scenarios—without completely rebuilding it. It's useful when you want to experiment with small changes to the walker's settings while keeping the rest of its setup as is. You provide a partial configuration, and the function merges it with the existing walker, ensuring only the specified aspects are modified. This is handy for comparative testing and refining strategy behavior. 

Essentially, it's a targeted way to update a walker's behavior.

## Function overrideStrategySchema

This function lets you modify a trading strategy that's already set up within the backtest-kit framework. You can adjust a strategy without rebuilding it entirely. Provide a portion of the strategy's configuration, and this function updates only that part, leaving everything else as is. It's useful for fine-tuning strategies based on new data or changing market conditions.

This function checks if your backtest setup is correct and complete. It runs through your entire backtest configuration and verifies everything is set up properly. This helps catch errors before the backtest begins, saving you time and potential issues.

## Function overrideSizingSchema

This function lets you modify an existing sizing schema, which controls how much capital is allocated to each trade. Think of it as fine-tuning a pre-existing sizing strategy.

You don't need to redefine the entire sizing schema; you can just provide the specific settings you want to change. The rest of the configuration remains as it was originally defined.

The function takes a partial sizing configuration as input – essentially, only the pieces you want to update. It returns a promise that resolves to the modified sizing schema.


## Function overrideRiskSchema

This function lets you modify a risk management setup that’s already in place. Think of it as tweaking an existing plan, rather than building one from scratch. You provide a partial configuration – just the things you want to change – and the framework updates the existing risk schema, leaving everything else untouched. This is useful for making small adjustments without rebuilding the entire risk profile.


## Function overrideFrameSchema

This function lets you modify an existing timeframe setup you’ve already defined for your backtest. Think of it as fine-tuning a timeframe’s settings without starting from scratch. You only need to specify the parts you want to change; anything you don’t provide will keep its original value. It’s helpful for adjustments like tweaking data resolutions or adding/removing fields within an existing timeframe. The function returns a promise that resolves to the updated frame schema.

## Function overrideExchangeSchema

This function lets you modify a registered data source for an exchange. It's useful when you need to tweak an existing exchange's settings—perhaps updating fees or order sizes—without completely replacing its original definition.

You provide a partial configuration object, which specifies only the properties you want to change. The rest of the exchange's configuration stays as it was originally set up.

Essentially, it’s a way to make targeted adjustments to how the framework interacts with a particular exchange.

## Function overrideActionSchema

This function lets you tweak the settings of an already existing action handler. Think of it as making small adjustments – only the parts you specify will change, leaving the rest of the handler as it was. 

It's really handy if you need to change how an action works without completely rebuilding it. 

For example, you could update the logic for handling events, change how callbacks behave depending on your environment (like testing vs. production), switch between different handler implementations on the fly, or fine-tune the behavior of an action without altering the overall strategy.

You simply provide a partial configuration object, and the function applies those changes to the existing handler.

## Function listenWalkerProgress

This function lets you track the progress of your backtest as it runs through different strategies. 

It sets up a listener that gets triggered after each strategy finishes executing within the backtest. 

The listener will receive events containing information about the progress. Importantly, any code you put inside the listener function will run one step at a time, even if it involves asynchronous operations, ensuring things stay in order. This helps prevent unexpected behavior when dealing with complex calculations. To stop listening, the function returns another function that you can call to unsubscribe.

## Function listenWalkerOnce

This function lets you react to a specific event happening within a larger process, but only once. Think of it as setting up a temporary alert – you specify what kind of event you're looking for, a callback function gets executed when it occurs, and then the alert automatically disappears. It’s handy for situations where you need to wait for a particular condition to be met before continuing. 

You provide a filter to define what kind of event should trigger your reaction, and then a function to execute when that event is detected. The function returns a cleanup function that you can call if you need to cancel your subscription early.

## Function listenWalkerComplete

This function lets you get notified when the entire backtesting process, involving multiple strategies, is finished.

Think of it as a way to listen for the "all done" signal from your backtest.

The events are delivered one at a time, even if your notification function takes some time to process them, ensuring a clean and orderly flow.

To prevent any potential issues with multiple things happening at once, it uses a special mechanism to handle these notifications sequentially.

You provide a function that will be called with details about the completion event each time the process finishes.


## Function listenWalker

This function lets you tap into the progress of a backtest, receiving updates after each strategy finishes running. Think of it as a way to monitor what's happening behind the scenes during a backtest. 

The updates are delivered one at a time, and the system ensures that your code processes each update sequentially, even if your code takes some time to run. This prevents potential conflicts or unexpected behavior that could arise from running things at the same time.

Essentially, you provide a function (`fn`) that will be called whenever a strategy completes, giving you access to information about the events that occurred.  The function you provide will return a function that you can call to unsubscribe from these updates later on.


## Function listenValidation

This function lets you keep an eye on potential problems during risk validation. Whenever a validation check encounters an error, this function will notify you through a callback. It's particularly helpful for finding and fixing issues in your validation logic. The errors are handled in the order they happen, and the callback itself can be asynchronous without causing any timing conflicts. Think of it as a safety net to catch and manage those validation hiccups.

The callback function you provide will receive the error details, allowing you to log it, report it, or take corrective action.


## Function listenSyncOnce

`listenSyncOnce` lets you listen for specific signal synchronization events and execute a function *just once* when they occur. It’s particularly useful when you need to coordinate with external systems that might be involved in the trading process.  The callback function you provide will only run once and it's synchronous – if it returns a promise, the entire process pauses until that promise resolves.  A filter function lets you specify exactly which events should trigger your callback.  This ensures that your custom synchronization logic only runs for the relevant signal updates.  This feature prevents positions from being opened or closed until your synchronization logic finishes, giving you complete control.

## Function listenSync

This function lets you react to events when a trade signal is being processed, like when a trade is about to be opened or closed. It's particularly helpful when you need to coordinate with other systems, for example, updating an external database or sending a notification. The key here is that it pauses the trading process until your function finishes, ensuring everything stays in sync. You provide a function that gets called when a synchronization event occurs, and it will handle any promises returned by that function, waiting for them to resolve before continuing the trade.

## Function listenStrategyCommitOnce

This function lets you react to changes in your trading strategy, but only once and then stops listening. You provide a rule—a filter—that defines which changes you're interested in. Once a matching change happens, a specific function you provide will run, and the listener automatically disappears. It's a quick way to respond to a single, particular event within your strategy’s lifecycle.

Essentially, it's like setting up a temporary alert for a specific strategy action. 

You tell it what kind of event you're looking for and what you want to do when it happens. After that, it handles the listening and stopping for you.


## Function listenStrategyCommit

This function lets you keep an eye on changes happening to your trading strategies. It's like setting up a notification system that tells you when things like scheduled orders are canceled, signals are closed, or stop-loss and take-profit levels are adjusted. 

The events are handled one after another, even if your notification code takes some time to run, making sure everything is processed in the correct order. This queued approach prevents potential issues that could arise if multiple notifications were processed at the same time. You provide a function that will be called whenever one of these strategy events occurs, and this function receives details about the event. Importantly, the function you provide will be unsubscribed when you are done with the subscription.

## Function listenSignalOnce

This function lets you listen for specific trading signals and react to them just once. It's a way to monitor the market for a particular condition and take action immediately when it appears. Once the condition is met, the listener automatically stops listening, preventing unwanted repeated actions. You provide a filter to define what signals you're looking for, and a function to execute when that signal arrives. This is handy when you need to respond to a single, specific event in your trading strategy.


## Function listenSignalNotifyOnce

This function lets you set up a listener that only runs once for specific signal events. You tell it what kind of events you're interested in using a filter function. When a matching event arrives, it calls your provided function to handle it, and then it automatically stops listening. This is perfect for tasks where you only need to react to an event a single time. 

Essentially, it’s a temporary listener that simplifies reacting to a specific event only once.


## Function listenSignalNotify

This function lets you listen for notifications whenever a trading strategy sends out a user-defined note about an open position. Think of it as a way to get alerted when a strategy wants to communicate something specific about its trades. 

The notifications are handled in order, even if the function you provide takes some time to process them – this makes sure nothing gets missed or jumbled up. 

To use it, you simply give it a function that will be called each time a signal notification is available. When you're done listening, you can unsubscribe using the function that’s returned.


## Function listenSignalLiveOnce

This function lets you temporarily listen for specific trading signals coming from a live strategy execution. You provide a filter to define which signals you're interested in, and a callback function that will be executed just once when a matching signal arrives. It's perfect for quickly reacting to a certain event during a live test without needing to manage subscriptions yourself – the function automatically cleans up after itself. It only works with signals generated during a `Live.run()` process.


## Function listenSignalLive

The `listenSignalLive` function lets you listen for real-time trading signals coming from a live strategy execution. It's like setting up an observer pattern, but specifically for events generated when your strategy is actively trading.

This function ensures that signals are processed one after another, in the order they arrive, preventing potential race conditions or unexpected behavior.

You provide a callback function that will be triggered whenever a new signal event occurs. This callback receives information about each event, allowing you to react and potentially update your UI or perform other actions. Note that this only works with signals from strategies actively running using `Live.run()`.


## Function listenSignalBacktestOnce

This function lets you set up a listener that reacts to specific events generated during a backtest. Think of it as a temporary ear, tuned to only hear certain signals coming from the backtest process. It's designed to execute a function just once when a matching event occurs, then automatically stops listening. You provide a filter to specify which events you're interested in, and a callback function to handle those events. Once the callback runs, the listener quietly disappears, ensuring it doesn't interfere with other parts of your application.


## Function listenSignalBacktest

This function lets you react to events happening during a backtest. Think of it as setting up a listener that gets notified whenever a significant event occurs, like a trade being executed or a new bar appearing.

It's important to note that you'll only receive notifications from backtests that are actively running using `Backtest.run()`.

The events are handled in the order they come in, meaning they're processed one after another, guaranteeing a sequential flow of information. To stop listening, simply call the function returned by `listenSignalBacktest`.


## Function listenSignal

This function lets you register a listener that will be notified whenever a trading strategy generates a signal, like when it decides to buy, sell, or hold an asset.

The listener you provide will receive updates on the strategy's actions, including when it's idle, when a trade is opened, when it's active, and when a trade is closed.

Importantly, the updates are delivered one at a time, even if your listener function takes some time to process each event. This sequential processing ensures that events aren't missed or handled out of order.

The function returns another function that, when called, will unsubscribe your listener, effectively stopping the notifications.


## Function listenSchedulePingOnce

This function lets you react to specific "ping" events and then automatically stop listening. You tell it what kind of ping you're looking for using a filter—a little test that the ping must pass. Once a ping matches your filter, the function runs the code you provide, and then it silently stops monitoring for more pings. It's perfect when you only need to react to a certain condition once and then move on.


## Function listenSchedulePing

This function lets you set up a listener to receive periodic "ping" notifications while your scheduled signals are being monitored, essentially while they're waiting to become active. Think of it as a heartbeat signal confirming the monitoring process is still running.

You provide a callback function that will be executed whenever a ping is received. This lets you build custom checks or logging around the signal's lifecycle as it moves toward activation.

The listener is established and then immediately returned, allowing you to unsubscribe from those ping events when they're no longer needed.


## Function listenRiskOnce

This function allows you to temporarily monitor for specific risk rejection events. 

You provide a filter – a test to see if an event is relevant – and a function to execute when a matching event occurs.

Once that matching event is detected, the function automatically stops listening, ensuring it only acts once. This is great for situations where you need to react to a particular risk rejection just once and then move on. 

Essentially, it’s a one-time subscription to risk rejection events based on your defined criteria.


## Function listenRisk

This function allows you to be notified whenever a trading signal is blocked because it violates risk rules. Think of it as a way to react to situations where a potential trade is deemed too risky.

It only sends notifications when a signal is *rejected* – you won't be flooded with events for trades that are perfectly safe.

The events are delivered in the order they happened, and the code handles them one at a time to prevent problems caused by multiple trades happening at once. To receive these notifications, you provide a function that will be called whenever a risk rejection occurs, and this function receives information about the rejected trade event. When you are done listening, you can call the returned function to unsubscribe.


## Function listenPerformance

This function lets you monitor how long different parts of your trading strategy take to run. It's like having a built-in profiler that sends you updates as your strategy executes.

You provide a function that gets called whenever a performance metric is recorded, allowing you to track timing information and pinpoint any slow spots in your code. The data is delivered in order, and even if your callback function takes some time to process, it won't interrupt other performance events. Think of it as a queue that makes sure everything is handled one step at a time. This is helpful for identifying areas where your strategy might be running slower than expected.


## Function listenPartialProfitAvailableOnce

This function lets you monitor for specific profit-related events in your trading strategy and react to them just once. You provide a filter to define exactly which events you're interested in, and a function that will be executed when a matching event occurs. After that single execution, the listener automatically stops listening, so you don’t have to manage the subscription yourself. It's a simple way to ensure you only react to a particular profit condition once during your backtest.

The `filterFn` lets you specify criteria for the events you want to capture.  The `fn` is the action your code will take when an event passes the filter.


## Function listenPartialProfitAvailable

This function lets you be notified when your trading strategy hits certain profit levels, like 10%, 20%, or 30% gain.  It ensures these notifications happen one at a time, even if the function you provide to handle them takes some time to complete. Think of it as setting up a listener that gets triggered at profit milestones and then carefully manages how those triggers are handled. You simply provide a function that gets called each time a profit level is reached, receiving information about the event.  The function you provide will be responsible for reacting to these profit milestones.


## Function listenPartialLossAvailableOnce

This function lets you react to specific changes in your trading account's partial loss availability, but only once. Think of it as setting up a temporary alert – it listens for a condition you define, triggers an action when that condition is met, and then stops listening. It's perfect for scenarios where you need to respond to a particular loss level just once and then move on. You provide a filter that describes the event you’re interested in and a function to execute when that event occurs. Once that single event is detected, the subscription is automatically cancelled. 


## Function listenPartialLossAvailable

This function lets you be notified when your trading strategy experiences certain levels of loss, like 10%, 20%, or 30% of its initial capital. 

It's like setting up an alert system for significant downturns.

The function provides a way to register a callback that will be executed when these loss milestones are hit. Importantly, events are handled one at a time to avoid unexpected behavior when the callback itself takes some time to complete, ensuring a reliable and ordered processing of these alerts. The function returns an unsubscribe function that can be called to stop receiving these notifications.


## Function listenMaxDrawdownOnce

This function allows you to set up a listener that reacts to maximum drawdown events, but only once. You provide a filter that defines which drawdown events you're interested in, and a function that will be executed when a matching event occurs. Once that single event is processed, the listener automatically stops, preventing it from triggering again. It's ideal for situations where you need to respond to a specific drawdown condition just one time.

The filter function lets you specify the exact conditions that need to be met before the callback function runs. The callback function then handles the actual event data once the filter criteria are satisfied.


## Function listenMaxDrawdown

This function lets you monitor when a trading strategy reaches a new maximum drawdown. Think of it as setting up an alert to be notified whenever the strategy's losses reach a record level.

It ensures that these alerts are processed one at a time, even if your response to the alert involves asynchronous operations.

You provide a function that will be called whenever a new maximum drawdown is detected. This is perfect for things like adjusting trade sizes or implementing other risk management strategies based on how the strategy is performing. It’s a way to stay informed and react to potential problems in real-time.


## Function listenIdlePingOnce

This function lets you react to idle ping events – think of them as signals that nothing much is happening in your system – but only once for each matching event. You provide a rule (`filterFn`) to decide which pings you're interested in. When a ping matches your rule, a function (`fn`) you provide is called.  Once that function has run once, the subscription automatically stops. This is handy for things like triggering a one-off action when the system is quiet. The function returns a cleanup function that you can call to manually unsubscribe from these events if needed.

## Function listenIdlePing

This function lets you listen for moments when the backtest kit is completely idle, meaning no trades are pending or scheduled. Think of it as a signal that everything's quiet and the system is ready for the next action. You provide a function that will be called whenever this idle state is detected, and that function will receive information about the idle ping event. When you’re done listening, the function returns another function which you can call to unsubscribe from these events.

## Function listenHighestProfitOnce

This function lets you react to a specific moment when the trading system achieves its highest profit yet. You provide a condition – a filter – that determines when this event is recognized. Once that condition is met, a function you specify is executed just once, and then the listener automatically stops. It's a convenient way to trigger actions when a certain profit milestone is reached without continuously monitoring.

You define what constitutes a "highest profit" event with the `filterFn`, and then specify what action to take when that event occurs using the `fn`. The listener is temporary, executing your callback only once and then shutting itself off.


## Function listenHighestProfit

This function lets you monitor for moments when a trading strategy achieves a new peak profit. It's like setting up a listener that gets notified whenever the strategy’s profit reaches a record high. The notifications are delivered one at a time, even if the processing of each notification takes some time, ensuring events are handled in the order they occur. This makes it perfect for things like celebrating milestones or automatically adjusting your strategy based on performance. You provide a function that will be executed each time a new highest profit is reached. The function you provide will receive information about the contract that triggered the highest profit event. When you’re done monitoring, the function returns another function that you can call to unsubscribe.

## Function listenExit

This function lets you monitor for severe errors that will stop the testing process. It's designed for those critical, unrecoverable problems that arise during background tasks like live trading, backtesting, or data walking. If an error of this type occurs, the testing framework will notify your provided function.

The function ensures errors are handled one at a time, even if your callback involves asynchronous operations. It essentially provides a way to be alerted when things go seriously wrong and halt the process.

You provide a function that will be called when a fatal error is detected, and that function will receive information about the error. The `listenExit` function itself then returns a function that can be called to unsubscribe from these fatal error notifications.

## Function listenError

This function lets you monitor and react to errors that happen while your trading strategy is running, but aren’t severe enough to stop the entire process. Think of it as a safety net for temporary hiccups like API connection problems.

It registers a function that will be called whenever a recoverable error occurs.

The key here is that these errors are handled without interrupting your strategy's flow.

Errors are handled one at a time and in the order they happen, even if the function you provide takes some time to run. This makes sure things don't get out of control quickly.


## Function listenDoneWalkerOnce

This function lets you react to when a background process within the backtest framework finishes, but only once. It allows you to specify a condition – a filter – that determines which completion events trigger your reaction.  You provide a function that checks if an event meets your criteria, and another function that gets executed when a matching event occurs. After that single execution, the subscription is automatically removed, preventing further callbacks. This is perfect for tasks like logging a single final result or performing a cleanup action after a specific background task completes.


## Function listenDoneWalker

This function lets you be notified when a background task within a Walker completes. Think of it as a way to listen for signals that a process has finished. It guarantees that the notification happens one at a time, even if the notification itself involves some asynchronous operations. You provide a function that gets called when the background task is done, and this function will be executed sequentially, ensuring a controlled and ordered flow of events.


## Function listenDoneLiveOnce

This function lets you react to when a background task, started with `Live.background()`, finishes. It’s like setting up a temporary alert that only goes off once when a specific condition is met. You provide a filter to decide which completions you care about, and a function to run when that specific completion happens. Once the function runs, it automatically removes itself, so you don't have to worry about cleaning up your subscription. 

Essentially, it's a quick and easy way to get notified about a single, filtered completion event from a background process.


## Function listenDoneLive

This function lets you monitor when background tasks initiated by `Live.background()` finish running. 

Think of it as setting up a listener to be notified when a task is truly done. 

The events are delivered one after another, and even if your notification code takes time (like an asynchronous operation), it's handled in a way that prevents overlapping executions. To stop listening, simply call the function that's returned by `listenDoneLive`.

## Function listenDoneBacktestOnce

This function lets you react to when a backtest finishes running in the background, but only once. You provide a condition – a function that checks if the backtest event matches what you’re looking for – and then a callback function that will execute when a matching event occurs. Once that event is handled, the subscription is automatically removed, so you won't be notified again.

It’s useful when you need to perform a single action immediately after a specific background backtest completes, like updating a progress bar or saving results.

Here’s a breakdown of how it works:

*   **`filterFn`**: This is like a "gatekeeper." It decides whether the completed backtest event is relevant to what you want to do.
*   **`fn`**:  This is the action that gets performed when the gatekeeper lets the event through. It’s your callback function.


## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. 

Think of it as subscribing to an event that signals the backtest is done.

It ensures that when the backtest concludes, your code gets the signal in a controlled and sequential manner, even if your code needs to do some asynchronous work in response. This queued approach prevents unexpected issues arising from multiple callbacks trying to run at the same time. You provide a function (the `fn`) that will be executed when the backtest completes, and this function itself returns another function that you can use to unsubscribe from the event.

## Function listenBreakevenAvailableOnce

This function lets you set up a listener that reacts to breakeven protection events, but only once. You provide a filter to specify the exact conditions you're interested in, and a function to execute when those conditions are met. Once the event that satisfies your filter appears, the callback runs, and the listener automatically stops listening – perfect for reacting to a single, specific breakeven situation.

It's a way to react to a condition and then forget about it.

You define what events you're looking for with `filterFn`, and tell it what to do when that event is found with `fn`. 


## Function listenBreakevenAvailable

This function allows you to be notified whenever a trade's stop-loss automatically adjusts to breakeven – meaning it's moved to the price you initially bought at. This typically happens when the trade has made enough profit to cover any fees or slippage. The system ensures these notifications are handled one at a time, even if your notification process takes some time to complete, preventing any potential issues from multiple callbacks running simultaneously. You provide a function that will be called with details about the trade that reached breakeven. The function returns another function that you can call to unsubscribe from these notifications.

## Function listenBacktestProgress

This function lets you monitor the progress of a backtest as it runs. It's like getting updates on what's happening step-by-step. The updates are delivered in order, and the framework handles any delays caused by your code processing those updates. This ensures things stay stable and predictable while the backtest is running. To use it, provide a function that will be called with information about each progress update. When you're finished tracking the progress, you can unsubscribe using the function returned by `listenBacktestProgress`.

## Function listenActivePingOnce

This function lets you quickly react to a specific event within a stream of active ping signals and then stop listening. You provide a filter to define exactly which ping events you're interested in. Once an event matching your filter arrives, the provided callback function is executed just once, and the subscription is automatically stopped. This is handy if you need to wait for a particular condition to be met within those ping signals. 

It accepts a function to identify the events of interest and another function to handle the first matching event. The first function decides if event matches the criteria and the second function handles the event.


## Function listenActivePing

This function allows you to keep an eye on active signals within the backtest-kit framework. It will notify you every minute about the status of pending signals, giving you a way to monitor their lifecycle.

Importantly, any code you put inside the callback function will run one at a time, ensuring things don't get out of order or overwhelm your system, even if your callback involves asynchronous operations. You provide a function that will be called with details about each active ping event, enabling you to build logic around managing these signals.


## Function listWalkerSchema

This function helps you discover all the different ways your backtest-kit framework is configured to analyze data. Think of it as a way to see a list of all the "walkers" that are set up to process your trading data – essentially, a catalog of analysis methods. You can use this to inspect how your system is built, generate documentation, or create user interfaces that adapt to the available analysis options. It's a handy tool for understanding and troubleshooting your setup.


## Function listStrategySchema

This function helps you discover all the trading strategies currently set up within your backtest-kit environment. It essentially gives you a complete inventory of the strategies you’ve defined. Think of it as a way to peek under the hood and see what options are available for backtesting. You can use this information for things like generating documentation or building user interfaces that dynamically display available strategies. It fetches the registered strategy schemas, which are essentially the blueprints for how each strategy operates.


## Function listSizingSchema

This function lets you see all the sizing strategies you’ve set up within your backtest kit. It returns a list of configurations, allowing you to inspect them or build tools that adapt to your sizing rules. Think of it as a way to get a complete overview of how your orders will be sized during backtesting. It’s handy for making sure your configurations are as you expect and for creating helpful visuals that show these settings.

## Function listRiskSchema

This function helps you see all the risk configurations currently in use within your backtest. It essentially gives you a list of all the risk schemas that have been added, allowing you to inspect them for debugging purposes or to create tools that dynamically display this information. Think of it as a way to get a clear overview of how risk is being managed in your backtest. You can use this to understand the current setup or generate documentation.

## Function listMemory

The `listMemory` function lets you retrieve a list of previously stored data entries, kind of like checking a history log. It’s designed to work with data structures you define, making it flexible for different types of information. The function uses a "bucketName" to organize these entries, helping you manage related data together.  It handles the context of where your backtest or live trading is happening automatically, so you don’t have to specify that. Essentially, it's a convenient way to access and review stored signal data.


## Function listFrameSchema

This function helps you discover all the different types of data structures (schemas) that your backtest kit is working with. It essentially provides a catalog of all the registered schemas, allowing you to inspect them for debugging purposes or to build tools that dynamically adapt to the data being used. Think of it as a way to see what kind of information your trading system is handling. The function returns a list of these schemas, which you can then use to understand or interact with the data flow in your backtest.

## Function listExchangeSchema

This function provides a way to see all the different exchanges your backtest-kit setup recognizes. It returns a list detailing each exchange, allowing you to understand what data sources are available for your trading simulations. Think of it as a quick inventory of your supported exchanges – helpful for troubleshooting or when you want to display a selection of exchanges in a user interface. You can use this to quickly see what exchanges are configured within your backtest-kit environment.

## Function hasTradeContext

This function helps you determine if your code is running within a trading environment. 

Essentially, it verifies if both the execution and method contexts are active. 

You'll need this check before using functions that interact with the exchange, such as retrieving candle data or formatting prices. If this function returns `true`, it means you're in a valid trading context and can safely use those exchange functions.


## Function hasNoScheduledSignal

This function, `hasNoScheduledSignal`, helps you determine if a trading signal is currently scheduled for a specific symbol, like "BTCUSDT". 

It returns `true` if no signal is scheduled, meaning it’s safe to proceed with generating a new one. Think of it as the opposite of `hasScheduledSignal`; use it to ensure you don’t accidentally create duplicate signals.

The function knows whether it's running in a backtest or a live trading environment, so you don't need to worry about that configuration.  You simply provide the symbol you're interested in, and it tells you whether a signal is pending.

## Function hasNoPendingSignal

This function, `hasNoPendingSignal`, checks if there's currently no pending signal for a specific trading pair, like BTC-USDT. It’s designed to be the opposite of `hasPendingSignal`, so you can use it to make sure you're not generating new signals when one is already waiting to be executed. The function smartly determines whether it’s running in a backtesting environment or a live trading scenario without you needing to specify. You simply provide the symbol of the trading pair you're interested in.

## Function getWalkerSchema

This function helps you find the blueprint for how a specific trading strategy, or "walker," operates within the backtest-kit framework. Think of it as looking up the detailed instructions for a particular strategy. You provide the walker's name, and it returns a structured description of that walker, outlining its components and how it functions. This allows you to understand and potentially modify or extend existing strategies. The name you provide must match a walker that has already been registered within the system.

## Function getTotalPercentClosed

This function helps you understand how much of a trading position you still have open. It tells you the percentage of the original position size that remains, with 100% meaning the entire position is still active and 0% meaning it's completely closed.

The calculation is smart enough to consider any dollar-cost averaging (DCA) entries that were made when closing portions of the position.

It works seamlessly whether you’re running a backtest or a live trade; it figures out the correct mode automatically.

You just need to provide the symbol of the trading pair you're interested in to get the percentage.

## Function getTotalCostClosed

This function helps you figure out how much you've spent on a position you still hold, like a stock you haven't sold yet. 

It calculates the total cost basis in dollars, taking into account any times you've partially closed the position and potentially bought more along the way (which is called dollar-cost averaging or DCA).

The function intelligently adjusts its behavior depending on whether the backtest is running in a simulated environment or in a live trading scenario.

You simply provide the trading pair's symbol, such as "BTCUSDT", and it will return the total cost basis.

## Function getTimestamp

This function, `getTimestamp`, gives you the current time. 

It’s useful for knowing exactly when a calculation or event is happening within your trading strategy.

If you’re running a backtest (analyzing historical data), it will return the timestamp of the timeframe you're currently looking at. If you're running live, it will give you the actual, real-time timestamp.

## Function getSymbol

This function allows you to retrieve the symbol you're currently trading, like 'AAPL' or 'BTCUSDT'. It's a simple way to know what asset your backtest or live trading is focused on.  The function returns a promise that resolves to the symbol as a string.

## Function getStrategySchema

The `getStrategySchema` function helps you find information about a specific trading strategy you've set up within the backtest-kit framework. Think of it as looking up the blueprint or definition for that strategy. You provide the strategy's name, and the function returns a structured description of it, detailing things like the inputs it expects and the calculations it performs. This allows you to understand and potentially modify or validate the strategy’s configuration.


## Function getSizingSchema

This function helps you access pre-defined sizing strategies within the backtest-kit framework. Think of sizing as how much of your capital you'll allocate to each trade. 

You provide a name – a unique identifier – for the sizing strategy you want to use. 

The function then returns all the details about that specific sizing strategy, letting you understand its behavior and how it will influence your backtesting results. It’s useful for exploring the different sizing options available and for understanding the logic behind how position sizes are determined.

## Function getSignalState

This function lets you retrieve a specific value associated with a trading signal. It's designed to work with systems that track data over time, like those using Large Language Models (LLMs) to make trading decisions.

It automatically finds the currently active trading signal, so you don’t have to worry about that. If there’s no active signal, it will give you a warning and use a default starting value.

The function adapts to whether you're running a backtest (testing historical data) or a live trade.  It's particularly useful for accumulating details from each trade—things like the maximum profit, how long a trade lasted, and other metrics—to help refine your strategy.  The examples mention trades that can handle moderate losses with good potential gains, or trades designed to avoid losses altogether. A key rule is to close a trade if it’s been open for a certain amount of time and hasn’t reached a certain profit level.

You'll need to provide the symbol of the trading pair (like "BTC-USD") and a starting value for your data.

## Function getSessionData

This function lets you access data specifically tied to a trading session, like a particular symbol, strategy, exchange, and timeframe. Think of it as a way to store information that needs to be remembered between candles within a backtest or even across restarts in live trading. This is ideal for things like saving the results of complex calculations or keeping track of indicator values that need to be consistent. The framework intelligently determines whether it's running a backtest or live, so you don’t need to worry about adjusting your code. To use it, you just provide the symbol of the trading pair you're working with, and it returns the stored data if it exists, or null if it doesn't.

## Function getScheduledSignal

This function lets you check if a scheduled signal is currently running for a specific trading pair. 

It’s designed to work whether you’re running a backtest or a live trade, figuring out the correct context automatically.

If a scheduled signal is active, it will return information about that signal. Otherwise, it will tell you that no signal is scheduled. To use it, you simply provide the symbol of the trading pair you’re interested in.


## Function getRiskSchema

This function helps you find the specific details and rules associated with a particular type of risk within your trading strategy. Think of it as looking up the blueprint for how a certain risk is managed. You provide the name of the risk you're interested in, and the function returns a structured object that describes it, including things like what factors are considered and how to calculate it. It’s useful for understanding how different risks are defined and controlled within the backtest framework.


## Function getRawCandles

The `getRawCandles` function allows you to retrieve historical candlestick data for a specific trading pair and timeframe. You can control how many candles you get and precisely define the date range you're interested in.

It's designed to be safe and reliable, making sure your data doesn't include information from the future, which is crucial for accurate backtesting.

You can specify a combination of parameters to tailor your request:  providing both a start and end date with a limit, providing just a start and end date, or defining a number of candles to fetch from a specific point. If you only provide a limit, the function will look backward from the current execution context to retrieve the requested number of candles.

Here’s what the parameters mean:

*   `symbol`: The trading pair you're interested in (like "BTCUSDT").
*   `interval`: The timeframe for the candles (e.g., "1m" for one-minute candles).
*   `limit`: How many candles you want.
*   `sDate`: The starting date and time for the data you want, represented as milliseconds since the epoch.
*   `eDate`: The ending date and time for the data, also in milliseconds.

## Function getPositionWaitingMinutes

This function helps you understand how long a trading signal has been waiting to be executed. It checks a specific trading pair, like "BTCUSDT," and tells you the number of minutes it's been pending.

If there isn’t a pending signal for that trading pair, it will return null, letting you know nothing is currently waiting. 

You provide the trading pair's symbol as input to the function.


## Function getPositionPnlPercent

This function helps you quickly check how your open positions are performing financially. It calculates the unrealized profit or loss as a percentage of your initial investment for a specific trading pair.

Think of it as a snapshot of your position's health, factoring in things like partial closes, average entry prices (DCA), potential slippage, and trading fees.

If there’s no open position related to the specified trading pair, it will return null. The function intelligently determines whether it’s running in a backtest or live trading environment and automatically gets the current market price for accurate calculations. You just need to provide the trading pair symbol to see the percentage.


## Function getPositionPnlCost

This function helps you understand how much profit or loss you're currently holding on a trade. It looks at the difference between your purchase price and the current market price for a specific trading pair.

Essentially, it calculates the unrealized profit or loss in dollars for an open position. 

The calculation considers factors like partial closes of positions, dollar-cost averaging, potential slippage, and trading fees, giving you a comprehensive view.

If there isn't an active trade position, the function will return null. It handles figuring out if the system is in backtesting or live mode and automatically gets the current price for you. You just need to provide the symbol of the trading pair you’re interested in, like 'BTC-USDT'.

## Function getPositionPartials

This function helps you track how your trading positions have been partially closed. It gives you a history of any partial profit or loss actions you’ve taken, like when you've used `commitPartialProfit` or `commitPartialLoss`.

If there's no active trade happening, the function won't return anything. If trades are happening but haven't had any partial closes yet, it will return an empty list.

For each partial close, you'll get details like the type of closure (profit or loss), the percentage of the position closed, the price used for the closure, the cost basis at that time, and the number of entries involved in the partial close. The `symbol` parameter specifies the trading pair you're interested in.

## Function getPositionPartialOverlap

This function helps determine if a new trade would overlap with a previously executed partial close. It checks if the current market price falls within a defined tolerance range around the price used for any existing partial closes. 

Think of it as a safety check to avoid accidentally closing out a position twice at roughly the same price level.

The function returns true if there's an overlap, meaning a partial close could be triggered. Otherwise, it returns false, indicating no conflict.

You provide the trading symbol and the current price you want to evaluate. Optionally, you can configure the tolerance range (the "ladder") to fine-tune the sensitivity of the check. If no partial closes have happened yet, the function will also return false.

## Function getPositionMaxDrawdownTimestamp

This function helps you find out exactly when a specific trading position hit its lowest point, measured as a timestamp. It's useful for understanding the risk profile of a trade – you can see when the most significant drawdown occurred.

To use it, you simply provide the trading symbol of the position you're interested in.

If there's no active trading signal for that symbol, the function will return null.

## Function getPositionMaxDrawdownPrice

This function helps you understand how much a particular trade lost its value at its lowest point. It looks at a specific trading pair, like BTC/USD, and tells you the lowest price it reached while the position was open. If there isn't a trade happening for that pair, it won't be able to give you a number, and will return null instead. You provide the symbol of the trading pair you're interested in, and it will give you the maximum drawdown price for that position.


## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand the risk associated with a specific trading position. It calculates the maximum drawdown in percentage terms, specifically focusing on the position's profit and loss (PnL). Essentially, it tells you the lowest PnL percentage the position experienced from its inception until the point of its greatest loss.

To use it, simply provide the trading pair symbol you’re interested in.

If no signals are currently pending for that symbol, the function will return null, indicating it can't calculate the drawdown in that situation.

## Function getPositionMaxDrawdownPnlCost

This function helps you understand the potential impact of significant losses on a specific trading position. It calculates the financial cost, expressed in the quote currency, associated with the lowest point of a position’s performance. Essentially, it tells you how much you would have lost at the worst price during the position's entire lifetime. You provide the trading pair symbol, like 'BTC-USD', and the function returns that cost as a number. If there’s no active trading signal for that symbol, the function will return null.


## Function getPositionMaxDrawdownMinutes

This function helps you understand the timing of a trade's worst performance. It tells you how many minutes have passed since the point where the trade reached its lowest value. 

Think of it as a way to gauge how recently a trade experienced a significant loss. 

The value will be zero if the drawdown occurred right at the moment you're checking. If no signal exists for the specified trading pair, the function returns null. You just need to provide the symbol of the trading pair to get this information.

## Function getPositionLevels

getPositionLevels retrieves the prices at which you’ve entered into a position using dollar-cost averaging (DCA). 

It provides a list of prices, starting with the initial purchase price and including any subsequent prices added through commitAverageBuy.

If no trades are pending, the function will return null. If only the initial trade price exists, you'll receive an array containing just that price. 

You'll need to provide the symbol (like 'BTCUSDT') to specify which trading pair to check.

## Function getPositionInvestedCount

This function tells you how many times a DCA (Dollar-Cost Averaging) order has been executed for a specific trading pair. 

It essentially counts how many times the system has added to a position after the initial buy.

A value of 1 means it's just the initial order, while higher numbers indicate subsequent DCA steps.

If there's no pending order currently being worked on, the function will return null.

It seamlessly works in both backtesting and live trading environments, automatically adjusting based on the current context. To use it, simply provide the trading pair’s symbol, such as "BTCUSDT."

## Function getPositionInvestedCost

This function helps you figure out how much money you've committed to a trade. Specifically, it calculates the total cost basis for the current order you're working on, expressed in dollars. 

Think of it as adding up all the individual costs associated with each step of placing that order – those costs were originally defined when you committed to the average buy. 

If there isn’t an order in progress, the function will return null, indicating that no cost basis can be determined. It intelligently figures out whether it's running in a backtesting scenario or a live trading environment.

You provide the trading pair’s symbol, like 'BTC-USDT', to identify which trade's cost you want to know.


## Function getPositionHighestProfitTimestamp

This function helps you find out exactly when a specific trading position reached its highest profit. It looks at the history of a position for a particular trading pair (like BTC/USDT) and tells you the precise timestamp when the price was most favorable. If there’s no data available for that position, it will return null. You just need to tell it which trading pair you’re interested in to get this valuable historical information.

## Function getPositionHighestProfitPrice

This function helps you find the highest price your open position has reached while potentially making a profit. 

It essentially remembers the best price movement in your favor since you started the trade. 

For long positions, it tracks the highest price above your entry price. For short positions, it tracks the lowest price below your entry price.

You'll always get a price back—it will be at least your initial entry price—and it won’t return anything if there's no active trade. The symbol you're trading is the only input it needs.

## Function getPositionHighestProfitMinutes

This function helps you understand how long a trading position has been operating below its most profitable point. It calculates the time, in minutes, since the position reached its highest profit. 

Think of it as a way to gauge how far a position has fallen from its peak; it's essentially the same information as tracking the time since a drawdown started.

The value will be zero if the function is called at the precise moment the position achieved its maximum profit. 

If no trading signals are currently active for the specified symbol, the function will return null. You just need to provide the trading pair symbol to get the data.

## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position is from its best performance. 

It calculates the difference between the highest profit percentage achieved for a specific trading pair and the current profit percentage. 

Essentially, it shows you how much room there is for potential gains based on past performance. 

If there’s no trading signal currently active, the function will return null. You provide the trading pair symbol (like "BTC-USD") to get the calculation for that specific asset.


## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your current trading position is from its best potential profit. It calculates the difference between the highest profit achieved so far and the current profit, ensuring the result is always a positive number or zero. 

Think of it as measuring the "distance" to the peak of your profit journey.

If there are no pending signals for the trade, this function won't be able to calculate anything and will return null.

You provide the trading pair symbol (like 'BTC-USDT') to specify which position you want to analyze.


## Function getPositionHighestProfitBreakeven

This function checks if a trade could have reached a breakeven point based on the highest profit achieved. It examines the trading data for a specific symbol to determine if reaching breakeven was mathematically possible given the prices attained. If there are no active trade signals for that symbol, the function will indicate that. You provide the symbol of the trading pair as input, and it will return a boolean value – true if breakeven was achievable at the highest profit, and false otherwise.


## Function getPositionHighestPnlPercentage

This function helps you understand how well a specific trade performed. It looks at a past trading position and finds the highest percentage profit it ever reached. 

Essentially, it tells you the peak performance of that trade, expressed as a percentage.

To use it, you provide the trading symbol (like "BTCUSDT") and the function will return that highest percentage profit. 

If there's no record of signals for that symbol, it won't be able to provide a value and will return null.


## Function getPositionHighestPnlCost

This function helps you find the highest cost associated with the profit realized during a trading position’s lifetime. It looks at a specific trading pair, like BTC-USDT, and returns the amount of quote currency (like USDT) that was spent when the most profitable price for that position was achieved. If there’s no pending signal related to the position, the function will return null, meaning it couldn't find that information. Essentially, it’s a way to understand the expense tied to achieving peak profitability for a trade.

## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand how much your trading position has lost from its peak. It calculates the difference between your current profit percentage and the lowest profit percentage it reached during a drawdown. 

Essentially, it tells you the potential downside risk still present in a position.

The result is expressed as a percentage, and if there's no active trading signal, it will return nothing. To use it, you simply provide the symbol of the trading pair you're interested in.

## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand the potential risk in a trading position. It calculates how far your current profit or loss is from the lowest point of its drawdown, essentially showing you the "distance" from a potential bottoming out. 

The result represents the potential PnL cost if the position were to recover from its worst downturn. 

If there's no active trading signal for the specified symbol, the function will return a null value, indicating it can't make the calculation. You need to provide the symbol of the trading pair you're interested in, like "BTC/USDT".


## Function getPositionEstimateMinutes

This function helps you understand how long a trading position is expected to last. It tells you the estimated duration, in minutes, for any currently active signal.

Essentially, it’s looking at the initial estimate made when the signal was created, which represents the maximum time the position might remain open before it automatically closes due to the time limit.

If there's no signal currently in progress, the function will return null.  You just need to pass in the symbol (like "BTCUSDT") to check the estimated time for that specific trading pair.

## Function getPositionEntryOverlap

This function helps you avoid making multiple entries at roughly the same price when using a dollar-cost averaging (DCA) strategy. It checks if the current market price aligns with any of your previously defined DCA entry levels, considering a small tolerance range around those levels. 

Essentially, it prevents you from placing a new DCA order if the price is already close to a previous one. 

The function takes the trading symbol and the current price as input, and optionally a configuration for the acceptable tolerance range. It returns `true` if the current price falls within that tolerance range of a previous DCA entry, and `false` otherwise. This helps maintain a consistent and controlled DCA execution.


## Function getPositionEntries

This function allows you to see the details of how a position was built, specifically the prices and costs associated with each step. It provides a record of each buy order, whether it was the initial purchase or a later DCA (dollar-cost averaging) step.

If there's no active trade signal, the function will return nothing. If the trade was started but no additional DCA orders were placed, you'll receive an array containing just one entry.

Each entry in the returned array gives you the `price` at which the order was executed and the `cost`—the dollar amount spent—for that particular trade. The function requires the `symbol` of the trading pair you're interested in.

## Function getPositionEffectivePrice

This function calculates the effective price, often called the DCA price, for your current trading position. It determines this price by averaging your costs, considering any partial trades you've made.

If you haven't used any DCA entries, the effective price will simply be the original opening price.

The function returns `null` if there’s no active signal, and it works seamlessly in both backtesting and live trading environments. 

To use it, you just need to provide the symbol of the trading pair you're interested in.

## Function getPositionDrawdownMinutes

This function tells you how much time has passed since your current trading position reached its highest profit point. It’s a way to track how far your position has fallen from its best performance. The longer the time reported, the more it’s moved away from that peak. When the position first hits its highest profit, the value will be zero. If there’s no active trade happening, the function won’t return a value. You'll need to provide the trading pair symbol to use it, for example 'BTCUSDT'.

## Function getPositionCountdownMinutes

This function helps you figure out how much time is left before a trading position expires. It looks at when a pending order was placed and calculates how long until its estimated expiration time.

The result is always a non-negative number representing minutes—it will be zero if the expiration time has already passed.

If there isn't a pending order associated with the symbol, the function will return null.

To use it, you simply provide the trading symbol you're interested in.

## Function getPositionActiveMinutes

This function helps you figure out how long a specific trading position has been open. It tells you the number of minutes the position has been active, essentially tracking its duration.

If there isn't a pending signal for that position, the function will return null, indicating that the calculation can't be performed. To use it, you'll need to provide the symbol of the trading pair you're interested in, such as 'BTCUSDT'. The function returns a promise that resolves to the number of active minutes or null.

## Function getPendingSignal

This function helps you find out what signal is currently waiting to be executed for a specific trading pair. Think of it as checking if a trade is already in the works. It returns the details of that pending signal if one exists, or nothing (null) if there isn't a signal waiting. Importantly, it figures out whether you’re running a backtest or a live trade without you needing to specify. You just provide the symbol of the trading pair you're interested in, like "BTCUSDT," and it does the rest.


## Function getOrderBook

This function retrieves the order book data for a specific trading pair, like BTCUSDT. 

You provide the symbol of the trading pair you're interested in, and optionally specify the desired depth of the order book – how many levels of bids and asks you want to see. 

The function automatically handles the timing based on the current environment, whether you're in a backtesting or live trading scenario. The exchange providing the data has the flexibility to use or disregard the timing information.


## Function getNextCandles

This function helps you get a batch of future candles for a specific trading pair and time interval. It's designed to pull data that comes *after* the current time the system is using.

You provide the symbol of the trading pair (like BTCUSDT), the candle interval (such as 15 minutes), and how many candles you want to retrieve.

The function then uses the exchange’s own methods to grab those future candles and returns them as an array. Essentially, it allows you to peek ahead in time to get more data for your trading strategies.


## Function getMode

This function tells you whether the trading framework is currently running a backtest (analyzing historical data) or operating in live trading mode. It returns a promise that resolves to either "backtest" or "live", allowing your code to adapt its behavior based on the environment it's in. Think of it as a way to check if you're practicing or actually trading.


## Function getMinutesSinceLatestSignalCreated

This function helps you determine how much time has passed since the last trading signal was generated for a specific trading pair. It essentially measures the cooldown period, regardless of whether that signal is still active.

It looks for that signal information first in the historical backtest data, and if it can't find it there, it checks the live data.

If no signal has ever been recorded for the given trading pair, it will return a null value.

The function automatically adapts to whether you're running a backtest or live trading scenario. 

You provide the trading symbol as input, like "BTCUSDT".

## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand the risk profile of your trading strategy. It calculates the maximum drawdown, expressed as a percentage of the peak profit achieved. Think of it as measuring how far your profits could have fallen from their highest point.

The result represents the difference between your best performance and your worst, ensuring it's never negative (always zero or greater).  If no trading signals are currently active, this function will return null, meaning it can't compute the drawdown. You provide the symbol of the trading pair to analyze, like "BTCUSDT".

## Function getMaxDrawdownDistancePnlCost

This function helps you understand the risk profile of a trading strategy by calculating the maximum drawdown distance based on profit and loss. It essentially tells you the largest difference between the highest profit you've seen and the lowest point you've reached during a trading period for a specific trading pair. The result represents the potential loss from peak profit to the deepest drawdown, ensuring it's never negative. If no signals exist for the specified trading pair, the function will return null. You provide the trading pair's symbol to the function, and it will compute the drawdown distance.

## Function getLatestSignal

This function helps you retrieve the most recent trading signal for a specific trading pair. It doesn't care whether the signal led to an open or closed trade – it just gives you the one that was recorded most recently.

You can use this to implement rules like preventing a new trade immediately after a stop-loss, by checking the time of the latest signal.

It looks for signals first in the historical backtest data and then checks the current live data. If there are no signals recorded at all for that symbol, it will return null.  The function intelligently determines whether it’s running in a backtest or a live trading environment.

The only input you need is the symbol of the trading pair, like "BTCUSDT".

## Function getFrameSchema

The `getFrameSchema` function lets you look up the structure of a specific frame within your backtest. Think of it as finding the blueprint for how data is organized in a particular stage of your trading simulation.  You provide the name of the frame you're interested in, and it returns a detailed description of its contents – what data fields it holds and their types. This is helpful for understanding the data available at each step of the backtest process. It uses a unique identifier to locate the correct frame schema.


## Function getExchangeSchema

This function lets you access details about a specific cryptocurrency exchange that backtest-kit knows about. Think of it as looking up the blueprint for how that exchange works within the testing environment. You provide the name of the exchange, and it gives you back a structured description of its data – things like what symbols are available and how order book data is formatted. This is helpful for understanding how the framework interacts with different exchanges during backtesting.

## Function getDefaultConfig

This function provides you with a starting point for configuring your backtest. It returns a set of default settings that control various aspects of the backtesting process, such as how often data is fetched, limits on signal generation, and settings for displaying results. Think of it as a template—you can use these default values as-is, or modify them to fine-tune the backtest to your specific needs. It's a great way to explore the different configuration options available and understand what they do.

## Function getDefaultColumns

This function provides a starting point for customizing the columns displayed in your backtest reports. It gives you a predefined set of column configurations – essentially, it tells you which columns are typically shown and how they're structured by default. Think of it as a template you can use to understand the available options for report generation. You can then modify this configuration to tailor your reports to display the specific data you need.

## Function getDate

This function, `getDate`, lets you retrieve the current date within your trading strategy. It's useful for time-sensitive calculations or conditions. 

During a backtest, it will give you the date associated with the specific historical timeframe being analyzed.  If you’re running in a live trading environment, it provides the actual current date. Essentially, it keeps your date information synchronized with how your code is running.

## Function getContext

This function provides access to the current execution context within a trading method. Think of it as a window into what's happening right now – it gives you information about the method, its environment, and the broader backtest process. It returns a promise that resolves to an object containing this contextual data.


## Function getConfig

This function lets you peek at the framework’s global settings. Think of it as getting a snapshot of all the behind-the-scenes numbers and flags that control how backtesting and trading runs.

It gives you a collection of values, such as limits on how often things happen, retry counts for data fetching, and controls for how much information gets displayed in reports.

Importantly, the returned configuration is a copy, so any changes you make won’t affect the actual running framework – it's safe to experiment and examine! It’s designed for viewing, not altering, the core operational settings.

## Function getColumns

This function lets you see the structure of the columns used for generating your trading reports. It gives you a snapshot of how the backtest, heatmap, live data, partial fills, breakeven points, performance statistics, risk events, scheduling, strategy actions, synchronization, highest profit, maximum drawdown, walker P&L, and strategy results are organized into columns. Think of it as a way to peek under the hood at how your report is built, ensuring you can understand and potentially customize it without changing the underlying system. The returned configuration is a copy, so your changes won't affect the core reporting setup.

## Function getClosePrice

This function allows you to retrieve the closing price of the most recent candle for a specific trading pair and timeframe. You provide the symbol, like "BTCUSDT" for Bitcoin against USDT, and the candle interval, such as "1h" for a one-hour candle. It will then return a promise that resolves to the closing price of that candle. This is useful for quickly checking the latest price action without pulling extensive historical data.


## Function getCandles

This function retrieves historical price data, presented as candles, from an exchange. You provide the trading pair, like "BTCUSDT," the desired time interval for the candles (e.g., 5 minutes, 1 hour), and how many candles you want to retrieve. The function will then pull this data from the connected exchange and return it to you as an array of candle objects. It essentially allows you to access past price movements for a specific trading pair over a chosen timeframe.

## Function getBreakeven

This function helps you determine if a trade has reached a point where it's made a profit large enough to cover transaction costs. It looks at the current price of an asset and compares it to a calculated threshold, which includes factors like slippage and fees. Essentially, it tells you if you’ve broken even on a trade, taking into account those extra costs. The function figures out whether it’s running in a testing environment or a live trading situation without you needing to specify. You provide the symbol of the asset being traded and the current price to check.

## Function getBacktestTimeframe

This function helps you find out the dates used for a backtest of a specific trading pair, like BTCUSDT. It returns a list of dates that represent the timeframe used in the backtest. Think of it as getting a quick overview of the historical data range your backtest is using. You just need to provide the symbol of the trading pair you're interested in, and it will give you back a list of dates.


## Function getAveragePrice

This function helps you find the Volume Weighted Average Price, or VWAP, for a specific trading symbol like BTCUSDT. 

It looks at the five most recent one-minute price candles to calculate this value, considering both the price and the trading volume for each candle. 

Essentially, it gives you a sense of the average price a symbol has traded at, weighted by how much was traded at each price. 

If there's no trading volume to work with, it will fall back to calculating a simple average of the closing prices instead. You just need to provide the symbol you're interested in, and the function returns a promise that resolves to the VWAP price.

## Function getAggregatedTrades

This function helps you retrieve a list of combined trades for a specific trading pair, like BTCUSDT. It pulls this data directly from the exchange you're connected to.

If you don't provide a limit, it will gather trades from within a defined time window.

If you specify a limit, it will fetch enough trades to meet that number, effectively providing a paginated result working backward in time. You can use this to get the most recent 'n' trades for a symbol.

## Function getActionSchema

This function helps you find the blueprint for a specific action within the backtest-kit framework. Think of it as looking up the definition of a particular trading action, like placing a buy order or selling a stock. You give it the name or identifier of the action you're interested in, and it returns a structured description of what that action entails, outlining the data it expects and how it should behave. This is useful when you need to validate or understand the details of an action being performed during a backtest.


## Function formatQuantity

This function helps you display the right amount of a trading asset, like Bitcoin or Ethereum, in a way that matches the rules of the specific exchange you're using. It takes the trading pair symbol, such as BTCUSDT, and the numerical quantity you want to show. It then formats that quantity to show the correct number of decimal places required by the exchange, ensuring it looks and behaves as expected. Basically, it does the tedious math for you so you don’t have to worry about getting the formatting wrong.

## Function formatPrice

The `formatPrice` function helps you display prices in the way the exchange expects. It takes a trading pair symbol, like "BTCUSDT," and the actual price value as input. It then uses the exchange's specific rules to format the price correctly, ensuring you show the right number of decimal places. This makes sure your displayed prices are consistent with the exchange itself.


## Function dumpText

The `dumpText` function lets you output raw text data, like logs or reports, associated with a specific signal.

It handles the technical details of knowing which signal the data belongs to and whether you're in a backtest or live trading environment, so you don't have to worry about that. 

You provide the function with information about the data you're dumping, including a bucket name, a unique ID, the actual text content, and a description to help you understand what the data represents. This is useful for recording events and debugging your trading strategies.


## Function dumpTable

This function helps you display data as a table within your trading analysis. It takes an array of objects, like the results of a calculation or a set of trades, and formats them neatly for viewing. It figures out which signal to attach the table to, and whether you're running a backtest or a live simulation. The table’s column headers are dynamically created based on all the different properties found in your data, ensuring a comprehensive and organized presentation. You just provide the data, a description, and the function handles the rest.


## Function dumpRecord

The `dumpRecord` function allows you to save a piece of data—think of it as a snapshot of information—to a designated storage area, associating it with the current trading signal. It's designed to be flexible, letting you store any kind of data you need using a simple key-value structure. 

The function handles the details of knowing where to save the data, adapting automatically to whether you’re in a testing or live trading environment. It will also automatically figure out which signal is active, taking care of the complexities of signal management for you. You simply provide the data, a description, and a unique identifier for the storage location.


## Function dumpJson

The `dumpJson` function lets you save complex data structures, like configurations or results, as a formatted JSON block associated with a specific bucket and identifier. Think of it as a way to record detailed information within your trading system.  It handles the technical details of signal management and automatically adjusts based on whether you're in a backtesting or live trading environment. You provide the bucket name, a unique identifier for the dump, the JSON data itself, and a description to help you understand what the data represents. This function is designed to be easy to use while ensuring data is correctly recorded and accessible.

## Function dumpError

The `dumpError` function helps you report and track errors occurring during your trading simulations or live executions. It essentially creates a record of the error, associating it with a specific data bucket and a unique identifier.

Think of it as sending a detailed error message along with context to a central logging system.

The function intelligently figures out whether you're running a backtest or a live trade and automatically connects the error report to the currently active trading signal, making it easier to pinpoint the source of the problem. You just provide the details of the error—what happened, a brief description, and where it's located—and the function handles the rest.


## Function dumpAgentAnswer

This function helps you save a complete record of an agent’s conversation, including all the messages exchanged. It's designed to capture a snapshot of the agent's activity within a specific signal.

The function automatically figures out whether it's running in a test environment (backtest) or a live environment, and handles finding the relevant signal for the data.

You provide a data object containing the bucket name, a unique identifier for the dump, the messages themselves, and a brief description of what's being captured. This allows for easy auditing and analysis of agent interactions.


## Function createSignalState

The `createSignalState` function helps you manage signals within your trading framework. It generates a pair of functions, `getState` and `setState`, that automatically adapt to whether you're in backtesting or live trading mode – you don’t need to manually specify the signal ID.

This is particularly useful for strategies that need to track data over time, like those driven by large language models (LLMs), where you want to accumulate details like peak percentage or how long a trade is open.

Think of it as a way to keep track of signal information in a structured and convenient way, specifically designed to work well with more complex trading logic.


## Function commitTrailingTakeCost

This function lets you change the take-profit price for a trade to a specific price level. It's designed to simplify the process of setting a fixed take-profit, automatically figuring out the percentage shift needed based on the original take-profit distance. It handles the details of determining whether you're in a backtest or live trading environment and also gets the current price for accurate calculations, so you don’t have to worry about those steps.

You provide the trading symbol and the new take-profit price you want. The function then adjusts the take-profit and returns true if successful, false otherwise.


## Function commitTrailingTake

The `commitTrailingTake` function is designed to dynamically manage your take-profit orders as the price moves. It lets you adjust the distance of your take-profit based on a percentage shift relative to the initially set take-profit level.

It's really important to understand this function always calculates changes based on the original take-profit, not the currently trailing one; this keeps things precise and avoids small errors from adding up.

The function is smart about updates – it won’t make your take-profit more aggressive; it only moves it closer to your entry price.

For long positions, the take-profit will only move down. For short positions, it will only move up.

Finally, it figures out whether it’s running in a backtest or live trading environment without you needing to specify.


## Function commitTrailingStopCost

This function helps you update the trailing stop-loss order for a specific trading pair to a fixed price. 

It simplifies the process by calculating the necessary percentage shift from the original stop-loss distance, so you don't have to do that math yourself. 

The function automatically figures out whether it's running in a backtest or live trading environment and gets the current price to make the adjustment accurately. You just need to provide the symbol of the trading pair and the desired new stop-loss price.


## Function commitTrailingStop

This function helps you manage trailing stop-loss orders for your trading signals. It lets you fine-tune how far your stop-loss is from your entry price, expressed as a percentage shift relative to the original stop-loss distance you set.

It's important to remember that the adjustment is always based on the *original* stop-loss, not any already adjusted trailing stop-loss, to avoid compounding errors.

The function prioritizes protecting your profits – it will only adjust the stop-loss if the new distance is actually better. When you’re long, the stop-loss will only move higher, and when you’re short, it will only move lower.

You don't need to worry about whether this is being used in a backtest or a live trading environment; the function handles that automatically.

You'll need to provide the trading pair symbol, the percentage shift you want to apply to the original stop-loss distance, and the current market price.


## Function commitSignalNotify

The `commitSignalNotify` function lets you send out informational messages about your trading strategy. Think of it as a way to provide extra context or annotations about what your strategy is doing – it won’t change your positions, but it's great for tracking decisions or triggering alerts.  

It automatically grabs important details like the trading symbol, strategy name, exchange, and timeframe from the current environment, and it even retrieves the current price.  You can also add extra details to your notification with the `payload` parameter. This is a straightforward way to log events during a trade or signal generation.

## Function commitPartialProfitCost

This function lets you automatically close a portion of your trading position when it reaches a certain profit level, measured in dollars.  Essentially, it’s a simplified way to take some profits along the way towards your ultimate target profit. 

It figures out the percentage of your position to close based on the dollar amount you specify, and handles the details of determining the current market price for you. It also intelligently adjusts its behavior whether you're running a backtest or a live trade.

You only need to provide the trading symbol and the dollar amount you want to close.

## Function commitPartialProfit

This function lets you automatically close a portion of your open trade when the price moves favorably, essentially locking in some profit. You specify the trading symbol and the percentage of your position you want to close – for example, closing 25% of your holdings. It's designed to work seamlessly whether you’re running a backtest or a live trading strategy, figuring out the environment on its own. Think of it as a way to protect profits as your trade moves toward its take profit target.

## Function commitPartialLossCost

This function helps you automatically close a portion of your trading position when it's experiencing a loss, specifically to move towards your stop-loss level. It simplifies the process by letting you specify the dollar amount you want to close, and it figures out the corresponding percentage of your position for you. It handles the details of knowing whether you're in a backtest or live trading environment and automatically gets the current price to calculate the closure. To use it, you just need to tell it the trading symbol and the dollar amount you want to close.

## Function commitPartialLoss

This function lets you automatically close a portion of your open position when the price is moving in a direction that would trigger your stop-loss. It's designed to help manage risk by reducing your exposure when the market isn’t going your way. 

You specify the symbol of the trading pair and the percentage of the position you want to close, for example, closing 25% of the position. The function takes care of knowing whether it's running in a backtesting environment or a live trading scenario. 


## Function commitClosePending

This function lets you finalize a pending trade signal without interrupting your trading strategy. Think of it as confirming and completing a previously placed order. It’s useful when you want to acknowledge a signal but still want the strategy to remain active and potentially generate new signals.

It doesn't impact any signals that are already scheduled or stop the overall strategy from running. 

You can optionally provide extra information like an ID and a note alongside the confirmation. The framework automatically figures out whether it's running in a backtest or live environment.


## Function commitCancelScheduled

This function lets you cancel a scheduled trading signal without interrupting the overall strategy. Think of it as hitting a pause button on a specific signal, rather than stopping the whole process. It’s useful when you want to temporarily disregard a signal that was previously queued, perhaps because market conditions have changed. This action won't impact any existing open signals or prevent the strategy from generating new ones – it’s a clean way to manage and adjust scheduled actions. The system intelligently determines whether it's running in a backtesting environment or live trading mode. You can also add optional details like an ID and a note to the cancellation for better tracking.

## Function commitBreakeven

This function helps manage your trading risk by automatically adjusting your stop-loss order. It moves your stop-loss to the original entry price – essentially eliminating risk – once the price has moved favorably enough to cover the costs associated with the trade, like slippage and fees.

Think of it as a safety net that kicks in when your trade is performing well. The specific price point where this happens is calculated based on a small buffer to account for those transaction costs.

The function handles the details of knowing whether it's running a test or a live trade, and it also fetches the current price to make its decision. You just need to provide the symbol of the trading pair you're working with.


## Function commitAverageBuy

The `commitAverageBuy` function lets you record a new buy order as part of a dollar-cost averaging (DCA) strategy. It automatically adds this buy at the current market price to your position's history, keeping track of the average price you've paid. 

This function simplifies the process by handling details like retrieving the current price and signaling that a buy has been committed. It's designed to work in both backtesting and live trading environments. 

You provide the symbol of the trading pair (like BTC/USDT), and optionally a cost value. The function will then update the average price and notify the system that a new average buy has been executed.


## Function commitActivateScheduled

This function lets you trigger a scheduled trading signal before the price actually hits the expected level. It's useful when you want to proactively manage your trades based on anticipated market movements.

Essentially, it sets a flag on the signal, and the trading strategy will then activate the signal during the next price update.

The function automatically adjusts to whether it's being used in a backtesting or live trading environment.

You provide the symbol of the trading pair, and optionally, some extra information like an ID and a note to help track the activation.


## Function checkCandles

The `checkCandles` function helps ensure your trading data is available and properly stored. It quickly verifies if your cached candlestick data exists where it’s expected. 

Instead of loading everything, it efficiently checks if the data is present for specific timestamps. If even one candle is missing or out of alignment, the check will fail. This saves you time and resources by only retrieving the data you need.

This function relies on a "persist adapter" – a component that manages how your data is stored. The adapter uses a `hasValue` method to efficiently confirm each timestamp’s existence.

## Function cacheCandles

The `cacheCandles` function helps make sure you have the historical price data you need for backtesting. It checks if the data already exists, and if not, it fetches the missing candles and verifies them again. This ensures the backtest uses complete and reliable historical data. You provide details like the trading symbol, time interval (e.g., 1 minute, 1 day), the start and end dates, and the exchange where the data originates. It also offers callbacks for tracking the start of checks and warm starts, letting you monitor the process.

## Function addWalkerSchema

This function lets you register a walker, which is crucial for comparing the performance of different trading strategies. Think of it as setting up a system that runs multiple backtests simultaneously using the same data. It then analyzes these backtests and highlights how each strategy performed relative to others, based on a metric you define. You provide a walker configuration object, containing details about how the comparison should be conducted.

## Function addStrategySchema

This function lets you tell the backtest-kit about a new trading strategy you've created. Think of it as registering your strategy so the system knows how it works. 

When you register a strategy this way, the framework will automatically check to ensure it’s set up correctly – things like making sure your price data makes sense, that your take profit and stop loss rules are logical, and that signals are sent at appropriate times.

It also helps to prevent issues where signals are sent too frequently and provides a layer of protection to ensure your strategy's data is saved even if there are unexpected problems during live trading.

You provide the strategy's configuration – a schema – as input.

## Function addSizingSchema

This function lets you tell the backtest-kit framework how to determine the size of your trades. You provide a sizing configuration, which includes details like the method used for sizing positions (like a percentage of your capital or a risk-based approach), the risk levels you're comfortable with, and any limits on the size of positions you want to take. Essentially, it’s the core of defining how much capital you'll allocate to each trade. The framework then uses this information during the backtesting process to simulate realistic trading behavior.


## Function addRiskSchema

This function lets you define how your trading system manages risk. Think of it as setting up the rules of engagement for your strategies to prevent them from taking on too much risk simultaneously. It allows you to specify limits on how many positions can be held at once and also enables you to build custom checks to ensure your strategies adhere to more complex risk criteria, like portfolio balance or correlations between assets. Importantly, multiple strategies will share the same risk management system, enabling a broader view of your overall risk exposure and allowing for coordinated responses.


## Function addFrameSchema

This function lets you tell the backtest-kit about a new timeframe you want to use for your simulations. Think of it as defining a specific period of time, like "daily data from January 1st to June 30th," along with how that data is structured. You provide a configuration object that details the start and end dates for your backtest, the frequency of the data (like daily, hourly, etc.), and a way to generate the actual timeframe data. Basically, it allows you to customize the time periods the backtest will analyze.


## Function addExchangeSchema

This function lets you tell the backtest-kit framework about a new data source for an exchange. Think of it as registering where the system will pull historical price data from. 

It's crucial because the framework uses this information to fetch candles, format prices and quantities correctly for your strategies, and even calculate common indicators like VWAP based on recent price action. 

You provide an object containing the exchange’s configuration details.


## Function addActionSchema

This function lets you register a custom action that will be executed during your backtest or live trading. Think of actions as a way to react to what's happening in your strategy - like sending a notification when you reach a profit target, logging events, or updating external systems.

You define these actions using an `actionSchema`, which tells the framework *what* to do when specific events occur within your trading strategy. 

Each action runs independently within the context of a particular strategy and the timeframe it's being run on, receiving detailed information about the events that have occurred. This provides a flexible and powerful mechanism for integrating your trading system with other services or implementing custom logic.

