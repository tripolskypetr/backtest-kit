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

The `writeMemory` function lets you store data in a specific memory location, associating it with the currently active trading signal. Think of it as saving a piece of information for later use within your trading strategy. 

It handles the technical details for you, figuring out which signal is active and whether you're running a test or a live trading environment. 

You provide a name for the memory "bucket," a unique ID for the memory slot, the data you want to store (which can be any object), and a description to help you remember what's being saved. It's a promise-based function, so it completes the operation asynchronously.

## Function warmCandles

This function helps speed up backtesting by pre-loading historical candlestick data. It downloads all the candles for a specified time range, from a starting date (`from`) to an ending date (`to`), and stores them for later use. Think of it as preparing the data in advance so your backtesting runs faster and smoother, especially when dealing with large datasets or frequent data requests. You'll need to provide a set of parameters to define the date range and the candlestick interval you want to cache.

## Function waitForReady

This function helps ensure everything needed to start trading is properly loaded before you begin backtesting or live trading. It essentially waits for the system to be fully initialized.

It checks the registries for exchange, frame, and strategy information.

When backtesting, it waits until these three elements are all registered, ensuring historical data is available. In live trading mode, it only needs to confirm the exchange and strategy registries are set up.

This is handy when components like schemas are loaded asynchronously, like with plugin loading or remote configuration, preventing errors that might arise from starting trading prematurely. If it can't confirm everything is ready within a certain time, it doesn't throw an error itself—instead, you should expect to see an error message from your subsequent trading operations.

You can specify whether you're in backtest mode using the `isBacktest` parameter; it defaults to `true`.

## Function validate

This function helps you double-check that everything is set up correctly before you start running backtests or optimizations. It makes sure all the different components, like exchanges, strategies, and risk managers, you're using actually exist and are properly registered within the system.

You can tell it to validate just a few specific components, or let it check everything.

It's a quick way to catch potential errors early on, and it remembers its previous checks to work faster next time. Think of it as a safety net for your trading setup.


## Function stopStrategy

This function allows you to pause a trading strategy’s signal generation. 

It effectively puts a stop to the strategy from creating new trades. 

Any existing open trades will still finish up as usual. The system will then halt at a convenient point, either when it's idle or after a signal has closed. 

It works seamlessly whether you're running a backtest or a live trading scenario. You just need to specify the trading pair (symbol) you want to stop.

## Function shutdown

This function helps your backtesting environment exit cleanly. It sends out a signal that lets different parts of your system – like data handlers or strategy components – know it's time to wrap up and save any important information. Think of it as a polite way to say goodbye, making sure everything is tidied up before the backtest ends, especially when you need to stop it abruptly.

## Function setSignalState

This function helps you manage and update the state of a trading signal, particularly when dealing with complex strategies like those driven by AI. It's designed to keep track of information related to a specific trade, associating it with the active signal.

The function automatically figures out whether you're in backtesting mode or live trading mode. If there's no active signal, it will let you know with a warning, so you don't accidentally lose track of what's happening.

Think of it as a way to build up a history of performance metrics for each trade, like how much profit it makes or how long it stays open— useful for strategies that learn and adapt as they go. It's specifically designed for strategies aiming for modest gains with limited losses, and that might use rules based on metrics like how long a trade is open and its peak profit.

It takes three things as input: the symbol of the trading pair, a dispatch object (something to handle updates), and a data transfer object to hold the initial state. It then returns a promise that resolves to the updated state.

## Function setSessionData

The `setSessionData` function lets you store information that’s specific to a particular trading setup – the symbol, strategy, exchange, and timeframe you’re using. Think of it as a temporary, reusable memory for your backtest or live trading. This data sticks around even if the program restarts while you're live trading, which makes it perfect for storing things like the results of complex calculations or the state of indicators you want to remember between candles.

You can clear out this data entirely by setting the value to null. The function intelligently figures out whether it's running in backtest or live mode automatically.

It takes two things: the symbol of the trading pair (like "BTC-USD") and the value you want to store – this can be any object or `null` to delete it.

## Function setLogger

You can now control where and how the backtest-kit framework's logging appears. This function lets you provide your own logging system, so you can send logs to a file, a database, or a custom service. The framework will automatically add useful information to each log message, like the strategy being used, the exchange involved, and the trading symbol, making it easier to understand what’s happening during backtesting. Just give it an object that implements the `ILogger` interface.

## Function setConfig

This function lets you tweak the overall behavior of the backtest-kit framework. Think of it as customizing the system's preferences. You can adjust various settings at a global level using a configuration object. If you're running tests and need to bypass some of the safety checks, you can use the `_unsafe` flag, but be careful when doing so.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, like the ones generated for markdown. You can change how data is displayed by providing a new configuration that partially replaces the default settings. The system will check to make sure your new column definitions are structurally sound, but there's a special flag to skip those checks if you're using it in a testing environment.

## Function searchMemory

The `searchMemory` function helps you find relevant data stored in your memory system. Think of it as a powerful search tool for your trading data. 

It takes a simple object telling it where to look (`bucketName`) and what you’re searching for (`query`).

The function uses a sophisticated method called BM25 to rank the results, ensuring you get the most relevant entries first.

It even figures out whether you're in a backtesting environment or live trading mode, and resolves the active signal automatically, so you don’t have to worry about configuration.

The result is a list of memory entries, each showing an ID, a score reflecting how well it matches your query, and the actual content of the entry. You can specify the expected structure of the content with the generic type `T`.

## Function runInMockContext

This function lets you run a piece of code as if it were executing within a backtest-kit environment, but without actually running a full backtest. It's perfect for testing or creating quick scripts where you need access to things like the current timeframe or other context-dependent data.

You can customize the context to mimic a real backtest or live trading scenario. If you don't provide any specific settings, it creates a very basic "mock" environment.

For example, it defaults to a live mode, using placeholder names for the exchange, strategy, and frame, and sets the symbol to BTCUSDT. The `when` parameter is set to the current minute boundary. You only need to provide the code you want to run, and this function handles setting up the environment for you.

## Function removeMemory

This function lets you delete a specific memory record associated with a signal. Think of it as cleaning up old data to keep things efficient. 

It automatically figures out whether you're running a test or a live trading environment, so you don't have to worry about that.

Here's what you need to provide:

*   `bucketName`: The name of the memory bucket where the data is stored.
*   `memoryId`: The unique identifier of the memory entry you want to remove.


## Function readMemory

The `readMemory` function lets you retrieve stored data associated with a specific memory identifier within the context of your trading signal. Think of it as fetching a previously saved value that your strategy might need to remember. It handles the complexities of determining which signal is currently active and whether you’re in a backtesting or live trading environment, so you don't have to worry about those details.

You provide the name of the memory bucket and the unique identifier of the memory you want to read.

It returns a promise that resolves with the data, assuming it's an object. 


## Function overrideWalkerSchema

This function lets you tweak an existing strategy's walker configuration – think of it as modifying how the strategy explores different scenarios. It's a way to refine how comparisons are made without completely rebuilding the entire walker setup. You provide a partial configuration, meaning you only specify the changes you want to make, and the rest of the original walker setup stays as it was. This is useful for experimenting with different comparison methods or refining the sensitivity of strategy analysis.


## Function overrideStrategySchema

This function lets you modify existing trading strategies within the backtest-kit framework. Think of it as a way to tweak a strategy's settings without completely rebuilding it. You provide a portion of the strategy's configuration – only the parts you want to change – and it updates the existing strategy, leaving everything else untouched. It's especially useful for making small adjustments or updates to strategies already set up in your system.


## Function overrideSizingSchema

This function lets you tweak an existing position sizing strategy without rebuilding it from scratch. Think of it as a way to make small adjustments, like changing the lot size or risk percentage, without affecting the rest of the sizing rules. You provide a partial configuration – only the settings you want to change are sent to the function. The rest of the original sizing schema stays the same.

## Function overrideRiskSchema

This function lets you tweak a risk management setup that's already in place. Think of it as fine-tuning—you can adjust specific parts of an existing risk profile without having to rebuild the whole thing. You provide a partial configuration, and only the fields you specify will be changed; everything else stays as it was before. This is useful for making small adjustments to your risk controls over time.

## Function overrideFrameSchema

This function lets you modify how data is structured and handled for a specific timeframe during backtesting. Think of it as a way to fine-tune a timeframe’s configuration without having to recreate it entirely. You can selectively update certain aspects of the timeframe – like how data is interpreted – while keeping the rest of its original settings intact. It's particularly useful for adjustments or customizations based on specific data requirements. It takes a partial configuration object, and the function returns the updated, complete timeframe schema.

## Function overrideExchangeSchema

This function lets you modify an already set up data source for an exchange. Think of it as tweaking an existing configuration rather than creating a whole new one. You can update specific settings like fees or order sizes, but anything you don't change will remain as it was. It’s useful when you need to adjust a data source without completely rebuilding it.


## Function overrideActionSchema

This function lets you tweak existing action handlers within the backtest-kit framework without having to completely replace them. Think of it as making small adjustments – it updates just the parts you specify, leaving the rest of the handler's configuration untouched. It’s really handy if you need to change how events are handled, for example, to adjust for different testing environments or to swap out specific parts of the logic. You can also use it to modify how actions behave without making changes to the underlying strategy. To use it, you simply provide a partial configuration object with the properties you want to change.

