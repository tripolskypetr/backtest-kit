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

The `writeMemory` function lets you store data within a specific memory space, essentially creating a named container for information. Think of it as saving a piece of data labeled with a unique identifier. This function is designed to work seamlessly within the trading context, automatically adjusting its behavior depending on whether you're running a simulation (backtest) or live trading. 

It takes an object as input, which includes the name of the memory bucket, a unique ID for the data you're saving, the actual data itself (which can be any object), and a description to help you remember what the data represents. The function then safely writes this data, automatically figuring out the correct signal to associate it with.

## Function warmCandles

This function helps prepare your backtesting environment by downloading and storing historical price data (candles) for a specific time period. Think of it as pre-loading the data your strategies will need. It downloads candles for a chosen time range, from a starting date (`from`) to an ending date (`to`), and saves them for faster access during backtesting. This is particularly useful for longer backtesting periods or when dealing with large datasets, as it avoids repeated downloads. It uses a configuration object (`params`) to define the range of dates and the data interval you want to pre-cache.

## Function waitForReady

This function, `waitForReady`, is a helper that pauses your application's startup process until everything it needs to trade is properly set up. It checks that the necessary registries—those for exchanges, trading strategies, and historical data frames—are available. 

If you’re running a backtest, it waits for all three to be ready. When running live, it only requires the exchange and strategy registries.

Think of it as a safety net, preventing your trading system from trying to run before all the pieces are in place. It polls these registries every second, up to a certain timeout, and silently fails if it doesn’t see them populate. The responsibility then falls on the code that follows to handle the error (like telling the user "a strategy hasn't been loaded").

You can tell it whether you’re in backtest mode or live mode using the `isBacktest` parameter. If you don’t provide this parameter, it defaults to backtest mode.

## Function validate

This function, `validate`, helps you make sure everything is set up correctly before you start your backtesting or optimization. It checks if all the entities you're using – like exchanges, trading frames, strategies, risk management, sizing rules, and walker configurations – are actually registered in the system.

You can tell it to check specific entity types if you only need to validate certain parts. 

However, if you don't specify anything, it will check *everything* to make sure the whole system is ready to go. It's a quick way to catch errors early and prevent unexpected issues during your testing. The validation results are also saved so the system can run faster next time.

## Function stopStrategy

This function lets you pause a trading strategy. 

It effectively tells the strategy to stop creating new trading signals. Any existing signals that are already active will finish up as usual. 

The system will automatically determine whether it's in backtest or live trading mode and stop the strategy at a convenient point, such as when it's idle or a signal has closed. 

You simply need to specify the trading pair (like 'BTCUSDT') to target the strategy you want to pause. The strategy is identified using the method context where you call this function.

## Function shutdown

This function allows you to properly end a backtest run. It sends out a signal that lets all parts of the backtest know it’s time to clean up and prepare to exit. Think of it as a polite way to say goodbye, making sure everything is closed and saved before the program finishes. It's useful when you need to stop the backtest unexpectedly, like when you press Ctrl+C.

## Function setStrategyPaused

This function lets you temporarily stop a trading strategy from opening new positions. Think of it as putting the strategy on hold.

When a strategy is paused, it won't react to new market signals or process any new trade requests. Existing orders and signals will still be managed and closed as usual.

This paused state is saved, so it will remain even if the system restarts. To resume trading, you need to explicitly unpause the strategy using `setStrategyPaused(symbol, false)`. You'll also receive a notification when the paused state changes, allowing you to track when the strategy is put on hold or resumed. The function automatically adapts to whether it's running a backtest or live trading.

You give the function the trading symbol (like BTC-USD) and a boolean value to indicate whether to pause (true) or resume (false) the strategy.

## Function setSessionData

This function lets you store data that’s specific to a particular trading pair, strategy, exchange, and timeframe. Think of it as a way to hold temporary information that needs to be remembered across multiple candles during a backtest or even when the program restarts in live trading mode. You can use it to save things like the results of calculations, intermediate steps in indicator calculations, or anything else that needs to be persistent but isn't directly tied to a signal. 

If you want to clear out the stored data, simply pass `null` as the value. The function automatically knows if it's running in backtest or live mode so you don’t need to worry about that.

It accepts a symbol (like "BTCUSDT") and the data you want to store. The data can be any object, or you can clear the data by setting the value to `null`.

## Function setLogger

This function lets you plug in your own logging system to backtest-kit. 

It’s a way to control where and how the framework's internal messages appear.

When you provide a custom logger, all messages generated by the framework – things like strategy details, exchange information, and trading symbols – will be sent to your logger. This makes debugging and monitoring your backtests much easier. You’ll need to implement the `ILogger` interface to provide your custom implementation.

## Function setConfig

This function lets you adjust how the backtest-kit framework operates by changing its global settings. You can provide a configuration object with the settings you want to change, and only the properties you specify will be updated – it doesn’t require you to redefine the entire configuration.  There's also a special `_unsafe` flag; use it with caution, typically only when running tests, as it bypasses important validation checks.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, like those generated for markdown. You can change the definitions of the columns, essentially overriding the default settings. It’s helpful if you want to tailor the report to show specific data or change how it's presented. The function checks to make sure your custom column definitions are structurally sound, but you can skip this validation if needed – typically for testing purposes.

## Function searchMemory

The `searchMemory` function helps you find relevant pieces of information stored in your memory system. Think of it as a powerful search engine specifically designed for your trading data. You give it a bucket name (where the data is stored) and a search query, and it returns a list of matching memory entries, ranked by how well they align with your query.

It intelligently determines whether you're running a backtest or live trading and automatically resolves the current signal based on the system's context. 

The function returns an array of results, each including a unique ID for the memory entry, a score indicating its relevance to your search, and the content of the memory itself. The results are sorted by score, so you can quickly focus on the most relevant information.


## Function runInMockContext

This function lets you run pieces of code as if they were part of a larger backtesting or live trading process, but without actually running a full backtest. It’s designed to be helpful when testing or scripting, especially when you need to interact with things like the timeframe or other context-dependent services.

Think of it as creating a temporary, simplified environment for your code.

You can customize this environment by providing details like the exchange name, strategy, frame, and symbol. If you don't specify anything, it sets up a basic live-mode setup with placeholder names, so you can still get things working quickly. 

The function takes a piece of code you want to execute and returns whatever that code produces.


## Function removeMemory

This function helps you clean up data related to your trading signals. Specifically, it deletes a single memory entry associated with a particular signal. It’s designed to be used in both backtesting and live trading environments, handling the differences automatically. It uses the bucket name and a unique memory ID to identify the specific entry to remove. Think of it as tidying up the system after a signal's execution.


## Function readMemory

The `readMemory` function lets you retrieve data stored in memory, associating it with a specific signal. Think of it as fetching a previously saved piece of information relevant to your current trading signal. 

It automatically figures out whether you're running a backtest or live trading, and uses the signal active at that moment. You provide the bucket name and a unique memory ID to pinpoint the exact data you need. The function returns a promise that resolves with the data, structured according to a type you specify.

## Function overrideWorkerSchema

This function lets you modify an already existing worker setup within the backtest-kit framework. Think of it as a way to tweak a worker's configuration without having to recreate it from scratch. You provide a piece of the worker's configuration you want to change, and this function will apply just those changes, leaving everything else untouched. It's particularly useful for making small adjustments to workers during a backtesting process.

## Function overrideWalkerSchema

This function lets you tweak a previously defined strategy walker, which is used for comparing different trading strategies. Think of it as modifying an existing blueprint instead of starting from scratch.  You can selectively change certain aspects of the walker’s configuration – maybe you want to adjust how it handles specific data or changes its evaluation criteria – and only those modifications will apply. The rest of the original walker configuration stays exactly as it was. It returns a promise resolving to the updated walker schema.

## Function overrideSweepSchema

This function lets you modify an existing sweep configuration within the backtest-kit framework. Think of it as updating a portion of a previously defined trading plan—you can change specific settings without rebuilding the entire thing.  Only the information you provide will be altered; everything else stays the same. It’s important to remember that the framework remembers sweep configurations, so changes might only affect newly created instances unless you specifically clear that memory. You'll pass in a piece of the new sweep configuration as an argument.

## Function overrideStrategySchema

This function lets you modify a trading strategy that's already set up within the backtest-kit framework. Think of it as making tweaks to an existing strategy – you don't rebuild it from scratch. You provide a portion of the strategy's configuration, and only those specific parts will be updated; everything else stays as it was before. This is useful for making adjustments without completely re-registering the strategy.


## Function overrideSizingSchema

This function lets you tweak an existing position sizing strategy without replacing it entirely. Think of it as a way to fine-tune a strategy's settings, only changing specific parameters you want to adjust. You provide a partial configuration – just the parts you want to update – and the framework merges these changes with the original sizing configuration. This is useful for making incremental adjustments to your trading strategy.

## Function overrideRiskSchema

This function lets you tweak an existing risk management setup within the backtest-kit framework. Think of it as making adjustments – you provide a set of changes, and it applies them to the current risk configuration.  It won't replace the whole thing, just update specific parts you define.  You give it a partial configuration, and it returns the modified, complete risk schema.


## Function overrideMCPSchema

This function lets you modify an existing MCP configuration. Think of it as a way to tweak a pre-existing setup without rebuilding it from scratch. You provide a partial update – just the pieces you want to change – and the rest of the configuration remains untouched. It's useful for making adjustments to your trading environment without affecting other settings.

## Function overrideLauncherSchema

This function lets you modify a launcher’s configuration after it’s already been set up. Think of it as a way to fine-tune existing settings rather than starting from scratch. You provide a partial configuration – just the changes you want to make – and the function updates the launcher, keeping all the original settings that weren't specified. It's useful for making adjustments without having to redefine the entire launcher.


## Function overrideFrameSchema

This function lets you modify how data is structured for a specific timeframe during backtesting. Think of it as tweaking an existing timeframe's settings – you can change certain aspects, like data fields, but the original setup remains mostly intact. You provide a partial configuration, essentially telling the system which parts of the existing timeframe setup to update. This is useful for fine-tuning your backtesting environment without rebuilding everything from scratch.

## Function overrideExchangeSchema

This function lets you modify an already set up data source for an exchange. Think of it as a way to tweak an exchange's settings without having to rebuild it from scratch. 

You can selectively update parts of the exchange's configuration; anything you don't specify will stay as it was originally defined. It takes a partial exchange configuration as input and returns the modified exchange schema. 


## Function overrideActionSchema

This function lets you tweak the settings of an action handler – think of it as making small adjustments to how your system reacts to specific events. You don't have to completely replace the existing handler; instead, you can just update certain parts of it. This is really handy if you need to change how actions are handled in different environments, or if you want to switch between different implementations without needing to change your core strategy. It’s a targeted way to modify behavior. 

The function takes a configuration object containing the specific settings you want to update. Only those settings you provide will be changed; everything else stays as it was.


## Function listenWalkerProgress

This function lets you keep track of how a backtest is progressing, specifically after each strategy finishes running. It’s like getting updates as the backtest completes each step.

The updates are delivered sequentially, meaning they come in the order they happen, even if your tracking function takes some time to process each update. This helps prevent issues that can arise from trying to handle everything at once.

To use it, you provide a function that will be called with information about the progress of the backtest. This function can be asynchronous, and the system will ensure that it is executed one at a time.


## Function listenWalkerOnce

The `listenWalkerOnce` function lets you react to events from a walker, but only once a specific condition is met. You give it a function that checks if an event is what you're looking for, and another function to run when that event arrives. Once the condition is met and the callback executes, the subscription is automatically stopped, so you don't have to worry about cleaning up. This is really handy when you need to wait for a particular state change within a walker and then take action.


## Function listenWalkerFilter

This function lets you subscribe to updates as a trading strategy "walks" through data, but with a twist: you can specify conditions to only receive updates that meet certain criteria. Think of it as setting up a targeted alert system for your backtesting. You provide a filter function that decides which updates are important, and a callback function that handles those selected updates. The subscription stays active, ensuring you continuously receive relevant updates as the walker progresses. This is a more refined way to monitor the walker's progress compared to the standard listenWalker function.

## Function listenWalkerComplete

This function lets you be notified when a backtest run, managed by the Walker, finishes processing all the strategies. It's like setting up an alert for when the whole testing process is done. Importantly, when the process is complete, it guarantees that the notification (the event) is delivered in the order it was received, and your response to that notification won't run at the same time as other responses – it handles things one at a time. To use it, you provide a function that will be called when the backtest is complete. The function you provide will be given an event object containing information about the walker's completion. To stop listening, simply call the function that's returned.


## Function listenWalker

This function lets you listen in on what's happening as your backtest runs. It’s like setting up an observer to watch each strategy finish. 

You provide a function (`fn`) that will be called after each strategy completes its run. This function gets a special "event" object that contains information about the strategy.

The cool thing is that these events are handled in order, and even if your callback function takes some time to process (like making an API call), it won't interfere with the next strategy finishing. It’s all managed to keep things running smoothly and in sequence.


## Function listenValidation

This function lets you keep an eye on any problems that pop up during the risk validation process. 

It’s like setting up an alert system – whenever a validation check fails and throws an error, this function will trigger your callback.

This is really handy for spotting and fixing issues with your risk validation rules, allowing you to debug and monitor things effectively.

The errors are handled in the order they occur, and your callback runs sequentially, even if it involves asynchronous operations. This ensures that errors are processed reliably and in the right sequence. To stop listening for these validation errors, the callback returns a function that you can call to unsubscribe.


## Function listenSync

The `listenSync` function lets you react to events when your trading signals are being synchronized, like when an order is being opened or closed. It's designed for handling tasks that need to happen in sync with these events.

Think of it as a safety net—if something goes wrong in your listener function (like an error or a rejected order), `listenSync` will handle it and manage retries or closures.

Here's how it works:

*   If an error occurs, it can be classified as transient, leading to retries for opening orders, or rejected, causing immediate termination.
*   Certain errors, such as `OrderDeletedError`, are treated as transient, while others can trigger immediate closure.
*   The callback function you provide will be triggered when synchronization events occur. If that function returns a promise, processing will pause until the promise resolves.

Essentially, it provides a way to monitor and control the synchronization process within your trading system.

## Function listenStrategyCommitUnique

This function lets you keep an eye on when strategies are committed, but with a clever twist. It helps avoid being overwhelmed by repetitive events, ensuring you only process each unique signal once. You provide a filter to decide which events are interesting, and then a function that will be called only when a new, distinct signal is committed and matches your filter. This is great for tracking key changes in your strategies without dealing with unnecessary noise.

## Function listenStrategyCommitOnce

This function lets you set up a listener that reacts to changes in your trading strategy, but only once. You provide a filter to specify which changes you're interested in, and a function to execute when that specific change happens. Once the matching event occurs, the listener automatically stops, preventing it from triggering again. This is really handy when you need to react to an initial setup or a specific action within your strategy.


## Function listenStrategyCommitFilter

This function lets you set up a persistent listener for strategy management events, but with a crucial twist: you can specify a filter. The `filterFn` you provide determines which events actually trigger the callback function (`fn`). Think of it as a sieve – only events that pass your filter will be processed by your callback. This is a powerful way to react to specific types of strategy commits without being overwhelmed by every single event. The listener remains active, continuously delivering matching events as they occur.


## Function listenStrategyCommit

This function lets you be notified whenever your trading strategy undergoes changes or adjustments, like when a scheduled trade is canceled or a partial profit/loss is triggered. It's designed to handle these events one at a time, even if the notification requires some processing time. Think of it as subscribing to a stream of updates about your strategy's management—closing, stop-loss adjustments, and more—keeping everything synchronized. The function returns a way to unsubscribe from these events when you no longer need them.


## Function listenSignalWaitingUnique

