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

The `writeMemory` function lets you store data in a named memory location, essentially creating a place to remember things during your trading simulations or live trades.  Think of it as saving a specific value associated with a particular "bucket" or category.

It's designed to work seamlessly within the backtest-kit framework, automatically knowing whether you're running a test or a real-time trade.  You provide the name of the memory "bucket," a unique identifier for the specific memory location within that bucket, the data you want to store (which can be any object), and a short description to help you remember what it is. 

The function then handles the details of saving this information for later retrieval.


## Function warmCandles

The `warmCandles` function is designed to speed up your backtesting by pre-loading historical candle data. It downloads all the candles for a specific time period – from a starting date (`from`) to an ending date (`to`) – and stores them in persistent storage. This means when your backtest actually runs, it doesn't have to wait for those candles to be fetched from a data source, resulting in faster execution. You provide a set of parameters to define the date range and other settings for the candle download.

## Function waitForReady

This function helps ensure that all necessary data sources—like exchange, strategy, and historical data—are fully loaded before you begin trading simulations or live trading. It essentially waits patiently, checking every second, until everything is ready.

When running a backtest, it verifies that the data for the exchange, the trading strategy, and the historical data frames are all present.  For live trading, it only needs the exchange and strategy data. 

If the waiting period is too long and the data isn't ready, the function will simply finish without an error, leaving it up to the rest of your application to handle the "not ready" situation gracefully, like displaying an informative error message. It's a helpful tool for making sure your trading systems start reliably.


## Function validate

This function helps you make sure everything is set up correctly before you start your backtests or optimizations. It checks if all the names you're using for things like exchanges, strategies, and risk management systems actually exist in your configuration. 

You can tell it to check specific items, or if you leave it blank, it will check *everything*. This can be a really useful way to catch errors early and ensure your backtest runs smoothly. The results of these checks are saved so the process is faster the next time you run it.

## Function stopStrategy

This function lets you halt a trading strategy from producing any new signals. It's useful when you need to pause a strategy's activity without completely restarting it.

The strategy will finish any currently open signals, and then stop accepting new ones. Whether it stops immediately or waits for a safe point depends on if you're in backtest or live mode – it will wait for an idle state or signal closure.

You specify the trading pair (like "BTCUSDT") to tell the system which strategy to stop. The function automatically figures out if it's running a backtest or a live trading session.


## Function shutdown

This function lets you safely end a backtest run. It sends out a signal to all parts of the backtest, giving them a chance to clean up anything they need to before the program stops. Think of it as a polite way to tell everything to wrap things up before exiting, especially useful when you're stopping the backtest manually.


## Function setStrategyPaused

You can temporarily halt a trading strategy's activity with this function. It essentially puts the strategy on pause, preventing it from opening new positions. 

While paused, the framework won't process new trading signals, but any existing orders or signals will continue to be managed normally. This pause state is saved, so it remains active even if the system restarts. 

To reactivate the strategy, simply call the function again with `false` for the paused state. The function also automatically knows whether it's running in a backtest or live environment.

It accepts the trading symbol and a boolean value (true to pause, false to resume) as input. You'll receive a notification event when the pause state changes.

## Function setSignalState

This function helps you manage and update the state associated with a specific trading signal. It’s designed to be used when your trading strategy is actively executing, whether in a backtest or live environment.

It automatically handles the current signal being processed, making sure it's either pending or scheduled. If no such signal is found, the function will raise an error.

This tool is particularly useful for strategies driven by AI (like LLMs) that want to track detailed metrics for each trade, like how long it’s open or its maximum gain. These strategies often aim for a balance between profit and risk, aiming for gains between 2% and 3% while keeping drawdown (potential losses) between -0.5% and 2.5%. Some trades might even aim for smaller profits or avoid positive gains altogether, depending on specific trading rules based on metrics like time open and percentage change.

The function takes the trading symbol (like "BTCUSDT"), a dispatch object, and a data transfer object (DTO) that includes the bucket name and the initial state value. The DTO is used to set the state value for that particular trading signal.

## Function setSessionData

This function lets you store information that lasts throughout a backtest or live trading session. Think of it as a temporary, shared memory space tied to a specific trading pair.

It’s perfect for holding onto things like calculations from complex indicators, results from AI models, or any other data you need to remember between candles. 

You can even clear this stored data by passing `null` as the value.

The function automatically handles whether it's running in backtest or live mode, so you don’t need to worry about that.


## Function setLogger

This function lets you customize how the backtest-kit framework reports information. You can provide your own logging mechanism – essentially, something that can receive and display log messages. The framework will then send all its internal log messages to your logger, automatically adding helpful details like the strategy name, exchange, and symbol being tested. This allows you to monitor the backtesting process more closely and tailor the output to your specific needs.


## Function setConfig

This function lets you adjust the overall settings for how backtest-kit works. You can change specific parts of the default configuration by providing a new object with the options you want to modify. Sometimes, for testing purposes, you might need to bypass certain checks – the `_unsafe` flag allows you to do that, but be careful when using it. Essentially, it's a way to fine-tune the framework's behavior.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, like those generated for markdown. You can tweak the default settings for any column to show exactly the data you need.

The function takes an object describing your desired column configuration, allowing you to override the standard definitions. 

It checks that your column definitions are structurally sound before applying them.

If you're working in a testing environment and need to bypass these validations, a special `_unsafe` flag can be used.


## Function searchMemory

The `searchMemory` function helps you find relevant information stored in your memory system. It uses a powerful search technique called BM25 to score and rank the results, making it easy to find what you're looking for.

You provide a bucket name – essentially, where the memory data is stored – and a search query.

The function intelligently adapts to whether your code is running in a backtest or a live trading environment, and it automatically resolves the signal you're working with.

The result is a list of matching memory entries, each with a unique ID, a score indicating how well it matches your search, and the actual content of the memory entry itself. This content will be of a type you define when you use the function.


## Function runInMockContext

This function lets you execute code as if it were running within a backtest or live trading environment, but without actually needing a full backtest setup. Think of it as a sandbox for testing pieces of your code that rely on things like the current time or exchange information.

You provide a function you want to run and optionally configure details like the exchange, strategy name, and symbol being used. If you don't provide these, it uses default placeholder values, creating a simple live-mode setup.

This is particularly helpful for writing tests or scripts that need to access information like the current timeframe without requiring a complete backtest to be active. The 'when' parameter automatically sets the time to the current minute.

## Function removeMemory

This function lets you delete a specific memory entry associated with a signal. Think of it as cleaning up old data related to how your trading strategy performed. It figures out whether you're running a test or a live trading scenario on its own, so you don't have to worry about that.

You need to provide the name of the bucket where the memory is stored, along with the unique ID of the memory entry you want to remove. It will automatically handle any pending or scheduled signals as part of this process.

## Function readMemory

The `readMemory` function lets you retrieve data that's been stored in memory, linked to the current signal's activity. Think of it as fetching a specific piece of information you've saved earlier for later use during a trade or analysis. It figures out whether you're in a backtesting or live trading environment without you needing to specify it. 

You provide the name of the memory bucket and a unique ID for the data you want to read, and it returns the requested data. It's designed to be flexible, allowing you to retrieve various data types as needed.


## Function overrideWalkerSchema

This function lets you tweak an existing walker configuration, which is useful when comparing different strategies. Think of it as making small adjustments to a plan already in place. It doesn’t replace the whole configuration, just the parts you specify. You provide a partial update, and the rest of the original walker configuration stays the same.

## Function overrideSweepSchema

This function lets you modify an existing sweep configuration within the backtest-kit framework. Think of it as making targeted adjustments to a sweep you’ve already set up. You can only change specific parts of the sweep – the rest of its original settings will stay the same. Keep in mind that the system remembers and caches sweep configurations, so changes might not immediately affect running instances; you might need to refresh the cache for them to take effect. The configuration you provide should be a partial object containing the fields you want to update.

## Function overrideStrategySchema

This function lets you modify a strategy that's already been set up within the backtest-kit framework. Think of it as a way to tweak an existing strategy without having to completely redefine it. You can provide just the parts you want to change—like updating a parameter—and the rest of the strategy's configuration will stay the same. It’s useful for making small adjustments or overrides to an existing strategy's setup. 

The function takes a single argument:

*   `strategySchema`: This is the object containing the changes you want to apply to the strategy. It only needs to include the fields you're updating.

## Function overrideSizingSchema

This function lets you tweak existing position sizing configurations within the backtest kit. Think of it as a way to fine-tune a sizing strategy without rebuilding it completely. You can selectively change certain aspects of the sizing schema – maybe you want to adjust the risk percentage or the base size – while keeping the rest of the settings as they were originally defined. It’s a convenient shortcut for making targeted modifications to your trading strategy's sizing rules.


## Function overrideRiskSchema

This function lets you tweak a risk management setup that's already been defined in the backtest kit. Think of it as making small adjustments—you can change specific settings without having to recreate the entire risk configuration from scratch. It takes a piece of a risk configuration as input, and the framework applies those changes to the existing one, leaving the rest untouched. This is useful when you want to fine-tune a risk profile without a full reset.

## Function overrideMCPSchema

This function lets you tweak an existing MCP (Model Context Protocol) configuration. Think of it as a way to make small adjustments to a pre-defined setup without having to redefine the whole thing. You provide a partial configuration – just the bits you want to change – and the function applies those changes to the original MCP, leaving everything else untouched. It's really useful for fine-tuning your trading environment.

## Function overrideFrameSchema

This function lets you adjust how your trading timeframe is handled during backtesting. Think of it as a way to fine-tune existing timeframe settings without having to completely redefine them. You can specify exactly which parts of the timeframe configuration you want to change, and the rest will stay as they were. It’s helpful for making small tweaks or corrections to your timeframe setup.

## Function overrideExchangeSchema

This function lets you modify an already set up data source for an exchange. Think of it as making small tweaks instead of completely rebuilding it. You provide a piece of the exchange's configuration, and only that part gets updated; everything else stays as it was before. It's useful for making adjustments to how your backtest kit interacts with a specific exchange without affecting other aspects of your setup.

## Function overrideActionSchema

This function lets you modify an action handler's configuration without completely replacing it. Think of it as making targeted adjustments to how an action is handled, like tweaking a callback or updating a specific setting. It's helpful when you need to change the behavior of an existing action – perhaps to adapt to a different environment or to fine-tune its logic – without needing to redo the entire registration process. Only the parts you specify in the configuration will be updated, leaving the rest of the setup untouched.


## Function listenWalkerProgress

This function lets you keep track of how a backtest is progressing, step by step. It provides updates after each strategy finishes running within the backtest.

Because the updates might involve asynchronous operations within your callback function, it ensures these updates are handled one at a time to prevent any conflicts.

You give it a function that will be called with information about the progress of each strategy, and it returns another function to unsubscribe from these updates when you no longer need them.


## Function listenWalkerOnce

The `listenWalkerOnce` function allows you to temporarily "listen" for specific events happening during a backtest or trading simulation. You provide a filter – a rule that defines what kind of event you're interested in. When an event matches your filter, a callback function you provide will run just once to handle it. After that single execution, the listener automatically stops, ensuring it doesn't interfere with other parts of your process. It's a clean way to react to a specific condition happening within the backtest without ongoing monitoring.


## Function listenWalkerComplete

This function lets you be notified when the backtest process finishes running all your trading strategies. It's like setting up a listener that gets triggered once the backtest is complete. Importantly, the notifications happen one after another, even if the processing of each notification takes some time, ensuring a reliable order of events. You provide a function that gets called when the backtest finishes, and that function can handle the event details.

## Function listenWalker

The `listenWalker` function lets you monitor the progress of a backtest as each strategy finishes running. It provides a way to be notified of each strategy’s completion during the `Walker.run()` process. Importantly, these notifications happen one after another, even if your callback function takes some time to process – it ensures things don't get out of order or run concurrently. You give it a function to call when a strategy finishes, and it will handle the details of keeping everything in the right sequence.

## Function listenValidation

This function lets you keep an eye on potential issues during risk validation, specifically when those checks are running asynchronously. It's like setting up a notification system – whenever a validation check throws an error, this function will call back to you. This is really helpful for catching and fixing problems in your trading logic. The errors are handled one at a time to ensure a predictable order, even if your error handling code itself takes some time to complete.

You provide a function as input, and this function will be called whenever a validation error occurs. The function receives an error object detailing what went wrong.  The function returns another function that, when called, unsubscribes from listening to these validation errors.

## Function listenSync

The `listenSync` function lets you listen for events related to order synchronization, like when a signal is being opened or closed. It's designed to handle situations where processing these events might involve asynchronous operations.

If an error occurs while handling a synchronization event, it's categorized as either transient or rejected. A transient error means the system will try again to open or close the order a certain number of times. If it fails repeatedly, the system will force-close the order. A rejected error immediately stops the order process and doesn't retry.

You provide a callback function to `listenSync`, and this function will be called whenever a synchronization event happens. If your callback function returns a promise, the system will pause processing until that promise resolves.


## Function listenStrategyCommitPerSignal

This function lets you keep an eye on what's happening with your trading strategies as they generate and execute signals. It’s like setting up an alert that triggers every time a new signal is created and acted upon.

You can tell it exactly which events you're interested in using a filter – only certain strategy actions will trigger the alert.

Because strategies can send lots of updates for a single signal, this function makes sure you only receive the first relevant update for each signal, preventing you from being overwhelmed with information. Essentially, it cleans up the stream of updates so you only see the important ones.

## Function listenStrategyCommitOnce

This function lets you keep an eye on changes happening to your trading strategies, but only once. Think of it as setting up a temporary alert – it waits for a specific event related to your strategy, triggers a callback function when it sees that event, and then automatically stops listening. It’s really handy when you need to react to a one-time strategy action and don’t want to deal with ongoing subscriptions.

You tell it what kind of event you're looking for using `filterFn`, and then specify what should happen when that event occurs, using `fn`. Once the matching event is found and the callback is run, the alert is automatically deactivated.


## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategies. It will notify you whenever certain actions occur, like canceling a scheduled trade, closing a position, or adjusting stop-loss or take-profit levels.

Think of it as subscribing to updates – whenever one of these actions happens, your provided function will be called. The callbacks are handled one at a time, so you don't have to worry about things getting out of order or conflicting with each other. 

You provide a function that will be triggered by these events, and this function needs to accept an event object that contains information about the specific action that took place. When you are done, you can unsubscribe using the function it returns.


## Function listenSignalWaitingPerSignal

This function lets you listen for specific events related to signals that are waiting to be filled. It’s particularly useful when you need to react the very first time a signal that's been waiting gets a result. Think of it as a way to catch that initial confirmation of a signal’s status.