## Function listenWalkerProgress

This function allows you to keep track of how a backtest is progressing. It provides updates after each strategy finishes running within a backtest. The updates are delivered in the order they happen, and a special system ensures that your code handling those updates runs one step at a time, even if your code takes a little time to process each update. You'll give it a function to be called for each update, and it will return another function that you can call to stop listening.

## Function listenWalkerOnce

The `listenWalkerOnce` function allows you to watch for specific events happening during a backtest or simulation, but only once a certain condition is met. You provide a filter that describes the type of event you're interested in, and a function that will be executed when that event occurs. After the callback runs the first time, the function automatically stops listening, making it perfect for situations where you need to react to a particular event and then move on. Think of it as a temporary alert system for your trading logic.


## Function listenWalkerComplete

This function lets you be notified when a backtest run finishes. It's designed to handle events that signal the completion of a testing process, ensuring that any actions taken based on that completion happen one after another, even if they involve asynchronous operations. You provide a function that will be called when the backtest is done, and it returns a function to unsubscribe from these notifications when you no longer need them. Think of it as a way to reliably know when a series of tests are fully completed and to react accordingly.

## Function listenWalker

The `listenWalker` function lets you track the progress of a backtest as it runs, specifically when each trading strategy finishes its evaluation. It’s like setting up a listener that gets notified after each strategy concludes.

This function queues up the notifications so they’re processed one at a time, even if the function you provide takes some time to run. This helps avoid any unexpected issues that could arise from running things concurrently.

You provide a function that will be called for each strategy that completes, and that function receives information about the event. The `listenWalker` function itself returns a function that you can call later to unsubscribe from these updates.

## Function listenValidation

This function lets you keep an eye on potential problems during your risk validation checks. It's like setting up an alert system – whenever a validation check fails and throws an error, this function will notify you. 

These errors are handled carefully; they're processed one at a time, even if your notification method takes some time to complete. This ensures that you receive all error reports and can address them systematically. 

You provide a function that will be called whenever an error occurs during validation. This lets you debug issues and keep track of validation failures. The function you provide will be returned as a function you can call to unsubscribe from these notifications.

## Function listenSyncOnce

This function lets you listen for specific synchronization events and run a piece of code only once when a matching event occurs. Think of it as a one-time listener for signals. 

If your callback function involves asynchronous operations, the trading system will pause until those operations finish before proceeding. This is really helpful when you need to coordinate actions with external systems or ensure things happen in a precise order.

You provide a filter function to specify which events you're interested in, and then a callback function that will be executed once when a matching event is detected. A warning flag is also available for advanced usage. It’s essentially a way to react to a signal just one time and then stop listening.

## Function listenSync

The `listenSync` function allows you to react to signal synchronization events, like when a signal is about to be opened or closed, and ensures that these actions pause until your reaction is complete. This is particularly helpful if you need to communicate with external systems or perform actions that require careful coordination with the trading process. By providing a callback function, you can define what happens when a synchronization event occurs, and if that function returns a promise, the backtest will wait for the promise to resolve before continuing with the signal processing. A warning flag is available for controlling certain behavior, though its specific details are not provided.

## Function listenStrategyCommitOnce

This function allows you to react to specific strategy actions within your backtest. It’s like setting up a temporary listener that only responds once to an event that meets your criteria. You provide a filter to identify the events you're interested in, and then a function that will run *just once* when a matching event occurs. After that, the listener automatically disappears, so you don’t have to worry about cleaning it up. This is handy when you need to ensure something happens after a particular strategy event, and then you’re done. 

It takes two parts: a filter that determines if an event is relevant, and a function to execute when a relevant event happens. The function returns a method to unsubscribe the listener.

## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategies – specifically, when certain management actions are taken. Think of it as a notification system for changes like canceling scheduled trades, closing positions, or adjusting stop-loss and take-profit levels. The events are delivered one at a time, even if your notification routine takes some time to complete, ensuring everything happens in the correct order. You provide a function that will be called whenever one of these events occurs, allowing you to react to these changes in your strategy.

## Function listenSignalOnce

The `listenSignalOnce` function lets you set up a listener that reacts to specific trading signals but only once. Think of it as a temporary alert – you define what conditions you're looking for, and when those conditions are met, a function runs, and then the listener automatically disappears. This is great for things like waiting for a particular signal to appear before taking action and then moving on. You provide a filter to define the trigger condition and a function to execute when the condition is met.

## Function listenSignalNotifyOnce

This function lets you temporarily listen for specific trading signals and react to them just once. You tell it what kind of signals you're interested in using a filter, and then provide a function that will be executed when a matching signal arrives.  After that one execution, the function automatically stops listening, so you don't have to worry about managing subscriptions. It's handy for things like reacting to a specific signal and then needing to move on.


## Function listenSignalNotify

This function lets you listen for notifications whenever a trading strategy sends out a message related to an open position. Think of it as subscribing to a stream of updates from your strategy.

Whenever the strategy uses `commitSignalInfo` to share a note, this function will trigger your callback.

Importantly, these notifications are handled in the order they arrive, and even if your callback function involves asynchronous operations, the system ensures that these operations are handled one at a time to avoid any conflicts.

You provide a function (`fn`) that will be executed each time a signal info event occurs, and this function receives information about the signal. The function you provide will also return a function to unsubscribe from the notifications.

## Function listenSignalLiveOnce

The `listenSignalLiveOnce` function lets you tap into live trading signals, but only to receive them once. Think of it as setting up a temporary listener that reacts to a specific condition – defined by your `filterFn` – and then automatically disappears after it finds a match. This is super useful for quickly reacting to a single, important event during a live backtest execution, without cluttering your code with ongoing subscriptions. You provide a filter to specify which events you're interested in, and a function to run when that event occurs.

## Function listenSignalLive

This function lets you listen for live trading signals generated by backtest-kit, ensuring that each signal is handled one after another. Think of it as subscribing to a stream of real-time updates from a running simulation.

You provide a function (`fn`) that will be called whenever a new signal arrives.

This function is specifically designed for events originating from a `Live.run()` execution, meaning live trading scenarios.

The function returns another function that you can use to unsubscribe from these live signals when you're finished.


## Function listenSignalBacktestOnce

This function lets you temporarily "listen" for specific signals coming from a backtest run. You provide a filter to define which signals you're interested in, and a function to handle those signals. Importantly, it's a one-time subscription - the callback will execute just once when a matching signal arrives, and then automatically stop listening. This is useful for quickly reacting to a particular event during a backtest without needing to manage ongoing subscriptions.


## Function listenSignalBacktest

The `listenSignalBacktest` function lets you set up a listener that gets notified whenever a backtest produces a signal. It's like subscribing to updates during a backtest run.

You provide a function (`fn`) that will be called whenever a signal event happens. The events are delivered one after another, ensuring they are processed in the order they occurred. This is especially useful for asynchronous operations during backtesting. 

Keep in mind, this listener only receives signals generated by the `Backtest.run()` method. The function you provide returns another function that you can call to unsubscribe from the signal events.

## Function listenSignal

The `listenSignal` function lets you receive updates whenever a trading strategy changes state—like when it's idle, opens a position, is actively trading, or closes a position. It's designed to make sure these updates are handled one at a time, even if your callback function takes some time to complete. Think of it as setting up a listener that guarantees a steady flow of information about the strategy's actions, preventing any overlaps or rushed processing.

You provide a function (`fn`) that will be called with the details of each event, giving you a chance to react to the strategy's movements. When you're done listening, the function returns another function that you can call to unsubscribe.


## Function listenSchedulePingOnce

This function lets you react to specific ping events, but only once. It's like setting up a temporary listener that waits for a particular condition to be met, then runs your code and disappears. 

You provide a filter to define what kind of ping event you're looking for, and then a function that gets executed when that specific event occurs. Once the function runs, it automatically stops listening, so you don't have to worry about cleaning up the listener yourself. This is great for things like reacting to a one-time configuration change or initial setup. 

The filter function determines which events trigger the action, while the provided function handles the event once it's triggered.

## Function listenSchedulePing

This function lets you listen for regular "ping" signals that are sent while a scheduled trading signal is being monitored and prepared. Think of it as a heartbeat signal confirming the signal is still waiting to be activated.

You provide a function that will be called every minute with this ping signal.

It’s useful for tracking the status of a scheduled signal, or for implementing your own custom monitoring actions during that waiting period.

Essentially, you’re setting up a listener that gets notified every minute the system is actively monitoring a scheduled signal. This allows for detailed observation and action-taking during the setup phase of a trade.


## Function listenRiskOnce

The `listenRiskOnce` function lets you react to specific risk rejection events, but only once. It's like setting up a temporary listener that automatically disappears after it sees what you're looking for. 

You provide a filter – a function that decides which events are relevant to you – and a callback function that will be executed when a matching event occurs. Once that event happens and the callback runs, the listener is removed. This is handy if you need to wait for a particular risk condition to be met and then take action. 

The function returns a function that you can call to unsubscribe the listener manually, although it’s designed to unsubscribe itself automatically.