This function lets you listen for specific events related to order waiting, but only the very first time they occur for each unique signal. It's particularly useful when you need to react to the initial confirmation of a waiting order – think of it as catching the first "yes" from a signal that might keep sending updates.

Essentially, it filters through these waiting events, executes your provided condition, and then calls your callback function only once per signal ID. After that initial event, it stops listening for that particular signal, preventing repeated notifications. 

This is helpful for scenarios where you want to ensure you’re only reacting to the very beginning of a waiting order’s lifecycle for each signal.

The function returns a cleanup function that you can call to unsubscribe from the events.


## Function listenSignalWaiting

This function lets you tap into events that happen when a trading strategy is waiting for a signal to become active. Think of it as listening for updates while the strategy is poised to act. You'll receive a notification for each tick while a signal is still pending. Because this can generate a lot of updates – one for every tick and every waiting signal – be mindful of the potential volume. If you only need to know when a signal is waiting, not every tick while waiting, explore `listenSignalWaitingUnique` instead. It simplifies things by sending only one event per waiting signal. The function takes a callback function; this callback will be called with the relevant data about the waiting tick.

## Function listenSignalUnique

This function helps you listen for trading signals, but with a twist – it ensures you only get notified about unique signals. It first filters incoming signals based on a condition you provide. Then, it avoids sending you the same signal multiple times if they have the same ID. You'll only receive a notification when a new, unique, and relevant signal arrives, and it's guaranteed to have a signal attached. The callback you provide will be triggered only once for each unique signal ID that passes your filter.

## Function listenSignalScheduledUnique

This function lets you react to specific trading signals as they come in, whether you're testing past performance (backtesting) or live trading. It allows you to filter these signals based on certain criteria, so you only receive the ones you're interested in. Essentially, it's a way to listen for new signals and do something with them – like updating a display or triggering another action – only when a unique signal appears. The function returns a way to unsubscribe from the signal stream when you're done.

## Function listenSignalScheduled

This function lets you be notified when a signal is scheduled, meaning a trading opportunity is waiting for a specific price to be reached. It's useful for strategies that react to signals that aren't triggered immediately.

You provide a function that will be called each time a new signal is scheduled. The information passed to your function includes details about the scheduled event, like the target price the signal is waiting for. 

Think of it as a way to listen for those "waiting" ticks that come before a trade is actually executed based on a scheduled signal. 

The function returns another function that you can use to unsubscribe from these notifications when you no longer need them.


## Function listenSignalOpenedUnique

This function lets you keep an eye on when new trading signals are opened, but only once for each unique signal ID, whether it’s a live trade or part of a backtest. You provide a filter function to decide which signals you're interested in, and then a callback function that gets executed each time a new, unique signal opens that matches your filter. Think of it as a way to react to the initial opening of a trade without being repeatedly notified for the same trade. The function returns a way to unsubscribe from this event stream when you're finished.


## Function listenSignalOpened

This function lets you tap into events whenever a new trading position is opened, whether it's part of a live trading strategy or a backtest. You provide a function that will be called each time a position is initiated, giving you details about that opening event. It’s like setting up an alert to be notified whenever a trade begins. The function you provide is returned, allowing you to unsubscribe from these notifications later if needed.


## Function listenSignalOnce

This function lets you subscribe to trading signals, but with a twist – it only runs your code *once* when a specific condition is met. Think of it as setting a temporary watch for a particular signal.

You provide a filter – a rule that determines which signals you’re interested in. Then, you give it a function to run when that signal appears.

Once that signal is detected and your function has executed, the subscription automatically ends. This is really handy for situations where you only need to react to a signal once, and don't want to keep listening afterward. 

It returns a function that lets you stop the subscription manually if needed.


## Function listenSignalNotifyUnique

This function lets you keep track of signal events, but in a smart way that prevents duplicate notifications. It's designed for when a strategy might be sending out the same signal information multiple times.

Essentially, you provide a filter to decide which signal events you care about, and then a function that gets called only when a *new* signal ID appears, ignoring repeated signals with the same ID. This ensures you're only notified about unique signal changes.

The function returns a function that you can call to unsubscribe from these notifications later.

## Function listenSignalNotifyOnce

This function lets you temporarily listen for specific signal events and react to just the first one that matches your criteria. You provide a filter – a way to identify which events you're interested in – and a callback function that will execute once a matching event is found.  After that single execution, the listener automatically stops, so you don't have to worry about manually unsubscribing. It's perfect for scenarios where you need to respond to an event just once and then move on.

## Function listenSignalNotifyFilter

This function lets you set up a continuous listener for specific signal events. You provide a filter—essentially a rule—that determines which events you're interested in. Only the events that meet your filter criteria will trigger the callback function you also provide. Think of it as a way to focus on a subset of all possible signals, ensuring you only react to the ones that matter for your trading strategy. The listener stays active until you explicitly unsubscribe, keeping you informed of ongoing relevant events.

## Function listenSignalNotify

This function lets you listen for notifications whenever a trading strategy sends out a signal note related to an active trade. Think of it as a way to be alerted when a strategy wants to communicate something specific about a position it's holding.

The notifications are handled in a specific order, and even if your notification handling process takes some time, the system makes sure events are processed one at a time, preventing conflicts.

To use it, you provide a function that will be called whenever a signal notification is available. This callback function receives information about the signal itself.  When you’re done listening, the function returns another function that you can call to unsubscribe.

## Function listenSignalLiveWaitingUnique

This function lets you listen for specific signals coming from live trading executions, ensuring you only receive each signal once. It's designed to handle situations where a trade is waiting for a condition to be met – imagine a resting order waiting to be filled.

The callback function you provide will only fire when the waiting condition is met for the very first time. Even if that condition remains true for a long time, the callback won't be triggered again for that same signal.

Importantly, this system only works with signals from live trading, not from historical backtests. It’s designed to avoid accidental triggering from old data.

To prevent interference, the deduplication works independently for each strategy, exchange, frame, mode, and symbol – so multiple strategies won't suppress each other. The function remembers the last signal ID it processed, discarding any duplicates.

You can use a predicate function to filter the signals you're interested in. This filter runs before the deduplication, meaning it can’t accidentally hide a valid signal later on. 


## Function listenSignalLiveWaiting

This function lets you listen for updates while a trading strategy is waiting for a signal to activate during a live run. 

Think of it as a notification system that tells you about potential trades *before* they actually happen. You'll receive these updates as long as the strategy is paused, anticipating a signal.

The information you get includes details about the signal that’s waiting, and a theoretical profit and loss (pnl) calculation—remember, no positions are open yet, so it’s just an estimate.

It's specifically designed for live trading scenarios (from `Live.run()`) and won't trigger during backtests, making it a safe place for actions like sending notifications or mirroring orders. The events are already categorized by action, so you don't need extra checks to see what kind of event it is. 

You just provide a function (`fn`) that will be called whenever a waiting tick result is available. When you're finished, the function returns another function that you can call to unsubscribe.

## Function listenSignalLiveUnique

This function lets you listen for new trading signals as they come in during a backtest. It's designed to give you a notification each time a unique signal is generated – think of it as getting a ping when a new trading opportunity arises.

It only works with signals produced by the `Live.run()` process, so you won't receive notifications during idle periods.

You provide a filter function to decide which signals you're interested in, and a callback function that will be executed when a matching, new signal appears. The callback will be invoked with the details of the signal event. The subscription can be canceled by returning the returned function.


## Function listenSignalLiveScheduledUnique

This function lets you listen for specific scheduled tick results coming from live trading executions, ensuring you only get each signal once. Think of it as a way to react to signals as they're generated during a live trade, but only the first time you see them. 

It's designed for live executions only; backtesting won’t trigger this listener. The function cleverly prevents duplicate signals by remembering the last signal ID it processed within a specific trading context (strategy, exchange, etc.). 

A key feature is that the filter you provide is checked *before* any de-duplication occurs, meaning a rejected event won't block a subsequent one. You give it a rule to decide which signals are important, and it only passes those that fit.

## Function listenSignalLiveScheduled

This function lets you listen for notifications when a trading strategy initiates a new order based on a scheduled signal during a live trading session. It’s a one-time notification that happens right when the strategy requests an order – before any actual trade has occurred.

Think of it as a signal that the strategy is poised and waiting for the market to reach a specific price. It’s specifically designed for actions you want to happen in real-time, such as sending alerts or mirroring orders.

Importantly, this function only works with live trading; it won't trigger during backtesting. This makes it a safe place for actions that have real-world consequences. The information provided is tailored to the specific type of event happening, so you don’t need to check the event type.


## Function listenSignalLiveOpenedUnique

This function lets you listen for when a trading strategy opens a new position in a live, active market. It ensures you only receive notifications once for each new trading opportunity, even if the system tries to send multiple signals for the same trade.

Think of it as a way to react to new trades happening *right now* in your live trading environment. 

It’s designed to avoid sending duplicate notifications. 

The function operates on data from live trading executions, so it won’t trigger during backtesting or historical data replays.

The filtering happens *before* any duplication checks, guaranteeing that even if a signal is initially filtered out, it won’t prevent a later, similar signal from being delivered.

You provide a filter function to decide which opened positions you're interested in and a callback function that will be executed once for each matching position. This callback is guaranteed to only run once for each unique trading signal.

## Function listenSignalLiveOpened

This function lets you listen for when a new trade is actually opened during a live trading session. 

It's triggered when your strategy produces a signal to enter a position, whether that's an immediate order or a scheduled one. 

The event you receive will contain details about the trade, like the entry price and stop-loss/take-profit levels.

Importantly, this callback *only* works with live trading; it won’t be called during backtesting replays. This makes it safe for actions like sending notifications or placing orders in a real brokerage. 

You don't need to check the `action` field in the event data, as it will always represent an opening signal.


## Function listenSignalLiveOnce

This function lets you react to specific signals coming from a live trading simulation. It's designed to listen for events and perform an action just once.

You provide a filter – a test that determines which signals you’re interested in – and a callback function that gets executed when a matching signal arrives.

Once the callback runs, the subscription is automatically removed, so you won’t receive any further signals through this listener. It's perfect for one-off actions based on live data.


## Function listenSignalLiveIdle

This function lets you listen for moments when your trading strategy isn't actively doing anything – it's not holding a position and has nothing scheduled to do. 

Think of it as a way to get notified when your strategy is "idle."

You provide a function that will be called each time this idle state is reached, giving you information like the current price and symbol being traded. Because this function only gets called during live trading and never during backtesting, it's a safe place to put things that need to happen in the real world, like sending notifications or logging heartbeat data. It's designed to be straightforward, so you don’t need to check what kind of event it is – it's *always* an idle event.

## Function listenSignalLiveFilter

This function helps you listen for incoming trading signals, but with a special twist: you can choose which signals you want to actually react to. It’s like setting up a filter – only signals that meet your specific criteria will trigger the action you define. Think of it as a persistent subscription; once you start listening, it keeps going until you explicitly stop it. This is a refined version of the `listenSignalLive` function, offering more control over which signals your application processes.

## Function listenSignalLiveClosedUnique

This function lets you react to specific closed positions from live trading executions, ensuring you only receive each signal once. It’s like having a safety net to prevent duplicate notifications.

You provide a filter function to determine which closed positions you’re interested in, and a callback function that gets executed for those matching positions.

Important to know: this only works with live executions – backtest replays won't trigger it.

The system keeps track of signal IDs to avoid duplicates even if multiple strategies are running concurrently. The filter function is checked before any signal deduplication, guaranteeing that no events are missed.

## Function listenSignalLiveClosed

This function lets you react to when a live trade closes. 

It’s specifically for trades executed through `Live.run()`, so you won't get these signals during backtesting. 

Think of it as a notification system for real-time events like hitting a stop-loss, take-profit, or manual closure. You’ll receive details such as the reason for closing, the timestamp, and the realized profit and loss, all already adjusted for fees and slippage. 

Because the events are already categorized, you don't need to check the `action` field before processing the closing details. This makes it ideal for tasks that need to happen immediately when a trade concludes in the live environment, like sending notifications or updating external systems.

## Function listenSignalLiveCancelledUnique

This function lets you listen for when a trading signal is cancelled during a live trading session. It ensures you only receive each cancellation notification once, acting as a safeguard against repeated emissions.

You'll only receive these cancellation notifications when using `Live.run()`, so backtesting won’t trigger them.

The function intelligently prevents duplicate notifications even if you’re running multiple strategies simultaneously, as it considers factors like the strategy, exchange, frame, mode, and symbol.

It prioritizes your filter function, running it *before* any deduplication. This means if your filter rejects an event, it won't interfere with potentially receiving it later.

Essentially, you provide a filter to choose which cancellations you care about, and a function to handle those specific cancellations in a single, reliable way.


## Function listenSignalLiveCancelled

This function lets you get notified when a live trading signal is cancelled before it becomes a trade. Think of it as a way to know when a planned trade didn't happen – perhaps the price moved unexpectedly, or the waiting period simply expired.

It only works with live trading executions, never during backtesting, so it's perfect for tasks that need to react in real-time, like sending alerts or updating your trading dashboard.

You'll receive information about *why* the signal was cancelled, and if a user directly cancelled the trade, you’ll also know the cancellation ID. 

You provide a function that gets called when a cancellation happens, and that function returns another function which can be used to unsubscribe to this event.

## Function listenSignalLiveActiveUnique

This function lets you listen for specific events coming from live trading executions, but it’s smart about preventing unnecessary callbacks. It only triggers once for each unique trading signal, ensuring you only get notified about important changes.

Think of it as a way to set up alerts—like when a trade reaches a certain profit level—and only get the alert once, even if the trade keeps ticking.

This listener only works with live executions; it won't react to data from backtests. Importantly, it keeps track of which signals it’s already notified about, so multiple strategies running the same trade won't interfere with each other.

You provide a filter function to decide which events are interesting, and then a callback function that gets executed when a matching event occurs. The filter runs first, so a signal that initially doesn't meet the criteria won’t be remembered for future checks.


## Function listenSignalLiveActive

This function lets you tap into live trading data as your strategies are actively running. It sends you updates every tick while a position is open, providing crucial information like your current profit and loss (`pnl`), and how close the price is to your take-profit or stop-loss levels.

Think of it as a direct feed of real-time data from your Live.run() executions – it won't trigger during backtests. Because of this, it’s perfectly safe to use for actions that have real-world consequences, like sending alerts or automatically placing orders. The information is neatly structured, so you don’t need to filter events based on action type. It's designed to be a high-frequency stream, so be prepared to handle a lot of data.

## Function listenSignalLive

This function lets you tap into the live trading signals generated by a backtest. It's like setting up an observer that gets notified whenever a signal happens during a live run.

Think of it as subscribing to a stream of events. 

The `fn` you provide is the code that will be executed each time a new signal event comes in – this is where you'll handle what to do with the signal.

Importantly, these signals only appear when you’re running a live backtest using `Live.run()`, and they're delivered in the order they occur. This function returns another function that you can call to unsubscribe from the live signal events.

## Function listenSignalIdle

This function lets you get notified whenever your trading strategy isn't actively managing a position – basically, when it’s "idle." Think of it as a signal that the strategy is just observing the market.

You provide a function that will be called whenever this idle state occurs.

The information provided will include the current price, and details about the strategy and exchange being used. It's useful for tasks like monitoring overall market conditions or tracking strategy performance when not actively trading. It's all about those moments where there's no signal and nothing is happening.

## Function listenSignalFilter

This function lets you subscribe to specific signal events that meet a certain condition. Think of it as a way to only receive events that are relevant to what you're trying to do. It's similar to listening for events continuously, but with a filter – only events that pass the filter you provide will trigger the callback function. The listener remains active, so you'll continue to receive matching events as they occur.