The system only triggers this event once for each unique signal ID. 

You provide a filter function to specify which events you're interested in, and a callback function that gets executed when a matching event occurs. This is a clean way to monitor and respond to those crucial early signal updates.

## Function listenSignalWaiting

This function lets you tap into events that happen while your trading strategy is waiting for a signal to trigger. Think of it as a notification system that alerts you to every tick – every small price change – that occurs before a planned trade actually happens. 

It's great for keeping a close eye on market conditions as you anticipate a signal, but be aware that you'll receive an event for each tick, potentially a lot of data! If you only need to react to changes for specific signals, explore the `listenSignalWaitingPerSignal` option instead.

The function takes a callback function as input. This callback will receive information about each waiting tick event.


## Function listenSignalScheduledPerSignal

This function allows you to monitor scheduled tick results, but with a twist – you'll only receive notifications when a *new* signal ID appears. Think of it as a way to react to signal events as they emerge, rather than every time a signal updates. You define a filter to specify which events you're interested in, and then provide a function that will be called with those filtered events, triggered specifically when a new signal ID is encountered. This is useful for scenarios where you need to react to the initial appearance of a signal, regardless of subsequent changes. The function returns an unsubscribe function that you can use to stop listening.

## Function listenSignalScheduled

This function lets you tap into events triggered when a trading signal is scheduled, essentially a "waiting" state where an order is pending until the price hits a specific target. You provide a function that will be called whenever a signal is scheduled—meaning an order is waiting to be filled—and it receives data about the signal. This is useful for tracking these pending orders and potentially adjusting strategies based on their status. The function returns another function that you can call to unsubscribe from these scheduled signal events.

## Function listenSignalPerSignal

This function lets you tap into the flow of trading signals generated by backtest-kit. You provide a filter – a way to choose which signals you’re interested in – and a callback function that will be executed each time a new, unique signal arrives that passes your filter.

Think of it as setting up a listener that only wakes you up when a specific type of signal comes through. The system ensures you only receive each distinct signal once, even if it's repeated, and it won’t bother you with “idle” signals (signals with no actual data). It guarantees the callback will always get a signal to work with.

Here's a breakdown:

*   **`filterFn`**:  This is like a gatekeeper. It decides which signals are allowed to trigger your callback.
*   **`fn`**: This is the action you want to perform when a selected signal arrives.

## Function listenSignalOpenedPerSignal

This function lets you monitor when a trading signal is opened, but it only triggers a notification for each *unique* signal. You provide a filter function to specify which signal openings you're interested in, and a callback function that will be executed whenever a new signal is opened and matches your filter. This is particularly useful if you want to react to specific signals without getting overwhelmed by notifications for every single trade. The function returns an unsubscribe function that you can call to stop listening.

## Function listenSignalOpened

This function lets you listen for events when a new trading position is opened, whether it's from a live strategy or a backtest. 

You provide a function (`fn`) that will be called each time a position begins.

The event you receive will contain details about the opened position, like the strategy tick result.

When you're done listening, the function returns another function you can call to unsubscribe, ensuring you don't receive unnecessary updates.


## Function listenSignalOnce

`listenSignalOnce` lets you set up a listener that only reacts to a signal once and then stops listening. Think of it as waiting for a specific condition to happen and reacting to it just once. You provide a filter to define what kind of signal you're waiting for, and then a function that will be executed when that signal appears. After that single execution, the listener automatically goes away, preventing further callbacks. This is helpful for tasks where you only need to respond to a signal one time.


## Function listenSignalNotifyPerSignal

This function lets you set up a listener that gets notified whenever a new trading signal arrives. You can use a filter to only receive notifications for signals that meet specific criteria, like those related to a particular asset or trading strategy. Importantly, it avoids duplicate notifications; if a strategy repeatedly sends information about the same trade, you'll only get notified once. This ensures you’re not overwhelmed with unnecessary updates and can focus on the important changes. The function returns an unsubscribe function, which you can call to stop receiving these notifications.


## Function listenSignalNotifyOnce

This function lets you set up a temporary listener for signal events. It's designed to react to a specific type of signal just once and then stop listening. You provide a filter to define which signals you’re interested in, and a function to run when that signal appears.  Once the signal matches your filter and the function runs, the listener automatically disappears, preventing further callbacks. This is useful for actions you only want to perform a single time based on signal data.


## Function listenSignalNotify

This function lets you get notified whenever a trading strategy sends out a signal notification—essentially, a message about what's happening with a trade. Think of it as subscribing to updates about specific signals.

The notifications are handled in the order they’re received, and the processing is done sequentially to avoid any conflicts. You provide a function that will be called whenever a new signal notification arrives, and this function receives information about the signal. 

To stop receiving these notifications, you can use the function that `listenSignalNotify` returns. This provides a way to cleanly unsubscribe from the signal events.

## Function listenSignalLiveWaitingPerSignal

This function lets you listen for specific signals coming from live trading executions. It's designed to handle "waiting" signals—those that occur while an order is resting on the order book, anticipating activation.

The beauty of this listener is that it avoids overwhelming you with repeated notifications for the same signal. It only triggers the callback function once for each unique signal, even if it's waiting for a long time.

It only works with live trading data, not historical backtests.

To prevent conflicts when using multiple strategies, it uses a system of "deduplication" based on factors like the strategy, exchange, trading frame, mode, and symbol. Each strategy gets its own set of rules, so they don't interfere with each other.

Furthermore, a filter function lets you specify which signals you are interested in. This filter is applied *before* the deduplication process, ensuring that no event is missed.


## Function listenSignalLiveWaiting

This function lets you listen for updates specifically when a trading strategy is waiting for a signal to activate during a live execution. Think of it as getting a heads-up before a trade actually happens. 

You'll receive notifications for each tick while the strategy is paused, anticipating the signal. The information provided includes details about the potential entry and a theoretical profit/loss calculation – it’s just a preview, so no actual risk is involved.

It's important to know that this only works with live executions; it won't trigger during backtesting replays. Because of this, it's a safe way to implement actions that need to happen in real-time, like sending notifications or mirroring orders. You'll receive directly targeted events so you don't need extra checks to filter events.

To use it, you provide a function (fn) that will be called whenever a waiting signal tick event occurs. The function will receive an event object containing the tick results.


## Function listenSignalLiveScheduledPerSignal

This function allows you to react to specific, scheduled trading signals coming directly from live executions. It’s designed to ensure you only receive each signal once, even if it's temporarily emitted multiple times.

Think of it as a way to tap into live trading signals and process them only when they first arrive, preventing redundant actions. It only works with live data, not historical backtests.

The provided filter function determines which signals trigger the callback. Crucially, this filtering happens *before* the duplicate removal, so any signals filtered out won't affect subsequent signals. 

This setup prevents multiple strategies running simultaneously from interfering with each other's signal handling.


## Function listenSignalLiveScheduled

This function lets you listen for the very first signal generated when a strategy requests an entry at a specific price during a live trading session. 

It’s like getting notified when the engine *starts* waiting for the market to hit that price. 

You'll only receive this notification once for each signal – subsequent updates about that same signal will be sent through different events.

Importantly, this function is safe for actions like sending alerts or mirroring orders because it only runs during live executions, not backtests. You don't need to check the event type as the callback directly receives the specific scheduled event data.


## Function listenSignalLivePerSignal

This function lets you tap into a live stream of trading signals, but with a special twist: you'll receive a callback for *each individual* signal that comes through. It's designed to work with signals generated by `Live.run()`, so you won't see any signals that aren't actively being processed. 

You can also use a filter to specify exactly which signals you’re interested in, allowing you to focus on specific events. The system is designed to avoid sending duplicate signals, ensuring you only process each unique signal once.

## Function listenSignalLiveOpenedPerSignal

This function lets you listen for when a trading strategy initiates a new position in live trading scenarios. It ensures you only receive notifications for a given trade once, even if the system attempts to trigger it multiple times. 

The function provides a way to filter the trade openings based on a condition you define.  You provide a function that determines which trade openings are of interest to you.

It only works with live trading data – backtesting runs won't trigger these notifications. The function keeps track of which trades it has already notified you about, preventing repeated notifications for the same trade. Importantly, this tracking happens independently for each strategy and trading environment, meaning multiple strategies won't interfere with each other’s notifications.

## Function listenSignalLiveOpened

This function lets you listen for when a trading strategy actually starts a new position in a live trading environment. 

It’s triggered when a signal is generated and executed, meaning a position is opened.

You'll get details like the signal information, entry price, and stop-loss/take-profit levels.

Importantly, this callback *only* works when running live trades with `Live.run()`. It won't be called during backtesting, making it a safe place to put things that need to interact with the real world, like sending alerts or placing orders through another system. The information is delivered directly, so you don't need to filter based on the action type.


## Function listenSignalLiveOnce

This function lets you temporarily listen for specific trading signals coming directly from a live trading simulation. Think of it as a quick, one-time tap into the flow of data. You tell it what kind of signal you're interested in—perhaps a specific price change or trading condition—and provide a function to handle it.  Once that signal you're looking for arrives, your function runs, and then the listener automatically stops, so you don't have to worry about managing subscriptions. It's designed for situations where you need to react to a single event during a live run and then step away. You provide a filter to select events, and a function to process the matched event.


## Function listenSignalLiveIdle

This function lets you listen for moments when your trading strategy isn't actively doing anything – it's holding no positions and has no scheduled actions.

Think of it as a way to get notified when your strategy is "idle."

You’ll receive data like the current price and symbol, along with information about the strategy, exchange, and frame it's running on. This is perfect for things like logging heartbeat signals or sending notifications that your strategy is still running and hasn’t encountered any issues.

Importantly, these notifications only come from live, running strategies; backtesting won't trigger this function, making it safe for actions that could affect the real world, such as sending alerts.


## Function listenSignalLiveClosedPerSignal

This function lets you listen for specific closed trading positions that come from live executions. It’s designed to prevent duplicate notifications for the same signal, ensuring you only receive each event once.

Think of it as a filter – you provide a condition (`filterFn`) to determine which closed positions you’re interested in.

The provided callback (`fn`) will then be triggered for those closed positions that meet your condition, but only the first time that signal closes. This mechanism helps avoid unwanted repetitions and ensures accuracy in your processing. 

Importantly, this function only receives data from live trading environments and won't be triggered during backtesting. It's built to work with the `Live.run()` function.

Each trading strategy, exchange, timeframe, and symbol is treated separately, so even if multiple strategies are running, their notifications won't interfere with each other.


## Function listenSignalLiveClosed

This function lets you listen for when a live trade closes. 

It's specifically for trades that are actively happening, not for backtesting simulations. You'll get notified when a position closes, whether it's because of a profit target, a stop-loss, time expiration, or a manual close. 

The notification includes details like the reason for the closure, the timestamp, and the profit and loss – all accounting for fees and slippage. Importantly, once a trade closes and triggers this callback, no more events will be sent for that particular trade.

Because it only works with live, ongoing trades, you can safely use this for tasks that have real-world consequences, such as automatically placing orders or sending alerts. You don't need any extra checks to see *why* the event is happening; the information you need is already directly available.

## Function listenSignalLiveCancelledPerSignal

This function lets you listen for when signals are cancelled during live trading. It only works with live executions, not replays.

It ensures you only receive each cancellation notification once, even if the underlying system tries to send it multiple times. This helps avoid processing the same cancellation repeatedly.

The filtering function you provide is checked *before* the deduplication happens, so it can't accidentally hide subsequent events. 

You provide a function to decide which cancellations you’re interested in and a function to handle those specific cancellation events.


## Function listenSignalLiveCancelled

This function lets you listen for situations where a trading signal was cancelled before it actually became a trade. 

Think of it as catching signals that were dropped – maybe the wait time ran out, the price moved unexpectedly, or a user cancelled them. 

It's specifically for live trading scenarios (not backtesting). This makes it ideal for actions like sending out notifications or mirroring orders, since you know a real trade never happened.

You provide a function that will be called whenever a signal is cancelled, and that function receives details about the cancellation, including a reason and a unique ID if the user cancelled it.

## Function listenSignalLiveActivePerSignal

This function lets you set up a special alert that triggers only once for each trading signal.

It listens for updates during live trading executions, not during backtesting.

Think of it as a way to receive notifications about specific events in your trades, like when a trade hits a certain profit level – but only the first time that event happens.

The alert is triggered only when a trade meets a specific condition you define, and then it stays silent for that trade until a new signal appears. 

This prevents multiple notifications for the same trade, as it remembers the last signal it acted on. The criteria you set will be checked before any of that happens, so no event is missed because of the deduplication.

## Function listenSignalLiveActive

This function lets you listen for real-time updates while your strategies are actively trading. It provides data like profit and loss, and how close the price is to your take-profit or stop-loss levels.

You'll receive these updates frequently, basically once for every tick while a trade is open. 

Importantly, this only works during live trading sessions managed by `Live.run()`; it won't trigger during backtesting. This makes it ideal for actions that need to happen in the real world like sending alerts or placing mirrored orders.

You simply provide a function as an argument; this function will be called with the live data for each active tick.

## Function listenSignalLive

The `listenSignalLive` function lets you tap into the flow of live trading signals generated by your backtest. It's like setting up a listener that gets notified whenever a signal is produced during a live run. 

Importantly, this only works when you're using `Live.run()`.

The signals arrive in the order they happen, and `listenSignalLive` ensures these events are handled one at a time, so you don't miss anything. You provide a function (the `fn` parameter) which is called whenever a new signal event is ready to be processed. This function receives the signal information, allowing you to react to the live trading activity. The function also returns another function that can be called to unsubscribe.

## Function listenSignalIdle

The `listenSignalIdle` function lets you be notified whenever your trading strategy isn’t actively holding a position. Think of it as a signal that the strategy is just observing the market, not making any trades.

You provide a function that will be called each time this happens, and that function receives information about the current price and details about the strategy itself. This can be useful for tasks like logging inactivity or performing other background checks when the strategy isn't actively trading. The callback receives a special object with data about the tick, and crucially, the `signal` property will always be null in these events.


## Function listenSignalEventPerSignal

This function lets you keep track of individual trading signals and react to them as they happen. It listens for lifecycle events related to signals, like when a signal is opened or closed. You can specify a filter to only receive events for the signals you’re most interested in.

Essentially, it's a way to be notified each time a unique signal experiences a change, ensuring you don't miss important updates for each signal. Duplicate events for the same signal ID are ignored. If a signal has both an open and a close event, you can filter based on the event's action to control which ones trigger your callback.


## Function listenSignalEventOnce