## Function listenRisk

This function lets you set up a listener that gets notified when a trading signal is blocked because it violates risk rules.

Think of it as a way to react specifically to situations where your trades are being rejected for safety reasons.

It’s designed to avoid unnecessary notifications – you only receive events when a risk check fails.

The events are handled one at a time, ensuring that your response to a rejected signal isn't interrupted by other processing.

To use it, you provide a function that will be called with details about the rejected signal (represented as a `RiskContract`). The function returns another function to unsubscribe the listener.


## Function listenPerformance

The `listenPerformance` function lets you keep an eye on how your trading strategies are performing, specifically focusing on timing. It’s a way to listen for events that track how long different parts of your strategy take to execute. Think of it as a way to find those slow spots that might be affecting your trading. 

When you subscribe with `listenPerformance`, the data about these operations will be sent to a callback function you provide. Importantly, even if your callback function takes some time to process the data (like if it’s doing some calculations), the events are handled one at a time in the order they arrive, preventing chaos and ensuring accurate tracking. This function helps you profile and identify bottlenecks in your trading logic.


## Function listenPartialProfitAvailableOnce

This function lets you set up a one-time alert for when a specific profit condition is met during your backtesting. You provide a filter to define exactly what conditions you're looking for, and a function that will run just once when that condition is met. It's like saying, "Hey, let me know when this *exact* profit milestone is hit, and then forget about me." After the callback runs, the subscription is automatically cancelled.

## Function listenPartialProfitAvailable

This function lets you be notified when your backtest reaches specific profit milestones, like 10%, 20%, or 30% gains. 

It ensures that these notifications happen one at a time, even if your notification code takes some time to run. 

You provide a function that will be called with details about the partial profit event, and this function returns another function that you can use to unsubscribe from these notifications when you no longer need them.

## Function listenPartialLossAvailableOnce

This function lets you set up a listener that reacts to changes in partial loss levels, but only once. You provide a filter – a rule that determines which loss events you’re interested in – and a function that will be executed when a matching event occurs. After the function runs once, the listener automatically stops, so you don't have to worry about cleaning up.

It’s ideal for situations where you need to react to a particular loss condition just one time, like automatically adjusting a strategy when a certain loss threshold is crossed.

The `filterFn` helps you narrow down the events you care about, and the `fn` is what you'll use to handle those specific events.


## Function listenPartialLossAvailable

This function lets you keep track of how much a trading strategy has lost, in increments of 10%, 20%, 30%, and so on. It sends you notifications whenever a loss milestone is hit. 

Importantly, the events are delivered one after another, even if your notification handling takes some time. This helps ensure things happen in the right order and prevents conflicts. 

To use it, you give it a function that will be called when a loss level is reached, and it will keep calling that function as losses occur. When you're done listening, you can use the function it returns to unsubscribe.

## Function listenMaxDrawdownOnce

This function helps you keep an eye on maximum drawdown events, but with a twist – it only reacts once. You provide a filter to specify the exact conditions you're interested in, like a particular contract or drawdown level. When those conditions are met, the provided function will be executed just once, and then the listener will automatically stop. It’s great for responding to specific drawdown triggers and then moving on.

The `filterFn` determines which events are relevant to your action.
The `fn` is the function that gets called when the relevant event is detected.


## Function listenMaxDrawdown

This function lets you keep an eye on when your backtest strategy hits new lows in terms of losses – essentially, it tracks the maximum drawdown. You'll get notified whenever a new maximum drawdown is reached.

It's designed to handle these notifications in a reliable order, even if the processing of each notification takes some time. It ensures that your callback function isn't overwhelmed by multiple events happening at once.

This is really handy if you want to monitor your strategy’s performance over time, or if you want to adjust your trading strategy automatically based on how much it's losing. You just provide a function that will be called each time a new drawdown level is observed.

## Function listenIdlePingOnce

This function lets you set up a listener that will react to idle ping events, but only once a specific condition is met. You provide a filter – a way to decide which ping events you're interested in – and a function that will be called when a matching event occurs. Once that event has been handled, the listener automatically stops, so you don't need to manually unsubscribe. It’s useful for one-off actions triggered by periods of inactivity.

The `filterFn` lets you specify criteria, like looking for pings that occur after a certain time or meet a particular condition. The `fn` is the action that gets executed when a ping passes your filter.


## Function listenIdlePing

This function lets you tap into events that happen when your trading system isn't actively monitoring anything – basically, when it's "idle." 

It calls a function you provide each time this idle state occurs.

Think of it as a notification system that tells you when things are quiet, allowing you to perform tasks or check system health.

The function returns another function to unsubscribe from these events when they're no longer needed.

The events are sent with a contract containing details about the ping.

## Function listenHighestProfitOnce

This function lets you react to specific trading events where a new highest profit has been achieved, but only once. You provide a condition – a filter – that determines which events you’re interested in. Once an event meets that condition, a callback function you define will run, and then the function automatically stops listening. It’s a simple way to trigger an action when a particular profit milestone is hit and then move on.

The `filterFn` acts like a gatekeeper, deciding whether an event qualifies for processing.  The `fn` is the code that actually *does* something when a qualifying event occurs.

## Function listenHighestProfit

This function lets you keep track of when a trading strategy achieves a new peak profit. It essentially listens for "highest profit" moments during a backtest.

Whenever the strategy’s profit reaches a new high, a notification will be sent to the function you provide. 

Importantly, even if your code to handle that notification takes some time to run, the system makes sure that these notifications are handled one at a time, in the order they were received. This is helpful for keeping track of progress and adjusting your strategy along the way. You give it a function, and it gives you back a way to stop listening.

## Function listenExit

This function lets you be notified when a serious, unrecoverable error brings the backtest or live trading process to a halt. It's designed to catch those critical errors that stop things completely, unlike the standard error listener which handles more minor issues. When an error occurs, your provided function will be called, ensuring errors are handled one at a time and in the order they happen, even if your error handling involves asynchronous operations. This provides a reliable way to respond to these unexpected and potentially damaging situations.


## Function listenError

This function lets you catch and deal with errors that happen while your trading strategy is running, but aren't critical enough to stop everything. Think of it as a safety net for hiccups like API connection problems.

It makes sure these errors are handled one at a time, in the order they occur, preventing any rushed or conflicting actions. You provide a function that gets called whenever an error of this type is detected, allowing you to take appropriate action and keep your strategy moving forward.


## Function listenDoneWalkerOnce

This function lets you react to when a background task finishes, but only once.

You provide a filter – a test – to decide which completed tasks you're interested in.

Then, you give it a function that will run just one time when a matching task finishes.

After that single execution, the subscription is automatically removed, so you don't need to worry about cleaning it up yourself.


## Function listenDoneWalker

This function lets you be notified when background tasks within a Walker finish processing. 

It's useful for tracking the progress of larger, asynchronous operations running in the background.

You provide a function (`fn`) that will be called when a background task is done. 

Importantly, the events are handled one at a time to avoid any unexpected issues with simultaneous execution. Think of it like a queue—things happen in order. The function you provide will also be executed sequentially, even if it involves asynchronous operations.


## Function listenDoneLiveOnce

This function lets you react to when a background process finishes running within your backtest. 

You provide a filter – essentially, a rule – to determine which completion events you're interested in.  Then, you define a function that will be executed when a matching completion event occurs.

The magic is that this function automatically handles unsubscribing from those completion events after your callback runs just once, so you don't need to worry about cleaning up your subscriptions. It’s a convenient way to respond to specific background task finishes and then forget about it.


## Function listenDoneLive

This function lets you react to when background tasks run by the `Live` object are finished. It’s like setting up an alert that goes off when a particular process concludes. 

The alerts are delivered one at a time, even if the alert handling itself takes some time – this ensures things stay orderly. 

Essentially, it provides a way to track the completion of background operations in a reliable and sequential manner. You give it a function, and that function will be called whenever a background task is done.


## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but it only triggers once and then stops listening. You provide a filter – a test – that determines which completed backtests you care about. When a backtest completes and meets your filter criteria, a special function gets executed just one time to handle the event. After that, the listener automatically stops, preventing repeated callbacks.

## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. 

It's like setting up a listener that gets triggered when the backtest is done. 

The events are handled one after another, even if the function you provide takes some time to complete, ensuring things happen in the correct order. It also prevents the callback from running at the same time, which could cause issues. You provide a function that will be called when the backtest concludes, and this function returns another function that you can call to unsubscribe from these completion notifications.

## Function listenBreakevenAvailableOnce

This function lets you set up a listener that will trigger a specific action only once when a certain condition related to breakeven protection is met. 

Think of it as setting a temporary alert – it waits for a particular event to happen, runs your code, and then stops listening. 

You define what event you're looking for using `filterFn` – essentially, a test that the event has to pass. The `fn` then holds the code that runs when that event finally occurs. Once it has triggered, the listener is automatically removed.

## Function listenBreakevenAvailable

This function lets you keep an eye on when your trades reach a breakeven point – that’s when your losses are covered by the profit you've made. It automatically adjusts the stop-loss to the entry price when this happens.