You provide a function (`filterFn`) that determines if an event should be processed, and another function (`fn`) that's executed when a matching event is received. The filter function allows you to selectively respond to only the events you’re interested in.


## Function listenSignalEventUnique

This function lets you listen for specific lifecycle events related to signals, ensuring you only get notified once for each unique signal ID. It's a way to track signals, but it avoids repetitive notifications – you'll only receive a callback for each new signal. If a signal has multiple events (like opening and closing), you can use a filter to only catch the events you're interested in, preventing duplicates.  You provide a filter function to decide which events are important and a callback function to handle the relevant events. The function returns an unsubscribe function that you can use to stop listening.


## Function listenSignalEventOnce

The `listenSignalEventOnce` function lets you watch for specific events happening within the backtest system. Think of it as setting up a temporary listener that only reacts once when it sees the event you're looking for. 

You provide a filter – a rule that determines which events should trigger the listener – and a function that will be executed exactly one time when a matching event occurs. After that single execution, the listener is automatically removed. It's handy for things like waiting for a trade to open or close and then immediately taking action.


## Function listenSignalEventFilter

This function lets you set up a persistent listener for signals, but with a twist: you can specify a filter. Only signals that meet your criteria (defined by `filterFn`) will trigger the callback function (`fn`). Think of it as a focused subscription – you're only getting the signals you're interested in. The listener will continue to deliver matching events as they happen, so it's designed for ongoing monitoring. It returns a function that you can call to unsubscribe.

## Function listenSignalEvent

This function allows you to keep track of what's happening with your trading signals. It lets you listen for when a new signal is created or when an existing one is closed. 

You'll get notified about signals that are opened, whether they were triggered automatically or by you, and also when they're closed due to profit targets, stop-loss orders, or time expiration.

Importantly, the events happen in the order they occurred, even if your response to them takes some time to complete. This ensures you're seeing the full picture of your signal activity during both live trading and backtesting. To use it, you provide a function that will be called whenever a new signal event occurs, letting you react to those changes. You can unsubscribe from these events when you no longer need them.

## Function listenSignalClosedUnique

This function lets you keep an eye on when trading signals are closed, but it's smart about it – it only triggers the callback once for each unique signal ID. You provide a filter function to decide which closed signals you're interested in, and then a callback function that runs whenever a new, unique closed signal is detected. Think of it as a way to react to significant signal closures without getting overwhelmed by duplicates. The function returns an unsubscribe function to stop listening.


## Function listenSignalClosed

This function lets you listen for events when a trading position closes, whether it's from a live trade or a backtest simulation. It's a great way to track when trades end and get key information about why and when they closed. You’ll receive details such as the profit and loss (`pnl`), the reason for the closure (`closeReason`), and the exact timestamp of the closure (`closeTimestamp`). The function returns another function that you can call to unsubscribe from receiving these closing events.

## Function listenSignalCancelledUnique

This function lets you listen for cancelled tick results – those situations where a trade order wasn't fully executed.  It's designed to be unique, meaning you'll only receive notifications for each distinct signal ID, whether you're in a live trading environment or running a backtest. You provide a filter function to decide which cancelled events you care about, and then a callback function that will be executed whenever a matching cancelled event occurs for a new signal. The function returns a cleanup function that you can use to unsubscribe from these events when you no longer need them.

## Function listenSignalCancelled

This function lets you get notified when a trading signal is cancelled before a trade even begins. 

Think of it as a way to be alerted when something prevents a signal from triggering a trade, like a system error or a change in strategy.

You provide a function that will be called whenever a signal is cancelled, and that function will receive information about why the cancellation occurred. 

This can be useful for debugging or understanding why your strategy isn't behaving as expected.


## Function listenSignalBacktestWaitingUnique

This function lets you listen for specific events during backtesting, ensuring you only receive each signal once. It focuses on “waiting” states – those moments when a trading strategy is patiently waiting for a resting order to activate.

Think of it as a way to get notified about significant milestones in your backtest, but only the first time they happen for each trading opportunity. 

The function cleverly avoids repeatedly triggering your callback for the same signal, even if the "waiting" period is lengthy.  It also ensures that different strategies running simultaneously won't interfere with each other's notifications.

Importantly, this only works within backtest simulations – it won’t be triggered by live trading. You provide a filter to select the events you're interested in, and a callback function that will execute when a matching event occurs. The filter is applied before any deduplication takes place, guaranteeing that it won't miss any events.

## Function listenSignalBacktestWaiting

This function lets you tap into a special stream of data during backtesting, specifically when a signal is waiting to be triggered. Think of it as a peek at what *could* happen before a trade actually occurs. You'll receive updates for each tick while a signal is patiently waiting, showing you the potential entry details and theoretical profit/loss – without any real risk involved.

It’s designed exclusively for backtesting scenarios, ensuring your analysis and reporting aren’t affected by live trading data. The information is already organized by action, so you can immediately access the relevant details without extra checks. This makes it ideal for in-depth replay analysis and generating reports focused on these waiting periods.


## Function listenSignalBacktestUnique

This function lets you tap into the stream of signals generated during a backtest. It’s designed to process events triggered specifically by the `Backtest.run()` method, so you won't receive signals from other sources. 

The function uses a filter to decide which signals you actually want to see; you provide a function that determines whether a particular signal event should be processed. The callback function you provide then executes once for each unique signal id that passes the filter.  You can think of it as a way to react to distinct signals as they appear during the backtest process. It also ignores signal events with a null signal, so you only get notified about actual trading signals.

## Function listenSignalBacktestScheduledUnique

This function lets you react to specific results from your backtest runs, ensuring you only get notified about each signal once. It's designed to be a safeguard against duplicate emissions during backtesting.

It listens for "scheduled" tick results, but only during backtest executions - meaning it won’t fire when you're doing live trading.

The function uses a smart system to avoid duplicates. It considers the strategy, exchange, frame, mode and symbol, so multiple strategies running in parallel won’t interfere with each other. It remembers the last signal ID it handled and ignores any repeats.

Before deciding whether to notify you, it checks a filter function. This means the filter function’s results aren’t affected by previous duplicates, and a rejected event won’t block a later, similar event from being processed.

You provide two things: a filter function to decide which results you want to see, and a callback function that gets called once for each signal that passes the filter. The callback function receives the tick result data. The function returns a cleanup function, which is needed to unsubscribe from the event.

## Function listenSignalBacktestScheduled

This function lets you listen for specific moments during a backtest when your strategy is actively waiting for a market price to reach a target. 

Think of it as getting notified when your strategy places an order, but hasn't yet filled. 

It's designed for analyzing backtest runs – it won’t work during live trading, keeping your reports clean and focused on historical data.

The information you receive details the exact conditions when that wait began, and you don’t need to check the event type because it's already filtered to these scheduled events.

You provide a function that will be called each time a scheduled event occurs, giving you access to details about that specific waiting signal.


## Function listenSignalBacktestOpenedUnique

This function lets you listen for specific events when a backtest starts a new trading position. It ensures you only receive this information once for each unique trading setup, acting as a safeguard against repeated signals. 

The events originate only from backtest simulations, guaranteeing they won't be triggered by live trading activity.

To use it, you provide a filter to narrow down which events are passed through, and a function to execute when a filtered event occurs. The filter runs first, so it can prevent unwanted events from ever being considered. The listener remembers which signals it’s already processed for each backtest run, preventing duplicates within that execution.

## Function listenSignalBacktestOpened

This function lets you listen for when a trading position actually starts during a backtest. 

Think of it as a notification that a trade has been executed – whether it was triggered immediately or through a schedule. 

You’ll get information about the signal that caused the trade, including the entry price and stop-loss/take-profit levels. It's specifically for backtesting, so you won't receive these notifications in live trading environments, making it a clean way to analyze backtest results or generate reports. The data is delivered directly without needing extra checks. 

You provide a function (`fn`) that will be called each time a new position is opened. The function you provide will return a function that can be used to unsubscribe from the signal.

## Function listenSignalBacktestOnce

This function lets you temporarily listen for specific events generated during a backtest. Think of it as setting up a one-time alert for a particular signal. 

You provide a filter – essentially, a rule that determines which events you’re interested in – and a function to execute when a matching event occurs. 

Once that single event is processed, the function automatically removes itself from listening, ensuring it only runs that one time. This is useful for quick diagnostics, verifying a specific signal, or performing a one-off calculation based on a particular backtest event.


## Function listenSignalBacktestIdle

This function lets you tap into the backtest process and get notified when your trading strategy isn't actively doing anything – it's in a "waiting" state.

Imagine you want to monitor how often your strategy is just sitting still, or log a heartbeat to confirm it's still running during a backtest.

This is the perfect way to do that. The notifications are exclusive to backtest runs, so you won't be bothered by real-time trading activity.

The events you receive provide basic information like the current price, the trading symbol, and details about your strategy, exchange, and timeframe, but the `signal` value will always be empty. This makes it a clean and focused channel for observing your strategy’s quiet moments during backtesting.

## Function listenSignalBacktestFilter

The `listenSignalBacktestFilter` function lets you set up a persistent listener for specific events during a backtest. Think of it as a way to focus on only the signals that meet certain criteria you define. You provide a filter function – this checks each incoming signal to see if it’s relevant to your needs. If a signal passes this filter, your callback function will be triggered. Importantly, the listener continues to receive and process every matching event, so you don't need to worry about the subscription expiring. It's a filtered version of `listenSignalBacktest`, giving you targeted event handling.

## Function listenSignalBacktestClosedUnique

This function lets you listen for when a backtest strategy has closed a position, but it ensures you only receive each closing event once. It's a safety measure to prevent accidental duplicates during backtesting. 

The function works by filtering the closing events based on a condition you provide. Then, it makes sure the callback function is only executed once for each unique combination of strategy, exchange, frame, mode, and symbol. 

This means that even if you're running multiple strategies at once, each closing event will be reported just once. It only works with backtest data; it won't trigger during live trading. The filtering happens before the deduplication, so any events that don't meet your criteria won't be tracked and won't affect later events.

You provide a filter function to decide which events you want to receive, and a callback function that will be called with the closing event data if it passes the filter and hasn't been seen before. The function returns a cleanup function to unsubscribe.

## Function listenSignalBacktestClosed

This function lets you listen specifically for when positions close during backtesting runs. 

It provides detailed information about each closing event, including why the position closed (like a take profit or stop loss), the exact timestamp, and the realized profit/loss, accounting for fees and slippage. 

Think of it as a dedicated channel for analyzing backtest results, completely separate from live trading data. You won't need to filter events; the information is directly delivered without extra checks. It's perfect for generating reports or doing in-depth analysis of your backtest performance. The connection is closed when the function returns.

## Function listenSignalBacktestCancelledUnique

This function lets you listen for notifications when a trading strategy’s tick results are cancelled during a backtest. It ensures you only receive each cancellation notification once, even if the backtest is running repeatedly.

Think of it as a way to be alerted when a resting order is dropped during a backtest simulation, but only if it’s a new cancellation you haven't already seen.

It’s important to note that this is strictly for backtesting – it won’t trigger during live trading. The function identifies unique cancellations based on several factors like the strategy, exchange, frame, mode and symbol used in the backtest.

You provide a filter to decide which cancellation events you’re interested in. The filter is applied before any cancellation is suppressed, so you won’t miss relevant events. 

Finally, the function returns a cleanup function that you can use to unsubscribe from the cancelled tick results when you no longer need it.


## Function listenSignalBacktestCancelled

This function lets you listen for situations where a trading signal was dropped during a backtest, before a trade ever started. It's useful for understanding why signals aren't being executed—perhaps a timeout occurred, the price moved unexpectedly, or the user cancelled the signal.

You’ll only receive these notifications when running backtests with `Backtest.run()`, not during live trading, so it’s perfect for analyzing backtest results and generating reports without interference from real-time trading data. The information provided will include the reason for cancellation and a unique identifier for user-initiated cancellations.

To use it, you provide a callback function that will be triggered when a signal is cancelled. The callback receives a specific event object containing details about the cancellation.

## Function listenSignalBacktestActiveUnique

This function lets you listen for specific events during a backtest, ensuring you only receive information about a trade once. It’s designed for situations where you want to react to a trade reaching a certain point, like a 5% profit, and then not be bothered by further updates for that same trade.

The function filters the tick results from backtests, allowing you to specify a condition that must be met before you receive a notification. Importantly, this filtering happens *before* any de-duplication, so no event will be missed.

It’s specifically for backtesting – live trading won't trigger this listener. The de-duplication works within a single backtest execution, preventing multiple strategies from interfering with each other’s notifications. Think of it as getting a notification for the first time a condition is met for a trade, and then staying silent until a new trade signal arises.

## Function listenSignalBacktestActive

This function lets you tap into the live data stream during backtesting simulations. 

It provides tick-by-tick updates while a trading position is open, giving you details like the current profit and loss, and how close the price is to hitting your take-profit or stop-loss levels.

Think of it as a way to monitor a backtest as it unfolds.

It's specifically for backtesting—you won't get data from live trading—so it’s perfect for analyzing and reporting on backtest results without interference from real-world market noise.

The data you receive is already organized, so you won't need to filter events based on action types. 

To use it, you pass in a function (`fn`) that will be called with each of these active tick result events. The function you provide will return a function to unsubscribe.

## Function listenSignalBacktest

`listenSignalBacktest` lets you hook into the backtest process and receive updates as they happen. 

Think of it as setting up a listener that gets triggered whenever a signal is generated during a backtest run – specifically from `Backtest.run()`. 

The function you provide (`fn`) will be called with the latest information from the backtest in each event, and these events are processed one after another in the order they arrive.  It returns an unsubscribe function, so you can easily stop listening when you no longer need the updates.


## Function listenSignalActiveUnique

This function lets you monitor active trading signals, but in a smart way – it only triggers once for each unique signal. Think of it as a way to react to new signals without being overwhelmed by repeated updates. It's designed to work with both live and historical (backtest) data.

The `filterFn` lets you specify exactly which signals you're interested in; only signals that match this filter will trigger the callback function.

The callback function (`fn`) is executed just once when a new unique signal meets your filtering criteria. This is helpful if you only need to perform an action the first time a signal occurs, and not every time it’s updated. Because active ticks can repeat while a position is open, you'll receive the initial tick and then the listener effectively pauses until the next new unique signal appears.


## Function listenSignalActive

This function lets you tap into what's happening with your trades as they're running – whether it’s a live trade or a backtest. It sends updates whenever a position is open, providing information like your current profit and loss, and how close you are to your take profit and stop loss levels. Be aware that you'll receive a signal for *every* tick of *every* open position, so it can generate a lot of data. If you're dealing with many positions and want fewer updates, consider using the `listenSignalActiveUnique` function instead. You provide a callback function that will be triggered with the active tick data.

## Function listenSignal

This function lets you listen for signals generated by your trading strategy, like when a trade opens, closes, or becomes active. It guarantees that these signals are processed one at a time, even if your code needs to do something asynchronous (like making an API call). Essentially, you provide a function that will be called whenever a signal event occurs – idle, opened, active, or closed – and this function handles them in the order they arrive, preventing any conflicts or issues that might arise from running things simultaneously. The function returns another function that can unsubscribe you from the signal events.

## Function listenSchedulePingUnique

This function helps you listen for specific signals related to scheduled trades. Imagine you have orders waiting to be triggered – this function lets you track those. It groups multiple signals into a single notification, so you don't get bombarded with updates for every single tick. You provide a filter to specify which signals you're interested in, and then a function that gets called when a new, relevant signal appears. Essentially, it’s a way to streamline the information you receive about your waiting orders.


## Function listenSchedulePingOnce

This function lets you react to specific ping events, but only once. It's designed to listen for events that meet a certain condition, then immediately execute a piece of code related to that event, and then stop listening. Think of it as setting up a temporary alert – you want to know when something specific happens, do something about it, and then move on. You define the condition you’re looking for with a filter, and provide the action you want to take when that condition is met. After the function executes once, it automatically stops listening.