This function lets you temporarily listen for specific lifecycle events, like when a trade is opened or closed, and react to them just once. Think of it as setting up a quick, temporary observer that only fires once it sees what you're looking for. After that single execution, it automatically stops listening, so you don't have to worry about cleaning up your subscriptions. You define what you’re looking for with a filter function, and provide a function that gets called when that event occurs. It’s great for handling events that you only need to deal with one time.


## Function listenSignalEvent

This function lets you keep track of what’s happening with your trading signals – when they're first created and when they’re closed. It’s like setting up an alert system to be notified whenever a new signal appears or an existing one finishes.

These events include signals that are opened in different ways - through automated scheduling, immediate execution, or when you manually activate them. You’ll also receive notifications when a signal closes due to a take-profit order, a stop-loss trigger, or time expiration.

The notifications will happen in the order they occur, even if your response to each notification takes some time. You provide a function that will be called each time a signal event happens, allowing your code to react to these changes. The function you provide will also return a function that can be called to unsubscribe.


## Function listenSignalClosedPerSignal

This function lets you react to when a trading signal is closed, but only when it's a *new* signal – whether it's from a live trading environment or a backtest. You provide a filter function to specify which closed signal events you're interested in, and a callback function that will be executed each time a new signal is closed and matches your filter. Think of it as setting up a listener that only fires when a signal finishes and you want to know about it. This is useful for tracking signal performance or triggering specific actions after a signal concludes. The function returns an unsubscribe function that you can call to stop receiving these notifications.

## Function listenSignalClosed

The `listenSignalClosed` function lets you be notified whenever a trading position closes, whether it's a live trade or part of a backtest. 

You provide a function that will be called each time a position closes, and this function will receive information about the closed position like its profit and loss (`pnl`), the reason for closing (`closeReason`), and the precise timestamp of the closure. 

Think of it as setting up a listener that keeps you in the loop about the final outcome of each trade. It returns a function that you can call to unsubscribe from this listener.

## Function listenSignalCancelledPerSignal

This function lets you listen for when a trading signal is cancelled. 

Essentially, it's a way to react specifically when a signal that was previously active is no longer going to be used.

You provide a filter to determine which cancelled signals you're interested in, and a function to execute whenever a signal is cancelled. The function returns a way to unsubscribe from these events when you no longer need to listen.

## Function listenSignalCancelled

This function lets you be notified when a signal is cancelled before a trade even begins. Think of it as a way to understand why a planned trade didn't happen.

You provide a function that will be called whenever a signal is cancelled, and that function receives information about why it was cancelled.

This is useful for debugging or understanding why your strategies aren’t executing as expected, giving you insights into potential issues with signal generation or strategy logic.


## Function listenSignalBacktestWaitingPerSignal

This function lets you monitor the backtest process, specifically focusing on events that occur while a trade is waiting to be triggered. 

It's designed to handle situations where a strategy is waiting for a specific condition to be met before entering a trade. The callback function you provide will only be called once for each unique trading signal.

The system intelligently prevents repeated callbacks for the same signal – it only fires once per signal id within a given backtest run. It’s also important to note this only applies to backtesting; it won't trigger during live trading.

You can use a filter function to specify exactly which waiting events you're interested in; the filter is checked before any deduplication happens, so it's always the first event processed.


## Function listenSignalBacktestWaiting

This function lets you listen for special updates during backtesting when a signal is waiting to be triggered. 

Think of it as getting notifications about potential trades *before* they actually happen.

You’ll receive information about the signal, and even a theoretical profit/loss (pnl) calculation, but remember, the trade isn’t open yet, so it’s just a projection. 

This is useful for analyzing backtest behavior or creating custom reports without interference from live trading data.

It only works with `Backtest.run()`, so no signals will come through when you're live trading.


## Function listenSignalBacktestScheduledPerSignal

This function lets you listen for specific events generated during backtesting, ensuring you only receive each signal once. It's designed to catch tick results that meet a certain condition you define.

Think of it as a way to react to important moments in your backtest, like when a signal is first created. 

This listener only works with backtest executions, not live trading. It keeps track of which signals it’s already processed, so you won’t get duplicate notifications. The filter you provide determines which events are considered, and events that don't match are ignored completely.


## Function listenSignalBacktestScheduled

This function lets you tap into events that happen when a strategy is waiting for a specific price to be reached during a backtest. Think of it as getting notified when a strategy says, "I want to buy when the price hits X."

It’s specifically designed for analyzing backtest results – you won’t receive these signals during live trading.

This notification happens only once, marking the very beginning of the "waiting" period for that specific order. Subsequent price movements while waiting are handled by other events.

You provide a function (the `fn`) that will be called whenever this “signal scheduled” event occurs, and the event will contain the details of the trade being planned. You can unsubscribe from these notifications when you no longer need them by returning the value that the function returns.


## Function listenSignalBacktestPerSignal

This function lets you tap into the stream of signals generated during a backtest. It’s like setting up a listener that gets notified whenever a new signal is produced.

You provide a filter – a way to choose which signals you're interested in – and a callback function that will be executed for each of those signals.

Importantly, it only works during an active backtest run and ignores signals that represent pauses or lack of activity (null signals). The system handles ensuring you only get each signal once, preventing duplicates.


## Function listenSignalBacktestOpenedPerSignal

This function lets you listen for when a backtest starts a new trade based on a specific signal. 

Think of it as a way to get notified each time a strategy makes a trading decision during a backtest. 

You provide a filter to decide which trade openings you're interested in, and a function to execute when those specific events happen.

Importantly, it only works for backtests – it won't trigger during live trading. To prevent redundant notifications, the function remembers the signals it has already processed, making sure you only receive each signal once, even if multiple strategies are running. Your filter function is checked *before* this deduplication, so a signal that doesn't match your filter won't affect the tracking of other signals.

## Function listenSignalBacktestOpened

This function lets you listen for when a trading position actually begins during a backtest. 

It's triggered when a strategy generates a buy or sell signal, marking the start of a position's cost. You'll receive details like the signal's entry price, stop-loss, and take-profit levels.

Crucially, this is for backtesting only; it won't work in live trading scenarios. Use this to analyze backtest results without interference from real-time trading activity. 

The information is already structured, so you don't need extra checks to access the relevant data. It provides a clean stream of data specifically about when positions are opened.


## Function listenSignalBacktestOnce

This function lets you temporarily tap into the backtesting process to react to specific events. Think of it as setting up a short-lived listener that only runs once. 

You provide a filter – a rule to determine which events you’re interested in – and a function that will be executed when a matching event occurs. Once that single event is processed, the listener automatically disappears, keeping things clean and preventing unwanted side effects. It's useful for things like capturing a specific data point or performing a quick calculation during a backtest run.


## Function listenSignalBacktestIdle

This function lets you listen for specific moments during a backtest when your trading strategy isn't actively doing anything – no positions held, no pending actions. 

Think of it as a way to get notified when your strategy is "quiet."  The data you receive will include the current price, the symbol being traded, and details about the strategy, exchange, and timeframe being used.

Importantly, this only works during backtesting; it won't trigger during live trading. It’s ideal for things like logging activity or creating reports that you want to keep separate from real-time data. You'll get the idle information directly without needing to filter based on action types. 

The function returns an unsubscribe function that allows you to stop listening for these idle events.


## Function listenSignalBacktestClosedPerSignal

This function lets you listen for when a backtest completes for a specific signal. 

It provides a way to react to the final result of a backtest, ensuring you only receive each signal's closure information once.

Think of it as a focused alert system—you specify a condition (the `filterFn`) and a function (`fn`) to be executed when a closed position meets that condition.

This functionality is strictly for backtesting, meaning it won't trigger during live trading.

Importantly, even if you have multiple strategies running simultaneously, each strategy's results are tracked separately, so one strategy's activity won't inadvertently mask results from another. The function also makes sure that no signal's closure is missed, even if there are repeats.


## Function listenSignalBacktestClosed

This function lets you listen for signals when a trading position closes during backtesting. 

It's a dedicated way to get information about how and when positions are closed—whether it's due to a take-profit order, a stop-loss, time expiration, or a manual close. You'll get details like the reason for the closure, the timestamp, and the realized profit and loss, factoring in fees and slippage.

This signal only comes from backtesting simulations; it won't trigger during live trading, which makes it ideal for analyzing backtest results and creating reports without interference from real-time market data. 

You don't need to check the event type; the information you need is directly available in the event object. The function returns an unsubscribe function so you can stop listening when you're finished.

## Function listenSignalBacktestCancelledPerSignal

This function lets you listen for specific events related to cancelled orders during backtesting. It’s designed to help you understand why orders might not have been filled as expected in a simulated trading environment.

The function focuses solely on backtesting scenarios, so you won't receive these notifications during live trading.

To avoid unnecessary notifications, it ensures each signal generates the callback only once, even if multiple cancellations happen. This prevents redundant information and keeps things streamlined.

You provide a filter function to select the cancelled events you’re interested in, and then a callback function that will be executed for those selected events. The filtering happens *before* the system eliminates duplicates, so your filter can’t miss events that might be important later.


## Function listenSignalBacktestCancelled

This function lets you keep an eye on backtest executions and get notified when a signal is cancelled before it ever becomes a trade.

Essentially, it’s for when a signal doesn't end up resulting in a position – maybe the price moved too fast or the wait time expired.

You'll get details about why the signal was cancelled, including a `reason` and a `cancelId` if a user manually stopped it.

This is specifically designed for backtesting only; it won't trigger during live trading, so it's perfect for analyzing backtest results and generating reports without interference from real-time activity.

To use it, you provide a function (`fn`) that will be called whenever a signal is cancelled in a backtest. The function receives an event object containing the cancellation details.


## Function listenSignalBacktestActivePerSignal

This function lets you monitor specific events during backtesting, triggered only when a condition is met for a particular trading signal. 

It's designed to give you alerts or perform actions based on a trade’s progress, but only the *first* time the condition is met for that trade. Think of it as a way to say, "Notify me when this trade hits a 5% profit, and then stop."

The system only works during backtesting runs and won’t interfere with any live trading you’re doing. It carefully prevents multiple alerts for the same trade, even if you’re running several strategies at once. 

The `filterFn` allows you to specify exactly which events you want to be notified about. This ensures you only receive the notifications you're interested in and that no event can prevent another matching event from triggering the callback.

## Function listenSignalBacktestActive

This function lets you tap into the real-time data stream from backtest simulations. 

Specifically, it gives you updates on each tick while a trade is open. 

You'll receive information like the current profit and loss, and how close the price is to your take-profit or stop-loss levels.

It’s designed for analyzing and reporting on backtest runs – it won’t be triggered during live trading, keeping your analysis clean.

The data you receive is already organized based on the action taken, so you can directly access the information you need. You provide a function (`fn`) that will be called with these tick result events. The function you provide will return another function that stops the subscription.

## Function listenSignalBacktest

`listenSignalBacktest` lets you hook into the backtesting process to react to signals as they happen. It's a way to get notified about what's going on during a backtest run. 

You provide a function that will be called whenever a signal event occurs.  The events you receive are specifically from when you're using `Backtest.run()`. 

Importantly, these signals are delivered one at a time, in the order they were created, which can be helpful for tasks like debugging or logging. The function you provide will return a function that you can call to unsubscribe from these signal events when you’re done.


## Function listenSignalActivePerSignal

This function lets you react to specific, active trading signals as they occur. It's like setting up a listener that gets triggered whenever a new signal becomes active and meets your defined criteria. The listener will only fire once for each signal, and it will only report the initial active tick before stopping for that signal. You provide a filter to specify which signals you're interested in and a callback function to execute when a matching signal becomes active. This is useful for tracking and responding to changes in your trading strategy's positions.


## Function listenSignalActive

This function lets you tap into real-time data about your trades as they're happening, whether you're live trading or running a backtest. Specifically, it sends updates whenever a position is open, giving you details like profit and loss (`pnl`), progress towards your take profit (`percentTp`), and distance from your stop loss (`percentSl`). Be aware that this provides an event for *every* tick of *every* open position, which can generate a lot of data – if you only need updates once per position, the `listenSignalActivePerSignal` function is a better choice. You pass in a function that will be called with this tick result data. The function you provide will return a function to unsubscribe.

## Function listenSignal

This function lets you receive updates whenever a trading strategy changes state – like when it's idle, opens a position, is actively trading, or closes a position. It's designed to handle these updates in a specific order, one after the other, even if your callback function takes some time to complete. To ensure smooth processing, it uses a queuing system to prevent multiple events from being handled at the same time. You provide a function that will be called with the relevant information about each event. When you're finished listening, the function returns another function that you can call to unsubscribe.

## Function listenSchedulePingPerSignal

This function lets you listen for signals that are waiting to be activated, often used in automated trading strategies. It's designed to handle the frequent "ping" events that happen while a trade is waiting to start, condensing them into a single notification for each signal. You provide a filter to decide which signals you're interested in and a function to execute when a new signal needs attention. This helps to streamline your logic and avoid being overwhelmed by numerous events.

## Function listenSchedulePingOnce

This function lets you listen for specific ping events and react to them just once. 

Think of it as setting up a temporary listener that automatically goes away after it sees what you're looking for. 

You define what kind of event you're interested in using a filter, and then you specify a function to run when that event appears. Once the event is handled, the listener disappears – no more fussing about unsubscribing manually. It’s great when you need to wait for a particular condition to be met and then do something about it, and you only want to do that one time.


## Function listenSchedulePing

This function lets you listen for periodic "ping" signals related to scheduled trading signals. These signals are sent every minute while a signal is waiting to be activated.

Think of it as a heartbeat check to confirm the signal monitoring process is running smoothly.

You provide a function that gets called whenever a ping event occurs, allowing you to perform custom actions or monitor the signal's lifecycle. The function returns an unsubscribe method so you can stop listening when needed.

## Function listenRiskOnce

`listenRiskOnce` lets you react to risk rejection events, but only once and then it stops listening. Think of it as setting up a temporary alert – it waits for a specific condition (defined by your filter) to happen, triggers your code, and then quietly goes away. This is helpful if you need to wait for a particular risk rejection to occur and then take action, without continuing to listen for more events afterward. You provide a function to identify the events you're interested in, and another function that runs just once when that event happens.


## Function listenRisk

The `listenRisk` function lets you monitor when trading signals are blocked because they don't meet your risk criteria. It's like setting up an alert specifically for situations where a trade is rejected due to risk.

You provide a function that will be called whenever a signal is rejected; this function receives information about the rejected signal. Importantly, you'll only receive these alerts for rejected signals – if a signal is approved, you won't get a notification, which helps prevent unnecessary messages.