Events are handled one at a time to ensure things run smoothly, even if your callback function takes some time to process. You provide a function that will be called whenever a trade hits breakeven. The function receives an event object containing details about the trade that reached breakeven.


## Function listenBacktestProgress

This function lets you keep an eye on how your backtest is running. It sets up a listener that gets notified as the backtest progresses, allowing you to track its status. The updates you receive will be handled one at a time, even if the code you provide to handle them takes some time to run. Think of it as getting progress reports as the backtest completes its tasks. You pass in a function that gets called whenever a progress update is available. When you're done listening, the function returns another function that you can call to unsubscribe.


## Function listenActivePingOnce

This function lets you react to specific active ping events and then automatically stop listening. Think of it as setting up a temporary alert – it only triggers once when a matching event happens. You tell it what kind of event you’re looking for using a filter, and then provide a function that will run when that event occurs. After the function runs, the alert automatically disappears, so you don't have to worry about manually unsubscribing. It’s perfect for situations where you only need to respond to an event one time. 

Here's a breakdown of the parameters:

*   `filterFn`: This defines the conditions for the event you want to react to.  It's like a rule – only events that meet this rule will trigger your response.
*   `fn`: This is the action you want to take when the matching event occurs. It’s the code that will run once when the event is detected.


## Function listenActivePing

This function lets you keep an eye on active signals within your backtest. It essentially listens for events that are sent out every minute, giving you a way to monitor the lifecycle of these signals.

You can use this to build systems that react to changes in signal status – perhaps automatically adjusting your strategies based on what’s happening.

The events are handled one at a time, even if your callback function takes some time to complete. This ensures that nothing gets missed and avoids potential conflicts. To unsubscribe, the function returns another function, which you can call when you no longer need to listen for these active ping events.

## Function listWalkerSchema

This function provides a way to see all the different trading strategies (walkers) that have been set up within the backtest-kit system. It essentially gives you a list of all the registered strategies, allowing you to inspect their configurations or build tools that adapt to the available strategies. Think of it as a tool to understand what's running under the hood and to manage your trading strategy setup. It returns a promise that resolves to an array of schemas, each describing a registered walker.

## Function listStrategySchema

This function gives you a list of all the different trading strategies you've set up within the backtest-kit system. Think of it as a way to see what strategies are available to run. It's handy if you want to check how things are configured, create documentation, or build a user interface that lets you choose from multiple strategies. The function returns a promise that resolves to an array of strategy schema objects.


## Function listSizingSchema

This function lets you see all the sizing strategies you've set up in your backtest kit. It’s like looking under the hood to see how your trading decisions are being scaled. You can use it to check your work, create documentation, or even build tools that react to your sizing configurations. The result is a list of all the sizing schemas that are currently active.

## Function listRiskSchema

This function lets you see a complete inventory of all the risk configurations currently set up in your backtest environment. It essentially pulls a list of all the "risk schemas" you've previously added using `addRisk()`. This is helpful if you need to double-check your configurations, generate documentation, or create a user interface that adapts to the available risk settings. Think of it as a way to get a snapshot of your risk management setup.


## Function listMemory

This function lets you see a list of all the stored data, or "memory," associated with the current signal being analyzed. Think of it as checking what information has been saved for later use in your trading strategy.

It handles some of the tricky details for you. It figures out which signal to look at based on the current environment and adjusts its behavior whether you're running a backtest or a live trade.

The function returns a list of memory entries. Each entry contains a unique ID and the actual data it holds, structured according to the type you specified when calling the function. You provide a `bucketName` which specifies where the data is stored.

## Function listFrameSchema

This function allows you to see all the different data structures (frames) that your backtesting system is using. It essentially provides a list of the "schemas" or blueprints that define how your data is organized. This is helpful when you're trying to understand your backtest setup, creating documentation, or building tools that need to know about the available data formats. You can think of it as a way to inspect the overall design of your backtest’s data handling.


## Function listExchangeSchema

This function gives you a peek at all the different exchanges your backtest-kit setup knows about. It pulls together a list of all the exchanges you've added using `addExchange()`. Think of it as a quick way to see what data sources you're working with – handy for checking things, generating documentation, or creating interfaces that adapt to different exchanges. It returns a promise that resolves to an array of exchange schema definitions.

## Function hasTradeContext

This function simply tells you whether the system is currently in a state where you can execute trades. 

It verifies that both the execution context and the method context are active.

Think of it as a quick check to confirm you’re in a position to use functions that interact with the exchange, like getting historical price data or formatting trade details. If it returns `true`, you're good to go; if not, you need to set up the necessary contexts first.

## Function hasNoScheduledSignal

This function helps you quickly check if a trading signal is currently scheduled for a specific asset, like BTC-USD or ETH-USDT. It returns `true` when there's no signal waiting – essentially, it tells you if things are quiet on that front. You can use this to make sure your system doesn't try to generate a signal when one isn't needed, for example, to prevent unnecessary calculations. The function figures out if you’re in a backtesting environment or live trading mode all on its own, making it easy to use in either situation.

It's the opposite of `hasScheduledSignal`; if that function says "yes, there's a signal," this one confirms "no, there isn't."

You provide the trading pair's symbol as input.

## Function hasNoPendingSignal

This function, `hasNoPendingSignal`, quickly checks if there's currently a pending trading signal for a specific symbol, like 'BTCUSDT'. It returns `true` if there isn't a pending signal, and `false` otherwise. Think of it as the opposite of `hasPendingSignal` – you can use it to make sure you don't accidentally generate a new signal when one is already waiting. The framework intelligently figures out whether it's running a backtest or live trading, so you don’t have to worry about that. You just pass in the symbol you're interested in, and it tells you if a signal is pending.

## Function getWalkerSchema

The `getWalkerSchema` function helps you find details about a specific trading strategy, or "walker," that's been set up in your backtest environment. Think of it as looking up the blueprint for a particular strategy. You provide the name of the strategy you're interested in, and the function returns a description of how that strategy works, including the data it uses and the actions it takes. This lets you understand the inner workings of a registered trading strategy without having to dig through the code.

## Function getTotalPercentClosed

This function lets you check how much of a position you still have open for a specific trading pair. It tells you the percentage, with 100 meaning you haven't closed anything yet, and 0 meaning the entire position is gone.

It’s especially helpful if you've been adding to your position over time through dollar-cost averaging (DCA), as it accurately reflects the percentage even with partial closures happening along the way. 

The function adapts to whether your test is a backtest or live trading and figures out the correct context automatically. You just need to provide the symbol of the trading pair you’re interested in.

## Function getTotalCostClosed

This function helps you figure out the total cost of your current position in a specific trading pair, expressed in dollars. It takes the symbol of the trading pair (like BTC/USD) as input. It's designed to be accurate even if you’ve been adding to your position over time through dollar-cost averaging and closing it in parts. The function cleverly figures out whether it’s running in a backtesting environment or a live trading environment on its own.

## Function getTimestamp

This function provides a way to retrieve the current timestamp within your trading strategy. 

It dynamically adjusts its behavior depending on whether you're running a backtest or a live trade. When backtesting, it gives you the timestamp for the specific historical timeframe being analyzed. If you’re in a live trading environment, it delivers the present, real-time timestamp. Essentially, it provides the correct time reference for your calculations, regardless of your execution mode.


## Function getSymbol

This function simply retrieves the symbol you're currently trading, like "BTCUSDT" or "ETHUSD". It's helpful when you need to know which asset you're working with during a backtest or live trading session. The function returns a promise that resolves to the symbol as a string.

## Function getStrategySchema

This function helps you find the blueprint for a specific trading strategy. Think of it like looking up the instructions for a particular recipe - you give it the name of the strategy, and it gives you back the detailed information about what that strategy is supposed to do, including what inputs it needs and what outputs it produces. It uses a unique identifier to pinpoint the exact strategy you're looking for. You’ll need this to understand how to configure and use a strategy within the backtest-kit framework.


## Function getSizingSchema

This function helps you find the specific rules and calculations used to determine how much of an asset to trade, based on a name you provide. Think of it like looking up a recipe for sizing your trades. You give it a name, and it returns the details of that sizing strategy. This is useful when you want to understand or reuse existing sizing approaches within your backtesting environment.

## Function getSignalState

This function helps you retrieve a specific value related to a trading signal. 

It automatically finds the active signal based on the current trading environment (backtest or live).

If there isn't an active signal, it’ll let you know with a warning and just provide you with the starting value you set.

It's particularly useful for advanced strategies, like those using AI, that want to track details about each trade—things like how long a trade lasted or its maximum profit—over time. 

The function aims to streamline how you gather and manage this information, especially for strategies that aim for modest gains while minimizing risk. It’s designed to handle trades that fluctuate in value and react to specific conditions like how long a trade has been open.

The function accepts two pieces of information: the trading symbol (like "BTCUSDT") and an object containing the initial value you want to track.


## Function getSessionData

This function lets you retrieve data that’s specific to a trading symbol and persists throughout a backtest or live trading session. Think of it as a handy place to store things like results from complex calculations or intermediate states that you need to remember across different candles, even if the program restarts. It automatically adapts to whether you're running a backtest or in live mode, so you don’t have to worry about that.

You simply provide the trading symbol (like "BTC-USD") to get the associated data, which can be null if nothing is stored.