## Function listenSchedulePingFilter

This function lets you listen for specific schedule ping events and react to them. It's like setting up a special alert system where only certain types of events trigger your response. You provide a filter – a test to see if an event is important – and a callback function that runs when a matching event arrives. The system remembers this subscription and will continue to deliver matching events as they happen.

## Function listenSchedulePing

The `listenSchedulePing` function lets you keep an eye on scheduled trading signals as they wait to be activated. Every minute, while a signal is in this waiting period, it sends out a "ping" event. This allows you to build custom monitoring logic, such as logging or implementing checks, to track the signal's progress and lifecycle. You provide a function that will be called each time a ping event happens, giving you the details of that event to work with. When you're done needing to listen, the function returns another function that you can call to unsubscribe.

## Function listenRiskOnce

This function lets you react to specific risk rejection events just once and then automatically stops listening. 

You provide a filter to identify the events you're interested in, and a function to execute when a matching event occurs. It's perfect for situations where you need to respond to a particular condition, like waiting for a specific risk threshold to be breached, and then taking action only one time. After the callback runs, the subscription is automatically cancelled.

## Function listenRiskFilter

This function lets you watch for specific risk rejection events and react to them. Think of it as setting up a targeted alert system for when certain risk conditions are triggered. You provide a filter that defines which events you’re interested in, and then a function that will be executed whenever an event matches that filter. Importantly, the subscription persists, meaning you’ll continue to receive updates as long as the conditions are met, and the function returns a way to stop that subscription.

## Function listenRisk

The `listenRisk` function lets you monitor for situations where a trading signal is blocked because of risk checks.

It's designed to only notify you when a signal *fails* the risk validation – so you won't be flooded with updates about signals that are perfectly fine.

The events are handled one at a time, ensuring a predictable order, even if your callback function takes some time to complete.

Essentially, it’s a way to react specifically to risk-related signal rejections within your trading system. You provide a function that gets called whenever this happens.


## Function listenPerformance

This function lets you keep an eye on how long different parts of your trading strategy take to run. It sends performance data – like how long calculations or order placements take – to a function you provide.

Think of it as a way to profile your strategy, helping you find slow spots and optimize for speed. 

The data arrives as a series of events, and these events are processed one after another in the order they come, even if the function you provide takes some time to complete. A special queuing system ensures that your function runs safely and doesn't get interrupted by other operations.

You give it a function, and it returns another function that you can use later to unsubscribe from these performance updates.


## Function listenPauseOnce

This function lets you listen for specific pause events and react to them just once. You provide a filter to determine which events you're interested in, and a function that will be executed when a matching event occurs. After that one execution, the listener automatically stops, so you don't have to worry about manually unsubscribing. It's great for situations where you need to react to a pause event a single time and then move on. 

The filter function helps you narrow down which pause events trigger your callback.


## Function listenPauseFilter

This function lets you react to changes in a trading contract's pause state, but with extra control over which changes you care about. You provide a filter – a function that decides whether an event is interesting – and a callback function to handle those interesting events. The listener will stay active, continuously checking for and delivering events that meet your filter criteria. Think of it as a way to only be notified about pause state changes that specifically matter to your strategy.

## Function listenPause

This function lets you keep track of when a trading strategy is paused or resumed. It’s like setting up an alert system to notify you whenever a strategy's activity is temporarily stopped or started again.

You’ll get these notifications when the strategy's pause state is actively changed – for example, when new trades are put on hold, or when existing orders are allowed to close.

The notifications happen in the order they're received, and the system makes sure that actions related to these pause/resume events don't interfere with each other.  You can use it to create alerts or updates for users.

To use it, you provide a function that will be called whenever the pause state changes.  This function will receive information about the change, such as the type of pause.


## Function listenPartialProfitAvailableUnique

This function lets you keep an eye on when a partial profit level is reached in your trades. It's designed to ensure you only receive information about each unique signal once, focusing on the first profit level achieved for that signal. If you need to track every single profit level for a particular signal, you'll want to use the more general `listenPartialProfitAvailable` function and manage the tracking yourself, or create a more specific filter. You provide a function to decide which events you’re interested in, and another function that gets called whenever a matching event occurs.


## Function listenPartialProfitAvailableOnce

This function lets you set up a one-time alert for when a specific profit level is reached during a backtest. You provide a filter that defines what conditions trigger the alert, and a function to execute when that condition is met. Once the alert goes off, the function automatically stops listening, so it's perfect for reacting to a unique situation and then moving on. It's like saying "Hey, tell me *just once* when this specific profit target is hit."


## Function listenPartialProfitAvailableFilter

This function lets you monitor for partial profit levels achieved during backtesting. It's like setting up a watch – you provide a rule (`filterFn`) that defines what events you're interested in, and then a function (`fn`) to be executed each time an event matches that rule. The key difference from other listeners is that this one keeps delivering updates for the same signal as new partial profit levels are reached. It’s a great way to react to ongoing progress towards a profit target.

## Function listenPartialProfitAvailable

This function lets you track your trading progress as it hits certain profit milestones, like reaching 10%, 20%, or 30% profit. It sends notifications whenever these milestones are reached. Importantly, these notifications are handled one at a time, even if your code takes some time to process each one, ensuring things don’t get out of order or cause problems. You provide a function that will be called each time a profit milestone is hit, and this function receives information about the event.


## Function listenPartialLossAvailableUnique

This function lets you keep an eye on partial loss levels, essentially acting as a listener for when losses happen. It's designed to prevent you from getting overloaded with notifications – you’ll only receive information for the first loss level of each signal. If you need to track every single loss level, be sure to narrow down your filtering criteria. You provide a function to decide which events you care about, and another function that gets executed when an event you care about occurs. The listener itself can be stopped later by calling the function it returns.

## Function listenPartialLossAvailableOnce

This function lets you set up a listener that reacts to changes in partial loss levels, but it only triggers once when a specific condition is met. You provide a filter – a test to see if the loss event matches what you’re looking for – and a callback function that gets executed when the event passes the filter. After the callback runs, the listener automatically stops, so you don't have to worry about managing subscriptions yourself. It's perfect for situations where you need to react to a particular loss situation just one time.

You essentially tell it “Hey, watch for these loss conditions, and when you see one, run this action, then stop watching."


## Function listenPartialLossAvailableFilter

This function lets you stay informed about partial loss levels that meet a specific condition you define. You provide a test (`filterFn`) to determine which events you're interested in, and then a function (`fn`) that gets executed each time a relevant event occurs.  Essentially, it’s a way to continuously monitor partial loss levels and react only when the events align with your criteria, ensuring you don’t miss any updates for those specific levels. The subscription remains active, so you'll keep receiving these filtered events.

## Function listenPartialLossAvailable

This function lets you monitor your trading strategy's progress in terms of losses. It will notify you whenever the strategy reaches certain loss levels, like 10%, 20%, or 30% loss. 

Importantly, these notifications are handled in the order they occur, and even if your callback function takes some time to process (like if it’s doing some calculations), it won't interfere with subsequent notifications. It ensures that your loss level checks are processed one at a time.

You provide a function as input, and this function will be called whenever a partial loss level is reached. The function receives information about the partial loss event itself. The function you provide will return a function that can be used to unsubscribe from the listener.

## Function listenOrderStop

This function lets you listen for specific events related to order stops – moments when a check has definitively ended. Think of it as a notification system for order stops that have reached a final state.

It works hand-in-hand with another system that allows orders to continue, and it only sends notifications when a stop check is completely resolved, either because the order was deleted or after a certain number of failed attempts.

You'll receive these notifications *before* the system closes down the check, with details about the reason for termination and how many failures occurred.

Importantly, this function is only used during backtesting; it doesn’t run in live trading environments.  Any errors you encounter while processing these events won't interrupt the overall process; they'll be logged and handled internally.

To use it, you provide a callback function (`fn`) which is called whenever a stop event happens, and the function returns a way to unsubscribe from the events. If your callback returns a promise, the events will be processed one after another.

## Function listenOrderScheduleUnique

This function lets you monitor specific lifecycle events related to trading signals, but with a clever twist: it ensures you only receive notifications for each unique signal ID once. Think of it as a way to avoid getting bombarded with the same information repeatedly. 

You can use a filter function to narrow down which events you're interested in – perhaps you only care about signals that are being scheduled, or those that are being cancelled. The callback function you provide will then be executed whenever a matching event occurs for a new signal. This is a powerful tool for building responsive and efficient trading systems.

## Function listenOrderSchedule

This function lets you keep an eye on when scheduled orders are created and potentially cancelled. You'll get notifications when a strategy requests an order to be placed at a specific price, and the system is waiting for the market to reach that price. You'll also get notifications if those scheduled orders are cancelled, for reasons like a timeout, price rejection, or user action.

It's important to note that this doesn't tell you when a scheduled order actually becomes active; that's handled through separate signal emitters.

Think of this as a system-wide notification channel—the framework itself uses it too.  You'll receive all updates, even if the order has already been cancelled.

If you're building an exchange integration, using the `Broker.useBrokerAdapter` with the specific signal hooks is the better approach. This listener is really for observing what’s happening, for things like logging or sending notifications.

The events you receive will be processed in the order they occur, even if your callback function takes time to complete.


## Function listenOrderReject

This function lets you monitor when your orders are definitively rejected by the exchange. It’s a notification about orders that the broker couldn't fulfill and won't retry. 

Think of it as a final confirmation that an order was rejected—it only happens after all automatic retry attempts have failed. 

Each rejection event includes information about the order, and ensures that you don't receive duplicate notifications. If your listener function takes some time to process the rejection (like sending a message somewhere), the processing is done one after the other to avoid overloading the system. It's safe to use for things like sending alerts or logging, because errors within your listener won't interfere with the trading process.


## Function listenOrderFill

This function lets you keep an eye on when your orders are actually filled – that's when the broker confirms the order has gone through. It’s a final confirmation step, ensuring the order has truly been executed or placed on the exchange.

You'll receive notifications for three types of order fills: when a new position is opened, when a resting entry order is placed, and when an order to close a position is executed.

Keep in mind, this isn't a gate; it's a notification. Any errors you encounter while processing the notifications won’t interrupt the trading process. This makes it suitable for things like sending updates to a telegram bot or audit log.

You provide a function to handle these fill events. If that function takes a little time to complete (like if it returns a promise), the framework will handle that processing for you.

## Function listenOrderContinue

This function lets you keep an eye on orders that are still being processed and potentially need further checks. Think of it as a way to react to updates on orders after an initial check has been performed.

It works alongside the order-stop channel, providing information about whether an order is still valid (attempt 0) or has experienced a temporary issue requiring ongoing monitoring (attempt greater than 0).

This function only works during live trading, not backtesting. It's designed to notify you, but any errors you encounter while handling these notifications won't stop the backtest itself; instead, they'll be logged and ignored.

You provide a callback function that will be triggered each time a continue event happens. If that callback returns a promise, the processing will happen one step at a time.

## Function listenMaxDrawdownUnique

This function helps you keep track of the most significant drawdown events in your trading strategy. It allows you to focus on the initial drawdown for each trading signal, ignoring subsequent, deeper drawdowns related to the same signal. You provide a filter function to select which drawdown events you’re interested in, and a callback function that will be executed whenever a new, unique maximum drawdown event is detected for a signal. This way, you'll only get notified once per signal’s initial drawdown event. 


## Function listenMaxDrawdownOnce

This function lets you set up a listener that waits for a specific drawdown condition to occur, and then reacts once. It's designed to trigger a callback function just one time when a particular drawdown event happens, and then automatically stops listening. Think of it as a way to be notified only when something very specific related to drawdown happens, and you don't want to keep monitoring afterward. 

You provide a filter to define exactly what kind of drawdown event you're interested in, and then a function to execute when that event is detected. After it runs once, the listening stops.


## Function listenMaxDrawdownFilter

This function lets you stay informed about significant drawdown events within your trading backtests. Think of it as a way to set up a specific alert – only get notified when a drawdown meets certain criteria you define. It's like a more targeted version of a general drawdown notification system. You provide a filter to specify exactly which drawdown events should trigger the alert, and then you define what happens when one of those events occurs. The function keeps you subscribed to these drawdown events, so you'll continue to receive notifications as they happen.


## Function listenMaxDrawdown

This function lets you keep an eye on the maximum drawdown of your trading strategies as they're being tested. It's like setting up a notification system that alerts you whenever a new drawdown record is hit. The notifications are handled in order, one at a time, even if your notification logic takes some time to process, which helps prevent any unexpected issues. You can use this to automatically adjust your risk levels or track important drawdown milestones during backtesting. To use it, you provide a function that will be called whenever a new maximum drawdown is detected.

## Function listenIdlePingOnce

This function helps you react to infrequent system activity – those moments when nothing much is happening. You give it a way to identify the specific activity you’re interested in, and a function to run when that activity occurs. Importantly, it only runs *once* for the first matching activity and then stops listening, making it perfect for one-off checks or actions triggered by periods of inactivity.  You’ll provide a way to check the details of the "idle ping" events, and then a function to execute when the event matches your criteria. This lets you perform a specific task like saving data or logging information only when the system has been idle.


## Function listenIdlePingFilter

This function lets you set up a continuous listener for idle ping events, but with a twist: you can specify a filter. Only idle ping events that meet your criteria, defined by the `filterFn`, will trigger the callback function (`fn`). Think of it as a targeted listener that only responds to specific types of idle ping signals, and it keeps listening until you explicitly stop it. It's a refined way to handle idle ping events compared to a general listener.


## Function listenIdlePing

The `listenIdlePing` function lets you react to periods of inactivity in your trading system. It's like setting up an alert that goes off whenever the system isn’t actively monitoring any trades or signals.

Essentially, it provides a notification when everything is quiet – no trades are happening, and no signals are pending.

You give it a function (`fn`) that will be called each time this idle state is detected, and that function will receive information about the event.  The function you provide will be executed every tick during the idle state.

To stop receiving these notifications, you can call the function that `listenIdlePing` returns.

## Function listenHighestProfitUnique

This function allows you to track and react to the very best profit moments for each trading signal. It helps avoid getting bombarded with repeated notifications by ensuring you only receive one notification per signal, specifically the *first* time it hits a peak profit. You provide a filter to decide which events you’re interested in, and then a function that will be executed when a new, unique highest profit is detected for a signal that matches your criteria. This subscription will continue until you explicitly unsubscribe from it.


## Function listenHighestProfitOnce

This function lets you set up a listener that reacts to specific profitable trading opportunities. 

It works by defining a condition – a filter – that determines which events trigger the listener. 

Once an event matches that condition, the listener executes your provided callback function just once, and then automatically stops listening. This is helpful if you need to react to a particular profit situation and then move on.

You provide a filter function to identify the relevant events and a callback function that will be executed when a matching event occurs. After the callback runs once, the listener is automatically removed.

## Function listenHighestProfitFilter

This function lets you continuously monitor for the highest profit events, but with a specific filter you define. Think of it as setting up an alert that only triggers when a certain condition is met for a profitable trading opportunity. The system will keep sending you these alerts as long as the condition remains true, even if the profit peaks repeatedly. You provide a filter that determines which events you're interested in, and a callback function that executes whenever a matching event occurs. This subscription persists until you explicitly unsubscribe.

## Function listenHighestProfit

This function allows you to keep track of when your trading strategy hits a new peak profit level. It's like setting up a listener that gets notified whenever a new highest profit is achieved during the backtest.

Importantly, the notifications are handled in a specific order – they arrive one at a time, even if the provided callback function takes some time to complete.

This feature helps you monitor your strategy's profitability journey and potentially react to those milestones in real-time, for example, to adjust your parameters.