The framework guarantees that these alerts are handled one at a time, in the order they arrive, even if your function performs asynchronous operations. This ensures a reliable and predictable way to respond to risk-related issues.


## Function listenPerformance

This function lets you tap into performance data generated during your trading strategy's execution. Think of it as a way to keep an eye on how long different parts of your code are taking. 

It sends you updates about timing metrics—essentially, it tells you when things happen and how long they last. This helps you pinpoint slow spots in your code, so you can optimize them and make your strategy run faster.

Importantly, the updates you receive are handled one at a time, even if the function you provide to handle them takes some time to complete. This ensures stability and avoids unexpected issues. You can unsubscribe from these performance updates whenever you no longer need them.

## Function listenPauseOnce

This function lets you temporarily listen for specific changes related to pausing within your trading system. 

You provide a filter – a way to identify which pause events you're interested in – and a function to execute just once when a matching event occurs.

After that single execution, the listener automatically stops, ensuring it doesn't interfere with other parts of your code. It's a clean way to react to a pause event only when needed.


## Function listenPause

This function lets you be notified whenever a trading strategy is paused or resumed. It's designed to handle situations where a new trade can’t be opened, or when existing trades are still closing.

Think of it as a way to keep your users informed about these temporary pauses. 

The function provides a way to subscribe to these events, ensuring that you receive them in the order they happen, even if your notification process takes some time. It also prevents multiple notifications from happening at the same time. 

You provide a function (`fn`) that will be called whenever the strategy's paused state changes. This allows you to trigger actions like displaying a message to the user.


## Function listenPartialProfitAvailablePerSignal

This function lets you keep a close eye on when partial profits become available for your trades. It essentially sets up a listener that will notify you whenever a new signal hits a certain profit level.

Because it's designed to avoid overwhelming you, it only reports the very first time a signal reaches a profit level.

If you need to track *every* profit level for a signal, you'll need to use a different approach – either keeping your own record or refining your filter to target a specific level.

You define how you want to filter these events using `filterFn` and then provide a function `fn` that gets called whenever a matching event occurs. The function you provide will receive details about the partial profit event. Finally, the function returns a function you can call to unsubscribe from these events.

## Function listenPartialProfitAvailableOnce

This function lets you set up a one-time alert based on your trading backtest. It listens for specific events related to partial profit levels, but only triggers your callback function once when a matching event occurs. After that, it automatically stops listening, which is really handy if you just need to react to a particular profit condition happening just once. You provide a filter to define what kind of events you're interested in, and then a function that will be executed when that specific event happens.

## Function listenPartialProfitAvailable

This function lets you monitor your trading strategy's progress towards profit goals. It will notify you whenever your strategy hits predefined profit milestones, like 10%, 20%, or 30% profit. 

It ensures that these notifications are handled one at a time, even if the notification processing takes a bit of time, to keep things orderly. You provide a function that will be called with details about the achieved profit level whenever such an event occurs. This subscription can be cancelled later by returning the result of this function.


## Function listenPartialLossAvailablePerSignal

This function lets you keep an eye on when partial losses occur during trading. It sends you information about each signal when a loss level is reached.

Importantly, you'll only get the first loss level notification for each signal – so if you need to track every single loss level, be sure your filtering function is specific to just one level.

You provide a way to decide which events you're interested in, and a function that will be called when a matching event occurs, providing details about the loss and the associated signal. When you're finished listening, the function returns another function you can call to unsubscribe.

## Function listenPartialLossAvailableOnce

This function lets you set up a listener that will react to specific changes in partial loss levels. You tell it what kind of loss event you're interested in using a filter function. Once an event matching your criteria appears, the provided callback function runs once, and the listener automatically stops. It's perfect for situations where you only need to react to a particular loss condition just one time. 

You provide a filter to specify which events should trigger the callback, and the callback itself handles the event data. After the callback executes, the subscription is automatically cancelled.

## Function listenPartialLossAvailable

This function lets you monitor your trading strategy's losses as they happen. It will notify you when your losses reach specific milestones, like 10%, 20%, or 30% of your initial capital.

The notifications are sent in the order they occur, and even if your callback function takes some time to process (like making an API call), the framework ensures events are handled one after another to keep things organized. To prevent problems, it makes sure your callback function runs one at a time.

You provide a function that will be called whenever a partial loss event is triggered, and this function receives information about the event. You can unsubscribe from these notifications by returning the value returned by this function.

## Function listenOrderStop

This function lets you listen for specific events related to order stops, particularly when those stops are being removed or have failed. Think of it as a way to be notified when a stop order is no longer valid.

It works closely with the order-continue system; you'll receive these notifications when a signal resolves to a terminal state – either because the order was deleted or because it experienced too many failures.

Importantly, these events happen *before* the stop order is completely shut down, so you'll get a chance to react before it's gone.

This feature is only used during backtesting; it doesn't exist in live trading. Any errors you encounter in your listener function won't halt the process, but will be logged for debugging. 

You provide a function that gets called with an `OrderStopContract` object, containing details about the stop. If your function returns a promise, the processing of these events will be done one after another.

## Function listenOrderSchedulePerSignal

This function lets you keep a close eye on when trading signals are scheduled or cancelled. It’s like setting up a notification system specifically for signal events. You provide a filter to determine which events you're interested in – perhaps only events for a specific signal – and a function to execute when a matching event occurs. The system cleverly avoids sending you the same notification multiple times for the same signal. You'll receive notifications for both when a signal is scheduled and when it's cancelled, so you can tailor your filtering based on the "action" property of the signal event. The function returns a cleanup function that you can use to unsubscribe from these notifications when you no longer need them.

## Function listenOrderSchedule

This function lets you keep an eye on scheduled orders, those you've set to trigger at a specific price. You’ll receive notifications when a scheduled order is created, essentially when the system is waiting for the market to reach your target price. You'll also get notified if those orders are canceled, whether it's because a timeout occurred, the price was rejected, or a user cancelled it.

It’s important to know that this doesn’t tell you when a scheduled order actually *activates* and becomes a real trade - for that, you'll need to use the regular signal listeners.

This event stream is something the framework itself uses to manage scheduled orders, so you'll see every event, even cancellations, regardless of the order's current status. 

If you’re building an exchange integration, using the broker adapter hooks is the recommended way.  This listener is more suited for observing and logging these events, or sending out notifications. 

The events are processed in the order they come in, even if your callback function does something asynchronously.


## Function listenOrderReject

This function lets you react to situations where the exchange definitively refuses an order – a rejection that won't be retried. It's like a notification system; it tells you when an order has been permanently rejected by the exchange.

Think of it as a last-resort signal – you'll only see it when the system has already determined the order won't go through.

If something goes wrong inside your reaction function, it won't impact the system’s decision-making process; the error will be logged.

You can safely use this notification for things like sending messages to telegram bots or audit logs.

To use it, you provide a function that will be called whenever an order is rejected; if your function returns a promise, the execution will be managed sequentially to prevent blocking. The function you provide will be called with details about the rejected order.


## Function listenOrderFill

The `listenOrderFill` function allows you to receive notifications whenever an order is definitively filled by the broker. It's like a final confirmation that the order actually went through – you won't get these notifications for rejected orders or forced closures.

These notifications tell you specifically whether an order to open a position was filled, a resting order was placed, or an order to close a position was executed.

Keep in mind that in backtesting, these confirmations are immediate because there's no actual exchange involved.

This is a notification system, not a control point. Any errors within your listener code won't interrupt the process; they'll be logged and handled internally. This makes it suitable for things like sending messages via Telegram, webhooks, or auditing.

You provide a function that will be called with details about the fill event, and this function can return a promise to handle the data asynchronously.


## Function listenOrderContinue

The `listenOrderContinue` function lets you track what's happening with your orders after a check is performed – specifically when the system is deciding whether to keep an order open or needs to re-evaluate it.

Think of it as a way to be notified about the ongoing status of an order, beyond just the initial check. This is different from simply knowing if an order was placed or filled.

It works with live trading environments, not during backtesting. The information it provides relates to whether the order is still considered active or is scheduled, and indicates if any temporary issues needed to be resolved.

You provide a function that will be called whenever a continue event happens, and this function can even handle asynchronous operations. Any errors within your function won't disrupt the overall process; they’ll be logged and handled internally.


## Function listenMaxDrawdownPerSignal

This function lets you keep a close watch on maximum drawdowns for individual trading signals. It essentially sets up a listener that alerts you whenever a new signal experiences a maximum drawdown. 

To prevent repeated notifications for the same signal, it only reports the initial drawdown; subsequent, more severe drawdowns for that signal are ignored. You provide a filter to specify which signals you're interested in, and a callback function that executes when a relevant drawdown event occurs, giving you the details of that drawdown. The function returns a cleanup function that you can use to stop listening for these events when you no longer need them.


## Function listenMaxDrawdownOnce

This function lets you react to specific max drawdown events, but only once. It's like setting up a temporary alert – you tell it what conditions to look for (using `filterFn`), and when those conditions are met, it runs your code (the `fn` callback) and then stops listening. This is perfect for situations where you need to respond to a drawdown condition just once and then move on. It simplifies cleanup because it automatically cancels the subscription after the single execution.


## Function listenMaxDrawdown

This function lets you keep an eye on when your trading strategy hits new drawdown lows. It's like setting up an alert that triggers whenever your strategy's losses reach a new maximum point.

The alerts are delivered one at a time, even if the function you provide to handle them takes some time to run. This prevents things from getting messy if your response is complex.

You can use this to monitor how your strategy is performing and adjust things like risk levels as needed. To use it, you simply give it a function that will be called whenever a new drawdown is detected. The function you give it will be called with all the relevant drawdown data. When you're done, the function returns another function that you can call to stop listening to these drawdown events.

## Function listenIdlePingOnce

This function lets you react to idle ping events – those signals that indicate the system is not actively processing data. It’s designed to trigger a specific action *just once* when a particular type of idle ping occurs. 

You define a condition (`filterFn`) to determine which idle ping events you're interested in, and then provide a function (`fn`) that gets executed when an event matches your condition. The function returns a cleanup function that you can call to stop listening for these events.


## Function listenIdlePing

This function lets you listen for moments when your backtest isn't actively processing any trading signals. It's like getting a notification when everything's quiet. 

You provide a function that will be called whenever this "idle" state occurs.

Essentially, it's a way to react to periods of inactivity during a backtest, triggered when no signals are being monitored. 

The function you provide receives an `IdlePingContract` object containing details about the event. The `listenIdlePing` function returns an unsubscribe function, so you can stop listening whenever you need to.

## Function listenHighestProfitPerSignal

This function lets you track the most profitable trades for each signal. It will notify you whenever a new signal reaches its highest profit point.

To avoid repeated notifications for the same signal, it only reports the *first* peak profit it finds that meets your criteria, and then stops sending updates for that signal.

You provide a filter to specify which signals you're interested in, and a function to execute when a new highest profit signal is detected. The function returns a way to unsubscribe from receiving these updates.

## Function listenHighestProfitOnce

This function lets you set up a one-time alert for when a specific trading condition is met – specifically, when a contract reaches a certain highest profit level. You provide a filter to define what "highest profit" triggers the alert, and then a function that will run just once when that condition is met. After the function runs, the alert automatically stops listening, making it ideal for situations where you need to react to a particular event and then move on. Think of it as a temporary notification system for profitable trades.

## Function listenHighestProfit

This function lets you keep track of when a trading strategy hits a new peak profit. It's like setting up a notification system that gets triggered whenever your strategy earns more than it has before. The system ensures that these notifications are handled one at a time, even if the notification process itself takes some time. This is handy for things like logging milestones, or even automatically adjusting your trading strategy based on profit levels. To use it, you provide a function that will be called with the details of the new highest profit.

## Function listenExit

The `listenExit` function allows you to be notified when the backtest or live trading process encounters a problem so severe it needs to stop immediately. 

It’s like a safety net for the most critical errors that can bring the entire system down. These aren’t errors you can just recover from – they require a shutdown.

You provide a function (`fn`) that will be called when such a fatal error occurs. This allows you to perform cleanup or logging before the process ends.  The error information is passed to your function.

This function also ensures that error handling is done one step at a time to prevent conflicts.

## Function listenError

This function allows you to be notified when errors occur during the backtesting process that are designed to be handled and don't halt the entire process. 

Think of it as setting up an error listener specifically for situations where things go wrong but the backtest can still continue – like a temporary API issue.

The errors are handled one at a time, in the order they happen, even if the code you write to deal with the error takes some time to execute. This ensures that errors are processed safely and don't cause unexpected conflicts. It provides a way to react to problems as they arise while keeping the backtest running smoothly.


## Function listenDoneWalkerOnce

This function lets you react to specific events happening behind the scenes when a trading backtest completes. 

It allows you to set up a listener that only triggers once for events that match your criteria – defined by a filtering function. 

Think of it as a way to get notified about a particular outcome of a background process, and then automatically stop listening after that one notification. You provide a condition (`filterFn`) to specify what kind of completion event you're interested in and then a function (`fn`) that will be executed when the event matches.


## Function listenDoneWalker

This function lets you listen for when a background process within your backtest finishes. It's designed to handle events sequentially, even if the function you provide takes some time to execute. Think of it as a way to react to the end of a task, making sure things happen in the right order and avoiding unexpected conflicts. You give it a function that will be called when the process is done, and it returns a function that you can use to unsubscribe from these completion notifications later.

## Function listenDoneLiveOnce

This function lets you react to when background tasks finish running within your backtest. It's designed to be simple: you tell it what kind of completion events you’re interested in, and it calls your provided function just once when a matching event occurs. Once the callback runs, it automatically stops listening, so you don't have to worry about cleanup. Think of it as a temporary alert for a specific kind of background task completion.

You'll give it a way to identify the events you want to respond to, and then the action you want to take when one of those events happens. This is great for things like logging a single completion message or performing a specific action only once after a background process completes.


## Function listenDoneLive

This function lets you listen for when background tasks initiated by `Live.background()` are finished. Think of it as getting notified when a process has completed its run. It ensures that these notifications happen one after another, even if the notification itself involves some asynchronous work, preventing issues from multiple callbacks running at the same time. You provide a function that will be called with information about the finished task each time it completes. The function you provide returns another function that can be called to unsubscribe from these completion notifications.

## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but only once. You provide a filter to specify which backtest completions you're interested in. When a matching backtest is done, a provided function will run just one time to handle the completion event, and then the subscription is automatically removed so you won’t get further notifications. Think of it as a single, targeted alert for a specific backtest outcome.


## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. 

It's like setting up a listener that gets triggered when the backtest is done. 