## Function getScheduledSignal

This function lets you retrieve the currently scheduled trading signal for a specific asset, like BTCUSDT. It's designed to tell you what the strategy is planning to do next, based on pre-set schedules.

If there isn't a scheduled signal active at the moment, it will simply return nothing.

It figures out whether you're in a backtesting environment or live trading mode all on its own – you don't need to specify that.

You just need to provide the symbol of the asset you’re interested in.

## Function getRiskSchema

This function lets you fetch a specific risk assessment template, or "schema," based on its unique name. Think of it as looking up a pre-defined structure for evaluating risk. You provide the name of the risk you're interested in, and the function returns the corresponding schema. This helps ensure consistent risk analysis across your backtesting system.

## Function getRawCandles

The `getRawCandles` function helps you retrieve historical candlestick data for a specific trading pair. You can easily request a limited number of candles or specify a date range to get exactly what you need. 

It's designed to work reliably within the backtest environment, ensuring that your simulations aren't skewed by looking into the future. 

You have several options when specifying dates and limits: 

*   Provide a start date, end date, and limit to fetch a specific number of candles within those dates.
*   Just give a start date and end date, and it will determine the number of candles to retrieve.
*   Or, set an end date and a limit for candles.
*   You can even specify a limit alone, which uses the current execution context to look back in time.

The function accepts the trading symbol (like BTCUSDT), the candlestick interval (such as 1 minute, 1 hour, etc.), an optional limit on the number of candles, and optional start and end dates. The end date is always checked to make sure it’s not in the future.

## Function getPositionWaitingMinutes

This function helps you understand how long a trading signal has been patiently waiting to be put into action. It tells you the number of minutes a signal has been on hold, waiting for its moment.

If there isn't a signal currently waiting, it will return null, indicating that no signals are pending.

To use it, you simply need to provide the trading symbol (like "BTCUSDT") you're interested in.


## Function getPositionPnlPercent

This function helps you understand how your open positions are performing financially. It calculates the unrealized profit or loss as a percentage of your investment for a specific trading pair. 

It takes into account things like partial order fills, dollar-cost averaging, potential slippage, and trading fees to give you a more realistic picture of your position’s value. 

If there isn't an active signal for that trading pair, it will return null. It works seamlessly whether you're running a backtest or a live trade, and it automatically gets the latest price data for accurate calculations. You simply provide the symbol of the trading pair you are interested in.

## Function getPositionPnlCost

This function helps you understand the current unrealized profit or loss in dollars for a trade you're planning. It calculates this based on the percentage profit or loss of your position, taking into account how much you initially invested. The calculation considers factors like partial closes of trades, dollar-cost averaging, slippage, and trading fees for a more accurate picture.

If there's no trade currently in progress, the function will return null. The function knows whether it's running a backtest or a live trading session and will automatically grab the current market price needed for the calculation. You only need to provide the symbol of the trading pair, like "BTC-USDT".

## Function getPositionPartials

This function helps you understand how your trading position is being managed through partial profit or loss closures. It returns a history of these partial closures for a specific trading symbol. 

If you don't have any active trades, it will indicate that. If trades exist but no partial closures have been made yet, it will return an empty list.

Each entry in the list details the type of partial closure (profit or loss), the percentage of the position closed, the price at which it was executed, the cost basis at that time, and the number of entries accumulated. Essentially, it gives you a breakdown of how your position has been strategically adjusted. You provide the symbol of the trading pair to get the details.

## Function getPositionPartialOverlap

This function helps you avoid accidentally closing a position partially multiple times at very similar prices. It checks if the current market price is close enough to a previously executed partial close order.

Think of it as a safeguard to prevent price slippage and unintended consequences of repeated partial closes.

It determines if the `currentPrice` falls within a defined tolerance range around a previously established partial close price, accounting for a percentage-based step size.

You provide the symbol and the current price to check. Optionally, you can configure the tolerance range (the 'ladder') with upper and lower percentage limits; if you don't, it defaults to a 1.5% tolerance.

The function returns `true` if the price falls within the allowed range of a past partial close, and `false` otherwise, indicating that a new partial close is likely safe.

## Function getPositionMaxDrawdownTimestamp

getPositionMaxDrawdownTimestamp helps you find out exactly when a specific trading position hit its lowest point, marking the maximum drawdown. It essentially tells you the timestamp of that lowest price during the position's lifetime. If no trading signal is active for that position, it won't be able to provide this information and will return null. You provide the symbol of the trading pair to identify which position you're interested in.

## Function getPositionMaxDrawdownPrice

This function helps you understand how much a specific trading position has lost at its lowest point. It looks back at the history of the position and finds the biggest drop in price from its highest value. Essentially, it tells you the maximum drawdown experienced by that position.

If there's no trading signal associated with that position, the function will return null, indicating there's nothing to analyze.

You provide the trading pair symbol, like "BTC-USD", to tell the function which position’s drawdown you want to check.


## Function getPositionMaxDrawdownPnlPercentage

This function lets you find the lowest point in a trading position's profit and loss (PnL) as a percentage. It essentially tells you the biggest drawdown experienced by a specific trading pair during that position's lifetime. 

If there isn’t a currently active trading signal, the function will return null, meaning there's no drawdown to calculate.

To use it, you simply provide the symbol of the trading pair you’re interested in, like "BTC-USDT". The function then returns a promise that resolves to the maximum drawdown percentage.

## Function getPositionMaxDrawdownPnlCost

This function helps you understand the financial impact of a trading position. It calculates the total cost (expressed in the currency of the traded asset) incurred up to the point where the position reached its biggest loss. 

Essentially, it tells you how much money you lost before things potentially started to turn around.

You provide the trading pair symbol, like 'BTC/USDT', and the function will return that cost value. 

If no trading signals are currently active for that symbol, it won’t be able to calculate anything and will return null.


## Function getPositionMaxDrawdownMinutes

getPositionMaxDrawdownMinutes tells you how much time has passed since your position experienced its biggest loss. It essentially shows you how long ago you were at your lowest point for that specific trading pair. The value will be zero right when that low point happens. If there's no active trade signal for the symbol, the function will return null. You provide the trading symbol, like "BTCUSDT", to get the drawdown time for that specific trade.

## Function getPositionLevels

getPositionLevels lets you see the prices at which your DCA (Dollar-Cost Averaging) orders were placed for a particular trading pair. It gives you a list of prices, starting with the original entry price and including any prices added later through commitAverageBuy. If there's no pending signal, it will return null. If you made a single initial buy, you'll get an array containing just the original price. You provide the trading pair's symbol (like BTCUSDT) to get the information.

## Function getPositionInvestedCount

This function helps you track how many times you've adjusted a trade using a dollar-cost averaging (DCA) strategy. 

Specifically, it tells you how many times the system has bought more of an asset after the initial purchase for a particular trading pair.

A value of 1 means it's just the original buy. Each time you use `commitAverageBuy()` to add to the trade, the count increases.

If there's no ongoing trade adjustment happening, the function will return null. 

It smartly knows whether it's running a test or a live trading scenario. You provide the symbol, like 'BTCUSDT', and it gives you the count.

## Function getPositionInvestedCost

This function helps you figure out how much money you've invested in a specific trading pair, like BTC-USDT. It calculates the total cost based on all the times you've bought into that position, using the cost that was set when those buys were recorded. If there’s no active trading signal for that symbol, it will return null. It will work whether you’re running a backtest or a live trade because it intelligently detects the current mode. You just provide the symbol of the trading pair you’re interested in.

## Function getPositionHighestProfitTimestamp

This function helps you find out exactly when a particular trade (identified by its symbol, like 'BTCUSDT') made the most profit during its entire lifespan. It returns a timestamp – a specific point in time – representing that peak profit moment. If there’s no trading activity recorded for that symbol, it will tell you by returning null. Essentially, it’s like looking back at a trade's history to see when it was performing at its absolute best.


## Function getPositionHighestProfitPrice

This function helps you find the highest price a trade has reached while being profitable. 

It essentially remembers the best price for a long position (highest price above the entry) and the best price for a short position (lowest price below the entry) since the trade began. 

The value is updated as the price moves, tracking the highest profit achieved. If no trade is currently active, it will not return a value.

## Function getPositionHighestProfitMinutes

getPositionHighestProfitMinutes tells you how long ago your current trading position reached its highest profit point. 

Think of it as a measure of how far your profits have fallen since the peak.

It's similar to how long you've been in a drawdown, but specifically focusing on profit.

The value will be zero when the position first hits its highest profit.

If there’s no active signal for the specified trading pair, the function returns null.

You provide the trading pair symbol, like "BTCUSDT", to get this information.

## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your current trading position is from its best possible profit. It calculates the difference between the highest profit achieved so far (peak profit) and the current profit percentage. The result tells you how much room there is for improvement, and if your position hasn't reached a peak yet, it will show a positive number. If no trading signals are active for the specified trading pair, the function will return null. You only need to provide the symbol of the trading pair you’re interested in.

## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your current trading position is from its most profitable point. It calculates the difference between the highest profit achieved so far and the current profit level, ensuring the result is always a positive number or zero. Think of it as a measure of how much room your trade still has to potentially improve, based on past performance. If there's no active trading signal, the function will return null. You just need to provide the trading pair symbol like "BTC-USDT" to see the result.