To use it, you provide a function that will be executed whenever a new highest profit is recorded. The function receives details about the event, enabling you to react appropriately. Finally, the function returns another function that you can call to unsubscribe from these notifications.

## Function listenExit

The `listenExit` function lets you monitor for very serious errors that can abruptly halt processes like background tasks in live trading, backtesting, or data walking. It's for those critical issues that prevent further execution.

These aren't errors you can recover from – they stop things entirely.

When an error of this type occurs, your provided callback function will be triggered, and importantly, the errors are handled one at a time, in the order they happen. This helps ensure stability even when dealing with unexpected problems.


## Function listenError

This function lets you set up a listener to catch errors that might happen while your trading strategy is running, but aren't serious enough to stop the whole process. Think of it as a safety net for hiccups in your code, like a failed connection to an API.

When an error occurs, this listener will call the function you provide, allowing you to handle it in a controlled way and keep your strategy running.

Importantly, the errors are handled one at a time, in the order they happen, ensuring stability and preventing a cascade of problems if your error handling logic takes some time to complete. This makes it a reliable way to manage those occasional bumps in the road during backtesting or live trading.

## Function listenDoneWalkerOnce

This function lets you react to when a background task within your trading strategy finishes, but only once. Think of it as setting up a single listener that gets triggered when a specific condition is met during the background execution. You provide a filter – a test to see if the completion event is the one you’re interested in – and then a function to run when that event occurs. Once the function runs, the listener automatically disappears, ensuring it doesn't trigger again. This is useful for tasks that need to be performed only a single time after a background process completes.

## Function listenDoneWalkerFilter

This function allows you to listen for events as a walker completes its tasks. 

It's a way to be notified when a walker is finished, but with a twist: you can specify a filter.

The filter determines which completion events you actually want to be notified about. Only events that pass this filter will trigger your callback function. 

The callback function is then executed for each event that meets the filtering criteria, ensuring you only handle the relevant completion events. Importantly, this subscription remains active so you’ll continue to receive events that match your filter.


## Function listenDoneWalker

This function lets you monitor when background tasks within the trading framework finish processing. 

Essentially, it's a way to be notified when a `Walker.background()` operation is done. 

The notifications are handled in a specific order, and the callback function you provide will be executed one at a time, even if it involves asynchronous operations, ensuring things don't get out of sync. You can unsubscribe from these completion events whenever you need to stop listening.

## Function listenDoneLiveOnce

This function lets you react to when background tasks finish running within your backtest. 

It allows you to specify a condition - a filter function - that determines which completion events you're interested in.

Once a matching event occurs, the provided callback function is executed just once, and then the subscription is automatically removed. It’s a convenient way to handle specific completion events without managing subscriptions manually.


## Function listenDoneLiveFilter

This function lets you react to specific trade completion events as they happen, continuously receiving updates that meet your criteria. Think of it as a way to set up an ongoing filter for done trades. You provide a condition (`filterFn`) that determines which events you're interested in, and then a function (`fn`) that gets called whenever an event passes that condition. Importantly, this subscription remains active, so you'll keep receiving relevant events.

## Function listenDoneLive

This function lets you monitor when background tasks within your backtest finish running. It’s like setting up a notification system to know when a process is complete. The callback you provide will be executed after each background task finishes, and it ensures that these callbacks are handled one at a time, preventing any unexpected clashes. This is useful for coordinating further actions or updates after a background operation is done. 

You’ll provide a function (`fn`) that gets triggered whenever a task concludes, and the function returns another function which allows you to unsubscribe from these notifications.


## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but only once. You provide a filter to specify which backtest completions you're interested in, and then a function to execute when that specific completion happens.  The function automatically handles unsubscribing after the callback runs, so you don't have to worry about cleanup. It's a simple way to perform an action immediately after a particular backtest finishes.


## Function listenDoneBacktestFilter

This function allows you to monitor when backtests finish, but with a crucial twist: you can specify a filter. Think of it as setting up a watch – only when a backtest completes *and* meets certain conditions (defined by your filter) will your callback function be triggered.  The filter function determines which completed backtests are considered relevant. Once set up, this listener continuously delivers matching events, meaning you don't have to worry about missing any relevant completions. It's a handy tool for focusing on specific backtest results and reacting to them automatically.


## Function listenDoneBacktest

This function lets you react to when a background backtest finishes running. 

It's like setting up a listener that gets triggered when the backtest is done.

The listener function you provide will be called with information about the completed backtest, and importantly, the order in which these events happen is preserved even if your listener function involves asynchronous operations. This ensures that events are handled one at a time, in the sequence they occurred. You can unsubscribe from these events by returning a function from `listenDoneBacktest`.

## Function listenCheck

The `listenCheck` function lets you monitor the status of your open orders with the trading system. It listens for signals related to orders – whether they are still active on the exchange or if they are scheduled (like a resting entry order).

This function sends out a "ping" for each order, constantly checking its existence.

If the check fails due to a temporary error, like a network issue, the system will try again a few times before giving up, keeping your position open. However, if the order is truly deleted, it's a critical error and will trigger a shutdown.

You provide a function that gets called whenever a check event happens, and that function can process the event information, potentially including asynchronous operations.

## Function listenBreakevenAvailableUnique

This function lets you keep an eye on when breakeven conditions are met for your trades. It's like setting up an alert system, but specifically for when a trade reaches a point where it breaks even. You provide a filter to decide which trades trigger the alert, and then a function that gets executed whenever a new trade meets the breakeven criteria. The function returns a way to unsubscribe from these alerts when you no longer need them.

## Function listenBreakevenAvailableOnce

This function lets you set up a listener that reacts to changes in breakeven protection – essentially, the point where a trade starts becoming profitable. It's designed to trigger only once when a specific condition is met. You provide a filter to define when you want the listener to activate, and a function to execute when that condition is met. After the callback runs once, the listener automatically stops listening. This is great if you need to react to a specific breakeven event and then don't need to monitor it anymore.

The `filterFn` determines if an event should trigger the callback.
The `fn` is the function that will be executed once the filter matches.


## Function listenBreakevenAvailableFilter

This function lets you set up a continuous listener for breakeven events, but with a special twist. You can provide a filter – a function that decides whether an event should be passed on to your callback. Only breakeven events that meet the criteria defined by your filter will trigger the callback function you provide. This is useful when you only want to react to specific types of breakeven situations. The listener will continue to run until you explicitly unsubscribe from it.


## Function listenBreakevenAvailable

This function lets you keep an eye on when your trades hit a breakeven point, meaning the price has moved enough to cover your initial costs. 

It sends you notifications whenever a trade's stop-loss automatically adjusts to the entry price.

These notifications are handled in the order they arrive, ensuring a smooth and predictable process, even if your notification handling takes some time. The system ensures callbacks run one at a time, preventing any issues caused by overlapping operations.

You provide a function that gets called whenever a breakeven event occurs, and that function will return a function to unsubscribe from the notifications.

## Function listenBeforeStartOnce

This function lets you react to events that happen right before a backtest starts, but only once. You provide a filter to specify which events you're interested in, and a function to run when a matching event occurs. After that single execution, the listener automatically stops, keeping your code clean and efficient. It's a convenient way to perform setup or adjustments just before a backtest begins, ensuring it happens only once and doesn't clutter your ongoing process.

## Function listenBeforeStartFilter

The `listenBeforeStartFilter` function lets you react to events that happen right before a trading simulation begins, but with a specific condition. You provide a filter – a function that decides which events you’re interested in – and a callback function that gets executed when a matching event occurs. This setup ensures you only handle the events that meet your criteria, and the system continues to notify you of any subsequent matching events. Think of it as a targeted way to listen for pre-simulation happenings.


## Function listenBeforeStart

The `listenBeforeStart` function lets you hook into the moment right before a trading strategy begins for a particular asset. It’s a way to listen for events that signal the start of a new strategy run. This function ensures that your code runs one step at a time, even if it involves asynchronous operations, guaranteeing order and preventing conflicts. You provide a function that will be called with details about the upcoming start of the strategy.

## Function listenBacktestProgress

This function lets you keep an eye on how your backtest is running. It allows you to subscribe to events that are triggered during the background processing of a backtest. Think of it as getting updates on the backtest's progress as it runs. The updates are delivered one after another, even if the function you provide to handle them takes some time to complete. This helps avoid potential issues with rapid or concurrent execution of your callback. You provide a function that will be called with each progress update. The function you provide will return a function that can be called to unsubscribe.

## Function listenAfterEndOnce

This function lets you react to specific events that happen after a trading simulation finishes, but only once. You provide a filter to identify the events you're interested in, and a function to execute when a matching event occurs. Once that single event is processed, the function automatically stops listening, keeping your code clean and efficient. Essentially, it's a one-time listener for post-backtest events.


## Function listenAfterEndFilter

The `listenAfterEndFilter` function lets you set up a listener that reacts to specific after-end events. Think of it as a targeted subscription – you provide a condition (`filterFn`) and the listener only triggers when those events meet that condition. The callback function (`fn`) then handles each event that passes the filter. This is a way to focus on the events most relevant to your backtesting strategy and keeps the listener active for all matching future events.


## Function listenAfterEnd

This function lets you hook into what happens *after* a trading strategy's execution finishes for a particular asset. It's like setting up a notification system that gets triggered when a strategy run is complete. 

The important thing to know is that these notifications are handled in a specific order, even if the code you provide to process them takes some time to run.

To prevent issues, this function uses a queuing mechanism to ensure that your callback function is executed one at a time, sequentially. You just need to provide the function that should be called when this event occurs. This function also returns an unsubscribe function that you can call to stop receiving these notifications.

## Function listenActivePingUnique

This function lets you react to specific "active ping" events, but only the first time a unique signal appears. Think of it as a way to listen for signals that meet a certain condition – you'll only get notified once for each distinct signal. 

It's designed for situations where you only care about the initial appearance of a condition in a position; subsequent ticks won't trigger the callback. You provide a filter to narrow down which signals you're interested in, and a function to execute when a new, unique signal passes that filter. The function returns a cleanup function that can be called to unsubscribe from the active ping events.

## Function listenActivePingOnce

This function allows you to react to specific active ping events just once. It sets up a listener that checks if an event matches a condition you provide (using `filterFn`). 

Once an event passes that check, it runs a function you define (the `fn` callback) and then automatically stops listening – perfect for situations where you need to do something only when a certain event happens. Think of it as a temporary listener that triggers once and then disappears. It’s handy when you’re waiting for a particular ping condition to be met.

The `filterFn` determines which events get through, and the `fn` handles the event once it's been filtered.

## Function listenActivePingFilter

This function lets you listen for specific "active ping" events, but only the ones that meet certain criteria you define. Think of it as setting up a targeted alert system for those events. You provide a filter – a small test that determines if an event is important – and a callback function that gets triggered whenever an event passes that filter. The system will keep sending you these filtered events, so it's good for ongoing monitoring. It's a more precise way to react to active ping events compared to just listening to all of them.

## Function listenActivePing

This function lets you keep an eye on active signals in your backtesting environment. It’s like setting up a listener that gets notified whenever a signal’s status changes—specifically, every minute.

Think of it as a way to understand what's happening with your signals over time, allowing you to adjust your strategies dynamically.

The function will call your provided callback function whenever a new active ping event occurs. Importantly, it handles these events one at a time to avoid any conflicts, ensuring a smooth and predictable flow. You provide a function (`fn`) that will be executed with the details of the active ping event whenever it’s triggered.


## Function listWorkerSchema

This function gives you a look at all the worker schemas that have been set up in your backtest-kit environment. Think of it as a way to see what different trading strategies or components are available for use. It's handy for checking things out, creating documentation, or building user interfaces that need to adapt to various worker types. The result is a simple list of all registered worker schemas.


## Function listWalkerSchema

This function provides a way to see all the different "walkers" that have been set up within your backtest-kit environment. Think of walkers as reusable components for analyzing your trading data. It returns a list of these walkers, letting you examine their configurations or display them in a user interface.  It’s helpful for understanding what’s happening under the hood, verifying your setup, or creating tools to manage your backtest strategies.

## Function listSweepSchema

This function lets you see a full inventory of all the different trading strategies or "sweep schemas" that have been set up within your backtest environment. Think of it as a way to list all the blueprints for how your automated trading systems are designed. You can use this to check your configurations, create documentation, or even build interfaces that dynamically display these strategies. It returns an array, so you'll get a list of all these schemas, allowing you to inspect them individually.

## Function listStrategySchema

This function helps you find out what strategies are currently available for backtesting. It gathers all the strategies you’ve previously registered using `addStrategy()` and presents them in a handy list. Think of it as a way to see what options you have at your disposal when building backtests – great for troubleshooting, creating your own documentation, or building interactive user interfaces.


## Function listSizingSchema

This function allows you to see all the sizing strategies currently set up within your backtest. Think of sizing strategies as how you determine how much of an asset to trade – this provides a way to view all those rules. It's handy if you're troubleshooting, trying to document your system, or want to create a user interface that dynamically adjusts based on your sizing configurations. The function returns a list containing details about each sizing schema.

## Function listRiskSchema

This function lets you see all the risk schemas that are currently set up within the backtest-kit system. Think of it as a way to peek behind the curtain and view all the defined risk configurations. It's handy for troubleshooting, generating documentation, or creating user interfaces that need to display or interact with these risk settings. The function returns these configurations as a list, allowing you to easily work with them programmatically.


## Function listMemory

This function helps you see all the stored memories associated with your current trading signal. 

It’s like looking through a digital notebook where you've saved important information for your trading decisions.

The function automatically figures out which signal it's working with and whether you're in a backtesting or live trading environment, so you don’t have to worry about those details.

You just need to provide a bucket name to specify where the memories are stored.

The function returns a list of memory entries, each containing a unique ID and the content you saved.


## Function listMCPSchema

This function helps you see all the different data structures, or schemas, that your backtest kit system is using for communication. It essentially provides a list of all the registered MCP (Model Context Protocol) schemas.

Think of it as a way to peek under the hood and understand what kinds of information your trading system is working with.

It's especially helpful if you're trying to figure out how everything fits together, build tools to display this information, or just generally debug your system. The function returns a promise that resolves to an array containing these schemas.


## Function listLauncherSchema

This function helps you discover all the different trading strategies or "launchers" that have been set up within the backtest-kit system. It fetches a complete list of these configurations, so you can inspect them, understand what’s available, or even build tools that automatically display them. Essentially, it's a way to see the big picture of your trading strategy setup.


## Function listFrameSchema

This function provides a way to see all the different data structures (frames) that your backtest is using. It essentially gives you a list of all the "schemas" or blueprints defining how your data is organized. Think of it like checking what kind of data you're working with – whether it's price data, volume, indicators, or something custom. This can be super handy for figuring out what’s going on in your backtest, building tools to visualize your data, or making sure everything is set up correctly.

## Function listExchangeSchema

This function lets you see a complete list of all the exchanges your backtest-kit setup knows about. It’s like getting an inventory of all the different trading platforms you've connected. You can use this to double-check your configuration, generate documentation, or create user interfaces that automatically adapt to the exchanges you're using. The function returns a promise that resolves to an array containing details about each registered exchange.

## Function hasTradeContext

This function simply tells you whether the trading environment is currently set up to execute trades. It checks if both the execution context and the method context are active. 

If it returns `true`, it means you can safely use functions that interact with the exchange, such as retrieving historical data (candles), calculating prices, or formatting data for display. If it’s `false`, those functions won't work as expected and you should ensure the environment is properly initialized.


## Function hasNoScheduledSignal

This function helps you quickly check if a trading signal is currently scheduled for a specific asset, like "BTCUSDT". 

It returns `true` if there isn't a scheduled signal waiting, meaning no signal is planned for that asset right now. 