The listener function you provide will be called when the backtest completes, and importantly, these calls happen one after another, even if your listener function needs to do some asynchronous work. This prevents any unexpected conflicts or issues arising from multiple callbacks trying to run at the same time. You'll receive a `DoneContract` object containing information about the completed backtest.


## Function listenCheck

The `listenCheck` function lets you monitor the status of your orders on an exchange. It's like having a watchful eye on each trade to ensure it's still active and valid. 

This function listens for “check” events, which are triggered by every live tick while a signal is being monitored. These events tell you if the order is still open ("active") or if it's a pending order ("schedule").

If something goes wrong during the check—like a temporary network issue—the system will try a few more times before giving up. However, if the order is definitively deleted, the system will immediately close or cancel the position and stop the backtest. Understanding these error types is important for building robust trading strategies.

You provide a function that will be called whenever a check event occurs, and this function can even handle asynchronous operations.

## Function listenBreakevenAvailablePerSignal

This function lets you keep an eye on when breakeven conditions are met for individual trading signals. It’s like setting up a notification system – you specify a filter to decide which signals you're interested in, and then provide a function that will be executed whenever a new signal satisfies that filter and reaches a breakeven state.  Essentially, it provides a way to react to signals achieving profitability. You can think of it as a listener that triggers an action when a signal becomes breakeven, allowing you to adjust strategies or manage risk accordingly. The listener can be unsubscribed when not needed.


## Function listenBreakevenAvailableOnce

This function lets you listen for specific breakeven protection events and react to them just once. You provide a filter – essentially, the criteria for which events you’re interested in – and a callback function that will be executed when a matching event occurs.  Once that one event has been processed, the listener automatically stops, so you don't have to manage the subscription yourself. This is handy when you need to react to a particular breakeven condition and then move on.


## Function listenBreakevenAvailable

This function lets you be notified whenever a trade's stop-loss automatically adjusts to the entry price – that’s the breakeven point. It’s designed to handle situations where a trade has made enough profit to cover the initial costs.

The notifications are handled one at a time, ensuring that even if your callback function takes some time to process, it won’t interfere with other notifications. You simply provide a function that will be called whenever this breakeven event occurs, receiving details about the trade involved. This allows you to react to and potentially manage those breakeven situations within your trading strategy.


## Function listenBeforeStartOnce

This function allows you to react to specific events that happen just before a backtest begins. You provide a filter – a way to identify which events you're interested in – and a function that will be executed once when a matching event occurs. Once that function runs, the subscription automatically stops, ensuring it only runs once. It's useful for performing one-time setup tasks right before a backtest starts, like validating configurations or setting initial conditions.

## Function listenBeforeStart

This function lets you hook into what happens right before a trading strategy begins for a specific asset. You provide a function that gets called just before the engine kicks off a new strategy execution. Importantly, these calls happen one after another, even if your function takes some time to complete – this helps prevent any unexpected issues from occurring simultaneously. Think of it as a chance to prepare or log details before the trading actually starts. To stop listening for these events, the function returns another function that you can call.


## Function listenBacktestProgress

This function lets you keep an eye on how your backtest is running. It sets up a listener that receives updates as the backtest progresses, particularly during the background calculations. These updates are delivered one after another, even if the function you provide to handle them takes some time to complete. Think of it as a way to get periodic snapshots of the backtest's status as it’s working.

The function takes a callback—a piece of code you'll provide—that will be called each time a progress update is available. This callback receives an object containing information about the progress. You can unsubscribe from these updates when you are finished by calling the function that is returned by `listenBacktestProgress`.


## Function listenAfterEndOnce

This function lets you react to specific events that happen after a trading simulation has finished, but only once. You provide a filter to specify which events you're interested in, and a function that gets executed when a matching event occurs. The best part is, it automatically stops listening after that single execution, so you don't have to worry about managing subscriptions yourself.

Here's a breakdown:

*   You give it a rule (`filterFn`) to decide which events to listen for.
*   You give it a task (`fn`) that will run when a matching event is found.
*   The function takes care of unsubscribing after the callback runs just once.


## Function listenAfterEnd

This function lets you listen for events that happen *after* a trading strategy's execution is complete for a particular asset. It's designed for situations where you need to perform actions like updating databases or generating reports based on the strategy's results.

The events are delivered one at a time, and even if your callback function takes some time to run (like making an API call), the system makes sure events don't pile up or run concurrently. This provides a reliable way to handle post-execution tasks in a controlled manner.

To use it, you provide a function that will be called with information about the completed strategy execution whenever it finishes. The function you provide will be returned, and you can call this returned function to unsubscribe.


## Function listenActivePingPerSignal

This function lets you listen for specific activity related to your trading positions. It allows you to react only when a new signal appears, ignoring subsequent ticks for the same position. You provide a filter to decide which signals you’re interested in, and a function to execute when a matching signal is detected. Think of it as a way to be notified only when something significant changes in your positions.


## Function listenActivePingOnce

This function helps you react to specific "active ping" events and then automatically stops listening. Think of it as setting up a temporary listener that only fires once when a condition is met. You define what kind of ping event you're looking for using a filter function, and then provide a callback function that will execute when that event happens. After the callback runs, the listener is automatically turned off, so you don’t have to worry about managing subscriptions. It's perfect for situations where you only need to respond to an event once. 

The `filterFn` lets you specify exactly which active ping events should trigger your callback.  The `fn` is the function that will be executed when the right event is detected.

## Function listenActivePing

This function lets you keep an eye on active trading signals. It listens for events that happen every minute, giving you information about the lifecycle of each signal. You can use this to build systems that react to changes in which signals are active.

The events are handled one at a time, even if your processing logic takes some time, so you won't have any conflicts. 

Essentially, you provide a function that gets called whenever a new active ping event is detected, allowing your application to respond to signal activity. The function will return an unsubscribe function.

## Function listWalkerSchema

This function gives you a look at all the different strategies or "walkers" currently set up within your backtest-kit system. Think of it like a directory listing – it shows you what's available. It’s particularly helpful if you're trying to understand how your system is configured, documenting your strategies, or building an interface that lets you easily switch between them. The result is an array of schema objects, each describing a walker.

## Function listSweepSchema

This function lets you see all the different "sweep" strategies that have been set up in your backtesting environment. Think of sweeps as different ways you might want to experiment with your trading strategy – for example, testing different parameter combinations.  It’s like getting a directory listing of all your pre-defined testing approaches. You can use this to check that everything is configured correctly, build helpful displays for your results, or simply understand the options available for your backtesting runs. It returns a list of these strategies, allowing you to inspect their settings.


## Function listStrategySchema

This function helps you discover all the trading strategies that have been set up within the backtest-kit system. It essentially gives you a complete inventory of the strategies you're working with. You can use this information to troubleshoot issues, create documentation, or build user interfaces that need to display available strategies. The function returns a list of strategy descriptions, providing details about each one.


## Function listSizingSchema

This function lets you see all the sizing strategies currently set up in your backtest kit. It gathers information about how positions are sized, which is essential for managing risk and trade size. Think of it as a way to inspect the sizing rules your backtest is using – handy for checking your setup or creating tools to display these configurations. The result is a list, and each entry describes a particular sizing strategy.

## Function listRiskSchema

This function lets you see all the risk schemas that your backtest kit is using. Think of it as a way to peek behind the curtain and view the risk configurations you've set up. It gives you a list of these configurations, making it easier to troubleshoot, create documentation, or build user interfaces that interact with your backtesting environment. Basically, it's a handy tool for understanding how your backtest assesses and manages risk.

## Function listMemory

This function lets you see all the stored data – we call them "memory entries" – associated with the current trading signal. It's like checking a record of past events or planned actions.

It works by retrieving the signal's context, which includes whether you're in a backtesting or live trading environment.

You only need to provide the bucket name where the memories are stored as a parameter.

The function returns a list of these memory entries, each containing a unique ID and the data itself, neatly packaged for you to examine.


## Function listMCPSchema

This function lets you see all the different data structures your backtest kit is using for communication between its components. It essentially provides a list of all the registered Model Context Protocols (MCPs). 

Think of it as a way to explore what’s going on behind the scenes, perfect for troubleshooting or when you need to understand the various data models your system handles. You can use this information to generate documentation or build user interfaces that adapt to the available data. It gathers all the MCPs that were previously registered using the `addMCPSchema` function.

## Function listFrameSchema

This function lets you see a complete list of all the different data structures, or "frames," that your backtest kit is using. Think of it like a directory of all the data layouts. 

It’s particularly handy if you're troubleshooting, need to understand how your data is organized, or if you want to build tools that automatically adapt to the frames you're using. The function returns a promise that resolves to an array containing details about each registered frame.


## Function listExchangeSchema

This function helps you discover all the exchanges your backtest-kit setup knows about. It returns a list of descriptions, essentially telling you what different exchanges are configured and available for use. Think of it as a quick way to see what data sources your backtest kit can connect to – it's great for checking your configuration or building tools that need to know which exchanges are present. It gathers information about each registered exchange, allowing you to examine them or build user interfaces that adapt to the available exchanges.

## Function hasTradeContext

This function simply tells you whether the trading environment is ready for you to perform actions. 

Think of it as a quick check to see if everything is set up correctly before you try to fetch data or execute orders.

It confirms that both the execution context and the method context are active. 

You'll need this to be true before using functions like getting candle data or formatting prices – essentially, when you're interacting with the trading system.


## Function hasNoScheduledSignal

This function helps you check if a trading signal is currently scheduled for a particular asset, like "BTCUSDT". It will return `true` if there isn't a signal waiting to be triggered, which is useful if you want to make sure you're not accidentally generating new signals when one is already planned. It figures out whether you're running a backtest or a live trading session automatically, so you don’t have to worry about setting that up yourself. You can think of it as the opposite of `hasScheduledSignal`.

## Function hasNoPendingSignal

This function lets you easily check if there's currently a pending signal for a specific trading pair. It returns `true` if there isn't a pending signal, which is helpful for preventing unwanted signal generation. Think of it as the opposite of `hasPendingSignal`. It intelligently figures out whether you're in backtesting or live trading mode, so you don’t have to worry about that. You just provide the trading symbol you're interested in.


## Function getWalkerSchema

This function helps you find the blueprint for a specific trading strategy component, which we call a "walker." Think of a walker as a mini-program that performs a particular task during backtesting, like generating signals or managing orders.

You provide the name of the walker you're interested in, and this function returns a detailed description of how that walker is structured and what it expects. It's useful for understanding how different walkers work together in a complete backtesting system.

Essentially, it’s a lookup tool for walker definitions.


## Function getTotalPercentHeld

This function tells you what percentage of your initial position you still hold for a specific trading pair. Think of it as a measure of how much of your original trade is still open. A value of 100 means you haven’t closed any part of the trade yet, while 0 means the entire position has been closed. It's particularly useful when you've closed out parts of your position over time, taking into account any dollar-cost averaging (DCA) entries. It’s essentially the same as using the `getTotalPercentClosed` function. You just pass the trading pair’s symbol to get the result.

## Function getTotalPercentClosed

This function tells you what percentage of your position is still open for a specific trading pair. Think of it as a quick way to see how much of your initial trade is still active – 100% means nothing has been closed, while 0% means the entire position is closed. It handles situations where you’ve closed parts of your position over time, taking into account any dollar-cost averaging (DCA) entries. The system figures out whether you're in a backtest or a live trading environment automatically, so you don't need to worry about that. You just need to provide the symbol of the trading pair you're interested in.

## Function getTotalCostClosed

`getTotalCostClosed` helps you figure out how much money you've invested in a specific trading pair, like BTC/USDT. It looks at your current holdings and calculates the total cost, taking into account any average cost calculations you’ve set up along the way. This is particularly useful when you've been gradually adding to your position through dollar-cost averaging (DCA) and have also been closing portions of it. The function automatically knows whether it's running in a backtest or a live trading environment.

You simply provide the trading pair’s symbol as input (e.g., "BTC/USDT") and it returns the calculated cost as a number.


## Function getTimestamp

This function provides a way to get the current timestamp within your trading simulations or live executions. When you're backtesting strategies, it returns the timestamp associated with the timeframe you're currently analyzing. If you're running in a live environment, it delivers the actual, real-time timestamp. It’s useful for keeping track of time-related events within your trading logic.


## Function getSymbol

This function retrieves the symbol you're currently trading, like "BTCUSDT" or "ETHUSD," based on the environment your backtest or trading system is running in. It's a simple way to know exactly what asset your strategies are working with. Think of it as asking "What am I trading right now?". It returns this symbol as a promise that resolves to a string.

## Function getSweepSchema

This function lets you access the details of a specific automated testing run, often called a "sweep," within the backtest-kit system. Think of it like looking up the blueprint for how a particular automated test was configured. You provide a unique name identifying the sweep, and it returns a set of instructions outlining the sweep's parameters and setup. This is helpful for understanding and potentially modifying how a test was executed.


## Function getStrategyStatus

This function lets you peek into the current state of a trading strategy during a backtest or live trading session. It gives you a snapshot of what's happening behind the scenes, including any signals that are queued up, actions waiting to be processed, and the ID of the signal currently being handled. Think of it as a way to get a quick, real-time look at the strategy's internal workings, helping you understand its behavior and troubleshoot any issues. You simply provide the symbol of the trading pair you're interested in to retrieve this status information. It automatically figures out whether it's running a backtest or a live trade, so you don't need to worry about that.

## Function getStrategySchema

This function helps you find out the structure and details of a specific trading strategy you've registered within the backtest-kit framework. It's like looking up the blueprint for a particular strategy. You provide the strategy's unique name, and it returns a detailed description of what that strategy expects – its inputs, outputs, and overall configuration. This is useful for validating strategy configurations or understanding what's required to use a particular strategy.


## Function getStrategyPaused

This function lets you check if a trading strategy is currently paused. 

When a strategy is paused, it stops opening new trades; the `getSignal` function isn't called, and new trade requests are held until the strategy resumes. However, any existing trades that are already open, like pending orders, will continue to be managed as usual.

It automatically figures out if it's running in a backtest or a live trading environment, so you don't have to worry about setting that.

You just need to provide the symbol of the trading pair you’re interested in to get its paused status.

## Function getSizingSchema

The `getSizingSchema` function helps you find the specific rules for determining how much to trade, based on a given name. Think of it as looking up a pre-defined plan for position sizing. You provide a name that identifies the sizing strategy, and it returns a detailed object outlining that strategy's logic and parameters. This is useful for applying different sizing approaches within your backtesting framework. Essentially, it’s your way to access and utilize existing sizing configurations.