## Function getPositionHighestProfitBreakeven

This function helps you understand if a trade had the potential to reach a breakeven point during its peak profit. It checks if, based on the math, the highest price reached during the trade could have been offset by a breakeven. 

If there aren't any active trades currently being tracked, the function will let you know that there's nothing to analyze.

You just need to provide the trading symbol (like BTCUSDT) to the function to get this information.


## Function getPositionHighestPnlPercentage

This function helps you understand how well a specific trade performed. It looks at a past trading position and tells you the highest percentage profit it ever reached during its lifetime. Think of it as finding the peak of a mountain – it shows you the moment the trade was doing the absolute best it could. 

It needs to know which trading pair (like BTC/USD) you're interested in.

If there's no trading activity for that pair, it won’t be able to give you a number and will return null instead.


## Function getPositionHighestPnlCost

This function helps you understand the cost associated with a trading position. Specifically, it tells you how much it cost to reach the highest profit point for a given trading pair.

Think of it as uncovering the price you had to pay to reach the peak of your gains for that particular trade.

If there are no active signals for that trading pair, the function will return null, indicating that this data isn't available. To use it, you simply provide the symbol of the trading pair you're interested in.


## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand how much your trading position has lost from its peak performance. It calculates the difference between your current profit/loss percentage and the lowest point it reached during a losing streak. 

Think of it as a measure of how far your position has fallen from its highest point.

It requires a symbol, like "BTCUSDT," to know which trading pair to analyze. 

If there’s no active trading signal, this function will not provide a result.


## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand how much your trading position is currently at risk compared to its lowest point. It calculates the difference between your current profit and loss and the largest loss it experienced. Think of it as measuring the "buffer" you have against further losses.

It only works if there's an active trading signal for the specified trading pair. If not, it won't return any value.

You provide the trading pair's symbol (like "BTC-USDT") to this function, and it returns a number representing that risk distance.

## Function getPositionEstimateMinutes

This function helps you understand how long a trading position is expected to last. It tells you the initial estimated duration, in minutes, that was set when the position was first created. 

Think of it as checking the original plan for how long a trade was intended to run before it might expire.

If there isn’t a pending trade currently, the function will return nothing. You provide the symbol of the trading pair, like "BTCUSDT", to get this estimate.

## Function getPositionEntryOverlap

getPositionEntryOverlap helps you avoid accidentally placing multiple DCA orders at very similar price levels. It checks if the current market price falls within a small range around your existing DCA entry levels – essentially, a tolerance zone.

If the price is within that zone of an existing level, the function returns true, signaling that you should probably hold off on creating a new order. Conversely, if there are no existing levels defined, it returns false. You can customize this tolerance zone by providing a ladder configuration, defining how much price variation is allowed around each level. The function utilizes a formula to calculate the acceptable price range based on the level price and specified percentage tolerance.

## Function getPositionEntries

getPositionEntries lets you see the details of how your current trade was built, especially if you're using dollar-cost averaging (DCA). It gives you a list of each individual purchase, showing the price it was bought at and how much was spent. If you haven’t started a trade yet, you won’t see any entries. If you started a trade without any DCA, it will return a single entry representing the initial purchase. You specify the trading pair, like "BTC/USDT," to see the entries for that specific trade.

## Function getPositionEffectivePrice

This function helps you find the average price at which your trading bot acquired a position, considering any dollar-cost averaging (DCA) adjustments. It calculates a weighted average based on the cost of each trade. 

Essentially, it tells you the price your bot effectively paid, accounting for partial closes and any subsequent DCA entries. If there's no active trade, it will return null. The function knows whether it's running a backtest or live trade and adapts accordingly. You just need to provide the symbol of the trading pair you're interested in.

## Function getPositionDrawdownMinutes

getPositionDrawdownMinutes tells you how long your current trade has been losing ground since it reached its highest profit point. It essentially tracks the duration of the pullback.  If the trade is just starting and hasn’t experienced any losses yet, the value will be zero.  The value increases as the price moves further away from that initial peak. If there's no active trade happening, it won't provide a value. You provide the symbol of the trading pair you're interested in, like 'BTCUSDT'.

## Function getPositionCountdownMinutes

getPositionCountdownMinutes tells you how much time is left before a trading position expires. It figures this out by looking at when the position started and comparing it to an estimated expiration time.

If the estimated time has already passed, it reports zero minutes remaining.

You won't get a countdown if there isn't a pending signal for the given trading pair.

To use it, you simply provide the symbol of the trading pair you're interested in, and it will return the remaining countdown in minutes.

## Function getPositionActiveMinutes

The `getPositionActiveMinutes` function helps you understand how long a specific trading position has been open. It tells you the number of minutes the position has been active, essentially tracking its lifespan. 

If there's no signal currently associated with that position, the function will return null, indicating no active position to measure. 

You provide the trading pair symbol (like 'BTC-USDT') to find the active minutes for that particular position.


## Function getPendingSignal

This function helps you find out what signal your trading strategy is currently waiting on. 

It checks for a pending signal, which is like a signal that's been generated but hasn't been fully processed yet. 

If there isn't a pending signal, it’ll let you know by returning nothing. 

You just need to tell it which trading pair (symbol) you're interested in. 

It cleverly figures out whether it’s running in a backtesting environment or in a live trading situation, so you don't have to worry about that.


## Function getOrderBook

This function retrieves the order book data for a specific trading pair, like BTCUSDT. 

It asks the exchange you're connected to for this information. 

You can optionally specify how many levels of the order book you want – the default is a pretty deep look.

The function considers the current time when fetching the data, although how the exchange uses this time can vary depending on whether you're backtesting or trading live.


## Function getNextCandles

This function helps you grab a batch of future candles for a specific trading pair and timeframe. It's designed to get candles that come *after* the current point in time that your backtest or simulation is at. You tell it which symbol (like "BTCUSDT") and interval (like "1h" for one-hour candles) you want, along with how many candles you need. The function then uses the underlying exchange connection to fetch those candles and return them to you as a list of data objects.

## Function getMode

This function helps you figure out if your trading strategy is running in testing mode (backtest) or in a live, real-money environment. It's a simple way to check the context of your code and adjust behavior accordingly – perhaps you’d want to log extra details during backtesting for analysis, or disable certain features in live trading. The function returns a promise that resolves to either "backtest" or "live", letting you know exactly what’s happening.

## Function getMinutesSinceLatestSignalCreated

This function helps you determine how much time has passed since the most recent trading signal was generated for a specific trading pair. It's handy if you need to enforce a waiting period, like a cooldown, after a stop-loss event. 

The function looks for the latest signal, regardless of whether it’s still active or has already been closed, and calculates the time in minutes. If no signals exist for that symbol, it returns null. It automatically figures out if it’s running in backtest mode or live mode.

You only need to provide the trading pair symbol, like "BTCUSDT", to use this function.

## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand how much your trading strategy lost from its best point. It calculates the difference between the highest profit you ever made and the biggest loss you experienced, essentially showing you the "distance" between those points in terms of percentage of profit.

You provide the trading pair symbol (like BTC-USD) to the function, and it returns a number representing that drawdown distance. If the strategy doesn’t have any active signals, it won’t be able to calculate anything and will return null. This metric is useful for assessing risk and understanding the potential volatility of a trading strategy.


## Function getMaxDrawdownDistancePnlCost

This function helps you understand the risk profile of a trading strategy. It calculates the largest difference between the highest profit you made and the lowest point where you lost money during a backtest. 

Think of it as measuring how far you fell from your peak – a larger number indicates potentially greater risk. The result will be zero if you never had a positive profit. 

The function needs the trading symbol, like "BTC-USDT", to perform its calculation. If there’s no trading data available, it won't be able to provide a value.

## Function getLatestSignal

This function helps you retrieve the most recent signal generated for a specific trading pair, whether it's still active or has already closed. It’s handy for situations where you need to control how often your strategy takes actions, like preventing new trades immediately after a stop-loss event. The function looks for signals in both your historical backtest data and your current live trading environment. If no signals are found, it will return null. It intelligently adapts to whether you’re running in backtest or live mode. You just need to provide the symbol of the trading pair you're interested in.

## Function getFrameSchema

This function lets you look up the structure of a specific frame within your backtest. Think of frames as snapshots in time during a backtest, and this function gives you the blueprint of what data will be available in that snapshot. You provide the name of the frame you're interested in, and it returns a description of its contents, like what data points it holds and their types. It’s useful for understanding what information you have access to when building strategies or analyzing results.


## Function getExchangeSchema

This function helps you access the detailed configuration information for a specific cryptocurrency exchange. Think of it as looking up the blueprint for how a particular exchange works – things like how orders are placed, how data is structured, and what symbols are available. You provide the name of the exchange, and it returns a set of rules and definitions related to that exchange. This is useful for setting up and running backtests.

## Function getDefaultConfig

This function provides you with a set of pre-defined settings that serve as a starting point for configuring your backtesting environment. It’s like a template for all the tweakable parameters that control things like how often the system checks for new data, limits on how much slippage is tolerated, and maximum values for signal lifetimes. Think of it as a handy guide to understanding all the configuration options and what they do by default. You can then customize these values to suit your specific backtesting needs.