Think of it as the opposite of checking *for* a scheduled signal. 

You can use this to make sure your system doesn't accidentally try to create signals when a signal is already on the way. 

It smartly figures out whether the system is in backtesting mode or live trading mode without you needing to worry about it.


## Function hasNoPendingSignal

This function checks if there's a signal currently waiting to be triggered for a specific trading pair, like 'BTCUSDT'. It returns `true` if there isn't a pending signal, and `false` if one exists. Think of it as the opposite of `hasPendingSignal`; it’s helpful to use this to make sure you're not generating new signals when one is already in progress. The function figures out whether it's running in a backtesting environment or a live trading situation without you needing to specify. You just give it the symbol of the trading pair you're interested in.

## Function getWorkerSchema

This function lets you find the blueprint, or schema, for a specific worker within the backtest-kit system. Think of it as looking up the instructions for how a particular part of your trading strategy is built and operates. You provide the worker's unique name, and it returns the detailed schema that defines its behavior and data requirements. It's useful when you need to understand or validate the configuration of a worker.

## Function getWalkerSchema

The `getWalkerSchema` function helps you find the blueprint for a specific trading strategy, or "walker," within your backtest setup. Think of it as looking up the definition of how a particular trading approach is structured. You provide the name of the walker, and it returns a detailed description of its expected inputs and outputs – essentially, a guide on how that walker is designed to work. This lets you understand what's needed to run a specific trading strategy correctly.


## Function getTotalPercentHeld

This function tells you what percentage of your initial position you still hold. Think of it as showing how much of your original investment is still active. 

A value of 100 means you haven't closed any of the position, while 0 means you've closed everything. 

It’s designed to work accurately even if you've been gradually reducing your position through multiple transactions (like a dollar-cost averaging strategy).

It figures out whether it's running in a backtest or a live trading environment automatically.

You just need to provide the trading symbol, like "BTCUSDT", and it will give you the percentage.


## Function getTimestamp

This function provides a way to retrieve the current timestamp being used within your trading strategy. 

Think of it as a way to know what time it is within the context of your backtest or live trading environment.

During backtesting, it will return the timestamp associated with the specific timeframe you’re analyzing. When running live, it will give you the actual, real-time timestamp.

## Function getSymbol

This function lets you find out what symbol you're currently trading within the backtest environment. It's a simple way to check which asset your strategies are working with. The function returns a promise that resolves to the symbol as a string.

## Function getSweepSchema

This function helps you find the configuration details for a specific trading simulation, or "sweep," that's been set up within the backtest-kit framework. Think of a sweep as a particular scenario you want to test – maybe different starting prices or a specific trading strategy. By giving it the name of the sweep, this function fetches the blueprint that defines how that simulation should run, including things like the data it uses and the rules it follows. It's like looking up the recipe for a particular experiment.


## Function getStrategyStatus

This function lets you peek into the current state of a trading strategy as it's running. It provides a snapshot of things like pending signals, actions that are waiting to be processed, and flags indicating user interactions. It automatically figures out whether you're in a backtesting simulation or a live trading environment, so you don't have to worry about that. To use it, simply provide the symbol of the trading pair you're interested in.

## Function getStrategySchema

This function lets you find the blueprint for a specific trading strategy that's been set up within the backtest-kit system. Think of it as looking up the details of how a particular strategy is structured – what inputs it needs, what data it expects, and how it's designed to operate. You provide the name of the strategy you're interested in, and it returns a description of that strategy's configuration. This is useful when you need to understand or programmatically access the definition of a particular trading approach.


## Function getStrategyPaused

This function tells you whether a specific trading strategy is currently paused.

When a strategy is paused, it stops creating new trades – the `getSignal` function isn't called, and any new trade requests are held back. 

However, existing trades that are already in progress (like pending orders or scheduled signals) will still be handled as usual and can be closed.

The function automatically figures out if it’s running in a backtesting environment or a live trading setup.

You provide the trading pair symbol (like BTC-USDT) to check the paused state of that strategy.

## Function getSizingSchema

This function helps you find the specific rules for how much of an asset to trade based on a name you give it. Think of it as looking up a recipe for determining trade sizes. You provide a name, and the function returns the detailed instructions associated with that sizing strategy. It's useful when you want to reuse or understand the logic behind a particular sizing approach within your backtesting setup.

## Function getSessionData

This function lets you retrieve data that's specific to a trading symbol and strategy, and persists across multiple candles during a backtest or live trading session. Think of it as a way to store information, like calculated indicator values or results from complex calculations, that you need to remember between candles. The system knows whether it's running a backtest or live, so you don’t have to worry about setting that up. You provide the symbol of the trading pair you're interested in, and it returns the stored data or null if nothing’s there.

## Function getScheduledSignal

This function helps you retrieve the currently planned signal for a specific trading pair, like BTC/USDT. It’s designed to be used during backtesting or live trading, as it automatically figures out which mode you're in. If there's no signal scheduled for that pair, it will return nothing instead of an error. You provide the symbol of the trading pair you're interested in, and it gives you the details of the scheduled signal, if one exists.


## Function getRuntimeInfo

This function gives you a snapshot of the current situation. It tells you things like which asset you're trading, the exchange you're using, the timeframe for your analysis, and the strategy in play. You'll also find out if you're running a backtest (historical simulation) or a live trading session. Think of it as a quick check to confirm your environment is set up correctly.

## Function getRiskSchema

This function lets you fetch details about a specific risk type that’s already been set up within your backtesting environment. Think of it as looking up the blueprint for how a particular risk is calculated and managed. You provide the unique name assigned to that risk, and the function returns all the relevant information about it, like what factors it considers and how it's measured. It’s useful for understanding and verifying how risks are being assessed in your trading simulations.

## Function getRemainingCostBasis

This function helps you figure out how much of your initial investment remains in a particular asset, even if you've sold off some of your holdings. It's especially useful if you've been gradually buying into an asset over time (like with dollar-cost averaging, or DCA), and then selling portions of it later. 

It handles the complexities of calculating this remaining cost basis accurately, taking into account those initial smaller purchases made over time.

To use it, you just provide the symbol of the asset you're interested in (like BTC-USD). The function will automatically determine whether it's running in a backtest or a live trading environment.


## Function getRawCandles

The `getRawCandles` function lets you retrieve historical candlestick data for a specific trading pair and time interval. You can control how many candles you want and specify a start and end date to narrow down the data. 

It's designed to be flexible, allowing you to use combinations of start date, end date, and limit to get exactly the data you need. Importantly, this function makes sure to avoid any issues with looking into the future when performing your analysis.

Here’s how the date and limit parameters work together:

*   You can provide a start date, end date, and limit to fetch a specific number of candles within that range.
*   If you only provide a start and end date, the function automatically determines the number of candles needed.
*   Specifying an end date and limit will have the start date calculated based on those values.
*   Providing just a limit will fetch candles from the past.
*   In all scenarios, the function ensures the data fetched respects the trading context and prevents potential look-ahead bias.

The function returns an array of candle data objects. The `symbol` parameter defines the trading pair (like "BTCUSDT"), and the `interval` determines the time frame for each candle (such as "1m" for one-minute candles).

## Function getPositionWaitingMinutes

This function helps you understand how long a trading signal has been waiting to be put into action. It tells you, in minutes, how long a signal has been pending. 

If there's no pending signal for a specific trading pair, it will return null. 

You provide the trading pair symbol – like "BTCUSDT" – to see the waiting time for that particular signal.

## Function getPositionPnlPercent

This function helps you understand how profitable your current trading position is, expressed as a percentage. It calculates the unrealized profit and loss, taking into account things like partial trades, dollar-cost averaging, potential slippage, and fees.

If you don't have any active trading signals, it will let you know.

The function cleverly figures out whether you’re in a backtesting or live trading environment and automatically grabs the current market price to make its calculations. You only need to provide the trading pair symbol.

## Function getPositionPnlCost

This function helps you understand how much profit or loss you're currently holding on a trade. It calculates the unrealized profit or loss in dollars, considering things like the percentage change in price, the total amount you've invested, and any fees or slippage. 

It's designed to work whether you’re running a backtest or a live trading system, and it automatically finds the current market price for you.

If you don't have an open trade, the function will let you know by throwing an error.

You only need to provide the symbol of the trading pair (like BTC-USDT) to get the result.


## Function getPositionPartials

getPositionPartials lets you see how your trading position has been partially closed, whether it was for profit or loss. It gives you a list of events detailing each time a partial close occurred.

Think of it as looking at a record of any small wins or losses you’ve taken along the way.

If you haven't executed any partials yet, it will simply return an empty list. If you try to use it without a current trading signal, it will let you know.

For each partial close, you'll get details like the type of close (profit or loss), the percentage of the position closed, the price at which it happened, the cost basis at that time, and how many DCA entries were involved. The function requires the trading symbol as input.


## Function getPositionPartialOverlap

This function helps you avoid accidentally closing out positions partially multiple times at similar prices. It checks if the current market price falls within a defined range around any previously executed partial close prices for a specific trading pair.

Think of it as a safeguard against accidentally triggering multiple partial closes when the price is hovering around a certain level. 

The function considers a tolerance zone around each partial close price, calculated based on a percentage you can optionally specify. If the current price falls within any of those zones, it indicates a potential overlap and returns true. Otherwise, if no partial closes have been made or no pending signals exist, it returns false. 

You provide the trading symbol and current price to check, and can customize the tolerance range as needed.

## Function getPositionMaxDrawdownTimestamp

getPositionMaxDrawdownTimestamp helps you find out when a specific trading position experienced its biggest loss. It tells you the exact timestamp of that lowest point during the position's history. To use it, you’ll need to provide the symbol of the trading pair (like BTC-USDT). If there's no trading signal associated with the position, the function will let you know.

## Function getPositionMaxDrawdownPrice

This function helps you understand the risk associated with a specific trade. It calculates the lowest price a position has hit since it was opened, essentially showing you the maximum drawdown experienced. If you're looking to assess how much a trade could have potentially lost, this function provides that key information. To use it, you just need to specify the trading symbol, like 'BTCUSDT'. Keep in mind that it won’t work if there isn't an active signal for that symbol.

## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand the performance of a specific trading position. It calculates and returns the percentage of profit or loss that occurred at the point when the position experienced its biggest loss. Essentially, it shows you the lowest PnL percentage the position ever reached. To use it, you need to provide the symbol of the trading pair you are interested in. If there's no signal currently active for the position, the function will let you know.


## Function getPositionMaxDrawdownPnlCost

This function helps you understand the financial impact of a trading position. It calculates the cost in terms of profit and loss, specifically looking at the point where the position experienced its biggest drawdown. Essentially, it tells you how much money you lost at the worst possible time for that particular trade. You'll need to provide the symbol of the trading pair (like "BTC-USD") to get this information. If there isn’t a signal currently being tracked, the function won’t work.


## Function getPositionMaxDrawdownMinutes

This function helps you understand the timeline of a trade's performance. It tells you how many minutes have passed since the point where your position experienced its biggest loss. Think of it as a way to gauge how recently a drawdown occurred – a value of zero means it just happened. To use it, you need to provide the trading symbol you're interested in, and it will return the time in minutes. If no signals are currently pending for that symbol, the function won't work.

## Function getPositionLevels

getPositionLevels helps you see the prices at which you've entered into a trade using dollar-cost averaging (DCA). It returns a list of prices, starting with the initial price you bought at, and including any subsequent prices added when you used commitAverageBuy to add more to your position.

If you haven't made any DCA entries after your initial purchase, you'll get an array containing only the original entry price.

If there's no active trade signal, the function will let you know by throwing an error. You’ll need to provide the trading pair symbol to get the price list.

## Function getPositionInvestedCount

getPositionInvestedCount tells you how many times you've added to a position using dollar-cost averaging (DCA) for a specific trading pair. 

It returns a number: 1 means it's the initial buy, and each additional DCA purchase increases that number.

If you haven't initiated a trade yet, it will let you know.

You don’t need to worry about whether you’re in backtest mode or live trading – it figures that out on its own.

You just need to provide the symbol of the trading pair you're interested in, like "BTCUSDT".

## Function getPositionInvestedCost

This function helps you figure out how much money you've spent acquiring a position in a specific trading pair. 

It calculates the total cost based on all the buy orders that have been placed but not yet executed.

Think of it as the total investment made for a position, considering the price at the time each buy order was placed.

If you try to use this function without a pending signal (a planned trade), it will let you know there's a problem. 

It automatically works whether you’re running a test backtest or a live trading system.

You just need to provide the symbol of the trading pair you're interested in, like "BTC-USDT".


## Function getPositionHighestProfitTimestamp

This function helps you find out exactly when a particular trade (identified by its symbol) reached its peak profit. It essentially tells you the timestamp when things were looking their best for that specific position. If there's no trading data associated with that symbol, the function will let you know by throwing an error. You'll need to provide the trading pair symbol, like 'BTCUSDT', to use this function.

## Function getPositionHighestProfitPrice

This function helps you understand how well a trading position has performed. 

It finds the highest price reached while the position was profitable. 

For long positions, it tracks the peak above the entry price. For short positions, it tracks the lowest price below the entry price. 

The function always provides a result – at the very least, the entry price – and will alert you if a signal isn't currently active. You just need to provide the trading pair symbol to retrieve this information.

## Function getPositionHighestProfitMinutes

This function helps you understand how long a trading position has been operating below its best performance. 

It calculates the time, in minutes, since the position reached its highest profit.

Think of it as a measure of how far a position has fallen from its peak – zero minutes means it just hit that highest profit.

You need to specify the trading pair, like 'BTCUSDT'.

If no trading signals are available for the position, the function will signal an error.


## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position is from its best performance. It calculates the difference between the highest profit percentage you've seen on a trade and the current profit percentage. Essentially, it shows you how much room there is for improvement. 

The result is always a positive number or zero, because it only considers the difference if the peak profit was higher than the current profit.

To use it, you'll need to provide the trading pair symbol (like 'BTCUSDT').

It requires that there be a pending signal for the trade to be evaluated.


## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your current trading position is from its best possible profit. It calculates the difference between the highest profit achieved so far and the current profit, but only considers the positive difference (so it won't show a negative number if the current profit is higher).  Essentially, it's showing you the potential upside remaining in your trade. You need to provide the trading symbol, like "BTC-USD," to use the function. If there isn't a pending trading signal for that symbol, the function will let you know with an error.

## Function getPositionHighestProfitBreakeven

This function helps you understand if a trade could have potentially reached a breakeven point during its most profitable moment. It examines the trading history for a specific symbol, like BTC/USDT, to determine if a breakeven was mathematically possible when the trade was at its peak profit. 

If there's no trading signal available for that symbol, the function will let you know by throwing an error. Essentially, it's checking if a previously profitable trade could have been managed to avoid a loss.


## Function getPositionHighestPnlPercentage

This function helps you understand how well a specific trade performed. It looks at a past trading position and tells you the highest percentage profit it ever reached while it was open. 

You provide the symbol of the trading pair – like 'BTC-USDT' – and it returns that peak profit percentage.

If there's a problem, like a missing trading signal, the function will let you know.

## Function getPositionHighestPnlCost

This function helps you understand the financial performance of a specific trade. It calculates and returns the highest cost associated with achieving the best possible profit for that trade, expressed in the currency of the asset being traded (like USD or BTC). Think of it as pinpointing the moment when the trade was most favorably positioned, financially speaking. 

You need to provide the trading pair symbol (e.g., "BTC-USD") to use the function.

If there's no active trading signal, the function will let you know it can't perform the calculation.


## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand how risky a trading position is. It calculates the largest percentage loss a position has experienced from its peak profit to its lowest point. 

Essentially, it tells you how far the position’s profit has fallen before recovering.

The result is a percentage value representing that drawdown.