## Function getSignalState

This function helps you retrieve a specific piece of data associated with a trading signal. Think of it as pulling information related to a particular trade, like performance metrics or settings.

It automatically figures out if you’re in a backtesting or live trading environment, so you don't have to worry about that detail.

This is especially useful for advanced strategies that track things like how long a trade is open and its profitability, accumulating these details over multiple trades.

The function requires you to provide the symbol you’re trading and some initial data, and it will return the saved state of that signal. If no signal is active, it will throw an error, because it needs a signal to work with.


## Function getSessionData

This function allows you to retrieve data that's specifically linked to your trading setup – the symbol, strategy, exchange, and timeframe you're using. Think of it as a way to store information that needs to be remembered between candles, even if the backtest or live session restarts. It’s particularly handy for saving things like LLM results, intermediate calculations, or any data that needs to be tracked across multiple candles without being tied to a single signal. You provide the symbol of the trading pair you're interested in, and it returns the associated data, or null if no data is stored for that symbol. The framework automatically figures out whether it's running a backtest or live mode.


## Function getScheduledSignal

This function helps you retrieve information about any scheduled signals that are currently running for a particular trading pair. Think of it as checking if a pre-planned signal is active.

It will fetch the details of the signal, or if nothing is scheduled, it simply returns nothing.

The function smartly figures out whether it's running in a backtesting or live trading environment, so you don’t need to worry about that detail.

You just need to provide the symbol, such as 'BTCUSDT', to see the details of the scheduled signal associated with it.

## Function getRuntimeInfo

This function gives you a peek into the current state of your backtest or trading environment. It provides essential details like which symbol you're analyzing, the exchange it's on, the timeframe you're using, and the overall strategy in play. You'll also find out whether it's a backtest (historical data) or a live trading session. It’s like checking the dashboard to understand exactly what’s happening right now.


## Function getRiskSchema

This function lets you fetch a specific risk profile that's already been set up in the system. Think of it as looking up details about how much risk you're willing to take for a particular trading strategy. You provide a unique name to identify the risk profile you want, and it returns the full set of instructions and parameters associated with that risk profile. It’s useful for examining the configuration of a particular risk management setup.

## Function getRemainingCostBasis

The `getRemainingCostBasis` function helps you figure out how much of a trading position you still own, in dollar terms. It's especially useful if you've been closing off parts of your position gradually, like with a dollar-cost averaging (DCA) strategy. This function automatically factors in those partial closes when calculating the remaining cost basis, ensuring an accurate view of your position.  Essentially, it gives you the remaining investment value that hasn’t been sold. It's directly related to and functions the same as `getTotalCostClosed`. You just provide the trading symbol (like BTC-USD) and it will return the number.

## Function getRawCandles

The `getRawCandles` function allows you to retrieve historical candlestick data for a specific trading pair and timeframe. You have a lot of control over how much data you get, choosing to specify a number of candles (`limit`), a start date (`sDate`), and/or an end date (`eDate`).

It's designed to be reliable – the function always respects the current execution context and ensures your backtesting avoids looking into the future.

Here's how you can use the optional parameters to get the data you need:

*   You can provide both a start and end date along with a specific number of candles.
*   Alternatively, you can specify just a start and end date, and the system will automatically determine the number of candles needed to cover the range.
*   If you only want a specific number of candles, the function will automatically use a default starting point based on the current context.
*   You can also specify a starting date and the number of candles you want.

The function always validates your date choices to prevent errors. 

The `symbol` parameter lets you choose which trading pair you want data for (like BTCUSDT). The `interval` parameter defines the timeframe for the candles (options include 1-minute, 3-minute, 1-hour, and others).


## Function getPositionWaitingMinutes

getPositionWaitingMinutes lets you check how long a trading signal has been patiently waiting to be put into action. 

It tells you the waiting time in minutes for a specific trading pair, like BTCUSDT. 

If there's no signal currently waiting, it will return null. 

You simply provide the trading symbol as input to get the information.


## Function getPositionPnlPercent

This function helps you understand how your open positions are performing financially. It calculates the unrealized profit or loss as a percentage of your initial investment for a specific trading pair. 

Think of it as a quick way to see if your current strategy is gaining or losing money on open trades. It considers things like how much of a trade you've already closed, any averaging you've done when entering positions, and even potential slippage and fees. 

It figures out whether you're in a backtesting simulation or live trading environment on its own. It also automatically gets the current market price for the symbol, so you don’t need to retrieve it separately. If you don't have any pending signals open, the function will let you know.

The function requires a symbol, which is simply the trading pair you're interested in (like BTCUSDT).

## Function getPositionPnlCost

This function helps you determine the unrealized profit or loss in dollars for a trade you're currently holding. It considers the percentage profit or loss, your total investment cost, and factors in things like partial closes, averaging costs, any slippage you experienced when entering the position, and trading fees. 

Essentially, it gives you a clear picture of how your current position is performing financially.

If you don’t have any open positions based on signals, the function will let you know.

It smartly figures out if it's running in a backtesting simulation or live trading environment, and it automatically gets the current market price to perform the calculation. You just need to provide the symbol of the trading pair (like BTCUSDT).


## Function getPositionPartials

getPositionPartials lets you check how much of a trade has already been partially closed, whether it was for profit or loss. It gives you a history of those partial closures, showing the percentage closed, the price at which it happened, and the cost basis at that time. If no signal is currently being backtested, it will alert you. If no partial closures have happened yet, you’ll receive an empty list. To use it, you simply provide the trading symbol you’re interested in, such as "BTCUSDT".

## Function getPositionPartialOverlap

This function helps you avoid accidentally closing parts of your positions multiple times at roughly the same price. It checks if the current market price is close enough to a previously executed partial close order.

Think of it as a safety net: before placing another partial close, it makes sure you're not already working on something similar.

The function calculates a tolerance range around each existing partial close price, based on a percentage you can configure. If the current price falls within that range, it means a partial close might already be in progress.

You provide the trading symbol and the current price to check, and optionally a custom tolerance range. It returns `true` if a partial close is likely already in progress, and `false` otherwise. This allows you to intelligently manage your partial close orders.

## Function getPositionMaxDrawdownTimestamp

getPositionMaxDrawdownTimestamp helps you pinpoint exactly when a specific trading position experienced its biggest loss during its lifespan. It’s useful for understanding the most vulnerable moments of a trade.

You provide the symbol of the trading pair (like BTC-USDT), and the function will return a timestamp representing that low point. 

Keep in mind, it won't work if there are no signals currently associated with the position.

## Function getPositionMaxDrawdownPrice

This function helps you understand how much a specific trade has lost at its lowest point. It figures out the lowest price reached while you held that position.

To use it, you need to provide the symbol of the trading pair, like "BTC-USD".

Keep in mind, it won't work if there aren't any trading signals associated with the position. If that's the case, it will let you know there's an issue.


## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand the performance of a specific trading position. It calculates the maximum drawdown of the profit and loss (PnL) percentage experienced by that position. Essentially, it tells you the lowest profit percentage the position saw during its entire lifespan.

You provide the trading pair symbol – like 'BTC-USDT' – and the function returns a number representing that maximum drawdown percentage.

If there's no active trading signal associated with the position, the function won't work and will let you know.

## Function getPositionMaxDrawdownPnlCost

This function helps you understand the financial impact of a trading position. It calculates the total cost in terms of profit and loss (expressed in the quote currency) that occurred when the position hit its lowest point. Think of it as quantifying how much money you lost at the worst possible time for that particular trade. To use it, you simply provide the trading symbol, like "BTC-USDT," and it returns that PnL cost value. If there isn't a trading signal currently active, the function will let you know it can’t proceed.


## Function getPositionMaxDrawdownMinutes

This function helps you understand how far back in time your trading position experienced its biggest loss. It tells you the number of minutes that have passed since your position hit its lowest point. A value of zero means the worst loss just happened.

If there's no active trading signal for the specified asset, the function will let you know. You need to provide the trading pair symbol, like "BTCUSDT", to get this information.

## Function getPositionLevels

getPositionLevels lets you check the prices at which you've entered a position using dollar-cost averaging (DCA). It returns an array of prices, starting with the initial price when the trade was triggered. If you haven't added any more prices through commitAverageBuy, you’ll get an array containing only the initial price. 

If there’s no active trade currently in progress, the function will let you know. You specify which trading pair (like BTC/USDT) you're interested in when calling the function.

## Function getPositionInvestedCount

getPositionInvestedCount tells you how many times you've added to a particular trade using dollar-cost averaging (DCA). It essentially counts the number of DCA entries made for the current pending signal.

A value of 1 means the trade started with just the initial investment.

Each time you successfully use commitAverageBuy() to add more to the trade, this number goes up by one.

If there's no active trade currently being DCA'd, this function will let you know.

It works whether you're running a backtest or a live trade, automatically adjusting to the environment. You just need to provide the symbol of the trading pair you're interested in.

## Function getPositionInvestedCost

getPositionInvestedCost helps you find out how much money you've put into a trade for a specific symbol. It calculates the total cost of buying assets, based on the entries you’ve made. 

Essentially, it adds up all the costs associated with those buys. If there aren’t any pending trades, it will let you know. It figures out whether you're in a backtest or a live trading environment without you needing to specify.

You just need to provide the symbol of the trading pair you're interested in, like "BTCUSDT," and it will return the total invested cost.


## Function getPositionHighestProfitTimestamp

This function helps you find out exactly when a specific trading position reached its peak profit. It looks at the history of a position for a given trading pair (like BTC/USDT) and tells you the timestamp—essentially, the date and time—when the most profit was made during that position's existence. 

If there's a problem and no trading signals are available for that position, it will let you know.

You provide the symbol of the trading pair, and it returns a timestamp.


## Function getPositionHighestProfitPrice

This function helps you find the highest price your trading position has reached while in profit. 

It starts by remembering the price when you first opened the position. 

Then, as the price moves, it continuously updates this record. For long positions, it looks for the highest price above your entry price; for short positions, it tracks the lowest price below your entry price. 

You'll always get a price back—at the very least, the original entry price—and it will only work if there's an active trading signal. This value represents the peak profit achieved for that specific trade.

## Function getPositionHighestProfitMinutes

This function helps you understand how long a trading position has been losing ground since its most profitable point. It calculates the time in minutes that has passed since the price reached its highest profit level for a given trading pair. Essentially, it’s a measure of how far the price has fallen from its peak. It's closely related to a "drawdown" - the maximum loss from a peak – and starts at zero when the position first reaches its highest profit. You’ll need to provide the trading pair symbol to use it, and it won’t work if there are no signals available.

## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position is from its most profitable point. It calculates the difference between the highest profit percentage you've achieved and your current profit percentage, ensuring the result is never negative. To use it, simply provide the trading pair symbol, and it will return a number representing that distance as a percentage. It requires signals to be pending to work correctly.

## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your current trading position is from its most profitable point. It calculates the difference between the highest profit achieved so far and the current profit, ensuring the result is always a positive number or zero. Essentially, it tells you how much room you *could* have had for profit if things had gone just a bit differently. To use it, you need to provide the symbol of the trading pair you’re analyzing. It requires that a pending signal already exists for that symbol to work.

## Function getPositionHighestProfitBreakeven

This function helps you determine if a trade could have reached a breakeven point at its peak profit. It specifically checks if achieving breakeven was mathematically possible based on the highest price the trade reached.

If no trading signals are currently active for a particular symbol, the function will raise an error.

You provide the trading pair symbol as input, like "BTCUSDT", and the function will return true if breakeven was possible, or false otherwise.


## Function getPositionHighestPnlPercentage

This function helps you understand the performance of a specific trading pair, like BTC-USD. 

It tells you the highest percentage profit that was ever achieved during the lifetime of a position for that symbol. Think of it as finding the peak of the profit curve for that trade.

To use it, you simply provide the symbol of the trading pair you're interested in.

If there’s no active signal for the symbol, it will flag an error, because there's no position to analyze.


## Function getPositionHighestPnlCost

This function helps you understand the maximum cost incurred while a trading position was open. It calculates the PnL cost, expressed in the quote currency, at the point when the position achieved its highest profit price. Think of it as revealing the most expensive moment for your position’s profit. To use it, you simply provide the symbol (like BTC-USDT) of the trading pair you're interested in. It will return a number representing that cost. If there’s no trading signal for the position, the function won’t work and will raise an error.

## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand how risky a trading position is. It calculates the largest percentage drop a position has experienced from its peak profit to its lowest point. Essentially, it measures how far a position has fallen from its best performance. The result is a percentage, representing the potential loss exposure. It requires a trading symbol to operate and will alert you if no trading signals exist for that symbol.

## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand how much worse your trading position could have gotten. It calculates the difference between your current profit/loss and the lowest point your profit/loss reached during a drawdown. Essentially, it tells you how far your position has fallen from its peak and how much potential loss remains. It requires a trading symbol to work, and it won't work if there's no trading signal active for that symbol. The result represents the PnL cost of that drawdown.

## Function getPositionEstimateMinutes

This function helps you understand how long a trading position is expected to last. It calculates the estimated duration in minutes based on the signal data. Think of it as checking the predicted lifespan of an open trade. 

The value returned represents the `minuteEstimatedTime` set when the signal was created, indicating when the position might expire. 

If there’s no active signal, the function will let you know by throwing an error. You’ll need to provide the trading symbol (like "BTCUSDT") to use it.

## Function getPositionEntryOverlap

getPositionEntryOverlap helps you avoid accidentally placing multiple DCA entries at roughly the same price. It checks if the current price is close enough to any of your existing DCA entry levels, considering a small tolerance range.

Essentially, it prevents you from adding a new DCA entry if the price is already within a defined zone of a previous one. The function returns true if the price falls within that zone, and false if no entry points exist.  You can adjust the acceptable tolerance range using the optional `ladder` parameter to fine-tune how close prices need to be to trigger this check. The symbol of the trading pair is also required as input.

## Function getPositionEntries

This function lets you see the details of how a position was built, especially if you're using a dollar-cost averaging (DCA) strategy. It provides a list of entries, showing the price and cost for each buy order that made up the position.

If you haven't yet created a signal, this function won't work.

If you’ve only made a single purchase for the symbol, it returns a list with just one entry. 

Each entry includes the execution price and the amount spent on that purchase. You'll need to provide the symbol of the trading pair (like BTCUSDT) to get the position entries.


## Function getPositionEffectivePrice

getPositionEffectivePrice lets you find the average price at which a position was acquired, taking into account any DCA (Dollar-Cost Averaging) strategies. It calculates a weighted average, considering the cost of each transaction and the price at which it occurred. 