## Function getDefaultColumns

This function provides a handy way to get the standard column setup used for generating reports. Think of it as a template for organizing your data into columns – it shows you all the columns that are typically used and how they're defined by default. You can use it to understand what’s possible and to customize your report layout. It returns a set of pre-configured column definitions, ready to be used.

## Function getDate

This function, `getDate`, simply provides you with the current date. 

It's useful for understanding the timeframe you're working with during a backtest, as it reflects the date of the data being analyzed. 

When running live, it gives you the actual, real-time date. It returns a `Date` object, so you can easily format it or use it in calculations.

## Function getContext

This function lets you access information about the current method being run within your backtest. It's like getting a snapshot of the environment - things like the current time, data availability, and other details relevant to that specific step in your trading strategy. The result is a promise that resolves to an object containing this contextual data, which you can then use to make informed decisions in your trading logic.

## Function getConfig

This function lets you peek at the framework's global settings. It gives you a snapshot of all the configuration values that control how backtesting and trading happen. Think of it as a way to see what's influencing the system's behavior without actually changing any of those settings directly. It's useful for understanding how things are set up or debugging issues. The returned values cover everything from candle fetching retry attempts to limits on the number of notifications.

## Function getColumns

This function gives you a peek at how your backtest data will be presented in markdown reports. It provides a snapshot of the column definitions used for various data types like strategy results, performance metrics, and risk events. Think of it as a way to see exactly what columns will be included and how they're structured without actually changing anything. It’s a read-only view that helps you understand and plan how your data will be visualized.

## Function getClosePrice

This function lets you easily grab the most recent closing price for a specific trading pair and timeframe. You provide the symbol, like "BTCUSDT" for Bitcoin against USDT, and the desired candle interval, such as "1m" for one-minute candles or "4h" for four-hour candles. It will then return the closing price of the last available candle for that symbol and interval. Essentially, it's a quick way to see where the market closed at a particular point in time.


## Function getCandles

This function helps you retrieve historical price data, also known as candles, from an exchange. You provide the trading pair (like "BTCUSDT"), the time interval for each candle (options include 1 minute to 8 hours), and how many candles you want to see. It then pulls that data backward from the current time using the exchange's built-in tools. Think of it as requesting a specific amount of past price action for a particular cryptocurrency pair.


## Function getBreakeven

This function helps determine if a trade has become profitable enough to cover associated costs. It looks at the current price of a trading pair and compares it to a calculated threshold that accounts for slippage and trading fees. Essentially, it tells you if the price has moved favorably enough to make the trade "breakeven," meaning you've recovered your initial investment and fees. The function automatically adapts to whether it’s running in a backtesting or live trading environment. You provide the symbol of the trading pair and the current price to check.


## Function getBacktestTimeframe

This function helps you find out the dates available for backtesting a specific trading pair, like BTCUSDT. It fetches a list of dates that the backtest kit has data for, allowing you to choose a suitable timeframe for your simulations. Simply provide the symbol of the trading pair you're interested in, and it will return an array of dates representing the available timeframe.


## Function getAveragePrice

This function helps you find the VWAP (Volume Weighted Average Price) for a specific trading symbol like BTCUSDT.

It looks at the last five minutes of trading data, considering both the price and the volume of each trade.

Basically, it calculates a weighted average, giving more importance to prices that were traded at higher volumes.

If there’s no trading volume data available, it falls back to calculating a simple average of the closing prices instead.

You just need to provide the symbol you're interested in, and it returns a promise that resolves to the average price.

## Function getAggregatedTrades

This function helps you retrieve a list of combined trades for a specific trading pair, like BTCUSDT. 

It pulls this data directly from the exchange you're using within the backtest environment.

You can request all trades within a certain timeframe or specify a maximum number of trades to retrieve. If you don't set a limit, it'll get trades from the last window of time; otherwise, you can get exactly how many trades you need. 


## Function getActionSchema

This function lets you find the detailed structure of a specific action within your backtesting setup. Think of it as looking up the blueprint for how a particular action, like buying or selling, should be performed. You provide the name of the action you're interested in, and it returns a description of what data it expects and what it's designed to do. This is useful for understanding and validating how your trading strategies are defined.

## Function formatQuantity

This function helps you display the right amount of a trading pair, like Bitcoin versus US Dollar, according to the rules of the specific exchange you're using. It takes the symbol of the trading pair (e.g., BTCUSDT) and the raw quantity you want to show. The function automatically adjusts the number of decimal places to match the exchange's requirements, ensuring you present the quantity correctly. It returns a string representing the formatted quantity.


## Function formatPrice

This function helps you display prices in the correct format for a specific trading pair. It takes the symbol (like BTCUSDT) and the raw price value, then uses the exchange's rules to ensure the right number of decimal places are shown. This means prices will be displayed accurately according to how the exchange presents them, avoiding any confusion for users. It returns a string representing the formatted price.


## Function dumpText

The `dumpText` function helps you record raw text data associated with a specific signal, like logs or detailed explanations. It's designed to be easy to use within your backtesting or live trading environment – it figures out which mode you're in automatically. You provide the function with information about the data you're dumping, including the bucket name, a unique identifier for the dump, the actual text content, and a description to help you understand it later. This function takes care of associating this data with the appropriate signal, so you don't have to worry about that part.


## Function dumpTable

This function helps you display data in a clean, table format within your trading tests. 

It takes an array of objects, each representing a row in your table. 

The function intelligently figures out which signal to associate the table with, and adapts to whether you're running a backtest or a live trading environment.

It automatically determines the column headers by looking at all the keys used in your data, making sure everything is displayed correctly.


## Function dumpRecord

The `dumpRecord` function lets you save a piece of data, like a snapshot of information, linked to a specific data bucket and a unique identifier. Think of it as archiving a record for later inspection. 

It figures out the correct environment—whether you’re running a test or a live trading session—without you having to explicitly specify it.

It also handles the signal involved in this record automatically, so you don't need to worry about managing signals manually.

You provide the function with details like the bucket name, the dump ID, the actual data you want to save, and a description of what the data represents. It then persists that data for potential analysis or debugging later on.


## Function dumpJson

The `dumpJson` function lets you record complex data, like the state of your trading system at a specific point in time, as a structured JSON file. Think of it as taking a snapshot of your trading logic.

It automatically handles the process of attaching this snapshot to the correct signal, and it intelligently adjusts based on whether you’re running a test or a live trading session.

You provide a name for the snapshot (`dumpId`), the name of the bucket where it will be stored (`bucketName`), the actual data as a JavaScript object (`json`), and a brief description of what the snapshot represents.  The function then saves this data.


## Function dumpError

The `dumpError` function helps you report errors in a structured way during backtesting or live trading. Think of it as a way to send detailed error messages that are linked to specific trading signals. It automatically knows whether you're running a backtest or a live trade, and it handles the signal context for you, so you don't have to worry about those details. You provide information like the bucket name, a unique dump ID, the error description itself, and a more general description of the problem. This function then sends this information for logging or debugging.

## Function dumpAgentAnswer

This function helps you save a complete record of a conversation with the agent, linking it to a specific signal. It's really useful for debugging or auditing purposes because you get the full message history. 

The function figures out whether it's running a backtest or a live trading session all on its own, so you don't have to worry about configuring that. It automatically identifies the relevant signal for the dump, pulling it from the execution context.

You provide a few details: the bucket name to store the data, a unique identifier for the dump, the actual messages exchanged, and a brief description of what the dump represents. Once you call this function, it saves all this information for later review.

## Function createSignalState

This function helps you manage and track the state of your trading signals, especially when dealing with complex strategies like those driven by language models. It generates a pair of functions, `getState` and `setState`, which allow you to read and update the signal's status. 

The best part is, you don't need to manually specify the signal ID – it figures out the testing environment (backtest or live) and the signal automatically.

This is particularly useful for strategies that gather metrics over many trades, like how long a trade is open or its maximum profit percentage. It’s designed to help you optimize strategies aiming for decent returns while keeping drawdowns in check.



The `params` object holds all the configuration details for the signal state.

## Function commitTrailingTakeCost

This function lets you change the take-profit price for a trade to a specific price level. It simplifies setting a fixed take-profit, automatically calculating the percentage shift needed from the original take-profit distance. The system figures out whether it's running a backtest or a live trade, and it gets the current market price to ensure the adjustment is accurate. You just need to provide the trading symbol and the desired take-profit price.

## Function commitTrailingTake

This function lets you fine-tune the trailing take-profit for your open trade signals. It’s designed to dynamically adjust the take-profit level based on market movement.

It's important to understand that it always calculates adjustments from the original take-profit you set initially – not from any previous trailing adjustments. This ensures accuracy and prevents small errors from building up over time.

If you provide a percentage shift, the new take-profit will only be set if it’s a more conservative move – meaning closer to your entry price for long positions or further from your entry price for short positions. So, if you’re trying to make the take-profit more aggressive, it won't work if your adjustment would move it closer to entry.