You provide the trading symbol (like BTC-USDT) as input.

If there’s no trading signal for that symbol, the function won't work and will indicate an error.

## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand the potential downside risk of a trading position. It calculates the difference between the current profit and loss (PnL) cost and the lowest point (trough) of losses experienced – essentially, how far the position has fallen from its peak. The result represents the PnL cost associated with that maximum drawdown. To use it, you simply provide the trading symbol (like "BTC-USDT") and it will return a numerical value. It won't work if there isn’t a pending trading signal for that symbol.


## Function getPositionEstimateMinutes

This function helps you understand how long a trade is expected to last. It gives you an estimate in minutes of how long the current trading position is planned to remain open. The estimate comes directly from the signal data and represents the maximum duration before a time limit is reached. If there isn't a pending trade signal, you'll get an error. You need to provide the trading symbol, like 'BTCUSDT', to get the estimate for that specific pair.

## Function getPositionEntryOverlap

getPositionEntryOverlap lets you determine if the current price is close enough to an existing DCA entry level to avoid creating duplicate entries. It essentially checks if the current price falls within a defined tolerance zone around each of your existing price levels.

The function returns true if the current price is within this zone and false if no pending signal exists.

You provide the trading symbol and the current price to be checked.  Optionally, you can provide a configuration to adjust the tolerance zone, defining how much above and below each level is considered a potential overlap. This allows for finer control over how closely prices need to be to trigger the overlap check.

## Function getPositionEntries

This function lets you see how a position was built up, especially if you’ve been using dollar-cost averaging. It gives you a breakdown of each buy – the original purchase and any subsequent DCA buys – showing the price and cost for each. You’ll need a pending signal for it to work, and if you haven't done any DCA, you'll get a list with just the initial entry. This is useful for understanding your position’s history and cost basis.

The function takes the trading pair symbol as input.

Each entry in the returned list includes the price at which the trade executed and the cost allocated to it.


## Function getPositionEffectivePrice

This function helps you figure out the average price at which you’ve effectively entered a position for a specific trading pair. It calculates a weighted average, taking into account any previous trades or partial exits. 

Essentially, it gives you a more accurate picture of your entry price than just the initial price.

If you've made partial sales, it carefully considers the prices at which those sales occurred. If no initial trades have been made it returns the original priceOpen.

The function will tell you if there’s no open position to analyze. It adapts to whether you're in a backtesting simulation or a live trading environment without needing any extra configuration.

You just need to provide the symbol of the trading pair you’re interested in.

## Function getPositionDrawdownMinutes

getPositionDrawdownMinutes tells you how much time has passed since your position reached its highest profit. 

Think of it as a measure of how far your current price is from the best it's ever been. 

It starts at zero when your position first hits its peak profit and then ticks upwards as the price moves away from that high point.

To use it, you simply provide the trading pair's symbol, like 'BTCUSDT', and it will return the time in minutes. If there's no active trading signal for that symbol, the function will let you know.

## Function getPositionCountdownMinutes

This function tells you how much time is left before a trading position expires. 

It calculates this by looking at when the position became pending and comparing that to an estimated expiration time. 

The result will always be a positive number of minutes—if the estimated time has already passed, it will return zero.

If there's no pending signal for the specified trading pair, the function will let you know with an error.

You need to provide the trading pair symbol (like "BTC-USDT") to get the countdown.

## Function getPositionActiveMinutes

`getPositionActiveMinutes` helps you figure out how long a trading position has been open. It takes the symbol of the trading pair (like "BTCUSDT") and returns the number of minutes it's been active. If there's an issue, like a missing signal, it will let you know. This is useful for understanding the duration of your trades.

## Function getPendingSignal

This function helps you check if your trading strategy currently has a pending order waiting to be triggered.

It retrieves the details of that pending signal, if one exists.

If there isn't a pending signal, it will tell you by returning nothing.

You don’t need to worry about whether you’re in a backtest or a live trading environment; this function handles that automatically.

To use it, you simply need to provide the trading pair symbol, like "BTCUSDT".

## Function getOrderBook

This function lets you retrieve the order book data for a specific trading pair, like BTCUSDT. 

It pulls this information from the exchange you're connected to.

You can optionally specify how many levels of the order book you want to see; otherwise, it uses a default maximum depth.

The function takes into account the current time context, which can be important whether you're running a simulation or live trading. The exchange itself decides how to use this time information.

## Function getNextCandles

This function helps you grab a batch of future candles for a specific trading pair and timeframe. Think of it as looking ahead to see how prices might move. 

It uses the underlying exchange's methods to get these candles, ensuring you're retrieving data that comes *after* the current time used by your backtest. 

You'll need to specify the symbol (like "BTCUSDT"), the candle interval (e.g., "1h" for one-hour candles), and how many candles you want. The function returns a promise that resolves to an array of candle data.


## Function getMode

This function simply tells you whether the backtest-kit is currently running a historical simulation (a "backtest") or a live trading session. It returns a promise that will resolve to either "backtest" or "live," letting you adjust your code's behavior based on the environment it's operating in. You can use this to, for example, enable verbose logging during backtesting but disable it for live trading.

## Function getMinutesSinceLatestSignalCreated

This function helps you figure out how long ago the last trading signal was generated for a specific trading pair, like BTC-USDT. 

It counts the time in whole minutes.

It doesn't care if the signal is still open or has already closed; it just looks at the most recent one. This is handy for things like ensuring enough time has passed before placing another trade after a stop-loss event.

The function checks both your historical backtest data and any current live data to find that signal. If no signals exist for the given symbol, it will let you know with an error. The function adjusts itself to work whether you're running a backtest or a live trading session.

You just need to provide the symbol of the trading pair you're interested in.

## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand the risk profile of a trading strategy. It calculates the largest percentage difference between the highest profit and the lowest loss experienced during a backtest. Essentially, it tells you the most significant potential downside risk you faced.

The result is always zero or positive, representing the maximum drawdown distance in percentage terms. 

To use it, you simply provide the trading symbol (like 'BTC/USD'), and it will return a number representing that drawdown distance. If there's no trading data, it will alert you.

## Function getMaxDrawdownDistancePnlCost

This function helps you understand the risk exposure of a trading strategy by calculating the maximum drawdown, specifically focusing on the profit and loss (PnL) distance. It figures out the difference between the highest profit achieved and the lowest point where losses reached, ensuring the result is never negative. The function requires a symbol (like "BTC-USDT") to identify the trading pair being analyzed. If the strategy hasn’t generated any trading signals yet, the function will let you know. 


## Function getMCPSchema

The `getMCPSchema` function lets you fetch the definition of a specific Model Context Protocol (MCP) used within the backtest-kit framework. Think of an MCP as a blueprint for how data is structured and communicated. This function takes the unique name of the MCP you’re looking for as input, and returns that blueprint. It’s helpful when you need to understand the expected format of data or want to programmatically work with the structure of an MCP.

## Function getLauncherSchema

The `getLauncherSchema` function helps you access the specific configuration details for a particular trading strategy launcher. Think of a launcher as the starting point for your backtesting setup. This function allows you to look up the schema, which defines how that launcher is structured and what settings it requires. You provide the name of the launcher, and it returns a detailed description of its configuration. This is useful for understanding what options are available when setting up a backtest.

## Function getLatestSignal

This function helps you retrieve the most recent trading signal – whether it's still active or has already closed – for a specific trading pair. It's a handy way to implement cooldown periods, like preventing new trades for a certain time after a stop-loss event. The function first looks for signals in the backtest data and then checks live data if nothing is found. It will alert you if no signal exists for the specified trading pair. It figures out whether you're in backtest or live mode automatically. You simply provide the symbol of the trading pair you are interested in to get the latest signal.

## Function getFrameSchema

The `getFrameSchema` function is how you find the blueprint, or schema, for a particular frame within your backtesting setup. Think of it like looking up the definition of a data structure. You provide the name of the frame you're interested in, and the function returns a detailed description of what that frame contains – its data types, structure, and properties. This is useful for understanding the expected format of your data and ensuring compatibility within the backtest.


## Function getExchangeSchema

This function helps you find details about a specific cryptocurrency exchange that your backtesting system knows about. You provide the name of the exchange, and it returns a set of rules and information describing how that exchange works. Think of it as looking up the exchange's blueprint so your backtest can accurately simulate trading on it. The exchange name must be one of the exchanges already configured within the backtest-kit system.

## Function getDefaultConfig

This function provides a set of sensible defaults for how the backtest kit operates. Think of it as a starting point for your configurations – you can adjust any of these values to fine-tune the behavior of your backtests. It's a handy way to explore all the configuration options and see what their initial settings are, giving you a clear foundation for customization. The returned object is read-only, so you can't accidentally change the default values directly.

## Function getDefaultColumns

This function gives you the standard setup for columns used in generating reports. It provides a pre-defined structure for columns relating to things like closed trades, heatmaps, live data, partial fills, breakeven points, performance metrics, risk events, scheduled events, strategy actions, synchronization, peak profits, maximum drawdowns, walker signals, and overall strategy results.  Think of it as a template to understand the available column types and how they're typically configured when building your backtest reports. You can look at this configuration to learn about the options you have for display and analysis.

## Function getDate

This function, `getDate`, simply retrieves the current date. Whether you're running a simulation (backtest) or live trading, the date returned will be relevant to what's happening: during a backtest, it's the date of the specific timeframe you're examining, and in live mode, it's the real-time date. It's a straightforward way to access the date within your trading logic.

## Function getContext

This function provides access to the current environment in which a method is running. Think of it as a way to peek inside what's happening behind the scenes during a calculation or process. It returns a special object that holds details about this environment, such as information needed for tracking and managing the method’s execution. You can use this to understand the context of the code you are working with.

## Function getConfig

This function provides access to the framework's global configuration settings. Think of it as a way to peek inside the system's preferences. It returns a set of values that control various aspects of the backtesting process, like how often it checks for new data, limits on data requests, and settings for report generation. It’s important to note that it returns a copy of the configuration, so you can examine the settings without changing them directly. This ensures the core framework remains stable and predictable.

## Function getColumns

This function gives you a peek at how your backtest data is organized for reporting. 

It provides a list of all the different columns used for displaying data like closed trades, heatmaps, live ticks, partial fills, breakeven events, performance metrics, risk events, scheduled tasks, strategy events, synchronization events, highest profit, maximum drawdown, walker panel performance, and strategy results.

Think of it as a snapshot of the data layout – a way to see what's being shown in your markdown reports. It’s designed to be safe; any changes you make to this copy won't affect the actual configuration.

## Function getClosePrice

This function lets you quickly grab the closing price from the most recent candle for a specific trading pair and time frame.  You simply tell it which symbol you're interested in, like "BTCUSDT," and what candle interval you want, such as "1h" for a one-hour candle.  It will then return that closing price as a promise that resolves to a number. This is handy for getting a current snapshot of price action.

Available intervals are: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, and 8h.

## Function getCandles

This function allows you to retrieve historical price data, specifically candles, from the trading platform you're connected to. You provide the trading pair like 'BTCUSDT', the timeframe you want the candles in (options include 1 minute, 5 minutes, hourly intervals, and more), and how many candles you need. The function then pulls that data from the exchange, looking back from the current time. Think of it as grabbing a window of past price action for analysis.

## Function getBreakeven

This function helps determine if a trade has reached a point where it's profitable enough to cover the fees and slippage associated with the transaction. It essentially checks if the price has moved favorably to compensate for those costs. The function automatically adjusts its behavior based on whether it's running in a backtesting environment or a live trading scenario. 

You provide the trading symbol and the current price, and it will return `true` if the price has moved sufficiently to cover the calculated breakeven threshold, which accounts for slippage and fees.


## Function getBacktestTimeframe

This function lets you find out the dates available for backtesting a specific trading pair, like BTCUSDT. It returns an array of dates, representing the timeframe you can use when running a backtest. You provide the symbol of the trading pair you're interested in, and it gives you back the dates you can use for testing your strategies. Essentially, it helps you see what historical data is accessible for a particular trade.

## Function getAveragePrice

This function helps you find the VWAP (Volume Weighted Average Price) for a specific trading pair, like BTCUSDT. 

It looks at the five most recent one-minute candles to figure out the VWAP. The calculation considers the typical price of each candle (average of high, low, and close) and the volume traded at that price.

If there's no trading volume during that period, it will instead calculate the simple average of the closing prices.

You just need to tell it which symbol you're interested in.


## Function getAggregatedTrades

This function retrieves historical trade data for a specific trading pair, like BTCUSDT. It pulls this information from the trading exchange that's been set up within the backtest-kit framework.

You can request a limited number of trades by providing a 'limit' value, or if you leave it out, you'll get trades from a recent time window. The function essentially collects trades working backward in time, ensuring it returns the requested number or fills the window.


## Function getActionSchema

This function helps you find the details of a specific action within your trading strategy. Think of it as looking up the blueprint for how a particular action, like placing an order or calculating an indicator, should be executed. You provide the name of the action, and it returns a description of what that action involves, including the expected inputs and outputs. This is useful for validating data or understanding the structure of your trading logic.


## Function formatQuantity

This function helps you display the correct amount of a specific cryptocurrency or asset when placing orders. It takes the trading pair symbol, like "BTCUSDT", and the raw quantity you want to use. It then automatically applies the formatting rules of the particular exchange you’re using, ensuring the quantity is shown with the right number of decimal places as required by that exchange. This prevents errors and keeps your order displays consistent with the platform.

## Function formatPrice

This function helps you display price values correctly for a specific trading pair. It takes the trading symbol, like "BTCUSDT", and the raw price as input. Then, it applies the exchange's rules for how to format the price, ensuring the right number of decimal places are shown. This is particularly useful because different exchanges use different formatting conventions. 

Essentially, it takes a number and transforms it into a user-friendly price string that's appropriate for the trading pair involved.


## Function dumpText

The `dumpText` function helps you record raw text data, associating it with a specific signal and providing context. Think of it as a way to save important textual information like error messages or data snapshots during your backtesting or live trading sessions. It automatically handles figuring out which signal you're working with, and adapts its behavior based on whether you’re in a backtest or a live trading environment. You provide the function with details like the bucket name, a unique identifier for the dump, the actual text content, and a description to explain what the text represents. Essentially, it simplifies the process of saving useful textual records alongside your trading signals.


## Function dumpTable

This function helps you display data as a nicely formatted table within your trading analysis. It's designed to work with data representing rows of information, like transaction records or indicator values.

The function automatically figures out which signal to associate the table with, streamlining the display process.

It's adaptable to both backtesting and live trading environments without requiring any special adjustments.

The table's column headers are created dynamically based on all the different properties present in your data, ensuring a complete and understandable overview.

You provide the data to be displayed, along with a descriptive label.


## Function dumpRecord

The `dumpRecord` function allows you to save a structured piece of data, like a record of trading activity, associated with a specific bucket and a unique identifier. It's designed to help you keep track of important information during testing or live trading. This function automatically figures out the correct trading context, whether you're running a backtest or a live session, making it simple to log records without worrying about manual configuration. You provide the data to be saved, along with a descriptive label, and the function handles the rest.

## Function dumpMCPStatus

This function helps you create a detailed report of your Model Context Protocol (MCP) data. Think of it as taking a snapshot of the information flowing through your system during a trading process. 

It automatically figures out which signal it's related to and whether you're in testing or live mode. The data is then compiled into a readable markdown file, including any images embedded within the messages. You can also choose to silence the report generation or create a simplified text-only version if that suits your needs. The resulting reports are stored in specific directories for easy access and analysis.

The `dto` parameter holds all the necessary information for creating the snapshot, including the bucket name, a unique ID for the dump, the actual messages, and a descriptive title for the report.


## Function dumpJson