Think of it as revealing the true entry price, especially helpful when you’ve been buying in gradually. 

If you’ve closed parts of your position, it considers those closures and blends in any subsequent DCA buys. When no DCA is involved, it simply returns the initial opening price.

This function will tell you what price to use if you need to calculate your overall profit or loss for a position. It automatically determines whether it's being used in a backtest or a live trading environment. You provide the trading pair symbol, like "BTCUSDT", to retrieve the price. It will let you know if there isn't a pending signal to calculate the effective price from.

## Function getPositionDrawdownMinutes

getPositionDrawdownMinutes tells you how much time has passed since your position reached its highest profit. Think of it as a measure of how far your position has fallen from its peak. 

The value will be zero when your position first hits its best price. After that, it steadily increases as the price moves away from that peak.

If there's no active trading signal for the specified symbol, the function will let you know by throwing an error. You need to provide the trading pair symbol (like "BTC/USDT") to get this information.

## Function getPositionCountdownMinutes

This function helps you figure out how much time is left before a trading position expires. It calculates this by looking at when the position became pending and comparing it to an estimated expiration time.

The result you get is the number of minutes remaining, but it'll never be a negative number – if the estimated time has already passed, you'll get zero.

If there isn’t a pending signal for the given trading pair, the function will let you know with an error.

You just need to provide the symbol of the trading pair (like BTC-USDT) to use the function.

## Function getPositionActiveMinutes

getPositionActiveMinutes lets you check how long a trading position has been open for a specific trading pair. It returns the time, in minutes, since the position was initially established. If there's no active signal for that position, the function will alert you with an error. To use it, you simply provide the symbol of the trading pair you're interested in, like 'BTCUSDT'.

## Function getPendingSignal

This function lets you check if your trading strategy currently has a pending order waiting to be filled. 

It tells you what the details of that pending order are, if one exists. 

If there isn't a pending order, it will simply tell you that by returning nothing. 

It figures out whether it's running a test or live trading scenario all on its own.

You just need to provide the symbol of the trading pair you're interested in, like "BTCUSDT".


## Function getOrderBook

This function allows you to retrieve the order book for a specific trading pair, like BTCUSDT. It pulls data directly from the registered exchange. 

The function considers the current time when fetching data, which is important whether you're running a backtest or live trading. The exchange itself decides how to handle the time information it receives.

You can specify how many levels of the order book you want to retrieve – the default is a reasonable maximum, but you can request a smaller amount if needed.

## Function getNextCandles

This function helps you grab a batch of future candles for a specific trading pair and time interval. It's designed to get candles *after* the current time being used by your backtest or strategy. You tell it which symbol you're interested in (like "BTCUSDT"), how frequent the candles should be (like "1m" for one-minute candles), and how many candles you want to retrieve. The function then uses the underlying exchange's method to fetch those candles, ensuring you're getting data appropriate for your trading context.

## Function getMode

This function simply tells you whether the backtest-kit is currently running in backtest mode or live trading mode. It returns a promise that will resolve to either "backtest" or "live", letting you know how the system is configured. This is useful if your code needs to behave differently depending on whether it's analyzing historical data or actively managing trades.

## Function getMinutesSinceLatestSignalCreated

This function helps you figure out how long ago the last trading signal was generated for a specific trading pair. It counts the minutes that have passed since that signal appeared, regardless of whether it's still active or has already closed. If you need to implement a waiting period after a stop-loss, this can be very helpful.

It checks your historical data first and then your current, live data to find that last signal. If it can’t find any signals for the given trading pair, it will let you know with an error. The function intelligently determines whether it's operating in backtesting mode or live trading mode based on its environment.

You provide the trading pair's symbol – like "BTCUSDT" – as input to the function.

## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand the risk profile of your trading strategy. It calculates the maximum percentage difference between your highest profit and your largest loss during a backtest.

Think of it as measuring how far your profits fell from their peak.

The function requires a trading symbol, like 'BTC/USDT'.

It will return a number representing this maximum drawdown percentage. If the backtest doesn't have any trading signals, it will alert you with an error.

## Function getMaxDrawdownDistancePnlCost

This function helps you understand the potential risk of a trading strategy by calculating the maximum drawdown. It essentially measures the difference between the highest profit achieved and the lowest loss experienced during a backtest.

The result represents the peak-to-trough distance in terms of profit and loss, showing how far a strategy could fall from its best performance.

To use it, you simply provide the trading symbol you want to analyze. If the backtest doesn't have any trading signals for that symbol, the function will signal an error.

## Function getMCPSchema

The `getMCPSchema` function helps you find the blueprint, or schema, for a specific Model Context Protocol (MCP) within the backtest-kit framework. Think of it like looking up the rules and structure for how data is organized within a particular trading model. You provide the name of the MCP you’re interested in, and it returns the schema that defines it, allowing you to understand its format and what data it contains. This is useful for validating data or building components that interact with a specific MCP.

## Function getLatestSignal

This function helps you retrieve the most recent trading signal for a specific asset. 

It doesn't care if the signal is still active or has already closed – it simply provides the last signal recorded. 

This is handy for things like cooldown periods, allowing you to prevent new trades for a set time after a signal has occurred, regardless of whether it was a winner or loser. 

The function looks for this signal data first in your backtest history and then in live data if needed. If no signal can be found, it will let you know. It also automatically figures out whether it's running a backtest or a live trading session.

You just need to tell it which asset (symbol) you are interested in.

## Function getFrameSchema

The `getFrameSchema` function lets you find the blueprint, or schema, for a particular frame within your backtest. Think of it as looking up the details of how a specific piece of your trading simulation is structured. You give it the name of the frame you're interested in, and it returns a description outlining its properties and how it's organized. This is useful when you need to understand the exact data and structure of a frame within your backtesting setup.

## Function getExchangeSchema

The `getExchangeSchema` function helps you fetch details about a specific cryptocurrency exchange that your backtest kit is using. Think of it as looking up the blueprint for how a particular exchange works – things like how its order book is structured, the symbols it offers, and other essential characteristics. You provide the name of the exchange you’re interested in, and the function returns a structured object containing all the relevant information about that exchange. This is useful when you want to understand the specific mechanics of an exchange within your trading simulations.


## Function getDefaultConfig

This function provides you with a starting point for configuring your backtests. It gives you a set of default values for various settings that control how the backtest kit operates, like how often it checks order status, the maximum number of signals to generate, or how aggressively it fetches historical data. Think of it as a template—you can use these values as-is, or customize them to fine-tune your backtest’s behavior to match your specific testing needs. It's helpful for understanding all the possible adjustments you can make when setting up a backtest.

## Function getDefaultColumns

This function provides a set of pre-configured column definitions, useful for creating markdown reports. It gives you a starting point for customizing the columns displayed in your backtest results, including data related to closed trades, heatmaps, live events, partial fills, breakeven points, performance metrics, risk events, scheduling, strategy events, synchronization, profit records, maximum drawdown, walker signals, and overall strategy results. Think of it as a quick look at all the possible columns you could include and how they're set up by default.

## Function getDate

This function, `getDate()`, simply retrieves the current date. It's useful for understanding what date your trading logic is operating on. When you're running a backtest, it will give you the date associated with the historical timeframe you're analyzing. If you're running live, it provides the actual, real-time date.

## Function getContext

This function lets you access the current environment within a method of your backtest. Think of it as a way to peek at what's happening right now during the trading simulation – things like the current data being processed, the specific strategy being executed, or other relevant details. It provides a snapshot of the method's context, giving you information to work with. The information is wrapped in an object, so you'll need to look at the `IMethodContext` type definition to know exactly what's included. The function returns this information as a promise, so you’ll need to wait for it to resolve.

## Function getConfig

This function lets you peek at the system’s global settings. It provides access to numerous parameters that control how the backtesting framework behaves. Think of it as reading the instruction manual for the backtest kit—you'll find details like how often things are checked, limits on data requests, and flags to enable certain features. The returned configuration is a copy, so you can look at it without risking changing the actual settings.

## Function getColumns

This function lets you see what columns are currently set up for your backtest kit reports. It provides access to various column configurations, including those for closed trades, heatmap data, live market ticks, partial fills, breakeven points, performance metrics, risk events, scheduled tasks, strategy events, synchronization status, highest profit achieved, maximum drawdown, walker profit and loss data, and overall strategy results. Think of it as a way to peek at how your report is structured without changing anything directly. It returns a copy, ensuring that any changes you make won’t affect the original configuration.

## Function getClosePrice

This function helps you quickly grab the closing price from the most recent candle for a specific trading pair and timeframe. You provide the symbol, like "BTCUSDT" for Bitcoin against USDT, and the candle interval – choices like "1m" for one-minute candles or "4h" for four-hour candles. It then returns that closing price as a number, so you can easily use it in your calculations and strategies. Keep in mind this only gives you the very last, completed candle's closing value.


## Function getCandles

This function retrieves historical candlestick data from an exchange you've connected to backtest-kit. 

You can specify the trading pair, like BTCUSDT, the timeframe for the candles (such as 1 minute, 1 hour, or 4 hours), and how many candles you want to retrieve. 

The data is pulled from the past, based on the current time of your backtest.  Essentially, it's using the exchange’s built-in method for fetching candles.

The function returns a promise that resolves to an array of candle data objects.


## Function getBreakeven

This function helps determine if a trade has become profitable enough to cover associated costs. It takes the trading symbol and the current price as input and checks if the price has moved beyond a threshold calculated to account for slippage and fees.  Essentially, it's figuring out if you’ve made enough profit to break even on a trade, considering transaction costs. The function adapts to whether it's being used in a backtesting simulation or in a live trading environment.

## Function getBacktestTimeframe

This function helps you find out the dates used for a backtest of a specific trading pair, like BTCUSDT. It returns an array of dates, representing the timeframe that the backtest covers. Think of it as a way to understand the historical data range being used to test your trading strategy. You simply provide the trading pair symbol and it will give you the corresponding dates.

## Function getAveragePrice

This function helps you find the Volume Weighted Average Price, or VWAP, for a specific trading pair. It looks at the last five minutes of trading data to determine this value, using a calculation that considers both price and trading volume.  If there's no trading volume available, it will just calculate the average closing price instead. You’ll need to provide the trading symbol, like "BTCUSDT," to get the VWAP for that particular pair.

## Function getAggregatedTrades

This function helps you retrieve a history of combined trades for a specific trading pair, like BTCUSDT. It pulls this data from the exchange that's been set up in your backtest-kit environment.

You can request all trades within a certain timeframe, or ask for just a specific number of recent trades. If you don't specify a number, it will fetch trades going back a limited amount of time.  If you provide a limit, it will collect trades backward until it has the requested amount. The `symbol` parameter tells the function which trading pair's data you need.

## Function getActionSchema

To get details about a specific action used in your backtest, you can use `getActionSchema`. This function allows you to look up the schema associated with an action's name.  Essentially, it provides information about the expected inputs and outputs for that action, helping you understand how it functions within the backtest environment. You simply provide the action's unique identifier, and it returns the corresponding schema definition.

## Function formatQuantity

This function helps you display the correct quantity of an asset when trading. It takes a trading symbol, like "BTCUSDT," and a numerical quantity as input. It then applies the specific formatting rules used by the exchange you're trading on, ensuring the quantity is displayed with the right number of decimal places. This avoids confusion and prevents errors when placing orders.

## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a symbol like "BTCUSDT" and a raw price value as input.  It then uses the specific formatting rules for that exchange to make sure the price is displayed with the right number of decimal places.  Essentially, it ensures your prices look accurate and consistent, regardless of the underlying exchange.


## Function dumpText

The `dumpText` function lets you record raw text data associated with a specific signal. Think of it as a way to log information related to a trading decision or event. It automatically handles the signal you're referencing and adjusts its behavior based on whether you're running a backtest or a live trading environment.  You'll provide details like the bucket name, a unique identifier for the dump, the actual text content, and a description to help understand what the text represents. This function is designed to be straightforward for capturing textual data without needing to worry about signal management or environment-specific configurations.

## Function dumpTable

This function helps you display data in a structured table format, specifically useful for examining results within a trading backtest or live trading environment. It takes an array of objects, which you provide, and formats them neatly as a table. The table will be associated with the signal currently being processed, and it intelligently adapts to whether you're running a backtest or a live trade. The column headers are automatically determined based on all the different fields present in your data, so you don't need to define them manually.


## Function dumpRecord

The `dumpRecord` function lets you save a piece of data, like a snapshot of information, related to a specific trading activity. Think of it as creating a labeled record tied to a particular signal. 

It's designed to be simple: you provide the name of the data storage "bucket," a unique identifier for the dump, the actual data you want to save (as a flexible collection of key-value pairs), and a short explanation of what the data represents. 

The function cleverly figures out whether you're running a simulation ("backtest") or a real-time trading scenario automatically, streamlining the process. It also automatically identifies the relevant signal it's associated with, making it easy to keep track of data across your trading operations.


## Function dumpMCPStatus

This function helps you create a snapshot of your Model Context Protocol (MCP) status, essentially a detailed record of what's happening in your trading system. It’s like taking a picture of the system's state at a specific moment, linked to a particular trading signal.

It figures out which signal it's associated with, and whether you're in a backtest or live trading environment, all on its own.

By default, it creates a nicely formatted markdown file containing the MCP data. Text messages are displayed directly in the file, while any images are saved as separate PNG files, and linked within the markdown.

You can also choose to silence this snapshot creation or create a simpler, text-only version for easier searching. 

The function takes a data transfer object (`dto`) that contains the bucket name, a unique dump ID, the actual MCP messages, and a descriptive text for the snapshot.


## Function dumpJson

The `dumpJson` function lets you record complex data structures as JSON, associating them with a specific bucket and ID for later analysis. Think of it as a way to save snapshots of your trading logic's state, like variables or calculations, during a backtest or live trading session. It intelligently handles the environment – whether you're running tests or live trades – so you don't have to worry about those details. 

You provide the data as a JavaScript object, along with a bucket name, a unique ID for the dump, a descriptive label, and the function takes care of the rest, essentially saving a formatted JSON block tied to the signal it was generated from.


## Function dumpError

The `dumpError` function helps you record detailed error information related to a specific trading signal. Think of it as a way to create a log entry that's easily traceable back to the signal that triggered it. It automatically figures out if you're running a backtest or a live trading session, and it handles resolving any pending or scheduled signals.  You provide the function with a data object containing the bucket name, a unique dump ID, the actual error message, and a short description, and it takes care of the rest, ensuring the error is properly recorded within the system.


## Function dumpAgentAnswer

This function lets you save a complete record of an agent's conversation, including all the messages exchanged. It's like creating a detailed log of the interaction. 