The function automatically recognizes whether it's running in a backtest or a live trading environment. You provide the symbol of the trading pair, the percentage adjustment you want to make, and the current market price to ensure the adjustment is appropriate.

## Function commitTrailingStopCost

This function lets you update the trailing stop-loss order for a specific trading pair to a fixed price. 

Essentially, it takes a desired stop-loss price and calculates the necessary percentage shift from the initial stop-loss distance to achieve it.

It's designed to work whether you're backtesting or actively trading, and it automatically gets the current price to make the calculation. You just need to provide the symbol you’re trading and the new stop-loss price you want.


## Function commitTrailingStop

The `commitTrailingStop` function lets you tweak the trailing stop-loss distance for a pending trade signal. It's designed to keep your stop-loss consistently protective.

It's really important to remember that this function calculates adjustments based on the original stop-loss distance, not the current one. This prevents small errors from building up over time.

If you specify a shift percentage, it will only make the stop-loss better – meaning it won't move your stop-loss in a way that would reduce your protection.

For long positions, the stop-loss can only move further away from the entry price. For short positions, it can only move closer.

This function figures out whether it’s running in backtest mode or live trading mode on its own.

You'll provide the trading pair symbol, the percentage adjustment to the original stop-loss distance (which can be positive or negative), and the current price to help it make its calculations.

## Function commitSignalNotify

The `commitSignalNotify` function lets you send out informational messages related to your trading strategy. Think of it as a way to leave notes or trigger alerts during a trade without actually changing your positions. 

You can use it to record important events happening within your strategy, like when a specific indicator reaches a certain level, or even send out custom alerts. 

It automatically takes care of things like knowing whether you're in backtest or live mode, and it pulls in details like your strategy and exchange names. It even fetches the current price for you. You just need to specify the trading symbol and any extra information you want to include in your notification.

## Function commitPartialProfitCost

The `commitPartialProfitCost` function helps you automatically close a portion of your trading position when you’ve reached a specific profit target measured in dollars. It's designed to simplify the process of taking profits while keeping track of your investment. You provide the symbol of the trading pair and the dollar amount you want to close, and the function calculates the necessary percentage based on your initial investment. 

This function is smart enough to work whether you're backtesting or actively trading and handles fetching the current price for you. The trade must be moving in the direction of your take profit to execute.


## Function commitPartialProfit

This function lets you automatically close a portion of your open trade when the price moves in a profitable direction, essentially moving you closer to your take profit target. It allows you to lock in some profits as the trade goes your way.

You specify which trading pair you’re working with (like "BTCUSDT") and what percentage of your position you want to close – for example, closing 25% or 50% of the trade. 

The system intelligently figures out whether it's running in a backtesting environment or a live trading setup, so you don't need to worry about manually configuring that.


## Function commitPartialLossCost

This function helps you partially close a trading position when it's heading towards a loss, and you want to limit the financial impact. It lets you specify how much money you want to recover from the position, and it automatically calculates what percentage of the position that represents. The function handles the complexities of knowing whether you're in a backtesting or live trading environment, and it finds the current price to make the calculations. To use it, just tell it the trading pair and the dollar amount you wish to recover.

## Function commitPartialLoss

This function lets you automatically close a portion of your open trade when the price is moving in a direction that would trigger your stop-loss. It's designed to help manage risk by closing some of the position before the full stop-loss is hit. You specify the symbol of the trading pair and the percentage of the position you want to close, and the function handles the details of executing the trade whether you’re in a backtest or a live trading environment. This is useful for reducing potential losses on a trade.


## Function commitClosePending

This function lets you clear a pending signal, effectively removing it without interrupting your strategy's normal operation. Think of it as a way to manually dismiss a signal that might have been generated but isn't something you want to act on. It won't impact any scheduled signals or cause the strategy to stop running; it simply removes the pending order. Importantly, it doesn't trigger a stop flag, meaning the strategy remains free to generate new signals as usual. This function adapts automatically to whether you're running a backtest or a live trading scenario. You can optionally add a note or ID to the commit payload for better tracking of this action.

## Function commitCancelScheduled

This function lets you cancel a scheduled signal, essentially removing it from the queue without disrupting your strategy's normal operation. It's useful when you want to adjust a plan but don't want to halt the trading process entirely. Think of it as a way to retract a future action. It doesn't impact any existing orders or stop the strategy from creating new signals, and it works the same whether you're running a backtest or live trading. You can optionally include extra details like an ID or a note with the cancellation.

## Function commitBreakeven

This function helps manage your trades by automatically adjusting the stop-loss once the price moves favorably. It essentially moves your stop-loss to the entry price, eliminating risk, once the price has gained enough profit to cover the initial transaction costs and a small buffer. 

Think of it as a safety net that kicks in when your trade is doing well, protecting your gains.

The function determines the exact profit level required for this adjustment based on a combination of slippage and fee considerations. It handles the details of checking the current price and knows whether it's operating in a backtesting environment or a live trading scenario. You just need to provide the symbol of the trading pair you're working with.


## Function commitAverageBuy

The `commitAverageBuy` function helps you record and track purchases made as part of a dollar-cost averaging (DCA) strategy. It essentially adds a new entry to your trading history, noting down the price at which you bought more of an asset. 

It calculates and updates the average purchase price for the asset and then signals that a buy order has been placed. 

The function cleverly adapts to whether you're running a backtest or a live trading environment. It also handles fetching the current price for the asset automatically. You just need to specify the asset's symbol and optionally, a cost value.


## Function commitActivateScheduled

This function lets you trigger a scheduled trading signal to run sooner than originally planned. Think of it as manually pushing the button on a pre-arranged trade.

It's useful when you want a signal to execute before the price reaches the expected level.

The function takes the trading symbol as input, and you can optionally add a note to the action for record-keeping. 

It intelligently adapts to whether you're running a backtest or a live trading scenario.


## Function checkCandles

The `checkCandles` function is a utility for ensuring your historical candlestick data is properly aligned with the expected time intervals. It does this by examining the timestamps stored in your cached data. 

This function works by directly reading the data files from your persistent storage – it doesn’t rely on any intermediate layers. 

Essentially, it’s a maintenance task to help keep your backtesting environment accurate and consistent. It helps avoid issues that might arise from misaligned or corrupted timestamps.


## Function addWalkerSchema

This function lets you register a custom walker, which is essentially a way to run and compare different trading strategies against each other using the same historical data. Think of it as setting up a system to automatically test several strategies and see how they perform relative to one another. You provide a configuration object that tells the framework how your walker should operate, including how to evaluate the performance of each strategy. This enables a more comprehensive analysis beyond just testing a single strategy.

## Function addStrategySchema

This function lets you tell the backtest-kit about a new trading strategy you've built. Think of it as registering your strategy so the system knows how to use it. 

When you register a strategy, the framework will automatically check to make sure your strategy's signals are correct (like checking prices and stop-loss logic) and that signals aren’t being sent too quickly. 

It also helps ensure your strategy’s data is safely saved even if something unexpected happens while the system is running.

You provide the function with a description of your strategy, which outlines its specific rules and configuration.

## Function addSizingSchema

This function lets you tell the backtest kit how to determine the size of your trades. Think of it as defining your risk management rules. 

You'll provide a sizing schema which includes details like how you want to calculate position sizes – whether it’s based on a fixed percentage of your capital, a Kelly Criterion, or using Average True Range (ATR). 

It also involves setting risk parameters like the percentage of your capital you're willing to risk per trade, or values for ATR multipliers.  You can also specify limits to ensure your positions stay within reasonable bounds, like maximum size or percentage of capital. Finally, there’s a way to define custom logic for when sizing calculations occur.


## Function addRiskSchema

This function lets you define how your trading system manages risk. 

You can specify limits on how many trades can be active at once, and add your own custom checks to ensure your portfolio stays healthy. 

Think of it as setting up guardrails for your trading strategies – multiple strategies can use the same risk management setup, which allows for a holistic view of your overall risk exposure. The framework keeps track of all active positions to help enforce these rules and even notify you if a trade is rejected.

## Function addFrameSchema

This function lets you tell the backtest-kit about a new timeframe you want to use for your backtesting. Think of it as defining how your historical data will be divided into chunks for analysis. You provide a configuration object that specifies the start and end dates for your backtest, the interval (like daily, hourly, etc.) at which those chunks are created, and a special function that gets called whenever a new timeframe is generated. It’s essential for tailoring the backtest to the specific time periods and granularities you’re interested in.


## Function addExchangeSchema

This function lets you tell the backtest-kit framework about a new exchange you want to use for your trading strategies. Think of it as introducing the system to a data source that provides market data.

You’ll need to provide a configuration object containing details about the exchange, including how to fetch historical price data, how to format price and quantity values, and how to calculate VWAP. Adding an exchange schema makes its data available for backtesting and strategy development.

## Function addActionSchema

This function lets you register a custom action handler within the backtest-kit framework. Think of actions as a way to hook into the trading process and respond to significant events. 

You can use them to manage your strategy’s state, send notifications (like to Discord or Telegram), track performance with analytics, or even trigger other business processes. 

Each action handler gets a unique instance and is fed all the key events happening during a trading cycle, allowing for flexible and reactive behavior. To use it, you provide a configuration object defining the action you want to add.