The `dumpJson` function is your tool for sending data – specifically, complex objects – out to a designated storage bucket. Think of it as a way to save structured information related to a particular signal, whether that signal is something happening right now or is planned for the future.  It takes a chunk of data (an object) and packages it up with identifying information like a bucket name, a unique identifier for the data, a description, and then converts it into a formatted JSON block. Importantly, this function figures out whether it's running a test or live and handles the signal processing automatically, so you don't have to worry about that yourself.


## Function dumpError

The `dumpError` function is a handy tool for reporting errors within your trading strategies. It essentially sends error descriptions, along with a unique identifier and bucket name, to a designated location for later analysis. This function intelligently handles the context of your trading execution, whether you're running a backtest or a live trading session. It automatically resolves the relevant signal, making it easier to track and understand the error's origin and impact. It’s designed to simplify error reporting and debugging across different environments. 

The input to `dumpError` is a data transfer object (DTO) containing the bucket name, dump ID, the actual error description, and a short description.

## Function dumpAgentAnswer

This function lets you save a complete record of an agent's conversation – all the messages and a description – linked to a specific trading signal. Think of it as creating a detailed log of how the agent interacted.

It's designed to work seamlessly whether you're running a backtest or a live trading scenario, and it automatically figures out which signal it's associated with. 

You provide the function with details like the bucket name, a unique dump ID, the messages exchanged, and a description to help you understand the context of the conversation. It then stores this information for later review or analysis.


## Function commitTrailingTakeCost

This function lets you set a specific take-profit price for a trade. It simplifies the process of changing your take-profit by calculating the necessary percentage shift relative to the initial take-profit distance. The framework handles the details of knowing whether it's running a test or a live trade and automatically retrieves the current price to make the adjustment. You just provide the trading symbol and the desired take-profit price.


## Function commitTrailingTake

This function helps you refine your trailing take-profit levels for pending orders. It’s designed to subtly adjust the distance of your take-profit order from its original placement.

Crucially, it bases calculations on the *original* take-profit distance set when the order was initially placed – not any adjustments that might have happened since. This prevents small errors from building up over time.

You provide a percentage shift to modify the take-profit distance.  A negative shift pulls the take-profit closer to your entry price, making it more cautious, while a positive shift pushes it further out, being more aggressive.

Think of it this way: the system is conservative.  It only moves the take-profit in a direction that makes it *closer* to your entry price – never further away. This means for long positions, it only accepts lower take-profit levels, and for short positions, only higher levels.

The function also intelligently determines whether it’s running in backtesting or live trading mode.


## Function commitTrailingStopCost

This function lets you set a specific price for your trailing stop-loss. It's a simple way to adjust your stop-loss to a precise level.

The function figures out whether you're in a testing or live trading environment on its own. It also automatically gets the current market price to calculate the necessary adjustment.

You provide the symbol of the trading pair and the desired stop-loss price, and the function handles the rest, making sure to maintain your original distance percentage.


## Function commitTrailingStop

This function lets you refine the trailing stop-loss level for a pending trading signal. It's designed to adjust the stop-loss distance as a percentage of the original stop-loss level set when the signal was created. 

Keep in mind, the calculation is always based on the original stop-loss distance to avoid errors that can build up over repeated adjustments.

If you want to tighten your stop-loss, use a negative percentage shift. To loosen it, use a positive percentage shift. However, the system is smart: it will only move your stop-loss to a better position – one that offers more protection for your profits.

For long positions, the stop-loss can only move higher, and for short positions, it can only move lower. The closer position to your entry price will be selected in each case.

Finally, this function automatically understands whether it's running in a backtesting environment or a live trading situation. You'll provide the trading symbol, the percentage adjustment you want to make to the stop-loss, and the current market price.

## Function commitSignalNotify

This function lets you send out informational messages related to your trading strategy. Think of it as a way to add notes or alerts to your backtesting or live trading process – it doesn't change your positions, just provides extra context. You can use it to log important events like when a specific indicator triggers, or to send out external alerts.  The function automatically gathers key information like the trading symbol, strategy name, and current price, so you don’t need to provide them. You can also add extra details to the notification via the optional payload parameter.

## Function commitPartialProfitCost

This function lets you automatically close a portion of your trading position when you’ve reached a specific profit level, measured in dollar amounts. It's a simple way to lock in gains and manage risk.

Think of it as a shortcut – you tell it how much in dollars you want to close, and it figures out the percentage of your position needed to achieve that.

It's designed to work in both backtesting and live trading environments, and it takes care of getting the current price for you.

To use it, you provide the trading symbol and the dollar amount you want to close.  Make sure the price is moving in the direction of your take profit for it to execute.

## Function commitPartialProfit

The `commitPartialProfit` function lets you automatically close a portion of an open trade when the price is moving in a profitable direction, essentially bringing you closer to your take profit target.

It allows you to specify the percentage of the trade you want to close, like 25% or 50%, as an absolute value.

The function handles whether it's running in a backtesting environment or a live trading scenario, so you don’t need to worry about that distinction.

You provide the trading symbol and the percentage to close as input.


## Function commitPartialLossCost

This function lets you partially close your position when you're experiencing a loss, specifically by specifying a dollar amount you want to recover. It simplifies the process by automatically calculating the percentage of your position needed to cover that dollar amount.

Essentially, it's a shortcut for closing a portion of your trade to limit further losses, and it intelligently adjusts based on whether you're in a backtesting or live trading environment. The function handles getting the current market price for you, ensuring accurate calculations.

To use it, you just need to provide the trading symbol and the dollar amount you want to recover. The function takes care of the rest, automatically determining how much of your position to close to achieve that dollar value recovery.

## Function commitPartialLoss

This function lets you close a portion of an open position when the price is moving in a direction that would trigger a stop-loss. It's designed to help you manage risk by reducing exposure on a trade that's moving against you. 

You specify the trading symbol and the percentage of the position you want to close—for example, closing 25% of your current holdings. 

The system automatically determines whether it's running in a backtesting or live trading environment. This function is a convenient way to handle partial closures based on loss progression.


## Function commitCreateTakeProfit

This function lets you tell the backtest-kit that a take-profit order for a position has been filled on the exchange, even if it happened outside of the framework’s usual VWAP calculations. It's important because sometimes orders get filled at prices dictated by market highs or lows.

Think of it as synchronizing what the exchange did with the backtest framework. This helps keep things accurate, especially when dealing with real-time order execution.

The function will only do something if there's an active, pending order related to the symbol you specify.

You can also include some extra information with the function call, like a note or an identifier, to help you track things. The function automatically knows if it's running in backtest or live mode.

## Function commitCreateStopLoss

This function lets you tell the backtest framework that a stop-loss order you'd previously placed has been filled by the exchange, even if it happened outside the usual candle-based checks. Think of it as confirming a stop-loss was triggered because of a price spike.

It’s used when the exchange executes your stop-loss order based on price levels (like a high or low) instead of waiting for the candle to close.

The framework handles the actual close, assigning the reason as "stop_loss" on the next price update. 

If you don't have an open position with a pending stop-loss, this function does nothing.

You can also include extra information, like an order ID or a note, with the commit payload if you want to keep track of things. The framework automatically determines whether it’s running a backtest or a live trading simulation.

## Function commitCreateSignal

This function allows you to inject custom trading signals into the backtest or live environment, essentially bypassing the usual signal retrieval process. It’s helpful when you need to feed in signals from an external source or want more control over the signal generation.

The function takes a symbol and a data object (DTO) containing the signal details.  You can optionally provide a target price (`priceOpen`) for the signal.

If you don’t provide `priceOpen`, the signal will execute immediately at the current market price. If you do provide `priceOpen`, the signal will execute immediately if the target price is already reached; otherwise, it will be scheduled to trigger when that price is hit.

The function ensures your signal data is valid and prevents conflicting signals or actions from occurring simultaneously.  It automatically adapts to whether you’re running a backtest or a live trading session.


## Function commitClosePending

This function lets you close a pending order without interrupting your trading strategy. Think of it as cleaning up a signal that's been waiting to be executed. It won't affect any signals that are already scheduled or stop your strategy from making new decisions. Essentially, it allows you to manage pending orders while keeping your strategy running smoothly, regardless of whether you're in a backtesting or live trading environment. You can even add a note to the commit for record-keeping purposes.


## Function commitCancelScheduled

This function lets you cancel a previously scheduled trading signal. Think of it as hitting the brakes on a planned action, but without interrupting the overall trading process. It's designed to clear out a signal that's waiting to be triggered by the next price opening, allowing your strategy to continue operating and potentially generate new signals. It won’t interfere with any existing orders or stop the strategy from running; it simply removes the scheduled action. You can also include some extra details like an ID or a note alongside the cancellation if needed. The function intelligently adapts to whether you're in a backtesting environment or a live trading scenario.


## Function commitBreakeven

This function helps manage your trading risk by automatically adjusting your stop-loss order. It moves the stop-loss to the entry price—essentially a break-even point—when the price has moved favorably enough to cover any trading fees and a small buffer. 

The threshold for triggering this move is based on a combination of slippage and fee considerations. 

The function handles the complexities of knowing whether it's running a backtest or a live trade, and it also retrieves the current price automatically. All you need to provide is the symbol of the trading pair.

## Function commitAverageBuy

This function lets you add a new purchase to your dollar-cost averaging (DCA) strategy. It essentially adds an order to your existing plan, buying a small amount at the current market price. 

The function will automatically calculate the average price based on all previous purchases.

You can optionally specify the amount of the purchase in dollars, which helps fine-tune the calculation of the average price. If you don't specify the amount, it uses a default value. This function is designed to work equally well in backtesting and live trading environments. It also automatically gets the current price to execute the order.

## Function commitActivateScheduled

The `commitActivateScheduled` function lets you manually trigger a scheduled signal before the price actually reaches your target level. Think of it as giving a signal a "head start."

It essentially sets a flag that the strategy will pick up on the next price update, effectively activating the signal early.

You can use this function in both backtesting and live trading environments—it automatically detects which mode you’re in.

You’ll need to provide the symbol you're trading, and optionally, include details like a commit ID and a note for record-keeping purposes.

## Function checkCandles

The `checkCandles` function is designed to quickly verify if your historical price data (candles) are already available and stored. It uses a caching system to avoid unnecessary downloads. Essentially, it checks if the data for the specific time periods you're interested in already exists, making the process much faster than downloading everything. The function only needs to make one request to see if the candles are present, because the caching system knows exactly what to look for. If even one candle is missing or out of place, the entire check will fail, preventing a full data download. You provide details about which data to check using the `params` argument.

## Function cacheCandles

This function helps make sure you have the historical candle data you need for your trading strategies. It checks if the data already exists, and if not, it fetches the missing data from a data source and verifies it again.  Essentially, it prepares the ground by guaranteeing the presence of the needed historical data for backtesting or live trading. It works for a specified trading symbol, time interval, start and end dates, and exchange. You can even provide callbacks to track the start of checks and the beginning of the data warming process.


## Function addWorkerSchema

This function lets you register a new worker with the backtest-kit framework. Think of a worker as a specific setup for running your trading strategies – it connects your strategy code to a particular exchange and data feed. 

The worker schema defines the environment your strategy will operate in, including things like the type of run (backtest, paper trading, or live). 

Importantly, the list of symbols your strategy will trade isn't included in this worker definition; it’s passed in each time you actually run the worker. This means only one child process is created for processing all symbols, which helps manage resources efficiently.


## Function addWalkerSchema

This function lets you register a walker, which is essentially a blueprint for comparing different trading strategies. Think of it as setting up a system to run multiple backtests simultaneously and then directly compare how well each strategy did. You provide a configuration object that defines the walker's specific settings – things like which strategies to test and how to measure their performance. It’s a key part of the backtest-kit framework for rigorous strategy evaluation.


## Function addSweepSchema

The `addSweepSchema` function lets you define and register a sweep, which is a process for systematically testing and optimizing trading strategies. Think of it as a way to automatically run your trading idea multiple times, each with slightly different settings, to see what performs best.

It works by simulating trading for each combination of settings, analyzing the results, and refining your strategy.

The sweep involves passing data through an exchange to create these profiles. It also helps you train and manage your lists of approved and restricted assets during the testing phase.

You provide a configuration object describing the sweep, and the framework takes care of the rest, exploring different parameter combinations and evaluating them. If you don't specify all the parameters, default values will be used.

## Function addStrategySchema

This function lets you register a trading strategy with the backtest-kit framework. It’s how you tell the system about your custom strategy and its rules.

When you register a strategy, the framework will check it to ensure it’s working correctly. This includes verifying the signals it produces, managing the frequency of those signals, and ensuring data safety if you're running live tests.

You provide the framework with a strategy configuration object, which defines all the details of how your strategy operates.

## Function addSizingSchema

This function lets you tell the backtest-kit how to determine the size of your trades. You provide a sizing configuration, which essentially outlines the rules for deciding how much capital to allocate to each position. This includes specifying the sizing method you’re using – whether it's a fixed percentage, a Kelly criterion, or something based on Average True Range (ATR) – along with the relevant risk parameters like the percentage of your capital you’re willing to risk or the multiplier for ATR. You can also set limits, such as minimum and maximum position sizes, and even provide custom logic through callback functions. Think of it as defining the rules of engagement for how much of your portfolio is at risk with each trade.

## Function addRiskSchema

This function lets you set up how your trading system manages risk. Think of it as defining the rules to prevent taking on too much risk at once. 

You can specify limits on the number of trades happening simultaneously and create custom checks for things like how your different trading strategies affect each other. 

Importantly, risk management is shared between your strategies, allowing for a holistic view of your overall risk exposure. The system keeps track of all active positions, which you can then use in your custom risk validation checks.

## Function addMCPSchema

This function lets you connect your trading strategies to an external agent using the Model Context Protocol, or MCP. Think of it as a way to expose your strategy's status and allow the agent to send trading commands.

When you register a strategy using `addMCPSchema`, the MCP acts as a link, sharing information like the strategy's current state and position changes.

The MCP will automatically generate portfolio updates for the agent, or you can customize this with a custom renderer for more specific information. This provides a standardized way for external systems to monitor and interact with your trading strategies.


## Function addLauncherSchema

This function lets you register a new launcher within the backtest-kit framework. Think of a launcher as a blueprint that connects a specific trading environment – like a backtest, paper trading, or live account – to the strategy, exchange, and data sources it needs.  You provide a configuration object describing these connections, and the framework keeps track of it, ready to use when you actually start a trading run. This essentially defines how your strategies will be executed in different environments.


## Function addFrameSchema

This function lets you tell the backtest-kit about a new timeframe generator. Think of it as registering a new way to create the periods of time your backtest will analyze. You provide a configuration object that describes how these timeframes should be generated, including the start and end dates for your test, the interval (like daily or hourly), and any custom logic needed to create those specific time periods. Essentially, it’s how you extend the framework to handle different time scales.

## Function addExchangeSchema

This function lets you tell the backtest-kit framework about a new data source for an exchange. Think of it as registering where the framework can find historical price data and other exchange-specific information. Each exchange has its own way of organizing data and displaying prices, so this function allows you to define those details for the framework to use. You'll provide a configuration object that describes the exchange, including how to fetch historical candles and how to format price and quantity information. The framework will then use this schema for calculations like VWAP, which is based on the last few minutes of trading activity.

## Function addActionSchema

This function lets you tell the backtest-kit framework about a specific action you want to perform during a backtest. Think of actions as automated responses triggered by events happening within your trading strategy, like hitting a profit target or experiencing a loss.

You can use these actions to do things like send notifications to a messaging service, log detailed information, or even update external data stores.

The `actionSchema` parameter defines how these actions will be executed and what data they’ll receive—essentially, it's the blueprint for your automated responses.  Each time your strategy runs, a new action handler is created and it’s given access to all of the events generated during that run.