The function figures out which signal the conversation is related to, whether it's part of a backtest or a live trading session, without you needing to specify it.

You provide the function with information like the bucket name for storage, a unique identifier for the dump, the actual messages from the conversation, and a description to help identify the dump later. This is helpful for debugging, analysis, or auditing purposes.


## Function createSignalState

This function helps you manage and track the state of your trading signals, especially useful when building strategies that react to market conditions over time. It creates a pair of functions – one to get the current state and another to update it – that are automatically linked to the environment your code is running in (whether it's a backtest or a live trade). 

You don't have to manually specify signal IDs; it figures that out for you. 

It's particularly designed for complex strategies, like those using AI to analyze trade data, where you need to gather information and metrics over many trades, like how long a trade is open or its percentage gain. It can handle trades that have both profitable and less profitable outcomes, and even strategies that exit trades based on factors like time and profit thresholds.


## Function commitTrailingTakeCost

This function lets you set a specific take-profit price for a trade. It's a simple way to move your take-profit to a fixed price level, regardless of where the price currently is.

Behind the scenes, it figures out how to adjust the percentage-based take-profit, using the original distance from the entry price as a reference.

The framework handles the details of determining the environment (backtest or live trading) and getting the current market price to make this adjustment.

You just need to provide the trading pair symbol and the take-profit price you want.


## Function commitTrailingTake

This function helps you fine-tune your take-profit levels for open trades.

It adjusts the distance of your take-profit order based on a percentage shift applied to the original take-profit level you set when the trade was initially placed. This is important because it prevents small errors from building up over time, keeping your strategy consistent.

Think of it as a way to automatically tighten or widen your take-profit based on market movements – but it *always* calculates from the initial take-profit you set.

If you want to make your take-profit more conservative (closer to the entry price), use a negative percentage shift.  To be more aggressive and move it further away, use a positive percentage.

The function prioritizes safety: it will only adjust your take-profit to a more conservative level—meaning closer to your entry price for longs, and further away for shorts.  So, if you’re already a bit conservative, a further conservative adjustment won't be made.

It handles whether it's running in a backtest or live trading environment automatically.

You’ll need to provide the trading pair (like "BTCUSDT"), the percentage shift you want to apply, and the current market price to make the calculation.

## Function commitTrailingStopCost

This function lets you change the trailing stop-loss to a specific price. It's a simple way to set your stop-loss at a fixed level, referencing the original distance from the entry price. 

The system handles the details of calculating the necessary percentage shift and fetching the current market price to ensure the adjustment is accurate. 

It works seamlessly whether you're running a backtest or a live trade, taking care of the environment automatically.

You just need to provide the trading symbol and the new stop-loss price you want to set.


## Function commitTrailingStop

The `commitTrailingStop` function lets you refine your trailing stop-loss orders. Think of it as a way to dynamically adjust how far your stop-loss is from your entry price.

It's important to note that it always calculates changes based on the initial stop-loss distance you set, not any adjustments that have already been made. This ensures accuracy.

You use a percentage to control how the stop-loss changes. A negative percentage brings your stop-loss closer to your entry price, while a positive percentage moves it further away.

The function is smart about how it updates your stop-loss. It will only adjust if the new stop-loss provides even greater protection for your profits, meaning it's safer.  For long positions, it only allows the stop-loss to move upwards, and for short positions, it only allows it to move downwards.

It automatically figures out whether you're running a backtest or a live trading session.

You'll need to provide the trading symbol, the percentage change you want to apply, and the current price of the asset.

## Function commitSignalNotify

This function lets you send out informational messages related to your trading strategy. Think of it as a way to leave notes for yourself or others about what's happening during a trade, without actually changing any positions. It's perfect for things like flagging when a specific indicator hits a certain level or recording unusual market activity.

The function automatically pulls in important context like the trading symbol, the strategy name, the exchange, and the current timeframe, so you don't have to pass those in yourself. It also gets the current price for you.

You can add extra details to your notification using the `payload` parameter, allowing you to provide more context for the message.

## Function commitPartialProfitCost

This function helps you automatically close a portion of your trading position when you've reached a specific profit level, measured in dollars. It's a shortcut that calculates the percentage of your position to close based on the dollar amount you provide. 

Essentially, it simplifies the process of taking partial profits. 

The function determines whether it's running in a backtesting environment or a live trading environment on its own. It also automatically finds the current market price to determine if the price is moving in a profitable direction before executing.

To use it, you simply specify the trading symbol and the dollar amount you want to profit from. For example, `commitPartialProfitCost("BTCUSDT", 150)` would close a portion of your BTCUSDT position to realize $150 in profit.

## Function commitPartialProfit

The `commitPartialProfit` function lets you automatically close a portion of your open trade when the price moves in a profitable direction, essentially inching you closer to your take profit target. It's designed to help you lock in some gains as the trade progresses. You specify which symbol you're trading and the percentage of the position you want to close – for example, closing 25% of the trade. The function handles whether it's being used in a backtesting or live trading environment, so you don’t need to worry about that. It's important to remember the price needs to be heading towards your take profit level for this function to work.


## Function commitPartialLossCost

This function helps you partially close a trade when you're experiencing losses, aiming to reduce the overall risk. It's designed to close a portion of your position based on a specific dollar amount you define.

Essentially, it simplifies the process of partial closing by automatically calculating the percentage of your position needed to cover the specified dollar amount.

It's important that the price movement aligns with your stop-loss direction for this function to work as intended.

The framework handles whether you're in a backtest or live trading environment and retrieves the current price automatically, making it easy to use. You just need to provide the symbol of the trading pair and the dollar amount you want to use to close a portion of the position.

## Function commitPartialLoss

This function lets you close a portion of an open trade when the price is moving in a losing direction, essentially moving towards your stop-loss. 

It allows you to automatically reduce your exposure by closing a specific percentage of your position. 

You tell it which trading pair you want to affect and what percentage of the position you want to close, like 25% or 75%.

The function handles whether it's being run in a backtest or a live trading environment without you needing to specify.


## Function commitCreateTakeProfit

This function lets you tell the system that a take-profit order for a position has been filled on the exchange, even if it bypassed the usual VWAP-based check. It's important because sometimes orders fill at prices different from what the framework initially predicted, like when they're triggered by a candle's high or low. 

Think of it as a way to synchronize the framework with what's actually happening on the exchange. It essentially confirms that the position has been closed with a take-profit.

This function doesn't do anything if there's no pending order associated with the symbol. It also automatically recognizes whether you're running a backtest or a live trading session. You can optionally add information, like an ID or a note, to the commit when you call this function.


## Function commitCreateStopLoss

This function tells the backtest kit that a stop-loss order you previously set up has been filled on the exchange. This is important because sometimes the exchange fills your order at a price slightly different than what the backtest kit initially calculated.

It’s used to inform the framework that a position closed due to a stop-loss, even if it bypassed the usual closed-candle check. The system recognizes this as a real event, marking the close with a "stop_loss" reason.

The function will only do something if there's a pending position already in place; otherwise, it's ignored. The backtest kit automatically figures out whether it's running a backtest or a live trading session.

You can also add extra information like an ID or note to the function call using the optional `payload` parameter. This helps with tracking and analysis.

## Function commitCreateSignal

This function lets you manually send trading signals into the backtest or live trading environment. Think of it as a way to inject your own custom signals instead of relying on the standard signal retrieval process.

When you use it, the system checks if a signal or action is already happening.  If so, the function won't work and will give you an error.

The signal’s price action is determined by whether you provide a `priceOpen` value.  If you don’t specify a price, the signal executes right away at the current market price. If you *do* specify a price, the system tries to execute it immediately. If the specified price has already been reached, it executes immediately; otherwise, it waits for that price to be reached before executing.

The function also figures out whether you are running a backtest or a live trading session, adapting its behavior accordingly. 

You need to give it the trading symbol and the signal data (`dto`) to use it.

## Function commitClosePending

This function lets you cancel a pending trade signal without interrupting your strategy's overall operation. It’s useful when you want to manually override a previously generated signal but still keep the strategy running and generating new signals. Think of it as a way to say, "No, don't execute that trade," but the system remains active and ready for future opportunities. It's designed to work seamlessly in both backtesting and live trading environments, handling the environment detection automatically. You can also include details like an ID or a note along with the cancellation for better record-keeping.

## Function commitCancelScheduled

This function lets you cancel a scheduled trading signal within your backtest or live strategy. Think of it as a way to pause a planned trade without interrupting the overall strategy. It clears the signal that was waiting to be activated by the next price open, but won't impact any existing trades or stop your strategy from generating new signals. You can optionally add a note to the cancellation for record-keeping purposes. The function intelligently adapts to whether it's running in a backtest or live environment.

## Function commitBreakeven

This function helps automate risk management during a trade. It shifts your stop-loss order to the original entry price once the price has moved favorably enough to cover transaction costs and a small buffer. This essentially turns your position into a risk-free one. The function handles the complexities of determining the appropriate price threshold for this adjustment, taking into account slippage and fees, and works whether you're backtesting strategies or running live trades. It also automatically gets the necessary price data to perform the calculation. You just need to provide the trading pair symbol.

## Function commitAverageBuy

The `commitAverageBuy` function lets you add a new buy order to your existing trading strategy, specifically when using a dollar-cost averaging (DCA) approach. It essentially records a purchase at the current market price and incorporates it into the overall history of your position. This helps to track the average price you've paid for the asset and adjust related calculations like the effective entry price. The function handles retrieving the latest price data and automatically adapts to whether you're running a backtest or a live trade. You can optionally provide a cost parameter.

## Function commitActivateScheduled

This function lets you trigger a scheduled trading signal before the price actually hits the target level you initially set. It essentially sets a flag that the strategy will pick up on the next market update, causing the scheduled action to occur. You can optionally include details like a transaction ID or a note along with this early activation. The system automatically figures out whether it's running a backtest or live trading.


## Function checkCandles

The `checkCandles` function is designed to quickly verify if your historical price data (candles) are already available and properly stored. It efficiently checks your data cache without needing to load the entire dataset. The function uses the persistence adapter to see if the expected candles exist for specific timestamps. If even one candle is missing or out of place, the function will report that the data isn't fully present, saving you time and resources. This function takes validation parameters to define what it should look for.


## Function cacheCandles

This function makes sure your historical price data (candles) exists in your persistent storage. It's designed to efficiently retrieve or create the data you need for backtesting. It works in two steps: first, it verifies if the data already exists, and if not, it downloads the missing data and checks again to ensure it’s complete. You can also provide callbacks to track the progress of the initial check and the warm-up (data retrieval) phase. It handles specifying the symbol, time interval, start and end dates, and the exchange name to identify the data.

## Function addWalkerSchema

This function lets you register a new "walker," which is a tool for comparing the performance of different trading strategies against each other. Essentially, a walker runs multiple backtests – tests of how a strategy would have performed in the past – all using the same historical market data. It then analyzes the results and measures how well each strategy did, according to a chosen performance metric. You provide a configuration object to tell the system *how* to run and evaluate this comparison.

## Function addSweepSchema

This function lets you define and register a sweep, which is a way to systematically test and evaluate different trading strategies. Imagine you have a set of trading ideas and want to explore how they perform with various parameter settings – that's what a sweep does. 

It essentially runs each idea once, simulating trading across a range of parameters. The framework then analyzes the results to see how different settings impact performance. You can optionally specify the parameters to test, or let the system use default settings. This allows for a comprehensive exploration of your trading strategies without needing to manually run each variation.

## Function addStrategySchema

This function lets you register your trading strategy with the backtest-kit framework. Think of it as telling the system about your strategy so it can manage and protect it. Once registered, the framework will automatically check your strategy's signals to make sure they're valid and consistent, preventing errors like incorrect prices or timing issues.  It also helps avoid signal overload and offers crash-safe storage when running live. You provide a configuration object defining your strategy, and the framework handles the rest.


## Function addSizingSchema

This function lets you tell the backtest kit how to determine the size of your trades. Think of it as setting up the rules for how much capital you'll allocate to each trade based on various factors. You provide a sizing schema, which is a set of instructions that specifies things like whether you want to use a fixed percentage of your capital, a Kelly Criterion approach, or something based on Average True Range (ATR). The schema also includes details about risk tolerance, position limits, and callbacks for calculations to customize the sizing process further. By registering this schema, you're essentially instructing the backtest kit on how to manage your position sizes throughout the backtesting process.


## Function addRiskSchema

This function lets you define and register how your trading system manages risk. Think of it as setting up guardrails for your strategies to prevent excessive exposure or unsafe trading practices.

You'll specify limits like the maximum number of positions your strategies can hold at once, and you can implement more complex checks based on things like portfolio balance or correlations. It also provides a way to react when a trading signal doesn't meet your risk criteria.

Crucially, these risk settings apply across all your strategies, allowing for a holistic view and preventing unintended interactions. The framework keeps track of all open positions so it can accurately assess risk and enforce your rules.

## Function addMCPSchema

This function allows you to connect your trading strategy to an MCP (Model Context Protocol) agent, essentially creating a live link for the agent to observe and interact with your strategy's trades. It registers the strategy's status and allows the agent to send commands related to positions. The MCP will provide portfolio information to the agent, and if you don't specify a custom renderer, it will default to a simple text message format for each traded symbol. You provide the MCP configuration details as an object when you call this function.

## Function addFrameSchema

This function lets you tell the backtest-kit how to create the timeframes it will use for backtesting. Think of it as defining the rules for generating the historical data the system will trade against. You provide a configuration object that specifies the start and end dates of your backtest, the time interval (like 1-minute, 1-hour, or daily), and a function to handle any events related to timeframe generation. Essentially, you’re registering a custom timeframe generator with the framework.


## Function addExchangeSchema

This function lets you tell the backtest-kit about a new exchange you want to use for your backtesting. Think of it as registering a data source so the framework knows where to get historical price data and how to format it.  You'll provide details about the exchange, including how it delivers candle data and how to properly display price and quantity information.  The framework then uses this information to build your backtest and perform calculations like VWAP based on recent trade data.


## Function addActionSchema

This function lets you register a new action handler within the backtest-kit framework. Think of actions as a way to react to specific events happening during your backtest – like when a trade hits a profit target, or a new signal is generated. 

They allow you to connect your backtest to external systems. You could use them to update a state management library like Redux, send notifications via Telegram or Discord, log events, or even trigger custom business logic.

Essentially, each action gets its own instance tied to a particular strategy and timeframe, so it receives all the relevant data from that execution. You provide a configuration object – the `actionSchema` – to tell the framework how to handle these events.
